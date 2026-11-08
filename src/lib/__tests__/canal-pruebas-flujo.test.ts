/**
 * (ACT1108A) Canal de pruebas de las apps nativas: el flujo de CI (native-build.yml), su script
 * (native/scripts/canal-pruebas.mjs) y lo que leen Rust y Kotlin dicen lo mismo, y el canal oficial
 * sigue como estaba. Contrato: architecture/centro-versiones-1105.md §9.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// `yaml` (YAML 1.2: «on» es una clave, no un booleano) ya está en node_modules y trae sus tipos.
import { parse as leerYaml } from "yaml";
import {
  baseDePrueba,
  codigoAndroidOficial,
  codigoAndroidPrueba,
  codigoSemver,
  ENDPOINT_OFICIAL,
  ENDPOINT_PRUEBAS,
  esDePrueba,
  esEntradaCli,
  manifiestoAndroid,
  manifiestoEscritorio,
  MANIFIESTO_ANDROID,
  MANIFIESTO_ESCRITORIO,
  plan,
  rangoPrueba,
  sellarCargo,
  sellarConf,
  sobrantes,
  versionDePrueba,
  versionWix,
} from "../../../native/scripts/canal-pruebas.mjs";
import { compararVersiones } from "../version/os-release";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(path.join(RAIZ, f), "utf8");

type Paso = { name?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string>; shell?: string };
type Job = { if?: string; needs?: string | string[]; steps: Paso[]; strategy?: { matrix?: Record<string, unknown> }; outputs?: Record<string, string> };
const flujo = leerYaml(leer(".github/workflows/native-build.yml")) as {
  on: { workflow_dispatch: { inputs: Record<string, { type?: string; options?: string[]; default?: unknown }> }; push: { tags: string[] } };
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
};
const paso = (job: string, nombre: string | RegExp) =>
  flujo.jobs[job].steps.find((s) => (typeof nombre === "string" ? s.name === nombre : nombre.test(s.name ?? "") || nombre.test(s.uses ?? "")));

describe("versión y versionCode del canal de pruebas (canal-pruebas.mjs)", () => {
  it("la base es la oficial + 1 parche y la versión lleva el n.º de ejecución", () => {
    expect(baseDePrueba("0.5.0")).toBe("0.5.1");
    expect(baseDePrueba("0.5.1-prueba.3")).toBe("0.5.1");
    expect(versionDePrueba("0.5.0", 23)).toBe("0.5.1-prueba.23");
    expect(esDePrueba("0.5.1-prueba.23")).toBe(true);
    expect(esDePrueba("0.5.1")).toBe(false);
    expect(() => versionDePrueba("0.5.0", 0)).toThrow();
    expect(() => versionDePrueba("basura", 3)).toThrow();
  });

  it("semver (las reglas del updater de Tauri): 0.5.0 < 0.5.1-prueba.23 < 0.5.1 y las pruebas crecen", () => {
    expect(compararVersiones("0.5.1-prueba.23", "0.5.0")).toBe(1);
    expect(compararVersiones("0.5.1-prueba.23", "0.5.1")).toBe(-1);
    expect(compararVersiones("0.5.1-prueba.100", "0.5.1-prueba.99")).toBe(1);
    expect(compararVersiones(versionDePrueba("0.5.0", 24), versionDePrueba("0.5.0", 23))).toBe(1);
  });

  it("versionCode: oficial anterior < pruebas (siempre crecientes) < oficial siguiente", () => {
    expect(codigoSemver("0.5.0")).toBe(5000); // lo que calcula Tauri por defecto (los APK de hoy)
    const { min, max } = rangoPrueba("0.5.1");
    expect([min, max]).toEqual([5_000_001, 5_000_999]);
    const primera = codigoAndroidPrueba("0.5.1", undefined);
    const segunda = codigoAndroidPrueba("0.5.1", primera);
    expect(primera).toBe(5_000_001);
    expect(segunda).toBe(5_000_002);
    // Mayor que el oficial 0.5.0 de antes (5000) y de ahora (5 000 000); menor que el oficial 0.5.1.
    expect(primera).toBeGreaterThan(5000);
    expect(primera).toBeGreaterThan(codigoAndroidOficial("0.5.0"));
    expect(max).toBeLessThan(codigoAndroidOficial("0.5.1"));
    // Un anterior de otra base (más viejo) no cuenta; el rango agotado falla en alto.
    expect(codigoAndroidPrueba("0.5.2", 5_000_777)).toBe(5_001_001);
    expect(() => codigoAndroidPrueba("0.5.1", 5_000_999)).toThrow(/Se acabaron/);
    expect(codigoAndroidOficial("2.0.0")).toBeLessThanOrEqual(2_100_000_000);
  });

  it("MSI: solo números (x.y.z.n) y plan completo", () => {
    expect(versionWix("0.5.1", 23)).toBe("0.5.1.23");
    expect(versionWix("0.5.1", 65_537)).toBe("0.5.1.1");
    expect(plan("0.5.0", 23, "5000004")).toEqual({ version: "0.5.1-prueba.23", base: "0.5.1", codigo: 5_000_005, wix: "0.5.1.23" });
  });

  it("sellar: versión, versionCode, MSI y el updater mirando pruebas y luego oficial; el identificador no cambia", () => {
    const conf = JSON.parse(leer("native/src-tauri/tauri.conf.json"));
    const s = sellarConf(conf, { version: "0.5.1-prueba.23", codigo: 5_000_001, wix: "0.5.1.23" });
    expect(s.version).toBe("0.5.1-prueba.23");
    expect(s.identifier).toBe(conf.identifier);
    expect(s.bundle.android.versionCode).toBe(5_000_001);
    expect(s.bundle.windows.wix.version).toBe("0.5.1.23");
    expect(s.bundle.windows.nsis).toEqual(conf.bundle.windows.nsis);
    expect(s.plugins.updater.endpoints).toEqual([ENDPOINT_PRUEBAS, ENDPOINT_OFICIAL]);
    expect(s.plugins.updater.pubkey).toBe(conf.plugins.updater.pubkey);
    expect(conf.version).not.toBe("0.5.1-prueba.23"); // no muta el original
    // Oficial: solo el versionCode (× 1000); la versión y los endpoints, como estaban.
    const o = sellarConf(conf, { codigo: codigoAndroidOficial(conf.version) });
    expect(o.version).toBe(conf.version);
    expect(o.plugins.updater.endpoints).toEqual(conf.plugins.updater.endpoints);
    expect(conf.plugins.updater.endpoints).toEqual([ENDPOINT_OFICIAL]);
    // Cargo.toml: solo la versión del [package].
    const cargo = leer("native/src-tauri/Cargo.toml");
    const c = sellarCargo(cargo, "0.5.1-prueba.23");
    expect(c).toMatch(/^\[package\][\s\S]*?^version = "0\.5\.1-prueba\.23"$/m);
    expect(c.replace('version = "0.5.1-prueba.23"', `version = "${conf.version}"`)).toBe(cargo);
  });

  it("latest-prueba.json: sin firma no se publica; manifiesto de Android validado", () => {
    const latest = {
      version: "0.5.1-prueba.23",
      notes: "x",
      pub_date: "2026-11-08T10:00:00Z",
      platforms: {
        "darwin-aarch64": { signature: "firma", url: "https://github.com/o/r/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.23_universal.app.tar.gz" },
        "linux-x86_64": { signature: "", url: "https://github.com/o/r/releases/download/canal-pruebas/a.AppImage" },
      },
    };
    const { faltan, manifiesto } = manifiestoEscritorio(latest, { version: "0.5.1-prueba.23", notas: "Canal de pruebas · 0.5.1-prueba.23" });
    expect(faltan).toEqual(["linux-x86_64: sin firma o sin url"]);
    expect(Object.keys(manifiesto!.platforms)).toEqual(["darwin-aarch64"]);
    expect(manifiesto!.notes).toBe("Canal de pruebas · 0.5.1-prueba.23");
    expect(manifiestoEscritorio({ ...latest, version: "0.5.0" }, { version: "0.5.1-prueba.23", notas: "" }).faltan[0]).toMatch(/versión/);
    const a = manifiestoAndroid({
      version: "0.5.1-prueba.23",
      versionCode: 5_000_001,
      apk: "https://github.com/StarSeedSystem/starseed-system/releases/download/canal-pruebas/StarSeed-os-0.5.1-prueba.23.apk",
      sha256: "a".repeat(64),
      bytes: 10,
      notas: "n",
      fecha: "2026-11-08T10:00:00Z",
    });
    expect(Object.keys(a).sort()).toEqual(["apk", "bytes", "canal", "notas", "pub_date", "sha256", "version", "versionCode"]);
    expect(() => manifiestoAndroid({ ...a, apk: "https://evil.example/x.apk", fecha: "" })).toThrow();
    expect(() => manifiestoAndroid({ ...a, sha256: "xyz", fecha: "" })).toThrow();
  });

  it("limpieza: se queda solo lo que apuntan los manifiestos vigentes y lo de esta prueba", () => {
    const escritorio = { platforms: { "darwin-aarch64": { url: "https://x/releases/download/canal-pruebas/StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz" } } };
    const android = { apk: "https://x/releases/download/canal-pruebas/StarSeed-os-0.5.1-prueba.23.apk" };
    const nombres = [
      MANIFIESTO_ESCRITORIO,
      MANIFIESTO_ANDROID,
      "StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz",
      "StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz.sig",
      "StarSeed.OS_0.5.1-prueba.22_universal.dmg",
      "StarSeed.OS_0.5.1-prueba.21_universal.app.tar.gz",
      "StarSeed-os-0.5.1-prueba.22.apk",
      "StarSeed-os-0.5.1-prueba.23.apk",
      "StarSeed.OS_0.5.1-prueba.23_x64-setup.exe",
    ];
    expect(sobrantes(nombres, { escritorio, android, version: "0.5.1-prueba.23" })).toEqual([
      "StarSeed.OS_0.5.1-prueba.22_universal.dmg",
      "StarSeed.OS_0.5.1-prueba.21_universal.app.tar.gz",
      "StarSeed-os-0.5.1-prueba.22.apk",
    ]);
  });
});

describe("native-build.yml · canal de pruebas", () => {
  it("input `canal` con oficial por defecto y pruebas", () => {
    const canal = flujo.on.workflow_dispatch.inputs.canal;
    expect(canal.type).toBe("choice");
    expect(canal.options).toEqual(["oficial", "pruebas"]);
    expect(canal.default).toBe("oficial");
    expect(flujo.on.push.tags).toEqual(["v*"]);
    // Las pruebas van en fila; el oficial no comparte grupo con nadie.
    expect(flujo.concurrency.group).toContain("inputs.canal == 'pruebas'");
    expect(flujo.concurrency.group).toContain("github.run_id");
  });

  it("plan: solo en pruebas; prerelease fija, nunca «Latest», y versionCode desde la prueba anterior", () => {
    const plan = flujo.jobs["canal-pruebas-plan"];
    expect(plan.if).toBe("github.event_name == 'workflow_dispatch' && inputs.canal == 'pruebas'");
    expect(Object.keys(plan.outputs ?? {}).sort()).toEqual(["base", "codigo", "version", "wix"]);
    const pre = paso("canal-pruebas-plan", /Prerelease fija/)!.run!;
    expect(pre).toContain("gh release create canal-pruebas");
    expect(pre).toContain("--prerelease --latest=false");
    expect(pre).not.toMatch(/--latest(?!=false)/);
    expect(pre).not.toMatch(/gh release (create|edit) v/);
    expect(paso("canal-pruebas-plan", /versionCode/)!.run).toContain(MANIFIESTO_ANDROID);
  });

  it("escritorio: solo StarSeed OS en pruebas; prerelease `canal-pruebas`; el oficial igual que antes", () => {
    const job = flujo.jobs["build-desktop"];
    expect(job.needs).toEqual(["servidor-local-next", "canal-pruebas-plan"]);
    expect(job.if).toContain("!cancelled()");
    expect(job.if).toContain("needs.canal-pruebas-plan.result == 'success'");
    expect(String(job.strategy!.matrix!.system)).toBe(`\${{ fromJSON(inputs.canal == 'pruebas' && '["os"]' || '["os","nexus","cafe"]') }}`);
    const sellar = paso("build-desktop", "Canal de pruebas · sellar la versión")!;
    expect(sellar.if).toBe("inputs.canal == 'pruebas'");
    // Se sella ANTES del servidor local (que reescribe tauri.conf.json) y antes de tauri-action.
    const nombres = job.steps.map((s) => s.name ?? s.uses ?? "");
    const iSellar = nombres.indexOf("Canal de pruebas · sellar la versión");
    expect(iSellar).toBeGreaterThan(-1);
    expect(iSellar).toBeLessThan(nombres.indexOf("Servidor local · armar (Node oficial verificado + standalone)"));
    const tauri = job.steps.find((s) => s.uses?.startsWith("tauri-apps/tauri-action"))!.with!;
    expect(tauri.tagName).toMatch(/^\$\{\{ inputs\.canal == 'pruebas' && 'canal-pruebas' \|\| inputs\.etiqueta/);
    expect(tauri.releaseDraft).toBe("${{ inputs.canal != 'pruebas' }}");
    expect(tauri.prerelease).toBe("${{ inputs.canal == 'pruebas' }}");
    expect(tauri.includeUpdaterJson).toBe("${{ matrix.system == 'os' }}");
    // El texto oficial del release, idéntico al de antes (con «:» por format para no romper el YAML).
    expect(String(tauri.releaseBody)).toContain("desde su canal{1} StarSeed OS con latest.json");
    expect(String(tauri.releaseBody)).toContain(", ':') }}");
  });

  it("(INT1108C) Linux en pruebas sin .rpm (deb + AppImage), el sellado se comprueba y el oficial no cambia", () => {
    const cfg = paso("build-desktop", "Resolver flag de config")!.run!;
    expect(cfg).toContain(`if [ "\${{ inputs.canal }}" = "pruebas" ] && [ "\${{ runner.os }}" = "Linux" ]; then`);
    expect(cfg).toContain('echo "bundles=--bundles deb,appimage" >> "$GITHUB_OUTPUT"');
    expect(cfg.match(/bundles=/g)).toHaveLength(1); // solo en esa rama: el oficial no fija bundles (sigue con .rpm)
    const tauri = flujo.jobs["build-desktop"].steps.find((s) => s.uses?.startsWith("tauri-apps/tauri-action"))!.with!;
    expect(tauri.args).toBe("${{ steps.cfg.outputs.flag }} ${{ matrix.args }} ${{ steps.cfg.outputs.bundles }}");
    const sellar = paso("build-desktop", "Canal de pruebas · sellar la versión")!.run!;
    expect(sellar.indexOf("canal-pruebas.mjs sellar")).toBeLessThan(sellar.indexOf("SELLADA=$(node -p"));
    expect(sellar).toContain('if [ "$SELLADA" != "${{ needs.canal-pruebas-plan.outputs.version }}" ]; then');
    expect(sellar).toContain("exit 1");
  });

  it("(CI1108N) escritorio: un segundo intento idéntico solo si el primero falla; Android reintenta solo con firma de red", () => {
    const pasos = flujo.jobs["build-desktop"].steps.filter((s) => s.uses?.startsWith("tauri-apps/tauri-action"));
    expect(pasos).toHaveLength(2);
    const [uno, dos] = pasos as unknown as Array<Record<string, unknown>>;
    expect(uno["continue-on-error"]).toBe(true);
    expect(uno.id).toBe("tauri1");
    expect(dos.if).toBe("steps.tauri1.outcome == 'failure'");
    expect(dos["continue-on-error"]).toBeUndefined(); // el segundo falla en rojo con el error real
    expect(dos.with).toEqual(uno.with); // mismo tagName, args y bundles: mismo Release, mismos assets
    expect(dos.env).toEqual(uno.env);
    const apk = paso("build-android", "Build APK (release)")!.run!;
    expect(apk).toContain('[ "$INTENTO" -eq 1 ] && grep -Eqi "$FIRMA" "$LOG"');
    expect(apk).toContain("HTTP response code: 5[0-9][0-9]");
    expect(apk).toContain('exit "$RC"'); // sin firma de red, falla a la primera
    const gradle = paso("build-android", "Gradle · más paciencia con la red")!.run!;
    expect(gradle).toContain("networkTimeout=120000");
    expect(gradle).toContain("--retry 6 --retry-all-errors --retry-delay 10");
    const nombres = flujo.jobs["build-android"].steps.map((s) => s.name);
    expect(nombres.indexOf("Inicializar Android")).toBeLessThan(nombres.indexOf("Gradle · más paciencia con la red"));
    expect(nombres.indexOf("Gradle · más paciencia con la red")).toBeLessThan(nombres.indexOf("Build APK (release)"));
  });

  it("(INT1108C) el script se reconoce como entrada también con rutas de Windows (antes `sellar` no hacía nada)", () => {
    const win = { resolver: path.win32.resolve, aRuta: (u: string | URL) => fileURLToPath(u, { windows: true }) };
    const url: string = "file:///D:/a/starseed-system/starseed-system/native/scripts/canal-pruebas.mjs";
    const argv1: string = "D:\\a\\starseed-system\\starseed-system\\native\\scripts\\canal-pruebas.mjs";
    expect(url === `file://${argv1}`).toBe(false); // la comparación de antes: nunca casaba en Windows
    expect(esEntradaCli(url, argv1, win)).toBe(true);
    expect(esEntradaCli(url, "D:\\a\\otro.mjs", win)).toBe(false);
    expect(esEntradaCli("file:///home/runner/work/x/native/scripts/canal-pruebas.mjs", "/home/runner/work/x/native/scripts/canal-pruebas.mjs")).toBe(true);
    expect(esEntradaCli(url, undefined)).toBe(false);
  });

  it("lo que solo es del canal oficial no corre en pruebas (capas del servidor, Nexus/Café, iOS)", () => {
    for (const j of ["servidor-capa", "canales-updater", "build-ios"]) {
      expect(flujo.jobs[j].if, j).toContain("inputs.canal != 'pruebas'");
    }
  });

  it("Android: versionCode en los dos canales, mismo keystore, APK + manifiesto en la prerelease", () => {
    const job = flujo.jobs["build-android"];
    expect(job.needs).toBe("canal-pruebas-plan");
    expect(job.if).toContain("!cancelled()");
    const version = paso("build-android", /^Versión y versionCode/)!;
    expect(version.run).toContain("canal-pruebas.mjs sellar");
    expect(version.run).toContain("--oficial");
    const nombres = job.steps.map((s) => s.name ?? s.uses ?? "");
    expect(nombres.indexOf(version.name!)).toBeLessThan(nombres.indexOf("Leer versión (tauri.conf.json)"));
    const firmar = paso("build-android", "Firmar APK con keystore self-signed")!.run!;
    // El MISMO keystore en los dos canales (misma firma = Android conserva los datos al instalar encima).
    expect(firmar.match(/secrets\.ANDROID_KEYSTORE_BASE64/g)).toHaveLength(1);
    expect(firmar).not.toContain("inputs.canal");
    expect(firmar).toContain("--print-certs");
    expect(paso("build-android", "Subir APK al Release")!.if).toBe("inputs.canal != 'pruebas'");
    const subir = paso("build-android", "Canal de pruebas · subir el APK y latest-prueba-android.json")!.run!;
    expect(subir.indexOf('gh release upload canal-pruebas "$APK"')).toBeLessThan(subir.indexOf("gh release upload canal-pruebas latest-prueba-android.json"));
    expect(subir).toContain("--clobber");
  });

  it("publicar: al final, con lo que salió de escritorio y Android, y en rojo si falla", () => {
    const job = flujo.jobs["canal-pruebas-publicar"];
    expect(job.needs).toEqual(["canal-pruebas-plan", "build-desktop", "build-android"]);
    expect(job.if).toContain("inputs.canal == 'pruebas'");
    const p = paso("canal-pruebas-publicar", /Publicar latest-prueba\.json/)!;
    expect(p.shell).toBe("bash"); // pipefail con tee
    expect(p.run).toContain("canal-pruebas.mjs publicar");
    expect(p.env?.ESCRITORIO).toBe("${{ needs.build-desktop.result }}");
    expect(p.env?.ANDROID).toBe("${{ needs.build-android.result }}");
  });

  it("el canal oficial no se toca: nada escribe latest.json oficial ni etiquetas v*", () => {
    const texto = leer(".github/workflows/native-build.yml");
    expect(texto).not.toMatch(/releases\/latest\/download\/latest\.json[^\n]*upload/);
    expect(texto).not.toMatch(/gh release (create|edit|upload) ["']?v\d/);
    expect(texto).not.toMatch(/git push|git tag /);
  });
});

describe("publicar (con una API de GitHub de mentira)", () => {
  /** Release `canal-pruebas` en memoria: GET/DELETE de assets, subida y lectura de su contenido. */
  function githubFalso(archivos: Record<string, string>, release = { prerelease: true, draft: false }) {
    let id = 0;
    const assets = new Map<number, { name: string; cuerpo: string }>();
    for (const [name, cuerpo] of Object.entries(archivos)) assets.set(++id, { name, cuerpo });
    const borrados: string[] = [];
    const subidos: string[] = [];
    const responder = (cuerpo: unknown, status = 200) =>
      new Response(status === 204 ? null : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status });
    const fetchFalso = async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const metodo = init?.method ?? "GET";
      if (u.endsWith("/releases/tags/canal-pruebas")) {
        return responder({
          ...release,
          upload_url: "https://uploads.github.com/repos/o/r/releases/1/assets{?name,label}",
          assets: [...assets].map(([i, a]) => ({ id: i, name: a.name })),
        });
      }
      const m = u.match(/\/releases\/assets\/(\d+)$/);
      if (m) {
        const a = assets.get(Number(m[1]));
        if (!a) return responder("no", 404);
        if (metodo === "DELETE") {
          assets.delete(Number(m[1]));
          borrados.push(a.name);
          return responder("", 204);
        }
        return responder(a.cuerpo);
      }
      if (u.startsWith("https://uploads.github.com/") && metodo === "POST") {
        const name = new URL(u).searchParams.get("name")!;
        assets.set(++id, { name, cuerpo: String(init?.body) });
        subidos.push(name);
        return responder({ id });
      }
      return responder("?", 500);
    };
    const leerAsset = (n: string) => [...assets.values()].find((a) => a.name === n)?.cuerpo;
    return { fetchFalso, borrados, subidos, leerAsset, nombres: () => [...assets.values()].map((a) => a.name).sort() };
  }

  const V = "0.5.1-prueba.23";
  const url = (n: string) => `https://github.com/o/r/releases/download/canal-pruebas/${n}`;
  const latest = (v: string) =>
    JSON.stringify({ version: v, notes: "tauri-action", pub_date: "2026-11-08T10:00:00Z", platforms: { "darwin-aarch64": { signature: "FIRMA", url: url(`StarSeed.OS_${v}_universal.app.tar.gz`) } } });
  const android = (v: string, codigo: number) => JSON.stringify({ version: v, versionCode: codigo, apk: url(`StarSeed-os-${v}.apk`), sha256: "a".repeat(64) });

  async function correr(archivos: Record<string, string>, entorno: Record<string, string>) {
    const g = githubFalso(archivos);
    const antes = { fetch: globalThis.fetch, env: { ...process.env } };
    globalThis.fetch = g.fetchFalso as unknown as typeof fetch;
    Object.assign(process.env, { GITHUB_TOKEN: "t", REPO: "o/r", VERSION: V, ...entorno });
    const log = console.log;
    console.log = () => undefined;
    try {
      const { publicar } = await import("../../../native/scripts/canal-pruebas.mjs");
      return { ...g, r: await publicar({}) };
    } finally {
      console.log = log;
      globalThis.fetch = antes.fetch;
      process.env = antes.env;
    }
  }

  it("prueba completa: latest.json → latest-prueba.json y fuera lo de la prueba anterior", async () => {
    const g = await correr(
      {
        "latest.json": latest(V),
        [MANIFIESTO_ESCRITORIO]: latest("0.5.1-prueba.22"),
        [MANIFIESTO_ANDROID]: android(V, 5_000_002),
        "StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz": "x",
        "StarSeed-os-0.5.1-prueba.22.apk": "x",
        [`StarSeed.OS_${V}_universal.app.tar.gz`]: "x",
        [`StarSeed.OS_${V}_universal.app.tar.gz.sig`]: "x",
        [`StarSeed-os-${V}.apk`]: "x",
      },
      { ESCRITORIO: "success", ANDROID: "success" },
    );
    expect(g.r.fallo).toBe(false);
    expect(g.subidos).toEqual([MANIFIESTO_ESCRITORIO]);
    expect(JSON.parse(g.leerAsset(MANIFIESTO_ESCRITORIO)!)).toMatchObject({ version: V, notes: `Canal de pruebas · ${V}`, platforms: { "darwin-aarch64": { signature: "FIRMA" } } });
    expect(g.nombres()).toEqual(
      [MANIFIESTO_ANDROID, MANIFIESTO_ESCRITORIO, `StarSeed-os-${V}.apk`, `StarSeed.OS_${V}_universal.app.tar.gz`, `StarSeed.OS_${V}_universal.app.tar.gz.sig`].sort(),
    );
    expect(g.borrados).toContain("latest.json");
  });

  it("escritorio falló: latest-prueba.json sigue en la prueba anterior y sus archivos se quedan", async () => {
    const g = await correr(
      {
        [MANIFIESTO_ESCRITORIO]: latest("0.5.1-prueba.22"),
        [MANIFIESTO_ANDROID]: android(V, 5_000_002),
        "StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz": "x",
        "StarSeed-os-0.5.1-prueba.22.apk": "x",
        [`StarSeed-os-${V}.apk`]: "x",
      },
      { ESCRITORIO: "failure", ANDROID: "success" },
    );
    expect(g.r.fallo).toBe(false);
    expect(g.subidos).toEqual([]);
    expect(g.nombres()).toContain("StarSeed.OS_0.5.1-prueba.22_universal.app.tar.gz");
    expect(g.borrados).toEqual(["StarSeed-os-0.5.1-prueba.22.apk"]);
  });

  it("instaladores sin latest.json firmado → en rojo", async () => {
    const g = await correr({ [MANIFIESTO_ANDROID]: android(V, 5_000_002) }, { ESCRITORIO: "success", ANDROID: "success" });
    expect(g.r.fallo).toBe(true);
    expect(g.r.lineas.join("\n")).toMatch(/TAURI_SIGNING_PRIVATE_KEY/);
  });
});

describe("Rust, Kotlin y el script dicen lo mismo", () => {
  const logica = leer("native/src-tauri/src/canal_actualizacion_logica.rs");
  const kotlin = leer("native/src-tauri/android/ActualizadorApk.kt");

  it("mismos endpoints y manifiestos", () => {
    expect(logica).toContain(`pub const ENDPOINT_OFICIAL_OS: &str = "${ENDPOINT_OFICIAL}";`);
    expect(logica).toContain(`pub const ENDPOINT_PRUEBAS_OS: &str = "${ENDPOINT_PRUEBAS}";`);
    expect(logica).toContain(`/canal-pruebas/${MANIFIESTO_ANDROID}"`);
  });

  it("Kotlin lee las claves que escribe el script en latest-prueba-android.json", () => {
    for (const lectura of ['j.optString("version")', 'j.optLong("versionCode", -1)', 'j.optString("apk")', 'j.optString("sha256")', 'j.optLong("bytes", -1)']) {
      expect(kotlin).toContain(lectura);
    }
  });
});
