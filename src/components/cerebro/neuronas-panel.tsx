"use client";

/**
 * NeuronasPanel — pilar NEURONAS del Cerebro (SOP §6 y §6b · Adenda 63).
 *
 * Cada dispositivo conectado al perfil es una NEURONA: cerebro Y servidor de la
 * red personal del usuario. Este panel:
 *   · Lista las neuronas de la cuenta con PRESENCIA en tiempo real: canal
 *     Supabase presence `neurons:<userId>` (clave = id de neurona) + el
 *     heartbeat existente de `neuron_devices` (src/lib/neurons/neurons.ts)
 *     como respaldo cuando la presencia no está disponible.
 *   · Nombre editable, tipo autodetectado (userAgent), en línea/último visto,
 *     este-dispositivo destacado.
 *   · AJUSTES por neurona persistidos en `starseed.neurons.prefs.v1`
 *     (settingsFor/setNeuronSettings): solicitudes de archivos (respetado por
 *     FileRequestListener), control de pantalla por voz, escucha de fondo de
 *     Aurora, sincronización automática (permiso `sync` existente), rol
 *     (cerebro | servidor | ambos) y notas.
 *   · Acciones: renombrar, olvidar, "Solicitar archivo a esta neurona"
 *     (broadcast 'file-request' del canal de cuenta, mismo flujo que el
 *     selector universal de archivos).
 *   · CasaOS por neurona (SOP §6b): URL del panel, probar (HEAD no-cors 4s),
 *     abrir/embeber, guía de instalación, apps recomendadas y vínculo como
 *     servidor de memoria del cerebro activo (brain_servers + link "storage").
 *
 * SSR-safe y defensivo: sin sesión degrada a "solo este dispositivo"; ningún
 * fallo de red rompe la UI.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  ensureThisNeuron,
  listNeurons,
  removeNeuron,
  setNeuronName,
  setNeuronSettings,
  setPermission,
  settingsFor,
  summarizeNeurons,
  thisDeviceId,
  isHermesLinked,
  linkHermesToNeuron,
  setNeuronHermioneSync,
  neuronHermioneSyncEnabled,
  NEURON_EVENT,
  type Neuron,
  type NeuronKind,
  type NeuronRole,
  type NeuronSettings,
} from "@/lib/neurons/neurons";
import { useHermioneStatus } from "@/lib/aurora/hermione-autosync";
import { sendAccountBroadcast } from "@/lib/sync/realtime-sync";
import { deviceId as syncDeviceId } from "@/lib/sync/entity-state";
import { saveServer, linkServer } from "@/lib/brains/servers";
import {
  Monitor,
  Laptop,
  Smartphone,
  Tablet,
  Server,
  Cpu,
  Network,
  RefreshCw,
  Radio,
  Pencil,
  Check,
  Trash2,
  Loader2,
  FileDown,
  Send,
  HardDrive,
  ExternalLink,
  Link2,
  ChevronDown,
  PanelTop,
  Mic,
  MousePointerClick,
  FolderSync,
  StickyNote,
  Brain,
  Sparkles,
} from "lucide-react";

/* ─────────────────────────── Constantes de UI ─────────────────────────── */

const KIND_ICONS: Record<NeuronKind, typeof Monitor> = {
  desktop: Monitor,
  laptop: Laptop,
  mobile: Smartphone,
  tablet: Tablet,
  server: Server,
  other: Cpu,
};

const KIND_LABELS: Record<NeuronKind, string> = {
  desktop: "Escritorio",
  laptop: "Portátil",
  mobile: "Móvil",
  tablet: "Tableta",
  server: "Servidor",
  other: "Dispositivo",
};

const ROLES: { id: NeuronRole; label: string; hint: string }[] = [
  { id: "cerebro", label: "Cerebro", hint: "Cómputo y contexto (IA local, sentidos)" },
  { id: "servidor", label: "Servidor", hint: "Almacén y servicios (archivos, memorias)" },
  { id: "ambos", label: "Ambos", hint: "Cerebro + servidor (predeterminado)" },
];

/** Apps recomendadas de la App Store de CasaOS y su PARA QUÉ en StarSeed. */
const CASAOS_APPS: { name: string; why: string }[] = [
  { name: "Files", why: "Explorador de archivos del servidor: almacén directo para cerebros y memorias." },
  { name: "Nextcloud", why: "Nube personal completa: documentos, respaldo y sincronización soberana." },
  { name: "Syncthing", why: "Sincroniza folders de memorias entre neuronas sin nube central (P2P)." },
  { name: "Jellyfin", why: "Servidor multimedia: tu biblioteca de audio/vídeo servida a todas las neuronas." },
  { name: "Ollama", why: "Motor de IA local para Astraura: Aurora usa modelos abiertos desde esta neurona." },
  { name: "AdGuard Home", why: "Escudo de red: bloquea rastreadores y anuncios en toda tu red doméstica." },
];

const CASAOS_INSTALL_CMD = "curl -fsSL https://get.casaos.io | sudo bash";

const CASAOS_STEPS: string[] = [
  "En el dispositivo (Linux: Debian/Ubuntu, Raspberry Pi…), abre una terminal. CasaOS no corre en iOS/Android ni dentro del navegador: se instala EN el equipo.",
  `Ejecuta el instalador oficial: ${CASAOS_INSTALL_CMD}`,
  "Espera a que instale Docker y el panel (unos minutos). Al terminar mostrará la dirección de acceso.",
  "Abre http://<ip-del-dispositivo> (puerto 80 por defecto) desde cualquier neurona y crea tu cuenta local.",
  "Pega esa URL aquí y pulsa «Probar». Desde la App Store de CasaOS instala las apps recomendadas de abajo.",
];

/* ─────────────────────────── Utilidades ─────────────────────────── */

function timeAgo(iso?: string): string {
  if (!iso) return "sin registro";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 45_000) return "ahora mismo";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

/** Sonda CasaOS: HEAD con no-cors y timeout 4 s. Resolver (aunque sea opaco) ⇒ alcanzable. */
async function probeCasaOs(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

function normalizeCasaUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
}

/* ═══════════════════════════ Panel principal ═══════════════════════════ */

export default function NeuronasPanel({
  brainId,
  brainName,
}: {
  brainId?: string | null;
  brainName?: string;
}) {
  const [neurons, setNeurons] = useState<Neuron[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const [presenceOk, setPresenceOk] = useState(false);

  const refresh = useCallback(async () => {
    try {
      await ensureThisNeuron();
      const list = await listNeurons();
      setNeurons(list);
    } catch { /* defensivo: nunca romper el panel */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* Cambios locales (nombre/permisos/ajustes) → refresco con debounce. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 500);
    };
    window.addEventListener(NEURON_EVENT, onEvent);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(NEURON_EVENT, onEvent);
    };
  }, [refresh]);

  /* Refresco periódico suave del "último visto" (solo con pestaña visible). */
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    }, 90_000);
    return () => clearInterval(t);
  }, [refresh]);

  /* ── PRESENCIA en tiempo real: canal `neurons:<userId>` (clave = id de neurona) ── */
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        const me = thisDeviceId();
        if (!uid || !me || cancelled) return;
        channel = supabase.channel(`neurons:${uid}`, { config: { presence: { key: me } } });
        channel
          .on("presence", { event: "sync" }, () => {
            try {
              const state = channel?.presenceState() as Record<string, unknown[]> | undefined;
              if (!state) return;
              setLiveIds(new Set(Object.keys(state)));
              setPresenceOk(true);
            } catch { /* noop */ }
          })
          .subscribe((st: string) => {
            if (st === "SUBSCRIBED") {
              void channel?.track({ at: Date.now() }).catch(() => { /* noop */ });
            }
          });
      } catch { /* sin presencia: queda el heartbeat de neuron_devices */ }
    })();
    return () => {
      cancelled = true;
      try {
        if (channel) {
          void channel.untrack().catch(() => { /* noop */ });
          createClient().removeChannel(channel);
        }
      } catch { /* noop */ }
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.07] via-black/20 to-cyan-500/[0.05] p-4">
        <div className="flex items-start gap-2 flex-wrap">
          <Network className="w-5 h-5 text-emerald-300 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-emerald-50">Neuronas — tus dispositivos</h3>
            <p className="text-xs text-white/55 mt-1 leading-relaxed">
              Cada dispositivo conectado a tu perfil es una neurona: <strong>cerebro y servidor</strong> de tu
              sistema nervioso digital. Aquí las ves en vivo, ajustas sus permisos y declaras su servidor
              casero CasaOS para usarlas como almacén de memorias o motor de IA local.
            </p>
            <p className="text-[11px] text-white/40 mt-1.5">{summarizeNeurons(neurons)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <HermioneStatusBadge />
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] gap-1",
                presenceOk
                  ? "border-emerald-400/40 text-emerald-200 bg-emerald-500/10"
                  : "border-amber-400/30 text-amber-200/90 bg-amber-500/5",
              )}
            >
              <Radio className={cn("w-3 h-3", presenceOk && "animate-pulse")} />
              {presenceOk ? "Presencia en vivo" : "Latido cada minuto"}
            </Badge>
            <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              <span className="sr-only">Refrescar neuronas</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tarjetas ─────────────────────────────────────────── */}
      {loading && neurons.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-5 flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="w-4 h-4 animate-spin" /> Detectando este dispositivo (capacidades, IA local, batería)…
        </div>
      ) : neurons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-6 text-center">
          <Cpu className="w-8 h-8 text-white/25 mx-auto mb-2" />
          <p className="text-sm text-white/55">
            Aún no hay neuronas registradas. Inicia sesión para que este dispositivo se registre como la primera.
          </p>
        </div>
      ) : (
        neurons.map((n) => (
          <NeuronCard
            key={n.id}
            neuron={n}
            live={n.online || liveIds.has(n.id)}
            brainId={brainId ?? null}
            brainName={brainName}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

/* ═══════════════════════ Badge de estado de Hermione ═══════════════════════ */

/**
 * Badge simple y EXPORTABLE del estado del puente Hermione ("en línea / sin
 * neurona / reintentando / inactiva") + nº de mensajes en cola. Reutilizable en
 * cualquier superficie (cabecera del panel, barra de estado, etc.).
 */
export function HermioneStatusBadge({ className }: { className?: string }) {
  const { status, label, pending } = useHermioneStatus();
  const tone =
    status === "online"
      ? "border-fuchsia-400/40 text-fuchsia-200 bg-fuchsia-500/10"
      : status === "reintentando"
        ? "border-amber-400/40 text-amber-200 bg-amber-500/10"
        : status === "sin-neurona"
          ? "border-zinc-500/30 text-zinc-300 bg-zinc-500/10"
          : "border-white/10 text-white/40 bg-black/20";
  return (
    <Badge variant="outline" className={cn("text-[9px] gap-1", tone, className)} title={label}>
      <Sparkles className={cn("w-3 h-3", status === "online" && "animate-pulse")} />
      {label}
      {pending > 0 && <span className="ml-0.5 opacity-80">· {pending} en cola</span>}
    </Badge>
  );
}

/* ═══════════════════════════ Tarjeta de neurona ═══════════════════════════ */

function NeuronCard({
  neuron: n,
  live,
  brainId,
  brainName,
  onChanged,
}: {
  neuron: Neuron;
  live: boolean;
  brainId: string | null;
  brainName?: string;
  onChanged: () => void;
}) {
  const Icon = KIND_ICONS[n.kind] ?? Cpu;
  const [settings, setSettings] = useState<NeuronSettings>(() => settingsFor(n.id));
  const [syncOn, setSyncOn] = useState<boolean>(n.permissions?.sync ?? true);
  const [hermioneSync, setHermioneSyncState] = useState<boolean>(() => neuronHermioneSyncEnabled(n.capabilities));

  // Nombre editable
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(n.name);

  // Notas (autosave al salir del campo)
  const [notes, setNotes] = useState(settings.notes ?? "");

  // Solicitud de archivo
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [requesting, setRequesting] = useState(false);

  // Re-sincroniza estado local cuando cambia la neurona (evento/refresh).
  useEffect(() => {
    const s = settingsFor(n.id);
    setSettings(s);
    setNotes(s.notes ?? "");
    setSyncOn(n.permissions?.sync ?? true);
    setHermioneSyncState(neuronHermioneSyncEnabled(n.capabilities));
    setDraftName(n.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id, n.name, n.permissions?.sync, neuronHermioneSyncEnabled(n.capabilities)]);

  const patchSettings = (patch: Partial<NeuronSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      ...(patch.casaos ? { casaos: { ...(prev.casaos ?? {}), ...patch.casaos } } : {}),
    }));
    try { setNeuronSettings(n.id, patch); } catch { /* defensivo */ }
  };

  const commitName = () => {
    const name = draftName.trim();
    if (name && name !== n.name) {
      try { setNeuronName(n.id, name); } catch { /* */ }
      toast.success("Nombre de la neurona actualizado.");
      onChanged();
    }
    setEditing(false);
  };

  const forget = async () => {
    const ok = typeof window !== "undefined"
      ? window.confirm(`¿Olvidar «${n.name}»? Se quita del registro de tu cuenta (no borra nada en ese dispositivo).`)
      : false;
    if (!ok) return;
    const done = await removeNeuron(n.id);
    if (done) {
      toast.success("Neurona olvidada.");
      onChanged();
    } else {
      toast.error("No se pudo olvidar la neurona.");
    }
  };

  const sendFileRequest = async () => {
    setRequesting(true);
    try {
      await sendAccountBroadcast("file-request", {
        // Destino: deviceId de sync publicado en capacidades; si la neurona es
        // antigua y no lo publica aún, su id de neurona (el receptor acepta ambos).
        toDevice: n.capabilities?.syncDeviceId || n.id,
        fromDevice: syncDeviceId(),
        note: requestNote.trim() || undefined,
        at: Date.now(),
      });
      toast.success(`Solicitud enviada a «${n.name}». El archivo aparecerá en tus archivos al subirlo.`);
      setRequestOpen(false);
      setRequestNote("");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border bg-black/20 p-4 space-y-3",
        n.isThisDevice ? "border-emerald-400/30 ring-1 ring-emerald-400/15" : "border-white/10",
      )}
    >
      {/* ── Cabecera: icono + nombre + tipo + estado ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-black/30 border border-white/10 shrink-0">
          <Icon className="w-5 h-5 text-emerald-300" />
        </span>

        {editing ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditing(false); }}
              className="h-8 bg-background/60 border-white/10 text-sm"
              autoFocus
              maxLength={60}
            />
            <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={commitName}>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="sr-only">Guardar nombre</span>
            </Button>
          </div>
        ) : (
          <>
            <span className="text-sm font-semibold text-white/90 truncate max-w-[220px]">{n.name}</span>
            <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => { setDraftName(n.name); setEditing(true); }}>
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="sr-only">Renombrar neurona</span>
            </Button>
          </>
        )}

        <Badge variant="outline" className="text-[9px] border-white/15 text-white/55 bg-black/20">
          {KIND_LABELS[n.kind] ?? "Dispositivo"}
        </Badge>
        {n.isThisDevice && (
          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30 text-[9px]">Esta neurona</Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "text-[9px]",
            live
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full mr-1", live ? "bg-emerald-400 animate-pulse" : "bg-zinc-500")} />
          {live ? "En línea" : `Último visto ${timeAgo(n.last_seen_at)}`}
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          {!n.isThisDevice && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer h-7 gap-1.5 text-xs border-cyan-400/25 text-cyan-200 hover:bg-cyan-500/10"
                onClick={() => setRequestOpen((v) => !v)}
              >
                <FileDown className="w-3.5 h-3.5" /> Solicitar archivo
              </Button>
              <Button
                variant={isHermesLinked(n.capabilities) ? "ghost" : "outline"}
                size="sm"
                className={
                  isHermesLinked(n.capabilities)
                    ? "cursor-default h-7 gap-1.5 text-xs text-emerald-300/80"
                    : "cursor-pointer h-7 gap-1.5 text-xs border-fuchsia-400/30 text-fuchsia-200 hover:bg-fuchsia-500/10"
                }
                disabled={isHermesLinked(n.capabilities)}
                onClick={async () => {
                  const ok = await linkHermesToNeuron(n.id);
                  if (ok) { toast.success("Sincronización con Hermes activada"); window.dispatchEvent(new Event(NEURON_EVENT)); }
                  else toast.error("No se pudo vincular Hermes");
                }}
              >
                <Network className="w-3.5 h-3.5" />
                {isHermesLinked(n.capabilities) ? "Hermes vinculado" : "Sincronizar con Hermes"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer h-7 px-2 text-red-400/80 hover:text-red-300"
                onClick={() => void forget()}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="sr-only">Olvidar neurona</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Solicitar archivo (inline) ── */}
      {requestOpen && !n.isThisDevice && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3 space-y-2">
          <p className="text-[11px] text-white/55">
            La neurona mostrará un aviso para elegir/subir el archivo; quedará al instante en los archivos de tu cuenta.
            {settingsFor(n.id).fileRequests === false && (
              <span className="text-amber-300/90"> Aviso: esa neurona tiene las solicitudes de archivos desactivadas.</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !requesting) void sendFileRequest(); }}
              placeholder="¿Qué archivo necesitas? (opcional)"
              className="h-8 text-sm bg-black/30 border-white/10"
              maxLength={140}
            />
            <Button size="sm" className="cursor-pointer h-8 gap-1.5 shrink-0" disabled={requesting} onClick={() => void sendFileRequest()}>
              {requesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar
            </Button>
          </div>
        </div>
      )}

      {/* ── Ajustes por neurona ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SettingRow
          icon={FileDown}
          label="Solicitudes de archivos"
          hint="Aceptar «Solicitar archivo a esta neurona»"
          checked={settings.fileRequests !== false}
          onChange={(v) => patchSettings({ fileRequests: v })}
        />
        <SettingRow
          icon={MousePointerClick}
          label="Control de pantalla por voz"
          hint="Aurora puede manejar la pantalla al pedírselo"
          checked={settings.screenVoice !== false}
          onChange={(v) => patchSettings({ screenVoice: v })}
        />
        <SettingRow
          icon={Mic}
          label="Escucha de fondo de Aurora"
          hint="Solo efectiva con la app instalada (PWA)"
          checked={settings.auroraListening !== false}
          onChange={(v) => patchSettings({ auroraListening: v })}
        />
        <SettingRow
          icon={FolderSync}
          label="Sincronización automática"
          hint="Contexto, memorias y ajustes en vivo"
          checked={syncOn}
          onChange={(v) => {
            setSyncOn(v);
            try { setPermission(n.id, "sync", v); } catch { /* */ }
          }}
        />
        {isHermesLinked(n.capabilities) && (
          <SettingRow
            icon={Sparkles}
            label="Sincronizar chats de Hermione"
            hint="Usa esta neurona para los chats y memorias de Hermione"
            checked={hermioneSync}
            onChange={(v) => {
              setHermioneSyncState(v);
              void setNeuronHermioneSync(n.id, v).then((ok) => {
                if (ok) toast.success(v ? "Hermione sincroniza en esta neurona." : "Hermione ya no sincroniza en esta neurona.");
                else { setHermioneSyncState(!v); toast.error("No se pudo actualizar la sincronización de Hermione."); }
              });
            }}
          />
        )}
      </div>

      {/* ── Rol ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-white/50 inline-flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-emerald-300/80" /> Rol de la neurona:
        </span>
        <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
          {ROLES.map((r) => (
            <button
              key={r.id}
              title={r.hint}
              onClick={() => patchSettings({ role: r.id })}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors cursor-pointer",
                (settings.role ?? "ambos") === r.id
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-white/55 hover:bg-white/5",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Notas ── */}
      <div className="space-y-1">
        <label className="text-[11px] text-white/50 inline-flex items-center gap-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-300/80" /> Notas de esta neurona
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => { if ((settings.notes ?? "") !== notes) patchSettings({ notes }); }}
          placeholder="Dónde está, para qué la usas, recordatorios…"
          className="min-h-[52px] text-sm bg-black/30 border-white/10"
          maxLength={500}
        />
      </div>

      {/* ── CasaOS por neurona (SOP §6b) ── */}
      <CasaOsSection
        neuron={n}
        settings={settings}
        patchSettings={patchSettings}
        brainId={brainId}
        brainName={brainName}
      />
    </div>
  );
}

/* ─────────────────────────── Fila de ajuste ─────────────────────────── */

function SettingRow({
  icon: RowIcon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: typeof Monitor;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
      <div className="flex items-start gap-2 min-w-0">
        <RowIcon className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight text-white/85">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

/* ═══════════════════════ Subsección CasaOS ═══════════════════════ */

function CasaOsSection({
  neuron: n,
  settings,
  patchSettings,
  brainId,
  brainName,
}: {
  neuron: Neuron;
  settings: NeuronSettings;
  patchSettings: (patch: Partial<NeuronSettings>) => void;
  brainId: string | null;
  brainName?: string;
}) {
  const [open, setOpen] = useState<boolean>(!!settings.casaos?.enabled);
  const [url, setUrl] = useState<string>(settings.casaos?.url ?? "");
  const [probing, setProbing] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    setUrl(settings.casaos?.url ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id]);

  const saveUrl = () => {
    const normalized = normalizeCasaUrl(urlRef.current);
    if (normalized !== urlRef.current) setUrl(normalized);
    if ((settings.casaos?.url ?? "") !== normalized) {
      patchSettings({ casaos: { url: normalized } });
    }
  };

  const probe = async () => {
    const target = normalizeCasaUrl(url);
    if (!target) {
      toast.error("Escribe primero la URL del panel (http://ip:puerto).");
      return;
    }
    saveUrl();
    setProbing(true);
    setReachable(null);
    const ok = await probeCasaOs(target);
    setReachable(ok);
    setProbing(false);
    if (ok) toast.success("CasaOS alcanzable desde este dispositivo.");
    else toast.error("No se pudo alcanzar. ¿Está encendido y en la misma red?");
  };

  const openPanel = () => {
    const target = normalizeCasaUrl(url);
    if (!target) {
      toast.error("Configura primero la URL del panel.");
      return;
    }
    try { window.open(target, "_blank", "noopener,noreferrer"); } catch { /* */ }
  };

  /** Registra el CasaOS de esta neurona como servidor de memoria del cerebro. */
  const linkAsMemoryServer = async () => {
    const target = normalizeCasaUrl(url);
    if (!target) {
      toast.error("Configura primero la URL del panel.");
      return;
    }
    saveUrl();
    setLinking(true);
    try {
      const srv = await saveServer({
        name: `CasaOS · ${n.name}`,
        kind: "service",
        endpoint: target,
        config: { connector: "casaos", neuronId: n.id, note: "Servidor casero CasaOS de una neurona (Cerebro → Neuronas)." },
        status: reachable ? "conectado" : "pendiente",
      });
      if (!srv) {
        toast.error("No se pudo registrar el servidor. ¿Has iniciado sesión?");
        return;
      }
      if (brainId) {
        const link = await linkServer(brainId, srv.id, {
          role: "storage",
          sync: { direction: "both", auto: true },
        });
        if (link) {
          toast.success(`CasaOS de «${n.name}» vinculado como servidor de memoria de ${brainName ? `«${brainName}»` : "este cerebro"}.`);
        } else {
          toast.success("Servidor CasaOS registrado. Enlázalo a un cerebro en Gestión avanzada de cerebros.");
        }
      } else {
        toast.success("Servidor CasaOS registrado en tu registro de servidores de cerebros.");
      }
    } finally {
      setLinking(false);
    }
  };

  const enabled = !!settings.casaos?.enabled;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Cabecera plegable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-white/[0.03] transition-colors"
      >
        <HardDrive className="w-4 h-4 text-sky-300" />
        <span className="text-xs font-semibold text-white/85">CasaOS — servidor casero de esta neurona</span>
        {enabled && normalizeCasaUrl(url) && (
          <Badge variant="outline" className="text-[9px] border-sky-400/30 text-sky-200 bg-sky-500/10">activo</Badge>
        )}
        {reachable === true && (
          <Badge variant="outline" className="text-[9px] border-emerald-400/30 text-emerald-300 bg-emerald-500/10">alcanzable</Badge>
        )}
        {reachable === false && (
          <Badge variant="outline" className="text-[9px] border-red-400/30 text-red-300 bg-red-500/10">no alcanzable</Badge>
        )}
        <ChevronDown className={cn("w-4 h-4 ml-auto text-white/40 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
          <p className="text-[11px] text-white/50 leading-relaxed">
            <a
              href="https://github.com/IceWhaleTech/CasaOS"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 hover:underline"
            >
              CasaOS
            </a>{" "}
            convierte este dispositivo en tu nube personal (Go + Docker): panel web, App Store y apps que sirven a
            todas tus neuronas — almacén de cerebros/memorias y motor de IA local para Astraura.
          </p>

          {/* Activación + URL */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/85">Usar el CasaOS de esta neurona</p>
              <p className="text-[10px] text-muted-foreground">El OS lo ofrecerá como servidor/almacén donde aplique.</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => patchSettings({ casaos: { enabled: v } })}
              aria-label="Activar CasaOS en esta neurona"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={saveUrl}
              onKeyDown={(e) => { if (e.key === "Enter") void probe(); }}
              placeholder="http://192.168.1.50:80"
              className="h-8 text-sm bg-black/30 border-white/10 flex-1 min-w-[200px]"
            />
            <Button size="sm" variant="outline" className="cursor-pointer h-8 gap-1.5 text-xs" disabled={probing} onClick={() => void probe()}>
              {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
              Probar
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer h-8 gap-1.5 text-xs" onClick={openPanel}>
              <ExternalLink className="w-3.5 h-3.5" /> Abrir panel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="cursor-pointer h-8 gap-1.5 text-xs"
              onClick={() => setEmbedOpen((v) => !v)}
            >
              <PanelTop className="w-3.5 h-3.5" /> {embedOpen ? "Ocultar vista" : "Vista embebida"}
            </Button>
            <Button
              size="sm"
              className="cursor-pointer h-8 gap-1.5 text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white"
              disabled={linking}
              onClick={() => void linkAsMemoryServer()}
            >
              {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Vincular como servidor de memoria
            </Button>
          </div>
          <p className="text-[10px] text-white/35">
            Nota: si el OS corre en https y el panel es http de red local, el navegador puede bloquear la
            comprobación y la vista embebida (contenido mixto) — «Abrir panel» funciona igualmente.
          </p>

          {/* Vista embebida opcional */}
          {embedOpen && (
            normalizeCasaUrl(url) ? (
              <div className="space-y-1">
                <iframe
                  src={normalizeCasaUrl(url)}
                  title={`Panel CasaOS de ${n.name}`}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  className="w-full h-[380px] rounded-lg border border-white/10 bg-black/40"
                />
                <p className="text-[10px] text-white/35">
                  Si no carga: los paneles http en red local pueden quedar bloqueados dentro de una página https
                  (contenido mixto). Usa «Abrir panel» en ese caso.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-amber-300/80">Escribe la URL del panel para poder embeberlo.</p>
            )
          )}

          {/* Guía de instalación (acordeón) */}
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setGuideOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-xs font-semibold text-white/80">Guía de instalación paso a paso</span>
              <ChevronDown className={cn("w-3.5 h-3.5 ml-auto text-white/40 transition-transform", guideOpen && "rotate-180")} />
            </button>
            {guideOpen && (
              <ol className="px-3 pb-3 pt-1 space-y-1.5 list-decimal list-inside">
                {CASAOS_STEPS.map((step, i) => (
                  <li key={i} className="text-[11px] text-white/60 leading-relaxed">
                    {step.includes(CASAOS_INSTALL_CMD) ? (
                      <>
                        Ejecuta el instalador oficial:{" "}
                        <code className="rounded bg-black/50 border border-white/10 px-1.5 py-0.5 text-[10px] text-emerald-200 select-all">
                          {CASAOS_INSTALL_CMD}
                        </code>
                      </>
                    ) : (
                      step
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Apps recomendadas (acordeón) */}
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setAppsOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-xs font-semibold text-white/80">Apps recomendadas y para qué</span>
              <ChevronDown className={cn("w-3.5 h-3.5 ml-auto text-white/40 transition-transform", appsOpen && "rotate-180")} />
            </button>
            {appsOpen && (
              <ul className="px-3 pb-3 pt-1 space-y-1.5">
                {CASAOS_APPS.map((app) => (
                  <li key={app.name} className="text-[11px] text-white/60 leading-relaxed">
                    <span className="font-semibold text-white/80">{app.name}</span> — {app.why}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
