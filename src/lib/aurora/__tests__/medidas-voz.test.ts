// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import {
  anotarMedida,
  medidasDe,
  leerMedidas,
  migrarDeV1,
  migrarDeV1Parse,
  recortarMedidas,
  integrarMedida,
  resumenDe,
  MAX_POR_MOTOR_Y_TIPO,
  type MedidaVoz,
} from "@/lib/aurora/medidas-voz";

const DEV_NEURONA_ID = "dev-neurona-medidas-1015";
const CLAVE_V2 = "starseed.voz.medidas.v2";
const CLAVE_V1 = "starseed.voz.medidas.v1";

function getIdNeurona() {
  return DEV_NEURONA_ID;
}

describe("medidas-voz", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.clear();
    }
  });

  it("anotarMedida guarda una medida por neurona y tipo", () => {
    const neurona = getIdNeurona();
    anotarMedida({ neurona, motor: "Phonon-2", tipo: "primer-sonido", valor: 1200 });
    anotarMedida({ neurona, motor: "Parakeet", tipo: "tiempo-real-oido", valor: 0.85 });

    const medidas = medidasDe(neurona);
    expect(medidas).not.toBeNull();
    expect(medidas!.recientes).toBe(2);
  });

  it("medidasDe devuelve media móvil y p90 de las últimas 50 medidas", () => {
    const neurona = getIdNeurona();

    for (let i = 1; i <= 60; i++) {
      anotarMedida({ neurona, motor: `motor-${i % 5}`, tipo: "tiempo-real-voz", valor: i * 10 });
    }

    const m = medidasDe(neurona);
    expect(m).not.toBeNull();
    expect(m!.recientes).toBe(50);

    const esperados = Array.from({ length: 60 }, (_, i) => (i + 1) * 10);
    const normales = esperados.slice(-50);
    const mediaEsperada = normales.reduce((a, b) => a + b, 0) / normales.length;
    expect(Math.round(m!.mediaMovil * 100) / 100).toBe(Math.round(mediaEsperada * 100) / 100);

    const p90Esperado = normales.sort((a, b) => a - b)[Math.ceil(normales.length * 0.9) - 1];
    expect(Math.round(m!.p90 * 100) / 100).toBe(Math.round(p90Esperado * 100) / 100);
  });

  it("medidasDe filtra otras neuronas", () => {
    const neuronaA = "neurona-A";
    const neuronaB = "neurona-B";

    anotarMedida({ neurona: neuronaA, motor: "m1", tipo: "correccion", valor: 1.0 });
    anotarMedida({ neurona: neuronaB, motor: "m2", tipo: "correccion", valor: 2.0 });

    expect(medidasDe(neuronaA)!.recientes).toBe(1);
    expect(medidasDe(neuronaB)!.recientes).toBe(1);
    expect(medidasDe(neuronaA)!.mediaMovil).toBe(1.0);
    expect(medidasDe(neuronaB)!.mediaMovil).toBe(2.0);
  });

  it("medidasDe devuelve null si no hay medidas", () => {
    expect(medidasDe(DEV_NEURONA_ID)).toBeNull();
  });
});

describe("recortarMedidas (pura)", () => {
  it("deja las últimas 20 por (motor, tipo) y no llena el almacenamiento sin tope", () => {
    const medidas: MedidaVoz[] = Array.from({ length: 25 }, (_, i) => ({
      neurona: "n1", motor: "navegador", tipo: "primer-sonido", valor: i + 1, timestamp: 1000 + i,
    }));
    const recortadas = recortarMedidas(medidas);
    expect(MAX_POR_MOTOR_Y_TIPO).toBe(20);
    expect(recortadas).toHaveLength(20);
    expect(recortadas[0].valor).toBe(6); // las 25 - 20 = 5 más viejas, fuera
  });

  it("recorta por grupo (motor, tipo) de forma independiente y conserva el orden", () => {
    const base = (motor: string, tipo: MedidaVoz["tipo"], valor: number, timestamp: number): MedidaVoz =>
      ({ neurona: "n1", motor, tipo, valor, timestamp });
    const medidas = [
      base("navegador", "primer-sonido", 1, 1),
      base("navegador", "tiempo-real-oido", 2, 2),
      base("voz-rt", "primer-sonido", 3, 3),
    ];
    const recortadas = recortarMedidas(medidas, 1);
    expect(recortadas.map((m) => m.valor)).toEqual([1, 2, 3]);
    expect(integrarMedida(medidas, base("navegador", "primer-sonido", 9, 4))).toEqual([
      base("navegador", "primer-sonido", 9, 4),
      base("navegador", "tiempo-real-oido", 2, 2),
      base("voz-rt", "primer-sonido", 3, 3),
    ]);
  });
});

describe("resumenDe (pura)", () => {
  it("descarta entradas sin valor finito y da null sin ninguna válida", () => {
    const mala: MedidaVoz = { neurona: "n", motor: "m", tipo: "correccion", valor: NaN, timestamp: 1 };
    expect(resumenDe([mala])).toBeNull();
    const buenas: MedidaVoz[] = [
      { neurona: "n", motor: "m", tipo: "correccion", valor: 10, timestamp: 1 },
      { neurona: "n", motor: "m", tipo: "correccion", valor: 20, timestamp: 2 },
    ];
    expect(resumenDe(buenas)).toEqual({ mediaMovil: 15, p90: 20, recientes: 2 });
  });
});

describe("migrarDeV1Parse (pura)", () => {
  const entrada = [
    { neurona: "nA", motor: "Parakeet", tipo: "tiempo-real-oido", valor: 240, timestamp: 50, idioma: "es", flujo: true },
    { neurona: "", motor: "", valor: 99, timestamp: 51 }, // sin tipo: cae a correccion
  ];

  it("parsea el TEXTO JSON que safeGet devuelve (el bug: antes se trataba como lista)", () => {
    const parseadas = migrarDeV1Parse(JSON.stringify(entrada));
    expect(parseadas).toHaveLength(2);
    expect(parseadas[0]).toEqual({
      neurona: "nA", motor: "Parakeet", tipo: "tiempo-real-oido", valor: 240, timestamp: 50, idioma: "es", flujo: true,
    });
    expect(parseadas[1].tipo).toBe("correccion");
  });

  it("acepta texto doblemente serializado y lista ya parseada", () => {
    const doble = JSON.stringify(JSON.stringify(entrada));
    expect(migrarDeV1Parse(doble)).toHaveLength(2);
    expect(migrarDeV1Parse(entrada)).toHaveLength(2);
  });

  it("descarta basura y entradas sin valor o timestamp numérico", () => {
    expect(migrarDeV1Parse("no es json")).toEqual([]);
    expect(migrarDeV1Parse('{"a":1}')).toEqual([]);
    expect(migrarDeV1Parse([ { valor: "x", timestamp: 1 }, { valor: 5 }, { valor: 7, timestamp: 9 } ])).toHaveLength(1);
  });
});

describe("almacenamiento real (jsdom)", () => {
  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.clear();
    }
  });

  it("anotarMedida guarda idioma y flujo, y las medidas de esa neurona los traen", () => {
    const setId = (id: string) => localStorage.setItem("starseed.neuron.device-id", id);
    setId("neurona-oido-1");
    anotarMedida({ motor: "phonon-2", tipo: "tiempo-real-oido", valor: 310, idioma: "es", flujo: true });
    const deNeurona = leerMedidas("neurona-oido-1");
    expect(deNeurona).toHaveLength(1);
    expect(deNeurona[0]).toMatchObject({ motor: "phonon-2", idioma: "es", flujo: true, valor: 310 });
  });

  it("anotarMedida recorta el almacenamiento al máximo por (motor, tipo)", () => {
    const setId = (id: string) => localStorage.setItem("starseed.neuron.device-id", id);
    setId("neurona-recorte-1");
    for (let i = 1; i <= 25; i++) {
      anotarMedida({ motor: "navegador", tipo: "primer-sonido", valor: i });
    }
    expect(leerMedidas()).toHaveLength(20);
  });

  it("migrarDeV1 convierte el texto v1 en medidas v2 de verdad y limpia la clave vieja", () => {
    const setId = (id: string) => localStorage.setItem("starseed.neuron.device-id", id);
    setId("neurona-migrada-1");
    localStorage.setItem(
      CLAVE_V1,
      JSON.stringify([
        { neurona: "neurona-migrada-1", motor: "navegador", tipo: "primer-sonido", valor: 700, timestamp: 12 },
        { neurona: "neurona-migrada-1", motor: "Parakeet", tipo: "tiempo-real-oido", valor: 400, timestamp: 13 },
      ]),
    );
    migrarDeV1();
    const medidas = leerMedidas();
    expect(medidas).toHaveLength(2);
    expect(medidas.some((m) => m.tipo === "tiempo-real-oido" && m.motor === "Parakeet")).toBe(true);
    expect(medidasDe("neurona-migrada-1")!.recientes).toBe(2);
    expect(localStorage.getItem(CLAVE_V1)).toBe("");
  });
});
