"use client";

/*
 * PanelPermisosLinux — «Preparar este Linux» dentro de la lista de permisos de la neurona (LNX1118WD).
 * Mide lo que el nodo necesita (grupos, /dev/uinput, Bluetooth, polkit y GStreamer) y ofrece dejarlo
 * listo con el guion que la app lleva dentro, lanzado con pkexec: el diálogo del sistema es el permiso.
 * Nada se ejecuta sin que la persona acepte ese diálogo; después hay que cerrar sesión. Qué falta se
 * decide en Rust (`permisos_sistema.rs`, probado allí); aquí solo se pinta, con el cristal del OS.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Monitor, ShieldCheck } from "lucide-react";
import { puenteNativo } from "@/lib/nativa/puente";

/** Lo que la lista necesita de Rust (una app anterior no trae `linux`). */
export interface EstadoLinux {
  preparado: boolean;
  /** El interruptor «sin reposo» ya está puesto en este equipo. */
  sinReposo: boolean;
  /** Qué arregla «Preparar este Linux», en el orden del guion. */
  pendiente: string[];
}

interface Respuesta {
  plataforma?: string;
  linux?: Record<string, unknown> | null;
}

/** Normaliza la respuesta nativa. `null` si esta app no es Linux: no hay nada que preparar aquí. Pura. */
export function normalizarLinux(r: Respuesta | null | undefined): EstadoLinux | null {
  if (!r || typeof r.plataforma !== "string" || r.plataforma.toLowerCase() !== "linux") return null;
  const l = r.linux;
  const pendiente = l && Array.isArray(l.pendiente) ? l.pendiente.filter((x): x is string => typeof x === "string") : [];
  return { preparado: l?.preparado === true, sinReposo: l?.sin_reposo === true, pendiente };
}

export interface PropsPanelLinux {
  /** La plataforma, si la lista ya la leyó. Evita el primer viaje al nativo. */
  plataforma?: string;
  /** Avisa al terminar para que la lista refresque lo que sepa leer. */
  onCambio?: () => void;
}

type Fase = "cargando" | "listo" | "preparando" | "aviso" | "error" | "solo-nativa";

export function PanelPermisosLinux({ plataforma, onCambio }: PropsPanelLinux) {
  const [estado, setEstado] = useState<EstadoLinux | null>(null);
  const [fase, setFase] = useState<Fase>("cargando");
  const [mensaje, setMensaje] = useState("");
  const [sinReposo, setSinReposo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [otroSistema, setOtroSistema] = useState(false);
  const puente = useMemo(() => puenteNativo(), []);
  const visible = plataforma === undefined || plataforma.toLowerCase() === "linux";

  const cargar = useCallback(async () => {
    if (!puente.disponible) return setFase("solo-nativa");
    const r = await puente.llamar<Respuesta>("permisos_sistema_estado");
    if (!r.ok) {
      setFase("error");
      setMensaje(r.motivo);
      return;
    }
    const normal = normalizarLinux(r.valor);
    setOtroSistema(normal === null);
    setEstado(normal);
    setSinReposo(normal?.sinReposo === true);
    setFase("listo");
    setMensaje("");
  }, [puente]);

  useEffect(() => {
    if (visible) void cargar();
  }, [visible, cargar]);

  async function pedir(id: "preparar-linux" | "sin-reposo" | "con-reposo") {
    if (ocupado) return;
    setOcupado(true);
    if (id === "preparar-linux") setFase("preparando");
    setMensaje("");
    const r = await puente.llamar<boolean>("permisos_sistema_pedir", { id });
    setOcupado(false);
    if (!r.ok) {
      setFase("error");
      setMensaje(r.motivo);
      return;
    }
    if (!r.valor) {
      setFase("aviso");
      setMensaje("No se cambió nada: el diálogo se cerró sin aceptar.");
      return;
    }
    if (id !== "preparar-linux") setSinReposo(id === "sin-reposo");
    setFase("aviso");
    setMensaje(id === "preparar-linux" ? "Hecho. Cierra sesión y vuelve a entrar para que los grupos entren en vigor." : "");
    onCambio?.();
    await cargar();
  }

  if (!visible || otroSistema) return null;
  const pendientes = estado?.pendiente ?? [];
  const listo = fase === "listo" && pendientes.length === 0;

  return (
    <section aria-label="Preparar este Linux" data-testid="panel-permisos-linux" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white backdrop-blur-xl">
      <header className="flex items-start gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14]">
          {listo ? <Check className="size-5" /> : <ShieldCheck className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Preparar este Linux</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-white/60">Grupos del sistema, /dev/uinput, Bluetooth, red y GStreamer: lo que la neurona necesita aquí. Se aplica con el diálogo del sistema y después hay que cerrar sesión.</p>
        </div>
      </header>

      {fase === "solo-nativa" && <p className="mt-3 text-xs text-white/55">Solo en la app nativa de StarSeed OS.</p>}
      {fase === "cargando" && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-white/55"><Loader2 className="size-4 animate-spin" aria-hidden /> Midiendo este equipo…</p>
      )}
      {fase !== "cargando" && fase !== "solo-nativa" && estado && (
        <ul className="mt-3 space-y-1.5">
          {pendientes.length === 0 && <li className="flex items-start gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-xs text-emerald-200/90"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /> Este Linux ya está preparado como nodo.</li>}
          {pendientes.map((p) => (
            <li key={p} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/75"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden /> <span className="break-words">{p}</span></li>
          ))}
        </ul>
      )}
      {(fase === "aviso" || fase === "error") && mensaje && <p role="status" className="mt-2 text-xs leading-relaxed text-white/70">{mensaje}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado || fase === "solo-nativa"} onClick={() => void pedir("preparar-linux")} className="min-h-11 cursor-pointer rounded-xl border border-[#39FF14]/40 bg-[#39FF14]/10 px-4 text-xs font-medium text-[#39FF14] transition-colors hover:bg-[#39FF14]/20 disabled:cursor-not-allowed disabled:opacity-40">
          {fase === "preparando" ? "Esperando al sistema…" : "Preparar este Linux"}
        </button>
        <button type="button" role="switch" aria-checked={sinReposo} disabled={ocupado} onClick={() => void pedir(sinReposo ? "con-reposo" : "sin-reposo")} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-xs text-white/80 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40">
          <Monitor className="size-4" aria-hidden />
          Neurona nodo: no apagar pantalla ni bloquear
          <span aria-hidden className={`ml-1 inline-flex h-5 w-9 items-center rounded-full border ${sinReposo ? "border-[#39FF14]/50 bg-[#39FF14]/25" : "border-white/20 bg-white/10"}`}>
            <span className={`size-3.5 rounded-full bg-white transition-transform ${sinReposo ? "translate-x-4" : "translate-x-0.5"}`} />
          </span>
        </button>
        <span className="text-[11px] text-white/35">Apagado por defecto</span>
      </div>
    </section>
  );
}
