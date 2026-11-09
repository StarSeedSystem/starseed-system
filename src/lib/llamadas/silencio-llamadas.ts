/*
 * silencio-llamadas — «Ignorar» y «Silenciar…» de las llamadas entrantes (LLA1108F, 2026-11-09).
 * Contrato: architecture/llamadas-telefonia.md § 8.5.
 *
 * MÓDULO PURO (sin DOM, sin Tauri): la política de silencios. Un silencio dice «las llamadas que encajen aquí no
 * suenan ni abren ventana hasta tal hora». Ámbitos: esta persona, esta neurona, este grupo/chat, este medio
 * (Bluetooth, red local, internet…) o todas («No molestar»). Duraciones: 15 min, 1 h, 8 h, hasta mañana (08:00,
 * hora local) o hasta que se reactive.
 *
 * El mismo JSON se espeja a la parte nativa (Rust lo guarda en `silencios-llamadas.json`; Kotlin lo lee al sonar,
 * con la web congelada): por eso la forma es estable, con tope de tamaño y una función `fusionar` idéntica a la de
 * Rust (gana el cambio más reciente `mod`; quitar deja una lápida para que el otro lado no lo reviva).
 * El almacén de abajo (localStorage) es solo una comodidad de esta ventana: la política vive en las funciones puras.
 */

export type AmbitoSilencio = "persona" | "neurona" | "chat" | "medio" | "todas";
export type DuracionSilencio = "15m" | "1h" | "8h" | "manana" | "siempre";

export const AMBITOS: readonly AmbitoSilencio[] = ["persona", "neurona", "chat", "medio", "todas"];
export const DURACIONES: readonly DuracionSilencio[] = ["15m", "1h", "8h", "manana", "siempre"];
export const TEXTO_AMBITO: Record<AmbitoSilencio, string> = {
  persona: "Esta persona",
  neurona: "Esta neurona",
  chat: "Este grupo o chat",
  medio: "Este medio",
  todas: "Todas las llamadas (No molestar)",
};
export const TEXTO_DURACION: Record<DuracionSilencio, string> = {
  "15m": "15 minutos",
  "1h": "1 hora",
  "8h": "8 horas",
  manana: "Hasta mañana",
  siempre: "Hasta que lo reactive",
};

/** Hora local a la que acaba «hasta mañana». */
export const HORA_MANANA = 8;
/** Tope de silencios guardados (también lo respeta Rust): una lista enorme no pesa en cada llamada. */
export const TOPE_SILENCIOS = 100;
/** Una lápida (silencio quitado) se conserva este tiempo para que la fusión con la parte nativa no lo reviva. */
export const VIDA_LAPIDA_MS = 24 * 3_600_000;
export const CLAVE_TODAS = "*";

export interface Silencio {
  id: string;
  ambito: AmbitoSilencio;
  /** uid / id de neurona / clave de chat / medio; «*» en `todas`. */
  clave: string;
  /** Cómo se llama lo silenciado (para la lista de Ajustes). */
  etiqueta: string;
  /** Epoch ms en que acaba; null = hasta que se reactive. */
  hasta: number | null;
  creado: number;
  /** Última modificación (crear o quitar): decide al fusionar. */
  mod: number;
  /** Lápida: ya no vale, pero se recuerda. */
  quitado?: boolean;
}

/** Lo que se sabe de una llamada que entra, para ver si algún silencio la cubre. */
export interface ConsultaLlamada {
  uid?: string | null;
  neurona?: string | null;
  chat?: string | null;
  medio?: string | null;
}

/* ══════════════════════════ Duraciones ══════════════════════════ */

/** Epoch ms en que acaba un silencio de esa duración empezado en `ahora` (null = sin fin). Hora local. */
export function hastaDe(d: DuracionSilencio, ahora: number): number | null {
  switch (d) {
    case "15m":
      return ahora + 15 * 60_000;
    case "1h":
      return ahora + 3_600_000;
    case "8h":
      return ahora + 8 * 3_600_000;
    case "manana": {
      const f = new Date(ahora);
      f.setDate(f.getDate() + 1);
      f.setHours(HORA_MANANA, 0, 0, 0);
      return f.getTime();
    }
    default:
      return null;
  }
}

/* ══════════════════════════ Crear, quitar, vigencia ══════════════════════════ */

export function crearSilencio(p: { ambito: AmbitoSilencio; clave?: string | null; etiqueta?: string; duracion: DuracionSilencio; ahora: number; id?: string }): Silencio | null {
  const clave = p.ambito === "todas" ? CLAVE_TODAS : (p.clave ?? "").trim();
  if (!clave || clave.length > 160) return null;
  return {
    id: p.id ?? `${p.ambito}:${clave}`,
    ambito: p.ambito,
    clave,
    etiqueta: (p.etiqueta ?? "").trim().slice(0, 80) || (p.ambito === "todas" ? "Todas las llamadas" : clave),
    hasta: hastaDe(p.duracion, p.ahora),
    creado: p.ahora,
    mod: p.ahora,
  };
}

export function vigente(s: Silencio, ahora: number): boolean {
  return !s.quitado && (s.hasta === null || s.hasta > ahora);
}

/** Pone un silencio (si ya había uno del mismo ámbito y clave, lo sustituye: el último manda). */
export function poner(lista: readonly Silencio[], nuevo: Silencio): Silencio[] {
  return depurar([...lista.filter((x) => x.id !== nuevo.id), nuevo], nuevo.mod);
}

/** Quita un silencio dejando su lápida (para «Deshacer» y para que la parte nativa no lo reviva). */
export function quitar(lista: readonly Silencio[], id: string, ahora: number): Silencio[] {
  return lista.map((s) => (s.id === id && !s.quitado ? { ...s, quitado: true, mod: ahora } : s));
}

/** Tira lo caducado hace tiempo y las lápidas viejas; respeta el tope (se queda lo más reciente). */
export function depurar(lista: readonly Silencio[], ahora: number): Silencio[] {
  const util = lista.filter((s) => (s.quitado ? ahora - s.mod < VIDA_LAPIDA_MS : s.hasta === null || ahora - s.hasta < VIDA_LAPIDA_MS));
  return util.sort((a, b) => b.mod - a.mod).slice(0, TOPE_SILENCIOS);
}

export function silenciosActivos(lista: readonly Silencio[], ahora: number): Silencio[] {
  return lista.filter((s) => vigente(s, ahora)).sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity));
}

/* ══════════════════════════ Quién suena ══════════════════════════ */

function cubre(s: Silencio, q: ConsultaLlamada): boolean {
  switch (s.ambito) {
    case "todas":
      return true;
    case "persona":
      return !!q.uid && q.uid === s.clave;
    case "neurona":
      return !!q.neurona && q.neurona === s.clave;
    case "chat":
      return !!q.chat && q.chat === s.clave;
    case "medio":
      return !!q.medio && q.medio === s.clave;
    default:
      return false;
  }
}

/** El silencio vigente que cubre la llamada (el que dura más, para decir «hasta…»), o null si suena. */
export function silenciadaPor(lista: readonly Silencio[], q: ConsultaLlamada, ahora: number): Silencio | null {
  let mejor: Silencio | null = null;
  for (const s of lista) {
    if (!vigente(s, ahora) || !cubre(s, q)) continue;
    if (!mejor || (mejor.hasta !== null && (s.hasta === null || s.hasta > mejor.hasta))) mejor = s;
  }
  return mejor;
}

/* ══════════════════════════ Texto ══════════════════════════ */

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** «18:30» (hoy), «mañana 08:00» o «lun 08:00»; «hasta que lo reactives» si no tiene fin. */
export function textoHasta(hasta: number | null, ahora: number): string {
  if (hasta === null) return "hasta que lo reactives";
  const f = new Date(hasta);
  const a = new Date(ahora);
  const hora = `${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`;
  const mismoDia = f.getFullYear() === a.getFullYear() && f.getMonth() === a.getMonth() && f.getDate() === a.getDate();
  if (mismoDia) return `hasta las ${hora}`;
  const m = new Date(ahora);
  m.setDate(m.getDate() + 1);
  const esManana = f.getFullYear() === m.getFullYear() && f.getMonth() === m.getMonth() && f.getDate() === m.getDate();
  if (esManana) return `hasta mañana ${hora}`;
  return `hasta el ${dosCifras(f.getDate())}/${dosCifras(f.getMonth() + 1)} ${hora}`;
}

/** «Llamada silenciada (hasta 18:30)» para la entrada que sustituye al timbre. */
export function textoLlamadaSilenciada(s: Silencio, ahora: number): string {
  if (s.hasta === null) return "Llamada silenciada (hasta que lo reactives)";
  return `Llamada silenciada (${textoHasta(s.hasta, ahora).replace(/^hasta las /, "hasta ")})`;
}

/* ══════════════════════════ Espejo con la parte nativa ══════════════════════════ */

function entero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/** Lee la lista venida de fuera (disco o Rust): descarta lo malformado, nunca lanza. */
export function leerSilencios(raw: unknown): Silencio[] {
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const lista = Array.isArray(o) ? o : o && typeof o === "object" ? (o as { silencios?: unknown }).silencios : null;
  if (!Array.isArray(lista)) return [];
  const fuera: Silencio[] = [];
  for (const x of lista.slice(0, TOPE_SILENCIOS * 2)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const ambito = r.ambito;
    if (typeof ambito !== "string" || !(AMBITOS as readonly string[]).includes(ambito)) continue;
    if (typeof r.id !== "string" || !r.id || r.id.length > 200) continue;
    if (typeof r.clave !== "string" || !r.clave || r.clave.length > 160) continue;
    const creado = entero(r.creado);
    const mod = entero(r.mod) ?? creado;
    if (creado === null || mod === null) continue;
    const hasta = r.hasta === null || r.hasta === undefined ? null : entero(r.hasta);
    if (hasta === null && r.hasta !== null && r.hasta !== undefined) continue;
    fuera.push({
      id: r.id,
      ambito: ambito as AmbitoSilencio,
      clave: r.clave,
      etiqueta: typeof r.etiqueta === "string" ? r.etiqueta.slice(0, 80) : r.clave,
      hasta,
      creado,
      mod,
      ...(r.quitado === true ? { quitado: true } : {}),
    });
  }
  return fuera;
}

/** El JSON que se le da a Rust (y que Kotlin lee). */
export function serializarSilencios(lista: readonly Silencio[]): string {
  return JSON.stringify({ v: 1, silencios: lista.slice(0, TOPE_SILENCIOS) });
}

/** Une dos listas (la de la web y la nativa): por id gana el `mod` más reciente. Igual que la de Rust. */
export function fusionar(a: readonly Silencio[], b: readonly Silencio[], ahora: number): Silencio[] {
  const por = new Map<string, Silencio>();
  for (const s of [...a, ...b]) {
    const previo = por.get(s.id);
    if (!previo || s.mod > previo.mod) por.set(s.id, s);
  }
  return depurar(Array.from(por.values()), ahora);
}

/* ══════════════════════════ Almacén de esta ventana ══════════════════════════ */

const CLAVE_ALMACEN = "starseed:silencios-llamadas:v1";
let memoria: Silencio[] | null = null;
const oyentes = new Set<() => void>();

function leerAlmacen(): Silencio[] {
  try {
    return typeof localStorage === "undefined" ? [] : leerSilencios(localStorage.getItem(CLAVE_ALMACEN));
  } catch {
    return [];
  }
}

export function silenciosGuardados(): Silencio[] {
  if (memoria === null) memoria = leerAlmacen();
  return memoria;
}

/** Cambia la lista (la fusiona con lo anterior si `fusionando`), la guarda y avisa. */
export function guardarSilencios(lista: readonly Silencio[]): void {
  memoria = depurar(lista, Date.now());
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(CLAVE_ALMACEN, serializarSilencios(memoria));
  } catch {
    /* sin almacenamiento: vale la copia en memoria */
  }
  for (const cb of Array.from(oyentes)) {
    try {
      cb();
    } catch {
      /* un oyente roto no para a los demás */
    }
  }
}

export function suscribirSilencios(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** Solo pruebas. */
export function __reiniciarSilencios(): void {
  memoria = null;
  oyentes.clear();
}
