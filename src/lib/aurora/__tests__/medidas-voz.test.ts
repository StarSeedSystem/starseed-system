// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import {
  CLAVE_MEDIDAS_VOZ,
  MAX_MEDIDAS_POR_MOTOR_Y_TIPO,
  anotarMedida,
  cronometroHabla,
  cronometroOido,
  leerMedidas,
  medidasDe,
  migrarDeV1,
  recortarMedidas,
  type DepsMedidas,
  type MedidaVoz,
} from "@/lib/aurora/medidas-voz";
import { vozMedida } from "@/lib/network/capacidades-nodo";

const DEV_NEURONA_ID = "dev-neurona-medidas-1015";
const CLAVE_V1 = "starseed.voz.medidas.v1";

function getIdNeurona() {
  return DEV_NEURONA_ID;
}

/** Almacén y reloj de mentira: nada toca localStorage ni Date.now. */
function banco(inicial: Record<string, string> = {}, neurona = "n-prueba") {
  const datos = new Map<string, string>(Object.entries(inicial));
  let reloj = 1_000;
  let escrituraFalla = false;
  const deps: DepsMedidas = {
    leer: (k) => datos.get(k) ?? null,
    escribir: (k, v) => {
      if (escrituraFalla) return false;
      datos.set(k, v);
      return true;
    },
    borrar: (k) => {
      datos.delete(k);
    },
    ahora: () => reloj,
    neurona: () => neurona,
  };
  return {
    datos,
    deps,
    avanzar: (ms: number) => {
      reloj += ms;
    },
    fallarEscritura: () => {
      escrituraFalla = true;
    },
    guardadas: (): MedidaVoz[] => JSON.parse(datos.get(CLAVE_MEDIDAS_VOZ) ?? "[]"),
  };
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

describe("medidas-voz · idioma, flujo y compatibilidad (VOZ1024A)", () => {
  it("guarda idioma y flujo cuando vienen, con la hora y la neurona inyectadas", () => {
    const b = banco();
    expect(anotarMedida({ motor: "phonon-2", tipo: "tiempo-real-oido", valor: 640, idioma: "es-ES", flujo: true }, b.deps)).toBe(true);
    expect(b.guardadas()).toEqual([
      { neurona: "n-prueba", motor: "phonon-2", tipo: "tiempo-real-oido", valor: 640, timestamp: 1_000, idioma: "es-ES", flujo: true },
    ]);
  });

  it("lo guardado sin idioma ni flujo se sigue leyendo igual; la basura del almacén se descarta", () => {
    const viejas = [
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 900, timestamp: 10 },
      { neurona: "n-prueba", motor: "", tipo: "primer-sonido", valor: 900, timestamp: 11 },
      { neurona: "n-prueba", motor: "kokoro", tipo: "otro-tipo", valor: 900, timestamp: 12 },
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: "900", timestamp: 13 },
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 800, timestamp: 14, idioma: 5, flujo: "sí" },
      null,
    ];
    const b = banco({ [CLAVE_MEDIDAS_VOZ]: JSON.stringify(viejas) });
    expect(leerMedidas("n-prueba", b.deps)).toEqual([
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 900, timestamp: 10 },
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 800, timestamp: 14 },
    ]);
  });

  it("una medida mal formada no se anota (valor no finito, motor vacío, sin neurona)", () => {
    const b = banco({}, "");
    expect(anotarMedida({ motor: "kokoro", tipo: "primer-sonido", valor: Number.NaN, neurona: "n" }, b.deps)).toBe(false);
    expect(anotarMedida({ motor: "  ", tipo: "primer-sonido", valor: 10, neurona: "n" }, b.deps)).toBe(false);
    expect(anotarMedida({ motor: "kokoro", tipo: "primer-sonido", valor: 10 }, b.deps)).toBe(false); // neurona ""
    expect(b.datos.has(CLAVE_MEDIDAS_VOZ)).toBe(false);
  });

  it("la ficha de la neurona lee el idioma y el flujo que se anotaron", () => {
    const b = banco();
    anotarMedida({ motor: "phonon-2", tipo: "tiempo-real-oido", valor: 600, idioma: "es-ES", flujo: true }, b.deps);
    b.avanzar(10);
    anotarMedida({ motor: "phonon-2", tipo: "tiempo-real-oido", valor: 700, idioma: "en" }, b.deps);
    b.avanzar(10);
    anotarMedida({ motor: "supertonic", tipo: "primer-sonido", valor: 380, idioma: "es", flujo: true }, b.deps);
    const voz = vozMedida(leerMedidas("n-prueba", b.deps), { neurona: "n-prueba", ahora: 2_000 });
    expect(voz).toEqual({
      oido: [{ motor: "phonon-2", idiomas: ["en", "es"], tiempoReal: 650, flujo: true }],
      habla: [{ motor: "supertonic", primerSonidoMs: 380 }],
    });
  });
});

describe("medidas-voz · recorte (VOZ1024A)", () => {
  const m = (motor: string, tipo: MedidaVoz["tipo"], timestamp: number, neurona = "n"): MedidaVoz => ({ neurona, motor, tipo, valor: timestamp, timestamp });

  it("recortarMedidas deja las más recientes de cada neurona, motor y tipo, en su orden", () => {
    const lista = [m("a", "primer-sonido", 1), m("b", "primer-sonido", 2), m("a", "primer-sonido", 3), m("a", "tiempo-real-oido", 4), m("a", "primer-sonido", 5), m("a", "primer-sonido", 6, "otra")];
    expect(recortarMedidas(lista, 2).map((x) => x.timestamp)).toEqual([2, 3, 4, 5, 6]);
    expect(recortarMedidas(lista, 2, 3).map((x) => x.timestamp)).toEqual([4, 5, 6]);
    expect(recortarMedidas([], 2)).toEqual([]);
  });

  it("anotarMedida nunca deja crecer un motor y tipo por encima del tope", () => {
    const b = banco();
    for (let i = 0; i < MAX_MEDIDAS_POR_MOTOR_Y_TIPO + 20; i++) {
      anotarMedida({ motor: "navegador", tipo: "tiempo-real-oido", valor: i + 1 }, b.deps);
      b.avanzar(1);
    }
    for (let i = 0; i < 5; i++) anotarMedida({ motor: "navegador", tipo: "primer-sonido", valor: 100 + i }, b.deps);
    const g = b.guardadas();
    const oido = g.filter((x) => x.tipo === "tiempo-real-oido");
    expect(oido).toHaveLength(MAX_MEDIDAS_POR_MOTOR_Y_TIPO);
    expect(oido[0].valor).toBe(21); // se fueron las 20 más viejas
    expect(oido[oido.length - 1].valor).toBe(MAX_MEDIDAS_POR_MOTOR_Y_TIPO + 20);
    expect(g.filter((x) => x.tipo === "primer-sonido")).toHaveLength(5);
  });
});

describe("medidas-voz · cronómetros (VOZ1024A)", () => {
  it("cronometroHabla anota el primer sonido una sola vez, en ms desde que se pidió", () => {
    const b = banco();
    const habla = cronometroHabla({ motor: "kokoro", idioma: "es" }, b.deps);
    b.avanzar(420);
    expect(habla.sono()).toBe(true);
    b.avanzar(3_000);
    expect(habla.sono()).toBe(false); // el resto de trozos no es «primer sonido»
    expect(b.guardadas()).toEqual([
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 420, timestamp: 1_420, idioma: "es" },
    ]);
  });

  it("cronometroHabla nunca anota 0 ms (la ficha descarta lo que no es positivo)", () => {
    const b = banco();
    cronometroHabla({ motor: "navegador" }, b.deps).sono();
    expect(b.guardadas()[0].valor).toBe(1);
  });

  it("cronometroOido mide del último parcial al final y vuelve a empezar", () => {
    const b = banco();
    const oido = cronometroOido({ motor: "navegador", idioma: "es-MX", flujo: true }, b.deps);
    expect(oido.final()).toBe(false); // un final sin voz oída antes no tiene desde dónde medir
    oido.oyendo();
    b.avanzar(200);
    oido.oyendo(); // el último parcial manda
    b.avanzar(650);
    expect(oido.final()).toBe(true);
    b.avanzar(100);
    expect(oido.final()).toBe(false); // ya se midió: hace falta voz nueva
    expect(b.guardadas().map((x) => [x.tipo, x.valor, x.idioma, x.flujo])).toEqual([["tiempo-real-oido", 650, "es-MX", true]]);
  });

  it("cronometroOido acepta voz oída antes de avisar (tramos con VAD)", () => {
    const b = banco();
    const oido = cronometroOido({ motor: "whisper-web", idioma: "es", flujo: false }, b.deps);
    oido.oyendo(700); // la última voz del tramo fue hace 700 ms (el silencio del VAD)
    b.avanzar(300); // lo que tardó Whisper
    oido.final();
    expect(b.guardadas()[0]).toMatchObject({ motor: "whisper-web", valor: 1_000, flujo: false });
  });

  it("con el almacén ilegible no lanzan ni lo reescriben (borraría lo medido)", () => {
    const escritas: string[] = [];
    const roto: Partial<DepsMedidas> = {
      leer: () => {
        throw new Error("almacén roto");
      },
      escribir: (_k, v) => {
        escritas.push(v);
      },
      ahora: () => 50,
      neurona: () => "n",
    };
    expect(cronometroHabla({ motor: "kokoro" }, roto).sono()).toBe(false);
    const oido = cronometroOido({ motor: "navegador" }, roto);
    oido.oyendo();
    expect(oido.final()).toBe(false);
    expect(escritas).toEqual([]);
    expect(leerMedidas(undefined, roto)).toEqual([]);
  });
});

describe("medidas-voz · migrarDeV1 (VOZ1024A)", () => {
  it("lee el TEXTO de la v1, lo suma a la v2 por orden de hora y borra la v1", () => {
    const v1 = [
      { motor: "kokoro", tipo: "primer-sonido", valor: 900, timestamp: 5 },
      { motor: "navegador", valor: 1, timestamp: 30 }, // sin tipo → corrección
      { tipo: "primer-sonido", valor: 900, timestamp: 6 }, // sin motor: no se puede atribuir
      { motor: "kokoro", valor: "900", timestamp: 7 },
    ];
    const v2 = [{ neurona: "n-otra", motor: "supertonic", tipo: "primer-sonido", valor: 400, timestamp: 20 }];
    const b = banco({ [CLAVE_V1]: JSON.stringify(v1), [CLAVE_MEDIDAS_VOZ]: JSON.stringify(v2) });
    expect(migrarDeV1(b.deps)).toBe(2);
    expect(b.guardadas()).toEqual([
      { neurona: "n-prueba", motor: "kokoro", tipo: "primer-sonido", valor: 900, timestamp: 5 },
      { neurona: "n-otra", motor: "supertonic", tipo: "primer-sonido", valor: 400, timestamp: 20 },
      { neurona: "n-prueba", motor: "navegador", tipo: "correccion", valor: 1, timestamp: 30 },
    ]);
    expect(b.datos.has(CLAVE_V1)).toBe(false);
  });

  it("una v1 vacía o ilegible (el «» que dejaba la versión anterior) se borra sin tocar la v2", () => {
    for (const raw of ["", "{no es json", JSON.stringify({ motor: "kokoro" })]) {
      const v2 = JSON.stringify([{ neurona: "n", motor: "kokoro", tipo: "primer-sonido", valor: 1, timestamp: 1 }]);
      const b = banco({ [CLAVE_V1]: raw, [CLAVE_MEDIDAS_VOZ]: v2 });
      expect(migrarDeV1(b.deps)).toBe(0);
      expect(b.datos.has(CLAVE_V1)).toBe(false);
      expect(b.datos.get(CLAVE_MEDIDAS_VOZ)).toBe(v2);
    }
  });

  it("si la v2 no queda guardada, la v1 se conserva para la próxima vez", () => {
    const v1 = JSON.stringify([{ motor: "kokoro", tipo: "primer-sonido", valor: 900, timestamp: 5 }]);
    const b = banco({ [CLAVE_V1]: v1 });
    b.fallarEscritura();
    expect(migrarDeV1(b.deps)).toBe(0);
    expect(b.datos.get(CLAVE_V1)).toBe(v1);
  });

  it("sin v1 no hace nada", () => {
    const b = banco();
    expect(migrarDeV1(b.deps)).toBe(0);
    expect(b.datos.size).toBe(0);
  });
});
