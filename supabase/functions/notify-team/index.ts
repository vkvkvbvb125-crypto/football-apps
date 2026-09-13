import { withSupabase } from 'npm:@supabase/server@^1';

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    const { teamId, title, body, excludeUserId, userIds: targetUserIds, kind, target } = await req.json();
    if (!teamId || !title || !body) {
      return Response.json({ error: 'teamId, title, body가 필요합니다.' }, { status: 400 });
    }

    /**
     * 알림 종류 → team_members의 설정 컬럼.
     *
     * kind가 없으면 아무도 거르지 않는다 — 종류를 안 밝힌 알림까지 임의로 끄면
     * 사용자가 끈 적 없는 알림이 사라진다. 새 종류를 추가할 때도 기본은 "보낸다"여야 한다.
     */
    const PREF_COLUMN: Record<string, string> = {
      // 경기 — 새 경기 · 투표 독촉 · 우천 안내가 한 토글을 쓴다
      new_match: 'notify_match',
      deadline: 'notify_match',
      weather: 'notify_match',
      // 공지
      announcement: 'notify_announcement',
      // 게시판 — 멘션 · 댓글
      mention: 'notify_board',
      comment: 'notify_board',
      // 정산
      settlement: 'notify_settlement',
    };
    const prefColumn = kind ? PREF_COLUMN[kind] : undefined;

    let userIds: string[];
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      // 특정 인원만 대상 (예: 미투표자 독촉) — 그래도 같은 팀 소속인지는 확인한다
      let q = ctx.supabaseAdmin
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .in('user_id', targetUserIds);
      if (prefColumn) q = q.eq(prefColumn, true);
      const { data: members, error: membersError } = await q;
      if (membersError) {
        return Response.json({ error: membersError.message }, { status: 400 });
      }
      userIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== excludeUserId);
    } else {
      let q = ctx.supabaseAdmin.from('team_members').select('user_id').eq('team_id', teamId);
      if (prefColumn) q = q.eq(prefColumn, true);
      const { data: members, error: membersError } = await q;
      if (membersError) {
        return Response.json({ error: membersError.message }, { status: 400 });
      }
      userIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== excludeUserId);
    }
    /*
      ── 독촉 쿨다운 ──────────────────────────────────────────────────

      화면 상태로는 못 막는다. 시트를 닫았다 열면 초기화되고, 다른 기기에는 없고,
      총무가 둘이면 서로를 모른다. 실측으로 회비 독촉은 disabled조차 없어 열 번
      누르면 열 번 다 나갔다. 그래서 여기서 막는다.

      ⚠ **독촉에만 건다.** 공지·언급·댓글은 사건 알림이라, 막으면 일어난 일을 못 알린다.
      ⚠ **키가 없으면 안 막는다.** 막는 쪽으로 기울면 「왜 안 가지」가 되는데, 그건
        이 저장소에서 이미 겪은 「조용히 안 감」이다. 못 세면 보낸다.
      ⚠ **3시간은 matchWindow의 MATCH_GRACE_MS와 무관하다. 우연히 같은 값이다.**
        저쪽은 「경기가 진행 중으로 볼 수 있는 구간」이고 이쪽은 「사람이 알림을 받고
        반응할 시간」이다. 함께 바꾸지 마라.
      ⚠ 상수를 DB가 아니라 여기 둔 이유: 바꾸는 데 마이그레이션이 필요하면
        「조금 줄여보자」를 못 하게 된다.
    */
    const COOLDOWN_MINUTES: Record<string, number> = {
      settlement: 3 * 60,
      deadline: 3 * 60,
    };
    const cooldownMin = kind ? COOLDOWN_MINUTES[kind] : undefined;
    const targetKey =
      kind === 'settlement'
        ? target?.settlementId
        : kind === 'deadline'
          ? target?.matchDate
          : undefined;
    const cooldownOn = !!cooldownMin && typeof targetKey === 'string' && !!targetKey;

    let skipped = 0;
    let retryAfterMin = 0;
    if (cooldownOn) {
      const windowMs = cooldownMin! * 60_000;
      const since = new Date(Date.now() - windowMs).toISOString();
      const { data: recent, error: cdError } = await ctx.supabaseAdmin
        .from('notify_cooldown')
        .select('user_id, sent_at')
        .eq('team_id', teamId)
        .eq('kind', kind)
        .eq('target_key', targetKey)
        .in('user_id', userIds)
        .gte('sent_at', since);
      if (cdError) {
        return Response.json({ error: cdError.message }, { status: 400 });
      }
      const blocked = new Map((recent ?? []).map((r) => [r.user_id, r.sent_at as string]));
      if (blocked.size > 0) {
        skipped = blocked.size;
        /*
          ⚠ **가장 늦게 풀리는 사람** 기준이다(max). 「N분 뒤에 다시 보낼 수 있어요」가
            「그때 누르면 전원에게 간다」를 뜻해야 하기 때문이다. min으로 잡으면 그때
            눌러도 일부만 가고, 총무는 「1명에게 보냈어요」를 보고 또 헷갈린다.
        */
        const waitMs = Math.max(
          ...[...blocked.values()].map((t) => new Date(t).getTime() + windowMs - Date.now())
        );
        retryAfterMin = Math.max(1, Math.ceil(waitMs / 60_000));
        userIds = userIds.filter((id) => !blocked.has(id));
      }
    }
    if (userIds.length === 0) {
      return Response.json({ sent: 0, skipped, retryAfterMin });
    }

    const { error: notifError } = await ctx.supabaseAdmin
      .from('notifications')
      .insert(userIds.map((userId) => ({ team_id: teamId, user_id: userId, title, body })));
    if (notifError) {
      return Response.json({ error: notifError.message }, { status: 400 });
    }

    /*
      ⚠ **여기서 기록한다 — 보내기 전이 아니라 받은 뒤다.**
        먼저 적고 실패하면 **안 갔는데 막힌다.** 그 상태는 총무 눈에 「보냈다」로
        보이고 팀원에게는 아무것도 안 가서, 되돌릴 방법도 알아챌 방법도 없다.

      ⚠ 기준이 푸시가 아니라 **알림함 행**인 이유: 푸시 토큰이 없는 사람도 알림함으로는
        받는다. 그 행이 이 앱에서 「알림이 갔다」의 정의다. 푸시는 그 위에 얹는 최선노력이고,
        exp.host가 실패해도 받은 사실은 남는다.
    */
    if (cooldownOn) {
      const now = new Date().toISOString();
      const { error: cdWriteError } = await ctx.supabaseAdmin.from('notify_cooldown').upsert(
        userIds.map((userId) => ({
          team_id: teamId,
          kind,
          target_key: targetKey,
          user_id: userId,
          /* ⚠ 기본값 now()는 insert에만 걸린다. 갱신 때도 밀려면 손으로 넣어야 한다 */
          sent_at: now,
        })),
        { onConflict: 'team_id,kind,target_key,user_id' }
      );
      if (cdWriteError) {
        return Response.json({ error: cdWriteError.message }, { status: 400 });
      }
    }

    const { data: profiles, error: profilesError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('push_token')
      .in('id', userIds);
    if (profilesError) {
      return Response.json({ error: profilesError.message }, { status: 400 });
    }

    const tokens = (profiles ?? []).map((p) => p.push_token).filter((t): t is string => !!t);
    if (tokens.length === 0) {
      /* 푸시 토큰이 하나도 없다 — 그래도 알림함에는 들어갔으므로 sent는 사람 수다 */
      return Response.json({ sent: userIds.length, skipped, retryAfterMin, pushed: 0 });
    }

    /*
      channelId를 반드시 넘긴다.

      안 넘기면 안드로이드는 Expo의 폴백 채널로 보낸다 — 실제로 재봤다:
        channel=expo_notifications_fallback_notification_channel
        mName=Miscellaneous  mVibrationPattern=null  mLightColor=0
      그러면 pushService의 ensureAndroidChannel()이 만든 'default' 채널
      (이름 「킥데이 알림」, 진동 [0,250,250,250], 초록 LED)이 한 번도 안 쓰인다.
      사용자의 안드로이드 알림 설정에도 「킥데이 알림」이 아니라 「Miscellaneous」로
      뜬다 — 무엇을 끄는지 모르는 이름이다.

      priority: 'high'는 FCM 우선순위다. 기본값은 Doze 중에 묶여 있다가 나중에
      한꺼번에 도착할 수 있는데, 여기서 보내는 것이 경기 등록·마감 독촉처럼
      늦으면 쓸모가 없어지는 것들이다.
    */
    /*
      data — 알림을 눌렀을 때 앱이 어디로 갈지 정하는 값.

      이게 없으면 알림을 눌러도 「마지막에 보던 화면」에 떨어진다. 「새 경기가
      등록됐어요」를 눌렀는데 팀 화면이 나오면, 그 알림은 사용자를 데려다주지
      못하고 「직접 찾아가라」고 하는 셈이다.

      ⚠ **kind만 싣고 끝내지 않는다.** kind는 「무슨 종류냐」고 목적지는 「어느
        경기·어느 정산이냐」다. 앱의 notificationRoute.routeFor가 둘을 같이 읽는다:
          new_match / deadline / weather  →  일정 탭 + target.matchDate
          settlement                      →  정산 탭 + target.settlementId
          announcement / mention / comment →  팀 탭 (1단계에서는 여기까지)

      ⚠ target이 **id가 아니라 날짜**인 것이 이상해 보일 수 있는데 의도다.
        일정 화면이 받는 파라미터가 focusDate라서다. 경기를 만드는 자리는
        insert 결과를 버려서 matchId가 손에 없고, 날짜는 입력값이라 항상 있다.

      ⚠ kind가 없으면 data를 아예 안 싣는다. 빈 객체를 실으면 앱이 「data는
        있는데 갈 곳이 없다」를 매번 판정하게 된다 — 없는 것과 같으니 안 싣는다.
        이 함수 이전에 나간 알림들도 data가 없고, 앱은 그때 아무 데도 안 간다.
    */
    const data = kind ? { kind, ...(target ?? {}) } : undefined;

    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      channelId: 'default',
      priority: 'high',
      ...(data ? { data } : {}),
    }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const pushJson = await pushRes.json();

    /*
      ⚠ **sent는 알림을 받은 사람 수이지 푸시 건수가 아니다.** 전에는 tokens.length였는데,
        그건 토큰 없는 사람을 「안 받은 것」으로 세는 값이라 화면이 「4명에게 보냈어요」를
        말할 때 숫자가 어긋난다. 푸시 건수는 pushed로 따로 낸다.
      ⚠ skipped·retryAfterMin을 **항상** 싣는다. 부르는 쪽이 「있으면 읽고 없으면 만다」로
        짜면, 값이 안 온 날이 곧 조용한 무시가 된다.
    */
    return Response.json({
      sent: userIds.length,
      skipped,
      retryAfterMin,
      pushed: tokens.length,
      result: pushJson,
    });
  }),
};
