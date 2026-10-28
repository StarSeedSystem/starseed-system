import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  REPOS_EXTERNOS_1020,
  REPOS_EXTERNOS_1020B,
  REPOS_EXTERNOS_1020C,
  REPOS_EXCLUIDOS,
  REPOS_YA_PRESENTES,
} from "../repos-externos-1020"

type Paquete = {
  id: string
  repo: string
  nombre?: string
  [k: string]: unknown
}

type Config1020c = {
  excluidas?: Array<{ repo: string; motivo?: string }>
  paquetes?: Paquete[]
  duplicadas?: Record<string, string>
}

function leerConfig1020c(): Config1020c {
  const ruta = join(process.cwd(), "config", "repos-libreria-1020c.json")
  const txt = readFileSync(ruta, "utf8")
  return JSON.parse(txt) as Config1020c
}

describe("repos externos 1020c (3ª tanda)", () => {
  const cfg = leerConfig1020c()
  const todos: Paquete[] = [
    ...(REPOS_EXTERNOS_1020 as Paquete[]),
    ...(REPOS_EXTERNOS_1020B as Paquete[]),
    ...(REPOS_EXTERNOS_1020C as Paquete[]),
  ]
  const ids = todos.map((p) => p.id)
  const repos = todos.map((p) => p.repo)

  it("tiene ids únicos en las tres tandas", () => {
    const set = new Set(ids)
    expect(set.size).toBe(ids.length)
  })

  it("añade a REPOS_EXCLUIDOS los excluidas de la 3ª tanda (Kritt-ai/open-kritt)", () => {
    expect(Array.isArray(REPOS_EXCLUIDOS)).toBe(true)
    expect(REPOS_EXCLUIDOS).toContain("Kritt-ai/open-kritt")
  })

  it("no incluye ningún repo excluido", () => {
    for (const r of REPOS_EXCLUIDOS) {
      expect(repos).not.toContain(r)
    }
  })

  it("exporta REPOS_YA_PRESENTES para los duplicados ya presentes", () => {
    expect(Array.isArray(REPOS_YA_PRESENTES)).toBe(true)
    const tienePenpot = REPOS_YA_PRESENTES.some(
      (d) => d.repo === "penpot/penpot"
    )
    expect(tienePenpot).toBe(true)
  })

  it("penpot/penpot no aparece dos veces", () => {
    const cuenta = repos.filter((r) => r === "penpot/penpot").length
    expect(cuenta).toBe(1)
  })

  it("las 13 restantes de la 3ª tanda están", () => {
    const paquetesCfg = (cfg.paquetes || []) as Paquete[]
    const excluidasSet = new Set((cfg.excluidas || []).map((e) => e.repo))
    const yaPresentesSet = new Set((REPOS_YA_PRESENTES as Array<{ repo: string }>).map((d) => d.repo))

    const esperados = paquetesCfg.filter((p) => {
      if (excluidasSet.has(p.repo)) return false
      if (yaPresentesSet.has(p.repo)) return false
      return true
    })

    expect(esperados.length).toBe(13)

    for (const p of esperados) {
      const enTanda3 = (REPOS_EXTERNOS_1020C as Paquete[]).some((x) => x.id === p.id && x.repo === p.repo)
      expect(enTanda3).toBe(true)
    }
  })
})
