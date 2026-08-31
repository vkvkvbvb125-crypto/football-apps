// src/features/auth/components/TermsDocModal.tsx
// 약관 전문 — 가입 화면과 설정 화면이 같은 것을 본다.
//
// SignUpScreen 안에 있던 모달을 꺼냈다. 설정에서도 약관을 볼 수 있어야 하는데
// (심사 요구 사항이자, 지금은 가입할 때 한 번 보고 나면 다시 볼 방법이 없다)
// 같은 모양을 두 번 쓰면 조항이 바뀔 때 한쪽만 고치게 된다.
//
// 웹 페이지(kickday.app/terms)로 보내지 않는 이유: 배포본이 앱 빌드보다 뒤처질 수
// 있고, 비행기·지하철에서 안 열린다. 본문이 terms.ts에 이미 있어서 띄우면 그만이다.
//
// onAgree가 있으면 「동의합니다」가 붙는다 — 가입 화면은 읽고 바로 동의까지 하고,
// 설정 화면은 이미 동의한 것을 다시 읽을 뿐이라 닫기만 있다.
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import type { TermDoc } from '../terms';

interface Props {
  doc: TermDoc | null;
  onClose: () => void;
  /** 넘기면 「동의합니다」 버튼이 생긴다 (가입 화면 전용) */
  onAgree?: (doc: TermDoc) => void;
}

export function TermsDocModal({ doc, onClose, onAgree }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <Modal visible={!!doc} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.docOverlay}>
        <Pressable style={styles.docBackdrop} onPress={onClose} />
        <View style={styles.docCard}>
          <View style={styles.docHead}>
            <Text style={styles.docTitle}>{doc?.title}</Text>
            <Text style={[styles.docBadge, doc?.required ? styles.docRequired : styles.docOptional]}>
              {doc?.required ? '필수' : '선택'}
            </Text>
          </View>

          <ScrollView style={styles.docScroll} contentContainerStyle={styles.docBody}>
            <Text style={styles.docText} selectable>
              {doc?.body}
            </Text>
          </ScrollView>

          <View style={styles.docFooter}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.docClose, pressed && styles.pressed]}>
              <Text style={styles.docCloseText}>닫기</Text>
            </Pressable>
            {!!onAgree && (
              <Pressable
                onPress={() => doc && onAgree(doc)}
                style={({ pressed }) => [styles.docAgree, pressed && styles.pressed]}
              >
                <Text style={styles.docAgreeText}>동의합니다</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  docOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' },
  docBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  docCard: {
    // 화면을 다 덮지 않는다 — 뒤가 보여야 "잠깐 열어본 것"으로 읽힌다
    maxHeight: '78%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  docHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  docTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  docBadge: { fontSize: 11, fontWeight: '800' },
  docRequired: { color: colors.green },
  docOptional: { color: colors.textDim },

  docScroll: { flexGrow: 0 },
  docBody: { paddingHorizontal: 18, paddingVertical: 16 },
  // 조항이 많아 줄 간격을 넉넉히 — 좁으면 읽다가 줄을 놓친다
  docText: { color: colors.textBody, fontSize: 13, fontWeight: '500', lineHeight: 21 },

  docFooter: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  docClose: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docCloseText: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  docAgree: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  docAgreeText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

  pressed: { opacity: 0.75 },
  });
