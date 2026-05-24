"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Download,
  Upload,
  Eye,
  EyeOff,
  AlertTriangle,
  FileLock2,
  Globe,
  HardDrive,
  Trash2,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  exportProviderConfig,
  importProviderConfig,
  wipeProviderStore,
} from "@/ai/client/providerStore";
import { wipeAllKeyMaterial, hasPassphraseVerifier } from "@/ai/client/keyStorage";

const TELEMETRY_KEY = "starseed.privacy.telemetry"; // off by default
const GHOST_KEY = "starseed.privacy.ghost"; // ghost mode

/**
 * Panel de soberanía de datos. Inspirado en la Constitución (Art. 7 — Soberanía
 * de datos): el usuario es el único dueño de su huella digital. Aquí ve qué se
 * guarda, dónde, y puede exportar/borrar todo en un clic.
 */
export function PrivacyPanel() {
  const [telemetry, setTelemetry] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [hasPp, setHasPp] = useState(false);
  const [storageBreakdown, setStorageBreakdown] = useState<{ key: string; size: number }[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTelemetry(window.localStorage.getItem(TELEMETRY_KEY) === "1");
    setGhost(window.localStorage.getItem(GHOST_KEY) === "1");
    setHasPp(hasPassphraseVerifier());
    refreshStorage();
  }, []);

  function refreshStorage() {
    if (typeof window === "undefined") return;
    const breakdown: { key: string; size: number }[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (!k.startsWith("starseed.")) continue;
      const v = window.localStorage.getItem(k) ?? "";
      breakdown.push({ key: k, size: v.length });
    }
    breakdown.sort((a, b) => b.size - a.size);
    setStorageBreakdown(breakdown);
  }

  function toggleTelemetry(v: boolean) {
    setTelemetry(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(TELEMETRY_KEY, "1");
      else window.localStorage.removeItem(TELEMETRY_KEY);
    }
    toast.success(v ? "Telemetría anónima activada" : "Telemetría desactivada");
  }

  function toggleGhost(v: boolean) {
    setGhost(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(GHOST_KEY, "1");
      else window.localStorage.removeItem(GHOST_KEY);
    }
    toast.success(v ? "Modo Fantasma activo: tu actividad pública queda oculta" : "Modo Fantasma desactivado");
  }

  function handleExportAi() {
    const blob = new Blob([exportProviderConfig()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `starseed-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exportación descargada");
  }

  function handleExportAllLocal() {
    if (typeof window === "undefined") return;
    const dump: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (k.startsWith("starseed.")) dump[k] = window.localStorage.getItem(k) ?? "";
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `starseed-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Datos locales exportados");
  }

  function handleImportAi(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importProviderConfig(String(reader.result));
        toast.success("Configuración de IA importada");
        refreshStorage();
      } catch (e) {
        toast.error(`Import falló: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  function handleWipeAi() {
    if (!confirm("¿Borrar TODA la configuración de IA y las claves cifradas? Esta acción no se puede deshacer.")) return;
    wipeProviderStore();
    wipeAllKeyMaterial();
    setHasPp(false);
    refreshStorage();
    toast.success("Material criptográfico de IA borrado");
  }

  function handleWipeAll() {
    if (!confirm("¿Borrar TODO el almacenamiento local de StarSeed (configuración, IA, preferencias)? No se podrá recuperar.")) return;
    if (typeof window === "undefined") return;
    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)!;
      if (k.startsWith("starseed.")) toDelete.push(k);
    }
    toDelete.forEach(k => window.localStorage.removeItem(k));
    refreshStorage();
    toast.success("Todo el almacenamiento local de StarSeed ha sido borrado");
  }

  const totalSize = storageBreakdown.reduce((s, x) => s + x.size, 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="bg-gradient-to-br from-emerald-500/10 via-background/40 to-primary/10 border-emerald-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Tu huella digital es tuya
          </CardTitle>
          <CardDescription className="leading-relaxed">
            El Art. 7 de la Constitución StarSeed establece que cada ciudadano es el
            único dueño de sus datos. Aquí puedes <strong>ver</strong> exactamente qué
            se guarda en tu navegador, <strong>exportarlo</strong> en cualquier momento,
            y <strong>borrarlo</strong> con un clic. Nada de lo que ves aquí abajo se
            envía a nuestros servidores.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Toggles principales */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                {ghost ? <EyeOff className="h-4 w-4 text-purple-400" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                Modo Fantasma
              </span>
              <Switch checked={ghost} onCheckedChange={toggleGhost} />
            </CardTitle>
            <CardDescription>
              Oculta tu actividad del grafo público federado (ActivityPub). Sigues pudiendo votar
              y participar; otros usuarios no ven tu rastro.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="bg-background/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                Telemetría anónima
              </span>
              <Switch checked={telemetry} onCheckedChange={toggleTelemetry} />
            </CardTitle>
            <CardDescription>
              Desactivado por defecto. Si la activas, contribuyes con métricas agregadas (sin
              identificadores personales) para mejorar el sistema. Puedes desactivarla en
              cualquier momento.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* IA / Exocórtex */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Datos del Exocórtex (IA)
          </CardTitle>
          <CardDescription>
            Las claves de tus proveedores y la configuración de IA. Todo cifrado en este equipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-emerald-400 border-emerald-400/40">
              <KeyRound className="h-3 w-3" /> {hasPp ? "Frase de paso configurada" : "Sin frase de paso (cifrado por dispositivo)"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <FileLock2 className="h-3 w-3" /> AES-GCM 256 · PBKDF2 250k iter
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportAi} className="gap-2">
              <Download className="h-4 w-4" /> Exportar configuración IA
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImportAi(e.target.files[0])}
              />
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-accent text-sm">
                <Upload className="h-4 w-4" /> Importar configuración IA
              </span>
            </label>
            <Button variant="destructive" onClick={handleWipeAi} className="gap-2">
              <Trash2 className="h-4 w-4" /> Borrar claves IA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lo que se almacena */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-amber-400" />
              Qué guardamos en este navegador
            </CardTitle>
            <CardDescription>
              {storageBreakdown.length} entradas locales · ~{(totalSize / 1024).toFixed(1)} KB en total
            </CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={refreshStorage}>Refrescar</Button>
        </CardHeader>
        <CardContent>
          {storageBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay datos locales todavía.</p>
          ) : (
            <div className="space-y-1.5 text-xs font-mono max-h-64 overflow-y-auto pr-2">
              {storageBreakdown.map(({ key, size }) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-2 py-1.5 rounded bg-black/20 border border-white/5"
                >
                  <span className="truncate">{key}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {(size / 1024).toFixed(2)} KB
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones globales */}
      <Card className="bg-background/40 backdrop-blur-sm border-rose-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            Borrado total
          </CardTitle>
          <CardDescription>
            Exporta primero si quieres conservar tu configuración. Esto borra TODO el
            almacenamiento local de StarSeed en este equipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportAllLocal} className="gap-2">
            <Download className="h-4 w-4" /> Exportar todo lo local
          </Button>
          <Button variant="destructive" onClick={handleWipeAll} className="gap-2">
            <Trash2 className="h-4 w-4" /> Borrar todo lo local
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
