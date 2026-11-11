/*
 * Guardia del contrato web ↔ app nativa: los tipos de src/lib/nativa/tipos.ts y los comandos de
 * puente.ts deben casar con lo que de verdad expone Rust (native/src-tauri/src). Si alguien cambia
 * un campo en un lado y no en el otro, esto se pone rojo antes de que lo note una persona.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "native/src-tauri/src");
const rust = (f: string) => readFileSync(join(RAIZ, f), "utf8");
const ts = (f: string) => readFileSync(join(process.cwd(), "src/lib/nativa", f), "utf8");

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

const PARES: Array<[string, string, string]> = [
  ["antenas.rs", "EstadoAntenas", "EstadoAntenas"],
  ["antenas.rs", "EstadoAntena", "EstadoAntena"],
  ["antenas.rs", "Vecino", "VecinoFaro"],
  ["antenas.rs", "ConfigAntenas", "ConfigAntenas"],
  ["nativa.rs", "EstadoFondo", "EstadoFondo"],
  ["android.rs", "ServicioAndroid", "ServicioAndroid"],
  ["carpetas.rs", "CarpetaConcedida", "CarpetaConcedida"],
  ["nativa.rs", "EstadoCapasDisco", "EstadoCapasDisco"],
  ["disco.rs", "CapaEnDisco", "CapaEnDisco"],
  ["disco.rs", "PeticionDescarga", "PeticionDescarga"],
  ["disco.rs", "Verificacion", "Verificacion"],
  ["nativa.rs", "EntradaNas", "EntradaNas"],
];

describe("contrato web ↔ app nativa", () => {
  const tipos = ts("tipos.ts");
  it.each(PARES)("%s · %s ↔ %s", (archivo, struct, iface) => {
    expect(camposTs(tipos, iface)).toEqual(camposRust(rust(archivo), struct));
  });

  it("cada comando que llama puente.ts está registrado en lib.rs", () => {
    const lib = rust("lib.rs");
    const registrados = new Set([...lib.matchAll(/nativa::(\w+)/g)].map((m) => m[1]));
    const llamados = [...ts("puente.ts").matchAll(/llamar(?:<[^>]+>)?\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(llamados.length).toBeGreaterThan(15);
    for (const c of llamados) expect(registrados, `falta ${c} en generate_handler!`).toContain(c);
    for (const c of llamados) expect(rust("nativa.rs")).toMatch(new RegExp(`pub (async )?fn ${c}\\(`));
  });

  it("cada comando propio tiene su permiso y una capability que lo concede (tauri ≥ 2.11.1, APP1107B)", () => {
    const lib = rust("lib.rs");
    const nombres = (bloque: string) => [...bloque.matchAll(/([a-z_][a-z0-9_:]*?)(?:,|\s*$)/gm)].map((m) => m[1].split("::").pop()!).filter(Boolean);
    const comunes = nombres(lib.match(/generate_handler!\[([\s\S]*?)\$\(\$solo_desktop/)![1]);
    const escritorio = nombres(lib.match(/#\[cfg\(desktop\)\]\s*registrar_comandos!\(builder \[([\s\S]*?)\]\);/)![1]);
    expect(comunes.length).toBeGreaterThan(25);
    expect(escritorio).toContain("servidor_local_estado");
    const build = readFileSync(join(process.cwd(), "native/src-tauri/build.rs"), "utf8");
    const manifiesto = [...build.match(/const COMANDOS_APP: &\[&str\] = &\[([\s\S]*?)\];/)![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect([...manifiesto].sort()).toEqual([...comunes, ...escritorio].sort());
    const cap = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "native/src-tauri/capabilities", f), "utf8"));
    const permisos = (c: { permissions: unknown[] }) => c.permissions.filter((p): p is string => typeof p === "string");
    const def = cap("default.json");
    const escr = cap("desktop.json");
    const allow = (c: string) => `allow-${c.replace(/_/g, "-")}`;
    // Lo común lo pide la web en cualquier plataforma (también el servidor local 127.0.0.1). (SEG1111U) El rescate
    // entre puertos, solo el servidor local (rescate-origen.json).
    const rescate = permisos(cap("rescate-origen.json"));
    for (const c of comunes) expect([...permisos(def), ...rescate], c).toContain(allow(c));
    for (const p of permisos(def)) expect(p).not.toMatch(/^allow-rescate-origen/);
    expect(def.remote.urls).toContain("http://127.0.0.1:47610");
    const migracion = [...permisos(cap("migracion-exportar.json")), ...permisos(cap("migracion-importar.json"))];
    const capas = permisos(cap("servidor-capas.json"));
    const prestar = permisos(cap("prestar-ventana.json")); // SEG1111T
    const acceso = permisos(cap("acceso-equipo.json")); // SEG1111U
    for (const c of escritorio) expect([...permisos(escr), ...migracion, ...capas, ...prestar, ...acceso], c).toContain(allow(c));
    // (SEG1111U) Ejecutar programas: solo escritorio y solo acceso-equipo.json.
    expect(escritorio).toContain("run_terminal");
    expect(comunes).not.toContain("run_terminal");
    for (const p of [...permisos(def), ...permisos(escr), ...migracion, ...capas, ...prestar]) expect(p).not.toBe("allow-run-terminal");
    // La migración NO se concede a la ventana principal en la web publicada ni a nadie más.
    for (const p of [...permisos(def), ...permisos(escr)]) expect(p).not.toMatch(/^allow-migracion-origen/);
    // (CAP1107A) «Actualizar ahora» tampoco: solo el servidor local (servidor-capas.json).
    for (const p of [...permisos(def), ...permisos(escr), ...migracion]) expect(p).not.toBe("allow-servidor-local-actualizar");
  });

  it("(CAP1107A · T1) capas del servidor: Rust, envoltorio, capa.mjs, capability y web dicen lo mismo", () => {
    const raiz = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    // El estado que lee la pastilla.
    expect(camposTs(ts("estado-servidor-local.ts"), "EstadoServidorLocal")).toEqual(camposRust(rust("servidor_local.rs"), "EstadoServidorLocal"));
    const logica = rust("servidor_capas_logica.rs");
    // Protocolo del envoltorio: el que pone en cada capa lo sabe lanzar esta app.
    const protocolo = Number(raiz("native/servidor-local/starseed-arranque.cjs").match(/^const PROTOCOLO = (\d+);/m)![1]);
    const admitidos = logica.match(/pub const PROTOCOLOS_ADMITIDOS: &\[u32\] = &\[([\d, ]+)\];/)![1].split(",").map((x) => Number(x.trim()));
    expect(admitidos).toContain(protocolo);
    // Lo que toda capa debe traer y el formato, iguales a los dos lados.
    const capaMjs = raiz("native/servidor-local/capa.mjs");
    const reqJs = [...capaMjs.match(/export const REQUERIDOS = \[([^\]]+)\]/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const reqRs = [...logica.match(/pub const REQUERIDOS: \[&str; \d+\] =\s*\[([^\]]+)\]/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(reqJs).toEqual(reqRs);
    expect(capaMjs).toMatch(/export const FORMATO = 1;/);
    expect(logica).toMatch(/pub const FORMATO: u32 = 1;/);
    // El canal fijo que publica el CI es el que mira la app.
    const etiqueta = capaMjs.match(/export const ETIQUETA_CANAL = "([^"]+)"/)![1];
    const nombre = capaMjs.match(/export const NOMBRE_CANAL = "([^"]+)"/)![1];
    expect(logica).toContain(`pub const CANAL: &str = "https://github.com/StarSeedSystem/starseed-system/releases/download/${etiqueta}/${nombre}";`);
    // La app mínima de las capas no es más nueva que esta app.
    const minima = capaMjs.match(/export const APP_MINIMA = "(\d+)\.(\d+)\.(\d+)"/)!.slice(1).map(Number);
    const conf = JSON.parse(raiz("native/src-tauri/tauri.conf.json"));
    const app = String(conf.version).split(".").map(Number);
    expect(minima[0] * 1e6 + minima[1] * 1e3 + minima[2]).toBeLessThanOrEqual(app[0] * 1e6 + app[1] * 1e3 + app[2]);
    // La capability: solo la ventana principal, solo los diez orígenes locales, solo ese permiso.
    const cap = JSON.parse(raiz("native/src-tauri/capabilities/servidor-capas.json"));
    expect(conf.app.security.capabilities).toContain(cap.identifier);
    expect(cap.windows).toEqual(["main"]);
    expect(cap.local).toBe(false);
    expect(cap.permissions).toEqual(["allow-servidor-local-actualizar"]);
    expect(cap.remote.urls).toHaveLength(10);
    for (const u of cap.remote.urls) expect(u).toMatch(/^http:\/\/127\.0\.0\.1:476[01]\d$/);
    // La firma se verifica con la clave del updater (la misma que firma el CI).
    expect(rust("servidor_capas.rs")).toContain('get("updater")?.get("pubkey")');
  });

  it("(VER1107B) info_neurona y buscar_actualizacion: Rust ↔ info-neurona.ts, registrados y con permiso", () => {
    const web = ts("info-neurona.ts");
    const rs = rust("neurona_info.rs");
    expect(camposTs(web, "InfoNeuronaNativa")).toEqual(camposRust(rs, "InfoNeurona"));
    expect(camposTs(web, "BusquedaActualizacion")).toEqual(camposRust(rs, "BusquedaActualizacion"));
    expect(web).toContain('COMANDO_INFO = "info_neurona"');
    expect(web).toContain('COMANDO_BUSCAR = "buscar_actualizacion"');
    const def = JSON.parse(readFileSync(join(process.cwd(), "native/src-tauri/capabilities/default.json"), "utf8"));
    expect(def.permissions).toEqual(expect.arrayContaining(["allow-info-neurona", "allow-buscar-actualizacion", "core:app:default"]));
  });

  it("(MIC1108A) micrófono y cámara: Info.plist, manifiesto de Android, Rust ↔ web y orígenes propios", () => {
    const raiz = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    // macOS: sin estos textos WebKit ni deja usar ni deja pedir el micrófono o la cámara.
    const plist = raiz("native/src-tauri/Info.plist");
    for (const clave of ["NSMicrophoneUsageDescription", "NSCameraUsageDescription"]) {
      const m = plist.match(new RegExp(`<key>${clave}</key>\\s*<string>([^<]+)</string>`));
      expect(m, `${clave} en Info.plist`).not.toBeNull();
      expect(m![1].trim().length, clave).toBeGreaterThan(30);
    }
    // Sigue siendo un plist de claves y valores emparejados (cada <key> con su valor detrás).
    const sinComentarios = plist.replace(/<!--[\s\S]*?-->/g, "");
    expect(sinComentarios.match(/<key>/g)!.length).toBe(sinComentarios.match(/<\/key>\s*<(string|true\/|false\/|dict)/g)!.length);
    // El estado que lee la web y los dos comandos, iguales a los dos lados, registrados y con permiso.
    const rs = rust("permisos_medios.rs");
    const web = ts("medios-nativos.ts");
    expect(camposTs(web, "EstadoMediosNativo")).toEqual(camposRust(rs, "EstadoMediosNativo"));
    expect(web).toContain('COMANDO_ESTADO_MEDIOS = "medios_estado"');
    expect(web).toContain('COMANDO_AJUSTES_MEDIOS = "medios_abrir_ajustes"');
    expect(rs).toMatch(/pub fn medios_estado\(/);
    expect(rs).toMatch(/pub fn medios_abrir_ajustes\(tipo: String\)/);
    const lib = rust("lib.rs");
    expect(lib).toContain("permisos_medios::medios_estado");
    expect(lib).toContain("permisos_medios::medios_abrir_ajustes");
    expect(lib).toMatch(/\.on_permission_request\(\|webview, kind\| permisos_medios::al_pedir_permiso/);
    expect(lib).toMatch(/\.on_page_load\(\|webview, carga\| permisos_medios::recordar_pagina/);
    const def = JSON.parse(raiz("native/src-tauri/capabilities/default.json"));
    expect(def.permissions).toEqual(expect.arrayContaining(["allow-medios-estado", "allow-medios-abrir-ajustes"]));
    // Los orígenes propios de los medios: las webs publicadas y 127.0.0.1:47610…47619. (SEG1111U) Nexus y Café ya no
    // son orígenes remotos de las capabilities (no llaman a nada nativo), pero sus apps siguen usando micro y cámara:
    // eso lo decide permisos_medios.rs por origen, no una capability.
    const publicadas = [...rs.match(/pub const WEBS_PUBLICADAS: \[&str; \d+\] = \[([\s\S]*?)\];/)![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...publicadas].sort()).toEqual(["https://starseed-cafe.vercel.app", "https://starseed-nexus.vercel.app", "https://starseed-os.vercel.app"]);
    expect(def.remote.urls.filter((u: string) => u.startsWith("https://"))).toEqual(["https://starseed-os.vercel.app"]);
    expect(def.remote.urls.filter((u: string) => u.startsWith("http://127.0.0.1:"))).toHaveLength(10);
    expect(rust("pista_neurona.rs")).toMatch(/const PUERTOS_LOCALES: std::ops::RangeInclusive<u16> = 47610..=47619;/);
    // Android: micro, cámara y auriculares en el manifiesto (build.rs) y la ficha de la app desde Kotlin.
    const parche = rust("android_parche.rs");
    for (const p of ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "CAMERA", "BLUETOOTH_CONNECT"]) expect(parche).toContain(`"android.permission.${p}"`);
    expect(raiz("native/src-tauri/build.rs")).toMatch(/\n\s*medios_android\(\);/);
    expect(raiz("native/src-tauri/android/ArranqueStarSeed.kt")).toContain('"ajustes" -> abrirAjustes(a)');
    // `on_permission_request` existe desde tauri 2.12.
    expect(raiz("native/src-tauri/Cargo.toml")).toMatch(/^tauri = \{ version = "2\.(1[2-9]|[2-9]\d)"/m);
  });

  it("(NOT1108A) avisos de mensajes y origen local: Rust ↔ avisos-nativos.ts, registrados y con permiso", () => {
    const raiz = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
    const web = ts("avisos-nativos.ts");
    const avisos = rust("avisos_mensajes.rs");
    const origen = rust("origen_local.rs");
    expect(camposTs(web, "EstadoAvisosNativo")).toEqual(camposRust(avisos, "EstadoAvisos"));
    expect(camposTs(web, "ResultadoAvisoNativo")).toEqual(camposRust(avisos, "ResultadoAviso"));
    expect(camposTs(web, "ConfigAvisosNativo")).toEqual(camposRust(avisos, "ConfigAvisos"));
    expect(camposTs(web, "EstadoOrigenLocal")).toEqual(camposRust(origen, "EstadoOrigenLocal"));
    // Los comandos que llama la web existen, están registrados y tienen su permiso en default.json.
    const lib = rust("lib.rs");
    const def = JSON.parse(raiz("native/src-tauri/capabilities/default.json"));
    for (const [constante, cmd] of [
      ["COMANDO_AVISO", "aviso_mensaje"],
      ["COMANDO_CONFIG", "avisos_config"],
      ["COMANDO_ESTADO", "avisos_estado"],
      ["COMANDO_PERMISO", "avisos_pedir_permiso"],
      ["COMANDO_PENDIENTE", "avisos_pendiente"],
      ["COMANDO_ORIGEN", "origen_local_estado"],
    ]) {
      expect(web).toContain(`${constante} = "${cmd}"`);
      expect(lib).toMatch(new RegExp(`(avisos_mensajes|origen_local)::${cmd},`));
      expect(def.permissions).toContain(`allow-${cmd.replace(/_/g, "-")}`);
    }
    expect(avisos).toMatch(/pub fn aviso_mensaje\(\s*app: AppHandle,\s*id: String,\s*clave: String,\s*titulo: String,\s*cuerpo: String,\s*ruta: String,\s*sistema: bool,/);
    expect(avisos).toMatch(/pub fn avisos_config\(app: AppHandle, config: ConfigAvisos\)/);
    // El evento de la notificación pulsada se llama igual a los dos lados.
    expect(avisos).toContain('pub const EVENTO_ABRIR: &str = "starseed://aviso-abrir";');
    expect(web).toContain('EVENTO_ABRIR = "starseed://aviso-abrir"');
    // La pulsación (`on_action`) y el canal de Android existen desde el plugin 2.8; los permisos del plugin, concedidos.
    expect(raiz("native/src-tauri/Cargo.toml")).toMatch(/^tauri-plugin-notification = "2\.([8-9]|\d{2})"/m);
    for (const p of ["notification:default", "notification:allow-notify", "notification:allow-request-permission"]) expect(def.permissions).toContain(p);
    // Android: POST_NOTIFICATIONS declarado (Android 13+ lo pide en tiempo de ejecución).
    expect(rust("android_parche.rs")).toContain('"android.permission.POST_NOTIFICATIONS"');
    // El respaldo nativo se engancha al canal local y se inicia en el setup.
    expect(rust("malla_local.rs")).toContain("crate::avisos_mensajes::al_recibir_local(&h, &ip_texto, &recibido.cuerpo);");
    expect(lib).toContain("avisos_mensajes::iniciar(app.handle());");
    // Escritorio y Android eligen el puerto con el registro del origen (y rescatan antes de lanzar el Node).
    expect(rust("servidor_local.rs")).toContain("crate::origen_local::elegir_puerto(app, preferido, puerto_libre)");
    expect(rust("servidor_local.rs")).toContain("crate::origen_local::rescatar(app, puerto,");
    expect(rust("servidor_local_android.rs")).toContain("crate::origen_local::elegir_puerto(app, None, puerto_libre)");
    expect(rust("servidor_local_android.rs")).toContain("crate::origen_local::rescatar(app, puerto,");
  });

  it("los eventos tienen el mismo nombre a los dos lados", () => {
    const n = rust("nativa.rs");
    for (const ev of ["starseed://antenas", "starseed://serie", "starseed://serie-cerrada"]) {
      expect(n).toContain(`"${ev}"`);
      expect(tipos).toContain(`"${ev}"`);
    }
  });
});
