import { describe, expect, it } from "vitest";
import { ControlNivelVoz, NIVELES_OPUS, nivelEfectivo, FormatoVoz, nivelInicial } from "../niveles";
import type { ModeloEnlace } from "../video-datos/reparto";

describe("ControlNivelVoz: cuando se pierde el Wi-Fi (sin modelo), sale inmediatamente del estado bajo el suelo", () => {
  it("salen del estado bajo el suelo si no hay modelo (Wi-Fi cortado) incluso si no están limpios", () => {
    const escalera = NIVELES_OPUS;
    const ahora = 0;
    const ctrl = new ControlNivelVoz(escalera, "b1" as FormatoVoz, ahora, 0, "ll-1");
    const ultimo = escalera.length - 1;
    
    ctrl.i = ultimo;
    ctrl.suelo = true;
    ctrl.limpioSeguido = 0;
    ctrl.atascoSeguido = 0;
    ctrl.ultimoCambio = ahora;
    
    expect(ctrl.bajoSuelo).toBe(true);
    
    const entradaSinModelo: any = {
      modelo: null,
      retrasoMaxMs: 100,
      descartes: 0,
      entregadoKbps: undefined,
      informe: null,
    };
    
    const cambio = ctrl.paso(ahora + 1000, entradaSinModelo);
    
    expect(ctrl.bajoSuelo).toBe(false);
    expect(ctrl.limpioSeguido).toBe(0);
  });
});

export {};