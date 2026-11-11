// (SEG1111T) Mínimo privilegio de «prestar ventana»: ver, listar y teclear en ventanas del aparato solo
// desde la ventana principal, solo desde la web de StarSeed OS y el servidor local, y nunca desde las
// webs hermanas ni desde las capabilities generales. Rust exige además la sesión nativa (pruebas en
// native/src-tauri/src/prestamo_ventana_logica.rs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const NATIVA = join(process.cwd(), "native/src-tauri");
const leer = (f: string) => readFileSync(join(NATIVA, f), "utf8");
type Cap = { identifier: string; windows: string[]; local?: boolean; remote?: { urls: string[] }; permissions: unknown[] };
const cap = (f: string) => JSON.parse(leer(`capabilities/${f}`)) as Cap;
const permisos = (c: Cap) => c.permissions.filter((p): p is string => typeof p === "string");

const SENSIBLES = ["allow-ventanas-prestables", "allow-capturar-ventana", "allow-entrada-ventana"];
const SESION = ["allow-prestamo-ventana-iniciar", "allow-prestamo-ventana-parar", "allow-prestamo-ventana-estado"];

describe("capability prestar-ventana", () => {
  const c = cap("prestar-ventana.json");

  it("solo la ventana main, solo la web de StarSeed OS y los diez puertos del servidor local", () => {
    expect(c.windows).toEqual(["main"]);
    expect(c.local).toBe(false);
    const urls = c.remote!.urls;
    expect(urls).toContain("https://starseed-os.vercel.app");
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1:"))).toHaveLength(10);
    for (const u of urls) expect(u).toMatch(/^(https:\/\/starseed-os\.vercel\.app|http:\/\/127\.0\.0\.1:476[01]\d)$/);
    expect(urls.some((u) => /nexus|cafe/.test(u))).toBe(false);
  });

  it("concede solo los comandos de préstamo y está activada en tauri.conf.json", () => {
    expect([...permisos(c)].sort()).toEqual([...SENSIBLES, ...SESION].sort());
    const conf = JSON.parse(leer("tauri.conf.json"));
    expect(conf.app.security.capabilities).toContain(c.identifier);
  });

  it("ninguna otra capability concede ver o teclear en ventanas", () => {
    for (const f of ["default.json", "desktop.json", "migracion-exportar.json", "migracion-importar.json", "servidor-capas.json"]) {
      for (const p of SENSIBLES) expect(permisos(cap(f)), `${f} · ${p}`).not.toContain(p);
    }
  });

  it("la web no puede quitar ni cambiar el aviso de la barra de menús (sin core:tray ni core:menu)", () => {
    for (const f of ["default.json", "desktop.json"]) {
      for (const p of permisos(cap(f))) expect(p, f).not.toMatch(/^core:(tray|menu):/);
    }
  });

  it("los tres comandos exigen el token de la sesión nativa en Rust", () => {
    const rs = leer("src/ventana_remota.rs");
    for (const f of ["ventanas_prestables", "entrada_ventana", "capturar_ventana"]) {
      const firma = rs.match(new RegExp(`pub fn ${f}\\(([\\s\\S]*?)\\)\\s*->`))![1];
      expect(firma, f).toMatch(/token: String/);
      const cuerpo = rs.slice(rs.indexOf(`pub fn ${f}(`));
      expect(cuerpo.slice(0, cuerpo.indexOf("\n}\n")), f).toMatch(/prestamo::exigir\(&app, &webview, &token/);
    }
  });
});
