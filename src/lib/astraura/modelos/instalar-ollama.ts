// Instalación guiada de Ollama (MOD1110B · 2026-11-10). REGLAS DE ALEX: preguntar primero enseñando el tamaño, usar SOLO
// las descargas oficiales del editor y que la persona termine la instalación. Módulo PURO: la app nativa y la red se
// inyectan (`NativoOllama`, `sondear`), así que todo se prueba sin descargar nada.
//
// Datos comprobados el 2026-11-10 en https://ollama.com/download (que redirige a github.com/ollama/ollama/releases,
// versión v0.40.16, y de ahí al CDN release-assets.githubusercontent.com) y en la documentación oficial:
//   · macOS    https://docs.ollama.com/macos    → Ollama.dmg 229.996.388 bytes · macOS 14 (Sonoma) o más · se arrastra a Aplicaciones
//   · Windows  https://docs.ollama.com/windows  → OllamaSetup.exe 1.857.663.944 bytes · Windows 10 22H2 o más · no pide administrador,
//              se instala en la carpeta del usuario y quiere al menos 4 GB libres
//   · Linux    https://docs.ollama.com/linux    → `curl -fsSL https://ollama.com/install.sh | sh` (StarSeed NO lo ejecuta)
// Los tamaños son los de ese día: la app nativa vuelve a consultar el tamaño real justo antes de descargar.
// Honestidad: Ollama no publica una suma de verificación junto al instalador; StarSeed NO verifica su firma por su
// cuenta: la comprueba tu sistema (Gatekeeper en macOS, SmartScreen/Authenticode en Windows) al abrirlo.

import type { Plataforma } from "@/lib/astraura/perfil-hardware";
import type { Resultado } from "@/lib/nativa/tipos";
import { BASE_OLLAMA, type Traer } from "./instalar";

export type SistemaOllama = "macos" | "windows" | "linux" | "android" | "web";

export const FECHA_VERIFICACION_OLLAMA = "2026-11-10";
export const VERSION_VERIFICADA_OLLAMA = "v0.40.16";
export const COMANDO_LINUX_OLLAMA = "curl -fsSL https://ollama.com/install.sh | sh";

/** Qué sistema es, a partir de la plataforma de la neurona y el agente de usuario del navegador integrado. */
export function sistemaOllama(e: { plataforma: Plataforma; userAgent?: string }): SistemaOllama {
  const ua = e.userAgent ?? "";
  if (e.plataforma === "android" || /android/i.test(ua)) return "android";
  if (e.plataforma !== "tauri") return "web";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux|x11/i.test(ua)) return "linux";
  return "web";
}

export type AccionOllama = "descargar-instalador" | "instrucciones" | "no-corre-aqui";

export interface FichaOllama {
  sistema: SistemaOllama;
  accion: AccionOllama;
  editor: string;
  /** Nombre del archivo que se deja en Descargas. */
  archivo: string | null;
  /** URL oficial de descarga (la que se redirige a GitHub Releases); null si no se descarga. */
  url: string | null;
  bytes: number | null;
  dondeSeInstala: string;
  requisitos: string;
  comando: string | null;
  /** Páginas oficiales en las que se comprobó. */
  fuentes: string[];
  verificado: string;
}

const EDITOR = "Ollama (el proyecto de código abierto de ollama.com)";

export const FICHAS_OLLAMA: Record<SistemaOllama, FichaOllama> = {
  macos: {
    sistema: "macos", accion: "descargar-instalador", editor: EDITOR, archivo: "Ollama.dmg",
    url: "https://ollama.com/download/Ollama.dmg", bytes: 229_996_388,
    dondeSeInstala: "En la carpeta Aplicaciones, al arrastrar Ollama desde la imagen de disco que se abre. Los modelos que descargues después van a ~/.ollama.",
    requisitos: "macOS 14 (Sonoma) o más reciente. Apple silicon (CPU y GPU) o Intel (solo CPU).",
    comando: null,
    fuentes: ["https://ollama.com/download", "https://docs.ollama.com/macos"], verificado: FECHA_VERIFICACION_OLLAMA,
  },
  windows: {
    sistema: "windows", accion: "descargar-instalador", editor: EDITOR, archivo: "OllamaSetup.exe",
    url: "https://ollama.com/download/OllamaSetup.exe", bytes: 1_857_663_944,
    dondeSeInstala: "En tu carpeta de usuario (no pide administrador). Hacen falta al menos 4 GB libres para el programa; los modelos son aparte.",
    requisitos: "Windows 10 22H2 o más reciente. Con tarjeta NVIDIA o AMD Radeon usa la GPU.",
    comando: null,
    fuentes: ["https://ollama.com/download", "https://docs.ollama.com/windows"], verificado: FECHA_VERIFICACION_OLLAMA,
  },
  linux: {
    sistema: "linux", accion: "instrucciones", editor: EDITOR, archivo: null, url: null, bytes: null,
    dondeSeInstala: "Lo decide el propio instalador del editor (instala el programa y un servicio del sistema).",
    requisitos: "Lo indica la documentación oficial: https://docs.ollama.com/linux",
    comando: COMANDO_LINUX_OLLAMA,
    fuentes: ["https://ollama.com/download", "https://docs.ollama.com/linux"], verificado: FECHA_VERIFICACION_OLLAMA,
  },
  android: {
    sistema: "android", accion: "no-corre-aqui", editor: EDITOR, archivo: null, url: null, bytes: null,
    dondeSeInstala: "—", requisitos: "Ollama no tiene versión para Android.", comando: null,
    fuentes: ["https://ollama.com/download"], verificado: FECHA_VERIFICACION_OLLAMA,
  },
  web: {
    sistema: "web", accion: "no-corre-aqui", editor: EDITOR, archivo: null, url: null, bytes: null,
    dondeSeInstala: "—", requisitos: "Un navegador no puede instalar ni ejecutar Ollama.", comando: null,
    fuentes: ["https://ollama.com/download"], verificado: FECHA_VERIFICACION_OLLAMA,
  },
};

export const NOMBRE_SISTEMA: Record<SistemaOllama, string> = {
  macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", web: "el navegador",
};

/** Lista cerrada de anfitriones oficiales (espejo de `ollama_instalador::url_permitida` en Rust). */
export function urlOficialOllama(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  if (u.pathname.includes("..") || u.pathname.includes("\\")) return false;
  switch (u.hostname) {
    case "ollama.com": return u.pathname.startsWith("/download/");
    case "github.com": return u.pathname.startsWith("/ollama/ollama/releases/");
    case "release-assets.githubusercontent.com": return u.pathname.startsWith("/github-production-release-asset/");
    default: return false;
  }
}

const mb = (n: number) => `${Math.round(n / 1_000_000).toLocaleString("es-ES")} MB`;
const gb = (n: number) => `${(n / 1_000_000_000).toFixed(2).replace(".", ",")} GB`;
export const tamanoLegible = (bytes: number): string => (bytes >= 1_000_000_000 ? gb(bytes) : mb(bytes));

export interface PreguntaOllama {
  titulo: string;
  /** Líneas del cuadro de diálogo, en el orden en que se enseñan. */
  lineas: string[];
  accion: AccionOllama;
  /** Texto del botón que confirma (null si no hay nada que confirmar). */
  botonConfirmar: string | null;
  comando: string | null;
}

/** El cuadro que se enseña ANTES de hacer nada: qué es, quién lo publica, cuánto pesa, dónde se instala y qué hace StarSeed. */
export function preguntaOllama(f: FichaOllama): PreguntaOllama {
  const sis = NOMBRE_SISTEMA[f.sistema];
  const que = "Ollama es un programa gratuito y de código abierto que ejecuta modelos de IA en tu propio aparato, sin enviar tus conversaciones a ningún servidor.";
  if (f.accion === "no-corre-aqui") {
    return {
      titulo: "Ollama no corre aquí",
      lineas: [
        `${que} En ${sis} no se puede instalar: ${f.requisitos}`,
        "Lo que sí funciona aquí: las capas ligeras de Astraura (Needle y las 1.58-bit), o usar la IA de otra neurona de tu misma cuenta por la malla.",
      ],
      accion: f.accion, botonConfirmar: null, comando: null,
    };
  }
  if (f.accion === "instrucciones") {
    return {
      titulo: "Instalar Ollama en Linux",
      lineas: [
        `${que} Lo publica el proyecto Ollama (ollama.com).`,
        "En Linux StarSeed no ejecuta ningún instalador: estas son las instrucciones oficiales. Pega el comando en una terminal; instala el programa y un servicio del sistema, así que te pedirá tu contraseña.",
        `Comprobado el ${f.verificado} en ${f.fuentes[1]}.`,
      ],
      accion: f.accion, botonConfirmar: null, comando: f.comando,
    };
  }
  return {
    titulo: "¿Instalar Ollama?",
    lineas: [
      que,
      `Lo publica el proyecto Ollama (ollama.com). StarSeed descargará el instalador OFICIAL (${f.archivo}) desde ollama.com, que lo sirve desde GitHub Releases, y nada más.`,
      `Descarga para ${sis}: ${tamanoLegible(f.bytes ?? 0)} (comprobado el ${f.verificado}; se vuelve a comprobar justo antes de bajarlo). Se guarda en tu carpeta Descargas.`,
      `Dónde se instala: ${f.dondeSeInstala}`,
      `Requisitos: ${f.requisitos}`,
      "StarSeed NO ejecuta el instalador por su cuenta ni pide permisos de administrador: lo abre para que lo completes tú, y tu sistema comprueba la firma del editor al abrirlo. Puedes cancelar la descarga en cualquier momento y no se queda nada a medias.",
      "No empieza nada hasta que aceptes.",
    ],
    accion: f.accion,
    botonConfirmar: `Descargar el instalador (${tamanoLegible(f.bytes ?? 0)})`,
    comando: null,
  };
}

// ── Lo que hace falta de la app nativa ────────────────────────────────────────────────────────────

export interface ProgresoNativoOllama {
  fase: "comprobando" | "descargando" | "lista" | "cancelada" | "error";
  descargado: number;
  total: number;
  porcentaje: number;
}

export interface NativoOllama {
  disponible: boolean;
  descargar(sistema: SistemaOllama): Promise<Resultado<{ ruta: string; bytes: number }>>;
  cancelar(): Promise<boolean>;
  abrir(ruta: string, revelar?: boolean): Promise<Resultado<null>>;
  alProgresar(cb: (p: ProgresoNativoOllama) => void): Promise<() => void>;
}

export const COMANDOS_NATIVOS_OLLAMA = {
  descargar: "ollama_instalador_descargar",
  cancelar: "ollama_instalador_cancelar",
  abrir: "ollama_instalador_abrir",
  evento: "starseed://ollama-descarga",
} as const;

/** Envuelve el puente genérico de la app (`puenteNativo()`); no añade comandos a `puente.ts`. */
export function nativoOllamaDesde(p: {
  disponible: boolean;
  llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<Resultado<T>>;
  escuchar(evento: string, cb: (payload: unknown) => void): Promise<() => void>;
}): NativoOllama {
  return {
    disponible: p.disponible,
    descargar: (sistema) => p.llamar(COMANDOS_NATIVOS_OLLAMA.descargar, { sistema }),
    cancelar: async () => {
      const r = await p.llamar<boolean>(COMANDOS_NATIVOS_OLLAMA.cancelar);
      return r.ok && r.valor === true;
    },
    abrir: async (ruta, revelar) => {
      const r = await p.llamar<unknown>(COMANDOS_NATIVOS_OLLAMA.abrir, { ruta, revelar: revelar === true });
      return r.ok ? { ok: true, valor: null } : r;
    },
    alProgresar: (cb) => p.escuchar(COMANDOS_NATIVOS_OLLAMA.evento, (x) => {
      const o = x as Partial<ProgresoNativoOllama> | null;
      if (o && typeof o.fase === "string" && typeof o.descargado === "number" && typeof o.total === "number") {
        cb({ fase: o.fase, descargado: o.descargado, total: o.total, porcentaje: typeof o.porcentaje === "number" ? o.porcentaje : 0 });
      }
    }),
  };
}

// ── Ejecutar la instalación guiada ────────────────────────────────────────────────────────────────

export type EstadoInstalacionOllama =
  | "sin-confirmar"      // no hubo «sí»: no se tocó nada
  | "no-disponible"      // este sistema/esta app no puede descargar
  | "rechazada"          // la URL no era oficial (defensa en profundidad)
  | "abierto"            // descargado y abierto: la persona completa la instalación
  | "descargado-sin-abrir" // descargado, pero no se pudo abrir: está en Descargas
  | "cancelada"
  | "fallo";

export interface ResultadoInstalacionOllama {
  estado: EstadoInstalacionOllama;
  mensaje: string;
  ruta: string | null;
}

const COMO_SEGUIR = "Puedes volver a intentarlo, o descargar el instalador tú desde https://ollama.com/download. Mientras tanto siguen disponibles las capas ligeras de Astraura.";

/**
 * Descarga el instalador oficial y lo abre. NO hace nada sin `confirmado: true`; solo descarga en los sistemas
 * con acción «descargar-instalador»; nunca llama a la app nativa con una URL que no sea oficial.
 */
export async function instalarOllamaGuiado(
  ficha: FichaOllama,
  o: { confirmado: boolean; nativo: NativoOllama; onProgreso?: (p: ProgresoNativoOllama) => void },
): Promise<ResultadoInstalacionOllama> {
  const sin = (estado: EstadoInstalacionOllama, mensaje: string): ResultadoInstalacionOllama => ({ estado, mensaje, ruta: null });
  if (!o.confirmado) return sin("sin-confirmar", "Falta tu confirmación: no se descarga ni se abre nada sin preguntar.");
  if (ficha.accion !== "descargar-instalador" || !ficha.url) {
    return sin("no-disponible", ficha.accion === "instrucciones" ? "En Linux sigue las instrucciones oficiales: StarSeed no ejecuta instaladores." : `Ollama no corre en ${NOMBRE_SISTEMA[ficha.sistema]}.`);
  }
  if (!urlOficialOllama(ficha.url)) return sin("rechazada", "Esa dirección no es una descarga oficial de Ollama: no se descarga.");
  if (!o.nativo.disponible) return sin("no-disponible", "Solo la app de escritorio de StarSeed puede descargar el instalador. Descárgalo desde https://ollama.com/download.");

  let quitar: () => void = () => {};
  if (o.onProgreso) quitar = await o.nativo.alProgresar(o.onProgreso);
  try {
    const d = await o.nativo.descargar(ficha.sistema);
    if (!d.ok) {
      const cancelada = /cancelad/i.test(d.motivo);
      return sin(cancelada ? "cancelada" : "fallo", cancelada
        ? "Descarga cancelada: no se guardó nada y no se instaló nada."
        : `No se pudo descargar el instalador (${d.motivo}). No quedó nada a medias. ${COMO_SEGUIR}`);
    }
    const a = await o.nativo.abrir(d.valor.ruta);
    if (!a.ok) {
      return { estado: "descargado-sin-abrir", ruta: d.valor.ruta, mensaje: `El instalador se descargó en tu carpeta Descargas (${ficha.archivo}) pero no pude abrirlo (${a.motivo}). Ábrelo tú para continuar.` };
    }
    return { estado: "abierto", ruta: d.valor.ruta, mensaje: `Se abrió ${ficha.archivo}. Completa la instalación en la ventana que apareció; StarSeed detectará Ollama cuando esté listo.` };
  } finally {
    quitar();
  }
}

// ── Detección ─────────────────────────────────────────────────────────────────────────────────────

/** ¿Responde Ollama en esta máquina? (mejor esfuerzo: false si el navegador integrado bloquea el puerto). */
export async function sondearOllama(traer: Traer, base: string = BASE_OLLAMA): Promise<boolean> {
  try {
    const r = await traer(`${base.replace(/\/+$/, "")}/api/version`);
    return r.ok;
  } catch {
    return false;
  }
}

export interface OpcionesVigilancia {
  sondear: () => Promise<boolean>;
  alDetectar: () => void;
  /** Cada cuánto mira (por defecto 5 s: suave). */
  intervaloMs?: number;
  /** Deja de mirar pasado este tiempo (por defecto 30 min). */
  maxMs?: number;
  programar?: (f: () => void, ms: number) => unknown;
  cancelarProgramado?: (id: unknown) => void;
  ahora?: () => number;
}

/** Mira de vez en cuando si Ollama ya responde, mientras el cuadro está abierto. Devuelve la función que lo detiene. */
export function vigilarOllama(o: OpcionesVigilancia): () => void {
  const intervalo = o.intervaloMs ?? 5000;
  const max = o.maxMs ?? 30 * 60_000;
  const programar = o.programar ?? ((f, ms) => setTimeout(f, ms));
  const quitar = o.cancelarProgramado ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const ahora = o.ahora ?? (() => Date.now());
  const inicio = ahora();
  let parado = false;
  let id: unknown = null;
  const paso = async () => {
    if (parado) return;
    let ok = false;
    try { ok = await o.sondear(); } catch { ok = false; }
    if (parado) return;
    if (ok) { parado = true; o.alDetectar(); return; }
    if (ahora() - inicio >= max) { parado = true; return; }
    id = programar(() => { void paso(); }, intervalo);
  };
  id = programar(() => { void paso(); }, intervalo);
  return () => { parado = true; if (id !== null) quitar(id); };
}
