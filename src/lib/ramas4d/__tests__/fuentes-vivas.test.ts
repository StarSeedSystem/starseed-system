import { describe, it, expect } from "vitest";
import { crearGrafo, anadirNodo, anadirArista } from "../modelo";
import { podarGrafo, type Observador } from "../alcance";
import type { Fuente } from "../fuentes/tipos";

function obs(overrides: Partial<Observador> = {}): Observador {
  return { id: "user-1", contactos: ["user-2"], grupos: ["g1"], comunidades: ["c1"], ...overrides };
}

describe("Fuente - contrato de las fuentes vivas", () => {
  it("senales expone el contrato Fuente", async () => {
    const { crearFuenteSenales } = await import("../fuentes/senales");
    const f: Fuente = crearFuenteSenales();
    expect(f.id).toBe("senales");
    expect(f.capa).toBe("senales");
    expect(typeof f.leer).toBe("function");
    expect(typeof f.suscribir).toBe("function");
  });

  it("ia expone el contrato Fuente", async () => {
    const { crearFuenteIa } = await import("../fuentes/ia");
    const f: Fuente = crearFuenteIa();
    expect(f.id).toBe("ia");
    expect(f.capa).toBe("ia");
    expect(typeof f.leer).toBe("function");
  });

  it("creacion expone el contrato Fuente", async () => {
    const { crearFuenteCreacion } = await import("../fuentes/creacion");
    const f: Fuente = crearFuenteCreacion();
    expect(f.id).toBe("creacion");
    expect(f.capa).toBe("creacion");
    expect(typeof f.leer).toBe("function");
  });

  it("metagenesis expone el contrato Fuente", async () => {
    const { crearFuenteMetagenesis } = await import("../fuentes/metagenesis");
    const f: Fuente = crearFuenteMetagenesis();
    expect(f.id).toBe("metagenesis");
    expect(f.capa).toBe("metagenesis");
    expect(typeof f.leer).toBe("function");
  });
});

describe("senales - mapeo puro", () => {
  it("mapearSenalANodo crea nodo con ref y sin contenido privado", async () => {
    const { senalANodo } = await import("../fuentes/senales");
    const nodo = senalANodo({
      id: "ble:aa",
      kind: "bluetooth",
      antenna: "ble",
      label: "Auriculares",
      placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.1 },
      quality: 0.8,
      metrics: [],
      lastSeen: 1000,
    }, 1000);
    expect(nodo.id).toBe("senal:ble:aa");
    expect(nodo.tipo).toBe("senal");
    expect(decodeURIComponent(nodo.ref)).toContain("ble:aa");
    expect(nodo.capas).toContain("senales");
    expect((nodo as unknown as Record<string, unknown>).contenido).toBeUndefined();
  });

  it("neuronaANodo crea nodo neurona con alcance privado", async () => {
    const { neuronaANodo } = await import("../fuentes/senales");
    const nodo = neuronaANodo({
      neuronId: "n1",
      syncDeviceId: "s1",
      nombre: "Mi Mac",
      plataforma: "macos",
      tipo: "desktop",
      online: true,
      esEsteDispositivo: true,
      ultimoVisto: "2026-11-25T10:00:00Z",
      enlace: { estado: "conectado" },
    });
    expect(nodo.id).toBe("neurona:n1");
    expect(nodo.tipo).toBe("neurona");
    expect(nodo.alcance).toBe("privado");
    expect(nodo.capas).toContain("malla");
  });
});

describe("ia - mapeo puro", () => {
  it("botANodo crea nodo agente/bot con ref", async () => {
    const { botANodo } = await import("../fuentes/ia");
    const nodo = botANodo({
      id: "astraura:perfil-1",
      nombre: "Astraura",
      dueno: { tipo: "perfil", id: "perfil-1", cuentaId: "cuenta-1" },
      origen: "astraura",
      gobierno: "jerarquico",
      personalidad: { calidez: 0.7, energia: 0.5, formalidad: 0.4, curiosidad: 0.7, humor: 0.4, concision: 0.5 },
      cuerpo: { forma: "orbe", tono: 200, escala: 1 },
      sentidosHabilitados: ["pantalla"],
      activo: true,
    });
    expect(nodo.id).toBe("bot:astraura:perfil-1");
    expect(["bot", "agente"]).toContain(nodo.tipo);
    expect(decodeURIComponent(nodo.ref)).toContain("astraura:perfil-1");
    expect(nodo.capas).toContain("ia");
  });

  it("recursoANodo crea nodo habilidad/conector", async () => {
    const { recursoANodo } = await import("../fuentes/ia");
    const nodo = recursoANodo({
      id: "os:claude-en-chrome",
      tipo: "herramienta",
      origen: "os",
      nombre: "Claude en Chrome",
      descripcion: "Extensión",
      etiquetas: ["navegador"],
      requiere: ["CLAUDE_EN_CHROME_CONECTADO"],
    });
    expect(nodo.id).toBe("recurso:os:claude-en-chrome");
    expect(["habilidad", "conector"]).toContain(nodo.tipo);
    expect(nodo.capas).toContain("ia");
    expect((nodo as unknown as Record<string, unknown>).secret).toBeUndefined();
  });
});

describe("creacion - mapeo puro", () => {
  it("moleculaANodo crea nodo proyecto con ref", async () => {
    const { moleculaANodo } = await import("../fuentes/creacion");
    const nodo = moleculaANodo({
      id: "mol-1",
      titulo: "Molecula",
      ambito: "personal",
      actualizadaEn: 1000,
    });
    expect(nodo.id).toBe("molecula:mol-1");
    expect(nodo.tipo).toBe("proyecto");
    expect(nodo.alcance).toBe("privado");
    expect(nodo.ref).toContain("mol-1");
    expect(nodo.capas).toContain("creacion");
  });

  it("canvasANodo crea nodo proyecto con alcance según shared/scope", async () => {
    const { canvasANodo } = await import("../fuentes/creacion");
    const nodo = canvasANodo({
      id: "c1",
      owner: "u1",
      scope: "public",
      scope_ref: null,
      title: "Lienzo",
      blocks: [],
      shared: true,
    });
    expect(nodo.id).toBe("canvas:c1");
    expect(nodo.tipo).toBe("proyecto");
    expect(nodo.alcance).toBe("publico");
  });
});

describe("metagenesis - mapeo puro", () => {
  it("olaANodo crea nodo ola público", async () => {
    const { olaANodo } = await import("../fuentes/metagenesis");
    const nodo = olaANodo({
      ola: "multiverso-1125",
      estado: "activa",
      tareasTotal: 7,
      tareasCompletadas: 1,
      t: 1000,
    });
    expect(nodo.id).toBe("ola:multiverso-1125");
    expect(nodo.tipo).toBe("ola");
    expect(nodo.alcance).toBe("publico");
    expect(nodo.capas).toContain("metagenesis");
  });

  it("tareaANodo crea nodo tarea con arista a ola", async () => {
    const { tareaANodo, aristaTareaOla } = await import("../fuentes/metagenesis");
    const tarea = {
      id: "MV1125R3",
      ola: "multiverso-1125",
      titulo: "Fuentes vivas",
      estado: "en-curso",
      t: 2000,
    };
    const nodo = tareaANodo(tarea);
    const arista = aristaTareaOla(tarea);
    expect(nodo.id).toBe("tarea:MV1125R3");
    expect(nodo.tipo).toBe("tarea");
    expect(arista?.de).toBe("ola:multiverso-1125");
    expect(arista?.a).toBe("tarea:MV1125R3");
    expect(arista?.tipo).toBe("contiene");
  });

  it("agenteANodo crea nodo agente", async () => {
    const { agenteANodo } = await import("../fuentes/metagenesis");
    const nodo = agenteANodo({ id: "ag-1", nombre: "Astra", rol: "director", activo: true, t: 3000 });
    expect(nodo.id).toBe("agente:ag-1");
    expect(nodo.tipo).toBe("agente");
    expect(nodo.capas).toContain("metagenesis");
  });
});

describe("privacidad e integración con podarGrafo", () => {
  it("nodos de fuentes no exponen campos privados prohibidos", async () => {
    const { neuronaANodo } = await import("../fuentes/senales");
    const nodo = neuronaANodo({
      neuronId: "n1", syncDeviceId: "s1", nombre: "N", plataforma: "web",
      tipo: "other", online: false, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" },
    });
    const claves = Object.keys(nodo);
    for (const prohibida of ["contenido", "cuerpo", "texto_privado", "secret", "password", "token"]) {
      expect(claves).not.toContain(prohibida);
    }
  });

  it("podarGrafo oculta nodos privados ajenos de fuentes simuladas", async () => {
    const { neuronaANodo } = await import("../fuentes/senales");
    const { botANodo } = await import("../fuentes/ia");
    const grafo = crearGrafo();
    const ajena = neuronaANodo({
      neuronId: "n-ajena", syncDeviceId: "s2", nombre: "Ajena", plataforma: "web",
      tipo: "other", online: true, esEsteDispositivo: false, enlace: { estado: "conectado" },
    });
    ajena.dueno = "user-99";
    ajena.alcance = "privado";
    anadirNodo(grafo, ajena);
    anadirNodo(grafo, botANodo({
      id: "b1", nombre: "Bot", dueno: { tipo: "perfil", id: "user-1", cuentaId: "user-1" },
      origen: "astraura", gobierno: "jerarquico",
      personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
      cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo: true,
    }));
    const podado = podarGrafo(grafo, obs());
    expect(podado.nodos.has("neurona:n-ajena")).toBe(false);
    expect(podado.nodos.has("bot:b1")).toBe(true);
  });
});
