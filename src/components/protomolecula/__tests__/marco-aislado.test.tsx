import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { registrarAtomosPropios, VISTAS_COMPONENTE } from "@/lib/protomolecula/atomos";
import { crearControlador } from "@/lib/protomolecula/controlador";
import { VERSION_PUENTE } from "@/lib/protomolecula/puente-herramientas";
import { limpiarRegistro, type DefinicionAtomo, type VistaProps } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores } from "@/lib/protomolecula/tipos";

import { MarcoAislado } from "../marco-aislado";
import { PanelProtomolecula } from "../panel-protomolecula";

const DOC: DefinicionAtomo = {
  herramientaId: "doc-prueba",
  nombre: "Doc de prueba",
  categoria: "audio",
  integracion: "iframe-aislado",
  control: "total",
  parametros: [{ id: "volumen", nombre: "Volumen", tipo: "numero", min: 0, max: 1 }],
  entradas: [],
  salidas: [],
  vista: { tipo: "documento", documento: () => '<p id="canal">__PM_CANAL__</p>' },
};
const EXTERNA = (url: string): DefinicionAtomo => ({ ...DOC, herramientaId: "externa", nombre: "App externa", vista: { tipo: "externa", url } });
const pintar = (def: DefinicionAtomo, valores: EstadoValores = { volumen: 0.2 }, alCambio = vi.fn()) =>
  render(<MarcoAislado definicion={def} atomoId="a1" valores={valores} alCambio={alCambio} />);
const marco = () => screen.getByTitle("Doc de prueba") as HTMLIFrameElement;
const token = () => /id="canal">([^<]+)</.exec(marco().getAttribute("srcdoc") ?? "")?.[1] ?? "";
const evento = (canal: string, source: Window = marco().contentWindow!, origin = "null") =>
  new MessageEvent("message", { data: { protomolecula: VERSION_PUENTE, tipo: "cambio", canal, parametroId: "volumen", valor: 0.9 }, source, origin });

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});
beforeEach(() => limpiarRegistro());
afterEach(() => { cleanup(); delete VISTAS_COMPONENTE["vista-prueba"]; });

describe("MarcoAislado · documento", () => {
  it("usa sandbox allow-scripts, nunca allow-same-origin", () => {
    pintar(DOC);
    const iframe = marco();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("sustituye el marcador __PM_CANAL__ por un token nuevo", () => {
    pintar(DOC);
    expect(marco().getAttribute("srcdoc")).not.toContain("__PM_CANAL__");
    expect(token()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("un message del contentWindow con el token llama a alCambio", () => {
    const alCambio = vi.fn();
    pintar(DOC, { volumen: 0.2 }, alCambio);
    act(() => { window.dispatchEvent(evento(token())); });
    expect(alCambio).toHaveBeenCalledWith("volumen", 0.9);
  });

  it("sin token correcto no llama; de otra ventana tampoco", () => {
    const alCambio = vi.fn();
    pintar(DOC, { volumen: 0.2 }, alCambio);
    act(() => { window.dispatchEvent(evento("00")); window.dispatchEvent(evento(token(), window)); });
    expect(alCambio).not.toHaveBeenCalled();
  });

  it("manda establecer solo de lo que cambió", () => {
    const { rerender } = pintar(DOC, { volumen: 0.2, corte: 100 });
    const postMessage = vi.fn();
    Object.defineProperty(marco().contentWindow!, "postMessage", { value: postMessage, configurable: true });
    rerender(<MarcoAislado definicion={DOC} atomoId="a1" valores={{ volumen: 0.8, corte: 100 }} alCambio={vi.fn()} />);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toMatchObject({ tipo: "establecer", parametroId: "volumen", valor: 0.8 });
  });
});

describe("MarcoAislado · externa y componente", () => {
  it("una app http no se embebe: tarjeta con el motivo y enlace", () => {
    pintar(EXTERNA("http://ejemplo.com/app"));
    expect(screen.queryByTitle("App externa")).toBeNull();
    expect(screen.getByText(/Solo https/)).toBeDefined();
    expect(screen.getByRole("link", { name: /Abrir/ }).getAttribute("href")).toBe("http://ejemplo.com/app");
  });

  it("un componente desconocido lo dice", () => {
    pintar({ ...DOC, vista: { tipo: "componente", id: "no-existe" } });
    expect(screen.getByText("Esta herramienta aún no tiene vista.")).toBeDefined();
  });

  it("un componente registrado se carga en diferido", async () => {
    VISTAS_COMPONENTE["vista-prueba"] = async () => ({ default: ({ valores }: VistaProps) => <p>valor {String(valores.volumen)}</p> });
    pintar({ ...DOC, vista: { tipo: "componente", id: "vista-prueba" } });
    expect(await screen.findByText("valor 0.2")).toBeDefined();
  });
});

describe("MarcoAislado · integración con el panel", () => {
  it("el panel ya pinta el marco del sintetizador propio", () => {
    registrarAtomosPropios();
    const ctl = crearControlador({ molecula: { id: "m", titulo: "M", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1 }, rol: "dueno", ahora: Date.now, nuevoId: () => "id-1" });
    ctl.anadirAtomo("sintetizador-web-audio");
    render(<PanelProtomolecula controlador={ctl} />);
    expect((screen.getByTitle("Sintetizador Web Audio") as HTMLIFrameElement).getAttribute("sandbox")).toBe("allow-scripts");
  });
});
