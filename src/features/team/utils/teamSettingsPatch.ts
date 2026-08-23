// src/features/team/utils/teamSettingsPatch.ts
// 팀 설정 저장 payload를 만드는 순수 로직. supabase를 안 물어서 그대로 테스트된다.
// scripts/settingswipe.check.ts가 여기를 검사한다.
import type { Database, FeeMode } from '../../../types/database';

type Insert = Database['public']['Tables']['team_settings']['Insert'];

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

/** DB는 "20:00:00", 폼은 "20:00" — 비교 전에 맞춰둔다 */
export const hhmm = (t: string | null) => t?.slice(0, 5) ?? null;

/** 배열은 참조가 아니라 내용으로 비교한다 (요일) */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/**
 * 폼의 현재 값에서 실제로 바뀐 칸만 골라낸다.
 * base가 null이면(아직 설정 안 한 팀) 전부 — 덮어쓸 값이 없다.
 */
export function diffSettings(
  next: Partial<Omit<TeamSettings, 'teamId'>>,
  base: TeamSettings | null
): Partial<Omit<TeamSettings, 'teamId'>> {
  if (!base) return next;
  return Object.fromEntries(
    Object.entries(next).filter(([k, v]) => !same(v, (base as unknown as Record<string, unknown>)[k]))
  );
}

/** upsert에 실제로 실릴 payload. 여기 없는 칸은 DB 값이 그대로 남는다. */
export function settingsToRow(teamId: string, patch: Partial<Omit<TeamSettings, 'teamId'>>): Insert {
  const row: Insert = { team_id: teamId };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const column = COLUMN[key as keyof typeof COLUMN];
    if (column) (row as Record<string, unknown>)[column] = value;
  }
  return row;
}

