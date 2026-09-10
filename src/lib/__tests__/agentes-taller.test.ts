import { describe, it, expect } from "vitest";
import {
  RECURSOS_NAVEGADOR,
  REGLAS_NAVEGADOR,
  catalogoDeclarado,
  consultarViasNavegador,
  disponibleEn,
  recomendarPara,
  type RecursoAgente,
} from "@/lib/agentes/taller";

// Por qué existe este test (2026-09-08, Ola 297 · NV1): el navegador es una
// capacidad de la MAC. Un agente del enjambre que corre en el contenedor de la
// nube NO llega al Chrome de la fundación, y pedírselo en un prompt es pedirle
// algo imposible. Aquí se vigilan las dos costuras: (1) que las tres vías de
// navegador estén declaradas con su máquina y sin nada que parezca una clave, y
// (2) que `recomendarPara` siga comportándose igual para quien ya la llama con
// tres argumentos, y filtre de verdad cuando se le dice la máquina.

/** Patrones de clave que jamás deben viajar en un catálogo de recursos. */
const PATRONES_CLAVE = ["sk-", "gsk_", "nvapi-"];

/** El recurso de la extensión de Claude, base de casi todas las pruebas. */
const CLAUDE_EN_CHROME = RECURSOS_NAVEGADOR.find((r) => r.id === "os:claude-en-chrome");

/** Un recurso sin `maquina`: tiene que valer en la Mac y en la nube. */
const SIN_MAQUINA: RecursoAgente = {
  id: "prueba:sin-maquina", tipo: "prompt", origen: "os", nombre: "Recurso portátil",
  descripcion: "No declara máquina, así que sirve en las dos.", etiquetas: ["prueba"], requiere: [],
};

const TAREA_NAVEGAR = "usar navegador web con pestañas";

describe("RECURSOS_NAVEGADOR", () => {
  it("declara las tres vías con identificadores únicos", () => {
    expect(RECURSOS_NAVEGADOR).toHaveLength(3);
    const ids = RECURSOS_NAVEGADOR.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("no lleva dentro nada que parezca una clave", () => {
    const texto = JSON.stringify(RECURSOS_NAVEGADOR);
    for (const patron of PATRONES_CLAVE) expect(texto).not.toContain(patron);
  });

  it("marca como máquina «mac» las dos vías del Chrome de Alex", () => {
    const deLaMac = RECURSOS_NAVEGADOR.filter((r) => r.maquina === "mac");
    expect(deLaMac).toHaveLength(2);
    expect(deLaMac.map((r) => r.id)).toContain("os:claude-en-chrome");
    expect(deLaMac.map((r) => r.id)).toContain("os:control-chrome");
  });

  it("atribuye a Astraura el navegador autónomo del backend 1.58", () => {
    const autonomo = RECURSOS_NAVEGADOR.find((r) => r.id === "astraura:browser-tool");
    expect(autonomo?.origen).toBe("astraura");
    expect(autonomo?.ruta).toBe("backend/app/tools/browser_tool.py");
  });

  it("declara capacidades, límites, requisitos y una comprobación inocua", () => {
    for (const recurso of RECURSOS_NAVEGADOR) {
      expect(recurso.capacidades.length).toBeGreaterThan(0);
      expect(recurso.limites.length).toBeGreaterThan(0);
      expect(recurso.requiere.length).toBeGreaterThan(0);
      expect(recurso.comprobacion.accion.length).toBeGreaterThan(0);
      expect(recurso.comprobacion.disponibleSi.length).toBeGreaterThan(0);
    }
  });

  it("no confunde una URL configurada con un browser_tool sano", () => {
    const autonomo = RECURSOS_NAVEGADOR.find((r) => r.id === "astraura:browser-tool");
    expect(autonomo?.requiere).toEqual(["ASTRAURA_158_BROWSER_TOOL_SANO"]);
    expect(autonomo?.comprobacion.disponibleSi).toContain("no basta");
  });

  it("entra entero en el catálogo declarado", () => {
    const ids = catalogoDeclarado().map((r) => r.id);
    for (const r of RECURSOS_NAVEGADOR) expect(ids).toContain(r.id);
  });

  it("lleva las cuatro reglas de navegación a un prompt del catálogo", () => {
    expect(REGLAS_NAVEGADOR).toHaveLength(4);
    const prompt = catalogoDeclarado().find((r) => r.id === "prompt:navegador");
    expect(prompt).toBeDefined();
    for (const regla of REGLAS_NAVEGADOR) expect(prompt?.descripcion).toContain(regla);
  });
});

describe("disponibleEn", () => {
  it("deja la extensión de Claude fuera de la nube y dentro de la Mac", () => {
    expect(CLAUDE_EN_CHROME).toBeDefined();
    if (!CLAUDE_EN_CHROME) return;
    expect(disponibleEn(CLAUDE_EN_CHROME, "nube")).toBe(false);
    expect(disponibleEn(CLAUDE_EN_CHROME, "mac")).toBe(true);
  });

  it("da por bueno en las dos máquinas al recurso que no declara ninguna", () => {
    expect(disponibleEn(SIN_MAQUINA, "mac")).toBe(true);
    expect(disponibleEn(SIN_MAQUINA, "nube")).toBe(true);
  });

  it("da por bueno en las dos máquinas al que dice «cualquiera»", () => {
    const autonomo = RECURSOS_NAVEGADOR.find((r) => r.id === "astraura:browser-tool");
    expect(autonomo).toBeDefined();
    if (!autonomo) return;
    expect(disponibleEn(autonomo, "mac")).toBe(true);
    expect(disponibleEn(autonomo, "nube")).toBe(true);
  });
});

describe("recomendarPara con máquina", () => {
  const IDS_NAVEGADOR = RECURSOS_NAVEGADOR.map((r) => r.id);

  it("pone delante los recursos de navegador para una tarea de navegación", () => {
    const salida = recomendarPara(catalogoDeclarado(), TAREA_NAVEGAR);
    expect(salida.length).toBeGreaterThan(0);
    expect(IDS_NAVEGADOR).toContain(salida[0].id);
  });

  it("no ofrece los recursos de la Mac a un agente que corre en la nube", () => {
    const salida = recomendarPara(catalogoDeclarado(), TAREA_NAVEGAR, 6, "nube");
    expect(salida.map((r) => r.id)).not.toContain("os:claude-en-chrome");
    expect(salida.map((r) => r.id)).not.toContain("os:control-chrome");
    for (const r of salida) expect(disponibleEn(r, "nube")).toBe(true);
  });

  it("sigue devolviendo los de la Mac cuando la máquina es la Mac", () => {
    const salida = recomendarPara(catalogoDeclarado(), TAREA_NAVEGAR, 6, "mac");
    expect(IDS_NAVEGADOR).toContain(salida[0].id);
  });

  it("no cambia el resultado de quien la llama con tres argumentos de siempre", () => {
    const catalogo = catalogoDeclarado();
    const antes = recomendarPara(catalogo, TAREA_NAVEGAR, 6);
    const dosArgumentos = recomendarPara(catalogo, TAREA_NAVEGAR);
    expect(antes.map((r) => r.id)).toEqual(dosArgumentos.map((r) => r.id));
    // Sin cuarto argumento no se filtra nada: los de la Mac siguen ahí.
    expect(antes.map((r) => r.id)).toContain("os:claude-en-chrome");
    expect(antes.length).toBeGreaterThanOrEqual(
      recomendarPara(catalogo, TAREA_NAVEGAR, 6, "nube").length,
    );
  });
});

describe("consultarViasNavegador", () => {
  const TODAS_LAS_COMPROBACIONES = [
    "CLAUDE_EN_CHROME_CONECTADO",
    "CONTROL_CHROME_CONECTADO",
    "ASTRAURA_158_BROWSER_TOOL_SANO",
  ];

  it("no declara ninguna vía viva cuando no recibió evidencia", () => {
    const consulta = consultarViasNavegador({
      maquina: "mac",
      comprobacionesSuperadas: [],
    });

    expect(consulta.disponibles).toEqual([]);
    expect(consulta.viaPreferida).toBeNull();
    expect(consulta.respuesta).toBe(
      "No hay ninguna vía de navegador comprobada como disponible ahora.",
    );
    expect(consulta.vias.every((via) => !via.disponible)).toBe(true);
  });

  it("devuelve solo la vía cuya comprobación fue superada", () => {
    const consulta = consultarViasNavegador({
      maquina: "mac",
      comprobacionesSuperadas: ["CONTROL_CHROME_CONECTADO"],
    });

    expect(consulta.disponibles.map((r) => r.id)).toEqual(["os:control-chrome"]);
    expect(consulta.viaPreferida?.id).toBe("os:control-chrome");
    expect(consulta.respuesta).toContain("Control Chrome (MCP local)");
  });

  it("en la nube descarta las vías de la Mac aunque sus sondas respondan", () => {
    const consulta = consultarViasNavegador({
      maquina: "nube",
      comprobacionesSuperadas: TODAS_LAS_COMPROBACIONES,
    });

    expect(consulta.disponibles.map((r) => r.id)).toEqual(["astraura:browser-tool"]);
    const viasMac = consulta.vias.filter((via) => via.recurso.maquina === "mac");
    expect(viasMac.every((via) => !via.maquinaCompatible && !via.disponible)).toBe(true);
  });

  it("en la Mac puede informar las tres vías si las tres fueron comprobadas", () => {
    const consulta = consultarViasNavegador({
      maquina: "mac",
      comprobacionesSuperadas: TODAS_LAS_COMPROBACIONES,
    });

    expect(consulta.disponibles.map((r) => r.id)).toEqual(
      RECURSOS_NAVEGADOR.map((r) => r.id),
    );
  });

  it("no toma el nombre de la URL de Astraura como prueba de vida", () => {
    const consulta = consultarViasNavegador({
      maquina: "nube",
      comprobacionesSuperadas: ["ASTRAURA_158_URL"],
    });

    expect(consulta.disponibles).toEqual([]);
    expect(consulta.vias.find((via) => via.recurso.id === "astraura:browser-tool")
      ?.requisitosFaltantes).toEqual(["ASTRAURA_158_BROWSER_TOOL_SANO"]);
  });
});
