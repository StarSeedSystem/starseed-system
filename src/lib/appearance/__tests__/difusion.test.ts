import { describe, it, expect } from "vitest";
import type { DifusionConfig } from "../background-layers";
import { DESENFOQUE_MAX, DESENFOQUE_MINIMO, TONO_DEFECTO, estiloCapa, estiloDifusion, texturaDifusion } from "../difusion";

const config = (patch: Partial<DifusionConfig> = {}): DifusionConfig => ({
  modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna", ...patch,
});

describe("difusion · estilos por modo", () => {
  it("transparente: ni tinte ni filtro si no se pide desenfoque", () => {
    const e = estiloDifusion(config());
    expect(e.backgroundColor).toBe("transparent");
    expect(e.backdropFilter).toBeUndefined();
    expect(e.opacity).toBe(1);
  });

  it("desenfoque: cristal esmerilado con mínimo, también en WebKit", () => {
    const e = estiloDifusion(config({ modo: "desenfoque", desenfoquePx: 0 }));
    expect(e.backdropFilter).toBe(`blur(${DESENFOQUE_MINIMO}px)`);
    expect(e.WebkitBackdropFilter).toBe(e.backdropFilter);
    expect(e.backgroundColor).toBe("transparent");
  });

  it("blanco y negro: velo opaco con su tono", () => {
    expect(estiloDifusion(config({ modo: "blanco" })).backgroundColor).toBe("#ffffff");
    expect(estiloDifusion(config({ modo: "negro" })).backgroundColor).toBe("#000000");
  });

  it("tono: usa el color elegido; si no es CSS seguro, cae al blanco", () => {
    expect(estiloDifusion(config({ modo: "tono", tono: "hsl(210 80% 40% / 60%)" })).backgroundColor)
      .toBe("hsl(210 80% 40% / 60%)");
    const malos = [undefined, "", "url(https://malo.example/x)", "red; position: fixed", "image-set(x 1x)"];
    for (const tono of malos) expect(estiloDifusion(config({ modo: "tono", tono })).backgroundColor).toBe(TONO_DEFECTO);
  });

  it("acota desenfoque y opacidad sin romper el modo", () => {
    const alto = estiloDifusion(config({ modo: "blanco", desenfoquePx: 999, opacidad: 4 }));
    expect(alto.backdropFilter).toBe(`blur(${DESENFOQUE_MAX}px)`);
    expect(alto.opacity).toBe(1);
    expect(alto.backgroundColor).toBe("#ffffff");
    expect(estiloDifusion(config({ desenfoquePx: -8, opacidad: -1 })))
      .toMatchObject({ backgroundColor: "transparent", opacity: 0 });
  });
});

describe("difusion · texturas deterministas", () => {
  it("ninguna no añade imagen", () => {
    expect(texturaDifusion("ninguna")).toBeUndefined();
  });

  it("cada textura es un SVG de ruido en data URL, sin red", () => {
    for (const t of ["grano", "papel", "escarcha"] as const) {
      const url = texturaDifusion(t);
      expect(url).toMatch(/^data:image\/svg\+xml,/);
      const svg = decodeURIComponent((url ?? "").slice("data:image/svg+xml,".length));
      expect(svg).toContain("<feTurbulence");
      expect(svg).toContain('type="fractalNoise"');
      expect(svg).toContain('stitchTiles="stitch"');
      expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });

  it("misma entrada → mismos bytes; texturas distintas → ruido distinto", () => {
    expect(texturaDifusion("grano")).toBe(texturaDifusion("grano"));
    expect(texturaDifusion("grano")).not.toBe(texturaDifusion("papel"));
    expect(texturaDifusion("papel")).not.toBe(texturaDifusion("escarcha"));
  });

  it("se aplica como fondo repetido y con mezcla, también sobre el velo", () => {
    const e = estiloDifusion(config({ modo: "blanco", textura: "grano" }));
    expect(e.backgroundImage).toBe(`url("${texturaDifusion("grano")}")`);
    expect(e.backgroundSize).toBe("180px 180px");
    expect(e.backgroundRepeat).toBe("repeat");
    expect(e.backgroundBlendMode).toBe("overlay");
  });

  it("una textura desconocida se ignora (config vieja o manipulada)", () => {
    const e = estiloDifusion({ ...config(), textura: "lava" as DifusionConfig["textura"] });
    expect(e.backgroundImage).toBeUndefined();
  });
});

describe("difusion · transformación y máscara", () => {
  it("posición, tamaño, escala y rotación en porcentajes y grados", () => {
    const e = estiloCapa({ x: 0.25, y: 0.5, escala: 2, rotacion: -15, ancho: 0.5, alto: 0.25 }, "ninguna");
    expect(e).toMatchObject({
      left: "0%",
      top: "0%",
      width: "50%",
      height: "25%",
      transform: "translate(25%, 50%) scale(2) rotate(-15deg)",
      transformOrigin: "center",
    });
    expect(e.maskImage).toBeUndefined();
  });

  it("máscara radial y lineal; «ninguna» no recorta", () => {
    expect(estiloCapa(undefined, "radial").maskImage).toMatch(/^radial-gradient/);
    expect(estiloCapa(undefined, "lineal").WebkitMaskImage).toMatch(/^linear-gradient/);
    expect(estiloCapa(undefined, "ninguna").maskImage).toBeUndefined();
  });

  it("sin transformación cubre el contenedor y los valores rotos no se salen de rango", () => {
    expect(estiloCapa(undefined, undefined)).toMatchObject({
      width: "100%",
      height: "100%",
      transform: "translate(0%, 0%) scale(1) rotate(0deg)",
    });
    const roto = estiloCapa({ x: 9, y: -2, escala: 0, rotacion: 999, ancho: 99, alto: 0 }, "ninguna");
    expect(roto).toMatchObject({
      width: "100%",
      height: "5%",
      transform: "translate(100%, 0%) scale(0.05) rotate(360deg)",
    });
  });
});
