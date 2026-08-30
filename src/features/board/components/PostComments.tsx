// src/features/board/components/PostComments.tsx — 펼친 글의 댓글
//
// 목록에서는 개수만 세고, 펼칠 때 그 글의 댓글만 불러온다.
// 글 100개의 댓글을 통째로 끌고 오면 대부분 펼쳐보지도 않을 것에 돈을 쓴다.
//
// 댓글 데이터는 이 컴포넌트가 직접 들고 있다. 부모(BoardPanel)가 전부 소유하면
// 다시 부풀고, 어차피 펼친 글에서만 쓰는 데이터다. 개수 변화만 위로 알린다.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../../components/nativeText';
import { alertMessage } from '../../../components/Dialog';
import { colors, radius } from '../../../theme';
import { relativeTime } from '../../../lib/relativeTime';
import { useTeamStore } from '../../team/stores/teamStore';
import { notifyTeam } from '../../notifications/services/pushService';
import {
  createComment,
  deleteComment,
  fetchComments,
  resolveAuthor,
  type PostComment,
} from '../services/boardService';

/**
 * 댓글 한 건으로 알림 받을 사람들.
 *
 * 글쓴이 + 그 글에 이미 댓글을 단 사람들. 나 자신은 뺀다 — 내 댓글로 나에게
 * 알림이 오면 안 된다.
 *
 * 이전 댓글 작성자를 넣는 이유: 대화가 오가는데 첫 댓글 단 사람만 모르는 상태가
 * 된다. 두 번째 댓글부터는 글쓴이보다 그 사람들이 더 당사자다.
 *
 * ⚠ 이 목록은 댓글이 쌓일수록 늘어난다. 10명이 댓글 단 글에 새 댓글이 달리면
 *   10명에게 간다. 지금은 그게 의도다 — 게시판 토글(notify_board)로 끌 수 있고,
 *   팀 규모가 십수 명이라 상한이 실질적인 의미가 없다.
 *   「알림이 많다」가 나오면 여기가 그 자리다. 그때 고를 수 있는 것들:
 *     · 최근 N명만 (오래된 참여자는 대화에서 빠졌다고 본다)
 *     · 내가 마지막으로 댓글 단 뒤 새 댓글이 있으면 한 번만 (묶어 보내기)
 *     · 글쓴이 + 나를 멘션한 사람만 (지금보다 좁힌다)
 *   상한을 지금 넣지 않는 이유는, 어느 규칙이 맞는지는 실제로 시끄러워져 봐야
 *   알 수 있고, 그전에 넣은 상한은 근거 없는 숫자로 남기 때문이다.
 *
 * 합집합 구조는 멘션을 얹을 자리이기도 하다 — 「댓글에서 글쓴이를 멘션」할 때
 * 같은 사람에게 두 번 울리지 않게 한다.
 */
function notifyTargets(
  postAuthorId: string,
  myUserId: string,
  priorCommenterIds: string[]
): string[] {
  return [...new Set([postAuthorId, ...priorCommenterIds])].filter((id) => id !== myUserId);
}

interface PostCommentsProps {
  postId: string;
  postAuthorId: string;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
  myUserId: string;
  isAdmin: boolean;
  /** 목록의 댓글 수를 맞추려고 위로 알린다 (+1 / -1) */
  onCountChange: (delta: number) => void;
}

export function PostComments({
  postId,
  postAuthorId,
  members,
  myUserId,
  isAdmin,
  onCountChange,
}: PostCommentsProps) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  /** 불러온 목록을 돌려준다 — setComments는 같은 틱에 못 읽어서, 알림 수신자를 여기서 받는다 */
  const load = async (): Promise<PostComment[] | null> => {
    setLoading(true);
    setFailed(false);
    try {
      const rows = await fetchComments(postId);
      setComments(rows);
      return rows;
    } catch {
      setFailed(true);
      return null;
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
      const rows = await load();

      // 방금 단 내 댓글도 rows에 있지만 notifyTargets가 나를 걸러낸다
      const priorCommenterIds = (rows ?? []).map((c) => c.authorId);
      const targets = notifyTargets(postAuthorId, myUserId, priorCommenterIds);
      if (targets.length > 0 && activeTeam) {
        /* 알림 문구에 넣을 내 이름 — 댓글 목록의 이름은 boardService가 만든다.
           대체 표시를 그쪽과 맞춘다(「멤버」). 두 곳이 갈리면 한 사람이 두 이름이 된다 */
        const myName = members.find((m) => m.userId === myUserId)?.displayName ?? '멤버';
        const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
        // 알림 실패는 삼킨다 — 댓글은 이미 달렸고, 실패한 것처럼 보이면 안 된다.
          notifyTeam(
          activeTeam.team.id,
          `${myName}님이 댓글을 남겼어요`,
          preview,
          undefined,
          targets,
          'comment'
        ).catch(
          () => {}
        );
      }
    } catch {
      // 입력은 그대로 둔다 — 쓴 걸 날리는 게 최악이다
      alertMessage('실패', '댓글을 남기지 못했어요');
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
      alertMessage('실패', '댓글을 지우지 못했어요');
    }
  };

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
  time: { color: colors.textFaint, fontSize: 10, fontWeight: '600' },
  body: { color: colors.textBody, fontSize: 12, lineHeight: 18 },
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
  },
  input: { flex: 1, color: colors.text, fontSize: 12, maxHeight: 80 },
});
