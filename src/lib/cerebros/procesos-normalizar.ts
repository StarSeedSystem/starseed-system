// Procesos activos del cerebro: normaliza cada fuente a ProcesoActivo[] (puro).
// Contrato: architecture/cerebros-fusion-telepatia.md §7.
import type { EstadoProceso, ProcesoActivo, TipoProceso } from "./procesos";
type Obj = Record<string, unknown>; const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v), lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ms = (v: unknown): number | null => { const n = num(v); if (n !== null) return n; const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const p = (id: string, tipo: TipoProceso, nombre: string, estado: EstadoProceso, donde: string, fuente: string, extra: Partial<ProcesoActivo> = {}): ProcesoActivo => ({ id, tipo, nombre, estado, progreso: null, donde, desde: null, fuente, ...extra });
const ESTADOS: Record<string, EstadoProceso> = { "en-marcha": "en-marcha", escribiendo: "en-marcha", pensando: "en-marcha", analizando: "en-marcha", trabajando: "en-marcha", revisando: "en-marcha", running: "en-marcha", en_curso: "en-marcha", commit: "en-marcha", esperando: "esperando", pendiente: "esperando", encolada: "esperando", bloqueada: "esperando", pending: "esperando", pausado: "pausado", pausa: "pausado", paused: "pausado", interrumpida: "pausado", fallando: "fallando", fallo: "fallando", error: "fallando", failed: "fallando" };
const estadoDe = (v: unknown): EstadoProceso => ESTADOS[String(v ?? "").toLowerCase()] ?? "esperando";
const TERMINALES = new Set(["executed", "applied", "deshecha", "rejected", "rechazada", "cancelled", "cancelada", "failed", "fallida"]), SUENO_ESTADO: Record<string, EstadoProceso> = { pendiente: "esperando", analizando: "en-marcha", informe: "esperando", fallo: "fallando", interrumpida: "pausado" };
export function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, sesiones = lista(o.sesiones).flatMap((x): ProcesoActivo[] => {
    const s = esObj(x) ? x : {}, id = txt(s.id); if (s.activa !== true || !id) return [];
    const detalle = [txt(s.modelo), txt(s.ultimaAccion), txt(s.rama) && `rama ${txt(s.rama)}`].filter(Boolean).join(" · ");
    return [p(`agente:${id}`, "genesis", txt(s.titulo) ?? id, "en-marcha", txt(s.medio) ?? "sin medida", "/api/mando/agentes", { desde: ms(s.inicio), ...(detalle ? { detalle } : {}) })];
  });
  const procesos = lista(o.procesos).flatMap((x): ProcesoActivo[] => {
    const v = esObj(x) ? x : {}, tipo = txt(v.tipo), pid = num(v.pid);
    if ((tipo !== "agente" && tipo !== "orquestador") || pid === null) return [];
    return [p(`proceso:${pid}`, "genesis", txt(v.detalle) ?? `${tipo} ${pid}`, "en-marcha", "Esta Mac", "/api/mando/agentes", { desde: ms(v.desde), detalle: tipo })];
  });
  return [...sesiones, ...procesos];
}
export function desdeLatidos(r: unknown, ahora = Date.now()): ProcesoActivo[] {
  const latidos = Array.isArray(r) ? r : esObj(r) ? lista(r.latidos) : [];
  return latidos.flatMap((x): ProcesoActivo[] => {
    const l = esObj(x) ? x : {}, tarea = txt(l.tarea); if (!tarea) return [];
    const minutos = num(l.minutos), modelo = txt(l.modelo), detalle = [modelo && `modelo ${modelo}`, minutos !== null ? `${minutos} min` : "tiempo sin medida"].join(" · ");
    return [p(`latido:${tarea}`, "genesis", txt(l.titulo) ?? tarea, estadoDe(l.fase), txt(l.donde) ?? "sin medida", "/api/mando/medidores", { ...(minutos !== null ? { desde: ahora - minutos * 60_000 } : {}), detalle })];
  });
}
export function desdeNodos(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, estado = esObj(o.estado) ? o.estado : o, nodos = Array.isArray(r) ? r : lista(estado.nodos);
  return nodos.flatMap((x): ProcesoActivo[] => {
    const n = esObj(x) ? x : {}, nodo = txt(n.nodo) ?? txt(n.id); if (n.vivo !== true || !nodo) return [];
    return lista(n.orquestadores).flatMap((q): ProcesoActivo[] => { const nombre = txt(q); return nombre ? [p(`nodo:${nodo}:${nombre}`, "genesis", nombre, "en-marcha", nodo, "leerEstadoAutonomo")] : []; });
  });
}
export function desdePoligenesis(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, candidatos = [...(Array.isArray(r) ? r : []), ...lista(o.entradas), ...lista(o.operaciones), ...lista(o.lista), ...lista(o.propuestas)];
  return candidatos.flatMap((x): ProcesoActivo[] => {
    const v = esObj(x) ? x : {}, id = txt(v.id) ?? txt(v.propuestaId), est = (txt(v.estado) ?? "").toLowerCase(), esEntrada = v.ambito !== undefined || v.operacion !== undefined;
    if (!id || (esEntrada && est !== "propuesta") || (!esEntrada && TERMINALES.has(est))) return [];
    const ambito = esObj(v.ambito) ? v.ambito : {}, entidad = esObj(ambito.entidad) ? ambito.entidad : {};
    const donde = txt(entidad.nombre) ?? "PoliGenesis", detalle = est === "passed" ? "aprobada, falta aplicarla" : "en votación";
    return [p(`poligenesis:${id}`, "poligenesis", txt(v.titulo) ?? txt(v.title) ?? id, "esperando", donde, esEntrada ? "leerHistorial" : "propuestasDe", { desde: ms(v.at) ?? ms(v.creada), detalle })];
  });
}
export function desdeSuenos(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, datos = esObj(o.datos) ? o.datos : o, sesion = esObj(datos.sesion) ? datos.sesion : {};
  const filas = lista(sesion.filas).flatMap((x): ProcesoActivo[] => {
    const f = esObj(x) ? x : {}, id = txt(f.id), est = (txt(f.estado) ?? "").toLowerCase();
    if (!id || !(est in SUENO_ESTADO)) return [];
    const detalle = [txt(f.subfase), txt(f.modelo) && `modelo ${txt(f.modelo)}`, txt(sesion.sesion)].filter(Boolean).join(" · ");
    return [p(`sueno:${id}`, "sueno", [txt(f.area), txt(f.lente)].filter(Boolean).join(" · ") || id, SUENO_ESTADO[est], "Esta Mac", "/api/mando/suenos", { desde: ms(sesion.sesion), ...(detalle ? { detalle } : {}) })];
  });
  const astraura = esObj(o.data) ? o.data : o;
  if (o.ok === false || (astraura.is_dreaming !== true && astraura.is_dreaming_now !== true)) return filas;
  const detalle = ["modo " + (txt(astraura.operation_mode) ?? "sin medida"), num(astraura.cycles_completed) !== null ? `${num(astraura.cycles_completed)} ciclos` : null].filter(Boolean).join(" · ");
  return [...filas, p("sueno:astraura", "sueno", "Sueño profundo de Astraura", "en-marcha", "Astraura", "fetchAstraura158DreamStatus", { detalle })];
}
export function desdeImaginacion(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, fuente = esObj(o.imaginacion) ? o.imaginacion : o, status = esObj(fuente.data) ? fuente.data : fuente, out: ProcesoActivo[] = [], activos = num(status.active_processes_count) ?? 0;
  if (fuente.ok !== false && activos > 0) {
    const tipos = lista(status.active_process_types).map(txt).filter((t): t is string => t !== null);
    if (tipos.length) for (const tipo of tipos) out.push(p(`imaginacion:${tipo}`, "imaginacion", `Imaginación · ${tipo}`, "en-marcha", "Astraura", "fetchAstraura158ImaginationStatus"));
    else out.push(p(`imaginacion:${activos}`, "imaginacion", `Imaginación de Astraura · ${activos} procesos`, "en-marcha", "Astraura", "fetchAstraura158ImaginationStatus"));
  }
  for (const x of [...(Array.isArray(r) ? r : []), ...lista(o.runs), ...lista(o.ejecuciones)]) {
    const run = esObj(x) ? x : {}, id = txt(run.id), est = (txt(run.status) ?? "").toLowerCase(), estado = est === "running" ? "en-marcha" : est === "paused" ? "pausado" : est === "pending" ? "esperando" : est === "error" ? "fallando" : null;
    if (id && estado) out.push(p(`imaginacion:${id}`, "imaginacion", txt(run.title) ?? txt(run.titulo) ?? id, estado, txt(run.server) ?? "Aurora", "imagine_runs", { desde: ms(run.created_at), detalle: txt(run.mode) ?? undefined }));
  }
  return out;
}
export function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  return (Array.isArray(r) ? r : esObj(r) ? lista(r.instalaciones) : []).flatMap((x): ProcesoActivo[] => {
    const d = esObj(x) ? x : {}, estado = txt(d.estado), id = txt(d.id); if (!id || (estado !== "pedida" && estado !== "descargada")) return [];
    const detalle = [txt(d.medio), txt(d.archivo), txt(d.pedidaDesde) && `pedida desde ${txt(d.pedidaDesde)}`].filter(Boolean).join(" · ");
    return [p(`instalacion:${id}`, estado === "pedida" ? "descarga" : "instalacion", txt(d.appNombre) ?? id, estado === "pedida" ? "esperando" : "en-marcha", txt(d.neuronaNombre) ?? txt(d.neuronaId) ?? "sin medida", "instalaciones", { desde: ms(d.creada), ...(detalle ? { detalle } : {}) })];
  });
}
export function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  const o = esObj(r) ? r : {}, out: ProcesoActivo[] = [];
  for (const x of [...(Array.isArray(r) ? r : []), ...lista(o.atrasos)]) {
    const a = esObj(x) ? x : {}, neurona = txt(a.nombre) ?? txt(a.neuronaId), capa = txt(a.capa), deberia = txt(a.deberia);
    if (neurona && capa && deberia) out.push(p(`actualizacion:${txt(a.neuronaId) ?? neurona}:${capa}`, "actualizacion", `Actualización de ${capa} en ${neurona}`, "esperando", neurona, "atrasos", { detalle: `${txt(a.tiene) ?? "sin medida"} → ${deberia}` }));
  }
  for (const x of lista(o.fuentes)) {
    const f = esObj(x) ? x : {}, id = txt(f.id), remota = txt(f.remota);
    if (id && remota && txt(f.estado) === "hay-actualizacion") out.push(p(`actualizacion:${id}`, "actualizacion", `Actualización de ${id}`, "esperando", "servidor", "/api/library/actualizaciones", { detalle: `${txt(f.instalada) ?? "sin medida"} → ${remota}` }));
  }
  return out;
}
export function desdeVentanas(r: unknown): ProcesoActivo[] {
  return lista(esObj(r) ? (r as Obj).desktops : []).flatMap((x): ProcesoActivo[] => {
    const d = esObj(x) ? x : {}, escritorio = txt(d.name) ?? txt(d.id) ?? "sin medida";
    return lista(d.windows).flatMap((w): ProcesoActivo[] => {
      const v = esObj(w) ? w : {}, id = txt(v.id); if (v.minimized !== true || !id) return [];
      const ref = esObj(v.contentRef) ? v.contentRef : {}, nombre = txt(ref.name) ?? txt(ref.ref) ?? `Ventana ${id}`;
      return [p(`ventana:${txt(d.id) ?? escritorio}:${id}`, "app-fondo", nombre, "en-marcha", escritorio, "readDesktopsSnapshot", { detalle: txt(ref.type) ?? undefined })];
    });
  });
}
export function desdePresencia(r: unknown): ProcesoActivo[] {
  return (Array.isArray(r) ? r : esObj(r) ? lista(r.medios) : []).flatMap((x): ProcesoActivo[] => {
    const m = esObj(x) ? x : {}, neurona = txt(m.n), idMedio = txt(m.m); if (m.visible !== false || !neurona || !idMedio) return [];
    return [p(`presencia:${neurona}:${idMedio}`, "app-fondo", txt(m.etiqueta) ?? idMedio, "en-marcha", neurona, "usePresenciaNeuronas", { desde: ms(m.desde), detalle: txt(m.tipo) ?? undefined })];
  });
}
export function unirProcesos(...listas: ProcesoActivo[][]): ProcesoActivo[] {
  const vistos = new Set<string>(), todos: ProcesoActivo[] = [];
  for (const lista of listas) for (const pr of lista) { if (vistos.has(pr.id)) continue; vistos.add(pr.id); todos.push(pr); }
  return [...todos.filter((x) => x.estado === "en-marcha"), ...todos.filter((x) => x.estado !== "en-marcha")];
}
export function agruparPorTipo(procesos: ProcesoActivo[]): Partial<Record<TipoProceso, ProcesoActivo[]>> {
  const grupos: Partial<Record<TipoProceso, ProcesoActivo[]>> = {};
  for (const pr of procesos) (grupos[pr.tipo] ??= []).push(pr);
  return grupos;
}
