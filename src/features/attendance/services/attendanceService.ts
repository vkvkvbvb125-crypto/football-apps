import { supabase } from '../../../lib/supabase';
import type { AttendanceStatus, Database } from '../../../types/database';

type MatchRow = Database['public']['Tables']['matches']['Row'];
type VoteRow = Database['public']['Tables']['attendance_votes']['Row'];

export interface MatchWithVotes extends MatchRow {
  votes: VoteRow[];
}

export async function fetchMatches(teamId: string): Promise<MatchWithVotes[]> {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('team_id', teamId)
    .order('match_date', { ascending: true });
  if (error) throw error;
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map((m) => m.id);
  const { data: votes, error: votesError } = await supabase
    .from('attendance_votes')
    .select('*')
    .in('match_id', matchIds);
  if (votesError) throw votesError;

  return matches.map((m) => ({
    ...m,
    votes: (votes ?? []).filter((v) => v.match_id === m.id),
  }));
}

export interface CreateMatchInput {
  teamId: string;
  matchDate: string;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeCategory: string | null;
  voteDeadline: string | null;
  quarterMinutes: number;
  createdBy: string;
}

export async function createMatch(input: CreateMatchInput) {
  const { error } = await supabase.from('matches').insert({
    team_id: input.teamId,
    match_date: input.matchDate,
    location: input.location || null,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    place_category: input.placeCategory,
    vote_deadline: input.voteDeadline,
    quarter_minutes: input.quarterMinutes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function castVote(matchId: string, teamMemberId: string, status: AttendanceStatus) {
  const { error } = await supabase
    .from('attendance_votes')
    .upsert({ match_id: matchId, team_member_id: teamMemberId, status }, { onConflict: 'match_id,team_member_id' });
  if (error) throw error;
}

export interface UpdateMatchInput {
  matchDate: string;
  location: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeCategory: string | null;
  voteDeadline: string | null;
  quarterMinutes: number;
}

export async function updateMatch(matchId: string, input: UpdateMatchInput) {
  const { error } = await supabase
    .from('matches')
    .update({
      match_date: input.matchDate,
      location: input.location || null,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      place_category: input.placeCategory,
      vote_deadline: input.voteDeadline,
      quarter_minutes: input.quarterMinutes,
    })
    .eq('id', matchId);
  if (error) throw error;
}

export async function deleteMatch(matchId: string) {
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) throw error;
}
