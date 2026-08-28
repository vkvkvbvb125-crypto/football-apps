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

/**
 * 공지를 읽었다고 남긴다.
 *
 * 작성자 본인은 넣지 않는다 — 자기 공지를 읽었다고 세면 "1명 읽음"이 항상 떠서
 * 총무가 팀원 반응을 가늠할 수 없다.
 *
 * upsert라 여러 번 불러도 한 줄이다(패널을 열 때마다 호출된다).
 */
export async function markAnnouncementsRead(
  announcements: AnnouncementRow[],
  userId: string,
  myMembershipId: string | null,
) {
  const rows = announcements
    // author_id는 team_members.id다. 예전엔 auth.users.id와 비교해서 영영 안 맞았고,
    // 그래서 작성자가 자기 공지를 늘 읽음으로 남겼다 — 막으려던 「1명 읽음」이 그대로 났다.
    // (프로덕션 읽음 기록 3건이 전부 이 경우였다.)
    // announcement_reads.user_id는 auth.users를 보므로 insert에는 userId를 그대로 쓴다.
    .filter((a) => a.author_id !== myMembershipId)
    .map((a) => ({ announcement_id: a.id, user_id: userId }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('announcement_reads')
    .upsert(rows, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * 내가 읽은 공지 id — 안 읽은 공지가 있는지 세려면 이게 있어야 한다.
 *
 * announcement_reads는 처음부터 있었는데 **읽는 쪽이 아무도 없었다.** 스토어가 든 것은
 * readCounts(공지별 읽은 사람 수 — 총무의 「N명 읽음」)뿐이라 「내가 읽었나」는 어디에도
 * 없었다. 그래서 팀 홈의 「공지사항」 버튼에 붉은 점을 붙이려면 이 조회가 먼저다.
 */
export async function fetchMyReadAnnouncementIds(userId: string, announcementIds: string[]) {
  if (announcementIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', userId)
    .in('announcement_id', announcementIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.announcement_id as string));
}

/** 공지별 읽은 사람 수 — 총무 화면의 "N명 읽음" */
export async function fetchAnnouncementReadCounts(announcementIds: string[]) {
  if (announcementIds.length === 0) return {} as Record<string, number>;
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .in('announcement_id', announcementIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.announcement_id] = (counts[row.announcement_id] ?? 0) + 1;
  }
  return counts;
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
