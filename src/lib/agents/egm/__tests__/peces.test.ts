import { describe, it, expect } from "vitest";
import {
  promptDePez,
  leerObjeciones,
  veredicto,
  type Objecion,
  type TipoArtefacto,
} from "@/lib/agents/egm/peces";

describe("promptDePez · revisor sin contexto", () => {
  it("incluye el artefacto y su tipo en el prompt", () => {
    const prompt = promptDePez(
      "Ola 1104R: agrega cinco repos a la Librería del OS.",
      "ola",
    );
    expect(prompt).toContain("Ola 1104R: agrega cinco repos a la Librería del OS.");
    expect(prompt).toContain("ola");
  });

  it("ordena contestar objeción por línea con las tres gravedades", () => {
    const prompt = promptDePez("Plan con dos fases", "plan");
    expect(prompt).toContain("bloquea");
    expect(prompt).toContain("importa");
    expect(prompt).toContain("menor");
  });

  it("acepta los cinco tipos de artefacto sin inventar texto", () => {
    const tipos: TipoArtefacto[] = ["respuesta", "plan", "ola", "página", "app"];
    for (const tipo of tipos) {
      const prompt = promptDePez("Artefacto de prueba.", tipo);
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain("Artefacto de prueba.");
    }
  });
});

describe("leerObjeciones · salida real de un modelo, con ruido", () => {
  const salida = [
    "bloquea · La ola no dice quién valida el vitest, el orquestador puede integrar sin prueba.",
    "importa · El plan salta la migración de Supabase antes del cableado.",
    "Texto del modelo sin gravedad: esta línea se ignora.",
    "menor · Falta un acento en un texto de la interfaz.",
    "2. importa · El plan salta la migración de Supabase antes del cableado",
    "- BLOQUEA | La respuesta promete un modelo de pago, va contra gratis primero",
  ].join("\n");

  it("extrae las objeciones con gravedad y texto, en orden", () => {
    expect(leerObjeciones(salida)).toEqual([
      { gravedad: "bloquea", texto: "La ola no dice quién valida el vitest, el orquestador puede integrar sin prueba." },
      { gravedad: "importa", texto: "El plan salta la migración de Supabase antes del cableado." },
      { gravedad: "menor", texto: "Falta un acento en un texto de la interfaz." },
      { gravedad: "bloquea", texto: "La respuesta promete un modelo de pago, va contra gratis primero" },
    ]);
  });

  it("ignora líneas sin gravedad al principio o la línea vacía", () => {
    expect(leerObjeciones("el menor de los problemas apareció después\n\n")).toEqual([]);
    expect(leerObjeciones("")).toEqual([]);
  });

  it("quita duplicados aunque cambien viñetas, mayúsculas o puntuación", () => {
    const texto = [
      "importa · El plan omite el orden de las migraciones.",
      "- Importa · El plan omite el orden de las migraciones.",
      "menor · Título repetido en dos secciones.",
      "menor ·     título     repetido en dos secciones. ",
    ].join("\n");
    expect(leerObjeciones(texto)).toEqual([
      { gravedad: "importa", texto: "El plan omite el orden de las migraciones." },
      { gravedad: "menor", texto: "Título repetido en dos secciones." },
    ]);
  });
});

describe("veredicto · pasa solo si no hay bloquea", () => {
  it("con objeciones menores e importa: pasa y no hay bloqueantes", () => {
    const objeciones: Objecion[] = [
      { gravedad: "menor", texto: "Errata menor." },
      { gravedad: "importa", texto: "Falta justificar la elección." },
    ];
    expect(veredicto(objeciones)).toEqual({ pasa: true, bloqueantes: [] });
  });

  it("con una objeción bloquea: no pasa y la lista ordena", () => {
    const objeciones: Objecion[] = [
      { gravedad: "importa", texto: "Falta justificar la elección." },
      { gravedad: "bloquea", texto: "Integraría una clave dentro del repo." },
      { gravedad: "menor", texto: "Errata menor." },
    ];
    const veredicto1 = veredicto(objeciones);
    expect(veredicto1.pasa).toBe(false);
    expect(veredicto1.bloqueantes).toEqual([
      { gravedad: "bloquea", texto: "Integraría una clave dentro del repo." },
    ]);
  });

  it("sin objeciones: pasa limpio", () => {
    expect(veredicto([])).toEqual({ pasa: true, bloqueantes: [] });
  });
});
