/**
 * Pruebas jsdom del panel de tareas del bot (BOT1011X · astraura-bots.md §8).
 * Sin red: el espejo de `user_settings.prefs` se simula; el almacén es localStorage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { crearTarea, verificacionInicial } from "@/lib/astraura-bots/tareas-bot";
import type { Tarea } from "@/lib/astraura-bots/tipos";

const espejo = vi.hoisted(() => vi.fn(async () => ({ ok: true, atomic: true })));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: espejo }));

import { TareasBotPanel } from "../tareas-bot-panel";

const BOT = botPredeterminado("perfil-1", "cuenta-1");
const CLAVE = "starseed.astraura.bots.tareas.v1";
const PROPS = { bot: BOT, cuentaId: "cuenta-1" };

function tareaDe(titulo = "Publicar el huerto", criterios = ["Las fotos cargan"], extra: Record<string, unknown> = {}): Tarea {
  const r = crearTarea({ titulo, criterios, ...extra }, BOT.id, "genesis");
  if ("problemas" in r) throw new Error(r.problemas.join(" "));
  return r;
}

function sembrar(tarea: Tarea) {
  window.localStorage.setItem(CLAVE, JSON.stringify({
    version: 1,
    porBot: { [BOT.id]: [{ tarea, verif: verificacionInicial(tarea, []) }] },
  }));
}

function crearDesdePanel(titulo: string, criterios: string) {
  fireEvent.change(screen.getByLabelText("Título de la tarea"), { target: { value: titulo } });
  fireEvent.change(screen.getByLabelText("Criterios (uno por línea)"), { target: { value: criterios } });
  fireEvent.click(screen.getByRole("button", { name: /Nueva tarea/ }));
}

describe("TareasBotPanel", () => {
  beforeEach(() => { window.localStorage.clear(); espejo.mockClear(); });
  afterEach(() => cleanup());

  it("crea una tarea validada, la guarda por bot y la espeja", () => {
    render(<TareasBotPanel {...PROPS} />);
    crearDesdePanel("Publicar el huerto", "Las fotos cargan\nEl texto no tiene faltas");
    expect(screen.getByText("Publicar el huerto")).toBeTruthy();
    expect(screen.getByText("Propuesta")).toBeTruthy();
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) ?? "{}");
    expect(guardado.porBot[BOT.id]).toHaveLength(1);
    expect(espejo).toHaveBeenCalledTimes(1);
  });

  it("sin criterios no crea nada y dice por qué", () => {
    render(<TareasBotPanel {...PROPS} />);
    crearDesdePanel("Sin criterios", "");
    expect(screen.getByRole("status").textContent).toContain("criterio");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });

  it("un bot en pausa no crea: lo decide decidirAccion", () => {
    render(<TareasBotPanel {...PROPS} bot={{ ...BOT, activo: false }} />);
    crearDesdePanel("Publicar el huerto", "Las fotos cargan");
    expect(screen.getByRole("status").textContent).toContain("pausa");
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });

  it("verifica un criterio con evidencia y muestra quién y qué se comprobó", () => {
    sembrar(tareaDe("Publicar el huerto", ["Las fotos cargan"]));
    render(<TareasBotPanel {...PROPS} />);
    fireEvent.change(screen.getByLabelText("Evidencia de Las fotos cargan"), { target: { value: "Captura en Genesis." } });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByText(/Cumple · persona:cuenta-1 · Captura en Genesis\./)).toBeTruthy();
    expect(screen.getByText("Hecha")).toBeTruthy();
  });

  it("sin evidencia no marca el criterio y lo dice", () => {
    sembrar(tareaDe("Publicar el huerto", ["Las fotos cargan"]));
    render(<TareasBotPanel {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(screen.getByRole("status").textContent).toContain("evidencia");
    expect(screen.getByText("Sin verificar")).toBeTruthy();
  });

  it("una tarea que verifica un bot no pinta «Verificar»: no se autoverifica", () => {
    sembrar(tareaDe("Publicar el huerto", ["Las fotos cargan"], { verificador: "bot" }));
    render(<TareasBotPanel {...PROPS} />);
    expect(screen.queryByRole("button", { name: "Verificar" })).toBeNull();
    expect(screen.getByText("próximamente: verificación por otro bot")).toBeTruthy();
  });

  it("lista solo las tareas del bot pedido", () => {
    const tarea = tareaDe("Publicar el huerto", ["Las fotos cargan"]);
    sembrar(tarea);
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) ?? "{}");
    guardado.porBot["otro-bot"] = [{ tarea: tareaDe("Otra cosa", ["Otro criterio"]) }];
    window.localStorage.setItem(CLAVE, JSON.stringify(guardado));
    render(<TareasBotPanel {...PROPS} />);
    expect(screen.getByText("Publicar el huerto")).toBeTruthy();
    expect(screen.queryByText("Otra cosa")).toBeNull();
  });
});
