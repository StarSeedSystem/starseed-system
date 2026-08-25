/**
 * avatar-busqueda-logica.ts — TODA la lógica de "buscar avatar en línea",
 * pura y sin red (ni `fetch`, ni React, ni `"use client"`).
 * ----------------------------------------------------------------------------
 * Mismo motivo que `genesis-logic.ts` explica de sí mismo: separar "qué
 * significan estos datos" de "cómo se pintan o de dónde vienen" para poder
 * probarlo sin montar un componente ni simular un backend — y aquí hay una
 * segunda razón, más dura: este fichero lo importan DOS lados que no deben
 * divergir nunca — `src/app/api/avatar-search/route.ts` (servidor, donde se
 * filtra por licencia con la clave delante) y los componentes de `avatar/`
 * (navegador, donde se decide qué cuerpo pintar). Una sola función de
 * filtrado, un solo sitio donde se decide qué licencia es "libre" de
 * verdad — nunca dos copias que un día digan cosas distintas.
 *
 * LA REGLA DURA DE ALEX, en código: `candidatoDesdeOpenverse` y
 * `filtrarCandidatosLibres` son los DOS ÚNICOS sitios por los que pasa
 * cualquier candidato antes de llegar a la interfaz, y los dos aplican la
 * MISMA lista de licencias permitidas (`LICENCIAS_LIBRES`). Un recurso sin
 * licencia reconocida, o con una licencia que prohíbe uso comercial
 * (`nc`) u obra derivada (`nd`), no sale de aquí — nunca, ni como
 * "por si acaso lo quieres ver". Elegir una imagen ajena sin saber si se
 * puede usar no es una funcionalidad, es un problema legal para Alex.
 */

import { fnv1a32, type SolidoBase } from "@/lib/astraura/genesis-dna";
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";

/* ═══════════════════════════════════════════════ 1 · Licencias libres ═══ */

/**
 * Licencias que SÍ se ofrecen — dominio público puro (`cc0`, marca de
 * dominio público `pdm`) o Creative Commons que permite EXPLÍCITAMENTE uso
 * comercial Y obra derivada (`by`, `by-sa`). Es exactamente lo que además
 * se le pide al proveedor vía `license_type=commercial,modification` (ver
 * la ruta) — esta lista es la SEGUNDA barrera, no la única: si el
 * proveedor cambiara de comportamiento, o mañana se sumara otro que no
 * filtre igual de bien, esta sigue siendo la última palabra sobre qué SE
 * PUEDE OFRECER. Deliberadamente SIN ninguna variante "nc" (no comercial)
 * ni "nd" (sin obra derivada).
 */
export const LICENCIAS_LIBRES = ["cc0", "pdm", "by", "by-sa"] as const;
export type LicenciaLibre = (typeof LICENCIAS_LIBRES)[number];

/** Etiqueta legible por licencia — lo que de verdad ve la persona. */
const ETIQUETA_LICENCIA: Record<LicenciaLibre, string> = {
  cc0: "CC0 (dominio público)",
  pdm: "Marca de dominio público",
  by: "CC BY",
  "by-sa": "CC BY-SA",
};

/** ¿Es este slug de licencia (en crudo, tal como lo declara el proveedor) uno de los libres conocidos? */
export function licenciaEsLibre(licencia: string | null | undefined): licencia is LicenciaLibre {
  if (!licencia) return false;
  return (LICENCIAS_LIBRES as readonly string[]).includes(licencia.trim().toLowerCase());
}

/**
 * Segunda barrera, deliberadamente redundante con `candidatoDesdeOpenverse`:
 * filtra una lista YA construida de candidatos y se queda solo con los que
 * declaran una licencia libre reconocida. Solo aplica a `modo === "enlinea"`
 * — un "subido" es responsabilidad de quien lo sube (su propio archivo, no
 * un hallazgo ajeno) y un "procedural" no tiene licencia que discutir.
 * Existe para que NINGÚN camino futuro (otro proveedor, una lista compuesta
 * a mano) pueda colar un candidato sin licencia conocida hasta la interfaz.
 */
export function filtrarCandidatosLibres(candidatos: readonly FuenteAvatar[]): FuenteAvatar[] {
  const etiquetasLibres = Object.values(ETIQUETA_LICENCIA);
  return candidatos.filter((c) => {
    if (c.modo !== "enlinea") return true;
    if (!c.licencia) return false; // sin licencia conocida: fuera, sin excepción.
    // IGUAL a la etiqueta, o la etiqueta seguida de un espacio y la versión
    // (`"CC BY 4.0"`) — NUNCA un `startsWith` a secas: "CC BY-NC 4.0"
    // también empieza por la cadena "CC BY" y coincidiría por accidente
    // con una licencia que SÍ prohíbe uso comercial. El espacio de después
    // es lo que distingue "CC BY" (la etiqueta completa) de "CC BY-NC"
    // (una etiqueta distinta que por casualidad comparte prefijo).
    return etiquetasLibres.some((etiqueta) => c.licencia === etiqueta || c.licencia!.startsWith(`${etiqueta} `));
  });
}

/* ═══════════════════════════════════════ 2 · Mapear un resultado crudo ═══ */

/**
 * Lo que leemos de UN resultado crudo de Openverse — solo los campos que
 * usamos, y todos `unknown`: es una API ajena, nunca asumimos que un campo
 * concreto vendrá con el tipo (o la presencia) que esperamos.
 * https://api.openverse.org/v1/images/ — ver el informe para la referencia
 * completa de por qué este proveedor y no otro.
 */
export interface CandidatoCrudoProveedor {
  url?: unknown;
  thumbnail?: unknown;
  license?: unknown;
  license_version?: unknown;
  creator?: unknown;
  title?: unknown;
  source?: unknown;
  provider?: unknown;
  foreign_landing_url?: unknown;
  attribution?: unknown;
}

function textoONulo(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Convierte UN resultado crudo del proveedor en un candidato `FuenteAvatar`
 * — o `null` si no cumple lo mínimo: sin licencia libre conocida (la regla
 * dura, aplicada aquí, en el único sitio por el que pasa CUALQUIER
 * candidato antes de existir como tal) o sin imagen utilizable.
 *
 * `elegidoEn` sale siempre en `null`: esto es un CANDIDATO, no una
 * elección — se vuelve real recién cuando alguien llama a
 * `confirmarEleccionAvatar` (ver más abajo), nunca antes.
 */
export function candidatoDesdeOpenverse(crudo: CandidatoCrudoProveedor, consulta: string): FuenteAvatar | null {
  const licenciaCruda = textoONulo(crudo.license)?.toLowerCase() ?? null;
  if (!licenciaEsLibre(licenciaCruda)) return null;
  // A partir de aquí TypeScript ya sabe que `licenciaCruda` es `LicenciaLibre`.

  const url = textoONulo(crudo.thumbnail) ?? textoONulo(crudo.url);
  if (!url) return null; // sin imagen que mostrar, no es un candidato de verdad.

  const version = textoONulo(crudo.license_version);
  const licenciaLegible = version ? `${ETIQUETA_LICENCIA[licenciaCruda]} ${version}` : ETIQUETA_LICENCIA[licenciaCruda];

  const creador = textoONulo(crudo.creator);
  const titulo = textoONulo(crudo.title);
  const fuenteTexto = textoONulo(crudo.source) ?? textoONulo(crudo.provider) ?? "openverse";
  const enlaceOrigen = textoONulo(crudo.foreign_landing_url);

  // Preferimos la atribución YA REDACTADA por el proveedor (formato TASL:
  // Título, Autor, licencia — Openverse la trae hecha) y solo la componemos
  // nosotros si no vino — nunca inventamos un autor que el proveedor no
  // declaró explícitamente.
  const atribucionProveedor = textoONulo(crudo.attribution);
  const atribucionPropia = [titulo ? `"${titulo}"` : null, creador ? `de ${creador}` : null, `(${fuenteTexto})`]
    .filter((parte): parte is string => parte !== null)
    .join(" ");
  const atribucionBase = atribucionProveedor ?? atribucionPropia;
  const atribucion = enlaceOrigen ? `${atribucionBase} — ${enlaceOrigen}` : atribucionBase;

  return {
    modo: "enlinea",
    url,
    consulta,
    proveedor: `Openverse · ${fuenteTexto}`,
    licencia: licenciaLegible,
    atribucion,
    elegidoEn: null,
  };
}

/* ═══════════════════════════════════════ 3 · Componer la consulta ═══════ */

/**
 * Lo mínimo que hace falta saber de un ser para componerle una búsqueda —
 * el mismo espíritu que `SemillaSer` en `genesis-dna.ts`: un subconjunto
 * deliberado, no `Ser` entero, para que cualquier llamador (interfaz,
 * futura automatización) pueda usarlo sin cargar el objeto completo del
 * backend. `arquetipo` es el mismo campo que decide el sólido en el ADN
 * (`SemillaSer.arquetipo`); si no se declaró en el ser, `solido` — el que
 * SÍ quedó derivado — sirve de sustituto: dos formas de la misma idea.
 */
export interface SemillaBusquedaAvatar {
  nombre: string;
  rol?: string | null;
  /** Nombre de la personalidad dominante (la primera asignada), si tiene. */
  personalidadNombre?: string | null;
  arquetipo?: string | null;
  solido?: SolidoBase | null;
}

/** Palabra de búsqueda (en inglés — así están etiquetadas la mayoría de las
 *  fuentes que agrega Openverse) por sólido: un eco temático del cuerpo
 *  procedural real del ser, no una traducción literal que no encontraría
 *  nada en un catálogo de fotografía. */
const PALABRA_BUSQUEDA_POR_SOLIDO: Record<SolidoBase, string> = {
  tetraedro: "tetrahedron crystal",
  cubo: "cube crystal geometric",
  octaedro: "octahedron gem",
  dodecaedro: "dodecahedron sacred geometry",
  icosaedro: "icosahedron geometric art",
  esfera: "sphere orb light",
};

const LONGITUD_MAXIMA_CONSULTA = 120;

/**
 * Compone la consulta de búsqueda a partir de lo que el ser ES — nombre,
 * personalidad, arquetipo (o su sustituto, el sólido) y rol — sin que nadie
 * teclee nada: esta es la pieza que hace posible el punto 2 del encargo
 * ("cuando quieran"). Determinista: el mismo ser compone siempre la misma
 * consulta — si cambia, es porque el ser cambió, nunca por azar.
 *
 * Nunca devuelve cadena vacía: aunque todos los campos vengan vacíos, el
 * sufijo fijo garantiza una consulta usable.
 */
export function componerConsultaAvatar(semilla: SemillaBusquedaAvatar): string {
  const arquetipoTexto = (semilla.arquetipo ?? "").trim();
  const palabraArquetipo = arquetipoTexto || (semilla.solido ? PALABRA_BUSQUEDA_POR_SOLIDO[semilla.solido] : "");

  const terminos = [semilla.nombre, semilla.personalidadNombre, palabraArquetipo, semilla.rol, "portrait avatar art"];

  const vistos = new Set<string>();
  const unicos: string[] = [];
  for (const t of terminos) {
    const limpio = (t ?? "").replace(/\s+/g, " ").trim();
    if (!limpio) continue;
    const clave = limpio.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    unicos.push(limpio);
  }

  const consulta = unicos.join(" ").trim();
  return consulta.length > LONGITUD_MAXIMA_CONSULTA ? consulta.slice(0, LONGITUD_MAXIMA_CONSULTA).trim() : consulta;
}

/* ═══════════════════════════════════════ 4 · Elegir sin humano de por medio ═ */

/**
 * Elige UN candidato de una lista YA filtrada por licencia, de forma
 * determinista: el mismo `semillaId` (normalmente el id del ser) con la
 * MISMA lista de candidatos siempre produce la MISMA elección — igual que
 * `derivarAdn` nunca tira un dado. Reutiliza el mismo hash (`fnv1a32`) que
 * ya usa el ADN: ni un algoritmo de mezcla nuevo, ni una segunda fuente de
 * "aleatoriedad" en el proyecto.
 *
 * Con la lista vacía devuelve `null` — nunca revienta, nunca inventa un
 * candidato de la nada. El resultado sigue siendo un CANDIDATO
 * (`elegidoEn: null`): elegir sin que un humano teclee nada no es lo mismo
 * que confirmarlo — eso es `confirmarEleccionAvatar`, aparte.
 */
export function elegirCandidatoDeterminista(candidatos: readonly FuenteAvatar[], semillaId: string): FuenteAvatar | null {
  const libres = filtrarCandidatosLibres(candidatos).filter((c) => c.modo === "enlinea" && !!c.url);
  if (libres.length === 0) return null;
  const indice = fnv1a32(`${semillaId}|${libres.length}`) % libres.length;
  return libres[indice];
}

/* ═══════════════════════════════════════ 5 · Confirmar y volver atrás ═══ */

/**
 * El instante exacto en que una `FuenteAvatar` candidata deja de ser
 * propuesta y se vuelve la elección real — lo que pide el encargo: "el
 * resultado quede como propuesta revisable, no como hecho consumado" hasta
 * que alguien (el propio ser al confirmarse, o un humano en la interfaz) la
 * aplique de verdad. Antes de esta llamada, un candidato SIEMPRE lleva
 * `elegidoEn: null` — después, queda fechado.
 */
export function confirmarEleccionAvatar(candidato: FuenteAvatar, ahora: number = Date.now()): FuenteAvatar {
  return { ...candidato, elegidoEn: ahora };
}

/** El valor canónico de "el ser está en su cuerpo procedural" — el único
 *  `FuenteAvatar` que no necesita red y no puede fallar nunca. Un `Ser` sin
 *  `avatarFuente` YA es procedural (ver `decidirModoEfectivo`); esto es lo
 *  que se guarda cuando alguien vuelve a él A PROPÓSITO (el "en un clic,
 *  siempre" del encargo), para que quede constancia de CUÁNDO, no solo de
 *  QUÉ. */
export function avatarFuenteProcedural(ahora: number = Date.now()): FuenteAvatar {
  return { modo: "procedural", url: null, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: ahora };
}

/**
 * Construye la `FuenteAvatar` de una imagen "subida" — en el alcance de
 * esta ola, en la práctica, una URL que la persona YA aloja en algún sitio
 * (no hay pipeline de subida binaria aquí; ver el informe de esta tanda
 * para el porqué). Devuelve `null` si no parece una URL http(s) usable —
 * nunca deja pasar texto suelto como si fuera una imagen. Sin licencia:
 * es contenido propio de quien lo sube, no un hallazgo ajeno que haya que
 * justificar legalmente.
 */
export function avatarFuenteSubido(url: string, ahora: number = Date.now()): FuenteAvatar | null {
  const limpia = url.trim();
  if (!limpia) return null;
  let parsed: URL;
  try {
    parsed = new URL(limpia);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return { modo: "subido", url: limpia, consulta: null, proveedor: null, licencia: null, atribucion: null, elegidoEn: ahora };
}

/* ═══════════════════════════════════════ 6 · Que nunca se rompa el cuerpo ═ */

/**
 * QUE NUNCA SE ROMPA EL CUERPO (punto 4 del encargo): decide qué modo
 * renderizar de verdad dado lo que el ser TIENE declarado y si la carga de
 * la imagen en línea falló, caducó o la bloqueó la CSP. `avatarFuente`
 * ausente, `url` vacía, o `fallaCarga=true` caen SIEMPRE a "procedural" —
 * el único modo que se deriva sin red y por tanto no puede fallar. Esta es
 * la ÚNICA función que decide esto: los componentes no duplican la regla,
 * solo la llaman — así que probarla aquí prueba la garantía entera.
 */
export function decidirModoEfectivo(
  avatarFuente: FuenteAvatar | null | undefined,
  fallaCarga: boolean,
): FuenteAvatar["modo"] {
  if (!avatarFuente) return "procedural";
  if (avatarFuente.modo === "enlinea" || avatarFuente.modo === "subido") {
    if (!avatarFuente.url) return "procedural"; // declarado pero sin url: como si no existiera.
    if (fallaCarga) return "procedural"; // la url existía pero falló al cargar: red, caducidad o CSP.
  }
  return avatarFuente.modo;
}

/* ═══════════════════════════════════════ 7 · El contrato con la ruta ════ */

/** Categoría de fallo, para que la interfaz reaccione sin tener que
 *  adivinar leyendo el texto libre de `error` (que es para la persona, no
 *  para el `if`). Ausente cuando `ok` es `true`. */
export type CodigoFalloBusqueda = "no_autenticado" | "limite" | "no_configurado" | "entrada" | "proveedor";

/** Lo que devuelve `/api/avatar-search` — y lo que espera `avatar-busqueda-cliente.ts`.
 *  Un solo tipo para los dos lados, igual que el resto de este fichero. */
export interface RespuestaBusquedaAvatar {
  ok: boolean;
  candidatos: FuenteAvatar[];
  error?: string;
  codigo?: CodigoFalloBusqueda;
}

/**
 * Traduce el status HTTP de la ruta a una `CodigoFalloBusqueda` — mapeo
 * puro, en un solo sitio, para que la interfaz distinga "no configurado"
 * (503 — el procedural sigue sirviendo, sin drama) de "sin sesión" (401),
 * "sin cuota" (429) o "el proveedor falló" (cualquier otra cosa, típicamente
 * 502) sin repetir esta tabla en cada componente que la necesite.
 */
export function codigoDesdeEstadoHttp(status: number): CodigoFalloBusqueda {
  if (status === 401) return "no_autenticado";
  if (status === 429) return "limite";
  if (status === 503) return "no_configurado";
  if (status === 400) return "entrada";
  return "proveedor";
}
