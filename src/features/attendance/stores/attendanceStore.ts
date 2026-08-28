import { create } from 'zustand';
import type { AttendanceStatus } from '../../../types/database';
import { useTeamStore } from '../../team/stores/teamStore';
import { isVotingOpen, votingLockNote } from '../utils/voting';
import { makeOptimisticVote, putMyVote, rollbackTarget } from '../utils/optimisticVote';
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
  /**
   * 바뀌었으면 true.
   *
   * createMatch와 같은 이유다 — Promise<void>면 실패해도 부르는 쪽이 알 수 없다.
   * 「경기 종료 → 정산으로」가 그 경로였다: 상태 변경이 실패해도 정산 화면으로
   * 넘어가서, 총무는 종료했다고 믿는데 경기는 open으로 남았다.
   *
   * error를 읽어 판단하지 않는다. 성공해도 앞선 실패가 남아 있으면 그걸 이번 실패로
   * 읽는다 — 그래서 시작할 때 비우고 결과를 돌려준다.
   */
  updateMatchStatus: (matchId: string, status: MatchStatus) => Promise<boolean>;
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
    set({ error: null });
    try {
      await updateMatchStatusRequest(matchId, status);
      await get().loadMatches();
      return true;
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateMatchStatus') });
      return false;
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
   *
   * 서버 응답을 기다리지 않고 화면에 먼저 반영한다. 실패하면 되돌린다.
   * 되돌리기는 열 때 찍어둔 배열을 복원하는 게 아니라 내 행 하나를 지금 상태에
   * 얹는 연산이다 — 이유는 utils/optimisticVote.ts 머리말에 있다.
   *
   * 남는 창이 하나 있다: 같은 경기에 대한 vote()가 겹쳐 돌 때. 두 번째가 첫 번째의
   * 낙관 행을 보지만 replaced로 원래 값을 되찾으므로 값 자체는 맞고, 순서만
   * 뒤집힐 수 있다. 다음 loadMatches()가 수렴시킨다.
   */
  vote: async (matchId, status) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    const me = activeTeam.membershipId;

    const match = get().matches.find((m) => m.id === matchId);
    if (match && !isVotingOpen(match)) {
      const reason = votingLockNote(match, activeTeam.role === 'admin') ?? '지금은 투표할 수 없어요';
      set({ error: reason });
      throw new Error(reason);
    }

    // 실패했을 때 되돌릴 값. 연타로 낙관 행이 이미 깔려 있으면 그 행이 덮은 원래 값을 쓴다
    const prev = rollbackTarget(match?.votes.find((v) => v.team_member_id === me));
    set({ matches: putMyVote(get().matches, matchId, me, makeOptimisticVote(matchId, me, status, prev)) });

    /*
      try는 castVote 하나만 감싼다.
      loadMatches()는 자기 catch로 에러를 삼켜서 지금은 절대 안 던진다 — 그래서 예전
      코드도 「쓰기 실패」와 「재조회 실패」가 우연히 동치였다. 그 우연에 롤백을 걸면,
      누가 loadMatches를 rethrow로 바꾸는 날 쓰기가 성공한 투표가 되돌아간다.

      실패 경로에서 loadMatches()를 부르지 않는다. 서버가 안 받았으니 되돌린 값이 곧
      서버 상태이고, loadMatches는 시작하면서 error를 null로 밀어 방금 세운 문구를 지운다.
    */
    try {
      await castVoteRequest(matchId, me, status);
    } catch (err) {
      const message = toUserMessage(err, { '23505': '이미 투표하셨어요' }, 'vote');
      set({ matches: putMyVote(get().matches, matchId, me, prev), error: message });
      /*
        마감 가드와 같은 방식으로 던진다.

        조용히 return하면 부르는 쪽은 성공과 실패를 구별하지 못한다. 명단 시트가 그걸로
        「저장했어요」를 띄우고 스스로 닫았다 — 롤백은 제대로 됐는데 화면만 성공이라고
        말하는, 눈으로는 안 걸리는 상태였다. 브라우저 확인에서 잡혔다.

        일정 화면 카드는 .catch로 받아 삼킨다(문구는 위 error를 :428이 그린다).
      */
      throw new Error(message);
    }

    await get().loadMatches();
  },
}));
