// src/features/timer/services/scoreService.ts
// match_scores 읽기/쓰기. 화면은 스토어만 보고, 스토어가 여기만 부른다.
import { supabase } from '../../../lib/supabase';

export interface ScoreRow {
  squadLabel: string;
  score: number;
}

export async function fetchScores(matchId: string): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from('match_scores')
    .select('squad_label, score')
    .eq('match_id', matchId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ squadLabel: r.squad_label, score: r.score }));
}

/**
 * 한 팀의 점수를 덮어쓴다.
 *
 * insert가 아니라 upsert다 — 첫 득점과 두 번째 득점이 다른 코드를 타면 안 된다.
 * 증분(+1)이 아니라 최종값을 보내는 것도 의도다: 네트워크가 밀려 요청이 두 번
 * 도착해도 결과가 같다(멱등). 경기 중에 +를 연타하는 화면이라 이게 중요하다.
 */
/*
  ⚠ **동시 편집 — 마지막 쓰기가 이기는 것이 맞다. 재보고 정한 것이다(2026-09-14).**

  두 총무가 같은 값을 동시에 고치면 나중 쓰기가 앞의 것을 덮는다. 여기서는 그게 맞다:
    · 단일 컬럼 부분 갱신이라 **다른 칸이 같이 밀리지 않는다**
    · 덮이는 것이 「누군가의 뜻」이고, 나중 사람의 뜻이 더 최신이다
    · 틀린 값이 만들어지지 않는다 — 둘 중 하나가 그대로 남을 뿐이다

  실시간 구독을 붙일 자리가 아니다. 화면이 잠깐 낡을 뿐이고, 다음 로드에 맞춰진다.
  ⚠ 다른 판단이 필요한 자리는 settlementStore의 exemptShare다 — 거기는 **읽은
    스냅샷으로 계산해서 여러 행에 쓰기** 때문에 마지막 쓰기가 이기면 금액이 틀린다.
    그래서 그쪽에만 낙관적 잠금이 있다. 이 구분이 핵심이다.
*/
export async function upsertScore(matchId: string, squadLabel: string, score: number, userId?: string) {
  const { error } = await supabase.from('match_scores').upsert(
    {
      match_id: matchId,
      squad_label: squadLabel,
      score,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    },
    { onConflict: 'match_id,squad_label' }
  );
  if (error) throw error;
}
