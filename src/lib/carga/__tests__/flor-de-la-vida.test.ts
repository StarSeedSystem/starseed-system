import { describe, expect, it } from "vitest";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";
import { RADIO_ESCENA, circulosDeLaFlor, colorDeLado, radioCirculo } from "../flor-de-la-vida";

const [ZENITH, HORIZON, LOGIC, ANCHOR] = PALETAS.trinity.colores;

describe("flor de la vida del respaldo de la carga", () => {
  it("son 19 círculos iguales, y la envolvente (3r) llega al 91 % del radio de la escena", () => {
    const c = circulosDeLaFlor();
    expect(c).toHaveLength(19);
    expect(new Set(c.map((x) => x.r.toFixed(6))).size).toBe(1);
    expect(3 * radioCirculo()).toBeCloseTo(RADIO_ESCENA * 0.91, 1);
    // Ningún círculo se sale de la escena (el borde exterior de los de la 2.ª corona toca la envolvente).
    for (const { x, y, r } of c) expect(Math.hypot(x, y) + r).toBeLessThanOrEqual(3 * radioCirculo() + 1e-6);
  });

  it("cada lado de la flor lleva el color de la Trinidad de la identidad: arriba Zenith, derecha Logic, abajo Anchor, izquierda Horizon", () => {
    // El eje y del SVG crece hacia abajo: «arriba» es y negativo.
    expect(colorDeLado(0, -20)).toBe(ZENITH);
    expect(colorDeLado(20, 0)).toBe(LOGIC);
    expect(colorDeLado(0, 20)).toBe(ANCHOR);
    expect(colorDeLado(-20, 0)).toBe(HORIZON);
    expect(ZENITH).toBe("#007FFF");
    expect(LOGIC).toBe("#FFBF00");
    expect(ANCHOR).toBe("#DC143C");
    expect(HORIZON).toBe("#10B981");
    // Las diagonales caen en el cuadrante que toca, y el círculo central es el brillo de la marca.
    expect(colorDeLado(10, -12)).toBe(ZENITH);
    expect(colorDeLado(12, 10)).toBe(LOGIC);
    expect(colorDeLado(-12, 10)).toBe(HORIZON);
    expect(colorDeLado(0, 0)).toBe(PALETAS.trinity.brillo);
  });

  it("los 19 círculos usan solo colores de la marca (nunca un hexadecimal inventado)", () => {
    const permitidos = new Set<string>([...PALETAS.trinity.colores, PALETAS.trinity.brillo]);
    for (const c of circulosDeLaFlor()) expect(permitidos.has(c.color)).toBe(true);
    // Y están los cuatro lados.
    const usados = new Set(circulosDeLaFlor().map((c) => c.color));
    for (const color of PALETAS.trinity.colores) expect(usados.has(color)).toBe(true);
  });
});
