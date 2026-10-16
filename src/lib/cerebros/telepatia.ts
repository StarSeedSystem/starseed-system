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

export interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

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
  if (vinculo.estado !== "activo") return plan;
  const origenId = origen.id;
  const destinoId = destino.id;
  const alcance = vinculo.alcance;
  for (const archivo of archivos) {
    if (almacenadoCompletamente(alcance, archivo.name)) {
      if (archivo.meta?.telepatia === vinculo.id) continue;
      plan.push({ tipo: "archivo", nombre: archivo.name, de: `${origenId}/${archivo.name}`, a: `${destinoId}/${archivo.name}` });
    }
  }
  if (alcance.completo) {
    const configs = ["servers", "runtimes", "skills", "storage", "apps", "moa", "channels", "conectores", "includes.personalities"];
    for (const cfg of configs) {
      plan.push({ tipo: "config", nombre: cfg, de: `${origenId}/config/${cfg}`, a: `${destinoId}/config/${cfg}` });
    }
  } else {
    for (const cfg of alcance.configuraciones) {
      plan.push({ tipo: "config", nombre: cfg, de: `${origenId}/config/${cfg}`, a: `${destinoId}/config/${cfg}` });
    }
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
    const tipoCapital = vinculo.destino.tipo.charAt(0).toUpperCase() + vinculo.destino.tipo.slice(1);
    if (vinculo.destino.tipo === "pagina") {
      return ent ? `Página ${ent.nombre}` : `Página ${vinculo.destino.id.substring(0, 8)}...`;
    }
    return ent ? `${tipoCapital} ${ent.nombre}` : `${tipoCapital} ${vinculo.destino.id.substring(0, 8)}...`;
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
    motivo = `Expiró el ${vinculo.expiraEn}`;
    return { estado: "caducado", motivo };
  }
  if (vinculo.ultimaSync && new Date(vinculo.ultimaSync) < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
    const texto = `Última sync el ${vinculo.ultimaSync}`;
    motivo = motivo ? `${motivo}, ${texto}` : texto;
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
