// Adaptadores de las familias de identidad en movimiento (DSN1019I · Ola 1019D):
// `animacion:`, `transicion:` y `elemento-3d:`. Cada variación se representa como
// una ficha (§3 de `memory/diseno/estudio-audiovisual/references/variaciones-de-identidad.md`):
// parámetros vigentes, movimiento reducido, referencias y licencia, construida sobre
// la biblioteca pura de movimiento de la marca (`src/lib/design/movimiento-starseed.ts`).
// Puro: el lector y el escritor de la ficha vigente se inyectan; sin red, disco, reloj ni DOM.
import {
  PROPIEDADES_PERMITIDAS, recetaMovimiento, recetaReducida,
  type FotogramaStarseed, type PuntoTrinity, type RecetaMovimiento, type TipoMovimiento,
} from "@/lib/design/movimiento-starseed";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";

/** Las tres familias de identidad que mueven: animaciones, transiciones y 3D. */
export type FamiliaMovimiento = "animacion" | "transicion" | "elemento-3d";

/** Ficha de una variación de identidad en movimiento (ficha §3). */
export interface FichaMovimiento {
  clave: string;
  nombre: string;
  familia: FamiliaMovimiento;
  registro: string;
  /** Variación del vocabulario de la marca en la que se basa. */
  tipo: TipoMovimiento;
  /** Solo en la entrada cardinal: punto de la Trinity por el que entra. */
  punto?: PuntoTrinity;
  /** Fotogramas propios; si faltan, salen del vocabulario del tipo. */
  keyframes?: FotogramaStarseed[];
  parametros: { duracionMs: number; curva: string };
  /** Siempre presente: fundido simple, sin desplazamiento. */
  movimientoReducido: { duracionMs: number; recorridoPx: number };
  referencias: { id: string; queSeAprendio: string }[];
  licencia: string;
}

/** Estado de una familia que el anfitrión presta al adaptador; nunca lo guarda. */
export interface DepsMovimiento {
  leer: (familia: FamiliaMovimiento) => FichaMovimiento | null;
  escribir: (familia: FamiliaMovimiento, ficha: FichaMovimiento | null) => void;
}

/** Tope de duración de una variación de movimiento, en milisegundos. */
export const DURACION_MAXIMA_MS = 10000;
/** Licencia de las fichas: AGPL para el código, CC-BY-SA para el diseño. */
export const LICENCIA_FICHA = "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)";

const FAMILIAS: readonly FamiliaMovimiento[] = ["animacion", "transicion", "elemento-3d"];
const NOMBRES_FAMILIA: Record<FamiliaMovimiento, string> = {
  animacion: "Animaciones de identidad",
  transicion: "Transiciones",
  "elemento-3d": "Elementos 3D animados",
};
/** Vocabulario de movimiento que sirve de base a cada familia. */
const TIPOS_POR_FAMILIA: Record<FamiliaMovimiento, readonly TipoMovimiento[]> = {
  animacion: ["siembra", "respiracion", "cristalizacion", "alquimia"],
  transicion: ["entrada-cardinal", "fundido-desenfoque", "elemento-compartido", "barrido-horizonte"],
  "elemento-3d": ["respiracion", "cristalizacion"],
};
const NOMBRES: Record<TipoMovimiento, string> = {
  siembra: "Siembra del símbolo",
  "entrada-cardinal": "Entrada cardinal",
  "fundido-desenfoque": "Fundido con desenfoque",
  "elemento-compartido": "Elemento compartido",
  "barrido-horizonte": "Barrido de horizonte",
  respiracion: "Respiración",
  cristalizacion: "Cristalización",
  alquimia: "Alquimia",
};
const REFERENCIA_ADN = {
  id: "adn-starseed",
  queSeAprendio: "tiempos, curvas y vocabulario medidos del ADN y sus tokens",
};

/** Ficha base de una variación del vocabulario, con los parámetros vigentes del ADN. */
export function fichaBase(familia: FamiliaMovimiento, tipo: TipoMovimiento): FichaMovimiento | null {
  if (!TIPOS_POR_FAMILIA[familia]?.includes(tipo)) return null;
  const receta = recetaMovimiento(tipo);
  const reducida = recetaReducida(receta);
  return {
    clave: `${familia}:${tipo}`,
    nombre: NOMBRES[tipo],
    familia,
    registro: "nexus",
    tipo,
    parametros: { duracionMs: receta.opciones.duration, curva: receta.opciones.easing },
    movimientoReducido: { duracionMs: reducida.opciones.duration, recorridoPx: 0 },
    referencias: [{ ...REFERENCIA_ADN }],
    licencia: LICENCIA_FICHA,
  };
}

const PERMITIDAS_FICHA: ReadonlySet<string> = new Set<string>([...PROPIEDADES_PERMITIDAS, "offset"]);
const PATRON_CURVA = /^cubic-bezier\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/;

function esEnteroEn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** Curva `cubic-bezier(x1, y1, x2, y2)` con x1 y x2 dentro de 0–1. */
function curvaValida(curva: string): boolean {
  const m = PATRON_CURVA.exec(curva);
  if (!m) return false;
  const x1 = Number(m[1]);
  const x2 = Number(m[3]);
  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1;
}

function keyframesValidos(fotogramas: FotogramaStarseed[]): string[] {
  const motivos: string[] = [];
  if (fotogramas.some((k) => !k || typeof k !== "object" || Array.isArray(k))) {
    return ["Keyframes: cada fotograma debe ser un objeto"];
  }
  fotogramas.forEach((k, i) => {
    for (const prop of Object.keys(k)) {
      if (!PERMITIDAS_FICHA.has(prop)) {
        motivos.push(`Keyframes[${i}]: «${prop}» no se anima en la marca (solo transform, opacity, filter y clipPath)`);
      }
    }
    if (k.offset !== undefined && (typeof k.offset !== "number" || k.offset < 0 || k.offset > 1)) {
      motivos.push(`Keyframes[${i}]: el offset debe ir de 0 a 1`);
    }
  });
  return motivos;
}

/** Reglas de la ficha: familias, duraciones 0–10000 ms, curvas y propiedades permitidas. */
export function validarFicha(ficha: FichaMovimiento): string[] {
  const motivos: string[] = [];
  if (!ficha || typeof ficha !== "object" || Array.isArray(ficha)) {
    return ["Ficha: no es una ficha de movimiento"];
  }
  const tipos = TIPOS_POR_FAMILIA[ficha.familia];
  if (!tipos) motivos.push("Familia: debe ser animacion, transicion o elemento-3d");
  else if (!tipos.includes(ficha.tipo)) {
    motivos.push(`Tipo: «${ficha.tipo}» no pertenece a la familia ${ficha.familia}`);
  }
  if (typeof ficha.clave !== "string" || leerClave(ficha.clave) === null
    || !ficha.clave.startsWith(`${ficha.familia}:`)) {
    motivos.push("Clave: debe ser una clave canónica que empiece por «<familia>:»");
  }
  for (const campo of ["nombre", "registro", "licencia"] as const) {
    const valor = ficha[campo];
    if (typeof valor !== "string" || valor.length === 0) {
      motivos.push(`«${campo}»: debe ser un texto no vacío`);
    }
  }
  const p = ficha.parametros;
  if (!p || !esEnteroEn(p.duracionMs, 0, DURACION_MAXIMA_MS)) {
    motivos.push(`Parámetros: duracionMs debe ser un entero de 0 a ${DURACION_MAXIMA_MS} ms`);
  }
  if (!p || typeof p.curva !== "string" || !curvaValida(p.curva)) {
    motivos.push("Parámetros: la curva debe ser un cubic-bezier válido (x1 y x2 entre 0 y 1)");
  }
  const red = ficha.movimientoReducido;
  if (!red || !esEnteroEn(red.duracionMs, 0, DURACION_MAXIMA_MS) || red.recorridoPx !== 0) {
    motivos.push(`Movimiento reducido: duración de 0 a ${DURACION_MAXIMA_MS} ms y recorridoPx 0 (fundido sin desplazamiento)`);
  }
  const refs = ficha.referencias;
  if (!Array.isArray(refs) || refs.length === 0) {
    motivos.push("Referencias: cita al menos una referencia de la que aprendió");
  } else refs.forEach((r, i) => {
    if (!r || typeof r.id !== "string" || r.id.length === 0
      || typeof r.queSeAprendio !== "string" || r.queSeAprendio.length === 0) {
      motivos.push(`Referencias[${i}]: id y queSeAprendio son textos no vacíos`);
    }
  });
  if (ficha.keyframes !== undefined) {
    if (!Array.isArray(ficha.keyframes)) motivos.push("Keyframes: debe ser un arreglo (o omitirse)");
    else motivos.push(...keyframesValidos(ficha.keyframes));
  }
  return motivos;
}

/** Receta WAAPI de la ficha; con `reducido`, fundido simple de 1 ms sin desplazamiento. */
export function recetaDeFicha(ficha: FichaMovimiento, reducido = false): RecetaMovimiento {
  const base: RecetaMovimiento = ficha.keyframes?.length
    ? {
        keyframes: ficha.keyframes.map((k) => ({ ...k })),
        opciones: { duration: ficha.parametros.duracionMs, easing: ficha.parametros.curva, fill: "both" },
      }
    : recetaMovimiento(ficha.tipo, { punto: ficha.punto });
  base.opciones.duration = ficha.parametros.duracionMs;
  base.opciones.easing = ficha.parametros.curva;
  return reducido ? recetaReducida(base) : base;
}

/** Acepta la ficha como objeto o como su JSON; `null` si no tiene forma de objeto. */
function comoFicha(raw: unknown): FichaMovimiento | null {
  let ficha = raw;
  if (typeof ficha === "string") {
    try { ficha = JSON.parse(ficha); } catch { return null; }
  }
  if (!ficha || typeof ficha !== "object" || Array.isArray(ficha)) return null;
  return ficha as FichaMovimiento;
}

/** Validación combinada: reglas de la ficha y del validador general de variaciones. */
function revisar(raw: unknown): { ok: boolean; ficha: FichaMovimiento | null; motivos: string[] } {
  const ficha = comoFicha(raw);
  if (!ficha) {
    return { ok: false, ficha: null, motivos: ["Ficha: la variación no es una ficha de movimiento"] };
  }
  const general = validarVariacion(ficha);
  const motivos = [...validarFicha(ficha), ...(general.ok ? [] : general.motivos)];
  return { ok: motivos.length === 0, ficha, motivos };
}

export function crearAdaptadorMovimiento(
  familia: FamiliaMovimiento, deps: DepsMovimiento,
): AdaptadorFamilia<FichaMovimiento> {
  const familiaDeClave = (clave: string) => leerClave(clave)?.split(":")[0] ?? null;
  const adaptador: AdaptadorFamilia<FichaMovimiento> = {
    familia,
    nombre: NOMBRES_FAMILIA[familia],
    capturar: (clave) => {
      if (familiaDeClave(clave) !== familia) return null;
      return deps.leer(familia) ?? fichaBase(familia, TIPOS_POR_FAMILIA[familia][0]);
    },
    validar: (raw) => {
      const r = revisar(raw);
      return r.ok && r.ficha ? { ok: true, payload: r.ficha } : { ok: false, motivos: r.motivos };
    },
    aplicar: (clave, payload) => {
      const r = revisar(payload);
      if (familiaDeClave(clave) !== familia || !r.ok || !r.ficha || r.ficha.familia !== familia) {
        return { deshacer: () => undefined };
      }
      const anterior = deps.leer(familia);
      deps.escribir(familia, r.ficha);
      return { deshacer: () => deps.escribir(familia, anterior) };
    },
    vistaPrevia: (ficha) => recetaDeFicha(ficha),
  };
  return adaptador;
}

/** Registra `animacion:`, `transicion:` y `elemento-3d:` en el registro compartido. */
export function registrarAdaptadoresMovimiento(deps: DepsMovimiento): void {
  for (const familia of FAMILIAS) registrarFamilia(crearAdaptadorMovimiento(familia, deps));
}
