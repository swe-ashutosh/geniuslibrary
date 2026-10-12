/**
 * [WEB • LIB] WebAuthn Biometric Passkey Engine
 *
 * Provides biometric login (Touch ID, Face ID, Android Fingerprint, Windows Hello)
 * using the browser-native WebAuthn API and Supabase as the single source of truth.
 */

import { createClient } from "@/lib/supabase/client";
import { isMasterAdminEmail } from "@/lib/config";

const BIOMETRIC_VAULT_KEY = "genius_biometric_vault_v1";

export interface BiometricProfile {
  credentialId: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: "admin" | "student" | "staff";
  deviceName: string;
  registeredAt: number;
}

interface StoredVaultData extends BiometricProfile {
  refreshToken?: string;
  accessToken?: string;
}

export interface UserPasskeyRecord {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string;
  user_email: string | null;
  user_role: string | null;
  created_at: string;
  last_used_at: string | null;
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 · BINARY CONVERSION UTILITIES
// ══════════════════════════════════════════════════════════════

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 · DEVICE & CAPABILITY DETECTION
// ══════════════════════════════════════════════════════════════

/**
 * Checks whether WebAuthn API is supported in this browser.
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator?.credentials !== "undefined"
  );
}

/**
 * Checks if a platform authenticator (fingerprint sensor, Face ID, etc.) is available.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Detects user platform and returns a friendly biometric device name.
 */
export function getDeviceBiometricName(): string {
  if (typeof navigator === "undefined") return "Device Passkey";
  const ua = navigator.userAgent;

  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "Apple Face ID / Touch ID";
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return "Mac Touch ID";
  }
  if (/Android/i.test(ua)) {
    return "Android Fingerprint";
  }
  if (/Windows/i.test(ua)) {
    return "Windows Hello";
  }
  return "Biometric Passkey";
}

/**
 * Checks if biometric passkey is already registered on this device.
 */
export function hasRegisteredPasskey(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.credentialId && parsed?.userId);
  } catch {
    return false;
  }
}

/**
 * Returns saved biometric profile metadata for UI display.
 */
export function getBiometricProfile(): BiometricProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.credentialId) return null;
    return {
      credentialId: data.credentialId,
      userId: data.userId,
      userEmail: data.userEmail,
      userName: data.userName || data.userEmail,
      userRole: data.userRole || "student",
      deviceName: data.deviceName || "This Device",
      registeredAt: data.registeredAt || Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Updates stored session tokens in the local vault whenever user signs in or refreshes.
 */
export function updateBiometricSession(session: { access_token?: string; refresh_token?: string } | null): void {
  if (typeof window === "undefined" || !session?.refresh_token) return;
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!raw) return;
    const vault: StoredVaultData = JSON.parse(raw);
    vault.accessToken = session.access_token;
    vault.refreshToken = session.refresh_token;
    localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn("[WebAuthn] Failed to update biometric session token:", err);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 · REGISTRATION (ENABLE BIOMETRIC)
// ══════════════════════════════════════════════════════════════

/**
 * Registers a new biometric passkey for the current logged-in user.
 * Saves credential to Supabase user_passkeys table and local vault.
 */
export async function registerPasskey(customDeviceName?: string): Promise<{
  success: boolean;
  error?: string;
  credentialId?: string;
}> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: "WebAuthn biometric login is not supported in this browser." };
  }

  const supabase = createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return { success: false, error: "You must be signed in to enable biometric login." };
  }

  const user = session.user;
  const userEmail = (user.email || "").toLowerCase();
  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
  const isAdmin = isMasterAdminEmail(userEmail) || user.user_metadata?.role === "admin";
  const userRole: "admin" | "student" | "staff" = isAdmin
    ? "admin"
    : user.user_metadata?.role === "staff"
    ? "staff"
    : "student";

  const deviceName = customDeviceName || getDeviceBiometricName();

  try {
    // 1. Generate challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // 2. User ID as Uint8Array
    const userIdBytes = new TextEncoder().encode(user.id);

    // 3. Request credential creation
    const hostname = window.location.hostname;
    const rpId = hostname === "localhost" ? "localhost" : hostname;

    const creationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "Genius Library",
        id: rpId,
      },
      user: {
        id: userIdBytes,
        name: userEmail,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "preferred",
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: "none",
    };

    const credential = (await navigator.credentials.create({
      publicKey: creationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: "Biometric registration was cancelled." };
    }

    const credentialId = bufferToBase64Url(credential.rawId);
    const attestationResponse = credential.response as AuthenticatorAttestationResponse;
    const publicKeyBase64 = bufferToBase64Url(attestationResponse.attestationObject);

    // 4. Save to Supabase user_passkeys table
    const { error: dbError } = await supabase.from("user_passkeys").upsert(
      {
        user_id: user.id,
        credential_id: credentialId,
        public_key: publicKeyBase64,
        device_name: deviceName,
        user_email: userEmail,
        user_role: userRole,
        counter: 0,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "credential_id" }
    );

    if (dbError) {
      console.error("[WebAuthn] Supabase upsert passkey error:", dbError);
      return {
        success: false,
        error: `Could not save passkey: ${dbError.message}. Ensure user_passkeys table is created in Supabase.`,
      };
    }

    // 5. Save local biometric vault
    const vault: StoredVaultData = {
      credentialId,
      userId: user.id,
      userEmail,
      userName,
      userRole,
      deviceName,
      registeredAt: Date.now(),
      refreshToken: session.refresh_token,
      accessToken: session.access_token,
    };
    localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(vault));

    return { success: true, credentialId };
  } catch (err: any) {
    console.error("[WebAuthn] Registration error:", err);
    if (err.name === "NotAllowedError") {
      return { success: false, error: "Biometric setup prompt was declined or cancelled." };
    }
    return { success: false, error: err?.message || "Failed to set up biometric passkey." };
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 · AUTHENTICATION (SIGN IN WITH BIOMETRIC)
// ══════════════════════════════════════════════════════════════

/**
 * Authenticates user using fingerprint/Face ID assertion and restores Supabase session.
 */
export async function authenticateWithPasskey(): Promise<{
  success: boolean;
  user?: any;
  role?: "admin" | "student" | "staff";
  error?: string;
}> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: "Biometric login is not supported in this browser." };
  }

  const profile = getBiometricProfile();
  if (!profile || !profile.credentialId) {
    return { success: false, error: "No biometric passkey found on this device. Please sign in with email/password first." };
  }

  try {
    const rawVault = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    const vault: StoredVaultData | null = rawVault ? JSON.parse(rawVault) : null;

    // 1. Generate challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const hostname = window.location.hostname;
    const rpId = hostname === "localhost" ? "localhost" : hostname;

    // 2. Request assertion from device hardware
    const requestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId,
      allowCredentials: [
        {
          id: base64UrlToBuffer(profile.credentialId),
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "preferred",
      timeout: 60000,
    };

    const assertion = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: "Biometric verification cancelled." };
    }

    const supabase = createClient();

    // 3. Restore session
    let authenticatedUser: any = null;

    if (vault?.refreshToken) {
      try {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: vault.refreshToken,
        });

        if (!refreshError && refreshData?.session?.user) {
          authenticatedUser = refreshData.session.user;
          updateBiometricSession(refreshData.session);
        } else if (vault.accessToken) {
          const { data: setData, error: setError } = await supabase.auth.setSession({
            access_token: vault.accessToken,
            refresh_token: vault.refreshToken,
          });
          if (!setError && setData?.session?.user) {
            authenticatedUser = setData.session.user;
            updateBiometricSession(setData.session);
          }
        }
      } catch (tokenErr) {
        console.warn("[WebAuthn] Token restoration attempt notice:", tokenErr);
      }
    }

    // Fallback: Check existing session
    if (!authenticatedUser) {
      const { data: currentData } = await supabase.auth.getSession();
      if (currentData?.session?.user && currentData.session.user.id === profile.userId) {
        authenticatedUser = currentData.session.user;
        updateBiometricSession(currentData.session);
      }
    }

    if (!authenticatedUser) {
      return {
        success: false,
        error: "Biometric verified, but session has expired. Please sign in with email/password once to refresh your biometric login.",
      };
    }

    // 4. Update last_used_at in Supabase user_passkeys
    try {
      await supabase
        .from("user_passkeys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("credential_id", profile.credentialId);
    } catch {}

    // 5. Determine current user role
    const email = (authenticatedUser.email || profile.userEmail).toLowerCase();
    const isAdmin = isMasterAdminEmail(email) || authenticatedUser.user_metadata?.role === "admin";
    const role: "admin" | "student" | "staff" = isAdmin
      ? "admin"
      : authenticatedUser.user_metadata?.role === "staff"
      ? "staff"
      : "student";

    return {
      success: true,
      user: authenticatedUser,
      role,
    };
  } catch (err: any) {
    console.error("[WebAuthn] Authentication error:", err);
    if (err.name === "NotAllowedError") {
      return { success: false, error: "Biometric scan cancelled or not recognized. Try again." };
    }
    return { success: false, error: err?.message || "Biometric authentication failed." };
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 · PASSKEY MANAGEMENT (REMOVE / LIST)
// ══════════════════════════════════════════════════════════════

/**
 * Removes the biometric passkey from Supabase and local storage.
 */
export async function removePasskey(): Promise<{ success: boolean; error?: string }> {
  const profile = getBiometricProfile();
  const supabase = createClient();

  if (profile?.credentialId) {
    try {
      await supabase.from("user_passkeys").delete().eq("credential_id", profile.credentialId);
    } catch (e) {
      console.warn("[WebAuthn] Supabase delete passkey notice:", e);
    }
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem(BIOMETRIC_VAULT_KEY);
  }

  return { success: true };
}

/**
 * Fetches all registered passkeys for the current user from Supabase.
 */
export async function getStoredPasskeys(): Promise<UserPasskeyRecord[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_passkeys")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as UserPasskeyRecord[];
}
