// src/components/WebDebugOverlay.tsx — 웹 전용 진단 오버레이
// 실기기 Safari를 Mac 없이 원격 디버깅할 방법이 없어서 만들었다. 화면 구석의 작은 버튼을
// 누르면 뷰포트 관련 실측값을 화면에 그대로 찍어준다 — 이 패널을 캡처해서 보내주면
// 그 기기에서 실제로 어떤 값이 잡히는지 코드 없이도 알 수 있다.
// Platform.OS==='web'일 때만 마운트된다(App.tsx에서 게이팅) — 네이티브 빌드엔 전혀 없다.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function readDiagnostics() {
  const de = document.documentElement;
  const vv = window.visualViewport;
  const bar = document.querySelector('[role="tablist"]');
  const barRect = bar?.getBoundingClientRect();
  return {
    UA: navigator.userAgent.slice(0, 60),
    'innerWidth×innerHeight': `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    'visualViewport.width×height': vv ? `${vv.width}×${vv.height}` : '미지원',
    'html.clientWidth×Height': `${de.clientWidth}×${de.clientHeight}`,
    'html.scrollWidth×Height': `${de.scrollWidth}×${de.scrollHeight}`,
    '가로 초과(스크롤폭-보이는폭)': de.scrollWidth - de.clientWidth,
    '세로 초과(스크롤높이-innerHeight)': de.scrollHeight - window.innerHeight,
    dvh지원: CSS.supports('height', '100dvh') ? 'O' : 'X',
    'html 실제 height': getComputedStyle(de).height,
    '탭바 top~bottom': barRect ? `${Math.round(barRect.top)}~${Math.round(barRect.bottom)}` : '없음',
    '탭바가 창을 벗어난 만큼(음수=안쪽)': barRect ? Math.round(barRect.bottom - window.innerHeight) : '없음',
  };
}

export function WebDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, string | number>>({});

  const handleOpen = () => {
    setData(readDiagnostics());
    setOpen(true);
  };

  if (!open) {
    return (
      <Pressable onPress={handleOpen} style={styles.fab} hitSlop={10}>
        <Text style={styles.fabText}>🐞</Text>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
      <View style={styles.panel}>
        <Text style={styles.title}>화면 진단 (이 패널을 캡처해서 보내주세요)</Text>
        {Object.entries(data).map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{String(v)}</Text>
          </View>
        ))}
        <Text style={styles.hint}>아무 곳이나 탭하면 닫혀요</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: 10,
    bottom: 96,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  fabText: { fontSize: 16 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 9999,
  },
  panel: { width: '100%', gap: 6 },
  title: { color: '#4ADE80', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  key: { color: '#8A9490', fontSize: 11.5, flexShrink: 1 },
  value: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', textAlign: 'right' },
  hint: { color: '#5F6B66', fontSize: 11, marginTop: 12, textAlign: 'center' },
});
