/**
 * Pruebas jsdom del panel de tareas del bot (BOT1011X · astraura-bots.md §8).
 * Cubren el vacío, la creación con `validarAccion`/`decidirAccion`/bucle, la
 * evidencia obligatoria, la regla de no autoverificación y la recarga.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { crearTarea, verificacionInicial, type Paso } from "@/lib/astraura-bots/tareas-bot";
import type { Tarea } from "@/lib/astraura-bots/tipos";
import { CLAVE_TAREAS, guardar, listar } from "@/lib/astraura-bots/adaptadores/almacen-tareas";
import { TareasBotPanel } from "../tareas-bot-panel";

const merge = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, atomic: true }));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: merge }));

const BOT = botPredeterminado("perfil-1", "cuenta-1");
const TITULO = "Publicar la página del café";
const CRITERIO = "La página carga en el móvil";

function tarea(extra: Partial<Tarea> = {}): Tarea {
  const r = crearTarea({ titulo: TITULO, criterios: [CRITERIO] }, BOT.id, "genesis");
  if ("problemas" in r) throw new Error(r.problemas.join(" "));
  return { ...r, ...extra };
}

function enviar(): void {
  fireEvent.submit(screen.getByLabelText("Título de la tarea").closest("form")!);
}

function escribir(titulo: string, criterios: string): void {
  fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: titulo } });
  fireEvent.change(screen.getByLabelText("Criterios comprobables"), { target: { value: criterios } });
}

describe("TareasBotPanel", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("sin tareas enseña el vacío del bot", () => {
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText("Aún no hay tareas.")).toBeTruthy();
  });

  it("«Nueva tarea» valida, propone y solo guarda al confirmar", () => {
    render(<TareasBotPanel bot={BOT} />);
    escribir(TITULO, CRITERIO);
    enviar();
    expect(screen.getByRole("status").textContent).toMatch(/Lo propone/);
    expect(listar(BOT.id)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear" }));
    expect(screen.getByText(TITULO)).toBeTruthy();
    expect(listar(BOT.id)).toHaveLength(1);
    expect(screen.getByText("propuesta")).toBeTruthy();
  });

  it("sin criterios comprobables no hay tarea", () => {
    render(<TareasBotPanel bot={BOT} />);
    escribir(TITULO, "");
    enviar();
    expect(screen.getByRole("status").textContent).toMatch(/Sin criterios/);
    expect(window.localStorage.getItem(CLAVE_TAREAS)).toBeNull();
  });

  it("un bot en pausa no crea tareas: manda decidirAccion", () => {
    render(<TareasBotPanel bot={{ ...BOT, activo: false }} />);
    escribir(TITULO, CRITERIO);
    enviar();
    expect(screen.getByRole("status").textContent).toMatch(/en pausa/);
    expect(listar(BOT.id)).toHaveLength(0);
  });

  it("verificar exige evidencia y deja quién y cómo en la marca", () => {
    guardar(tarea());
    render(<TareasBotPanel bot={BOT} />);
    fireEvent.click(screen.getByRole("button", { name: /Verificar/ }));
    expect(screen.getByRole("status").textContent).toMatch(/Toda marca lleva su evidencia/);
    fireEvent.change(screen.getByLabelText(`Evidencia para ${CRITERIO}`), { target: { value: "Visto en Genesis" } });
    fireEvent.click(screen.getByRole("button", { name: /Verificar/ }));
    expect(screen.getByText(/cumple · persona cuenta-1: Visto en Genesis/)).toBeTruthy();
    expect(screen.getByText("hecha")).toBeTruthy();
  });

  it("un bot no verifica el criterio que él mismo hizo", () => {
    const t = tarea({ verificador: "bot", agentes: ["pintor"] });
    const paso: Paso = { criterio: CRITERIO, agente: "pintor", coincidencias: 1 };
    guardar(t, verificacionInicial(t, [paso]));
    render(<TareasBotPanel bot={BOT} verificadorBot="pintor" />);
    expect(screen.getByText("no puede verificarlo quien lo hizo")).toBeTruthy();
    const boton = screen.getByRole("button", { name: /Verificar/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(listar(BOT.id)[0].verif?.marcas[CRITERIO]).toBeUndefined();
  });

  it("recarga lo guardado con su estado y sus criterios", () => {
    guardar(tarea({ agentes: ["pintor"], estado: "en-curso" }));
    render(<TareasBotPanel bot={BOT} />);
    expect(screen.getByText(TITULO)).toBeTruthy();
    expect(screen.getByText("en curso")).toBeTruthy();
    expect(screen.getByText(CRITERIO)).toBeTruthy();
    expect(merge).toHaveBeenCalled();
  });
});
