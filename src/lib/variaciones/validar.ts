// src/lib/variaciones/validar.ts
// Validador puro de variaciones públicas (contrato: architecture/variaciones-publicas.md §4-§6).
// Reglas: tamaño ≤ 256 KiB, JSON plano (sin funciones), nada de claves privadas de la cuenta
// (SYNCED_KEYS) ni nada que parezca un token o una clave, URLs solo https. Un payload de tipo
// código se marca `requiereAislamiento: true` y se abre en iframe sandbox sin allow-same-origin.

/** Tamaño máximo del payload serializado, en bytes UTF-8. */
export const TAMANO_MAXIMO_BYTES = 256 * 1024;

/** Valor del atributo sandbox del iframe para código: SIN allow-same-origin. */
export const SANDBOX_CODIGO = "allow-scripts";

// Claves privadas: el namespace `starseed.*` (ajustes locales y sincronizados) y las
// claves de SYNCED_KEYS (settings-sync) que no llevan ese prefijo.
const CLAVES_SYNCED_SIN_PREFIJO = ["appearance-config-v2", "os.trinity.fab", "os.trinity.fab.pos", "starseed_user_memory"];
const PATRON_CLAVE_PRIVADA = /^starseed\./;

// Nombres de propiedad que parecen un token o una clave (con límites de palabra).
const PATRON_SOSPECHOSA = /\b(?:password|contrasena|secret|token|apikey|authorization|credencial|credential)\b|(?:api[-_ ]?key)/i;

// Firmas típicas de un secreto dentro de un valor: sk-…, JWT (eyJ…) o Bearer …; un valor
// largo sin separadores parece un token opaco. URLs: cualquier esquema, o //relativa; los
// esquemas javascript/data/vbscript están prohibidos por sí solos.
const PATRON_TOKEN_CUERPO = /(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]|Bearer\s+\S{8,})/;
const PATRON_TOKEN_OPACO = /^[A-Za-z0-9+/=_-]{32,}$/;
const PATRON_ESQUEMA = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/i;
const PATRON_ESQUEMA_PELIGROSO = /^(?:javascript|data|vbscript):/i;

const PROFUNDIDAD_MAXIMA = 16;

/** Claves cuyo valor es código y por tanto exige aislamiento (contrato §4). */
export const CLAVES_DE_CODIGO = new Set(["html", "js", "javascript", "script", "codigo", "svg", "css"]);

/** Opciones de validación. */
export interface OpcionesValidar {
  /** La familia del elemento declara que su variación es código (p. ej. `atomo:` o `herramienta:`). */
  codigo?: boolean;
}

/** Resultado de validar una variación. */
export type ResultadoValidacion =
  | { ok: true; requiereAislamiento: boolean }
  | { ok: false; requiereAislamiento: boolean; motivos: string[] };

export function validarVariacion(payload: unknown, opciones?: OpcionesValidar): ResultadoValidacion {
  const requiereAislamiento = opciones?.codigo === true || esDeCodigo(payload);
  const motivos: string[] = [];
  try {
    const tamano = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (tamano > TAMANO_MAXIMO_BYTES) {
      motivos.push(`Tamaño: el payload pesa ${tamano} bytes, supera el máximo de ${TAMANO_MAXIMO_BYTES}`);
    }
  } catch {
    return { ok: false, requiereAislamiento, motivos: ["JSON: el payload no se puede serializar (circular o no serializable)"] };
  }
  colectarMotivos(payload, "payload", motivos, new Set<object>(), 0);
  return motivos.length === 0 ? { ok: true, requiereAislamiento } : { ok: false, requiereAislamiento, motivos };
}

function motivosDeTexto(valor: string, ruta: string): string[] {
  const motivos: string[] = [];
  if (PATRON_ESQUEMA_PELIGROSO.test(valor)) {
    motivos.push(`Url: «${ruta}» lleva un esquema no permitido (${valor.slice(0, 24)}…); solo https`);
  } else if (PATRON_ESQUEMA.test(valor) && !valor.startsWith("https://")) {
    motivos.push(`Url: «${ruta}» no es https; las URLs de una variación solo pueden ser https`);
  } else if (PATRON_CLAVE_PRIVADA.test(valor) || CLAVES_SYNCED_SIN_PREFIJO.includes(valor)) {
    motivos.push(`Privacidad: «${ruta}» lleva una clave privada de la cuenta (SYNCED_KEYS)`);
  } else if (PATRON_TOKEN_CUERPO.test(valor) || PATRON_TOKEN_OPACO.test(valor)) {
    motivos.push(`Privacidad: «${ruta}» parece un token o una clave; una variación nunca lleva secretos`);
  }
  return motivos;
}

function colectarMotivos(valor: unknown, ruta: string, motivos: string[], vistos: Set<object>, profundidad: number): void {
  if (motivos.length >= 8) return;
  if (valor === null) return;
  const tipo = typeof valor;
  if (tipo === "function" || tipo === "symbol" || tipo === "undefined" || tipo === "bigint") {
    motivos.push(`JSON: «${ruta}» es ${tipo}, no serializable en JSON plano`);
    return;
  }
  if (tipo !== "object") {
    if (tipo === "string") motivos.push(...motivosDeTexto(valor as string, ruta));
    return;
  }
  const objeto = valor as object;
  if (vistos.has(objeto)) {
    motivos.push(`JSON: «${ruta}» es circular`);
    return;
  }
  if (profundidad > PROFUNDIDAD_MAXIMA) {
    motivos.push(`JSON: «${ruta}» está demasiado anidado para JSON plano`);
    return;
  }
  vistos.add(objeto);
  if (Array.isArray(objeto)) {
    objeto.forEach((elemento, indice) => {
      colectarMotivos(elemento, `${ruta}[${indice}]`, motivos, vistos, profundidad + 1);
    });
  } else {
    const proto = Object.getPrototypeOf(objeto);
    if (proto !== Object.prototype && proto !== null) {
      motivos.push(`JSON: «${ruta}» no es JSON plano (solo objetos y arreglos simples)`);
    }
    const registros = objeto as Record<string, unknown>;
    for (const clave of Object.keys(registros)) {
      const rutaClave = `${ruta}.${clave}`;
      if (PATRON_SOSPECHOSA.test(clave) || PATRON_CLAVE_PRIVADA.test(clave) || CLAVES_SYNCED_SIN_PREFIJO.includes(clave)) {
        motivos.push(`Privacidad: la clave «${clave}» parece un token o es privada (${rutaClave})`);
      }
      colectarMotivos(registros[clave], rutaClave, motivos, vistos, profundidad + 1);
    }
  }
  vistos.delete(objeto);
}

function esDeCodigo(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return Object.keys(payload as Record<string, unknown>).some((clave) => CLAVES_DE_CODIGO.has(clave.toLowerCase()));
}
