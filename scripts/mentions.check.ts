// scripts/mentions.check.ts — 멘션 파서 검증
//
//   node --experimental-strip-types scripts/mentions.check.ts
//
// 이 저장소에는 테스트 러너가 없다. 파서는 눈으로 보기 어려운 종류의 코드라
// (커서 위치, 마커 경계, 이름 속 특수문자) 자동 검사가 없으면 조용히 틀린다.
import assert from 'node:assert/strict';
import {
  EVERYONE,
  activeQuery,
  insertMention,
  mentionedIds,
  parse,
  toPlainText,
} from '../src/lib/mentions.ts';

// ── parse ──────────────────────────────────────────────
assert.deepEqual(
  parse('오늘 @[김범준](u-1) 골키퍼 부탁해요'),
  [
    { kind: 'text', text: '오늘 ' },
    { kind: 'mention', id: 'u-1', name: '김범준' },
    { kind: 'text', text: ' 골키퍼 부탁해요' },
  ],
  '마커 하나가 텍스트/멘션/텍스트로 쪼개져야 한다'
);

assert.deepEqual(
  parse('마커 없는 옛 글'),
  [{ kind: 'text', text: '마커 없는 옛 글' }],
  '마커가 없으면 텍스트 한 조각이다'
);

assert.deepEqual(
  parse('@[김 범준](u-2)님'),
  [
    { kind: 'mention', id: 'u-2', name: '김 범준' },
    { kind: 'text', text: '님' },
  ],
  '이름에 공백이 있어도 경계가 맞아야 한다'
);

assert.deepEqual(
  parse('@[everyone](all) 확인'),
  [
    { kind: 'mention', id: EVERYONE, name: 'everyone' },
    { kind: 'text', text: ' 확인' },
  ],
  'everyone도 같은 형식으로 읽힌다'
);

// 대괄호가 이름에 들어가면 마커로 오인될 수 있다 — 마커가 아니면 평문으로 남아야 한다
assert.deepEqual(
  parse('대괄호 [그냥] 텍스트'),
  [{ kind: 'text', text: '대괄호 [그냥] 텍스트' }],
  '@ 없는 대괄호는 멘션이 아니다'
);

// ── toPlainText ────────────────────────────────────────
assert.equal(
  toPlainText('오늘 @[김범준](u-1) 골키퍼, @[everyone](all) 확인'),
  '오늘 @김범준 골키퍼, @everyone 확인',
  '푸시 본문에는 마커가 아니라 @이름이 들어가야 한다'
);
assert.equal(toPlainText('마커 없는 글'), '마커 없는 글');

// ── mentionedIds ───────────────────────────────────────
assert.deepEqual(
  mentionedIds('@[김범준](u-1) @[이철수](u-2) @[김범준](u-1)'),
  ['u-1', 'u-2'],
  '같은 사람을 두 번 세지 않는다'
);
assert.deepEqual(mentionedIds('아무도 안 부른 글'), []);

// ── activeQuery (커서 앞만 본다) ────────────────────────
assert.equal(activeQuery('안녕 @김', 5), '김', '커서 앞의 마지막 @토큰을 잡는다');
assert.equal(activeQuery('안녕 @', 4), '', '@만 쳤으면 빈 문자열 (후보 전체를 보여준다)');
assert.equal(activeQuery('안녕하세요', 5), null, '@가 없으면 null');
// 글 중간에 커서를 두고 확인 — 뒤쪽 @는 무시해야 한다
assert.equal(activeQuery('@김 뒤에 @이', 2), '김', '커서 뒤의 @는 보지 않는다');
// @ 뒤에 공백이 오면 토큰이 끝난 것이다
assert.equal(activeQuery('@김범준 님께', 8), null, '토큰이 공백으로 끝났으면 후보를 안 띄운다');

// ── insertMention ──────────────────────────────────────
{
  const r = insertMention('안녕 @김', 5, { id: 'u-1', name: '김범준' });
  assert.equal(r.text, '안녕 @[김범준](u-1) ', '커서 자리의 @토큰이 마커로 바뀐다');
  assert.equal(r.cursor, r.text.length, '커서가 마커 뒤로 간다');
}
{
  // 문자열 끝이 아니라 커서 자리에 끼워 넣는다
  const r = insertMention('@김 뒤 문장', 2, { id: 'u-1', name: '김범준' });
  assert.equal(r.text, '@[김범준](u-1)  뒤 문장', '뒤 문장이 살아 있어야 한다');
  assert.equal(r.cursor, '@[김범준](u-1) '.length);
}

console.log('mentions.check.ts: 모든 검사 통과');
