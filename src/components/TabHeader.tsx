// src/components/TabHeader.tsx — 리디자인 적용판
// 화면 제목 + 팀명 + 알림 벨(배지). 알림 목록 패널은 이 컴포넌트가 자체적으로 들고 있다
// (전용 알림함 화면이 생기기 전까지는 여기서 조회/표시/전체 읽음 처리까지 담당).
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { colors } from '../theme';
import { useTeamStore } from '../features/team/stores/teamStore';
import { useNotificationsStore } from '../features/notifications/stores/notificationsStore';

interface TabHeaderProps {
  title: string;
}

export function TabHeader({ title }: TabHeaderProps) {
  const teamName = useTeamStore((s) => s.activeTeam?.team.name);
  const notifications = useNotificationsStore((s) => s.notifications);
  const loading = useNotificationsStore((s) => s.loading);
  const load = useNotificationsStore((s) => s.load);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const [panelVisible, setPanelVisible] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    load();
  }, []);

  const handleOpenBell = () => {
    load();
    setPanelVisible(true);
    markAllRead();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {!!teamName && (
          <Text style={styles.team} numberOfLines={1}>
            {teamName}
          </Text>
        )}
      </View>

      <Pressable onPress={handleOpenBell} hitSlop={10} style={styles.bell}>
        <Ionicons name="notifications-outline" size={21} color={colors.textStrong} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={panelVisible} transparent animationType="fade" onRequestClose={() => setPanelVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setPanelVisible(false)}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>알림</Text>
            <ScrollView contentContainerStyle={styles.panelList}>
              {loading && notifications.length === 0 ? (
                <ActivityIndicator color={colors.green} style={styles.loadingIndicator} />
              ) : notifications.length === 0 ? (
                <Text style={styles.emptyText}>알림이 없어요</Text>
              ) : (
                notifications.map((n) => (
                  <View key={n.id} style={styles.item}>
                    <Text style={styles.itemTitle}>{n.title}</Text>
                    <Text style={styles.itemBody}>{n.body}</Text>
                    <Text style={styles.itemTime}>
                      {new Date(n.created_at).toLocaleString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  team: { color: '#5F6B66', fontSize: 12, fontWeight: '600', flexShrink: 1 },

  bell: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.bgRoot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  overlay: { flex: 1 },
  panel: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 300,
    maxHeight: 380,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  panelList: { gap: 12 },
  emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  loadingIndicator: { paddingVertical: 20 },
  item: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12 },
  itemTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  itemBody: { marginTop: 2, color: colors.textMuted, fontSize: 12 },
  itemTime: { marginTop: 4, color: colors.textFaint, fontSize: 11 },
});
