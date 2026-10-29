import { describe, it, expect } from "vitest"
import { planFusion, Candidato } from "../fusion-modelos"

describe("planFusion", () => {
  it("regla 1: menos de 2 candidatos devuelve ninguna", () => {
    const candidatos: Candidato[] = [
      { id: "c1", arquitectura: "llama", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ninguna")
    expect(resultado.bloqueos).toContain("Menos de 2 candidatos")
  })

  it("regla 2: ámbitos o dueños distintos devuelve ninguna", () => {
    const candidatos: Candidato[] = [
      { id: "c1", arquitectura: "llama", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "privado", dueno: "alice" },
      { id: "c2", arquitectura: "llama", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "privado", dueno: "bob" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ninguna")
    expect(resultado.bloqueos).toContain("Ámbitos o dueños distintos")
  })

  it("regla 3: 2 adaptadores con el mismo baseId devuelve adaptadores-ponderados linear", () => {
    const candidatos: Candidato[] = [
      { id: "a1", arquitectura: "llama", parametrosB: 7, tipo: "adaptador", empaquetado: "bf16", baseId: "base-llama", ambito: "publico" },
      { id: "a2", arquitectura: "llama", parametrosB: 7, tipo: "adaptador", empaquetado: "bf16", baseId: "base-llama", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("adaptadores-ponderados")
    expect(resultado.herramienta).toBe("peft")
    expect(resultado.metodo).toBe("linear")
  })

  it("regla 3 b: 3 adaptadores con el mismo baseId devuelve adaptadores-ponderados ties", () => {
    const candidatos: Candidato[] = [
      { id: "a1", arquitectura: "llama", parametrosB: 7, tipo: "adaptador", empaquetado: "bf16", baseId: "base-llama", ambito: "publico" },
      { id: "a2", arquitectura: "llama", parametrosB: 7, tipo: "adaptador", empaquetado: "bf16", baseId: "base-llama", ambito: "publico" },
      { id: "a3", arquitectura: "llama", parametrosB: 7, tipo: "adaptador", empaquetado: "bf16", baseId: "base-llama", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("adaptadores-ponderados")
    expect(resultado.metodo).toBe("ties")
  })

  it("regla 4: Needle y otra arquitectura devuelve ensamble-sistema", () => {
    const candidatos: Candidato[] = [
      { id: "n1", arquitectura: "needle-v1", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" },
      { id: "b1", arquitectura: "bitnet", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ensamble-sistema")
    expect(resultado.herramienta).toBe("sistema")
  })

  it("regla 5: Arquitecturas distintas devuelve ensamble-sistema", () => {
    const candidatos: Candidato[] = [
      { id: "q1", arquitectura: "qwen", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" },
      { id: "l1", arquitectura: "llama", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ensamble-sistema")
    expect(resultado.herramienta).toBe("sistema")
  })

  it("regla 7: Dos Qwen bf16 devuelve mergekit slerp", () => {
    const candidatos: Candidato[] = [
      { id: "q1", arquitectura: "qwen", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" },
      { id: "q2", arquitectura: "qwen", parametrosB: 7.02, tipo: "pesos", empaquetado: "bf16", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("mergekit")
    expect(resultado.herramienta).toBe("mergekit")
    expect(resultado.metodo).toBe("slerp")
  })

  it("regla 7 b: Dos ternarios empaquetados devuelve ninguna con pasos bf16", () => {
    const candidatos: Candidato[] = [
      { id: "t1", arquitectura: "qwen", parametrosB: 7, tipo: "pesos", empaquetado: "ternario-empaquetado", ambito: "publico" },
      { id: "t2", arquitectura: "qwen", parametrosB: 7, tipo: "pesos", empaquetado: "ternario-empaquetado", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ninguna")
    expect(resultado.pasos.some((p) => p.includes("unpacked bf16"))).toBe(true)
  })

  it("regla 7 c: Tamaños distintos devuelve ninguna con bloqueo", () => {
    const candidatos: Candidato[] = [
      { id: "q1", arquitectura: "qwen", parametrosB: 7, tipo: "pesos", empaquetado: "bf16", ambito: "publico" },
      { id: "q2", arquitectura: "qwen", parametrosB: 14, tipo: "pesos", empaquetado: "bf16", ambito: "publico" }
    ]
    const resultado = planFusion(candidatos)
    expect(resultado.estrategia).toBe("ninguna")
    expect(resultado.bloqueos).toContain("Tamaño o vocab distintos")
  })
})
