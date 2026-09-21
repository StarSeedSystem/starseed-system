import { guardianMando } from "@/lib/mando/guardian";
import { construirBriefing, contextoPorPalabras, crearChat, guardarChat, leerChat, extraerAcciones, type ChatMando } from "@/lib/mando/asistente";
import { listarModelos, llamarModelo, type MensajeModelo } from "@/lib/mando/modelos-disponibles";
import { cadenaDeRespaldo } from "@/lib/mando/respaldo-chat";
import { ordenarCandidatos, informeVigente, type InformePasarela } from "@/lib/mando/asistente-rutas";
import { comprobarDueno, construirMensajeSistema, type FuenteContexto } from "@/lib/mando/agente-puente";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


async function statYLeer(filepath: string): Promise<{ contenido: string; mtimeMs: number }> {
  try {
    const st = await stat(filepath);
    const contenido = await readFile(filepath, "utf-8");
    return { contenido, mtimeMs: st.mtimeMs };
  } catch {
    return { contenido: "", mtimeMs: 0 };
  }
}

export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  const resDueno = await comprobarDueno(peticion);
  if (!resDueno.ok) return Response.json({ ok: false, error: resDueno.error }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!resDueno.esDueno) return new Response("Not Found", { status: 404 });

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await peticion.json()) as Record<string, unknown>; } catch { return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 }); }
  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
  if (!mensaje) return Response.json({ ok: false, error: "Falta el mensaje." }, { status: 400 });

  const chatId = typeof cuerpo.chatId === "string" ? cuerpo.chatId : "";
  const modeloReq = typeof cuerpo.modelo === "string" && cuerpo.modelo.includes("/") ? cuerpo.modelo : "nim/moonshotai/kimi-k3";

  let chat: ChatMando | null = null;
  let chatError = false;
  if (chatId) { try { chat = await leerChat(chatId); } catch { chat = null; } }
  if (!chat) { try { chat = await crearChat(mensaje.slice(0, 60), modeloReq); } catch { chatError = true; } }

  const [briefing, memorias, puenteMd, workflowMd] = await Promise.all([
    construirBriefing().catch(() => ""),
    contextoPorPalabras(mensaje).catch(() => ""),
    statYLeer(path.join(process.cwd(), "PUENTE-DE-MANDO.md")),
    statYLeer(path.join(process.cwd(), "memory", "workflow-actual.md")),
  ]);

  const fuentes: FuenteContexto[] = [
    { nombre: "puente-de-mando", contenido: puenteMd.contenido, fechaMs: puenteMd.mtimeMs, maxEdadMinutos: 180 },
    { nombre: "workflow-actual", contenido: workflowMd.contenido, fechaMs: workflowMd.mtimeMs, maxEdadMinutos: 1440 },
    { nombre: "briefing-vivo", contenido: briefing, fechaMs: Date.now(), maxEdadMinutos: 30 },
    { nombre: "memorias-relevantes", contenido: memorias, fechaMs: Date.now(), maxEdadMinutos: 120 },
  ];
  const sistema = construirMensajeSistema(fuentes);

  const catalogo = await listarModelos().catch(() => []);
  let candidatos = catalogo;
  try {
    const crudo = await readFile(path.join(homedir(), ".starseed", "pasarelas-informe.json"), "utf-8");
    const inf = JSON.parse(crudo) as InformePasarela;
    if (informeVigente(inf, Date.now())) candidatos = ordenarCandidatos(catalogo, inf, Date.now());
  } catch { /* sin informe */ }

  const cadena = cadenaDeRespaldo(modeloReq, candidatos, 4);
  const historial: MensajeModelo[] = chat?.mensajes ? chat.mensajes.slice(-12).map((m) => ({ rol: m.rol === "asistente" ? "assistant" : "user", texto: m.texto })) : [];
  historial.push({ rol: "user", texto: mensaje });

  let r: Awaited<ReturnType<typeof llamarModelo>> | null = null;
  let modeloUsado = modeloReq;
  for (const [i, cand] of cadena.entries()) {
    try {
      r = await llamarModelo(cand, [{ rol: "system", texto: sistema }, ...historial], { timeoutMs: i === 0 ? 120000 : 45000 });
      modeloUsado = cand;
      break;
    } catch { /* reintentar */ }
  }
  if (!r) return Response.json({ ok: false, error: "Ningún modelo respondió." }, { status: 502, headers: { "Cache-Control": "no-store" } });

  const respuestaTexto = r.texto || "(sin respuesta)";
  const acciones = extraerAcciones(respuestaTexto);
  if (chat) {
    try {
      chat.mensajes.push({ rol: "usuario", texto: mensaje, t: new Date().toISOString() });
      chat.mensajes.push({ rol: "asistente", texto: respuestaTexto, t: new Date().toISOString(), modelo: modeloUsado, tokens: r.tokens, latenciaMs: r.latenciaMs });
      await guardarChat(chat);
    } catch { chatError = true; }
  }

  if (chatError || !chat) {
    return Response.json({ ok: false, error: "no se pudo abrir el chat", respuesta: respuestaTexto, modelo: modeloUsado, acciones }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, chatId: chat.id, titulo: chat.titulo, respuesta: respuestaTexto, modelo: modeloUsado, acciones }, { headers: { "Cache-Control": "no-store" } });
}
