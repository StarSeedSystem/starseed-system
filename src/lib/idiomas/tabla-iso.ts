/**
 * TRA1116 · Tabla propia de códigos de idioma (contrato: architecture/traductor-universal.md, parte A1).
 * Módulo PURO: datos y una función de dirección; sin React, sin `node:*` ni red.
 */

const ISO_639_1 =
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu";

/** ~184 códigos ISO 639-1 y cinco códigos de tres letras de uso frecuente. */
export const CODIGOS_ISO: readonly string[] = [
  ...ISO_639_1.split(" "),
  "fil",
  "haw",
  "yue",
  "ckb",
  "zh-hant",
];

/**
 * Los ~30 idiomas con más hablantes, en orden aproximado de hablantes nativos.
 * Es conocimiento general y no una cifra comprobada con una fuente: sirve para
 * ordenar sugerencias, no para afirmar un censo. `jv`, `te`, `mr`, `ta`, `gu`,
 * `ml` y `kn` están aquí por su peso demográfico, no por su presencia en la UI.
 */
export const MAS_HABLADOS: readonly string[] = [
  "zh", "es", "en", "hi", "ar", "bn", "pt", "ru", "ja", "pa",
  "de", "jv", "ko", "fr", "te", "mr", "tr", "ta", "vi", "ur",
  "it", "th", "gu", "fa", "pl", "uk", "ml", "kn", "my", "id",
];

/** Escrituras que se leen de derecha a izquierda (árabe, hebreo, persa…). */
export const ESCRITURAS_RTL: readonly string[] = [
  "ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb",
];

/**
 * Alias de búsqueda: nombre en español (con y sin acento) → códigos de la tabla.
 * Se usan para que «castellano» o «mandarín» encuentren su idioma sin que el
 * usuario tenga que saber el código ISO.
 */
export const ALIAS: Record<string, string[]> = {
  "chino": ["zh"],
  "chino simplificado": ["zh"],
  "chino tradicional": ["zh-hant"],
  "mandarín": ["zh"],
  "mandarin": ["zh"],
  "cantonés": ["yue"],
  "canton": ["yue"],
  "castellano": ["es"],
  "español": ["es"],
  "espanol": ["es"],
  "inglés": ["en"],
  "ingles": ["en"],
  "farsi": ["fa"],
  "persa": ["fa"],
  "hebreo": ["he"],
  "griego": ["el"],
  "tagalo": ["fil"],
  "tagalog": ["fil"],
  "árabe": ["ar"],
  "arabe": ["ar"],
  "japonés": ["ja"],
  "japones": ["ja"],
  "coreano": ["ko"],
  "ruso": ["ru"],
  "alemán": ["de"],
  "aleman": ["de"],
  "deu": ["de"],
  "ger": ["de"],
  "francés": ["fr"],
  "frances": ["fr"],
  "portugués": ["pt"],
  "portugues": ["pt"],
  "italiano": ["it"],
  "hindi": ["hi"],
  "bengalí": ["bn"],
  "bengali": ["bn"],
  "turco": ["tr"],
  "neerlandés": ["nl"],
  "neerlandes": ["nl"],
  "holandés": ["nl"],
  "holandes": ["nl"],
  "hawaiano": ["haw"],
  "kurdo": ["ku", "ckb"],
};

/** ¿Este código se escribe de derecha a izquierda? Acepta variantes como «ar-EG». */
export function esRtl(codigo: string): boolean {
  const base = String(codigo ?? "").trim().toLowerCase().split("-")[0];
  return ESCRITURAS_RTL.includes(base);
}
