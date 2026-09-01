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
import { Brain as BrainIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listBrains, saveBrain, type Brain } from "@/lib/brains/brains";
// (Adenda 193) Las carpetas elegidas en Permisos se vinculan SOLAS aquí.
import { listarCarpetas, suscribirCarpetas, mezclarCarpetasEnServidores, type CarpetaVinculada } from "@/lib/storage/carpetas-vinculadas";
import { ensureHermionePersonalityInstalled } from "@/lib/aurora/personalities";
import { pedirPermisosEnSecuencia } from "@/lib/aurora/senses/request-permission";
import { visorBloqueaPermisos } from "@/lib/senses/senses";
import { PermisosDispositivoPanel } from "@/components/senses/permisos-dispositivo";
import { thisDeviceId, setNeuronName } from "@/lib/neurons/neurons";
import { saveOnboarding } from "@/lib/onboarding/onboarding";
import { hayDireccionPublica, AVISO_SIN_DOMINIO } from "@/lib/mail/direccion-publica";
import { detectar, recomendar, MODELOS, CONCIENCIAS, type HW } from "@/lib/onboarding/neuron-recommend";
import AgentRecommendation from "./agent-recommendation";

const selectCls =
  "w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400/50";

// ════════════════════════════════════════════════════════════════════════════
// Paso: Cerebros y memoria
// ════════════════════════════════════════════════════════════════════════════
export function StepCerebros() {
  const [cerebros, setCerebros] = useState<Brain[] | null>(null);
  const [carpetas, setCarpetas] = useState<CarpetaVinculada[]>([]);
  const [vincularCarpetas, setVincularCarpetas] = useState(true);
  const [syncNube, setSyncNube] = useState(true);
  // (Adenda 189) Enrutamiento de las memorias: dónde viven físicamente.
  const [ruta, setRuta] = useState<"nube-local" | "nube" | "local">("nube-local");
  const [personalidad, setPersonalidad] = useState(true);
  const [aplicado, setAplicado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [nota, setNota] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listBrains()
      .then((bs) => { if (alive) setCerebros(bs); })
      .catch(() => { if (alive) setCerebros([]); });
    setCarpetas(listarCarpetas());
    const off = suscribirCarpetas((l) => { if (alive) setCarpetas(l); });
    return () => { alive = false; off(); };
  }, []);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (cerebros === null) r.push("Buscando tus cerebros existentes…");
    else if (cerebros.length === 0)
      r.push("No tienes cerebros todavía: crearé «Cerebro principal», el hogar de tus memorias, el de tus perfiles y el de los agentes de Astraura.");
    else r.push(`Encontré ${cerebros.length} cerebro(s) en tu cuenta: los dejo conectados a esta neurona.`);
    r.push("Sincronización en la nube StarSeed activada: tus memorias te siguen a cualquier dispositivo donde inicies sesión.");
    r.push("Enrutamiento recomendado: nube + copia local espejada — velocidad local con respaldo en tu cuenta. Puedes cambiarlo a solo-nube o solo-local.");
    if (carpetas.length > 0)
      r.push(`Vincularé al cerebro principal las ${carpetas.length} carpeta(s) que elegiste en Permisos: ${carpetas.map((c) => c.nombre).join(", ")}.`);
    else
      r.push("No vinculaste carpetas en el paso anterior: puedes añadirlas cuando quieras desde Ajustes → Sentidos, y aparecerán aquí solas.");
    r.push("Personalidad base de Astraura incluida (opcional): un punto de partida configurable para tu exocórtex.");
    return r;
  }, [cerebros, carpetas]);

  const aceptar = useCallback(async () => {
    setCargando(true);
    setNota(null);
    try {
      let creado: string | null = null;
      // (Adenda 193) El cerebro nace ya con las carpetas vinculadas como
      // servidores: lo elegido en Permisos no hay que volver a declararlo.
      const servidores = vincularCarpetas
        ? (mezclarCarpetasEnServidores([], carpetas) as unknown as Brain["servers"])
        : undefined;
      if ((cerebros?.length ?? 0) === 0) {
        const b = await saveBrain({ name: "Cerebro principal", ...(servidores ? { servers: servidores } : {}) });
        creado = b?.id ?? null;
        if (b) setCerebros([b]);
        if (!b) setNota("No pude crear el cerebro ahora (¿sin red?). Puedes crearlo luego en Cerebros.");
      } else if (vincularCarpetas && carpetas.length > 0 && cerebros?.[0]) {
        // Ya tenía cerebro: se le AÑADEN las carpetas sin tocar sus servidores.
        const principal = cerebros[0];
        const fusion = mezclarCarpetasEnServidores(principal.servers as unknown as { id: string }[], carpetas);
        await saveBrain({ ...principal, servers: fusion as unknown as Brain["servers"] });
      }
      if (personalidad) {
        try { await ensureHermionePersonalityInstalled(); } catch { /* opcional */ }
      }
      await saveOnboarding({
        steps: { cerebros: { creado, syncNube, personalidad, enrutamiento: ruta, carpetas: carpetas.map((c) => c.nombre) } },
      });
      setAplicado(true);
    } catch {
      setNota("Guardé tu elección localmente; la sincronizaré cuando haya conexión.");
      setAplicado(true);
    } finally {
      setCargando(false);
    }
  }, [cerebros, syncNube, personalidad, ruta, carpetas, vincularCarpetas]);

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
        {carpetas.length > 0 && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Vincular tus carpetas al cerebro principal</span>
              <span className="block text-xs text-muted-foreground">
                {carpetas.map((c) => c.nombre).join(" · ")}
              </span>
            </span>
            <Switch checked={vincularCarpetas} onCheckedChange={setVincularCarpetas} aria-label="Vincular carpetas al cerebro" />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-muted-foreground">Enrutamiento de las memorias (medios de almacenamiento)</span>
          <select value={ruta} onChange={(e) => setRuta(e.target.value as typeof ruta)} className={cn(selectCls, "mt-1")}>
            <option value="nube-local">Nube StarSeed + copia local espejada (recomendado)</option>
            <option value="nube">Solo nube StarSeed — mínima huella en este equipo</option>
            <option value="local">Solo local en esta neurona — máxima soberanía, sin réplica remota</option>
          </select>
        </label>
        {nota && <p className="text-xs text-amber-300/90">{nota}</p>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Paso: Permisos del dispositivo
// ════════════════════════════════════════════════════════════════════════════
export function StepPermisos() {
  const [visor, setVisor] = useState<{ bloqueado: boolean; visor: string } | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    try { setVisor(visorBloqueaPermisos()); } catch { setVisor(null); }
  }, []);

  const razones = useMemo(() => {
    const r: string[] = [];
    if (visor?.bloqueado)
      r.push(`Estás en el visor integrado (${visor.visor}): este medio no muestra los diálogos de permiso. Usa «Abrir en tu navegador» (abajo) para concederlos allí; tu cuenta se sincroniza sola.`);
    r.push("Recomiendo activar micrófono y notificaciones: son la base para hablar con Astraura y enterarte de lo importante.");
    r.push("Cámara, ubicación y archivos son opcionales: además de aquí, cada área los pide cuando de verdad los necesita, y siempre viven en Ajustes → Sentidos.");
    return r;
  }, [visor]);

  const aceptar = useCallback(async () => {
    setCargando(true);
    // (Adenda 192) Peticiones REALES de uno en uno (regla del navegador). Las
    // filas del panel se actualizan solas vía el evento `starseed:permiso` y
    // permissions.onchange — el mismo panel vive en Ajustes y en Sentidos.
    await pedirPermisosEnSecuencia(["microfono", "notificaciones"]);
    try { await saveOnboarding({ steps: { permisos: { pedidos: ["microfono", "notificaciones"] } } }); } catch { /* best-effort */ }
    setAplicado(true);
    setCargando(false);
  }, []);

  return (
    <div className="space-y-4">
      <AgentRecommendation razones={razones} aplicado={aplicado} onAceptar={aceptar} cargando={cargando} />
      <PermisosDispositivoPanel ids={["microfono", "notificaciones", "camara", "ubicacion", "archivos"]} />
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
        {/* (Adenda 193) El MOTOR y el MODELO ya no se eligen aquí: vivían a la
            vez en este paso y en la ventana «Sistemas de Astraura», que se abre
            justo después y es su sitio coherente (allí está el sistema primario
            con 1.58b local por defecto). Aquí se muestra lo que el agente eligió
            para este equipo, y allí se cambia si hace falta. */}
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3 text-xs">
          <p className="font-medium text-[13px]">Astraura 1.58-bit local, elegida para este equipo</p>
          <p className="mt-1 text-muted-foreground">
            Motor: {motor === "auto" ? "automático (1.58-bit local con relevo)" : motor === "bitnet-158" ? "solo 1.58-bit local" : "multimodelo"} ·
            Modelo: {MODELOS.find((m) => m.id === modelo)?.nombre ?? modelo}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Al terminar esta bienvenida se abre la ventana de sistemas de Astraura: ahí puedes afinar el motor, el
            modelo y sus preferencias, sin repetir nada de lo que ya elegiste aquí.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground">Conciencia colectiva</span>
          <select value={conciencia} onChange={(e) => setConciencia(e.target.value)} className={cn(selectCls, "mt-1")}>
            {CONCIENCIAS.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} — {c.desc} ({c.extra})</option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-muted-foreground">
          El modelo se descarga al activarlo. Todo esto vive luego en Ajustes → Neurona, por dispositivo.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Correos vinculados de la cuenta (se usa dentro del paso "Correos" del wizard)
// Lista REAL (account_emails) + alta de un correo externo vinculado opcional.
// ════════════════════════════════════════════════════════════════════════════
export function CorreosVinculados() {
  const [correos, setCorreos] = useState<{ id: string; address: string; kind: string; is_primary: boolean }[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  // (Adenda 191) El correo externo se pide UNA vez: si ya hay uno vinculado,
  // el alta de otro queda plegada tras un botón discreto.
  const [mostrarAlta, setMostrarAlta] = useState(false);

  const cargar = useCallback(async () => {
    try {
      // (Adenda 197) Antes de listar, se asegura la DIRECCIÓN PÚBLICA de la
      // cuenta: la que el usuario da al resto de internet.
      try {
        const dp = await import("@/lib/mail/direccion-publica");
        const { listAccountEmails: la } = await import("@/lib/mail/starseed-mail");
        const previa = await la();
        const interna = previa.find((e) => String(e.kind) === "internal")?.address;
        if (interna) await dp.asegurarDireccionPublica(interna);
      } catch { /* si no hay dominio aún, se explica abajo */ }
      const { listAccountEmails } = await import("@/lib/mail/starseed-mail");
      const ls = await listAccountEmails();
      setCorreos(ls.map((e) => ({ id: e.id, address: e.address, kind: String(e.kind), is_primary: !!e.is_primary })));
    } catch {
      setCorreos([]);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const vincular = useCallback(async () => {
    const addr = nuevo.trim().toLowerCase();
    if (!addr.includes("@")) { setNota("Escribe un correo válido."); return; }
    setOcupado(true);
    setNota(null);
    try {
      const { addExternalEmail } = await import("@/lib/mail/starseed-mail");
      const r = await addExternalEmail(addr);
      if (r.ok) {
        setNuevo("");
        setNota("Correo vinculado a tu cuenta ✓ (la sincronización completa se activa en Correos).");
        void cargar();
      } else {
        setNota(r.error || "No se pudo vincular ahora.");
      }
    } catch {
      setNota("No se pudo vincular ahora (¿sin red?). Inténtalo en Ajustes → Correos.");
    } finally {
      setOcupado(false);
    }
  }, [nuevo, cargar]);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Correos vinculados a tu cuenta</p>
      {hayDireccionPublica() ? (
        <p className="text-[10px] leading-snug text-white/45">
          Tu <span className="text-cyan-200">@star.seed</span> es tu identidad dentro de la red. Para que te escriban desde
          fuera se usa tu dirección <span className="text-emerald-200">para todo internet</span>, con tu mismo nombre.
        </p>
      ) : (
        <p className="rounded-lg border border-white/10 bg-black/20 p-2 text-[10px] leading-snug text-white/55">
          {AVISO_SIN_DOMINIO}
        </p>
      )}
      {correos === null ? (
        <p className="text-xs text-white/50">Cargando…</p>
      ) : correos.length === 0 ? (
        <p className="text-xs text-white/50">Aún no hay correos vinculados aquí.</p>
      ) : (
        <ul className="space-y-1">
          {correos.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs text-white/80">
              <span
                className={cn("h-1.5 w-1.5 rounded-full",
                  c.kind === "external" ? "bg-fuchsia-300" : c.kind === "created" ? "bg-emerald-300" : "bg-cyan-300")}
                aria-hidden
              />
              <span className="truncate">{c.address}</span>
              <span className="text-[10px] text-white/40">
                {c.kind === "external" ? "tuyo, de fuera"
                  : c.kind === "created" ? "para todo internet"
                  : "identidad StarSeed"}
                {c.is_primary ? " · principal" : ""}
              </span>
              {c.kind === "created" && (
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(c.address); setNota(`${c.address} copiada ✓`); }}
                  className="ml-auto shrink-0 text-[10px] text-emerald-300 underline-offset-2 hover:underline"
                >
                  copiar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(() => {
        const hayExterno = (correos ?? []).some((c) => c.kind === "external");
        if (hayExterno && !mostrarAlta) {
          return (
            <button
              type="button"
              onClick={() => setMostrarAlta(true)}
              className="pt-1 text-[11px] text-cyan-300/80 transition-colors hover:text-cyan-200"
            >
              + Vincular otro correo (opcional)
            </button>
          );
        }
        return (
          <div className="flex gap-2 pt-1">
            <Input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="vincular-otro@correo.com (opcional)"
              type="email"
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={vincular} disabled={ocupado}>
              {ocupado ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        );
      })()}
      {nota && <p className="text-[11px] text-cyan-200/80">{nota}</p>}
    </div>
  );
}
