// src/lib/mentions.ts — @멘션 파싱
//
// 본문에 `@[이름](userId)` 마커로 저장한다. 순수 텍스트(`@김범준`)로 두면 동명이인,
// 이름 속 공백, 이름 변경 세 경우에서 대상이 흔들린다 — displayName은 사용자가
// 자유롭게 정하는 값이다.
//
// react-native를 import하지 않는다 — scripts/mentions.check.ts가 node로 직접 불러 검증한다.

/** 전체 지목에 쓰는 예약 id. uuid가 이 값일 수 없어서 사용자와 충돌하지 않는다 */
export const EVERYONE = 'all';

export type MentionPiece =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string; name: string };

/**
 * 마커 하나.
 *
 * 이름은 `]`만 아니면 뭐든 받는다(공백 포함). id는 `)`가 아닌 것들 —
 * uuid와 예약어 'all'을 모두 담으려고 좁히지 않았다.
 */
const MARKER = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** 본문을 텍스트/멘션 조각으로 쪼갠다 */
export function parse(body: string): MentionPiece[] {
  const pieces: MentionPiece[] = [];
  let last = 0;
  for (const m of body.matchAll(MARKER)) {
    const at = m.index;
    if (at > last) pieces.push({ kind: 'text', text: body.slice(last, at) });
    pieces.push({ kind: 'mention', name: m[1], id: m[2] });
    last = at + m[0].length;
  }
  if (last < body.length) pieces.push({ kind: 'text', text: body.slice(last) });
  return pieces;
}

/**
 * 마커를 사람이 읽는 형태(`@이름`)로 되돌린다.
 *
 * 알림으로 나가는 본문에는 반드시 이걸 거쳐야 한다 — notify-team은 받은 body를
 * 그대로 알림 목록에 넣고 푸시로도 보내서, 안 그러면 잠금화면에
 * `@[김범준](3f2a-…)`가 그대로 뜬다.
 */
export function toPlainText(body: string): string {
  return body.replace(MARKER, (_full, name: string) => `@${name}`);
}

/** 본문에서 지목된 id 목록 (중복 제거) */
export function mentionedIds(body: string): string[] {
  return [...new Set([...body.matchAll(MARKER)].map((m) => m[2]))];
}

/**
 * 커서 앞의 마지막 `@토큰`. 자동완성 후보를 거를 때 쓴다.
 *
 * 커서 앞만 보는 게 핵심이다 — 문자열 끝으로 판단하면 글 중간에 끼워 넣을 때 깨진다.
 * 토큰이 공백으로 끝났으면(이미 다 쓴 단어) null을 돌려준다.
 */
export function activeQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const token = before.slice(at + 1);
  // 공백이나 줄바꿈이 끼면 더 이상 쓰는 중이 아니다
  if (/[\s\n]/.test(token)) return null;
  return token;
}

/**
 * 커서 자리의 `@토큰`을 마커로 바꿔 끼운다. 새 커서 위치도 같이 돌려준다.
 * 마커 뒤에 공백 하나를 붙인다 — 바로 이어서 쓸 수 있게.
 */
export function insertMention(
  text: string,
  cursor: number,
  target: { id: string; name: string }
): { text: string; cursor: number } {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at === -1) return { text, cursor };
  const marker = `@[${target.name}](${target.id}) `;
  const next = text.slice(0, at) + marker + text.slice(cursor);
  return { text: next, cursor: at + marker.length };
}
