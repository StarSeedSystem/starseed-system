import { describe, expect, it } from "vitest";
import {
  PRESUPUESTO_INTERRUPCION_MS,
  PRESUPUESTO_PRIMER_SONIDO_MS,
  evaluarInterrupcion,
  ordenarMotores,
  planificarConRelevo,
  planificarDialogo,
  trocearParaDialogo,
  type MedidaMotor,
  type TrozoLlm,
} from "@/lib/aurora/tts-oss/conversacion-fluida";

const aparato: MedidaMotor = { motor: "aparato-f1", capa: "aparato", primerSonidoMs: 700, factorTiempoReal: 0.2, latenciaCorteMs: 40, calidad: 0.5 };
const espacios: MedidaMotor = { motor: "spaces-ov", capa: "spaces", primerSonidoMs: 100, factorTiempoReal: 0.2, latenciaCorteMs: 40, calidad: 0.9 };
const localLento: MedidaMotor = { ...aparato, motor: "local-lento", capa: "neurona-local", primerSonidoMs: 900 };
const lentoAlCortar: MedidaMotor = { ...aparato, motor: "lento-corte", primerSonidoMs: 50, latenciaCorteMs: 150 };
const listo: TrozoLlm[] = [
  { texto: "Hola, te escucho.", listoEnMs: 0, duracionAudioMs: 1000 },
  { texto: "Sigo escribiendo la respuesta.", listoEnMs: 900, duracionAudioMs: 800 },
];

describe("ordenarMotores", () => {
  it("respeta las capas antes que la latencia bruta en conversación", () => {
    expect(ordenarMotores([espacios, aparato], "conversacion").map((m) => m.motor)).toEqual(["aparato-f1", "spaces-ov"]);
  });
  it("descarta en conversación lo que no se puede cortar en 100 ms", () => {
    expect(ordenarMotores([lentoAlCortar], "conversacion")).toEqual([]);
    expect(ordenarMotores([lentoAlCortar], "lectura")).toHaveLength(1);
  });
  it("en lectura manda la calidad, no la cercanía de la capa", () => {
    expect(ordenarMotores([aparato, espacios], "lectura")[0].motor).toBe("spaces-ov");
  });
});

describe("planificarDialogo", () => {
  it("empieza con la primera frase mientras el LLM sigue escribiendo y sintetiza la siguiente sin silencio", () => {
    const plan = planificarDialogo(listo, { motor: "aparato-f1", primerSonidoMs: 400, factorTiempoReal: 0.1 });
    expect(plan.primerSonidoMs).toBe(400);
    expect(plan.primerSonidoMs).toBeLessThan(listo[1].listoEnMs);
    expect(plan.frases[1].inicioSintesisMs).toBe(900);
    expect(plan.frases[1].inicioSintesisMs).toBeLessThan(plan.frases[0].finAudioMs);
    expect(plan.silencioMaximoMs).toBe(0);
    expect(plan.dentroDePresupuesto).toBe(true);
  });
  it("mide el silencio cuando el texto tarda y lo deja fuera del presupuesto", () => {
    const tardio: TrozoLlm[] = [listo[0], { ...listo[1], listoEnMs: 3000 }];
    const plan = planificarDialogo(tardio, { motor: "aparato-f1", primerSonidoMs: 400, factorTiempoReal: 0.1 });
    expect(plan.silencioMaximoMs).toBe(2000);
    expect(plan.silencioMaximoMs).toBeGreaterThan(PRESUPUESTO_PRIMER_SONIDO_MS);
  });
});

describe("planificarConRelevo", () => {
  it("elige el motor de la capa más cercana que llega al presupuesto y anota el relevo", () => {
    const r = planificarConRelevo([espacios, aparato], listo);
    expect(r?.motor.motor).toBe("aparato-f1");
    expect(r?.plan.dentroDePresupuesto).toBe(true);
    expect(r?.relevos.map((x) => x.motor)).toEqual(["spaces-ov"]);
  });
  it("si la capa cercana no llega, pasa a la siguiente sin quedarse muda", () => {
    const r = planificarConRelevo([localLento, { ...aparato, primerSonidoMs: 900 }, { ...espacios, capa: "neurona-local", motor: "local-rapido", primerSonidoMs: 500 }], listo);
    expect(r?.motor.motor).toBe("local-rapido");
    expect(r?.plan.primerSonidoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(r?.relevos.map((x) => x.motor)).toContain("aparato-f1");
  });
  it("releva si llega al primer sonido pero deja un silencio mayor que el presupuesto", () => {
    const lento = { ...aparato, motor: "aparato-lento", primerSonidoMs: 100, factorTiempoReal: 3 };
    const rapido = { ...espacios, motor: "spaces-rapido", primerSonidoMs: 700, factorTiempoReal: 0.1 };
    const r = planificarConRelevo([lento, rapido], listo);
    expect(r?.motor.motor).toBe("spaces-rapido");
    expect(r?.plan.silencioMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(r?.relevos.map((x) => x.motor)).toEqual(["aparato-lento"]);
  });
  it("si nadie llega, habla el medido más rápido y lo dice sin fingir", () => {
    const r = planificarConRelevo([{ ...aparato, primerSonidoMs: 950 }, { ...localLento, primerSonidoMs: 900 }], listo);
    expect(r?.motor.motor).toBe("local-lento");
    expect(r?.plan.dentroDePresupuesto).toBe(false);
  });
  it("en lectura elige la mejor calidad aunque tarde", () => {
    expect(planificarConRelevo([aparato, espacios], listo, { contexto: "lectura" })?.motor.motor).toBe("spaces-ov");
  });
});

describe("evaluarInterrupcion", () => {
  it("corta al instante cuando la persona habla y cabe en 100 ms", () => {
    const r = evaluarInterrupcion({ hablando: true }, { latenciaCorteMs: 60 });
    expect(r.cortar).toBe(true);
    expect(r.latenciaCorteMs).toBe(60);
    expect(r.dentroDePresupuesto).toBe(true);
    expect(r.latenciaCorteMs).toBeLessThan(PRESUPUESTO_INTERRUPCION_MS);
  });
  it("suma el buffer irrecuperable y avisa si pasa del presupuesto", () => {
    const r = evaluarInterrupcion({ hablando: true, bufferMs: 80 }, { latenciaCorteMs: 40 });
    expect(r.latenciaCorteMs).toBe(120);
    expect(r.dentroDePresupuesto).toBe(false);
  });
  it("si no hay voz sonando, no hay nada que cortar", () => {
    expect(evaluarInterrupcion({ hablando: false }, { latenciaCorteMs: 500 }).cortar).toBe(false);
  });
});

describe("trocearParaDialogo", () => {
  it("usa el troceado de frases del OS y no parte palabras", () => {
    const trozos = trocearParaDialogo("Primera frase corta. Segunda frase también corta para probar el troceo.", 30);
    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos.every((t) => t.length <= 30)).toBe(true);
    expect(trozos.join(" ")).toContain("Segunda frase");
  });
});
