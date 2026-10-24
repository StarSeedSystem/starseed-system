/**
 * GUI1021L · AvisoSesion: el aviso común «Inicia sesión para…» con su acceso a la guía.
 *
 * Monta el componente real y comprueba lo que promete el §5 del contrato: el texto como nombre
 * accesible, «Iniciar sesión» hacia `/bienvenida`, «Conoce StarSeed» que abre la guía por la puerta
 * común (con ratón y con teclado), la versión compacta, dianas de 44 px y nada de movimiento forzado.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AvisoSesion, RUTA_INICIAR_SESION } from "../aviso-sesion";
import { abrirGuia, EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

describe("AvisoSesion (GUI1021L)", () => {
  it("es una región con el texto de la ventana como nombre y su explicación como descripción", () => {
    render(<AvisoSesion texto="Inicia sesión para ver tus notificaciones" detalle="Viven en tu cuenta." />);
    const region = screen.getByRole("region", { name: "Inicia sesión para ver tus notificaciones" });
    expect(region).toHaveAccessibleDescription("Viven en tu cuenta.");
    expect(region.className).toMatch(/glass-depth/);
  });

  it("«Iniciar sesión» lleva a la bienvenida, que enseña la pantalla de acceso", () => {
    render(<AvisoSesion texto="Inicia sesión para jugar" />);
    expect(RUTA_INICIAR_SESION).toBe("/bienvenida");
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/bienvenida");
  });

  it("«Conoce StarSeed» abre la guía por la puerta común, desde «aviso»", () => {
    const guia = escucharGuia();
    render(<AvisoSesion texto="Inicia sesión para jugar" />);
    fireEvent.click(screen.getByRole("button", { name: "Conoce StarSeed" }));
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "aviso" }]);
  });

  it("se maneja entero con el teclado: Tab llega a los dos y Enter o Espacio abren la guía", async () => {
    const usuario = userEvent.setup();
    const guia = escucharGuia();
    render(<AvisoSesion texto="Inicia sesión para delegar tu voto" compacto />);
    await usuario.tab();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveFocus();
    await usuario.tab();
    const boton = screen.getByRole("button", { name: "Conoce StarSeed" });
    expect(boton).toHaveFocus();
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    guia.parar();
    expect(guia.recibidos).toEqual([{ desde: "aviso" }, { desde: "aviso" }]);
  });

  it("la versión compacta es una nota en línea, sin el icono grande", () => {
    render(<AvisoSesion texto="Inicia sesión para ver esta biblioteca" compacto />);
    const nota = screen.getByRole("note", { name: "Inicia sesión para ver esta biblioteca" });
    expect(nota).toHaveAttribute("data-compacto", "1");
    expect(screen.queryByRole("region")).toBeNull();
    expect(nota.querySelectorAll(":scope > svg")).toHaveLength(0);
  });

  it("dianas de 44 px, cursor pointer, foco visible y movimiento solo si se permite", () => {
    render(<AvisoSesion texto="Inicia sesión para participar" />);
    for (const el of [screen.getByRole("link", { name: "Iniciar sesión" }), screen.getByRole("button", { name: "Conoce StarSeed" })]) {
      expect(el.className).toMatch(/min-h-\[44px\]/);
      expect(el.className).toMatch(/cursor-pointer/);
      expect(el.className).toMatch(/focus-visible:ring-2/);
      expect(el.className).toMatch(/motion-reduce:transition-none/);
      expect(el.className).not.toMatch(/(^|\s)hover:scale/);
    }
  });
});

describe("abrirGuia · la puerta común", () => {
  it("lanza el mismo evento que escucha la guía de Aurora", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/components/onboarding/aurora-guide.tsx"), "utf8");
    expect(/OPEN_GUIDE_EVENT = "([^"]+)"/.exec(fuente)?.[1]).toBe(EVENTO_ABRIR_GUIA);
  });

  it("lleva el tema inicial solo si se pide y acepta un destino inyectado", () => {
    const destino = new EventTarget();
    const oir = vi.fn((e: Event) => (e as CustomEvent<PeticionGuia>).detail);
    destino.addEventListener(EVENTO_ABRIR_GUIA, oir);
    expect(abrirGuia({ desde: "ajustes", temaInicial: "malla" }, destino)).toBe(true);
    expect(abrirGuia({ desde: "login" }, destino)).toBe(true);
    expect(oir.mock.results.map((r) => r.value)).toEqual([{ desde: "ajustes", temaInicial: "malla" }, { desde: "login" }]);
  });
});
