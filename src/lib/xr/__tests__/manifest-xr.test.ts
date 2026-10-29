import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Prueba de la PWA XR (tarea XR1010AH, contrato §3 c e i):
 * el manifest es válido, los atajos «Entrar en VR/AR» apuntan a rutas vivas,
 * ningún icono falta en public/ y el script de empaquetado Quest no guarda claves.
 * Corre en node (sin jsdom): solo disco local, nada de red.
 */

type Icono = { src: string; sizes: string; type: string };
type Manifiesto = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Icono[];
  shortcuts: { name: string; short_name: string; description: string; url: string; icons: Icono[] }[];
};

const RAIZ = process.cwd();
const RUTA_MANIFEST = path.join(RAIZ, "public", "manifest.webmanifest");
const MANIFIESTO: Manifiesto = JSON.parse(readFileSync(RUTA_MANIFEST, "utf8"));

describe("manifest XR de StarSeed", () => {
  it("es JSON válido con los campos mínimos de una PWA instalable", () => {
    expect(MANIFIESTO.name).toBe("StarSeed OS");
    expect(MANIFIESTO.display).toBe("standalone");
    expect(MANIFIESTO.icons.length).toBeGreaterThan(0);
  });

  it("start_url está dentro de scope (Meta lo exige para el paquete inmersivo)", () => {
    const BASE = "https://starseed-os.vercel.app";
    const SCOPE = new URL(MANIFIESTO.scope, BASE).href;
    const INICIO = new URL(MANIFIESTO.start_url, BASE).href;
    expect(INICIO.startsWith(SCOPE)).toBe(true);
  });

  it("tiene los atajos «Entrar en VR» y «Entrar en AR» (§3 c, instalado + atajos)", () => {
    const ESPERADOS = [
      { name: "Entrar en VR", short_name: "VR", url: "/xr/os?modo=vr" },
      { name: "Entrar en AR", short_name: "AR", url: "/xr/os?modo=ar" },
    ];
    for (const esperado of ESPERADOS) {
      const atajo = MANIFIESTO.shortcuts.find((s) => s.url === esperado.url);
      expect(atajo, `falta el atajo ${esperado.url}`).toBeDefined();
      expect(atajo?.name).toBe(esperado.name);
      expect(atajo?.short_name).toBe(esperado.short_name);
      expect(atajo?.description.length ?? 0).toBeGreaterThan(0);
      expect(atajo?.icons.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("cada atajo apunta a una ruta que existe (y dentro del scope)", () => {
    const BASE = "https://starseed-os.vercel.app";
    const SCOPE = new URL(MANIFIESTO.scope, BASE).href;
    const rutas = new Set(MANIFIESTO.shortcuts.map((s) => new URL(s.url, BASE).pathname));
    expect([...rutas]).toContain("/xr/os");
    for (const r of rutas) {
      expect(new URL(r, BASE).href.startsWith(SCOPE)).toBe(true);
      expect(existsSync(path.join(RAIZ, "src", "app", "(app)", r.replace(/^\//, ""), "page.tsx"))).toBe(true);
    }
  });

  it("ningún icono referenciado (mantisa ni atajos) falta en public/", () => {
    const fuentes = [
      ...MANIFIESTO.icons.map((i) => i.src),
      ...MANIFIESTO.shortcuts.flatMap((s) => s.icons.map((i) => i.src)),
    ];
    expect(fuentes.length).toBeGreaterThan(0);
    for (const f of fuentes) {
      expect(existsSync(path.join(RAIZ, "public", f)), `falta public${f}`).toBe(true);
    }
  });
});

describe("script de empaquetado Quest (scripts/xr/empaquetar-quest.sh)", () => {
  const RUTA_SCRIPT = path.join(RAIZ, "scripts", "xr", "empaquetar-quest.sh");
  const SCRIPT = readFileSync(RUTA_SCRIPT, "utf8");

  it("existe, es bash y exige STARSEED_QUEST_PACKAGE", () => {
    expect(SCRIPT.startsWith("#!")).toBe(true);
    expect(SCRIPT).toContain("STARSEED_QUEST_PACKAGE");
    expect(SCRIPT).toContain("assetlinks.json");
  });

  it("pasa la verificación de sintaxis de bash (bash -n)", () => {
    execFileSync("bash", ["-n", RUTA_SCRIPT], { stdio: "pipe" });
  });

  it("no contiene ninguna contraseña ni clave", () => {
    const PATRONES = /(--storepass|--keypass|-storepass|-keypass|PASS\s*=|sk-[A-Za-z0-9]{10}|gsk_|Bearer\s)/;
    expect(PATRONES.test(SCRIPT), "el script guarda una contraseña o clave").toBe(false);
  });

  it("usa la versión fijada de Bubblewrap y el manifest declarado", () => {
    expect(SCRIPT).toContain("@meta-quest/bubblewrap-cli@1.24.1");
    expect(SCRIPT).toContain("bubblewrap init --manifest=");
    expect(SCRIPT).toContain("--metaquest");
    expect(SCRIPT).toContain("keytool -list -v -keystore");
    expect(SCRIPT).toContain("bubblewrap fingerprint add");
    expect(SCRIPT).toContain("bubblewrap build");
    expect(SCRIPT).toContain("adb install");
  });
});
