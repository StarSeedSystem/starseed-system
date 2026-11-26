import { describe, it, expect } from "vitest";
import {
  reclamar,
  traspasar,
  aceptarEscritura,
  fusionarPropiedades,
  puedeEscribir,
  forzarTraspaso,
  explicar,
  type Propiedades,
} from "../propiedad-sala";
import { Sala, type Sala as SalaTipo } from "../sala";

function crearSala(sobrescrituras: Partial<SalaTipo> = {}): SalaTipo {
  return {
    id: "sala-prop-1",
    tipo: "escena3d",
    titulo: "Sala Test",
    visibilidad: "privada",
    transporte: "local",
    miembros: {
      "dueno-1": "dueno",
      "editor-1": "editor",
      "observador-1": "observador",
    },
    creadaEn: Date.now(),
    ...sobrescrituras,
  };
}

interface ClienteProp {
  userId: string;
  propiedades: Propiedades;
}

function crearClienteProp(userId: string, props: Propiedades = {}): ClienteProp {
  return { userId, propiedades: { ...props } };
}

function recibirProp(cliente: ClienteProp, remoto: Propiedades): { conflictos: string[] } {
  const { resultado, conflictos } = fusionarPropiedades(cliente.propiedades, remoto);
  cliente.propiedades = resultado;
  return { conflictos };
}

function propsIguales(a: Propiedades, b: Propiedades): boolean {
  const idsA = Object.keys(a).sort();
  const idsB = Object.keys(b).sort();
  if (idsA.join(",") !== idsB.join(",")) return false;
  for (const id of idsA) {
    if (a[id].dueno !== b[id].dueno) return false;
    if (a[id].epoca !== b[id].epoca) return false;
  }
  return true;
}

describe("coop-qa · propiedad-sala · reclamación y cesión (host + 2 clientes)", () => {
  it("reclamar: elemento sin dueño pasa a ser del reclamante con época 1", () => {
    const host = crearClienteProp("dueno-1");
    host.propiedades = reclamar(host.propiedades, "avatar-1", "dueno-1");

    expect(host.propiedades["avatar-1"]).toEqual({ dueno: "dueno-1", epoca: 1 });
  });

  it("reclamar: si ya tiene dueño, no se roba reclamando", () => {
    const host = crearClienteProp("dueno-1", { "avatar-1": { dueno: "editor-1", epoca: 1 } });
    const antes = { ...host.propiedades };
    host.propiedades = reclamar(host.propiedades, "avatar-1", "dueno-1");

    expect(host.propiedades).toEqual(antes);
  });

  it("traspasar: solo el dueño actual puede ceder, y ceder sube la época", () => {
    let props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 1 } };
    props = traspasar(props, "avatar-1", "dueno-1", "editor-1");

    expect(props["avatar-1"]).toEqual({ dueno: "editor-1", epoca: 2 });
  });

  it("traspasar: no dueño no puede ceder", () => {
    const props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 1 } };
    const resultado = traspasar(props, "avatar-1", "editor-1", "observador-1");

    expect(resultado).toEqual(props);
  });

  it("aceptarEscritura: elemento sin dueño se escribe libre (época vista 0)", () => {
    const props: Propiedades = {};
    const decision = aceptarEscritura(props, "nuevo-1", "editor-1", 0);

    expect(decision.ok).toBe(true);
  });

  it("aceptarEscritura: época vista 0 en elemento con dueño → rechaza no-es-dueno (no es el dueño)", () => {
    const props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 1 } };
    const decision = aceptarEscritura(props, "avatar-1", "editor-1", 0);

    expect(decision.ok).toBe(false);
    expect(decision.motivo).toBe("no-es-dueno");
  });

  it("aceptarEscritura: época vista > 0 en elemento sin dueño → rechaza sin-dueno", () => {
    const props: Propiedades = {};
    const decision = aceptarEscritura(props, "fantasma-1", "editor-1", 1);

    expect(decision.ok).toBe(false);
    expect(decision.motivo).toBe("sin-dueno");
  });

  it("aceptarEscritura: otro dueño → rechaza no-es-dueno", () => {
    const props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 1 } };
    const decision = aceptarEscritura(props, "avatar-1", "editor-1", 1);

    expect(decision.ok).toBe(false);
    expect(decision.motivo).toBe("no-es-dueno");
  });

  it("aceptarEscritura: época vieja → rechaza epoca-vieja", () => {
    const props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 3 } };
    const decision = aceptarEscritura(props, "avatar-1", "dueno-1", 2);

    expect(decision.ok).toBe(false);
    expect(decision.motivo).toBe("epoca-vieja");
  });

  it("aceptarEscritura: dueño correcto y época actual → ok", () => {
    const props: Propiedades = { "avatar-1": { dueno: "dueno-1", epoca: 2 } };
    const decision = aceptarEscritura(props, "avatar-1", "dueno-1", 2);

    expect(decision.ok).toBe(true);
  });
});

describe("coop-qa · propiedad-sala · fusión determinista de propiedades (3 clientes)", () => {
  it("tres clientes con reclamaciones/cesiones distinctas → mismo mapa en todos", () => {
    const host = crearClienteProp("dueno-1", {
      "obj-1": { dueno: "dueno-1", epoca: 1 },
      "obj-2": { dueno: "editor-1", epoca: 1 },
    });
    const clienteA = crearClienteProp("editor-1", {
      "obj-1": { dueno: "dueno-1", epoca: 1 },
      "obj-2": { dueno: "editor-1", epoca: 2 },
      "obj-3": { dueno: "editor-1", epoca: 1 },
    });
    const clienteB = crearClienteProp("observador-1", {
      "obj-1": { dueno: "dueno-1", epoca: 2 },
      "obj-4": { dueno: "observador-1", epoca: 1 },
    });

    const clientes = [host, clienteA, clienteB];
    for (const c of clientes) {
      for (const otro of clientes) {
        if (otro !== c) recibirProp(c, otro.propiedades);
      }
    }

    expect(propsIguales(host.propiedades, clienteA.propiedades)).toBe(true);
    expect(propsIguales(clienteA.propiedades, clienteB.propiedades)).toBe(true);

    expect(host.propiedades["obj-1"]).toEqual({ dueno: "dueno-1", epoca: 2 });
    expect(host.propiedades["obj-2"]).toEqual({ dueno: "editor-1", epoca: 2 });
    expect(host.propiedades["obj-3"]).toEqual({ dueno: "editor-1", epoca: 1 });
    expect(host.propiedades["obj-4"]).toEqual({ dueno: "observador-1", epoca: 1 });
  });

  it("orden de fusión distinto → mismo resultado (conmutatividad)", () => {
    const base: Propiedades = {
      "x": { dueno: "a", epoca: 1 },
      "y": { dueno: "b", epoca: 1 },
    };
    const remoto1: Propiedades = { "x": { dueno: "a", epoca: 2 }, "z": { dueno: "c", epoca: 1 } };
    const remoto2: Propiedades = { "y": { dueno: "b", epoca: 3 }, "w": { dueno: "d", epoca: 1 } };

    const c1 = crearClienteProp("test", { ...base });
    const c2 = crearClienteProp("test", { ...base });

    recibirProp(c1, remoto1);
    recibirProp(c1, remoto2);

    recibirProp(c2, remoto2);
    recibirProp(c2, remoto1);

    expect(propsIguales(c1.propiedades, c2.propiedades)).toBe(true);
  });

  it("conflicto: dos dueños distintos para mismo id → aparece en conflictos", () => {
    const host = crearClienteProp("dueno-1", { "obj-1": { dueno: "dueno-1", epoca: 1 } });
    const clienteA = crearClienteProp("editor-1", { "obj-1": { dueno: "editor-1", epoca: 1 } });

    const { conflictos } = fusionarPropiedades(host.propiedades, clienteA.propiedades);

    expect(conflictos).toContain("obj-1");
  });

  it("desempate determinista: época mayor gana; a igual época, dueño menor alfabéticamente", () => {
    const r1 = fusionarPropiedades(
      { "x": { dueno: "aaa", epoca: 1 } },
      { "x": { dueno: "bbb", epoca: 2 } }
    );
    expect(r1.resultado["x"].dueno).toBe("bbb");

    const r2 = fusionarPropiedades(
      { "x": { dueno: "aaa", epoca: 1 } },
      { "x": { dueno: "bbb", epoca: 1 } }
    );
    expect(r2.resultado["x"].dueno).toBe("aaa");
  });
});

describe("coop-qa · propiedad-sala · dueño de sala fuerza traspaso", () => {
  const sala = crearSala();

  it("dueno de sala puede forzar traspaso a cualquiera", () => {
    let props: Propiedades = { "avatar-1": { dueno: "editor-1", epoca: 1 } };
    const resultado = forzarTraspaso(sala, "dueno-1", props, "avatar-1", "observador-1");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.propiedades["avatar-1"]).toEqual({ dueno: "observador-1", epoca: 2 });
      expect(resultado.porQuien).toBe("dueno-1");
      expect(resultado.aQuien).toBe("observador-1");
    }
  });

  it("no dueno de sala no puede forzar traspaso", () => {
    const props: Propiedades = { "avatar-1": { dueno: "editor-1", epoca: 1 } };
    const resultado = forzarTraspaso(sala, "editor-1", props, "avatar-1", "observador-1");

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.propiedades).toEqual(props);
    }
  });

  it("forzar traspaso en elemento sin dueño crea propiedad con época 1", () => {
    const props: Propiedades = {};
    const resultado = forzarTraspaso(sala, "dueno-1", props, "nuevo-1", "editor-1");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.propiedades["nuevo-1"]).toEqual({ dueno: "editor-1", epoca: 1 });
    }
  });
});

describe("coop-qa · propiedad-sala · puedeEscribir combina rol + propiedad", () => {
  const sala = crearSala();

  it("editor escribe lo suyo", () => {
    const props: Propiedades = { "obj-1": { dueno: "editor-1", epoca: 1 } };
    expect(puedeEscribir(sala, "editor-1", props, "obj-1")).toBe(true);
  });

  it("editor NO escribe lo ajeno", () => {
    const props: Propiedades = { "obj-1": { dueno: "dueno-1", epoca: 1 } };
    expect(puedeEscribir(sala, "editor-1", props, "obj-1")).toBe(false);
  });

  it("editor escribe lo sin dueño", () => {
    const props: Propiedades = {};
    expect(puedeEscribir(sala, "editor-1", props, "obj-nuevo")).toBe(true);
  });

  it("observador nunca escribe", () => {
    const props: Propiedades = { "obj-1": { dueno: "observador-1", epoca: 1 } };
    expect(puedeEscribir(sala, "observador-1", props, "obj-1")).toBe(false);
  });

  it("no miembro no escribe ni ve sala privada", () => {
    const props: Propiedades = { "obj-1": { dueno: "editor-1", epoca: 1 } };
    expect(puedeEscribir(sala, "extraño", props, "obj-1")).toBe(false);
  });
});

describe("coop-qa · propiedad-sala · frases de explicación para UI", () => {
  it("explicar no-es-dueno incluye nombre del dueño", () => {
    const msg = explicar("no-es-dueno", "Ana");
    expect(msg).toContain("la tiene Ana");
    expect(msg).toContain("pídesela");
  });

  it("explicar epoca-vieja dice que mire versión actual", () => {
    const msg = explicar("epoca-vieja");
    expect(msg).toContain("versión antigua");
    expect(msg).toContain("mírala tal y como está ahora");
  });

  it("explicar sin-dueno dice que reclame de nuevo", () => {
    const msg = explicar("sin-dueno");
    expect(msg).toContain("reclámala de nuevo");
  });
});

describe("coop-qa · propiedad-sala · monitores de invariantes", () => {
  it("invariante: época nunca decrece en fusión", () => {
    const host = crearClienteProp("a", { "x": { dueno: "a", epoca: 3 } });
    const cliente = crearClienteProp("b", { "x": { dueno: "b", epoca: 1 } });

    const epocaAntes = host.propiedades["x"].epoca;
    recibirProp(host, cliente.propiedades);

    expect(host.propiedades["x"].epoca).toBeGreaterThanOrEqual(epocaAntes);
  });

  it("invariante: traspaso válido siempre sube época en 1", () => {
    let props: Propiedades = { "x": { dueno: "a", epoca: 1 } };
    const epocaAntes = props["x"].epoca;
    props = traspasar(props, "x", "a", "b");

    expect(props["x"].epoca).toBe(epocaAntes + 1);
  });

  it("invariante: reclamar elemento nuevo crea época 1", () => {
    const props: Propiedades = {};
    const nuevas = reclamar(props, "nuevo", "a");

    expect(nuevas["nuevo"].epoca).toBe(1);
  });

  it("invariante: fusión conmutativa (A+B = B+A)", () => {
    const a: Propiedades = { "x": { dueno: "a", epoca: 1 }, "y": { dueno: "b", epoca: 2 } };
    const b: Propiedades = { "x": { dueno: "c", epoca: 3 }, "z": { dueno: "d", epoca: 1 } };

    const r1 = fusionarPropiedades(a, b);
    const r2 = fusionarPropiedades(b, a);

    expect(propsIguales(r1.resultado, r2.resultado)).toBe(true);
    expect(r1.conflictos.sort()).toEqual(r2.conflictos.sort());
  });
});