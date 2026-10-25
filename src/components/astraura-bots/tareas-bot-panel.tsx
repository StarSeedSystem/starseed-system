"use client";
/** Lista de tareas de un bot (BOT1011X · architecture/astraura-bots.md §8). Genesis y PoliGenesis:
 * estado, criterios con su marca (quién y evidencia), «Verificar» por criterio (nunca quien lo hizo)
 * y «Nueva tarea», que pasa por `validarAccion` + `decidirAccion` + el bucle. */
import { useState } from "react";
import { Check, Plus, ShieldCheck } from "lucide-react";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { bucleInicial, avanzar, type EstadoBucle } from "@/lib/astraura-bots/bucle";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import { crearTarea, estadoDe, marcarCriterio, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import type { Bot, RolBot, Tarea } from "@/lib/astraura-bots/tipos";
import { ETIQUETA_ESTADO, guardar, listar, puedeVerificar, quienVerifica, type EntradaTarea, type Quien } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

export interface PropsTareasBot {
  bot: Bot;
  personaId?: string;
  verificadorBot?: string;
  rol?: RolBot;
  nivel?: NivelBot;
  origen?: Tarea["origen"];
}

const ahora = () => Date.now();

export function TareasBotPanel(props: PropsTareasBot) {
  const { bot } = props;
  const [tareas, setTareas] = useState<EntradaTarea[]>(() => listar(bot.id));
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState("");
  const [bucle, setBucle] = useState<EstadoBucle>(() => bucleInicial(bot.id));
  const [pendiente, setPendiente] = useState<Tarea | null>(null);
  const quien: Quien = { personaId: props.personaId ?? bot.dueno.cuentaId, verificadorBot: props.verificadorBot ?? bot.id };
  const origen = props.origen ?? "genesis";

  const refrescar = () => setTareas(listar(bot.id));
  const aplicar = (tarea: Tarea, estado: EstadoBucle) => {
    guardar(tarea);
    setBucle(avanzar(estado, { tipo: "aplicada", previo: { idCreado: tarea.id }, at: ahora() }));
    refrescar(); setTitulo(""); setTexto(""); setPendiente(null);
    setAviso(`Tarea «${tarea.titulo}» creada.`);
  };
  const crear = () => {
    const criterios = texto.split("\n").map((c) => c.trim()).filter(Boolean);
    const { accion, problemas } = validarAccion({ tipo: "tarea.crear", args: { titulo, criterios, director: bot.id, origen } });
    if (!accion) { setAviso(problemas.join(" ")); return; }
    const decision = decidirAccion({ bot, accion, rol: props.rol ?? "dueno", nivel: props.nivel ?? NIVEL_POR_DEFECTO });
    const paso = avanzar(bucle, { tipo: "proponer", accion, decision, at: ahora() });
    setBucle(paso);
    const creada = crearTarea(accion.args, bot.id, origen);
    if ("problemas" in creada) { setAviso(creada.problemas.join(" ")); return; }
    if (paso.fase === "actuando") { aplicar(creada, paso); return; }
    if (paso.fase === "esperando") { setPendiente(creada); setAviso(`Lo propone: ${decision.motivo} Pulsa «Confirmar y crear».`); return; }
    setAviso(decision.motivo);
  };
  const confirmar = () => {
    if (pendiente) aplicar(pendiente, avanzar(bucle, { tipo: "confirmar", quien: quien.personaId, at: ahora() }));
  };
  const verificar = (entrada: EntradaTarea, criterio: string, clave: string) => {
    const base = entrada.verif ?? verificacionInicial(entrada.tarea, []);
    const marca = marcarCriterio(base, criterio, quienVerifica(entrada.tarea, quien), true, evidencias[clave] ?? "");
    if ("problemas" in marca) { setAviso(marca.problemas.join(" ")); return; }
    guardar({ ...entrada.tarea, estado: estadoDe(entrada.tarea, marca) }, marca);
    refrescar(); setAviso(`«${criterio}» verificado con evidencia.`);
  };

  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <header className="flex items-center justify-between"><h3 className="text-base font-semibold">Tareas de {bot.nombre}</h3>
        <ShieldCheck size={18} className="text-muted-foreground" aria-hidden /></header>
      {tareas.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay tareas.</p>}
      <ul className="space-y-2">
        {tareas.map((e) => {
          const estado = estadoDe(e.tarea, e.verif);
          return (
            <li key={e.tarea.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2"><p className="font-medium">{e.tarea.titulo}</p>
                <span className="text-xs text-muted-foreground" data-estado={estado}>{ETIQUETA_ESTADO[estado]}</span></div>
              <ul className="space-y-1">
                {e.tarea.criterios.map((c) => {
                  const clave = `${e.tarea.id}::${c}`, marca = e.verif?.marcas[c], vale = puedeVerificar(e, c, quien);
                  const resumen = marca ? `${marca.ok ? "cumple" : "no cumple"} · ${marca.por.tipo} ${marca.por.id}: ${marca.evidencia}` : vale ? "sin verificar" : "no puede verificarlo quien lo hizo";
                  return (
                    <li key={c} className="text-sm">
                      <p>{c}</p>
                      <p className="text-xs text-muted-foreground">{resumen}</p>
                      {!marca?.ok && <div className="mt-1 flex gap-2">
                        <input aria-label={`Evidencia para ${c}`} value={evidencias[clave] ?? ""} placeholder="Qué comprobaste y cómo"
                          onChange={(ev) => setEvidencias((m) => ({ ...m, [clave]: ev.target.value }))}
                          className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs" />
                        <button type="button" disabled={!vale} onClick={() => verificar(e, c, clave)}
                          className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                          <Check size={14} /> Verificar
                        </button>
                      </div>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <form className="space-y-2 rounded-lg border border-dashed border-border p-3" onSubmit={(ev) => { ev.preventDefault(); crear(); }}>
        <input aria-label="Título de la tarea" value={titulo} onChange={(ev) => setTitulo(ev.target.value)} placeholder="Título de la tarea"
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm" />
        <textarea aria-label="Criterios comprobables" value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Un criterio por línea" rows={2}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm" />
        <div className="flex items-center justify-between gap-2">
          <span role="status" className="text-xs text-muted-foreground">{aviso}</span>
          {pendiente && <button type="button" onClick={confirmar} className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted">Confirmar y crear</button>}
          <button type="submit" className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-200 hover:opacity-90">
            <Plus size={16} /> Nueva tarea
          </button>
        </div>
      </form>
    </section>
  );
}
