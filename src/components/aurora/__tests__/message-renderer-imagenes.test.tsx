// @vitest-environment jsdom
/**
 * El bloque ```imagenes del chat monta la tarjeta de opciones (IMG1011J · contrato §6).
 * Sin red: las opciones viajan dentro del propio bloque y la tarjeta solo las pinta.
 */
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";
import { MessageRenderer } from "../message-renderer";

const render = (ui: React.ReactElement) => rtlRender(<AppearanceProvider>{ui}</AppearanceProvider>);

const SD = MODELOS_IMAGEN.find((m) => m.id === "sd-turbo") ?? MODELOS_IMAGEN[0];
const OPCION = { capa: "dispositivo", modelo: SD, motor: "sdcpp", cuantizacion: "q4", semilla: 1, motivo: "Cabe en tu aparato." };
const bloque = (datos: unknown) => "Mira las opciones:\n\n```imagenes\n" + JSON.stringify(datos) + "\n```";

describe("MessageRenderer · bloque imagenes", () => {
  afterEach(cleanup);

  it("monta la tarjeta con las opciones que trae el bloque", () => {
    render(<MessageRenderer text={bloque({ opciones: [OPCION] })} />);
    const rejilla = screen.getByRole("region", { name: "Opciones de imagen" });
    expect(rejilla).toBeTruthy();
    expect(screen.getByText(SD.nombre)).toBeTruthy();
  });

  it("planifica desde un prompt sin salir a la red", async () => {
    render(<MessageRenderer text={bloque({ prompt: "Un bosque de cristal", opciones: 2 })} />);
    expect(await screen.findByRole("region", { name: "Opciones de imagen" })).toBeTruthy();
  });

  it("sin petición ni opciones presentables cae a código normal", () => {
    render(<MessageRenderer text={"```imagenes\nno-es-json\n```"} />);
    expect(screen.queryByRole("region", { name: "Opciones de imagen" })).toBeNull();
    expect(document.querySelector("pre")?.textContent).toContain("no-es-json");
  });
});
