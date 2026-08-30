"use client";
/**
 * EntornoMontaje — Detección automática del entorno al abrir el OS en
 * CUALQUIER medio (navegador/PWA/app). Montado UNA vez en el layout raíz:
 * sondea medios (backend local/túnel/nube), registra la sesión viva para que
 * ESTE dispositivo la recuerde, y si hay OTRAS cuentas que ya usaron este
 * equipo sin sesión activa ahora, ofrece reanudarlas (la verificación sigue
 * siendo OTP del OS — aquí solo se SUGIERE el email, nunca credenciales).
 *
 * Todo es best-effort y defensivo: si algo falla, no se muestra nada y la
 * app carga exactamente igual que siempre.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History, MonitorSmartphone, X } from "lucide-react";
import {
  detectarEntorno,
  sugerirEmail,
  ultimoEntorno,
  type SnapshotEntorno,
} from "@/lib/entorno/deteccion-entorno";

const SS_DESCARTADAS = "starseed.entorno.descartadas.v1";

function hace(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 90) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export function EntornoMontaje() {
  const router = useRouter();
  const [snap, setSnap] = useState<SnapshotEntorno | null>(null);
  const [descartadas, setDescartadas] = useState<string[]>([]);
  // (Adenda 179 · fix hidratación) SSR y primer render del cliente NO deben leer
  // `window`: se gatea con `mounted` para que ambos rindan null y el aviso local
  // aparezca solo tras montar (mismo patrón que el portal de voz #310).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSnap(ultimoEntorno());
    try { setDescartadas(JSON.parse(sessionStorage.getItem(SS_DESCARTADAS) || "[]")); } catch { /* noop */ }
    let vivo = true;
    void detectarEntorno().then((s) => { if (vivo) setSnap(s); }).catch(() => { /* noop */ });
    return () => { vivo = false; };
  }, []);

  const descartar = useCallback((uid: string) => {
    setDescartadas((prev) => {
      const next = [...prev, uid];
      try { sessionStorage.setItem(SS_DESCARTADAS, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Solo con cuenta DETECTADA y SIN sesión activa: con sesión abierta el
  // cambio de cuenta sería ruido, no ayuda.
  const candidata = snap?.otrasCuentas.find((c) => !descartadas.includes(c.user_id));
  if (!candidata) {
    // (Adenda 179) En dev/local el navegador NO comparte la cookie de sesión del
    // dominio de producción (cookies por origen), así que el OS no reconoce tu
    // cuenta. En vez de aparecer como desconocido, ofrecemos iniciar sesión —
    // SIN tocar la auth del servidor (es un límite del navegador, no un bug).
    const esLocal = mounted && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    if (esLocal && !snap?.sesionActual) {
      return (
        <div role="dialog" aria-label="Sesión en modo local" className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-[65] max-w-[92vw] sm:max-w-sm rounded-xl border border-white/10 bg-black/70 p-3 shadow-lg backdrop-blur-md">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06]">
              <MonitorSmartphone className="h-4 w-4 text-cyan-200" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white/90">Modo local (dev)</p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/60">Aquí no llega tu sesión de producción (las cookies son por dominio). Inicia sesión con tu cuenta para reconocer esta neurona.</p>
              <a href="/login" className="mt-2 inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20">Iniciar sesión</a>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Cuentas detectadas en este dispositivo"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-[65] max-w-[92vw] sm:max-w-sm rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-3 shadow-lg"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06]">
          <MonitorSmartphone className="h-4 w-4 text-cyan-200" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">
            Cuenta detectada en este dispositivo
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/60">
            <History className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
            {candidata.email || candidata.user_id.slice(0, 8)} · usada {hace(candidata.ts)} desde {candidata.medio}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (candidata.email) sugerirEmail(candidata.email);
                router.push("/login");
              }}
              className="cursor-pointer rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20"
            >
              Continuar como {candidata.email?.split("@")[0] || "esa cuenta"}
            </button>
            <button
              type="button"
              onClick={() => descartar(candidata.user_id)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 transition-colors hover:text-white"
            >
              <X className="h-3 w-3" aria-hidden="true" /> Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EntornoMontaje;
