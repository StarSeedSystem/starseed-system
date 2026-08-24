"use client";

/**
 * STUDIO 1.58 · Privacidad — permisos REALES del navegador (Permissions API +
 * getUserMedia + Storage API) sobre este dispositivo, y los ajustes de
 * privacidad del backend soberano (sensores, red, memoria, air-gap).
 * Original: `PrivacySecurityControlView.jsx` (sección «Permisos Reales del
 * Dispositivo & Navegador» + banner Air-Gap + toggles de `settings`).
 * ----------------------------------------------------------------------------
 * El backend YA gobierna sus propios permisos (`/api/privacy/settings`); lo
 * que faltaba era un sitio donde VER y CONCEDER los permisos que ESTE
 * navegador tiene de verdad sobre GPS/micrófono/cámara/almacenamiento
 * persistente. La Permissions API no existe igual en todos los navegadores
 * (Safari/Firefox no exponen 'microphone'/'camera' vía `navigator.permissions`):
 * se detecta la ausencia y se dice con claridad — nunca se finge un estado.
 * El stream de audio/vídeo se suelta (`stop()`) en cuanto se confirma el
 * permiso: nunca se deja el indicador de grabación encendido.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Cloud, Compass, Cpu, Database, EyeOff, Globe, HardDrive, Lock, MapPin, Mic, RefreshCw, RotateCcw, Shield, ShieldOff, Sparkles, Unlock, UploadCloud, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158Privacy, toggleAstraura158AirGap, updateAstraura158Privacy, type Astraura158PrivacySettings,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, INPUT, MONO, SELECT, SUB, SectionTitle, clampInt, runS158, useBusy, useS158Load,
  type S158TabProps,
} from "./shared";

/* ── Permisos reales del navegador ──────────────────────────────────────────── */

type PermState = "granted" | "denied" | "prompt" | "unsupported" | "checking";
type SensorId = "geolocation" | "microphone" | "camera" | "storage";

interface SensorDef { id: SensorId; label: string; icon: LucideIcon; hint: string }

const SENSORS: SensorDef[] = [
  { id: "geolocation", label: "Geolocalización GPS", icon: MapPin, hint: "Coordenadas físicas de este dispositivo." },
  { id: "microphone", label: "Micrófono", icon: Mic, hint: "Voz en vivo para el daemon de escucha de Astraura." },
  { id: "camera", label: "Cámara", icon: Camera, hint: "Visión en vivo (SmolVLM2)." },
  { id: "storage", label: "Almacenamiento persistente", icon: HardDrive, hint: "Evita que el navegador borre la caché local bajo presión de espacio." },
];

/** Los ajustes booleanos del backend que se pintan como interruptores genéricos. */
const PRIVACY_TOGGLES: { key: keyof Astraura158PrivacySettings; label: string; icon: LucideIcon }[] = [
  { key: "allow_gps_location", label: "Ubicación GPS", icon: MapPin },
  { key: "allow_weather_sync", label: "Sincronización de clima", icon: Cloud },
  { key: "allow_microphone_stream", label: "Flujo de micrófono", icon: Mic },
  { key: "allow_camera_access", label: "Acceso a cámara", icon: Camera },
  { key: "allow_compass_orientation", label: "Brújula", icon: Compass },
  { key: "allow_gyroscope_motion", label: "Giroscopio", icon: RotateCcw },
  { key: "allow_hardware_telemetry", label: "Telemetría del hardware", icon: Cpu },
  { key: "allow_external_web_search", label: "Búsqueda web externa", icon: Globe },
  { key: "allow_cloud_sync", label: "Sincronización en la nube", icon: UploadCloud },
  { key: "allow_sensory_imagination", label: "Imaginación sensorial", icon: Sparkles },
  { key: "allow_persistent_logging", label: "Registro persistente", icon: Database },
  { key: "anonymize_network_ips", label: "Anonimizar IPs de red", icon: EyeOff },
];

function toneFor(state: PermState): string {
  if (state === "granted") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (state === "denied") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (state === "unsupported") return "border-white/15 bg-white/[0.04] text-white/55";
  if (state === "checking") return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
  return "border-amber-400/40 bg-amber-500/15 text-amber-100"; // prompt
}

function labelFor(state: PermState): string {
  switch (state) {
    case "granted": return "concedido";
    case "denied": return "denegado";
    case "unsupported": return "no soportado en este navegador";
    case "checking": return "comprobando…";
    default: return "pendiente";
  }
}

export function PrivacidadTab({ target }: S158TabProps) {
  const privacy = useS158Load(fetchAstraura158Privacy, target);
  const { busy, wrap } = useBusy();
  const [perms, setPerms] = useState<Record<SensorId, PermState>>({ geolocation: "checking", microphone: "checking", camera: "checking", storage: "checking" });
  const [permsApiSupported, setPermsApiSupported] = useState(true);
  const statusesRef = useRef<Partial<Record<"geolocation" | "microphone" | "camera", PermissionStatus>>>({});

  const inspect = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const hasPermissionsApi = "permissions" in navigator && typeof navigator.permissions?.query === "function";
    setPermsApiSupported(hasPermissionsApi);
    const next: Partial<Record<SensorId, PermState>> = {};

    if (hasPermissionsApi) {
      for (const name of ["geolocation", "microphone", "camera"] as const) {
        try {
          const status = await navigator.permissions.query({ name });
          statusesRef.current[name] = status;
          next[name] = status.state;
          status.onchange = () => { setPerms((p) => ({ ...p, [name]: status.state })); };
        } catch {
          // Safari/Firefox no reconocen 'microphone'/'camera' en PermissionDescriptor: lo decimos, no lo fingimos.
          next[name] = "unsupported";
        }
      }
    } else {
      next.geolocation = "unsupported";
      next.microphone = "unsupported";
      next.camera = "unsupported";
    }

    try {
      if (navigator.storage?.persisted) next.storage = (await navigator.storage.persisted()) ? "granted" : "prompt";
      else next.storage = "unsupported";
    } catch {
      next.storage = "unsupported";
    }

    setPerms((p) => ({ ...p, ...next }));
  }, []);

  useEffect(() => {
    void inspect();
    return () => {
      for (const status of Object.values(statusesRef.current)) if (status) status.onchange = null;
    };
  }, [inspect]);

  async function requestAccess(id: SensorId) {
    if (typeof navigator === "undefined") return;
    await wrap(`req:${id}`, async () => {
      if (id === "geolocation") {
        if (!navigator.geolocation) { toast.error("Este navegador no ofrece geolocalización."); return; }
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => { toast.success("Permiso de GPS concedido"); resolve(); },
            (err) => { toast.error(`GPS denegado o cancelado: ${err.message}`); resolve(); },
            { timeout: 10_000 },
          );
        });
      } else if (id === "microphone" || id === "camera") {
        if (!navigator.mediaDevices?.getUserMedia) { toast.error("Este navegador no ofrece acceso a micrófono/cámara desde la web."); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia(id === "microphone" ? { audio: true } : { video: true });
          // Soltar el stream de inmediato: solo comprobamos el permiso, nunca dejamos el indicador de grabación encendido.
          stream.getTracks().forEach((t) => t.stop());
          toast.success(id === "microphone" ? "Permiso de micrófono concedido" : "Permiso de cámara concedido");
        } catch (e) {
          toast.error(`${id === "microphone" ? "Micrófono" : "Cámara"} denegado o cancelado: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (id === "storage") {
        if (!navigator.storage?.persist) { toast.error("Este navegador no ofrece almacenamiento persistente."); return; }
        const ok = await navigator.storage.persist();
        if (ok) toast.success("Almacenamiento persistente activado");
        else toast.error("El navegador no concedió persistencia (puede depender de marcadores/uso frecuente).");
      }
      await inspect();
    });
  }

  const p = privacy.data;
  const settings = p?.settings ?? {};
  const airGapActive = p?.air_gap_active ?? settings.strict_air_gap_mode ?? false;
  const afterPrivacy = () => privacy.reload(true);

  function setToggle(key: keyof Astraura158PrivacySettings, value: boolean) {
    void wrap(`set:${key}`, () => runS158("Ajuste guardado", () => updateAstraura158Privacy(target, { ...settings, [key]: value }), { after: afterPrivacy }));
  }

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Shield} title="Permisos reales del navegador" tone="text-cyan-300"
          hint="Lo que ESTE navegador concede de verdad — Permissions API + getUserMedia + Storage API. Distinto de los ajustes del backend de abajo, que gobiernan lo que Astraura hace con esos datos una vez los tiene."
          right={<button type="button" className={BTN} onClick={() => { void inspect(); }} aria-label="Recomprobar permisos del navegador"><RefreshCw className="h-3 w-3" aria-hidden="true" /></button>} />
        {!permsApiSupported && (
          <p className="mt-2 text-[10px] leading-snug text-amber-200/85">
            Este navegador no expone la Permissions API completa (habitual en Safari/Firefox para micrófono/cámara): esos estados no pueden consultarse sin pedir el permiso directamente — usa «Solicitar acceso» para comprobarlo con el propio aviso nativo del navegador.
          </p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SENSORS.map((s) => {
            const state = perms[s.id];
            const Icon = s.icon;
            return (
              <div key={s.id} className={cn(SUB, "flex flex-col justify-between gap-2 px-3 py-2.5")}>
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/90"><Icon className="h-3.5 w-3.5 text-white/60" aria-hidden="true" /> {s.label}</span>
                    <Badge tone={toneFor(state)}>{labelFor(state)}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-white/50">{s.hint}</p>
                </div>
                {state !== "granted" && (
                  <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || state === "unsupported"} aria-label={`Solicitar acceso: ${s.label}`} onClick={() => { void requestAccess(s.id); }}>
                    <BusyIcon busy={busy === `req:${s.id}`} icon={Unlock} /> Solicitar acceso
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn(CARD, "p-3", airGapActive && "border-rose-400/30")}>
        <SectionTitle icon={airGapActive ? ShieldOff : Shield} title="Air-gap soberano" tone={airGapActive ? "text-rose-300" : "text-emerald-300"}
          hint="Corta web, nube y sensores externos: el backend razona solo con modelo y memoria locales." />
        {!p && <Empty loading={privacy.loading} error={privacy.error} text="Sin ajustes de privacidad del backend." />}
        {p && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-white/70">{airGapActive ? "Aislamiento total activo: sin web, nube ni sensores externos." : "Operación normal — sensores según los permisos de abajo."}</p>
            <button type="button" className={airGapActive ? BTN : BTN_PRIMARY} disabled={busy !== ""} aria-label={airGapActive ? "Desactivar air-gap" : "Activar air-gap"}
              onClick={() => { void wrap("airgap", () => runS158(airGapActive ? "Air-gap desactivado" : "Air-gap activado", () => toggleAstraura158AirGap(target, !airGapActive), { after: afterPrivacy })); }}>
              <BusyIcon busy={busy === "airgap"} icon={airGapActive ? ShieldOff : Lock} /> {airGapActive ? "Desactivar" : "Activar air-gap"}
            </button>
          </div>
        )}
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Database} title="Privacidad del backend soberano" tone="text-violet-300"
          hint="Qué datos puede tocar Astraura una vez tiene el permiso del navegador de arriba. Cambia al momento; no requiere recargar." />
        {!p && <Empty loading={privacy.loading} error={privacy.error} text="Sin conexión con el backend." />}
        {p && (
          <>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {PRIVACY_TOGGLES.map((t) => {
                const Icon = t.icon;
                return (
                  <label key={t.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px] text-white/80">
                    <span className="flex min-w-0 items-center gap-1.5 truncate"><Icon className="h-3 w-3 shrink-0 text-white/45" aria-hidden="true" /> {t.label}</span>
                    <Switch checked={settings[t.key] !== false} disabled={busy !== ""} aria-label={t.label} onCheckedChange={(v) => setToggle(t.key, v)} />
                  </label>
                );
              })}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Precisión de ubicación compartida">
                <select className={SELECT} value={settings.location_precision ?? "exact"} disabled={busy !== "" || settings.allow_gps_location === false} aria-label="Precisión de ubicación compartida"
                  onChange={(e) => { void wrap("set:location_precision", () => runS158("Precisión guardada", () => updateAstraura158Privacy(target, { ...settings, location_precision: e.target.value }), { after: afterPrivacy })); }}>
                  <option value="exact">Exacta</option>
                  <option value="city">Solo ciudad</option>
                  <option value="region">Solo región</option>
                </select>
              </Field>
              <Field label="Retención de datos (días)">
                <input className={INPUT} type="number" min={1} max={3650} value={settings.data_retention_days ?? ""} disabled={busy !== ""} aria-label="Días de retención de datos"
                  onChange={(e) => {
                    const v = clampInt(e.target.value, 1, 3650, 90);
                    void wrap("set:data_retention_days", () => runS158("Retención guardada", () => updateAstraura158Privacy(target, { ...settings, data_retention_days: v }), { after: afterPrivacy }));
                  }} />
              </Field>
            </div>
            {p.protected_sensors_count != null && <p className={cn(MONO, "mt-2")}>{p.protected_sensors_count} sensor(es) protegido(s) actualmente.</p>}
            {p.sovereign_guarantee && <p className="mt-1 text-[10px] leading-snug text-white/50">{p.sovereign_guarantee}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default PrivacidadTab;
