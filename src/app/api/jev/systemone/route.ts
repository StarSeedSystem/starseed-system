/* src/app/api/jev/systemone/route.ts — contrato Jev, auth por token, límite por token.
   No lleva guardian de /api/mando. Sin claves en código; solo env. */
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { validarPeticion, normalizarPreguntas, formatearRespuesta, decidirAcceso } from "../../../../lib/mando/jev-contrato";

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
    const hijo = spawn("python3", ["scripts/puente/jev.py", "--contrato"], { stdio: ["pipe", "pipe", "pipe"] });
    const inicio = Date.now();
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
