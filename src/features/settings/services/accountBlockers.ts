// src/features/settings/services/accountBlockers.ts — 탈퇴 거부 사유를 문장으로
//
// accountService에서 떼어냈다. 거기는 supabase를 import하고, 그러면 react-native까지
// 딸려 와서 검사 스크립트가 이 함수를 부를 수 없다. 판정 자체는 서버가 하지만 분기가
// 넷이라(위임 / 미납 / 둘 다 / 이유 없음) 돌려볼 수 있어야 한다.
//
// 여기서 새로 판단하는 건 없다. 서버가 준 status를 읽어 순서와 문장만 정한다.

export interface AdminTeamStatus {
  team_id: string;
  team_name: string;
  members: number;
  other_admins: number;
  /** 총무가 아직 확인하지 않은 정산 건수. 막지 않고 안내만 한다 */
  unpaid_team: number;
  needs_handover: boolean;
}

export interface DeletionStatus {
  uid: string | null;
  can_delete: boolean;
  /** 인증 없이 불렸을 때만 온다 */
  reason?: string;
  unpaid_own?: number;
  admin_teams?: AdminTeamStatus[];
}

/**
 * 왜 못 지우는지를 사람 말로.
 *
 * 위임이 필요한 팀이 있으면 그쪽을 먼저 말한다 — 미납은 본인이 송금하면 끝나지만
 * 위임은 상대가 필요해서 더 오래 걸린다.
 */
export function describeBlockers(status: DeletionStatus): {
  message: string;
  /** 총무를 넘겨야 하는 팀이 있으면 그리로 보낸다. 없으면 보낼 화면이 없다 */
  handoverTeam: AdminTeamStatus | null;
} {
  const handover = (status.admin_teams ?? []).filter((t) => t.needs_handover);
  const lines: string[] = [];

  if (handover.length > 0) {
    const names = handover.map((t) => `「${t.team_name}」`).join(' · ');
    lines.push(`${names}의 총무가 회원님뿐이에요. 다른 팀원에게 총무를 넘겨야 탈퇴할 수 있어요.`);
    // 미정산은 막는 조건이 아니다. 다만 넘겨받을 사람이 무엇을 이어받는지는 알아야 한다.
    const unpaid = handover.reduce((n, t) => n + t.unpaid_team, 0);
    if (unpaid > 0) {
      lines.push(`미정산 ${unpaid}건이 남아 있어요 · 다음 총무가 이어받게 됩니다.`);
    }
  }

  if ((status.unpaid_own ?? 0) > 0) {
    lines.push(`아직 입금하지 않은 정산이 ${status.unpaid_own}건 있어요. 정리한 뒤 다시 시도해 주세요.`);
  }

  if (lines.length === 0) {
    // can_delete가 false인데 이유가 안 잡히는 경우 — no_auth가 여기로 온다.
    // 아무 말도 없으면 사용자는 앱이 고장 난 줄 안다.
    lines.push('지금은 탈퇴할 수 없어요. 다시 로그인한 뒤 시도해 주세요.');
  }

  return { message: lines.join('\n\n'), handoverTeam: handover[0] ?? null };
}
