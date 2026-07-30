"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Search,
  Sparkles,
  Brain,
  MessageSquare,
  Cpu,
  Hammer,
  Wand2,
  Wrench,
  Plug,
  Eye,
  Send,
  Archive,
  Boxes,
  Map,
  Bot,
  BookOpen,
  Globe,
  Sun,
  Database,
  Server,
  Network,
  Link2,
  RefreshCw,
  ShieldCheck,
  Zap,
  Mic,
  Radio,
  PenSquare,
  Brush,
  LayoutGrid,
  AppWindow,
  Vote,
  Activity,
  Share2,
  Store,
  Award,
  Library,
  Compass,
  GraduationCap,
  Landmark,
  Palette,
  Home,
  LayoutDashboard,
  Mail,
  Bell,
  type LucideIcon,
} from "lucide-react";

/* ----------------------------------------------------------------------------
 * Tipos y catálogo de funciones de StarSeed
 * Cada función es una tarjeta enlazada (Link) a su ruta correspondiente.
 * ------------------------------------------------------------------------- */

type Feature = {
  label: string;
  route: string;
  blurb: string;
  icon: LucideIcon;
};

type FeatureGroup = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Color de acento del grupo (clave de ACCENTS) */
  accent: string;
  features: Feature[];
};

const GROUPS: FeatureGroup[] = [
  {
    id: "ia-studio",
    title: "IA Studio (Astraura)",
    description: "El estudio neural completo: chat, cerebros, foundry, skills y todo el ecosistema de Astraura.",
    icon: Sparkles,
    accent: "fuchsia",
    features: [
      { label: "Nexus", route: "/agent?tab=chat", blurb: "Conversa con Astraura en tiempo real — chats, carpetas y espacios.", icon: MessageSquare },
      { label: "Cerebro", route: "/agent?tab=cerebro", blurb: "El núcleo cognitivo de tu agente.", icon: Brain },
      { label: "Foundry", route: "/agent?tab=foundry", blurb: "Forja y entrena nuevos agentes.", icon: Hammer },
      { label: "Skills", route: "/agent?tab=skills", blurb: "Habilidades que Astraura puede invocar.", icon: Wand2 },
      { label: "Tools", route: "/agent?tab=tools", blurb: "Herramientas conectadas al agente.", icon: Wrench },
      { label: "MCPs", route: "/agent?tab=mcps", blurb: "Servidores Model Context Protocol.", icon: Plug },
      { label: "Sentidos", route: "/agent?tab=sentidos", blurb: "Percepción multimodal del agente.", icon: Eye },
      { label: "Telegram", route: "/agent?tab=telegram", blurb: "Astraura en tu Telegram.", icon: Send },
      { label: "Memorias", route: "/agent?tab=memorias", blurb: "Recuerdos persistentes del agente.", icon: Archive },
      { label: "Baúles", route: "/agent?tab=baules", blurb: "Agrupa memorias y conexiones.", icon: Boxes },
      { label: "Mapa 3D", route: "/agent?tab=mapa-3d", blurb: "Visualiza memorias en el espacio.", icon: Map },
      { label: "Agentes", route: "/agent?tab=agentes", blurb: "Gestiona tu flota de agentes.", icon: Bot },
      { label: "Wiki / OKF", route: "/agent?tab=wiki", blurb: "Open Knowledge Framework.", icon: BookOpen },
      { label: "Proveedor", route: "/agent?tab=proveedor", blurb: "Proveedores de modelos y APIs.", icon: Globe },
      { label: "Aurora", route: "/agent?tab=aurora", blurb: "Voz e interfaz Aurora.", icon: Sun },
      { label: "Almacenes", route: "/agent?tab=almacenes", blurb: "Fuentes de datos del agente.", icon: Database },
      { label: "Conexiones", route: "/agent?tab=conexiones", blurb: "Integraciones y cuentas.", icon: Link2 },
      { label: "Cerebros", route: "/agent?tab=cerebros", blurb: "Múltiples cerebros configurables.", icon: Cpu },
      { label: "Servidores", route: "/agent?tab=servidores", blurb: "Servidores de cómputo neural.", icon: Server },
      { label: "Decisiones", route: "/agent?tab=decisiones", blurb: "Registro de decisiones del agente.", icon: Vote },
      { label: "Mi actividad", route: "/agent?tab=mi-actividad", blurb: "Tu historial de actividad.", icon: Activity },
      { label: "Publicar", route: "/agent?tab=publicar", blurb: "Composer universal con IA.", icon: PenSquare },
      { label: "Pizarras", route: "/agent?tab=pizarras", blurb: "Centros de trabajo colaborativos.", icon: LayoutGrid },
      { label: "Apps IA", route: "/agent?tab=apps-ia", blurb: "Apps potenciadas por IA.", icon: AppWindow },
      { label: "Habilidades", route: "/agent?tab=habilidades", blurb: "Capacidades del agente.", icon: Zap },
      { label: "Conocimiento", route: "/agent?tab=conocimiento", blurb: "Red de conocimiento del agente.", icon: Share2 },
    ],
  },
  {
    id: "memoria-cerebros",
    title: "Memoria & Cerebros",
    description: "Tu exocórtex: memorias, baúles, cerebros y la red 3D que lo interconecta todo.",
    icon: Brain,
    accent: "violet",
    features: [
      { label: "Memory Hub", route: "/memorias", blurb: "Centro de todas tus memorias.", icon: Archive },
      { label: "Baúles", route: "/baules", blurb: "Agrupa memorias y conexiones.", icon: Boxes },
      { label: "Mapa 3D de memorias", route: "/memorias-3d", blurb: "Explora memorias en 3D.", icon: Map },
      { label: "Cerebros", route: "/cerebros", blurb: "Configura y gestiona cerebros.", icon: Cpu },
      { label: "Servidores de cerebro", route: "/servidores", blurb: "Infraestructura de cómputo neural.", icon: Server },
      { label: "Red 3D de interconexión", route: "/red-3d", blurb: "Visualiza la red completa en 3D.", icon: Network },
      { label: "Wiki OKF", route: "/wiki", blurb: "Open Knowledge Framework.", icon: BookOpen },
    ],
  },
  {
    id: "datos-conexiones",
    title: "Datos & Conexiones",
    description: "Almacenes multi-fuente, hubs de conexión, sincronización y seguridad de tu infraestructura.",
    icon: Database,
    accent: "cyan",
    features: [
      { label: "Cuenta e Identidad", route: "/cuenta", blurb: "Tu perfil, @star.seed y correos adjuntos.", icon: Mail },
      { label: "Almacenes multi-fuente", route: "/almacenes", blurb: "Unifica datos de muchas fuentes.", icon: Database },
      { label: "Conectores de servicios", route: "/conexiones", blurb: "Servicios, cuentas, APIs y agentes.", icon: Link2 },
      { label: "Syncthing", route: "/sincronizacion", blurb: "Sincronización de archivos P2P.", icon: RefreshCw },
      { label: "Proveedor MCP/API", route: "/proveedor", blurb: "Expón tus servicios como proveedor.", icon: Globe },
      { label: "Habilidades", route: "/habilidades", blurb: "Catálogo de habilidades.", icon: Zap },
      { label: "Seguridad DNS/VPN/VPS", route: "/seguridad", blurb: "Protege tu infraestructura.", icon: ShieldCheck },
    ],
  },
  {
    id: "voz-sentidos",
    title: "Voz & Sentidos",
    description: "Aurora da voz a Astraura; los Sentidos le dan percepción del mundo.",
    icon: Mic,
    accent: "amber",
    features: [
      { label: "Aurora · voz", route: "/aurora", blurb: "Interfaz de voz de Astraura.", icon: Mic },
      { label: "Sentidos de Aurora/Astraura", route: "/sentidos", blurb: "Percepción multimodal del agente.", icon: Radio },
    ],
  },
  {
    id: "creacion",
    title: "Creación",
    description: "Componer, dibujar y construir: del composer universal a las apps con IA.",
    icon: PenSquare,
    accent: "rose",
    features: [
      { label: "Composer universal", route: "/publicar", blurb: "Publica en cualquier formato.", icon: PenSquare },
      { label: "Lienzo", route: "/pizarra", blurb: "Lienzo libre para crear.", icon: Brush },
      { label: "Centros de trabajo", route: "/pizarras", blurb: "Pizarras y espacios colaborativos.", icon: LayoutGrid },
      { label: "Apps con IA", route: "/apps-ia", blurb: "Crea apps potenciadas por IA.", icon: AppWindow },
    ],
  },
  {
    id: "gobernanza",
    title: "Gobernanza (Ontocracia)",
    description: "Decisiones colectivas y tu actividad democrática dentro del sistema.",
    icon: Vote,
    accent: "emerald",
    features: [
      { label: "Decisiones", route: "/decisiones", blurb: "Propuestas y votaciones.", icon: Vote },
      { label: "Mi actividad democrática", route: "/mi-actividad", blurb: "Tu participación y huella.", icon: Activity },
    ],
  },
  {
    id: "conocimiento",
    title: "Conocimiento",
    description: "La red de conocimiento compartido del ecosistema.",
    icon: Share2,
    accent: "sky",
    features: [
      { label: "Red de Conocimiento", route: "/conocimiento", blurb: "Conecta y explora saber colectivo.", icon: Share2 },
    ],
  },
  {
    id: "ecosistema",
    title: "Ecosistema",
    description: "Tienda, insignias, biblioteca y la guía de bienvenida con Astraura.",
    icon: Store,
    accent: "indigo",
    features: [
      { label: "Tienda", route: "/store", blurb: "Descubre y adquiere módulos.", icon: Store },
      { label: "Insignias", route: "/insignias", blurb: "Logros y reconocimientos.", icon: Award },
      { label: "Biblioteca", route: "/library", blurb: "Tu colección de recursos.", icon: Library },
      { label: "Guía con Astraura", route: "/bienvenida", blurb: "Primeros pasos guiados.", icon: Compass },
    ],
  },
  {
    id: "la-red",
    title: "La Red",
    description: "La red social del ecosistema: política, educación, cultura, mensajes y más.",
    icon: Globe,
    accent: "teal",
    features: [
      { label: "La Red", route: "/network", blurb: "El feed social del ecosistema.", icon: Globe },
      { label: "Política", route: "/network/politics", blurb: "Espacio político de La Red.", icon: Landmark },
      { label: "Educación", route: "/network/education", blurb: "Aprendizaje colaborativo.", icon: GraduationCap },
      { label: "Cultura", route: "/network/culture", blurb: "Arte y cultura en La Red.", icon: Palette },
      { label: "Hub Social", route: "/hub", blurb: "Punto central de tu actividad social y comunidades.", icon: Home },
      { label: "Dashboard", route: "/dashboard", blurb: "Tu panel de control.", icon: LayoutDashboard },
      { label: "Mensajes", route: "/messages", blurb: "Conversaciones privadas.", icon: Mail },
      { label: "Notificaciones", route: "/notifications", blurb: "Alertas y novedades.", icon: Bell },
    ],
  },
];

/* Mapa de acentos por color — clases estáticas para que Tailwind las detecte. */
const ACCENTS: Record<
  string,
  { text: string; iconBg: string; ring: string; chip: string }
> = {
  fuchsia: { text: "text-fuchsia-300", iconBg: "bg-fuchsia-500/15 text-fuchsia-300", ring: "hover:border-fuchsia-400/40", chip: "bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-400/20" },
  violet: { text: "text-violet-300", iconBg: "bg-violet-500/15 text-violet-300", ring: "hover:border-violet-400/40", chip: "bg-violet-500/10 text-violet-200 ring-violet-400/20" },
  cyan: { text: "text-cyan-300", iconBg: "bg-cyan-500/15 text-cyan-300", ring: "hover:border-cyan-400/40", chip: "bg-cyan-500/10 text-cyan-200 ring-cyan-400/20" },
  amber: { text: "text-amber-300", iconBg: "bg-amber-500/15 text-amber-300", ring: "hover:border-amber-400/40", chip: "bg-amber-500/10 text-amber-200 ring-amber-400/20" },
  rose: { text: "text-rose-300", iconBg: "bg-rose-500/15 text-rose-300", ring: "hover:border-rose-400/40", chip: "bg-rose-500/10 text-rose-200 ring-rose-400/20" },
  emerald: { text: "text-emerald-300", iconBg: "bg-emerald-500/15 text-emerald-300", ring: "hover:border-emerald-400/40", chip: "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20" },
  sky: { text: "text-sky-300", iconBg: "bg-sky-500/15 text-sky-300", ring: "hover:border-sky-400/40", chip: "bg-sky-500/10 text-sky-200 ring-sky-400/20" },
  indigo: { text: "text-indigo-300", iconBg: "bg-indigo-500/15 text-indigo-300", ring: "hover:border-indigo-400/40", chip: "bg-indigo-500/10 text-indigo-200 ring-indigo-400/20" },
  teal: { text: "text-teal-300", iconBg: "bg-teal-500/15 text-teal-300", ring: "hover:border-teal-400/40", chip: "bg-teal-500/10 text-teal-200 ring-teal-400/20" },
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export default function FuncionesIndex() {
  const [query, setQuery] = React.useState("");

  const q = normalize(query.trim());

  const filteredGroups = React.useMemo(() => {
    if (!q) return GROUPS;
    return GROUPS.map((group) => {
      const groupMatches =
        normalize(group.title).includes(q) || normalize(group.description).includes(q);
      const features = group.features.filter(
        (f) =>
          groupMatches ||
          normalize(f.label).includes(q) ||
          normalize(f.blurb).includes(q) ||
          normalize(f.route).includes(q),
      );
      return { ...group, features };
    }).filter((group) => group.features.length > 0);
  }, [q]);

  const totalFeatures = React.useMemo(
    () => GROUPS.reduce((acc, g) => acc + g.features.length, 0),
    [],
  );
  const visibleFeatures = React.useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.features.length, 0),
    [filteredGroups],
  );

  return (
    <div className="w-full">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-fuchsia-300" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wider text-white/60">
            Índice de funciones
          </span>
        </div>
        <p className="text-sm text-white/70">
          Todas las funciones de StarSeed, en un solo lugar — integradas con Astraura.
        </p>
      </div>

      {/* Buscador */}
      <div className="sticky top-2 z-10 mb-8">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            aria-hidden
          />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una función por nombre… (p. ej. memorias, voz, decisiones)"
            aria-label="Buscar funciones"
            className="h-11 border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/40 backdrop-blur-md focus-visible:ring-fuchsia-400/40"
          />
        </div>
        <p className="mt-2 text-xs text-white/40">
          {q
            ? visibleFeatures + " de " + totalFeatures + " funciones"
            : totalFeatures + " funciones en " + GROUPS.length + " grupos"}
        </p>
      </div>

      {/* Sin resultados */}
      {filteredGroups.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-white/70">No se encontraron funciones para “{query}”.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-sm font-medium text-fuchsia-300 underline-offset-4 hover:underline"
          >
            Limpiar búsqueda
          </button>
        </div>
      )}

      {/* Grupos */}
      <div className="space-y-10">
        {filteredGroups.map((group) => {
          const accent = ACCENTS[group.accent] ?? ACCENTS.fuchsia;
          const GroupIcon = group.icon;
          return (
            <section key={group.id} aria-labelledby={"grupo-" + group.id}>
              <header className="mb-4 flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    accent.iconBg,
                  )}
                >
                  <GroupIcon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      id={"grupo-" + group.id}
                      className={cn("text-lg font-semibold", accent.text)}
                    >
                      {group.title}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                        accent.chip,
                      )}
                    >
                      {group.features.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-white/50">{group.description}</p>
                </div>
              </header>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.features.map((feature) => {
                  const FeatureIcon = feature.icon;
                  return (
                    <Link
                      key={group.id + "-" + feature.route + "-" + feature.label}
                      href={feature.route}
                      className={cn(
                        "group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-200",
                        "hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-lg",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50",
                        accent.ring,
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                          accent.iconBg,
                        )}
                      >
                        <FeatureIcon className="h-[18px] w-[18px]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{feature.label}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{feature.blurb}</p>
                        <p className="mt-1.5 truncate font-mono text-[10px] text-white/30">
                          {feature.route}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
