import { NextResponse } from "next/server";
import {
  decidirConNeedle,
  zonaDeConfianza,
  type HerramientaNeedle,
} from "@/lib/astraura/needle3-client";
import { planDeDecision, decidirConJev, type RespuestaJev } from "@/lib/astraura/decision-hibrida";
import { type Astraura158Target } from "@/lib/astraura/astraura-158-client";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      consulta?: string;
      herramientas?: HerramientaNeedle[];
      target?: Astraura158Target;
    };
    if (!body.consulta || !Array.isArray(body.herramientas)) {
      return NextResponse.json(
        { ok: false, error: "Consulta y herramientas requeridas" },
        { status: 400 }
      );
    }

    const target = body.target ?? "nube";
    const apiKey = process.env.OPENROUTER_API_KEY;

    // Capa 1: Needle 3 local / nube
    const t0 = Date.now();
    const needleRes = await decidirConNeedle(target, body.consulta, body.herramientas);
    const msNeedle = Date.now() - t0;

    const zona = zonaDeConfianza(needleRes);
    let jevRes: RespuestaJev | null = null;
    let msJev: number | undefined = undefined;

    // Capa 2: Jev (solo si Needle escaló y hay clave en el servidor)
    if (zona === "escalar" && apiKey) {
      const t1 = Date.now();
      jevRes = await decidirConJev(body.consulta, body.herramientas, apiKey);
      msJev = Date.now() - t1;
    }

    // Plan híbrido final
    const plan = planDeDecision(needleRes, jevRes);

    return NextResponse.json({
      ok: true,
      plan,
      capas: {
        needle: {
          ms: msNeedle,
          confianza: needleRes.confianza,
          zona,
          ok: needleRes.ok,
        },
        jev: msJev !== undefined ? {
          ms: msJev,
          probabilidad: jevRes?.probabilidad ?? null,
          ok: jevRes?.ok ?? false,
        } : null,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
