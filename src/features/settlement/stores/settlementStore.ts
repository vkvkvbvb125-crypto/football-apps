// src/features/settlement/stores/settlementStore.ts
// 정산 데이터 레이어 — settlements/settlement_shares 스키마 기반 (20260727 마이그레이션).
import { create } from 'zustand';
import { supabase } from '../../../lib/supabase';

export interface ShareRow {
  id: string;
  teamMemberId: string | null;
  guestName: string | null;
  name: string;
  amount: number;
  exempt: boolean;
  /** 멤버가 "입금했어요"를 눌렀는지 */
  markedPaid: boolean;
  /** 총무가 확인했는지 — 진행률·필터의 기준 */
  paid: boolean;
  isMe?: boolean;
}

export interface Settlement {
  id: string;
  matchId: string;
  totalAmount: number;
  perPerson: number;
  surplus: number;
  memo: string | null;
  bankName: string | null;
  accountNo: string | null;
  accountHolder: string | null;
  status: 'open' | 'done' | 'skipped';
  createdAt: string;
  shares: ShareRow[];
}

export interface PendingMatch {
  matchId: string;
  label: string;
  attendCount: number;
  daysSince: number;
}

interface State {
  /** 아직 정산이 없는 종료 경기 (미등록 카드용) */
  pendingMatches: PendingMatch[];
  current: Settlement | null;
  past: Settlement[];
  loading: boolean;
  loaded: boolean;
  error: string | null;

  load: (teamId: string, myMemberId: string) => Promise<void>;
  create: (input: {
    matchId: string;
    teamId: string;
    totalAmount: number;
    targets: { teamMemberId?: string; guestName?: string }[];
    exemptIds: string[];
    memo?: string;
    account: { bankName: string; accountNo: string; accountHolder: string };
    createdBy: string;
  }) => Promise<void>;
  skip: (matchId: string) => Promise<void>;
  /** 멤버: 입금했어요 */
  markPaid: (shareId: string, on: boolean) => Promise<void>;
  /** 총무: 입금 확인 (여러 명 한 번에) */
  confirmPaid: (shareIds: string[]) => Promise<void>;
  complete: (settlementId: string) => Promise<void>;
}

/** 10원 단위 올림 + 차액 */
export function splitAmount(total: number, count: number) {
  if (count <= 0) return { perPerson: 0, surplus: 0 };
  const perPerson = Math.ceil(total / count / 10) * 10;
  return { perPerson, surplus: perPerson * count - total };
}

const mapShare = (r: any, myMemberId: string): ShareRow => ({
  id: r.id,
  teamMemberId: r.team_member_id,
  guestName: r.guest_name,
  name: r.guest_name ?? r.team_members?.profiles?.nickname ?? '알 수 없음',
  amount: r.amount,
  exempt: r.exempt,
  markedPaid: !!r.marked_paid_at,
  paid: !!r.confirmed_at,
  isMe: r.team_member_id === myMemberId,
});

const mapSettlement = (s: any, myMemberId: string): Settlement => ({
  id: s.id,
  matchId: s.match_id,
  totalAmount: s.total_amount,
  perPerson: s.per_person,
  surplus: s.surplus,
  memo: s.memo,
  bankName: s.bank_name,
  accountNo: s.account_no,
  accountHolder: s.account_holder,
  status: s.status,
  createdAt: s.created_at,
  shares: (s.settlement_shares ?? []).map((r: any) => mapShare(r, myMemberId)),
});

const SELECT = `
  id, match_id, total_amount, per_person, surplus, memo,
  bank_name, account_no, account_holder, status, created_at,
  settlement_shares (
    id, team_member_id, guest_name, amount, exempt,
    marked_paid_at, confirmed_at,
    team_members ( profiles ( nickname ) )
  )
`;

export const useSettlementStore = create<State>((set, get) => ({
  pendingMatches: [],
  current: null,
  past: [],
  loading: false,
  loaded: false,
  error: null,

  async load(teamId, myMemberId) {
    set({ loading: true, error: null });
    try {
      const { data: settlements, error } = await supabase
        .from('settlements')
        .select(SELECT)
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const mapped = (settlements ?? []).map((s) => mapSettlement(s, myMemberId));
      const current = mapped.find((s) => s.status === 'open') ?? null;
      const past = mapped.filter((s) => s.status === 'done');

      // 정산이 없는 종료 경기 = 미등록 카드
      const settledIds = new Set(mapped.map((s) => s.matchId));
      const { data: finished } = await supabase
        .from('matches')
        .select('id, match_date, location, attendance_votes ( status )')
        .eq('team_id', teamId)
        .lt('match_date', new Date().toISOString())
        .order('match_date', { ascending: false })
        .limit(5);

      const pendingMatches: PendingMatch[] = (finished ?? [])
        .filter((m: any) => !settledIds.has(m.id))
        .map((m: any) => {
          const d = new Date(m.match_date);
          return {
            matchId: m.id,
            label: `${d.toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })}${m.location ? ` · ${m.location}` : ''}`,
            attendCount: (m.attendance_votes ?? []).filter((v: any) => v.status === 'attend').length,
            daysSince: Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)),
          };
        });

      set({ current, past, pendingMatches, loaded: true });
    } catch (e: any) {
      set({ error: e.message ?? '정산을 불러오지 못했어요', loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  async create(input) {
    const targets = input.targets.filter((t) => !t.teamMemberId || !input.exemptIds.includes(t.teamMemberId));
    const { perPerson, surplus } = splitAmount(input.totalAmount, targets.length);

    const { data: settlement, error } = await supabase
      .from('settlements')
      .insert({
        match_id: input.matchId,
        team_id: input.teamId,
        total_amount: input.totalAmount,
        per_person: perPerson,
        surplus,
        memo: input.memo ?? null,
        bank_name: input.account.bankName,
        account_no: input.account.accountNo,
        account_holder: input.account.accountHolder,
        created_by: input.createdBy,
      })
      .select('id')
      .single();
    if (error) throw error;

    const shares = targets.map((t) => ({
      settlement_id: settlement.id,
      team_member_id: t.teamMemberId ?? null,
      guest_name: t.guestName ?? null,
      amount: perPerson,
    }));
    const { error: shareError } = await supabase.from('settlement_shares').insert(shares);
    if (shareError) throw shareError;

    await get().load(input.teamId, input.createdBy);
  },

  async skip(matchId) {
    // pendingMatches는 정산 행이 아예 없는 경기라 update가 아니라 insert가 맞다
    // (update .eq('match_id', matchId)는 행이 없어 0건 적용되는 조용한 버그였다).
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('team_id')
      .eq('id', matchId)
      .single();
    if (matchError) throw matchError;

    const { error } = await supabase
      .from('settlements')
      .insert({ match_id: matchId, team_id: match.team_id, total_amount: 0, per_person: 0, status: 'skipped' });
    if (error) throw error;
    set((s) => ({ pendingMatches: s.pendingMatches.filter((m) => m.matchId !== matchId) }));
  },

  async markPaid(shareId, on) {
    const { error } = await supabase
      .from('settlement_shares')
      .update({ marked_paid_at: on ? new Date().toISOString() : null })
      .eq('id', shareId);
    if (error) throw error;
    set((s) =>
      s.current
        ? {
            current: {
              ...s.current,
              shares: s.current.shares.map((r) => (r.id === shareId ? { ...r, markedPaid: on } : r)),
            },
          }
        : {}
    );
  },

  async confirmPaid(shareIds) {
    if (shareIds.length === 0) return;
    const { error } = await supabase
      .from('settlement_shares')
      .update({ confirmed_at: new Date().toISOString() })
      .in('id', shareIds);
    if (error) throw error;
    set((s) =>
      s.current
        ? {
            current: {
              ...s.current,
              shares: s.current.shares.map((r) => (shareIds.includes(r.id) ? { ...r, paid: true } : r)),
            },
          }
        : {}
    );
  },

  async complete(settlementId) {
    const { error } = await supabase
      .from('settlements')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', settlementId);
    if (error) throw error;
    set((s) => ({
      current: null,
      past: s.current ? [{ ...s.current, status: 'done' }, ...s.past] : s.past,
    }));
  },
}));
