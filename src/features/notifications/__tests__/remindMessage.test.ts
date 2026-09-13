import { describe, expect, it } from 'vitest';
import { remindMessage, retryLabel } from '../remindMessage';

/*
  이 문구가 틀리면 **조용히** 틀린다. 「막혔다」를 안 말하면 총무는 보냈다고 믿고
  팀원에게는 아무것도 안 간다 — 「찌르기가 한 번도 안 감」과 같은 모양이다.
  그래서 「말한다」보다 「안 말하고 넘어가는 갈래가 없다」를 더 촘촘히 잡는다.
*/
describe('remindMessage — 네 갈래가 다 말을 한다', () => {
  it('전원에게 갔다', () => {
    expect(remindMessage({ sent: 6, skipped: 0, retryAfterMin: 0 })).toEqual({
      tone: 'ok',
      text: '6명에게 보냈어요',
    });
  });

  it('일부만 갔다 — 몇 명이 갔고 몇 명이 건너뛰었는지 둘 다 말한다', () => {
    expect(remindMessage({ sent: 4, skipped: 2, retryAfterMin: 170 })).toEqual({
      tone: 'partial',
      text: '4명에게 보냈어요. 2명은 방금 보내서 건너뛰었어요',
    });
  });

  it('전원이 막혔다 — 남은 시간을 말한다', () => {
    expect(remindMessage({ sent: 0, skipped: 6, retryAfterMin: 170 })).toEqual({
      tone: 'blocked',
      text: '이미 보냈어요. 약 3시간 뒤에 다시 보낼 수 있어요',
    });
  });

  it('아무도 없다 — 「보냈어요」라고 하지 않는다', () => {
    expect(remindMessage({ sent: 0, skipped: 0, retryAfterMin: 0 })).toEqual({
      tone: 'none',
      text: '보낼 사람이 없어요',
    });
  });

  /*
    ⚠ 어떤 결과에도 빈 문자열이 나오면 안 된다. 빈 문자열은 화면에서 「아무것도 안
      보임」이 되고, 그게 정확히 이 기능이 막으려는 상태다.
  */
  it('무슨 값이 와도 말이 비지 않는다', () => {
    for (const sent of [0, 1, 9]) {
      for (const skipped of [0, 1, 9]) {
        const m = remindMessage({ sent, skipped, retryAfterMin: 1 });
        expect(m.text.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('retryLabel — 남은 시간은 넘치게 말한다', () => {
  /*
    내림하면 「1시간 뒤」라고 해 놓고 61분이 남아 있다. 그때 눌러도 또 막혀서
    총무가 두 번 속는다. 올림이라야 그때 누르면 실제로 간다.
  */
  it('한 시간이 안 되면 분으로', () => {
    expect(retryLabel(1)).toBe('1분');
    expect(retryLabel(45)).toBe('45분');
    expect(retryLabel(59)).toBe('59분');
  });

  it('한 시간을 넘으면 올려서 시간으로', () => {
    expect(retryLabel(60)).toBe('약 1시간');
    expect(retryLabel(61)).toBe('약 2시간'); // 내림이면 「1시간」이라 또 막힌다
    expect(retryLabel(179)).toBe('약 3시간');
    expect(retryLabel(180)).toBe('약 3시간');
  });

  it('0이나 음수여도 「0분 뒤」라고 하지 않는다', () => {
    expect(retryLabel(0)).toBe('1분');
    expect(retryLabel(-5)).toBe('1분');
  });
});
