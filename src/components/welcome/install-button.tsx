"use client";

// ════════════════════════════════════════════════════════════════════════════
// InstallButton — "Instalar StarSeed OS" con detección inteligente de dispositivo
// ----------------------------------------------------------------------------
// Un único botón que se adapta al dispositivo/navegador del usuario y ofrece la
// vía de instalación adecuada, reutilizando el PWA que ya existe en el proyecto
// (manifest `/manifest.webmanifest` + service worker `/sw.js`):
//
//   • Chrome/Edge/Android (soporta `beforeinstallprompt`) → captura el evento y
//     lanza el diálogo nativo de instalación con `prompt()`.
//   • iOS Safari (no soporta el evento) → muestra instrucciones claras para
//     "Añadir a pantalla de inicio" (Compartir → Añadir a pantalla de inicio).
//   • Ya instalada (display-mode: standalone / navigator.standalone) → informa
//     de que ya está instalada, sin botón redundante.
//   • Escritorio sin soporte de instalación → guía honesta (menú del navegador).
//
// Detección: `navigator.userAgent` + User-Agent Client Hints (UA-CH) cuando
// existan, más `matchMedia('(display-mode: standalone)')`. Todo SSR-safe: el
// acceso a window/navigator vive en efectos y manejadores. Aditivo y defensivo:
// si algo no está disponible, degrada a instrucciones legibles, nunca rompe.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Share, Plus, CheckCircle2, MonitorSmartphone } from "lucide-react";

// Tipado mínimo del evento no estándar `beforeinstallprompt` (Chromium).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Platform = "ios" | "android" | "desktop" | "unknown";

interface DeviceInfo {
  platform: Platform;
  isSafari: boolean;
  isStandalone: boolean;
}

// ── Detección de plataforma (UA-CH primero, userAgent como fallback) ──────────
function detectDevice(): DeviceInfo {
  if (typeof navigator === "undefined") {
    return { platform: "unknown", isSafari: false, isStandalone: false };
  }
  const ua = navigator.userAgent || "";
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean };
  }).userAgentData;

  // ¿Corriendo ya como app instalada?
  let isStandalone = false;
  try {
    isStandalone =
      (typeof window !== "undefined" &&
        window.matchMedia?.("(display-mode: standalone)")?.matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    isStandalone = false;
  }

  // iPadOS moderno se camufla como Mac; lo detectamos por touch.
  const isIPadOS =
    /Macintosh/.test(ua) &&
    typeof document !== "undefined" &&
    "ontouchend" in document;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOS;
  const isAndroid = /Android/.test(ua) || uaData?.platform === "Android";
  const isSafari =
    /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua) && isIOS;

  let platform: Platform = "unknown";
  if (isIOS) platform = "ios";
  else if (isAndroid) platform = "android";
  else if (uaData?.mobile === false || /Windows|Macintosh|Linux|CrOS/.test(ua))
    platform = "desktop";

  return { platform, isSafari, isStandalone };
}

export interface InstallButtonProps {
  className?: string;
  /** Estilo compacto para incrustar en filas de acciones. */
  compact?: boolean;
}

export function InstallButton({ className, compact }: InstallButtonProps) {
  const [device, setDevice] = useState<DeviceInfo>({
    platform: "unknown",
    isSafari: false,
    isStandalone: false,
  });
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Detección + captura del evento `beforeinstallprompt` (SSR-safe).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDevice(detectDevice());

    const onBeforeInstall = (e: Event) => {
      // Evita el mini-infobar por defecto para lanzarlo nosotros con el botón.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const alreadyInstalled = installed || device.isStandalone;

  const handleInstall = useCallback(async () => {
    // 1) Vía nativa (Chrome/Edge/Android): diálogo de instalación real.
    if (deferred) {
      setBusy(true);
      try {
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
      } catch {
        /* si el diálogo falla, no rompemos nada */
      } finally {
        setDeferred(null);
        setBusy(false);
      }
      return;
    }
    // 2) iOS Safari: no hay API → instrucciones "Añadir a pantalla de inicio".
    if (device.platform === "ios") {
      setShowIOSHelp((v) => !v);
      return;
    }
    // 3) Escritorio/otros sin evento aún: guía por el menú del navegador.
    setShowIOSHelp((v) => !v);
  }, [deferred, device.platform]);

  // ── Etiqueta y sub-texto según el dispositivo detectado ──
  const { label, hint } = useMemo(() => {
    if (alreadyInstalled)
      return { label: "StarSeed OS ya está instalada", hint: "Ábrela desde tu pantalla de inicio." };
    if (deferred)
      return { label: "Instalar StarSeed OS", hint: "Instalación con un toque en este dispositivo." };
    if (device.platform === "ios")
      return { label: "Añadir a pantalla de inicio", hint: "Instálala como app desde Safari." };
    if (device.platform === "android")
      return { label: "Instalar StarSeed OS", hint: "Añádela a tu dispositivo Android." };
    return { label: "Instalar StarSeed OS", hint: "Instálala como app de escritorio." };
  }, [alreadyInstalled, deferred, device.platform]);

  const btnStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid rgba(52,211,153,.30)",
    borderRadius: 13,
    padding: compact ? "10px 0" : "12px 0",
    color: "#d1fae5",
    fontWeight: 700,
    fontSize: compact ? 13 : 14,
    cursor: alreadyInstalled ? "default" : "pointer",
    opacity: busy ? 0.75 : 1,
    background: alreadyInstalled
      ? "rgba(16,185,129,.10)"
      : "linear-gradient(135deg, rgba(124,92,255,.16), rgba(35,213,171,.16))",
    transition: "filter .15s, opacity .15s",
  };

  return (
    <div className={className} style={{ width: "100%" }}>
      <button
        type="button"
        onClick={handleInstall}
        disabled={alreadyInstalled || busy}
        aria-expanded={showIOSHelp}
        style={btnStyle}
      >
        {alreadyInstalled ? (
          <CheckCircle2 size={compact ? 15 : 16} aria-hidden />
        ) : device.platform === "ios" ? (
          <Share size={compact ? 15 : 16} aria-hidden />
        ) : (
          <Download size={compact ? 15 : 16} aria-hidden />
        )}
        {label}
      </button>

      {!compact && (
        <p style={{ textAlign: "center", fontSize: 10.5, opacity: 0.5, margin: "6px 0 0", lineHeight: 1.45 }}>
          {hint}
        </p>
      )}

      {/* Instrucciones expandibles (iOS Safari / escritorio sin diálogo nativo) */}
      {showIOSHelp && !alreadyInstalled && (
        <div
          role="note"
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.12)",
            fontSize: 12,
            color: "rgba(255,255,255,.8)",
            lineHeight: 1.55,
          }}
        >
          {device.platform === "ios" ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Share size={14} aria-hidden /> Instalar en iPhone / iPad
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                <li>Pulsa el botón <b>Compartir</b> de Safari.</li>
                <li>
                  Elige <b>Añadir a pantalla de inicio</b>{" "}
                  <Plus size={12} style={{ verticalAlign: "-2px" }} aria-hidden />.
                </li>
                <li>Confirma con <b>Añadir</b>. StarSeed OS aparecerá como app.</li>
              </ol>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <MonitorSmartphone size={14} aria-hidden /> Instalar en este navegador
              </div>
              <p style={{ margin: 0 }}>
                Abre el menú del navegador y elige <b>Instalar aplicación</b> (o el
                icono de instalar en la barra de direcciones). Si aún no aparece,
                interactúa un poco con la página y vuelve a intentarlo.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default InstallButton;
