import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') as string
const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string).replace('v1,whsec_', '')
const FROM_ADDRESS = Deno.env.get('EMAIL_FROM') ?? 'BusyBeeGrocer <onboarding@resend.dev>'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string

interface EmailHookPayload {
  user: { email: string }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
  }
}

function subjectFor(actionType: string) {
  if (actionType === 'signup') return 'Welcome to BusyBeeGrocer — confirm your email'
  if (actionType === 'invite') return "You've been invited to BusyBeeGrocer"
  return 'Your BusyBeeGrocer sign-in link'
}

function htmlFor(actionType: string, verifyUrl: string, token: string) {
  const heading = actionType === 'signup' ? 'Welcome to BusyBeeGrocer 🐝🛒' : 'Your sign-in link'
  return `
    <div style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #0b0b0b;">
      <h2 style="margin-bottom: 8px;">${heading}</h2>
      <p>Tap the button below to continue — it'll open BusyBeeGrocer and sign you in automatically:</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="display:inline-block;background:#2a78d6;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">
          Continue to BusyBeeGrocer
        </a>
      </p>
      <p style="color:#52514e;font-size:13px;">Or use this one-time code if asked: <code style="background:#f4f3ec;padding:2px 6px;border-radius:4px;">${token}</code></p>
      <p style="color:#898781;font-size:12px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('not allowed', { status: 400 })
  }

  const payload = await req.text()
  const headers = Object.fromEntries(req.headers)
  const wh = new Webhook(hookSecret)

  let data: EmailHookPayload
  try {
    data = wh.verify(payload, headers) as EmailHookPayload
  } catch (error) {
    console.log('webhook verification failed', error)
    return new Response(JSON.stringify({ error: { message: 'invalid webhook signature' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { user, email_data } = data
  const { token, token_hash, redirect_to, email_action_type } = email_data
  const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [user.email],
        subject: subjectFor(email_action_type),
        html: htmlFor(email_action_type, verifyUrl, token),
      }),
    })
    if (!res.ok) {
      throw new Error(`Resend API error: ${res.status} ${await res.text()}`)
    }
  } catch (error) {
    console.log('send failed', error)
    return new Response(JSON.stringify({ error: { message: (error as Error).message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
