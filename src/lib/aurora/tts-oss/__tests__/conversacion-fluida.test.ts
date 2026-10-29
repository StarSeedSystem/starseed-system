/**
 * conversacion-fluida.test.ts — pruebas de la plática fluida (VZR1011D).
 * Todo aquí es puro: medidas falsas, motores simulados y relojes en ms.
 * Contrato: `architecture/astraura-voces-y-robots.md` §2.
 */
import { describe, expect, it } from "vitest";
import {
  CAPAS_ORDEN,
  LIMITE_INTERRUPCION_MS,
  PRESUPUESTO_PRIMER_SONIDO_MS,
  cronograma,
  evaluarInterrupcion,
  medidasPorMotor,
  modoHablaDe,
  ordenarCapas,
  planificarTurno,
  reordenarPorLatenciaMedida,
} from "@/lib/aurora/tts-oss/conversacion-fluida";
import type {
  CapaPlaniada,
  MedidaMotor,
  MedidaSuelta,
  ModoHabla,
} from "@/lib/aurora/tts-oss/conversacion-fluida";

const medida = (motor: string, primerSonidoMs?: number, factorTiempoReal?: number): MedidaMotor => ({
  motor,
  primerSonidoMs,
  factorTiempoReal,
});

describe("modoHablaDe", () => {
  it("AUTO encendido (o sin decidir) = conversación", () => {
    expect(modoHablaDe({ auto: true })).toBe("conversacion");
    expect(modoHablaDe({})).toBe("conversacion");
  });
  it("AUTO apagado = lectura (manda la calidad)", () => {
    expect(modoHablaDe({ auto: false })).toBe("lectura");
  });
});

describe("medidasPorMotor", () => {
  it("agrega mediana de primer-sonido y último factor de tiempo real", () => {
    const sueltas: MedidaSuelta[] = [
      { motor: "chatterbox", tipo: "primer-sonido", valor: 900, timestamp: 10 },
      { motor: "chatterbox", tipo: "primer-sonido", valor: 300, timestamp: 20 },
      { motor: "chatterbox", tipo: "primer-sonido", valor: 500, timestamp: 30 },
      { motor: "chatterbox", tipo: "tiempo-real-voz", valor: 0.5, timestamp: 10 },
      { motor: "chatterbox", tipo: "tiempo-real-voz", valor: 0.3, timestamp: 40 },
    ];
    const r = medidasPorMotor(sueltas);
    expect(r).toEqual([{ motor: "chatterbox", primerSonidoMs: 500, factorTiempoReal: 0.3 }]);
  });
  it("ignora basura sin motor y no inventa medidas", () => {
    const sueltas: MedidaSuelta[] = [
      { motor: "  ", tipo: "primer-sonido", valor: 100, timestamp: 1 },
      { motor: "omnivoice", tipo: "primer-sonido", valor: 200, timestamp: 2 },
    ];
    expect(medidasPorMotor(sueltas)).toEqual([{ motor: "omnivoice", primerSonidoMs: 200 }]);
    expect(medidasPorMotor([])).toEqual([]);
  });
});

describe("reordenarPorLatenciaMedida", () => {
  it("el medido rápido va delante del teórico primero", () => {
    const cadena = ["omnivoice", "chatterbox", "openvoice2"] as const;
    const medidas = [medida("chatterbox", 420, 0.4)];
    // Teoría: omnivoice primero; medida: chatterbox ya habló en 420 ms.
    expect(reordenarPorLatenciaMedida(cadena, [...medidas])).toEqual([
      "chatterbox",
      "omnivoice",
      "openvoice2",
    ]);
  });
  it("empata por menor factor de tiempo real", () => {
    const cadena = ["a", "b"] as const;
    const medidas = [medida("a", 400, 1.0), medida("b", 400, 0.5)];
    expect(reordenarPorLatenciaMedida(cadena, medidas)).toEqual(["b", "a"]);
  });
  it("lo sin medida queda delante de lo medido lento y conserva su teoría entre sí", () => {
    const cadena = ["omnivoice", "lento", "openvoice2"] as const;
    const medidas = [medida("lento", 2_000)];
    expect(reordenarPorLatenciaMedida(cadena, medidas)).toEqual([
      "omnivoice",
      "openvoice2",
      "lento",
    ]);
  });
  it("los lentos se ordenan entre sí por su primer sonido", () => {
    const cadena = ["lento2", "lento1"] as const;
    const medidas = [medida("lento1", 1_500), medida("lento2", 2_500)];
    expect(reordenarPorLatenciaMedida(cadena, medidas)).toEqual(["lento1", "lento2"]);
  });
  it("en lectura manda la calidad: orden intacto después de las medidas", () => {
    const cadena = ["omnivoice", "chatterbox"] as const;
    const medidas = [medida("chatterbox", 200)];
    const leido: ModoHabla = "lectura";
    expect(reordenarPorLatenciaMedida(cadena, medidas, leido)).toEqual([
      "omnivoice",
      "chatterbox",
    ]);
  });
  it("sin medidas, la cadena no cambia", () => {
    const cadena = ["x", "y", "z"] as const;
    expect(reordenarPorLatenciaMedida(cadena, [])).toEqual([...cadena]);
  });
});

describe("planificarTurno", () => {
  it("trocea por frases y la primera frase va sola", () => {
    const plan = planificarTurno(
      "Hola, ¿cómo vas? Que sepas que hoy el sol sale tarde y hay bruma en el valle del río. Después te cuento.",
      60,
    );
    expect(plan.trozos.length).toBeGreaterThan(1);
    // El trozo 0 es solo la primera frase: puede empezar a sonar YA.
    expect(plan.trozos[0].endsWith("vas?")).toBe(true);
    // Todos los trozos respetan el máximo.
    for (const t of plan.trozos) expect(t.length).toBeLessThanOrEqual(60);
  });
  it("el prefetch cubre todo menos el último trozo", () => {
    const plan = planificarTurno("Uno. Dos. Tres.", 80);
    expect(plan.trozos).toEqual(["Uno.", "Dos.", "Tres."]);
    expect(plan.prefetch).toEqual([0, 1]);
  });
  it("texto corto = un solo trozo, sin prefetch", () => {
    const plan = planificarTurno("Hola.");
    expect(plan.trozos).toEqual(["Hola."]);
    expect(plan.prefetch).toEqual([]);
  });
});

describe("ordenarCapas", () => {
  const capa = (
    nombre: string,
    cadena: string[],
    medidas: MedidaMotor[],
  ): CapaPlaniada => {
    const c: CapaPlaniada = {
      capa: nombre as CapaPlaniada["capa"],
      cadena,
      medidas,
      dentroDelPresupuesto: true,
    };
    return c;
  };

  it("una capa medida lenta pasa al final sin tirar nada", () => {
    const texto: CapaPlaniada[] = [
      capa("aparato", ["voice158"], [medida("voice158", 1_400)]),
      capa("malla", ["omnivoice-malla"], [medida("omnivoice-malla", 500)]),
      capa("spaces", ["chatterbox"], [medida("chatterbox", 620)]),
    ];
    const r = ordenarCapas(texto);
    expect(r.map((c) => c.capa)).toEqual(["malla", "spaces", "aparato"]);
    expect(r[2].dentroDelPresupuesto).toBe(false);
    // Todas las capas conservan su cadena.
    for (const c of r) expect(c.cadena.length).toBe(1);
  });
  it("respeta el orden canónico entre capas dentro del presupuesto", () => {
    const texto: CapaPlaniada[] = [
      capa("sistema", ["navegador"], []),
      capa("spaces", ["chatterbox"], [medida("chatterbox", 700)]),
      capa("neurona-remota", ["voice158"], [medida("voice158", 350)]),
    ];
    const r = ordenarCapas(texto);
    expect(r.map((c) => c.capa)).toEqual(["neurona-remota", "spaces", "sistema"]);
  });
  it("capa sin ninguna medida no se penaliza (puede llegar)", () => {
    const texto: CapaPlaniada[] = [
      capa("aparato", ["voice158"], []),
      capa("malla", ["omnivoice"], [medida("omnivoice", 3_000)]),
    ];
    const r = ordenarCapas(texto);
    expect(r[0].capa).toBe("aparato");
    expect(r[0].dentroDelPresupuesto).toBe(true);
    expect(r[1].dentroDelPresupuesto).toBe(false);
  });
  it("el presupuesto por defecto es 0,8 s", () => {
    expect(PRESUPUESTO_PRIMER_SONIDO_MS).toBe(800);
    expect(CAPAS_ORDEN).toEqual(["aparato", "neurona-remota", "malla", "spaces", "sistema"]);
  });
});

describe("cronograma — motores simulados y relojes en ms", () => {
  it("motor rápido: primer sonido dentro del presupuesto y sin silencios", () => {
    // Frases de ~2 s cada una; motor con espera de 250 ms por trozo.
    const c = cronograma([2_000, 2_000, 1_500], 250);
    expect(c.primerSonidoMs).toBe(250);
    expect(c.dentroDelPresupuesto).toBe(true);
    expect(c.silencioMaximoMs).toBe(0);
    expect(c.sinSilencios).toBe(true);
    expect(c.totalMs).toBe(5_750);
    // Los trozos suenan seguidos, cada uno cuando el altavoz queda libre.
    expect(c.pasos.map((p) => p.suenaMs)).toEqual([250, 2_250, 4_250]);
  });
  it("motor justo: la síntesis de la segunda termina tras el audio de la primera — silencio anotado", () => {
    const c = cronograma([300, 300], 700);
    // Trozo 0 sonó 0,3 s (hasta 1,0 s); trozo 1 estaba listo a 1,4 s → hueco 0,4 s.
    expect(c.pasos[1].silencioAntesMs).toBe(400);
    expect(c.silencioMaximoMs).toBe(400);
    expect(c.primerSonidoMs).toBe(700);
    expect(c.dentroDelPresupuesto).toBe(true);
  });
  it("ningún silencio pasa del presupuesto", () => {
    for (const audio of [[450, 450], [1_500, 1_500, 1_500], [200, 6_000]]) {
      const c = cronograma(audio, 600);
      expect(c.silencioMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
      expect(c.sinSilencios).toBe(true);
    }
  });
  it("motor lento: primero no llega al presupuesto (pasa a la capa de detrás sin tirarse)", () => {
    const c = cronograma([2_000, 2_000], 950);
    expect(c.primerSonidoMs).toBe(950);
    expect(c.dentroDelPresupuesto).toBe(false);
    // Mientras tanto sigue la cola: sin silencios entre sus dos trozos.
    expect(c.silencioMaximoMs).toBe(0);
    expect(c.sinSilencios).toBe(true);
  });
  it("turno vacío no inventa pasos", () => {
    const c = cronograma([], 300);
    expect(c.pasos).toEqual([]);
    expect(c.primerSonidoMs).toBe(300);
    expect(c.totalMs).toBe(0);
    expect(c.sinSilencios).toBe(true);
  });
  it("el presupuesto dado manda para ambos juicios", () => {
    // Audio mínimo, espera 0,5 s, presupuesto 0,4 s: primer sonido tarde y huecos.
    const c = cronograma([50, 50], 500, 400);
    expect(c.primerSonidoMs).toBe(500);
    expect(c.dentroDelPresupuesto).toBe(false);
    expect(c.silencioMaximoMs).toBe(450);
    expect(c.sinSilencios).toBe(false);
  });
});

describe("evaluarInterrupcion", () => {
  it("corta al instante: por debajo del límite", () => {
    expect(LIMITE_INTERRUPCION_MS).toBe(100);
    const r = evaluarInterrupcion(5_000, 5_060);
    expect(r.msHastaCortar).toBe(60);
    expect(r.rapida).toBe(true);
  });
  it("99 ms vale, 100 no: el contrato pide MENOS de 100 ms", () => {
    expect(evaluarInterrupcion(0, 99).rapida).toBe(true);
    expect(evaluarInterrupcion(0, 100).rapida).toBe(false);
    expect(evaluarInterrupcion(0, 150).rapida).toBe(false);
  });
  it("no inventa tiempos negativos", () => {
    expect(evaluarInterrupcion(400, 380).msHastaCortar).toBe(0);
  });
});
