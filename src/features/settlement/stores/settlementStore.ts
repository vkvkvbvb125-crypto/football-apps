// src/features/settlement/stores/settlementStore.ts
// 정산 데이터 레이어 — settlements/settlement_shares 스키마 기반 (20260727 마이그레이션).
import { create } from 'zustand';
import { supabase } from '../../../lib/supabase';
import { whereLabel } from '../utils';
import { liveSince } from '../../attendance/utils/matchWindow';
import { UserFacingError, toUserMessage } from '../../../lib/dbError';

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
  /**
   * **실제로 걷는 금액** = 면제가 아닌 몫의 합. `totalAmount`와 다를 수 있다.
   *
   * ⚠ **둘은 다른 사실이다.** `totalAmount`는 총무가 **입력한** 경기 비용이고,
   *   이건 **몫에 적힌 금액의 합**이다. 만든 뒤 사람이 빠지거나 면제가 붙으면
   *   갈린다.
   *
   * ⚠ 2026-09-19에 기기에서 갈린 것을 봤다. Demo FC의 9/10 정산:
   *
   *       total_amount 20,000 · per_person 10,000 · surplus 0
   *       → surplus = per_person × count − total 이므로 **2인으로 만들어졌다**
   *       그런데 settlement_shares에 **행이 하나뿐**이다(10,000원, Tester3)
   *
   *   화면은 「참석 1명 · 1인당 10,000원」 아래에 「20,000원」을 찍었다.
   *   1 × 10,000 ≠ 20,000인데 **아무도 안 본다** — 세 숫자가 서로 다른 출처라
   *   모순이 그냥 통과한다.
   *
   * 그래서 **화면의 큰 금액은 이 값**을 쓴다. 그러면 「N명 × 1인당 M원 = 이 금액」이
   * 늘 성립한다. `totalAmount`와 갈리면 **숨기지 않고 그 차이를 적는다** —
   * 총무가 알아야 할 사실이다(돈이 비었다).
   */
  sharesTotal: number;
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
  /** 제외가 도는 중인가 — 연타로 낡은 스냅샷이 두 번 계산되는 것을 막는다 */
  exempting: boolean;
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
  /* 면제는 안 걷는다 — 합에서 뺀다 */
  sharesTotal: (s.settlement_shares ?? [])
    .filter((r: any) => !r.exempt)
    .reduce((sum: number, r: any) => sum + (r.amount ?? 0), 0),
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
  exempting: false,
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

      const settledIds = new Set(mapped.map((s) => s.matchId));
      /*
        정산 미등록 = 끝난 경기 중 정산이 없는 것.

        「끝났다」의 경계가 match_date < now 였다. 경기운영·홈은 킥오프 3시간까지를
        「지금 다루는 경기」로 보는데 여기만 유예가 없어서, 그 3시간 동안 한 경기가
        두 화면에서 다르게 읽혔다:

          킥오프 10분 뒤 — 경기운영: 「운영 중」(타이머가 돈다)
                           정산:     「정산 미등록」(끝났으니 정산해라)

        끝났다는 지금 다루는 경기가 아니라는 뜻이다. 정의를 둘로 두지 않는다 —
        liveSince가 그 경계 하나를 낸다(matchWindow.ts).
      */
      const { data: finished } = await supabase
        .from('matches')
        .select('id, match_date, location, attendance_votes ( status )')
        .eq('team_id', teamId)
        .lt('match_date', liveSince().toISOString())
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
            /*
              ⚠ **여기서는 나간 사람의 투표를 빼지 않는다 — 그게 맞다.**
                이 목록은 위 쿼리에서 `match_date < liveSince()`로 **지난 경기만**
                골라 온 것이고, 지난 경기의 물음은 「누가 왔었나」다.
                `countableVotes`(utils/voting.ts)가 완료 경기에 대해 하는 판단과 같다 —
                예정 경기였다면 현재 멤버만 세야 한다. 여기에 그 필터를 넣지 마라.
            */
            attendCount: (m.attendance_votes ?? []).filter((v: any) => v.status === 'attend').length,
            daysSince: Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)),
          };
        });

      set({ current, past, pendingMatches, loaded: true });
    } catch (e: any) {
      set({ error: toUserMessage(e, {}, 'db'), loaded: true });
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
    /*
      여기 「due_date가 없으면 20260806 마이그레이션을 적용하라」는 갈래가 있었다.
      **걷어냈다.** 두 가지 이유다:
        · 프로덕션에 due_date가 이미 있다(2026-09-02에 읽기 전용 GET으로 확인했다 —
          settlements?select=due_date가 200, 없는 컬럼은 400).
        · 그 문장은 사용자가 아니라 **개발자에게 하는 말**이다. 총무 화면에 뜨면
          무슨 말인지 모른다. UserFacingError의 기준(막힌 이유 + 할 수 있는 일)에
          맞지 않는다 — 사용자가 마이그레이션을 적용할 수는 없다.
      스키마가 없는 환경은 toUserMessage의 42703/일반 갈래가 덮는다.
    */
    if (error) throw error;

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
    /*
      ⚠ **연타 가드. 낙관적 잠금보다 이게 먼저다.**

      제외 버튼에 in-flight 가드가 없어서, 총무 **한 명**이 빠르게 둘을 빼면
      두 번째가 첫 번째의 결과를 못 보고 **낡은 스냅샷으로 계산한다.**
      6명에서 둘을 빼면 4명인데 5명 기준 금액이 들어간다 —
      **총무가 하나뿐인 지금도 나는 고장이고, 오류 없이 조용히 틀린다.**

      ⚠ 그리고 이 가드가 없으면 **아래 잠금이 없던 오류를 만든다.**
        혼자 두 번 누른 것뿐인데 「다른 총무가 방금 바꿨어요」가 뜬다.
        잠금은 **남과의 경합**만 잡아야 한다 — 자기 자신과의 경합은 여기서 막는다.
      ⚠ finally로 푼다. 실패해도 안 풀면 그 화면에서 제외가 영영 안 된다.
    */
    if (get().exempting) return;
    set({ exempting: true });
    try {
      const target = get().current;
      if (!target || target.id !== settlementId) return;

      const share = target.shares.find((r) => r.id === shareId);
      if (!share) return;
      // 이미 확인된 입금을 되돌리면 걷은 금액과 장부가 어긋난다
      if (share.paid) throw new UserFacingError('이미 입금 확인된 사람은 제외할 수 없어요');

      const remaining = target.shares.filter((r) => r.id !== shareId);
      if (remaining.length === 0) throw new UserFacingError('마지막 한 명은 제외할 수 없어요');

      const { perPerson, surplus } = splitAmount(target.totalAmount, remaining.length);

      /*
        ── 낙관적 잠금 ─────────────────────────────────────────────────

        이 함수는 **읽은 스냅샷으로 계산해서 여러 행에 쓴다** — 화면의 shares를 세어
        1인당을 구하고, 남은 전원의 amount와 정산의 per_person을 덮는다.
        총무가 둘일 때 각자 다른 사람을 빼면 둘 다 자기 스냅샷으로 계산한다:

            6명 → A가 하나 빼서 5명 기준으로 씀
                 B도 (5명인 줄 모르고) 5명 기준으로 씀
            실제로는 4명인데 5명 기준 금액이 전원에게 덮인다

        ⚠ **화면이 낡는 게 아니라 데이터가 틀린다.** 총액과 (1인당 × 인원)이 안 맞는데
          숫자가 그럴듯하고 오류도 안 뜨고 누가 덮었는지 흔적도 없다. 조용히 틀린다.

        그래서 **내가 읽은 per_person일 때만** 갱신한다. 0행이면 그 사이 누가 바꾼 것이다.

        ⚠ **이 갱신이 첫 쓰기다(문지기).** 삭제를 먼저 하면 잠금에 걸렸을 때 이미
          지워진 뒤라 되돌릴 수 없다.
        ⚠ **대신 원자적이지 않다.** 여기가 성공하고 아래 삭제가 실패하면 정산의 per_person만
          앞서 간다. 지금 구조로는 세 쓰기를 한 트랜잭션에 묶을 수 없다 —
          제대로 고치려면 postgres 함수(RPC) 하나로 내려야 한다.
          총무가 둘인 팀이 생기고 이 자리가 실제로 아프면 그때 옮긴다.
      */
      /*
      ⚠ **이 잠금의 한계: 총액이 0이면 아무것도 안 잡는다.**
        per_person이 늘 0이라 `.eq('per_person', 0)`이 언제나 통과한다.
        「값」으로 잠그기 때문이고, 「그 값을 만든 재료」(남은 인원)로 잠그려면
        settlements에 인원수나 버전 컬럼이 필요한데 지금 없다.

        그대로 두는 근거: **총액 0이면 나눌 금액이 없어 제외가 금액을 안 바꾼다.**
        경합이 나도 틀릴 값이 없다. 컬럼을 하나 늘릴 값어치가 없다.
        총액이 0이 아닌 정산에서 인원이 줄면 1인당은 반드시 오르므로 거기서는 잡힌다.
    */
    const { data: locked, error: lockError } = await supabase
        .from('settlements')
        .update({ per_person: perPerson, surplus })
        .eq('id', settlementId)
        .eq('per_person', target.perPerson)
        .select('id');
      if (lockError) throw lockError;
      if (!locked || locked.length === 0) {
      /*
        ⚠ **막힌 사람에게 손으로 할 일을 더 시키지 않는다.**
          처음엔 「「현황 새로고침」을 누르고 다시 해주세요」였다. 그 버튼이 실재하긴
          하지만, 막힌 쪽은 이미 한 번 헛수고한 사람이다 — 낡은 것을 **여기서 바로**
          다시 읽고, 남은 할 일은 「다시 해주세요」 하나로 줄인다.
        ⚠ **다시 읽는 것은 화면이 한다.** 스토어의 load는 teamId·membershipId를 받는데
          여기엔 그 값이 없다 — 억지로 끌어오면 스토어가 팀 상태에 의존하게 된다.
          부르는 쪽(SettlementScreen)이 이미 reloadSettlements를 들고 있고,
          23505도 같은 모양으로 처리한다.
        ⚠ 한 줄로 던진다 — usererror.check가 `UserFacingError('…')` 한 줄 꼴을 찾는다.
      */
      throw new UserFacingError('다른 총무가 방금 금액을 바꿨어요. 금액을 새로 불러왔어요 — 다시 해주세요');
      }

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
    } finally {
      set({ exempting: false });
    }
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
