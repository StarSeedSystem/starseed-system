"use client";
/**
 * Tareas del bot (BOT1011X · architecture/astraura-bots.md §8): lista con su
 * estado real (derivado de la verificación), criterios con quién y qué se
 * comprobó, «Verificar» por criterio (sin autoverificación) y «Nueva tarea»,
 * que pasa por `validarAccion` + `decidirAccion` antes de crearse.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, ListTodo, Plus, ShieldCheck, XCircle } from "lucide-react";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import { crearTarea, estadoDe, marcarCriterio, verificacionInicial, type EstadoVerificacion, type Verificador } from "@/lib/astraura-bots/tareas-bot";
import type { Bot, RolBot, Tarea } from "@/lib/astraura-bots/tipos";
import { guardar, listar, suscribirTareas, type TareaGuardada } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
export interface PropsTareasBot { bot: Bot; cuentaId: string; rol?: RolBot; nivel?: NivelBot; origen?: Tarea["origen"] }
const ETIQUETA: Record<Tarea["estado"], string> = { propuesta: "Propuesta", "en-curso": "En curso", verificando: "Verificando", hecha: "Hecha", rechazada: "Rechazada" };
const COLOR: Record<Tarea["estado"], string> = { propuesta: "text-muted-foreground", "en-curso": "text-sky-400", verificando: "text-amber-400", hecha: "text-emerald-400", rechazada: "text-destructive" };
const btn = "cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const campo = "w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm";
/** Quién marca aquí: persona o pruebas. Un bot no se verifica a sí mismo ni a su director. */
export function verificadorDe(tarea: Tarea, cuentaId: string): { tipo: Verificador; id: string } | null {
  if (tarea.verificador === "persona") return { tipo: "persona", id: cuentaId };
  if (tarea.verificador === "pruebas") return { tipo: "pruebas", id: "vitest" };
  return null;
}
export function puedeVerificar(tarea: Tarea, verif: EstadoVerificacion, criterio: string, quien: { tipo: Verificador; id: string }): boolean {
  if (quien.tipo !== "bot") return true;
  if (quien.id === tarea.director) return false;
  return verif.hechoPor[criterio] !== quien.id;
}
export function TareasBotPanel({
  bot, cuentaId, rol = "dueno", nivel = NIVEL_POR_DEFECTO, origen = "genesis",
}: PropsTareasBot) {
  const [tareas, setTareas] = useState<TareaGuardada[]>(() => listar(bot.id));
  const [titulo, setTitulo] = useState("");
  const [criterios, setCriterios] = useState("");
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    setTareas(listar(bot.id));
    return suscribirTareas(() => setTareas(listar(bot.id)));
  }, [bot.id]);
  const crear = () => {
    const bruto = {
      tipo: "tarea.crear",
      args: { titulo, criterios: criterios.split("\n").map((c) => c.trim()).filter(Boolean), director: bot.id, origen },
    };
    const v = validarAccion(bruto);
    if (!v.accion) return setAviso(v.problemas.join(" "));
    const d = decidirAccion({ bot, accion: v.accion, rol, nivel });
    if (!d.permitido && d.requiere !== "confirmacion") return setAviso(d.motivo);
    const t = crearTarea(v.accion.args, bot.id, origen, String(Date.now()));
    if ("problemas" in t) return setAviso(t.problemas.join(" "));
    guardar(t, verificacionInicial(t, []));
    setTitulo(""); setCriterios(""); setTareas(listar(bot.id));
    setAviso(d.permitido ? "Tarea creada y anotada." : `Tarea creada: ${d.motivo}`);
  };

  const verificar = (g: TareaGuardada, criterio: string) => {
    const quien = verificadorDe(g.tarea, cuentaId);
    if (!quien) return setAviso("próximamente: verificación por otro bot");
    const verif = g.verif ?? verificacionInicial(g.tarea, []);
    if (!puedeVerificar(g.tarea, verif, criterio, quien)) return setAviso("Un bot no verifica lo que él mismo hizo.");
    const r = marcarCriterio(verif, criterio, quien, true, evidencias[`${g.tarea.id}|${criterio}`] ?? "");
    if ("problemas" in r) return setAviso(r.problemas.join(" "));
    guardar(g.tarea, r); setTareas(listar(bot.id));
    setAviso(`Criterio verificado por ${quien.tipo}: ${quien.id}.`);
  };

  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ListTodo size={16} aria-hidden /> Tareas de {bot.nombre}</h3>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="block text-xs text-muted-foreground">Título de la tarea
          <input aria-label="Título de la tarea" className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="block text-xs text-muted-foreground">Criterios (uno por línea)
          <textarea aria-label="Criterios (uno por línea)" className={`${campo} min-h-16`} value={criterios} onChange={(e) => setCriterios(e.target.value)} />
        </label>
        <button type="button" className={`${btn} flex items-center gap-1`} onClick={crear}><Plus size={14} aria-hidden /> Nueva tarea</button>
      </div>
      {aviso ? <p role="status" className="text-xs text-amber-400">{aviso}</p> : null}
      {tareas.length === 0 ? <p className="text-xs text-muted-foreground">Este bot todavía no tiene tareas.</p> : null}
      <ul className="space-y-2">
        {tareas.map((g) => {
          const estado = estadoDe(g.tarea, g.verif), verif = g.verif ?? verificacionInicial(g.tarea, []), quien = verificadorDe(g.tarea, cuentaId);
          return (
            <li key={g.tarea.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{g.tarea.titulo}</p>
                <span className={`text-xs ${COLOR[estado]}`}>{ETIQUETA[estado]}</span>
              </div>
              {!quien ? <p className="text-xs text-muted-foreground">próximamente: verificación por otro bot</p> : null}
              <ul className="space-y-2">
                {g.tarea.criterios.map((c) => {
                  const marca = verif.marcas[c], clave = `${g.tarea.id}|${c}`;
                  return (
                    <li key={c} className="space-y-1 text-xs">
                      <p className="flex items-start gap-1">
                        {marca ? (marca.ok ? <CheckCircle2 size={14} className="text-emerald-400" aria-hidden /> : <XCircle size={14} className="text-destructive" aria-hidden />) : <ShieldCheck size={14} className="text-muted-foreground" aria-hidden />}
                        <span>{c}</span>
                      </p>
                      <p className="text-muted-foreground">{marca ? `${marca.ok ? "Cumple" : "No cumple"} · ${marca.por.tipo}:${marca.por.id} · ${marca.evidencia}` : "Sin verificar"}</p>
                      {quien && puedeVerificar(g.tarea, verif, c, quien) ? (
                        <div className="flex gap-2">
                          <input aria-label={`Evidencia de ${c}`} className={campo} placeholder="Qué se comprobó y cómo" value={evidencias[clave] ?? ""} onChange={(e) => setEvidencias((m) => ({ ...m, [clave]: e.target.value }))} />
                          <button type="button" className={btn} onClick={() => verificar(g, c)}>Verificar</button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
