// @vitest-environment jsdom
/**
 * AV1011B · Pruebas del hook `useEditorAvatar` del editor en tiempo real.
 * Reloj falso: agrupación de emisión, tope de Hz, deshacer/rehacer (tope 50),
 * cuándo toca guardar (5 s de calma, 1 cada 30 s) y «sin nadie mirando no emite».
 * Sin red ni disco: `emitir` y `guardar` son dobles inyectados.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "../../adn/adn";
import type { CambioAvatar } from "../../adn/cambios";
import { cambiosDeModelo, instruccionAstraura, useEditorAvatar } from "../use-editor-avatar";

const dueno = { tipo: "perfil" as const, id: "p1" };
const base = (): AdnAvatar => adnPorDefecto("adn-1", "Prueba", dueno);
const alt = (n: number): CambioAvatar => ({ op: "morfologia", clave: "altura", valor: n });

function montar(otros = 0) {
  const emitir = vi.fn();
  const guardar = vi.fn((_adn: AdnAvatar) => Promise.resolve());
  const h = renderHook((p: { otros: number }) => useEditorAvatar({ adn: base(), otrosPresentes: p.otros, emitir, guardar }), {
    initialProps: { otros },
  });
  const aplicar = (c: CambioAvatar | CambioAvatar[]) => act(() => { h.result.current.aplicar(c); });
  return { ...h, emitir, guardar, aplicar };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("aplicar al instante", () => {
  it("un deslizador se ve en el ADN en el acto, sin esperar nada", () => {
    const r = montar(0);
    r.aplicar(alt(0.9));
    expect(r.result.current.adn.morfologia.altura).toBe(0.9);
    expect(r.result.current.puedeDeshacer).toBe(true);
  });
  it("un cambio que no se entiende no toca nada ni apila historial", () => {
    const r = montar(0);
    r.aplicar({ op: "morfologia", clave: "altura", valor: Number.NaN });
    expect(r.result.current.adn.rev).toBe(0);
    expect(r.result.current.puedeDeshacer).toBe(false);
  });
});

describe("emisión a los demás presentes", () => {
  it("mover un deslizador 60 veces viaja como UN solo cambio (agrupación por clave)", () => {
    const r = montar(2);
    r.aplicar(Array.from({ length: 60 }, (_, i) => alt(i / 100)));
    act(() => { vi.advanceTimersByTime(200); });
    expect(r.emitir).toHaveBeenCalledTimes(1);
    const lote = r.emitir.mock.calls[0][0] as CambioAvatar[];
    expect(lote).toHaveLength(1);
    expect(lote[0]).toMatchObject({ op: "morfologia", clave: "altura", valor: 0.59 });
  });
  it("respeta el tope de 10 Hz con poca gente", () => {
    const r = montar(1);
    r.aplicar(alt(0.2));
    act(() => { vi.advanceTimersByTime(60); });
    expect(r.emitir).toHaveBeenCalledTimes(1); // el primer envío puede salir ya
    r.aplicar(alt(0.3));
    act(() => { vi.advanceTimersByTime(60); }); // t = 120 ms: solo 60 ms desde el último
    expect(r.emitir).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(60); }); // t = 180 ms: ya pasan los 100 ms
    expect(r.emitir).toHaveBeenCalledTimes(2);
  });
  it("sin nadie mirando NO emite nada, por mucho que avance el tiempo", () => {
    const r = montar(0);
    r.aplicar(alt(0.5));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(r.emitir).not.toHaveBeenCalled();
  });
});

describe("deshacer y rehacer", () => {
  it("desmonta hasta el original y rehace en orden", () => {
    const r = montar(0);
    r.aplicar(alt(0.2));
    r.aplicar(alt(0.8));
    act(() => { r.result.current.deshacer(); r.result.current.deshacer(); });
    const d = r.result.current;
    expect(d.adn.rev).toBe(0);
    expect(d.puedeDeshacer).toBe(false);
    expect(d.puedeRehacer).toBe(true);
    act(() => { d.rehacer(); });
    expect(r.result.current.adn.morfologia.altura).toBe(0.2);
  });
  it("la pila tiene tope 50: después de 55 cambios solo deshace 50", () => {
    const r = montar(0);
    r.aplicar(Array.from({ length: 55 }, (_, i) => alt(i * 0.01)));
    act(() => { for (let i = 0; i < 55; i++) r.result.current.deshacer(); });
    expect(r.result.current.adn.rev).toBe(0); // volvió al original (50 atrás)
    expect(r.result.current.puedeDeshacer).toBe(false);
  });
});

describe("cuándo guarda", () => {
  it("guarda tras 5 s de calma y como mucho una vez cada 30 s", async () => {
    const r = montar(0);
    r.aplicar(alt(0.7));
    await act(async () => { vi.advanceTimersByTime(6_000); });
    expect(r.guardar).toHaveBeenCalledTimes(1);
    r.aplicar(alt(0.7));
    await act(async () => { vi.advanceTimersByTime(24_000); });
    expect(r.guardar).toHaveBeenCalledTimes(1); // 30 s aún no pasan del último guardado
    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(r.guardar).toHaveBeenCalledTimes(2);
  });
  it("guardarAhora (al cerrar) guarda aunque no haya calma", async () => {
    const r = montar(0);
    r.aplicar(alt(0.7));
    await act(async () => { await r.result.current.guardarAhora(); });
    expect(r.guardar).toHaveBeenCalledTimes(1);
    const guardado = r.guardar.mock.calls[0]?.[0] as AdnAvatar | undefined;
    expect(guardado?.morfologia.altura).toBe(0.7);
  });
  it("un guardado que falla se enseña, no se silencia", async () => {
    const guardar = vi.fn(async () => { throw new Error("almacenamiento lleno"); });
    const h = renderHook(() => useEditorAvatar({ adn: base(), otrosPresentes: 0, emitir: vi.fn(), guardar }));
    await act(async () => { await h.result.current.guardarAhora(); });
    expect(h.result.current.errorGuardado).toMatch(/llen/);
  });
});

describe("traducción con Astraura", () => {
  it("filtra la respuesta cruda del modelo con sanearCambio", () => {
    expect(cambiosDeModelo('[{"op":"morfologia","clave":"altura","valor":1.3},{"op":"no-existe"},1,"x"]')).toEqual([{ op: "morfologia", clave: "altura", valor: 1 }]);
  });
  it("una respuesta que no es JSON da la lista vacía", () => expect(cambiosDeModelo("no soy json")).toEqual([]));
  it("la instrucción SOLO pide una lista JSON de CambioAvatar y lleva la petición", () => {
    const i = instruccionAstraura("ponle alas de mariposa");
    expect(i).toMatch(/array JSON/i);
    expect(i).toContain("morfologia");
    expect(i).toContain("alas de mariposa");
  });
});
