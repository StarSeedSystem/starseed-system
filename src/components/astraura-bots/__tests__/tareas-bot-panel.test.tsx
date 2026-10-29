/**
 * Pruebas del panel de tareas de un bot (BOT1011X · astraura-bots.md §8) en jsdom.
 * localStorage es el almacén; el espejo a la cuenta (mergeUserPrefs) es best-effort y no se prueba aquí.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Bot, Tarea } from "@/lib/astraura-bots/tipos";
import { crearTarea, verificacionInicial, type Verificador } from "@/lib/astraura-bots/tareas-bot";
import { guardar, listar } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import { TareasBotPanel } from "../tareas-bot-panel";

const BOT_ID = "astraura:perfil-1";
const CRITERIO = "El formulario envía el correo";

function bot(activo = true): Bot {
  return {
    id: BOT_ID, nombre: "Astraura", origen: "astraura", gobierno: "jerarquico",
    dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo,
  };
}

function tarea(criterios = [CRITERIO], verificador: Verificador = "persona"): Tarea {
  const r = crearTarea({ titulo: "Publicar la página", criterios, verificador }, BOT_ID, "genesis");
  if ("problemas" in r) throw new Error(r.problemas.join(" "));
  return { ...r, agentes: ["pintor"], estado: "en-curso" };
}

describe("TareasBotPanel", () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => cleanup());

  it("lista las tareas del bot con su estado y cada criterio sin verificar", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={bot()} />);
    expect(screen.getByText("Publicar la página")).toBeTruthy();
    expect(screen.getByText(/Estado: En curso/)).toBeTruthy();
    expect(screen.getByText(CRITERIO)).toBeTruthy();
    expect(screen.getAllByText("Sin verificar")).toHaveLength(1);
  });

  it("«Nueva tarea» valida la acción y la guarda bajo su bot director", () => {
    render(<TareasBotPanel bot={bot()} />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "Nueva del panel" } });
    fireEvent.change(screen.getByLabelText("Criterios (uno por línea)"), { target: { value: CRITERIO } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(screen.getByText("Nueva del panel")).toBeTruthy();
    const guardadas = listar(BOT_ID);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].verif?.tareaId).toBe(guardadas[0].tarea.id);
  });

  it("un papel observador no crea tareas: la decisión lo impide", () => {
    render(<TareasBotPanel bot={bot()} rol="observador" />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "No debe entrar" } });
    fireEvent.change(screen.getByLabelText("Criterios (uno por línea)"), { target: { value: CRITERIO } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/no cambiar lo compartido/);
    expect(listar(BOT_ID)).toHaveLength(0);
  });

  it("sin criterios comprobables no hay tarea", () => {
    render(<TareasBotPanel bot={bot()} />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "Sin criterios" } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(screen.getByRole("alert").textContent).toMatch(/criterio/);
    expect(listar(BOT_ID)).toHaveLength(0);
  });

  it("verificar guarda quién y la evidencia, y la tarea pasa a hecha", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={bot()} />);
    fireEvent.change(screen.getByLabelText(`evidencia de ${CRITERIO}`), { target: { value: "Probado en Genesis." } });
    fireEvent.click(screen.getByRole("button", { name: `Verificar ${CRITERIO}` }));
    expect(screen.getByText(/persona: tú · Probado en Genesis\./)).toBeTruthy();
    expect(screen.getByText(/Estado: Hecha/)).toBeTruthy();
    expect(listar(BOT_ID)[0].verif?.marcas[CRITERIO].ok).toBe(true);
  });

  it("un bot no verifica lo que él mismo hizo", () => {
    const t = tarea([CRITERIO], "bot");
    const v = verificacionInicial(t, [{ criterio: CRITERIO, agente: "pintor", coincidencias: 1 }]);
    guardar(t, v);
    render(<TareasBotPanel bot={bot()} verificador={{ tipo: "bot", id: "pintor" }} />);
    fireEvent.change(screen.getByLabelText(`evidencia de ${CRITERIO}`), { target: { value: "Yo lo hice." } });
    fireEvent.click(screen.getByRole("button", { name: `Verificar ${CRITERIO}` }));
    expect(screen.getByRole("alert").textContent).toMatch(/él mismo/);
    expect(listar(BOT_ID)[0].verif?.marcas[CRITERIO]).toBeUndefined();
  });

  it("sin evidencia no se marca nada", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={bot()} />);
    fireEvent.click(screen.getByRole("button", { name: `Verificar ${CRITERIO}` }));
    expect(screen.getByRole("alert").textContent).toMatch(/evidencia/);
    expect(listar(BOT_ID)[0].verif?.marcas[CRITERIO]).toBeUndefined();
  });
});
