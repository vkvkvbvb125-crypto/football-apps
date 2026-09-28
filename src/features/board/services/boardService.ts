// src/features/board/services/boardService.ts — 팀 게시판
//
// 좋아요·댓글 수는 목록에서 바로 필요하다. 글마다 따로 세면 글 20개에 쿼리 41번이 된다 —
// 한 번에 모아 와서 화면에서 합친다.
import { supabase } from '../../../lib/supabase';
import { sortPosts } from '../utils/sort';

export type PostCategory = 'free' | 'review' | 'question';

export const CATEGORY_LABEL: Record<PostCategory, string> = {
  free: '자유게시판',
  review: '경기 후기',
  question: '질문·요청',
};

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  category: PostCategory;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  /** null이면 한 번도 안 고친 글 */
  updatedAt: string | null;
  isPinned: boolean;
  likeCount: number;
  commentCount: number;
  /** 내가 좋아요를 눌렀는지 — 하트를 채울지 결정한다 */
  likedByMe: boolean;
}

/**
 * 글에 보여줄 작성자 이름·사진.
 *
 * 글을 불러올 때 박아 둔 값(authorName/authorAvatar)은 그 시점의 복사본이라,
 * 사진이나 이름을 바꿔도 이미 불러온 목록에는 반영되지 않는다. 팀원 목록은
 * 프로필을 바꿀 때마다 loadMembers()로 갱신되니, 살아 있는 쪽을 먼저 본다.
 *
 * 복사본은 fallback으로 남긴다 — 팀을 떠난 사람의 옛 글에서 이름이 '멤버'로
 * 바뀌어 버리지 않게.
 */
export function resolveAuthor(
  post: Pick<Post, 'authorId' | 'authorName' | 'authorAvatar'>,
  members: { userId: string; displayName: string; avatarUrl: string | null }[]
) {
  /*
    ⚠ **이 폴백이 탈퇴자를 구해 준다. 「어차피 같은 값이니 정리하자」로 지우지 마라.**

    `members`는 현재 멤버(team_members_active)라 **나간 사람이 없다.** 그래서 `live`가
    undefined가 되는데, 그때 떨어지는 `post.authorName`은 **profiles에서 온 값**이라
    (boardService의 fetch들이 profiles를 직접 읽는다) 이름이 그대로 살아 있다.

    2026-09-18에 소프트 삭제로 바꾸면서 정산·참석·분배는 이름을 잃고 「멤버」가 떴는데
    게시판만 안 깨졌다 — **폴백이 우연히 맞는 값을 들고 있었기 때문이다.**
    `live`를 「최신 이름·아바타를 반영한다」로만 읽고 폴백을 지우면 그 순간 깨진다.

    ⚠ live가 앞에 오는 이유는 **이름을 바꾼 사람** 때문이다(글은 옛 이름을 박아 둔다).
      탈퇴자는 그 반대 경로로 폴백에 기대므로, 순서와 폴백 **둘 다** 필요하다.
  */
  const live = members.find((m) => m.userId === post.authorId);
  return {
    name: live?.displayName ?? post.authorName,
    avatar: live?.avatarUrl ?? post.authorAvatar,
  };
}

export async function fetchPosts(teamId: string, myUserId: string): Promise<Post[]> {
  const { data: rows, error } = await supabase
    .from('posts')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];

  const [{ data: likes }, { data: comments }, { data: profiles }, { data: pins }] = await Promise.all([
    supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
    supabase.from('post_comments').select('post_id').in('post_id', ids),
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', authorIds),
    supabase.from('post_pins').select('post_id').in('post_id', ids),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const pinnedIds = new Set((pins ?? []).map((p) => p.post_id));
  const likesByPost = new Map<string, { post_id: string; user_id: string }[]>();
  (likes ?? []).forEach((l) => {
    const list = likesByPost.get(l.post_id) ?? [];
    list.push(l);
    likesByPost.set(l.post_id, list);
  });
  const commentCountByPost = new Map<string, number>();
  (comments ?? []).forEach((c) => commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1));

  // 정렬은 여기서 한 번만 한다 — 목록을 쓰는 곳이 둘이라(게시판, 팀 홈의 최근 게시글)
  // 화면마다 정렬하면 한쪽만 고쳐지는 날이 온다
  return sortPosts(
    rows.map((r) => {
      const postLikes = likesByPost.get(r.id) ?? [];
      return {
        id: r.id,
        authorId: r.author_id,
        authorName: profileById.get(r.author_id)?.display_name ?? '멤버',
        authorAvatar: profileById.get(r.author_id)?.avatar_url ?? null,
        category: r.category as PostCategory,
        body: r.body,
        imageUrl: r.image_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        isPinned: pinnedIds.has(r.id),
        likeCount: postLikes.length,
        commentCount: commentCountByPost.get(r.id) ?? 0,
        likedByMe: postLikes.some((l) => l.user_id === myUserId),
      };
    })
  );
}

export async function createPost(input: {
  teamId: string;
  authorId: string;
  category: PostCategory;
  body: string;
  imageUrl?: string | null;
}) {
  /*
    ⚠ **`.select()`가 붙어 있는 이유는 알림이다.** 언급 알림이 「그 글」을 지목하려면
      방금 만든 행의 id가 손에 있어야 한다(notificationRoute.ts 2단계).
      insert만 하면 id가 안 돌아오고, 알림은 게시판 목록까지만 간다.

    ⚠ **정책을 확인하고 붙였다(2026-09-29).** `posts_select`의 using이
      `posts_insert`의 with check와 같은 조건(팀원인가)이라, 넣을 수 있으면 읽을 수도
      있다 — 프로덕션에서 BZERO_TMP에 한 줄 넣어 재고 지웠다(전체 행이 돌아왔다).
      정책이 좁았다면 insert는 되고 select만 막혀 **글쓰기가 통째로 실패**했을 자리다.
  */
  const { data, error } = await supabase
    .from('posts')
    .insert({
      team_id: input.teamId,
      author_id: input.authorId,
      category: input.category,
      body: input.body,
      image_url: input.imageUrl ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

/** 좋아요 토글 — PK가 (post_id, user_id)라 두 번 눌러도 중복 행이 생기지 않는다 */
export async function toggleLike(postId: string, userId: string, liked: boolean) {
  if (liked) {
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  }
}

/** 글 수정 — 본문만. 분류는 쓴 뒤에 바꿀 일이 없다 */
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

/**
 * 펼친 글의 댓글만 불러온다.
 *
 * 목록에서 미리 다 끌고 오지 않는다 — 글 100개의 댓글을 통째로 가져오면
 * 대부분 펼쳐보지도 않을 것에 돈을 쓴다.
 */
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
/** 팀 홈 「최근 게시글」 카드가 쓰는 한 줄 요약 */
export interface RecentPost {
  id: string;
  /** posts에 title이 없다 — body 첫 줄을 제목 자리에 쓴다. 자세한 근거는 카드 쪽 주석 */
  firstLine: string;
  authorName: string;
  createdAt: string;
  imageUrl: string | null;
  commentCount: number;
}

/**
 * 최근 글 몇 개 — 카드 전용의 좁은 조회다.
 *
 * fetchPosts를 그대로 쓰지 않는 이유는 **필요 없는 것을 같이 읽기 때문**이다.
 * 그쪽은 왕복이 다섯이다: posts + post_likes + post_comments + profiles + post_pins.
 * 카드가 그리는 것은 제목 · 작성자 · 날짜 · 썸네일 · 댓글 수뿐이라 좋아요·고정·
 * likedByMe가 필요 없다. 여기는 왕복이 둘이다(posts + post_comments).
 *
 * 팀 홈은 원래 fetchPosts를 부르고 있었다. 게시판을 화면에서 걷어낸 뒤에도 그 호출이
 * 남아서, **왕복 다섯을 쓰고 2개만 저장한 뒤 아무 데도 안 그렸다.** 이 함수가 그 자리를
 * 대신한다 — 카드가 생겼는데 왕복은 다섯에서 둘로 줄었다.
 *
 * 게시판 탭에 들어가면 fetchPosts가 따로 돈다. 스토어를 두어 둘이 나눠 쓰는 방법이
 * 있는데 안 골랐다: BoardPanel이 목록을 로컬 state로 들고 있어서, 공유하려면 그
 * 컴포넌트를 스토어로 옮겨야 한다. 게시판은 이번에 **복원**한 것이지 다시 설계한 것이
 * 아니다 — 되살리면서 구조까지 바꾸면 「복원이 맞았는지」를 판단할 수 없게 된다.
 * 카드가 커지거나(좋아요·고정까지 그린다면) 셋째 소비처가 생기면 그때 스토어로 간다.
 *
 * 작성자 이름은 profiles를 또 읽지 않고 팀 멤버 목록에서 찾는다 — 부르는 쪽이
 * 이미 들고 있는 값이라 왕복 하나를 아낀다(BoardPanel도 같은 방식이다).
 */
export async function fetchRecentPosts(
  teamId: string,
  limit: number,
  nameByUserId: Map<string, string>,
): Promise<RecentPost[]> {
  const { data: rows, error } = await supabase
    .from('posts')
    .select('id, author_id, body, image_url, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: comments } = await supabase.from('post_comments').select('post_id').in('post_id', ids);
  const countByPost = new Map<string, number>();
  (comments ?? []).forEach((c) => countByPost.set(c.post_id, (countByPost.get(c.post_id) ?? 0) + 1));

  return rows.map((r) => ({
    id: r.id,
    /*
      body 첫 줄이 제목 자리다.

      posts에 title 컬럼이 없다 — 원래 제목 없는 자유게시판 구조이고 category로만
      나눈다. 컬럼을 더하면 이미 쌓인 글 전부의 제목이 빈칸이 되고 채울 방법이 없다.

      자르는 것은 줄 단위까지만 하고 길이는 안 자른다. 화면에서 numberOfLines={1}로
      말줄임에 맡긴다 — 문자열을 직접 자르면 글자 폭이 기기마다 달라 어떤 화면에서는
      여백이 남고 어떤 화면에서는 여전히 넘친다.

      ⚠ 긴 첫 줄이 들어오면 제목처럼 안 읽힌다. 지금 데이터는 한 줄짜리 짧은 글이라
        그대로 제목이 되는데, 문단으로 시작하는 글이면 잘린 문장이 제목 자리에 온다.
        그래도 「제목 없음」보다는 낫다 — 무엇에 관한 글인지의 단서가 거기 있다.
    */
    firstLine: (r.body ?? '').split('\n')[0].trim() || '(내용 없음)',
    authorName: nameByUserId.get(r.author_id) ?? '멤버',
    createdAt: r.created_at,
    imageUrl: r.image_url,
    commentCount: countByPost.get(r.id) ?? 0,
  }));
}
