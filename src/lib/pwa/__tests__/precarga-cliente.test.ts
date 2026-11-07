import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

import {
  CACHE_API_SW,
  enviarAlSW,
  estadoDeMensaje,
  olvidarSesionSinConexion,
  pedirAlmacenPersistente,
  pedirPrecarga,
} from "@/lib/pwa/precarga-cliente";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = createRequire(import.meta.url)("../../../../public/sw-logica.js");

describe("precarga-cliente", () => {
  it("el nombre de la caché de API es el del SW", () => {
    expect(CACHE_API_SW).toBe(L.CACHE_API);
  });

  it("manda al SW que controla; si aún no controla, al activo cuando esté listo; sin SW, false", async () => {
    const controlador = { postMessage: vi.fn() };
    expect(pedirPrecarga(true, { serviceWorker: { controller: controlador } })).toBe(true);
    expect(controlador.postMessage).toHaveBeenCalledWith({ tipo: "PRECARGAR", forzar: true });

    const activo = { postMessage: vi.fn() };
    expect(enviarAlSW({ tipo: "X" }, { serviceWorker: { controller: null, ready: Promise.resolve({ active: activo }) } })).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(activo.postMessage).toHaveBeenCalledWith({ tipo: "X" });

    expect(enviarAlSW({ tipo: "X" }, {})).toBe(false);
    expect(enviarAlSW({ tipo: "X" }, { serviceWorker: { controller: { postMessage: () => { throw new Error("cerrado"); } } } })).toBe(false);
  });

  it("al cerrar sesión avisa al SW y borra la caché de API aunque no haya SW", async () => {
    const borrar = vi.fn(async () => true);
    const controlador = { postMessage: vi.fn() };
    await olvidarSesionSinConexion({ serviceWorker: { controller: controlador } }, { delete: borrar });
    expect(controlador.postMessage).toHaveBeenCalledWith({ tipo: "OLVIDAR_SESION" });
    expect(borrar).toHaveBeenCalledWith(CACHE_API_SW);
    await expect(olvidarSesionSinConexion({}, { delete: async () => { throw new Error("x"); } })).resolves.toBeUndefined();
  });

  it("solo acepta estados bien formados del SW", () => {
    const estado = L.resumenEstado({ buildId: "B", fase: "lista", completo: true, guardados: 3, planificados: 3 });
    expect(estadoDeMensaje({ tipo: "starseed:precarga", estado })).toEqual(estado);
    expect(estadoDeMensaje({ tipo: "otra", estado })).toBeNull();
    expect(estadoDeMensaje({ tipo: "starseed:precarga", estado: { completo: "sí" } })).toBeNull();
    expect(estadoDeMensaje(null)).toBeNull();
  });

  it("almacén persistente: solo en la app instalada y nunca en Firefox (allí pregunta)", async () => {
    const persist = vi.fn(async () => true);
    expect(await pedirAlmacenPersistente(false, { storage: { persist } })).toBe(false);
    expect(await pedirAlmacenPersistente(true, { storage: { persist }, userAgent: "Mozilla/5.0 Firefox/130.0" })).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(await pedirAlmacenPersistente(true, { storage: { persist, persisted: async () => false }, userAgent: "Chrome/130" })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await pedirAlmacenPersistente(true, { storage: { persist: async () => { throw new Error("x"); } } })).toBe(false);
  });
});
