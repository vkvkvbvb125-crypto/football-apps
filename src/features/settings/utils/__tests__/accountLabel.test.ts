import { describe, expect, it } from 'vitest';
import { accountLabel } from '../accountLabel';

/*
  이 함수가 생긴 이유가 시험의 핵심이다 — 합성 주소가 화면에 새어 나갔다.
  그래서 「진짜는 보여준다」보다 「가짜는 절대 안 보여준다」를 더 촘촘히 잡는다.
*/
describe('accountLabel', () => {
  it('진짜 이메일은 그대로 보여준다', () => {
    expect(accountLabel('vkvkvbvb125@gmail.com')).toBe('vkvkvbvb125@gmail.com');
  });

  it('애플 비공개 릴레이 주소도 진짜라 그대로 보여준다', () => {
    expect(accountLabel('abc123@privaterelay.appleid.com')).toBe('abc123@privaterelay.appleid.com');
  });

  it('카카오 합성 주소는 「카카오 계정」이 된다', () => {
    expect(accountLabel('kakao-3812345678@users.futsalclub.app')).toBe('카카오 계정');
  });

  it('네이버 합성 주소는 「네이버 계정」이 된다', () => {
    // 실제로 화면에 새어 나온 값이다 — 네이버 id에 밑줄과 대소문자가 섞인다
    expect(accountLabel('naver-027uiui_llhlcbffukzta1tsfiwfrgd@users.futsalclub.app')).toBe('네이버 계정');
  });

  it('모르는 접두사의 합성 주소는 아무것도 안 보여준다', () => {
    // 새 제공자가 붙었는데 여기 라벨을 안 넣은 경우. 그대로 띄우면 지금 고치는
    // 문제가 다시 난다 — 차라리 빈 줄이 낫다.
    expect(accountLabel('line-999@users.futsalclub.app')).toBe('');
  });

  it('접두사가 없는 합성 주소도 아무것도 안 보여준다', () => {
    expect(accountLabel('@users.futsalclub.app')).toBe('');
    expect(accountLabel('nodash@users.futsalclub.app')).toBe('');
  });

  it('빈 값에도 안 터진다', () => {
    expect(accountLabel(undefined)).toBe('');
    expect(accountLabel(null)).toBe('');
    expect(accountLabel('')).toBe('');
  });

  it('도메인이 이름 안에 들어 있을 뿐인 진짜 주소는 건드리지 않는다', () => {
    // endsWith로 보기 때문에 안전하지만, 붙들어 둔다
    expect(accountLabel('users.futsalclub.app@gmail.com')).toBe('users.futsalclub.app@gmail.com');
  });
});
