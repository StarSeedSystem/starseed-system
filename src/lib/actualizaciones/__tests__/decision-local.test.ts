import { describe, expect, it } from "vitest";
import { decidirCapaLocal } from "../decision-local";

describe("decisión local: exigeAprobacion conectado al tipo", () => {
  it("un grupo democrático sin aprobación espera aunque su capa sea manual", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "grupo-democratico" });
    expect(r.decision).toBe("esperar");
    expect(r.texto).toMatch(/votación/i);
  });

  it("un grupo democrático con aprobación=false tampoco aplica", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "grupo-democratico", aprobada: false });
    expect(r.decision).toBe("esperar");
    expect(r.texto).toMatch(/votación/i);
  });

  it("un grupo democrático ya aprobado vuelve a su política normal (manual → avisar)", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "grupo-democratico", aprobada: true });
    expect(r.decision).toBe("avisar");
    expect(r.texto).not.toMatch(/votación/i);
  });

  it("una comunidad también exige aprobación previa", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "comunidad" });
    expect(r.decision).toBe("esperar");
    expect(r.texto).toMatch(/votación/i);
  });

  it("un perfil privado no exige aprobación: su capa manual solo avisa", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "perfil-privado" });
    expect(r.decision).toBe("avisar");
    expect(r.texto).not.toMatch(/votación/i);
  });

  it("un grupo jerárquico tampoco exige aprobación previa", async () => {
    const r = await decidirCapaLocal("servicios", { tipo: "grupo-jerarquico" });
    expect(r.decision).toBe("avisar");
  });

  it("el OS sigue su política sin aprobación: servicios avisa", async () => {
    const r = await decidirCapaLocal("servicios");
    expect(r.decision).toBe("avisar");
  });
});
