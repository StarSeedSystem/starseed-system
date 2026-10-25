import { describe, expect, it } from "vitest";
import type { DifusionConfig } from "../background-layers";
import {
  DESENFOQUE_MAX_PX,
  colorConOpacidad,
  estiloDifusion,
  estiloMascara,
  texturaSvg,
} from "../difusion";

const base: DifusionConfig = { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna" };

describe("estiloDifusion", () => {
  it("transparente: deja pasar sin tinte, textura ni desenfoque", () => {
    expect(estiloDifusion(base)).toEqual({});
  });

  it("desenfoque: esmerila el fondo sin teñirlo", () => {
    const e = estiloDifusion({ ...base, modo: "desenfoque", desenfoquePx: 24 });
    expect(e.backdropFilter).toBe("blur(24px)");
    expect(e.WebkitBackdropFilter).toBe("blur(24px)");
    expect(e.backgroundColor).toBeUndefined();
  });

  it("blanco y negro: tiñen con la opacidad pedida", () => {
    expect(estiloDifusion({ ...base, modo: "blanco", opacidad: 0.4 }).backgroundColor).toBe("rgba(255, 255, 255, 0.4)");
    expect(estiloDifusion({ ...base, modo: "negro", opacidad: 0.7 }).backgroundColor).toBe("rgba(0, 0, 0, 0.7)");
  });

  it("tono: usa el color elegido; un tono inválido cae a blanco", () => {
    expect(estiloDifusion({ ...base, modo: "tono", tono: "#3366ff", opacidad: 0.5 }).backgroundColor).toBe(
      "rgba(51, 102, 255, 0.5)",
    );
    expect(estiloDifusion({ ...base, modo: "tono", tono: "url(x)", opacidad: 0.5 }).backgroundColor).toBe(
      "rgba(255, 255, 255, 0.5)",
    );
  });

  it("un tinte con desenfoque esmerila además de teñir", () => {
    const e = estiloDifusion({ ...base, modo: "blanco", desenfoquePx: 12, opacidad: 0.3 });
    expect(e.backgroundColor).toBe("rgba(255, 255, 255, 0.3)");
    expect(e.backdropFilter).toBe("blur(12px)");
  });

  it("«transparente» nunca esmerila, aunque llegue desenfoquePx", () => {
    expect(estiloDifusion({ ...base, desenfoquePx: 40 }).backdropFilter).toBeUndefined();
  });

  it("acota desenfoque y opacidad, y tolera valores no numéricos", () => {
    const alto = estiloDifusion({ ...base, modo: "desenfoque", desenfoquePx: 999 });
    expect(alto.backdropFilter).toBe(`blur(${DESENFOQUE_MAX_PX}px)`);
    expect(estiloDifusion({ ...base, modo: "desenfoque", desenfoquePx: -4 }).backdropFilter).toBeUndefined();
    expect(estiloDifusion({ ...base, modo: "negro", opacidad: 3 }).backgroundColor).toBe("rgba(0, 0, 0, 1)");
    expect(estiloDifusion({ ...base, modo: "negro", opacidad: Number.NaN }).backgroundColor).toBe("rgba(0, 0, 0, 1)");
    expect(estiloDifusion({ ...base, modo: "desenfoque", desenfoquePx: Number.NaN }).backdropFilter).toBeUndefined();
  });

  it("un modo desconocido cae a transparente", () => {
    expect(estiloDifusion({ ...base, modo: "raro" as never, desenfoquePx: 20 })).toEqual({});
  });

  it("la textura va como imagen repetida y convive con el tinte", () => {
    const e = estiloDifusion({ ...base, modo: "negro", opacidad: 0.2, textura: "grano" });
    expect(e.backgroundColor).toBe("rgba(0, 0, 0, 0.2)");
    expect(e.backgroundImage).toBe(texturaSvg("grano"));
    expect(e.backgroundSize).toBe("160px 160px");
    expect(e.backgroundRepeat).toBe("repeat");
  });

  it("sin ajustes también responde con el velo transparente", () => {
    expect(estiloDifusion()).toEqual({});
  });
});

describe("texturaSvg", () => {
  it("«ninguna» no pinta textura", () => {
    expect(texturaSvg("ninguna")).toBeUndefined();
    expect(texturaSvg(undefined)).toBeUndefined();
  });

  it("cada textura es un data URL SVG determinista y sin peticiones", () => {
    for (const t of ["grano", "papel", "escarcha"] as const) {
      const url = texturaSvg(t);
      expect(url).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(url).toContain("feTurbulence");
      expect(texturaSvg(t)).toBe(url);
    }
    expect(texturaSvg("grano")).not.toBe(texturaSvg("papel"));
    expect(texturaSvg("papel")).not.toBe(texturaSvg("escarcha"));
  });
});

describe("colorConOpacidad", () => {
  it("expande #rgb y acepta #rrggbb", () => {
    expect(colorConOpacidad("#f00", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(colorConOpacidad("#00ff00", 0.25)).toBe("rgba(0, 255, 0, 0.25)");
  });

  it("un color que no sea hex cae a blanco", () => {
    expect(colorConOpacidad("red", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(colorConOpacidad(undefined, 1)).toBe("rgba(255, 255, 255, 1)");
  });
});

describe("estiloMascara", () => {
  it("radial y lineal recortan con un degradado; ninguna no añade estilo", () => {
    expect(estiloMascara("radial").maskImage).toContain("radial-gradient");
    expect(estiloMascara("lineal").maskImage).toContain("linear-gradient");
    expect(estiloMascara("ninguna")).toEqual({});
    expect(estiloMascara(undefined)).toEqual({});
  });

  it("incluye la variante WebKit para Safari", () => {
    expect(estiloMascara("radial").WebkitMaskImage).toBe(estiloMascara("radial").maskImage);
  });
});
