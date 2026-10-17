import { describe, it, expect } from "vitest";
import { planParaGenerar } from "../use-generar-3d";

describe("planParaGenerar", () => {
  it("devuelve null sin hierro", () => {
    const plan = planParaGenerar({ destino: "avatar", partida: "imagen" }, null);
    expect(plan).toBeNull();
  });

  it("planifica avatar con GPU apple", () => {
    const hierro = { gpu: "apple" as const, ramGB: 32, vramGB: null, blender: true, permiteEspacioHf: false, claveExterna: false };
    const plan = planParaGenerar({ destino: "avatar", partida: "imagen", comercial: false }, hierro);
    expect(plan).not.toBeNull();
    expect(plan?.pasos.length).toBe(5);
    const generar = plan?.pasos.find(p => p.etapa === "generar");
    expect(generar?.motor?.id).toBe("trellis2");
  });

  it("permite espacio HF cuando está habilitado", () => {
    const hierro = { gpu: "ninguna" as const, ramGB: 0, vramGB: null, blender: false, permiteEspacioHf: true, claveExterna: false };
    const plan = planParaGenerar({ destino: "bot", partida: "imagen" }, hierro);
    expect(plan).not.toBeNull();
    const generar = plan?.pasos.find(p => p.etapa === "generar");
    expect(generar?.motor?.remoto).toBe(true);
  });
});
