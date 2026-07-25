import { create } from 'zustand';
import { useAuthStore } from '../../auth/stores/authStore';
import {
  fetchNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from '../services/notificationsService';

interface NotificationsState {
  notifications: NotificationRow[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
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
