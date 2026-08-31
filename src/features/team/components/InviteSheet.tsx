// src/features/team/components/InviteSheet.tsx
// 초대 — QR · 코드 · 링크 공유를 한자리에.
//
// 진입로가 셋이다(홈 초대 블록 / 얇은 바 / 멤버 목록 끝 행). 셋 다 Share.share를
// 바로 열고 있었는데, 그러면 「초대」가 어디서 눌렀느냐에 따라 다른 걸 하게 되고
// QR을 놓을 자리도 없다.
//
// 더 큰 이유: QR은 대면용이고 Share.share는 원격 공유다. 바로 열리면 눈앞의 사람에게
// 화면을 보여주려는 총무가 시스템 공유 시트를 먼저 통과해야 한다. 시트로 모아서
// 「보낼지 / 보여줄지」를 그 자리에서 고르게 한다.
//
// ── 그 근거의 절반이 해소됐다 ────────────────────────────────────────
//
// 팀 홈의 초대 카드에 실물 QR이 생겼다(124pt, 스캔된다). 「QR을 놓을 자리가 없다」는
// 이제 그 카드에는 해당하지 않는다 — 대면 초대는 카드에서 끝난다.
//
// 그래도 이 시트를 남긴다. 남은 근거가 둘이다.
//
//   하나. 여기에만 있는 것이 있다 — 「링크 복사」다. 카드의 복사는 초대 코드(7248-6805)고
//        이건 URL이라 다른 값이다.
//   둘.  진입로가 카드 하나가 아니다. 멤버 목록 끝의 「멤버 초대하기」(TeamMembersTab)는
//        팀 홈 밖이라 그쪽에서 온 사람은 카드 QR을 못 본다. 그 경로에는 시트의 QR이
//        여전히 유일한 QR이다.
//
// 그래서 역할이 갈렸다: 카드는 대면, 시트는 원격 공유와 링크 복사(그리고 카드를 못 본
// 경로의 QR).
//
// 스캐너(expo-camera)는 만들지 않는다. 상대가 기본 카메라로 찍으면
// https://…/invite-redirect?code= 가 열리고 그 페이지가 kickday://join으로 넘긴다 —
// 이미 있는 경로다. 스캐너를 만들면 권한 요청·거부 처리가 딸려오는데 얻는 게 없다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Modal, Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

interface Props {
  visible: boolean;
  onClose: () => void;
  teamName: string;
  /** teams.invite_code 원문 — 하이픈 없는 8자리 */
  inviteCode: string;
  /** invite-redirect 함수 URL. QR에 담기는 문자열이자 공유 링크다 */
  inviteUrl: string;
}

/** QR은 대비가 전부다 — 다크 배경 위에 그대로 그리면 카메라가 못 읽는다 */
const QR_SIZE = 188;

export function InviteSheet({ visible, onClose, teamName, inviteCode, inviteUrl }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  // 표시는 4자리씩 끊고, 복사·QR은 원문을 쓴다 — 하이픈이 섞여 들어가면 코드가 안 맞는다
  const codeDisplay = inviteCode.replace(/(.{4})(?=.)/g, '$1-');

  const flash = (what: 'code' | 'link') => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const shareLink = () => {
    Share.share({
      message: `${teamName}에 초대할게요! 아래 링크를 눌러 참여해주세요.\n${inviteUrl}`,
    }).catch(() => {
      // 사용자가 공유 시트를 닫은 경우 — 조용히 무시
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.headBtn} />
            <Text style={styles.title}>멤버 초대</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn} accessibilityRole="button" accessibilityLabel="닫기">
              <Ionicons name="close" size={22} color={colors.textStrong} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* 흰 판 위에 그린다. QR은 명암 대비로 읽히는데 다크 표면 위에서는
                카메라가 모듈 경계를 못 잡는다 — 여백(quiet zone)도 흰색이어야 한다 */}
            <View style={styles.qrPlate}>
              <QRCode value={inviteUrl} size={QR_SIZE} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <Text style={styles.qrHint}>카메라로 찍으면 바로 참여할 수 있어요</Text>

            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(inviteCode);
                flash('code');
              }}
              accessibilityRole="button"
              accessibilityLabel={`초대 코드 ${inviteCode} 복사`}
              style={({ pressed }) => [styles.codeRow, pressed && styles.pressed]}
            >
              <Text style={styles.codeLabel}>초대 코드</Text>
              <Text style={styles.code} selectable>
                {codeDisplay}
              </Text>
              <Ionicons
                name={copied === 'code' ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied === 'code' ? colors.green : colors.textFaint}
              />
            </Pressable>

            <Pressable
              onPress={shareLink}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.bgRoot} />
              <Text style={styles.primaryText}>초대 링크 보내기</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(inviteUrl);
                flash('link');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>{copied === 'link' ? '링크를 복사했어요' : '링크 복사'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.bgScreen,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 28,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  qrPlate: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: radius.card,
    borderCurve: 'continuous',
  },
  qrHint: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  codeLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  code: { flex: 1, color: colors.textStrong, fontSize: 16, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },

  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'stretch',
    backgroundColor: colors.green,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    paddingVertical: 14,
  },
  primaryText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

  secondary: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10 },
  secondaryText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  pressed: { opacity: 0.75 },
  });
