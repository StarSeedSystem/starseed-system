/*
 * BLE1108A — guardia del contrato del Bluetooth directo entre la web y la app nativa: tipos de ble.rs ↔
 * bluetooth-directo.ts, comandos registrados con su permiso, eventos, límites, el texto de macOS, los
 * permisos de Android, la crate fijada de CoreBluetooth y los UUID del contrato. Si alguien cambia un
 * lado y no el otro, esto se pone rojo antes de que lo note una persona con dos aparatos.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as bd from "@/lib/malla/bluetooth-directo";
import { MAX_BLUETOOTH_BYTES } from "@/lib/mensajeria/neuronas/datos-neurona";

const raiz = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const rust = (f: string) => raiz(`native/src-tauri/src/${f}`);

function camposRust(fuente: string, struct: string): string[] {
  const m = fuente.match(new RegExp(`pub struct ${struct} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`No encuentro ${struct} en Rust`);
  return [...m[1].matchAll(/^\s*pub (\w+):/gm)].map((x) => x[1]).sort();
}

function camposTs(fuente: string, iface: string): string[] {
  const m = fuente.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`No encuentro ${iface} en TS`);
  return [...m[1].matchAll(/^ {2}(\w+)\??:/gm)].map((x) => x[1]).sort();
}

describe("contrato del Bluetooth directo (BLE1108A)", () => {
  const ble = rust("ble.rs");
  const trama = rust("ble_trama.rs");
  const web = raiz("src/lib/malla/bluetooth-directo.ts");

  it.each([
    ["EstadoBle", "EstadoBleNativo"],
    ["VecinoBle", "VecinoBleNativo"],
    ["EnlaceBle", "EnlaceBleNativo"],
    ["MensajeBle", "MensajeBleNativo"],
    ["EnvioBle", "EnvioBleNativo"],
  ])("ble.rs · %s ↔ bluetooth-directo.ts · %s", (struct, iface) => {
    expect(camposTs(web, iface)).toEqual(camposRust(ble, struct));
  });

  it("cada comando existe, está registrado en lib.rs y en build.rs, y default.json lo concede", () => {
    const lib = rust("lib.rs");
    const build = raiz("native/src-tauri/build.rs");
    const def = JSON.parse(raiz("native/src-tauri/capabilities/default.json")) as { permissions: unknown[] };
    const comandos = [bd.COMANDO_ESTADO_BLE, bd.COMANDO_ABRIR_BLE, bd.COMANDO_CERRAR_BLE, bd.COMANDO_ENVIAR_BLE, bd.COMANDO_RECIBIDOS_BLE, bd.COMANDO_ACTIVAR_BLE, bd.COMANDO_PERMISO_BLE, bd.COMANDO_REGISTRO_BLE, bd.COMANDO_REGISTRO_ANEXAR_BLE];
    expect(new Set(comandos).size).toBe(9);
    for (const c of comandos) {
      expect(ble, c).toMatch(new RegExp(`#\\[tauri::command\\]\\s*pub (async )?fn ${c}\\(`));
      expect(lib, c).toContain(`ble::${c},`);
      expect(build, c).toContain(`"${c}",`);
      expect(def.permissions, c).toContain(`allow-${c.replace(/_/g, "-")}`);
    }
    // Los argumentos que manda la web son los que reciben los comandos.
    expect(ble).toMatch(/pub async fn ble_enviar\(enlace: String, json: String\)/);
    expect(ble).toMatch(/pub fn ble_abrir\(vecino: String\)/);
    expect(ble).toMatch(/pub fn ble_cerrar\(enlace: String\)/);
    expect(ble).toMatch(/pub fn ble_recibidos\(desde: u64\)/);
    expect(ble).toMatch(/pub fn ble_activar\(activo: bool\)/);
    expect(lib).toMatch(/\n\s*ble::iniciar\(app\.handle\(\)\);/);
  });

  it("eventos y límites iguales a los dos lados", () => {
    expect(ble).toContain(`pub const EVENTO_MENSAJE: &str = "${bd.EVENTO_MENSAJE_BLE}";`);
    expect(ble).toContain(`pub const EVENTO_CAMBIO: &str = "${bd.EVENTO_CAMBIO_BLE}";`);
    expect(trama).toContain(`pub const MAX_CUERPO: usize = ${bd.LIMITES_BLE_DEFECTO.maxCuerpo / 1024} * 1024;`);
    expect(trama).toContain(`pub const LIMITE_MENSAJES: u32 = ${bd.LIMITES_BLE_DEFECTO.porVentana};`);
    expect(trama).toContain(`pub const LIMITE_VENTANA_MS: u64 = ${bd.LIMITES_BLE_DEFECTO.ventanaMs.toLocaleString("en").replace(/,/g, "_")};`);
    expect(bd.MAX_ARCHIVO_BLE).toBe(MAX_BLUETOOTH_BYTES);
  });

  it("macOS: el texto del Bluetooth en Info.plist y CoreBluetooth fijada", () => {
    const plist = raiz("native/src-tauri/Info.plist");
    const m = plist.match(/<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>([^<]+)<\/string>/);
    expect(m, "sin este texto macOS cierra la app al tocar CoreBluetooth").not.toBeNull();
    expect(m![1].length).toBeGreaterThan(40);
    const sinComentarios = plist.replace(/<!--[\s\S]*?-->/g, "");
    expect(sinComentarios.match(/<key>/g)!.length).toBe(sinComentarios.match(/<\/key>\s*<(string|true\/|false\/|dict)/g)!.length);
    const cargo = raiz("native/src-tauri/Cargo.toml");
    const mac = cargo.split(/\n\[target\./).find((s) => s.startsWith(`'cfg(target_os = "macos")'.dependencies]`)) ?? "";
    expect(mac).toMatch(/objc2-core-bluetooth = \{ version = "=0\.3\.2"/);
    expect(mac).toMatch(/dispatch2 = \{ version = "0\.3"/);
    expect(rust("lib.rs")).toMatch(/#\[cfg\(target_os = "macos"\)\]\s*mod ble_macos;/);
  });

  it("Android: permisos de «Dispositivos cercanos» (y ubicación hasta Android 11) inyectados al final", () => {
    const parche = rust("android_ble.rs");
    expect(parche).toContain('("android.permission.BLUETOOTH_SCAN", " android:usesPermissionFlags=\\"neverForLocation\\"")');
    for (const p of ["BLUETOOTH_ADVERTISE", "BLUETOOTH_CONNECT"]) expect(parche).toContain(`"android.permission.${p}"`);
    expect(parche).toContain('("android.permission.ACCESS_FINE_LOCATION", " android:maxSdkVersion=\\"30\\"")');
    const build = raiz("native/src-tauri/build.rs");
    expect(build.indexOf("bluetooth_android();")).toBeGreaterThan(build.indexOf("actualizador_android();"));
    const kt = raiz("native/src-tauri/android/BleStarSeed.kt");
    expect(kt).toContain("class ArranqueBle : ContentProvider()");
    expect(kt).toMatch(/Dispositivos cercanos/);
  });

  it("los UUID del contrato son los de la app", () => {
    const doc = raiz("architecture/bluetooth-directo.md");
    for (const nombre of ["SERVICIO", "ENTRADA", "SALIDA", "UUID_PREFIJO", "UUID_MASCARA"]) {
      const uuid = trama.match(new RegExp(`pub const ${nombre}: &str = "([0-9a-f-]+)";`))![1];
      expect(doc, nombre).toContain(uuid);
    }
    expect(doc).toContain(bd.T_OFERTA_WIFI);
    expect(doc).toContain(bd.T_RESPUESTA_WIFI);
  });
});
