/**
 * genesis-dna.test.ts — Pruebas de `derivarAdn()` contra el contrato
 * compartido con el backend.
 *
 * El backend (Python) valida su propia implementación contra el MISMO
 * `genesis-dna.fixtures.json`. Si estos 6 vectores dejan de reproducirse
 * campo por campo, las dos implementaciones han divergido — y lo correcto
 * es corregir el lado que se apartó del fichero, nunca regenerar el
 * fichero para que "cuadre" con un cambio no intencionado en el algoritmo
 * (ver la cabecera de `genesis-dna.ts`).
 *
 * Además de esos 6 vectores, se prueban las propiedades que sostienen el
 * diseño (ver la cabecera del propio `genesis-dna.ts`):
 *   · determinismo — mismo ser ⇒ mismos rasgos, siempre.
 *   · no colisión — dos ids distintos no producen la misma semilla.
 *   · la evolución sube facetas y aura (y deja intacto todo lo que no
 *     depende de ella: la semilla ya fija solido/matiz/paleta/densidad/
 *     simetria desde el primer momento).
 *   · los tres tonos de la paleta quedan separados por el ángulo áureo.
 */
import { describe, expect, it } from "vitest";
import {
  derivarAdn,
  fnv1a32,
  matizDesdeHex,
  GOLDEN_ANGLE_DEG,
  type RasgosAdn,
  type SemillaSer,
} from "@/lib/astraura/genesis-dna";
import fixturesJson from "@/lib/astraura/genesis-dna.fixtures.json";

interface CasoFixture {
  entrada: SemillaSer;
  esperado: RasgosAdn;
}

// El JSON se tipa a través de `unknown` a propósito: es un fichero de datos
// compartido con Python, no algo que deba dictar sus tipos hacia el lado
// TS — el contrato de tipos real es `SemillaSer`/`RasgosAdn`, importados
// arriba desde el propio `genesis-dna.ts`.
const CASOS = (fixturesJson as unknown as { casos: CasoFixture[] }).casos;

/** Extrae el matiz en grados de un string `hsl(H S% L%)`. */
function matizDeHsl(hsl: string): number {
  const m = /hsl\(\s*([\d.]+)/.exec(hsl);
  if (!m) throw new Error(`No se pudo extraer un matiz de "${hsl}"`);
  return Number(m[1]);
}

/** Distancia angular más corta entre dos matices (0..180). */
function distanciaAngular(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("derivarAdn · vectores compartidos con el backend (genesis-dna.fixtures.json)", () => {
  it(`el fichero trae exactamente 6 casos (si crece, súmale pruebas — no lo asumas)`, () => {
    expect(CASOS.length).toBe(6);
  });

  it.each(CASOS.map((caso) => [caso.entrada.id, caso] as const))(
    "%s reproduce el vector esperado campo por campo",
    (_id, caso) => {
      expect(derivarAdn(caso.entrada)).toEqual(caso.esperado);
    },
  );
});

describe("determinismo", () => {
  it("el mismo ser produce siempre exactamente los mismos rasgos", () => {
    const ser: SemillaSer = { id: "det_1", nombre: "Determinista", arquetipo: "hermes", generacion: 2, experiencia: 55 };
    expect(derivarAdn(ser)).toEqual(derivarAdn(ser));
  });

  it("depende del CONTENIDO de la entrada, no de la identidad del objeto", () => {
    const a = derivarAdn({ id: "x", nombre: "Y", experiencia: 12 });
    const b = derivarAdn({ id: "x", nombre: "Y", experiencia: 12 }); // objeto distinto, mismo contenido
    expect(a).toEqual(b);
  });

  it("es estable frente a llamadas repetidas (sin deriva por efectos ocultos/aleatoriedad)", () => {
    const ser: SemillaSer = { id: "repetido", nombre: "Estable" };
    const resultados = Array.from({ length: 10 }, () => derivarAdn(ser));
    for (const r of resultados) expect(r).toEqual(resultados[0]);
  });
});

describe("dos ids distintos no colisionan", () => {
  it("mismo nombre, id distinto ⇒ semilla distinta", () => {
    const a = derivarAdn({ id: "ser_a", nombre: "Mismo Nombre" });
    const b = derivarAdn({ id: "ser_b", nombre: "Mismo Nombre" });
    expect(a.semilla).not.toBe(b.semilla);
  });

  it("mismo id, nombre distinto ⇒ semilla distinta (la clave es \"id|nombre\" completa)", () => {
    const a = derivarAdn({ id: "mismo_id", nombre: "Nombre A" });
    const b = derivarAdn({ id: "mismo_id", nombre: "Nombre B" });
    expect(a.semilla).not.toBe(b.semilla);
  });

  it("500 ids secuenciales producen 500 semillas distintas (sin colisiones)", () => {
    const semillas = new Set<number>();
    for (let i = 0; i < 500; i++) {
      semillas.add(derivarAdn({ id: `ser_${i}`, nombre: `Ser número ${i}` }).semilla);
    }
    expect(semillas.size).toBe(500);
  });
});

describe("la evolución sube facetas y aura", () => {
  it("más experiencia/generación ⇒ evolución, facetas y aura NO menores — y todo lo que depende solo de la semilla queda IGUAL", () => {
    const base = { id: "evo_1", nombre: "Evolutivo" } as const;
    const joven = derivarAdn({ ...base, generacion: 0, experiencia: 0 });
    const adulto = derivarAdn({ ...base, generacion: 3, experiencia: 300 });
    const anciano = derivarAdn({ ...base, generacion: 6, experiencia: 5000 });

    // Sube con la evolución.
    expect(joven.evolucion).toBe(0);
    expect(adulto.evolucion).toBeGreaterThan(joven.evolucion);
    expect(anciano.evolucion).toBeGreaterThan(adulto.evolucion);
    expect(adulto.facetas).toBeGreaterThanOrEqual(joven.facetas);
    expect(anciano.facetas).toBeGreaterThan(joven.facetas);
    expect(adulto.aura).toBeGreaterThan(joven.aura);
    expect(anciano.aura).toBeGreaterThan(adulto.aura);

    // La SEMILLA solo depende de "id|nombre" (nunca de generación/experiencia)
    // — así que todo lo derivado ÚNICAMENTE de la semilla debe ser IDÉNTICO
    // entre el ser recién nacido y el mismo ser, evolucionado.
    expect(anciano.semilla).toBe(joven.semilla);
    expect(anciano.solido).toBe(joven.solido);
    expect(anciano.matiz).toBe(joven.matiz);
    expect(anciano.paleta).toEqual(joven.paleta);
    expect(anciano.densidad).toBe(joven.densidad);
    expect(anciano.simetria).toBe(joven.simetria);
  });

  it("facetas: 1 para un recién nacido, 4 en el techo — nunca fuera de ese rango", () => {
    const recienNacido = derivarAdn({ id: "f1", nombre: "Naciente", generacion: 0, experiencia: 0 });
    const plenamenteEvolucionado = derivarAdn({ id: "f1", nombre: "Naciente", generacion: 999, experiencia: 999_999 });
    expect(recienNacido.facetas).toBe(1);
    expect(plenamenteEvolucionado.facetas).toBe(4);
  });

  it("la evolución nunca supera 1 aunque la experiencia/generación se disparen", () => {
    const { evolucion } = derivarAdn({ id: "sin_techo", nombre: "N", generacion: 10_000, experiencia: 10_000_000 });
    expect(evolucion).toBeLessThanOrEqual(1);
  });

  it("un nieto (generación alta) empieza con ventaja incluso sin experiencia propia", () => {
    const primeraGeneracion = derivarAdn({ id: "lin_1", nombre: "Linaje", generacion: 0, experiencia: 0 });
    const nieto = derivarAdn({ id: "lin_1", nombre: "Linaje", generacion: 5, experiencia: 0 });
    expect(nieto.evolucion).toBeGreaterThan(primeraGeneracion.evolucion);
  });
});

describe("la paleta reparte los tres tonos por el ángulo áureo", () => {
  it.each(CASOS.map((caso) => [caso.entrada.id, caso] as const))(
    "%s: primario→secundario y secundario→acento distan GOLDEN_ANGLE_DEG (~137.51°)",
    (_id, caso) => {
      const adn = derivarAdn(caso.entrada);
      const hP = matizDeHsl(adn.paleta.primario);
      const hS = matizDeHsl(adn.paleta.secundario);
      const hA = matizDeHsl(adn.paleta.acento);
      // Tolerancia de redondeo: cada matiz se redondea (r3) por separado antes
      // de formatearse, así que la distancia real se desvía ligeramente
      // (<0.001° comprobado empíricamente) del ángulo áureo exacto.
      expect(distanciaAngular(hP, hS)).toBeCloseTo(GOLDEN_ANGLE_DEG, 2);
      expect(distanciaAngular(hS, hA)).toBeCloseTo(GOLDEN_ANGLE_DEG, 2);
    },
  );

  it("primario↔acento (dos ángulos áureos de salto) también quedan lejos entre sí, no solo los pares consecutivos", () => {
    // primario→secundario→acento son DOS saltos de GOLDEN_ANGLE_DEG cada uno,
    // así que primario↔acento distan 2×GOLDEN_ANGLE_DEG (~275°) — que por el
    // camino más corto son ~85° (360 - 275), NO otro ángulo áureo. Es la
    // distancia mínima de las tres parejas, y aun así queda lejos de 0.
    const distanciaEsperada = 360 - 2 * GOLDEN_ANGLE_DEG;
    for (const caso of CASOS) {
      const adn = derivarAdn(caso.entrada);
      const hP = matizDeHsl(adn.paleta.primario);
      const hA = matizDeHsl(adn.paleta.acento);
      expect(distanciaAngular(hP, hA)).toBeCloseTo(distanciaEsperada, 2);
    }
  });

  it("los tres tonos nunca colapsan entre sí, para cualquier ser", () => {
    for (let i = 0; i < 100; i++) {
      const adn = derivarAdn({ id: `paleta_${i}`, nombre: `Paleta ${i}` });
      const hP = matizDeHsl(adn.paleta.primario);
      const hS = matizDeHsl(adn.paleta.secundario);
      const hA = matizDeHsl(adn.paleta.acento);
      // Cota segura y uniforme para las tres parejas: la más próxima de las
      // tres es primario↔acento, a ~85° (ver la prueba de arriba) — muy lejos
      // de un colapso (0°) para cualquier ser, cualquiera que sea su matiz.
      expect(distanciaAngular(hP, hS)).toBeGreaterThan(45);
      expect(distanciaAngular(hS, hA)).toBeGreaterThan(45);
      expect(distanciaAngular(hP, hA)).toBeGreaterThan(45);
    }
  });

  it("un color de personalidad declarado (#rrggbb) fija el matiz primario", () => {
    const adn = derivarAdn({ id: "color_1", nombre: "Con color", colorPersonalidad: "#00f0ff" });
    // `adn.matiz` está redondeado a 3 decimales (r3); `matizDesdeHex` no —
    // se compara con tolerancia en vez de con el redondeo exacto interno.
    expect(adn.matiz).toBeCloseTo(matizDesdeHex("#00f0ff")!, 2);
  });
});

describe("utilidades exportadas que sostienen el algoritmo", () => {
  it("fnv1a32 es determinista y no es la función identidad", () => {
    expect(fnv1a32("aurora")).toBe(fnv1a32("aurora"));
    expect(fnv1a32("aurora")).not.toBe(fnv1a32("hermes"));
  });

  it("matizDesdeHex acepta con o sin '#' y rechaza formatos inválidos", () => {
    expect(matizDesdeHex("#ff0000")).toBeCloseTo(0, 5);
    expect(matizDesdeHex("ff0000")).toBeCloseTo(0, 5);
    expect(matizDesdeHex("#00ff00")).toBeCloseTo(120, 5);
    expect(matizDesdeHex("no-es-un-color")).toBeNull();
    expect(matizDesdeHex("#zzzzzz")).toBeNull();
  });
});
