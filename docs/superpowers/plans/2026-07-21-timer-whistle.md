# 타이머 휘슬음 추가 + 교체대기열/쿼터 개념 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타이머 시작/재개 시 휘슬 1회, 카운트다운 종료 시 진동+휘슬 3연타가 울리도록 하고, 실제 경기 방식과 안 맞는 "교체 대기 순서"와 "쿼터" 개념을 타이머 화면에서 제거해 단순 반복 카운트다운으로 만든다.

**Architecture:** `expo-audio`의 `useAudioPlayer` 훅으로 로컬 mp3 파일을 재생하는 플레이어를 만들고, 시작/종료 시점마다 `.seekTo(0)` 후 `.play()`를 호출하는 방식으로 하나의 파일을 재생 횟수만 다르게(1회/3회) 트리거한다. `TimerPanel.tsx` 한 파일만 수정하는 작업이라 태스크를 하나로 유지한다.

**Tech Stack:** React Native + Expo SDK 57 (TypeScript), `expo-audio`.

## Global Constraints

- Expo SDK 57 기준 오디오 재생은 `expo-audio` 사용 (`expo-av`의 Audio는 deprecated, v57 문서에 없음).
- 테스트 프레임워크 없음 — 검증은 `npx tsc --noEmit` + 수동 확인으로 대체.
- 휘슬 mp3 파일(`app/assets/sounds/whistle.mp3`)은 사용자가 직접 준비해서 넣음 — 파일이 없으면 코드의 `require()`가 번들링 시점에 실패하므로, 파일 존재를 먼저 확인한 뒤에만 해당 코드를 작성한다.

---

### Task 1: `expo-audio` 설치 + `TimerPanel.tsx` 전체 교체

**Files:**
- Modify: `app/package.json` (의존성 추가, `npx expo install`로 자동 처리)
- Modify: `app/src/features/timer/components/TimerPanel.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `app/assets/sounds/whistle.mp3` (사용자가 준비한 로컬 에셋 파일 — 이 태스크 시작 전에 파일 존재 여부를 확인해야 함)
- Produces: 없음 (최종 UI 컴포넌트, 다른 파일에서 이 컴포넌트의 외부 인터페이스는 변경되지 않음 — `AssignmentScreen.tsx`가 `<TimerPanel />`을 그대로 사용)

- [ ] **Step 0: 에셋 파일 존재 확인**

`app/assets/sounds/whistle.mp3` 파일이 존재하는지 확인한다. 없으면 사용자에게 파일을 넣어달라고 요청하고, 확인받을 때까지 이 태스크의 나머지 스텝을 진행하지 않는다.

- [ ] **Step 1: `expo-audio` 설치**

Run: `cd app && npx expo install expo-audio`
Expected: `package.json`의 dependencies에 `expo-audio`가 추가됨

- [ ] **Step 2: `TimerPanel.tsx` 전체 교체**

`app/src/features/timer/components/TimerPanel.tsx` 전체를 다음으로 교체:

```typescript
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function TimerPanel() {
  const [quarterMinutes, setQuarterMinutes] = useState(10);
  const [remainingSeconds, setRemainingSeconds] = useState(quarterMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useAudioPlayer(require('../../../../assets/sounds/whistle.mp3'));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const playWhistle = (times: number) => {
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        player.seekTo(0);
        player.play();
      }, i * 450);
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          Vibration.vibrate(500);
          playWhistle(3);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleStartPause = () => {
    if (!isRunning) {
      playWhistle(1);
    }
    setIsRunning((r) => !r);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemainingSeconds(quarterMinutes * 60);
  };

  const handleMinutesChange = (text: string) => {
    const value = Number(text) || 0;
    setQuarterMinutes(value);
    if (!isRunning) setRemainingSeconds(value * 60);
  };

  return (
    <View style={styles.content}>
      <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>

      <View style={styles.minutesRow}>
        <Text style={styles.minutesLabel}>타이머 시간(분)</Text>
        <TextInput
          style={styles.minutesInput}
          value={String(quarterMinutes)}
          onChangeText={handleMinutesChange}
          keyboardType="number-pad"
          editable={!isRunning}
        />
      </View>

      <View style={styles.controlRow}>
        <Pressable style={styles.controlButton} onPress={handleReset}>
          <Text style={styles.controlButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleStartPause}>
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  timeDisplay: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  minutesLabel: {
    color: '#8A9490',
    fontSize: 13,
  },
  minutesInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    width: '100%',
  },
  controlButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  controlButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#39D98A',
  },
  primaryButtonText: {
    color: '#0B0F0D',
    fontWeight: '700',
    fontSize: 14,
  },
});
```

- [ ] **Step 3: 타입체크**

Run: `cd app && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인 (설명 제공, 실제 확인은 사용자가 브라우저에서)**

확인할 흐름:
1. 경기운영 탭 → 타이머 탭 → "시작"을 누르면 휘슬이 1번 울리는지
2. "일시정지"를 누를 땐 안 울리는지
3. 다시 "시작"(재개)을 누르면 또 1번 울리는지
4. 타이머 시간을 짧게 설정해 카운트다운이 0이 될 때까지 기다려 진동+휘슬 3연타가 함께 나는지
5. "교체 대기 순서" 섹션이 화면에서 완전히 사라졌는지
6. "N쿼터" 라벨과 "다음 쿼터" 버튼이 사라지고, "초기화"/"시작" 두 버튼만 남았는지
7. 시간 표시 위 라벨이 "타이머 시간(분)"으로 바뀌었는지

- [ ] **Step 5: 커밋**

```bash
cd app
git add package.json src/features/timer/components/TimerPanel.tsx
git commit -m "feat: 타이머에 휘슬음 추가, 교체대기열/쿼터 개념 제거

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

- **스펙 커버리지:** 휘슬음(시작 1회/종료 3회) / 교체대기열 제거 / 쿼터 개념 제거 — 스펙의 모든 항목이 이 태스크 하나로 커버됨 (파일이 하나뿐이라 태스크 분리 불필요).
- **플레이스홀더 스캔:** 없음 — 전체 코드 포함.
- **타입 일관성:** `playWhistle(times: number)` 시그니처가 시작(`playWhistle(1)`)과 종료(`playWhistle(3)`) 호출부에서 동일하게 사용됨. `TimerPanel`의 export 시그니처(props 없음)는 변경되지 않아 `AssignmentScreen.tsx`의 `<TimerPanel />` 사용처에 영향 없음.
