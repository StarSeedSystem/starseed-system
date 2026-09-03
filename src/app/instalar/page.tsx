"use client";

// StarSeed OS — /instalar
// Detección REAL del dispositivo (SO, CPU, RAM, GPU) + búsqueda de sesiones
// activas para sincronizar + recomendación personalizada de la versión
// instalable (SO × procesador × modelo Astraura × conciencia colectiva).
// Nada simulado: lo que el navegador no expone se dice honestamente.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { detectar, recomendar, MODELOS, CONCIENCIAS, assetDirecto, type HW } from "@/lib/onboarding/neuron-recommend";

const RELEASES_URL = "https://github.com/StarSeedSystem/starseed-system/releases";

// (Ola 226) VARIANTE: no hay carpeta «(app)», el página vive en src/app/instalar/page.tsx.
// Los modelos con url null (config/astraura-models.json) se muestran como «Próximamente»:
// badge, sin descarga y con opacidad 60%, nunca como recomendables.
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
  const directo = hw ? assetDirecto(hw) : null;

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
          <section
            className={`rounded-2xl border p-5 space-y-3 ${
              // (Ola 226) si el modelo recomendado no tiene url, no se presenta como recomendable.
              modeloRec.url ? "border-cyan-400/30 bg-cyan-400/5" : "border-white/10 bg-white/[0.03] opacity-60"
            }`}
          >
            <h2 className="text-lg font-medium text-cyan-200">Recomendación personalizada</h2>
            <p className="text-sm">
              {modeloRec.url ? (
                <>
                  <span className="font-semibold">{modeloRec.nombre}</span> ({modeloRec.params}, {modeloRec.arq}, {modeloRec.disco}) + conciencia colectiva{" "}
                  <span className="font-semibold">{CONCIENCIAS.find((c) => c.id === rec.conciencia)?.nombre}</span>.
                </>
              ) : (
                <>
                  <span className="font-semibold">{modeloRec.nombre}</span>{" "}
                  <span className="ml-1 inline-block rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-200">
                    Próximamente
                  </span>{" "}
                  — aún sin descarga publicada, no recomendable todavía.
                </>
              )}
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
                  // (Ola 226) modelos sin url aparecen como «Próximamente» y no son elegibles.
                  <option key={m.id} value={m.id} disabled={!m.url} style={!m.url ? { opacity: 0.6 } : undefined}>
                    {m.nombre} — {m.params} · {m.disco}{!m.url ? " · Próximamente" : ""}
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
          {directo && (
            <a
              href={directo.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20"
            >
              <span>⬇ Descarga directa para tu equipo</span>
              <span className="text-xs font-normal text-cyan-200/90">{directo.etiqueta}</span>
            </a>
          )}
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
