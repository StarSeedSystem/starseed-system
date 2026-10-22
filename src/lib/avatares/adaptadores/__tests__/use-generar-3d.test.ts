// @vitest-environment jsdom
/**
 * «Crear en 3D desde una imagen» (G3D1011E): preparación, reintentos, permiso remoto, Biblioteca y hook.
 * Sin red, sin GPU y sin disco: el taller, el Space y la Biblioteca son dobles inyectados.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Procedencia } from "../../adn/adn";
import type { Hierro } from "../../adn/optimizacion";
import type { NeuronaTaller } from "../reparto-taller";
import { generar3d, prepararGeneracion, useGenerar3d, type Contexto3D, type Dependencias3D, type Estado3D, type ResultadoTaller } from "../use-generar-3d";

const MAC8: Hierro = { gpu: "apple", ramGB: 8, vramGB: null, blender: true, permiteEspacioHf: true, claveExterna: false };
const NV16: Hierro = { gpu: "nvidia", ramGB: 64, vramGB: 16, blender: true, permiteEspacioHf: false, claveExterna: false };
const nv: NeuronaTaller = { id: "nv1", cuenta: "alex", ofrecidaPor: [], hierro: NV16, carga: 0, viva: true };
const ctx = (o: Partial<Contexto3D> = {}): Contexto3D => ({ destino: "avatar", hierro: MAC8, region: "US", comercial: false, cuenta: "alex", neuronas: [nv], permiteEspacioHf: true, ...o });
const img = () => new Blob([new Uint8Array(64)], { type: "image/png" });
const MESHY: Procedencia = { herramienta: "meshy", licencia: "CC BY 4.0", uso: "atribucion", atribucion: "Modelo 3D generado con Meshy" };
const ok = (procedencia: Procedencia[] = [MESHY], lods = [120_000, 60_000]): ResultadoTaller => ({ ok: true, glb: img(), lods, procedencia });
const op = { titulo: "Mi avatar", permisoRemoto: false, esFotoDePersonas: false, consentimientoPersonas: false };
function deps(o: Partial<Dependencias3D> = {}): Dependencias3D & { guardar: ReturnType<typeof vi.fn> } {
  return { taller: null, espacio: null, guardar: vi.fn(async () => ({ ok: true as const, ref: "biblioteca:m1" })), ...o } as Dependencias3D & { guardar: ReturnType<typeof vi.fn> };
}

describe("prepararGeneracion", () => {
  it("Mac de 8 GB sin taller: solo queda el Space, explica por qué y qué neurona podría", () => {
    const p = prepararGeneracion(ctx(), deps({ espacio: async () => ok() }));
    expect(p.via).toBe("remota");
    const gen = p.plan.pasos.find((x) => x.etapa === "generar");
    expect(gen?.motor?.id).toBe("pixal3d-espacio");
    expect(gen?.descartes.some((d) => d.startsWith("Pixal3D") && d.includes("cuda-8gb"))).toBe(true);
    expect(p.motivo).toMatch(/saldría de este aparato/);
    expect(p.neurona).toMatch(/nv1/);
  });
  it("NVIDIA 16 GB con taller: local con Pixal3D y el plan del destino", () => {
    const p = prepararGeneracion(ctx({ hierro: NV16 }), deps({ taller: async () => ok() }));
    expect(p.via).toBe("local");
    expect(p.plan.pasos[0].motor?.id).toBe("pixal3d");
    expect(p.optimizacion).toMatchObject({ destino: "avatar", prioridad: "calidad", generador: { resolucion: 1024, pocaMemoria: false } });
  });
  it("sin taller ni Space: «ninguna», y dice que el taller local no está instalado", () => {
    const p = prepararGeneracion(ctx({ hierro: NV16, neuronas: [] }), deps());
    expect(p.via).toBe("ninguna");
    expect(p.motivo).toMatch(/taller local .* no está instalado/);
    expect(p.neurona).toMatch(/ninguna neurona viva/i);
  });
  it("sin hierro medido no promete generar en local", () => {
    expect(prepararGeneracion(ctx({ hierro: null }), deps({ taller: async () => ok() })).via).toBe("ninguna");
  });
  it("con NVIDIA pero sin taller, el Space sigue de respaldo y se dice por qué no se genera aquí", () => {
    const p = prepararGeneracion(ctx({ hierro: NV16 }), deps({ espacio: async () => ok() }));
    expect(p.via).toBe("remota");
    expect(p.plan.pasos[0].motor?.id).toBe("pixal3d-espacio");
    expect(p.motivo).toMatch(/podría generar con Pixal3D.*no está instalado.*saldría de este aparato/);
  });
  it("sin el registro de neuronas no dice que no haya ninguna", () => expect(prepararGeneracion(ctx({ neuronas: null }), deps()).neurona).toMatch(/no se leyó el registro/));
  it("sin permiso de la cuenta no ofrece el Space aunque exista el respaldo, y lo dice", () => {
    const p = prepararGeneracion(ctx({ permiteEspacioHf: false }), deps({ espacio: async () => ok() }));
    expect(p.via).toBe("ninguna");
    expect(p.motivo).toMatch(/versiones públicas .* apagadas/i);
  });
});

describe("generar3d", () => {
  it("si falta memoria reintenta solo y más ligero, informa del progreso y guarda con atribuciones", async () => {
    const prep = prepararGeneracion(ctx({ hierro: NV16 }), deps({ taller: async () => ok() }));
    const planes: boolean[] = [];
    const taller = vi.fn(async (_i: Blob, plan: Parameters<NonNullable<Dependencias3D["taller"]>>[1], prog: (p: number, e: string) => void) => {
      planes.push(plan.generador.pocaMemoria);
      prog(140, "Generando la malla");
      return planes.length === 1 ? { ok: false as const, fallo: "sin-memoria" as const, motivo: "CUDA out of memory" } : ok();
    });
    const d = deps({ taller }), estados: Estado3D[] = [];
    const fin = await generar3d(img(), op, prep, ctx({ hierro: NV16 }), d, (e) => estados.push(e));
    expect(planes).toEqual([false, true]);
    expect(estados).toContainEqual(expect.objectContaining({ fase: "generando", intento: 2, etapa: "Generando la malla", progreso: 100 }));
    expect(fin).toEqual({ fase: "hecha", ref: "biblioteca:m1", lods: [120_000, 60_000], atribuciones: ["Modelo 3D generado con Meshy"], avisos: [] });
    expect(d.guardar).toHaveBeenCalledWith(expect.objectContaining({ titulo: "Mi avatar", destino: "avatar", procedencia: [MESHY], atribuciones: ["Modelo 3D generado con Meshy"] }));
  });
  it("si nunca cabe, se rinde con el motivo en vez de intentar sin fin", async () => {
    const taller = vi.fn(async () => ({ ok: false as const, fallo: "sin-memoria" as const, motivo: "sin VRAM" }));
    const c = ctx({ hierro: NV16, destino: "protomolecula" }), d = deps({ taller });
    const fin = await generar3d(img(), op, prepararGeneracion(c, d), c, d, () => {});
    expect(fin).toMatchObject({ fase: "error", motivo: expect.stringMatching(/No cabe en esta neurona.*sin VRAM/) });
    expect(taller).toHaveBeenCalledTimes(4);
    expect(d.guardar).not.toHaveBeenCalled();
  });
  it("si tarda demasiado incluso con el intento más ligero, lo dice así (no «no cabe»)", async () => {
    const c = ctx({ hierro: NV16, destino: "pieza" }), d = deps({ taller: vi.fn(async () => ({ ok: false as const, fallo: "lento" as const, motivo: "más de 20 min" })) });
    expect(await generar3d(img(), op, prepararGeneracion(c, d), c, d, () => {})).toMatchObject({ fase: "error", motivo: expect.stringMatching(/^Tarda demasiado.*\(512\): más de 20 min$/) });
  });
  it("remoto: sin permiso o sin consentimiento de las personas no sale nada del aparato", async () => {
    const espacio = vi.fn(async () => ok([], []));
    const d = deps({ espacio }), prep = prepararGeneracion(ctx(), d);
    expect(await generar3d(img(), op, prep, ctx(), d, () => {})).toMatchObject({ fase: "error", motivo: expect.stringMatching(/Falta tu permiso/) });
    const personas = { ...op, permisoRemoto: true, esFotoDePersonas: true };
    expect(await generar3d(img(), personas, prep, ctx(), d, () => {})).toMatchObject({ fase: "error", motivo: expect.stringMatching(/consentimiento/) });
    expect(espacio).not.toHaveBeenCalled();
  });
  it("remoto con permiso: progreso sin porcentaje inventado, aviso de la Biblioteca y aviso honesto de que no hay LOD", async () => {
    const d = deps({ espacio: vi.fn(async () => ok([], [])), guardar: vi.fn(async () => ({ ok: true as const, ref: "biblioteca:m2", aviso: "Aún sin registrar en tu cuenta: se reintentará." })) }), estados: Estado3D[] = [];
    const fin = await generar3d(img(), { ...op, permisoRemoto: true }, prepararGeneracion(ctx(), d), ctx(), d, (e) => estados.push(e));
    expect(estados[0]).toMatchObject({ fase: "generando", progreso: null });
    expect(fin).toMatchObject({ fase: "hecha", lods: [], avisos: ["Aún sin registrar en tu cuenta: se reintentará.", expect.stringMatching(/Sin niveles de detalle/), "Queda pendiente: riggear (no hay motor para eso en esta neurona)."] });
  });
  it("si la Biblioteca no guarda, lo dice", async () => {
    const d = deps({ espacio: async () => ok(), guardar: vi.fn(async () => ({ ok: false as const, motivo: "sin sesión" })) });
    expect(await generar3d(img(), { ...op, permisoRemoto: true }, prepararGeneracion(ctx(), d), ctx(), d, () => {}))
      .toEqual({ fase: "error", motivo: "Se generó, pero no se pudo guardar en la Biblioteca: sin sesión" });
  });
});

describe("useGenerar3d", () => {
  it("lleva el estado hasta «hecha» y convierte un fallo lanzado en un error legible", async () => {
    const c = ctx({ hierro: NV16 }), bien = deps({ taller: async () => ok() });
    const { result } = renderHook(() => useGenerar3d(c, bien));
    expect(result.current.preparado.via).toBe("local");
    await act(async () => { await result.current.generar(img(), op); });
    expect(result.current.estado).toMatchObject({ fase: "hecha", ref: "biblioteca:m1" });
    const mal = deps({ taller: async () => { throw new Error("se cayó el taller"); } });
    const r2 = renderHook(() => useGenerar3d(c, mal)).result;
    await act(async () => { await r2.current.generar(img(), op); });
    expect(r2.current.estado).toEqual({ fase: "error", motivo: "Falló la generación: se cayó el taller." });
  });
});
