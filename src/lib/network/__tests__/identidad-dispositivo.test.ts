// @vitest-environment jsdom
/**
 * identidad-dispositivo — Ola 366 (malla de neuronas).
 * Verifica: (1) las tres identidades se LEEN de sus claves históricas (nunca
 * las pisa ni las duplica), (2) si falta alguna se crea con el mismo formato,
 * (3) llamadas repetidas son estables (no regenera un id ya existente), y
 * (4) la etiqueta de faro solo lleva lo que exista.
 */
import { beforeEach, describe, expect, test } from "vitest";

const LS_SYNC = "starseed.device.id";
const LS_NEURON = "starseed.neuron.device-id";
const LS_MESH = "starseed.mesh.device-id.v1";

beforeEach(() => {
  localStorage.clear();
});

describe("identidadDispositivo", () => {
  test("lee las tres claves EXISTENTES sin tocarlas", async () => {
    localStorage.setItem(LS_SYNC, "sync-1");
    localStorage.setItem(LS_NEURON, "neuron-1");
    localStorage.setItem(LS_MESH, "mesh-1");
    const { identidadDispositivo } = await import("@/lib/network/identidad-dispositivo");
    const id = identidadDispositivo();
    expect(id).toEqual({ syncDeviceId: "sync-1", neuronDeviceId: "neuron-1", meshDeviceId: "mesh-1" });
    // Nada se sobrescribió.
    expect(localStorage.getItem(LS_SYNC)).toBe("sync-1");
    expect(localStorage.getItem(LS_NEURON)).toBe("neuron-1");
    expect(localStorage.getItem(LS_MESH)).toBe("mesh-1");
  });

  test("crea la que falte, con el MISMO formato de clave, y es estable entre llamadas", async () => {
    localStorage.setItem(LS_SYNC, "sync-2");
    // neuron y mesh faltan: deben crearse.
    const { identidadDispositivo } = await import("@/lib/network/identidad-dispositivo");
    const primera = identidadDispositivo();
    expect(primera.syncDeviceId).toBe("sync-2");
    expect(primera.neuronDeviceId).toBeTruthy();
    expect(primera.meshDeviceId).toBeTruthy();

    const segunda = identidadDispositivo();
    // Estable: la segunda llamada NO regenera nada.
    expect(segunda).toEqual(primera);
    expect(localStorage.getItem(LS_NEURON)).toBe(primera.neuronDeviceId);
    expect(localStorage.getItem(LS_MESH)).toBe(primera.meshDeviceId);
  });

  test("etiquetaFaroPropio solo lleva {nid,sid} presentes, nunca vacíos", async () => {
    localStorage.setItem(LS_SYNC, "sync-3");
    localStorage.setItem(LS_NEURON, "neuron-3");
    // mesh se genera solo, pero no forma parte de la etiqueta del faro.
    const { etiquetaFaroPropio } = await import("@/lib/network/identidad-dispositivo");
    const tag = etiquetaFaroPropio();
    expect(tag).toEqual({ nid: "neuron-3", sid: "sync-3" });
  });
});

/* ───────────── Adoptar la identidad de una neurona ya conocida (2026-09-29) ───────────── */
describe("adoptarNeurona", () => {
  const LS_ALIAS = "starseed.device.alias.v1";

  test("cambia SOLO el id de neurona; el de sync y el de malla quedan intactos (eco y TOFU)", async () => {
    localStorage.setItem(LS_SYNC, "sync-A");
    localStorage.setItem(LS_NEURON, "neurona-propia");
    localStorage.setItem(LS_MESH, "mesh-A");
    const { adoptarNeurona, identidadDispositivo } = await import("@/lib/network/identidad-dispositivo");
    const r = adoptarNeurona("neurona-de-la-cuenta-1");
    expect(r).toEqual({ ok: true, anterior: "neurona-propia", adoptada: "neurona-de-la-cuenta-1" });
    expect(identidadDispositivo()).toEqual({
      syncDeviceId: "sync-A",
      neuronDeviceId: "neurona-de-la-cuenta-1",
      meshDeviceId: "mesh-A",
    });
    expect(localStorage.getItem(LS_NEURON)).toBe("neurona-de-la-cuenta-1");
  });

  test("guarda el alias por origen (quién adoptó a quién y cuál era su id propio)", async () => {
    localStorage.setItem(LS_NEURON, "neurona-propia");
    const { adoptarNeurona, leerAliasDispositivo } = await import("@/lib/network/identidad-dispositivo");
    expect(leerAliasDispositivo().neurona).toBeNull();
    adoptarNeurona("neurona-de-la-cuenta-1", 1234);
    expect(leerAliasDispositivo().neurona).toEqual({ adoptada: "neurona-de-la-cuenta-1", propia: "neurona-propia", ts: 1234 });
  });

  test("es idempotente y conserva el id propio ORIGINAL si se readopta otra", async () => {
    localStorage.setItem(LS_NEURON, "neurona-propia");
    const { adoptarNeurona, leerAliasDispositivo } = await import("@/lib/network/identidad-dispositivo");
    adoptarNeurona("neurona-de-la-cuenta-1", 1);
    const otra = adoptarNeurona("neurona-de-la-cuenta-1", 2); // ya es la actual: no cambia nada
    expect(otra).toEqual({ ok: true, anterior: "neurona-de-la-cuenta-1", adoptada: "neurona-de-la-cuenta-1" });
    expect(leerAliasDispositivo().neurona?.ts).toBe(1);
    adoptarNeurona("neurona-de-la-cuenta-2", 3);
    expect(leerAliasDispositivo().neurona).toEqual({ adoptada: "neurona-de-la-cuenta-2", propia: "neurona-propia", ts: 3 });
  });

  test("un id inválido no toca nada", async () => {
    localStorage.setItem(LS_NEURON, "neurona-propia");
    const { adoptarNeurona, esIdNeuronaValido } = await import("@/lib/network/identidad-dispositivo");
    for (const malo of ["", "  ", "corto", "con espacios raros aquí", "<script>alert(1)</script>", "a".repeat(200), "../../etc", undefined as unknown as string]) {
      expect(adoptarNeurona(malo)).toMatchObject({ ok: false, motivo: "id-invalido" });
    }
    expect(localStorage.getItem(LS_NEURON)).toBe("neurona-propia");
    expect(localStorage.getItem(LS_ALIAS)).toBeNull();
    expect(esIdNeuronaValido("3f2b8c1e-6a4d-4f0e-9a51-0c2d7b9e1a44")).toBe(true);
    expect(esIdNeuronaValido("n-lk3j2h1-abcdefgh")).toBe(true);
  });

  test("un alias corrupto se lee como «sin adopción» y no lanza", async () => {
    localStorage.setItem(LS_ALIAS, "{no es json");
    const { leerAliasDispositivo } = await import("@/lib/network/identidad-dispositivo");
    expect(leerAliasDispositivo()).toEqual({ v: 1, neurona: null });
    localStorage.setItem(LS_ALIAS, JSON.stringify({ v: 1, neurona: { adoptada: "x", propia: 5, ts: "no" } }));
    expect(leerAliasDispositivo()).toEqual({ v: 1, neurona: null });
  });

  test("neuronDeviceIdActual devuelve el id vigente (y el adoptado tras adoptar)", async () => {
    localStorage.setItem(LS_NEURON, "neurona-propia");
    const { adoptarNeurona, neuronDeviceIdActual } = await import("@/lib/network/identidad-dispositivo");
    expect(neuronDeviceIdActual()).toBe("neurona-propia");
    adoptarNeurona("neurona-de-la-cuenta-1");
    expect(neuronDeviceIdActual()).toBe("neurona-de-la-cuenta-1");
  });
});
