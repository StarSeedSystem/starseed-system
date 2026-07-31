"use client";

/**
 * StarSeed OS — ADMINISTRACIÓN DE TOKENS DEL SERVIDOR PROPIO (Adenda 117).
 * ============================================================================
 * Panel colapsable para administrar el ciclo de vida de tokens de un servidor
 * propio (el de referencia, docs/examples/starseed-mesh-server) DIRECTAMENTE
 * desde el OS: emitir tokens de grupo/cuenta, revocarlos y ROTAR la clave de
 * firma (con gracia o revocación masiva). La clave de admin se teclea en el
 * momento y NUNCA se persiste.
 */

import { useState } from "react";
import { KeyRound, Loader2, Plus, RotateCcw, ShieldX, Copy, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMeshServer } from "@/ai/astraura/mesh";
import {
  issueServerToken,
  revokeServerToken,
  rotateServerTokenKey,
  type IssuedToken,
} from "@/ai/astraura/mesh/server-admin";

const TTL_OPTS: { label: string; ms: number }[] = [
  { label: "1 hora", ms: 3_600_000 },
  { label: "24 horas", ms: 86_400_000 },
  { label: "7 días", ms: 604_800_000 },
  { label: "30 días", ms: 2_592_000_000 },
  { label: "1 año", ms: 31_536_000_000 },
];

type Msg = { kind: "ok" | "err"; text: string } | null;

export function ServerTokenAdmin({
  serverId,
  onTokenSaved,
}: {
  serverId: string;
  onTokenSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [ids, setIds] = useState("");
  const [ttlMs, setTtlMs] = useState(TTL_OPTS[1].ms);
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [revokeInput, setRevokeInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [copied, setCopied] = useState(false);

  const needAdmin = () => {
    if (adminToken.trim()) return true;
    setMsg({ kind: "err", text: "Introduce la clave de admin del servidor." });
    return false;
  };

  const doIssue = async () => {
    if (!needAdmin()) return;
    const idList = ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!idList.length) {
      setMsg({ kind: "err", text: "Indica al menos una identidad (p. ej. group:barrio o el uuid de la cuenta)." });
      return;
    }
    setBusy("issue");
    setMsg(null);
    const r = await issueServerToken(serverId, adminToken.trim(), idList, ttlMs);
    setBusy(null);
    if (r.ok && r.data) {
      setIssued(r.data);
      setMsg({ kind: "ok", text: `Token emitido para ${idList.join(", ")}.` });
    } else {
      setMsg({ kind: "err", text: r.detail });
    }
  };

  const useToken = () => {
    if (!issued) return;
    updateMeshServer(serverId, { token: issued.token });
    setMsg({ kind: "ok", text: "Token guardado como acceso de este servidor." });
    onTokenSaved?.();
  };

  const copyToken = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles no disponible */
    }
  };

  const doRevoke = async () => {
    if (!needAdmin()) return;
    if (!revokeInput.trim()) {
      setMsg({ kind: "err", text: "Pega el token a revocar." });
      return;
    }
    setBusy("revoke");
    setMsg(null);
    const r = await revokeServerToken(serverId, adminToken.trim(), revokeInput.trim());
    setBusy(null);
    if (r.ok) {
      setRevokeInput("");
      setMsg({ kind: "ok", text: "Token revocado (dejará de funcionar de inmediato)." });
    } else {
      setMsg({ kind: "err", text: r.detail });
    }
  };

  const doRotate = async (dropPrev: boolean) => {
    if (!needAdmin()) return;
    if (dropPrev && !confirmDrop) {
      setConfirmDrop(true);
      return;
    }
    setConfirmDrop(false);
    setBusy(dropPrev ? "rotate-drop" : "rotate");
    setMsg(null);
    const r = await rotateServerTokenKey(serverId, adminToken.trim(), dropPrev);
    setBusy(null);
    if (r.ok && r.data) {
      setMsg({
        kind: "ok",
        text: dropPrev
          ? `Clave rotada (${r.data.kid}). Todos los tokens anteriores quedan invalidados.`
          : `Clave rotada (${r.data.kid}). Los tokens vigentes siguen valiendo hasta caducar.`,
      });
    } else {
      setMsg({ kind: "err", text: r.detail });
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:text-white/90"
      >
        <KeyRound className="h-3.5 w-3.5 text-amber-300" /> Administrar tokens
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-white/10 p-2.5">
          <div>
            <Input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Clave de admin del servidor (STARSEED_ADMIN_TOKEN)"
              className="h-8 text-[12px]"
              autoComplete="off"
            />
            <p className="mt-1 text-[9px] text-white/35">No se guarda: se usa solo para esta operación.</p>
          </div>

          {/* Emitir */}
          <div className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">Emitir token</p>
            <Input
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              placeholder="Identidades: group:barrio, uuid-de-cuenta…"
              className="h-8 text-[12px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {TTL_OPTS.map((o) => (
                <button
                  key={o.ms}
                  type="button"
                  onClick={() => setTtlMs(o.ms)}
                  className={cn(
                    "cursor-pointer rounded-md border px-2 py-0.5 text-[10px] transition-colors",
                    ttlMs === o.ms
                      ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                      : "border-white/10 text-white/55 hover:text-white/80",
                  )}
                >
                  {o.label}
                </button>
              ))}
              <Button
                size="sm"
                className="ml-auto h-7 px-2 text-[11px]"
                onClick={doIssue}
                disabled={busy === "issue"}
              >
                {busy === "issue" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />} Emitir
              </Button>
            </div>
            {issued && (
              <div className="space-y-1 rounded-md border border-amber-400/25 bg-amber-500/[0.06] p-1.5">
                <p className="break-all font-mono text-[10px] leading-snug text-amber-100/90">{issued.token}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={copyToken}>
                    {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />} {copied ? "Copiado" : "Copiar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={useToken}>
                    Usar en este servidor
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Rotar clave de firma */}
          <div className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">Clave de firma</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => doRotate(false)}
                disabled={busy === "rotate"}
              >
                {busy === "rotate" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />} Rotar (con gracia)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 px-2 text-[11px]",
                  confirmDrop ? "bg-red-500/20 text-red-200" : "text-red-300/80 hover:text-red-200",
                )}
                onClick={() => doRotate(true)}
                disabled={busy === "rotate-drop"}
              >
                {busy === "rotate-drop" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldX className="mr-1 h-3 w-3" />}
                {confirmDrop ? "¿Seguro? Invalida todos" : "Rotar y revocar todos"}
              </Button>
            </div>
            <p className="text-[9px] text-white/35">
              &laquo;Rotar y revocar todos&raquo; descarta la clave anterior: todos los tokens emitidos antes dejan de valer al instante.
            </p>
          </div>

          {/* Revocar */}
          <div className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/45">Revocar un token</p>
            <div className="flex gap-1.5">
              <Input
                value={revokeInput}
                onChange={(e) => setRevokeInput(e.target.value)}
                placeholder="Pega el token a revocar (tk_…)"
                className="h-8 flex-1 text-[12px]"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-[11px] text-red-300/80 hover:text-red-200"
                onClick={doRevoke}
                disabled={busy === "revoke"}
              >
                {busy === "revoke" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {msg && (
            <p className={cn("text-[10px] leading-snug", msg.kind === "ok" ? "text-emerald-300/90" : "text-red-300/90")}>
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ServerTokenAdmin;
