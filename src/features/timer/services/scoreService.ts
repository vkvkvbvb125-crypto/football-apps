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
