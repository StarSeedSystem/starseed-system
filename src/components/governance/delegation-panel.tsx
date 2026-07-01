"use client";

// StarSeed · Ontocracia — Panel de VOTO LÍQUIDO DELEGADO.
// Delegar / revocar el voto POR TEMA, con FECHA DE CADUCIDAD OBLIGATORIA, y ver
// las delegaciones activas. Respeta las cláusulas pétreas:
//   • Revocable en un clic.
//   • Por tema (nunca una cesión total perpetua).
//   • Caducidad obligatoria (el formulario exige fecha futura).
//   • Voto directo reclama el peso (se explica al usuario).
// DEFENSIVO: si la migración `vote_delegations` no está aplicada, el panel
// muestra su estado (sin delegaciones) sin romper nada.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Waypoints, Loader2, Info, X, UserCheck, CalendarClock } from "lucide-react";
import {
  createDelegation,
  revokeDelegation,
  listMyDelegations,
  receivedDelegationCount,
  topicForScope,
  topicLabel,
  type Delegation,
} from "@/lib/governance/delegations";

// Fecha ISO por defecto para la caducidad: hoy + 90 días (formato input date).
function defaultExpiry(): string {
  const d = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Resuelve el user_id de un delegado a partir de un @handle o nombre visible.
async function resolveDelegateUser(query: string): Promise<{ id: string; label: string } | null> {
  const q = query.trim().replace(/^@/, "");
  if (!q) return null;
  const supabase = createClient();
  try {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle")
      .or(`handle.eq.${q},display_name.ilike.${q}`)
      .limit(1);
    const row = (data as any[])?.[0];
    if (row?.user_id) {
      return { id: row.user_id, label: row.display_name || (row.handle ? `@${row.handle}` : row.user_id) };
    }
  } catch {
    /* best-effort */
  }
  // Permitir pegar directamente un UUID de usuario.
  if (/^[0-9a-f-]{16,}$/i.test(q)) return { id: q, label: q.slice(0, 8) + "…" };
  return null;
}

export default function DelegationPanel({
  scope,
  scopeRef,
  accent,
}: {
  // Contexto por defecto para el tema de la delegación (p.ej. group + slug).
  scope?: string;
  scopeRef?: string;
  accent?: string;
}) {
  const ac = accent ?? "#22d3ee";
  const topic = useMemo(() => topicForScope(scope || "global", scopeRef || null), [scope, scopeRef]);

  const [delegateQuery, setDelegateQuery] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiry());
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Delegation[]>([]);
  const [received, setReceived] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      setAuthed(!!au?.user?.id);
      const [list, rc] = await Promise.all([listMyDelegations(), receivedDelegationCount(topic)]);
      setMine(list);
      setReceived(rc);
    } catch {
      /* */
    }
    setLoading(false);
  }, [topic]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    load();
  }, [load]);

  async function submit() {
    if (!delegateQuery.trim()) {
      toast.error("Indica a quién delegas (nombre, @handle o ID).");
      return;
    }
    if (!expiresAt) {
      toast.error("La delegación exige una fecha de caducidad.");
      return;
    }
    setBusy(true);
    try {
      const who = await resolveDelegateUser(delegateQuery);
      if (!who) {
        toast.error("No se encontró a esa persona. Usa su @handle o su ID de usuario.");
        setBusy(false);
        return;
      }
      // Caducidad al final del día elegido (ISO).
      const iso = new Date(`${expiresAt}T23:59:59`).toISOString();
      const res = await createDelegation({
        delegateUser: who.id,
        topic,
        expiresAt: iso,
        scope: scope || null,
        scopeRef: scopeRef || null,
      });
      if (res.ok) {
        toast.success(`Voto delegado a ${who.label} · caduca el ${expiresAt}`);
        setDelegateQuery("");
        await load();
      } else {
        toast.error(res.error ?? "No se pudo delegar.");
      }
    } catch {
      toast.error("No se pudo delegar.");
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      const res = await revokeDelegation(id);
      if (res.ok) {
        toast.success("Delegación revocada. Recuperas tu voz.");
        await load();
      } else {
        toast.error(res.error ?? "No se pudo revocar.");
      }
    } catch {
      toast.error("No se pudo revocar.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: `${ac}22`, color: ac }}
        >
          <Waypoints className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-cyan-50">Voto líquido delegado</span>
          <span className="text-[11px] text-cyan-300/70">
            Delega tu voz en quien más sepa de un tema — revocable y con caducidad. Tema:{" "}
            <span className="text-cyan-200">{topicLabel(topic)}</span>
          </span>
        </div>
        {received > 0 && (
          <Badge
            variant="outline"
            className="ml-auto gap-1 text-[10px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10"
            title="Voces que representas en este tema, además de la tuya."
          >
            <UserCheck className="h-3 w-3" /> Representas {received} vo{received === 1 ? "z" : "ces"}
          </Badge>
        )}
      </div>

      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-cyan-500/15 bg-cyan-950/20 px-3 py-2 text-[11px] leading-relaxed text-cyan-200/80">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Una persona, una voz: la delegación transfiere tu peso para este tema, nunca lo aliena para siempre.
        Si votas directamente, reclamas tu voz automáticamente. La caducidad es obligatoria.
      </p>

      {authed === false ? (
        <p className="mt-3 text-[12px] text-cyan-200/70">
          Inicia sesión para delegar o revocar tu voto.
        </p>
      ) : (
        <>
          {/* Formulario de delegación */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-white/40">Delegar en (nombre, @handle o ID)</span>
              <Input
                value={delegateQuery}
                onChange={(e) => setDelegateQuery(e.target.value)}
                placeholder="@persona"
                className="h-8 bg-white/5 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-[10px] text-white/40">
                <CalendarClock className="h-3 w-3" /> Caduca (obligatorio)
              </span>
              <Input
                type="date"
                value={expiresAt}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="h-8 bg-white/5 text-xs"
              />
            </label>
            <div className="flex items-end">
              <Button
                size="sm"
                className="h-8 w-full gap-1.5 text-white sm:w-auto"
                style={{ background: ac, color: "#0b0b12" }}
                onClick={submit}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />}
                Delegar
              </Button>
            </div>
          </div>

          {/* Delegaciones activas del usuario */}
          <div className="mt-4">
            <span className="text-[11px] uppercase tracking-widest text-cyan-300/60">
              Mis delegaciones activas
            </span>
            {loading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
              </div>
            ) : mine.length === 0 ? (
              <p className="mt-2 text-[12px] text-white/40">
                No has delegado tu voto en ningún tema. Conservas toda tu voz.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {mine.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <Badge
                      variant="outline"
                      className="text-[9px] border-cyan-400/30 text-cyan-200/80"
                    >
                      {topicLabel(d.topic)}
                    </Badge>
                    <span className="text-[11px] text-white/60">
                      → {d.delegate_user.slice(0, 8)}…
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-white/40">
                      <CalendarClock className="h-3 w-3" />
                      caduca {new Date(d.expires_at).toLocaleDateString("es-ES")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7 gap-1 border-red-400/30 text-red-200 hover:bg-red-900/20"
                      onClick={() => revoke(d.id!)}
                      disabled={busy}
                    >
                      <X className="h-3 w-3" /> Revocar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
