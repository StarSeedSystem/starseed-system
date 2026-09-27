"use client";

/*
 * par-signaling — BUZÓN de señalización WebRTC de un VÍNCULO ENTRE CUENTAS
 * (Ola 370), autenticado con HMAC. Es el equivalente de `signaling.ts` para
 * dos dispositivos de CUENTAS DISTINTAS: `signaling.ts` usa la propia cuenta
 * como buzón (`starseed-signal-<userId>`, protegido porque solo dos
 * dispositivos de la MISMA cuenta conocen ese userId con sesión); aquí NO hay
 * una cuenta compartida, así que el canal:
 *
 *   1. Tiene un TOPIC no adivinable (`starseed-par-<hash>`, derivado de
 *      `claveParHex` por `par-crypto.ts::topicDePar` — nadie que no conozca
 *      el secreto de par llega a ese nombre de canal), Y
 *   2. Exige HMAC-SHA256(claveParHex) en CADA mensaje — un tercero que
 *      adivinara el topic (Supabase Realtime no impone autorización por
 *      canal en este proyecto — ver `architecture/vinculos-entre-cuentas.md`
 *      §4) no podría firmar nada sin la clave, así que sus mensajes se
 *      DESCARTAN silenciosamente antes de tocar `webrtc-mesh.ts`.
 *
 * DOS TRANSPORTES (misma degradación honesta que `signaling.ts`):
 *   1) PREFERIDO — Supabase Realtime (broadcast) en el topic derivado.
 *   2) FALLBACK — buzón en la fila del vínculo (`os_mesh_vinculos.buzon_de`/
 *      `buzon_a`, columnas jsonb, Ola 370): se ESCRIBE vía la función
 *      SECURITY DEFINER `enviar_senal_vinculo` (la tabla no admite UPDATE
 *      directo — ver la migración) y se LEE con un select normal (RLS ya
 *      permite a los dos participantes leer su propia fila).
 *
 * FIRMA: se firma la SERIALIZACIÓN LITERAL que viaja por el canal (nunca se
 * reconstruye para verificar) — el receptor verifica el HMAC sobre los BYTES
 * recibidos y solo DESPUÉS los parsea a `Signal`. Así no hay ninguna
 * dependencia del orden de claves de `JSON.stringify` entre motores.
 *
 * SSR-safe y defensivo: nunca lanza. Sin `claveParHex` no se envía NADA sin
 * firmar (ni por error): `send()` devuelve `false` si el HMAC no se pudo
 * calcular.
 */

import { createClient } from "@/utils/supabase/client";
import type { Signal, SignalSubscription } from "@/lib/network/signaling";
import { hmacFirmar, hmacVerificar } from "@/lib/network/par-crypto";

/** El mismo contrato mínimo que `webrtc-mesh.ts` necesita de un transporte de señalización. */
export interface TransporteSenal {
  send: (sig: Signal) => Promise<boolean>;
  subscribe: (self: string, cb: (sig: Signal) => void) => Promise<SignalSubscription>;
}

const BROADCAST_EVENT = "signal";
/** Cadencia del fallback de sondeo (igual que `signaling.ts`). */
const POLL_INTERVAL_MS = 2_500;
/** Espera máxima a que el canal Realtime quede `SUBSCRIBED` antes de caer al fallback. */
const SUBSCRIBE_TIMEOUT_MS = 4_000;

/** Serialización CANÓNICA y ESTABLE de una señal (orden de campos fijo). Es lo que se firma. */
function canonicalizar(sig: Signal): string {
  return JSON.stringify({
    from: sig.from,
    to: sig.to,
    kind: sig.kind,
    sdp: sig.sdp ?? null,
    candidate: sig.candidate ?? null,
    at: sig.at,
    nonce: sig.nonce,
  });
}

/** Reconstruye una `Signal` desde el JSON canónico ya verificado (o `null` si no es válida). */
function parsearSignal(payload: string): Signal | null {
  let o: unknown;
  try {
    o = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.from !== "string" || !r.from) return null;
  if (typeof r.to !== "string" || !r.to) return null;
  const kind = r.kind;
  if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "bye") return null;
  return {
    from: r.from,
    to: r.to,
    kind,
    sdp: typeof r.sdp === "string" ? r.sdp : undefined,
    candidate: r.candidate && typeof r.candidate === "object" ? (r.candidate as RTCIceCandidateInit) : undefined,
    at: typeof r.at === "number" ? r.at : Date.now(),
    nonce: typeof r.nonce === "string" && r.nonce ? r.nonce : "",
  };
}

/** Sobre firmado que viaja por Realtime o por el buzón de respaldo. */
interface SobreFirmado {
  payload: string;
  mac: string;
}

function esSobreFirmado(x: unknown): x is SobreFirmado {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.payload === "string" && typeof o.mac === "string";
}

/**
 * crearTransporteSenalPar — construye el transporte de señalización de UN
 * vínculo ya `aceptado` (identificado por `vinculoId` + su `topic` derivado +
 * `claveParHex`). `soyDe` indica de qué lado de la fila está ESTE
 * dispositivo (`true` = `de_owner`/`de_device`; `false` = `a_owner`/
 * `a_device`) — decide en qué columna del buzón de respaldo escribe/lee.
 *
 * Nunca lanza. Si `claveParHex` está vacía, `send()` siempre devuelve
 * `false` (nunca se manda una señal sin firmar) y `subscribe()` sigue
 * escuchando pero DESCARTA todo lo que no verifique.
 */
export function crearTransporteSenalPar(opts: {
  vinculoId: string;
  topic: string;
  claveParHex: string;
  soyDe: boolean;
}): TransporteSenal {
  const { vinculoId, topic, claveParHex, soyDe } = opts;
  const channelTopic = `starseed-par-${topic}`;

  const send: TransporteSenal["send"] = async (sig) => {
    try {
      const payload = canonicalizar(sig);
      const mac = await hmacFirmar(claveParHex, payload);
      if (!mac) return false; // nunca se envía sin firmar
      const sobre: SobreFirmado = { payload, mac };

      // 1) Realtime (si hay un canal vivo de una suscripción activa de este
      //    mismo transporte — ver `subscribe`, que guarda la referencia).
      const canal = canalActivo;
      if (canal?.ready) {
        try {
          const res = await canal.channel.send({ type: "broadcast", event: BROADCAST_EVENT, payload: sobre });
          if (String(res) === "ok") return true;
        } catch {
          /* cae al buzón de respaldo */
        }
      }

      // 2) Fallback: buzón de respaldo vía RPC (la tabla no admite UPDATE directo).
      try {
        const supabase = createClient();
        const { error } = await supabase.rpc("enviar_senal_vinculo", {
          p_vinculo_id: vinculoId,
          p_senal: sobre,
        });
        return !error;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  };

  // Referencia al canal Realtime de la suscripción EN CURSO (una por
  // transporte — un vínculo ya aceptado tiene un único consumidor: la mesh
  // de par de `vinculos-entre-cuentas.ts`). `send()` la usa si está lista.
  let canalActivo: { channel: ReturnType<ReturnType<typeof createClient>["channel"]>; ready: boolean } | null = null;

  const subscribe: TransporteSenal["subscribe"] = async (self, cb) => {
    const seen = new Set<string>();
    const deliver = (sig: Signal) => {
      if (!sig.nonce || seen.has(sig.nonce)) return;
      // Filtra por destino: solo lo dirigido a mí y no emitido por mí (mismo
      // criterio que `signaling.ts`, aunque aquí el canal ya es 1:1 por
      // vínculo — defensa en profundidad, nunca daña).
      if (sig.to !== self || sig.from === self) return;
      seen.add(sig.nonce);
      if (seen.size > 256) {
        // Recorte simple (mismo espíritu que `trimSeen` de signaling.ts).
        let toDrop = seen.size - 128;
        for (const n of seen) {
          seen.delete(n);
          if (--toDrop <= 0) break;
        }
      }
      try {
        cb(sig);
      } catch {
        /* un listener que lanza no debe tumbar el transporte */
      }
    };

    const onSobre = async (raw: unknown) => {
      if (!esSobreFirmado(raw)) return; // forma inválida: se descarta
      const ok = await hmacVerificar(claveParHex, raw.payload, raw.mac);
      if (!ok) return; // sin firma válida: se descarta ANTES de parsear
      const sig = parsearSignal(raw.payload);
      if (sig) deliver(sig);
    };

    // --- Intento Realtime ---
    try {
      const supabase = createClient();
      const channel = supabase.channel(channelTopic, { config: { broadcast: { self: false } } });
      channel.on("broadcast", { event: BROADCAST_EVENT }, (msg: { payload?: unknown }) => {
        void onSobre(msg?.payload);
      });

      const subscribed = await new Promise<boolean>((resolve) => {
        let settled = false;
        const done = (v: boolean) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        const timer = setTimeout(() => done(false), SUBSCRIBE_TIMEOUT_MS);
        try {
          channel.subscribe((status) => {
            const s = String(status);
            if (s === "SUBSCRIBED") {
              clearTimeout(timer);
              done(true);
            } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
              clearTimeout(timer);
              done(false);
            }
          });
        } catch {
          clearTimeout(timer);
          done(false);
        }
      });

      if (subscribed) {
        canalActivo = { channel, ready: true };
        let closed = false;
        return {
          transport: "realtime",
          unsubscribe: () => {
            if (closed) return;
            closed = true;
            canalActivo = null;
            try {
              supabase.removeChannel(channel);
            } catch {
              /* noop */
            }
          },
        };
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    } catch {
      /* cae al fallback */
    }

    // --- Fallback: sondeo del buzón de respaldo en la fila del vínculo ---
    let stopped = false;
    const consumedNonces = new Set<string>();
    const columnaEntrante = soyDe ? "buzon_a" : "buzon_de"; // leo lo que el OTRO lado escribió

    const tick = async () => {
      if (stopped) return;
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("os_mesh_vinculos")
          .select(columnaEntrante)
          .eq("id", vinculoId)
          .maybeSingle();
        if (error || !data) return;
        const buzon = (data as Record<string, unknown>)[columnaEntrante];
        if (!Array.isArray(buzon)) return;
        for (const item of buzon) {
          if (!esSobreFirmado(item)) continue;
          // Dedup por el `payload` completo (el fallback no borra lo ya
          // leído — el recorte a 40 filas del servidor es el único límite
          // de tamaño — así que un mismo sobre puede reaparecer en varios
          // sondeos; se descarta localmente por identidad de payload).
          if (consumedNonces.has(item.payload)) continue;
          consumedNonces.add(item.payload);
          if (consumedNonces.size > 256) {
            let toDrop = consumedNonces.size - 128;
            for (const n of consumedNonces) {
              consumedNonces.delete(n);
              if (--toDrop <= 0) break;
            }
          }
          await onSobre(item);
        }
      } catch {
        /* silencioso: reintenta en el siguiente tick */
      }
    };

    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();

    return {
      transport: "polling",
      unsubscribe: () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
      },
    };
  };

  return { send, subscribe };
}
