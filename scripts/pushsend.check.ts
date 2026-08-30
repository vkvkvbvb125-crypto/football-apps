/*
  만든 알림 채널과 실제로 보낼 때 쓰는 채널이 같은가.

  이 검사가 생긴 이유. pushService의 ensureAndroidChannel()이 'default' 채널을
  이름 「킥데이 알림」·importance HIGH·진동 [0,250,250,250]·초록 LED로 만든다.
  그런데 notify-team Edge Function이 메시지에 channelId를 안 실어 보냈다.
  에뮬레이터에서 같은 기기로 두 번 보내 나란히 재봤다:

    channelId 있음  → channel=default
    channelId 없음  → channel=expo_notifications_fallback_notification_channel
                      mName=Miscellaneous  mVibrationPattern=null  mLightColor=0

  즉 그 채널은 만들어만 놓고 실제 발송에서는 한 번도 안 쓰이고 있었다.
  사용자의 안드로이드 알림 설정에도 「킥데이 알림」이 아니라 「Miscellaneous」로
  떴다 — 무엇을 끄는지 모르는 이름이다.

  「만드는 자리」와 「쓰는 자리」가 다른 파일에 있고, 사이를 잇는 것이 문자열
  하나다. 둘 중 하나만 바꿔도 조용히 끊긴다. 그 문자열을 여기서 마주 보게 한다.
  이 저장소에서 SQL과 TS를 한 단언으로 묶었던 것(voteguard)과 같은 모양이다.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 이스케이프를 쓰지 않는다 — 이 저장소에서 문자열이 셸을 두 번 지나가며 열 번 넘게 샜다 */
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);

const SVC = 'src/features/notifications/services/pushService.ts';
const FN = 'supabase/functions/notify-team/index.ts';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const svc = strip(readFileSync(SVC, 'utf8'));
const fn = strip(readFileSync(FN, 'utf8'));

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

// ── ① 만드는 채널 이름을 뽑는다 ──
const created = svc.match(/setNotificationChannelAsync\(\s*'([^']+)'/);
ok(!!created, 'ensureAndroidChannel이 채널을 안 만든다');

// ── ② 보낼 때 그 이름을 싣는다 ──
const sent = fn.match(/channelId:\s*'([^']+)'/);
ok(!!sent, "notify-team이 channelId를 안 싣는다 — 안 실으면 Expo 폴백 채널(Miscellaneous)로 간다");

// ── ③ 둘이 같은 이름이다 ── 이 검사의 핵심이다.
if (created && sent) {
  ok(created[1] === sent[1],
     `만드는 채널('${created[1]}')과 보내는 채널('${sent[1]}')이 다르다 — 한쪽만 바꾸면 조용히 끊긴다`);
}

// ── ④ 채널이 실제로 쓸모 있게 설정돼 있다 ──
ok(/AndroidImportance\.HIGH/.test(svc), '채널 중요도가 HIGH가 아니다 — 소리 없이 뜬다');
ok(/vibrationPattern/.test(svc), '진동 패턴이 없다');

// ── ⑤ 늦으면 쓸모없어지는 알림이라 우선순위를 높인다 ──
ok(/priority:\s*'high'/.test(fn),
   "notify-team이 priority: 'high'를 안 싣는다 — 기본값은 Doze에 묶였다 나중에 몰려 도착한다");

// ── ⑥ 보내는 자리가 전부 실패를 삼킨다 ──
//    notifyTeam은 던진다(if (error) throw error). 발송이 실패했다고 「경기 생성」
//    자체가 깨지면 안 되고, 잡지 않으면 unhandled rejection이 된다.
//    ⚠ 줄 번호로 짚지 않는다 — 코드가 움직이면 엉뚱한 줄을 본다. 전체를 훑는다.
const all: string[] = [];
(function walk(d: string) {
  for (const n of readdirSync(d)) {
    const q = join(d, n);
    if (statSync(q).isDirectory()) walk(q);
    else if (n.endsWith('.ts') || n.endsWith('.tsx')) all.push(q.split(BS).join('/'));
  }
})('src');

let calls = 0;
for (const f of all) {
  if (f.endsWith('pushService.ts')) continue;   // 정의부는 뺀다
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/notifyTeam\(/g)) {
    calls += 1;
    // 호출 문장이 끝나는 ) 를 찾아 그 뒤에 .catch가 붙는지 본다.
    // 창(N줄)으로 보면 여러 줄에 걸친 호출에서 놓친다 — anchor.ts 여덟째.
    let depth = 0;
    let i = m.index! + 'notifyTeam'.length;
    for (; i < src.length; i += 1) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') { depth -= 1; if (depth === 0) break; }
    }
    if (!src.slice(i, i + 12).includes('.catch(')) {
      const line = src.slice(0, m.index!).split(NL).length;
      fails.push(`${f}:${line} — notifyTeam이 .catch 없이 불린다. 발송 실패가 본 작업을 깨뜨린다`);
    }
  }
}

// 보내는 자리 개수가 줄면 알아야 한다 — 없어진 것은 아무도 안 센다.
ok(calls === 8, `notifyTeam 호출이 ${calls}곳이다 — 8곳이어야 한다. 늘거나 줄었으면 확인하고 이 숫자를 고쳐라`);

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
