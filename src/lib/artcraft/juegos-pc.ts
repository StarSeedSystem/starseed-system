/**
 * Rare · «Juegos de PC»: planificador puro de rutas y guarda de credenciales de Epic
 * (contrato: `architecture/artcraft-y-rare.md` §5 y §5.3). Rare es GPL-3.0-or-later:
 * programa APARTE (§2.5), nunca enlazado; el OS no incrusta Rare, no ejecuta
 * `legendary` por un agente, no guarda sesiones de Epic ni comparte cuentas. Ruta A:
 * neurona propia con pantalla (Rare nativo, SIEMPRE con la confirmación de una
 * persona vía `pedirLanzamiento("rare", …)`); B: servidor propio con GPU, Wine o
 * Proton y transmisión; C: servidor compartido, UNA sesión por persona con SU cuenta
 * — hasta que Alex decida las condiciones de Epic (§8) NO se ofrece. Módulo PURO:
 * sin `node:*`, sin React, sin red.
 */

/** Condiciones de Epic para servidores compartidos (§8, apartado 1): a la espera de Alex. */
export const CONDICIONES_EPIC_DECIDIDAS = false;

export type SistemaJuegos = "macos" | "linux" | "windows" | "otro";
export interface NeuronaJuegos { sistema: SistemaJuegos; tienePantalla: boolean; binarioRare: boolean; gpu: boolean; memoriaMB: number }
export interface ServidorJuegos {
  id: string; propio: boolean; compartido: boolean; gpu: boolean; wineOProton: boolean;
  transmision: "selkies" | "sunshine" | null; libreDiscoGB: number;
}
export interface PersonaJuegos { id: string; aceptaCondicionesEpic: boolean }
export type RutaJuego = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
export interface PlanJuegoPc { ruta: RutaJuego; motivo: string; pasos: string[]; avisos: string[] }

const AVISO_LICENCIA = "Rare es GPL-3.0-or-later: corre como programa aparte, nunca enlazado al OS.";
const AVISO_CONFIRMACION = "el OS nunca abre Rare solo: una persona confirma siempre la petición de lanzamiento.";
const AVISO_SIN_GPU = "servidor sin GPU (p. ej. el A1 de Oracle): no sirve para juegos 3D, solo para el lanzador o juegos 2D.";
const AVISO_PIN = "si la transmisión es Sunshine, su emparejamiento por PIN lo hace la persona desde su sesión, no el OS.";
const AVISO_CUENTA = "cada persona usa SU cuenta de Epic en SU propia sesión; el OS nunca guarda sesiones ni comparte cuentas.";
const JUEGOS_PESAN_GB = 20;
const AVISO_DISCO = `algún servidor con menos de ${JUEGOS_PESAN_GB} GB libres: los juegos pesan decenas de GB y viven en el disco del anfitrión.`;
export const ID_PERSONA_EPIC = /^[a-z0-9-]{1,64}$/;

/** Motivo legible en español si un servidor no puede 3D con Rare; `null` si sirve. */
function porQueNoSirve(s: ServidorJuegos): string | null {
  if (!s.gpu) return "sin GPU";
  if (!s.wineOProton) return "sin Wine ni Proton (los juegos de Windows no arrancan)";
  if (s.transmision === null) return "sin transmisión de ventana (Selkies o Sunshine)";
  return null;
}
/** Planifica la ruta para jugar en PC (§5.1): A, B o C; en su defecto «ninguna» con el motivo. */
export function planificarJuegoPc(d: {
  neurona: NeuronaJuegos; servidores: ServidorJuegos[]; persona: PersonaJuegos;
}): PlanJuegoPc {
  const avisos: string[] = [];
  const anfitriones = d.servidores.filter((s) => s.propio || s.compartido);
  if (anfitriones.some((s) => s.wineOProton && s.transmision !== null && !s.gpu)) avisos.push(AVISO_SIN_GPU);
  if (anfitriones.some((s) => s.libreDiscoGB < JUEGOS_PESAN_GB)) avisos.push(AVISO_DISCO);
  if (d.neurona.tienePantalla && d.neurona.binarioRare) {
    avisos.push(AVISO_LICENCIA, AVISO_CONFIRMACION);
    return {
      ruta: "neurona-propia", motivo: "neurona propia con pantalla y Rare instalado: ruta A, Rare nativo.",
      pasos: ["abre Rare en tu neurona", "inicia sesión en Epic tú mismo", "elige el juego y púlsalo"], avisos,
    };
  }
  const propio = d.servidores
    .filter((s) => s.propio && !s.compartido)
    .map((s) => [s, porQueNoSirve(s)] as const);
  const [eleccionB] = propio.find(([, malo]) => malo === null) ?? [];
  if (eleccionB) {
    avisos.push(AVISO_LICENCIA, AVISO_PIN);
    return {
      ruta: "servidor-propio",
      motivo: `servidor «${eleccionB.id}» propio, con GPU, Wine o Proton y transmisión «${eleccionB.transmision}»: ruta B.`,
      pasos: ["arranca Rare en el servidor propio", `entra por ${eleccionB.transmision} a la ventana de Rare`,
        "inicia sesión en Epic tú mismo, en tu sesión", "elige el juego y púlsalo"], avisos,
    };
  }
  const compartido = d.servidores
    .filter((s) => s.compartido && !s.propio)
    .map((s) => [s, porQueNoSirve(s)] as const);
  const [eleccionC] = compartido.find(([, malo]) => malo === null) ?? [];
  const sinRuta = (motivo: string): PlanJuegoPc => ({ ruta: "ninguna", motivo: motivo.trim(), pasos: [], avisos });
  const faltan = [...propio, ...compartido]
    .filter(([, malo]) => malo !== null)
    .map(([s, malo]) => `servidor «${s.id}»: ${malo}`)
    .join(". ");
  if (eleccionC) {
    if (!CONDICIONES_EPIC_DECIDIDAS)
      return sinRuta(`ruta C bloqueada: las condiciones de Epic en servidores compartidos aún esperan la decisión de Alex.${faltan ? ` Aún sin alternativa: ${faltan}.` : ""}`);
    if (!d.persona.aceptaCondicionesEpic)
      return sinRuta("la ruta C necesita que la persona acepte las condiciones de Epic.");
    avisos.push(AVISO_LICENCIA, AVISO_PIN, AVISO_CUENTA);
    return {
      ruta: "servidor-compartido",
      motivo: `servidor «${eleccionC.id}» compartido viable: ruta C, una sesión aislada por persona.`,
      pasos: ["entra a tu propia sesión en el servidor", "arranca Rare dentro de tu sesión", "inicia sesión en Epic con TU cuenta",
        "elige el juego y púlsalo"], avisos,
    };
  }
  const sinNeurona = d.neurona.tienePantalla ? "Rare no está instalado en la neurona" : "la neurona no tiene pantalla";
  return sinRuta(`${sinNeurona}.${faltan ? ` ${faltan}.` : ""}`);
}

const CAMPOS_EPIC = ["access_token", "refresh_token", "account_id", "exchange_code"] as const;
/** Carpeta de configuración de Legendary por persona (§5.3): `<datos>/juegos/<persona>/legendary`, modo 0700. */
export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!ID_PERSONA_EPIC.test(personaId)) throw new Error("El id de persona debe tener de 1 a 64 letras minúsculas, números o guiones; no se acepta otra forma.");
  return { ruta: `${datos}/juegos/${personaId}/legendary`, modo: 0o700 };
}
/** Detecta campos típicos de la sesión de Legendary y tokens de Epic («eg1~…»). Los hallazgos NUNCA repiten el valor. */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  for (const campo of CAMPOS_EPIC)
    if (new RegExp(`["']?${campo}["']?\\s*[:=]\\s*["']?([^"'\\s]{9,})`).test(texto))
      hallazgos.push(`«${campo}»: campo de la sesión de Epic de Legendary; no va a memoria, sala, grupo ni registro.`);
  if (/eg1~\S/.test(texto)) hallazgos.push("token de Epic (prefijo «eg1~»): la persona se identifica en su propia ventana o sesión, no aquí.");
  return { ok: hallazgos.length === 0, hallazgos };
}
/** Solo las páginas de descargas de Rare en GitHub: los dominios y descargas remotas de Rare quedan bloqueados hasta fijar SHA (§5.3). */
export function esUrlPermitidaRare(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:" || u.hostname !== "github.com") return false;
  return /^\/RareDevs\/Rare\/releases/.test(u.pathname);
}
