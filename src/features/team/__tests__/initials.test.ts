/*
  아바타 이니셜 규칙.

  ⚠ 2026-09-19에 기기에서 「Reviewer」의 아바타가 **「eview」**로 보였다.
    `name.length > 2 ? name.slice(1) : name`이 **한글 이름 규칙**(성을 뗀다)인데
    로마자에도 그대로 돌아 첫 글자를 떼고 칸을 넘쳤다.
    하필 Play 심사 계정 이름이 `Reviewer`다.

  ⚠ **`avatarLetterOf` 테스트를 2026-09-28에 지웠다.** 그 함수는 「겹침 줄」용이었는데
    **겹침 줄이 없어져 호출처가 이 테스트뿐**이었다 — 테스트가 죽은 코드를
    살아 있게 보이게 하고 있었다. 함수와 테스트를 같이 지웠다.
*/
import { describe, expect, it } from 'vitest';
import { initialOf } from '../initials';

describe('initialOf', () => {
  it('한글 세 글자 이상은 성을 뗀다', () => {
    expect(initialOf('김범준')).toBe('범준');
    expect(initialOf('남궁민수')).toBe('궁민수');
  });

  it('한글 두 글자는 그대로 둔다 — 떼면 한 글자만 남는다', () => {
    expect(initialOf('이수')).toBe('이수');
  });

  it('로마자는 첫 글자 한 자다 — slice(1)이면 첫 글자를 잃는다', () => {
    expect(initialOf('Reviewer')).toBe('R');
    expect(initialOf('Tester3')).toBe('T');
    expect(initialOf('jo')).toBe('J');
  });

  it('앞뒤 공백을 무시하고, 빈 이름은 물음표다', () => {
    expect(initialOf('  Reviewer  ')).toBe('R');
    expect(initialOf('   ')).toBe('?');
  });
});
