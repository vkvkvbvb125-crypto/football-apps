// src/features/settings/services/accountService.ts — 계정 삭제
//
// 앱 안에서 탈퇴가 되어야 심사를 통과한다(App Store 5.1.1(v)). 「고객센터로 문의」는
// 안 된다.
//
// 판정은 여기서 하지 않는다. account_deletion_status()가 규칙을 갖고 있고 Edge
// Function도 같은 함수를 본다 — 화면이 따로 계산하면 화면은 된다고 하고 서버는
// 거절하는 상태가 생긴다. 여기서는 받아온 값을 문장으로 바꾸기만 한다.
import { supabase } from '../../../lib/supabase';
import type { DeletionStatus } from './accountBlockers';

export { describeBlockers } from './accountBlockers';
export type { AdminTeamStatus, DeletionStatus } from './accountBlockers';

export async function fetchDeletionStatus(): Promise<DeletionStatus> {
  const { data, error } = await supabase.rpc('account_deletion_status');
  if (error) throw error;
  return data as DeletionStatus;
}

/** 성공하면 세션이 죽는다 — 부른 쪽에서 로그아웃까지 해야 화면이 안 멈춘다 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
}
