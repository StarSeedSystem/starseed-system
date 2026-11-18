/** CTL1118B · «presentarse» dice a quien pide si en el aparato el control está apagado (para que lo enseñe); nunca enciende nada. */
import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, permisoDeFabrica, type PermisoControl } from "../sesion";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const CUENTA = "cuenta-alex";
const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const reloj = Date.parse("2026-11-18T08:25:16Z");

async function presentarse(encendido: boolean) {
    let permiso: PermisoControl = { ...permisoDeFabrica(), encendido };
    let n = 0;
    const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
    const huella = (await huellaDeSpki(subtle, spki))!;
    const puerta = new PuertaControl({
        subtle,
        ahora: () => reloj,
        cuentaPropia: () => CUENTA,
        neuronaPropia: () => TABLETA,
        leerPermiso: () => permiso,
        guardarPermiso: (p) => {
            permiso = p;
        },
        ejecutar: async () => ({}),
        anotar: () => undefined,
        azarHex: () => (++n).toString(16).padStart(32, "0"),
        nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: "t" }), orden: async () => ({ ok: true }), anotar: () => undefined, parar: async () => undefined } as never,
    });
    const carga: CargaOrden = {
        aud: AUD_CONTROL, v: 1, de: huella, cuenta: CUENTA, para: TABLETA, nivel: "ver", sesion: null, seq: 1,
        nonce: "nonce-de-prueba-000001", t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(),
        accion: { nombre: "presentarse", args: { spki, nombre: "Mac", neurona: "aaaa0000-0000-4000-8000-000000000001" } },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(carga));
    const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, par.privateKey, bytes));
    const r = await puerta.recibir({ v: 1, carga: b64url(bytes), firma: b64url(firma) });
    return { r, permiso: () => permiso };
}

describe("CTL1118B · presentarse con el control apagado", () => {
    it("apagado: queda pendiente, lo dice (`apagado: true`) y el control sigue apagado", async () => {
        const { r, permiso } = await presentarse(false);
        expect(r).toMatchObject({ ok: true, motivo: "pendiente", resultado: { apagado: true } });
        expect(permiso().encendido).toBe(false);
        expect(permiso().pendientes).toHaveLength(1);
    });

    it("encendido: queda pendiente y no dice nada de apagado", async () => {
        const { r } = await presentarse(true);
        expect(r.motivo).toBe("pendiente");
        expect((r.resultado as { apagado?: unknown } | undefined)?.apagado).toBeUndefined();
    });
});
