// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENTO_PERMISO,
  consultarPermiso,
  pedirPermiso,
} from "../request-permission";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consultarPermiso (estado sin pedir nada)", () => {
  it.each([
    ["default", "preguntar"],
    ["denied", "denegado"],
    ["granted", "concedido"],
  ] as const)("con %s → %s", async (bruto, esperado) => {
    vi.stubGlobal("Notification", { permission: bruto });
    await expect(consultarPermiso("notificaciones")).resolves.toBe(esperado);
  });
});

describe("pedirPermiso (pide de verdad y emite starseed:permiso)", () => {
  it("notificaciones: requestPermission «denied» → denegado y evento en window", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: () => Promise.resolve("denied") });
    const vistos: Array<{ permiso: string; concedido: boolean; soportado: boolean; motivo?: string }> = [];
    window.addEventListener(EVENTO_PERMISO, (e) => {
      vistos.push((e as CustomEvent<{ permiso: string; concedido: boolean; soportado: boolean; motivo?: string }>).detail);
    });
    const r = await pedirPermiso("notificaciones");
    expect(r).toEqual({ id: "notificaciones", estado: "denegado", motivo: "denied" });
    expect(vistos).toEqual([{ permiso: "notificaciones", concedido: false, soportado: true, motivo: "denied" }]);
  });

<<<<<<< HEAD
it("microfono: getUserMedia rechaza con NotAllowedError (Firefox) → denegado", async () => {
      const fallo = new Error("The request is not allowed by the user agent or the platform in the current context.");
      fallo.name = "NotAllowedError";
      vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.reject(fallo) } });
      await expect(pedirPermiso("microfono")).resolves.toMatchObject({
        id: "microfono",
        estado: "denegado",
        motivo: "NotAllowedError",
      });
    });
=======
  it("microfono: getUserMedia rechaza con NotAllowedError (Firefox) → denegado", async () => {
    const fallo = new Error("The request is not allowed by the user agent or the platform in the current context.");
    fallo.name = "NotAllowedError";
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => Promise.reject(fallo) } });
    await expect(pedirPermiso("microfono")).resolves.toMatchObject({
      id: "microfono",
      estado: "denegado",
      motivo: "NotAllowedError",
    });
  });
>>>>>>> ae523cba44 (salvavidas · PRM1108B: trabajo del agente antes de las puertas (tsc / vitest))

  it("microfono: sin mediaDevices → no-disponible (pedir y consultar)", async () => {
    vi.stubGlobal("navigator", {});
    await expect(pedirPermiso("microfono")).resolves.toMatchObject({ id: "microfono", estado: "no-disponible" });
    await expect(consultarPermiso("microfono")).resolves.toBe("no-disponible");
  });
});
