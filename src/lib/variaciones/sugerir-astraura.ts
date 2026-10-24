/** Sugerencias de variaciones públicas con Astraura (architecture/variaciones-publicas.md §4). Puro: enrutador,
 * ADN y payload entran por parámetro; sin red, disco ni reloj. Escalera local primero (genesis-conectores-abiertos.md §2). */
import { validarVariacion } from "./validar";
export interface PruebaAdn { id: string; comprobacion: string; auto: boolean }
export interface AdnContexto { meta?: { nombre?: string; slug?: string }; pruebas?: PruebaAdn[]; prohibiciones?: string[] }
export type MedidasAdn = Record<string, boolean | number>;
export interface ContextoVariacion { payload: unknown; notas?: string; etiquetas?: string[]; codigo?: boolean; identidad?: string; adn?: AdnContexto | null }
export interface PeticionAstraura {
  clave: string; sistema: "variaciones-publicas"; maximo: 3; prompt: string; escalera: readonly string[]; relevo: string;
}
export interface DepsSugerirVariaciones { enrutar: (peticion: PeticionAstraura) => Promise<unknown>; adn?: AdnContexto | null }
export interface VariacionSugerida { clave: string; titulo: string; descripcion: string; payload: unknown; etiquetas: string[]; motivo: string; requiereAislamiento: boolean }
/** La escalera de genesis-conectores-abiertos.md §2: se baja de peldaño solo si el de arriba no puede. */
export const ESCALERA_LOCAL_PRIMERO = [
  "neurona del propio contexto", "otros modelos locales de la misma cuenta", "bolsa de la malla, solo si no es privado",
  "contenedores gratuitos del contexto", "proveedores gratuitos en la nube", "de pago solo con permiso y tope",
] as const;
function construirPrompt(clave: string, contexto: ContextoVariacion, adn?: AdnContexto | null): string {
  const auto = (adn?.pruebas ?? []).filter((p) => p.auto).map((p) => `${p.id}: ${p.comprobacion}`);
  const notas = typeof contexto.notas === "string" && validarVariacion(contexto.notas).ok ? contexto.notas : "";
  return [
    "Eres Astraura, la inteligencia del OS. Genera exactamente 3 variaciones públicas del elemento.",
    `Elemento: ${clave}${contexto.identidad ? ` · identidad ${contexto.identidad}` : ""}.`,
    `Escalera local primero: ${ESCALERA_LOCAL_PRIMERO.join(" → ")}.`,
    "Ningún proveedor se agota: ante 429/402, releva al siguiente sin insistir.",
    `Payload capturado (JSON): ${JSON.stringify(contexto.payload)}`,
    notas ? `Notas: ${notas}` : "",
    auto.length ? `Pruebas automáticas del ADN (id: comprobación): ${auto.join(" | ")}.` : "",
    adn?.prohibiciones?.length ? `Prohibiciones del contexto: ${adn.prohibiciones.join(", ")}.` : "",
    "Devuelve SOLO JSON: {\"variaciones\":[{\"titulo\":\"…\",\"descripcion\":\"…\",\"etiquetas\":[],\"payload\":{},\"motivo\":\"…\",\"medidas\":{\"p1\":true}}]}.",
    "Nada de datos privados, secretos, tokens ni claves; URLs solo https; el código se abre aislado.",
  ].filter(Boolean).join("\n");
}
const numero = (texto: string) => Number(texto.replace(",", "."));
/** Compara una medida numérica con «>=4.5», «<20», «20-30», «max 3» o «0.85rem». */
function cumpleNumero(valor: number, comprobacion: string): boolean | null {
  const t = comprobacion.toLowerCase();
  const rango = /(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/.exec(t);
  if (rango) return valor >= numero(rango[1]) && valor <= numero(rango[2]);
  const maximo = /max(?:imo)?\s+(\d+(?:[.,]\d+)?)/.exec(t);
  if (maximo) return valor <= numero(maximo[1]);
  const operador = /(>=|<=|>|<)\s*(\d+(?:[.,]\d+)?)/.exec(t);
  if (operador) {
    const limite = numero(operador[2]);
    return operador[1] === ">=" ? valor >= limite : operador[1] === "<=" ? valor <= limite : operador[1] === ">" ? valor > limite : valor < limite;
  }
  const igual = /(\d+(?:[.,]\d+)?)/.exec(t);
  return igual ? Math.abs(valor - numero(igual[1])) <= 0.01 : null;
}
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}
function hexSuelto(valor: unknown, ruta = ""): boolean {
  if (typeof valor === "string") return /#[0-9a-f]{3,8}\b/i.test(valor) && !/paleta|palette|colores|swatch/i.test(ruta);
  if (Array.isArray(valor)) return valor.some((v, i) => hexSuelto(v, `${ruta}[${i}]`));
  return esObjeto(valor) && Object.entries(valor).some(([k, v]) => hexSuelto(v, `${ruta}.${k}`));
}
function revisarAdn(payload: unknown, medidas: MedidasAdn, adn?: AdnContexto | null): { motivos: string[]; superadas: string[] } {
  const motivos: string[] = [], superadas: string[] = [];
  if (!adn) return { motivos, superadas };
  const texto = JSON.stringify(payload).toLowerCase();
  for (const prohibicion of adn.prohibiciones ?? []) {
    if (/hex.*suelto/i.test(prohibicion)) {
      if (hexSuelto(payload)) motivos.push("ADN: hay hexadecimales sueltos; usa tokens o una paleta");
    } else if (texto.includes(prohibicion.toLowerCase().trim())) motivos.push(`ADN: aparece «${prohibicion}», prohibido en este contexto`);
  }
  for (const prueba of adn.pruebas ?? []) {
    if (!prueba.auto) continue;
    const medida = medidas[prueba.id];
    if (typeof medida === "boolean") {
      if (medida) superadas.push(prueba.id); else motivos.push(`ADN ${prueba.id}: no supera «${prueba.comprobacion}»`);
    } else if (typeof medida === "number") {
      const ok = cumpleNumero(medida, prueba.comprobacion);
      if (ok === true) superadas.push(prueba.id);
      else if (ok === false) motivos.push(`ADN ${prueba.id}: ${medida} no cumple «${prueba.comprobacion}»`);
      else motivos.push(`ADN ${prueba.id}: «${prueba.comprobacion}» no se puede medir sola`);
    } else motivos.push(`ADN ${prueba.id}: falta la medición de «${prueba.comprobacion}»`);
  }
  return { motivos, superadas };
}
interface Candidato { titulo: string; descripcion: string; etiquetas: string[]; payload: unknown; motivo: string; medidas: MedidasAdn }
function leerCandidatos(respuesta: unknown): Candidato[] {
  let dato = respuesta;
  if (typeof dato === "string") { try { dato = JSON.parse(dato); } catch { return []; } }
  const lista = Array.isArray(dato) ? dato : esObjeto(dato) && Array.isArray(dato.variaciones) ? dato.variaciones : [];
  return lista.flatMap((item): Candidato[] => {
    if (!esObjeto(item) || !("payload" in item)) return [];
    const etiquetas = Array.isArray(item.etiquetas) ? item.etiquetas.filter((e): e is string => typeof e === "string") : [];
    return [{ titulo: typeof item.titulo === "string" ? item.titulo : "Variación sugerida",
      descripcion: typeof item.descripcion === "string" ? item.descripcion : "", etiquetas, payload: item.payload,
      motivo: typeof item.motivo === "string" ? item.motivo : "", medidas: esObjeto(item.medidas) ? item.medidas as MedidasAdn : {} }];
  });
}
/** Pide 3 variaciones al enrutador inyectado y devuelve solo las que pasan `validar.ts` y el ADN. */
export async function sugerirVariaciones(
  clave: string, contexto: ContextoVariacion, deps: DepsSugerirVariaciones,
): Promise<VariacionSugerida[]> {
  const entrada = validarVariacion(contexto.payload, { codigo: contexto.codigo });
  if (!entrada.ok) return [];
  const adn = deps.adn ?? contexto.adn ?? null;
  const peticion: PeticionAstraura = { clave, sistema: "variaciones-publicas", maximo: 3,
    prompt: construirPrompt(clave, contexto, adn), escalera: ESCALERA_LOCAL_PRIMERO,
    relevo: "429/402: siguiente de la escalera sin insistir; ningún proveedor se agota" };
  let respuesta: unknown;
  try { respuesta = await deps.enrutar(peticion); } catch { return []; }
  const sugeridas: VariacionSugerida[] = [];
  for (const candidato of leerCandidatos(respuesta)) {
    const validacion = validarVariacion(candidato.payload, { codigo: contexto.codigo });
    if (!validacion.ok) continue;
    const revisado = revisarAdn(candidato.payload, candidato.medidas, adn);
    if (revisado.motivos.length) continue;
    const pruebas = revisado.superadas.length ? `ADN: ${revisado.superadas.join(", ")}` : "sin pruebas de ADN";
    sugeridas.push({ clave, titulo: candidato.titulo, descripcion: candidato.descripcion, payload: candidato.payload,
      etiquetas: candidato.etiquetas,
      motivo: [candidato.motivo, pruebas, validacion.requiereAislamiento ? "se abre aislada" : ""].filter(Boolean).join(" · "),
      requiereAislamiento: validacion.requiereAislamiento });
    if (sugeridas.length === 3) break;
  }
  return sugeridas;
}
