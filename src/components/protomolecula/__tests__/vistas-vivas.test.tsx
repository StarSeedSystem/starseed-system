/**
 * Protomolécula · VISTAS VIVAS EN EL PANEL (rescate de la rama nube/40680984048).
 * Lo que la rama probó con sus ayudantes (`vistaViva`, `tipoDeFormato`,
 * `contenidoDe`) no existe en main: aquí se adapta lo que SÍ hay — el panel
 * une `MarcoAislado` con el controlador, así que lo que se mueve DENTRO de la
 * herramienta entra en la molécula como operacion exacta de «mano», con token
 * y source verificados por el marco aislado (ese trato fin lo prueba
 * `marco-aislado.test.tsx`; aquí va la unión completa).
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";

import { crearControlador, type Controlador } from "@/lib/protomolecula/controlador";
import { limpiarRegistro, registrarAtomo } from "@/lib/protomolecula/registro-atomos";
import { SINTETIZADOR } from "@/lib/protomolecula/atomos/sintetizador";
import type { Molecula } from "@/lib/protomolecula/tipos";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

import { PanelProtomolecula } from "../panel-protomolecula";

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom no trae ResizeObserver y Radix Slider lo pide
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(cleanup);

describe("Vistas vivas en el panel", () => {
  beforeEach(() => {
    limpiarRegistro();
    expect(registrarAtomo(SINTETIZADOR)).toEqual({ ok: true });
  });

  /** Un controlador como los del panel: molécula personal con el dueño operando. */
  function controlador(par: Partial<Molecula> = {}): Controlador {
    let n = 0;
    let t = 0;
    return crearControlador({
      molecula: { id: "m1", titulo: "Viva", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1, ...par },
      rol: "dueno",
      ahora: () => ++t,
      nuevoId: () => `id-${++n}`,
    });
  }

  function panelCon(par: Partial<Molecula> = {}): Controlador {
    const c = controlador(par);
    const r = c.anadirAtomo(SINTETIZADOR.herramientaId);
    if (!r.ok) throw new Error(r.motivo);
    render(<PanelProtomolecula controlador={c} />);
    return c;
  }

  /** El marco del panel: el único iframe con vista de documento. */
  function marcos(): { marco: HTMLIFrameElement; token: string; ventana: Window } {
    const marco = document.querySelector("iframe");
    if (!marco) throw new Error("El panel no pintó ningún marco");
    const srcDoc = marco.getAttribute("srcdoc") ?? "";
    const token = /([0-9a-f]{32})/.exec(srcDoc)?.[1];
    if (!token) throw new Error(`sin token en: ${srcDoc.slice(0, 120)}…`);
    const ventana = marco.contentWindow;
    if (!ventana) throw new Error("El marco no tiene contentWindow");
    return { marco, token, ventana };
  }

  const envie = (ventana: Window, datos: Record<string, unknown>, source?: Window): void => {
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: datos, origin: "null", source: (source ?? ventana) as unknown as MessageEventSource,
      }));
    });
  };

  it("un átomo con vista pinta su marco dentro del panel: su documento real, sin el marcador de canal", () => {
    panelCon();
    const { marco } = marcos();
    const srcDoc = marco.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Sintetizador Web Audio");
    expect(srcDoc).not.toContain("__PM_CANAL__");
  });

  it("lo que se mueve DENTRO de la herramienta entra en la molécula como exacta de «mano»", () => {
    const c = panelCon();
    const atomoId = c.obtener().molecula.atomos[0].id;
    const { token, ventana } = marcos();
    envie(ventana, { protomolecula: 1, tipo: "cambio", canal: token, parametroId: "frecuencia", valor: 880 });
    expect(c.obtener().molecula.valores[`${atomoId}::frecuencia`]).toBe(880);
    expect(c.obtener().historial.hechos[0].operacion).toMatchObject({
      origen: "mano", autor: { tipo: "persona", id: "panel" },
      accion: { tipo: "exacta", valor: 880 }, objetivo: { atomoId, parametroId: "frecuencia" },
    });
  });

  it("sin canal ni source del marco, el panel no mueve nada", () => {
    const c = panelCon();
    const { token, ventana } = marcos();
    envie(ventana, { protomolecula: 1, tipo: "cambio", canal: token, parametroId: "frecuencia", valor: 880 }, window);
    envie(ventana, { protomolecula: 1, tipo: "cambio", canal: "canal-falso", parametroId: "frecuencia", valor: 880 });
    expect(c.obtener().molecula.valores).toEqual({});
    expect(c.obtener().historial.hechos).toHaveLength(0);
  });

  it("una herramienta sin vista no pinta marco en el panel", () => {
    const SIN_VISTA: DefinicionAtomo = { ...SINTETIZADOR, vista: undefined, herramientaId: "sin-vista-viva" };
    expect(registrarAtomo(SIN_VISTA)).toEqual({ ok: true });
    const c = controlador();
    const añadido = c.anadirAtomo("sin-vista-viva");
    if (!añadido.ok) throw new Error(añadido.motivo);
    render(<PanelProtomolecula controlador={c} />);
    expect(document.querySelector("iframe")).toBeNull();
    // el átomo sí está en el panel: solo el marco y su función de vista quedan fuera
    expect(screen.getByRole("combobox", { name: "Onda" })).toBeInTheDocument();
  });
});
