// src/features/settings/screens/MySettingsScreen.tsx — 내 설정
//
// 계정에 딸린 값만 둔다. 팀에 딸린 값(회비·정원·정기모임)은 팀 설정 화면 몫이다.
// 팀을 옮겨도 따라오는 것 = 여기, 지금 보는 팀에만 해당하는 것 = 저기.
import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { alertMessage, confirmAction } from '../../../components/Dialog';
import { useAuthStore } from '../../auth/stores/authStore';
import { useTeamStore } from '../../team/stores/teamStore';
import { deleteAccount, describeBlockers, fetchDeletionStatus } from '../services/accountService';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { accountLabel } from '../utils/accountLabel';
import { toUserMessage } from '../../../lib/dbError';

/*
  문의 주소. terms.ts의 PRIVACY_OFFICER.email과 같은 곳이다 —
  Cloudflare Email Routing으로 전달된다. 두 곳에 적히지만 뜻이 다르다:
  거기는 법정 기재 사항(개인정보 보호책임자)이고 여기는 일반 문의 창구다.
  같은 주소를 쓰는 것은 지금 사람이 하나뿐이기 때문이지 같은 역할이라서가 아니다.
*/
const SUPPORT_EMAIL = 'contact@kickday.app';

/**
 * 목록의 한 줄. 좌측 아이콘 + 라벨 + 우측 셰브론.
 *
 * 컴포넌트로 뺀 이유는 재사용이 아니라 **줄들이 서로 달라지지 않게** 하기 위해서다.
 * 다섯 줄을 각자 쓰면 그중 하나만 padding이 다르거나 셰브론을 빠뜨리는 일이 생기고,
 * 그건 화면을 열어봐야만 보인다.
 */
function SettingsRow({
  icon,
  label,
  onPress,
  disabled,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 되돌릴 수 없는 동작. 글자와 아이콘이 빨개진다 */
  danger?: boolean;
  /** 묶음의 마지막 줄 — 구분선을 안 그린다 */
  last?: boolean;
}) {
  const { colors, styles } = useThemed(makeStyles);
  const tint = danger ? colors.danger : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivided,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={19} color={tint} />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {/* 셰브론은 danger 줄에도 그린다 — 없으면 그 줄만 「눌리지 않는 것」처럼 보인다 */}
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

export function MySettingsScreen({ navigation }: any) {
  const { colors, styles } = useThemed(makeStyles);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const activeTeam = useTeamStore((s) => s.activeTeam);
  const members = useTeamStore((s) => s.members);

  const me = members.find((m) => m.id === activeTeam?.membershipId) ?? null;

  const [deleting, setDeleting] = useState(false);

  /*
    앱 버전 — app.json의 expo.version을 읽는다.

    Constants.expoConfig는 개발 중에는 Metro가 넘겨주고, 배포본에서는 빌드에
    구워진 값을 읽는다. 둘 다 같은 app.json에서 온다.
    ⚠ null이 될 수 있다(만들어진 지 오래된 캐시 등) — 그때는 줄을 비운다.
      「v(알 수 없음)」 같은 문구는 버전이 없는 게 아니라 앱이 고장 난 것처럼 읽힌다.
  */
  const appVersion = Constants.expoConfig?.version ?? '';

  /*
    고객의 소리 — 메일 앱을 연다.

    제목에 버전을 넣는다. 문의 대부분이 「어느 버전이냐」를 되묻는 데서 한 번
    왕복하는데, 여기서 넣으면 그 왕복이 없어진다. 본문은 비운다 —
    자리표시자를 채워 두면 사람들이 그걸 지우지 않고 그 아래에 쓴다.
  */
  const openFeedbackMail = () => {
    const subject = encodeURIComponent(`[KickDay ${appVersion || '버전 미상'}] 문의`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {
      /* 메일 앱이 없는 기기가 있다. 그때는 주소를 알려주는 것 말고 할 수 있는 게 없다 */
      alertMessage('메일 앱을 열지 못했어요', `${SUPPORT_EMAIL} 로 보내주세요`);
    });
  };

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
      /*
        여기 오는 것은 위 fetchDeletionStatus 판정을 **통과한 뒤**의 실패다 —
        막힌 이유는 이미 describeBlockers가 말했고 갈 곳까지 데려갔다.
        그래서 여기서는 덮는 게 맞다. 원문은 toUserMessage가 콘솔에 남긴다.
      */
      alertMessage('탈퇴하지 못했어요', toUserMessage(e, {}, 'deleteAccount'));
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
          헤더 없는 행 넷.

          「내 정보 / 앱 설정 / 도움말 / 기타」로 나눌 수도 있었지만, 행이 넷뿐이라
          섹션 헤더가 넷이면 헤더가 내용보다 많아진다. 분류는 목록이 길 때 비로소
          정보가 된다 — 넷을 넷으로 나누는 것은 그냥 소음이다.

          「계정」만 헤더를 갖는다. 그 아래가 되돌릴 수 없는 동작이라 나머지와
          같은 줄로 이어지면 안 된다.
        */}
        <View style={styles.rowGroup}>
          <SettingsRow
            icon="notifications-outline"
            label="알림 설정"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          {/*
            화면 모드 — 알림 바로 아래. 둘 다 「앱이 어떻게 굴지」라 이웃이 맞다.
            우측에 지금 값을 적지 않는다. 「기기 설정 따르기」는 길어서 줄이 밀리고,
            무엇보다 **지금 화면이 이미 그 값을 보여주고 있다** — 밝으면 밝은 것이다.
          */}
          <SettingsRow
            icon="contrast-outline"
            label="화면 모드"
            onPress={() => navigation.navigate('ThemeSettings')}
          />
          {/*
            팀 설정으로 가는 줄. 여기서 팀 값을 고치게 하지 않는다 —
            팀 설정 화면이 이미 있고 진입로가 둘이다(팀 히어로의 「팀 설정 ›」,
            팀 화면 타일). 셋째를 만들면 같은 값을 세 곳에서 고치게 되고,
            어느 화면이 최신인지 아무도 모르게 된다.
          */}
          <SettingsRow
            icon="people-outline"
            label="팀 설정"
            onPress={() => navigation.navigate('TeamSettings')}
          />
          <SettingsRow
            icon="document-text-outline"
            label="약관 및 정책"
            onPress={() => navigation.navigate('Terms')}
          />
          {/*
            고객의 소리 — 메일 앱을 연다. 문의 화면을 만들지 않는다. 만들면
            받는 곳(테이블·알림·답장 경로)이 딸려 오는데, 지금 문의는 하루 0건이다.
            contact@kickday.app은 Cloudflare Email Routing으로 전달되고 있고
            terms.ts의 개인정보 보호책임자 주소와 같은 곳이다.
          */}
          <SettingsRow
            icon="mail-outline"
            label="고객의 소리"
            onPress={openFeedbackMail}
            last
          />
        </View>

        <Text style={styles.sectionHeader}>계정</Text>
        <View style={styles.rowGroup}>
          {/*
            탈퇴는 앱 안에 있어야 한다 (App Store 5.1.1(v)). 「고객센터 문의」로는 안 된다.
            로그아웃과 떨어뜨려 놓는다 — 둘 다 「나가기」로 보여서 붙여 놓으면 잘못 누른다.
            지금은 로그아웃이 화면 맨 아래 텍스트 링크라 그 거리가 충분하다.
          */}
          <SettingsRow
            icon="trash-outline"
            label={deleting ? '확인 중…' : '회원 탈퇴'}
            onPress={confirmDeleteAccount}
            disabled={deleting}
            danger
            last
          />
        </View>

        {/*
          버전과 로그아웃 — 레퍼런스를 따라 화면 맨 아래 가운데.

          로그아웃을 버튼에서 텍스트 링크로 내렸다. 파괴적 동작을 눈에 덜 띄게
          하는 쪽이 맞다 — 테두리 친 버튼은 「눌러야 하는 것」으로 읽힌다.

          버전은 app.json의 version을 읽는다. 하드코딩하면 올릴 때마다 두 곳을
          고쳐야 하고, 한 곳을 잊으면 화면이 거짓말을 한다.
        */}
        <View style={styles.footer}>
          <Text style={styles.version}>v{appVersion}</Text>
          <Pressable onPress={confirmSignOut} hitSlop={10} accessibilityRole="button">
            <Text style={styles.signOutLink}>로그아웃</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  /*
    목록 묶음 — 카드 하나 안에 줄들이 이어진다.
    줄마다 카드를 주면 사이 여백이 생겨서 「따로따로인 버튼 넷」으로 읽힌다.
    한 면 위에 구분선으로 나누면 「하나의 목록」이 된다.
  */
  rowGroup: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15 },
  /* 아이콘 뒤에서 시작한다 — 왼쪽 끝까지 그으면 아이콘 열이 끊겨 보인다 */
  rowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { flex: 1, color: colors.textBody, fontSize: 14, fontWeight: '600' },
  rowLabelDanger: { color: colors.danger },

  sectionHeader: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: -4,
    marginLeft: 4,
  },

  body: { padding: 20, paddingBottom: 60, gap: 14 },

  footer: { alignItems: 'center', gap: 10, marginTop: 18 },
  version: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
  /* 링크지 버튼이 아니다 — 테두리도 배경도 없다 */
  signOutLink: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },

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





  });
