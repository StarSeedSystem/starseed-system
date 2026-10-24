export const CALIDADES = ["480p", "720p", "1080p"] as const;
export type CalidadManim = (typeof CALIDADES)[number];

/** Escena ManimGX: código Python de la escena (candidato, nunca se ejecuta desde el OS). */
export interface EscenaManim {
  codigo: string;
  clase: string;
  calidad: CalidadManim;
  fps: number;
  /** Tope de duración en segundos de la animación. */
  duracionMax: number;
}

/** Únicos módulos que una escena puede importar (contrato §3 de repos-3d-oido-agentes-1023). */
export const MODULOS_PERMITIDOS = ["manim", "manimgx", "math", "numpy"] as const;

export interface VeredictoEscena {
  valida: boolean;
  motivo: string | null;
}

const VALIDA: VeredictoEscena = { valida: true, motivo: null };

/** Import de Python: `import X` / `from X import …` → nombre del módulo raíz de la línea. */
const REGEX_IMPORTS = /\b(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/g;

/** Patrón prohibido dentro del código de una escena, con su motivo legible. */
interface PatronProhibido {
  regex: RegExp;
  motivo: string;
}

/** Operaciones de disco, proceso y red: la escena solo anima, nada más (contrato §3). */
const PATRONES_PROHIBIDOS: PatronProhibido[] = [
  { regex: /\bopen\s*\(/, motivo: "«open(» está prohibido: la escena no abre archivos del disco." },
  { regex: /\bexec\s*\(/, motivo: "«exec(» está prohibido: la escena no ejecuta código dinámico." },
  { regex: /\beval\s*\(/, motivo: "«eval(» está prohibido: la escena no evalúa expresiones dinámicas." },
  { regex: /\b__import__\s*\(/, motivo: "«__import__(» está prohibido: la escena no importa en tiempo de ejecución." },
  { regex: /\bsubprocess\b/, motivo: "«subprocess» está prohibido: la escena no lanza procesos." },
  { regex: /\bos\s*\./, motivo: "«os.» está prohibido: la escena no toca el sistema operativo." },
  { regex: /\bsys\s*\./, motivo: "«sys.» está prohibido: la escena no toca el intérprete de Python." },
  {
    regex: /\b(?:requests|urllib|urlopen|socket|http\.client|httpx)\b/,
    motivo: "Acceso a red prohibido: la escena nunca abre conexiones (requests, urllib, socket…).",
  },
];

/** ¿El módulo importado (con subruta) está dentro de la lista permitida? */
function moduloPermitido(modulo: string): boolean {
  return MODULOS_PERMITIDOS.some(
    (m) => modulo === m || modulo.startsWith(`${m}.`),
  );
}

/**
 * Valida el CÓDIGO de una escena ManimGX sin ejecutar nada: solo texto → veredicto.
 * Rechaza imports fuera de manim/manimgx/math/numpy y toda operación de disco,
 * proceso, red o ejecución dinámica, con motivos en español.
 */
export function validarEscena(codigo: string): VeredictoEscena {
  if (!codigo || codigo.trim().length === 0) {
    return { valida: false, motivo: "La escena está vacía." };
  }
  for (const patron of PATRONES_PROHIBIDOS) {
    if (patron.regex.test(codigo)) {
      return { valida: false, motivo: patron.motivo };
    }
  }
  let hayImportManim = false;
  for (const match of codigo.matchAll(REGEX_IMPORTS)) {
    const modulo = match[1] ?? match[2];
    if (modulo && (modulo === "manim" || modulo === "manimgx" || modulo.startsWith("manim.") || modulo.startsWith("manimgx."))) {
      hayImportManim = true;
    }
    if (!moduloPermitido(modulo)) {
      return { valida: false, motivo: `Import prohibido «${modulo}»: solo se permite manim, manimgx, math y numpy.` };
    }
  }
  if (!hayImportManim) {
    return { valida: false, motivo: "La escena no importa de manim ni manimgx: no es una escena de Manim." };
  }
  if (!/\bclass\s+\w+\s*\(\s*(?:ThreeD)?Scene\s*\)/.test(codigo)) {
    return { valida: false, motivo: "Ninguna clase hereda de Scene o ThreeDScene: no es una escena de Manim." };
  }
  return VALIDA;
}

/**
 * Valida el CONTRATO de una escena (metadatos, no el código): clase nombrada,
 * calidad de las permitidas, fps razonables y tope de duración positivo.
 * Devuelve null si todo cumple, o el motivo del incumplimiento.
 */
export function validarContratoEscena(escena: EscenaManim): string | null {
  if (!escena.clase || escena.clase.trim().length === 0) {
    return "La escena no tiene clase asignada.";
  }
  if (!/\bclass\s+[A-Za-z_]\w*\s*\(\s*(?:ThreeD)?Scene\s*\)/.test(escena.codigo)) {
    return "El código no define la clase de la escena (Scene o ThreeDScene).";
  }
  if (!(CALIDADES as readonly string[]).includes(escena.calidad)) {
    return `Calidad «${escena.calidad}» no admitida: solo 480p, 720p y 1080p.`;
  }
  if (!Number.isFinite(escena.fps) || escena.fps < 12 || escena.fps > 60) {
    return `fps fuera de rango (${escena.fps}): entre 12 y 60.`;
  }
  if (!Number.isFinite(escena.duracionMax) || escena.duracionMax <= 0) {
    return `duracionMax fuera de rango (${escena.duracionMax}): debe ser mayor que 0.`;
  }
  return null;
}
