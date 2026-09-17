import { create } from 'zustand';
import { useAuthStore } from '../../auth/stores/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createTeam as createTeamRequest,
  fetchMyMemberships,
  fetchTeamMembers,
  joinTeamByInvite as joinTeamByInviteRequest,
  removeMember as removeMemberRequest,
  updateMemberRole as updateMemberRoleRequest,
  updateMemberSkillTag as updateMemberSkillTagRequest,
  updateMemberPosition as updateMemberPositionRequest,
  updateMemberJersey as updateMemberJerseyRequest,
  updateTeamSlogan as updateTeamSloganRequest,
  updateNotifyPref as updateNotifyPrefRequest,
  type NotifyPrefColumn,
  updateTeamHomeLocation as updateTeamHomeLocationRequest,
  type TeamHomeLocation,
  type TeamMembership,
  type TeamMemberWithProfile,
  updateTeamProfile as updateTeamProfileRequest,
  type TeamProfileInput,
} from '../services/teamService';
import type { SkillTag } from '../../../types/database';
import { UserFacingError, toUserMessage } from '../../../lib/dbError';

/**
 * 마지막으로 보던 팀. 앱을 다시 켰을 때 그 팀으로 돌아온다.
 *
 * 서버에 두지 않는 이유: 「어느 팀을 보고 있었나」는 기기별 상태다. 폰에서 A팀을 보다
 * 태블릿을 켰을 때 A팀으로 끌려가는 게 맞는 동작이 아니고, 이걸 서버에 두면 컬럼 하나에
 * 마이그레이션과 RLS가 딸려온다.
 */
const ACTIVE_TEAM_KEY = 'kickday.activeTeamId';

async function readStoredTeamId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_TEAM_KEY);
  } catch {
    // 저장소를 못 읽어도 첫 번째 팀으로 뜨면 그만이다 — 로그인을 막을 일이 아니다
    return null;
  }
}

function storeTeamId(teamId: string) {
  AsyncStorage.setItem(ACTIVE_TEAM_KEY, teamId).catch(() => {
    // 다음에 켤 때 첫 팀으로 뜬다. 지금 화면은 이미 바뀌었으므로 사용자를 막지 않는다
  });
}

interface TeamState {
  memberships: TeamMembership[];
  activeTeam: TeamMembership | null;
  members: TeamMemberWithProfile[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /**
   * 팀을 못 불러온 이유. null이면 정상이다.
   *
   * ⚠ `memberships: []`만으로는 **「팀이 없다」와 「못 불러왔다」를 못 가른다.**
   *   둘 다 빈 배열이라 화면이 똑같이 「팀 만들기」를 권하게 되고, 팀이 있는 사람에게
   *   팀을 만들라고 하면 **중복 팀**이 생긴다. 그래서 이유를 따로 들고 있는다.
   * ⚠ 'failed'와 'timeout'을 가르는 이유는 문구가 달라야 해서다 —
   *   「불러오지 못했어요」는 답이 오류로 온 것이고 「응답이 없어요」는 답이 안 온 것이다.
   */
  loadError: 'failed' | 'timeout' | null;
  /**
   * @param preferTeamId 이 팀을 활성으로 삼는다(있으면). 팀을 새로 만들거나 초대로
   *   막 가입했을 때 그 팀으로 들어가려고 쓴다.
   */
  loadMemberships: (preferTeamId?: string) => Promise<void>;
  /** 보고 있는 팀을 바꾼다. 소속되지 않은 id면 무시한다 */
  setActiveTeam: (teamId: string) => void;
  loadMembers: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  joinTeam: (inviteCode: string) => Promise<void>;
  updateHomeLocation: (location: TeamHomeLocation) => Promise<void>;
  updateMemberSkillTag: (teamMemberId: string, skillTag: SkillTag | null) => Promise<void>;
  updateMemberPosition: (teamMemberId: string, position: string | null) => Promise<void>;
  updateMemberJersey: (teamMemberId: string, jerseyNumber: number | null) => Promise<void>;
  updateSlogan: (slogan: string | null) => Promise<void>;
  /** 보낸 칸만 저장한다 — 세 필드가 각자 즉시 저장돼서, 전 칸을 보내면 화면의 낡은 값이 덮는다 */
  updateTeamProfile: (input: TeamProfileInput) => Promise<boolean>;
  promoteToAdmin: (teamMemberId: string) => Promise<void>;
  removeMember: (teamMemberId: string) => Promise<void>;
  leaveTeam: () => Promise<void>;
  updateNotifyPref: (teamMemberId: string, column: NotifyPrefColumn, value: boolean) => Promise<void>;
  reset: () => void;
}

/*
  팀 조회의 상한. 이 시간이 지나면 요청을 **끊는다**.

  ── 왜 상한이 필요한가 ────────────────────────────────────────────
  이 조회가 안 돌아오면 앱이 **TeamLoading에 갇힌다** — 글자도 탭바도 뒤로가기도 없는
  화면이다. RN의 fetch에는 기본 시한이 없어서 멈춘 연결·캡티브 포털이면 그대로 선다.
  실패는 오히려 낫다(아래 catch가 받는다). 나쁜 것은 **안 끝나는 것**이다.

  ── 왜 여기만 감싸나 — 「갇히는 로더」와 「안 갇히는 로더」 ──────────
  같은 모양(시한 없는 supabase 호출)은 저장소 전체에 있다. 2026-09-15에 세어 보니
  **호출 73개 · 파일 17개**다. 그런데 **가두는 것은 이 하나뿐**이다:

      TeamLoading           ❌ 탭바도 뒤로가기도 없다. 갇힌다
      TeamSettingsScreen    ✅ 뒤로가기 버튼이 있다
      일정·정산·경기운영     ✅ 탭 네비게이터 안이라 탭바가 있다

  **게이트가 있는 자리만 문제고, 그게 지금 하나다.** 그래서 공용으로 안 쌌다 —
  `global.fetch`에 씌우면 한 줄로 73개를 덮지만, 아바타 업로드(`storage.upload`)와
  토큰 갱신(`auth`)까지 같은 상한에 걸려 **멀쩡한 것을 끊는다.**
  ⚠ **게이트가 늘면 그때 공용화를 다시 본다.** 그때 재야 할 것은 「호출이 몇 개인가」가
    아니라 「빠져나갈 수 없는 화면이 몇 개인가」다.

  ── 왜 12초인가 ──────────────────────────────────────────────────
  ⚠ 이 저장소에 **네트워크 타임아웃 전례가 없다.** 유일한 `LOCATION_TIMEOUT_MS = 5000`은
    **GPS 측위** 대기라 성격이 다르다 — 위치는 없어도 전국 검색으로 앱을 쓸 수 있지만,
    팀은 값이 없으면 **앱을 못 쓴다.** 그래서 그 값을 그대로 가져오지 않았다.

  근거 둘:
    ⑴ **요청이 둘이고 순차다**(team_members → teams). 각 왕복을 넉넉히 4~5초로 잡아도
       합이 8~10초라, 그 위에 여유를 둔 값이다.
    ⑵ 앱 시작이 1.2~2.1초다(2026-09-15 실측). 12초는 그 **6~10배**라
       「정상적으로 느린 것」과 명백히 갈린다.

  ⚠ **너무 짧게 잡는 비용이 작아진 것은 행선지를 바꿨기 때문이다.** 끊긴 뒤 「팀 시작」
    화면으로 보냈다면 잘못 끊는 순간 중복 팀을 권하게 되어 20초쯤으로 올려야 했다.
    「다시 시도」로 보내니 잘못 끊어도 한 번 누르면 된다. **두 결정은 묶여 있다 —
    행선지를 되돌리려면 이 값도 다시 재라.**
*/
const TEAM_LOAD_TIMEOUT_MS = 12_000;

export const useTeamStore = create<TeamState>((set, get) => ({
  memberships: [],
  activeTeam: null,
  members: [],
  loaded: false,
  loading: false,
  error: null,
  loadError: null,
  loadMemberships: async (preferTeamId) => {
    /*
      ⚠ **loadError를 여기서 지우지 않는다. 성공했을 때만 지운다.**

      지우면 「다시 시도」를 누르는 순간 오류 화면이 사라지고, loaded는 이미 true인데
      activeTeam은 아직 null이라 **「팀 시작」 화면이 튀어나온다** — 팀이 있는 사람에게
      팀을 만들라고 권하는 그 화면이고, 이 갈래를 만든 이유가 바로 그걸 막는 것이었다.
      2026-09-17에 기기에서 잡았다(기내 모드로 실패시킨 뒤 「다시 시도」).

      화면은 loading을 읽어 버튼을 「불러오는 중…」으로 바꾼다(TeamLoadErrorScreen).
      그러니 **실패 화면을 유지한 채 진행 표시만 바뀌는 것**이 원래 의도였다.
    */
    set({ loading: true, error: null });

    /*
      ⚠ **Promise.race가 아니라 AbortSignal이다.**
        race는 결과만 버리고 요청은 살려 둔다 — 뒤늦게 온 응답이 그 사이에 세운 상태를
        덮어쓸 수 있다. 재시도로 두 요청이 겹치면 **늦게 온 쪽이 이긴다.**
        여기서는 실제로 끊으므로 그 경합 자체가 없다.
      ⚠ `AbortSignal.timeout(ms)`를 안 쓴다 — RN이 쓰는 폴리필
        (abort-controller@3.0.0)에 그 static이 **없다.** 릴리스에서만 죽는다.
    */
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TEAM_LOAD_TIMEOUT_MS);
    try {
      /*
        ⚠ userId를 여기서 얻어 넘긴다. 서비스는 스토어를 안 본다 —
          announcementsStore·attendanceStore가 같은 모양이다.
        ⚠ 세션이 없으면 **빈 목록으로 끝낸다.** 전에는 fetchMyMemberships가 조건 없이
          전부 읽어서, 세션이 없어도 남의 행이 돌아올 수 있었다.
      */
      const myUserId = useAuthStore.getState().session?.user.id;
      if (!myUserId) {
        set({ memberships: [], activeTeam: null, loaded: true, loading: false });
        return;
      }
      const memberships = await fetchMyMemberships(myUserId, ac.signal);

      /*
       * 보던 팀을 유지한다.
       *
       * 예전엔 무조건 memberships[0]이었다. 이 함수는 슬로건·프로필·지역을 고칠 때마다
       * 다시 불리므로, 두 번째 팀에서 슬로건 한 줄만 고쳐도 첫 팀으로 튕겼다.
       * 애초에 두 번째 팀에 들어갈 방법 자체가 없었던 것도 여기가 원인이다.
       *
       * 우선순위: 방금 만든/가입한 팀 → 지금 보던 팀 → 저장된 팀 → 첫 팀.
       * 저장소는 activeTeam이 아직 없을 때(앱을 막 켠 때)만 읽는다.
       */
      const current = get().activeTeam?.team.id;
      const wanted = preferTeamId ?? current ?? (await readStoredTeamId()) ?? undefined;
      // 그 팀에서 나갔거나 팀이 사라졌으면 첫 팀으로 떨어진다
      const activeTeam = memberships.find((m) => m.team.id === wanted) ?? memberships[0] ?? null;

      set({ memberships, activeTeam, loaded: true, loadError: null });
      if (activeTeam) storeTeamId(activeTeam.team.id);
      get().loadMembers();
    } catch (err) {
      /*
        ⚠ **끊어서 난 오류와 진짜 오류를 가른다.** 중단도 catch로 오므로 err만 보면
          둘이 같은 출력이 된다. `signal.aborted`가 그 자리를 가른다.
      */
      if (ac.signal.aborted) {
        set({ loadError: 'timeout', loaded: true });
      } else {
        set({ error: toUserMessage(err, {}, 'loadMemberships'), loadError: 'failed', loaded: true });
      }
    } finally {
      clearTimeout(timer);
      set({ loading: false });
    }
  },

  setActiveTeam: (teamId) => {
    const { memberships, activeTeam } = get();
    const next = memberships.find((m) => m.team.id === teamId);
    if (!next) {
      console.warn(`[teamStore] setActiveTeam: 소속되지 않은 팀(${teamId}) — 무시한다`);
      return;
    }
    if (activeTeam?.team.id === teamId) return;

    /*
     * members를 여기서 즉시 비운다. loadMembers가 돌아오기 전까지 이전 팀 명단이
     * 새 팀 이름 아래 그대로 떠 있게 된다 — 팀을 바꿨는데 남의 팀 사람이 보이는 것보다
     * 잠깐 비어 있는 편이 낫다.
     *
     * 경기·정산·공지는 각자 스토어에 있어서 여기서 못 지운다(그쪽이 teamStore를
     * import하고 있어 반대로 import하면 순환이 된다). RootNavigator가 활성 팀 id를
     * 보고 한자리에서 비운다 — 만들기·가입·폴백까지 모든 전환 경로가 거기를 지난다.
     */
    set({ activeTeam: next, members: [] });
    storeTeamId(teamId);
    get().loadMembers();
  },
  loadMembers: async () => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    try {
      const members = await fetchTeamMembers(activeTeam.team.id);
      set({ members });
    } catch {
      // 멤버 목록은 부가 정보라 실패해도 조용히 무시
    }
  },
  createTeam: async (name) => {
    set({ loading: true, error: null });
    try {
      // 만든 팀으로 바로 들어간다 — 만들자마자 첫 팀이 보이면 만든 게 어디 갔나 싶다
      const created = await createTeamRequest(name);
      await get().loadMemberships(created?.id);
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '같은 이름의 팀이 이미 있어요' }, 'createTeam'), loading: false });
    }
  },
  joinTeam: async (inviteCode) => {
    set({ loading: true, error: null });
    try {
      // 가입한 팀으로 바로 들어간다. RPC는 team_members 행을 돌려준다
      const joined = await joinTeamByInviteRequest(inviteCode);

      /*
       * 이미 그 팀 멤버면 RPC가 null을 준다 — insert가 on conflict do nothing이라
       * 23505가 나지 않는다. 예전엔 23505를 「이미 가입한 팀이에요」로 매핑해 뒀는데
       * 그 코드는 한 번도 걸린 적이 없고, 화면은 아무 말 없이 그대로 서 있었다.
       * 팀 없이 시작할 때는 겪을 수 없는 경로였지만, 팀 전환 시트에서 이 화면을 열 수
       * 있게 되면서 실제로 닿는다.
       */
      if (!joined) {
        set({ error: '이미 가입한 팀이에요', loading: false });
        return;
      }
      await get().loadMemberships(joined.team_id);
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'joinTeam'), loading: false });
    }
  },
  updateHomeLocation: async (location) => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      await updateTeamHomeLocationRequest(activeTeam.team.id, location);
      await get().loadMemberships();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateHomeLocation'), loading: false });
    }
  },
  updateMemberSkillTag: async (teamMemberId, skillTag) => {
    try {
      await updateMemberSkillTagRequest(teamMemberId, skillTag);
      await get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateMemberSkillTag') });
    }
  },
  updateMemberPosition: async (teamMemberId, position) => {
    try {
      await updateMemberPositionRequest(teamMemberId, position);
      await get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateMemberPosition') });
    }
  },
  updateMemberJersey: async (teamMemberId, jerseyNumber) => {
    try {
      await updateMemberJerseyRequest(teamMemberId, jerseyNumber);
      await get().loadMembers();
    } catch (err) {
      // 유니크 인덱스 위반이면 팀 안에 같은 번호가 이미 있다는 뜻이다
      const dup = err instanceof Error && /duplicate|unique/i.test(err.message);
      set({ error: dup ? '이미 쓰고 있는 등번호예요' : '등번호를 바꾸지 못했습니다.' });
      throw err;
    }
  },
  updateTeamProfile: async (input) => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return false;
    try {
      await updateTeamProfileRequest(activeTeam.team.id, input);
      await get().loadMemberships();
      return true;
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateTeamProfile') });
      return false;
    }
  },
  updateSlogan: async (slogan) => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    try {
      await updateTeamSloganRequest(activeTeam.team.id, slogan);
      await get().loadMemberships();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateSlogan') });
    }
  },
  /**
   * 팀 나가기 — 내 멤버십만 지운다.
   *
   * 마지막 총무는 못 나간다. 나가면 팀에 주인이 없어져서 아무도 경기를 만들거나
   * 설정을 바꿀 수 없는 팀이 남는다(총무 임명도 총무만 할 수 있다).
   *
   * 단 혼자인 팀은 나갈 수 있다. 위 근거는 「남은 사람이 아무것도 못 한다」인데
   * 혼자면 남을 사람이 없어서 전제가 닿지 않는다. 막아 두면 팀 삭제 경로도 없으므로
   * (D-4에서 안 만들기로 했다) 혼자 만든 팀에 영영 갇힌다.
   *
   * 나가면 멤버가 0명이 되고, teams_select가 is_team_member(id)라 그 팀은 아무에게도
   * 안 보인다 — 지우지 않아도 사라진 것과 같다는 것이 D-4의 결론이다.
   *
   * 나간 뒤에는 소속이 사라지므로 멤버십을 다시 불러 화면이 팀 선택으로 돌아가게 한다.
   */
  leaveTeam: async () => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    const members = get().members;
    const adminCount = members.filter((m) => m.role === 'admin').length;
    const alone = members.length <= 1;
    if (!alone && activeTeam.role === 'admin' && adminCount <= 1) {
      set({ error: '마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.' });
      throw new UserFacingError('마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.');
    }
    await removeMemberRequest(activeTeam.membershipId);
    /*
     * 방금 나간 팀이 activeTeam으로 남아 있으면 loadMemberships가 그 id를 원한다.
     * 목록에 없으니 첫 팀으로 떨어지긴 하지만, 의도를 남겨 두려고 먼저 비운다.
     */
    set({ activeTeam: null, members: [] });
    await get().loadMemberships();
  },
  updateNotifyPref: async (teamMemberId, column, value) => {
    try {
      await updateNotifyPrefRequest(teamMemberId, column, value);
      await get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateNotifyPref') });
    }
  },
  promoteToAdmin: async (teamMemberId) => {
    try {
      await updateMemberRoleRequest(teamMemberId, 'admin');
      await get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, { '42501': '총무만 할 수 있어요' }, 'promoteToAdmin') });
    }
  },
  removeMember: async (teamMemberId) => {
    const target = get().members.find((m) => m.id === teamMemberId);
    const adminCount = get().members.filter((m) => m.role === 'admin').length;
    if (target?.role === 'admin' && adminCount <= 1) {
      set({ error: '마지막 총무는 내보낼 수 없어요. 먼저 다른 총무를 임명해주세요.' });
      return;
    }
    try {
      await removeMemberRequest(teamMemberId);
      await get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, { '42501': '총무만 할 수 있어요' }, 'removeMember') });
    }
  },
  reset: () => set({ memberships: [], activeTeam: null, members: [], loaded: false, error: null, loadError: null }),
}));
