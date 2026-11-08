import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { fetchConPuerta, olvidarCaida, registrarRespaldoFetch, type RespaldoFetch } from "@/lib/malla/puerta/fetch-puerta";

const SUPABASE = "https://abc.supabase.co/rest/v1/perfiles?select=*";

function respaldo(o: Partial<RespaldoFetch> & { llamadas?: string[] } = {}): RespaldoFetch {
  return {
    activo: () => true,
    hayPuertas: () => true,
    sinSalida: () => false,
    pedir: async (url, init) => {
      o.llamadas?.push(`${init.method} ${url}`);
      return new Response('{"por":"puerta"}', { status: 200, headers: { "content-type": "application/json" } });
    },
    ...o,
  };
}

let baja: (() => void) | null = null;
afterEach(() => {
  baja?.();
  baja = null;
  olvidarCaida();
});

describe("fetchConPuerta", () => {
  it("sin respaldo registrado es el fetch base tal cual", async () => {
    const base = (async () => new Response("base")) as typeof fetch;
    const f = fetchConPuerta(base);
    expect(await (await f(SUPABASE)).text()).toBe("base");
  });

  it("la red propia manda mientras funcione", async () => {
    const llamadas: string[] = [];
    baja = registrarRespaldoFetch(respaldo({ llamadas }));
    const f = fetchConPuerta((async () => new Response("base")) as typeof fetch);
    expect(await (await f(SUPABASE)).text()).toBe("base");
    expect(llamadas).toEqual([]);
  });

  it("Supabase: si el fetch base falla por red, una lectura cae por la puerta", async () => {
    const llamadas: string[] = [];
    baja = registrarRespaldoFetch(respaldo({ llamadas }));
    let intentosBase = 0;
    const f = fetchConPuerta((async () => {
      intentosBase++;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    const res = await f(SUPABASE, { headers: { apikey: "k" } });
    expect(await res.json()).toEqual({ por: "puerta" });
    expect(llamadas).toEqual([`GET ${SUPABASE}`]);
    // ya se sabe que está caída: la siguiente va directa a la puerta sin esperar a la red
    await f(SUPABASE);
    expect(intentosBase).toBe(1);
    expect(llamadas.length).toBe(2);
  });

  it("un POST no se repite tras fallar la red (podría duplicarse), pero va por la puerta si se sabía que no había salida", async () => {
    const llamadas: string[] = [];
    baja = registrarRespaldoFetch(respaldo({ llamadas }));
    const caido = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const f = fetchConPuerta(caido);
    await expect(f("https://abc.supabase.co/rest/v1/x", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(TypeError);
    expect(llamadas).toEqual([]);
    olvidarCaida();
    baja();
    baja = registrarRespaldoFetch(respaldo({ llamadas, sinSalida: () => true }));
    const res = await f("https://abc.supabase.co/rest/v1/x", { method: "POST", body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(llamadas).toEqual(["POST https://abc.supabase.co/rest/v1/x"]);
  });

  it("si la puerta también falla se lanza el error original (el reintento de quien llama sigue igual)", async () => {
    const err = new TypeError("Failed to fetch");
    baja = registrarRespaldoFetch(respaldo({ pedir: async () => { throw new Error("sin puerta"); } }));
    const f = fetchConPuerta((async () => { throw err; }) as typeof fetch);
    await expect(f(SUPABASE)).rejects.toBe(err);
  });

  it("lo relativo, http y lo apagado no se tocan; un aborto del llamador se respeta", async () => {
    const llamadas: string[] = [];
    baja = registrarRespaldoFetch(respaldo({ llamadas, activo: () => false }));
    const caido = (async () => { throw new TypeError("x"); }) as typeof fetch;
    const f = fetchConPuerta(caido);
    await expect(f(SUPABASE)).rejects.toBeInstanceOf(TypeError); // ajuste apagado
    baja();
    baja = registrarRespaldoFetch(respaldo({ llamadas }));
    await expect(f("http://x.test/a")).rejects.toBeInstanceOf(TypeError);
    await expect(f("/api/algo")).rejects.toBeInstanceOf(TypeError);
    const ctl = new AbortController();
    ctl.abort();
    const abortado = fetchConPuerta((async () => { throw new DOMException("abortado", "AbortError"); }) as typeof fetch);
    await expect(abortado(SUPABASE, { signal: ctl.signal })).rejects.toBeInstanceOf(DOMException);
    expect(llamadas).toEqual([]);
  });

  it("el cliente de Supabase usa este envoltorio (sin cambiar a quien lo llama)", () => {
    const src = readFileSync("src/utils/supabase/client.ts", "utf8");
    expect(src).toContain("fetch: fetchConPuerta(fetchGuardado)");
  });
});
