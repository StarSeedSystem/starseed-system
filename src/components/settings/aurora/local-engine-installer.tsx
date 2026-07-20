"use client";

/**
 * INSTALADOR DEL MOTOR DE VOZ LOCAL por dispositivo (Adendas 80-81).
 *
 * Detecta el sistema y las capacidades del equipo, recomienda la variante
 * (BF16/Q8_0/Q4_K_M) y ofrece la instalación de UNA LÍNEA (macOS/Linux), los
 * pasos honestos en Windows (beta) y la nota clara en Android/iOS. Si el motor
 * ya está activo, lo dice y ofrece reinstalar/desinstalar.
 *
 * Permisos, en cristiano: el daemon escucha SOLO en 127.0.0.1:4444 (nunca se
 * expone a la red), arranca con tu sesión, se duerme a los 10 min sin uso y
 * procesa la voz 100 % en el dispositivo. Se retira con `--uninstall`.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Cloud, Copy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const LOCAL_ENGINE_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/StarSeedSystem/starseed-system/main/native/astraura-voice/web-install.sh | bash";

export function LocalEngineInstaller({ installed = false }: { installed?: boolean }) {
  const [copied, setCopied] = useState(false);
  const det = useMemo(() => {
    if (typeof navigator === "undefined") {
      return { os: "linux" as const, label: "Linux", ramGB: 8, tier: "media" };
    }
    const ua = navigator.userAgent.toLowerCase();
    const os = /android/.test(ua)
      ? ("android" as const)
      : /iphone|ipad|ipod/.test(ua)
        ? ("ios" as const)
        : /mac/.test(ua)
          ? ("mac" as const)
          : /win/.test(ua)
            ? ("windows" as const)
            : ("linux" as const);
    const ramGB = Number((navigator as { deviceMemory?: number }).deviceMemory) || 8;
    const tier = ramGB >= 16 ? "alta" : ramGB >= 8 ? "media" : "baja";
    const label =
      os === "mac"
        ? "macOS"
        : os === "windows"
          ? "Windows"
          : os === "android"
            ? "Android"
            : os === "ios"
              ? "iOS / iPadOS"
              : "Linux";
    return { os, label, ramGB, tier };
  }, []);

  const variant = det.tier === "alta" ? "BF16" : det.tier === "media" ? "Q8_0" : "Q4_K_M";

  const copy = () => {
    try {
      void navigator.clipboard.writeText(LOCAL_ENGINE_INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el usuario puede seleccionar el texto a mano */
    }
  };

  if (installed) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 text-[11px] text-emerald-100/90">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
          <span className="font-medium text-emerald-100">
            Motor de voz LOCAL instalado y activo en este dispositivo
          </span>
        </div>
        <p className="leading-snug text-emerald-100/60">
          Escucha solo en 127.0.0.1:4444 · arranca con tu sesión · se duerme a los
          10 min · se actualiza solo cada 7 días con la red de la Librería. Para
          reinstalar: la misma línea de instalación con <code className="rounded bg-black/30 px-1">--reinstall</code>;
          para retirarlo: <code className="rounded bg-black/30 px-1">node install.mjs --uninstall</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] p-2.5 text-[11px] text-sky-100/90">
      <div className="flex items-center gap-2">
        <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        <span className="font-medium text-sky-100">
          Voz en la nube ahora · instala el motor LOCAL en este dispositivo
        </span>
      </div>
      <p className="leading-snug text-sky-100/70">
        Detectado: <span className="text-sky-100">{det.label}</span> · ~{det.ramGB} GB RAM →
        variante recomendada <span className="text-sky-100">{variant}</span> (el instalador
        sondea tu hardware y elige sola la exacta). El motor escucha solo en 127.0.0.1:4444,
        arranca con tu sesión, se duerme a los 10 min y se actualiza cada 7 días con la red
        de la Librería. Privacidad total: la voz se procesa aquí.
      </p>
      {(det.os === "mac" || det.os === "linux") && (
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-sky-200">
            {LOCAL_ENGINE_INSTALL_CMD}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 cursor-pointer px-2 text-[10px]"
            onClick={copy}
          >
            {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span className="ml-1">{copied ? "Copiado" : "Copiar"}</span>
          </Button>
        </div>
      )}
      {det.os === "mac" && (
        <p className="leading-snug text-sky-100/50">
          Pega la línea en Terminal (⌘+Espacio → «Terminal»). Necesita Node 18+ y git; el
          script instala cmake solo si falta (con Homebrew) y te pide permiso.
        </p>
      )}
      {det.os === "linux" && (
        <p className="leading-snug text-sky-100/50">
          Pega la línea en tu terminal. Necesita Node 18+, git y cmake (el script usa apt si
          falta). El servicio queda como unidad de usuario de systemd.
        </p>
      )}
      {det.os === "windows" && (
        <p className="leading-snug text-sky-100/60">
          Windows (beta, sin servicio automático): instala{" "}
          <a
            className="underline underline-offset-2"
            href="https://nodejs.org"
            target="_blank"
            rel="noreferrer"
          >
            Node 18+
          </a>{" "}
          y git, y en PowerShell:{" "}
          <code className="rounded bg-black/40 px-1 font-mono text-[10px]">
            git clone --depth 1 https://github.com/StarSeedSystem/starseed-system; cd
            starseed-system/native/astraura-voice; node install.mjs --no-service
          </code>{" "}
          — luego deja <code className="rounded bg-black/40 px-1">node daemon.mjs</code> en el
          arranque.
        </p>
      )}
      {(det.os === "android" || det.os === "ios") && <MobileOneTapInstall label={det.label} />}
    </div>
  );
}

/**
 * INSTALACIÓN AUTOMÁTICA SIN TERMINAL para Android/iOS (Adenda 84): un toque
 * descarga la voz local del navegador (Kokoro, ~80 MB) DENTRO de la app — sin
 * comandos ni permisos del sistema. Queda para siempre (caché del navegador) y
 * habla sin internet. La nube gratis sigue siendo la primera opción automática.
 */
function MobileOneTapInstall({ label }: { label: string }) {
  const [phase, setPhase] = useState<"idle" | "descargando" | "lista" | "error">("idle");
  const [pct, setPct] = useState(0);

  const instalar = async () => {
    if (phase === "descargando") return;
    setPhase("descargando");
    setPct(0);
    try {
      const m = await import("@/lib/aurora/tts-oss");
      const ok = await m.kokoroPreload((p: { progress?: number }) => {
        if (typeof p?.progress === "number") setPct(Math.round(p.progress * 100));
      });
      setPhase(ok ? "lista" : "error");
    } catch {
      setPhase("error");
    }
  };

  if (phase === "lista") {
    return (
      <p className="leading-snug text-emerald-200/90">
        ✅ Voz local instalada en este {label}: habla sin internet y con privacidad total.
        La nube gratis sigue de primera; esta queda de respaldo instantáneo.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-9 w-full cursor-pointer justify-center gap-2 bg-emerald-500/12 text-[11.5px] text-emerald-100 hover:bg-emerald-500/22"
        disabled={phase === "descargando"}
        onClick={() => void instalar()}
      >
        <Zap className="h-3.5 w-3.5 text-emerald-300" />
        {phase === "descargando"
          ? `Instalando voz local… ${pct > 0 ? pct + "%" : ""}`
          : `Instalar voz local en este ${label} (~80 MB, sin terminal)`}
      </Button>
      <p className="leading-snug text-sky-100/50">
        Un toque: se descarga dentro de la app y queda instalada (funciona sin internet).
        {phase === "error" ? " No se pudo completar ahora — la nube gratis sigue hablando; reintenta cuando quieras." : ""}
      </p>
    </div>
  );
}

export default LocalEngineInstaller;
