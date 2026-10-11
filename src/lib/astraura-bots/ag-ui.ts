/** AG-UI · lector puro de eventos de bots invitados (BOT1011M). MIT, sin `@ag-ui/core`. */
import { validarAccion, type AccionBot, TIPOS_ACCION } from "./acciones";

export interface EstadoAgUi {
  textoPorMensaje: Record<string, string>; llamadasHerramienta: Record<string, { nombre: string; argsRaw: string; argsParseado?: object }>;
  textoCompleto: string; llamadasCompletas: number; textoTotalChars: number; argumentosTotalChars: number;
  eventosDesconocidos: number; errores: string[]; estadoDesincronizado: boolean; snapshot?: unknown;
}
export const ESTADO_AG_UI_VACIO: EstadoAgUi = { textoPorMensaje: {}, llamadasHerramienta: {}, textoCompleto: "", llamadasCompletas: 0, textoTotalChars: 0, argumentosTotalChars: 0, eventosDesconocidos: 0, errores: [], estadoDesincronizado: false };

const MAX_TEXTO = 20000, MAX_ARG = 20000, MAX_LLAMADAS = 50;

function norm(n: string): string { return n.toLowerCase().replace(/_([a-z])/g, (_, p) => p.toUpperCase()).replace(/^([a-z])/, (m, p) => p.toLowerCase()); }
function coincide(ev: unknown, ...pascal: string[]): boolean { const r = (ev && typeof ev === "object" ? (ev as Record<string, unknown>).type ?? (ev as Record<string, unknown>).tipo : null); return typeof r === "string" && pascal.some((pc) => norm(String(r)) === norm(pc)); }

export function reducirEventos(estado: EstadoAgUi, evento: unknown): EstadoAgUi {
  const n = { ...estado, errores: [...estado.errores], eventosDesconocidos: estado.eventosDesconocidos };

  if (coincide(evento, "RUN_STARTED", "RunStarted")) return { ...n, errores: [] };
  if (coincide(evento, "RUN_FINISHED", "RunFinished")) return n;
  if (coincide(evento, "RUN_ERROR", "RunError")) { const msg = (evento && typeof evento === "object" ? String((evento as Record<string, unknown>).message ?? "Error de ejecución") : "Error de ejecución"); return { ...n, errores: [...n.errores, msg] }; }

  if (coincide(evento, "TEXT_MESSAGE_START", "TextMessageStart")) { const id = String((evento as Record<string, unknown>).messageId ?? ""); if (id && !n.textoPorMensaje[id]) n.textoPorMensaje = { ...n.textoPorMensaje, [id]: "" }; return n; }
  if (coincide(evento, "TEXT_MESSAGE_CONTENT", "TextMessageContent")) { const id = String((evento as Record<string, unknown>).messageId ?? ""); const d = String((evento as Record<string, unknown>).delta ?? ""); if (!id) return n; const a = (n.textoPorMensaje[id] ?? "") + d; if (a.length > MAX_TEXTO) n.errores.push(`Texto excede límite (${MAX_TEXTO}): truncado`); n.textoPorMensaje = { ...n.textoPorMensaje, [id]: a.slice(0, MAX_TEXTO) }; n.textoTotalChars += d.length; return n; }
  if (coincide(evento, "TEXT_MESSAGE_END", "TextMessageEnd")) { const id = String((evento as Record<string, unknown>).messageId ?? ""); if (!id) return n; n.textoCompleto = (n.textoCompleto ? n.textoCompleto + "\n" : "") + (n.textoPorMensaje[id] ?? ""); return n; }

  if (coincide(evento, "TOOL_CALL_START", "ToolCallStart")) { const tc = String((evento as Record<string, unknown>).toolCallId ?? ""); const nom = String((evento as Record<string, unknown>).toolCallName ?? ""); if (!tc) return n; if (Object.keys(n.llamadasHerramienta).length >= MAX_LLAMADAS) { n.errores.push("Límite de llamadas a herramientas excedido"); return n; } n.llamadasHerramienta = { ...n.llamadasHerramienta, [tc]: { nombre: nom, argsRaw: "" } }; return n; }
  if (coincide(evento, "TOOL_CALL_ARGS", "ToolCallArgs")) { const tc = String((evento as Record<string, unknown>).toolCallId ?? ""); const d = String((evento as Record<string, unknown>).delta ?? ""); if (!tc) return n; const e = n.llamadasHerramienta[tc]; if (!e) return n; const ac = e.argsRaw + d; if (ac.length > MAX_ARG) n.errores.push(`Argumentos exceden límite (${MAX_ARG}): truncado para ${tc}`); n.llamadasHerramienta = { ...n.llamadasHerramienta, [tc]: { ...e, argsRaw: ac.slice(0, MAX_ARG) } }; n.argumentosTotalChars += d.length; return n; }
  if (coincide(evento, "TOOL_CALL_END", "ToolCallEnd")) { const tc = String((evento as Record<string, unknown>).toolCallId ?? ""); if (!tc) return n; const e = n.llamadasHerramienta[tc]; if (!e) return n; let p: object | undefined; try { p = JSON.parse(e.argsRaw); } catch { p = undefined; } n.llamadasHerramienta = { ...n.llamadasHerramienta, [tc]: { ...e, argsParseado: p } }; return n; }
  if (coincide(evento, "TOOL_CALL_RESULT", "ToolCallResult")) { const tc = String((evento as Record<string, unknown>).toolCallId ?? ""); const c = String((evento as Record<string, unknown>).content ?? ""); if (tc && c) n.textoCompleto = (n.textoCompleto ? n.textoCompleto + "\n" : "") + `[resultado ${tc}]: ${c}`; return n; }

  if (coincide(evento, "STATE_SNAPSHOT", "StateSnapshot")) { const s = (evento as Record<string, unknown>).snapshot ?? (evento as Record<string, unknown>).state ?? (evento as Record<string, unknown>).value ?? evento; return { ...n, snapshot: s, estadoDesincronizado: false, errores: n.errores.filter((e) => !e.includes("desincronizado")) }; }
  if (coincide(evento, "STATE_DELTA", "StateDelta")) {
    const delta = (evento as Record<string, unknown>).delta ?? (evento as Record<string, unknown>).patch ?? (evento as Record<string, unknown>).operations ?? [];
    const ops = Array.isArray(delta) ? delta : [];
    const snapActual: Record<string, unknown> = (n.snapshot && typeof n.snapshot === "object" && n.snapshot !== null) ? { ...n.snapshot as Record<string, unknown> } : {};
    let des = false;
    for (const op of ops) {
      if (typeof op !== "object" || op === null) { des = true; continue; }
      const o = op as Record<string, unknown>; const tipo = String(o.op ?? ""); const rutaRaw = String(o.path ?? o.route ?? o.key ?? ""); const ruta = rutaRaw.replace(/^\//, "").split("/").filter(Boolean); const val = o.value ?? o.val ?? o.to ?? undefined;
      if (tipo === "add" || tipo === "replace") {
        if (ruta.length === 1) (snapActual as Record<string, unknown>)[ruta[0]] = val;
        else if (ruta.length <= 3) { try { let t: Record<string, unknown> = snapActual as Record<string, unknown>; for (let i = 0; i < ruta.length - 1; i++) { const k = ruta[i]; if (t[k] === undefined || typeof t[k] !== "object" || t[k] === null) t[k] = {}; t = t[k] as Record<string, unknown>; } t[ruta[ruta.length - 1]] = val; } catch { des = true; } } else { des = true; }
      } else if (tipo === "remove") {
        if (ruta.length === 1) delete (snapActual as Record<string, unknown>)[ruta[0]];
        else if (ruta.length <= 3) { try { let t: Record<string, unknown> = snapActual as Record<string, unknown>; for (let i = 0; i < ruta.length - 1; i++) { const k = ruta[i]; if (typeof t[k] !== "object" || t[k] === null) { des = true; break; } t = t[k] as Record<string, unknown>; } if (!des) delete t[ruta[ruta.length - 1]]; } catch { des = true; } } else { des = true; }
      } else { des = true; }
    }
    if (des) n.errores.push("Estado desincronizado: operación de delta no aplicable; se solicita instantánea.");
    return { ...n, snapshot: snapActual, estadoDesincronizado: des };
  }

  if (coincide(evento, "STEP_STARTED", "StepStarted") || coincide(evento, "STEP_FINISHED", "StepFinished")) return n;
  if (coincide(evento, "ACTIVITY_SNAPSHOT", "ActivitySnapshot") || coincide(evento, "ACTIVITY_DELTA", "ActivityDelta") || coincide(evento, "REASONING_START", "ReasoningStart") || coincide(evento, "REASONING_END", "ReasoningEnd")) return n;

  n.eventosDesconocidos++;
  return n;
}

export function llamadasComoPropuestas(estado: EstadoAgUi): { acciones: AccionBot[]; problemas: string[] } {
  const acciones: AccionBot[] = []; const problemas: string[] = [];
  for (const [tc, ent] of Object.entries(estado.llamadasHerramienta)) {
    if (!ent.nombre) { problemas.push(`Herramienta sin nombre para ${tc}`); continue; }
    const tipoCoincide = (TIPOS_ACCION as readonly string[]).includes(ent.nombre);
    if (!tipoCoincide) { problemas.push(`Herramienta no disponible para invitados: ${ent.nombre}`); continue; }
    let argsObj: Record<string, unknown> = {};
    if (ent.argsParseado && typeof ent.argsParseado === "object" && ent.argsParseado !== null) argsObj = ent.argsParseado as Record<string, unknown>;
    else if (ent.argsRaw.trim()) { try { argsObj = JSON.parse(ent.argsRaw) as Record<string, unknown>; } catch { problemas.push(`Argumentos rotos para ${ent.nombre} (${tc}): no es JSON válido`); continue; } }
    const v = validarAccion({ tipo: ent.nombre, args: argsObj });
    if (v.accion) acciones.push(v.accion);
    problemas.push(...v.problemas);
  }
  return { acciones, problemas };
}
