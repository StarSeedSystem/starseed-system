/**
 * Taller 3D · pruebas del servicio de reparto (G3D1011D). PURO: sin red, sin disco, sin GPU.
 */
import { describe, expect, it } from "vitest";
import { repartirEncargo } from "../taller";
import type { EncargoTaller, NeuronaTaller } from "../adaptadores/reparto-taller";
import type { Hierro } from "../adn/optimizacion";

const NVIDIA16: Hierro = { gpu: "nvidia", ramGB: 64, vramGB: 16, blender: true, permiteEspacioHf: false, claveExterna: false };
const ENCARGO: EncargoTaller = {
  destino: "avatar", partida: "imagen", esqueleto: "soma30", region: "US", comercial: false, cuenta: "alex",
};
const GPU: NeuronaTaller = { id: "gpu-propia", cuenta: "alex", ofrecidaPor: [], hierro: NVIDIA16, carga: 0, viva: true };

describe("repartirEncargo", () => {
  it("devuelve la elección con la orden formada y avisa de que el canal aún no la admite", () => {
    const r = repartirEncargo(ENCARGO, [GPU]);
    expect(r.eleccion.neurona?.id).toBe("gpu-propia");
    expect(r.orden).toMatchObject({ bus: "mg_orden", accion: "taller_3d", para: "gpu-propia" });
    expect(r.envio).toContain("no admite");
  });

  it("si ninguna neurona puede, no hay orden y el motivo lo explica", () => {
    const r = repartirEncargo(ENCARGO, []);
    expect(r.eleccion.neurona).toBeNull();
    expect(r.orden).toBeNull();
    expect(r.eleccion.motivo).toContain("ninguna neurona viva");
  });
});
