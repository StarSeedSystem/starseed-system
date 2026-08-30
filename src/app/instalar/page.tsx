"use client";

// StarSeed OS — /instalar
// Detección REAL del dispositivo (SO, CPU, RAM, GPU) + búsqueda de sesiones
// activas para sincronizar + recomendación personalizada de la versión
// instalable (SO × procesador × modelo Astraura × conciencia colectiva).
// Nada simulado: lo que el navegador no expone se dice honestamente.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type HW = {
  so: string;
  arch: string;
  nucleos: number | null;
  ramGB: number | null;
  gpu: string | null;
  movil: boolean;
};

const MODELOS: { id: string; nombre: string; params: string; arq: string; disco: string; ramMin: number }[] = [
  { id: "needle2", nombre: "Needle 2", params: "45 M", arq: "CQ2-bit (Cactus)", disco: "~14 MB", ramMin: 1 },
  { id: "bitnet-2b", nombre: "BitNet b1.58 (Microsoft)", params: "2 B", arq: "1.58-bit ternario", disco: "~400-500 MB", ramMin: 2 },
  { id: "bonsai-1.7b", nombre: "Ternary Bonsai (mini)", params: "1.7 B", arq: "1.58-bit ternario", disco: "~462 MB", ramMin: 2 },
  { id: "bonsai-8b-1bit", nombre: "Bonsai 8B (1-bit puro)", params: "8 B", arq: "1-bit puro", disco: "~1.15 GB", ramMin: 6 },
  { id: "bonsai-8b", nombre: "Ternary Bonsai (estándar)", params: "8 B", arq: "1.58-bit ternario", disco: "~1.75 GB", ramMin: 8 },
];

const CONCIENCIAS: { id: string; nombre: string; desc: string; extra: string }[] = [
  { id: "semilla", nombre: "Semilla", desc: "Solo conexión mesh remota; sin réplica local.", extra: "0 MB" },
  { id: "brote", nombre: "Brote", desc: "Caché local ligera del estado colectivo.", extra: "~256-512 MB" },
  { id: "bosque", nombre: "Bosque", desc: "Réplica amplia para operar sin conexión y servir a otras neuronas.", extra: "2 GB+" },
];

const RELEASES_URL = "https://github.com/StarSeedSystem/starseed-system/releases";

async function detectar(): Promise<HW> {
  const n: any = typeof navigator !== "undefined" ? navigator : {};
  const plat: string = (n.userAgentData && n.userAgentData.platform) || n.platform || "";
  const ua: string = n.userAgent || "";
  let so = "Desconocido";
  if (/Android/i.test(ua)) so = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua + " " + plat)) so = "iOS / iPadOS";
  else if (/Mac/i.test(plat)) so = "macOS";
  else if (/Win/i.test(plat)) so = "Windows";
  else if (/Linux|X11/i.test(plat)) so = "Linux";
  const movil = /Android|iPhone|iPad|Mobile/i.test(ua);
  let arch = "desconocida";
  try {
    if (n.userAgentData && n.userAgentData.getHighEntropyValues) {
      const h = await n.userAgentData.getHighEntropyValues(["architecture", "bitness"]);
      if (h && h.architecture) arch = h.architecture + (h.bitness ? " " + h.bitness + "-bit" : "");
    }
  } catch {}
  let gpu: string | null = null;
  try {
    const c = document.createElement("canvas");
    const gl: any = c.getContext("webgl2") || c.getContext("webgl");
    const ext = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {}
  if (arch === "desconocida" && so === "macOS" && gpu && /Apple/i.test(gpu)) arch = "arm 64-bit (Apple Silicon)";
  const ramGB = typeof n.deviceMemory === "number" ? n.deviceMemory : null;
  const nucleos = typeof n.hardwareConcurrency === "number" ? n.hardwareConcurrency : null;
  return { so, arch, nucleos, ramGB, gpu, movil };
}

function recomendar(hw: HW): { modelo: string; conciencia: string; razones: string[] } {
  const razones: string[] = [];
  let modelo = "bitnet-2b";
  let conciencia = "semilla";
  const ram = hw.ramGB;
  if (ram === null) {
    modelo = hw.movil ? "needle2" : "bitnet-2b";
    razones.push("Tu navegador no expone la RAM, así que recomiendo una opción conservadora que corre bien en casi cualquier equipo. Puedes subir de modelo en Ajustes cuando quieras.");
  } else if (ram >= 8) {
    modelo = "bonsai-8b";
    conciencia = "brote";
    razones.push(`Detecté ${ram} GB de RAM (o más): tu equipo puede con el modelo estándar de 8B ternario, el más capaz de la familia 1.58-bit, y con una caché local de conciencia colectiva (Brote).`);
  } else if (ram >= 6) {
    modelo = "bonsai-8b-1bit";
    razones.push(`Con ${ram} GB de RAM cabe el Bonsai 8B en 1-bit puro (~1.15 GB): máxima capacidad sin arriesgar la fluidez del sistema.`);
  } else if (ram >= 4) {
    modelo = "bonsai-1.7b";
    razones.push(`Con ${ram} GB de RAM, el Ternary Bonsai mini (1.7B, ~462 MB) da el mejor equilibrio entre inteligencia local y memoria libre para tus apps.`);
  } else {
    modelo = hw.movil ? "needle2" : "bitnet-2b";
    razones.push(`Con ${ram} GB de RAM conviene la opción más ligera para que StarSeed OS vuele: puedes apoyarte en la conciencia colectiva remota para el razonamiento pesado.`);
  }
  if (hw.movil) razones.push("Dispositivo móvil detectado: mientras las apps nativas móviles están en diseño, la web instalable (PWA) es la vía recomendada.");
  if (hw.nucleos) razones.push(`${hw.nucleos} núcleos de CPU disponibles para la inferencia ternaria local.`);
  if (hw.gpu) razones.push(`GPU detectada: ${hw.gpu}.`);
  return { modelo, conciencia, razones };
}

export default function InstalarPage() {
  const [hw, setHw] = useState<HW | null>(null);
  const [sesion, setSesion] = useState<string | null | "buscando">("buscando");
  const [neurona, setNeurona] = useState<"buscando" | "activa" | "no detectada">("buscando");
  const [modeloSel, setModeloSel] = useState<string>("bitnet-2b");
  const [concienciaSel, setConcienciaSel] = useState<string>("semilla");

  const rec = useMemo(() => (hw ? recomendar(hw) : null), [hw]);

  useEffect(() => {
    detectar().then((h) => {
      setHw(h);
      const r = recomendar(h);
      setModeloSel(r.modelo);
      setConcienciaSel(r.conciencia);
    });
  }, []);

  useEffect(() => {
    // 1º SIEMPRE: buscar sesiones activas de la cuenta para sincronizar —
    // cada medio (web, localhost, terminal, app) es una ventana del mismo sistema.
    try {
      const sb = createClient();
      sb.auth.getSession().then(({ data }) => setSesion(data.session?.user?.email ?? null));
    } catch {
      setSesion(null);
    }
    // 2º: ¿hay una neurona Astraura local corriendo en este dispositivo?
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    fetch("http://localhost:8000/health", { signal: ctl.signal })
      .then((r) => setNeurona(r.ok ? "activa" : "no detectada"))
      .catch(() => setNeurona("no detectada"))
      .finally(() => clearTimeout(t));
  }, []);

  const modeloRec = MODELOS.find((m) => m.id === (rec?.modelo ?? ""));

  return (
    <main className="min-h-screen bg-[#070a14] text-slate-100 px-5 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">StarSeed OS · Instalación</p>
          <h1 className="text-3xl font-semibold">Instala tu neurona</h1>
          <p className="text-sm text-slate-300">
            Analizo este dispositivo de verdad (sistema, procesador, memoria), busco tus sesiones activas
            para sincronizar y te recomiendo la mejor versión respetando los límites de tu hardware.
            Todo es reconfigurable después en Ajustes → Neurona.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">Sesión de cuenta</p>
            <p className="mt-1 text-sm">
              {sesion === "buscando" ? "Buscando…" : sesion ? `Activa: ${sesion} — este medio se sincronizará como una ventana más de tu sistema.` : "Sin sesión aquí. Inicia sesión para sincronizar tus ventanas, escritorios y chats."}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">Neurona local</p>
            <p className="mt-1 text-sm">
              {neurona === "buscando" ? "Buscando en este dispositivo…" : neurona === "activa" ? "Astraura local detectada en este equipo ✓" : "No detecté una neurona local corriendo."}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">Tu dispositivo</p>
            <p className="mt-1 text-sm">
              {hw ? `${hw.so} · CPU ${hw.arch}${hw.nucleos ? ` · ${hw.nucleos} núcleos` : ""}${hw.ramGB ? ` · ${hw.ramGB >= 8 ? "8 GB o más" : hw.ramGB + " GB"} RAM` : " · RAM no expuesta por el navegador"}` : "Detectando…"}
            </p>
          </div>
        </section>

        {rec && modeloRec && (
          <section className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5 space-y-3">
            <h2 className="text-lg font-medium text-cyan-200">Recomendación personalizada</h2>
            <p className="text-sm">
              <span className="font-semibold">{modeloRec.nombre}</span> ({modeloRec.params}, {modeloRec.arq}, {modeloRec.disco}) + conciencia colectiva{" "}
              <span className="font-semibold">{CONCIENCIAS.find((c) => c.id === rec.conciencia)?.nombre}</span>.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {rec.razones.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Configura tu versión</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-400">Modelo base de Astraura</span>
              <select
                value={modeloSel}
                onChange={(e) => setModeloSel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0c1122] p-2.5"
              >
                {MODELOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} — {m.params} · {m.disco}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-400">Conciencia colectiva</span>
              <select
                value={concienciaSel}
                onChange={(e) => setConcienciaSel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0c1122] p-2.5"
              >
                {CONCIENCIAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} — {c.desc} ({c.extra})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-400">
            El modelo y la conciencia se descargan dentro de la app tras instalar, y puedes cambiarlos
            cuando quieras en Ajustes → Neurona (por dispositivo).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Descargar instalador</h2>
          <div className="grid gap-2 text-sm">
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 bg-white/5 p-3 hover:border-cyan-300/50">
              macOS — .dmg (Apple Silicon e Intel)
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 bg-white/5 p-3 hover:border-cyan-300/50">
              Windows — .msi / .exe (x64)
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 bg-white/5 p-3 hover:border-cyan-300/50">
              Linux — .AppImage / .deb (x64 y ARM64)
            </a>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-slate-300">
              Android y iOS — apps nativas en diseño; hoy la vía recomendada es esta web instalable.
            </div>
          </div>
          <p className="text-xs text-amber-300/90">
            Honesto: los primeros instaladores se compilan desde GitHub Actions (workflow «Instaladores
            StarSeed OS»). Si el enlace de Releases aún no muestra binarios, la primera compilación está
            en camino.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300 space-y-2">
          <h2 className="text-base font-medium text-slate-100">Cómo se actualiza</h2>
          <p>· La red, las publicaciones, los archivos y las mejoras de Astraura del lado servidor cambian al instante para todos, sin reinstalar.</p>
          <p>· Los módulos y modelos se actualizan individualmente desde Ajustes → Actualizaciones, con aviso en Notificaciones.</p>
          <p>· Cuando cambia el shell nativo, la app instalada se re-instala sola desde GitHub Releases conservando todos tus archivos y datos.</p>
        </section>
      </div>
    </main>
  );
}
