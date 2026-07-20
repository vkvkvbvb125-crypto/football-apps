import { create } from 'zustand';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  createAnnouncement as createAnnouncementRequest,
  deleteAnnouncement as deleteAnnouncementRequest,
  fetchAnnouncements,
  updateAnnouncement as updateAnnouncementRequest,
  type AnnouncementRow,
  type UpdateAnnouncementInput,
} from '../services/announcementsService';

interface AnnouncementsState {
  announcements: AnnouncementRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadAnnouncements: () => Promise<void>;
  createAnnouncement: (input: { title: string; body: string; isPinned: boolean }) => Promise<void>;
  updateAnnouncement: (id: string, input: UpdateAnnouncementInput) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
}

export const useAnnouncementsStore = create<AnnouncementsState>((set, get) => ({
  announcements: [],
  loaded: false,
  loading: false,
  error: null,
  loadAnnouncements: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      const announcements = await fetchAnnouncements(activeTeam.team.id);
      set({ announcements, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항을 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  createAnnouncement: async (input) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      await createAnnouncementRequest({ ...input, teamId: activeTeam.team.id, authorId: activeTeam.membershipId });
      await get().loadAnnouncements();

      const myUserId = useAuthStore.getState().session?.user.id;
      notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 공지사항`, input.title, myUserId).catch(() => {
        // 알림 전송 실패는 조용히 무시 (공지 작성 자체는 이미 성공)
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 작성에 실패했습니다.', loading: false });
    }
  },
  updateAnnouncement: async (id, input) => {
    set({ loading: true, error: null });
    try {
      await updateAnnouncementRequest(id, input);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 수정에 실패했습니다.', loading: false });
    }
  },
  deleteAnnouncement: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteAnnouncementRequest(id);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '공지사항 삭제에 실패했습니다.', loading: false });
    }
  },
}));
