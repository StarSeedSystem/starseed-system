import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PrivacidadPage, { metadata as METADATOS_PRIVACIDAD } from "../page";
import TerminosPage, { metadata as METADATOS_TERMINOS } from "../../terminos/page";

/**
 * SDP1111U · las páginas públicas que Google exige para publicar la app OAuth
 * «StarSeed actividad» (pantalla de consentimiento → dominio autorizado).
 *
 * Estas pruebas miran lo que ve un BUSCADOR (texto renderizado, enlaces y
 * metadatos), no la implementación: si mañana alguien cambia el estilo, el
 * documento sigue valiendo mientras siga diciendo lo que tiene que decir.
 */

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
    expect(screen.getAllByText(/nodos del dueño/i).length).toBeGreaterThan(0);
  });

  it("ofrece cómo revocar el acceso y un contacto real", () => {
    render(<PrivacidadPage />);
    const revocar = screen.getAllByRole("link", { name: /myaccount\.google\.com\/permissions/i })[0];
    expect(revocar.getAttribute("href")).toBe("https://myaccount.google.com/permissions");
    expect(screen.getAllByText(/fundacionstarseed@gmail\.com/i).length).toBeGreaterThan(0);
  });

  it("dice la fecha de vigencia, legible y en formato de máquina", () => {
    render(<PrivacidadPage />);
    expect(screen.getAllByText(/11 de noviembre de 2026/i).length).toBeGreaterThan(0);
    const fecha = document.querySelector("time");
    expect(fecha?.getAttribute("datetime")).toBe("2026-11-11");
  });

  it("incluye un resumen en inglés y enlaza a los términos", () => {
    render(<PrivacidadPage />);
    expect(screen.getByRole("heading", { name: /Summary in English/i })).toBeTruthy();
    const terminos = screen.getByRole("link", { name: /Términos/i });
    expect(terminos.getAttribute("href")).toBe("/terminos");
  });

  it("es pública y localizable: metadatos y canonical", () => {
    expect(METADATOS_PRIVACIDAD.title).toMatch(/privacidad/i);
    expect(METADATOS_PRIVACIDAD.description).toMatch(/StarSeed actividad/i);
    expect(METADATOS_PRIVACIDAD.alternates?.canonical).toBe("/privacidad");
  });
});

describe("página pública /terminos", () => {
  afterEach(() => cleanup());

  it("renderiza con el título, la vigencia y el enlace a la privacidad", () => {
    render(<TerminosPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Términos/i })).toBeTruthy();
    expect(screen.getAllByText(/11 de noviembre de 2026/i).length).toBeGreaterThan(0);
    const privacidad = screen.getByRole("link", { name: /Política de privacidad/i });
    expect(privacidad.getAttribute("href")).toBe("/privacidad");
  });

  it("describe la app de solo lectura y el uso limitado de Google", () => {
    render(<TerminosPage />);
    expect(screen.getAllByText(/StarSeed actividad/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/solo lectura/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uso limitado/i).length).toBeGreaterThan(0);
  });

  it("es pública y localizable: metadatos y canonical", () => {
    expect(METADATOS_TERMINOS.title).toMatch(/Términos/i);
    expect(METADATOS_TERMINOS.description).toMatch(/StarSeed actividad/i);
    expect(METADATOS_TERMINOS.alternates?.canonical).toBe("/terminos");
  });
});

describe("el estilo de las dos páginas", () => {
  afterEach(() => cleanup());

  it("usa solo tokens de color del OS (nada de hex sueltos)", () => {
    const { container: privacidad } = render(<PrivacidadPage />);
    const { container: terminos } = render(<TerminosPage />);
    for (const html of [privacidad.innerHTML, terminos.innerHTML]) {
      const clases = html.match(/class="[^"]*"/g) ?? [];
      for (const clase of clases) {
        expect(clase, `color suelt en ${clase}`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      }
    }
  });

  it("usa la tipografía de la casa (titular Space Grotesk)", () => {
    const { container: privacidad } = render(<PrivacidadPage />);
    expect(privacidad.innerHTML).toContain("font-headline");
    const { container: terminos } = render(<TerminosPage />);
    expect(terminos.innerHTML).toContain("font-headline");
  });
});
