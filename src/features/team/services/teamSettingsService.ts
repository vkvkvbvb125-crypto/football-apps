// src/features/team/services/teamSettingsService.ts
// team_settings: 정기모임 기본값 / 회비 / 게스트 / 가입 승인. 팀당 한 행 (없으면 아직 설정 안 한 것).
import { supabase } from '../../../lib/supabase';
import type { Database, FeeMode } from '../../../types/database';

type Row = Database['public']['Tables']['team_settings']['Row'];

export interface TeamSettings {
  teamId: string;
  defaultWeekdays: number[];
  defaultTime: string | null;
  defaultVenueId: string | null;
  defaultCapacity: number;
  feeMode: FeeMode;
  defaultFee: number | null;
  bankName: string | null;
  accountNo: string | null;
  accountHolder: string | null;
  guestAllowed: boolean;
  guestFee: number | null;
  joinApprovalRequired: boolean;
}

function mapRow(r: Row): TeamSettings {
  return {
    teamId: r.team_id,
    defaultWeekdays: r.default_weekdays,
    defaultTime: r.default_time,
    defaultVenueId: r.default_venue_id,
    defaultCapacity: r.default_capacity,
    feeMode: r.fee_mode,
    defaultFee: r.default_fee,
    bankName: r.bank_name,
    accountNo: r.account_no,
    accountHolder: r.account_holder,
    guestAllowed: r.guest_allowed,
    guestFee: r.guest_fee,
    joinApprovalRequired: r.join_approval_required,
  };
}

/** 아직 한 번도 설정 안 한 팀은 null — 화면에서 기본값으로 처리 */
export async function fetchTeamSettings(teamId: string): Promise<TeamSettings | null> {
  const { data, error } = await supabase.from('team_settings').select('*').eq('team_id', teamId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function upsertTeamSettings(teamId: string, patch: Partial<Omit<TeamSettings, 'teamId'>>) {
  const { error } = await supabase.from('team_settings').upsert({
    team_id: teamId,
    default_weekdays: patch.defaultWeekdays,
    default_time: patch.defaultTime,
    default_venue_id: patch.defaultVenueId,
    default_capacity: patch.defaultCapacity,
    fee_mode: patch.feeMode,
    default_fee: patch.defaultFee,
    bank_name: patch.bankName,
    account_no: patch.accountNo,
    account_holder: patch.accountHolder,
    guest_allowed: patch.guestAllowed,
    guest_fee: patch.guestFee,
    join_approval_required: patch.joinApprovalRequired,
  });
  if (error) throw error;
}
