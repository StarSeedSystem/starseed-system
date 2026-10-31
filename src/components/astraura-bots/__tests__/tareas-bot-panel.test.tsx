// Pruebas rescatadas de la rama archivada `nube/a1-20261031-020543-BOT1011X` (tarea HFR1018L).
// La rana probaba un PANEL React («tareas-bot-panel») que en main no existe: la lógica vive en
// el módulo puro `@/lib/astraura-bots/tareas-bot` (crearTarea, asignarPasos, marcarCriterio,
// estadoDe). Aquí quedan solo los casos de la rama que main no cubría, adaptados a esa API.
import { describe, expect, it } from "vitest";
import { asignarPasos, crearTarea, marcarCriterio, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import type { AgenteTarea, EstadoVerificacion, Paso, Problemas, Verificador } from "@/lib/astraura-bots/tareas-bot";
import type { Tarea } from "@/lib/astraura-bots/tipos";

const CRITERIOS = ["Las imágenes cargan", "El enlace del pie lleva al menú"];
const AGENTES: AgenteTarea[] = [
  { id: "ana", capacidades: ["Cargar imágenes en la página"] },
  { id: "pie", capacidades: ["Enlace del menú de la página"] },
];

/** Desenvuelve un resultado y, si trae problemas, la prueba falla diciendo cuáles. */
function sin<T extends object>(r: T | Problemas): T {
  if ("problemas" in r && Array.isArray(r.problemas)) throw new Error(r.problemas.join(" "));
  return r as T;
}
const tarea = (extra: Record<string, unknown> = {}): Tarea =>
  sin(crearTarea({ titulo: "Página del café", criterios: CRITERIOS, ...extra }, "director", "genesis"));
const repartir = (t: Tarea): { tarea: Tarea; pasos: Paso[] } => sin(asignarPasos(t, AGENTES));
const marca = (tipo: Verificador, id: string): { tipo: Verificador; id: string } => ({ tipo, id });

describe("casos rescatados: verificación de tareas con evidencia", () => {
  /** Verificación con el reparto de pasos ya hecho. */
  const conPasos = (extra: Record<string, unknown> = {}): { tarea: Tarea; v: EstadoVerificacion } => {
    const { tarea: t, pasos } = repartir(tarea(extra));
    return { tarea: t, v: verificacionInicial(t, pasos) };
  };

  it("una marca válida deja constancia de quién hizo la marca y de su evidencia (rama: «Verificar» con quién y evidencia)", () => {
    const { tarea: t, v } = conPasos();
    const marcada = sin(marcarCriterio(v, CRITERIOS[0], marca("persona", "ana"), true, "Vi las imágenes en Genesis"));
    expect(marcada.marcas[CRITERIOS[0]]).toEqual({
      por: { tipo: "persona", id: "ana" },
      ok: true,
      evidencia: "Vi las imágenes en Genesis",
    });
    expect(marcada.marcas[CRITERIOS[1]]).toBeUndefined();
  });

  it("sin evidencia no marca nada y lo explica (rama: «sin evidencia») — incluida una tarea verificada por bot", () => {
    const { v } = conPasos();
    const sinEvidencia = marcarCriterio(v, CRITERIOS[0], marca("persona", "ana"), true, "   ");
    expect("problemas" in sinEvidencia && sinEvidencia.problemas[0]).toMatch(/Toda marca lleva su evidencia/);
    expect("problemas" in sinEvidencia).toBe(true);
    expect(v.marcas).toEqual({});

    const { v: vBot } = conPasos({ verificador: "bot" });
    const enVacia = marcarCriterio(vBot, CRITERIOS[0], marca("bot", "pie"), true, "");
    expect("problemas" in enVacia && enVacia.problemas.join(" ")).toMatch(/Toda marca lleva su evidencia/);
    expect("problemas" in enVacia).toBe(true);
  });

  it("una tarea verificada por bot rechaza a otro tipo de verificador con su explicación (rama: «Esta tarea la verifica: bot.»)", () => {
    const { tarea: t, v } = conPasos({ verificador: "bot" });
    const ajena = marcarCriterio(v, CRITERIOS[0], marca("persona", "ana"), true, "Lo comprobé");
    expect("problemas" in ajena && ajena.problemas[0]).toBe("Esta tarea la verifica: bot.");
    expect("problemas" in ajena).toBe(true);
    // La tarea sigue verificada por bot y sin marcas dentro del estado.
    expect(t.verificador).toBe("bot");
    expect(v.marcas).toEqual({});
  });
});
