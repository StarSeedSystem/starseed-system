import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DirectorProveedores } from "../director-proveedores";
import { DirectorPendientes } from "../director-pendientes";
import type { ResumenProveedor, ResumenPendientes } from "@/lib/mando/director-datos";

afterEach(() => {
  cleanup();
});

describe("DirectorProveedores", () => {
  it("un proveedor sin cupo con necesitaCheckin=true muestra el enlace a apinex.bond", () => {
    const proveedores: ResumenProveedor[] = [
      {
        proveedor: "apinex",
        vivo: false,
        modelos: 3,
        necesitaCheckin: true,
        sinCupoHasta: Math.floor(Date.now() / 1000) + 3600,
        motivo: "sin cupo",
      },
    ];
    render(<DirectorProveedores proveedores={proveedores} />);
    const enlace = screen.getByRole("link", { name: /check-in diario pendiente/ });
    expect(enlace).toBeInTheDocument();
    expect(enlace).toHaveAttribute("href", "https://apinex.bond/airdrop?tab=quests");
    expect(enlace).toHaveAttribute("target", "_blank");
  });

  it("un proveedor sin cupo muestra «sin cupo hasta HH:MM»", () => {
    const ahora = Math.floor(Date.now() / 1000);
    const fecha = new Date((ahora + 3600) * 1000);
    const horaEsperada = fecha.getHours().toString().padStart(2, "0") + ":" + fecha.getMinutes().toString().padStart(2, "0");

    const proveedores: ResumenProveedor[] = [
      {
        proveedor: "nim",
        vivo: false,
        modelos: 5,
        necesitaCheckin: false,
        sinCupoHasta: ahora + 3600,
      },
    ];
    render(<DirectorProveedores proveedores={proveedores} />);
    expect(screen.getByText(new RegExp(`sin cupo hasta ${horaEsperada}`))).toBeInTheDocument();
  });

  it("un proveedor sin cupo y necesitaCheckin muestra el botón Reactivar", () => {
    const proveedores: ResumenProveedor[] = [
      {
        proveedor: "xkiro",
        vivo: false,
        modelos: 2,
        necesitaCheckin: true,
        sinCupoHasta: Math.floor(Date.now() / 1000) + 3600,
      },
    ];
    render(<DirectorProveedores proveedores={proveedores} />);
    expect(screen.getByRole("button", { name: /Reactivar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apartar 24 h/ })).toBeInTheDocument();
  });

  it("sin proveedores, la API no trae proveedores es honesto", () => {
    render(<DirectorProveedores proveedores={[]} />);
    expect(screen.getByText("la API no trae proveedores")).toBeInTheDocument();
  });
});

describe("DirectorPendientes", () => {
  it("una tarea bloqueada CX4 que espera CX3 muestra el texto correcto", () => {
    const pendientes: ResumenPendientes = {
      listas: 5,
      bloqueadas: [{ id: "CX4", dependeDe: ["CX3"] }],
      sinCambios: 1,
      fallos: 0,
      esperandoAprobacion: 2,
      integradasHoy: 3,
      fallosDetalle: [],
    };
    render(<DirectorPendientes pendientes={pendientes} />);
    expect(screen.getByText(/CX4 espera CX3/)).toBeInTheDocument();
    expect(screen.getByTestId("bloqueada-CX4")).toBeInTheDocument();
  });

  it("una tarea en fallo muestra su nota en línea", () => {
    const pendientes: ResumenPendientes = {
      listas: 0,
      bloqueadas: [],
      sinCambios: 0,
      fallos: 1,
      esperandoAprobacion: 0,
      integradasHoy: 0,
      fallosDetalle: [{ id: "P1", estado: "fallo", nota: "Error al compilar: variable indefinida" }],
    };
    render(<DirectorPendientes pendientes={pendientes} />);
    expect(screen.getByTestId("fallo-P1")).toBeInTheDocument();
    expect(screen.getByText(/Error al compilar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("ningún fallo es honesto", () => {
    const pendientes: ResumenPendientes = {
      listas: 10,
      bloqueadas: [],
      sinCambios: 0,
      fallos: 0,
      esperandoAprobacion: 0,
      integradasHoy: 2,
      fallosDetalle: [],
    };
    render(<DirectorPendientes pendientes={pendientes} />);
    expect(screen.getByText("ningún fallo")).toBeInTheDocument();
  });

  it("nada bloqueado es honesto", () => {
    const pendientes: ResumenPendientes = {
      listas: 3,
      bloqueadas: [],
      sinCambios: 0,
      fallos: 2,
      esperandoAprobacion: 1,
      integradasHoy: 0,
      fallosDetalle: [{ id: "P2", estado: "fallo_tsc", nota: "" }],
    };
    render(<DirectorPendientes pendientes={pendientes} />);
    expect(screen.getByText("nada bloqueado")).toBeInTheDocument();
  });
});
