/**
 * src/lib/salas/__tests__/coop-qa.test.ts
 *
 * Ejemplo de uso de la skill coop-qa (adaptada de coop-anything, MIT):
 * comprueba que la sincronización cooperativa de salas converge sin que nadie
 * tenga que jugar. Método: instalaciones aisladas (estado fresco por test),
 * clientes simulados en memoria, aserciones sobre el estado compartido y
 * comprobación de que cada arreglo tiene su test que falla si se apaga.
 *
 * Adaptado del método a vitest puro sobre sincronia-sala.ts. Sin red, sin disco,
 * sin `vi.mock` de módulos de Node. Ver .agent/skills/coop-qa/README.md.
 */
import { describe, it, expect } from "vitest"
import {
  ElementoSala,
  EstadoSala,
  excedeLimite,
  fusionarEstados,
  prioridadDeElemento,
} from "../sincronia-sala"

const SALA_ID = "sala-coop-qa"

function elemento(
  id: string,
  opts: {
    actualizadoEn?: number
    porDispositivo?: string
    borrado?: boolean
    datos?: Record<string, unknown>
  },
): ElementoSala {
  return {
    id,
    tipo: "widget",
    datos: opts.datos ?? {},
    actualizadoEn: opts.actualizadoEn ?? 1000,
    porDispositivo: opts.porDispositivo ?? "d1",
    borrado: opts.borrado,
  }
}

function estado(dispositivo: string, ids: string[]): EstadoSala {
  const elementos: Record<string, ElementoSala> = {}
  for (const id of ids) elementos[id] = elemento(id, { porDispositivo: dispositivo })
  return { salaId: SALA_ID, elementos, reloj: 1 }
}

/** Fusiona mi estado con cada uno de los demás (launcher: host + N clientes). */
function fusioneConTodos(miEstado: EstadoSala, otros: EstadoSala[], yo: string): EstadoSala {
  let resultado = miEstado
  for (const otro of otros) {
    const fus = fusionarEstados(resultado, otro, yo)
    resultado = fus.resultado
  }
  return resultado
}

describe("coop-qa: sincronía de sala converge sin playtest humano", () => {
  it("QA-01: N clientes editan cada uno su propio elemento y convergen al mismo estado", () => {
    // Asertar modo/precondición primero (regla contra pases huecos): misma sala.
    const d1 = estado("d1", ["a", "b"])
    const d2 = estado("d2", ["c"])
    const d3 = estado("d3", [])
    expect(d1.salaId).toBe(SALA_ID)
    expect(d2.salaId).toBe(SALA_ID)
    expect(d3.salaId).toBe(SALA_ID)

    // Cada cliente añade su elemento localmente (sin red, pura).
    const e1 = {
      ...d1,
      elementos: { ...d1.elementos, x: elemento("x", { porDispositivo: "d1", actualizadoEn: 2000 }) },
    }
    const e2 = {
      ...d2,
      elementos: { ...d2.elementos, y: elemento("y", { porDispositivo: "d2", actualizadoEn: 2000 }) },
    }
    const e3 = { ...d3 }

    const f1 = fusioneConTodos(e1, [e2, e3], "d1")
    const f2 = fusioneConTodos(e2, [e1, e3], "d2")
    const f3 = fusioneConTodos(e3, [e1, e2], "d3")

    // Oráculo: el estado compartido es idéntico en todos los clientes.
    expect(f1.elementos).toEqual(f2.elementos)
    expect(f2.elementos).toEqual(f3.elementos)
    expect(f1.elementos.x?.porDispositivo).toBe("d1")
    expect(f1.elementos.y?.porDispositivo).toBe("d2")
  })

  it("QA-02: mismo elemento tocado por dos dispositivos gana el más reciente, luego el dispositivo menor, luego la lápida", () => {
    const base = estado("d1", ["a"])
    const v1 = elemento("a", { porDispositivo: "d1", actualizadoEn: 1000, datos: { v: 1 } })
    const v2 = elemento("a", { porDispositivo: "d2", actualizadoEn: 1000, datos: { v: 2 } })
    const vMasNuevo = elemento("a", { porDispositivo: "d2", actualizadoEn: 2000, datos: { v: 3 } })
    const vLapida = elemento("a", { porDispositivo: "d1", actualizadoEn: 1000, borrado: true })

    const rTiempo = fusionarEstados(
      { ...base, elementos: { ...base.elementos, a: v1 } },
      { ...base, elementos: { ...base.elementos, a: v2 } },
      "d1",
    )
    expect(rTiempo.resultado.elementos.a?.datos).toEqual({ v: 1 }) // d1 < d2 alfabéticamente

    const rMasNuevo = fusionarEstados(
      { ...base, elementos: { ...base.elementos, a: v1 } },
      { ...base, elementos: { ...base.elementos, a: vMasNuevo } },
      "d1",
    )
    expect(rMasNuevo.resultado.elementos.a?.datos).toEqual({ v: 3 }) // actualizadoEn mayor gana

    const rLapida = fusionarEstados(
      { ...base, elementos: { ...base.elementos, a: vLapida } },
      { ...base, elementos: { ...base.elementos, a: v2 } },
      "d1",
    )
    expect(rLapida.resultado.elementos.a?.borrado).toBe(true) // la lápida gana el empate
  })

  it("QA-03: la fusión es simétrica: fusionar A con B da lo mismo que B con A", () => {
    const a = estado("d1", ["a", "b"])
    const b = estado("d2", ["c"])
    const ra = fusionarEstados(a, b, "d1")
    const rb = fusionarEstados(b, a, "d2")
    expect(ra.resultado.elementos).toEqual(rb.resultado.elementos)
    expect(ra.conflictos).toEqual(rb.conflictos)
  })

  it("QA-04: el eco de mi propio dispositivo se ignora (anti-eco)", () => {
    const mia = estado("d1", ["a"])
    const devuelta = {
      ...mia,
      elementos: { ...mia.elementos, a: elemento("a", { porDispositivo: "d1", actualizadoEn: 9999 }) },
    }
    const r = fusionarEstados(mia, devuelta, "d1")
    expect(r.resultado.elementos.a?.actualizadoEn).toBe(1000) // lo que envié y me volvió se ignora
  })

  it("QA-05: más de 5000 elementos vivos excede el límite y las lápidas no cuentan", () => {
    const vivos: Record<string, ElementoSala> = {}
    for (let i = 0; i < 5001; i++) vivos[`v${i}`] = elemento(`v${i}`, { porDispositivo: "d1" })
    const soloLapidas: Record<string, ElementoSala> = {}
    for (let i = 0; i < 6000; i++) soloLapidas[`l${i}`] = elemento(`l${i}`, { porDispositivo: "d1", borrado: true })

    expect(excedeLimite({ salaId: SALA_ID, elementos: vivos, reloj: 1 })).toBe(true)
    expect(excedeLimite({ salaId: SALA_ID, elementos: soloLapidas, reloj: 1 })).toBe(false)
  })

  it("QA-06: prioridad de elemento clasifica contenido sin perderlo ante la duda", () => {
    expect(prioridadDeElemento({ ...elemento("c", { porDispositivo: "d1" }), tipo: "cursor" })).toBe(0)
    expect(prioridadDeElemento({ ...elemento("c", { porDispositivo: "d1" }), tipo: "texto" })).toBe(1)
    expect(prioridadDeElemento({ ...elemento("c", { porDispositivo: "d1" }), tipo: "posicion" })).toBe(2)
    expect(prioridadDeElemento({ ...elemento("c", { porDispositivo: "d1" }), tipo: "historial" })).toBe(3)
    expect(prioridadDeElemento({ ...elemento("c", { porDispositivo: "d1" }), tipo: "desconocido" })).toBe(1) // nunca se pierde
  })
})
