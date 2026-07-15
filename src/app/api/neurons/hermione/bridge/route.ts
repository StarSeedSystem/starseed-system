/**
 * API route del puente Hermione (servidor de la neurona = esta Mac).
 *
 * Recibe un mensaje del usuario desde un chat de Aurora (reenviado por
 * `hermione-bridge.ts` cuando Hermione está activa) y lo entrega a la
 * sesión Hermes VIVA de esta computadora a través de un WebSocket local
 * (ws://localhost:8787). La sesión Hermes procesa y responde; este endpoint
 * escribe la respuesta de vuelta en `astraura_messages` (rol assistant) para
 * que aparezca en el chat de Aurora en tiempo real (mismo camino Adenda 69).
 *
 * También expone GET para health-check y para que la neurona reporte online.
 *
 * Seguridad: esta ruta SOLO debe ser alcanzable desde la propia máquina
 * (localhost) o tras auth de la cuenta; el deploy de producción la mantiene
 * detrás de la auth de Supabase del OS. El bridge de la neurona pertenece a
 * la cuenta maggasukha; para la versión de Biblioteca (abierta) cada usuario
 * enlaza su propia neurona, nunca los datos de maggasukha.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/client";
import { writeHermioneReply } from "@/lib/aurora/hermione-bridge";

const HERMES_WS = process.env.HERMIONE_HERMES_WS || "ws://localhost:8787";
const DELIVER_TIMEOUT_MS = 60_000;

/** Entrega el mensaje a la sesión Hermes local vía WebSocket y devuelve la respuesta. */
async function deliverToHermes(payload: {
  convId: string;
  msgId: string;
  clientId: string;
  text: string;
  userId: string;
  profileKey?: string;
}): Promise<string | null> {
  // Si no hay ws disponible (sesión Hermes no corre en esta máquina), degradamos.
  if (typeof WebSocket === "undefined") return null;
  return new Promise<string | null>((resolve) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(HERMES_WS);
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      resolve(null);
    }, DELIVER_TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "hermione-message",
          convId: payload.convId,
          clientId: payload.clientId,
          userId: payload.userId,
          profileKey: payload.profileKey,
          text: payload.text,
        }),
      );
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (data?.type === "hermione-reply" && typeof data.text === "string") {
          clearTimeout(timer);
          try { ws.close(); } catch { /* noop */ }
          resolve(data.text);
        }
      } catch {
        /* ignora frames no-JSON */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    ws.onclose = () => {
      clearTimeout(timer);
      resolve(null);
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, bridge: "hermione", status: "listening" });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      convId?: string;
      msgId?: string;
      clientId?: string;
      text?: string;
      userId?: string;
      profileKey?: string;
    };
    if (!body.convId || !body.clientId || !body.text || !body.userId) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    // Verifica que la neurona servidor de Hermione existe y pertenece a la cuenta.
    const sb = createClient();
    const { data: neuron } = await sb
      .from("neuron_devices")
      .select("id, capabilities")
      .eq("id", "c0ffee01-1234-4abc-8def-0123456789ab")
      .maybeSingle();
    const caps = (neuron as any)?.capabilities;
    if (!caps?.bridge || caps.bridge.mode !== "external-hermes") {
      return NextResponse.json({ ok: false, error: "neuron_unregistered" }, { status: 404 });
    }

    // Entrega a la sesión Hermes viva de esta Mac.
    const reply = await deliverToHermes({
      convId: body.convId,
      msgId: body.msgId || "",
      clientId: body.clientId,
      text: body.text,
      userId: body.userId,
      profileKey: body.profileKey,
    });

    if (reply == null) {
      // No hay sesión Hermes local: la respuesta la dará Astraura normal.
      return NextResponse.json({ ok: true, delivered: false, fallback: "astraura" });
    }

    // Escribe la respuesta de Hermes en el hilo de Aurora (realtime Adenda 69).
    const ok = await writeHermioneReply({
      convId: body.convId,
      userId: body.userId,
      text: reply,
      clientId: `hermione-reply-${body.clientId}`,
    });
    return NextResponse.json({ ok: true, delivered: true, written: ok });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
