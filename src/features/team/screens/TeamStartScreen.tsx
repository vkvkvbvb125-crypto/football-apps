// src/features/team/screens/TeamStartScreen.tsx — 로그인 직후 팀 선택 단계 (리디자인 적용판)
// rn-code 원본은 팀 이름 입력이 없고(onCreate()만 호출) 초대 코드도 6칸 탭-삭제 전용
// 목업이라, 실제 8자리 invite_code 스펙(DB의 teams.invite_code)과 teamStore API에 맞춰
// 이름 입력 폼 + 실제 키보드 입력을 붙였다.
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, ScrollView, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TextInput as RNTextInput } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { useTeamStore } from '../stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';

const CODE_LENGTH = 8;

export function TeamStartScreen() {
  const { colors, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const removedFromTeam = useTeamStore((s) => s.removedFromTeam);
  const clearRemovedFromTeam = useTeamStore((s) => s.clearRemovedFromTeam);
  /* ⚠ **화면을 떠날 때 끈다.** 한 번 보여주면 할 일을 다 한 안내다 —
       안 끄면 다음에 팀을 만들려고 이 화면에 와도 「내보내졌어요」가 따라온다 */
  useEffect(() => () => clearRemovedFromTeam(), [clearRemovedFromTeam]);
  const [pick, setPick] = useState<'create' | 'join' | null>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const codeInputRef = useRef<RNTextInput>(null);

  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const loading = useTeamStore((s) => s.loading);
  const error = useTeamStore((s) => s.error);
  const createTeam = useTeamStore((s) => s.createTeam);
  const joinTeam = useTeamStore((s) => s.joinTeam);


  /*
   * 이 화면은 두 가지 자리에서 열린다.
   *
   *   팀이 없을 때   RootNavigator가 이 화면만 그린다("TeamOnboarding"). 팀이 생기면
   *                  브랜치가 통째로 바뀌면서 사라진다 — 여기서 할 일이 없다(canGoBack이 거짓).
   *                  ⚠ **이게 성립하려면 새 브랜치에 같은 이름이 없어야 한다.** 전에는
   *                    팀이 있을 때의 등록도 "TeamOnboarding"이라 안 사라졌고, 그래서
   *                    「만들었는데 화면이 그대로」가 됐다. 지금은 "TeamAddAnother"다.
   *   팀이 있을 때   팀 전환 시트의 「새 팀 만들기 / 참여」가 스택에 얹는다. 이때는
   *                  브랜치가 그대로라 저절로 안 닫힌다 — 팀이 바뀌면 직접 내려와야 한다.
   *
   * 그래서 「활성 팀이 바뀌었나」를 보고 닫는다. 만들었든 가입했든 결과는 같다.
   */
  const navigation = useNavigation();
  const activeTeamId = useTeamStore((s) => s.activeTeam?.team.id);
  const openedWith = useRef(activeTeamId);
  useEffect(() => {
    if (activeTeamId !== openedWith.current && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [activeTeamId]);

  /*
    ⚠ **여기서 pendingInvite를 소비하지 않는다.** 전에는 이 화면이 유일한 소비처였고,
      그래서 **팀이 있는 사용자가 초대 링크를 열면 코드가 조용히 버려졌다** —
      `App.tsx`가 스토어에 넣는데 이 화면에 영영 안 오기 때문이다(출시 차단 ⑤).

      이제 `RootNavigator`가 한 곳에서 소비한다. **두 곳에서 소비하면 경합한다** —
      팀 없는 사용자는 이 화면이 먼저 그려져 여기서 지워 버리고, 확인 시트는
      영영 안 뜬다. 그래서 이쪽을 뗐다.

    ⓘ 잃은 것: 이 화면의 코드 칸에 **미리 채워 주던 편의**. 대신 확인 시트에서
      바로 참여되므로 칸을 채울 일 자체가 없다.
  */

  const userName = (session?.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? '회원';

  const handleCreate = () => {
    if (!teamName.trim()) return;
    createTeam(teamName.trim());
  };

  const handleJoin = () => {
    if (code.trim().length < CODE_LENGTH) return;
    joinTeam(code.trim());
  };

  return (
    <ScreenGradient>
      {/*
        ⚠ **behavior는 "padding"이다. `Platform.OS === 'ios' ? ... : undefined`로 쓰면
          안드로이드에서 아무 일도 안 한다** — 창이 안 줄어서 ScrollView에 스크롤할
          것조차 안 생긴다. 2026-09-17에 네 화면에서 그 꼴로 깨져 있었다(3ccf014).
        ⚠ 이 화면은 내용이 짧아 스크롤로 버튼을 데려올 수 없다. KAV가 창을 키보드
          위로 줄여 주는 것이 **유일한** 수단이다.
      */}
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        {/*
          ⚠ **스크롤이 있어야 한다. 없으면 키보드가 「만들기」를 덮는다.**

          팀 이름을 치면 키보드가 올라오는데, 이 화면은 전에 ScrollView가 없어서
          버튼이 키보드 아래로 들어가면 **닿을 방법이 아예 없었다** — 스크롤도 안 되고
          창도 그만큼 안 줄었다. 사용자는 키보드를 내려야만 팀을 만들 수 있었다.
          **가입 직후 반드시 지나는 화면**이라 첫인상에서 막히는 자리다.
          2026-09-17에 기기에서 확인했다(1080x2400에서 버튼이 화면 밖).

          ⚠ 버튼을 이 안에 둔다 — 밖에 고정하면 같은 문제가 돌아온다.
            LoginScreen·ResetPasswordScreen이 이미 이 모양이고 키보드 위로 올라온다.
          ⚠ keyboardShouldPersistTaps="handled" 가 없으면 키보드가 떠 있을 때
            첫 탭이 키보드를 내리는 데만 쓰이고 버튼에 안 닿는다.
        */}
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={{ gap: 8, paddingTop: 10 }}>
          <View style={styles.greetRow}>
            <Text style={styles.greet}>{userName}님, 반가워요</Text>
          </View>
          {/*
            ⚠ **여기 오는 길이 둘이다.** 가입 직후(팀이 아직 없음)와
              **팀에서 빠진 뒤**(강퇴·해체)다. 후자는 사용자가 **아무것도 안 했는데**
              화면이 바뀌므로 이유를 말해야 한다.

            ⚠ 2026-09-19 전에는 말해 주기는커녕 **껍데기 홈**에 남았다 — 팀 이름이
              사라지고 「경기 없음 · 0건 · 0원」인데 여전히 홈 탭 안이었다.
              「내 데이터가 다 사라졌다」로 읽힌다.

            ⚠ **강퇴인지 해체인지 적지 않는다.** 클라이언트가 알 방법이 없고,
              둘 중 하나라고 단정하면 틀린 쪽에는 거짓말이 된다.
          */}
          {removedFromTeam && (
            <View style={styles.removedNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textDim} />
              <Text style={styles.removedText}>
                더 이상 이 팀의 멤버가 아니에요. 총무가 내보냈거나 팀이 해체되었어요.
              </Text>
            </View>
          )}
          <Text style={styles.title}>
            마지막 단계예요{'\n'}
            <Text style={{ color: colors.green }}>팀을 선택해주세요</Text>
          </Text>
        </View>

        <Pressable
          onPress={() => setPick('create')}
          accessibilityRole="radio"
          accessibilityState={{ selected: pick === 'create' }}
          style={[styles.card, pick === 'create' && styles.cardOn]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.icon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
              <Ionicons name="add" size={20} color={colors.green} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cardTitle}>새 팀 만들기</Text>
              <Text style={styles.cardSub}>내가 총무가 되어 팀을 운영해요</Text>
            </View>
          </View>

          {pick === 'create' && (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.nameInput}
                placeholder="팀 이름 (예: 강남 풋살 모임)"
                placeholderTextColor={colors.placeholder}
                value={teamName}
                onChangeText={setTeamName}
              />
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => setPick('join')}
          accessibilityRole="radio"
          accessibilityState={{ selected: pick === 'join' }}
          style={[styles.card, pick === 'join' && styles.cardOn]}
        >
          <View style={styles.cardRow}>
            <View style={[styles.icon, { backgroundColor: colors.overlay }]}>
              <Ionicons name="arrow-forward" size={20} color={colors.textStrong} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cardTitle}>초대 코드로 참여</Text>
              <Text style={styles.cardSub}>받은 {CODE_LENGTH}자리 코드를 입력해요</Text>
            </View>
          </View>

          {pick === 'join' && (
            /*
              ⚠ **입력칸이 실제 크기여야 한다. 0픽셀 숨은 입력은 키보드를 못 띄운다.**

              전에는 `hiddenInput: { width: 0, height: 0, opacity: 0 }`를 두고
              칸 8개를 감싼 Pressable이 `ref.focus()`를 불렀다. **화면 크기에 따라
              갈렸다** — 2026-09-18에 쟀다:

                  1080x2400   눌러도 뜬다     mInputShown=true
                  1080x1920   **안 뜬다**     x를 155·300·540 어디서 눌러도 false
                              (같은 화면의 팀 이름 칸은 뜬다 — IME는 멀쩡하다)

              크기가 0인 뷰에 안드로이드가 `showSoftInput`을 거부하는 자리고,
              **막히면 총무가 아닌 모든 팀원의 가입 경로가 막힌다.**

              지금은 **칸 위에 실제 크기의 TextInput을 겹친다.** 글자만 투명하게 해서
              보이는 것은 그대로 칸 8개고, 탭·붙여넣기·선택은 진짜 입력이 받는다.
              ⚠ 칸들은 `pointerEvents="none"`이라 탭이 그 아래 입력으로 내려간다 —
                안 그러면 칸이 탭을 먹고 다시 같은 증상이 된다.
            */
            <View style={styles.codeWrap}>
              <View style={styles.codeRow} pointerEvents="none">
                {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                  <View key={i} style={[styles.codeCell, i === code.length && styles.codeCellActive]}>
                    <Text style={styles.codeText}>{code[i] ?? ''}</Text>
                  </View>
                ))}
              </View>
              <TextInput
                ref={codeInputRef}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, CODE_LENGTH))}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={CODE_LENGTH}
                caretHidden
                accessibilityLabel={`초대 코드 입력, ${code.length}자리 입력함`}
                style={styles.codeInput}
              />
            </View>
          )}
        </Pressable>

        <View style={{ flex: 1 }} />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.note}>
          팀은 나중에 여러 개 만들 수도 있어요.{'\n'}초대 링크를 받았다면 링크만 눌러도 바로 참여됩니다.
        </Text>

        </ScrollView>

        {/*
          ⚠ **버튼은 ScrollView 밖, KAV 안이다.** 안에 두면 작은 화면에서 키보드 아래로
            들어간다 — 2026-09-18에 1080x1920에서 쟀다(버튼 상단 1373, 잘림선 1048).
            큰 화면(1080x2400)에서는 여유 58px로 **통과했다.** 큰 화면만 보면 안 보인다.

          창이 키보드 위로 줄면 그 마지막 형제가 키보드 바로 위에 선다.
          SignUpScreen이 같은 이유로 같은 모양이다(237cc87).

          ⚠ 이 화면은 **내용이 짧아 스크롤로 버튼을 데려올 수도 없다** —
            안에 두면 닿을 방법 자체가 없다.
        */}
        {pick === 'join' ? (
          <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              accessibilityRole="button"
              disabled={code.length < CODE_LENGTH || loading}
              onPress={handleJoin}
              style={[styles.cta, (code.length < CODE_LENGTH || loading) && { opacity: 0.4 }]}
            >
              <Text style={styles.ctaText}>{loading ? '참여 중…' : '참여하기'}</Text>
            </Pressable>
          </View>
        ) : pick === 'create' ? (
          <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              accessibilityRole="button"
              disabled={!teamName.trim() || loading}
              onPress={handleCreate}
              style={[styles.cta, (!teamName.trim() || loading) && { opacity: 0.4 }]}
            >
              <Text style={styles.ctaText}>{loading ? '만드는 중…' : '만들기'}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 절대배치라 형제 중 마지막에 둬야 한다 —
            앞에 두면 뒤따르는 콘텐츠가 위를 덮어서 눌러도 반응하지 않는다 */}
        {/*
          팀 없이 시작할 때는 여기서 갈 곳이 로그아웃뿐이다. 반대로 팀 전환 시트에서
          열렸을 때는 이미 팀이 있으므로 로그아웃이 아니라 돌아가기가 필요하다 —
          그 상태에서 로그아웃만 있으면 나갈 길이 없다.
        */}
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={styles.signOutRow}
            accessibilityRole="button"
            accessibilityLabel="돌아가기"
          >
            <Text style={styles.signOutText}>닫기</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={signOut} hitSlop={10} style={styles.signOutRow}>
            <Text style={styles.signOutText}>로그아웃</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  /* ⚠ **여기에 paddingBottom을 두지 마라 — KeyboardAvoidingView가 덮는다.**
       behavior="padding"은 `StyleSheet.compose(style, {paddingBottom: bottomHeight})`로
       렌더한다(react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:279).
       뒤가 이기므로 여기 적은 값은 **키보드가 없을 때도** 0으로 덮인다.
       전에 `paddingBottom: 34`가 있었고 **한 번도 안 먹었다** — 그래서 버튼 하단이
       창 바닥보다 16px 아래에 있었다(2026-09-19 실측, 키보드 유무와 무관).
       아래 여백은 ctaBar에 인라인으로 준다. */
  root: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  /* gap은 스크롤 내용 쪽으로 옮겼다 — root에 두면 ScrollView 한 덩어리에만 걸린다.
     flexGrow로 내용이 짧아도 화면을 채워 아래 여백이 비지 않게 한다. */
  scrollBody: { flexGrow: 1, gap: 18, paddingBottom: 8 },
  /* 버튼이 ScrollView 밖으로 나가면서 생긴 바. 스크롤 내용과 붙지 않게 위를 띄운다.
     ⚠ **아래 여백은 여기서 인라인으로 준다**(`insets.bottom + 16`). root(=KAV)에 두면
        위 주석대로 덮여서 사라진다. Login·SignUp·Forgot·ResetPassword가 모두 이 모양이다. */
  ctaBar: { paddingTop: 12 },
  removedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  removedText: { flex: 1, color: colors.textDim, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  signOutRow: { position: 'absolute', top: 8, right: 24 },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greet: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.7, lineHeight: 34 },

  card: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOn: { backgroundColor: 'rgba(34,197,94,0.09)', borderColor: colors.greenDeep },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardSub: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },

  inlineForm: { paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.inputBg,
  },

  codeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  codeCell: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeCellActive: { borderColor: colors.green },
  codeText: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  /* 칸과 입력을 겹치는 자리. 높이는 칸이 정하고 입력이 그 위를 덮는다 */
  codeWrap: { position: 'relative' },
  /*
    ⚠ **투명하게 하되 크기는 실제로 준다.** width/height 0이면 안드로이드가
      키보드를 안 띄운다(2026-09-18 실측). 글자색만 투명하게 해서 칸 8개가 보이게 둔다.
    ⚠ `caretHidden` — 칸이 활성 테두리로 자기 커서를 그리므로 두 개가 되면 안 된다.
  */
  codeInput: {
    /*
      ⚠ **오프셋을 숫자로 맞추지 않는다.** codeRow에 marginTop·borderTop·paddingTop이
        겹쳐 있어서 「칸이 시작하는 y」를 상수로 적으면 그 셋 중 하나만 바뀌어도 어긋난다.
        wrap 전체를 덮는다 — 위쪽 여백을 눌러도 입력이 잡히니 탭 영역만 넓어진다.
    */
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    /*
      ⚠ **`color: 'transparent'`가 안 먹는다. opacity로 감춘다.**

      2026-09-18에 픽셀로 쟀다. 같은 좌표를 고치기 전/후로 견줬다(y=982):

          x=450   (0,0,0)    → (12,16,14)     글자 획이 배경이 됐다
          x=490   (8,10,9)   → (12,16,14)
          x=620   (0,0,0)    → (12,16,14)
          x=530   (51,62,56) → (51,62,56)     칸 사이 간격 — 안 변한다

      ⚠ 처음에 (51,62,56)을 「밝으니 글자 획」으로 읽었다가 틀렸다. 고친 뒤에도
        그대로여서 **간격 배경**이었음이 드러났다. 한 장만 보고 밝기로 판단하면
        갈리지 않는다 — **같은 좌표를 전후로 견줘야** 무엇이 글자였는지 알 수 있다.

      ⚠ **opacity 0이면서 크기는 실제로 준다.** width/height를 0으로 두면
        안드로이드가 키보드를 안 띄운다 — 그게 이 입력을 고친 원래 이유다(4f9448c).
        감추는 수단만 바꾸고 크기는 그대로 둔다.
    */
    opacity: 0,
    fontSize: 15,
    textAlign: 'center',
    padding: 0,
  },

  errorText: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  note: { color: colors.textFaint, fontSize: 11, textAlign: 'center', lineHeight: 18 },
  cta: { height: 52, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  });
