import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

export type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];

export async function fetchAnnouncements(teamId: string): Promise<AnnouncementRow[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('team_id', teamId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CreateAnnouncementInput {
  teamId: string;
  authorId: string;
  title: string;
  body: string;
  isPinned: boolean;
}

export async function createAnnouncement(input: CreateAnnouncementInput) {
  const { error } = await supabase.from('announcements').insert({
    team_id: input.teamId,
    author_id: input.authorId,
    title: input.title,
    body: input.body,
    is_pinned: input.isPinned,
  });
  if (error) throw error;
}

export interface UpdateAnnouncementInput {
  title: string;
  body: string;
  isPinned: boolean;
}

export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput) {
  const { error } = await supabase
    .from('announcements')
    .update({
      title: input.title,
      body: input.body,
      is_pinned: input.isPinned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
