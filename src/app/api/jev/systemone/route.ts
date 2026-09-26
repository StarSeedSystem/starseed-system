/* src/app/api/jev/systemone/route.ts — contrato Jev, auth por token, límite por token.
   No lleva guardian de /api/mando. Sin claves en código; solo env. */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { validarPeticion, normalizarPreguntas, formatearRespuesta, decidirAcceso, type Peticion, type RespuestaPregunta } from "../../../../lib/mando/jev-contrato";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { destinoNube } from "@/lib/astraura/destino-nube";

/**
 * (G9 · 2026-09-26) Jev por la NUBE cuando este despliegue NO es la propia Mac
 * (`jev.py` hace `spawn("python3", …)`, que solo existe en la máquina de Alex
 * — en Vercel no hay Python que arrancar y Jev quedaba mudo fuera de esa
 * máquina). El backend 1.58 ya expone `POST /api/jev/decidir` (UNA pregunta
 * con sus opciones → `{opcion, probabilidades}`, motor BitNet por n_probs):
 * por cada pregunta `choice`/`score` de la petición se llama una vez y se
 * recompone la MISMA forma que `jev.py` (`formatearRespuesta`), para que el
 * resto del contrato no note el cambio de motor. Las preguntas `noul`
 * (abiertas) no encajan en ese contrato de una sola opción: se dejan sin
 * responder aquí y quien llama cae a su regla determinista — igual que
 * cuando Jev entero no decide. NUNCA se añade una llamada de pago
 * (OpenRouter) desde el navegador: si no hay nube sana, se devuelve
 * `medio: "ninguno"` y punto.
 */
export async function decidirPorNube(norm: Peticion): Promise<RespuestaPregunta[]> {
  const destino = await destinoNube();
  if (!destino) return [];
  const contexto = typeof norm.state === "string" ? norm.state.slice(0, 2000) : JSON.stringify(norm.state).slice(0, 2000);
  const answers: RespuestaPregunta[] = [];
  for (const q of norm.questions) {
    const opciones = q.type === "choice" ? (q.options ?? []) : q.type === "score" ? (q.levels ?? []) : [];
    if (!opciones.length) continue; // "noul" u opciones vacías: sin contrato posible por la nube
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${destino.base}/api/jev/decidir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: q.question, opciones, contexto }),
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { opcion?: unknown; probabilidades?: unknown };
      if (typeof data.opcion !== "string") continue;
      const probs = data.probabilidades && typeof data.probabilidades === "object"
        ? (data.probabilidades as Record<string, number>)
        : {};
      answers.push({
        id: q.id,
        answer: data.opcion,
        probs,
        confidence: typeof probs[data.opcion] === "number" ? probs[data.opcion] : 0,
      });
    } catch {
      /* esta pregunta se queda sin responder; las demás siguen intentándolo */
    } finally {
      clearTimeout(t);
    }
  }
  return answers;
}

export async function POST(req: NextRequest) {
  const tokenEnv = process.env.STARSEED_JEV_TOKEN;
  const cabecera = req.headers.get("x-starseed-jev") ?? undefined;
  const acceso = decidirAcceso(tokenEnv, cabecera);
  if (acceso === "sin-token") return NextResponse.json({ ok: false, error: "jev sin token" }, { status: 503 });
  if (acceso === "no-autorizado") return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  const tokenVal = cabecera!;
  const ahora = Date.now();
  const HIST = (global as unknown as { __jevHist?: Map<string, number[]> }).__jevHist ||= new Map();
  const arr = HIST.get(tokenVal) ?? [];
  const ventana = arr.filter((t: number) => ahora - t < 60000);
  if (ventana.length >= 30) return NextResponse.json({ ok: false, error: "límite de 30/min" }, { status: 429 });
  ventana.push(ahora); HIST.set(tokenVal, ventana);
  try {
    const cuerpo = await req.json();
    const val = validarPeticion(cuerpo);
    if (!val.ok) return NextResponse.json({ ok: false, error: val.error }, { status: 400 });
    const norm = normalizarPreguntas(val.pet);
    const inicio = Date.now();
    // (G9) Fuera de la Mac: nada de `spawn` (no hay Python que arrancar en
    // Vercel). Se decide por la nube; si no hay ninguna respuesta,
    // `formatearRespuesta` ya deja `medio: "ninguno"` y quien llama cae a su
    // regla determinista, exactamente como cuando Jev entero no decide.
    if (!esDespliegueLocal(req)) {
      const answers = await decidirPorNube(norm);
      const ms = Date.now() - inicio;
      return NextResponse.json(formatearRespuesta({ answers }, "nube", ms), { status: 200 });
    }
    const hijo = spawn("python3", ["scripts/puente/jev.py", "--contrato"], { stdio: ["pipe", "pipe", "pipe"] });
    return new Promise<NextResponse>((resolve) => {
      let out = "";
      hijo.stdout.on("data", d => out += d);
      hijo.stdin.write(JSON.stringify(norm));
      hijo.stdin.end();
      const t = setTimeout(() => {
        hijo.kill();
        resolve(NextResponse.json({ ok: false, error: "sin respuesta" }, { status: 200 }));
      }, 15000);
      hijo.on("close", () => {
        clearTimeout(t);
        const ms = Date.now() - inicio;
        try {
          const raw = out ? JSON.parse(out) : {};
          const resp = formatearRespuesta(raw, norm.medio ?? "local", ms);
          resolve(NextResponse.json(resp, { status: 200 }));
        } catch {
          resolve(NextResponse.json({ ok: false, error: "respuesta ilegible" }, { status: 200 }));
        }
      });
    });
  } catch {
    return NextResponse.json({ ok: false, error: "cuerpo inválido" }, { status: 400 });
  }
}
