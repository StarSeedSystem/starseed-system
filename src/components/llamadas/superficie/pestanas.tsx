"use client";

/** Pestañas del panel de la llamada (LLA1108C): calidad, medio, invitar, grabar, Astraura, gente. */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { hayGrabacion, textoIndicador, GRABACION_INICIAL } from "@/lib/llamadas/superficie/grabacion";
import { textoTranscripcion } from "@/lib/llamadas/superficie/astraura-llamada";
import { planInvitar, TEXTO_LIMITES } from "@/lib/llamadas/superficie/grupo-invitar";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import { useInfoNativaLlamada } from "./contexto-nativo";
import { Barras, useSalidasAudio } from "./piezas";

const caja = "rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[12px] text-white/80";
const btnTxt = "cursor-pointer rounded-lg border border-violet-300/30 bg-violet-400/15 px-2.5 py-1 text-[11.5px] text-violet-50 transition-colors duration-200 hover:bg-violet-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40";
const NIVEL = { ok: "text-emerald-300", aviso: "text-amber-300", mal: "text-rose-300", neutro: "text-white/70" } as const;

export function PestanaCalidad({ v, salidas }: { v: VistaLlamada; salidas: ReturnType<typeof useSalidasAudio> }) {
  const nat = useInfoNativaLlamada();
  const c = v.calidad;
  return (
    <div className="space-y-2">
      {c ? (
        <dl className={cn(caja, "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1")}>
          <dt className="flex items-center gap-1.5 text-white/55"><Barras n={c.barras} texto={c.texto} /> Calidad</dt>
          <dd>{c.texto}</dd>
          {c.filas.map((f) => (
            <div key={f.clave} className="contents">
              <dt className="text-white/55">{f.etiqueta}</dt>
              <dd className={NIVEL[f.nivel]}>{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={caja}>Aún no hay medidas: se muestran en cuanto la conexión se establece.</p>
      )}
      <div className={caja}>
        <label className="mb-1 block text-white/55" htmlFor="salida-audio">Salida de audio</label>
        {nat.rutasAudio.length > 0 ? (
          <select id="salida-audio" value={nat.rutaActiva ?? ""} onChange={(e) => nat.elegirRuta?.(e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1">
            {nat.rutasAudio.map((r) => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}
          </select>
        ) : salidas.soportado && salidas.lista.length > 0 ? (
          <select id="salida-audio" value={salidas.elegida} onChange={(e) => salidas.elegir(e.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-900 px-2 py-1">
            <option value="default">Predeterminada</option>
            {salidas.lista.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
          </select>
        ) : (
          <p id="salida-audio" className="text-white/60">Este navegador no deja elegir la salida de audio; se usa la del sistema.</p>
        )}
      </div>
    </div>
  );
}

export function PestanaMedio({ v, a }: { v: VistaLlamada; a: AccionesLlamada }) {
  const opciones = v.opcionesMedio ?? [];
  return (
    <div className="space-y-2">
      <p className={caja}>{v.textoMedio ?? "El planificador elige el mejor medio disponible y lo cambia solo si se cae."}</p>
      <div role="radiogroup" aria-label="Medio de transmisión" className="space-y-1">
        {opciones.map((o) => {
          const sel = (v.medioElegido ?? "automatico") === o.medio;
          return (
            <button
              key={o.medio}
              type="button"
              role="radio"
              aria-checked={sel}
              disabled={!o.disponible || !a.elegirMedio}
              onClick={() => void a.elegirMedio?.(o.medio)}
              className={cn("block w-full cursor-pointer rounded-xl border px-2.5 py-1.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-50", sel ? "border-violet-300/60 bg-violet-400/20" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]")}
            >
              <span className="block text-[12.5px] text-white">{o.etiqueta}</span>
              <span className="block text-[11px] text-white/60">{o.motivo}</span>
            </button>
          );
        })}
        {opciones.length === 0 && <p className={caja}>Sin opciones de medio todavía.</p>}
      </div>
    </div>
  );
}

export function PestanaInvitar({ v, a }: { v: VistaLlamada; a: AccionesLlamada }) {
  const [sel, setSel] = useState<string[]>([]);
  const lista = v.invitables ?? [];
  const elegidos = lista.filter((i) => sel.includes(i.id));
  const plan = planInvitar({ actuales: Math.max(2, (v.participantes?.length ?? 2)), conVideo: v.tipo === "video" || v.tipo === "grupo", invitar: elegidos });
  return (
    <div className="space-y-2">
      <p className={caja}>{TEXTO_LIMITES}</p>
      {lista.length === 0 ? (
        <p className={caja}>No hay contactos, neuronas ni grupos a mano para invitar ahora.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto" aria-label="Quién invitar">
          {lista.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.06]">
                <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} className="accent-violet-400" />
                <span className="flex-1 truncate text-white/90">{i.nombre}</span>
                <span className="text-[10.5px] text-white/50">{i.clase}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {elegidos.length > 0 && <p role="status" className={caja}>{plan.texto}</p>}
      <button type="button" className={btnTxt} disabled={!a.invitar || plan.entran.length === 0} onClick={() => { void a.invitar?.(plan.entran); setSel([]); }}>
        Invitar{plan.entran.length ? ` (${plan.entran.length})` : ""}
      </button>
      {!a.invitar && <p className="text-[11px] text-white/50">Esta llamada directa aún no admite más personas; empieza una de grupo desde el chat.</p>}
    </div>
  );
}

export function PestanaGrabar({ v, a }: { v: VistaLlamada; a: AccionesLlamada }) {
  const g = v.grabacion ?? GRABACION_INICIAL;
  return (
    <div className="space-y-2">
      <p className={caja}>La grabación está apagada por defecto. Al empezar se avisa a todas las personas de la llamada y en cada aparato se ve un indicador rojo «Grabando». Se guarda solo en este aparato.</p>
      {g.error && <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-2.5 text-[12px] text-rose-100">{g.error}</p>}
      {hayGrabacion(g) && <p role="status" className="text-rose-200">{textoIndicador(g, v.yo)}</p>}
      {g.fase === "apagada" && <button type="button" className={btnTxt} onClick={() => void a.iniciarGrabacion?.()} disabled={!a.iniciarGrabacion}>Empezar a grabar</button>}
      {g.fase === "avisando" && <p role="status" className={caja}>Avisando a los participantes…</p>}
      {g.fase === "grabando" && <button type="button" className={cn(btnTxt, "border-rose-400/50 bg-rose-500/20")} onClick={() => void a.pararGrabacion?.()} disabled={!a.pararGrabacion}>Parar grabación</button>}
      {g.fase === "decidiendo" && (
        <div className={caja} role="group" aria-label="Qué hacer con la grabación">
          <p className="mb-1.5">¿Qué hago con la grabación?</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnTxt} onClick={() => void a.destinoGrabacion?.("archivos")}>Guardar en Archivos</button>
            <button type="button" className={btnTxt} onClick={() => void a.destinoGrabacion?.("biblioteca")}>Guardar en la Biblioteca</button>
            <button type="button" className={cn(btnTxt, "border-white/20 bg-white/5")} onClick={() => void a.destinoGrabacion?.("descartar")}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PestanaAstraura({ v, a }: { v: VistaLlamada; a: AccionesLlamada }) {
  const [q, setQ] = useState("");
  const as = v.astraura;
  const activa = !!as?.activa;
  return (
    <div className="space-y-2">
      <label className={cn(caja, "flex cursor-pointer items-start gap-2")}>
        <input type="checkbox" checked={activa} onChange={() => a.alternarAstraura?.()} disabled={!a.alternarAstraura} className="mt-0.5 accent-violet-400" />
        <span>Activar Astraura en esta llamada. Es opcional y solo para ti: sin activarla no se comparte nada. Con modelos locales primero cuando no hay internet.</span>
      </label>
      {activa && (
        <>
          <p className={caja}>{textoTranscripcion({ reconocedor: v.reconocedor ?? "ninguno", activa: !!v.transcripcionActiva })}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnTxt} aria-pressed={!!v.transcripcionActiva} onClick={() => a.alternarTranscripcion?.()} disabled={!a.alternarTranscripcion || (v.reconocedor ?? "ninguno") === "ninguno"}>
              {v.transcripcionActiva ? "Parar transcripción" : "Transcribir"}
            </button>
            <button type="button" className={btnTxt} aria-pressed={as?.hablar} onClick={() => a.alternarHablarAstraura?.()} disabled={!a.alternarHablarAstraura}>
              {as?.hablar ? "Leer en voz alta: sí" : "Leer en voz alta: no"}
            </button>
          </div>
          <div className={caja}>
            <p className="text-white/55">Contexto</p>
            <p>Tipo: {v.tipo}. Participantes: {(v.participantes ?? []).map((p) => p.nombre).join(", ") || v.nombre}. {v.archivos?.length ? `Archivos: ${v.archivos.join(", ")}.` : "Sin archivos compartidos."}</p>
          </div>
          <ol className="max-h-40 space-y-1.5 overflow-auto" aria-label="Respuestas de Astraura" aria-live="polite">
            {(as?.respuestas ?? []).map((r) => (
              <li key={r.id} className="rounded-xl border border-violet-300/25 bg-violet-400/10 p-2 text-[12px] text-white/90">
                <span className="block text-[10.5px] text-violet-200/80">{r.preguntaDe}: {r.pregunta}</span>
                {r.texto}
              </li>
            ))}
          </ol>
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { void a.preguntarAstraura?.(q.trim()); setQ(""); } }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta a Astraura…" aria-label="Pregunta a Astraura" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-[12px] text-white placeholder:text-white/40" />
            <button type="submit" className={btnTxt} disabled={!a.preguntarAstraura || !q.trim()}>Preguntar</button>
          </form>
          <p className="text-[11px] text-white/50">La respuesta la genera una sola neurona y se envía a todas las que activaron Astraura: todas ven la misma.</p>
        </>
      )}
    </div>
  );
}

export function PestanaGente({ v, a }: { v: VistaLlamada; a: AccionesLlamada }) {
  const gente = v.participantes ?? [];
  return (
    <ul className="space-y-1.5" aria-label="Participantes">
      {gente.length === 0 && <li className={caja}>Solo {v.nombre} y tú.</li>}
      {gente.map((p) => (
        <li key={p.id} className={cn(caja, "flex items-center gap-2")}>
          <span className="flex-1 truncate text-white">{p.nombre}{p.yo ? " (tú)" : ""}</span>
          {!p.yo && (
            <>
              <input type="range" min={0} max={1} step={0.05} value={p.volumen} aria-label={`Volumen de ${p.nombre}`} disabled={!a.volumenParticipante} onChange={(e) => a.volumenParticipante?.(p.id, Number(e.target.value))} className="w-20 accent-violet-400" />
              <button type="button" className={btnTxt} aria-pressed={!p.micro} disabled={!a.silenciarParticipante} onClick={() => a.silenciarParticipante?.(p.id)}>{p.micro ? "Silenciar" : "Silenciado"}</button>
            </>
          )}
        </li>
      ))}
      {v.tipo === "vivo" && <li className={caja}>Espectadores: {v.espectadores ?? "sin medir"} · Relevo: {v.relevo ?? "directo"}</li>}
    </ul>
  );
}
