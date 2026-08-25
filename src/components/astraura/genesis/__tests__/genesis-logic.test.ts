/**
 * Tests de `genesis-logic.ts` — toda lógica pura, sin red ni React.
 */
import { describe, expect, it } from "vitest";
import { fnv1a32, derivarAdn } from "@/lib/astraura/genesis-dna";
import { ENRUTADO_POR_DEFECTO, SOBERANIA_POR_DEFECTO, type Propuesta, type Soberania } from "@/lib/astraura/genesis-types";
import {
  adnDeSer,
  costeLabel,
  describirEnrutado,
  describirSoberania,
  escaleraConCatalogo,
  estadoSerLabel,
  estadoSerTone,
  fmtLatencia,
  joinLineList,
  nivelEvolutivoLabel,
  nombreEnLinaje,
  nombrePorId,
  parseLineList,
  propuestasPendientes,
  resumirCambiosPropuesta,
  validarSolicitudGenesis,
} from "@/components/astraura/genesis/genesis-logic";

/* ─────────────────────────────── ADN ─────────────────────────────── */

describe("adnDeSer", () => {
  it("usa el ADN guardado tal cual si ya existe y no hay ajustes", () => {
    const adn = derivarAdn({ id: "s1", nombre: "Aurora" });
    expect(adnDeSer({ id: "s1", nombre: "Aurora", adn })).toEqual(adn);
  });

  it("sin `adn` guardado, lo deriva — determinista: mismos datos, mismo resultado que llamar a derivarAdn directamente", () => {
    const a = adnDeSer({ id: "s2", nombre: "Nébula", color: "#7dd3fc", generacion: 1, experiencia: 10 });
    const b = derivarAdn({ id: "s2", nombre: "Nébula", colorPersonalidad: "#7dd3fc", generacion: 1, experiencia: 10 });
    expect(a).toEqual(b);
  });

  it("superpone `adnAjustes` sobre la base (guardada o derivada) sin perder el resto de rasgos", () => {
    const base = derivarAdn({ id: "s3", nombre: "Hermes" });
    const conAjustes = adnDeSer({ id: "s3", nombre: "Hermes", adn: base, adnAjustes: { matiz: 42, aura: 0.99 } });
    expect(conAjustes.matiz).toBe(42);
    expect(conAjustes.aura).toBe(0.99);
    expect(conAjustes.solido).toBe(base.solido); // el resto de rasgos sigue intacto
    expect(conAjustes.paleta).toEqual(base.paleta);
  });

  it("dos ids distintos nunca coinciden en semilla (comprobación indirecta vía fnv1a32, como documenta genesis-dna.ts)", () => {
    expect(fnv1a32("a|Aurora")).not.toBe(fnv1a32("b|Aurora"));
  });
});

describe("nivelEvolutivoLabel", () => {
  it("recorre las cinco fases en orden creciente", () => {
    expect(nivelEvolutivoLabel(0)).toBe("semilla");
    expect(nivelEvolutivoLabel(0.2)).toBe("brote");
    expect(nivelEvolutivoLabel(0.5)).toBe("floreciendo");
    expect(nivelEvolutivoLabel(0.8)).toBe("arraigado");
    expect(nivelEvolutivoLabel(0.95)).toBe("plenitud");
  });

  it("valores no finitos (NaN, undefined coaccionado) caen a 'semilla', nunca revientan", () => {
    expect(nivelEvolutivoLabel(NaN)).toBe("semilla");
  });
});

/* ─────────────────────────────── Estado ─────────────────────────────── */

describe("estadoSerLabel / estadoSerTone", () => {
  it("las tres etiquetas son exactamente las tres del contrato", () => {
    expect(estadoSerLabel("activo")).toBe("Activo");
    expect(estadoSerLabel("durmiendo")).toBe("Durmiendo");
    expect(estadoSerLabel("suspendido")).toBe("Suspendido");
  });

  it("cada estado tiene un tono distinto (no dependen solo del texto)", () => {
    const tones = new Set([estadoSerTone("activo"), estadoSerTone("durmiendo"), estadoSerTone("suspendido")]);
    expect(tones.size).toBe(3);
  });
});

/* ─────────────────────────── Enrutado cognitivo ─────────────────────────── */

describe("describirEnrutado", () => {
  it("nunca ha pensado: sin último usado, siguiente a intentar es el primer peldaño", () => {
    const info = describirEnrutado(ENRUTADO_POR_DEFECTO);
    expect(info.ultimoUsado).toBeNull();
    expect(info.posicionEnEscalera).toBeNull();
    expect(info.degradada).toBe(false);
    expect(info.siguienteSiFalla).toBe(ENRUTADO_POR_DEFECTO.escalera[0]);
    expect(info.resumen).toMatch(/todavía no ha pensado/i);
  });

  it("último usado está en la escalera: reporta su posición y el siguiente peldaño real", () => {
    const info = describirEnrutado({ escalera: ["a", "b", "c"], soloGratuitos: true, ultimoUsado: "b" });
    expect(info.posicionEnEscalera).toBe(1);
    expect(info.siguienteSiFalla).toBe("c");
  });

  it("último peldaño de la escalera: no hay más a qué caer (siguienteSiFalla es null, no revienta)", () => {
    const info = describirEnrutado({ escalera: ["a", "b"], soloGratuitos: true, ultimoUsado: "b" });
    expect(info.siguienteSiFalla).toBeNull();
  });

  it("REGLA DE ORO: `ultimaFueDegradada` manda sobre todo lo demás — el resumen SIEMPRE dice la verdad, aunque haya un `ultimoUsado`", () => {
    const info = describirEnrutado({ escalera: ["gpt-free"], soloGratuitos: true, ultimoUsado: "gpt-free", ultimaFueDegradada: true });
    expect(info.degradada).toBe(true);
    expect(info.resumen).toMatch(/plantilla/i);
    expect(info.resumen).not.toMatch(/pensando con/i);
  });

  it("modelo usado que ya NO está en la escalera actual (se reordenó/quitó): posición null, no lanza", () => {
    const info = describirEnrutado({ escalera: ["nuevo-1", "nuevo-2"], soloGratuitos: true, ultimoUsado: "modelo-retirado" });
    expect(info.posicionEnEscalera).toBeNull();
    expect(info.siguienteSiFalla).toBe("nuevo-1"); // sin posición conocida, se ofrece el primer peldaño
  });

  it("escalera ausente o con forma inesperada (backend viejo) no revienta: se trata como vacía", () => {
    const info = describirEnrutado({ escalera: undefined as unknown as string[], soloGratuitos: true });
    expect(info.siguienteSiFalla).toBeNull();
    expect(info.resumen).toMatch(/todavía no ha pensado/i);
  });
});

describe("escaleraConCatalogo", () => {
  const catalogo = [
    { id: "a", etiqueta: "A", proveedor: "openrouter-gratis", costePorMillon: 0, verificado: true },
    { id: "c", etiqueta: "C", proveedor: "ollama", costePorMillon: 0, verificado: false },
  ];

  it("cruza cada peldaño con su ficha del catálogo, en el mismo orden que la escalera", () => {
    const out = escaleraConCatalogo({ escalera: ["a", "b", "c"], soloGratuitos: true, ultimoUsado: "c" }, catalogo);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out[0].catalogo?.etiqueta).toBe("A");
    expect(out[1].catalogo).toBeNull(); // "b" no está en el catálogo — no revienta, queda null
    expect(out[2].esUltimoUsado).toBe(true);
    expect(out[0].esUltimoUsado).toBe(false);
  });
});

describe("costeLabel / fmtLatencia", () => {
  it("coste 0 o ausente se lee 'gratuito'", () => {
    expect(costeLabel(0)).toBe("gratuito");
    expect(costeLabel(null)).toBe("gratuito");
    expect(costeLabel(undefined)).toBe("gratuito");
  });

  it("coste positivo se formatea con dos decimales", () => {
    expect(costeLabel(2.5)).toBe("2.50 / millón tokens");
  });

  it("latencia: milisegundos por debajo de 1s, segundos con dos decimales por encima", () => {
    expect(fmtLatencia(480)).toBe("480 ms");
    expect(fmtLatencia(1500)).toBe("1.50 s");
    expect(fmtLatencia(null)).toBe("—");
    expect(fmtLatencia(undefined)).toBe("—");
    expect(fmtLatencia(NaN)).toBe("—");
  });
});

/* ─────────────────────────────── Soberanía ─────────────────────────────── */

describe("describirSoberania", () => {
  it("por defecto puede proponer fuera: la frase es sobre PROPONER, nunca sobre aplicar solo", () => {
    const r = describirSoberania(SOBERANIA_POR_DEFECTO);
    expect(r.fueraDeZona).toMatch(/propuesta/i);
    expect(r.fueraDeZona).toMatch(/variante\//);
  });

  it("si `puedeProponerFuera` es false, la frase dice que se detiene, no que propone", () => {
    const s: Soberania = { ...SOBERANIA_POR_DEFECTO, puedeProponerFuera: false };
    const r = describirSoberania(s);
    expect(r.fueraDeZona).toMatch(/no puede ni siquiera proponer/i);
  });

  it("cuenta cada zona por separado (dominio, exploración, medios, cerebros)", () => {
    const s: Soberania = { ...SOBERANIA_POR_DEFECTO, dominio: ["/a", "/b"], exploracion: ["/c"], medios: ["bucket1"], cerebros: ["cerebro1"] };
    const r = describirSoberania(s);
    expect(r).toMatchObject({ totalDominio: 2, totalExploracion: 1, totalMedios: 1, totalCerebros: 1 });
  });

  it("`tieneLimites` refleja si hay límites duros, no si hay dominio", () => {
    expect(describirSoberania({ ...SOBERANIA_POR_DEFECTO, limitesDuros: [] }).tieneLimites).toBe(false);
    expect(describirSoberania({ ...SOBERANIA_POR_DEFECTO, limitesDuros: ["/secretos"] }).tieneLimites).toBe(true);
  });

  it("prefijo vacío o solo espacios cae a 'variante/' en vez de producir una rama sin nombre", () => {
    const r = describirSoberania({ ...SOBERANIA_POR_DEFECTO, prefijoRamaVariante: "   " });
    expect(r.ramaEjemplo.startsWith("variante/")).toBe(true);
  });

  it("el ejemplo de rama es un slug determinista de la primera ruta de dominio (sin acentos, minúsculas, guiones)", () => {
    const r = describirSoberania({ ...SOBERANIA_POR_DEFECTO, dominio: ["/Jardín Núcleo"] });
    expect(r.ramaEjemplo).toBe("variante/jardin-nucleo");
  });
});

/* ─────────────────────────── Listas de texto ─────────────────────────── */

describe("parseLineList / joinLineList", () => {
  it("son inversas entre sí para una lista limpia", () => {
    const items = ["/dominio/uno", "/dominio/dos"];
    expect(parseLineList(joinLineList(items))).toEqual(items);
  });

  it("descarta líneas vacías y recorta espacios", () => {
    expect(parseLineList("  /a  \n\n/b\n   \n/c")).toEqual(["/a", "/b", "/c"]);
  });

  it("joinLineList tolera null/undefined", () => {
    expect(joinLineList(null)).toBe("");
    expect(joinLineList(undefined)).toBe("");
  });
});

/* ─────────────────────────────── Propuestas ─────────────────────────────── */

function propuesta(over: Partial<Propuesta> = {}): Propuesta {
  return { id: "p1", serId: "s1", titulo: "t", descripcion: "d", rama: "variante/x", cambios: [], estado: "pendiente", creadaEn: 1, ...over };
}

describe("resumirCambiosPropuesta", () => {
  it("suma líneas y cuenta archivos con y sin diff", () => {
    const p = propuesta({
      cambios: [
        { ruta: "/a", diff: "+1\n-0", lineas: 5 },
        { ruta: "/b", lineas: 2 },
        { ruta: "/c", diff: "+2", lineas: null },
      ],
    });
    const r = resumirCambiosPropuesta(p);
    expect(r).toEqual({ archivos: 3, lineasTotales: 7, conDiff: 2 });
  });

  it("sin cambios (o forma inesperada) da ceros, no lanza", () => {
    expect(resumirCambiosPropuesta(propuesta({ cambios: [] }))).toEqual({ archivos: 0, lineasTotales: 0, conDiff: 0 });
    expect(resumirCambiosPropuesta(propuesta({ cambios: undefined as unknown as Propuesta["cambios"] }))).toEqual({ archivos: 0, lineasTotales: 0, conDiff: 0 });
  });
});

describe("propuestasPendientes", () => {
  it("filtra solo 'pendiente', deja fuera aceptadas y descartadas", () => {
    const lista = [propuesta({ id: "1", estado: "pendiente" }), propuesta({ id: "2", estado: "aceptada" }), propuesta({ id: "3", estado: "descartada" }), propuesta({ id: "4", estado: "pendiente" })];
    expect(propuestasPendientes(lista).map((p) => p.id)).toEqual(["1", "4"]);
  });
});

/* ────────────────────────────── Ritual de creación ────────────────────────────── */

describe("validarSolicitudGenesis", () => {
  it("nombre vacío o solo espacios ⇒ inválida", () => {
    expect(validarSolicitudGenesis({ nombre: "" })).toMatch(/obligatorio/);
    expect(validarSolicitudGenesis({ nombre: "   " })).toMatch(/obligatorio/);
  });

  it("nombre razonable y sin color ⇒ válida (null)", () => {
    expect(validarSolicitudGenesis({ nombre: "Aurora" })).toBeNull();
  });

  it("nombre demasiado largo ⇒ inválida", () => {
    expect(validarSolicitudGenesis({ nombre: "a".repeat(81) })).toMatch(/largo/);
  });

  it("color con forma inválida ⇒ inválida; con `#` y 6 hex, o sin `#`, ambas válidas", () => {
    expect(validarSolicitudGenesis({ nombre: "Aurora", color: "azul" })).toMatch(/hexadecimal/);
    expect(validarSolicitudGenesis({ nombre: "Aurora", color: "#7dd3fc" })).toBeNull();
    expect(validarSolicitudGenesis({ nombre: "Aurora", color: "7dd3fc" })).toBeNull();
  });
});

/* ────────────────────────────── Nombres por id ────────────────────────────── */

describe("nombrePorId / nombreEnLinaje", () => {
  const items = [{ id: "c1", nombre: "Jardín Sur" }, { id: "c2", nombre: "Templo Norte" }];

  it("resuelve por id; si no existe, devuelve el propio id (nunca 'undefined')", () => {
    expect(nombrePorId("c1", items)).toBe("Jardín Sur");
    expect(nombrePorId("c9", items)).toBe("c9");
  });

  it("nombreEnLinaje: null/undefined pasa a través como null (no como texto 'null')", () => {
    expect(nombreEnLinaje(null, [])).toBeNull();
    expect(nombreEnLinaje(undefined, [])).toBeNull();
  });

  it("nombreEnLinaje resuelve contra el árbol global", () => {
    const nodos = [{ id: "n1", nombre: "Aurora", progenitorId: null, generacion: 0 }];
    expect(nombreEnLinaje("n1", nodos)).toBe("Aurora");
    expect(nombreEnLinaje("desconocido", nodos)).toBe("desconocido");
  });
});
