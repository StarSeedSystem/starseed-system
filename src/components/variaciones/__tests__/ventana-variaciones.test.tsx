import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VentanaVariaciones, type DatosVentanaVariaciones, type VariacionVentana } from "../ventana-variaciones";
import type { PestanaVariaciones } from "../variaciones-bus";
import { SANDBOX_CODIGO } from "@/lib/variaciones/validar";
import { AppearanceProvider } from "@/context/appearance-context";
import type { ReactElement } from "react";

const renderWithProvider = (ui: ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

afterEach(cleanup);

function v(id: string, titulo: string, extra: Partial<VariacionVentana> = {}): VariacionVentana {
  return {
    id, titulo, descripcion: `${titulo} descripción`, version: "1.0.0", familia: "widget", licencia: "MIT",
    etiquetas: ["cristal"], creado: new Date("2026-10-01T00:00:00Z"), descargas: 0, valoracionMedia: 4, valoracionCount: 2, ...extra,
  };
}

function datos(listas: Partial<Record<PestanaVariaciones, VariacionVentana[]>>, disponible = true): DatosVentanaVariaciones {
  return { disponible, listas };
}

function filas() {
  return within(screen.getByRole("tabpanel")).queryAllByRole("listitem");
}

function tarjetas() {
  return Array.from(screen.getByRole("tabpanel").querySelectorAll("[data-ss-variacion]"));
}

describe("VentanaVariaciones", () => {
  it("muestra las cuatro pestañas y la lista inyectada de la pestaña activa", () => {
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: [v("1", "Cristal suave")] })} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Variaciones", "Notas", "Repos externos", "Fuentes y versiones"]);
    expect(screen.getByRole("tab", { name: "Variaciones" }).getAttribute("aria-selected")).toBe("true");
    expect(tarjetas().map((f) => f.textContent)).toEqual([expect.stringContaining("Cristal suave")]);
  });

  it("cambia de pestaña, usa la lista inyectada y da un vacío honesto por pestaña", () => {
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ notas: [v("n1", "Nota pública")] })} />);
    expect(screen.getByText("Aún nadie ha publicado una variación de este elemento")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Notas" }));
    expect(screen.getByRole("tab", { name: "Notas" }).getAttribute("aria-selected")).toBe("true");
    expect(filas().map((f) => f.textContent)).toEqual([expect.stringContaining("Nota pública")]);
    fireEvent.click(screen.getByRole("tab", { name: "Repos externos" }));
    expect(screen.getByText("Aún no hay repositorios externos para este elemento")).toBeTruthy();
  });

  it("el buscador filtra por título, descripción o etiqueta y vacía con honestidad", () => {
    const lista = [v("1", "Cristal", { etiquetas: ["bruma"] }), v("2", "Aurora", { etiquetas: ["luz"] })];
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: lista })} />);
    const buscar = screen.getByLabelText("Buscar variaciones");
    fireEvent.change(buscar, { target: { value: "bruma" } });
    expect(tarjetas().map((f) => f.textContent)).toEqual([expect.stringContaining("Cristal")]);
    fireEvent.change(buscar, { target: { value: "no existe" } });
    expect(screen.getByText("Aún nadie ha publicado una variación de este elemento")).toBeTruthy();
  });

  it("filtra por licencia y por etiqueta", () => {
    const lista = [
      v("1", "Cristal", { licencia: "MIT", tema: "claro", etiquetas: ["bruma"] }),
      v("2", "Aurora", { licencia: "CC-BY-4.0", tema: "oscuro", etiquetas: ["luz"] }),
    ];
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: lista })} />);
    fireEvent.change(screen.getByLabelText("Filtrar por licencia"), { target: { value: "MIT" } });
    expect(tarjetas().map((f) => f.textContent)).toEqual([expect.stringContaining("Cristal")]);
    fireEvent.change(screen.getByLabelText("Filtrar por licencia"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filtrar por etiqueta"), { target: { value: "luz" } });
    expect(tarjetas().map((f) => f.textContent)).toEqual([expect.stringContaining("Aurora")]);
  });

  it("ordena con los modos de orden.ts (novedades primero por versión)", () => {
    const lista = [v("1", "Alfa", { version: "1.0.0" }), v("2", "Beta", { version: "3.0.0" }), v("3", "Gamma", { version: "2.0.0" })];
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: lista })} />);
    const titulos = () => tarjetas().map((f) => within(f as HTMLElement).getByRole("heading", { level: 3 }).textContent);
    expect(titulos()).toEqual(["Alfa", "Beta", "Gamma"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "novedades" } });
    expect(titulos()).toEqual(["Beta", "Gamma", "Alfa"]);
  });

  it("avisa con honestidad si la tabla de variaciones no está disponible", () => {
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: [v("1", "Cristal")] }, false)} />);
    expect(screen.getByRole("alert").textContent).toMatch(/no está disponible en este proyecto/);
    expect(filas()).toHaveLength(0);
    expect(tarjetas()).toHaveLength(0);
    expect(screen.queryByText("Aún nadie ha publicado una variación de este elemento")).toBeNull();
  });

  it("en repos solo pinta enlaces https y los abre fuera de la pestaña", () => {
    const repos = [
      v("1", "Repo bueno", { enlaceExterno: "https://github.com/a/b" }),
      v("2", "Repo inseguro", { enlaceExterno: "http://inseguro.test/x" }),
    ];
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ repos })} pestanaInicial="repos" />);
    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0].getAttribute("href")).toBe("https://github.com/a/b");
    expect(enlaces[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Repo inseguro")).toBeTruthy();
  });

  it("pasa el payload a la tarjeta: vista previa, Biblioteca y Compartir", () => {
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: [v("1", "Cristal", { payload: { brillo: 2 } })] })} />);
    expect(screen.getByLabelText("Vista previa de la variación").textContent).toContain("brillo");
    expect(screen.getByRole("button", { name: /guardar en la biblioteca/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /compartir/i })).toBeTruthy();
  });

  it("una variación de código desde la ventana confirma y solo se abre aislada", () => {
    const codigo = v("2", "Script", { payload: { html: "<p>hola</p>" }, codigo: true });
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: [codigo] })} />);
    fireEvent.click(screen.getByRole("button", { name: /probar/i }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /abrir aislada/i }));
    const marco = screen.getByTitle(/vista aislada/i);
    expect(marco.getAttribute("sandbox")).toBe(SANDBOX_CODIGO);
    expect(marco.getAttribute("srcdoc")).toContain("<p>hola</p>");
  });

  it("la valoración y «Ver origen» de la tarjeta llegan a quien monta la ventana", () => {
    const onValorar = vi.fn(), onVerOrigen = vi.fn();
    renderWithProvider(<VentanaVariaciones clave="widget:clima" datos={datos({ variaciones: [v("1", "Cristal", { deVariacion: "abc" })] })} onValorar={onValorar} onVerOrigen={onVerOrigen} />);
    fireEvent.click(screen.getByRole("button", { name: "Valorar con 4 estrellas" }));
    expect(onValorar).toHaveBeenCalledWith("1", 4);
    fireEvent.click(screen.getByRole("button", { name: /ver origen/i }));
    expect(onVerOrigen).toHaveBeenCalledWith("1");
  });
});
