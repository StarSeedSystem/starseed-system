"use client";

/**
 * NetworkFeed — FEED DE RED navegable (Adenda 104).
 * ============================================================================
 * Superficie dedicada para navegar el CONTENIDO RECIBIDO de otras neuronas por
 * la red sináptica (publicaciones, mensajes, presencia…): lee la bandeja de red
 * observable (`useNetworkInbox`) y la muestra con tipo, hora, origen y cuerpo.
 * Cierra el bucle publicar→almacenar→recibir de forma navegable. SSR-safe.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Radio, Trash2, Inbox, FileText, MessageSquare, Signal, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNetworkInbox, clearNetworkInbox } from "@/ai/astraura/mesh";

const TYPE_META: Record<string, { label: string; icon: typeof FileText; cls: string }> = {
  post: { label: "Publicación", icon: FileText, cls: "text-emerald-300 bg-emerald-500/15" },
  message: { label: "Mensaje", icon: MessageSquare, cls: "text-sky-300 bg-sky-500/15" },
  presence: { label: "Presencia", icon: Signal, cls: "text-violet-300 bg-violet-500/15" },
  alert: { label: "Alerta", icon: ShieldAlert, cls: "text-rose-300 bg-rose-500/15" },
  "state-delta": { label: "Estado", icon: RefreshCw, cls: "text-amber-300 bg-amber-500/15" },
};

function metaFor(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Radio, cls: "text-white/60 bg-white/[0.06]" };
}

function fmtAgo(at: number): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "hace unos segundos";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Extrae {titulo, detalle, enlace?} legibles del cuerpo recibido. */
function present(body: unknown): { title: string; detail?: string; href?: string } {
  if (body == null) return { title: "(sin contenido)" };
  if (typeof body !== "object") return { title: String(body) };
  const b = body as Record<string, unknown>;
  // Publicación de entidad
  if (typeof b.entity_slug === "string" && typeof b.entity_type === "string") {
    const href = b.entity_type === "page" ? `/pagina/${b.entity_slug}` : `/grupo/${b.entity_slug}`;
    return {
      title: typeof b.body === "string" && b.body ? b.body : "Nueva publicación",
      detail: `${b.entity_type} · ${b.entity_slug}`,
      href,
    };
  }
  // Mensaje de chat
  if (typeof b.text === "string") return { title: b.text, detail: b.convId ? `chat ${String(b.convId).slice(0, 8)}` : undefined };
  // Biblioteca
  if (b.kind === "library-item" || b.kind === "library-folder") {
    return { title: typeof b.name === "string" ? b.name : "Biblioteca", detail: String(b.kind) };
  }
  if (typeof b.name === "string") return { title: b.name };
  return { title: "Contenido de red" };
}

export function NetworkFeed({ embedded = false }: { embedded?: boolean }) {
  const inbox = useNetworkInbox();
  const items = useMemo(() => inbox.slice(0, 100), [inbox]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {embedded ? (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/85">
            <Radio className="h-4 w-4 text-violet-300" /> Feed de red
          </h2>
        ) : (
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-violet-50">
              <Radio className="h-6 w-6 text-violet-300" /> Feed de red
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Contenido recibido de otras neuronas por la red sináptica — publicaciones, mensajes y señales
              que llegan por el feed público y el relé.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/60">{items.length} recibidos</span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => clearNetworkInbox()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:border-rose-400/40 hover:text-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
          <Link
            href="/senales"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-200 transition-colors hover:bg-cyan-500/20"
          >
            <Signal className="h-3.5 w-3.5" /> Señales
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-white/25" />
          <p className="text-[13px] font-medium text-white/70">Aún no ha llegado nada</p>
          <p className="max-w-md text-[11px] leading-snug text-white/45">
            Cuando otra neurona de la red publique o te envíe algo, aparecerá aquí. Inicia sesión y ten el
            internet público encendido en Señales para participar en el feed.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const m = metaFor(it.type);
            const Icon = m.icon;
            const p = present(it.body);
            const row = (
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-white/20">
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", m.cls)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", m.cls)}>
                      {m.label}
                    </span>
                    <span className="text-[10px] text-white/40">{fmtAgo(it.at)}</span>
                    {it.verified && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300" title="Firma verificada">
                        <ShieldCheck className="h-2.5 w-2.5" /> verificado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-white/90">{p.title}</p>
                  {p.detail && <p className="truncate text-[10px] text-white/45">{p.detail}</p>}
                </div>
              </div>
            );
            return p.href ? (
              <Link key={it.id} href={p.href} className="block cursor-pointer">
                {row}
              </Link>
            ) : (
              <div key={it.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NetworkFeed;
