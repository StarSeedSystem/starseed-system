import { describe, it, expect } from "vitest";
import { 
  generarFacetas, 
  generarRutasSVG, 
  SIMBOLO_BASE, 
  CENTROS_CIRCULOS, 
  ESQUINAS, 
  APICES,
  PUNTOS_BASE 
} from "../simbolo-geometria";

describe("geometría del símbolo StarSeed", () => {
  it("el rombo es equilátero (altura = base·√3/2 ± 0,5)", () => {
    // Triángulo superior: ápice (200,80), base entre (200-69.28,200) y (200+69.28,200)
    const base = ESQUINAS.derecha.x - ESQUINAS.izquierda.x; // ~138.56
    const altura = APICES.superior.y - ESQUINAS.izquierda.y; // 80-200 = -120, |altura| = 120
    const alturaEsperada = (base * Math.sqrt(3)) / 2;
    expect(Math.abs(Math.abs(altura) - alturaEsperada)).toBeLessThanOrEqual(0.5);
  });

  it("hay 12 facetas con sus hex oficiales", () => {
    const facetas = generarFacetas();
    expect(facetas).toHaveLength(12);
    
    // Verificar que todas tienen colores hex válidos
    facetas.forEach((faceta) => {
      expect(faceta.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
    
    // Verificar colores oficiales mencionados
    const colores = facetas.map(f => f.color);
    expect(colores).toContain('#A52D2D');
    expect(colores).toContain('#CC3737');
    expect(colores).toContain('#38A52D');
    expect(colores).toContain('#51CC37');
    expect(colores).toContain('#2C2CA8');
    expect(colores).toContain('#3636CC');
    expect(colores).toContain('#C1BD3A');
    expect(colores).toContain('#E2D640');
  });

  it("la lente cae en y = 200", () => {
    // Las esquinas del rombo/lente están en y=200
    expect(ESQUINAS.izquierda.y).toBe(200);
    expect(ESQUINAS.derecha.y).toBe(200);
  });

  it("tiene lienzo 400x400 con centro (200,200) y r=80", () => {
    expect(SIMBOLO_BASE.ancho).toBe(400);
    expect(SIMBOLO_BASE.alto).toBe(400);
    expect(SIMBOLO_BASE.centroX).toBe(200);
    expect(SIMBOLO_BASE.centroY).toBe(200);
    expect(SIMBOLO_BASE.radio).toBe(80);
  });

  it("dos círculos con centros correctos", () => {
    expect(CENTROS_CIRCULOS.superior.x).toBe(200);
    expect(CENTROS_CIRCULOS.superior.y).toBe(160);
    expect(CENTROS_CIRCULOS.inferior.x).toBe(200);
    expect(CENTROS_CIRCULOS.inferior.y).toBe(240);
  });

  it("generarRutasSVG devuelve rutas completas", () => {
    const rutas = generarRutasSVG();
    expect(rutas.facetas).toHaveLength(12);
    expect(rutas.circulos.superior).toBeTruthy();
    expect(rutas.circulos.inferior).toBeTruthy();
    expect(rutas.ojo.contorno).toBeTruthy();
    expect(rutas.ojo.pupila).toBeTruthy();
    expect(rutas.ojo.brillo).toBeTruthy();
  });
});
