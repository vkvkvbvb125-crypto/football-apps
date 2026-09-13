// src/features/notifications/remindMessage.ts — 독촉을 보낸 뒤 총무에게 뭐라고 말하나
//
// ── 왜 순수 함수로 빼는가 ──────────────────────────────────────────
//
// 독촉 버튼이 두 화면에 있다(정산 상세, 명단 시트). 문구를 각자 짜면 같은 일이
// 화면마다 다르게 읽힌다 — 이 저장소에서 「글이 없다」를 두 화면이 다르게 말해
// boardempty.check로 묶은 것과 같은 자리다.
//
// 그리고 이 판단은 **틀리면 조용히 틀린다.** 「막혔다」를 안 말하면 총무는 보냈다고
// 믿는데 아무것도 안 간다. 눌러보는 것 말고 확인할 방법이 없으면 안 된다.
//
// ── ⚠ 이 기능의 본체는 막는 것이 아니라 막았다고 말하는 것이다 ────
//
// 쿨다운만 넣고 화면이 가만히 있으면 「눌렀는데 아무 일도 안 난다」가 된다.
// 그건 이 저장소가 이미 겪은 「찌르기가 한 번도 안 감」과 **같은 모양**이다 —
// 버튼은 있고, 눌리고, 아무것도 안 가고, 아무도 모른다.

import type { NotifyResult } from './services/pushService';

export type RemindTone = 'ok' | 'partial' | 'blocked' | 'none';

export interface RemindMessage {
  tone: RemindTone;
  text: string;
}

/**
 * 남은 시간을 사람 말로.
 *
 * ⚠ **올림이다.** 내림하면 「1시간 뒤」라고 해 놓고 61분이 남아 있어, 그때 눌러도
 *   또 막힌다. 두 번 속는 셈이라 넘치게 말하는 쪽이 맞다.
 */
export function retryLabel(minutes: number): string {
  const m = Math.max(1, Math.ceil(minutes));
  if (m < 60) return `${m}분`;
  return `약 ${Math.ceil(m / 60)}시간`;
}

/**
 * 보낸 결과 → 총무가 볼 한 줄.
 *
 * ⚠ **네 갈래를 다 적는다.** 「보냈다」만 말하고 나머지를 null로 두면 막힌 경우가
 *   조용해진다. 부르는 쪽이 빠뜨릴 수 없게 tone까지 함께 준다.
 */
export function remindMessage(r: NotifyResult): RemindMessage {
  if (r.sent > 0 && r.skipped === 0) {
    return { tone: 'ok', text: `${r.sent}명에게 보냈어요` };
  }
  if (r.sent > 0 && r.skipped > 0) {
    return {
      tone: 'partial',
      text: `${r.sent}명에게 보냈어요. ${r.skipped}명은 방금 보내서 건너뛰었어요`,
    };
  }
  if (r.sent === 0 && r.skipped > 0) {
    return {
      tone: 'blocked',
      text: `이미 보냈어요. ${retryLabel(r.retryAfterMin)} 뒤에 다시 보낼 수 있어요`,
    };
  }
  /*
    둘 다 0. 부르는 쪽이 대상 0명이면 아예 안 부르므로 여기 오면 서버가 전부 걸러낸
    것이다(알림 설정을 다 꺼둔 팀 등). 「보냈어요」라고 하면 거짓말이 된다.
  */
  return { tone: 'none', text: '보낼 사람이 없어요' };
}
