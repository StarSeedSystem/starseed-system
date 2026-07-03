"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Cpu,
  Cloud,
  ExternalLink,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  Sparkles,
  RotateCw,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { OssLibraryBrowser } from "./oss-library-browser";
import { OllamaBrainPanel } from "@/components/agent/ollama-brain-panel";
import { FunctionModelsPanel } from "@/components/agent/function-models-panel";
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from "@/ai/providers";
import type { ProviderConfig } from "@/ai/providers/types";
import {
  encryptKey,
  decryptKey,
  hasPassphraseVerifier,
  setPassphraseVerifier,
  verifyPassphrase,
} from "@/ai/client/keyStorage";
import {
  loadConfigs,
  saveConfigs,
  getActiveProviderId,
  setActiveProviderId,
} from "@/ai/client/providerStore";

/**
 * Settings panel where the user manages every AI provider configured in their
 * Exocórtex. Privacy-first: keys live encrypted in their browser. The active
 * provider determines which model is used by default in the Agent chat.
 */
export function AiProvidersPanel() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [activeId, setActiveIdState] = useState<ProviderId | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphraseFlow, setShowPassphraseFlow] = useState(false);
  const [hasPp, setHasPp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setConfigs(loadConfigs());
    setActiveIdState(getActiveProviderId());
    setHasPp(hasPassphraseVerifier());
  }, []);

  function persist(next: ProviderConfig[]) {
    setConfigs(next);
    saveConfigs(next);
  }

  function setActive(id: ProviderId | null) {
    setActiveIdState(id);
    setActiveProviderId(id);
    toast.success(id ? `Proveedor activo: ${PROVIDERS[id].info.label}` : "Sin proveedor activo");
  }

  async function ensurePassphrase(): Promise<boolean> {
    if (hasPp) {
      const ok = await verifyPassphrase(passphrase);
      if (!ok) {
        toast.error("Frase de paso incorrecta");
        return false;
      }
      return true;
    }
    // First-time: set the verifier so subsequent saves are consistent.
    await setPassphraseVerifier(passphrase);
    setHasPp(true);
    toast.success("Frase de paso configurada");
    return true;
  }

  async function addProvider(id: ProviderId) {
    const info = PROVIDERS[id].info;
    const next: ProviderConfig = {
      id,
      label: info.label,
      baseUrl: info.defaultBaseUrl,
      encryptedKey: "",
      models: [...info.defaultModels],
      defaultModel: info.defaultModels[0],
      enabled: !info.requiresKey,
    };
    persist([...configs, next]);
    toast.success(`Proveedor añadido: ${info.label}`);
  }

  function removeProvider(idx: number) {
    const removed = configs[idx];
    const next = configs.filter((_, i) => i !== idx);
    persist(next);
    if (activeId === removed.id && !next.some((c) => c.id === removed.id)) setActive(null);
  }

  function updateProvider(idx: number, patch: Partial<ProviderConfig>) {
    persist(configs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function saveKey(idx: number, plaintextKey: string) {
    if (!plaintextKey.trim()) {
      updateProvider(idx, { encryptedKey: "" });
      return;
    }
    if (!(await ensurePassphrase())) return;
    setBusy(`save-${idx}`);
    try {
      const enc = await encryptKey(plaintextKey.trim(), passphrase);
      updateProvider(idx, { encryptedKey: enc });
      toast.success("Clave cifrada y guardada localmente");
    } catch (e) {
      toast.error(`Error al cifrar la clave: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function testConnection(idx: number) {
    const config = configs[idx];
    const provider = PROVIDERS[config.id];
    if (provider.info.requiresKey && !config.encryptedKey) {
      toast.error("Esta integración necesita una clave para probar.");
      return;
    }
    if (provider.info.requiresKey && !(await ensurePassphrase())) return;
    setBusy(`test-${idx}`);
    try {
      const apiKey = config.encryptedKey ? await decryptKey(config.encryptedKey, passphrase) : "";
      // Try a tiny chat as smoke test.
      const res = await provider.chat(
        { ...config, apiKey },
        [{ role: "user", content: "ping" }],
        { model: config.defaultModel, maxTokens: 8 }
      );
      updateProvider(idx, { lastVerifiedAt: Date.now() });
      toast.success(`Conexión OK con ${provider.info.label}: "${res.text.slice(0, 50)}..."`);
    } catch (e) {
      toast.error(`Test falló: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function refreshModels(idx: number) {
    const config = configs[idx];
    const provider = PROVIDERS[config.id];
    if (!provider.listModels) {
      toast.message("Este proveedor no expone listado de modelos.");
      return;
    }
    if (provider.info.requiresKey && !(await ensurePassphrase())) return;
    setBusy(`refresh-${idx}`);
    try {
      const apiKey = config.encryptedKey ? await decryptKey(config.encryptedKey, passphrase) : "";
      const models = await provider.listModels({ ...config, apiKey });
      updateProvider(idx, {
        models,
        defaultModel: models.includes(config.defaultModel) ? config.defaultModel : models[0] || "",
      });
      toast.success(`Actualizado: ${models.length} modelos detectados.`);
    } catch (e) {
      toast.error(`No se pudo refrescar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Aplica modelos detectados por el panel Ollama al proveedor Ollama del store:
   * fija su baseUrl y su lista de modelos (creándolo si no existe). Aditivo:
   * respeta el resto de configs.
   */
  function applyOllamaModels(baseUrl: string, models: string[]) {
    if (!models.length) {
      toast.message("No hay modelos que aplicar.");
      return;
    }
    const idx = configs.findIndex((c) => c.id === "ollama");
    if (idx >= 0) {
      const cur = configs[idx];
      updateProvider(idx, {
        baseUrl,
        models,
        defaultModel: models.includes(cur.defaultModel) ? cur.defaultModel : models[0],
        enabled: true,
      });
    } else {
      const info = PROVIDERS.ollama.info;
      persist([
        ...configs,
        {
          id: "ollama",
          label: info.label,
          baseUrl,
          encryptedKey: "",
          models,
          defaultModel: models[0],
          enabled: true,
        },
      ]);
    }
    toast.success(`Ollama: ${models.length} modelos aplicados al proveedor.`);
  }

  return (
    <div className="space-y-6">
      {/* Hero: principio rector */}
      <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-accent/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Tu Exocórtex es soberano
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Elige el motor de IA que prefieras: <strong>local con Ollama</strong> para máxima
            privacidad, o <strong>la API que tú quieras</strong> usando tu propia clave. Las claves
            se cifran en este navegador (AES-GCM, PBKDF2 250k iter) y <strong>nunca</strong> se
            envían a nuestros servidores. Puedes mezclar varios proveedores y activar uno como
            predeterminado.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Passphrase manager */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-amber-400" />
            Frase de paso del Exocórtex
          </CardTitle>
          <CardDescription>
            {hasPp
              ? "Ya tienes una frase configurada. Introdúcela cada vez que añadas o uses una clave."
              : "Opcional: define una frase para cifrar todas tus claves de API. Si la dejas vacía, se usará una clave derivada del dispositivo (menos segura pero más cómoda)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <Input
            type="password"
            placeholder="Introduce o crea tu frase de paso..."
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="bg-background/60 border-white/10 font-mono"
            onFocus={() => setShowPassphraseFlow(true)}
          />
          {showPassphraseFlow && (
            <Button
              variant="outline"
              onClick={async () => {
                if (await ensurePassphrase()) toast.success("Verificada");
              }}
              className="gap-2"
            >
              <ShieldCheck className="h-4 w-4" /> Verificar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Provider catalog */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-emerald-400" />
            Catálogo de proveedores
          </CardTitle>
          <CardDescription>Toca uno para añadirlo a tu colección.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDER_ORDER.map((id) => {
            const info = PROVIDERS[id].info;
            const Icon = info.local ? Cpu : info.id === "anthropic" ? Sparkles : Cloud;
            return (
              <button
                key={id}
                onClick={() => addProvider(id)}
                className="text-left rounded-lg border border-white/5 hover:border-primary/40 bg-black/20 hover:bg-primary/5 p-4 transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  {info.local ? (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/40">
                      Local
                    </Badge>
                  ) : info.requiresKey ? (
                    <Badge variant="outline" className="text-amber-300 border-amber-300/40">
                      BYO key
                    </Badge>
                  ) : null}
                </div>
                <p className="font-semibold text-sm">{info.label}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                  {info.description}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* User's configured providers */}
      <div className="space-y-3">
        <h3 className="text-sm uppercase font-medium tracking-wider text-muted-foreground flex items-center gap-2">
          <ServerCog className="h-4 w-4" />
          Mis proveedores ({configs.length})
        </h3>

        {configs.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aún no tienes proveedores. Añade uno del catálogo para empezar.
            </CardContent>
          </Card>
        )}

        {configs.map((c, idx) => {
          const info = PROVIDERS[c.id].info;
          const isActive = activeId === c.id;
          return (
            <Card
              key={`${c.id}-${idx}`}
              className={`bg-background/40 backdrop-blur-sm border ${
                isActive ? "border-primary/50 ring-1 ring-primary/30" : "border-white/5"
              }`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-base">{c.label}</CardTitle>
                    {isActive && (
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        Activo
                      </Badge>
                    )}
                    {info.local && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-400/40">
                        Local
                      </Badge>
                    )}
                    {c.encryptedKey && (
                      <Badge variant="outline" className="text-amber-300 border-amber-300/40 gap-1">
                        <Lock className="h-3 w-3" /> Cifrado
                      </Badge>
                    )}
                    {c.lastVerifiedAt && Date.now() - c.lastVerifiedAt < 86400_000 && (
                      <Badge variant="outline" className="text-emerald-400 border-emerald-400/40 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verificado
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">{info.description}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={(v) => updateProvider(idx, { enabled: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProvider(idx)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground">Etiqueta</label>
                    <Input
                      value={c.label}
                      onChange={(e) => updateProvider(idx, { label: e.target.value })}
                      className="bg-background/60 border-white/10"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground flex items-center justify-between">
                      <span>Base URL</span>
                      {info.local && c.id === "ollama" && (
                        <span className="text-emerald-400">
                          ¿Ollama corriendo en localhost?
                        </span>
                      )}
                    </label>
                    <Input
                      value={c.baseUrl}
                      onChange={(e) => updateProvider(idx, { baseUrl: e.target.value })}
                      className="bg-background/60 border-white/10 font-mono text-xs"
                      placeholder={info.defaultBaseUrl}
                    />
                  </div>
                </div>

                {info.requiresKey && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground flex items-center justify-between">
                      <span>API key {c.encryptedKey ? "(guardada cifrada)" : "(no guardada)"}</span>
                      {info.getKeyUrl && (
                        <a
                          href={info.getKeyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          Obtener clave <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder={
                          c.encryptedKey ? "•••• (introduce nueva para reemplazar)" : "Pega aquí tu API key"
                        }
                        className="bg-background/60 border-white/10 font-mono text-xs"
                        id={`key-${idx}`}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const el = document.getElementById(`key-${idx}`) as HTMLInputElement;
                          saveKey(idx, el.value);
                          el.value = "";
                        }}
                        disabled={busy === `save-${idx}`}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-muted-foreground">
                      Modelo por defecto
                    </label>
                    <Select
                      value={c.defaultModel}
                      onValueChange={(v) => updateProvider(idx, { defaultModel: v })}
                    >
                      <SelectTrigger className="bg-background/60 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {c.models.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => refreshModels(idx)}
                      disabled={busy === `refresh-${idx}`}
                      className="gap-2"
                    >
                      <RotateCw
                        className={`h-3 w-3 ${busy === `refresh-${idx}` ? "animate-spin" : ""}`}
                      />
                      Refrescar modelos
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testConnection(idx)}
                      disabled={busy === `test-${idx}`}
                      className="gap-2"
                    >
                      {busy === `test-${idx}` ? (
                        <RotateCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Probar conexión
                    </Button>
                    <Button
                      variant={isActive ? "secondary" : "default"}
                      onClick={() => setActive(isActive ? null : c.id)}
                      disabled={!c.enabled}
                    >
                      {isActive ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ollama completo: detectar / probar / local · remoto · cerebro */}
      <OllamaBrainPanel onApplyModels={applyOllamaModels} />

      {/* Modelos por función (imagen, vídeo, presentaciones, voz, sitios…) */}
      <FunctionModelsPanel />

      {/* Catálogo de código abierto: modelos, runtimes y frameworks */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Explora la librería de código abierto</CardTitle>
          <CardDescription>Modelos abiertos, runtimes locales y frameworks de agentes que puedes conectar como proveedor o motor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <OssLibraryBrowser category="llm" />
          <OssLibraryBrowser category="runtime" />
          <OssLibraryBrowser category="agent-framework" />
        </CardContent>
      </Card>

      {/* Footer: principios */}
      <Card className="bg-background/20 border-white/5">
        <CardContent className="pt-6 text-xs text-muted-foreground space-y-2">
          <p className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Las claves se cifran con AES-GCM y una clave derivada de tu frase con PBKDF2
              (250.000 iteraciones). Solo viven en tu navegador.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              StarSeed Network <strong>no</strong> recibe ni almacena tus claves ni tus
              conversaciones con la IA — todo ocurre directamente entre tu navegador y el
              proveedor que elijas.
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
