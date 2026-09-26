// @vitest-environment jsdom
/**
 * signaling — Ola 366 (malla de neuronas). Regresión del bug de la Adenda:
 * `ensureRealtimeHub` comprobaba `realtimeHubs` de forma SÍNCRONA pero solo
 * escribía en él DESPUÉS de un `await channel.subscribe(...)`. Dos llamadas
 * concurrentes para el MISMO userId abrían dos canales Supabase con el MISMO
 * nombre; el segundo `removeChannel` podía tumbar el primero ya suscrito.
 *
 * Este test simula exactamente esa concurrencia (dos `subscribeSignals` para
 * el mismo userId, lanzados sin esperar el primero) y verifica que solo se
 * abre UN canal.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

let channelCalls = 0;
let subscribeCalls = 0;
let removeChannelCalls = 0;

interface FakeChannel {
  on: (type: string, filter: unknown, cb: (msg: unknown) => void) => FakeChannel;
  subscribe: (statusCb: (status: string) => void) => FakeChannel;
  send: (payload: unknown) => Promise<string>;
}

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    channel: (_name: string, _opts?: unknown) => {
      channelCalls++;
      const chan: FakeChannel = {
        on: () => chan,
        subscribe: (statusCb) => {
          subscribeCalls++;
          // SUBSCRIBED llega en un tick posterior (como el SDK real): es
          // JUSTO esa ventana la que exponía la carrera sin memoización.
          setTimeout(() => statusCb("SUBSCRIBED"), 5);
          return chan;
        },
        send: async () => "ok",
      };
      return chan;
    },
    removeChannel: () => {
      removeChannelCalls++;
    },
  }),
}));

beforeEach(() => {
  channelCalls = 0;
  subscribeCalls = 0;
  removeChannelCalls = 0;
  vi.resetModules();
});

describe("signaling — memoización del hub Realtime en vuelo", () => {
  test("dos subscribeSignals CONCURRENTES para el mismo userId abren un solo canal", async () => {
    const { subscribeSignals } = await import("@/lib/network/signaling");
    const [a, b] = await Promise.all([
      subscribeSignals("user-1", "dev-A", () => {}),
      subscribeSignals("user-1", "dev-B", () => {}),
    ]);
    expect(channelCalls).toBe(1);
    expect(subscribeCalls).toBe(1);
    expect(removeChannelCalls).toBe(0); // nadie tumbó el canal del otro
    expect(a.transport).toBe("realtime");
    expect(b.transport).toBe("realtime");
    a.unsubscribe();
    b.unsubscribe();
  });

  test("una tercera llamada tras establecerse reutiliza el hub YA listo (sin abrir otro canal)", async () => {
    const { subscribeSignals } = await import("@/lib/network/signaling");
    const a = await subscribeSignals("user-2", "dev-A", () => {});
    expect(channelCalls).toBe(1);
    const b = await subscribeSignals("user-2", "dev-B", () => {});
    expect(channelCalls).toBe(1); // reutilizado, no un segundo canal
    a.unsubscribe();
    b.unsubscribe();
  });
});
