/** ManimGX · contrato de escena y validación pura (tarea MGX1023A, ola 1023X). Módulo PURO:
 *  no ejecuta nada, sin red, disco ni procesos. Reglas duras del §3 de
 *  `architecture/repos-3d-oido-agentes-1023.md`: el código que escribe un agente nunca corre
 *  en el proceso del OS; aquí solo se VALIDA su texto antes de que llegue al motor. */

export type CalidadEscena = "480p" | "720p" | "1080p";

export const CALIDADES: readonly CalidadEscena[] = ["480p", "720p", "1080p"];
export const FPS_ADMITIDOS: readonly number[] = [15, 24, 30, 60];
export const DURACION_MAXIMA_DEFECTO = 60;
export const DURACION_MAXIMA_TOPE = 120;

/** Una escena lista para el motor ManimGX (2D/3D de Manim CE a MP4). */
export interface EscenaManim {
  codigo: string;
  clase: string;
  calidad: CalidadEscena;
  fps: number;
  duracionMax: number;
}

/** Veredicto de la validación: motivos legibles en español, nunca ejecuta el código. */
export interface VeredictoEscena {
  valida: boolean;
  motivos: string[];
}

/** Raíces de import admitidas en una escena de ManimGX. Todo lo demás, rechazado. */
export const IMPORTS_PERMITIDOS: readonly string[] = ["manimgx", "manim", "math", "numpy"];

/** Una prohibición del §3: patrón y el motivo legible que aparece en el veredicto. */
interface Prohibicion {
  patron: RegExp;
  motivo: string;
}

const PROHIBICIONES: readonly Prohibicion[] = [
  { patron: /\bopen\s*\(/, motivo: "«open()» está prohibido: la escena no lee ni escribe archivos del disco" },
  {
    patron: /\bexec\s*\(|\beval\s*\(|\b__import__\s*\(/,
    motivo: "«exec»/«eval»/«__import__» está prohibido: la escena no ejecuta código dinámico",
  },
  { patron: /\bsubprocess\b/, motivo: "«subprocess» está prohibido: la escena no lanza procesos" },
  { patron: /\bpickle\b/, motivo: "«pickle» está prohibido: la escena no deserializa objetos externos" },
  { patron: /\b(?:os|sys)\s*\./, motivo: "Uso de «os.» o «sys.» prohibido: la escena no toca el sistema" },
  { patron: /\b(?:requests|urllib|socket|httpx|ftplib|telnetlib|http\.client)\b/, motivo: "Acceso a red prohibido: la escena no conecta a Internet" },
];

/** Regex de una línea de import de Python: `from X import …` o `import X[, Y]`. */
const LINEA_IMPORT = /^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\b|import\s+([A-Za-z_][\w.,\s]*))/;

/** Regex de una clase de escena: hereda de Scene (o ThreeDScene, MovingCameraScene…). */
const CLASE_ESCENA = /class\s+([A-Za-z_]\w*)\s*\(\s*\w*Scene\s*\)/;

/** Devuelve el nombre de la clase de la escena (hereda de Scene) o null si no la hay. */
export function extraerClase(codigo: string): string | null {
  const hallada = codigo.match(CLASE_ESCENA);
  return hallada ? hallada[1] : null;
}

/** Valida el texto de una escena sin ejecutarlo. Rechaza lo que no es una escena de
 *  Manim (clase que herede de Scene, imports solo de manimgx/manim/math/numpy) y todo
 *  lo peligroso del §3: disco, código dinámico, procesos, sistema y red. */
export function validarEscena(codigo: string): VeredictoEscena {
  const motivos: string[] = [];
  // Las líneas de comentario no cuentan: es texto para una persona, no código que corra.
  const lineas = codigo.split("\n").filter((linea) => !/^\s*#/.test(linea));
  const texto = lineas.join("\n");

  if (!texto.trim()) {
    return { valida: false, motivos: ["La escena está vacía: no hay código que validar"] };
  }

  if (!CLASE_ESCENA.test(texto)) {
    motivos.push("No es una escena de Manim: falta una clase que herede de Scene (o ThreeDScene…)");
  }

  for (const linea of lineas) {
    const coincidencia = linea.match(LINEA_IMPORT);
    if (!coincidencia) continue;
    // `from X import …` da un módulo; `import X, Y as Z` puede dar varios.
    const modulos = coincidencia[1]
      ? [coincidencia[1]]
      : (coincidencia[2] ?? "")
          .split(",")
          .map((parte) => parte.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);
    for (const modulo of modulos) {
      const raiz = modulo.split(".")[0];
      if (!IMPORTS_PERMITIDOS.includes(raiz)) {
        motivos.push(`«${modulo}» está fuera de los imports permitidos: solo manimgx, manim, math y numpy`);
      }
    }
  }

  for (const { patron, motivo } of PROHIBICIONES) {
    if (patron.test(texto)) motivos.push(motivo);
  }

  return { valida: motivos.length === 0, motivos };
}

/** Construye una escena completa aplicando defectos (720p, 30 fps, 60 s) y tope de duración. */
export function crearEscenaManim(
  parcial: { codigo: string; clase?: string; calidad?: CalidadEscena; fps?: number; duracionMax?: number }
): EscenaManim {
  const clase = parcial.clase ?? extraerClase(parcial.codigo) ?? "Escena";
  const fps = typeof parcial.fps === "number" && FPS_ADMITIDOS.includes(parcial.fps) ? parcial.fps : 30;
  const calidad = parcial.calidad && CALIDADES.includes(parcial.calidad) ? parcial.calidad : "720p";
  const duracionMax =
    typeof parcial.duracionMax === "number" && parcial.duracionMax > 0
      ? Math.min(parcial.duracionMax, DURACION_MAXIMA_TOPE)
      : DURACION_MAXIMA_DEFECTO;
  return { codigo: parcial.codigo, clase, calidad, fps, duracionMax };
}
