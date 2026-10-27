"use client";
/**
 * Panel de tareas del bot (BOT1011X · architecture/astraura-bots.md §8).
 * Lista las tareas del bot con su estado y sus criterios (quién los marcó y con
 * qué evidencia), deja verificar cada criterio —la regla de no autoverificación
 * la impone `marcarCriterio`— y crear tareas que pasan por `validarAccion` +
 * `decidirAccion` antes de guardarse. Montaje en `panel-bots.tsx`: pendiente.
 */
import { useEffect, useState } from "react";
import { Check, ListChecks, Plus, X } from "lucide-react";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { NIVEL_POR_DEFECTO, decidirAccion, type Decision, type NivelBot } from "@/lib/astraura-bots/permisos";
import { crearTarea, marcarCriterio, verificacionInicial, type Marca } from "@/lib/astraura-bots/tareas-bot";
import type { Bot, RolBot, Tarea } from "@/lib/astraura-bots/tipos";
import { guardar, listar, suscribirTareas, type TareaConEstado } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

const ETIQUETA: Record<Tarea["estado"], string> = {
  propuesta: "propuesta", "en-curso": "en curso", verificando: "verificando", hecha: "hecha", rechazada: "rechazada",
};
const BOTON = "cursor-pointer rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted";
const CAMPO = "w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm";

export interface PropsTareasBot {
  bot: Bot;
  nivel?: NivelBot;
  rol?: RolBot;
  /** Quién verifica; por defecto, la persona dueña de la cuenta. */
  verificador?: Marca["por"];
}

export function TareasBotPanel({ bot, nivel = NIVEL_POR_DEFECTO, rol = "dueno", verificador }: PropsTareasBot) {
  const [tareas, setTareas] = useState<TareaConEstado[]>([]);
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [criterios, setCriterios] = useState("");
  const [pendiente, setPendiente] = useState<{ tarea: Tarea; decision: Decision } | null>(null);
  const quien: Marca["por"] = verificador ?? { tipo: "persona", id: bot.dueno.cuentaId };

  useEffect(() => {
    setTareas(listar(bot.id));
    return suscribirTareas(() => setTareas(listar(bot.id)));
  }, [bot.id]);

  const recargar = () => setTareas(listar(bot.id));
  const marcar = (e: TareaConEstado, criterio: string, ok: boolean) => {
    const base = e.verif && e.verif.tareaId === e.tarea.id ? e.verif : verificacionInicial(e.tarea, []);
    const r = marcarCriterio(base, criterio, quien, ok, evidencias[`${e.tarea.id}:${criterio}`] ?? "");
    if ("problemas" in r) {
      setAviso(r.problemas.join(" "));
      return;
    }
    guardar(e.tarea, r);
    setAviso(null);
    recargar();
  };
  const crear = () => {
    const origen = bot.dueno.tipo === "perfil" ? "genesis" : "poligenesis";
    const { accion, problemas } = validarAccion({
      tipo: "tarea.crear",
      args: { titulo, criterios: criterios.split("\n").map((c) => c.trim()).filter(Boolean), director: bot.id, origen },
    });
    if (!accion) {
      setAviso(problemas.join(" "));
      return;
    }
    const tarea = crearTarea(accion.args, bot.id, origen);
    if ("problemas" in tarea) {
      setAviso(tarea.problemas.join(" "));
      return;
    }
    const decision = decidirAccion({ bot, accion, rol, nivel });
    if (decision.permitido) {
      guardar(tarea, verificacionInicial(tarea, []));
      setCreando(false);
      setTitulo("");
      setCriterios("");
      setAviso(null);
      recargar();
    } else if (decision.requiere === "confirmacion" || decision.requiere === "votacion") {
      setPendiente({ tarea, decision });
      setAviso(null);
    } else {
      setAviso(decision.motivo);
    }
  };
  const confirmar = () => {
    if (!pendiente) return;
    guardar(pendiente.tarea, verificacionInicial(pendiente.tarea, []));
    setPendiente(null);
    setCreando(false);
    setTitulo("");
    setCriterios("");
    recargar();
  };

  return (
    <section aria-label="Tareas del bot" className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ListChecks size={18} /> Tareas de {bot.nombre}</h2>
        <button type="button" className={BOTON} onClick={() => setCreando((v) => !v)}><Plus size={14} /> Nueva tarea</button>
      </header>
      {aviso && <p role="alert" className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{aviso}</p>}
      {creando && (
        <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={(ev) => { ev.preventDefault(); crear(); }}>
          <label className="block text-sm">Título
            <input aria-label="Título de la tarea" className={CAMPO} value={titulo} onChange={(ev) => setTitulo(ev.target.value)} />
          </label>
          <label className="block text-sm">Criterios comprobables (uno por línea)
            <textarea aria-label="Criterios de la tarea" className={CAMPO} rows={3} value={criterios} onChange={(ev) => setCriterios(ev.target.value)} />
          </label>
          <button type="submit" className={`${BOTON} bg-primary text-primary-foreground hover:opacity-90`}>Crear tarea</button>
        </form>
      )}
      {pendiente && (
        <div role="alertdialog" aria-label="Confirmar tarea" className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p>{pendiente.decision.motivo} ¿Crear «{pendiente.tarea.titulo}»?</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={BOTON} onClick={() => setPendiente(null)}>Cancelar</button>
            <button type="button" className={BOTON} onClick={confirmar}>Confirmar y crear</button>
          </div>
        </div>
      )}
      {tareas.length === 0 && !creando && <p className="text-sm text-muted-foreground">Este bot no tiene tareas todavía.</p>}
      <ul className="space-y-2">
        {tareas.map((e) => (
          <li key={e.tarea.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{e.tarea.titulo}</p>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">{ETIQUETA[e.estado]}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {e.tarea.criterios.map((criterio) => {
                const marca = e.verif && e.verif.tareaId === e.tarea.id ? e.verif.marcas[criterio] : undefined;
                const clave = `${e.tarea.id}:${criterio}`;
                return (
                  <li key={criterio} className="space-y-1 text-sm">
                    <p>{criterio}</p>
                    {marca && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {marca.ok ? <Check size={12} /> : <X size={12} />}
                        {marca.ok ? "Cumple" : "No cumple"} · {marca.por.tipo} {marca.por.id} · {marca.evidencia}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                      <input aria-label={`Evidencia de ${criterio}`} className={`${CAMPO} min-w-0 flex-1 text-xs`}
                        placeholder="Qué comprobaste y cómo" value={evidencias[clave] ?? ""}
                        onChange={(ev) => setEvidencias((m) => ({ ...m, [clave]: ev.target.value }))} />
                      <button type="button" className={BOTON} onClick={() => marcar(e, criterio, true)}>Verificar</button>
                      <button type="button" className={BOTON} onClick={() => marcar(e, criterio, false)}>No cumple</button>
                    </div>
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
