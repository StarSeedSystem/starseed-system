import { NextResponse } from "next/server";
import {
  syncCapabilitiesToAllHermesNeurons,
  gatherAuroraCapabilitiesForHermes,
  installCapabilitiesOnNeuron,
} from "@/lib/aurora/hermione-server";

/**
 * POST /api/neurons/hermione/sync-capabilities
 * Sincroniza TODAS las habilidades y conexiones de Aurora (capacidades de
 * Astraura) a cada neurona con Hermes instalado, para que tengan las MISMAS
 * capacidades del OS y las cuentas, sincronizadas.
 * Body opcional: { neuronId?: string } — si se da, sincroniza solo esa neurona.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const neuronId = body?.neuronId as string | undefined;
    if (neuronId) {
      const caps = gatherAuroraCapabilitiesForHermes();
      const ok = await installCapabilitiesOnNeuron(neuronId, caps);
      return NextResponse.json({ ok, updated: ok ? 1 : 0 });
    }
    const updated = await syncCapabilitiesToAllHermesNeurons();
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error al sincronizar capacidades." },
      { status: 200 },
    );
  }
}
