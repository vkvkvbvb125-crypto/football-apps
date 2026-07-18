import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';

type SettlementRow = Database['public']['Tables']['settlements']['Row'];
type PaymentRow = Database['public']['Tables']['payments']['Row'];

export interface SettlementWithPayments extends SettlementRow {
  payments: PaymentRow[];
}

export async function fetchSettlements(matchIds: string[]): Promise<SettlementWithPayments[]> {
  if (matchIds.length === 0) return [];
  const { data: settlements, error } = await supabase.from('settlements').select('*').in('match_id', matchIds);
  if (error) throw error;
  if (!settlements || settlements.length === 0) return [];

  const settlementIds = settlements.map((s) => s.id);
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('*')
    .in('settlement_id', settlementIds);
  if (paymentsError) throw paymentsError;

  return settlements.map((s) => ({
    ...s,
    payments: (payments ?? []).filter((p) => p.settlement_id === s.id),
  }));
}

export interface SettlementAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export async function createSettlement(
  matchId: string,
  totalAmount: number,
  memberIds: string[],
  account: SettlementAccount
) {
  const perPerson = memberIds.length > 0 ? Math.ceil(totalAmount / memberIds.length) : 0;

  const { data: settlement, error } = await supabase
    .from('settlements')
    .insert({
      match_id: matchId,
      total_amount: totalAmount,
      per_person_amount: perPerson,
      bank_name: account.bankName,
      account_number: account.accountNumber,
      account_holder: account.accountHolder,
    })
    .select()
    .single();
  if (error) throw error;

  if (memberIds.length > 0) {
    const { error: paymentsError } = await supabase
      .from('payments')
      .insert(memberIds.map((teamMemberId) => ({ settlement_id: settlement.id, team_member_id: teamMemberId })));
    if (paymentsError) throw paymentsError;
  }

  return settlement;
}

export async function fetchLatestAccount(teamId: string): Promise<SettlementAccount | null> {
  const { data, error } = await supabase
    .from('settlements')
    .select('bank_name, account_number, account_holder, matches!inner(team_id)')
    .eq('matches.team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    bankName: data.bank_name,
    accountNumber: data.account_number,
    accountHolder: data.account_holder,
  };
}

export async function togglePayment(paymentId: string, isPaid: boolean, checkedBy: string) {
  const { error } = await supabase
    .from('payments')
    .update({
      is_paid: isPaid,
      checked_by: isPaid ? checkedBy : null,
      checked_at: isPaid ? new Date().toISOString() : null,
    })
    .eq('id', paymentId);
  if (error) throw error;
}
