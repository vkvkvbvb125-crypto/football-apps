// src/features/settings/screens/NotificationSettingsScreen.tsx — 알림 수신 설정
//
// 설정 화면의 「알림 설정 ›」에서 들어온다.
//
// 왜 화면으로 뺐나. 토글 넷에 각자 설명이 붙어서 카드 하나가 세로로 길었고,
// 설정 화면의 절반을 먹었다. 아래에 있는 약관·고객의 소리·로그아웃이 스크롤
// 밖으로 밀렸다. 자주 여는 것은 설정 화면이고 알림 설정은 한 번 정하면 끝이라,
// 긴 쪽이 한 겹 안으로 들어가는 게 맞다.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { useTeamStore } from '../../team/stores/teamStore';
import { colors, radius } from '../../../theme';
import { getPushStatus } from '../../notifications/services/pushService';

export function NotificationSettingsScreen({ navigation }: any) {
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const updateNotifyPref = useTeamStore((s) => s.updateNotifyPref);

  const me = members.find((m) => m.id === activeTeam?.membershipId) ?? null;

  // 마운트 때 한 번 읽는다 — 등록은 로그인 직후 RootNavigator에서 이미 끝났다.
  const [pushStatus] = useState(getPushStatus);

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>알림 설정</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/*
          알림 설정 — 팀 화면에서 옮겨 왔다.

          team_members.notify_* 에 저장되는 개인 설정인데 팀 화면의 설정 탭에 있었고,
          그 탭 입구(4버튼 그리드)를 걷어내면서 도달 불가가 됐다. 알림을 끌 방법이
          아예 없는 상태였다. 계정에 딸린 값이라 자리는 여기가 맞다.
        */}
        {!!me && (
          <View style={styles.card}>
            {/* 화면 제목이 「알림 설정」이라 카드 제목 「알림」은 같은 말을 두 번 한다.
                걷어낸 「설정 → 설정 → 설정」과 같은 모양이다. */}
            {(
              [
                /*
                  알림 종류는 여덟인데 토글은 넷이다. 여덟을 그대로 늘어놓으면
                  설정이 길어져 아무도 안 본다 — 무엇을 끄는지는 묶음 이름과
                  아래 설명으로 알린다.
                */
                {
                  col: 'notify_match' as const,
                  label: '경기 알림',
                  hint: '새 경기 · 참석 마감 · 우천 안내',
                  on: me.notifyMatch,
                },
                {
                  col: 'notify_announcement' as const,
                  label: '공지 알림',
                  hint: '총무가 올린 공지',
                  on: me.notifyAnnouncement,
                },
                {
                  col: 'notify_board' as const,
                  label: '게시판 알림',
                  hint: '나를 언급하거나 내 글에 댓글이 달릴 때',
                  on: me.notifyBoard,
                },
                {
                  col: 'notify_settlement' as const,
                  label: '정산 알림',
                  hint: '회비 독촉',
                  on: me.notifySettlement,
                },
              ]
            ).map((row) => (
              <Pressable
                key={row.col}
                onPress={() => updateNotifyPref(me.id, row.col, !row.on)}
                accessibilityRole="switch"
                accessibilityState={{ checked: row.on }}
                style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.toggleTextCol}>
                  <Text style={styles.toggleLabel}>{row.label}</Text>
                  <Text style={styles.toggleHint}>{row.hint}</Text>
                </View>
                <View style={[styles.toggle, row.on && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, row.on && styles.toggleKnobOn]} />
                </View>
              </Pressable>
            ))}
            {pushStatus !== 'ok' && pushStatus !== 'unknown' && (
              <Text style={styles.notifyHint}>
                {pushStatus === 'denied'
                  ? '기기 설정에서 알림이 꺼져 있어요. 켜야 위 알림이 도착해요'
                  : '지금 이 기기에서는 푸시를 받을 수 없어요. 앱 안에서는 알림이 그대로 쌓여요'}
              </Text>
            )}
            <Text style={styles.notifyHint}>이 팀에서 오는 알림만 조절해요. 다른 팀은 따로 설정합니다</Text>
          </View>
        )}
      </ScrollView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  toggleLabel: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
  toggle: {
    width: 42, height: 24, borderRadius: radius.pill, padding: 2,
    backgroundColor: colors.neutralFill, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.green },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bgRoot },
  toggleKnobOn: { alignSelf: 'flex-end' },
  toggleTextCol: { flex: 1 },
  toggleHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  notifyHint: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.8 },
  body: { padding: 20, paddingBottom: 60, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
});
