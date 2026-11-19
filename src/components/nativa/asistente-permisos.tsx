"use client";

/*
 * AsistentePermisos — la lista de permisos de cada neurona (PER1108A → PER1111S, 2026-11-11).
 * Contrato: architecture/permisos-y-control-del-dispositivo.md §5 · registro único: src/lib/nativa/permisos-registro.ts ·
 * máquina de estados: src/lib/nativa/permisos-inicio.ts · quien pide al sistema: permisos-inicio-ejecutor.ts ·
 * la ventana (solo pintura): ./lista-permisos.tsx.
 *
 * En las apps nativas de macOS, Android, Windows y Linux, global (layout raíz). Se abre sola la primera vez y
 * cuando una actualización AÑADE permisos (solo los nuevos y solo si no están ya concedidos); se reabre desde los
 * ajustes de la neurona (evento `starseed:permisos-inicio-abrir`). Lee el estado REAL de cada permiso al abrir, al
 * volver a la ventana (la persona regresa de Ajustes del Sistema) y mientras espera: así nota una concesión sin
 * reiniciar nada.
 *
 * ORDEN DE LAS VENTANAS DE PRIMER ARRANQUE (PER1115A, 2026-11-15) — una sola recibe los toques cada vez:
 *   1. las ventanas de la persona (acceso/crear cuenta y «Esta neurona», diálogos Radix de `PrimerArranque`: sin ellas
 *      no hay cuenta ni neurona y se terminan en 360 px),
 *   2. después, esta lista de permisos.
 * Esta ventana está hecha a mano y un diálogo Radix modal deja `pointer-events:none` en <body>: si se pintara encima, los
 * toques caerían en el diálogo de debajo (y lo cerrarían). Por eso espera a que el primer plano quede libre y, mientras
 * se ve, se marca con `data-ss-primer-plano` para que las demás esperen a que termine. No se pierde ninguna: solo se turnan.
 * También aplica, una vez por versión, los defectos de antenas encendidas (`aplicarDefectosAntenas`).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { alLiberarsePrimerPlano } from "@/lib/ui/fullscreen-modal";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import {
  ASISTENTE_OCULTO,
  CLAVE_PERMISOS_INICIO,
  EVENTO_ABRIR_ASISTENTE,
  abrirAsistente,
  accionEn,
  debeAbrirseSolo,
  guardadoTras,
  leerGuardadoPermisos,
  reducirAsistente,
  serializarGuardadoPermisos,
  sistemaDeAsistente,
  type DefPermiso,
  type EstadoAsistente,
} from "@/lib/nativa/permisos-inicio";
import { leerEstadosSistema, pedirPermisoInicio, type DepsEjecutor } from "@/lib/nativa/permisos-inicio-ejecutor";
import { aplicarDefectosAntenas } from "@/lib/nativa/defectos-antenas-aplicar";
import { detectarMedioActual, decidirAccion, type MedioId, type PermisoId, type EstadoPermiso as EstadoPermisoMatriz, type AccionPermiso } from "@/lib/permisos/matriz";
import { ListaPermisos } from "./lista-permisos";

function leerAlmacen(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirAlmacen(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: se vuelve a preguntar la próxima vez */
  }
}

async function plataformaDeLaApp(): Promise<string> {
  const r = await puenteNativo().llamar<{ plataforma?: unknown }>("permisos_inicio_estado");
  if (r.ok && r.valor && typeof r.valor.plataforma === "string") return r.valor.plataforma;
  // Una app anterior a PER1108A no tiene el comando: se deduce del agente.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Android/i.test(ua) ? "android" : /Mac/i.test(ua) ? "macos" : /Windows/i.test(ua) ? "windows" : /Linux/i.test(ua) ? "linux" : "otra";
}

function depsReales(): DepsEjecutor {
  const p = puenteNativo();
  const tauriNotif = () => (window as unknown as { __TAURI__?: { notification?: { requestPermission?: () => Promise<string>; isPermissionGranted?: () => Promise<boolean> } } }).__TAURI__?.notification;
  return {
    llamar: (c, a) => p.llamar(c, a),
    pedirMedio:
      typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
        ? async (tipo) => {
            try {
              const flujo = await navigator.mediaDevices.getUserMedia(tipo === "audio" ? { audio: true } : { video: true });
              flujo.getTracks().forEach((t) => t.stop());
              return "ok";
            } catch (e) {
              const n = (e as { name?: string } | null)?.name;
              return n === "NotFoundError" || n === "OverconstrainedError" ? "no-hay" : "denegado";
            }
          }
        : null,
    pedirNotificaciones: async () => {
      const f = tauriNotif()?.requestPermission;
      if (typeof f === "function") return f();
      return typeof Notification !== "undefined" ? Notification.requestPermission() : null;
    },
    notificacionesConcedidas: async () => {
      const f = tauriNotif()?.isPermissionGranted;
      if (typeof f === "function") return f();
      return typeof Notification !== "undefined" ? Notification.permission === "granted" : null;
    },
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    ahora: () => Date.now(),
  };
}

/* El reductor puro no sabe «abrir»: este contenedor lo añade (el estado inicial lo calcula `abrirAsistente`). */
type Accion = Parameters<typeof reducirAsistente>[1] | { t: "abrir"; estado: EstadoAsistente };

function reductor(e: EstadoAsistente, a: Accion): EstadoAsistente {
  return a.t === "abrir" ? a.estado : reducirAsistente(e, a);
}

export function AsistentePermisos() {
  const [estado, enviar] = useReducer(reductor, ASISTENTE_OCULTO);
  const enCurso = useRef(false);
  const plataforma = useRef<{ plat: string; sesion: string | null } | null>(null);
  const medioActual = useRef<MedioId>(typeof window !== "undefined" ? detectarMedioActual() : "web-chromium");
  const visible = estado.fase !== "oculto";
  // Turno: la lista solo se pinta cuando el primer plano está libre (ver el orden arriba).
  const [turno, setTurno] = useState(false);
  useEffect(() => {
    if (!visible) {
      setTurno(false);
      return;
    }
    return alLiberarsePrimerPlano(() => setTurno(true), { intervaloMs: 600 });
  }, [visible]);

  /** Lee el estado real y la plataforma (un solo sitio). */
  const leer = useCallback(async () => {
    const plat = plataforma.current?.plat ?? (await plataformaDeLaApp());
    const sistema = sistemaDeAsistente(plat, plataforma.current?.sesion);
    const l = await leerEstadosSistema(sistema, depsReales());
    plataforma.current = { plat, sesion: l.sesion ?? plataforma.current?.sesion ?? null };
    return { plat, sesion: plataforma.current.sesion, estados: l.estados };
  }, []);

  // Arranque: defectos de antenas (una vez por versión) y, si toca, abrir la lista.
  useEffect(() => {
    if (!esAppNativa()) return;
    let vivo = true;
    void (async () => {
      const p = puenteNativo();
      await aplicarDefectosAntenas({
        esNativa: esAppNativa,
        leerAlmacen,
        escribirAlmacen,
        bluetoothActivo: async () => {
          const r = await p.llamar<{ activo?: unknown }>("ble_estado");
          return r.ok && r.valor && typeof r.valor.activo === "boolean" ? r.valor.activo : null;
        },
        leerConfig: async () => {
          const r = await p.llamar<{ faro_apagado?: boolean }>("antenas_config");
          return r.ok && r.valor ? r.valor : null;
        },
        escribirConfig: async (c) => (await p.llamar("antenas_configurar", { config: c })).ok,
      });
      const { plat, sesion, estados } = await leer();
      if (!vivo) return;
      const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
      if (debeAbrirseSolo(plat, g, estados, sesion)) enviar({ t: "abrir", estado: abrirAsistente(plat, g, false, estados, sesion) });
    })();
    return () => {
      vivo = false;
    };
  }, [leer]);

  // Desde los ajustes de la neurona: la lista entera, con todo lo pedible aún sin conceder.
  useEffect(() => {
    const abrir = () => {
      void (async () => {
        const { plat, sesion, estados } = await leer();
        enviar({ t: "abrir", estado: abrirAsistente(plat, leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO)), true, estados, sesion) });
      })();
    };
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
  }, [leer]);

  // Al volver a la ventana (de Ajustes del Sistema, por ejemplo) se relee el estado real: la concesión se nota sola.
  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    const releer = () => {
      void leer().then((l) => {
        if (vivo) enviar({ t: "estados", estados: l.estados });
      });
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") releer();
    };
    window.addEventListener("focus", releer);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.removeEventListener("focus", releer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [visible, leer]);

  function idPermisoAMatriz(id: string): PermisoId {
    return id as PermisoId;
  }

  function estadoSistemaAMatriz(e: string | undefined): EstadoPermisoMatriz {
    if (!e) return "no-disponible";
    return e as EstadoPermisoMatriz;
  }

  const pedir = useCallback(
    async (def: DefPermiso, e: EstadoAsistente) => {
      if (enCurso.current || !e.sistema) return;
      enCurso.current = true;
      const accionNativa = accionEn(e, def);
      const permisoMatriz = idPermisoAMatriz(def.id);
      const estadoMatriz = estadoSistemaAMatriz(e.estados[def.id]);
      const decision = decidirAccion(permisoMatriz, medioActual.current, estadoMatriz);
      const accion = decision.accion as "pedir" | "abrir-ajustes" | "ninguna" | "mostrar-en-lista" | "por-uso" | "nada" | "mas-adelante" | "listo";
      enviar({ t: "pedir", id: def.id });
      const r = await pedirPermisoInicio(def.id, e.sistema, depsReales(), accionNativa);
      const l = await leer();
      enviar({ t: "estados", estados: l.estados });
      enviar({ t: "resultado", id: def.id, r });
      enCurso.current = false;
    },
    [leer],
  );

  const cerrar = () => {
    const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
    escribirAlmacen(CLAVE_PERMISOS_INICIO, serializarGuardadoPermisos(guardadoTras(g, estado)));
    enviar({ t: "cerrar" });
  };

  if (estado.fase === "oculto" || !estado.sistema || !turno) return null;
  return (
    <ListaPermisos
      estado={estado}
      onEmpezar={() => enviar({ t: "empezar" })}
      onOmitir={() => enviar({ t: "omitir" })}
      onOmitirTodo={() => enviar({ t: "omitir-todo" })}
      onPedir={(d) => void pedir(d, estado)}
      onCerrar={cerrar}
    />
  );
}
