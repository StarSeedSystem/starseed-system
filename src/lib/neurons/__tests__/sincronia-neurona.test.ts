/**
 * Sincronía de neurona: fusión por campo (gana el más reciente sin pisar
 * campos ajenos), protección de lo propio del aparato y cola sin enlace.
 */
import { describe, it, expect } from "vitest";
import {
  CAMPOS_PROPIOS_APARATO,
  crearEstadoNeuronaSync,
  fusionarCamposNeurona,
  encolarCambioSinEnlace,
  procesarColaSinEnlace,
  type RegistroCampoSync,
} from "../sincronia-neurona";

function campo(valor: unknown, timestamp: number, aparatoId: string): RegistroCampoSync {
  return { valor, timestamp, aparatoId };
}

describe("crearEstadoNeuronaSync", () => {
  it("arranca vacío y atado a su neurona y su aparato", () => {
    expect(crearEstadoNeuronaSync("n1", "a1")).toEqual({
      neuronaId: "n1",
      aparatoId: "a1",
      campos: {},
      colaPendiente: [],
      conflictos: [],
    });
  });
});

describe("fusionarCamposNeurona · fusión por campo", () => {
  it("adopta un campo remoto que aún no existe en local", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const resultado = fusionarCamposNeurona(estado, { tema: campo("oscuro", 10, "a2") }, "a2");
    expect(resultado.campos.tema).toEqual(campo("oscuro", 10, "a2"));
  });

  it("gana el remoto solo cuando su fecha es más reciente", () => {
    const local = crearEstadoNeuronaSync("n1", "a1");
    local.campos.tema = campo("claro", 100, "a1");
    local.campos.fuente = campo("serif", 300, "a1");

    const resultado = fusionarCamposNeurona(
      local,
      { tema: campo("oscuro", 200, "a2"), fuente: campo("mono", 250, "a2") },
      "a2",
    );

    expect(resultado.campos.tema.valor).toBe("oscuro");
    expect(resultado.campos.fuente.valor).toBe("serif");
  });

  it("no pisa los campos que no vienen en el paquete remoto", () => {
    const local = crearEstadoNeuronaSync("n1", "a1");
    local.campos.idioma = campo("es", 100, "a1");

    const resultado = fusionarCamposNeurona(local, { tema: campo("oscuro", 200, "a2") }, "a2");

    expect(resultado.campos.idioma.valor).toBe("es");
    expect(resultado.campos.tema.valor).toBe("oscuro");
  });

  it("no muta el estado local que recibe", () => {
    const local = crearEstadoNeuronaSync("n1", "a1");
    local.campos.tema = campo("claro", 100, "a1");
    const antes = structuredClone(local);

    fusionarCamposNeurona(local, { tema: campo("oscuro", 200, "a2") }, "a2");

    expect(local).toEqual(antes);
  });
});

describe("fusionarCamposNeurona · conflictos y campos propios", () => {
  it("registra el conflicto cuando dos aparatos fechan igual el mismo campo", () => {
    const local = crearEstadoNeuronaSync("n1", "a1");
    local.campos.tema = campo("claro", 100, "a1");

    const resultado = fusionarCamposNeurona(local, { tema: campo("oscuro", 100, "a2") }, "a2");

    expect(resultado.conflictos).toHaveLength(1);
    expect(resultado.conflictos[0]).toMatchObject({
      campo: "tema",
      valorLocal: "claro",
      valorRemoto: "oscuro",
      timestampLocal: 100,
      timestampRemoto: 100,
    });
    expect(resultado.campos.tema.valor).toBe("oscuro");
  });

  it("desempata de forma estable por el id del aparato y deja aviso", () => {
    const local = crearEstadoNeuronaSync("n1", "a3");
    local.campos.tema = campo("local", 100, "a3");

    const resultado = fusionarCamposNeurona(local, { tema: campo("remoto", 100, "a2") }, "a2");

    expect(resultado.campos.tema.valor).toBe("local");
    expect(resultado.conflictos).toHaveLength(1);
  });

  it("no marca conflicto cuando la misma fecha viene del mismo aparato", () => {
    const local = crearEstadoNeuronaSync("n1", "a1");
    local.campos.tema = campo("claro", 100, "a1");

    const resultado = fusionarCamposNeurona(local, { tema: campo("oscuro", 100, "a1") }, "a1");

    expect(resultado.conflictos).toHaveLength(0);
    expect(resultado.campos.tema.valor).toBe("claro");
  });

  it("nunca copia lo propio del aparato: control, permisos, huella e identidad", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");
    const remoto: Record<string, RegistroCampoSync> = {};
    for (const nombre of CAMPOS_PROPIOS_APARATO) {
      remoto[nombre] = campo(`remoto-${nombre}`, 200, "a2");
    }

    const resultado = fusionarCamposNeurona(estado, remoto, "a2");

    for (const nombre of CAMPOS_PROPIOS_APARATO) {
      expect(resultado.campos[nombre]).toBeUndefined();
    }
  });
});

describe("cola de cambios sin enlace", () => {
  it("encola el cambio y lo aplica en local con fecha y aparato de este aparato", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");

    const conCambio = encolarCambioSinEnlace(estado, "tema", "oscuro", 1000);

    expect(conCambio.colaPendiente).toHaveLength(1);
    expect(conCambio.colaPendiente[0]).toMatchObject({
      campo: "tema",
      valor: "oscuro",
      timestamp: 1000,
      intentos: 0,
    });
    expect(conCambio.campos.tema).toEqual(campo("oscuro", 1000, "a1"));
    expect(estado.colaPendiente).toHaveLength(0);
  });

  it("acumula varios cambios en orden mientras no hay enlace", () => {
    let estado = crearEstadoNeuronaSync("n1", "a1");
    estado = encolarCambioSinEnlace(estado, "tema", "oscuro", 1000);
    estado = encolarCambioSinEnlace(estado, "idioma", "es", 2000);

    expect(estado.colaPendiente.map((c) => c.campo)).toEqual(["tema", "idioma"]);
    expect(estado.colaPendiente.map((c) => c.timestamp)).toEqual([1000, 2000]);
  });

  it("no encola lo que es propio del aparato", () => {
    const estado = crearEstadoNeuronaSync("n1", "a1");

    const sinCambio = encolarCambioSinEnlace(estado, "huella", "xyz", 1000);

    expect(sinCambio.colaPendiente).toHaveLength(0);
    expect(sinCambio.campos.huella).toBeUndefined();
  });

  it("procesa la cola al volver el enlace: emite en orden y la vacía sin perder campos", () => {
    const estado = encolarCambioSinEnlace(
      encolarCambioSinEnlace(crearEstadoNeuronaSync("n1", "a1"), "tema", "oscuro", 1000),
      "idioma",
      "es",
      2000,
    );

    const { estadoActualizado, cambiosAEmitir } = procesarColaSinEnlace(estado);

    expect(cambiosAEmitir).toEqual([
      { campo: "tema", valor: "oscuro", timestamp: 1000 },
      { campo: "idioma", valor: "es", timestamp: 2000 },
    ]);
    expect(estadoActualizado.colaPendiente).toEqual([]);
    expect(estadoActualizado.campos.tema.valor).toBe("oscuro");
    expect(estadoActualizado.campos.idioma.valor).toBe("es");
  });

  it("procesar una cola vacía no emite nada", () => {
    const { cambiosAEmitir, estadoActualizado } = procesarColaSinEnlace(
      crearEstadoNeuronaSync("n1", "a1"),
    );

    expect(cambiosAEmitir).toEqual([]);
    expect(estadoActualizado.colaPendiente).toEqual([]);
  });
});
