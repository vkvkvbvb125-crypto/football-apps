// src/features/attendance/components/CreateMatchSheet.tsx
// 총무 전용 "경기 만들기" 시트
//   - 정기모임 기본값(defaults)이 있으면 자동 채움 — 지금은 team_settings가 없어 항상 undefined로 넘어온다
//   - 제휴구장 예약(venues)은 아직 실제 데이터가 없어 빈 배열로 넘어온다 → 지도 검색으로 자연스럽게 유도
//   - "장소 미정으로 투표 시작" 토글 + 선점 경고
//   - 투표 마감 프리셋
//   - "다음 3개월치 한번에 생성" (매주 같은 요일/시간, 12경기)
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors } from '../../../theme';
import { TimeWheelPicker } from './TimeWheelPicker';
import { PlaceSearchModal } from './PlaceSearchModal';
import type { PlaceResult } from '../services/placeService';

export interface VenueOption {
  id: string;
  name: string;
  isIndoor: boolean;
  isPartner: boolean;
  meta: string; // "도보 8분 · 12명 · 시간당 60,000원"
  capacity?: number | null;
  /** venue_slots에서 가져온 그 날짜의 시간대 */
  slots: { timeRange: string; available: boolean }[];
}

export interface CreateMatchPayload {
  matchDate: string; // ISO
  venueId: string | null;
  locationText: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  placeCategory: string | null;
  locationPending: boolean;
  voteDeadline: string | null;
  quarterMinutes: number;
  /** 3개월 반복 생성 여부 */
  repeatWeekly: boolean;
  repeatCount: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  /** team_settings 기반 기본값 (없으면 undefined) */
  defaults?: { weekdayLabel: string; time: string; venueName: string } | null;
  venues: VenueOption[];
  onSubmit: (p: CreateMatchPayload) => void;
}

const DEADLINE_PRESETS = [
  { label: '경기 2일 전', days: 2 },
  { label: '경기 1일 전', days: 1 },
  { label: '직접 설정', days: null as number | null },
];

export function CreateMatchSheet({ visible, onClose, selectedDate, defaults, venues, onSubmit }: Props) {
  const [useDefaults, setUseDefaults] = useState(!!defaults);
  const [time, setTime] = useState(defaults?.time ?? '20:00');
  const [pendingPlace, setPendingPlace] = useState(false);
  const [mode, setMode] = useState<'partner' | 'search'>(venues.length > 0 ? 'partner' : 'search');
  const [venueId, setVenueId] = useState<string | null>(venues[0]?.id ?? null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [searchPlace, setSearchPlace] = useState<PlaceResult | null>(null);
  const [deadlineIdx, setDeadlineIdx] = useState(1);
  const [repeat, setRepeat] = useState(false);

  const venue = useMemo(() => venues.find((v) => v.id === venueId) ?? null, [venues, venueId]);

  const dateLabel = `${selectedDate.getFullYear()}.${String(selectedDate.getMonth() + 1).padStart(
    2,
    '0'
  )}.${String(selectedDate.getDate()).padStart(2, '0')} (${selectedDate.toLocaleDateString('ko-KR', {
    weekday: 'short',
  })})`;

  const submit = () => {
    const matchDate = new Date(selectedDate);
    const [h, m] = time.split(':').map(Number);
    matchDate.setHours(h || 0, m || 0, 0, 0);

    let voteDeadline: string | null = null;
    const preset = DEADLINE_PRESETS[deadlineIdx];
    if (preset?.days != null) {
      const d = new Date(matchDate);
      d.setDate(d.getDate() - preset.days);
      d.setHours(23, 59, 0, 0);
      voteDeadline = d.toISOString();
    }

    onSubmit({
      matchDate: matchDate.toISOString(),
      venueId: pendingPlace ? null : mode === 'partner' ? venueId : null,
      locationText: pendingPlace ? null : mode === 'search' ? (searchPlace?.name ?? null) : (venue?.name ?? null),
      address: mode === 'search' ? (searchPlace?.address ?? null) : null,
      latitude: mode === 'search' ? (searchPlace?.latitude ?? null) : null,
      longitude: mode === 'search' ? (searchPlace?.longitude ?? null) : null,
      placeCategory: mode === 'search' ? (searchPlace?.category ?? null) : venue?.isIndoor ? '실내' : '실외',
      locationPending: pendingPlace,
      voteDeadline,
      quarterMinutes: 10,
      repeatWeekly: repeat,
      repeatCount: repeat ? 12 : 1,
    });
    onClose();
  };

  const canSubmit = pendingPlace || (mode === 'partner' ? !!venueId : !!searchPlace);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>경기 만들기</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            {!!defaults && (
              <Pressable
                onPress={() => setUseDefaults((v) => !v)}
                style={[styles.defaultBox, !useDefaults && styles.defaultBoxOff]}
              >
                <Ionicons name="repeat" size={15} color={useDefaults ? colors.green : colors.textDim} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.defaultTitle, !useDefaults && { color: colors.textDim }]}>
                    정기모임 기본값 {useDefaults ? '적용' : '해제됨'}
                  </Text>
                  <Text style={styles.defaultSub}>
                    매주 {defaults.weekdayLabel} {defaults.time} · {defaults.venueName}
                  </Text>
                </View>
                <Text style={styles.defaultToggle}>{useDefaults ? '해제' : '적용'}</Text>
              </Pressable>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>날짜</Text>
                <View style={styles.readonly}>
                  <Text style={styles.readonlyText}>{dateLabel}</Text>
                </View>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>시간</Text>
                <View style={styles.readonly}>
                  <Text style={styles.readonlyText}>{time}</Text>
                </View>
              </View>
            </View>
            <TimeWheelPicker value={time} onChange={setTime} />

            <View style={{ gap: 8 }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>장소</Text>
                <Pressable
                  onPress={() => setPendingPlace((v) => !v)}
                  style={[styles.pendingToggle, pendingPlace && styles.pendingToggleOn]}
                >
                  <Text style={[styles.pendingToggleText, pendingPlace && { color: colors.gold }]}>
                    장소 미정으로 투표 시작{pendingPlace ? ' ✓' : ''}
                  </Text>
                </Pressable>
              </View>

              {pendingPlace ? (
                <View style={styles.warn}>
                  <Ionicons name="alert-circle-outline" size={15} color="#E3C489" />
                  <Text style={styles.warnText}>
                    인기 시간대 구장은 이미 선점됐을 수 있어요. 투표 마감 후 바로 예약하는 걸 권해요.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {venues.length > 0 && (
                    <View style={styles.tabs}>
                      <Pressable onPress={() => setMode('partner')} style={[styles.tab, mode === 'partner' && styles.tabOn]}>
                        <Text style={[styles.tabText, mode === 'partner' && { color: colors.green }]}>제휴 구장</Text>
                      </Pressable>
                      <Pressable onPress={() => setMode('search')} style={[styles.tab, mode === 'search' && styles.tabOn]}>
                        <Text style={[styles.tabText, mode === 'search' && { color: colors.green }]}>지도 검색</Text>
                      </Pressable>
                    </View>
                  )}

                  {mode === 'partner' ? (
                    <View style={{ gap: 9 }}>
                      {venues.length === 0 ? (
                        <Text style={styles.hint}>등록된 제휴 구장이 없어요 · 지도 검색을 이용해주세요</Text>
                      ) : (
                        venues.map((v) => {
                          const on = venueId === v.id;
                          return (
                            <Pressable
                              key={v.id}
                              onPress={() => {
                                setVenueId(v.id);
                                setSlotIndex(null);
                              }}
                              style={[styles.venueCard, on && styles.venueCardOn]}
                            >
                              <View style={styles.venueHead}>
                                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                                  <View style={styles.venueNameRow}>
                                    <Text style={styles.venueName}>{v.name}</Text>
                                    <View
                                      style={[
                                        styles.venueTag,
                                        { backgroundColor: v.isIndoor ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.06)' },
                                      ]}
                                    >
                                      <Text style={[styles.venueTagText, { color: v.isIndoor ? '#60A5FA' : colors.textMuted }]}>
                                        {v.isIndoor ? '실내' : '실외'}
                                      </Text>
                                    </View>
                                  </View>
                                  <Text style={styles.venueMeta}>{v.meta}</Text>
                                </View>
                                <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>
                                  <Text style={[styles.checkMark, !on && { color: 'transparent' }]}>✓</Text>
                                </View>
                              </View>

                              <View style={styles.slotWrap}>
                                {v.slots.map((s, i) => {
                                  const picked = on && slotIndex === i;
                                  return (
                                    <Pressable
                                      key={s.timeRange}
                                      disabled={!s.available}
                                      onPress={() => {
                                        setVenueId(v.id);
                                        setSlotIndex(i);
                                        setTime(s.timeRange.slice(0, 5));
                                      }}
                                      style={[
                                        styles.slot,
                                        s.available ? styles.slotOpen : styles.slotClosed,
                                        picked && styles.slotPicked,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.slotText,
                                          s.available ? { color: colors.green } : styles.slotTextClosed,
                                          picked && { color: colors.bgRoot },
                                        ]}
                                      >
                                        {s.timeRange} {s.available ? '가능' : '마감'}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </Pressable>
                          );
                        })
                      )}
                      <Text style={styles.hint}>예약 가능 시간을 고르면 구장에 예약 요청이 함께 전송돼요</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <PlaceSearchModal
                        value={searchPlace ? { name: searchPlace.name } : null}
                        onSelect={setSearchPlace}
                      />
                      <Text style={styles.hint}>카카오맵 기준으로 현재 위치 주변 풋살장을 찾아요</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>투표 마감</Text>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {DEADLINE_PRESETS.map((d, i) => (
                  <Pressable
                    key={d.label}
                    onPress={() => setDeadlineIdx(i)}
                    style={[styles.preset, deadlineIdx === i && styles.presetOn]}
                  >
                    <Text style={[styles.presetText, deadlineIdx === i && { color: colors.green }]}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable onPress={() => setRepeat((v) => !v)} style={[styles.repeatRow, repeat && styles.repeatRowOn]}>
              <View style={[styles.repeatCheck, repeat ? styles.checkOn : styles.checkOff]}>
                <Text style={[styles.checkMark, { fontSize: 11 }, !repeat && { color: 'transparent' }]}>✓</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.repeatTitle}>다음 3개월치 한 번에 생성</Text>
                <Text style={styles.repeatSub}>
                  매주 {selectedDate.toLocaleDateString('ko-KR', { weekday: 'short' })} {time} 기준 12경기 · 나중에
                  개별 수정 가능
                </Text>
              </View>
            </Pressable>
          </ScrollView>

          <Pressable disabled={!canSubmit} onPress={submit} style={[styles.cta, !canSubmit && { opacity: 0.4 }]}>
            <Text style={styles.ctaText}>{repeat ? '12경기 만들고 알림 보내기' : '경기 만들고 알림 보내기'}</Text>
          </Pressable>
          <Text style={styles.note}>만들면 팀원 전체에게 알림이 발송돼요</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    maxHeight: '90%',
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  close: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hint: { color: '#5F6B66', fontSize: 11, fontWeight: '600' },

  defaultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(74,222,128,0.07)',
    borderWidth: 1,
    borderColor: '#2F4A3A',
  },
  defaultBoxOff: { backgroundColor: colors.inputBg, borderColor: colors.divider },
  defaultTitle: { color: colors.green, fontSize: 12, fontWeight: '800' },
  defaultSub: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  defaultToggle: { color: colors.textDim, fontSize: 11, fontWeight: '700' },

  readonly: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readonlyText: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },

  pendingToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  pendingToggleOn: { backgroundColor: 'rgba(210,163,76,0.16)', borderColor: '#6B5426' },
  pendingToggleText: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800' },

  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(210,163,76,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(210,163,76,0.22)',
  },
  warnText: { flex: 1, color: '#E3C489', fontSize: 11.5, fontWeight: '600', lineHeight: 17 },

  tabs: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 13,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  tabOn: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: '#2F4A3A' },
  tabText: { color: '#7C8A85', fontSize: 12.5, fontWeight: '800' },

  venueCard: { padding: 13, borderRadius: 14, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.divider },
  venueCardOn: { backgroundColor: 'rgba(74,222,128,0.07)', borderColor: '#2F4A3A' },
  venueHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  venueNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  venueName: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  venueTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  venueTagText: { fontSize: 9.5, fontWeight: '800' },
  venueMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },

  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 10 },
  slot: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  slotOpen: { backgroundColor: 'rgba(74,222,128,0.08)', borderColor: '#2F4A3A' },
  slotClosed: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: colors.divider },
  slotPicked: { backgroundColor: colors.green, borderColor: colors.green },
  slotText: { fontSize: 10.5, fontWeight: '800' },
  slotTextClosed: { color: '#4A544F', textDecorationLine: 'line-through' },

  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetOn: { backgroundColor: 'rgba(74,222,128,0.10)', borderColor: '#2F4A3A' },
  presetText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },

  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  repeatRowOn: { backgroundColor: 'rgba(74,222,128,0.07)', borderColor: '#2F4A3A' },
  repeatCheck: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  repeatTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  repeatSub: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },

  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.green },
  checkOff: { borderWidth: 1.5, borderColor: '#2C3833' },
  checkMark: { color: colors.bgRoot, fontSize: 11, fontWeight: '800' },

  cta: { height: 52, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  note: { color: '#5F6B66', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
