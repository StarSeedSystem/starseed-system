/**
 * ArtCraft · Rare — «Juegos de PC» (contrato `architecture/artcraft-y-rare.md` §5). Módulo PURO:
 * sin `node:*`, sin React, sin red. Rare (GPL-3.0-or-later) vive SOLO como programa aparte, nunca
 * enlazado. Las credenciales de Epic son de la persona y jamás pasan por el OS: este módulo solo
 * planea la ruta, calcula la ruta de configuración local y detecta sesiones de Epic en textos.
 */

/** La ruta C (servidor compartido con cuentas propias) espera la palabra de Alex (§8). */
export const CONDICIONES_EPIC_DECIDIDAS = false;

export interface NeuronaJuegoPc { sistema: "macos" | "linux" | "windows" | "otro"; tienePantalla: boolean; binarioRare: boolean; gpu: boolean; memoriaMB: number }
export interface ServidorJuegoPc { id: string; propio: boolean; compartido: boolean; gpu: boolean; wineOProton: boolean; transmision: "selkies" | "sunshine" | null; libreDiscoGB: number }
export interface PersonaJuegoPc { id: string; aceptaCondicionesEpic: boolean }
export interface DatosJuegoPc { neurona: NeuronaJuegoPc; servidores: ServidorJuegoPc[]; persona: PersonaJuegoPc }
export type RutaJuegoPc = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
export interface PlanJuegoPc { ruta: RutaJuegoPc; motivo: string; pasos: string[]; avisos: string[] }

/** Rutas A, B y C y el «ninguna» con su motivo: decisiones de más a menos simple (§5.1). */
export function planificarJuegoPc(datos: DatosJuegoPc): PlanJuegoPc {
  const avisos = ["Rare es un programa aparte (GPL-3.0-or-later): nunca se enlaza con el OS ni le pasa credenciales.",
    "Los juegos pesan decenas de GB y viven en el disco del anfitrión: no son un volumen montado de la malla."];
  const avisosServidores = datos.servidores.filter((s) => !s.gpu)
    .map((s) => `${s.id}: sin GPU (como el A1 de Oracle) no sirve para juegos 3D; sí para 2D o el lanzador ligero.`);
  if (datos.neurona.tienePantalla && datos.neurona.binarioRare) {
    return { ruta: "neurona-propia", motivo: "Esta neurona tiene pantalla y Rare instalado: ruta A (nativo y confirmado por una persona).",
      pasos: ["abre Rare", "inicia sesión en Epic tú mismo en tu ventana", "confirma el lanzamiento cuando el OS lo pida"], avisos: [...avisos, ...avisosServidores] };
  }
  const propio = datos.servidores.find((s) => s.propio && s.gpu && s.wineOProton && s.transmision !== null && s.libreDiscoGB > 0);
  if (propio) {
    return { ruta: "servidor-propio", motivo: `Servidor propio «${propio.id}» con GPU, Wine o Proton y ventana transmitida: ruta B.`,
      pasos: [`conéctate a la ventana transmitida de «${propio.id}» (${propio.transmision})`, "inicia sesión en Epic tú mismo en esa ventana", `instala los juegos en el propio «${propio.id}» desde tu sesión`],
      avisos: [...avisos, ...(propio.gpu ? avisosServidores : [])] };
  }
  const compartido = datos.servidores.find((s) => s.compartido && s.gpu && s.wineOProton && s.transmision !== null && s.libreDiscoGB > 0);
  if (CONDICIONES_EPIC_DECIDIDAS && datos.persona.aceptaCondicionesEpic && compartido) {
    return { ruta: "servidor-compartido", motivo: `Servidor compartido «${compartido.id}»: ruta C, una sesión aislada con TU cuenta de Epic.`,
      pasos: [`entra en tu sesión aislada de «${compartido.id}»`, "inicia sesión en Epic solo con tu cuenta", "respeta la cuota de tiempo y de disco de tu sesión"],
      avisos: [...avisos, ...(compartido.gpu ? avisosServidores : [])] };
  }
  const porQue = compartido && !CONDICIONES_EPIC_DECIDIDAS
    ? "la ruta C espera la decisión de Alex sobre las condiciones de Epic"
    : compartido ? "la persona aún no aceptó las condiciones de Epic" : "no hay servidor compartido con GPU, Wine o Proton y transmisión";
  return { ruta: "ninguna", motivo: `Sin ruta disponible: no hay pantalla con Rare en esta neurona, no hay servidor propio apto y ${porQue}.`,
    pasos: [], avisos: [...avisos, ...avisosServidores] };
}

const PERSONA_ID = /^[a-z0-9-]{1,64}$/;

/** Carpeta de configuración de Legendary por persona: `<datos>/juegos/<persona>/legendary`, modo 0700 (§5.3). */
export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_ID.test(personaId)) throw new Error("El identificador de persona solo puede tener minúsculas, números y guiones (a 64): así queda 0700 y al nombre.");
  return { ruta: `${datos}/juegos/${personaId}/legendary`, modo: 0o700 };
}

const CAMPOS_EPIC = ["access_token", "refresh_token", "account_id", "exchange_code"] as const;
/** Valor del campo y nombre; el hallazgo solo lleva el nombre, jamás el valor. */
const CAMPO = (campo: string): RegExp => new RegExp(`${campo}["'\\s=:]{1,4}(["'][^"']{9,}["']|[^\\s"',;)\\]]{9,})`, "iu");

/** Busca campos típicos de la sesión de Legendary en un texto; los hallazgos NUNCA repiten el valor. */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos = CAMPOS_EPIC.filter((c) => CAMPO(c).test(texto)).map((c) => `campo «${c}» de una sesión de Epic`);
  if (/eg1~[A-Za-z0-9._-]{8,}/u.test(texto)) hallazgos.push("token de Epic con prefijo «eg1~»");
  return { ok: hallazgos.length === 0, hallazgos };
}

/** Bloquea `raredevs.github.io`, `protondb.com` y descargas remotas hasta fijar SHA (§5.3); true solo para releases oficiales. */
export function esUrlPermitidaRare(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (/^(www\.)?raredevs\.github\.io$|protondb\.com$/iu.test(u.hostname)) return false;
  return u.hostname === "github.com" && u.pathname.replace(/\/+$/, "").startsWith("/RareDevs/Rare/releases/");
}
