import { create } from 'zustand';
import type { AttendanceStatus } from '../../../types/database';
import { useTeamStore } from '../../team/stores/teamStore';
import { isVotingOpen, votingLockNote } from '../utils/voting';
import { useAuthStore } from '../../auth/stores/authStore';
import { toUserMessage } from '../../../lib/dbError';
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
  /**
   * 반복 생성 결과 — 화면이 「N건 만들었어요 · M은 이미 있어 건너뛰었어요」를 그린다.
   * 건너뛴 건 실패가 아니라서 error로 세우지 않는다.
   */
  lastCreateResult: { created: number; skipped: string[] } | null;
  clearCreateResult: () => void;
  updateMatch: (matchId: string, input: UpdateMatchInput) => Promise<void>;
  updateMatchStatus: (matchId: string, status: MatchStatus) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  vote: (matchId: string, status: AttendanceStatus) => Promise<void>;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  matches: [],
  lastCreateResult: null,
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
      set({ error: toUserMessage(err, {}, 'loadMatches'), loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  clearCreateResult: () => set({ lastCreateResult: null }),
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
      set({
        error: toUserMessage(err, { '23505': '그 시각에 이미 경기가 있어요' }, 'createMatch'),
        loading: false,
      });
      return false;
    }
  },
  createMatches: async (inputs) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam || inputs.length === 0) return false;
    set({ loading: true, error: null });
    try {
      /*
       * 이미 있는 날짜는 건너뛴다.
       *
       * 12주치를 한 번에 만드는데 3주차가 겹친다고 전부 취소하면, 총무는 그 3주차를
       * 찾아 지우고 다시 눌러야 한다. 도움이 안 된다.
       *
       * unique(team_id, match_date) 제약이 걸려 있어서 그냥 루프를 돌리면 겹치는
       * 지점에서 throw하고, 앞의 N건만 만들어진 채 끝난다 — 부분 성공이 가장 나쁘다.
       * 미리 걸러 내면 트랜잭션 없이도 결과가 예측 가능하다.
       *
       * 이 필터는 경합을 막지 못한다(거르는 사이 다른 기기가 만들 수 있다).
       * 그건 DB 제약이 잡는다 — 여기는 흔한 경우를 조용히 처리하는 쪽이다.
       */
      const existing = new Set(get().matches.map((m) => new Date(m.match_date).getTime()));
      const fresh = inputs.filter((i) => !existing.has(new Date(i.matchDate).getTime()));
      const skipped = inputs.filter((i) => existing.has(new Date(i.matchDate).getTime()));

      if (fresh.length === 0) {
        set({ loading: false, lastCreateResult: { created: 0, skipped: skipped.map((i) => i.matchDate) } });
        return false;
      }

      for (const input of fresh) {
        await createMatchRequest({ ...input, teamId: activeTeam.team.id, createdBy: activeTeam.membershipId });
      }
      await get().loadMatches();
      set({ lastCreateResult: { created: fresh.length, skipped: skipped.map((i) => i.matchDate) } });

      const first = fresh[0];
      const dateLabel = new Date(first.matchDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric' });
      const myUserId = useAuthStore.getState().session?.user.id;
      notifyTeam(
        activeTeam.team.id,
        `${activeTeam.team.name} 새 경기 ${fresh.length}건`,
        `${dateLabel}부터 매주 경기가 등록됐어요`,
        myUserId,
        undefined,
        'new_match'
      ).catch(() => {
        // 알림 전송 실패는 조용히 무시 (경기 생성 자체는 이미 성공)
      });
      return true;
    } catch (err) {
      set({
        error: toUserMessage(err, { '23505': '그 시각에 이미 경기가 있어요' }, 'createMatches'),
        loading: false,
      });
      return false;
    }
  },
  updateMatch: async (matchId, input) => {
    set({ loading: true, error: null });
    try {
      await updateMatchRequest(matchId, input);
      await get().loadMatches();
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '그 시각에 이미 다른 경기가 있어요' }, 'updateMatch'), loading: false });
    }
  },
  updateMatchStatus: async (matchId, status) => {
    try {
      await updateMatchStatusRequest(matchId, status);
      await get().loadMatches();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateMatchStatus') });
    }
  },
  deleteMatch: async (matchId) => {
    set({ loading: true, error: null });
    try {
      await deleteMatchRequest(matchId);
      await get().loadMatches();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'deleteMatch'), loading: false });
    }
  },
  /**
   * 참석 투표.
   *
   * 마감 판정을 여기서 한다. 예전엔 화면에만 있었다 — MatchDetailCard의
   * disabled={isLocked}가 전부였고, 그건 버튼을 안 눌리게 할 뿐 쓰기를 막지 않는다.
   * 부르는 경로가 하나 더 생기면(참석 명단 시트의 「내 응답 변경」 같은 것) 그 화면이
   * 같은 판정을 다시 계산해야 하고, 그러면 규칙이 두 곳으로 갈린다.
   *
   * 총무 예외를 두지 않는다. 홈의 「총무는 마감 뒤에도 경기를 관리한다」는
   * 이동 버튼(라벨이 「경기 관리」다) 조건이지 투표 권한이 아니다 — 일정 화면의
   * isLocked에도 isAdmin이 없어서, 지금도 총무는 마감 후 투표하지 못한다.
   *
   * 조용히 return하지 않고 던진다. 부르는 쪽이 실패를 알아야 화면에 이유를 띄운다.
   *
   * RLS도 status='open'을 본다(votes_insert_own / votes_update_own). 다만 그쪽은
   * vote_deadline을 안 봐서, 마감 시각만 지난 open 경기는 서버가 막지 못한다.
   * 여기 가드가 그 구간까지 덮는다.
   */
  vote: async (matchId, status) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;

    const match = get().matches.find((m) => m.id === matchId);
    if (match && !isVotingOpen(match)) {
      const reason = votingLockNote(match, activeTeam.role === 'admin') ?? '지금은 투표할 수 없어요';
      set({ error: reason });
      throw new Error(reason);
    }

    try {
      await castVoteRequest(matchId, activeTeam.membershipId, status);
      await get().loadMatches();
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '이미 투표하셨어요' }, 'vote') });
    }
  },
}));
