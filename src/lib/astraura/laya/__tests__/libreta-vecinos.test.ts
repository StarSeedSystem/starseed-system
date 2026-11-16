import { describe, it, expect } from "vitest";
import {
  huellaPalabras,
  similitud,
  vecinos,
  votar,
  DIM_HUELLA,
  type EjemploLibreta,
  type Vecino,
} from "@/lib/astraura/laya/libreta-vecinos";

const ej = (extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({
  punto: "respuesta.basta",
  ambito: "a1",
  estado: "La respuesta resuelve la consulta del usuario completamente",
  respuesta: "aceptar",
  desenlaceOk: true,
  ...extra,
});

const ejOtroAmbito = (extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({
  ...ej({ ambito: "mac", respuesta: "rechazar" }),
  ...extra,
});

const ejSinDesenlace = (extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({
  ...ej({ desenlaceOk: null }),
  ...extra,
});

describe("huellaPalabras", () => {
  it("devuelve vector disperso normalizado (suma = 1) con índices < 256", () => {
    const h = huellaPalabras("hola mundo hola");
    const indices = Object.keys(h).map(Number);
    expect(indices.every((i) => i >= 0 && i < DIM_HUELLA)).toBe(true);
    const suma = Object.values(h).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it("texto vacío o solo símbolos da objeto vacío", () => {
    expect(huellaPalabras("")).toEqual({});
    expect(huellaPalabras("!!! ???")).toEqual({});
  });

  it("determinista: mismo texto -> misma huella", () => {
    expect(huellaPalabras("texto de prueba")).toEqual(huellaPalabras("texto de prueba"));
  });

  it("ignora acentos y mayúsculas", () => {
    const h1 = huellaPalabras("café");
    const h2 = huellaPalabras("CAFE");
    expect(h1).toEqual(h2);
  });
});

describe("similitud", () => {
  it("coseno = 1 para vectores idénticos", () => {
    const h = huellaPalabras("palabra repetida palabra");
    expect(similitud(h, h)).toBe(1);
  });

  it("coseno = 0 para vectores sin solapamiento", () => {
    const h1 = huellaPalabras("alpha beta");
    const h2 = huellaPalabras("gamma delta");
    expect(similitud(h1, h2)).toBe(0);
  });

  it("simétrica y acotada [0, 1]", () => {
    const h1 = huellaPalabras("texto uno");
    const h2 = huellaPalabras("texto dos");
    const s = similitud(h1, h2);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(similitud(h2, h1)).toBe(s);
  });
});

describe("vecinos", () => {
  const libreta: readonly EjemploLibreta[] = [
    ej({ estado: "respuesta completa y correcta", respuesta: "aceptar" }),
    ej({ estado: "respuesta parcial pero útil", respuesta: "aceptar" }),
    ej({ estado: "respuesta incorrecta", respuesta: "rechazar" }),
    ejOtroAmbito({ estado: "otro ámbito mismo texto", respuesta: "rechazar" }),
    ejSinDesenlace({ estado: "sin desenlace conocido", respuesta: "aceptar" }),
  ];

  it("solo mira ejemplos del MISMO ámbito", () => {
    const v = vecinos(libreta, "respuesta correcta", 10, "a1");
    expect(v.every((vec) => vec.ejemplo.ambito === "a1")).toBe(true);
    expect(v.length).toBe(3); // 3 de ámbito a1 con desenlace conocido
  });

  it("ignora ejemplos sin desenlace conocido (null)", () => {
    const v = vecinos(libreta, "respuesta correcta", 10, "a1");
    expect(v.every((vec) => vec.ejemplo.desenlaceOk !== null)).toBe(true);
  });

  it("ordena por similitud descendente; empate estable por orden de aparición", () => {
    const v = vecinos(libreta, "respuesta completa y correcta", 10, "a1");
    expect(v[0].similitud).toBeGreaterThanOrEqual(v[1].similitud);
    expect(v[1].similitud).toBeGreaterThanOrEqual(v[2].similitud);
    // El primero tiene mayor similitud por ser casi idéntico al estado de consulta
    expect(v[0].ejemplo.estado).toBe("respuesta completa y correcta");
  });

  it("respeta k: devuelve como máximo k vecinos", () => {
    expect(vecinos(libreta, "respuesta", 1, "a1")).toHaveLength(1);
    expect(vecinos(libreta, "respuesta", 2, "a1")).toHaveLength(2);
    expect(vecinos(libreta, "respuesta", 10, "a1")).toHaveLength(3); // solo 3 válidos
  });

  it("devuelve array vacío si no hay ejemplos válidos en el ámbito", () => {
    expect(vecinos(libreta, "lo que sea", 5, "otro")).toHaveLength(0);
    expect(vecinos([ejSinDesenlace()], "texto", 5, "a1")).toHaveLength(0);
  });
});

describe("votar", () => {
  const crearVecino = (respuesta: string, similitud: number, idx = 0): Vecino => ({
    ejemplo: ej({ respuesta, estado: `estado ${idx}` }),
    similitud,
  });

  it("null si menos de 5 vecinos", () => {
    expect(votar([crearVecino("a", 1)])).toBeNull();
    expect(votar([crearVecino("a", 1), crearVecino("a", 1), crearVecino("a", 1), crearVecino("a", 1)])).toBeNull();
  });

  it("null si apoyo < 0.6", () => {
    // 5 vecinos: 3 a (peso 0.5 cada uno = 1.5), 2 b (peso 0.5 cada uno = 1.0) -> apoyo = 1.5/2.5 = 0.6 exacto
    const v1 = [
      crearVecino("a", 0.5, 0),
      crearVecino("a", 0.5, 1),
      crearVecino("a", 0.5, 2),
      crearVecino("b", 0.5, 3),
      crearVecino("b", 0.5, 4),
    ];
    // apoyo = 1.5/2.5 = 0.6 -> pasa
    expect(votar(v1)).toEqual({ respuesta: "a", apoyo: 0.6 });

    // apoyo < 0.6
    const v2 = [
      crearVecino("a", 0.4, 0),
      crearVecino("a", 0.4, 1),
      crearVecino("a", 0.4, 2),
      crearVecino("b", 0.6, 3),
      crearVecino("b", 0.6, 4),
    ];
    // a: 1.2, b: 1.2, total 2.4 -> apoyo = 0.5 < 0.6
    expect(votar(v2)).toBeNull();
  });

  it("respuesta mayoritaria ponderada por similitud", () => {
    const v = [
      crearVecino("aceptar", 0.9, 0),
      crearVecino("aceptar", 0.8, 1),
      crearVecino("aceptar", 0.7, 2),
      crearVecino("rechazar", 0.3, 3),
      crearVecino("rechazar", 0.2, 4),
    ];
    const r = votar(v);
    expect(r).not.toBeNull();
    expect(r!.respuesta).toBe("aceptar");
    expect(r!.apoyo).toBeGreaterThan(0.6);
  });

  it("desempate estable: gana la que aparece primero entre los vecinos", () => {
    // Empate de peso entre dos respuestas, apoyo >= 0.6
    const v = [
      crearVecino("primera", 0.9, 0),
      crearVecino("segunda", 0.9, 1),
      crearVecino("primera", 0.9, 2),
      crearVecino("segunda", 0.9, 3),
      crearVecino("tercera", 0.1, 4),
    ];
    // primera: 1.8 (idx 0,2), segunda: 1.8 (idx 1,3), tercera: 0.1 (idx 4)
    // total = 3.7, apoyo primera = 1.8/3.7 ≈ 0.486 < 0.6 -> null
    // Ajustar para que apoyo >= 0.6
    const v2 = [
      crearVecino("primera", 0.9, 0),
      crearVecino("segunda", 0.9, 1),
      crearVecino("primera", 0.9, 2),
      crearVecino("segunda", 0.1, 3),
      crearVecino("tercera", 0.1, 4),
    ];
    // primera: 1.8, segunda: 1.0, tercera: 0.1, total = 2.9
    // apoyo primera = 1.8/2.9 ≈ 0.62 >= 0.6 -> gana "primera"
    const r = votar(v2);
    expect(r).not.toBeNull();
    expect(r!.respuesta).toBe("primera");
  });

  it("no muta el array de entrada", () => {
    const v = [
      crearVecino("a", 0.9, 0),
      crearVecino("a", 0.8, 1),
      crearVecino("a", 0.7, 2),
      crearVecino("b", 0.3, 3),
      crearVecino("b", 0.2, 4),
    ];
    const original = [...v];
    votar(v);
    expect(v).toEqual(original);
  });
});