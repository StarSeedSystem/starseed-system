"use client";

/**
 * PersonalitiesPanel — sección "Personalidades" de Aurora (Adenda 63 §11).
 *
 * Personalidades como ARCHIVOS de configuración: galería de tarjetas con
 * activar/editar/duplicar/exportar/eliminar, asignación POR CONTEXTO
 * (global · secciones política/educación/cultura · este chat), EDITOR completo
 * con acordeón de niveladores por grupo (Sliders), prompts, idioma/género/
 * personaje/cultura/filosofía, estilo de respuesta, herramientas, política de
 * memoria y estilo de voz. Importar/Exportar JSON, Compartir a la Biblioteca
 * (ítem tipo "personality" vía entity-library) e Instalar desde la Biblioteca.
 *
 * Persistencia local-first en src/lib/aurora/personalities.ts:
 *   · lista        `starseed.aurora.personalities.v1`
 *   · asignaciones `starseed.aurora.personality.active.v1`
 * Al activar/ajustar se emite `starseed:aurora-voice-style` (lo consume el
 * sistema de voz). SSR-safe: todo acceso a window/localStorage va en efectos
 * o manejadores. Iconos SIEMPRE Lucide (nunca emojis).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  icons as lucideIcons,
  BookOpenCheck,
  Check,
  Copy,
  Download,
  Drama,
  FileUp,
  Globe2,
  Library,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERSONALITY_TRAIT_GROUPS,
  PERSONALITY_TOOL_KINDS,
  PERSONALITY_CHANGED_EVENT,
  listPersonalityProfiles,
  savePersonalityProfile,
  removePersonalityProfile,
  duplicatePersonalityProfile,
  restorePersonalityPresets,
  exportPersonalityJson,
  importPersonalityJson,
  getPersonalityAssignments,
  setActivePersonality,
  getRegisteredAuroraChatId,
  normalizePersonalityProfile,
  emitVoiceStyleForProfile,
  type PersonalityAssignments,
  type PersonalityProfile,
  type PersonalitySection,
} from "@/lib/aurora/personalities";
import { saveItem, listLibrary, type SavedItem } from "@/lib/library/entity-library";
import { currentUserRef } from "@/lib/sync/entity-state";

/* ── Opciones curadas para los selects (el valor actual se añade si falta) ── */

const ICON_OPTIONS = [
  "Sparkles", "GraduationCap", "Palette", "Microscope", "Shield", "Compass",
  "Feather", "Heart", "Brain", "Star", "Moon", "Sun", "Flame", "Leaf",
  "Music", "Bot", "Ghost", "Crown", "Gem", "Rocket", "Drama",
];

const PERSONAJE_OPTIONS = [
  "Guía", "Mentora", "Musa", "Analista", "Guardiana", "Exploradora", "Poeta",
  "Sabia", "Ingeniera", "Narradora", "Capitana", "Alquimista",
];

const CULTURA_OPTIONS = [
  "Universal", "Ciberdélica", "Cosmopolita", "Mediterránea", "Latinoamericana",
  "Andina", "Caribeña", "Ibérica", "Nórdica", "Japonesa", "Solarpunk",
];

const FILOSOFIA_OPTIONS = [
  "Equilibrio", "Humanista", "Racionalista", "Estoica", "Epicúrea", "Vitalista",
  "Budista", "Taoísta", "Empirista", "Mística", "Transhumanista", "Ontocrática",
];

const IDIOMAS: Array<{ id: string; label: string }> = [
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "fr", label: "Francés" },
  { id: "pt", label: "Portugués" },
  { id: "de", label: "Alemán" },
  { id: "it", label: "Italiano" },
  { id: "ca", label: "Catalán" },
  { id: "gl", label: "Gallego" },
  { id: "eu", label: "Euskera" },
  { id: "ja", label: "Japonés" },
  { id: "zh", label: "Chino" },
];

const TONE_OPTIONS = ["cálido", "sereno", "vivaz", "neutro", "suave", "luminoso", "profundo", "etéreo"];
const EMOTION_OPTIONS = [
  "calma", "alegría", "entusiasmo", "ternura", "asombro", "concentración",
  "serenidad luminosa", "calma protectora", "confianza tranquila",
];

const SECTIONS: Array<{ id: PersonalitySection; label: string }> = [
  { id: "politica", label: "Política" },
  { id: "educacion", label: "Educación" },
  { id: "cultura", label: "Cultura" },
];

/** Añade el valor actual a las opciones si no está (para no perder personalizados). */
function withCurrent(options: string[], current: string): string[] {
  const c = (current || "").trim();
  return c && !options.includes(c) ? [c, ...options] : options;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "personalidad";
}

/** Icono Lucide por nombre (fallback Sparkles). Nunca emojis. */
function ProfileIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (lucideIcons as Record<string, LucideIcon>)[name] ?? Sparkles;
  return <Cmp className={className} />;
}

/* ── Estilos base (cristal líquido, coherentes con los paneles de Aurora) ── */

const card = "rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-sm";
const btn =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/80 transition-colors duration-200 hover:bg-white/[0.12] hover:text-white";
const btnAzure =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#007FFF]/40 bg-[#007FFF]/15 px-2.5 py-1.5 text-[11px] text-blue-100 transition-colors duration-200 hover:bg-[#007FFF]/30";
const labelCls = "text-[10px] uppercase tracking-wide text-white/45";

import { getBrain, saveBrain } from "@/lib/brains/brains";

/* ═══════════════════════════════ Panel ═══════════════════════════════ */

export function PersonalitiesPanel({
  brainId,
  brainName,
}: {
  brainId?: string | null;
  brainName?: string;
} = {}) {
  const [profiles, setProfiles] = useState<PersonalityProfile[]>([]);
  const [assignments, setAssignments] = useState<PersonalityAssignments>({
    global: null, porSeccion: {}, porChat: {}, porCerebro: {},
  });
  const [chatId, setChatId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonalityProfile | null>(null);
  const [libItems, setLibItems] = useState<SavedItem[] | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyBrainId, setBusyBrainId] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    try {
      setProfiles(listPersonalityProfiles());
      setAssignments(getPersonalityAssignments());
      setChatId(getRegisteredAuroraChatId());
    } catch { /* defensivo */ }
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(PERSONALITY_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  // Lee las personalidades ya conectadas al cerebro activo (en BD).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!brainId) {
        setConnectedIds([]);
        return;
      }
      const brain = await getBrain(brainId);
      const ids = brain?.includes?.personalities ?? [];
      if (alive) setConnectedIds(ids);
    })();
    return () => { alive = false; };
  }, [brainId, profiles]);

  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds]);

  /** Badges de contexto donde este perfil está activo. */
  const badgesFor = useCallback(
    (id: string): string[] => {
      const out: string[] = [];
      if (assignments.global === id) out.push("Global");
      for (const s of SECTIONS) if (assignments.porSeccion[s.id] === id) out.push(s.label);
      const chats = Object.values(assignments.porChat).filter((x) => x === id).length;
      if (chats) out.push(chats === 1 ? "1 chat" : `${chats} chats`);
      const brains = Object.values(assignments.porCerebro).filter((x) => x === id).length;
      if (brains) out.push(brains === 1 ? "1 cerebro" : `${brains} cerebros`);
      return out;
    },
    [assignments],
  );

  /* ── Acciones de tarjeta ── */

  const activate = useCallback((p: PersonalityProfile) => {
    setActivePersonality({ scope: "global" }, p.id);
    toast.success(`«${p.name}» activada globalmente.`);
  }, []);

  const duplicate = useCallback((p: PersonalityProfile) => {
    const copy = duplicatePersonalityProfile(p.id);
    if (copy) toast.success(`Duplicada como «${copy.name}».`);
  }, []);

  const exportar = useCallback((p: PersonalityProfile) => {
    try {
      const blob = new Blob([exportPersonalityJson(p)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personalidad-${slugify(p.name)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportada «${p.name}» como archivo JSON.`);
    } catch {
      toast.error("No pude exportar el archivo.");
    }
  }, []);

  const eliminar = useCallback((p: PersonalityProfile) => {
    if (typeof window !== "undefined" && !window.confirm(`¿Eliminar la personalidad «${p.name}»?`)) return;
    if (removePersonalityProfile(p.id)) toast.success(`«${p.name}» eliminada.`);
  }, []);

  const compartir = useCallback(async (p: PersonalityProfile) => {
    setBusy(true);
    try {
      const ref = await currentUserRef();
      if (!ref) {
        toast.error("Inicia sesión para compartir en tu Biblioteca.");
        return;
      }
      await saveItem(ref, {
        type: "personality",
        refId: p.id,
        title: p.name,
        summary: p.description || p.personaje || "Personalidad de Aurora",
        content: exportPersonalityJson(p),
      });
      toast.success(`«${p.name}» enviada a tu Biblioteca.`);
    } catch {
      toast.error("No pude compartirla.");
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleBrainConnection = useCallback(async (p: PersonalityProfile) => {
    if (!brainId) return;
    setBusyBrainId(p.id);
    try {
      const brain = await getBrain(brainId);
      if (!brain) throw new Error("No se pudo cargar el cerebro.");
      const isConnected = connectedSet.has(p.id);
      
      let newIds = brain.includes?.personalities ?? [];
      if (isConnected) {
        newIds = newIds.filter(id => id !== p.id);
      } else {
        if (!newIds.includes(p.id)) newIds.push(p.id);
      }
      
      const saved = await saveBrain({ ...brain, includes: { ...brain.includes, personalities: newIds } });
      if (!saved) throw new Error("Error guardando el cerebro.");
      
      // Actualizar localmente la memoria de la personalidad y las asignaciones
      const localAssignments = getPersonalityAssignments();
      if (isConnected) {
        delete localAssignments.porCerebro[brainId];
      } else {
        localAssignments.porCerebro[brainId] = p.id;
      }
      writeAssignments(localAssignments);
      
      const currentAllowed = p.memoryPolicy?.cerebrosPermitidos ?? [];
      const updatedProfile = {
        ...p,
        memoryPolicy: {
          ...p.memoryPolicy,
          cerebrosPermitidos: isConnected
            ? (Array.isArray(currentAllowed) ? currentAllowed.filter(id => id !== brainId) : currentAllowed)
            : (currentAllowed === "todos" ? "todos" : [...(currentAllowed as string[]), brainId])
        }
      };
      savePersonalityProfile(updatedProfile);
      
      setConnectedIds(newIds);
      refresh();
      toast.success(isConnected ? "Personalidad desconectada del cerebro." : "Personalidad conectada al cerebro.");
    } catch (err: any) {
      toast.error(err.message || "Error al conectar con el cerebro.");
    } finally {
      setBusyBrainId(null);
    }
  }, [brainId, connectedSet, refresh]);

  /* ── Importar / Biblioteca / presets ── */

  const onImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const r = importPersonalityJson(text);
      if (r.ok && r.profile) toast.success(`Instalada «${r.profile.name}» desde el archivo.`);
      else toast.error(r.error ?? "El archivo no es una personalidad válida.");
    } catch {
      toast.error("No pude leer el archivo.");
    }
  }, []);

  const openLibrary = useCallback(async () => {
    setLibOpen((v) => !v);
    if (libItems !== null) return;
    try {
      const ref = await currentUserRef();
      if (!ref) {
        toast.error("Inicia sesión para ver tu Biblioteca.");
        setLibItems([]);
        return;
      }
      const doc = await listLibrary(ref);
      setLibItems(doc.items.filter((it) => it.type === "personality" && !!it.content));
    } catch {
      setLibItems([]);
    }
  }, [libItems]);

  const installFromLibrary = useCallback((item: SavedItem) => {
    const r = importPersonalityJson(item.content ?? "");
    if (r.ok && r.profile) toast.success(`Instalada «${r.profile.name}» desde la Biblioteca.`);
    else toast.error(r.error ?? "Ese ítem no contiene una personalidad válida.");
  }, []);

  const restaurar = useCallback(() => {
    restorePersonalityPresets();
    toast.success("Presets restaurados.");
  }, []);

  const nueva = useCallback(() => {
    const p = normalizePersonalityProfile({ id: "", name: "Nueva personalidad", author: "Yo" });
    setEditing(p);
  }, []);

  /* ── Asignación por contexto ── */

  const assignGlobal = useCallback((id: string) => {
    setActivePersonality({ scope: "global" }, id);
    toast.success("Personalidad global actualizada.");
  }, []);

  const assignSection = useCallback((seccion: PersonalitySection, value: string) => {
    setActivePersonality({ scope: "seccion", seccion }, value === "__inherit" ? null : value);
  }, []);

  const assignChat = useCallback(
    (value: string) => {
      if (!chatId) return;
      setActivePersonality({ scope: "chat", chatId }, value === "__inherit" ? null : value);
    },
    [chatId],
  );

  const activeGlobal = useMemo(
    () => profiles.find((p) => p.id === assignments.global) ?? null,
    [profiles, assignments.global],
  );

  /* ═══ Render ═══ */

  return (
    <div className="flex flex-col gap-3 text-white">
      {/* Cabecera + acciones globales */}
      <div className={cn(card, "flex flex-wrap items-center gap-2 px-3.5 py-2.5")}>
        <span className="inline-flex items-center gap-2 text-xs font-medium text-white/85">
          <Drama className="h-4 w-4 text-[#7fb8ff]" /> Personalidades de Aurora
        </span>
        <span className="text-[10px] text-white/40">
          {activeGlobal ? `Activa: ${activeGlobal.name}` : "Sin personalidad global"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button className={btnAzure} onClick={nueva} title="Crear una personalidad nueva">
            <Plus className="h-3 w-3" /> Nueva
          </button>
          <button className={btn} onClick={() => fileRef.current?.click()} title="Importar desde un archivo JSON">
            <FileUp className="h-3 w-3" /> Importar
          </button>
          <button className={btn} onClick={() => void openLibrary()} title="Instalar personalidades guardadas en tu Biblioteca">
            <Library className="h-3 w-3" /> Desde Biblioteca
          </button>
          <button className={btn} onClick={restaurar} title="Reinsertar los presets incluidos">
            <RotateCcw className="h-3 w-3" /> Restaurar presets
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onImportFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {/* Instalar desde la Biblioteca */}
      {libOpen && (
        <div className={cn(card, "px-3.5 py-2.5")}>
          <div className="mb-1.5 flex items-center gap-2">
            <BookOpenCheck className="h-3.5 w-3.5 text-[#7fb8ff]" />
            <span className="text-[11px] font-medium text-white/80">Personalidades en tu Biblioteca</span>
            <button className={cn(btn, "ml-auto")} onClick={() => setLibOpen(false)}>
              <X className="h-3 w-3" /> Cerrar
            </button>
          </div>
          {libItems === null ? (
            <p className="text-[11px] text-white/45">Cargando…</p>
          ) : libItems.length === 0 ? (
            <p className="text-[11px] text-white/45">
              No hay ítems de tipo «Personalidad» en tu Biblioteca todavía. Comparte una desde su tarjeta para verla aquí (y en tus otros dispositivos).
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {libItems.map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                  <Drama className="h-3.5 w-3.5 shrink-0 text-white/50" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-white/80">{it.title}</p>
                    {it.note && <p className="truncate text-[10px] text-white/40">{it.note}</p>}
                  </div>
                  <button className={btnAzure} onClick={() => installFromLibrary(it)}>
                    <Download className="h-3 w-3" /> Instalar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Asignación por contexto */}
      <div className={cn(card, "px-3.5 py-2.5")}>
        <div className="mb-2 flex items-center gap-2">
          <Globe2 className="h-3.5 w-3.5 text-[#39FF14]/80" />
          <span className="text-[11px] font-medium text-white/80">Personalidad por contexto</span>
          <span className="text-[10px] text-white/35">prioridad: chat &gt; cerebro &gt; sección &gt; global</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* Global */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Global</span>
            <Select value={assignments.global ?? undefined} onValueChange={assignGlobal}>
              <SelectTrigger className="h-8 rounded-xl border-white/10 bg-white/[0.05] text-xs">
                <SelectValue placeholder="Elegir personalidad" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Secciones */}
          {SECTIONS.map((s) => (
            <div key={s.id} className="flex flex-col gap-1">
              <span className={labelCls}>Sección · {s.label}</span>
              <Select
                value={assignments.porSeccion[s.id] ?? "__inherit"}
                onValueChange={(v) => assignSection(s.id, v)}
              >
                <SelectTrigger className="h-8 rounded-xl border-white/10 bg-white/[0.05] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit">— heredar (global) —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {/* Este chat */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Este chat</span>
            {chatId ? (
              <Select value={assignments.porChat[chatId] ?? "__inherit"} onValueChange={assignChat}>
                <SelectTrigger className="h-8 rounded-xl border-white/10 bg-white/[0.05] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit">— heredar —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-2.5 py-1.5 text-[10px] text-white/40">
                Abre un chat de Aurora para asignarle una personalidad propia. También puedes decírselo: «usa aquí la personalidad mentora».
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Galería de tarjetas */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {profiles.map((p) => {
          const badges = badgesFor(p.id);
          const isActive = badges.length > 0;
          return (
            <div
              key={p.id}
              className={cn(
                card,
                "flex flex-col gap-2 px-3.5 py-3 transition-colors duration-200",
                isActive && "border-[#007FFF]/40 bg-[#007FFF]/[0.07]",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
                  <ProfileIcon name={p.icon} className="h-4 w-4 text-[#7fb8ff]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-white/90">{p.name}</p>
                  <p className="line-clamp-2 text-[11px] leading-snug text-white/50">{p.description || "Sin descripción."}</p>
                  <p className="mt-0.5 text-[10px] text-white/30">v{p.version} · {p.author}</p>
                </div>
              </div>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {badges.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#b9ffab]"
                    >
                      <Check className="h-2.5 w-2.5" /> {b}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <button className={btnAzure} onClick={() => activate(p)} title="Activar globalmente">
                  <Sparkles className="h-3 w-3" /> Activar
                </button>
                <button className={btn} onClick={() => setEditing(p)} title="Editar niveladores y ajustes">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button className={btn} onClick={() => duplicate(p)} title="Duplicar">
                  <Copy className="h-3 w-3" /> Duplicar
                </button>
                <button className={btn} onClick={() => exportar(p)} title="Exportar como archivo JSON">
                  <Upload className="h-3 w-3" /> Exportar
                </button>
                <button className={btn} disabled={busy} onClick={() => void compartir(p)} title="Guardar en tu Biblioteca para compartir/instalar entre cuentas">
                  <Share2 className="h-3 w-3" /> Biblioteca
                </button>
                {brainId && (
                  <button 
                    className={cn(btn, connectedSet.has(p.id) ? "border-[#39FF14]/40 bg-[#39FF14]/15 text-[#b9ffab]" : "")} 
                    disabled={busyBrainId === p.id} 
                    onClick={() => toggleBrainConnection(p)} 
                    title={connectedSet.has(p.id) ? "Desconectar de este cerebro" : "Conectar a este cerebro"}
                  >
                    {busyBrainId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe2 className="h-3 w-3" />}
                    {connectedSet.has(p.id) ? "Conectada" : "Conectar"}
                  </button>
                )}
                <button
                  className={cn(btn, "border-red-500/25 text-red-200/80 hover:bg-red-500/15")}
                  onClick={() => eliminar(p)}
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" /> Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor */}
      {editing && (
        <PersonalityEditor
          key={editing.id || "nueva"}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => refresh()}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════ Editor ═══════════════════════════════ */

function PersonalityEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: PersonalityProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PersonalityProfile>(() => normalizePersonalityProfile(initial));

  const set = useCallback(<K extends keyof PersonalityProfile>(key: K, value: PersonalityProfile[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const setTrait = useCallback((key: string, value: number) => {
    setDraft((d) => ({ ...d, traits: { ...d.traits, [key]: value } }));
  }, []);

  const guardar = useCallback(() => {
    const saved = savePersonalityProfile(draft);
    // Vista previa inmediata del estilo de voz derivado del perfil editado.
    emitVoiceStyleForProfile(saved);
    toast.success(`«${saved.name}» guardada.`);
    onSaved();
    onClose();
  }, [draft, onSaved, onClose]);

  const selectCls = "h-8 rounded-xl border-white/10 bg-white/[0.05] text-xs";
  const inputCls = "h-8 rounded-xl border-white/10 bg-white/[0.05] text-xs";
  const areaCls = "min-h-[64px] rounded-xl border-white/10 bg-white/[0.05] text-xs";

  return (
    <div className={cn(card, "flex flex-col gap-3 px-3.5 py-3")}>
      <div className="flex items-center gap-2">
        <ProfileIcon name={draft.icon} className="h-4 w-4 text-[#FFBF00]" />
        <span className="text-xs font-medium text-white/85">Editor · {draft.name || "Personalidad"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className={btnAzure} onClick={guardar}>
            <Save className="h-3 w-3" /> Guardar
          </button>
          <button className={btn} onClick={onClose}>
            <X className="h-3 w-3" /> Cerrar
          </button>
        </div>
      </div>

      {/* Identidad */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Nombre</span>
          <Input className={inputCls} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Icono (Lucide)</span>
          <Select value={draft.icon} onValueChange={(v) => set("icon", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {withCurrent(ICON_OPTIONS, draft.icon).map((i) => (
                <SelectItem key={i} value={i}>{i}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelCls}>Descripción</span>
          <Textarea className={areaCls} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Autoría</span>
          <Input className={inputCls} value={draft.author} onChange={(e) => set("author", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Versión</span>
          <Input className={inputCls} value={draft.version} onChange={(e) => set("version", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Personaje / arquetipo</span>
          <Select value={draft.personaje || PERSONAJE_OPTIONS[0]} onValueChange={(v) => set("personaje", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {withCurrent(PERSONAJE_OPTIONS, draft.personaje).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Cultura</span>
          <Select value={draft.cultura || CULTURA_OPTIONS[0]} onValueChange={(v) => set("cultura", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {withCurrent(CULTURA_OPTIONS, draft.cultura).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Filosofía</span>
          <Select value={draft.filosofia || FILOSOFIA_OPTIONS[0]} onValueChange={(v) => set("filosofia", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {withCurrent(FILOSOFIA_OPTIONS, draft.filosofia).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Idioma preferido</span>
          <Select value={draft.idioma} onValueChange={(v) => set("idioma", v)}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {IDIOMAS.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Idiomas secundarios (códigos por comas)</span>
          <Input
            className={inputCls}
            value={draft.idiomasSecundarios.join(", ")}
            placeholder="en, fr"
            onChange={(e) => set("idiomasSecundarios", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Género de voz</span>
          <Select value={draft.generoVoz} onValueChange={(v) => set("generoVoz", v as PersonalityProfile["generoVoz"])}>
            <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="femenina">Femenina</SelectItem>
              <SelectItem value="masculina">Masculina</SelectItem>
              <SelectItem value="neutra">Neutra</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Niveladores por grupo */}
      <Accordion type="multiple" className="w-full">
        {PERSONALITY_TRAIT_GROUPS.map((g) => (
          <AccordionItem key={g.id} value={g.id} className="border-white/10">
            <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
              <span className="inline-flex items-center gap-2">
                <ProfileIcon name={g.icon} className="h-3.5 w-3.5 text-[#7fb8ff]" />
                {g.label}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3 pb-3">
              {g.traits.map((t) => {
                const v = Math.round(draft.traits[t.key] ?? t.default);
                return (
                  <div key={t.key} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-white/70">{t.label}</span>
                      <span className="tabular-nums text-white/40">{v}</span>
                    </div>
                    <Slider
                      value={[v]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(vals) => setTrait(t.key, vals[0] ?? v)}
                      aria-label={t.label}
                    />
                    {(t.low || t.high) && (
                      <div className="flex justify-between text-[9px] uppercase tracking-wide text-white/30">
                        <span>{t.low}</span>
                        <span>{t.high}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        ))}

        {/* Prompts */}
        <AccordionItem value="prompts" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="ScrollText" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Prompts
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-2 pb-3">
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Esencia (quién es)</span>
              <Textarea className={areaCls} value={draft.prompts.esencia} onChange={(e) => set("prompts", { ...draft.prompts, esencia: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Estilo (cómo habla)</span>
              <Textarea className={areaCls} value={draft.prompts.estilo} onChange={(e) => set("prompts", { ...draft.prompts, estilo: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Extra (notas adicionales)</span>
              <Textarea className={areaCls} value={draft.prompts.extra} onChange={(e) => set("prompts", { ...draft.prompts, extra: e.target.value })} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Estilo de respuesta */}
        <AccordionItem value="respuesta-cfg" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="AlignLeft" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Estilo de respuesta
            </span>
          </AccordionTrigger>
          <AccordionContent className="grid grid-cols-1 gap-2 pb-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Longitud</span>
              <Select value={draft.responseStyle.longitud} onValueChange={(v) => set("responseStyle", { ...draft.responseStyle, longitud: v as PersonalityProfile["responseStyle"]["longitud"] })}>
                <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breve">Breve</SelectItem>
                  <SelectItem value="equilibrada">Equilibrada</SelectItem>
                  <SelectItem value="extensa">Extensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Formato</span>
              <Select value={draft.responseStyle.formato} onValueChange={(v) => set("responseStyle", { ...draft.responseStyle, formato: v as PersonalityProfile["responseStyle"]["formato"] })}>
                <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prosa">Prosa</SelectItem>
                  <SelectItem value="estructurado">Estructurado</SelectItem>
                  <SelectItem value="adaptativo">Adaptativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Recomendaciones</span>
              <Select value={draft.responseStyle.recomendaciones} onValueChange={(v) => set("responseStyle", { ...draft.responseStyle, recomendaciones: v as PersonalityProfile["responseStyle"]["recomendaciones"] })}>
                <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proactivas">Proactivas</SelectItem>
                  <SelectItem value="bajo-demanda">Bajo demanda</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Herramientas */}
        <AccordionItem value="tools" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="Wrench" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Herramientas
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-2 pb-3">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PERSONALITY_TOOL_KINDS.map((k) => {
                const on = draft.tools.enabledKinds.includes(k.id);
                return (
                  <label key={k.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                    <span className="text-[11px] text-white/70">{k.label}</span>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) =>
                        set("tools", {
                          ...draft.tools,
                          enabledKinds: v
                            ? [...draft.tools.enabledKinds, k.id]
                            : draft.tools.enabledKinds.filter((x) => x !== k.id),
                        })
                      }
                      aria-label={k.label}
                    />
                  </label>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Plugins (por comas)</span>
                <Input className={inputCls} value={draft.tools.plugins.join(", ")} onChange={(e) => set("tools", { ...draft.tools, plugins: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>MCP (por comas)</span>
                <Input className={inputCls} value={draft.tools.mcp.join(", ")} onChange={(e) => set("tools", { ...draft.tools, mcp: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>APIs (por comas)</span>
                <Input className={inputCls} value={draft.tools.apis.join(", ")} onChange={(e) => set("tools", { ...draft.tools, apis: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Memoria */}
        <AccordionItem value="memoria" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="Database" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Política de memoria
            </span>
          </AccordionTrigger>
          <AccordionContent className="grid grid-cols-1 gap-2 pb-3 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
              <span className="text-[11px] text-white/70">Usar memorias</span>
              <Switch
                checked={draft.memoryPolicy.usarMemorias}
                onCheckedChange={(v) => set("memoryPolicy", { ...draft.memoryPolicy, usarMemorias: v })}
                aria-label="Usar memorias"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Nivel de contexto</span>
              <Select value={draft.memoryPolicy.nivelContexto} onValueChange={(v) => set("memoryPolicy", { ...draft.memoryPolicy, nivelContexto: v as "breve" | "completo" })}>
                <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breve">Breve</SelectItem>
                  <SelectItem value="completo">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className={labelCls}>Cerebros permitidos («todos» o ids por comas)</span>
              <Input
                className={inputCls}
                value={draft.memoryPolicy.cerebrosPermitidos === "todos" ? "todos" : draft.memoryPolicy.cerebrosPermitidos.join(", ")}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  set("memoryPolicy", {
                    ...draft.memoryPolicy,
                    cerebrosPermitidos: raw === "" || raw.toLowerCase() === "todos" ? "todos" : raw.split(",").map((s) => s.trim()).filter(Boolean),
                  });
                }}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Voz */}
        <AccordionItem value="voz" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="AudioLines" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Estilo de voz
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3 pb-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Tono</span>
                <Select value={draft.voiceStyle.tone} onValueChange={(v) => set("voiceStyle", { ...draft.voiceStyle, tone: v })}>
                  <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {withCurrent(TONE_OPTIONS, draft.voiceStyle.tone).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>Emoción</span>
                <Select value={draft.voiceStyle.emotion} onValueChange={(v) => set("voiceStyle", { ...draft.voiceStyle, emotion: v })}>
                  <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {withCurrent(EMOTION_OPTIONS, draft.voiceStyle.emotion).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {([
              { key: "rate" as const, label: "Velocidad", min: 0.5, max: 2, step: 0.05 },
              { key: "pitch" as const, label: "Tono (pitch)", min: 0.5, max: 2, step: 0.05 },
            ]).map((s) => (
              <div key={s.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/70">{s.label}</span>
                  <span className="tabular-nums text-white/40">{draft.voiceStyle[s.key].toFixed(2)}</span>
                </div>
                <Slider
                  value={[draft.voiceStyle[s.key]]}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  onValueChange={(vals) => set("voiceStyle", { ...draft.voiceStyle, [s.key]: vals[0] ?? draft.voiceStyle[s.key] })}
                  aria-label={s.label}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-white/70">Energía</span>
                <span className="tabular-nums text-white/40">{Math.round(draft.voiceStyle.energy)}</span>
              </div>
              <Slider
                value={[draft.voiceStyle.energy]}
                min={0}
                max={100}
                step={1}
                onValueChange={(vals) => set("voiceStyle", { ...draft.voiceStyle, energy: vals[0] ?? draft.voiceStyle.energy })}
                aria-label="Energía"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Conocimientos */}
        <AccordionItem value="conocimientos" className="border-white/10">
          <AccordionTrigger className="py-2.5 text-xs text-white/80 hover:no-underline">
            <span className="inline-flex items-center gap-2">
              <ProfileIcon name="BookOpen" className="h-3.5 w-3.5 text-[#7fb8ff]" /> Conocimientos
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-1 pb-3">
            <span className={labelCls}>Temas / referencias que prioriza (uno por línea)</span>
            <Textarea
              className={areaCls}
              value={draft.knowledge.join("\n")}
              placeholder={"educación\nred StarSeed\nprivacidad"}
              onChange={(e) => set("knowledge", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex items-center justify-end gap-1.5">
        <button className={btnAzure} onClick={guardar}>
          <Save className="h-3 w-3" /> Guardar personalidad
        </button>
        <button className={btn} onClick={onClose}>
          <X className="h-3 w-3" /> Cerrar sin guardar
        </button>
      </div>
    </div>
  );
}
