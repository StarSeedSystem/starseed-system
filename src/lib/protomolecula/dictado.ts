/**
 * Protomolécula · DICTADO. Frases en español → `Operacion`. Módulo PURO.
 * «sube la reverberación un 10 %» · «pon el brillo exactamente en 1,2» · «filtro al máximo» · «activa el eco» ·
 * «baja el volumen 3 dB» · «pon la mezcla a la mitad». Números con cifras (1,2 · 1.2) o palabras (veinticinco,
 * treinta y cinco, uno coma cinco). NO adivina: nombre dudoso, unidad que no cuadra, parámetro repetido o
 * palabras sobrantes → `ok: false` con razón y sugerencia que se puede leer en voz alta. Un nombre casi igual
 * («reberberación») se sugiere, nunca se aplica.
 */
import { convertirUnidad, formatearValor, normalizar } from "./parametros";
import { PALABRAS_UNIDAD } from "./tipos";
import type { Accion, Autor, CandidatoParametro, Operacion, Origen, Parametro, Unidad } from "./tipos";

export type ResultadoDictado =
  | { ok: true; operacion: Operacion; resumen: string }
  | { ok: false; razon: string; sugerencia: string; candidatos?: string[] };
/** `origen`: «dictado» (voz de una persona) por defecto; «ia» o «agente» si la frase la escribe un agente. */
export interface ContextoDictado { autor: Autor; ahora: number; origen?: Origen; id?: () => string }

const M = (o: Record<string, number>) => new Map(Object.entries(o));
const UNI = M({ cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 });
const DEC = M({ treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 });
const CEN = M({ cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 });

/** Minúsculas, sin tildes ni signos; conserva 1,2 y 1.2; separa «10%» y «3db». */
export const limpiarFrase = (f: string): string =>
  normalizar(f).replace(/[¿?¡!;:"“”«»()]/g, " ").replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/(\d)\s*([a-z%°]+)/g, "$1 $2").replace(/\s+/g, " ").trim();

function entero(t: string[], i: number): { v: number; n: number } | null {
  let tot = 0, cur = 0, j = i;
  for (; j < t.length; j++) {
    const w = t[j];
    if (CEN.has(w)) cur += CEN.get(w)!;
    else if (DEC.has(w) || UNI.has(w)) {
      cur += DEC.get(w) ?? UNI.get(w)!;
      const u = UNI.get(t[j + 2] ?? "") ?? 0;
      if (DEC.has(w) && t[j + 1] === "y" && u > 0 && u < 10) { cur += u; j += 2; }
      if (t[j + 1] !== "mil") { j++; break; }
    } else if (w === "mil") { tot += (cur || 1) * 1000; cur = 0; } else break;
  }
  return j === i ? null : { v: tot + cur, n: j - i };
}

/** Un número (cifras o palabras, con «menos», «coma», «y medio») y cuántas palabras ocupa. */
function numero(t: string[], i: number): { v: number; n: number } | null {
  const neg = t[i] === "menos", j = neg ? i + 1 : i;
  const cifra = /^-?\d+(\.\d+)?$/.test((t[j] ?? "").replace(",", "."));
  let r = cifra ? { v: Number(t[j].replace(",", ".")), n: 1 } : t[j] === "medio" ? { v: 0.5, n: 1 } : entero(t, j);
  if (!r) return null;
  const sig = t[j + r.n];
  if (sig === "coma" || sig === "punto") {
    let k = j + r.n + 1, dig = "";
    for (let d = UNI.get(t[k] ?? ""); (d !== undefined && d < 10) || /^\d+$/.test(t[k] ?? ""); d = UNI.get(t[++k] ?? "")) dig += d !== undefined && d < 10 ? d : t[k];
    if (!dig) { const d = entero(t, k); if (!d) return null; dig = String(d.v); k += d.n; }
    r = { v: Number(`${r.v}.${dig}`), n: k - j };
  } else if (sig === "y" && t[j + r.n + 1] === "medio") r = { v: r.v + 0.5, n: r.n + 2 };
  return { v: neg ? -r.v : r.v, n: r.n + (j - i) };
}

const UNIDADES = new Map<string, Unidad | "pasos">([["paso", "pasos"], ["pasos", "pasos"]]);
for (const [u, ps] of Object.entries(PALABRAS_UNIDAD)) for (const p of ps) UNIDADES.set(limpiarFrase(p) || p, u as Unidad);

interface Cantidad { v: number; u: Unidad | "pasos" | null; n: number }
function cantidad(t: string[], i: number): Cantidad | null {
  let j = i;
  for (let paso = 0; paso < 4 && j < t.length; paso++) {
    if (/^(un|una|unos|unas)$/.test(t[j]) && numero(t, j + 1)) { j++; continue; }
    const r = numero(t, j);
    if (r) {
      for (let g = 3; g >= 1; g--) {
        const u = UNIDADES.get(t.slice(j + r.n, j + r.n + g).join(" "));
        if (u && t.slice(j + r.n, j + r.n + g).length === g) return { v: r.v, u, n: j + r.n + g - i };
      }
      return { v: r.v, u: null, n: j + r.n - i };
    }
    if (!/^(en|a|al|hasta|exactamente|justo|unos|unas|de|del|la|el|los|las|para)$/.test(t[j])) return null;
    j++;
  }
  return null;
}

const dic = (s: string) => s.split(" ");
const VERBOS = new Map<string, string>();
for (const [clase, lista] of Object.entries({
  sube: "sube subir aumenta aumentar incrementa incrementar eleva alza subas aumentes", baja: "baja bajar reduce reducir disminuye disminuir rebaja bajes reduzcas",
  pon: "pon poner ponme fija fijar ajusta ajustar establece establecer configura deja dejalo cambia pongas", alterna: "alterna alternar conmuta",
  activa: "activa activar enciende encender prende habilita conecta actives enciendas", desactiva: "desactiva desactivar apaga apagar deshabilita desconecta quita desactives apagues",
  dispara: "dispara disparar lanza pulsa ejecuta reproduce graba inicia",
})) for (const v of dic(lista)) VERBOS.set(v, clase);
const RELLENO = /^(?:(?:por favor|oye|hey|vale|venga|ahora|aurora|astraura|protomolecula|quiero que|puedes|podrias|necesito que|me)\s+)+/;
const ARTICULOS = /^(el|la|los|las|un|una|unos|unas|de|del|al)$/;
const CONECTOR = /^(en|a|al|la|el)$/;

function buscar(t: string[], cs: CandidatoParametro[]): { cands: CandidatoParametro[]; n: number } | null {
  let i = 0, mejor = 0, gan: CandidatoParametro[] = [];
  while (ARTICULOS.test(t[i] ?? "")) i++;
  for (const c of cs) {
    for (const nm of [c.parametro.nombre, ...(c.parametro.sinonimos ?? [])].map((x) => dic(limpiarFrase(x)))) {
      if (!nm[0] || !nm.every((w, k) => t[i + k] === w)) continue;
      if (nm.length > mejor) { mejor = nm.length; gan = [c]; } else if (nm.length === mejor && !gan.includes(c)) gan.push(c);
    }
  }
  return gan.length ? { cands: gan, n: i + mejor } : null;
}

const distancia = (a: string, b: string): number => {
  let f = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) f = f.reduce<number[]>((n, _, k) => (n.push(k ? Math.min(f[k] + 1, n[k - 1] + 1, f[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)) : i), n), []);
  return f[b.length];
};

type Parsed = { a: Accion; n: number } | { razon: string; sugerencia: string };
const SI = /^(activado|activada|encendido|encendida|si|on)$/, NO = /^(desactivado|desactivada|apagado|apagada|no|off)$/;
const aUnidad = (p: Parametro, v: number, u: Unidad): number | null =>
  u === "%" && p.unidad !== "%" ? (p.min !== undefined && p.max !== undefined ? p.min + (v / 100) * (p.max - p.min) : null) : p.unidad ? convertirUnidad(v, u, p.unidad) : null;

function construir(clase: string, p: Parametro, r: string[]): Parsed {
  const nom = p.nombre, err = (razon: string, sugerencia: string) => ({ razon, sugerencia });
  // «sube el brillo A 2» fija un destino (como «pon»); «sube el brillo EN 2» o «2 dB» es un incremento.
  let rel = clase === "sube" ? 1 : clase === "baja" ? -1 : 0;
  if (rel !== 0 && /^(a|al|hasta)$/.test(r[0] ?? "")) rel = 0;
  const tog = ["activa", "desactiva", "alterna", "dispara"].includes(clase);
  const alt = `Di «pon ${nom} en <valor>» o «sube ${nom} un 10 %».`, opciones = `Opciones: ${(p.opciones ?? []).join(", ")}.`;
  if (p.tipo === "disparo") return tog && (clase === "activa" || clase === "dispara") ? { a: { tipo: "disparo" }, n: 0 } : err(`«${nom}» es un botón.`, `Di «dispara ${nom}».`);
  if (p.tipo === "booleano") {
    if (tog && clase !== "dispara") return { a: clase === "alterna" ? { tipo: "alternar" } : { tipo: "exacta", valor: clase === "activa" }, n: 0 };
    const x = r.findIndex((w) => !CONECTOR.test(w)), b = r[x] ?? "";
    return rel === 0 && !tog && (SI.test(b) || NO.test(b)) ? { a: { tipo: "exacta", valor: SI.test(b) }, n: x + 1 } : err(`«${nom}» es un interruptor.`, `Di «activa ${nom}» o «desactiva ${nom}».`);
  }
  if (tog) return err(`«${nom}» no es un interruptor.`, alt);
  if (rel === 0 && p.tipo === "opcion") {
    let j = 0;
    while (CONECTOR.test(r[j] ?? "")) j++;
    const resto = r.slice(j).join(" "), o = (p.opciones ?? []).filter((x) => resto === limpiarFrase(x) || resto.startsWith(`${limpiarFrase(x)} `)).sort((x, y) => y.length - x.length)[0];
    return o ? { a: { tipo: "exacta", valor: o }, n: j + dic(limpiarFrase(o)).length } : err(`No reconozco esa opción de «${nom}».`, opciones);
  }
  const m = rel === 0 ? /^(?:(?:al|a|en|hasta) )?(?:el )?(maximo|minimo)\b|^a (tope|fondo)\b|^(?:a la |la )?(mitad)\b|^al (medio)\b/.exec(r.join(" ")) : null;
  if (m) {
    const lim = m[1] === "minimo" ? p.min : m[1] === "maximo" || m[2] ? p.max : p.min !== undefined && p.max !== undefined ? (p.min + p.max) / 2 : undefined;
    return lim === undefined ? err(`«${nom}» no tiene ese límite definido.`, alt) : { a: { tipo: "exacta", valor: lim }, n: m[0].split(" ").length };
  }
  const c = cantidad(r, 0);
  if (!c) return err(rel === 0 ? `¿A qué valor pongo «${nom}»?` : `¿Cuánto ${rel > 0 ? "subo" : "bajo"} «${nom}»?`, rel === 0 ? `Por ejemplo «pon ${nom} en 1,2».` : "Di la cantidad: «un 10 %» o «2 pasos».");
  const mal = err(`«${nom}» va en ${p.unidad || "números sin unidad"} y no sé pasar ${c.u} a eso.`, alt);
  if (p.tipo === "opcion") return c.u === "pasos" ? { a: { tipo: "relativa", cantidad: rel * c.v, modo: "pasos" }, n: c.n } : err(`«${nom}» se elige por nombre o por pasos.`, opciones);
  if (rel === 0) {
    const v = c.u === null ? c.v : c.u === "pasos" ? null : aUnidad(p, c.v, c.u);
    return v === null ? mal : { a: { tipo: "exacta", valor: v }, n: c.n };
  }
  if (c.u === "pasos" || c.u === "%") return { a: { tipo: "relativa", cantidad: rel * c.v, modo: c.u === "pasos" ? "pasos" : p.unidad === "%" ? "delta" : "porcentaje-valor" }, n: c.n };
  const d = c.u === null ? c.v : p.unidad ? convertirUnidad(c.v, c.u, p.unidad) : null;
  return d === null ? mal : { a: { tipo: "relativa", cantidad: rel * d, modo: "delta" }, n: c.n };
}

function resumir(p: Parametro, a: Accion): string {
  if (a.tipo !== "relativa") return a.tipo === "exacta" ? `${p.nombre} → ${formatearValor(p, a.valor)}` : `${p.nombre}: ${a.tipo === "alternar" ? "alternar" : "disparar"}`;
  const u = a.modo === "pasos" ? " pasos" : a.modo.startsWith("porcentaje") || p.unidad === "%" ? " %" : p.unidad ? ` ${p.unidad}` : "";
  return `${p.nombre}: ${a.cantidad >= 0 ? "+" : "−"}${String(Math.abs(a.cantidad)).replace(".", ",")}${u}`;
}

const fallo = (razon: string, sugerencia: string, candidatos?: string[]): ResultadoDictado => ({ ok: false, razon, sugerencia, candidatos });

export function entenderDictado(frase: string, cs: CandidatoParametro[], ctx: ContextoDictado): ResultadoDictado {
  const t = limpiarFrase(frase).replace(RELLENO, "").split(" ").filter(Boolean);
  if (!t.length) return fallo("No oí ninguna orden.", "Prueba con «sube la reverberación un 10 %».");
  const verbo = VERBOS.get(t[0]), i = verbo ? 1 : 0, h = buscar(t.slice(i), cs);
  if (!h) {
    const idea = (t.slice(i).join(" ").split(/ (?:en|a|al|un|una|\d)/)[0] || t[i] || "").replace(/^(?:(?:el|la|los|las) )+/, "");
    const cerca = cs.map((c) => ({ c, d: distancia(idea, limpiarFrase(c.parametro.nombre)) })).filter((x) => x.d <= Math.max(2, idea.length / 4)).sort((x, y) => x.d - y.d);
    const nombres = (cerca.length ? cerca.map((x) => x.c) : cs).slice(0, 4).map((c) => c.parametro.nombre);
    return fallo(verbo ? `No encontré «${idea}» entre los controles de aquí.` : "No entendí la orden.", cerca.length ? `¿Quisiste decir «${nombres[0]}»?` : `Controles: ${nombres.join(", ") || "ninguno abierto"}.`, nombres);
  }
  let cands = h.cands, k = i + h.n;
  if (cands.length > 1 && /^(de|del|en)$/.test(t[k] ?? "")) {
    let j = k + 1;
    while (ARTICULOS.test(t[j] ?? "")) j++;
    const f = cands.filter((c) => c.atomo && dic(limpiarFrase(c.atomo)).every((w, x) => t[j + x] === w));
    if (f.length === 1) { cands = f; k = j + dic(limpiarFrase(f[0].atomo!)).length; }
  }
  if (cands.length > 1) {
    const quien = cands.map((c) => `«${c.parametro.nombre} de ${c.atomo ?? c.ref.atomoId}»`);
    return fallo(`Hay ${cands.length} controles con ese nombre.`, `Dime cuál: ${quien.join(" o ")}.`, quien);
  }
  const { ref, parametro: p } = cands[0], r = construir(verbo ?? "pon", p, t.slice(k));
  if ("razon" in r) return fallo(r.razon, r.sugerencia);
  const sobra = t.slice(k + r.n).filter((w) => !/^(por|favor|ya|ahora|gracias|otra|vez)$/.test(w));
  if (sobra.length) return fallo(`No entiendo «${sobra.join(" ")}».`, "Dilo en una sola orden, por ejemplo «sube la reverberación un 10 %».");
  const operacion: Operacion = { id: ctx.id?.() ?? `dic-${ctx.ahora}`, objetivo: ref, accion: r.a, autor: ctx.autor, origen: ctx.origen ?? "dictado", t: ctx.ahora, texto: frase };
  return { ok: true, operacion, resumen: resumir(p, r.a) };
}

/** «sube la reverb un 10 % y baja los graves 3 dB» → un resultado por orden, en el mismo orden. */
export function entenderVarias(frase: string, cs: CandidatoParametro[], ctx: ContextoDictado): ResultadoDictado[] {
  const corte = new RegExp(`\\s+(?:y luego|y|e|luego|despues|ademas)\\s+(?=(?:${[...VERBOS.keys()].join("|")})\\b)`);
  return limpiarFrase(frase).split(corte).map((tr, n) => entenderDictado(tr, cs, { ...ctx, id: ctx.id ?? (() => `dic-${ctx.ahora}-${n}`) }));
}
