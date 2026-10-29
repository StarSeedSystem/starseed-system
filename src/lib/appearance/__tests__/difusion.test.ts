import { describe, expect, it } from "vitest";
import { colorConOpacidad, estiloDifusion, texturaDifusion } from "../difusion";
import type { DifusionConfig } from "../background-layers";

const base: DifusionConfig = { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna" };
const con = (cambios: Partial<DifusionConfig>): Partial<DifusionConfig> => ({ ...base, ...cambios });

describe("estiloDifusion · modos", () => {
  it("transparente no pinta tono, textura ni desenfoque", () => {
    const estilo = estiloDifusion(base);
    expect(estilo.backgroundColor).toBe("transparent");
    expect(estilo.backgroundImage).toBeUndefined();
    expect(estilo.backdropFilter).toBeUndefined();
    expect(estilo.pointerEvents).toBe("none");
  });

  it("desenfoque aplica blur con la intensidad indicada y su prefijo WebKit", () => {
    const estilo = estiloDifusion(con({ modo: "desenfoque", desenfoquePx: 24 }));
    expect(estilo.backdropFilter).toBe("blur(24px)");
    expect(estilo.WebkitBackdropFilter).toBe("blur(24px)");
    expect(estilo.backgroundColor).toBe("transparent");
  });

  it("blanco pinta blanco con la opacidad de la capa", () => {
    expect(estiloDifusion(con({ modo: "blanco", opacidad: 0.4 })).backgroundColor).toBe("rgba(255, 255, 255, 0.4)");
  });

  it("negro pinta negro con la opacidad de la capa", () => {
    expect(estiloDifusion(con({ modo: "negro", opacidad: 0.75 })).backgroundColor).toBe("rgba(0, 0, 0, 0.75)");
  });

  it("tono usa el color elegido en formato rgba", () => {
    expect(estiloDifusion(con({ modo: "tono", tono: "#a533f8", opacidad: 0.5 })).backgroundColor).toBe("rgba(165, 51, 248, 0.5)");
    expect(colorConOpacidad("#0af", 1)).toBe("rgba(0, 170, 255, 1)");
    expect(colorConOpacidad("#11223380", 1)).toBe("rgba(17, 34, 51, 1)");
  });

  it("tono con un valor seguro no hexadecimal pasa por color-mix", () => {
    expect(colorConOpacidad("tomato", 0.25)).toBe("color-mix(in srgb, tomato 25%, transparent)");
  });

  it("un tono vacío o sospechoso cae a transparente, nunca a CSS inyectado", () => {
    expect(colorConOpacidad(undefined, 1)).toBe("transparent");
    expect(colorConOpacidad("   ", 1)).toBe("transparent");
    expect(colorConOpacidad("url(javascript:alert(1))", 1)).toBe("transparent");
    expect(colorConOpacidad("#12", 1)).toBe("transparent");
  });

  it("un modo desconocido se comporta como transparente", () => {
    const estilo = estiloDifusion({ modo: "brillo" as DifusionConfig["modo"] });
    expect(estilo.backgroundColor).toBe("transparent");
    expect(estilo.backdropFilter).toBeUndefined();
  });
});

describe("estiloDifusion · límites", () => {
  it("recorta el desenfoque a 0-80 px", () => {
    expect(estiloDifusion(con({ modo: "desenfoque", desenfoquePx: 400 })).backdropFilter).toBe("blur(80px)");
    expect(estiloDifusion(con({ modo: "desenfoque", desenfoquePx: -10 })).backdropFilter).toBeUndefined();
  });

  it("recorta la opacidad a 0-1 y un valor no numérico cae a 1", () => {
    expect(estiloDifusion(con({ modo: "negro", opacidad: 2 })).backgroundColor).toBe("rgba(0, 0, 0, 1)");
    expect(estiloDifusion(con({ modo: "negro", opacidad: -1 })).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(estiloDifusion(con({ modo: "negro", opacidad: Number.NaN })).backgroundColor).toBe("rgba(0, 0, 0, 1)");
  });

  it("solo el modo desenfoque desenfoca: un valor viejo en otro modo se ignora", () => {
    expect(estiloDifusion(con({ modo: "blanco", desenfoquePx: 24 })).backdropFilter).toBeUndefined();
  });
});

describe("texturaDifusion · ruido determinista", () => {
  it("genera un data URL SVG sin recursos de red ni shaders.com", () => {
    for (const textura of ["grano", "papel", "escarcha"] as const) {
      const r = texturaDifusion(textura, 1);
      expect(r).not.toBeNull();
      expect(r!.url.startsWith("data:image/svg+xml,")).toBe(true);
      expect(decodeURIComponent(r!.url)).toContain("feTurbulence");
      expect(r!.url).not.toContain("shaders.com");
      expect(r!.url).not.toContain("https://");
    }
  });

  it("es determinista: dos llamadas iguales dan la misma URL", () => {
    expect(texturaDifusion("grano", 0.6)).toEqual(texturaDifusion("grano", 0.6));
    expect(texturaDifusion("grano", 1)!.url).not.toBe(texturaDifusion("papel", 1)!.url);
  });

  it("la intensidad del ruido escala con la opacidad", () => {
    const tenue = decodeURIComponent(texturaDifusion("grano", 0.5)!.url);
    const pleno = decodeURIComponent(texturaDifusion("grano", 1)!.url);
    expect(tenue).toContain("opacity='0.160'");
    expect(pleno).toContain("opacity='0.320'");
  });

  it("«ninguna» no produce textura", () => {
    expect(texturaDifusion("ninguna", 1)).toBeNull();
    expect(estiloDifusion(con({ textura: "ninguna" })).backgroundImage).toBeUndefined();
  });

  it("la textura se aplica como mosaico en el estilo", () => {
    const estilo = estiloDifusion(con({ modo: "negro", opacidad: 0.5, textura: "grano" }));
    expect(String(estilo.backgroundImage)).toContain("data:image/svg+xml,");
    expect(estilo.backgroundSize).toBe("120px 120px");
    expect(estilo.backgroundRepeat).toBe("repeat");
    expect(estilo.backgroundColor).toBe("rgba(0, 0, 0, 0.5)");
  });
});
