import { describe, it, expect, afterEach } from "vitest";
import type { ComponentType } from "react";
import { render, cleanup } from "@testing-library/react";
import {
  CulturaDemo,
  DEMOS_RED,
  EducacionDemo,
  GenesisDemo,
  LibreriaBibliotecaDemo,
  PersonalizacionSeguraDemo,
  PoliticaDemo,
  type DemoRedProps,
} from "../demos-red";

afterEach(() => cleanup());

const DEMOS: Array<[string, ComponentType<DemoRedProps>, RegExp]> = [
  ["PoliticaDemo", PoliticaDemo, /^Política: .*delega/],
  ["EducacionDemo", EducacionDemo, /^Educación: .*Mapa del Conocimiento.*insignia/],
  ["CulturaDemo", CulturaDemo, /^Cultura: .*obra única.*referencia/],
  ["LibreriaBibliotecaDemo", LibreriaBibliotecaDemo, /^Librería y Biblioteca: .*referencia, no una copia/],
  ["GenesisDemo", GenesisDemo, /^Genesis: .*vista previa.*deshacer/],
  ["PersonalizacionSeguraDemo", PersonalizacionSeguraDemo, /^Personalización segura: .*núcleo/],
];

describe("demos-red · demostraciones animadas de la guía (GUI1021E)", () => {
  for (const [nombre, Demo, etiqueta] of DEMOS) {
    for (const reduce of [false, true]) {
      it(`${nombre} pinta un svg accesible en español (reduce=${reduce})`, () => {
        const { container } = render(<Demo accent="#C9A8FF" reduce={reduce} />);
        const svg = container.querySelector('svg[role="img"]');
        expect(svg).not.toBeNull();
        const nombreAccesible = svg?.getAttribute("aria-label") ?? "";
        expect(nombreAccesible).toMatch(etiqueta);
        expect(nombreAccesible.length).toBeGreaterThan(40);
        // El brillo es de cada instancia: su id está declarado dentro del propio svg.
        const filtro = svg?.querySelector("filter")?.getAttribute("id") ?? "";
        expect(filtro).toMatch(/^brillo-[\w-]+$/);
      });
    }
  }

  it("dos demos a la vez no comparten el id del brillo", () => {
    const { container } = render(
      <>
        <GenesisDemo accent="#7FD4FF" reduce />
        <GenesisDemo accent="#7FD4FF" reduce />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("filter")).map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("el mapa por tema cubre las seis claves de guias-introduccion.md §3", () => {
    expect(Object.keys(DEMOS_RED).sort()).toEqual(
      ["genesis", "libreria-biblioteca", "personalizacion-segura", "pilar-cultura", "pilar-educacion", "pilar-politica"],
    );
  });
});
