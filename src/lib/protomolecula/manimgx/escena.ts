// Contrato de escena de ManimGX para la Protomolécula y Astraura.
// Módulo puro: valida el CÓDIGO que escribe un agente sin ejecutar nada de él.
// Regla dura §3 de architecture/repos-3d-oido-agentes-1023.md: el código de
// ManimGX nunca corre en el proceso del OS ni con permisos de la persona;
// aquí solo se decide si es una escena de Manim segura y legible.

export type CalidadManim = "480p" | "720p" | "1080p";

export interface EscenaManimContrato {
  codigo: string;
  clase: string;
  calidad: CalidadManim;
  fps: number;
  duracionMax: number;
}

export type ResultadoValidacionEscena =
  | { ok: true }
  | { ok: false; motivos: string[] };

/** Raíces de módulo permitidas en los imports de una escena. */
const MODULOS_PERMITIDOS = ["manim", "manimgx", "math", "numpy"];

/** Puntos de contacto con disco, procesos, sistema o red: prohibidos. */
const PROHIBIDOS: { patron: RegExp; motivo: string }[] = [
  { patron: /\bopen\s*\(/, motivo: "«open(» abre archivos del disco: prohibido en una escena de ManimGX." },
  { patron: /\bexec\s*\(/, motivo: "«exec(» ejecuta código arbitrario: prohibido en una escena de ManimGX." },
  { patron: /\beval\s*\(/, motivo: "«eval(» ejecuta código arbitrario: prohibido en una escena de ManimGX." },
  { patron: /__import__/, motivo: "«__import__» importa módulos ocultos: prohibido en una escena de ManimGX." },
  { patron: /\bsubprocess\b/, motivo: "«subprocess» lanza procesos: prohibido en una escena de ManimGX." },
  { patron: /\bos\s*\./, motivo: "«os.» toca el sistema operativo: prohibido en una escena de ManimGX." },
  { patron: /\bsys\s*\./, motivo: "«sys.» toca el intérprete y el sistema: prohibido en una escena de ManimGX." },
  {
    patron: /\b(urllib|urllib3|requests|httpx|aiohttp|socket|websocket|urlopen)\b/,
    motivo: "Ese módulo habla por red: prohibido en una escena de ManimGX.",
  },
  { patron: /\bfetch\s*\(/, motivo: "«fetch(» va por red: prohibido en una escena de ManimGX." },
];

const RE_CLASE = /^\s*class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/;

function raizDeModulo(modulo: string): string {
  return modulo.split(".")[0] ?? "";
}

/** Nombres de las clases declaradas en el código, en orden de aparición. */
export function clasesEscena(codigo: string): string[] {
  const nombres: string[] = [];
  for (const linea of codigo.split("\n")) {
    const declarada = linea.match(RE_CLASE);
    if (declarada) nombres.push(declarada[1]);
  }
  return nombres;
}

/** ¿La clase hereda de una escena de Manim (Scene, ThreeDScene, etc…)? */
function esClaseEscena(bases: string): boolean {
  if (bases.trim().length === 0) return false;
  return bases.split(",").some((base) => {
    const trozos = base.trim().split(".");
    return (trozos[trozos.length - 1] ?? "").endsWith("Scene");
  });
}

function revisarModulo(modulo: string, motivos: Set<string>): void {
  const raiz = raizDeModulo(modulo);
  if (MODULOS_PERMITIDOS.includes(raiz)) return;
  motivos.add(`Import del módulo «${modulo}» no permitido: solo manim, manimgx, math y numpy.`);
}

function revisarImport(codigo: string, motivos: Set<string>): void {
  for (const linea of codigo.split("\n")) {
    const desde = linea.match(/^\s*from\s+([.\w]+)\s+import\b/);
    if (desde) revisarModulo(desde[1], motivos);
    const impar = linea.match(/^\s*import\s+(.+?)\s*$/);
    if (impar) {
      for (const trozo of impar[1].split(",")) {
        const sinAlias = trozo.trim().split(/\s+as\s+/)[0]?.trim() ?? "";
        if (sinAlias.length > 0) revisarModulo(sinAlias, motivos);
      }
    }
  }
}

/**
 * Decide si un código es una escena de Manim segura. NO ejecuta nada y NO toca
 * disco ni red: solo lee cadenas. Acumula los motivos legibles, sin repetir.
 */
export function validarEscena(codigo: string): ResultadoValidacionEscena {
  if (codigo.trim().length === 0) {
    return { ok: false, motivos: ["La escena está vacía: no hay código que representar."] };
  }
  const motivos = new Set<string>();
  revisarImport(codigo, motivos);
  for (const prohibido of PROHIBIDOS) {
    if (prohibido.patron.test(codigo)) motivos.add(prohibido.motivo);
  }
  let hayClase = false;
  let hayEscena = false;
  for (const linea of codigo.split("\n")) {
    const declarada = linea.match(RE_CLASE);
    if (!declarada) continue;
    hayClase = true;
    if (esClaseEscena(declarada[2] ?? "")) hayEscena = true;
  }
  if (!hayClase) {
    motivos.add("No hay ninguna clase: una escena de ManimGX es una clase que hereda de Scene.");
  } else if (!hayEscena) {
    motivos.add("Ninguna clase hereda de una escena de Manim (Scene, ThreeDScene…): no es una escena.");
  }
  return motivos.size === 0 ? { ok: true } : { ok: false, motivos: [...motivos] };
}
