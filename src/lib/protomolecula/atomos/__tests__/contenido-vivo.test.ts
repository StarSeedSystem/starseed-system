/**
 * Pruebas puras del átomo «Contenido vivo» (CVV1028F): un plan solo local no pide
 * confirmación, un plan con Higgsfield cotiza y pide el «sí», y el átomo se registra.
 * Sin red, sin disco, sin procesos.
 */
import { describe, it, expect } from "vitest";
import type { ContextoVivo } from "../../../contenido-vivo/rutas";
import { CONTENIDO_VIVO, planContenidoVivo, type EntradaContenidoVivo } from "../contenido-vivo";
import { ATOMOS_PROPIOS, VISTAS_COMPONENTE } from "../index";
import { entradaDeVista, TOPE_INICIAL } from "../contenido-vivo";

const entradas = (contexto: ContextoVivo, publicacion: string, grupos: EntradaContenidoVivo["tareasPorNivel"], niveles: EntradaContenidoVivo["niveles"]): EntradaContenidoVivo => ({
  publicacion,
  niveles,
  tareasPorNivel: grupos,
  contexto,
});

const contextoLocal: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 1000,
  topeMes: 500,
  gastadoMes: 0,
  neurona: { gpu: true, capaz3d: true },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

const contextoHiggsfield: ContextoVivo = {
  alcance: "publica",
  conectados: ["higgsfield"],
  cupoHoy: {},
  creditosDisponibles: 200,
  topeMes: 100,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

describe("átomo contenido-vivo", () => {
  it("está registrado como átomo propio y pasa la definición", () => {
    expect(ATOMOS_PROPIOS.some((a) => a.herramientaId === "contenido-vivo")).toBe(true);
    expect(CONTENIDO_VIVO.nombre).toContain("Contenido vivo");
    expect(CONTENIDO_VIVO.parametros.length).toBeGreaterThan(0);
  });

  it("un plan solo local no pide confirmación y no cotiza créditos", () => {
    const plan = planContenidoVivo(
      entradas(contextoLocal, "Carta de la Sangha",
        [{ nivel: 1, tareas: ["escena-3d"] }, { nivel: 3, tareas: ["grafico-vivo"] }],
        [1, 3]),
    );
    expect(plan.publicacion).toBe("Carta de la Sangha");
    expect(plan.pasos.length).toBe(2);
    for (const paso of plan.pasos) {
      expect(paso.tipo).toBe("local");
      expect(paso.creditos).toBe(0);
      expect(paso.rutaId).not.toBeNull();
    }
    expect(plan.cotizacion).toEqual([]);
    expect(plan.totalCreditos).toBe(0);
    expect(plan.necesitaConfirmar).toBe(false);
  });

  it("un plan con Higgsfield pide el «sí» y suma los créditos por servicio", () => {
    const plan = planContenidoVivo(
      entradas(contextoHiggsfield, "Dossier de la página",
        [{ nivel: 2, tareas: ["foto", "fotograma-clave"] }],
        [2]),
    );
    expect(plan.cotizacion).toEqual([{ servicio: "higgsfield", creditos: 4 }]);
    expect(plan.totalCreditos).toBe(4);
    expect(plan.necesitaConfirmar).toBe(true);
    for (const paso of plan.pasos) {
      expect(paso.rutaId).toBe("higgsfield-nano-banana-2");
      expect(paso.enlaceConectar).toBe("https://higgsfield.ai");
      expect(paso.creditos).toBe(2);
    }
  });

  it("una tarea sin ruta disponible queda marcada sin ruta y sin cotización", () => {
    const plan = planContenidoVivo(
      entradas({ ...contextoHiggsfield, conectados: [] }, "Cartel del evento",
        [{ nivel: 2, tareas: ["foto"] }],
        [2]),
    );
    expect(plan.pasos.length).toBe(1);
    expect(plan.pasos[0].rutaId).toBeNull();
    expect(plan.pasos[0].razon).toContain("Sin ruta disponible para foto");
    expect(plan.totalCreditos).toBe(0);
    expect(plan.necesitaConfirmar).toBe(false);
  });

  it("la vista de la interfaz queda registrada en VISTAS_COMPONENTE", () => {
    expect(CONTENIDO_VIVO.vista?.tipo).toBe("componente");
    expect(typeof VISTAS_COMPONENTE["contenido-vivo"]).toBe("function");
  });

  it("la entrada de la vista sale de los niveles del átomo y de lo conectado", () => {
    const entrada = entradaDeVista({ niveles: 3, publicacion: "Cartel del evento" }, "publica", ["higgsfield"], false);
    expect(entrada.publicacion).toBe("Cartel del evento");
    expect(entrada.niveles).toEqual([1, 2, 3]);
    expect(entrada.tareasPorNivel[0]).toEqual({ nivel: 1, tareas: ["escena-3d"] });
    expect(entrada.contexto.conectados).toEqual(["higgsfield"]);
    expect(entrada.contexto.topeMes).toBe(TOPE_INICIAL);
    expect(entrada.contexto.ajustes.localPrimero).toBe(true);
    // El parámetro no baja de 0 ni sube de 3: un valor de 9 toma el máximo.
    const entradaAlTope = entradaDeVista({ niveles: 9 }, "perfil", [], false);
    expect(entradaAlTope.niveles).toEqual([1, 2, 3]);
    expect(entradaAlTope.publicacion).toBe("Esta publicación");
  });
});
