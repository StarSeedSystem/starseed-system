/**
 * Protomolécula · Átomo «doblaje» de VoiceStudio (VST1018J): transcribir → traducir → revocar → mezclar. La ejecución es
 * un PLAN PURO (oído → texto → traducción → voz → mezcla) que nombra el motor de cada paso y no ejecuta nada: neurona,
 * permisos y reloj llegan en la entrada. Licencias con la lógica real (no hay `licencia-voz.ts`): clase y `motorRecomendado`
 * por contexto (`aurora/catalogo-voces.ts`), permiso y etiqueta de voz clonada (`aurora/voz-starseed/clonacion.ts`) y
 * elector de oído (`aurora/stt-oss/motores-oido.ts`). Contrato: architecture/voz-voicestudio.md §3–§4 (y vigia-modelos.md §4).
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { ValorParametro } from "@/lib/protomolecula/tipos";
import { MOTORES_VOZ, motorRecomendado, type MotorVozCatalogo, type Plataforma } from "@/lib/aurora/catalogo-voces";
import { etiquetarAudio, puedeClonar, type PermisoVoz, type UsoVoz } from "@/lib/aurora/voz-starseed/clonacion";
import { MOTORES_OIDO, elegirOido, type MotorOidoId } from "@/lib/aurora/stt-oss/motores-oido";

/** Idioma destino tal como se dicta → código que entienden los motores. */
const IDIOMAS: Record<string, string> = { español: "es", inglés: "en", francés: "fr", alemán: "de", portugués: "pt", italiano: "it", catalán: "ca", euskera: "eu", gallego: "gl", chino: "zh", japonés: "ja", árabe: "ar" };

export const DOBLAJE: DefinicionAtomo = {
  herramientaId: "voicestudio",
  nombre: "Doblaje (VoiceStudio)",
  categoria: "audio", // el registro no tiene categoría «voz»: la voz va en «audio»
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "idioma", nombre: "Idioma destino", tipo: "opcion", opciones: Object.keys(IDIOMAS), defecto: "inglés", sinonimos: ["idioma destino", "traducir a", "doblar a"] },
    { id: "voz-por-hablante", nombre: "Voz por hablante", tipo: "booleano", defecto: true, sinonimos: ["una voz por hablante", "quién habla cuándo"] },
    { id: "conservar-voz", nombre: "Conservar voz original", tipo: "booleano", defecto: false, sinonimos: ["voz original", "clonar la voz", "misma voz"] },
    { id: "aislar-voz", nombre: "Aislar voz", tipo: "booleano", defecto: true, sinonimos: ["separar la voz", "quitar el fondo"] },
    { id: "subtitulos", nombre: "Subtítulos", tipo: "opcion", opciones: ["ninguno", "srt", "vtt"], defecto: "srt", sinonimos: ["subtitular"] },
  ],
  entradas: ["mp4", "webm", "mov", "wav", "mp3", "flac"],
  salidas: ["wav", "mp4", "srt", "vtt"],
  ficha: { web: "https://github.com/debpalash/voicestudio", repo: "https://github.com/debpalash/voicestudio", licencia: "AGPL-3.0-only" },
};

export type PasoDoblaje = "oido" | "texto" | "traduccion" | "voz" | "mezcla";
export interface PasoPlan { paso: PasoDoblaje; motores: string[]; licencias: string[]; motivo: string }
export interface HablantePlan { id: string; voz: "clonada" | "sustituta"; motivo?: string }
export interface PlanDoblaje { pasos: PasoPlan[]; hablantes: HablantePlan[]; idiomaDestino: string; salidas: string[]; etiqueta: Record<string, unknown> | null; avisos: string[] }
export interface EntradaDoblaje {
  valores: Record<string, ValorParametro | undefined>;
  medio: "video" | "audio";
  idiomaOrigen: string;
  contexto: UsoVoz;
  plataforma: Plataforma; ramGB: number; oidoDisponibles: MotorOidoId[]; // la neurona que dobla, con lo medido
  solicitante: string; hablantes: string[]; permisos: PermisoVoz[]; // hablantes: cuenta dueña de cada voz de la entrada
  ahora: number; // reloj inyectado (ms)
  audioPuedeSalir?: boolean; // permiso para que el audio salga de sus neuronas (oído por la malla); sin él, nunca sale
  motorVozPreferido?: string;
  condicionesCumplidas?: string[]; // motores «condicionada» cuya condición se cumple en este contexto
  marcaAguaDisponible?: boolean;
}

/** Motores del catálogo que clonan desde una referencia (contrato §3.2 y notas de `catalogo-voces.ts`). */
const CLONAN = new Set(["cosyvoice3", "voxcpm", "qwen3-tts", "chatterbox", "voicemorphic", "voicestudio"]);
const LICENCIAS: Record<string, string> = { demucs: "MIT", pyannote: "MIT", audioseal: "MIT", voicestudio: "AGPL-3.0-only", palabra: "la de su capa (vigia-modelos.md §4)" };
const paso = (p: PasoDoblaje, motores: string[], motivo: string, licencias = motores.map((m) => LICENCIAS[m] ?? "")): PasoPlan => ({ paso: p, motores, licencias, motivo });
const param = (id: string) => DOBLAJE.parametros.find((p) => p.id === id);
const si = (e: EntradaDoblaje, id: string): boolean => { const v = e.valores[id]; return typeof v === "boolean" ? v : param(id)?.defecto === true; };
const opcion = (e: EntradaDoblaje, id: string): string => { const v = e.valores[id]; return typeof v === "string" && param(id)?.opciones?.includes(v) ? v : String(param(id)?.defecto); };

/** «personal» (no comercial) solo en lo personal y pedido a mano, nunca por defecto; «condicionada» si la condición se cumple. */
function permitido(m: MotorVozCatalogo, e: EntradaDoblaje): boolean {
  if (m.claseLicencia === "libre") return true;
  if (m.claseLicencia === "condicionada") return (e.condicionesCumplidas ?? []).includes(m.id);
  return e.contexto === "personal" && m.id === e.motorVozPreferido;
}

function elegirVoz(e: EntradaDoblaje, clonar: boolean): MotorVozCatalogo | null {
  const ram = Number.isFinite(e.ramGB) ? e.ramGB : 0; // una medida rota no abre la puerta a otro motor
  const sirve = (m: MotorVozCatalogo) => permitido(m, e) && m.offline && m.plataformas.includes(e.plataforma) && m.ramMinGB <= ram && (!clonar || CLONAN.has(m.id));
  const preferido = MOTORES_VOZ.find((m) => m.id === e.motorVozPreferido);
  if (preferido && sirve(preferido)) return preferido;
  // El defecto pasa SIEMPRE por el filtro de licencia del catálogo (contexto no personal): nada «personal» por defecto.
  const defecto = motorRecomendado(e.plataforma, ram, e.contexto === "personal" ? "grupo" : e.contexto);
  return sirve(defecto) ? defecto : MOTORES_VOZ.find(sirve) ?? null;
}

/** El plan del doblaje. PURO: misma entrada, mismo plan; no llama a ningún motor. */
export function planDoblaje(e: EntradaDoblaje): PlanDoblaje {
  const avisos: string[] = [];
  const porHablante = si(e, "voz-por-hablante"), aislar = si(e, "aislar-voz"), subtitulos = opcion(e, "subtitulos");
  const idiomaDestino = IDIOMAS[opcion(e, "idioma")];
  const permiso = (titular: string) => puedeClonar({ solicitante: e.solicitante, titular, uso: e.contexto, permisos: e.permisos, ahora: e.ahora });
  if (si(e, "conservar-voz") && !porHablante) avisos.push("Con una sola voz para todos no se conserva la de cada hablante.");
  let clonar = si(e, "conservar-voz") && porHablante && e.hablantes.some((h) => permiso(h).ok);
  if (clonar && e.contexto !== "personal" && etiquetarAudio({ marcaAguaDisponible: e.marcaAguaDisponible === true }).publicaFueraPersonal !== true) {
    clonar = false; avisos.push("Sin marca de agua (AudioSeal) una voz clonada no sale de lo personal: suena una voz sustituta.");
  }
  let voz = elegirVoz(e, clonar);
  if (!voz && clonar) {
    clonar = false; voz = elegirVoz(e, false);
    avisos.push("Esta neurona no tiene un motor permitido que clone: voz sustituta (una neurona con VoiceStudio puede hacerlo).");
  }
  const motorVoz = voz ?? MOTORES_VOZ.find((m) => m.id === "sistema") ?? MOTORES_VOZ[0];
  if (e.motorVozPreferido && motorVoz.id !== e.motorVozPreferido) avisos.push(`«${e.motorVozPreferido}» no entra en «${e.contexto}» en esta neurona (licencia, medio o RAM): suena ${motorVoz.nombre}.`);
  const hablantes = e.hablantes.map((id): HablantePlan => {
    const r = clonar ? permiso(id) : null; // sin permiso del titular, nunca se clona su voz
    return r?.ok ? { id, voz: "clonada" } : { id, voz: "sustituta", ...(r?.motivo ? { motivo: r.motivo } : {}) };
  });
  // El audio de una persona no sale de sus neuronas sin permiso; fuera de lo personal, un oído sin licencia conocida no entra.
  const licenciaOido = (id: string) => MOTORES_OIDO.find((m) => m.id === id)?.licencia ?? "";
  const oidos = e.oidoDisponibles.filter((id) => (id !== "malla" || e.audioPuedeSalir === true) && (e.contexto === "personal" || id === "malla" || licenciaOido(id) !== ""));
  const oido = elegirOido({ idioma: e.idiomaOrigen, disponibles: oidos, fase: "final" });
  if (MOTORES_OIDO.find((m) => m.id === oido.motor)?.atribucion) avisos.push(`${oido.motor}: atribución obligatoria (${licenciaOido(oido.motor)}) en los créditos.`);
  const preparar = [...(aislar ? ["demucs"] : []), ...(porHablante ? ["pyannote"] : [])];
  const clonadas = hablantes.filter((h) => h.voz === "clonada").length;
  return {
    pasos: [
      paso("oido", preparar, preparar.length ? "separar la voz del fondo y saber quién habla cuándo" : "la pista entra tal cual"),
      paso("texto", [oido.motor], oido.motivo, [licenciaOido(oido.motor)]),
      paso("traduccion", ["palabra"], `${e.idiomaOrigen} → ${idiomaDestino}: viaja texto, no audio`),
      paso("voz", [motorVoz.id], `${motorVoz.nombre} (${motorVoz.claseLicencia}) en «${e.contexto}»; ${clonadas} voz(es) clonada(s) con permiso`, [motorVoz.licenciaPesos]),
      paso("mezcla", ["voicestudio", ...(clonadas ? ["audioseal"] : [])], `${aislar ? "voz nueva sobre el fondo separado" : "voz nueva sobre la pista original atenuada"}${e.medio === "video" ? " → MP4" : ""}`),
    ],
    hablantes, idiomaDestino,
    salidas: ["wav", ...(e.medio === "video" ? ["mp4"] : []), ...(subtitulos !== "ninguno" ? [subtitulos] : [])],
    etiqueta: clonadas ? etiquetarAudio({ marcaAguaDisponible: e.marcaAguaDisponible === true, etiqueta: "voz clonada", motor: motorVoz.id }) : null,
    avisos,
  };
}
