"use client";

/**
 * STUDIO 1.58 · Bóveda soberana — equivalente de `SkillsVaultView.jsx` del
 * programa original: credenciales de los servicios externos que usa el
 * backend soberano (Vercel, GitHub, Supabase, Hugging Face y cualquier otro
 * que el propio backend declare) y los parámetros de inferencia/memoria del
 * motor BitNet b1.58.
 *
 * Seguridad — NO NEGOCIABLE:
 *   · El campo de token es `type="password"` con `autoComplete="off"`.
 *   · El token introducido nunca se pinta entero en pantalla: a diferencia
 *     del original (que traía un botón "mostrar/ocultar"), aquí NO hay
 *     revelado — es la única forma de garantizar que el valor jamás se
 *     renderiza en claro, ni siquiera momentáneamente.
 *   · Nunca se registra en consola (ni aquí ni en el cliente `astraura-158-client`).
 *   · El campo se vacía en cuanto el backend confirma el guardado (o si se
 *     cancela la edición).
 *   · Lo único que se muestra de una conexión ya guardada es el
 *     `masked_token` que el propio backend decide enmascarar — el OS nunca
 *     deriva ni reconstruye el valor real.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Database, ExternalLink, Key, Layers, Lock, Moon, RefreshCw, Save, ShieldCheck, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchAstraura158Vault, updateAstraura158VaultConnection, updateAstraura158VaultParameters,
  type Astraura158VaultConnection,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, INPUT, MONO, SUB, SectionTitle,
  fmtAgo, fmtTs, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

/** Valores locales de arranque cuando el backend aún no ha guardado ninguno (mismos que el original). */
interface VaultParamValues {
  bitnet_threads: number;
  bitnet_context_size: number;
  memory_cache_mb: number;
  dream_interval_minutes: number;
  /** Estructuralmente compatible con `Astraura158VaultParameters` (que trae `[k: string]: unknown`). */
  [k: string]: number;
}

const DEFAULT_PARAMS: VaultParamValues = {
  bitnet_threads: 8,
  bitnet_context_size: 2048,
  memory_cache_mb: 512,
  dream_interval_minutes: 15,
};

/**
 * Rango/paso de cada slider: los cuatro están tomados LITERALMENTE del
 * original (`SkillsVaultView.jsx`, atributos `min`/`max`/`step` de cada
 * `<input type="range">`) — ninguno es una elección nuestra.
 */
const PARAM_SLIDERS: { key: keyof VaultParamValues; label: string; min: number; max: number; step: number; unit: string; icon: LucideIcon; tone: string; accent: string }[] = [
  { key: "bitnet_threads", label: "Hilos de cálculo BitNet", min: 1, max: 16, step: 1, unit: "núcleos", icon: Cpu, tone: "text-cyan-300", accent: "accent-cyan-400" },
  { key: "bitnet_context_size", label: "Ventana de contexto", min: 512, max: 8192, step: 256, unit: "tokens", icon: Layers, tone: "text-violet-300", accent: "accent-violet-400" },
  { key: "memory_cache_mb", label: "Caché de memoria (L2)", min: 128, max: 2048, step: 128, unit: "MB", icon: Database, tone: "text-emerald-300", accent: "accent-emerald-400" },
  { key: "dream_interval_minutes", label: "Intervalo de sueño onírico", min: 5, max: 60, step: 5, unit: "min", icon: Moon, tone: "text-fuchsia-300", accent: "accent-fuchsia-400" },
];

function targetLabel(target: S158TabProps["target"]): string {
  return target === "nube" ? "el proxy en la nube del OS" : "el backend soberano de esta neurona";
}

function ConnectionCard({ conn, target, editingKey, setEditingKey, busy, wrap, afterSave }: {
  conn: Astraura158VaultConnection;
  target: S158TabProps["target"];
  editingKey: string | null;
  setEditingKey: (k: string | null) => void;
  /** Estado «ocupado» COMPARTIDO de toda la pestaña (mismo patrón que el resto de `s158/*`: una acción a la vez). */
  busy: string;
  wrap: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  afterSave: () => void | Promise<void>;
}) {
  const key = conn.service ?? conn.id ?? conn.name ?? "";
  const [token, setToken] = useState("");
  const editing = editingKey === key && key !== "";
  const saving = busy === `vaultconn:${key}`;
  // Campos que el backend puede añadir sin que el tipo estricto los declare
  // (índice `[k: string]: unknown` de `Astraura158VaultConnection`): se leen
  // de forma tolerante y SOLO se pintan si de verdad llegan.
  const extra = conn as Record<string, unknown>;
  const url = typeof extra.url === "string" ? extra.url : undefined;
  const account = typeof extra.account === "string" ? extra.account : undefined;
  const connected = conn.connected === true || conn.has_token === true || conn.status === "connected";

  const save = () => {
    const value = token.trim();
    if (!value || !key) return;
    void wrap(`vaultconn:${key}`, async () => {
      const ok = await runS158(`${conn.name ?? key}: token guardado`, () => updateAstraura158VaultConnection(target, key, value), { after: afterSave });
      // Se vacía SIEMPRE (éxito o error): el valor tecleado no debe quedar
      // colgando en el estado del componente más de lo imprescindible.
      setToken("");
      if (ok) setEditingKey(null);
    });
  };

  return (
    <div className={cn(SUB, "flex flex-col gap-2 px-3 py-2.5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/90">{conn.name ?? conn.service ?? conn.id ?? "servicio"}</p>
          {account && <p className="truncate text-[10px] text-white/45">{account}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={connected ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-amber-400/40 bg-amber-500/15 text-amber-100"}>
            {connected ? "conectado" : "disponible"}
          </Badge>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="cursor-pointer text-white/40 hover:text-cyan-200" aria-label={`Abrir ${conn.name ?? key} en una pestaña nueva`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <p className={MONO}>
        {conn.masked_token ? `token ${conn.masked_token}` : conn.has_token ? "token guardado (oculto)" : "sin token guardado"}
        {conn.updated_at ? ` · actualizado ${fmtTs(conn.updated_at)}` : ""}
      </p>
      {(conn.scopes ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">{(conn.scopes ?? []).map((s) => <Badge key={s} tone="border-white/10 text-white/55">{s}</Badge>)}</div>
      )}

      {!editing ? (
        <button type="button" className={cn(BTN, "self-start")} disabled={!key || busy !== ""} aria-label={`${conn.has_token || connected ? "Actualizar" : "Configurar"} token de ${conn.name ?? key}`}
          onClick={() => { setEditingKey(key); setToken(""); }}>
          <Lock className="h-3 w-3" aria-hidden="true" /> {conn.has_token || connected ? "Actualizar token" : "Configurar token"}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-md border border-cyan-400/20 bg-cyan-500/[0.04] p-2">
          <Field label={`Nuevo token de ${conn.name ?? key}`}>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega aquí el token…"
              className={INPUT}
              aria-label={`Nuevo token de ${conn.name ?? key}`}
            />
          </Field>
          <p className="text-[10px] leading-snug text-white/45">Este token viaja directamente a {targetLabel(target)}; el OS no lo conserva ni vuelve a mostrarlo — solo verás el valor enmascarado que el backend decida devolver.</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" className={BTN} disabled={busy !== ""} aria-label="Cancelar edición del token" onClick={() => { setEditingKey(null); setToken(""); }}>Cancelar</button>
            <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || !token.trim()} aria-label={`Guardar token de ${conn.name ?? key}`} onClick={save}>
              <BusyIcon busy={saving} icon={ShieldCheck} /> Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BovedaTab({ target }: S158TabProps) {
  const vault = useS158Load(fetchAstraura158Vault, target);
  const { busy, wrap } = useBusy();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [params, setParams] = useState<VaultParamValues>(DEFAULT_PARAMS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const initialized = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza el estado local con lo que devuelva el backend, pero SOLO una
  // vez (al primer dato real): si volviéramos a copiar en cada recarga
  // pisaríamos lo que el usuario esté ajustando en ese momento.
  useEffect(() => {
    if (!initialized.current && vault.data?.parameters) {
      const p = vault.data.parameters;
      setParams({
        bitnet_threads: p.bitnet_threads ?? DEFAULT_PARAMS.bitnet_threads,
        bitnet_context_size: p.bitnet_context_size ?? DEFAULT_PARAMS.bitnet_context_size,
        memory_cache_mb: p.memory_cache_mb ?? DEFAULT_PARAMS.memory_cache_mb,
        dream_interval_minutes: p.dream_interval_minutes ?? DEFAULT_PARAMS.dream_interval_minutes,
      });
      initialized.current = true;
    }
  }, [vault.data]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  /** Guardado silencioso (autoguardado por debounce): solo avisa si falla — el éxito se refleja en el sello de tiempo. */
  const persistSilently = useCallback(async (next: VaultParamValues) => {
    setAutoSaving(true);
    const r = await updateAstraura158VaultParameters(target, next);
    setAutoSaving(false);
    if (r.ok) setSavedAt(Date.now());
    else toast.error(`Parámetros de inferencia: ${r.error}`);
  }, [target]);

  const setParam = (key: keyof VaultParamValues, value: number) => {
    const next = { ...params, [key]: value };
    setParams(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void persistSilently(next); }, 500);
  };

  const saveNow = () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    void wrap("params", () => runS158("Parámetros de inferencia guardados", () => updateAstraura158VaultParameters(target, params), { after: () => setSavedAt(Date.now()) }));
  };

  const connections = vault.data?.connections ?? [];
  const hasBackendParams = !!vault.data?.parameters;

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Key} title={`Conexiones de servicio (${connections.length})`} tone="text-cyan-300"
          hint="Credenciales que usa el backend soberano de esta neurona para hablar con Vercel, GitHub, Supabase, Hugging Face y cualquier otro servicio que declare — almacenamiento cifrado en el propio backend."
          right={<button type="button" className={BTN} onClick={() => { void vault.reload(); }} aria-label="Recargar bóveda"><RefreshCw className={cn("h-3 w-3", vault.loading && "animate-spin")} aria-hidden="true" /></button>} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {connections.length === 0 && <Empty loading={vault.loading} error={vault.error} text="El backend no declara conexiones de servicio." />}
          {connections.map((c, i) => (
            <ConnectionCard key={c.service ?? c.id ?? c.name ?? i} conn={c} target={target} editingKey={editingKey} setEditingKey={setEditingKey} busy={busy} wrap={wrap} afterSave={() => vault.reload(true)} />
          ))}
        </div>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Cpu} title="Parámetros de inferencia y memoria" tone="text-violet-300"
          hint="Ajustan el motor BitNet b1.58 nativo de esta neurona. Se guardan solos 500 ms después de soltar el mando; el botón de abajo fuerza el guardado al instante."
          right={
            <span className={cn(MONO, "flex items-center gap-1")}>
              {autoSaving ? <BusyIcon busy icon={Save} /> : savedAt ? <Save className="h-3 w-3 text-emerald-300/80" aria-hidden="true" /> : null}
              {autoSaving ? "guardando…" : savedAt ? `guardado ${fmtAgo(savedAt)}` : ""}
            </span>
          } />
        {!hasBackendParams && !vault.loading && (
          <p className="mt-1 text-[10px] text-amber-200/80">{vault.error ? `Sin conexión con el backend: ${vault.error}.` : "El backend todavía no ha devuelto parámetros guardados: se muestran valores por defecto del panel."}</p>
        )}
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {PARAM_SLIDERS.map((s) => {
            const Icon = s.icon;
            const value = params[s.key];
            return (
              <div key={s.key} className={cn(SUB, "space-y-1.5 px-3 py-2.5")}>
                <Field label={s.label}>
                  <div className="flex items-center justify-between text-[11px]">
                    <Icon className={cn("h-3.5 w-3.5", s.tone)} aria-hidden="true" />
                    <span className={cn("font-semibold", s.tone)}>{value} {s.unit}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={value}
                    className={cn("w-full cursor-pointer", s.accent)}
                    aria-label={s.label}
                    aria-valuetext={`${value} ${s.unit}`}
                    onChange={(e) => setParam(s.key, Number(e.target.value))}
                  />
                </Field>
              </div>
            );
          })}
        </div>
        <button type="button" className={cn(BTN_PRIMARY, "mt-3")} disabled={busy !== ""} aria-label="Guardar parámetros de inferencia ahora" onClick={saveNow}>
          <BusyIcon busy={busy === "params"} icon={Save} /> Guardar parámetros
        </button>
      </div>
    </div>
  );
}

export default BovedaTab;
