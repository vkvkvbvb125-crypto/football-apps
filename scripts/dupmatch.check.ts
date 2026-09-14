// scripts/dupmatch.check.ts — 경기 생성 중복 방지
//
// 8월 18일 20:00 경기가 세 건 쌓였다. 원인이 셋이었다:
//   1) 캘린더에서 고른 날짜를 그대로 써서 지난 날짜로 만들어짐 (upcoming.check가 잡는다)
//   2) 제출 중에도 버튼이 눌려 같은 요청이 두 번 감  ← 여기
//   3) DB에 unique 제약이 없어 무엇도 막지 않음      ← 여기
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResultLabel } from '../src/features/attendance/utils/createResult.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 반복 생성 안내 문구 ────────────────────────────────────────
// 총무가 궁금한 건 개수가 아니라 어느 날짜가 빠졌나다.
assert.equal(createResultLabel({ created: 12, skipped: [] }), '12건 만들었어요');
assert.equal(
  createResultLabel({ created: 10, skipped: ['2026-09-03T20:00:00+09:00', '2026-09-17T20:00:00+09:00'] }),
  '10건 만들었어요 · 9/3, 9/17은 이미 있어 건너뛰었어요'
);
// 셋까지는 날짜를 다 쓴다
assert.match(createResultLabel({ created: 9, skipped: ['2026-09-03', '2026-09-10', '2026-09-17'] }), /9\/3, 9\/10, 9\/17/);
// 넷부터는 개수로 요약 — 문장이 화면을 덮는다
assert.equal(
  createResultLabel({ created: 8, skipped: ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'] }),
  '8건 만들었어요 · 4건은 이미 있어 건너뛰었어요'
);
// 전부 겹치면 "만들었어요"라고 하지 않는다
assert.equal(createResultLabel({ created: 0, skipped: ['2026-09-03'] }), '모두 이미 있는 날짜라 새로 만든 경기가 없어요');

// ── 연타 잠금이 살아 있는가 ────────────────────────────────────
{
  const s = read('src/features/attendance/components/CreateMatchSheet.tsx');
  assert.ok(/const \[submitting, setSubmitting\]/.test(s), '제출 중 상태가 없다');
  assert.ok(/if \(submitting\) return;/.test(s), '재진입 가드가 없다');
  assert.ok(/canSubmit = placeReady && !isPastDate && !submitting/.test(s), '제출 중에도 버튼이 눌린다');
  assert.ok(/'만드는 중…'/.test(s), '제출 중 표시가 없다');
}

// ── 사전 필터가 살아 있는가 ────────────────────────────────────
{
  const s = read('src/features/attendance/stores/attendanceStore.ts');
  assert.ok(/const existing = new Set/.test(s), '반복 생성 사전 필터가 없다');
  assert.ok(/lastCreateResult/.test(s), '건너뛴 날짜를 화면에 전달하지 않는다');
  // 원문 노출 금지 — err.message를 그대로 세우면 안 된다
  assert.ok(!/error: err instanceof Error \? err\.message/.test(s), 'DB 원문이 화면에 그대로 나간다');
  assert.ok(/toUserMessage\(err/.test(s), '에러 번역을 안 쓴다');
}

// ── 에러 번역 ──────────────────────────────────────────────────
{
  /*
   * 어떤 스토어도 DB 원문을 화면으로 내보내지 않는다.
   *
   * catch가 err.message를 그대로 error에 세우면 「duplicate key value violates
   * unique constraint ...」가 총무에게 보인다. 총무는 그걸 앱이 고장난 것으로 읽는다.
   * 26곳이 그 상태였다 — 한 곳을 고쳐도 나머지가 남아 있으면 같은 일이 다시 난다.
   */
  const STORES = [
    'src/features/attendance/stores/attendanceStore.ts',
    'src/features/announcements/stores/announcementsStore.ts',
    'src/features/assignment/stores/assignmentStore.ts',
    'src/features/polls/stores/pollsStore.ts',
    'src/features/team/stores/teamStore.ts',
    'src/features/settlement/stores/settlementStore.ts',
    'src/features/timer/stores/scoreStore.ts',
  ];
  for (const f of STORES) {
    const src = read(f);
    // error에 원문을 싣는 형태
    assert.ok(!/error: err instanceof Error \? err\.message/.test(src), `${f}: DB 원문이 화면으로 나간다`);
    assert.ok(!/error: e instanceof Error \? e\.message/.test(src), `${f}: DB 원문이 화면으로 나간다`);
    assert.ok(!/error:\s*e\.message \?\?/.test(src), `${f}: DB 원문이 화면으로 나간다`);
    // 에러를 세우는 스토어라면 번역을 거쳐야 한다
    if (/set\(\{[^}]*error:/.test(src)) {
      assert.ok(/toUserMessage\(/.test(src), `${f}: 에러 번역을 안 쓴다`);
    }
  }
  // 인증은 Supabase 원문(영어)을 매칭에만 쓰고 화면엔 안 내보낸다
  const auth = read('src/features/auth/stores/authStore.ts');
  assert.ok(!/return raw \|\|/.test(auth), 'authStore가 영어 원문을 그대로 돌려준다');
  assert.ok(/console\.error\('\[auth\]'/.test(auth), 'authStore가 원문을 콘솔에 안 남긴다');

  const s = read('src/lib/dbError.ts');
  for (const code of ['23505', '23503', '23502', '42501']) {
    assert.ok(s.includes(`'${code}'`), `${code} 처리가 없다`);
  }
  assert.ok(/console\.error/.test(s), '원문을 콘솔에 안 남긴다');
  assert.ok(/문제가 생겼어요/.test(s), '알 수 없는 에러의 일반 문구가 없다');
}

// ── DB 제약 ────────────────────────────────────────────────────
{
  const s = read('supabase/migrations/20260821_match_unique.sql');
  assert.ok(/unique \(team_id, match_date\)/.test(s), 'unique 제약이 없다');
  /*
    ⚠ **여기 `match_date`가 timestamptz인지 보는 단언이 있었다. 걷어냈다.**

    `supabase/schema.sql`을 읽어서 확인하고 있었는데, 그 파일을 지웠다 —
    두 시절이 섞여 있어서 무엇이 참인지 파일만 봐서는 못 갈랐기 때문이다
    (근거는 README의 「스키마는 어디에 있나」).

    이 저장소는 「사본을 시험하는 검사」를 이미 셋 걷어냈다(score·timerring·upcoming).
    이것이 넷째였고, 하필 **사본이 실제와 갈려 있던** 파일을 보고 있었다.
    지우면서 같이 거둔다 — 파일이 없어서 실패하는 것은 이 작업의 결과지 결함이 아니다.

    잃는 것: 「하루 두 타임이 서로 다른 값이라 유니크가 허용된다」는 전제를 저장소
    안에서 못 확인한다. 그건 DB에 있는 사실이라 대조하려면 실제 스키마를 뽑아야 한다.
    위의 unique 제약 단언은 그대로 남아 회귀를 막는다.
  */
}

console.log('dupmatch.check: ok');
