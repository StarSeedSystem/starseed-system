"use client";

/*
 * puente-llamada-nativa — las llamadas de StarSeed como llamadas del teléfono (LLA1108D, 2026-11-08).
 * Contrato: architecture/llamadas-telefonia.md § «Integración nativa».
 *
 * Dos cosas:
 *  1. API tipada de los comandos de la app nativa (`llamada_nativa_*`) y de sus eventos
 *     (`llamada-nativa://…`). Nunca lanza; en la web normal no hace nada (devuelve false / sin capacidades).
 *  2. `conectarLlamadaNativa`: engancha los dos motores de llamada (la directa por la malla y el sistema de
 *     llamadas por canal) al teléfono SIN tocar sus archivos: mira sus cambios y los cuenta (iniciar →
 *     activa → terminada), y lleva lo que pase en el teléfono (contestar desde el aviso o los auriculares,
 *     colgar, silenciar) a las acciones que esos motores ya tienen. El mapeo vive en
 *     mapeo-llamada-nativa.ts (puro, con pruebas); aquí solo se inyecta lo que habla con Tauri y con los motores.
 */

import { puenteNativo, type PuenteNativo } from "@/lib/nativa/puente";
import { cargaIniciarNativo, ignorarLlamada, silencioDesdeEvento, type CargaIniciarNativo, type CambioSilencio } from "./decision-timbre";
import { crearEspejoSilencios } from "./espejo-silencios";
import { depurar, guardarSilencios, poner, quitar, silenciosGuardados, type Silencio } from "../silencio-llamadas";
import {
  accionParaEvento,
  cargaDeEvento,
  contadoTras,
  EVENTOS_NATIVOS,
  leerCapacidades,
  llamadaDesdeDirecta,
  llamadaDesdeSistema,
  pasosHacia,
  PREFIJO_EVENTO,
  SIN_CAPACIDADES,
  type AccionMotor,
  type CapacidadesLlamadaNativa,
  type CargaEvento,
  type EstadoNativo,
  type EventoNativo,
  type InstantaneaMotores,
  type LlamadaParaNativa,
  type PasoNativo,
  type RutaAudio,
  type UltimoContado,
  type VistaActiva,
  type VistaDirecta,
  type VistaTimbre,
} from "./mapeo-llamada-nativa";

export type { CapacidadesLlamadaNativa, CargaEvento, EstadoNativo, EventoNativo, RutaAudio } from "./mapeo-llamada-nativa";

/* ══════════════════════════ 1 · API tipada ══════════════════════════ */

export interface PuenteLlamadaNativa {
  /** Hay app nativa (en la web normal, false y todo lo demás no hace nada). */
  disponible: boolean;
  capacidades(): Promise<CapacidadesLlamadaNativa>;
  iniciar(l: CargaIniciarNativo): Promise<boolean>;
  /** (LLA1108F) «Ignorar»: deja de sonar y de tapar la pantalla; quien llama no ve «rechazada». */
  ignorar(id: string): Promise<boolean>;
  /** (LLA1108F) Eventos del último minuto que la web no vio (la app estaba cerrada y arrancó al contestar). Se entregan una vez. */
  recientes(): Promise<Array<{ evento: string; id: string; valor: unknown }>>;
  estado(id: string, estado: EstadoNativo, silenciada?: boolean): Promise<boolean>;
  rutaAudio(ruta: RutaAudio): Promise<boolean>;
  /** Pide (o quita) que el sensor de proximidad apague la pantalla junto a la cara. */
  proximidad(activa: boolean): Promise<boolean>;
  /** Android 14+: abre el ajuste de «Notificaciones a pantalla completa»; devuelve las capacidades de ahora. */
  permiso(): Promise<CapacidadesLlamadaNativa>;
  /** Escucha los eventos del teléfono (todos). Devuelve la baja. */
  alEvento(cb: (e: EventoNativo, c: CargaEvento) => void): Promise<() => void>;
}

type BaseTauri = Pick<PuenteNativo, "disponible" | "llamar" | "escuchar">;

export function crearPuenteLlamadaNativa(base: BaseTauri): PuenteLlamadaNativa {
  const ok = async (cmd: string, args?: Record<string, unknown>): Promise<boolean> => {
    if (!base.disponible) return false;
    const r = await base.llamar<unknown>(cmd, args);
    return r.ok;
  };
  return {
    disponible: base.disponible,
    async capacidades() {
      if (!base.disponible) return SIN_CAPACIDADES;
      const r = await base.llamar<unknown>("llamada_nativa_capacidades");
      return r.ok ? leerCapacidades(r.valor) : SIN_CAPACIDADES;
    },
    iniciar: (l) =>
      ok("llamada_nativa_iniciar", {
        id: l.id,
        nombre: l.nombre,
        tipo: l.tipo,
        entrante: l.entrante,
        iniciales: l.iniciales,
        medio: l.medio,
        uid: l.uid,
        neurona: l.neurona,
        chat: l.chat,
        silencioHasta: l.silencioHasta,
      }),
    ignorar: (id) => ok("llamada_nativa_ignorar", { id }),
    async recientes() {
      if (!base.disponible) return [];
      const r = await base.llamar<unknown>("llamada_nativa_recientes");
      if (!r.ok || !Array.isArray(r.valor)) return [];
      const fuera: Array<{ evento: string; id: string; valor: unknown }> = [];
      for (const x of r.valor.slice(0, 32)) {
        const o = x as { evento?: unknown; id?: unknown; valor?: unknown };
        if (typeof o?.evento === "string" && typeof o.id === "string" && (EVENTOS_NATIVOS as readonly string[]).includes(o.evento)) fuera.push({ evento: o.evento, id: o.id, valor: o.valor ?? null });
      }
      return fuera;
    },
    estado: (id, estado, silenciada) => ok("llamada_nativa_estado", silenciada === undefined ? { id, estado } : { id, estado, silenciada }),
    rutaAudio: (ruta) => ok("llamada_nativa_ruta_audio", { ruta }),
    proximidad: (activa) => ok("llamada_nativa_proximidad", { activa }),
    async permiso() {
      if (!base.disponible) return SIN_CAPACIDADES;
      const r = await base.llamar<unknown>("llamada_nativa_permiso");
      return r.ok ? leerCapacidades(r.valor) : SIN_CAPACIDADES;
    },
    async alEvento(cb) {
      if (!base.disponible) return () => undefined;
      const bajas = await Promise.all(
        EVENTOS_NATIVOS.map((e) =>
          base.escuchar(PREFIJO_EVENTO + e, (payload) => {
            const c = cargaDeEvento(payload);
            if (c) cb(e, c);
          }),
        ),
      );
      return () => {
        for (const b of bajas) {
          try {
            b();
          } catch {
            /* ya estaba dada de baja */
          }
        }
      };
    },
  };
}

let compartido: PuenteLlamadaNativa | null = null;

/** El puente de esta ventana (en la web normal, uno inerte). */
export function puenteLlamadaNativa(): PuenteLlamadaNativa {
  if (compartido) return compartido;
  const p = crearPuenteLlamadaNativa(puenteNativo());
  // En el servidor (render) no se guarda: `puenteNativo()` tampoco.
  if (typeof window !== "undefined") compartido = p;
  return p;
}

/* ══════════════════════════ 2 · Enganche con los motores ══════════════════════════ */

/** Lo que el enlace necesita de los dos motores. Se inyecta (pruebas) o se carga del real. */
export interface MotoresLlamada {
  directa: {
    leer(): VistaDirecta;
    suscribir(cb: () => void): () => void;
    contestar(): Promise<unknown>;
    rechazar(): void;
    colgar(): void;
    alternarMicro(): void;
  };
  sistema: {
    leer(): { activa: VistaActiva | null; timbres: VistaTimbre[]; micro: boolean };
    suscribir(cb: () => void): () => void;
    contestar(sesionId: string): Promise<unknown>;
    rechazar(sesionId: string): Promise<unknown>;
    colgar(): void;
    alternarMicro(): Promise<unknown>;
  };
}

export interface OpcionesEnlace {
  puente: PuenteLlamadaNativa;
  motores: MotoresLlamada;
  /** (LLA1108F) La política de silencios: lo que hay, y cómo se cambia. Por defecto, la de esta ventana. */
  politica?: {
    silencios(): readonly Silencio[];
    aplicar(c: CambioSilencio): void;
  };
  ahora?: () => number;
  /** (LLA1108F) Responder con mensaje desde el timbre: la web manda el texto al chat de quien llama. */
  mensajeRapido?: (id: string, texto: string) => Promise<unknown>;
}

/** Cuánto vale un «contestar» del teléfono que llegó antes que la señal de la llamada (la app arrancó al contestar). */
export const VIDA_PENDIENTE_MS = 60_000;

function politicaPorDefecto(): NonNullable<OpcionesEnlace["politica"]> {
  return {
    silencios: () => silenciosGuardados(),
    aplicar: (c) => {
      const ahora = Date.now();
      guardarSilencios(c.tipo === "poner" ? poner(silenciosGuardados(), c.silencio) : depurar(quitar(silenciosGuardados(), c.id, ahora), ahora));
    },
  };
}

/**
 * El enlace en sí (síncrono y sin efectos fuera de lo inyectado): se suscribe a los dos motores, cuenta al
 * teléfono lo que cambia y atiende sus eventos. Devuelve la baja.
 */
export function enlazarMotores({ puente, motores, politica = politicaPorDefecto(), ahora = Date.now, mensajeRapido }: OpcionesEnlace): { desconectar: () => void; sincronizar: () => void; alEvento: (e: EventoNativo, c: CargaEvento) => void; esperar: () => Promise<void> } {
  let contado: UltimoContado | null = null;
  let cola: Promise<void> = Promise.resolve();
  // (LLA1108F) Lo último que se sabe de cada llamada (para los silencios) y lo que el teléfono pidió antes de que la llamada llegara.
  const vistas = new Map<string, LlamadaParaNativa>();
  const pendientes = new Map<string, { evento: EventoNativo; carga: CargaEvento; t: number }>();

  const vistaDirecta = () => motores.directa.leer();
  const vistaSistema = () => motores.sistema.leer();

  function elegir(): LlamadaParaNativa | null {
    const d = llamadaDesdeDirecta(vistaDirecta());
    const s = vistaSistema();
    const sis = llamadaDesdeSistema(s.activa, s.timbres);
    const candidatas = [d, sis].filter((x): x is LlamadaParaNativa => !!x);
    const elegida = candidatas.find((c) => c.estado !== "terminada") ?? candidatas[0] ?? null;
    if (elegida) {
      vistas.set(elegida.id, elegida);
      while (vistas.size > 8) {
        const k = vistas.keys().next().value;
        if (k === undefined) break;
        vistas.delete(k);
      }
    }
    return elegida;
  }

  async function ejecutar(p: PasoNativo): Promise<void> {
    try {
      // (LLA1108F) Cuanto antes, con quién llama, por dónde y si la política la silencia: la parte nativa sigue sola.
      if (p.paso === "iniciar") await puente.iniciar(cargaIniciarNativo(p.llamada, politica.silencios(), ahora()));
      else await puente.estado(p.id, p.estado, p.silenciada);
    } catch {
      /* el teléfono no contesta: la llamada de la web sigue igual */
    }
  }

  function reintentarPendientes(): void {
    for (const [id, p] of Array.from(pendientes)) {
      if (ahora() - p.t > VIDA_PENDIENTE_MS) {
        pendientes.delete(id);
        continue;
      }
      const a = accionParaEvento(p.evento, p.carga, instantanea());
      if (a) {
        pendientes.delete(id);
        void hacer(a).catch(() => undefined);
      }
    }
  }

  function sincronizar(): void {
    reintentarPendientes();
    const pasos = pasosHacia(contado, elegir());
    if (!pasos.length) return;
    contado = contadoTras(contado, pasos);
    // De uno en uno y en orden: Rust no debe ver «activa» antes que «iniciar».
    cola = cola.then(async () => {
      for (const p of pasos) await ejecutar(p);
    });
  }

  function instantanea(): InstantaneaMotores {
    const d = vistaDirecta();
    const s = vistaSistema();
    return {
      directa: { fase: d.fase, id: d.id, micro: d.micro },
      activa: s.activa ? { sesionId: s.activa.sesionId, micro: s.micro, cerrada: s.activa.fase === "terminada" || s.activa.fase === "error" } : null,
      timbres: s.timbres.map((t) => ({ sesionId: t.sesionId })),
    };
  }

  async function hacer(a: AccionMotor): Promise<void> {
    if (a.motor === "timbre") {
      if (a.accion === "ignorar") ignorarLlamada(a.id);
      else if (a.accion === "silencio") {
        const c = silencioDesdeEvento(a.valor, vistas.get(a.id) ?? null, ahora());
        if (c) politica.aplicar(c);
        if (c?.tipo === "poner") ignorarLlamada(a.id);
      } else if (mensajeRapido) await mensajeRapido(a.id, a.texto);
      return;
    }
    if (a.motor === "directa") {
      if (a.accion === "contestar") await motores.directa.contestar();
      else if (a.accion === "rechazar") motores.directa.rechazar();
      else if (a.accion === "colgar") motores.directa.colgar();
      else motores.directa.alternarMicro();
      return;
    }
    if (a.accion === "contestar") await motores.sistema.contestar(a.sesionId);
    else if (a.accion === "rechazar") await motores.sistema.rechazar(a.sesionId);
    else if (a.accion === "colgar") motores.sistema.colgar();
    else await motores.sistema.alternarMicro();
  }

  function alEvento(e: EventoNativo, c: CargaEvento): void {
    const a = accionParaEvento(e, c, instantanea());
    if (!a) {
      // «Contestar» desde la pantalla de bloqueo con la app cerrada: la señal de la llamada llega después de arrancar.
      if (e === "contestar" && !pendientes.has(c.id)) pendientes.set(c.id, { evento: e, carga: c, t: ahora() });
      return;
    }
    void hacer(a).catch(() => undefined);
  }

  const bajaDirecta = motores.directa.suscribir(sincronizar);
  const bajaSistema = motores.sistema.suscribir(sincronizar);
  sincronizar();
  return {
    desconectar: () => {
      bajaDirecta();
      bajaSistema();
    },
    sincronizar,
    alEvento,
    esperar: () => cola,
  };
}

let conectada: Promise<() => void> | null = null;

/** Los motores reales (carga perezosa: este módulo no importa ninguno de ellos al cargarse). */
async function motoresReales(): Promise<MotoresLlamada> {
  const [directa, store, acciones] = await Promise.all([import("@/lib/malla/llamada-directa"), import("@/lib/llamadas/store"), import("@/lib/llamadas/acciones")]);
  return {
    directa: {
      leer: () => directa.estadoLlamadaDirecta(),
      suscribir: (cb) => directa.suscribirLlamadaDirecta(cb),
      contestar: () => directa.contestarLlamada(),
      rechazar: () => directa.rechazarLlamada(),
      colgar: () => directa.colgarLlamada(),
      alternarMicro: () => directa.alternarMicro(),
    },
    sistema: {
      leer: () => {
        const e = store.leerLlamadas();
        const a = e.activa;
        const est = a ? a.motor.estado() : null;
        return {
          activa: a ? { sesionId: a.sesionId, tipo: a.tipo, titulo: a.titulo, esCreador: a.esCreador, fase: est?.fase ?? "conectando", micro: est?.micro ?? true } : null,
          timbres: e.timbres.map((t) => ({ sesionId: t.sesionId, tipo: t.tipo, nombre: t.llamante.nombre })),
          micro: est?.micro ?? true,
        };
      },
      suscribir: (cb) => {
        // Cambios del almacén (timbre nuevo, llamada nueva) y del motor de la llamada activa (su fase y su micro).
        let bajaMotor: (() => void) | null = null;
        let motorEnganchado: unknown = null;
        const enganchar = () => {
          const a = store.leerLlamadas().activa;
          if (a?.motor === motorEnganchado) return;
          bajaMotor?.();
          bajaMotor = null;
          motorEnganchado = a?.motor ?? null;
          if (a) bajaMotor = a.motor.suscribir(() => cb());
        };
        const bajaStore = store.suscribirLlamadas(() => {
          enganchar();
          cb();
        });
        enganchar();
        return () => {
          bajaStore();
          bajaMotor?.();
        };
      },
      contestar: async (sesionId) => {
        const t = store.leerLlamadas().timbres.find((x) => x.sesionId === sesionId);
        if (t) await acciones.aceptarTimbre(t);
      },
      rechazar: async (sesionId) => {
        const t = store.leerLlamadas().timbres.find((x) => x.sesionId === sesionId);
        if (t) await acciones.rechazarTimbre(t);
      },
      colgar: () => acciones.colgarLlamada(),
      alternarMicro: async () => {
        await store.leerLlamadas().activa?.motor.alternarMicro();
      },
    },
  };
}

/**
 * Engancha las llamadas de la app al teléfono. Idempotente; en la web normal (o en una app sin la parte
 * nativa de llamadas: Windows, Linux, APK viejo) no engancha nada. Nunca lanza.
 */
export function conectarLlamadaNativa(): Promise<() => void> {
  if (conectada) return conectada;
  conectada = (async () => {
    try {
      const puente = puenteLlamadaNativa();
      if (!puente.disponible) return () => undefined;
      const cap = await puente.capacidades();
      // (LLA1108F) Escritorio sin integración de audio (Windows, Linux) también engancha: abre la ventana de la llamada entrante.
      if (!cap.nativa && !cap.ventana_entrante) return () => undefined;
      const enlace = enlazarMotores({ puente, motores: await motoresReales() });
      const baja = await puente.alEvento(enlace.alEvento);
      // Lo que el teléfono contó mientras la web no existía (contestar con la app cerrada).
      for (const r of await puente.recientes()) enlace.alEvento(r.evento as EventoNativo, { id: r.id, valor: r.valor });
      // La política de silencios, espejada a la parte nativa (suena o calla aunque el JS esté congelado).
      const base = puenteNativo();
      const espejo = crearEspejoSilencios({ llamar: (cmd, args) => base.llamar<unknown>(cmd, args).then((r) => ({ ok: r.ok, valor: r.ok ? r.valor : undefined })) });
      void espejo.sincronizar();
      return () => {
        baja();
        enlace.desconectar();
        espejo.parar();
        conectada = null;
      };
    } catch {
      return () => undefined;
    }
  })();
  return conectada;
}
