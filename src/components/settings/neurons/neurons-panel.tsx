"use client";

// ════════════════════════════════════════════════════════════════
// NeuronsPanel — "Neuronas (tus dispositivos)".
// Cada dispositivo que inicia sesión con la cuenta StarSeed es a la
// vez cerebro Y servidor de la red personal del usuario (su sistema
// nervioso). Este panel lista las neuronas, sus capacidades y sus
// 6 permisos (por defecto TODO activo y sincronizado), permite
// renombrarlas y quitarlas del registro.
// Defensivo y SSR-safe: carga en useEffect, nunca lanza; sin sesión
// degrada a "solo este dispositivo" con un aviso suave.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Network, RefreshCw, Monitor, Laptop, Smartphone, Tablet, Server, Cpu,
  Pencil, Check, Trash2, LogIn,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import {
  ensureThisNeuron, listNeurons, setPermission, setNeuronName, removeNeuron,
  summarizeNeurons, NEURON_EVENT,
  type Neuron, type NeuronCapabilities, type NeuronKind, type NeuronPermissions,
} from "@/lib/neurons/neurons";
// Seguridad integrada (Adenda 63 §13): este panel es el único componente
// montado en Ajustes → sección "Seguridad" (/cuenta, página congelada), así
// que el escáner de datos sensibles se ancla aquí — modo menos intrusivo.
import { SecurityScanPanel } from "@/components/security/security-scan-panel";
// Voz por neurona (Adenda 87): elección nube/local POR DISPOSITIVO + instalador.
import { NeuronVoiceChoice } from "@/components/settings/aurora/neuron-voice-choice";

/* ── Icono por tipo de dispositivo ── */
const KIND_ICONS: Record<NeuronKind, typeof Monitor> = {
  desktop: Monitor,
  laptop: Laptop,
  mobile: Smartphone,
  tablet: Tablet,
  server: Server,
  other: Cpu,
};

/* ── Los 6 permisos de cada neurona (predeterminado: todo activo) ── */
const PERMISSION_DEFS: { key: keyof NeuronPermissions; label: string; hint: string }[] = [
  { key: "compute", label: "Cómputo IA", hint: "Servir IA local al resto de neuronas" },
  { key: "storage", label: "Almacenamiento", hint: "Replicar y servir archivos/memorias" },
  { key: "sync", label: "Sincronización", hint: "Contexto y ajustes en vivo" },
  { key: "agent", label: "Agentes/terminal", hint: "Aceptar órdenes de agentes" },
  { key: "senses", label: "Sentidos", hint: "Mic/cámara/pantalla si se piden" },
  { key: "wake", label: "Despertar", hint: "Recibir avisos de otras neuronas" },
];

/** Capacidades del dispositivo como chips legibles. Nunca lanza. */
function capabilityChips(c: NeuronCapabilities | undefined): string[] {
  if (!c) return [];
  const chips: string[] = [];
  if (c.platform) chips.push(c.platform);
  if (c.browser) chips.push(c.browser);
  if (c.cores) chips.push(`${c.cores} núcleos`);
  if (c.memoryGb) chips.push(`${c.memoryGb} GB RAM`);
  if (c.webgpu) chips.push("WebGPU");
  if (c.chromeAi) chips.push("IA del navegador");
  if (c.ollama) chips.push("Ollama");
  if (c.lmstudio) chips.push("LM Studio");
  if (c.installedApp) chips.push("PWA instalada");
  if (c.battery?.level != null) chips.push(`Batería ${c.battery.level}%${c.battery.charging ? " (cargando)" : ""}`);
  if (c.storageQuotaGb) chips.push(`${c.storageUsedGb ?? 0}/${c.storageQuotaGb} GB`);
  return chips;
}

export function NeuronsPanel() {
  const [neurons, setNeurons] = useState<Neuron[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  /* ── Refresco: registra este dispositivo y lista todas las neuronas ── */
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await ensureThisNeuron();
      const list = await listNeurons();
      setNeurons(list);
    } catch { /* defensivo: nunca romper el panel */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    // ¿Hay sesión Supabase? (para el aviso suave; sin sesión solo se ve este dispositivo)
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (alive) setHasSession(!!data?.user);
      } catch {
        if (alive) setHasSession(false);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  /* ── Escucha NEURON_EVENT con un pequeño debounce (permisos/nombres) ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 500);
    };
    window.addEventListener(NEURON_EVENT, onEvent);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(NEURON_EVENT, onEvent);
    };
  }, [refresh]);

  /* ── Acciones ── */
  function togglePermission(n: Neuron, key: keyof NeuronPermissions, value: boolean) {
    // Optimista en UI; setPermission persiste local + remoto y emite NEURON_EVENT.
    setNeurons((prev) => prev.map((x) =>
      x.id === n.id ? { ...x, permissions: { ...x.permissions, [key]: value } } : x));
    try { setPermission(n.id, key, value); } catch { /* */ }
  }

  function startEdit(n: Neuron) {
    setEditingId(n.id);
    setDraftName(n.name);
  }

  function commitName(n: Neuron) {
    const name = draftName.trim();
    if (name && name !== n.name) {
      setNeurons((prev) => prev.map((x) => (x.id === n.id ? { ...x, name } : x)));
      try { setNeuronName(n.id, name); } catch { /* */ }
      toast.success("Nombre de la neurona actualizado");
    }
    setEditingId(null);
  }

  async function handleRemove(n: Neuron) {
    const ok = typeof window !== "undefined"
      ? window.confirm(`¿Quitar «${n.name}» de tu red de neuronas? (No borra nada en ese dispositivo.)`)
      : false;
    if (!ok) return;
    const done = await removeNeuron(n.id);
    if (done) {
      setNeurons((prev) => prev.filter((x) => x.id !== n.id));
      toast.success("Neurona eliminada del registro");
    } else {
      toast.error("No se pudo quitar la neurona");
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <Card className="bg-gradient-to-br from-[#39FF14]/10 via-background/40 to-primary/10 border-[#39FF14]/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-[#39FF14]" /> Neuronas (tus dispositivos)
              </CardTitle>
              <CardDescription className="leading-relaxed mt-1.5">
                Cada dispositivo con tu cuenta es a la vez <strong>cerebro y servidor</strong> de tu red personal:
                tu sistema nervioso digital. Por defecto todo está activo y sincronizado; aquí puedes ver,
                renombrar y ajustar los permisos de cada neurona.
              </CardDescription>
              <p className="text-[11px] text-muted-foreground mt-2">{summarizeNeurons(neurons)}</p>
            </div>
            <Button variant="ghost" size="sm" className="cursor-pointer shrink-0" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="sr-only">Refrescar neuronas</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Voz de ESTA neurona (Adenda 87): elección nube/local por dispositivo,
          que ordena la cadena de voz de este equipo, con el instalador local. */}
      <NeuronVoiceChoice />

      {/* Aviso suave: sin sesión solo se ve este dispositivo */}
      {hasSession === false && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200/90">
          <LogIn className="w-4 h-4 shrink-0" />
          Inicia sesión para ver todas tus neuronas: ahora solo se muestra este dispositivo.
        </div>
      )}

      {/* ── Tarjeta por neurona ── */}
      {loading && neurons.length === 0 && (
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardContent className="pt-6 text-xs text-muted-foreground">
            Detectando este dispositivo (capacidades, IA local, batería)…
          </CardContent>
        </Card>
      )}
      {neurons.map((n) => {
        const Icon = KIND_ICONS[n.kind] ?? Cpu;
        const chips = capabilityChips(n.capabilities);
        return (
          <Card
            key={n.id}
            className={`bg-background/40 backdrop-blur-sm ${n.isThisDevice ? "border-[#39FF14]/30 ring-1 ring-[#39FF14]/20" : ""}`}
          >
            <CardContent className="pt-5 space-y-3">
              {/* Cabecera: icono + nombre editable + estado */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-black/30 border border-white/10 shrink-0">
                  <Icon className="w-4 h-4 text-[#39FF14]" />
                </span>
                {editingId === n.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitName(n); if (e.key === "Escape") setEditingId(null); }}
                      className="h-8 bg-background/60 border-white/10 text-sm"
                      autoFocus
                      maxLength={60}
                    />
                    <Button variant="ghost" size="sm" className="cursor-pointer h-8 px-2" onClick={() => commitName(n)}>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="sr-only">Guardar nombre</span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-semibold truncate max-w-[240px]">{n.name}</span>
                    <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-1.5" onClick={() => startEdit(n)}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="sr-only">Renombrar neurona</span>
                    </Button>
                  </>
                )}
                {n.isThisDevice && (
                  <Badge className="bg-[#39FF14]/15 text-[#39FF14] border-[#39FF14]/30 text-[9px]">Este dispositivo</Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[9px] ${n.online ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1 ${n.online ? "bg-emerald-400" : "bg-zinc-500"}`} />
                  {n.online ? "Online" : "Offline"}
                </Badge>
                <div className="ml-auto">
                  {!n.isThisDevice && (
                    <Button variant="ghost" size="sm" className="cursor-pointer h-7 px-2 text-red-400/80 hover:text-red-300" onClick={() => void handleRemove(n)}>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="sr-only">Quitar neurona</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Capacidades como chips */}
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <Badge key={chip} variant="outline" className="text-[10px] bg-black/20 border-white/10 text-muted-foreground font-normal">
                      {chip}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Permisos (6 switches) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PERMISSION_DEFS.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug">{p.hint}</p>
                    </div>
                    <Switch
                      checked={n.permissions?.[p.key] ?? true}
                      onCheckedChange={(v) => togglePermission(n, p.key, v)}
                      aria-label={`${p.label} en ${n.name}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Seguridad integrada (Adenda 63 §13): escáner de secretos/PII bajo
          demanda. Vive en la sección "Seguridad" de Ajustes junto a las
          neuronas (cuenta/page.tsx solo monta este panel en esa sección). */}
      <SecurityScanPanel />
    </div>
  );
}
