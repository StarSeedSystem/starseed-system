import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { registrarAtomosPropios } from "@/lib/protomolecula/atomos";
import { crearControlador } from "@/lib/protomolecula/controlador";
import { limpiarRegistro, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { EstadoValores, Molecula } from "@/lib/protomolecula/tipos";
import { MarcoAislado } from "../marco-aislado";
import { PanelProtomolecula } from "../panel-protomolecula";

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => limpiarRegistro());
afterEach(cleanup);

const DEF: DefinicionAtomo = {
  herramientaId: "prueba-marco", nombre: "Herramienta de prueba", categoria: "audio",
  integracion: "iframe-aislado", control: "total", entradas: [], salidas: [],
  parametros: [
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, paso: 0.5, unidad: "dB", defecto: -12 },
    { id: "frecuencia", nombre: "Frecuencia", tipo: "numero", min: 20, max: 20000, paso: 1, unidad: "Hz", defecto: 440 },
  ],
  vista: { tipo: "documento", documento: () => "<p>canal: __PM_CANAL__</p>" },
};
const iframe = () => screen.getByTitle("Herramienta de prueba") as HTMLIFrameElement;
const canal = (el: HTMLIFrameElement) => el.getAttribute("data-pm-canal") ?? "";

function hablar(el: HTMLIFrameElement, data: unknown, source?: unknown) {
  act(() => { window.dispatchEvent(new MessageEvent("message", { data, origin: "null", source: (source === undefined ? el.contentWindow : source) as MessageEventSource })); });
}
const cambio = (el: HTMLIFrameElement, valor = -6, token = canal(el)) => ({ protomolecula: 1, tipo: "cambio", canal: token, parametroId: "volumen", valor });
function montar(def: DefinicionAtomo = DEF, valores: EstadoValores = {}, alCambio = vi.fn(), extras: { alExportar?: () => void; alDeclarar?: () => void } = {}) {
  render(<MarcoAislado definicion={def} atomoId="a1" valores={valores} alCambio={alCambio} {...extras} />);
  return alCambio;
}
describe("MarcoAislado · documento propio", () => {
  it("usa sandbox allow-scripts y nunca allow-same-origin", () => {
    montar();
    expect(iframe().getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe().getAttribute("sandbox")).not.toContain("allow-same-origin");
  });
  it("sustituye __PM_CANAL__ por un token nuevo de 128 bits", () => {
    montar();
    const html = iframe().getAttribute("srcdoc") ?? "";
    expect(canal(iframe())).toMatch(/^[0-9a-f]{32}$/);
    expect(html).not.toContain("__PM_CANAL__");
    expect(html).toContain(canal(iframe()));
  });
  it("un cambio con ventana, origen null y token llega a alCambio", () => {
    const alCambio = montar();
    hablar(iframe(), cambio(iframe()));
    expect(alCambio).toHaveBeenCalledWith("volumen", -6);
  });
  it("sin token o con otro token no aplica nada", () => {
    const alCambio = montar();
    hablar(iframe(), cambio(iframe(), -6, "0".repeat(32)));
    const { canal: _, ...sinCanal } = cambio(iframe());
    hablar(iframe(), sinCanal);
    expect(alCambio).not.toHaveBeenCalled();
  });
  it("un mensaje de otra ventana no se acepta aunque traiga el token", () => {
    const alCambio = montar();
    hablar(iframe(), cambio(iframe()), window);
    expect(alCambio).not.toHaveBeenCalled();
  });
  it("exportar y hola solo informan por sus callbacks", () => {
    const alCambio = vi.fn(); const alExportar = vi.fn(); const alDeclarar = vi.fn();
    montar(DEF, {}, alCambio, { alExportar, alDeclarar });
    const el = iframe(); const c = canal(el);
    hablar(el, { protomolecula: 1, tipo: "exportar", canal: c, formato: "wav", datos: "base64:AA" });
    hablar(el, { protomolecula: 1, tipo: "hola", canal: c, nombre: "Prueba", parametros: [] });
    expect(alExportar).toHaveBeenCalledWith("wav", "base64:AA");
    expect(alDeclarar).toHaveBeenCalledWith({ nombre: "Prueba", parametros: [] });
    expect(alCambio).not.toHaveBeenCalled();
  });
});
describe("MarcoAislado · componente y externa", () => {
  it("una vista de componente desconocida lo dice", () => {
    montar({ ...DEF, vista: { tipo: "componente", id: "no-existe" } });
    expect(screen.getByText("Esta herramienta aún no tiene vista")).toBeDefined();
  });
  it("una app ajena http no se incrusta: tarjeta con motivo y enlace", () => {
    montar({ ...DEF, vista: { tipo: "externa", url: "http://ajena.example.com/app" } });
    expect(screen.queryByTitle("Herramienta de prueba")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("Solo https");
    expect(screen.getByRole("link", { name: "Abrir en una pestaña nueva" }).getAttribute("href")).toBe("http://ajena.example.com/app");
  });
  it("una app ajena https va en iframe con su sandbox y el aviso de solo ventana", () => {
    montar({ ...DEF, vista: { tipo: "externa", url: "https://ajena.example.com/app" } });
    expect(iframe().getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads");
    expect(iframe().getAttribute("src")).toBe("https://ajena.example.com/app");
    expect(screen.getByText(/Se muestra tal cual/)).toBeDefined();
  });
});
describe("MarcoAislado · sincronía", () => {
  it("al cambiar valores manda establecer solo de lo que cambió", () => {
    const vista = render(<MarcoAislado definicion={DEF} atomoId="a1" valores={{ "a1::volumen": -12, "a1::frecuencia": 440, "otro::volumen": 1 }} alCambio={() => {}} />);
    const el = iframe();
    fireEvent.load(el);
    const espia = vi.spyOn(el.contentWindow as Window, "postMessage");
    vista.rerender(<MarcoAislado definicion={DEF} atomoId="a1" valores={{ "a1::volumen": -6, "a1::frecuencia": 440, "otro::volumen": 1 }} alCambio={() => {}} />);
    expect(espia.mock.calls.map(([m]) => m)).toEqual([expect.objectContaining({ tipo: "establecer", parametroId: "volumen", valor: -6 })]);
    espia.mockRestore();
  });
  it("el panel pinta el marco del átomo registrado y mueve con origen mano", () => {
    registrarAtomosPropios();
    let n = 0;
    const molecula: Molecula = { id: "m1", titulo: "Prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1 };
    const ctrl = crearControlador({ molecula, rol: "dueno", ahora: () => 1, nuevoId: () => `id-${++n}` });
    const r = ctrl.anadirAtomo("sintetizador-web-audio");
    if (!r.ok) throw new Error(r.motivo);
    render(<PanelProtomolecula controlador={ctrl} />);
    const el = screen.getByTitle("Sintetizador Web Audio") as HTMLIFrameElement;
    hablar(el, cambio(el));
    expect(ctrl.obtener().molecula.valores[`${r.atomo.id}::volumen`]).toBe(-6);
    expect(ctrl.obtener().historial.hechos.at(-1)?.operacion.origen).toBe("mano");
  });
});
