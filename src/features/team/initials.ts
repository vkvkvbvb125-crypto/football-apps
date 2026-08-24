// src/features/team/initials.ts
// 아바타에 쓰는 이니셜.
//
// TeamHomeScreen 안에 있었는데 팀 홈 탭과 멤버 탭이 갈라지면서 둘 다 쓰게 됐다.
// 화면에서 export하면 자식이 부모를 import하게 되어 순환이 된다 — 그래서 따로 둔다.
//
// 세 글자 이상이면 성을 뗀다: 「김범준」 → 「범준」. 두 글자 이하는 그대로 —
// 「이수」에서 성을 떼면 「수」 한 글자만 남아 누구인지 알아보기 어렵다.
export function initialOf(name: string) {
  return name.length > 2 ? name.slice(1) : name;
}
