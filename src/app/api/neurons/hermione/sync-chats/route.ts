import { NextResponse } from "next/server";
import {
  backfillAllHermesNeurons,
  backfillHermesChatsToNeuron,
  registerHermioneChatEverywhere,
} from "@/lib/aurora/hermione-server";

/**
 * POST /api/neurons/hermione/sync-chats
 * Sincronización por chat de Hermione (Adenda 70):
 *   · sin body → BACKFILL de TODOS los chats de Hermione a TODAS las neuronas.
 *   · { neuronId } → BACKFILL de todos los chats a esa neurona (cuando recupera
 *     señal o se instala Hermes).
 *   · { convId, name } → registra ese chat en TODAS las neuronas (en tiempo real).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body?.convId && body?.name) {
      const updated = await registerHermioneChatEverywhere(body.convId, body.name);
      return NextResponse.json({ ok: true, updated });
    }
    if (body?.neuronId) {
      const added = await backfillHermesChatsToNeuron(body.neuronId);
      return NextResponse.json({ ok: true, added });
    }
    const total = await backfillAllHermesNeurons();
    return NextResponse.json({ ok: true, synced: total });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error al sincronizar chats." },
      { status: 200 },
    );
  }
}
