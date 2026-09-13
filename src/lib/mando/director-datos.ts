// Modelo de datos puro del Director del Mando: la verdad calculada desde las
// fuentes reales (latidos, progreso, salud de proveedores, launchctl y canal).

export interface TareaLatido {
  fase: string;
  avance: number;
  bytes?: number;
  modelo?: string;
  intento?: number;
}
export interface LatidoEntrada { tareas?: Record<string, TareaLatido> }
export type EstadoAgente =
  | "escribiendo" | "verificando" | "revisando"
  | "esperando_aprobacion" | "colgado" | "hecho";
export interface ResumenAgentes {
  vivos: number; colgados: number; esperandoAprobacion: number;
  porFase: Record<string, number>;
}
export interface ProgresoEntrada {
  estado?: string; nota?: string; depende_de?: string[];
}
export interface ResumenPendientes {
  listas: number; bloqueadas: Array<{ id: string; dependeDe: string[] }>;
  sinCambios: number; fallos: number; esperandoAprobacion: number;
  integradasHoy: number; fallosDetalle: Array<{ id: string; estado: string; nota: string }>;
}
export interface SaludProveedor {
  estado?: string; sin_cupo_hasta?: number; motivo?: string;
}
export interface ResumenProveedor {
  proveedor: string; vivo: boolean; modelos: number; necesitaCheckin: boolean;
  sinCupoHasta?: number; motivo?: string;
}
export interface MensajeCanal { quien?: string; texto?: string; hora?: number | string }
export interface ResumenDirector {
  nombre: string; vivo: boolean;
  pid?: number; ultimaSalida?: number; ultimoMensaje?: string; hace?: number;
}

const UMBRAL_COLGADO_S = 300;

export function clasificarAgente(t: TareaLatido, ahora: number): EstadoAgente {
  if (t.fase === "hecho") return "hecho";
  if (t.fase === "esperando aprobación" || t.fase === "esperando_aprobacion") {
    return "esperando_aprobacion";
  }
  const activa = t.fase === "escribiendo" || t.fase === "tsc" || t.fase === "revision";
  if (activa && ahora - t.avance > UMBRAL_COLGADO_S) return "colgado";
  if (t.fase === "tsc") return "verificando";
  if (t.fase === "revision") return "revisando";
  return "escribiendo";
}

export function resumenAgentes(latidos: LatidoEntrada[], ahora: number): ResumenAgentes {
  const r: ResumenAgentes = { vivos: 0, colgados: 0, esperandoAprobacion: 0, porFase: {} };
  for (const latido of latidos) {
    for (const tarea of Object.values(latido.tareas ?? {})) {
      const e = clasificarAgente(tarea, ahora);
      r.porFase[e] = (r.porFase[e] ?? 0) + 1;
      if (e === "colgado") r.colgados += 1;
      else if (e === "esperando_aprobacion") r.esperandoAprobacion += 1;
      else if (e !== "hecho") r.vivos += 1;
    }
  }
  return r;
}

export interface AgenteVivo {
  id: string; estado: EstadoAgente; fase: string; modelo?: string;
  proveedor: string; kb: number; minutos: number; intento?: number;
}

function pesoOrdenAgente(e: EstadoAgente): number {
  return e === "colgado" ? 0 : e === "esperando_aprobacion" ? 1 : 2;
}

/** Un agente por tarea viva (sin `hecho`), colgados primero y luego esperando aprobación. */
export function listaAgentes(latidos: LatidoEntrada[], ahora: number): AgenteVivo[] {
  const lista: AgenteVivo[] = [];
  for (const latido of latidos) {
    for (const [id, t] of Object.entries(latido.tareas ?? {})) {
      const estado = clasificarAgente(t, ahora);
      if (estado === "hecho") continue;
      lista.push({
        id, estado, fase: t.fase,
        ...(t.modelo ? { modelo: t.modelo } : {}),
        proveedor: t.modelo ? proveedorDeModelo(t.modelo) : "desconocido",
        kb: Math.round((t.bytes ?? 0) / 1024),
        minutos: Math.round((ahora - t.avance) / 60),
        ...(t.intento !== undefined ? { intento: t.intento } : {}),
      });
    }
  }
  return lista.sort((a, b) => pesoOrdenAgente(a.estado) - pesoOrdenAgente(b.estado));
}

export function idEnAsuntos(tid: string, asuntos: string[]): boolean {
  const esc = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return asuntos.some((a) => new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`).test(a));
}

const ESTADOS_FALLO = new Set(["fallo", "fallo_tsc", "fallo_tests", "conflicto"]);

export function resumenPendientes(
  colasFuente: Array<{ nombre: string; tareas: Array<{ id?: string }> }>,
  progreso: Record<string, ProgresoEntrada>,
  asuntosMain: string[],
): ResumenPendientes {
  const r: ResumenPendientes = { listas: 0, bloqueadas: [], sinCambios: 0, fallos: 0, esperandoAprobacion: 0, integradasHoy: 0, fallosDetalle: [] };
  const vistas = new Set<string>();
  for (const cola of colasFuente) {
    if (!cola.nombre.startsWith("cola-") || cola.nombre.startsWith("cola-auto-")) continue;
    for (const tarea of cola.tareas) {
      const id = tarea.id;
      if (!id || vistas.has(id)) continue;
      vistas.add(id);
      const est = progreso[id]?.estado ?? "pendiente";
      if (est === "bloqueada") r.bloqueadas.push({ id, dependeDe: progreso[id]?.depende_de ?? [] });
      else if (est === "sin_cambios") r.sinCambios += 1;
      else if (ESTADOS_FALLO.has(est)) {
        r.fallos += 1;
        const nota = progreso[id]?.nota ?? "";
        r.fallosDetalle.push({ id, estado: est, nota: nota.slice(0, 160) });
      }
      else if (est === "esperando_aprobacion" || est === "pendiente_aprobacion") r.esperandoAprobacion += 1;
      else if (idEnAsuntos(id, asuntosMain)) r.integradasHoy += 1;
      else if (est === "pendiente" || est === "commit") r.listas += 1;
    }
  }
  return r;
}

export function proveedorDeModelo(modelo: string): string {
  return modelo.startsWith("nvidia/") ? "nim" : modelo.split("/")[0] || modelo;
}

export function resumenProveedores(
  salud: Record<string, SaludProveedor>,
  modelos: string[],
): ResumenProveedor[] {
  const conteo = new Map<string, number>();
  for (const m of modelos) {
    const p = proveedorDeModelo(m);
    conteo.set(p, (conteo.get(p) ?? 0) + 1);
  }
  return [...new Set([...Object.keys(salud), ...conteo.keys()])].sort().map((p) => {
    const s = salud[p] ?? {};
    return {
      proveedor: p, vivo: s.estado === "vivo", modelos: conteo.get(p) ?? 0,
      necesitaCheckin: Boolean(s.motivo?.includes("check-in")),
      ...(s.sin_cupo_hasta !== undefined ? { sinCupoHasta: s.sin_cupo_hasta } : {}),
      ...(s.motivo ? { motivo: s.motivo } : {}),
    };
  });
}

const DIRECTORES = ["vigilante", "director", "guardia", "eco", "ecoides", "telegram", "mando"];

function segundosDesde(hora: number | string | undefined, ahora: number): number {
  const n = typeof hora === "string" ? Date.parse(hora) / 1000 : hora;
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.max(0, ahora - (n > 1e12 ? n / 1000 : n));
}

export function resumenDirectores(
  launchctl: string, canal: MensajeCanal[], ahora: number,
): ResumenDirector[] {
  const procs = new Map<string, { pid?: number; ultimaSalida?: number }>();
  for (const linea of launchctl.split("\n")) {
    const c = linea.trim().split(/\s+/);
    if (c.length < 3 || !c[2].startsWith("com.starseed.")) continue;
    const pid = Number.parseInt(c[0], 10), salida = Number.parseInt(c[1], 10);
    procs.set(c[2].replace("com.starseed.", ""), {
      ...(Number.isNaN(pid) ? {} : { pid }),
      ...(Number.isNaN(salida) ? {} : { ultimaSalida: salida }),
    });
  }
  return DIRECTORES.map((nombre) => {
    const proc = procs.get(nombre);
    const msg = [...canal].reverse().find((m) => m.quien === nombre);
    return {
      nombre, vivo: proc?.pid !== undefined,
      ...(proc?.pid !== undefined ? { pid: proc.pid } : {}),
      ...(proc?.ultimaSalida !== undefined ? { ultimaSalida: proc.ultimaSalida } : {}),
      ...(msg?.texto ? { ultimoMensaje: msg.texto } : {}),
      ...(msg ? { hace: segundosDesde(msg.hora, ahora) } : {}),
    };
  });
}
