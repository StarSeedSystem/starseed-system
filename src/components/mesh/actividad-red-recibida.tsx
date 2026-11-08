"use client";

/**
 * ActividadRedRecibida — panel de Señales con TODO lo recibido de otras neuronas
 * (FEED1108A · 2026-11-08). Sustituye a la sección «Feed de red» (`/red-feed`,
 * Adenda 104), retirada a petición de Alex: lee la bandeja de red observable
 * (`useNetworkInbox`) y la muestra con tipo, hora, origen, insignia de firma
 * verificada y cuerpo legible (con enlaces a páginas y grupos). Los mensajes de
 * chat se marcan como «de neurona» y ofrecen abrirse en Mensajes › Neuronas.
 *
 * Plegable y accesible (botón con `aria-expanded`/`aria-controls`, región con
 * nombre, lista semántica). `abierto` lo fuerza `?vista=llegadas`: entonces se
 * despliega y se acerca a la vista. SSR-safe; nunca lanza.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Radio, Trash2, Inbox, FileText, MessageSquare, Signal, ShieldAlert, ShieldCheck,
  RefreshCw, ChevronDown, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNetworkInbox, clearNetworkInbox } from "@/ai/astraura/mesh";
import type { NetworkInboundItem } from "@/ai/astraura/mesh/network-inbox";
import { AvisoSesion } from "@/components/auth/aviso-sesion";
import { RUTA_MENSAJES_NEURONAS, pideVistaLlegadas } from "@/lib/senales/destinos";

const TYPE_META: Record<string, { label: string; icon: typeof FileText; cls: string }> = {
  post: { label: "Publicación", icon: FileText, cls: "text-emerald-300 bg-emerald-500/15" },
  message: { label: "Mensaje", icon: MessageSquare, cls: "text-sky-300 bg-sky-500/15" },
  presence: { label: "Presencia", icon: Signal, cls: "text-violet-300 bg-violet-500/15" },
  alert: { label: "Alerta", icon: ShieldAlert, cls: "text-rose-300 bg-rose-500/15" },
  "state-delta": { label: "Estado", icon: RefreshCw, cls: "text-amber-300 bg-amber-500/15" },
};

export function metaDeTipo(type: string) {
  return TYPE_META[type] ?? { label: type, icon: Radio, cls: "text-white/60 bg-white/[0.06]" };
}

export function haceCuanto(at: number, ahora: number = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((ahora - at) / 1000));
  if (s < 60) return "hace unos segundos";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Extrae {título, detalle, enlace?} legibles del cuerpo recibido. */
export function presentarCuerpo(body: unknown): { title: string; detail?: string; href?: string } {
  if (body == null) return { title: "(sin contenido)" };
  if (typeof body !== "object") return { title: String(body) };
  const b = body as Record<string, unknown>;
  // Publicación de entidad (página o grupo).
  if (typeof b.entity_slug === "string" && typeof b.entity_type === "string") {
    const href = b.entity_type === "page" ? `/pagina/${b.entity_slug}` : `/grupo/${b.entity_slug}`;
    return {
      title: typeof b.body === "string" && b.body ? b.body : "Nueva publicación",
      detail: `${b.entity_type} · ${b.entity_slug}`,
      href,
    };
  }
  // Mensaje de chat.
  if (typeof b.text === "string") {
    return { title: b.text, detail: b.convId ? `chat ${String(b.convId).slice(0, 8)}` : undefined };
  }
  // Biblioteca.
  if (b.kind === "library-item" || b.kind === "library-folder") {
    return { title: typeof b.name === "string" ? b.name : "Biblioteca", detail: String(b.kind) };
  }
  if (typeof b.body === "string") return { title: b.body };
  if (typeof b.name === "string") return { title: b.name };
  return { title: "Contenido de red" };
}

/** ¿Es un mensaje de chat de otra neurona? (tipo `message`, o cuerpo con `text` + `convId`). */
export function esMensajeDeNeurona(it: Pick<NetworkInboundItem, "type" | "body">): boolean {
  if (it.type === "message") return true;
  const b = it.body;
  return !!b && typeof b === "object" && typeof (b as Record<string, unknown>).text === "string"
    && (b as Record<string, unknown>).convId != null;
}

export function ActividadRedRecibida({ abiertoInicial = false }: { abiertoInicial?: boolean }) {
  const inbox = useNetworkInbox();
  const idPanel = useId();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [filtro, setFiltro] = useState<string>("todo");
  const raiz = useRef<HTMLDivElement>(null);

  // `/senales?vista=llegadas` (destino de la antigua `/red-feed`): abre y acerca el panel.
  useEffect(() => {
    if (typeof window === "undefined" || !pideVistaLlegadas(window.location.search)) return;
    setAbierto(true);
    try { raiz.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); } catch { /* */ }
  }, []);

  const items = useMemo(() => inbox.slice(0, 100), [inbox]);
  const tipos = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);
  const visibles = filtro === "todo" ? items : items.filter((i) => i.type === filtro);
  const filtroVigente = filtro === "todo" || tipos.includes(filtro);

  return (
    <div
      ref={raiz}
      id="llegadas"
      className="scroll-mt-4 rounded-xl border border-violet-400/25 bg-violet-500/[0.05] px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={idPanel}
          onClick={() => setAbierto((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left text-[12px] font-medium text-white/90 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
        >
          <Signal className="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
          <span>Actividad de red recibida</span>
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-200">
            {items.length}
          </span>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-white/50 transition-transform", abierto && "rotate-180")} aria-hidden="true" />
        </button>
        {abierto && items.length > 0 && (
          <button
            type="button"
            onClick={() => clearNetworkInbox()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:border-rose-400/40 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-300/50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Vaciar
          </button>
        )}
      </div>

      {!abierto && items.length > 0 && (
        <p className="mt-1 truncate text-[10px] text-white/45">
          {presentarCuerpo(items[0].body).title}
        </p>
      )}

      {abierto && (
        <div id={idPanel} role="region" aria-label="Actividad de red recibida" className="mt-2 space-y-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center">
              <Inbox className="h-7 w-7 text-white/25" aria-hidden="true" />
              <p className="text-[13px] font-medium text-white/70">Aún no ha llegado nada</p>
              <div className="mt-1 w-full max-w-md">
                <AvisoSesion
                  compacto
                  texto="Inicia sesión y ten el internet público encendido para recibir contenido de otras neuronas."
                  detalle="Cuando otra neurona de la red publique o te envíe algo, aparecerá aquí."
                />
              </div>
            </div>
          ) : (
            <>
              <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
                {["todo", ...tipos].map((t) => {
                  const activo = (filtroVigente ? filtro : "todo") === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setFiltro(t)}
                      className={cn(
                        "cursor-pointer rounded-full border px-2.5 py-0.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-violet-300/50",
                        activo
                          ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20",
                      )}
                    >
                      {t === "todo" ? "Todo" : metaDeTipo(t).label}
                    </button>
                  );
                })}
              </div>
              <ul className="space-y-1.5">
                {(filtroVigente ? visibles : items).map((it) => {
                  const m = metaDeTipo(it.type);
                  const Icono = m.icon;
                  const p = presentarCuerpo(it.body);
                  const deNeurona = esMensajeDeNeurona(it);
                  return (
                    <li
                      key={it.id}
                      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/20"
                    >
                      <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", m.cls)}>
                        <Icono className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider", m.cls)}>
                            {m.label}
                          </span>
                          {deNeurona && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-sky-200">
                              <Cpu className="h-2.5 w-2.5" aria-hidden="true" /> de neurona
                            </span>
                          )}
                          <span className="text-[10px] text-white/40">{haceCuanto(it.at)}</span>
                          {it.verified && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300"
                              title="Firma verificada"
                            >
                              <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" /> verificado
                            </span>
                          )}
                          {it.account && (
                            <span className="truncate text-[10px] text-cyan-300/70" title={`Cuenta ligada: ${it.account}`}>
                              · cuenta {it.account.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 break-words text-[13px] text-white/90">{p.title}</p>
                        {p.detail && <p className="truncate text-[10px] text-white/45">{p.detail}</p>}
                        <div className="mt-1 flex flex-wrap gap-3">
                          {p.href && (
                            <Link href={p.href} className="cursor-pointer text-[10px] text-violet-200/80 transition-colors hover:text-violet-100">
                              Abrir →
                            </Link>
                          )}
                          {deNeurona && (
                            <Link href={RUTA_MENSAJES_NEURONAS} className="cursor-pointer text-[10px] text-sky-200/80 transition-colors hover:text-sky-100">
                              Abrir en Mensajes › Neuronas →
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ActividadRedRecibida;
