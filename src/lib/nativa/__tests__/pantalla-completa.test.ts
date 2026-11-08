import { describe, expect, it, vi } from "vitest";
import { crearVigilante, decidirPantalla, elementoObsoleto, pedirEnPrimerGesto, type DocumentoMinimo } from "../pantalla-completa";

describe("decidirPantalla (PER1108A)", () => {
  it("en la app nativa se usa la pantalla completa de la VENTANA, nunca la de elemento", () => {
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: false, activo: true })).toBe("ventana-entrar");
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: true, activo: false })).toBe("ventana-salir");
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: false })).toBe("ventana-entrar");
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: true })).toBe("ventana-salir");
  });
  it("en la app nativa, si hay un elemento a pantalla completa (restaurado), primero se sale", () => {
    expect(decidirPantalla({ nativa: true, elementoCompleto: true, ventanaCompleta: false, activo: true })).toBe("elemento-salir");
    expect(decidirPantalla({ nativa: true, elementoCompleto: true, ventanaCompleta: false })).toBe("elemento-salir");
  });
  it("no repite lo que ya está", () => {
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: true, activo: true })).toBe("nada");
    expect(decidirPantalla({ nativa: true, elementoCompleto: false, ventanaCompleta: false, activo: false })).toBe("nada");
  });
  it("en la web normal sigue la API de elemento", () => {
    expect(decidirPantalla({ nativa: false, elementoCompleto: false, ventanaCompleta: false, activo: true })).toBe("elemento-entrar");
    expect(decidirPantalla({ nativa: false, elementoCompleto: true, ventanaCompleta: false })).toBe("elemento-salir");
    expect(decidirPantalla({ nativa: false, elementoCompleto: true, ventanaCompleta: false, activo: true })).toBe("nada");
  });
});

describe("pedirEnPrimerGesto", () => {
  const base = { nativa: false, iframe: false, instalada: false, yaIntentado: false, elementoCompleto: false };
  it("en la web, el primer gesto la pide una vez", () => {
    expect(pedirEnPrimerGesto(base)).toBe(true);
    expect(pedirEnPrimerGesto({ ...base, yaIntentado: true })).toBe(false);
    expect(pedirEnPrimerGesto({ ...base, iframe: true })).toBe(false);
    expect(pedirEnPrimerGesto({ ...base, instalada: true })).toBe(false);
  });
  it("en la app nativa NUNCA (fue la causa del congelado del 08-11)", () => {
    expect(pedirEnPrimerGesto({ ...base, nativa: true })).toBe(false);
  });
});

describe("elementoObsoleto", () => {
  it("solo si ya no está en el documento", () => {
    expect(elementoObsoleto({ isConnected: false })).toBe(true);
    expect(elementoObsoleto({ isConnected: true })).toBe(false);
    expect(elementoObsoleto(null)).toBe(false);
  });
});

function entorno(fs: ({ isConnected?: boolean } & object) | null, visibilidad = "visible") {
  const oyentes = new Map<string, Array<() => void>>();
  const oyentesV = new Map<string, Array<() => void>>();
  const salir = vi.fn(() => {
    doc.fullscreenElement = null;
  });
  const reg = (m: Map<string, Array<() => void>>) => ({
    addEventListener: (t: string, f: () => void) => void m.set(t, [...(m.get(t) ?? []), f]),
    removeEventListener: (t: string, f: () => void) => void m.set(t, (m.get(t) ?? []).filter((x) => x !== f)),
  });
  const doc: DocumentoMinimo = { fullscreenElement: fs, visibilityState: visibilidad, exitFullscreen: salir, ...reg(oyentes) };
  const ventana = reg(oyentesV);
  const emitir = (t: string, v = false) => (v ? oyentesV : oyentes).get(t)?.forEach((f) => f());
  return { doc, ventana, salir, emitir };
}

describe("crearVigilante", () => {
  it("la app nativa que abre con un elemento a pantalla completa restaurado sale al arrancar", () => {
    const e = entorno({ isConnected: true });
    const registro = vi.fn();
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: true, registrar: registro });
    expect(e.salir).toHaveBeenCalledTimes(1);
    expect(registro.mock.calls[0][0]).toContain("restaurado");
  });
  it("la web normal no toca una pantalla completa que ya había (la puso la persona)", () => {
    const e = entorno({ isConnected: true });
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: false });
    expect(e.salir).not.toHaveBeenCalled();
  });
  it("al ocultarse la página sale de la pantalla completa de elemento", () => {
    const e = entorno({ isConnected: true });
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: false });
    (e.doc as { visibilityState: string }).visibilityState = "hidden";
    e.emitir("visibilitychange");
    expect(e.salir).toHaveBeenCalledTimes(1);
  });
  it("al descargarse (pagehide / beforeunload) sale", () => {
    const e = entorno({ isConnected: true });
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: false });
    e.emitir("pagehide", true);
    expect(e.salir).toHaveBeenCalledTimes(1);
    e.doc.fullscreenElement = { isConnected: true };
    e.emitir("beforeunload", true);
    expect(e.salir).toHaveBeenCalledTimes(2);
  });
  it("un elemento obsoleto (ya fuera del documento) se suelta", () => {
    const e = entorno({ isConnected: true });
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: false });
    e.doc.fullscreenElement = { isConnected: false };
    e.emitir("fullscreenchange");
    expect(e.salir).toHaveBeenCalledTimes(1);
  });
  it("un elemento a la vista y conectado (modo presentador) no se toca", () => {
    const e = entorno(null);
    crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: true });
    e.doc.fullscreenElement = { isConnected: true };
    e.emitir("fullscreenchange");
    expect(e.salir).not.toHaveBeenCalled();
  });
  it("el repaso periódico de la nativa suelta lo obsoleto, y al desmontar se limpia", () => {
    const e = entorno(null);
    let f: (() => void) | null = null;
    const limpiar = vi.fn();
    const quitar = crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: true, cadaMs: 4000, temporizador: { set: (g) => ((f = g), 7), clear: limpiar } });
    e.doc.fullscreenElement = { isConnected: false };
    f!();
    expect(e.salir).toHaveBeenCalledTimes(1);
    quitar();
    expect(limpiar).toHaveBeenCalledWith(7);
  });
  it("nunca lanza aunque exitFullscreen falle", () => {
    const e = entorno({ isConnected: true });
    e.doc.exitFullscreen = () => {
      throw new Error("no");
    };
    expect(() => crearVigilante({ doc: e.doc, ventana: e.ventana, nativa: true })).not.toThrow();
  });
});
