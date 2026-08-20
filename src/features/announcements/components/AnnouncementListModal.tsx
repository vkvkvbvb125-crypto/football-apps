import { Pressable, ScrollView, StyleSheet, View, Modal } from 'react-native';
import { Text } from '../../../components/nativeText';
import { toPlainText } from '../../../lib/mentions';
import { Ionicons } from '@expo/vector-icons';
import type { AnnouncementRow } from '../services/announcementsService';
import { colors, radius } from '../../../theme';

interface AnnouncementListModalProps {
  visible: boolean;
  announcements: AnnouncementRow[];
  isAdmin: boolean;
  onClose: () => void;
  onSelect: (announcement: AnnouncementRow) => void;
  onCreate: () => void;
}

export function AnnouncementListModal({
  visible,
  announcements,
  isAdmin,
  onClose,
  onSelect,
  onCreate,
}: AnnouncementListModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>공지사항</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {announcements.length === 0 ? (
          <Text style={styles.emptyText}>등록된 공지가 없어요</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {announcements.map((a) => (
              <Pressable key={a.id} style={styles.item} onPress={() => onSelect(a)}>
                <View style={styles.itemHeader}>
                  {a.is_pinned && <Ionicons name="pin" size={12} color={colors.green} />}
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {a.title}
                  </Text>
                </View>
                <Text style={styles.itemBody} numberOfLines={2}>
                  {toPlainText(a.body)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {isAdmin && (
          <Pressable style={styles.fab} onPress={onCreate}>
            <Ionicons name="add" size={28} color="#0B0F0D" />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 40,
    textAlign: 'center',
    color: colors.placeholder,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 12,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  itemBody: {
    marginTop: 6,
    color: '#8A9490',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56, // 정원 유지 — 버튼 높이 스냅(52) 대상이 아니다
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 16px rgba(34,197,94,0.4)',
  },
});
