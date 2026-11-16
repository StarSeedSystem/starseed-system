/**
 * Lectura de la voz de Aurora SIN catch silencioso (IMG · auroraTranscript).
 * QUÉ: antes, `auroraTranscript()` se tragaba cualquier fallo del puente y
 * devolvía "": un motor caído era indistinguible de «Aurora aún no ha hablado».
 * CÓMO: la lectura se CLASIFICA (ok · sin-puente · fallo) y de ahí sale un
 * aviso honesto que manda a seguir con los botones (nadie se queda en bucle).
 */
import { describe, expect, it } from "vitest";
import {
  componerTranscript,
  leerEstadoVoz,
  textoAvisoVoz,
} from "../aurora-guide-voice";

describe("componerTranscript", () => {
  it("junta lo dicho y lo provisional sin espacios de sobra", () => {
    expect(componerTranscript("siguiente", "")).toBe("siguiente");
    expect(componerTranscript("siguiente", "por favor")).toBe("siguiente por favor");
    expect(componerTranscript("  hola  ", "  mundo ")).toBe("hola mundo");
  });

  it("sin texto devuelve cadena vacía (nunca «undefined»)", () => {
    expect(componerTranscript(undefined, undefined)).toBe("");
    expect(componerTranscript("   ", "")).toBe("");
  });
});

describe("leerEstadoVoz", () => {
  it("una lectura con estado es OK y trae el texto oído", () => {
    const lectura = leerEstadoVoz({
      getState: () => ({ transcript: "siguiente", interim: "por favor", listening: true }),
    });
    expect(lectura).toMatchObject({ estado: "ok", texto: "siguiente por favor", escuchando: true });
    expect(lectura.motivo).toBeUndefined();
    expect(textoAvisoVoz(lectura)).toBeNull();
  });

  it("sin puente no es un fallo, pero tampoco hay voz", () => {
    const lectura = leerEstadoVoz(null);
    expect(lectura.estado).toBe("sin-puente");
    expect(lectura.texto).toBe("");
    expect(lectura.escuchando).toBe(false);
    expect(textoAvisoVoz(lectura)).toContain("texto");
  });

  it("un puente sin lector o sin estado aún no es un fallo", () => {
    expect(leerEstadoVoz({}).estado).toBe("ok");
    expect(leerEstadoVoz({ getState: () => null }).estado).toBe("ok");
    expect(leerEstadoVoz({ getState: () => undefined }).estado).toBe("ok");
  });

  it("si el motor revienta, la lectura lo DICE (deja de ser mudo)", () => {
    const lectura = leerEstadoVoz({
      getState: () => {
        throw new Error("el motor de voz está caído");
      },
    });
    expect(lectura.estado).toBe("fallo");
    expect(lectura.texto).toBe("");
    expect(lectura.escuchando).toBe(false);
    expect(lectura.motivo).toContain("el motor de voz está caído");
  });

  it("un fallo raro (sin Error ni texto) conserva un motivo legible", () => {
    const lectura = leerEstadoVoz({
      getState: () => {
        throw { codigo: 42 };
      },
    });
    expect(lectura.estado).toBe("fallo");
    expect(lectura.motivo).toBeTruthy();
  });

  it("el aviso de fallo manda a los botones: la guía sigue en texto", () => {
    const aviso = textoAvisoVoz(
      leerEstadoVoz({
        getState: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(aviso).toContain("sigue en texto");
    expect(aviso).toContain("botones");
  });
});
