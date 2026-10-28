import { describe, it, expect } from "vitest";
import { registrarMedida, ordenarPorMedidas, type AlmacenMedidas } from "../medidas";
import { planificar, type EntradaPlanificador } from "../planificador";

describe("medidas", () => {
  it("guarda las últimas 20 y media móvil", () => {
    let a: AlmacenMedidas = {};
    for (let i = 0; i < 25; i++) {
      a = registrarMedida(a, {
        neurona: "n1",
        modelo: "m1",
        capa: "palabra",
        latenciaMs: i,
      });
    }
    expect(a["n1"]["m1"].historial.length).toBe(20);
    expect(a["n1"]["m1"].historial[0].latenciaMs).toBe(5);
  });
});

describe("ordenarPorMedidas", () => {
  it("más rápido y más acertado primero; sin medida mantiene orden", () => {
    let m = {};
    m = registrarMedida(m, { neurona: "n1", modelo: "b", capa: "palabra", latenciaMs: 500, acierto: 0.8 });
    m = registrarMedida(m, { neurona: "n1", modelo: "a", capa: "palabra", latenciaMs: 100, acierto: 0.9 });
    const res = ordenarPorMedidas([{ modelo: "b" }, { modelo: "a" }, { modelo: "c" }], m, "n1");
    expect(res.map((x) => x.modelo)).toEqual(["a", "b", "c"]);
  });
});

describe("planificador con medidas", () => {
  const base: EntradaPlanificador = {
    tarea: "chat",
    dificultad: 0.3,
    privacidad: "privada",
    segundoPlano: false,
    perfil: { medio: "nativo", conexion: "rapida", ramMb: 4096 },
    presupuesto: { discoMb: 5000, ramMb: 4096 },
    instaladas: [
      { id: "ternary-bonsai-1.7b", capa: "palabra", sha256: "a".repeat(64), ramMinMb: 512 },
      { id: "ternary-bonsai-4b", capa: "palabra", sha256: "b".repeat(64), ramMinMb: 1024 },
    ],
    nodos: [],
    preferencias: { activo: true, capas: { local: true, mesh: true, nube: true, colectiva: true }, nivelador: 0, especifico: null },
  };

  it("ordena por medidas cuando las recibe", () => {
    let m = {};
    m = registrarMedida(m, { neurona: "n1", modelo: "ternary-bonsai-1.7b", capa: "palabra", latenciaMs: 800, acierto: 0.7 });
    m = registrarMedida(m, { neurona: "n1", modelo: "ternary-bonsai-4b", capa: "palabra", latenciaMs: 200, acierto: 0.9 });
    const p = planificar({ ...base, medidas: m, neurona: "n1" });
    expect(p.modelo).toBe("ternary-bonsai-4b");
  });

  it("sin medidas, salida idéntica a hoy", () => {
    const p = planificar(base);
    expect(p.capa).toBe("palabra");
    expect(p.modelo).toBe("ternary-bonsai-4b");
  });
});
