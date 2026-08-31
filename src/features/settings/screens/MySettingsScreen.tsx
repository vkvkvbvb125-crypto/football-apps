// src/features/settings/screens/MySettingsScreen.tsx — 내 설정
//
// 계정에 딸린 값만 둔다. 팀에 딸린 값(회비·정원·정기모임)은 팀 설정 화면 몫이다.
// 팀을 옮겨도 따라오는 것 = 여기, 지금 보는 팀에만 해당하는 것 = 저기.
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { useAuthStore } from '../../auth/stores/authStore';
import { TERMS, type TermDoc } from '../../auth/terms';
import { TermsDocModal } from '../../auth/components/TermsDocModal';
import { useTeamStore } from '../../team/stores/teamStore';
import { deleteAccount, describeBlockers, fetchDeletionStatus } from '../services/accountService';
import { colors, radius } from '../../../theme';
import { getPushStatus } from '../../notifications/services/pushService';
import { accountLabel } from '../utils/accountLabel';

export function MySettingsScreen({ navigation }: any) {
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);
  const updateNotifyPref = useTeamStore((s) => s.updateNotifyPref);

  const me = members.find((m) => m.id === activeTeam?.membershipId) ?? null;

  // 마운트 때 한 번 읽는다 — 등록은 로그인 직후 RootNavigator에서 이미 끝났다.
  const [pushStatus] = useState(getPushStatus);
  const [openDoc, setOpenDoc] = useState<TermDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * 탈퇴. 판정은 서버가 하고 여기서는 물어보기만 한다 —
   * 화면이 따로 계산하면 화면은 된다고 하고 서버는 거절하는 상태가 생긴다.
   */
  const confirmDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const status = await fetchDeletionStatus();

      if (!status.can_delete) {
        const { message, handoverTeam } = describeBlockers(status);
        // 총무를 넘겨야 하는 경우에만 갈 곳이 있다. 미납은 본인이 송금하면 끝나서
        // 보낼 화면이 따로 없다.
        if (handoverTeam) {
          const go = await confirmAction({
            title: '아직 탈퇴할 수 없어요',
            message,
            confirmLabel: '총무 넘기러 가기',
          });
          if (go) navigation.navigate('Main', { screen: 'Team', params: { tab: 'members' } });
        } else {
          alertMessage('아직 탈퇴할 수 없어요', message);
        }
        return;
      }

      const ok = await confirmAction({
        title: '정말 탈퇴할까요?',
        message:
          '계정과 프로필, 참석 기록이 지워지고 되돌릴 수 없어요.\n\n' +
          '내가 만든 경기와 공지는 팀에 남습니다 — 팀의 기록이라 지우면 남은 멤버들의 과거가 같이 사라져요.',
        confirmLabel: '탈퇴하기',
        destructive: true,
      });
      if (!ok) return;

      await deleteAccount();
      // 계정이 없어졌으니 세션도 버린다. 안 하면 죽은 토큰으로 화면이 계속 돈다.
      signOut();
    } catch (e: any) {
      alertMessage('탈퇴하지 못했어요', e?.message ?? '잠시 후 다시 시도해 주세요');
    } finally {
      setDeleting(false);
    }
  };

  const confirmSignOut = async () => {
    const ok = await confirmAction({
      title: '로그아웃',
      message: '로그아웃할까요?',
      confirmLabel: '로그아웃',
      destructive: true,
    });
    if (ok) signOut();
  };

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={{ width: 24 }} />
      </View>


      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/*
          프로필 카드 — 카드 전체가 아니라 톱니만 눌린다.

          카드를 통째로 누르게 하면 아바타를 누른 사람이 사진을 바꾸려던 것인지
          상세로 가려던 것인지 갈리지 않는다. 사진 변경은 상세 안에 있으니,
          여기서는 「들어가는 문」 하나만 눌리는 게 맞다.
        */}
        <View style={styles.profileCard}>
          {me?.avatarUrl ? (
            <Image source={{ uri: me.avatarUrl }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatar, styles.profileAvatarEmpty]}>
              <Ionicons name="person" size={26} color={colors.textFaint} />
            </View>
          )}
          <View style={styles.profileTextCol}>
            {/*
              이름은 team_members에서 온다. 팀에 아직 안 들어왔으면 me가 null이라
              빈 줄이 남는다 — 그때는 이메일의 앞부분을 쓴다. 「이름 없음」 같은
              자리표시자를 넣지 않는다. 그건 이름이 지워진 것처럼 읽힌다.
            */}
            <Text style={styles.profileName} numberOfLines={1}>
              {me?.displayName || session?.user.email?.split('@')[0] || ''}
            </Text>
            {/*
              이메일을 그대로 쓰지 않는다. 카카오·네이버 로그인은 auth.users에
              넣으려고 지어낸 주소(kakao-…@users.futsalclub.app)를 갖고 있어서,
              그대로 띄우면 이 자리에 내부 식별자가 뜬다 — 실제로 그렇게 나왔다.
            */}
            <Text style={styles.profileEmail} numberOfLines={1}>
              {accountLabel(session?.user.email)}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('ProfileDetail')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="프로필 상세"
            style={({ pressed }) => [styles.profileGear, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {/*
          알림 설정 — 팀 화면에서 옮겨 왔다.

          team_members.notify_* 에 저장되는 개인 설정인데 팀 화면의 설정 탭에 있었고,
          그 탭 입구(4버튼 그리드)를 걷어내면서 도달 불가가 됐다. 알림을 끌 방법이
          아예 없는 상태였다. 계정에 딸린 값이라 자리는 여기가 맞다.
        */}
        {!!me && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>알림</Text>
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


        {/*
          약관·개인정보처리방침 — 가입할 때 한 번 보고 나면 앱 안에서 다시 볼
          방법이 없었다. 심사에서 요구하는 자리이기도 하다.

          웹(kickday.app/terms)으로 보내지 않는다 — 배포본이 앱 빌드보다 뒤처질 수
          있고 지하철에서 안 열린다. 본문이 terms.ts에 있으니 그대로 띄운다.
        */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>약관 및 정책</Text>
          {TERMS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setOpenDoc(t)}
              accessibilityRole="button"
              accessibilityLabel={`${t.title} 전문 보기`}
              style={({ pressed }) => [styles.docRow, pressed && styles.pressed]}
            >
              {/* label이 아니라 title이다 — label은 가입 화면 체크박스의 문장("…에 동의")이라
                  이미 동의한 사람에게 보여주면 다시 동의하라는 말로 읽힌다. 모달 제목도 title이라
                  label을 쓰면 줄과 제목이 서로 다른 이름이 된다. */}
              <Text style={styles.docRowText}>{t.title}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>계정</Text>
          <Text style={styles.accountEmail}>{accountLabel(session?.user.email)}</Text>
          <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
            <Text style={styles.signOutText}>로그아웃</Text>
          </Pressable>
          {/*
            탈퇴는 앱 안에 있어야 한다 (App Store 5.1.1(v)). 「고객센터 문의」로는 안 된다.
            로그아웃 아래, 구분선 뒤에 둔다 — 둘 다 「나가기」로 보여서 붙여 놓으면 잘못 누른다.
          */}
          <View style={styles.dangerDivider} />
          <Pressable
            onPress={confirmDeleteAccount}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="계정 삭제"
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed, deleting && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.signOutText, styles.deleteText]}>
              {deleting ? '확인 중…' : '계정 삭제'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <TermsDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  /** 프로필 카드 — 아바타 · 이름/이메일 · 톱니 */
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  /* 56~64 사이. 64면 카드가 목록의 행들보다 두 배 넘게 두꺼워진다 */
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.inputBg },
  profileAvatarEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  profileTextCol: { flex: 1, gap: 3 },
  profileName: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  profileEmail: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  profileGear: { padding: 4 },

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
  dangerDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 10 },
  deleteText: { color: colors.danger },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  docRowText: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
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
  cardTitle: { color: colors.textStrong, fontSize: 14, fontWeight: '800', marginBottom: 4 },




  accountEmail: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    marginTop: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
});
