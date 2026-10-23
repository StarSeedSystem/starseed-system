<<<<<<< HEAD
export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };
=======
"use client";

/**
 * Telepatía del cerebro: vínculos purificados y normalizados.
 * Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §5.
 */

import type { Brain } from "@/lib/brains/brains";

export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string } // otro cerebro tuyo
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string } // una entidad
  | { tipo: "cuenta"; id: string }; // cuenta externa (os_vinculos_externos)
>>>>>>> 2f838ded3 (salvavidas · CB1013Gb: trabajo del agente antes de las puertas (tsc / vitest))

export interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
<<<<<<< HEAD
  alcance: {
    completo: boolean;
    memorias: string[];
    carpetas: string[];
    configuraciones: string[];
  };
=======
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
>>>>>>> 2f838ded3 (salvavidas · CB1013Gb: trabajo del agente antes de las puertas (tsc / vitest))
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

<<<<<<< HEAD
export const CONFIGURACIONES_TELEPATIA = ['servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'] as const;

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (v === null || typeof v !== 'object') {
    return { ok: false, motivo: 'Vinculo no es un objeto' };
  }
  const vinculo = v as Record<string, unknown>;

  if (typeof vinculo.id !== 'string' || !vinculo.id.trim()) {
    return { ok: false, motivo: 'Vinculo.id debe ser una cadena no vacía' };
  }

  const destino = vinculo.destino as Record<string, unknown> | undefined;
  if (!destino || typeof destino.tipo !== 'string' || typeof destino.id !== 'string' || !destino.id.trim()) {
    return { ok: false, motivo: 'Destino inválido' };
  }
  const allowedTipos = ['cerebro', 'grupo', 'comunidad', 'pagina', 'cuenta'] as const;
  if (!allowedTipos.some(t => t === destino.tipo)) {
    return { ok: false, motivo: `Destino.tipo no válido: ${destino.tipo}` };
  }

  const alcance = vinculo.alcance as Record<string, unknown> | undefined;
  if (!alcance || typeof alcance.completo !== 'boolean') {
    return { ok: false, motivo: 'Alcance inválido' };
  }
  const memorias = Array.isArray(alcance.memorias) ? alcance.memorias : [];
  const carpetas = Array.isArray(alcance.carpetas) ? alcance.carpetas : [];
  const configuraciones = Array.isArray(alcance.configuraciones) ? alcance.configuraciones : [];
  if (!memorias.every(m => typeof m === 'string') || !carpetas.every(c => typeof c === 'string') || !configuraciones.every(c => typeof c === 'string')) {
    return { ok: false, motivo: 'Alcance contiene elementos no string' };
  }
  if (!alcance.completo && memorias.length === 0 && carpetas.length === 0 && configuraciones.length === 0) {
    return { ok: false, motivo: 'Alcance debe tener al menos un elemento cuando no es completo' };
  }
  for (const conf of configuraciones) {
    if (!CONFIGURACIONES_TELEPATIA.some(c => c === conf)) {
      return { ok: false, motivo: `Configuración no válida en alcance: ${conf}` };
    }
  }

  if (!['enviar', 'recibir', 'ambas'].includes(vinculo.direccion as string)) {
    return { ok: false, motivo: 'Direccion debe ser "enviar", "recibir" o "ambas"' };
  }
  if (!['leer', 'escribir'].includes(vinculo.acceso as string)) {
    return { ok: false, motivo: 'Acceso debe ser "leer" o "escribir"' };
  }
  if (typeof vinculo.auto !== 'boolean') {
    return { ok: false, motivo: 'Auto debe ser booleano' };
  }
  if (!['activo', 'pausado', 'pendiente'].includes(vinculo.estado as string)) {
    return { ok: false, motivo: 'Estado debe ser "activo", "pausado" o "pendiente"' };
  }

  const esISO = (fecha: unknown) => typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(fecha);
  if (!esISO(vinculo.creadoEn)) {
    return { ok: false, motivo: 'Fecha de creación debe ser una cadena ISO válida' };
  }
  if (vinculo.expiraEn !== undefined && vinculo.expiraEn !== null && !esISO(vinculo.expiraEn)) {
    return { ok: false, motivo: 'Fecha de caducidad debe ser ISO o null' };
  }
  if (vinculo.ultimaSync !== undefined && vinculo.ultimaSync !== null && !esISO(vinculo.ultimaSync)) {
    return { ok: false, motivo: 'Ultima sincronizacion debe ser ISO o null' };
  }

  return { ok: true, vinculo: v as VinculoTelepatico };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== 'object') return [];
  const lista = (config as Record<string, unknown>).telepatia;
  if (!Array.isArray(lista)) return [];
  const validos: VinculoTelepatico[] = [];
  for (const item of lista) {
    const r = validarVinculo(item);
    if (r.ok) validos.push(r.vinculo);
  }
  return validos;
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  const nuevo = { ...config };
  const existentesRaw = (config as Record<string, unknown>).telepatia;
  const existentes = Array.isArray(existentesRaw) ? [...existentesRaw] : [];
  const idx = existentes.findIndex((x) => {
    if (!x || typeof x !== 'object') return false;
    const r = x as Record<string, unknown>;
    return r.id === v.id;
  });
  if (idx >= 0) {
    existentes[idx] = v;
  } else {
    existentes.push(v);
  }
  nuevo.telepatia = existentes;
  return nuevo;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  const nuevo = { ...config };
  const existentesRaw = (config as Record<string, unknown>).telepatia;
  const existentes = Array.isArray(existentesRaw) ? existentesRaw : [];
  nuevo.telepatia = existentes.filter((x) => {
    if (!x || typeof x !== 'object') return true;
    const r = x as Record<string, unknown>;
    return r.id !== id;
  });
  return nuevo;
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  if (!v.expiraEn) return false;
  const ts = Date.parse(v.expiraEn);
  if (Number.isNaN(ts)) return false;
  return ahora >= ts;
}

export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (v.estado !== 'activo') return [];
  if (estaCaducado(v, Date.now())) return [];

  const allowedOrigenADestino = v.direccion === 'enviar' || v.direccion === 'ambas';
  const allowedDestinoAOrigen = (v.direccion === 'recibir' || v.direccion === 'ambas') && v.acceso !== 'leer';

  const ops: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];

  const nombresArchivos = v.alcance.completo
    ? Array.from(new Set([...origen.archivos.map(a => a.name), ...destino.archivos.map(a => a.name)]))
    : v.alcance.memorias;

  const mapArchivo = (arr: typeof origen.archivos) => new Map(arr.map(a => [a.name, a]));
  const orMap = mapArchivo(origen.archivos);
  const deMap = mapArchivo(destino.archivos);

  const parseTs = (s?: string | null) => {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  for (const nombre of nombresArchivos) {
    const orF = orMap.get(nombre);
    const deF = deMap.get(nombre);
    if (orF && !deF) {
      if (allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
    } else if (!orF && deF) {
      if (allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
    } else if (orF && deF) {
      const tOr = parseTs(orF.updated_at);
      const tDe = parseTs(deF.updated_at);
      if (tOr === null && tDe !== null) {
        if (allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
      } else if (tDe === null && tOr !== null) {
        if (allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
      } else if (tOr !== null && tDe !== null) {
        if (tOr > tDe && allowedOrigenADestino) ops.push({ tipo: 'archivo', nombre, de: 'origen', a: 'destino' });
        else if (tDe > tOr && allowedDestinoAOrigen) ops.push({ tipo: 'archivo', nombre, de: 'destino', a: 'origen' });
      }
    }
  }

  for (const carpeta of v.alcance.carpetas) {
    if (allowedOrigenADestino) ops.push({ tipo: 'carpeta', nombre: carpeta, de: 'origen', a: 'destino' });
    if (allowedDestinoAOrigen) ops.push({ tipo: 'carpeta', nombre: carpeta, de: 'destino', a: 'origen' });
  }

  const configs = v.alcance.completo
    ? [...CONFIGURACIONES_TELEPATIA]
    : v.alcance.configuraciones;

  for (const cfg of configs) {
    const orVal = origen.prefs[cfg];
    const deVal = destino.prefs[cfg];
    if (orVal !== undefined && deVal === undefined) {
      if (allowedOrigenADestino) ops.push({ tipo: 'config', nombre: cfg, de: 'origen', a: 'destino' });
    } else if (deVal !== undefined && orVal === undefined) {
      if (allowedDestinoAOrigen) ops.push({ tipo: 'config', nombre: cfg, de: 'destino', a: 'origen' });
    }
  }

  return ops;
}
=======
/** Obtiene vínculos telepáticos de un cerebro (lectura defensiva). */
export function obtenerVinculos(cerebro: Brain): VinculoTelepatico[] {
  const raw = ((cerebro?.config as Record<string, unknown>)?.telepatia as VinculoTelepatico[]) ?? [];
  return raw.filter((v) => v && typeof v === "object");
}

/** Normaliza un vínculo sin mutar el original; descarta lo inválido. */
export function normalizarVinculo(v: unknown): VinculoTelepatico | null {
  if (!v || typeof v !== "object") return null;
  const vo = v as Record<string, unknown>;
  const id = String(vo.id);
  if (!id) return null;
  const tipo = String(vo.tipo);
  if (!["cerebro", "grupo", "comunidad", "pagina", "cuenta"].includes(tipo)) return null;
  const destino: DestinoTelepatia = { tipo: tipo as "cerebro" | "grupo" | "comunidad" | "pagina" | "cuenta", id: String(vo.idDestino || vo.id) };
  const alcance = vo.alcance as Partial<{ completo: boolean; memorias: unknown[]; carpetas: unknown[]; configuraciones: unknown[] }>;
  const memorias = Array.isArray(alcance?.memorias) ? alcance.memorias.filter((m) => typeof m === "string") : [];
  const carpetas = Array.isArray(alcance?.carpetas) ? alcance.carpetas.filter((c) => typeof c === "string") : [];
  const configuraciones = Array.isArray(alcance?.configuraciones) ? alcance.configuraciones.filter((c) => typeof c === "string") : [];
  const direccion = ["enviar", "recibir", "ambas"].includes(String(vo.direccion)) ? String(vo.direccion) as "enviar" | "recibir" | "ambas" : "ambas";
  const acceso = ["leer", "escribir"].includes(String(vo.acceso)) ? String(vo.acceso) as "leer" | "escribir" : "leer";
  const auto = Boolean(vo.auto);
  const estado = ["activo", "pausado", "pendiente"].includes(String(vo.estado)) ? String(vo.estado) as "activo" | "pausado" | "pendiente" : "activo";
  const creadoEn = String(vo.creadoEn || new Date().toISOString());
  const expiraEn = vo.expiraEn ? (typeof vo.expiraEn === "string" ? vo.expiraEn : null) : null;
  const ultimaSync = vo.ultimaSync ? (typeof vo.ultimaSync === "string" ? vo.ultimaSync : null) : null;
  return { id, destino, alcance: { completo: Boolean(vo.completo) || false, memorias, carpetas, configuraciones }, direccion, acceso, auto, estado, creadoEn, expiraEn, ultimaSync };
}

/** Normaliza una lista de vínculos; descarta lo inválido. */
export function normalizarVinculos(lista: unknown[]): VinculoTelepatico[] {
  return lista.map(normalizarVinculo).filter((v): v is VinculoTelepatico => v !== null);
}

/** Valida que el destino exista y el cerebro tenga permiso. Retorna [] si no válido. */
export function validarVinculo(
  vinculo: VinculoTelepatico,
  todosLosCerebros: Brain[],
  entidades?: { id: string; tipo: string; nombre: string }[],
): string[] {
  const errores: string[] = [];
  switch (vinculo.destino.tipo) {
    case "cerebro": {
      const existe = todosLosCerebros.some((c) => c.id === vinculo.destino.id);
      if (!existe) errores.push(`El cerebro con id ${vinculo.destino.id} no existe`);
      break;
    }
    case "grupo":
    case "comunidad":
    case "pagina": {
      if (!entidades?.some((e) => e.id === vinculo.destino.id && e.tipo === vinculo.destino.tipo)) {
        errores.push(`La entidad ${vinculo.destino.tipo} con id ${vinculo.destino.id} no existe`);
      }
      break;
    }
    case "cuenta": {
      if (!vinculo.destino.id || typeof vinculo.destino.id !== "string") {
        errores.push("La cuenta debe tener un id");
      }
      break;
    }
  }
  if (!vinculo.alcance.completo) {
    if (vinculo.alcance.memorias.some((m) => typeof m !== "string" || !m.trim())) errores.push("Una memoria no válida");
    if (vinculo.alcance.carpetas.some((c) => typeof c !== "string" || !c.trim())) errores.push("Una carpeta no válida");
    if (vinculo.alcance.configuraciones.some((c) => typeof c !== "string" || !c.trim())) errores.push("Una configuración no válida");
  }
  if (!["enviar", "recibir", "ambas"].includes(vinculo.direccion)) errores.push("Dirección no válida");
  if (!["leer", "escribir"].includes(vinculo.acceso)) errores.push("Acceso no válido");
  if (typeof vinculo.auto !== "boolean") errores.push("Auto no booleano");
  if (!["activo", "pausado", "pendiente"].includes(vinculo.estado)) errores.push("Estado no válido");
  if (!vinculo.creadoEn) errores.push("Falta creadoEn");
  if (vinculo.expiraEn && typeof vinculo.expiraEn !== "string") errores.push("ExpiraEn no válido");
  if (vinculo.ultimaSync && typeof vinculo.ultimaSync !== "string") errores.push("UltimaSync no válida");
  return errores;
}

/** Plan de sincronización: operaciones puras de origen a destino respetando dirección/acceso. */
export interface OperacionSincronizacion {
  tipo: "archivo" | "config";
  nombre: string;
  de: string;
  a: string;
}

export function planSincronizacion(
  vinculo: VinculoTelepatico,
  origen: Brain,
  destino: Brain,
  archivos: { id: string; name: string; actualizadoEn?: string; meta?: Record<string, unknown> }[],
): OperacionSincronizacion[] {
  const plan: OperacionSincronizacion[] = [];
  const destinoId = destino.id;
  const origenId = origen.id;
  if (vinculo.direccion === "enviar" && vinculo.acceso === "leer" && origen.id === destinoId) {
    return [];
  }
  if (vinculo.direccion === "recibir" && vinculo.acceso === "escribir" && origen.id === destinoId) {
    return [];
  }
  const actualizacionesDeOrigen = (archivos.filter((a) => a.actualizadoEn && new Date(a.actualizadoEn) > new Date()) || []);
  for (const actual of actualizacionesDeOrigen) {
    if (!vinculo.almacenadoCompletamente(actual.name)) continue;
    const de = `${origenId}/${actual.name}`;
    const a = `${destinoId}/${actual.name}`;
    if (vinculo.meta?.telepatia === vinculo.id) {
      continue;
    }
    plan.push({ tipo: "archivo", nombre: actual.name, de, a });
  }
  for (const cfg of vinculo.almacenadoCompletamenteConfiguraciones()) {
    const de = `${origenId}/config/${cfg}`;
    const a = `${destinoId}/config/${cfg}`;
    plan.push({ tipo: "config", nombre: cfg, de, a });
  }
  return plan;
}

/** Utilidades adicionales para UI (no exportadas del módulo puro). */
function aplicarAlcanceCompleto(alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] }, todosLosRecursos: string[]): boolean {
  return alcance.completo || alcance.memorias.length === 0 && alcance.carpetas.length === 0 && alcance.configuraciones.length === 0;
}

export function contarVinculosVinculados(cerebro: Brain): number {
  return obtenerVinculos(cerebro).length;
}

/** Retorna el destino en palabras para UI. */
export function destinoEnPalabras(vinculo: VinculoTelepatico, cerebroMap: Record<string, Brain>, entidadesMap?: Record<string, { tipo: string; nombre: string }>): string {
  if (vinculo.destino.tipo === "cerebro") {
    const otro = cerebroMap[vinculo.destino.id];
    return otro?.name || `Cerebro ${vinculo.destino.id.substring(0, 8)}...`;
  }
  if (["grupo", "comunidad", "pagina"].includes(vinculo.destino.tipo)) {
    const ent = entidadesMap?.[vinculo.destino.id];
    return ent ? `${vinculo.destino.tipo} ${ent.nombre}` : `${vinculo.destino.tipo} ${vinculo.destino.id.substring(0, 8)}...`;
  }
  if (vinculo.destino.tipo === "cuenta") {
    return `Cuenta externa (${vinculo.destino.id})`;
  }
  return vinculo.destino.id;
}

/** Retorna un alcance resumido para UI. */
export function alcanceResumido(alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] }): string {
  if (alcance.completo) return "Cerebro completo";
  const partes: string[] = [];
  if (alcance.memorias.length) partes.push(`${alcance.memorias.length} memoria${alcance.memorias.length === 1 ? "" : "s"}`);
  if (alcance.carpetas.length) partes.push(`${alcance.carpetas.length} carpeta${alcance.carpetas.length === 1 ? "" : "s"}`);
  if (alcance.configuraciones.length) partes.push(`${alcance.configuraciones.length} configuración${alcance.configuraciones.length === 1 ? "" : "s"}`);
  return partes.length ? partes.join(", ") : "Nada seleccionado";
}

/** Retorna estado con motivo para UI. */
export function estadoConMotivo(vinculo: VinculoTelepatico): { estado: string; motivo: string } {
  const hoy = new Date();
  let motivo = "";
  if (vinculo.estado === "pausado") motivo = "Sincronización pausada manualmente";
  else if (vinculo.estado === "pendiente") motivo = "Esperando aceptación del propietario";
  else if (vinculo.expiraEn && new Date(vinculo.expiraEn) < hoy) {
    motivo = "Expiró hace ${vinculo.expiraEn}";
    return { estado: "caducado", motivo };
  }
  if (vinculo.ultimaSync && new Date(vinculo.ultimaSync) < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
    motivo = motivo ? motivo + ", última sync hace ${vinculo.ultimaSync}" : `Última sync hace ${vinculo.ultimaSync}`;
  }
  return { estado: vinculo.estado, motivo: motivo || "Activo y sincronizando" };
}

/** Verifica si un archivo está almacenado completamente según un vínculo. */
export function almacenadoCompletamente(alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] }, nombre: string): boolean {
  return alcance.completo || alcance.memorias.includes(nombre) || alcance.carpetas.includes(nombre) || alcance.configuraciones.includes(nombre);
}

/** Verifica si una configuración está almacenada completamente según un vínculo. */
export function almacenadoCompletamenteConfiguraciones(alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] }): string[] {
  return alcance.configuraciones;
}
>>>>>>> 2f838ded3 (salvavidas · CB1013Gb: trabajo del agente antes de las puertas (tsc / vitest))
