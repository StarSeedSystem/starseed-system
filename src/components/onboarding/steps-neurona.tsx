"use client";

/**
 * Pasos NUEVOS del wizard de iniciación (Adenda 188):
 *   · StepCerebros  — cerebros, memoria y sincronización de almacenamiento.
 *   · StepPermisos  — permisos del dispositivo (peticiones REALES al navegador).
 *   · StepNeurona   — Astraura local: motor, modelo y conciencia según hardware.
 * Cada paso incluye al agente de integración: analiza el dispositivo, elige la
 * mejor opción, la explica y deja aceptarla o modificarla. Reconfigurable
 * después en Ajustes. Honestos y fail-open: sin red no bloquean el avance.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain as BrainIcon, Mic, Bell, Camera, MapPin, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listBrains, saveBrain, type Brain } from "@/lib/brains/brains";
import { ensureHermionePersonalityInstalled } from "@/lib/aurora/personalities";
import { requestDevicePermission, type PermisoDispositivo } from "@/lib/aurora/senses/request-permission";
import { visorBloqueaPermisos } from "@/lib/senses/senses";
import { thisDeviceId, setNeuronName } from "@/lib/neurons/neurons";
import { saveOnboarding } from "@/lib/onboarding/onboarding";
import { detectar, recomendar, MODELOS, CONCIENCIAS, type HW } from "@/lib/onboarding/neuron-recommend";
import AgentRecommendation from "./agent-recommendation";

const selectCls =
  "w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50";

// ════════════════════════════════════════════════════════════════════════════
// Paso: Cerebros y memoria
// ════════════════════════════════════════════════════════════════════════════
export function StepCerebros() {
  const [cerebros, setCerebros] = useState<Brain[] | null>(null);
  const [syncNube, setSyncNube] = useState(true);
  const [personalidad, setPersonalidad] = useState(true);
  const [aplicado, setAplicado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [nota, setNota] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listBrains()
      .then((bs) => { if (alive) setCerebros(bs); })
      .catch(() => { if (alive) setCerebros([]); });
    return () => { alive = false; };
  }, []);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (cerebros === null) r.push("Buscando tus cerebros existentes…");
    else if (cerebros.length === 0)
      r.push("No tienes cerebros todavía: crearé «Cerebro principal», el hogar de tus memorias, el de tus perfiles y el de los agentes de Astraura.");
    else r.push(`Encontré ${cerebros.length} cerebro(s) en tu cuenta: los dejo conectados a esta neurona.`);
    r.push("Sincronización en la nube StarSeed activada: tus memorias te siguen a cualquier dispositivo donde inicies sesión.");
    r.push("Personalidad base de Astraura incluida (opcional): un punto de partida configurable para tu exocórtex.");
    return r;
  }, [cerebros]);

  const aceptar = useCallback(async () => {
    setCargando(true);
    setNota(null);
    try {
      let creado: string | null = null;
      if ((cerebros?.length ?? 0) === 0) {
        const b = await saveBrain({ name: "Cerebro principal" });
        creado = b?.id ?? null;
        if (b) setCerebros([b]);
        if (!b) setNota("No pude crear el cerebro ahora (¿sin red?). Puedes crearlo luego en Cerebros.");
      }
      if (personalidad) {
        try { await ensureHermionePersonalityInstalled(); } catch { /* opcional */ }
      }
      await saveOnboarding({
        steps: { cerebros: { creado, syncNube, personalidad } },
      });
      setAplicado(true);
    } catch {
      setNota("Guardé tu elección localmente; la sincronizaré cuando haya conexión.");
      setAplicado(true);
    } finally {
      setCargando(false);
    }
  }, [cerebros, syncNube, personalidad]);

  return (
    <div className="space-y-4">
      <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={aceptar} cargando={cargando} />
      <div className="space-y-3">
        {(cerebros?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {cerebros!.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs">
                <BrainIcon className="h-3 w-3 text-cyan-300" aria-hidden /> {b.name || "Cerebro"}
              </span>
            ))}
          </div>
        )}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Sincronizar memorias en la nube StarSeed</span>
            <span className="block text-xs text-muted-foreground">Cerebros y memorias de tus perfiles y agentes, disponibles en todas tus neuronas.</span>
          </span>
          <Switch checked={syncNube} onCheckedChange={setSyncNube} aria-label="Sincronizar en la nube" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Personalidad base de Astraura (opcional)</span>
            <span className="block text-xs text-muted-foreground">Instala una personalidad inicial configurable; puedes crear más después.</span>
          </span>
          <Switch checked={personalidad} onCheckedChange={setPersonalidad} aria-label="Instalar personalidad base" />
        </label>
        {nota && <p className="text-xs text-amber-300/90">{nota}</p>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Paso: Permisos del dispositivo
// ════════════════════════════════════════════════════════════════════════════
type EstadoPermiso = "pendiente" | "ok" | "denegado" | "nodisp";

const PERMISOS: { id: PermisoDispositivo; label: string; desc: string; rec: boolean; Icon: any }[] = [
  { id: "microfono", label: "Micrófono", desc: "Hablar con Astraura por voz.", rec: true, Icon: Mic },
  { id: "notificaciones", label: "Notificaciones", desc: "Avisos de la red, mensajes y agentes.", rec: true, Icon: Bell },
  { id: "camara", label: "Cámara", desc: "Videollamadas y visión de Aurora (opcional).", rec: false, Icon: Camera },
  { id: "ubicacion", label: "Ubicación", desc: "Funciones locales y clima (opcional).", rec: false, Icon: MapPin },
  { id: "archivos", label: "Archivos", desc: "Conectar carpetas de este equipo (opcional).", rec: false, Icon: FolderOpen },
];

export function StepPermisos() {
  const [estados, setEstados] = useState<Record<string, EstadoPermiso>>({});
  const [visor, setVisor] = useState<{ bloqueado: boolean; visor: string } | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    try { setVisor(visorBloqueaPermisos()); } catch { setVisor(null); }
  }, []);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (visor?.bloqueado)
      r.push(`Estás en el visor integrado (${visor.visor}): este entorno bloquea los permisos del sistema. Puedes continuar y concederlos luego desde tu navegador.`);
    r.push("Recomiendo activar micrófono y notificaciones: son la base para hablar con Astraura y enterarte de lo importante.");
    r.push("Cámara, ubicación y archivos son opcionales: cada función los pedirá cuando de verdad los necesite.");
    return r;
  }, [visor]);

  const pedir = useCallback(async (id: PermisoDispositivo) => {
    setEstados((e) => ({ ...e, [id]: "pendiente" }));
    try {
      const r: any = await requestDevicePermission(id);
      const ok = r?.ok === true || r?.granted === true || /conced|granted|ok/i.test(String(r?.estado ?? ""));
      const nodisp = /no soportado|no disponible|unsupported/i.test(String(r?.detalle ?? r?.estado ?? ""));
      setEstados((e) => ({ ...e, [id]: ok ? "ok" : nodisp ? "nodisp" : "denegado" }));
    } catch {
      setEstados((e) => ({ ...e, [id]: "nodisp" }));
    }
  }, []);

  const aceptar = useCallback(async () => {
    setCargando(true);
    for (const p of PERMISOS.filter((p) => p.rec)) {
      // secuencial: los navegadores muestran un prompt a la vez
      // eslint-disable-next-line no-await-in-loop
      await pedir(p.id);
    }
    try { await saveOnboarding({ steps: { permisos: { pedidos: ["microfono", "notificaciones"] } } }); } catch { /* best-effort */ }
    setAplicado(true);
    setCargando(false);
  }, [pedir]);

  const chip = (s: EstadoPermiso | undefined) =>
    s === "ok" ? <span className="text-[10px] text-emerald-300">concedido ✓</span>
    : s === "denegado" ? <span className="text-[10px] text-amber-300">denegado — actívalo en el navegador</span>
    : s === "nodisp" ? <span className="text-[10px] text-slate-400">no disponible aquí</span>
    : s === "pendiente" ? <span className="text-[10px] text-slate-400">pidiendo…</span>
    : null;

  return (
    <div className="space-y-4">
      <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={aceptar} cargando={cargando} />
      <div className="grid gap-2">
        {PERMISOS.map(({ id, label, desc, rec, Icon }) => (
          <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
              <Icon className="h-4 w-4 text-cyan-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {label}
                {rec && <span className="rounded-full bg-cyan-400/15 px-1.5 py-px text-[9px] uppercase tracking-wide text-cyan-200">recomendado</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{desc} {chip(estados[id])}</span>
            </span>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => pedir(id)} disabled={estados[id] === "pendiente"}>
              {estados[id] === "ok" ? "Volver a pedir" : "Permitir"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Paso: Astraura local (la IA de esta neurona)
// ════════════════════════════════════════════════════════════════════════════
export function StepNeurona() {
  const [hw, setHw] = useState<HW | null>(null);
  const [motor, setMotor] = useState<"auto" | "bitnet-158" | "multimodel">("auto");
  const [modelo, setModelo] = useState("bitnet-2b");
  const [conciencia, setConciencia] = useState("semilla");
  const [nombre, setNombre] = useState("");
  const [aplicado, setAplicado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [razones, setRazones] = useState<string[]>(["Analizando este dispositivo…"]);

  useEffect(() => {
    let alive = true;
    detectar().then((h) => {
      if (!alive) return;
      setHw(h);
      const r = recomendar(h);
      setMotor(r.motor);
      setModelo(r.modelo);
      setConciencia(r.conciencia);
      setRazones(r.razones);
      setNombre((prev) => prev || `Neurona ${h.so}`);
    });
    return () => { alive = false; };
  }, []);

  const aceptar = useCallback(async () => {
    setCargando(true);
    try {
      try { setNeuronName(thisDeviceId(), nombre || "Mi neurona"); } catch { /* local */ }
      await saveOnboarding({
        steps: { neurona: { motor, modelo, conciencia, so: hw?.so ?? null, arch: hw?.arch ?? null, ram: hw?.ramGB ?? null } },
      });
      try { window.localStorage.setItem("starseed.neuron.setup.v1", "1"); } catch { /* */ }
      setAplicado(true);
    } catch {
      try { window.localStorage.setItem("starseed.neuron.setup.v1", "1"); } catch { /* */ }
      setAplicado(true);
    } finally {
      setCargando(false);
    }
  }, [motor, modelo, conciencia, nombre, hw]);

  return (
    <div className="space-y-4">
      {hw && (
        <p className="text-xs text-muted-foreground">
          Detectado: {hw.so} · CPU {hw.arch}{hw.nucleos ? ` · ${hw.nucleos} núcleos` : ""}{hw.ramGB ? ` · ${hw.ramGB >= 8 ? "8 GB o más" : `${hw.ramGB} GB`} RAM` : " · RAM no expuesta por este navegador"}
        </p>
      )}
      <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={aceptar} cargando={cargando} />
      <div className="grid gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Nombre de esta neurona</span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mi computadora" className="mt-1" />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Motor de cognición</span>
          <select value={motor} onChange={(e) => setMotor(e.target.value as any)} className={cn(selectCls, "mt-1")}>
            <option value="auto">Auto — BitNet local con relevo inteligente (recomendado)</option>
            <option value="bitnet-158">Solo BitNet 1.58 local</option>
            <option value="multimodel">Multimodelo (proveedores configurados)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Modelo base de Astraura</span>
          <select value={modelo} onChange={(e) => setModelo(e.target.value)} className={cn(selectCls, "mt-1")}>
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre} — {m.params} · {m.disco}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Conciencia colectiva</span>
          <select value={conciencia} onChange={(e) => setConciencia(e.target.value)} className={cn(selectCls, "mt-1")}>
            {CONCIENCIAS.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} — {c.desc} ({c.extra})</option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-muted-foreground">
          El modelo se descarga al activarlo y todo esto vive en Ajustes → Neurona, por dispositivo.
        </p>
      </div>
    </div>
  );
}
