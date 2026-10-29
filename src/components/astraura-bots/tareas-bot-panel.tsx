"use client";
/**
 * Panel de tareas del bot (BOT1011X): lista con estado, criterios con su marca
 * (quién y evidencia), «Verificar» por criterio (respeta la regla de no
 * autoverificación) y «Nueva tarea» (pasa por `validarAccion({tipo:"tarea.crear"})` + `decidirAccion`).
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { listar, verificarCriterio, crearTareaDesdeAccion, type RegistroTarea } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import { validarAccion, type AccionBot } from "@/lib/astraura-bots/acciones";
import { decidirAccion, type NivelBot } from "@/lib/astraura-bots/permisos";
import type { Bot, Tarea } from "@/lib/astraura-bots/tipos";

const btn =
  "cursor-pointer rounded-md border border-border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted";
const btnPri =
  "cursor-pointer rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors duration-200 hover:opacity-90";

function estadoIcono(e: Tarea["estado"]) {
  if (e === "hecha") return <CheckCircle2 size={14} className="text-green-500" />;
  if (e === "rechazada") return <XCircle size={14} className="text-red-500" />;
  if (e === "verificando" || e === "en-curso") return <AlertCircle size={14} className="text-amber-500" />;
  return <AlertCircle size={14} className="text-muted-foreground" />;
}

export function TareasBotPanel({ bot, onChange }: { bot: Bot; onChange?: (t: Tarea[]) => void }) {
  const [registros, setRegistros] = useState<RegistroTarea[]>(() => listar(bot.id));
  const [mostrar, setMostrar] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [criteriosTxt, setCriteriosTxt] = useState("");
  const [verif, setVerif] = useState<"persona" | "bot" | "pruebas">("persona");
  const [errores, setErrores] = useState<string[]>([]);
  const [verificando, setVerificando] = useState<Record<string, { criterio: string; ok: boolean; evidencia: string }>>({});

  useEffect(() => {
    const r = listar(bot.id);
    setRegistros(r);
    onChange?.(r.map((x) => x.tarea));
  }, [bot.id, onChange]);

  const crear = () => {
    setErrores([]);
    const criterios = criteriosTxt.split("\n").map((s) => s.trim()).filter(Boolean);
    const accion: AccionBot = { tipo: "tarea.crear", args: { titulo: titulo.trim(), criterios, director: bot.id, origen: "genesis", verificador: verif } };
    const v = validarAccion(accion);
    if (!v.accion) {
      setErrores(v.problemas);
      return;
    }
    const nivel: NivelBot = "proponer";
    const decision = decidirAccion({ bot, accion: v.accion, rol: "dueno", nivel });
    if (decision.requiere === "nunca") {
      setErrores([decision.motivo]);
      return;
    }
    const res = crearTareaDesdeAccion(bot.id, v.accion.args, "genesis");
    if (!res.ok || !res.tarea) {
      setErrores(res.problemas || ["No se pudo crear."]);
      return;
    }
    setTitulo("");
    setCriteriosTxt("");
    setMostrar(false);
    const r = listar(bot.id);
    setRegistros(r);
    onChange?.(r.map((x) => x.tarea));
  };

  const marcar = (tareaId: string, criterio: string) => {
    const k = `${tareaId}:${criterio}`;
    const m = verificando[k];
    if (!m) return;
    const res = verificarCriterio(bot.id, tareaId, criterio, m.ok, m.evidencia);
    if (!res.ok) {
      setErrores(res.problemas || ["No se pudo verificar."]);
      return;
    }
    setErrores([]);
    setVerificando((s) => { const n = { ...s }; delete n[k]; return n; });
    const r = listar(bot.id);
    setRegistros(r);
    onChange?.(r.map((x) => x.tarea));
  };

  const items = useMemo(() => registros.slice().reverse(), [registros]);

  return (
    <section aria-label="Tareas del bot" className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tareas</h3>
        <button type="button" onClick={() => setMostrar((s) => !s)} className={btnPri}>
          <span className="flex items-center gap-1"><Plus size={14} /> Nueva tarea</span>
        </button>
      </header>
      {mostrar && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs" />
          <textarea value={criteriosTxt} onChange={(e) => setCriteriosTxt(e.target.value)} placeholder={"Criterios (uno por línea)"} rows={3} className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs" />
          <select value={verif} onChange={(e) => setVerif(e.target.value as any)} className="rounded-md border border-border bg-transparent px-2 py-1 text-xs">
            <option value="persona">Verificador: persona</option>
            <option value="bot">Verificador: bot</option>
            <option value="pruebas">Verificador: pruebas</option>
          </select>
          {errores.length > 0 && <p className="text-xs text-red-500">{errores[0]}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMostrar(false)} className={btn}>Cancelar</button>
            <button type="button" onClick={crear} className={btnPri}>Crear</button>
          </div>
        </div>
      )}
      {items.length === 0 && <p className="text-xs text-muted-foreground">Sin tareas.</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.tarea.id} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {estadoIcono(r.tarea.estado)}
                <p className="text-xs font-medium">{r.tarea.titulo}</p>
              </div>
              <span className="text-xs text-muted-foreground">{r.tarea.estado}</span>
            </div>
            <ul className="mt-1 space-y-1">
              {r.tarea.criterios.map((c) => {
                const marca = r.marcas?.[c];
                const k = `${r.tarea.id}:${c}`;
                const m = verificando[k];
                return (
                  <li key={c} className="rounded-md bg-muted/30 p-1.5">
                    <p className="text-xs">{c}</p>
                    {marca ? (
                      <p className="mt-1 text-xs text-muted-foreground">Verificado por {marca.porId} · {marca.ok ? "OK" : "NO"} · {marca.evidencia}</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input value={m?.evidencia || ""} onChange={(e) => setVerificando((s) => ({ ...s, [k]: { ...(m||{criterio:c,ok:true,evidencia:""}), evidencia: e.target.value } }))} placeholder="Evidencia" className="flex-1 rounded-md border border-border bg-transparent px-2 py-0.5 text-xs" />
                        <button type="button" onClick={() => setVerificando((s) => ({ ...s, [k]: { ...(m||{criterio:c,evidencia:""}), ok: true } }))} className={m?.ok === true ? btnPri : btn}>OK</button>
                        <button type="button" onClick={() => setVerificando((s) => ({ ...s, [k]: { ...(m||{criterio:c,evidencia:""}), ok: false } }))} className={m?.ok === false ? btnPri : btn}>No</button>
                        <button type="button" onClick={() => marcar(r.tarea.id, c)} className={btn}>Verificar</button>
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
