import { describe, it, expect } from "vitest"
import { MOTORES, REPARTO, motoresPara, validarReparto } from "../agentes/reparto-motores"

describe("reparto-motores", () => {
  it("validarReparto() es []", () => {
    expect(validarReparto()).toEqual([])
  })

  it("escritor-codigo en neurona-a1 por defecto → principal opencode, alternos [codex]; con admitir [activo,candidato] incluye kilo, deepcode, openhands", () => {
    const res = motoresPara("escritor-codigo", "neurona-a1")
    expect(res.principal).toBe("opencode")
    expect(res.alternos).toEqual(["codex"])
    const res2 = motoresPara("escritor-codigo", "neurona-a1", { admitir: ["activo", "candidato"] })
    expect(res2.principal).toBe("opencode")
    expect(res2.alternos).toEqual(["codex", "kilo", "deepcode", "openhands"])
  })

  it("supervision-humana en neurona-a1 → principal nativo y agent-orchestrator descartado por referencia", () => {
    const res = motoresPara("supervision-humana", "neurona-a1")
    expect(res.principal).toBe("nativo")
    const desc = res.descartados.find((d) => d.id === "agent-orchestrator")
    expect(desc?.motivo).toBe("estado referencia: no se usa como motor")
  })

  it("equipo-roles por defecto → principal nativo; con admitir [activo,invitado] en neurona-a1 → principal crewai; en web-publica con invitados admitidos → nativo", () => {
    const res = motoresPara("equipo-roles", "neurona-a1")
    expect(res.principal).toBe("nativo")
    const res2 = motoresPara("equipo-roles", "neurona-a1", { admitir: ["activo", "invitado"] })
    expect(res2.principal).toBe("crewai")
    const res3 = motoresPara("equipo-roles", "web-publica", { admitir: ["activo", "invitado"] })
    expect(res3.principal).toBe("nativo")
  })

  it("agente-nativo-movil en movil-nativo → principal null y koog descartado", () => {
    const res = motoresPara("agente-nativo-movil", "movil-nativo")
    expect(res.principal).toBeNull()
    const desc = res.descartados.find((d) => d.id === "koog")
    expect(desc?.motivo).toBe("estado referencia: no se usa como motor")
  })

  it("omo-slim no aparece en NINGUNA lista de REPARTO y ni siquiera admitiendo todo estado acaba como principal de nada", () => {
    const enReparto = Object.values(REPARTO).some((lista) => lista.includes("omo-slim"))
    expect(enReparto).toBe(false)
    const res = motoresPara("escritor-codigo", "neurona-mac", { admitir: ["activo", "candidato", "invitado", "referencia"] })
    expect(res.principal).not.toBe("omo-slim")
    expect(res.alternos.includes("omo-slim")).toBe(false)
  })

  it("nativo no está en la lista de escritor-codigo", () => {
    expect(REPARTO["escritor-codigo"].includes("nativo")).toBe(false)
  })

  it("pedir admitir [referencia] no admite referencias", () => {
    const res = motoresPara("supervision-humana", "neurona-mac", { admitir: ["referencia"] })
    expect(res.principal).toBeNull()
    const desc = res.descartados.find((d) => d.id === "agent-orchestrator")
    expect(desc?.motivo).toBe("estado referencia: no se usa como motor")
  })
})
