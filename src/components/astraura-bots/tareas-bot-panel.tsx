"use client";
/** Tareas de un bot (BOT1011X · contrato §8): estado, marcas con evidencia, «Verificar» sin
 *  autoverificación y «Nueva tarea» por `validarAccion` + `decidirAccion`; si pide confirmación,
 *  se propone y la persona confirma antes de guardar. */
import { useEffect, useState } from "react";
import { Check, ListChecks, Plus, X } from "lucide-react";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import { crearTarea, estadoDe, marcarCriterio, verificacionInicial, type EstadoVerificacion, type Marca } from "@/lib/astraura-bots/tareas-bot";
import type { Bot, EstadoTarea, RolBot, Tarea } from "@/lib/astraura-bots/tipos";
import { guardar, listar, suscribirTareas, type TareaGuardada } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

const ETIQUETA: Record<EstadoTarea, string> = {
  propuesta: "propuesta", "en-curso": "en curso", verificando: "verificando", hecha: "hecha", rechazada: "rechazada",
};
const btn = "ml-2 cursor-pointer rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted";
const campo = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";

/** Quién puede verificar ese criterio; `null` si no consta (un bot no se verifica a sí mismo). */
function quienVerifica(t: Tarea, v: EstadoVerificacion | undefined, criterio: string, cuentaId: string): Marca["por"] | null {
  if (t.verificador === "persona") return cuentaId ? { tipo: "persona", id: cuentaId } : null;
  if (t.verificador === "pruebas") return { tipo: "pruebas", id: "pruebas" };
  const otro = t.agentes.find((a) => a !== t.director && a !== v?.hechoPor[criterio]);
  return otro ? { tipo: "bot", id: otro } : null;
}

export function TareasBotPanel({ bot, rol = "dueno", nivel = NIVEL_POR_DEFECTO, origen = "genesis", cuentaId = bot.dueno.cuentaId }: {
  bot: Bot; rol?: RolBot; nivel?: NivelBot; origen?: "genesis" | "poligenesis"; cuentaId?: string;
}) {
  const [tareas, setTareas] = useState<TareaGuardada[]>(() => listar(bot.id));
  const [titulo, setTitulo] = useState("");
  const [criterios, setCriterios] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<Tarea | null>(null);
  const [verificando, setVerificando] = useState<{ tareaId: string; criterio: string } | null>(null);
  const [evidencia, setEvidencia] = useState("");

  useEffect(() => {
    const quitar = suscribirTareas(() => setTareas(listar(bot.id)));
    return () => quitar();
  }, [bot.id]);

  const guardarTarea = (t: Tarea) => {
    guardar(t, verificacionInicial(t, []));
    setTareas(listar(bot.id)); setTitulo(""); setCriterios(""); setPropuesta(null); setAviso(null);
  };
  const crear = () => {
    const lista = criterios.split(/\n+/).map((c) => c.trim()).filter(Boolean);
    const { accion, problemas } = validarAccion({
      tipo: "tarea.crear", args: { titulo, criterios: lista, director: bot.id, origen, verificador: "persona" },
    });
    if (!accion) { setAviso(problemas.join(" ")); return; }
    const res = crearTarea(accion.args, bot.id, origen, String(tareas.length));
    if ("problemas" in res) { setAviso(res.problemas.join(" ")); return; }
    const decision = decidirAccion({ bot, accion, rol, nivel });
    if (decision.permitido) { guardarTarea(res); return; }
    setAviso(decision.motivo); setPropuesta(decision.requiere === "confirmacion" ? res : null);
  };
  const marcar = (g: TareaGuardada, criterio: string, ok: boolean) => {
    const por = quienVerifica(g.tarea, g.verificacion, criterio, cuentaId);
    if (!por) { setAviso("próximamente: falta otro bot que verifique este criterio."); return; }
    const res = marcarCriterio(g.verificacion ?? verificacionInicial(g.tarea, []), criterio, por, ok, evidencia);
    if ("problemas" in res) { setAviso(res.problemas.join(" ")); return; }
    guardar(g.tarea, res);
    setTareas(listar(bot.id)); setVerificando(null); setEvidencia(""); setAviso(null);
  };

  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ListChecks size={18} /> Tareas de {bot.nombre}</h2>
      {tareas.length === 0 && <p className="text-sm text-muted-foreground">Este bot aún no tiene tareas.</p>}
      <ul className="space-y-2">
        {tareas.map((g) => (
          <li key={g.tarea.id} className="rounded-lg border border-border p-3">
            <p className="font-medium">
              {g.tarea.titulo} <span className="text-xs text-muted-foreground">· {ETIQUETA[estadoDe(g.tarea, g.verificacion)]}</span>
            </p>
            <ul className="mt-2 space-y-2">
              {g.tarea.criterios.map((c) => {
                const marca = g.verificacion?.marcas[c], por = quienVerifica(g.tarea, g.verificacion, c, cuentaId);
                const abierto = verificando?.tareaId === g.tarea.id && verificando.criterio === c;
                return (
                  <li key={c} className="text-sm">
                    <span>{c}</span>
                    {marca && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {marca.ok ? "cumple" : "no cumple"} · {marca.por.tipo}:{marca.por.id} · {marca.evidencia}
                      </span>
                    )}
                    {abierto ? (
                      <span className="mt-1 flex items-center gap-1">
                        <input aria-label={`Evidencia para ${c}`} value={evidencia} onChange={(e) => setEvidencia(e.target.value)} className={campo} />
                        <button type="button" className={btn} aria-label={`Cumple ${c}`} onClick={() => marcar(g, c, true)}><Check size={14} /> Cumple</button>
                        <button type="button" className={btn} aria-label={`No cumple ${c}`} onClick={() => marcar(g, c, false)}><X size={14} /> No cumple</button>
                      </span>
                    ) : por ? (
                      <button type="button" className={btn} aria-label={`Verificar ${c}`} onClick={() => { setVerificando({ tareaId: g.tarea.id, criterio: c }); setEvidencia(""); }}>Verificar</button>
                    ) : (
                      <span className="ml-2 text-xs text-muted-foreground">próximamente: falta otro bot que verifique</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); crear(); }}>
        <p className="text-sm font-medium">Nueva tarea (director: {bot.nombre})</p>
        <input aria-label="Título de la tarea" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
        <textarea aria-label="Criterios de la tarea" placeholder="Un criterio comprobable por línea" value={criterios} onChange={(e) => setCriterios(e.target.value)} className={campo} />
        <button type="submit" className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-200 hover:opacity-90">
          <Plus size={16} /> Nueva tarea
        </button>
        {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
        {propuesta && <button type="button" className={btn} onClick={() => guardarTarea(propuesta)}>Confirmar y crear</button>}
      </form>
    </section>
  );
}
