import { NextResponse } from "next/server";
import {
  selectBestFreeModelForHermione,
  type HermioneModelTask,
} from "@/lib/aurora/hermione-server";

/**
 * POST /api/neurons/hermione/select-model
 * Devuelve el mejor modelo :free para una tarea, combinando la librería de
 * modelos gratuitos del OS (OpenRouter :free vivos + fuentes sin clave), las
 * predeterminadas de Astraura, las de la cuenta y el pin de Hermione.
 * Body: { task?: TaskKind, needsVision?: boolean }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const task = (body?.task as HermioneModelTask) || "chat";
    const needsVision = body?.needsVision === true;
    const choice = await selectBestFreeModelForHermione(task, needsVision);
    if (!choice) {
      return NextResponse.json({ ok: false, error: "No hay modelo gratuito disponible." }, { status: 200 });
    }
    return NextResponse.json({ ok: true, choice });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error al seleccionar modelo." },
      { status: 200 },
    );
  }
}
