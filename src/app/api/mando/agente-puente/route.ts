import "server-only";
import { guardianMando } from "@/lib/mando/guardian";
import { construirBriefing, contextoPorPalabras, crearChat, guardarChat, leerChat, extraerAcciones, type ChatMando } from "@/lib/mando/asistente";
import { listarModelos, llamarModelo } from "@/lib/mando/modelos-disponibles";
import { cadenaDeRespaldo } from "@/lib/mando/respaldo-chat";
import { ordenarCandidatos, type InformePasarela } from "@/lib/mando/asistente-rutas";
import { construirMensajeSistema, construirTurnoModelo, sanearContexto, type FuenteContexto, type MensajeAgentePuente } from "@/lib/mando/agente-puente";
import { convertirInformePasarelas } from "@/lib/mando/pasarelas-lector";
import { createClient } from "@/utils/supabase/server";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function statYLeer(filepath: string, maxChars = 16_000): Promise<{ contenido: string; mtimeMs: number }> {
  try {
    const st = await stat(filepath);
    const contenido = await readFile(filepath, "utf-8");
    return { contenido: contenido.slice(0, maxChars), mtimeMs: st.mtimeMs };
  } catch {
    return { contenido: "", mtimeMs: 0 };
  }
}

async function comprobarDueno(): Promise<"si" | "no" | "error"> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const mensaje = error.message.toLowerCase();
      return error.status === 401 || /session|token|jwt/.test(mensaje) ? "no" : "error";
    }
    const dueno = (process.env.STARSEED_DUENO || "maggasukha@star.seed").toLowerCase();
    return data.user?.email?.toLowerCase() === dueno ? "si" : "no";
  } catch {
    return "error";
  }
}

export async function POST(peticion: Request): Promise<Response> {
  const veto = await guardianMando(peticion);
  if (veto) return veto;
  const acceso = await comprobarDueno();
  if (acceso === "error") return Response.json({ ok: false, error: "No se pudo comprobar la identidad." }, { status: 503 });
  // El 404 es deliberado: a terceros no se les confirma que el agente privado existe.
  if (acceso === "no") return new Response("Not Found", { status: 404 });

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await peticion.json()) as Record<string, unknown>; } catch { return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 }); }
  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
  if (!mensaje) return Response.json({ ok: false, error: "Falta el mensaje." }, { status: 400 });

  const chatId = typeof cuerpo.chatId === "string" ? cuerpo.chatId : "";
  const modeloPedido = typeof cuerpo.modelo === "string" && cuerpo.modelo.includes("/") ? cuerpo.modelo : "";

  let chat: ChatMando | null = null;
  if (chatId) { try { chat = await leerChat(chatId); } catch { chat = null; } }
  if (!chat) {
    try {
      chat = await crearChat(mensaje.slice(0, 60), modeloPedido || "automático");
    } catch {
      return Response.json({ ok: false, error: "No se pudo abrir el chat." }, { status: 503 });
    }
  }

  const ahoraMs = Date.now();
  const [briefing, memorias, puenteMd, workflowMd, informeArchivo] = await Promise.all([
    construirBriefing().catch(() => ""),
    contextoPorPalabras(mensaje).catch(() => ""),
    statYLeer(path.join(process.cwd(), "PUENTE-DE-MANDO.md")),
    statYLeer(path.join(process.cwd(), "memory", "workflow-actual.md")),
    statYLeer(path.join(homedir(), ".starseed", "pasarelas-informe.json"), 200_000),
  ]);
  let informe: InformePasarela | null = null;
  try { informe = JSON.parse(informeArchivo.contenido) as InformePasarela; } catch { /* informe ausente */ }
  const pasarelasSeguras = convertirInformePasarelas(informe, ahoraMs);

  const fuentes: FuenteContexto[] = [
    { nombre: "estado y medidores vivos", contenido: briefing, fechaMs: ahoraMs, maxEdadMinutos: 30 },
    { nombre: "método del Puente", contenido: puenteMd.contenido, fechaMs: puenteMd.mtimeMs, maxEdadMinutos: 180 },
    { nombre: "workflow operativo", contenido: workflowMd.contenido, fechaMs: workflowMd.mtimeMs, maxEdadMinutos: 1440 },
    { nombre: "pasarelas", contenido: JSON.stringify(pasarelasSeguras), fechaMs: informeArchivo.mtimeMs, maxEdadMinutos: 360 },
    { nombre: "memorias pertinentes", contenido: memorias, fechaMs: ahoraMs, maxEdadMinutos: 120 },
  ];
  const sistema = construirMensajeSistema(fuentes, ahoraMs);

  const catalogo = await listarModelos().catch(() => []);
  const candidatos = ordenarCandidatos(catalogo, informe, ahoraMs).filter((m) => m.gratis !== false);
  const modeloBase = candidatos.some((m) => m.id === modeloPedido)
    ? modeloPedido : candidatos[0]?.id ?? "nim/moonshotai/kimi-k3";
  const cadena = cadenaDeRespaldo(modeloBase, candidatos, 4);
  const historial: MensajeAgentePuente[] = chat.mensajes.slice(-12).map((m) => ({
    rol: m.rol === "asistente" ? "assistant" : "user", texto: m.texto,
  }));
  const turno = construirTurnoModelo(sistema, historial, mensaje);

  let r: Awaited<ReturnType<typeof llamarModelo>> | null = null;
  let modeloUsado = modeloBase;
  for (const [i, cand] of cadena.entries()) {
    try {
      r = await llamarModelo(cand, turno, { timeoutMs: i === 0 ? 120000 : 45000 });
      modeloUsado = cand;
      break;
    } catch { /* reintentar */ }
  }
  if (!r) return Response.json({ ok: false, error: "Ningún modelo respondió." }, { status: 502, headers: { "Cache-Control": "no-store" } });

  const respuestaTexto = sanearContexto(r.texto || "(sin respuesta)");
  const acciones = extraerAcciones(respuestaTexto);
  let guardado = true;
  try {
    chat.mensajes.push({ rol: "usuario", texto: mensaje, t: new Date().toISOString() });
    chat.mensajes.push({ rol: "asistente", texto: respuestaTexto, t: new Date().toISOString(), modelo: modeloUsado, tokens: r.tokens, latenciaMs: r.latenciaMs });
    await guardarChat(chat);
  } catch { guardado = false; }
  return Response.json({ ok: guardado, chatId: chat.id, titulo: chat.titulo, respuesta: respuestaTexto,
    modelo: modeloUsado, acciones, ...(guardado ? {} : { error: "La respuesta no pudo guardarse." }) },
    { headers: { "Cache-Control": "no-store" } });
}
