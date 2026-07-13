"use client";

/**
 * Pestaña CONEXIONES Y ACCESOS del Centro de Configuración (Adenda 67 · P1-1).
 * ============================================================================
 * Servidores · plugins · APIs · MCP · repos · tokens · habilidades, y los
 * permisos y accesos de Aurora. TODO reutiliza lo que ya existe en el OS — aquí
 * no se reinventa nada:
 *
 *   · APIs / tokens  → `SourceKeyInput` (el MISMO de Ajustes → Inteligencia): la
 *     clave se cifra con AES-GCM y se queda EN ESTE DISPOSITIVO. Nunca viaja a la
 *     cuenta (no está en SYNCED_KEYS, por diseño).
 *   · Plugins/servicios externos → `UserConnectorsHub` (modo automático /
 *     preferir mi cuenta / sólo gratis-OSS + credenciales locales).
 *   · MCP → `McpPanel` (registro real de servidores MCP del OS).
 *   · Repos → la Biblioteca (`listRepos` / `addRepoByUrl` / `removeRepo`).
 *   · Servidores → registro de servidores de cerebros (`listServers`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SourceKeyInput } from "@/components/settings/ai/intelligence-panel";
import { UserConnectorsHub } from "@/components/connectors";
import { McpPanel } from "@/components/hermes/mcp-panel";
import { FREE_CATALOG, type CatalogSource } from "@/ai/astraura/free-catalog";
import { detectAvailabilitySafe, type SourceAvailability } from "@/ai/astraura/availability";
import { listRepos, addRepoByUrl, removeRepo, type LibraryRepo } from "@/lib/library/packages";
import { listServers, type RegistryServer } from "@/lib/brains/servers";
import { Block, Note, btnCls, inputCls } from "./setup-ui";

export function SetupConexiones() {
  const [avail, setAvail] = useState<SourceAvailability[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [repos, setRepos] = useState<LibraryRepo[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [addingRepo, setAddingRepo] = useState(false);
  const [servers, setServers] = useState<RegistryServer[] | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      setAvail(await detectAvailabilitySafe(6000));
    } finally {
      setDetecting(false);
    }
  }, []);

  const refreshRepos = useCallback(() => {
    try {
      setRepos(listRepos());
    } catch {
      setRepos([]);
    }
  }, []);

  useEffect(() => {
    void detect();
    refreshRepos();
    void (async () => {
      try {
        setServers(await listServers());
      } catch {
        setServers([]);
      }
    })();
  }, [detect, refreshRepos]);

  /** Fuentes que aceptan clave (obligatoria u opcional) — las de pago fuera. */
  const keyable: CatalogSource[] = useMemo(
    () => FREE_CATALOG.filter((s) => s.tier !== "paid" && (s.requiresKey || s.keyOptional)),
    [],
  );

  const connected = useMemo(() => {
    const set = new Set<string>();
    for (const a of avail ?? []) if (a.userConfig?.encryptedKey) set.add(a.source.id);
    return set;
  }, [avail]);

  const instantReady = useMemo(
    () => (avail ?? []).filter((a) => a.ready && a.source.tier === "instant").length,
    [avail],
  );

  const addRepo = useCallback(async () => {
    const url = repoUrl.trim();
    if (!url) return;
    setAddingRepo(true);
    try {
      const r = await addRepoByUrl(url);
      if (r.ok) {
        toast.success(r.message || "Repo añadido.");
        setRepoUrl("");
        refreshRepos();
      } else {
        toast.error(r.message || "No pude añadir ese repo.");
      }
    } catch {
      toast.error("No pude añadir ese repo.");
    } finally {
      setAddingRepo(false);
    }
  }, [repoUrl, refreshRepos]);

  return (
    <div className="space-y-3">
      <Note kind="ok">
        <strong>No hace falta conectar nada.</strong> Aurora ya funciona con{" "}
        {instantReady > 0 ? `${instantReady} fuente${instantReady === 1 ? "" : "s"} sin clave` : "fuentes sin clave"}{" "}
        detectadas ahora mismo. Todo lo de abajo es opcional: sube límites o añade capacidades.
      </Note>

      {/* ── APIs y tokens de inteligencia ── */}
      <Block
        title="APIs y tokens de inteligencia"
        icon="KeyRound"
        hint="Claves gratuitas que amplían lo que Aurora puede usar."
        right={
          <button type="button" className={btnCls} onClick={() => void detect()} disabled={detecting}>
            <RefreshCw className={cn("h-3 w-3", detecting && "animate-spin")} /> Detectar
          </button>
        }
      >
        <Note kind="info">
          Las claves se cifran (AES-GCM) y se guardan <strong>sólo en este dispositivo</strong>. Nunca se
          sincronizan con tu cuenta ni salen de aquí.
        </Note>
        <div className="mt-2 space-y-1.5">
          {keyable.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 transition-colors duration-200 hover:border-white/20"
            >
              <div className="flex flex-wrap items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-[#7fb8ff]" />
                <span className="text-xs font-medium text-white/85">{s.label}</span>
                <span className="rounded-full border border-white/12 bg-white/5 px-1.5 py-0.5 text-[9.5px] text-white/55">
                  {s.requiresKey ? "clave gratis" : "clave opcional"}
                </span>
                {connected.has(s.id) && (
                  <span className="rounded-full border border-[#39FF14]/30 bg-[#39FF14]/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#a8f59c]">
                    Conectada
                  </span>
                )}
                <span className="ml-auto text-[10px] text-white/40">{s.limits}</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-white/45">{s.why}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <SourceKeyInput source={s} onSaved={() => void detect()} />
                {s.getKeyUrl && (
                  <a
                    href={s.getKeyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-[#7fb8ff] underline-offset-2 hover:underline"
                  >
                    Conseguir la clave <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </Block>

      {/* ── Repos de la Biblioteca ── */}
      <Block
        title="Repos de la Biblioteca"
        icon="GitBranch"
        hint="Catálogos de habilidades, agentes, temas y programas que Aurora puede instalar."
      >
        <div className="mb-2 flex gap-2">
          <input
            type="url"
            className={inputCls}
            value={repoUrl}
            placeholder="https://… (JSON del repo)"
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addRepo();
            }}
          />
          <button type="button" className={btnCls} onClick={() => void addRepo()} disabled={addingRepo || !repoUrl.trim()}>
            <Plus className="h-3 w-3" /> Añadir
          </button>
        </div>
        <ul className="space-y-1">
          {repos.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] text-white/85">{r.name}</span>
                <span className="block truncate text-[10px] text-white/40">
                  {r.packages?.length ?? 0} paquete{(r.packages?.length ?? 0) === 1 ? "" : "s"}
                  {r.url ? ` · ${r.url}` : " · integrado en StarSeed"}
                </span>
              </span>
              {r.url && (
                <button
                  type="button"
                  className="cursor-pointer rounded-md p-1 text-white/35 transition-colors duration-200 hover:text-[#DC143C]"
                  title="Quitar repo"
                  onClick={() => {
                    const res = removeRepo(r.id);
                    if (res.ok) {
                      toast.success(res.message || "Repo quitado.");
                      refreshRepos();
                    } else toast.error(res.message || "No pude quitarlo.");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
          {repos.length === 0 && (
            <li className="text-[11px] text-white/40">Aún no hay repos. Los de StarSeed vienen integrados.</li>
          )}
        </ul>
      </Block>

      {/* ── Servidores ── */}
      <Block title="Servidores" icon="Server" hint="Dónde vive el cómputo y el almacenamiento de tus cerebros.">
        {servers === null ? (
          <p className="text-[11px] text-white/40">Cargando servidores…</p>
        ) : servers.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] text-white/50">
              No tienes servidores propios registrados. No hace falta: Aurora funciona con el servidor
              gestionado de StarSeed y con las fuentes gratuitas.
            </p>
            <Link href="/servidores" className={btnCls}>
              <Server className="h-3 w-3" /> Añadir un servidor
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {servers.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
              >
                <Server className="h-3.5 w-3.5 shrink-0 text-white/50" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/85">{s.name}</span>
                <span className="shrink-0 text-[10px] text-white/40">{s.status ?? "—"}</span>
              </div>
            ))}
            <Link href="/servidores" className={cn(btnCls, "mt-1.5")}>
              <ExternalLink className="h-3 w-3" /> Gestionar servidores
            </Link>
          </div>
        )}
      </Block>

      {/* ── Plugins / servicios externos (Hub de Conectores real) ── */}
      <Block
        title="Plugins y servicios externos"
        icon="Plug"
        hint="Por defecto: sólo opciones gratuitas y de código abierto. Conecta tus cuentas sólo si quieres."
      >
        <div className="rounded-xl border border-white/8 bg-black/20 p-2">
          <UserConnectorsHub />
        </div>
      </Block>

      {/* ── MCP ── */}
      <Block title="MCP (Model Context Protocol)" icon="Cable" hint="Servidores que exponen herramientas a Aurora.">
        <div className="rounded-xl border border-white/8 bg-black/20 p-2">
          <McpPanel />
        </div>
      </Block>

      {/* ── Permisos y accesos ── */}
      <Block title="Permisos y accesos de Aurora" icon="ShieldCheck" hint="Qué puede tocar y qué no.">
        <ul className="space-y-1.5 text-[11px] text-white/60">
          <li>
            <strong className="text-white/85">Permisos del dispositivo</strong> (micrófono, cámara, captura
            de pantalla, ubicación): se conceden uno a uno en{" "}
            <Link href="/sentidos" className="text-[#7fb8ff] underline-offset-2 hover:underline">
              Ajustes → Sentidos
            </Link>
            .
          </li>
          <li>
            <strong className="text-white/85">Permisos por personalidad</strong> (publicar, responder,
            controlar el perfil, aprender): en la pestaña <strong>Personalidad</strong> de este centro.
          </li>
          <li>
            <strong className="text-white/85">Habilidades por cerebro y neurona</strong>: en la pestaña{" "}
            <strong>Astraura</strong>.
          </li>
        </ul>
      </Block>
    </div>
  );
}

export default SetupConexiones;
