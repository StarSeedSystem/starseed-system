import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PrivacidadPage from "../page";
import TerminosPage from "../../terminos/page";

describe("página pública /privacidad", () => {
  afterEach(() => cleanup());

  it("renderiza sin sesión con el título, la app y el alcance de lectura", () => {
    render(<PrivacidadPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Política de privacidad/i })).toBeTruthy();
    expect(screen.getAllByText(/StarSeed actividad/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/solo lectura/i).length).toBeGreaterThan(0);
  });

  it("declara que los datos se quedan en los nodos del dueño y el uso limitado de Google", () => {
    render(<PrivacidadPage />);
    expect(screen.getAllByText(/no se vende/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uso limitado/i).length).toBeGreaterThan(0);
  });

  it("ofrece cómo revocar el acceso y un contacto real", () => {
    render(<PrivacidadPage />);
    const revocar = screen.getAllByRole("link", { name: /myaccount\.google\.com\/permissions/i })[0];
    expect(revocar.getAttribute("href")).toBe("https://myaccount.google.com/permissions");
    expect(screen.getAllByText(/fundacionstarseed@gmail\.com/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-11-11/).length).toBeGreaterThan(0);
  });

  it("incluye un resumen en inglés y enlaza a los términos", () => {
    render(<PrivacidadPage />);
    expect(screen.getByRole("heading", { name: /Summary in English/i })).toBeTruthy();
    const terminos = screen.getByRole("link", { name: /Términos/i });
    expect(terminos.getAttribute("href")).toBe("/terminos");
  });
});

describe("página pública /terminos", () => {
  afterEach(() => cleanup());

  it("renderiza con el título, la vigencia y el enlace a la privacidad", () => {
    render(<TerminosPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Términos/i })).toBeTruthy();
    expect(screen.getAllByText(/2026-11-11/).length).toBeGreaterThan(0);
    const privacidad = screen.getByRole("link", { name: /Política de privacidad/i });
    expect(privacidad.getAttribute("href")).toBe("/privacidad");
  });

  it("describe la app de solo lectura y el uso limitado de Google", () => {
    render(<TerminosPage />);
    expect(screen.getAllByText(/StarSeed actividad/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/solo lectura/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uso limitado/i).length).toBeGreaterThan(0);
  });
});
