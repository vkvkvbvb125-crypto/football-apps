import { create } from 'zustand';
import { useAttendanceStore } from '../../attendance/stores/attendanceStore';
import { useTeamStore } from '../../team/stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  createSettlement as createSettlementRequest,
  fetchLatestAccount,
  fetchSettlements,
  togglePayment as togglePaymentRequest,
  type SettlementAccount,
  type SettlementWithPayments,
} from '../services/settlementService';

interface SettlementState {
  settlements: SettlementWithPayments[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  latestAccount: SettlementAccount | null;
  loadSettlements: () => Promise<void>;
  loadLatestAccount: () => Promise<void>;
  createSettlement: (
    matchId: string,
    totalAmount: number,
    account: SettlementAccount,
    memberIds?: string[]
  ) => Promise<void>;
  togglePayment: (paymentId: string, isPaid: boolean) => Promise<void>;
}

export const useSettlementStore = create<SettlementState>((set, get) => ({
  settlements: [],
  loaded: false,
  loading: false,
  error: null,
  latestAccount: null,
  loadSettlements: async () => {
    const matchIds = useAttendanceStore.getState().matches.map((m) => m.id);
    set({ loading: true, error: null });
    try {
      const settlements = await fetchSettlements(matchIds);
      set({ settlements, loaded: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '정산 내역을 불러오지 못했습니다.', loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  loadLatestAccount: async () => {
    const activeTeam = useTeamStore.getState().activeTeam;
    if (!activeTeam) return;
    try {
      const latestAccount = await fetchLatestAccount(activeTeam.team.id);
      set({ latestAccount });
    } catch {
      // 최근 계좌 조회 실패는 조용히 무시 (편의 기능이라 정산 등록 자체엔 영향 없음)
    }
  },
  createSettlement: async (matchId, totalAmount, account, memberIds) => {
    const activeTeam = useTeamStore.getState().activeTeam;
    const match = useAttendanceStore.getState().matches.find((m) => m.id === matchId);
    const attendeeIds =
      memberIds ?? (match?.votes ?? []).filter((v) => v.status === 'attend').map((v) => v.team_member_id);
    set({ loading: true, error: null });
    try {
      await createSettlementRequest(matchId, totalAmount, attendeeIds, account);
      await get().loadSettlements();

      if (activeTeam && match) {
        const perPerson = attendeeIds.length > 0 ? Math.ceil(totalAmount / attendeeIds.length) : 0;
        const dateLabel = new Date(match.match_date).toLocaleDateString('ko-KR', {
          month: 'long',
          day: 'numeric',
        });
        const myUserId = useAuthStore.getState().session?.user.id;
        notifyTeam(
          activeTeam.team.id,
          `${activeTeam.team.name} 정산 등록`,
          `${dateLabel} 정산이 등록됐어요 · 1인당 ${perPerson.toLocaleString()}원`,
          myUserId
        ).catch(() => {
          // 알림 전송 실패는 조용히 무시 (정산 등록 자체는 이미 성공)
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '정산 생성에 실패했습니다.', loading: false });
    }
  },
  togglePayment: async (paymentId, isPaid) => {
    const membershipId = useTeamStore.getState().activeTeam?.membershipId;
    if (!membershipId) return;
    try {
      await togglePaymentRequest(paymentId, isPaid, membershipId);
      await get().loadSettlements();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '입금 확인 처리에 실패했습니다.' });
    }
  },
}));
