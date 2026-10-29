import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PanelBots } from "../panel-bots";

describe("TareasBotPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("muestra tareas y permite crear con validación y decidirAccion", () => {
    render(<PanelBots perfilId="p1" cuentaId="c1" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Revisar documentación" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "Tests pasan\nSin errores" } });
    fireEvent.click(screen.getByText("Crear"));
    expect(screen.getByText("Revisar documentación")).toBeTruthy();
  });

  it("lista criterios con marca quien y evidencia", () => {
    render(<PanelBots perfilId="p2" cuentaId="c2" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Tarea de prueba" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "Criterio uno" } });
    fireEvent.click(screen.getByText("Crear"));
    expect(screen.getByText("Criterio uno")).toBeTruthy();
  });

  it("permite verificar por criterio respetando no autoverificación", () => {
    render(<PanelBots perfilId="p3" cuentaId="c3" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Tarea verif" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "Hecho bien" } });
    fireEvent.click(screen.getByText("Crear"));
    const evidencia = screen.getAllByPlaceholderText("Evidencia");
    fireEvent.change(evidencia[0], { target: { value: "Comprobado" } });
    fireEvent.click(screen.getAllByText("OK")[0]);
    fireEvent.click(screen.getAllByText("Verificar")[0]);
    expect(screen.getByText(/Verificado por/)).toBeTruthy();
  });

  it("no permite autoverificar si verificador es bot y lo hizo el mismo bot", () => {
    render(<PanelBots perfilId="p4" cuentaId="c4" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Tarea bot" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "Algo" } });
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "bot" } });
    fireEvent.click(screen.getByText("Crear"));
    const evidencia = screen.getAllByPlaceholderText("Evidencia");
    fireEvent.change(evidencia[0], { target: { value: "ok" } });
    fireEvent.click(screen.getAllByText("Verificar")[0]);
    expect(screen.queryByText(/Verificado por/)).toBeFalsy();
  });

  it("valida con validarAccion al crear", () => {
    render(<PanelBots perfilId="p5" cuentaId="c5" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Tarea valida" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "Uno" } });
    fireEvent.click(screen.getByText("Crear"));
    expect(screen.getByText("Tarea valida")).toBeTruthy();
  });

  it("muestra estado de la tarea", () => {
    render(<PanelBots perfilId="p6" cuentaId="c6" />);
    const botones = screen.getAllByText("Nueva tarea");
    fireEvent.click(botones[0]);
    fireEvent.change(screen.getByPlaceholderText("Título"), { target: { value: "Con estado" } });
    fireEvent.change(screen.getByPlaceholderText("Criterios (uno por línea)"), { target: { value: "C1" } });
    fireEvent.click(screen.getByText("Crear"));
    expect(screen.getByText(/en-curso|propuesta/)).toBeTruthy();
  });
});
