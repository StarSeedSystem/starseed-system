/**
 * BotonFondoAudiomorphic: lleva el visual de la sesión en vivo a la capa Audiomorphic
 * del fondo y lo confirma en pantalla. Se monta dentro de AppearanceProvider porque
 * escribe en la config de apariencia real del contexto (updateConfig).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";

import { BotonFondoAudiomorphic } from "../en-vivo/boton-fondo-audiomorphic";

const wrap = (ui: React.ReactNode) => <AppearanceProvider>{ui}</AppearanceProvider>;

describe("BotonFondoAudiomorphic", () => {
  afterEach(cleanup);

  it("aplica el visual al fondo del OS y lo confirma", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <BotonFondoAudiomorphic
          visual={{ modo: "espiral", color: "#6FE6D6", sensibilidad: 0.7 }}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /llevar al fondo del os/i }));
    expect(await screen.findByText("Aplicado al fondo")).toBeTruthy();
  });
});
