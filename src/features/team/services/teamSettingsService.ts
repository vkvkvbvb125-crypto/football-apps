// src/features/team/services/teamSettingsService.ts
// team_settings: 정기모임 기본값 / 회비 / 게스트 / 가입 승인. 팀당 한 행 (없으면 아직 설정 안 한 것).
import { supabase } from '../../../lib/supabase';
import type { Database } from '../../../types/database';
import { diffSettings, hhmm, settingsToRow, type TeamSettings } from '../utils/teamSettingsPatch';

export { diffSettings, hhmm, settingsToRow, type TeamSettings };

type Row = Database['public']['Tables']['team_settings']['Row'];

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

const COLUMN: Record<keyof Omit<TeamSettings, 'teamId'>, string> = {
  defaultWeekdays: 'default_weekdays',
  defaultTime: 'default_time',
  defaultVenueId: 'default_venue_id',
  defaultCapacity: 'default_capacity',
  feeMode: 'fee_mode',
  defaultFee: 'default_fee',
  bankName: 'bank_name',
  accountNo: 'account_no',
  accountHolder: 'account_holder',
  guestAllowed: 'guest_allowed',
  guestFee: 'guest_fee',
  joinApprovalRequired: 'join_approval_required',
};

/*
  ⚠ **동시 편집 — 마지막 쓰기가 이기는 것이 맞다. 재보고 정한 것이다(2026-09-14).**

  두 총무가 같은 값을 동시에 고치면 나중 쓰기가 앞의 것을 덮는다. 여기서는 그게 맞다:
    · 단일 컬럼 부분 갱신이라 **다른 칸이 같이 밀리지 않는다**
    · 덮이는 것이 「누군가의 뜻」이고, 나중 사람의 뜻이 더 최신이다
    · 틀린 값이 만들어지지 않는다 — 둘 중 하나가 그대로 남을 뿐이다

  실시간 구독을 붙일 자리가 아니다. 화면이 잠깐 낡을 뿐이고, 다음 로드에 맞춰진다.
  ⚠ 다른 판단이 필요한 자리는 settlementStore의 exemptShare다 — 거기는 **읽은
    스냅샷으로 계산해서 여러 행에 쓰기** 때문에 마지막 쓰기가 이기면 금액이 틀린다.
    그래서 그쪽에만 낙관적 잠금이 있다. 이 구분이 핵심이다.
*/
export async function upsertTeamSettings(teamId: string, patch: Partial<Omit<TeamSettings, 'teamId'>>) {
  const row = settingsToRow(teamId, patch);
  // team_id뿐이면 바뀐 게 없다 — 빈 upsert로 updated_at만 흔들 이유가 없다
  if (Object.keys(row).length === 1) return;

  const { error } = await supabase.from('team_settings').upsert(row);
  if (error) throw error;
}
