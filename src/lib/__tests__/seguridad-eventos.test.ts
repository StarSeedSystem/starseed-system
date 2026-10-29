// src/lib/__tests__/seguridad-eventos.test.ts
// (INF1025A) Pruebas del evento de seguridad saneado: lista blanca, falla
// cerrado, sin filtraciones (nada con forma de clave, correo ni IP sale del
// evento) y propuestas de respuesta que jamás castigan. Módulo puro: el reloj
// entra por parámetro y las cadenas con forma de clave se construyen aquí, en
// tiempo de ejecución, como exige el escáner del repo.

import { describe, it, expect } from "vitest";

import {
  construirEventoSeguridad,
  desdeSeveridadScanner,
  ORDEN_SEVERIDAD,
  politicaPermite,
  pareceDatoPersonal,
  proponerRespuesta,
  type EventoSeguridad,
  type TipoEventoSeguridad,
} from "@/lib/security/eventos-seguridad";

const AHORA_MS = 1730000000000; // fijo (2026-10-27 de madrugada UTC): invariante de las pruebas
const TIPOS: TipoEventoSeguridad[] = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
];

/** Cadenas SENSIBLES construidas en tiempo de ejecución, nunca literales. */
const CLAVE_SK = "sk-" + "a".repeat(32);
const CLAVE_GHP = "ghp_" + "b".repeat(20);
const CORREO = "vecina" + "@" + "starseed" + "." + "es";
const IP_V4 = "192.168.1.17";
const IP_V6 = "2001:db8:0:0:0:0:0:5";

/** Entrada base con todas las trampas dentro: si algo de esto sale, falla. */
function entradaConTrampas(tipo: TipoEventoSeguridad): Record<string, unknown> {
  return {
    tipo,
    severidad: "alta",
    elemento: "api",
    detalle: {
      familia: "clave_api",
      campo: "cabecera-auth",
      ruta: "/api/red",
      limite: 30,
      ventanaMs: 60000,
      motivo: "ip-privada",
      directiva: "script-src",
      disposicion: "en-forzar",
      huella: "huella-feed",
      invariante: "salida-siempre",
      arreglo: "restaurar-salida",
      patron: "horario-nocturno",
      medio: "navegador",
    },
  };
}

describe("pareceDatoPersonal", () => {
  it("detecta correo, IP, JWT, hex/base64 y prefijos de clave", () => {
    expect(pareceDatoPersonal(CORREO)).toBe(true);
    expect(pareceDatoPersonal(IP_V4)).toBe(true);
    expect(pareceDatoPersonal(IP_V6)).toBe(true);
    expect(pareceDatoPersonal("::1")).toBe(true);
    expect(pareceDatoPersonal("eyJ" + "A".repeat(10) + ".mlg." + "b".repeat(6))).toBe(true);
    expect(pareceDatoPersonal("ab".repeat(12))).toBe(true); // hex de 24
    expect(pareceDatoPersonal(CLAVE_SK)).toBe(true);
    expect(pareceDatoPersonal(CLAVE_GHP)).toBe(true);
    expect(pareceDatoPersonal("AKIA" + "X" + "yZ3" + "9921")).toBe(true);
  });

  it("deja pasar texto de personas normal", () => {
    expect(pareceDatoPersonal("Ledna revisó la ruta de salida")).toBe(false);
    expect(pareceDatoPersonal("")).toBe(false);
    expect(pareceDatoPersonal("12:34")).toBe(false);
    expect(pareceDatoPersonal("revisar la agenda del taller")).toBe(false);
  });
});

describe("construirEventoSeguridad", () => {
  it("aplica la lista blanca del detalle: una clave desconocida no sale", () => {
    const e = construirEventoSeguridad(entradaConTrampas("limite-peticiones"), AHORA_MS);
    expect(e).not.toBeNull();
    const ev = e as EventoSeguridad;
    expect(ev.version).toBe(1);
    expect(ev.cuando).toBe(new Date(AHORA_MS).toISOString());
    expect(ev.contador).toBe(1);
    expect(Object.keys(ev.detalle).sort()).toEqual(["limite", "ruta", "ventanaMs"]);
    expect(ev.detalle.limite).toBe(30);
    expect(ev.detalle.ventanaMs).toBe(60000);
  });

  it("descarta los valores con pinta de dato personal ¿correo, IP, clave?", () => {
    const entrada = {
      tipo: "secreto-detectado",
      severidad: "critica",
      elemento: "red",
      detalle: { familia: CLAVE_SK, campo: CORREO, huella: IP_V4, deMas: CLAVE_GHP },
    };
    const e = construirEventoSeguridad(entrada, AHORA_MS);
    expect(JSON.stringify(e)).not.toContain(CLAVE_SK);
    expect(JSON.stringify(e)).not.toContain(CORREO);
    expect(JSON.stringify(e)).not.toContain(IP_V4);
    expect(JSON.stringify(e)).not.toContain(CLAVE_GHP);
    expect((e as EventoSeguridad).detalle).toEqual({});
  });

  it("la entrada inválida da null y falla cerrado", () => {
    expect(construirEventoSeguridad(null, AHORA_MS)).toBeNull();
    expect(construirEventoSeguridad("onda", AHORA_MS)).toBeNull();
    expect(construirEventoSeguridad(entradaConTrampas("otra-cosa" as TipoEventoSeguridad), AHORA_MS)).toBeNull();
    const mala = entradaConTrampas("limite-peticiones");
    mala.severidad = "grave";
    expect(construirEventoSeguridad(mala, AHORA_MS)).toBeNull();
    const sinElemento = { tipo: "csp-informe", severidad: "media" };
    expect(construirEventoSeguridad(sinElemento, AHORA_MS)).toBeNull();
  });

  it("ahoraMs inválido da null; el contador valedero entra", () => {
    expect(construirEventoSeguridad(entradaConTrampas("csp-informe"), Number.NaN)).toBeNull();
    expect(construirEventoSeguridad(entradaConTrampas("csp-informe"), Number.POSITIVE_INFINITY)).toBeNull();
    const conConteo = { ...entradaConTrampas("acceso-inusual"), contador: 4 };
    expect((construirEventoSeguridad(conConteo, AHORA_MS) as EventoSeguridad).contador).toBe(4);
    const malConteo = { ...entradaConTrampas("acceso-inusual"), contador: 0 };
    expect(construirEventoSeguridad(malConteo, AHORA_MS)).toBeNull();
  });

  it("el id es estable y cambia con el elemento y con el cubo de 60 s ¿determinista?", () => {
    const entrada = entradaConTrampas("limite-peticiones");
    const a = construirEventoSeguridad({ ...entrada, detalle: { ...(entrada.detalle as Record<string, unknown>) } }, AHORA_MS) as EventoSeguridad;
    const b = construirEventoSeguridad(entrada, AHORA_MS) as EventoSeguridad;
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^evs-[0-9a-f]{8}$/);
    const otroElemento = construirEventoSeguridad({ ...entrada, elemento: "red" }, AHORA_MS) as EventoSeguridad;
    expect(otroElemento.id).not.toBe(a.id);
    const otroCubo = construirEventoSeguridad(entrada, AHORA_MS + 61000) as EventoSeguridad;
    expect(otroCubo.id).not.toBe(a.id);
  });

  it("el resumen sale de la plantilla fija, nunca de la entrada", () => {
    const uno = construirEventoSeguridad(entradaConTrampas("limite-peticiones"), AHORA_MS);
    const dos = construirEventoSeguridad(
      { tipo: "limite-peticiones", severidad: "media", elemento: "app", detalle: {} },
      AHORA_MS,
    );
    expect((uno as EventoSeguridad).resumen).toBe((dos as EventoSeguridad).resumen);
    const contaminado = { ...entradaConTrampas("csp-informe"), resumen: CORREO + " escribía esto" };
    expect((construirEventoSeguridad(contaminado, AHORA_MS) as EventoSeguridad).resumen).not.toContain(CORREO);
  });
});

describe("severidad del escáner y política", () => {
  it("desdeSeveridadScanner mapea el vocabulario del escáner", () => {
    expect(desdeSeveridadScanner("critical")).toBe("critica");
    expect(desdeSeveridadScanner("high")).toBe("alta");
    expect(desdeSeveridadScanner("medium")).toBe("media");
    expect(desdeSeveridadScanner("low")).toBe("baja");
    expect(desdeSeveridadScanner("grave")).toBeNull();
  });

  it("ORDEN_SEVERIDAD va de crítica a baja", () => {
    expect([...ORDEN_SEVERIDAD]).toEqual(["critica", "alta", "media", "baja"]);
  });

  it("politicaPermite por severidad mínima y por tipos", () => {
    const ev = construirEventoSeguridad(entradaConTrampas("limite-peticiones"), AHORA_MS) as EventoSeguridad;
    expect(ev.severidad).toBe("alta");
    expect(politicaPermite(ev, { severidadMinima: "alta" })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "baja", tipos: ["limite-peticiones"] })).toBe(true);
    expect(politicaPermite(ev, { severidadMinima: "critica" })).toBe(false);
    expect(politicaPermite(ev, { severidadMinima: "alta", tipos: ["csp-informe"] })).toBe(false);
    expect(politicaPermite(ev, { severidadMinima: "grave" as "alta" })).toBe(false);
  });
});

describe("proponerRespuesta", () => {
  it("exige humana cuando el elemento toca a la gente", () => {
    const evs = ["cuenta", "grupo", "pagina", "red", "app", "api"] as EventoSeguridad["elemento"][];
    for (const elemento of evs) {
      for (const tipo of TIPOS) {
        const ev = construirEventoSeguridad({ tipo, severidad: "media", elemento, detalle: {} }, AHORA_MS) as EventoSeguridad;
        const p = proponerRespuesta(ev);
        const texto = JSON.stringify(p).toLowerCase();
        expect(texto).not.toContain("bloquear");
        expect(texto).not.toContain("suspender");
        if (elemento === "cuenta" || elemento === "grupo" || elemento === "pagina") {
          expect(p.requiereHumano).toBe(true);
          expect(p.motivo).toContain("Círculo de Paz");
        } else {
          expect(p.requiereHumano).toBe(false);
          expect(p.acciones.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("nada del evento sale con forma de clave, correo o IP, para todos los tipos", () => {
    const RE_CLAVE = /(sk-|ghp_|gho_|ghs_|AKIA|eyJ)[A-Za-z0-9_-]{10,}/;
    const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const RE_IP = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
    for (const tipo of TIPOS) {
      const ev = construirEventoSeguridad(entradaConTrampas(tipo), AHORA_MS) as EventoSeguridad;
      const texto = JSON.stringify(ev);
      expect(texto).not.toMatch(RE_CLAVE);
      expect(texto).not.toMatch(RE_CORREO);
      expect(texto).not.toMatch(RE_IP);
      expect(texto).not.toContain(CLAVE_GHP);
      expect(ev.resumen.length).toBeGreaterThan(0);
    }
  });
});
