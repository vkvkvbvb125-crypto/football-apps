// src/features/attendance/utils/remindVote.ts — 참석 투표 독촉
//
// 홈과 일정, 두 화면이 같은 명단 시트를 그린다. 독촉 문구와 대상 계산이 화면마다
// 따로 있으면 같은 버튼이 화면마다 다른 말을 보낸다 — 한 곳에 둔다.

import { notifyTeam, type NotifyResult } from '../../notifications/services/pushService';

/** 아직 투표하지 않은 사람의 user_id. 행이 없는 것이 「미투표」다 */
export function notVotedUserIds(
  votes: { team_member_id: string }[],
  members: { id: string; userId: string }[]
): string[] {
  return members.filter((m) => !votes.some((v) => v.team_member_id === m.id)).map((m) => m.userId);
}

/**
 * 미투표자에게 독촉 알림을 보낸다.
 *
 * ⚠ **실패하면 던진다.** 부르는 쪽이 「전송됨」을 그리기 전에 결과를 알아야 한다.
 *   조용히 삼키면 안 갔는데 갔다고 보이고, 그건 이 자리에서 이미 한 번 난 일이다
 *   (버튼은 있는데 핸들러가 안 넘어와 undefined?.()로 조용히 넘어갔다).
 */
export async function remindVote(opts: {
  teamId: string;
  teamName: string;
  /** 경기 날짜(ISO). 문구에도 쓰고, 알림을 눌렀을 때 갈 곳으로도, 쿨다운 키로도 쓴다 */
  matchDate: string;
  toUserIds: string[];
  excludeUserId?: string;
}): Promise<NotifyResult> {
  /*
    ⚠ **결과를 돌려준다.** 전에는 void였다. 서버가 쿨다운으로 일부를 건너뛰면
      부르는 쪽이 그걸 알아야 「4명에게 보냈어요. 2명은 건너뛰었어요」를 말할 수 있다.
      안 돌려주면 막힌 것이 화면에 안 닿고, 그건 이 자리에서 이미 한 번 난 일이다.
  */
  if (opts.toUserIds.length === 0) return { sent: 0, skipped: 0, retryAfterMin: 0 };
  const dateLabel = new Date(opts.matchDate).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  });
  return await notifyTeam(
    opts.teamId,
    `${opts.teamName} 참석 투표 독촉`,
    `${dateLabel} 경기 참석 투표를 아직 안 하셨어요 — 지금 투표해주세요`,
    opts.excludeUserId,
    opts.toUserIds,
    'deadline',
    { matchDate: opts.matchDate }
  );
}
