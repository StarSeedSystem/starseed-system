import { afterEach, describe, expect, it } from "vitest";
import { pedirSeccionAlAbrir, tomarSeccionPendiente } from "../control-center-events";
import { abrirGrabar } from "@/lib/habilidades/grabar-pantalla";
import { escucharAbrirGrabar } from "@/lib/habilidades/grabar-pantalla";

describe("abrir la sección Grabar desde fuera del Centro de Control", () => {
  afterEach(() => { tomarSeccionPendiente(); });

  it("la sección pendiente se toma una sola vez", () => {
    pedirSeccionAlAbrir("grabar");
    expect(tomarSeccionPendiente()).toBe("grabar");
    expect(tomarSeccionPendiente()).toBeNull();
  });

  it("con un oyente como el de las cortinas, la habilidad sabe que se abrió", () => {
    const quitar = escucharAbrirGrabar(() => pedirSeccionAlAbrir("grabar"));
    const r = abrirGrabar({});
    expect(r.abierto).toBe(true);
    expect(tomarSeccionPendiente()).toBe("grabar");
    quitar();
    expect(abrirGrabar({}).abierto).toBe(false);
  });
});
