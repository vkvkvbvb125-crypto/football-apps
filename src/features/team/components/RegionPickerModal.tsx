// src/features/team/components/RegionPickerModal.tsx
// 활동 지역 선택 — 시/도 → 구/군 2단계.
//
// PlaceSearchModal을 재사용하지 않는다. 저쪽은 카카오 장소 검색이고 이쪽은 39개짜리
// 고정 목록이라, 공통으로 묶으면 남는 건 Modal 껍데기뿐이다. 껍데기 스타일만 맞춘다.
//
// 광역시와 「그 외 지역」은 항목이 하나라(isSingleEntry) 1단계에서 바로 끝난다 —
// 「부산」을 고르고 다시 「부산 전체」를 고르게 하면 한 번 더 누르는 의미가 없다.
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { SIDO_LIST, isSingleEntry, regionLabelOf, regionsOf } from '../regions';

interface Props {
  /** 저장돼 있는 법정동코드 5자리 */
  value: string | null;
  onSelect: (code: string) => void;
}

export function RegionPickerModal({ value, onSelect }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const [open, setOpen] = useState(false);
  const [sido, setSido] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setSido(null);
  };

  const pick = (code: string) => {
    onSelect(code);
    close();
  };

  const label = regionLabelOf(value);
  const list = sido ? regionsOf(sido) : SIDO_LIST;

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)} accessibilityRole="button">
        <Ionicons name="map-outline" size={16} color={label ? colors.green : colors.placeholder} />
        <Text style={[styles.fieldText, !label && styles.fieldTextPlaceholder]}>{label ?? '지역 선택'}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.head}>
              {sido ? (
                <Pressable onPress={() => setSido(null)} hitSlop={10} accessibilityRole="button">
                  <Ionicons name="chevron-back" size={19} color={colors.textStrong} />
                </Pressable>
              ) : (
                <View style={styles.headSpacer} />
              )}
              <Text style={styles.title}>{sido ?? '활동 지역'}</Text>
              <View style={styles.headSpacer} />
            </View>

            <FlatList
              data={list as (string | { code: string; name: string })[]}
              keyExtractor={(item) => (typeof item === 'string' ? item : item.code)}
              style={styles.list}
              renderItem={({ item }) => {
                // 1단계는 시/도 문자열, 2단계는 Region
                if (typeof item !== 'string') {
                  const on = item.code === value;
                  return (
                    <Pressable style={styles.row} onPress={() => pick(item.code)} accessibilityRole="button">
                      <Text style={[styles.rowText, on && styles.rowTextOn]}>{item.name}</Text>
                      {on && <Ionicons name="checkmark" size={16} color={colors.green} />}
                    </Pressable>
                  );
                }
                const only = isSingleEntry(item) ? regionsOf(item)[0] : null;
                const on = !!only && only.code === value;
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => (only ? pick(only.code) : setSido(item))}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.rowText, on && styles.rowTextOn]}>{item}</Text>
                    {only ? (
                      on && <Ionicons name="checkmark" size={16} color={colors.green} />
                    ) : (
                      <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.inputBg,
  },
  fieldText: { flex: 1, color: colors.textStrong, fontSize: 15, fontWeight: '600' },
  fieldTextPlaceholder: { color: colors.placeholder, fontWeight: '400' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  card: {
    width: 320,
    maxHeight: '75%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  headSpacer: { width: 19 },
  title: { flex: 1, color: colors.textStrong, fontSize: 16, fontWeight: '800', textAlign: 'center' },

  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  rowText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowTextOn: { color: colors.green, fontWeight: '800' },
  });
