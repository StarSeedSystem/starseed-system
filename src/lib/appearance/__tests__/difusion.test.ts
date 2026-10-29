import { describe, it, expect } from "vitest";
import {
  DESENFOQUE_POR_DEFECTO,
  MAX_DESENFOQUE_PX,
  colorConAlfa,
  estiloDifusion,
  texturaDifusion,
} from "../difusion";
import type { DifusionConfig } from "../background-layers";

const base = (cambios: Partial<DifusionConfig> = {}): DifusionConfig => ({
  modo: "transparente",
  desenfoquePx: 0,
  opacidad: 1,
  textura: "ninguna",
  ...cambios,
});

describe("estiloDifusion · modos", () => {
  it("transparente: ni velo ni desenfoque, y nunca captura clics", () => {
    const e = estiloDifusion(base());
    expect(e.backgroundColor).toBeUndefined();
    expect(e.backdropFilter).toBeUndefined();
    expect(e.pointerEvents).toBe("none");
  });

  it("desenfoque: blur sobre lo de abajo (y su prefijo de WebKit)", () => {
    const e = estiloDifusion(base({ modo: "desenfoque", desenfoquePx: 24 }));
    expect(e.backdropFilter).toBe("blur(24px)");
    expect(e.WebkitBackdropFilter).toBe("blur(24px)");
    expect(e.backgroundColor).toBeUndefined();
  });

  it("desenfoque sin valor usa el defecto; por encima del techo se acota", () => {
    expect(estiloDifusion(base({ modo: "desenfoque", desenfoquePx: 0 })).backdropFilter)
      .toBe(`blur(${DESENFOQUE_POR_DEFECTO}px)`);
    expect(estiloDifusion(base({ modo: "desenfoque", desenfoquePx: -5 })).backdropFilter)
      .toBe(`blur(${DESENFOQUE_POR_DEFECTO}px)`);
    expect(estiloDifusion(base({ modo: "desenfoque", desenfoquePx: 999 })).backdropFilter)
      .toBe(`blur(${MAX_DESENFOQUE_PX}px)`);
  });

  it("blanco: velo blanco con la opacidad pedida", () => {
    expect(estiloDifusion(base({ modo: "blanco", opacidad: 1 })).backgroundColor)
      .toBe("rgba(255, 255, 255, 1)");
    expect(estiloDifusion(base({ modo: "blanco", opacidad: 0.35 })).backgroundColor)
      .toBe("rgba(255, 255, 255, 0.35)");
  });

  it("negro: velo negro con la opacidad pedida", () => {
    expect(estiloDifusion(base({ modo: "negro", opacidad: 0.5 })).backgroundColor)
      .toBe("rgba(0, 0, 0, 0.5)");
  });

  it("tono: cualquier color con su alfa; sin tono cae a blanco", () => {
    expect(estiloDifusion(base({ modo: "tono", tono: "#123456", opacidad: 0.4 })).backgroundColor)
      .toBe("rgba(18, 52, 86, 0.4)");
    expect(estiloDifusion(base({ modo: "tono", opacidad: 0.25 })).backgroundColor)
      .toBe("rgba(255, 255, 255, 0.25)");
  });

  it("un modo desconocido cae a transparente en vez de romper", () => {
    const e = estiloDifusion({ ...base(), modo: "inventado" } as unknown as DifusionConfig);
    expect(e.backgroundColor).toBeUndefined();
    expect(e.backdropFilter).toBeUndefined();
  });

  it("la opacidad se acota a 0–1", () => {
    expect(estiloDifusion(base({ modo: "negro", opacidad: 2 })).backgroundColor).toBe("rgba(0, 0, 0, 1)");
    expect(estiloDifusion(base({ modo: "negro", opacidad: -1 })).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});

describe("colorConAlfa", () => {
  it("acepta hex de 3, 4, 6 y 8 cifras", () => {
    expect(colorConAlfa("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
    expect(colorConAlfa("#0000", 1)).toBe("rgba(0, 0, 0, 0)");
    expect(colorConAlfa("#ff000080", 1)).toBe("rgba(255, 0, 0, 0.502)");
  });

  it("cualquier otro color usa color-mix; sin color, blanco", () => {
    expect(colorConAlfa("var(--acento)", 0.5)).toBe("color-mix(in srgb, var(--acento) 50%, transparent)");
    expect(colorConAlfa(undefined, 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });
});

describe("texturaDifusion · ruido determinista sin red", () => {
  it("ninguna no pinta textura", () => {
    expect(texturaDifusion("ninguna")).toBeUndefined();
    expect(texturaDifusion(undefined)).toBeUndefined();
    expect(estiloDifusion(base({ textura: "ninguna" })).backgroundImage).toBeUndefined();
  });

  it.each(["grano", "papel", "escarcha"] as const)("%s: data URL SVG de ruido", (textura) => {
    const url = texturaDifusion(textura);
    expect(url).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(url).toContain("feTurbulence");
    expect(url).not.toMatch(/https?:\/\//);
    expect(texturaDifusion(textura)).toBe(url);
  });

  it("cada textura es distinta y se aplica al estilo", () => {
    const grano = texturaDifusion("grano");
    const papel = texturaDifusion("papel");
    const escarcha = texturaDifusion("escarcha");
    expect(new Set([grano, papel, escarcha]).size).toBe(3);
    const e = estiloDifusion(base({ textura: "papel" }));
    expect(e.backgroundImage).toBe(papel);
    expect(e.backgroundRepeat).toBe("repeat");
    expect(e.backgroundSize).toBe("160px 160px");
  });
});
