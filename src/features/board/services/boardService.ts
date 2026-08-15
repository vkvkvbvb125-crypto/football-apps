// src/features/board/services/boardService.ts — 팀 게시판
//
// 좋아요·댓글 수는 목록에서 바로 필요하다. 글마다 따로 세면 글 20개에 쿼리 41번이 된다 —
// 한 번에 모아 와서 화면에서 합친다.
import { supabase } from '../../../lib/supabase';

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

  const [{ data: likes }, { data: comments }, { data: profiles }] = await Promise.all([
    supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
    supabase.from('post_comments').select('post_id').in('post_id', ids),
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', authorIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const likesByPost = new Map<string, { post_id: string; user_id: string }[]>();
  (likes ?? []).forEach((l) => {
    const list = likesByPost.get(l.post_id) ?? [];
    list.push(l);
    likesByPost.set(l.post_id, list);
  });
  const commentCountByPost = new Map<string, number>();
  (comments ?? []).forEach((c) => commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1));

  return rows.map((r) => {
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
      likeCount: postLikes.length,
      commentCount: commentCountByPost.get(r.id) ?? 0,
      likedByMe: postLikes.some((l) => l.user_id === myUserId),
    };
  });
}

export async function createPost(input: {
  teamId: string;
  authorId: string;
  category: PostCategory;
  body: string;
  imageUrl?: string | null;
}) {
  const { error } = await supabase.from('posts').insert({
    team_id: input.teamId,
    author_id: input.authorId,
    category: input.category,
    body: input.body,
    image_url: input.imageUrl ?? null,
  });
  if (error) throw error;
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
