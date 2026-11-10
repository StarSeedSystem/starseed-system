/**
 * politica — a quién se le sirve, con qué topes, y el papel de cada neurona (ENJ1110A · 2026-11-10). Contrato: §8.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * StarSeed es cooperativo: no hay «ojo por ojo» (tit-for-tat). En su lugar:
 *  · Mi cuenta: se sirve SIEMPRE a mis neuronas, dentro de los topes de batería, datos medidos y tope diario.
 *  · Grupo / comunidad: se sirve a los miembros. La equidad es de PRIORIDAD, no de bloqueo: reparto por turnos y una
 *    razón blanda (lo servido a una neurona frente a lo recibido de ella). Quien pasa de la razón queda al final de
 *    la cola y solo se le dice «ocupada» si la neurona ya va justa de capacidad. Jamás un «no» duro por la razón.
 *  · Público: opt-in («Sembrar contenido público»), con topes y horario.
 *  · Relé ciego: guardar y servir TEXTO CIFRADO ajeno que no puedo leer. Opt-in aparte; quien lo pide demuestra que
 *    conoce el id del enjambre (HMAC con el secreto), así que no hay lista de miembros que mantener en el relé.
 * Roles automáticos por capacidad (todos configurables): sembradora fija (escritorio / servidor / portátil
 * enchufado), ocasional (móvil o tableta cargando y con Wi‑Fi) y solo-recolectar. El rol limita lo que se hace por
 * OTRAS personas y por el público; a mis propias neuronas se les sirve aunque la neurona sea «solo recolectar», porque
 * ahí mandan los topes (batería, datos, tope diario).
 * Puro: sin red ni reloj propios.
 */

import type { Ambito } from "./semilla";
import { entero, esObjeto } from "./util";

export type RolNeurona = "sembradora-fija" | "sembradora-ocasional" | "solo-recolectar";
export const ROLES_NEURONA: readonly RolNeurona[] = ["sembradora-fija", "sembradora-ocasional", "solo-recolectar"];

export type TipoDispositivo = "servidor" | "escritorio" | "portatil" | "movil" | "tableta" | "web";

export interface CapacidadNeurona {
  tipo: TipoDispositivo;
  enCorriente: boolean;
  /** 0..100, o null si no se sabe / no tiene batería. */
  bateriaPct: number | null;
  enWifi: boolean;
  redMedida: boolean;
  /** Bytes libres de almacenamiento, o null si no se sabe. */
  libreBytes: number | null;
}

const MIN_LIBRE = 512 * 1024 * 1024;

export function rolAutomatico(c: CapacidadNeurona): RolNeurona {
  if (c.tipo === "web") return "solo-recolectar";
  if (c.libreBytes !== null && c.libreBytes < MIN_LIBRE) return "solo-recolectar";
  if (c.tipo === "servidor" || c.tipo === "escritorio") return "sembradora-fija";
  if (c.tipo === "portatil") return c.enCorriente || (c.bateriaPct ?? 0) >= 50 ? "sembradora-fija" : "sembradora-ocasional";
  return c.enCorriente && c.enWifi && !c.redMedida ? "sembradora-ocasional" : "solo-recolectar";
}

/* ───────────────────────────── Ajustes ───────────────────────────── */

export interface AjustesEnjambre {
  /** «Papel de esta neurona». */
  rol: "auto" | RolNeurona;
  /** «Sembrar a mis neuronas». */
  sembrarMisNeuronas: boolean;
  /** «Sembrar a mis grupos y comunidades». */
  sembrarGrupos: boolean;
  /** «Sembrar contenido público». Apagado por defecto. */
  sembrarPublico: boolean;
  /** «Guardar contenido cifrado de otras personas (relé ciego)». Apagado por defecto. */
  relevoCiego: boolean;
  /** Batería mínima para servir a mis neuronas / a grupos (sin cargador). */
  bateriaMinPct: number;
  /** Batería mínima para servir al público o hacer de relé ciego (sin cargador). */
  bateriaMinPublicoPct: number;
  /** «Usar datos móviles» (red medida). */
  usarRedMedida: boolean;
  /** Topes de subida por día (MiB) por categoría. */
  topeDiaMiB: { propia: number; grupo: number; publico: number };
  /** Subidas a la vez. */
  maxSubidas: number;
  /** Horario del público: horas locales [desde, hasta), o null = todo el día. */
  horarioPublico: { desdeH: number; hastaH: number } | null;
  /** Razón servido/recibido a partir de la cual un miembro pasa al final de la cola (no se le bloquea). */
  ratioSuave: number;
  /** Cuotas de almacenamiento por ámbito (MiB). */
  cuotaMiB: { privado: number; grupo: number; comunidad: number; publico: number };
}

export const AJUSTES_ENJAMBRE_POR_DEFECTO: AjustesEnjambre = {
  rol: "auto",
  sembrarMisNeuronas: true,
  sembrarGrupos: true,
  sembrarPublico: false,
  relevoCiego: false,
  bateriaMinPct: 20,
  bateriaMinPublicoPct: 40,
  usarRedMedida: false,
  topeDiaMiB: { propia: 4096, grupo: 1024, publico: 256 },
  maxSubidas: 8,
  horarioPublico: null,
  ratioSuave: 4,
  cuotaMiB: { privado: 4096, grupo: 2048, comunidad: 1024, publico: 512 },
};

export const CLAVE_AJUSTES_ENJAMBRE = "starseed.enjambre.v1";

function bool(x: unknown, d: boolean): boolean {
  return typeof x === "boolean" ? x : d;
}

/** Ajustes guardados → ajustes válidos (lo que falte o sea absurdo cae al valor por defecto). */
export function interpretarAjustesEnjambre(x: unknown): AjustesEnjambre {
  const d = AJUSTES_ENJAMBRE_POR_DEFECTO;
  if (!esObjeto(x)) return { ...d, topeDiaMiB: { ...d.topeDiaMiB }, cuotaMiB: { ...d.cuotaMiB } };
  const t = esObjeto(x.topeDiaMiB) ? x.topeDiaMiB : {};
  const q = esObjeto(x.cuotaMiB) ? x.cuotaMiB : {};
  const h = esObjeto(x.horarioPublico) ? x.horarioPublico : null;
  const desdeH = h ? entero(h.desdeH, 0, 23) : null;
  const hastaH = h ? entero(h.hastaH, 0, 24) : null;
  return {
    rol: x.rol === "auto" || (ROLES_NEURONA as readonly unknown[]).includes(x.rol) ? (x.rol as AjustesEnjambre["rol"]) : d.rol,
    sembrarMisNeuronas: bool(x.sembrarMisNeuronas, d.sembrarMisNeuronas),
    sembrarGrupos: bool(x.sembrarGrupos, d.sembrarGrupos),
    sembrarPublico: bool(x.sembrarPublico, d.sembrarPublico),
    relevoCiego: bool(x.relevoCiego, d.relevoCiego),
    bateriaMinPct: entero(x.bateriaMinPct, 0, 100) ?? d.bateriaMinPct,
    bateriaMinPublicoPct: entero(x.bateriaMinPublicoPct, 0, 100) ?? d.bateriaMinPublicoPct,
    usarRedMedida: bool(x.usarRedMedida, d.usarRedMedida),
    topeDiaMiB: {
      propia: entero(t.propia, 0, 10_000_000) ?? d.topeDiaMiB.propia,
      grupo: entero(t.grupo, 0, 10_000_000) ?? d.topeDiaMiB.grupo,
      publico: entero(t.publico, 0, 10_000_000) ?? d.topeDiaMiB.publico,
    },
    maxSubidas: entero(x.maxSubidas, 1, 64) ?? d.maxSubidas,
    horarioPublico: desdeH !== null && hastaH !== null ? { desdeH, hastaH } : null,
    ratioSuave: typeof x.ratioSuave === "number" && x.ratioSuave >= 1 && x.ratioSuave <= 100 ? x.ratioSuave : d.ratioSuave,
    cuotaMiB: {
      privado: entero(q.privado, 0, 10_000_000) ?? d.cuotaMiB.privado,
      grupo: entero(q.grupo, 0, 10_000_000) ?? d.cuotaMiB.grupo,
      comunidad: entero(q.comunidad, 0, 10_000_000) ?? d.cuotaMiB.comunidad,
      publico: entero(q.publico, 0, 10_000_000) ?? d.cuotaMiB.publico,
    },
  };
}

export function cuotasEnBytes(a: AjustesEnjambre): Record<Ambito, number> {
  const M = 1024 * 1024;
  return { privado: a.cuotaMiB.privado * M, grupo: a.cuotaMiB.grupo * M, comunidad: a.cuotaMiB.comunidad * M, publico: a.cuotaMiB.publico * M };
}

/* ───────────────────────────── Contador diario ───────────────────────────── */

export type CategoriaTope = "propia" | "grupo" | "publico";

export class ContadorDia {
  private dia = "";
  private bytes: Record<CategoriaTope, number> = { propia: 0, grupo: 0, publico: 0 };

  private rodar(ahora: number): void {
    const d = new Date(ahora);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (k !== this.dia) {
      this.dia = k;
      this.bytes = { propia: 0, grupo: 0, publico: 0 };
    }
  }
  usado(c: CategoriaTope, ahora: number): number {
    this.rodar(ahora);
    return this.bytes[c];
  }
  sumar(c: CategoriaTope, bytes: number, ahora: number): void {
    this.rodar(ahora);
    this.bytes[c] += bytes;
  }
}

/* ───────────────────────────── Equidad en grupos ───────────────────────────── */

/**
 * Prioridad de servicio entre miembros: menos servido, antes. La razón servido/recibido solo manda al final de la
 * cola a quien se pasa de `ratioSuave`; no bloquea a nadie.
 */
export class EquidadGrupo {
  private servido = new Map<string, number>();
  private recibido = new Map<string, number>();

  constructor(private readonly ratioSuave = 4) {}

  servidoA(par: string, bytes: number): void {
    this.servido.set(par, (this.servido.get(par) ?? 0) + bytes);
  }
  recibidoDe(par: string, bytes: number): void {
    this.recibido.set(par, (this.recibido.get(par) ?? 0) + bytes);
  }
  /** Servido / (recibido + 1 MiB): el MiB evita dividir por cero y no castiga a quien acaba de llegar. */
  razon(par: string): number {
    return (this.servido.get(par) ?? 0) / ((this.recibido.get(par) ?? 0) + 1024 * 1024);
  }
  pasaDeLaRazon(par: string): boolean {
    return this.razon(par) > this.ratioSuave;
  }
  /** Ordena a quién atender: primero los que no pasan de la razón, y dentro de cada grupo el menos servido. */
  ordenar(pares: readonly string[]): string[] {
    return pares.slice().sort((a, b) => {
      const pa = this.pasaDeLaRazon(a) ? 1 : 0;
      const pb = this.pasaDeLaRazon(b) ? 1 : 0;
      return pa - pb || (this.servido.get(a) ?? 0) - (this.servido.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
}

/* ───────────────────────────── Decisión ───────────────────────────── */

/** Cómo se relaciona quien pide con quien sirve (lo decide el cableado con la identidad de cuenta). */
export type Relacion = "propia" | "miembro" | "por-id" | "otra" | "revocada";

export interface EstadoNeurona extends CapacidadNeurona {
  ahora: number;
  subidasActivas: number;
}

export interface SolicitudServir {
  ambito: Ambito;
  relacion: Relacion;
  bytes: number;
  /** Esta neurona NO tiene la clave del contenido (guarda texto cifrado ajeno). */
  esRelevoCiego: boolean;
  /** Par que pide, para la equidad de grupo. */
  par?: string;
}

export type MotivoPolitica = "ok" | "revocada" | "apagado" | "rol" | "bateria" | "red-medida" | "cuota" | "horario" | "ocupada" | "no-miembro" | "relevo-apagado";

export interface DecisionServir {
  ok: boolean;
  motivo: MotivoPolitica;
  prioridad: "normal" | "baja";
}

export function rolEfectivo(a: AjustesEnjambre, c: CapacidadNeurona): RolNeurona {
  return a.rol === "auto" ? rolAutomatico(c) : a.rol;
}

function categoria(s: SolicitudServir): CategoriaTope {
  if (s.relacion === "propia") return "propia";
  if (s.ambito === "publico" && s.relacion !== "miembro") return "publico";
  return s.relacion === "miembro" ? "grupo" : "publico";
}

function enHorario(h: AjustesEnjambre["horarioPublico"], ahora: number): boolean {
  if (!h) return true;
  const hora = new Date(ahora).getHours();
  return h.desdeH <= h.hastaH ? hora >= h.desdeH && hora < h.hastaH : hora >= h.desdeH || hora < h.hastaH;
}

export function decidirServir(a: AjustesEnjambre, e: EstadoNeurona, s: SolicitudServir, dia: ContadorDia, eq?: EquidadGrupo): DecisionServir {
  const no = (motivo: MotivoPolitica): DecisionServir => ({ ok: false, motivo, prioridad: "normal" });
  if (s.relacion === "revocada") return no("revocada");
  const rol = rolEfectivo(a, e);

  // ¿Quién tiene derecho a este contenido?
  if (s.relacion === "propia") {
    if (!a.sembrarMisNeuronas) return no("apagado");
  } else if (s.ambito === "privado") {
    // Lo privado solo sale hacia mis neuronas o hacia quien conoce el id y yo hago de relé ciego.
    if (s.relacion !== "por-id" || !s.esRelevoCiego) return no("no-miembro");
    if (!a.relevoCiego) return no("relevo-apagado");
  } else if (s.ambito === "publico") {
    const permitido = s.relacion === "miembro" ? a.sembrarGrupos || a.sembrarPublico : a.sembrarPublico;
    if (!permitido) return no("apagado");
  } else {
    // grupo / comunidad
    if (s.relacion === "miembro" && !s.esRelevoCiego) {
      if (!a.sembrarGrupos) return no("apagado");
    } else if (s.relacion === "por-id" && s.esRelevoCiego) {
      if (!a.relevoCiego) return no("relevo-apagado");
    } else return no("no-miembro");
  }

  // El rol limita lo que se hace por otras personas y por el público.
  if (s.relacion !== "propia" && rol === "solo-recolectar") return no("rol");

  // Topes de la neurona.
  const publicoOAjeno = s.relacion !== "propia" && (s.ambito === "publico" || s.esRelevoCiego);
  const minBat = publicoOAjeno ? a.bateriaMinPublicoPct : a.bateriaMinPct;
  if (!e.enCorriente && e.bateriaPct !== null && e.bateriaPct < minBat) return no("bateria");
  if (e.redMedida && !a.usarRedMedida) return no("red-medida");
  if (s.ambito === "publico" && s.relacion !== "propia" && s.relacion !== "miembro" && !enHorario(a.horarioPublico, e.ahora)) return no("horario");

  const cat = categoria(s);
  const tope = a.topeDiaMiB[cat] * 1024 * 1024;
  if (dia.usado(cat, e.ahora) + s.bytes > tope) return no("cuota");

  // Capacidad y equidad: la razón blanda baja la prioridad; solo se rechaza si ya vamos justos.
  const baja = !!(s.par && eq && s.relacion === "miembro" && eq.pasaDeLaRazon(s.par));
  if (e.subidasActivas >= a.maxSubidas) return no("ocupada");
  if (baja && e.subidasActivas >= Math.ceil(a.maxSubidas * 0.75)) return no("ocupada");
  return { ok: true, motivo: "ok", prioridad: baja ? "baja" : "normal" };
}

/** ¿Acepto guardar este contenido de otro en mi almacén? (`tengoClave`: soy miembro; si no, sería relé ciego.) */
export function aceptarGuardar(a: AjustesEnjambre, e: CapacidadNeurona, ambito: Ambito, tengoClave: boolean): boolean {
  if (ambito === "publico") return a.sembrarPublico;
  if (tengoClave) return true;
  if (!a.relevoCiego || rolEfectivo(a, e) === "solo-recolectar") return false;
  return e.enCorriente || e.bateriaPct === null || e.bateriaPct >= a.bateriaMinPublicoPct;
}
