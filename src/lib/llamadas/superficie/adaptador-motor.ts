/**
 * Adaptador de `MotorLlamada` a la superficie de llamada (LLA1108G). Es lo que faltaba: LLA1108C solo conectó la
 * superficie con la llamada directa; las llamadas de verdad (WebRTC, enlaces locales, voz por enlace de datos)
 * van por `MotorLlamada`. Aquí se traduce el estado del motor a `VistaLlamada` y se dan `AccionesLlamada` que
 * mueven el motor. Reglas:
 *  · NINGÚN botón muerto: cada control funciona o sale desactivado con su motivo (`matriz-controles.ts`);
 *  · lo que el motor no tiene (espera, chat, grabación, Astraura…) se hace con mensajes de aplicación
 *    (`senales-app.ts`) por el mismo canal de la llamada, así que funciona igual sin internet;
 *  · cambiar de tipo no cuelga: se añaden o quitan pistas sobre la MISMA conexión y se avisa a los demás;
 *  · se acepta un tope de gente (el del motor) y se explica en vez de fallar callado.
 * Sin React ni DOM: el motor y todo lo del aparato entran por `MotorMinimo` y `DepsAdaptador` (así se prueba).
 */
import { camaraParaEncender, clasificarCamara, correccionTrasAbrir, describirCamaras, lineaCamaraElegida, type CamaraInfo } from "@/lib/llamadas/camaras";
import { lienzoLigeroReciente } from "@/lib/llamadas/video-datos/lienzos";
import type { CargaApp, EstadoLlamada, ParticipanteLlamada } from "@/lib/llamadas/tipos";
import type { ResumenLlamada } from "@/lib/llamadas/motor";
import { MAX_PARTICIPANTES } from "@/lib/llamadas/tipos";
import type { EstadoSuperficie, FinSuperficie, TipoSuperficie } from "./maquina";
import { puedeCambiarTipo } from "./maquina";
import type { AccionesLlamada, VistaLlamada, ParticipanteVista } from "./vista";
import { claseMedio, disponibilidad, motivosDesactivados, type ContextoMatriz, type EntornoLlamada } from "./matriz-controles";
import { resumirCalidadLlamada } from "./calidad-llamada";
import { ETIQUETA_MEDIO, opcionesMedio, type MedioLlamada, type OpcionMedio } from "./selector-medio";
import { planInvitar, type Invitable } from "./grupo-invitar";
import {
  aplicarAviso, avisosParaNuevo, GRABACION_INICIAL, iniciarGrabacion, pararGrabacion, quitarParticipante, resolverDestino,
  TIPO_AVISO_GRABACION, type AvisoGrabacion, type DestinoGrabacion, type EstadoGrabacion,
} from "./grabacion";
import { iniciarGrabadoraLocal, type CtorGrabadora, type GrabadoraLocal } from "./grabadora-local";
import type { MezclaGrabacion } from "./mezcla-grabacion";
import {
  ASTRAURA_INICIAL, contextoParaPrompt, crearRespuesta, elegirGenerador, recibirRespuesta, TIPO_ASTRAURA_LLAMADA,
  type AjustesVozCompartidos, type CandidatoGenerador, type EstadoAstraura, type RespuestaAstraura,
} from "./astraura-llamada";
import { leerMensajeApp, sumarChat, sumarReaccion, EMOJIS_REACCION, type MensajeChatVista, type PreguntaAstraura, type ReaccionVista } from "./senales-app";

/** Lo que el adaptador necesita del motor (así se prueba con uno falso y funciona con el real). */
export interface MotorMinimo {
  readonly miId: string;
  readonly cerrada: boolean;
  estado(): EstadoLlamada;
  suscribir(cb: (e: EstadoLlamada) => void): () => void;
  suscribirApp(cb: (de: string, carga: CargaApp) => void): () => void;
  enviarApp(carga: CargaApp): boolean;
  alternarMicro(): Promise<string | null>;
  alternarCamara(): Promise<string | null>;
  alternarPantalla(): Promise<string | null>;
  cambiarCamara(id: string): Promise<string | null>;
  cambiarAltavoz(id: string): void;
  cambiarMicro?(id: string): Promise<string | null>;
  actualizarDispositivos?(): Promise<void>;
  colgar(motivo?: string): ResumenLlamada;
  metricasPares?(): Array<{ id: string; rttMs: number | null; perdidos: number; recibidos: number; jitterMs: number | null }>;
}

export interface DepsAstraura {
  /** Esta neurona puede generar respuestas (hay modelo local o acceso a uno). */
  capaz: boolean;
  /** El modelo es local (privacidad). */
  local: boolean;
  /** Pregunta + contexto de la llamada → respuesta. Usa el cliente de Astraura que ya tiene el repo. */
  responder(pregunta: string, contexto: string): Promise<string>;
  /** Lee la respuesta en voz alta con los ajustes compartidos (misma voz y tono en todas las neuronas). */
  hablar?(texto: string, ajustes: AjustesVozCompartidos): void | Promise<void>;
  ajustes(): AjustesVozCompartidos;
}

export interface DepsReconocedor {
  tipo: "local" | "navegador";
  /** Empieza a transcribir; llama a `alTexto` con cada frase. Devuelve cómo parar. */
  iniciar(alTexto: (t: string) => void): () => void;
}

export interface DepsGrabacionLlamada {
  ctor: CtorGrabadora | null;
  /** Crea la mezcla de audio de todos (+ imagen si hay). */
  mezcla(streams: Array<MediaStream | null>, video: MediaStreamTrack | null): MezclaGrabacion | null;
  /** Guarda en el almacén de la app; devuelve la ruta o null si no se pudo. */
  guardar(blob: Blob, nombre: string, destino: Exclude<DestinoGrabacion, "descartar">): Promise<string | null>;
}

export interface FinLlamadaInfo {
  duracionMs: number;
  contestada: boolean;
  medio: string | null;
  tipo: TipoSuperficie;
  grabacion: string | null;
  motivo: string | null;
}

export interface DepsAdaptador {
  titulo: string;
  unoAUno: boolean;
  entorno: () => EntornoLlamada;
  ahora?: () => number;
  nuevoId?: () => string;
  /** Con quién se puede ampliar la llamada. */
  invitables?: () => Invitable[];
  /** Avisa de verdad a quien se invita (mensaje con la llamada en su chat). Devuelve a quién se llegó. */
  invitarA?: (quien: Invitable[]) => Promise<{ entregadas: Invitable[]; fallidas: Array<{ invitable: Invitable; motivo: string }> }>;
  astraura?: DepsAstraura;
  reconocedor?: DepsReconocedor | null;
  grabacion?: DepsGrabacionLlamada;
  /** Cuánto se espera a que TODOS acusen el aviso de grabación (ms). */
  esperaAckMs?: number;
  /** Se llama una vez al terminar la llamada (para el historial). */
  alTerminar?: (f: FinLlamadaInfo) => void;
  /** Cuánto dura una reacción en pantalla (ms). */
  duracionReaccionMs?: number;
  /** LLA1110C: la cámara que la persona eligió antes en esta neurona (para pedirla al encender). */
  preferenciaCamara?: () => { id: string; etiqueta?: string } | null;
  /** LLA1110C: línea al registro del enlace (cámara, visibilidad). Por defecto, nada. */
  anotar?: (linea: string) => void;
  /** LLA1110C: el lienzo del vídeo ligero pintado lo último (por defecto, el registro de `video-datos/lienzos`). */
  lienzoLigero?: () => HTMLCanvasElement | null;
  /** LLA1110C: cuánto se espera a que el aparato abra la cámara antes de decir que no responde (ms). */
  esperaCamaraMs?: number;
}

/** LLA1110C: ¿esta pista de vídeo trae imagen ahora? (viva y no «muted»: una pista WebRTC sin ruta llega muda). */
export function pistaTraeImagen(t: Pick<MediaStreamTrack, "readyState" | "muted"> | null | undefined): boolean {
  return !!t && t.readyState === "live" && !t.muted;
}

/** LLA1110C: ¿este flujo trae vídeo con imagen? */
export function streamTraeVideo(s: MediaStream | null | undefined): boolean {
  try {
    return !!s && s.getVideoTracks().some(pistaTraeImagen);
  } catch {
    return false;
  }
}

/** LLA1110C: «integrada:FaceTime HD Camera|continuidad:iPhone… Desk View» para el registro (corto). */
export function textoListaCamaras(lista: readonly CamaraInfo[]): string {
  return lista.map((c) => `${c.sinEtiqueta ? "sin-nombre" : c.tipo}:${(c.etiqueta || c.nombre).replace(/[|"\u0000-\u001f]+/g, " ").slice(0, 28)}`).join("|").slice(0, 120);
}

const AZAR = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Tipo de llamada que se ve, según lo que hay encendido (también el de la otra parte: llega por la presencia). */
export function tipoDesdeEstado(e: Pick<EstadoLlamada, "participantes" | "camara" | "pantalla">): TipoSuperficie {
  if (e.participantes.length > 2) return "grupo";
  const otros = e.participantes.filter((p) => !p.yo);
  if (e.pantalla || otros.some((p) => p.pantalla)) return "pantalla";
  if (e.camara || otros.some((p) => p.camara)) return "video";
  return "voz";
}

/** Estado de la superficie a partir de la fase del motor. */
export function estadoDesdeFase(e: Pick<EstadoLlamada, "fase" | "contestada">, esCreador: boolean, enEspera: boolean, reconectando: boolean): EstadoSuperficie {
  switch (e.fase) {
    case "inactiva":
      return "inactiva";
    case "preparando":
    case "conectando":
      return "saliente";
    case "esperando":
      return e.contestada ? "reconectando" : esCreador ? "saliente" : "saliente";
    case "en-curso":
      return enEspera ? "en-espera" : reconectando ? "reconectando" : "conectada";
    case "terminada":
    case "llena":
    case "error":
      return "terminada";
  }
}

export function finDesdeEstado(e: Pick<EstadoLlamada, "fase" | "contestada" | "rechazos">, esCreador: boolean, unoAUno: boolean): FinSuperficie | null {
  if (e.fase === "llena" || e.fase === "error") return "fallo";
  if (e.fase !== "terminada") return null;
  if (esCreador && !e.contestada) return unoAUno && e.rechazos.length > 0 ? "rechazada" : "sin-respuesta";
  return "colgada";
}

/** «latencia 180 ms · pérdida 2 % · ADPCM» → medidas sueltas (la voz por enlace de datos solo da texto). */
export function medidasDeTexto(t: string | undefined): { rttMs: number | null; perdidaPct: number | null; codec: string | null } {
  if (!t) return { rttMs: null, perdidaPct: null, codec: null };
  const rtt = /latencia\s+(\d+(?:[.,]\d+)?)\s*ms/i.exec(t);
  const per = /p[eé]rdida\s+(\d+(?:[.,]\d+)?)\s*%/i.exec(t);
  const cod = t.split("·").map((x) => x.trim()).find((x) => /^[A-Za-z0-9+_-]{2,12}$/.test(x) && !/^(latencia|p[eé]rdida)/i.test(x));
  return { rttMs: rtt ? Number(rtt[1].replace(",", ".")) : null, perdidaPct: per ? Number(per[1].replace(",", ".")) : null, codec: cod ?? null };
}

export class AdaptadorMotor {
  private readonly oyentes = new Set<() => void>();
  private snap: VistaLlamada;
  private bajas: Array<() => void> = [];
  private destruido = false;

  private enEspera = false;
  private microAntesEspera = false;
  private camaraAntesEspera = false;
  private esperaRemota: string | null = null;
  private cambiandoA: TipoSuperficie | null = null;
  private chipTipo: string | null = null;
  private chipMedio: string | null = null;
  private medioAnterior: string | null = null;
  private aviso: string | null = null;
  private chat: MensajeChatVista[] = [];
  private reacciones: ReaccionVista[] = [];
  private volumenes: Record<string, number> = {};
  private silenciados = new Set<string>();
  private conocidos = new Set<string>();
  private lastEstado: EstadoLlamada;

  private grab: EstadoGrabacion = GRABACION_INICIAL;
  private avisandoGrab = false;
  private grabadora: GrabadoraLocal | null = null;
  private mezcla: MezclaGrabacion | null = null;
  private blobPendiente: Blob | null = null;
  private grabacionGuardada: string | null = null;
  private readonly acks = new Map<string, Set<string>>();
  private esperasAck = new Map<string, () => void>();

  private astr: EstadoAstraura = ASTRAURA_INICIAL;
  private readonly candidatos = new Map<string, CandidatoGenerador>();
  private transcribiendo: (() => void) | null = null;
  private transcripcion: Array<{ de: string; texto: string; en: number }> = [];
  private readonly preguntasAtendidas = new Set<string>();

  private readonly cambiosVistos = new Set<string>();
  private terminadaInformada = false;
  private readonly ahora: () => number;
  private readonly nuevoId: () => string;
  readonly acciones: AccionesLlamada;

  constructor(
    private readonly motor: MotorMinimo,
    private readonly deps: DepsAdaptador,
  ) {
    this.ahora = deps.ahora ?? Date.now;
    this.nuevoId = deps.nuevoId ?? AZAR;
    this.lastEstado = motor.estado();
    this.conocidos = new Set(this.lastEstado.participantes.map((p) => p.id));
    this.acciones = this.crearAcciones();
    this.snap = this.calcular();
    this.bajas.push(motor.suscribir((e) => this.alMotor(e)));
    this.bajas.push(motor.suscribirApp((de, c) => this.alMensaje(de, c)));
  }

  /* ───────────────────────────── Suscripción ───────────────────────────── */

  vista = (): VistaLlamada => this.snap;

  suscribir = (cb: () => void): (() => void) => {
    this.oyentes.add(cb);
    return () => {
      this.oyentes.delete(cb);
    };
  };

  /** Vuelve a calcular la vista (cambió algo de fuera, como la lista de invitables). */
  refrescar() {
    this.notificar();
  }

  destruir() {
    if (this.destruido) return;
    this.destruido = true;
    for (const b of this.bajas) b();
    this.bajas = [];
    this.transcribiendo?.();
    this.transcribiendo = null;
    void this.cortarGrabadora();
    this.oyentes.clear();
  }

  private notificar() {
    if (this.destruido) return;
    this.snap = this.calcular();
    for (const cb of Array.from(this.oyentes)) {
      try {
        cb();
      } catch {
        /* un oyente roto no para la llamada */
      }
    }
  }

  private temporizar(ms: number, f: () => void) {
    setTimeout(() => {
      if (!this.destruido) f();
    }, ms);
  }

  /* ───────────────────────────── Cambios del motor ───────────────────────────── */

  private alMotor(e: EstadoLlamada) {
    const antes = this.lastEstado;
    this.lastEstado = e;
    // Medio que cambia: chip discreto «Pasando a …».
    const medio = e.medio?.texto ?? null;
    if (medio && this.medioAnterior && medio !== this.medioAnterior) {
      this.chipMedio = `Pasando a ${medio.replace(/\s*·\s*cifrada$/i, "").toLowerCase()}…`;
      this.temporizar(4000, () => {
        this.chipMedio = null;
        this.notificar();
      });
    }
    if (medio) this.medioAnterior = medio;
    // Participantes nuevos / que se fueron.
    const ids = new Set(e.participantes.map((p) => p.id));
    const nuevos = [...ids].filter((id) => !this.conocidos.has(id));
    for (const id of this.conocidos) {
      if (!ids.has(id)) {
        this.grab = quitarParticipante(this.grab, id);
        this.candidatos.delete(id);
        this.acks.forEach((s) => s.delete(id));
        for (const f of this.esperasAck.values()) f();
      }
    }
    this.conocidos = ids;
    if (nuevos.length) this.alEntrarAlguien();
    // El tipo ya sigue a lo que hay: se acaba el «cambiando…».
    const tipo = tipoDesdeEstado(e);
    if (this.cambiandoA && tipo === this.cambiandoA) {
      this.cambiandoA = null;
      this.chipTipo = null;
    }
    if (antes.fase !== e.fase && (e.fase === "terminada" || e.fase === "llena" || e.fase === "error")) this.alTerminarMotor();
    this.mezcla?.anadir(null);
    for (const p of e.participantes) if (!p.yo) this.mezcla?.anadir(p.stream);
    this.notificar();
  }

  /** Quien entra tarde recibe lo que tiene que saber: grabación en marcha, Astraura, espera. */
  private alEntrarAlguien() {
    for (const a of avisosParaNuevo(this.grab).filter((x) => x.de === this.motor.miId)) this.motor.enviarApp(a as unknown as CargaApp);
    if (this.astr.activa) this.difundirEstadoAstraura();
    if (this.enEspera) this.motor.enviarApp({ k: "espera", activa: true });
  }

  private alTerminarMotor() {
    if (this.terminadaInformada) return;
    this.terminadaInformada = true;
    this.transcribiendo?.();
    this.transcribiendo = null;
    if (this.grab.fase === "grabando") void this.pararYGuardarAlColgar();
    const e = this.lastEstado;
    this.deps.alTerminar?.({
      duracionMs: e.inicio ? Math.max(0, this.ahora() - e.inicio) : 0,
      contestada: e.contestada,
      medio: e.medio?.texto ?? null,
      tipo: tipoDesdeEstado(e),
      grabacion: this.grabacionGuardada,
      motivo: e.motivoFin,
    });
  }

  /** Si se cuelga grabando, no se pierde: se guarda en Archivos y se dice. */
  private async pararYGuardarAlColgar() {
    try {
      await this.pararGrabacionInterno();
      await this.resolverGrabacion("archivos");
    } catch {
      /* mejor esfuerzo */
    }
  }

  /* ───────────────────────────── Mensajes de aplicación ───────────────────────────── */

  private nombreDe(id: string): string {
    return this.lastEstado.participantes.find((p) => p.id === id)?.nombre ?? "Alguien";
  }

  private alMensaje(de: string, carga: CargaApp) {
    const m = leerMensajeApp(carga);
    if (!m) return;
    switch (m.k) {
      case "tipo": {
        if (this.cambiosVistos.has(m.id)) return;
        this.cambiosVistos.add(m.id);
        const etiqueta = { voz: "voz", video: "vídeo", pantalla: "pantalla compartida", vivo: "transmisión en vivo", grupo: "grupo" }[m.a];
        this.chipTipo = `${this.nombreDe(de)} pasa a ${etiqueta}…`;
        this.temporizar(4500, () => {
          this.chipTipo = null;
          this.notificar();
        });
        break;
      }
      case "espera":
        this.esperaRemota = m.activa ? this.nombreDe(de) : null;
        break;
      case TIPO_AVISO_GRABACION: {
        this.grab = aplicarAviso(this.grab, m as AvisoGrabacion);
        // Acuse: quien graba necesita saber que lo vi. También si ya lo tenía (idempotente).
        if ((m as AvisoGrabacion).activa) this.motor.enviarApp({ k: "grabacion-ack", id: (m as AvisoGrabacion).id });
        break;
      }
      case "grabacion-ack": {
        const set = this.acks.get(m.id) ?? new Set<string>();
        set.add(de);
        this.acks.set(m.id, set);
        this.esperasAck.get(m.id)?.();
        break;
      }
      case "astraura-estado":
        this.candidatos.set(de, { id: de, activa: m.activa, capaz: m.capaz, local: m.local });
        break;
      case "astraura-pregunta":
        void this.atenderPregunta(m, de);
        break;
      case TIPO_ASTRAURA_LLAMADA:
        this.aplicarRespuestaAstraura(m as RespuestaAstraura);
        break;
      case "trans":
        if (this.astr.activa) this.transcripcion = [...this.transcripcion, { de: m.nombre, texto: m.texto, en: m.en }].slice(-60);
        break;
      case "chat":
        this.chat = sumarChat(this.chat, { id: m.id, de, nombre: m.nombre || this.nombreDe(de), texto: m.texto, en: m.en, mio: false });
        break;
      case "reaccion":
        this.ponerReaccion({ id: m.id, nombre: m.nombre || this.nombreDe(de), emoji: m.emoji });
        break;
      case "fin-todos":
        if (this.puedeDecidirFin(de)) this.motor.colgar(m.motivo || `${this.nombreDe(de)} ha terminado la llamada para todos.`);
        break;
      case "invitacion":
        break;
    }
    this.notificar();
  }

  /** Solo quien lleva más tiempo en la llamada (quien la empezó) puede terminarla para todos. */
  private primero(): string | null {
    const ps = this.lastEstado.participantes;
    if (!ps.length) return null;
    return [...ps].sort((a, b) => a.unido - b.unido || (a.id < b.id ? -1 : 1))[0].id;
  }
  private puedeDecidirFin(de: string): boolean {
    return this.primero() === de;
  }

  private ponerReaccion(r: ReaccionVista) {
    this.reacciones = sumarReaccion(this.reacciones, r);
    this.temporizar(this.deps.duracionReaccionMs ?? 4500, () => {
      this.reacciones = this.reacciones.filter((x) => x.id !== r.id);
      this.notificar();
    });
  }

  /* ───────────────────────────── Acciones ───────────────────────────── */

  private contextoMatriz(e: EstadoLlamada = this.lastEstado): ContextoMatriz {
    const otros = e.participantes.filter((p) => !p.yo);
    return {
      tipo: tipoDesdeEstado(e),
      medio: claseMedio(e),
      entorno: { ...this.deps.entorno(), camaras: e.dispositivos.camaras.length },
      personas: Math.max(1, e.participantes.length),
      camaraEncendida: e.camara,
      pantallaCompartida: e.pantalla,
      videoLigero: !!e.videoDatos?.disponible,
      escalaWifi: !!e.escalada,
      hayVideoRemoto: otros.some((p) => streamTraeVideo(p.stream) || !!p.lienzo),
      soyCreador: this.primero() === this.motor.miId,
      viva: e.fase === "en-curso",
    };
  }

  private decirAviso(t: string | null) {
    this.aviso = t;
    this.notificar();
    if (t) this.temporizar(6000, () => {
      if (this.aviso === t) {
        this.aviso = null;
        this.notificar();
      }
    });
  }

  /** Corre una acción del motor que devuelve un error en texto; el error se enseña como aviso. */
  private async conAviso(f: () => Promise<string | null>): Promise<boolean> {
    const err = await f().catch(() => "No se pudo completar la acción.");
    if (err) this.decirAviso(err);
    return !err;
  }

  private permitido(id: Parameters<typeof disponibilidad>[0]): boolean {
    const d = disponibilidad(id, this.contextoMatriz());
    if (!d.ok) this.decirAviso(d.motivo ?? "No disponible ahora.");
    return d.ok;
  }

  private crearAcciones(): AccionesLlamada {
    return {
      colgar: () => {
        this.motor.colgar();
      },
      alternarMicro: () => {
        if (this.enEspera) return;
        void this.conAviso(() => this.motor.alternarMicro());
      },
      alternarCamara: () => {
        if (!this.permitido("camara")) return;
        void this.conAviso(() => (this.lastEstado.camara ? this.motor.alternarCamara() : this.encenderCamara()));
      },
      girarCamara: () => void this.girarCamara(),
      alternarPantalla: () => {
        // Apagar siempre se puede; encender, según el aparato y el medio.
        if (!this.lastEstado.pantalla && !this.permitido("pantalla")) return;
        void this.conAviso(() => this.motor.alternarPantalla());
      },
      alternarEspera: () => void this.alternarEspera(),
      cambiarTipo: (a) => this.cambiarTipo(a),
      invitar: (quien) => this.invitar(quien),
      elegirMedio: (m) => this.elegirMedio(m),
      iniciarGrabacion: () => this.empezarGrabacion(),
      pararGrabacion: () => this.pararGrabacionInterno(),
      destinoGrabacion: (d) => this.resolverGrabacion(d),
      alternarAstraura: () => this.alternarAstraura(),
      alternarHablarAstraura: () => {
        this.astr = { ...this.astr, hablar: !this.astr.hablar };
        this.notificar();
      },
      alternarTranscripcion: () => this.alternarTranscripcion(),
      preguntarAstraura: (q) => this.preguntarAstraura(q),
      volumenParticipante: (id, v) => {
        this.volumenes = { ...this.volumenes, [id]: Math.max(0, Math.min(1, v)) };
        this.notificar();
      },
      silenciarParticipante: (id) => {
        if (this.silenciados.has(id)) this.silenciados.delete(id);
        else this.silenciados.add(id);
        this.notificar();
      },
      enviarChat: (t) => this.enviarChat(t),
      reaccionar: (emoji) => this.reaccionar(emoji),
      colgarTodos: () => {
        if (!this.permitido("colgar-todos")) return;
        this.motor.enviarApp({ k: "fin-todos", motivo: `${this.miNombre()} ha terminado la llamada para todos.` });
        this.motor.colgar("Has terminado la llamada para todos.");
      },
      elegirSalidaAudio: (id) => this.motor.cambiarAltavoz(id),
      elegirCamara: (id) => void this.conAviso(() => this.elegirCamara(id)),
      elegirMicro: this.motor.cambiarMicro ? (id) => void this.conAviso(() => this.motor.cambiarMicro!(id)) : undefined,
      actualizarDispositivos: this.motor.actualizarDispositivos ? () => void this.motor.actualizarDispositivos!() : undefined,
      descartar: () => undefined,
    };
  }

  private miNombre(): string {
    return this.lastEstado.participantes.find((p) => p.yo)?.nombre ?? "Alguien";
  }

  /* ── LLA1110C: encender la cámara con la buena elegida, decir siempre por qué no se encendió ── */

  private anotarCamara(t: string) {
    try {
      this.deps.anotar?.(`camara ${t}`.slice(0, 195));
    } catch {
      /* el registro no tumba la llamada */
    }
  }

  private pistaLocal(): MediaStreamTrack | null {
    try {
      return this.motor.estado().participantes.find((p) => p.yo)?.stream?.getVideoTracks()[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Corre una acción del motor que puede no volver nunca (WKWebView esperando a la cámara de Continuidad). */
  private async conPlazo(f: () => Promise<string | null>, ms: number, que: string): Promise<string | null> {
    let fin: ((v: string | null) => void) | null = null;
    const plazo = new Promise<string | null>((r) => {
      fin = r;
    });
    const id = setTimeout(() => fin?.(`__plazo__`), ms);
    const r = await Promise.race([f().catch((e: unknown) => (e instanceof Error ? e.message : "falló")), plazo]);
    clearTimeout(id);
    if (r === "__plazo__") {
      this.anotarCamara(`sin-respuesta ${que} ms=${ms}`);
      return `La cámara no responde (${que}). Si es la del iPhone, desbloquéalo o elige la de este aparato en Calidad › Cámara.`;
    }
    return r;
  }

  /**
   * Antes de abrir nada se elige la cámara con lo que ya se sabe (guardada › integrada), así el aparato no decide solo
   * (macOS da la Desk View del iPhone si está cerca). Si no se sabía (sin etiquetas hasta el permiso) y el sistema
   * abrió Continuidad o una virtual habiendo integrada, se cambia apagando primero (WebKit no abre dos cámaras a la vez).
   */
  async encenderCamara(): Promise<string | null> {
    const e = this.motor.estado();
    const lista = describirCamaras(e.dispositivos.camaras);
    const pref = this.deps.preferenciaCamara?.() ?? null;
    const eleccion = camaraParaEncender(lista, e.seleccion.camaraId, pref);
    const pedida = lista.find((c) => c.id === eleccion.id) ?? null;
    this.anotarCamara(`pedida lista=${textoListaCamaras(lista) || "vacia"} elegir=${pedida ? `"${(pedida.etiqueta || pedida.nombre).slice(0, 30)}"` : "sistema"} motivo=${eleccion.motivo} restr=${eleccion.id ? "deviceId-exacto" : "facingMode-user"}`);
    if (eleccion.id && eleccion.id !== e.seleccion.camaraId) {
      // Con la cámara apagada, el motor solo apunta la elegida (y la recuerda); la abrirá al encender.
      const err = await this.motor.cambiarCamara(eleccion.id).catch(() => null);
      if (err) this.anotarCamara(`fallo-elegir="${err.replace(/"/g, "'").slice(0, 80)}"`);
    }
    const espera = this.deps.esperaCamaraMs ?? 12_000;
    const t0 = this.ahora();
    const err = await this.conPlazo(() => this.motor.alternarCamara(), espera, "al abrir");
    if (err) {
      this.anotarCamara(`fallo ms=${this.ahora() - t0} error="${err.replace(/"/g, "'").slice(0, 110)}"`);
      return err;
    }
    await this.motor.actualizarDispositivos?.().catch(() => undefined);
    const e2 = this.motor.estado();
    const pista = this.pistaLocal();
    const lista2 = describirCamaras(e2.dispositivos.camaras);
    const etiqueta = pista?.label ?? "";
    const abierta = lista2.find((c) => c.id === e2.seleccion.camaraId) ?? lista2.find((c) => c.etiqueta && c.etiqueta === etiqueta) ?? null;
    const ajustes = (() => {
      try {
        const st = pista?.getSettings?.();
        return st?.width ? `${st.width}x${st.height}` : "?";
      } catch {
        return "?";
      }
    })();
    this.anotarCamara(`abierta ${lineaCamaraElegida(abierta ?? { etiqueta, nombre: etiqueta || "?", tipo: clasificarCamara(etiqueta) }, eleccion.motivo === "seleccionada" ? "pedida" : eleccion.id ? eleccion.motivo : "sistema").replace(/^camara /, "")} ms=${this.ahora() - t0} ajustes=${ajustes} estado=${pista?.readyState ?? "sin-pista"}${pista?.muted ? "/muda" : ""}`);
    // Lo abrió el sistema (sin elección): si es Continuidad/virtual y hay integrada, se corrige en serie.
    if (eleccion.motivo !== "seleccionada" && eleccion.motivo !== "guardada") {
      const mejor = correccionTrasAbrir(lista2, { id: e2.seleccion.camaraId, etiqueta }, pref);
      if (mejor) {
        this.anotarCamara(`corrige de="${etiqueta.slice(0, 40)}" a="${mejor.etiqueta.slice(0, 40)}" (apagar y abrir en serie)`);
        const off = await this.motor.alternarCamara().catch(() => "falló al apagar");
        if (!off) {
          await this.motor.cambiarCamara(mejor.id).catch(() => null);
          const on = await this.conPlazo(() => this.motor.alternarCamara(), espera, "al corregir");
          if (on) {
            this.anotarCamara(`corrige-fallo error="${on.replace(/"/g, "'").slice(0, 100)}"`);
            return `No se pudo pasar a ${mejor.nombre}: ${on}`;
          }
        }
      }
    }
    return null;
  }

  /** Elegir en el selector: se apunta y, con la cámara encendida, se cambia en vivo sin colgar. */
  private async elegirCamara(id: string): Promise<string | null> {
    const lista = describirCamaras(this.motor.estado().dispositivos.camaras);
    const c = lista.find((x) => x.id === id);
    this.anotarCamara(`selector elige="${(c?.etiqueta || c?.nombre || id).slice(0, 40)}" (${c?.tipo ?? "?"}) encendida=${this.lastEstado.camara ? "si" : "no"}`);
    const err = await this.conPlazo(() => this.motor.cambiarCamara(id), this.deps.esperaCamaraMs ?? 12_000, "al cambiar");
    if (err) this.anotarCamara(`selector-fallo error="${err.replace(/"/g, "'").slice(0, 110)}"`);
    else if (this.lastEstado.camara) this.anotarCamara(`selector abierta="${(this.pistaLocal()?.label ?? "?").slice(0, 40)}"`);
    return err ? `No se pudo cambiar de cámara: ${err}` : null;
  }

  /* ── Cámara frontal/trasera ── */
  private async girarCamara() {
    if (!this.permitido("girar-camara")) return;
    const e = this.lastEstado;
    // VID1110A: «girar» alterna entre las cámaras del propio aparato (frontal/trasera); no salta a Continuidad ni a una virtual.
    const todas = e.dispositivos.camaras;
    const propias = describirCamaras(todas).filter((c) => c.tipo === "integrada").map((c) => ({ id: c.id, nombre: c.etiqueta }));
    const lista = propias.length >= 2 ? propias : todas;
    if (lista.length < 2) return;
    const i = lista.findIndex((c) => c.id === e.seleccion.camaraId);
    const siguiente = lista[(i + 1) % lista.length];
    await this.conAviso(() => this.motor.cambiarCamara(siguiente.id));
  }

  /* ── Espera: el motor no tiene «hold», así que se silencia y se oculta la imagen, y se avisa al otro lado ── */
  private async alternarEspera() {
    if (!this.enEspera) {
      this.microAntesEspera = this.lastEstado.micro;
      this.camaraAntesEspera = this.lastEstado.camara;
      this.enEspera = true;
      if (this.microAntesEspera) await this.motor.alternarMicro().catch(() => null);
      if (this.camaraAntesEspera) await this.motor.alternarCamara().catch(() => null);
      this.motor.enviarApp({ k: "espera", activa: true });
    } else {
      this.enEspera = false;
      if (this.microAntesEspera && !this.lastEstado.micro) await this.motor.alternarMicro().catch(() => null);
      if (this.camaraAntesEspera && !this.lastEstado.camara) await this.motor.alternarCamara().catch(() => null);
      this.motor.enviarApp({ k: "espera", activa: false });
    }
    this.notificar();
  }

  /* ── Cambiar de tipo SIN colgar: se añaden o quitan pistas sobre la misma conexión ── */
  async cambiarTipo(a: TipoSuperficie): Promise<void> {
    const e = this.lastEstado;
    const actual = tipoDesdeEstado(e);
    const puede = puedeCambiarTipo({ estado: this.snap.estado, tipo: actual, cambiandoA: this.cambiandoA }, a);
    if (!puede.ok) throw new Error(puede.motivo ?? "No se puede cambiar ahora.");
    const d = disponibilidad(a === "voz" ? "tipo-voz" : a === "video" ? "tipo-video" : a === "pantalla" ? "tipo-pantalla" : "tipo-vivo", this.contextoMatriz());
    if (!d.ok) throw new Error(d.motivo ?? "No disponible.");
    const etiqueta = { voz: "voz", video: "vídeo", pantalla: "pantalla", vivo: "en vivo", grupo: "grupo" }[a];
    this.cambiandoA = a;
    this.chipTipo = `Cambiando a ${etiqueta} sin colgar…`;
    this.notificar();
    // Antes de tocar nada: la otra superficie ya sabe a dónde vamos.
    this.motor.enviarApp({ k: "tipo", id: this.nuevoId(), a });
    const fallo = async (f: () => Promise<string | null>) => {
      const err = await f().catch(() => "No se pudo completar el cambio.");
      if (err) throw new Error(err);
    };
    try {
      const est = () => this.motor.estado();
      if (a === "voz") {
        if (est().pantalla) await fallo(() => this.motor.alternarPantalla());
        if (est().camara) await fallo(() => this.motor.alternarCamara());
      } else if (a === "video") {
        if (est().pantalla) await fallo(() => this.motor.alternarPantalla());
        if (!est().camara) await fallo(() => this.encenderCamara());
      } else if (a === "pantalla") {
        if (!est().pantalla) await fallo(() => this.motor.alternarPantalla());
      }
    } catch (err) {
      // Vuelve a como estaba: no queda una llamada a medias.
      this.cambiandoA = null;
      this.chipTipo = null;
      this.notificar();
      throw err;
    }
    // La presencia confirmará el nuevo tipo (alMotor limpia el «cambiando»); por si no llega, se libera sola.
    this.temporizar(6000, () => {
      if (this.cambiandoA === a) {
        this.cambiandoA = null;
        this.chipTipo = null;
        this.notificar();
      }
    });
    this.notificar();
  }

  /* ── Invitar: 1:1 → grupo sin colgar ── */
  async invitar(quien: Invitable[]): Promise<void> {
    if (!this.permitido("invitar")) return;
    const e = this.lastEstado;
    const plan = planInvitar({ actuales: e.participantes.length, conVideo: tipoDesdeEstado(e) === "video" || tipoDesdeEstado(e) === "grupo", invitar: quien, tope: MAX_PARTICIPANTES });
    if (!plan.entran.length) {
      this.decirAviso(plan.fuera[0]?.motivo ?? "No hay a quién invitar.");
      return;
    }
    if (!this.deps.invitarA) {
      this.decirAviso("Esta llamada no puede avisar a más gente desde aquí; usa «Invitar» con el enlace de la llamada.");
      return;
    }
    const r = await this.deps.invitarA(plan.entran).catch(() => ({ entregadas: [] as Invitable[], fallidas: plan.entran.map((i) => ({ invitable: i, motivo: "No se pudo avisar." })) }));
    if (r.entregadas.length) this.motor.enviarApp({ k: "invitacion", ids: r.entregadas.map((i) => i.id), nombre: this.miNombre() });
    const partes: string[] = [];
    if (r.entregadas.length) partes.push(`Avisado: ${r.entregadas.map((i) => i.nombre).join(", ")}. ${plan.pasaAGrupo ? "La llamada pasa a ser de grupo en cuanto entren; no se corta." : ""}`.trim());
    if (plan.degradaVideo) partes.push(plan.texto.split(". ").find((t) => /vídeo/.test(t)) ?? "");
    for (const f of [...r.fallidas, ...plan.fuera.map((x) => ({ invitable: x.invitable, motivo: x.motivo }))]) partes.push(`${f.invitable.nombre}: ${f.motivo}`);
    this.decirAviso(partes.filter(Boolean).join(" "));
  }

  /* ── Medio de transmisión ── */
  private medioElegido: MedioLlamada = "automatico";
  private opcionesDeMedio(): OpcionMedio[] {
    const e = this.lastEstado;
    return opcionesMedio(tipoDesdeEstado(e) === "grupo" ? "video" : tipoDesdeEstado(e), {});
  }
  private async elegirMedio(m: MedioLlamada): Promise<void> {
    // Hoy el motor decide solo el medio (WebRTC o voz por enlace de datos) y lo cambia si se cae: se puede
    // volver a «Automático», pero fijar uno concreto no se puede forzar y se dice.
    if (m === "automatico") {
      this.medioElegido = "automatico";
      this.decirAviso("Automático: la llamada elige el mejor medio y cambia sola si se cae.");
      return;
    }
    this.decirAviso(`${ETIQUETA_MEDIO[m]} no se puede fijar a mano todavía: la llamada elige y cambia sola el medio para no cortarse.`);
  }

  /* ── Grabación con consentimiento ── */
  private otrosIds(): string[] {
    return this.lastEstado.participantes.filter((p) => !p.yo).map((p) => p.id);
  }

  /** Difunde el aviso y espera el acuse de TODOS (hasta `esperaAckMs`). Devuelve a quién llegó. */
  private async avisarGrabacion(a: AvisoGrabacion): Promise<string[]> {
    const otros = this.otrosIds();
    if (!this.motor.enviarApp(a as unknown as CargaApp)) return [];
    if (!a.activa) return otros;
    const acusados = () => otros.filter((id) => this.acks.get(a.id)?.has(id));
    if (acusados().length === otros.length) return otros;
    await new Promise<void>((ok) => {
      const fin = () => {
        if (acusados().length === this.otrosIds().length) {
          clearTimeout(t);
          this.esperasAck.delete(a.id);
          ok();
        }
      };
      const t = setTimeout(() => {
        this.esperasAck.delete(a.id);
        ok();
      }, this.deps.esperaAckMs ?? 4000);
      this.esperasAck.set(a.id, fin);
    });
    return acusados();
  }

  async empezarGrabacion(): Promise<void> {
    const g = this.deps.grabacion;
    if (!g?.ctor) {
      this.decirAviso("Este aparato no puede grabar la llamada.");
      return;
    }
    if (!this.permitido("grabar")) return;
    this.avisandoGrab = true;
    this.grab = { ...this.grab, error: null };
    this.notificar();
    const e = this.lastEstado;
    const r = await iniciarGrabacion(this.grab, {
      yo: this.motor.miId,
      nombre: this.miNombre(),
      ahora: this.ahora,
      nuevoId: this.nuevoId,
      otros: () => this.otrosIds(),
      avisar: (a) => this.avisarGrabacion(a),
      arrancar: async () => {
        const remotoVideo = e.participantes.filter((p) => !p.yo).map((p) => p.stream?.getVideoTracks()[0] ?? null).find(Boolean) ?? e.participantes.find((p) => p.yo)?.stream?.getVideoTracks()[0] ?? null;
        const mezcla = g.mezcla(e.participantes.map((p) => p.stream), remotoVideo);
        if (!mezcla) throw new Error("sin mezcla");
        this.mezcla = mezcla;
        this.grabadora = iniciarGrabadoraLocal(mezcla.stream, g.ctor as CtorGrabadora, !!remotoVideo);
      },
    });
    this.avisandoGrab = false;
    this.grab = r.estado;
    if (!r.ok && r.motivo) this.aviso = r.motivo;
    this.notificar();
  }

  private async cortarGrabadora(): Promise<Blob | null> {
    const gr = this.grabadora;
    this.grabadora = null;
    const blob = gr ? await gr.parar().catch(() => null) : null;
    this.mezcla?.cerrar();
    this.mezcla = null;
    return blob;
  }

  async pararGrabacionInterno(): Promise<void> {
    if (this.grab.fase !== "grabando") return;
    this.blobPendiente = await this.cortarGrabadora();
    this.grab = await pararGrabacion(this.grab, { yo: this.motor.miId, nombre: this.miNombre(), ahora: this.ahora, avisar: (a) => this.avisarGrabacion(a) });
    this.notificar();
  }

  async resolverGrabacion(destino: DestinoGrabacion): Promise<void> {
    const r = resolverDestino(this.grab, destino);
    this.grab = r.estado;
    const blob = this.blobPendiente;
    this.blobPendiente = null;
    if (r.guardar && blob && this.deps.grabacion) {
      const nombre = `llamada-${new Date(this.ahora()).toISOString().replace(/[:.]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
      const ruta = await this.deps.grabacion.guardar(blob, nombre, r.guardar).catch(() => null);
      this.grabacionGuardada = ruta;
      this.aviso = ruta ? `Grabación guardada en ${r.guardar === "biblioteca" ? "la Biblioteca" : "Archivos"}: ${ruta}.` : "No se pudo guardar la grabación en este aparato.";
    } else if (destino === "descartar") {
      this.aviso = "Grabación descartada.";
    }
    this.notificar();
  }

  /* ── Astraura en la llamada: una neurona responde, todas muestran y leen lo mismo ── */
  private yoComoCandidato(): CandidatoGenerador {
    const a = this.deps.astraura;
    return { id: this.motor.miId, activa: this.astr.activa, capaz: !!a?.capaz, local: !!a?.local };
  }

  private difundirEstadoAstraura() {
    const yo = this.yoComoCandidato();
    this.motor.enviarApp({ k: "astraura-estado", activa: yo.activa, capaz: yo.capaz, local: yo.local });
  }

  private alternarAstraura() {
    if (!this.deps.astraura) {
      this.decirAviso("Astraura no está disponible en este aparato.");
      return;
    }
    this.astr = { ...this.astr, activa: !this.astr.activa, ...(this.astr.activa ? { vistas: [], respuestas: [], hablar: false } : {}) };
    if (!this.astr.activa) {
      this.transcribiendo?.();
      this.transcribiendo = null;
      this.transcripcion = [];
    }
    this.difundirEstadoAstraura();
    this.notificar();
  }

  private alternarTranscripcion() {
    const r = this.deps.reconocedor;
    if (!r) {
      this.decirAviso("No hay reconocimiento de voz disponible en este aparato.");
      return;
    }
    if (!this.astr.activa) {
      this.decirAviso("Activa Astraura para compartir la transcripción con ella.");
      return;
    }
    if (this.transcribiendo) {
      this.transcribiendo();
      this.transcribiendo = null;
    } else {
      this.transcribiendo = r.iniciar((texto) => {
        const t = texto.trim();
        if (!t || !this.astr.activa) return;
        const en = this.ahora();
        this.transcripcion = [...this.transcripcion, { de: this.miNombre(), texto: t, en }].slice(-60);
        this.motor.enviarApp({ k: "trans", nombre: this.miNombre(), texto: t, en });
        this.notificar();
      });
    }
    this.notificar();
  }

  private contextoDeLlamada() {
    const e = this.lastEstado;
    return contextoParaPrompt({ tipo: tipoDesdeEstado(e), participantes: e.participantes.map((p) => p.nombre), archivos: [], transcripcion: this.transcripcion });
  }

  async preguntarAstraura(pregunta: string): Promise<void> {
    const q = pregunta.trim();
    if (!q) return;
    if (!this.astr.activa) {
      this.decirAviso("Activa Astraura en esta llamada para preguntarle.");
      return;
    }
    const yo = this.yoComoCandidato();
    const m: PreguntaAstraura = { k: "astraura-pregunta", id: this.nuevoId(), de: this.motor.miId, nombre: this.miNombre(), pregunta: q, capaz: yo.capaz, local: yo.local, en: this.ahora() };
    this.motor.enviarApp(m as unknown as CargaApp);
    await this.atenderPregunta(m, this.motor.miId);
  }

  /** Todas las neuronas con Astraura activa calculan el MISMO generador; solo ese responde y difunde. */
  private async atenderPregunta(m: PreguntaAstraura, _de: string): Promise<void> {
    if (!this.astr.activa || this.preguntasAtendidas.has(m.id)) return;
    this.preguntasAtendidas.add(m.id);
    // Quien pregunta cuenta como activo y con sus capacidades (así todas deciden con los mismos datos).
    const candidatos: CandidatoGenerador[] = [this.yoComoCandidato(), ...this.candidatos.values()].filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i);
    const asker = candidatos.find((c) => c.id === m.de);
    const lista = asker ? candidatos.map((c) => (c.id === m.de ? { ...c, activa: true, capaz: m.capaz, local: m.local } : c)) : [...candidatos, { id: m.de, activa: true, capaz: m.capaz, local: m.local }];
    const generador = elegirGenerador(m.de, lista);
    if (generador !== this.motor.miId) return;
    const a = this.deps.astraura;
    if (!a) return;
    let texto = "";
    try {
      texto = (await a.responder(m.pregunta, this.contextoDeLlamada())).trim();
    } catch {
      texto = "";
    }
    if (!texto) {
      this.decirAviso("Astraura no pudo responder ahora.");
      return;
    }
    const r = crearRespuesta({ id: this.nuevoId(), de: this.motor.miId, preguntaDe: m.nombre, pregunta: m.pregunta, texto, ajustes: a.ajustes(), local: a.local, en: this.ahora() });
    this.motor.enviarApp(r as unknown as CargaApp);
    this.aplicarRespuestaAstraura(r);
    this.notificar();
  }

  private aplicarRespuestaAstraura(r: RespuestaAstraura) {
    const x = recibirRespuesta(this.astr, r);
    this.astr = x.estado;
    if (x.leer) void Promise.resolve(this.deps.astraura?.hablar?.(r.texto, r.ajustes)).catch(() => undefined);
  }

  /* ── Chat y reacciones ── */
  private enviarChat(t: string) {
    const texto = t.trim().slice(0, 500);
    if (!texto) return;
    const m = { id: this.nuevoId(), nombre: this.miNombre(), texto, en: this.ahora() };
    this.chat = sumarChat(this.chat, { ...m, de: this.motor.miId, mio: true });
    this.motor.enviarApp({ k: "chat", ...m });
    this.notificar();
  }

  private reaccionar(emoji: string) {
    if (!(EMOJIS_REACCION as readonly string[]).includes(emoji)) return;
    const r = { id: this.nuevoId(), nombre: this.miNombre(), emoji };
    this.ponerReaccion(r);
    this.motor.enviarApp({ k: "reaccion", ...r });
    this.notificar();
  }

  /* ───────────────────────────── Vista ───────────────────────────── */

  private calcular(): VistaLlamada {
    const e = this.lastEstado;
    const yo = e.participantes.find((p) => p.yo) ?? null;
    const otros = e.participantes.filter((p) => !p.yo);
    const tipo = tipoDesdeEstado(e);
    const esCreador = this.primero() === this.motor.miId;
    const reconectando = otros.length > 0 && otros.every((p) => p.conexion === "reconectando" || p.conexion === "fallida");
    const estado = estadoDesdeFase(e, esCreador, this.enEspera, reconectando);
    const fin = finDesdeEstado(e, esCreador, this.deps.unoAUno);
    // LLA1110C: el vídeo ligero pinta pero el motor no pasa su lienzo porque WebRTC negoció una pista de vídeo que no
    // trae imagen (sin ruta IP: llega «muted»). Entonces se enseña el lienzo, nunca un <video> negro.
    const ligero = e.videoDatos?.recibiendo && !otros.some((p) => p.lienzo) ? (this.deps.lienzoLigero ?? (() => lienzoLigeroReciente<HTMLCanvasElement>()))() : null;
    const conLienzo = (p: ParticipanteLlamada): HTMLCanvasElement | null => p.lienzo ?? (ligero && !streamTraeVideo(p.stream) && p === otros.find((o) => !streamTraeVideo(o.stream)) ? ligero : null);
    const tieneImagen = (p: ParticipanteLlamada) => !!conLienzo(p) || !!p.stream;
    const foco: ParticipanteLlamada | null = otros.find((p) => p.pantalla && tieneImagen(p)) ?? otros.find((p) => p.id === e.hablante && tieneImagen(p)) ?? otros.find((p) => p.camara && tieneImagen(p)) ?? otros.find((p) => tieneImagen(p)) ?? null;
    const ctx = this.contextoMatriz(e);
    const nombre = this.deps.unoAUno ? (otros[0]?.nombre ?? this.deps.titulo) : this.deps.titulo;
    const metricas = this.motor.metricasPares?.() ?? [];
    const rtts = metricas.map((x) => x.rttMs).filter((x): x is number => typeof x === "number");
    const rec = metricas.reduce((a, x) => a + x.recibidos, 0);
    const per = metricas.reduce((a, x) => a + x.perdidos, 0);
    const texto = medidasDeTexto(e.medio?.calidadTexto);
    const rttMs = rtts.length ? Math.max(...rtts) : texto.rttMs;
    const perdidaPct = rec + per > 0 ? (per / (rec + per)) * 100 : texto.perdidaPct;
    const calidad = e.fase === "en-curso"
      ? resumirCalidadLlamada({
          ruta: null,
          rttMs,
          bitrateKbps: null,
          perdidaPct,
          jitterMs: metricas.map((x) => x.jitterMs).find((x): x is number => typeof x === "number") ?? null,
          codec: texto.codec ?? (e.medio?.tipo === "webrtc" ? "Opus" : null),
          cifrado: e.medio ? (e.medio.cifrada ? "cifrado" : "sin-cifrar") : null,
        })
      : null;
    const calidadConMedio = calidad && e.medio ? { ...calidad, filas: calidad.filas.map((f) => (f.clave === "medio" ? { ...f, valor: e.medio?.texto ?? f.valor, nivel: "ok" as const } : f)) } : calidad;
    const participantes: ParticipanteVista[] = e.participantes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      yo: p.yo,
      stream: p.stream,
      lienzo: p.yo ? null : conLienzo(p),
      micro: p.micro && !this.silenciados.has(p.id),
      camara: p.camara,
      volumen: this.silenciados.has(p.id) ? 0 : (this.volumenes[p.id] ?? 1),
      nivel: p.nivel,
    }));
    const chip = this.chipTipo ?? this.chipMedio ?? e.estadoAudio ?? e.escalada?.texto ?? null;
    const camaras = e.dispositivos.camaras.length;
    return {
      estado,
      tipo,
      nombre,
      yo: this.motor.miId,
      desde: e.inicio,
      fin,
      medioUsado: e.medio?.texto ?? null,
      motivo: e.motivoFin ?? e.videoNoDisponible ?? (e.escalada && (e.escalada.paso === "abriendo" || e.escalada.paso === "propuesta") ? e.escalada.aviso : null) ?? (e.fase === "esperando" && !e.contestada ? "Esperando a que contesten…" : e.fase === "conectando" ? "Conectando…" : this.esperaRemota ? `${this.esperaRemota} te ha puesto en espera.` : null),
      aviso: this.aviso ?? e.aviso,
      local: yo?.stream ?? null,
      remoto: foco?.stream ?? null,
      remotoLienzo: foco ? conLienzo(foco) : null,
      micro: e.micro,
      camara: e.camara,
      compartiendoPantalla: e.pantalla,
      camaras,
      dispositivos: e.dispositivos,
      seleccion: e.seleccion,
      pistaCamara: yo?.stream?.getVideoTracks()[0] ?? null,
      participantes,
      calidad: calidadConMedio,
      medioElegido: this.medioElegido,
      opcionesMedio: this.opcionesDeMedio().map((o) => (o.medio === "automatico" ? o : { ...o, disponible: false, motivo: ctx.medio === "bluetooth" && o.medio === "bluetooth" ? "Es el medio que lleva la voz ahora; el motor lo elige solo." : o.motivo })),
      textoMedio: e.medio ? `${e.medio.texto}${e.medio.calidadTexto ? ` · ${e.medio.calidadTexto}` : ""}${e.videoDatos && (e.videoDatos.enviando || e.videoDatos.recibiendo) && e.videoDatos.calidadTexto ? ` · vídeo ligero ${e.videoDatos.calidadTexto}` : ""}` : null,
      // (LLA1110D) Por dónde va cada flujo (solo con un par: en grupo cada uno tiene los suyos).
      textoCarriles: e.carriles && e.carriles.length === 1 && e.carriles[0].texto ? e.carriles[0].texto : null,
      grabacion: this.avisandoGrab ? { ...this.grab, fase: "avisando" } : this.grab,
      astraura: this.astr,
      reconocedor: this.deps.reconocedor?.tipo ?? "ninguno",
      transcripcionActiva: !!this.transcribiendo,
      invitables: this.deps.invitables?.() ?? [],
      cambiandoA: this.cambiandoA,
      motivos: motivosDesactivados(ctx),
      chat: this.chat,
      reacciones: this.reacciones,
      chip,
      esperaRemota: this.esperaRemota,
      puedeTerminarParaTodos: disponibilidad("colgar-todos", ctx).ok,
      salidaAudioElegida: e.seleccion.altavozId,
      topeInvitar: MAX_PARTICIPANTES,
    };
  }
}
