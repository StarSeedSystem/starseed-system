import { NextResponse } from "next/server";
import {
  backfillAllHermesNeurons,
  backfillHermesChatsToNeuron,
  registerHermioneChatEverywhere,
  listHermioneConversations,
} from "@/lib/aurora/hermione-server";

/**
 * GET /api/neurons/hermione/sync-chats
 * Índice de conversaciones de Hermione de la cuenta (para reflejarlo en los
 * cerebros: `syncHermioneToBrainMemories` lo consume). Devuelve {convId, name}[].
 */
export async function GET() {
  try {
    const conversations = await listHermioneConversations();
    return NextResponse.json({ ok: true, conversations });
  } catch (e) {
    return NextResponse.json(
      { ok: false, conversations: [], error: e instanceof Error ? e.message : "Error al listar chats." },
      { status: 200 },
    );
  }
}

/**
 * POST /api/neurons/hermione/sync-chats
 * Sincronización por chat de Hermione (Adenda 70 · ampliada 74):
 *   · { index: true } → devuelve el ÍNDICE de chats de Hermione (para el cerebro).
 *   · { convId, name } → registra ese chat en TODAS las neuronas (en tiempo real).
 *   · { neuronId } → BACKFILL de todos los chats a esa neurona (cuando recupera
 *     señal o se instala Hermes).
 *   · sin body → BACKFILL de TODOS los chats de Hermione a TODAS las neuronas.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body?.index === true) {
      const conversations = await listHermioneConversations();
      return NextResponse.json({ ok: true, conversations });
    }
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
