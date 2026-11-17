import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SeccionInternet } from "../seccion-internet";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";

const CLAVE = "starseed.malla.internet.v1";

const extra = {
  desde: "Desde",
  hasta: "Hasta",
  limite: "Límite",
  compartirConOtros: "Compartir con otros",
  declararDePago: "Declarar de pago",
  declararNoDePago: "Declarar sin pago",
};

type Clasificacion = { estado: EstadoConexion; fuente: FuenteLimitada };

function renderSeccion(clasificacion: Clasificacion = { estado: "limitada", fuente: "declarada" }) {
  return render(<SeccionInternet textos={TextosInternet} extra={extra} clasificacion={clasificacion} />);
}

function declaraGuardada(): boolean | null {
  const crudo = window.localStorage.getItem(CLAVE);
  if (crudo === null) return null;
  return (JSON.parse(crudo) as { declaraLimitada: boolean | null }).declaraLimitada;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SeccionInternet", () => {
  it("solo muestra la ración cuando el banco está activo", () => {
    renderSeccion();
    expect(screen.queryByRole("tablist", { name: /Modo banco/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /Modo banco/i }));
    expect(screen.getByRole("tablist", { name: /Modo banco/i })).toBeInTheDocument();
  });

  it("renderiza tres filas de mesh en orden: mi cuenta, entidad y público", () => {
    renderSeccion();
    const miCuenta = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
    const entidad = screen.getByRole("switch", { name: /Miembros de una entidad/i });
    const publico = screen.getByRole("switch", { name: /Público/i });
    expect(screen.getAllByRole("switch", { name: /Compartir por malla/i })).toHaveLength(3);
    expect(miCuenta.compareDocumentPosition(entidad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(entidad.compareDocumentPosition(publico) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el interruptor general de compartir con otros está apagado por defecto", () => {
    renderSeccion();
    const general = screen.getByRole("switch", { name: /Compartir con otros/i });
    expect(general).toHaveAttribute("data-state", "unchecked");
    expect(general).not.toBeChecked();
  });

  it("declarar de pago escribe declaraLimitada:true en el almacén", () => {
    renderSeccion();
    expect(declaraGuardada()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Declarar de pago/i }));
    expect(declaraGuardada()).toBe(true);
  });

  it("declarar sin pago escribe declaraLimitada:false en el almacén", () => {
    renderSeccion();
    fireEvent.click(screen.getByRole("button", { name: /Declarar sin pago/i }));
    expect(declaraGuardada()).toBe(false);
  });

  it("muestra el estado de la conexión y de dónde sale la fuente", () => {
    renderSeccion({ estado: "limitada", fuente: "navegador" });
    expect(screen.getByText("Limitada")).toBeInTheDocument();
    expect(screen.getByText("Información del navegador")).toBeInTheDocument();
  });

  it("muestra el estado no limitada con su fuente declarada", () => {
    renderSeccion({ estado: "no-limitada", fuente: "declarada" });
    expect(screen.getByText("No limitada")).toBeInTheDocument();
    expect(screen.getByText("Declarada por la persona")).toBeInTheDocument();
  });

  it("sin fuente solo enseña el estado, sin añadir origen", () => {
    renderSeccion({ estado: "desconocida", fuente: "ninguna" });
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByText("Información del navegador")).not.toBeInTheDocument();
    expect(screen.queryByText("Marca de red del dispositivo")).not.toBeInTheDocument();
  });

  it("encender un modo nunca enciende otro", () => {
    renderSeccion();
    fireEvent.click(screen.getByRole("switch", { name: /Modo banco/i }));
    fireEvent.click(screen.getByRole("switch", { name: /Neuronas de mi cuenta/i }));
    fireEvent.click(screen.getByRole("switch", { name: /Compartir con otros/i }));
    expect(screen.getByRole("switch", { name: /Miembros de una entidad/i })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /Público/i })).not.toBeChecked();
    expect(declaraGuardada()).toBeNull();
  });
});
