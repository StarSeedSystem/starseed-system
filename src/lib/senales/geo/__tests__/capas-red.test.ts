import { describe, expect, it } from "vitest";
import {
  CAPAS_SENALES, CAPA_POR_ID, GRUPOS_CAPA, GrupoCapa, COLOR_DESCONOCIDO, NOTA_ALCANCE,
  motivoSenalesPublicadas, pintarMarca, valorRedPublicada,
} from "../capas";
import { construirMarcas } from "../marcas";
import { parchesDeCapa } from "../parches";
import type { SenalEspectro } from "../../espectro/tipos";

const AHORA = 1_700_000_000_000;
const idsEsperados = ["red-publica", "red-comunidad", "red-privada", "red-externa"];

/** Señal publicada de prueba, con capa y origen a la carta y vínculo de neurona. */
function publicada(o: Partial<SenalEspectro>): SenalEspectro {
  return {
    id: "s1", medio: "wifi", banda: "2.4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -45,
    calidad: 0.8, origen: "medida", capa: "publica", fuente: "publicada por su dueño", medidoEn: AHORA - 1000,
    zona: "A1", compatibles: [], vinculo: { tipo: "neurona", id: "neu-1" }, ...o,
  };
}

/** Marca de prueba construida por el camino real (construirMarcas) más señales publicadas ya repartidas.
 * Devuelve la de «neu-1» (la lista ordena «yo» primero). */
function marcaCon(publicadas: SenalEspectro[] = []) {
  const fila = { neuronId: "neu-1", nombre: "Norte", plataforma: "Android", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" } } as never;
  const yo = { neuronaId: "yo", nombre: "Yo", capas: null, posicion: { lat: 19.4326, lon: -99.1332, precisionM: 5, t: AHORA - 5000 }, senales: null };
  const marcas = construirMarcas({
    filas: [fila], medios: [], ahora: AHORA, yo,
    posiciones: { "neu-1": { lat: 19.4330, lon: -99.1330, t: AHORA - 4000 } },
    canal: { unido: true, motivo: null }, publicadas,
  });
  return marcas.find((m) => m.neuronaId === "neu-1")!;
}

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

  it("sin filas publicadas, valor() dice «sin publicar» (tramo desconocido, medida=false)", () => {
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
      expect(valor?.texto).toMatch(/sin publicar/);
      expect(valor?.medida).toBe(false);
    }
  });

  it("valorRedPublicada coincide con capa.valor: cada capa red-* pinta por el mismo camino", () => {
    const m = marcaCon();
    for (const id of idsEsperados) {
      expect(CAPA_POR_ID[id].valor(m)).toEqual(valorRedPublicada(id, m));
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

describe("capas red-* con señales publicadas (AUD1117)", () => {
  it("con filas de prueba en tres capas, cada capa pinta lo suyo diciendo el origen", () => {
    const m = marcaCon([
      publicada({ id: "p", capa: "publica", origen: "medida", medidoEn: AHORA - 1000 }),
      publicada({ id: "c", capa: "comunidad", origen: "declarada", medidoEn: AHORA - 2000, vinculo: { tipo: "neurona", id: "neu-1" } }),
      publicada({ id: "v", capa: "privada", origen: "estimada", medidoEn: AHORA - 3000, vinculo: { tipo: "neurona", id: "neu-1" } }),
    ]);
    const publica = CAPA_POR_ID["red-publica"].valor(m);
    expect(publica.tramo).toBe("medida");
    expect(publica.texto).toMatch(/medida/);
    expect(publica.medida).toBe(true);
    expect(publica.t).toBe(AHORA - 1000);

    const comunidad = CAPA_POR_ID["red-comunidad"].valor(m);
    expect(comunidad.tramo).toBe("declarada");
    expect(comunidad.texto).toMatch(/declarada/);
    expect(comunidad.medida).toBe(false);

    const privada = CAPA_POR_ID["red-privada"].valor(m);
    expect(privada.tramo).toBe("estimada");
    expect(privada.texto).toMatch(/estimada/);

    // La capa externa no recibió filas: «sin publicar», nunca inventado.
    const externa = CAPA_POR_ID["red-externa"].valor(m);
    expect(externa.tramo).toBe("desconocido");
    expect(externa.texto).toMatch(/sin publicar/);
  });

  it("con varias filas de la misma capa, pinta la más reciente", () => {
    const m = marcaCon([
      publicada({ id: "vieja", capa: "publica", origen: "estimada", medidoEn: AHORA - 90_000 }),
      publicada({ id: "reciente", capa: "publica", origen: "medida", medidoEn: AHORA - 1000, banda: "5 GHz" }),
    ]);
    const v = CAPA_POR_ID["red-publica"].valor(m);
    expect(v.tramo).toBe("medida");
    expect(v.texto).toContain("5 GHz");
    expect(v.t).toBe(AHORA - 1000);
  });

  it("las señales sin capa propia no se cuelgan de ninguna capa red-*", () => {
    const m = marcaCon([publicada({ id: "x", capa: "propia" })]);
    for (const id of idsEsperados) {
      expect(CAPA_POR_ID[id].valor(m).texto).toMatch(/sin publicar/);
    }
  });

  it("el pintado va por el mismo cauce: parche del tramo del origen (medida = relleno)", () => {
    const m = marcaCon([publicada({ id: "p", capa: "publica", origen: "medida" })]);
    const parches = parchesDeCapa(CAPA_POR_ID["red-publica"], [m], AHORA);
    expect(parches).toHaveLength(1);
    expect(parches[0].estilo).toBe("relleno");
    expect(parches[0].texto).toMatch(/medida/);
  });

  it("construirMarcas reparte cada señal solo a la neurona de su vínculo", () => {
    const fila = { neuronId: "neu-1", nombre: "Norte", tipo: "mobile", online: true, esEsteDispositivo: false, enlace: { estado: "sin-vinculo" } } as never;
    const marcas = construirMarcas({
      filas: [fila], medios: [], ahora: AHORA,
      yo: { neuronaId: "yo", nombre: "Yo", capas: null, posicion: { lat: 19.4326, lon: -99.1332, precisionM: 5, t: AHORA - 5000 }, senales: null },
      publicadas: [
        publicada({ id: "suya", capa: "publica" }),
        publicada({ id: "de-otra", capa: "publica", vinculo: { tipo: "neurona", id: "neu-2" } }),
        publicada({ id: "de-antena", capa: "publica", vinculo: { tipo: "antena", id: "neu-1" } }),
      ],
    });
    const norte = marcas.find((m) => m.neuronaId === "neu-1")!;
    const yo = marcas.find((m) => m.esYo)!;
    expect(norte.publicadas?.map((s) => s.id)).toEqual(["suya"]);
    expect(yo.publicadas).toBeUndefined();
  });
});

describe("panel de capas: motivo cuando la lectura de señales publicadas falla (AUD1117)", () => {
  it("con error de lectura, el motivo se dice completo", () => {
    expect(motivoSenalesPublicadas("error", "permission denied")).toContain("permission denied");
    expect(motivoSenalesPublicadas("sin-tabla", "la tabla os_senales_publicas no existe en este proyecto")).toContain("os_senales_publicas");
  });

  it("sin sesión también dice el motivo; con la lectura bien, no dice nada", () => {
    expect(motivoSenalesPublicadas("sin-sesion", "no hay cliente de Supabase (sesión no iniciada)")).toMatch(/Supabase/);
    expect(motivoSenalesPublicadas("ok")).toBeNull();
    expect(motivoSenalesPublicadas("ok", "irrelevante")).toBeNull();
  });

  it("si el motivo no llegó, dice que no se pudo leer en vez de callarse", () => {
    const texto = motivoSenalesPublicadas("error");
    expect(texto).not.toBeNull();
    expect(texto).toMatch(/no se pudo leer/);
  });
});