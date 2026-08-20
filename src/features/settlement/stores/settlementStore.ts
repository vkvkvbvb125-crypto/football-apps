// src/features/settlement/stores/settlementStore.ts
// 정산 데이터 레이어 — settlements/settlement_shares 스키마 기반 (20260727 마이그레이션).
import { create } from 'zustand';
import { supabase } from '../../../lib/supabase';
import { whereLabel } from '../utils';

export interface ShareRow {
  id: string;
  teamMemberId: string | null;
  guestName: string | null;
  name: string;
  amount: number;
  exempt: boolean;
  /** 멤버가 "입금했어요"를 눌렀는지 */
  markedPaid: boolean;
  /** 그 시각 — 완료 화면의 "보낸 시간"에 쓴다 */
  markedPaidAt: string | null;
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
  /** 납부 기한 — 총무가 정했을 때만 값이 있다 (20260806 마이그레이션) */
  dueDate: string | null;
  shares: ShareRow[];
}

/**
 * 아직 정산이 만들어지지 않은 종료 경기.
 *
 * 카드에서 진행중 정산과 나란히 놓이므로 필드 모양을 Settlement 쪽과 맞춰둔다
 * (title은 "8월 6일 경기", location은 따로) — 같은 카드가 둘 다 그릴 수 있어야 한다.
 */
export interface PendingMatch {
  matchId: string;
  /** ISO. 카드의 「경기 상세」가 일정 탭에서 이 날짜를 열려면 필요하다 */
  matchDate: string;
  title: string;
  /** "20:00 · 풋살몬스터" — 같은 날 경기가 둘일 때 카드를 구분하려면 시간이 있어야 한다 */
  where: string;
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
    /** yyyy-mm-dd. 총무가 "없음"을 고르면 null */
    dueDate?: string | null;
    account: { bankName: string; accountNo: string; accountHolder: string };
    createdBy: string;
  }) => Promise<void>;
  skip: (matchId: string) => Promise<void>;
  /**
   * 총무: 정산 상세 「상세 설정」 — 납부 기한·메모 수정.
   * 생성 화면(Reference)에는 이 항목이 없어서 만든 뒤에 여기서 정한다.
   */
  updateDetails: (settlementId: string, patch: { memo?: string | null; dueDate?: string | null }) => Promise<void>;
  /**
   * 총무: 정산 대상에서 제외(면제). 해당 share를 지우고 남은 인원으로 1인당 금액을 다시 나눈다.
   * 이미 입금 확인된 사람은 제외할 수 없다 — 받은 돈을 없던 일로 만들면 금액이 안 맞는다.
   */
  exemptShare: (settlementId: string, shareId: string) => Promise<void>;
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
  name: r.guest_name ?? r.team_members?.profiles?.display_name ?? '알 수 없음',
  amount: r.amount,
  exempt: r.exempt,
  markedPaid: !!r.marked_paid_at,
  markedPaidAt: r.marked_paid_at ?? null,
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
  dueDate: s.due_date ?? null,
  shares: (s.settlement_shares ?? []).map((r: any) => mapShare(r, myMemberId)),
});

// 컬럼을 하나하나 적으면 아직 마이그레이션 안 한 환경에서 그 컬럼 때문에 쿼리 전체가
// 400으로 죽는다(due_date로 실제로 겪었다). `*`는 있는 컬럼만 돌려주므로 안전하다.
const SELECT = `
  *,
  settlement_shares (
    id, team_member_id, guest_name, amount, exempt,
    marked_paid_at, confirmed_at,
    team_members ( profiles ( display_name ) )
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
            matchDate: m.match_date,
            // 진행중 카드의 settlementTitle()·settlementPlace()와 같은 표기 —
            // 나란히 놓였을 때 어긋나면 같은 경기인지 아닌지 알 수 없다
            title: `${d.getMonth() + 1}월 ${d.getDate()}일 경기`,
            where: whereLabel(m.match_date, m.location ?? null),
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
        // due_date는 20260806 마이그레이션에서 추가된 컬럼이다. 아직 적용 안 한 환경에서
        // null이라도 같이 보내면 "column not found"로 insert 전체가 죽어 정산을 만들 수조차 없다.
        // 값이 있을 때만 싣는다 — 없으면 어차피 null이라 결과가 같다.
        ...(input.dueDate ? { due_date: input.dueDate } : {}),
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

  async updateDetails(settlementId, patch) {
    // 보내지 않은 키는 건드리지 않는다 — memo만 고칠 때 dueDate가 null로 밀리면 안 된다
    const row: { memo?: string | null; due_date?: string | null } = {};
    if ('memo' in patch) row.memo = patch.memo ?? null;
    if ('dueDate' in patch) row.due_date = patch.dueDate ?? null;
    if (Object.keys(row).length === 0) return;

    const { error } = await supabase.from('settlements').update(row).eq('id', settlementId);
    if (error) {
      // due_date는 20260806 마이그레이션에서 추가된다 — 안 돌린 프로젝트에서는 여기서만 걸린다.
      // Postgres 원문 대신 무엇을 해야 하는지 알려준다.
      if ('due_date' in row && /due_date/.test(error.message)) {
        throw new Error('납부 기한을 쓰려면 20260806 마이그레이션을 먼저 적용해주세요');
      }
      throw error;
    }

    const apply = (s: Settlement): Settlement => ({
      ...s,
      memo: 'memo' in patch ? patch.memo ?? null : s.memo,
      dueDate: 'dueDate' in patch ? patch.dueDate ?? null : s.dueDate,
    });
    set((s) => ({
      current: s.current?.id === settlementId ? apply(s.current) : s.current,
      past: s.past.map((p) => (p.id === settlementId ? apply(p) : p)),
    }));
  },

  async exemptShare(settlementId, shareId) {
    const target = get().current;
    if (!target || target.id !== settlementId) return;

    const share = target.shares.find((r) => r.id === shareId);
    if (!share) return;
    // 이미 확인된 입금을 되돌리면 걷은 금액과 장부가 어긋난다
    if (share.paid) throw new Error('이미 입금 확인된 사람은 제외할 수 없어요');

    const remaining = target.shares.filter((r) => r.id !== shareId);
    if (remaining.length === 0) throw new Error('마지막 한 명은 제외할 수 없어요');

    const { perPerson, surplus } = splitAmount(target.totalAmount, remaining.length);

    const { error: delError } = await supabase.from('settlement_shares').delete().eq('id', shareId);
    if (delError) throw delError;

    // 남은 사람의 몫을 다시 나눈다 — 총액은 그대로이므로 1인당이 올라간다
    const { error: shareError } = await supabase
      .from('settlement_shares')
      .update({ amount: perPerson })
      .in(
        'id',
        remaining.map((r) => r.id)
      );
    if (shareError) throw shareError;

    const { error: sError } = await supabase
      .from('settlements')
      .update({ per_person: perPerson, surplus })
      .eq('id', settlementId);
    if (sError) throw sError;

    set((s) =>
      s.current?.id === settlementId
        ? {
            current: {
              ...s.current,
              perPerson,
              surplus,
              shares: remaining.map((r) => ({ ...r, amount: perPerson })),
            },
          }
        : {}
    );
  },

  async markPaid(shareId, on) {
    // 저장한 시각을 화면에도 그대로 써야 한다 — 여기서 새로 만들면 DB와 1초씩 어긋난다
    const at = on ? new Date().toISOString() : null;
    const { error } = await supabase.from('settlement_shares').update({ marked_paid_at: at }).eq('id', shareId);
    if (error) throw error;
    set((s) =>
      s.current
        ? {
            current: {
              ...s.current,
              shares: s.current.shares.map((r) =>
                r.id === shareId ? { ...r, markedPaid: on, markedPaidAt: at } : r
              ),
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
