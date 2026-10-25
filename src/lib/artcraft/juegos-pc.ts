/**
 * ArtCraft · Rare: juegos de PC en neuronas y servidores (contrato `architecture/artcraft-y-rare.md` §5). Módulo PURO
 * (sin `node:*`, sin React, sin red). Rare es GPL-3.0-or-later: corre SOLO como programa aparte, nunca enlazado.
 * Las credenciales de Epic son SIEMPRE de la persona: el OS jamás las recibe ni deja que pasen a memorias, salas,
 * grupos ni registros (§5.3). La ruta C espera la palabra de Alex: se guarda aquí y no se ofrece hasta entonces.
 */

export const CONDICIONES_EPIC_DECIDIDAS = false;

export type SistemaNeurona = "macos" | "linux" | "windows" | "otro";
export type TransmisionVentana = "selkies" | "sunshine" | null;
export interface NeuronaJuegoPc { sistema: SistemaNeurona; tienePantalla: boolean; binarioRare: boolean; gpu: boolean; memoriaMB: number }
export interface ServidorJuegoPc { id: string; propio: boolean; compartido: boolean; gpu: boolean; wineOProton: boolean; transmision: TransmisionVentana; libreDiscoGB: number }
export interface PersonaEpic { id: string; aceptaCondicionesEpic: boolean }
export type RutaJuegoPc = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
export interface PlanJuegoPc { ruta: RutaJuegoPc; motivo: string; pasos: string[]; avisos: string[] }
export interface EntradaJuegoPc { neurona: NeuronaJuegoPc; servidores: ServidorJuegoPc[]; persona: PersonaEpic }

export const AVISO_SIN_GPU = "Un anfitrión sin GPU (como el A1 de Oracle) no sirve para juegos 3D: solo para el lanzador ligero o juegos 2D.";
export const AVISO_GPL = "Rare es GPL-3.0-or-later y corre como programa aparte: el OS lo pide abrir, una persona confirma, nunca se enlaza.";
export const avisoDisco = (gb: number): string => `El juego pesa decenas de GB en el disco del anfitrión (hay ${gb} GB libres): no es un volumen de la malla.`;
const PASOS_EPIC = ["inicia sesión en Epic tú mismo, en tu ventana de Rare", "instala el juego desde tu sesión: el OS no instala nada por ti"];

/** Ruta A: pantalla y Rare instalado en la neurona de la persona. */
function rutaNeurona(n: NeuronaJuegoPc): PlanJuegoPc {
  const avisos = [AVISO_GPL, ...(n.gpu ? [] : [AVISO_SIN_GPU]),
    ...(n.memoriaMB > 0 && n.memoriaMB < 4096 ? ["Con menos de 4 GB de memoria en la neurona, un juego 3D irá mal: valora un servidor propio."] : [])];
  return { ruta: "neurona-propia", motivo: "Rare está instalado en esta neurona con pantalla: ruta A, con la confirmación de una persona.",
    pasos: ["abre Rare en esta neurona", ...PASOS_EPIC], avisos };
}

/** Ruta B (servidor propio) y C (compartido) con Wine o Proton y ventana transmitida. */
function rutaServidor(s: ServidorJuegoPc, compartida: boolean): PlanJuegoPc {
  const avisos = [AVISO_GPL, avisoDisco(s.libreDiscoGB), ...(s.gpu ? [] : [AVISO_SIN_GPU])];
  if (!compartida) return { ruta: "servidor-propio", motivo: `Servidor propio «${s.id}» con ${s.transmision}: la ventana se transmite, el juego vive en su disco.`,
    pasos: [`conéctate a la ventana transmitida por ${s.transmision} (el emparejamiento lo haces tú)`, ...PASOS_EPIC], avisos };
  return { ruta: "servidor-compartido", motivo: `Servidor compartido «${s.id}»: una sesión aislada por persona, cada una con SU cuenta de Epic.`,
    pasos: [`conéctate a TU sesión del servidor por ${s.transmision}`, "inicia sesión en Epic tú mismo, en TU sesión, con TU cuenta", "instala el juego desde tu sesión: el OS no instala nada por ti"], avisos };
}

export function planificarJuegoPc(e: EntradaJuegoPc): PlanJuegoPc {
  if (e.neurona.tienePantalla && e.neurona.binarioRare) return rutaNeurona(e.neurona);
  const apto = (s: ServidorJuegoPc): boolean =>
    Boolean(s.wineOProton && s.transmision && s.libreDiscoGB > 0 && (s.propio || s.compartido));
  const propio = e.servidores.find((s) => s.propio && apto(s));
  if (propio) return rutaServidor(propio, false);
  const compartido = e.servidores.find((s) => !s.propio && s.compartido && apto(s));
  if (compartido) {
    if (CONDICIONES_EPIC_DECIDIDAS && e.persona.aceptaCondicionesEpic) return rutaServidor(compartido, true);
    return { ruta: "ninguna", motivo: CONDICIONES_EPIC_DECIDIDAS ? "La persona no ha aceptado las condiciones de Epic para servidores compartidos."
      : "La ruta C (servidor compartido) no se ofrece: espera la palabra de Alex sobre las condiciones de Epic.", pasos: [], avisos: [] };
  }
  return { ruta: "ninguna", motivo: "Ni neurona con pantalla y Rare instalado, ni servidor con Wine o Proton y transmisión: no hay ruta para el juego.", pasos: [], avisos: [] };
}

/* ── Guarda de credenciales de Epic (§5.3) ── */
const PERSONA_EPIC = /^[a-z0-9-]{1,64}$/;
const CAMPOS_EPIC = "access_token|refresh_token|account_id|exchange_code";

export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_EPIC.test(personaId)) throw new Error("Id de persona inválido para la carpeta de juegos de Epic (solo minúsculas, dígitos y -).");
  return { ruta: `${datos}/juegos/${personaId}/legendary`, modo: 0o700 };
}

export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const etiquetas: Record<string, string> = { access_token: "token de acceso", refresh_token: "token de refresco",
    account_id: "id de cuenta", exchange_code: "código de canje" };
  const hallazgos: string[] = [];
  const visto = new Set<string>();
  for (const m of texto.matchAll(new RegExp(`(${CAMPOS_EPIC})["']?\\s*[:=]\\s*["']?([^"'\\s]{9,})`, "gi"))) {
    const campo = (m[1]).toLowerCase();
    if (!visto.has(campo)) { visto.add(campo); hallazgos.push(`Credencial de Epic detectada (${etiquetas[campo]}): nunca va a memorias, salas ni registros.`); }
  }
  if (/eg1~/.test(texto)) hallazgos.push("Token de sesión de Epic con prefijo eg1~: nunca va al repositorio ni a la memoria.");
  return { ok: hallazgos.length === 0, hallazgos };
}

export function esUrlPermitidaRare(url: string): boolean {
  try { const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" && /^\/RareDevs\/Rare\/releases(\/|$)/.test(u.pathname);
  } catch { return false; }
}
