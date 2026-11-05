import { fireEvent, render, screen } from "@testing-library/react";
import { Renderer, type ActionEvent } from "@openuidev/react-lang";
import { describe, expect, it } from "vitest";
import {
  Accion,
  Comparacion,
  LineaDeTiempo,
  Lista,
  Pasos,
  Tabla,
  Tarjeta,
  accionStarseed,
  biblioteca,
  promptDeSistema,
} from "../biblioteca";

const NOMBRES = ["Accion", "Comparacion", "LineaDeTiempo", "Lista", "Pasos", "Tabla", "Tarjeta"];

describe("Biblioteca OpenUI StarSeed", () => {
  it("declara los 7 componentes Trinity y su raíz", () => {
    expect(Object.keys(biblioteca.components).sort()).toEqual(NOMBRES);
    expect(biblioteca.root).toBe("Tarjeta");
  });

  it("promptDeSistema sale de la biblioteca y nombra los 7 componentes", () => {
    const prompt = promptDeSistema();
    expect(prompt).toContain("root =");
    for (const nombre of NOMBRES) expect(prompt).toContain(nombre);
    expect(prompt).toContain("accion_starseed");
  });

  it("los 7 componentes van exportados, registrados y con descripción", () => {
    expect(biblioteca.components.Tarjeta).toBe(Tarjeta);
    expect(biblioteca.components.Tabla).toBe(Tabla);
    expect(biblioteca.components.Pasos).toBe(Pasos);
    expect(biblioteca.components.Comparacion).toBe(Comparacion);
    expect(biblioteca.components.LineaDeTiempo).toBe(LineaDeTiempo);
    expect(biblioteca.components.Lista).toBe(Lista);
    expect(biblioteca.components.Accion).toBe(Accion);
    expect(accionStarseed.name).toBe("accion_starseed");
    for (const nombre of NOMBRES) {
      const componente = biblioteca.components[nombre];
      expect(componente?.description.length).toBeGreaterThan(0);
    }
  });

  it("Acción solo emite un evento con el id, sin ejecutar nada", () => {
    const eventos: ActionEvent[] = [];
    const { container } = render(
      <Renderer
        response={'root = Accion("Guardar borrador", "publicacion.guardar")'}
        library={biblioteca}
        isStreaming={false}
        onAction={(evento) => eventos.push(evento)}
      />,
    );
    expect(container).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.type).toBe("accion_starseed");
    expect(eventos[0]?.params["idAccion"]).toBe("publicacion.guardar");
  });
});
