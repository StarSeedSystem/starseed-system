// Pruebas rescatadas de la rama nube/39371414803 (IMG1011H-d1), adaptadas al contrato actual:
// el adaptador ya no expone una fábrica de generadores, sino el flujo puro `generaEnPestana`,
// que recibe un motor y devuelve una promesa. Los casos originales solo comprobaban la forma
// de la fábrica eliminada y uno era un marcador (`expect(true)`); aquí se prueba el flujo.
import { describe, it, expect } from "vitest";
import {
  generaEnPestana,
  type MotorSDTurbo,
  type PeticionSDTurbo,
  type SondasWebGPU,
} from "./webgpu-sd-turbo";

const SIN_WEBGPU: SondasWebGPU = { hayWebGPU: false, hayAdaptador: false, f16: false };

function motorFalso(sondas: SondasWebGPU) {
  const efectos = { descargas: 0, generadas: 0 };
  const motor: MotorSDTurbo = {
    sondear: async () => sondas,
    hayPesosEnCache: async () => false,
    cuotaLibre: async () => null,
    descargarPesos: async () => {
      efectos.descargas += 1;
    },
    generar: async (peticion) => {
      efectos.generadas += 1;
      return { ancho: 512, alto: 512, pixeles: new Uint8Array(0), motor: peticion.prompt };
    },
  };
  return { motor, efectos };
}

const PETICION: PeticionSDTurbo = {
  prompt: "un faro al amanecer",
  semilla: 7,
  permisoDescarga: false,
};

describe("webgpu-sd-turbo · flujo de la pestaña", () => {
  it("exporta el flujo como función y llamarlo devuelve una promesa", async () => {
    expect(typeof generaEnPestana).toBe("function");
    const { motor } = motorFalso(SIN_WEBGPU);
    const promesa = generaEnPestana(motor, PETICION);
    expect(promesa).toBeInstanceOf(Promise);
    await promesa;
  });

  it("sin WebGPU resuelve sin generar ni descargar pesos", async () => {
    const { motor, efectos } = motorFalso(SIN_WEBGPU);
    const resultado = await generaEnPestana(motor, PETICION);
    expect(resultado.ok).toBe(false);
    expect(resultado.accion).toBe("sin-webgpu");
    expect(resultado.imagen).toBeUndefined();
    expect(efectos).toEqual({ descargas: 0, generadas: 0 });
  });
});
