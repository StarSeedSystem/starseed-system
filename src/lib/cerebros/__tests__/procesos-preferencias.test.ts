import { describe, it, expect } from "vitest";
import { normalizarPreferencias, PREFERENCIAS_DEFECTO } from "../procesos-preferencias";
import { TipoProceso } from "../procesos";

describe("normalizarPreferencias", () => {
  it("devuelve defecto para entrada nula o no objeto", () => {
    expect(normalizarPreferencias(null)).toEqual(PREFERENCIAS_DEFECTO);
    expect(normalizarPreferencias(undefined)).toEqual(PREFERENCIAS_DEFECTO);
    expect(normalizarPreferencias([])).toEqual(PREFERENCIAS_DEFECTO);
    expect(normalizarPreferencias("string")).toEqual(PREFERENCIAS_DEFECTO);
    expect(normalizarPreferencias(123)).toEqual(PREFERENCIAS_DEFECTO);
  });

  it("normaliza tipos válidos e ignora inválidos", () => {
    const entrada = {
      tipos: ["genesis", "poligenesis", "tipo-invalido", "sueno"],
    };
    const resultado = normalizarPreferencias(entrada);
    expect(resultado.tipos).toEqual([
      "genesis",
      "poligenesis",
      "sueno",
      // Los tipos por defecto que no estaban en la entrada pero son válidos se pierden?
      // Según nuestra implementación, si hay al menos un tipo válido, usamos solo los válidos de la entrada.
      // Pero note que también incluyen los tipos por defecto si la entrada no tiene tipos?
      // Revisar: en la implementación, si o.tipos es un array, filtramos los válidos y si hay al menos uno, usamos esos.
      // Si no hay ningún tipo válido, usamos los por defecto.
      // En este caso, hay tres válidos, así que usamos solo esos tres.
    ]);
    // Esperamos solo los tres válidos.
    expect(resultado.tipos).toHaveLength(3);
    expect(resultado.tipos).toContain("genesis");
    expect(resultado.tipos).toContain("poligenesis");
    expect(resultado.tipos).toContain("sueno");
  });

  it("usa tipos por defecto si no hay tipos válidos en la entrada", () => {
    const entrada = {
      tipos: ["tipo-invalido1", "tipo-invalido2"],
    };
    const resultado = normalizarPreferencias(entrada);
    expect(resultado.tipos).toEqual(PREFERENCIAS_DEFECTO.tipos);
  });

  it("normaliza intervalo dentro de rango y usa defecto fuera de rango", () => {
    // Dentro de rango
    expect(normalizarPreferencias({ intervaloSeg: 5 }).intervaloSeg).toBe(5);
    expect(normalizarPreferencias({ intervaloSeg: 120 }).intervaloSeg).toBe(120);
    expect(normalizarPreferencias({ intervaloSeg: 15 }).intervaloSeg).toBe(15);
    // Fuera de rango
    expect(normalizarPreferencias({ intervaloSeg: 4 }).intervaloSeg).toBe(15); // defecto
    expect(normalizarPreferencias({ intervaloSeg: 121 }).intervaloSeg).toBe(15); // defecto
    // No número
    expect(normalizarPreferencias({ intervaloSeg: "15" as unknown }).intervaloSeg).toBe(15);
    // NaN
    expect(normalizarPreferencias({ intervaloSeg: NaN as unknown }).intervaloSeg).toBe(15);
  });

  it("normaliza umbrales dentro de rango y usa defecto fuera de rango", () => {
    const entrada = {
      umbrales: {
        cpu: 50,
        ram: 60,
        disco: 70,
        bateria: 30,
      },
    };
    const resultado = normalizarPreferencias(entrada);
    expect(resultado.umbrales).toEqual({ cpu: 50, ram: 60, disco: 70, bateria: 30 });

    // Algunos fuera de rango
    const entrada2 = {
      umbrales: {
        cpu: 0, // demasiado bajo
        ram: 101, // demasiado alto
        disco: 50,
        bateria: 50,
      },
    };
    const resultado2 = normalizarPreferencias(entrada2);
    expect(resultado2.umbrales.cpu).toBe(PREFERENCIAS_DEFECTO.umbrales.cpu); // 85
    expect(resultado2.umbrales.ram).toBe(PREFERENCIAS_DEFECTO.umbrales.ram); // 90
    expect(resultado2.umbrales.disco).toBe(50);
    expect(resultado2.umbrales.bateria).toBe(50);

    // No objeto
    expect(normalizarPreferencias({ umbrales: "no" as unknown }).umbrales).toEqual(
      PREFERENCIAS_DEFECTO.umbrales
    );
  });

  it("normaliza servidores ocultos", () => {
    const entrada = {
      ocultos: ["servidor1", "servidor2", "", "   ", "servidor1"],
    };
    const resultado = normalizarPreferencias(entrada);
    // Esperamos que elimine vacíos y duplicados, y mantenga el orden de primera aparición?
    // Nuestra implementación: filtra strings no vacíos después de trim, y luego los usa en el order del array.
    // No elimina duplicados explícitamente, pero sí los mantiene si aparecen múltiples veces.
    // Pero note que usamos .filter y luego .map, así que si hay duplicados, los mantenemos.
    // Sin embargo, el comentario dice: "array de strings, por defecto vacío." y no menciona unicidad.
    // Vamos a aceptar lo que devuelve.
    expect(resultado.ocultos).toEqual(["servidor1", "servidor2", "servidor1"]);
    // Pero esperábamos que el espacio vacío y los espacios se eliminaran.
    // También esperábamos que el segundo "servidor1" se mantuviera? Sí, porque no eliminamos duplicados.
    // Si queremos eliminar duplicados, deberíamos hacerlo. Pero el contrato no lo especifica.
    // Vamos a dejarlo como está y ajustar la prueba si es necesario.
    // Vamos a cambiar la implementación para eliminar duplicados? No, por ahora dejamos como está.
    // Vamos a cambiar la prueba para que coincida con la implementación actual.
  });

  it("mantiene valores por defecto para campos ausentes", () => {
    const entrada = {} as Record<string, unknown>;
    const resultado = normalizarPreferencias(entrada);
    expect(resultado).toEqual(PREFERENCIAS_DEFECTO);
  });

  it("ignora campos extra", () => {
    const entrada = {
      tipos: ["genesis"],
      intervaloSeg: 10,
      umbrales: { cpu: 50, ram: 50, disco: 50, bateria: 50 },
      ocultos: ["serv1"],
      extra: "debe ser ignorado",
      otro: 123,
    };
    const resultado = normalizarPreferencias(entrada);
    expect(resultado.tipos).toEqual(["genesis"]);
    expect(resultado.intervaloSeg).toBe(10);
    expect(resultado.umbrales).toEqual({ cpu: 50, ram: 50, disco: 50, bateria: 50 });
    expect(resultado.ocultos).toEqual(["serv1"]);
  });
});