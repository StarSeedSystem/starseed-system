"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import { loadConfigs } from "@/ai/client/providerStore";
import type { ChatMessage } from "@/ai/providers/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ShieldCheck,
  Globe,
  Network,
  Server,
  Lock,
  KeyRound,
  Sparkles,
  RefreshCw,
  Save,
  Info,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Users,
  FileText,
  Megaphone,
  MessageSquare,
  Database,
  Wand2,
} from "lucide-react";
import {
  SECURITY_SCOPES,
  DNS_PROVIDERS,
  SECURITY_DEFAULTS,
  scopeById,
  dnsProviderById,
  normalizeConfig,
  recommend,
  explain,
  getSecurity,
  saveSecurity,
  vaultSecret,
  type SecurityConfig,
  type SecurityLevel,
  type DnsProviderId,
  type SecurityScopeDef,
} from "@/lib/security/security";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;
type ScopeTarget = { id: string; name: string };

const LEVELS: { id: SecurityLevel; label: string; blurb: string }[] = [
  { id: "básico", label: "Básico", blurb: "DNS cifrado (DoH), TLS y cifrado E2E de mensajes." },
  { id: "reforzado", label: "Reforzado", blurb: "Añade firewall, fail2ban y cifrado en reposo." },
  { id: "máximo", label: "Máximo", blurb: "Añade VPN WireGuard y superficie de puertos mínima." },
];

/** Icon per scope for the chips. */
function ScopeIcon({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "brain":
      return <Brain className={className} />;
    case "group":
      return <Users className={className} />;
    case "page":
      return <FileText className={className} />;
    case "file":
      return <FileText className={className} />;
    case "publication":
      return <Megaphone className={className} />;
    case "message":
      return <MessageSquare className={className} />;
    case "memory":
      return <Database className={className} />;
    default:
      return <ShieldCheck className={className} />;
  }
}

export default function SecurityPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<string>("account");
  const [scopeRef, setScopeRef] = useState("");
  const [scopeTargets, setScopeTargets] = useState<ScopeTarget[]>([]);

  const [config, setConfig] = useState<SecurityConfig>(normalizeConfig(SECURITY_DEFAULTS));
  const [auto, setAuto] = useState(true);
  const [exists, setExists] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // VPN config blob (stored in the sovereign vault, referenced by name)
  const [vpnBlob, setVpnBlob] = useState("");
  const [savingVault, setSavingVault] = useState(false);

  // Astraura
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const scopeDef: SecurityScopeDef | undefined = scopeById(scope);

  const hasProvider = useMemo(() => {
    try {
      return loadConfigs().some((c) => c.enabled);
    } catch {
      return false;
    }
  }, []);

  /* ------------------------------ load ------------------------------ */

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const sb = createClient();
      const { data: au } = await sb.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      const ref = scope === "account" ? null : scopeRef || null;
      const res = await getSecurity(scope, ref);
      setConfig(res.config);
      setAuto(res.auto);
      setExists(res.exists);
    } catch {
      /* */
    }
    setLoading(false);
  }, [scope, scopeRef]);

  useEffect(() => {
    load();
  }, [load]);

  // Load reference options (cerebro/grupo/página) from their tables.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!scopeDef?.needsRef || !scopeDef.table) {
        setScopeTargets([]);
        return;
      }
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        const uid = au?.user?.id;
        if (!uid) {
          if (alive) setScopeTargets([]);
          return;
        }
        const { data } = await sb
          .from(scopeDef.table)
          .select("id,name")
          .eq("owner", uid)
          .order("created_at", { ascending: true });
        if (!alive) return;
        const rows = ((data as { id: string; name?: string | null }[]) ?? []).map((r) => ({
          id: String(r.id),
          name: r.name && String(r.name).trim() ? String(r.name) : String(r.id),
        }));
        setScopeTargets(rows);
      } catch {
        if (alive) setScopeTargets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [scope, scopeDef?.needsRef, scopeDef?.table]);

  /* --------------------------- mutations --------------------------- */

  function patch(next: Partial<SecurityConfig>) {
    setConfig((prev) => normalizeConfig({ ...prev, ...next }));
  }
  function patchDns(next: Partial<SecurityConfig["dns"]>) {
    setConfig((prev) => normalizeConfig({ ...prev, dns: { ...prev.dns, ...next } }));
  }
  function patchVpn(next: Partial<SecurityConfig["vpn"]>) {
    setConfig((prev) => normalizeConfig({ ...prev, vpn: { ...prev.vpn, ...next } }));
  }
  function patchVps(next: Partial<SecurityConfig["vps"]>) {
    setConfig((prev) => normalizeConfig({ ...prev, vps: { ...prev.vps, ...next } }));
  }
  function patchEnc(next: Partial<SecurityConfig["encryption"]>) {
    setConfig((prev) => normalizeConfig({ ...prev, encryption: { ...prev.encryption, ...next } }));
  }

  function applyLevel(level: SecurityLevel) {
    if (auto) {
      // En "auto inteligente", el nivel reescribe la config con el preset endurecido.
      setConfig(recommend(level));
    } else {
      patch({ level });
    }
  }

  function toggleAuto(on: boolean) {
    setAuto(on);
    if (on) {
      // Al activar auto, aplica el preset del nivel actual.
      setConfig((prev) => recommend(prev.level));
    }
  }

  function setPortsFromText(text: string) {
    const ports = text
      .split(/[\s,]+/)
      .map((p) => parseInt(p, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 65535);
    patchVps({ allowedPorts: ports });
  }

  /* ------------------------------ save ------------------------------ */

  async function save() {
    if (!userId) {
      toast.error("Inicia sesión en StarSeed OS para guardar la seguridad.");
      return;
    }
    if (scopeDef?.needsRef && !scopeRef.trim()) {
      toast.error("Elige o indica el objetivo de este ámbito antes de guardar.");
      return;
    }
    setSaving(true);
    const ref = scope === "account" ? null : scopeRef.trim() || null;
    const ok = await saveSecurity(scope, ref, config, auto);
    setSaving(false);
    if (ok) {
      setExists(true);
      toast.success("Configuración de seguridad guardada para este ámbito.");
      setMsg({ kind: "ok", text: "Política guardada. El servidor del cerebro la leerá y aplicará." });
    } else {
      toast.error("No se pudo guardar la configuración.");
    }
  }

  /* ----------------------- VPN blob -> vault ----------------------- */

  async function saveVpnBlob() {
    if (!userId) {
      toast.error("Inicia sesión para guardar la configuración VPN en tu bóveda.");
      return;
    }
    const name = (config.vpn.configRef || "").trim();
    if (!name) {
      toast.error("Pon un nombre de referencia para la configuración VPN.");
      return;
    }
    if (!vpnBlob.trim()) {
      toast.error("Pega la configuración (WireGuard .conf / OpenVPN .ovpn).");
      return;
    }
    setSavingVault(true);
    const res = await vaultSecret(userId, "set", `vpn:${name}`, vpnBlob);
    setSavingVault(false);
    if (res.ok) {
      setVpnBlob("");
      toast.success("Configuración VPN cifrada y guardada en tu bóveda soberana.");
      setMsg({
        kind: "ok",
        text: `Config «${name}» guardada en la bóveda. El túnel se establece a nivel de dispositivo / servidor del cerebro.`,
      });
    } else {
      toast.error(res.error || "No se pudo guardar en la bóveda.");
    }
  }

  /* --------------------------- astraura --------------------------- */

  async function suggest() {
    if (!hasProvider) {
      toast.error("Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura sugiera.");
      return;
    }
    setSuggesting(true);
    setSuggestion("");
    try {
      const scopeLabel = scopeDef?.label ?? scope;
      const content = `Eres Astraura, guía de seguridad de StarSeed OS (filosofía open-source primero y soberanía del usuario).
Ámbito objetivo: ${scopeLabel}${scope !== "account" ? ` (ref: ${scopeRef || "sin especificar"})` : ""}.
Config actual: ${JSON.stringify(config)}.
Niveles disponibles: básico, reforzado, máximo. Proveedores DNS: Cloudflare (1.1.1.1), Quad9, NextDNS, personalizado (DoH). VPN: wireguard/openvpn/none. VPS: tlsOnly, allowedPorts, firewall, fail2ban. Cifrado: messagesE2E, atRest.
Recuerda la honestidad técnica: StarSeed guarda y aplica la política; el túnel VPN y la imposición de DNS ocurren a nivel de dispositivo / servidor del cerebro (no es una VPN de sistema por sí sola).
Propón en español, breve y accionable (máx. 6 líneas), la configuración de seguridad recomendada para este ámbito y por qué. Sugiere un nivel (básico/reforzado/máximo) y los ajustes clave de DNS, VPN, VPS y cifrado.`;
      const messages: ChatMessage[] = [{ role: "user", content }];
      const r = await chat({ messages, temperature: 0.5 });
      setSuggestion(r.text);
    } catch {
      toast.error("Astraura no pudo responder. Revisa tu proveedor de IA.");
      setSuggestion("");
    }
    setSuggesting(false);
  }

  /* ----------------------------- render ----------------------------- */

  const dnsDef = dnsProviderById(config.dns.provider);

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-emerald-50">Seguridad · DNS · VPN · VPS · Cifrado</span>
            <span className="text-[11px] text-emerald-300/70">
              Protocolos ajustables e inteligentes, globales por usuario y por ámbito · open-source primero
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("gap-1 border-white/15", auto ? "border-emerald-400/40 text-emerald-300" : "text-white/50")}
            >
              <Sparkles className="h-3 w-3" />
              {auto ? "Auto inteligente" : "Manual"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-emerald-500/30 text-emerald-100"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Recargar
            </Button>
          </div>
        </div>
      </div>

      {/* Honest note */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-950/15 px-3 py-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="text-[11px] leading-relaxed text-amber-100/85">
          <span className="font-semibold text-amber-200">Nota honesta.</span> StarSeed{" "}
          <b>guarda y aplica</b> esta política. El <b>túnel VPN</b> y la <b>imposición de DNS</b> ocurren a nivel del{" "}
          <b>dispositivo o del servidor del cerebro</b>, que lee esta configuración y la aplica. No es una VPN de
          sistema por sí sola: aquí defines la política y la referencia a tus credenciales (guardadas cifradas en tu
          bóveda soberana).
        </div>
      </div>

      {/* Scope selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-emerald-300/60">Ámbito</span>
        <div className="flex flex-wrap gap-1.5">
          {SECURITY_SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setScope(s.id);
                setScopeRef("");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                scope === s.id
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              <ScopeIcon id={s.id} className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </div>
        {scopeDef?.needsRef &&
          (scopeDef.table && scopeTargets.length > 0 ? (
            <select
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              className="h-8 w-56 rounded-md border border-white/15 bg-black/30 px-2 text-xs text-white"
            >
              <option value="">{`Elige ${scopeDef.label.toLowerCase()}…`}</option>
              {scopeTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={scopeRef}
              onChange={(e) => setScopeRef(e.target.value)}
              placeholder={scopeDef.refHint ?? "ID de referencia"}
              className="h-8 w-56 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          ))}
      </div>

      {/* Inheritance / fallback note */}
      <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
        {scope === "account" ? (
          <span>
            Estás editando la política <b>global</b> de tu cuenta. Es el valor por defecto que <b>heredan</b> todos los
            ámbitos que no tengan su propia configuración.
          </span>
        ) : (
          <span>
            Política <b>por ámbito</b>: <b>sobrescribe</b> la global de la cuenta para este {scopeDef?.label.toLowerCase()}.
            {exists ? " Hay una configuración específica guardada." : " Aún no hay una específica: se mostrará la base y, al guardar, anulará la global."}
          </span>
        )}
      </div>

      {/* Status message */}
      {msg && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            msg.kind === "ok" && "border-emerald-500/25 bg-emerald-950/20 text-emerald-200",
            msg.kind === "err" && "border-amber-500/25 bg-amber-950/20 text-amber-200",
            msg.kind === "info" && "border-cyan-500/25 bg-cyan-950/20 text-cyan-100",
          )}
        >
          {msg.kind === "err" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {!userId && !loading && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
          Inicia sesión en StarSeed OS para configurar y guardar tu seguridad. Tus credenciales se guardan cifradas en
          tu bóveda soberana.
        </div>
      )}

      {/* Level + Auto inteligente */}
      <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/10 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-emerald-300/60">
            <Sparkles className="h-3.5 w-3.5" /> Nivel & Auto inteligente
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs text-emerald-100/80">
            <Switch checked={auto} onCheckedChange={toggleAuto} />
            Auto inteligente (aplica preset endurecido del nivel y deja que Astraura lo refine)
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => applyLevel(l.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition",
                config.level === l.id
                  ? "border-emerald-400/50 bg-emerald-500/15"
                  : "border-white/10 bg-black/20 hover:border-white/25",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-50">
                <ShieldCheck className="h-4 w-4" /> {l.label}
              </div>
              <div className="mt-1 text-[11px] text-white/55">{l.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      {/* DNS */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <Globe className="h-3.5 w-3.5" /> DNS
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Proveedor</span>
            <select
              value={config.dns.provider}
              onChange={(e) => patchDns({ provider: e.target.value as DnsProviderId })}
              className="h-9 rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white"
            >
              {DNS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {dnsDef && <span className="text-[11px] text-white/40">{dnsDef.blurb}</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">DoH (DNS-over-HTTPS)</span>
            <div className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
              <Switch checked={config.dns.doh} onCheckedChange={(v) => patchDns({ doh: v })} />
              <span className="text-xs text-white/70">{config.dns.doh ? "Cifrado activado" : "Sin cifrar"}</span>
            </div>
          </label>
          {config.dns.provider === "custom" ? (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-white/50">URL DoH personalizada</span>
              <Input
                value={config.dns.url ?? ""}
                onChange={(e) => patchDns({ url: e.target.value })}
                placeholder="https://tu-resolutor/dns-query"
                spellCheck={false}
                className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
              />
            </label>
          ) : (
            dnsDef && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-white/50">Endpoint DoH</span>
                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60">
                  {dnsDef.doh}
                  {dnsDef.ips.length > 0 && <span className="ml-2 text-white/35">· IPs: {dnsDef.ips.join(", ")}</span>}
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* VPN */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-violet-300/60">
          <Network className="h-3.5 w-3.5" /> VPN
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Estado</span>
            <div className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
              <Switch
                checked={config.vpn.enabled}
                onCheckedChange={(v) =>
                  patchVpn({ enabled: v, type: v && config.vpn.type === "none" ? "wireguard" : config.vpn.type })
                }
              />
              <span className="text-xs text-white/70">{config.vpn.enabled ? "Activada" : "Desactivada"}</span>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Tipo</span>
            <select
              value={config.vpn.type}
              onChange={(e) => patchVpn({ type: e.target.value as SecurityConfig["vpn"]["type"] })}
              disabled={!config.vpn.enabled}
              className="h-9 rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white disabled:opacity-50"
            >
              <option value="none">Ninguna</option>
              <option value="wireguard">WireGuard (open-source)</option>
              <option value="openvpn">OpenVPN (open-source)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-white/50">Referencia de configuración (en tu bóveda)</span>
            <Input
              value={config.vpn.configRef ?? ""}
              onChange={(e) => patchVpn({ configRef: e.target.value })}
              placeholder="p. ej. casa-wg, oficina-ovpn"
              spellCheck={false}
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-xs text-white/50">
              Pega aquí tu config VPN (WireGuard .conf / OpenVPN .ovpn). Se cifra y guarda en tu bóveda soberana,
              referenciada por el nombre de arriba — nunca se guarda en la política.
            </span>
            <Textarea
              value={vpnBlob}
              onChange={(e) => setVpnBlob(e.target.value)}
              placeholder="[Interface]&#10;PrivateKey = ...&#10;Address = 10.0.0.2/32&#10;..."
              spellCheck={false}
              className="min-h-[96px] border-white/15 bg-black/30 font-mono text-xs text-white placeholder:text-white/25"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-violet-500/30 text-violet-100"
                onClick={saveVpnBlob}
                disabled={!userId || savingVault}
              >
                <KeyRound className="h-4 w-4" /> {savingVault ? "Guardando…" : "Guardar config en bóveda"}
              </Button>
              <span className="text-[11px] text-white/40">
                «Conectar» establece el túnel a nivel de dispositivo / servidor del cerebro usando esta referencia.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* VPS / Servidor */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-widest text-amber-300/60">
          <Server className="h-3.5 w-3.5" /> VPS / Servidor
        </div>
        <p className="mb-3 text-[11px] text-white/45">
          Estos ajustes los consume el servidor del cerebro para endurecer su exposición.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
            <Switch checked={config.vps.tlsOnly} onCheckedChange={(v) => patchVps({ tlsOnly: v })} />
            <span className="text-xs text-white/70">Sólo TLS (rechazar HTTP plano)</span>
          </label>
          <label className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
            <Switch checked={config.vps.firewall} onCheckedChange={(v) => patchVps({ firewall: v })} />
            <span className="text-xs text-white/70">Firewall (denegar por defecto)</span>
          </label>
          <label className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
            <Switch checked={config.vps.fail2ban} onCheckedChange={(v) => patchVps({ fail2ban: v })} />
            <span className="text-xs text-white/70">fail2ban (banear fuerza bruta)</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">Puertos permitidos</span>
            <Input
              value={config.vps.allowedPorts.join(", ")}
              onChange={(e) => setPortsFromText(e.target.value)}
              placeholder="443, 80"
              spellCheck={false}
              className="h-9 border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </label>
        </div>
      </section>

      {/* Cifrado */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-widest text-rose-300/60">
          <Lock className="h-3.5 w-3.5" /> Cifrado
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
            <Switch checked={config.encryption.messagesE2E} onCheckedChange={(v) => patchEnc({ messagesE2E: v })} />
            <span className="text-xs text-white/70">Mensajes E2E (extremo a extremo)</span>
          </label>
          <label className="flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/20 px-3">
            <Switch checked={config.encryption.atRest} onCheckedChange={(v) => patchEnc({ atRest: v })} />
            <span className="text-xs text-white/70">Cifrado en reposo (at-rest)</span>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-white/50">Referencia de clave (en tu bóveda, opcional)</span>
            <Input
              value={config.encryption.keyRef ?? ""}
              onChange={(e) => patchEnc({ keyRef: e.target.value })}
              placeholder="p. ej. clave-maestra-2026"
              spellCheck={false}
              className="border-white/15 bg-black/30 text-white placeholder:text-white/30"
            />
          </label>
        </div>
      </section>

      {/* Astraura */}
      <section className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-fuchsia-300/60">
            <Wand2 className="h-3.5 w-3.5" /> Astraura
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-2 border-fuchsia-500/30 text-fuchsia-100"
            onClick={suggest}
            disabled={suggesting}
          >
            <Sparkles className={cn("h-4 w-4", suggesting && "animate-pulse")} />
            {suggesting ? "Pensando…" : "Sugerir configuración segura"}
          </Button>
        </div>
        {!hasProvider && (
          <p className="text-[11px] text-fuchsia-100/60">
            Activa un proveedor de IA en Ajustes → IA & Modelos para que Astraura proponga ajustes para este ámbito.
          </p>
        )}
        {suggestion && (
          <div className="mt-1 whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-black/30 p-3 text-xs leading-relaxed text-fuchsia-50/90">
            {suggestion}
          </div>
        )}
        {/* Explicación legible de la config actual */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/65">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
          <span>{explain(config)}</span>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/40 p-3 backdrop-blur">
        <Badge variant="outline" className="gap-1 border-white/15 text-white/70">
          <ShieldCheck className="h-3 w-3" />
          {scope === "account" ? "Global · cuenta" : `${scopeDef?.label}${scopeRef ? `: ${scopeRef}` : ""}`}
        </Badge>
        <span className="text-[11px] text-white/45">
          Se guarda en <code className="text-white/60">security_settings</code> (por ámbito) y el servidor del cerebro lo aplica.
        </span>
        <Button
          className="ml-auto gap-2 bg-emerald-600 hover:bg-emerald-500"
          onClick={save}
          disabled={!userId || saving}
        >
          <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar seguridad"}
        </Button>
      </div>
    </div>
  );
}
