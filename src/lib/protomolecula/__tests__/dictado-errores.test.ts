import { describe, expect, it } from "vitest";
import { entenderDictado } from "../dictado";
import type { Autor, CandidatoParametro, Parametro } from "../tipos";

const vol: Parametro = { id: "vol", nombre: "Volumen", tipo: "numero", min: -60, max: 6, unidad: "dB", defecto: -6 };
const rev: Parametro = { id: "mezcla", nombre: "Reverberación", tipo: "numero", min: 0, max: 100, unidad: "%" };
const freq: Parametro = { id: "freq", nombre: "Frecuencia", tipo: "numero", min: 20, max: 20000, unidad: "Hz" };
const eco: Parametro = { id: "eco", nombre: "Eco", tipo: "booleano" };
const libre: Parametro = { id: "libre", nombre: "Libre", tipo: "numero" };
const cand = (p: Parametro, atomoId = "a1", atomo?: string): CandidatoParametro => ({ ref: { atomoId, parametroId: p.id }, parametro: p, atomo });
const ana: Autor = { tipo: "persona", id: "ana" };
const dictar = (frase: string, cs: CandidatoParametro[]) => entenderDictado(frase, cs, { autor: ana, ahora: 1 });
const BASE = [cand(vol), cand(rev), cand(freq), cand(eco), cand(libre)];
const valor = (frase: string, cs = BASE) => {
  const r = dictar(frase, cs);
  if (!r.ok || r.operacion.accion.tipo !== "exacta") throw new Error(`no exacta: ${frase}`);
  return r.operacion.accion.valor;
};

describe("números escritos con palabras", () => {
  it.each([
    ["pon la frecuencia en veinticinco hercios", 25],
    ["pon la frecuencia en treinta y cinco hercios", 35],
    ["pon la frecuencia en cien hercios", 100],
    ["pon la frecuencia en ciento veinte hercios", 120],
    ["pon la frecuencia en trescientos cuarenta y dos hercios", 342],
    ["pon la frecuencia en mil hercios", 1000],
    ["pon la frecuencia en dos mil quinientos hercios", 2500],
    ["pon la frecuencia en 1200 hercios", 1200],
  ])("%s → %d", (frase, esperado) => expect(valor(frase)).toBe(esperado));

  it.each([
    ["pon el libre en uno coma cinco", 1.5],
    ["pon el libre en cero coma veinticinco", 0.25],
    ["pon el libre en dos coma cinco cinco", 2.55],
    ["pon el libre en tres y medio", 3.5],
    ["pon el libre en menos tres", -3],
    ["pon el libre en menos uno coma dos", -1.2],
    ["pon el volumen en menos tres decibelios", -3],
    ["pon el libre en 0,75", 0.75],
  ])("%s → %d", (frase, esperado) => expect(valor(frase)).toBe(esperado));
});

describe("NO adivina: devuelve «no entendido» con sugerencia", () => {
  it("falta la cantidad", () => {
    const r = dictar("sube la reverberación", BASE);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.sugerencia).toMatch(/10 %/);
    expect(dictar("pon el volumen", BASE).ok).toBe(false);
  });
  it("«un poco» no es una cantidad", () => {
    expect(dictar("sube la reverberación un poco", BASE).ok).toBe(false);
  });
  it("un nombre casi igual se sugiere y NO se aplica", () => {
    const r = dictar("sube la reberberación un 10 %", BASE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.sugerencia).toContain("Reverberación");
  });
  it("un nombre desconocido lista los controles que hay", () => {
    const r = dictar("sube el ketchup un 10 %", BASE);
    expect(r).toMatchObject({ ok: false, candidatos: expect.any(Array) });
    expect(!r.ok && r.sugerencia).toMatch(/Controles:/);
  });
  it("una frase sin verbo ni control no se interpreta; el silencio tampoco", () => {
    expect(dictar("hola qué tal", BASE).ok).toBe(false);
    expect(dictar("   ", BASE).ok).toBe(false);
  });
  it("una unidad que no cuadra: 3 dB a una frecuencia en Hz", () => {
    const r = dictar("sube la frecuencia 3 dB", BASE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.razon).toMatch(/Hz/);
    expect(dictar("pon el libre en 3 dB", BASE).ok).toBe(false);
  });
  it("un interruptor no sube ni un valor se activa", () => {
    expect(dictar("sube el eco un 10 %", BASE).ok).toBe(false);
    expect(dictar("activa el volumen", BASE).ok).toBe(false);
  });
  it("palabras que sobran: mejor preguntar que ejecutar a medias", () => {
    const r = dictar("pon el libre en 2 y banana", BASE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.razon).toMatch(/banana/);
  });
  it("«al máximo» sin máximo definido pide un valor", () => {
    expect(dictar("pon el libre al máximo", BASE).ok).toBe(false);
  });
  it("dos controles con el mismo nombre: pregunta cuál, y «del bajo» lo resuelve", () => {
    const dos = [cand(vol, "bajo", "Bajo"), cand(vol, "voz", "Voz")];
    const r = dictar("pon el volumen en 3 decibelios", dos);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.candidatos).toHaveLength(2);
    const bien = dictar("pon el volumen del bajo en 3 decibelios", dos);
    expect(bien).toMatchObject({ ok: true, operacion: { objetivo: { atomoId: "bajo" }, accion: { tipo: "exacta", valor: 3 } } });
  });
  it("gana el nombre más largo: «volumen maestro» no se confunde con «volumen»", () => {
    const m: Parametro = { ...vol, id: "master", nombre: "Volumen maestro" };
    const r = dictar("pon el volumen maestro en -3 decibelios", [cand(vol), cand(m)]);
    expect(r).toMatchObject({ ok: true, operacion: { objetivo: { parametroId: "master" } } });
  });
});
