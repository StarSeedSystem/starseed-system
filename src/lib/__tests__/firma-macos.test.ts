import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — módulo .mjs sin tipos (es el script de CI)
import { evaluarFirma, IDENTIFICADOR } from "../../../native/scripts/verificar-firma-macos.mjs";

const raiz = process.cwd();
const BIEN = `Executable=/Applications/StarSeed OS.app/Contents/MacOS/starseed_native
Identifier=app.starseed.os
Format=app bundle with Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=1234 flags=0x2(adhoc) hashes=40+7 location=embedded
Signature=adhoc
Info.plist entries=24
Sealed Resources version=2 rules=13 files=120
Internal requirements count=0 size=12`;
const LINKER = `Executable=/Applications/StarSeed OS.app/Contents/MacOS/starseed_native
Identifier=starseed_native-5555aaaa
Format=Mach-O universal (x86_64 arm64)
CodeDirectory v=20400 size=999 flags=0x20002(adhoc,linker-signed) hashes=30+0 location=embedded
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none`;
const OK = { estado: 0, salida: "" };

describe("evaluarFirma (CI de macOS, PER1108A)", () => {
  it("la firma de bundle ad-hoc con el identificador estable vale", () => {
    expect(IDENTIFICADOR).toBe("app.starseed.os");
    expect(evaluarFirma({ dv: BIEN, verificacion: OK })).toEqual({ ok: true, motivos: [] });
  });
  it("lo que había instalado (linker-signed, Info.plist sin atar) NO vale, con todos sus motivos", () => {
    const r = evaluarFirma({ dv: LINKER, verificacion: OK });
    expect(r.ok).toBe(false);
    expect(r.motivos.join(" | ")).toMatch(/linker-signed/);
    expect(r.motivos.join(" | ")).toMatch(/Info\.plist/);
    expect(r.motivos.join(" | ")).toMatch(/Sealed Resources/);
    expect(r.motivos.join(" | ")).toMatch(/starseed_native-5555aaaa/);
  });
  it("un identificador distinto falla", () => {
    expect(evaluarFirma({ dv: BIEN.replace("app.starseed.os", "otra.cosa"), verificacion: OK }).ok).toBe(false);
    expect(evaluarFirma({ dv: BIEN.replace("app.starseed.os", "app.starseed.nexus"), verificacion: OK, id: "app.starseed.nexus" }).ok).toBe(true);
  });
  it("si codesign --verify --deep --strict falla, falla", () => {
    const r = evaluarFirma({ dv: BIEN, verificacion: { estado: 1, salida: "a sealed resource is missing or invalid" } });
    expect(r.ok).toBe(false);
    expect(r.motivos[0]).toContain("sealed resource");
  });
  it("hardened runtime sin entitlements falla (negaría micrófono, cámara y Bluetooth)", () => {
    const r = evaluarFirma({ dv: BIEN.replace("flags=0x2(adhoc)", "flags=0x10002(adhoc,runtime)"), verificacion: OK });
    expect(r.ok).toBe(false);
    expect(r.motivos.join()).toMatch(/hardened runtime/);
  });
  it("una firma con certificado propio (sin adhoc) también vale", () => {
    const dv = BIEN.replace("flags=0x2(adhoc)", "flags=0x0(none)").replace("Signature=adhoc", "Authority=StarSeed OS Signing\nSignature size=1700");
    expect(evaluarFirma({ dv, verificacion: OK }).ok).toBe(true);
  });
});

describe("el flujo de CI firma el bundle en los dos canales", () => {
  const yml = readFileSync(join(raiz, ".github/workflows/native-build.yml"), "utf8");
  const conf = JSON.parse(readFileSync(join(raiz, "native/src-tauri/tauri.conf.json"), "utf8"));
  it("el identificador de la app es el estable y el hardened runtime va apagado", () => {
    expect(conf.identifier).toBe("app.starseed.os");
    expect(conf.bundle.macOS.hardenedRuntime).toBe(false);
  });
  it("la identidad sale del paso de preparar (certificado o ad-hoc) y llega a los DOS tauri-action", () => {
    expect(yml).toContain("id: firma_mac");
    expect(yml.match(/APPLE_SIGNING_IDENTITY: \$\{\{ steps\.firma_mac\.outputs\.identidad \}\}/g)).toHaveLength(2);
    expect(yml).toContain("MACOS_CERT_P12_BASE64: ${{ secrets.MACOS_CERT_P12_BASE64 }}");
    expect(yml).toContain("MACOS_CERT_PASSWORD: ${{ secrets.MACOS_CERT_PASSWORD }}");
  });
  it("la comprobación corre tras el build, sobre la .app y sobre el .app.tar.gz del updater", () => {
    const i = yml.indexOf("Build (tauri-action) y subir al Release (reintento)");
    const v = yml.indexOf("macOS · verificar la firma del bundle");
    expect(v).toBeGreaterThan(i);
    expect(yml).toContain("verificar-firma-macos.mjs");
    expect(yml).toContain("*.app.tar.gz");
  });
  it("sin secretos, cae a firma ad-hoc (identidad «-»); con ellos, importa a un llavero temporal", () => {
    const sh = readFileSync(join(raiz, "native/scripts/firma-macos-preparar.sh"), "utf8");
    expect(sh).toContain('echo "identidad=-"');
    expect(sh).toContain("security create-keychain");
    expect(sh).not.toMatch(/echo[^\n]*\$\{?MACOS_CERT_PASSWORD/);
    expect(sh).not.toMatch(/echo[^\n]*\$\{?MACOS_CERT_P12_BASE64/);
  });
});
