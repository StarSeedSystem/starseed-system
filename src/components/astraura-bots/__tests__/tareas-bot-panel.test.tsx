/**
 * Pruebas del panel de tareas del bot (BOT1011X · jsdom): lista con estado, verificación
 * profesional (persona, evidencia obligatoria, sin autoverificación) y alta que pasa por
 * `validarAccion` + `decidirAccion`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TareasBotPanel } from "../tareas-bot-panel";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { crearTarea, verificacionInicial, type Problemas } from "@/lib/astraura-bots/tareas-bot";
import { guardar, CLAVE_TAREAS } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import type { Tarea } from "@/lib/astraura-bots/tipos";

const BOT = botPredeterminado("perfil-1", "cuenta-1");
/** Desenvuelve un resultado y, si trae problemas, la prueba falla diciendo cuáles. */
function sin<T extends object>(r: T | Problemas): T {
  if ("problemas" in r && Array.isArray(r.problemas)) throw new Error(r.problemas.join(" "));
  return r as T;
}
const tarea = (verificador: Tarea["verificador"] = "persona"): Tarea =>
  sin(crearTarea({ titulo: "Publicar la página", criterios: ["La portada carga en el móvil"], verificador }, BOT.id, "genesis"));
const guardadas = (): { porBot: Record<string, unknown[]> } =>
  JSON.parse(window.localStorage.getItem(CLAVE_TAREAS) ?? "{}");
const verificar = () => fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
const escribirEvidencia = (t: string) =>
  fireEvent.change(screen.getByLabelText(/evidencia de /), { target: { value: t } });

function abrirNueva(titulo = "", criterios = "") {
  fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
  if (titulo) fireEvent.change(screen.getByLabelText("título de la tarea"), { target: { value: titulo } });
  if (criterios) fireEvent.change(screen.getByLabelText("criterios de la tarea"), { target: { value: criterios } });
  fireEvent.click(screen.getByRole("button", { name: "Proponer tarea" }));
}

describe("TareasBotPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("sin tareas lo dice", () => {
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText("Sin tareas todavía.")).toBeTruthy();
  });

  it("lista las tareas guardadas con su estado y criterios", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText("Publicar la página")).toBeTruthy();
    expect(screen.getByText("propuesta")).toBeTruthy();
    expect(screen.getByText("La portada carga en el móvil")).toBeTruthy();
  });

  it("«Verificar» de una persona guarda quién y la evidencia", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={BOT} />);
    verificar();
    escribirEvidencia("Probado en Genesis con captura.");
    fireEvent.click(screen.getByRole("button", { name: "Cumple" }));
    expect(screen.getByText(/cumple · persona persona: Probado en Genesis/)).toBeTruthy();
    expect(screen.getByText("hecha")).toBeTruthy();
  });

  it("sin evidencia no hay marca", () => {
    const t = tarea();
    guardar(t, verificacionInicial(t, []));
    render(<TareasBotPanel bot={BOT} />);
    verificar();
    fireEvent.click(screen.getByRole("button", { name: "Cumple" }));
    expect(screen.getByRole("status").textContent).toMatch(/evidencia/i);
    expect(screen.getByText("sin verificar")).toBeTruthy();
  });

  it("un bot no verifica lo que él mismo hizo", () => {
    const base = tarea("bot");
    const t: Tarea = { ...base, agentes: [BOT.id], estado: "en-curso" };
    guardar(t, verificacionInicial(t, [{ criterio: t.criterios[0], agente: BOT.id, coincidencias: 1 }]));
    render(<TareasBotPanel bot={BOT} />);
    verificar();
    escribirEvidencia("Revisado por mí.");
    fireEvent.click(screen.getByRole("button", { name: "Cumple" }));
    expect(screen.getByRole("status").textContent).toMatch(/próximamente: falta un bot distinto/);
    expect(screen.getByText("sin verificar")).toBeTruthy();
  });

  it("otro bot sí verifica y queda su id en la marca", () => {
    const base = tarea("bot");
    const t: Tarea = { ...base, agentes: ["robot-2", "robot-3"], estado: "en-curso" };
    guardar(t, verificacionInicial(t, [{ criterio: t.criterios[0], agente: "robot-2", coincidencias: 1 }]));
    render(<TareasBotPanel bot={BOT} />);
    verificar();
    escribirEvidencia("Comprobado con las pruebas del taller.");
    fireEvent.click(screen.getByRole("button", { name: "Cumple" }));
    expect(screen.getByText(/cumple · bot robot-3: Comprobado/)).toBeTruthy();
  });

  it("con el nivel por defecto la tarea se propone y espera confirmación", () => {
    render(<TareasBotPanel bot={BOT} />);
    abrirNueva("Ordenar el escritorio", "Los iconos quedan por tipo");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(guardadas().porBot).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar tarea" }));
    expect(screen.getByText("Ordenar el escritorio")).toBeTruthy();
    expect(guardadas().porBot[BOT.id]).toHaveLength(1);
  });

  it("con nivel aplicar crea y persiste la tarea", () => {
    render(<TareasBotPanel bot={BOT} nivel="aplicar" />);
    abrirNueva("Ordenar el escritorio", "Los iconos quedan por tipo");
    expect(screen.getByText("Ordenar el escritorio")).toBeTruthy();
    expect(guardadas().porBot[BOT.id]).toHaveLength(1);
  });

  it("sin criterios avisa y no guarda nada", () => {
    render(<TareasBotPanel bot={BOT} nivel="aplicar" />);
    abrirNueva("Solo título");
    expect(screen.getByRole("status").textContent).toMatch(/criterio/);
    expect(guardadas().porBot).toBeUndefined();
  });
});
