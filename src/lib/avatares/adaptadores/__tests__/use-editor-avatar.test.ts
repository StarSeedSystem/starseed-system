// @vitest-environment jsdom
/**
 * Editor del avatar en tiempo real (AV1011B). Reloj falso, sin red, sin disco:
 * el guardado, el envío y Astraura son dobles inyectados.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adnPorDefecto } from "../../adn/adn";
import type { CambioAvatar } from "../../adn/cambios";
import {
  cambioMidi, cambiosDeJsonAstraura, crearEditorAvatar, peticionCambiosAstraura,
  useEditorAvatar, type DependenciasEditor,
} from "../use-editor-avatar";

const base = () => adnPorDefecto("adn-1", "Ava", { tipo: "perfil", id: "p1" });
const morfologia = (clave: "altura" | "hombros" | "brazos", valor: number): CambioAvatar => ({ op: "morfologia", clave, valor });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("crearEditorAvatar · agrupación y emisión", () => {
  it("agrupa por clave: mover un deslizador tres veces viaja como un solo cambio", () => {
    const emitidos: CambioAvatar[][] = [];
    const ed = crearEditorAvatar({
      adn: base(), guardar: vi.fn(), emitir: (cs) => emitidos.push([...cs]), otrosPresentes: () => 2,
    });
    ed.aplicar(morfologia("altura", 0.6), 1_000);
    ed.aplicar(morfologia("altura", 0.7), 1_010);
    ed.aplicar(morfologia("altura", 0.8), 1_020);
    expect(ed.estado().adn.morfologia.altura).toBe(0.8);
    ed.latido(1_000);
    expect(emitidos).toEqual([[{ op: "morfologia", clave: "altura", valor: 0.8 }]]);
  });

  it("respeta el ritmo de 10 Hz y no repite el mismo lote antes de tiempo", () => {
    const emitidos: CambioAvatar[][] = [];
    const ed = crearEditorAvatar({
      adn: base(), guardar: vi.fn(), emitir: (cs) => emitidos.push([...cs]), otrosPresentes: () => 2,
    });
    ed.aplicar(morfologia("altura", 0.6), 1_000);
    ed.latido(1_000);
    ed.aplicar(morfologia("altura", 0.7), 1_050);
    ed.latido(1_050);
    expect(emitidos).toHaveLength(1);
    ed.latido(1_100);
    expect(emitidos).toHaveLength(2);
    expect(emitidos[1]).toEqual([{ op: "morfologia", clave: "altura", valor: 0.7 }]);
  });

  it("sin nadie mirando no emite nada y la cola se descarta", () => {
    const emitir = vi.fn();
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn(), emitir, otrosPresentes: () => 0 });
    ed.aplicar(morfologia("altura", 0.9), 1_000);
    ed.latido(1_000);
    ed.latido(2_000);
    expect(emitir).not.toHaveBeenCalled();
  });
});

describe("crearEditorAvatar · deshacer y rehacer", () => {
  it("deshace y rehace manteniendo la revisión siempre hacia arriba", () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn() });
    ed.aplicar(morfologia("altura", 0.6), 1_000);
    ed.aplicar(morfologia("hombros", 0.7), 1_010);
    const rev = ed.estado().adn.rev;
    expect(ed.deshacer(1_020)).toBe(true);
    expect(ed.estado().adn.morfologia.hombros).toBeUndefined();
    expect(ed.estado().adn.morfologia.altura).toBe(0.6);
    expect(ed.estado().adn.rev).toBeGreaterThan(rev);
    expect(ed.rehacer(1_030)).toBe(true);
    expect(ed.estado().adn.morfologia.hombros).toBe(0.7);
  });

  it("la pila guarda como mucho 50 pasos", () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn() });
    for (let i = 1; i <= 60; i++) ed.aplicar(morfologia("altura", i / 100), 1_000 + i);
    expect(ed.estado().deshacer).toHaveLength(50);
  });

  it("un cambio inválido no ensucia la pila", () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn() });
    const antes = ed.estado().adn;
    ed.aplicar({ op: "morfologia", clave: "altura", valor: Number.NaN });
    expect(ed.estado().adn).toBe(antes);
    expect(ed.estado().deshacer).toHaveLength(0);
  });
});

describe("crearEditorAvatar · cuándo guarda", () => {
  it("espera 5 s de calma y deja pasar 30 s entre guardados", async () => {
    const guardar = vi.fn(async () => {});
    const ed = crearEditorAvatar({ adn: base(), guardar });
    ed.aplicar(morfologia("altura", 0.6), 10_000);
    ed.latido(14_999);
    expect(guardar).not.toHaveBeenCalled();
    ed.latido(15_000);
    await Promise.resolve();
    expect(guardar).toHaveBeenCalledTimes(1);
    ed.aplicar(morfologia("altura", 0.7), 20_000);
    ed.latido(25_000);
    await Promise.resolve();
    expect(guardar).toHaveBeenCalledTimes(1);
    ed.latido(45_000);
    await Promise.resolve();
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  it("al cerrar guarda sin esperar la calma", async () => {
    const guardar = vi.fn(async () => {});
    const ed = crearEditorAvatar({ adn: base(), guardar });
    ed.aplicar(morfologia("altura", 0.6), 10_000);
    await ed.cerrar(10_001);
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it("si el almacén falla, lo dice y no finge que guardó", async () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: async () => { throw new Error("lleno"); } });
    ed.aplicar(morfologia("altura", 0.6), 10_000);
    ed.latido(15_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(ed.estado().sinGuardar).toBe(true);
    expect(ed.estado().aviso).toMatch(/lleno/);
  });
});

describe("crearEditorAvatar · voz y Astraura", () => {
  it("lo entendido se aplica al instante; lo demás va a Astraura y se filtra con sanearCambio", async () => {
    const instrucciones: string[] = [];
    const ed = crearEditorAvatar({
      adn: base(), guardar: vi.fn(),
      preguntarAstraura: async (i) => {
        instrucciones.push(i);
        return '```json\n[{"op":"pieza","slot":"espalda","ref":"biblioteca:avatares/alas"},{"op":"morfologia","clave":"altura","valor":9}]\n```';
      },
    });
    const r = await ed.voz("pelo azul y ponle alas de mariposa");
    expect(r.sinEntender).toEqual(["ponle alas de mariposa"]);
    expect(ed.estado().adn.materiales.cabello?.color).toBe("#007fff");
    expect(ed.estado().adn.piezas.find((p) => p.slot === "espalda")?.ref).toBe("biblioteca:avatares/alas");
    expect(ed.estado().adn.morfologia.altura).toBe(1);
    expect(instrucciones[0]).toMatch(/SOLO una lista JSON/);
  });

  it("si no hay modelo disponible, se dice en vez de inventar cambios", async () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn(), preguntarAstraura: async () => null });
    const r = await ed.voz("ponle alas de mariposa");
    expect(r.aplicados).toBe(0);
    expect(r.aviso).toMatch(/no respondió/);
    expect(ed.estado().adn.piezas).toHaveLength(0);
  });

  it("sin función de Astraura también lo dice y aplica lo que el dictado sí entendió", async () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn() });
    const r = await ed.voz("ojos verdes y alas de mariposa");
    expect(ed.estado().adn.materiales.ojos?.color).toBe("#10b981");
    expect(r.aviso).toMatch(/no está disponible/);
  });
});

describe("MIDI y respuestas JSON", () => {
  it("el mapeo de la Protomolécula manda sobre el deslizador elegido", () => {
    expect(cambioMidi(1, 127, "altura")).toEqual({ op: "morfologia", clave: "altura", valor: 1 });
    expect(cambioMidi(1, 64, "altura", { 1: "cabeza" })).toEqual({ op: "morfologia", clave: "cabeza", valor: 64 / 127 });
    expect(cambioMidi(-1, 64, "altura")).toBeNull();
  });

  it("un CC mueve el deslizador y el resultado se ve al instante", () => {
    const ed = crearEditorAvatar({ adn: base(), guardar: vi.fn() });
    ed.fijarDeslizador("brazos");
    expect(ed.aplicarMidi(7, 127, 1_000)).toBe(true);
    expect(ed.estado().adn.morfologia.brazos).toBe(1);
    expect(ed.estado().deslizador).toBe("brazos");
  });

  it("acepta lista, objeto con cambios y descarta lo que no pasa sanearCambio", () => {
    expect(cambiosDeJsonAstraura('[{"op":"visibilidad","valor":"publico"}]')).toEqual([{ op: "visibilidad", valor: "publico" }]);
    expect(cambiosDeJsonAstraura('{"cambios":[{"op":"nombre","valor":"Luna"}]}')).toEqual([{ op: "nombre", valor: "Luna" }]);
    expect(cambiosDeJsonAstraura('texto [{"op":"nada"}] más texto')).toEqual([]);
  });

  it("la instrucción pide solo JSON y prohíbe URLs externas", () => {
    const p = peticionCambiosAstraura(["ponle alas"], base());
    expect(p).toMatch(/SOLO una lista JSON/);
    expect(p).toMatch(/biblioteca:/);
    expect(p).toMatch(/Nunca inventes una URL externa/);
  });
});

describe("useEditorAvatar · reloj falso", () => {
  it("aplica al instante, guarda tras 5 s y no emite si no hay nadie", async () => {
    const guardar = vi.fn(async () => {});
    const emitir = vi.fn();
    const deps: DependenciasEditor = { guardar, emitir, otrosPresentes: () => 0 };
    const { result, unmount } = renderHook(() => useEditorAvatar(base(), deps));
    act(() => { result.current.aplicar(morfologia("altura", 0.9)); });
    expect(result.current.adn.morfologia.altura).toBe(0.9);
    expect(result.current.sinGuardar).toBe(true);
    await act(async () => { vi.advanceTimersByTime(5_000); await Promise.resolve(); });
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(emitir).not.toHaveBeenCalled();
    act(() => { unmount(); });
  });
});
