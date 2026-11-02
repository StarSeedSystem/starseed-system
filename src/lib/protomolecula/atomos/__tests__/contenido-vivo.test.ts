/**
 * Pruebas del átomo «Contenido vivo» (CVV1028F, tarea F · contrato §7).
 * Funciones puras: planificar la publicación viva sin ejecutar nada externo.
 */
import { describe, it, expect } from "vitest";
import { CONTENIDO_VIVO, planificarContenidoVivo, type EntradaContenidoVivo } from "../contenido-vivo";
import { ATOMOS_PROPIOS } from "../index";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

const BASE: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 6000,
  topeMes: 2000,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: true },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

describe("átomo contenido-vivo", () => {
  it("está registrado entre los átomos propios del índice", () => {
    expect(ATOMOS_PROPIOS).toContain(CONTENIDO_VIVO);
    expect(CONTENIDO_VIVO.herramientaId).toBe("contenido-vivo");
  });

  it("declara el contrato del átomo", () => {
    expect(CONTENIDO_VIVO.herramientaId).toBe("contenido-vivo");
    expect(CONTENIDO_VIVO.nombre).toContain("Contenido vivo");
    expect(CONTENIDO_VIVO.parametros.map((p) => p.id)).toEqual(["niveles", "movimiento"]);
    expect(CONTENIDO_VIVO.parametros[1].opciones).toEqual(["apagado", "encendido", "rayos-x"]);
  });

  it("un plan solo-local no pide confirmación y no gasta créditos", () => {
    const entrada: EntradaContenidoVivo = {
      publicacion: "publica-42",
      niveles: [2, 3],
      tareas: [
        { nivel: 3, tareas: ["grafico-vivo"] },
        { nivel: 2, tareas: ["comprobacion"] },
      ],
      contexto: BASE,
    };
    const plan = planificarContenidoVivo(entrada);
    expect(plan.publicacion).toBe("publica-42");
    expect(plan.tareas.map((t) => t.tipo)).toEqual(["local", "local"]);
    expect(plan.tareas.map((t) => t.rutaId)).toEqual(["hyperframes-grafico-vivo", "comprobacion-local"]);
    expect(plan.creditosTotales).toBe(0);
    expect(plan.creditosPorServicio).toEqual({});
    expect(plan.necesitaConfirmar).toBe(false);
    expect(plan.sinRuta).toEqual([]);
  });

  it("un plan con Higgsfield pide el sí y suma los créditos por servicio", () => {
    const entrada: EntradaContenidoVivo = {
      publicacion: "publica-42",
      niveles: [2],
      tareas: [{ nivel: 2, tareas: ["foto", "clip-pelicula"] }],
      contexto: { ...BASE, conectados: ["higgsfield"] },
    };
    const plan = planificarContenidoVivo(entrada);
    expect(plan.necesitaConfirmar).toBe(true);
    // La puntuación de la tarea B (calidad menos coste relativo al tope) elige 1080p: 0.95 - 60/2000 > 0.885.
    expect(plan.tareas.map((t) => t.rutaId)).toEqual(["higgsfield-nano-banana-2", "higgsfield-seedance-2-1080"]);
    expect(plan.creditosPorServicio).toEqual({ higgsfield: 62 });
    expect(plan.creditosTotales).toBe(62);
  });

  it("apunta sin ruta lo que el ámbito no puede, en vez de inventar una", () => {
    const entrada: EntradaContenidoVivo = {
      publicacion: "publica-7",
      niveles: [2],
      tareas: [{ nivel: 2, tareas: ["clip-pelicula"] }],
      contexto: { ...BASE, alcance: "personal" },
    };
    const plan = planificarContenidoVivo(entrada);
    expect(plan.tareas).toEqual([]);
    expect(plan.sinRuta).toEqual([{ nivel: 2, tarea: "clip-pelicula", motivo: "Sin ruta disponible para esta tarea en este ámbito" }]);
    expect(plan.necesitaConfirmar).toBe(false);
  });
});
