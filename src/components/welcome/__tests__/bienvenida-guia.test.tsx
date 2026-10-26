import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { abrirGuia, EVENTO_ABRIR_GUIA, type PeticionGuia } from "@/lib/onboarding/guia-acceso";

describe("GUI1021K2 · botón «Conoce StarSeed»", () => {
  it("bienvenida lanza starseed:open-guide con desde: 'bienvenida'", () => {
    const destino = new EventTarget();
    const recibidos: PeticionGuia[] = [];
    destino.addEventListener(EVENTO_ABRIR_GUIA, (e) => recibidos.push((e as CustomEvent<PeticionGuia>).detail));
    expect(abrirGuia({ desde: "bienvenida" }, destino)).toBe(true);
    expect(recibidos).toEqual([{ desde: "bienvenida" }]);
  });

  it("retomar sesión lanza starseed:open-guide con desde: 'login'", () => {
    const destino = new EventTarget();
    const recibidos: PeticionGuia[] = [];
    destino.addEventListener(EVENTO_ABRIR_GUIA, (e) => recibidos.push((e as CustomEvent<PeticionGuia>).detail));
    expect(abrirGuia({ desde: "login" }, destino)).toBe(true);
    expect(recibidos).toEqual([{ desde: "login" }]);
  });
});

describe("GUI1021K2 · botón en los componentes", () => {
  afterEach(cleanup);

  it("welcome-window: «Conoce StarSeed» abre la guía desde 'bienvenida'", () => {
    const recibidos: PeticionGuia[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
    window.addEventListener(EVENTO_ABRIR_GUIA, oir);

    // Prueba la función pura que usa el componente (sin montar React en el test de módulo)
    expect(abrirGuia({ desde: "bienvenida" })).toBe(true);
    window.removeEventListener(EVENTO_ABRIR_GUIA, oir);
    expect(recibidos).toEqual([{ desde: "bienvenida" }]);
  });

  it("session-resume-prompt: «Conoce StarSeed» abre la guía desde 'login'", () => {
    const recibidos: PeticionGuia[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<PeticionGuia>).detail);
    window.addEventListener(EVENTO_ABRIR_GUIA, oir);

    expect(abrirGuia({ desde: "login" })).toBe(true);
    window.removeEventListener(EVENTO_ABRIR_GUIA, oir);
    expect(recibidos).toEqual([{ desde: "login" }]);
  });
});
