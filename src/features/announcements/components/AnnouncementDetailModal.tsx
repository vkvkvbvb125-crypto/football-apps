import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { MentionText } from '../../../components/Mention';
import { Ionicons } from '@expo/vector-icons';
import type { AnnouncementRow } from '../services/announcementsService';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

interface AnnouncementDetailModalProps {
  announcement: AnnouncementRow | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (announcement: AnnouncementRow) => void;
  onDelete: (announcement: AnnouncementRow) => void;
}

export function AnnouncementDetailModal({
  announcement,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
}: AnnouncementDetailModalProps) {
  const { colors, styles } = useThemed(makeStyles);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchorY, setMenuAnchorY] = useState(0);

  if (!announcement) return null;

  const dateLabel = new Date(announcement.created_at).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <Modal visible={!!announcement} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable
          style={styles.overlay}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          {/* 스크림의 탭이 카드 안까지 번지는 것만 막는다 — 누르는 것이 아니라 초점도 주지 않는다 */}
          <Pressable style={styles.card} onPress={() => {}} accessible={false}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {announcement.is_pinned && <Ionicons name="pin" size={13} color={colors.green} />}
                <Text style={styles.dateText}>{dateLabel}</Text>
              </View>
              {isAdmin && (
                <Pressable
                  onPress={(e) => {
                    setMenuAnchorY(e.nativeEvent.pageY);
                    setMenuVisible(true);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="공지 더보기"
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                </Pressable>
              )}
              {/*
                닫기를 헤더에 둔다.
              
                이 모달의 출구는 하드웨어 뒤로가기와 스크림뿐이었고 둘 다 눈에 안 보인다.
                본문이 스크롤되는 「읽는 모달」이라 스크림을 누르려면 카드 밖을 겨눠야
                하는데, 카드가 화면을 거의 채워서 겨눌 데가 얇다.
                총무에게는 ⋮ 옆에, 팀원에게는 비어 있던 오른쪽에 붙는다.
              */}
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="닫기"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.bodyScroll}>
              <Text style={styles.title}>{announcement.title}</Text>
              <MentionText body={announcement.body} style={styles.body} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setMenuVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="메뉴 닫기"
        >
          <View style={[styles.menuPopover, { top: menuAnchorY + 12 }]}>
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                onEdit(announcement);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color={colors.textStrong} />
              <Text style={styles.menuOptionText}>수정</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                onDelete(announcement);
              }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  closeBtn: {
    marginLeft: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    color: colors.placeholder,
    fontSize: 12,
  },
  bodyScroll: {
    marginTop: 16,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  body: {
    marginTop: 12,
    color: colors.textStrong,
    fontSize: 14,
    lineHeight: 21,
  },
  menuOverlay: {
    flex: 1,
  },
  menuPopover: {
    position: 'absolute',
    right: 20,
    width: 160,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuOptionText: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '600',
  },
  menuOptionTextDanger: {
    color: colors.danger,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  });
