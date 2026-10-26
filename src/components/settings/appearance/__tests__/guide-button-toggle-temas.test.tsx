// GUI1021G · Ajustes → «Ver la guía de introducción» con sus diez temas.
// Lo puro: el mapa de temas a icono. Lo visible: cada uno abre la guía en su tema.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HelpCircle } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import {
  GuideButtonToggle,
  ListaTemasGuia,
  iconoDeTema,
  temasConIcono,
} from "../guide-button-toggle";

afterEach(() => cleanup());

function montarAjustes() {
  return render(
    <AppearanceProvider>
      <GuideButtonToggle />
    </AppearanceProvider>,
  );
}

describe("temas con icono (GUI1021G)", () => {
  it("conserva los diez temas en el orden del tour y da un icono distinto a cada uno", () => {
    const filas = temasConIcono();

    expect(filas).toHaveLength(10);
    expect(filas.map((fila) => fila.tema.key)).toEqual(TODOS_LOS_TEMAS.map((tema) => tema.key));
    expect(new Set(filas.map((fila) => fila.Icono)).size).toBe(10);
    for (const fila of filas) {
      expect(fila.tema.titulo.trim().length).toBeGreaterThan(0);
      expect(fila.Icono).toBeTruthy();
    }
  });

  it("usa HelpCircle de reserva para una clave sin icono propio", () => {
    expect(iconoDeTema({ key: "tema-que-aun-no-existe" })).toBe(HelpCircle);
    expect(iconoDeTema(TODOS_LOS_TEMAS[0])).toBe(temasConIcono()[0].Icono);
  });

  it("acepta una lista propia sin perder el icono de cada tema", () => {
    const recortada = temasConIcono(TODOS_LOS_TEMAS.slice(0, 2));

    expect(recortada.map((fila) => fila.tema.key)).toEqual(["protomolecula", "malla"]);
    expect(recortada[1].Icono).toBe(iconoDeTema(TODOS_LOS_TEMAS[1]));
  });
});

describe("lista de temas (GUI1021G)", () => {
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
    const peticiones: PeticionGuia[] = [];
    const escuchar = (evento: Event) => {
      peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, escuchar);
    try {
      render(<ListaTemasGuia />);
      for (const boton of screen.getAllByRole("button")) fireEvent.click(boton);

      expect(peticiones).toEqual(
        TODOS_LOS_TEMAS.map((tema) => ({ desde: "ajustes", temaInicial: tema.key })),
      );
    } finally {
      window.removeEventListener(EVENTO_ABRIR_GUIA, escuchar);
    }
  });
});

describe("lista conectada al botón de guía (GUI1021Ob)", () => {
  it("Ajustes muestra la lista junto a «Reproducir guía del sistema»", () => {
    montarAjustes();

    expect(screen.getByRole("button", { name: /Reproducir guía del sistema/ })).toBeTruthy();
    const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
    const botones = within(lista).getAllByRole("button");

    expect(botones).toHaveLength(TODOS_LOS_TEMAS.length);
    botones.forEach((boton, i) => {
      expect(boton.textContent).toContain(TODOS_LOS_TEMAS[i].titulo);
      expect(boton.querySelector("svg")).not.toBeNull();
    });
  });

  it("al pulsar un tema desde Ajustes abre la guía en ese tema", () => {
    const peticiones: PeticionGuia[] = [];
    const escuchar = (evento: Event) => {
      peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
    };
    window.addEventListener(EVENTO_ABRIR_GUIA, escuchar);
    try {
      montarAjustes();
      const lista = screen.getByRole("list", { name: "Temas de la guía de introducción" });
      const malla = within(lista).getByRole("button", { name: /Redes mesh/ });
      fireEvent.click(malla);

      expect(peticiones).toEqual([{ desde: "ajustes", temaInicial: "malla" }]);
    } finally {
      window.removeEventListener(EVENTO_ABRIR_GUIA, escuchar);
    }
  });
});
