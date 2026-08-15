# @멘션 — 게시판·공지에서 팀원 지목하기

2026-08-16

## 배경

게시판 글이나 공지에서 특정 팀원에게 말을 걸 방법이 없다. "김범준님 골키퍼 부탁해요"라고 써도
본인이 그 글을 열어보기 전까지는 모른다.

`@김범준` 형태로 지목하면 초록으로 강조되고, 지목된 사람에게 알림이 간다.

## 범위

**넣는 것**

- 게시판 글 작성·렌더
- 공지 작성·렌더 (공지 본문이 그려지는 3곳 전부)
- `@everyone` — 팀 전원 지목

**빼는 것과 이유**

| 뺀 것 | 이유 |
|---|---|
| 게시판 댓글 멘션 | 댓글 UI를 먼저 만들어야 한다(게시판 개편 스펙 Task 7). 그게 끝나면 같은 컴포넌트를 그대로 붙인다 |
| 멘션 전용 테이블 | 멘션으로 검색하거나 거를 일이 없다. 본문에서 파싱하면 충분하다 |

## 저장 형식

본문에 마커로 저장한다. 마이그레이션 없이 기존 `body` 컬럼을 그대로 쓴다.

```
오늘 @[김범준](3f2a…-uuid) 골키퍼 부탁해요
비 와서 @[everyone](all) 확인 부탁드려요
```

### 왜 순수 텍스트(`@김범준`)가 아닌가

`displayName`은 사용자가 자유롭게 정하는 값이라 세 경우에서 대상이 흔들린다.

- **동명이인** — 팀에 김범준이 둘이면 누구를 지목한 건지 정할 수 없다
- **이름 속 공백** — `@김 범준`에서 이름이 어디서 끝나는지 판정이 불가능하다
- **이름 변경** — 지목한 뒤 그 사람이 이름을 바꾸면 연결이 끊긴다

마커는 셋을 다 피한다. 코드는 조금 길어지지만 틀리지 않는다.

### `all` 센티널

`@everyone`은 사용자가 아니라서 userId 자리에 넣을 값이 없다. `all`을 예약어로 쓴다 —
uuid가 `all`일 수 없으므로 충돌하지 않는다.

### 기존 글

마커가 없는 옛 글은 그대로 평문으로 그려진다. 호환 문제 없음.

## 파일

새 파일 두 개. 게시판과 공지가 같이 쓰므로 한 곳에 둔다.

| 파일 | 내용 |
|---|---|
| `src/lib/mentions.ts` | 순수 함수. react-native를 import하지 않는다(검증 스크립트가 node로 불러 쓴다) |
| `src/components/Mention.tsx` | `<MentionInput>`, `<MentionText>` |

### `src/lib/mentions.ts`

```ts
/** 전체 지목에 쓰는 예약 id — uuid가 이 값일 수 없다 */
export const EVERYONE = 'all';

export type MentionPiece =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string; name: string };

/** 본문을 텍스트/멘션 조각으로 쪼갠다 */
export function parse(body: string): MentionPiece[];

/** 마커를 사람이 읽는 형태로 되돌린다 — 푸시 알림·알림 목록에 쓴다 */
export function toPlainText(body: string): string;

/** 본문에서 지목된 id 목록 (중복 제거) */
export function mentionedIds(body: string): string[];

/** 커서 앞의 마지막 @토큰. 자동완성 후보를 걸러낼 때 쓴다 */
export function activeQuery(text: string, cursor: number): string | null;

/** 고른 후보를 마커로 바꿔 끼운다. 새 커서 위치도 함께 돌려준다 */
export function insertMention(
  text: string,
  cursor: number,
  target: { id: string; name: string }
): { text: string; cursor: number };
```

## 자동완성

커서 **앞쪽**의 마지막 `@토큰`을 잡아 후보를 거른다. 커서는 `onSelectionChange`로 추적한다 —
문자열 끝만 보면 글 중간에 끼워 넣을 때 깨진다.

후보 목록(최대 5개):

1. **`@everyone`이 항상 맨 위.** `everyone`의 앞부분과 맞으면 남는다 — `@e`, `@ev`, `@every` 모두
   즉시 뜬다. `@`만 친 상태에서도 보인다
2. 팀원 — `displayName`에 검색어가 포함되면 남는다

탭하면 `insertMention`으로 마커가 끼워진다.

## 알림

| 어디서 | 누구에게 |
|---|---|
| 게시판 글에 `@김범준` | 김범준에게만 |
| 게시판 글에 `@everyone` | **팀 전원** (쓴 사람 제외) |
| 공지 | 추가 알림 **없음** — 공지는 이미 작성 시 팀 전체에게 나간다. 멘션 알림을 더하면 지목된 사람만 두 번 울린다 |

`kind`는 넘기지 않는다. 나를 직접 부른 것이라 끄고 켜는 종류로 두지 않는다.

**대상은 user_id 합집합으로 모아 중복을 없앤 뒤 한 번만 보낸다.** `@everyone`과 개인 지목이 같은
글에 섞이면 지목된 사람이 두 번 울리게 된다. 게시판 개편에서 만든 댓글 알림도 같은 자리를
쓴다(`notifyTargets`).

### `@everyone`은 누구나 쓴다

권한을 걸지 않는다. 팀원 누구나 게시판 글로 팀 전체에 푸시를 보낼 수 있다는 뜻이다.

이 앱은 팀 전체 알림을 공지(총무 전용)로 제한해 왔으므로, 이 결정은 그 제한을 게시판 쪽에서
푼다. 남용되면 그때 총무 전용으로 좁힌다 — 되돌리기 어려운 결정은 아니다.

### 푸시 본문은 반드시 `toPlainText`를 거친다

`notify-team`은 받은 `body`를 그대로 알림 테이블에 넣고 푸시로도 보낸다
(`supabase/functions/notify-team/index.ts:52,70`). 마커를 그대로 넘기면 잠금화면에
`@[김범준](3f2a-…)`가 뜬다. 공지처럼 멘션 알림이 없는 경로에서도 본문에 마커가 있을 수 있으므로,
**알림으로 나가는 모든 본문**에 적용한다.

## 연결 지점

| 입력 (`MentionInput`) | 렌더 (`MentionText`) |
|---|---|
| `BoardPanel` 작성창 | `PostCard` 본문 |
| `AnnouncementFormModal` 본문 | `AnnouncementDetailModal.tsx:58` |
| | `AnnouncementListModal.tsx:46` |
| | `TabHeader.tsx:221` (알림 패널 피드) |

공지 본문이 그려지는 곳이 셋이라 하나라도 빠지면 거기서만 마커가 노출된다.

## 검증

`scripts/mentions.check.ts` — `node --experimental-strip-types scripts/mentions.check.ts`

- 마커 하나가 텍스트/멘션/텍스트 세 조각으로 쪼개진다
- 마커가 없는 옛 글은 텍스트 한 조각이다
- 이름에 공백이나 대괄호가 들어가도 조각 경계가 맞다
- `toPlainText`가 마커를 `@이름`으로 되돌린다
- `mentionedIds`가 같은 사람을 두 번 세지 않는다
- `activeQuery`가 커서 **앞**만 본다 (글 중간에 커서를 두고 확인)
- `insertMention`이 문자열 끝이 아니라 커서 자리에 끼워 넣고, 새 커서를 마커 뒤로 옮긴다
- `@everyone`이 `@e`로 후보에 남는다

## 순서

게시판 개편(`2026-08-15-board-redesign-design.md`)이 끝난 뒤에 얹는다. `PostCard`·`PostComments`가
자리를 잡아야 `MentionText`를 붙일 곳이 정해진다.
