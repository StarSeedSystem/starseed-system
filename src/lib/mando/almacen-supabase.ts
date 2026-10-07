import { validarTarea, type EventoMando, type MensajeChat, type TareaOla } from "./protocolo";
import type { AlmacenMando, OrdenMando, ProgresoMando, ResultadoOrden } from "./almacen";

export interface RespuestaSupabase<T = unknown> {
  data: T | null;
  error: { message: string } | null;
}
export interface ConsultaSupabase extends PromiseLike<RespuestaSupabase<unknown[]>> {
  select(columnas?: string): ConsultaSupabase;
  eq(columna: string, valor: unknown): ConsultaSupabase;
  gte(columna: string, valor: unknown): ConsultaSupabase;
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaSupabase;
  limit(cantidad: number): ConsultaSupabase;
  upsert(valores: unknown): PromiseLike<RespuestaSupabase<unknown>>;
  update(valores: unknown): ConsultaSupabase;
}
export interface ClienteSupabaseMando {
  from(tabla: string): ConsultaSupabase;
}

const LIMITE_EVENTOS = 500;
const LIMITE_CHAT = 200;

function techo(valor: number | undefined, maximo: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return maximo;
  return Math.max(0, Math.min(maximo, Math.trunc(valor)));
}
function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const listaDeTexto = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
async function consultar(hacer: () => PromiseLike<RespuestaSupabase<unknown[]>>): Promise<Record<string, unknown>[] | null> {
  try {
    const { data, error } = await hacer();
    return error || !Array.isArray(data) ? null : data.filter(esRegistro);
  } catch { return null; }
}
async function ejecutar(hacer: () => PromiseLike<RespuestaSupabase<unknown>>): Promise<ResultadoOrden> {
  try {
    const { error } = await hacer();
    return error ? { ok: false, motivo: error.message } : { ok: true };
  } catch (e) { return { ok: false, motivo: e instanceof Error ? e.message : "error de Supabase" } };
}
function revisar(orden: OrdenMando): ResultadoOrden & { tarea?: TareaOla; id?: string } {
  if (!esRegistro(orden) || !["encolar", "aprobar", "frenar"].includes(String(orden.tipo)))
    return { ok: false, motivo: "tipo de orden inválido" };
  if (!esRegistro(orden.datos)) return { ok: false, motivo: "datos de orden inválidos" };
  if (orden.tipo === "encolar") {
    const v = validarTarea(orden.datos);
    return v.ok && v.valor ? { ok: true, tarea: v.valor } : { ok: false, motivo: v.errores.join("; ") };
  }
  if (orden.tipo === "aprobar" && typeof orden.datos.id !== "string")
    return { ok: false, motivo: "falta el id de la tarea" };
  return { ok: true, id: typeof orden.datos.id === "string" ? orden.datos.id : undefined };
}

function aTarea(f: Record<string, unknown>): TareaOla {
  return { id: texto(f.tarea_id), ola: texto(f.ola), titulo: texto(f.titulo),
    depende: listaDeTexto(f.depende), archivos: listaDeTexto(f.archivos), prompt: texto(f.prompt) };
}
function aEvento(f: Record<string, unknown>): EventoMando {
  return { t: typeof f.t === "string" ? Date.parse(f.t) : 0, tipo: texto(f.tipo),
    tarea: typeof f.tarea === "string" ? f.tarea : undefined, texto: texto(f.texto) };
}
function aMensaje(f: Record<string, unknown>, canal: string): MensajeChat {
  return { canal: texto(f.canal) || canal, autor: texto(f.autor), rol: texto(f.rol), texto: texto(f.texto) };
}

export function crearAlmacenSupabase(cliente: ClienteSupabaseMando, ambitoId: string): AlmacenMando {
  const tareas = () => cliente.from("mando_tareas");
  return {
    tipo: "supabase",
    ambitoId,
    async leerTareas() {
      const datos = await consultar(() => tareas()
        .select("tarea_id,ola,titulo,depende,archivos,prompt").eq("ambito_id", ambitoId));
      return (datos ?? []).map(aTarea);
    },
    async leerProgreso() {
      const datos = await consultar(() => tareas()
        .select("tarea_id,estado,avance").eq("ambito_id", ambitoId));
      const progreso: ProgresoMando = {};
      for (const f of datos ?? []) {
        if (!texto(f.tarea_id)) continue;
        progreso[texto(f.tarea_id)] = { estado: texto(f.estado) || "pendiente",
          ...(typeof f.avance === "number" ? { avance: f.avance } : {}) };
      }
      return progreso;
    },
    async leerEventos(desde, limite) {
      let q = cliente.from("mando_eventos").select("t,tipo,tarea,texto")
        .eq("ambito_id", ambitoId).order("t", { ascending: true })
        .limit(techo(limite, LIMITE_EVENTOS));
      if (desde && desde.trim()) {
        const ms = Number.isFinite(Number(desde)) ? Number(desde) : Date.parse(desde);
        if (Number.isFinite(ms)) q = q.gte("t", new Date(ms).toISOString());
      }
      const datos = await consultar(() => q);
      return (datos ?? []).map(aEvento);
    },
    async leerChat(canal, limite) {
      const datos = await consultar(() => cliente.from("mando_chat")
        .select("canal,autor,rol,texto").eq("ambito_id", ambitoId).eq("canal", canal)
        .order("created_at", { ascending: false }).limit(techo(limite, LIMITE_CHAT)));
      return (datos ?? []).reverse().map((f) => aMensaje(f, canal));
    },
    async leerMedidores() {
      const datos = await consultar(() => cliente.from("mando_medidores")
        .select("doc").eq("ambito_id", ambitoId)
        .order("updated_at", { ascending: false }).limit(1));
      const primera = datos?.[0];
      return primera && "doc" in primera ? primera.doc : null;
    },
    async encolarOrden(orden) {
      const r = revisar(orden);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      const t = r.tarea;
      if (t) {
        return ejecutar(() => tareas().upsert({
          ambito_id: ambitoId, tarea_id: t.id, ola: t.ola, titulo: t.titulo,
          depende: t.depende, archivos: t.archivos, prompt: t.prompt,
          estado: "pendiente",
        }));
      }
      if (orden.tipo === "frenar") {
        return ejecutar(() => cliente.from("mando_ambitos").update({ freno: true }).eq("id", ambitoId));
      }
      return ejecutar(() => tareas().update({ estado: "aprobada" })
        .eq("ambito_id", ambitoId).eq("tarea_id", r.id));
    },
  };
}
