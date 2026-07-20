import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

export type PollRow = Database['public']['Tables']['polls']['Row'];
export type PollResponseRow = Database['public']['Tables']['poll_responses']['Row'];

export interface PollWithResponses extends PollRow {
  responses: PollResponseRow[];
}

export async function fetchPolls(teamId: string): Promise<PollWithResponses[]> {
  const { data: polls, error } = await supabase
    .from('polls')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!polls || polls.length === 0) return [];

  const pollIds = polls.map((p) => p.id);
  const { data: responses, error: responsesError } = await supabase
    .from('poll_responses')
    .select('*')
    .in('poll_id', pollIds);
  if (responsesError) throw responsesError;

  return polls.map((p) => ({
    ...p,
    responses: (responses ?? []).filter((r) => r.poll_id === p.id),
  }));
}

export interface CreatePollInput {
  teamId: string;
  authorId: string;
  question: string;
  options: string[];
  deadline: string | null;
}

export async function createPoll(input: CreatePollInput) {
  const { error } = await supabase.from('polls').insert({
    team_id: input.teamId,
    author_id: input.authorId,
    question: input.question,
    options: input.options,
    deadline: input.deadline,
  });
  if (error) throw error;
}

export async function deletePoll(id: string) {
  const { error } = await supabase.from('polls').delete().eq('id', id);
  if (error) throw error;
}

export async function castPollVote(pollId: string, teamMemberId: string, optionIndex: number) {
  const { error } = await supabase
    .from('poll_responses')
    .upsert(
      { poll_id: pollId, team_member_id: teamMemberId, option_index: optionIndex },
      { onConflict: 'poll_id,team_member_id' }
    );
  if (error) throw error;
}
