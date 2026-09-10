// src/features/tour/tourStore.ts — 튜토리얼을 어디까지 봤는가
//
// ⚠ **역할별로 따로 센다.** 팀을 만든 사람(총무)과 참가한 사람(팀원)이 배워야 하는
//   것이 완전히 다르다 — 총무에게 「참석 투표하는 법」만 알려주면 정작 경기를 못 만들고,
//   팀원에게 「경기 만들기」를 알려주면 없는 버튼을 찾게 된다.
//
//   그 갈림은 **이미 코드에 있다.** 따로 기억할 필요가 없다:
//     create_team → team_members.role = 'admin'   (schema.sql:220)
//     join_team   → team_members.role = 'member'
//   그래서 activeTeam.role만 보면 어느 코스인지 정해진다.
//
// ── 왜 기기에 두나 ─────────────────────────────────────────────────
// AsyncStorage다. 서버(team_members에 컬럼 하나)가 더 맞는 자리이긴 하다 —
// 폰을 바꾸면 다시 뜨고, 팀원이 총무가 되면 총무 코스를 봐야 하는데 기기 플래그로는
// 그 순간을 못 가른다.
//
// ⚠ 그래도 1차는 기기다. 마이그레이션이 필요한데 **원격 이력이 비어 있어
//   `supabase db push`를 쓸 수 없고**(옛 마이그레이션이 재생되면서 테이블을 지운다),
//   대시보드에서 손으로 적용해야 한다. 튜토리얼 하나 때문에 그 위험을 지지 않는다.
//   옮길 때는 키 이름을 그대로 컬럼으로 쓰면 된다.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TourRole = 'admin' | 'member';

/* 역할마다 다른 키. 「봤다」가 한 칸이면 총무가 된 팀원이 총무 코스를 못 본다 */
const keyOf = (role: TourRole) => `kickday:tour:${role}`;

interface TourState {
  /** 읽어 왔는가. 읽기 전에 띄우면 이미 본 사람에게 한 번 번쩍인다 */
  loaded: boolean;
  /** 역할별로 「끝냈다」 */
  done: Partial<Record<TourRole, boolean>>;
  load: () => Promise<void>;
  finish: (role: TourRole) => Promise<void>;
  /** 설정의 「튜토리얼 다시 보기」 — 그 역할만 되돌린다 */
  reset: (role: TourRole) => Promise<void>;
}

export const useTourStore = create<TourState>((set, get) => ({
  loaded: false,
  done: {},

  load: async () => {
    const [admin, member] = await Promise.all([
      AsyncStorage.getItem(keyOf('admin')),
      AsyncStorage.getItem(keyOf('member')),
    ]);
    set({ done: { admin: admin === 'true', member: member === 'true' }, loaded: true });
  },

  /*
    ⚠ **상태를 먼저 올리고 저장은 그다음이다.** 반대로 두었더니 닫자마자 다시 켜졌다.

    닫는 쪽(TourProvider의 close)은 `setRunning(null)`을 곧바로 한다. 그런데 여기서
    AsyncStorage를 먼저 기다리면 그 사이 `done[role]`이 아직 false라, 자동 시작 effect가
    「안 본 코스가 있고 지금 안 돌고 있다」로 읽고 **1단계부터 다시 띄운다.**
    기기에서 잡았다 — 뒤로가기로 닫은 뒤 310ms 만에 재시작됐다(logcat).
    쓰기가 빠르면 안 나서 「가끔 되는」 것으로 보인다.

    저장이 실패하면 다음 실행 때 한 번 더 뜰 뿐이고, 그건 지금 상태보다 낫다.
  */
  finish: async (role) => {
    set({ done: { ...get().done, [role]: true } });
    await AsyncStorage.setItem(keyOf(role), 'true');
  },

  /*
    ⚠ **finish와 순서가 반대다. 대칭을 맞춘다고 뒤집지 마라.**

    가르는 것은 「그 사이에 누가 옛 상태를 보면 안 되는가」다.
      finish  닫는 쪽이 running을 즉시 비우므로, done이 늦으면 자동 시작 effect가
              그 틈에 투어를 다시 켠다 → **상태를 먼저** 올린다.
      reset   done을 먼저 내리면 그 순간 자동 시작 effect가 돌아서, 아직 설정 화면에
              있는데 코치마크가 그 위에 뜬다. 부르는 쪽이 await 뒤에 goBack하므로
              **저장을 먼저** 하고 상태는 그다음이다.
    기기에서 확인했다 — 「다시 보기」를 누른 뒤 0.8초까지 설정 화면에 막이 없다.
  */
  reset: async (role) => {
    await AsyncStorage.removeItem(keyOf(role));
    set({ done: { ...get().done, [role]: false } });
  },
}));
