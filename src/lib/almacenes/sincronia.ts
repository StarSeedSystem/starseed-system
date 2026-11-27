/**
 * Almacenes — Motor puro de sincronía por vínculo.
 * Réplica congelada vs respaldo vivo; conflictos como variaciones; nada se pisa ni se borra solo.
 */

export type Direccion = "enviar" | "recibir" | "ambas";
export type Cuando = "tiempo_real" | "al_conectar" | "programada" | "manual";
export type ModoCopia = "replica_congelada" | "respaldo_vivo";
export type EventoSync = "cambio" | "conexion" | "reloj" | "boton";

export interface FiltroSync {
  carpetas?: string[];
  extensiones?: string[];
  tamMaximo?: number;
}

export interface PlanSincronia {
  id: string;
  direccion: Direccion;
  cuando: Cuando;
  cadaMs?: number;
  modo: ModoCopia;
  filtro: FiltroSync;
  /** Solo una neurona reconocida del dueño puede activarlo; apagado por defecto. */
  aceptarSinPreguntar: boolean;
}

export interface EntradaArchivo {
  ruta: string;
  hash: string;
  tam: number;
  mtime: number;
}

export type Lado = Record<string, EntradaArchivo>;

export type Accion =
  | { tipo: "enviar"; ruta: string; hash: string }
  | { tipo: "recibir"; ruta: string; hash: string; requiereAceptacion: boolean }
  | { tipo: "conflicto"; ruta: string; guardarComo: string; hashLocal: string; hashRemoto: string }
  | { tipo: "proponer_borrado"; ruta: string; lado: "local" | "remoto" };

export function planPorDefecto(id: string): PlanSincronia {
  return { id, direccion: "ambas", cuando: "manual", modo: "respaldo_vivo", filtro: {}, aceptarSinPreguntar: false };
}

export function pasaFiltro(f: FiltroSync, e: EntradaArchivo): boolean {
  if (f.tamMaximo !== undefined && e.tam > f.tamMaximo) return false;
  if (f.carpetas?.length && !f.carpetas.some((c) => e.ruta === c || e.ruta.startsWith(c.replace(/\/?$/, "/")))) return false;
  if (f.extensiones?.length) {
    const ext = e.ruta.includes(".") ? e.ruta.slice(e.ruta.lastIndexOf(".") + 1).toLowerCase() : "";
    if (!f.extensiones.map((x) => x.toLowerCase().replace(/^\./, "")).includes(ext)) return false;
  }
  return true;
}

/** ¿Debe correr el plan ahora? «manual» solo corre con el botón. */
export function debeEjecutar(plan: PlanSincronia, evento: EventoSync, ahora: number, ultima: number | null): boolean {
  if (evento === "boton") return true;
  if (plan.cuando === "tiempo_real") return evento === "cambio";
  if (plan.cuando === "al_conectar") return evento === "conexion";
  if (plan.cuando === "programada") return evento === "reloj" && (ultima === null || ahora - ultima >= (plan.cadaMs ?? 3_600_000));
  return false;
}

/** Nombre de la variación que se guarda junto al original; nunca pisa. */
export function nombreVariacion(ruta: string, origen: string, hash: string): string {
  const punto = ruta.lastIndexOf(".");
  const barra = ruta.lastIndexOf("/");
  const [base, ext] = punto > barra + 1 ? [ruta.slice(0, punto), ruta.slice(punto)] : [ruta, ""];
  return `${base} (conflicto ${origen} ${hash.slice(0, 6)})${ext}`;
}

export interface EntradaPlanificar {
  plan: PlanSincronia;
  local: Lado;
  remoto: Lado;
  /** Último estado en el que ambos lados coincidieron (base de tres vías). */
  base: Lado;
  origenRemoto: string;
  /** Réplica congelada que ya hizo su copia inicial: no vuelve a sincronizar. */
  copiaInicialHecha?: boolean;
}

export function planificar(e: EntradaPlanificar): Accion[] {
  const { plan, local, remoto, base } = e;
  if (plan.modo === "replica_congelada" && e.copiaInicialHecha) return [];
  const sube = plan.direccion !== "recibir";
  const baja = plan.direccion !== "enviar";
  const congelada = plan.modo === "replica_congelada";
  const acciones: Accion[] = [];
  const rutas = new Set([...Object.keys(local), ...Object.keys(remoto)]);
  for (const ruta of [...rutas].sort()) {
    const l = local[ruta];
    const r = remoto[ruta];
    const b = base[ruta];
    if (l && !pasaFiltro(plan.filtro, l)) continue;
    if (r && !pasaFiltro(plan.filtro, r)) continue;
    if (l && r && l.hash === r.hash) continue;
    const lCambio = l && (!b || b.hash !== l.hash);
    const rCambio = r && (!b || b.hash !== r.hash);
    if (l && r && lCambio && rCambio) {
      if (sube || baja) acciones.push({ tipo: "conflicto", ruta, guardarComo: nombreVariacion(ruta, e.origenRemoto, r.hash), hashLocal: l.hash, hashRemoto: r.hash });
    } else if (l && (!r || (lCambio && !rCambio))) {
      if (!r && b && baja) acciones.push({ tipo: "proponer_borrado", ruta, lado: "local" });
      else if (sube && !congelada) acciones.push({ tipo: "enviar", ruta, hash: l.hash });
      else if (sube && !r) acciones.push({ tipo: "enviar", ruta, hash: l.hash });
    } else if (r && (!l || rCambio)) {
      if (!l && b && sube) acciones.push({ tipo: "proponer_borrado", ruta, lado: "remoto" });
      else if (baja) acciones.push({ tipo: "recibir", ruta, hash: r.hash, requiereAceptacion: !plan.aceptarSinPreguntar });
    }
  }
  return acciones;
}
