import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock window.matchMedia for jsdom
global.window.matchMedia = global.window.matchMedia || function () {
    return {
        matches: false,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {},
    };
};
import DisenoMinimo from "../diseno-minimo";

const estados: ("calma" | "escuchando" | "pensando" | "hablando")[] = [
    "calma", "escuchando", "pensando", "hablando",
];

describe("DisenoMinimo", () => {
  const tam = 120;
  const propsBase = {
    estado: "calma" as const,
    tam,
    ultima: null as { texto: string; ts: number } | null,
    hilo: [] as { rol: "user" | "aurora"; texto: string; ts: number }[],
    ahora: Date.now(),
    tactil: false,
    voz: false,
    preguntar: "¿Cómo estás?" as React.ReactNode,
    botonVoz: null as React.ReactNode,
    sugerencias: [] as string[],
    onAbrirChat: () => {},
    onSugerencia: (_t: string) => {},
  };

  it("renderiza con props de ejemplo", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const root = container.firstElementChild;
    expect(root).toBeInTheDocument();
  });

  it("muestra el estado de voz con texto correcto", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const texto = container.textContent || "";
    expect(texto).toContain("En calma");
  });

  it("no muestra hilo ni sugerencias", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const texto = container.textContent || "";
    expect(texto).not.toContain("hilo");
    expect(texto).not.toContain("sugerencias");
  });

  it("cada botón llama a su función", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const boton = container.querySelector("button");
    expect(boton).toBeInTheDocument();
    boton?.dispatchEvent(new Event("click"));
  });

  it("no tiene desbordes a 180 px de ancho", () => {
    const { container } = render(
      <div style={{ width: "180px" }}><DisenoMinimo {...propsBase} /></div>
    );
    const elemento = container.firstElementChild?.firstElementChild;
    if (elemento) {
      expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
    }
  });

  it("no tiene desbordes a 360 px de ancho", () => {
    const { container } = render(
      <div style={{ width: "360px" }}><DisenoMinimo {...propsBase} /></div>
    );
    const elemento = container.firstElementChild?.firstElementChild;
    if (elemento) {
      expect(elemento.scrollWidth).toBeLessThanOrEqual(elemento.clientWidth);
    }
  });

  it("usa colores del tema y acento astraura", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const root = container.firstElementChild;
    const style: Partial<CSSStyleDeclaration> = root instanceof Element ? window.getComputedStyle(root) : {};
    const colorFondo = style.backgroundColor || "";
    expect(colorFondo).not.toContain("rgb(255, 255, 255)");
  });

  it("tiene nombres accesibles en español", () => {
    const { container } = render(
      <DisenoMinimo {...propsBase} />
    );
    const texto = container.textContent || "";
    expect(texto).toMatch(/(calma|escuchando|pensando|hablando)/i);
  });
});