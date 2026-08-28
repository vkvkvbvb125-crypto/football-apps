import { create } from 'zustand';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import { toPlainText } from '../../../lib/mentions';
import {
  createAnnouncement as createAnnouncementRequest,
  deleteAnnouncement as deleteAnnouncementRequest,
  fetchAnnouncements,
  updateAnnouncement as updateAnnouncementRequest,
  type AnnouncementRow,
  markAnnouncementsRead,
  fetchAnnouncementReadCounts,
  fetchMyReadAnnouncementIds,
  type UpdateAnnouncementInput,
} from '../services/announcementsService';
import { toUserMessage } from '../../../lib/dbError';

interface AnnouncementsState {
  announcements: AnnouncementRow[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadAnnouncements: () => Promise<void>;
  createAnnouncement: (input: { title: string; body: string; isPinned: boolean }) => Promise<void>;
  updateAnnouncement: (id: string, input: UpdateAnnouncementInput) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  /** 공지별 읽은 사람 수 — 총무 화면의 "N명 읽음" */
  readCounts: Record<string, number>;
  /** 알림 패널에 공지가 보였다 → 읽음으로 남기고 집계를 다시 센다 */
  markRead: (announcements: AnnouncementRow[]) => Promise<void>;
  /** 내가 읽은 공지 id — 「안 읽은 공지가 있는가」의 재료다 */
  myReadIds: Set<string>;
  loadMyReads: () => Promise<void>;
}

export const useAnnouncementsStore = create<AnnouncementsState>((set, get) => ({
  announcements: [],
  readCounts: {},
  /**
   * 내가 읽은 공지 id.
   *
   * 이걸 안 들고 있으면 「안 읽은 공지가 있는가」를 못 센다. 팀 홈의 「공지사항」 버튼에
   * 붙는 붉은 점이 그 답을 쓴다 — 점만 붙이고 이 집합이 없으면 점이 영원히 켜져 있다.
   */
  myReadIds: new Set<string>(),

  loadMyReads: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    const ids = get().announcements.map((a) => a.id);
    if (!userId || ids.length === 0) return;
    try {
      set({ myReadIds: await fetchMyReadAnnouncementIds(userId, ids) });
    } catch {
      // 읽음 조회는 부가 정보다 — 실패하면 점을 안 띄우지 화면을 막지 않는다
    }
  },
  loaded: false,
  loading: false,
  error: null,
  markRead: async (announcements) => {
    const userId = useAuthStore.getState().session?.user.id;
    const activeTeam = useTeamStore.getState().activeTeam;
    const isAdmin = activeTeam?.role === 'admin';
    if (!userId || announcements.length === 0) return;
    try {
      await markAnnouncementsRead(announcements, userId, activeTeam?.membershipId ?? null);
      // 방금 읽은 것을 바로 반영한다 — 다시 조회하면 왕복이 한 번 더 든다
      set({ myReadIds: new Set([...get().myReadIds, ...announcements.map((a) => a.id)]) });
      // 집계는 총무만 본다 — 팀원 화면에서까지 매번 세어올 이유가 없다
      if (isAdmin) {
        const counts = await fetchAnnouncementReadCounts(announcements.map((a) => a.id));
        set({ readCounts: counts });
      }
    } catch {
      // 읽음 기록은 부가 정보다 — 실패해도 알림 화면이 막히면 안 된다
    }
  },

  loadAnnouncements: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    set({ loading: true, error: null });
    try {
      const announcements = await fetchAnnouncements(activeTeam.team.id);
      set({ announcements, loaded: true });
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'loadAnnouncements'), loaded: true });
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
      // toPlainText로 감싼다 — notify-team은 받은 문자열을 그대로 알림에 넣고 푸시로도 보내서,
      // 마커가 섞여 들어오면 잠금화면에 @[김범준](3f2a-…)가 그대로 뜬다
      notifyTeam(activeTeam.team.id, `${activeTeam.team.name} 공지사항`, toPlainText(input.title), myUserId, undefined, 'announcement').catch(() => {
        // 알림 전송 실패는 조용히 무시 (공지 작성 자체는 이미 성공)
      });
    } catch (err) {
      set({ error: toUserMessage(err, { '23505': '같은 공지가 이미 있어요' }, 'createAnnouncement'), loading: false });
    }
  },
  updateAnnouncement: async (id, input) => {
    set({ loading: true, error: null });
    try {
      await updateAnnouncementRequest(id, input);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'updateAnnouncement'), loading: false });
    }
  },
  deleteAnnouncement: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteAnnouncementRequest(id);
      await get().loadAnnouncements();
    } catch (err) {
      set({ error: toUserMessage(err, {}, 'deleteAnnouncement'), loading: false });
    }
  },
}));
