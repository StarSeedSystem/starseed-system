/**
 * Bloqueo biométrico (Ola 382 · BLQ2): registrar una passkey de PLATAFORMA (huella, rostro o el
 * PIN del sistema) para esta neurona. Solo se guarda la clave PÚBLICA (SPKI) y el id de la
 * credencial: la biometría nunca sale del dispositivo ni llega al OS.
 */
import { aB64url, aleatorios } from "./b64url";

export interface PasskeyGuardada { credencialId: string; clavePublica: string; alg: -7; creadaEn: number; v: 1 }

/** ¿Hay un autenticador de plataforma que verifique a la persona (Touch ID, Windows Hello, huella)? */
export async function biometriaDisponible(): Promise<boolean> {
    try {
        const PKC = (globalThis as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
        if (!PKC?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        return await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

export async function registrarPasskey(nombreNeurona: string): Promise<PasskeyGuardada> {
    const creds = globalThis.navigator?.credentials;
    if (!creds?.create) throw new Error("Este navegador no permite verificar la biometría.");
    const cred = (await creds.create({
        publicKey: {
            challenge: aleatorios(32) as BufferSource,
            rp: { name: "StarSeed OS", id: location.hostname },
            user: { id: aleatorios(16) as BufferSource, name: "neurona", displayName: nombreNeurona || "Esta neurona" },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
            timeout: 60_000,
            attestation: "none",
        },
    })) as (Credential & { rawId: ArrayBuffer; response: { getPublicKey?: () => ArrayBuffer | null } }) | null;
    if (!cred) throw new Error("No se registró ninguna huella ni rostro.");
    const spki = cred.response?.getPublicKey?.();
    if (!spki) throw new Error("Este navegador no permite verificar la biometría (no entrega la clave pública).");
    return { credencialId: aB64url(cred.rawId), clavePublica: aB64url(spki), alg: -7, creadaEn: Date.now(), v: 1 };
}
