/*
 * (SEG1111U) Inventario de lo que la app nativa expone a orígenes remotos y mínimo privilegio.
 * El inventario vive en architecture/permisos-y-control-del-dispositivo.md §4.8.1: esta prueba se pone roja si una
 * capability con `remote` concede algo que no está en la tabla, si una fila no está concedida o si sus orígenes o
 * plataformas no son los de verdad. Además vigila lo que no debe volver: webs hermanas, ejecutar con el plugin
 * shell, archivos con alcance amplio, bandeja y menús para la web, y `run_terminal` sin «acceso al equipo».
 *   NODE_ENV=test npx vitest run src/lib/nativa/__tests__/inventario-nativo.test.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CAPS = join(RAIZ, "native/src-tauri/capabilities");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

type Permiso = string | { identifier: string; allow?: unknown; deny?: unknown };
interface Capability {
  identifier: string;
  windows: string[];
  platforms?: string[];
  local?: boolean;
  remote?: { urls: string[] };
  permissions: Permiso[];
}

const capabilities: Array<[string, Capability]> = readdirSync(CAPS)
  .filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(join(CAPS, f), "utf8")) as Capability]);
const remotas = capabilities.filter(([, c]) => (c.remote?.urls ?? []).length > 0);
const ident = (p: Permiso) => (typeof p === "string" ? p : p.identifier);

const OS = "https://starseed-os.vercel.app";
const LOCAL = Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${47610 + i}`);
const HERMANAS = ["https://starseed-nexus.vercel.app", "https://starseed-cafe.vercel.app"];

function grupoOrigenes(urls: string[], ventanas: string[]): string {
  const u = [...urls].sort().join(" ");
  if (u === [OS, ...LOCAL].sort().join(" ")) return "OS+local";
  if (u === [...LOCAL].sort().join(" ")) return "local";
  if (u === OS && ventanas.join() === "migracion-origen") return "OS·migración";
  return `?(${u})`;
}
function grupoPlataformas(p: string[] | undefined): string {
  const s = [...(p ?? ["linux", "macOS", "windows", "android", "iOS"])].sort().join(",");
  if (s === "android,iOS,linux,macOS,windows") return "todas";
  if (s === "linux,macOS,windows") return "escritorio";
  if (s === "android,linux,macOS,windows") return "escritorio+Android";
  return `?(${s})`;
}

/** Lo concedido de verdad: permiso → «orígenes · plataformas» (uno por capability). */
const concedido = new Map<string, Set<string>>();
for (const [, c] of remotas) {
  const donde = `${grupoOrigenes(c.remote!.urls, c.windows)} · ${grupoPlataformas(c.platforms)}`;
  for (const p of c.permissions) {
    const k = ident(p);
    if (!concedido.has(k)) concedido.set(k, new Set());
    concedido.get(k)!.add(donde);
  }
}

/** La tabla del contrato: permiso → { donde, clase }. */
const contrato = leer("architecture/permisos-y-control-del-dispositivo.md");
const bloque = contrato.slice(contrato.indexOf("<!-- inventario:inicio -->"), contrato.indexOf("<!-- inventario:fin -->"));
const tabla = new Map<string, { donde: string; clase: string; fila: string }>();
for (const fila of bloque.split("\n").filter((l) => l.startsWith("| `"))) {
  const cols = fila.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
  expect(cols, fila).toHaveLength(5);
  for (const m of cols[0].matchAll(/`([^`]+)`/g)) {
    expect(tabla.has(m[1]), `«${m[1]}» aparece dos veces en el inventario`).toBe(false);
    tabla.set(m[1], { donde: cols[2], clase: cols[4], fila });
  }
}

describe("inventario de lo que llega a un origen remoto (§4.8.1)", () => {
  it("la tabla existe y no está vacía", () => {
    expect(tabla.size).toBeGreaterThan(100);
  });

  it("todo lo que una capability remota concede está en la tabla, con sus orígenes y plataformas de verdad", () => {
    for (const [permiso, donde] of concedido) {
      const fila = tabla.get(permiso);
      expect(fila, `«${permiso}» se concede a un origen remoto y no está en el inventario del contrato (§4.8.1)`).toBeDefined();
      expect([...donde], permiso).toEqual([fila!.donde]);
    }
  });

  it("nada en la tabla que no se conceda (filas viejas)", () => {
    for (const permiso of tabla.keys()) expect(concedido.has(permiso), `«${permiso}» está en el inventario pero ninguna capability remota lo concede`).toBe(true);
  });

  it("cada fila tiene una de las tres clases, y lo que ejecuta o lee archivos pide concesión", () => {
    for (const [p, f] of tabla) expect(["inofensivo", "solo-app", "concesión"], p).toContain(f.clase);
    for (const p of ["allow-run-terminal", "allow-ollama-instalador-abrir", "fs:allow-read-file", "allow-capturar-ventana", "allow-entrada-ventana", "allow-nas-leer"]) {
      expect(tabla.get(p)?.clase, p).toBe("concesión");
    }
  });
});

describe("mínimo privilegio (SEG1111U)", () => {
  const todos = capabilities.flatMap(([, c]) => c.permissions.map(ident));

  it("las webs hermanas (Nexus, Café) no son orígenes remotos de ninguna capability", () => {
    for (const [f, c] of capabilities) for (const h of HERMANAS) expect(c.remote?.urls ?? [], f).not.toContain(h);
  });

  it("ningún origen remoto puede ejecutar con el plugin shell, ni tocar la bandeja o los menús", () => {
    for (const p of todos) {
      expect(p).not.toMatch(/^shell:(allow-(execute|spawn|kill|stdin-write)|default)$/);
      expect(p).not.toMatch(/^core:(default|tray|menu)/);
    }
  });

  it("archivos: solo lectura y sin alcance estático (lo que la persona eligió en un selector nativo)", () => {
    for (const [f, c] of capabilities) {
      for (const p of c.permissions) {
        const id = ident(p);
        if (!id.startsWith("fs:")) continue;
        expect(["fs:allow-read-dir", "fs:allow-read-file", "fs:allow-read-text-file", "fs:allow-stat", "fs:allow-exists"], `${f}: ${id}`).toContain(id);
        expect(typeof p, `${f}: ${id} no lleva alcance propio`).toBe("string");
      }
    }
    // El alcance en tiempo de ejecución lo ponen el selector de carpetas y quitarlas lo prohíbe.
    const nativa = leer("native/src-tauri/src/nativa.rs");
    expect(nativa).toMatch(/fn permitir_en_alcance[\s\S]*?allow_directory\(ruta, true\)/);
    expect(nativa).toMatch(/fn prohibir_en_alcance[\s\S]*?forbid_directory\(ruta, true\)/);
    expect(nativa).toMatch(/blocking_pick_folder\(\)/);
  });

  it("run_terminal: solo escritorio, solo en acceso-equipo.json y con la puerta de «acceso al equipo» en Rust", () => {
    const con = capabilities.filter(([, c]) => c.permissions.map(ident).includes("allow-run-terminal")).map(([f]) => f);
    expect(con).toEqual(["acceso-equipo.json"]);
    const cap = capabilities.find(([f]) => f === "acceso-equipo.json")![1];
    expect(cap.windows).toEqual(["main"]);
    expect(cap.local).toBe(false);
    expect(grupoPlataformas(cap.platforms)).toBe("escritorio");
    const conf = JSON.parse(leer("native/src-tauri/tauri.conf.json"));
    expect(conf.app.security.capabilities).toEqual(expect.arrayContaining(["acceso-equipo", "rescate-origen"]));
    const lib = leer("native/src-tauri/src/lib.rs");
    const cuerpo = lib.slice(lib.indexOf("async fn run_terminal("), lib.indexOf("// ─────────────────── Comandos: check_update"));
    expect(lib).toMatch(/#\[cfg\(desktop\)\]\s*#\[tauri::command\]\s*async fn run_terminal\(app: tauri::AppHandle, webview: tauri::Webview, cmd: String\)/);
    expect(cuerpo.indexOf("acceso_equipo::exigir(")).toBeGreaterThan(0);
    expect(cuerpo.indexOf("acceso_equipo::exigir(")).toBeLessThan(cuerpo.indexOf(".shell()"));
    expect(cuerpo).toContain("al::clasificar(&cmd)");
    expect(cuerpo).toContain("acceso_equipo::confirmar(");
    // No está en la lista común (la de Android/iOS) del registro de comandos.
    const comunes = lib.match(/generate_handler!\[([\s\S]*?)\$\(\$solo_desktop/)![1];
    expect(comunes).not.toMatch(/\brun_terminal\b/);
  });

  it("el rescate entre puertos solo desde el servidor local", () => {
    for (const [f, c] of capabilities) {
      if (!c.permissions.map(ident).some((p) => p.startsWith("allow-rescate-origen"))) continue;
      expect(f).toBe("rescate-origen.json");
      expect(grupoOrigenes(c.remote!.urls, c.windows)).toBe("local");
    }
  });

  it("los orígenes que Rust acepta para «acceso al equipo» son los de su capability", () => {
    const logica = leer("native/src-tauri/src/prestamo_ventana_logica.rs");
    expect(logica).toContain(`pub const WEB_PUBLICADA: &str = "${OS}";`);
    expect(logica).toContain("pub const PUERTO_LOCAL_MIN: u16 = 47610;");
    expect(logica).toContain("pub const PUERTO_LOCAL_MAX: u16 = 47619;");
    expect(leer("native/src-tauri/src/acceso_equipo_logica.rs")).toContain("crate::prestamo_ventana_logica::origen_puede_prestar(origen)");
  });
});
