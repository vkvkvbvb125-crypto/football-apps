// src/components/Dialog.tsx — 확인·알림 대화상자
//
// RN의 Alert는 react-native-web에서 아무 일도 하지 않는다. 그래서 화면마다
// `Platform.OS === 'web' ? window.confirm(...) : Alert.alert(...)` 분기를 손으로 썼는데,
// 웹 쪽은 브라우저 크롬 창이라 "localhost:8082 내용:" 같은 머리말이 붙고 앱과 따로 논다.
//
// 분기를 이 파일 하나로 모은다.
//
// ── ⚠ 2026-09-29: 네이티브도 커스텀으로 바꿨다 (서랍 23) ─────────
// 전에는 네이티브에서 시스템 `Alert`를 썼다. 그게 **앱 테마가 아니라 시스템 테마**를
// 따라서, 앱은 다크인데 대화상자만 **흰색**으로 떴다.
//
// ⚠ **바꾸기 전에 제일 위험한 것부터 쟀다 — 「Modal 위에 뜨는가」.**
//   시스템 Alert은 OS 창이라 다른 Modal 위에도 떴다. 커스텀은 그냥 RN Modal이라
//   **중첩 Modal**이 되는데, 안드로이드에서 그건 알려진 함정이다.
//   `MemberListModal` 안에서 강퇴 확인을 띄워 **실제로 뜨는 것을 봤다**
//   (2026-09-29, 기기). 안 떴으면 이 변경 자체를 접을 참이었다.
//
// ⚠ **한 앱에 두 종류를 섞지 않는다.** 「이 자리만 Alert」 같은 예외를 두면
//   사용자는 같은 앱에서 다른 대화상자를 보게 된다. 그게 흰 대화상자보다 나쁘다.
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { radius, type Palette } from '../theme';
import { useThemed } from '../lib/useThemed';

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
  /* ④ 탐침(2026-09-29) — 호스트가 붙어 있으면 플랫폼과 무관하게 커스텀으로 간다 */
  if (push) return new Promise((resolve) => push!({ ...req, resolve }));
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
  const { colors, styles } = useThemed(makeStyles);
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  useEffect(() => {
    // 밀린 것을 덮어쓰지 않고 쌓는다 — 덮어쓰면 앞 요청의 promise가 영영 안 풀려서
    // 그걸 기다리던 코드가 그대로 멈춘다
    push = (req) => setQueue((q) => [...q, req]);
    return () => {
      push = null;
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const close = (ok: boolean) => {
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  /*
    ⚠ **바깥(스크림) 탭과 뒤로가기는 규칙이 다르다.**

      알림·확인   바깥 탭으로 닫힌다 → 취소로 resolve
      파괴적      바깥 탭으로 **안 닫는다** — 손이 스치면 지워지는 일을 만들지 않는다
      뒤로가기    **셋 다 닫힌다** → 취소로 resolve

    ⚠ 파괴적도 뒤로가기는 막지 않는다. 막으면 `await confirmAction(...)`이 영영 안
      풀려서 **부르던 화면이 그대로 멈춘다** — 지워지는 것보다 나쁘다.
      「닫히는 모든 길은 반드시 resolve한다」가 이 파일의 규칙이다.
  */
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <Pressable
        style={styles.backdrop}
        onPress={current.destructive ? undefined : () => close(false)}
        accessible={false}
      >
        {/*
          ⚠ **카드도 Pressable이다.** 안 그러면 카드를 누른 것이 스크림까지 내려가
            내용을 읽으려고 짚었을 뿐인데 대화상자가 닫힌다. RN은 자식이 먼저 먹는다.
            `accessible={false}`라 스크린리더에는 버튼으로 안 읽힌다.
        */}
        <Pressable style={styles.card} onPress={() => {}} accessible={false}>
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={styles.actions}>
            {current.cancelable && (
              <Pressable
                accessibilityRole="button"
                onPress={() => close(false)}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  message: { color: colors.textMuted, fontSize: 13, fontWeight: '500', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, height: 46, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  cancelBtn: { backgroundColor: colors.overlaySoft, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  confirmBtn: { backgroundColor: colors.green },
  confirmText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  dangerBtn: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: colors.danger },
  dangerText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  });
