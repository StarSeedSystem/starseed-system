/**
 * (ACT1108B) Ajustes › «Versión y actualizaciones»: acción principal por estado, filas y estado en vivo
 * compartido con la ventana, Esta neurona y el botón de la Librería.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { accionPrincipal, ANCLA_VERSION, filasVersion, RUTA_VERSION } from "../seccion-version";
import {
  EVENTO_ACTUALIZAR_VERSION,
  leerEstadoVivo,
  ocupado,
  pedirActualizar,
  publicarEstadoVivo,
  reiniciarEstadoVivo,
  suscribirEstadoVivo,
} from "@/lib/actualizaciones/estado-vivo";
import type { Instalada } from "@/lib/actualizaciones/version-por-medio";

afterEach(() => reiniciarEstadoVivo());

const instPruebas = { medio: "escritorio", version: "0.5.1-prueba.22", fuente: "info_neurona", info: { plataforma: "macos", so_version: "15.1", arquitectura: "aarch64", equipo: "Mac de Alex", modelo: null } } as unknown as Instalada;

describe("sección de primer nivel", () => {
  it("tiene ancla y ruta propias (también para el buscador de Ajustes)", () => {
    expect(ANCLA_VERSION).toBe("version-actualizaciones");
    expect(RUTA_VERSION).toContain("#version-actualizaciones");
  });
  it("enseña versión, canal de pruebas y aparato", () => {
    const f = Object.fromEntries(filasVersion(instPruebas).map((x) => [x.etiqueta, x.valor]));
    expect(f["Versión instalada"]).toBe("0.5.1-prueba.22");
    expect(f.Canal).toContain("Canal de pruebas");
    expect(f.Aparato).toContain("macOS 15.1");
  });
  it("una app oficial dice «Oficial»", () => {
    const f = Object.fromEntries(filasVersion({ ...instPruebas, version: "0.5.0" }).map((x) => [x.etiqueta, x.valor]));
    expect(f.Canal).toBe("Oficial");
  });
});

describe("acción principal", () => {
  it("cambia con el estado y el medio", () => {
    expect(accionPrincipal({ fase: "inactivo", error: null }, "escritorio").texto).toBe("Buscar ahora");
    expect(accionPrincipal({ fase: "error", error: null }, "escritorio")).toEqual({ texto: "Reintentar", tipo: "buscar" });
    expect(accionPrincipal({ fase: "lista", error: null }, "escritorio")).toEqual({ texto: "Instalar y reiniciar", tipo: "actualizar" });
    expect(accionPrincipal({ fase: "instalador", error: null }, "android")).toEqual({ texto: "Instalar", tipo: "actualizar" });
    expect(accionPrincipal({ fase: "disponible", error: null }, "android").texto).toBe("Descargar e instalar");
  });
});

describe("estado en vivo compartido", () => {
  it("avisa a quien escucha y limpia el error al cambiar de fase", () => {
    const oyente = vi.fn();
    const baja = suscribirEstadoVivo(oyente);
    publicarEstadoVivo({ fase: "error", mensaje: "GitHub no respondió (504).", error: { codigo: "github", http: 504, texto: "x", reintentable: true, esperarRed: false } });
    expect(leerEstadoVivo().error?.http).toBe(504);
    publicarEstadoVivo({ fase: "buscando", mensaje: "Buscando…" });
    expect(leerEstadoVivo().error).toBeNull();
    expect(ocupado(leerEstadoVivo())).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(2);
    baja();
    publicarEstadoVivo({ fase: "al-dia", mensaje: "ok" });
    expect(oyente).toHaveBeenCalledTimes(2);
  });
  it("el botón de la Librería ya lanza un evento que la ventana escucha", () => {
    const alActualizar = vi.fn();
    window.addEventListener(EVENTO_ACTUALIZAR_VERSION, alActualizar);
    pedirActualizar({ version: "0.5.1-prueba.23" });
    expect(alActualizar).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_ACTUALIZAR_VERSION, alActualizar);
  });
});
