import { describe, it, expect } from "vitest";
import {
  elementosDeParches,
  parchesDeEstado,
} from "../sincronia-video";
import { fusionarEstados, type EstadoSala } from "@/lib/salas/sincronia-sala";

describe("elementosDeParches", () => {
  it("convierte add/replace en ElementoSala con id elemento::propiedad", () => {
    const elementos = elementosDeParches(
      [{ op: "add", path: "titulo", value: { texto: "Intro" } }],
      "editor-a",
      1000,
    );
    expect(elementos["elemento::titulo"]).toBeDefined();
    expect(elementos["elemento::titulo"].id).toBe("elemento::titulo");
    expect(elementos["elemento::titulo"].tipo).toBe("parametro");
    expect(elementos["elemento::titulo"].actualizadoEn).toBe(1000);
    expect(elementos["elemento::titulo"].porDispositivo).toBe("editor-a");
    expect(elementos["elemento::titulo"].borrado).toBeFalsy();
    expect(elementos["elemento::titulo"].datos).toEqual({ texto: "Intro" });
  });

  it("convierte remove en lápida (borrado: true)", () => {
    const elementos = elementosDeParches(
      [
        { op: "add", path: "duracion", value: { ms: 3000 } },
        { op: "remove", path: "duracion" },
      ],
      "editor-b",
      2000,
    );
    expect(elementos["elemento::duracion"].borrado).toBe(true);
    expect(elementos["elemento::duracion"].actualizadoEn).toBe(2000);
  });

  it("ignora parches con op no permitidos (move, copy, test)", () => {
    const elementos = elementosDeParches(
      [
        { op: "add", path: "a", value: 1 },
        { op: "move" as any, path: "/a/b", value: null },
        { op: "copy", path: "/a", value: null },
        { op: "test", path: "/x", value: null },
      ],
      "editor-c",
      3000,
    );
    expect(Object.keys(elementos)).toHaveLength(1);
    expect(elementos["elemento::a"]).toBeDefined();
  });

  it("usa fusionarEstados internamente para resolver conflictos de parches", () => {
    // Un add seguido de un remove para la misma propiedad debe terminar como lápida.
    const elementos = elementosDeParches(
      [
        { op: "add", path: "titulo", value: { texto: "V1" } },
        { op: "replace", path: "titulo", value: { texto: "V2" } },
        { op: "remove", path: "titulo" },
      ],
      "editor-d",
      4000,
    );
    expect(elementos["elemento::titulo"].borrado).toBe(true);
    expect(elementos["elemento::titulo"].actualizadoEn).toBe(4000);
  });
});

describe("parchesDeEstado", () => {
  it("hace el recorrido inverso para comp.applyPatches con origen", () => {
    const estado: EstadoSala = {
      salaId: "video-hyperframes",
      elementos: {
        "elemento::titulo": {
          id: "elemento::titulo",
          tipo: "parametro",
          datos: { texto: "Hola" },
          actualizadoEn: 5000,
          porDispositivo: "editor-x",
        },
        "elemento::duracion": {
          id: "elemento::duracion",
          tipo: "parametro",
          datos: { ms: 3000 },
          actualizadoEn: 5100,
          porDispositivo: "editor-y",
          borrado: true,
        },
      },
      reloj: 5100,
    };
    const parches = parchesDeEstado(estado, "@hyperframes/sdk:applyPatches");
    expect(parches).toHaveLength(2);

    const tituloPatch = parches.find((p) => p.path === "titulo");
    expect(tituloPatch?.op).toBe("replace");
    expect(tituloPatch?.value).toEqual({ texto: "Hola" });
    expect(tituloPatch?.origen).toBe("@hyperframes/sdk:applyPatches");

    const duracionPatch = parches.find((p) => p.path === "duracion");
    expect(duracionPatch?.op).toBe("remove");
    expect(duracionPatch?.origen).toBe("@hyperframes/sdk:applyPatches");
  });

  it("devuelve [] para un estado vacío", () => {
    const estado: EstadoSala = {
      salaId: "video-hyperframes",
      elementos: {},
      reloj: 0,
    };
    expect(parchesDeEstado(estado, "@hyperframes/sdk:applyPatches")).toEqual([]);
  });
});

describe("fusión de cambios concurrentes (dos editores, mismo elemento)", () => {
  it("dos editores cambian el mismo título a la vez y convergen al mismo resultado", () => {
    // Editor A cambia el título en t=1000
    const estadoA = {
      salaId: "video-hyperframes",
      elementos: elementosDeParches(
        [{ op: "replace", path: "titulo", value: { texto: "A" } }],
        "editor-a",
        1000,
      ),
      reloj: 1000,
    };

    // Editor B cambia el mismo título con el mismo valor en t=1000 (simulando simultaneidad)
    const estadoB = {
      salaId: "video-hyperframes",
      elementos: elementosDeParches(
        [{ op: "replace", path: "titulo", value: { texto: "B" } }],
        "editor-b",
        1000,
      ),
      reloj: 1000,
    };

    // La fusión debe ser simétrica: A + B y B + A dan el mismo mapa de elementos.
    // Según fusionarEstados, con el mismo actualizadoEn gana el dispositivo alfabéticamente menor.
    const fusionAB = fusionarEstados(estadoA, estadoB, "editor-a");
    const fusionBA = fusionarEstados(estadoB, estadoA, "editor-b");

    // El elemento debe existir en ambos resultados con el mismo id.
    expect(fusionAB.resultado.elementos["elemento::titulo"]).toBeDefined();
    expect(fusionBA.resultado.elementos["elemento::titulo"]).toBeDefined();

    // Como "editor-a" < "editor-b" alfabéticamente, gana el cambio de A en ambos sentidos
    // (el remoto B no es mi dispositivo, así que no se ignora; ganaSobre compara porDispositivo).
    expect(fusionAB.resultado.elementos["elemento::titulo"].porDispositivo).toBe("editor-a");
    expect(fusionBA.resultado.elementos["elemento::titulo"].porDispositivo).toBe("editor-a");

    // El valor final debe ser el de A (gana el dispositivo alfabéticamente menor con mismo t).
    expect(fusionAB.resultado.elementos["elemento::titulo"].datos).toEqual({ texto: "A" });
    expect(fusionBA.resultado.elementos["elemento::titulo"].datos).toEqual({ texto: "A" });

    // No debe haber conflicto si los valores son distintos pero el tiempo empata: hay conflicto
    // porque los dispositivos son distintos. Verificamos que el conflicto se reporta.
    expect(fusionAB.conflictos.includes("elemento::titulo")).toBe(true);
  });

  it("un cambio más reciente siempre gana, sea cual sea el orden de fusión", () => {
    // A con t=500 (más antiguo)
    const estadoA = {
      salaId: "video-hyperframes",
      elementos: elementosDeParches(
        [{ op: "replace", path: "titulo", value: { texto: "A" } }],
        "editor-a",
        500,
      ),
      reloj: 500,
    };

    // B con t=1500 (más reciente)
    const estadoB = {
      salaId: "video-hyperframes",
      elementos: elementosDeParches(
        [{ op: "replace", path: "titulo", value: { texto: "B" } }],
        "editor-b",
        1500,
      ),
      reloj: 1500,
    };

    const fusionAB = fusionarEstados(estadoA, estadoB, "editor-a");
    const fusionBA = fusionarEstados(estadoB, estadoA, "editor-b");

    // En ambos sentidos debe ganar el cambio más reciente (B, t=1500).
    expect(fusionAB.resultado.elementos["elemento::titulo"].actualizadoEn).toBe(1500);
    expect(fusionBA.resultado.elementos["elemento::titulo"].actualizadoEn).toBe(1500);
    expect(fusionAB.resultado.elementos["elemento::titulo"].porDispositivo).toBe("editor-b");
    expect(fusionBA.resultado.elementos["elemento::titulo"].porDispositivo).toBe("editor-b");
    expect(fusionAB.resultado.elementos["elemento::titulo"].datos).toEqual({ texto: "B" });
  });
});
