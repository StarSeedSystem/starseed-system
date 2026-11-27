/**
 * (NEU1126E) Revisión de identidad de un aparato que comparte neurona con otro distinto.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/revision-identidad.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  avisoPendiente,
  avisosDeRevision,
  claveAvisoRevision,
  claveRevision,
  conAvisoPospuesto,
  conRevisionHecha,
  decidirRevisionIdentidad,
  hayHuellasDistintas,
  leerRegistroRevision,
  listaNombres,
  quitarAvisoRevision,
  revisionHecha,
  serializarRegistroRevision,
  textoComparteNeurona,
  type RegistroRevisionIdentidad,
  type RevisionIdentidadVisible,
} from "../revision-identidad";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";
const AHORA = 1_800_000_000_000;

function capsDosAparatos() {
  return {
    aparatos: {
      [TABLET]: { ts: 100, desde: 100, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" },
      [MOVIL]: { ts: 200, desde: 200, huella: "bbbbbbbbbbbbbbbb", n: "Maggadroid" },
    },
  };
}

function entrada(aparatoId: string, extra: Partial<{ version: string; registro: RegistroRevisionIdentidad }> = {}) {
  return {
    neuronaId: TABLET,
    neuronaNombre: "Maggaboard",
    aparatoActual: { id: aparatoId, nombre: aparatoId === MOVIL ? "Maggadroid" : "Maggaboard" },
    capabilities: capsDosAparatos(),
    ahora: AHORA,
    ...extra,
  };
}

function visible(d: ReturnType<typeof decidirRevisionIdentidad>): RevisionIdentidadVisible {
  if (!d.mostrar) throw new Error(`No se mostró la ventana: ${d.motivo}`);
  return d;
}

describe("leerRegistroRevision", () => {
  it("devuelve un registro vacío con basura y sanea lo que no entiende", () => {
    expect(leerRegistroRevision(null)).toEqual({ v: 1, revisiones: {}, avisos: {} });
    expect(leerRegistroRevision("{no es json")).toEqual({ v: 1, revisiones: {}, avisos: {} });
    const r = leerRegistroRevision(
      JSON.stringify({
        v: 1,
        revisiones: { ok: { ts: 5, resultado: "fusionadas" }, malo: { ts: 5, resultado: "otra" } },
        avisos: { [claveAvisoRevision(TABLET, MOVIL)]: { neuronaId: TABLET, aparatoId: MOVIL, otroNombre: "Maggaboard", ts: 7 } },
      }),
    );
    expect(Object.keys(r.revisiones)).toEqual(["ok"]);
    expect(r.avisos[claveAvisoRevision(TABLET, MOVIL)].neuronaNombre).toBe("esta neurona");
  });
});

describe("decidirRevisionIdentidad", () => {
  it("dos aparatos vivos con huella distinta: la ventana sale en los dos", () => {
    const enMovil = visible(decidirRevisionIdentidad(entrada(MOVIL)));
    expect(enMovil.neuronaNombre).toBe("Maggaboard");
    expect(enMovil.otroNombre).toBe("Maggaboard");
    expect(enMovil.recomiendaPropia).toBe(true);
    expect(enMovil.nombrePropuesto).toBe("Maggadroid");
    expect(textoComparteNeurona(enMovil)).toBe(
      "Este aparato comparte la neurona «Maggaboard» con «Maggaboard». Recomendado: una neurona por aparato.",
    );

    const enTableta = visible(decidirRevisionIdentidad(entrada(TABLET)));
    expect(enTableta.otroNombre).toBe("Maggadroid");
    expect(enTableta.recomiendaPropia).toBe(false);
    expect(enTableta.nombrePropuesto).toBe("Maggaboard");
  });

  it("un solo aparato no abre la ventana", () => {
    const d = decidirRevisionIdentidad({
      ...entrada(TABLET),
      capabilities: { aparatos: { [TABLET]: { ts: 100, desde: 100, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" } } },
    });
    expect(d.mostrar).toBe(false);
    if (!d.mostrar) expect(d.motivo).toBe("un-solo-aparato");
  });

  it("dos entradas con la misma huella son el mismo aparato: no abre", () => {
    const d = decidirRevisionIdentidad({
      ...entrada(TABLET),
      capabilities: {
        aparatos: {
          [TABLET]: { ts: 100, desde: 100, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" },
          [MOVIL]: { ts: 200, desde: 200, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" },
        },
      },
    });
    expect(d.mostrar).toBe(false);
    if (!d.mostrar) expect(d.motivo).toBe("misma-huella");
  });

  it("una lápida no cuenta como aparato vivo", () => {
    const d = decidirRevisionIdentidad({
      ...entrada(TABLET),
      capabilities: {
        aparatos: {
          [TABLET]: { ts: 100, desde: 100, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" },
          [MOVIL]: { ts: 50, desde: 50, fuera: 90, huella: "bbbbbbbbbbbbbbbb", n: "Maggadroid" },
        },
      },
    });
    expect(d.mostrar).toBe(false);
    if (!d.mostrar) expect(d.motivo).toBe("un-solo-aparato");
  });

  it("el primero es el id de la neurona aunque llegue después por fecha", () => {
    const d = visible(
      decidirRevisionIdentidad({
        ...entrada(MOVIL),
        capabilities: {
          aparatos: {
            [TABLET]: { ts: 300, desde: 300, huella: "aaaaaaaaaaaaaaaa", n: "Maggaboard" },
            [MOVIL]: { ts: 100, desde: 100, huella: "bbbbbbbbbbbbbbbb", n: "Maggadroid" },
          },
        },
      }),
    );
    expect(d.recomiendaPropia).toBe(true);
  });

  it("sin id de neurona o de aparato no decide nada", () => {
    expect(decidirRevisionIdentidad({ ...entrada(TABLET), neuronaId: "" }).mostrar).toBe(false);
    expect(decidirRevisionIdentidad({ ...entrada("") }).mostrar).toBe(false);
  });

  it("no vuelve a salir la misma versión ya revisada", () => {
    const clave = claveRevision(TABLET, MOVIL, "0.65");
    const reg = conRevisionHecha(leerRegistroRevision(null), clave, "fusionadas", AHORA);
    const d = decidirRevisionIdentidad(entrada(MOVIL, { version: "0.65", registro: reg }));
    expect(d.mostrar).toBe(false);
    if (!d.mostrar) expect(d.motivo).toBe("ya-revisada");
    expect(revisionHecha(reg, clave)).toBe("fusionadas");
  });

  it("una versión nueva vuelve a revisar", () => {
    const reg = conRevisionHecha(leerRegistroRevision(null), claveRevision(TABLET, MOVIL, "0.65"), "fusionadas", AHORA);
    expect(decidirRevisionIdentidad(entrada(MOVIL, { version: "0.66", registro: reg })).mostrar).toBe(true);
  });
});

describe("«Más tarde» deja el aviso", () => {
  it("se anota la revisión y queda el aviso visible en Cuenta › Neuronas", () => {
    const reg = leerRegistroRevision(null);
    const clave = claveRevision(TABLET, MOVIL, "0.65");
    const conRevision = conRevisionHecha(reg, clave, "mas-tarde", AHORA);
    const conAviso = conAvisoPospuesto(
      conRevision,
      { neuronaId: TABLET, neuronaNombre: "Maggaboard", aparatoId: MOVIL, otroNombre: "Maggaboard" },
      AHORA,
    );
    const aviso = avisoPendiente(conAviso, claveAvisoRevision(TABLET, MOVIL));
    expect(aviso?.otroNombre).toBe("Maggaboard");
    expect(avisosDeRevision(conAviso)).toHaveLength(1);

    const d = decidirRevisionIdentidad(entrada(MOVIL, { version: "0.65", registro: conAviso }));
    expect(d.mostrar).toBe(false);
    expect(d.avisoPendiente).toBe(true);

    const limpio = quitarAvisoRevision(conAviso, claveAvisoRevision(TABLET, MOVIL));
    expect(avisoPendiente(limpio, claveAvisoRevision(TABLET, MOVIL))).toBeNull();
  });

  it("serializa y vuelve a leer sin perder el aviso", () => {
    const reg = conAvisoPospuesto(
      leerRegistroRevision(null),
      { neuronaId: TABLET, neuronaNombre: "Maggaboard", aparatoId: MOVIL, otroNombre: "Maggaboard" },
      AHORA,
    );
    expect(leerRegistroRevision(serializarRegistroRevision(reg))).toEqual(reg);
  });
});

describe("ayudas puras", () => {
  it("lista nombres y detecta huellas distintas", () => {
    expect(listaNombres([])).toBe("otro aparato");
    expect(listaNombres(["A"])).toBe("A");
    expect(listaNombres(["A", "B"])).toBe("A y B");
    expect(listaNombres(["A", "B", "C"])).toBe("A, B y C");
    expect(hayHuellasDistintas([{ id: TABLET, nombre: "A", huella: "x", visto: 1, vinculado: true }])).toBe(false);
    expect(
      hayHuellasDistintas([
        { id: TABLET, nombre: "A", huella: "x", visto: 1, vinculado: true },
        { id: MOVIL, nombre: "B", huella: "y", visto: 2, vinculado: true },
      ]),
    ).toBe(true);
  });
});
