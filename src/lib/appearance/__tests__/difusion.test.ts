import { describe, it, expect } from "vitest";
import {
  MAX_DESENFOQUE_PX,
  estiloDifusion,
  estiloMascara,
  estiloTransformacion,
  fondoDeDifusion,
  texturaDeDifusion,
} from "../difusion";
import type { DifusionConfig } from "../background-layers";

const base: DifusionConfig = { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna" };
const con = (cambios: Partial<DifusionConfig>): DifusionConfig => ({ ...base, ...cambios });

describe("estiloDifusion por modo", () => {
  it("transparente: sin tinte y sin desenfoque", () => {
    const e = estiloDifusion(con({ modo: "transparente" }));
    expect(e.backgroundColor).toBe("transparent");
    expect(e.backdropFilter).toBeUndefined();
    expect(e.WebkitBackdropFilter).toBeUndefined();
    expect(e.backgroundImage).toBeUndefined();
  });

  it("desenfoque: aplica blur en los dos nombres CSS y deja el fondo transparente", () => {
    const e = estiloDifusion(con({ modo: "desenfoque", desenfoquePx: 24 }));
    expect(e.backdropFilter).toBe("blur(24px)");
    expect(e.WebkitBackdropFilter).toBe("blur(24px)");
    expect(e.backgroundColor).toBe("transparent");
    expect(estiloDifusion(con({ modo: "desenfoque", desenfoquePx: 0 })).backdropFilter).toBeUndefined();
  });

  it("blanco y negro: tiñen con la opacidad pedida", () => {
    expect(estiloDifusion(con({ modo: "blanco", opacidad: 0.5 })).backgroundColor).toBe("rgba(255, 255, 255, 0.5)");
    expect(estiloDifusion(con({ modo: "negro", opacidad: 0.25 })).backgroundColor).toBe("rgba(0, 0, 0, 0.25)");
  });

  it("tono: convierte el hexadecimal a rgba con la opacidad pedida", () => {
    const e = estiloDifusion(con({ modo: "tono", tono: "#a533f8", opacidad: 0.4 }));
    expect(e.backgroundColor).toBe("rgba(165, 51, 248, 0.4)");
  });

  it("tono corto, tonalidad con alfa y tono inválido caen en un valor seguro", () => {
    expect(estiloDifusion(con({ modo: "tono", tono: "#0f8" })).backgroundColor).toBe("rgba(0, 255, 136, 1)");
    expect(estiloDifusion(con({ modo: "tono", tono: "#ff000080", opacidad: 1 })).backgroundColor)
      .toBe("rgba(255, 0, 0, 0.502)");
    expect(estiloDifusion(con({ modo: "tono", tono: "url(x)" })).backgroundColor).toBe("rgba(255, 255, 255, 1)");
  });

  it("acota la opacidad y el desenfoque a sus rangos", () => {
    expect(fondoDeDifusion(con({ modo: "blanco", opacidad: -3 }))).toBe("rgba(255, 255, 255, 0)");
    expect(fondoDeDifusion(con({ modo: "negro", opacidad: 9 }))).toBe("rgba(0, 0, 0, 1)");
    expect(estiloDifusion(con({ modo: "desenfoque", desenfoquePx: 500 })).backdropFilter)
      .toBe(`blur(${MAX_DESENFOQUE_PX}px)`);
    expect(estiloDifusion(con({ modo: "desenfoque", desenfoquePx: Number.NaN })).backdropFilter).toBeUndefined();
  });
});

describe("texturas de difusión", () => {
  it("grano, papel y escarcha son data URL SVG de ruido, sin red", () => {
    expect(texturaDeDifusion("ninguna")).toBeUndefined();
    for (const textura of ["grano", "papel", "escarcha"] as const) {
      const url = texturaDeDifusion(textura);
      expect(url?.startsWith('url("data:image/svg+xml,')).toBe(true);
      const svg = decodeURIComponent(url ?? "");
      expect(svg).toContain("<feTurbulence");
      expect(svg).toContain("seed=");
      expect(svg).not.toContain("src=");
      expect(svg).not.toContain("href=");
    }
  });

  it("es determinista y cada textura es distinta", () => {
    const a = texturaDeDifusion("grano");
    const b = texturaDeDifusion("grano");
    expect(a).toBe(b);
    expect(new Set([texturaDeDifusion("grano"), texturaDeDifusion("papel"), texturaDeDifusion("escarcha")]).size).toBe(3);
  });

  it("la textura entra en el estilo con tamaño de mosaico y repetición", () => {
    const e = estiloDifusion(con({ modo: "negro", textura: "papel" }));
    expect(e.backgroundImage?.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(e.backgroundSize).toBe("160px 160px");
    expect(e.backgroundRepeat).toBe("repeat");
  });
});

describe("máscara y transformación", () => {
  it("sin máscara no declara ninguna imagen de máscara", () => {
    expect(estiloMascara("ninguna")).toEqual({});
    expect(estiloMascara(undefined)).toEqual({});
  });

  it("radial enfoca el centro y lineal baja de opaco a transparente", () => {
    const radial = estiloMascara("radial");
    expect(radial.maskImage).toContain("radial-gradient");
    expect(radial.WebkitMaskImage).toBe(radial.maskImage);
    const lineal = estiloMascara("lineal");
    expect(lineal.maskImage).toContain("linear-gradient");
    expect(lineal.WebkitMaskImage).toBe(lineal.maskImage);
  });

  it("sin transformación cubre todo el lienzo", () => {
    expect(estiloTransformacion(undefined)).toMatchObject({
      position: "absolute", left: "0%", top: "0%", width: "100%", height: "100%",
      transform: "scale(1) rotate(0deg)",
    });
  });

  it("aplica posición, tamaño y giro relativos y acota lo que se sale", () => {
    expect(estiloTransformacion({ x: 0.25, y: 0.5, escala: 0.5, rotacion: 45, ancho: 0.5, alto: 0.75 }))
      .toMatchObject({ left: "25%", top: "50%", width: "50%", height: "75%", transform: "scale(0.5) rotate(45deg)" });
    expect(estiloTransformacion({ x: -1, y: 3, escala: 4, rotacion: 999, ancho: -2, alto: 8 }))
      .toMatchObject({ left: "0%", top: "100%", width: "0%", height: "100%", transform: "scale(1) rotate(360deg)" });
  });
});
