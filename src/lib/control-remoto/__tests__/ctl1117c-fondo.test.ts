/**
 * CTL1117C · FALLO 1 (con la app detrás) y FALLO 3 (la parada del aparato dice su motivo real).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { b64url } from "@/lib/chats-genesis/firma-aparato";
import { AUD_CONTROL, huellaDeSpki, type CargaOrden } from "../orden";
import { PuertaControl, aceptarPendiente, permisoDeFabrica, type PermisoControl } from "../sesion";
import { LINEA_CADA_MS, PERIODO_VIGIA_MS, VigiaFondo, esperarCon } from "../vigia-fondo";
import { latidoDeCuadros } from "../pantalla-origen";
import { claveParadaNativa, palabrasMotivo } from "../palabras";
import { partirErrorNativo } from "../nativo";

/** Un reloj a mano: `cada` guarda la función y `avanzar` la llama a su ritmo (y mueve la hora). */
function relojManual(derivaPorVuelta = 0) {
    let t = 1_000_000;
    const subs = new Map<number, { fn: () => void; ms: number; prox: number }>();
    let n = 0;
    return {
        ahora: () => t,
        cada(fn: () => void, ms: number) {
            const id = ++n;
            subs.set(id, { fn, ms, prox: t + ms });
            return () => void subs.delete(id);
        },
        estado: () => ({ conWorker: true, paginaLenta: false, huecoPaginaMaxMs: 0, huecoWorkerMaxMs: 0 }),
        avanzar(ms: number) {
            const fin = t + ms;
            for (;;) {
                const sig = [...subs.values()].reduce<number>((m, s) => Math.min(m, s.prox), Infinity);
                if (sig > fin) break;
                t = sig + derivaPorVuelta;
                for (const s of [...subs.values()]) if (s.prox <= sig) { s.prox = sig + s.ms; s.fn(); }
            }
            t = Math.max(t, fin);
        },
        activos: () => subs.size,
    };
}

describe("FALLO 1 · el vigía de segundo plano", () => {
    it("no escribe nada con la página a la vista y avisa al pasar a segundo plano, cada 10 s mientras dura y al volver", () => {
        const r = relojManual();
        const lineas: string[] = [];
        let vis = "visible";
        let prod = 0, env = 0, lat = 0, ord = 0;
        const v = new VigiaFondo({ reloj: r as never, nota: (d) => void lineas.push(d), visibilidad: () => vis, ahora: r.ahora });
        v.arrancar({ producidos: () => prod, enviados: () => env, latidos: () => lat, ordenes: () => ord });
        r.avanzar(5_000);
        expect(lineas).toEqual([]);
        vis = "hidden";
        prod += 3; env += 3; ord += 2;
        r.avanzar(PERIODO_VIGIA_MS);
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toMatch(/^inicio-fondo estado=oculta deriva-ms=0 reloj=worker periodo-ms=\d+ producidos=3 enviados=3 latidos=0 ordenes=2$/);
        // «Cada ~10 s» mientras dura: con 25 s más, dos líneas, con lo que pasó EN ese periodo.
        prod += 20; env += 18; lat += 5; ord += 7;
        r.avanzar(25_000);
        const seguidas = lineas.filter((l) => l.startsWith("sigue-en-fondo"));
        expect(seguidas).toHaveLength(2);
        expect(seguidas[0]).toContain("producidos=20 enviados=18 latidos=5 ordenes=7");
        expect(seguidas[1]).toContain("producidos=0 enviados=0 latidos=0 ordenes=0");
        vis = "visible";
        r.avanzar(PERIODO_VIGIA_MS);
        expect(lineas.at(-1)).toMatch(/^vuelta-al-frente estado=visible /);
        // Con ~10 s entre líneas, no más.
        expect(LINEA_CADA_MS).toBe(10_000);
        v.parar();
        expect(r.activos()).toBe(0);
    });

    it("mide la deriva del reloj de 1 s (lo que tardó de más la vuelta) y empieza ya oculta si lo estaba", () => {
        const r = relojManual(840);
        const lineas: string[] = [];
        const v = new VigiaFondo({ reloj: r as never, nota: (d) => void lineas.push(d), visibilidad: () => "hidden", ahora: r.ahora });
        v.arrancar({ producidos: () => 0, enviados: () => 0, latidos: () => 0, ordenes: () => 0 });
        expect(lineas[0]).toMatch(/^inicio-fondo estado=oculta /);
        r.avanzar(12_000);
        const l = lineas.find((x) => x.startsWith("sigue-en-fondo"))!;
        expect(l).toBeDefined();
        expect(Number(/deriva-ms=(\d+)/.exec(l)![1])).toBeGreaterThanOrEqual(800);
    });

    it("un diagnóstico que falla nunca rompe la pantalla, y parar suelta el reloj (nada corre sin sesión)", () => {
        const r = relojManual();
        const v = new VigiaFondo({ reloj: r as never, nota: () => { throw new Error("x"); }, visibilidad: () => "hidden", ahora: r.ahora });
        expect(() => v.arrancar({ producidos: () => { throw new Error("y"); }, enviados: () => 0, latidos: () => 0, ordenes: () => 0 })).not.toThrow();
        expect(() => r.avanzar(11_000)).not.toThrow();
        expect(v.activo).toBe(true);
        v.parar();
        v.parar();
        expect(v.activo).toBe(false);
        expect(r.activos()).toBe(0);
    });

    it("esperarCon corre con el reloj dado (no con setTimeout), resuelve una sola vez y se desuscribe", async () => {
        const r = relojManual();
        let listo = false;
        const p = esperarCon(r, 200).then(() => void (listo = true));
        expect(r.activos()).toBe(1);
        r.avanzar(199);
        await Promise.resolve();
        expect(listo).toBe(false);
        r.avanzar(2);
        await p;
        expect(listo).toBe(true);
        expect(r.activos()).toBe(0);
    });

    it("el latido de cuadros usa el reloj estable cuando se lo dan y sigue repitiendo con la pantalla quieta", () => {
        const r = relojManual();
        let pedidos = 0;
        const l = latidoDeCuadros(() => void (pedidos += 1), r.ahora, 1500, (f, ms) => r.cada(f, ms));
        r.avanzar(6_000);
        expect(pedidos).toBeGreaterThanOrEqual(3); // al menos uno cada 2 s con la pantalla quieta
        l.tocado();
        const antes = pedidos;
        r.avanzar(400);
        expect(pedidos).toBe(antes);
        l.parar();
        expect(r.activos()).toBe(0);
    });
});

describe("FALLO 3 · la parada del aparato dice su motivo real", () => {
    it("el rechazo de Rust «parada-nativa motivo=… hace=…» llega partido (código + detalle)", () => {
        expect(partirErrorNativo("parada-nativa motivo=caducada hace=3")).toEqual({ motivo: "parada-nativa", detalle: { motivo: "caducada", hace: "3" } });
        expect(partirErrorNativo("parada-nativa motivo=otro-token")).toEqual({ motivo: "parada-nativa", detalle: { motivo: "otro-token" } });
        expect(partirErrorNativo("parada-nativa")).toEqual({ motivo: "parada-nativa" });
    });

    it("solo «Terminar» dice que la persona terminó; cada otra causa tiene su frase", () => {
        const dice = (motivo: string) => palabrasMotivo(claveParadaNativa("parada-nativa", { detalle: { motivo } }))!;
        for (const m of ["la-persona-desde-el-indicador", "la-persona-desde-la-notificacion", "la-persona-desde-la-superposicion"]) {
            expect(dice(m)).toContain("«Terminar»");
        }
        const otras = ["caducada", "sin-indicador", "notificacion-descartada", "no-se-pudo-mostrar", "indicador-perdido", "sin-sesion", "otro-token", "pagina"];
        const frases = new Set<string>();
        for (const m of otras) {
            const f = dice(m);
            expect(f, m).not.toContain("«Terminar»");
            expect(f.toLowerCase(), m).not.toContain("la persona terminó");
            frases.add(f);
        }
        // Las conocidas tienen frase propia; las desconocidas dicen su motivo, sin inventar otro.
        expect(dice("caducada")).toMatch(/caduc/);
        expect(dice("sin-indicador")).toMatch(/aviso/);
        expect(dice("algo-raro")).toContain("algo-raro");
        expect(frases.size).toBeGreaterThanOrEqual(7);
        // Sin motivo (aparato anterior) ya no afirma que fue «Terminar».
        expect(palabrasMotivo("parada-nativa")).not.toContain("«Terminar»");
        expect(claveParadaNativa("parada-nativa")).toBe("parada-nativa");
        expect(claveParadaNativa("parada-nativa", { detalle: { motivo: "<x>" } })).toBe("parada-nativa");
        expect(claveParadaNativa("sin-sesion", { detalle: { motivo: "caducada" } })).toBe("sin-sesion");
    });
});

describe("FALLO 3 · la puerta del aparato lleva el motivo real en el rechazo", () => {
    const subtle = webcrypto.subtle as unknown as SubtleCrypto;
    const CUENTA = "cuenta-alex";
    const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
    let reloj = Date.parse("2026-11-17T10:00:00Z");
    let n = 0;
    let seq = 0;
    let permiso: PermisoControl;
    let puerta: PuertaControl;
    let mac: { privada: CryptoKey; spki: string; huella: string };
    let rechazoNativo: { ok: boolean; motivo?: string; detalle?: Record<string, string> } = { ok: true };
    const anotadas: string[] = [];

    async function firmar(accion: string, args: Record<string, unknown> = {}, o: Partial<CargaOrden> = {}) {
        const carga: CargaOrden = {
            aud: AUD_CONTROL, v: 1, de: mac.huella, cuenta: CUENTA, para: TABLETA, nivel: "controlar", sesion: null, seq: ++seq,
            nonce: `nonce-ctl-${String(++n).padStart(6, "0")}`, t: new Date(reloj).toISOString(), caduca: new Date(reloj + 60_000).toISOString(), accion: { nombre: accion, args }, ...o,
        };
        const bytes = new TextEncoder().encode(JSON.stringify(carga));
        const firma = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, mac.privada, bytes));
        return { v: 1 as const, carga: b64url(bytes), firma: b64url(firma) };
    }

    beforeEach(async () => {
        reloj = Date.parse("2026-11-17T10:00:00Z");
        seq = 0;
        anotadas.length = 0;
        rechazoNativo = { ok: true };
        permiso = permisoDeFabrica();
        const par = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])) as CryptoKeyPair;
        const spki = b64url(new Uint8Array(await subtle.exportKey("spki", par.publicKey)));
        mac = { privada: par.privateKey, spki, huella: (await huellaDeSpki(subtle, spki))! };
        let h = 0;
        puerta = new PuertaControl({
            subtle, ahora: () => reloj, cuentaPropia: () => CUENTA, neuronaPropia: () => TABLETA, leerPermiso: () => permiso, guardarPermiso: (p) => void (permiso = p),
            ejecutar: async () => ({ hecho: true }), anotar: (l) => void anotadas.push(l), azarHex: () => (++h).toString(16).padStart(32, "0"),
            nativo: { disponible: () => true, abrir: async () => ({ ok: true, token: "a".repeat(32) }), orden: async () => rechazoNativo, anotar: () => undefined, parar: async () => undefined } as never,
        });
        await puerta.recibir(await firmar("presentarse", { spki: mac.spki, nombre: "Mac", neurona: "aaaa0000-0000-4000-8000-000000000001" }));
        permiso = { ...aceptarPendiente(permiso, mac.huella), encendido: true, nivel: "controlar" };
    });

    it("una orden tras una parada de lo nativo vuelve «parada-nativa» con el motivo real, también en el registro", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        const sesion = (a.resultado as { sesion: string }).sesion;
        rechazoNativo = { ok: false, motivo: "parada-nativa", detalle: { motivo: "caducada", hace: "2" } };
        const r = await puerta.recibir(await firmar("leer-aparato", {}, { sesion }));
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("parada-nativa");
        expect(r.resultado).toEqual({ detalle: { motivo: "caducada", hace: "2" } });
        expect(claveParadaNativa(r.motivo, r.resultado)).toBe("parada-nativa-caducada");
        expect(anotadas.some((l) => l.includes("rechazo:parada-nativa motivo=caducada hace=2"))).toBe(true);
    });

    it("«sin-indicador-nativo» sigue siendo ese código (no se disfraza de parada)", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        const sesion = (a.resultado as { sesion: string }).sesion;
        rechazoNativo = { ok: false, motivo: "sin-indicador-nativo" };
        const r = await puerta.recibir(await firmar("leer-aparato", {}, { sesion }));
        expect(r.motivo).toBe("sin-indicador-nativo");
    });

    it("cuenta las órdenes cumplidas (para la línea de segundo plano) sin contar abrir ni cerrar", async () => {
        const a = await puerta.recibir(await firmar("abrir-sesion"));
        const sesion = (a.resultado as { sesion: string }).sesion;
        const antes = puerta.ordenesServidas(); // «presentarse» ya cuenta: es una orden cumplida
        await puerta.recibir(await firmar("leer-aparato", {}, { sesion }));
        await puerta.recibir(await firmar("leer-estado", {}, { sesion }));
        expect(puerta.ordenesServidas()).toBe(antes + 2);
        await puerta.recibir(await firmar("abrir-sesion"));
        expect(puerta.ordenesServidas()).toBe(antes + 2);
    });
});
