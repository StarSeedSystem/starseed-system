import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cicloActual, derivarConsumo, guardarPresupuestos, leerDatosConsumo } from "../consumo";
import {
    PRESUPUESTOS_POR_DEFECTO,
    miles,
    normalizarPresupuestos,
    textoMb,
    tonoPorPct,
    validarPresupuestos,
} from "../consumo-tipos";

const MB = 1024 * 1024;
const AHORA = Date.parse("2026-09-29T18:00:00Z");

function consumoBase(extra: Record<string, unknown> = {}) {
    return {
        t_utc: "2026-09-29T17:50:00Z",
        hoy: {
            dia: "2026-09-29",
            peticiones: 12_345,
            bytes_est: 60 * MB,
            fraccion_medida: 0.4,
            c402: 0,
            realtime: { bytes_est: 3 * MB, escrituras: 1200, registros: 0, estimado: true },
            top: [
                { ruta: "/auth/v1/user", n: 5000, bytes_est: 6 * MB },
                { ruta: "/rest/v1/os_mesh_relay", n: 4000, bytes_est: 20 * MB },
                { ruta: "/rest/v1/posts", n: 2000, bytes_est: 10 * MB },
                { ruta: "/rest/v1/otra", n: 10, bytes_est: 1 },
            ],
        },
        freno: { activo: false, remoto: "ok" },
        restringido: false,
        ultimo_bucle: { t: "2026-09-29T15:00:00Z", ruta: "/rest/v1/os_mesh_relay", ua: "Chrome", n: 2100, tipo: "ruta" },
        jev: { coste_hoy: 0.01, techo_dia: 0.2, saldo: 9.5 },
        ...extra,
    };
}

const historialBase = {
    dias: {
        "2026-09-26": { peticiones: 30_000, bytes_est: 400 * MB },
        "2026-09-27": { peticiones: 8000, bytes_est: 100 * MB },
        "2026-09-29": { peticiones: 12_000, bytes_est: 59 * MB },
    },
};

describe("presupuestos", () => {
    it("valida números, rangos y la fecha del ciclo", () => {
        const ok = validarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, supabase_mb_dia: "120", ciclo_inicio: "2026-09-10" });
        expect(ok).toEqual({ ok: true, valor: { ...PRESUPUESTOS_POR_DEFECTO, supabase_mb_dia: 120, ciclo_inicio: "2026-09-10" } });
        expect(validarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, supabase_peticiones_dia: 0 }).ok).toBe(false);
        expect(validarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, jev_usd_dia: "abc" }).ok).toBe(false);
        expect(validarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, ciclo_inicio: "2026-02-30" }).ok).toBe(false);
        expect(validarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, ciclo_inicio: "" })).toMatchObject({ ok: true, valor: { ciclo_inicio: null } });
        expect(validarPresupuestos(null).ok).toBe(false);
    });

    it("normaliza lo guardado con los valores del contrato donde falte", () => {
        expect(normalizarPresupuestos(null)).toEqual(PRESUPUESTOS_POR_DEFECTO);
        expect(normalizarPresupuestos({ supabase_mb_dia: -1, supabase_peticiones_dia: 9000, ciclo_inicio: "x" })).toEqual({
            ...PRESUPUESTOS_POR_DEFECTO,
            supabase_peticiones_dia: 9000,
        });
    });
});

describe("cicloActual (igual que la vigía)", () => {
    it("mensual desde el inicio declarado, con días restantes", () => {
        expect(cicloActual("2026-09-10", "2026-09-29", null)).toEqual({ inicio: "2026-09-10", diasRestantes: 11, supuesto: false });
        expect(cicloActual("2026-09-10", "2026-10-12", null)).toEqual({ inicio: "2026-10-10", diasRestantes: 29, supuesto: false });
        expect(cicloActual("2026-01-31", "2026-03-05", null).inicio).toBe("2026-02-28");
    });

    it("sin inicio: supuesto desde el primer día medido y sin días restantes", () => {
        expect(cicloActual(null, "2026-09-29", "2026-09-26")).toEqual({ inicio: "2026-09-26", diasRestantes: null, supuesto: true });
    });
});

describe("derivarConsumo", () => {
    it("hoy contra el presupuesto, ciclo, top 3, bucle y 14 días", () => {
        const d = derivarConsumo({ consumo: consumoBase(), historial: historialBase, presupuestos: null, limites: null }, AHORA);
        const s = d.supabase;
        expect(s.nivel).toBe("ok");
        expect(s.fresco).toBe(true);
        expect(s.peticiones).toBe(12_345);
        expect(s.pctPeticiones).toBeCloseTo(12_345 / 25_000, 5);
        expect(s.pctMb).toBeCloseTo(60 / 150, 5);
        expect(s.top.map((t) => t.ruta)).toEqual(["/auth/v1/user", "/rest/v1/os_mesh_relay", "/rest/v1/posts"]);
        expect(s.realtime).toEqual({ mb: 3, escrituras: 1200, registros: 0, estimado: true });
        // Ciclo supuesto desde el 26: 400 + 100 + 59 MB (hoy según el historial).
        expect(s.ciclo).toMatchObject({ inicio: "2026-09-26", supuesto: true, diasRestantes: null, presupuestoMb: 5120 });
        expect(s.ciclo.mb).toBeCloseTo(559, 5);
        expect(s.historial).toHaveLength(14);
        expect(s.historial[13]).toEqual({ dia: "2026-09-29", peticiones: 12_345 });
        expect(s.historial[12]).toEqual({ dia: "2026-09-28", peticiones: null });
        expect(s.ultimoBucle).toMatchObject({ ruta: "/rest/v1/os_mesh_relay", n: 2100 });
        expect(d.jev).toMatchObject({ usdHoy: 0.01, techo: 0.05, saldo: 9.5, tono: "ok" });
        expect(d.jev.pct).toBeCloseTo(0.2, 5);
        expect(d.claude.sesion).toBeNull();
        expect(d.claude.semana).toBeNull();
        expect(d.claude.modelo).toBeNull();
    });

    it("los niveles salen de los presupuestos ACTUALES, no de los de la última vuelta", () => {
        const d = derivarConsumo(
            { consumo: consumoBase(), historial: historialBase, presupuestos: { supabase_peticiones_dia: 15_000 }, limites: null },
            AHORA,
        );
        expect(d.supabase.nivel).toBe("aviso");
        const d2 = derivarConsumo(
            { consumo: consumoBase(), historial: historialBase, presupuestos: { supabase_peticiones_dia: 12_000 }, limites: null },
            AHORA,
        );
        expect(d2.supabase.nivel).toBe("freno");
    });

    it("freno activo hasta medianoche, 402 y vigía parada", () => {
        const freno = derivarConsumo(
            {
                consumo: consumoBase({
                    freno: { activo: true, motivo: "Presupuesto diario de Supabase agotado", hasta: "2026-09-30T00:00:00Z", remoto: "ok" },
                }),
                historial: historialBase,
                presupuestos: null,
                limites: null,
            },
            AHORA,
        );
        expect(freno.supabase.nivel).toBe("freno");
        expect(freno.supabase.freno).toMatchObject({ activo: true, hasta: "2026-09-30T00:00:00Z" });
        // Pasada la medianoche el freno ya no cuenta aunque la vigía no lo haya apagado aún.
        const vencido = derivarConsumo(
            {
                consumo: consumoBase({ freno: { activo: true, hasta: "2026-09-29T00:00:00Z" } }),
                historial: historialBase,
                presupuestos: null,
                limites: null,
            },
            AHORA,
        );
        expect(vencido.supabase.freno.activo).toBe(false);
        const r = derivarConsumo({ consumo: consumoBase({ restringido: true }), historial: null, presupuestos: null, limites: null }, AHORA);
        expect(r.supabase.nivel).toBe("restringido");
        const parado = derivarConsumo({ consumo: consumoBase({ t_utc: "2026-09-29T12:00:00Z" }), historial: null, presupuestos: null, limites: null }, AHORA);
        expect(parado.supabase.fresco).toBe(false);
    });

    it("sin nada medido lo dice (no inventa ceros como si fueran medidas)", () => {
        const d = derivarConsumo({ consumo: null, historial: null, presupuestos: null, limites: null }, AHORA);
        expect(d.supabase.nivel).toBe("sin-medir");
        expect(d.supabase.medidoEn).toBeNull();
        expect(d.supabase.historial.every((x) => x.peticiones === null)).toBe(true);
        expect(d.jev.usdHoy).toBeNull();
        expect(d.jev.tono).toBe("neutro");
        expect(d.claude.sesion).toBeNull();
        expect(d.claude.semana).toBeNull();
        expect(d.claude.modelo).toBeNull();
        expect(d.claude.comando).toContain("limites_claude.py estado");
        expect(d.claude.tono).toBe("aviso");
    });

    it("el límite de Claude declarado: fracción, fecha y tono", () => {
        const d = derivarConsumo(
            {
                consumo: null,
                historial: null,
                presupuestos: null,
                limites: {
                    lecturas: [{
                        t: "2026-09-29T10:00:00Z",
                        sesion_pct: 34,
                        sesion_reinicio: "2026-10-01T00:00:00Z",
                        semana_pct: 61,
                        semana_reinicio: "2026-10-02T00:00:00Z",
                        modelo_nombre: "Fable",
                        modelo_pct: 45,
                        modelo_reinicio: "2026-10-03T00:00:00Z",
                        fuente: "claude.ai",
                    }],
                    programadas: { t: "2026-09-29T10:00:00Z", lista: [] },
                    umbral_pct: 90,
                },
            },
            AHORA,
        );
        expect(d.claude.sesion).not.toBeNull();
        expect(d.claude.semana).not.toBeNull();
        expect(d.claude.modelo).not.toBeNull();
        expect(d.claude.modeloNombre).toBe("Fable");
        expect(d.claude.lecturaEn).toBe("2026-09-29T10:00:00Z");
        expect(d.claude.tono).toBe("aviso");
        expect(d.claude.enlace).toBe("https://claude.ai/settings/usage");
        expect(d.claude.comando).toBe("python3 scripts/puente/limites_claude.py estado");
    });

    it("saldo de OpenRouter bajo el mínimo es peligro", () => {
        const d = derivarConsumo({ consumo: consumoBase({ jev: { coste_hoy: 0, saldo: 1.5 } }), historial: null, presupuestos: null, limites: null }, AHORA);
        expect(d.jev.tono).toBe("peligro");
    });
});

describe("formato", () => {
    it("miles, MB y tonos", () => {
        expect(miles(25_000)).toBe("25.000");
        expect(miles(1_234_567)).toBe("1.234.567");
        expect(textoMb(3.25)).toBe("3,3 MB");
        expect(textoMb(150)).toBe("150 MB");
        expect(textoMb(5120)).toBe("5,00 GB");
        expect(tonoPorPct(0.5)).toBe("ok");
        expect(tonoPorPct(0.7)).toBe("aviso");
        expect(tonoPorPct(1)).toBe("peligro");
        expect(tonoPorPct(null)).toBe("neutro");
    });
});

describe("lectura y escritura en disco", () => {
    let dir = "";
    afterEach(() => {
        if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("lee los cuatro archivos y escribe los presupuestos de forma atómica", async () => {
        dir = mkdtempSync(path.join(os.tmpdir(), "consumo-"));
        writeFileSync(path.join(dir, "consumo.json"), JSON.stringify(consumoBase()));
        writeFileSync(path.join(dir, "consumo-historial.json"), JSON.stringify(historialBase));
        writeFileSync(path.join(dir, "limites-claude.json"), "{roto");
        const d = await leerDatosConsumo(AHORA, dir);
        expect(d.supabase.peticiones).toBe(12_345);
        expect(d.claude.sesion).toBeNull();
        expect(d.claude.semana).toBeNull();
        expect(d.claude.modelo).toBeNull();
        expect(JSON.stringify(d)).not.toContain(dir);

        await guardarPresupuestos({ ...PRESUPUESTOS_POR_DEFECTO, supabase_mb_dia: 120 }, dir);
        expect(JSON.parse(readFileSync(path.join(dir, "presupuestos.json"), "utf8")).supabase_mb_dia).toBe(120);
        expect((await leerDatosConsumo(AHORA, dir)).presupuestos.supabase_mb_dia).toBe(120);
    });
});
