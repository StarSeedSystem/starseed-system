import { describe, it, expect } from "vitest";
import { evaluarRecibido, type Recibido } from "../vinculos-escaner";

const emisorBueno = { firmaValida: true, reputacion: 0.9 };
const base = (r: Partial<Recibido>): Recibido => ({ tipo: "enlace", emisor: emisorBueno, ...r });
const codigos = (r: ReturnType<typeof evaluarRecibido>) => r.motivos.map((m) => m.codigo);

describe("evaluarRecibido", () => {
  it("abre un enlace limpio de un emisor firmado", () => {
    const r = evaluarRecibido(base({ url: "https://starseed-os.vercel.app/hub" }));
    expect(r.veredicto).toBe("seguro");
    expect(r.bloquea).toBe(false);
  });

  it("bloquea si la firma del emisor no es válida", () => {
    const r = evaluarRecibido(base({ emisor: { firmaValida: false, reputacion: 0.9 } }));
    expect(r.veredicto).toBe("alerta");
    expect(r.bloquea).toBe(true);
  });

  it("bloquea un dominio parecido al de confianza", () => {
    const r = evaluarRecibido(base({ url: "https://starseed-0s.vercel.app/login" }));
    expect(r.veredicto).toBe("alerta");
    expect(codigos(r)).toContain("dominio_parecido");
  });

  it("bloquea enlaces con usuario@ que ocultan el destino", () => {
    const r = evaluarRecibido(base({ url: "https://starseed-os.vercel.app@evil.example/x" }));
    expect(r.veredicto).toBe("alerta");
  });

  it("bloquea javascript: y pide confirmar con http plano", () => {
    expect(evaluarRecibido(base({ url: "javascript:alert(1)" })).veredicto).toBe("alerta");
    expect(evaluarRecibido(base({ url: "http://ejemplo.org/a" })).veredicto).toBe("aviso");
  });

  it("bloquea un ejecutable disfrazado de imagen", () => {
    const r = evaluarRecibido({ tipo: "archivo", emisor: emisorBueno, nombreArchivo: "foto.jpg.exe" });
    expect(r.veredicto).toBe("alerta");
    expect(codigos(r)).toContain("ejecutable_disfrazado");
  });

  it("avisa de un ejecutable declarado y deja pasar un PDF", () => {
    expect(evaluarRecibido({ tipo: "archivo", emisor: emisorBueno, nombreArchivo: "setup.sh" }).veredicto).toBe("aviso");
    expect(evaluarRecibido({ tipo: "archivo", emisor: emisorBueno, nombreArchivo: "guia.pdf" }).veredicto).toBe("seguro");
  });

  it("detecta permisos excesivos frente a los esperados", () => {
    const r = evaluarRecibido({
      tipo: "app",
      emisor: emisorBueno,
      permisos: ["leer_perfil", "microfono", "camara", "contactos"],
      permisosEsperados: ["leer_perfil"],
    });
    expect(r.veredicto).toBe("aviso");
    expect(codigos(r)).toContain("permisos_excesivos");
  });

  it("bloquea un permiso crítico no esperado", () => {
    const r = evaluarRecibido({ tipo: "permiso", emisor: emisorBueno, permisos: ["borrar_todo"], permisosEsperados: [] });
    expect(r.veredicto).toBe("alerta");
  });

  it("sugiere cuando el emisor no tiene reputación conocida", () => {
    const r = evaluarRecibido(base({ emisor: { firmaValida: true }, url: "https://starseed-os.vercel.app/" }));
    expect(r.veredicto).toBe("sugerencia");
  });

  it("avisa si el texto lleva un secreto", () => {
    const clave = ["gh", "p_", "a".repeat(36)].join("");
    const r = evaluarRecibido({ tipo: "tarjeta", emisor: emisorBueno, texto: `mi clave ${clave}` });
    expect(["aviso", "alerta"]).toContain(r.veredicto);
  });

  it("las decisiones previas bajan un aviso pero nunca una alerta", () => {
    const entrada = { tipo: "archivo" as const, emisor: emisorBueno, nombreArchivo: "setup.sh" };
    const dos = (codigo: string) => [
      { codigo, accion: "permitir" as const },
      { codigo, accion: "permitir" as const },
    ];
    expect(evaluarRecibido(entrada, { decisiones: dos("ejecutable") }).veredicto).toBe("sugerencia");
    const alerta = evaluarRecibido(
      { ...entrada, nombreArchivo: "a.jpg.exe" },
      { decisiones: dos("ejecutable_disfrazado") },
    );
    expect(alerta.veredicto).toBe("alerta");
  });

  it("las decisiones de rechazo suben una sugerencia a aviso", () => {
    const r = evaluarRecibido(base({ emisor: { firmaValida: true }, url: "https://starseed-os.vercel.app/" }), {
      decisiones: [
        { codigo: "emisor_sin_reputacion", accion: "rechazar" },
        { codigo: "emisor_sin_reputacion", accion: "rechazar" },
      ],
    });
    expect(r.veredicto).toBe("aviso");
  });
});
