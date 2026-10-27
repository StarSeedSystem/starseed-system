// ════════════════════════════════════════════════════════════════════════════
// Eventos de seguridad saneados (INF1025A · Ola 1025R · Tracecat)
// ────────────────────────────────────────────────────────────────────────────
// El OS ya detecta en su rincón (escáner de secretos, límite de peticiones,
// SSRF, informes CSP, anti-repetición del feed firmado, invariantes del
// núcleo, Strix, accesos inusuales). Este módulo puro convierte cada
// detección en un evento de vocabulario CERRADO listo para salir hacia un
// orquestador de respuesta (Tracecat) SIN filtrar nada de nadie:
//   · Lista blanca: tipo, severidad, elemento y claves del detalle solo
//     salen si están en el vocabulario; lo demás se descarta.
//   · Falla cerrado: ante cualquier entrada rara devuelve `null`.
//   · El `resumen` sale de una plantilla fija por tipo, jamás del texto de
//     la entrada.
//   · Ningún valor del detalle lleva datos personales (correo, IP, JWT,
//     cadenas con forma de clave): los campos que lo parecen se DESCARTAN,
//     no se enmascaran.
//   · El `id` es determinista (`evs-…`, hash no criptográfico de
//     tipo|elemento|cubo de 60 s|claves del detalle) para que Tracecat
//     deduplique. NO es un secreto.
// Módulo puro: sin red, sin disco, sin reloj (`ahoraMs` entra por parámetro),
// sin `Date.now()` ni `Math.random()`. Sin `node:*` (llega al cliente).
// ════════════════════════════════════════════════════════════════════════════

/** Tipos de evento del vocabulario cerrado (lista blanca). */
export type TipoEventoSeguridad =
  | "secreto-detectado"
  | "limite-peticiones"
  | "ssrf-bloqueado"
  | "csp-informe"
  | "repeticion-rechazada"
  | "invariante-violada"
  | "hallazgo-strix"
  | "acceso-inusual";

/** Severidad del evento, en español. No se importa `Severity` del escáner
 * (ese archivo es `"use client"`): se mapea con `desdeSeveridadScanner`. */
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";

/** Parte de la red a la que pertenece el evento; nunca lleva identidad. */
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

/** Evento saneado listo para un orquestador de respuesta (Tracecat). */
export interface EventoSeguridad {
  version: 1;
  id: string;
  tipo: TipoEventoSeguridad;
  severidad: SeveridadEvento;
  elemento: ElementoRed;
  /** Momento del suceso en ISO, calculado desde el parámetro `ahoraMs`. */
  cuando: string;
  /** Cuántas veces se vio (≥ 1). */
  contador: number;
  /** Frase humana fija por tipo; jamás sale del texto de la entrada. */
  resumen: string;
  detalle: Record<string, string | number | boolean>;
}

/** Orden de severidad, de la más fuerte a la más leve. */
export const ORDEN_SEVERIDAD: SeveridadEvento[] = [
  "critica",
  "alta",
  "media",
  "baja",
];

/** Propuesta de respuesta: SOLO sugerencias, nunca castigos automáticos. */
export interface RespuestaPropuesta {
  acciones: string[];
  requiereHumano: boolean;
  motivo: string;
}

/** Política de salida hacia el orquestador. */
export interface PoliticaEvento {
  /** La severidad más leve que todavía pasa (critica > alta > media > baja). */
  severidadMinima: SeveridadEvento;
  /** Si se da, SOLO pasan estos tipos. */
  tipos?: TipoEventoSeguridad[];
}

const TIPOS_VALIDOS: readonly string[] = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
];
const SEVERIDADES_VALIDAS: readonly string[] = ORDEN_SEVERIDAD;
const ELEMENTOS_VALIDOS: readonly string[] = [
  "red",
  "cuenta",
  "grupo",
  "pagina",
  "app",
  "api",
];

/**
 * Mapa la severidad del escáner cliente (`src/lib/security/scanner.ts`) al
 * vocabulario de eventos. Lo desconocido baja a «baja»: falla cerrado.
 */
export function desdeSeveridadScanner(s: string): SeveridadEvento {
  switch (s) {
    case "critical":
      return "critica";
    case "high":
      return "alta";
    case "medium":
      return "media";
    case "low":
      return "baja";
    default:
      return "baja";
  }
}

const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RE_IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const RE_IPV6_MEDIA = /(?:^|[^A-Za-z0-9.])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?:$|[^A-Za-z0-9.])/;
const RE_IPV6_DOBLE = /\b[0-9A-Fa-f]{0,4}::[0-9A-Fa-f:]{0,39}\b/;
const RE_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const RE_HEX_LARGO = /\b[0-9a-fA-F]{24,}\b/;
const RE_B64_LARGO = /\b[A-Za-z0-9+/_-]{24,}\b/;
const PREFIJOS_CLAVE = ["sk-", "ghp_", "AKIA", "eyJ"] as const;

/**
 * ¿Parece un dato personal o una credencial? Correo, IPv4/IPv6, JWT, cadena
 * hex o base64 de ≥ 24 caracteres, o que empiece por `sk-`, `ghp_`, `AKIA`
 * o `eyJ`. Los valores que lo cumplen se DESCARTAN del detalle (nunca se
 * enmascaran: lo enmascarado siempre deja rastro).
 */
export function pareceDatoPersonal(texto: string): boolean {
  if (typeof texto !== "string") return false;
  for (const prefijo of PREFIJOS_CLAVE) {
    if (texto.startsWith(prefijo)) return true;
  }
  return (
    RE_CORREO.test(texto) ||
    RE_IPV4.test(texto) ||
    RE_IPV6_MEDIA.test(texto) ||
    RE_IPV6_DOBLE.test(texto) ||
    RE_JWT.test(texto) ||
    RE_HEX_LARGO.test(texto) ||
    RE_B64_LARGO.test(texto)
  );
}

/** Plantillas HUMANAS fijas por tipo: el resumen nunca sale de la entrada. */
const RESUMENES: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Se detectó un posible secreto: lo revisa su dueña.",
  "limite-peticiones": "Una ruta alcanzó su límite de peticiones.",
  "ssrf-bloqueado": "Se frenó una petición hacia un destino interno.",
  "csp-informe": "Llegó un informe de violación de la política CSP.",
  "repeticion-rechazada": "Se rechazó una petición repetida del feed firmado.",
  "invariante-violada": "Una invariante del núcleo llegó violada: se revisa.",
  "hallazgo-strix": "La auditoría de Strix trae un hallazgo nuevo.",
  "acceso-inusual": "Se registró un acceso con un patrón inusual.",
};

/** Claves del detalle permitidas POR TIPO: lo demás jamás sale del OS. */
const CLAVES_DETALLE: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"],
  "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["esquema", "razon"],
  "csp-informe": ["directiva", "violaciones"],
  "repeticion-rechazada": ["ruta", "ventanaMs"],
  "invariante-violada": ["invariante"],
  "hallazgo-strix": ["familia", "campo"],
  "acceso-inusual": ["ruta", "ventanaMs"],
};

/**
 * Deja en el detalle SOLO las claves de la lista blanca del tipo, con valores
 * que sean número finito, booleano o cadena ≤ 80 sin forma de dato personal.
 * Lo que no pase se descarta sin avisar (falla cerrado, nada de máscaras).
 */
function filtrarDetalle(
  tipo: TipoEventoSeguridad,
  crudo: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const salida: Record<string, string | number | boolean> = {};
  const anidado =
    crudo["detalle"] && typeof crudo["detalle"] === "object" && !Array.isArray(crudo["detalle"])
      ? (crudo["detalle"] as Record<string, unknown>)
      : {};
  for (const clave of CLAVES_DETALLE[tipo]) {
    const valor = clave in anidado ? anidado[clave] : crudo[clave];
    const valido =
      typeof valor === "boolean" ||
      (typeof valor === "number" && Number.isFinite(valor)) ||
      (typeof valor === "string" &&
        valor.length > 0 &&
        valor.length <= 80 &&
        !pareceDatoPersonal(valor));
    if (valido) {
      salida[clave] = valor as string | number | boolean;
    }
  }
  return salida;
}

/** Hash no criptográfico (FNV-1a 32 bits). Para deduplicar id: NO es secreto. */
function hashEstable(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Construye un evento saneado desde una detección cruda qualité `unknown`.
 * Lista blanca: si `tipo`, `severidad` o `elemento` no están en el
 * vocabulario devuelve `null` (no adivina nada). El `resumen` viene de la
 * plantilla fija del tipo; el `detalle` pasa por `filtrarDetalle`; el `id`
 * es determinista (`evs-` + hash de tipo|elemento|cubo de 60 s|claves) para
 * que Tracecat deduplique. Nada de la entrada improvista sale de aquí.
 */
export function construirEventoSeguridad(
  entrada: unknown,
  ahoraMs: number,
): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const crudo = entrada as Record<string, unknown>;
  const tipo = crudo["tipo"];
  const severidad = crudo["severidad"];
  const elemento = crudo["elemento"];
  if (typeof tipo !== "string" || !TIPOS_VALIDOS.includes(tipo)) return null;
  if (typeof severidad !== "string" || !SEVERIDADES_VALIDAS.includes(severidad)) return null;
  if (typeof elemento !== "string" || !ELEMENTOS_VALIDOS.includes(elemento)) return null;

  const cuandoMs = Math.max(0, Math.floor(ahoraMs));
  const contadorCrudo = crudo["contador"];
  const contador =
    typeof contadorCrudo === "number" &&
    Number.isFinite(contadorCrudo) &&
    contadorCrudo >= 1
      ? Math.floor(contadorCrudo)
      : 1;

  const detalle = filtrarDetalle(tipo as TipoEventoSeguridad, crudo);
  const claves = Object.keys(detalle).sort().join(",");
  const cubo60s = Math.floor(cuandoMs / 60_000);
  const id = `evs-${hashEstable(
    `${tipo}|${elemento}|${cubo60s}|${claves}`,
  )}`;

  return {
    version: 1,
    id,
    tipo: tipo as TipoEventoSeguridad,
    severidad: severidad as SeveridadEvento,
    elemento: elemento as ElementoRed,
    cuando: new Date(cuandoMs).toISOString(),
    contador,
    resumen: RESUMENES[tipo as TipoEventoSeguridad],
    detalle,
  };
}

/** Acciones propuesta por tipo: sugerencias para Tracecat, nada automático. */
const ACCIONES_POR_TIPO: Record<TipoEventoSeguridad, string[]> = {
  "secreto-detectado": [
    "revisar dónde apareció el secreto",
    "rotar la clave: la rota su dueña",
    "abrir un caso en el orquestador",
  ],
  "limite-peticiones": [
    "revisar la ruta con el tráfico de más",
    "abrir un caso si el límite se repite",
  ],
  "ssrf-bloqueado": [
    "revisar el destino frenado",
    "abrir un caso si la petición repite",
  ],
  "csp-informe": [
    "revisar la directiva que falló",
    "abrir un caso si el informe repite",
  ],
  "repeticion-rechazada": [
    "revisar el origen de la petición repetida",
    "abrir un caso si el intento insiste",
  ],
  "invariante-violada": [
    "revisar el código que violó la invariante",
    "abrir un caso de prioridad alta",
  ],
  "hallazgo-strix": [
    "revisar el hallazgo en su origen",
    "ordenar los hallazgos por severidad",
  ],
  "acceso-inusual": [
    "revisar el patrón de acceso",
    "abrir un caso si el patrón repite",
  ],
};

/**
 * Propone respuesta para el orquestador: SOLO propuestas en español. Nunca
 * hay castigos ni medidas automáticas contra una persona (justicia
 * restaurativa, CLAUDE.md §6): si el evento toca una `cuenta`, un `grupo`
 * o una `pagina`, lo decide un humano y lo mediará un Círculo de Paz.
 */
export function proponerRespuesta(e: EventoSeguridad): RespuestaPropuesta {
  const acciones = ACCIONES_POR_TIPO[e.tipo] ?? ["revisar el evento", "abrir un caso"];
  const tocaPersonas =
    e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  if (tocaPersonas) {
    return {
      acciones,
      requiereHumano: true,
      motivo:
        "El evento toca a una cuenta, un grupo o una página: una persona lo revisa y lo mediará un Círculo de Paz. Nada automático cambia la vida de nadie.",
    };
  }
  return {
    acciones,
    requiereHumano: false,
    motivo:
      "El evento toca a la infraestructura de la red: un agente puede seguir la propuesta y dejar constancia abierta para su revisión humana.",
  };
}

/**
 * ¿La política deja pasar el evento? `severidadMinima` es la severidad más
 * leve que todavía sale (critica > alta > media > baja); con `tipos` SOLO
 * salen esos tipos. Ante severidades de vocabulario cerrado, falla cerrado.
 */
export function politicaPermite(
  e: EventoSeguridad | null | undefined,
  politica: PoliticaEvento,
): boolean {
  if (!e || !politica) return false;
  const delEvento = ORDEN_SEVERIDAD.indexOf(e.severidad);
  const laMinima = ORDEN_SEVERIDAD.indexOf(politica.severidadMinima);
  if (delEvento < 0 || laMinima < 0) return false;
  if (delEvento > laMinima) return false;
  if (politica.tipos && !politica.tipos.includes(e.tipo)) return false;
  return true;
}
