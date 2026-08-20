import { create } from 'zustand';
import type { AttendanceStatus } from '../../../types/database';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  castVote as castVoteRequest,
  createMatch as createMatchRequest,
  deleteMatch as deleteMatchRequest,
  fetchMatches,
  updateMatch as updateMatchRequest,
  updateMatchStatus as updateMatchStatusRequest,
  type CreateMatchInput,
  type MatchWithVotes,
  type UpdateMatchInput,
} from '../services/attendanceService';
import type { MatchStatus } from '../../../types/database';

interface AttendanceState {
  matches: MatchWithVotes[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadMatches: () => Promise<void>;
  /**
   * 만들어졌으면 true.
   *
   * 예전엔 Promise<void>라 실패해도 부르는 쪽이 알 수 없었다 — 시트는 무조건 닫히고
   * 목록은 그대로였다. "만들었는데 업데이트가 안 된다"로 보이는 게 이 경로다.
   */
  createMatch: (input: Omit<CreateMatchInput, 'teamId' | 'createdBy'>) => Promise<boolean>;
  /** 반복 생성 등 여러 경기를 한 번에 만들 때 — 알림은 한 번만 보낸다 */
  createMatches: (inputs: Omit<CreateMatchInput, 'teamId' | 'createdBy'>[]) => Promise<boolean>;
  updateMatch: (matchId: string, input: UpdateMatchInput) => Promise<void>;
  updateMatchStatus: (matchId: string, status: MatchStatus) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  vote: (matchId: string, status: AttendanceStatus) => Promise<void>;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  matches: [],
  loaded: false,
  loading: false,
  error: null,
  loadMatches: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      const matches = await fetchMatches(activeTeam.team.id);
      set({ matches, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '일정을 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  createMatch: async (input) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return false;
    set({ loading: true, error: null });
    try {
      await createMatchRequest({ ...input, teamId: activeTeam.team.id, createdBy: activeTeam.membershipId });
      await get().loadMatches();

      const matchDate = new Date(input.matchDate);
      const dateLabel = matchDate.toLocaleString('ko-KR', {
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const myUserId = useAuthStore.getState().session?.user.id;
      notifyTeam(
        activeTeam.team.id,
        `${activeTeam.team.name} 새 경기`,
        `${dateLabel}${input.location ? ` · ${input.location}` : ''}에 경기가 등록됐어요`,
        myUserId,
        undefined,
        'new_match'
      ).catch(() => {
        // 알림 전송 실패는 조용히 무시 (경기 생성 자체는 이미 성공)
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '경기 생성에 실패했습니다.', loading: false });
      return false;
    }
  },
  createMatches: async (inputs) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam || inputs.length === 0) return false;
    set({ loading: true, error: null });
    try {
      for (const input of inputs) {
        await createMatchRequest({ ...input, teamId: activeTeam.team.id, createdBy: activeTeam.membershipId });
      }
      await get().loadMatches();

      const first = inputs[0];
      const dateLabel = new Date(first.matchDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric' });
      const myUserId = useAuthStore.getState().session?.user.id;
      notifyTeam(
        activeTeam.team.id,
        `${activeTeam.team.name} 새 경기 ${inputs.length}건`,
        `${dateLabel}부터 매주 경기가 등록됐어요`,
        myUserId,
        undefined,
        'new_match'
      ).catch(() => {
        // 알림 전송 실패는 조용히 무시 (경기 생성 자체는 이미 성공)
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '경기 생성에 실패했습니다.', loading: false });
      return false;
    }
  },
  updateMatch: async (matchId, input) => {
    set({ loading: true, error: null });
    try {
      await updateMatchRequest(matchId, input);
      await get().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '경기 수정에 실패했습니다.', loading: false });
    }
  },
  updateMatchStatus: async (matchId, status) => {
    try {
      await updateMatchStatusRequest(matchId, status);
      await get().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '경기 상태 변경에 실패했습니다.' });
    }
  },
  deleteMatch: async (matchId) => {
    set({ loading: true, error: null });
    try {
      await deleteMatchRequest(matchId);
      await get().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '경기 취소에 실패했습니다.', loading: false });
    }
  },
  vote: async (matchId, status) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    try {
      await castVoteRequest(matchId, activeTeam.membershipId, status);
      await get().loadMatches();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '투표에 실패했습니다.' });
    }
  },
}));
