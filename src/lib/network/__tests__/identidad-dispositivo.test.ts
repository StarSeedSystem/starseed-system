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
