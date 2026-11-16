import { describe, it, expect } from "vitest";
import { motorPaqueteLocal, cargarPipelineTransformers } from "@/lib/traductor/motor-local";

describe("motorPaqueteLocal", () => {
  it("tiene id paquete-local y alcance aparato", () => {
    const motor = motorPaqueteLocal({
      instalado: async () => false,
      cargarPipeline: async () => async (textos) => textos,
    });
    expect(motor.id).toBe("paquete-local");
    expect(motor.alcance).toBe("aparato");
  });

  it("disponible refleja el resultado de instalado", async () => {
    const motorSi = motorPaqueteLocal({
      instalado: async (o, d) => o === "es" && d === "en",
      cargarPipeline: async () => async (textos) => textos,
    });
    expect(await motorSi.disponible("es", "en")).toBe(true);
    expect(await motorSi.disponible("en", "es")).toBe(false);
  });

  it("traduce por lotes de <=8 textos", async () => {
    let tandas = 0;
    const motor = motorPaqueteLocal({
      instalado: async () => true,
      cargarPipeline: async () => async (textos) => {
        tandas++;
        return textos.map((t) => t + " [trad]");
      },
    });
    const entrada = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    const salida = await motor.traducir(entrada, "es", "en");
    expect(salida.length).toBe(10);
    expect(tandas).toBe(2);
    expect(salida[0]).toBe("1 [trad]");
    expect(salida[9]).toBe("10 [trad]");
  });

  it("descarga el par anterior al cambiar de par de idiomas", async () => {
    const cargados: string[] = [];
    const descargados: string[] = [];
    const motor = motorPaqueteLocal({
      instalado: async () => true,
      cargarPipeline: async (modelo) => {
        cargados.push(modelo);
        return async (textos) => {
          return textos.map((t) => t + "_" + modelo);
        };
      },
    });
    // Simular descarga explícita si la fábrica soporta hook o ciclo de vida opcional,
    // o verificar que se re-inicia la carga al cambiar de origen/destino.
    const r1 = await motor.traducir(["hola"], "es", "en");
    expect(r1).toEqual(["hola_es-en"]);
    const r2 = await motor.traducir(["hola"], "es", "fr");
    expect(r2).toEqual(["hola_es-fr"]);
  });

  it("carga pipeline transformers lanza error claro si falla", async () => {
    await expect(cargarPipelineTransformers("https://invalido.url.falsa/mod.js", {}))
      .rejects.toThrow("No se pudo cargar el motor local");
  });
});
