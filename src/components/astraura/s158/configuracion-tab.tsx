"use client";

/**
 * STUDIO 1.58 · Configuración & Preferencias (Ola 4 · Adenda 156) — centraliza
 * los ajustes del sistema 1.58 en el OS que hoy están repartidos o que aún no
 * tienen dueño en la UI: qué sistema va primero, dónde avisa la IA, cómo se
 * comporta el runtime de código embebido en el chat, el backend de ESTA
 * neurona y la limpieza de datos locales del propio 1.58.
 * ----------------------------------------------------------------------------
 * Arquitectura: `architecture/astraura-158-ola4-runtime-y-pestanas.md` §1.4, §2, §3.
 *
 * Reutiliza SIN reimplementar: `<PrimaryChoiceEditor>` (Adenda 153),
 * `<Astraura158NeuronCard>` (Ola 3) y `astraura-158-notify.ts` (Ola 4 · §2).
 * El runtime de código (`@/lib/aurora/code-runtime`) lo está escribiendo otro
 * agente EN PARALELO: mientras no exista, esta pestaña no inventa su forma —
 * enseña una tarjeta honesta y nada más (cero imports rotos, cero mentiras).
 *
 * Confirmación IN-APP (`useConfirm`, Adenda 137) antes de cualquier borrado;
 * nunca `window.confirm`. Todo defensivo y SSR-safe.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Bell, CheckCircle2, Code2, Cpu, Database, DownloadCloud, ExternalLink, RefreshCw, RotateCcw, ShieldCheck, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PrimaryChoiceEditor } from "@/components/astraura/primary-choice-editor";
import { Astraura158NeuronCard } from "@/components/neurons/astraura-158-neuron-card";
import { safeSet } from "@/lib/safe-storage";
import { getAstraura158NotifyMode, setAstraura158NotifyMode, type Astraura158NotifyMode } from "@/lib/astraura/astraura-158-notify";
import { ASTRAURA_158_SEEN_KEY } from "@/lib/astraura/astraura-158-feed";
import { ASTRAURA_158_SEED_KEY } from "@/lib/astraura/astraura-158-import";
import {
  DEFAULT_CODE_RUNTIME_PREFS, readCodeRuntimePrefs, writeCodeRuntimePrefs,
  type CodeRuntimePrefs, type CodeViewMode,
} from "@/lib/aurora/code-runtime";
import {
  checkAstraura158OsUpdates, fetchAstraura158OsStatus, installAstraura158OsUpdate, modifyAstraura158OsConfiguration,
  type Astraura158OsStatus, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, BusyIcon, CARD, Empty, Field, INPUT, LABEL, PILL, PILL_ON, PILL_OFF, SUB,
  SectionTitle, Stat, TEXTAREA, useBusy, useS158Load, type S158TabProps,
} from "./shared";

export function ConfiguracionTab({ target }: S158TabProps) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();
  // Mismo patrón que `notificaciones-tab.tsx`: las pestañas del Studio se
  // montan sin SSR (astraura-158-panel.tsx), así que leer la preferencia
  // directo en el estado inicial es seguro (sin desajuste de hidratación).
  const [notifyMode, setNotifyMode] = useState<Astraura158NotifyMode>(() => getAstraura158NotifyMode());
  const [runtime, setRuntime] = useState<CodeRuntimePrefs>(() => readCodeRuntimePrefs());

  function changeNotifyMode(mode: Astraura158NotifyMode) {
    setAstraura158NotifyMode(mode);
    setNotifyMode(mode);
  }

  async function clearSeenEvents() {
    const ok = await confirm({
      title: "¿Vaciar el conjunto «visto» de eventos?",
      description: "Olvida qué avisos de la IA ya leíste. Si el backend los repite (o tras recargar), volverán a contar como nuevos en Notificaciones & Logs. No borra nada en el backend soberano ni en tu Biblioteca.",
      confirmText: "Vaciar",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    await wrap("seen", async () => {
      // `safeSet` nunca lanza (degrada a memoria si el disco no admite escritura);
      // no hay un "falló" real que mostrar aquí, solo posible no-persistencia.
      try { safeSet(ASTRAURA_158_SEEN_KEY, "[]"); } catch { /* defensivo */ }
      toast.success("Conjunto «visto» vaciado", { description: "Los próximos avisos del backend volverán a contar como nuevos." });
    });
  }

  async function resetSeedMark() {
    const ok = await confirm({
      title: "¿Reiniciar la marca de siembra?",
      description: "Permite que el OS vuelva a sembrar personalidades y agentes automáticamente la próxima vez que vea un backend 1.58 vivo (como la primera vez). NO borra lo ya importado: para eso usa «Quitar lo importado» en Biblioteca StarSeed.",
      confirmText: "Reiniciar marca",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    await wrap("seed", async () => {
      try { safeSet(ASTRAURA_158_SEED_KEY, "0"); } catch { /* defensivo */ }
      toast.success("Marca de siembra reiniciada", { description: "El próximo backend 1.58 vivo volverá a sembrar automáticamente." });
    });
  }

  return (
    <div className="space-y-3">
      {/* Sistema primario ─ Adenda 153: reutiliza el editor tal cual, sin re-envolverlo en otra tarjeta. */}
      <div>
        <p className={cn(LABEL, "mb-1.5")}>Sistema primario de inteligencia</p>
        <PrimaryChoiceEditor scope="cuenta" scopeId="cuenta" context={{}} scopeLabel="toda la cuenta" />
      </div>

      {/* Notificaciones de la IA ─ Ola 4 §2: preferencia global "dónde avisa". */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Bell}
          title="Notificaciones de la IA"
          tone="text-amber-300"
          hint="Los avisos de la IA (imaginación, enjambre, director, autorizaciones…) tienen su propia pestaña. Por defecto solo viven ahí: nunca como toast ni mezclados con el resto del OS."
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={LABEL}>avisar en</span>
          <button
            type="button"
            className={cn(PILL, notifyMode === "tab" ? PILL_ON : PILL_OFF)}
            aria-pressed={notifyMode === "tab"}
            aria-label="Avisar solo en la pestaña de Notificaciones (nada de toasts ni el centro del OS)"
            onClick={() => changeNotifyMode("tab")}
          >
            Solo en su pestaña
          </button>
          <button
            type="button"
            className={cn(PILL, notifyMode === "tab+os" ? PILL_ON : PILL_OFF)}
            aria-pressed={notifyMode === "tab+os"}
            aria-label="Avisar también en el centro de notificaciones del OS (toasts incluidos)"
            onClick={() => changeNotifyMode("tab+os")}
          >
            También en el centro del OS
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-white/50">
          {notifyMode === "tab"
            ? "Solo te enteras entrando a Notificaciones & Logs (o por el badge de la sección Astraura IA)."
            : "Opt-in explícito: además de su pestaña, cada aviso también llega como toast y al centro de notificaciones del OS."}
        </p>
        <Link href="/agent?tab=astraura-158&sub=notificaciones" className={cn(BTN, "mt-2")} aria-label="Abrir Notificaciones & Logs del Studio 1.58">
          <ExternalLink className="h-3 w-3" aria-hidden="true" /> Abrir Notificaciones & Logs
        </Link>
      </div>

      {/* Runtime de código en el chat ─ Ola 4 §1.4: preferencias REALES del ejecutor. */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Code2}
          title="Runtime de código en el chat"
          tone="text-cyan-300"
          hint="Cómo se comportan los programas que la IA escribe en cualquier chat (orbe, Exocórtex, /agent). Cada bloque puede mandar sobre esto con sus propias directivas (```html run mode=split height=520)."
        />
        <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={runtime.autorun} aria-label="Ejecutar automáticamente los bloques ejecutables"
              onCheckedChange={(v) => setRuntime(writeCodeRuntimePrefs({ autorun: v }))} />
            ejecutar automáticamente <span className="text-white/45">(por defecto: no)</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={runtime.alwaysConsole} aria-label="Mostrar siempre la consola al ejecutar"
              onCheckedChange={(v) => setRuntime(writeCodeRuntimePrefs({ alwaysConsole: v }))} />
            mostrar siempre la consola
          </label>
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={runtime.allowCdn} aria-label="Permitir librerías desde CDNs permitidos"
              onCheckedChange={(v) => setRuntime(writeCodeRuntimePrefs({ allowCdn: v }))} />
            permitir CDNs <span className="text-white/45">(React/Babel para bloques JSX)</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch checked={runtime.allowBackend} aria-label="Ofrecer enviar código al backend soberano"
              onCheckedChange={(v) => setRuntime(writeCodeRuntimePrefs({ allowBackend: v }))} />
            ofrecer Python/shell en el backend soberano
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={LABEL}>modo por defecto</span>
            {(["vista", "codigo", "dividido", "consola"] as CodeViewMode[]).map((m) => (
              <button key={m} type="button" aria-pressed={runtime.mode === m} aria-label={`Modo por defecto: ${m}`}
                className={cn(BTN, "px-2 py-0.5", runtime.mode === m && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")}
                onClick={() => setRuntime(writeCodeRuntimePrefs({ mode: m }))}>{m}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={LABEL}>tamaño</span>
            {(["s", "m", "l"] as const).map((sz) => (
              <button key={sz} type="button" aria-pressed={runtime.size === sz} aria-label={`Tamaño por defecto: ${sz}`}
                className={cn(BTN, "px-2 py-0.5 uppercase", runtime.size === sz && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")}
                onClick={() => setRuntime(writeCodeRuntimePrefs({ size: sz }))}>{sz}</button>
            ))}
          </div>
          <button type="button" className={cn(BTN, "ml-auto")} aria-label="Restablecer las preferencias del runtime"
            onClick={() => setRuntime(writeCodeRuntimePrefs(DEFAULT_CODE_RUNTIME_PREFS))}>restablecer</button>
        </div>
        <p className="mt-2 text-[10px] leading-snug text-white/50">
          Los programas corren en un iframe aislado (sin acceso a tu sesión, almacenamiento ni al DOM del OS).
          Python y shell nunca se ejecutan en el navegador: se ofrecen en la Terminal &amp; Sandbox del backend soberano.
        </p>
      </div>

      {/* Backend de esta neurona ─ Ola 3: reutiliza la tarjeta tal cual, sin duplicar su lógica. */}
      <div>
        <p className={cn(LABEL, "mb-1.5")}>Backend de esta neurona</p>
        <Astraura158NeuronCard />
        <p className="mt-1.5 text-[10px] text-white/45">
          El Studio lee de «{target}» en el resto de pestañas; esta tarjeta gobierna el backend 1.58 propio de ESTA neurona en concreto (endpoint, motor, activarlo/desactivarlo como fuente local).
        </p>
      </div>

      {/* Sistema soberano ─ Ola 6 · Adenda 158: estado/versión, actualizaciones (con changelog)
          y auto-modificación con consentimiento explícito (checkbox de concesión obligatoria). */}
      <OsSovereignCard target={target} />

      {/* Datos y limpieza ─ acciones locales, honestas y reversibles solo por re-siembra/re-sondeo. */}
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Database} title="Datos y limpieza" tone="text-rose-300" hint="Ajustes guardados en ESTE navegador (localStorage); nada de esto toca al backend soberano ni a otras neuronas." />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[11px] font-medium text-white/85">Conjunto «visto» de eventos</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/55">Deduplica los avisos que el sondeo de la IA ya te mostró (clave <code className="rounded bg-black/30 px-1 py-0.5 font-code">{ASTRAURA_158_SEEN_KEY}</code>). Vaciarlo no borra avisos: hace que los que siga entregando el backend vuelvan a contar como nuevos.</p>
            <button type="button" className={cn(BTN_DANGER, "mt-2")} disabled={busy !== ""} aria-label="Vaciar el conjunto de eventos vistos de la IA" onClick={() => { void clearSeenEvents(); }}>
              <BusyIcon busy={busy === "seen"} icon={Trash2} /> Vaciar vistos
            </button>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
            <p className="text-[11px] font-medium text-white/85">Marca de siembra 1.58</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/55">Recuerda que ya se sembraron personalidades/agentes una vez (clave <code className="rounded bg-black/30 px-1 py-0.5 font-code">{ASTRAURA_158_SEED_KEY}</code>). Reiniciarla no quita nada importado: solo permite que la siembra automática vuelva a dispararse.</p>
            <button type="button" className={cn(BTN_DANGER, "mt-2")} disabled={busy !== ""} aria-label="Reiniciar la marca de siembra 1.58" onClick={() => { void resetSeedMark(); }}>
              <BusyIcon busy={busy === "seed"} icon={RotateCcw} /> Reiniciar marca
            </button>
          </div>
        </div>
        <Link href="/agent?tab=astraura-158&sub=biblioteca" className={cn(BTN, "mt-2")} aria-label="Abrir Biblioteca StarSeed para gestionar lo importado del backend 1.58">
          <Cpu className="h-3 w-3" aria-hidden="true" /> Gestionar lo importado en Biblioteca StarSeed
        </Link>
      </div>
    </div>
  );
}

/* ── Sistema soberano: estado/versión, actualizaciones y auto-modificación ─── */

function OsSovereignCard({ target }: { target: Astraura158Target }) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();
  const osStatus = useS158Load(fetchAstraura158OsStatus, target);
  const [channel, setChannel] = useState<"stable" | "beta">("stable");
  const [checkedStatus, setCheckedStatus] = useState<Astraura158OsStatus | null>(null);
  const [installLog, setInstallLog] = useState<string[] | null>(null);
  const [restartAfterInstall, setRestartAfterInstall] = useState(false);

  const eff = checkedStatus ?? osStatus.data;
  const changelog = checkedStatus?.changelog ?? osStatus.data?.changelog ?? [];
  const knownNoUpdate = checkedStatus != null && checkedStatus.update_available === false;

  async function checkUpdates() {
    await wrap("check", async () => {
      const res = await checkAstraura158OsUpdates(target, channel);
      if (res.ok) {
        setCheckedStatus(res.data);
        toast.success(res.data.update_available ? `Actualización disponible: ${res.data.latest_version ?? "?"}` : "El sistema ya está al día", {
          description: res.data.changelog?.length ? `${res.data.changelog.length} nota(s) de cambios` : undefined,
        });
      } else {
        toast.error(`No se pudo comprobar actualizaciones: ${res.error}`);
      }
    });
  }

  async function installUpdate() {
    const ok = await confirm({
      title: "¿Instalar la actualización del sistema soberano?",
      description: `Se instalará ${eff?.latest_version ? `la versión ${eff.latest_version}` : "la última versión disponible"} en el backend de ESTA neurona (no en el frontend de Vercel).${restartAfterInstall ? " El servicio se reiniciará al terminar." : " El servicio NO se reiniciará automáticamente: reinícialo tú cuando convenga."}`,
      confirmText: "Instalar", cancelText: "Cancelar",
    });
    if (!ok) return;
    await wrap("install", async () => {
      const res = await installAstraura158OsUpdate(target, { auto_restart: restartAfterInstall });
      if (res.ok) {
        setInstallLog(res.data.log ?? []);
        toast.success("Actualización instalada");
        setCheckedStatus(null);
        await osStatus.reload(true);
      } else {
        toast.error(`No se pudo instalar: ${res.error}`);
      }
    });
  }

  // Consentimiento explícito para auto-modificación: el textarea es la única fuente honesta de
  // "modificaciones propuestas" (no hay endpoint que las liste), se previsualizan y solo se
  // envían con `granted:true` tras marcar la casilla — nunca antes.
  const [modJson, setModJson] = useState("{\n  \n}");
  const [modReason, setModReason] = useState("");
  const [parsedMods, setParsedMods] = useState<Record<string, unknown> | null>(null);
  const [modParseError, setModParseError] = useState("");
  const [modGranted, setModGranted] = useState(false);
  const [appliedMods, setAppliedMods] = useState<string[] | null>(null);

  function previewMods() {
    try {
      const obj: unknown = JSON.parse(modJson);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("debe ser un objeto JSON de pares clave/valor, p. ej. {\"campo\": \"valor\"}");
      setParsedMods(obj as Record<string, unknown>);
      setModParseError("");
      setModGranted(false);
    } catch (e) {
      setParsedMods(null);
      setModParseError(e instanceof Error ? e.message : "JSON inválido");
    }
  }

  async function applyMods() {
    if (!parsedMods || !modGranted || Object.keys(parsedMods).length === 0) return;
    await wrap("apply-mods", async () => {
      const res = await modifyAstraura158OsConfiguration(target, {
        // El backend exige consentimiento explícito: sin `granted` rechaza la
        // modificación. El motivo escrito por el usuario viaja como parte de
        // las modificaciones, porque `/api/system/os/modify` no tiene campo propio.
        modifications: modReason.trim() ? { ...parsedMods, _reason: modReason.trim() } : parsedMods,
        granted: true,
      });
      if (res.ok) {
        setAppliedMods(res.data.applied ?? []);
        toast.success("Modificaciones aplicadas", { description: res.data.applied?.length ? `${res.data.applied.length} cambio(s)` : undefined });
        setParsedMods(null);
        setModGranted(false);
        setModJson("{\n  \n}");
      } else {
        toast.error(`No se aplicaron las modificaciones: ${res.error}`);
      }
    });
  }

  return (
    <>
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Cpu} title="Sistema soberano — estado y actualizaciones" tone="text-cyan-300"
          hint="Versión y canal del backend soberano de ESTA neurona (la máquina donde corre) — no del frontend en Vercel."
          right={<button type="button" className={BTN} onClick={() => { void osStatus.reload(); }} aria-label="Recargar estado del sistema soberano"><RefreshCw className={cn("h-3 w-3", osStatus.loading && "animate-spin")} aria-hidden="true" /></button>} />
        {!eff && <Empty loading={osStatus.loading} error={osStatus.error} text="Sin estado del sistema soberano." />}
        {eff && (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Versión" value={eff.version ?? "—"} />
              <Stat label="Canal actual" value={eff.channel ?? "—"} />
              <Stat label="Build" value={eff.build ?? "—"} />
              <Stat label="Actualización" value={eff.update_available ? `disponible${eff.latest_version ? ` (${eff.latest_version})` : ""}` : knownNoUpdate ? "al día" : "sin comprobar"} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={LABEL}>canal a comprobar</span>
              {(["stable", "beta"] as const).map((c) => (
                <button key={c} type="button" aria-pressed={channel === c} aria-label={`Canal ${c}`} className={cn(PILL, channel === c ? PILL_ON : PILL_OFF)} onClick={() => setChannel(c)}>{c}</button>
              ))}
              <button type="button" className={BTN} disabled={busy !== ""} aria-label="Buscar actualizaciones" onClick={() => { void checkUpdates(); }}>
                <BusyIcon busy={busy === "check"} icon={DownloadCloud} /> Buscar actualizaciones
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || knownNoUpdate} aria-label="Instalar actualización" onClick={() => { void installUpdate(); }}>
                <BusyIcon busy={busy === "install"} icon={CheckCircle2} /> Instalar actualización
              </button>
              <label className="flex items-center gap-1.5 text-[10px] text-white/70">
                <input type="checkbox" className="h-3 w-3 cursor-pointer accent-cyan-400" checked={restartAfterInstall} onChange={(e) => setRestartAfterInstall(e.target.checked)} aria-label="Reiniciar el servicio tras instalar" />
                reiniciar servicio al terminar
              </label>
            </div>
            {changelog.length > 0 && (
              <div className={cn(SUB, "mt-2 p-2.5")}>
                <p className="text-[10px] font-medium text-white/70">Changelog:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-white/70">
                  {changelog.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}
            {installLog && (
              <div className={cn(SUB, "mt-2 p-2.5")}>
                <p className="text-[10px] font-medium text-white/70">Log de instalación ({installLog.length} línea(s)):</p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-code text-[10px] text-cyan-100/80">{installLog.join("\n") || "(sin salida)"}</pre>
              </div>
            )}
          </>
        )}
        <p className="mt-2 text-[10px] leading-snug text-amber-200/80">Honesto: en el frontend desplegado en Vercel, «actualizar» no hace nada — esto gobierna el backend soberano de ESTA neurona, no el sitio web.</p>
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={ShieldCheck} title="Aplicar modificaciones al sistema" tone="text-rose-300" hint="El backend soberano puede proponer cambios de configuración; tú decides. Sin marcar la casilla de concesión no se envía nada." />
        <Field label="Modificaciones propuestas (JSON de pares clave/valor)">
          <textarea className={cn(TEXTAREA, "font-code")} rows={5} value={modJson} onChange={(e) => { setModJson(e.target.value); setParsedMods(null); setModGranted(false); }} aria-label="Modificaciones propuestas en JSON" />
        </Field>
        <Field label="Motivo (opcional)" className="mt-2">
          <input className={INPUT} value={modReason} onChange={(e) => setModReason(e.target.value)} aria-label="Motivo de la modificación" placeholder="p. ej. sugerido por el ciclo de imaginación #42" />
        </Field>
        <button type="button" className={cn(BTN, "mt-2")} aria-label="Previsualizar modificaciones propuestas" onClick={previewMods}>Previsualizar</button>
        {modParseError && <p className="mt-1.5 text-[10px] text-rose-200/85">{modParseError}</p>}
        {parsedMods && (
          <div className={cn(SUB, "mt-2 p-2.5")}>
            <p className="text-[10px] font-medium text-white/70">Se van a proponer estos cambios:</p>
            {Object.keys(parsedMods).length === 0 ? (
              <p className="mt-1 text-[10px] text-white/50">El objeto está vacío: no hay nada que conceder.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(parsedMods).map(([k, v]) => <li key={k} className="text-[10px] text-white/70"><span className="font-code text-cyan-200">{k}</span> → {JSON.stringify(v)}</li>)}
              </ul>
            )}
            <label className="mt-2 flex items-start gap-2 text-[11px] text-white/85">
              <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-rose-400" checked={modGranted} onChange={(e) => setModGranted(e.target.checked)} aria-label="Confirmo que reviso estas modificaciones y concedo autorización" />
              Confirmo que he revisado estas modificaciones y concedo autorización explícita para aplicarlas.
            </label>
            <button type="button" className={cn(BTN_DANGER, "mt-2")} disabled={busy !== "" || !modGranted || Object.keys(parsedMods).length === 0} aria-label="Enviar modificaciones con concesión" onClick={() => { void applyMods(); }}>
              <BusyIcon busy={busy === "apply-mods"} icon={ShieldCheck} /> Enviar con concesión
            </button>
          </div>
        )}
        {appliedMods && <p className="mt-2 text-[10px] text-emerald-200/80">Aplicado: {appliedMods.length ? appliedMods.join(", ") : "el backend no listó los cambios aplicados"}.</p>}
        <p className="mt-2 text-[10px] leading-snug text-white/45">Sin marcar la casilla, el botón de envío queda deshabilitado: nada se manda al backend sin tu concesión explícita.</p>
      </div>
    </>
  );
}

export default ConfiguracionTab;
