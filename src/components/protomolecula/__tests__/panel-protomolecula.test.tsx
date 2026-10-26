import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { manejarAccionProtomolecula } from "@/lib/protomolecula/accion-agente";
import { PREFIJO_MOLECULA, guardarMolecula } from "@/lib/protomolecula/almacen-moleculas";
import { crearControlador, type Controlador } from "@/lib/protomolecula/controlador";
import { controladorActivo, limpiarControladores, listarControladores } from "@/lib/protomolecula/controlador-activo";
import { AVISO_SALUD } from "@/lib/protomolecula/permisos";
import { limpiarRegistro, registrarAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { reiniciarSesiones } from "@/lib/protomolecula/sesion-molecula";
import type { Molecula, Operacion, Rol } from "@/lib/protomolecula/tipos";

import { PanelProtomolecula, PanelProtomoleculaAutonomo } from "../panel-protomolecula";

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // jsdom no trae ResizeObserver y Radix Slider lo pide
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

const MESA: DefinicionAtomo = {
  herramientaId: "mesa-prueba",
  nombre: "Mesa de prueba",
  categoria: "audio",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    { id: "volumen", nombre: "Volumen", tipo: "numero", min: -60, max: 6, paso: 0.5, unidad: "dB", defecto: -12 },
    { id: "activo", nombre: "Activa", tipo: "booleano", defecto: false },
  ],
  entradas: [],
  salidas: [],
};

function molecula(par: Partial<Molecula> = {}): Molecula {
  return { id: "m1", titulo: "Molécula de prueba", ambito: "personal", capas: [], atomos: [], valores: {}, version: 0, creadaEn: 1, actualizadaEn: 1, ...par };
}
function controlador(par: Partial<Molecula> = {}, rol: Rol | null = "dueno"): Controlador {
  let n = 0;
  let t = 0;
  return crearControlador({ molecula: molecula(par), rol, ahora: () => ++t, nuevoId: () => `id-${++n}` });
}
/** Un controlador con la «Mesa de prueba» ya añadida; devuelve también el id de su átomo. */
function conMesa(par: Partial<Molecula> = {}) {
  const c = controlador(par);
  const r = c.anadirAtomo("mesa-prueba");
  if (!r.ok) throw new Error(r.motivo);
  return { c, atomoId: r.atomo.id };
}
const operacion = (atomoId: string, extra: Partial<Operacion> = {}): Operacion => ({
  id: "ext-1", objetivo: { atomoId, parametroId: "volumen" }, accion: { tipo: "exacta", valor: -3 },
  autor: { tipo: "agente", id: "aurora", nombre: "Aurora" }, origen: "agente", t: 5, ...extra,
});
const campoVolumen = () => screen.getByLabelText("Valor exacto de Volumen") as HTMLInputElement;
const historial = () => screen.getByRole("list", { name: "Historial de cambios" });

beforeEach(() => {
  limpiarRegistro();
  limpiarControladores();
  reiniciarSesiones();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  reiniciarSesiones();
});

describe("PanelProtomolecula · cabecera", () => {
  it("muestra el título y el ámbito de la molécula", () => {
    render(<PanelProtomolecula controlador={controlador()} />);
    expect(screen.getByRole("heading", { name: "Molécula de prueba" })).toBeDefined();
    expect(screen.getByText("personal")).toBeDefined();
  });
});

describe("PanelProtomolecula · herramientas", () => {
  it("muestra el título y el ámbito de la molécula en la cabecera", () => {
    render(<PanelProtomolecula controlador={controlador()} />);
    expect(screen.getByRole("heading", { name: "Molécula de prueba" })).toBeDefined();
    expect(screen.getByText("personal")).toBeDefined();
  });

  it("sin herramientas instaladas lo dice y deshabilita «Añadir herramienta» con el motivo", () => {
    render(<PanelProtomolecula controlador={controlador()} />);
    expect(screen.getByText("Aún no hay herramientas instaladas: llegan con la fase F1.")).toBeDefined();
    const boton = screen.getByRole("button", { name: "Añadir herramienta" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toContain("Aún no hay herramientas");
    expect(screen.getByText(/aún no tiene herramientas/)).toBeDefined();
    expect(screen.queryByText("No hay ninguna protomolécula activa.")).toBeNull();
  });

  it("añadir una herramienta la mete en la molécula y enseña sus controles", () => {
    registrarAtomo(MESA);
    const c = controlador();
    render(<PanelProtomolecula controlador={c} />);
    const boton = screen.getByRole("button", { name: "Añadir herramienta" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toBe("Primero elige una herramienta.");
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "mesa-prueba" } });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(c.obtener().molecula.atomos.map((a) => a.herramientaId)).toEqual(["mesa-prueba"]);
    expect(campoVolumen().value).toBe("-12");
    expect(screen.getByRole("switch", { name: "Activa" })).toBeDefined();
    expect(screen.getByText("Añadida «Mesa de prueba».")).toBeDefined();
  });

  it("una segunda instancia de la misma herramienta se distingue por su título", () => {
    registrarAtomo(MESA);
    const { c } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "mesa-prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir herramienta" }));
    expect(c.obtener().molecula.atomos.map((a) => a.titulo)).toEqual([undefined, "Mesa de prueba 2"]);
    expect(screen.getByRole("heading", { name: "Mesa de prueba 2" })).toBeDefined();
  });

  it("el panel no se salta los permisos: un observador no añade nada y se le dice por qué", () => {
    registrarAtomo(MESA);
    const c = controlador({}, "observador");
    render(<PanelProtomolecula controlador={c} />);
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "mesa-prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir herramienta" }));
    expect(c.obtener().molecula.atomos).toHaveLength(0);
    expect(screen.getByText(/observador/)).toBeDefined();
  });
});

describe("PanelProtomolecula · dictado, historial, deshacer y rehacer", () => {
  it("dictar «sube el volumen 3 dB» cambia el valor visible y queda en el historial", () => {
    registrarAtomo(MESA);
    const { c } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    fireEvent.change(screen.getByLabelText("Orden para la protomolécula"), { target: { value: "sube el volumen 3 dB" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(campoVolumen().value).toBe("-9");
    expect(within(historial()).getByText(/Volumen: -12 dB → -9 dB/)).toBeDefined();
    expect(within(historial()).getByText(/tú, dictado/)).toBeDefined();
  });

  it("Deshacer revierte de verdad y Rehacer lo vuelve a aplicar", () => {
    registrarAtomo(MESA);
    const { c, atomoId } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    fireEvent.change(screen.getByLabelText("Orden para la protomolécula"), { target: { value: "pon el volumen en -20" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(c.obtener().molecula.valores[`${atomoId}::volumen`]).toBe(-20);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(campoVolumen().value).toBe("-12");
    expect(c.obtener().molecula.valores[`${atomoId}::volumen`]).toBe(-12);
    expect(screen.getByText(/Deshecho\./)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Rehacer" }));
    expect(campoVolumen().value).toBe("-20");
    expect(c.obtener().molecula.valores[`${atomoId}::volumen`]).toBe(-20);
  });

  it("Deshacer y Rehacer están deshabilitados con su motivo cuando no hay nada que hacer", () => {
    registrarAtomo(MESA);
    const { c } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    const deshacer = screen.getByRole("button", { name: "Deshacer" }) as HTMLButtonElement;
    const rehacer = screen.getByRole("button", { name: "Rehacer" }) as HTMLButtonElement;
    expect([deshacer.disabled, rehacer.disabled]).toEqual([true, true]);
    expect(deshacer.title).toBe("Aún no hay cambios que deshacer.");
    expect(rehacer.title).toBe("No hay nada que rehacer.");
    expect(screen.getAllByText("Aún no hay cambios que deshacer.").length).toBeGreaterThan(0);
  });

  it("lo que cambia un agente se ve con su nombre, pero Deshacer no lo pisa desde el panel", () => {
    registrarAtomo(MESA);
    const { c, atomoId } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    act(() => { c.mover(operacion(atomoId)); });
    expect(campoVolumen().value).toBe("-3");
    expect(within(historial()).getByText(/Aurora, agente/)).toBeDefined();
    const deshacer = screen.getByRole("button", { name: "Deshacer" }) as HTMLButtonElement;
    expect(deshacer.disabled).toBe(true);
    expect(deshacer.title).toContain("de otros");
  });

  it("una lectura de un wearable en el historial enseña el aviso de salud; sin ella, no", () => {
    registrarAtomo(MESA);
    const { c, atomoId } = conMesa();
    render(<PanelProtomolecula controlador={c} />);
    expect(screen.queryByText(AVISO_SALUD)).toBeNull();
    act(() => { c.mover(operacion(atomoId, { origen: "sensor", fuente: "wearable:pulso", autor: { tipo: "persona", id: "yo" } })); });
    expect(screen.getByText(AVISO_SALUD)).toBeDefined();
  });
});

describe("PanelProtomolecula · pendientes", () => {
  it("lo que un agente propone en un espacio de grupo queda pendiente y Confirmar lo aplica de verdad", () => {
    registrarAtomo(MESA);
    const c = controlador({ ambito: "grupo" });
    render(<PanelProtomolecula controlador={c} />);
    expect(screen.queryByRole("region", { name: "Pendientes de confirmar" })).toBeNull();
    act(() => { c.anadirAtomo("mesa-prueba", undefined, "agente"); });
    expect(c.obtener().molecula.atomos).toHaveLength(0);
    const seccion = screen.getByRole("region", { name: "Pendientes de confirmar" });
    expect(within(seccion).getByText("Un agente propone añadir «Mesa de prueba».")).toBeDefined();
    fireEvent.click(within(seccion).getByRole("button", { name: "Confirmar" }));
    expect(c.obtener().molecula.atomos.map((a) => a.herramientaId)).toEqual(["mesa-prueba"]);
    expect(c.obtener().pendientes).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Pendientes de confirmar" })).toBeNull();
    expect(campoVolumen().value).toBe("-12");
  });

  it("Rechazar descarta la propuesta sin tocar la molécula", () => {
    registrarAtomo(MESA);
    const c = controlador({ ambito: "publica" });
    render(<PanelProtomolecula controlador={c} />);
    act(() => { c.anadirAtomo("mesa-prueba", undefined, "ia"); });
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(c.obtener().molecula.atomos).toHaveLength(0);
    expect(c.obtener().pendientes).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Pendientes de confirmar" })).toBeNull();
  });
});

describe("PanelProtomolecula · compacto", () => {
  it("deja herramientas, parámetros y pendientes: sin título, dictado ni historial", () => {
    registrarAtomo(MESA);
    const { c } = conMesa({ ambito: "grupo" });
    render(<PanelProtomolecula controlador={c} compacto />);
    expect(campoVolumen()).toBeDefined();
    expect(screen.getByRole("button", { name: "Añadir herramienta" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Molécula de prueba" })).toBeNull();
    expect(screen.queryByLabelText("Orden para la protomolécula")).toBeNull();
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    act(() => { c.anadirAtomo("mesa-prueba", "Otra", "agente"); });
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDefined();
  });

  it("un widget vacío se puede llenar desde él mismo", () => {
    registrarAtomo(MESA);
    const c = controlador();
    render(<PanelProtomolecula controlador={c} compacto />);
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "mesa-prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir herramienta" }));
    expect(campoVolumen().value).toBe("-12");
  });
});

describe("PanelProtomoleculaAutonomo · sesión, guardado y recuperación", () => {
  it("abre una molécula nueva, guarda lo que cambias y la recupera al volver", async () => {
    const primera = render(<PanelProtomoleculaAutonomo />);
    expect(await screen.findByRole("heading", { name: "Mi primera molécula" })).toBeDefined();
    expect(screen.getByText("Sin cambios que guardar")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "sintetizador-web-audio" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir herramienta" }));
    expect(screen.getByText("Guardando…")).toBeDefined();
    await waitFor(() => expect(screen.getByText("Guardado en este aparato")).toBeDefined());
    primera.unmount();
    expect(controladorActivo()).toBeNull();

    render(<PanelProtomoleculaAutonomo />);
    expect(await screen.findByRole("heading", { name: "Mi primera molécula" })).toBeDefined();
    expect(screen.getByLabelText("Valor exacto de Volumen")).toBeDefined();
  });

  it("cerrar justo después de un cambio no lo pierde", async () => {
    const vista = render(<PanelProtomoleculaAutonomo />);
    await screen.findByRole("heading", { name: "Mi primera molécula" });
    fireEvent.change(screen.getByLabelText("Herramienta que añadir"), { target: { value: "sintetizador-web-audio" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir herramienta" }));
    vista.unmount();
    const guardadas = Object.keys(localStorage).filter((k) => k.startsWith(PREFIJO_MOLECULA));
    expect(guardadas).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(guardadas[0])!).atomos).toHaveLength(1);
  });

  it("el panel de la página y el del widget comparten la misma sesión", async () => {
    render(<><PanelProtomoleculaAutonomo /><PanelProtomoleculaAutonomo compacto /></>);
    await screen.findByRole("heading", { name: "Mi primera molécula" });
    expect(screen.queryAllByLabelText("Valor exacto de Volumen")).toHaveLength(0);
    fireEvent.change(screen.getAllByLabelText("Herramienta que añadir")[0], { target: { value: "sintetizador-web-audio" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Añadir herramienta" })[0]);
    expect(screen.getAllByLabelText("Valor exacto de Volumen")).toHaveLength(2); // lo añadido en uno se ve en el otro
    expect(listarControladores()).toHaveLength(1); // un solo controlador para las dos vistas
  });

  it("la acción «protomolecula» de Aurora encuentra la sesión del panel y lo que hace se ve en pantalla", async () => {
    render(<PanelProtomoleculaAutonomo />);
    await screen.findByRole("heading", { name: "Mi primera molécula" });
    const ctx = { avisarOrbe: () => false, abrirRuta: () => {} };
    let abrir = { ok: false, message: "" };
    let mover = { ok: false, message: "" };
    act(() => { abrir = manejarAccionProtomolecula({ accion: "abrir", herramienta: "sintetizador-web-audio" }, ctx); });
    expect(abrir.ok).toBe(true);
    act(() => { mover = manejarAccionProtomolecula({ accion: "mover", parametro: "volumen", valor: -5 }); });
    expect(mover.message).toContain("Hecho");
    expect(campoVolumen().value).toBe("-5");
    expect(within(historial()).getByText(/astraura, agente/)).toBeDefined();
  });

  it("un id que no existe se dice, no se inventa una molécula", async () => {
    render(<PanelProtomoleculaAutonomo moleculaId="zzz" />);
    expect((await screen.findByRole("alert")).textContent).toContain("«zzz»");
    expect(controladorActivo("zzz")).toBeNull();
  });

  it("lo que Aurora o un bot proponen por el controlador activo aparece en el panel y Confirmar lo guarda", async () => {
    guardarMolecula(localStorage, molecula({ id: "g1", titulo: "De un grupo", ambito: "grupo", actualizadaEn: 9 }));
    render(<PanelProtomoleculaAutonomo moleculaId="g1" />);
    await screen.findByRole("heading", { name: "De un grupo" });
    const activo = controladorActivo("g1");
    expect(activo).not.toBeNull();
    act(() => { activo!.anadirAtomo("sintetizador-web-audio", undefined, "agente"); });
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    expect(activo!.obtener().molecula.atomos).toHaveLength(1);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(PREFIJO_MOLECULA + "g1")!).atomos).toHaveLength(1));
  });
});
