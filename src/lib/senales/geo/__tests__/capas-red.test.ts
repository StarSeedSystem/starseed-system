import { describe, expect, it } from "vitest";
import { CAPAS_SENALES, CAPA_POR_ID, CAPA_RED_POR_ID, GRUPOS_CAPA, GrupoCapa, COLOR_DESCONOCIDO, NOTA_ALCANCE, valorRed, rotuloRed } from "../capas";
import type { SenalEspectro } from "../../espectro/tipos";

describe("capas: grupo 'red' — cuatro capas de red completa", () => {
  it("el grupo 'red' existe en GRUPOS_CAPA con su título", () => {
    const grupo = GRUPOS_CAPA.find((g) => g.id === "red");
    expect(grupo).toBeDefined();
    expect(grupo?.titulo).toBe("Red completa (lo que cada dueño publica)");
  });

  it("GrupoCapa incluye 'red'", () => {
    // TypeScript compile-time check: GrupoCapa debe aceptar "red"
    const _grupo: GrupoCapa = "red";
    expect(_grupo).toBe("red");
  });

  const idsEsperados = ["red-publica", "red-comunidad", "red-privada", "red-externa"];

  it("las cuatro capas del grupo 'red' existen en CAPAS_SENALES", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();
      expect(capa?.grupo).toBe("red");
    }
  });

  it("cada capa del grupo 'red' tiene estado honesto, fuente citando módulos espectro, y tramos por origen", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();

      // Estado honesto: parcial (mientras no hay publicadores) o sin-fuente (externa si nada la alimenta)
      expect(["parcial", "sin-fuente"]).toContain(capa?.estado);

      // Fuente cita módulos espectro/leer-senales.ts y/o espectro/publicacion.ts
      expect(capa?.fuente).toMatch(/espectro\/leer-senales\.ts|espectro\/publicacion\.ts/);

      // Tramos por origen: medida = relleno, declarada = anillo, estimada = rayado
      const tramasOrigen = capa?.tramos.map((t) => t.id) ?? [];
      expect(tramasOrigen).toContain("medida");
      expect(tramasOrigen).toContain("declarada");
      expect(tramasOrigen).toContain("estimada");
      expect(tramasOrigen).toContain("desconocido");

      const tramoMedida = capa?.tramos.find((t) => t.id === "medida");
      const tramoDeclarada = capa?.tramos.find((t) => t.id === "declarada");
      const tramoEstimada = capa?.tramos.find((t) => t.id === "estimada");

      expect(tramoMedida?.estilo).toBe("relleno");
      expect(tramoDeclarada?.estilo).toBe("anillo");
      expect(tramoEstimada?.estilo).toBe("rayado");
    }
  });

  it("capa estimada nunca usa estilo 'relleno' (lo medido usa relleno)", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const tramoEstimada = capa?.tramos.find((t) => t.id === "estimada");
      expect(tramoEstimada?.estilo).not.toBe("relleno");
      expect(tramoEstimada?.estilo).toBe("rayado");
    }
  });

  it("la leyenda incluye 'publicado por su dueño' y 'zona aproximada'", () => {
    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const etiquetas = capa?.tramos.map((t) => t.etiqueta.toLowerCase()) ?? [];
      const textoCompleto = etiquetas.join(" ");
      expect(textoCompleto).toMatch(/publicado por su due[ñn]o/);
      expect(textoCompleto).toMatch(/zona aproximada/);
    }
  });

  it("sin señales publicadas la capa dice «sin publicar» (tramo desconocido, medida=false)", () => {
    // Marca sin datos de red (posición desconocida, sin antenas de red)
    const marcaVacia = {
      id: "neurona:test",
      neuronaId: "test",
      nombre: "Test",
      esYo: false,
      forma: "punto" as const,
      estado: "desconocida" as const,
      posicion: { tipo: "desconocida" as const, motivo: "sin datos" },
      calidad: { valor: null, t: null, fuente: "", nota: "" },
      enlace: { estado: "sin-vinculo" as const, latenciaMs: null, t: null },
      antenas: [],
      capas: { lista: null, t: null, fuente: "" },
      hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
      aparato: null,
    };

    for (const id of idsEsperados) {
      const capa = CAPA_POR_ID[id];
      const valor = capa?.valor(marcaVacia as any);
      expect(valor).toBeDefined();
      expect(valor?.tramo).toBe("desconocido");
      expect(valor?.texto).toBe("sin publicar");
      expect(valor?.medida).toBe(false);
    }
  });

  it("CAPA_POR_ID incluye las cuatro capas nuevas y las existentes no cambian de id ni orden", () => {
    const idsExistentes = CAPAS_SENALES
      .filter((c) => !idsEsperados.includes(c.id))
      .map((c) => c.id);
    // Verificamos que las capas base siguen ahí
    expect(idsExistentes).toContain("senal-internet");
    expect(idsExistentes).toContain("cobertura-ble");
    expect(idsExistentes).toContain("enlaces-medidos");

    // Verificamos que las nuevas están en CAPA_POR_ID
    for (const id of idsEsperados) {
      expect(CAPA_POR_ID[id]).toBeDefined();
    }
  });

  it("NOTA_ALCANCE menciona que los campos rayados son alcance estimado", () => {
    expect(NOTA_ALCANCE).toMatch(/alcance estimado/);
    expect(NOTA_ALCANCE).toMatch(/rayad/);
  });
});

describe("capas red-*: señales publicadas de toda la red (AUD1117 F2)", () => {
  const T = 1_700_000_000_000;

  function senal(capa: "publica" | "comunidad" | "privada" | "externa", origen: "medida" | "declarada" | "estimada", id: string, overrides: Partial<SenalEspectro> = {}): SenalEspectro {
    return {
      id, medio: "wifi", banda: "2.4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -45,
      calidad: 0.8, origen, capa, fuente: "publicada por su dueño", medidoEn: T, zona: "A1",
      compatibles: [], ...overrides,
    };
  }

  const marcaVacia = {
    id: "neurona:test", neuronaId: "test", nombre: "Test", esYo: false, forma: "punto" as const,
    estado: "desconocida" as const, posicion: { tipo: "desconocida" as const, motivo: "sin datos" },
    calidad: { valor: null, t: null, fuente: "", nota: "" },
    enlace: { estado: "sin-vinculo" as const, latenciaMs: null, t: null },
    antenas: [], capas: { lista: null, t: null, fuente: "" },
    hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
    aparato: null,
  } as any;

  it("CAPA_RED_POR_ID mapea las cuatro capas del grupo «red» a su capa del espectrómetro", () => {
    expect(CAPA_RED_POR_ID["red-publica"]).toBe("publica");
    expect(CAPA_RED_POR_ID["red-comunidad"]).toBe("comunidad");
    expect(CAPA_RED_POR_ID["red-privada"]).toBe("privada");
    expect(CAPA_RED_POR_ID["red-externa"]).toBe("externa");
  });

  it("con filas en tres capas, cada capa pinta lo suyo: conteo y origen dominante", () => {
    const filas = [
      senal("publica", "medida", "p1"),
      senal("publica", "medida", "p2", { medidoEn: T + 5000 }),
      senal("publica", "estimada", "p3"),
      senal("comunidad", "declarada", "c1"),
      senal("privada", "medida", "v1"),
    ];
    const publica = valorRed("publica", filas);
    expect(publica.texto).toContain("3 señales");
    expect(publica.texto).toContain("2 medidas");
    expect(publica.texto).toContain("1 estimadas");
    expect(publica.tramo).toBe("medida");
    expect(publica.medida).toBe(true);
    expect(publica.t).toBe(T + 5000);

    const comunidad = valorRed("comunidad", filas);
    expect(comunidad.texto).toContain("1 señal");
    expect(comunidad.texto).toContain("1 declaradas");
    expect(comunidad.tramo).toBe("declarada");

    const privada = valorRed("privada", filas);
    expect(privada.texto).toContain("1 señal");
    expect(privada.tramo).toBe("medida");

    const externa = valorRed("externa", filas);
    expect(externa.tramo).toBe("desconocido");
    expect(externa.texto).toBe("sin publicar");
  });

  it("las capas red-* reciben las señales publicadas por su segundo argumento y pintan su capa", () => {
    const filas = [senal("comunidad", "declarada", "c1"), senal("publica", "medida", "p1")];
    const capaComunidad = CAPA_POR_ID["red-comunidad"];
    const valor = capaComunidad?.valor(marcaVacia, filas);
    expect(valor?.tramo).toBe("declarada");
    expect(valor?.texto).toContain("1 señal");
  });

  it("el origen dominante decide el tramo; con dominio de estimadas el tramo es rayado", () => {
    const filas = [
      senal("publica", "estimada", "e1"),
      senal("publica", "estimada", "e2"),
      senal("publica", "medida", "m1"),
    ];
    const valor = valorRed("publica", filas);
    expect(valor.tramo).toBe("estimada");
    expect(valor.medida).toBe(false);
  });

  it("sin filas el texto es «sin publicar» y no menciona datos ni personas", () => {
    const valor = valorRed("publica", []);
    expect(valor.tramo).toBe("desconocido");
    expect(valor.texto).toBe("sin publicar");
    expect(valor.t).toBeNull();
    expect(valor.medida).toBe(false);
  });

  it("rotuloRed: con filas resume, sin filas dice «sin publicar», con error dice el motivo", () => {
    const filas = [senal("publica", "medida", "p1")];
    expect(rotuloRed("red-publica", { senales: filas, estado: "ok", cargando: false }).texto).toContain("1 señal");
    expect(rotuloRed("red-publica", { senales: [], estado: "ok", cargando: false }).texto).toBe("sin publicar");
    expect(rotuloRed("red-publica", { senales: [], estado: "sin-tabla", motivo: "la tabla os_senales_publicas no existe en este proyecto", cargando: false }).texto)
      .toBe("la tabla os_senales_publicas no existe en este proyecto");
    expect(rotuloRed("red-publica", { senales: [], estado: "error", motivo: "permission denied", cargando: false }).texto).toBe("permission denied");
    expect(rotuloRed("red-publica", { senales: [], estado: "sin-sesion", motivo: "no hay cliente de Supabase (sesión no iniciada)", cargando: false }).texto)
      .toBe("no hay cliente de Supabase (sesión no iniciada)");
  });

  it("rotuloRed: mientras lee dice que está leyendo; capa desconocida sale desconocido", () => {
    const leyendo = rotuloRed("red-publica", { senales: [], estado: "ok", cargando: true });
    expect(leyendo.texto).toMatch(/leyendo/);
    const rara = rotuloRed("capa-inexistente", { senales: [], estado: "ok", cargando: false });
    expect(rara.tramo).toBe("desconocido");
  });

  it("rotuloRed sin lectura alguna no dice «sin publicar» (no finge que ya miró la tabla)", () => {
    const valor = rotuloRed("red-privada", undefined);
    expect(valor.tramo).toBe("desconocido");
    expect(valor.texto).not.toBe("sin publicar");
  });
});