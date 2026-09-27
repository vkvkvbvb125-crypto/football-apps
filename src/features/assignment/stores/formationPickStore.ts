// src/features/assignment/stores/formationPickStore.ts — 고른 포메이션. **메모리에만 있다.**
//
// ── 왜 스토어인가 ──────────────────────────────────────────────────
// 같은 값을 **두 화면이 본다**:
//
//     팀 분배 카드   헤더의 읽기 전용 배지 (「2-2-1」)
//     포메이션 상세  칩(조작)
//
// 상세는 별도 스택 화면이라 `useState`로는 공유가 안 된다. params로 콜백을
// 넘기는 방법도 있지만 그건 직렬화가 안 되는 값을 내비게이션에 싣는 일이다.
// 스토어 하나가 제일 단순하다.
//
// ── ⚠ 저장하지 않는다. 그게 설계다 ────────────────────────────────
// 여기에 `persist`를 붙이지 마라. 저장하려면 `team_assignments` 옆에 자리를 만들어야
// 하고 그건 마이그레이션이다 — **화면에서 바꿔 보는 것만으로 「누가 어디」는 풀린다**는
// 것이 애초의 판단이다(docs/session-2026-08.md 「B 설계」).
//
// 앱을 껐다 켜면 기본값으로 돌아간다. **탭을 옮겼다 오는 정도로는 유지된다** —
// 2026-09-28에 기기에서 확인했다. 쓰는 동안 유지되는 쪽이 맞다:
// 탭 한 번 갔다 왔다고 배치가 되돌아가면 그게 고장으로 읽힌다.
import { create } from 'zustand';

interface FormationPickState {
  /** 키는 `${matchId}:${group}` — 경기도 그룹도 여럿이라 하나로 묶으면 같이 바뀐다 */
  picks: Record<string, number>;
  pick: (key: string, index: number) => void;
}

export const useFormationPickStore = create<FormationPickState>((set) => ({
  picks: {},
  pick: (key, index) => set((s) => ({ picks: { ...s.picks, [key]: index } })),
}));

/** 화면 둘이 같은 키를 만들도록 한 곳에서 만든다 */
export const formationKey = (matchId: string, group: string) => `${matchId}:${group}`;
