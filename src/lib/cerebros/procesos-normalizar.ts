// Procesos activos: normaliza cada fuente real a ProcesoActivo[].
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.
import { CAPAS_ORDEN, NOMBRE_CAPA } from "@/lib/actualizaciones/manifiesto";
import type { EstadoProceso, ProcesoActivo, TipoProceso } from "./procesos";

type Registro = Record<string, unknown>;
const reg = (v: unknown): Registro | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Registro) : null;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const epoca = (v: unknown): number | null => {
  const n = num(v);
  if (n !== null) return n > 0 && n < 1e12 ? n * 1000 : n;
  const s = txt(v);
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : null;
};
const prog = (v: unknown, cien = false): number | null => {
  const n = num(v);
  if (n === null) return null;
  const x = cien ? n / 100 : n;
  return x >= 0 && x <= 1 ? Math.round(x * 1000) / 1000 : null;
};
const estado = (v: unknown, def: EstadoProceso): EstadoProceso => {
  const s = (txt(v) ?? "").toLowerCase();
  if (/en-marcha|en marcha|activ|running|escrib|analiz|instaland|descargand/.test(s)) return "en-marcha";
  if (/esperand|pendient|pedida|propuest|abiert|votaci|scheduled|pending/.test(s)) return "esperando";
  if (/pausad|paused|minimiz|segundo plano/.test(s)) return "pausado";
  if (/falland|fallo|error|failed|rechaz/.test(s)) return "fallando";
  return def;
};
function p(id: string, tipo: TipoProceso, nombre: string, estado: EstadoProceso, donde: string,
  fuente: string, extra: Partial<ProcesoActivo> = {}): ProcesoActivo {
  return { id, tipo, nombre, estado, progreso: null, donde, desde: null, ...extra, fuente };
}

export function unirProcesos(...listas: ProcesoActivo[][]): ProcesoActivo[] {
  const vistos = new Set<string>();
  const todos: ProcesoActivo[] = [];
  for (const l of listas) for (const x of l) {
    if (vistos.has(x.id)) continue;
    vistos.add(x.id);
    todos.push(x);
  }
  return todos.sort((a, b) => Number(b.estado === "en-marcha") - Number(a.estado === "en-marcha"));
}

export type ProcesosPorTipo = Partial<Record<TipoProceso, ProcesoActivo[]>>;

export function agruparPorTipo(procesos: ProcesoActivo[]): ProcesosPorTipo {
  const grupos: ProcesosPorTipo = {};
  for (const x of procesos) (grupos[x.tipo] ??= []).push(x);
  return grupos;
}

/** `/api/mando/agentes`: sesiones activas y procesos vivos de agente/orquestador. */
export function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  const o = reg(r) ?? {};
  const fuente = "/api/mando/agentes";
  const salida: ProcesoActivo[] = [];
  for (const c of lista(o.sesiones)) {
    const s = reg(c);
    const id = txt(s?.id);
    if (!s || s.activa !== true || !id) continue;
    const detalle = [txt(s.medio), txt(s.modelo), txt(s.rama)].filter(Boolean).join(" · ");
    salida.push(p(`agente:${id}`, "genesis", txt(s.titulo) ?? id, "en-marcha", "esta Mac", fuente,
      { desde: epoca(s.inicio), detalle: detalle || undefined }));
  }
  for (const c of lista(o.procesos)) {
    const x = reg(c);
    const tipo = txt(x?.tipo);
    const pid = num(x?.pid);
    if (!x || pid === null || (tipo !== "agente" && tipo !== "orquestador")) continue;
    salida.push(p(`proceso:${pid}`, "genesis", txt(x.detalle) ?? `${tipo} ${pid}`, "en-marcha",
      "esta Mac", fuente, { desde: epoca(x.desde), detalle: tipo }));
  }
  return salida;
}

/** `/api/mando/medidores`: cada latido vivo con su tarea, fase, modelo y minutos. */
export function desdeLatidos(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  const salida: ProcesoActivo[] = [];
  for (const c of o ? lista(o.latidos) : lista(r)) {
    const l = reg(c);
    const tarea = txt(l?.tarea);
    if (!l || !tarea) continue;
    const fase = txt(l.fase) ?? "en marcha";
    const minutos = num(l.minutos);
    const detalle = [fase, txt(l.modelo), minutos !== null ? `${minutos} min` : null].filter(Boolean).join(" · ");
    salida.push(p(`latido:${tarea}`, "genesis", txt(l.titulo) ?? tarea, estado(fase, "en-marcha"),
      txt(l.donde) ?? "sin medida", "/api/mando/medidores", { detalle }));
  }
  return salida;
}

/** `leerEstadoAutonomo()`: un Genesis por orquestador de cada nodo vivo. */
export function desdeNodos(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  if (!o || o.ok === false) return [];
  const estadoNodos = reg(o.estado) ?? o;
  const salida: ProcesoActivo[] = [];
  for (const c of lista(estadoNodos.nodos)) {
    const n = reg(c);
    const nodo = txt(n?.nodo);
    if (!n || !nodo || n.vivo !== true) continue;
    const detalle = [txt(n.etiqueta), txt(n.medio)].filter(Boolean).join(" · ");
    for (const cola of lista(n.orquestadores)) {
      const nombre = txt(cola);
      if (nombre) salida.push(p(`nodo:${nodo}:${nombre}`, "genesis", nombre, "en-marcha", nodo,
        "leerEstadoAutonomo()", { detalle: detalle || undefined }));
    }
  }
  return salida;
}

/** `leerHistorial()` (operaciones en propuesta) y las propuestas abiertas de mis entidades. */
export function desdePoligenesis(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  if (!o) return [];
  const salida: ProcesoActivo[] = [];
  for (const c of lista(o.entradas)) {
    const e = reg(c);
    const id = txt(e?.id);
    if (!e || !id || txt(e.estado) !== "propuesta") continue;
    salida.push(p(`propuesta:${id}`, "poligenesis", txt(e.titulo) ?? id, "esperando",
      txt(reg(e.ambito)?.tipo) ?? "PoliGenesis", "leerHistorial()",
      { desde: epoca(e.at), detalle: txt(e.resultado) ?? undefined }));
  }
  for (const c of lista(o.propuestas ?? o.lista)) {
    const x = reg(c);
    const id = txt(x?.id);
    const nombre = txt(x?.titulo);
    const bruto = (txt(x?.estado) ?? "").toLowerCase();
    if (!x || !id || !nombre || !/abiert|votaci|pendient|esperand|propuest/.test(bruto)) continue;
    const e = estado(bruto, "esperando");
    salida.push(p(`propuesta:${id}`, "poligenesis", nombre, e, "PoliGenesis", "propuestasDe()",
      { desde: epoca(x.creada), detalle: txt(x.problema) ?? undefined }));
  }
  return salida;
}

/** `/api/mando/suenos` y `fetchAstraura158DreamStatus`: solo sueños en curso. */
export function desdeSuenos(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  if (!o) return [];
  const fuente = "/api/mando/suenos";
  const sesion = reg((reg(o.datos) ?? o).sesion);
  const salida: ProcesoActivo[] = [];
  const fecha = txt(sesion?.sesion) ?? "sin fecha";
  if (sesion?.orquestadorVivo === true) {
    const cuentas = Object.entries(reg(sesion.cuentas) ?? {}).map(([k, v]) => `${k}: ${num(v) ?? 0}`);
    salida.push(p(`sueno:${fecha}:orquestador`, "sueno", `Sueños profundos · ${fecha}`, "en-marcha",
      "esta Mac", fuente, { detalle: cuentas.join(" · ") || undefined }));
  }
  for (const c of lista(sesion?.filas)) {
    const f = reg(c);
    const bruto = (txt(f?.estado) ?? "").toLowerCase();
    if (!f || (bruto !== "analizando" && bruto !== "pendiente")) continue;
    const e: EstadoProceso = bruto === "analizando" ? "en-marcha" : "esperando";
    const id = txt(f.id) ?? `${txt(f.area) ?? "area"}--${txt(f.lente) ?? "lente"}`;
    const detalle = [txt(f.subfase), txt(f.proveedor)].filter(Boolean).join(" · ");
    salida.push(p(`sueno:${fecha}:${id}`, "sueno", [txt(f.area), txt(f.lente)].filter(Boolean).join(" · ") || id,
      e, "esta Mac", fuente, { detalle: detalle || undefined }));
  }
  const dream = reg(o.dreamStatus) ?? reg(o.data);
  if (dream?.is_dreaming === true) {
    salida.push(p("sueno:astraura", "sueno", "Sueño de Astraura 1.58", "en-marcha", "Astraura 1.58",
      "fetchAstraura158DreamStatus()", { detalle: txt(dream.operation_mode) ?? undefined }));
  }
  return salida;
}

/** `fetchAstraura158ImaginationStatus` y las ejecuciones `imagine_runs` en curso. */
export function desdeImaginacion(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  if (!o) return [];
  const e = reg(o.data) ?? o;
  const sync = reg(e.sync_execution_state);
  const activos = num(e.active_processes_count);
  const salida: ProcesoActivo[] = [];
  if (e.is_dreaming_now === true || (activos !== null && activos > 0) || sync?.is_running === true) {
    const detalle = [activos !== null ? `${activos} procesos` : null, txt(e.next_cycle_formatted)].filter(Boolean);
    salida.push(p("imaginacion:astraura", "imaginacion", "Imaginación de Astraura 1.58", "en-marcha",
      "Astraura 1.58", "fetchAstraura158ImaginationStatus()",
      { progreso: prog(sync?.progress_percent, true), detalle: detalle.join(" · ") || undefined }));
  }
  for (const c of lista(o.runs ?? o.ejecuciones)) {
    const run = reg(c);
    const bruto = txt(run?.status) ?? txt(run?.estado);
    const id = txt(run?.id);
    if (!run || !bruto || !id || !["running", "pending", "paused", "error"].includes(bruto)) continue;
    salida.push(p(`imaginacion:${id}`, "imaginacion", txt(run.title) ?? txt(run.titulo) ?? id,
      estado(bruto, "esperando"), txt(run.server) ?? "sin medida", "imagine_runs",
      { desde: epoca(run.created_at), detalle: txt(run.mode) ?? undefined }));
  }
  return salida;
}

/** `useInstalaciones()`: pedidas (descarga) y descargadas (instalación pendiente). */
export function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  const salida: ProcesoActivo[] = [];
  for (const c of o ? lista(o.instalaciones) : lista(r)) {
    const d = reg(c);
    const id = txt(d?.id);
    const e = txt(d?.estado);
    if (!d || !id || (e !== "pedida" && e !== "descargada")) continue;
    const nombre = txt(d.appNombre) ?? txt(d.appId) ?? "Aplicación";
    const donde = txt(d.neuronaNombre) ?? txt(d.perfilNombre) ?? "esta neurona";
    const detalle = [e, txt(d.medio), txt(d.version)].filter(Boolean).join(" · ");
    salida.push(p(`instalacion:${id}`, e === "pedida" ? "descarga" : "instalacion", nombre,
      e === "pedida" ? "esperando" : "en-marcha", donde, "useInstalaciones()",
      { desde: epoca(d.creada), detalle }));
  }
  return salida;
}

/** `useEstadoActualizaciones()`: una entrada por capa con versión pendiente. */
export function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  if (!o) return [];
  const salida: ProcesoActivo[] = [];
  const añadir = (neuronaId: string, nombre: string, capa: string, tiene: string | null,
    deberia: string, detalle?: string, fallo?: string) => {
    const etiqueta = NOMBRE_CAPA[capa as keyof typeof NOMBRE_CAPA] ?? capa;
    salida.push(p(`actualizacion:${neuronaId}:${capa}`, "actualizacion", `${etiqueta} · ${nombre}`,
      fallo ? "fallando" : "esperando", nombre, "useEstadoActualizaciones()",
      { detalle: detalle ?? `tiene ${tiene ?? "sin medida"} · debería ${deberia}` }));
  };
  for (const c of lista(o.atrasos)) {
    const a = reg(c);
    const capa = txt(a?.capa);
    const nid = txt(a?.neuronaId);
    if (!a || !capa || !nid) continue;
    añadir(nid, txt(a.nombre) ?? nid, capa, txt(a.tiene), txt(a.deberia) ?? "sin medida", txt(a.texto) ?? undefined, txt(a.motivo) ?? undefined);
  }
  const ultima = reg(o.ultima) ?? {};
  for (const c of lista(o.neuronas)) {
    const n = reg(c);
    const nid = txt(n?.neuronaId);
    if (!n || !nid) continue;
    const versiones = reg(n.versiones) ?? {};
    for (const capa of CAPAS_ORDEN) {
      const deberia = txt(ultima[capa]);
      const tiene = txt(versiones[capa]);
      if (!deberia || tiene === deberia) continue;
      añadir(nid, txt(n.nombre) ?? nid, capa, tiene, deberia);
    }
  }
  return salida;
}

/** `readDesktopsSnapshot()`: ventanas minimizadas, una por escritorio. */
export function desdeVentanas(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  const salida: ProcesoActivo[] = [];
  for (const c of o ? lista(o.desktops) : lista(r)) {
    const d = reg(c);
    const nombreEscritorio = txt(d?.name) ?? "Escritorio";
    for (const v of lista(d?.windows)) {
      const w = reg(v);
      const id = txt(w?.id);
      const ref = reg(w?.contentRef);
      if (!w || !id || w.minimized !== true) continue;
      const nombre = txt(ref?.name) ?? txt(ref?.ref) ?? "Ventana minimizada";
      salida.push(p(`ventana:${txt(d?.id) ?? nombreEscritorio}:${id}`, "app-fondo", nombre, "pausado",
        nombreEscritorio, "readDesktopsSnapshot()", { detalle: "Minimizada" }));
    }
  }
  return salida;
}

/** `usePresenciaNeuronas()`: medios abiertos pero no visibles. */
export function desdePresencia(r: unknown): ProcesoActivo[] {
  const o = reg(r);
  const salida: ProcesoActivo[] = [];
  for (const c of o ? lista(o.medios) : lista(r)) {
    const m = reg(c);
    const id = txt(m?.m);
    const neurona = txt(m?.n);
    if (!m || !id || !neurona || m.visible !== false) continue;
    const nombre = txt(m.etiqueta) ?? "Neurona en segundo plano";
    salida.push(p(`presencia:${id}`, "app-fondo", nombre, "pausado", neurona,
      "usePresenciaNeuronas()", { desde: epoca(m.desde), detalle: [txt(m.tipo), txt(m.plataforma)].filter(Boolean).join(" · ") || undefined }));
  }
  return salida;
}
