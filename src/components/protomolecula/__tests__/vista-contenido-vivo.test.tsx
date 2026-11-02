/**
 * Pruebas de la VISTA del átomo «Contenido vivo» (CVV1028F): es la interfaz que arma el
 * plan con `planContenidoVivo` y pide el «sí». Un plan solo local no pide confirmación;
 * uno con créditos (Higgsfield) la pide y muestra el total cotizado. Sin red, sin procesos.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";
import type { EntradaContenidoVivo } from "@/lib/protomolecula/atomos/contenido-vivo";
import VistaContenidoVivo from "@/components/protomolecula/vista-contenido-vivo";

afterEach(cleanup);

const base: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 200,
  topeMes: 100,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

const entrada = (contexto: ContextoVivo): EntradaContenidoVivo => ({
  publicacion: "Cartel del evento",
  niveles: [2],
  tareasPorNivel: [{ nivel: 2, tareas: ["foto", "fotograma-clave"] }],
  contexto,
});

describe("VistaContenidoVivo", () => {
  it("arma el plan con la entrada por defecto del átomo: un nivel con escena y su ruta", () => {
    render(<VistaContenidoVivo atomoId="a1" valores={{ niveles: 1, publicacion: "Cartel del evento" }} />);
    expect(screen.getByRole("region", { name: "Plan de contenido vivo" }).textContent).toContain("Escena 3D");
  });

  it("un plan todo local no pide el «sí»", () => {
    render(
      <VistaContenidoVivo
        atomoId="a1"
        valores={{}}
        entrada={entrada({ ...base, neurona: { gpu: true, capaz3d: true } })}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("no gasta créditos");
  });

  it("un plan con Higgsfield pide el «sí» y suma los créditos de la cotización", () => {
    render(
      <VistaContenidoVivo
        atomoId="a1"
        valores={{}}
        entrada={entrada({ ...base, conectados: ["higgsfield"], cupoHoy: { higgsfield: 100 } })}
      />,
    );
    const boton = screen.getByRole("button");
    expect(boton.textContent).toContain("Sí, hacerla viva");
    expect(boton.textContent).toContain("4 créditos");
    expect(screen.getByText(/higgsfield: 4/).textContent).toContain("4");
    fireEvent.click(boton);
    expect(screen.getByRole("status").textContent).toContain("Confirmado");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
