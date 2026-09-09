// StarSeed OS — Pruebas del paquete de sistema compartible.
//
// Los dos guardianes del núcleo (`validarUiSpec`, `validarContraInvariantes`)
// se inyectan, así que aquí se usan dobles que respetan sus contratos: lo que
// se prueba es el CABLEADO del paquete —qué le pasa a cada guardián y qué
// hace con la respuesta—, no la lógica que vive en los módulos hermanos.

import { describe, it, expect } from "vitest";
import type { UiSpec } from "@/lib/nucleo/ui-spec";
import type { Violacion } from "@/lib/nucleo/invariantes";
import {
  CLAVES_PROHIBIDAS,
  VERSION_PAQUETE,
  empaquetar,
  cambioDelPaquete,
  detectarSecretos,
  revisar,
  esInstalable,
  type CambioDeInterfaz,
  type DependenciasNucleo,
  type PaqueteSistema,
} from "@/lib/nucleo/paquete-sistema";

const AHORA = 1_757_000_000_000;

function uiSpecLimpia(meta: Record<string, string> = {}): UiSpec {
  return {
    version: 1,
    superficie: "escritorio",
    titulo: "Escritorio Nébula",
    bloques: [
      {
        tipo: "panel",
        id: "panel-inicio",
        props: { titulo: "Bienvenida" },
        hijos: [{ tipo: "texto", id: "texto-inicio", props: { texto: "Hola, mundo" } }],
      },
      { tipo: "acciones", id: "acciones-inicio", props: { acciones: ["abrir-biblioteca"] } },
    ],
    tema: "nebula",
    meta,
  };
}

function entradaLimpia(): Omit<PaqueteSistema, "id" | "creadoEn" | "version"> {
  return {
    nombre: "Escritorio Nébula",
    autor: { perfil: "perfil-ana", nombre: "Ana" },
    uiSpec: uiSpecLimpia(),
    apariencia: { acento: "#7C5CFF" },
    agentes: ["guia-nebula"],
    permisosPedidos: ["notificaciones", "portapapeles"],
    requiere: ["starseed-os>=1"],
    firma: "firma-de-prueba",
  };
}

/** Doble de `validarUiSpec`: respeta el contrato { spec, problemas }. */
function validarUiSpecDoble(bruto: unknown): { spec: UiSpec | null; problemas: string[] } {
  const spec = bruto as UiSpec | null;
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.bloques)) {
    return { spec: null, problemas: ["la spec no trae bloques"] };
  }
  const problemas: string[] = [];
  if (JSON.stringify(spec).includes("<script")) problemas.push("cadena que parece código: <script");
  return { spec: problemas.length === 0 ? spec : null, problemas };
}

/** Doble de `validarContraInvariantes`: devuelve TODAS las violaciones. */
function validarInvariantesDoble(cambio: CambioDeInterfaz): Violacion[] {
  const violaciones: Violacion[] = [];
  if (cambio.ocultaAjustes) {
    violaciones.push({
      invariante: "salida-siempre",
      que: "el paquete oculta Ajustes",
      comoArreglarlo: "Deja Ajustes accesible desde cualquier estado.",
    });
  }
  if (cambio.desactivaDeshacer) {
    violaciones.push({
      invariante: "deshacer",
      que: "el paquete desactiva deshacer",
      comoArreglarlo: "Todo cambio de la IA tiene que ser reversible.",
    });
  }
  if ((cambio.superficiesQuitadas ?? []).includes("lanzador")) {
    violaciones.push({
      invariante: "navegacion-fundamental",
      que: "el paquete quita el lanzador",
      comoArreglarlo: "Un tema puede mover el lanzador, no borrarlo.",
    });
  }
  return violaciones;
}

const NUCLEO: DependenciasNucleo = {
  validarUiSpec: validarUiSpecDoble,
  validarContraInvariantes: validarInvariantesDoble,
};

describe("empaquetar", () => {
  it("sella id, fecha y versión sin perder ni un campo de la entrada", () => {
    const entrada = entradaLimpia();
    const paquete = empaquetar(entrada, AHORA, "paq-001");

    expect(paquete.id).toBe("paq-001");
    expect(paquete.creadoEn).toBe(AHORA);
    expect(paquete.version).toBe(VERSION_PAQUETE);
    expect(paquete.nombre).toBe("Escritorio Nébula");
    expect(paquete.autor).toEqual({ perfil: "perfil-ana", nombre: "Ana" });
    expect(paquete.uiSpec).toEqual(entrada.uiSpec);
    expect(paquete.apariencia).toEqual({ acento: "#7C5CFF" });
    expect(paquete.agentes).toEqual(["guia-nebula"]);
    expect(paquete.permisosPedidos).toEqual(["notificaciones", "portapapeles"]);
    expect(paquete.requiere).toEqual(["starseed-os>=1"]);
    expect(paquete.firma).toBe("firma-de-prueba");
  });

  it("copia las listas: el paquete no queda atado al objeto de quien lo creó", () => {
    const entrada = entradaLimpia();
    const paquete = empaquetar(entrada, AHORA, "paq-002");
    entrada.permisosPedidos.push("microfono");

    expect(paquete.permisosPedidos).toEqual(["notificaciones", "portapapeles"]);
  });
});

describe("revisar · paquete limpio", () => {
  it("es seguro e instalable", () => {
    const paquete = empaquetar(entradaLimpia(), AHORA, "paq-limpio");
    const revision = revisar(paquete, NUCLEO);

    expect(revision.violaciones).toEqual([]);
    expect(revision.secretosDetectados).toEqual([]);
    expect(revision.seguro).toBe(true);
    expect(esInstalable(revision)).toBe(true);
  });

  it("el resumen nombra los permisos pedidos, los agentes y la superficie", () => {
    const paquete = empaquetar(entradaLimpia(), AHORA, "paq-resumen");
    const { resumen } = revisar(paquete, NUCLEO);

    expect(resumen).toContain("notificaciones");
    expect(resumen).toContain("portapapeles");
    expect(resumen).toContain("2 permisos");
    expect(resumen).toContain("guia-nebula");
    expect(resumen).toContain("escritorio");
    expect(resumen).toContain("REVISIÓN: instalable");
  });
});

describe("revisar · secretos", () => {
  it("un paquete con una clave «sk-» dentro se marca inseguro y no instalable", () => {
    const entrada = entradaLimpia();
    entrada.apariencia = { notaDelAutor: "usa mi clave sk-live-9f3a7b21c4" };
    const revision = revisar(empaquetar(entrada, AHORA, "paq-clave"), NUCLEO);

    expect(revision.secretosDetectados.length).toBeGreaterThan(0);
    expect(revision.secretosDetectados[0]).toContain("sk-");
    expect(revision.seguro).toBe(false);
    expect(esInstalable(revision)).toBe(false);
    expect(revision.resumen).toContain("secreto");
  });

  it("no vuelve a publicar el secreto entero: lo enmascara", () => {
    const entrada = entradaLimpia();
    entrada.apariencia = { notaDelAutor: "sk-live-9f3a7b21c4d5e6" };
    const hallazgos = detectarSecretos(empaquetar(entrada, AHORA, "paq-mascara"));

    expect(hallazgos.join(" ")).not.toContain("9f3a7b21c4d5e6");
  });

  it("una ruta absoluta del disco del autor también es un secreto", () => {
    const entrada = entradaLimpia();
    entrada.apariencia = { fondo: "/Users/alex/Documents/fondo.png" };
    const revision = revisar(empaquetar(entrada, AHORA, "paq-ruta"), NUCLEO);

    expect(revision.secretosDetectados.join(" ")).toContain("ruta absoluta");
    expect(esInstalable(revision)).toBe(false);
  });

  it("los patrones no son globales: dos revisiones seguidas dan el mismo resultado", () => {
    for (const patron of CLAVES_PROHIBIDAS) expect(patron.global).toBe(false);

    const entrada = entradaLimpia();
    entrada.apariencia = { notaDelAutor: "sk-live-9f3a7b21c4" };
    const paquete = empaquetar(entrada, AHORA, "paq-repetido");

    expect(detectarSecretos(paquete)).toEqual(detectarSecretos(paquete));
  });
});

describe("revisar · invariantes del núcleo", () => {
  it("un paquete que oculta Ajustes se marca inseguro aunque no lo declare", () => {
    const entrada = entradaLimpia();
    entrada.uiSpec = uiSpecLimpia({ rutasOcultas: "/ajustes/privacidad, /inicio" });
    const revision = revisar(empaquetar(entrada, AHORA, "paq-ajustes"), NUCLEO);

    expect(revision.violaciones.map((v) => v.invariante)).toContain("salida-siempre");
    expect(revision.seguro).toBe(false);
    expect(esInstalable(revision)).toBe(false);
    expect(revision.resumen).toContain("oculta Ajustes");
  });

  it("devuelve todas las violaciones juntas, cada una con cómo arreglarlo", () => {
    const entrada = entradaLimpia();
    entrada.uiSpec = uiSpecLimpia({
      ocultaAjustes: "sí",
      desactivaDeshacer: "true",
      superficiesQuitadas: "lanzador",
    });
    const revision = revisar(empaquetar(entrada, AHORA, "paq-triple"), NUCLEO);

    expect(revision.violaciones).toHaveLength(3);
    for (const violacion of revision.violaciones) {
      expect(violacion.comoArreglarlo.length).toBeGreaterThan(0);
    }
  });

  it("una UiSpec con código dentro se rechaza nombrando el problema", () => {
    const entrada = entradaLimpia();
    const spec = uiSpecLimpia();
    spec.bloques[0].props = { titulo: "<script>robar()</script>" };
    entrada.uiSpec = spec;
    const revision = revisar(empaquetar(entrada, AHORA, "paq-script"), NUCLEO);

    expect(revision.violaciones.map((v) => v.invariante)).toContain("ui-spec-valida");
    expect(revision.violaciones.map((v) => v.que).join(" ")).toContain("<script");
    expect(esInstalable(revision)).toBe(false);
  });

  it("sin núcleo configurado falla cerrado: nada se instala sin revisión", () => {
    const revision = revisar(empaquetar(entradaLimpia(), AHORA, "paq-sin-nucleo"), null);

    expect(revision.violaciones.map((v) => v.invariante)).toContain("nucleo-configurado");
    expect(esInstalable(revision)).toBe(false);
  });
});

describe("cambioDelPaquete", () => {
  it("normaliza listas y deduce que se toca Ajustes desde las superficies quitadas", () => {
    const entrada = entradaLimpia();
    entrada.uiSpec = uiSpecLimpia({ superficiesQuitadas: " ajustes , lanzador " });
    const cambio = cambioDelPaquete(empaquetar(entrada, AHORA, "paq-cambio"));

    expect(cambio.superficiesQuitadas).toEqual(["ajustes", "lanzador"]);
    expect(cambio.ocultaAjustes).toBe(true);
    expect(cambio.rutasOcultas).toEqual([]);
    expect(cambio.permisosPedidos).toEqual(["notificaciones", "portapapeles"]);
  });
});
