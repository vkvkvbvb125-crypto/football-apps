import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import type { AnnouncementRow } from '../services/announcementsService';

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
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {announcement.is_pinned && <Ionicons name="pin" size={13} color="#4ADE80" />}
                <Text style={styles.dateText}>{dateLabel}</Text>
              </View>
              {isAdmin && (
                <Pressable
                  onPress={(e) => {
                    setMenuAnchorY(e.nativeEvent.pageY);
                    setMenuVisible(true);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#8A9490" />
                </Pressable>
              )}
            </View>
            <ScrollView style={styles.bodyScroll}>
              <Text style={styles.title}>{announcement.title}</Text>
              <Text style={styles.body}>{announcement.body}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuPopover, { top: menuAnchorY + 12 }]}>
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                onEdit(announcement);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color="#E7ECE9" />
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
              <Ionicons name="trash-outline" size={16} color="#F87171" />
              <Text style={[styles.menuOptionText, styles.menuOptionTextDanger]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '80%',
    backgroundColor: '#141A17',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
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
    color: '#5A625E',
    fontSize: 12,
  },
  bodyScroll: {
    marginTop: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    marginTop: 12,
    color: '#E7ECE9',
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
    backgroundColor: '#141A17',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22302A',
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
    color: '#E7ECE9',
    fontSize: 14,
    fontWeight: '600',
  },
  menuOptionTextDanger: {
    color: '#F87171',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#22302A',
  },
});
