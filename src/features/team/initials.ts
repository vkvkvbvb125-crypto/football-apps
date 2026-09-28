// src/features/team/initials.ts
// 아바타에 쓰는 이니셜.
//
// TeamHomeScreen 안에 있었는데 팀 홈 탭과 멤버 탭이 갈라지면서 둘 다 쓰게 됐다.
// 화면에서 export하면 자식이 부모를 import하게 되어 순환이 된다 — 그래서 따로 둔다.
//
// 세 글자 이상이면 성을 뗀다: 「김범준」 → 「범준」. 두 글자 이하는 그대로 —
// 「이수」에서 성을 떼면 「수」 한 글자만 남아 누구인지 알아보기 어렵다.
export function initialOf(name: string) {
  const n = name.trim();
  /*
    ⚠ **성을 떼는 것은 한글 이름 규칙이다.** 로마자에 그대로 적용하면
      「Reviewer」 → 「eviewer」가 된다 — **첫 글자를 잃고** 원형 칸도 넘쳐
      화면에는 「eview」로 잘려 보인다(2026-09-19 기기 실측).

    ⚠ 하필 **심사 계정 이름이 정확히 `Reviewer`**다. 야홍 6명은 한글 이름이라
      우리 눈에는 안 보이는데, Play 심사자는 첫 화면부터 본다.

    로마자는 이니셜의 본뜻대로 **첫 글자 한 자**를 쓴다. 한글 두 자와 폭이 비슷하다.
  */
  if (!/^[가-힣]/.test(n)) return n.slice(0, 1).toUpperCase() || '?';
  return n.length > 2 ? n.slice(1) : n;
}
