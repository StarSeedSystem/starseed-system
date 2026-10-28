/**
 * VZR1011D — Plática fluida: motor por latencia MEDIDA, trozos en paralelo e
 * interrupción. Todo con relojes y motores simulados: sin red, disco ni audio.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_MUESTRAS_POR_MOTOR,
  ORDEN_CAPAS,
  PRESUPUESTO_INTERRUPCION_MS,
  PRESUPUESTO_PRIMER_SONIDO_MS,
  candidatosDeNeuronas,
  capaDeMotor,
  crearInterruptor,
  cumplePresupuesto,
  elegirMotor,
  estimarDuracionMs,
  indiceCapa,
  medirInterrupcion,
  ordenarCadenaPorLatencia,
  ordenarMotores,
  planificarFluidez,
  planificarFrases,
  primeraFraseLista,
  resumeLatencia,
  type MuestraLatencia,
} from "@/lib/aurora/tts-oss/conversacion-fluida";

const muestra = (
  motor: string,
  valor: number,
  tipo: MuestraLatencia["tipo"] = "primer-sonido",
  timestamp = 0,
): MuestraLatencia => ({ motor, tipo, valor, timestamp });

describe("resumen de lo medido en esta neurona", () => {
  it("usa la mediana de las últimas muestras y separa primer audio de factor de tiempo real", () => {
    const r = resumeLatencia([
      muestra("chatterbox", 900),
      muestra("chatterbox", 300),
      muestra("chatterbox", 500),
      muestra("chatterbox", 0.5, "tiempo-real-voz"),
      muestra("chatterbox", 0.3, "tiempo-real-voz"),
    ]);
    expect(r.chatterbox.primerSonidoMs).toBe(500);
    expect(r.chatterbox.factorTiempoReal).toBe(0.4);
    expect(r.chatterbox.muestrasPrimerSonido).toBe(3);
    expect(r.chatterbox.muestrasTiempoReal).toBe(2);
  });

  it("solo mira las muestras más recientes y descarta valores imposibles", () => {
    const medidas = [
      muestra("x", 9000),
      ...Array.from({ length: MAX_MUESTRAS_POR_MOTOR }, (_, i) => muestra("x", 100 + i)),
      muestra("x", -5),
      muestra("x", Number.NaN),
    ];
    const r = resumeLatencia(medidas);
    expect(r.x.primerSonidoMs).toBe(102);
    expect(r.x.muestrasPrimerSonido).toBe(MAX_MUESTRAS_POR_MOTOR);
  });

  it("sin medida no se promete el presupuesto", () => {
    expect(cumplePresupuesto(undefined)).toBe(false);
    expect(cumplePresupuesto({ muestrasPrimerSonido: 1, muestrasTiempoReal: 0 })).toBe(false);
    expect(cumplePresupuesto({ primerSonidoMs: 300, muestrasPrimerSonido: 1, muestrasTiempoReal: 0 })).toBe(true);
  });
});

describe("capas del contrato §2.4", () => {
  it("van del aparato al sistema, en orden", () => {
    expect(ORDEN_CAPAS).toEqual(["aparato", "neurona-cuenta", "malla-grupo", "spaces", "sistema"]);
    expect(indiceCapa("aparato")).toBeLessThan(indiceCapa("neurona-cuenta"));
    expect(indiceCapa("malla-grupo")).toBeLessThan(indiceCapa("spaces"));
    expect(indiceCapa("sistema")).toBeGreaterThan(indiceCapa("spaces"));
  });

  it("reconoce los motores del registro y trata lo desconocido como del aparato", () => {
    expect(capaDeMotor("openvoice2")).toBe("spaces");
    expect(capaDeMotor("browser")).toBe("sistema");
    expect(capaDeMotor("voice158")).toBe("aparato");
    expect(capaDeMotor("motor-inventado")).toBe("aparato");
  });
});

describe("orden por latencia medida (conversación)", () => {
  const motores = [
    { motor: "lento", capa: "aparato" as const },
    { motor: "sin-medida", capa: "aparato" as const },
    { motor: "rapido", capa: "aparato" as const },
  ];
  const medidas = [muestra("lento", 1400), muestra("rapido", 320)];

  it("pone primero lo medido que cabe, luego lo no medido y al final lo que no llega", () => {
    expect(ordenarMotores(motores, medidas).map((m) => m.motor)).toEqual([
      "rapido",
      "sin-medida",
      "lento",
    ]);
  });

  it("entre dos que caben manda la latencia, no la ficha teórica", () => {
    const r = ordenarMotores(
      [{ motor: "teorico-rapido" }, { motor: "medido" }],
      [muestra("medido", 450)],
    );
    expect(r.map((m) => m.motor)).toEqual(["medido", "teorico-rapido"]);
  });

  it("en empate de latencia respeta las capas: aparato antes que Spaces", () => {
    const r = ordenarMotores(
      [{ motor: "space", capa: "spaces" }, { motor: "local", capa: "aparato" }],
      [muestra("space", 300), muestra("local", 300)],
    );
    expect(r.map((m) => m.motor)).toEqual(["local", "space"]);
  });

  it("sin ninguna medida conserva el orden de entrada si se le pide", () => {
    const cadena = ["voice158", "omnivoice", "openvoice2"];
    expect(ordenarCadenaPorLatencia(cadena, [], "conversacion", PRESUPUESTO_PRIMER_SONIDO_MS, true)).toEqual(cadena);
  });

  it("sin medidas y sin orden base, ordena por capas", () => {
    const r = ordenarCadenaPorLatencia(["openvoice2", "browser", "voice158"], [], "conversacion", 800, false);
    expect(r).toEqual(["voice158", "openvoice2", "browser"]);
  });

  it("devuelve el elegido con su capa y si cumple el presupuesto", () => {
    const r = elegirMotor(motores, medidas);
    expect(r?.motor).toBe("rapido");
    expect(r?.capa).toBe("aparato");
    expect(r?.cumple).toBe(true);
  });
});

describe("lectura y narración: manda la calidad", () => {
  it("una voz mejor pero más lenta gana a la rápida", () => {
    const r = ordenarMotores(
      [
        { motor: "rapida", calidad: 2 },
        { motor: "estudio", calidad: 5 },
      ],
      [muestra("rapida", 200), muestra("estudio", 1500)],
      { contexto: "lectura" },
    );
    expect(r.map((m) => m.motor)).toEqual(["estudio", "rapida"]);
  });

  it("con la misma calidad desempata la latencia medida", () => {
    const r = ordenarMotores(
      [{ motor: "a", calidad: 4 }, { motor: "b", calidad: 4 }],
      [muestra("a", 900), muestra("b", 300)],
      { contexto: "narracion" },
    );
    expect(r.map((m) => m.motor)).toEqual(["b", "a"]);
  });
});

describe("hablar mientras el modelo de lenguaje sigue escribiendo", () => {
  it("devuelve la primera frase cerrada y deja el resto", () => {
    expect(primeraFraseLista("Hola, ¿qué tal? Sigo escribiendo")).toEqual({
      frase: "Hola, ¿qué tal?",
      resto: "Sigo escribiendo",
    });
  });

  it("mientras no haya frase cerrada devuelve null (se sigue acumulando)", () => {
    expect(primeraFraseLista("Hola, ¿qué")).toBeNull();
    expect(primeraFraseLista("   ")).toBeNull();
  });

  it("sin puntuación y ya largo, corta por la última palabra para no esperar", () => {
    const trozo = primeraFraseLista("palabra ".repeat(40), 40);
    expect(trozo).not.toBeNull();
    expect(trozo?.frase.length).toBeLessThanOrEqual(40);
    expect(trozo?.frase.endsWith("palabra")).toBe(true);
  });

  it("en conversación trocea más corto que al leer", () => {
    const texto = "Una frase larga con varias palabras para probar el troceo. ".repeat(6);
    const charla = planificarFrases(texto, "conversacion");
    const lectura = planificarFrases(texto, "lectura");
    expect(charla.length).toBeGreaterThanOrEqual(lectura.length);
    expect(Math.max(...charla.map((f) => f.length))).toBeLessThanOrEqual(160);
    expect(Math.max(...lectura.map((f) => f.length))).toBeLessThanOrEqual(280);
  });

  it("estima la duración por el ritmo del habla", () => {
    expect(estimarDuracionMs("una dos tres cuatro cinco")).toBe(2000);
    expect(estimarDuracionMs("")).toBe(1);
  });
});

describe("plan de plática fluida", () => {
  const texto = "Hola, te escucho. Cuéntame qué necesitas. Te ayudo ahora mismo.";
  const motores = [{ motor: "chatterbox", capa: "aparato" as const }];

  it("el primer sonido sale dentro del presupuesto y no hay silencio mayor", () => {
    const plan = planificarFluidez({ texto, motores, muestras: [muestra("chatterbox", 400)] });
    expect(plan.cumplePresupuesto).toBe(true);
    expect(plan.tramos[0].suenaEnMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    for (const t of plan.tramos) {
      expect(t.silencioMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    }
    expect(plan.silencioMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
  });

  it("pide cada frase mientras suena la anterior", () => {
    const largo = "Hola, te escucho. Cuéntame qué necesitas. Te ayudo ahora mismo. ".repeat(4);
    const plan = planificarFluidez({ texto: largo, motores, muestras: [muestra("chatterbox", 400)] });
    expect(plan.tramos.length).toBeGreaterThan(1);
    for (let i = 1; i < plan.tramos.length; i++) {
      expect(plan.tramos[i].pideEnMs).toBe(plan.tramos[i - 1].suenaEnMs);
    }
  });

  it("sin medida no promete el presupuesto, pero deja el plan para intentarlo", () => {
    const plan = planificarFluidez({ texto, motores });
    expect(plan.cumplePresupuesto).toBe(false);
    expect(plan.motor).toBe("chatterbox");
    expect(plan.motivo).toContain("Sin medida");
    expect(plan.tramos[0].suenaEnMs).toBeGreaterThan(PRESUPUESTO_PRIMER_SONIDO_MS);
  });

  it("si el medido no llega, deja el siguiente como respaldo sin silencio", () => {
    const plan = planificarFluidez({
      texto,
      motores: [{ motor: "lento" }, { motor: "rapido" }],
      muestras: [muestra("lento", 1800), muestra("rapido", 200)],
    });
    expect(plan.motor).toBe("rapido");
    expect(plan.respaldo).toEqual(["lento"]);
    expect(plan.cumplePresupuesto).toBe(true);
  });
});

describe("interrumpir cuando la persona habla", () => {
  it("un corte dentro de 100 ms cumple; uno tardío no", () => {
    expect(medirInterrupcion(1000, 1060)).toEqual({ latenciaMs: 60, cumple: true });
    expect(medirInterrupcion(1000, 1000 + PRESUPUESTO_INTERRUPCION_MS + 1).cumple).toBe(false);
  });

  it("el interruptor mide desde que se oye a la persona y vuelve a escuchar", () => {
    const interruptor = crearInterruptor();
    interruptor.oyePersona(5000);
    expect(interruptor.escuchando()).toBe(true);
    expect(interruptor.cortar(5050)).toEqual({ latenciaMs: 50, cumple: true });
    expect(interruptor.escuchando()).toBe(false);
    expect(interruptor.cortar(6000).latenciaMs).toBe(0);
  });
});

describe("capas de la malla en el registro de neuronas", () => {
  it("la propia cuenta va antes que el grupo; la ajena no entra", () => {
    const { motores, muestras } = candidatosDeNeuronas([
      { nodoId: "grupo-1", grupo: true, habla: [{ motor: "chatterbox", primerSonidoMs: 250 }] },
      { nodoId: "mia-1", mismaCuenta: true, habla: [{ motor: "chatterbox", primerSonidoMs: 700 }] },
      { nodoId: "ajena-1", habla: [{ motor: "chatterbox", primerSonidoMs: 100 }] },
    ]);
    expect(ordenarMotores(motores, muestras).map((m) => m.motor)).toEqual([
      "neurona:mia-1:chatterbox",
      "neurona:grupo-1:chatterbox",
    ]);
    const orden = ordenarMotores(
      [...motores, { motor: "openvoice2", capa: "spaces" }],
      muestras,
    );
    expect(orden.map((m) => m.motor)).toEqual([
      "neurona:mia-1:chatterbox",
      "neurona:grupo-1:chatterbox",
      "openvoice2",
    ]);
  });
});

describe("frases muy cortas: el prefetch se adelanta", () => {
  it("una frase más corta que la espera no deja un silencio mayor que el presupuesto", () => {
    const plan = planificarFluidez({
      texto: "Sí. ".repeat(20),
      motores: [{ motor: "chatterbox", capa: "aparato" }],
      muestras: [muestra("chatterbox", 700)],
      maxTrozo: 20,
    });
    expect(plan.tramos.length).toBeGreaterThan(2);
    for (const t of plan.tramos) {
      expect(t.silencioMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    }
  });
});
