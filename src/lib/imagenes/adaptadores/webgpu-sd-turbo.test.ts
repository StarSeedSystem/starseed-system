/**
 * Pruebas del contrato de SD-Turbo en la pestaña (IMG1011H): todo puro, con un motor simulado.
 * Rescatadas de la rama nube/39371414803 y adaptadas a la API de hoy (`generaEnPestana`).
 */
import { describe, expect, it } from "vitest";
import {
  generaEnPestana, type ImagenSDTurbo, type MotorSDTurbo, type PeticionSDTurbo,
} from "./webgpu-sd-turbo";

const IMAGEN: ImagenSDTurbo = { ancho: 512, alto: 512, pixeles: new Uint8Array(4), motor: "sd-turbo" };
const PETICION: PeticionSDTurbo = { prompt: "un faro en la niebla", semilla: 7, permisoDescarga: true };

function motorSimulado(cambios: Partial<MotorSDTurbo> = {}): MotorSDTurbo {
  return {
    sondear: async () => ({ hayWebGPU: true, hayAdaptador: true, f16: true }),
    hayPesosEnCache: async () => true,
    cuotaLibre: async () => 8 * 1024 ** 3,
    descargarPesos: async () => undefined,
    generar: async () => IMAGEN,
    ...cambios,
  };
}

describe("contrato del generador de la pestaña", () => {
  it("exporta una función", () => {
    expect(typeof generaEnPestana).toBe("function");
  });

  it("devuelve una promesa al llamarla", () => {
    const resultado = generaEnPestana(motorSimulado(), PETICION);
    expect(resultado).toBeInstanceOf(Promise);
    return expect(resultado).resolves.toMatchObject({ ok: true, accion: "listo" });
  });
});
