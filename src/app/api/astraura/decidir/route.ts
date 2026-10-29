import { NextResponse } from "next/server";
import {
  decidirConNeedle,
  zonaDeConfianza,
  type HerramientaNeedle,
  type DecisionNeedle,
} from "@/lib/astraura/needle3-client";
import {
  UMBRAL_LAYA_EJECUTAR,
  decidirConJev,
  decidirConLaya,
  decidirHabilidad,
  decidirTipoDiagrama,
  esPeticionDeDiagrama,
  planDeDecision,
  type RespuestaHabilidadLaya,
  type RespuestaJev,
  type RespuestaLaya,
  type RespuestaTipoDiagrama,
} from "@/lib/astraura/decision-hibrida";
import { esConsultaDePato, decidirConNeedlePato } from "@/lib/astraura/needle-pato";
import { type Astraura158Target } from "@/lib/astraura/astraura-158-client";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      consulta?: string;
      herramientas?: HerramientaNeedle[];
      target?: Astraura158Target;
      /** Capa que va a responder (elegir-habilidad.ts): con ella Laya también elige qué habilidad aplica. */
      capa?: string;
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
     let needleRes: DecisionNeedle;
     let msNeedle: number;
    
    if (esConsultaDePato(body.consulta)) {
      // Para consultas relacionadas con el pato, usar el modelo afinado de needle-duck
      const t0Pato = Date.now();
      needleRes = await decidirConNeedlePato(body.consulta, {
        sistema: undefined,
        maxPasos: undefined,
        enDispositivo: undefined,
        timeoutDispositivoMs: undefined
      });
      msNeedle = Date.now() - t0Pato;
    } else {
      // Para otras consultas, usar el modelo estándar de needle
      needleRes = await decidirConNeedle(target, body.consulta, body.herramientas);
      msNeedle = Date.now() - t0;
    }

    const zona = zonaDeConfianza(needleRes);
    let layaRes: RespuestaLaya | null = null;
    let msLaya: number | undefined = undefined;
    let jevRes: RespuestaJev | null = null;
    let msJev: number | undefined = undefined;

    // Capa 2: Laya local (solo si Needle escaló)
    if (zona === "escalar") {
      const t1 = Date.now();
      layaRes = await decidirConLaya(body.consulta, body.herramientas);
      msLaya = Date.now() - t1;
    }

    // Capa 2b: si la petición pide un diagrama, Laya elige el tipo entre los 45
    // (architecture/diagramas.md §3.1); falla en silencio como el resto de capas.
    let tipoRes: RespuestaTipoDiagrama | null = null;
    let msTipo: number | undefined = undefined;
    if (esPeticionDeDiagrama(body.consulta)) {
      const t3 = Date.now();
      tipoRes = await decidirTipoDiagrama(body.consulta);
      msTipo = Date.now() - t3;
    }

    // Capa 2c: habilidades de ingeniería (architecture/laya-y-habilidades.md
    // §4-§5). Solo si quien llama declara la capa que va a responder: ahí es
    // donde sabe el tamaño, y `bloqueHabilidad` hace el resto. Sin capa no se
    // pregunta (y nunca bloquea la primera palabra de una conversación: este
    // endpoint es de decisiones, no está en el camino del primer token).
    let habilidadRes: RespuestaHabilidadLaya | null = null;
    let msHabilidad: number | undefined = undefined;
    if (body.capa) {
      const t4 = Date.now();
      habilidadRes = await decidirHabilidad(body.consulta, body.capa);
      msHabilidad = Date.now() - t4;
    }

    // Capa 3: Jev (solo si Laya no decidió y hay clave en el servidor)
    if (zona === "escalar" && (!layaRes || layaRes.confianza < UMBRAL_LAYA_EJECUTAR) && apiKey) {
      const t2 = Date.now();
      jevRes = await decidirConJev(body.consulta, body.herramientas, apiKey);
      msJev = Date.now() - t2;
    }

    // Plan híbrido final
    const plan = planDeDecision(needleRes, layaRes, jevRes);

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
        laya: msLaya !== undefined ? {
          ms: msLaya,
          confianza: layaRes?.confianza ?? null,
          ok: layaRes !== null,
        } : null,
        jev: msJev !== undefined ? {
          ms: msJev,
          probabilidad: jevRes?.probabilidad ?? null,
          ok: jevRes?.ok ?? false,
        } : null,
        tipo: msTipo !== undefined ? {
          ms: msTipo,
          tipo: tipoRes?.tipo ?? null,
          confianza: tipoRes?.confianza ?? null,
          ok: tipoRes !== null,
        } : null,
        habilidad: msHabilidad !== undefined ? {
          ms: msHabilidad,
          habilidad: habilidadRes?.habilidad ?? null,
          tamano: habilidadRes?.tamano ?? null,
          texto: habilidadRes?.texto ?? null,
          ok: habilidadRes !== null,
        } : null,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
