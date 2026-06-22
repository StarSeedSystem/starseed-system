"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  FolderSync,
  HardDrive,
  Link2,
  Plug,
  RefreshCw,
  ScanLine,
  Server,
  ShieldCheck,
} from "lucide-react";

const SYNCTHING_API = "https://starseed-neurocortex.vercel.app/api/syncthing";
const DEFAULT_ENDPOINT = "http://127.0.0.1:8384";
const DEFAULT_FOLDER_PATH = "~/StarSeed/Memorias";
const FOLDER_ID = "starseed-memorias";
const FOLDER_LABEL = "StarSeed Memorias";

type ApiResult<T = unknown> = { ok: boolean; error?: string; data?: T; [k: string]: unknown };

type StStatus = { myID?: string; uptime?: number; [k: string]: unknown };
type StDevice = { deviceID?: string; name?: string; [k: string]: unknown };
type StFolder = { id?: string; label?: string; path?: string; type?: string; [k: string]: unknown };

async function callSyncthing<T = unknown>(
  accountId: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(SYNCTHING_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, action, ...extra }),
    });
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch {
    return { ok: false, error: "No se pudo contactar con el Neurocortex de StarSeed." };
  }
}

function shortId(id?: string): string {
  if (!id) return "—";
  return id.length > 14 ? `${id.slice(0, 7)}…${id.slice(-7)}` : id;
}

export function SyncthingPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [apikey, setApikey] = useState("");

  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<StStatus | null>(null);
  const [devices, setDevices] = useState<StDevice[]>([]);
  const [folders, setFolders] = useState<StFolder[]>([]);

  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: au } = await supabase.auth.getUser();
        setUserId(au?.user?.id ?? null);
      } catch {
        setUserId(null);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    setMsg(null);
    const st = await callSyncthing<StStatus>(userId, "status");
    if (!st.ok) {
      setConnected(false);
      setStatus(null);
      setDevices([]);
      setFolders([]);
      setMsg({ kind: "err", text: st.error || "Syncthing no alcanzable." });
      setRefreshing(false);
      return;
    }
    setConnected(true);
    setStatus((st.data as StStatus) ?? null);
    const [dev, fol] = await Promise.all([
      callSyncthing<StDevice[]>(userId, "devices"),
      callSyncthing<StFolder[]>(userId, "folders"),
    ]);
    setDevices(Array.isArray(dev.data) ? (dev.data as StDevice[]) : []);
    setFolders(Array.isArray(fol.data) ? (fol.data as StFolder[]) : []);
    setMsg({ kind: "ok", text: "Estado actualizado desde Syncthing." });
    setRefreshing(false);
  }, [userId]);

  const connect = useCallback(async () => {
    if (!userId) {
      setMsg({ kind: "err", text: "Inicia sesión en StarSeed OS para conectar Syncthing." });
      return;
    }
    if (!endpoint.trim() || !apikey.trim()) {
      setMsg({ kind: "err", text: "Indica el Endpoint y la API Key." });
      return;
    }
    setConnecting(true);
    setMsg(null);
    const res = await callSyncthing(userId, "connect", {
      endpoint: endpoint.trim(),
      apikey: apikey.trim(),
    });
    setConnecting(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error || "No se pudo guardar la configuración." });
      return;
    }
    setApikey("");
    setMsg({ kind: "ok", text: "Configuración guardada y cifrada en tu bóveda. Comprobando conexión…" });
    await refresh();
  }, [userId, endpoint, apikey, refresh]);

  const addFolder = useCallback(async () => {
    if (!userId) return;
    setWorking(true);
    setMsg(null);
    const res = await callSyncthing(userId, "add_folder", {
      id: FOLDER_ID,
      label: FOLDER_LABEL,
      path: DEFAULT_FOLDER_PATH,
    });
    setWorking(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error || "No se pudo crear la carpeta." });
      return;
    }
    setMsg({ kind: "ok", text: `Carpeta «${FOLDER_LABEL}» creada/actualizada en Syncthing.` });
    await refresh();
  }, [userId, refresh]);

  const rescan = useCallback(async () => {
    if (!userId) return;
    setWorking(true);
    setMsg(null);
    const res = await callSyncthing(userId, "scan", { id: FOLDER_ID });
    setWorking(false);
    setMsg(
      res.ok
        ? { kind: "ok", text: "Re-escaneo solicitado a Syncthing." }
        : { kind: "err", text: res.error || "No se pudo re-escanear." },
    );
  }, [userId]);

  return (
    <div className="space-y-6 p-1">
      {/* Cabecera */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-sky-600">
            <FolderSync className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">Syncthing · Sincronización P2P</span>
            <span className="text-[11px] text-cyan-400/70">
              La sync cifrada entre tus dispositivos la hace Syncthing · StarSeed la gestiona y monitorea
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 border-white/15",
                connected ? "border-emerald-400/40 text-emerald-300" : "text-white/50",
              )}
            >
              {connected ? <CheckCircle2 className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
              {connected ? "Conectado" : "Sin conectar"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-cyan-500/30 text-cyan-100"
              onClick={refresh}
              disabled={!userId || refreshing}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Mensaje de estado */}
      {msg && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            msg.kind === "ok" && "border-emerald-500/25 bg-emerald-950/20 text-emerald-200",
            msg.kind === "err" && "border-amber-500/25 bg-amber-950/20 text-amber-200",
            msg.kind === "info" && "border-cyan-500/25 bg-cyan-950/20 text-cyan-100",
          )}
        >
          {msg.kind === "err" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {!userId && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          Inicia sesión en StarSeed OS para conectar y gestionar tu Syncthing. Tu configuración se guarda cifrada en tu
          bóveda soberana.
        </div>
      )}

      {/* Conectar */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-400/60">
          <Link2 className="h-3.5 w-3.5" /> Conectar Syncthing
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Endpoint</span>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={DEFAULT_ENDPOINT}
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">API Key</span>
            <Input
              type="password"
              value={apikey}
              onChange={(e) => setApikey(e.target.value)}
              placeholder="X-API-Key de Syncthing"
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <Button
            className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
            onClick={connect}
            disabled={connecting || !userId}
          >
            <Plug className={cn("h-4 w-4", connecting && "animate-pulse")} /> Conectar
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-cyan-300/60">
          <ShieldCheck className="h-3.5 w-3.5" /> La API Key se cifra en tu bóveda. La encuentras en la GUI de Syncthing:
          Actions → Settings → API Key.
        </p>
      </div>

      {/* Estado */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-400/60">
          <Server className="h-3.5 w-3.5" /> Estado
        </div>
        {connected && status ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-white/40">My ID</div>
              <div className="font-mono text-sm text-cyan-100" title={status.myID}>
                {shortId(status.myID)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Uptime</div>
              <div className="text-sm text-white/80">
                {typeof status.uptime === "number" ? `${Math.floor(status.uptime / 60)} min` : "—"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-white/50">
            {connected
              ? "Sin datos de estado."
              : "Conecta tu Syncthing y pulsa «Actualizar». Si no responde, comprueba que el demonio esté corriendo y accesible desde aquí."}
          </div>
        )}
      </div>

      {/* Dispositivos */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-400/60">
          <HardDrive className="h-3.5 w-3.5" /> Dispositivos ({devices.length})
        </div>
        {devices.length === 0 ? (
          <div className="text-sm text-white/50">
            Sin dispositivos visibles. Empareja tus equipos desde la GUI de Syncthing (intercambio de Device IDs).
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {devices.map((d, i) => (
              <div key={d.deviceID ?? i} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="truncate text-sm font-medium text-white">{d.name || "Dispositivo"}</div>
                <div className="font-mono text-[11px] text-white/40" title={d.deviceID}>
                  {shortId(d.deviceID)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Carpetas */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-400/60">
            <FolderSync className="h-3.5 w-3.5" /> Carpetas ({folders.length})
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500"
              onClick={addFolder}
              disabled={!userId || working}
            >
              <FolderSync className="h-4 w-4" /> Crear carpeta StarSeed Memorias
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-cyan-500/30 text-cyan-100"
              onClick={rescan}
              disabled={!userId || working}
            >
              <ScanLine className="h-4 w-4" /> Re-escanear
            </Button>
          </div>
        </div>
        {folders.length === 0 ? (
          <div className="text-sm text-white/50">
            Aún no hay carpetas. Crea «{FOLDER_LABEL}» (id <span className="font-mono">{FOLDER_ID}</span>, ruta sugerida{" "}
            <span className="font-mono">{DEFAULT_FOLDER_PATH}</span>) y compártela con tus dispositivos desde Syncthing.
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((f, i) => (
              <div
                key={f.id ?? i}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <span className="text-sm font-medium text-white">{f.label || f.id}</span>
                <Badge variant="outline" className="border-white/15 text-[10px] text-white/50">
                  {f.type || "sendreceive"}
                </Badge>
                <span className="ml-auto truncate font-mono text-[11px] text-white/40" title={f.path}>
                  {f.path || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-white/40">
        Honestidad: Syncthing mueve los bytes directamente entre tus dispositivos (P2P, cifrado, en tiempo real). StarSeed
        sólo lee su REST API para mostrarte el estado y ayudarte a orquestarlo. Desde un OS en la nube, el endpoint sólo es
        alcanzable si tu Syncthing está expuesto de forma segura (LAN, VPN como Tailscale, o VPS/túnel). En puro-local, la
        sincronización ya ocurre sola.
      </p>
    </div>
  );
}

export default SyncthingPanel;
