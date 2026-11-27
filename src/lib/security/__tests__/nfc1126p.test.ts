/**
 * NFC1126P · Astraura ciber multicapa revisa lo recibido por un vínculo.
 * Solo se prueban funciones PURAS de `vinculos-escaner.ts` (entrada → salida,
 * sin red, sin disco, sin procesos). Los casos maliciosos son datos simulados:
 * dominio parecido, ejecutable disfrazado y permisos excesivos.
 */
import { describe, expect, it } from "vitest";
import {
  evaluarVinculo,
  huellaVinculo,
  registrarDecision,
  type VinculoRecibido,
} from "../vinculos-escaner";

const BUENO: VinculoRecibido = {
  tipo: "enlace",
  url: "https://starseed-os.vercel.app/genesis",
  emisor: { id: "neurona-maggasukha", firma: "valida", reputacion: 92, conocido: true },
};

function evaluar(extra: Partial<VinculoRecibido> = {}) {
  return evaluarVinculo({ ...BUENO, ...extra });
}

describe("evaluarVinculo · veredicto seguro", () => {
  it("abre sin confirmar un enlace conocido con firma válida y buena reputación", () => {
    const v = evaluar();
    expect(v.nivel).toBe("seguro");
    expect(v.abre).toBe(true);
    expect(v.requiereConfirmacion).toBe(false);
    expect(v.hallazgos).toEqual([]);
    expect(v.explicacion.length).toBeGreaterThan(0);
  });
});

describe("evaluarVinculo · enlaces maliciosos simulados", () => {
  it("bloquea un dominio parecido al oficial (typosquatting del TLD)", () => {
    const v = evaluar({ url: "https://starseed-os.vercel.ap/genesis" });
    expect(v.nivel).toBe("alerta");
    expect(v.abre).toBe(false);
    expect(v.hallazgos.some((h) => h.nivel === "alerta")).toBe(true);
  });

  it("bloquea un dominio que mete el oficial como prefijo para engañar", () => {
    expect(evaluar({ url: "https://starseed-os.vercel.app.seguro-login.com/" }).nivel).toBe("alerta");
  });

  it("bloquea esquemas que ejecutan código o abren archivos locales", () => {
    expect(evaluar({ url: "javascript:alert(1)" }).nivel).toBe("alerta");
    expect(evaluar({ url: "file:///etc/passwd" }).nivel).toBe("alerta");
  });

  it("bloquea el truco de usuario en la URL que esconde el destino real", () => {
    expect(evaluar({ url: "https://starseed-os.vercel.app@evil.example/x" }).nivel).toBe("alerta");
  });

  it("pide confirmar un enlace sin HTTPS", () => {
    const v = evaluar({ url: "http://starseed-os.vercel.app/genesis" });
    expect(v.nivel).toBe("aviso");
    expect(v.requiereConfirmacion).toBe(true);
  });
});

describe("evaluarVinculo · archivos y ejecutables disfrazados", () => {
  it("bloquea un ejecutable con doble extensión que se hace pasar por imagen", () => {
    const v = evaluar({ tipo: "archivo", archivo: "vacaciones.jpg.exe", mime: "image/jpeg" });
    expect(v.nivel).toBe("alerta");
    expect(v.hallazgos.some((h) => h.tipo === "ejecutable-disfrazado")).toBe(true);
  });

  it("bloquea contenido binario de programa aunque el nombre diga .jpg", () => {
    const v = evaluar({ tipo: "archivo", archivo: "foto.jpg", mime: "image/jpeg", contenido: "MZ\u0090..." });
    expect(v.nivel).toBe("alerta");
    expect(v.hallazgos.some((h) => h.tipo === "contenido-ejecutable")).toBe(true);
  });

  it("solo pide confirmar un ejecutable declarado como tal", () => {
    const v = evaluar({ tipo: "archivo", archivo: "instalador.exe", mime: "application/x-msdownload" });
    expect(v.nivel).toBe("aviso");
    expect(v.abre).toBe(false);
  });

  it("avisa de un documento con macros", () => {
    expect(evaluar({ tipo: "archivo", archivo: "factura.docm" }).nivel).toBe("aviso");
  });

  it("usa el escáner de datos sensibles y solo pide confirmar (no bloquea) por un secreto", () => {
    const v = evaluar({ tipo: "archivo", archivo: "notas.txt", contenido: "clave sk-abcdefghijklmnop1234567890" });
    expect(v.datosSensibles.length).toBeGreaterThan(0);
    expect(v.nivel).toBe("aviso");
  });
});
describe("evaluarVinculo · emisor", () => {
  it("bloquea una firma inválida", () => {
    const v = evaluar({ emisor: { id: "x", firma: "invalida", reputacion: 90 } });
    expect(v.nivel).toBe("alerta");
  });

  it("pide confirmar si el emisor no trae firma", () => {
    const v = evaluar({ emisor: { id: "desconocido", firma: "ausente", reputacion: 90 } });
    expect(v.nivel).toBe("aviso");
  });

  it("bloquea una reputación muy baja", () => {
    expect(evaluar({ emisor: { id: "x", firma: "valida", reputacion: 5 } }).nivel).toBe("alerta");
  });
});

describe("evaluarVinculo · permisos excesivos", () => {
  it("bloquea un permiso que puede tomar el control del aparato", () => {
    const v = evaluar({ tipo: "app", url: undefined, permisos: [{ nombre: "ejecutar comandos", riesgo: "alto" }] });
    expect(v.nivel).toBe("alerta");
  });

  it("bloquea un conjunto excesivo de permisos sensibles", () => {
    const v = evaluar({
      tipo: "app",
      url: undefined,
      permisos: [{ nombre: "contactos" }, { nombre: "ubicación" }, { nombre: "micrófono" }],
    });
    expect(v.nivel).toBe("alerta");
    expect(v.hallazgos.some((h) => h.tipo === "permiso-excesivo")).toBe(true);
  });

  it("avisa de un solo permiso sensible y de permisos en algo que no es una app", () => {
    expect(evaluar({ tipo: "app", url: undefined, permisos: [{ nombre: "cámara" }] }).nivel).toBe("aviso");
    expect(evaluar({ tipo: "tarjeta", url: undefined, permisos: [{ nombre: "notificaciones" }] }).nivel).toBe("aviso");
  });
});

describe("aprendizaje de las decisiones de la persona", () => {
  it("bloquear un vínculo hace que la próxima vez se bloquee solo", () => {
    const v: VinculoRecibido = { ...BUENO };
    const historial = registrarDecision([], huellaVinculo(v), "bloquear");
    expect(evaluarVinculo(v, historial).nivel).toBe("alerta");
  });

  it("confiar rebaja un nivel, pero nunca desbloquea un ejecutable disfrazado", () => {
    const simple: VinculoRecibido = { tipo: "archivo", archivo: "instalador.exe" };
    expect(evaluarVinculo(simple).nivel).toBe("aviso");
    const historial = registrarDecision([], huellaVinculo(simple), "confiar");
    expect(evaluarVinculo(simple, historial).nivel).toBe("sugerencia");

    const malo: VinculoRecibido = { tipo: "archivo", archivo: "vacaciones.jpg.exe" };
    const conConfianza = registrarDecision([], huellaVinculo(malo), "confiar");
    expect(evaluarVinculo(malo, conConfianza).nivel).toBe("alerta");
  });

  it("registrarDecision sustituye la decisión anterior sin mutar el historial", () => {
    const uno = registrarDecision([], "h1", "confiar");
    const dos = registrarDecision(uno, "h1", "bloquear");
    expect(dos).toHaveLength(1);
    expect(dos[0].decision).toBe("bloquear");
    expect(uno[0].decision).toBe("confiar");
  });
});
