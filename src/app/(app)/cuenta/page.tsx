"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /cuenta · Centro de Cuenta e Identidad StarSeed (REAL, sobre Supabase)
//   · CENTRO DE CUENTA estilo Google: cabecera + buscador propio + tarjetas de
//     sección navegables con resumen EN VIVO (datos reales, nunca de ejemplo).
//   · Información personal: perfiles (facetas), @handle, correo externo.
//   · Identidad StarSeed: dirección interna <handle>@star.seed  (starseed_identities)
//   · Correos adjuntos: interno / alias creado / externos, con visibilidad y
//     accesos configurables (tabla account_emails) + nivel de conexión.
//   · Datos y privacidad, Seguridad, Sincronización, Personalización,
//     Notificaciones y Aurora e inteligencia: MONTAN los paneles ya existentes
//     (import), sin duplicar su lógica — esta página solo añade pegamento y
//     tarjetas-resumen con datos reales.
//   · Realtime: cambios en profiles/account_emails se reflejan al instante.
// Todo vacío y listo por defecto; sin datos de ejemplo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useMemo, type ComponentType, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useAccount } from "@/context/account-context";
import { AccountProfilesSwitcher } from "@/components/profiles/account-profiles-switcher";
import { ProfileIdentityPanel } from "@/components/settings/profile/profile-identity-panel";
// Adenda 66 §4: elegir QUÉ bibliotecas/folders/archivos se muestran en el perfil público.
import { ProfileLibraryShowcasePanel } from "@/components/settings/profile/profile-library-showcase-panel";
import { useMyProfiles } from "@/lib/profiles/profiles";
// Subida universal de archivos (Adenda 64 §9): cambiar foto/portada con un
// archivo real (dispositivo o biblioteca) en vez de solo pegar una URL.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
// Correo externo vinculado (honesto): persistido en user_settings.prefs, una
// tabla REAL — a diferencia de `account_emails` (sección "Correos adjuntos"
// más abajo), que referencia una tabla que no existe todavía en la base (ver
// nota en esa sección). Lo usa el toggle "externo" del compositor de Correos.
import { getLinkedExternalEmail, setLinkedExternalEmail } from "@/lib/mail/os-mail";

// ── Paneles YA EXISTENTES: se MONTAN aquí (reorganizados), nunca se duplica su lógica ──
import { ConfigExportPanel } from "@/components/settings/advanced/config-export-panel";
import { PrivacyPanel } from "@/components/settings/privacy/privacy-panel";
import { NeuronsPanel } from "@/components/settings/neurons/neurons-panel";
import { AccountSyncPanel } from "@/components/settings/account/account-sync-panel";
import { RealtimeSyncPanel } from "@/components/settings/account/realtime-sync-panel";
import { ProfilesSyncPanel } from "@/components/profiles/profiles-sync-panel";
import { EntityRolesPanel } from "@/components/settings/account/entity-roles-panel";
// Sentidos de Aurora (Adenda 63 · P-3): los paneles ya existían pero NO estaban
// montados en ninguna página. Viven aquí, dentro de «Aurora e inteligencia»
// (§7), cada uno con su propia ancla (#aurora-voz / #aurora-sentidos) para que
// el buscador de Ajustes y los enlaces profundos puedan saltar a ellos.
import { VoiceOssPanel } from "@/components/settings/aurora/voice-oss-panel";
import { VisionPanel } from "@/components/settings/aurora/vision-panel";

// ── Recolectores de datos reales (para las tarjetas-resumen; sin duplicar lógica) ──
import { listThreads } from "@/lib/messages/dm";
import { loadAllNotifications } from "@/lib/notifications/notifications";
import { loadItems as loadReminderItems } from "@/lib/clima/reminders-store";
import { readDesktopsSnapshot } from "@/components/desktop/desktop-store";
import { listMySpaces } from "@/lib/spaces/spaces";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import { listServers } from "@/lib/brains/servers";
import { activeCapabilities, type SkillCapability } from "@/ai/astraura/skills";
import { useMyBrains } from "@/lib/widget-data/os-live";
import {
  getUserContextSettings,
  DEFAULT_USER_CONTEXT_SETTINGS,
  type UserContextSettings,
} from "@/ai/astraura/user-context";
import { fetchMyProfile, updateMyProfile } from "@/lib/social/os-profiles";
import { cn } from "@/lib/utils";

import {
  Search,
  User,
  ShieldCheck,
  Lock,
  RefreshCw,
  Palette,
  Bell,
  Sparkles,
  LogOut,
  Server,
  Users2,
  FileText,
  MessageSquare,
  Brain,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  Clock,
  LayoutGrid,
  Compass,
  Radio,
  Mic,
} from "lucide-react";

type Row = Record<string, any>;

const USES: Array<[string, string]> = [
  ["login", "Iniciar sesión"],
  ["notifications", "Notificaciones"],
  ["recovery", "Recuperación"],
  ["contact", "Contacto"],
];
const VIS: Array<[string, string]> = [
  ["public", "Público"],
  ["contacts", "Contactos"],
  ["private", "Privado"],
];
const CONN: Array<[string, string]> = [
  ["none", "Sin verificar"],
  ["verified", "Verificado"],
  ["mailbox", "Bandeja conectada (próximamente)"],
];

function guessProvider(addr: string): string {
  const a = addr.toLowerCase();
  if (a.includes("@gmail.")) return "gmail";
  if (a.includes("@outlook.") || a.includes("@hotmail.") || a.includes("@live.")) return "outlook";
  if (a.includes("@yahoo.")) return "yahoo";
  if (a.includes("@icloud.")) return "icloud";
  if (a.endsWith("@star.seed")) return "starseed";
  return "imap";
}

/** Normaliza texto (minúsculas, sin acentos) para el buscador propio de la página. */
function norm(s: string): string {
  try {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  } catch {
    return String(s || "").toLowerCase().trim();
  }
}

/** Tiempo relativo compacto en español (para "último latido" / última sesión). */
function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "justo ahora";
  if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`;
  return `hace ${Math.round(diff / 86_400_000)} d`;
}

/* ── Tarjeta de sección navegable (buscador + resumen en vivo) ───────────────── */
interface CuentaSection {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  keywords: string;
  /** Clase de color del icono/texto (Tailwind, estática y completa). */
  accent: string;
  /** Clase de fondo+borde a juego (Tailwind, estática y completa — NUNCA construida
   *  por concatenación de string en runtime: Tailwind solo genera CSS para clases
   *  que aparecen LITERALES en el código fuente). */
  accentBg: string;
}

function SectionNavCard({ section, onOpen }: { section: CuentaSection; onOpen: (id: string) => void }) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(section.id)}
      className="text-left h-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.06] group"
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid place-items-center w-9 h-9 rounded-lg shrink-0 border", section.accentBg)}>
          <Icon className={cn("w-4 h-4", section.accent)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{section.title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{section.summary}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-70 transition-opacity mt-1" />
      </div>
    </button>
  );
}

/* ── Enlace corto a otra página del OS (accesos de Personalización/Notificaciones) ── */
function QuickLink({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer group"
    >
      <span className="grid place-items-center w-8 h-8 rounded-lg border border-white/10 bg-black/20 text-primary shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground leading-snug truncate">{description}</p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-50 group-hover:opacity-90 transition-opacity" />
    </Link>
  );
}

function CuentaContent() {
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const { user, signOut } = useAccount();
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<Row | null>(null);
  const [identity, setIdentity] = useState<Row | null>(null);
  const [emails, setEmails] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // alta de correo
  const [newAddr, setNewAddr] = useState("");
  const [newKind, setNewKind] = useState<"external" | "created">("external");
  const [newVis, setNewVis] = useState("private");

  // correo externo vinculado (para el toggle "externo" del compositor de Correos)
  const [externalEmail, setExternalEmailState] = useState("");
  const [externalEmailDraft, setExternalEmailDraft] = useState("");
  const [savingExternalEmail, setSavingExternalEmail] = useState(false);

  // buscador propio de la página (filtra las tarjetas-sección)
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const id = sess?.session?.user?.id ?? null;
    setUid(id);
    if (!id) { setLoading(false); return; }
    const [p, idn, em] = await Promise.all([
      supabase.from("os_profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("starseed_identities").select("*").eq("owner", id).maybeSingle(),
      supabase.from("account_emails").select("*").eq("user_id", id).order("kind", { ascending: true }),
    ]);
    const prof = (p as Row)?.data ?? null;
    setProfile(prof);
    setIdentity((idn as Row)?.data ?? null);
    setEmails(((em as Row)?.data as Row[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // correo externo vinculado (tabla REAL user_settings; aditivo, no interfiere con `load()`)
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void getLinkedExternalEmail().then((v) => {
      if (!alive) return;
      setExternalEmailState(v);
      setExternalEmailDraft(v);
    });
    return () => { alive = false; };
  }, [uid]);

  async function saveExternalEmail() {
    const addr = externalEmailDraft.trim();
    if (addr && !addr.includes("@")) { flash("Escribe un correo externo válido."); return; }
    setSavingExternalEmail(true);
    const ok = await setLinkedExternalEmail(addr);
    setSavingExternalEmail(false);
    if (ok) { setExternalEmailState(addr); flash(addr ? "Correo externo vinculado." : "Correo externo desvinculado."); }
    else flash("No se pudo guardar el correo externo vinculado.");
  }

  // realtime: perfil + correos
  useEffect(() => {
    if (!uid) return;
    const ch = (supabase as any)
      .channel("cuenta-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "account_emails", filter: "user_id=eq." + uid }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "os_profiles", filter: "user_id=eq." + uid }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, supabase, load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  async function addEmail() {
    if (!uid) return;
    const addr = newAddr.trim().toLowerCase();
    if (!addr || !addr.includes("@")) { flash("Escribe un correo válido."); return; }
    setSaving(true);
    const row: Row = {
      user_id: uid,
      address: addr,
      kind: newKind,
      visibility: newKind === "created" ? "public" : newVis,
      uses: { login: false, notifications: true, recovery: false, contact: newKind === "created" },
      provider: newKind === "created" ? "starseed" : guessProvider(addr),
      connection_level: "none",
      is_primary: false,
    };
    const { error } = await supabase.from("account_emails").insert(row);
    if (error) flash(error.message.includes("duplicate") || error.message.includes("unique") ? "Ese correo ya está adjunto." : "No se pudo adjuntar: " + error.message);
    else { setNewAddr(""); flash("Correo adjuntado. Verifica la propiedad para activarlo."); }
    setSaving(false);
  }

  async function patchEmail(id: string, patch: Row) {
    await supabase.from("account_emails").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function removeEmail(id: string) {
    await supabase.from("account_emails").delete().eq("id", id);
  }
  async function toggleUse(e: Row, key: string) {
    const uses = { ...(e.uses || {}) }; uses[key] = !uses[key];
    await patchEmail(e.id, { uses });
  }

  // ── Perfiles múltiples (facetas) de la cuenta — os_account_profiles ──
  const { profiles: facetProfiles } = useMyProfiles();

  // ── Resúmenes EN VIVO de las tarjetas-sección (datos reales, tolerantes) ──
  const [searchable, setSearchable] = useState<boolean | null>(null);
  const [savingSearchable, setSavingSearchable] = useState(false);
  const [filesCount, setFilesCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [threadsInfo, setThreadsInfo] = useState({ count: 0, unread: 0 });
  const [notifInfo, setNotifInfo] = useState({ count: 0, unread: 0 });
  const [remindersInfo, setRemindersInfo] = useState({ pending: 0, alarms: 0 });
  const [desktopsInfo, setDesktopsInfo] = useState({ count: 0, active: "" });
  const [spacesCount, setSpacesCount] = useState(0);
  const [neurons, setNeurons] = useState<Neuron[]>([]);
  const [serversCount, setServersCount] = useState(0);
  const [caps, setCaps] = useState<SkillCapability[]>([]);
  const [auroraCtx, setAuroraCtx] = useState<UserContextSettings>({ ...DEFAULT_USER_CONTEXT_SETTINGS });
  const { rows: brainRows } = useMyBrains();

  useEffect(() => {
    setAuroraCtx(getUserContextSettings());
    setCaps(activeCapabilities());
    if (!uid) return;
    let alive = true;
    (async () => {
      const [
        filesRes,
        postsRes,
        threads,
        notifs,
        servers,
        spaces,
        neuronList,
        myProfile,
      ] = await Promise.allSettled([
        supabase.from("os_files").select("id", { count: "exact", head: true }).eq("owner", uid),
        supabase.from("os_posts").select("id", { count: "exact", head: true }).eq("author_id", uid),
        listThreads(),
        loadAllNotifications(),
        listServers(),
        listMySpaces(),
        listNeurons(),
        fetchMyProfile(),
      ]);
      if (!alive) return;

      if (filesRes.status === "fulfilled") setFilesCount(filesRes.value.count ?? 0);
      if (postsRes.status === "fulfilled") setPostsCount(postsRes.value.count ?? 0);
      if (threads.status === "fulfilled") {
        setThreadsInfo({
          count: threads.value.length,
          unread: threads.value.reduce((n, t) => n + (t.unreadCount || 0), 0),
        });
      }
      if (notifs.status === "fulfilled") {
        setNotifInfo({ count: notifs.value.length, unread: notifs.value.filter((n) => !n.seen).length });
      }
      if (servers.status === "fulfilled") setServersCount(servers.value.length);
      if (spaces.status === "fulfilled") setSpacesCount(spaces.value.length);
      if (neuronList.status === "fulfilled") setNeurons(neuronList.value);
      if (myProfile.status === "fulfilled") setSearchable(myProfile.value?.searchable ?? true);

      try {
        const store = loadReminderItems(uid);
        setRemindersInfo({
          pending: store.reminders.filter((r) => r.dueAt > Date.now()).length,
          alarms: store.alarms.filter((a) => a.enabled).length,
        });
      } catch { /* defensivo */ }

      try {
        const desk = readDesktopsSnapshot();
        const active = desk.desktops.find((d) => d.id === desk.activeId) ?? desk.desktops[0];
        setDesktopsInfo({ count: desk.desktops.length, active: active?.name ?? "" });
      } catch { /* defensivo */ }
    })();
    return () => { alive = false; };
  }, [uid, supabase]);

  async function toggleSearchable(next: boolean) {
    setSavingSearchable(true);
    const res = await updateMyProfile({ searchable: next });
    if (res.ok) { setSearchable(next); flash(next ? "Apareces en el directorio de búsqueda." : "Ya no apareces en el directorio de búsqueda."); }
    else flash("No se pudo actualizar la visibilidad del directorio.");
    setSavingSearchable(false);
  }

  async function handleSignOut() {
    if (typeof window !== "undefined" && !window.confirm("¿Cerrar sesión en este dispositivo?")) return;
    await signOut();
    flash("Sesión cerrada. Redirigiendo…");
    setTimeout(() => { window.location.href = "/bienvenida"; }, 600);
  }

  // ── estilos inline (secciones históricas: Perfil/Identidad/Correos) ──
  const card: Row = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: 18, marginBottom: 16 };
  const label: Row = { fontSize: 12, opacity: .65, display: "block", marginBottom: 4 };
  const input: Row = { width: "100%", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: "9px 11px", color: "inherit", fontSize: 14, marginBottom: 10 };
  const btn: Row = { background: "linear-gradient(135deg,#7c5cff,#23d5ab)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontWeight: 600, cursor: "pointer" };
  const ghost: Row = { background: "transparent", border: "1px solid rgba(255,255,255,.18)", borderRadius: 9, padding: "5px 10px", color: "inherit", cursor: "pointer", fontSize: 12 };
  const chip: Row = { display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.18)", marginRight: 6 };

  // ── Tarjetas-sección (id + resumen en vivo) ──
  const sections = useMemo(() => {
    const userHandle = profile?.handle ?? profile?.username;
    const handleTxt = userHandle ? `@${userHandle}` : "sin @ todavía";
    const externos = emails.filter((e) => e.kind !== "internal").length;
    return [
      {
        id: "info-personal",
        icon: User,
        title: "Información personal",
        summary: `${facetProfiles.length || 1} perfil${facetProfiles.length === 1 ? "" : "es"} · ${handleTxt} · ${externos} correo${externos === 1 ? "" : "s"} externo${externos === 1 ? "" : "s"}`,
        keywords: "perfil handle nombre bio avatar portada correo email",
        accent: "text-[#DC143C]",
        accentBg: "bg-[#DC143C]/10 border-[#DC143C]/20",
      },
      {
        id: "datos-privacidad",
        icon: Lock,
        title: "Datos y privacidad",
        summary: searchable == null ? "Exportar/importar · papelera local" : `Directorio: ${searchable ? "visible" : "oculto"} · exportar/importar · papelera`,
        keywords: "privacidad exportar importar borrar papelera limpieza directorio buscable searchable",
        accent: "text-emerald-400",
        accentBg: "bg-emerald-400/10 border-emerald-400/20",
      },
      {
        id: "seguridad",
        icon: ShieldCheck,
        title: "Seguridad",
        summary: `Sesión activa · ${neurons.length} neurona${neurons.length === 1 ? "" : "s"}${neurons.filter((n) => n.online).length ? ` (${neurons.filter((n) => n.online).length} en línea)` : ""}`,
        keywords: "seguridad sesion dispositivos neuronas cerrar sesion logout",
        accent: "text-amber-400",
        accentBg: "bg-amber-400/10 border-amber-400/20",
      },
      {
        id: "sincronizacion",
        icon: RefreshCw,
        title: "Sincronización",
        summary: `${facetProfiles.length} perfil${facetProfiles.length === 1 ? "" : "es"} sincronizado${facetProfiles.length === 1 ? "" : "s"} · ${serversCount} servidor${serversCount === 1 ? "" : "es"}`,
        keywords: "sincronizacion realtime tiempo real servidores cerebros dispositivos",
        accent: "text-[#39FF14]",
        accentBg: "bg-[#39FF14]/10 border-[#39FF14]/20",
      },
      {
        id: "personalizacion",
        icon: Palette,
        title: "Personalización",
        summary: `${desktopsInfo.count} escritorio${desktopsInfo.count === 1 ? "" : "s"}${desktopsInfo.active ? ` · activo: ${desktopsInfo.active}` : ""}`,
        keywords: "apariencia tema escritorios trinity personalizacion diseno",
        accent: "text-violet-400",
        accentBg: "bg-violet-400/10 border-violet-400/20",
      },
      {
        id: "notificaciones",
        icon: Bell,
        title: "Notificaciones y recordatorios",
        summary: `${notifInfo.unread} sin leer · ${remindersInfo.pending} recordatorio${remindersInfo.pending === 1 ? "" : "s"} pendiente${remindersInfo.pending === 1 ? "" : "s"}`,
        keywords: "notificaciones avisos recordatorios alarmas",
        accent: "text-sky-400",
        accentBg: "bg-sky-400/10 border-sky-400/20",
      },
      {
        id: "aurora-ia",
        icon: Sparkles,
        title: "Aurora e inteligencia",
        summary: `${caps.length} capacidad${caps.length === 1 ? "" : "es"} activa${caps.length === 1 ? "" : "s"} · ${brainRows.length} cerebro${brainRows.length === 1 ? "" : "s"} · contexto ${auroraCtx.enabled ? "activado" : "desactivado"}`,
        keywords: "aurora astraura ia inteligencia cerebros capacidades contexto",
        accent: "text-[#007FFF]",
        accentBg: "bg-[#007FFF]/10 border-[#007FFF]/20",
      },
      {
        id: "aurora-voz",
        icon: Mic,
        title: "Voz de Aurora",
        summary: "Motor de voz (navegador, Kokoro local, Bark, GPT-SoVITS, OmniVoice) y estilo emocional",
        keywords: "voz tts hablar kokoro kitten bark sovits omnivoice endpoint emocion clonar voz neurona sintesis",
        accent: "text-[#39FF14]",
        accentBg: "bg-[#39FF14]/10 border-[#39FF14]/20",
      },
      {
        id: "aurora-sentidos",
        icon: Eye,
        title: "Visión de Aurora (sentidos)",
        summary: "Percepción visual local con SmolVLM2 (WebGPU): pantalla, cámara o imagen",
        keywords: "vision sentidos smolvlm camara pantalla imagen percepcion multimodal webgpu local",
        accent: "text-violet-400",
        accentBg: "bg-violet-400/10 border-violet-400/20",
      },
    ];
  }, [profile, emails, facetProfiles, searchable, neurons, serversCount, desktopsInfo, notifInfo, remindersInfo, caps, brainRows, auroraCtx]);

  const filteredSections = useMemo(() => {
    const q = norm(query);
    if (!q) return sections;
    return sections.filter((s) => norm(`${s.title} ${s.summary} ${s.keywords}`).includes(q));
  }, [sections, query]);

  const scrollTo = useCallback((id: string) => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  // Enlaces profundos: ?createProfile / ?createIdentity → «Información personal»;
  // ?section=<id> o #<id> → cualquier sección con ancla real (p. ej. aurora-voz,
  // aurora-sentidos). Espera a que la página haya cargado: si no, el nodo aún no
  // existe en el DOM y el scroll sería un no-op silencioso.
  useEffect(() => {
    if (loading) return;
    const wantsProfile =
      searchParams?.get("createProfile") === "true" || searchParams?.get("createIdentity") === "true";
    const section =
      searchParams?.get("section") ||
      (typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "");
    const target = wantsProfile ? "info-personal" : section;
    if (!target) return;
    const t = setTimeout(() => scrollTo(target), 300);
    return () => clearTimeout(t);
  }, [searchParams, scrollTo, loading]);

  if (loading) return <div style={{ padding: 28, opacity: .7 }}>Cargando tu cuenta…</div>;

  if (!uid) {
    return (
      <div style={{ padding: 28, maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Tu cuenta StarSeed</h1>
        <p style={{ opacity: .7, marginBottom: 16 }}>Inicia sesión o crea tu cuenta para gestionar tu perfil, tu dirección <b>@star.seed</b> y tus correos adjuntos.</p>
        <a href="/bienvenida" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>Entrar / Crear cuenta</a>
      </div>
    );
  }

  const internal = emails.find((e) => e.kind === "internal");
  const displayName = profile?.display_name || facetProfiles.find((p) => p.isDefault)?.name || "Tu cuenta";
  const initials = (displayName || "SS").trim().split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join("") || "SS";

  return (
    <div className="w-full mx-auto px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] space-y-6 pb-24 max-w-5xl">
      {msg ? (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">{msg}</div>
      ) : null}

      {/* ── Cabecera: avatar + nombre + perfil activo ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-14 h-14 rounded-full shrink-0 grid place-items-center text-lg font-bold border border-white/10 bg-gradient-to-br from-primary/40 to-accent/40 bg-cover bg-center"
            style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : undefined}
          >
            {!profile?.avatar_url && initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight truncate">{displayName}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {profile?.username ? `@${profile.username}` : "Sin @ todavía"}
              {identity?.address ? ` · ${identity.address}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Adenda 66 §10 · Acceso directo al Editor de temas/estilos desde la
              cabecera de ajustes (no duplica: enlaza al Estudio de Diseño real). */}
          <Link
            href="/estudio"
            title="Editor de temas y estilos"
            aria-label="Editor de temas y estilos"
            className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-primary transition-colors hover:border-primary/30 hover:bg-primary/10"
          >
            <Palette className="w-4 h-4" />
          </Link>
          <div className="sm:w-56">
            <AccountProfilesSwitcher compact />
          </div>
        </div>
      </div>

      {/* ── Buscador propio de la página ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en tu cuenta (privacidad, seguridad, notificaciones…)"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
        />
      </div>

      {/* ── Tarjetas de sección navegables (resumen en vivo) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {filteredSections.map((s) => (
          <SectionNavCard key={s.id} section={s} onOpen={scrollTo} />
        ))}
        {filteredSections.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-4 text-center">Sin coincidencias para «{query}».</p>
        )}
      </div>

      {/* ═══════════════════════ 1) INFORMACIÓN PERSONAL ═══════════════════════ */}
      <section id="info-personal" className="scroll-mt-6 pt-4">
        <h2 className="text-base font-semibold mb-1">Información personal</h2>
        <p className="text-xs text-muted-foreground mb-3">Tus perfiles, tu @, tu bio y tus correos adjuntos.</p>

        {/* Perfil (Panel de Identidad Soberana) */}
        <div className="mb-4">
          <ProfileIdentityPanel />
        </div>

        {/* Biblioteca pública del perfil (Adenda 66 §4): qué se muestra a las visitas */}
        <section style={card}>
          <ProfileLibraryShowcasePanel />
        </section>

        {/* Identidad interna */}
        <section style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Tu dirección StarSeed</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 15 }}>{identity?.address ?? (profile?.username ? profile.username + "@star.seed" : "—")}</b>
            <span style={chip}>interna</span>
            {internal ? <span style={chip}>{internal.visibility}</span> : null}
          </div>
          <p style={{ opacity: .6, fontSize: 12, marginTop: 8 }}>
            Es tu buzón interno dentro del ecosistema StarSeed (mensajería entre cuentas). Cambia con tu @.
          </p>
        </section>

        {/* Correo externo vinculado (honesto, sin SMTP propio) */}
        <section style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Correo externo vinculado</h2>
          <p style={{ opacity: .6, fontSize: 12, marginBottom: 12 }}>
            Se usa como referencia al redactar en modo «externo» dentro de Correos. Honesto: StarSeed no tiene SMTP
            propio — ese modo abre un borrador en <b>tu</b> cliente de correo (mailto:) y guarda la copia en Enviados
            con la etiqueta «Externo». El envío/recepción real con proveedores (Gmail, etc.) requiere una integración
            futura (conector).
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              style={{ ...input, marginBottom: 0, flex: 1, minWidth: 220 }}
              value={externalEmailDraft}
              onChange={(e) => setExternalEmailDraft(e.target.value)}
              placeholder="tucorreo@gmail.com"
            />
            <button
              style={{ ...btn, opacity: savingExternalEmail || externalEmailDraft.trim() === externalEmail ? .6 : 1 }}
              disabled={savingExternalEmail || externalEmailDraft.trim() === externalEmail}
              onClick={saveExternalEmail}
            >
              {savingExternalEmail ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {externalEmail ? <p style={{ opacity: .5, fontSize: 11, marginTop: 8, marginBottom: 0 }}>Vinculado: {externalEmail}</p> : null}
        </section>

        {/* Correos adjuntos */}
        <section style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Correos adjuntos</h2>
          <p style={{ opacity: .5, fontSize: 11, marginBottom: 12 }}>
            Nota técnica honesta: este bloque referencia la tabla <code>account_emails</code>, que todavía no existe
            en la base de datos — se muestra vacío aunque adjuntes algo. Para el correo externo real, usa el campo
            «Correo externo vinculado» de arriba (sí persiste).
          </p>
          {emails.length === 0 ? (
            <p style={{ opacity: .6, fontSize: 13 }}>Aún no hay correos. Adjunta uno abajo.</p>
          ) : (
            emails.map((e) => (
              <div key={e.id} style={{ ...card, marginBottom: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <b style={{ fontSize: 14 }}>{e.address}</b>{e.is_primary ? <span style={{ ...chip, marginLeft: 8 }}>principal</span> : null}
                    <div style={{ marginTop: 4 }}>
                      <span style={chip}>{e.kind}</span>
                      <span style={chip}>{e.provider}</span>
                    </div>
                  </div>
                  {e.kind !== "internal" ? (
                    <button style={ghost} onClick={() => removeEmail(e.id)}>Quitar</button>
                  ) : null}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <label style={label}>Visibilidad</label>
                    <select style={{ ...input, width: "auto", marginBottom: 0 }} value={e.visibility} onChange={(ev) => patchEmail(e.id, { visibility: ev.target.value })}>
                      {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Conexión</label>
                    <select style={{ ...input, width: "auto", marginBottom: 0 }} value={e.connection_level} onChange={(ev) => patchEmail(e.id, { connection_level: ev.target.value })} disabled={e.kind === "internal"}>
                      {CONN.map(([v, l]) => <option key={v} value={v} disabled={v === "mailbox"}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={label}>Accesos</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {USES.map(([k, l]) => (
                      <button key={k} style={{ ...ghost, background: (e.uses && e.uses[k]) ? "rgba(124,92,255,.35)" : "transparent" }} onClick={() => toggleUse(e, k)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Alta de correo */}
          <div style={{ ...card, marginBottom: 0, borderStyle: "dashed" }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Adjuntar / crear correo</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button style={{ ...ghost, background: newKind === "external" ? "rgba(35,213,171,.3)" : "transparent" }} onClick={() => setNewKind("external")}>Externo existente</button>
              <button style={{ ...ghost, background: newKind === "created" ? "rgba(35,213,171,.3)" : "transparent" }} onClick={() => setNewKind("created")}>Alias público StarSeed</button>
            </div>
            <input style={input} value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder={newKind === "created" ? "alias@star.seed" : "tucorreo@gmail.com"} />
            {newKind === "external" ? (
              <div style={{ marginBottom: 10 }}>
                <label style={label}>Visibilidad</label>
                <select style={{ ...input, width: "auto", marginBottom: 0 }} value={newVis} onChange={(e) => setNewVis(e.target.value)}>
                  {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ) : null}
            <button style={{ ...btn, opacity: saving ? .6 : 1 }} disabled={saving} onClick={addEmail}>Adjuntar</button>
          </div>
        </section>
      </section>

      {/* ═══════════════════════ 2) DATOS Y PRIVACIDAD ═══════════════════════ */}
      <section id="datos-privacidad" className="scroll-mt-6 pt-2 space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-1">Datos y privacidad</h2>
          <p className="text-xs text-muted-foreground">Qué se guarda, quién puede encontrarte y cómo exportar o borrar todo.</p>
        </div>

        {/* Visibilidad searchable del directorio */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {searchable === false ? <EyeOff className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <Eye className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold">Aparecer en el directorio de búsqueda</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Si lo desactivas, otras personas no podrán encontrarte por tu @ o tu nombre en el buscador de la red
                (los enlaces directos a tu perfil siguen funcionando).
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={searchable !== false}
            disabled={savingSearchable || searchable === null}
            onClick={() => toggleSearchable(!(searchable !== false))}
            className={
              "shrink-0 w-11 h-6 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 " +
              (searchable !== false ? "bg-primary/70" : "bg-white/15")
            }
          >
            <span
              className={
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
                (searchable !== false ? "translate-x-[22px]" : "translate-x-0.5")
              }
            />
          </button>
        </div>

        <ConfigExportPanel />
        <PrivacyPanel />
      </section>

      {/* ═══════════════════════ 2.5) ROLES Y CONEXIONES (RBAC) ═══════════════════════ */}
      <section id="roles" className="scroll-mt-6 pt-2 space-y-4">
        <EntityRolesPanel />
      </section>

      {/* ═══════════════════════ 3) SEGURIDAD ═══════════════════════ */}
      <section id="seguridad" className="scroll-mt-6 pt-2 space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-1">Seguridad</h2>
          <p className="text-xs text-muted-foreground">Tu sesión, tus dispositivos (neuronas) y el cierre de sesión.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-sm font-semibold">Sesión activa</span>
            {user?.email ? <span className="text-xs text-muted-foreground">{user.email}</span> : null}
            {user?.app_metadata?.provider ? (
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/15 px-2 py-0.5 text-muted-foreground">
                {String(user.app_metadata.provider)}
              </span>
            ) : null}
          </div>
          {user?.last_sign_in_at ? (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Último inicio de sesión {relTime(user.last_sign_in_at) || "recientemente"}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión en este dispositivo
          </button>
        </div>

        <NeuronsPanel />
      </section>

      {/* ═══════════════════════ 4) SINCRONIZACIÓN ═══════════════════════ */}
      <section id="sincronizacion" className="scroll-mt-6 pt-2 space-y-4">
        <div>
          <h2 className="text-base font-semibold mb-1">Sincronización</h2>
          <p className="text-xs text-muted-foreground">Tu identidad soberana, igual en todos tus dispositivos y en Nexus/Café.</p>
        </div>

        <AccountSyncPanel />
        <RealtimeSyncPanel />
        <ProfilesSyncPanel />

        <QuickLink
          href="/servidores"
          icon={Server}
          label={`Servidores de cerebros (${serversCount})`}
          description="Registro de servidores propios/StarSeed/VPS enlazados a tus cerebros"
        />
      </section>

      {/* ═══════════════════════ 5) PERSONALIZACIÓN ═══════════════════════ */}
      <section id="personalizacion" className="scroll-mt-6 pt-2 space-y-3">
        <div>
          <h2 className="text-base font-semibold mb-1">Personalización</h2>
          <p className="text-xs text-muted-foreground">Apariencia, tus escritorios y la navegación Trinity.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <QuickLink href="/estudio" icon={Palette} label="Editor de temas" description="Estudio de Diseño: tema, tipografía, fondo y vidrio" />
          <QuickLink
            href="/escritorios"
            icon={LayoutGrid}
            label={`Escritorios (${desktopsInfo.count})`}
            description={desktopsInfo.active ? `Activo: ${desktopsInfo.active}` : "Organiza widgets e iconos"}
          />
          <QuickLink href="/settings?tab=trinity" icon={Compass} label="Trinity" description="Botón flotante y gestos de borde" />
        </div>
      </section>

      {/* ═══════════════════════ 6) NOTIFICACIONES Y RECORDATORIOS ═══════════════════════ */}
      <section id="notificaciones" className="scroll-mt-6 pt-2 space-y-3">
        <div>
          <h2 className="text-base font-semibold mb-1">Notificaciones y recordatorios</h2>
          <p className="text-xs text-muted-foreground">Avisos del sistema y de la red, más tus recordatorios y alarmas.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <QuickLink
            href="/notifications"
            icon={Bell}
            label={`Notificaciones${notifInfo.unread ? ` (${notifInfo.unread} sin leer)` : ""}`}
            description={`${notifInfo.count} en total · mensajes: ${threadsInfo.count} hilo${threadsInfo.count === 1 ? "" : "s"}${threadsInfo.unread ? `, ${threadsInfo.unread} sin leer` : ""}`}
          />
          <QuickLink
            href="/recordatorios"
            icon={Clock}
            label={`Recordatorios y alarmas (${remindersInfo.pending})`}
            description={`${remindersInfo.alarms} alarma${remindersInfo.alarms === 1 ? "" : "s"} activa${remindersInfo.alarms === 1 ? "" : "s"}`}
          />
        </div>
      </section>

      {/* ═══════════════════════ 7) AURORA E INTELIGENCIA ═══════════════════════ */}
      <section id="aurora-ia" className="scroll-mt-6 pt-2 space-y-3">
        <div>
          <h2 className="text-base font-semibold mb-1">Aurora e inteligencia</h2>
          <p className="text-xs text-muted-foreground">Tu Exocórtex: capacidades activas, cerebros y contexto que Aurora conoce.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-primary" /> Aurora conoce mi contexto
            </span>
            <span className={"text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 " + (auroraCtx.enabled ? "border-emerald-400/30 text-emerald-300 bg-emerald-500/10" : "border-white/15 text-muted-foreground")}>
              {auroraCtx.enabled ? `Activado · nivel ${auroraCtx.defaultLevel}` : "Desactivado"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Cambia esta preferencia en Ajustes → Aurora e IA. Cuando está activo, Aurora recibe un resumen de tu
            ámbito propio (perfiles, grupos, mensajes sin contenido, notificaciones…) en cada conversación.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {caps.length > 0 ? (
              caps.map((c) => (
                <span key={c.id} className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-200 text-[10px] px-2 py-0.5">
                  {c.label}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">Ninguna capacidad activa todavía.</span>
            )}
          </div>

          {brainRows.length > 0 && (
            <div className="pt-1">
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5" /> Cerebros ({brainRows.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {brainRows.slice(0, 6).map((b) => (
                  <span key={b.id} className="rounded-full border border-white/10 bg-black/20 text-[10px] px-2 py-0.5">
                    {b.name || "Sin nombre"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <QuickLink href="/settings?tab=ai" icon={Sparkles} label="Inteligencia de Aurora" description="Proveedores, capacidades, contexto y voz" />
          <QuickLink href="/aurora" icon={MessageSquare} label="Aurora / Astraura" description="Asistente, personalidad y palabra de activación" />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg font-bold">{filesCount}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><FileText className="w-3 h-3" /> Archivos</p>
          </div>
          <div>
            <p className="text-lg font-bold">{postsCount}</p>
            <p className="text-[10px] text-muted-foreground">Publicaciones</p>
          </div>
          <div>
            <p className="text-lg font-bold">{spacesCount}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Users2 className="w-3 h-3" /> Espacios</p>
          </div>
          <div>
            <p className="text-lg font-bold">{neurons.length}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Radio className="w-3 h-3" /> Neuronas</p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ 8) VOZ DE AURORA ═══════════════════════ */}
      <section id="aurora-voz" className="scroll-mt-6 pt-2 space-y-3">
        <div>
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#39FF14]" /> Voz de Aurora
          </h2>
          <p className="text-xs text-muted-foreground">
            Con qué motor habla Aurora (navegador, Kokoro local o tus propios endpoints) y con qué estilo emocional.
            Todo gratis y con fallback: Aurora siempre habla.
          </p>
        </div>
        <VoiceOssPanel />
      </section>

      {/* ═══════════════════════ 9) VISIÓN DE AURORA (SENTIDOS) ═══════════════════════ */}
      <section id="aurora-sentidos" className="scroll-mt-6 pt-2 space-y-3">
        <div>
          <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
            <Eye className="w-4 h-4 text-violet-400" /> Visión de Aurora (sentidos)
          </h2>
          <p className="text-xs text-muted-foreground">
            Percepción visual 100% en tu dispositivo (SmolVLM2 + WebGPU): pantalla, cámara o una imagen. Opt-in,
            privada y sin enviar nada a ningún servidor.
          </p>
        </div>
        <VisionPanel />
      </section>
    </div>
  );
}

export default function CuentaPage() {
  return (
    <Suspense fallback={<div className="p-8 opacity-50">Cargando tu cuenta…</div>}>
      <CuentaContent />
    </Suspense>
  );
}
