#!/usr/bin/env node
/*
 * verificar-firma-macos — comprueba que la .app de macOS salió FIRMADA COMO BUNDLE (PER1108A, 2026-11-08).
 * Contrato: architecture/centro-versiones-1105.md «Firma de macOS».
 *
 * Por qué: la app instalada tenía solo `flags=0x20002(adhoc,linker-signed)` e identificador `starseed_native-<hash>`:
 * el ejecutable llevaba la firma mínima del enlazador y el BUNDLE no estaba firmado, así que el Info.plist (con
 * NSBluetoothAlwaysUsageDescription y los demás textos de permisos) no iba atado a la firma y macOS (TCC)
 * negaba el Bluetooth sin preguntar. Firmar el bundle (aunque sea ad-hoc) sella Info.plist y recursos.
 *
 * Uso:   node verificar-firma-macos.mjs <ruta.app | ruta.app.tar.gz> [--id app.starseed.os]
 * Salida 0 = bien; 1 = firma mal (el motivo, en español, por stderr); 2 = uso.
 * La función `evaluarFirma` es pura y la prueban src/lib/__tests__/firma-macos.test.ts.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const IDENTIFICADOR = "app.starseed.os";

/**
 * Decide si la firma vale. `dv` es lo que imprime `codesign -dv --verbose=4 <app>` (va por stderr);
 * `verificacion` el resultado de `codesign --verify --deep --strict <app>`. Devuelve los motivos de fallo.
 */
export function evaluarFirma({ dv, verificacion, id = IDENTIFICADOR }) {
  const motivos = [];
  const texto = String(dv ?? "");
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/i.exec(texto);
  const lista = flags ? flags[1].split(",").map((s) => s.trim()) : [];
  if (lista.includes("linker-signed")) {
    motivos.push("el ejecutable solo lleva la firma del enlazador (linker-signed): el bundle no se firmó");
  }
  if (/Info\.plist=not bound/i.test(texto)) {
    motivos.push("el Info.plist no está atado a la firma (Info.plist=not bound): macOS negará los permisos sin preguntar");
  }
  if (!/Sealed Resources version=/i.test(texto)) {
    motivos.push("los recursos del bundle no están sellados (falta «Sealed Resources»)");
  }
  const ident = /^Identifier=(.+)$/m.exec(texto);
  if (!ident) motivos.push("codesign no dijo el identificador");
  else if (ident[1].trim() !== id) motivos.push(`el identificador es «${ident[1].trim()}» y debe ser «${id}»`);
  if (lista.includes("runtime")) {
    motivos.push("tiene hardened runtime sin entitlements: el micrófono, la cámara y el Bluetooth se negarían (hardenedRuntime debe ir en false)");
  }
  if (!verificacion || verificacion.estado !== 0) {
    const detalle = String(verificacion?.salida ?? "").trim().split("\n").slice(-2).join(" ");
    motivos.push(`codesign --verify --deep --strict falló${detalle ? `: ${detalle}` : ""}`);
  }
  return { ok: motivos.length === 0, motivos };
}

function leerFirma(app, id) {
  const dv = spawnSync("codesign", ["-dv", "--verbose=4", app], { encoding: "utf8" });
  const ver = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
  return evaluarFirma({
    dv: `${dv.stdout ?? ""}${dv.stderr ?? ""}`,
    verificacion: { estado: ver.status, salida: `${ver.stdout ?? ""}${ver.stderr ?? ""}` },
    id,
  });
}

function main(argv) {
  const args = argv.slice(2);
  const iId = args.indexOf("--id");
  const id = iId >= 0 ? args[iId + 1] : IDENTIFICADOR;
  const ruta = args.find((a, i) => !a.startsWith("--") && (iId < 0 || i !== iId + 1));
  if (!ruta) {
    console.error("Uso: verificar-firma-macos.mjs <ruta.app | ruta.app.tar.gz> [--id app.starseed.os]");
    return 2;
  }
  let app = ruta;
  let tmp = null;
  try {
    if (ruta.endsWith(".tar.gz")) {
      // El paquete del updater se hace DESPUÉS de firmar: debe traer la .app firmada.
      tmp = mkdtempSync(join(tmpdir(), "firma-"));
      execFileSync("tar", ["-xzf", ruta, "-C", tmp]);
      const dentro = readdirSync(tmp).find((n) => n.endsWith(".app"));
      if (!dentro) {
        console.error(`✗ ${ruta}: el paquete del updater no contiene ninguna .app`);
        return 1;
      }
      app = join(tmp, dentro);
    }
    const r = leerFirma(app, id);
    if (r.ok) {
      console.log(`✓ ${ruta}: firmada como bundle (identificador ${id}), Info.plist atado, recursos sellados, verificación estricta correcta.`);
      return 0;
    }
    for (const m of r.motivos) console.error(`✗ ${ruta}: ${m}`);
    return 1;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
