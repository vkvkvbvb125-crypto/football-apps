// scripts/announceread.check.ts — 공지 읽음 기록이 누구를 세는가
//
// announcements.author_id는 team_members.id고, announcement_reads.user_id는 auth.users.id다.
// 둘은 생김새가 같은 uuid라 잘못 비교해도 타입이 안 잡히고 화면도 안 깨진다 — 그냥
// 조용히 항상 참이 되어 작성자 본인이 걸러지지 않는다. 실제로 그랬고, 프로덕션 읽음
// 기록 3건이 전부 「작성자가 자기 공지를 읽음」이었다.
//
// 값이 아니라 무엇과 무엇을 비교하는지를 본다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

{
  const svc = read('src/features/announcements/services/announcementsService.ts');

  // 거르는 쪽은 멤버십 id와 비교해야 한다
  const filter = svc.match(/\.filter\(\(a\) => a\.author_id !== (\w+)\)/);
  assert.ok(filter, '작성자를 거르는 필터를 못 찾음');
  assert.equal(filter![1], 'myMembershipId',
    `author_id(team_members.id)를 ${filter![1]}과 비교한다 — 종류가 다르면 영영 안 맞는다`);

  // 넣는 쪽은 auth.users.id여야 한다 (announcement_reads.user_id가 auth.users를 본다)
  assert.ok(/user_id:\s*userId/.test(svc), 'announcement_reads.user_id에 auth 사용자 id를 안 넣는다');

  // 둘을 바꿔 쓰면 안 된다
  assert.ok(!/user_id:\s*myMembershipId/.test(svc), '읽음 기록에 멤버십 id를 넣는다');
  assert.ok(!/author_id !== userId/.test(svc), '작성자 비교가 다시 auth 사용자 id로 돌아갔다');
}

{
  // 호출부가 멤버십 id를 실제로 넘기는가 — 안 넘기면 위 검사는 통과하고도 안 돈다
  const store = read('src/features/announcements/stores/announcementsStore.ts');
  assert.ok(/markAnnouncementsRead\(announcements, userId, [^)]*membershipId/.test(store),
    '호출부가 멤버십 id를 안 넘긴다 — 필터가 항상 null과 비교한다');
}

console.log('announceread ok');
