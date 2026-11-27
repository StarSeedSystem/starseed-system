/** LAY1127E · decisiones cortas: local → par de la misma cuenta → router de siempre. */
import { describe, it, expect } from "vitest";
import {
  CLAVE_AJUSTE_LAYA,
  CLAVE_AJUSTE_LAYA_ANTERIOR,
  decidirCortoConLaya,
  leerAjusteLaya,
} from "../router-laya";
import {
  PLAZO_LAYA_CORTO_MS,
  anunciaLaya,
  type NodoLayaMalla,
} from "@/lib/network/laya-por-malla";
import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";

const RESPUESTAS = { basta: { noul: 0.9, answer_confidence: 0.9 } };
const PREGUNTAS = { basta: { type: "noul" as const, instructions: "¿Basta?" } };
const BASE = { cuentaId: "c1", estado: "resumen corto", preguntas: PREGUNTAS };
const sinRouter = (): never => { throw new Error("no debía llamar al router"); };

function ficha(nodoId: string, capas: string[] = ["laya@1"]): CapacidadesNodo {
  return { nodoId, medio: "mac", needle: null, bitnet: null, jev: false,
    ramLibreMb: 0, cpu: 0, t: 0, capas };
}

function par(nodoId: string, cuentaId: string, responder: (c: string) => Promise<unknown>): NodoLayaMalla {
  return { nodoId, cuentaId, ficha: ficha(nodoId), responder };
}

function almacen(valores: Record<string, string> = {}) {
  const escritos: string[] = [];
  return {
    escritos,
    getItem: (clave: string) => valores[clave] ?? null,
    setItem: (clave: string, valor: string) => { escritos.push(`${clave}=${valor}`); },
  };
}

function relojFalso() {
  let ahora = 0;
  let vencer: (() => void) | null = null;
  const reloj = { ahora: () => ahora, dormir: (ms: number) => {
    let resolver: () => void = () => {};
    const promesa = new Promise<void>((r) => { resolver = r; });
    vencer = () => { ahora += ms; resolver(); };
    return { promesa, cancelar: () => {} };
  } };
  return { reloj, disparar: () => vencer?.() };
}

describe("decidirCortoConLaya", () => {
  it("local caliente → local, sin malla ni router", async () => {
    let llamadas = 0;
    const r = await decidirCortoConLaya({ ...BASE, miFicha: ficha("yo"),
      nodos: [par("otro", "c1", async () => { llamadas++; return { answers: RESPUESTAS }; })],
      layaLocal: async () => ({ answers: RESPUESTAS }) }, sinRouter);
    expect(r.origen).toBe("local"); expect(llamadas).toBe(0);
    if (r.origen === "router") throw new Error(r.motivo);
    expect(r.respuestas).toEqual(RESPUESTAS);
  });
  it("sin local, par de la cuenta → malla", async () => {
    let cuerpo = "";
    const r = await decidirCortoConLaya({ ...BASE,
      nodos: [par("par", "c1", async (c) => { cuerpo = c; return { answers: RESPUESTAS }; })] }, sinRouter);
    expect(r.origen).toBe("malla");
    expect(JSON.parse(cuerpo)).toEqual({ state: BASE.estado, questions: PREGUNTAS });
    if (r.origen === "router") throw new Error(r.motivo);
    expect(r.respuestas).toEqual(RESPUESTAS);
  });
  it("par lento → router exacto a los 2 s", async () => {
    const reloj = relojFalso(), ruta = { proveedor: "gratis" };
    const p = decidirCortoConLaya({ ...BASE, reloj: reloj.reloj,
      nodos: [par("lento", "c1", () => new Promise(() => {}))] }, () => ruta);
    reloj.disparar();
    const r = await p;
    expect(PLAZO_LAYA_CORTO_MS).toBeLessThanOrEqual(2_000);
    expect(r).toMatchObject({ origen: "router", ms: 2_000 });
    if (r.origen !== "router") throw new Error("debía caer al router");
    expect(r.respuesta).toBe(ruta);
  });
  it("otra cuenta ignorada", async () => {
    let llamadas = 0; const ruta = { Router: true };
    const r = await decidirCortoConLaya({ ...BASE,
      nodos: [par("ajeno", "otra", async () => { llamadas++; return { answers: RESPUESTAS }; })] }, () => ruta);
    expect(llamadas).toBe(0); expect(r.origen).toBe("router");
    if (r.origen !== "router") throw new Error("debía caer al router");
    expect(r.respuesta).toBe(ruta);
  });
  it("ajuste apagado → router, sin preguntar a Laya", async () => {
    let llamadas = 0; const ruta = { apagado: true };
    const r = await decidirCortoConLaya({ ...BASE, almacen: almacen({ [CLAVE_AJUSTE_LAYA]: "false" }),
      miFicha: ficha("yo"), layaLocal: async () => { llamadas++; return { answers: RESPUESTAS }; } }, () => ruta);
    expect(llamadas).toBe(0); expect(r.origen).toBe("router");
    if (r.origen !== "router") throw new Error("debía caer al router");
    expect(r.respuesta).toBe(ruta);
  });
  it("el valor viejo manda y no se pisa al migrar", async () => {
    const a = almacen({ [CLAVE_AJUSTE_LAYA_ANTERIOR]: "false" });
    expect(leerAjusteLaya(a)).toBe(false); expect(a.escritos).toEqual([]);
    const ruta = { viejo: true };
    const r = await decidirCortoConLaya({ ...BASE, almacen: a, miFicha: ficha("yo"),
      layaLocal: async () => ({ answers: RESPUESTAS }) }, () => ruta);
    expect(r.origen).toBe("router");
    if (r.origen !== "router") throw new Error("debía caer al router");
    expect(r.respuesta).toBe(ruta); expect(a.escritos).toEqual([]);
  });
  it("si el local falla, prueba el par antes que el router", async () => {
    const r = await decidirCortoConLaya({ ...BASE, miFicha: ficha("yo"),
      layaLocal: async () => { throw new Error("caído"); },
      nodos: [par("par", "c1", async () => ({ answers: RESPUESTAS }))] }, sinRouter);
    expect(r.origen).toBe("malla");
    if (r.origen === "router") throw new Error(r.motivo);
    expect(r.respuestas).toEqual(RESPUESTAS);
  });
  it("sin ajuste guardado Laya está encendida y solo se anuncia si la ficha la trae", () => {
    expect(leerAjusteLaya(almacen())).toBe(true); expect(leerAjusteLaya(null)).toBe(true);
    expect(anunciaLaya(ficha("yo"))).toBe(true); expect(anunciaLaya(ficha("yo", []))).toBe(false);
  });
});
