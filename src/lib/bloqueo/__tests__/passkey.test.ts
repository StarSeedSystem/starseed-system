import { afterEach, describe, expect, it, vi } from "vitest";
import { aB64url } from "../b64url";
import { biometriaDisponible, registrarPasskey, type PasskeyGuardada } from "../passkey-registro";
import { derACrudo, verificarAsercion } from "../passkey-verificacion";

const sub = globalThis.crypto.subtle;
afterEach(() => vi.unstubAllGlobals());

/** Entero sin signo de 32 bytes → INTEGER DER (con 0x00 delante si el bit alto está puesto). */
function entero(b: Uint8Array): number[] {
    let v = [...b];
    while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.slice(1);
    if (v[0] & 0x80) v = [0, ...v];
    return [0x02, v.length, ...v];
}
const aDer = (crudo: Uint8Array) => { const r = entero(crudo.slice(0, 32)), s = entero(crudo.slice(32)); return new Uint8Array([0x30, r.length + s.length, ...r, ...s]); };

async function escenario(banderas = 0x05) {
    const par = await sub.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const guardada: PasskeyGuardada = { credencialId: "aWQ", clavePublica: aB64url(await sub.exportKey("spki", par.publicKey)), alg: -7, creadaEn: 1, v: 1 };
    const reto = crypto.getRandomValues(new Uint8Array(32));
    const rpHash = new Uint8Array(await sub.digest("SHA-256", new TextEncoder().encode("localhost")));
    const authenticatorData = new Uint8Array([...rpHash, banderas, 0, 0, 0, 1]);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge: aB64url(reto), origin: "http://localhost:9002" }));
    const firmado = new Uint8Array([...authenticatorData, ...new Uint8Array(await sub.digest("SHA-256", clientDataJSON))]);
    const firma = aDer(new Uint8Array(await sub.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, firmado)));
    return { guardada, reto, origen: "http://localhost:9002", rpId: "localhost", clientDataJSON, authenticatorData, firma };
}

describe("passkey: registro", () => {
    it("pide un autenticador de plataforma con verificación y ES256, y guarda solo la clave pública", async () => {
        const create = vi.fn(async () => ({ rawId: new Uint8Array([1, 2, 3]).buffer, response: { getPublicKey: () => new Uint8Array([9, 9]).buffer } }));
        vi.stubGlobal("navigator", { credentials: { create } });
        vi.stubGlobal("location", { hostname: "localhost" });
        const g = await registrarPasskey("Mac de Alex");
        const pk = (create.mock.calls[0] as any)[0].publicKey;
        expect(pk.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", userVerification: "required" });
        expect(pk.pubKeyCredParams).toEqual([{ type: "public-key", alg: -7 }]);
        expect(pk.rp.id).toBe("localhost");
        expect(g).toMatchObject({ credencialId: "AQID", clavePublica: "CQk", alg: -7, v: 1 });
    });
    it("sin getPublicKey lo dice claro; sin soporte, no hay biometría", async () => {
        vi.stubGlobal("navigator", { credentials: { create: async () => ({ rawId: new ArrayBuffer(1), response: {} }) } });
        vi.stubGlobal("location", { hostname: "localhost" });
        await expect(registrarPasskey("x")).rejects.toThrow(/no permite verificar la biometría/);
        vi.stubGlobal("PublicKeyCredential", undefined);
        expect(await biometriaDisponible()).toBe(false);
    });
});

describe("passkey: verificación real de la firma", () => {
    it("una aserción buena pasa", async () => {
        expect(await verificarAsercion(await escenario())).toBe(true);
    });
    it("reto, origen, rpId, UV o firma alterados → false", async () => {
        const e = await escenario();
        expect(await verificarAsercion({ ...e, reto: new Uint8Array(32) })).toBe(false);
        expect(await verificarAsercion({ ...e, origen: "https://otro.example" })).toBe(false);
        expect(await verificarAsercion({ ...e, rpId: "otro.example" })).toBe(false);
        const alterada = e.firma.slice(); alterada[alterada.length - 1] ^= 1;
        expect(await verificarAsercion({ ...e, firma: alterada })).toBe(false);
        expect(await verificarAsercion(await escenario(0x01))).toBe(false); // sin UV
    });
    it("derACrudo recorta el 0x00 inicial y rellena a 32 bytes", () => {
        const r = new Uint8Array(32).fill(0xff), s = new Uint8Array(32); s[31] = 7;
        const crudo = derACrudo(aDer(new Uint8Array([...r, ...s])));
        expect(crudo.length).toBe(64);
        expect(crudo[0]).toBe(0xff);
        expect(crudo[63]).toBe(7);
    });
});
