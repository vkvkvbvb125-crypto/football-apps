// src/features/timer/stores/scoreStore.ts
// 경기 스코어 — attendanceStore / settlementStore와 같은 모양.
//
// 화면 로컬 useState가 아니라 스토어인 이유: 지금은 경기운영 탭 하나만 읽지만
// 홈의 「최근 경기 결과」, 정산(경기 종료 → 정산 흐름), 팀 탭 개인 기록의 득점이
// 곧 같은 값을 읽는다. 그때 화면마다 따로 fetch하게 두면 값이 갈린다.
import { create } from 'zustand';
import { fetchScores, upsertScore } from '../services/scoreService';
import { useAuthStore } from '../../auth/stores/authStore';
import { toUserMessage } from '../../../lib/dbError';

/** matchId → { 'A': 2, 'B': 1 } */
type ScoreMap = Record<string, Record<string, number>>;

interface ScoreState {
  byMatch: ScoreMap;
  loadingMatchId: string | null;
  /**
   * 읽기에 실패한 경기.
   *
   * 「못 읽은 0」과 「진짜 0」을 가른다. 예전엔 실패를 삼키고 byMatch에 키를 안 만들었는데,
   * 그러면 scoreOf도 화면도 0을 돌려줘서 첫 경기(진짜 0)와 구별할 수 없었다.
   * byMatch에 null을 두는 방법도 있지만 ScoreMap 타입이 바뀌고 읽는 쪽마다 분기가 생긴다 —
   * loadingMatchId와 같은 모양의 필드 하나가 싸다.
   */
  failedMatchId: string | null;
  /** 저장·읽기 실패 문구 — 화면이 그대로 띄운다. 조용히 삼키지 않는다 */
  error: string | null;
  loadScores: (matchId: string) => Promise<void>;
  /** 낙관적 업데이트: UI 먼저 → 서버. 실패하면 이전 값으로 되돌린다 */
  setScore: (matchId: string, squadLabel: string, score: number) => Promise<void>;
  clearError: () => void;
  scoreOf: (matchId: string, squadLabel: string) => number;
  /** 그 경기의 점수를 믿을 수 있는가 — 읽기에 실패했으면 false */
  isScoreReady: (matchId: string) => boolean;
}

export const useScoreStore = create<ScoreState>((set, get) => ({
  byMatch: {},
  loadingMatchId: null,
  failedMatchId: null,
  error: null,

  loadScores: async (matchId) => {
    set({ loadingMatchId: matchId, failedMatchId: null, error: null });
    try {
      const rows = await fetchScores(matchId);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.squadLabel] = r.score;
      set((s) => ({ byMatch: { ...s.byMatch, [matchId]: map }, loadingMatchId: null }));
    } catch (e) {
      /*
       * 읽기 실패를 기록한다.
       *
       * 예전엔 삼키고 「0에서 시작하고 다음 저장에서 맞춰진다」고 적어 뒀다. 그게 거짓이었다 —
       * 맞춰지는 게 아니라 **덮어쓴다**. 화면의 +/− 는 자기가 들고 있는 값에 1을 더해 최종값을
       * 보내는데(upsertScore는 멱등이라 최종값이 이긴다), 못 읽은 0에서 +를 한 번 누르면
       * 1이 서버의 5를 덮는다. 「스코어 초기화」는 더 나쁘다 — 읽지도 않고 0을 보낸다.
       * 2026-08 팀 화면 작업 중 서랍을 훑다가 찾았다.
       *
       * 그래서 실패를 상태로 남기고 화면이 쓰기를 막는다. 자동 재시도는 안 넣는다 —
       * 경기 중 몇 분이고 열려 있는 화면이라 배경 폴링이 배터리를 먹는다. 사람이 누른다.
       *
       * error는 세우지 않는다. 처음엔 세웠는데 화면에 줄이 둘 떴다 — 아래 전용 문구
       * (「점수를 불러오지 못했어요 · 다시 시도」)와 saveError(「문제가 생겼어요…」)가
       * 같은 사건을 두 번 말했다. error는 저장 실패용이고(prop 이름도 saveError다),
       * 읽기 실패는 failedMatchId와 그 전용 문구가 맡는다. 삼키는 게 아니다 —
       * 말하는 자리가 하나일 뿐이다.
       */
      set({ loadingMatchId: null, failedMatchId: matchId });
    }
  },

  setScore: async (matchId, squadLabel, score) => {
    const prev = get().byMatch[matchId]?.[squadLabel] ?? 0;
    if (score < 0) return;

    /*
     * 못 읽은 경기에는 쓰지 않는다.
     *
     * 화면이 이미 버튼을 막고 있지만 둘은 다른 일이다 — 화면은 누르기 전에 알리고
     * 스토어는 쓰기를 거절한다. 투표 가드와 같은 구조다. 여기서 막지 않으면 새 호출부가
     * 생기는 날 그 경로로 서버 값이 덮인다.
     */
    if (get().failedMatchId === matchId) {
      set({ error: '점수를 아직 불러오지 못했어요' });
      return;
    }

    // 1) 먼저 화면. 경기 중에 +를 눌렀는데 숫자가 늦게 바뀌면 두 번 누르게 된다
    set((s) => ({
      byMatch: { ...s.byMatch, [matchId]: { ...(s.byMatch[matchId] ?? {}), [squadLabel]: score } },
      error: null,
    }));

    // 2) 그다음 서버. 실패하면 되돌리고 이유를 남긴다
    try {
      await upsertScore(matchId, squadLabel, score, useAuthStore.getState().session?.user.id);
    } catch (e) {
      set((s) => ({
        byMatch: { ...s.byMatch, [matchId]: { ...(s.byMatch[matchId] ?? {}), [squadLabel]: prev } },
        error: toUserMessage(e, {}, 'setScore'),
      }));
    }
  },

  clearError: () => set({ error: null }),
  scoreOf: (matchId, squadLabel) => get().byMatch[matchId]?.[squadLabel] ?? 0,
  isScoreReady: (matchId) => get().failedMatchId !== matchId,
}));
