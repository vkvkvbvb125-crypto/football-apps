import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

export async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

/**
 * 알림 하나 삭제.
 *
 * user_id 조건을 클라이언트에서도 건다 — RLS가 막아주지만, 정책이 빠진 환경에서
 * 남의 알림을 지우는 요청이 나가지 않게 하는 두 번째 자물쇠다.
 */
export async function deleteNotification(id: string, userId: string) {
  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
  // RLS 정책이 없으면 오류 없이 0건이 지워진다 — 화면만 지워지고 새로고침하면 되살아난다
  if (count === 0) throw new Error('알림을 지우지 못했어요');
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}
