// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura (contrato: architecture/variaciones-publicas.md §4).
// Módulo PURO: sin red, disco ni DOM. El enrutador, el ADN y el reloj entran inyectados.
// Escalera local primero (architecture/genesis-conectores-abiertos.md §2): nunca se paga sin permiso.
import { validarVariacion } from "./validar";
import { leerClave } from "./clave-elemento";

export const CANTIDAD_SUGERENCIAS = 3;
export const ESCALERA_LOCAL_PRIMERO = ["astraura-contexto", "modelos-locales", "bolsa-malla", "contenedores-gratis", "nube-gratis"] as const;
export type PruebaAdn = { id: string; comprobacion: string; auto?: boolean };
export type AdnDiseno = { nombre?: string; slug?: string; pruebas?: readonly PruebaAdn[] };
export type ContextoVariacion = { payload: unknown; codigo?: boolean; adn?: AdnDiseno | null };
export type CandidataVariacion = { titulo: string; descripcion?: string; payload: unknown; etiquetas?: readonly string[]; licencia?: string };
export type PeticionAstraura = { clave: string; familia: string; payload: unknown; cantidad: number; escalera: readonly string[]; permitirPago: boolean };
export type RespuestaAstraura = { ok: true; variaciones: readonly CandidataVariacion[]; via?: string } | { ok: false; motivo: string };
export type EnrutadorAstraura = (peticion: PeticionAstraura) => Promise<RespuestaAstraura> | RespuestaAstraura;
export type DepsSugerirAstraura = { enrutador: EnrutadorAstraura; permitirPago?: boolean; ahora?: () => number };
export type VariacionSugerida = { clave: string; titulo: string; descripcion: string; payload: unknown; motivo: string; pruebas: string[]; requiereAislamiento: boolean; etiquetas: string[]; licencia: string; sugeridaEn: number; via?: string };
export type DescartadaVariacion = { titulo: string; motivos: string[] };
export type ResultadoSugerencias = { ok: boolean; variaciones: VariacionSugerida[]; descartadas: DescartadaVariacion[]; motivo?: string; via?: string };
type Hoja = { clave: string; valor: unknown };
type Evaluacion = { aplica: boolean; pasa: boolean; motivo: string };
const evaluacion = (aplica: boolean, pasa: boolean, motivo: string): Evaluacion => ({ aplica, pasa, motivo });

const normalizar = (texto: string): string => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function hojas(valor: unknown, clave: string, salida: Hoja[]): Hoja[] {
  if (valor === null || typeof valor !== "object") { salida.push({ clave, valor }); return salida; }
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) hojas(v, Array.isArray(valor) ? clave : k, salida);
  return salida;
}
const textos = (payload: unknown): string[] => hojas(payload, "", []).map((h) => h.valor).filter((v): v is string => typeof v === "string");
const numeros = (payload: unknown, patron: RegExp): number[] => hojas(payload, "", []).filter((h) => patron.test(normalizar(h.clave)) && typeof h.valor === "number" && Number.isFinite(h.valor)).map((h) => h.valor as number);
function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16), canal = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}
function contrasteMaximo(payload: unknown): number {
  const cs = [...new Set(textos(payload).filter((t) => /^#[0-9a-f]{6}$/i.test(t)))];
  return cs.reduce((mejor, a, i) => cs.slice(i + 1).reduce((m, b) => {
    const x = luminancia(a) + 0.05, y = luminancia(b) + 0.05;
    return Math.max(m, Math.max(x, y) / Math.min(x, y));
  }, mejor), 0);
}

/** Aplica una prueba automática del ADN solo si el payload permite medirla. */
export function evaluarPruebaAdn(prueba: PruebaAdn, payload: unknown): Evaluacion {
  const t = normalizar(prueba.comprobacion);
  const tx = textos(payload);
  const numero = (re: RegExp) => { const m = t.match(re); return m ? Number(m[1]) : null; };
  const max = numero(/max (\d+) taman/);
  if (max !== null) { const tam = new Set(numeros(payload, /tama|size/)); return evaluacion(tam.size > 0, tam.size <= max, `${tam.size} tamaño(s) declarado(s); máximo ${max}`); }
  const rango = t.match(/tamanos (\d+)-(\d+)px/);
  if (rango) { const tam = numeros(payload, /tama|size/); const fuera = tam.filter((x) => x < Number(rango[1]) || x > Number(rango[2])); return evaluacion(tam.length > 0, fuera.length === 0, `${fuera.length} fuera de ${rango[1]}-${rango[2]}px`); }
  const cuerpo = numero(/cuerpo <=(\d+) chars?/);
  if (cuerpo !== null) { const largo = Math.max(0, ...tx.map((x) => x.length)); return evaluacion(tx.length > 0, largo <= cuerpo, `texto más largo ${largo} chars; máximo ${cuerpo}`); }
  const minimo = numero(/(?:dianas|texto) >=(\d+)px/);
  if (minimo !== null) { const vals = numeros(payload, /diana|target|toque|control|texto|titular/); const cortos = vals.filter((x) => x < minimo); return evaluacion(vals.length > 0, cortos.length === 0, `${cortos.length} por debajo de ${minimo}px`); }
  const contraste = numero(/contraste >=(\d+(?:\.\d+)?)/);
  if (contraste !== null) { const c = contrasteMaximo(payload); return evaluacion(c > 0, c >= contraste, c > 0 ? `contraste máximo ${c.toFixed(2)}:1` : "sin colores hex que medir"); }
  const radio = t.match(/radio (?:botones )?(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?/);
  if (radio) { const min = Number(radio[1]), maxR = radio[2] ? Number(radio[2]) : min; const radios = numeros(payload, /radio|radius/); const fuera = radios.filter((x) => x < min || x > maxR); return evaluacion(radios.length > 0, fuera.length === 0, `${fuera.length} fuera de ${min}-${maxR}`); }
  const sin = t.match(/^sin (.+)$/);
  if (sin) { const aguja = sin[1].split(/\s+/).find((x) => x.length >= 3) ?? sin[1]; const hallado = tx.find((x) => normalizar(x).includes(aguja)); return evaluacion(true, !hallado, hallado ? `aparece «${aguja}»` : `sin «${aguja}»`); }
  return evaluacion(false, true, "no medible con este payload");
}

export async function sugerirVariaciones(clave: string, contexto: ContextoVariacion, deps: DepsSugerirAstraura): Promise<ResultadoSugerencias> {
  const familia = clave.split(":")[0] ?? "";
  if (!leerClave(clave)) return { ok: false, variaciones: [], descartadas: [], motivo: "La clave del elemento debe ser <familia>:<id>." };
  const base = validarVariacion(contexto.payload, { codigo: contexto.codigo });
  if (!base.ok) return { ok: false, variaciones: [], descartadas: [], motivo: `El estado capturado no se puede publicar: ${base.motivos[0]}` };
  const permitirPago = deps.permitirPago === true;
  const escalera = permitirPago ? [...ESCALERA_LOCAL_PRIMERO, "pago"] : [...ESCALERA_LOCAL_PRIMERO];
  let respuesta: RespuestaAstraura;
  try {
    respuesta = await deps.enrutador({ clave, familia, payload: contexto.payload, cantidad: CANTIDAD_SUGERENCIAS, escalera, permitirPago });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "error desconocido";
    return { ok: false, variaciones: [], descartadas: [], motivo: `Astraura no respondió: ${detalle}` };
  }
  if (!respuesta.ok) return { ok: false, variaciones: [], descartadas: [], motivo: respuesta.motivo };
  const nombreAdn = contexto.adn?.nombre ?? contexto.adn?.slug;
  const ahora = deps.ahora?.() ?? 0;
  const variaciones: VariacionSugerida[] = [];
  const descartadas: DescartadaVariacion[] = [];
  for (const candidata of respuesta.variaciones.slice(0, CANTIDAD_SUGERENCIAS)) {
    const validacion = validarVariacion(candidata.payload, { codigo: contexto.codigo });
    const motivos = validacion.ok ? [] : [...validacion.motivos];
    const evaluadas = (contexto.adn?.pruebas ?? []).filter((p) => p.auto === true).map((p) => ({ p, r: evaluarPruebaAdn(p, candidata.payload) }));
    const medibles = evaluadas.filter((e) => e.r.aplica);
    for (const e of medibles) if (!e.r.pasa) motivos.push(`ADN ${nombreAdn ?? ""} ${e.p.id}: ${e.r.motivo}`);
    if (!validacion.ok || motivos.length) { descartadas.push({ titulo: candidata.titulo, motivos }); continue; }
    const noMedibles = evaluadas.length - medibles.length;
    const motivo = nombreAdn
      ? `Cumple el validador y ${medibles.length} prueba(s) medible(s) del ADN «${nombreAdn}»${noMedibles ? ` (${noMedibles} no medible(s) con este payload)` : ""}.`
      : "Cumple el validador; no hay ADN inyectado que medir.";
    variaciones.push({
      clave, titulo: candidata.titulo, descripcion: candidata.descripcion ?? "", payload: candidata.payload, motivo,
      pruebas: medibles.map((e) => e.p.id), requiereAislamiento: validacion.requiereAislamiento,
      etiquetas: [...(candidata.etiquetas ?? [])], licencia: candidata.licencia ?? "CC-BY-4.0",
      sugeridaEn: ahora, ...(respuesta.via ? { via: respuesta.via } : {}),
    });
  }
  return {
    ok: variaciones.length > 0, variaciones, descartadas,
    ...(variaciones.length ? {} : { motivo: "Astraura no devolvió ninguna variación que pase el validador y el ADN." }),
    ...(respuesta.via ? { via: respuesta.via } : {}),
  };
}
