import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// NFC1126B: el NFC de Android no tiene plugin de Tauri; sus comandos, permisos y Kotlin deben ir cableados.
const RAIZ = join(process.cwd(), "native", "src-tauri");
const leer = (r: string) => readFileSync(join(RAIZ, r), "utf8");
const COMANDOS = ["nfc_capacidad", "nfc_iniciar", "nfc_parar", "nfc_escribir_etiqueta"];

describe("NFC de las neuronas · cableado nativo", () => {
  it("cada comando está en lib.rs, en build.rs y con su permiso en default.json", () => {
    const lib = leer("src/lib.rs");
    const build = leer("build.rs");
    const caps = JSON.parse(leer("capabilities/default.json")) as { permissions: string[]; platforms: string[] };
    for (const c of COMANDOS) {
      expect(lib).toContain(`nfc::${c}`);
      expect(build).toContain(`"${c}"`);
      expect(caps.permissions).toContain(`allow-${c.replace(/_/g, "-")}`);
    }
    expect(caps.platforms).toContain("android");
  });

  it("no depende de tauri-plugin-nfc (los permisos son solo los allow-nfc-*)", () => {
    expect(leer("Cargo.toml")).not.toMatch(/^\s*tauri-plugin-nfc\s*=/m);
    expect(leer("capabilities/default.json")).not.toContain("nfc:default");
  });

  it("el Kotlin del lector y de la tarjeta existe y build.rs lo inyecta", () => {
    expect(leer("android/NfcStarSeed.kt").length).toBeGreaterThan(0);
    expect(leer("android/HceStarSeed.kt")).toContain("HostApduService");
    expect(leer("build.rs")).toContain("nfc_android();");
  });
});
