"use client";

// ════════════════════════════════════════════════════════════════════════════
// WelcomeWindow — Bienvenida / Especificaciones ANTES del login (sin sesión)
// ----------------------------------------------------------------------------
// Ventana de cristal que aparece PRIMERO, antes del formulario de login/registro,
// solo cuando NO hay sesión. Presenta las especificaciones del ecosistema (las
// mismas que antes vivían bajo el login) y ofrece, con honestidad, tres acciones
// reales antes de continuar:
//
//   (a) "Empezar con los sentidos de Aurora" → activa el micrófono para Aurora
//       (su sentido por defecto) usando la API real de sentidos del proyecto
//       (`requestSense` + `saveSenses`), sin inventar nada.
//   (b) "Permisos del sistema" → un flujo claro que solicita, uno a uno y con
//       gesto explícito, TODOS los permisos del navegador (micrófono, cámara,
//       pantalla, ubicación, portapapeles, archivos, notificaciones) mostrando
//       su estado en vivo. Reutiliza el catálogo `SENSES` y `requestSense`.
//   (c) "Instalar StarSeed OS" → detección inteligente de dispositivo (PWA),
//       vía `<InstallButton>` (beforeinstallprompt / iOS "Añadir a inicio").
//
// Y finalmente "Continuar" para revelar el login/registro.
//
// Diseño: cristal oscuro, gradiente violeta→teal (#a78bfa→#34d399), alineado con
// AuthGate. Anti-overflow: usa 100dvh, layout en columna y SCROLL INTERNO de la
// tarjeta si el contenido no cabe (nunca se sale por arriba ni por abajo).
//
// Aditivo y defensivo: SSR-safe (window/navigator sólo en efectos/manejadores),
// tolerante a fallos (los permisos degradan con gracia), y recuerda que ya se
// vio en este dispositivo vía sessionStorage para no repetirse en cada render.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SENSES,
  requestSense,
  permissionState,
  saveSenses,
  getSenses,
  defaultConfig,
  type SenseTestResult,
  type SensesConfig,
} from "@/lib/senses/senses";
import { InstallButton } from "@/components/welcome/install-button";
import {
  Sparkles,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Waves,
  AtSign,
  Compass,
} from "lucide-react";

type PermState = SenseTestResult["state"];

const STATE_LABEL: Record<PermState, { text: string; color: string }> = {
  granted: { text: "Concedido", color: "#6ee7b7" },
  denied: { text: "Denegado", color: "#fca5a5" },
  prompt: { text: "Pendiente", color: "#fcd34d" },
  unsupported: { text: "No disponible", color: "rgba(255,255,255,.5)" },
  error: { text: "Error", color: "#fca5a5" },
};

// Especificaciones / propuesta de valor (misma esencia que la nota del login).
const SPECS: { icon: string; title: string; desc: string }[] = [
  { icon: "✶", title: "Una sola cuenta soberana", desc: "OS, Nexus, Café y Audiomorphic con un mismo acceso; tus datos son solo tuyos." },
  { icon: "@", title: "Dirección @star.seed", desc: "Tu identidad interna en la red descentralizada, lista al crear tu cuenta." },
  { icon: "✦", title: "Aurora, tu exocórtex", desc: "Una guía inteligente propiedad tuya que percibe solo a través de los sentidos que actives." },
  { icon: "◎", title: "Democracia directa", desc: "Gobernanza, cultura y educación en un sistema operativo social abierto y auditable." },
];

const SEEN_KEY = "starseed:welcome-seen";

export interface WelcomeWindowProps {
  /** Se llama al pulsar "Continuar" (revela el login/registro). */
  onContinue: () => void;
  /** Clase extra para el contenedor exterior (overlay). */
  className?: string;
}

export function WelcomeWindow({ onContinue, className }: WelcomeWindowProps) {
  const [view, setView] = useState<"intro" | "permisos">("intro");
  const [perms, setPerms] = useState<Record<string, PermState>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [auroraBusy, setAuroraBusy] = useState(false);
  const [auroraDone, setAuroraDone] = useState(false);
  // (Adenda 181) Resumen honesto de la carpeta conectada por el permiso de archivos
  // (qué configs de cerebros/cuentas StarSeed se detectaron dentro).
  const [carpetaInfo, setCarpetaInfo] = useState("");
  // (Adenda 182 · contexto) Visor embebido que bloquea permisos a nivel navegador
  // (p.ej. el visor de Claude): se detecta tras montar (SSR-safe) y se DICE.
  const [visor, setVisor] = useState<{ bloqueado: boolean; visor: string }>({ bloqueado: false, visor: "" });
  useEffect(() => {
    import("@/lib/senses/senses").then((m) => setVisor(m.visorBloqueaPermisos())).catch(() => { /* */ });
  }, []);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ resumen?: string; backend?: string }>).detail;
      if (d?.resumen) setCarpetaInfo([d.resumen, d.backend].filter(Boolean).join(" "));
    };
    window.addEventListener("starseed:carpeta-detectada", h);
    return () => window.removeEventListener("starseed:carpeta-detectada", h);
  }, []);

  // Estado de permisos en vivo al abrir la vista de permisos (SSR-safe).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const entries = await Promise.all(
          SENSES.map(async (s) => [s.id, await permissionState(s.id)] as const),
        );
        if (alive) setPerms(Object.fromEntries(entries));
      } catch {
        /* degrada: sin estado previo, se muestra "pendiente/no disponible" */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // (a) "Empezar con los sentidos de Aurora": concede el micrófono (sentido por
  //     defecto de Aurora) de verdad y lo persiste como sentido activo de Aurora.
  const startAuroraSenses = useCallback(async () => {
    setAuroraBusy(true);
    try {
      const res = await requestSense("microfono");
      setPerms((p) => ({ ...p, microfono: res.state }));
      // Persiste micrófono como sentido de Aurora (upsert tolerante; si no hay
      // sesión aún, saveSenses igualmente espeja en window para Aurora).
      let cfg: SensesConfig;
      try {
        cfg = await getSenses();
      } catch {
        cfg = defaultConfig();
      }
      cfg.enabled.microfono = res.ok || cfg.enabled.microfono;
      cfg.aurora.microfono = res.ok || cfg.aurora.microfono;
      await saveSenses(cfg);
      setAuroraDone(true);
    } catch {
      /* nunca bloquea la bienvenida */
    } finally {
      setAuroraBusy(false);
    }
  }, []);

  // (b) Solicitar un permiso concreto de verdad (gesto explícito por sentido).
  const askPermission = useCallback(async (id: string) => {
    setTesting((p) => ({ ...p, [id]: true }));
    try {
      const res = await requestSense(id);
      setPerms((p) => ({ ...p, [id]: res.state }));
    } catch {
      setPerms((p) => ({ ...p, [id]: "error" }));
    } finally {
      setTesting((p) => ({ ...p, [id]: false }));
    }
  }, []);

  // Solicitar TODOS los permisos en secuencia (cada uno abre su diálogo nativo).
  const askAll = useCallback(async () => {
    for (const s of SENSES) {
      // eslint-disable-next-line no-await-in-loop
      await askPermission(s.id);
    }
  }, [askPermission]);

  const handleContinue = useCallback(() => {
    try {
      if (typeof window !== "undefined") sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* almacenamiento no disponible: no pasa nada */
    }
    onContinue();
  }, [onContinue]);

  const grantedCount = useMemo(
    () => SENSES.filter((s) => perms[s.id] === "granted").length,
    [perms],
  );

  const inputCard: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: 460,
    maxHeight: "calc(100dvh - 32px)",
    display: "flex",
    flexDirection: "column",
    background: "rgba(12,14,24,.86)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 22,
    boxShadow: "0 30px 90px rgba(0,0,0,.55)",
    backdropFilter: "blur(16px)",
    overflow: "hidden",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a StarSeed OS"
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210, // por encima de AuthGate (200) para aparecer PRIMERO
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        height: "100dvh",
        background: "radial-gradient(circle at 30% 20%, #1a1030, #05060d 70%)",
      }}
    >
      <style>{`
        @keyframes ssWelIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes ssWelOrbA { 0%,100% { transform: translate(0,0); } 50% { transform: translate(22px,16px); } }
        @keyframes ssWelOrbB { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-20px,-14px); } }
        .ss-wel-card { animation: ssWelIn .5s cubic-bezier(.22,1,.36,1) both; }
        .ss-wel-orb-a { animation: ssWelOrbA 14s ease-in-out infinite; }
        .ss-wel-orb-b { animation: ssWelOrbB 16s ease-in-out infinite; }
        .ss-wel-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; }
        .ss-wel-scroll::-webkit-scrollbar { width: 8px; }
        .ss-wel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 8px; }
        .ss-wel-primary:hover:not(:disabled) { filter: brightness(1.08); }
        .ss-wel-primary:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .ss-wel-soft:hover:not(:disabled) { background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.28) !important; }
        .ss-wel-soft:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .ss-wel-ghost:hover:not(:disabled) { color: rgba(255,255,255,.92) !important; }
        @media (prefers-reduced-motion: reduce) {
          .ss-wel-card, .ss-wel-orb-a, .ss-wel-orb-b { animation: none !important; }
        }
      `}</style>

      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div className="ss-wel-orb-a" style={{ position: "absolute", width: 440, height: 440, left: "-12%", top: "-14%", borderRadius: "50%", background: "radial-gradient(circle,#7c5cff55,transparent 60%)", filter: "blur(46px)" }} />
        <div className="ss-wel-orb-b" style={{ position: "absolute", width: 380, height: 380, right: "-10%", bottom: "-12%", borderRadius: "50%", background: "radial-gradient(circle,#23d5ab44,transparent 60%)", filter: "blur(46px)" }} />
      </div>

      <div className="ss-wel-card" style={inputCard}>
        {/* Cabecera fija (no hace scroll) */}
        <div style={{ padding: "22px 24px 14px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 6px 18px rgba(124,92,255,.45)" }}>✶</span>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, background: "linear-gradient(135deg,#a78bfa,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Bienvenida a StarSeed OS
            </span>
          </div>
          <p style={{ opacity: 0.72, fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            {view === "intro"
              ? "Antes de entrar, conoce lo esencial y deja tu sistema listo."
              : "Concede los sentidos que quieras. Nada se captura sin tu permiso."}
          </p>
        </div>

        {/* Cuerpo con SCROLL INTERNO (nunca desborda la pantalla) */}
        <div className="ss-wel-scroll" style={{ padding: "16px 24px", flex: "1 1 auto", minHeight: 0 }}>
          {view === "intro" ? (
            <>
              {/* Especificaciones */}
              <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
                {SPECS.map((s) => (
                  <div key={s.title} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                    <span aria-hidden style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#c4b5fd", background: "rgba(124,92,255,.14)", border: "1px solid rgba(124,92,255,.25)" }}>{s.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.9)" }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, opacity: 0.55, lineHeight: 1.45 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* (a) Empezar con los sentidos de Aurora */}
              <button
                type="button"
                className="ss-wel-primary"
                onClick={startAuroraSenses}
                disabled={auroraBusy}
                style={{ width: "100%", border: "none", borderRadius: 13, padding: "12px 0", color: "#fff", fontWeight: 700, fontSize: 14, cursor: auroraBusy ? "default" : "pointer", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 10px 28px rgba(124,92,255,.35)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}
              >
                {auroraBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : auroraDone ? <CheckCircle2 size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
                {auroraBusy ? "Activando…" : auroraDone ? "Sentidos de Aurora activos" : "Empezar con los sentidos de Aurora"}
              </button>
              <p style={{ textAlign: "center", fontSize: 10.5, opacity: 0.5, margin: "0 0 14px", lineHeight: 1.45 }}>
                <Waves size={11} style={{ verticalAlign: "-1px" }} aria-hidden /> Activa el micrófono para que Aurora escuche tus comandos de voz. Podrás ajustar cada sentido cuando quieras.
              </p>

              {/* (b) Permisos del sistema */}
              <button
                type="button"
                className="ss-wel-soft"
                onClick={() => setView("permisos")}
                style={{ width: "100%", border: "1px solid rgba(255,255,255,.16)", borderRadius: 13, padding: "11px 0", color: "rgba(255,255,255,.92)", fontWeight: 600, fontSize: 13.5, cursor: "pointer", background: "rgba(255,255,255,.04)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}
              >
                <ShieldCheck size={15} aria-hidden />
                Permisos del sistema
                {grantedCount > 0 && (
                  <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 700, color: "#6ee7b7" }}>· {grantedCount} concedidos</span>
                )}
              </button>

              {/* (c) Instalar StarSeed OS (detección de dispositivo) */}
              <InstallButton />
            </>
          ) : (
            <>
              {/* Flujo de permisos: uno a uno, con estado en vivo */}
              <button
                type="button"
                className="ss-wel-primary"
                onClick={askAll}
                style={{ width: "100%", border: "none", borderRadius: 13, padding: "11px 0", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 10px 24px rgba(124,92,255,.3)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}
              >
                <ShieldCheck size={15} aria-hidden /> Solicitar todos los permisos
              </button>

              {visor.bloqueado && (
                <p role="status" style={{ fontSize: 11, color: "#fcd34d", background: "rgba(252,211,77,.08)", border: "1px solid rgba(252,211,77,.25)", borderRadius: 10, padding: "8px 10px", margin: "0 0 10px", lineHeight: 1.5 }}>
                  Estás en {visor.visor}: bloquea los permisos del dispositivo a nivel navegador (no es un fallo de StarSeed).
                  Abre <b>este mismo enlace en Chrome o Safari</b> para que aparezcan los diálogos reales.
                </p>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {SENSES.map((s) => {
                  const Icon = s.icon;
                  const state = perms[s.id] ?? "prompt";
                  const meta = visor.bloqueado && state === "denied"
                    ? { text: "Bloqueado por el visor", color: "#fcd34d" }
                    : STATE_LABEL[state];
                  const isTesting = !!testing[s.id];
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)" }}>
                      <span aria-hidden style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(124,92,255,.14)", border: "1px solid rgba(124,92,255,.22)" }}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.9)" }}>{s.label}</div>
                        <div style={{ fontSize: 10.5, color: meta.color, fontWeight: 600 }}>{meta.text}</div>
                      </div>
                      <button
                        type="button"
                        className="ss-wel-soft"
                        onClick={() => askPermission(s.id)}
                        disabled={isTesting}
                        style={{ flexShrink: 0, border: "1px solid rgba(255,255,255,.16)", borderRadius: 10, padding: "6px 12px", color: "rgba(255,255,255,.9)", fontWeight: 600, fontSize: 12, cursor: isTesting ? "default" : "pointer", background: "rgba(255,255,255,.04)", display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        {isTesting ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden />
                        ) : state === "granted" ? (
                          <CheckCircle2 size={13} aria-hidden style={{ color: "#6ee7b7" }} />
                        ) : state === "denied" ? (
                          <XCircle size={13} aria-hidden style={{ color: "#fca5a5" }} />
                        ) : null}
                        {state === "granted" ? "Concedido" : "Permitir"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {carpetaInfo && (
                <p role="status" style={{ fontSize: 11, color: "#6ee7b7", margin: "10px 0 0", lineHeight: 1.5 }}>
                  {carpetaInfo}
                </p>
              )}

              <p style={{ fontSize: 10.5, opacity: 0.5, margin: "14px 0 0", lineHeight: 1.5 }}>
                Honestidad: cada permiso abre el diálogo real de tu navegador y sólo se usa a través de los sentidos que actives. Nada se captura de forma automática.
              </p>
            </>
          )}
        </div>

        {/* Pie fijo con acciones (no hace scroll) */}
        <div style={{ padding: "14px 24px 18px", borderTop: "1px solid rgba(255,255,255,.08)", flexShrink: 0, display: "grid", gap: 8 }}>
          {view === "permisos" ? (
            <button
              type="button"
              className="ss-wel-soft"
              onClick={() => setView("intro")}
              style={{ width: "100%", border: "1px solid rgba(255,255,255,.16)", borderRadius: 13, padding: "10px 0", color: "rgba(255,255,255,.85)", fontWeight: 600, fontSize: 13, cursor: "pointer", background: "rgba(255,255,255,.04)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Compass size={14} aria-hidden /> Volver
            </button>
          ) : null}

          <button
            type="button"
            className="ss-wel-primary"
            onClick={handleContinue}
            style={{ width: "100%", border: "none", borderRadius: 13, padding: "13px 0", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", background: "linear-gradient(135deg,#7c5cff,#23d5ab)", boxShadow: "0 10px 28px rgba(124,92,255,.35)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            Continuar al acceso <ArrowRight size={16} aria-hidden />
          </button>
          <p style={{ textAlign: "center", fontSize: 10.5, opacity: 0.45, margin: 0, lineHeight: 1.45, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <AtSign size={11} aria-hidden /> Al continuar podrás iniciar sesión o crear tu cuenta StarSeed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helper de una sola vez por sesión ────────────────────────────────────────
/** ¿Se debe mostrar la bienvenida? (no vista aún en esta sesión). SSR-safe. */
export function shouldShowWelcome(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export default WelcomeWindow;
