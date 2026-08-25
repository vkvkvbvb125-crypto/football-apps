import { create } from 'zustand';
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
import { toUserMessage } from '../../../lib/dbError';

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

export const useTeamStore = create<TeamState>((set, get) => ({
  memberships: [],
  activeTeam: null,
  members: [],
  loaded: false,
  loading: false,
  error: null,
  loadMemberships: async (preferTeamId) => {
    set({ loading: true, error: null });
    try {
      const memberships = await fetchMyMemberships();

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

      set({ memberships, activeTeam, loaded: true });
      if (activeTeam) storeTeamId(activeTeam.team.id);
      get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'loadMemberships'), loaded: true });
    } finally {
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
      throw new Error('마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.');
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
  reset: () => set({ memberships: [], activeTeam: null, members: [], loaded: false, error: null }),
}));
