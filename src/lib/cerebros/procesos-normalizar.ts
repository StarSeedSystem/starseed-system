// Procesos activos del cerebro: normalización de datos de múltiples fuentes a ProcesoActivo[].
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §7.

import { ProcesoActivo, TipoProceso, EstadoProceso } from "./procesos";

export interface ProcesoFuera {
  id: string;
  tipo?: string;
  nombre?: string;
  estado?: string;
  progreso?: number | null;
  donde?: string;
  desde?: number | null;
  detalle?: string;
  fuente: string;
  [key: string]: unknown;
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

function desdeAgentesMac(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const agentes = Array.isArray(r) ? r : (r as Record<string, unknown>)?.agentes;
    if (Array.isArray(agentes)) {
      for (const agente of agentes) {
        if (typeof agente !== "object" || agente === null) continue;
        const obj = agente as Record<string, unknown>;

        const procesos = Array.isArray(obj.procesos) ? obj.procesos : [];
        for (const proc of procesos) {
          const activo = convertToProcesoActivo(proc, "agentes-mac", ahora);
          if (activo) resultados.push(activo);
        }

        if (obj.tipo === "agente" && obj.id) {
          resultados.push({
            id: obj.id as string,
            tipo: "genesis" as TipoProceso,
            nombre: (obj.nombre as string) || "Agente",
            estado: (obj.estado as EstadoProceso) || "en-marcha",
            progreso: null,
            donde: (obj.aplicacion as string) || (obj.servidor as string) || "mac",
            desde: ahora,
            detalle: undefined,
            fuente: "agentes-mac",
          });
        }
      }
    }
  } catch {
  }

  return resultados;
}

function desdeLatidos(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const latidos = Array.isArray(r) ? r : (r as Record<string, unknown>)?.latidos;
    if (Array.isArray(latidos)) {
      for (const latido of latidos) {
        if (typeof latido !== "object" || latido === null) continue;
        const obj = latido as Record<string, unknown>;

        const id = (obj.tarea as string) || (obj.id as string) || "sin-tarea";
        const tipo = (obj.modelo && obj.fase === "en-marcha" ? "genesis" : "servicio") as TipoProceso;
        const nombre = (obj.tarea as string) || (obj.modelo as string) || "Tarea en latido";
        const estado = (obj.fase as EstadoProceso) || "en-marcha";
        const donde = (obj.modelo as string) || (obj.tarea as string) || "mac";
        const desde = (obj.minutos as number) ? (Date.now() - (obj.minutos as number) * 60 * 1000) : (obj.tiempo_inicio ? new Date(obj.tiempo_inicio as string).getTime() : null);
        const detalle = (obj.fase as string) + (obj.modelo ? ` (${obj.modelo})` : "");

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "latidos",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeNodos(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const nodos = Array.isArray(r) ? r : (r as Record<string, unknown>)?.nodos;
    if (Array.isArray(nodos)) {
      for (const nodo of nodos) {
        if (typeof nodo !== "object" || nodo === null) continue;
        const obj = nodo as Record<string, unknown>;

        const id = (obj.id as string) || (obj.nodo as string) || (obj.nombre as string) || "nodo-desconocido";
        const tipo = (obj.tipo as TipoProceso) || (obj.tipo === "mac" || obj.tipo === "a1" || obj.tipo === "neurona" || obj.tipo === "nube" || obj.tipo === "otro" ? obj.tipo as TipoProceso : "servicio");
        const nombre = (obj.nombre as string) || (obj.nodo as string) || "Nodo";
        const estado = (obj.estado === "pedida" ? "esperando" : (obj.estado as EstadoProceso) || "en-marcha");
        const donde = (obj.nodo as string) || (obj.id as string) || "mac";
        const desde = ahora;
        const detalle = (obj.tipo as string) + " en " + donde;

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "nodos",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdePoligenesis(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const historial = (r as Record<string, unknown>)?.historial;
    if (typeof historial === "object" && historial !== null) {
      const ops = Array.isArray(historial.operaciones) ? historial.operaciones : [];
      for (const op of ops) {
        if (typeof op !== "object" || op === null) continue;
        const obj = op as Record<string, unknown>;

        const id = (obj.id as string) || (obj._id as string) || "poligenesis-sin-id";
        const tipo = "poligenesis" as TipoProceso;
        const nombre = (obj.accion as string) || "Propuesta de PoliGenesis";
        const estado = (obj.estado as EstadoProceso) || "esperando";
        const donde = (obj.origen as string) || (obj.cuenta as string) || "poligenesis";
        const desde = (obj.creado_en ? new Date(obj.creado_en as string).getTime() : null);
        const detalle = (obj.accion as string) + " - " + (obj.descripcion as string || "") ;

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "poligenesis",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeSuenos(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const suenos = (r as Record<string, unknown>)?.suenos;
    if (Array.isArray(suenos)) {
      for (const sueno of suenos) {
        if (typeof sueno !== "object" || sueno === null) continue;
        const obj = sueno as Record<string, unknown>;

        const id = (obj.id as string) || (obj.run_id as string) || "sin-id";
        const tipo = "sueno" as TipoProceso;
        const nombre = (obj.titulo as string) || (obj.name as string) || "Sueño sin título";
        const estado = (obj.estado as EstadoProceso) || "esperando";
        const donde = (obj.modelo as string) || (obj.servidor as string) || "mac";
        const desde = (obj.creado_en ? new Date(obj.creado_en as string).getTime() : null);
        const detalle = (obj.estado as string) + " - " + (obj.modelo as string || "");

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "suenos",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeImaginacion(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const imaginacion = (r as Record<string, unknown>)?.imaginacion;
    if (typeof imaginacion === "object" && imaginacion !== null) {
      const ejecuciones = Array.isArray(imaginacion.ejecuciones) ? imaginacion.ejecuciones : [];
      for (const ejec of ejecuciones) {
        if (typeof ejec !== "object" || ejec === null) continue;
        const obj = ejec as Record<string, unknown>;

        const id = (obj.id as string) || (obj.run_id as string) || "sin-id";
        const tipo = "imaginacion" as TipoProceso;
        const nombre = (obj.titulo as string) || (obj.name as string) || "Imaginación sin título";
        const estado = (obj.estado as EstadoProceso) || "esperando";
        const donde = (obj.modelo as string) || (obj.servidor as string) || "mac";
        const desde = (obj.creado_en ? new Date(obj.creado_en as string).getTime() : null);
        const detalle = (obj.estado as string) + " - " + (obj.modelo as string || "");

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "imaginacion",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeInstalaciones(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const instalaciones = (r as Record<string, unknown>)?.instalaciones;
    if (Array.isArray(instalaciones)) {
      for (const inst of instalaciones) {
        if (typeof inst !== "object" || inst === null) continue;
        const obj = inst as Record<string, unknown>;

        const id = (obj.id as string) || (obj.instalacion_id as string) || "sin-id";
        const tipo = (obj.estado === "pedida" ? "descarga" : "instalacion") as TipoProceso;
        const nombre = (obj.nombre as string) || (obj.descripcion as string) || "Instalación";
        const estado = obj.estado === "pedida" ? "esperando" : (obj.estado === "descargada" ? "en-marcha" : (obj.estado as EstadoProceso) || "en-marcha");
        const donde = (obj.aplicacion as string) || (obj.servidor as string) || "mac";
        const desde = (obj.creado_en ? new Date(obj.creado_en as string).getTime() : null);
        const detalle = (obj.estado as string) + " - " + (obj.descripcion as string || "");

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "instalaciones",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeActualizaciones(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const actualizaciones = (r as Record<string, unknown>)?.actualizaciones;
    if (Array.isArray(actualizaciones)) {
      for (const act of actualizaciones) {
        if (typeof act !== "object" || act === null) continue;
        const obj = act as Record<string, unknown>;

        const id = (obj.id as string) || (obj.version as string) || "sin-version";
        const tipo = "actualizacion" as TipoProceso;
        const nombre = (obj.nombre as string) || (obj.descripcion as string) || "Actualización";
        const estado = (obj.estado as EstadoProceso) || "esperando";
        const donde = (obj.aplicacion as string) || (obj.servidor as string) || "mac";
        const desde = (obj.creado_en ? new Date(obj.creado_en as string).getTime() : null);
        const detalle = (obj.version as string) + " - " + (obj.estado as string);

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "actualizaciones",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdeVentanas(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const ventanas = (r as Record<string, unknown>)?.ventanas;
    if (Array.isArray(ventanas)) {
      for (const ventana of ventanas) {
        if (typeof ventana !== "object" || ventana === null) continue;
        const obj = ventana as Record<string, unknown>;

        const id = (obj.id as string) || (obj.ventana_id as string) || "sin-id";
        const tipo = "app-fondo" as TipoProceso;
        const nombre = (obj.titulo as string) || (obj.aplicacion as string) || "Ventana sin título";
        const estado = (obj.minimizada ? "pausado" : "en-marcha") as EstadoProceso;
        const donde = (obj.aplicacion as string) || (obj.servidor as string) || "mac";
        const desde = (obj.minimizada_desde ? new Date(obj.minimizada_desde as string).getTime() : null);
        const detalle = obj.minimizada ? "Minimizada" : undefined;

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "ventanas",
        });
      }
    }
  } catch {
  }

  return resultados;
}

function desdePresencia(r: unknown): ProcesoActivo[] {
  const ahora = Date.now();
  const resultados: ProcesoActivo[] = [];

  try {
    const presencia = (r as Record<string, unknown>)?.presencia;
    if (Array.isArray(presencia)) {
      for (const neurona of presencia) {
        if (typeof neurona !== "object" || neurona === null) continue;
        const obj = neurona as Record<string, unknown>;

        const id = (obj.id as string) || (obj.neurona_id as string) || "sin-id";
        const tipo = "app-fondo" as TipoProceso;
        const nombre = (obj.nombre as string) || (obj.titulo as string) || "Neurona oculta";
        const estado = (obj.visible === false ? "pausado" : "en-marcha") as EstadoProceso;
        const donde = (obj.neurona_id as string) || (obj.device_id as string) || "mac";
        const desde = (obj.oculta_desde ? new Date(obj.oculta_desde as string).getTime() : null);
        const detalle = (obj.visible === false ? "Neurona minimizada o invisible" : "Neurona visible");

        resultados.push({
          id,
          tipo,
          nombre,
          estado,
          progreso: null,
          donde,
          desde,
          detalle,
          fuente: "presencia",
        });
      }
    }
  } catch {
  }

  return resultados;
}

export {
  desdeAgentesMac,
  desdeLatidos,
  desdeNodos,
  desdePoligenesis,
  desdeSuenos,
  desdeImaginacion,
  desdeInstalaciones,
  desdeActualizaciones,
  desdeVentanas,
  desdePresencia,
};
