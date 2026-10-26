/**
 * Controles, panel de cristal y cara de los agentes · Ola 1025U · U1. Objetivos de 44 px, foco que va y vuelve,
 * Escape que cierra, y una referencia de avatar rara que cae al procedural en vez de romper.
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlesMundo } from "../mundo/controles-mundo";
import { PanelCristal } from "../mundo/panel-cristal";
import { fuenteDeAgente } from "../mundo/fuente-avatar";
import { AvisosMundo } from "../mundo/avisos-mundo";

afterEach(cleanup);

const habitantes = [
  { id: "a", nombre: "Aurora" },
  { id: "b", nombre: "Bruma" },
];

function controles(over: Partial<React.ComponentProps<typeof ControlesMundo>> = {}) {
  const props: React.ComponentProps<typeof ControlesMundo> = {
    pausado: false,
    onPausar: vi.fn(),
    onReanudar: vi.fn(),
    velocidad: 1,
    onVelocidad: vi.fn(),
    conCamara: true,
    habitantes,
    centradoId: null,
    onCentrar: vi.fn(),
    ...over,
  };
  render(<ControlesMundo {...props} />);
  return props;
}

describe("ControlesMundo", () => {
  it("pausar y reanudar son el mismo sitio: muestra el que toca", () => {
    const p = controles();
    fireEvent.click(screen.getByTestId("boton-pausar"));
    expect(p.onPausar).toHaveBeenCalled();
    cleanup();
    const q = controles({ pausado: true });
    fireEvent.click(screen.getByTestId("boton-reanudar"));
    expect(q.onReanudar).toHaveBeenCalled();
    expect(screen.queryByTestId("boton-pausar")).toBeNull();
  });

  it("la velocidad marca la elegida y avisa al cambiar", () => {
    const p = controles({ velocidad: 2 });
    expect(screen.getByRole("button", { name: "Velocidad 2×" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Velocidad 1×" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Velocidad 4×" }));
    expect(p.onVelocidad).toHaveBeenCalledWith(4);
  });

  it("centrar abre la lista de habitantes, elegir uno lo centra y cierra; Vista general suelta la cámara", () => {
    const p = controles();
    fireEvent.click(screen.getByRole("button", { name: /Centrar/ }));
    const lista = screen.getByRole("listbox", { name: "Habitantes" });
    fireEvent.click(within(lista).getByRole("button", { name: "Bruma" }));
    expect(p.onCentrar).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vista general" }));
    expect(p.onCentrar).toHaveBeenLastCalledWith(null);
  });

  it("Escape cierra la lista; sin habitantes dice que no hay", () => {
    controles({ habitantes: [] });
    fireEvent.click(screen.getByRole("button", { name: /Centrar/ }));
    expect(screen.getByText("Aún no hay habitantes.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Aún no hay habitantes.")).toBeNull();
  });

  it("sin cámara (la crónica de texto) no hay botones de cámara", () => {
    controles({ conCamara: false });
    expect(screen.queryByRole("button", { name: /Centrar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vista general" })).toBeNull();
    expect(screen.getByTestId("boton-pausar")).toBeTruthy();
  });

  it("todos los botones miden al menos 44 px", () => {
    controles();
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-11/);
  });
});

describe("PanelCristal", () => {
  it("es un diálogo con nombre, mueve el foco a sí mismo y lo devuelve al cerrarse", () => {
    const origen = document.createElement("button");
    document.body.appendChild(origen);
    origen.focus();
    const alCerrar = vi.fn();
    const { unmount } = render(
      <PanelCristal titulo="Aurora" subtitulo="Bot de IA" alCerrar={alCerrar}>
        <p>contenido</p>
      </PanelCristal>,
    );
    const panel = screen.getByRole("dialog", { name: "Aurora" });
    expect(document.activeElement).toBe(panel);
    expect(screen.getByText("Bot de IA")).toBeTruthy();
    expect(screen.getByText("contenido")).toBeTruthy();
    const cerrar = screen.getByRole("button", { name: "Cerrar la ficha" });
    expect(cerrar.className).toMatch(/size-11/);
    fireEvent.click(cerrar);
    expect(alCerrar).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alCerrar).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.activeElement).toBe(origen);
    origen.remove();
  });

  it("el contenido largo se desplaza dentro del panel, no empuja la página", () => {
    render(
      <PanelCristal titulo="X" alCerrar={() => undefined}>
        <div style={{ height: 4000 }} />
      </PanelCristal>,
    );
    const contenido = screen.getByRole("dialog").querySelector(".overflow-y-auto");
    expect(contenido).not.toBeNull();
  });
});

describe("fuenteDeAgente", () => {
  it("sin avatar sale el procedural, con el nombre dentro", () => {
    const f = fuenteDeAgente({ id: "bot:1", nombre: "Guía", avatarRef: undefined });
    expect(f.tipo).toBe("procedural");
    expect(f.tipo === "procedural" && decodeURIComponent(f.svg)).toContain("Guía");
  });

  it("acepta una imagen https, un GLB y una ruta del propio sitio", () => {
    expect(fuenteDeAgente({ id: "x", nombre: "X", avatarRef: "https://cdn.example/a.png" })).toEqual({ tipo: "imagen", url: "https://cdn.example/a.png" });
    expect(fuenteDeAgente({ id: "x", nombre: "X", avatarRef: "https://cdn.example/a.glb?v=2" })).toEqual({ tipo: "glb", url: "https://cdn.example/a.glb?v=2" });
    expect(fuenteDeAgente({ id: "x", nombre: "X", avatarRef: "/avatares/a.webp" }).tipo).toBe("imagen");
  });

  it("una referencia rara (http plano, otro esquema, ADN) cae al procedural sin romper", () => {
    for (const ref of ["http://inseguro.example/a.png", "javascript:alert(1)", "//otro.example/a.png", "adn:abc123", "  "]) {
      expect(fuenteDeAgente({ id: "x", nombre: "X", avatarRef: ref }).tipo).toBe("procedural");
    }
  });
});

describe("AvisosMundo", () => {
  const base = { total: 3, visibles: 3, ocultos: 0, cargando: false, avisosFuentes: [], guardado: true, sinSesion: false };

  it("con agentes dice que es un juego y que son Bot de IA", () => {
    render(<AvisosMundo {...base} />);
    expect(screen.getByTestId("aviso-mundo-juego").textContent).toMatch(/simulación de juego, no actividad real/);
  });

  it("sin agentes explica qué falta, distinguiendo si no hay sesión", () => {
    render(<AvisosMundo {...base} total={0} visibles={0} />);
    expect(screen.getByTestId("aviso-mundo-vacio").textContent).toMatch(/No se inventa actividad/);
    cleanup();
    render(<AvisosMundo {...base} total={0} visibles={0} sinSesion />);
    expect(screen.getByTestId("aviso-mundo-vacio").textContent).toMatch(/ni sesión/);
  });

  it("singular y plural del tope; el aviso de guardado fallido aparece", () => {
    render(<AvisosMundo {...base} total={25} visibles={24} ocultos={1} guardado={false} />);
    expect(screen.getByTestId("aviso-mundo-tope").textContent).toMatch(/Queda 1 fuera/);
    expect(screen.getByTestId("aviso-mundo-guardado").textContent).toMatch(/No se pudo guardar/);
  });
});
