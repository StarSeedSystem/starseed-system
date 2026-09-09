// StarSeed OS — Núcleo · Paquete de sistema compartible.
//
// Compartir el sistema editado entre desconocidos es donde un sistema libre
// se gana o se pierde la confianza. Por eso un paquete:
//   1) sólo transporta INTERFAZ (una `UiSpec`, que es un DATO, nunca código),
//   2) se puede REVISAR entero antes de instalarlo, y
//   3) jamás puede llevar dentro una clave, un token ni la ruta del disco de
//      nadie (compartir un tema no puede llevarse de paseo tu nombre de
//      usuario del sistema).
//
// Módulo PURO: sin red, sin disco, sin `node:*`. Lo importa el cliente.
// La FIRMA criptográfica real se calcula fuera (en el firmante del OS); aquí
// sólo se transporta y se comprueba su forma.
//
// Los validadores del núcleo (`validarUiSpec`, `validarContraInvariantes`)
// se INYECTAN: viven en `@/lib/nucleo/ui-spec` y `@/lib/nucleo/invariantes`,
// y este módulo no los duplica. El OS los registra una vez al arrancar con
// `configurarNucleo(...)`. Sin ellos, `revisar` falla CERRADO: nada instalable.

import type { UiSpec } from "@/lib/nucleo/ui-spec";
import type { Violacion } from "@/lib/nucleo/invariantes";

/** Versión del formato de paquete. Sube si cambia la forma, no el contenido. */
export const VERSION_PAQUETE = 1;

export interface PaqueteSistema {
  id: string;
  nombre: string;
  autor: { perfil: string; nombre: string };
  creadoEn: number;
  uiSpec: UiSpec;
  apariencia?: Record<string, unknown>;
  agentes?: string[];
  permisosPedidos: string[];
  requiere: string[];
  firma?: string;
  version: number;
}

/** Lo que un paquete le hace a la interfaz, tal y como lo lee el validador
 *  de invariantes. Se declara en `uiSpec.meta` (ver `cambioDelPaquete`). */
export interface CambioDeInterfaz {
  rutasOcultas?: string[];
  superficiesQuitadas?: string[];
  permisosPedidos?: string[];
  ocultaAjustes?: boolean;
  desactivaDeshacer?: boolean;
}

/** Los dos guardianes del núcleo, inyectados para no duplicarlos aquí. */
export interface DependenciasNucleo {
  validarUiSpec: (bruto: unknown) => { spec: UiSpec | null; problemas: string[] };
  validarContraInvariantes: (cambio: CambioDeInterfaz) => Violacion[];
}

export interface Revision {
  seguro: boolean;
  violaciones: Violacion[];
  secretosDetectados: string[];
  permisos: string[];
  resumen: string;
}

// ---------------------------------------------------------------------------
// Secretos: lo que JAMÁS puede viajar dentro de un paquete.
// ---------------------------------------------------------------------------
//
// Sin bandera `g`: un RegExp global guarda `lastIndex` entre llamadas y
// convertiría este módulo en algo con memoria — y con falsos negativos.
// Preferimos un falso positivo (el `resumen` dice cuál y dónde mirar) antes
// que dejar salir una clave de casa de alguien.

/** Patrones de secreto prohibidos en cualquier punto del JSON del paquete. */
export const CLAVES_PROHIBIDAS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{4,}/,
  /\bgsk_[A-Za-z0-9_-]{4,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{6,}/i,
  /api[_-]?key/i,
  /\btokens?\b/i,
  /\bpass(?:word|wd)\b/i,
  /\/Users\/[^/"\s]+/,
  /\/home\/[^/"\s]+/,
];

/** Nombre legible de cada patrón, en el mismo orden. */
const ETIQUETAS_CLAVES: string[] = [
  "clave de API estilo «sk-»",
  "clave de API estilo «gsk_»",
  "cabecera de autorización «Bearer»",
  "mención a «api key»",
  "mención a «token»",
  "mención a «password»",
  "ruta absoluta de disco «/Users/…»",
  "ruta absoluta de disco «/home/…»",
];

/** Deja ver que hay algo sin volver a publicarlo entero. */
function enmascarar(coincidencia: string): string {
  const visible = coincidencia.slice(0, 4);
  return coincidencia.length <= 4 ? visible : `${visible}…(${coincidencia.length} caracteres)`;
}

/**
 * Rastrea los patrones prohibidos en TODO el JSON serializado del paquete.
 * Devuelve descripciones enmascaradas, nunca el secreto tal cual.
 */
export function detectarSecretos(p: PaqueteSistema): string[] {
  let crudo: string;
  try {
    crudo = JSON.stringify(p) ?? "";
  } catch {
    // Un paquete que ni siquiera se puede serializar no se puede revisar.
    return ["el paquete no se puede serializar: imposible revisar su contenido"];
  }
  const hallazgos: string[] = [];
  CLAVES_PROHIBIDAS.forEach((patron, i) => {
    const encontrado = patron.exec(crudo);
    if (encontrado) {
      hallazgos.push(`${ETIQUETAS_CLAVES[i] ?? patron.source}: «${enmascarar(encontrado[0])}»`);
    }
  });
  return hallazgos;
}

// ---------------------------------------------------------------------------
// Empaquetar
// ---------------------------------------------------------------------------

/**
 * Sella una entrada como paquete: le pone id, fecha y versión de formato.
 * No pierde ni un campo de la entrada, y copia las listas para que el
 * paquete no quede atado al objeto de quien lo creó.
 */
export function empaquetar(
  entrada: Omit<PaqueteSistema, "id" | "creadoEn" | "version">,
  ahora: number,
  id: string,
): PaqueteSistema {
  const sellado: PaqueteSistema = {
    ...entrada,
    permisosPedidos: [...entrada.permisosPedidos],
    requiere: [...entrada.requiere],
    id,
    creadoEn: ahora,
    version: VERSION_PAQUETE,
  };
  if (entrada.agentes) sellado.agentes = [...entrada.agentes];
  return sellado;
}

// ---------------------------------------------------------------------------
// Qué le hace el paquete a la interfaz
// ---------------------------------------------------------------------------

function lista(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  return valor
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function esSi(valor: unknown): boolean {
  return typeof valor === "string" && ["si", "sí", "true", "1"].includes(valor.trim().toLowerCase());
}

/**
 * Lee del paquete el cambio que declara sobre la interfaz. El empaquetador
 * lo escribe en `uiSpec.meta` (`rutasOcultas`, `superficiesQuitadas`,
 * `ocultaAjustes`, `desactivaDeshacer`), y aquí se normaliza para dárselo a
 * `validarContraInvariantes`. Ocultar Ajustes se deduce también de las rutas
 * y superficies: declararlo o no declararlo da igual, se detecta igual.
 */
export function cambioDelPaquete(p: PaqueteSistema): CambioDeInterfaz {
  const meta: Record<string, unknown> = (p.uiSpec?.meta ?? {}) as Record<string, unknown>;
  const rutasOcultas = lista(meta.rutasOcultas);
  const superficiesQuitadas = lista(meta.superficiesQuitadas);
  const tocaAjustes =
    rutasOcultas.some((r) => r.toLowerCase().startsWith("/ajustes")) ||
    superficiesQuitadas.some((s) => s.toLowerCase().startsWith("ajustes"));
  return {
    rutasOcultas,
    superficiesQuitadas,
    permisosPedidos: [...(p.permisosPedidos ?? [])],
    ocultaAjustes: esSi(meta.ocultaAjustes) || tocaAjustes,
    desactivaDeshacer: esSi(meta.desactivaDeshacer),
  };
}

// ---------------------------------------------------------------------------
// El resumen que una persona lee en diez segundos
// ---------------------------------------------------------------------------

function contarBloques(bloques: unknown): number {
  if (!Array.isArray(bloques)) return 0;
  return bloques.reduce<number>((total, bloque) => {
    const hijos = (bloque as { hijos?: unknown })?.hijos;
    return total + 1 + contarBloques(hijos);
  }, 0);
}

function enumerar(items: string[], vacio: string): string {
  return items.length === 0 ? vacio : items.join(", ");
}

/**
 * Nada se instala sin que el usuario lea esto: qué cambia, qué permisos pide,
 * qué agentes trae y por qué (si acaso) no es instalable.
 */
export function redactarResumen(
  p: PaqueteSistema,
  r: Omit<Revision, "resumen">,
): string {
  const superficie = p.uiSpec?.superficie ?? "(sin superficie declarada)";
  const bloques = contarBloques(p.uiSpec?.bloques);
  const agentes = p.agentes ?? [];
  const partes: string[] = [
    `«${p.nombre}» de ${p.autor?.nombre ?? "autor desconocido"} (perfil ${p.autor?.perfil ?? "?"})`,
    `cambia la superficie «${superficie}» con ${bloques} ${bloques === 1 ? "bloque" : "bloques"}`,
    `pide ${r.permisos.length} ${r.permisos.length === 1 ? "permiso" : "permisos"}: ${enumerar(r.permisos, "ninguno")}`,
    `trae ${agentes.length} ${agentes.length === 1 ? "agente" : "agentes"}: ${enumerar(agentes, "ninguno")}`,
    p.requiere?.length ? `requiere: ${p.requiere.join(", ")}` : "no requiere nada",
    p.firma ? "viene firmado" : "SIN FIRMA: no se puede probar quién lo hizo",
  ];
  if (r.secretosDetectados.length > 0) {
    partes.push(`⚠️ ${r.secretosDetectados.length} posible(s) secreto(s) dentro: ${r.secretosDetectados.join("; ")}`);
  }
  if (r.violaciones.length > 0) {
    partes.push(`⚠️ rompe el núcleo: ${r.violaciones.map((v) => v.que).join("; ")}`);
  }
  partes.push(r.seguro ? "REVISIÓN: instalable" : "REVISIÓN: NO INSTALABLE");
  return partes.join(" · ");
}

// ---------------------------------------------------------------------------
// Revisión
// ---------------------------------------------------------------------------

let nucleo: DependenciasNucleo | null = null;

/** El OS registra aquí, una sola vez al arrancar, los guardianes del núcleo. */
export function configurarNucleo(deps: DependenciasNucleo): void {
  nucleo = deps;
}

/** Para pruebas y diagnóstico: qué guardianes hay registrados ahora mismo. */
export function nucleoRegistrado(): DependenciasNucleo | null {
  return nucleo;
}

/**
 * Revisa un paquete de arriba abajo ANTES de instalar nada: valida su
 * interfaz, la pasa por los invariantes del núcleo y rastrea secretos en
 * todo el JSON. Nunca lanza; si algo va mal, lo cuenta.
 */
export function revisar(p: PaqueteSistema, deps: DependenciasNucleo | null = nucleo): Revision {
  const secretosDetectados = detectarSecretos(p);
  const permisos = [...(p.permisosPedidos ?? [])];
  const violaciones: Violacion[] = [];

  if (!deps) {
    // Falla CERRADO: sin guardianes no se revisa, y lo que no se revisa no entra.
    violaciones.push({
      invariante: "nucleo-configurado",
      que: "el núcleo de validación no está disponible, así que este paquete no se ha podido revisar",
      comoArreglarlo: "Llama a configurarNucleo({ validarUiSpec, validarContraInvariantes }) al arrancar el OS.",
    });
  } else {
    const { spec, problemas } = deps.validarUiSpec(p.uiSpec);
    for (const problema of problemas) {
      violaciones.push({
        invariante: "ui-spec-valida",
        que: `la interfaz del paquete no es válida: ${problema}`,
        comoArreglarlo: "Corrige la UiSpec: sólo bloques del vocabulario cerrado, props declaradas y cero cadenas que parezcan código.",
      });
    }
    if (!spec && problemas.length === 0) {
      violaciones.push({
        invariante: "ui-spec-valida",
        que: "la interfaz del paquete no se ha podido leer",
        comoArreglarlo: "Vuelve a exportar el paquete desde el editor del OS para regenerar su UiSpec.",
      });
    }
    violaciones.push(...deps.validarContraInvariantes(cambioDelPaquete(p)));
  }

  const seguro = violaciones.length === 0 && secretosDetectados.length === 0;
  const resumen = redactarResumen(p, { seguro, violaciones, secretosDetectados, permisos });
  return { seguro, violaciones, secretosDetectados, permisos, resumen };
}

/** Pase lo que pase: ni con violaciones del núcleo ni con secretos dentro. */
export function esInstalable(r: Revision): boolean {
  return r.seguro && r.violaciones.length === 0 && r.secretosDetectados.length === 0;
}
