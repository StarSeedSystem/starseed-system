/*
 * duplicadas-aparato — ¿qué otras neuronas de la cuenta son, probablemente, ESTE aparato visto desde
 * otro medio? (NEU1107B · 2026-11-07). Contrato: architecture/neurona-bienvenida.md §2.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Alex: «en las versiones instaladas, tras iniciar sesión, debe detectar si el aparato ya tiene un
 * registro de neurona de otro medio donde inició sesión y sugerir fusionarlas automáticamente».
 *
 * Aquí solo se ORDENA y se EXPLICA: cada candidata lleva sus puntos, una confianza (alta · media ·
 * baja) y la razón en palabras. Nunca se fusiona nada desde aquí; «fusionar automáticamente» es
 * dejar la fusión sugerida preseleccionada para que un toque la aplique (`sugerirFusion`).
 *
 * Señales (de más a menos fuerte):
 *   · el id de neurona que esta app usaba en el origen anterior (migración al servidor local);
 *   · el mismo nombre de equipo o modelo con el mismo sistema (lo dice la app nativa y la presencia);
 *   · la huella de hardware (`huella.ts`: sistema, núcleos, memoria, GPU, pantalla, nombre de máquina);
 *   · un nombre como «X» frente a «X phone» (reinstalación o segundo medio);
 *   · el relevo: la otra dejó de latir justo cuando nació esta;
 *   · el mismo sistema con el mismo navegador, y lo reciente.
 * Y una regla que no se salta: una neurona EN LÍNEA ahora mismo solo es candidata con una prueba
 * fuerte (migración, mismo equipo o huella «mismo»); si no, es otro aparato encendido a la vez.
 *
 * (NEU1108A · 2026-11-08) Más estricto, tras el caso real de la tableta reinstalada (origen
 * 127.0.0.1), que preseleccionó también «Maggadroid», otro móvil, solo por el relevo y el sistema:
 *   · solo se PRESELECCIONA con una prueba fuerte (`fuerte`): la pista de la migración, la misma
 *     huella (la del aparato guardada en la fila o la de hardware «mismo»), o el mismo equipo y sistema;
 *   · lo demás se enseña sin marcar («Otras posibles», plegado si hay una fuerte);
 *   · NUNCA se sugiere una fila cuya huella o equipo guardados (`capabilities.aparato`,
 *     `aparato-registro.ts`) son de otro aparato — ni siquiera con la pista de la migración.
 *
 * Puro: sin red, sin DOM, sin almacenamiento. Nunca lanza.
 */

import { compararHuellas, esFichaVacia, familiaSistema, maquinaUtil, type CapsHuella, type NeuronaHuella } from "./huella";
import { compararAparatos, leerAparato, normalizarEquipo, sanearAparato, type AparatoRegistro } from "./aparato-registro";

export { normalizarEquipo };

export type Confianza = "alta" | "media" | "baja";

/** Una fila de `neuron_devices` (lo mínimo). */
export interface FilaNeurona {
  id: string;
  name?: string | null;
  kind?: string | null;
  capabilities?: Record<string, unknown> | null;
  last_seen_at?: string | null;
  created_at?: string | null;
}

/** ESTA neurona, con lo que la app nativa sabe del aparato (`info_neurona`). */
export interface YoNeurona extends FilaNeurona {
  /** Nombre del equipo o modelo («MaggaBook», «SM-X710»). Solo apps nativas con VER1107B. */
  equipo?: string | null;
  /** Sistema operativo según la app nativa («macos», «android»…). */
  so?: string | null;
  /** (NEU1108A) El bloque del aparato de ESTE medio (si no, se lee de `capabilities.aparato`). */
  aparato?: AparatoRegistro | null;
}

/** Un medio abierto ahora mismo (presencia de la cuenta, `PresenciaMedio`), lo mínimo. */
export interface MedioPresente {
  /** Id de la neurona. */
  n: string;
  plataforma?: string;
  /** Hora del anuncio (epoch ms). */
  t?: number;
  /** `PresenciaMedio.d` (VER1107B): sistema y equipo del aparato. Webs anteriores no lo mandan. */
  d?: { so?: string; equipo?: string; medio?: string } | null;
}

export interface EntradaDuplicadas {
  yo: YoNeurona;
  /** Las neuronas de la cuenta (puede incluir a esta: se salta). */
  todas: readonly FilaNeurona[];
  presentes?: readonly MedioPresente[];
  /** Id de neurona que esta app usaba en el origen anterior (`migracion-origen`). */
  idAnteriorMigracion?: string | null;
  /** Alias de fusión vigentes (absorbida → principal): esas filas ya no cuentan. */
  alias?: Readonly<Record<string, { a: string }>>;
  ahora: number;
}

export interface CandidataDuplicada {
  id: string;
  nombre: string;
  confianza: Confianza;
  puntos: number;
  /**
   * (NEU1108A) Hay una prueba fuerte (pista de la migración, misma huella, mismo equipo y sistema).
   * Solo estas se preseleccionan. Opcional para los datos de antes (sin él: no fuerte).
   */
  fuerte?: boolean;
  /** Cada señal a favor, en palabras. */
  motivos: string[];
  /** La frase que se enseña (las dos o tres señales más fuertes). */
  razon: string;
  enLineaAhora: boolean;
  ultimaVez: string | null;
  creada: string | null;
}

export interface Descartada {
  id: string;
  nombre: string;
  motivo: string;
}

export interface ResultadoDuplicadas {
  /** De más a menos probable. */
  candidatas: CandidataDuplicada[];
  /** Las que no son este aparato, con el porqué (para depurar y para las pruebas). */
  descartadas: Descartada[];
}

/** Puntos de cada señal. */
export const PUNTOS = {
  migracion: 100,
  /** (NEU1108A) La huella o el equipo que guardó la app nativa en la fila coinciden con los de este aparato. */
  aparato: 80,
  equipo: 70,
  huellaMismo: 55,
  huellaProbable: 30,
  huellaPosible: 8,
  nombre: 22,
  relevo: 20,
  navegador: 6,
  reciente: 4,
  vieja: -6,
} as const;

/**
 * Umbrales de confianza. Por debajo de `baja` no se enseña. (NEU1108A) «alta» es SOLO con una prueba
 * fuerte (y entonces se preselecciona); sin ella, por muchos puntos que sume, como mucho «media».
 */
export const UMBRAL = { alta: 60, media: 28, baja: 12 } as const;

/** Igual que `ONLINE_WINDOW_MS` de neurons.ts (sin importar ese módulo, que es de cliente). */
export const VENTANA_EN_LINEA_MS = 12 * 60_000;
/** La presencia vale como «en línea ahora» si su anuncio tiene menos de esto. */
export const VIGENCIA_PRESENCIA_MS = 3 * 60_000;
const DIA = 86_400_000;

/* ───────────────────────────── Nombres ───────────────────────────── */

/** Palabras que se añaden a un nombre al reinstalar o abrir otro medio («X phone», «X app»…). */
const SUFIJOS = new Set([
  "phone", "telefono", "movil", "mobile", "tablet", "tableta", "app", "pwa", "web", "nativa", "nativo",
  "escritorio", "desktop", "laptop", "portatil", "pc", "nuevo", "nueva", "new", "copia", "otra", "otro",
  "chrome", "safari", "firefox", "edge", "navegador", "2", "3", "4", "ii",
]);

const SISTEMAS = new Set(["macos", "android", "ios", "ipados", "windows", "linux", "otro", "desconocido"]);

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Palabras de un nombre: minúsculas, sin acentos, sin emojis ni signos. Pura. */
export function palabrasNombre(nombre: string | null | undefined): string[] {
  return sinAcentos(String(nombre ?? "").toLowerCase())
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * ¿Es un nombre puesto por el OS y no por la persona? («💻 macOS · Chrome 154», «📱 Android»,
 * «Dispositivo», «Mi neurona», «Neurona macOS»…). Pura.
 */
export function esNombreGenerico(nombre: string | null | undefined): boolean {
  const p = palabrasNombre(nombre);
  if (!p.length) return true;
  if (SISTEMAS.has(p[0])) return true;
  if (p.length === 1 && ["dispositivo", "neurona", "aparato"].includes(p[0])) return true;
  if (p[0] === "mi" && p[1] === "neurona" && p.length === 2) return true;
  if (p[0] === "neurona" && p.length === 2 && SISTEMAS.has(p[1])) return true;
  return false;
}

/**
 * ¿Son «el mismo nombre» con un añadido de medio? «Maggadroid» y «Maggadroid phone» sí;
 * «Maggaboard» y «Maggadroid» no; dos genéricos nunca (no dicen nada). Pura.
 */
export function nombresParecidos(a: string | null | undefined, b: string | null | undefined): boolean {
  if (esNombreGenerico(a) || esNombreGenerico(b)) return false;
  const pa = palabrasNombre(a);
  const pb = palabrasNombre(b);
  if (pa.join(" ") === pb.join(" ")) return true;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (!corto.length || corto.length === largo.length) return false;
  if (!corto.every((w, i) => largo[i] === w)) return false;
  return largo.slice(corto.length).every((w) => SUFIJOS.has(w));
}

/* ───────────────────────────── Señales ───────────────────────────── */

function fecha(iso: string | null | undefined): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function caps(f: FilaNeurona): Record<string, unknown> {
  return f.capabilities && typeof f.capabilities === "object" ? f.capabilities : {};
}

function texto(x: unknown): string {
  return typeof x === "string" ? x : "";
}

/** «Chrome 154» → «chrome». Pura. */
export function familiaNavegador(browser: unknown): string {
  return palabrasNombre(texto(browser))[0] ?? "";
}

/** La fila ya se fusionó en otra (marca `fusionada` o alias): no cuenta. */
function yaFusionada(f: FilaNeurona, alias?: EntradaDuplicadas["alias"]): boolean {
  const marca = caps(f).fusionada as { en?: unknown } | undefined;
  if (marca && typeof marca === "object" && typeof marca.en === "string" && marca.en) return true;
  const a = alias?.[f.id]?.a;
  return typeof a === "string" && a !== f.id;
}

/** El equipo y el sistema que anuncia en vivo una neurona (si alguno de sus medios manda `d`). */
function equipoEnVivo(id: string, presentes: readonly MedioPresente[]): { equipo: string; so: string } | null {
  for (const m of presentes) {
    if (m.n !== id || !m.d) continue;
    const equipo = normalizarEquipo(m.d.equipo);
    if (equipo) return { equipo, so: familiaSistema(m.d.so ?? m.plataforma) };
  }
  return null;
}

function enLineaAhora(f: FilaNeurona, presentes: readonly MedioPresente[], ahora: number): boolean {
  if (presentes.some((m) => m.n === f.id && (typeof m.t !== "number" || ahora - m.t < VIGENCIA_PRESENCIA_MS))) return true;
  const visto = fecha(f.last_seen_at);
  return Number.isFinite(visto) && ahora - visto < VENTANA_EN_LINEA_MS && visto <= ahora + 60_000;
}

function confianzaDe(puntos: number, fuerte: boolean): Confianza | null {
  if (fuerte) return "alta";
  if (puntos >= UMBRAL.media) return "media";
  if (puntos >= UMBRAL.baja) return "baja";
  return null;
}

function nombreDe(f: FilaNeurona): string {
  const n = texto(f.name).trim();
  return n || "Neurona sin nombre";
}

/** La frase que se enseña: las dos señales más fuertes, con mayúscula y punto. Pura. */
export function razonDe(motivos: readonly string[]): string {
  const dos = motivos.slice(0, 2);
  if (!dos.length) return "";
  const frase = dos.length === 1 ? dos[0] : `${dos[0]} y ${dos[1].charAt(0).toLowerCase()}${dos[1].slice(1)}`;
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

/* ───────────────────────────── Ranking ───────────────────────────── */

/**
 * Ordena las neuronas de la cuenta por lo probable que sea que son ESTE aparato en otro medio.
 * Pura. Nunca lanza: con datos raros, devuelve listas vacías.
 */
export function detectarDuplicadas(e: EntradaDuplicadas): ResultadoDuplicadas {
  const candidatas: CandidataDuplicada[] = [];
  const descartadas: Descartada[] = [];
  try {
    const yo = e.yo;
    if (!yo?.id) return { candidatas, descartadas };
    const presentes = (e.presentes ?? []).filter((m) => m && typeof m.n === "string");
    const capsYo = caps(yo);
    const soYo = familiaSistema(texto(yo.so) || texto(capsYo.platform));
    const equipoYo = normalizarEquipo(yo.equipo);
    const creadaYo = fecha(yo.created_at);
    const navYo = familiaNavegador(capsYo.browser);
    const apYo = aparatoDeYo(yo, capsYo, soYo);
    const vistos = new Set<string>([yo.id]);

    for (const f of e.todas ?? []) {
      if (!f || typeof f.id !== "string" || !f.id || vistos.has(f.id)) continue;
      vistos.add(f.id);
      const nombre = nombreDe(f);
      const descartar = (motivo: string) => descartadas.push({ id: f.id, nombre, motivo });
      if (yaFusionada(f, e.alias)) {
        descartar("ya se fusionó en otra neurona");
        continue;
      }
      const c = caps(f);
      const motivos: string[] = [];
      let puntos = 0;
      let fuerte = false;

      // 1 · La migración al servidor local trajo el id que esta app usaba antes: es ella.
      const deMigracion = !!e.idAnteriorMigracion && e.idAnteriorMigracion === f.id;
      if (deMigracion) {
        puntos += PUNTOS.migracion;
        fuerte = true;
        motivos.push("es la neurona que esta app usaba antes de pasar a su servidor local");
      }

      // 2 · Sistema: familias distintas nunca son el mismo aparato (salvo la prueba de la migración).
      const apOtra = leerAparato(c);
      const soOtra = familiaSistema(texto(c.platform) || apOtra?.so);
      if (!deMigracion && soYo !== "desconocido" && soOtra !== "desconocido" && soYo !== soOtra) {
        descartar(`otro sistema (${texto(c.platform) || soOtra})`);
        continue;
      }

      // 2b · (NEU1108A) Lo que la app nativa guardó del aparato en la fila (`capabilities.aparato`):
      // misma huella o mismo equipo → prueba fuerte; otra huella u otro equipo → NUNCA se sugiere
      // (ni con la pista de la migración: la fila es de otro aparato).
      const cmpAparato = compararAparatos(apYo, apOtra);
      if (cmpAparato.parecido === "distinto") {
        descartar(cmpAparato.motivo);
        continue;
      }
      if (cmpAparato.parecido === "mismo") {
        puntos += PUNTOS.aparato;
        fuerte = true;
        motivos.push(cmpAparato.motivo);
      }

      // 3 · Mismo equipo o modelo, con el mismo sistema (la app nativa lo sabe; la presencia lo anuncia).
      const vivo = equipoEnVivo(f.id, presentes);
      if (cmpAparato.parecido !== "mismo" && equipoYo && vivo && (vivo.so === "desconocido" || soYo === "desconocido" || vivo.so === soYo)) {
        if (vivo.equipo === equipoYo) {
          puntos += PUNTOS.equipo;
          fuerte = true;
          motivos.push(`mismo equipo (${yo.equipo}) y mismo sistema`);
        } else if (!deMigracion) {
          descartar(`otro equipo (${vivo.equipo})`);
          continue;
        }
      }

      // 4 · Huella de hardware (solo si las dos fichas dicen algo del aparato).
      const huellaYo = { ...yo, capabilities: capsYo as CapsHuella } as NeuronaHuella;
      const huellaOtra = { ...f, name: f.name ?? undefined, capabilities: c as CapsHuella } as NeuronaHuella;
      if (!esFichaVacia(huellaYo) && !esFichaVacia(huellaOtra)) {
        const cmp = compararHuellas(huellaYo, huellaOtra);
        if (cmp.parecido === "distinto") {
          // Una prueba fuerte (migración, misma huella del aparato, mismo equipo) pesa más que el
          // hierro que ve cada medio (otro monitor, otra GPU visible en otro navegador…).
          if (!fuerte) {
            descartar(cmp.motivos[cmp.motivos.length - 1] ?? "la huella de hardware no coincide");
            continue;
          }
        } else if (cmp.parecido === "mismo") {
          puntos += PUNTOS.huellaMismo;
          fuerte = true;
          motivos.push(maquinaUtil(c.maquina as string | undefined) && maquinaUtil(capsYo.maquina as string | undefined) ? "mismo nombre de máquina" : "misma huella de hardware");
        } else if (cmp.parecido === "probable") {
          puntos += PUNTOS.huellaProbable;
          motivos.push("hardware casi idéntico");
        } else {
          puntos += PUNTOS.huellaPosible;
          motivos.push(`mismo sistema (${texto(c.platform) || soOtra})`);
        }
      } else if (esFichaVacia(huellaOtra) && !deMigracion && !apOtra) {
        descartar("no tiene datos del aparato");
        continue;
      }

      // 5 · Nombre «X» frente a «X phone».
      if (nombresParecidos(yo.name, f.name)) {
        puntos += PUNTOS.nombre;
        motivos.push(`nombre parecido («${texto(f.name).trim()}» y «${texto(yo.name).trim()}»)`);
      }

      // 6 · Relevo: la otra nació antes y dejó de latir cuando nació esta (reinstalación, otro medio).
      const vistoOtra = fecha(f.last_seen_at);
      const creadaOtra = fecha(f.created_at);
      if (
        Number.isFinite(creadaYo) &&
        Number.isFinite(vistoOtra) &&
        (!Number.isFinite(creadaOtra) || creadaOtra < creadaYo) &&
        vistoOtra >= creadaYo - 3 * DIA &&
        vistoOtra <= creadaYo + 2 * 3_600_000
      ) {
        puntos += PUNTOS.relevo;
        motivos.push("dejó de usarse justo cuando nació esta");
      }

      // 7 · Mismo navegador en el mismo sistema (débil: dos pestañas del mismo Chrome, o dos aparatos iguales).
      const navOtra = familiaNavegador(c.browser);
      if (navYo && navOtra && navYo === navOtra) {
        puntos += PUNTOS.navegador;
        motivos.push(`mismo navegador (${texto(c.browser)})`);
      }

      // 8 · Lo reciente pesa un poco; lo muy viejo, un poco en contra.
      if (Number.isFinite(vistoOtra)) {
        if (e.ahora - vistoOtra < 30 * DIA) puntos += PUNTOS.reciente;
        else if (e.ahora - vistoOtra > 120 * DIA) puntos += PUNTOS.vieja;
      }

      // 9 · En línea AHORA en otro sitio: sin una prueba fuerte, es otro aparato encendido a la vez.
      const enLinea = enLineaAhora(f, presentes, e.ahora);
      if (enLinea && !fuerte) {
        descartar("está en línea ahora mismo en otro aparato");
        continue;
      }

      const confianza = confianzaDe(puntos, fuerte);
      if (!confianza) {
        descartar("pocas señales de que sea este aparato");
        continue;
      }
      candidatas.push({
        id: f.id,
        nombre,
        confianza,
        puntos,
        fuerte,
        motivos,
        razon: razonDe(motivos),
        enLineaAhora: enLinea,
        ultimaVez: Number.isFinite(vistoOtra) ? new Date(vistoOtra).toISOString() : null,
        creada: Number.isFinite(creadaOtra) ? new Date(creadaOtra).toISOString() : null,
      });
    }
    // Las fuertes primero; dentro de cada grupo, por puntos.
    candidatas.sort(
      (a, b) => Number(!!b.fuerte) - Number(!!a.fuerte) || b.puntos - a.puntos || fecha(b.ultimaVez) - fecha(a.ultimaVez) || a.id.localeCompare(b.id),
    );
    return { candidatas, descartadas };
  } catch {
    return { candidatas: [], descartadas };
  }
}

/**
 * (NEU1108A) El bloque del aparato de ESTE medio: el que trae `yo.aparato` o `capabilities.aparato`,
 * completado con el equipo y el sistema que dijo la app nativa. Null si no se sabe nada. Pura.
 */
function aparatoDeYo(yo: YoNeurona, capsYo: Record<string, unknown>, soYo: string): AparatoRegistro | null {
  const base = sanearAparato(yo.aparato) ?? leerAparato(capsYo);
  const equipo = base?.equipo ?? (texto(yo.equipo).trim() || undefined);
  const so = base?.so ?? (soYo !== "desconocido" ? soYo : undefined);
  return sanearAparato({ v: 1, ...(base ?? {}), ...(equipo ? { equipo } : {}), ...(so ? { so } : {}) });
}

/**
 * (NEU1108A) Cómo se enseñan: con una candidata fuerte, ella (o ellas) arriba y las demás plegadas
 * bajo «Otras posibles»; sin ninguna fuerte, todas a la vista y sin marcar. Pura.
 */
export function separarCandidatas(candidatas: readonly CandidataDuplicada[]): { principales: CandidataDuplicada[]; otras: CandidataDuplicada[] } {
  const fuertes = candidatas.filter((c) => c.fuerte);
  if (!fuertes.length) return { principales: [...candidatas], otras: [] };
  return { principales: fuertes, otras: candidatas.filter((c) => !c.fuerte) };
}

/* ───────────────────────────── Sugerencia ───────────────────────────── */

export interface SugerenciaFusion {
  /** Ids preseleccionados (NEU1108A: solo las de prueba fuerte). Vacío ⇒ no se sugiere fusionar. */
  seleccionadas: string[];
  /** El id que se sugiere conservar (esta neurona o una de las seleccionadas). */
  principal: string;
  /** El nombre que se sugiere conservar. */
  nombre: string;
}

/** Puntos para elegir la neurona que se queda: nombre puesto a mano, antigüedad y actividad. */
function puntosPrincipal(f: FilaNeurona, ahora: number): number {
  let p = 0;
  if (!esNombreGenerico(f.name)) p += 4;
  const creada = fecha(f.created_at);
  if (Number.isFinite(creada)) p += Math.min(1, Math.max(0, (ahora - creada) / (365 * DIA)));
  const visto = fecha(f.last_seen_at);
  if (Number.isFinite(visto) && ahora - visto < 7 * DIA) p += 0.5;
  return p;
}

/**
 * La fusión que se deja preseleccionada: (NEU1108A) SOLO las candidatas con una prueba fuerte (pista
 * de la migración, misma huella, mismo equipo y sistema); las de señales débiles (relevo, nombre,
 * navegador…) se enseñan sin marcar. Se queda la neurona con nombre propio más antigua (con empate,
 * ESTA: no hace falta cambiar de identidad). Pura.
 */
export function sugerirFusion(yo: FilaNeurona, todas: readonly FilaNeurona[], candidatas: readonly CandidataDuplicada[], ahora: number): SugerenciaFusion {
  const seleccionadas = candidatas.filter((c) => c.fuerte === true).map((c) => c.id);
  const grupo: FilaNeurona[] = [yo, ...seleccionadas.map((id) => todas.find((f) => f.id === id)).filter((f): f is FilaNeurona => !!f)];
  let principal = yo;
  for (const f of grupo) if (puntosPrincipal(f, ahora) > puntosPrincipal(principal, ahora) + 1e-9) principal = f;
  const nombrePropio = [principal, ...grupo].map((f) => texto(f.name).trim()).find((n) => n && !esNombreGenerico(n));
  return { seleccionadas, principal: principal.id, nombre: nombrePropio ?? (texto(principal.name).trim() || texto(yo.name).trim()) };
}
