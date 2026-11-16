// Pruebas de registro de decisión de Laya (LYS1018A).
import { describe, it, expect } from "vitest";
import { casoDeDecision, registrar } from "../registro-decision";
import type { CasoLaya } from "../aprendizaje-laya";
import type { RegistroAprendizaje } from "../aprendizaje-laya";

const routeResponseAccepted = {
  ok: true,
  plan: { accion: "ejecutar", capa: "needle", motivo: "Needle 3 ejecución directa" },
  capas: {
    needle: { ms: 150, confianza: 0.83, ok: true },
    laya: null,
    jev: null,
  },
  bloqueHabilidad: "",
};

const routeResponseScaled = {
  ok: true,
  plan: { accion: "escalar_jev", capa: "jev", motivo: "Jev requiere confirmación" },
  capas: {
    needle: { ms: 100, confianza: 0.7, ok: true },
    laya: null,
    jev: { ms: 200, probabilidad: 0.85, ok: true },
  },
  bloqueHabilidad: "",
};

const routeResponseUnknownPoint = {
  ok: true,
  plan: { accion: "ejecutar", capa: "desconocido", motivo: "..." },
  capas: {
    needle: { ms: 100, confianza: 0.8, ok: true },
    laya: null,
    jev: null,
  },
  bloqueHabilidad: "",
};

describe("casoDeDecision", () => {
  it("convierte respuesta aceptada a CasoLaya", () => {
    const result = casoDeDecision(routeResponseAccepted);
    expect(result).not.toBeNull();
    expect(result?.resultado).toBe("aceptada");
    expect(result?.punto).toBe("reflejo.herramienta");
    expect(typeof result?.privado).toBe("boolean");
  });

  it("marca escalado como resultado escalada", () => {
    const result = casoDeDecision(routeResponseScaled);
    expect(result).not.toBeNull();
    expect(result?.resultado).toBe("escalada");
  });

  it("devuelve null para punto desconocido", () => {
    const result = casoDeDecision(routeResponseUnknownPoint);
    expect(result).toBeNull();
  });
});

describe("registrar", () => {
  it("punto privado guarda huella", () => {
    const registroInicial: RegistroAprendizaje = [];
    const result = registrar(registroInicial, routeResponseAccepted);
    expect(result.length).toBe(1);
    expect(result[0].privado).toBe(true);
    expect(result[0].estado).toMatch(/^h[0-9a-f]{8}$/);
  });

  it("añade caso al registro cuando la decisión es aceptada", () => {
    const registroInicial: RegistroAprendizaje = [];
    const result = registrar(registroInicial, routeResponseAccepted);
    expect(result.length).toBe(1);
    expect(result[0].punto).toBe("reflejo.herramienta");
    expect(result[0].resultado).toBe("aceptada");
  });

  it("no modifica el registro cuando el punto es desconocido", () => {
    const registroInicial: RegistroAprendizaje = [{ punto: "otro.punto", ambito: "a1", p: 0.5, donde: "a1", ms: 0, resultado: "aceptada", estado: "test", privado: false }];
    const result = registrar(registroInicial, routeResponseUnknownPoint);
    expect(result).toBe(registroInicial);
  });
});