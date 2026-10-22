/**
 * Rescate IMG1011H · contrato público de la capa «navegador» de SD-Turbo.
 * Main ya no usa una fábrica: el flujo es `generaEnPestana(motor, petición)`.
 * Pruebas puras con un motor simulado: sin red, sin GPU y sin disco.
 */
import { describe, expect, it } from "vitest";
import { generaEnPestana, type MotorSDTurbo, type PeticionSDTurbo } from "./webgpu-sd-turbo";

const peticion: PeticionSDTurbo = { prompt: "una semilla", semilla: 7, permisoDescarga: false };

const motorSimulado: MotorSDTurbo = {
  sondear: async () => ({ hayWebGPU: true, hayAdaptador: true, f16: true }),
  hayPesosEnCache: async () => true,
  cuotaLibre: async () => null,
  descargarPesos: async () => {},
  generar: async () => ({ ancho: 512, alto: 512, pixeles: new Uint8Array(0), motor: "simulado" }),
};

describe("generaEnPestana (contrato actual de la capa navegador)", () => {
  it("se exporta como función", () => {
    expect(typeof generaEnPestana).toBe("function");
  });

  it("devuelve una promesa y completa el flujo con el motor inyectado", async () => {
    const pendiente = generaEnPestana(motorSimulado, peticion);
    expect(pendiente).toBeInstanceOf(Promise);
    const resultado = await pendiente;
    expect(resultado.ok).toBe(true);
    expect(resultado.accion).toBe("listo");
    expect(resultado.imagen?.motor).toBe("simulado");
  });
});
