import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

type AssignmentRow = Database['public']['Tables']['team_assignments']['Row'];

export async function fetchAssignments(matchIds: string[]): Promise<AssignmentRow[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await supabase.from('team_assignments').select('*').in('match_id', matchIds);
  if (error) throw error;
  return data ?? [];
}

export async function saveAssignments(
  matchId: string,
  assignments: { teamMemberId: string; groupLabel: string }[]
) {
  const { error: deleteError } = await supabase.from('team_assignments').delete().eq('match_id', matchId);
  if (deleteError) throw deleteError;

  if (assignments.length > 0) {
    const { error } = await supabase
      .from('team_assignments')
      .insert(assignments.map((a) => ({ match_id: matchId, team_member_id: a.teamMemberId, group_label: a.groupLabel })));
    if (error) throw error;
  }
}

export async function updateAssignment(matchId: string, teamMemberId: string, groupLabel: string) {
  const { error } = await supabase
    .from('team_assignments')
    .upsert(
      { match_id: matchId, team_member_id: teamMemberId, group_label: groupLabel },
      { onConflict: 'match_id,team_member_id' }
    );
  if (error) throw error;
}

export function groupLabelsFor(teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, i) => String.fromCharCode(65 + i));
}
