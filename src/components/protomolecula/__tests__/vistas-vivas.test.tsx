/**
 * Protomolécula · VISTAS VIVAS de las herramientas en el panel (rescate RTGUI1021K2c-d3).
 * jsdom: lo que main tiene hoy es `PanelProtomolecula` + `MarcoAislado`; aquí se prueba el
 * cableado de la vista de un átomo dentro del panel (marco pintado, cambio desde la
 * herramienta, exportación), que ningún otro archivo cubre.
 */
import { act, cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SINTETIZADOR } from "@/lib/protomolecula/atomos/sintetizador";
import { crearControlador, type Controlador } from "@/lib/protomolecula/controlador";
import { limpiarRegistro, registrarAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

import { PanelProtomolecula } from "../panel-protomolecula";

const SIN_VISTA: DefinicionAtomo = { ...SINTETIZADOR, vista: undefined, herramientaId: "sin-vista-panel", nombre: "Sin vista" };

function molecula(par: Partial<Molecula> = {}): Molecula {
  return { id: "m1", titulo: "Molécula de prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1, ...par };
}

function conAtomo(herramientaId: string, valores: Record<string, number> = {}): Controlador {
  return crearControlador({
    molecula: molecula({ atomos: [{ id: "at-sint", herramientaId, estado: "activo" }], valores }),
    rol: "dueno",
    ahora: () => 1,
    nuevoId: () => "id-1",
  });
}

const marco = (): HTMLIFrameElement => {
  const el = document.querySelector("iframe");
  if (!el) throw new Error("No hay iframe");
  return el as HTMLIFrameElement;
};

const tokenDe = (m: HTMLIFrameElement): string => {
  const token = /([0-9a-f]{32})/.exec(m.getAttribute("srcdoc") ?? "")?.[1];
  if (!token) throw new Error("sin token en el srcdoc");
  return token;
};

const desdeMarco = (datos: Record<string, unknown>, source?: MessageEventSource): void => {
  window.dispatchEvent(new MessageEvent("message", { data: datos, origin: "null", source: source ?? (marco().contentWindow as MessageEventSource) }));
};

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

beforeEach(() => {
  limpiarRegistro();
  registrarAtomo(SINTETIZADOR);
  registrarAtomo(SIN_VISTA);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Vistas vivas de las herramientas en el panel", () => {
  it("un átomo activo con vista pinta su marco: sin marcador y con su título", () => {
    const c = conAtomo("sintetizador-web-audio", { "at-sint::frecuencia": 440 });
    render(<PanelProtomolecula controlador={c} />);
    const srcDoc = marco().getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Sintetizador Web Audio");
    expect(srcDoc).not.toContain("__PM_CANAL__");
    expect(srcDoc).toMatch(/([0-9a-f]{32})/);
  });

  it("un átomo de una herramienta sin vista no pinta marco", () => {
    const c = conAtomo("sin-vista-panel");
    render(<PanelProtomolecula controlador={c} />);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("lo que se mueve DENTRO de la herramienta entra como exacta de «mano»; sin token o con otra source, no", () => {
    const c = conAtomo("sintetizador-web-audio", { "at-sint::frecuencia": 440 });
    render(<PanelProtomolecula controlador={c} />);
    const token = tokenDe(marco());
    const cambio = (canal: string) => ({ protomolecula: 1, tipo: "cambio", canal, parametroId: "frecuencia", valor: 880 });
    act(() => {
      desdeMarco(cambio("canal-falso"));
      desdeMarco(cambio(token), window);
    });
    expect(c.obtener().molecula.valores["at-sint::frecuencia"]).toBe(440);
    expect(c.obtener().historial.hechos).toHaveLength(0);
    act(() => {
      desdeMarco(cambio(token));
    });
    expect(c.obtener().molecula.valores["at-sint::frecuencia"]).toBe(880);
    expect(c.obtener().historial.hechos[0].operacion).toMatchObject({
      origen: "mano",
      autor: { tipo: "persona", id: "panel" },
      accion: { tipo: "exacta", valor: 880 },
      objetivo: { atomoId: "at-sint", parametroId: "frecuencia" },
    });
  });

  it("exportar desde la herramienta ofrece el Blob con el tipo del formato y revoca la URL", () => {
    vi.useFakeTimers();
    const tipos: string[] = [];
    const revocar = vi.fn();
    const crearOriginal = URL.createObjectURL;
    const quitarOriginal = URL.revokeObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      tipos.push(blob.type);
      return "blob:prueba";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = revocar as unknown as typeof URL.revokeObjectURL;
    try {
      const c = conAtomo("sintetizador-web-audio", { "at-sint::frecuencia": 440 });
      render(<PanelProtomolecula controlador={c} />);
      const token = tokenDe(marco());
      act(() => {
        desdeMarco({ protomolecula: 1, tipo: "exportar", canal: token, formato: "wav", datos: { copias: 2 } });
      });
      expect(tipos).toEqual(["application/wav;charset=utf-8"]);
      vi.advanceTimersByTime(1000);
      expect(revocar).toHaveBeenCalledWith("blob:prueba");
    } finally {
      URL.createObjectURL = crearOriginal;
      URL.revokeObjectURL = quitarOriginal;
      vi.useRealTimers();
    }
  });
});
