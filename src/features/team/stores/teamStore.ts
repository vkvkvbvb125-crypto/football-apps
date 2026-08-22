import { create } from 'zustand';
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
} from '../services/teamService';
import type { SkillTag } from '../../../types/database';
import { toUserMessage } from '../../../lib/dbError';

interface TeamState {
  memberships: TeamMembership[];
  activeTeam: TeamMembership | null;
  members: TeamMemberWithProfile[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadMemberships: () => Promise<void>;
  loadMembers: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  joinTeam: (inviteCode: string) => Promise<void>;
  updateHomeLocation: (location: TeamHomeLocation) => Promise<void>;
  updateMemberSkillTag: (teamMemberId: string, skillTag: SkillTag | null) => Promise<void>;
  updateMemberPosition: (teamMemberId: string, position: string | null) => Promise<void>;
  updateMemberJersey: (teamMemberId: string, jerseyNumber: number | null) => Promise<void>;
  updateSlogan: (slogan: string | null) => Promise<void>;
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
  loadMemberships: async () => {
    set({ loading: true, error: null });
    try {
      const memberships = await fetchMyMemberships();
      set({ memberships, activeTeam: memberships[0] ?? null, loaded: true });
      get().loadMembers();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'loadMemberships'), loaded: true });
    } finally {
      set({ loading: false });
    }
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
      await createTeamRequest(name);
      await get().loadMemberships();
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '같은 이름의 팀이 이미 있어요' }, 'createTeam'), loading: false });
    }
  },
  joinTeam: async (inviteCode) => {
    set({ loading: true, error: null });
    try {
      await joinTeamByInviteRequest(inviteCode);
      await get().loadMemberships();
    } catch (err) {
      set({
        error: toUserMessage(err, { '23505': '이미 가입한 팀이에요' }, 'joinTeam'),
        loading: false,
      });
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
   * 나간 뒤에는 소속이 사라지므로 멤버십을 다시 불러 화면이 팀 선택으로 돌아가게 한다.
   */
  leaveTeam: async () => {
    const activeTeam = get().activeTeam;
    if (!activeTeam) return;
    const adminCount = get().members.filter((m) => m.role === 'admin').length;
    if (activeTeam.role === 'admin' && adminCount <= 1) {
      set({ error: '마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.' });
      throw new Error('마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.');
    }
    await removeMemberRequest(activeTeam.membershipId);
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
