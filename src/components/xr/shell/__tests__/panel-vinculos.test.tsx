/**
 * XR1010AG · vínculos de entrada y nodo Logic. jsdom: el lienzo (three/uikit) se simula; lo que
 * se prueba es la lógica real de `vinculos-xr.ts`, la persistencia de `usePrefsXR` y lo que
 * muestran las pestañas de calidad, privacidad y conexiones.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MAPAS_DEFECTO } from "@/lib/xr/vinculos-xr";
import { consentimiento } from "@/lib/xr/privacidad";
import type { Sala } from "@/lib/salas/sala";

const h = vi.hoisted(() => ({ nivel: "media" as string, cambio: null as null | { tipo: string; de: string; a: string; motivo: string } }));

vi.mock("@react-three/uikit", () => ({
  Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../use-calidad-dinamica", () => ({
  useCalidadDinamica: () => ({ nivel: h.nivel, cambio: h.cambio, aviso: "" }),
}));

import { PanelVinculos } from "../panel-vinculos";
import { NodoLogic } from "../nodo-logic";

const CLAVE_CONFORT = "starseed.xr.confort.v1";
const CLAVE_CALIDAD = "starseed.xr.calidad.v1";
const guardado = (clave: string): Record<string, unknown> => JSON.parse(localStorage.getItem(clave) ?? "{}") as Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  h.nivel = "media";
  h.cambio = null;
});
afterEach(cleanup);

describe("PanelVinculos · 11 acciones por forma de entrada", () => {
  it("lista las 11 acciones y sus gatillos actuales", () => {
    render(<PanelVinculos entrada="mandos" mapas={MAPAS_DEFECTO} alGuardar={vi.fn()} />);
    for (const nombre of ["Seleccionar", "Agarrar", "Menú de mano", "Abrir dock", "Recentrar", "Salir", "Hablar", "Teletransporte", "Girar a la izquierda", "Girar a la derecha", "Atrás"]) {
      expect(screen.getByText(nombre)).toBeInTheDocument();
    }
    expect(screen.getByText("Botón 0 (derecha) · Botón 0 (izquierda)")).toBeInTheDocument();
  });
  it("reasignar un gatillo ocupado avisa de quién lo perdió", () => {
    const alGuardar = vi.fn();
    const vista = render(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} />);
    fireEvent.click(screen.getAllByText("Cambiar")[0]);
    expect(screen.getByText("Toca ahora…")).toBeInTheDocument();
    vista.rerender(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} capturado={{ tipo: "tecla", codigo: "Escape" }} />);
    expect(screen.getByText("Se lo quité a «Salir».")).toBeInTheDocument();
  });
  it("no deja guardar un mapa sin «salir»", () => {
    const alGuardar = vi.fn();
    const vista = render(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} />);
    fireEvent.click(screen.getAllByText("Cambiar")[0]);
    vista.rerender(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} capturado={{ tipo: "tecla", codigo: "Escape" }} />);
    expect(alGuardar).not.toHaveBeenCalled();
    expect(screen.getByText(/Falta un gatillo para «salir»/)).toBeInTheDocument();
  });
  it("un gesto reservado tampoco se guarda", () => {
    const alGuardar = vi.fn();
    const vista = render(<PanelVinculos entrada="manos" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} />);
    fireEvent.click(screen.getAllByText("Cambiar")[0]);
    vista.rerender(<PanelVinculos entrada="manos" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} capturado={{ tipo: "gesto", gesto: "pellizco-palma", mano: "cualquiera" }} />);
    expect(alGuardar).not.toHaveBeenCalled();
    expect(screen.getByText(/es del sistema del visor/)).toBeInTheDocument();
  });
  it("«Restaurar» devuelve los valores por defecto", () => {
    const alGuardar = vi.fn();
    const vista = render(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} />);
    fireEvent.click(screen.getAllByText("Cambiar")[0]);
    vista.rerender(<PanelVinculos entrada="teclado-raton" mapas={MAPAS_DEFECTO} alGuardar={alGuardar} capturado={{ tipo: "tecla", codigo: "KeyQ" }} />);
    expect(alGuardar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Restaurar"));
    expect(alGuardar).toHaveBeenLastCalledWith("teclado-raton", MAPAS_DEFECTO["teclado-raton"]);
    expect(screen.getByText("Tecla Enter")).toBeInTheDocument();
  });
});
describe("NodoLogic · ajustes en el visor", () => {
  it("cambiar el giro a 45° persiste", () => {
    render(<NodoLogic />);
    fireEvent.click(screen.getByText("Comodidad"));
    fireEvent.click(screen.getByText("45°"));
    expect(guardado(CLAVE_CONFORT).anguloSalto).toBe(45);
  });
  it("calidad: un nivel fijo persiste y se ve al instante", () => {
    render(<NodoLogic />);
    fireEvent.click(screen.getByText("Alta"));
    expect(guardado(CLAVE_CALIDAD).modo).toBe("alta");
    expect(screen.getByText("Nivel actual: Alta")).toBeInTheDocument();
  });
  it("calidad: enseña el motivo del último cambio automático", () => {
    h.nivel = "alta";
    h.cambio = { tipo: "nivel", de: "media", a: "alta", motivo: "fotogramas lentos" };
    render(<NodoLogic />);
    expect(screen.getByText(/fotogramas lentos/)).toBeInTheDocument();
  });
  it("privacidad: la cámara nunca sale del aparato y el consentimiento se puede quitar", () => {
    const alQuitar = vi.fn(), ahora = Date.now();
    render(<NodoLogic consentimientos={[consentimiento("voz-texto", "nube-terceros", ahora, 8 * 3600_000)]} alQuitarConsentimiento={alQuitar} ahora={() => ahora} />);
    fireEvent.click(screen.getByText("Privacidad"));
    expect(screen.getAllByText(/nunca sale del aparato/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Quitar"));
    expect(alQuitar).toHaveBeenCalledWith("voz-texto");
    expect(screen.queryByText("Quitar")).toBeNull();
  });
  it("conexiones: muestra el transporte real y abre /servidores", () => {
    const alAbrir2D = vi.fn();
    const sala: Sala = { id: "s", tipo: "xr", titulo: "Sala", visibilidad: "privada", transporte: "local", miembros: { yo: "dueno" }, creadaEn: 1 };
    render(<NodoLogic sala={sala} alcanzabilidad={{ internet: true, servidorPrivado: false, malla: true }} alAbrir2D={alAbrir2D} />);
    fireEvent.click(screen.getByText("Conexiones"));
    expect(screen.getByText("Transporte actual: malla-p2p")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Abrir /servidores"));
    expect(alAbrir2D).toHaveBeenCalledWith("/servidores");
  });
});