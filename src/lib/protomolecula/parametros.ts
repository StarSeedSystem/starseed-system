/**
 * Protomolécula · PARÁMETROS. Aplica operaciones exactas y relativas con rango, paso, unidad y
 * porcentajes; todo cambio queda en un `Cambio` que se puede deshacer. Módulo PURO.
 *
 * Reglas (las comprueban las pruebas):
 *  · «Exacta» solo se acota al rango (y se redondea si el parámetro es entero): NO se ajusta al
 *    paso, porque «exactamente 1,2» debe quedar en 1,2 aunque el paso sea 0,5.
 *  · «N %» relativo es N % del valor ACTUAL (sube/baja siempre en el sentido pedido, también con
 *    negativos). Si el valor es 0 o la unidad es dB, el N % se toma sobre el RANGO y se avisa.
 *  · Si el valor pedido se sale del rango se deja en el límite y `acotado` lo cuenta.
 */
import type {
  Accion, Cambio, EstadoValores, Operacion, Parametro, ParametroRef, Unidad, ValorParametro,
} from "./tipos";

export const claveDe = (r: ParametroRef): string => `${r.atomoId}::${r.parametroId}`;

/** Minúsculas y sin tildes: así se comparan nombres, opciones y frases. */
export const normalizar = (s: string): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const limpiar = (n: number): number => Math.round(n * 1e9) / 1e9;

export function valorPorDefecto(p: Parametro): ValorParametro {
  if (p.defecto !== undefined) return p.defecto;
  if (p.tipo === "booleano" || p.tipo === "disparo") return false;
  if (p.tipo === "opcion") return p.opciones?.[0] ?? "";
  return p.min ?? 0;
}
export const valorActual = (estado: EstadoValores, ref: ParametroRef, p: Parametro): ValorParametro =>
  estado[claveDe(ref)] ?? valorPorDefecto(p);

export function acotar(p: Parametro, v: number): { valor: number; acotado: boolean } {
  const x = p.tipo === "entero" ? Math.round(v) : v;
  const lo = p.min ?? -Infinity;
  const hi = p.max ?? Infinity;
  return { valor: limpiar(Math.min(hi, Math.max(lo, x))), acotado: x < lo || x > hi };
}

const EQUIVALENCIAS: Partial<Record<Unidad, Partial<Record<Unidad, number>>>> = {
  kHz: { Hz: 1000 }, Hz: { kHz: 0.001 }, s: { ms: 1000 }, ms: { s: 0.001 }, m: { cm: 100 }, cm: { m: 0.01 },
};
/** Convierte entre unidades de la misma magnitud; `null` si no se pueden comparar. */
export function convertirUnidad(valor: number, de: Unidad, a: Unidad): number | null {
  if (de === a) return valor;
  const f = EQUIVALENCIAS[de]?.[a];
  return f === undefined ? null : limpiar(valor * f);
}

export type Calculo =
  | { ok: true; valor: ValorParametro; acotado: boolean; nota?: string }
  | { ok: false; motivo: string };
const no = (motivo: string): Calculo => ({ ok: false, motivo });
const si = (valor: ValorParametro, acotado = false, nota?: string): Calculo => ({ ok: true, valor, acotado, nota });

function numerico(p: Parametro, actual: number, a: Accion): Calculo {
  const fin = (v: number, nota?: string): Calculo => {
    const r = acotar(p, v);
    return si(r.valor, r.acotado, nota);
  };
  if (a.tipo === "alternar") return no(`«${p.nombre}» no es un interruptor`);
  if (a.tipo !== "exacta" && a.tipo !== "relativa") return no(`«${p.nombre}» no es un botón`);
  if (a.tipo === "exacta") {
    return typeof a.valor === "number" && Number.isFinite(a.valor) ? fin(a.valor) : no(`«${p.nombre}» pide un número`);
  }
  const q = a.cantidad;
  const rango = p.min !== undefined && p.max !== undefined ? p.max - p.min : null;
  if (!Number.isFinite(q)) return no("la cantidad no es un número");
  if (a.modo === "delta") return fin(actual + q);
  if (a.modo === "pasos") return fin(actual + q * (p.paso ?? (p.tipo === "entero" ? 1 : rango ? rango / 100 : 1)));
  if (rango === null) return no(`«${p.nombre}» no tiene rango, así que no se puede dar un porcentaje del rango`);
  if (a.modo === "porcentaje-rango") return fin(actual + (rango * q) / 100);
  if (actual === 0 || p.unidad === "dB") {
    return fin(actual + (rango * q) / 100, `El porcentaje se tomó sobre el rango (el valor ${actual === 0 ? "era 0" : "va en dB"}).`);
  }
  return fin(actual + (Math.abs(actual) * q) / 100);
}

/** Qué valor sale de aplicar una acción a un valor, sin tocar ningún estado. */
export function calcular(p: Parametro, actual: ValorParametro, a: Accion): Calculo {
  if (p.tipo === "disparo") return a.tipo === "disparo" ? si(actual) : no(`«${p.nombre}» es un botón: solo se dispara`);
  if (a.tipo === "disparo") return no(`«${p.nombre}» no es un botón`);
  if (p.tipo === "booleano") {
    if (a.tipo === "alternar") return si(!actual);
    if (a.tipo === "exacta" && typeof a.valor === "boolean") return si(a.valor);
    return no(`«${p.nombre}» solo se activa, se desactiva o se alterna`);
  }
  if (p.tipo === "opcion") {
    const ops = p.opciones ?? [];
    if (a.tipo === "exacta") {
      const v = ops.find((o) => normalizar(o) === normalizar(String(a.valor)));
      return v !== undefined ? si(v) : no(`«${a.valor}» no es una opción de «${p.nombre}» (${ops.join(", ")})`);
    }
    if (a.tipo === "relativa" && a.modo === "pasos" && ops.length) {
      const i = Math.max(0, ops.indexOf(String(actual))) + a.cantidad;
      const j = Math.min(ops.length - 1, Math.max(0, i));
      return si(ops[j], i !== j);
    }
    return no(`«${p.nombre}» se elige por nombre o se mueve por pasos`);
  }
  return numerico(p, Number(actual), a);
}

export type Aplicado = { ok: true; estado: EstadoValores; cambio: Cambio } | { ok: false; motivo: string };

export function aplicarOperacion(estado: EstadoValores, p: Parametro, op: Operacion): Aplicado {
  const antes = valorActual(estado, op.objetivo, p);
  const c = calcular(p, antes, op.accion);
  if (!c.ok) return c;
  const reversible = op.accion.tipo !== "disparo";
  const sig = reversible ? { ...estado, [claveDe(op.objetivo)]: c.valor } : estado;
  return { ok: true, estado: sig, cambio: { operacion: op, antes, despues: c.valor, acotado: c.acotado, reversible, nota: c.nota } };
}

export type Revertido = { ok: true; estado: EstadoValores } | { ok: false; motivo: string };

/** Deshace un cambio; si alguien lo tocó después, no pisa su trabajo salvo que se fuerce. */
export function deshacerCambio(estado: EstadoValores, c: Cambio, forzar = false): Revertido {
  if (!c.reversible) return { ok: false, motivo: "un disparo no se deshace" };
  const k = claveDe(c.operacion.objetivo);
  if (!forzar && estado[k] !== c.despues) {
    return { ok: false, motivo: "otra persona o un mando lo cambió después: deshacerlo pisaría ese cambio" };
  }
  return { ok: true, estado: { ...estado, [k]: c.antes } };
}

export interface Historial { hechos: Cambio[]; rehacer: Cambio[] }
export const LIMITE_HISTORIAL = 200;
export const historialVacio = (): Historial => ({ hechos: [], rehacer: [] });

/** Anota un cambio. Lo que no cambió nada o no se puede deshacer no ocupa sitio. */
export function registrar(h: Historial, c: Cambio): Historial {
  if (!c.reversible || c.antes === c.despues) return h;
  return { hechos: [...h.hechos, c].slice(-LIMITE_HISTORIAL), rehacer: [] };
}

type Paso = { ok: true; estado: EstadoValores; historial: Historial; cambio: Cambio } | { ok: false; motivo: string };
const ultimoDe = (l: Cambio[], autorId?: string): number => {
  for (let i = l.length - 1; i >= 0; i--) if (autorId === undefined || l[i].operacion.autor.id === autorId) return i;
  return -1;
};
const sin = (l: Cambio[], i: number): Cambio[] => l.filter((_, j) => j !== i);

/** Deshace lo último (de todos, o solo lo de `autorId`: en colaboración cada cual deshace lo suyo). */
export function deshacerUltimo(h: Historial, estado: EstadoValores, autorId?: string): Paso {
  const i = ultimoDe(h.hechos, autorId);
  if (i < 0) return { ok: false, motivo: "no hay nada que deshacer" };
  const r = deshacerCambio(estado, h.hechos[i]);
  if (!r.ok) return r;
  return { ok: true, estado: r.estado, cambio: h.hechos[i], historial: { hechos: sin(h.hechos, i), rehacer: [...h.rehacer, h.hechos[i]] } };
}

export function rehacerUltimo(h: Historial, estado: EstadoValores, autorId?: string): Paso {
  const i = ultimoDe(h.rehacer, autorId);
  if (i < 0) return { ok: false, motivo: "no hay nada que rehacer" };
  const c = h.rehacer[i];
  const k = claveDe(c.operacion.objetivo);
  if (estado[k] !== c.antes) return { ok: false, motivo: "el valor cambió mientras tanto: no se rehace encima" };
  return { ok: true, estado: { ...estado, [k]: c.despues }, cambio: c, historial: { hechos: [...h.hechos, c], rehacer: sin(h.rehacer, i) } };
}

/** «Reverberación: 30 % → 40 %», para leerlo en voz alta o enseñarlo en el panel. */
export function formatearValor(p: Parametro, v: ValorParametro): string {
  if (typeof v === "boolean") return v ? "activado" : "desactivado";
  if (typeof v === "string") return v;
  const t = String(Math.round(v * 100) / 100).replace(".", ",");
  return p.unidad ? `${t}${p.unidad === "%" ? " %" : ` ${p.unidad}`}` : t;
}
export const describirCambio = (p: Parametro, c: Cambio): string =>
  `${p.nombre}: ${formatearValor(p, c.antes)} → ${formatearValor(p, c.despues)}${c.acotado ? " (en el límite)" : ""}`;
