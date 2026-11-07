/*
 * Pruebas de preparar-android.mjs (AND1107A) — en seco, sin compilar Next, sin Gradle y sin red:
 *   node --test native/servidor-local/__tests__/preparar-android.test.mjs
 * Lo puro (manifiesto, Gradle, configuración, propiedades) contra las plantillas reales, y un armado
 * entero con un build de Next de mentira, un NDK de mentira y un zip «de nodejs-mobile» de mentira
 * (con su propio SHA-256 en un manifiesto de prueba): qué queda en el proyecto, que es idempotente y
 * que, si algo falla, lo deshace todo.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  leerArgs, nombreLib, parchearManifiesto, parchearGradle, parchearConfAndroid, propiedades, rutasNdk, hostNdk,
  prepararAndroid, ARCHIVOS_ENVOLTORIO, KOTLIN, RED_LOCAL_XML, bloqueProveedor,
} from "../preparar-android.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SL = path.join(AQUI, "..");
const SRC_TAURI = path.join(AQUI, "..", "..", "src-tauri");
const NM = JSON.parse(fs.readFileSync(path.join(SL, "nodejs-mobile.json"), "utf8"));

// El AndroidManifest.xml que genera `cargo tauri android init` (plantilla de Tauri 2, resumida igual que
// en android_parche.rs), y el mismo con el servicio de antenas ya inyectado por build.rs.
const PLANTILLA = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.starseed_native"
        android:usesCleartextTraffic="\${usesCleartextTraffic}">
        <activity android:name=".MainActivity" android:exported="true" />
        <provider
          android:name="androidx.core.content.FileProvider"
          android:authorities="\${applicationId}.fileprovider"
          android:exported="false"
          android:grantUriPermissions="true" />
    </application>
</manifest>
`;

test("argumentos", () => {
  const a = leerArgs(["--tar", "x.tar", "--proyecto", "p", "--abis", "arm64-v8a, x86_64", "--conf", "c.json"]);
  assert.deepEqual(a.abis, ["arm64-v8a", "x86_64"]);
  assert.equal(a.proyecto, "p");
  assert.throws(() => leerArgs(["--proyecto", "p"]), /--tar o --next/);
  assert.throws(() => leerArgs(["--tar", "a", "--next", "b", "--proyecto", "p"]), /--tar o --next/);
  assert.throws(() => leerArgs(["--tar", "a"]), /--proyecto/);
  assert.throws(() => leerArgs(["--rara"]), /desconocida/);
});

test("el nombre de la librería Rust sale del Cargo.toml real", () => {
  assert.equal(nombreLib(fs.readFileSync(path.join(SRC_TAURI, "Cargo.toml"), "utf8")), "starseed_native_lib");
  assert.equal(nombreLib('[package]\nname = "x"\n\n[lib]\n# c\nname = "otra_lib"\n'), "otra_lib");
  assert.throws(() => nombreLib('[package]\nname = "x"\n'), /\[lib\]/);
});

test("manifiesto: proveedor dentro de <application> y la red local, idempotente", () => {
  const m = parchearManifiesto(PLANTILLA);
  const app = m.indexOf("<application");
  const prov = m.indexOf("app.starseed.nativa.ArranqueServidorLocal");
  assert.ok(app < prov && prov < m.lastIndexOf("</application>"));
  assert.match(m, /<application\n {8}android:networkSecurityConfig="@xml\/starseed_red_local"\n/);
  assert.match(m, /android:authorities="\$\{applicationId\}\.starseed-servidor-local"/);
  assert.match(m, /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/, "no se quita lo de Tauri");
  assert.equal(parchearManifiesto(m), m, "idempotente");
  assert.equal(m.split("ArranqueServidorLocal").length, 2);
  // Convive con el bloque del servicio de antenas (build.rs lo pone entre sus marcadores).
  const conAntenas = PLANTILLA.replace("    </application>", "        <!-- STARSEED-SEGUNDO-PLANO:COMPONENTES:INICIO -->\n        <service android:name=\"x\" />\n        <!-- STARSEED-SEGUNDO-PLANO:COMPONENTES:FIN -->\n    </application>");
  const ambos = parchearManifiesto(conAntenas);
  assert.ok(ambos.includes("STARSEED-SEGUNDO-PLANO:COMPONENTES:FIN") && ambos.includes("ArranqueServidorLocal"));
  assert.throws(() => parchearManifiesto(PLANTILLA.replace("<application", '<application android:networkSecurityConfig="@xml/otra"')), /otra networkSecurityConfig/);
  assert.throws(() => parchearManifiesto("<manifest></manifest>"), /<application>/);
  assert.match(bloqueProveedor(), /android:exported="false"/);
});

test("red local: HTTP en claro solo hacia 127.0.0.1 y localhost", () => {
  assert.match(RED_LOCAL_XML, /<base-config cleartextTrafficPermitted="false" \/>/);
  const dominios = [...RED_LOCAL_XML.matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map((x) => x[1]);
  assert.deepEqual(dominios, ["127.0.0.1", "localhost"]);
});

test("Gradle: .so comprimidas y una libc++_shared, idempotente", () => {
  const base = 'plugins {\n    id("rust")\n}\n\napply(from = file("tauri.build.gradle.kts"))\n';
  const g = parchearGradle(base);
  assert.ok(g.startsWith(base), "no toca lo que había");
  assert.match(g, /useLegacyPackaging = true/);
  assert.match(g, /pickFirsts \+= "\*\*\/libc\+\+_shared\.so"/);
  assert.equal(parchearGradle(g), g, "idempotente");
});

test("configuración de Android: la ventana empieza en la página de arranque", () => {
  const real = JSON.parse(fs.readFileSync(path.join(SRC_TAURI, "tauri.android.conf.json"), "utf8"));
  const c = parchearConfAndroid(real);
  assert.equal(c.build.frontendDist, "../arranque");
  assert.deepEqual(c.app.windows, [{ label: "main", title: "StarSeed OS", url: "index.html" }]);
  assert.equal(real.app.windows[0].url, "https://starseed-os.vercel.app", "no muta el original");
  assert.ok(fs.existsSync(path.join(SRC_TAURI, c.build.frontendDist, "index.html")), "native/arranque/index.html existe");
  assert.deepEqual(parchearConfAndroid({}).app.windows, [{ label: "main", title: "StarSeed OS", url: "index.html" }]);
});

test("propiedades: formato de java.util.Properties", () => {
  assert.equal(propiedades({ a: 1, b: "x=y:z", c: null, d: "uno\\dos\ntres" }), "a=1\nb=x\\=y\\:z\nd=uno\\\\dos\\ntres\n");
});

test("NDK: rutas por ABI y anfitrión", () => {
  assert.equal(hostNdk("darwin"), "darwin-x86_64");
  assert.equal(hostNdk("linux"), "linux-x86_64");
  const r = rutasNdk("/ndk", "armeabi-v7a", NM.abis, "linux");
  assert.equal(r.libcxx, "/ndk/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/arm-linux-androideabi/libc++_shared.so");
  assert.equal(r.strip, "/ndk/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip");
  assert.throws(() => rutasNdk("/ndk", "x86", NM.abis, "linux"), /sin soporte/);
});

test("contrato: envoltorio igual que escritorio, Kotlin, Rust y nodejs-mobile.json casan", () => {
  // Lo que preparar.mjs copia junto al envoltorio en escritorio = lo que va en el zip de Android.
  const escritorio = [...fs.readFileSync(path.join(SL, "preparar.mjs"), "utf8").matchAll(/copyFileSync\(path\.join\(AQUI, "([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...escritorio].sort(), [...ARCHIVOS_ENVOLTORIO].sort());
  for (const k of KOTLIN) {
    const t = fs.readFileSync(path.join(SRC_TAURI, "android", k), "utf8");
    assert.match(t, /^package app\.starseed\.nativa$/m, k);
  }
  const kt = fs.readFileSync(path.join(SRC_TAURI, "android", "ServidorLocal.kt"), "utf8");
  assert.match(kt, /private const val LIBRERIA = "\{\{LIB\}\}"/);
  assert.match(kt, /external fun nativoEstado\(estado: String\)/);
  assert.match(kt, /class ArranqueServidorLocal : ContentProvider/);
  const rs = fs.readFileSync(path.join(SRC_TAURI, "src", "servidor_local_android.rs"), "utf8");
  assert.match(rs, /Java_app_starseed_nativa_ServidorLocal_nativoEstado/);
  const logica = fs.readFileSync(path.join(SRC_TAURI, "src", "servidor_local_android_logica.rs"), "utf8");
  assert.ok(logica.includes(`pub const SIMBOLO_START: &str = "${NM.simbolo}";`), "el símbolo de node::Start casa");
  // Las claves que Kotlin manda son las que Rust lee.
  const leidas = [...logica.matchAll(/^\s*"([a-z_]+)" => e\./gm)].map((m) => m[1]).sort();
  const mandadas = [...new Set([...kt.matchAll(/"([a-z_]+)" to /g)].map((m) => m[1]))].sort();
  assert.deepEqual(mandadas, leidas);
  assert.match(NM.sha256, /^[0-9a-f]{64}$/);
  assert.match(NM.licencia.sha256, /^[0-9a-f]{64}$/);
  assert.ok(NM.url.includes(`v${NM.version}/`) && NM.licencia.url.includes(`v${NM.version}/`));
});

// ───────────────────────── Armado de punta a punta (en seco) ─────────────────────────

function escribir(raiz, rel, contenido) {
  const p = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido);
}
const sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function montar() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ss-prep-android-"));
  // Build de Next de mentira.
  const s = path.join(raiz, "next", ".next", "standalone");
  escribir(s, "server.js", "//");
  escribir(s, ".next/BUILD_ID", "BuildDeMentira_1");
  escribir(s, ".next/required-server-files.json", JSON.stringify({ config: { images: { unoptimized: true } } }));
  escribir(s, ".env", "CLAVE=no-debe-viajar");
  escribir(s, "node_modules/sharp/package.json", "{}");
  escribir(s, "node_modules/next/package.json", "{}");
  escribir(raiz, "next/.next/static/chunks/a.js", "//");
  escribir(raiz, "next/public/logo.svg", "<svg/>");
  // Proyecto Android de mentira (lo que deja `cargo tauri android init`).
  const proyecto = path.join(raiz, "gen", "android");
  escribir(proyecto, "app/src/main/AndroidManifest.xml", PLANTILLA);
  escribir(proyecto, "app/build.gradle.kts", 'plugins {\n    id("rust")\n}\n');
  // NDK de mentira (sin llvm-strip: se copia la .so tal cual).
  const ndk = path.join(raiz, "ndk");
  for (const t of Object.values(NM.abis)) escribir(ndk, `toolchains/llvm/prebuilt/${hostNdk()}/sysroot/usr/lib/${t}/libc++_shared.so`, `libc++ ${t}`);
  // «nodejs-mobile» de mentira con su manifiesto de prueba.
  const zipDir = path.join(raiz, "nm");
  for (const abi of Object.keys(NM.abis)) escribir(zipDir, `bin/${abi}/libnode.so`, `libnode ${abi} `.repeat(100));
  const zip = path.join(raiz, "nodejs-mobile-android-prueba.zip");
  assert.equal(spawnSync("zip", ["-r", "-q", zip, "bin"], { cwd: zipDir }).status, 0);
  escribir(raiz, "LICENSE", "MIT de prueba");
  const manifiesto = path.join(raiz, "nodejs-mobile.json");
  fs.writeFileSync(manifiesto, JSON.stringify({ ...NM, sha256: sha(zip), licencia: { ...NM.licencia, sha256: sha(path.join(raiz, "LICENSE")) } }));
  const conf = path.join(raiz, "tauri.android.conf.json");
  fs.copyFileSync(path.join(SRC_TAURI, "tauri.android.conf.json"), conf);
  const args = { next: path.join(raiz, "next"), proyecto, conf, ndk, zipNodejs: zip, licencia: path.join(raiz, "LICENSE"), manifiestoNodejs: manifiesto, cache: path.join(raiz, "cache") };
  return { raiz, proyecto, conf, args };
}

test("armado entero: deja en el proyecto justo lo que build.rs exige, e idempotente", { skip: spawnSync("zip", ["-v"]).status !== 0 && "sin zip", timeout: 60_000 }, async () => {
  const { raiz, proyecto, conf, args } = montar();
  try {
    const r = await prepararAndroid(args);
    assert.equal(r.buildId, "BuildDeMentira_1");
    assert.equal(r.lib, "starseed_native_lib");
    const main = path.join(proyecto, "app", "src", "main");
    for (const abi of Object.keys(NM.abis)) {
      assert.match(fs.readFileSync(path.join(main, "jniLibs", abi, "libnode.so"), "utf8"), new RegExp(`^libnode ${abi}`));
      assert.equal(fs.readFileSync(path.join(main, "jniLibs", abi, "libc++_shared.so"), "utf8"), `libc++ ${NM.abis[abi]}`);
    }
    // Lo mismo que comprueba android_parche::servidor_local_preparado (Rust).
    for (const rel of ["java/app/starseed/nativa/ServidorLocal.kt", "java/app/starseed/nativa/ServidorLocalLogica.kt", "assets/servidor-local/paquete.properties", "assets/servidor-local/servidor.zip", "res/xml/starseed_red_local.xml"]) {
      assert.ok(fs.statSync(path.join(main, rel)).isFile(), rel);
    }
    const kt = fs.readFileSync(path.join(main, "java/app/starseed/nativa/ServidorLocal.kt"), "utf8");
    assert.match(kt, /LIBRERIA = "starseed_native_lib"/);
    assert.ok(!kt.includes("{{"));
    const man = fs.readFileSync(path.join(main, "AndroidManifest.xml"), "utf8");
    assert.ok(man.includes("app.starseed.nativa.ArranqueServidorLocal") && man.includes("@xml/starseed_red_local"));
    assert.equal(fs.readFileSync(path.join(main, "assets/servidor-local/LICENSE-nodejs-mobile.txt"), "utf8"), "MIT de prueba");
    const props = fs.readFileSync(path.join(main, "assets/servidor-local/paquete.properties"), "utf8");
    assert.match(props, /^build_id=BuildDeMentira_1$/m);
    assert.match(props, /^nodejs_mobile=24\.18\.0-0$/m);
    assert.match(props, /^abis=arm64-v8a,armeabi-v7a,x86_64$/m);
    assert.match(props, /^bytes=\d+$/m);
    // El zip: el servidor + el envoltorio, sin .env ni sharp.
    const lista = spawnSync("unzip", ["-Z1", path.join(main, "assets/servidor-local/servidor.zip")], { encoding: "utf8" }).stdout.split("\n");
    for (const f of ["server.js", ".next/BUILD_ID", ".next/static/chunks/a.js", "public/logo.svg", "starseed-servidor.json", ...ARCHIVOS_ENVOLTORIO]) assert.ok(lista.includes(f), f);
    assert.ok(!lista.some((f) => f === ".env" || f.startsWith("node_modules/sharp")), "ni .env ni sharp");
    assert.equal(JSON.parse(fs.readFileSync(conf, "utf8")).app.windows[0].url, "index.html");
    // Otra vez: el mismo resultado (el manifiesto y Gradle no crecen).
    const antes = { man, gradle: fs.readFileSync(path.join(proyecto, "app/build.gradle.kts"), "utf8") };
    await prepararAndroid(args);
    assert.equal(fs.readFileSync(path.join(main, "AndroidManifest.xml"), "utf8"), antes.man);
    assert.equal(fs.readFileSync(path.join(proyecto, "app/build.gradle.kts"), "utf8"), antes.gradle);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test("si algo falla (SHA-256 que no casa), no queda nada a medias", { skip: spawnSync("zip", ["-v"]).status !== 0 && "sin zip", timeout: 60_000 }, async () => {
  const { raiz, proyecto, conf, args } = montar();
  try {
    const nm = JSON.parse(fs.readFileSync(args.manifiestoNodejs, "utf8"));
    fs.writeFileSync(args.manifiestoNodejs, JSON.stringify({ ...nm, sha256: "0".repeat(64) }));
    const confAntes = fs.readFileSync(conf, "utf8");
    await assert.rejects(prepararAndroid(args), /SHA-256/);
    const main = path.join(proyecto, "app", "src", "main");
    assert.equal(fs.readFileSync(path.join(main, "AndroidManifest.xml"), "utf8"), PLANTILLA);
    assert.equal(fs.readFileSync(conf, "utf8"), confAntes);
    assert.ok(!fs.existsSync(path.join(main, "assets/servidor-local/servidor.zip")));
    // Y con el SHA bueno pero una ABI rota a mitad: se deshace lo ya copiado.
    fs.writeFileSync(args.manifiestoNodejs, JSON.stringify(nm));
    fs.rmSync(path.join(args.ndk, `toolchains/llvm/prebuilt/${hostNdk()}/sysroot/usr/lib/x86_64-linux-android`), { recursive: true });
    await assert.rejects(prepararAndroid(args), /libc\+\+_shared/);
    assert.ok(!fs.existsSync(path.join(main, "jniLibs/arm64-v8a/libnode.so")), "lo copiado antes del fallo se quita");
    assert.equal(fs.readFileSync(path.join(main, "AndroidManifest.xml"), "utf8"), PLANTILLA);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});
