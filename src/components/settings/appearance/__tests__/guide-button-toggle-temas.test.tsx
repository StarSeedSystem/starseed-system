/**
 * GUI1021O · Ajustes: «Ver la guía de introducción» con la lista de los diez temas.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Monta `GuideButtonToggle` real y comprueba la §5 del contrato: la lista con los
 * diez temas de `TODOS_LOS_TEMAS` (título e icono), cada uno abriendo la guía por
 * la puerta común (`abrirGuia({desde: "ajustes", temaInicial})`), con teclado,
 * dianas de 44 px, cursor pointer y nada de movimiento forzado.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";
import { GuideButtonToggle } from "../guide-button-toggle";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

/** Escucha la guía como lo hace `aurora-guide.tsx` y devuelve lo que llegó. */
function escucharGuia() {
  const recibidos: PeticionGuia[] = [];
  const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { recibidos, parar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

afterEach(() => cleanup());

/** `GuideButtonToggle` se monta siempre bajo el AppearanceProvider del layout raíz. */
function montar() {
  return render(<AppearanceProvider><GuideButtonToggle /></AppearanceProvider>);
}

describe("GuideButtonToggle · la lista de temas (GUI1021O)", () => {
  it("ofrece los diez temas de la guía, cada uno con su título y su icono", () => {
    montar();
    const lista = screen.getByRole("list", { name: "Empezar la guía de introducción por un tema" });
    expect(TODOS_LOS_TEMAS).toHaveLength(10);
    expect(lista.querySelectorAll("li button")).toHaveLength(10);
    for (const tema of TODOS_LOS_TEMAS) {
      const boton = screen.getByRole("button", { name: tema.titulo });
      expect(boton.querySelector("svg")).not.toBeNull();
    }
  });

  it("cada tema abre la guía por la puerta común, desde «ajustes» y con su clave inicial", () => {
    const guia = escucharGuia();
    montar();
    for (const tema of TODOS_LOS_TEMAS) {
      fireEvent.click(screen.getByRole("button", { name: tema.titulo }));
    }
    guia.parar();
    expect(guia.recibidos).toEqual(
      TODOS_LOS_TEMAS.map((tema) => ({ desde: "ajustes", temaInicial: tema.key })),
    );
  });

  it("con el teclado, Enter sobre un tema abre la guía en ese tema", async () => {
    const usuario = userEvent.setup();
    const guia = escucharGuia();
    montar();
    const boton = screen.getByRole("button", { name: "Redes mesh" });
    boton.focus();
    expect(boton).toHaveFocus();
    await usuario.keyboard("{Enter}");
    await usuario.keyboard(" ");
    guia.parar();
    expect(guia.recibidos).toEqual([
      { desde: "ajustes", temaInicial: "malla" },
      { desde: "ajustes", temaInicial: "malla" },
    ]);
  });

  it("cada tema es una diana de 44 px con cursor pointer, foco visible y movimiento solo permitido", () => {
    montar();
    for (const tema of TODOS_LOS_TEMAS) {
      const boton = screen.getByRole("button", { name: tema.titulo });
      expect(boton.className).toMatch(/min-h-\[44px\]/);
      expect(boton.className).toMatch(/cursor-pointer/);
      expect(boton.className).toMatch(/focus-visible:ring-2/);
      expect(boton.className).toMatch(/motion-reduce:transition-none/);
      expect(boton.className).not.toMatch(/(^|\s)hover:scale/);
    }
  });
});
