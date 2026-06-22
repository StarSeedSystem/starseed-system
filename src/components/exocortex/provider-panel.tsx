"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plug,
  Plus,
  Trash2,
  Copy,
  Check,
  KeyRound,
  Ban,
  ShieldCheck,
  BookOpen,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BOT_BASE = "https://starseed-neurocortex.vercel.app";

type ProviderToken = {
  id: string;
  owner: string;
  token: string;
  label: string | null;
  scope: string;
  scope_ref: string | null;
  perms: string[];
  revoked: boolean;
  created_at: string;
};

const SCOPES: [string, string][] = [
  ["account", "Cuenta"],
  ["profile", "Perfil"],
  ["group", "Grupo"],
  ["page", "Página"],
];

function genToken(): string {
  // ssk_ + 40 chars hex desde crypto.getRandomValues
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ssk_${hex}`;
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20 shrink-0"
      title={label || "Copiar"}
    >
      {done ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {done ? "Copiado" : label || "Copiar"}
    </button>
  );
}

export default function ProviderPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ProviderToken[]>([]);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState("account");
  const [scopeRef, setScopeRef] = useState("");
  const [canRead, setCanRead] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data } = await sb
          .from("provider_tokens")
          .select("*")
          .eq("owner", uid)
          .order("created_at", { ascending: false });
        setTokens((data as ProviderToken[]) ?? []);
      }
    } catch {
      /* */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function createToken() {
    if (!userId) return;
    const perms: string[] = [];
    if (canRead) perms.push("read");
    if (canWrite) perms.push("write");
    if (perms.length === 0) perms.push("read");
    setBusy(true);
    try {
      const sb = createClient();
      const token = genToken();
      const row = {
        owner: userId,
        token,
        label: label.trim() || null,
        scope,
        scope_ref: scopeRef.trim() || null,
        perms,
      };
      const { data, error } = await sb
        .from("provider_tokens")
        .insert(row)
        .select("*")
        .single();
      if (!error && data) {
        setFreshToken(token);
        setActiveId((data as ProviderToken).id);
        setLabel("");
        setScopeRef("");
        await load();
      }
    } catch {
      /* */
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    try {
      const sb = createClient();
      await sb.from("provider_tokens").update({ revoked: true }).eq("id", id);
      await load();
    } catch {
      /* */
    }
  }
  async function remove(id: string) {
    try {
      const sb = createClient();
      await sb.from("provider_tokens").delete().eq("id", id);
      if (activeId === id) {
        setActiveId(null);
        setFreshToken(null);
      }
      await load();
    } catch {
      /* */
    }
  }

  const active = tokens.find((t) => t.id === activeId) || null;
  // El token real sólo lo tenemos en claro tras crearlo (freshToken). Para
  // tokens previos mostramos un placeholder que el usuario sustituye.
  const tokenForActive =
    active && freshToken && active.id === activeId ? freshToken : "<TU_TOKEN>";

  const restUrl = `${BOT_BASE}/api/provider?resource=memories&token=${tokenForActive}`;
  const mcpUrl = `${BOT_BASE}/api/mcp`;
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        starseed: {
          url: mcpUrl,
          headers: { Authorization: `Bearer ${tokenForActive}` },
        },
      },
    },
    null,
    2,
  );

  if (!userId)
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60 m-1">
        Inicia sesión para administrar tus tokens de proveedor.
      </div>
    );

  return (
    <div className="space-y-5 p-1">
      {/* Cabecera / framing Astraura */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center">
          <Plug className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-cyan-50">
            StarSeed como proveedor · conecta tus herramientas externas
          </div>
          <div className="text-[11px] text-cyan-300/60">
            Genera un token por cuenta y deja que Claude Desktop, Codex o
            cualquier cliente MCP/HTTP lea y escriba tus memorias y los chats de
            Astraura. Con permiso de escritura, el cliente externo puede crear
            memorias y enviar mensajes a tus chats de StarSeed.
          </div>
        </div>
      </div>

      {/* Checklist guiada */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-2 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Guía rápida
        </div>
        <ol className="text-[12px] text-white/70 space-y-1 list-decimal list-inside">
          <li>Genera un token con una etiqueta para identificar el cliente.</li>
          <li>Elige permisos: solo lectura, o lectura + escritura (bidireccional).</li>
          <li>Pega la config MCP (o la URL REST) en tu cliente y empieza a usar Astraura.</li>
        </ol>
      </div>

      {/* Formulario: generar token */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm font-semibold text-cyan-50 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-cyan-400" /> Generar token
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (p. ej. Claude Desktop, Codex)"
            className="bg-white/5"
          />
          <div className="flex gap-2">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90"
            >
              {SCOPES.map(([v, l]) => (
                <option key={v} value={v} className="bg-neutral-900">
                  {l}
                </option>
              ))}
            </select>
            <Input
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              placeholder="scope_ref (opcional)"
              className="bg-white/5 flex-1"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={canRead}
              onChange={(e) => setCanRead(e.target.checked)}
              className="accent-cyan-500"
            />
            <BookOpen className="w-3.5 h-3.5 text-cyan-300/70" /> Lectura
          </label>
          <label className="inline-flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={canWrite}
              onChange={(e) => setCanWrite(e.target.checked)}
              className="accent-fuchsia-500"
            />
            <MessageSquare className="w-3.5 h-3.5 text-fuchsia-300/70" /> Escritura
            (crear memorias · enviar mensajes)
          </label>
          <Button
            size="sm"
            className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white ml-auto"
            disabled={busy}
            onClick={createToken}
          >
            <Plus className="w-4 h-4" /> Generar token
          </Button>
        </div>
      </div>

      {/* Token recién creado (se muestra una vez) */}
      {freshToken && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
          <div className="text-[12px] font-semibold text-amber-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Tu nuevo token (guárdalo, no se
            vuelve a mostrar)
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all rounded-md bg-black/40 border border-amber-500/20 px-3 py-2 text-[12px] text-amber-50">
              {freshToken}
            </code>
            <CopyBtn value={freshToken} label="Copiar token" />
          </div>
          <div className="text-[10px] text-amber-300/60">
            Por seguridad solo se muestra en claro ahora. Si lo pierdes, revócalo
            y genera otro.
          </div>
        </div>
      )}

      {/* Lista de tokens */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 px-1">
          Tus tokens
        </div>
        {tokens.length === 0 ? (
          <div className="text-sm text-white/40 px-1">
            Aún no tienes tokens. Genera uno arriba para conectar un cliente.
          </div>
        ) : (
          tokens.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-xl border bg-white/5 p-3",
                activeId === t.id ? "border-cyan-400/50" : "border-white/10",
                t.revoked && "opacity-60",
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setActiveId(activeId === t.id ? null : t.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <KeyRound className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-sm font-medium text-cyan-50 truncate">
                    {t.label || "Sin etiqueta"}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] border-cyan-500/30 text-cyan-200/70"
                  >
                    {t.scope}
                    {t.scope_ref ? `:${t.scope_ref}` : ""}
                  </Badge>
                  {(t.perms || []).map((p) => (
                    <Badge
                      key={p}
                      variant="outline"
                      className={cn(
                        "text-[9px]",
                        p === "write"
                          ? "border-fuchsia-500/30 text-fuchsia-200/80"
                          : "border-emerald-500/30 text-emerald-200/80",
                      )}
                    >
                      {p}
                    </Badge>
                  ))}
                  {t.revoked && (
                    <Badge
                      variant="outline"
                      className="text-[9px] border-red-500/30 text-red-300/80"
                    >
                      revocado
                    </Badge>
                  )}
                  <span className="text-[10px] text-white/35 ml-1">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </button>
                {!t.revoked && (
                  <button
                    onClick={() => revoke(t.id)}
                    className="text-white/30 hover:text-amber-400"
                    title="Revocar"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => remove(t.id)}
                  className="text-white/30 hover:text-red-400"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Info de conexión para el token activo */}
              {activeId === t.id && (
                <div className="mt-3 pl-6 space-y-3">
                  {!(freshToken && t.id === activeId) && (
                    <div className="text-[10px] text-amber-300/70 bg-amber-950/20 border border-amber-500/20 rounded-md px-2 py-1">
                      Sustituye <code>&lt;TU_TOKEN&gt;</code> por el token real
                      (solo se mostró al crearlo).
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-1">
                      REST (lectura/escritura HTTP)
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 break-all rounded-md bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/80">
                        {restUrl}
                      </code>
                      <CopyBtn value={restUrl} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-1">
                      Endpoint MCP
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 break-all rounded-md bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/80">
                        {mcpUrl}
                      </code>
                      <CopyBtn value={mcpUrl} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300/50 mb-1">
                      Config para tu cliente MCP (pégala tal cual)
                    </div>
                    <div className="flex items-start gap-2">
                      <pre className="flex-1 min-w-0 overflow-x-auto rounded-md bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/80">
                        {mcpConfig}
                      </pre>
                      <CopyBtn value={mcpConfig} label="Copiar config" />
                    </div>
                  </div>
                  <div className="text-[10px] text-white/35">
                    Bidireccional: con permiso de escritura, el cliente externo
                    puede crear memorias y enviar mensajes a tus chats de
                    StarSeed. Sin él, solo lectura.
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
