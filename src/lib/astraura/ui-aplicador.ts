import type {
  AppearanceConfig,
  BackgroundScopeMode,
  DeepPartial,
} from "../../context/appearance-context";
import type { AccionUi, TipoAccionUi } from "./ui-acciones";

/**
 * Astraura · Aplicador con bitácora y deshacer (Ola 304 · zU3)
 * ============================================================================
 * Tercera capa de la gramática de UI: `ui-acciones.ts` VALIDA la propuesta,
 * `ui-permisos.ts` DECIDE si puede seguir, y este módulo la APLICA dejando
 * siempre el camino de vuelta abierto. La promesa es sencilla y es la razón
 * de existir del archivo: **ningún cambio de la IA es irreversible**.
 *
 * Cada aplicación devuelve, además de la config nueva, una `EntradaBitacora`
 * con el `inverso`: el parche exacto que repone los valores anteriores de las
 * rutas tocadas. Guardar esa entrada es guardar el «deshacer».
 *
 * Módulo PURO: sin React, sin estado global, sin red, sin disco, sin `node:*`.
 * SSR-safe, importable desde componentes de cliente (CLAUDE.md §«Publicar»).
 *
 * La IA es el exocórtex del usuario (Tríada §3): aplica lo que el usuario
 * consiente y nunca le quita la posibilidad de volver atrás.
 *
 * NOTA SOBRE CLONAR: no se usa `structuredClone`. No existe en Node antiguo
 * ni en todos los entornos de SSR/pruebas, y romper el render del servidor por
 * una copia no compensa. Tampoco se usa `JSON.parse(JSON.stringify(x))`:
 * perdería los `undefined` que aquí significan «borra esta clave». Se clona a
 * mano (`clonar`), que además es más rápido para objetos pequeños como estos.
 */

/** Un objeto plano cualquiera del árbol de configuración. */
type Registro = Record<string, unknown>;

/** Una entrada de la bitácora: un cambio aplicado y cómo revertirlo. */
export interface EntradaBitacora {
  /** Identificador estable de la entrada. */
  id: string;
  /** Marca de tiempo (ms) en que se aplicó. */
  at: number;
  /** Quién lo pidió (`agente:<id>`, `personalidad:<id>`, `usuario`…). */
  actor: string;
  /** Qué faja de la interfaz se tocó. */
  tipo: TipoAccionUi;
  /** Ámbito sobre el que se escribió. */
  ambito: BackgroundScopeMode;
  /** Perfil o ruta del ámbito, si lo hay. */
  ambitoId?: string;
  /** El porqué, en español, tal y como se le enseñó al usuario. */
  motivo: string;
  /** Frase corta de qué cambió de verdad. */
  resumen: string;
  /** Parche (en espacio RAÍZ) que devuelve la config al estado anterior. */
  inverso: DeepPartial<AppearanceConfig>;
}

/** Cuántas entradas de bitácora se conservan. */
export const MAX_BITACORA = 50;

/** Cuántos cambios se nombran en un resumen antes de resumir el resto. */
export const MAX_RESUMEN = 3;

/* ── Utilidades de datos (puras) ──────────────────────────────────────── */

function esObjetoPlano(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Copia profunda a mano (ver la nota sobre `structuredClone` de arriba). */
function clonar<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((v) => clonar(v)) as unknown as T;
  }
  if (esObjetoPlano(valor)) {
    const salida: Registro = {};
    for (const clave of Object.keys(valor)) salida[clave] = clonar(valor[clave]);
    return salida as unknown as T;
  }
  return valor;
}

/** Igualdad profunda; los arrays se comparan posición a posición. */
function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => iguales(v, b[i]));
  }
  if (esObjetoPlano(a) && esObjetoPlano(b)) {
    const clavesA = Object.keys(a);
    const clavesB = Object.keys(b);
    if (clavesA.length !== clavesB.length) return false;
    return clavesA.every((k) => k in b && iguales(a[k], b[k]));
  }
  return false;
}

/**
 * Fusión en PROFUNDIDAD con las mismas reglas que `deepMerge` de
 * `appearance-context.tsx`, más una: los ARRAYS SE REEMPLAZAN ENTEROS (nunca
 * se concatenan ni se fusionan índice a índice), porque una paleta o una lista
 * de fuentes es un valor, no una acumulación.
 *
 * Añadido propio y necesario para el «deshacer»: un valor `undefined` en el
 * parche significa **borrar esa clave**. Es la única forma de que el inverso
 * de «crear algo que no existía» sea «que vuelva a no existir», y no dejar la
 * clave puesta a `undefined` ensuciando la config guardada.
 *
 * Nunca muta `destino`: devuelve estructura nueva en las ramas tocadas.
 */
function fusionar(destino: Registro, parche: Registro): Registro {
  const salida: Registro = { ...destino };
  for (const clave of Object.keys(parche)) {
    const valor = parche[clave];
    if (valor === undefined) {
      delete salida[clave];
      continue;
    }
    if (Array.isArray(valor)) {
      salida[clave] = clonar(valor);
      continue;
    }
    if (esObjetoPlano(valor)) {
      const previo = salida[clave];
      salida[clave] = fusionar(esObjetoPlano(previo) ? previo : {}, valor);
      continue;
    }
    salida[clave] = valor;
  }
  return salida;
}

/* ── El inverso: el camino de vuelta ──────────────────────────────────── */

/**
 * Parche que, fusionado sobre `despues`, devuelve exactamente `antes`.
 * Solo recorre lo que cambió: lo que nació se marca con `undefined` (borrar),
 * lo que se modificó o se borró lleva su valor anterior clonado.
 */
function calcularInverso(antes: Registro, despues: Registro): Registro {
  const inverso: Registro = {};
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  for (const clave of claves) {
    const valorAntes = antes[clave];
    const valorDespues = despues[clave];
    if (!(clave in despues)) {
      // Lo borró el parche: el inverso lo repone tal cual estaba.
      inverso[clave] = clonar(valorAntes);
      continue;
    }
    if (!(clave in antes)) {
      // No existía: el inverso lo hace desaparecer otra vez.
      inverso[clave] = undefined;
      continue;
    }
    if (esObjetoPlano(valorAntes) && esObjetoPlano(valorDespues)) {
      const hijo = calcularInverso(valorAntes, valorDespues);
      if (Object.keys(hijo).length > 0) inverso[clave] = hijo;
      continue;
    }
    if (!iguales(valorAntes, valorDespues)) inverso[clave] = clonar(valorAntes);
  }
  return inverso;
}

/* ── Enrutado por ámbito ──────────────────────────────────────────────── */

/**
 * Clave del ámbito, con la MISMA forma que usa `appearance-context.tsx`
 * (`scopeKeyFor`): `perfil:<id>` · `pagina:<ruta>`. `null` = escribir en la
 * raíz (ámbito `cuenta`, o un ámbito sin identificador, que no sabría dónde
 * escribir y por prudencia se comporta como la cuenta).
 */
function claveAmbito(ambito: BackgroundScopeMode, ambitoId?: string): string | null {
  if (ambito === "perfil") return ambitoId ? `perfil:${ambitoId}` : null;
  if (ambito === "pagina") return ambitoId ? `pagina:${ambitoId}` : null;
  return null;
}

/**
 * Lleva el parche a donde le toca. Igual que `withScopedBackground` del
 * contexto: en ámbito `perfil`/`pagina` la parte de FONDO no va a la raíz sino
 * a `background.scopes["perfil:<id>"]`, y el resto del parche (tipografía,
 * distribución, estilo…) sí se queda en la raíz, que es donde vive.
 */
function enrutarParche(
  parche: Registro,
  ambito: BackgroundScopeMode,
  ambitoId?: string,
): Registro {
  const clave = claveAmbito(ambito, ambitoId);
  const fondo = parche.background;
  if (!clave || !esObjetoPlano(fondo)) return parche;
  const resto: Registro = { ...parche };
  delete resto.background;
  return { ...resto, background: { scopes: { [clave]: fondo } } };
}

/* ── Resumen humano del cambio ────────────────────────────────────────── */

interface HojaCambiada {
  ruta: string;
  antes: unknown;
  despues: unknown;
}

/** Recoge SOLO las hojas que de verdad cambiaron, con su ruta completa. */
function hojasDistintas(antes: Registro, despues: Registro, base: string, salida: HojaCambiada[]): void {
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  for (const clave of claves) {
    const ruta = base ? `${base}.${clave}` : clave;
    const valorAntes = antes[clave];
    const valorDespues = despues[clave];
    if (esObjetoPlano(valorAntes) && esObjetoPlano(valorDespues)) {
      hojasDistintas(valorAntes, valorDespues, ruta, salida);
      continue;
    }
    if (!iguales(valorAntes, valorDespues)) {
      salida.push({ ruta, antes: valorAntes, despues: valorDespues });
    }
  }
}

/** Nombres en español de las rutas que el usuario reconoce de la interfaz. */
const ETIQUETAS: Record<string, string> = {
  "background.type": "tipo de fondo",
  "background.value": "fondo",
  "background.blur": "desenfoque",
  "background.animation": "animación",
  "background.overlayOpacity": "opacidad del velo",
  "background.overlayColor": "color del velo",
  "background.intensity": "intensidad del fondo",
  "background.living.variant": "fondo vivo",
  "background.living.speed": "velocidad del fondo",
  "background.living.intensity": "intensidad del fondo",
  "background.living.colors": "paleta del fondo",
  "styling.radius": "radio",
  "styling.opacity": "opacidad",
  "styling.glassIntensity": "cristal",
  "styling.borderWidth": "grosor del borde",
  "styling.glowIntensity": "brillo",
  "styling.crystalPreset": "preset de cristal",
  "typography.fontFamily": "tipografía",
  "typography.scale": "escala de texto",
  "typography.customFonts": "fuentes propias",
  "layout.menuPosition": "posición del menú",
  "layout.menuStyle": "estilo del menú",
  "layout.menuBehavior": "comportamiento del menú",
  "layout.iconStyle": "estilo de iconos",
};

/**
 * `background.scopes.perfil:p-7.value` → `background.value`. El ámbito ya
 * viaja aparte en la bitácora, así que la frase no lo repite.
 */
function normalizarRuta(ruta: string): string {
  const marca = "background.scopes.";
  if (!ruta.startsWith(marca)) return ruta;
  const resto = ruta.slice(marca.length);
  const corte = resto.indexOf(".");
  return corte < 0 ? "fondo del ámbito" : `background.${resto.slice(corte + 1)}`;
}

function etiqueta(ruta: string): string {
  const normal = normalizarRuta(ruta);
  const conocida = ETIQUETAS[normal];
  if (conocida) return conocida;
  const partes = normal.split(".");
  return partes[partes.length - 1];
}

/** Valor en palabras: corto, sin comillas y sin asustar con objetos crudos. */
function valorTexto(valor: unknown): string {
  if (valor === undefined) return "—";
  if (valor === null) return "nada";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (typeof valor === "number") return String(Math.round(valor * 1000) / 1000);
  if (typeof valor === "string") return valor.length > 32 ? `${valor.slice(0, 31)}…` : valor;
  if (Array.isArray(valor)) return valor.length === 1 ? "1 elemento" : `${valor.length} elementos`;
  return "…";
}

/**
 * Frase corta de qué cambió DE VERDAD entre dos configuraciones, comparando
 * solo las hojas distintas: «fondo: nebulosa → aurora; radio: 12 → 20».
 * Si no cambió nada, «sin cambios» (y eso también hay que poder decírselo al
 * usuario: una acción que no hace nada no se disfraza de cambio).
 */
export function resumirCambio(antes: AppearanceConfig, despues: AppearanceConfig): string {
  const hojas: HojaCambiada[] = [];
  hojasDistintas(antes as unknown as Registro, despues as unknown as Registro, "", hojas);
  if (hojas.length === 0) return "sin cambios";
  const frases = hojas
    .slice(0, MAX_RESUMEN)
    .map((h) => `${etiqueta(h.ruta)}: ${valorTexto(h.antes)} → ${valorTexto(h.despues)}`);
  const restantes = hojas.length - frases.length;
  return restantes > 0 ? `${frases.join("; ")} (+${restantes} más)` : frases.join("; ");
}

/* ── Aplicar y deshacer ───────────────────────────────────────────────── */

/** Contador de proceso para que dos entradas del mismo milisegundo no choquen. */
let secuencia = 0;

function nuevoId(at: number): string {
  secuencia += 1;
  return `bit-${at.toString(36)}-${secuencia.toString(36)}`;
}

/** Ajustes opcionales; existen para poder fijar tiempo e id en las pruebas. */
export interface OpcionesAplicar {
  ahora?: number;
  id?: string;
}

/**
 * Aplica una acción ya validada y devuelve la config nueva junto con la
 * entrada de bitácora que permite deshacerla. No muta `actual`.
 */
export function aplicarAccion(
  actual: AppearanceConfig,
  accion: AccionUi,
  opciones?: OpcionesAplicar,
): { siguiente: AppearanceConfig; entrada: EntradaBitacora } {
  const parche = enrutarParche(
    clonar(accion.parche as unknown as Registro),
    accion.ambito,
    accion.ambitoId,
  );
  const antes = actual as unknown as Registro;
  const despues = fusionar(antes, parche);
  const siguiente = despues as unknown as AppearanceConfig;
  const at = opciones?.ahora ?? Date.now();
  const entrada: EntradaBitacora = {
    id: opciones?.id ?? nuevoId(at),
    at,
    actor: accion.actor,
    tipo: accion.tipo,
    ambito: accion.ambito,
    ambitoId: accion.ambitoId,
    motivo: accion.motivo,
    resumen: resumirCambio(actual, siguiente),
    inverso: calcularInverso(antes, despues) as unknown as DeepPartial<AppearanceConfig>,
  };
  return { siguiente, entrada };
}

/**
 * Deshace una entrada de la bitácora sobre la config actual. El `inverso` va
 * en espacio RAÍZ (ya trae dentro la ruta de `background.scopes` si la acción
 * era de perfil o de página), así que aquí no hay que volver a enrutar nada.
 */
export function deshacer(actual: AppearanceConfig, entrada: EntradaBitacora): AppearanceConfig {
  return fusionar(
    actual as unknown as Registro,
    entrada.inverso as unknown as Registro,
  ) as unknown as AppearanceConfig;
}

/** Bitácora recortada a `MAX_BITACORA`, las más nuevas primero. */
export function recortarBitacora(b: EntradaBitacora[]): EntradaBitacora[] {
  // `sort` es estable en todos los motores modernos: si dos entradas comparten
  // milisegundo se respeta el orden en que llegaron.
  return [...b].sort((x, y) => y.at - x.at).slice(0, MAX_BITACORA);
}
