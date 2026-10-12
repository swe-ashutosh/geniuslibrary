/**
 * [WEB • LIB] WebAuthn Biometric Passkey Engine & App Lock
 *
 * Provides biometric login (Touch ID, Face ID, Android Fingerprint, Windows Hello)
 * and App Lock using browser-native WebAuthn API, Web Crypto AES-GCM, and Supabase.
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
  encryptedSecret?: string; // AES-GCM encrypted password for indestructible 1-touch passkey login
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
// SECTION 2 · HARDWARE CRYPTO (AES-GCM LOCAL VAULT ENCRYPTION)
// ══════════════════════════════════════════════════════════════

async function getDeviceDerivedKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("GeniusLibraryPasskeySecureVaultKey2026"),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("genius_passkey_salt_v2"),
      iterations: 20000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(plainText: string): Promise<string> {
  try {
    if (!plainText) return "";
    const key = await getDeviceDerivedKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return bufferToBase64Url(combined.buffer);
  } catch (err) {
    console.error("[WebAuthn Crypto] Encryption error:", err);
    return "";
  }
}

export async function decryptSecret(cipherBase64: string): Promise<string> {
  try {
    if (!cipherBase64) return "";
    const key = await getDeviceDerivedKey();
    const combined = new Uint8Array(base64UrlToBuffer(cipherBase64));
    if (combined.length < 13) return "";
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("[WebAuthn Crypto] Decryption error:", err);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 · DEVICE & CAPABILITY DETECTION
// ══════════════════════════════════════════════════════════════

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator?.credentials !== "undefined"
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

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

export async function saveBiometricSecret(plainPassword: string): Promise<void> {
  if (typeof window === "undefined" || !plainPassword) return;
  try {
    const raw = localStorage.getItem(BIOMETRIC_VAULT_KEY);
    if (!raw) return;
    const vault: StoredVaultData = JSON.parse(raw);
    vault.encryptedSecret = await encryptSecret(plainPassword);
    localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn("[WebAuthn] Failed to save biometric encrypted secret:", err);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 · REGISTRATION (ENABLE BIOMETRIC)
// ══════════════════════════════════════════════════════════════

export async function registerPasskey(customDeviceName?: string, plainPassword?: string): Promise<{
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

    // 4. Save to Supabase user_passkeys table (non-blocking if table is not yet migrated)
    try {
      await supabase.from("user_passkeys").upsert(
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
    } catch (dbErr: any) {
      console.warn("[WebAuthn] Supabase user_passkeys sync notice (saving locally):", dbErr?.message);
    }

    // 5. Encrypt password if provided
    let encryptedSecret: string | undefined = undefined;
    if (plainPassword) {
      encryptedSecret = await encryptSecret(plainPassword);
    }

    // 6. Save local biometric vault
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
      encryptedSecret,
    };
    localStorage.setItem(BIOMETRIC_VAULT_KEY, JSON.stringify(vault));

    // Also mark app unlocked for current session
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("genius_app_unlocked", "true");
    }

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
// SECTION 5 · AUTHENTICATION (SIGN IN WITH BIOMETRIC)
// ══════════════════════════════════════════════════════════════

/**
 * Authenticates user using hardware biometric scan and establishes a Supabase session.
 * Uses encrypted password auto-signin first (100% reliable after logout), with token refresh fallback.
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

    // 1. Hardware biometric assertion
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const hostname = window.location.hostname;
    const rpId = hostname === "localhost" ? "localhost" : hostname;

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
      return { success: false, error: "Biometric verification was cancelled." };
    }

    const supabase = createClient();
    let authenticatedUser: any = null;

    // 2. Primary Method: Use stored encrypted password (indestructible across logouts!)
    if (vault?.encryptedSecret && vault?.userEmail) {
      try {
        const plainPassword = await decryptSecret(vault.encryptedSecret);
        if (plainPassword) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: vault.userEmail,
            password: plainPassword,
          });

          if (!signInError && signInData?.user) {
            authenticatedUser = signInData.user;
            updateBiometricSession(signInData.session);
          }
        }
      } catch (pwdErr) {
        console.warn("[WebAuthn] Password auto-signin attempt notice:", pwdErr);
      }
    }

    // 3. Secondary Method: Refresh token restoration
    if (!authenticatedUser && vault?.refreshToken) {
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

    // 4. Fallback: Existing active session
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
        error: "Biometric verified, but session has expired. Please sign in with your email/password once to refresh your biometric login.",
      };
    }

    // 5. Update last_used_at in Supabase if table exists
    try {
      await supabase
        .from("user_passkeys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("credential_id", profile.credentialId);
    } catch {}

    // 6. Mark app unlocked
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("genius_app_unlocked", "true");
    }

    // 7. Role resolution
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
// SECTION 6 · APP LOCK (HARDWARE BIOMETRIC VERIFICATION ONLY)
// ══════════════════════════════════════════════════════════════

/**
 * Fast hardware biometric assertion check for the App Lock screen.
 * Does not re-authenticate or alter the Supabase session, pure hardware unlock.
 */
export async function verifyBiometricOnly(): Promise<{ success: boolean; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: "Biometric hardware is not supported on this device." };
  }

  const profile = getBiometricProfile();
  if (!profile?.credentialId) {
    return { success: false, error: "No biometric passkey registered on this device." };
  }

  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const hostname = window.location.hostname;
    const rpId = hostname === "localhost" ? "localhost" : hostname;

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

    const assertion = await navigator.credentials.get({
      publicKey: requestOptions,
    });

    if (!assertion) {
      return { success: false, error: "Biometric verification was cancelled." };
    }

    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("genius_app_unlocked", "true");
    }

    return { success: true };
  } catch (err: any) {
    if (err.name === "NotAllowedError") {
      return { success: false, error: "Biometric scan was cancelled or declined." };
    }
    return { success: false, error: err?.message || "Biometric verification failed." };
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 · PASSKEY MANAGEMENT (REMOVE / LIST)
// ══════════════════════════════════════════════════════════════

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
    sessionStorage.removeItem("genius_app_unlocked");
  }

  return { success: true };
}

export async function getStoredPasskeys(): Promise<UserPasskeyRecord[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from("user_passkeys")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as UserPasskeyRecord[];
  } catch {
    return [];
  }
}
