import { describe, it, expect } from "vitest";
import {
  huellaPalabras,
  similitud,
  vecinos,
  votar,
  type EjemploLibreta,
} from "../libreta-vecinos";

const ej = (extra: Partial<EjemploLibreta> = {}): EjemploLibreta => ({
  punto: "respuesta.basta",
  ambito: "a1",
  estado: "La respuesta resuelve la consulta completamente",
  respuesta: "sí",
  desenlaceOk: true,
  ...extra,
});

describe("huellaPalabras", () => {
  it("normaliza y hashea a vector disperso ≤256", () => {
    const v = huellaPalabras("Hola MUNDO hola");
    expect(v.size).toBeGreaterThan(0);
    expect(v.size).toBeLessThanOrEqual(256);
    const suma = Array.from(v.values()).reduce((a: number, b: number) => a + b, 0);
    expect(suma).toBe(3);
  });

  it("ignora acentos y mayúsculas", () => {
    const v1 = huellaPalabras("café");
    const v2 = huellaPalabras("CAFE");
    expect(v1).toEqual(v2);
  });

  it("texto vacío da mapa vacío", () => {
    expect(huellaPalabras("").size).toBe(0);
    expect(huellaPalabras("   ").size).toBe(0);
  });
});

describe("similitud", () => {
  it("coseno 1 para vectores idénticos", () => {
    const v = huellaPalabras("hola mundo");
    expect(similitud(v, v)).toBeCloseTo(1, 5);
  });

  it("coseno 0 para vectores sin solapamiento", () => {
    const v1 = huellaPalabras("hola");
    const v2 = huellaPalabras("mundo");
    expect(similitud(v1, v2)).toBe(0);
  });

  it("coseno 0 si alguno está vacío", () => {
    expect(similitud(new Map(), huellaPalabras("hola"))).toBe(0);
    expect(similitud(huellaPalabras("hola"), new Map())).toBe(0);
  });
});

describe("vecinos", () => {
  it("solo mira ejemplos del MISMO ámbito", () => {
    const libreta: EjemploLibreta[] = [
      ej({ ambito: "a1", estado: "consulta resuelta", respuesta: "sí" }),
      ej({ ambito: "a2", estado: "consulta resuelta", respuesta: "no" }),
    ];
    const v = vecinos(libreta, "consulta resuelta", 5, "a1");
    expect(v).toHaveLength(1);
    expect(v[0].ambito).toBe("a1");
  });

  it("ignora ejemplos sin desenlace conocido (null)", () => {
    const libreta: EjemploLibreta[] = [
      ej({ desenlaceOk: true }),
      ej({ desenlaceOk: null }),
      ej({ desenlaceOk: false }),
    ];
    const v = vecinos(libreta, "consulta", 5, "a1");
    expect(v).toHaveLength(2);
  });

  it("ordena por similitud descendente y desempate estable", () => {
    const libreta: EjemploLibreta[] = [
      ej({ estado: "alpha beta", respuesta: "a" }),
      ej({ estado: "alpha beta", respuesta: "b" }),
      ej({ estado: "alpha beta gamma", respuesta: "c" }),
    ];
    const v = vecinos(libreta, "alpha beta", 3, "a1");
    expect(v).toHaveLength(3);
    expect(v[0].respuesta).toBe("a");
    expect(v[1].respuesta).toBe("b");
    expect(v[2].respuesta).toBe("c");
  });

  it("respeta k", () => {
    const libreta: EjemploLibreta[] = Array.from({ length: 10 }, (_, i) =>
      ej({ estado: `consulta ${i}`, respuesta: String(i) })
    );
    expect(vecinos(libreta, "consulta 0", 3, "a1")).toHaveLength(3);
  });
});

describe("votar", () => {
  it("null si menos de 5 vecinos", () => {
    expect(votar([ej(), ej(), ej(), ej()])).toBeNull();
  });

  it("null si apoyo < 0,6", () => {
    const vs: EjemploLibreta[] = [
      ej({ respuesta: "a" }),
      ej({ respuesta: "a" }),
      ej({ respuesta: "b" }),
      ej({ respuesta: "c" }),
      ej({ respuesta: "d" }),
    ];
    expect(votar(vs)).toBeNull();
  });

  it("devuelve respuesta y apoyo con ≥5 y apoyo ≥0,6", () => {
    const vs: EjemploLibreta[] = [
      ej({ respuesta: "sí" }),
      ej({ respuesta: "sí" }),
      ej({ respuesta: "sí" }),
      ej({ respuesta: "no" }),
      ej({ respuesta: "no" }),
    ];
    const r = votar(vs);
    expect(r).not.toBeNull();
    expect(r!.respuesta).toBe("sí");
    expect(r!.apoyo).toBeCloseTo(0.6, 5);
  });

  it("gana la respuesta con más votos (apoyo ≥ 0,6)", () => {
    const vs: EjemploLibreta[] = [
      ej({ respuesta: "sí" }),
      ej({ respuesta: "sí" }),
      ej({ respuesta: "sí" }),
      ej({ respuesta: "no" }),
      ej({ respuesta: "no" }),
    ];
    const r = votar(vs);
    expect(r).not.toBeNull();
    expect(r!.respuesta).toBe("sí");
    expect(r!.apoyo).toBeCloseTo(0.6, 5);
  });

  it("orden estable del mapa no afecta al ganador cuando hay apoyo suficiente", () => {
    const vs: EjemploLibreta[] = [
      ej({ respuesta: "zeta" }),
      ej({ respuesta: "zeta" }),
      ej({ respuesta: "zeta" }),
      ej({ respuesta: "alfa" }),
      ej({ respuesta: "alfa" }),
    ];
    const r = votar(vs);
    expect(r).not.toBeNull();
    expect(r!.respuesta).toBe("zeta");
  });
});