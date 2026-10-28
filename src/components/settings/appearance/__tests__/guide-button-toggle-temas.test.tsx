/**
 * Pruebas del interruptor «Botón de guía» y su lista de temas (rescatadas de la
 * rama nube 40645365414 y adaptadas a la API de hoy del componente).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { Atom, HelpCircle, type LucideIcon } from "lucide-react";
import { GuideButtonToggle, ListaTemasGuia, iconoDeTema, temasConIcono } from "../guide-button-toggle";
import { TODOS_LOS_TEMAS, type TemaGuia } from "@/lib/onboarding/guia-temas-red";
import { EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

/** Escucha las peticiones de abrir la guía que salen por window (sin mocks). */
function escucharPeticiones(): {
  peticiones: PeticionGuia[];
  dejar: () => void;
} {
  const peticiones: PeticionGuia[] = [];
  const oir = (evento: Event): void => {
    peticiones.push((evento as CustomEvent<PeticionGuia>).detail);
  };
  window.addEventListener(EVENTO_ABRIR_GUIA, oir);
  return { peticiones, dejar: () => window.removeEventListener(EVENTO_ABRIR_GUIA, oir) };
}

describe("guía: temas del interruptor «Botón de guía»", () => {
  afterEach(() => cleanup());

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
    expect(iconoDeTema({ key: "tema-que-aun-no-existe" } as Pick<TemaGuia, "key">)).toBe(HelpCircle);
    expect(iconoDeTema(TODOS_LOS_TEMAS[0])).toBe(Atom as LucideIcon);
    expect(iconoDeTema(TODOS_LOS_TEMAS[0])).toBe(temasConIcono()[0].Icono);
  });

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
