# 일정 화면 UI 개선 (케밥 팝오버 + 시간 휠 피커) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정 화면(AttendanceScreen)의 경기 카드 케밥메뉴를 작은 앵커 팝오버로 바꾸고, 경기 시간 입력을 프리셋 칩에서 시/분 휠 피커로 바꾼다.

**Architecture:** 둘 다 순수 프론트엔드(React Native) 컴포넌트 변경. 케밥 팝오버는 `TabHeader`의 알림 패널과 동일한 "절대 위치 Modal + 바깥 탭으로 닫기" 패턴을 재사용한다. 시간 휠 피커는 `TimeSlotPicker`를 대체하는 새 컴포넌트로, 세로 `ScrollView` + `snapToInterval`로 구현한다.

**Tech Stack:** React Native 0.86 / Expo 57, TypeScript(strict), `@expo/vector-icons`(Ionicons), zustand(변경 없음).

## Global Constraints

- 이 프로젝트엔 테스트 프레임워크(Jest/RNTL 등)가 설치되어 있지 않다. 각 태스크의 검증은 `npx tsc --noEmit` 타입체크 + `npx expo start --web`로 직접 확인하는 수동 검증으로 대체한다. 새 태스크에서 테스트 프레임워크를 새로 설치하지 않는다(범위 밖, YAGNI).
- 색상/스타일 값은 기존 코드에서 쓰는 값을 그대로 재사용한다: 배경 `#141A17`/`#0B0F0D`, 테두리 `#22302A`, 텍스트 `#FFFFFF`/`#E7ECE9`/`#8A9490`, 강조 `#39D98A`, 위험 `#F87171`.
- DB/백엔드/Supabase 변경 없음.

---

### Task 1: 케밥메뉴 → 앵커 팝오버

**Files:**
- Modify: `src/features/attendance/screens/AttendanceScreen.tsx`

**Interfaces:**
- Consumes: 기존 `actionMatch: MatchWithVotes | null` state, `handleOpenEdit(match)`, `handleDelete(matchId)` (변경 없음)
- Produces: 없음 (다른 태스크가 의존하지 않음)

- [ ] **Step 1: 케밥 아이콘 onPress에서 탭 좌표를 저장하는 state 추가**

`AttendanceScreen.tsx`의 기존 state 선언부를 수정한다:

```tsx
  const [actionMatch, setActionMatch] = useState<MatchWithVotes | null>(null);
```

를 아래로 교체:

```tsx
  const [actionMatch, setActionMatch] = useState<MatchWithVotes | null>(null);
  const [actionAnchorY, setActionAnchorY] = useState(0);
```

- [ ] **Step 2: 케밥 Pressable의 onPress에서 pageY를 저장**

```tsx
                        {isAdmin && (
                          <Pressable onPress={() => setActionMatch(match)} hitSlop={8}>
                            <Ionicons name="ellipsis-vertical" size={18} color="#8A9490" />
                          </Pressable>
                        )}
```

를 아래로 교체:

```tsx
                        {isAdmin && (
                          <Pressable
                            onPress={(e) => {
                              setActionAnchorY(e.nativeEvent.pageY);
                              setActionMatch(match);
                            }}
                            hitSlop={8}
                          >
                            <Ionicons name="ellipsis-vertical" size={18} color="#8A9490" />
                          </Pressable>
                        )}
```

- [ ] **Step 3: 전체화면 바텀시트 Modal을 앵커 팝오버로 교체**

파일 끝부분의 아래 Modal 블록 전체(`<Modal visible={!!actionMatch} ...>` 부터 짝 맞는 `</Modal>`까지)를:

```tsx
      <Modal visible={!!actionMatch} transparent animationType="fade" onRequestClose={() => setActionMatch(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setActionMatch(null)}>
          <View style={styles.sheetCard}>
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                if (actionMatch) handleOpenEdit(actionMatch);
                setActionMatch(null);
              }}
            >
              <Ionicons name="pencil-outline" size={18} color="#E7ECE9" />
              <Text style={styles.sheetOptionText}>수정</Text>
            </Pressable>
            <View style={styles.sheetDivider} />
            <Pressable
              style={styles.sheetOption}
              onPress={() => {
                if (actionMatch) handleDelete(actionMatch.id);
                setActionMatch(null);
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#F87171" />
              <Text style={[styles.sheetOptionText, styles.sheetOptionTextDanger]}>삭제</Text>
            </Pressable>
            <View style={styles.sheetGap} />
            <Pressable style={styles.sheetCancel} onPress={() => setActionMatch(null)}>
              <Text style={styles.sheetCancelText}>취소</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
```

아래로 교체:

```tsx
      <Modal visible={!!actionMatch} transparent animationType="fade" onRequestClose={() => setActionMatch(null)}>
        <Pressable style={styles.actionOverlay} onPress={() => setActionMatch(null)}>
          <View style={[styles.actionPopover, { top: actionAnchorY + 12 }]}>
            <Pressable
              style={styles.actionOption}
              onPress={() => {
                if (actionMatch) handleOpenEdit(actionMatch);
                setActionMatch(null);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color="#E7ECE9" />
              <Text style={styles.actionOptionText}>수정</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              style={styles.actionOption}
              onPress={() => {
                if (actionMatch) handleDelete(actionMatch.id);
                setActionMatch(null);
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#F87171" />
              <Text style={[styles.actionOptionText, styles.actionOptionTextDanger]}>삭제</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
```

- [ ] **Step 4: 이제 안 쓰는 sheet\* 스타일을 팝오버 스타일로 교체**

`styles` 안의 아래 블록을:

```tsx
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheetCard: {
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    overflow: 'hidden',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sheetOptionText: {
    color: '#E7ECE9',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetOptionTextDanger: {
    color: '#F87171',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#22302A',
  },
  sheetGap: {
    height: 8,
    backgroundColor: '#0B0F0D',
  },
  sheetCancel: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  sheetCancelText: {
    color: '#8A9490',
    fontSize: 15,
    fontWeight: '600',
  },
```

아래로 교체:

```tsx
  actionOverlay: {
    flex: 1,
  },
  actionPopover: {
    position: 'absolute',
    right: 20,
    width: 160,
    backgroundColor: '#141A17',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22302A',
    overflow: 'hidden',
    boxShadow: '0px 8px 20px rgba(0,0,0,0.4)',
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionOptionText: {
    color: '#E7ECE9',
    fontSize: 14,
    fontWeight: '600',
  },
  actionOptionTextDanger: {
    color: '#F87171',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#22302A',
  },
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: `AttendanceScreen.tsx` 관련 에러 없음 (미리 존재하던 무관한 에러가 있었다면 그대로 유지되는지만 확인)

- [ ] **Step 6: 수동 확인 (Expo 웹)**

Run: `npx expo start --web`
확인 항목:
1. 총무 계정으로 일정 탭 진입, 아무 경기 카드의 케밥(⋮) 클릭
2. 화면 전체를 가리는 바텀시트 대신, 아이콘 바로 아래쪽에 "수정/삭제" 두 줄짜리 작은 카드만 뜨는지 확인
3. 팝오버 바깥(다른 영역) 탭하면 닫히는지 확인
4. "수정" 누르면 기존과 동일하게 수정 모달이 뜨는지, "삭제" 누르면 기존과 동일하게 확인창이 뜨는지 확인
5. 리스트를 스크롤한 상태에서 케밥을 눌러도 팝오버가 눌린 위치 근처에 뜨는지 확인 (스크롤 위치와 무관하게 pageY 기준으로 잘 붙는지)

- [ ] **Step 7: 커밋**

```bash
git add src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "refactor: 일정 카드 케밥메뉴를 앵커 팝오버 방식으로 변경"
```

---

### Task 2: 시간 입력 → 시/분 휠 피커

**Files:**
- Create: `src/features/attendance/components/TimeWheelPicker.tsx`
- Delete: `src/features/attendance/components/TimeSlotPicker.tsx`
- Modify: `src/features/attendance/screens/AttendanceScreen.tsx` (import + 사용처 1줄씩)

**Interfaces:**
- Produces: `TimeWheelPicker({ value: string, onChange: (time: string) => void })` — `value`/`onChange`는 `"HH:MM"` 문자열, 기존 `TimeSlotPicker`와 동일한 시그니처라 호출부는 컴포넌트명만 바뀐다.

- [ ] **Step 1: `TimeWheelPicker.tsx` 작성**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06~23
const MINUTES = [0, 10, 20, 30, 40, 50];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

interface WheelProps {
  data: number[];
  selected: number;
  onSelect: (value: number) => void;
}

function Wheel({ data, selected, onSelect }: WheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const initialIndex = Math.max(0, data.indexOf(selected));

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(data.length - 1, Math.max(0, index));
    onSelect(data[clamped]);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheel}
      contentContainerStyle={{ paddingVertical: PADDING }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={handleMomentumEnd}
    >
      {data.map((v) => (
        <View key={v} style={styles.item}>
          <Text style={[styles.itemText, v === selected && styles.itemTextActive]}>{pad(v)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

interface TimeWheelPickerProps {
  value: string;
  onChange: (time: string) => void;
}

export function TimeWheelPicker({ value, onChange }: TimeWheelPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [hour, minute] = value.split(':').map(Number);
  const [draftHour, setDraftHour] = useState(hour);
  const [draftMinute, setDraftMinute] = useState(minute);

  const handleOpen = () => {
    setDraftHour(hour);
    setDraftMinute(minute);
    setModalVisible(true);
  };

  const handleConfirm = () => {
    onChange(`${pad(draftHour)}:${pad(draftMinute)}`);
    setModalVisible(false);
  };

  return (
    <>
      <Pressable style={styles.field} onPress={handleOpen}>
        <Text style={styles.fieldText}>{value}</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>시간 선택</Text>

            <View style={styles.wheelRow}>
              <View style={styles.highlightBar} pointerEvents="none" />
              <Wheel data={HOURS} selected={draftHour} onSelect={setDraftHour} />
              <Text style={styles.colon}>:</Text>
              <Wheel data={MINUTES} selected={draftMinute} onSelect={setDraftMinute} />
            </View>

            <View style={styles.buttonRow}>
              <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmText}>확인</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0F1512',
    alignSelf: 'flex-start',
    minWidth: 96,
  },
  fieldText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 280,
    backgroundColor: '#141A17',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#22302A',
    padding: 20,
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  wheel: {
    height: WHEEL_HEIGHT,
    width: 72,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    color: '#5A625E',
    fontSize: 18,
    fontWeight: '600',
  },
  itemTextActive: {
    color: '#FFFFFF',
  },
  colon: {
    color: '#8A9490',
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 4,
  },
  highlightBar: {
    position: 'absolute',
    top: PADDING,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: 10,
    backgroundColor: 'rgba(57,217,138,0.12)',
    borderWidth: 1,
    borderColor: '#39D98A',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1B231F',
  },
  cancelText: {
    color: '#8A9490',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#39D98A',
  },
  confirmText: {
    color: '#0B0F0D',
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: `AttendanceScreen.tsx`에서 import 교체**

```tsx
import { TimeSlotPicker } from '../components/TimeSlotPicker';
```

를:

```tsx
import { TimeWheelPicker } from '../components/TimeWheelPicker';
```

- [ ] **Step 3: `AttendanceScreen.tsx`에서 사용처 교체**

```tsx
            <Text style={styles.fieldLabel}>경기 시간</Text>
            <TimeSlotPicker value={timeText} onChange={setTimeText} />
```

를:

```tsx
            <Text style={styles.fieldLabel}>경기 시간</Text>
            <TimeWheelPicker value={timeText} onChange={setTimeText} />
```

- [ ] **Step 4: 옛 컴포넌트 삭제**

```bash
git rm src/features/attendance/components/TimeSlotPicker.tsx
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `TimeSlotPicker` import 참조가 다른 곳에 남아있지 않은지 — 남아있다면 그 파일도 같이 교체)

- [ ] **Step 6: 수동 확인 (Expo 웹)**

Run: `npx expo start --web`
확인 항목:
1. "+" 버튼으로 새 경기 만들기 모달 열기 → "경기 시간" 자리에 프리셋 칩 대신 `19:00` 같은 값이 적힌 버튼 하나만 보이는지 확인
2. 버튼 탭 → 시(06~23)/분(00,10,20,30,40,50) 두 휠이 있는 모달이 뜨는지 확인
3. 휠을 스크롤해서 다른 시/분으로 스냅되는지, 가운데 강조 바 안의 값이 흰색으로 강조되는지 확인
4. "확인" 누르면 모달이 닫히고 버튼에 선택한 시간이 반영되는지 확인
5. "취소" 누르면 원래 값 그대로 유지되는지 확인
6. 기존 경기를 "수정"으로 열었을 때 저장된 시간이 휠 초기 위치에 정확히 맞춰져 있는지 확인
7. "만들기"/"저장" 눌러서 실제 경기 시간이 올바르게 저장되는지(카드에 표시되는 시간으로 확인)

- [ ] **Step 7: 커밋**

```bash
git add src/features/attendance/components/TimeWheelPicker.tsx src/features/attendance/screens/AttendanceScreen.tsx
git commit -m "feat: 경기 시간 입력을 프리셋 칩에서 시/분 휠 피커로 변경"
```
