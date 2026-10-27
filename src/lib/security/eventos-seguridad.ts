/**
 * Eventos de seguridad saneados para un orquestador de respuesta (Tracecat).
 *
 * El OS ya detecta secretos, límites de peticiones, SSRF, informes CSP,
 * repeticiones del feed firmado, invariantes y hallazgos de Strix. Este módulo
 * los convierte en un vocabulario CERRADO y una lista blanca de datos: si algo
 * no encaja, no se construye el evento. Nunca incluye identidades, correos,
 * IPs, claves ni contenido de personas.
 *
 * El `id` es determinista y NO es un secreto: es un hash no criptográfico que
 * solo sirve para que Tracecat deduplique eventos del mismo minuto.
 */

export type TipoEventoSeguridad =
  | "secreto-detectado"
  | "limite-peticiones"
  | "ssrf-bloqueado"
  | "csp-informe"
  | "repeticion-rechazada"
  | "invariante-violada"
  | "hallazgo-strix"
  | "acceso-inusual";

export type SeveridadEvento = "critica" | "alta" | "media" | "baja";

export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

export interface EventoSeguridad {
  version: 1;
  id: string;
  tipo: TipoEventoSeguridad;
  severidad: SeveridadEvento;
  elemento: ElementoRed;
  /** ISO calculado siempre desde `ahoraMs`; el módulo no lee el reloj. */
  cuando: string;
  contador: number;
  resumen: string;
  detalle: Record<string, string | number | boolean>;
}

export interface RespuestaPropuesta {
  acciones: string[];
  requiereHumano: boolean;
  motivo: string;
}

export interface PoliticaEventos {
  severidadMinima: SeveridadEvento;
  tipos?: TipoEventoSeguridad[];
}

export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = [
  "critica",
  "alta",
  "media",
  "baja",
];

const TIPOS: readonly TipoEventoSeguridad[] = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
];

const SEVERIDADES: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];

const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];

const CLAVES_DETALLE: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"],
  "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["motivo", "categoria"],
  "csp-informe": ["directiva", "tipo"],
  "repeticion-rechazada": ["canal", "ventanaMs"],
  "invariante-violada": ["invariante"],
  "hallazgo-strix": ["categoria", "regla"],
  "acceso-inusual": ["metodo", "motivo", "ventanaMs"],
};

const RESUMEN: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Se detectó un posible secreto; su valor no se copió.",
  "limite-peticiones": "Se alcanzó el límite de peticiones de una ruta.",
  "ssrf-bloqueado": "Se evitó una petición a un destino no permitido.",
  "csp-informe": "Llegó un informe de seguridad del navegador (CSP).",
  "repeticion-rechazada": "Se rechazó un mensaje repetido del feed firmado.",
  "invariante-violada": "Se detectó una posible violación de un invariante del núcleo.",
  "hallazgo-strix": "Strix encontró un hallazgo de seguridad que conviene revisar.",
  "acceso-inusual": "Se observó un acceso poco habitual que conviene revisar.",
};

const ACCIONES: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": [
    "revisar si el secreto sigue activo",
    "rotar la clave: la rota su dueña",
    "abrir un caso para seguir la rotación",
  ],
  "limite-peticiones": ["revisar la ruta y su ventana", "abrir un caso si se repite"],
  "ssrf-bloqueado": ["revisar el destino pedido por la app", "abrir un caso si se repite"],
  "csp-informe": ["revisar la directiva del informe", "ajustar la política si el origen es propio"],
  "repeticion-rechazada": ["revisar el canal del feed firmado", "abrir un caso si se repite"],
  "invariante-violada": [
    "revisar el invariante en el núcleo",
    "abrir un caso y avisar a quien mantiene el núcleo",
  ],
  "hallazgo-strix": ["revisar el hallazgo con Strix", "abrir un caso con la evidencia saneada"],
  "acceso-inusual": [
    "revisar el acceso junto a la persona implicada",
    "abrir un caso si vuelve a ocurrir",
  ],
};

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esTipo(valor: unknown): valor is TipoEventoSeguridad {
  return typeof valor === "string" && (TIPOS as readonly string[]).includes(valor);
}

function esSeveridad(valor: unknown): valor is SeveridadEvento {
  return typeof valor === "string" && (SEVERIDADES as readonly string[]).includes(valor);
}

function esElemento(valor: unknown): valor is ElementoRed {
  return typeof valor === "string" && (ELEMENTOS as readonly string[]).includes(valor);
}

function hashEstable(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

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
      return "alta";
  }
}

const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RE_IPV4 =
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/;
const RE_IPV6 = /(?:\b(?:[0-9a-f]{1,4}:){3,}[0-9a-f]{0,4}\b|::[0-9a-f:]*)/i;
const RE_JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/;
const RE_CADENA_LARGA = /[A-Za-z0-9+/=_-]{24,}/;

export function pareceDatoPersonal(texto: string): boolean {
  const limpio = texto.trim();
  if (/^(sk-|ghp_|AKIA|eyJ)/.test(limpio)) return true;
  return (
    RE_CORREO.test(texto) ||
    RE_IPV4.test(texto) ||
    RE_IPV6.test(texto) ||
    RE_JWT.test(texto) ||
    RE_CADENA_LARGA.test(texto)
  );
}

function detalleSaneado(
  tipo: TipoEventoSeguridad,
  bruto: unknown,
): EventoSeguridad["detalle"] {
  const salida: EventoSeguridad["detalle"] = {};
  if (!esObjeto(bruto)) return salida;
  for (const clave of CLAVES_DETALLE[tipo]) {
    const valor = bruto[clave];
    if (typeof valor === "boolean") {
      salida[clave] = valor;
    } else if (typeof valor === "number" && Number.isFinite(valor)) {
      salida[clave] = valor;
    } else if (typeof valor === "string" && valor.length <= 80 && !pareceDatoPersonal(valor)) {
      salida[clave] = valor;
    }
  }
  return salida;
}

export function construirEventoSeguridad(
  entrada: unknown,
  ahoraMs: number,
): EventoSeguridad | null {
  if (!Number.isFinite(ahoraMs) || Math.abs(ahoraMs) > 8.64e15) return null;
  if (!esObjeto(entrada)) return null;

  const { tipo, severidad, elemento } = entrada;
  if (!esTipo(tipo) || !esSeveridad(severidad) || !esElemento(elemento)) return null;

  const contadorBruto = entrada.contador;
  const contador =
    typeof contadorBruto === "number" && Number.isFinite(contadorBruto)
      ? Math.max(1, Math.floor(contadorBruto))
      : 1;

  const detalle = detalleSaneado(tipo, entrada.detalle);
  const cubo = Math.floor(ahoraMs / 60_000);
  const firma = [tipo, elemento, String(cubo), Object.keys(detalle).sort().join(",")].join("|");

  return {
    version: 1,
    id: `evs-${hashEstable(firma)}`,
    tipo,
    severidad,
    elemento,
    cuando: new Date(ahoraMs).toISOString(),
    contador,
    resumen: RESUMEN[tipo],
    detalle,
  };
}

export function proponerRespuesta(e: EventoSeguridad): RespuestaPropuesta {
  const tocaPersonas =
    e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  const requiereHumano = tocaPersonas || e.severidad === "critica";

  let motivo = "Propuesta automática de revisión; no se ejecuta nada por sí sola.";
  if (tocaPersonas) {
    motivo = "Toca a personas: lo revisa un Círculo de Paz antes de cualquier paso.";
  } else if (e.severidad === "critica") {
    motivo = "Severidad crítica: una persona debe revisar el caso antes de actuar.";
  }

  return { acciones: [...ACCIONES[e.tipo]], requiereHumano, motivo };
}

export function politicaPermite(e: EventoSeguridad, politica: PoliticaEventos): boolean {
  const rango = (s: SeveridadEvento) => ORDEN_SEVERIDAD.indexOf(s);
  const minimo = rango(politica.severidadMinima);
  if (minimo < 0) return false;
  if (rango(e.severidad) > minimo) return false;
  if (politica.tipos && !politica.tipos.includes(e.tipo)) return false;
  return true;
}
