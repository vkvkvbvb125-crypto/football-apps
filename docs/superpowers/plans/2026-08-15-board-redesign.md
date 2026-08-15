# 게시판 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀 게시판에 댓글·글 고정·글 수정·긴 글 접기를 넣는다.

**Architecture:** 글 데이터는 `BoardPanel`이 소유하고, 카드 렌더는 `PostCard`, 댓글은 `PostComments`가 각자 맡는다. 댓글은 펼칠 때만 그 글 것을 불러온다. 고정은 `posts` 테이블을 건드리지 않고 `post_pins` 테이블로 분리해, "총무는 고정만 할 수 있다"를 RLS만으로 보장한다.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / TypeScript / Supabase (postgres + RLS) / zustand

**Spec:** `docs/superpowers/specs/2026-08-15-board-redesign-design.md`

## Global Constraints

- **테스트 러너가 없다.** 이 저장소에는 jest도 vitest도 없고, 이 작업 때문에 넣지 않는다. 검증은 세 가지뿐이다:
  1. 순수 함수 → `scripts/board.check.ts` (node:assert). 실행: `node --experimental-strip-types scripts/board.check.ts` (Node 24, 새 의존성 없음)
  2. 타입 → `npx tsc --noEmit` (반드시 exit 0)
  3. 화면 동작 → 앱에서 직접 확인. 각 Task에 확인 항목을 적어 두었다
- **순수 함수는 `features/*/utils/*.ts`에 둔다.** `boardService.ts`는 `lib/supabase`를 import하고 그건 react-native 모듈을 끌고 오므로 node에서 실행할 수 없다. 검증할 로직은 반드시 순수 모듈로 분리한다. 그 모듈은 `import type`만 허용한다(값 import 금지).
- **원격 DB에 마이그레이션을 실행하지 않는다.** SQL 파일만 저장소에 추가하고, 적용은 사용자가 한다.
- **작성자 이름·사진은 항상 `resolveAuthor(post, members)`로 얻는다.** 글/댓글에 박힌 `authorName`·`authorAvatar`를 직접 그리지 않는다. 그 값은 불러온 시점의 복사본이라 프로필을 바꿔도 안 따라온다.
- **낙관적 반영은 좋아요에만 쓴다.** 댓글·수정·고정·삭제는 서버 왕복 뒤에 반영한다.
- **한국어 UI 문구.** 기존 화면의 말투를 따른다("~해요" 체).
- **커밋 메시지는 한국어**, `feat:` / `fix:` / `refactor:` 접두사. 각 Task 끝에서 커밋한다.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `supabase/migrations/20260815_board_pins_edit.sql` | 생성 | `post_pins` 테이블 + RLS, `posts.updated_at` |
| `src/types/database.ts` | 수정 | 위 스키마 변화 반영 |
| `src/features/board/utils/sort.ts` | 생성 | `sortPosts` — 순수 정렬 (검증 대상) |
| `scripts/board.check.ts` | 생성 | `sortPosts` assert 체크 |
| `src/features/board/services/boardService.ts` | 수정 | 쿼리 6개 추가, `Post` 확장 |
| `src/features/board/components/PostCard.tsx` | 생성 | 글 하나 렌더 + 액션 위임 |
| `src/features/board/components/PostComments.tsx` | 생성 | 댓글 목록·입력·삭제 |
| `src/features/board/components/BoardPanel.tsx` | 수정 | 목록·필터·작성창. 글 데이터 소유 |

---

### Task 1: 마이그레이션과 DB 타입

**Files:**
- Create: `supabase/migrations/20260815_board_pins_edit.sql`
- Modify: `src/types/database.ts:392-411` (posts), `src/types/database.ts:418-423` (post_comments 아래에 post_pins 추가)

**Interfaces:**
- Consumes: 없음 (첫 Task)
- Produces: `Database['public']['Tables']['post_pins']`, `posts.Row.updated_at: string | null`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260815_board_pins_edit.sql`:

```sql
-- 게시판 — 글 고정(총무만)과 수정 표시
--
-- 고정을 posts.is_pinned 컬럼으로 두지 않은 이유: 총무가 고정하려면 posts에 update 권한이
-- 필요한데, RLS는 컬럼 단위로 못 막아서 총무가 남의 글 본문까지 고칠 수 있게 된다.
-- 테이블을 나누면 "총무는 고정만"이 데이터 모델로 보장되고 트리거가 필요 없다.
create table if not exists public.post_pins (
  post_id uuid primary key references public.posts(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- null이면 한 번도 안 고친 글이다.
-- created_at과 비교하는 방식은 초 단위 오차로 갓 쓴 글이 "수정됨"이 된다.
alter table public.posts add column if not exists updated_at timestamptz;

alter table public.post_pins enable row level security;

-- 읽기는 그 팀 팀원 전부
drop policy if exists post_pins_select on public.post_pins;
create policy post_pins_select on public.post_pins for select to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_pins.post_id and tm.user_id = auth.uid()
  ));

-- 고정/해제는 그 팀 총무만
drop policy if exists post_pins_insert on public.post_pins;
create policy post_pins_insert on public.post_pins for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and exists (
      select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
      where p.id = post_pins.post_id and tm.user_id = auth.uid() and tm.role = 'admin'
    )
  );

drop policy if exists post_pins_delete on public.post_pins;
create policy post_pins_delete on public.post_pins for delete to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_pins.post_id and tm.user_id = auth.uid() and tm.role = 'admin'
  ));
```

- [ ] **Step 2: `src/types/database.ts`의 posts에 updated_at 추가**

`posts.Row`에 한 줄 추가 (`created_at: string;` 아래):

```ts
          updated_at: string | null;
```

`posts.Insert`는 그대로 둔다 — 글을 만들 때는 넣지 않는다.

- [ ] **Step 3: post_pins 타입 추가**

`post_comments` 블록 바로 아래에:

```ts
      post_pins: {
        Row: { post_id: string; pinned_by: string; created_at: string };
        Insert: { post_id: string; pinned_by: string };
        Update: Partial<Database['public']['Tables']['post_pins']['Insert']>;
        Relationships: [];
      };
```

- [ ] **Step 4: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260815_board_pins_edit.sql src/types/database.ts
git commit -m "feat: 게시판 글 고정용 post_pins 테이블과 posts.updated_at"
```

> 사용자가 이 마이그레이션을 직접 적용해야 이후 Task의 화면 확인이 된다. Task 1 완료 보고에 "마이그레이션 적용이 필요하다"고 명시할 것.

---

### Task 2: 정렬 순수 함수와 검증 스크립트

**Files:**
- Create: `src/features/board/utils/sort.ts`
- Create: `scripts/board.check.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `sortPosts<T extends SortablePost>(posts: T[]): T[]`, `interface SortablePost { isPinned: boolean; createdAt: string }`

- [ ] **Step 1: 실패하는 체크를 먼저 쓴다**

`scripts/board.check.ts`:

```ts
// scripts/board.check.ts — 게시판 순수 로직 검증
//
//   node --experimental-strip-types scripts/board.check.ts
//
// 이 저장소에는 테스트 러너가 없다. 정렬은 화면 둘(게시판, 팀 홈 최근 게시글)이
// 같은 순서를 보여야 하는 규칙이라, 눈으로만 확인하고 넘어가면 한쪽만 어긋난다.
import assert from 'node:assert/strict';
import { sortPosts } from '../src/features/board/utils/sort.ts';

const p = (id: string, createdAt: string, isPinned = false) => ({ id, createdAt, isPinned });

// 고정이 없으면 최신순
assert.deepEqual(
  sortPosts([p('a', '2026-08-01'), p('c', '2026-08-03'), p('b', '2026-08-02')]).map((x) => x.id),
  ['c', 'b', 'a'],
  '고정이 없으면 최신순이어야 한다'
);

// 고정은 항상 위 — 오래된 글이어도
assert.deepEqual(
  sortPosts([p('new', '2026-08-10'), p('old-pinned', '2026-08-01', true)]).map((x) => x.id),
  ['old-pinned', 'new'],
  '고정된 글은 더 최신 글보다 위여야 한다'
);

// 고정끼리도 최신순
assert.deepEqual(
  sortPosts([
    p('pin-old', '2026-08-01', true),
    p('plain', '2026-08-05'),
    p('pin-new', '2026-08-09', true),
  ]).map((x) => x.id),
  ['pin-new', 'pin-old', 'plain'],
  '고정끼리는 최신순이어야 한다'
);

// 원본 배열을 건드리지 않는다 — 호출한 쪽의 state를 제자리에서 뒤집으면 안 된다
const original = [p('a', '2026-08-01'), p('b', '2026-08-02')];
sortPosts(original);
assert.deepEqual(original.map((x) => x.id), ['a', 'b'], '원본 배열은 그대로여야 한다');

console.log('board.check.ts: 모든 검사 통과');
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --experimental-strip-types scripts/board.check.ts`
Expected: FAIL — `Cannot find module '../src/features/board/utils/sort.ts'`

- [ ] **Step 3: 최소 구현**

`src/features/board/utils/sort.ts`:

```ts
// src/features/board/utils/sort.ts
// 게시판 정렬 — 게시판 목록과 팀 홈의 "최근 게시글"이 같은 순서를 보여야 한다.
// 화면마다 정렬하면 한쪽만 고쳐지는 날이 온다.
//
// react-native를 import하지 않는다 — scripts/board.check.ts가 node로 직접 불러 검증한다.

export interface SortablePost {
  isPinned: boolean;
  createdAt: string;
}

/** 고정 먼저, 그 안에서 최신순. 원본은 건드리지 않는다 */
export function sortPosts<T extends SortablePost>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --experimental-strip-types scripts/board.check.ts`
Expected: `board.check.ts: 모든 검사 통과`

- [ ] **Step 5: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: 커밋**

```bash
git add src/features/board/utils/sort.ts scripts/board.check.ts
git commit -m "feat: 게시판 정렬 규칙(고정 먼저 → 최신순)과 검증 스크립트"
```

---

### Task 3: 서비스 — Post 확장, 고정 합치기, 나머지 쿼리

**Files:**
- Modify: `src/features/board/services/boardService.ts`

**Interfaces:**
- Consumes: `sortPosts` (Task 2), `post_pins` 타입 (Task 1)
- Produces:
  - `interface Post` — 기존 필드 + `updatedAt: string | null`, `isPinned: boolean`
  - `interface PostComment { id: string; postId: string; authorId: string; authorName: string; authorAvatar: string | null; body: string; createdAt: string }`
  - `updatePost(postId: string, body: string): Promise<void>`
  - `setPin(postId: string, userId: string, pinned: boolean): Promise<void>`
  - `fetchComments(postId: string): Promise<PostComment[]>`
  - `createComment(postId: string, authorId: string, body: string): Promise<void>`
  - `deleteComment(commentId: string): Promise<void>`
  - `resolveAuthor` — 이미 있음, 시그니처 그대로

- [ ] **Step 1: Post 인터페이스 확장**

`Post`에 두 필드를 추가한다:

```ts
  createdAt: string;
  /** null이면 한 번도 안 고친 글 */
  updatedAt: string | null;
  isPinned: boolean;
```

- [ ] **Step 2: fetchPosts에 고정 정보를 합치고 정렬한다**

`fetchPosts` 안의 `Promise.all` 배열에 네 번째 쿼리를 추가한다:

```ts
  const [{ data: likes }, { data: comments }, { data: profiles }, { data: pins }] = await Promise.all([
    supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
    supabase.from('post_comments').select('post_id').in('post_id', ids),
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', authorIds),
    supabase.from('post_pins').select('post_id').in('post_id', ids),
  ]);
```

`profileById` 아래에 한 줄 추가:

```ts
  const pinnedIds = new Set((pins ?? []).map((p) => p.post_id));
```

`return rows.map(...)`를 `sortPosts(rows.map(...))`로 감싸고, 매핑 객체에 두 필드를 넣는다:

```ts
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isPinned: pinnedIds.has(r.id),
```

파일 위에 import를 추가한다:

```ts
import { sortPosts } from '../utils/sort';
```

- [ ] **Step 3: 나머지 함수 다섯 개를 추가한다**

파일 끝에:

```ts
/** 글 수정 — 본문만. 카테고리는 쓴 뒤에 바꿀 일이 없다 */
export async function updatePost(postId: string, body: string) {
  const { error } = await supabase
    .from('posts')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
}

/**
 * 글 고정/해제.
 *
 * posts를 건드리지 않고 post_pins에 줄을 넣고 뺀다 — 총무에게 posts update를 열면
 * 남의 글 본문까지 고칠 수 있게 되기 때문이다. 권한은 RLS가 막는다.
 */
export async function setPin(postId: string, userId: string, pinned: boolean) {
  if (pinned) {
    const { error } = await supabase.from('post_pins').insert({ post_id: postId, pinned_by: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_pins').delete().eq('post_id', postId);
    if (error) throw error;
  }
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  createdAt: string;
}

/** 펼친 글의 댓글만 — 목록에서 미리 불러오지 않는다 */
export async function fetchComments(postId: string): Promise<PostComment[]> {
  const { data: rows, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', authorIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    authorId: r.author_id,
    authorName: profileById.get(r.author_id)?.display_name ?? '멤버',
    authorAvatar: profileById.get(r.author_id)?.avatar_url ?? null,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function createComment(postId: string, authorId: string, body: string) {
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, author_id: authorId, body });
  if (error) throw error;
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}
```

- [ ] **Step 4: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 화면에서 확인**

앱을 열어 팀 → 게시판. 글 목록이 예전과 똑같이 보이면 된다(아직 고정된 글이 없으므로 순서가 그대로여야 한다). 목록이 비거나 오류가 나면 `post_pins` 마이그레이션이 적용되지 않은 것이다.

- [ ] **Step 6: 커밋**

```bash
git add src/features/board/services/boardService.ts
git commit -m "feat: 게시판 서비스에 수정·고정·댓글 쿼리 추가"
```

---

### Task 4: PostCard 분리 (동작 변화 없음)

기능을 더하기 전에 카드를 먼저 떼어낸다. 이 Task가 끝났을 때 **화면은 지금과 완전히 같아야 한다.** 리팩터와 새 기능을 한 커밋에 섞으면, 화면이 달라졌을 때 무엇 때문인지 알 수 없다.

**Files:**
- Create: `src/features/board/components/PostCard.tsx`
- Modify: `src/features/board/components/BoardPanel.tsx`

**Interfaces:**
- Consumes: `Post`, `resolveAuthor` (boardService)
- Produces:
  ```ts
  interface PostCardProps {
    post: Post;
    members: { userId: string; displayName: string; avatarUrl: string | null }[];
    myUserId: string;
    isAdmin: boolean;
    onToggleLike: (post: Post) => void;
    onDelete: (post: Post) => void;
  }
  export function PostCard(props: PostCardProps): JSX.Element
  ```

- [ ] **Step 1: PostCard.tsx를 만든다**

`BoardPanel.tsx`의 `visible.map((p) => {...})` 안쪽(카드 하나를 그리는 JSX 전부)을 그대로 옮긴다. 카드가 쓰던 스타일(`post`, `postHead`, `avatar`, `avatarPhoto`, `avatarText`, `postAuthor`, `postTime`, `categoryBadge`, `categoryBadgeText`, `postBody`, `postImage`, `postFoot`, `footItem`, `footText`)도 이 파일의 `StyleSheet.create`로 옮긴다. `BoardPanel`에는 목록·필터·작성창이 쓰는 스타일만 남긴다.

파일 머리 주석:

```tsx
// src/features/board/components/PostCard.tsx — 글 하나
//
// 데이터는 BoardPanel이 소유한다. 이 컴포넌트는 그리고, 눌린 것을 위로 넘긴다.
// 작성자 이름·사진은 members에서 찾는다 — 글에 박힌 값은 불러온 시점의 복사본이다.
```

- [ ] **Step 2: BoardPanel에서 PostCard를 쓰도록 바꾼다**

```tsx
        visible.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            members={members}
            myUserId={myUserId}
            isAdmin={isAdmin}
            onToggleLike={handleLike}
            onDelete={handleDelete}
          />
        ))
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 화면에서 확인**

게시판을 연다. **지금과 픽셀 단위로 같아야 한다** — 아바타, 이름, 시간, 분류 배지, 본문, 이미지, 좋아요·댓글 수, 삭제 아이콘 위치까지. 좋아요를 눌러 즉시 반영되는지, 삭제가 되는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/board/components/PostCard.tsx src/features/board/components/BoardPanel.tsx
git commit -m "refactor: 게시판 글 카드를 PostCard로 분리"
```

---

### Task 5: 긴 글 접기

**Files:**
- Modify: `src/features/board/components/PostCard.tsx`

**Interfaces:**
- Consumes: Task 4의 `PostCardProps`
- Produces: 없음 (카드 내부 상태)

- [ ] **Step 1: 상태와 판정을 넣는다**

`PostCard` 안에:

```tsx
  const [expanded, setExpanded] = useState(false);
  /** 실제로 잘렸을 때만 "더보기"를 띄운다 — 안 넘치는 글에 붙는 게 제일 흔한 실수다 */
  const [truncatable, setTruncatable] = useState(false);
```

- [ ] **Step 2: 본문 렌더를 바꾼다**

```tsx
            <Text
              style={styles.postBody}
              numberOfLines={expanded ? undefined : COLLAPSED_LINES}
              onTextLayout={(e) => {
                // 접힌 상태에서 잰 줄 수만 믿는다 — 펼친 뒤에는 항상 전체 줄 수가 나온다
                if (!expanded && e.nativeEvent.lines.length >= COLLAPSED_LINES) setTruncatable(true);
              }}
            >
              {post.body}
            </Text>
            {truncatable && (
              <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
                <Text style={styles.moreText}>{expanded ? '접기' : '더보기'}</Text>
              </Pressable>
            )}
```

파일 위에 상수를 둔다:

```tsx
/** 접었을 때 보이는 줄 수 */
const COLLAPSED_LINES = 6;
```

스타일 추가:

```tsx
  moreText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 화면에서 확인**

- 짧은 글(2~3줄)에는 `더보기`가 **안 보여야** 한다
- 7줄 이상인 글에는 보이고, 누르면 전체가 펼쳐지고 `접기`로 바뀐다
- 다시 누르면 6줄로 접힌다

7줄짜리 글이 없으면 게시판에서 하나 써서 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/features/board/components/PostCard.tsx
git commit -m "feat: 긴 글 접기/더보기"
```

---

### Task 6: ⋮ 팝오버 — 수정·고정·삭제

**Files:**
- Modify: `src/features/board/components/PostCard.tsx`
- Modify: `src/features/board/components/BoardPanel.tsx`

**Interfaces:**
- Consumes: `updatePost`, `setPin` (Task 3)
- Produces: `PostCardProps`에 두 콜백 추가
  ```ts
    onEdit: (post: Post, body: string) => Promise<void>;
    onTogglePin: (post: Post) => Promise<void>;
  ```

- [ ] **Step 1: BoardPanel에 두 핸들러를 추가한다**

`handleDelete` 아래:

```tsx
  const handleEdit = async (post: Post, body: string) => {
    try {
      await updatePost(post.id, body);
      await load();
    } catch {
      const m = '글을 수정하지 못했어요';
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('실패', m);
      throw new Error('edit failed'); // 카드가 편집 모드를 유지하도록
    }
  };

  const handleTogglePin = async (post: Post) => {
    try {
      await setPin(post.id, myUserId, !post.isPinned);
      await load();
    } catch {
      const m = post.isPinned ? '고정을 풀지 못했어요' : '고정하지 못했어요';
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('실패', m);
    }
  };
```

import에 `setPin`, `updatePost`를 추가하고, `<PostCard>`에 `onEdit={handleEdit} onTogglePin={handleTogglePin}`을 넘긴다.

- [ ] **Step 2: PostCard에 팝오버를 넣는다**

기존 삭제 아이콘(`ellipsis-vertical`) 자리를 팝오버 여는 버튼으로 바꾼다. 일정 화면(`AttendanceScreen.tsx`의 `popover*` 스타일)과 같은 방식이다 — `Modal` + 화면 전체를 덮는 `Pressable`(바깥을 누르면 닫힘) + 절대 위치. 권한 없는 항목은 그리지 않는다.

```tsx
  const [menuOpen, setMenuOpen] = useState(false);
  const canEdit = post.authorId === myUserId;
  const canDelete = post.authorId === myUserId || isAdmin;
  const canPin = isAdmin;
  const hasMenu = canEdit || canDelete || canPin;
```

카드 머리의 기존 삭제 `Pressable`을 이걸로 바꾼다:

```tsx
              {hasMenu && (
                <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
                  <Ionicons name="ellipsis-vertical" size={15} color={colors.textFaint} />
                </Pressable>
              )}
```

카드 JSX 맨 끝(바깥 `</View>` 직전)에 팝오버를 둔다:

```tsx
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            {canEdit && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setEditDraft(post.body);
                  setEditing(true);
                }}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.textStrong} />
                <Text style={styles.menuText}>수정</Text>
              </Pressable>
            )}
            {canPin && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  onTogglePin(post);
                }}
              >
                <Ionicons name="pin-outline" size={16} color={colors.textStrong} />
                <Text style={styles.menuText}>{post.isPinned ? '고정 해제' : '고정'}</Text>
              </Pressable>
            )}
            {canDelete && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  onDelete(post);
                }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={[styles.menuText, { color: colors.danger }]}>삭제</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
```

스타일:

```tsx
  // 가운데에 띄운다 — 카드마다 ⋮ 위치를 재서 붙이려면 onLayout 배선이 필요한데,
  // 항목이 셋뿐이라 그만한 값을 못 한다
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  menu: {
    width: 200,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  menuText: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
```

- [ ] **Step 3: 인라인 편집을 넣는다**

"수정"을 고르면 본문 자리가 `TextInput`으로 바뀐다(모달로 띄우면 읽던 자리를 잃는다):

```tsx
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.body);

  const submitEdit = async () => {
    const body = editDraft.trim();
    if (!body || body === post.body) return setEditing(false);
    try {
      await onEdit(post, body);
      setEditing(false);
    } catch {
      // 실패하면 편집 모드를 유지한다 — 쓴 걸 날리지 않는다
    }
  };
```

편집 중에는 본문·더보기 대신 `TextInput` + 취소/저장 버튼을 그린다.

- [ ] **Step 4: 고정 배지와 수정됨 표시**

카드 머리 왼쪽 위, 이름 줄 위에:

```tsx
        {post.isPinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={11} color={colors.green} />
            <Text style={styles.pinBadgeText}>고정</Text>
          </View>
        )}
```

시간 옆:

```tsx
                <Text style={styles.postTime}>
                  {relativeTime(post.createdAt)}
                  {post.updatedAt ? ' · 수정됨' : ''}
                </Text>
```

스타일:

```tsx
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: colors.greenTint,
    marginBottom: 8,
  },
  pinBadgeText: { color: colors.green, fontSize: 10, fontWeight: '800' },
```

- [ ] **Step 5: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: 화면에서 확인**

- 내 글의 `⋮`에 수정·삭제가 보인다. 총무면 고정도 보인다
- **남의 글에는 수정이 안 보인다**
- **총무가 아닌 계정에는 고정이 안 보인다**
- 고정하면 그 글이 목록 맨 위로 가고 `고정` 배지가 붙는다. 해제하면 제자리로 돌아간다
- 수정하고 저장하면 본문이 바뀌고 시간 옆에 `· 수정됨`이 붙는다

- [ ] **Step 7: 커밋**

```bash
git add src/features/board/components/PostCard.tsx src/features/board/components/BoardPanel.tsx
git commit -m "feat: 글 수정·고정 (⋮ 팝오버)"
```

---

### Task 7: 댓글

**Files:**
- Create: `src/features/board/components/PostComments.tsx`
- Modify: `src/features/board/components/PostCard.tsx`

**Interfaces:**
- Consumes: `fetchComments`, `createComment`, `deleteComment`, `PostComment`, `resolveAuthor` (Task 3)
- Produces:
  ```ts
  interface PostCommentsProps {
    postId: string;
    members: { userId: string; displayName: string; avatarUrl: string | null }[];
    myUserId: string;
    isAdmin: boolean;
    /** 목록의 댓글 수를 맞추려고 위로 알린다 (+1 / -1) */
    onCountChange: (delta: number) => void;
  }
  export function PostComments(props: PostCommentsProps): JSX.Element
  ```

- [ ] **Step 1: PostComments.tsx를 만든다**

댓글 데이터는 이 컴포넌트가 직접 들고 로드한다. 부모가 전부 소유하면 `BoardPanel`이 다시 부풀고, 어차피 펼친 글에서만 쓰는 데이터다.

```tsx
// src/features/board/components/PostComments.tsx — 펼친 글의 댓글
//
// 목록에서는 개수만 세고, 펼칠 때 그 글의 댓글만 불러온다.
// 글 100개의 댓글을 통째로 끌고 오면 대부분 펼쳐보지도 않을 것에 돈을 쓴다.
export function PostComments({ postId, members, myUserId, isAdmin, onCountChange }: PostCommentsProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setComments(await fetchComments(postId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [postId]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await createComment(postId, myUserId, body);
      setDraft(''); // 성공했을 때만 비운다
      onCountChange(1);
      await load();
    } catch {
      // 입력은 그대로 둔다 — 쓴 걸 날리는 게 최악이다
      const m = '댓글을 남기지 못했어요';
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('실패', m);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (c: PostComment) => {
    try {
      await deleteComment(c.id);
      onCountChange(-1);
      await load();
    } catch {
      const m = '댓글을 지우지 못했어요';
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('실패', m);
    }
  };
```

렌더:

```tsx
  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator color={colors.green} style={{ paddingVertical: 12 }} />
      ) : failed ? (
        <Pressable onPress={load} style={styles.retryRow} hitSlop={6}>
          <Text style={styles.retryText}>댓글을 불러오지 못했어요 · 다시</Text>
        </Pressable>
      ) : comments.length === 0 ? (
        <Text style={styles.emptyText}>첫 댓글을 남겨보세요</Text>
      ) : (
        comments.map((c) => {
          const author = resolveAuthor(c, members);
          const canDelete = c.authorId === myUserId || isAdmin;
          return (
            <View key={c.id} style={styles.row}>
              <View style={styles.avatar}>
                {author.avatar ? (
                  <Image source={{ uri: author.avatar }} style={styles.avatarPhoto} />
                ) : (
                  <Text style={styles.avatarText}>{author.name.slice(0, 1)}</Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.name}>{author.name}</Text>
                  <Text style={styles.time}>{relativeTime(c.createdAt)}</Text>
                </View>
                <Text style={styles.body}>{c.body}</Text>
              </View>
              {/* RLS와 같은 규칙 — 화면에서 보이는 것과 서버가 허용하는 것이 어긋나지 않는다 */}
              {canDelete && (
                <Pressable onPress={() => handleDelete(c)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={13} color={colors.textFaint} />
                </Pressable>
              )}
            </View>
          );
        })
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="댓글 남기기"
          placeholderTextColor={colors.textFaint}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          hitSlop={8}
          style={(!draft.trim() || sending) && { opacity: 0.4 }}
        >
          <Ionicons name="send" size={16} color={colors.green} />
        </Pressable>
      </View>
    </View>
  );
}
```

스타일:

```tsx
const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 12 },
  avatarText: { color: '#8FA69C', fontSize: 10, fontWeight: '800' },
  name: { color: colors.textStrong, fontSize: 12, fontWeight: '700' },
  time: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
  body: { color: colors.textBody, fontSize: 12.5, lineHeight: 18 },
  emptyText: { color: colors.textFaint, fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  retryRow: { paddingVertical: 6 },
  retryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 12.5, maxHeight: 80 },
});
```

import는 `Image`, `TextInput`(nativeText), `relativeTime`, `resolveAuthor`, `radius`까지 함께 가져온다.

- [ ] **Step 2: PostCard에서 펼침 토글을 붙인다**

푸터의 댓글 아이콘·개수는 지금 표시만 하는데(`<View style={styles.footItem}>`), `Pressable`로 바꿔 펼침을 토글한다:

```tsx
  const [showComments, setShowComments] = useState(false);
  /** 서버에서 다시 안 읽고 화면의 개수만 맞춘다 */
  const [commentDelta, setCommentDelta] = useState(0);
```

```tsx
              <Pressable onPress={() => setShowComments((v) => !v)} style={styles.footItem} hitSlop={6}>
                <Ionicons
                  name={showComments ? 'chatbubble' : 'chatbubble-outline'}
                  size={14}
                  color={showComments ? colors.green : colors.textDim}
                />
                <Text style={styles.footText}>{post.commentCount + commentDelta}</Text>
              </Pressable>
```

푸터 아래:

```tsx
            {showComments && (
              <PostComments
                postId={post.id}
                members={members}
                myUserId={myUserId}
                isAdmin={isAdmin}
                onCountChange={(d) => setCommentDelta((v) => v + d)}
              />
            )}
```

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 화면에서 확인**

- 댓글 아이콘을 누르면 펼쳐지고 다시 누르면 접힌다. **글 두 개를 동시에 펼칠 수 있다**
- 댓글을 쓰면 목록에 뜨고 푸터의 숫자가 1 늘어난다
- 내 댓글에만 휴지통이 보인다(총무 계정에서는 전부 보인다). 지우면 숫자가 1 줄어든다
- 빈 입력으로는 보내기가 안 눌린다

- [ ] **Step 5: 커밋**

```bash
git add src/features/board/components/PostComments.tsx src/features/board/components/PostCard.tsx
git commit -m "feat: 게시판 댓글 (목록·작성·삭제)"
```

---

### Task 8: 댓글 알림

**Files:**
- Modify: `src/features/board/components/PostComments.tsx`

**Interfaces:**
- Consumes: `notifyTeam` (`src/features/notifications/services/pushService`), `useTeamStore`
- Produces: 없음

- [ ] **Step 1: 알림 대상을 모으는 헬퍼를 넣는다**

`PostComments.tsx` 안, 컴포넌트 밖에:

```tsx
/**
 * 댓글 한 건으로 알림 받을 사람들.
 *
 * 지금은 글쓴이 하나뿐이라 합집합이 과해 보이지만, 멘션을 얹으면 "댓글에서 글쓴이를
 * 멘션"할 때 같은 사람에게 두 번 울린다. 그때 고치는 것보다 자리를 잡아 두는 편이 싸다.
 */
function notifyTargets(postAuthorId: string, myUserId: string): string[] {
  return [...new Set([postAuthorId])].filter((id) => id !== myUserId);
}
```

- [ ] **Step 2: props에 글쓴이를 받는다**

`PostCommentsProps`에 추가하고, `PostCard`에서 `postAuthorId={post.authorId}`를 넘긴다:

```ts
    postAuthorId: string;
```

- [ ] **Step 3: 댓글 작성 성공 뒤에 보낸다**

`handleSend`의 `await load();` 다음:

```tsx
      const targets = notifyTargets(postAuthorId, myUserId);
      if (targets.length > 0 && activeTeam) {
        const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
        // 알림 실패는 삼킨다 — 댓글은 이미 달렸고, 실패한 것처럼 보이면 안 된다
        notifyTeam(activeTeam.team.id, `${myName}님이 댓글을 남겼어요`, preview, undefined, targets).catch(
          () => {}
        );
      }
```

`activeTeam`은 `useTeamStore((s) => s.activeTeam)`, `myName`은 `resolveAuthor`가 쓰는 것과 같은 방식으로 `members`에서 내 `userId`를 찾아 얻는다. `kind`는 넘기지 않는다 — 나에게 직접 온 반응이라 끄고 켜는 종류로 두지 않는다.

- [ ] **Step 4: 타입 확인**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 화면에서 확인**

- 다른 계정의 글에 댓글을 달면 그 사람에게 알림이 간다(알림 벨에 새 항목)
- **내 글에 내가 댓글을 달면 알림이 안 온다**
- 알림이 실패해도 댓글은 남는다

- [ ] **Step 6: 커밋**

```bash
git add src/features/board/components/PostComments.tsx src/features/board/components/PostCard.tsx
git commit -m "feat: 댓글이 달리면 글쓴이에게 알림"
```

---

### Task 9: 팀 홈 최근 게시글 정렬 맞추기

**Files:**
- Modify: `src/features/team/screens/TeamHomeScreen.tsx:98-101`

**Interfaces:**
- Consumes: `fetchPosts` (Task 3 — 이미 `sortPosts`를 태워 돌려준다)
- Produces: 없음

- [ ] **Step 1: 확인만 한다**

`fetchPosts`가 정렬해서 돌려주므로 `list.slice(0, 2)`는 자동으로 "고정 먼저 → 최신순" 상위 2개가 된다. 코드 변경이 필요 없다. `TeamHomeScreen.tsx:98-101`을 읽고 그런지 확인한다.

- [ ] **Step 2: 화면에서 확인**

게시판에서 오래된 글 하나를 고정한 뒤 팀 홈으로 간다. **최근 게시글 맨 위에 그 고정된 글이 있어야 한다.**

- [ ] **Step 3: 어긋나면 고친다**

`recentPosts`가 정렬을 다시 하고 있다면 그 정렬을 지운다(`fetchPosts`가 이미 한다). 변경이 있었다면 커밋한다:

```bash
git add src/features/team/screens/TeamHomeScreen.tsx
git commit -m "fix: 팀 홈 최근 게시글도 고정 글을 먼저 보여준다"
```

---

## 마무리 확인

모든 Task가 끝난 뒤 한 번에:

- [ ] `node --experimental-strip-types scripts/board.check.ts` → 통과
- [ ] `npx tsc --noEmit` → exit 0
- [ ] 게시판에서 글 쓰기 → 댓글 달기 → 수정 → 고정 → 고정 해제 → 삭제가 모두 되는지
- [ ] 총무가 아닌 계정으로 로그인해 고정 항목이 안 보이는지
- [ ] 내 설정에서 사진을 바꾸면 게시판 글·댓글의 사진이 따라 바뀌는지 (`resolveAuthor`)
