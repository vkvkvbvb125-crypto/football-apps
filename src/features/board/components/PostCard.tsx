// src/features/board/components/PostCard.tsx — 글 하나
//
// 데이터는 BoardPanel이 소유한다. 이 컴포넌트는 그리고, 눌린 것을 위로 넘긴다.
// 작성자 이름·사진은 members에서 찾는다 — 글에 박힌 값은 불러온 시점의 복사본이라
// 프로필을 바꿔도 안 따라온다 (resolveAuthor 참고).
import { useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';
import { relativeTime } from '../../../lib/relativeTime';
import { CATEGORY_LABEL, resolveAuthor, type Post } from '../services/boardService';
import { PostComments } from './PostComments';

/** 접었을 때 보이는 줄 수 */
const COLLAPSED_LINES = 6;

interface PostCardProps {
  post: Post;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
  myUserId: string;
  isAdmin: boolean;
  onToggleLike: (post: Post) => void;
  onDelete: (post: Post) => void;
  /** 실패하면 던진다 — 카드가 편집 모드를 유지해서 쓴 걸 날리지 않는다 */
  onEdit: (post: Post, body: string) => Promise<void>;
  onTogglePin: (post: Post) => Promise<void>;
}

export function PostCard({
  post,
  members,
  myUserId,
  isAdmin,
  onToggleLike,
  onDelete,
  onEdit,
  onTogglePin,
}: PostCardProps) {
  const author = resolveAuthor(post, members);
  const [expanded, setExpanded] = useState(false);
  /** 실제로 잘렸을 때만 "더보기"를 띄운다 — 안 넘치는 글에 붙는 게 이 기능에서 제일 흔한 실수다 */
  const [truncatable, setTruncatable] = useState(false);
  const bodyRef = useRef<any>(null);

  /**
   * 웹에는 onTextLayout이 없다 (react-native-web 미구현).
   *
   * numberOfLines 자체는 -webkit-line-clamp로 잘 먹어서, 이 검사가 없으면 글은 잘렸는데
   * "더보기"가 안 뜨는 상태가 된다 — 펼칠 방법이 없어서 기능이 없느니만 못하다.
   * 잘렸는지는 실제 높이로 판단한다: 접혀 있으면 안쪽 내용이 보이는 높이보다 크다.
   */
  const measureOnWeb = () => {
    if (Platform.OS !== 'web' || expanded) return;
    const node = bodyRef.current;
    if (node && node.scrollHeight > node.clientHeight + 1) setTruncatable(true);
  };

  const [showComments, setShowComments] = useState(false);
  /** 서버에서 다시 안 읽고 화면의 개수만 맞춘다 */
  const [commentDelta, setCommentDelta] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(post.body);
  const [saving, setSaving] = useState(false);

  const canEdit = post.authorId === myUserId;
  const canDelete = post.authorId === myUserId || isAdmin;
  const canPin = isAdmin;
  const hasMenu = canEdit || canDelete || canPin;

  const submitEdit = async () => {
    const body = editDraft.trim();
    if (!body || body === post.body) return setEditing(false);
    setSaving(true);
    try {
      await onEdit(post, body);
      setEditing(false);
    } catch {
      // 실패하면 편집 모드를 유지한다 — 쓴 걸 날리지 않는다
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.post}>
      {post.isPinned && (
        <View style={styles.pinBadge}>
          <Ionicons name="pin" size={11} color={colors.green} />
          <Text style={styles.pinBadgeText}>고정</Text>
        </View>
      )}

      <View style={styles.postHead}>
        <View style={styles.avatar}>
          {author.avatar ? (
            <Image source={{ uri: author.avatar }} style={styles.avatarPhoto} />
          ) : (
            <Text style={styles.avatarText}>{author.name.slice(0, 1)}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.postAuthor}>{author.name}</Text>
          <Text style={styles.postTime}>
            {relativeTime(post.createdAt)}
            {post.updatedAt ? ' · 수정됨' : ''}
          </Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{CATEGORY_LABEL[post.category]}</Text>
        </View>
        {hasMenu && (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={15} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {editing ? (
        // 모달로 띄우지 않는다 — 읽던 자리를 잃는다
        <View style={{ gap: 8 }}>
          <TextInput
            style={styles.editInput}
            value={editDraft}
            onChangeText={setEditDraft}
            multiline
            autoFocus
          />
          <View style={styles.editActions}>
            <Pressable
              onPress={() => {
                setEditDraft(post.body);
                setEditing(false);
              }}
              style={({ pressed }) => [styles.editBtn, styles.editCancel, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.editCancelText}>취소</Text>
            </Pressable>
            <Pressable
              disabled={!editDraft.trim() || saving}
              onPress={submitEdit}
              style={({ pressed }) => [
                styles.editBtn,
                styles.editSave,
                (!editDraft.trim() || saving) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.editSaveText}>{saving ? '저장 중…' : '저장'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text
            ref={bodyRef}
            style={styles.postBody}
            numberOfLines={expanded ? undefined : COLLAPSED_LINES}
            onLayout={measureOnWeb}
            onTextLayout={(e) => {
              // 네이티브 경로. 접힌 상태에서 잰 줄 수만 믿는다 — 펼친 뒤에는 항상 전체 줄 수가
              // 나와서 짧은 글에도 "접기"가 붙어버린다
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
        </>
      )}
      {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.postImage} />}

      <View style={styles.postFoot}>
        <Pressable onPress={() => onToggleLike(post)} style={styles.footItem} hitSlop={6}>
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={15}
            color={post.likedByMe ? colors.danger : colors.textDim}
          />
          <Text style={styles.footText}>{post.likeCount}</Text>
        </Pressable>
        <Pressable onPress={() => setShowComments((v) => !v)} style={styles.footItem} hitSlop={6}>
          <Ionicons
            name={showComments ? 'chatbubble' : 'chatbubble-outline'}
            size={14}
            color={showComments ? colors.green : colors.textDim}
          />
          <Text style={styles.footText}>{post.commentCount + commentDelta}</Text>
        </Pressable>
      </View>

      {showComments && (
        <PostComments
          postId={post.id}
          postAuthorId={post.authorId}
          members={members}
          myUserId={myUserId}
          isAdmin={isAdmin}
          onCountChange={(d) => setCommentDelta((v) => v + d)}
        />
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarText: { color: colors.textStrong, fontSize: 12, fontWeight: '800' },
  postAuthor: { color: colors.textStrong, fontSize: 12.5, fontWeight: '800' },
  postTime: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.greenTint },
  categoryBadgeText: { color: colors.green, fontSize: 10, fontWeight: '800' },

  postBody: { color: colors.textBody, fontSize: 13, lineHeight: 19 },
  moreText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  postImage: { width: '100%', height: 180, borderRadius: radius.button, backgroundColor: colors.inputBg },

  /** 고정 배지 — 참고 화면의 주황 "운영공지" 대신 앱 초록 계열로 */
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: colors.greenTint,
  },
  pinBadgeText: { color: colors.green, fontSize: 10, fontWeight: '800' },

  editInput: {
    minHeight: 90,
    padding: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: 8 },
  editBtn: { flex: 1, height: 40, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  editCancel: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border },
  editCancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  editSave: { backgroundColor: colors.green },
  editSaveText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },

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

  postFoot: { flexDirection: 'row', gap: 16, paddingTop: 2 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
