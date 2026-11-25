/** BAN1115D · orden al revés (c10), el escenario del corte de IP y el informe de la app, con la tableta y la app falsas. */
import { describe, expect, it } from "vitest";
import { ActorBanco, leerOrdenBanco, type DepsActor, type EstadoApp } from "../actor";
import type { RespuestaOrden } from "@/lib/control-remoto/orden";

const TABLETA = "aaaa0002-0000-4000-8000-000000000003";
const MAC = "aaaa0000-0000-4000-8000-000000000001";
const T0 = Date.parse("2026-11-14T03:00:00Z");

function orden(extra: Record<string, unknown> = {}) {
    return {
        v: 1, serie: "s20261115-0300", n: 1, de_n: 3, escenario: "corte-ip-vuelve", para: TABLETA, tipo: "video", medio: "auto",
        guion: [{ t_s: 25, quien: "ambos", accion: "corte-ip" }, { t_s: 85, quien: "ambos", accion: "vuelve-ip" }, { t_s: 115, quien: "tableta", accion: "colgar" }],
        dur_s: 150, creada: new Date(T0).toISOString(), caduca: new Date(T0 + 120_000).toISOString(), ...extra,
    };
}

function mundo(o: { orden?: unknown; tableta?: (nombre: string) => Partial<RespuestaOrden>; local?: (nombre: string, veces: number) => void } = {}) {
    let reloj = T0;
    const marcas: string[] = [];
    const local: string[] = [];
    const remotas: string[] = [];
    const informes: EstadoApp[] = [];
    const veces: Record<string, number> = {};
    const deps: DepsActor = {
        ahora: () => reloj,
        dormir: async (ms) => { reloj += ms; },
        leer: async () => ({ orden: o.orden ?? null, calma: null }),
        marcar: (d) => marcas.push(`banco ${d}`),
        tableta: () => ({
            orden: async (nombre) => {
                remotas.push(nombre);
                if (nombre === "leer-aceptacion") {
                    return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: { aceptado: true, nombre: "Tableta", nivel: "controlar", desde: new Date().toISOString() }, ...(o.tableta?.(nombre) ?? {}) };
                }
                return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: nombre === "leer-estado" ? { llamada: null } : {}, ...(o.tableta?.(nombre) ?? {}) };
            },
            sondear: async () => {
                remotas.push("leer-aceptacion");
                const extra = o.tableta?.("leer-aceptacion") ?? {};
                return { tipo: "respuesta", nonce: "x", ok: true, motivo: "ok", resultado: { aceptado: true, nombre: "Tableta", nivel: "controlar", desde: new Date().toISOString() }, ...extra };
            },
        }),
        local: async (nombre) => {
            local.push(nombre);
            veces[nombre] = (veces[nombre] ?? 0) + 1;
            o.local?.(nombre, veces[nombre]);
            reloj += 500;
            return {};
        },
        yo: () => MAC,
        publicar: (e) => informes.push(e),
        llave: async () => ({ tiene: true, codigo: "ABCD-1234" }),
    };
    return { deps, marcas, local, remotas, informes };
}

describe("BAN1115D · la orden y el actor", () => {
    it("lee el campo opcional «llama» y lo demás igual", () => {
        expect(leerOrdenBanco(orden({ llama: "tableta" }))?.llama).toBe("tableta");
        expect(leerOrdenBanco(orden({ llama: "otra" }))?.llama).toBeUndefined();
        expect(leerOrdenBanco(orden())).not.toBeNull();
    });

    it("corte-ip-vuelve: corte y vuelta en las dos puntas, cuelga la tableta y la marca lo dice", async () => {
        const m = mundo({ orden: orden() });
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("hecha");
        expect(m.local.filter((x) => x === "simular-corte-ip" || x === "simular-vuelve-ip")).toEqual(["simular-corte-ip", "simular-vuelve-ip"]);
        expect(m.remotas.filter((x) => x.startsWith("simular") || x === "colgar")).toEqual(["simular-corte-ip", "simular-vuelve-ip", "colgar"]);
        expect(m.local).not.toContain("colgar"); // la Mac no cuelga: cuelga la tableta
        expect(m.marcas.some((x) => /^banco fin .*cuelga=tableta dur_s=1[01]\d$/.test(x))).toBe(true);
    });

    it("tableta-llama: la tableta recibe «llamar» con la neurona de esta Mac y la Mac contesta con su propio actor", async () => {
        const llamar: unknown[] = [];
        const m = mundo({
            orden: orden({ escenario: "tableta-llama", llama: "tableta", dur_s: 60, guion: [{ t_s: 30, quien: "mac", accion: "colgar" }] }),
            local: (nombre, veces) => { if (nombre === "contestar" && veces < 2) throw new Error("sin-timbre"); },
        });
        const dep = m.deps.tableta;
        m.deps.tableta = (p) => ({ orden: async (n, args) => { if (n === "llamar") llamar.push(args); return dep(p).orden(n, args); } });
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("hecha");
        expect(llamar).toEqual([{ neurona: MAC, tipo: "video" }]);
        expect(m.local.filter((x) => x === "contestar").length).toBe(2); // el primero sin timbre, se reintenta
        expect(m.local).toContain("colgar");
        expect(m.remotas).not.toContain("contestar"); // la tableta NO contesta: llama
        expect(m.marcas.some((x) => /cuelga=mac/.test(x))).toBe(true);
    });

    it("tableta-llama: si la tableta rechaza «llamar», la serie lo dice y no cuelga nada", async () => {
        const m = mundo({ orden: orden({ escenario: "tableta-llama", llama: "tableta", guion: [] }), tableta: (n) => (n === "llamar" ? { ok: false, motivo: "falta-permiso" } : {}) });
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        expect(await a.vuelta()).toBe("rechazada:falta-permiso");
        expect(m.marcas.some((x) => /rechaza .*motivo=falta-permiso/.test(x))).toBe(true);
    });
});

describe("BAN1115D · el informe de la app", () => {
    it("al armar publica clave, código, tableta aceptada y armada hasta cuándo", async () => {
        const m = mundo();
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA, 4, 40);
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        const e = m.informes.at(-1)!;
        expect(e).toMatchObject({ v: 1, llave: true, objetivo: TABLETA, codigo: "ABCD-1234", sesion: { estado: "aceptada", motivo: null } });
        expect(e.armada).toMatchObject({ con: TABLETA, restantes: 40 });
        expect(e.armada!.hasta).toBe(T0 + 4 * 3_600_000);
    });

    it("una tableta que no aceptó se publica como rechazada con su motivo, sin armar ni aceptar nada", async () => {
        const m = mundo({ tableta: (n) => (n === "leer-aceptacion" ? { ok: false, motivo: "no-aceptada" } : {}) });
        const a = new ActorBanco(m.deps);
        await a.comprobar(TABLETA); // «pedir controlarla»: solo mira
        expect(a.estado()).toBeNull();
        expect(m.remotas).toEqual(["leer-aceptacion"]);
        expect(m.informes.at(-1)).toMatchObject({ objetivo: TABLETA, sesion: { estado: "rechazada", motivo: "no-aceptada" }, armada: null });
    });

    it("sin clave propia lo dice (false) y un destino mal formado no hace nada", async () => {
        const m = mundo();
        m.deps.llave = async () => ({ tiene: false, codigo: null });
        const a = new ActorBanco(m.deps);
        await a.comprobar("no-es-un-uuid");
        expect(m.remotas).toEqual([]);
        await a.comprobar(TABLETA);
        expect(m.informes.at(-1)?.llave).toBe(false);
    });

    it("apagar publica que ya no está armada", async () => {
        const m = mundo();
        const a = new ActorBanco(m.deps);
        a.armar(TABLETA);
        a.apagar("apagar");
        await new Promise((r) => setTimeout(r, 0));
        expect(m.informes.at(-1)?.armada).toBeNull();
    });
});
