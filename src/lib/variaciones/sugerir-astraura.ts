// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura (architecture/variaciones-publicas.md §4).
// Módulo puro: el enrutador (escalera local primero de genesis-conectores-abiertos.md §2),
// el ADN del contexto y el reloj se inyectan; sin red, sin disco, sin DOM y sin `any`.
import { leerClave } from "./clave-elemento";
import { validarVariacion } from "./validar";
/** Una prueba del ADN tal como vive en `memory/diseno/adn/<slug>/dna.json`. */
export interface PruebaAdn { id: string; comprobacion: string; auto: boolean }
/** Lo que este módulo necesita del ADN del contexto; el resto del archivo se ignora. */
export interface AdnContexto {
  meta?: { slug?: string; nombre?: string }; paleta?: Array<{ rol: string; hex: string }>; pruebas?: PruebaAdn[];
}
/** Contexto del elemento: su payload capturado y el ADN inyectado. */
export interface ContextoSugerencia { payloadCapturado: unknown; adn?: AdnContexto | null; familia?: string }
/** Petición que recibe el enrutador de Astraura ya inyectado. */
export interface PeticionAstraura { clave: string; familia: string; payloadCapturado: unknown; adn: AdnContexto | null; cantidad: number }
/** El enrutador real aplica la escalera local primero; aquí solo se inyecta. */
export type EnrutadorAstraura = (peticion: PeticionAstraura) => Promise<unknown>;
/** Dependencias inyectables: enrutador y reloj determinista. */
export interface DepsSugerirVariaciones { enrutar: EnrutadorAstraura; ahora?: () => Date }
/** Variación sugerida que ya pasó el validador y las pruebas del ADN. */
export interface VariacionSugerida {
  titulo: string; descripcion: string; payload: unknown; motivo: string; requiereAislamiento: boolean; licencia: string; etiquetas: string[]; creada: string;
}
/** Cuántas variaciones se piden al enrutador (contrato §4). */
export const MAXIMO_SUGERENCIAS = 3;
/** Familias cuyo payload es código y por tanto solo se abre aislado. */
const FAMILIAS_CODIGO = new Set(["herramienta", "atomo", "molecula", "app"]);
/** Colores hexadecimales dentro de un payload, para comprobar la paleta del ADN. */
const PATRON_HEX = /#[0-9a-f]{3,8}\b/gi;
/** Pide a Astraura variaciones del payload, las valida con `validar.ts` y el ADN, y devuelve solo las que pasan, con su motivo. */
export async function sugerirVariaciones(
  clave: string,
  contexto: ContextoSugerencia,
  deps: DepsSugerirVariaciones,
): Promise<VariacionSugerida[]> {
  if (!leerClave(clave)) return [];
  const familia = contexto.familia ?? clave.slice(0, clave.indexOf(":"));
  const adn = contexto.adn ?? null;
  let bruto: unknown;
  try {
    bruto = await deps.enrutar({ clave, familia, payloadCapturado: contexto.payloadCapturado, adn, cantidad: MAXIMO_SUGERENCIAS });
  } catch {
    return [];
  }
  const candidatas = normalizar(bruto).slice(0, MAXIMO_SUGERENCIAS);
  const ahora = deps.ahora ?? (() => new Date());
  const salida: VariacionSugerida[] = [];
  for (const candidata of candidatas) {
    const validacion = validarVariacion(candidata.payload, { codigo: FAMILIAS_CODIGO.has(familia) });
    if (!validacion.ok) continue;
    const veredicto = evaluarAdn(candidata.payload, adn);
    if (!veredicto.ok) continue;
    salida.push({
      titulo: candidata.titulo, descripcion: candidata.descripcion, payload: candidata.payload,
      motivo: motivoDe(adn, veredicto.pruebas), requiereAislamiento: validacion.requiereAislamiento,
      licencia: candidata.licencia, etiquetas: candidata.etiquetas, creada: ahora().toISOString(),
    });
  }
  return salida;
}

interface Candidata { titulo: string; descripcion: string; payload: unknown; etiquetas: string[]; licencia: string }
interface VeredictoAdn { ok: boolean; pruebas: string[] }
const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);

function normalizar(bruto: unknown): Candidata[] {
  const listaBruta = Array.isArray(bruto) ? bruto : esObjeto(bruto) ? lista(bruto.variaciones ?? bruto.sugerencias) : [];
  return listaBruta.flatMap((item) => {
    if (!esObjeto(item)) return [];
    const titulo = texto(item.titulo).slice(0, 200);
    if (!titulo) return [];
    const etiquetas = lista(item.etiquetas).filter((e): e is string => typeof e === "string").map((e) => e.trim()).filter(Boolean).slice(0, 12);
    return [{ titulo, descripcion: texto(item.descripcion).slice(0, 500), payload: item.payload, etiquetas, licencia: texto(item.licencia) || "CC-BY-4.0" }];
  });
}

function evaluarAdn(payload: unknown, adn: AdnContexto | null): VeredictoAdn {
  if (!adn) return { ok: true, pruebas: [] };
  const serializado = JSON.stringify(payload) ?? "";
  const permitidos = new Set((adn.paleta ?? []).map((p) => p.hex.toLowerCase()));
  const fuera = permitidos.size === 0 ? [] : (serializado.match(PATRON_HEX) ?? []).filter((hex) => !permitidos.has(hex.toLowerCase()));
  if (fuera.length > 0) return { ok: false, pruebas: [] };
  const medidas = esObjeto(payload) ? payload : {};
  const pruebas: string[] = [];
  for (const prueba of adn.pruebas ?? []) {
    if (!prueba.auto) continue;
    const cumple = comprobar(prueba.comprobacion, medidas);
    if (cumple === false) return { ok: false, pruebas };
    if (cumple === true) pruebas.push(prueba.id);
  }
  return { ok: true, pruebas };
}

/** `null` = la prueba no se puede medir sobre este payload y no bloquea; `false` = no cumple. */
function comprobar(comprobacion: string, payload: Record<string, unknown>): boolean | null {
  const c = comprobacion.toLowerCase();
  const minimo = c.match(/(contraste|dianas|texto)\s*>=?\s*([\d.]+)/);
  if (minimo) return typeof payload[minimo[1]] === "number" ? (payload[minimo[1]] as number) >= Number(minimo[2]) : null;
  const maximo = c.match(/max\s+(\d+)\s+tamanos/);
  if (maximo) return Array.isArray(payload.tamanos) ? payload.tamanos.length <= Number(maximo[1]) : null;
  const cuerpo = c.match(/cuerpo\s*<=?\s*([\d.]+)/);
  if (cuerpo) return typeof payload.cuerpo === "string" ? payload.cuerpo.length <= Number(cuerpo[1]) : null;
  const radio = c.match(/radio\s+(?:botones\s+)?([\d.]+)rem/);
  if (radio) { const v = payload.radio; return typeof v === "number" ? Math.abs(v - Number(radio[1])) < 0.001 : v === `${radio[1]}rem`; }
  const sin = c.match(/sin\s+([a-z-]+)/);
  if (sin) { const v = payload[sin[1]]; return typeof v === "boolean" ? v === false : null; }
  if (c.includes("no anima dimensiones")) return payload.animarDimensiones !== true;
  if (c.includes("prefers-reduced-motion")) return payload.reducedMotion === true;
  return null;
}

function motivoDe(adn: AdnContexto | null, pruebas: string[]): string {
  const nombre = adn?.meta?.slug ?? adn?.meta?.nombre ?? "contexto";
  if (!adn) return "Pasa el validador; no se inyectó ADN del contexto";
  if (pruebas.length === 0) return `Pasa el validador; el ADN «${nombre}» no tiene pruebas automáticas medibles en este payload`;
  return `Pasa el validador y las pruebas automáticas del ADN «${nombre}» (${pruebas.join(", ")})`;
}
