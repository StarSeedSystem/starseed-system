import { describe, it, expect } from "vitest";
import {
  interpretarRespuestaProxy,
  interpretarSalud,
} from "../clients/agent-reach";

describe("clients/agent-reach · respuesta del proxy (puro)", () => {
  it("éxito del CLI: ok true con content e items", () => {
    const r = interpretarRespuestaProxy(200, {
      ok: true,
      content: "# Página",
      items: [{ title: "Página", url: "https://ejemplo.com", text: "…" }],
    });
    expect(r.ok).toBe(true);
    expect((r.data as { content: string }).content).toBe("# Página");
    expect((r.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it("fallo del CLI (HTTP 200, ok false): code y hint pasan TAL CUAL", () => {
    const r = interpretarRespuestaProxy(200, {
      ok: false,
      error: "El origen tardó demasiado.",
      codigo: "TIMEOUT",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("El origen tardó demasiado.");
    expect((r.data as { code?: string }).code).toBe("TIMEOUT");
  });

  it("403 NEED_LOGIN_BLOQUEADO (R1): fallo normal, sin lanzar; el motivo llega tal cual", () => {
    const r = interpretarRespuestaProxy(403, {
      ok: false,
      error: "Canal con sesión apagado (R1): solo canales públicos sin iniciar sesión.",
      motivo: "NEED_LOGIN_BLOQUEADO",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("R1");
    expect((r.data as { motivo?: string }).motivo).toBe("NEED_LOGIN_BLOQUEADO");
  });

  it("falta el binario: el hint de instalación llega tal cual", () => {
    const r = interpretarRespuestaProxy(200, {
      ok: false,
      error: "agent-reach no está instalado en esta neurona.",
      hint: "Instala Agent-Reach con: uv tool install …",
    });
    expect(r.ok).toBe(false);
    expect((r.data as { hint?: string }).hint).toContain("uv tool install");
  });

  it("cuerpo no JSON: degrada con HTTP y nunca lanza", () => {
    const r = interpretarRespuestaProxy(502, null);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("502");
    const r2 = interpretarRespuestaProxy(502, [1, 2, 3]);
    expect(r2.ok).toBe(false);
  });
});

describe("clients/agent-reach · salud del proxy (puro)", () => {
  it("CLI presente: ok true con service y version", () => {
    const r = interpretarSalud({
      ok: true,
      service: "starseed-agent-reach-proxy",
      version: "1.6.0",
    });
    expect(r.ok).toBe(true);
    expect((r.data as { version: string }).version).toBe("1.6.0");
  });

  it("CLI ausente o sin JSON: ok false, sin lanzar", () => {
    expect(interpretarSalud(null).ok).toBe(false);
    expect(interpretarSalud({ ok: false, version: null }).ok).toBe(false);
  });
});
