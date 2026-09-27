"use client";

/**
 * MallaNeuronasPanel — «Dispositivos de tu malla» + «Neuronas cercanas de
 * otras cuentas» (Ola 366). Lee el estado que ya publica el motor global
 * (`useMallaNeuronasEstado`, montado UNA vez por `MallaNeuronasMount`) — este
 * panel es solo lectura, no arranca ningún poll ni mesh por su cuenta.
 *
 * Mobile-first (390 px), iconos lucide, cursor-pointer, sin emojis.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Laptop,
  Monitor,
  RadioTower,
  Server,
  Smartphone,
  Tablet,
  Wifi,
  Loader2,
  XCircle,
  Radar,
  Brain,
  Link2,
  UserPlus,
  Check,
  X,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  useMallaNeuronasEstado,
  type DispositivoMallaRow,
  type NeuronaCercanaRow,
} from "@/lib/network/malla-neuronas";
import type { NeuronKind } from "@/lib/neurons/neurons";
import { useTransferenciasArchivo } from "@/lib/network/archivos-malla";
import { etiquetaRuta } from "@/lib/network/estadisticas-enlace";
import { agruparDispositivos, type Grupo } from "@/lib/network/agrupar-dispositivos";
import { EnviarArchivoBoton, TransferenciasArchivoLista } from "@/components/network/transferencias-archivo-panel";
import { findSource } from "@/ai/astraura/free-catalog";

/** Máximo de chips de fuente antes de agrupar el resto en un "+N" (Ola 368). */
const MAX_CHIPS_FUENTES = 4;

/** Etiqueta corta de una fuente del catálogo (o el id crudo si no se encuentra). */
function etiquetaFuente(id: string): string {
  return findSource(id)?.label ?? id;
}

/** Chips "fuentesServibles" de un dispositivo: como mucho 4 + "+N" (Ola 368). */
function FuentesChips({ fuentes }: { fuentes: string[] }) {
  if (!fuentes.length) return null;
  const visibles = fuentes.slice(0, MAX_CHIPS_FUENTES);
  const resto = fuentes.length - visibles.length;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visibles.map((id) => (
        <Badge key={id} variant="outline" className="border-sky-400/30 text-[9px] text-sky-200/90">
          {etiquetaFuente(id)}
        </Badge>
      ))}
      {resto > 0 && (
        <Badge variant="outline" className="border-foreground/15 text-[9px] text-foreground/50" title={fuentes.slice(MAX_CHIPS_FUENTES).map(etiquetaFuente).join(", ")}>
          +{resto}
        </Badge>
      )}
    </div>
  );
}
import {
  useVinculos,
  useVinculosPeers,
  solicitarVinculo,
  aceptarVinculo,
  rechazarVinculo,
  revocarVinculo,
  refrescarVinculosAhora,
  PERMISOS_VACIOS,
  type PermisosVinculo,
  type VinculoRow,
  type PeerVinculo,
} from "@/lib/network/vinculos-entre-cuentas";

function iconoTipo(tipo: NeuronKind) {
  switch (tipo) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    case "laptop":
      return Laptop;
    case "server":
      return Server;
    case "desktop":
      return Monitor;
    default:
      return Monitor;
  }
}

function timeAgo(ms: number): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

/** Identificador corto y anónimo para distinguir filas en la lista (nunca el owner_id). */
function idCorto(id: string): string {
  return id ? id.slice(0, 6) : "——————";
}

/* ------------------------------------------------------------------ */
/* Vínculo entre cuentas (Ola 370) — diálogos de permisos + solicitud  */
/* ------------------------------------------------------------------ */

function PermisosCheckboxes({
  permisos,
  onChange,
  idPrefix,
}: {
  permisos: PermisosVinculo;
  onChange: (next: PermisosVinculo) => void;
  idPrefix: string;
}) {
  const filas: Array<{ clave: keyof PermisosVinculo; etiqueta: string; detalle: string }> = [
    { clave: "ia", etiqueta: "IA", detalle: "relevar turnos de Astraura entre vuestras neuronas" },
    { clave: "archivos", etiqueta: "Archivos", detalle: "transferencia de archivos directa entre dispositivos" },
    { clave: "capacidades", etiqueta: "Capacidades", detalle: "ver qué puede servir cada neurona (RAM, backend local…)" },
  ];
  return (
    <div className="space-y-2">
      {filas.map((f) => (
        <label key={f.clave} htmlFor={`${idPrefix}-${f.clave}`} className="flex cursor-pointer items-start gap-2">
          <Checkbox
            id={`${idPrefix}-${f.clave}`}
            checked={permisos[f.clave]}
            onCheckedChange={(v) => onChange({ ...permisos, [f.clave]: v === true })}
            className="mt-0.5"
          />
          <span className="text-xs text-foreground/80">
            <span className="font-medium text-foreground">{f.etiqueta}</span>
            <span className="text-foreground/45"> — {f.detalle}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function SolicitarVinculoDialog({
  open,
  onOpenChange,
  etiqueta,
  syncId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  etiqueta: string;
  syncId: string;
}) {
  const [mensaje, setMensaje] = useState("");
  const [permisos, setPermisos] = useState<PermisosVinculo>(PERMISOS_VACIOS);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    const res = await solicitarVinculo(syncId, mensaje, permisos);
    setEnviando(false);
    toast(res.detail);
    if (res.ok) {
      refrescarVinculosAhora();
      onOpenChange(false);
      setMensaje("");
      setPermisos(PERMISOS_VACIOS);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Solicitar vínculo con {etiqueta}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-foreground/50">
            Se le pedirá consentimiento explícito. Solo verá tu solicitud y los permisos que marques abajo — nada se
            comparte hasta que acepte.
          </p>
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value.slice(0, 280))}
            placeholder="Mensaje opcional (máx. 280 caracteres)"
            className="min-h-[64px] text-xs"
          />
          <PermisosCheckboxes permisos={permisos} onChange={setPermisos} idPrefix="solicitar" />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => void enviar()}
            className="cursor-pointer rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AceptarVinculoDialog({
  vinculo,
  open,
  onOpenChange,
}: {
  vinculo: VinculoRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [permisos, setPermisos] = useState<PermisosVinculo>(PERMISOS_VACIOS);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    if (!vinculo) return;
    setEnviando(true);
    const res = await aceptarVinculo(vinculo.id, permisos);
    setEnviando(false);
    toast(res.detail);
    if (res.ok) {
      refrescarVinculosAhora();
      onOpenChange(false);
      setPermisos(PERMISOS_VACIOS);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Aceptar vínculo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {vinculo?.mensaje && (
            <p className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2 text-[11px] text-foreground/70">
              «{vinculo.mensaje}»
            </p>
          )}
          <p className="text-[11px] leading-snug text-foreground/50">
            Elige qué le permites a este vínculo (puedes revocarlo cuando quieras):
          </p>
          <PermisosCheckboxes permisos={permisos} onChange={setPermisos} idPrefix="aceptar" />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => void confirmar()}
            className="cursor-pointer rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-50"
          >
            {enviando ? "Aceptando…" : "Aceptar vínculo"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnlaceBadge({ enlace }: { enlace: DispositivoMallaRow["enlace"] }) {
  if (enlace.estado === "conectado") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400/50 text-[9px] text-emerald-300">
        <Wifi className="h-3 w-3" /> conectado{typeof enlace.latenciaMs === "number" ? ` · ${enlace.latenciaMs} ms` : ""}
        {enlace.ruta ? ` · ${etiquetaRuta(enlace.ruta.clase)}` : ""}
      </Badge>
    );
  }
  if (enlace.estado === "conectando") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-400/40 text-[9px] text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" /> conectando
      </Badge>
    );
  }
  if (enlace.estado === "fallido") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-red-400/40 text-[9px] text-red-300"
        title={enlace.motivo}
      >
        <XCircle className="h-3 w-3" /> fallido
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] text-foreground/45">
      sin vínculo
    </Badge>
  );
}

function DispositivoRow({ d }: { d: DispositivoMallaRow }) {
  const Icon = iconoTipo(d.tipo);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border p-2.5",
        d.esEsteDispositivo
          ? "border-sky-400/40 bg-sky-400/[0.06]"
          : d.online
            ? "border-foreground/10 bg-foreground/[0.03]"
            : "border-foreground/10 bg-foreground/[0.015] opacity-60",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/70">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{d.nombre}</span>
          {d.esEsteDispositivo && (
            <Badge variant="outline" className="border-sky-400/40 text-[9px] text-sky-300">
              este dispositivo
            </Badge>
          )}
          {!d.esEsteDispositivo && <EnlaceBadge enlace={d.enlace} />}
          {!d.esEsteDispositivo && d.online && d.syncDeviceId && d.enlace.estado === "conectado" && (
            <EnviarArchivoBoton deviceId={d.syncDeviceId} etiqueta={d.nombre} />
          )}
          <Badge
            variant="outline"
            className={cn("text-[9px]", d.online ? "border-emerald-400/30 text-emerald-300" : "text-foreground/40")}
          >
            {d.online ? "en línea" : "desconectada"}
          </Badge>
          {d.ficha?.sirveAstraura && (
            <Badge
              variant="outline"
              className="gap-1 border-violet-400/40 text-[9px] text-violet-300"
              title="Puede relayar Astraura 1.58 a otras neuronas de tu malla por WebRTC (sin túnel)"
            >
              <Brain className="h-3 w-3" />
              Sirve Astraura 1.58{typeof d.ficha.astrauraLatenciaMs === "number" ? ` · ${d.ficha.astrauraLatenciaMs} ms` : ""}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground/45">
          <span className="truncate">{d.plataforma}</span>
          {d.ficha && (
            <>
              <span>· {d.ficha.ramClase}</span>
              <span>· v{d.ficha.versionOS}</span>
              {d.ficha.backendLocal && <span className="text-emerald-300/80">· backend 1.58 local</span>}
            </>
          )}
        </div>
        {!d.esEsteDispositivo && <FuentesChips fuentes={d.ficha?.fuentesServibles ?? []} />}
      </div>
    </div>
  );
}

/** Tarjeta de un equipo: una por grupo; si hay varias instalaciones, se cuentan y se listan compactas. */
function EquipoCard({ grupo }: { grupo: Grupo }) {
  const multiple = grupo.filas.length > 1;
  return (
    <div className="space-y-1">
      {multiple && (
        <div className="flex items-center gap-2 px-0.5">
          <span className="truncate text-[11px] font-medium text-foreground/70">{grupo.titulo}</span>
          <Badge variant="outline" className="border-foreground/15 text-[9px] text-foreground/50">
            {grupo.filas.length} instalaciones
          </Badge>
        </div>
      )}
      {grupo.filas.map((d) => (
        <DispositivoRow key={d.neuronId} d={d} />
      ))}
    </div>
  );
}

function CercanaRow({ b }: { b: NeuronaCercanaRow }) {
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const puedeSolicitar = !!b.syncId;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/60">
        <Radar className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{b.etiqueta}</span>
          <Badge variant="outline" className="border-foreground/20 text-[9px] text-foreground/55">
            detectada
          </Badge>
        </div>
        <div className="mt-0.5 text-[10px] text-foreground/45">
          {timeAgo(b.detectadaHaceMs)}
          {b.ofreceInternetPublico && <span> · ofrece internet público</span>}
        </div>
      </div>
      <button
        type="button"
        disabled={!puedeSolicitar}
        onClick={() => setDialogAbierto(true)}
        title={puedeSolicitar ? "Pedir vincularte con esta neurona (con su consentimiento)" : "Esta neurona aún no publica una identidad de sincronización"}
        className={cn(
          "ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[10px]",
          puedeSolicitar
            ? "cursor-pointer border-sky-400/40 text-sky-200 hover:bg-sky-500/10"
            : "cursor-not-allowed border-foreground/15 text-foreground/35",
        )}
      >
        Solicitar vínculo
      </button>
      {puedeSolicitar && (
        <SolicitarVinculoDialog open={dialogAbierto} onOpenChange={setDialogAbierto} etiqueta={b.etiqueta} syncId={b.syncId!} />
      )}
    </div>
  );
}

function EstadoVinculoBadge({ estado }: { estado: VinculoRow["estado"] }) {
  if (estado === "pendiente") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-400/40 text-[9px] text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" /> pendiente
      </Badge>
    );
  }
  if (estado === "rechazado") {
    return (
      <Badge variant="outline" className="border-red-400/40 text-[9px] text-red-300">
        rechazado
      </Badge>
    );
  }
  if (estado === "revocado") {
    return (
      <Badge variant="outline" className="text-[9px] text-foreground/40">
        revocado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-400/40 text-[9px] text-emerald-300">
      activo
    </Badge>
  );
}

function ResumenPermisos({ permisos }: { permisos: PermisosVinculo }) {
  const activos = ([["ia", "IA"], ["archivos", "archivos"], ["capacidades", "capacidades"]] as const)
    .filter(([clave]) => permisos[clave])
    .map(([, etiqueta]) => etiqueta);
  if (activos.length === 0) return <span className="text-foreground/35">sin permisos concedidos</span>;
  return <span>{activos.join(" · ")}</span>;
}

function VinculoEntranteCard({ v }: { v: VinculoRow }) {
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [rechazando, setRechazando] = useState(false);

  const rechazar = async () => {
    setRechazando(true);
    const res = await rechazarVinculo(v.id);
    setRechazando(false);
    toast(res.detail);
    if (res.ok) refrescarVinculosAhora();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/[0.06] p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-400/15 text-sky-200">
        <UserPlus className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">Neurona anónima · {idCorto(v.deDevice)} quiere vincularse contigo</div>
        {v.mensaje && <div className="mt-0.5 truncate text-[11px] text-foreground/55">«{v.mensaje}»</div>}
      </div>
      <div className="ml-auto flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => setDialogAbierto(true)}
          className="flex cursor-pointer items-center gap-1 rounded-full border border-emerald-400/40 px-2.5 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/10"
        >
          <Check className="h-3 w-3" /> Aceptar
        </button>
        <button
          type="button"
          disabled={rechazando}
          onClick={() => void rechazar()}
          className="flex cursor-pointer items-center gap-1 rounded-full border border-foreground/20 px-2.5 py-1 text-[10px] text-foreground/55 hover:bg-foreground/5 disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Rechazar
        </button>
      </div>
      <AceptarVinculoDialog vinculo={v} open={dialogAbierto} onOpenChange={setDialogAbierto} />
    </div>
  );
}

function VinculoRowItem({ v, peer }: { v: VinculoRow; peer?: PeerVinculo }) {
  const [revocando, setRevocando] = useState(false);
  const esSaliente = v.rol === "de";

  const revocar = async () => {
    setRevocando(true);
    const res = await revocarVinculo(v.id);
    setRevocando(false);
    toast(res.detail);
    if (res.ok) refrescarVinculosAhora();
  };

  const otroDevice = esSaliente ? v.aDevice : v.deDevice;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/60">
        <Link2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">Neurona anónima · {idCorto(otroDevice)}</span>
          <EstadoVinculoBadge estado={v.estado} />
          {peer?.canal === "conectado" && (
            <Badge variant="outline" className="gap-1 border-emerald-400/50 text-[9px] text-emerald-300">
              <Wifi className="h-3 w-3" /> conectado{typeof peer.latenciaMs === "number" ? ` · ${peer.latenciaMs} ms` : ""}
            </Badge>
          )}
          {peer?.canal === "conectando" && (
            <Badge variant="outline" className="gap-1 border-sky-400/40 text-[9px] text-sky-300">
              <Loader2 className="h-3 w-3 animate-spin" /> conectando
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-foreground/45">
          {esSaliente ? "solicitado por ti" : "recibido"} ·{" "}
          {v.estado === "aceptado" ? <ResumenPermisos permisos={v.permisos} /> : <span>en espera</span>}
        </div>
      </div>
      {(v.estado === "pendiente" || v.estado === "aceptado") && (
        <button
          type="button"
          disabled={revocando}
          onClick={() => void revocar()}
          className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-red-400/30 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          <XCircle className="h-3 w-3" /> {v.estado === "pendiente" && esSaliente ? "Cancelar" : "Revocar"}
        </button>
      )}
    </div>
  );
}

function VinculosSection() {
  const vinculos = useVinculos();
  const peers = useVinculosPeers();

  const entrantes = vinculos.filter((v) => v.rol === "a" && v.estado === "pendiente");
  const resto = vinculos.filter((v) => !(v.rol === "a" && v.estado === "pendiente"));
  const peerPorVinculo = new Map(peers.map((p) => [p.vinculoId, p]));

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-foreground/45">
        Vincula tu neurona con la de otra cuenta (no la tuya) con consentimiento explícito de ambos lados: podréis
        compartir IA, archivos o capacidades por un canal P2P directo, según lo que cada uno marque.
        <ShieldCheck className="ml-1 inline h-3 w-3 align-[-1px] text-emerald-300/70" /> Revocable en cualquier momento.
      </p>

      {entrantes.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-foreground/40">Solicitudes entrantes</span>
          {entrantes.map((v) => (
            <VinculoEntranteCard key={v.id} v={v} />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-foreground/40">Vínculos con otras cuentas</span>
        {resto.length === 0 ? (
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
            Ningún vínculo todavía. Solicita uno desde «Cercanas de otras cuentas».
          </div>
        ) : (
          resto.map((v) => <VinculoRowItem key={v.id} v={v} peer={peerPorVinculo.get(v.id)} />)
        )}
      </div>
    </div>
  );
}

export function MallaNeuronasPanel({ compact = false }: { compact?: boolean }) {
  const { misDispositivos, cercanas, loading } = useMallaNeuronasEstado();
  const transferencias = useTransferenciasArchivo();
  const vinculos = useVinculos();
  const [tab, setTab] = useState<"propios" | "cercanas" | "archivos" | "vinculos">("propios");
  const [verDesconectados, setVerDesconectados] = useState(false);

  const enLinea = misDispositivos.filter((d) => d.online).length;
  const solicitudesEntrantes = vinculos.filter((v) => v.rol === "a" && v.estado === "pendiente").length;
  const { activos, desconectados } = agruparDispositivos(misDispositivos);

  return (
    <div className={cn("space-y-3", compact ? "text-[12px]" : "text-sm")}>
      <div className="flex flex-wrap items-center gap-2">
        <RadioTower className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-semibold text-foreground">Dispositivos StarSeed</span>
        <Badge variant="outline" className="border-emerald-400/30 text-[9px] text-emerald-300">
          {enLinea} en línea
        </Badge>
      </div>
      <p className="text-[10px] leading-snug text-foreground/45">
        Se detectan y se vinculan solos (WebRTC, sin botón) en cuanto dos dispositivos de tu cuenta están en línea a la
        vez. Separado de la radio LoRa: esto no usa ningún hardware, solo tu cuenta como buzón de señalización.
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab("propios")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "propios"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Tu malla ({misDispositivos.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("cercanas")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "cercanas"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Cercanas de otras cuentas ({cercanas.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("archivos")}
          className={cn(
            "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "archivos"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          Archivos ({transferencias.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("vinculos")}
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200",
            tab === "vinculos"
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-foreground/10 bg-foreground/[0.03] text-foreground/55 hover:border-foreground/25",
          )}
        >
          <Link2 className="h-3 w-3" /> Vínculos ({vinculos.length})
          {solicitudesEntrantes > 0 && (
            <Badge variant="outline" className="border-amber-400/50 text-[8px] text-amber-300">
              {solicitudesEntrantes}
            </Badge>
          )}
        </button>
      </div>

      {tab === "archivos" ? (
        <TransferenciasArchivoLista />
      ) : tab === "propios" ? (
        <div className="space-y-1.5">
          {loading && misDispositivos.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Detectando tus dispositivos…
            </div>
          ) : misDispositivos.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Sin sesión, o aún no se ha registrado ninguna neurona en esta cuenta.
            </div>
          ) : (
            <>
              {activos.map((g) => (
                <EquipoCard key={g.clave} grupo={g} />
              ))}
              {desconectados.length > 0 && (
                <div className="rounded-xl border border-foreground/10">
                  <button
                    type="button"
                    onClick={() => setVerDesconectados((v) => !v)}
                    aria-expanded={verDesconectados}
                    className="flex w-full cursor-pointer items-center gap-2 p-2.5 text-left text-[11px] text-foreground/55 hover:bg-foreground/[0.03]"
                  >
                    {verDesconectados ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Desconectados ({desconectados.length})
                  </button>
                  {verDesconectados && (
                    <div className="space-y-1.5 border-t border-foreground/10 p-1.5">
                      {desconectados.map((g) => (
                        <EquipoCard key={g.clave} grupo={g} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === "cercanas" ? (
        <div className="space-y-1.5">
          {cercanas.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              Ninguna neurona de otra cuenta detectada por ahora (radar de faros, últimos minutos).
            </div>
          ) : (
            cercanas.map((b) => <CercanaRow key={b.deviceId} b={b} />)
          )}
        </div>
      ) : (
        <VinculosSection />
      )}
    </div>
  );
}

export default MallaNeuronasPanel;
