"use client";

// StarSeed · Ontocracia — "Delegación Líquida": panel de CUENTA para gestionar
// TODAS las delegaciones de voto del usuario, de cualquier tema/ámbito, en un
// solo lugar. Complementa (no sustituye) a `delegation-panel.tsx`, que es un
// widget COMPACTO y acotado a UN tema (el de la entidad/propuesta donde se
// embebe: página de comunidad, grupo, tarjeta de propuesta…). Este panel es la
// vista GLOBAL: "¿en quién he delegado mi voz, en qué temas, y hasta cuándo?".
//
// Cláusulas pétreas de la Ontocracia (memory/principles.md + CLAUDE.md §3):
//   • "Una persona, una voz": delegar transfiere tu peso a otra persona SOLO
//     para el tema elegido — nunca inventa votos ni aliena tu voz para siempre.
//   • Revocable en cualquier momento (un clic, con confirmación accesible).
//   • Si votas directamente, tu voz vuelve a ti automáticamente (lo hace el
//     motor de recuento — `computeEffectiveWeights` en lib/governance/delegations.ts
//     — no hace falta ninguna acción aquí).
//   • Caducidad obligatoria a nivel de datos (RLS + validación del propio
//     `createDelegation`): esta UI la trata como "opcional" desde la
//     experiencia (siempre hay una fecha por defecto, 90 días, que el usuario
//     puede no tocar) pero SIEMPRE envía una fecha concreta.
//
// El "tema" de una delegación DEBE coincidir exactamente con el tema que el
// motor calcula para una propuesta (`topicForProposal` = `scope` o
// `scope:scope_ref`) para tener efecto real en un recuento. Por eso el modo
// "Ámbito de gobernanza" reutiliza el MISMO catálogo `SCOPES` que usa el resto
// del sistema de gobernanza (governance-panel.tsx), en vez de inventar una
// taxonomía temática paralela que nunca casaría con ninguna propuesta real. El
// modo "Tema personalizado" es la vía de escape para quien conoce el tema
// exacto que quiere segmentar (p. ej. copiado de una propuesta concreta).
//
// TODO defensivo: cada llamada a Supabase va en su propio try/catch y nunca
// rompe el panel; los errores se comunican con `toast` (sonner), nunca con
// alert()/confirm() nativos (revocar usa `useConfirm`, ver confirm-dialog.tsx).

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Waypoints,
  Loader2,
  Info,
  Search,
  UserRound,
  CalendarClock,
  Undo2,
  Users,
  Clock,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import {
  createDelegation,
  revokeDelegation,
  listMyDelegations,
  topicForScope,
  topicLabel,
  type Delegation,
} from "@/lib/governance/delegations";
import { SCOPES, type Scope } from "@/lib/governance/types";

// ── Tipos locales ────────────────────────────────────────────────────────────

type ProfileLite = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type TopicMode = "area" | "custom";

// ── Utilidades puras ─────────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function escapeLike(q: string): string {
  return q.replace(/[%_]/g, (m) => `\\${m}`);
}

function addDaysISODate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// Etiqueta cálida de caducidad: "caduca mañana", "caduca en 12 días", o fecha absoluta si falta mucho.
function expiryText(iso: string): string {
  const days = daysUntil(iso);
  const dateLabel = new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  if (days <= 0) return `caducó el ${dateLabel}`;
  if (days === 1) return `caduca mañana · ${dateLabel}`;
  if (days <= 30) return `caduca en ${days} días · ${dateLabel}`;
  return `caduca el ${dateLabel}`;
}

// Modo "tema personalizado": intenta separar "ambito:referencia" para guardar
// scope/scope_ref con la misma semántica que el modo preset (si no hay ":", el
// texto completo se guarda como scope y scope_ref queda vacío).
function splitCustomTopic(text: string): { scope: string | null; scopeRef: string | null } {
  const t = text.trim();
  if (!t) return { scope: null, scopeRef: null };
  const idx = t.indexOf(":");
  if (idx === -1) return { scope: t, scopeRef: null };
  return { scope: t.slice(0, idx).trim() || null, scopeRef: t.slice(idx + 1).trim() || null };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function delegateLabel(p: Pick<ProfileLite, "display_name" | "handle" | "user_id"> | undefined, fallbackId: string): string {
  if (p?.display_name) return p.display_name;
  if (p?.handle) return `@${p.handle}`;
  return `${(p?.user_id ?? fallbackId).slice(0, 8)}…`;
}

// ── Supabase: búsqueda + resolución de perfiles (defensivas, nunca lanzan) ───

async function searchDelegateCandidates(query: string, excludeUserId: string | null): Promise<ProfileLite[]> {
  const term = query.trim().replace(/^@/, "");
  if (term.length < 1) return [];
  try {
    const supabase = createClient();
    const like = `%${escapeLike(term)}%`;
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url")
      .or(`display_name.ilike.${like},handle.ilike.${like}`)
      .neq("user_id", excludeUserId ?? "")
      .limit(8);
    if (error) return [];
    return ((data as ProfileLite[]) ?? []).filter((p) => !!p.user_id);
  } catch {
    return [];
  }
}

async function resolveProfilesByIds(userIds: string[]): Promise<Record<string, ProfileLite>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle, avatar_url")
      .in("user_id", ids);
    if (error) return {};
    const out: Record<string, ProfileLite> = {};
    for (const p of (data as ProfileLite[]) ?? []) out[p.user_id] = p;
    return out;
  } catch {
    return {};
  }
}

const EXPIRY_PRESETS: { days: number; label: string }[] = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 año" },
];

// ── Componente ────────────────────────────────────────────────────────────────

export default function LiquidDelegationPanel({ className }: { className?: string } = {}) {
  const confirm = useConfirm();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Listado de "mis" delegaciones activas (emitidas por mí).
  const [mine, setMine] = useState<Delegation[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [listLoading, setListLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Formulario — selector de delegado (búsqueda con autocompletado).
  const [delegateQuery, setDelegateQuery] = useState("");
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateHits, setDelegateHits] = useState<ProfileLite[]>([]);
  const [delegateSearching, setDelegateSearching] = useState(false);
  const [selectedDelegate, setSelectedDelegate] = useState<ProfileLite | null>(null);
  const [delegateHighlight, setDelegateHighlight] = useState(0);
  const debouncedDelegateQuery = useDebounced(delegateQuery, 250);
  const delegateBoxRef = useRef<HTMLDivElement | null>(null);

  // Formulario — tema (ámbito preset o texto libre).
  const [topicMode, setTopicMode] = useState<TopicMode>("area");
  const [areaScope, setAreaScope] = useState<Scope>("global");
  const [areaRef, setAreaRef] = useState("");
  const [customTopic, setCustomTopic] = useState("");

  // Formulario — caducidad (siempre con valor por defecto: "opcional" en la UX,
  // obligatoria a nivel de datos).
  const [expiryDate, setExpiryDate] = useState<string>(addDaysISODate(90));

  const [creating, setCreating] = useState(false);

  const loadMine = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await listMyDelegations();
      setMine(list);
      const map = await resolveProfilesByIds(list.map((d) => d.delegate_user));
      setProfilesById(map);
    } catch {
      /* el panel nunca debe romper la página */
    }
    setListLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (alive) setMyUserId(data?.user?.id ?? null);
      } catch {
        if (alive) setMyUserId(null);
      }
      if (alive) setAuthChecked(true);
      await loadMine();
    })();
    return () => {
      alive = false;
    };
  }, [loadMine]);

  // Búsqueda de delegado (debounced) mientras el desplegable está abierto.
  useEffect(() => {
    if (!delegateOpen) return;
    const term = debouncedDelegateQuery.trim();
    if (term.length < 1) {
      setDelegateHits([]);
      setDelegateSearching(false);
      return;
    }
    let alive = true;
    setDelegateSearching(true);
    searchDelegateCandidates(term, myUserId)
      .then((hits) => {
        if (!alive) return;
        setDelegateHits(hits);
        setDelegateHighlight(0);
      })
      .finally(() => {
        if (alive) setDelegateSearching(false);
      });
    return () => {
      alive = false;
    };
  }, [debouncedDelegateQuery, delegateOpen, myUserId]);

  // Cierra el desplegable al hacer clic fuera del combobox.
  useEffect(() => {
    if (!delegateOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!delegateBoxRef.current?.contains(e.target as Node)) setDelegateOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [delegateOpen]);

  function pickDelegate(hit: ProfileLite) {
    setSelectedDelegate(hit);
    setDelegateQuery(delegateLabel(hit, hit.user_id));
    setDelegateHits([]);
    setDelegateOpen(false);
  }

  function onDelegateKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!delegateOpen || delegateHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDelegateHighlight((h) => (h + 1) % delegateHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDelegateHighlight((h) => (h - 1 + delegateHits.length) % delegateHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = delegateHits[delegateHighlight] ?? delegateHits[0];
      if (hit) pickDelegate(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDelegateOpen(false);
    }
  }

  // El listbox sólo se pinta cuando hay algo que mostrar — se reutiliza tanto
  // para el render condicional como para `aria-expanded`, así nunca se anuncia
  // "expandido" un popover que en realidad no está en el DOM.
  const showDelegateListbox =
    delegateOpen && (delegateSearching || delegateHits.length > 0 || delegateQuery.trim().length > 0);

  // Tema efectivo que se enviará (debe coincidir con `topicForProposal` para
  // tener efecto real en un recuento — ver cabecera del archivo).
  const previewTopic = useMemo(() => {
    return topicMode === "custom" ? customTopic.trim() : topicForScope(areaScope, areaRef.trim() || null);
  }, [topicMode, customTopic, areaScope, areaRef]);

  async function submitCreate() {
    if (!myUserId) {
      toast.error("Inicia sesión para delegar tu voto.");
      return;
    }
    let delegateId = selectedDelegate?.user_id ?? null;
    if (!delegateId) {
      // Vía de escape: pegar directamente un ID de usuario si la búsqueda no encontró a la persona.
      const raw = delegateQuery.trim();
      if (/^[0-9a-f-]{16,}$/i.test(raw)) delegateId = raw;
    }
    if (!delegateId) {
      toast.error("Busca a la persona y selecciónala de la lista antes de delegar.");
      return;
    }
    if (delegateId === myUserId) {
      toast.error("No puedes delegar tu voz en ti mismo/a.");
      return;
    }
    if (!previewTopic) {
      toast.error("Escribe el tema personalizado de la delegación.");
      return;
    }

    setCreating(true);
    try {
      const custom = splitCustomTopic(customTopic);
      const res = await createDelegation({
        delegateUser: delegateId,
        topic: previewTopic,
        expiresAt: new Date(`${expiryDate}T23:59:59`).toISOString(),
        scope: topicMode === "custom" ? custom.scope : areaScope,
        scopeRef: topicMode === "custom" ? custom.scopeRef : areaRef.trim() || null,
      });
      if (res.ok) {
        const who = selectedDelegate ? delegateLabel(selectedDelegate, delegateId) : "esa persona";
        toast.success(
          `Delegado: tu voz en «${topicLabel(previewTopic)}» ahora también la representa ${who}. Revocable cuando quieras.`,
        );
        setDelegateQuery("");
        setSelectedDelegate(null);
        setCustomTopic("");
        setAreaRef("");
        await loadMine();
      } else {
        toast.error(res.error ?? "No se pudo crear la delegación.");
      }
    } catch {
      toast.error("No se pudo crear la delegación.");
    }
    setCreating(false);
  }

  async function handleRevoke(d: Delegation) {
    if (!d.id) return;
    const who = delegateLabel(profilesById[d.delegate_user], d.delegate_user);
    const ok = await confirm({
      title: "¿Revocar esta delegación?",
      description: `Recuperas tu voz en «${topicLabel(d.topic)}» al instante. ${who} dejará de representarte en este tema. Podrás volver a delegar cuando quieras — nada aquí es permanente.`,
      confirmText: "Revocar y recuperar mi voz",
      cancelText: "Mantener",
      destructive: true,
    });
    if (!ok) return;

    setRevokingId(d.id);
    try {
      const res = await revokeDelegation(d.id);
      if (res.ok) {
        toast.success("Delegación revocada. Tu voz vuelve a ser tuya.");
        await loadMine();
      } else {
        toast.error(res.error ?? "No se pudo revocar la delegación.");
      }
    } catch {
      toast.error("No se pudo revocar la delegación.");
    }
    setRevokingId(null);
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Cabecera + principio rector */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600">
            <Waypoints className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-cyan-50">Delegación Líquida</span>
            <span className="text-[11px] text-cyan-300/70">
              Delega tu voz en quien más confianza o pericia tenga para un tema — nunca de forma permanente.
            </span>
          </div>
          {!listLoading && mine.length > 0 && (
            <Badge
              variant="outline"
              className="ml-auto gap-1 text-[10px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10"
            >
              <ListChecks className="h-3 w-3" /> {mine.length} activa{mine.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-cyan-500/15 bg-cyan-950/20 px-3 py-2 text-[11px] leading-relaxed text-cyan-200/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Una persona, una voz: delegar transfiere tu peso a otra persona SOLO para el tema que elijas, nunca lo
          aliena para siempre. Puedes revocarla cuando quieras, y si votas directamente en algo recuperas tu voz al
          instante — sin doble conteo. Las delegaciones son públicas (quién delega en quién es un acto de gobernanza
          transparente), aunque el contenido de tu voto en cada propuesta sigue siendo el tuyo.
        </p>
      </div>

      {!authChecked ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : !myUserId ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
          Inicia sesión para delegar tu voto o para revocar una delegación existente.
        </div>
      ) : (
        <>
          {/* Nueva delegación */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
              <UserRound className="h-3.5 w-3.5" /> Nueva delegación
            </div>

            {/* Selector de delegado */}
            <div className="relative" ref={delegateBoxRef}>
              <Label htmlFor="ld-delegate" className="text-[10px] text-white/40">
                Delegar mi voz en
              </Label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <Input
                  id="ld-delegate"
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={showDelegateListbox}
                  aria-controls="ld-delegate-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    showDelegateListbox && delegateHits[delegateHighlight] ? `ld-opt-${delegateHighlight}` : undefined
                  }
                  value={delegateQuery}
                  onChange={(e) => {
                    setDelegateQuery(e.target.value);
                    setSelectedDelegate(null);
                    setDelegateOpen(true);
                  }}
                  onFocus={() => {
                    if (!selectedDelegate) setDelegateOpen(true);
                  }}
                  onKeyDown={onDelegateKeyDown}
                  placeholder="Busca por nombre o @handle…"
                  autoComplete="off"
                  className={cn("h-9 bg-white/5 pl-8 pr-8 text-xs", selectedDelegate && "border-cyan-400/40 text-cyan-100")}
                />
                {selectedDelegate && (
                  <ShieldCheck className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300" />
                )}
              </div>

              {showDelegateListbox && (
                <div
                  id="ld-delegate-listbox"
                  role="listbox"
                  aria-label="Personas encontradas"
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-white/15 bg-[#0d0f14]/95 p-1 shadow-xl backdrop-blur-md"
                >
                  {delegateSearching ? (
                    <div className="flex items-center gap-2 px-2 py-2 text-xs text-white/40">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
                    </div>
                  ) : delegateHits.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-white/40">Sin coincidencias. Prueba con otro nombre o @handle.</div>
                  ) : (
                    delegateHits.map((hit, i) => {
                      const isOn = i === delegateHighlight;
                      const label = delegateLabel(hit, hit.user_id);
                      return (
                        <button
                          key={hit.user_id}
                          id={`ld-opt-${i}`}
                          type="button"
                          role="option"
                          aria-selected={isOn}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickDelegate(hit);
                          }}
                          onMouseEnter={() => setDelegateHighlight(i)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            isOn ? "bg-cyan-400/15" : "hover:bg-white/5",
                          )}
                        >
                          <Avatar className="h-6 w-6">
                            {hit.avatar_url ? <AvatarImage src={hit.avatar_url} alt="" /> : null}
                            <AvatarFallback className="text-[9px]">{initials(label)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-cyan-50">{hit.display_name || label}</span>
                            {hit.handle && <span className="block truncate text-[11px] text-white/40">@{hit.handle}</span>}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              <p className="mt-1 text-[10px] text-white/35">
                Escribe un nombre o @handle y elige a la persona en la lista. Nunca puedes delegar en ti mismo/a.
              </p>
            </div>

            {/* Tema / ámbito de la delegación */}
            <div className="mt-3">
              <span className="text-[10px] text-white/40">Tema de la delegación</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTopicMode("area")}
                  aria-pressed={topicMode === "area"}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors",
                    topicMode === "area"
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/50 hover:text-white/80",
                  )}
                >
                  Ámbito de gobernanza
                </button>
                <button
                  type="button"
                  onClick={() => setTopicMode("custom")}
                  aria-pressed={topicMode === "custom"}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors",
                    topicMode === "custom"
                      ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/50 hover:text-white/80",
                  )}
                >
                  Tema personalizado
                </button>
              </div>

              {topicMode === "area" ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {SCOPES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAreaScope(s.id)}
                        aria-pressed={areaScope === s.id}
                        className={cn(
                          "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
                          areaScope === s.id
                            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                            : "border-white/10 text-white/50 hover:text-white/80",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {areaScope !== "global" && (
                    <div>
                      <Label htmlFor="ld-area-ref" className="text-[10px] text-white/40">
                        Referencia (opcional) — ID o slug concreto
                      </Label>
                      <Input
                        id="ld-area-ref"
                        value={areaRef}
                        onChange={(e) => setAreaRef(e.target.value)}
                        placeholder="Déjalo vacío para delegar TODAS las decisiones de este ámbito"
                        className="mt-1 h-8 bg-white/5 text-xs"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <Label htmlFor="ld-custom-topic" className="text-[10px] text-white/40">
                    Tema exacto (debe coincidir con el de la propuesta para tener efecto)
                  </Label>
                  <Input
                    id="ld-custom-topic"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="p. ej. community:mi-comunidad"
                    className="mt-1 h-8 bg-white/5 text-xs"
                  />
                </div>
              )}

              {previewTopic && (
                <p className="mt-2 text-[11px] text-white/40">
                  Vas a delegar tu voz en: <span className="text-cyan-200">{topicLabel(previewTopic)}</span>
                </p>
              )}
            </div>

            {/* Caducidad */}
            <div className="mt-3">
              <Label htmlFor="ld-expiry" className="flex items-center gap-1 text-[10px] text-white/40">
                <CalendarClock className="h-3 w-3" /> Caduca el (siempre puedes revocarla antes)
              </Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Input
                  id="ld-expiry"
                  type="date"
                  value={expiryDate}
                  min={addDaysISODate(1)}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="h-8 w-40 bg-white/5 text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {EXPIRY_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => setExpiryDate(addDaysISODate(p.days))}
                      className={cn(
                        "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                        expiryDate === addDaysISODate(p.days)
                          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                          : "border-white/10 text-white/50 hover:border-cyan-400/40 hover:text-cyan-200",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-1 text-[10px] text-white/35">
                Por defecto, 90 días. No hace falta que pienses en ello: si cambias de opinión, revocas cuando
                quieras y no esperas a que caduque.
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={submitCreate} disabled={creating} className="gap-2 bg-cyan-600 text-white hover:bg-cyan-500">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />}
                Delegar mi voz
              </Button>
            </div>
          </div>

          {/* Mis delegaciones activas */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
              <Users className="h-3.5 w-3.5" /> Mis delegaciones activas
            </div>

            {listLoading ? (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
              </div>
            ) : mine.length === 0 ? (
              <p className="text-[12px] text-white/40">
                No has delegado tu voto en ningún tema todavía. Conservas toda tu voz — delega solo cuando de verdad
                confíes en alguien para un tema concreto.
              </p>
            ) : (
              <div className="space-y-2">
                {mine.map((d) => {
                  const prof = profilesById[d.delegate_user];
                  const label = delegateLabel(prof, d.delegate_user);
                  return (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        {prof?.avatar_url ? <AvatarImage src={prof.avatar_url} alt="" /> : null}
                        <AvatarFallback className="text-[10px]">{initials(label)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium text-white">{label}</span>
                          {prof?.handle && <span className="text-[11px] text-white/40">@{prof.handle}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                          <Badge variant="outline" className="text-[9px] border-cyan-400/30 text-cyan-200/80">
                            {topicLabel(d.topic)}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {expiryText(d.expires_at)}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 border-red-400/30 text-red-200 hover:bg-red-900/20"
                        onClick={() => handleRevoke(d)}
                        disabled={revokingId === d.id}
                      >
                        {revokingId === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="h-3.5 w-3.5" />
                        )}
                        Revocar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
