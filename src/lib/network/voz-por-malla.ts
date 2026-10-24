/**
 * voz-por-malla — manejadores PUROS de las capacidades `voz.hablar` y `oido.transcribir`
 * del relé `capacidad.*` (VST1018K). Contrato: architecture/voz-voicestudio.md §3–§4,
 * voz-fusionada-astraura.md §5 y apps-en-la-malla.md §6.
 *
 * En este repo no existe `licencia-voz.ts` (VST1018C no llegó a main): la licencia por
 * contexto se resuelve con la lógica REAL que ya usan el catálogo y el átomo de doblaje
 * (`catalogo-voces.ts` + `clonacion.ts`), sin inventar una segunda tabla. Nada de aquí
 * toca red, disco, reloj ni audio: cuentas, grupo, permisos y `ahora` llegan en la
 * petición, y el contenido o el audio se referencian por id (entidad única), no se copian.
 * El llamador ya verificó la identidad del peer: este módulo solo aplica las reglas.
 */
import { MOTORES_VOZ, motorRecomendado, type MotorVozCatalogo, type Plataforma } from "@/lib/aurora/catalogo-voces";
import { puedeClonar, type PermisoVoz, type UsoVoz } from "@/lib/aurora/voz-starseed/clonacion";
import { MOTORES_OIDO, elegirOido, type MotorOidoId } from "@/lib/aurora/stt-oss/motores-oido";

export type ContextoVozMalla = UsoVoz;

/** Permiso de un grupo para que una cuenta use la voz u oído de esta neurona. */
export interface PermisoGrupoVoz {
  grupoId: string;
  cuentas: string[];
  usos?: ContextoVozMalla[];
}

export interface AccesoVozMalla {
  cuentaSolicitante: string;
  cuentaAnfitriona: string;
  contexto: ContextoVozMalla;
  grupoId?: string;
  grupos?: PermisoGrupoVoz[];
}

export interface VozHablarMalla extends AccesoVozMalla {
  /** Referencia al contenido; se comparte la entidad, nunca una copia del texto. */
  contenidoId: string;
  plataforma: Plataforma;
  ramGB: number;
  /** Voz pedida; por defecto, la del propio solicitante. */
  titularVoz?: string;
  permisosVoz?: PermisoVoz[];
  ahora: number;
  motorPreferido?: string;
  motoresDisponibles?: string[];
  condicionesCumplidas?: string[];
}

export interface OidoTranscribirMalla extends AccesoVozMalla {
  /** Referencia al audio; el audio no viaja en la petición. */
  audioId: string;
  idioma: string;
  /** Dueño de la voz del audio; por defecto, el propio solicitante. */
  titularAudio?: string;
  permisosVoz?: PermisoVoz[];
  ahora: number;
  motorPreferido?: MotorOidoId;
  motoresDisponibles?: MotorOidoId[];
  /** Permiso para que el audio salga de las neuronas de su dueño. */
  audioPuedeSalir?: boolean;
}

export type ResultadoVozMalla =
  | { ok: true; motor: string; motivo: string }
  | { ok: false; motivo: string };

export type AccesoVozResultado = { ok: true; motivo: string } | { ok: false; motivo: string };

export function accesoVozPorMalla(a: AccesoVozMalla): AccesoVozResultado {
  const solicitante = (a.cuentaSolicitante || "").trim();
  const anfitriona = (a.cuentaAnfitriona || "").trim();
  if (!solicitante || !anfitriona) return { ok: false, motivo: "Falta la cuenta del solicitante o de la neurona que sirve." };
  if (solicitante === anfitriona) return { ok: true, motivo: "petición de la misma cuenta" };
  if (a.contexto === "personal") return { ok: false, motivo: "Lo personal no cruza de cuenta: solo puede pedirlo la misma cuenta." };
  const grupoId = (a.grupoId || "").trim();
  if (!grupoId) return { ok: false, motivo: "De otra cuenta solo se atiende dentro de un grupo con permiso." };
  const permiso = (a.grupos ?? []).find((g) => g.grupoId === grupoId && g.cuentas.includes(solicitante));
  if (!permiso) return { ok: false, motivo: `La cuenta ${solicitante} no tiene permiso en el grupo ${grupoId}.` };
  if (permiso.usos && !permiso.usos.includes(a.contexto)) {
    return { ok: false, motivo: `El permiso del grupo ${grupoId} no cubre el uso «${a.contexto}».` };
  }
  return { ok: true, motivo: `petición del grupo ${grupoId} con permiso` };
}

function licenciaVozPermitida(m: MotorVozCatalogo, p: VozHablarMalla): boolean {
  if (m.claseLicencia === "libre") return true;
  if (m.claseLicencia === "condicionada") return (p.condicionesCumplidas ?? []).includes(m.id);
  return p.contexto === "personal" && m.id === p.motorPreferido;
}

const CLONAN = new Set(["cosyvoice3", "voxcpm", "qwen3-tts", "chatterbox", "voicemorphic", "voicestudio"]);

function elegirMotorVoz(p: VozHablarMalla, clonar: boolean): MotorVozCatalogo | null {
  const ram = Number.isFinite(p.ramGB) && p.ramGB > 0 ? p.ramGB : 0;
  const sirve = (m: MotorVozCatalogo) =>
    (!p.motoresDisponibles || p.motoresDisponibles.includes(m.id)) &&
    licenciaVozPermitida(m, p) && m.offline && m.plataformas.includes(p.plataforma) &&
    m.ramMinGB <= ram && (!clonar || CLONAN.has(m.id));
  const preferido = MOTORES_VOZ.find((m) => m.id === p.motorPreferido);
  if (preferido && sirve(preferido)) return preferido;
  // Nunca «personal» por defecto: en lo personal se consulta como «grupo» y solo
  // entra un motor personal si la persona lo pidió expresamente arriba.
  const sugerido = motorRecomendado(p.plataforma, ram, p.contexto === "personal" ? "grupo" : p.contexto);
  return sirve(sugerido) ? sugerido : MOTORES_VOZ.find(sirve) ?? null;
}

export function manejarVozHablar(p: VozHablarMalla): ResultadoVozMalla {
  const acceso = accesoVozPorMalla(p);
  if (!acceso.ok) return acceso;
  if (!(p.contenidoId || "").trim()) {
    return { ok: false, motivo: "Falta la referencia al contenido: se comparte la entidad, no una copia." };
  }
  const titular = (p.titularVoz || "").trim() || p.cuentaSolicitante;
  const permiso = puedeClonar({ solicitante: p.cuentaSolicitante, titular, uso: p.contexto, permisos: p.permisosVoz ?? [], ahora: p.ahora });
  if (!permiso.ok) return { ok: false, motivo: permiso.motivo ?? `Sin permiso para usar la voz de ${titular}.` };
  const motor = elegirMotorVoz(p, titular !== p.cuentaSolicitante);
  if (!motor) return { ok: false, motivo: `Ningún motor de voz con licencia «${p.contexto}» cabe en esta neurona.` };
  return { ok: true, motor: motor.id, motivo: `${motor.nombre}: ${motor.claseLicencia} para «${p.contexto}» · ${acceso.motivo}` };
}

function licenciaOidoPermitida(id: MotorOidoId, contexto: ContextoVozMalla): boolean {
  if (contexto === "personal") return true;
  const motor = MOTORES_OIDO.find((m) => m.id === id);
  return !!motor && motor.licencia !== "" && motor.licencia !== "sistema";
}

export function manejarOidoTranscribir(p: OidoTranscribirMalla): ResultadoVozMalla {
  const acceso = accesoVozPorMalla(p);
  if (!acceso.ok) return acceso;
  if (!(p.audioId || "").trim()) return { ok: false, motivo: "Falta la referencia al audio que se quiere transcribir." };
  const titular = (p.titularAudio || "").trim() || p.cuentaSolicitante;
  if (p.cuentaSolicitante !== p.cuentaAnfitriona && p.audioPuedeSalir !== true) {
    return { ok: false, motivo: "El audio de una persona nunca sale de sus neuronas sin permiso." };
  }
  const permiso = puedeClonar({ solicitante: p.cuentaSolicitante, titular, uso: p.contexto, permisos: p.permisosVoz ?? [], ahora: p.ahora });
  if (!permiso.ok) return { ok: false, motivo: permiso.motivo ?? `Sin permiso para transcribir el audio de ${titular}.` };
  const porLicencia = (p.motoresDisponibles ?? MOTORES_OIDO.map((m) => m.id)).filter((id) => licenciaOidoPermitida(id, p.contexto));
  const oido = elegirOido({ idioma: p.idioma, disponibles: porLicencia, fase: "final", preferido: p.motorPreferido });
  if (!porLicencia.includes(oido.motor as MotorOidoId)) {
    return { ok: false, motivo: `Ningún motor de oído con licencia «${p.contexto}» y idioma «${p.idioma}» está disponible.` };
  }
  return { ok: true, motor: oido.motor, motivo: `${oido.motivo} · ${acceso.motivo}` };
}
