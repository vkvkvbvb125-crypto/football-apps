/*
  세 화면의 카드 간격이 서로 다른 것은 의도다 — 통일하는 변이를 잡는다.

  「하지 않기로 한 판단」의 네 번째다. 앞의 셋:
    · attendance_votes에 DELETE 정책을 안 넣는다 (취소가 삭제가 아니라 undecided다)
    · matches_update_admin에 with check를 안 넣는다 (방향은 정책으로 못 막는다)
    · 총무의 completed → open을 안 막는다 (UI에 되돌릴 길이 없어서)

  이런 항목은 「없는 것」이라 코드에 자국이 안 남는다. 다음 사람이 보면
  빠뜨린 것처럼 보이고, 좋은 뜻으로 고치려 든다. 그래서 동작으로 붙든다.

  여기서 지키는 것은 값 자체가 아니라 **셋이 서로 다르다는 사실**이다:

    홈    gap 16   카드 넷, 종류가 뚜렷이 다르다        안팎 비 1.25
    정산  gap 12   카드 수가 둘 사이                    안팎 비 1.67
    팀    gap 10   카드 여덟이 이어진다 (상자 목록 위험) 안팎 비 2.00

  팀의 2.0은 6248817에 근거가 적혀 있고, 그 커밋이 HomeScreen을 의식적으로
  안 건드렸다. 홈의 16은 0a9cbb3에서 14 → 16으로 올린 값이다.
  정산의 12만 근거가 없다(6d7d639에 딸려 왔다) — 그 사실도 주석에 적혀 있다.
*/
import { readFileSync } from 'node:fs';

const SCREENS: Array<[string, string, string, number]> = [
  ['홈',   'src/features/home/screens/HomeScreen.tsx',            'content', 16],
  ['정산', 'src/features/settlement/screens/SettlementScreen.tsx', 'list',    12],
  ['팀',   'src/features/team/components/TeamHomeTab.tsx',         'content', 10],
];

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const found = new Map<string, number>();
for (const [name, file, style, want] of SCREENS) {
  const src = readFileSync(file, 'utf8');
  /*
    스타일 한 줄을 통째로 집는다. `gap: 16`만 찾으면 화면 안의 다른 곳
    (아이콘 줄·칩 줄 등)이 걸린다 — 이 파일들에는 gap이 여럿 있다.
  */
  const line = src.split(String.fromCharCode(10)).find((l) => l.trim().startsWith(style + ': {'));
  if (!line) { fails.push(`${name}: ${style} 스타일을 못 찾았다`); continue; }
  const m = line.match(/gap: (\d+)/);
  if (!m) { fails.push(`${name}: ${style}에 gap이 없다`); continue; }
  const got = Number(m[1]);
  found.set(name, got);
  ok(got === want, `${name}의 gap이 ${got}이다 — ${want}여야 한다`);
}

// ── 핵심: 셋이 서로 달라야 한다 ──
//    값 셋을 각각 맞히는 단언만 두면, 셋을 같은 값으로 바꾸는 변이는
//    「세 번 실패」로 잡히긴 한다. 하지만 실패 메시지가 「16이어야 한다」라서
//    다음 사람이 그냥 값을 되돌리고 왜 다른지는 모른 채 지나간다.
//    「다르다는 것이 의도」를 따로 단언해야 그 뜻이 전해진다.
const vals = [...found.values()];
ok(new Set(vals).size === vals.length,
   `세 화면의 gap이 겹친다(${vals.join(', ')}) — 서로 다른 것이 의도다. ` +
   `팀 10은 카드 여덟이 「상자 목록」으로 읽히는 것을 막는 값이고(6248817), ` +
   `홈 16은 카드가 넷이라 그 위험이 없어서 그 커밋이 일부러 안 건드린 값이다. ` +
   `통일하려면 그 두 판단을 먼저 뒤집어야 한다.`);

// ── 근거가 주석으로 남아 있어야 한다 ──
//    값만 지키면 「왜 다른가」가 사라진다. 서로를 가리키는 문장이 있는지 본다.
const home = readFileSync(SCREENS[0][1], 'utf8');
const team = readFileSync(SCREENS[2][1], 'utf8');
const settle = readFileSync(SCREENS[1][1], 'utf8');
ok(home.includes('팀 화면의 10과'), '홈 주석이 팀을 안 가리킨다');
ok(team.includes('홈 화면의 16과'), '팀 주석이 홈을 안 가리킨다');
ok(settle.includes('근거 없이 흘러온 값'), '정산 주석에 근거 없음이 안 적혀 있다');

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join(String.fromCharCode(10)));
  process.exit(1);
}
