/**
 * TESTS DE almacen-encargos · ProtoGenesis PG1013G
 * Cubren el almacenamiento local de encargos.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  almacenNavegador,
  AlmacenLocal,
  guardarEncargo,
  cargarEncargos,
  borrarEncargo,
  RegistroEncargo,
  EstadoPaso,
  PREFIJO_ENCARGO,
  CLAVE_INDICE,
} from "../almacen-encargos";
import { Encargo, Plan } from "../encargo";
import type { Ambito } from "@/lib/protomolecula/tipos";

/** Implementación en memoria de AlmacenLocal para pruebas. */
class AlmacenEnMemoria implements AlmacenLocal {
  private almacen: Map<string, string> = new Map();
  getItem(k: string): string | null {
    return this.almacen.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.almacen.set(k, v);
  }
  removeItem(k: string): void {
    this.almacen.delete(k);
  }
}

/** Crea un encargo de prueba válido. */
function crearEncargoDePrueba(id: string, moleculaId: string): Encargo {
  return {
    id,
    moleculaId,
    ambito: "personal" as Ambito,
    intencion: "crear una molécula de prueba",
    criterios: [{ tipo: "formato", texto: "formato de salida" }],
    autor: { tipo: "persona", id: "U001" },
    origen: "texto",
    creadoEn: Date.now(),
  };
}

/** Crea un plan de prueba válido. */
function crearPlanDePrueba(encargoId: string): Plan {
  return {
    encargoId,
    pasos: [
      {
        id: "P1",
        atomo: "herramienta1",
        titulo: "Paso 1",
        entradas: [],
        salida: { formato: "json" },
        depende: [],
        criterios: [{ tipo: "formato", texto: "json" }],
      },
    ],
  };
}

/** Crea un registro de encargo de prueba válido. */
function crearRegistroDePrueba(
  encargoId: string,
  moleculaId: string,
  actualizadoEn: number = Date.now()
): RegistroEncargo {
  return {
    encargo: crearEncargoDePrueba(encargoId, moleculaId),
    plan: crearPlanDePrueba(encargoId),
    estados: { P1: "pendiente" },
    asignaciones: [{ paso: "P1", agente: "agente001" }],
    actualizadoEn,
  };
}

describe("almacenNavegador", () => {
  let originalLocalStorage: Storage | undefined;
  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    // @ts-ignore
    globalThis.localStorage = {
      getItem: (k: string) => null,
      setItem: (k: string, v: string) => {},
      removeItem: (k: string) => {},
    } as Storage;
  });
  afterEach(() => {
    // @ts-ignore
    globalThis.localStorage = originalLocalStorage;
  });

  it("devuelve el localStorage si está disponible", () => {
    const almacen = almacenNavegador();
    expect(almacen).not.toBeNull();
    expect(typeof almacen?.getItem).toBe("function");
  });
});

describe("guardarEncargo", () => {
  it("guarda un registro válido y lo hace recuperable", () => {
    const almacen = new AlmacenEnMemoria();
    const registro = crearRegistroDePrueba("E001", "M001");

    const resultado = guardarEncargo(almacen, registro);
    expect(resultado).toBe(true);

    // Verificar que se guardó en el almacenamiento
    const clave = PREFIJO_ENCARGO + registro.encargo.id;
    const crudo = almacen.getItem(clave);
    expect(crudo).not.toBeNull();
    const parsed = JSON.parse(crudo!);
    expect(parsed.encargo.id).toBe("E001");
    expect(parsed.plan?.encargoId).toBe("E001");
  });

  it("devuelve false si el registro es inválido", () => {
    const almacen = new AlmacenEnMemoria();
    const registroInvalido = {
      // faltan campos obligatorios
      encargo: { id: "E001", moleculaId: "M001", ambito: "personal", intencion: "test", criterios: [], autor: { tipo: "persona", id: "U001" }, origen: "texto", creadoEn: Date.now() },
      plan: null,
      estados: {},
      asignaciones: [],
      actualizadoEn: Date.now(),
    } as unknown as RegistroEncargo;

    const resultado = guardarEncargo(almacen, registroInvalido);
    expect(resultado).toBe(false);
    // No debería haber guardado nada
    const clave = PREFIJO_ENCARGO + registroInvalido.encargo.id;
    expect(almacen.getItem(clave)).toBeNull();
  });
});

describe("cargarEncargos", () => {
  it("carga los encargos guardados", () => {
    const almacen = new AlmacenEnMemoria();
    const registro1 = crearRegistroDePrueba("E001", "M001", 1000);
    const registro2 = crearRegistroDePrueba("E002", "M002", 2000);

    guardarEncargo(almacen, registro1);
    guardarEncargo(almacen, registro2);

    const encargos = cargarEncargos(almacen);
    expect(encargos).toHaveLength(2);
    // Deben estar ordenados por actualizadoEn descending
    expect(encargos[0].actualizadoEn).toBeGreaterThanOrEqual(encargos[1].actualizadoEn);
  });

  it("filtra por molécula cuando se proporciona moleculaId", () => {
    const almacen = new AlmacenEnMemoria();
    const registro1 = crearRegistroDePrueba("E001", "M001", 1000);
    const registro2 = crearRegistroDePrueba("E002", "M002", 2000);
    const registro3 = crearRegistroDePrueba("E003", "M001", 1500); // misma molécula que E001

    guardarEncargo(almacen, registro1);
    guardarEncargo(almacen, registro2);
    guardarEncargo(almacen, registro3);

    const encargosM001 = cargarEncargos(almacen, "M001");
    expect(encargosM001).toHaveLength(2);
    // Ambos deben ser de la molécula M001
    expect(encargosM001.every((e) => e.encargo.moleculaId === "M001")).toBe(true);
    // Deben estar ordenados por actualizadoEn descending (E003:1500, E001:1000)
    expect(encargosM001[0].encargo.id).toBe("E003");
    expect(encargosM001[1].encargo.id).toBe("E001");
  });

  it("limita a 50 encargos por molécula", () => {
    const almacen = new AlmacenEnMemoria();
    // Crear 55 encargos para la misma molécula
    for (let i = 0; i < 55; i++) {
      const registro = crearRegistroDePrueba(`E${i}`, "M001", 1000 + i);
      guardarEncargo(almacen, registro);
    }

    const encargos = cargarEncargos(almacen, "M001");
    // Debe devolver exactamente 50, los más recientes
    expect(encargos).toHaveLength(50);
    // El más reciente debe ser el E54 (actualizadoEn = 1000+54)
    expect(encargos[0].encargo.id).toBe("E54");
    // El más antiguo en la lista debe ser el E5 (porque 55-50=5, así que nos quedamos con E5..E54)
    // Pero note: ordenamos descending, así que el último en el array es el más antiguo de los 50.
    expect(encargos[49].encargo.id).toBe("E5");
  });

  it("ignora registros corruptos", () => {
    const almacen = new AlmacenEnMemoria();
    const registroValido = crearRegistroDePrueba("E001", "M001");
    guardarEncargo(almacen, registroValido);

    // Guardar un valor corrupto (no JSON válido) bajo la misma clave? No, usamos una clave distinta.
    // En su lugar, guardamos un registro con estructura inválida bajo una clave diferente.
    const registroCorrupto = {
      // faltan muchos campos
      encargo: { id: "E002", moleculaId: "M002" },
      plan: null,
      estados: {},
      asignaciones: [],
      actualizadoEn: Date.now(),
    } as unknown as RegistroEncargo;
    guardarEncargo(almacen, registroCorrupto); // Esto debería devolver false y no guardar

    // Ahora, para simular un registro corrupto en el almacenamiento, vamos a escribir directamente
    // un valor que no es un RegistroEncargo válido.
    const claveCorrupta = PREFIJO_ENCARGO + "E002";
    almacen.setItem(claveCorrupta, "{ no es json ");

    const encargos = cargarEncargos(almacen);
    // Solo debe cargar el registro válido
    expect(encargos).toHaveLength(1);
    expect(encargos[0].encargo.id).toBe("E001");
  });
});

describe("borrarEncargo", () => {
  it("borra un encargo existente y devuelve true", () => {
    const almacen = new AlmacenEnMemoria();
    const registro = crearRegistroDePrueba("E001", "M001");
    guardarEncargo(almacen, registro);

    const resultado = borrarEncargo(almacen, "E001");
    expect(resultado).toBe(true);

    // Verificar que ya no existe
    const clave = PREFIJO_ENCARGO + registro.encargo.id;
    expect(almacen.getItem(clave)).toBeNull();

    // Verificar que el índice ya no contiene el id
    const indice = almacen.getItem(CLAVE_INDICE);
    expect(indice).not.toBeNull();
    const indiceParse = JSON.parse(indice!);
    expect(indiceParse).not.toContain("E001");
  });

  it("devuelve false si el encargo no existe", () => {
    const almacen = new AlmacenEnMemoria();
    const resultado = borrarEncargo(almacen, "E001");
    expect(resultado).toBe(false);
  });
});