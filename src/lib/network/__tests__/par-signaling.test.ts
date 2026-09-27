/**
 * par-signaling — Ola 370. Verifica lo que el SOP promete como defensa:
 *   1. Una señal FIRMADA con la clave correcta se entrega.
 *   2. Una señal SIN firmar, con firma manipulada, o con el mensaje
 *      manipulado (misma firma, payload distinto) se DESCARTA.
 *   3. `send()` nunca manda nada sin poder firmarlo (clave vacía → false).
 *   4. El fallback (buzón de respaldo) se usa cuando Realtime no llega a
 *      SUBSCRIBED, leyendo la columna del OTRO lado (`buzon_a` si soy `de`,
 *      `buzon_de` si soy `a`) y escribe vía la RPC `enviar_senal_vinculo`.
 *
 * Usa `par-crypto.ts` REAL (WebCrypto de Node) para que la firma HMAC sea
 * genuina — no se mockea la criptografía, solo el cliente de Supabase.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { Signal } from "@/lib/network/signaling";

/* ------------------------------------------------------------------ */
/* Doble de Supabase: un canal Realtime en memoria + rpc/from espiados */
/* ------------------------------------------------------------------ */

type BroadcastHandler = (msg: { payload?: unknown }) => void;

function crearClienteFalso() {
  let subscribeOutcome: "SUBSCRIBED" | "CHANNEL_ERROR" | "timeout" = "SUBSCRIBED";
  // Varios "dispositivos" (transportes) de la prueba se suscriben al MISMO
  // topic — como en Supabase real, TODOS los suscriptores de un topic
  // reciben cada broadcast (no solo "el último que se suscribió"): un array
  // de handlers, no una variable que se pisa.
  const handlers: BroadcastHandler[] = [];
  const sentToChannel: unknown[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  let rpcResult: { error: unknown } = { error: null };
  let fromRow: Record<string, unknown> | null = {};
  let fromError: unknown = null;

  const channel = {
    on: vi.fn((_type: string, _filter: unknown, cb: BroadcastHandler) => {
      handlers.push(cb);
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      if (subscribeOutcome === "timeout") return channel; // nunca llama cb: fuerza el timeout del transporte
      queueMicrotask(() => cb(subscribeOutcome));
      return channel;
    }),
    send: vi.fn(async (msg: { payload: unknown }) => {
      sentToChannel.push(msg.payload);
      // Simula "yo mismo recibiendo" NO (broadcast.self:false) — el test
      // dispara la entrega manualmente vía `emit()` para simular al OTRO lado.
      return "ok";
    }),
  };

  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: fromRow, error: fromError })),
        })),
      })),
    })),
  };

  return {
    client,
    channel,
    sentToChannel,
    rpcCalls,
    emit: (payload: unknown) => {
      for (const h of handlers) h({ payload });
    },
    setSubscribeOutcome: (o: typeof subscribeOutcome) => {
      subscribeOutcome = o;
    },
    setRpcResult: (r: typeof rpcResult) => {
      rpcResult = r;
    },
    setFromRow: (r: typeof fromRow) => {
      fromRow = r;
    },
    setFromError: (e: unknown) => {
      fromError = e;
    },
  };
}

let fake: ReturnType<typeof crearClienteFalso>;

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => fake.client,
}));

beforeEach(() => {
  fake = crearClienteFalso();
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */

const CLAVE = "ab".repeat(32);
const OTRA_CLAVE = "cd".repeat(32);

function unaSenal(over: Partial<Signal> = {}): Signal {
  return { from: "dispositivo-a", to: "dispositivo-b", kind: "offer", sdp: "sdp-de-prueba", at: 1000, nonce: "n1", ...over };
}

describe("crearTransporteSenalPar", () => {
  test("send() nunca manda nada si la clave está vacía (no se puede firmar)", async () => {
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const t = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: "", soyDe: true });
    const ok = await t.send(unaSenal());
    expect(ok).toBe(false);
    expect(fake.channel.send).not.toHaveBeenCalled();
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });

  test("una señal firmada correctamente por Realtime se entrega al suscriptor", async () => {
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const receptor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: false });
    const recibidas: Signal[] = [];
    const sub = await receptor.subscribe("dispositivo-b", (s) => recibidas.push(s));
    expect(sub.transport).toBe("realtime");

    const emisor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: true });
    // El emisor también se suscribe (como hace `webrtc-mesh.ts::initMesh` al
    // arrancar el mesh): así `send()` encuentra su propio canal listo, igual
    // que en producción. Ambos "dispositivos" de la prueba comparten el
    // mismo topic — como en Supabase real, ambos son suscriptores del mismo
    // canal y ambos reciben cada broadcast.
    const subEmisor = await emisor.subscribe("dispositivo-a", () => {});
    // El emisor firma y "envía" — capturamos el sobre y lo re-emitimos hacia
    // el canal del receptor (mismo bus falso: ambos comparten `fake.channel`).
    await emisor.send(unaSenal());
    expect(fake.sentToChannel).toHaveLength(1);
    fake.emit(fake.sentToChannel[0]);
    await new Promise((r) => setTimeout(r, 0));

    expect(recibidas).toHaveLength(1);
    expect(recibidas[0].sdp).toBe("sdp-de-prueba");
    sub.unsubscribe();
    subEmisor.unsubscribe();
  });

  test("una señal con HMAC de OTRA clave se descarta (no llega al suscriptor)", async () => {
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const receptor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: false });
    const recibidas: Signal[] = [];
    const sub = await receptor.subscribe("dispositivo-b", (s) => recibidas.push(s));

    const atacante = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: OTRA_CLAVE, soyDe: true });
    const subAtacante = await atacante.subscribe("dispositivo-a", () => {});
    await atacante.send(unaSenal({ nonce: "n-atacante" }));
    fake.emit(fake.sentToChannel[0]);
    await new Promise((r) => setTimeout(r, 0));

    expect(recibidas).toHaveLength(0);
    sub.unsubscribe();
    subAtacante.unsubscribe();
  });

  test("un mensaje manipulado (mismo mac, payload alterado) se descarta", async () => {
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const receptor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: false });
    const recibidas: Signal[] = [];
    const sub = await receptor.subscribe("dispositivo-b", (s) => recibidas.push(s));

    const emisor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: true });
    const subEmisor = await emisor.subscribe("dispositivo-a", () => {});
    await emisor.send(unaSenal({ nonce: "n-manipulada" }));
    const sobre = fake.sentToChannel[0] as { payload: string; mac: string };
    const manipulado = { ...sobre, payload: sobre.payload.replace("sdp-de-prueba", "sdp-inyectada-por-atacante") };
    fake.emit(manipulado);
    await new Promise((r) => setTimeout(r, 0));

    expect(recibidas).toHaveLength(0);
    sub.unsubscribe();
    subEmisor.unsubscribe();
  });

  test("un sobre con forma inválida (sin payload/mac) se descarta sin lanzar", async () => {
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const receptor = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: false });
    const recibidas: Signal[] = [];
    const sub = await receptor.subscribe("dispositivo-b", (s) => recibidas.push(s));

    fake.emit({ no: "esto no es un sobre" });
    fake.emit(null);
    fake.emit("texto plano");
    await new Promise((r) => setTimeout(r, 0));

    expect(recibidas).toHaveLength(0);
    sub.unsubscribe();
  });

  test("cae al buzón de respaldo si Realtime no llega a SUBSCRIBED, y lee la columna del OTRO lado", async () => {
    fake.setSubscribeOutcome("CHANNEL_ERROR");
    const senalFirmada = { payload: JSON.stringify(unaSenal({ to: "dispositivo-b", nonce: "n-fallback" })), mac: "no-importa-para-este-test" };
    fake.setFromRow({ buzon_a: [senalFirmada] });

    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    // `soyDe: true` → lee `buzon_a` (lo que escribió el otro lado, `a`).
    const t = crearTransporteSenalPar({ vinculoId: "v1", topic: "topic1", claveParHex: CLAVE, soyDe: true });
    const recibidas: Signal[] = [];
    const sub = await t.subscribe("dispositivo-b", (s) => recibidas.push(s));
    expect(sub.transport).toBe("polling");

    // El mac de prueba no verifica con CLAVE de verdad → se descarta (honesto:
    // no se entrega solo por venir de la fila correcta, hace falta el HMAC).
    await new Promise((r) => setTimeout(r, 10));
    expect(recibidas).toHaveLength(0);

    // Con un HMAC genuino sí se entrega.
    const { hmacFirmar } = await import("@/lib/network/par-crypto");
    const payload = JSON.stringify(unaSenal({ to: "dispositivo-b", nonce: "n-fallback-valida" }));
    const mac = await hmacFirmar(CLAVE, payload);
    fake.setFromRow({ buzon_a: [{ payload, mac }] });
    await new Promise((r) => setTimeout(r, 3000));
    expect(recibidas.some((s) => s.nonce === "n-fallback-valida")).toBe(true);

    sub.unsubscribe();
  }, 10_000);

  test("send() cae a la RPC enviar_senal_vinculo cuando no hay canal Realtime listo", async () => {
    fake.setSubscribeOutcome("CHANNEL_ERROR");
    const { crearTransporteSenalPar } = await import("@/lib/network/par-signaling");
    const t = crearTransporteSenalPar({ vinculoId: "v-rpc", topic: "topic1", claveParHex: CLAVE, soyDe: true });
    // send() sin haberse suscrito antes: no hay canalActivo → va directo al fallback RPC.
    const ok = await t.send(unaSenal());
    expect(ok).toBe(true);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].fn).toBe("enviar_senal_vinculo");
    expect((fake.rpcCalls[0].args as { p_vinculo_id: string }).p_vinculo_id).toBe("v-rpc");
  });
});
