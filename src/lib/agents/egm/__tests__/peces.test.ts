import { describe, expect, it } from "vitest";

import {
  leerObjeciones,
  promptDePez,
  veredicto,
  type TipoArtefacto,
} from "../peces";

const RESPUESTA_REAL = `Claro, aquí tienes mi revisión.

- bloquea: La respuesta afirma que el despliegue está publicado, pero no hay ninguna evidencia ni fecha.
- **Importa:** No explica qué hacer si falla la migración.
* menor: Hay dos comas de más en la introducción.
Esto es una línea de ruido sin gravedad.
bloquea: La respuesta afirma que el despliegue está publicado, pero no hay ninguna evidencia ni fecha.
---
Sin objeciones.
`;

const CON_RUIDO = `Gravedad: BLOQUEA — La app no declara permisos.
2) [importa] La página tarda en cargar.
- _menor_: Título con mayúsculas de más.
**bloquea** sin dos puntos y con texto
Importa
bloquea:
> cita de un documento que no es una objeción
`;

describe("promptDePez · revisor sin contexto", () => {
  it("incluye el artefacto y el tipo, y prohíbe usar contexto externo", () => {
    const prompt = promptDePez("La propuesta dice hola.", "plan");
    expect(prompt).toContain("La propuesta dice hola.");
    expect(prompt).toContain("plan");
    expect(prompt.toLowerCase()).toContain("no tienes contexto");
  });

  it("pide una objeción por línea con las tres gravedades", () => {
    const prompt = promptDePez("Artefacto de prueba", "respuesta");
    expect(prompt).toContain("bloquea:");
    expect(prompt).toContain("importa:");
    expect(prompt).toContain("menor:");
    expect(prompt.toLowerCase()).toContain("una objeción por línea");
    expect(prompt.toLowerCase()).toContain("sin objeciones");
  });

  it("cada tipo de artefacto se nombra en su propio prompt", () => {
    const tipos: TipoArtefacto[] = ["respuesta", "plan", "ola", "pagina", "app"];
    for (const tipo of tipos) {
      const prompt = promptDePez("mismo artefacto", tipo);
      expect(prompt).toContain(`(${tipo})`);
    }
  });
});

describe("leerObjeciones · tolerante al texto real de un modelo", () => {
  it("lee las tres gravedades, ignora el ruido y quita duplicados", () => {
    expect(leerObjeciones(RESPUESTA_REAL)).toEqual([
      {
        gravedad: "bloquea",
        texto:
          "La respuesta afirma que el despliegue está publicado, pero no hay ninguna evidencia ni fecha.",
      },
      {
        gravedad: "importa",
        texto: "No explica qué hacer si falla la migración.",
      },
      {
        gravedad: "menor",
        texto: "Hay dos comas de más en la introducción.",
      },
    ]);
  });

  it("acepta negritas, corchetes, numeración, mayúsculas y «Gravedad:»", () => {
    const objeciones = leerObjeciones(CON_RUIDO);
    expect(objeciones.map((o) => o.gravedad)).toEqual([
      "bloquea",
      "importa",
      "menor",
      "bloquea",
    ]);
    expect(objeciones[0].texto).toBe("La app no declara permisos.");
    expect(objeciones[3].texto).toBe("sin dos puntos y con texto");
  });

  it("sin gravedad o sin texto no inventa objeciones", () => {
    expect(leerObjeciones("No hay objeciones, todo correcto.")).toEqual([]);
    expect(leerObjeciones("")).toEqual([]);
    expect(leerObjeciones("bloquea:   ")).toEqual([]);
  });
});

describe("veredicto · pasa solo si nada bloquea", () => {
  it("con importa y menor, pasa y no hay bloqueantes", () => {
    const objeciones = leerObjeciones(CON_RUIDO).filter(
      (o) => o.gravedad !== "bloquea",
    );
    expect(veredicto(objeciones)).toEqual({ pasa: true, bloqueantes: [] });
  });

  it("con una objeción bloquea, no pasa y la devuelve", () => {
    const objeciones = leerObjeciones(RESPUESTA_REAL);
    const resultado = veredicto(objeciones);
    expect(resultado.pasa).toBe(false);
    expect(resultado.bloqueantes).toHaveLength(1);
    expect(resultado.bloqueantes[0].gravedad).toBe("bloquea");
  });

  it("sin objeciones, pasa", () => {
    expect(veredicto([])).toEqual({ pasa: true, bloqueantes: [] });
  });
});
