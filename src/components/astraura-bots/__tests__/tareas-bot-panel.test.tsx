/** Pruebas de TareasBotPanel (BOT1011X) en jsdom y del almacén de tareas; el espejo a la cuenta se simula. */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({ espejo: vi.fn(async () => ({ ok: true, atomic: true })) }));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: h.espejo }));

import type { Bot, Tarea } from "@/lib/astraura-bots/tipos";
import { marcarCriterio, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import { CLAVE_TAREAS, guardar, listar } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import { TareasBotPanel } from "../tareas-bot-panel";

const BOT: Bot = {
  id: "bot:astraura", nombre: "Astraura", dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
  origen: "astraura", gobierno: "jerarquico",
  personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
  cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo: true,
};
const TAREA: Tarea = {
  id: "tarea-1", titulo: "Revisar la orbe", director: BOT.id, agentes: ["bot:b"],
  criterios: ["La orbe respira", "El panel lista"], verificador: "persona", origen: "genesis", estado: "en-curso",
};
const nuevaTarea = (extra: Partial<Tarea> = {}): Tarea => ({ ...TAREA, id: `tarea-${Math.random()}`, ...extra });
const inconclusa = (t: Tarea) => verificacionInicial(t, []);

describe("almacén de tareas por bot", () => {
  beforeEach(() => { window.localStorage.clear(); h.espejo.mockClear(); });

  it("guarda, actualiza por id y lista por el bot director", () => {
    guardar(TAREA, inconclusa(TAREA));
    guardar({ ...TAREA, titulo: "Otra versión" }, inconclusa(TAREA));
    const lista = listar(BOT.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].tarea.titulo).toBe("Otra versión");
  });

  it("separa por bot y tolera un almacén corrupto", () => {
    guardar(TAREA, inconclusa(TAREA));
    guardar(nuevaTarea({ id: "tarea-2", director: "bot:otro" }), inconclusa(TAREA));
    expect(listar(BOT.id)).toHaveLength(1);
    expect(listar("bot:otro")).toHaveLength(1);
    window.localStorage.setItem(CLAVE_TAREAS, "{no-es-json");
    expect(listar(BOT.id)).toEqual([]);
  });

  it("espeja a la cuenta con su clave, best-effort", () => {
    guardar(TAREA, inconclusa(TAREA));
    expect(h.espejo).toHaveBeenCalledWith({ [CLAVE_TAREAS]: expect.anything() });
  });
});

describe("TareasBotPanel", () => {
  beforeEach(() => { window.localStorage.clear(); h.espejo.mockClear(); });
  afterEach(() => cleanup());

  it("lista tareas con su estado y criterios", () => {
    guardar(TAREA, inconclusa(TAREA));
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText("Revisar la orbe")).toBeTruthy();
    expect(screen.getByText(/en curso/)).toBeTruthy();
    expect(screen.getByText("La orbe respira")).toBeTruthy();
  });

  it("enseña la marca con quién la puso y su evidencia", () => {
    const v = marcarCriterio(inconclusa(TAREA), "La orbe respira", { tipo: "persona", id: "cuenta-1" }, true, "Mirado a mano");
    if ("problemas" in v) throw new Error(v.problemas.join(" "));
    guardar(TAREA, v);
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText(/cumple · persona:cuenta-1 · Mirado a mano/)).toBeTruthy();
  });

  it("«Verificar» guarda la marca del criterio", () => {
    guardar(TAREA, inconclusa(TAREA));
    render(<TareasBotPanel bot={BOT} />);
    fireEvent.click(screen.getByLabelText("Verificar La orbe respira"));
    fireEvent.change(screen.getByLabelText("Evidencia para La orbe respira"), { target: { value: "Comprobado a mano" } });
    fireEvent.click(screen.getByLabelText("Cumple La orbe respira"));
    expect(screen.getByText(/persona:cuenta-1 · Comprobado a mano/)).toBeTruthy();
    expect(listar(BOT.id)[0].verificacion?.marcas["La orbe respira"].ok).toBe(true);
  });

  it("no deja que un bot verifique lo que él mismo hizo", () => {
    const t = nuevaTarea({ verificador: "bot" });
    guardar(t, verificacionInicial(t, [{ criterio: "La orbe respira", agente: "bot:b", coincidencias: 1 }]));
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText(/próximamente: falta otro bot que verifique/)).toBeTruthy();
    expect(screen.queryByLabelText("Verificar La orbe respira")).toBeNull();
  });

  it("«Nueva tarea» propone y espera confirmación con el nivel por defecto", () => {
    render(<TareasBotPanel bot={BOT} />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "Pintar la orbe" } });
    fireEvent.change(screen.getByLabelText("Criterios de la tarea"), { target: { value: "Tono correcto\nSin parpadeos" } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(screen.getByRole("status").textContent).toMatch(/riesgo bajo|propone/);
    expect(listar(BOT.id)).toHaveLength(0);
    fireEvent.click(screen.getByText("Confirmar y crear"));
    expect(listar(BOT.id)).toHaveLength(1);
    expect(listar(BOT.id)[0].tarea.criterios).toEqual(["Tono correcto", "Sin parpadeos"]);
  });

  it("con nivel de aplicar crea la tarea directamente", () => {
    render(<TareasBotPanel bot={BOT} nivel="aplicar" />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "Pintar la orbe" } });
    fireEvent.change(screen.getByLabelText("Criterios de la tarea"), { target: { value: "Tono correcto" } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(listar(BOT.id)).toHaveLength(1);
    expect(screen.getByText("Pintar la orbe")).toBeTruthy();
  });

  it("sin criterios no crea nada y lo dice", () => {
    render(<TareasBotPanel bot={BOT} nivel="aplicar" />);
    fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: "Tarea vacía" } });
    fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
    expect(screen.getByRole("status").textContent).toMatch(/Sin criterios/);
    expect(listar(BOT.id)).toHaveLength(0);
  });
});
