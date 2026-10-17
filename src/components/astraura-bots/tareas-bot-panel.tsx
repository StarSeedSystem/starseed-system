"use client";
import { useState } from "react";
import { Tarea } from "@/lib/astraura-bots/tipos";
import { listar, guardar, verificarCriterio as verificarCriterioStorage, obtenerVerificaciones } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import { validarAccion, decidirAccion } from "@/lib/astraura-bots/acciones";
import { Bot } from "@/lib/astraura-bots/tipos>;
import { NIVEL_POR_DEFECTO } from "@/lib/astraura-bots/permisos>;
export function TareasBotPanel({ bot }: { bot: Bot }) {
  const [nt, setNT] = useState<{t:string;c:string[]}>({t:"",c:["","",""]});
  const [e, setE] = useState<string|null>(null);
   const hT = (e: React.ChangeEvent<HTMLInputElement>) => setNT(p => ({ ...p, t: e.target.value }));
  const hC = (i: number, e: React.ChangeEvent<HTMLInputElement>) => setNT(p => {
    const c = [...p.c];
    c[i] = e.target.value;
    return { ...p, c };
  });
  const hS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nt.t.trim()) { setE("Título vacío"); return; }
    if (!nt.c.some(c => c.trim())) { setE("Criterio vacío"); return; }
    const a = { tipo: "tarea.crear", args: { t: nt.t.trim(), c: nt.c.map(c => c.trim()), d: bot.id, o: "genesis" } };
    const va = validarAccion(a);
    if (va.problemas.length > 0) { setE("Acción inválida: " + va.problemas.join(", ")); return; }
    const d = decidirAccion({ bot, accion: va.accion!, r: "dueno", n: NIVEL_POR_DEFECTO });
    if (!d.permitido) { setE("No permitido: " + d.motivo); return; }
    const tarea: Tarea = { id: `tarea:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`, t: nt.t.trim(), d: bot.id, a: [], c: nt.c.map(c => c.trim()), v: "persona", o: "genesis", s: "propuesta" };
    guardar(tarea, false);
    setNT({ t: "", c: ["","",""] });
    setE(null);
  };
  const hV = async (tid: string, i: number) => {
    try {
      await verificarCriterioStorage(tid, i, bot.dueno.id);
    } catch (err) {
      console.error(err);
      setE("Error");
    }
  };

  if (e) return <div className="text-red-500 p-2">{e}</div>;

  const ts = listar(bot.id);
  const v = obtenerVerificaciones(bot.id);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="font-medium mb-2">Nueva tarea</h3>
        <form onSubmit={hS} className="space-y-2">
          <input
            type="text"
            value={nt.t}
            onChange={hT}
            className="w-full px-3 py-2 border rounded"
            placeholder="Título"
          />
          {nt.c.map((c, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={c}
                onChange={(e) => hC(i, e)}
                className="flex-1 px-3 py-2 border rounded"
                placeholder={`Criterio ${i+1}`}
              />
            )
          ))}
          <button
            type="submit"
            className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={!nt.t.trim() || !nt.c.some(c => c.trim())}
          >
            Crear tarea
          </button>
        </form>
      </div>

      <div>
        <h3 className="font-medium mb-2">Tareas</h3>
        {ts.length === 0 ? (
          <p className="text-gray-500">Ninguna tarea</p>
        ) : (
          <ul className="space-y-3">
            {ts.map(t => (
              <li key={t.id} className="border p-3 rounded">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold">{t.titulo}</h4>
                  <span className="text-xs text-gray-500">{t.s}</span>
                </div>
                <div className="space-y-2">
                  {t.c.map((c, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="flex-1">{c}</span>
                      {ts.id]?.[i] ? (
                        <>
                          <span className="text-green-600">✓</span>
                          <span className="text-xs text-gray-500">
                            {(new Date(ts.id]![i].t)).toLocaleTimeString()}
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => hV(t.id, i)}
                          className="cursor-pointer px-2 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                        >
                          Verificar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}