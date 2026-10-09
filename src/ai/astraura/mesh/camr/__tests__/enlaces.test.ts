/**
 * StarSeed OS — CAMR · PRUEBAS DE ENLACES (Ola 1005C · CAMR1005D).
 * ============================================================================
 * Solo funciones puras exportadas (`EnlaceFisico` y sus fábricas). Sin red
 * ni hardware real. `fetchFn` se inyecta; `dentroDeLey` veta antes de tocar
 * nada; `medir()` sin radio devuelve `null` en los campos de señal.
 */

import { describe, it, expect, vi } from "vitest";
import {
  crearAdaptadorMeshtastic,
  crearAdaptadorSimulado,
  crearAdaptadorAgente,
} from "../enlaces";
import type { EnlaceFisico, ParametrosRadio } from "../tipos";

function fetchFalso(
  cuerpoEsperado?: { paquete?: number[]; clase?: string } | string,
): typeof fetch {
  return (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const cuerpo = init?.body ? JSON.parse(init.body) : null;
    const respuesta = cuerpoEsperado ? cuerpo : { ok: true };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(respuesta),
      json: async () => (Array.isArray(respuesta) ? { paquete: respuesta, ok: true } : { ...respuesta, ok: respuesta.ok ?? true }),
    } as Response;
  }) as typeof fetch;
}

describe("fábricas de enlaces", () => {
  it("crea un adaptador meshtastic con valores iniciales", () => {
    const e = crearAdaptadorMeshtastic("mt1", "EU_868", 868.1, 20, 256, true);
    expect(e.id).toBe("mt1");
    expect(e.tecnologia).toBe("meshtastic");
    expect(e.banda).toBe("EU_868");
    expect(e.cifradoPermitido).toBe(true);
  });

  it("crea un adaptador simulado con valores iniciales", () => {
    const e = crearAdaptadorSimulado("sim1", "simulado", 868.1, 20, 256, false);
    expect(e.id).toBe("sim1");
    expect(e.tecnologia).toBe("simulado");
  });

  it("crea un adaptador agente con fetch inyectado", () => {
    const e = crearAdaptadorAgente("ag1", "rns", 144.0, 100, 1280, true, fetchFalso());
    expect(e.id).toBe("ag1");
    expect(e.tecnologia).toBe("rns");
  });
});

describe("AdaptadorMeshtastic.medir()", () => {
  it("devuelve null en campos de señal sin radio real", () => {
    const e = crearAdaptadorMeshtastic("m", "EU_868", 868.1, 20, 256, true);
    const m = e.medir();
    expect(m.rssiDbm).toBeNull();
    expect(m.snrDb).toBeNull();
    expect(m.ber).toBeNull();
    expect(m.ruidoDbm).toBeNull();
    expect(m.latenciaMs).toBeNull();
    expect(m.perdida).toBeNull();
    expect(m.tiempoAireUsado).toBeNull();
    expect(m.anchoBandaKbps).toBeNull();
    expect(typeof m.at).toBe("number");
  });

  it("tiene vecinos 0 sin conexión", () => {
    const e = crearAdaptadorMeshtastic("m", "EU_868", 868.1, 20, 256, true);
    expect(e.medir().vecinos).toBe(0);
  });
});

describe("AdaptadorMeshtastic.aplicar()", () => {
  it("simula sin tocar hardware con seco=true", async () => {
    const e = crearAdaptadorMeshtastic("m", "EU_868", 868.1, 20, 256, true);
    const res = await e.aplicar({ frecuenciaMhz: 868.1, potenciaDbm: 14 }, { seco: true });
    expect(res.ok).toBe(true);
  });

  it("veta fuera de la ley (banda de radioaficionado sin indicativo)", async () => {
    const e = crearAdaptadorMeshtastic("m", "ham-2m", 144.5, 20, 256, false);
    const res = await e.aplicar({ frecuenciaMhz: 145.0, potenciaDbm: 30 }, { seco: false });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("exige el indicativo");
  });
});

describe("AdaptadorAgente", () => {
  it("sin fetchFn devuelve ok:false en aplicar", async () => {
    const e = crearAdaptadorAgente("ag", "rns", 144.0, 100, 1280, true);
    const res = await e.aplicar({ frecuenciaMhz: 144.0, potenciaDbm: 10 }, { seco: true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("sin fetchFn");
  });

  it("con fetch falso aplica y recibe cuerpo con paquete", async () => {
    const mockFetch = vi.fn<typeof fetch>((url: string | URL | Request, init?: RequestInit) => {
      const initObj = init as { body?: string } | undefined;
      const cuerpoStr = initObj?.body ?? "{}";
      const cuerpo = JSON.parse(cuerpoStr);
      expect(cuerpo.seco).toBe(true);
      expect(cuerpo.params).toBeDefined();
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ ok: true }),
        json: async () => ({ ok: true }),
      } as Response);
    });
    const e = crearAdaptadorAgente("ag", "rns", 144.0, 100, 1280, true, mockFetch);
    const res = await e.aplicar({ frecuenciaMhz: 144.0, potenciaDbm: 10 }, { seco: true });
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("enviar con fetch falso manda el cuerpo con paquete y clase", async () => {
    let cuerpoRecibido: unknown = null;
    const mockFetch = vi.fn<typeof fetch>((url: string | URL | Request, init?: RequestInit) => {
      const initObj = init as { body?: string } | undefined;
      cuerpoRecibido = initObj?.body ? JSON.parse(initObj.body) : null;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ ok: true }),
        json: async () => ({ ok: true }),
      } as Response);
    });
    const e = crearAdaptadorAgente("ag", "rns", 144.0, 100, 1280, true, mockFetch);
    const paquete = new Uint8Array([1, 2, 3]);
    const res = await e.enviar(paquete, "mensajes");
    expect(res.ok).toBe(true);
    expect(cuerpoRecibido).not.toBeNull();
    const c = cuerpoRecibido as { paquete?: number[]; clase?: string };
    expect(c.paquete).toBeDefined();
    expect(c.clase).toBe("mensajes");
  });
});

describe("AdaptadorSimulado", () => {
  it("medir sin datos inventados (solo los del simulador)", async () => {
    const e = crearAdaptadorSimulado("sim", "simulado", 868.1, 20, 256, false);
    const m = e.medir();
    expect(typeof m.at).toBe("number");
  });

  it("aplicar en modo seco", async () => {
    const e = crearAdaptadorSimulado("sim", "simulado", 868.1, 20, 256, false);
    const res = await e.aplicar({ frecuenciaMhz: 868.1, potenciaDbm: 14 }, { seco: true });
    expect(res.ok).toBe(true);
  });
});
