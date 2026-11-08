import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConPuerta, olvidarCaida, registrarRespaldoFetch, type RespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";

let baja: (() => void) | null = null;
afterEach(() => {
  baja?.();
  baja = null;
  olvidarCaida();
});

function respaldo(parche: Partial<RespaldoFetch> = {}): RespaldoFetch & { pedir: ReturnType<typeof vi.fn> } {
  return {
    activo: () => true,
    hayPuertas: () => true,
    sinSalida: () => false,
    requiereCapa: () => false,
    pedir: vi.fn(async () => new Response("por-la-puerta", { status: 200 })),
    ...parche,
  } as RespaldoFetch & { pedir: ReturnType<typeof vi.fn> };
}

describe("fetchConPuerta con capas (PTA1108C)", () => {
  it("un destino de una capa que esta neurona no alcanza va directo por la puerta, sin probar antes la red propia", async () => {
    const r = respaldo({ requiereCapa: (u) => u.includes("192.168.1.50") });
    baja = registrarRespaldoFetch(r);
    const base = vi.fn(async () => new Response("directo"));
    const f = fetchConPuerta(base as unknown as typeof fetch);
    const res = await f("https://192.168.1.50:8443/rest/v1/x");
    expect(await res.text()).toBe("por-la-puerta");
    expect(base).not.toHaveBeenCalled();
    expect(r.pedir).toHaveBeenCalledTimes(1);
  });

  it("un POST a mi servidor propio tampoco se duplica: nada salió antes", async () => {
    const r = respaldo({ requiereCapa: () => true });
    baja = registrarRespaldoFetch(r);
    const base = vi.fn(async () => new Response("directo"));
    const f = fetchConPuerta(base as unknown as typeof fetch);
    const res = await f("https://nas.lan/api", { method: "POST", body: "{}" });
    expect(await res.text()).toBe("por-la-puerta");
    expect(base).not.toHaveBeenCalled();
    expect(r.pedir).toHaveBeenCalledTimes(1);
    expect(r.pedir.mock.calls[0][1].method).toBe("POST");
  });

  it("si esta neurona sí alcanza el destino (requiereCapa falso), va por su red como siempre", async () => {
    const r = respaldo();
    baja = registrarRespaldoFetch(r);
    const base = vi.fn(async () => new Response("directo"));
    const res = await fetchConPuerta(base as unknown as typeof fetch)("https://192.168.1.50/x");
    expect(await res.text()).toBe("directo");
    expect(r.pedir).not.toHaveBeenCalled();
  });

  it("si la puerta falla, se prueba la red propia (nunca se pierde la petición)", async () => {
    const r = respaldo({ requiereCapa: () => true, pedir: vi.fn(async () => Promise.reject(new TypeError("puerta caída"))) as never });
    baja = registrarRespaldoFetch(r);
    const base = vi.fn(async () => new Response("directo"));
    const res = await fetchConPuerta(base as unknown as typeof fetch)("https://nas.lan/x");
    expect(await res.text()).toBe("directo");
  });

  it("con el ajuste apagado o sin puertas no se desvía nada", async () => {
    baja = registrarRespaldoFetch(respaldo({ requiereCapa: () => true, hayPuertas: () => false }));
    const base = vi.fn(async () => new Response("directo"));
    expect(await (await fetchConPuerta(base as unknown as typeof fetch)("https://nas.lan/x")).text()).toBe("directo");
  });
});
