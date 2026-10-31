import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { CapaDifusion } from "@/components/ui/backgrounds/capa-difusion";
import { createLayer } from "@/lib/appearance/background-layers";

describe("CapaDifusion - renderizado", () => {
  it("renderiza capa difusion visible con modo transparente", () => {
    const layer = {
      ...createLayer("difusion"),
      kind: "difusion",
      visible: true,
      opacity: 0.5,
      blend: "overlay",
      difusion: {
        modo: "transparente",
        desenfoquePx: 0,
        opacidad: 1,
        textura: "ninguna",
      } as any,
      transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
      mascara: "ninguna",
    } as any;

    const result = render(<CapaDifusion layer={layer} />);
    const div = result.container.firstChild;
    expect(div).toBeTruthy();
    const style = div.getAttribute("style") || "";
    expect(style).toContain("opacity: 0.5");
    expect(style).toContain("mix-blend-mode: overlay");
  });

  it("no renderiza capa difusion cuando visible es false", () => {
    const layer = {
      ...createLayer("difusion"),
      kind: "difusion",
      visible: false,
      opacity: 0.5,
      blend: "normal",
      difusion: {
        modo: "transparente",
        desenfoquePx: 0,
        opacidad: 1,
        textura: "ninguna",
      } as any,
    } as any;

    const result = render(<CapaDifusion layer={layer} />);
    expect(result.container.firstChild).not.toBeTruthy();
  });

  it("aplica transform a la capa difusion", () => {
    const layer = {
      ...createLayer("difusion"),
      kind: "difusion",
      visible: true,
      opacity: 0.5,
      blend: "screen",
      difusion: {
        modo: "desenfoque",
        desenfoquePx: 20,
        opacidad: 0.8,
        textura: "ninguna",
      } as any,
      transform: { x: 10, y: 15, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
      mascara: "lineal",
    } as any;

    const result = render(<CapaDifusion layer={layer} />);
    const div = result.container.firstChild;
    const style = div!.getAttribute("style") || "";
    expect(style).toContain("translate(10%, 15%)");
    expect(style).toContain("scale(1)");
    expect(style).toContain("rotate(0deg)");
  });
});

describe("createLayer - capas shader y difusion", () => {
  it("createLayer crea capa shader con defaults", () => {
    const layer = createLayer("shader");
    expect(layer.kind).toBe("shader");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.blend).toBe("normal");
    expect(layer.preset).toBeDefined();
    expect(layer.transform).toBeDefined();
    expect(layer.mascara).toBe("ninguna");
  });

  it("createLayer crea capa difusion con defaults", () => {
    const layer = createLayer("difusion");
    expect(layer.kind).toBe("difusion");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.blend).toBe("normal");
    expect(layer.difusion).toBeDefined();
    expect(layer.transform).toBeDefined();
    expect(layer.mascara).toBe("ninguna");
  });
});