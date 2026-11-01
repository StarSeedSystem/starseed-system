/**
 * IMG1011J · la tarjeta del resultado de la ventana de la Protomolécula:
 * `procedenciaDeImagen` y `opcionesImagenesDeDetalle` (puras) cuentan de dónde salió cada
 * imagen y la convierten en opción de la tarjeta con su prompt, URL y procedencia legible.
 */
import { describe, expect, it } from "vitest";
import type { DetallePaso } from "@/lib/protomolecula/peticion";
import { opcionesImagenesDeDetalle, procedenciaDeImagen } from "../use-peticion";

const paso = (extra: Partial<DetallePaso>): DetallePaso => ({
  paso: 1,
  operacion: { tipo: "generar-imagen", descripcion: "atardecer en vertical" },
  estado: "hecho",
  texto: "Generé la imagen con Pollinations.ai.",
  imagenUrl: "https://img.ejemplo/atardecer.png",
  ...extra,
});

describe("procedenciaDeImagen", () => {
  it("lee el generador que el texto del paso ya dice, con su capa real", () => {
    expect(procedenciaDeImagen("Generé la imagen con Pollinations.ai.")).toEqual({ capa: "web-gratis", motor: "pollinations" });
    expect(procedenciaDeImagen("Generé la imagen con Tus neuronas (local).")).toEqual({ capa: "neurona", motor: "sdcpp" });
    expect(procedenciaDeImagen("Space público de FLUX.1 en Hugging Face.")).toEqual({ capa: "espacio", motor: "espacio-hf" });
  });
  it("sin generador reconocido no inventa una capa de la web", () => {
    const p = procedenciaDeImagen("Generé la imagen.");
    expect(p.capa).toBe("dispositivo");
  });
});

describe("opcionesImagenesDeDetalle", () => {
  it("convierte solo los pasos hechos con imagen en opciones con URL, prompt y motivo", () => {
    const opciones = opcionesImagenesDeDetalle([
      paso({}),
      paso({ estado: "fallo", imagenUrl: undefined, texto: "fallo: sin red." }),
      paso({ paso: 2, imagenUrl: "  ", texto: "sin archivo" }),
      paso({
        paso: 3, imagenUrl: "https://img.ejemplo/otra.png",
        texto: "Generé la imagen con Tus neuronas (local).",
        operacion: { tipo: "fondo", descripcion: "cambiar el fondo" },
      }),
    ]);
    expect(opciones.length).toBe(2);
    expect(opciones[0]).toMatchObject({
      capa: "web-gratis", motor: "pollinations", modelo: null, cuantizacion: "nativa",
      semilla: 1, url: "https://img.ejemplo/atardecer.png", prompt: "atardecer en vertical", motivo: "Generé la imagen con Pollinations.ai.",
    });
    expect(opciones[1]).toMatchObject({ capa: "neurona", semilla: 3, url: "https://img.ejemplo/otra.png" });
    expect(opciones[1].prompt).toBeUndefined();
  });
  it("sin detalle no devuelve nada y no inventa opciones", () => {
    expect(opcionesImagenesDeDetalle([])).toEqual([]);
  });
});
