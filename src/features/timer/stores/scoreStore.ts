// src/features/timer/stores/scoreStore.ts
// 경기 스코어 — attendanceStore / settlementStore와 같은 모양.
//
// 화면 로컬 useState가 아니라 스토어인 이유: 지금은 경기운영 탭 하나만 읽지만
// 홈의 「최근 경기 결과」, 정산(경기 종료 → 정산 흐름), 팀 탭 개인 기록의 득점이
// 곧 같은 값을 읽는다. 그때 화면마다 따로 fetch하게 두면 값이 갈린다.
import { create } from 'zustand';
import { fetchScores, upsertScore } from '../services/scoreService';
import { useAuthStore } from '../../auth/stores/authStore';

/** matchId → { 'A': 2, 'B': 1 } */
type ScoreMap = Record<string, Record<string, number>>;

interface ScoreState {
  byMatch: ScoreMap;
  loadingMatchId: string | null;
  /** 저장 실패 문구 — 화면이 그대로 띄운다. 조용히 삼키지 않는다 */
  error: string | null;
  loadScores: (matchId: string) => Promise<void>;
  /** 낙관적 업데이트: UI 먼저 → 서버. 실패하면 이전 값으로 되돌린다 */
  setScore: (matchId: string, squadLabel: string, score: number) => Promise<void>;
  clearError: () => void;
  scoreOf: (matchId: string, squadLabel: string) => number;
}

export const useScoreStore = create<ScoreState>((set, get) => ({
  byMatch: {},
  loadingMatchId: null,
  error: null,

  loadScores: async (matchId) => {
    set({ loadingMatchId: matchId });
    try {
      const rows = await fetchScores(matchId);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.squadLabel] = r.score;
      set((s) => ({ byMatch: { ...s.byMatch, [matchId]: map }, loadingMatchId: null }));
    } catch (e) {
      // 읽기 실패는 화면을 막지 않는다 — 0에서 시작하고 다음 저장에서 맞춰진다
      set({ loadingMatchId: null });
    }
  },

  setScore: async (matchId, squadLabel, score) => {
    const prev = get().byMatch[matchId]?.[squadLabel] ?? 0;
    if (score < 0) return;

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
        error: e instanceof Error ? e.message : '점수를 저장하지 못했어요',
      }));
    }
  },

  clearError: () => set({ error: null }),
  scoreOf: (matchId, squadLabel) => get().byMatch[matchId]?.[squadLabel] ?? 0,
}));
