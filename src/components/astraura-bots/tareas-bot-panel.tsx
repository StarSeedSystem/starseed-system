"use client";
/**
 * Panel de TAREAS del bot (BOT1011X · contrato architecture/astraura-bots.md §8).
 * Lista las tareas con su estado y cada criterio con su marca (quién y evidencia).
 * «Verificar» respeta la regla de no autoverificación y «Nueva tarea» pasa por
 * `validarAccion` + `decidirAccion` antes de crear nada.
 */
import { useState, type FormEvent } from "react";
import { ListChecks, Plus } from "lucide-react";
import type { Bot, EstadoTarea, RolBot, Tarea } from "@/lib/astraura-bots/tipos";
import { crearTarea, marcarCriterio, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import { validarAccion, type AccionBot } from "@/lib/astraura-bots/acciones";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import { guardar, listar, quienVerifica, type TareaGuardada } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

const ETIQUETA: Record<EstadoTarea, string> = { propuesta: "propuesta", "en-curso": "en curso", verificando: "verificando", hecha: "hecha", rechazada: "rechazada" };
const BTN = "cursor-pointer rounded-md border border-border px-2 py-1 text-sm transition-colors duration-200 hover:bg-muted";
const CAMPO = "mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm";

export interface TareasBotPanelProps {
  bot: Bot;
  rol?: RolBot;
  nivel?: NivelBot;
}
export function TareasBotPanel({ bot, rol = "dueno", nivel = NIVEL_POR_DEFECTO }: TareasBotPanelProps) {
  const [tareas, setTareas] = useState<TareaGuardada[]>(() => listar(bot.id));
  const [creando, setCreando] = useState(false), [titulo, setTitulo] = useState("");
  const [criteriosTexto, setCriteriosTexto] = useState(""), [evidencia, setEvidencia] = useState("");
  const [origen, setOrigen] = useState<Tarea["origen"]>("genesis");
  const [propuesta, setPropuesta] = useState<{ accion: AccionBot; origen: Tarea["origen"] } | null>(null);
  const [verificando, setVerificando] = useState<{ tareaId: string; criterio: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const materializar = (accion: AccionBot, orig: Tarea["origen"]) => {
    const r = crearTarea(accion.args, bot.id, orig);
    if ("problemas" in r) { setAviso(r.problemas.join(" ")); return; }
    guardar(r, verificacionInicial(r, []));
    setPropuesta(null); setCreando(false); setTitulo(""); setCriteriosTexto(""); setAviso("");
    setTareas(listar(bot.id));
  };

  const crear = (e: FormEvent) => {
    e.preventDefault();
    const criterios = criteriosTexto.split("\n").map((c) => c.trim()).filter(Boolean);
    const { accion, problemas } = validarAccion({ tipo: "tarea.crear", args: { titulo, criterios, director: bot.id, origen } });
    if (!accion) { setAviso(problemas.join(" ")); return; }
    const decision = decidirAccion({ bot, accion, rol, nivel });
    if (decision.permitido) { materializar(accion, origen); return; }
    setAviso(decision.motivo);
    setPropuesta(decision.requiere === "confirmacion" ? { accion, origen } : null);
  };

  const marcar = (t: TareaGuardada, criterio: string, ok: boolean) => {
    const por = quienVerifica(t.tarea, t.verif, criterio);
    if (!por) { setAviso("próximamente: falta un bot distinto que verifique este criterio."); return; }
    const base = t.verif?.tareaId === t.tarea.id ? t.verif : verificacionInicial(t.tarea, []);
    const r = marcarCriterio(base, criterio, por, ok, evidencia);
    if ("problemas" in r) { setAviso(r.problemas.join(" ")); return; }
    guardar(t.tarea, r);
    setVerificando(null); setEvidencia(""); setAviso(""); setTareas(listar(bot.id));
  };

  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ListChecks size={18} /> Tareas</h2>
        <button type="button" onClick={() => setCreando((v) => !v)} className={BTN}><Plus size={16} /> Nueva tarea</button>
      </header>
      {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
      {creando && (
        <form onSubmit={crear} className="space-y-2 rounded-lg border border-border p-3">
          <label className="block text-sm">Título <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={CAMPO} aria-label="título de la tarea" /></label>
          <label className="block text-sm">Criterios (uno por línea) <textarea value={criteriosTexto} onChange={(e) => setCriteriosTexto(e.target.value)} className={CAMPO} aria-label="criterios de la tarea" /></label>
          <label className="block text-sm">Origen <select value={origen} onChange={(e) => setOrigen(e.target.value as Tarea["origen"])} className={CAMPO} aria-label="origen de la tarea"><option value="genesis">Genesis</option><option value="poligenesis">PoliGenesis</option></select></label>
          <button type="submit" className={BTN}>Proponer tarea</button>
        </form>
      )}
      {propuesta && (
        <div role="alertdialog" aria-label="Confirmar tarea" className="rounded-lg border border-border p-3 text-sm">
          <p>{aviso} ¿La creo?</p>
          <button type="button" onClick={() => materializar(propuesta.accion, propuesta.origen)} className={`${BTN} mt-2`}>Confirmar tarea</button>
        </div>
      )}
      <ul className="space-y-2">
        {tareas.length === 0 && <li className="text-sm text-muted-foreground">Sin tareas todavía.</li>}
        {tareas.map((t) => (
          <li key={t.tarea.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{t.tarea.titulo}</p>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{ETIQUETA[t.estado]}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {t.tarea.criterios.map((c) => {
                const m = t.verif?.marcas[c];
                const abierto = verificando?.tareaId === t.tarea.id && verificando.criterio === c;
                return (
                  <li key={c} className="rounded-md border border-border/60 p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span>{c}</span>
                      {m?.ok !== true && <button type="button" className={BTN} onClick={() => { setVerificando({ tareaId: t.tarea.id, criterio: c }); setEvidencia(""); setAviso(""); }}>Verificar</button>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m ? `${m.ok ? "cumple" : "no cumple"} · ${m.por.tipo} ${m.por.id}: ${m.evidencia}` : "sin verificar"}</p>
                    {abierto && (
                      <div className="mt-2 space-y-2">
                        <input value={evidencia} onChange={(e) => setEvidencia(e.target.value)} className={CAMPO} placeholder="Evidencia: qué se comprobó y cómo" aria-label={`evidencia de ${c}`} />
                        <div className="flex gap-2">
                          <button type="button" className={BTN} onClick={() => marcar(t, c, true)}>Cumple</button>
                          <button type="button" className={BTN} onClick={() => marcar(t, c, false)}>No cumple</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
