/**
 * Protomolécula · pruebas de la INTEGRACIÓN del panel (PM1010F1B, parte 3): las puras de
 * `vistas-vivas` y, en jsdom, el cable real — un átomo de F1C pinta su marco, su «cambio»
 * entra como `Operacion` con origen «mano» y el «exportar» ofrece «Descargar» con revoca.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SINTETIZADOR } from "@/lib/protomolecula/atomos/sintetizador";
import { crearControlador, type Controlador } from "@/lib/protomolecula/controlador";
import { limpiarRegistro, obtenerAtomo, registrarAtomo } from "@/lib/protomolecula/registro-atomos";
import type { AtomoEnUso, Molecula } from "@/lib/protomolecula/tipos";

import { PanelProtomolecula } from "../panel-protomolecula";
import { contenidoDe, tipoDeFormato, vistaViva } from "../vistas-vivas";

beforeAll(() => {
  // jsdom no trae ResizeObserver y Radix Slider lo pide
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

afterEach(() => { cleanup(); limpiarRegistro(); });
const activo = (id: string, herramientaId: string, titulo?: string): AtomoEnUso =>
  ({ id, herramientaId, estado: "activo", ...(titulo ? { titulo } : {}) });
const suspendido = (id: string, herramientaId: string): AtomoEnUso => ({ id, herramientaId, estado: "suspendido" });
const moléculaCon = (atomos: AtomoEnUso[], valores: Molecula["valores"] = {}): Molecula =>
  ({ id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos, valores, version: 0, creadaEn: 1, actualizadaEn: 1 });
const panelCon = (m: Molecula): Controlador => {
  let n = 0, t = 0;
  registrarAtomo(SINTETIZADOR); // como ya la habrá hecho la sesión o el montaje del panel
  const c = crearControlador({ molecula: m, rol: "dueno", ahora: () => ++t, nuevoId: () => `id-${++n}` });
  render(<PanelProtomolecula controlador={c} />);
  return c;
};

const marco = (): HTMLIFrameElement => {
  const el = document.querySelector("iframe");
  if (!el) throw new Error("No hay iframe del marco");
  return el as HTMLIFrameElement;
};
const TOKEN_RE = /([0-9a-f]{32})/;
const tokenDe = (m: HTMLIFrameElement): string | undefined => TOKEN_RE.exec(m.getAttribute("srcdoc") ?? "")?.[1];
const sinPostMessage = () => vi.spyOn(marco().contentWindow!, "postMessage").mockImplementation((() => {}) as unknown as Window["postMessage"]);
const desdeMarco = (datos: unknown, source: MessageEventSource | null = null): void => {
  window.dispatchEvent(new MessageEvent("message", { data: datos, origin: "null", source: source ?? (marco().contentWindow as MessageEventSource) }));
};
describe("vistas-vivas · funciones puras", () => {
  it("tipoDeFormato, contenidoDe y vistaViva: solo un átomo activo, registrado y con vista", () => {
    limpiarRegistro();
    registrarAtomo(SINTETIZADOR);
    registrarAtomo({ ...SINTETIZADOR, vista: undefined, herramientaId: "sin-vista-1" });
    expect(vistaViva(activo("a1", "sintetizador-web-audio", "Voz"))).toEqual({ atomoId: "a1", titulo: "Voz", def: SINTETIZADOR });
    expect([vistaViva(suspendido("a2", "sintetizador-web-audio")), vistaViva(activo("a3", "sin-vista-1")), vistaViva(activo("a4", "no-registrada"))]).toEqual([null, null, null]);
    expect(tipoDeFormato("wav")).toBe("audio/wav");
    expect(tipoDeFormato("JSON")).toBe("application/json");
    expect(tipoDeFormato("misterio")).toBe("application/octet-stream");
    expect(contenidoDe("hola")).toBe("hola");
    expect(contenidoDe({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
describe("panel · la vista de un átomo de F1C viva en el panel", () => {
  it("un átomo activo con vista pinta su marco: sin marcador y con sus valores", () => {
    panelCon(moléculaCon([activo("at-sint", SINTETIZADOR.herramientaId)], { "at-sint::frecuencia": 440 }));
    expect(document.querySelector('[aria-label="Vistas de las herramientas"]')).not.toBeNull();
    expect(obtenerAtomo(SINTETIZADOR.herramientaId)).toBeDefined(); // montar el panel registra los propios
    const srcDoc = marco().getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Sintetizador Web Audio");
    expect(srcDoc).not.toContain("__PM_CANAL__");
  });

  it("lo que se mueve DENTRO de la herramienta entra como exacta de «mano» ", () => {
    const c = panelCon(moléculaCon([activo("at-sint", SINTETIZADOR.herramientaId)], { "at-sint::frecuencia": 440 }));
    sinPostMessage();
    desdeMarco({ protomolecula: 1, tipo: "cambio", canal: tokenDe(marco()), parametroId: "frecuencia", valor: 880 });
    expect(c.obtener().molecula.valores["at-sint::frecuencia"]).toBe(880);
    expect(c.obtener().historial.hechos[0].operacion).toMatchObject({
      origen: "mano", autor: { tipo: "persona", id: "panel" }, accion: { tipo: "exacta", valor: 880 }, objetivo: { atomoId: "at-sint", parametroId: "frecuencia" },
    });
  });

  it("sin token o con otra source el cambio no se aplica", () => {
    const c = panelCon(moléculaCon([activo("at-sint", SINTETIZADOR.herramientaId)], { "at-sint::frecuencia": 440 }));
    desdeMarco({ protomolecula: 1, tipo: "cambio", canal: "canal-falso", parametroId: "frecuencia", valor: 880 });
    desdeMarco({ protomolecula: 1, tipo: "cambio", canal: tokenDe(marco()), parametroId: "frecuencia", valor: 880 }, window);
    expect(c.obtener().molecula.valores["at-sint::frecuencia"]).toBe(440);
    expect(c.obtener().historial.hechos).toHaveLength(0);
  });

  it("un átomo suspendido o sin vista no pinta marco", () => {
    panelCon(moléculaCon([suspendido("at-off", SINTETIZADOR.herramientaId)]));
    expect(document.querySelector('[aria-label="Vistas de las herramientas"]') && document.querySelector("iframe")).toBeNull();
    cleanup();
    registrarAtomo({ ...SINTETIZADOR, vista: undefined, herramientaId: "sin-vista-panel" });
    panelCon(moléculaCon([activo("a3", "sin-vista-panel")]));
    expect(document.querySelector('[aria-label="Vistas de las herramientas"]') && document.querySelector("iframe")).toBeNull();
  });
});
describe("panel · el enlace «Descargar» de un exportar real", () => {
  it("ofrece el Blob con el tipo del formato y revoca las URLs al desmontar", async () => {
    let objetos = 0;
    const revocadas: string[] = [];
    const crear = URL.createObjectURL;
    const laUrl = URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
    laUrl.createObjectURL = (b: Blob) => { void b; return `blob:prueba-${++objetos}`; };
    laUrl.revokeObjectURL = (u: string) => revocadas.push(u);
    panelCon(moléculaCon([activo("at-sint", SINTETIZADOR.herramientaId)], { "at-sint::volumen": -6 }));
    const exportar = (formato: string, datos: unknown) => desdeMarco({ protomolecula: 1, tipo: "exportar", canal: tokenDe(marco()), formato, datos });
    exportar("wav", { copias: 2 });
    expect(await screen.findByText("Descargar wav")).toBeDefined();
    const enlace = screen.getByText("Descargar wav") as HTMLAnchorElement;
    expect([enlace.getAttribute("href"), enlace.getAttribute("download")]).toEqual(["blob:prueba-1", "protomolecula.wav"]);
    exportar("json", { notas: [1, 2] });
    expect(await screen.findByText("Descargar json")).toBeDefined();
    cleanup();
    await waitFor(() => expect(revocadas).toEqual(["blob:prueba-1", "blob:prueba-2"]));
    laUrl.createObjectURL = crear;
  });
});
