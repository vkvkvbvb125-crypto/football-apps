// scripts/deleteaccount.check.ts — 계정 삭제 함수의 순서 불변식
//
// 여기서 잡는 건 값이 아니라 순서다. delete-account/index.ts는 「확인 → 판정 → 삭제」
// 순으로 되어 있고, 그 순서가 곧 안전장치다. 줄을 옮기거나 위쪽에 admin 호출을 하나
// 끼워 넣으면 검증 전에 지우는 코드가 되는데, 읽어서는 잘 안 보인다.
//
// 실행해서 잡을 수도 없다 — 실제로 계정을 지워야 확인되는 코드다. 그래서 소스를 본다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
const at = (needle: string, what: string) => {
  const i = src.indexOf(needle);
  assert.notEqual(i, -1, `못 찾음: ${what} (${needle})`);
  return i;
};

// ── 1. 사용자는 토큰에서만 나온다 ────────────────────────────────────
// 본문의 uid를 쓰면 남의 계정을 지울 수 있다.
{
  assert.ok(/Authorization'\)\?\.replace/.test(src), 'Authorization 헤더에서 토큰을 안 꺼낸다');
  assert.ok(src.includes('auth.getUser(jwt)'), '토큰을 검증하지 않는다');
  assert.ok(src.includes('deleteUser(user.id)'), '삭제 대상이 검증된 사용자(user.id)가 아니다');

  // req.json()에서 꺼낸 값이 삭제에 쓰이면 안 된다
  const body = src.match(/await req\.json\(\)/);
  if (body) {
    assert.ok(!/deleteUser\((?!user\.id)/.test(src), '본문에서 온 값으로 삭제한다');
  }
}

// ── 2. 판정 전에는 service_role을 쓰지 않는다 ────────────────────────
// 토큰 검증(auth.getUser)만 예외다. 그건 데이터 조작이 아니라 "누구인지"를 묻는 것이고,
// 이게 없으면 판정 자체를 시작할 수 없다.
{
  const gate = at('if (!status.can_delete)', '판정 게이트');
  const adminUses = [...src.matchAll(/ctx\.supabaseAdmin(\.\w+)*/g)];
  assert.ok(adminUses.length > 0, 'admin 클라이언트를 아예 안 쓴다 — 파일이 바뀌었다');

  const before = adminUses.filter((m) => m.index! < gate).map((m) => m[0]);
  const illegal = before.filter((u) => !u.startsWith('ctx.supabaseAdmin.auth.getUser'));
  assert.deepEqual(illegal, [],
    `판정(can_delete) 전에 service_role을 쓴다: ${illegal.join(', ')} — 검증 전에 지우는 코드가 된다`);

  assert.ok(at('deleteUser(user.id)', '삭제') > gate, '판정보다 삭제가 먼저 온다');
}

// ── 3. 판정 결과를 다시 계산하지 않는다 ──────────────────────────────
// 규칙이 두 벌이면 화면은 된다고 하고 서버는 거절한다. 함수가 준 can_delete만 본다.
{
  assert.ok(!/unpaid_own\s*[><=]/.test(src), '미납 건수를 여기서 다시 판단한다');
  assert.ok(!/needs_handover\s*(&&|\|\||===|!==)/.test(src), '위임 조건을 여기서 다시 판단한다');
  assert.ok(src.includes('status?.uid !== user.id'), '판정 대상과 검증한 사용자를 대조하지 않는다');
}

// ── 4. unlink가 삭제보다 먼저이고, 실패해도 삭제를 막지 않는다 ───────
// 계정을 먼저 지우면 profiles가 cascade로 사라져 kakao_id를 잃는다 — 시도조차 못 한다.
// 그리고 카카오 장애로 본인 탈퇴가 막히면 안 된다.
{
  const unlink = at('kapi.kakao.com/v1/user/unlink', 'unlink 호출');
  const del = at('deleteUser(user.id)', '삭제');
  assert.ok(unlink < del, 'unlink가 삭제보다 뒤에 있다 — 지운 뒤에는 kakao_id가 없다');

  // unlink 실패 처리와 삭제 사이에 return이 있으면 실패가 탈퇴를 막는 것이다
  const between = src.slice(unlink, del);
  // 줄머리만 보면 안 된다 — `if (!res.ok) return ...`처럼 한 줄로 쓰면 통과한다.
  // 변이 시험에서 실제로 그렇게 새어 나갔다. 위치를 가리지 않고 찾는다.
  assert.ok(!/return\s+Response\.json/.test(between),
    'unlink와 삭제 사이에 return이 있다 — 카카오 장애가 탈퇴를 막는다');
  // throw로 빠져나가도 같은 결과다
  assert.ok(!/\bthrow\b/.test(between),
    'unlink와 삭제 사이에 throw가 있다 — 카카오 장애가 탈퇴를 막는다');

  // 나중에 손으로 정리하려면 어느 계정인지 남아야 한다
  const logs = [...src.matchAll(/console\.error\(`delete-account: 카카오[^`]*`/g)].map((m) => m[0]);
  assert.ok(logs.length >= 2, '카카오 실패 로그가 2가지(실패·예외) 미만이다');
  for (const l of logs) {
    assert.ok(l.includes('${kakaoId}'), `실패 로그에 카카오 ID가 없다 — 수동 정리를 못 한다: ${l}`);
  }
}

// ── 5. anon key가 없으면 service_role로 대신 부르지 않는다 ───────────
// service_role로 부르면 auth.uid()가 null이 되고, 그때 판정은 「삭제해도 된다」가 된다.
{
  const anon = at('SUPABASE_ANON_KEY', 'anon key');
  assert.ok(/if \(!url \|\| !anonKey\)/.test(src), 'anon key가 없을 때 서지 않는다');
  const rpc = at('/rest/v1/rpc/account_deletion_status', '판정 RPC 호출');
  const call = src.slice(rpc - 400, rpc + 400);
  assert.ok(call.includes('apikey: anonKey'), '판정 RPC를 anon key로 안 부른다');
  assert.ok(!/apikey:\s*(serviceRole|.*SERVICE_ROLE)/.test(call), '판정 RPC를 service_role로 부른다');
  assert.ok(anon < rpc, 'anon key 확인이 RPC 호출보다 뒤에 있다');
}

console.log('deleteaccount ok');
