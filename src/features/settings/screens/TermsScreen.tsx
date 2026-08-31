// src/features/settings/screens/TermsScreen.tsx — 약관 및 정책
//
// 설정 화면의 「약관 및 정책 ›」에서 들어온다.
//
// 왜 화면으로 뺐나. 문서가 다섯이라(만 14세 · 이용약관 · 개인정보 · 위치기반 ·
// 마케팅) 설정 화면에 펼치면 다섯 줄이 통째로 들어앉는다. 심사 때문에 반드시
// 있어야 하지만 사용자가 자주 여는 곳은 아니라, 한 줄로 접고 안에서 편다.
//
// ⚠ 스토어 심사가 이 경로를 본다(App Store 5.1.1 / Play 데이터 안전).
//   storeready.check.ts가 여기에 TERMS.map과 TermsDocModal이 있는지 세고,
//   설정 화면에 이 화면으로 가는 줄이 있는지도 함께 센다 — 둘 중 하나만 있으면
//   「줄은 있는데 안 열린다」 또는 「화면은 있는데 갈 수 없다」가 된다.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { TERMS, type TermDoc } from '../../auth/terms';
import { TermsDocModal } from '../../auth/components/TermsDocModal';
import { colors, radius } from '../../../theme';

export function TermsScreen({ navigation }: any) {
  const [openDoc, setOpenDoc] = useState<TermDoc | null>(null);

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>약관 및 정책</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/*
          약관·개인정보처리방침 — 가입할 때 한 번 보고 나면 앱 안에서 다시 볼
          방법이 없었다. 심사에서 요구하는 자리이기도 하다.

          웹(kickday.app/terms)으로 보내지 않는다 — 배포본이 앱 빌드보다 뒤처질 수
          있고 지하철에서 안 열린다. 본문이 terms.ts에 있으니 그대로 띄운다.
        */}
        <View style={styles.card}>
          {/* 화면 제목과 글자까지 같았다. 카드 제목을 뺀다. */}
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
      </ScrollView>
      <TermsDocModal doc={openDoc} onClose={() => setOpenDoc(null)} />
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
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
});
