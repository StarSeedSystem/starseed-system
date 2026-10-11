/**
 * Tests para personalidad-desde-aurora.ts
 * Cubriendo los requisitos especificados en la tarea:
 * - params 0-100 y 0-1
 * - alias en inglés
 * - faltantes caen a base
 * - basura no lanza
 * - emociones
 * - acotado
 * - cada mood conocido tiene ánimo
 * - ánimo dentro de rangos
 */

import { describe, it, expect } from "vitest";
import { 
  rasgosDesdePersonalidad, 
  Personalidad,
  ANIMO_DESDE_VOZ
} from "../personalidad-desde-aurora";

describe("rasgosDesdePersonalidad", () => {
  const basePersonalidad: Personalidad = {
    calidez: 50,
    energia: 50,
    formalidad: 50,
    curiosidad: 50,
    humor: 50,
    concision: 50,
  };

  it("debe manejar params en escala 0-100", () => {
    const entrada: any = {
      params: {
        calidez: 80,
        energia: 30,
        formalidad: 70,
        curiosidad: 20,
        humor: 60,
        concision: 40,
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    expect(resultado.calidez).toBe(80);
    expect(resultado.energia).toBe(30);
    expect(resultado.formalidad).toBe(70);
    expect(resultado.curiosidad).toBe(20);
    expect(resultado.humor).toBe(60);
    expect(resultado.concision).toBe(40);
  });

  it("debe manejar params en escala 0-1", () => {
    const entrada: any = {
      params: {
        calidez: 0.8,   // debería convertirse a 80
        energia: 0.3,   // debería convertirse a 30
        formalidad: 0.7, // debería convertirse a 70
        curiosidad: 0.2, // debería convertirse a 20
        humor: 0.6,     // debería convertirse a 60
        concision: 0.4,  // debería convertirse a 40
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    expect(resultado.calidez).toBe(80);
    expect(resultado.energia).toBe(30);
    expect(resultado.formalidad).toBe(70);
    expect(resultado.curiosidad).toBe(20);
    expect(resultado.humor).toBe(60);
    expect(resultado.concision).toBe(40);
  });

  it("debe usar alias en inglés cuando se proporcionan", () => {
    const entrada: any = {
      params: {
        warmth: 90,      // calidez
        energy: 10,      // energia
        formality: 80,   // formalidad
        curiosity: 10,   // curiosidad
        humor: 70,       // humor (sin alias necesario)
        brevity: 20,     // concision
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    expect(resultado.calidez).toBe(90);
    expect(resultado.energia).toBe(10);
    expect(resultado.formalidad).toBe(80);
    expect(resultado.curiosidad).toBe(10);
    expect(resultado.humor).toBe(70);
    expect(resultado.concision).toBe(20);
  });

  it("debe caer a base para valores faltantes", () => {
    const entrada: any = {
      params: {
        calidez: 30,
        // falta energia, formalidad, curiosidad, humor, concision
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    expect(resultado.calidez).toBe(30);   // del params
    expect(resultado.energia).toBe(50);   // de base
    expect(resultado.formalidad).toBe(50); // de base
    expect(resultado.curiosidad).toBe(50); // de base
    expect(resultado.humor).toBe(50);     // de base
    expect(resultado.concision).toBe(50); // de base
  });

  it("no debe lanzar con valores basura (basura no lanza)", () => {
    const entrada: any = {
      params: {
        calidez: "not a number" as any,
        energia: {}, // objeto inválido
        formalidad: null,
        curiosidad: undefined,
        humor: NaN,
        concision: Infinity,
      }
    };
    // No debería lanzar, debería usar valores por defecto (0) y caer a base para algunos
    expect(() => rasgosDesdePersonalidad(entrada, basePersonalidad)).not.toThrow();
    
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    // Los valores inválidos se convierten en 0 por normalizarParametro
    expect(resultado.calidez).toBe(0);
    expect(resultado.energia).toBe(0);
    expect(resultado.formalidad).toBe(0);
    expect(resultado.curiosidad).toBe(0);
    expect(resultado.humor).toBe(0);
    expect(resultado.concision).toBe(0);
  });

  it("debe aplicar emociones alegria/joy para subir energía y humor", () => {
    const entrada: any = {
      params: {
        energia: 50,
        humor: 50,
      },
      emotions: {
        alegria: 1.0, // alegría máxima
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    // energía: 50 + (1.0 * 20) = 70
    // humor: 50 + (1.0 * 20) = 70
    expect(resultado.energia).toBe(70);
    expect(resultado.humor).toBe(70);
  });

  it("debe aplicar emociones calma/calm para bajar energía", () => {
    const entrada: any = {
      params: {
        energia: 80,
      },
      emotions: {
        calma: 1.0, // calma máxima
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    // energía: 80 - (1.0 * 15) = 65
    expect(resultado.energia).toBe(65);
  });

  it("debe combinar correctamente múltiples emociones", () => {
    const entrada: any = {
      params: {
        energia: 50,
        humor: 40,
      },
      emotions: {
        alegria: 0.5, // 50% de alegría
        calma: 0.5,   // 50% de calma
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    // energía: 50 + (0.5 * 20) - (0.5 * 15) = 50 + 10 - 7.5 = 52.5 → 52 o 53 dependiendo de redondeo interno
    // Pero como usamos acotar después de cada operación, veamos:
    // Paso 1: energia base 50
    // Paso 2: + (0.5 * 20) = +10 → 60
    // Paso 3: - (0.5 * 15) = -7.5 → 52.5 → acotar a 52.5 (pero nuestros valores son enteros en los tests)
    // En realidad, nuestra implementación hace:
    // energiaConAlegria = acotar(50 + (0.5 * 20), 0, 100) = acotar(60, 0, 100) = 60
    // energiaFinal = acotar(60 - (0.5 * 15), 0, 100) = acotar(52.5, 0, 100) = 52.5
    // Pero como estamos trabajando con números de punto flotante y los tests usan expect.equal,
    // necesitamos verificar que esté cerca del valor esperado.
    expect(resultado.energia).toBeCloseTo(52.5);
    // humor: 40 + (0.5 * 20) = 40 + 10 = 50
    expect(resultado.humor).toBe(50);
  });

  it("debe mantener todos los valores dentro del rango 0-100 (acotado)", () => {
    const entrada: any = {
      params: {
        calidez: 150, // debería acotarse a 100
        energia: -10, // debería acotarse a 0
      }
    };
    const resultado = rasgosDesdePersonalidad(entrada, basePersonalidad);
    expect(resultado.calidez).toBe(100);
    expect(resultado.energia).toBe(0);
  });

  it("debe aplicar correctamente los pesos fijos de emociones", () => {
    // Test con alegría parcial
    const entrada1: any = {
      params: {
        energia: 50,
        humor: 50,
      },
      emotions: {
        alegria: 0.5, // 50%
      }
    };
    const resultado1 = rasgosDesdePersonalidad(entrada1, basePersonalidad);
    // energía: 50 + (0.5 * 20) = 60
    // humor: 50 + (0.5 * 20) = 60
    expect(resultado1.energia).toBe(60);
    expect(resultado1.humor).toBe(60);

    // Test con calma parcial
    const entrada2: any = {
      params: {
        energia: 50,
      },
      emotions: {
        calma: 0.5, // 50%
      }
    };
    const resultado2 = rasgosDesdePersonalidad(entrada2, basePersonalidad);
    // energía: 50 - (0.5 * 15) = 42.5
    expect(resultado2.energia).toBeCloseTo(42.5);
  });
});

describe("ANIMO_DESDE_VOZ", () => {
  it("debe tener un ánimo para cada mood conocido de UserVoiceMood", () => {
    const moods: Array<keyof typeof ANIMO_DESDE_VOZ> = [
      "alegre", "sereno", "tenso", "triste", "enérgico", "neutral"
    ];
    moods.forEach(mood => {
      expect(ANIMO_DESDE_VOZ[mood]).toBeDefined();
      expect(ANIMO_DESDE_VOZ[mood].valencia).toBeDefined();
      expect(ANIMO_DESDE_VOZ[mood].activacion).toBeDefined();
    });
  });

  it("debe mantener el ánimo dentro de rangos válidos (-1 a 1 para valencia, 0 a 1 para activacion)", () => {
    const moods: Array<keyof typeof ANIMO_DESDE_VOZ> = [
      "alegre", "sereno", "tenso", "triste", "enérgico", "neutral"
    ];
    moods.forEach(mood => {
      const animo = ANIMO_DESDE_VOZ[mood];
      expect(animo.valencia).toBeGreaterThanOrEqual(-1);
      expect(animo.valencia).toBeLessThanOrEqual(1);
      expect(animo.activacion).toBeGreaterThanOrEqual(0);
      expect(animo.activacion).toBeLessThanOrEqual(1);
    });
  });

  it("debe tener valores razonables para cada estado de ánimo", () => {
    // alegre: positivo y activado
    expect(ANIMO_DESDE_VOZ.alegre.valencia).toBeGreaterThan(0);
    expect(ANIMO_DESDE_VOZ.alegre.activacion).toBeGreaterThan(0.5);
    
    // sereno: positivo y relajado
    expect(ANIMO_DESDE_VOZ.sereno.valencia).toBeGreaterThan(0);
    expect(ANIMO_DESDE_VOZ.sereno.activacion).toBeLessThan(0.5);
    
    // tenso: negativo y activado
    expect(ANIMO_DESDE_VOZ.tenso.valencia).toBeLessThan(0);
    expect(ANIMO_DESDE_VOZ.tenso.activacion).toBeGreaterThan(0.5);
    
    // triste: negativo y bajo energía
    expect(ANIMO_DESDE_VOZ.triste.valencia).toBeLessThan(0);
    expect(ANIMO_DESDE_VOZ.triste.activacion).toBeLessThan(0.5);
    
    // enérgico: ligeramente positivo y muy activado
    expect(ANIMO_DESDE_VOZ.enérgico.valencia).toBeGreaterThan(0);
    expect(ANIMO_DESDE_VOZ.enérgico.activacion).toBeGreaterThan(0.8);
    
    // neutral: neutral y activación media
    expect(ANIMO_DESDE_VOZ.neutral.valencia).toBeCloseTo(0);
    expect(ANIMO_DESDE_VOZ.neutral.activacion).toBeCloseTo(0.5);
  });
});