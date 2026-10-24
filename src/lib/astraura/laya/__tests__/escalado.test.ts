// Tests de escalado por la cadena de capas del plan (tarea D de la Ola 1018L). Solo Laya puro:
// respuestas de ejemplo con la forma real (probabilities, answer_confidence), sin red ni modelos.
import { describe, it, expect } from "vitest";
import { siguientePaso, destinoSubida, CADENA_SUBIDA, MAX_SUBIDAS, type EntradaEscalado, type PasoPlanLaya, type RespuestaLayaBasta } from "../escalado";

const paso = (capa: PasoPlanLaya["capa"], donde: PasoPlanLaya["donde"] = "local", modelo = `${capa}-modelo`): PasoPlanLaya =>
  ({ capa, modelo, donde });

/** Plan de ejemplo con toda la cadena, de abajo hacia arriba, como el planificador de capas. */
const PLAN_COMPLETO: readonly PasoPlanLaya[] = [
  paso("reflejo"), paso("memoria"), paso("palabra"), paso("razon"), paso("profunda"),
];

const basta = (answer_confidence: number) => ({ answer_confidence, probabilities: [answer_confidence, 1 - answer_confidence] });

const entrada = (cambios: Partial<EntradaEscalado>): EntradaEscalado => ({
  plan: PLAN_COMPLETO, capaActual: "palabra", privada: false, laya: basta(0.9), intentos: 0, ...cambios,
});

describe("cadena y destino de subida", () => {
  it("la cadena subible es reflejo → memoria → palabra → razon → profunda, sin voz ni adaptador", () => {
    expect(CADENA_SUBIDA).toEqual(["reflejo", "memoria", "palabra", "razon", "profunda"]);
    expect(CADENA_SUBIDA).toHaveLength(MAX_SUBIDAS + 2);
  });

  it("elige el primer paso del plan por encima de la capa actual", () => {
    expect(destinoSubida(PLAN_COMPLETO, "memoria")?.capa).toBe("palabra");
    expect(destinoSubida(PLAN_COMPLETO, "reflejo")?.capa).toBe("memoria");
  });

  it("salta las capas que faltan en el plan y ni voz ni adaptador sirven de destino", () => {
    const solo = [paso("reflejo"), paso("razon"), paso("voz"), paso("adaptador")];
    expect(destinoSubida(solo, "palabra")?.capa).toBe("razon");
    expect(destinoSubida(solo, "razon")).toBeNull();
  });

  it("con la capa actual arriba del todo de la cadena no hay destino", () => {
    expect(destinoSubida(PLAN_COMPLETO, "profunda")).toBeNull();
    expect(destinoSubida(PLAN_COMPLETO, "voz")).toBeNull();
  });
});

describe("siguientePaso · ¿basta la respuesta?", () => {
  it("acepta si Laya llega segura: answer_confidence por encima del umbral del punto", () => {
    expect(siguientePaso(entrada({}))).toEqual({ aceptar: true });
  });

  it("sube a la capa siguiente cuando Laya duda (confianza baja, como pasa en español)", () => {
    const paso = siguientePaso(entrada({ laya: basta(0.55) }));
    expect(paso).toEqual({
      subirA: "razon",
      motivo: "Laya duda (0.55 < 0.60): se sube a «razon» (razon-modelo en local).",
    });
  });

  it("sube cuando Laya no llega a tiempo (en CPU tarda segundos: no bloquea la primera palabra)", () => {
    const paso = siguientePaso(entrada({ laya: null }));
    expect("subirA" in paso && paso.subirA).toBe("razon");
  });

  it("sube si la respuesta no trae answer_confidence: la calibrada manda, confidence no cuenta", () => {
    const r = siguientePaso(entrada({ laya: {} as unknown as RespuestaLayaBasta }));
    expect(r).toEqual({ subirA: "razon", motivo: expect.stringContaining("answer_confidence") });
  });
});

describe("siguientePaso · núm de subidas y privacidad", () => {
  it("deja de subir con el techo de 3: se queda y lo dice", () => {
    const r = siguientePaso(entrada({ laya: null, intentos: MAX_SUBIDAS }));
    expect(("motivo" in r && r.motivo) ?? "").toContain("techo de 3");
    expect(r).toMatchObject({ aceptar: true });
  });

  it("permite la tercera subida: intentos 2 aún sube", () => {
    expect(siguientePaso(entrada({ laya: null, intentos: 2 }))).toMatchObject({ subirA: "razon" });
  });

  it("con estado privado se queda si la capa siguiente va a la nube, y lo dice", () => {
    const r = siguientePaso(entrada({
      privada: true, laya: null,
      plan: [paso("reflejo"), paso("memoria"), paso("razon", "api-gratis", "enrutador-gratis")],
    }));
    expect(r).toMatchObject({ aceptar: true });
    expect(("motivo" in r && r.motivo) ?? "").toContain("se queda en «palabra»");
  });

  it("con estado privado sube sin miedo si la capa siguiente corre en servidor propio", () => {
    const r = siguientePaso(entrada({
      privada: true, laya: null,
      plan: [paso("reflejo"), paso("razon", "servidor-propio", "bonsai-27b-propio")],
    }));
    expect(r).toEqual({ subirA: "razon", motivo: expect.stringContaining("servidor-propio") });
  });

  it("sin ninguna capa más alta en el plan acepta y lo dice", () => {
    const r = siguientePaso(entrada({ laya: null, plan: [paso("palabra")] }));
    expect(r).toMatchObject({ aceptar: true });
    expect("motivo" in r && r.motivo).toContain("no hay capa más alta");
  });
});
