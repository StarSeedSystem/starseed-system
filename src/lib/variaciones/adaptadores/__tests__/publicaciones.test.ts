// Pruebas del adaptador de publicaciones y mensajes para «Variaciones públicas».
// Sin red: el lector/escritor de estado se inyecta (contrato §5).
import { describe, it, expect, beforeEach } from "vitest";
import { __resetRegistros, familiasRegistradas } from "../../familias";
import {
  crearAdaptadorPublicaciones,
  variacionAGuardado,
  variacionDesdeGuardado,
  type DepsPublicaciones,
  type FamiliaPublicacion,
  type PayloadPublicacion,
  type PayloadEstilo,
  type PayloadPlantilla,
  type PayloadDecoracion,
} from "../publicaciones";
import type { EstiloMensaje, DocRico, LienzoMensaje, BloqueDoc, ElementoLienzo } from "@/lib/mensajeria/formato-tipos";
import type { PostBlock } from "@/lib/creation/post-blocks";

function estiloDePrueba(): EstiloMensaje {
  return { fuente: "inter", tamano: 16, color: "#ffffff", fondo: "violeta", negrita: true };
}

function docDePrueba(): DocRico {
  return {
    bloques: [
      { tipo: "parrafo", tramos: [{ texto: "Hola" }] },
      { tipo: "titulo", nivel: 1, tramos: [{ texto: "Título" }] },
    ],
  };
}

function lienzoDePrueba(): LienzoMensaje {
  return {
    ancho: 540,
    alto: 540,
    fondo: "cosmos",
    animacionFondo: "aurora",
    elementos: [
      { id: "el1", tipo: "texto", x: 10, y: 10, w: 200, h: 100, z: 1, texto: docDePrueba() },
    ],
  };
}

function bloquesDePrueba(): PostBlock[] {
  return [
    { id: "blk-1", type: "texto", text: "Contenido del post" },
    { id: "blk-2", type: "imagen", url: "https://ejemplo.org/imagen.png", name: "imagen.png" },
  ];
}

function decoracionDePrueba() {
  return { fondoLienzo: "cosmos", animacionFondo: "aurora", presetLienzo: "cuadrado" };
}

function depsCon(activos: {
  estilo?: Record<FamiliaPublicacion, EstiloMensaje | null>;
  plantilla?: Record<FamiliaPublicacion, { doc?: DocRico; lienzo?: LienzoMensaje; bloques?: PostBlock[] } | null>;
  decoracion?: Record<FamiliaPublicacion, { fondoLienzo?: string; animacionFondo?: string; presetLienzo?: string } | null>;
}) {
  const escritos: Array<{ familia: FamiliaPublicacion; tipo: string; valor: unknown }> = [];

  const deps: DepsPublicaciones = {
    leerEstilo: (familia) => activos.estilo?.[familia] ?? null,
    leerPlantilla: (familia) => activos.plantilla?.[familia] ?? null,
    leerDecoracion: (familia) => activos.decoracion?.[familia] ?? null,
    escribirEstilo: (familia, estilo) => {
      if (!activos.estilo) activos.estilo = {} as any;
      activos.estilo[familia] = estilo;
      escritos.push({ familia, tipo: "estilo", valor: estilo });
    },
    escribirPlantilla: (familia, plantilla) => {
      if (!activos.plantilla) activos.plantilla = {} as any;
      activos.plantilla[familia] = plantilla;
      escritos.push({ familia, tipo: "plantilla", valor: plantilla });
    },
    escribirDecoracion: (familia, decoracion) => {
      if (!activos.decoracion) activos.decoracion = {} as any;
      activos.decoracion[familia] = decoracion;
      escritos.push({ familia, tipo: "decoracion", valor: decoracion });
    },
  };

  return { deps, activos, escritos };
}

beforeEach(() => {
  __resetRegistros();
});

describe("adaptador de publicaciones y mensajes", () => {
  describe("capturar", () => {
    it("captura el estilo activo de post:#estilo", () => {
      const { deps } = depsCon({ estilo: { post: estiloDePrueba(), mensaje: null } });
      const capturado = crearAdaptadorPublicaciones("post", deps).capturar("post:editor#estilo");
      expect(capturado?.tipo).toBe("estilo");
      expect(capturado?.estilo.fuente).toBe("inter");
      expect(capturado?.estilo.negrita).toBe(true);
    });

    it("captura el estilo activo de mensaje:#estilo", () => {
      const { deps } = depsCon({ estilo: { post: null, mensaje: estiloDePrueba() } });
      const capturado = crearAdaptadorPublicaciones("mensaje", deps).capturar("mensaje:editor#estilo");
      expect(capturado?.tipo).toBe("estilo");
      expect(capturado?.estilo.fondo).toBe("violeta");
    });

    it("captura la plantilla (doc + lienzo) de mensaje:#plantilla", () => {
      const { deps } = depsCon({
        plantilla: { mensaje: { doc: docDePrueba(), lienzo: lienzoDePrueba() }, post: null },
      });
      const capturado = crearAdaptadorPublicaciones("mensaje", deps).capturar("mensaje:editor#plantilla");
      expect(capturado?.tipo).toBe("plantilla");
      expect(capturado?.doc?.bloques.length).toBe(2);
      expect(capturado?.lienzo?.elementos.length).toBe(1);
      expect(capturado?.lienzo?.fondo).toBe("cosmos");
    });

    it("captura la plantilla (bloques) de post:#plantilla", () => {
      const { deps } = depsCon({
        plantilla: { post: { bloques: bloquesDePrueba() }, mensaje: null },
      });
      const capturado = crearAdaptadorPublicaciones("post", deps).capturar("post:compositor#plantilla");
      expect(capturado?.tipo).toBe("plantilla");
      expect(capturado?.bloques?.length).toBe(2);
      expect(capturado?.bloques?.[0].type).toBe("texto");
      expect(capturado?.bloques?.[1].type).toBe("imagen");
    });

    it("captura la decoración de mensaje:#decoracion", () => {
      const { deps } = depsCon({ decoracion: { mensaje: decoracionDePrueba(), post: null } });
      const capturado = crearAdaptadorPublicaciones("mensaje", deps).capturar("mensaje:editor#decoracion");
      expect(capturado?.tipo).toBe("decoracion");
      expect(capturado?.fondoLienzo).toBe("cosmos");
      expect(capturado?.animacionFondo).toBe("aurora");
      expect(capturado?.presetLienzo).toBe("cuadrado");
    });

    it("captura la decoración de post:#decoracion", () => {
      const { deps } = depsCon({ decoracion: { post: decoracionDePrueba(), mensaje: null } });
      const capturado = crearAdaptadorPublicaciones("post", deps).capturar("post:compositor#decoracion");
      expect(capturado?.tipo).toBe("decoracion");
      expect(capturado?.presetLienzo).toBe("cuadrado");
    });

    it("devuelve null si no hay nada activo", () => {
      const vacio = depsCon({});
      expect(crearAdaptadorPublicaciones("post", vacio.deps).capturar("post:editor#estilo")).toBeNull();
      expect(crearAdaptadorPublicaciones("mensaje", vacio.deps).capturar("mensaje:editor#plantilla")).toBeNull();
    });

    it("devuelve null si la clave es de otra familia", () => {
      const { deps } = depsCon({ estilo: { post: estiloDePrueba(), mensaje: null } });
      expect(crearAdaptadorPublicaciones("mensaje", deps).capturar("post:editor#estilo")).toBeNull();
    });

    it("devuelve null si la clave tiene formato inválido", () => {
      const { deps } = depsCon({ estilo: { post: estiloDePrueba(), mensaje: null } });
      expect(crearAdaptadorPublicaciones("post", deps).capturar("clave-invalida")).toBeNull();
      expect(crearAdaptadorPublicaciones("post", deps).capturar("post:editor#parte-desconocida")).toBeNull();
    });
  });

  describe("validar", () => {
    it("acepta un payload de estilo válido", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      const payload: PayloadEstilo = { tipo: "estilo", estilo: estiloDePrueba() };
      expect(adaptador.validar(payload).ok).toBe(true);
    });

    it("acepta un payload de plantilla con doc y lienzo (mensaje)", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("mensaje", deps);
      const payload: PayloadPlantilla = { tipo: "plantilla", doc: docDePrueba(), lienzo: lienzoDePrueba() };
      expect(adaptador.validar(payload).ok).toBe(true);
    });

    it("acepta un payload de plantilla con bloques (post)", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      const payload: PayloadPlantilla = { tipo: "plantilla", bloques: bloquesDePrueba() };
      expect(adaptador.validar(payload).ok).toBe(true);
    });

    it("acepta un payload de decoración válido", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      const payload: PayloadDecoracion = { tipo: "decoracion", ...decoracionDePrueba() };
      expect(adaptador.validar(payload).ok).toBe(true);
    });

    it("rechaza payload sin tipo", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      expect(adaptador.validar({} as PayloadPublicacion).ok).toBe(false);
    });

    it("rechaza tipo desconocido", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      expect(adaptador.validar({ tipo: "inventado" } as PayloadPublicacion).ok).toBe(false);
    });

    it("rechaza estilo inválido (no es objeto)", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      expect(adaptador.validar({ tipo: "estilo", estilo: "no-es-objeto" } as PayloadPublicacion).ok).toBe(false);
    });

    it("rechaza plantilla vacía (sin doc, lienzo ni bloques)", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      expect(adaptador.validar({ tipo: "plantilla" } as PayloadPublicacion).ok).toBe(false);
    });

    it("rechaza decoración con valores no cadenas", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      expect(adaptador.validar({ tipo: "decoracion", fondoLienzo: 123 } as PayloadPublicacion).ok).toBe(false);
    });

    it("rechaza payload con clave privada (token)", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      const payload: PayloadEstilo = {
        tipo: "estilo",
        estilo: { ...estiloDePrueba(), color: "sk-fake123def456ghi789" },
      };
      const revision = adaptador.validar(payload);
      expect(revision.ok).toBe(false);
      if (!revision.ok) expect(revision.motivos.some((m) => m.startsWith("Privacidad"))).toBe(true);
    });

    it("rechaza plantilla que parece contener datos privados", () => {
      const { deps } = depsCon({});
      const adaptador = crearAdaptadorPublicaciones("post", deps);
      const bloquesConSecreto: PostBlock[] = [
        { id: "blk-1", type: "texto", text: "password=secreto123" },
      ];
      const payload: PayloadPlantilla = { tipo: "plantilla", bloques: bloquesConSecreto };
      const revision = adaptador.validar(payload);
      expect(revision.ok).toBe(false);
      if (!revision.ok) expect(revision.motivos.some((m) => m.includes("Privacidad") || m.includes("privados"))).toBe(true);
    });
  });

  describe("aplicar y deshacer", () => {
    it("aplicar estilo escribe y deshacer restaura el anterior", () => {
      const estiloInicial = { fuente: "outfit", tamano: 14 } as EstiloMensaje;
      const { deps, escritos } = depsCon({ estilo: { post: estiloInicial, mensaje: null } });
      const adaptador = crearAdaptadorPublicaciones("post", deps);

      const nuevoEstilo: PayloadEstilo = { tipo: "estilo", estilo: estiloDePrueba() };
      const validado = adaptador.validar(nuevoEstilo);
      expect(validado.ok).toBe(true);
      if (!validado.ok) return;

      const { deshacer } = adaptador.aplicar("post:editor#estilo", validado.payload);
      expect(escritos).toHaveLength(1);
      expect(escritos[0].tipo).toBe("estilo");
      expect((escritos[0].valor as EstiloMensaje).fuente).toBe("inter");

      deshacer();
      expect(escritos).toHaveLength(2);
      expect(escritos[1].tipo).toBe("estilo");
      expect((escritos[1].valor as EstiloMensaje).fuente).toBe("outfit");
    });

    it("aplicar plantilla (doc + lienzo) escribe y deshacer restaura", () => {
      const plantillaInicial = { doc: docDePrueba(), lienzo: null };
      const { deps, escritos } = depsCon({ plantilla: { mensaje: plantillaInicial, post: null } });
      const adaptador = crearAdaptadorPublicaciones("mensaje", deps);

      const nuevaPlantilla: PayloadPlantilla = { tipo: "plantilla", doc: docDePrueba(), lienzo: lienzoDePrueba() };
      const validado = adaptador.validar(nuevaPlantilla);
      expect(validado.ok).toBe(true);
      if (!validado.ok) return;

      const { deshacer } = adaptador.aplicar("mensaje:editor#plantilla", validado.payload);
      expect(escritos).toHaveLength(1);
      expect(escritos[0].tipo).toBe("plantilla");
      expect((escritos[0].valor as any).lienzo?.fondo).toBe("cosmos");

      deshacer();
      expect(escritos).toHaveLength(2);
      expect(escritos[1].tipo).toBe("plantilla");
      expect((escritos[1].valor as any).lienzo).toBeNull();
    });

    it("aplicar plantilla (bloques) escribe y deshacer restaura", () => {
      const bloquesIniciales: PostBlock[] = [{ id: "blk-0", type: "texto", text: "inicial" }];
      const { deps, escritos } = depsCon({ plantilla: { post: { bloques: bloquesIniciales }, mensaje: null } });
      const adaptador = crearAdaptadorPublicaciones("post", deps);

      const nuevaPlantilla: PayloadPlantilla = { tipo: "plantilla", bloques: bloquesDePrueba() };
      const validado = adaptador.validar(nuevaPlantilla);
      expect(validado.ok).toBe(true);
      if (!validado.ok) return;

      const { deshacer } = adaptador.aplicar("post:compositor#plantilla", validado.payload);
      expect(escritos).toHaveLength(1);
      expect((escritos[0].valor as any).bloques?.length).toBe(2);

      deshacer();
      expect(escritos).toHaveLength(2);
      expect((escritos[1].valor as any).bloques?.length).toBe(1);
      expect((escritos[1].valor as any).bloques?.[0].text).toBe("inicial");
    });

    it("aplicar decoración escribe y deshacer restaura", () => {
      const decoracionInicial = { fondoLienzo: "violeta", animacionFondo: "ninguna", presetLienzo: "vertical" };
      const { deps, escritos } = depsCon({ decoracion: { post: decoracionInicial, mensaje: null } });
      const adaptador = crearAdaptadorPublicaciones("post", deps);

      const nuevaDecoracion: PayloadDecoracion = { tipo: "decoracion", ...decoracionDePrueba() };
      const validado = adaptador.validar(nuevaDecoracion);
      expect(validado.ok).toBe(true);
      if (!validado.ok) return;

      const { deshacer } = adaptador.aplicar("post:compositor#decoracion", validado.payload);
      expect(escritos).toHaveLength(1);
      expect((escritos[0].valor as any).fondoLienzo).toBe("cosmos");

      deshacer();
      expect(escritos).toHaveLength(2);
      expect((escritos[1].valor as any).fondoLienzo).toBe("violeta");
      expect((escritos[1].valor as any).presetLienzo).toBe("vertical");
    });

    it("no aplica nada si la validación falla", () => {
      const { deps, escritos } = depsCon({ estilo: { post: estiloDePrueba(), mensaje: null } });
      const adaptador = crearAdaptadorPublicaciones("post", deps);

      const invalido = { tipo: "estilo", estilo: "no-es-objeto" } as PayloadPublicacion;
      const { deshacer } = adaptador.aplicar("post:editor#estilo", invalido);
      expect(escritos).toHaveLength(0);
      deshacer();
      expect(escritos).toHaveLength(0);
    });

    it("no aplica si la clave es de otra familia", () => {
      const { deps, escritos } = depsCon({ estilo: { post: estiloDePrueba(), mensaje: null } });
      const adaptador = crearAdaptadorPublicaciones("mensaje", deps);

      const valido: PayloadEstilo = { tipo: "estilo", estilo: estiloDePrueba() };
      const validado = adaptador.validar(valido);
      expect(validado.ok).toBe(true);
      if (!validado.ok) return;

      const { deshacer } = adaptador.aplicar("post:editor#estilo", validado.payload);
      expect(escritos).toHaveLength(0);
      deshacer();
      expect(escritos).toHaveLength(0);
    });
  });

  describe("ida y vuelta por la Biblioteca", () => {
    it("convierte payload de estilo a guardado y lo recupera", () => {
      const payload: PayloadEstilo = { tipo: "estilo", estilo: estiloDePrueba() };
      const entrada = variacionAGuardado(payload);
      expect(entrada.type).toBe("publicacion");
      const recuperado = variacionDesdeGuardado(entrada);
      expect(recuperado).toEqual(payload);
    });

    it("convierte payload de plantilla a guardado y lo recupera", () => {
      const payload: PayloadPlantilla = { tipo: "plantilla", doc: docDePrueba(), lienzo: lienzoDePrueba() };
      const entrada = variacionAGuardado(payload);
      expect(entrada.type).toBe("publicacion");
      const recuperado = variacionDesdeGuardado(entrada);
      expect(recuperado).toEqual(payload);
    });

    it("convierte payload de decoración a guardado y lo recupera", () => {
      const payload: PayloadDecoracion = { tipo: "decoracion", ...decoracionDePrueba() };
      const entrada = variacionAGuardado(payload);
      expect(entrada.type).toBe("publicacion");
      const recuperado = variacionDesdeGuardado(entrada);
      expect(recuperado).toEqual(payload);
    });

    it("devuelve null si el contenido no es JSON válido", () => {
      expect(variacionDesdeGuardado({ content: "no-es-json" })).toBeNull();
    });

    it("devuelve null si no hay content", () => {
      expect(variacionDesdeGuardado({ content: null })).toBeNull();
      expect(variacionDesdeGuardado({})).toBeNull();
    });
  });

  describe("registro en el registro compartido", () => {
    it("registra post y mensaje en el registro común", async () => {
      const { deps } = depsCon({});
      const { registrarAdaptadoresPublicaciones } = await import("../publicaciones");
      registrarAdaptadoresPublicaciones(deps);
      expect(familiasRegistradas()).toEqual(expect.arrayContaining(["post", "mensaje"]));
    });
  });
});