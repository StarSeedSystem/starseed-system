// GUI1021Ob · Ajustes → la guía de introducción con sus diez temas.
// Lo puro: el mapa de temas a icono y que cada tema sea un paso real de la guía.
// Lo visible: cada botón abre la guía en su tema con `desde: "ajustes"`.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HelpCircle } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  GuideButtonToggle,
  ListaTemasGuia,
  iconoDeTema,
  temasConIcono,
} from "../guide-button-toggle";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { indiceDePaso } from "@/lib/onboarding/guia-completa";
import { AppearanceProvider } from "@/context/appearance-context";

afterEach(() => cleanup());

describe("temas con icono (GUI1021Ob)", () => {
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

  it("cada tema es un paso real del catálogo: la guía abre en él y no al principio", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      expect(indiceDePaso(tema.key)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("lista de temas (GUI1021Ob)", () => {
  it("muestra los diez títulos con su icono, en botones de 44 px y cursor pointer", () => {
    render(<ListaTemasGuia />);
    const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
    expect(lista).toBeTruthy();
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(TODOS_LOS_TEMAS.length);
    botones.forEach((boton, i) => {
      expect(boton.textContent).toContain(TODOS_LOS_TEMAS[i].titulo);
      expect(boton.getAttribute("aria-label")).toBe(`Abrir la guía en «${TODOS_LOS_TEMAS[i].titulo}»`);
      expect(boton.querySelector("svg")).not.toBeNull();
      expect(boton.className).toContain("min-h-[44px]");
      expect(boton.className).toContain("cursor-pointer");
      expect(boton.getAttribute("type")).toBe("button");
    });
  });

  it("cada tema abre la guía en ese tema con desde ajustes", () => {
    const peticiones: PeticionGuia[] = [];
    const escuchar = (evento: Event) => {
      peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, escuchar);
    try {
      render(<ListaTemasGuia />);
      const botones = screen.getAllByRole("button");
      botones.forEach((boton) => fireEvent.click(boton));
      expect(peticiones).toEqual(
        TODOS_LOS_TEMAS.map((tema) => ({ desde: "ajustes", temaInicial: tema.key })),
      );
    } finally {
      window.removeEventListener(EVENTO_ABRIR_GUIA, escuchar);
    }
  });
});

describe("aplicado en Ajustes (GUI1021Ob)", () => {
  it("el panel monta la lista junto al botón de abrir la guía", () => {
    render(<AppearanceProvider><GuideButtonToggle /></AppearanceProvider>);
    const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
    expect(within(lista).getAllByRole("button")).toHaveLength(TODOS_LOS_TEMAS.length);
    expect(screen.getByRole("button", { name: /Reproducir guía del sistema/ })).toBeTruthy();
  });

  it("un tema de la lista del panel abre la guía en ese tema con desde ajustes", () => {
    const peticiones: PeticionGuia[] = [];
    const escuchar = (evento: Event) => {
      peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, escuchar);
    try {
      render(<AppearanceProvider><GuideButtonToggle /></AppearanceProvider>);
      const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
      fireEvent.click(
        within(lista).getByRole("button", { name: `Abrir la guía en «${TODOS_LOS_TEMAS[0].titulo}»` }),
      );
      expect(peticiones).toEqual([
        { desde: "ajustes", temaInicial: TODOS_LOS_TEMAS[0].key },
      ]);
    } finally {
      window.removeEventListener(EVENTO_ABRIR_GUIA, escuchar);
    }
  });
});
