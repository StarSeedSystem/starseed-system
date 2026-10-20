/**
 * Enganche del relé propio en `estacionGlobal().sintonizar`: sin `NEXT_PUBLIC_ESTACIONES_RELE_URL` no hay
 * canal ni conexión; con una dirección válida se abre `<base>/ws?tema=<tema>` con el MISMO tema que Supabase
 * (público o derivado del token), se suma a los canales de la sesión y se cierra al salir; una dirección no
 * válida no abre nada. Supabase queda sin configurar (cliente que lanza) para no tocar red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => {
    throw new Error("sin configuración de Supabase en la prueba");
  },
}));

import { crearLlaves, crearToken, idDeLlave, temaPrivado, temaPublico } from "../cripto-estacion";
import { estacionGlobal } from "../estacion-global";
import { enlaceDeSesion, type FichaSesion } from "../transmision-parametrica";

class FalsoWS {
  static instancias: FalsoWS[] = [];
  readyState = 0;
  cerrada = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
  onclose: ((ev?: CloseEvent) => void) | null = null;
  constructor(public url: string) {
    FalsoWS.instancias.push(this);
  }
  send(): void {}
  close(): void {
    this.cerrada = true;
    this.readyState = 3;
  }
}

async function nuevaFicha(privada: boolean): Promise<FichaSesion> {
  const llaves = await crearLlaves();
  return {
    v: 1,
    id: await idDeLlave(llaves.publica),
    fuente: "omnifrecuencias",
    titulo: "Círculo de 432 Hz",
    enlace: "https://omnifrecuencias.vercel.app/",
    pk: llaves.publica,
    privada,
    params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.7, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
    creada: Date.now(),
  };
}

describe("estacionGlobal · canal del relé propio", () => {
  beforeEach(() => {
    FalsoWS.instancias = [];
    vi.stubGlobal("WebSocket", FalsoWS);
  });
  afterEach(() => {
    estacionGlobal().salir();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sin dirección configurada no hay canal de relé ni socket, y el aviso no habla del relé", async () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "");
    const ficha = await nuevaFicha(false);
    const r = await estacionGlobal().sintonizar(enlaceDeSesion(ficha));
    expect(r.ok).toBe(true);
    expect(FalsoWS.instancias).toHaveLength(0);
    expect(estacionGlobal().foto().sesion?.canales.map((c) => c.tipo)).toEqual([]);
    expect(estacionGlobal().foto().error).toMatch(/^Sin conexión a internet/);
  });

  it("con una dirección válida abre el relé en el tema público, lo suma a la sesión y lo cierra al salir", async () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "wss://rele.x/");
    const ficha = await nuevaFicha(false);
    const r = await estacionGlobal().sintonizar(enlaceDeSesion(ficha));
    expect(r.ok).toBe(true);
    expect(FalsoWS.instancias).toHaveLength(1);
    expect(FalsoWS.instancias[0].url).toBe(`wss://rele.x/ws?tema=${encodeURIComponent(temaPublico(ficha.id))}`);
    const f = estacionGlobal().foto();
    expect(f.sesion?.canales.map((c) => [c.tipo, c.abierto])).toEqual([["rele", false]]); // aún no abre: no se finge
    expect(f.error).toMatch(/Supabase Realtime no está disponible.*relé propio/);
    estacionGlobal().salir();
    expect(FalsoWS.instancias[0].cerrada).toBe(true);
    expect(estacionGlobal().foto().sesion).toBeNull();
  });

  it("una estación privada usa el tema derivado del token: el token no sale en la dirección", async () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "wss://rele.x");
    const ficha = await nuevaFicha(true);
    const token = crearToken();
    const r = await estacionGlobal().sintonizar(enlaceDeSesion(ficha, { token }));
    expect(r.ok).toBe(true);
    expect(FalsoWS.instancias).toHaveLength(1);
    const url = FalsoWS.instancias[0].url;
    expect(url).toBe(`wss://rele.x/ws?tema=${encodeURIComponent(await temaPrivado(ficha.id, token))}`);
    expect(url).toContain("estacion-p%3A");
    expect(url).not.toContain(token);
    expect(url).not.toContain(ficha.id);
  });

  it("una dirección no válida (ws:// remoto) no abre ningún socket", async () => {
    vi.stubEnv("NEXT_PUBLIC_ESTACIONES_RELE_URL", "ws://rele.x");
    const ficha = await nuevaFicha(false);
    const r = await estacionGlobal().sintonizar(enlaceDeSesion(ficha));
    expect(r.ok).toBe(true);
    expect(FalsoWS.instancias).toHaveLength(0);
    expect(estacionGlobal().foto().sesion?.canales).toEqual([]);
  });
});
