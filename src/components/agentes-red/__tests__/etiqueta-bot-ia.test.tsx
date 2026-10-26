/**
 * La etiqueta «Bot de IA» (Ola 1025U · U3) no se puede ocultar: ni por propiedades, ni por estilos que se le pasen.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EtiquetaBotIA, NOMBRE_ACCESIBLE_BOT, TEXTO_ETIQUETA_BOT } from "../etiqueta-bot-ia";

afterEach(cleanup);

describe("EtiquetaBotIA", () => {
  it("siempre dice «Bot de IA» con texto, no solo con un icono, y tiene nombre accesible", () => {
    render(<EtiquetaBotIA />);
    const etiqueta = screen.getByTestId("etiqueta-bot-ia");
    expect(etiqueta).toBeVisible();
    expect(etiqueta).toHaveTextContent(TEXTO_ETIQUETA_BOT);
    expect(TEXTO_ETIQUETA_BOT).toBe("Bot de IA");
    expect(etiqueta).toHaveAttribute("aria-label", NOMBRE_ACCESIBLE_BOT);
    expect(screen.getByRole("note", { name: NOMBRE_ACCESIBLE_BOT })).toBe(etiqueta);
  });

  it("no hay propiedad que la oculte: cualquier intento se ignora", () => {
    const intentos = { oculta: true, oculto: true, hidden: true, visible: false, className: "hidden sr-only", style: { display: "none" } };
    render(<EtiquetaBotIA {...(intentos as object)} />);
    const etiqueta = screen.getByTestId("etiqueta-bot-ia");
    expect(etiqueta).toBeVisible();
    expect(etiqueta).not.toHaveAttribute("hidden");
    expect(etiqueta.className).not.toMatch(/\bhidden\b|sr-only/);
    expect(etiqueta.style.display).not.toBe("none");
  });

  it("el tamaño solo cambia la medida, nunca el texto", () => {
    const { rerender } = render(<EtiquetaBotIA tamano="sm" />);
    const pequena = screen.getByTestId("etiqueta-bot-ia").className;
    rerender(<EtiquetaBotIA tamano="md" />);
    const grande = screen.getByTestId("etiqueta-bot-ia");
    expect(grande.className).not.toBe(pequena);
    expect(grande).toHaveTextContent("Bot de IA");
  });
});
