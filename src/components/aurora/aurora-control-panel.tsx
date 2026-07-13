"use client";

/**
 * AuroraControlPanel — panel de control accesible desde el botón del widget de IA.
 *
 * Permite, sin salir del widget:
 *   · Encender / apagar Aurora globalmente (persistido en `aurora_settings.enabled`).
 *   · Activar / desactivar cada SENTIDO individualmente
 *     (micrófono, cámara, pantalla, ubicación, portapapeles, archivos,
 *     notificaciones) — persistido en `senses_settings.config`.
 *
 * Reutiliza el modelo de sentidos existente (`@/lib/senses/senses`) y NO duplica
 * el cliente de Supabase: la persistencia vive en `getSenses`/`saveSenses` y en
 * el motor de Aurora (`setEnabled`). El toggle de cada sentido aquí controla el
 * interruptor maestro `enabled[senseId]` Y el permiso de Aurora `aurora[senseId]`
 * a la vez (un solo gesto: "Aurora puede percibir esto"), espejándose al instante
 * en `window.STARSEED_senses` para que el motor reaccione sin pegarle a la DB.
 *
 * Sincronización entre dispositivos/sistemas: se suscribe por realtime a
 * `senses_settings` y `aurora_settings` (filtrado por owner) y refresca el estado
 * cuando cambian desde otro dispositivo. Aurora es global (montada en el layout),
 * así que el mismo sistema/memorias/accesos/sentidos/cerebro aplica en todo contexto.
 *
 * SSR-safe: todo acceso a Supabase/navigator va dentro de efectos o manejadores.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Power, ShieldCheck, Settings2, Orbit, Sparkles } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  readFabEnabled,
  setFabEnabled as setFabEnabledBus,
  subscribeFabEnabled,
  setOrbHidden,
  readOrbHidden,
} from "@/lib/aurora/aurora-orb-bus";
import {
  SENSES,
  getSenses,
  saveSenses,
  permissionState,
  requestSense,
  type SensesConfig,
  type SenseTestResult,
} from "@/lib/senses/senses";
import { cn } from "@/lib/utils";

type PermState = SenseTestResult["state"];

const PERM_DOT: Record<PermState, string> = {
  granted: "bg-emerald-400",
  denied: "bg-red-400",
  prompt: "bg-amber-400",
  unsupported: "bg-white/25",
  error: "bg-red-400",
};

const PERM_LABEL: Record<PermState, string> = {
  granted: "Concedido",
  denied: "Denegado",
  prompt: "Pendiente",
  unsupported: "No consultable",
  error: "Error",
};

function MiniSwitch({
  checked,
  disabled,
  onChange,
  tone = "fuchsia",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  tone?: "fuchsia" | "cyan";
}) {
  const onBg = tone === "cyan" ? "bg-cyan-600" : "bg-fuchsia-600";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
        checked ? onBg : "bg-white/15",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function AuroraControlPanel({
  enabled,
  onSetEnabled,
}: {
  enabled: boolean;
  onSetEnabled: (v: boolean) => void;
}) {
  const [config, setConfig] = useState<SensesConfig | null>(null);
  const [perms, setPerms] = useState<Record<string, PermState>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  // Preferencia del botón flotante de Aurora (default ON, sincronizada).
  const [fabEnabled, setFabEnabledState] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFabEnabledState(readFabEnabled());
    return subscribeFabEnabled((e) => setFabEnabledState(e));
  }, []);

  const refreshPerms = useCallback(async () => {
    const entries = await Promise.all(
      SENSES.map(async (s) => [s.id, await permissionState(s.id)] as const),
    );
    setPerms(Object.fromEntries(entries));
  }, []);

  // Carga inicial del config de sentidos + estado de permisos.
  useEffect(() => {
    let alive = true;
    (async () => {
      const cfg = await getSenses();
      if (!alive) return;
      setConfig(cfg);
      setLoading(false);
      await refreshPerms();
    })();
    return () => {
      alive = false;
    };
  }, [refreshPerms]);

  // Realtime: si los sentidos o el estado de Aurora cambian en otro dispositivo,
  // refrescamos para mantener todo en sync.
  useEffect(() => {
    let alive = true;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const sb = createClient();
        supabaseRef.current = sb;
        const { data } = await sb.auth.getUser();
        const owner = data?.user?.id;
        if (!owner || !alive) return;
        const ch = sb
          .channel("aurora-control-" + owner)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "senses_settings",
              filter: "owner=eq." + owner,
            },
            async () => {
              const cfg = await getSenses();
              if (alive) setConfig(cfg);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "aurora_settings",
              filter: "owner=eq." + owner,
            },
            (payload: { new?: { enabled?: boolean } }) => {
              const next = payload?.new?.enabled;
              if (alive && typeof next === "boolean" && next !== enabled) {
                // Refleja el cambio remoto en el motor (sin re-persistir).
                onSetEnabled(next);
              }
            },
          )
          .subscribe();
        cleanup = () => {
          try {
            sb.removeChannel(ch);
          } catch {
            /* noop */
          }
        };
      } catch {
        /* sin sesión / sin realtime: el panel sigue funcionando localmente */
      }
    })();
    return () => {
      alive = false;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activa/desactiva un sentido para Aurora con un solo gesto:
  // enciende el maestro `enabled[id]` Y el permiso de Aurora `aurora[id]`.
  // Si el permiso del navegador aún no está concedido, lo solicita de verdad.
  const toggleSense = useCallback(
    async (id: string, value: boolean) => {
      if (!config) return;
      setBusy((b) => ({ ...b, [id]: true }));

      // Al encender, intenta conceder el permiso real del navegador (gesto del usuario).
      if (value) {
        const res = await requestSense(id);
        setPerms((p) => ({ ...p, [id]: res.state }));
      }

      const next: SensesConfig = {
        enabled: { ...config.enabled, [id]: value },
        aurora: { ...config.aurora, [id]: value },
        astraura: { ...config.astraura },
      };
      // Coherencia: si se apaga el maestro, ninguna IA puede usarlo.
      if (!value) {
        next.aurora[id] = false;
        next.astraura[id] = false;
      }
      setConfig(next); // optimista (espeja a window vía saveSenses)
      const saved = await saveSenses(next);
      if (saved) setConfig(saved);
      setBusy((b) => ({ ...b, [id]: false }));
    },
    [config],
  );

  const activeCount = config
    ? SENSES.filter((s) => config.enabled[s.id] && config.aurora[s.id]).length
    : 0;

  return (
    <div className="space-y-3">
      {/* Interruptor maestro de Aurora */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-xs text-white/80">
          <Power className="h-3.5 w-3.5 text-fuchsia-300" />
          Aurora activa
        </span>
        <MiniSwitch checked={enabled} onChange={onSetEnabled} />
      </div>

      {/* Botón flotante (orbe) en todo el OS — preferencia estable (default ON) */}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-xs text-white/80">
          <Orbit className="h-3.5 w-3.5 text-[#7fb8ff]" />
          Botón flotante
          <span className="hidden text-[10px] text-white/40 sm:inline">· en todas las secciones</span>
        </span>
        <MiniSwitch
          checked={fabEnabled}
          onChange={(v) => {
            setFabEnabledBus(v);
            // Al reactivar, deshace también un descarte de sesión previo.
            if (v && readOrbHidden()) setOrbHidden(false);
          }}
        />
      </div>

      {/* Relanzar la presentación breve de Aurora (preferencias de onboarding) */}
      <button
        type="button"
        onClick={() => {
          try {
            window.dispatchEvent(new CustomEvent("starseed:open-aurora-intro"));
          } catch {
            /* */
          }
        }}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition-colors hover:border-white/20 hover:text-white/90"
        title="Vuelve a presentarte y ajusta tono, idioma, intereses y voz"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#7fb8ff]" />
        Repetir presentación de Aurora
      </button>

      {/* Sentidos */}
      <div>
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-300/80" />
          <span className="text-[11px] font-medium text-white/70">
            Sentidos de Aurora
          </span>
          <span className="ml-auto text-[10px] text-white/40">
            {activeCount}/{SENSES.length} activos
          </span>
        </div>

        {loading || !config ? (
          <div className="flex items-center gap-2 px-1 py-4 text-xs text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando sentidos…
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {SENSES.map((s) => {
              const Icon = s.icon;
              const on = !!config.enabled[s.id] && !!config.aurora[s.id];
              const state = perms[s.id] ?? "unsupported";
              const disabled = !enabled;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                    on
                      ? "border-fuchsia-500/30 bg-fuchsia-500/5"
                      : "border-white/8 bg-white/[0.02]",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-md p-1.5",
                      on ? "bg-fuchsia-500/15" : "bg-white/5",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        on ? "text-fuchsia-300" : "text-white/40",
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-white/85">
                        {s.label}
                      </span>
                      <span
                        title={PERM_LABEL[state]}
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          PERM_DOT[state],
                        )}
                      />
                    </div>
                    <div className="truncate text-[10px] text-white/40">
                      {PERM_LABEL[state]}
                    </div>
                  </div>
                  {busy[s.id] ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                  ) : (
                    <MiniSwitch
                      checked={on}
                      disabled={disabled}
                      tone="fuchsia"
                      onChange={(v) => toggleSense(s.id, v)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-white/35">
          Cada sentido usa una API real del navegador y se concede con tu permiso
          explícito. Los cambios se sincronizan en todos tus dispositivos y
          aplican a Aurora en cualquier parte de StarSeed.
        </p>
        <a
          href="/ai-setup?tab=senses"
          className="mt-1 inline-flex items-center gap-1 px-0.5 text-[10px] text-cyan-300/80 hover:text-cyan-200 hover:underline"
        >
          <Settings2 className="h-3 w-3" />
          Ajustes avanzados de sentidos
        </a>
      </div>
    </div>
  );
}

export default AuroraControlPanel;
