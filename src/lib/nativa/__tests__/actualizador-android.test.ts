import { describe, it, expect } from "vitest";
import {
  elegirApkAndroid,
  hayNuevaVersionAndroid,
  decidirActualizacionAndroid,
  type GithubReleaseMin,
} from "../actualizador-android";

const releaseConApk = (version: string): GithubReleaseMin => ({
  tag_name: `v${version}`,
  assets: [
    { name: `StarSeed-os-${version}.apk`, browser_download_url: `https://example.com/StarSeed-os-${version}.apk` },
    { name: `StarSeed.OS_${version}_universal.dmg`, browser_download_url: "https://example.com/mac.dmg" },
  ],
});

describe("actualizador-android", () => {
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

  describe("decidirActualizacionAndroid", () => {
    it("retorna false cuando no hay versión instalada", () => {
      const resultado = decidirActualizacionAndroid(null, releaseConApk("0.2.1"));
      expect(resultado.hayNuevaVersion).toBe(false);
      expect(resultado.href).toBeNull();
      expect(resultado.nombre).toBeNull();
      expect(resultado.version).toBeNull();
    });

    it("retorna false cuando no hay release", () => {
      const resultado = decidirActualizacionAndroid("0.2.0", null);
      expect(resultado.hayNuevaVersion).toBe(false);
      expect(resultado.href).toBeNull();
    });

    it("retorna true con versión nueva y los datos completos", () => {
      const resultado = decidirActualizacionAndroid("0.2.0", releaseConApk("0.2.1"));
      expect(resultado.hayNuevaVersion).toBe(true);
      expect(resultado.href).toBe("https://example.com/StarSeed-os-0.2.1.apk");
      expect(resultado.nombre).toBe("StarSeed-os-0.2.1.apk");
      expect(resultado.version).toBe("0.2.1");
    });

    it("retorna false cuando la versión del release es igual o menor", () => {
      const resultado = decidirActualizacionAndroid("0.2.1", releaseConApk("0.2.1"));
      expect(resultado.hayNuevaVersion).toBe(false);
      expect(resultado.href).toBeNull();
      expect(resultado.nombre).toBeNull();
      expect(resultado.version).toBeNull();
    });

    it("retorna false cuando el release no tiene .apk", () => {
      const sinApk: GithubReleaseMin = {
        tag_name: "v1.0.0",
        assets: [{ name: "other.dmg", browser_download_url: "https://example.com/file.dmg" }],
      };
      const resultado = decidirActualizacionAndroid("0.2.0", sinApk);
      expect(resultado.hayNuevaVersion).toBe(false);
      expect(resultado.href).toBeNull();
    });
  });
});