// src/features/settlement/components/ShareLinkSheet.tsx
// Reference 「총무④ 정산 링크 공유」 구현.
//
// 정산을 만든 직후에 뜬다: 큰 체크 → "정산 링크가 생성되었습니다!" → 링크 상자 →
// 카카오톡 / 문자 / 링크 복사 / 더보기 → "공유 완료".
//
// 링크는 송금을 수행하지 않는다 — 받은 사람의 앱에서 해당 정산 상세를 열 뿐이다
// (settlement-flow.md 「딥링크」).
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Linking, Modal, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 공유할 링크 — settlementLink(id) */
  link: string;
  /** 공유 메시지 전문 — settlementShareMessage(...) */
  message: string;
}

export function ShareLinkSheet({ visible, onClose, link, message }: Props) {
  const [copied, setCopied] = useState(false);

  const openShareSheet = () => {
    Share.share({ message }).catch(() => {
      // 사용자가 공유 시트를 닫은 경우 — 조용히 무시
    });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openSms = () => {
    // 본문 구분자가 플랫폼마다 다르다 — iOS는 '&', Android는 '?'
    const separator = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${separator}body=${encodeURIComponent(message)}`).catch(() => {
      // 문자 앱이 없는 기기(태블릿·웹) — 공유 시트로 넘긴다
      openShareSheet();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
            </Pressable>
            <Text style={styles.title}>정산 링크 공유</Text>
            <View style={styles.backBtn} />
          </View>

          <View style={styles.body}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={44} color={colors.green} />
            </View>
            <Text style={styles.headline}>정산 링크가 생성되었습니다!</Text>

            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>
                {link}
              </Text>
            </View>

            <View style={styles.actionRow}>
              {/* 카카오 SDK를 붙이기 전이라 OS 공유 시트를 띄우고 거기서 카카오톡을 고른다.
                  마크는 로그인 화면의 카카오 버튼과 같아야 한다 — 같은 서비스가 화면마다 다르게 생기면
                  같은 것으로 안 읽힌다 (채운 말풍선 + 검정, 노랑 원). */}
              <ShareAction
                label="카카오톡"
                icon="chatbubble"
                iconColor={colors.kakaoText}
                circleStyle={styles.circleKakao}
                onPress={openShareSheet}
              />
              <ShareAction label="문자" icon="chatbox-outline" onPress={openSms} />
              <ShareAction
                label={copied ? '복사됨' : '링크 복사'}
                icon={copied ? 'checkmark' : 'copy-outline'}
                iconColor={copied ? colors.green : colors.textStrong}
                onPress={copyLink}
              />
              <ShareAction label="더보기" icon="ellipsis-horizontal" onPress={openShareSheet} />
            </View>
          </View>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>공유 완료</Text>
          </Pressable>
          <Text style={styles.note}>링크를 누르면 앱에서 각자 낼 금액과 계좌를 볼 수 있어요</Text>
        </View>
      </View>
    </Modal>
  );
}

function ShareAction({
  label,
  icon,
  iconColor = colors.textStrong,
  circleStyle,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  circleStyle?: object;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={[styles.actionCircle, circleStyle]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.bgScreen,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 26,
  },
  pressed: { opacity: 0.85 },

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenTint,
    borderWidth: 2,
    borderColor: colors.greenDeep,
  },
  headline: {
    color: colors.green,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 18,
    textAlign: 'center',
  },

  linkBox: {
    alignSelf: 'stretch',
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
  },
  linkText: { color: colors.green, fontSize: 12, fontWeight: '600' },

  actionRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 22 },
  action: { flex: 1, alignItems: 'center', gap: 7, paddingVertical: 4 },
  // 48px — 탭 타겟 최소 크기(44px)를 넘긴다
  actionCircle: {
    width: 48,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // 카카오톡은 브랜드 고정색 — design.md 「예외」의 유일한 항목
  circleKakao: { backgroundColor: colors.kakao, borderColor: colors.kakao },
  actionLabel: { color: colors.textBody, fontSize: 11, fontWeight: '700' },

  cta: {
    height: 52,
    marginHorizontal: 20,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  note: { color: colors.textFaint, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 10 },
});
