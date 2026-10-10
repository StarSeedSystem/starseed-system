import { describe, expect, it } from "vitest";
import { aplicarOperacion } from "../parametros";
import { entenderDictado, entenderVarias, limpiarFrase } from "../dictado";
import type { ContextoDictado, ResultadoDictado } from "../dictado";
import type { Accion, Autor, CandidatoParametro, Parametro } from "../tipos";

const P: Record<string, Parametro> = {
  reverb: { id: "mezcla", nombre: "Reverberación", sinonimos: ["reverb"], tipo: "numero", min: 0, max: 100, paso: 1, unidad: "%", defecto: 30 },
  brillo: { id: "brillo", nombre: "Brillo", tipo: "numero", min: 0, max: 3, paso: 0.5, defecto: 1 },
  freq: { id: "freq", nombre: "Frecuencia", tipo: "numero", min: 20, max: 20000, unidad: "Hz", defecto: 1000 },
  vol: { id: "vol", nombre: "Volumen", tipo: "numero", min: -60, max: 6, unidad: "dB", defecto: -6 },
  eco: { id: "eco", nombre: "Eco", tipo: "booleano" },
  captura: { id: "cap", nombre: "Captura", tipo: "disparo" },
  filtro: { id: "tipo", nombre: "Tipo de filtro", sinonimos: ["filtro"], tipo: "opcion", opciones: ["paso bajo", "paso alto", "banda"] },
};
const cand = (p: Parametro, atomoId = "a1", atomo?: string): CandidatoParametro => ({ ref: { atomoId, parametroId: p.id }, parametro: p, atomo });
const TODOS = Object.values(P).map((p) => cand(p));
const ana: Autor = { tipo: "persona", id: "ana" };
const ctx: ContextoDictado = { autor: ana, ahora: 1000 };
const dictar = (frase: string, cs = TODOS, c = ctx) => entenderDictado(frase, cs, c);
const accion = (r: ResultadoDictado): Accion => {
  if (!r.ok) throw new Error(`${r.razon} ${r.sugerencia}`);
  return r.operacion.accion;
};
const exacta = (frase: string, cs = TODOS) => {
  const a = accion(dictar(frase, cs));
  if (a.tipo !== "exacta") throw new Error(`no es exacta: ${frase}`);
  return a.valor;
};

describe("relativas", () => {
  it("«sube la reverberación un 10 %»: en un parámetro que ya va en % son 10 puntos", () => {
    expect(accion(dictar("sube la reverberación un 10 %"))).toEqual({ tipo: "relativa", cantidad: 10, modo: "delta" });
  });
  it("el mismo «un 10 %» en un parámetro sin % es el 10 % de su valor", () => {
    expect(accion(dictar("Sube el brillo un 10%"))).toEqual({ tipo: "relativa", cantidad: 10, modo: "porcentaje-valor" });
  });
  it("con unidad: «baja el volumen 3 dB» y «sube la frecuencia 2 kHz» (convierte a Hz)", () => {
    expect(accion(dictar("baja el volumen 3 dB"))).toEqual({ tipo: "relativa", cantidad: -3, modo: "delta" });
    expect(accion(dictar("sube la frecuencia 2 kHz"))).toEqual({ tipo: "relativa", cantidad: 2000, modo: "delta" });
  });
  it("en pasos, con palabras: «sube el tipo de filtro un paso» y «baja el brillo dos pasos»", () => {
    expect(accion(dictar("sube el tipo de filtro un paso"))).toEqual({ tipo: "relativa", cantidad: 1, modo: "pasos" });
    expect(accion(dictar("baja el brillo dos pasos"))).toEqual({ tipo: "relativa", cantidad: -2, modo: "pasos" });
  });
  it("«sube el brillo A 2» es un destino, no un incremento", () => {
    expect(exacta("sube el brillo a 2")).toBe(2);
  });
  it("aplicada de verdad: +10 % de 1 → 1,1 y +10 puntos de 30 % → 40 %", () => {
    const r1 = dictar("sube el brillo un 10 %");
    const r2 = dictar("sube la reverb un 10 %");
    if (!r1.ok || !r2.ok) throw new Error("no entendido");
    expect(aplicarOperacion({}, P.brillo, r1.operacion)).toMatchObject({ ok: true, cambio: { despues: 1.1 } });
    expect(aplicarOperacion({}, P.reverb, r2.operacion)).toMatchObject({ ok: true, cambio: { despues: 40 } });
  });
});

describe("exactas", () => {
  it("«pon el brillo exactamente en 1,2» (coma) y «a 1.2» (punto)", () => {
    expect(exacta("pon el brillo exactamente en 1,2")).toBe(1.2);
    expect(exacta("ponme el brillo a 1.2")).toBe(1.2);
  });
  it("unidades: 2 kHz → 2000 Hz; 500 hercios; «50 %» de un rango es la mitad del rango", () => {
    expect(exacta("pon la frecuencia en 2 kHz")).toBe(2000);
    expect(exacta("pon la frecuencia en 500 hercios")).toBe(500);
    expect(exacta("pon el volumen al 50 %")).toBe(-27);
    expect(exacta("pon la reverberación al 40 por ciento")).toBe(40);
  });
  it("máximo, mínimo, tope y mitad; también sin verbo", () => {
    expect(exacta("pon el brillo al máximo")).toBe(3);
    expect(exacta("brillo al mínimo")).toBe(0);
    expect(exacta("pon el brillo a tope")).toBe(3);
    expect(exacta("pon el brillo a la mitad")).toBe(1.5);
    expect(exacta("brillo a 2,5")).toBe(2.5);
  });
  it("opciones por nombre", () => {
    expect(exacta("pon el tipo de filtro en paso alto")).toBe("paso alto");
    expect(exacta("filtro a banda")).toBe("banda");
  });
});

describe("interruptores y botones", () => {
  it("activa, desactiva, alterna", () => {
    expect(accion(dictar("activa el eco"))).toEqual({ tipo: "exacta", valor: true });
    expect(accion(dictar("por favor, apaga el eco"))).toEqual({ tipo: "exacta", valor: false });
    expect(accion(dictar("alterna el eco"))).toEqual({ tipo: "alternar" });
    expect(exacta("pon el eco activado")).toBe(true);
  });
  it("dispara el botón; no se «desactiva»", () => {
    expect(accion(dictar("dispara la captura"))).toEqual({ tipo: "disparo" });
    expect(accion(dictar("activa captura"))).toEqual({ tipo: "disparo" });
    expect(dictar("desactiva la captura").ok).toBe(false);
  });
});

describe("autoría y varias órdenes", () => {
  it("lleva autor, origen (dictado por defecto), frase original y resumen", () => {
    const r = dictar("sube la reverb un 10 %");
    expect(r).toMatchObject({ ok: true, resumen: "Reverberación: +10 %", operacion: { origen: "dictado", autor: ana, t: 1000, texto: "sube la reverb un 10 %", objetivo: { parametroId: "mezcla" } } });
    const ia = dictar("sube la reverb un 10 %", TODOS, { ...ctx, origen: "ia", id: () => "x1" });
    expect(ia).toMatchObject({ operacion: { origen: "ia", id: "x1" } });
  });
  it("separa dos órdenes, pero «uno y medio» no se parte", () => {
    const dos = entenderVarias("sube la reverberación un 10 % y baja el volumen 3 dB", TODOS, ctx);
    expect(dos.map((r) => r.ok)).toEqual([true, true]);
    expect(new Set(dos.map((r) => r.ok && r.operacion.id)).size).toBe(2);
    expect(entenderVarias("pon el brillo en uno y medio", TODOS, ctx)).toHaveLength(1);
    expect(exacta("pon el brillo en uno y medio")).toBe(1.5);
  });
  it("limpia signos y separa números pegados", () => {
    expect(limpiarFrase("¡Sube el volumen 3dB, por favor!")).toBe("sube el volumen 3 db por favor");
    expect(limpiarFrase("pon 1,2.")).toBe("pon 1,2");
  });
});
