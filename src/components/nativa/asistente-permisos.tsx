"use client";

/*
 * AsistentePermisos — «Dejemos lista tu neurona»: los permisos del primer arranque, de uno en uno (PER1108A, 2026-11-08).
 * Contrato: architecture/red-sin-dependencias.md §4 · máquina de estados: src/lib/nativa/permisos-inicio.ts ·
 * quien pide al sistema: src/lib/nativa/permisos-inicio-ejecutor.ts (reutiliza Bluetooth, Wi-Fi directo y medios).
 *
 * Solo en las apps nativas de macOS y Android, global (layout raíz). Se abre solo la primera vez y cuando una
 * actualización AÑADE permisos nuevos; se puede omitir cada uno o todo, y se reabre desde
 * Ajustes › Permisos y antenas (evento `starseed:permisos-inicio-abrir`). También aplica, una vez por versión,
 * los defectos de antenas encendidas (`aplicarDefectosAntenas`).
 * Va de UNO en UNO: macOS deja el aviso de privacidad pendiente y, mientras, la ventana no recibe clics; por eso
 * los botones se desactivan mientras el sistema espera y el texto lo dice.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import { Check, CircleAlert, Loader2, ShieldCheck, X } from "lucide-react";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import {
  ASISTENTE_OCULTO,
  CLAVE_PERMISOS_INICIO,
  EVENTO_ABRIR_ASISTENTE,
  abrirAsistente,
  debeAbrirseSolo,
  guardadoTras,
  leerGuardadoPermisos,
  permisoActual,
  reducirAsistente,
  serializarGuardadoPermisos,
  textoResultado,
  type DefPermiso,
  type EstadoAsistente,
  type ResultadoPermiso,
} from "@/lib/nativa/permisos-inicio";
import { pedirPermisoInicio, type DepsEjecutor } from "@/lib/nativa/permisos-inicio-ejecutor";
import { aplicarDefectosAntenas } from "@/lib/nativa/defectos-antenas-aplicar";

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
  return /Android/i.test(ua) ? "android" : /Mac/i.test(ua) ? "macos" : "otra";
}

function depsReales(): DepsEjecutor {
  const p = puenteNativo();
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
      const w = window as unknown as { __TAURI__?: { notification?: { requestPermission?: () => Promise<string> } } };
      const f = w.__TAURI__?.notification?.requestPermission;
      if (typeof f === "function") return f();
      return typeof Notification !== "undefined" ? Notification.requestPermission() : null;
    },
    dormir: (ms) => new Promise((r) => setTimeout(r, ms)),
    ahora: () => Date.now(),
  };
}

const ICONO: Record<ResultadoPermiso, string> = {
  concedido: "text-emerald-300",
  denegado: "text-rose-300",
  omitido: "text-white/45",
  "no-disponible": "text-white/45",
};

/* El reductor puro no sabe «abrir»: este contenedor lo añade (el estado inicial lo calcula `abrirAsistente`). */
type Accion = Parameters<typeof reducirAsistente>[1] | { t: "abrir"; estado: EstadoAsistente };

function reductor(e: EstadoAsistente, a: Accion): EstadoAsistente {
  return a.t === "abrir" ? a.estado : reducirAsistente(e, a);
}

export function AsistentePermisos() {
  const [estado, enviar] = useReducer(reductor, ASISTENTE_OCULTO);
  const enCurso = useRef(false);
  const plataforma = useRef<string | null>(null);

  // Arranque: defectos de antenas (una vez por versión) y, si toca, abrir el asistente.
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
      const plat = await plataformaDeLaApp();
      if (!vivo) return;
      plataforma.current = plat;
      const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
      if (debeAbrirseSolo(plat, g)) enviar({ t: "abrir", estado: abrirAsistente(plat, g) });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Desde Ajustes › Permisos y antenas: se repasan todos.
  useEffect(() => {
    const abrir = () => {
      const plat = plataforma.current;
      if (!plat) return;
      enviar({ t: "abrir", estado: abrirAsistente(plat, leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO)), true) });
    };
    window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
  }, []);

  const pedir = useCallback(
    async (def: DefPermiso, sistema: "macos" | "android") => {
      if (enCurso.current) return;
      enCurso.current = true;
      enviar({ t: "pedir" });
      const r = await pedirPermisoInicio(def.id, sistema, depsReales());
      enviar({ t: "resultado", id: def.id, r });
      enCurso.current = false;
    },
    [],
  );

  const cerrar = () => {
    const g = leerGuardadoPermisos(leerAlmacen(CLAVE_PERMISOS_INICIO));
    escribirAlmacen(CLAVE_PERMISOS_INICIO, serializarGuardadoPermisos(guardadoTras(g, estado)));
    enviar({ t: "cerrar" });
  };

  if (estado.fase === "oculto" || !estado.sistema) return null;
  const actual = permisoActual(estado);
  const esperando = estado.esperando !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Permisos de tu neurona"
      data-testid="asistente-permisos"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm ss-capa-modal"
    >
      <div className="flex w-[min(34rem,94vw)] flex-col ss-ventana-limite !overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/70 p-4 sm:p-5 text-white shadow-2xl backdrop-blur-xl">
        <header className="flex shrink-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14]">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Dejemos lista tu neurona</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-white/60">
              Tus antenas (Bluetooth, Wi-Fi directo y red local) quedan encendidas de fábrica. Para que funcionen, el sistema te pedirá estos permisos, de uno en uno. Puedes omitir
              cualquiera: lo retomas en Ajustes › Permisos y antenas.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={esperando}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <ol className="space-y-1.5" aria-label="Permisos">
          {estado.cola.map((d, i) => {
            const r = estado.resultados[d.id];
            const esActual = estado.fase === "pidiendo" && i === estado.indice;
            return (
              <li
                key={d.id}
                data-testid={`permiso-${d.id}`}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 text-xs ${esActual ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 bg-white/[0.02]"}`}
              >
                <span className="mt-0.5 shrink-0">
                  {r === "concedido" ? (
                    <Check className={`size-4 ${ICONO.concedido}`} aria-hidden />
                  ) : r ? (
                    <CircleAlert className={`size-4 ${ICONO[r]}`} aria-hidden />
                  ) : esActual && esperando ? (
                    <Loader2 className="size-4 animate-spin text-[#39FF14]" aria-hidden />
                  ) : (
                    <span className="block size-4 rounded-full border border-white/20" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-white/90">
                    {d.titulo}
                    {d.opcional && <span className="ml-1.5 text-[10px] font-normal text-white/40">opcional</span>}
                  </span>
                  <span className="block leading-relaxed text-white/55">{d.porQue}</span>
                  {r && <span className={`block ${ICONO[r]}`}>{textoResultado(r)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        </div>

        {esperando && (
          <p role="status" className="mt-3 shrink-0 text-xs text-[#39FF14]/90">
            Esperando tu respuesta al aviso del sistema… (si no lo ves, mira detrás de esta ventana).
          </p>
        )}

        <footer className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2">
          {estado.fase === "presentacion" && (
            <>
              <button type="button" onClick={() => enviar({ t: "omitir-todo" })} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
                Ahora no
              </button>
              <button type="button" onClick={() => enviar({ t: "empezar" })} className="cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25">
                Empezar
              </button>
            </>
          )}
          {estado.fase === "pidiendo" && actual && (
            <>
              <button type="button" disabled={esperando} onClick={() => enviar({ t: "omitir-todo" })} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                Omitir todo
              </button>
              <button type="button" disabled={esperando} onClick={() => enviar({ t: "omitir" })} className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                Omitir este
              </button>
              <button
                type="button"
                disabled={esperando}
                onClick={() => void pedir(actual, estado.sistema as "macos" | "android")}
                className="cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Permitir {actual.titulo}
              </button>
            </>
          )}
          {estado.fase === "resumen" && (
            <button type="button" onClick={cerrar} className="cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25">
              Listo
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
