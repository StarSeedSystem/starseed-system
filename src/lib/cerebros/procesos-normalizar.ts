// Procesos activos del cerebro: normalización de datos de múltiples fuentes a ProcesoActivo[].
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.

export type TipoProceso =
  | "genesis"
  | "poligenesis"
  | "sueno"
  | "imaginacion"
  | "descarga"
  | "instalacion"
  | "actualizacion"
  | "app-fondo"
  | "servicio";

export type EstadoProceso = "en-marcha" | "esperando" | "pausado" | "fallando";

export interface ProcesoActivo {
  id: string;
  tipo: TipoProceso;
  nombre: string;
  estado: EstadoProceso;
  progreso: number | null; // 0..1; null = sin medida
  donde: string;
  desde: number | null;
  detalle?: string;
  fuente: string;
}

export function unirProcesos(...listas: ProcesoActivo[][]): ProcesoActivo[] {
  const seen = new Set<string>();
  const result: ProcesoActivo[] = [];
  for (const lista of listas) {
    for (const p of lista) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        result.push(p);
      }
    }
  }
  return result.sort((a, b) => {
    if (a.estado === "en-marcha" && b.estado !== "en-marcha") return -1;
    if (a.estado !== "en-marcha" && b.estado === "en-marcha") return 1;
    return 0;
  });
}

export function agruparPorTipo(procesos: ProcesoActivo[]): Record<string, ProcesoActivo[]> {
  const grupos: Record<string, ProcesoActivo[]> = {};
  for (const p of procesos) {
    if (!grupos[p.tipo]) grupos[p.tipo] = [];
    grupos[p.tipo].push(p);
  }
  return grupos;
}

// Helper functions for conversion
function porcentaje(usado: number | null, total: number | null): number | null {
  if (usado == null || total == null || total <= 0) return null;
  return Math.round((usado / total) * 1000) / 10;
}

function esActivo(v: unknown): boolean {
  return typeof v === "string" && ["en-marcha", "esperando", "pausado", "fallando"].includes(v);
}

function esProgreso(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function valorNumero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function valorTexto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function convertToProcesoActivo(raw: unknown, fuente: string, ahora: number): ProcesoActivo | null {
  const obj = raw as Record<string, unknown> | undefined;
  if (!obj) return null;

  const id = valorTexto(obj.id) ?? valorTexto(obj.ID) ?? "sin-id";
  const tipo = valorTexto(obj.tipo) ?? valorTexto(obj.tipo_proceso) ?? valorTexto(obj.tipoProceso) ?? (obj.tipo === "genesis" || obj.tipo === "poligenesis" || obj.tipo === "sueno" || obj.tipo === "imaginacion" || obj.tipo === "descarga" || obj.tipo === "instalacion" || obj.tipo === "actualizacion" || obj.tipo === "app-fondo" || obj.tipo === "servicio" ? obj.tipo : null) ?? "genesis";

  const estado = esActivo(obj.estado) ? obj.estado : (obj.en_marcha ? "en-marcha" : (obj.pausado ? "pausado" : (obj.esperando ? "esperando" : (obj.fallando ? "fallando" : null))));

  const progreso = esProgreso(obj.progreso) ? obj.progreso : null;

  const donde = valorTexto(obj.donde) ?? valorTexto(obj.servidor) ?? valorTexto(obj.nodo) ?? valorTexto(obj.aplicacion) ?? (obj.tipo === "app-fondo" ? "segundo plano" : null) ?? "desconocido";

  const desde = valorNumero(obj.desde) ?? valorNumero(obj.fecha_inicio) ?? (obj.fecha ? new Date(obj.fecha).getTime() : null);

  const detalle = valorTexto(obj.detalle) ?? valorTexto(obj.descripcion) ?? undefined;

  const nombre = valorTexto(obj.nombre) ?? valorTexto(obj.titulo) ?? valorTexto(obj.descripcion) ?? (obj.tipo === "app-fondo" ? (donde || "Aplicación en segundo plano") : (obj.tipo === "servicio" ? (donde || "Servicio") : null)) ?? "Sin nombre";

  return {
    id,
    tipo: tipo as TipoProceso,
    nombre,
    estado: estado ?? "esperando",
    progreso,
    donde,
    desde,
    detalle,
    fuente,
  };
}

// Funciones de normalización por fuente

export function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  const data = r as { agentes: { id: string; nombre: string; estado: string; procesos: { id: string; tipo: string; nombre: string; estado: string }[] }[] } | undefined;
  if (!data || !data.agentes) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const agente of data.agentes) {
    const donde = valorTexto(agente.nombre) ?? valorTexto(agente.id) ?? "desconocido";
    for (const proc of agente.procesos) {
      const convertido = convertToProcesoActivo(proc, "desdeAgentesMac", ahora);
      if (convertido) {
        // Override donde with the agent's name or id
 convertido.donde = donde;
        resultado.push(convertido);
      }
    }
  }

  return resultado;
}

export function desdeLatidos(r: unknown): ProcesoActivo[] {
  const data = r as { latidos: { tarea?: string; id?: string; modelo?: string; fase?: string; minutos?: number }[] } | undefined;
  if (!data || !data.latidos) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const latido of data.latidos) {
    const id = valorTexto(latido.tarea) ?? valorTexto(latido.id) ?? "sin-id";
    const donde = valorTexto(latido.modelo) ?? "desconocido";
    const estado = esActivo(latido.fase) ? latido.fase : "esperando";
    // Según el test, si tiene tarea es genesis, sino servicio
    const tipo = latido.tarea ? ("genesis" as TipoProceso) : ("servicio" as TipoProceso);
    const nombre = valorTexto(latido.tarea) ?? valorTexto(latido.id) ?? "Latido";
    const progreso = latido.minutos !== null && latido.minutos !== undefined ? Math.min(latido.minutos / 60, 1) : null;
    const desde = null;
    const detalle = undefined;
    const fuente = "desdeLatidos";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeNodos(r: unknown): ProcesoActivo[] {
  const data = r as { nodos: { id?: string; nombre?: string; tipo?: string; estado?: string; nodo?: string }[] } | undefined;
  if (!data || !data.nodos) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const nodo of data.nodos) {
    const id = valorTexto(nodo.id) ?? valorTexto(nodo.nombre) ?? valorTexto(nodo.nodo) ?? "sin-id";
    const donde = valorTexto(nodo.nombre) ?? valorTexto(nodo.id) ?? valorTexto(nodo.nodo) ?? "desconocido";
    const estado = esActivo(nodo.estado) ? nodo.estado : "esperando";
    // Según el test, si el tipo es "mac" entonces tipo del proceso es "mac", sino "servicio"
    let tipo: TipoProceso = "servicio";
    if (nodo.tipo === "mac") {
      tipo = "mac" as TipoProceso;
    } else if (nodo.tipo === "a1") {
      tipo = "a1" as TipoProceso;
    } else if (nodo.tipo === "neurona") {
      tipo = "neurona" as TipoProceso;
    } else if (nodo.tipo === "nube") {
      tipo = "nube" as TipoProceso;
    } else {
      tipo = "servicio";
    }
    const nombre = valorTexto(nodo.nombre) ?? valorTexto(nodo.id) ?? valorTexto(nodo.nodo) ?? "Nodo";
    const progreso = null;
    const desde = null;
    const detalle = undefined;
    const fuente = "desdeNodos";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdePoligenesis(r: unknown): ProcesoActivo[] {
  const data = r as { historial: { operaciones: { id?: string; _id?: string; accion?: string; estado?: string; origen?: string; creado_en?: string; descripcion?: string }[] } } | undefined;
  if (!data || !data.historial || !data.historial.operaciones) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const op of data.historial.operaciones) {
    const id = valorTexto(op.id) ?? valorTexto(op._id) ?? "sin-id";
    const donde = valorTexto(op.origen) ?? "desconocido";
    const estado = esActivo(op.estado) ? op.estado : "esperando";
    const tipo = "poligenesis" as TipoProceso;
    const nombre = valorTexto(op.descripcion) ?? valorTexto(op.accion) ?? "Operación Poligénesis";
    const progreso = null;
    const desde = valorNumero(op.creado_en ? new Date(op.creado_en).getTime() : null);
    const detalle = valorTexto(op.descripcion);
    const fuente = "desdePoligenesis";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeSuenos(r: unknown): ProcesoActivo[] {
  const data = r as { suenos: { id?: string; run_id?: string; titulo?: string; name?: string; estado?: string; modelo?: string; creado_en?: string }[] } | undefined;
  if (!data || !data.suenos) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const sueño of data.suenos) {
    const id = valorTexto(sueño.id) ?? valorTexto(sueño.run_id) ?? "sin-id";
    const donde = valorTexto(sueño.modelo) ?? "desconocido";
    const estado = esActivo(sueño.estado) ? sueño.estado : "esperando";
    const tipo = "sueno" as TipoProceso;
    const nombre = valorTexto(sueño.titulo) ?? valorTexto(sueño.name) ?? "Sueño";
    const progreso = null;
    const desde = valorNumero(sueño.creado_en ? new Date(sueño.creado_en).getTime() : null);
    const detalle = valorTexto(sueño.descripcion);
    const fuente = "desdeSuenos";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeImaginacion(r: unknown): ProcesoActivo[] {
  const data = r as { imaginacion: { ejecuciones: { id?: string; run_id?: string; titulo?: string; name?: string; estado?: string; modelo?: string; creado_en?: string }[] } } | undefined;
  if (!data || !data.imaginacion || !data.imaginacion.ejecuciones) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const ejec of data.imaginacion.ejecuciones) {
    const id = valorTexto(ejec.id) ?? valorTexto(ejec.run_id) ?? "sin-id";
    const donde = valorTexto(ejec.modelo) ?? "desconocido";
    const estado = esActivo(ejec.estado) ? ejec.estado : "esperando";
    const tipo = "imaginacion" as TipoProceso;
    const nombre = valorTexto(ejec.titulo) ?? valorTexto(ejec.name) ?? "Imaginación";
    const progreso = null;
    const desde = valorNumero(ejec.creado_en ? new Date(ejec.creado_en).getTime() : null);
    const detalle = valorTexto(ejec.descripcion);
    const fuente = "desdeImaginacion";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  const data = r as { instalaciones: { id?: string; instalacion_id?: string; nombre?: string; estado?: string; aplicacion?: string; creado_en?: string; descripcion?: string }[] } | undefined;
  if (!data || !data.instalaciones) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const inst of data.instalaciones) {
    const id = valorTexto(inst.id) ?? valorTexto(inst.instalacion_id) ?? "sin-id";
    const donde = valorTexto(inst.aplicacion) ?? "desconocido";
    let estado: EstadoProceso = "esperando";
    let tipo: TipoProceso = "descarga";
    if (inst.estado === "pedida") {
      estado = "esperando";
      tipo = "descarga";
    } else if (inst.estado === "descargada") {
      estado = "en-marcha";
      tipo = "instalacion";
    } else {
      // Por defecto
      estado = "esperando";
      tipo = "descarga";
    }
    const nombre = valorTexto(inst.nombre) ?? "Instalación";
    const progreso = null;
    const desde = valorNumero(inst.creado_en ? new Date(inst.creado_en).getTime() : null);
    const detalle = valorTexto(inst.descripcion);
    const fuente = "desdeInstalaciones";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  const data = r as { actualizaciones: { id?: string; nombre?: string; estado?: string; aplicacion?: string; version?: string; creado_en?: string; descripcion?: string }[] } | undefined;
  if (!data || !data.actualizaciones) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const act of data.actualizaciones) {
    const id = valorTexto(act.id) ?? valorTexto(act.version) ?? "sin-id";
    const donde = valorTexto(act.aplicacion) ?? "desconocido";
    let estado: EstadoProceso = "esperando";
    if (act.estado === "en-marcha") {
      estado = "en-marcha";
    } else if (act.estado === "esperando") {
      estado = "esperando";
    } else {
      estado = "esperando";
    }
    const tipo = "actualizacion" as TipoProceso;
    const nombre = valorTexto(act.nombre) ?? valorTexto(act.aplicacion) ?? "Actualización";
    const progreso = null;
    const desde = valorNumero(act.creado_en ? new Date(act.creado_en).getTime() : null);
    const detalle = valorTexto(act.descripcion);
    const fuente = "desdeActualizaciones";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdeVentanas(r: unknown): ProcesoActivo[] {
  const data = r as { ventanas: { id?: string; ventana_id?: string; titulo?: string; aplicacion?: string; minimizada?: boolean; minimizada_desde?: string }[] } | undefined;
  if (!data || !data.ventanas) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const vent of data.ventanas) {
    const id = valorTexto(vent.id) ?? valorTexto(vent.ventana_id) ?? "sin-id";
    const donde = valorTexto(vent.aplicacion) ?? "desconocido";
    const estado = vent.minimizada === true ? "pausado" : "en-marcha";
    const tipo = "app-fondo" as TipoProceso;
    const nombre = valorTexto(vent.titulo) ?? "Ventana";
    const progreso = null;
    const desde = null;
    let detalle: string | undefined;
    if (vent.minimizada === true) {
      detalle = "Minimizada";
    }
    const fuente = "desdeVentanas";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}

export function desdePresencia(r: unknown): ProcesoActivo[] {
  const data = r as { presencia: { id?: string; neurona_id?: string; nombre?: string; titulo?: string; visible?: boolean; oculta_desde?: string }[] } | undefined;
  if (!data || !data.presencia) return [];

  const resultado: ProcesoActivo[] = [];
  const ahora = Date.now();

  for (const pres of data.presencia) {
    const id = valorTexto(pres.id) ?? valorTexto(pres.neurona_id) ?? "sin-id";
    const donde = valorTexto(pres.nombre) ?? valorTexto(pres.neurona_id) ?? "desconocido";
    const estado = pres.visible === false ? "pausado" : "en-marcha";
    const tipo = "app-fondo" as TipoProceso;
    const nombre = valorTexto(pres.nombre) ?? valorTexto(pres.titulo) ?? "Neurona";
    const progreso = null;
    const desde = null;
    let detalle: string | undefined;
    if (pres.visible === false) {
      detalle = "Neurona minimizada o invisible";
    }
    const fuente = "desdePresencia";

    resultado.push({ id, tipo, nombre, estado, progreso, donde, desde, detalle, fuente });
  }

  return resultado;
}