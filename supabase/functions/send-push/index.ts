// Edge Function: send-push
// Triggered by DB trigger on notifications INSERT via net.http_post.
// Fetches the recipient's Expo push tokens and dispatches to Expo's push API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  let notification: { user_id: string; title: string; body: string; data?: Record<string, unknown> }
  try {
    notification = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { user_id, title, body, data } = notification
  if (!user_id || !title || !body) return json({ error: 'Missing required fields' }, 400)

  // Fetch all Expo push tokens for this user
  const { data: rows, error } = await admin
    .from('push_tokens')
    .select('token')
    .eq('user_id', user_id)

  if (error) return json({ error: error.message }, 500)
  if (!rows || rows.length === 0) return json({ ok: true, sent: 0 })

  const messages = rows.map((r: { token: string }) => ({
    to: r.token,
    title,
    body,
    data: data ?? {},
    sound: 'default',
  }))

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })

  if (!expoRes.ok) {
    const err = await expoRes.text()
    return json({ error: `Expo push failed: ${err}` }, 502)
  }

  return json({ ok: true, sent: messages.length })
})
