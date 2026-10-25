/**
 * ArtCraft · Juegos de PC con Rare (contrato `architecture/artcraft-y-rare.md` §5).
 * Módulo PURO: sin `node:*`, sin React, sin red. Rare (GPL-3.0-or-later) es siempre un programa
 * aparte; aquí solo se planifica qué ruta cabe y se vigila que ninguna sesión de Epic se cuele.
 */

export const CONDICIONES_EPIC_DECIDIDAS: boolean = false;

export type SistemaNeurona = "macos" | "linux" | "windows" | "otro";
export type RutaJuegoPc = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";

export interface NeuronaJuego { sistema: SistemaNeurona; tienePantalla: boolean; binarioRare: boolean; gpu: boolean; memoriaMB: number }
export interface ServidorJuego { id: string; propio: boolean; compartido: boolean; gpu: boolean; wineOProton: boolean; transmision: "selkies" | "sunshine" | null; libreDiscoGB: number }
export interface PersonaJuego { id: string; aceptaCondicionesEpic: boolean }
export interface EntradaJuegoPc { neurona: NeuronaJuego; servidores: ServidorJuego[]; persona: PersonaJuego }
export interface PlanJuegoPc { ruta: RutaJuegoPc; motivo: string; pasos: string[]; avisos: string[] }

const PERSONA = /^[a-z0-9-]{1,64}$/;

/** Carpeta de sesión de Legendary por persona, fuera de carpetas sincronizadas y con modo 0700. */
export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA.test(personaId)) throw new Error("El identificador de persona debe usar minúsculas, números o guiones (1 a 64).");
  const base = datos.replace(/[\\/]+$/, "");
  if (!base) throw new Error("Falta la carpeta de datos donde guardar la sesión de Epic.");
  return { ruta: `${base}/juegos/${personaId}/legendary`, modo: 0o700 };
}

const CAMPOS_EPIC = ["access_token", "refresh_token", "account_id", "exchange_code"] as const;

/** Guarda de credenciales: los hallazgos nombran el campo o el prefijo, nunca repiten el valor. */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const t = texto ?? "", hallazgos: string[] = [];
  for (const campo of CAMPOS_EPIC) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${campo}\\s*["']?\\s*[:=]\\s*["']?[^\\s"',;}]{9,}`, "i");
    if (re.test(t)) hallazgos.push(`Campo «${campo}» con un valor de sesión de Epic.`);
  }
  if (/eg1~[A-Za-z0-9._~+/=-]{4,}/.test(t)) hallazgos.push("Token de Epic con prefijo «eg1~».");
  return { ok: hallazgos.length === 0, hallazgos };
}

/** Solo las releases oficiales de Rare; datos remotos y espejos quedan bloqueados hasta fijar SHA. */
export function esUrlPermitidaRare(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  return u.hostname.toLowerCase() === "github.com" && /^\/RareDevs\/Rare\/releases(\/|$)/i.test(u.pathname);
}

const AVISO_SIN_GPU = "El A1 de Oracle (sin GPU) no sirve para juegos 3D; solo para el lanzador ligero o juegos 2D.";
const AVISO_TRANSMISION = "La ventana viaja por Selkies o Sunshine/Moonlight: el emparejamiento por PIN lo hace una persona.";
const AVISO_DISCO = "Quedan pocos GB libres: los juegos pesan decenas de GB y viven en el disco del anfitrión.";
const sirve = (s: ServidorJuego): boolean => s.gpu && s.wineOProton && s.transmision !== null;
const avisosDe = (s: ServidorJuego, extra: string[] = []): string[] => [
  ...extra, AVISO_TRANSMISION, ...(s.gpu ? [] : [AVISO_SIN_GPU]), ...(s.libreDiscoGB < 50 ? [AVISO_DISCO] : []),
];

function planNeurona(n: NeuronaJuego): PlanJuegoPc | null {
  if (!n.tienePantalla || !n.binarioRare) return null;
  return {
    ruta: "neurona-propia",
    motivo: "Tienes pantalla y Rare instalado: el juego corre en tu propia neurona y tú confirmas la apertura.",
    pasos: ["Abre Rare en tu neurona.", "Inicia sesión en Epic tú mismo.", "Instala el juego desde tu sesión.", "Confirma tú la apertura de Rare."],
    avisos: [...(n.gpu ? [] : ["Esta neurona no tiene GPU: los juegos 3D irán mal; los 2D y el lanzador sí."]),
      ...(n.memoriaMB < 4096 ? ["Menos de 4 GB de memoria: cierra otras apps antes de jugar."] : [])],
  };
}

function planServidor(s: ServidorJuego, persona: PersonaJuego): PlanJuegoPc {
  const pasos = ["Entra a tu sesión del servidor.", "Inicia sesión en Epic tú mismo dentro de Rare.",
    "Instala el juego desde tu sesión.", "Abre la ventana con Selkies o Sunshine/Moonlight y empareja el PIN tú mismo."];
  if (s.propio) return { ruta: "servidor-propio", pasos, avisos: avisosDe(s),
    motivo: "Hay un servidor propio con GPU, Wine o Proton y transmisión: la ventana llega a tu pantalla y tú inicias sesión." };
  if (!CONDICIONES_EPIC_DECIDIDAS) return { ruta: "ninguna", pasos: [], avisos: avisosDe(s),
    motivo: "El servidor compartido espera la palabra de Alex sobre las condiciones de Epic: una cuenta y una sesión por persona." };
  if (!persona.aceptaCondicionesEpic) return { ruta: "ninguna", pasos: [], avisos: avisosDe(s),
    motivo: "La persona no ha aceptado las condiciones de Epic para el servidor compartido." };
  return { ruta: "servidor-compartido", pasos, motivo: "Cada persona entra con su propia cuenta de Epic en su sesión aislada.",
    avisos: avisosDe(s, ["Una sesión aislada por persona; nunca se comparte la cuenta de nadie."]) };
}

export function planificarJuegoPc(e: EntradaJuegoPc): PlanJuegoPc {
  const { neurona, servidores, persona } = e;
  const propia = planNeurona(neurona);
  if (propia) return propia;
  const servidor = servidores.find((s) => s.propio && sirve(s)) ?? servidores.find((s) => !s.propio && s.compartido && sirve(s));
  if (servidor) return planServidor(servidor, persona);
  const falta = [!neurona.tienePantalla ? "esta neurona no tiene pantalla" : "", !neurona.binarioRare ? "Rare no está instalado" : ""]
    .filter(Boolean).join(" y ");
  return { ruta: "ninguna", pasos: [], avisos: servidores.some((s) => !s.gpu) ? [AVISO_SIN_GPU] : [],
    motivo: `${falta ? `No se puede jugar aquí: ${falta}; ` : ""}ningún servidor propio cumple GPU, Wine o Proton y transmisión.` };
}
