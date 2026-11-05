import { describe, it, expect } from "vitest";
import {
  promptDePez,
  leerObjeciones,
  veredicto,
  type Objecion,
} from "../peces";

// Salidas realistas de un pez (modelo gratuito pequeño), con ruido de por medio.
const SALIDA_CON_RUIDO = `Reviso el artefacto y contesto:

- bloquea: el plan promete cinco tareas pero no hay cola asignada, nadie las escribirá
- importa: falta mencionar que el test del turno pudo quedar desactualizado
menor: hay una viñeta de más en la sección 3
esta línea no lleva gravedad al principio, se ignora
chequeo: esa gravedad no existe y también se ignora`;

const SALIDA_DUPLICADA = `bloquea: falta la prueba de la puerta tsc
IMPORTA: la redacción conduce a nada sin elefante; el pez no vería el contexto
— bloquea:   falta la prueba de la puerta tsc
menor: el comentario es ambiguo`;

describe("promptDePez", () => {
  it("incluye el artefacto y el tipo, fija el formato de gravedad y no filtra contexto", () => {
    const artefacto = "Plan de la Ola 42: tres tareas de puente, test y gremio.";
    const prompt = promptDePez(artefacto, "ola");
    expect(prompt).toContain(artefacto);
    expect(prompt).toContain("ola");
    expect(prompt).toContain("bloquea");
    expect(prompt).toContain("importa");
    expect(prompt).toContain("menor");
    expect(prompt).toContain("una objeción por línea");
    // Un pez no ve el cerebro ni el mando: nada de contexto ajeno en su prompt.
    expect(prompt.toLowerCase()).not.toContain("cerebro");
    expect(prompt).not.toContain("mandado");
  });

  it("se ajusta al tipo de artefacto: página, respuesta y app no se revisan igual", () => {
    expect(promptDePez("<div>Hola</div>", "pagina")).toContain("página");
    expect(promptDePez("Respuesta larga de Astraura…", "respuesta")).toContain("respuesta");
    expect(promptDePez("App de estudio de la Librería…", "app")).toContain("app");
  });

  it("aguanta un artefacto largo con comillas sin romper el formato", () => {
    const largo = Array.from(
      { length: 120 },
      (_, i) => `Línea ${i} — un "pez" sin contexto.`,
    ).join("\n");
    const prompt = promptDePez(largo, "plan");
    expect(prompt).toContain(largo);
  });
});

describe("leerObjeciones", () => {
  it("lee salida real: toma bloquea/importa/menor y descarta las líneas de ruido", () => {
    const objeciones = leerObjeciones(SALIDA_CON_RUIDO);
    expect(objeciones.map((o) => o.gravedad)).toEqual(["bloquea", "importa", "menor"]);
    expect(objeciones[0].texto).toContain("no hay cola");
    expect(objeciones[2].texto).toContain("viñeta de más");
  });

  it("quita duplicados y tolera mayúsculas, viñetas y espacios sucios", () => {
    const objeciones = leerObjeciones(SALIDA_DUPLICADA);
    expect(objeciones).toHaveLength(3);
    expect(objeciones[0].gravedad).toBe("bloquea");
    expect(objeciones[1].gravedad).toBe("importa");
    expect(objeciones[2].texto).toBe("el comentario es ambiguo");
  });

  it("con texto sin objeciones devuelve una lista vacía", () => {
    expect(leerObjeciones("Todo bien, sin objeciones.")).toEqual([]);
    expect(leerObjeciones("")).toEqual([]);
  });
});

describe("veredicto", () => {
  it("pasa si no hay bloquea; lista los bloqueantes cuando los hay", () => {
    const limpio: Objecion[] = [
      { gravedad: "menor", texto: "sobra una viñeta" },
      { gravedad: "importa", texto: "faltaría un test" },
    ];
    expect(veredicto(limpio)).toEqual({ pasa: true, bloqueantes: [] });

    const conBloqueo: Objecion[] = [
      ...limpio,
      { gravedad: "bloquea", texto: "el plan promete tareas sin cola" },
      { gravedad: "bloquea", texto: "no hay prueba de la puerta" },
    ];
    const v = veredicto(conBloqueo);
    expect(v.pasa).toBe(false);
    expect(v.bloqueantes).toHaveLength(2);
    expect(v.bloqueantes.join("  ")).toContain("sin cola");
  });

  it("sobre la salida real del pez: un solo bloquea (sin duplicados) no pasa", () => {
    const v = veredicto(leerObjeciones(SALIDA_DUPLICADA));
    expect(v.pasa).toBe(false);
    expect(v.bloqueantes).toHaveLength(1);
    expect(v.bloqueantes[0]).toContain("tsc");
  });
});
