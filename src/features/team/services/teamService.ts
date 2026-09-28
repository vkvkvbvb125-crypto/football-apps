import { supabase } from '../../../lib/supabase';
import { UserFacingError } from '../../../lib/dbError';

/*
  현재 멤버의 **유일한** 정의.

  ── 왜 상수인가 ────────────────────────────────────────────────────
  `team_members`에는 나간 사람의 행이 `left_at`을 달고 **남아 있다**. 행을 지우지 않는
  이유는 settlement_shares·attendance_votes·team_assignments·poll_responses·waitlist가
  team_member_id를 **ON DELETE CASCADE**로 물고 있어서다 — 지우면 그 사람의 정산 몫과
  참석 기록이 함께 사라진다(2026-09-18 스키마 확인).

  그래서 조회는 **전부** 이 뷰를 탄다. `left_at is null`을 부르는 쪽마다 적는 방식은
  **빠뜨린다** — 빠뜨린 화면에만 탈퇴자가 남고, 그건 화면을 봐야만 보인다.
  뷰는 DB에 정의가 하나뿐이라 빠뜨릴 자리가 없다.

  ⚠ **쓰기에는 못 쓴다.** 뷰가 `security_invoker=true`라 UPDATE/DELETE는 테이블로
    직접 가야 하고, 그쪽은 총무 정책(team_members_update_admin / _delete_admin)이 막는다.
    나가기는 테이블을 건드리지 않고 `leave_team()` RPC가 한다.

  ⚠ `from('team_members')`로 직접 조회하면 `memberview.check`가 FAIL을 낸다.
*/
export const ACTIVE_MEMBERS = 'team_members_active';

/*
  내보낸 멤버만 보는 뷰. 총무가 되돌리는 화면이 쓴다.

  ⚠ **이 뷰는 총무만 읽게 막지 않는다.** security_invoker라 `team_members_select`
    (`is_team_member`)가 그대로 걸리고, 그건 「그 팀의 현재 멤버면 읽는다」다 —
    **팀원도 읽을 수 있다.** 총무 전용은 **화면이 가른다**(MemberListModal).
    뷰가 막아준다고 오해하지 마라.
*/
export const REMOVED_MEMBERS = 'team_members_removed';
import type { Database } from '../../../types/database';

type TeamMemberRow = Database['public']['Tables']['team_members']['Row'];
type TeamRow = Database['public']['Tables']['teams']['Row'];

export interface TeamMembership {
  membershipId: string;
  role: TeamMemberRow['role'];
  team: TeamRow;
}

/**
 * 내가 속한 팀들.
 *
 * ⚠ **user_id로 좁히지 않으면 팀원 전원이 「내 소속」으로 들어온다.**
 *   RLS(team_members_select)가 `is_team_member(team_id)`라 **팀 단위**로 열려 있어서,
 *   조건 없이 select하면 내가 속한 팀의 **모든 멤버 행**이 돌아온다.
 *   「내 것」은 RLS가 아니라 앱이 좁혀야 한다.
 *
 *   혼자인 팀에서는 1개라 정상으로 보이고, **팀원이 늘면서 조용히 깨진다.**
 *   실제로 6명 팀에서 memberships가 6이었다(2026-09-15 실측: db는 1, 스토어는 6).
 *   그러면 hasMultipleTeams가 켜지고, activeTeam이 **남의 행**으로 잡힐 수 있다 —
 *   membershipId가 남의 것이면 role이 뒤집히고(총무↔팀원), 정산 「내 몫」·미납·
 *   독촉 대상이 전부 남의 값이 된다. 화면에 오류가 없어서 아무도 못 알아챈다.
 *
 * ⚠ userId를 **인자로 받는다.** 이 저장소의 서비스는 스토어를 직접 보지 않는다 —
 *   fetchMyReadAnnouncementIds·fetchNotifications가 같은 모양이다.
 */
export async function fetchMyMemberships(
  userId: string,
  /*
    ⚠ **시한은 스토어가 정하고 여기는 그 신호만 받는다.**

    「몇 초가 적당한가」는 화면 사정이라 서비스가 알 일이 아니다. 서비스는 **끊을 수단**만
    제공하고, 언제 끊을지는 부르는 쪽이 정한다 — userId를 인자로 받는 것과 같은 이유다.

    ⚠ **요청이 둘이라 신호 하나를 둘 다에 건다.** 순차라서 ①에서 매달리면 ②는 시작도
      못 하고, ②에서 매달려도 전체가 안 끝난다. 하나만 걸면 반쪽이 된다.
  */
  signal?: AbortSignal
): Promise<TeamMembership[]> {
  let q = supabase
    .from(ACTIVE_MEMBERS)
    .select('*')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });
  if (signal) q = q.abortSignal(signal);
  const { data: memberships, error } = await q;
  if (error) throw error;
  if (!memberships || memberships.length === 0) return [];

  const teamIds = memberships.map((m) => m.team_id);
  let tq = supabase.from('teams').select('*').in('id', teamIds);
  if (signal) tq = tq.abortSignal(signal);
  const { data: teams, error: teamsError } = await tq;
  if (teamsError) throw teamsError;

  const teamsById = new Map((teams ?? []).map((t) => [t.id, t]));
  return memberships
    .map((m) => {
      const team = teamsById.get(m.team_id);
      if (!team) return null;
      return { membershipId: m.id, role: m.role, team };
    })
    .filter((m): m is TeamMembership => m !== null);
}

export async function createTeam(name: string) {
  const { data, error } = await supabase.rpc('create_team', { p_name: name });
  if (error) throw error;
  return data;
}

export async function joinTeamByInvite(inviteCode: string) {
  const { data, error } = await supabase.rpc('join_team_by_invite', { p_invite_code: inviteCode });
  /*
    ⚠ **서버가 영어 개발자 문구를 던진다.** `join_team_by_invite`의
      `raise exception 'invalid invite code'`는 P0001이라, 그대로 두면
      `toUserMessage`가 기본 문구(「문제가 생겼어요. 잠시 후 다시 시도해주세요」)로
      덮는다 — **사용자는 코드가 틀렸다는 것을 모르고**, 영원히 안 될 일을
      다시 시도하라는 말을 듣는다.

    ⚠ **P0001을 `dbError`에서 통째로 열면 안 된다**(`leaveTeam` 머리말 참고).
      그래서 여기서만 연다. 다만 **문구가 영어인지 보고 가른다** —
      서버가 한국어로 쓴 P0001은 사용자에게 보여주려고 쓴 것이라 그대로 통과시키고,
      ASCII만 있는 것은 개발자 문구라 사람이 읽을 말로 바꾼다.
      SQL 문구가 나중에 바뀌어도 이 규칙은 성립한다.
  */
  if (error) {
    if ((error as { code?: string }).code === 'P0001') {
      const developerText = !/[가-힣]/.test(error.message);
      throw new UserFacingError(
        developerText ? '초대 코드가 맞지 않아요. 다시 확인해주세요' : error.message
      );
    }
    throw error;
  }
  return data;
}

export interface TeamMemberWithProfile {
  id: string;
  userId: string;
  role: TeamMemberRow['role'];
  skillTag: TeamMemberRow['skill_tag'];
  /** 선호 포지션 — 팀 분배 포메이션이 이 값을 쓴다 */
  position: string | null;
  /** 팀 안에서만 유일한 등번호 (0~999). 안 정했으면 null */
  jerseyNumber: number | null;
  /** 가입 시각(ISO) — 참석률 분모를 「그 경기 시점의 멤버 수」로 잡는 데 쓴다 */
  joinedAt: string | null;
  /** 알림 설정 — 이 팀에서 받을 알림 종류 */
  /* 알림 설정 넷 — 종류 여덟을 넷으로 묶는다. 20260830_notify_prefs_v2.sql 참조 */
  notifyMatch: boolean;
  notifyAnnouncement: boolean;
  notifyBoard: boolean;
  notifySettlement: boolean;
  displayName: string;
  avatarUrl: string | null;
  phone: string | null;
  dominantFoot: string | null;
}

/* 이름만 받는다 — 주소·좌표는 아무 데서도 안 읽어서 통로를 좁혔다.
   타입에 남겨 두면 부르는 쪽이 계속 실어 보내고, 다음 사람이 「저장되는구나」로 읽는다 */
export interface TeamHomeLocation {
  placeName: string;
}

/** 팀 슬로건 — 헤더에 한 줄로 보인다. 비우면 null로 저장해 자리 자체를 없앤다 */
export async function updateTeamSlogan(teamId: string, slogan: string | null) {
  const { error } = await supabase.from('teams').update({ slogan }).eq('id', teamId);
  if (error) throw error;
}

/**
 * 팀 프로필 — 활동 지역 · 평균 인원 · 실력.
 *
 * 정기 요일·시간은 여기 없다. team_settings.default_weekdays/default_time이 이미
 * 그 값이고 배열이라 「매주 화·목」을 표현할 수 있다. teams에 단일 int로 또 두면
 * 같은 뜻의 저장소가 둘이 되고 총무가 두 곳에 같은 걸 입력하게 된다.
 *
 * 전부 optional이다 — 보낸 칸만 UPDATE에 실린다. 세 필드가 각자 즉시 저장되는데
 * 매번 여섯 칸을 다 보내면, 화면이 들고 있는 낡은 값이 남의 최신 값을 덮는다.
 * team_settings에서 계좌가 그렇게 지워졌다.
 */
export interface TeamProfileInput {
  regionCode?: string | null;
  regionLabel?: string | null;
  avgHeadcount?: number | null;
  skillLevel?: 'beginner' | 'intermediate' | 'advanced' | null;
}

const PROFILE_COLUMN: Record<keyof TeamProfileInput, string> = {
  regionCode: 'region_code',
  regionLabel: 'region_label',
  avgHeadcount: 'avg_headcount',
  skillLevel: 'skill_level',
};

export async function updateTeamProfile(teamId: string, p: TeamProfileInput) {
  const patch: Database['public']['Tables']['teams']['Update'] = {};
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[PROFILE_COLUMN[key as keyof TeamProfileInput]] = value;
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from('teams').update(patch).eq('id', teamId);
  if (error) throw error;
}

/*
  팀 대표 지역 — 이름만 저장한다.

  주소·좌표도 같이 넣고 있었는데 **읽는 곳이 하나도 없다.** 화면에 뜨는 것은
  home_place_name뿐이다(히어로의 「구장 · 풋살」 줄, 팀 설정의 대표 지역 카드).
  주소·좌표를 쓰는 계산도, 지도도, 거리도 없다.

  카카오 로컬 API 응답에서 온 값이라 저장 자체가 약관 확인 대상이기도 한데,
  **이건 답변과 무관하게 정리 대상이다** — 쓰지도 않으면서 저장만 하고 있었다.

  ⚠ 컬럼은 안 지웠다. 쓰기만 멈춘다 — 카카오 답이 「기존 데이터도 지워라」로 오면
    그때 drop한다. 이름(home_place_name)은 남긴다: 화면이 그걸 그린다.
*/
export async function updateTeamHomeLocation(teamId: string, location: TeamHomeLocation) {
  const { error } = await supabase
    .from('teams')
    .update({ home_place_name: location.placeName })
    .eq('id', teamId);
  if (error) throw error;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberWithProfile[]> {
  const { data: members, error } = await supabase.from(ACTIVE_MEMBERS).select('*').eq('team_id', teamId);
  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', userIds);
  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return members.map((m) => {
    const profile = profilesById.get(m.user_id);
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role,
      skillTag: m.skill_tag,
      position: m.position ?? null,
      jerseyNumber: m.jersey_number ?? null,
      joinedAt: m.joined_at ?? null,
      notifyMatch: m.notify_match ?? true,
      notifyAnnouncement: m.notify_announcement ?? true,
      notifyBoard: m.notify_board ?? true,
      notifySettlement: m.notify_settlement ?? true,
      displayName: profile?.display_name ?? '멤버',
      avatarUrl: profile?.avatar_url ?? null,
      phone: profile?.phone ?? null,
      dominantFoot: profile?.dominant_foot ?? null,
    };
  });
}

/** 내보낸 멤버 한 사람 — 되돌리기 목록에 필요한 것만 담는다 */
export interface RemovedMember {
  /** team_members.id — restore_member에 넘기는 값 */
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** 내보낸 시각(ISO) */
  removedAt: string;
}

/**
 * 내보낸 멤버 목록. **총무 화면에서만 부른다**(위 REMOVED_MEMBERS 머리말 참고 —
 * 막는 것은 뷰가 아니라 화면이다).
 */
export async function fetchRemovedMembers(teamId: string): Promise<RemovedMember[]> {
  const { data: rows, error } = await supabase
    .from(REMOVED_MEMBERS)
    .select('*')
    .eq('team_id', teamId)
    .order('removed_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', rows.map((r) => r.user_id));
  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    /* 이름의 대체 표시는 앱 전체가 「멤버」다 — 여기만 다르면 한 사람이 두 이름이 된다 */
    displayName: byId.get(r.user_id)?.display_name ?? '멤버',
    avatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
    removedAt: r.removed_at,
  }));
}

/**
 * 강퇴 되돌리기. **표식만 지우고 팀에 되돌리지는 않는다** — 본인이 초대 코드로 들어온다.
 *
 * ⚠ 그래서 **되돌린 뒤에는 현재 초대 코드를 알려줘야 한다.** 총무가 코드를 재발급했으면
 *   그 사람이 들고 있는 옛 코드는 죽어 있어서, 되돌려 놓고도 「왜 못 들어오지」가 된다.
 *   화면(MemberListModal)이 되돌린 자리에서 바로 코드를 보여주고 공유하게 한다.
 */
export async function restoreMember(teamMemberId: string) {
  const { data, error } = await supabase.rpc('restore_member', { p_team_member_id: teamMemberId });
  /* `leaveTeam`·`removeMember`와 같은 변환 — 서버가 한국어로 쓴 P0001만 연다 */
  if (error) {
    throw (error as { code?: string }).code === 'P0001'
      ? new UserFacingError(error.message)
      : error;
  }
  return data;
}

/**
 * 초대 코드 재발급. 새 코드를 돌려준다.
 *
 * ⚠ **지금까지 뿌린 코드와 링크가 전부 죽는다** — 아직 안 들어온 정상 초대자까지다.
 *   재참여 차단은 `removed_at`이 하므로 이건 필수가 아니다. 쓰는 자리는
 *   **강퇴당한 사람이 다른 계정으로 들어올 때**다.
 */
export async function rotateInviteCode(teamId: string) {
  const { data, error } = await supabase.rpc('rotate_invite_code', { p_team_id: teamId });
  if (error) {
    throw (error as { code?: string }).code === 'P0001'
      ? new UserFacingError(error.message)
      : error;
  }
  return data as string;
}

export async function updateMemberSkillTag(teamMemberId: string, skillTag: TeamMemberRow['skill_tag']) {
  const { error } = await supabase.from('team_members').update({ skill_tag: skillTag }).eq('id', teamMemberId);
  if (error) throw error;
}

/** 선호 포지션 — team_members.position(text). 값은 features/team/positions.ts가 정한다 */
export async function updateMemberPosition(teamMemberId: string, position: string | null) {
  const { error } = await supabase.from('team_members').update({ position }).eq('id', teamMemberId);
  if (error) throw error;
}

/** 등번호 — 팀 안에서 중복되면 DB 유니크 인덱스가 막는다 */
export async function updateMemberJersey(teamMemberId: string, jerseyNumber: number | null) {
  const { error } = await supabase.from('team_members').update({ jersey_number: jerseyNumber }).eq('id', teamMemberId);
  if (error) throw error;
}

/**
 * 알림 설정 한 항목 켜기/끄기.
 *
 * 컬럼 이름을 string으로 받으면 오타가 그대로 나가 조용히 실패한다 —
 * 실제 컬럼 셋으로 좁혀 컴파일 때 걸리게 한다.
 */
export type NotifyPrefColumn =
  | 'notify_match'
  | 'notify_announcement'
  | 'notify_board'
  | 'notify_settlement';

export async function updateNotifyPref(teamMemberId: string, column: NotifyPrefColumn, value: boolean) {
  const { error } = await supabase
    .from('team_members')
    .update({ [column]: value } as Record<NotifyPrefColumn, boolean>)
    .eq('id', teamMemberId);
  if (error) throw error;
}

export async function updateMemberRole(teamMemberId: string, role: TeamMemberRow['role']) {
  const { error } = await supabase.from('team_members').update({ role }).eq('id', teamMemberId);
  if (error) throw error;
}

/**
 * 팀 나가기.
 *
 * ⚠ **DELETE로 하면 조용히 실패한다.** `team_members_delete_admin`이
 *   `is_team_admin(team_id)`뿐이라 **본인 탈퇴 정책이 없다.** RLS에 막힌 DELETE를
 *   PostgREST는 「조건에 맞는 행이 없었다」와 똑같이 취급한다 — **200에 0행, 오류 없음**이다.
 *   2026-09-18에 실측했다: 본인은 `[]`, 총무는 그 행이 그대로 돌아왔다.
 *   그래서 `removeMember`를 쓰던 예전 경로는 **화면만 나간 척**하고 다음 조회에서
 *   팀이 되살아났다(오류 문구 없이 홈으로 돌아갔다).
 *
 * 지금은 RPC 하나가 규칙까지 들고 있다:
 *   혼자면 팀 해체 · 마지막 총무면 거절 · 그 외에는 left_at을 찍는다(소프트 삭제).
 * 거절은 **예외로 온다**(P0001) — `error`가 실제로 채워지므로 조용히 지나갈 수 없다.
 */
export async function leaveTeam(teamId: string) {
  const { data, error } = await supabase.rpc('leave_team', { p_team_id: teamId });
  /*
    ⚠ **서버가 쓴 사람 말을 여기서 UserFacingError로 바꿔 준다.**

    `toUserMessage`는 클라이언트의 `UserFacingError`만 통과시킨다. 이 문구는 이제
    **서버에서** 온다 — `leave_team()`이 `raise exception ... using errcode='P0001'`로
    「마지막 총무는 팀을 나갈 수 없어요」를 던진다. 그대로 두면 code로 가르는 switch가
    default로 떨어뜨려 **「문제가 생겼어요. 잠시 후 다시 시도해주세요」**가 뜬다 —
    영원히 안 되는 일을 다시 시도하라고 말하는 셈이다. 2026-09-18에 기기에서 봤다.

    ⚠ **P0001을 toUserMessage에서 통째로 통과시키면 안 된다.** P0001은 plpgsql의
      `raise exception` 기본값이라 `join_team_by_invite`의 `'invalid invite code'`
      (영어 개발자 문구)도 같은 코드로 온다. 그래서 **이 호출에서만** 연다 —
      여기서 나오는 P0001은 둘 뿐이고 둘 다 사람에게 보여주려고 쓴 한국어다
      (「마지막 총무는…」·「이 팀의 멤버가 아니에요」).
  */
  if (error) {
    throw (error as { code?: string }).code === 'P0001'
      ? new UserFacingError(error.message)
      : error;
  }
  return data;
}

/*
  총무의 강퇴. 본인 탈퇴는 `leaveTeam`을 쓴다.

  ── 왜 RPC인가 ────────────────────────────────────────────────────
  ⚠ **전에는 `from('team_members').delete()`였다.** 그런데 `settlement_shares`·
    `attendance_votes`·`team_assignments`·`poll_responses`·`waitlist`가
    `team_member_id`를 `ON DELETE CASCADE`로 문다 — **강퇴 한 번에 그 사람의
    미납 회비와 참석 기록이 통째로 사라졌다.** 나가기는 2026-09-18에 소프트
    삭제로 바꿨는데 이 경로만 남아 있었다.

  이제 `remove_member()`가 `left_at`을 찍는다(2026-09-19 실행). 규칙도 서버가 든다:

      총무만 · 나 자신은 못 내보냄 · 마지막 총무는 못 내보냄 · 이미 나간 멤버는 거절
      그리고 **강등** — `role`을 `member`로 내린다

  ⚠ **강등이 왜 있나.** `join_team_by_invite`가 `left_at`을 비우면서 `role`은
    그대로 둔다. 강등이 없으면 **강퇴당한 총무가 초대 코드만 알면 총무로 복귀한다.**
    1.0은 재참여 자체는 막지 않는다(코드 재발급 기능이 없어 차단이 영구가 된다) —
    대신 권한만 떨군다.

  ⚠ **DELETE 정책은 지웠다**(`team_members_delete_admin`). 그래서 이 경로 말고
    `team_members`를 지울 방법이 없다 — 남겨 두면 CASCADE 구멍이 그대로였다.
*/
export async function removeMember(teamMemberId: string) {
  const { data, error } = await supabase.rpc('remove_member', { p_team_member_id: teamMemberId });
  /*
    ⚠ `leaveTeam`과 **같은 변환**이다. 서버가 한국어로 쓴 P0001을 여기서만 연다 —
      `toUserMessage`에 P0001을 통째로 열면 `join_team_by_invite`의 영어 개발자
      문구(`invalid invite code`)까지 사용자에게 샌다.
  */
  if (error) {
    throw (error as { code?: string }).code === 'P0001'
      ? new UserFacingError(error.message)
      : error;
  }
  return data;
}
