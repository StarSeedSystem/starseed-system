/**
 * chat-herramientas — cubre la selección de habilidades/conectores del
 * picker «Conectores y habilidades»: el sentinela "Todas" (`undefined`), el
 * alternado con colapso automático, el estado honesto de un conector
 * («instalado · falta conectar») y la migración del universo legado de
 * habilidades. Todo puro: sin red, sin DOM, sin localStorage.
 */

import { describe, expect, it } from "vitest";
import {
  HABILIDADES_UNIVERSO_LEGADO,
  HERRAMIENTAS_DEFAULTS_VERSION,
  alternarHerramienta,
  alternarTodasHerramientas,
  contarHerramientasActivas,
  estadoConector,
  etiquetaEstadoConector,
  herramientaActiva,
  migrarSeleccionHabilidades,
  resumenPickerHerramientas,
  todasHerramientasActivas,
} from "@/lib/astraura/chat-herramientas";

const TODOS = ["av-gen", "taste", "pm", "web-senses", "research", "vision"];

describe("herramientaActiva / todasHerramientasActivas / contarHerramientasActivas", () => {
  it("sin selección explícita (undefined) todo está activo — «Todas» por defecto", () => {
    for (const id of TODOS) expect(herramientaActiva(undefined, id)).toBe(true);
    expect(todasHerramientasActivas(undefined, TODOS)).toBe(true);
    expect(contarHerramientasActivas(undefined, TODOS)).toBe(TODOS.length);
  });

  it("con selección explícita, solo cuentan los ids listados", () => {
    const sel = ["taste", "pm"];
    expect(herramientaActiva(sel, "taste")).toBe(true);
    expect(herramientaActiva(sel, "vision")).toBe(false);
    expect(todasHerramientasActivas(sel, TODOS)).toBe(false);
    expect(contarHerramientasActivas(sel, TODOS)).toBe(2);
  });

  it("un array vacío explícito es «ninguna activa»", () => {
    expect(todasHerramientasActivas([], TODOS)).toBe(false);
    expect(contarHerramientasActivas([], TODOS)).toBe(0);
  });
});

describe("alternarHerramienta", () => {
  it("desde «Todas» (undefined), apagar UNA deja el resto explícitamente activo", () => {
    const siguiente = alternarHerramienta(undefined, TODOS, "vision");
    expect(siguiente).toEqual(TODOS.filter((id) => id !== "vision"));
  });

  it("volver a encender la última apagada colapsa otra vez a «Todas» (undefined)", () => {
    const apagada = alternarHerramienta(undefined, TODOS, "vision");
    const reencendida = alternarHerramienta(apagada, TODOS, "vision");
    expect(reencendida).toBeUndefined();
  });

  it("ignora ids que no pertenecen al catálogo (defensivo)", () => {
    expect(alternarHerramienta(undefined, TODOS, "no-existe")).toBeUndefined();
  });

  it("filtra ids obsoletos de una selección explícita antes de alternar", () => {
    const conObsoleto = ["taste", "id-borrado-del-catalogo"];
    const siguiente = alternarHerramienta(conObsoleto, TODOS, "pm");
    expect(siguiente).toEqual(["taste", "pm"]);
  });
});

describe("alternarTodasHerramientas (interruptor maestro)", () => {
  it("desde «Todas» activas, apaga todo (array vacío)", () => {
    expect(alternarTodasHerramientas(undefined, TODOS)).toEqual([]);
  });

  it("desde una selección parcial o vacía, enciende todo (undefined)", () => {
    expect(alternarTodasHerramientas(["taste"], TODOS)).toBeUndefined();
    expect(alternarTodasHerramientas([], TODOS)).toBeUndefined();
  });
});

describe("estadoConector / etiquetaEstadoConector", () => {
  it("desactivado si no está seleccionado para el chat", () => {
    const e = estadoConector({ seleccionado: false, conectado: true, sinCredenciales: false });
    expect(e).toBe("desactivado");
    expect(etiquetaEstadoConector(e)).toBe("desactivado para este chat");
  });

  it("activo si está seleccionado y conectado", () => {
    const e = estadoConector({ seleccionado: true, conectado: true, sinCredenciales: false });
    expect(e).toBe("activo");
  });

  it("activo si está seleccionado y no requiere credenciales (browser-local)", () => {
    const e = estadoConector({ seleccionado: true, conectado: false, sinCredenciales: true });
    expect(e).toBe("activo");
  });

  it("«instalado · falta conectar» — honestidad: seleccionado pero sin credenciales", () => {
    const e = estadoConector({ seleccionado: true, conectado: false, sinCredenciales: false });
    expect(e).toBe("falta-conectar");
    expect(etiquetaEstadoConector(e)).toBe("instalado · falta conectar");
  });
});

describe("resumenPickerHerramientas", () => {
  it("formatea la cabecera con los cuatro números", () => {
    expect(
      resumenPickerHerramientas({
        habilidadesActivas: 12,
        habilidadesTotal: 56,
        conectoresActivos: 5,
        conectoresTotal: 21,
      }),
    ).toBe("12 de 56 habilidades · 5 conectores activos (de 21)");
  });

  it("singulariza 1 habilidad / 1 conector", () => {
    expect(
      resumenPickerHerramientas({
        habilidadesActivas: 1,
        habilidadesTotal: 1,
        conectoresActivos: 1,
        conectoresTotal: 1,
      }),
    ).toBe("1 de 1 habilidad · 1 conector activo (de 1)");
  });
});

describe("migrarSeleccionHabilidades", () => {
  const CATALOGO = [...HABILIDADES_UNIVERSO_LEGADO, "av-gen", "bonsai-engine"];

  it("sin versión y sin selección explícita («Todas»): no hay nada que migrar, solo se estampa la versión", () => {
    const r = migrarSeleccionHabilidades(undefined, undefined, CATALOGO);
    expect(r.seleccion).toBeUndefined();
    expect(r.version).toBe(HERRAMIENTAS_DEFAULTS_VERSION);
    expect(r.cambio).toBe(true);
  });

  it("selección legada explícita: añade las habilidades NUEVAS (fuera del universo legado) sin tocar lo ya decidido", () => {
    // El usuario, con el menú viejo de 8 ids, solo había activado "taste".
    const r = migrarSeleccionHabilidades(["taste"], undefined, CATALOGO);
    expect(r.version).toBe(HERRAMIENTAS_DEFAULTS_VERSION);
    expect(r.cambio).toBe(true);
    // "taste" se conserva; "av-gen"/"bonsai-engine" (nunca elegibles antes) entran solas;
    // el resto del universo legado ("pm", "web-senses"…) sigue apagado: eso SÍ lo decidió el usuario.
    expect(r.seleccion).toEqual(["taste", "av-gen", "bonsai-engine"]);
    expect(r.seleccion).not.toContain("pm");
  });

  it("si la migración cubre el catálogo entero, colapsa a «Todas» (undefined)", () => {
    const r = migrarSeleccionHabilidades([...CATALOGO], undefined, CATALOGO);
    expect(r.seleccion).toBeUndefined();
  });

  it("ya migrado (version actual): se respeta ÍNTEGRO, incluso si el usuario apagó una habilidad nueva después", () => {
    const r = migrarSeleccionHabilidades(["taste", "av-gen"], HERRAMIENTAS_DEFAULTS_VERSION, CATALOGO);
    expect(r.cambio).toBe(false);
    expect(r.seleccion).toEqual(["taste", "av-gen"]);
    expect(r.version).toBe(HERRAMIENTAS_DEFAULTS_VERSION);
  });

  it("una versión futura también se respeta tal cual (no reprocesa)", () => {
    const r = migrarSeleccionHabilidades(["taste"], HERRAMIENTAS_DEFAULTS_VERSION + 5, CATALOGO);
    expect(r.cambio).toBe(false);
    expect(r.version).toBe(HERRAMIENTAS_DEFAULTS_VERSION + 5);
  });
});
