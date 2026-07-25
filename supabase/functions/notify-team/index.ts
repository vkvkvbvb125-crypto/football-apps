import { withSupabase } from 'npm:@supabase/server@^1';

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    const { teamId, title, body, excludeUserId } = await req.json();
    if (!teamId || !title || !body) {
      return Response.json({ error: 'teamId, title, body가 필요합니다.' }, { status: 400 });
    }

    const { data: members, error: membersError } = await ctx.supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId);
    if (membersError) {
      return Response.json({ error: membersError.message }, { status: 400 });
    }

    const userIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== excludeUserId);
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
