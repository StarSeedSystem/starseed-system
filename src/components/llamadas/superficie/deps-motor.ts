/**
 * Dependencias del aparato para el adaptador del motor (LLA1108G): lo que solo existe en el navegador o en la app
 * (capacidades, reconocimiento de voz, grabadora, almacén, Astraura, avisar a invitados). Todo con try/catch: un
 * aparato al que le falte algo lo dice con el motivo de la matriz, nunca rompe la llamada.
 */
import type { LlamadaActiva } from "@/lib/llamadas/store";
import type { DepsAdaptador, DepsAstraura, DepsGrabacionLlamada, DepsReconocedor } from "@/lib/llamadas/superficie/adaptador-motor";
import type { EntornoLlamada } from "@/lib/llamadas/superficie/matriz-controles";
import type { Invitable } from "@/lib/llamadas/superficie/grupo-invitar";
import { crearMezclaGrabacion } from "@/lib/llamadas/superficie/mezcla-grabacion";
import { guardarEnOpfs, type CtorGrabadora } from "@/lib/llamadas/superficie/grabadora-local";
import { registrarEnHistorial, type AlmacenMinimo } from "@/lib/llamadas/superficie/historial-llamadas";
import { soportaAltavoz, soportaPantalla } from "@/lib/llamadas/medios";
import { esAppNativa } from "@/lib/nativa/puente";
import { guardarPreferencia, leerPreferencias } from "@/lib/llamadas/camaras";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { getDeviceId } from "@/lib/network/device-registry";

export function entornoDelAparato(rutasNativas = 0): EntornoLlamada {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const android = /Android/i.test(ua);
  const mac = /Macintosh|Mac OS X/i.test(ua);
  const pantalla = soportaPantalla();
  const nativa = esAppNativa();
  return {
    pantalla,
    // En Android el motor web de la app (WebView) no trae getDisplayMedia; en el navegador de Android tampoco.
    androidWebView: android && !pantalla,
    macWebView: mac && nativa && !pantalla,
    movil: /Android|iPhone|iPad|iPod/i.test(ua),
    camaras: 0,
    pip: typeof document !== "undefined" && !!document.pictureInPictureEnabled,
    pantallaCompleta: nativa || (typeof document !== "undefined" && !!document.documentElement?.requestFullscreen),
    setSinkId: soportaAltavoz(),
    rutasNativas,
    grabadora: typeof MediaRecorder !== "undefined",
  };
}

/** Reconocimiento de voz del navegador (el local, si existe, lo pone quien integre). null si no hay. */
export function reconocedorDelNavegador(): DepsReconocedor | null {
  const W = globalThis as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return null;
  return {
    tipo: "navegador",
    iniciar(alTexto) {
      let vivo = true;
      let r: SpeechLike | null = null;
      const arrancar = () => {
        if (!vivo) return;
        try {
          r = new Ctor();
          r.lang = "es-ES";
          r.continuous = true;
          r.interimResults = false;
          r.onresult = (ev) => {
            for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) alTexto(ev.results[i][0].transcript);
          };
          r.onend = () => {
            if (vivo) setTimeout(arrancar, 300);
          };
          r.onerror = () => undefined;
          r.start();
        } catch {
          /* sin micrófono para el reconocedor */
        }
      };
      arrancar();
      return () => {
        vivo = false;
        try {
          r?.stop();
        } catch {
          /* noop */
        }
      };
    },
  };
}
interface SpeechLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

/** Astraura con el cliente que ya usa el repo (`astrauraChat`) y la puerta única de voz. Sin proveedores nuevos. */
export function astrauraDeLlamada(): DepsAstraura {
  return {
    capaz: true,
    local: false,
    async responder(pregunta, contexto) {
      const { astrauraChat } = await import("@/ai/astraura/router");
      const r = await astrauraChat({
        messages: [
          { role: "system", content: `Eres Astraura, presente en una llamada de StarSeed OS. Responde breve y claro, en español, con tono cercano. Contexto vivo de la llamada:\n${contexto}` },
          { role: "user", content: pregunta },
        ],
        taskHint: "chat",
      });
      return String(r?.text ?? "");
    },
    async hablar(texto, ajustes) {
      const v = await import("@/lib/aurora/voz-unica");
      await v.hablar(texto, { contexto: "llamada", persona: ajustes.voz ?? undefined });
    },
    ajustes: () => ({ voz: null, tono: "cercano", velocidad: 1 }),
  };
}

export function grabacionDelAparato(): DepsGrabacionLlamada {
  const ctor = typeof MediaRecorder !== "undefined" ? (MediaRecorder as unknown as CtorGrabadora) : null;
  return {
    ctor,
    mezcla: (streams, video) => crearMezclaGrabacion(streams, video),
    guardar: async (blob, nombre) => {
      try {
        const raiz = await (navigator.storage as unknown as { getDirectory?: () => Promise<never> }).getDirectory?.();
        return await guardarEnOpfs(blob, nombre, (raiz ?? null) as never);
      } catch {
        return null;
      }
    },
  };
}

function almacen(): AlmacenMinimo | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Contactos y grupos a mano para invitar: los chats del usuario. */
export async function invitablesDeChats(): Promise<Invitable[]> {
  try {
    const dm = await import("@/lib/messages/dm");
    const hilos = await dm.listThreads();
    return hilos.map((h) => ({
      id: h.id,
      nombre: h.title || (h.kind === "group" ? "Grupo" : "Chat"),
      clase: h.kind === "group" ? ("grupo" as const) : ("usuario" as const),
      miembros: h.kind === "group" ? Math.max(1, h.memberIds.length - 1) : 1,
    }));
  } catch {
    return [];
  }
}

/** Avisa a quien se invita con la llamada en SU chat (suena como cualquier timbre). */
export function invitarPorChat(a: LlamadaActiva): NonNullable<DepsAdaptador["invitarA"]> {
  return async (quien) => {
    const entregadas: Invitable[] = [];
    const fallidas: Array<{ invitable: Invitable; motivo: string }> = [];
    try {
      const [dm, adj] = await Promise.all([import("@/lib/messages/dm"), import("@/lib/llamadas/adjunto")]);
      const adjunto = adj.crearAdjuntoLlamada(a.tipo, a.sesionId);
      for (const q of quien) {
        if (q.clase === "neurona") {
          fallidas.push({ invitable: q, motivo: "Una neurona sin cuenta no recibe timbre por chat; llámala desde su neurona." });
          continue;
        }
        const m = await dm.sendMessage(q.id, { body: "Te invito a la llamada", attachments: [adjunto] }).catch(() => null);
        if (m) entregadas.push(q);
        else fallidas.push({ invitable: q, motivo: "No se pudo enviar el aviso." });
      }
    } catch {
      for (const q of quien) fallidas.push({ invitable: q, motivo: "No se pudo avisar." });
    }
    return { entregadas, fallidas };
  };
}

/** Todo junto para una llamada activa. */
export function depsParaLlamada(a: LlamadaActiva, extra: { rutasNativas?: number; invitables: () => Invitable[] }): DepsAdaptador {
  return {
    titulo: a.titulo,
    unoAUno: a.unoAUno,
    entorno: () => entornoDelAparato(extra.rutasNativas ?? 0),
    invitables: extra.invitables,
    invitarA: invitarPorChat(a),
    astraura: astrauraDeLlamada(),
    reconocedor: reconocedorDelNavegador(),
    grabacion: grabacionDelAparato(),
    // LLA1110C: la cámara recordada de ESTA neurona (se pide al encender) y las líneas de cámara al registro del enlace.
    preferenciaCamara: () => {
      try {
        return leerPreferencias(getDeviceId() || "local").camara ?? null;
      } catch {
        return null;
      }
    },
    // LLA1112B: dejar la predeterminada como estaba cuando la cámara elegida no se queda.
    guardarPreferenciaCamara: (p) => {
      try {
        guardarPreferencia(getDeviceId() || "local", { camara: p ? { id: p.id, etiqueta: p.etiqueta ?? "" } : undefined });
      } catch {
        /* sin almacenamiento */
      }
    },
    anotar: (linea) => anotarLlamada(linea.startsWith("camara ") ? "camara" : "medio=video-datos", null, linea.replace(/^camara /, "")),
    alTerminar: (f) => {
      const e = a.motor.estado();
      registrarEnHistorial(almacen(), {
        id: `${a.sesionId}:${Date.now()}`,
        fin: Date.now(),
        titulo: a.titulo,
        tipo: f.tipo,
        medio: f.medio,
        duracionMs: f.duracionMs,
        contestada: f.contestada,
        saliente: a.esCreador,
        hiloId: a.hiloId,
        tipoHilo: a.hiloId ? (a.unoAUno ? "dm" : "grupo") : null,
        miembros: e.participantes.filter((p) => !p.yo && p.uid).map((p) => p.uid as string),
        grabacion: f.grabacion,
      });
    },
  };
}

