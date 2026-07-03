"use client";

/**
 * DeviceNetworkPanel — "Dispositivos y red" (Crystal Liquid Glass).
 * ---------------------------------------------------------------------------
 * Muestra, de forma HONESTA:
 *   - ESTE dispositivo (id, plataforma, IP pública si se detectó).
 *   - La lista de dispositivos de la CUENTA (Supabase user_settings.prefs.devices).
 *   - Cuáles se infieren "en tu red" (misma IP pública) con badge.
 *   - Un switch "Detección automática (predeterminado)" (persistente).
 *   - Un botón "Sincronizar por red directa" que ahora INICIA un mesh WebRTC P2P
 *     REAL e intenta conectar con los dispositivos de tu red (o cualquiera de la
 *     cuenta), con señalización por tu cuenta. Estado por dispositivo en vivo.
 *   - Indicador de "canal directo activo" y botón "Probar envío" (ping por el
 *     data channel, muestra el eco).
 *
 * Nota honesta clave (una línea en la UI): agrupamos por CUENTA + IP PÚBLICA
 * porque el navegador NO puede escanear la LAN ni leer tu IP privada. La
 * conexión usa STUN público sin TURN: en NAT simétrico puede fallar.
 *
 * Estilo: Crystal Liquid Glass, claro, responsive, reduced-motion. Defensivo:
 * sin sesión Supabase degrada a localStorage y lo dice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Radar,
  RefreshCw,
  Wifi,
  WifiOff,
  MonitorSmartphone,
  Laptop,
  Globe,
  ShieldQuestion,
  Link2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Radio,
  Send,
  XCircle,
} from "lucide-react";
import { useDeviceNetwork, type DeviceInfo } from "@/lib/network/device-registry";
import {
  beginDirectSync,
  lanSyncStatus,
  describeLanSync,
  ensureMesh,
  getSharedMesh,
  teardownMesh,
  type LanSyncResult,
} from "@/lib/network/lan-sync";
import type { PeerSnapshot, PeerState } from "@/lib/network/webrtc-mesh";

/* ------------------------------------------------------------------ */
/* Utilidades de presentación                                        */
/* ------------------------------------------------------------------ */

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "hace un momento";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function platformIcon(platform: string) {
  const p = (platform || "").toLowerCase();
  if (p.includes("android") || p.includes("iphone") || p.includes("ipad") || p.includes("mobile")) {
    return MonitorSmartphone;
  }
  return Laptop;
}

/** IP pública enmascarada para no exponerla entera en pantalla. */
function maskIp(ip: string | null): string {
  if (!ip) return "sin IP pública";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.•.•`;
  // IPv6 u otro: muestra prefijo corto.
  return ip.length > 12 ? `${ip.slice(0, 10)}…` : ip;
}

/* ------------------------------------------------------------------ */
/* Presentación del estado de un peer                                */
/* ------------------------------------------------------------------ */

type PeerUi = { state: PeerState; channelOpen: boolean };

function peerBadge(peer: PeerUi | undefined) {
  if (!peer) return null;
  if (peer.state === "connected") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-400/50 text-[9px] text-emerald-300">
        <Radio className="h-3 w-3" /> conectado
      </Badge>
    );
  }
  if (peer.state === "connecting") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-400/40 text-[9px] text-sky-300">
        <Loader2 className="h-3 w-3 animate-spin" /> conectando
      </Badge>
    );
  }
  if (peer.state === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-red-400/40 text-[9px] text-red-300">
        <XCircle className="h-3 w-3" /> falló
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] text-foreground/50">
      cerrado
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Fila de dispositivo                                               */
/* ------------------------------------------------------------------ */

function DeviceRow({
  device,
  isSelf,
  sameNet,
  peer,
}: {
  device: DeviceInfo;
  isSelf: boolean;
  sameNet: boolean;
  peer?: PeerUi;
}) {
  const Icon = platformIcon(device.platform);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border p-2.5 transition-colors",
        isSelf
          ? "border-sky-400/40 bg-sky-400/[0.06]"
          : peer?.state === "connected"
            ? "border-emerald-400/50 bg-emerald-400/[0.08]"
            : sameNet
              ? "border-emerald-400/30 bg-emerald-400/[0.05]"
              : "border-foreground/10 bg-foreground/[0.03]",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isSelf ? "bg-sky-400/15 text-sky-300" : "bg-foreground/10 text-foreground/70",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{device.label}</span>
          {isSelf && (
            <Badge variant="outline" className="border-sky-400/40 text-[9px] text-sky-300">
              este dispositivo
            </Badge>
          )}
          {sameNet && !isSelf && (
            <Badge variant="outline" className="gap-1 border-emerald-400/40 text-[9px] text-emerald-300">
              <Wifi className="h-3 w-3" /> en tu red
            </Badge>
          )}
          {!isSelf && peerBadge(peer)}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground/45">
          <span className="truncate">{device.platform || "plataforma desconocida"}</span>
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" /> {maskIp(device.publicIp)}
          </span>
          <span>· visto {timeAgo(device.lastSeen)}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel principal                                                   */
/* ------------------------------------------------------------------ */

export default function DeviceNetworkPanel() {
  const {
    thisDevice,
    devices,
    sameNetwork,
    hasSession,
    hasPublicIp,
    loading,
    autoDetect,
    setAutoDetect,
    refresh,
  } = useDeviceNetwork();

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<LanSyncResult | null>(null);
  /** Estado por dispositivo del mesh WebRTC (id → snapshot ligero). */
  const [peers, setPeers] = useState<Record<string, PeerUi>>({});
  /** ¿El mesh está inicializado y escuchando? */
  const [meshActive, setMeshActive] = useState(false);
  /** Transporte de señalización efectivo (realtime|polling|none). */
  const [signaling, setSignaling] = useState<"realtime" | "polling" | "none">("none");
  /** Log honesto del ping/eco de "Probar envío". */
  const [pingLog, setPingLog] = useState<string[]>([]);
  const [pinging, setPinging] = useState(false);

  const sameNetIds = useMemo(() => new Set(sameNetwork.map((d) => d.id)), [sameNetwork]);
  const lanStatus = useMemo(() => lanSyncStatus(), []);

  // Otros dispositivos (excluye este) ordenados: primero los de tu red.
  const others = useMemo(() => {
    const rest = devices.filter((d) => !thisDevice || d.id !== thisDevice.id);
    return rest.sort((a, b) => {
      const an = sameNetIds.has(a.id) ? 0 : 1;
      const bn = sameNetIds.has(b.id) ? 0 : 1;
      if (an !== bn) return an - bn;
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
  }, [devices, thisDevice, sameNetIds]);

  /** ¿Hay al menos un peer con canal directo abierto? */
  const anyConnected = useMemo(
    () => Object.values(peers).some((p) => p.state === "connected" && p.channelOpen),
    [peers],
  );

  /** Cuenta de peers conectados (para el indicador). */
  const connectedCount = useMemo(
    () => Object.values(peers).filter((p) => p.state === "connected" && p.channelOpen).length,
    [peers],
  );

  // Guardamos el unsubscribe del listener de peers para limpiar al desmontar.
  const peerUnsubRef = useRef<(() => void) | null>(null);

  /** Suscribe (una vez) los eventos del mesh compartido al estado local. */
  const attachMeshListeners = useCallback(() => {
    const mesh = getSharedMesh();
    if (!mesh) return;
    setMeshActive(true);
    setSignaling(mesh.signalingTransport);

    // Evita doble suscripción.
    if (peerUnsubRef.current) return;

    const unsub = mesh.onPeer({
      onState: (snap: PeerSnapshot) => {
        setPeers((prev) => ({
          ...prev,
          [snap.deviceId]: { state: snap.state, channelOpen: snap.channelOpen },
        }));
        // El transporte puede resolverse un instante después del init.
        setSignaling(mesh.signalingTransport);
      },
      onMessage: (deviceId: string, data: string) => {
        // Eco de "Probar envío": si recibimos un ping, respondemos con pong.
        try {
          const msg = JSON.parse(data) as { t?: string; text?: string; at?: number };
          if (msg?.t === "ping") {
            const short = deviceId.slice(0, 8);
            setPingLog((l) => [`← ping de ${short}: "${msg.text ?? ""}"`, ...l].slice(0, 6));
            mesh.sendToPeer(deviceId, JSON.stringify({ t: "pong", text: msg.text ?? "", at: Date.now() }));
          } else if (msg?.t === "pong") {
            const short = deviceId.slice(0, 8);
            setPingLog((l) => [`✓ eco (pong) de ${short}`, ...l].slice(0, 6));
          }
        } catch {
          const short = deviceId.slice(0, 8);
          setPingLog((l) => [`← mensaje de ${short}: ${data.slice(0, 40)}`, ...l].slice(0, 6));
        }
      },
    });
    peerUnsubRef.current = unsub;
  }, []);

  // Limpieza global al desmontar el panel: soltar listener y cerrar mesh.
  useEffect(() => {
    return () => {
      try {
        peerUnsubRef.current?.();
      } catch {
        /* noop */
      }
      peerUnsubRef.current = null;
      teardownMesh();
    };
  }, []);

  /**
   * onDirectSync — INICIA el mesh (si hace falta) e intenta conectar con los
   * dispositivos de tu red; si no hay, con cualquiera de la cuenta.
   */
  const onDirectSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      // 1) Asegura el mesh vivo y engancha los listeners de estado/mensajes.
      const mesh = await ensureMesh(thisDevice);
      if (!mesh) {
        setSyncResult({
          ok: false,
          status: lanSyncStatus() === "unsupported" ? "unsupported" : "not-configured",
          detail:
            lanSyncStatus() === "unsupported"
              ? "Este navegador no soporta WebRTC; no hay conexión directa disponible."
              : "Inicia sesión para conectar: la señalización viaja por tu cuenta y hace falta en ambos dispositivos.",
        });
        return;
      }
      attachMeshListeners();
      setMeshActive(true);
      setSignaling(mesh.signalingTransport);

      // 2) Targets: primero los de tu red; si no hay, cualquiera de la cuenta.
      const targets = sameNetwork.length > 0 ? sameNetwork : others;
      if (targets.length === 0) {
        setSyncResult({
          ok: true,
          status: "ready",
          detail:
            "Canal de señalización listo por tu cuenta. Aún no hay otro dispositivo con sesión abierta al que conectar; abre StarSeed en otro equipo.",
        });
        return;
      }

      // 3) Lanza la conexión con cada target (la negociación sigue async).
      let anyStarted = false;
      for (const t of targets) {
        const res = await beginDirectSync(thisDevice, t);
        if (res.ok) anyStarted = true;
        setPeers((prev) => ({
          ...prev,
          [t.id]: {
            state: res.status === "connected" ? "connected" : res.status === "connecting" ? "connecting" : res.status === "error" ? "failed" : "connecting",
            channelOpen: res.status === "connected",
          },
        }));
      }

      setSyncResult({
        ok: anyStarted,
        status: anyStarted ? "connecting" : "error",
        detail: anyStarted
          ? `Conectando por red directa con ${targets.length} dispositivo(s). La negociación (SDP/ICE) viaja por tu cuenta; STUN público, sin TURN.`
          : "No se pudo iniciar la conexión directa con ningún dispositivo.",
      });
    } catch {
      setSyncResult({ ok: false, status: "error", detail: "No se pudo iniciar la sincronización directa." });
    } finally {
      setSyncing(false);
    }
  }, [sameNetwork, others, thisDevice, attachMeshListeners]);

  /**
   * onPing — "Probar envío": manda un ping por el data channel a todos los peers
   * conectados y muestra el eco (pong) que devuelven.
   */
  const onPing = useCallback(() => {
    const mesh = getSharedMesh();
    if (!mesh) {
      setPingLog((l) => ["No hay canal directo activo. Pulsa «Sincronizar por red directa».", ...l].slice(0, 6));
      return;
    }
    setPinging(true);
    try {
      const text = `hola ${new Date().toLocaleTimeString()}`;
      const payload = JSON.stringify({ t: "ping", text, at: Date.now() });
      const n = mesh.broadcast(payload);
      if (n > 0) {
        setPingLog((l) => [`→ ping enviado a ${n} peer(s): "${text}"`, ...l].slice(0, 6));
      } else {
        setPingLog((l) => ["Sin peers con canal abierto todavía (espera a «conectado»).", ...l].slice(0, 6));
      }
    } catch {
      setPingLog((l) => ["Error al enviar el ping por el data channel.", ...l].slice(0, 6));
    } finally {
      // Pequeño respiro visual para el botón.
      setTimeout(() => setPinging(false), 400);
    }
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-foreground/[0.12] p-4",
        // Crystal Liquid Glass claro: capa translúcida + blur + resplandor sutil.
        "bg-gradient-to-br from-sky-400/[0.07] via-white/[0.02] to-emerald-400/[0.05]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.10)] backdrop-blur-xl",
      )}
    >
      {/* Halo decorativo (desactivado con reduce-motion mediante utilidades base) */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl motion-reduce:hidden" />

      {/* Cabecera */}
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-emerald-500 text-white shadow-lg">
          <Radar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Dispositivos y red</span>
            <Badge variant="outline" className="border-sky-400/30 text-[9px] text-sky-300">
              detección automática
            </Badge>
            {anyConnected && (
              <Badge variant="outline" className="gap-1 border-emerald-400/50 text-[9px] text-emerald-300">
                <Radio className="h-3 w-3" /> canal directo activo
              </Badge>
            )}
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-snug text-foreground/55">
            Agrupamos por tu <strong className="font-semibold text-foreground/75">cuenta</strong> y por{" "}
            <strong className="font-semibold text-foreground/75">IP pública compartida</strong>, porque el navegador no
            puede escanear la red local ni leer tu IP privada.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 border-foreground/15 text-foreground/80"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* Switch de detección automática */}
      <div className="relative mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="autodetect" className="cursor-pointer text-xs font-medium text-foreground">
            Detección automática <span className="text-foreground/45">(predeterminado)</span>
          </label>
          <p className="text-[10px] text-foreground/45">
            Registra este dispositivo en tu cuenta y refresca la lista para inferir cuáles comparten tu red.
          </p>
        </div>
        <Switch
          id="autodetect"
          checked={autoDetect}
          onCheckedChange={(v) => setAutoDetect(v)}
          aria-label="Detección automática de dispositivos"
        />
      </div>

      {/* Estado de sesión / IP pública */}
      {!hasSession && (
        <div className="relative mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-2.5 text-[11px] text-amber-200/90">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Inicia sesión para sincronizar entre dispositivos. Ahora mismo solo se guarda este dispositivo en el
            almacenamiento local del navegador.
          </span>
        </div>
      )}

      {/* Este dispositivo */}
      <div className="relative mt-3">
        <span className="text-[10px] uppercase tracking-widest text-foreground/40">Este dispositivo</span>
        <div className="mt-1.5">
          {thisDevice ? (
            <DeviceRow device={thisDevice} isSelf sameNet={false} />
          ) : (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              {loading ? "Detectando este dispositivo…" : "Activa la detección automática para registrar este dispositivo."}
            </div>
          )}
        </div>
        {thisDevice && !hasPublicIp && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-foreground/40">
            <WifiOff className="h-3 w-3" />
            No se pudo detectar tu IP pública; sin ella no se puede inferir "misma red".
          </p>
        )}
      </div>

      {/* Otros dispositivos de la cuenta */}
      <div className="relative mt-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-foreground/40">
            Dispositivos de tu cuenta
          </span>
          <Badge variant="outline" className="border-foreground/15 text-[9px] text-foreground/50">
            {others.length}
          </Badge>
          {sameNetwork.length > 0 && (
            <Badge variant="outline" className="gap-1 border-emerald-400/30 text-[9px] text-emerald-300">
              <Wifi className="h-3 w-3" /> {sameNetwork.length} en tu red
            </Badge>
          )}
        </div>
        <div className="mt-1.5 space-y-1.5">
          {others.length === 0 ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-2.5 text-[11px] text-foreground/45">
              {hasSession
                ? "Aún no hay otros dispositivos en tu cuenta. Abre StarSeed en otro equipo con la misma sesión para verlo aquí."
                : "Inicia sesión para ver y sincronizar tus otros dispositivos."}
            </div>
          ) : (
            others.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                isSelf={false}
                sameNet={sameNetIds.has(d.id)}
                peer={peers[d.id]}
              />
            ))
          )}
        </div>
      </div>

      {/* Sincronización por red directa (WebRTC REAL) */}
      <div className="relative mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldQuestion className="h-4 w-4 text-emerald-300" />
          <span className="text-xs font-semibold text-foreground">Sincronización por red directa</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              lanStatus === "unsupported"
                ? "border-red-400/30 text-red-300"
                : "border-emerald-400/30 text-emerald-300",
            )}
          >
            {lanStatus === "unsupported" ? "no soportado" : anyConnected ? "conectado" : "listo (WebRTC)"}
          </Badge>
          {meshActive && signaling !== "none" && (
            <Badge variant="outline" className="gap-1 border-sky-400/30 text-[9px] text-sky-300">
              señal: {signaling === "realtime" ? "tiempo real" : "sondeo"}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-foreground/50">
          {describeLanSync(anyConnected ? "connected" : lanStatus)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => void onDirectSync()}
            disabled={syncing || lanStatus === "unsupported"}
            title="Inicia una conexión P2P directa (WebRTC) con los dispositivos de tu red. Señalización por tu cuenta; STUN público, sin TURN."
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Sincronizar por red directa
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10"
            onClick={() => onPing()}
            disabled={!anyConnected || pinging}
            title="Envía un ping por el canal directo (data channel) y muestra el eco."
          >
            {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Probar envío
          </Button>

          {anyConnected && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
              <Radio className="h-3 w-3" /> {connectedCount} canal(es) directo(s)
            </span>
          )}
          {sameNetwork.length === 0 && others.length === 0 && lanStatus !== "unsupported" && (
            <span className="text-[10px] text-foreground/40">
              (sin otros dispositivos con sesión; el canal de señalización queda listo igualmente)
            </span>
          )}
        </div>

        {/* Resultado del intento de sincronización */}
        {syncResult && (
          <div
            className={cn(
              "mt-2 flex items-start gap-1.5 rounded-lg border p-2 text-[10px]",
              syncResult.ok
                ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200"
                : "border-amber-400/25 bg-amber-400/[0.06] text-amber-200/90",
            )}
          >
            {syncResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{syncResult.detail}</span>
          </div>
        )}

        {/* Log del ping/eco */}
        {pingLog.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2">
            {pingLog.map((line, i) => (
              <div key={i} className="font-mono text-[9px] leading-snug text-foreground/60">
                {line}
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-[9px] leading-snug text-foreground/35">
          Conexión P2P (WebRTC) directa entre dispositivos; la señalización (oferta/respuesta SDP + ICE) viaja por tu
          cuenta soberana, sin servidor de terceros. Requiere sesión abierta en ambos y soporte WebRTC. Usa STUN
          público sin TURN: en redes con NAT simétrico la conexión directa puede no establecerse.
        </p>
      </div>
    </div>
  );
}
