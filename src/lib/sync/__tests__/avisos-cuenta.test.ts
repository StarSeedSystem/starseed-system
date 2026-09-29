// @vitest-environment jsdom
/**
 * avisos-cuenta (2026-09-29, persistencia entre medios): el «visto / hecho / luego» de las
 * ventanas que se abren solas, guardado UNA vez y con la cuenta.
 *
 * Lo que se demuestra:
 *  · la fusión entre medios converge (conmutativa, asociativa, idempotente);
 *  · un «luego» no resucita lo ya resuelto en otro medio, y `olvidarAviso` sí (a propósito);
 *  · las instantáneas son ESTABLES (misma referencia mientras el registro no cambia):
 *    es lo que evita el bucle de React #185 con `useSyncExternalStore`;
 *  · la clave viaja con la cuenta (SYNCED_KEYS) y la fusión de settings-sync la conoce.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    AVISOS_KEY,
    AVISOS_VACIOS,
    LUEGO_POR_DEFECTO_MS,
    SIN_REGISTRO,
    _reiniciarCacheAvisosParaPruebas,
    avisoPendiente,
    avisoPospuesto,
    avisoResuelto,
    avisosIguales,
    estadoAviso,
    fusionarAvisos,
    fusionarAvisosCrudo,
    leerAvisos,
    marcarAviso,
    normalizarAvisos,
    olvidarAviso,
    type AvisosVistos,
} from "../avisos-cuenta";
import { SYNCED_KEYS, esClaveFusionable, fusionarConLocal } from "@/lib/settings-sync";

const T0 = 1_800_000_000_000;

function avisos(ids: AvisosVistos["ids"], porNeurona: AvisosVistos["porNeurona"] = {}): AvisosVistos {
    return { v: 1, ids, porNeurona };
}

beforeEach(() => {
    localStorage.clear();
    _reiniciarCacheAvisosParaPruebas();
});

describe("normalización", () => {
    it("sanea cualquier basura a un almacén válido", () => {
        for (const basura of [null, undefined, 5, "x", [], { ids: 3 }, { v: 1, ids: { a: { estado: "raro", ts: 1 } } }]) {
            const n = normalizarAvisos(basura);
            expect(n.v).toBe(1);
            expect(n.ids).toEqual({});
            expect(n.porNeurona).toEqual({});
        }
    });

    it("descarta registros sin ts válido y fija hasta=0 en los «luego» sin plazo", () => {
        const n = normalizarAvisos({
            ids: { a: { estado: "visto", ts: -1 }, b: { estado: "luego", ts: 5 }, c: { estado: "hecho", ts: 9, hasta: 77 } },
        });
        expect(Object.keys(n.ids)).toEqual(["b", "c"]);
        expect(n.ids.b).toEqual({ estado: "luego", ts: 5, hasta: 0 });
        expect(n.ids.c).toEqual({ estado: "hecho", ts: 9 }); // «hasta» solo tiene sentido en «luego»
    });

    it("ignora __proto__ (no contamina el prototipo)", () => {
        const n = normalizarAvisos(JSON.parse('{"ids":{"__proto__":{"estado":"visto","ts":1}},"porNeurona":{"__proto__":{"a":{"estado":"visto","ts":1}}}}'));
        expect(Object.keys(n.ids)).toEqual([]);
        expect(Object.keys(n.porNeurona)).toEqual([]);
        expect(({} as Record<string, unknown>).estado).toBeUndefined();
    });
});

describe("fusión entre medios", () => {
    const a = avisos({ x: { estado: "visto", ts: 10 }, y: { estado: "luego", ts: 30, hasta: 500 } }, { n1: { p: { estado: "hecho", ts: 5 } } });
    const b = avisos({ x: { estado: "hecho", ts: 20 }, z: { estado: "visto", ts: 1 } }, { n1: { q: { estado: "luego", ts: 6, hasta: 9 } }, n2: { p: { estado: "visto", ts: 2 } } });
    const c = avisos({ y: { estado: "hecho", ts: 31 }, w: { estado: "luego", ts: 3, hasta: 0 } });

    it("gana el registro más nuevo de cada aviso y se unen los que no chocan", () => {
        const m = fusionarAvisos(a, b);
        expect(m.ids.x).toEqual({ estado: "hecho", ts: 20 });
        expect(m.ids.y).toEqual({ estado: "luego", ts: 30, hasta: 500 });
        expect(m.ids.z).toEqual({ estado: "visto", ts: 1 });
        expect(m.porNeurona.n1).toEqual({ p: { estado: "hecho", ts: 5 }, q: { estado: "luego", ts: 6, hasta: 9 } });
        expect(m.porNeurona.n2).toEqual({ p: { estado: "visto", ts: 2 } });
    });

    it("es conmutativa, asociativa e idempotente", () => {
        expect(fusionarAvisos(a, b)).toEqual(fusionarAvisos(b, a));
        expect(fusionarAvisos(fusionarAvisos(a, b), c)).toEqual(fusionarAvisos(a, fusionarAvisos(b, c)));
        expect(fusionarAvisos(fusionarAvisos(a, c), b)).toEqual(fusionarAvisos(fusionarAvisos(b, c), a));
        expect(fusionarAvisos(a, a)).toEqual(normalizarAvisos(a));
    });

    it("con el mismo ts: hecho gana a visto y a luego; entre «luego» gana el plazo mayor", () => {
        const h = avisos({ k: { estado: "hecho", ts: 7 } });
        const v = avisos({ k: { estado: "visto", ts: 7 } });
        const l = avisos({ k: { estado: "luego", ts: 7, hasta: 1 } });
        const l2 = avisos({ k: { estado: "luego", ts: 7, hasta: 9 } });
        expect(fusionarAvisos(h, v).ids.k.estado).toBe("hecho");
        expect(fusionarAvisos(v, l).ids.k.estado).toBe("visto");
        expect(fusionarAvisos(l, l2).ids.k).toEqual({ estado: "luego", ts: 7, hasta: 9 });
        expect(fusionarAvisos(l2, l)).toEqual(fusionarAvisos(l, l2));
    });

    it("un reinicio posterior (luego hasta=0, ts mayor) gana a un «hecho» viejo en todos los medios", () => {
        const viejo = avisos({ k: { estado: "hecho", ts: 100 } });
        const reinicio = avisos({ k: { estado: "luego", ts: 200, hasta: 0 } });
        expect(fusionarAvisos(viejo, reinicio).ids.k).toEqual({ estado: "luego", ts: 200, hasta: 0 });
        expect(fusionarAvisos(reinicio, viejo).ids.k).toEqual({ estado: "luego", ts: 200, hasta: 0 });
    });

    it("mantiene el tope de tamaño sacrificando primero lo pospuesto y más viejo", () => {
        const ids: AvisosVistos["ids"] = {};
        for (let i = 0; i < 450; i++) ids[`a${i}`] = { estado: i < 100 ? "hecho" : "luego", ts: i, hasta: 0 } as never;
        const m = fusionarAvisos(avisos(ids), AVISOS_VACIOS);
        expect(Object.keys(m.ids).length).toBe(400);
        for (let i = 0; i < 100; i++) expect(m.ids[`a${i}`]?.estado).toBe("hecho"); // los «hecho» sobreviven
    });

    it("avisosIguales no depende del orden de las claves (jsonb reordena)", () => {
        const x = { v: 1, ids: { b: { estado: "visto", ts: 2 }, a: { ts: 1, estado: "hecho" } }, porNeurona: {} };
        const y = { porNeurona: {}, ids: { a: { estado: "hecho", ts: 1 }, b: { ts: 2, estado: "visto" } }, v: 1 };
        expect(avisosIguales(x, y)).toBe(true);
        expect(avisosIguales(x, avisos({}))).toBe(false);
    });

    it("fusionarAvisosCrudo dice si lo local aporta algo que la cuenta no tenía", () => {
        const remoto = avisos({ x: { estado: "visto", ts: 10 } });
        const soloRemoto = fusionarAvisosCrudo(remoto, JSON.stringify(remoto));
        expect(soloRemoto.difiereDeRemoto).toBe(false);
        const localMas = fusionarAvisosCrudo(remoto, JSON.stringify(avisos({ y: { estado: "hecho", ts: 11 } })));
        expect(localMas.difiereDeRemoto).toBe(true);
        expect(Object.keys(localMas.valor.ids).sort()).toEqual(["x", "y"]);
        const localRoto = fusionarAvisosCrudo(remoto, "{no es json");
        expect(localRoto.difiereDeRemoto).toBe(false);
        expect(localRoto.valor.ids.x).toBeTruthy();
        expect(fusionarAvisosCrudo(remoto, null).difiereDeRemoto).toBe(false);
    });
});

describe("marcar y leer", () => {
    it("sin nada guardado, todo está pendiente", () => {
        const s = estadoAviso("a149");
        expect(s).toBe(SIN_REGISTRO);
        expect(avisoPendiente(s, T0)).toBe(true);
        expect(avisoResuelto(s)).toBe(false);
    });

    it("«visto» y «hecho» resuelven; se guardan en la clave que viaja con la cuenta", () => {
        marcarAviso("guia", "visto", { ahora: T0 });
        marcarAviso("centro", "hecho", { ahora: T0 });
        expect(avisoPendiente(estadoAviso("guia"), T0 + 10 * LUEGO_POR_DEFECTO_MS)).toBe(false);
        expect(avisoResuelto(estadoAviso("centro"))).toBe(true);
        const guardado = JSON.parse(localStorage.getItem(AVISOS_KEY)!);
        expect(guardado.v).toBe(1);
        expect(guardado.ids.guia.estado).toBe("visto");
    });

    it("«luego» pospone 24 h por defecto o hasta el instante dado, y luego vuelve a estar pendiente", () => {
        marcarAviso("a149", "luego", { ahora: T0 });
        const s = estadoAviso("a149");
        expect(s.hasta).toBe(T0 + LUEGO_POR_DEFECTO_MS);
        expect(avisoPospuesto(s, T0 + 1000)).toBe(true);
        expect(avisoPendiente(s, T0 + 1000)).toBe(false);
        expect(avisoPendiente(s, T0 + LUEGO_POR_DEFECTO_MS)).toBe(true);

        marcarAviso("otra", "luego", { ahora: T0, hastaMs: T0 + 5000 });
        expect(estadoAviso("otra").hasta).toBe(T0 + 5000);
    });

    it("un «luego» NO resucita lo que ya está visto o hecho (otro medio lo resolvió)", () => {
        marcarAviso("k", "hecho", { ahora: T0 });
        marcarAviso("k", "luego", { ahora: T0 + 10 });
        expect(estadoAviso("k").estado).toBe("hecho");
        marcarAviso("v", "visto", { ahora: T0 });
        marcarAviso("v", "luego", { ahora: T0 + 10 });
        expect(estadoAviso("v").estado).toBe("visto");
    });

    it("olvidarAviso lo deja pendiente ya, y la fusión con el «hecho» viejo respeta el reinicio", () => {
        marcarAviso("k", "hecho", { ahora: T0 });
        const viejo = localStorage.getItem(AVISOS_KEY)!;
        olvidarAviso("k");
        const s = estadoAviso("k");
        expect(s.estado).toBe("luego");
        expect(s.hasta).toBe(0);
        expect(avisoPendiente(s)).toBe(true);
        // Otro medio que aún tenía el «hecho» viejo no lo resucita al fusionar.
        const { valor } = fusionarAvisosCrudo(JSON.parse(viejo), localStorage.getItem(AVISOS_KEY));
        expect(valor.ids.k.estado).toBe("luego");
    });

    it("olvidar algo nunca marcado no escribe nada", () => {
        olvidarAviso("nunca");
        expect(localStorage.getItem(AVISOS_KEY)).toBeNull();
    });

    it("la marca nueva siempre gana a la que ya vimos, aunque el reloj vaya atrasado", () => {
        marcarAviso("k", "luego", { ahora: T0 + 1_000_000, hastaMs: T0 + 9 });
        marcarAviso("k", "luego", { ahora: T0, hastaMs: T0 + 99 }); // reloj atrasado
        expect(estadoAviso("k").ts).toBe(T0 + 1_000_001);
        expect(estadoAviso("k").hasta).toBe(T0 + 99);
    });

    it("escribir el mismo estado otra vez no cambia nada (ni marca nueva ni subida)", () => {
        marcarAviso("k", "visto", { ahora: T0 });
        const antes = localStorage.getItem(AVISOS_KEY);
        marcarAviso("k", "visto", { ahora: T0 + 5000 });
        expect(localStorage.getItem(AVISOS_KEY)).toBe(antes);
        marcarAviso("l", "luego", { ahora: T0, hastaMs: T0 + 10 });
        const antesL = localStorage.getItem(AVISOS_KEY);
        marcarAviso("l", "luego", { ahora: T0 + 1, hastaMs: T0 + 10 });
        expect(localStorage.getItem(AVISOS_KEY)).toBe(antesL);
    });

    it("el ámbito por neurona no se mezcla con el de la cuenta ni con otra neurona", () => {
        marcarAviso("nueva", "luego", { neurona: "n-1", ahora: T0, hastaMs: T0 + 100 });
        expect(estadoAviso("nueva", { neurona: "n-1" }).estado).toBe("luego");
        expect(estadoAviso("nueva", { neurona: "n-2" })).toBe(SIN_REGISTRO);
        expect(estadoAviso("nueva")).toBe(SIN_REGISTRO);
        marcarAviso("nueva", "hecho", { ahora: T0 });
        expect(estadoAviso("nueva", { neurona: "n-1" }).estado).toBe("luego");
        expect(estadoAviso("nueva").estado).toBe("hecho");
    });

    it("nunca lanza con id vacío o con el almacenamiento corrupto", () => {
        expect(() => marcarAviso("", "visto")).not.toThrow();
        localStorage.setItem(AVISOS_KEY, "{corrupto");
        _reiniciarCacheAvisosParaPruebas();
        expect(leerAvisos()).toBe(AVISOS_VACIOS);
        expect(() => marcarAviso("a", "visto", { ahora: T0 })).not.toThrow();
        expect(estadoAviso("a").estado).toBe("visto");
    });
});

describe("instantáneas ESTABLES (precedente React #185)", () => {
    it("leerAvisos devuelve el MISMO objeto mientras el texto guardado no cambia", () => {
        marcarAviso("a", "visto", { ahora: T0 });
        const p = leerAvisos();
        for (let i = 0; i < 50; i++) expect(leerAvisos()).toBe(p);
    });

    it("estadoAviso devuelve la MISMA referencia en lecturas repetidas", () => {
        marcarAviso("a", "luego", { ahora: T0, hastaMs: T0 + 10 });
        const s = estadoAviso("a");
        for (let i = 0; i < 50; i++) expect(estadoAviso("a")).toBe(s);
        expect(estadoAviso("nunca")).toBe(estadoAviso("nunca"));
        expect(estadoAviso("nunca", { neurona: "n" })).toBe(SIN_REGISTRO);
    });

    it("cambiar OTRO aviso no cambia la referencia de éste; cambiar el suyo sí", () => {
        marcarAviso("a", "visto", { ahora: T0 });
        const sa = estadoAviso("a");
        marcarAviso("b", "hecho", { ahora: T0 });
        expect(estadoAviso("a")).toBe(sa);
        marcarAviso("a", "hecho", { ahora: T0 + 5 });
        expect(estadoAviso("a")).not.toBe(sa);
        expect(estadoAviso("a").estado).toBe("hecho");
    });

    it("reescribir el almacén con contenido equivalente (llegada idéntica de la cuenta) conserva la referencia", () => {
        marcarAviso("a", "visto", { ahora: T0 });
        const sa = estadoAviso("a");
        const texto = JSON.parse(localStorage.getItem(AVISOS_KEY)!);
        // Otro orden de claves y otro texto, mismo registro.
        localStorage.setItem(AVISOS_KEY, JSON.stringify({ porNeurona: {}, ids: { a: { ts: texto.ids.a.ts, estado: "visto" } }, v: 1 }));
        expect(estadoAviso("a")).toBe(sa);
    });

    it("la instantánea no depende del reloj: pasar el tiempo no la sustituye", () => {
        marcarAviso("a", "luego", { ahora: Date.now(), hastaMs: Date.now() + 1 });
        const s = estadoAviso("a");
        expect(estadoAviso("a")).toBe(s);
        expect(Object.isFrozen(s)).toBe(true);
    });
});

describe("integración con settings-sync", () => {
    it("la clave viaja con la cuenta y es fusionable", () => {
        expect(SYNCED_KEYS).toContain(AVISOS_KEY);
        expect(esClaveFusionable(AVISOS_KEY)).toBe(true);
        expect(esClaveFusionable("starseed.cursorfx.v1")).toBe(false);
    });

    it("fusionarConLocal une lo de la cuenta con lo de este medio", () => {
        const remoto = avisos({ a: { estado: "hecho", ts: 5 } });
        const local = JSON.stringify(avisos({ b: { estado: "visto", ts: 6 } }));
        const r = fusionarConLocal(AVISOS_KEY, remoto, local);
        expect(r.difiereDeRemoto).toBe(true);
        expect((r.valor as AvisosVistos).ids.a).toBeTruthy();
        expect((r.valor as AvisosVistos).ids.b).toBeTruthy();
        const otra = fusionarConLocal("starseed.cursorfx.v1", { z: 1 }, JSON.stringify({ y: 2 }));
        expect(otra.valor).toEqual({ z: 1 });
        expect(otra.difiereDeRemoto).toBe(false);
    });
});
