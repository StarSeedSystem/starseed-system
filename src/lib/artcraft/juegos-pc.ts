/**
 * Rare · PLANIFICADOR de «Juegos de PC» (contrato: `architecture/artcraft-y-rare.md` §5).
 * Puro: sin `node:*`, sin React, sin red. Decide la ruta: A neurona propia con pantalla,
 * B servidor propio con GPU + Wine o Proton + transmisión, C servidor compartido con una
 * sesión aislada por persona. Rare es GPL-3.0-or-later: SOLO programa aparte, nunca
 * enlazado. Las credenciales de Epic son SIEMPRE de la persona (§5.3): cada una se
 * identifica en SU ventana o con `rare login` en SU sesión, y el OS jamás recibe el
 * código de autorización ni guarda, comparte o registra la sesión de Epic.
 */

/** Las condiciones de Epic para servidores compartidos las decide Alex: hasta entonces la ruta C no se ofrece (§8). */
export const CONDICIONES_EPIC_DECIDIDAS = false;

export interface NeuronaJuegos { sistema: "macos" | "linux" | "windows" | "otro"; tienePantalla: boolean; binarioRare: boolean; gpu: boolean; memoriaMB: number }
export interface ServidorJuegos { id: string; propio: boolean; compartido: boolean; gpu: boolean; wineOProton: boolean; transmision: "selkies" | "sunshine" | null; libreDiscoGB: number }
export interface PersonaJuegos { id: string; aceptaCondicionesEpic: boolean }
export type RutaJuegoPc = "neurona-propia" | "servidor-propio" | "servidor-compartido" | "ninguna";
export interface PlanJuegoPc { ruta: RutaJuegoPc; motivo: string; pasos: string[]; avisos: string[] }

const MEMORIA_MIN_MB = 2048;
const AVISO_A1 = "El A1 de Oracle (2 OCPU, 12 GB, sin GPU) no sirve para juegos 3D: solo para el lanzador ligero o juegos 2D.";
const AVISO_DESCARGAS = "Los datos remotos de Rare (workarounds, steam_appids y el «wrapper») se bloquean hasta fijar su SHA.";
/** Un servidor «listo» para Rare: GPU, Wine o Proton y transmisión de ventana (§5.1, rutas B y C). */
const listo = (s: ServidorJuegos): boolean => s.gpu && s.wineOProton && s.transmision !== null;
const avisoDisco = (s: ServidorJuegos): string =>
  `Quedan ${s.libreDiscoGB} GB en el disco de «${s.id}»: los juegos pesan decenas de GB y viven en el disco del anfitrión.`;

/** Por qué la neurona no trae la ruta A, en frases cortas (vacío = la ruta A es viable). */
function porQueNoA(n: NeuronaJuegos): string[] {
  const partes: string[] = [];
  if (!n.tienePantalla) partes.push("la neurona no tiene pantalla");
  if (!n.binarioRare) partes.push("Rare no está instalado en la neurona");
  else if (n.sistema === "otro") partes.push("el sistema de la neurona no tiene build de Rare");
  else if (n.memoriaMB < MEMORIA_MIN_MB) partes.push(`poca memoria para la interfaz de Rare (${n.memoriaMB} MB, se piden ${MEMORIA_MIN_MB} MB)`);
  return partes;
}

/** Déjame la ruta que cabe, con su motivo y sus pasos. Devuelve `ruta: ninguna` con el motivo si nada cabe. */
export function planificarJuegoPc(e: { neurona: NeuronaJuegos; servidores: ServidorJuegos[]; persona: PersonaJuegos }): PlanJuegoPc {
  const avisos: string[] = [];
  if (e.servidores.some((s) => !s.gpu)) avisos.push(AVISO_A1);
  const sinA = porQueNoA(e.neurona);
  if (sinA.length === 0) {
    if (!e.neurona.gpu) avisos.push("Esta neurona no tiene GPU: solo sirve para el lanzador ligero y juegos 2D (el A1 de Oracle, sin GPU, no sirve para 3D).");
    avisos.push(AVISO_DESCARGAS);
    return { ruta: "neurona-propia", motivo: "Ruta A: Rare como programa aparte en tu neurona; una persona confirma abrirlo (pedirLanzamiento).",
      pasos: ["confirma tú mismo abrir Rare en el OS", "abre Rare", "inicia sesión en Epic tú mismo, en tu ventana", "instala y lanza el juego desde tu sesión de Rare"], avisos };
  }
  return planServidores(e, avisos, sinA);
}

/** Rutas B y C, en orden: primero un servidor propio; luego el compartido, si Alex ya decidió las condiciones de Epic (§5.1 y §8). */
function planServidores(e: { neurona: NeuronaJuegos; servidores: ServidorJuegos[]; persona: PersonaJuegos }, avisos: string[], sinA: string[]): PlanJuegoPc {
  const propio = e.servidores.find((s) => s.propio && listo(s));
  if (propio) {
    if (propio.libreDiscoGB < 90) avisos.push(avisoDisco(propio));
    avisos.push(AVISO_DESCARGAS);
    return { ruta: "servidor-propio", motivo: `Ruta B: Rare con display virtual en «${propio.id}» y la ventana transmitida con ${propio.transmision}.`,
      pasos: ["abre la ventana transmitida del servidor", `abre Rare en el servidor (${propio.transmision})`, "inicia sesión en Epic tú mismo, en la ventana transmitida", "instala y lanza el juego desde tu sesión de Rare"], avisos };
  }
  return rutaCompartida(e, avisos, sinA);
}
/** Ruta C: una sesión aislada por persona, cada una con SU cuenta de Epic; nada sin la palabra de Alex (§8). */
function rutaCompartida(e: Parameters<typeof planificarJuegoPc>[0], avisos: string[], sinA: string[]): PlanJuegoPc {
  const partes: string[] = [...sinA];
  if (!e.servidores.some((s) => s.propio)) partes.push("no hay servidor propio de juegos");
  else partes.push("ningún servidor propio junta GPU, Wine o Proton y transmisión");
  const compartido = e.servidores.find((s) => s.compartido && listo(s));
  if (compartido && !CONDICIONES_EPIC_DECIDIDAS) {
    partes.push("las condiciones de Epic para servidores compartidos las decide Alex (§8): una cuenta por persona, cada una con su sesión");
    return { ruta: "ninguna", motivo: `Sin ruta: ${partes.join("; ")}.`, pasos: [], avisos };
  }
  if (!compartido) partes.push(e.servidores.some((s) => s.compartido) ? "ningún servidor compartido junta GPU, Wine o Proton y transmisión" : "no hay servidor compartido de juegos");
  else if (!e.persona.aceptaCondicionesEpic) partes.push("la persona no aceptó las condiciones de Epic");
  if (compartido && e.persona.aceptaCondicionesEpic) {
    if (compartido.libreDiscoGB < 90) avisos.push(avisoDisco(compartido));
    avisos.push("Cada persona entra con SU cuenta de Epic en SU sesión: el OS no guarda sesiones, no comparte cuentas y respeta la cuota de tiempo y disco.");
    return { ruta: "servidor-compartido", motivo: `Ruta C: sesión aislada de «${compartido.id}» para la persona, con la ventana transmitida con ${compartido.transmision}.`,
      pasos: ["pide tu sesión aislada del servidor compartido", "abre Rare dentro de tu sesión", "inicia sesión con TU cuenta de Epic tú mismo", "instala el juego desde tu cuenta"], avisos };
  }
  return { ruta: "ninguna", motivo: `Sin ruta: ${partes.join("; ")}.`, pasos: [], avisos };
}

/* ── Guarda de credenciales de Epic (§5.3): carpeta por persona, detector de sesiones y urls de descarga ── */

const PERSONA_RE = /^[a-z0-9-]{1,64}$/;
/** `<datos>/juegos/<persona>/legendary` con modo 0700: solo la persona lee y escribe su sesión (fuera de sync, malla y memoria). */
export function rutaConfigEpic(datos: string, personaId: string): { ruta: string; modo: number } {
  if (!PERSONA_RE.test(personaId)) throw new Error("El id de persona solo admite minúsculas, números y guiones, de 1 a 64 caracteres.");
  return { ruta: `${datos.replace(/\/+$/, "")}/juegos/${personaId}/legendary`, modo: 0o700 };
}

const CAMPOS_EPIC = ["access_token", "refresh_token", "account_id", "exchange_code"] as const;
/** Detecta en un texto los campos de la sesión de Legendary (valores de más de 8 caracteres) y los tokens `eg1~…`. Los hallazgos describen el campo y su tamaño, JAMÁS el valor. */
export function validarSinCredencialesEpic(texto: string): { ok: boolean; hallazgos: string[] } {
  const hallazgos: string[] = [];
  for (const campo of CAMPOS_EPIC) {
    for (const m of texto.matchAll(new RegExp(`\\b${campo}\\b["']?\\s*[:=]\\s*["']?([^"'\\s,}\n]+)`, "g"))) {
      const valor = m[1] ?? "";
      if (valor.length > 8) hallazgos.push(`«${campo}» de la sesión de Epic, con un valor de ${valor.length} caracteres.`);
    }
  }
  for (const m of texto.matchAll(/eg1~[A-Za-z0-9._-]{9,}/g)) hallazgos.push(`token de Epic con el prefijo «eg1~» (campo ancho: ${m[0].length} caracteres).`);
  return { ok: hallazgos.length === 0, hallazgos };
}

/** Solo las releases oficiales de RareDevs con SHA fijado valen: raredevs.github.io, ProtonDB y cualquier descarga remota de Rare quedan bloqueadas hasta fijar su huella. */
export function esUrlPermitidaRare(url: string): boolean {
  return url.startsWith("https://github.com/RareDevs/Rare/releases/");
}
