import { create } from 'zustand';
import { useAuthStore } from '../../auth/stores/authStore';
import {
  fetchNotifications,
  markAllNotificationsRead,
  deleteNotification,
  type NotificationRow,
} from '../services/notificationsService';

interface NotificationsState {
  notifications: NotificationRow[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  /** 알림 하나 삭제 — 실패하면 목록을 되돌린다 */
  remove: (id: string) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  loaded: false,
  loading: false,
  load: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    set({ loading: true });
    try {
      const notifications = await fetchNotifications(userId);
      set({ notifications, loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  remove: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    const before = get().notifications;
    // 먼저 지우고 보낸다 — 응답을 기다리면 밀어서 삭제한 항목이 잠깐 남아 있어 어색하다
    set({ notifications: before.filter((n) => n.id !== id) });
    try {
      await deleteNotification(id, userId);
    } catch (err) {
      set({ notifications: before }); // 실패하면 되살린다. 지운 척하고 넘어가면 안 된다
      throw err;
    }
  },

  markAllRead: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;
    const { notifications } = get();
    if (notifications.every((n) => n.is_read)) return;
    set({ notifications: notifications.map((n) => ({ ...n, is_read: true })) });
    try {
      await markAllNotificationsRead(userId);
    } catch {
      // 다음 로드 때 서버 상태로 다시 맞춰짐
    }
  },
}));
