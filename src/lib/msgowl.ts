// MsgOwl OTP helpers — calls the local otp-auth Edge Function
// which handles MsgOwl API + Supabase session creation server-side.

const BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/otp-auth`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export interface SendResult {
  success?: boolean;
  id?: string;
  error?: string;
}

export interface VerifyResult {
  token_hash?: string;
  user_id?: string;
  error?: string;
}

async function post(body: object): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

export async function sendOTP(phoneNumber: string): Promise<SendResult> {
  try {
    const res = await post({ action: 'send', phone_number: phoneNumber });
    return res.json();
  } catch (e: any) {
    return { error: e.message ?? 'Network error' };
  }
}

export async function verifyOTP(phoneNumber: string, code: string): Promise<VerifyResult> {
  try {
    const res = await post({ action: 'verify', phone_number: phoneNumber, code });
    return res.json();
  } catch (e: any) {
    return { error: e.message ?? 'Network error' };
  }
}
