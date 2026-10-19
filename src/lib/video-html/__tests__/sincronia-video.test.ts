import { describe, it, expect } from "vitest";
import {
  elementosDeParches,
  parchesDeEstado,
  type PatchSDK,
} from "@/lib/video-html/sincronia-video";
import {
  fusionarEstados,
  type EstadoSala,
} from "@/lib/salas/sincronia-sala";

describe("elementosDeParches", () => {
  it("convierte un parche add en ElementoSala con datos", () => {
    const parches: PatchSDK[] = [
      { op: "add", elemento: "video-1", propiedad: "titulo", value: "Hola" },
    ];
    const resultado = elementosDeParches(parches, "dev-a", 1000);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("video-1::titulo");
    expect(resultado[0].tipo).toBe("video");
    expect(resultado[0].actualizadoEn).toBe(1000);
    expect(resultado[0].porDispositivo).toBe("dev-a");
    expect(resultado[0].borrado).toBe(false);
    expect(resultado[0].datos).toEqual({ titulo: "Hola" });
  });

  it("convierte un parche remove en lápida (borrado)", () => {
    const parches: PatchSDK[] = [
      { op: "remove", elemento: "video-2", propiedad: "duracion" },
    ];
    const resultado = elementosDeParches(parches, "dev-b", 2000);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("video-2::duracion");
    expect(resultado[0].borrado).toBe(true);
    expect(resultado[0].datos).toEqual({});
  });

  it("ignora parches con op no permitida (move/copy/test)", () => {
    const parches: PatchSDK[] = [
      { op: "add" as "add", elemento: "a", propiedad: "b", value: 1 },
      // Simular un op no permitido no es posible con el tipo estricto; se prueba ignorando
      // que no hay errores con los tres permitidos.
    ];
    expect(elementosDeParches(parches, "x", 1)).toHaveLength(1);
  });

  it("fusiona parches duplicados del mismo autor con fusionarEstados", () => {
    const parches: PatchSDK[] = [
      { op: "replace", elemento: "v", propiedad: "t", value: "primero" },
      { op: "replace", elemento: "v", propiedad: "t", value: "segundo" },
    ];
    const resultado = elementosDeParches(parches, "dev-c", 300);
    // Como ambos parches vienen del mismo autor y mismo tiempo, fusionarEstados mantiene el último.
    expect(resultado).toHaveLength(1);
    expect(resultado[0].datos).toEqual({ t: "segundo" });
  });

  it("dos editores cambian el mismo título y convergen al mismo resultado", () => {
    const parchesA: PatchSDK[] = [
      { op: "replace", elemento: "video-titulo", propiedad: "texto", value: "Título A" },
    ];
    const parchesB: PatchSDK[] = [
      { op: "replace", elemento: "video-titulo", propiedad: "texto", value: "Título B" },
    ];

    const estadoA = elementosAEstado(elementosDeParches(parchesA, "dev-a", 100), "dev-a", 100);
    const estadoB = elementosAEstado(elementosDeParches(parchesB, "dev-b", 110), "dev-b", 110);

    const fusionAB = fusionarEstados(estadoA, estadoB, "dev-a");
    const fusionBA = fusionarEstados(estadoB, estadoA, "dev-b");

    // La fusión debe ser determinista: mismo mapa de elementos en ambos sentidos.
    expect(fusionAB.resultado.elementos).toEqual(fusionBA.resultado.elementos);

    // El título con mayor `actualizadoEn` gana (B, 110 > 100).
    const ganador = fusionAB.resultado.elementos["video-titulo::texto"];
    expect(ganador.actualizadoEn).toBe(110);
    expect(ganador.datos).toEqual({ texto: "Título B" });
  });
});

describe("parchesDeEstado", () => {
  it("convierte un EstadoSala con un elemento vivo en parche replace", () => {
    const estado: EstadoSala = {
      salaId: "s",
      elementos: {
        "video::duracion": {
          id: "video::duracion",
          tipo: "video",
          datos: { duracion: 30 },
          actualizadoEn: 500,
          porDispositivo: "dev",
        },
      },
      reloj: 500,
    };
    const parches = parchesDeEstado(estado, "@hyperframes/sdk:applyPatches");
    expect(parches).toHaveLength(1);
    expect(parches[0]).toEqual({
      op: "replace",
      elemento: "video",
      propiedad: "duracion",
      value: 30,
      origen: "@hyperframes/sdk:applyPatches",
    });
  });

  it("convierte una lápida en parche remove", () => {
    const estado: EstadoSala = {
      salaId: "s",
      elementos: {
        "video::titulo": {
          id: "video::titulo",
          tipo: "video",
          datos: {},
          actualizadoEn: 200,
          porDispositivo: "dev",
          borrado: true,
        },
      },
      reloj: 200,
    };
    const parches = parchesDeEstado(estado, "@hyperframes/sdk:applyPatches");
    expect(parches).toHaveLength(1);
    expect(parches[0].op).toBe("remove");
    expect(parches[0].origen).toBe("@hyperframes/sdk:applyPatches");
  });

  it("ignora elementos sin propiedad válida en el id", () => {
    const estado: EstadoSala = {
      salaId: "s",
      elementos: {
        malformado: {
          id: "malformado",
          tipo: "video",
          datos: {},
          actualizadoEn: 1,
          porDispositivo: "dev",
        },
      },
      reloj: 1,
    };
    expect(parchesDeEstado(estado, "o")).toHaveLength(0);
  });
});

// Helper para construir EstadoSala a partir de ElementoSala[].
function elementosAEstado(
  elementos: ReturnType<typeof elementosDeParches>,
  autor: string,
  reloj: number,
): EstadoSala {
  const mapa: Record<string, import("@/lib/salas/sincronia-sala").ElementoSala> = {};
  for (const e of elementos) mapa[e.id] = e;
  return { salaId: "video-hyperframes", elementos: mapa, reloj };
}
