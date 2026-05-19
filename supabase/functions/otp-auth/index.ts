// FlickMV — OTP auth via MsgOwl
// POST { action: 'send', phone_number } → { success, id }
// POST { action: 'verify', phone_number, code } → { session, user_id }
//
// Synthetic email format: phone+{e164_without_plus}@phone.flix.local
// GoTrue requires an email for magic-link generation. Phone-only users get this
// synthetic address so generateLink works. It is NEVER shown to the user and is
// not stored in public.users (the handle_new_user trigger only writes id/username/phone).
// Legacy accounts without an email get it backfilled on next successful OTP verify.

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const MSGOWL_KEY      = Deno.env.get('MSGOWL_ACCESS_KEY')!
  const SENDER_ID       = Deno.env.get('MSGOWL_SENDER_ID') ?? 'SALESIFY'
  const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  let body: { action?: string; phone_number?: string; code?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { action, phone_number, code } = body

  // ── SEND ──────────────────────────────────────────────────────────────────
  if (action === 'send') {
    if (!phone_number) return json({ error: 'phone_number required' }, 400)

    const res = await fetch('https://otp.msgowl.com/send', {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${MSGOWL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone_number, code_length: 6, sender_id: SENDER_ID }),
    })

    const data = await res.json()
    if (!res.ok) return json({ error: data.detail ?? data.message ?? 'Failed to send OTP' }, 400)
    return json({ success: true, id: data.id })
  }

  // ── VERIFY ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!phone_number || !code) return json({ error: 'phone_number and code required' }, 400)

    // GoTrue stores phone without leading '+'; MsgOwl wants the full E.164.
    const normPhone = phone_number.startsWith('+') ? phone_number.slice(1) : phone_number
    const syntheticEmail = `phone+${normPhone}@phone.flix.local`

    // 1. Verify OTP with MsgOwl
    const verRes = await fetch('https://otp.msgowl.com/verify', {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${MSGOWL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone_number, code }),
    })
    const verData = await verRes.json().catch(() => ({}))
    if (!verRes.ok || !verData.status) {
      return json({ error: 'Invalid or expired code' }, 400)
    }

    // 2. Find or create the auth user, ensure the synthetic email is set.
    let userId: string

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      phone: normPhone,
      email: syntheticEmail,
      phone_confirm: true,
      email_confirm: true,
    })

    if (createErr) {
      const { data: foundId, error: rpcErr } = await admin.rpc('get_user_id_by_phone', {
        p_phone: normPhone,
      })

      if (rpcErr || !foundId) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
        if (listErr) return json({ error: listErr.message }, 500)
        const found = list.users.find(
          (u) => u.phone === normPhone || u.phone?.replace('+', '') === normPhone,
        )
        if (!found) return json({ error: createErr.message ?? 'Could not locate account' }, 500)
        userId = found.id
      } else {
        userId = foundId as string
      }

      // Backfill the synthetic email on legacy phone-only users so generateLink works.
      const { data: existing } = await admin.auth.admin.getUserById(userId)
      if (existing?.user?.email !== syntheticEmail) {
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
          email: syntheticEmail,
          email_confirm: true,
        })
        if (updErr) return json({ error: `Email backfill failed: ${updErr.message}` }, 500)
      }
    } else {
      userId = created.user.id
    }

    // 3. Mint a one-shot magic-link token; client exchanges it for a real session.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
    })
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: `Link generation failed: ${linkErr?.message ?? 'no token'}` }, 500)
    }

    return json({
      token_hash: linkData.properties.hashed_token,
      user_id: userId,
    })
  }

  return json({ error: 'Unknown action' }, 400)
})
