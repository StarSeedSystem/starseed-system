import { describe, expect, it } from "vitest";
import { ControlNivelVoz, NIVELES_OPUS, nivelEfectivo, FormatoVoz, nivelInicial } from "../niveles";
import type { ModeloEnlace } from "../../video-datos/reparto";

describe("ControlNivelVoz: cuando se pierde el Wi-Fi (sin modelo), sale inmediatamente del estado bajo el suelo", () => {
  it("salen del estado bajo el suelo si no hay modelo (Wi-Fi cortado) incluso si no están limpios", () => {
    const escalera = NIVELES_OPUS;
    const ahora = 0;
    const ctrl = new ControlNivelVoz(escalera, "b1" as FormatoVoz, ahora, escalera.length - 1, "ll-1");
    
    expect(ctrl.bajoSuelo).toBe(false);
    
    const entradaSinModelo: any = {
      modelo: null,
      retrasoMaxMs: 100,
      descartes: 0,
      entregadoKbps: undefined,
      informe: null,
    };
    
    const cambio = ctrl.paso(ahora + 1000, entradaSinModelo);
    
    expect(ctrl.bajoSuelo).toBe(false);
  });
});

export {};