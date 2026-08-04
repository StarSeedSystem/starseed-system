"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — PANEL DE AJUSTES: notificaciones push (ntfy)
 * ---------------------------------------------------------------------------
 * Ajustes → Notificaciones. Activa/desactiva el puente ntfy, elige servidor
 * (público `ntfy.sh` o propio), muestra y permite copiar el tópico de CUENTA y
 * el de ESTA neurona (para suscribirse desde la app móvil de ntfy), acepta un
 * token opcional (servidores propios con auth), y dos interruptores finos
 * (publicar desde el navegador / espejar en el Centro de Notificaciones del
 * OS). Incluye un botón «Enviar prueba» y un aviso honesto sobre la privacidad
 * de `ntfy.sh` público. Toda la lógica vive en `@/lib/notifications/ntfy`;
 * este componente es solo la vista. SSR-safe y defensivo (nunca lanza).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import { RadioTower, Copy, Check, ShieldAlert, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getNtfySettings,
  setNtfySettings,
  subscribeNtfySettings,
  resolveNtfyTopics,
  testNtfy,
  type NtfySettings,
} from "@/lib/notifications/ntfy";

const NTFY_SH = "https://ntfy.sh";

interface TopicsState {
  accountTopic: string | null;
  deviceTopic: string | null;
}

export function NtfyPanel() {
  // `settings` arranca en null a propósito (mismo patrón que el resto del OS,
  // ver notifications-context.tsx): el primer render (SSR + hidratación) no
  // debe leer localStorage, o React marca un mismatch de hidratación. Los
  // datos reales llegan en el useEffect de abajo.
  const [settings, setSettingsState] = React.useState<NtfySettings | null>(null);
  const [topics, setTopics] = React.useState<TopicsState>({ accountTopic: null, deviceTopic: null });
  const [loadingTopics, setLoadingTopics] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [serverDraft, setServerDraft] = React.useState(NTFY_SH);
  const [tokenDraft, setTokenDraft] = React.useState("");
  const [copied, setCopied] = React.useState<"account" | "device" | null>(null);

  const load = React.useCallback(() => {
    try {
      const s = getNtfySettings();
      setSettingsState(s);
      setServerDraft(s.server);
      setTokenDraft(s.token || "");
    } catch { /* noop: se mantiene el último estado conocido */ }
  }, []);

  const loadTopics = React.useCallback(async () => {
    setLoadingTopics(true);
    try {
      const r = await resolveNtfyTopics();
      setTopics({ accountTopic: r.accountTopic, deviceTopic: r.deviceTopic });
    } catch {
      setTopics({ accountTopic: null, deviceTopic: null });
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    void loadTopics();
    return subscribeNtfySettings(load);
  }, [load, loadTopics]);

  const update = React.useCallback((patch: Partial<NtfySettings>) => {
    const next = setNtfySettings(patch);
    setSettingsState(next);
  }, []);

  const onToggleEnabled = React.useCallback((v: boolean) => {
    update({ enabled: v });
    if (v) void loadTopics();
  }, [update, loadTopics]);

  const onServerBlur = React.useCallback(() => {
    const trimmed = serverDraft.trim();
    if (!trimmed) {
      setServerDraft(settings?.server || NTFY_SH);
      return;
    }
    // Los tópicos son función de la cuenta/dispositivo, no del servidor: cambiar
    // de servidor no invalida `topics`, así que no hace falta re-derivarlos aquí.
    update({ server: trimmed });
  }, [serverDraft, settings, update]);

  const resetToPublicServer = React.useCallback(() => {
    setServerDraft(NTFY_SH);
    update({ server: NTFY_SH });
  }, [update]);

  const onTokenBlur = React.useCallback(() => {
    update({ token: tokenDraft.trim() || undefined });
  }, [tokenDraft, update]);

  const copy = React.useCallback(async (which: "account" | "device", value: string | null) => {
    if (!value) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        toast.success("Tópico copiado al portapapeles.");
      } else {
        toast.message("Tópico de ntfy", { description: value });
      }
    } catch {
      toast.message("Tópico de ntfy", { description: value });
    }
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  }, []);

  const onTest = React.useCallback(async () => {
    setTesting(true);
    try {
      const res = await testNtfy();
      if (res.ok) toast.success("Prueba enviada. Revisa tu móvil o el suscriptor que tengas abierto.");
      else toast.error(res.error || "No se pudo enviar la prueba.");
    } finally {
      setTesting(false);
    }
  }, []);

  if (!settings) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 backdrop-blur-xl space-y-4">
      {/* Cabecera */}
      <div className="flex items-start gap-2">
        <span className="p-2 rounded-xl border border-amber-400/20 bg-amber-400/10 shrink-0">
          <RadioTower className="w-4 h-4 text-amber-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white/90">Notificaciones push (ntfy)</h3>
            <Switch checked={settings.enabled} onCheckedChange={onToggleEnabled} aria-label="Activar ntfy" />
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Recibe avisos de StarSeed en tu móvil u otros dispositivos vía{" "}
            <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              ntfy
            </a>
            , un canal push abierto (FOSS) independiente del navegador.
          </p>
        </div>
      </div>

      {/* Servidor */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase text-muted-foreground">Servidor</label>
        <div className="flex items-center gap-2">
          <Input
            value={serverDraft}
            onChange={(e) => setServerDraft(e.target.value)}
            onBlur={onServerBlur}
            placeholder={NTFY_SH}
            className="h-9 text-[12px] font-mono bg-background/60 border-white/10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-[11px] text-white/60 hover:text-white cursor-pointer shrink-0"
            onClick={resetToPublicServer}
            title="Usar el servicio público ntfy.sh"
          >
            ntfy.sh
          </Button>
        </div>
        <p className="text-[10px] text-white/40 leading-snug">
          Usa el servicio público <code className="text-white/60">ntfy.sh</code> o tu propia instancia self-hosted
          (recomendado para avisos sensibles).
        </p>
      </div>

      {/* Tópicos de cuenta y de esta neurona */}
      <div className="space-y-2">
        <TopicRow
          label="Tópico de esta cuenta"
          hint="Suscríbete desde la app de ntfy en tu móvil para recibir TODOS los avisos de tu cuenta StarSeed."
          value={topics.accountTopic}
          loading={loadingTopics}
          copied={copied === "account"}
          onCopy={() => copy("account", topics.accountTopic)}
        />
        <TopicRow
          label="Tópico de este dispositivo"
          hint="Solo los avisos dirigidos a esta neurona concreta."
          value={topics.deviceTopic}
          loading={loadingTopics}
          copied={copied === "device"}
          onCopy={() => copy("device", topics.deviceTopic)}
        />
        {!loadingTopics && !topics.accountTopic && !topics.deviceTopic && (
          <p className="text-[10px] text-amber-300/80">
            Inicia sesión con tu cuenta StarSeed para derivar tus tópicos de ntfy.
          </p>
        )}
      </div>

      {/* Token opcional */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase text-muted-foreground">Token (opcional · solo servidores propios con auth)</label>
        <Input
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
          onBlur={onTokenBlur}
          placeholder="tk_..."
          type="password"
          autoComplete="off"
          className="h-9 text-[12px] font-mono bg-background/60 border-white/10"
        />
      </div>

      {/* Interruptores finos */}
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2 cursor-pointer rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
          <span className="text-[12px] text-white/80">Publicar desde este navegador</span>
          <Switch
            checked={settings.publishFromBrowser}
            onCheckedChange={(v) => update({ publishFromBrowser: v })}
            aria-label="Publicar desde el navegador"
          />
        </label>
        <label className="flex items-center justify-between gap-2 cursor-pointer rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
          <span className="text-[12px] text-white/80">Espejar en el Centro de Notificaciones del OS</span>
          <Switch
            checked={settings.mirrorToInApp}
            onCheckedChange={(v) => update({ mirrorToInApp: v })}
            aria-label="Espejar en el Centro de Notificaciones"
          />
        </label>
      </div>

      {/* Prueba */}
      <Button
        type="button"
        onClick={onTest}
        disabled={testing || !settings.enabled}
        variant="outline"
        size="sm"
        className="gap-1.5 text-[12px] cursor-pointer"
        title={settings.enabled ? "Enviar un aviso de prueba" : "Activa ntfy antes de probarlo"}
      >
        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {testing ? "Enviando…" : "Enviar prueba"}
      </Button>

      {/* Aviso honesto de privacidad */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2.5">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
        <p className="text-[10.5px] text-amber-100/70 leading-snug">
          <strong className="text-amber-200/90">Aviso honesto:</strong> el servicio público{" "}
          <code className="text-amber-100/90">ntfy.sh</code> guarda los mensajes en texto plano en su servidor
          durante un tiempo (caché) y sus registros incluyen el tópico y tu IP — no es privado. Para avisos
          sensibles (seguridad de cuenta, mensajes privados, votos…) usa un servidor propio (self-host) y evita poner
          datos sensibles en el título o el cuerpo del mensaje.
        </p>
      </div>
    </div>
  );
}

interface TopicRowProps {
  label: string;
  hint: string;
  value: string | null;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
}

function TopicRow({ label, hint, value, loading, copied, onCopy }: TopicRowProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] font-medium text-white/70">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 min-w-0 truncate text-[12px] text-sky-300/90 font-mono">
          {loading ? "derivando…" : value || "— sin sesión —"}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0 text-white/50 hover:text-white cursor-pointer"
          onClick={onCopy}
          disabled={!value}
          title="Copiar tópico"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <p className="text-[10px] text-white/40 leading-snug mt-1">{hint}</p>
    </div>
  );
}

export default NtfyPanel;
