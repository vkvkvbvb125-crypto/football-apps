// src/components/Mention.tsx — @멘션 입력과 렌더
//
// 게시판과 공지가 같이 쓴다. 파싱 규칙은 lib/mentions.ts에 있고, 여기는 화면만 맡는다.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';
import { Text, TextInput } from './nativeText';
import { colors, radius } from '../theme';
import { EVERYONE, activeQuery, insertMention, parse } from '../lib/mentions';

export interface MentionTarget {
  id: string;
  name: string;
}

/** 후보 목록에 항상 맨 위로 오는 전체 지목 */
const EVERYONE_TARGET: MentionTarget = { id: EVERYONE, name: 'everyone' };

/** 한 번에 보여주는 후보 수 — 더 많으면 입력창을 덮는다 */
const MAX_SUGGESTIONS = 5;

/**
 * 검색어에 맞는 후보.
 *
 * everyone이 항상 맨 위다. `@e`만 쳐도 바로 뜨도록 앞부분 일치로 본다.
 */
export function suggestionsFor(query: string, members: MentionTarget[]): MentionTarget[] {
  const q = query.toLowerCase();
  const out: MentionTarget[] = [];
  if (EVERYONE_TARGET.name.startsWith(q)) out.push(EVERYONE_TARGET);
  out.push(...members.filter((m) => m.name.toLowerCase().includes(q)));
  return out.slice(0, MAX_SUGGESTIONS);
}

interface MentionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  members: MentionTarget[];
  placeholder?: string;
  style?: any;
  autoFocus?: boolean;
}

/** 본문 입력 + @자동완성. 마커는 사용자가 직접 칠 일이 없고 목록에서 고르면 끼워진다 */
export function MentionInput({
  value,
  onChangeText,
  members,
  placeholder,
  style,
  autoFocus,
}: MentionInputProps) {
  // 커서를 따라가야 글 중간에 끼워 넣어도 안 깨진다
  const [cursor, setCursor] = useState(0);

  const query = activeQuery(value, cursor);
  const suggestions = query === null ? [] : suggestionsFor(query, members);

  const pick = (target: MentionTarget) => {
    const next = insertMention(value, cursor, target);
    onChangeText(next.text);
    setCursor(next.cursor);
  };

  const handleSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setCursor(e.nativeEvent.selection.start);
  };

  return (
    <View>
      <TextInput
        style={style}
        value={value}
        onChangeText={(t) => {
          onChangeText(t);
          // 타이핑 직후 selection 이벤트가 늦게 오는 기기가 있어, 길이로 커서를 먼저 맞춘다
          setCursor((c) => Math.min(c + (t.length - value.length), t.length));
        }}
        onSelectionChange={handleSelectionChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline
        autoFocus={autoFocus}
      />

      {suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => pick(s)}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
            >
              <Text style={[styles.itemName, s.id === EVERYONE && styles.everyoneName]}>@{s.name}</Text>
              {s.id === EVERYONE && <Text style={styles.itemHint}>팀 전체에게 알림</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** 마커를 초록 이름으로 그린다. 마커가 없는 옛 글은 그대로 평문으로 나온다 */
export function MentionText({ body, style }: { body: string; style?: any }) {
  return (
    <Text style={style}>
      {parse(body).map((piece, i) =>
        piece.kind === 'text' ? (
          piece.text
        ) : (
          <Text key={i} style={styles.mention}>
            @{piece.name}
          </Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 6,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.greenDeep,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemName: { color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  everyoneName: { color: colors.green, fontWeight: '800' },
  itemHint: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600' },
  mention: { color: colors.green, fontWeight: '800' },
});
