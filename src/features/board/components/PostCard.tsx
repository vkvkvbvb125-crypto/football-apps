// src/features/board/components/PostCard.tsx — 글 하나
//
// 데이터는 BoardPanel이 소유한다. 이 컴포넌트는 그리고, 눌린 것을 위로 넘긴다.
// 작성자 이름·사진은 members에서 찾는다 — 글에 박힌 값은 불러온 시점의 복사본이라
// 프로필을 바꿔도 안 따라온다 (resolveAuthor 참고).
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';
import { relativeTime } from '../../../lib/relativeTime';
import { CATEGORY_LABEL, resolveAuthor, type Post } from '../services/boardService';

interface PostCardProps {
  post: Post;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
  myUserId: string;
  isAdmin: boolean;
  onToggleLike: (post: Post) => void;
  onDelete: (post: Post) => void;
}

export function PostCard({ post, members, myUserId, isAdmin, onToggleLike, onDelete }: PostCardProps) {
  const author = resolveAuthor(post, members);

  return (
    <View style={styles.post}>
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
          <Text style={styles.postTime}>{relativeTime(post.createdAt)}</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{CATEGORY_LABEL[post.category]}</Text>
        </View>
        {(post.authorId === myUserId || isAdmin) && (
          <Pressable onPress={() => onDelete(post)} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={15} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      <Text style={styles.postBody}>{post.body}</Text>
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
        <View style={styles.footItem}>
          <Ionicons name="chatbubble-outline" size={14} color={colors.textDim} />
          <Text style={styles.footText}>{post.commentCount}</Text>
        </View>
      </View>
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
  postImage: { width: '100%', height: 180, borderRadius: radius.button, backgroundColor: colors.inputBg },

  postFoot: { flexDirection: 'row', gap: 16, paddingTop: 2 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
