import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SeccionInternet } from "../seccion-internet";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { EstadoConexion, FuenteLimitada } from "@/lib/malla/internet/tipos";

const CLAVE = "starseed.malla.internet.v1";

const extra = {
  desde: "Desde",
  hasta: "Hasta",
  limite: "Límite",
  compartirConOtros: "Compartir mi internet con otros",
  declararDePago: "Mi conexión es de pago",
  declararNoDePago: "Mi conexión no es de pago",
};

function renderSeccion(estado: EstadoConexion = "limitada", fuente: FuenteLimitada = "declarada") {
  return render(
    <SeccionInternet textos={TextosInternet} extra={extra} clasificacion={{ estado, fuente }} />
  );
}

function leerGuardado(): { declaraLimitada?: boolean | null } | null {
  const crudo = window.localStorage.getItem(CLAVE);
  if (!crudo) return null;
  return JSON.parse(crudo) as { declaraLimitada?: boolean | null };
}

function switchDe(audiencia: string) {
  return screen.getByRole("switch", { name: new RegExp(audiencia, "i") });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("SeccionInternet", () => {
  it("muestra la ración del banco solo cuando el banco está activo", () => {
    renderSeccion();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /Modo banco/i }));

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: TextosInternet.racionDiaria })).toBeInTheDocument();
  });

  it("pinta tres filas de mesh, una por audiencia y en orden", () => {
    renderSeccion();

    const filas = [switchDe("mi cuenta"), switchDe("entidad"), switchDe("Público")];
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila).not.toBeChecked();
    }
  });

  it("deja apagado por defecto el interruptor general de compartir", () => {
    renderSeccion();

    const general = screen.getByRole("switch", { name: extra.compartirConOtros });
    expect(general).not.toBeChecked();
  });

  it("declarar la conexión de pago escribe declaraLimitada en true", () => {
    renderSeccion();

    fireEvent.click(screen.getByRole("button", { name: extra.declararDePago }));

    expect(leerGuardado()?.declaraLimitada).toBe(true);
  });

  it("declarar la conexión no de pago escribe declaraLimitada en false", () => {
    renderSeccion();

    fireEvent.click(screen.getByRole("button", { name: extra.declararNoDePago }));

    expect(leerGuardado()?.declaraLimitada).toBe(false);
  });

  it("muestra el estado de la conexión y de dónde sale", () => {
    renderSeccion("limitada", "nativa");

    expect(screen.getByText(TextosInternet.conexionLimitada)).toBeInTheDocument();
    expect(screen.getByText(TextosInternet.fuenteNativa)).toBeInTheDocument();
  });

  it("sin fuente solo muestra el estado, sin añadir procedencia", () => {
    renderSeccion("desconocida", "ninguna");

    expect(screen.getByText(TextosInternet.conexionDesconocida)).toBeInTheDocument();
    expect(screen.queryByText(TextosInternet.fuenteDeclarada)).not.toBeInTheDocument();
    expect(screen.queryByText(TextosInternet.fuenteNativa)).not.toBeInTheDocument();
    expect(screen.queryByText(TextosInternet.fuenteNavegador)).not.toBeInTheDocument();
  });

  it("encender un modo de mesh no enciende el banco ni los demás modos", () => {
    renderSeccion();

    fireEvent.click(switchDe("mi cuenta"));

    expect(switchDe("mi cuenta")).toBeChecked();
    expect(switchDe("entidad")).not.toBeChecked();
    expect(switchDe("Público")).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /Modo banco/i })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: extra.compartirConOtros })).not.toBeChecked();
  });

  it("encender el banco no enciende ningún modo de mesh", () => {
    renderSeccion();

    fireEvent.click(screen.getByRole("switch", { name: /Modo banco/i }));

    expect(switchDe("mi cuenta")).not.toBeChecked();
    expect(switchDe("entidad")).not.toBeChecked();
    expect(switchDe("Público")).not.toBeChecked();
  });
});
