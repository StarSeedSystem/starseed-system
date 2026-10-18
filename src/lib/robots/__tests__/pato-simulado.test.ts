import { describe, it, expect } from "vitest";

// Funciones puras para probar la traducción de acciones a comandos internos
// Estas serían las funciones que realmente traducerían las acciones a comandos para MuJoCo/ONNX

/**
 * Traduce una acción de caminar a parámetros de movimiento
 * Esta es una función pura que podemos testear
 */
function traducirCaminarADireccionVector(
  direccion: "adelante" | "atras" | "izquierda" | "derecha"
): { x: number; y: number } {
  switch (direccion) {
    case "adelante": return { x: 1, y: 0 };
    case "atras": return { x: -1, y: 0 };
    case "izquierda": return { x: 0, y: 1 };
    case "derecha": return { x: 0, y: -1 };
    default: throw new Error(`Dirección desconocida: ${direccion}`);
  }
}

/**
 * Traduce una acción de girar a parámetros de rotación
 */
function traducirGirARotacion(
  direccion: "izquierda" | "derecha",
  grados: number
): number {
  // Si los grados son 0, no hay rotación independientemente de la dirección
  if (grados === 0) {
    return 0;
  }
  
  // Convertir a radianes y aplicar signo según dirección
  const radianes = (grados * Math.PI) / 180;
  return direccion === "izquierda" ? radianes : -radianes;
}

/**
 * Valida si una expresión emoticon es válida
 */
function esExpresionValida(expresion: string): expresion is 
  | "feliz" | "triste" | "confundido" | "asustado" | "enojado" | "somnoliento" 
  | "asentir" | "mirar_arriba" | "mirar_abajo" | "mirar_izquierda" | "mirar_derecha" 
  | "mirar_alrededor" {
  const expresionesValidas = [
    "feliz", "triste", "confundido", "asustado", "enojado", "somnoliento",
    "asentir", "mirar_arriba", "mirar_abajo", "mirar_izquierda", "mirar_derecha",
    "mirar_alrededor"
  ];
  return expresionesValidas.includes(expresion);
}

/**
 * Valida si un estilo de baile es válido
 */
function esEstiloBaileValido(estilo: string): estilo is 
  | "moverse" | "cabecear" | "girar" | "caminata_lunar" | "pollo" {
  const estilosValidos = ["moverse", "cabecear", "girar", "caminata_lunar", "pollo"];
  return estilosValidos.includes(estilo);
}

describe("Traducción de acciones del pato simulado", () => {
  describe("traducirCaminarADireccionVector", () => {
    it("debe traducir 'adelante' a { x: 1, y: 0 }", () => {
      expect(traducirCaminarADireccionVector("adelante")).toEqual({ x: 1, y: 0 });
    });

    it("debe traducir 'atras' a { x: -1, y: 0 }", () => {
      expect(traducirCaminarADireccionVector("atras")).toEqual({ x: -1, y: 0 });
    });

    it("debe traducir 'izquierda' a { x: 0, y: 1 }", () => {
      expect(traducirCaminarADireccionVector("izquierda")).toEqual({ x: 0, y: 1 });
    });

    it("debe traducir 'derecha' a { x: 0, y: -1 }", () => {
      expect(traducirCaminarADireccionVector("derecha")).toEqual({ x: 0, y: -1 });
    });

    it("debe lanzar error para dirección desconocida", () => {
      // @ts-ignore - A propósito pasamos un valor incorrecto para probar el error
      expect(() => traducirCaminarADireccionVector("noreste")).toThrow();
    });
  });

  describe("traducirGirARotacion", () => {
    it("debe convertir 90 grados izquierda a π/2 radianes", () => {
      const resultado = traducirGirARotacion("izquierda", 90);
      expect(resultado).toBeCloseTo(Math.PI / 2);
    });

    it("debe convertir 90 grados derecha a -π/2 radianes", () => {
      const resultado = traducirGirARotacion("derecha", 90);
      expect(resultado).toBeCloseTo(-Math.PI / 2);
    });

    it("debe convertir 180 grados izquierda a π radianes", () => {
      const resultado = traducirGirARotacion("izquierda", 180);
      expect(resultado).toBeCloseTo(Math.PI);
    });

    it("debe manejar 0 grados correctamente", () => {
      expect(traducirGirARotacion("izquierda", 0)).toBe(0);
      // -0 es igual a 0 en comparación numérica, pero Object.is distingue entre ellos
      // Para este caso, aceptamos que -0 es equivalente a 0
      expect(traducirGirARotacion("derecha", 0)).toEqual(0);
    });
  });

  describe("esExpresionValida", () => {
    it.each([
      "feliz",
      "triste", 
      "confundido",
      "asustado",
      "enojado",
      "somnoliento",
      "asentir",
      "mirar_arriba",
      "mirar_abajo",
      "mirar_izquierda",
      "mirar_derecha",
      "mirar_alrededor"
    ])("debe validar la expresión '%s'", (expresion) => {
      expect(esExpresionValida(expresion)).toBe(true);
    });

    it.each([
      "felizx",
      "tristess",
      "confundidooo",
      "",
      "neutro",
      "unknown"
    ])("debe invalidar la expresión '%s'", (expresion) => {
      expect(esExpresionValida(expresion)).toBe(false);
    });
  });

  describe("esEstiloBaileValido", () => {
    it.each([
      "moverse",
      "cabecear",
      "girar",
      "caminata_lunar",
      "pollo"
    ])("debe validar el estilo de baile '%s'", (estilo) => {
      expect(esEstiloBaileValido(estilo)).toBe(true);
    });

    it.each([
      "moversex",
      "cabecearr",
      "girarito",
      "baile",
      "",
      "unknown"
    ])("debe invalidar el estilo de baile '%s'", (estilo) => {
      expect(esEstiloBaileValido(estilo)).toBe(false);
    });
  });
});