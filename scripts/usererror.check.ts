/*
  오류 문구가 화면에 어떻게 도달하는가 — **두 방향**을 다 본다.

  이 catch들에는 두 종류가 섞여 들어온다. 서비스가 사람 말로 던진 것과
  Postgres·Storage·Functions의 원문이다. 그래서 실패도 두 가지고, **성격이 반대다:**

    ① 사람 말이 덮인다   「마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를
                        임명해주세요」가 「잠시 후 다시 시도해주세요」가 된다 →
                        **영원히 안 되는 일을 다시 시도하라고 안내한다**
    ② 원문이 샌다        duplicate key value violates unique constraint
                        "matches_team_date_uniq" 가 그대로 뜬다 →
                        읽을 수 없고 테이블·제약 이름이 노출된다

  ⚠ **한쪽만 보는 단언은 다른 쪽을 통과시킨다.** 전부 덮으면 ②는 0이 되지만 ①이
    다섯 난다. 전부 그대로 두면 ①은 0이지만 ②가 샌다. 이 저장소에서 한쪽만 보는
    단언이 여러 번 새어나갔으므로 두 방향을 각각 단언한다.
*/
import { readFileSync } from 'node:fs';

const NL = String.fromCharCode(10);
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(p, 'utf8'));

// ── ⓪ 통로가 있는가 ──
const db = read('src/lib/dbError.ts');
ok(/export class UserFacingError extends Error/.test(db), 'UserFacingError 클래스가 없다');
/*
  통과 갈래가 **맨 앞**이어야 한다. 아래 switch는 code로 가르는데 사람 말은 code가
  없어서 default(GENERIC)로 떨어진다 — 순서가 밀리면 조용히 덮인다.
*/
const passAt = db.indexOf('if (err instanceof UserFacingError) return err.message;');
const switchAt = db.indexOf('switch (e.code)');
ok(passAt > 0, 'toUserMessage에 UserFacingError 통과 갈래가 없다');
ok(passAt < switchAt, '통과 갈래가 switch보다 뒤에 있다 — 사람 말이 GENERIC으로 덮인다');

// ── ① 사람 말이 화면까지 간다 ──
/*
  다섯 자리. 각각 「막힌 이유」와 「할 수 있는 일」을 담고 있어서 덮으면 손해가 크다.
  ⚠ 문장까지 확인한다. 클래스만 세면 문구를 「저장 실패」로 바꿔도 통과하는데,
    그건 GENERIC과 다를 바 없어서 이 클래스로 던질 이유가 없어진다.
*/
const HUMAN: [string, string][] = [
  ['src/features/settings/services/avatarService.ts', '사진 접근을 허용해야 바꿀 수 있어요'],
  ['src/features/settlement/stores/settlementStore.ts', '이미 입금 확인된 사람은 제외할 수 없어요'],
  ['src/features/settlement/stores/settlementStore.ts', '마지막 한 명은 제외할 수 없어요'],
  /* 낙관적 잠금에 걸렸을 때. 「막힌 이유」와 「할 수 있는 일」이 둘 다 들어 있어야 하는
     자리라 특히 덮이면 안 된다 — 총무는 자기가 무엇을 잘못했는지 알 방법이 없다.
     ⚠ 「현황 새로고침」은 **화면에 실제로 있는 버튼 이름**이다. 당겨서 새로고침은 없다
       (RefreshControl이 이 화면에 0곳) — 말이 가리키는 것이 실재해야 한다. */
  ['src/features/settlement/stores/settlementStore.ts', '다른 총무가 방금 금액을 바꿨어요. 「현황 새로고침」을 누르고 다시 해주세요'],
  ['src/features/team/stores/teamStore.ts', '마지막 총무는 팀을 나갈 수 없어요. 먼저 다른 총무를 임명해주세요.'],
];
for (const [f, msg] of HUMAN) {
  const src = read(f);
  ok(src.includes(`UserFacingError('${msg}')`),
     `${f.split('/').pop()}: 「${msg.slice(0, 20)}…」이 UserFacingError로 안 던져진다 — 화면에서 덮인다`);
}
/* 던지는 자리가 다섯이다. 여섯째가 생기면 이 목록에 넣어야 한다 */
const thrownCount = HUMAN.map(([f]) => f)
  .filter((f, i, a) => a.indexOf(f) === i)
  .reduce((n, f) => n + (read(f).match(/new UserFacingError\(/g) ?? []).length, 0);
ok(thrownCount === HUMAN.length,
   `UserFacingError를 던지는 자리가 ${thrownCount}곳인데 목록은 ${HUMAN.length}곳이다 — 새로 생긴 것을 목록에 넣어라`);

// ── ② 원문이 화면에 안 샌다 ──
/*
  일곱 자리. 「err.message를 화면 문구로 쓰는가」를 본다.
  ⚠ 부정 단언이라 변이로 확인했다. 한 곳이라도 되돌리면 잡힌다.
*/
const SCREENS = [
  'src/features/settings/screens/MySettingsScreen.tsx',
  'src/features/settings/screens/ProfileDetailScreen.tsx',
  'src/features/settlement/screens/SettlementScreen.tsx',
  'src/features/team/screens/TeamHomeScreen.tsx',
  'src/features/team/screens/TeamSettingsScreen.tsx',
];
const RAW = /(err|e)\s*(instanceof Error\s*\?\s*\1\.message|\?\.message\s*\?\?)/;
for (const f of SCREENS) {
  const src = read(f);
  const bad = src.split(NL).filter((ln) => RAW.test(ln) && !/console\./.test(ln));
  ok(bad.length === 0,
     `${f.split('/').pop()}: 오류 원문을 화면에 그대로 쓴다 — ${bad[0]?.trim().slice(0, 60)}`);
  ok(/toUserMessage\(/.test(src), `${f.split('/').pop()}: toUserMessage를 안 쓴다`);
}

// ── ③ 원문은 콘솔에 남는다 ──
/*
  덮되 버리지 않는다. [push]·[auth]와 같은 표지 방식이다 —
  남기지 않으면 「사용자도 모르고 우리도 모르는」 실패가 된다.
*/
ok(/console\.error\(`\[\$\{where\}\]`/.test(db),
   'toUserMessage가 원문을 콘솔에 안 남긴다 — 덮기만 하면 디버깅할 방법이 없다');
/* 그런데 사람 말은 남기지 않는다 — 오류가 아니라 의도한 안내라 소음이 된다 */
ok(passAt < db.indexOf('console.error'),
   '사람 말도 콘솔에 남는다 — 의도한 안내가 오류 로그를 채운다');

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(NL));
  process.exit(1);
}
console.log('usererror ok');
