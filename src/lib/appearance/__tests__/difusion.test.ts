import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapaDifusion } from "@/components/backgrounds/capa-difusion";
import type { BackgroundLayer, DifusionConfig, Transform } from "../background-layers";
import {
  MAX_DESENFOQUE_PX,
  estiloDifusion,
  estiloTransformDifusion,
  mascaraDifusion,
  texturaDifusion,
  veloDifusion,
} from "../difusion";

const d = (cambios: Partial<DifusionConfig>): DifusionConfig => ({
  modo: "transparente",
  desenfoquePx: 0,
  opacidad: 1,
  textura: "ninguna",
  ...cambios,
});

describe("veloDifusion", () => {
  it("cada modo con su velo", () => {
    expect(veloDifusion(d({}))).toBeUndefined(); // «transparente»: solo textura, si la hay
    expect(veloDifusion(d({ modo: "blanco", opacidad: 0.4 }))).toBe("rgba(255, 255, 255, 0.4)");
    expect(veloDifusion(d({ modo: "negro", opacidad: 0.6 }))).toBe("rgba(0, 0, 0, 0.6)");
    expect(veloDifusion(d({ modo: "tono", tono: "#1d4ed8", opacidad: 0.5 })))
      .toBe("color-mix(in srgb, #1d4ed8 50%, transparent)");
    expect(veloDifusion(d({ modo: "desenfoque", opacidad: 1 }))).toBe("rgba(255, 255, 255, 0.12)");
    expect(veloDifusion(d({ modo: "desenfoque", opacidad: 0.5 }))).toBe("rgba(255, 255, 255, 0.06)");
  });

  it("modo tono sin tono → cae al blanco (saneado defensivo)", () => {
    expect(veloDifusion(d({ modo: "tono", opacidad: 1 }))).toBe("color-mix(in srgb, #ffffff 100%, transparent)");
  });

  it("opacidad 0 → sin velo en CUALQUIER modo", () => {
    expect(veloDifusion(d({ modo: "blanco", opacidad: 0 }))).toBeUndefined();
    expect(veloDifusion(d({ modo: "negro", opacidad: 0 }))).toBeUndefined();
    expect(veloDifusion(d({ modo: "tono", tono: "#1d4ed8", opacidad: 0 }))).toBeUndefined();
    expect(veloDifusion(d({ modo: "desenfoque", opacidad: 0 }))).toBeUndefined();
  });

  it("opacidad fuera de rango → se recorta a 1 y a 0", () => {
    expect(veloDifusion(d({ modo: "blanco", opacidad: 3 }))).toBe("rgba(255, 255, 255, 1)");
    expect(veloDifusion(d({ modo: "blanco", opacidad: -2 }))).toBeUndefined();
  });
});

describe("texturaDifusion", () => {
  it("ninguna → sin textura; cada una es una data URL SVG determinista", () => {
    expect(texturaDifusion("ninguna")).toBeUndefined();
    const rellenos = new Set<string>();
    for (const t of ["grano", "papel", "escarcha"] as const) {
      const primera = texturaDifusion(t);
      expect(primera).toMatch(/^data:image\/svg\+xml,/);
      expect(decodeURIComponent(primera ?? "")).toContain("feTurbulence");
      expect(decodeURIComponent(primera ?? "")).toContain(`stitchTiles="stitch"`);
      expect(texturaDifusion(t)).toBe(primera); // misma semilla → mismo ruido
      if (primera) rellenos.add(primera);
    }
    expect(rellenos.size).toBe(3); // texturas distintas → ruidos distintos
  });
});

describe("estiloDifusion", () => {
  it("modo transparente sin textura → estilo vacío", () => {
    expect(estiloDifusion(d({}))).toEqual({});
  });

  it("modo desenfoque → backdrop-filter blur con su píxel, webkit y recorte al tope", () => {
    expect(estiloDifusion(d({ modo: "desenfoque", desenfoquePx: 12 })).backdropFilter).toBe("blur(12px)");
    expect(estiloDifusion(d({ modo: "desenfoque", desenfoquePx: 12 })).WebkitBackdropFilter).toBe("blur(12px)");
    expect(estiloDifusion(d({ modo: "desenfoque", desenfoquePx: 0 })).backdropFilter).toBeUndefined();
    expect(estiloDifusion(d({ modo: "desenfoque", desenfoquePx: 500 })).backdropFilter)
      .toBe(`blur(${MAX_DESENFOQUE_PX}px)`);
  });

  it("modo tono → color de fondo con el tono mezclado", () => {
    const e = estiloDifusion(d({ modo: "tono", tono: "#1d4ed8", opacidad: 0.7 }));
    expect(e.backgroundColor).toBe("color-mix(in srgb, #1d4ed8 70%, transparent)");
  });

  it("textura junto al velo: imagen en tesela y tamaño armónico fijo", () => {
    const e = estiloDifusion(d({ textura: "grano" }));
    expect(e.backgroundImage).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(e.backgroundSize).toBe("144px 144px");
    const n = estiloDifusion(d({ modo: "negro", opacidad: 0.8, textura: "papel" }));
    expect(n.backgroundColor).toBe("rgba(0, 0, 0, 0.8)");
    expect(n.backgroundSize).toBe("233px 233px");
  });
});

describe("estiloTransformDifusion", () => {
  it("posición y tamaño relativos en porcentaje, con escala y rotación", () => {
    const t: Transform = { x: 0.25, y: 0.5, escala: 1.5, rotacion: 13, ancho: 0.618, alto: 0.382 };
    expect(estiloTransformDifusion(t)).toEqual({
      left: "25%", top: "50%", width: "61.8%", height: "38.2%", transform: "scale(1.5) rotate(13deg)",
    });
  });

  it("transform por defecto de la capa → pantalla completa sin transformación", () => {
    const t: Transform = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };
    expect(estiloTransformDifusion(t)).toEqual({
      left: "0%", top: "0%", width: "100%", height: "100%", transform: "scale(1) rotate(0deg)",
    });
  });
});

describe("mascaraDifusion", () => {
  it("ninguna → sin máscara; radial y lineal se desvanecen en los bordes", () => {
    expect(mascaraDifusion("ninguna")).toBeUndefined();
    const r = mascaraDifusion("radial");
    expect(r?.maskImage).toContain("radial-gradient");
    expect(r?.maskImage).toBe(r?.WebkitMaskImage);
    const l = mascaraDifusion("lineal");
    expect(l?.maskImage).toContain("linear-gradient");
    expect(l?.maskImage).toBe(l?.WebkitMaskImage);
  });
});

describe("CapaDifusion", () => {
  const capa = (cambios: Partial<BackgroundLayer>): BackgroundLayer => ({
    id: "d1",
    kind: "difusion",
    visible: true,
    opacity: 1,
    blend: "normal",
    difusion: d({}),
    transform: { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 },
    mascara: "ninguna",
    ...cambios,
  });

  it("aplica el estilo puro, la transformación y la máscara de la capa", () => {
    const html = renderToStaticMarkup(createElement(CapaDifusion, {
      capa: capa({
        opacity: 0.5,
        difusion: d({ modo: "desenfoque", desenfoquePx: 24, textura: "grano" }),
        transform: { x: 0.25, y: 0, escala: 2, rotacion: 13, ancho: 0.5, alto: 1 },
        mascara: "radial",
      }),
    }));
    expect(html).toContain("backdrop-filter:blur(24px)");
    expect(html).toContain("-webkit-backdrop-filter:blur(24px)");
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("background-size:144px 144px");
    expect(html).toContain("left:25%");
    expect(html).toContain("width:50%");
    expect(html).toContain("transform:scale(2) rotate(13deg)");
    expect(html).toContain("mask-image:radial-gradient");
    expect(html).toContain("opacity:0.5");
  });

  it("capa invisible o sin configuración no se pinta", () => {
    expect(renderToStaticMarkup(createElement(CapaDifusion, { capa: capa({ visible: false }) }))).toBe("");
    expect(renderToStaticMarkup(createElement(CapaDifusion, { capa: capa({ difusion: undefined }) }))).toBe("");
  });
});
