import type { Molecula, Ambito, Capa, AtomoEnUso, ReferenciaEntidad, EstadoValores, ValorParametro } from "./tipos";

/**
 * Valida si un objeto es una molécula válida (núcleo).
 * Adaptado de almacen-moleculas.ts pero para los tipos del núcleo.
 */
function esMoleculaValidaNucleo(x: unknown): x is Molecula {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Molecula;
  // id y titulo strings no vacíos
  if (typeof m.id !== "string" || m.id === "" || typeof m.titulo !== "string" || m.titulo === "") return false;
  // ambito debe ser uno de los valores válidos
  const ambitoValido = (a: Ambito): a is Ambito => {
    return ["personal", "perfil", "grupo", "publica"].includes(a);
  };
  if (!ambitoValido(m.ambito)) return false;
  // capas array
  if (!Array.isArray(m.capas)) return false;
  for (const capa of m.capas) {
    if (!capa || typeof capa !== "object") return false;
    if (typeof capa.id !== "string" || capa.id === "" || typeof capa.tipo !== "string" || typeof capa.titulo !== "string" || typeof capa.formato !== "string") return false;
    if (capa.referencia !== null) {
      const ref = capa.referencia as ReferenciaEntidad;
      if (typeof ref.tipo !== "string" || ref.tipo === "" || typeof ref.id !== "string" || ref.id === "") return false;
    }
    if (typeof capa.orden !== "number" || !Number.isFinite(capa.orden)) return false;
    if (typeof capa.visible !== "boolean" || typeof capa.bloqueada !== "boolean") return false;
  }
  // atomos array
  if (!Array.isArray(m.atomos)) return false;
  for (const atomo of m.atomos) {
    if (!atomo || typeof atomo !== "object") return false;
    if (typeof atomo.id !== "string" || atomo.id === "" || typeof atomo.herramientaId !== "string" || atomo.herramientaId === "") return false;
    if (atomo.capaId !== undefined && (typeof atomo.capaId !== "string" || atomo.capaId === "")) return false;
    if (atomo.titulo !== undefined && (typeof atomo.titulo !== "string" || atomo.titulo === "")) return false;
    if (atomo.ejecutaEn !== undefined && !["navegador", "app-nativa", "neurona-nas", "neurona-procesador", "oracle-a1", "nube"].includes(atomo.ejecutaEn)) return false;
    if (atomo.estado !== "activo" && atomo.estado !== "suspendido") return false;
  }
  // valores record
  if (typeof m.valores !== "object" || m.valores === null || Array.isArray(m.valores)) return false;
  for (const valor of Object.values(m.valores)) {
    if (typeof valor !== "number" && typeof valor !== "boolean" && typeof valor !== "string") return false;
  }
  // version, creadaEn, actualizadaEn numbers finitos
  if (typeof m.version !== "number" || !Number.isFinite(m.version)) return false;
  if (typeof m.creadaEn !== "number" || !Number.isFinite(m.creadaEn)) return false;
  if (typeof m.actualizadaEn !== "number" || !Number.isFinite(m.actualizadaEn)) return false;
  // tamaño máximo
  try {
    if (JSON.stringify(m).length > 256 * 1024) { // TAMANO_MAXIMO_BYTES from almacen-moleculas.ts
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Serializa una molécula a una cadena JSON versionada.
 * Formato: {pm: 1, molecula: <Molecula>}
 * Límite: 32 KB.
 * Devuelve {ok: true, texto: string} | {ok: false, motivo: string}.
 */
export function serializarBloque(m: Molecula): {ok: true; texto: string} | {ok: false; motivo: string} {
  if (!esMoleculaValidaNucleo(m)) {
    return {ok: false, motivo: "molécula inválida"};
  }
  const objeto = {pm: 1, molecula: m};
  const json = JSON.stringify(objeto);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  if (bytes.length > 32 * 1024) {
    return {ok: false, motivo: `tamaño excedido: ${bytes.length} bytes, límite 32 KB`};
  }
  return {ok: true, texto: json};
}

/**
 * Deserializa una cadena JSON a una molécula.
 * Valida estrictamente con esMoleculaValidaNucleo.
 * Devuelve {ok: true, molecula: Molecula} | {ok: false, motivo: string}.
 */
export function leerBloque(texto: string): {ok: true; molecula: Molecula} | {ok: false; motivo: string} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto);
  } catch (e) {
    return {ok: false, motivo: "JSON no válido"};
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !("pm" in parsed) ||
    !("molecula" in parsed)
  ) {
    return {ok: false, motivo: "estructura no esperada"};
  }
  const {pm, molecula} = parsed as {pm: number; molecula: unknown};
  if (pm !== 1) {
    return {ok: false, motivo: `versión no soportada: ${pm}`};
  }
  if (!esMoleculaValidaNucleo(molecula)) {
    return {ok: false, motivo: "molécula inválida"};
  }
  return {ok: true, molecula: molecula as Molecula};
}

/**
 * Genera avisos de publicación para una molécula en un ámbito de post.
 * - La molécula es más reservada que la publicación: devuelve avisos.
 * - Capas que citan algo más reservado que el ámbito de la publicación.
 * - El bloque es una instantánea: quien lo vea tendrá una copia, no la original.
 * Devuelve un array de frases en español.
 */
export function avisosDePublicacion(
  m: Molecula,
  ambitoPost: Ambito,
  ambitoDe: (tipo: string, id: string) => Ambito
): string[] {
  const avisos: string[] = [];

  // 1. La molécula es más reservada que la publicación
  const indiceAmbito = (a: Ambito): number => {
    // Orden: personal < perfil < grupo < pública
    const orden: Record<Ambito, number> = {
      personal: 0,
      perfil: 1,
      grupo: 2,
      publica: 3
    };
    return orden[a];
  };
  if (indiceAmbito(m.ambito) < indiceAmbito(ambitoPost)) {
    avisos.push(`La molécula es más reservada (${m.ambito}) que la publicación (${ambitoPost}). quien la vea tendrá una copia propia.`);
  }

  // 2. Capas que citan algo más reservado que el ámbito de la publicación
  for (const capa of m.capas) {
    if (capa.referencia) {
      const ambitoReferencia = ambitoDe(capa.referencia.tipo, capa.referencia.id);
      if (indiceAmbito(ambitoReferencia) < indiceAmbito(ambitoPost)) {
        avisos.push(`La capa "${capa.titulo}" cita una entidad más reservada (${ambitoReferencia}) que la publicación (${ambitoPost}).`);
      }
    }
  }

  return avisos;
}