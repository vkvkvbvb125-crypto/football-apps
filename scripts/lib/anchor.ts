// scripts/lib/anchor.ts — 소스에서 「이 자리」를 집을 때 쓰는 것들
//
// 검사에는 성격이 다른 두 단언이 섞여 있다. 둘을 가르지 않으면 한쪽 방식으로 다른 쪽을
// 재게 되고, 그때 검사는 **통과하는데 재는 자리가 다르다** — 실패보다 이쪽이 나쁘다.
// 실패는 눈에 띄고, 엉뚱한 걸 재면서 통과하는 건 안 띈다.
//
//   「이름이 쓰이는가」   그냥 .test / includes를 쓴다.
//                        스타일 이름이나 함수 이름은 정의부와 사용부에 각각 나오므로
//                        2회가 정상이다. 여기에 개수를 걸면 사용처가 하나 늘 때마다 깨진다.
//
//   「이 자리인가」       아래 것들을 쓰거나 파서로 노드를 집는다.
//                        같은 꼴이 파일에 둘 이상이면 indexOf는 앞의 것을 집고
//                        .test는 어느 하나만 있어도 통과한다.
//
//   「쓰이지 않는가」     이름이 사라졌는지가 아니라 **쓰이는 자리**가 없는지를 본다.
//                        !/soloList/ 로 「갈래가 돌아왔는가」를 보다가 걸렸다 —
//                        그 갈래를 없앤 근거는 주석에 남겨야 하는데, 그 주석에 이름이
//                        들어 있어서 단언이 늘 실패했다. 「이름이 없는가」와
//                        「쓰이지 않는가」는 다르고, 근거 주석에는 그 이름이 남는다.
//                        styles.X 참조나 스타일 정의처럼 코드에서 쓰이는 꼴을 집어라.
//
//   스타일 이름을 앵커로  다른 이름의 접두사인지 먼저 확인한다. 닫는 중괄호까지 본다:
//                        'style={styles.sectionHead}' 처럼.
//                        두 번 겪었고 둘 다 컨테이너 대신 그 안의 노드를 집었다.
//                          styles.sectionHead   ⊂ styles.sectionHeadLink → Pressable을 집었다
//                          styles.myRecord      ⊂ styles.myRecordTitle   → Text를 집었다
//                        두 번이면 우연이 아니다. 이 프로젝트의 스타일 이름은 짧은 것에
//                        접미사를 붙여 파생시키는 규칙이라(Link·Title·Row·On·Off),
//                        짧은 쪽을 앵커로 쓰면 긴 쪽이 먼저 걸린다.
//
// 이 구분은 세어 보고 정했다. 정규식으로 소스를 보는 단언이 157개인데 패턴이 2회 이상
// 매치되는 것이 13개였고, 그중 9개가 구조적 2회(정의부+사용부)였다. 전부에 개수를 거는
// 헬퍼를 기본값으로 두면 9개가 즉시 깨지고 각각 예외를 달아야 한다 — 부정 단언 감사기가
// 38개 중 22개를 「판정 불가」로 내놓아 폐기된 것과 같은 구조가 된다.
//
// ── 왜 공용 파일인가 ────────────────────────────────────────────────
//
// onlyIndexOf가 teamsettings.check와 invitecard.check 두 곳에 복사돼 있었다.
// score·timerring·upcoming에서 「검사가 자기 사본을 시험한다」를 셋 걷어낸 직후였다.
// 한쪽만 고치면 다른 쪽이 옛 방식으로 남는다.
import assert from 'node:assert/strict';

/**
 * indexOf인데, 두 번 이상 나오면 실패한다.
 *
 * 문자열 앵커를 쓸 일이 있으면 이걸 통과시켜라. 앵커가 1회가 아니면 실패한다는 게
 * 기본값이어야 한다.
 *
 * 그냥 indexOf는 같은 꼴이 둘이 되는 날 **조용히 앞의 것을 집는다.** 세 번 겪었다.
 *
 *   teamsettings   </> + )} 가 둘이라 저장 버튼 쪽을 집었다. 총무 구간을 통째로 지운
 *                  변이가 그 틈으로 샜다.
 *   uidetail       sectionHeadLink가 둘이 되면서 히어로 링크를 집었다.
 *   teamprofile    profileBits 첫 것이 props 인터페이스라 렌더 자리에 닿지 않았다.
 *                  무엇을 넣어도 통과하는 단언이 됐다.
 *
 * 개별로 고치는 대신 경로를 없앤다. 못 찾아도, 둘 이상이어도 「재료 없음」으로 시끄럽게
 * 끝난다 — 잘못된 통과보다 시끄러운 실패가 낫다.
 */
export const onlyIndexOf = (src: string, needle: string, what: string) => {
  const n = src.split(needle).length - 1;
  assert.equal(n, 1, `${what}: 앵커가 ${n}개다(1개여야 한다) — ${needle.slice(0, 50)}`);
  return src.indexOf(needle);
};

/**
 * 정규식판 짝 — 매치가 정확히 하나일 때만 통과한다.
 *
 * onlyIndexOf가 「앞의 것을 집는」 고장을 막듯, 이건 「어느 하나만 있어도 통과」를 막는다.
 * 증상이 같다: 의도한 자리가 사라져도 다른 자리가 검사를 통과시킨다.
 *
 * 기본값으로 쓰지 마라. 위 머리말의 구분대로 「이 자리인가」를 물을 때만 쓴다 —
 * 「이름이 쓰이는가」에 걸면 정의부+사용부 때문에 늘 2회라 헛돈다.
 *
 * 자리를 특정할 수 있으면 파서가 더 낫다. 이건 파서를 쓰기엔 과한 자리용이다.
 */
export const onlyMatch = (src: string, re: RegExp, what: string) => {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  const hits = src.match(g) ?? [];
  assert.equal(hits.length, 1, `${what}: 매치가 ${hits.length}개다(1개여야 한다) — ${re.source.slice(0, 50)}`);
  return hits[0];
};
