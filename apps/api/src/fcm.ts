/**
 * [API • LIB] FCM v1 Push Sender
 *
 * Firebase Cloud Messaging (FCM) v1 HTTP API Client for Cloudflare Workers
 * 100% Web Crypto API compatible (Edge runtime, no Node.js native crypto required)
 */

import { WL } from '../../../white-label.config';

interface FCMNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badge?: number;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function pemToBinary(pem: string): Uint8Array {
  const clean = pem
    .replace(/-----BEGIN[ A-Z0-9_-]+PRIVATE KEY-----/g, '')
    .replace(/-----END[ A-Z0-9_-]+PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates an OAuth2 Access Token for Google Cloud / Firebase v1 using RS256 JWT
 */
export async function getGoogleOAuth2AccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  // Return cached token if still valid (with 5 min safety buffer)
  if (cachedAccessToken && tokenExpiresAt > now + 300) {
    return cachedAccessToken;
  }

  // Format private key (handle escaped \n in env strings)
  const normalizedKey = privateKeyPem.replace(/\\n/g, '\n');
  const keyBytes = pemToBinary(normalizedKey);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes as any,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedJwt = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  const signedJwt = `${unsignedJwt}.${encodedSignature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJwt}`,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to obtain Google OAuth2 access token: ${res.status} ${errorText}`);
  }

  const tokenData = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = now + (tokenData.expires_in || 3600);

  return cachedAccessToken;
}

// ── SERVER-ONLY FALLBACK CREDENTIALS ─────────────────────────────
// NEVER move these into white-label.config.ts: that file is bundled into
// the PUBLIC browser JS. This file is only ever bundled by the Cloudflare
// Worker (apps/api). Env vars on the Worker (FCM_PROJECT_ID,
// FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) always take priority.
const DEFAULT_FCM_PROJECT_ID = 'geniuslibrary-8f90d';
const DEFAULT_FCM_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@geniuslibrary-8f90d.iam.gserviceaccount.com';
const DEFAULT_FCM_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6SpnotZblqd5s
hiAw2o3G3xezMqcXKrWral9MNSye/VT5cCZg8999pc9dhtpbO+o8Z1gZ/N3C9aHb
doCtRJI5qFltHyDoYm7TxKRJHTK8eItwydczBVZctAueBpxnNhwYOzxfmvd2TxwL
+XmPlYsya3ar6CCcZWLs1LYSsHJB75HTfwu1E4BHQMhgSkOL3QqhCkpOxV3HvOlO
xOp6fR7iQmmWyokuvcvrRzMQlXrq1yL2WkF764TrCOBGoUjpswGa+ntz6erl4/i0
ypoD05eRGYN00ebgupTanX2osSZg3IBKWCEKrEwm8Z+7XnKsaIXs7wNi+9S9G1qm
xtWS+IEzAgMBAAECggEAD+iD+SPcpXMam+DeSd24ArYVY4edTjSm++LjDXJzA4a1
pXFmzZu1x5iLuzxjVCwrJgpbMyjtVRM9xax6c5Fp/UN7k353hHC3bx0ZPGciaIbQ
vYp29pPrmpIDdfSxkXzE7GrOjomAvVknF3yv3UuTbfRQV4DEnCZqSrglbjYkI64o
zSpoLywD1eEi+q4bd/OHtnzzwM6qg0/5rzChgEbtPNtyJWZqOfZHi8h3MjyhEmZU
kyZcobF91s46DUX71kTTUL5IEZ4gO/2bOm2eHZ2IexswDr+w6MUgGzk2/wPCHW3k
4qDSwzxocYGWKfkUnfQrGCxstGOFC01+Q60FcnKkUQKBgQDjci9OkEGxw+rC46W1
smVWUVIpE/XgJvcTto/iCtosASsFw/X6yQYwyZz6QCCGnT71u5NnD1ZA+25wosnD
l6+wilzUTrJUHP8NRT8AUVEvRz4Scf0eMFC1VQ7aegTbdCshtK36La+vXMjud0iK
jri+Y5qZtaMrlFpR50dRIf9w0QKBgQDRrcLbjymh9txlyLWQS0ajOcFQJmmyvIoM
bsXHDQSnpGHWGKds0+N+83bO0ZvAxb4ZQ4Q9HKRKWWdNVTVPvnBi/jMsDlBdk/RB
oveknoNRXW1sHpXy6Vyi36IRb11bf2+CGlruHdHJ9vZ1gAsVmw4Hyh+namoLz9QD
r4stGMDywwKBgBG82vGekHEDnXBbfpXf9sU3jFfFxbwYbdZsu2XegMtDwA4wDSPk
v4XYg1SE4cR9yOYzHbjA2nIw6ZkBKQkG8F2tPLYV+RRUOpPXXaVxsgok3TNlDl9n
VzP9ES56q5xNv/td8t965qOfcdAfH1om7UNz0x+/qZ0BcdXHWql6JEixAoGAfcI1
C9C6zKyuFdIiq6+qZz29px/S52PTfI93yeIR96ZNE8bnrAsN+Fd326W2QBGZ6bcn
+itSklE69xPzDKgQ6h7CfFr9cpLJvhBLbY2w/z0E4wMZNn8mk32Dy+c6XCV7sNGz
1ftGl1arDWBFxaig6qUdBSF7ByiYZbmExQCCwVcCgYEAlA3LuAYzuwNvMq7eV1TL
sy9DZ9GYrr/X4zRys0EX8VCK83UafbqCFAYrPkpt6q7Dy7J4JMGtIUwQKyMUxqya
ZK95o1MENmYYUE0tgwK61lNrYD9xaOAZCRKk+2/FDyEvGGG5iD066y8jX9sZrZCO
L6We6/sZSEZ0JBAVx0gPZQw=
-----END PRIVATE KEY-----`;

/**
 * Sends a single FCM notification to a specific device registration token
 */
export async function sendFCMMessage(
  env: {
    FCM_PROJECT_ID?: string;
    FCM_CLIENT_EMAIL?: string;
    FCM_PRIVATE_KEY?: string;
  },
  deviceToken: string,
  payload: FCMNotificationPayload
): Promise<{ success: boolean; error?: string; invalidToken?: boolean }> {
  try {
    const projectId = env.FCM_PROJECT_ID || DEFAULT_FCM_PROJECT_ID;
    const clientEmail = env.FCM_CLIENT_EMAIL || DEFAULT_FCM_CLIENT_EMAIL;
    const privateKey = env.FCM_PRIVATE_KEY || DEFAULT_FCM_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      console.warn('[FCM] Credentials missing in environment (FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY).');
      return { success: false, error: 'Missing FCM credentials' };
    }

    if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.length < 10) {
      return { success: false, error: 'Invalid device token' };
    }

    const accessToken = await getGoogleOAuth2AccessToken(clientEmail, privateKey);
    const targetUrl = payload.url || '/';
    const tag = payload.tag || `genius-fcm-${Date.now()}`;

    const body = {
      message: {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          title: payload.title,
          body: payload.body,
          url: targetUrl,
          tag: tag,
          badge: String(payload.badge || 1),
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            tag: tag,
            requireInteraction: true,
            data: {
              url: targetUrl,
            },
          },
          fcm_options: {
            link: targetUrl,
          },
        },
      },
    };

    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({})) as any;
      const status = res.status;
      const errorCode = errJson?.error?.details?.[0]?.errorCode || errJson?.error?.status;
      
      const isInvalid =
        status === 404 ||
        errorCode === 'UNREGISTERED' ||
        errorCode === 'INVALID_ARGUMENT' ||
        errJson?.error?.message?.includes('registration token');

      console.warn(`[FCM] Send failed (${status}):`, errJson?.error?.message || status);
      return {
        success: false,
        error: errJson?.error?.message || `HTTP ${status}`,
        invalidToken: isInvalid,
      };
    }

    console.log(`[FCM] Notification dispatched successfully to ${deviceToken.slice(0, 12)}...`);
    return { success: true };
  } catch (err: any) {
    console.error('[FCM] Exception sending push message:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches an FCM notification to a batch of tokens in parallel
 */
export async function sendFCMToTokens(
  env: {
    FCM_PROJECT_ID?: string;
    FCM_CLIENT_EMAIL?: string;
    FCM_PRIVATE_KEY?: string;
  },
  tokens: string[],
  payload: FCMNotificationPayload
): Promise<{ total: number; sent: number; failed: number }> {
  const uniqueTokens = Array.from(new Set(tokens.filter(t => !!t && typeof t === 'string' && t.trim().length > 10)));
  if (uniqueTokens.length === 0) {
    return { total: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    uniqueTokens.map(async (token) => {
      const result = await sendFCMMessage(env, token, payload);
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    })
  );

  return { total: uniqueTokens.length, sent, failed };
}
