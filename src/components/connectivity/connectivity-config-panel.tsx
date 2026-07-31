"use client";

/**
 * ConnectivityConfigPanel — PANEL COMPARTIDO DE CONECTIVIDAD (Adenda 100).
 * ============================================================================
 * Un solo panel reutilizable en TODOS los contextos del OS para configurar las
 * señales y la conexión a la red:
 *
 *   · Antena de MALLA LOCAL (P2P) on/off — cuando está ON, la neurona actúa
 *     recíprocamente como antena/relé de la malla (da y recibe · bien común).
 *   · INTERNET PÚBLICO StarSeed on/off (independiente de la malla) — ON = se
 *     entrelaza con TODA la red StarSeed; OFF = sesión privada (solo tu cuenta).
 *   · SERVIDOR activo: StarSeed público (por defecto) o cualquier servidor
 *     privado/público añadido y editable (por cuenta o grupo).
 *   · PRIVACIDAD en el radar público: visible · anónimo · oculto.
 *
 * Dos modos:
 *   · mode="account"  → se AUTO-PERSISTE en la neurona-cuenta vía la API de mesh
 *                       (getConnectivitySettings/getMeshPrivacy/servers). Además
 *                       permite AÑADIR/EDITAR/BORRAR servidores de la cuenta.
 *   · mode="portable" → controlado por value/onChange (entidades, chats,
 *                       personalidades). Muestra un selector de "medio de
 *                       internet" de 4 vías (público/privado/solo malla/cuenta).
 *
 * Estilo Crystal Liquid Glass, SSR-safe, defensivo. Cursor pointer en clicables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Antenna, ArrowLeftRight, Eye, EyeOff, Fingerprint, Globe, KeyRound, Loader2, Lock, MapPin, Plus,
  RadioTower, Server, ShieldCheck, ShieldX, Tag, Trash2, Waypoints, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getConnectivitySettings,
  setConnectivitySettings,
  CONNECTIVITY_EVENT,
  DEFAULT_CONNECTIVITY,
  getMeshPrivacy,
  setMeshPrivacy,
  MESH_PRIVACY_EVENT,
  DEFAULT_MESH_PRIVACY,
  listMeshServers,
  addMeshServer,
  updateMeshServer,
  removeMeshServer,
  MESH_SERVERS_EVENT,
  subscribeMeshServers,
  revokeIdentity,
  currentFingerprint,
  listRevocationCerts,
  revokeDeviceByCert,
  type AccountRevocationCert,
  type MeshServer,
  type PublicRadarMode,
  type PreferredRoute,
  type ConnectivityConfig,
  type ConnectivityInternetMode,
  DEFAULT_CONNECTIVITY_CONFIG,
} from "@/ai/astraura/mesh";

/* ── Etiquetas ─────────────────────────────────────────────────────────────── */

const RADAR_OPTS: { value: PublicRadarMode; label: string; hint: string }[] = [
  { value: "visible", label: "Visible", hint: "apareces como usuario activo en el radar público" },
  { value: "anonymous", label: "Anónimo", hint: "participas sin mostrar usuario ni ubicación" },
  { value: "off", label: "Oculto", hint: "usas la malla pero eres invisible en el radar" },
];

const INTERNET_MODES: { value: ConnectivityInternetMode; label: string; hint: string }[] = [
  { value: "public", label: "Pública", hint: "red pública en servidores StarSeed/editables" },
  { value: "private", label: "Privada", hint: "servidores privados propios (sesión privada)" },
  { value: "local", label: "Solo malla", hint: "solo malla local P2P (sin servidor)" },
  { value: "account", label: "Solo cuenta", hint: "solo a través de tu cuenta y sus permisos" },
];

/* ── Sub-controles ─────────────────────────────────────────────────────────── */

function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent = "emerald",
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  accent?: "emerald" | "cyan" | "amber";
}) {
  const activeCls =
    accent === "cyan"
      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
      : accent === "amber"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
            value === o.value
              ? activeCls
              : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white/85",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  hint,
  checked,
  onCheckedChange,
  accentOn = "text-emerald-300",
}: {
  icon: (on: boolean) => React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  accentOn?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors duration-200 hover:border-emerald-400/25">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={cn("shrink-0", checked ? accentOn : "text-white/40")}>{icon(checked)}</span>
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-white/90">{title}</span>
          <span className="block text-[10px] leading-snug text-white/45">{hint}</span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/* ── Identidad de la neurona (revocar + rotar) · Adenda 108 ────────────────── */

function NeuronIdentityCard() {
  const [fp, setFp] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [others, setOthers] = useState<AccountRevocationCert[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadOthers = useCallback(() => {
    void listRevocationCerts().then(setOthers).catch(() => setOthers([]));
  }, []);

  useEffect(() => {
    let alive = true;
    void currentFingerprint().then((f) => {
      if (alive) setFp(f);
    });
    loadOthers();
    return () => {
      alive = false;
    };
  }, [loadOthers]);

  const revoke = async () => {
    setBusy(true);
    const res = await revokeIdentity();
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setRotated(true);
      setFp(res.newFp ?? (await currentFingerprint()));
    }
  };

  const revokeOther = async (fpTarget: string) => {
    setRevoking(fpTarget);
    const res = await revokeDeviceByCert(fpTarget);
    setRevoking(null);
    if (res.ok) loadOthers();
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-2 text-[12px] font-medium text-white/90">
        <Fingerprint className="h-4 w-4 text-violet-300" /> Identidad de esta neurona
      </p>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] text-white/45">
        <KeyRound className="h-3 w-3 shrink-0 text-white/35" />
        <span className="truncate font-mono">{fp ?? "—"}</span>
      </p>
      {rotated && (
        <p className="mb-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-2 py-1 text-[10px] leading-snug text-emerald-100/80">
          Identidad revocada y rotada. El contenido firmado con la clave anterior deja de ser de fiar para el resto de la red.
        </p>
      )}
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setConfirming(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="h-7 flex-1 bg-red-500/80 px-2 text-[11px] hover:bg-red-500"
            onClick={revoke}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldX className="mr-1 h-3 w-3" />}
            Confirmar revocación y rotar clave
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setRotated(false);
            setConfirming(true);
          }}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-red-400/40 hover:text-red-200"
        >
          <ShieldX className="h-3.5 w-3.5" /> Revocar y regenerar identidad
        </button>
      )}
      <p className="mt-1.5 text-[9px] leading-snug text-white/35">
        Úsalo si la clave de esta neurona se vio comprometida: firma un acta de revocación verificable por toda la red y
        genera una identidad nueva para tus próximas transmisiones.
      </p>

      {others.length > 0 && (
        <div className="mt-2.5 border-t border-white/10 pt-2">
          <p className="mb-1.5 text-[10px] font-medium text-white/70">Revocar otra neurona de la cuenta (autoridad de cuenta)</p>
          <div className="space-y-1">
            {others.map((o) => (
              <div key={o.fp} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                <KeyRound className="h-3 w-3 shrink-0 text-white/35" />
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-white/50">{o.fp}</span>
                <button
                  type="button"
                  onClick={() => revokeOther(o.fp)}
                  disabled={revoking === o.fp}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-white/60 transition-colors hover:border-red-400/40 hover:text-red-200 disabled:opacity-50"
                >
                  {revoking === o.fp ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldX className="h-2.5 w-2.5" />} Revocar
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[9px] leading-snug text-white/35">
            Revoca un dispositivo perdido SIN su clave, usando su certificado pre-generado guardado en tu cuenta.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Editor de servidores (solo modo cuenta) ───────────────────────────────── */

function ServerEditor({ servers, onChanged }: { servers: MeshServer[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");

  const submit = () => {
    if (!name.trim()) return;
    addMeshServer({ name, endpoint, visibility, token });
    setName("");
    setEndpoint("");
    setToken("");
    setVisibility("private");
    setAdding(false);
    onChanged();
  };

  return (
    <div className="space-y-2">
      {servers
        .filter((s) => s.editable)
        .map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <Server className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-white/85">{s.name}</span>
              <span className="block truncate text-[9px] text-white/40">
                {s.visibility === "public" ? "público" : "privado"}
                {s.endpoint ? ` · ${s.endpoint}` : ""}
              </span>
            </span>
            <button
              type="button"
              title="Quitar servidor"
              onClick={() => {
                removeMeshServer(s.id);
                onChanged();
              }}
              className="cursor-pointer rounded-md p-1 text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.05] p-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del servidor"
            className="h-8 text-[12px]"
          />
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="Endpoint (URL) — opcional"
            className="h-8 text-[12px]"
          />
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token de acceso — opcional (servidores con auth)"
            className="h-8 text-[12px]"
          />
          <div className="flex items-center justify-between gap-2">
            <Segmented
              value={visibility}
              accent="cyan"
              options={[
                { value: "private", label: "Privado" },
                { value: "public", label: "Público" },
              ]}
              onChange={(v) => setVisibility(v)}
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setAdding(false)}>
                <X className="mr-1 h-3 w-3" /> Cancelar
              </Button>
              <Button size="sm" className="h-7 px-2 text-[11px]" onClick={submit} disabled={!name.trim()}>
                <Plus className="mr-1 h-3 w-3" /> Añadir
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:border-cyan-400/40 hover:text-cyan-200"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir servidor (privado o público)
        </button>
      )}
    </div>
  );
}

/* ── Panel principal ───────────────────────────────────────────────────────── */

export interface ConnectivityConfigPanelProps {
  mode?: "account" | "portable";
  /** Modo portable: valor controlado. */
  value?: ConnectivityConfig;
  onChange?: (next: ConnectivityConfig) => void;
  /** Etiqueta del contexto (p. ej. "esta página", "esta personalidad"). */
  contextLabel?: string;
  title?: string;
  compact?: boolean;
  className?: string;
}

export function ConnectivityConfigPanel({
  mode = "account",
  value,
  onChange,
  contextLabel,
  title,
  compact = false,
  className,
}: ConnectivityConfigPanelProps) {
  const isAccount = mode === "account";

  /* Estado modo cuenta (auto-persistido) */
  const [settings, setSettings] = useState(DEFAULT_CONNECTIVITY);
  const [privacy, setPrivacy] = useState(DEFAULT_MESH_PRIVACY);
  const [servers, setServers] = useState<MeshServer[]>([]);
  const refreshServers = useCallback(() => setServers(listMeshServers()), []);

  useEffect(() => {
    if (!isAccount) return;
    setSettings(getConnectivitySettings());
    setPrivacy(getMeshPrivacy());
    refreshServers();
    if (typeof window === "undefined") return;
    const onC = () => setSettings(getConnectivitySettings());
    const onP = () => setPrivacy(getMeshPrivacy());
    window.addEventListener(CONNECTIVITY_EVENT, onC);
    window.addEventListener(MESH_PRIVACY_EVENT, onP);
    const offS = subscribeMeshServers(refreshServers);
    return () => {
      window.removeEventListener(CONNECTIVITY_EVENT, onC);
      window.removeEventListener(MESH_PRIVACY_EVENT, onP);
      offS();
    };
  }, [isAccount, refreshServers]);

  // En modo portable la lista de servidores disponibles = los de la cuenta.
  useEffect(() => {
    if (isAccount) return;
    refreshServers();
    const off = subscribeMeshServers(refreshServers);
    return off;
  }, [isAccount, refreshServers]);

  /* Vista unificada de los valores efectivos */
  const cfg: ConnectivityConfig = useMemo(() => {
    if (isAccount) {
      return {
        meshEnabled: settings.meshEnabled,
        publicInternet: settings.publicInternet,
        serverId: settings.serverId,
        publicRadar: privacy.publicRadar,
        internetMode: settings.publicInternet ? "public" : "private",
      };
    }
    return value ?? DEFAULT_CONNECTIVITY_CONFIG;
  }, [isAccount, settings, privacy, value]);

  /* Escritura */
  const setMesh = (meshEnabled: boolean) => {
    if (isAccount) setConnectivitySettings({ meshEnabled });
    else onChange?.({ ...cfg, meshEnabled });
  };
  const setPublicInternet = (publicInternet: boolean) => {
    if (isAccount) setConnectivitySettings({ publicInternet });
    else onChange?.({ ...cfg, publicInternet, internetMode: publicInternet ? "public" : "private" });
  };
  const setServerId = (serverId: string) => {
    if (isAccount) setConnectivitySettings({ serverId });
    else onChange?.({ ...cfg, serverId });
  };
  const setRadar = (publicRadar: PublicRadarMode) => {
    if (isAccount) setMeshPrivacy({ publicRadar });
    else onChange?.({ ...cfg, publicRadar });
  };
  const setInternetMode = (internetMode: ConnectivityInternetMode) => {
    onChange?.({
      ...cfg,
      internetMode,
      publicInternet: internetMode === "public",
      meshEnabled: internetMode === "local" ? true : cfg.meshEnabled,
    });
  };

  const publicOn = isAccount ? settings.publicInternet : cfg.internetMode === "public" || cfg.internetMode === "private";
  const showServers = publicOn;

  return (
    <Card className={cn("border-white/10 bg-black/20", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Waypoints className="h-4 w-4 text-cyan-300" /> {title ?? "Señales y conexión"}
        </CardTitle>
        <CardDescription>
          {contextLabel ? (
            <>Configura las señales y el internet de {contextLabel}. </>
          ) : (
            <>Malla local e internet público StarSeed encendidos por defecto. </>
          )}
          Funcionan a la vez, de forma inteligente según la carga, la distancia, el tamaño y la velocidad.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {/* Antena de malla local (siempre) */}
        <ToggleRow
          icon={(on) => (on ? <RadioTower className="h-4 w-4" /> : <Antenna className="h-4 w-4" />)}
          title="Antena de malla local (P2P)"
          hint="ON = esta neurona actúa como antena/relé de la malla StarSeed (da y recibe · bien común)"
          checked={cfg.meshEnabled}
          onCheckedChange={setMesh}
        />

        {/* Internet: cuenta = switch; portable = 4 vías */}
        {isAccount ? (
          <ToggleRow
            icon={() => <Globe className="h-4 w-4" />}
            title="Internet público StarSeed"
            hint="ON = te entrelazas con toda la red StarSeed · OFF = sesión privada (solo tu cuenta)"
            checked={settings.publicInternet}
            onCheckedChange={setPublicInternet}
            accentOn="text-cyan-300"
          />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/90">
              <Globe className="h-4 w-4 text-cyan-300" /> Medio de internet
            </p>
            <Segmented accent="cyan" value={cfg.internetMode} options={INTERNET_MODES} onChange={setInternetMode} />
            <p className="mt-1.5 text-[10px] text-white/45">
              {INTERNET_MODES.find((m) => m.value === cfg.internetMode)?.hint}
            </p>
          </div>
        )}

        {/* Servidor activo + editor (cuenta) */}
        {showServers && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/90">
              <Server className="h-4 w-4 text-cyan-300" /> Servidor
              <span className="ml-auto text-[9px] font-normal text-white/40">
                {publicOn ? "internet público / relé" : ""}
              </span>
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {servers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.notes ?? s.name}
                  onClick={() => setServerId(s.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                    cfg.serverId === s.id
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white/85",
                  )}
                >
                  {s.kind === "starseed" ? <ShieldCheck className="h-3 w-3" /> : <Server className="h-3 w-3" />}
                  {s.name}
                </button>
              ))}
            </div>
            {isAccount && <ServerEditor servers={servers} onChanged={refreshServers} />}
            {!isAccount && (
              <p className="text-[10px] text-white/40">
                Los servidores propios se añaden desde la configuración de la cuenta.
              </p>
            )}
          </div>
        )}

        {/* Sesión privada nota */}
        {!publicOn && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] px-3 py-2.5">
            <p className="flex items-center gap-2 text-[11px] font-medium text-amber-100/90">
              <Lock className="h-3.5 w-3.5" /> Sesión privada
            </p>
            <p className="mt-1 text-[10px] leading-snug text-white/50">
              El internet público está apagado: solo se comparte con las neuronas de tu propia cuenta
              {cfg.internetMode === "local" ? " o por la malla local P2P" : ""}. Sin feed público ni cruce entre cuentas.
            </p>
          </div>
        )}

        {/* Privacidad en el radar público */}
        {publicOn && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/90">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Radar público
            </p>
            <Segmented value={cfg.publicRadar} options={RADAR_OPTS} onChange={setRadar} />
            <p className="mt-1.5 text-[10px] text-white/45">
              {RADAR_OPTS.find((r) => r.value === cfg.publicRadar)?.hint}
            </p>
          </div>
        )}

        {/* Ajustes avanzados (solo neurona-cuenta): modo dual, ruta preferida e
            identidad en la federación. Aquí viven TODOS los ajustes de la neurona
            para que NO se dupliquen en otras superficies. */}
        {isAccount && (
          <>
            <ToggleRow
              icon={() => <ArrowLeftRight className="h-4 w-4" />}
              title="Modo dual (malla + red externa a la vez)"
              hint="ON = usa ambas vías simultáneamente y elige la mejor por clase de mensaje"
              checked={settings.dualMode}
              onCheckedChange={(v) => setConnectivitySettings({ dualMode: v })}
              accentOn="text-cyan-300"
            />
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-medium text-white/90">
                <Waypoints className="h-4 w-4 text-cyan-300" /> Ruta preferida
              </p>
              <Segmented
                accent="cyan"
                value={settings.preferred}
                options={[
                  { value: "auto" as PreferredRoute, label: "Auto", hint: "el router decide por clase de mensaje" },
                  { value: "wifi" as PreferredRoute, label: "Red externa", hint: "prioriza la red convencional" },
                  { value: "mesh" as PreferredRoute, label: "Malla P2P", hint: "prioriza la radio libre" },
                ]}
                onChange={(v) => setConnectivitySettings({ preferred: v })}
              />
            </div>
            <ToggleRow
              icon={(on) => (on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />)}
              title="Visible para mis otras neuronas"
              hint="publica la topología SOLO a los dispositivos de tu cuenta (federación cifrada por sesión)"
              checked={privacy.visibility === "account"}
              onCheckedChange={(v) => setMeshPrivacy({ visibility: v ? "account" : "private" })}
            />
            <ToggleRow
              icon={() => <MapPin className="h-4 w-4" />}
              title="Compartir mi posición GPS"
              hint="OFF por defecto (la ubicación es sensible). ON = tus otras neuronas te ubican con GPS real"
              checked={privacy.sharePosition}
              onCheckedChange={(v) => setMeshPrivacy({ sharePosition: v })}
              accentOn="text-amber-300"
            />
            <ToggleRow
              icon={() => <Tag className="h-4 w-4" />}
              title="Compartir nombres de nodos"
              hint="OFF = solo números de nodo en la federación"
              checked={privacy.shareName}
              onCheckedChange={(v) => setMeshPrivacy({ shareName: v })}
            />
            <NeuronIdentityCard />
          </>
        )}

        {!compact && (
          <p className="px-0.5 text-[10px] leading-snug text-white/35">
            El relé de la malla está siempre activo (procomún: cada neurona da y recibe para toda la red). La
            posición GPS nunca viaja sin tu permiso explícito.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ConnectivityConfigPanel;
