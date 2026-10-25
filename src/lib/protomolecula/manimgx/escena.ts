// ManimGX · contrato de escena y validación pura (MGX1023 · ola 1023X).
// Módulo puro: NO ejecuta nada, no toca disco ni red. Decide si un código Python
// es una escena de ManimGX segura para mandarse a un Worker (Pyodide) o a un
// contenedor sin red (regla dura §3 de architecture/repos-3d-oido-agentes-1023.md:
// el código que escribe un agente nunca corre en el proceso del OS).

export type CalidadEscena = "480p" | "720p" | "1080p";

/** Contrato de una escena ManimGX escrita por un agente, antes de ejecutar nada. */
export interface EscenaManim {
  /** Código Python completo de la escena. */
  codigo: string;
  /** Nombre de la clase de escena (p. ej. «CuboOrbital»). */
  clase: string;
  calidad: CalidadEscena;
  /** Cuadros por segundo (24, 30 o 60 en Manim). */
  fps: number;
  /** Tope de duración de la animación en segundos. */
  duracionMax: number;
}

/** Resultado de validar un código: motivos legibles, nunca trazas técnicas. */
export interface ValidacionEscena {
  valida: boolean;
  /** Nombre detectado de la clase de escena, o null si no hay escena. */
  clase: string | null;
  /** Motivos de rechazo en español, uno por problema encontrado. */
  motivos: string[];
}

/** Raíces de módulo que una escena puede importar. Todo lo demás se rechaza. */
const RAICES_PERMITIDAS = new Set(["manimgx", "manim", "math", "numpy"]);

const RAICES_DE_RED = new Set([
  "socket", "ssl", "http", "urllib", "urllib3", "httpx", "requests",
  "ftplib", "smtplib", "poplib", "imaplib", "telnetlib", "websockets", "websocket",
]);

/** Patrón de clase de escena de Manim: la base termina en «Scene» (Scene, ThreeDScene…). */
const REGEX_CLASE =
    /^\s*class\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*\)\s*:/;

/** Patrones prohibidos: ejecución, disco, procesos, módulos de sistema y URLs. */
const PROHIBIDOS: { patron: RegExp; motivo: string }[] = [
  { patron: /\bopen\s*\(/, motivo: "usa open( para abrir archivos: una escena no lee ni escribe del disco" },
  { patron: /\bexec\s*\(/, motivo: "usa exec(): no se permite ejecutar código generado" },
  { patron: /\beval\s*\(/, motivo: "usa eval(): no se permite evaluar expresiones arbitrarias" },
  { patron: /\b__import__\s*\(/, motivo: "usa __import__(): no se permite importar por reflexión" },
  { patron: /\bsubprocess\b/, motivo: "menciona subprocess: una escena no lanza procesos" },
  { patron: /\bos\s*\./, motivo: "usa «os.»: no se accede al sistema operativo" },
  { patron: /\bsys\s*\./, motivo: "usa «sys.»: no se accede al intérprete de Python" },
  { patron: /(?:https?|ftps?|wss?):\/\//, motivo: "contiene una URL: una escena no conecta con la red" },
];

/** Extrae el nombre de la clase de escena de un código Python, o null. */
export function claseDeEscena(codigo: string): string | null {
  const coincidencia = codigo.match(REGEX_CLASE);
  if (!coincidencia) return null;
  const bases = coincidencia[2].split(",").map((b) => b.trim());
  const esEscena = bases.some((b) => /(?:Scene|ThreeDScene)$/.test(b));
  return esEscena ? coincidencia[1] : null;
}

/** Verifica que un código Python sea una escena de Manim segura y devuelve el dictamen. */
export function validarEscena(codigo: string): ValidacionEscena {
  const clase = claseDeEscena(codigo);
  const motivos: string[] = [];

  if (!codigo.trim()) {
    return { valida: false, clase: null, motivos: ["el código viene vacío"] };
  }
  if (!clase) {
    motivos.push(
      'no es una escena de Manim: falta «class Nombre(Scene):» o «class Nombre(ThreeDScene):»',
    );
  }

  // Imports: se revisan las declaraciones línea a línea, saltando los comentarios.
  for (const linea of codigo.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const desde = limpia.match(/^from\s+([A-Za-z_][\w.]*)\s+import\b/);
    const simples = limpia.startsWith("import ")
      ? limpia.slice("import ".length).split(",").map((m) => m.trim().split(/\s+/)[0])
      : null;
    const raices = desde ? [desde[1].split(".")[0]] : simples;
    if (!raices) continue;
    for (const raiz of raices) {
      if (RAICES_DE_RED.has(raiz)) {
        motivos.push(`importa «${raiz}»: una escena no usa la red`);
      } else if (!RAICES_PERMITIDAS.has(raiz)) {
        motivos.push(`importa «${raiz}»: solo se permiten manimgx, manim, math y numpy`);
      }
    }
  }

  // Construcciones prohibidas, línea a línea para informar con línea.
  codigo.split("\n").forEach((linea, indice) => {
    if (!linea.trim() || linea.trim().startsWith("#")) return;
    for (const { patron, motivo } of PROHIBIDOS) {
      if (patron.test(linea)) {
        motivos.push(`línea ${indice + 1}: ${motivo}`);
      }
    }
  });

  return { valida: motivos.length === 0, clase, motivos };
}
