"use client";

/**
 * CENTRO DE CONFIGURACIÓN DE AURORA Y ASTRAURA (Adenda 67 · P1).
 * ============================================================================
 * La antigua pantalla «Hola, soy Aurora» convertida en el centro COMPLETO.
 *
 * CUÁNDO SE ABRE SOLO:
 *   1. La primera vez, tras completar el alta de cuenta (como hacía el intro).
 *   2. Al entrar en AI Studio (`/agent`, `/estudio`) con el perfil sin configurar.
 *   3. La primera vez que se abre Aurora (evento del Exocórtex).
 *   → En los tres casos, sólo si `isSetupPending()`. Y sólo UNA vez por sesión:
 *     si lo cierras, no te vuelve a saltar mientras navegas.
 *
 * CUÁNDO SE ABRE A MANO (siempre disponible):
 *   · `openAuroraSetup("sentidos")` · evento `starseed:open-aurora-setup`
 *   · `window.openAuroraSetup()` · botón en Ajustes → Aurora e inteligencia
 *   · compatibilidad: sigue respondiendo al viejo `starseed:open-aurora-intro`.
 *
 * NADA es obligatorio: los valores por defecto (las mejores opciones gratuitas y
 * de código abierto) ya dejan a Aurora funcionando. «Configurar luego» cierra y
 * no vuelve a molestar.
 *
 * Las pestañas se cargan de forma perezosa (`next/dynamic`): el centro vive en el
 * layout de la app, así que su coste en el arranque debe ser ~cero.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import {
  Drama,
  Eye,
  Cable,
  Waypoints,
  Volume2,
  Database,
  Hand,
  Cpu,
  Brain,
  Server,
  KeyRound,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { getOnboarding } from "@/lib/onboarding/onboarding";
import {
  AURORA_SETUP_OPEN_EVENT,
  isSetupPending,
  markSetupDone,
} from "@/lib/aurora/setup-config";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import {
  DEFAULT_ANSWERS,
  SetupBienvenida,
  applyBienvenida,
  type BienvenidaAnswers,
} from "./setup-bienvenida";

/* Pestañas pesadas → sólo se descargan al abrirse el centro. */
const SetupPersonalidad = dynamic(() => import("./setup-personalidad"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const SetupSentidos = dynamic(() => import("./setup-sentidos"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const SetupConexiones = dynamic(() => import("./setup-conexiones"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const SetupAstraura = dynamic(() => import("./setup-astraura"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const SetupVoz = dynamic(() => import("./setup-voz"), { ssr: false, loading: () => <TabLoading /> });
const SetupMemoria = dynamic(() => import("./setup-memoria"), { ssr: false, loading: () => <TabLoading /> });

/* Paneles completos de la neurona (Adenda 103): dispositivo, cerebros,
   servidores de cerebro y APIs — todos los ajustes de la neurona en un sitio. */
const NeuronasPanel = dynamic(() => import("@/components/cerebro/neuronas-panel"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const BrainsPanel = dynamic(() => import("@/components/brains/brains-panel"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const ServersPanel = dynamic(() => import("@/components/brains/servers-panel"), {
  ssr: false,
  loading: () => <TabLoading />,
});
const AiProvidersPanel = dynamic(
  () => import("@/components/settings/ai/ai-providers-panel").then((m) => ({ default: m.AiProvidersPanel })),
  { ssr: false, loading: () => <TabLoading /> },
);

function TabLoading() {
  return <p className="px-1 py-8 text-center text-[11px] text-white/40">Cargando…</p>;
}

export type SetupTab =
  | "bienvenida"
  | "neurona"
  | "personalidad"
  | "cerebros"
  | "servidores"
  | "memoria"
  | "voz"
  | "apis"
  | "sentidos"
  | "conexiones"
  | "astraura";

const TABS: SectionTabItem[] = [
  { value: "bienvenida", label: "Bienvenida", icon: Hand },
  { value: "neurona", label: "Neurona", icon: Cpu },
  { value: "personalidad", label: "Personalidad", icon: Drama },
  { value: "cerebros", label: "Cerebros", icon: Brain },
  { value: "servidores", label: "Servidores", icon: Server },
  { value: "memoria", label: "Memoria", icon: Database },
  { value: "voz", label: "Voz · OmniVoice", icon: Volume2 },
  { value: "apis", label: "APIs", icon: KeyRound },
  { value: "sentidos", label: "Sentidos", icon: Eye },
  { value: "conexiones", label: "Conexiones", icon: Cable },
  { value: "astraura", label: "Astraura", icon: Waypoints },
];

const VALID_TABS = TABS.map((t) => t.value as SetupTab);

/** Rutas donde NO debe aparecer solo (aún se está dando de alta). */
const PUBLIC_PATH = /^\/(login|bienvenida|onboarding|auth)(\/|$)/;
/** AI Studio: entrar aquí sin configurar abre el centro. */
const STUDIO_PATH = /^\/(agent|estudio)(\/|$)/;

/** Puente global de Aurora (para el saludo hablado). */
function auroraSpeak(text: string): void {
  try {
    const bridge = (window as unknown as { STARSEED_AURORA?: { speak?: (t: string) => void } }).STARSEED_AURORA;
    bridge?.speak?.(text);
  } catch {
    /* */
  }
}

export function AuroraSetupCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SetupTab>("bienvenida");
  const [answers, setAnswers] = useState<BienvenidaAnswers>({ ...DEFAULT_ANSWERS });
  const [saving, setSaving] = useState(false);
  const pathname = usePathname();
  /** Ya lo hemos ofrecido en esta sesión: no reaparece al navegar. */
  const offered = useRef(false);

  const openAt = useCallback((t?: string) => {
    if (t && (VALID_TABS as string[]).includes(t)) setTab(t as SetupTab);
    setOpen(true);
  }, []);

  /* ── Apertura a mano (siempre disponible) ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      offered.current = true;
      openAt(detail?.tab);
    };
    window.addEventListener(AURORA_SETUP_OPEN_EVENT, onOpen);
    // Compatibilidad con el evento del intro anterior (aurora-control-panel).
    window.addEventListener("starseed:open-aurora-intro", onOpen);
    try {
      const w = window as unknown as Record<string, unknown>;
      w.openAuroraSetup = (t?: string) => {
        offered.current = true;
        openAt(t);
      };
      w.openAuroraIntro = () => {
        offered.current = true;
        openAt("bienvenida");
      };
    } catch {
      /* */
    }
    return () => {
      window.removeEventListener(AURORA_SETUP_OPEN_EVENT, onOpen);
      window.removeEventListener("starseed:open-aurora-intro", onOpen);
      try {
        const w = window as unknown as Record<string, unknown>;
        delete w.openAuroraSetup;
        delete w.openAuroraIntro;
      } catch {
        /* */
      }
    };
  }, [openAt]);

  /* ── Gate 1: primera vez (tras el alta de cuenta) ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (offered.current || !isSetupPending()) return;
    const path = window.location.pathname || "";
    if (PUBLIC_PATH.test(path)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data?.user) return; // invitado → primero el alta de cuenta
        let completed = false;
        try {
          completed = (await getOnboarding()).completed;
        } catch {
          completed = false;
        }
        if (cancelled || !completed) return; // aún en el asistente de identidad
        timer = setTimeout(() => {
          if (cancelled || offered.current || !isSetupPending()) return;
          offered.current = true;
          setOpen(true);
        }, 1200);
      } catch {
        /* sin sesión / sin red → no mostramos nada */
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* ── Gate 2: AI Studio con el perfil sin configurar ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (offered.current || !isSetupPending()) return;
    if (!STUDIO_PATH.test(pathname ?? "")) return;
    offered.current = true;
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [pathname]);

  /* ── Gate 3: primera vez que se ABRE Aurora ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAurora = () => {
      if (offered.current || !isSetupPending()) return;
      offered.current = true;
      setTimeout(() => setOpen(true), 600);
    };
    window.addEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onAurora);
    return () => window.removeEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onAurora);
  }, []);

  const finish = useCallback(
    (apply: boolean) => {
      setSaving(true);
      try {
        if (apply) {
          applyBienvenida(answers);
          if (answers.voiceOn) {
            const hello = answers.callName.trim()
              ? `Encantada, ${answers.callName.trim()}. Cuando quieras, aquí estoy.`
              : "Encantada. Cuando quieras, aquí estoy.";
            setTimeout(() => auroraSpeak(hello), 400);
          }
        }
      } finally {
        markSetupDone();
        setSaving(false);
        setOpen(false);
      }
    },
    [answers],
  );

  /* ── Cerrar con Escape (cerrar = «configurar luego», nada se pierde) ── */
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[93] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de configuración de Aurora y Astraura"
      // Marcador para el gate anti-doble-modal de la ventana de sistemas (A149):
      // si este centro NO está en el DOM, la ventana puede abrirse aunque el
      // setup siga pendiente (garantía de aparición por neurona).
      data-aurora-setup-center=""
    >
      <div className="flex max-h-[100dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-2xl border border-white/12 bg-[#0d1220]/97 shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
        {/* Cabecera */}
        <header className="relative shrink-0 border-b border-white/10 bg-gradient-to-b from-[#7fb8ff]/12 to-transparent px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#7fb8ff]/15 ring-1 ring-[#7fb8ff]/40">
              <Sparkles className="h-5 w-5 text-[#7fb8ff]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-white">Configurar Neurona</h2>
              <p className="text-[11px] leading-snug text-white/60">
                Todos los ajustes de esta neurona en un sitio: dispositivo, personalidades, cerebros y sus
                servidores, memorias, voz (OmniVoice), APIs, sentidos y conexión. Ya vengo lista con las
                mejores opciones gratuitas — cambia sólo lo que quieras.
              </p>
            </div>
            <button
              type="button"
              onClick={() => finish(false)}
              aria-label="Cerrar"
              className="shrink-0 cursor-pointer rounded-lg p-1.5 text-white/40 transition-colors duration-200 hover:bg-white/5 hover:text-white/85"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3">
            <SectionTabs
              items={TABS}
              value={tab}
              onValueChange={(v) => setTab(v as SetupTab)}
              ariaLabel="Secciones del centro de configuración"
              size="sm"
            />
          </div>
        </header>

        {/* Contenido */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {tab === "bienvenida" && (
            <SetupBienvenida answers={answers} onChange={(p) => setAnswers((a) => ({ ...a, ...p }))} />
          )}
          {tab === "neurona" && <NeuronasPanel />}
          {tab === "personalidad" && <SetupPersonalidad />}
          {tab === "cerebros" && <BrainsPanel />}
          {tab === "servidores" && <ServersPanel />}
          {tab === "memoria" && <SetupMemoria />}
          {tab === "voz" && <SetupVoz />}
          {tab === "apis" && <AiProvidersPanel />}
          {tab === "sentidos" && <SetupSentidos />}
          {tab === "conexiones" && <SetupConexiones />}
          {tab === "astraura" && <SetupAstraura />}
        </div>

        {/* Acciones */}
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => finish(false)}
            disabled={saving}
            className="cursor-pointer rounded-lg px-2 py-2 text-[11px] text-white/50 transition-colors duration-200 hover:text-white/85"
          >
            Configurar luego
          </button>
          <span className="hidden text-[10px] text-white/35 sm:block">
            Todo se guarda al momento. Puedes volver desde Ajustes → Aurora.
          </span>
          <button
            type="button"
            onClick={() => finish(true)}
            disabled={saving}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#7fb8ff] px-4 py-2 text-[12px] font-semibold text-[#0d1220] transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar y empezar"}
            {saving ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default AuroraSetupCenter;
