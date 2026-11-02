import { describe, it, expect } from "vitest";
import { CONTENIDO_VIVO, planContenidoVivo, servicioDeRuta } from "../contenido-vivo";
import { ATOMOS_PROPIOS } from "../index";
import { CATALOGO_RUTAS } from "../../../contenido-vivo/catalogo-rutas";
import type { ContextoVivo } from "../../../contenido-vivo/rutas";

const LOCAL: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 5000,
  topeMes: 2000,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: true, externosPermitidos: false },
};

const HIGGSFIELD: ContextoVivo = {
  ...LOCAL, conectados: ["higgsfield"],
  cupoHoy: { higgsfield: 200 },
  ajustes: { localPrimero: false, externosPermitidos: true },
};

describe("átomo contenido-vivo", () => {
  it("se registra en el índice y declara los tres niveles", () => {
    expect(CONTENIDO_VIVO.herramientaId).toBe("contenido-vivo");
    expect(ATOMOS_PROPIOS).toContain(CONTENIDO_VIVO);
    const niveles = CONTENIDO_VIVO.parametros.find((p) => p.id === "nivel");
    expect(niveles?.tipo).toBe("opcion");
    expect(niveles?.opciones).toEqual(["1", "2", "3"]);
  });

  it("un plan solo local no pide confirmación ni suma créditos", () => {
    const plan = planContenidoVivo({
      publicacion: { id: "pub-1", titulo: "Publicación local" },
      niveles: [1, 3],
      tareas: [
        { tarea: "escena-3d", nivel: 1 },
        { tarea: "grafico-vivo", nivel: 3 },
        { tarea: "revision-texto", nivel: 3 },
      ],
      contexto: LOCAL,
    });
    expect(plan.necesitaConfirmar).toBe(false);
    expect(plan.creditosTotales).toBe(0);
    expect(plan.cotizacion).toEqual([]);
    expect(plan.niveles).toEqual([1, 3]);
    expect(plan.tareas).toHaveLength(3);
    for (const tarea of plan.tareas) {
      expect(tarea.ejecutable).toBe(true);
      expect(tarea.ruta?.ruta.tipo).toBe("local");
      expect(tarea.creditos).toBe(0);
    }
  });

  it("un plan con Higgsfield pide confirmación y cotiza por servicio", () => {
    const plan = planContenidoVivo({
      publicacion: { id: "pub-2", titulo: "Película" },
      niveles: [2],
      tareas: [{ tarea: "clip-pelicula", nivel: 2 }],
      contexto: HIGGSFIELD,
    });
    expect(plan.tareas[0].ruta?.ruta.id).toBe("higgsfield-seedance-2-1080");
    expect(plan.tareas[0].ejecutable).toBe(true);
    expect(plan.creditosTotales).toBe(60);
    expect(plan.cotizacion).toEqual([{ servicio: "higgsfield", creditos: 60 }]);
    expect(plan.necesitaConfirmar).toBe(true);
  });

  it("multiplica por cantidad y agrupa los créditos del mismo servicio", () => {
    const plan = planContenidoVivo({
      publicacion: { id: "pub-3", titulo: "Escenas y fotos" },
      niveles: [2],
      tareas: [
        { tarea: "clip-pelicula", nivel: 2, cantidad: 2 },
        { tarea: "foto", nivel: 2, cantidad: 3 },
      ],
      contexto: HIGGSFIELD,
    });
    expect(plan.creditosTotales).toBe(126);
    expect(plan.cotizacion).toEqual([{ servicio: "higgsfield", creditos: 126 }]);
  });

  it("ignora las tareas de niveles que no están en el plan", () => {
    const plan = planContenidoVivo({
      publicacion: { id: "pub-4", titulo: "Solo nivel 1" },
      niveles: [1],
      tareas: [
        { tarea: "foto", nivel: 2 },
        { tarea: "escena-3d" },
      ],
      contexto: LOCAL,
    });
    expect(plan.tareas).toHaveLength(1);
    expect(plan.tareas[0].tarea).toBe("escena-3d");
    expect(plan.tareas[0].nivel).toBe(1);
    expect(plan.avisos.join(" ")).toContain("nivel");
  });

  it("no inventa ruta cuando no hay ninguna disponible", () => {
    const plan = planContenidoVivo({
      publicacion: { id: "pub-5", titulo: "Sin ruta" },
      niveles: [2],
      tareas: [{ tarea: "foto", nivel: 2 }],
      contexto: LOCAL,
    });
    expect(plan.tareas[0].ruta).toBeNull();
    expect(plan.tareas[0].ejecutable).toBe(false);
    expect(plan.tareas[0].creditos).toBe(0);
    expect(plan.avisos.join(" ")).toContain("No hay ruta");
    expect(plan.necesitaConfirmar).toBe(false);
  });

  it("saca el servicio del id de la ruta", () => {
    const ruta = CATALOGO_RUTAS.find((r) => r.id === "higgsfield-seedance-2-1080");
    if (!ruta) throw new Error("Falta la ruta de Higgsfield en el catálogo");
    expect(servicioDeRuta(ruta)).toBe("higgsfield");
    expect(servicioDeRuta(CATALOGO_RUTAS.find((r) => r.id === "threejs-escena3d")!)).toBe("local");
  });
});
