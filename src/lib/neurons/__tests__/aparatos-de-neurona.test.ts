/**
 * (NEU1115G) Aparatos por neurona: lista, lápidas, fundido y la lista para elegir.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/aparatos-de-neurona.test.ts
 */
import { describe, expect, it } from "vitest";
import { aparatosDe, entradaViva, fusionarAparatos, lapida, neuronasParaElegir, type AparatoDeNeurona } from "../aparatos-de-neurona";
import { combinarCapacidades } from "../neurons";

const TABLET = "e0b9faf2-aaaa-4000-8000-000000000001";
const MOVIL = "659d5e03-bbbb-4000-8000-000000000002";

describe("aparatos de la neurona", () => {
  it("cada aparato escribe su entrada y se funden por id; la más nueva gana", () => {
    const a = { [TABLET]: entradaViva({ nombre: "Tableta", medio: "android" }, 100) };
    const b = { [MOVIL]: entradaViva({ nombre: "Móvil" }, 200) };
    const f = fusionarAparatos(a, b);
    expect(aparatosDe({ aparatos: f }).map((x) => x.nombre).sort()).toEqual(["Móvil", "Tableta"]);
  });

  it("una lápida saca al aparato de la neurona y un fundido viejo no lo resucita", () => {
    const viva = entradaViva({ nombre: "Móvil" }, 100);
    const caps = { aparatos: fusionarAparatos({ [MOVIL]: viva }, { [MOVIL]: lapida(viva, 300) }) };
    expect(aparatosDe(caps)).toEqual([]);
    const otraVez = fusionarAparatos(caps.aparatos, { [MOVIL]: viva });
    expect(aparatosDe({ aparatos: otraVez })).toEqual([]);
    expect(aparatosDe({ aparatos: fusionarAparatos(otraVez, { [MOVIL]: entradaViva({ nombre: "Móvil" }, 400) }) })).toHaveLength(1);
  });

  it("combinarCapacidades no pierde los aparatos de los demás al subir la propia ficha", () => {
    const remotas = { platform: "Android", aparatos: { [TABLET]: entradaViva({ nombre: "Tableta" }, 100) } };
    const locales = { platform: "Android", aparatos: { [MOVIL]: entradaViva({ nombre: "Móvil" }, 200) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = combinarCapacidades(remotas, locales as any, 1000) as any;
    expect(aparatosDe(r).map((x) => x.nombre).sort()).toEqual(["Móvil", "Tableta"]);
  });

  it("la lista para elegir enseña cada neurona con su nombre y sus aparatos; una antigua enseña su aparato heredado; las absorbidas no salen", () => {
    const filas = [
      { id: TABLET, name: "Maggaboard", capabilities: { aparato: { v: 1, equipo: "Samsung SM-X205", medio: "android" } } },
      { id: MOVIL, name: "Maggadroid", capabilities: { aparatos: { [MOVIL]: entradaViva({ nombre: "Móvil de Alex" }, 5) } } },
      { id: "viejo-0001", name: "Vieja", capabilities: { fusionada: { en: TABLET, ts: 1 } } },
    ];
    const l = neuronasParaElegir(filas, MOVIL);
    expect(l.map((n) => n.id)).toEqual([MOVIL, TABLET]);
    expect(l[0].esActual).toBe(true);
    expect(l[1].aparatos.map((a) => a.nombre)).toEqual(["Samsung SM-X205"]);
    expect(l.every((n) => !n.variosAparatos)).toBe(true);
  });

  it(" CTL1126E · AparatoDeNeurona.id es la huella correcta para identificar el aparato", () => {
    const tabla = { id: TABLET, nombre: "Tableta", medio: "android", so: "Android", equipo: "Samsung", visto: 1000000 };
    const movil = { id: MOVIL, nombre: "Móvil", medio: "android", so: "Android", visto: 2000000 };
    const caps = { aparatos: { [TABLET]: entradaViva({ nombre: tabla.nombre, medio: tabla.medio, so: tabla.so, equipo: tabla.equipo }, tabla.visto), [MOVIL]: entradaViva({ nombre: movil.nombre, medio: movil.medio, so: movil.so }, movil.visto) } };
    const aparatos = aparatosDe(caps);
    expect(aparatos).toHaveLength(2);
    // Los aparatos se ordenan por visto (más reciente primero)
    expect(aparatos[0].id).toBe(MOVIL);
    expect(aparatos[0].nombre).toBe("Móvil");
    expect(aparatos[1].id).toBe(TABLET);
    expect(aparatos[1].nombre).toBe("Tableta");
    expect(aparatos[0].so).toBe("Android");
    expect(aparatos[0].equipo).toBeUndefined();
    expect(aparatos[1].so).toBe("Android");
    expect(aparatos[1].equipo).toBe("Samsung");
  });
});
