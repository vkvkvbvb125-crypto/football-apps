/*
  팀에서 빠졌을 때 **껍데기 화면에 남지 않는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-19에 기기에서 쟀다. 총무가 강퇴하는 동안 그 사람이 홈을 보고 있으면:

      강퇴 직후        Demo FC 홈 그대로 (실시간 구독이 없다)
      탭 이동          그대로 — 캐시된 데이터
      당겨서 새로고침  ⚠ **껍데기** — 팀 이름이 사라지고 「예정된 경기가 없습니다 ·
                        진행중 0건 · 미납 0원」인데 **여전히 홈 탭 안**
      앱 재시작        TeamStart — 정상

  **새로고침한 사람은 「내 팀 데이터가 다 사라졌다」로 읽는다.** 아무 설명이 없다.

  ⚠ **강퇴만의 일이 아니다.** 팀 해체(마지막 멤버가 나감)도 같은 모양이고,
    사용자에게는 둘 다 **「이 팀에 더는 속하지 않음」** 하나다. 한 경로로 본다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ 판정이 `loadMembers`의 **성공 뒤**에 있다 — 실패(catch)에 붙이면 네트워크가
     끊겼을 때 「내보내졌어요」가 뜬다. 그게 더 나쁜 거짓말이다
  ⑵ 판정이 내 멤버십의 **부재**로 이뤄진다(`membershipId`가 members에 없다)
  ⑶ 빠졌으면 `activeTeam`을 비운다 — 안 비우면 껍데기가 그대로다
  ⑷ TeamStart가 안내를 그린다
  ⑸ 안내가 **강퇴인지 해체인지 단정하지 않는다** — 클라이언트는 알 수 없다
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (t: string) =>
  t
    .split('\r')
    .join('')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ── ⑴⑵⑶ 스토어가 한 자리에서 판정한다 ────────────────────────── */
{
  const store = strip(read('src/features/team/stores/teamStore.ts'));
  const fn = /loadMembers: async \(\) => \{[\s\S]*?\n  \},/.exec(store);
  assert.ok(fn, 'teamStore에 loadMembers가 없다 — 이름이 바뀌었으면 이 검사도 고쳐라');

  const body = fn[0];
  const guard = /if \(!members\.some\(\(m\) => m\.id === activeTeam\.membershipId\)\) \{/.exec(body);
  assert.ok(
    guard,
    `loadMembers가 「내가 멤버 목록에 없다」를 안 본다 — 강퇴·해체 뒤 껍데기 화면에 남는다`
  );

  /* 판정이 try 안, await 뒤에 있어야 한다 — catch에 있으면 실패에도 뜬다 */
  const catchAt = body.indexOf('} catch');
  assert.ok(catchAt > 0, 'loadMembers에 catch가 없다 — 이 검사도 고쳐라');
  assert.ok(
    (guard.index ?? 0) < catchAt,
    `「멤버가 아니다」 판정이 catch 안에 있다 — 네트워크가 끊겨도 「내보내졌어요」가 뜬다. ` +
      `조회가 **성공한 뒤에만** 판정해라`
  );

  const after = body.slice(guard.index ?? 0);
  assert.ok(
    /removedFromTeam: true/.test(after) && /activeTeam: null/.test(after),
    `빠진 것을 알고도 activeTeam을 안 비운다 — 껍데기 홈이 그대로 남는다`
  );
}

/* ── ⑷⑸ TeamStart가 이유를 말한다 ─────────────────────────────── */
{
  const raw = read('src/features/team/screens/TeamStartScreen.tsx');
  assert.ok(
    /\{removedFromTeam && \(/.test(strip(raw)),
    'TeamStart가 removedFromTeam 안내를 안 그린다 — 사용자는 왜 튕겨 나왔는지 모른다'
  );

  const msg = /<Text style=\{styles\.removedText\}>([\s\S]*?)<\/Text>/.exec(raw);
  assert.ok(msg, '안내 문구를 못 떴다 — 모양이 바뀌었으면 이 검사도 고쳐라');
  const text = msg[1].replace(/\s+/g, ' ').trim();

  assert.ok(
    /멤버가 아니에요|속하지 않/.test(text),
    `안내가 사실을 안 말한다. 지금 문구: «${text}»`
  );
  /*
    ⚠ 단정하면 틀린 쪽에는 거짓말이다 — 클라이언트는 강퇴인지 해체인지 못 가른다.
      둘을 **나란히** 적는 것(「…거나…」)은 괜찮고, 하나만 적는 것이 안 된다.
  */
  const saysKick = /내보냈|강퇴/.test(text);
  const saysDisband = /해체/.test(text);
  assert.ok(
    saysKick === saysDisband,
    `안내가 강퇴·해체 중 한쪽만 단정한다 — 클라이언트는 어느 쪽인지 알 수 없다. ` +
      `둘 다 적거나 둘 다 적지 마라. 지금 문구: «${text}»`
  );
}

console.log('removednotice ✓ 빠지면 팀 선택으로 보내고 이유를 말한다 · 실패와 구별한다');
