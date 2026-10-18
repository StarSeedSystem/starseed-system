import { describe, it, expect } from "vitest";
import {
  Banda,
  Manifiesto,
  bandasDeRango,
  diferencia,
  replicasDeseadas,
  elegirFuentes
} from "../volumen";

describe("volumen.ts", () => {
  const MANIFIESTO_EJEMPLO: Manifiesto = {
    id: "manifiesto-1",
    version: "1.0",
    tamano: 12 * 1024 * 1024, // 12 MiB (3 bandas de 4 MiB)
    banda: 4 * 1024 * 1024, // 4 MiB
    bandas: [
      { indice: 0, sha256: "aaa", bytes: 4 * 1024 * 1024 },
      { indice: 1, sha256: "bbb", bytes: 4 * 1024 * 1024 },
      { indice: 2, sha256: "ccc", bytes: 4 * 1024 * 1024 }
    ],
    privado: false,
    importancia: 2
  };

  const MANIFIESTO_PRIVADO: Manifiesto = {
    ...MANIFIESTO_EJEMPLO,
    id: "manifiesto-privado-1",
    privado: true,
    importancia: 3
  };

  describe("bandasDeRango", () => {
    it("devuelve bandas en el rango especificado", () => {
      const resultado = bandasDeRango(MANIFIESTO_EJEMPLO, 0, 1);
      expect(resultado.length).toBe(2);
      expect(resultado[0].indice).toBe(0);
      expect(resultado[1].indice).toBe(1);
    });

    it("devuelve arreglo vacío para rango inválido", () => {
      expect(bandasDeRango(MANIFIESTO_EJEMPLO, -1, 0)).toEqual([]);
      expect(bandasDeRango(MANIFIESTO_EJEMPLO, 0, 5)).toEqual([]);
      expect(bandasDeRango(MANIFIESTO_EJEMPLO, 3, 1)).toEqual([]);
    });

    it("devuelve una sola banda cuando desde equals hasta", () => {
      const resultado = bandasDeRango(MANIFIESTO_EJEMPLO, 1, 1);
      expect(resultado.length).toBe(1);
      expect(resultado[0].indice).toBe(1);
    });
  });

  describe("diferencia", () => {
    it("detecta bandas añadidas, eliminadas y modificadas", () => {
      const viejo: Manifiesto = {
        ...MANIFIESTO_EJEMPLO,
        id: "viejo",
        bandas: [
          { indice: 0, sha256: "aaa", bytes: 4 * 1024 * 1024 }, // sin cambios
          { indice: 1, sha256: "bbb", bytes: 4 * 1024 * 1024 }, // será modificada
          { indice: 2, sha256: "ccc", bytes: 4 * 1024 * 1024 }  // será eliminada
        ]
      };

      const nuevo: Manifiesto = {
        ...MANIFIESTO_EJEMPLO,
        id: "nuevo",
        bandas: [
          { indice: 0, sha256: "aaa", bytes: 4 * 1024 * 1024 }, // sin cambios
          { indice: 1, sha256: "bbb-modificado", bytes: 4 * 1024 * 1024 }, // modificada
          { indice: 3, sha256: "ddd", bytes: 4 * 1024 * 1024 }   // añadida
        ]
      };

      const resultado = diferencia(viejo, nuevo);
      
      // Una banda añadida (índice 3)
      expect(resultado.añadidas.length).toBe(1);
      expect(resultado.añadidas[0].indice).toBe(3);
      
      // Una banda eliminada (índice 2)
      expect(resultado.eliminadas.length).toBe(1);
      expect(resultado.eliminadas[0].indice).toBe(2);
      
      // Una banda modificada (índice 1)
      expect(resultado.modificadas.length).toBe(1);
      expect(resultado.modificadas[0].indice).toBe(1);
      expect(resultado.modificadas[0].sha256).toBe("bbb-modificado");
    });

    it("devuelve arreglos vacíos cuando los manifiestos son idénticos", () => {
      const resultado = diferencia(MANIFIESTO_EJEMPLO, MANIFIESTO_EJEMPLO);
      expect(resultado.añadidas.length).toBe(0);
      expect(resultado.eliminadas.length).toBe(0);
      expect(resultado.modificadas.length).toBe(0);
    });
  });

  describe("replicasDeseadas", () => {
    it("devuelve 2 para manifiestos privados", () => {
      expect(replicasDeseadas(MANIFIESTO_PRIVADO)).toBe(2);
    });

    it("devuelve 2 + importancia para públicos (con tope de 5)", () => {
      // importancia 0: 2 + 0 = 2
      const mani0 = { ...MANIFIESTO_EJEMPLO, importancia: 0 };
      expect(replicasDeseadas(mani0)).toBe(2);
      
      // importancia 1: 2 + 1 = 3
      const mani1 = { ...MANIFIESTO_EJEMPLO, importancia: 1 };
      expect(replicasDeseadas(mani1)).toBe(3);
      
      // importancia 2: 2 + 2 = 4
      const mani2 = { ...MANIFIESTO_EJEMPLO, importancia: 2 };
      expect(replicasDeseadas(mani2)).toBe(4);
      
      // importancia 3: 2 + 3 = 5 (tope)
      const mani3 = { ...MANIFIESTO_EJEMPLO, importancia: 3 };
      expect(replicasDeseadas(mani3)).toBe(5);
      
      // importancia 4: 2 + 4 = 6, pero tope es 5
      const mani4 = { ...MANIFIESTO_EJEMPLO, importancia: 4 };
      expect(replicasDeseadas(mani4)).toBe(5);
    });
  });

  describe("elegirFuentes", () => {
    it("ordena fuentes de más rápida a más lenta y filtra por permiso y banda", () => {
      const tenedores: Tenedor[] = [
        { id: "tenedor-1", indice: 0, velocidad: 10, permitted: true },
        { id: "tenedor-2", indice: 0, velocidad: 20, permitted: true },
        { id: "tenedor-3", indice: 0, velocidad: 15, permitted: false }, // no permitted
        { id: "tenedor-4", indice: 1, velocidad: 25, permitted: true }  // wrong indice
      ];

      const ofertas: Oferta[] = [
        { id: "oferta-1", indice: 0, velocidad: 5, permitted: true },
        { id: "oferta-2", indice: 0, velocidad: 30, permitted: true },
        { id: "oferta-3", indice: 0, velocidad: 12, permitted: false }, // no permitted
        { id: "oferta-4", indice: 1, velocidad: 35, permitted: true }   // wrong indice
      ];

      const resultado = elegirFuentes(MANIFIESTO_EJEMPLO, 0, tenedores, ofertas);
      
      // Debe devolver 3 fuentes: tenedor-2 (20), tenedor-1 (10), oferta-2 (30), oferta-1 (5)
      // Ordenadas de más rápida a más lenta: oferta-2 (30), tenedor-2 (20), tenedor-1 (10), oferta-1 (5)
      expect(resultado.length).toBe(4);
      expect(resultado[0].id).toBe("oferta-2");
      expect(resultado[0].velocidad).toBe(30);
      expect(resultado[1].id).toBe("tenedor-2");
      expect(resultado[1].velocidad).toBe(20);
      expect(resultado[2].id).toBe("tenedor-1");
      expect(resultado[2].velocidad).toBe(10);
      expect(resultado[3].id).toBe("oferta-1");
      expect(resultado[3].velocidad).toBe(5);
    });

    it("devuelve arreglo vacío cuando no hay fuentes válidas", () => {
      const tenedores: Tenedor[] = [
        { id: "tenedor-1", indice: 0, velocidad: 10, permitted: false }
      ];

      const ofertas: Oferta[] = [
        { id: "oferta-1", indice: 0, velocidad: 5, permitted: false }
      ];

      const resultado = elegirFuentes(MANIFIESTO_EJEMPLO, 0, tenedores, ofertas);
      expect(resultado.length).toBe(0);
    });
  });
});