"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plug,
  RefreshCw,
  Sparkles,
  Wand2,
  CloudUpload,
  Database,
  Archive,
  FolderSync,
  Server,
  Network,
  CheckCircle2,
  Circle,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import StoragePanel from "@/components/storage/storage-panel";
import { listBackends } from "@/lib/storage/backends";

const BOT_BASE = "https://starseed-neurocortex.vercel.app";

const SCOPES: { id: string; label: string }[] = [
  { id: "account", label: "Cuenta" },
  { id: "profile", label: "Perfil" },
  { id: "group", label: "Grupo" },
  { id: "page", label: "Página" },
];

type DriveState = { loading: boolean; connected: boolean | null; available: boolean; quotaMb?: number | null; usedMb?: number };

export default function ConnectionsHub() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState("account");
  const [scopeRef, setScopeRef] = useState("");
  const [showStorage, setShowStorage] = useState(false);
  const [backendCount, setBackendCount] = useState<number | null>(null);

  const [drive, setDrive] = useState<DriveState>({ loading: false, connected: null, available: true });

  const [suggesting, setSuggesting] = useState(false);
  const [plan, setPlan] = useState("");

  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        setUserId(au?.user?.id ?? null);
      } catch {
        setUserId(null);
      }
    })();
  }, []);

  const refreshDrive = useCallback(async () => {
    if (!userId) return;
    setDrive((d) => ({ ...d, loading: true }));
    try {
      const st = await fetch(`${BOT_BASE}/api/drive?action=status&account_id=${userId}`).then((r) => r.json());
      if (!st?.ok) {
        setDrive({ loading: false, connected: null, available: false });
        return;
      }
      if (!st.connected) {
        setDrive({ loading: false, connected: false, available: true });
        return;
      }
      const about = await fetch(`${BOT_BASE}/api/drive?action=about&account_id=${userId}`).then((r) => r.json());
      let quotaMb: number | null = null;
      let usedMb = 0;
      if (about?.ok && about.storageQuota) {
        const limit = Number(about.storageQuota.limit);
        const usage = Number(about.storageQuota.usage);
        if (Number.isFinite(limit) && limit > 0) quotaMb = Math.round(limit / (1024 * 1024));
        if (Number.isFinite(usage)) usedMb = Math.round(usage / (1024 * 1024));
      }
      setDrive({ loading: false, connected: true, available: true, quotaMb, usedMb });
    } catch {
      setDrive({ loading: false, connected: null, available: false });
    }
  }, [userId]);

  const refreshCounts = useCallback(async () => {
    try {
      const list = await listBackends(scope, scope === "account" ? null : scopeRef || null);
      setBackendCount(list.length);
    } catch {
      setBackendCount(null);
    }
  }, [scope, scopeRef]);

  useEffect(() => {
    if (userId) refreshDrive();
  }, [userId, refreshDrive]);

  useEffect(() => {
    if (userId) refreshCounts();
  }, [userId, refreshCounts]);

  function connectDrive() {
    if (!userId) {
      toast.error("Inicia sesión para conectar Google Drive");
      return;
    }
    window.open(`${BOT_BASE}/api/drive_oauth?action=authorize&account_id=${userId}`, "_blank", "noopener,noreferrer");
  }

  async function suggestPlan() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura te guíe.");
      return;
    }
    setSuggesting(true);
    setPlan("");
    try {
      const content = `Eres Astraura, asistente de conexión de StarSeed OS. Explica brevemente, en español y en 4 pasos accionables, qué debería conectar primero el usuario y por qué, siguiendo la filosofía: empezar por el servidor StarSeed (limitado, para contexto y memorias fundamentales), luego Google Drive (su cuenta, para ficheros grandes y sync online), luego almacenamiento local con Syncthing (capacidad por dispositivo) y, opcionalmente, fuentes ilimitadas (GitHub/WebDAV/S3) como overflow. Estado actual: Drive ${
        drive.connected ? "conectado" : drive.available ? "no conectado" : "no configurado por el proyecto"
      }, ${backendCount ?? 0} almacenes configurados. Máximo 6 líneas.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setPlan(r.text);
    } catch {
      toast.error("Astraura no pudo responder. Revisa tu proveedor de IA.");
    }
    setSuggesting(false);
  }

  const checklist: { done: boolean; text: string }[] = [
    { done: (backendCount ?? 0) > 0, text: "1 · Servidor StarSeed listo (contexto y memorias fundamentales)." },
    { done: drive.connected === true, text: "2 · Conecta tu Google Drive para ficheros grandes y sync online." },
    { done: false, text: "3 · Configura almacenamiento local con Syncthing (capacidad por dispositivo)." },
    { done: (backendCount ?? 0) > 1, text: "4 · Añade fuentes ilimitadas (GitHub/WebDAV/S3) como overflow." },
  ];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">Conexiones · guiado por Astraura</span>
            <span className="text-[11px] text-cyan-300/70">
              Conecta servicios, cuentas, agentes, APIs y almacenes. Server vs Drive vs local — cada uno con su rol.
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2 border-cyan-500/30 text-cyan-100" onClick={() => { refreshDrive(); refreshCounts(); }}>
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Scope */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-cyan-300/60">Ámbito</span>
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                scope === s.id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope !== "account" && (
          <Input
            value={scopeRef}
            onChange={(e) => setScopeRef(e.target.value)}
            placeholder="ID del perfil/grupo/página"
            className="h-8 w-56 border-white/15 bg-black/30 text-white placeholder:text-white/30"
          />
        )}
      </div>

      {/* Asistente de conexión */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-300" />
          <span className="text-sm font-semibold text-fuchsia-50">Asistente de conexión</span>
          <span className="text-[11px] text-fuchsia-300/70">Astraura te dice qué conectar primero y por qué.</span>
          <Button size="sm" className="ml-auto gap-2 bg-fuchsia-600 text-white hover:bg-fuchsia-500" onClick={suggestPlan} disabled={suggesting}>
            <Wand2 className={cn("h-4 w-4", suggesting && "animate-pulse")} /> Guíame
          </Button>
        </div>
        <div className="mt-3 space-y-1.5">
          {checklist.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              {c.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-white/25" />}
              <span className={cn(c.done ? "text-emerald-200/90" : "text-white/60")}>{c.text}</span>
            </div>
          ))}
        </div>
        {!hasProvider && (
          <p className="mt-2 text-[11px] text-fuchsia-200/60">Activa un proveedor de IA en Ajustes → IA & Modelos para el asistente.</p>
        )}
        {plan && (
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-black/30 p-3 text-[12px] leading-relaxed text-fuchsia-100">
            {plan}
          </pre>
        )}
      </div>

      {/* Connection cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Google Drive */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-green-600">
              <CloudUpload className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Google Drive (tu cuenta)</span>
            <DriveChip drive={drive} />
          </div>
          <p className="mt-2 text-[11px] text-white/50">Tu propia cuenta vía OAuth. Para ficheros grandes y sincronizables online.</p>
          {drive.connected && drive.quotaMb != null && (
            <p className="mt-1 text-[11px] text-emerald-300/80">{drive.usedMb} / {drive.quotaMb} MB usados</p>
          )}
          {drive.available === false && (
            <p className="mt-1 text-[11px] text-amber-300/80">Drive no configurado por el proyecto aún.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500" onClick={connectDrive}>
              <Plug className="h-4 w-4" /> Conectar
            </Button>
            <Button size="sm" variant="outline" className="gap-2 border-white/15 text-white/70" onClick={refreshDrive} disabled={drive.loading}>
              <RefreshCw className={cn("h-4 w-4", drive.loading && "animate-spin")} /> Comprobar
            </Button>
          </div>
        </div>

        {/* Almacenes */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-500 to-fuchsia-600">
              <Database className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Almacenes</span>
            <Badge variant="outline" className="border-white/15 text-[9px] text-white/50">
              {backendCount ?? "—"} fuentes
            </Badge>
          </div>
          <p className="mt-2 text-[11px] text-white/50">Multi-fuente con enrutado inteligente: server, Drive, local, GitHub, WebDAV, S3…</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="gap-2 bg-violet-600 text-white hover:bg-violet-500" onClick={() => setShowStorage((v) => !v)}>
              <Database className="h-4 w-4" /> {showStorage ? "Ocultar" : "Configurar aquí"}
            </Button>
            <Link href="/almacenes">
              <Button size="sm" variant="outline" className="gap-2 border-white/15 text-white/70">
                Abrir /almacenes <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Bóveda cifrada */}
        <ConnCard
          icon={<Archive className="h-4 w-4 text-white" />}
          grad="from-amber-500 to-fuchsia-600"
          title="Bóveda cifrada"
          blurb="Tus baúles de memorias y secretos, cifrados y soberanos."
          href="/baules"
          cta="Abrir baúles"
        />

        {/* Syncthing */}
        <ConnCard
          icon={<FolderSync className="h-4 w-4 text-white" />}
          grad="from-cyan-500 to-sky-600"
          title="Sincronización (Syncthing)"
          blurb="Sync P2P cifrada entre tus dispositivos. Capacidad local por equipo."
          href="/sincronizacion"
          cta="Abrir sincronización"
        />

        {/* MCP / API */}
        <ConnCard
          icon={<Server className="h-4 w-4 text-white" />}
          grad="from-indigo-500 to-violet-600"
          title="Proveedor MCP / API"
          blurb="Conecta proveedores de IA, MCP y APIs externas."
          href="/proveedor"
          cta="Abrir proveedor"
        />

        {/* Agentes / VPS */}
        <ConnCard
          icon={<Network className="h-4 w-4 text-white" />}
          grad="from-rose-500 to-orange-600"
          title="Agentes / VPS"
          blurb="Orquesta agentes y servidores que ejecutan tareas por ti."
          href="/agent"
          cta="Abrir agentes"
        />
      </div>

      {/* Embedded storage panel */}
      {showStorage && (
        <div className="rounded-xl border border-violet-500/20 bg-black/20 p-2">
          <div className="mb-2 flex items-center gap-2 px-2 pt-1 text-[11px] uppercase tracking-widest text-violet-300/60">
            <Database className="h-3.5 w-3.5" /> Almacenes (en línea)
          </div>
          <StoragePanel />
        </div>
      )}

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-white/40">
        <ListChecks className="h-3.5 w-3.5" /> Sugerencia: empieza por el servidor StarSeed, conecta tu Drive para lo
        grande, y añade local/Syncthing y fuentes ilimitadas según crezcas.
      </p>
    </div>
  );
}

function DriveChip({ drive }: { drive: DriveState }) {
  if (drive.available === false) {
    return <Badge variant="outline" className="border-amber-400/40 text-[9px] text-amber-300">No disponible</Badge>;
  }
  if (drive.connected === true) {
    return <Badge variant="outline" className="border-emerald-400/40 text-[9px] text-emerald-300">Conectado</Badge>;
  }
  if (drive.connected === false) {
    return <Badge variant="outline" className="border-amber-400/40 text-[9px] text-amber-300">Sin conectar</Badge>;
  }
  return <Badge variant="outline" className="border-white/15 text-[9px] text-white/40">—</Badge>;
}

function ConnCard({
  icon,
  grad,
  title,
  blurb,
  href,
  cta,
}: {
  icon: React.ReactNode;
  grad: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr", grad)}>{icon}</div>
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <p className="mt-2 text-[11px] text-white/50">{blurb}</p>
      <div className="mt-3">
        <Link href={href}>
          <Button size="sm" variant="outline" className="gap-2 border-white/15 text-white/70">
            {cta} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
