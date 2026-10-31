// @vitest-environment jsdom
/**
 * AV1011B · pruebas de `useEditorAvatar` con reloj falso: agrupación y emisión (solo con otros
 * presentes), deshacer/rehacer (pila, tope 50), cuándo guarda (`debeGuardar`) y el dictado con
 * Astraura. Sin red, sin disco y sin Supabase: el almacén, la emisión y Astraura son dobles.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "../../adn/adn";
import type { CambioAvatar } from "../../adn/cambios";
import { CC_DEFECTO, MAX_PASOS, cambiosDeAstraura, cambioDeCC, useEditorAvatar, type DependenciasEditorAvatar } from "../use-editor-avatar";

const PARTIDA: AdnAvatar = adnPorDefecto("adn-test", "Prueba", { tipo: "perfil", id: "p1" });
const mor = (clave: "altura", valor: number): CambioAvatar => ({ op: "morfologia", clave, valor });
interface Doble {
  guardar: ReturnType<typeof vi.fn>;
  emitidas: CambioAvatar[][];
  deps: DependenciasEditorAvatar;
}
function doble(astraura: DependenciasEditorAvatar["astraura"]): Doble {
  const emitidas: CambioAvatar[][] = [];
  const deps: DependenciasEditorAvatar = {
    guardar: vi.fn(async () => undefined),
    astraura,
    emitir: (cs: readonly CambioAvatar[]) => { emitidas.push([...cs]); },
  };
  return { guardar: deps.guardar as ReturnType<typeof vi.fn>, emitidas, deps };
}
function montar(otros: number, d: Doble) {
  return renderHook(() => useEditorAvatar(PARTIDA, otros, d.deps)).result;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("agrupación y emisión en vivo", () => {
  it("dos movimientos del mismo deslizador viajan como UN cambio y solo tras el intervalo", () => {
    const d = doble(null), r = montar(3, d);
    act(() => { r.current.aplicar(mor("altura", 0.2)); r.current.aplicar(mor("altura", 0.9)); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(d.emitidas.length).toBe(1);
    expect(d.emitidas[0]).toEqual([mor("altura", 0.9)]);
    act(() => { vi.advanceTimersByTime(600); });
    expect(d.emitidas.length).toBe(1);
  });
  it("sin nadie mirando no emite nada aunque haya cola", () => {
    const d = doble(null), r = montar(0, d);
    act(() => { r.current.aplicar(mor("altura", 0.4)); r.current.aplicar(mor("altura", 0.6)); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(d.emitidas.length).toBe(0);
  });
  it("claves distintas salen juntas en el mismo lote, en orden", () => {
    const d = doble(null), r = montar(1, d);
    act(() => { r.current.aplicar(mor("altura", 0.3)); r.current.aplicar({ op: "aura", campo: "intensidad", valor: 0.9 }); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(d.emitidas.length).toBe(1);
    expect(d.emitidas[0]).toHaveLength(2);
    expect(d.emitidas[0][0]).toEqual({ op: "morfologia", clave: "altura", valor: 0.3 });
    expect(d.emitidas[0][1]).toMatchObject({ op: "aura", campo: "intensidad" });
  });
});

describe("deshacer y rehacer", () => {
  it("deshacer devuelve el ADN anterior y rehacer lo repone", () => {
    const d = doble(null), r = montar(0, d);
    expect(r.current.puedeDeshacer).toBe(false);
    act(() => { r.current.aplicar(mor("altura", 0.1)); });
    expect(r.current.adn.morfologia.altura).toBeCloseTo(0.1);
    expect(r.current.puedeDeshacer).toBe(true);
    act(() => { r.current.deshacer(); });
    expect(r.current.adn.morfologia.altura).toBeUndefined();
    expect(r.current.puedeRehacer).toBe(true);
    act(() => { r.current.rehacer(); });
    expect(r.current.adn.morfologia.altura).toBeCloseTo(0.1);
  });
  it("la pila tiene un tope de 50: más allá de eso se pierde el principio", () => {
    const d = doble(null), r = montar(0, d);
    act(() => {
      for (let i = 1; i <= MAX_PASOS + 5; i++) r.current.aplicar(mor("altura", i / 120));
    });
    expect(r.current.adn.morfologia.altura).toBeCloseTo((MAX_PASOS + 5) / 120);
    for (let i = 0; i < MAX_PASOS; i++) act(() => { r.current.deshacer(); });
    expect(r.current.puedeDeshacer).toBe(false);
    // El paso 56 se cayó de la pila: el fondo es el estado tras el 5.º cambio, no la partida.
    expect(r.current.adn.morfologia.altura).toBeCloseTo(5 / 120);
    expect(r.current.adn.rev).toBe(5);
  });
});

describe("guardado", () => {
  it("no guarda antes de los 5 s de calma, y guarda al cumplirse", () => {
    const d = doble(null), r = montar(0, d);
    act(() => { r.current.aplicar(mor("altura", 0.7)); });
    act(() => { vi.advanceTimersByTime(4500); });
    expect(d.guardar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(d.guardar).toHaveBeenCalledTimes(1);
    expect(d.guardar.mock.calls[0][0].morfologia.altura).toBeCloseTo(0.7);
    expect(r.current.adn.rev).toBe(1);
  });
  it("entre guardados espera al menos 30 s aunque la calma ya esté", () => {
    const d = doble(null), r = montar(0, d);
    act(() => { r.current.aplicar(mor("altura", 0.2)); });
    act(() => { vi.advanceTimersByTime(5500); });
    expect(d.guardar).toHaveBeenCalledTimes(1);
    act(() => { r.current.aplicar(mor("altura", 0.4)); });
    act(() => { vi.advanceTimersByTime(5100); });
    expect(d.guardar).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(25000); });
    expect(d.guardar).toHaveBeenCalledTimes(2);
    expect(d.guardar.mock.calls[1][0].morfologia.altura).toBeCloseTo(0.4);
  });
  it("al cerrar el editor se guarda lo pendiente al instante", () => {
    const d = doble(null), r = montar(0, d);
    act(() => { r.current.aplicar(mor("altura", 0.8)); });
    act(() => { r.current.cerrar(); });
    expect(d.guardar).toHaveBeenCalledTimes(1);
  });
});

describe("dictado y Astraura", () => {
  it("lo que entiende el dictado se aplica sin red y sin Astraura", async () => {
    const astraura = vi.fn(async () => "[]");
    const d = doble(astraura), r = montar(0, d);
    await act(async () => { await r.current.dictar("pelo azul"); });
    expect(r.current.adn.materiales.cabello?.color).toBe("#007fff");
    expect(astraura).not.toHaveBeenCalled();
  });
  it("lo que no entiende va a Astraura y solo entran cambios válidos", async () => {
    const astraura = vi.fn(async () => 'Claro: [{"op":"expresion","clave":"happy","valor":1},{"op":"morfologia","clave":"alas","valor":1}]');
    const d = doble(astraura), r = montar(0, d);
    await act(async () => { await r.current.dictar("ponle alas de mariposa"); });
    expect(astraura).toHaveBeenCalledOnce();
    expect(r.current.adn.expresionBase.happy).toBe(1);
    expect(r.current.mensajeVoz).toMatch(/Astraura tradujo/);
  });
  it("sin modelo disponible lo dice y no aplica nada de lo pendiente", async () => {
    const d = doble(null), r = montar(0, d);
    await act(async () => { await r.current.dictar("ponle alas de mariposa"); });
    expect(r.current.mensajeVoz ?? "").toMatch(/no hay modelo/i);
    expect(r.current.adn.rev).toBe(0);
  });
  it("si Astraura no responde, lo pendiente queda sin aplicar y se dice", async () => {
    const d = doble(vi.fn(async () => { throw new Error("se cayó"); })), r = montar(0, d);
    await act(async () => { await r.current.dictar("ponle alas de mariposa"); });
    expect(r.current.mensajeVoz ?? "").toMatch(/no respondió/);
    expect(r.current.adn.rev).toBe(0);
  });
});

describe("puros del editor", () => {
  it("cambiosDeAstraura extrae la lista JSON y filtra lo inválido", () => {
    const cs = cambiosDeAstraura('Texto de más [{"op":"movimiento","campo":"energia","valor":1.4},{"op":"nadie"}]');
    expect(cs).toEqual([{ op: "movimiento", campo: "energia", valor: 1 }]);
    expect(cambiosDeAstraura("no trae lista")).toEqual([]);
    expect(cambiosDeAstraura("[{json roto]")).toEqual([]);
  });
  it("cambioDeCC mapea CC 20–27 por el mapa de la Protomolécula o el defecto", () => {
    expect(cambioDeCC(CC_DEFECTO, 20, 0)).toEqual({ op: "morfologia", clave: "altura", valor: 0 });
    expect(cambioDeCC(CC_DEFECTO, 27, 127)).toEqual({ op: "morfologia", clave: "estilizado", valor: 1 });
    expect(cambioDeCC({ 20: "cabeza" }, 20, 127)).toEqual({ op: "morfologia", clave: "cabeza", valor: 1 });
    expect(cambioDeCC(CC_DEFECTO, 7, 100)).toBeNull();
    expect(cambioDeCC(CC_DEFECTO, 20, Number.NaN)).toBeNull();
  });
});
