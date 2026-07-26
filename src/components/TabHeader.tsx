import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationsStore } from '../features/notifications/stores/notificationsStore';

interface TabHeaderProps {
  title: string;
  titleSize?: number;
  iconSize?: number;
}

export function TabHeader({ title, titleSize = 20, iconSize = 22 }: TabHeaderProps) {
  const insets = useSafeAreaInsets();
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
    <View style={[styles.row, { paddingTop: insets.top + 10 }]}>
      <Text style={[styles.title, { fontSize: titleSize }]}>{title}</Text>
      <Pressable onPress={handleOpenBell} hitSlop={8} style={styles.bellWrap}>
        <Ionicons name="notifications-outline" size={iconSize} color="#FFFFFF" />
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
                <ActivityIndicator color="#4ADE80" style={styles.loadingIndicator} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bellWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F87171',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    top: 92,
    right: 16,
    width: 300,
    maxHeight: 380,
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 16,
    boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  panelList: {
    gap: 12,
  },
  emptyText: {
    color: '#8A9490',
    fontSize: 13,
    paddingVertical: 12,
    textAlign: 'center',
  },
  loadingIndicator: {
    paddingVertical: 20,
  },
  item: {
    borderBottomWidth: 1,
    borderBottomColor: '#22302A',
    paddingBottom: 12,
  },
  itemTitle: {
    color: '#E7ECE9',
    fontSize: 13,
    fontWeight: '700',
  },
  itemBody: {
    marginTop: 2,
    color: '#8A9490',
    fontSize: 12,
  },
  itemTime: {
    marginTop: 4,
    color: '#5A625E',
    fontSize: 11,
  },
});
