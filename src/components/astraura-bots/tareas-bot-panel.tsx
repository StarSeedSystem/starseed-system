"use client";
/**
 * Panel de TAREAS de un bot (BOT1011X · architecture/astraura-bots.md §8).
 * Lista las tareas del bot director con su estado calculado, enseña cada criterio con su
 * marca (quién y evidencia) y permite verificarlo; «Nueva tarea» pasa por `validarAccion`
 * + `decidirAccion` antes de crear nada. El clic de la persona ES la confirmación cuando la
 * decisión pide confirmación; una votación o un consentimiento nunca se saltan.
 */
import { useState } from "react";
import { Check, Plus, ShieldCheck, X } from "lucide-react";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import type { Bot, EstadoTarea, RolBot } from "@/lib/astraura-bots/tipos";
import { crearTarea, estadoDe, marcarCriterio, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import type { Marca } from "@/lib/astraura-bots/tareas-bot";
import { guardar, listar, type TareaGuardada } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

export interface PropsTareasBot {
  bot: Bot;
  rol?: RolBot;
  nivel?: NivelBot;
  /** Quién verifica: por defecto la persona que usa el panel. */
  verificador?: Marca["por"];
}

const ETIQUETA_ESTADO: Record<EstadoTarea, string> = {
  propuesta: "Propuesta", "en-curso": "En curso", verificando: "Verificando", hecha: "Hecha", rechazada: "Rechazada",
};

const btn = "cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm transition-colors duration-200 hover:bg-muted";
const btnPrimario = "flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-200 hover:opacity-90";
const campo = "mt-1 w-full rounded-md border border-border bg-background px-2 py-1";

export function TareasBotPanel({
  bot, rol = "dueno", nivel = "aplicar", verificador = { tipo: "persona", id: "tú" },
}: PropsTareasBot) {
  const [tareas, setTareas] = useState<TareaGuardada[]>(() => listar(bot.id));
  const [titulo, setTitulo] = useState(""); const [criterios, setCriterios] = useState("");
  const [evidencias, setEvidencias] = useState<Record<string, string>>({}); const [aviso, setAviso] = useState("");

  const refrescar = () => setTareas(listar(bot.id));
  const cosa = (g: TareaGuardada, c: string) => `${g.tarea.id}::${c}`;

  const crear = () => {
    const args = { titulo, criterios: criterios.split("\n").map((c) => c.trim()).filter(Boolean), director: bot.id, origen: "genesis" };
    const bruto = { tipo: "tarea.crear", args };
    const v = validarAccion(bruto);
    if (!v.accion) { setAviso(v.problemas.join(" ")); return; }
    const d = decidirAccion({ bot, accion: v.accion, rol, nivel });
    const humana = rol === "dueno" || rol === "admin";
    if (!d.permitido && !(d.requiere === "confirmacion" && humana)) { setAviso(d.motivo); return; }
    const r = crearTarea(v.accion.args, bot.id, "genesis", String(Date.now()));
    if ("problemas" in r) { setAviso(r.problemas.join(" ")); return; }
    guardar(r, verificacionInicial(r, []));
    setTitulo(""); setCriterios(""); setAviso(""); refrescar();
  };

  const verificar = (g: TareaGuardada, criterio: string) => {
    const v = g.verif ?? verificacionInicial(g.tarea, []);
    const r = marcarCriterio(v, criterio, verificador, true, evidencias[cosa(g, criterio)] ?? "");
    if ("problemas" in r) { setAviso(r.problemas.join(" ")); return; }
    guardar(g.tarea, r); setAviso(""); refrescar();
  };

  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <h2 className="text-lg font-semibold">Tareas de {bot.nombre}</h2>
      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="block text-sm">Título de la tarea
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
        </label>
        <label className="block text-sm">Criterios (uno por línea)
          <textarea value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3} className={campo} />
        </label>
        <button type="button" onClick={crear} className={btnPrimario}>
          <Plus size={16} /> Nueva tarea
        </button>
      </div>
      {aviso && <p role="alert" className="text-sm text-destructive">{aviso}</p>}
      {tareas.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas todavía.</p>}
      <ul className="space-y-2">
        {tareas.map((g) => {
          const estado = estadoDe(g.tarea, g.verif);
          return (<li key={g.tarea.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{g.tarea.titulo}</p>
              <p className="text-xs text-muted-foreground">Estado: {ETIQUETA_ESTADO[estado]} · verifica: {g.tarea.verificador}</p>
              <ul className="mt-2 space-y-2">
                {g.tarea.criterios.map((c) => {
                  const marca = g.verif?.marcas[c];
                  return (<li key={c} className="space-y-1 text-sm">
                      <div className="flex items-start gap-2">
                        {marca
                          ? (marca.ok ? <Check size={16} className="mt-0.5 text-emerald-600" /> : <X size={16} className="mt-0.5 text-destructive" />)
                          : <ShieldCheck size={16} className="mt-0.5 text-muted-foreground" />}
                        <span className="flex-1">{c}</span>
                        <span className="text-xs text-muted-foreground">
                          {marca ? `${marca.por.tipo}: ${marca.por.id} · ${marca.evidencia}` : "Sin verificar"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <input aria-label={`evidencia de ${c}`} value={evidencias[cosa(g, c)] ?? ""}
                          onChange={(e) => setEvidencias((m) => ({ ...m, [cosa(g, c)]: e.target.value }))}
                          placeholder="Qué se comprobó y cómo"
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs" />
                        <button type="button" onClick={() => verificar(g, c)} className={btn} aria-label={`Verificar ${c}`}>
                          Verificar
                        </button>
                      </div>
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
