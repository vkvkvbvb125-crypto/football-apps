/*
  모달인데 나갈 길이 없는 것을 센다.

  개별 모달을 하나씩 단언하지 않는다. teamcards.check이 카드 여덟을 「전부 있고
  순서가 맞는가」로 세는 것과 같은 방식이다 — 새 모달을 만들면 그날부터 자동으로
  포함되고, 목록을 손으로 들고 다니지 않는다.

  세는 기준: 출구가 셋 중 몇 개인가.
    ① onRequestClose   안드로이드 하드웨어 뒤로가기
    ② 스크림           바깥을 눌러 닫기
    ③ 눈에 보이는 닫기  X 아이콘·「닫기」·「취소」·뒤로 화살표

  ⚠ ①과 ②는 **둘 다 눈에 안 보인다.** 그 둘만 있는 모달은 「나갈 길이 있다」로
  세면 안 된다 — 스크림이 출구인 줄 모르는 사용자에게는 갇힌 화면이다.
  실제로 장소 검색 모달에서 갇혀 앱을 강제 종료했다. 그래서 이 검사는
  **③을 따로 요구한다.**

  (그때 뒤로가기가 안 먹은 것은 앱 결함이 아니었다. 개발 빌드의 LogBox 전체화면
   오류가 입력을 가로채고 있었다. 기기에서 재보니 중첩 모달의 뒤로가기는
   정상이고 안쪽만 닫힌다.)
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 이스케이프를 쓰지 않는다 — 이 저장소에서 문자열이 셸을 두 번 지나가며 열 번 넘게 샜다 */
const BS = String.fromCharCode(92);   // 역슬래시
const NL = String.fromCharCode(10);   // 줄바꿈

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.tsx')) files.push(p.split(BS).join('/'));
  }
})('src');

const CLOSE_ICON = /name="(close|close-outline|close-circle|chevron-back|chevron-down|arrow-back)"/;
const CLOSE_TEXT = />닫기<|닫기<\/Text>|>취소<|취소<\/Text>/;

interface Found { file: string; line: number; back: boolean; scrim: boolean; button: boolean; works: boolean }
const found: Found[] = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<Modal\b/g)) {
    const start = m.index!;
    // 여는 태그의 끝 `>` — 속성 안의 중괄호를 세며 넘어간다
    let i = start + m[0].length;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    const props = src.slice(start, i);
    const end = src.indexOf('</Modal>', i);
    const body = src.slice(i + 1, end > 0 ? end : src.length);

    /*
      스크림 탐지를 이름으로 하지 마라. styles.overlay만 찾다가 menuOverlay·
      menuBackdrop·{{ flex: 1 }}를 전부 놓쳤다 — 「이름으로 세면 이름 없는 것이
      빠진다」의 또 한 사례다. 구조로 본다: onPress를 가진 Pressable이면서
      자식이 없거나(자기 닫힘) 본문 전체를 감싸는 첫 자식인 것.
    */
    const selfClosingScrim = /<Pressable[^>]*onPress=[^>]*[/]>/s.test(body);
    const firstChild = body.trimStart().match(/^<(\w+)([^>]*)/s);
    const wrappingScrim = !!firstChild && firstChild[1] === 'Pressable' && firstChild[2].includes('onPress=');

    /*
      팝오버와 작업 모달을 가른다.

      「모든 모달에 보이는 닫기」는 틀린 규칙이다. 수정·삭제 두 줄짜리 팝오버
      메뉴에 X를 다는 UI는 없고, 그건 바깥을 눌러 닫는 것이 학습된 몸짓이다.
      실제로 그 규칙으로 돌렸더니 팝오버 셋이 걸렸다(공지 ⋮ · 경기 ⋮ · 게시글 ⋮).

      가르는 기준은 「그 안에서 무언가를 하는가」다. 입력칸·목록·스크롤이 있으면
      사용자가 머무는 화면이고, 머무는 화면에는 보이는 출구가 있어야 한다.
      팝오버는 고르면 끝나고, 안 고르려면 바깥을 누른다.
    */
    const WORK = ['<TextInput', '<FlatList', '<ScrollView', '<SectionList', '<WebView'];
    found.push({
      file,
      line: src.slice(0, start).split(NL).length,
      back: props.includes('onRequestClose'),
      scrim: selfClosingScrim || wrappingScrim,
      button: CLOSE_ICON.test(body) || CLOSE_TEXT.test(body),
      works: WORK.some((t) => body.includes(t)),
    });
  }
}

const fails: string[] = [];

// 앱에 모달이 있기는 한가 — 앵커가 죽으면 0개를 세고 조용히 통과한다.
if (found.length < 20) {
  fails.push(`모달을 ${found.length}개만 찾았다 — 29개쯤 있어야 한다. 탐지가 깨졌다`);
}

for (const f of found) {
  const where = `${f.file}:${f.line}`;
  if (!f.back) fails.push(`${where} — onRequestClose가 없다 (안드로이드 뒤로가기로 못 닫는다)`);
  if (!f.button && !f.scrim) fails.push(`${where} — 뒤로가기 말고 나갈 길이 없다`);
  // 머무는 모달(입력칸·목록·스크롤이 있는 것)에는 보이는 출구를 요구한다.
  // 뒤로가기와 스크림은 둘 다 눈에 안 보여서, 그 둘만으로는 갇힌 것처럼 보인다.
  if (f.works && !f.button) {
    fails.push(`${where} — 안에서 작업하는 모달인데 눈에 보이는 닫기가 없다`);
  }
}

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
