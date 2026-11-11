"use client";

/*
 * ListaPermisos — la ventana de la lista de permisos de una neurona, SOLO pintura (PER1111S, 2026-11-11).
 * La pone `asistente-permisos.tsx` (que sabe hablar con la app) y la usan las pruebas y las capturas con datos
 * de macOS o Android sin la app. Contrato: architecture/permisos-y-control-del-dispositivo.md §5.
 *
 * Reglas de la ventana (VEN1111D): `ss-ventana-limite` + un único carril con scroll (`min-h-0 flex-1
 * overflow-y-auto`), cabecera y pie fijos, nada cortado a 360 px: el botón de cada permiso baja a su propia
 * línea antes que estrecharse, y los textos se parten antes que salirse.
 */

import { Check, CircleAlert, CircleDashed, Clock, Loader2, Minus, ShieldCheck, X } from "lucide-react";
import { ORDEN_GRUPOS, TITULO_GRUPO, textoEstado, type AccionPermiso } from "@/lib/nativa/permisos-registro";
import { accionEn, permisoActual, textoResultado, type DefPermiso, type EstadoAsistente } from "@/lib/nativa/permisos-inicio";

const NOMBRE_SISTEMA: Record<string, string> = {
  macos: "macOS",
  android: "Android",
  windows: "Windows",
  "linux-x11": "Linux (X11)",
  "linux-wayland": "Linux (Wayland)",
};

export function textoBoton(d: DefPermiso, a: AccionPermiso): string {
  return a === "abrir-ajustes" ? "Abrir Ajustes" : d.id === "arranque" ? "Activar" : "Permitir";
}

function Icono({ a, esperando }: { a: AccionPermiso; esperando: boolean }) {
  if (esperando) return <Loader2 className="size-4 animate-spin text-[#39FF14]" aria-hidden />;
  if (a === "listo") return <Check className="size-4 text-emerald-300" aria-hidden />;
  if (a === "mas-adelante") return <Clock className="size-4 text-white/35" aria-hidden />;
  if (a === "nada" || a === "por-uso") return <Minus className="size-4 text-white/40" aria-hidden />;
  if (a === "abrir-ajustes") return <CircleAlert className="size-4 text-amber-300" aria-hidden />;
  return <CircleDashed className="size-4 text-white/45" aria-hidden />;
}

function colorEstado(a: AccionPermiso): string {
  if (a === "listo") return "text-emerald-300/90";
  if (a === "abrir-ajustes") return "text-amber-300/90";
  if (a === "pedir") return "text-white/60";
  return "text-white/40";
}

export interface PropsListaPermisos {
  estado: EstadoAsistente;
  onEmpezar: () => void;
  onOmitir: () => void;
  onOmitirTodo: () => void;
  onPedir: (d: DefPermiso) => void;
  onCerrar: () => void;
}

export function ListaPermisos({ estado, onEmpezar, onOmitir, onOmitirTodo, onPedir, onCerrar }: PropsListaPermisos) {
  const actual = permisoActual(estado);
  const esperando = estado.esperando !== null;
  const porPedir = estado.cola.length - estado.indice;
  const accionActual = actual ? accionEn(estado, actual) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Permisos de tu neurona"
      data-testid="asistente-permisos"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm ss-capa-modal"
    >
      <div className="flex w-[min(36rem,94vw)] flex-col ss-ventana-limite !overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/70 p-4 sm:p-5 text-white shadow-2xl backdrop-blur-xl">
        <header className="flex shrink-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14]">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Permisos de tu neurona</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-white/60">
              {NOMBRE_SISTEMA[estado.sistema ?? ""] ?? "Este sistema"}: lo que StarSeed OS necesita, para qué y cómo está ahora. Se piden de uno en uno; lo que omitas
              no se vuelve a preguntar solo y lo retomas aquí desde los ajustes de la neurona.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={esperando}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" data-testid="carril-permisos">
          {ORDEN_GRUPOS.map((g) => {
            const items = estado.lista.filter((d) => d.grupo === g);
            if (!items.length) return null;
            return (
              <section key={g} className="mt-3 first:mt-0" aria-label={TITULO_GRUPO[g]} data-testid={`grupo-${g}`}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{TITULO_GRUPO[g]}</h3>
                <ul className="space-y-1.5">
                  {items.map((d) => {
                    const a = accionEn(estado, d);
                    const esActual = actual?.id === d.id;
                    const espera = estado.esperando === d.id;
                    const r = estado.resultados[d.id];
                    const puedeBoton = estado.fase === "resumen" && (a === "pedir" || a === "abrir-ajustes");
                    return (
                      <li
                        key={d.id}
                        data-testid={`permiso-${d.id}`}
                        data-accion={a}
                        className={`flex flex-wrap items-start gap-x-2.5 gap-y-1.5 rounded-xl border px-3 py-2 text-xs ${esActual ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 bg-white/[0.02]"}`}
                      >
                        <span className="mt-0.5 shrink-0">
                          <Icono a={a} esperando={espera} />
                        </span>
                        <span className="min-w-0 flex-1 basis-48 break-words">
                          <span className="font-medium text-white/90">
                            {d.titulo}
                            {d.opcional && a !== "mas-adelante" && <span className="ml-1.5 text-[10px] font-normal text-white/40">opcional</span>}
                          </span>
                          <span className="block leading-relaxed text-white/55">{d.porQue}</span>
                          {d.nota && <span className="block text-[11px] leading-relaxed text-white/40">{d.nota}</span>}
                          <span className={`block ${colorEstado(a)}`} data-testid={`estado-${d.id}`}>
                            {textoEstado(d, estado.estados[d.id], a)}
                            {r && a !== "listo" && r !== "concedido" ? ` · ${textoResultado(r)}` : ""}
                          </span>
                        </span>
                        {puedeBoton && (
                          <button
                            type="button"
                            disabled={esperando}
                            onClick={() => onPedir(d)}
                            className="ml-auto min-h-9 shrink-0 cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/10 px-3 py-1.5 text-[11px] font-medium text-[#39FF14] hover:bg-[#39FF14]/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {textoBoton(d, a)}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {esperando && (
          <p role="status" className="mt-3 shrink-0 text-xs text-[#39FF14]/90">
            Esperando al sistema… Si se abrió Ajustes, actívalo allí y vuelve: lo notamos solos. Si no ves el aviso, mira detrás de esta ventana.
          </p>
        )}

        <footer className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
          {estado.fase === "presentacion" && (
            <>
              <span className="mr-auto text-[11px] text-white/45">{porPedir === 1 ? "1 permiso por pedir" : `${porPedir} permisos por pedir`}</span>
              <button type="button" onClick={onOmitirTodo} className="min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
                Ahora no
              </button>
              <button type="button" onClick={onEmpezar} className="min-h-9 cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25">
                Empezar
              </button>
            </>
          )}
          {estado.fase === "pidiendo" && actual && accionActual && (
            <>
              <button type="button" disabled={esperando} onClick={onOmitirTodo} className="min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                Omitir todo
              </button>
              <button type="button" disabled={esperando} onClick={onOmitir} className="min-h-9 cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                Omitir este
              </button>
              <button
                type="button"
                disabled={esperando}
                onClick={() => onPedir(actual)}
                data-testid="boton-pedir-actual"
                className="min-h-9 max-w-full cursor-pointer break-words rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {accionActual === "abrir-ajustes" ? `Abrir Ajustes: ${actual.titulo}` : `${textoBoton(actual, accionActual)} ${actual.titulo}`}
              </button>
            </>
          )}
          {estado.fase === "resumen" && (
            <button type="button" onClick={onCerrar} disabled={esperando} className="min-h-9 cursor-pointer rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/15 px-3.5 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/25 disabled:opacity-40">
              Listo
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
