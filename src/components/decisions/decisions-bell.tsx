"use client";

/**
 * DecisionsBell — indicador global de Decisiones (sistema ontocrático StarSeed).
 * Carga las notificaciones de propuestas NO vistas del usuario actual y las
 * muestra en un popover, con enlace a /decisiones y acción "marcar visto".
 * Posición fija abajo-izquierda (distinta del widget Aurora, abajo-derecha).
 * SSR-safe: sólo consulta tras auth.getUser(); si no hay sesión, no renderiza nada.
 *
 * Tiempo real: además del polling de seguridad, se suscribe a Supabase Realtime
 * sobre `proposal_notifications` (filtrado por el usuario actual) para que las
 * nuevas decisiones aparezcan al instante. El polling lento queda como backstop.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Gavel, Check, RefreshCw } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRealtime } from "@/lib/realtime/realtime";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const POLL_MS = 45000;

type ProposalNotification = {
  id: string;
  proposal_id: string;
  user_id: string;
  kind: string | null;
  message: string | null;
  seen: boolean;
  created_at: string;
  proposals?: { title: string | null } | null;
};

export function DecisionsBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ProposalNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const supabaseRef = useRef(createClient());

  const load = useCallback(async (uid: string) => {
    const supabase = supabaseRef.current;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("proposal_notifications")
        .select("id, proposal_id, user_id, kind, message, seen, created_at, proposals(title)")
        .eq("user_id", uid)
        .eq("seen", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && data) {
        setItems(data as unknown as ProposalNotification[]);
      }
    } catch {
      /* silencioso: el indicador no debe romper la app */
    } finally {
      setLoading(false);
    }
  }, []);

  // ── carga inicial (SSR-safe): sólo consultamos tras auth.getUser() ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const supabase = supabaseRef.current;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id || null;
        if (cancelled) return;
        setUserId(uid);
        setReady(true);
        if (uid) await load(uid);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // ── TIEMPO REAL: nuevas/actualizadas notificaciones del usuario actual ──
  // Cualquier INSERT/UPDATE/DELETE sobre `proposal_notifications` del usuario
  // dispara una recarga, de modo que el badge y la lista se actualizan al
  // instante (RLS limita lo que el cliente puede recibir). Mientras no haya
  // `userId`, el filtro es undefined y el hook es no-op.
  useRealtime(
    "proposal_notifications",
    { filter: userId ? `user_id=eq.${userId}` : undefined, event: "*" },
    () => {
      if (userId) void load(userId);
    }
  );

  // ── polling en montaje (backstop, mientras haya sesión) ──
  useEffect(() => {
    if (!userId) return;
    const id = window.setInterval(() => {
      void load(userId);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [userId, load]);

  const refresh = useCallback(() => {
    if (userId) void load(userId);
  }, [userId, load]);

  const markSeen = useCallback(
    async (notifId: string) => {
      const supabase = supabaseRef.current;
      // optimista
      setItems((prev) => prev.filter((n) => n.id !== notifId));
      try {
        const { error } = await supabase
          .from("proposal_notifications")
          .update({ seen: true })
          .eq("id", notifId);
        if (error) {
          toast.error("No se pudo marcar como visto.");
          if (userId) void load(userId);
        }
      } catch {
        toast.error("No se pudo marcar como visto.");
        if (userId) void load(userId);
      }
    },
    [userId, load]
  );

  // No renderizamos nada hasta saber la sesión, ni si el usuario no está logueado.
  if (!ready || !userId) return null;

  const count = items.length;

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Decisiones pendientes"
            className={cn(
              "relative h-12 w-12 rounded-full shadow-lg",
              count > 0 && "animate-pulse"
            )}
          >
            <Gavel className="h-5 w-5" />
            {count > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] leading-none"
              >
                {count > 99 ? "99+" : count}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={10}
          className="w-80 p-0"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Decisiones</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Actualizar"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Sin decisiones pendientes
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <Link
                      href="/decisiones"
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <p className="text-sm font-medium leading-snug hover:underline">
                        {n.proposals?.title || "Propuesta"}
                      </p>
                      {n.message && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.message}
                        </p>
                      )}
                    </Link>
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => void markSeen(n.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        marcar visto
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t px-4 py-2">
            <Link
              href="/decisiones"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver todas las decisiones →
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
