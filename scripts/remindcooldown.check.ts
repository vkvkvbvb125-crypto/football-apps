/*
  독촉 알림의 쿨다운이 ⑴ 서버에서 걸리고 ⑵ 그 결과가 화면까지 닿는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  이 기능의 본체는 **막는 것이 아니라 막았다고 말하는 것**이다.
  쿨다운만 넣고 화면이 가만히 있으면 총무 눈에는 「눌렀는데 아무 일도 안 난다」가 되고,
  그건 이 저장소가 이미 겪은 「찌르기가 한 번도 안 감」과 **같은 모양**이다 —
  버튼은 있고, 눌리고, 아무것도 안 가고, 아무도 모른다.

  그래서 「막는다」보다 **「막힌 것이 화면에 닿는다」**를 더 촘촘히 잡는다.

  ── 이 검사가 못 보는 것 ───────────────────────────────────────────
  ⚠ **배포본이 이 소스와 같은지는 못 본다.** Edge Function은 따로 배포하고,
    저장소와 배포본이 갈리면 「안 먹는다」와 「아직 안 붙었다」가 같은 출력이 된다.
    실제로 2026-09-14에 그 자리에서 멈췄다 — 시험 전에 `functions download`로
    받아 대조하는 절차는 anchor.ts에 규칙으로 적었다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));

const FN = 'supabase/functions/notify-team/index.ts';
const PUSH = 'src/features/notifications/services/pushService.ts';
const MSG = 'src/features/notifications/remindMessage.ts';
const SETTLEMENT = 'src/features/settlement/screens/SettlementScreen.tsx';
const ROSTER = 'src/features/attendance/components/RosterSheet.tsx';

const fn = strip(read(FN));

// ── ① 쿨다운을 안 보고 보내면 실패 ─────────────────────────────────
{
  assert.ok(
    /from\('notify_cooldown'\)[\s\S]{0,400}\.select\(/.test(fn),
    'notify-team이 notify_cooldown을 읽지 않는다 — 읽지 않으면 막을 수가 없다'
  );
  assert.ok(
    /from\('notify_cooldown'\)[\s\S]{0,400}\.upsert\(/.test(fn),
    'notify-team이 notify_cooldown에 기록하지 않는다 — 기록이 없으면 다음 번에 또 간다'
  );

  /*
    ⚠ **읽기가 보내기보다 앞에 와야 한다.** 뒤에 있으면 이미 보낸 뒤라 아무것도 안 막는다.
      「호출이 있다」만 보면 순서가 뒤집혀도 통과한다 — 자리까지 본다.
  */
  const readAt = fn.indexOf('.select(');
  const insertAt = fn.indexOf("from('notifications')");
  assert.ok(readAt > 0 && insertAt > 0, '검사의 앵커를 못 찾았다 — 함수 모양이 바뀌었으면 이 검사도 고쳐라');
  assert.ok(
    fn.indexOf("from('notify_cooldown')") < insertAt,
    '쿨다운 조회가 알림 삽입보다 뒤에 있다 — 이미 보낸 뒤라 아무것도 못 막는다'
  );

  /*
    ⚠ **기록은 보낸 뒤다.** 먼저 적고 실패하면 안 갔는데 막힌다 —
      총무 눈에는 「보냈다」이고 팀원에게는 아무것도 안 가서, 되돌릴 방법도 알아챌
      방법도 없다. 이 저장소가 여러 번 본 「조용히 안 감」의 반대편이다.
  */
  const upsertAt = fn.indexOf('.upsert(');
  assert.ok(
    insertAt < upsertAt,
    '쿨다운 기록이 알림 삽입보다 앞에 있다 — 안 갔는데 막히는 상태를 만든다'
  );

  /* 독촉이 아닌 것에는 걸지 않는다 — 공지·언급·댓글을 막으면 일어난 일을 못 알린다 */
  const table = fn.slice(fn.indexOf('COOLDOWN_MINUTES'), fn.indexOf('COOLDOWN_MINUTES') + 260);
  for (const banned of ['announcement', 'mention', 'comment']) {
    assert.ok(
      !new RegExp('\\b' + banned + '\\s*:').test(table),
      `COOLDOWN_MINUTES에 ${banned}가 있다 — 독촉이 아니라 사건 알림이라 막으면 안 된다`
    );
  }
  for (const needed of ['settlement', 'deadline']) {
    assert.ok(
      new RegExp('\\b' + needed + '\\s*:').test(table),
      `COOLDOWN_MINUTES에 ${needed}가 없다 — 한쪽만 막으면 반쪽이다`
    );
  }
}

// ── ② 차단 결과가 화면에 안 닿으면 실패 ────────────────────────────
//    이 검사의 이유 전부다. 막는 것보다 말하는 것이 본체다.
{
  const push = strip(read(PUSH));
  assert.ok(
    /const \{ data, error \}/.test(push),
    'notifyTeam이 data를 안 읽는다 — 서버가 막아도 화면은 아무것도 모른다'
  );
  assert.ok(
    /skipped/.test(push) && /retryAfterMin/.test(push),
    'notifyTeam이 skipped·retryAfterMin을 안 돌려준다'
  );

  const msg = strip(read(MSG));
  for (const tone of ['ok', 'partial', 'blocked', 'none']) {
    assert.ok(
      new RegExp(`'${tone}'`).test(msg),
      `remindMessage에 '${tone}' 갈래가 없다 — 빠진 갈래는 화면에서 침묵이 된다`
    );
  }

  /*
    두 화면이 결과를 **받아서 그린다.** 이름만 부르고 버리면 안 되므로
    「remindMessage를 부른다」와 「그 값을 그리는 자리가 있다」를 둘 다 본다.
  */
  for (const [file, noteVar] of [
    [SETTLEMENT, 'remindNote'],
    [ROSTER, 'pokeNote'],
  ] as const) {
    const src = strip(read(file));
    assert.ok(
      /remindMessage\(/.test(src),
      `${file}이 remindMessage를 안 쓴다 — 결과를 말로 옮기는 자리가 없다`
    );
    assert.ok(
      new RegExp(`\\{${noteVar}\\.text\\}`).test(src),
      `${file}이 ${noteVar}.text를 그리지 않는다 — 값은 있는데 화면에 안 닿는다`
    );
    /* 삼키면 안 된다. 이 두 화면에서 결과를 버리는 catch가 있으면 침묵이 돌아온다 */
    assert.ok(
      !/notifyTeam\([\s\S]{0,600}?\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(src),
      `${file}에 결과를 버리는 .catch(() => {})가 있다 — 실패가 조용해진다`
    );
  }
}

// ── ③ 전체가 개별을 막고, 개별이 전체를 안 막는 비대칭 ─────────────
{
  /*
    키가 (team_id, kind, target_key, user_id)라는 것이 이 비대칭의 전부다.
    수신자별이라 A에게 개별로 보내도 B·C·D는 그대로 간다.
    대상만으로 잡으면 **막힌 한 명 때문에 전체가 막힌다** — 이 기능이 낼 수 있는 최악이다.
  */
  const sql = read('supabase/migrations/20260911_notify_cooldown.sql');
  assert.ok(
    /primary key \(team_id, kind, target_key, user_id\)/.test(sql),
    '쿨다운 키에 user_id가 없다 — 한 명을 막으면 전체가 막힌다'
  );
  assert.ok(
    !/sender|by_user|admin_id/.test(sql),
    '쿨다운 키에 보낸 사람이 들어갔다 — 총무 둘이 각각 보내 두 배가 된다'
  );

  /* 조회할 때 수신자로 좁히지 않으면 위 키가 있어도 전체가 막힌다 */
  assert.ok(
    /\.in\('user_id', userIds\)/.test(fn),
    'notify-team이 쿨다운을 수신자로 좁혀 조회하지 않는다 — 한 명 때문에 전체가 막힌다'
  );

  /*
    ⚠ 전체 독촉이 **일부만 갔을 때** 전체를 「보냈어요」로 덮으면 안 된다.
      남은 사람이 아직 못 받았는데 총무가 그걸 못 본다.
  */
  const roster = strip(read(ROSTER));
  assert.ok(
    /r\.skipped === 0 && r\.sent > 0/.test(roster),
    'pokeAll이 skipped를 안 보고 「보냈어요」로 바꾼다 — 건너뛴 사람이 가려진다'
  );
  assert.ok(
    /if \(r\.sent > 0\) setPoked\(/.test(roster),
    '개별 독촉이 실제로 갔는지 안 보고 「전송됨」으로 바꾼다'
  );
}

console.log('remindcooldown ✓ 서버에서 막고 · 결과가 화면에 닿고 · 수신자별로 막는다');
