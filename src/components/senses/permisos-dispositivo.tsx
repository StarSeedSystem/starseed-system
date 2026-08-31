"use client";

/**
 * PermisosDispositivo (Adenda 192) — panel y botón REUTILIZABLES de permisos.
 * ----------------------------------------------------------------------------
 * «Cuando falten accesos a funciones del dispositivo se deben poder solicitar
 * desde Ajustes, desde los Sentidos de Astraura o desde cada área donde se
 * usan.» Este módulo es esa pieza única:
 *
 *   · <PermisosDispositivoPanel/> — lista con estado VIVO (permissions.query +
 *     onchange + evento starseed:permiso), botón «Permitir» con el gesto del
 *     usuario, y AYUDA accionable por navegador/SO cuando está bloqueado.
 *     Montado en: Bienvenida (paso Permisos), Sentidos (SensesPanel) y Ajustes.
 *   · <BotonPermiso/> — chip inline para CADA ÁREA que necesite un acceso
 *     (voz→micrófono, avisos→notificaciones, visión→cámara…): invisible si ya
 *     está concedido; si falta, lo pide ahí mismo con un botón pequeño.
 *   · Banner de entorno: visor embebido (Claude/Electron/Tauri) con «Abrir en
 *     tu navegador», y aviso de origen http:// no seguro.
 *
 * Honesto: la web solo puede DISPARAR el diálogo del navegador; si el sitio
 * quedó bloqueado o el SO bloquea al navegador, aquí se explica el camino real.
 */

import { useCallback, useEffect, useState } from "react";
import { Mic, Bell, Camera, MapPin, FolderOpen, HardDrive, ExternalLink, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  requestDevicePermission,
  estadoPermiso,
  suscribirPermiso,
  entornoPermisos,
  ayudaPermiso,
  abrirEnNavegadorSistema,
  NOMBRE_PERMISO,
  type PermisoDispositivo,
  type EstadoPermisoDispositivo,
  type EntornoPermisos,
} from "@/lib/aurora/senses/request-permission";
import { FilaCarpetas } from "@/components/senses/carpetas-vinculadas-card";

// ── Catálogo de permisos visibles en el panel ────────────────────────────────

export interface PermisoUI {
  id: PermisoDispositivo;
  label: string;
  desc: string;
  rec: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

export const PERMISOS_UI: PermisoUI[] = [
  { id: "microfono", label: "Micrófono", desc: "Hablar con Astraura y Aurora por voz.", rec: true, Icon: Mic },
  { id: "notificaciones", label: "Notificaciones", desc: "Avisos de la red, mensajes y agentes.", rec: true, Icon: Bell },
  { id: "camara", label: "Cámara", desc: "Videollamadas y visión de Aurora (opcional).", rec: false, Icon: Camera },
  { id: "ubicacion", label: "Ubicación", desc: "Funciones locales y clima (opcional).", rec: false, Icon: MapPin },
  // (Adenda 193) «Archivos» era una sola carpeta y sin rastro. Ahora son
  // CARPETAS: varias del dispositivo y almacenamientos externos, que el paso de
  // Cerebros vincula solo al cerebro principal. Su fila se pinta aparte.
  { id: "archivos", label: "Carpetas y almacenamientos", desc: "Vincula varias carpetas de este equipo y servicios como Google Drive.", rec: false, Icon: FolderOpen },
  { id: "almacenamiento", label: "Almacenamiento persistente", desc: "Que el navegador no borre tus datos locales (opcional).", rec: false, Icon: HardDrive },
];

// ── Hook de estado vivo por permiso ──────────────────────────────────────────

export function usePermisoDispositivo(permiso: PermisoDispositivo) {
  const [estado, setEstado] = useState<EstadoPermisoDispositivo | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void estadoPermiso(permiso).then((s) => { if (vivo) setEstado(s); });
    const off = suscribirPermiso(permiso, (s) => { if (vivo) setEstado(s); });
    return () => { vivo = false; off(); };
  }, [permiso]);

  const pedir = useCallback(async () => {
    setOcupado(true);
    setMotivo(null);
    try {
      const r = await requestDevicePermission(permiso);
      if (r.motivo) setMotivo(r.motivo);
      // Estado canónico tras la petición (para navegadores sin onchange).
      setEstado(await estadoPermiso(permiso));
      if (r.concedido) setEstado("granted");
      return r;
    } finally {
      setOcupado(false);
    }
  }, [permiso]);

  return { estado, motivo, ocupado, pedir };
}

// ── Banner de entorno (visor embebido / origen no seguro) ────────────────────

export function BannerEntornoPermisos({ className }: { className?: string }) {
  const [ent, setEnt] = useState<EntornoPermisos | null>(null);
  useEffect(() => { try { setEnt(entornoPermisos()); } catch { setEnt(null); } }, []);
  if (!ent || (!ent.visor && ent.origenSeguro)) return null;
  return (
    <div className={cn("rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-100/90", className)}>
      <p className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
        <span>
          {ent.visor
            ? <>Estás en {ent.visor}: este medio no muestra los diálogos de permiso del sistema. Concede los accesos desde tu navegador — tu cuenta y su configuración se sincronizan solas.</>
            : <>Estás en un origen NO seguro (http://). El navegador solo expone micrófono/cámara en HTTPS o en localhost.</>}
        </span>
      </p>
      {ent.visor && (
        <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-[11px]" onClick={() => abrirEnNavegadorSistema()}>
          <ExternalLink className="h-3 w-3" aria-hidden /> Abrir en tu navegador
        </Button>
      )}
    </div>
  );
}

// ── Chip de estado + fila de permiso ─────────────────────────────────────────

function ChipEstado({ estado }: { estado: EstadoPermisoDispositivo | null }) {
  if (estado === "granted") return <span className="text-[10px] text-emerald-300">concedido ✓</span>;
  if (estado === "denied") return <span className="text-[10px] text-amber-300">bloqueado por el navegador</span>;
  if (estado === "prompt") return <span className="text-[10px] text-cyan-200/80">por pedir — el navegador preguntará</span>;
  if (estado === "unsupported") return <span className="text-[10px] text-slate-400">no disponible en este medio</span>;
  return <span className="text-[10px] text-slate-500">consultando…</span>;
}

export function FilaPermiso({ p }: { p: PermisoUI }) {
  const { estado, motivo, ocupado, pedir } = usePermisoDispositivo(p.id);
  const ayuda = estado === "denied" || estado === "unsupported" ? ayudaPermiso(p.id, estado) : null;
  const { Icon } = p;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
          <Icon className="h-4 w-4 text-cyan-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {p.label}
            {p.rec && <span className="rounded-full bg-cyan-400/15 px-1.5 py-px text-[9px] uppercase tracking-wide text-cyan-200">recomendado</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{p.desc} <ChipEstado estado={estado} /></span>
        </span>
        <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={() => void pedir()} disabled={ocupado}>
          {ocupado ? "Pidiendo…" : estado === "granted" ? "Volver a pedir" : "Permitir"}
        </Button>
      </div>
      {(ayuda || motivo) && (
        <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] leading-snug text-white/70">
          {motivo && <span className="text-amber-200/90">({motivo}) </span>}{ayuda}
        </p>
      )}
    </div>
  );
}

// ── Panel completo (Bienvenida · Ajustes · Sentidos) ─────────────────────────

export function PermisosDispositivoPanel({
  ids,
  className,
}: {
  /** Subconjunto de permisos a mostrar; por defecto, todo el catálogo. */
  ids?: PermisoDispositivo[];
  className?: string;
}) {
  const lista = ids ? PERMISOS_UI.filter((p) => ids.includes(p.id)) : PERMISOS_UI;
  return (
    <div className={cn("space-y-2", className)}>
      <BannerEntornoPermisos />
      {lista.map((p) => (p.id === "archivos"
        ? <FilaCarpetas key={p.id} p={p} />
        : <FilaPermiso key={p.id} p={p} />))}
    </div>
  );
}

// ── Botón inline por ÁREA de uso ─────────────────────────────────────────────
// Invisible cuando el permiso ya está concedido; si falta, lo pide ahí mismo.

export function BotonPermiso({
  permiso,
  etiqueta,
  className,
}: {
  permiso: PermisoDispositivo;
  etiqueta?: string;
  className?: string;
}) {
  const { estado, ocupado, pedir } = usePermisoDispositivo(permiso);
  if (estado === null || estado === "granted") return null;
  const nombre = etiqueta ?? NOMBRE_PERMISO[permiso].toLowerCase();
  const ayuda = estado === "denied" || estado === "unsupported" ? ayudaPermiso(permiso, estado) : null;
  return (
    <div className={cn("space-y-1", className)}>
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => void pedir()} disabled={ocupado}>
        <ShieldAlert className="h-3 w-3 text-amber-300" aria-hidden />
        {ocupado ? "Pidiendo…" : `Permitir ${nombre}`}
      </Button>
      {ayuda && <p className="max-w-prose text-[10px] leading-snug text-white/55">{ayuda}</p>}
    </div>
  );
}

export default PermisosDispositivoPanel;
