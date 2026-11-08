import { describe, expect, it } from "vitest";
import { crearAlmacenMemoria } from "@/lib/identidad/almacen";
import {
    contieneSecretos,
    crearInstantanea,
    fusionarHuellas,
    huellasAprendidas,
    huellasComoVinculos,
    neuronaParaGuardar,
    sinSecretos,
    unirVinculos,
} from "../instantanea-cuenta";
import { aceptarHola } from "@/lib/malla/red-local-nativa";

const UID = "11111111-2222-4333-8444-555555555555";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
const HEX64 = "a".repeat(64);

describe("sinSecretos: la instantánea nunca guarda tokens ni claves", () => {
    it("quita por nombre y por forma, a cualquier profundidad", () => {
        const sucio = {
            id: "n1",
            name: "Mac",
            access_token: "x",
            refresh_token: "y",
            nested: { api_key: "k", ok: 1, clave_faro: HEX64, lista: [{ jwt: JWT }, { fine: "sí" }] },
            raro: JWT,
            hex: HEX64,
        };
        const limpio = sinSecretos(sucio);
        expect(limpio).toEqual({ id: "n1", name: "Mac", nested: { ok: 1, lista: [{}, { fine: "sí" }] } });
        expect(contieneSecretos(sucio)).toBe(true);
        expect(contieneSecretos(limpio)).toBe(false);
    });

    it("una fila de neuron_devices con una clave dentro de capabilities sale sin ella", () => {
        const n = neuronaParaGuardar({ id: "n2", name: "Tablet", kind: "tablet", capabilities: { cores: 8, privateKey: "zzz" }, extra: "no", last_seen_at: "2026-11-08T10:00:00Z" });
        expect(n).toEqual({ id: "n2", name: "Tablet", kind: "tablet", capabilities: { cores: 8 }, last_seen_at: "2026-11-08T10:00:00Z" });
        expect(neuronaParaGuardar({ name: "sin id" })).toBeNull();
    });
});

describe("instantánea: se escribe en línea y se hidrata en un arranque en frío sin red", () => {
    it("lo escrito sobrevive a «cerrar y reabrir» (otro objeto sobre el mismo almacén) y no contiene secretos", async () => {
        const almacen = crearAlmacenMemoria();
        const enLinea = crearInstantanea(almacen);
        await enLinea.escribir("neuronas", UID, [{ id: "mac", name: "Mac de Alex", capabilities: { cores: 10 }, token: "no" }], 1000);
        await enLinea.escribir("perfil", UID, { display_name: "Alex", handle: "alex", avatar_url: "https://x/y.png", refresh_token: JWT }, 1000);
        await enLinea.escribir("huellas", UID, { mac: { huella: "id:abc", en: 1 } }, 1000);

        // Arranque en frío: objeto nuevo, sin red, mismo disco.
        const frio = crearInstantanea(almacen);
        const neuronas = await frio.leer<Array<{ id: string }>>("neuronas", UID);
        expect(neuronas?.datos).toEqual([{ id: "mac", name: "Mac de Alex", capabilities: { cores: 10 } }]);
        const perfil = await frio.leer<Record<string, unknown>>("perfil", UID);
        expect(perfil?.datos).toEqual({ display_name: "Alex", handle: "alex", avatar_url: "https://x/y.png" });
        expect((await frio.leer("huellas", UID))?.datos).toEqual({ mac: { huella: "id:abc", en: 1 } });

        // Nada en disco parece un secreto.
        for (const k of await almacen.claves()) expect(contieneSecretos(await almacen.leer(k))).toBe(false);
    });

    it("otra cuenta no ve lo de esta, y olvidar() lo borra todo", async () => {
        const almacen = crearAlmacenMemoria();
        const i = crearInstantanea(almacen);
        await i.escribir("neuronas", UID, [{ id: "mac" }]);
        expect(await i.leer("neuronas", "99999999-2222-4333-8444-555555555555")).toBeNull();
        await i.olvidar();
        expect(await i.leer("neuronas", UID)).toBeNull();
        expect(await almacen.claves()).toEqual([]);
    });

    it("el avatar viaja como bytes (no se filtra) y vuelve igual", async () => {
        const i = crearInstantanea(crearAlmacenMemoria());
        const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
        await i.escribir("avatar", UID, { url: "https://x/a.png", tipo: "image/png", bytes });
        const r = await i.leer<{ bytes: ArrayBuffer; tipo: string }>("avatar", UID);
        expect(Array.from(new Uint8Array(r!.datos.bytes))).toEqual([1, 2, 3, 4]);
        expect(r!.datos.tipo).toBe("image/png");
    });
});

describe("reconocer una neurona de la cuenta sin servidor", () => {
    const hola = (de: string, para: string) => ({ t: "nl.hola", de: { neurona: de, nombre: "Mac" }, para, ts: 1 }) as unknown as Parameters<typeof aceptarHola>[0];

    it("solo se aprenden las huellas probadas por cuenta (HMAC/certificado), de neuronas conocidas", () => {
        const h = huellasAprendidas(
            [
                { neurona: "mac", huella: "id:aaa", porCuenta: true, at: 5 },
                { neurona: "ajena", huella: "id:bbb", porCuenta: true, at: 5 },
                { neurona: "vinculada", huella: "id:ccc", porCuenta: false, at: 5 },
                { neurona: "mala", huella: "sin-prefijo", porCuenta: true, at: 5 },
            ],
            { conocidas: ["mac", "vinculada"] },
        );
        expect(h).toEqual({ mac: { huella: "id:aaa", en: 5 } });
    });

    it("con la huella cacheada, el saludo firmado de la Mac se acepta sin vínculo ni servidor; con otra huella, no", () => {
        const cacheados = huellasComoVinculos({ mac: { huella: "id:aaa", en: 1 } }, UID, { mac: "Mac de Alex" });
        const reales: Array<{ neurona: string; nombre: string; huella?: string }> = [];
        const vinculos = unirVinculos(reales as Array<{ neurona: string; nombre: string; huella: string }>, cacheados);
        const ok = aceptarHola(hola("mac", "tablet"), "id:aaa", "tablet", vinculos);
        expect(ok.ok).toBe(true);
        const falso = aceptarHola(hola("mac", "tablet"), "id:zzz", "tablet", vinculos);
        expect(falso.ok).toBe(false);
        const otraNeurona = aceptarHola(hola("intrusa", "tablet"), "id:aaa", "tablet", vinculos);
        expect(otraNeurona.ok).toBe(false);
    });

    it("un vínculo real manda sobre el cacheado de la misma neurona", () => {
        const real = { neurona: "mac", nombre: "real", huella: "id:nueva" };
        const u = unirVinculos([real], huellasComoVinculos({ mac: { huella: "id:vieja", en: 1 } }, UID));
        expect(u).toHaveLength(1);
        expect(u[0].huella).toBe("id:nueva");
    });

    it("fusionarHuellas: gana la más reciente por neurona y se acota", () => {
        const f = fusionarHuellas({ a: { huella: "id:1", en: 1 }, b: { huella: "id:2", en: 2 } }, { a: { huella: "id:3", en: 5 } }, 2);
        expect(f.a.huella).toBe("id:3");
        expect(Object.keys(f)).toHaveLength(2);
    });
});
