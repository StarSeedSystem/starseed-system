/**
 * Bloqueo biométrico (Ola 382 · BLQ3): verificar DE VERDAD la firma de la passkey, sin servidor.
 * Un `navigator.credentials.get()` que «resuelve» no basta (se puede simular desde la consola):
 * se comprueba el reto, el origen, la entidad (rpId), que la persona fue VERIFICADA (bandera UV)
 * y la firma ECDSA P-256 con la clave pública guardada al registrar. Cualquier fallo → false.
 */
import { aB64url, aleatorios, desdeB64url } from "./b64url";
import type { PasskeyGuardada } from "./passkey-registro";

const sub = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as unknown as BufferSource;

/** Firma ECDSA en DER (SEQUENCE{INTEGER r, INTEGER s}) → r‖s crudo de 64 bytes (lo que pide WebCrypto). */
export function derACrudo(der: Uint8Array): Uint8Array {
    if (der[0] !== 0x30) throw new Error("firma DER no válida");
    let i = 2;
    if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
    const entero = (): Uint8Array => {
        if (der[i] !== 0x02) throw new Error("firma DER no válida");
        const largo = der[i + 1];
        let v = der.slice(i + 2, i + 2 + largo);
        i += 2 + largo;
        while (v.length > 32 && v[0] === 0) v = v.slice(1);
        if (v.length > 32) throw new Error("entero demasiado largo");
        const out = new Uint8Array(32);
        out.set(v, 32 - v.length);
        return out;
    };
    const r = entero(), s = entero();
    const crudo = new Uint8Array(64);
    crudo.set(r, 0); crudo.set(s, 32);
    return crudo;
}

export interface Asercion {
    guardada: PasskeyGuardada;
    reto: Uint8Array;
    origen: string;
    rpId?: string;
    clientDataJSON: Uint8Array;
    authenticatorData: Uint8Array;
    firma: Uint8Array;
}

export async function verificarAsercion(a: Asercion): Promise<boolean> {
    try {
        const cd = JSON.parse(new TextDecoder().decode(a.clientDataJSON)) as { type?: string; challenge?: string; origin?: string };
        if (cd.type !== "webauthn.get" || cd.challenge !== aB64url(a.reto) || cd.origin !== a.origen) return false;
        if (a.authenticatorData.length < 37) return false;
        const banderas = a.authenticatorData[32];
        if (!(banderas & 0x01) || !(banderas & 0x04)) return false; // UP (presencia) y UV (verificada)
        if (a.rpId) {
            const esperado = new Uint8Array(await sub().digest("SHA-256", buf(new TextEncoder().encode(a.rpId))));
            if (esperado.some((b, i) => b !== a.authenticatorData[i])) return false;
        }
        const clave = await sub().importKey("spki", buf(desdeB64url(a.guardada.clavePublica)), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        const hashCd = new Uint8Array(await sub().digest("SHA-256", buf(a.clientDataJSON)));
        const firmado = new Uint8Array(a.authenticatorData.length + hashCd.length);
        firmado.set(a.authenticatorData, 0); firmado.set(hashCd, a.authenticatorData.length);
        return await sub().verify({ name: "ECDSA", hash: "SHA-256" }, clave, buf(derACrudo(a.firma)), buf(firmado));
    } catch {
        return false;
    }
}

/** Pide la huella o el rostro y verifica la respuesta aquí mismo. */
export async function desbloquearConPasskey(guardada: PasskeyGuardada): Promise<boolean> {
    try {
        const reto = aleatorios(32);
        const cred = (await navigator.credentials.get({
            publicKey: {
                challenge: buf(reto),
                allowCredentials: [{ type: "public-key", id: buf(desdeB64url(guardada.credencialId)) }],
                userVerification: "required",
                timeout: 60_000,
                rpId: location.hostname,
            },
        })) as (Credential & { response: { clientDataJSON: ArrayBuffer; authenticatorData: ArrayBuffer; signature: ArrayBuffer } }) | null;
        if (!cred) return false;
        return await verificarAsercion({
            guardada, reto, origen: location.origin, rpId: location.hostname,
            clientDataJSON: new Uint8Array(cred.response.clientDataJSON),
            authenticatorData: new Uint8Array(cred.response.authenticatorData),
            firma: new Uint8Array(cred.response.signature),
        });
    } catch {
        return false;
    }
}
