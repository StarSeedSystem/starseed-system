// src/lib/variaciones/sugerir-astraura.ts
// Sugerencias de variaciones con Astraura (architecture/variaciones-publicas.md §4).
// Puro: el enrutador y el ADN del contexto se inyectan; aquí no hay red, disco, reloj ni DOM.
// Escalera local primero (genesis-conectores-abiertos.md §2): gratis antes que nube y pago.
// Una variación solo se devuelve si pasa `validarVariacion`; una prueba del ADN solo suspende
// si su métrica está medida, y si falta se marca «sin medir» (nunca se inventa un veredicto).
import { leerClave } from "./clave-elemento";
import { validarVariacion } from "./validar";

/** Peldaños de la escalera: lo local más potente primero y lo de pago al final. */
export const ESCALERA_LOCAL_PRIMERO = ["astraura-local", "modelos-locales", "malla", "contenedores", "nube-gratis", "pago"] as const;
export type EscalonAstraura = (typeof ESCALERA_LOCAL_PRIMERO)[number];

export interface PruebaAdn { id: string; comprobacion: string; auto?: boolean }
export interface AdnContexto { slug: string; nombre?: string; pruebas?: PruebaAdn[] }
/** Métricas canónicas del ADN, las mismas que `scripts/puente/adn_comprobar.py`. */
export interface MetricasAdn { acento_porcentaje?: number; numero_tamanos?: number; ratio_titular_cuerpo?: number;
  tamanio_minimo_texto?: number; longitud_maxima_linea?: number; jugada_rara_veces?: number; contraste?: number;
  tamanio_minimo_diana?: number }
export interface ContextoVariacion { payload: unknown; familia?: string; etiquetas?: string[]; descripcion?: string; tema?: string }
export interface CandidatoSugerido { titulo: string; descripcion?: string; payload: unknown; metricas?: MetricasAdn;
  licencia?: string; etiquetas?: string[]; origen?: string }
export interface PeticionSugerencias { clave: string; familia: string; contexto: ContextoVariacion; cuantas: number;
  escalera: readonly EscalonAstraura[]; pruebasAdn: PruebaAdn[]; slugAdn: string; gratisPrimero: true }
/** El enrutador real de Astraura se adapta a esta firma; la escalera local primero va dentro. */
export type EnrutadorAstraura = (peticion: PeticionSugerencias) => Promise<CandidatoSugerido[]>;
export interface DepsSugerir { enrutador: EnrutadorAstraura; adn?: AdnContexto | null; escalera?: readonly EscalonAstraura[] }
export interface VariacionSugerida { titulo: string; descripcion?: string; payload: unknown; licencia: string;
  etiquetas: string[]; origen: string; requiereAislamiento: boolean; motivo: string }
export interface DescartadaSugerencia { titulo: string; motivos: string[] }
export interface ResultadoSugerencias { disponible: boolean; escalera: EscalonAstraura[]; variaciones: VariacionSugerida[];
  descartadas: DescartadaSugerencia[]; error?: string }
export type VeredictoAdn = { id: string; estado: "aprobado" | "suspenso" | "sin-medir"; detalle: string };

/** Cuántas variaciones se piden y, como mucho, se devuelven. */
export const VARIACIONES_SUGERIDAS = 3;
/** Familias cuyas variaciones son código: se abren solo aisladas (sin allow-same-origin). */
const FAMILIAS_DE_CODIGO = new Set(["atomo", "herramienta"]);

const REGLAS_MEDIBLES: Record<string, { metrica: keyof MetricasAdn; patron: RegExp; modo: "rango" | "max" | "min" | "igual" }> = {
  p1: { metrica: "acento_porcentaje", patron: /acento\s+(\d+)\s*[–-]\s*(\d+)\s*%/, modo: "rango" },
  p2: { metrica: "numero_tamanos", patron: /(?:máximo|max)\s+(\d+)\s+tama(?:ñ|n)os/, modo: "max" },
  p3: { metrica: "ratio_titular_cuerpo", patron: /titular\/cuerpo\s*(?:>=|≥)\s*(\d+)/, modo: "min" },
  p4: { metrica: "tamanio_minimo_texto", patron: /texto\s*(?:>=|≥)\s*(\d+)\s*px/, modo: "min" },
  p5: { metrica: "longitud_maxima_linea", patron: /cuerpo\s*(?:<=|≤)\s*(\d+)/, modo: "max" },
  p6: { metrica: "jugada_rara_veces", patron: /jugada\s*rara\s*(\d+)\s*ve(?:z|ces)/, modo: "igual" },
  p7: { metrica: "contraste", patron: /contraste\s*(?:>=|≥)\s*([\d.]+)/, modo: "min" },
  p8: { metrica: "tamanio_minimo_diana", patron: /dianas\s*(?:>=|≥)\s*(\d+)\s*px/, modo: "min" },
};

/** Evalúa las pruebas del ADN con las métricas medidas; si son manuales o falta la métrica, no inventa veredicto. */
export function evaluarPruebasAdn(pruebas: PruebaAdn[], metricas?: MetricasAdn): VeredictoAdn[] {
  return pruebas.map((prueba) => {
    const regla = REGLAS_MEDIBLES[prueba.id];
    if (prueba.auto === false || !regla) return { id: prueba.id, estado: "sin-medir", detalle: "Prueba manual del ADN" };
    const umbral = regla.patron.exec(prueba.comprobacion.toLowerCase());
    if (!umbral) return { id: prueba.id, estado: "sin-medir", detalle: "No se pudo extraer el umbral" };
    const valor = metricas?.[regla.metrica];
    if (typeof valor !== "number") return { id: prueba.id, estado: "sin-medir", detalle: `Sin métrica ${regla.metrica}` };
    const a = Number(umbral[1]), b = regla.modo === "rango" ? Number(umbral[2]) : a;
    const ok = regla.modo === "rango" ? valor >= a && valor <= b : regla.modo === "max" ? valor <= a
      : regla.modo === "min" ? valor >= a : valor === a;
    return { id: prueba.id, estado: ok ? "aprobado" : "suspenso", detalle: `${prueba.comprobacion}: ${valor}` };
  });
}

/** Pide 3 variaciones al enrutador de Astraura y devuelve solo las que pasan validador y ADN, con su motivo. */
export async function sugerirVariaciones(clave: string, contexto: ContextoVariacion, deps: DepsSugerir): Promise<ResultadoSugerencias> {
  const escalera = [...(deps.escalera ?? ESCALERA_LOCAL_PRIMERO)];
  const base = { disponible: true, escalera, variaciones: [] as VariacionSugerida[], descartadas: [] as DescartadaSugerencia[] };
  if (!leerClave(clave)) return { ...base, error: `Clave: «${clave}» no es una clave de elemento válida` };
  const contextoValido = validarVariacion(contexto.payload);
  if (!contextoValido.ok) return { ...base, error: `Contexto: ${contextoValido.motivos[0]} (no se envía nada privado a Astraura)` };
  const familia = clave.split(":")[0], pruebasAdn = deps.adn?.pruebas ?? [];
  let candidatos: CandidatoSugerido[];
  try {
    candidatos = await deps.enrutador({ clave, familia, contexto, cuantas: VARIACIONES_SUGERIDAS, escalera, pruebasAdn, slugAdn: deps.adn?.slug ?? "", gratisPrimero: true });
  } catch (e) {
    return { ...base, disponible: false, error: `Astraura: ${e instanceof Error ? e.message : "sin conexión"}` };
  }
  if (!Array.isArray(candidatos)) return { ...base, disponible: false, error: "Astraura: la respuesta no es una lista de variaciones" };
  for (const candidato of candidatos) {
    if (base.variaciones.length >= VARIACIONES_SUGERIDAS) break;
    const titulo = typeof candidato?.titulo === "string" ? candidato.titulo.trim() : "";
    const licencia = typeof candidato?.licencia === "string" ? candidato.licencia.trim() : "";
    const motivos: string[] = [];
    if (!titulo || titulo.length > 200) motivos.push("Título: entre 1 y 200 caracteres");
    if (!licencia) motivos.push("Licencia: toda variación declara su licencia");
    const datos = validarVariacion(candidato?.payload, { codigo: FAMILIAS_DE_CODIGO.has(familia) });
    if (!datos.ok) motivos.push(...datos.motivos);
    const ficha = validarVariacion({ titulo, descripcion: candidato?.descripcion ?? "", etiquetas: candidato?.etiquetas ?? [] });
    if (!ficha.ok) motivos.push(...ficha.motivos);
    const veredictos = evaluarPruebasAdn(pruebasAdn, candidato?.metricas);
    motivos.push(...veredictos.filter((v) => v.estado === "suspenso").map((v) => `ADN ${v.id}: ${v.detalle}`));
    if (motivos.length) { base.descartadas.push({ titulo: titulo || "(sin título)", motivos }); continue; }
    const aprobadas = veredictos.filter((v) => v.estado === "aprobado").map((v) => v.id);
    const sinMedir = veredictos.filter((v) => v.estado === "sin-medir").map((v) => v.id);
    const motivo = [`Validador: ${datos.requiereAislamiento ? "código aislado (iframe sandbox)" : "JSON plano, sin secretos ni claves privadas"}`];
    if (deps.adn) motivo.push(`ADN ${deps.adn.slug}: ${aprobadas.length ? aprobadas.join(", ") : "sin pruebas medidas"}`);
    if (sinMedir.length) motivo.push(`ADN sin medir: ${sinMedir.join(", ")}`);
    base.variaciones.push({ titulo, descripcion: candidato.descripcion?.trim() || undefined, payload: candidato.payload,
      licencia, etiquetas: [...(candidato.etiquetas ?? [])].slice(0, 8), origen: candidato.origen ?? "astraura",
      requiereAislamiento: datos.requiereAislamiento, motivo: motivo.join(" · ") });
  }
  return base;
}
