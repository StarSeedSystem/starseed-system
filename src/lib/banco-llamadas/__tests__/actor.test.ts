/** ORD1114P · el actor del banco en la app de la Mac, con la tableta y la app falsas. */
import { describe, expect, it } from "vitest";
import { ActorBanco, leerOrdenBanco, motivoBanco, type DepsActor } from "../actor";
import type { RespuestaOrden } from "@/lib/control-remoto/orden";

const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const T0 = Date.parse("2026-11-14T03:00:00Z");

function orden(extra: Record<string, unknown> = {}) {
    return {
        v: 1,
        serie: "s20261114-0300",
        n: 1,
        de_n: 10,
        escenario: "ble-video-2min",
        para: TABLETA,
        tipo: "video",
        medio: "sin-ip-desde-inicio",
        guion: [{ t_s: 120, quien: "mac", accion: "colgar" }],
        dur_s: 120,
        creada: new Date(T0).toISOString(),
        caduca: new Date(T0 + 120_000).toISOString(),
        ...extra,
    };
}

function mundo(o: { orden?: unknown; tableta?: (nombre: string, n: number) => Partial<RespuestaOrden> } = {}) {
    let reloj = T0;
    const marcas: string[] = [];
    const local: string[] = [];
    const remotas: string[] = [];
    let n = 0;
    const deps: DepsActor = {
        ahora: () => reloj,
        dormir: async (ms) => {
            reloj += ms;
        },
        leer: async () => ({ orden: o.orden ?? null, calma: { lectura: { carga1: 1.5, presion: 1, libre_pct: 40, swap_pct: 50, swapouts_min: 0 } } }),
        marcar: (d) => marcas.push(`banco ${d}`),
        tableta: () => ({
            orden: async (nombre) => {
                remotas.push(nombre);
                const r = o.tableta?.(nombre, ++n) ?? {};
                if (nombre === "leer-aceptacion") {
                    return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: { aceptado: true, nombre: "Tableta", nivel: "controlar", desde: new Date().toISOString() }, ...r };
                }
                return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: nombre === "leer-estado" ? { llamada: null } : {}, ...r };
            },
            sondear: async () => {
                remotas.push("leer-aceptacion");
                const r = o.tableta?.("leer-aceptacion", ++n) ?? {};
                return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: { aceptado: true, nombre: "Tableta", nivel: "controlar", desde: new Date().toISOString() }, ...r };
            },
        }),
        local: async (nombre) => {
            local.push(nombre);
            reloj += 500;
            return {};
        },
    };
    return { deps, marcas, local, remotas, avanzar: (ms: number) => (reloj += ms) };
}

describe("actor del banco (lado app de la Mac)", () => {
    it("apagado no hace nada; armado deja la marca «armada» con la tableta elegida", async () => {
        const m = mundo();
        const a = new ActorBanco(m.deps);
        expect(await a.vuelta()).toBe("apagado");
        expect(a.armar("no-es-un-uuid")).toBe(false);
        expect(a.armar(TABLETA, 4, 10)).toBe(true);
        expect(m.marcas[0]).toBe(`banco armada con=${TABLETA} hasta=2026-11-14T07:00:00Z restantes=10`);
    });

    it("sin orden deja como mucho una marca de sondeo por minuto", async () => {
        const m = mundo();
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        await a.vuelta();
        await a.vuelta();
        expect(m.marcas.filter((x) => x === "banco sondeo orden=ninguna")).toHaveLength(1);
        m.avanzar(61_000);
        await a.vuelta();
        expect(m.marcas.filter((x) => x === "banco sondeo orden=ninguna")).toHaveLength(2);
    });

    it("una orden hace la llamada entera sin nadie: inicio, contestar (con reintento), simulación marcada, colgar, fin", async () => {
        const m = mundo({ orden: orden(), tableta: (nombre, i) => (nombre === "contestar" && i === 3 ? { ok: false, motivo: "sin-timbre" } : {}) });
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("hecha");
        expect(m.local).toEqual(["llamar", "simular-corte-ip", "colgar"]);
        expect(m.remotas).toEqual(["leer-aceptacion", "leer-estado", "contestar", "contestar", "simular-corte-ip"]);
        const ev = m.marcas.map((x) => x.split(" ")[1]);
        expect(ev).toEqual(["armada", "inicio", "calma", "fin", "calma"]);
        expect(m.marcas[1]).toBe("banco inicio esc=ble-video-2min serie=s20261114-0300 n=1 medio=sin-ip-desde-inicio tipo=video");
        expect(m.marcas[3]).toMatch(/^banco fin esc=ble-video-2min serie=s20261114-0300 n=1 cuelga=mac dur_s=12\d$/);
        expect(m.marcas[2]).toBe("banco calma serie=s20261114-0300 n=1 fase=inicio carga1=1.5 presion=1 libre=40% swap=50% swapouts_min=0");
        // La misma (serie, n) leída otra vez no repite la llamada.
        expect(await a.vuelta()).toBe("sin-orden");
        expect(a.estado()?.restantes).toBe(39);
    });

    it("si la tableta no lo permite, marca «rechaza» con el motivo de la lista cerrada y no llama", async () => {
        const m = mundo({ orden: orden(), tableta: () => ({ ok: false, motivo: "permiso-apagado" }) });
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("rechazada:permiso-apagado");
        expect(m.local).toEqual([]);
        expect(m.marcas.at(-1)).toBe("banco rechaza esc=ble-video-2min serie=s20261114-0300 n=1 motivo=modo-apagado");
    });

    it("una orden caducada, para otra tableta o mal formada no se ejecuta", async () => {
        const c = mundo({ orden: orden({ caduca: new Date(T0 - 1).toISOString() }) });
        const a = new ActorBanco(c.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("caducada");
        expect(c.marcas.at(-1)).toMatch(/motivo=orden-caducada$/);
        const o = mundo({ orden: orden({ para: "aaaa0002-0000-4000-8000-000000000099" }) });
        const b = new ActorBanco(o.deps);
        b.armar(TABLETA);
        expect(await b.vuelta()).toBe("otra-tableta");
        expect(o.local).toEqual([]);
        expect(leerOrdenBanco(orden({ guion: [{ t_s: 1, quien: "mac", accion: "rm -rf" }] }))).toBeNull();
        expect(motivoBanco("caducada")).toBe("orden-caducada");
    });

    it("se apaga solo al vencer la hora", async () => {
        const m = mundo();
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA, 1);
        m.avanzar(3_600_001);
        expect(await a.vuelta()).toBe("vencida");
        expect(m.marcas.at(-1)).toBe("banco apagada motivo=vencida");
    });
});
