// GUI1021O · Ajustes → la guía de introducción con sus diez temas.
// Lo puro: el mapa de tema a icono. Lo visible: cada uno abre la guía en su tema.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpCircle } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  GuideButtonToggle,
  ListaTemasGuia,
  iconoDeTema,
  temasConIcono,
} from "../guide-button-toggle";
import { AppearanceProvider } from "@/context/appearance-context";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

afterEach(() => cleanup());

function escucharPeticiones(): { peticiones: PeticionGuia[]; dejar: () => void } {
  const peticiones: PeticionGuia[] = [];
  const escuchar = (evento: Event) => {
    peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
  };
  window.addEventListener(EVENTO_ABRIR_GUIA, escuchar);
  return {
    peticiones,
    dejar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, escuchar),
  };
}

describe("temas con icono", () => {
  it("conserva los diez temas en el orden del tour y da un icono distinto a cada uno", () => {
    const filas = temasConIcono();
    expect(filas).toHaveLength(10);
    expect(filas.map((f) => f.tema.key)).toEqual(TODOS_LOS_TEMAS.map((t) => t.key));
    expect(new Set(filas.map((f) => f.Icono)).size).toBe(10);
    for (const fila of filas) {
      expect(fila.tema.titulo.trim().length).toBeGreaterThan(0);
      expect(fila.Icono).toBeTruthy();
    }
  });

  it("usa HelpCircle de reserva para una clave sin icono propio", () => {
    expect(iconoDeTema({ key: "tema-que-aun-no-existe" })).toBe(HelpCircle);
    expect(iconoDeTema(TODOS_LOS_TEMAS[0])).toBe(temasConIcono()[0].Icono);
  });
});

describe("lista de temas", () => {
  it("muestra los diez títulos con su icono, en botones de 44 px y cursor pointer", () => {
    render(<ListaTemasGuia />);
    const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
    expect(lista).toBeTruthy();
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(TODOS_LOS_TEMAS.length);
    botones.forEach((boton, i) => {
      expect(boton.textContent).toContain(TODOS_LOS_TEMAS[i].titulo);
      expect(boton.querySelector("svg")).not.toBeNull();
      expect(boton.className).toContain("min-h-[44px]");
      expect(boton.className).toContain("cursor-pointer");
      expect(boton.getAttribute("type")).toBe("button");
      expect(boton.getAttribute("aria-label")).toContain(TODOS_LOS_TEMAS[i].titulo);
    });
  });

  it("cada tema abre la guía en ese tema con desde ajustes", () => {
    const { peticiones, dejar } = escucharPeticiones();
    try {
      render(<ListaTemasGuia />);
      for (const boton of screen.getAllByRole("button")) fireEvent.click(boton);
      expect(peticiones).toEqual(
        TODOS_LOS_TEMAS.map((tema) => ({ desde: "ajustes", temaInicial: tema.key })),
      );
    } finally {
      dejar();
    }
  });
});

describe("GuideButtonToggle", () => {
  it("se monta junto al botón de la guía y todos los temas siguen abriéndose desde ajustes", () => {
    const { peticiones, dejar } = escucharPeticiones();
    try {
      render(
        <AppearanceProvider>
          <GuideButtonToggle />
        </AppearanceProvider>,
      );
      expect(screen.getByText("Ver la guía de introducción")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Reproducir guía del sistema/ })).toBeTruthy();
      const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
      expect(lista.querySelectorAll("button")).toHaveLength(TODOS_LOS_TEMAS.length);
      fireEvent.click(screen.getByRole("button", { name: "Abrir la guía en «Redes mesh»" }));
      expect(peticiones).toEqual([{ desde: "ajustes", temaInicial: "malla" }]);
    } finally {
      dejar();
    }
  });
});
