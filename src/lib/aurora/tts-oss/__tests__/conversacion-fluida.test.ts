/**
 * VZR1011D — Conversación fluida: motor por latencia MEDIDA, trozos solapados e
 * interrupción inmediata. Sin red, sin audio y sin reloj real.
 */
import { describe, expect, it } from "vitest";
import { INTERRUPCION_MAX_MS, PRESUPUESTO_PRIMER_SONIDO_MS, TROZO_CONVERSACION_MAX, elegirMotor, medidasPorMotor, ordenarMotores, planificarCharla, trozosDeConversacion, type CandidatoVoz } from "@/lib/aurora/tts-oss/conversacion-fluida";
const APARATO: CandidatoVoz = { id: "aparato", capa: "aparato", calidad: 0.4, orden: 0 };
const OTRA_NEURONA: CandidatoVoz = { id: "otra-neurona", capa: "neurona-cuenta", calidad: 0.5, orden: 1 };
const MALLA: CandidatoVoz = { id: "malla", capa: "malla-grupo", calidad: 0.6, orden: 2 };
const SPACE: CandidatoVoz = { id: "space", capa: "spaces", calidad: 0.9, orden: 3 };
const SISTEMA: CandidatoVoz = { id: "sistema", capa: "sistema", calidad: 0.1, orden: 4 };
const CANDIDATOS = [SPACE, APARATO, OTRA_NEURONA, MALLA, SISTEMA];
describe("motor por latencia medida", () => {
  it("agrupa la mediana de primer sonido y RTF; sin medida no se inventa", () => {
    const m = medidasPorMotor([
      { motor: "aparato", tipo: "primer-sonido", valor: 600 },
      { motor: "aparato", tipo: "primer-sonido", valor: 400 },
      { motor: "aparato", tipo: "tiempo-real-voz", valor: 0.3 },
      { motor: "space", tipo: "primer-sonido", valor: 1200 },
      { motor: "sin-primer", tipo: "tiempo-real-voz", valor: 0.1 },
      { motor: "roto", tipo: "primer-sonido", valor: -2 },
    ]);
    expect(m.aparato).toEqual({ primerSonidoMs: 500, factorTiempoReal: 0.3 });
    expect(m.space).toEqual({ primerSonidoMs: 1200 });
    expect(m["sin-primer"]).toBeUndefined();
    expect(m.roto).toBeUndefined();
  });
  it("en conversación respeta las capas si llegan al presupuesto", () => {
    const medidas = {
      space: { primerSonidoMs: 200, factorTiempoReal: 0.2 },
      aparato: { primerSonidoMs: 600, factorTiempoReal: 0.4 },
      sistema: { primerSonidoMs: 50 },
    };
    const elegido = elegirMotor(CANDIDATOS, medidas);
    expect(elegido?.motor.id).toBe("aparato");
    expect(elegido?.dentroPresupuesto).toBe(true);
  });
  it("descarta lo que no llega al presupuesto o no va a tiempo real", () => {
    const medidas = {
      aparato: { primerSonidoMs: 900, factorTiempoReal: 0.2 },
      "otra-neurona": { primerSonidoMs: 700, factorTiempoReal: 1.2 },
      malla: { primerSonidoMs: 750, factorTiempoReal: 0.8 },
      space: { primerSonidoMs: 300, factorTiempoReal: 0.3 },
    };
    const elegido = elegirMotor(CANDIDATOS, medidas);
    expect(elegido?.motor.id).toBe("malla");
    expect(elegido?.dentroPresupuesto).toBe(true);
  });
  it("sin nada dentro del presupuesto habla el más rápido y lo confiesa", () => {
    const medidas = {
      aparato: { primerSonidoMs: 2000, factorTiempoReal: 0.1 },
      space: { primerSonidoMs: 1500, factorTiempoReal: 0.1 },
    };
    const elegido = elegirMotor(CANDIDATOS, medidas);
    expect(elegido?.motor.id).toBe("space");
    expect(elegido?.dentroPresupuesto).toBe(false);
    expect(elegido?.motivo).toContain("más rápido medido");
  });
  it("en lectura y narración manda la calidad, no la prisa", () => {
    const medidas = {
      space: { primerSonidoMs: 2000, factorTiempoReal: 2 },
      aparato: { primerSonidoMs: 300, factorTiempoReal: 0.3 },
    };
    expect(ordenarMotores(CANDIDATOS, medidas, "lectura")[0].id).toBe("space");
    const elegido = elegirMotor(CANDIDATOS, medidas, { contexto: "narracion" });
    expect(elegido?.motor.id).toBe("space");
    expect(elegido?.dentroPresupuesto).toBe(true);
  });
});
describe("turno fluido por trozos", () => {
  it("sintetiza la siguiente frase mientras suena la anterior, sin silencios", () => {
    const plan = planificarCharla(
      [
        { texto: "Hola, te escucho.", duracionAudioMs: 1200 },
        { texto: "Sigo contigo.", duracionAudioMs: 1500 },
      ],
      { primerSonidoMs: 300, factorTiempoReal: 0.3 },
    );
    expect(plan.primerSonidoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(plan.silencioMaximoMs).toBeLessThanOrEqual(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(plan.dentroPresupuesto).toBe(true);
    expect(plan.tramos[1].inicioSintesisMs).toBe(plan.tramos[0].inicioAudioMs);
    expect(plan.tramos[1].inicioSintesisMs).toBeLessThan(plan.tramos[0].finAudioMs);
  });
  it("un motor más lento que el tiempo real deja huecos y queda fuera", () => {
    const plan = planificarCharla(
      [
        { texto: "Uno.", duracionAudioMs: 1000 },
        { texto: "Dos.", duracionAudioMs: 1000 },
      ],
      { primerSonidoMs: 600, factorTiempoReal: 2 },
    );
    expect(plan.silencioMaximoMs).toBeGreaterThan(PRESUPUESTO_PRIMER_SONIDO_MS);
    expect(plan.dentroPresupuesto).toBe(false);
  });
  it("interrumpir corta el audio en el acto y no habla nada más", () => {
    const plan = planificarCharla(
      [
        { texto: "Una frase larga.", duracionAudioMs: 5000 },
        { texto: "Otra que no debe sonar.", duracionAudioMs: 4000 },
      ],
      { primerSonidoMs: 300, factorTiempoReal: 0.2 },
      { interrumpirEnMs: 1000 },
    );
    expect(plan.interrumpidoEnMs).toBe(1000);
    expect(plan.latenciaInterrupcionMs).toBeLessThan(INTERRUPCION_MAX_MS);
    expect(plan.tramos).toHaveLength(1);
    expect(plan.tramos[0].finAudioMs).toBe(1000);
    expect(plan.tramos.filter((t) => t.hablado)).toHaveLength(1);
  });
  it("trocea con la función del OS sin cortar palabras", () => {
    const trozos = trozosDeConversacion(
      "Primera frase corta. Segunda frase que tampoco pasa del tope de conversación. " +
        "Tercera frase con palabras enteras para que ninguna quede partida a la mitad. " + "Cuarta frase final que asegura pasar del tope con holgura suficiente.",
    );
    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos[0]).toMatch(/[.!?]$/);
    for (const t of trozos) expect(t.length).toBeLessThanOrEqual(TROZO_CONVERSACION_MAX);
  });
});
