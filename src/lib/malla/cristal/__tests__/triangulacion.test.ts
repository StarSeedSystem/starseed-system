import { describe, it, expect } from "vitest";
import { delaunay, proyectar, Punto } from "../triangulacion";

describe("triangulacion", () => {
  describe("delaunay", () => {
    it("should return empty array for less than 2 points", () => {
      expect(delaunay([])).toEqual([]);
      expect(delaunay([{id: "1", x: 0, y: 0}])).toEqual([]);
    });

    it("should return the single edge for 2 points", () => {
      const puntos = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 1, y: 0}
      ];
      expect(delaunay(puntos)).toEqual([["A", "B"]]);
    });

    it("should handle collinear points", () => {
      const puntos = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 1, y: 0},
        {id: "C", x: 2, y: 0}
      ];
      // Para puntos colineales, debería devolver la cadena que los une en orden
      expect(delaunay(puntos)).toEqual([["A", "B"], ["B", "C"]]);
    });

    it("should handle duplicate points", () => {
      const puntos = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 0, y: 0}, // Duplicado de A (mismas coordenadas)
        {id: "C", x: 1, y: 0}
      ];
      // El duplicado B debería ser tratado como A (se une a él con el id menor)
      // Entonces efectivamente tenemos dos puntos: A(0,0) y C(1,0)
      expect(delaunay(puntos)).toEqual([["A", "C"]]);
    });

    it("should be deterministic regardless of input order", () => {
      const puntos1 = [
        {id: "C", x: 1, y: 1},
        {id: "A", x: 0, y: 0},
        {id: "B", x: 1, y: 0}
      ];
      
      const puntos2 = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 1, y: 0},
        {id: "C", x: 1, y: 1}
      ];
      
      const resultado1 = delaunay(puntos1);
      const resultado2 = delaunay(puntos2);
      
      expect(resultado1).toEqual(resultado2);
    });

    it("should return 5 edges for a square of 4 points", () => {
      const puntos = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 0, y: 1},
        {id: "C", x: 1, y: 1},
        {id: "D", x: 1, y: 0}
      ];
      // Un cuadrado debería producir 5 aristas en la triangulación de Delaunay
      // (las 4 lados más una diagonal)
      const resultado = delaunay(puntos);
      expect(resultado.length).toBe(5);
      // Verificar que contenga los lados del cuadrado
      const lados = new Set([
        "A-B", "B-A", "B-C", "C-B", "C-D", "D-C", "D-A", "A-D"
      ].map(s => {
        const [a, b] = s.split("-");
        return a < b ? `${a}-${b}` : `${b}-${a}`;
      }));
      
      for (const [id1, id2] of resultado) {
        const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
        expect(lados.has(key) || 
               // Las diagonales serían A-C o B-D
               key === "A-C" || key === "B-D").toBe(true);
      }
    });

    it("should return 3 edges for a triangle", () => {
      const puntos = [
        {id: "A", x: 0, y: 0},
        {id: "B", x: 1, y: 0},
        {id: "C", x: 0, y: 1}
      ];
      const resultado = delaunay(puntos);
      expect(resultado.length).toBe(3);
      // Debería contener las tres aristas del triángulo
      const aristasEsperadas = new Set([
        "A-B", "B-C", "C-A"
      ].map(s => {
        const [a, b] = s.split("-");
        return a < b ? `${a}-${b}` : `${b}-${a}`;
      }));
      
      for (const [id1, id2] of resultado) {
        const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
        expect(aristasEsperadas.has(key)).toBe(true);
      }
    });
  });

  describe("proyectar", () => {
    it("should return {0,0} for lat=0, lon=0 when reference is also 0,0", () => {
      expect(proyectar(0, 0, 0, 0)).toEqual({x: 0, y: 0});
    });

    it("should return approximately 111 km for 1° of latitude", () => {
      // 1 grado de latitud aproximadamente 111 km
      const resultado = proyectar(1, 0, 0, 0);
      // y = R * (lat - lat0) en radianes
      // 1 grado = π/180 radianes
      // y = 6371000 * (π/180) ≈ 111195 metros
      expect(resultado.x).toBeCloseTo(0, -1); // Cercano a 0
      expect(resultado.y).toBeCloseTo(111195, -3); // Aproximadamente 111 km
    });
  });
});