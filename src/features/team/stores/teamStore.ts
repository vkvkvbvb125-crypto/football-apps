import { create } from 'zustand';
import {
  createTeam as createTeamRequest,
  fetchMyMemberships,
  fetchTeamMembers,
  joinTeamByInvite as joinTeamByInviteRequest,
  removeMember as removeMemberRequest,
  updateMemberRole as updateMemberRoleRequest,
  updateMemberSkillTag as updateMemberSkillTagRequest,
  updateTeamHomeLocation as updateTeamHomeLocationRequest,
  type TeamHomeLocation,
  type TeamMembership,
  type TeamMemberWithProfile,
} from '../services/teamService';
import type { SkillTag } from '../../../types/database';

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
  promoteToAdmin: (teamMemberId: string) => Promise<void>;
  removeMember: (teamMemberId: string) => Promise<void>;
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
      set({ error: err instanceof Error ? err.message : '팀 정보를 불러오지 못했습니다.', loaded: true });
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
      set({ error: err instanceof Error ? err.message : '팀 생성에 실패했습니다.', loading: false });
    }
  },
  joinTeam: async (inviteCode) => {
    set({ loading: true, error: null });
    try {
      await joinTeamByInviteRequest(inviteCode);
      await get().loadMemberships();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '팀 가입에 실패했습니다. 초대코드를 확인하세요.',
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
      set({ error: err instanceof Error ? err.message : '대표 지역 설정에 실패했습니다.', loading: false });
    }
  },
  updateMemberSkillTag: async (teamMemberId, skillTag) => {
    try {
      await updateMemberSkillTagRequest(teamMemberId, skillTag);
      await get().loadMembers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '실력태그 변경에 실패했습니다.' });
    }
  },
  promoteToAdmin: async (teamMemberId) => {
    try {
      await updateMemberRoleRequest(teamMemberId, 'admin');
      await get().loadMembers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '총무 임명에 실패했습니다.' });
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
      set({ error: err instanceof Error ? err.message : '멤버 내보내기에 실패했습니다.' });
    }
  },
  reset: () => set({ memberships: [], activeTeam: null, members: [], loaded: false, error: null }),
}));
