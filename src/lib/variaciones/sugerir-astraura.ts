// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura (architecture/variaciones-publicas.md §4 y §7-U).
// Módulo puro: enrutador, ADN y payload capturado se inyectan; sin red, disco, reloj ni DOM.
import { leerClave } from "./clave-elemento";
import { validarVariacion } from "./validar";

export type ViaSugerencia = "local" | "malla" | "nube";

export interface PruebaAdn { id: string; comprobacion: string; auto?: boolean }
export interface AdnContexto { meta?: { slug?: string }; pruebas?: PruebaAdn[] }
export interface ContextoVariacion { payload: unknown; adn: AdnContexto; codigo?: boolean }
export interface PeticionSugerencias { clave: string; familia: string; payload: unknown; cuantas: number; localPrimero: true }
export interface VariacionSugerida { titulo: string; descripcion?: string; payload: unknown; via?: ViaSugerencia }
export type EnrutadorAstraura = (peticion: PeticionSugerencias) => Promise<VariacionSugerida[]> | VariacionSugerida[];
export interface VariacionAceptada { titulo: string; descripcion?: string; payload: unknown; via: ViaSugerencia; requiereAislamiento: boolean; motivo: string }
export interface ResultadoSugerencias { variaciones: VariacionAceptada[]; motivo: string }
export interface DepsSugerir { enrutador: EnrutadorAstraura; cuantas?: number }
const ORDEN: Record<ViaSugerencia, number> = { local: 0, malla: 1, nube: 2 };
const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const medida = (v: unknown): number | null => { const n = numero(v) ?? Number.parseFloat(texto(v) ?? ""); return Number.isFinite(n) ? n : null; };
const redondo = (v: unknown, esperado: number): boolean => { const n = medida(v); return n !== null && Math.abs(n - esperado) < 0.001; };
const plano = (p: unknown): string => { try { return JSON.stringify(p).toLowerCase(); } catch { return ""; } };

/** Fusiona la variación sobre el estado capturado (los arreglos se reemplazan, no se mezclan). */
function fusionar(base: unknown, cambio: unknown, profundidad = 0): unknown {
  const a = objeto(base), b = objeto(cambio);
  if (!a || !b || profundidad > 16) return cambio;
  const salida: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) salida[k] = fusionar(a[k], v, profundidad + 1);
  return salida;
}
function cobertura(p: Record<string, unknown>, ...roles: string[]): number {
  return lista(p.paleta).reduce<number>((total, fila) => {
    const f = objeto(fila), rol = (texto(f?.rol) ?? texto(f?.nombre) ?? "").toLowerCase();
    return f && roles.some((r) => rol.includes(r)) ? total + (medida(f.cobertura) ?? 0) : total;
  }, 0);
}
function tamanos(p: Record<string, unknown>): number[] {
  const tipo = objeto(p.tipo);
  return lista(tipo?.tamanos ?? tipo?.pasos ?? p.tamanos).map(medida).filter((n): n is number => n !== null);
}

/** Traduce a medida la comprobación textual del ADN; lo que no reconoce no pasa (fail closed). */
function evaluarPrueba(comprobacion: string, p: Record<string, unknown>): boolean {
  const s = comprobacion.toLowerCase(), tipo = objeto(p.tipo), acento = cobertura(p, "acento"), tam = tamanos(p);
  if (s.includes("acento") && s.includes("<15%")) return acento < 15;
  if (s.includes("acento") && s.includes("20-30%")) return acento >= 20 && acento <= 30;
  if (s.startsWith("fondo") && s.includes(">40%")) return cobertura(p, "fondo") > 40;
  if (s.startsWith("oro") && s.includes("<20%")) return cobertura(p, "oro") < 20;
  if (s.startsWith("pergamino") && s.includes(">40%")) return cobertura(p, "pergamino") > 40;
  if (s.startsWith("lila") && s.includes(">30%")) return cobertura(p, "lila") > 30;
  if (s.startsWith("terracota")) { const t = cobertura(p, "terracota"); return t >= 10 && t <= 20; }
  if (s.includes("sin oro sobre cafe")) return !((texto(p.contexto) ?? "").toLowerCase().includes("cafe") && cobertura(p, "oro") > 0);
  if (s.includes("tamanos 10-13px")) return tam.length > 0 && tam.every((n) => n >= 10 && n <= 13);
  if (s.includes("max 3 tamanos")) return new Set(tam).size <= 3;
  if (s.includes("proporcion titular/cuerpo")) return (medida(tipo?.ratio_display_cuerpo) ?? medida(p.proporcion) ?? 0) >= 6;
  if (s.includes("texto >=28px")) return Math.max(0, ...tam) >= 28;
  if (s.includes("cuerpo <=65 chars")) return (medida(tipo?.medida) ?? medida(p.medida) ?? Infinity) <= 65;
  if (s.includes("contraste")) return (medida(p.contraste) ?? 0) >= 4.5;
  if (s.includes("dianas")) return (medida(p.dianas) ?? medida(p.diana) ?? 0) >= 44;
  if (s.includes("radio 0.85rem")) return redondo(p.radio, 0.85);
  if (s.includes("radio 0.875-2rem")) { const r = medida(p.radio); return r !== null && r >= 0.875 && r <= 2; }
  if (s.includes("radio botones 12px")) return (medida(p.radioBotones) ?? medida(p.radio) ?? 0) === 12;
  if (s.includes("blur 10px")) return (medida(p.blur) ?? 0) === 10;
  if (s.includes("animacion solo transform opacity")) { const a = lista(p.animacion).map(texto); return a.length > 0 && a.every((x) => x === "transform" || x === "opacity"); }
  if (s.includes("sin webgl")) return p.webgl !== true;
  if (s.includes("prefers-reduced-motion")) return p.movimientoReducido === true;
  if (s.includes("no anima dimensiones")) return p.animaDimensiones !== true;
  if (s.includes("sin text-white")) return !plano(p).includes("text-white");
  if (s.includes("sin neon")) return !plano(p).includes("neon");
  if (s.includes("sin shell opaco")) return p.opaco !== true;
  if (s.includes("sin vr nativo")) return p.vrNativo !== true;
  if (s.includes("controles visibles")) return p.controlesVisibles !== false;
  if (s.includes("fraunces en titular")) return (texto(tipo?.titular) ?? texto(p.titular) ?? "").toLowerCase().includes("fraunces");
  return false;
}

function evaluarAdn(p: Record<string, unknown>, adn: AdnContexto): { ok: boolean; auto: number; manuales: number } {
  const todas = adn.pruebas ?? [], auto = todas.filter((prueba) => prueba.auto !== false);
  return { ok: auto.every((prueba) => evaluarPrueba(prueba.comprobacion, p)), auto: auto.length, manuales: todas.length - auto.length };
}

export async function sugerirVariaciones(clave: string, contexto: ContextoVariacion, deps: DepsSugerir): Promise<ResultadoSugerencias> {
  if (!leerClave(clave)) return { variaciones: [], motivo: `Clave: «${clave}» no es una clave de elemento válida` };
  const cuantas = Math.min(Math.max(Math.trunc(deps.cuantas ?? 3), 1), 3);
  let candidatas: VariacionSugerida[];
  try {
    candidatas = await deps.enrutador({ clave, familia: clave.split(":")[0], payload: contexto.payload, cuantas, localPrimero: true });
  } catch {
    return { variaciones: [], motivo: "Astraura: ninguna fuente respondió; se reintentará en la siguiente consulta" };
  }
  if (!Array.isArray(candidatas)) return { variaciones: [], motivo: "Astraura: la respuesta no es una lista de variaciones" };
  const aceptadas: VariacionAceptada[] = [];
  for (const candidata of candidatas.slice(0, cuantas * 4)) {
    const titulo = (texto(candidata?.titulo) ?? "").trim();
    if (!titulo || titulo.length > 200) continue;
    const validacion = validarVariacion(candidata.payload, { codigo: contexto.codigo });
    if (!validacion.ok) continue;
    const adn = evaluarAdn(objeto(fusionar(contexto.payload, candidata.payload)) ?? {}, contexto.adn);
    if (!adn.ok) continue;
    const via = candidata.via ?? "local";
    const pruebas = adn.auto > 0 ? `${adn.auto} pruebas del ADN` : "sin pruebas automáticas de ADN";
    aceptadas.push({
      titulo, descripcion: candidata.descripcion, payload: candidata.payload, via,
      requiereAislamiento: validacion.requiereAislamiento,
      motivo: `${via === "local" ? "Local primero" : `Respaldo ${via}`} · ${pruebas}${adn.manuales ? ` · ${adn.manuales} manuales` : ""} · ${validacion.requiereAislamiento ? "código aislado" : "sin código"}`,
    });
  }
  aceptadas.sort((a, b) => ORDEN[a.via] - ORDEN[b.via]);
  const motivo = aceptadas.length ? `${aceptadas.length} variaciones de Astraura pasaron la validación` : "Astraura no propuso ninguna variación que pase la validación y el ADN";
  return { variaciones: aceptadas.slice(0, cuantas), motivo };
}
