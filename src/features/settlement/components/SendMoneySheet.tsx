// src/features/settlement/components/SendMoneySheet.tsx
// 송금 앱 선택 시트 — 계좌·금액이 미리 채워진 송금 화면을 딥링크로 연다.
// 실제 스킴은 앱 버전에 따라 바뀔 수 있으니 Linking.canOpenURL로 설치 여부를 확인하고,
// 열 수 없으면 계좌 복사로 폴백한다.
import { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors } from '../../../theme';

const REMEMBER_KEY = 'kickday.sendApp';

export interface SendApp {
  id: string;
  name: string;
  mark: string;
  bg: string;
  fg: string;
  tag?: string;
  meta: string;
  /** 계좌/금액을 채운 딥링크. 앱별로 지원 범위가 다르다. */
  buildUrl: (p: { bankName: string; accountNo: string; amount: number }) => string;
}

/** 스킴은 프로젝트에서 실기기 테스트 후 확정하세요. */
export const SEND_APPS: SendApp[] = [
  {
    id: 'toss',
    name: '토스',
    mark: 'T',
    bg: 'rgba(49,116,255,0.14)',
    fg: '#5B94FF',
    tag: '가장 빠름',
    meta: '계좌·금액 자동 입력',
    buildUrl: ({ bankName, accountNo, amount }) =>
      `supertoss://send?bank=${encodeURIComponent(bankName)}&accountNo=${accountNo}&amount=${amount}`,
  },
  {
    id: 'kakaobank',
    name: '카카오뱅크',
    mark: 'k',
    bg: 'rgba(254,229,0,0.16)',
    fg: '#FEE500',
    meta: '계좌·금액 자동 입력',
    buildUrl: ({ accountNo, amount }) => `kakaobank://transfer?accountNo=${accountNo}&amount=${amount}`,
  },
  {
    id: 'kb',
    name: 'KB국민은행',
    mark: 'KB',
    bg: 'rgba(255,188,0,0.12)',
    fg: '#E0A82E',
    meta: '계좌 자동 입력 · 금액 직접 확인',
    buildUrl: ({ accountNo }) => `kbbank://transfer?accountNo=${accountNo}`,
  },
  {
    id: 'shinhan',
    name: '신한은행',
    mark: 'S',
    bg: 'rgba(0,101,180,0.14)',
    fg: '#5D9FD6',
    meta: '계좌 자동 입력 · 금액 직접 확인',
    buildUrl: ({ accountNo }) => `shinhan-sr-ansimclick://transfer?accountNo=${accountNo}`,
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  bankName: string;
  accountNo: string;
  holder: string;
  amount: number;
  /** 계좌 복사 폴백이 실행됐을 때 (토스트 표시용) */
  onCopied?: () => void;
  /** 기억된 앱이 바뀌었을 때 */
  onRemember?: (appId: string | null) => void;
}

export function SendMoneySheet({
  visible,
  onClose,
  bankName,
  accountNo,
  holder,
  amount,
  onCopied,
  onRemember,
}: Props) {
  const [pick, setPick] = useState<string>(SEND_APPS[0].id);
  const [remember, setRemember] = useState(true);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  // 설치 여부 확인 (iOS는 app.json의 LSApplicationQueriesSchemes에 스킴 등록 필요)
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    Promise.all(
      SEND_APPS.map(async (a) => {
        try {
          const url = a.buildUrl({ bankName, accountNo, amount });
          const ok = await Linking.canOpenURL(url);
          return [a.id, ok] as const;
        } catch {
          return [a.id, false] as const;
        }
      })
    ).then((pairs) => {
      if (!cancelled) setInstalled(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, bankName, accountNo, amount]);

  const picked = useMemo(() => SEND_APPS.find((a) => a.id === pick) ?? SEND_APPS[0], [pick]);
  const pickedInstalled = installed[picked.id] !== false;

  const copyAccount = async () => {
    await Clipboard.setStringAsync(`${bankName} ${accountNo}`);
    onCopied?.();
  };

  const confirm = async () => {
    if (remember) {
      await AsyncStorage.setItem(REMEMBER_KEY, picked.id);
      onRemember?.(picked.id);
    } else {
      await AsyncStorage.removeItem(REMEMBER_KEY);
      onRemember?.(null);
    }
    onClose();
    if (!pickedInstalled) {
      await copyAccount();
      return;
    }
    try {
      await Linking.openURL(picked.buildUrl({ bankName, accountNo, amount }));
    } catch {
      await copyAccount();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.head}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.title}>어떤 앱으로 보낼까요?</Text>
              <Text style={styles.subtitle}>계좌·금액이 미리 입력된 송금 화면이 열려요</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <View style={styles.target}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.targetLabel}>받는 곳</Text>
              <Text style={styles.targetAccount}>
                {bankName} {accountNo}
              </Text>
              <Text style={styles.targetHolder}>예금주 {holder}</Text>
            </View>
            <Text style={styles.amount}>{amount.toLocaleString()}원</Text>
          </View>

          <View style={{ gap: 8 }}>
            {SEND_APPS.map((a) => {
              const on = pick === a.id;
              const has = installed[a.id] !== false;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setPick(a.id)}
                  style={[styles.appRow, on && styles.appRowOn, !has && styles.appRowOff]}
                >
                  <View style={[styles.appIcon, { backgroundColor: a.bg }, !has && { opacity: 0.45 }]}>
                    <Text style={[styles.appMark, { color: a.fg }]}>{a.mark}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <View style={styles.appNameRow}>
                      <Text style={styles.appName}>{a.name}</Text>
                      {!!a.tag && has && (
                        <View style={styles.appTag}>
                          <Text style={styles.appTagText}>{a.tag}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.appMeta}>{has ? a.meta : '설치되어 있지 않아요 · 계좌 복사로 안내'}</Text>
                  </View>
                  <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>
                    <Text style={[styles.checkMark, !on && { color: 'transparent' }]}>✓</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => setRemember((v) => !v)} style={styles.rememberRow} hitSlop={6}>
            <View style={[styles.rememberBox, remember ? styles.checkOn : styles.checkOff]}>
              <Text style={[styles.checkMark, { fontSize: 10 }, !remember && { color: 'transparent' }]}>✓</Text>
            </View>
            <Text style={styles.rememberText}>다음부터 이 앱으로 바로 열기</Text>
          </Pressable>

          <Pressable onPress={confirm} style={styles.cta}>
            <Text style={styles.ctaText}>{pickedInstalled ? `${picked.name} 열기` : '계좌 복사하기'}</Text>
          </Pressable>
          <Text style={styles.note}>
            송금은 앱에서 본인 확인 후 완료돼요.{'\n'}보낸 뒤 “입금했어요”를 눌러주세요.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

/** 저장된 앱 id (없으면 null) */
export async function getRememberedSendApp() {
  return AsyncStorage.getItem(REMEMBER_KEY);
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 26,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#2C3833', marginBottom: 4 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  close: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  targetLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: '700' },
  targetAccount: { color: colors.textStrong, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  targetHolder: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  amount: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },

  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  appRowOn: { backgroundColor: 'rgba(74,222,128,0.07)', borderColor: '#2F4A3A' },
  appRowOff: { opacity: 0.55 },
  appIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  appMark: { fontSize: 12, fontWeight: '800' },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  appName: { color: colors.textStrong, fontSize: 13.5, fontWeight: '700' },
  appTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(74,222,128,0.14)' },
  appTagText: { color: colors.green, fontSize: 9.5, fontWeight: '800' },
  appMeta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },

  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.green },
  checkOff: { borderWidth: 1.5, borderColor: '#2C3833' },
  checkMark: { color: colors.bgRoot, fontSize: 11, fontWeight: '800' },

  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rememberBox: { width: 19, height: 19, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rememberText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  cta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  note: { color: '#5F6B66', fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
});
