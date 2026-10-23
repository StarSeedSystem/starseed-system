// Pruebas puras del perfil de marca de los diagramas (PURO).
// Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/):
// references/style-guide.md (roles, tipografías, trazos y contraste) y
// references/profiles.md (cabecera del perfil activo). Contrato:
// architecture/diagramas.md §3, ampliado por protomolecula.md,
// laya-y-habilidades.md, fondos-shaders.md, video-hyperframes.md y starseed-xr.md.
// Sin red, sin navegador real y sin `any`.

import { describe, it, expect } from "vitest";
import { perfilDesdeTema, bloquePerfil } from "../perfil-marca";
import type { ThemeTokens } from "@/lib/design/theme-engine";

interface Rgb { r: number; g: number; b: number }

function rgbDeHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(rgbDeHex(a)), luminancia(rgbDeHex(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const temaClaro: ThemeTokens = {
  vars: { "background-hsl": "45 8% 96%", "foreground-hsl": "222 17% 19%", "accent-hsl": "16 71% 44%", "ring-hsl": "216 55% 36%" },
  fontFamily: "Atkinson Hyperlegible",
};
const temaOscuro: ThemeTokens = {
  vars: { "background-hsl": "222 17% 19%", "foreground-hsl": "45 8% 96%", "accent-hsl": "20 85% 64%" },
};

const textos = (p: ReturnType<typeof perfilDesdeTema>) => [p.ink, p.muted, p.soft, p.accent, p.link];

describe("perfilDesdeTema con un tema claro", () => {
  const perfil = perfilDesdeTema(temaClaro, "claro");

  it("extrae papel, tinta y acento con contraste AA frente al papel", () => {
    expect(perfil.modo).toBe("claro");
    expect(perfil.paper).toMatch(/^#[0-9a-f]{6}$/);
    expect(perfil.paper2).not.toBe(perfil.paper);
    for (const token of textos(perfil)) expect(contraste(token, perfil.paper)).toBeGreaterThanOrEqual(4.5);
    expect(perfil.contraste.cumpleAA).toBe(true);
  });

  it("usa la fuente del OS y los trazos de la guía, sin pedir Google Fonts", () => {
    expect(perfil.tipografia.fuente).toBe("sistema");
    expect(perfil.tipografia.nodeName.family).toContain("Atkinson Hyperlegible");
    expect(perfil.tipografia.title.family).toContain("Instrument Serif");
    expect(perfil.tipografia.sublabel.family).toContain("Geist Mono");
    expect(perfil.trazos).toEqual({ thin: 0.8, default: 1, strong: 1.2, radiusSm: 4, radiusMd: 6, radiusLg: 8, grid: 4 });
    expect(JSON.stringify(perfil)).not.toContain("fonts.googleapis");
    expect(JSON.stringify(perfil)).not.toContain("http");
  });
});

describe("perfilDesdeTema con un tema oscuro", () => {
  const perfil = perfilDesdeTema(temaOscuro, "oscuro");

  it("invierte papel y tinta y conserva el mínimo AA en todos los textos", () => {
    expect(perfil.modo).toBe("oscuro");
    expect(luminancia(rgbDeHex(perfil.paper))).toBeLessThan(luminancia(rgbDeHex(perfil.ink)));
    for (const token of textos(perfil)) expect(contraste(token, perfil.paper)).toBeGreaterThanOrEqual(4.5);
    expect(perfil.contraste.cumpleAA).toBe(true);
    expect(contraste(perfil.inkStrong, perfil.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("perfilDesdeTema con fondo de Shaders", () => {
  const paleta = ["#101828", "#4f2d7f", "#f08a59", "#e8e2d8"];
  const perfil = perfilDesdeTema(temaClaro, "oscuro", paleta);

  it("toma el papel más oscuro y el acento más cromático de la paleta", () => {
    expect(perfil.nombre).toContain("fondo");
    expect(perfil.slug).toContain("fondo");
    const lPapel = luminancia(rgbDeHex(perfil.paper));
    for (const color of paleta) expect(lPapel).toBeLessThanOrEqual(luminancia(rgbDeHex(color)) + 0.0001);
    expect([perfil.accent, perfil.link, perfil.ink]).not.toContain(perfil.paper);
    expect(perfil.contraste.cumpleAA).toBe(true);
  });
});

describe("bloquePerfil", () => {
  const base = perfilDesdeTema(temaClaro, "claro");

  it("escribe una sola cabecera con el formato de references/profiles.md", () => {
    const bloque = bloquePerfil({
      ...base, nombre: "Acme Corporation", slug: "acme", fuenteUrl: "https://example.com",
      notas: "Marca -- principal\nsegunda línea", creado: "2026-08-14", actualizado: "2026-08-15",
    });
    expect(bloque.startsWith("<!-- diagram-design-profile\n")).toBe(true);
    expect(bloque).toContain("name: Acme Corporation");
    expect(bloque).toContain("slug: acme");
    expect(bloque).toContain("source-url: https://example.com");
    expect(bloque).toContain("created: 2026-08-14");
    expect(bloque).toContain("updated: 2026-08-15");
    expect(bloque).toContain("notes: Marca - principal segunda línea");
    expect(bloque.trimEnd().endsWith("-->")).toBe(true);
    expect(bloque.split("<!-- diagram-design-profile").length - 1).toBe(1);
    expect(bloque.trimEnd().split("-->").length - 1).toBe(1);
  });

  it("completa con none los campos ausentes y sanea el slug", () => {
    const bloque = bloquePerfil({ ...base, nombre: "Árbol de Marca", slug: "Árbol/Privado" });
    expect(bloque).toContain("slug: arbol-privado");
    expect(bloque).toContain("source-url: none");
    expect(bloque).toContain("notes: none");
  });
});
