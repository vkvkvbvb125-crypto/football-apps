// scripts/rolelabel.check.ts — 「총무」의 반대말과 이름 없는 사람의 대체 표시
//
// 「팀원」과 「멤버」가 뒤섞여 있었다. 세어 보니 뒤섞인 게 아니라 **층위가 넷**이었고,
// 그중 둘만 실제로 갈려 있었다.
//
//   ① 역할 뱃지 (반대말이 「총무」)      4곳 — 팀원 1 / 멤버 3   ← 갈렸다
//   ② 명단·집합 (「N명」·초대·관리·빈 상태) 17곳 — 멤버 15 / 팀원 2
//   ③ 사람을 향해 하는 말 (「~ 전체에게」)  14곳 — 팀원 14 / 멤버 0
//   ④ 이름 없는 사람의 대체 표시 (?? '…')  10곳 — 멤버 8 / 팀원 2   ← 갈렸다
//
// ②와 ③은 각자 다수가 뚜렷하고 뜻도 다르다. 「멤버 초대하기」를 「팀원 초대하기」로
// 바꾸면 아직 팀원이 아닌 사람을 부르는 말이 되고, 「팀원 전체에게 알림이 발송돼요」를
// 「멤버 전체에게」로 바꾸면 명단에 알림을 보내는 말이 된다. 하나로 밀지 않는다.
//
// ①은 「팀원」이다. 다수는 「멤버」였지만 근거가 둘 있다 — 반대말이 「총무」인데
// 총무는 역할이고 멤버는 소속이라 층위가 어긋나고, 약관이 이미 「역할(총무/팀원)」로
// 적는다(terms.ts). 화면이 약관에 맞춘다.
//
// ④는 「멤버」다. 소속을 말하는 자리가 아니라 이름을 모르는 한 칸이다. 게시판에서
// 저장 전(BoardPanel)엔 「팀원」, 서버가 돌려준 뒤(boardService)엔 「멤버」로 같은 사람이
// 다르게 보이고 있었다.
//
// 뱃지를 문자열로 세면 새로 생긴 뱃지를 모른다. 삼항 노드를 전수로 돈다 —
// 「JSX 구조를 보는 단언은 파서로」 규칙은 teamsettings.check 머리말에 있다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (statSync(child).isDirectory()) out.push(...walk(child));
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(child);
  }
  return out;
}

/** 이 가지가 화면에 내놓는 글자만 모은다 — 스타일·식별자는 빼고 문자열과 JSX 본문만 */
function textOf(node: ts.Node): string {
  let out = '';
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out += n.text;
    else if (ts.isJsxText(n)) out += n.text;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out.trim();
}

const badges: { at: string; other: string }[] = [];
const fallbacks: { at: string; word: string }[] = [];

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const where = (n: ts.Node) => `${basename(file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const visit = (n: ts.Node) => {
    // ① 역할 뱃지 — 한쪽 가지가 딱 「총무」인 삼항
    //
    // 「총무」가 문장 안에 섞인 것(「입금했어요 · 총무 확인 대기」)은 뱃지가 아니다.
    // 가지가 내놓는 글자 전체가 「총무」와 같을 때만 뱃지로 본다.
    if (ts.isConditionalExpression(n)) {
      const t = textOf(n.whenTrue);
      const f = textOf(n.whenFalse);
      // 「총무면 붙이고 아니면 아무것도 안 붙인다」는 뱃지가 아니다 — 반대말이 없는 자리다.
      // (TeamHomeTab의 meta 줄이 그렇다: 총무 · 포지션 · 참석률에서 총무만 조건부다)
      const nothing = (x: ts.Node) =>
        x.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined');
      if (t === '총무' && !nothing(n.whenFalse)) badges.push({ at: where(n), other: f });
      else if (f === '총무' && !nothing(n.whenTrue)) badges.push({ at: where(n), other: t });
    }
    // ④ 이름 없는 사람의 대체 표시 — ?? '멤버' / ?? '팀원'
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isStringLiteral(n.right) &&
      (n.right.text === '멤버' || n.right.text === '팀원')
    ) {
      fallbacks.push({ at: where(n), word: n.right.text });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ── ① 「총무」의 반대말은 언제나 「팀원」 ────────────────────────────
{
  assert.ok(badges.length >= 4, `역할 뱃지를 ${badges.length}곳밖에 못 찾았다 — 세는 방식이 깨졌다`);

  const wrong = badges.filter((b) => b.other !== '팀원');
  assert.deepEqual(
    wrong,
    [],
    `「총무」의 반대말이 「팀원」이 아닌 자리: ${wrong.map((w) => `${w.at} → ${w.other}`).join(', ')}`
  );

  // 갈렸던 네 자리가 다 잡히는지 — 세는 방식이 좁아지면 여기서 걸린다
  const files = new Set(badges.map((b) => b.at.split(':')[0]));
  for (const f of ['TeamHomeTab.tsx', 'MemberListModal.tsx', 'TeamSwitchSheet.tsx', 'TeamMembersTab.tsx']) {
    assert.ok(files.has(f), `${f}의 역할 뱃지를 못 찾았다 — 삼항이 아닌 꼴로 바뀌었으면 이 검사를 고쳐라`);
  }
}

// ── ④ 이름 없는 사람은 언제나 「멤버」 ──────────────────────────────
//
// 저장 전과 저장 후가 다른 말을 하면, 같은 사람이 새로고침 한 번에 다른 이름이 된다.
{
  assert.ok(fallbacks.length >= 10, `대체 표시를 ${fallbacks.length}곳밖에 못 찾았다 — 세는 방식이 깨졌다`);

  const wrong = fallbacks.filter((f) => f.word !== '멤버');
  assert.deepEqual(
    wrong,
    [],
    `이름 없는 사람의 대체 표시가 「멤버」가 아닌 자리: ${wrong.map((w) => `${w.at} → ${w.word}`).join(', ')}`
  );

  // 게시판은 같은 글에 둘이 나란히 뜬다 — 낙관 표시(화면)와 서버 응답(서비스)
  const files = new Set(fallbacks.map((f) => f.at.split(':')[0]));
  for (const f of ['BoardPanel.tsx', 'PostComments.tsx', 'boardService.ts']) {
    assert.ok(files.has(f), `${f}의 대체 표시를 못 찾았다`);
  }
}

// ── ②③은 손대지 않는다는 것을 값으로 남긴다 ────────────────────────
//
// 「하나로 밀지 않기로 했다」가 주석에만 있으면 다음 사람이 기계적으로 통일한다.
// 각 층위의 대표 문구를 집어서, 바뀌면 여기서 멈추게 한다.
{
  const read = (p: string) => readFileSync(join(SRC, p), 'utf8').split('\r').join('');

  // ② 명단·집합 — 「멤버」
  assert.ok(
    /<Text style=\{styles\.inviteRowName\}>멤버 초대하기<\/Text>/.test(read('features/team/components/TeamMembersTab.tsx')),
    '초대 문구가 바뀌었다 — 아직 팀원이 아닌 사람을 부르는 자리라 「멤버」다'
  );
  // ③ 사람을 향해 하는 말 — 「팀원」
  assert.ok(
    /<Text style=\{styles\.note\}>만들면 팀원 전체에게 알림이 발송돼요<\/Text>/.test(
      read('features/attendance/components/CreateMatchSheet.tsx')
    ),
    '알림 안내 문구가 바뀌었다 — 사람에게 보내는 말이라 「팀원」이다'
  );
}

console.log(`rolelabel ok — 역할 뱃지 ${badges.length}곳, 대체 표시 ${fallbacks.length}곳`);
