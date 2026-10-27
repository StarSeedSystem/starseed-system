import { describe, it, expect, vi } from "vitest";
import {
  elegirMotorPorLatencia,
  sintetizarConversacionFluida,
} from "@/lib/aurora/tts-oss/conversacion-fluida";

describe("conversacion-fluida — selección por latencia y síntesis por trozos", () => {
  it("elige el motor con menor latencia medida en la neurona", () => {
    const medidas = [
      { motor: "chatterbox", tipo: "primer-sonido", valor: 1200, neurona: "n1" },
      { motor: "omnivoice", tipo: "primer-sonido", valor: 400, neurona: "n1" },
      { motor: "voice158", tipo: "primer-sonido", valor: 700, neurona: "n1" },
    ];
    const elegido = elegirMotorPorLatencia(["chatterbox", "omnivoice", "voice158"], medidas, "n1");
    expect(elegido).toBe("omnivoice");
  });

  it("sintetiza el texto por trozos respetando el presupuesto de latencia", async () => {
    const sintetizador = vi.fn(async () => true);
    const resultado = await sintetizarConversacionFluida(
      "Hola humano. Esta es una prueba de conversación fluida y natural.",
      ["omnivoice"],
      sintetizador,
      { presupuestoMs: 800 }
    );
    expect(resultado.trozosEmitidos).toBeGreaterThan(0);
    expect(resultado.tiempoPrimerSonidoMs).toBeGreaterThan(0);
    expect(resultado.motorElegido).toBe("omnivoice");
    expect(sintetizador).toHaveBeenCalled();
  });
});
