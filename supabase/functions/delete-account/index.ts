import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deletes the *calling* user's account.
//
// A browser client cannot delete its own auth user -- that needs service-role
// access, which must never be shipped to a browser. So the privilege lives
// here, behind a check that the caller is who they say they are.
//
// The single security property this function rests on: the account to delete is
// read from the caller's own verified token and from nowhere else. It never
// reads a user id from the request body or query string. If it did, holding any
// valid session would be enough to delete anyone's account.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') as string
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string

// The origin is not the gate here -- a valid access token is, and another site
// cannot read this app's token out of its localStorage.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in' }, 401)

  // Resolve the caller by asking Supabase who this token belongs to. Anything
  // the request *says* about identity is ignored.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: whoError,
  } = await asCaller.auth.getUser()

  if (whoError || !user) return json({ error: 'Not signed in' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Deleting the auth user cascades to profiles, and from there to
  // group_members -- whose BEFORE DELETE trigger hands any lists and group
  // ownership to the longest-standing remaining member. Everything else that
  // referenced this user (items added, stores created, past trips) is set to
  // null by the foreign keys, so the group keeps the content and loses only the
  // attribution. See migration 20260806015412.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteError) {
    console.log('account deletion failed for', user.id, deleteError.message)
    return json({ error: deleteError.message }, 500)
  }

  console.log('account deleted', user.id)
  return json({ deleted: true }, 200)
})
