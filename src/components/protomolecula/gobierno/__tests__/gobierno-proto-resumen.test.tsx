/** Resumen compacto del gobierno para la pestaña «Gobierno» de la ventana de la orbe (Ola 1026P · P2). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { GobiernoProtoResumen } from "../gobierno-proto-resumen";
import { olvidarTodo } from "@/lib/protomolecula/gobierno/almacen";
import { conPermiso, crearPermiso, reglasPorDefecto, type PermisoDirecto } from "@/lib/protomolecula/gobierno/reglas";
import type { ContextoProto } from "@/lib/protomolecula/peticion/contrato";
import { NOMBRES_PROHIBIDOS, cargado, servicios } from "../ayudas-prueba";

beforeEach(() => {
  olvidarTodo();
  window.localStorage.clear();
});
afterEach(() => cleanup());

const ctxDe = (tipo: "grupo" | "comunidad" | "pagina", id = "semilla"): ContextoProto => ({ ruta: "", ambito: "grupo", gobernadaPor: { tipo, id, nombre: "Semilla" } });
async function listo() {
  await waitFor(() => expect(screen.queryByText("Leyendo las reglas…")).not.toBeInTheDocument());
}

describe("GobiernoProtoResumen", () => {
  it("sin grupo, comunidad ni página dice que lo personal es de su dueño y que la IA no aprueba sola", () => {
    render(<GobiernoProtoResumen contexto={{ ruta: "", ambito: "personal" }} servicios={servicios(cargado("dueno"))} />);
    const r = screen.getByTestId("gobierno-resumen-personal");
    expect(r).toHaveTextContent(/lo que cambias es tuyo/);
    expect(r).toHaveTextContent(/Ninguna IA aprueba sola/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("de un grupo: visibilidad, modo, origen, acceso y la fila de cada tipo con lo que puedes hacer", async () => {
    render(<GobiernoProtoResumen contexto={ctxDe("grupo")} servicios={servicios(cargado("colaborador"))} />);
    await listo();
    expect(screen.getByRole("heading", { name: /Protomolécula del grupo/ })).toBeInTheDocument();
    expect(screen.getByTestId("chip-visibilidad")).toHaveTextContent("Solo miembros");
    expect(screen.getByTestId("chip-origen")).toHaveTextContent("Reglas del OS");
    expect(screen.getByText("Gobierno democrático")).toBeInTheDocument();
    expect(screen.getByTestId("resumen-acceso")).toHaveTextContent(/Abrirla:.*Usarla:/);
    expect(screen.getByTestId("resumen-contenido")).toHaveTextContent("Lo aplicas");
    expect(screen.getByTestId("resumen-diseno")).toHaveTextContent("Propones");
    expect(screen.getByTestId("resumen-permisos")).toHaveTextContent("Se vota");
    expect(screen.getByTestId("resumen-reglas")).toHaveTextContent("Se vota");
    expect(screen.getByTestId("resumen-yo")).toHaveTextContent("Tu papel: colaborador.");
  });

  it("jerárquico con reglas propias: lo dice y la dueña lo aplica todo", async () => {
    const reglas = { ...reglasPorDefecto("grupo", "hierarchical"), visibilidad: "publica" as const };
    render(<GobiernoProtoResumen contexto={ctxDe("pagina", "faro")} servicios={servicios(cargado("dueno", "hierarchical", reglas))} />);
    await listo();
    expect(screen.getByRole("heading", { name: /Protomolécula de la página/ })).toBeInTheDocument();
    expect(screen.getByText("Gobierno jerárquico")).toBeInTheDocument();
    expect(screen.getByTestId("chip-origen")).toHaveTextContent("Reglas propias");
    expect(screen.getByTestId("chip-visibilidad")).toHaveTextContent("Pública");
    expect(screen.getByTestId("resumen-reglas")).toHaveTextContent("Lo aplicas");
    expect(screen.getByTestId("resumen-yo")).toHaveTextContent("dueña o dueño");
  });

  it("cuenta tus permisos directos vigentes y no los caducados", async () => {
    const ahora = Date.now();
    const vigente = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u-nadie", nombre: "Yo" }, tipos: ["contenido"], concedidoPor: "u-dueno", dias: 10 }, ahora) as PermisoDirecto;
    const caducado = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u-nadie" }, tipos: ["diseno"], concedidoPor: "u-dueno", dias: 1 }, ahora - 9 * 86_400_000) as PermisoDirecto;
    const reglas = conPermiso(conPermiso(reglasPorDefecto("grupo"), vigente), caducado);
    render(<GobiernoProtoResumen contexto={ctxDe("grupo")} servicios={servicios(cargado("nadie", "democratic", reglas))} ahora={ahora} />);
    await listo();
    expect(screen.getByTestId("resumen-yo")).toHaveTextContent(/Tienes un permiso directo; cada uso queda anotado/);
    expect(screen.getByTestId("resumen-diseno")).toHaveTextContent("No puedes"); // no es miembro y el permiso caducó
    expect(screen.getByTestId("resumen-contenido")).toHaveTextContent("Lo aplicas"); // el vigente sí vale, aunque no sea miembro
  });

  it("sin sesión pide iniciar sesión", async () => {
    render(<GobiernoProtoResumen contexto={ctxDe("grupo")} servicios={servicios(cargado("sin-sesion"))} />);
    await listo();
    expect(screen.getByTestId("resumen-yo")).toHaveTextContent(/inicia sesión/i);
  });

  it.each([
    ["grupo", "/grupo/semilla"],
    ["comunidad", "/grupo/semilla"],
    ["pagina", "/pagina/semilla"],
  ] as const)("el enlace para cambiar las reglas de una entidad «%s» va a una ruta que existe: %s", async (tipo, ruta) => {
    render(<GobiernoProtoResumen contexto={ctxDe(tipo)} servicios={servicios(cargado("dueno"))} />);
    await listo();
    expect(screen.getByRole("link", { name: /Ver y cambiar las reglas/ })).toHaveAttribute("href", ruta);
  });

  it("no usa los nombres prohibidos", async () => {
    const { container } = render(<GobiernoProtoResumen contexto={ctxDe("grupo")} servicios={servicios(cargado("dueno"))} />);
    await listo();
    expect(container.textContent).not.toMatch(NOMBRES_PROHIBIDOS);
  });
});
