import { supabase } from '../../../lib/supabase';
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
    .from('team_members')
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
  if (error) throw error;
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
  const { data: members, error } = await supabase.from('team_members').select('*').eq('team_id', teamId);
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

export async function removeMember(teamMemberId: string) {
  const { error } = await supabase.from('team_members').delete().eq('id', teamMemberId);
  if (error) throw error;
}
