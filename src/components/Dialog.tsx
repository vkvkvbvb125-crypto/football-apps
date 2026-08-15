// src/components/Dialog.tsx — 확인·알림 대화상자
//
// RN의 Alert는 react-native-web에서 아무 일도 하지 않는다. 그래서 화면마다
// `Platform.OS === 'web' ? window.confirm(...) : Alert.alert(...)` 분기를 손으로 썼는데,
// 웹 쪽은 브라우저 크롬 창이라 "localhost:8082 내용:" 같은 머리말이 붙고 앱과 따로 논다.
//
// 분기를 이 파일 하나로 모은다. 네이티브는 그대로 Alert를 쓰고(네이티브에선 그게 맞는 답이다),
// 웹에서는 앱 톤에 맞는 모달을 띄운다.
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { colors, radius } from '../theme';

interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  /** 취소 버튼을 그릴지 — 알림(확인만)과 확인(취소/확인)을 가른다 */
  cancelable: boolean;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

/** DialogHost가 마운트되면서 자기 큐에 넣는 함수를 여기 꽂는다 */
let push: ((req: DialogRequest) => void) | null = null;

function request(req: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise((resolve) => {
      if (!req.cancelable) {
        Alert.alert(req.title, req.message, [{ text: req.confirmLabel, onPress: () => resolve(true) }]);
        return;
      }
      Alert.alert(req.title, req.message, [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        {
          text: req.confirmLabel,
          style: req.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]);
    });
  }

  // 호스트가 아직 안 붙었으면 브라우저 창으로라도 묻는다.
  // 조용히 false를 돌려주면 사용자가 누른 삭제가 아무 일도 없이 사라진다.
  if (!push) {
    const text = req.message ? `${req.title}\n\n${req.message}` : req.title;
    if (!req.cancelable) {
      window.alert(text);
      return Promise.resolve(true);
    }
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => push!({ ...req, resolve }));
}

/** 알림 한 줄 — 확인 버튼만. 결과를 기다릴 일이 없어 값을 돌려주지 않는다 */
export function alertMessage(title: string, message?: string) {
  void request({ title, message, confirmLabel: '확인', cancelable: false, destructive: false });
}

/** 되돌릴 수 없는 동작을 묻는다. 사용자가 확인을 누르면 true */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작 — 확인 버튼이 빨강이 된다 */
  destructive?: boolean;
}): Promise<boolean> {
  return request({
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel ?? '확인',
    cancelable: true,
    destructive: opts.destructive ?? false,
  });
}

/**
 * 웹에서 대화상자가 그려지는 자리. App.tsx에 한 번만 단다.
 * 네이티브에서는 Alert가 알아서 하므로 아무것도 그리지 않는다.
 */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // 밀린 것을 덮어쓰지 않고 쌓는다 — 덮어쓰면 앞 요청의 promise가 영영 안 풀려서
    // 그걸 기다리던 코드가 그대로 멈춘다
    push = (req) => setQueue((q) => [...q, req]);
    return () => {
      push = null;
    };
  }, []);

  if (Platform.OS !== 'web') return null;

  const current = queue[0];
  if (!current) return null;

  const close = (ok: boolean) => {
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={styles.actions}>
            {current.cancelable && (
              <Pressable
                onPress={() => close(false)}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [
                styles.btn,
                current.destructive ? styles.dangerBtn : styles.confirmBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={current.destructive ? styles.dangerText : styles.confirmText}>
                {current.confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  message: { color: colors.textMuted, fontSize: 13, fontWeight: '500', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, height: 46, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  confirmBtn: { backgroundColor: colors.green },
  confirmText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  dangerBtn: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
});
