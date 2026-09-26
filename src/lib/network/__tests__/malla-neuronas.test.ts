/**
 * malla-neuronas — funciones puras (Ola 366). Sin DOM ni red: decisión de
 * auto-vínculo, clasificación de RAM, detección de origen local y el guard
 * del mensaje de "ficha".
 */
import { describe, expect, test } from "vitest";
import {
  claseRam,
  decidirAutovinculo,
  esMensajeFicha,
  esOrigenLocal,
  type NeuronaParaMalla,
  type PeerEstadoLite,
} from "@/lib/network/malla-neuronas";

describe("decidirAutovinculo", () => {
  const yo: NeuronaParaMalla = { neuronId: "n-yo", syncDeviceId: "s-yo", online: true, isThisDevice: true };

  test("con SOLO este dispositivo online, no hay nadie con quien vincularse", () => {
    expect(decidirAutovinculo([yo], {})).toEqual([]);
  });

  test("con ≥2 online, propone conectar a las demás (nunca a mí mismo)", () => {
    const otra: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, otra], {})).toEqual(["s-b"]);
  });

  test("salta una neurona OFFLINE (estale) aunque exista", () => {
    const offline: NeuronaParaMalla = { neuronId: "n-c", syncDeviceId: "s-c", online: false, isThisDevice: false };
    expect(decidirAutovinculo([yo, offline], {})).toEqual([]);
  });

  test("salta una neurona sin syncDeviceId publicado todavía", () => {
    const sinSync: NeuronaParaMalla = { neuronId: "n-d", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, sinSync], {})).toEqual([]);
  });

  test("deduplica por syncDeviceId", () => {
    const dup1: NeuronaParaMalla = { neuronId: "n-e1", syncDeviceId: "s-e", online: true, isThisDevice: false };
    const dup2: NeuronaParaMalla = { neuronId: "n-e2", syncDeviceId: "s-e", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, dup1, dup2], {})).toEqual(["s-e"]);
  });

  test("se SALTA un peer ya conectado o conectando (no relanza la oferta)", () => {
    const b: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    const c: NeuronaParaMalla = { neuronId: "n-c", syncDeviceId: "s-c", online: true, isThisDevice: false };
    const peers: Record<string, PeerEstadoLite> = {
      "s-b": { state: "connected" },
      "s-c": { state: "connecting" },
    };
    expect(decidirAutovinculo([yo, b, c], peers)).toEqual([]);
  });

  test("SÍ reintenta un peer 'failed' o 'closed'", () => {
    const b: NeuronaParaMalla = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculo([yo, b], { "s-b": { state: "failed" } })).toEqual(["s-b"]);
    expect(decidirAutovinculo([yo, b], { "s-b": { state: "closed" } })).toEqual(["s-b"]);
  });
});

describe("claseRam", () => {
  test.each([
    [undefined, "desconocida"],
    [0, "desconocida"],
    [-1, "desconocida"],
    [2, "≤4 GB"],
    [4, "≤4 GB"],
    [8, "8 GB"],
    [16, "16 GB"],
    [32, ">16 GB"],
  ] as const)("claseRam(%s) === %s", (mem, esperado) => {
    expect(claseRam(mem)).toBe(esperado);
  });
});

describe("esOrigenLocal", () => {
  test.each([
    ["localhost", true],
    ["127.0.0.1", true],
    ["::1", true],
    ["starseed-os.vercel.app", false],
    ["192.168.1.5", false],
  ] as const)("esOrigenLocal(%s) === %s", (host, esperado) => {
    expect(esOrigenLocal(host)).toBe(esperado);
  });
});

describe("esMensajeFicha", () => {
  test("acepta una ficha bien formada", () => {
    expect(
      esMensajeFicha({
        t: "malla:ficha",
        ficha: { syncDeviceId: "s-1", neuronDeviceId: "n-1" },
      }),
    ).toBe(true);
  });

  test("rechaza payloads ajenos o corruptos", () => {
    expect(esMensajeFicha(null)).toBe(false);
    expect(esMensajeFicha("texto")).toBe(false);
    expect(esMensajeFicha({ t: "malla:hb", at: 1 })).toBe(false);
    expect(esMensajeFicha({ t: "malla:ficha", ficha: { syncDeviceId: "s-1" } })).toBe(false);
  });
});
