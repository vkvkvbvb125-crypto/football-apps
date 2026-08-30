import { withSupabase } from 'npm:@supabase/server@^1';

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    const { teamId, title, body, excludeUserId, userIds: targetUserIds, kind } = await req.json();
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
      new_match: 'notify_new_match',
      announcement: 'notify_announcement',
      deadline: 'notify_deadline',
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
    if (userIds.length === 0) {
      return Response.json({ sent: 0 });
    }

    const { error: notifError } = await ctx.supabaseAdmin
      .from('notifications')
      .insert(userIds.map((userId) => ({ team_id: teamId, user_id: userId, title, body })));
    if (notifError) {
      return Response.json({ error: notifError.message }, { status: 400 });
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
      return Response.json({ sent: 0 });
    }

    const messages = tokens.map((to) => ({ to, title, body, sound: 'default' }));

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const pushJson = await pushRes.json();

    return Response.json({ sent: tokens.length, result: pushJson });
  }),
};
