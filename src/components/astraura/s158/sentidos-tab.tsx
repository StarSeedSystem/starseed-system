"use client";

/**
 * STUDIO 1.58 · Sentidos — el sensorium del backend (tiempo, lugar, clima,
 * hardware, sensores del cliente, directiva conductual) y la privacidad
 * soberana: air-gap estricto (corta web/nube/sensores), permisos por sensor y
 * auditoría de accesos.
 */

import { useCallback, useState } from "react";
import { Compass, Eye, MapPin, RefreshCw, Shield, ShieldOff, Thermometer, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  fetchAstraura158Privacy, fetchAstraura158Sensorium, fetchAstraura158Weather, setAstraura158Location, toggleAstraura158AirGap, updateAstraura158Privacy,
  type Astraura158PrivacySettings,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, SELECT, SUB, SectionTitle, Stat, fmtAgo, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const PRIVACY_FLAGS: { key: keyof Astraura158PrivacySettings & string; label: string }[] = [
  { key: "allow_gps_location", label: "ubicación GPS" },
  { key: "allow_weather_sync", label: "clima" },
  { key: "allow_microphone_stream", label: "micrófono" },
  { key: "allow_camera_access", label: "cámara" },
  { key: "allow_compass_orientation", label: "brújula" },
  { key: "allow_gyroscope_motion", label: "giroscopio" },
  { key: "allow_hardware_telemetry", label: "telemetría del hardware" },
  { key: "allow_external_web_search", label: "búsqueda web externa" },
  { key: "allow_cloud_sync", label: "sincronización en la nube" },
  { key: "allow_sensory_imagination", label: "imaginación sensorial" },
  { key: "allow_persistent_logging", label: "registro persistente" },
  { key: "anonymize_network_ips", label: "anonimizar IPs" },
];

export function SentidosTab({ target }: S158TabProps) {
  const sens = useS158Load(fetchAstraura158Sensorium, target, 20_000);
  const priv = useS158Load(fetchAstraura158Privacy, target);
  const { busy, wrap } = useBusy();
  const [loc, setLoc] = useState({ city: "", latitude: "", longitude: "" });

  const reloadPriv = useCallback(async () => { await priv.reload(true); }, [priv]);
  const reloadSens = useCallback(async () => { await sens.reload(true); }, [sens]);

  const s = sens.data;
  const hw = s?.hardware;
  const p = priv.data;
  const settings = p?.settings ?? {};
  const airGap = !!(p?.air_gap_active ?? settings.strict_air_gap_mode);

  const setFlag = (key: string, label: string, v: boolean | string | number) =>
    wrap(`priv:${key}`, () => runS158(`Privacidad: ${label}`, () => updateAstraura158Privacy(target, { ...settings, [key]: v }), { after: reloadPriv }));

  return (
    <div className="space-y-3">
      {/* Air-gap */}
      <div className={cn(CARD, "p-3", airGap && "border-rose-400/30")}>
        <SectionTitle icon={airGap ? ShieldOff : Shield} title={`Privacidad soberana · air-gap ${airGap ? "ACTIVO" : "inactivo"}`} tone={airGap ? "text-rose-300" : "text-emerald-300"}
          hint={p?.sovereign_guarantee ?? "Con air-gap el backend no toca web, nube, túnel ni sensores externos: solo modelo local y memoria local."}
          right={<button type="button" className={airGap ? BTN : BTN_PRIMARY} disabled={busy !== "" || !p} aria-label={airGap ? "Desactivar air-gap" : "Activar air-gap"}
            onClick={() => { void wrap("airgap", () => runS158(airGap ? "Air-gap desactivado" : "Air-gap activado", () => toggleAstraura158AirGap(target, !airGap), { after: reloadPriv })); }}>
            <BusyIcon busy={busy === "airgap"} icon={airGap ? ShieldOff : Shield} /> {airGap ? "Desactivar" : "Activar air-gap"}
          </button>} />
        {!p && <Empty loading={priv.loading} error={priv.error} text="Sin ajustes de privacidad." />}
        {p && (
          <>
            <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {PRIVACY_FLAGS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-[11px] text-white/80">
                  <Switch checked={!!settings[f.key]} disabled={busy !== "" || airGap} aria-label={`Permitir ${f.label}`} onCheckedChange={(v) => { void setFlag(f.key, `${f.label} ${v ? "permitido" : "bloqueado"}`, v); }} />
                  {f.label}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Field label="Precisión de ubicación">
                <select className={SELECT} value={String(settings.location_precision ?? "city")} disabled={busy !== ""} aria-label="Precisión de ubicación" onChange={(e) => { void setFlag("location_precision", `precisión ${e.target.value}`, e.target.value); }}>
                  {["exact", "neighborhood", "city", "region", "country"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Retención (días)">
                <input type="number" min={1} max={3650} defaultValue={settings.data_retention_days ?? 30} className={cn(INPUT, "w-20")} disabled={busy !== ""} aria-label="Días de retención"
                  onBlur={(e) => { const v = Math.max(1, Math.min(3650, Number(e.target.value) || 30)); if (v !== settings.data_retention_days) void setFlag("data_retention_days", `retención ${v} días`, v); }} />
              </Field>
              <p className={cn(MONO, "ml-auto")}>{p.protected_sensors_count ?? 0} sensores protegidos</p>
            </div>
            {(p.audit_log ?? []).length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {(p.audit_log ?? []).slice(-6).reverse().map((l, i) => <li key={l.id ?? i} className="truncate text-[10px] text-white/55"><span className={MONO}>{fmtAgo(l.timestamp)}</span> · {l.event ?? l.action}{l.sensor_type ? ` · ${l.sensor_type}` : ""}{l.details ? ` — ${l.details}` : ""}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Sensorium */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Eye} title="Sensorium en vivo" tone="text-cyan-300" hint="Lo que el backend percibe ahora mismo del lugar, el clima y la máquina; con ello adapta su directiva de conducta."
          right={<button type="button" className={BTN} onClick={() => { void sens.reload(); }} aria-label="Recargar sensorium"><RefreshCw className={cn("h-3 w-3", sens.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!s && <Empty loading={sens.loading} error={sens.error} text="Sin sensorium." />}
        {s && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Hora del backend" value={s.time_formatted ?? s.timestamp ?? "—"} hint={s.location?.timezone} />
              <Stat label="Lugar" value={s.location?.city ?? "—"} hint={[s.location?.region, s.location?.country].filter(Boolean).join(", ") + (s.location?.source ? ` · ${s.location.source}` : "")} />
              <Stat label="Clima" value={s.weather?.temperature_c == null ? "—" : `${s.weather.temperature_c}°C`} hint={[s.weather?.condition, s.weather?.humidity_percent != null ? `${s.weather.humidity_percent}% hum.` : ""].filter(Boolean).join(" · ")} />
              <Stat label="Directiva" value={s.behavioral_directive?.mode ?? "—"} hint={s.behavioral_directive?.directive} />
            </div>
            {hw && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className={cn(SUB, "px-3 py-2")}><p className="flex items-center gap-1 text-[10px] text-white/55"><Cpu className="h-3 w-3" aria-hidden="true" /> CPU {hw.chipset ?? ""} · {hw.cpu_cores ?? "?"} núcleos</p><Bar value={hw.cpu_percent} /><p className={MONO}>{Math.round(hw.cpu_percent ?? 0)}%{hw.cpu_freq_mhz ? ` · ${Math.round(hw.cpu_freq_mhz)} MHz` : ""}</p></div>
                <div className={cn(SUB, "px-3 py-2")}><p className="text-[10px] text-white/55">RAM</p><Bar value={hw.ram_percent} tone="bg-violet-400/70" /><p className={MONO}>{(hw.ram_used_gb ?? 0).toFixed(1)} / {(hw.ram_total_gb ?? 0).toFixed(1)} GB</p></div>
                <div className={cn(SUB, "px-3 py-2")}><p className="text-[10px] text-white/55">Disco</p><Bar value={hw.disk_percent} tone="bg-amber-400/70" /><p className={MONO}>{(hw.disk_free_gb ?? 0).toFixed(0)} GB libres de {(hw.disk_total_gb ?? 0).toFixed(0)}</p></div>
                <div className={cn(SUB, "px-3 py-2")}><p className="text-[10px] text-white/55">Batería y red</p><Bar value={hw.battery?.percent} tone="bg-emerald-400/70" /><p className={MONO}>{hw.battery?.percent == null ? "sin batería" : `${hw.battery.percent}%${hw.battery.is_charging ? " cargando" : ""}`} · ↑{(hw.network?.bytes_sent_mb ?? 0).toFixed(0)} ↓{(hw.network?.bytes_recv_mb ?? 0).toFixed(0)} MB</p></div>
              </div>
            )}
            {s.client_sensors && Object.keys(s.client_sensors).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(s.client_sensors).slice(0, 12).map(([k, v]) => <Badge key={k} tone="border-white/10 text-white/60"><Compass className="h-2.5 w-2.5" aria-hidden="true" /> {k}: {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v)}</Badge>)}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Ciudad"><input className={INPUT} value={loc.city} onChange={(e) => setLoc({ ...loc, city: e.target.value })} aria-label="Ciudad" placeholder={s.location?.city ?? "Ciudad"} /></Field>
              <Field label="Latitud"><input className={cn(INPUT, "w-24")} value={loc.latitude} onChange={(e) => setLoc({ ...loc, latitude: e.target.value })} aria-label="Latitud" placeholder={String(s.location?.latitude ?? "")} /></Field>
              <Field label="Longitud"><input className={cn(INPUT, "w-24")} value={loc.longitude} onChange={(e) => setLoc({ ...loc, longitude: e.target.value })} aria-label="Longitud" placeholder={String(s.location?.longitude ?? "")} /></Field>
              <button type="button" className={BTN} disabled={busy !== "" || (!loc.city && !loc.latitude)} aria-label="Guardar ubicación"
                onClick={() => {
                  const lat = Number(loc.latitude); const lon = Number(loc.longitude);
                  void wrap("loc", () => runS158("Ubicación guardada", () => setAstraura158Location(target, { city: loc.city || undefined, latitude: Number.isFinite(lat) && loc.latitude ? lat : undefined, longitude: Number.isFinite(lon) && loc.longitude ? lon : undefined, source: "starseed-os" }), { after: reloadSens }));
                }}>
                <BusyIcon busy={busy === "loc"} icon={MapPin} /> Guardar ubicación
              </button>
              <button type="button" className={BTN} disabled={busy !== "" || airGap} aria-label="Actualizar clima"
                onClick={() => { void wrap("weather", () => runS158("Clima actualizado", () => fetchAstraura158Weather(target, s.location?.latitude, s.location?.longitude), { description: (d) => d.weather ? `${d.weather.temperature_c ?? "?"}°C · ${d.weather.condition ?? ""}` : d.message, after: reloadSens })); }}>
                <BusyIcon busy={busy === "weather"} icon={Thermometer} /> Actualizar clima
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SentidosTab;
