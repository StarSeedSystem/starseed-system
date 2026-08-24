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
  Bell, Code2, Cpu, Database, ExternalLink, RotateCcw, Trash2,
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
  BTN, BTN_DANGER, BusyIcon, CARD, LABEL, PILL, PILL_ON, PILL_OFF, SectionTitle, useBusy, type S158TabProps,
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

export default ConfiguracionTab;
