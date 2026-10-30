import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { registrarFamilia, __resetRegistros } from "@/lib/variaciones/familias";
import { SANDBOX_CODIGO } from "@/lib/variaciones/validar";
import {
  TarjetaVariacion, enlaceSeguro, textoPrevio, htmlAislado, requiereAislamiento,
  recursoDeVariacion, itemBibliotecaDeVariacion, type VariacionTarjeta,
} from "../tarjeta-variacion";
const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);
const aplicados: unknown[] = [];
let deshechos = 0;
beforeEach(() => {
  __resetRegistros();
  aplicados.length = 0;
  deshechos = 0;
  registrarFamilia({
    familia: "prueba",
    nombre: "Prueba",
    capturar: () => null,
    validar: (payload) => ({ ok: true, payload }),
    aplicar: (_clave, payload) => {
      aplicados.push(payload);
      return { deshacer: () => { deshechos += 1; } };
    },
  });
});
afterEach(cleanup);
const variacion: VariacionTarjeta = {
  id: "1", titulo: "Cristal suave", descripcion: "Una variación con efecto cristal", version: "1.0.0",
  familia: "prueba", licencia: "MIT", etiquetas: ["cristal", "suave"], valoracionMedia: 4.5, valoracionCount: 3,
  payload: { brillo: 2 },
};
describe("lógica pura de la tarjeta", () => {
  it("solo acepta enlaces https absolutos", () => {
    expect(enlaceSeguro("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(enlaceSeguro("http://inseguro.test/x")).toBeNull();
    expect(enlaceSeguro("javascript:alert(1)")).toBeNull();
    expect(enlaceSeguro(undefined)).toBeNull();
  });
  it("acota la vista previa del payload y tolera lo no serializable", () => {
    expect(textoPrevio({ brillo: 2 })).toContain("\"brillo\": 2");
    expect(textoPrevio("hola", 2)).toBe("ho…");
    expect(textoPrevio(undefined)).toBe("");
    const circular: Record<string, unknown> = {};
    circular.yo = circular;
    expect(textoPrevio(circular)).toBe("");
  });
  it("detecta el código y lo envuelve en un documento aislado", () => {
    expect(requiereAislamiento({ ...variacion, codigo: true })).toBe(true);
    expect(requiereAislamiento({ ...variacion, payload: { html: "<p>hola</p>" } })).toBe(true);
    expect(requiereAislamiento(variacion)).toBe(false);
    const doc = htmlAislado({ html: "<p>hola</p>", css: "p{color:red}", js: "console.log(1)" });
    expect(doc).toContain("<p>hola</p>");
    expect(doc).toContain("<style>p{color:red}</style>");
    expect(doc).toContain("<script>console.log(1)</script>");
  });
  it("construye la referencia compartible y el ítem de Biblioteca sin secretos", () => {
    const recurso = recursoDeVariacion("prueba:clima", variacion);
    expect(recurso.kind).toBe("archivo");
    expect(recurso.route).toBe("/variaciones?clave=prueba%3Aclima");
    const item = itemBibliotecaDeVariacion("prueba:clima", variacion);
    expect(item.type).toBe("file");
    expect(item.tags).toEqual(["starseed-variacion", "cristal", "suave"]);
    expect(JSON.parse(item.content ?? "{}")).toMatchObject({ clave: "prueba:clima", licencia: "MIT" });
  });
});
describe("TarjetaVariacion", () => {
  it("muestra título, descripción, valoración, licencia, versión y etiquetas", () => {
    render(<TarjetaVariacion variacion={variacion} clave="prueba:clima" />);
    expect(screen.getByText("Cristal suave")).toBeTruthy();
    expect(screen.getByText("Una variación con efecto cristal")).toBeTruthy();
    expect(screen.getByText("4.5 (3)")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("cristal")).toBeTruthy();
    expect(screen.getByLabelText("Vista previa de la variación").textContent).toContain("brillo");
  });
  it("«Probar» aplica y al pulsar de nuevo deshace", () => {
    render(<TarjetaVariacion variacion={variacion} clave="prueba:clima" />);
    fireEvent.click(screen.getByRole("button", { name: /probar/i }));
    expect(aplicados).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /deshacer prueba/i }));
    expect(deshechos).toBe(1);
    expect(screen.getByRole("button", { name: /probar/i })).toBeTruthy();
  });
  it("«Aplicar» deja visible el deshacer y lo ejecuta", () => {
    render(<TarjetaVariacion variacion={variacion} clave="prueba:clima" />);
    fireEvent.click(screen.getByRole("button", { name: /^aplicar$/i }));
    expect(aplicados).toHaveLength(1);
    const deshacer = screen.getByRole("button", { name: /^deshacer$/i });
    fireEvent.click(deshacer);
    expect(deshechos).toBe(1);
  });
  it("una variación de código pide confirmación y solo se abre aislada", () => {
    const codigo = { ...variacion, payload: { html: "<p>hola</p>" }, codigo: true };
    render(<TarjetaVariacion variacion={codigo} clave="prueba:clima" />);
    fireEvent.click(screen.getByRole("button", { name: /probar/i }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByTitle(/vista aislada/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /abrir aislada/i }));
    expect(screen.getByTitle(/vista aislada/i)).toHaveAttribute("sandbox", SANDBOX_CODIGO);
    expect(aplicados).toHaveLength(0);
  });
  it("«Ver origen» avisa del origen y valora con estrellas", () => {
    const onVerOrigen = vi.fn(), onValorar = vi.fn();
    render(<TarjetaVariacion variacion={{ ...variacion, deVariacion: "abc" }} clave="prueba:clima" onVerOrigen={onVerOrigen} onValorar={onValorar} />);
    fireEvent.click(screen.getByRole("button", { name: /ver origen/i }));
    expect(onVerOrigen).toHaveBeenCalledWith("1");
    fireEvent.click(screen.getByRole("button", { name: "Valorar con 5 estrellas" }));
    expect(onValorar).toHaveBeenCalledWith("1", 5);
  });
});
