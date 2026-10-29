"use client";
/**
 * Panel de TAREAS de un bot (BOT1011X · contrato architecture/astraura-bots.md §8).
 * Lista las tareas con su estado y cada criterio con su marca (quién y evidencia).
 * «Verificar» marca un criterio sin saltarse la regla de no autoverificación; «Nueva tarea»
 * pasa por `validarAccion` y `decidirAccion` antes de guardar. Español claro, iconos Lucide.
 */
import { useEffect, useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import type { Bot, Tarea } from "@/lib/astraura-bots/tipos";
import { NIVEL_POR_DEFECTO, decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import { validarAccion } from "@/lib/astraura-bots/acciones";
import { crearTarea, estadoDe, marcarCriterio, verificacionInicial, type Marca } from "@/lib/astraura-bots/tareas-bot";
import { guardar, listar, suscribirTareas, type RegistroTarea } from "@/lib/astraura-bots/adaptadores/almacen-tareas";

const ESTADO_TAREA: Record<Tarea["estado"], string> = {
  propuesta: "Propuesta", "en-curso": "En curso", verificando: "Verificando", hecha: "Hecha", rechazada: "Rechazada",
};
export interface PropsTareasBot {
  bot: Bot; rol?: "dueno" | "admin" | "miembro" | "observador" | "invitado";
  nivel?: NivelBot; origen?: Tarea["origen"]; verificadorBotId?: string;
}
function porDe(tarea: Tarea, verificadorBotId: string | undefined, cuentaId: string): Marca["por"] | null {
  if (tarea.verificador === "persona") return { tipo: "persona", id: cuentaId };
  if (tarea.verificador === "pruebas") return { tipo: "pruebas", id: "pruebas" };
  return verificadorBotId ? { tipo: "bot", id: verificadorBotId } : null;
}
export function TareasBotPanel({
  bot, rol = "dueno", nivel = NIVEL_POR_DEFECTO, origen = "genesis", verificadorBotId,
}: PropsTareasBot) {
  const [registros, setRegistros] = useState<RegistroTarea[]>(() => listar(bot.id));
  const [creando, setCreando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [criterios, setCriterios] = useState("");
  const [porConfirmar, setPorConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verificando, setVerificando] = useState<{ tareaId: string; criterio: string } | null>(null);
  const [evidencia, setEvidencia] = useState("");
  useEffect(() => {
    const recargar = () => setRegistros(listar(bot.id));
    recargar();
    return suscribirTareas(recargar);
  }, [bot.id]);
  const crear = (confirmado = false) => {
    const lista = criterios.split("\n").map((c) => c.trim()).filter(Boolean);
    const v = validarAccion({ tipo: "tarea.crear", args: { titulo: titulo.trim(), criterios: lista, director: bot.id, origen } });
    if (!v.accion) { setAviso(v.problemas.join(" ")); return; }
    const d = decidirAccion({ bot, accion: v.accion, rol, nivel });
    if (!d.permitido && !(confirmado && d.requiere === "confirmacion")) {
      setAviso(d.motivo); setPorConfirmar(d.requiere === "confirmacion"); return;
    }
    const t = crearTarea({ ...v.accion.args }, bot.id, origen);
    if ("problemas" in t) { setAviso(t.problemas.join(" ")); return; }
    guardar(t, verificacionInicial(t, []));
    setTitulo(""); setCriterios(""); setCreando(false); setPorConfirmar(false); setAviso(null);
  };
  const marcar = (reg: RegistroTarea, criterio: string, ok: boolean) => {
    const por = porDe(reg.tarea, verificadorBotId, bot.dueno.cuentaId);
    if (!por) { setAviso("Próximamente: falta un bot verificador para esta tarea."); return; }
    const r = marcarCriterio(reg.verif ?? verificacionInicial(reg.tarea, []), criterio, por, ok, evidencia);
    if ("problemas" in r) { setAviso(r.problemas.join(" ")); return; }
    guardar(reg.tarea, r); setVerificando(null); setEvidencia(""); setAviso(null);
  };
  return (
    <section aria-label={`Tareas de ${bot.nombre}`} className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ListChecks size={18} /> Tareas de {bot.nombre}</h2>
        <button type="button" onClick={() => { setCreando(!creando); setPorConfirmar(false); setAviso(null); }}
          className="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors duration-200 hover:opacity-90">
          <Plus size={16} /> Nueva tarea
        </button>
      </header>
      {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
      {creando && (
        <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); crear(porConfirmar); }}>
          <label className="block text-sm">Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} required
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1" /></label>
          <label className="block text-sm">Criterios (uno por línea)<textarea value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1" /></label>
          <label className="block text-sm">Verifica<select value={verificador} onChange={(e) => setVerificador(e.target.value as Tarea["verificador"])}
            className="mt-1 rounded-md border border-border bg-background px-2 py-1">
            <option value="persona">Persona</option><option value="bot">Otro bot</option><option value="pruebas">Pruebas</option>
          </select></label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setCreando(false); setPorConfirmar(false); }}
              className="cursor-pointer rounded-md border border-border px-3 py-1.5 transition-colors duration-200 hover:bg-muted">Cancelar</button>
            <button type="submit" className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-primary-foreground transition-colors duration-200 hover:opacity-90">
              {porConfirmar ? "Confirmar y crear" : "Crear tarea"}
            </button>
          </div>
        </form>
      )}
      {registros.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este bot no tiene tareas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {registros.map((reg) => {
            const estado = estadoDe(reg.tarea, reg.verif);
            return (
              <li key={reg.tarea.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{reg.tarea.titulo}</p>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{ESTADO_TAREA[estado]}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {reg.tarea.criterios.map((criterio) => {
                    const marca = reg.verif?.marcas[criterio];
                    const activo = verificando?.tareaId === reg.tarea.id && verificando.criterio === criterio;
                    return (
                      <li key={criterio} className="text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span>{criterio}</span>
                          <button type="button" className="cursor-pointer text-xs text-primary transition-colors duration-200 hover:underline"
                            onClick={() => { setVerificando({ tareaId: reg.tarea.id, criterio }); setEvidencia(""); setAviso(null); }}>Verificar</button>
                        </div>
                        {marca && <p className="text-xs text-muted-foreground">{marca.ok ? "Cumple" : "No cumple"} · {marca.por.tipo} {marca.por.id} · {marca.evidencia}</p>}
                        {activo && (
                          <div className="mt-1 flex flex-wrap items-end gap-2">
                            <label className="text-xs">Evidencia<input value={evidencia} onChange={(e) => setEvidencia(e.target.value)}
                              className="ml-1 rounded-md border border-border bg-background px-2 py-1" /></label>
                            <button type="button" className="cursor-pointer rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground" onClick={() => marcar(reg, criterio, true)}>Cumple</button>
                            <button type="button" className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs" onClick={() => marcar(reg, criterio, false)}>No cumple</button>
                            <button type="button" className="cursor-pointer text-xs text-muted-foreground" onClick={() => setVerificando(null)}>Cancelar</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
