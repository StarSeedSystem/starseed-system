import { describe, it, expect } from "vitest";
import {
  CARACTERES_POR_SEGUNDO,
  INTERRUPCION_MAX_MS,
  PRESUPUESTO_PRIMER_SONIDO_MS,
  capaDeMotor,
  crearEstadoVoz,
  elegirMotorVoz,
  estimarDuracionMs,
  frasesListas,
  interrumpirVoz,
  ordenarCadenaPorLatencia,
  planificarTandas,
  resumirMedidas,
  type CandidatoVoz,
  type CapaVoz,
  type EstadoVoz,
  type MedidaMotorVoz,
} from "@/lib/aurora/tts-oss/conversacion-fluida";

/** Motor simulado: solo lo MEDIDO en esta neurona, nada teórico. */
function motor(
  nombre: string,
  capa: CapaVoz,
  primerSonidoMs: number | null,
  extra: Partial<CandidatoVoz> & { factorTiempoReal?: number | null } = {},
): CandidatoVoz {
  const { factorTiempoReal, ...resto } = extra;
  const medida: MedidaMotorVoz = { primerSonidoMs, factorTiempoReal: factorTiempoReal ?? 1 };
  return { motor: nombre, capa, medida, ...resto };
}

describe("conversacion-fluida · frases mientras el modelo escribe", () => {
  it("solo suelta frases completas y conserva el resto en vuelo", () => {
    const r = frasesListas("Hola, soy Astraura. Estoy pensando en tu pregunta");
    expect(r.frases).toEqual(["Hola, soy Astraura."]);
    expect(r.resto).toBe("Estoy pensando en tu pregunta");
  });

  it("suelta varias frases de golpe y no corta palabras al trocear un resto largo", () => {
    const texto = "Primera frase. Segunda frase con más palabras. Tercera que aún se está escribiendo y es bastante larga para pasar del máximo permitido";
    const r = frasesListas(texto, 40);
    expect(r.frases.length).toBeGreaterThanOrEqual(2);
    for (const frase of r.frases) expect(frase.length).toBeLessThanOrEqual(40);
    expect(r.resto.length).toBeLessThanOrEqual(40);
    expect([...r.frases, r.resto].join(" ")).toBe(texto.replace(/\s+/g, " ").trim());
  });

  it("sin texto no inventa frases; sin puntuación aún no habla", () => {
    expect(frasesListas("   ")).toEqual({ frases: [], resto: "" });
    expect(frasesListas("estoy pensando")).toEqual({ frases: [], resto: "estoy pensando" });
  });

  it("la duración audible no depende de lo rápido que sintetice el motor", () => {
    const ms = estimarDuracionMs("12345678901234", CARACTERES_POR_SEGUNDO);
    expect(ms).toBe(1000);
  });
});

describe("conversacion-fluida · medidas por motor", () => {
  it("resume la mediana del primer sonido y del factor de tiempo real", () => {
    const r = resumirMedidas([
      { motor: "kokoro", tipo: "primer-sonido", valor: 300 },
      { motor: "kokoro", tipo: "primer-sonido", valor: 500 },
      { motor: "kokoro", tipo: "primer-sonido", valor: 400 },
      { motor: "kokoro", tipo: "tiempo-real-voz", valor: 0.5 },
      { motor: "kokoro", tipo: "tiempo-real-voz", valor: 0.7 },
      { motor: "voxcpm", tipo: "primer-sonido", valor: 1500 },
    ]);
    expect(r.kokoro).toEqual({ primerSonidoMs: 400, factorTiempoReal: 0.6, muestras: 5 });
    expect(r.voxcpm?.primerSonidoMs).toBe(1500);
    expect(r.voxcpm?.factorTiempoReal).toBeNull();
  });

  it("descarta medidas basura y tipos que no son de voz", () => {
    const r = resumirMedidas([
      { motor: "", tipo: "primer-sonido", valor: 300 },
      { motor: "kokoro", tipo: "primer-sonido", valor: Number.NaN },
      { motor: "kokoro", tipo: "primer-sonido", valor: -5 },
      { motor: "kokoro", tipo: "tiempo-real-oido", valor: 900 },
      null as unknown as { motor: string; tipo: string; valor: number },
    ]);
    expect(r).toEqual({});
  });

  it("las capas del contrato van del aparato a la voz del sistema", () => {
    expect(capaDeMotor("kokoro")).toBe("aparato");
    expect(capaDeMotor("voice158")).toBe("neurona-local");
    expect(capaDeMotor("openvoice2")).toBe("spaces");
    expect(capaDeMotor("browser")).toBe("sistema");
    expect(capaDeMotor("motor-desconocido")).toBe("malla");
  });
});

describe("conversacion-fluida · el motor se elige por latencia MEDIDA", () => {
  it("dentro del presupuesto manda la capa y, dentro de la capa, lo medido", () => {
    const r = elegirMotorVoz([
      motor("voxcpm", "spaces", 120, { calidad: 1 }),
      motor("kokoro", "aparato", 350),
      motor("chatterbox", "aparato", 500),
    ]);
    expect(r.motor).toBe("kokoro");
    expect(r.capa).toBe("aparato");
    expect(r.medido).toBe(true);
    expect(r.cabeEnPresupuesto).toBe(true);
  });

  it("lo que se pasa del presupuesto pasa al siguiente sin quedarse esperando", () => {
    const r = elegirMotorVoz([
      motor("chatterbox", "aparato", 1200),
      motor("voice158", "neurona-local", 650),
      motor("openvoice2", "spaces", 400),
    ]);
    expect(r.motor).toBe("voice158");
    expect(r.primerSonidoMs).toBe(650);
    expect(r.descartados).toContainEqual({ motor: "chatterbox", motivo: "presupuesto" });
    expect(r.primerSonidoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
  });

  it("una medida rápida gana a un motor sin medir de una capa anterior (nada teórico)", () => {
    const r = elegirMotorVoz([
      motor("kokoro", "aparato", null),
      motor("openvoice2", "spaces", 300),
    ]);
    expect(r.motor).toBe("openvoice2");
    expect(r.medido).toBe(true);
    expect(r.descartados).toContainEqual({ motor: "kokoro", motivo: "sin-medida" });
  });

  it("sin ninguna medida elige el primero disponible, pero lo dice: no es una promesa", () => {
    const r = elegirMotorVoz([motor("kokoro", "aparato", null)]);
    expect(r.motor).toBe("kokoro");
    expect(r.medido).toBe(false);
    expect(r.cabeEnPresupuesto).toBe(false);
  });

  it("respeta el idioma y descarta lo que no está disponible", () => {
    const r = elegirMotorVoz([
      motor("kokoro", "aparato", 300, { idioma: "en" }),
      motor("chatterbox", "aparato", 350, { disponible: false }),
      motor("openvoice2", "spaces", 400, { idioma: "es-ES" }),
    ], { idioma: "es" });
    expect(r.motor).toBe("openvoice2");
    expect(r.descartados).toContainEqual({ motor: "kokoro", motivo: "idioma" });
    expect(r.descartados).toContainEqual({ motor: "chatterbox", motivo: "no-disponible" });
  });

  it("en lectura manda la calidad aunque tarde más que el presupuesto de conversación", () => {
    const r = elegirMotorVoz([
      motor("kokoro", "aparato", 200, { calidad: 0.5 }),
      motor("voxcpm", "spaces", 2500, { calidad: 1 }),
    ], { modo: "lectura" });
    expect(r.motor).toBe("voxcpm");
    expect(r.cabeEnPresupuesto).toBe(false);
  });

  it("sin candidatos no elige a nadie (el suelo del navegador cubre el turno)", () => {
    const r = elegirMotorVoz([]);
    expect(r.motor).toBeNull();
    expect(r.medido).toBe(false);
  });
});

describe("conversacion-fluida · reordenar la cadena con lo medido", () => {
  const medidas: Record<string, MedidaMotorVoz> = {
    openvoice2: { primerSonidoMs: 900, factorTiempoReal: 1 },
    voxcpm: { primerSonidoMs: 250, factorTiempoReal: 0.8 },
  };

  it("primero los que caben, luego los sin medir y al final los lentos", () => {
    expect(ordenarCadenaPorLatencia(["openvoice2", "kokoro", "voxcpm"], medidas)).toEqual([
      "voxcpm",
      "kokoro",
      "openvoice2",
    ]);
  });

  it("en lectura la cadena original manda (calidad antes que latencia)", () => {
    expect(ordenarCadenaPorLatencia(["openvoice2", "kokoro", "voxcpm"], medidas, { modo: "lectura" })).toEqual([
      "openvoice2",
      "kokoro",
      "voxcpm",
    ]);
  });

  it("sin medidas no toca el orden", () => {
    expect(ordenarCadenaPorLatencia(["a", "b"], {})).toEqual(["a", "b"]);
  });
});

describe("conversacion-fluida · habla por tandas sin silencios", () => {
  const trozos = [
    "Hola, soy Astraura.",
    "Estoy pensando en tu pregunta.",
    "Te lo cuento ahora mismo.",
  ];

  it("sintetiza la siguiente mientras suena la anterior y ningún hueco pasa del presupuesto", () => {
    const plan = planificarTandas(trozos, [motor("kokoro", "aparato", 350, { factorTiempoReal: 0.5 })]);
    expect(plan.motor).toBe("kokoro");
    expect(plan.tandas).toHaveLength(3);
    expect(plan.huecoMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(plan.tandas[0].primerSonidoMs).toBe(350);
    expect(plan.tandas[1].inicioSintesisMs).toBeLessThan(plan.tandas[0].finMs);
    for (const tanda of plan.tandas) {
      expect(tanda.huecoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
      expect(tanda.finMs).toBeGreaterThan(tanda.primerSonidoMs);
    }
  });

  it("un motor con factor de tiempo real lento deja huecos: se releva al siguiente", () => {
    const plan = planificarTandas(trozos, [
      motor("chatterbox", "aparato", 300, { factorTiempoReal: 3 }),
      motor("kokoro", "aparato", 400, { factorTiempoReal: 0.5 }),
    ]);
    expect(plan.motor).toBe("kokoro");
    expect(plan.descartados).toContainEqual({ motor: "chatterbox", motivo: "hueco" });
    expect(plan.huecoMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
  });

  it("un motor que no llega ni a la primera frase se salta sin dejar el turno mudo", () => {
    const plan = planificarTandas(trozos, [
      motor("voxcpm", "spaces", 1500, { factorTiempoReal: 0.4 }),
      motor("openvoice2", "spaces", 700, { factorTiempoReal: 0.4 }),
    ]);
    expect(plan.motor).toBe("openvoice2");
    expect(plan.primerSonidoMs).toBe(700);
    expect(plan.cabeEnPresupuesto).toBe(true);
  });

  it("sin medidas no se inventa un plan: el llamador usa la siguiente capa", () => {
    const plan = planificarTandas(trozos, [motor("kokoro", "aparato", null)]);
    expect(plan.motor).toBeNull();
    expect(plan.tandas).toEqual([]);
    expect(plan.descartados).toContainEqual({ motor: "kokoro", motivo: "sin-medida" });
  });

  it("sin trozos no hay plan", () => {
    expect(planificarTandas([], [motor("kokoro", "aparato", 300)]).motor).toBeNull();
  });
});

describe("conversacion-fluida · interrumpir al instante y escuchar", () => {
  it("el corte ocurre en menos de 100 ms desde que la persona empieza a hablar", () => {
    let reloj = 1_000;
    let estado: EstadoVoz = { ...crearEstadoVoz(reloj, "chatterbox"), fase: "hablando" };
    reloj += 120;
    const detectadaEn = reloj;
    const corte = interrumpirVoz(estado, detectadaEn);
    estado = corte.estado;
    expect(estado.fase).toBe("escuchando");
    expect(estado.motor).toBe("chatterbox");
    expect(estado.desde - detectadaEn).toBeLessThan(INTERRUPCION_MAX_MS);
    expect(corte.latenciaMs).toBe(0);
    expect(corte.dentroDelPresupuesto).toBe(true);
    expect(corte.efectos).toEqual(["cortar-audio", "escuchar"]);
  });

  it("un retardo mayor que el presupuesto se denuncia en vez de fingir fluidez", () => {
    const corte = interrumpirVoz(crearEstadoVoz(0, "kokoro"), 500, { retardoCorteMs: 150 });
    expect(corte.latenciaMs).toBe(150);
    expect(corte.dentroDelPresupuesto).toBe(false);
    expect(corte.estado.fase).toBe("escuchando");
  });
});
