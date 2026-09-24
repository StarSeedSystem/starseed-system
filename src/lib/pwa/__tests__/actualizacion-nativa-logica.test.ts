import { describe, it, expect } from "vitest";
import {
  normalizarEstadoActualizacion,
  porcentajeDescarga,
  textoEstadoActualizacion,
  debeMostrarToast,
  elegirApkAndroid,
  hayNuevaVersionAndroid,
  esAndroidTauri,
  cacheReleaseValida,
  type GithubReleaseMin,
} from "../actualizacion-nativa-logica";

describe("normalizarEstadoActualizacion", () => {
  it("acepta un payload válido y completa los campos ausentes con null", () => {
    const r = normalizarEstadoActualizacion({ fase: "descargando", version: "0.2.1" });
    expect(r).toEqual({ fase: "descargando", version: "0.2.1", descargado: null, total: null, mensaje: null });
  });

  it("rechaza fases desconocidas o payloads no-objeto, sin lanzar", () => {
    expect(normalizarEstadoActualizacion(null)).toBeNull();
    expect(normalizarEstadoActualizacion(undefined)).toBeNull();
    expect(normalizarEstadoActualizacion("descargando")).toBeNull();
    expect(normalizarEstadoActualizacion({ fase: "quien-sabe" })).toBeNull();
    expect(normalizarEstadoActualizacion({})).toBeNull();
  });

  it("ignora tipos incorrectos en los campos numéricos/texto", () => {
    const r = normalizarEstadoActualizacion({ fase: "lista", descargado: "no-es-numero", total: 100 });
    expect(r).toEqual({ fase: "lista", version: null, descargado: null, total: 100, mensaje: null });
  });
});

describe("porcentajeDescarga", () => {
  it("calcula el porcentaje redondeado y lo acota a [0,100]", () => {
    expect(porcentajeDescarga({ fase: "descargando", descargado: 50, total: 200 })).toBe(25);
    expect(porcentajeDescarga({ fase: "descargando", descargado: 999, total: 100 })).toBe(100);
  });

  it("devuelve null sin datos suficientes (nunca divide por cero)", () => {
    expect(porcentajeDescarga({ fase: "buscando" })).toBeNull();
    expect(porcentajeDescarga({ fase: "descargando", descargado: 10, total: 0 })).toBeNull();
    expect(porcentajeDescarga({ fase: "descargando", descargado: 10, total: null })).toBeNull();
  });
});

describe("textoEstadoActualizacion / debeMostrarToast", () => {
  it("compone el texto por fase", () => {
    expect(textoEstadoActualizacion({ fase: "buscando" })).toBe("Buscando actualizaciones…");
    expect(textoEstadoActualizacion({ fase: "descargando", version: "0.2.1", descargado: 45, total: 100 })).toBe(
      "Descargando StarSeed OS 0.2.1… 45%",
    );
    expect(textoEstadoActualizacion({ fase: "instalando", version: "0.2.1" })).toBe("Instalando StarSeed OS 0.2.1…");
    expect(textoEstadoActualizacion({ fase: "lista", version: "0.2.1" })).toBe(
      "Lista: reinicia para aplicar la actualización 0.2.1.",
    );
    expect(textoEstadoActualizacion({ fase: "error", mensaje: "sin red" })).toBe("sin red");
    expect(textoEstadoActualizacion({ fase: "error", mensaje: null })).toBe("No se pudo comprobar actualizaciones.");
    expect(textoEstadoActualizacion({ fase: "al-dia" })).toBe("");
    expect(textoEstadoActualizacion({ fase: "" })).toBe("");
  });

  it("solo pide mostrar toast fuera de al-dia/vacío", () => {
    expect(debeMostrarToast({ fase: "buscando" })).toBe(true);
    expect(debeMostrarToast({ fase: "lista" })).toBe(true);
    expect(debeMostrarToast({ fase: "al-dia" })).toBe(false);
    expect(debeMostrarToast({ fase: "" })).toBe(false);
  });
});

const releaseConApk = (version: string): GithubReleaseMin => ({
  tag_name: `v${version}`,
  assets: [
    { name: `StarSeed-os-${version}.apk`, browser_download_url: `https://example.com/StarSeed-os-${version}.apk` },
    { name: `StarSeed.OS_${version}_universal.dmg`, browser_download_url: "https://example.com/mac.dmg" },
  ],
});

describe("elegirApkAndroid", () => {
  it("elige el asset StarSeed-os-*.apk e ignora los demás", () => {
    const r = elegirApkAndroid(releaseConApk("0.2.0"));
    expect(r).toEqual({ version: "0.2.0", href: "https://example.com/StarSeed-os-0.2.0.apk", nombre: "StarSeed-os-0.2.0.apk" });
  });

  it("devuelve null si no hay .apk, si el release es null, o si falta tag_name", () => {
    expect(elegirApkAndroid(null)).toBeNull();
    expect(elegirApkAndroid({ tag_name: "v1.0.0", assets: [] })).toBeNull();
    expect(elegirApkAndroid({ tag_name: "", assets: releaseConApk("0.2.0").assets })).toBeNull();
    expect(elegirApkAndroid({ tag_name: "v1.0.0", assets: [{ name: "otra-cosa.zip", browser_download_url: "x" }] })).toBeNull();
  });
});

describe("hayNuevaVersionAndroid", () => {
  it("true solo cuando el release trae una versión estrictamente mayor", () => {
    expect(hayNuevaVersionAndroid("0.2.0", releaseConApk("0.2.1"))).toBe(true);
    expect(hayNuevaVersionAndroid("0.2.1", releaseConApk("0.2.1"))).toBe(false);
    expect(hayNuevaVersionAndroid("0.2.2", releaseConApk("0.2.1"))).toBe(false);
  });

  it("false honesto sin versión instalada o sin apk en el release", () => {
    expect(hayNuevaVersionAndroid(null, releaseConApk("0.2.1"))).toBe(false);
    expect(hayNuevaVersionAndroid("", releaseConApk("0.2.1"))).toBe(false);
    expect(hayNuevaVersionAndroid("0.2.0", { tag_name: "v0.2.1", assets: [] })).toBe(false);
    expect(hayNuevaVersionAndroid("0.2.0", null)).toBe(false);
  });
});

describe("esAndroidTauri", () => {
  it("solo true con Tauri presente Y user-agent Android", () => {
    expect(esAndroidTauri("Mozilla/5.0 (Linux; Android 14) ...", true)).toBe(true);
    expect(esAndroidTauri("Mozilla/5.0 (Linux; Android 14) ...", false)).toBe(false);
    expect(esAndroidTauri("Mozilla/5.0 (Macintosh)", true)).toBe(false);
    expect(esAndroidTauri("", true)).toBe(false);
  });
});

describe("cacheReleaseValida", () => {
  const AHORA = 1_000_000_000;
  const SEIS_HORAS = 6 * 60 * 60 * 1000;

  it("válida dentro del TTL, inválida fuera", () => {
    expect(cacheReleaseValida({ guardadoEn: AHORA - 1000, release: null }, AHORA)).toBe(true);
    expect(cacheReleaseValida({ guardadoEn: AHORA - SEIS_HORAS, release: null }, AHORA)).toBe(false);
    expect(cacheReleaseValida({ guardadoEn: AHORA - SEIS_HORAS + 1, release: null }, AHORA)).toBe(true);
  });

  it("inválida sin caché o con reloj hacia atrás (guardadoEn en el futuro)", () => {
    expect(cacheReleaseValida(null, AHORA)).toBe(false);
    expect(cacheReleaseValida(undefined, AHORA)).toBe(false);
    expect(cacheReleaseValida({ guardadoEn: AHORA + 1000, release: null }, AHORA)).toBe(false);
  });
});
