// src/features/board/components/BoardPanel.tsx — 팀 게시판 목록 + 작성
//
// 팀 화면 안에 붙는 패널이다(별도 라우트가 아니라). 팀 홈 격자에서 들어오고 뒤로가기로 나간다.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../../components/nativeText';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { colors, radius } from '../../../theme';
import { useTeamStore } from '../../team/stores/teamStore';
import { PostCard } from './PostCard';
import {
  CATEGORY_LABEL,
  createPost,
  deletePost,
  fetchPosts,
  toggleLike,
  type Post,
  type PostCategory,
} from '../services/boardService';

const CATEGORIES: PostCategory[] = ['free', 'review', 'question'];

interface Props {
  teamId: string;
  myUserId: string;
  isAdmin: boolean;
}

export function BoardPanel({ teamId, myUserId, isAdmin }: Props) {
  // PostCard가 작성자 이름·사진을 여기서 찾는다 (글에 박힌 값은 불러온 시점의 복사본)
  const members = useTeamStore((s) => s.members);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  /** null이면 전체 */
  const [filter, setFilter] = useState<PostCategory | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftCategory, setDraftCategory] = useState<PostCategory>('free');
  const [posting, setPosting] = useState(false);

  const load = async () => {
    try {
      setPosts(await fetchPosts(teamId, myUserId));
    } catch {
      // 목록을 못 불러와도 화면은 남는다 — 아래 빈 상태가 대신 뜬다
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [teamId]);

  const handlePost = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      await createPost({ teamId, authorId: myUserId, category: draftCategory, body });
      setDraft('');
      setComposing(false);
      await load();
    } catch {
      alertMessage('실패', '글을 올리지 못했어요');
    } finally {
      setPosting(false);
    }
  };

  /**
   * 좋아요는 눌린 즉시 화면을 바꾼다 — 왕복을 기다리면 두세 번 누르게 된다.
   * 서버가 거절하면 원래대로 되돌린다.
   */
  const handleLike = async (post: Post) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    );
    try {
      await toggleLike(post.id, myUserId, post.likedByMe);
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    }
  };

  const handleDelete = async (post: Post) => {
    const ok = await confirmAction({
      title: '글 삭제',
      message: '이 글을 지울까요?',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePost(post.id);
      await load();
    } catch {
      alertMessage('실패', '글을 지우지 못했어요');
    }
  };

  const visible = filter ? posts.filter((p) => p.category === filter) : posts;

  return (
    <View style={{ gap: 12 }}>
      {/* 분류 칩 — 전체가 기본이다. 글이 몇 개 없을 때 분류부터 고르게 하면 빈 화면만 본다 */}
      <View style={styles.chipRow}>
        <Pressable onPress={() => setFilter(null)} style={[styles.chip, filter === null && styles.chipOn]}>
          <Text style={[styles.chipText, filter === null && styles.chipTextOn]}>전체</Text>
        </Pressable>
        {CATEGORIES.map((c) => (
          <Pressable key={c} onPress={() => setFilter(c)} style={[styles.chip, filter === c && styles.chipOn]}>
            <Text style={[styles.chipText, filter === c && styles.chipTextOn]}>{CATEGORY_LABEL[c]}</Text>
          </Pressable>
        ))}
      </View>

      {composing ? (
        <View style={styles.composer}>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setDraftCategory(c)}
                style={[styles.chip, draftCategory === c && styles.chipOn]}
              >
                <Text style={[styles.chipText, draftCategory === c && styles.chipTextOn]}>{CATEGORY_LABEL[c]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="팀원들에게 하고 싶은 말을 적어주세요"
            placeholderTextColor={colors.textFaint}
            multiline
            autoFocus
          />
          <View style={styles.composerActions}>
            <Pressable onPress={() => setComposing(false)} style={styles.composerCancel}>
              <Text style={styles.composerCancelText}>취소</Text>
            </Pressable>
            <Pressable
              disabled={!draft.trim() || posting}
              onPress={handlePost}
              style={({ pressed }) => [
                styles.composerSubmit,
                (!draft.trim() || posting) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.composerSubmitText}>{posting ? '올리는 중…' : '올리기'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setComposing(true)} style={({ pressed }) => [styles.writeBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="create-outline" size={16} color={colors.bgRoot} />
          <Text style={styles.writeBtnText}>글쓰기</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={colors.green} style={{ marginTop: 20 }} />
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={26} color={colors.textFaint} />
          <Text style={styles.emptyText}>{filter ? '이 분류에 글이 없어요' : '첫 글을 남겨보세요'}</Text>
        </View>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  chipText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
  chipTextOn: { color: colors.green, fontWeight: '800' },

  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.button,
    backgroundColor: colors.green,
  },
  writeBtnText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },

  composer: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  composerInput: {
    minHeight: 90,
    padding: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 13.5,
    textAlignVertical: 'top',
  },
  composerActions: { flexDirection: 'row', gap: 8 },
  composerCancel: {
    flex: 1,
    height: 42,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerCancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  composerSubmit: {
    flex: 1,
    height: 42,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSubmitText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: colors.textFaint, fontSize: 12.5, fontWeight: '600' },



});
