/*
 * Pruebas de la guarda del servidor local (SEG1107A · T11). Lógica pura, sin red:
 *   node --test native/servidor-local/__tests__/guarda.test.cjs
 * Cada caso es una petición como la mandaría un navegador (o un programa) y lo que debe pasar.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const G = require(path.join(__dirname, "..", "guarda.cjs"));

const PUERTO = 47610;
const PASE = "0123456789abcdef".repeat(4); // 64 hex, como el de Rust
const OTRO = "fedcba9876543210".repeat(4);
const CFG = { puerto: PUERTO, pase: PASE };
const LOCAL = `http://127.0.0.1:${PUERTO}`;
const COOKIE = `${G.NOMBRE_COOKIE}=${PASE}`;

/** Cabeceras como las de Node (minúsculas), con el host local por defecto. */
function cab(extra = {}) {
  return { host: `127.0.0.1:${PUERTO}`, ...extra };
}
function d(metodo, url, extra, cfg = CFG, actualizar = false) {
  return G.decidir({ metodo, url, cabeceras: cab(extra), actualizar }, cfg);
}
function pasa(r, motivo) {
  assert.equal(r.pasa, true, JSON.stringify(r));
  if (motivo) assert.equal(r.motivo, motivo);
}
function rechaza(r, codigo, motivo) {
  assert.equal(r.pasa, false, JSON.stringify(r));
  assert.equal(r.codigo, codigo, JSON.stringify(r));
  assert.equal(r.motivo, motivo, JSON.stringify(r));
  assert.ok(r.mensaje && r.mensaje !== motivo, `falta el mensaje de ${motivo}`);
}

// Lo que mandan los navegadores (Chromium = WebView2, WebKit = WKWebView/WebKitGTK).
const FETCH_PROPIO = { origin: LOCAL, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", cookie: COOKIE };
const NAVEGACION_APP = { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
const DE_FUERA = { "sec-fetch-site": "cross-site" };

test("host: solo 127.0.0.1 o localhost con SU puerto (DNS rebinding → 421)", () => {
  for (const host of [`127.0.0.1:${PUERTO}`, `localhost:${PUERTO}`, `LOCALHOST:${PUERTO}`]) {
    pasa(G.decidir({ metodo: "GET", url: "/", cabeceras: { host } }, CFG));
  }
  for (const host of [
    `evil.example:${PUERTO}`, // rebinding clásico: el dominio del atacante resuelve a 127.0.0.1
    `127.0.0.1.nip.io:${PUERTO}`,
    `localhost.evil.example:${PUERTO}`,
    "127.0.0.1", // sin puerto
    `127.0.0.1:${PUERTO + 1}`,
    `127.0.0.2:${PUERTO}`,
    `[::1]:${PUERTO}`,
    `0.0.0.0:${PUERTO}`,
    `127.0.0.1:${PUERTO} `,
    ` 127.0.0.1:${PUERTO}`,
    `127.0.0.1:0${PUERTO}`,
    "",
  ]) {
    rechaza(G.decidir({ metodo: "GET", url: "/", cabeceras: { host } }, CFG), 421, "host-ajeno");
  }
  rechaza(G.decidir({ metodo: "GET", url: "/", cabeceras: {} }, CFG), 421, "host-ajeno");
  // Rebinding con TODO lo demás bien (cookie incluida) sigue fuera: el nombre manda.
  rechaza(G.decidir({ metodo: "POST", url: "/api/voz", cabeceras: { ...FETCH_PROPIO, host: `evil.example:${PUERTO}`, origin: `http://evil.example:${PUERTO}` } }, CFG), 421, "host-ajeno");
  // El host de un puerto mal configurado nunca casa.
  rechaza(G.decidir({ metodo: "GET", url: "/", cabeceras: cab() }, { puerto: null, pase: PASE }), 421, "host-ajeno");
});

test("solo rutas «/…»: ni forma absoluta de proxy ni «*»", () => {
  rechaza(d("GET", `http://evil.example/api/voz`), 400, "url-no-valida");
  rechaza(d("GET", `${LOCAL}/api/voz`), 400, "url-no-valida");
  rechaza(d("OPTIONS", "*"), 400, "url-no-valida");
  rechaza(d("GET", ""), 400, "url-no-valida");
});

test("POST de otra web (formulario o fetch «simple») a /api → 403, con o sin cookie", () => {
  // Formulario de otra web: Origin ajeno y cross-site.
  rechaza(d("POST", "/api/voz/hablar", { origin: "https://evil.example", ...DE_FUERA, "sec-fetch-mode": "navigate" }), 403, "origen-ajeno");
  // fetch no-cors con text/plain.
  rechaza(d("POST", "/api/recursos-ia/x", { origin: "https://evil.example", ...DE_FUERA, "sec-fetch-mode": "no-cors", "content-type": "text/plain" }), 403, "origen-ajeno");
  // Aunque llevara la cookie (un navegador no la manda con SameSite=Strict, pero da igual).
  rechaza(d("POST", "/api/voz", { origin: "https://evil.example", ...DE_FUERA, cookie: COOKIE }), 403, "origen-ajeno");
  // iframe con sandbox / data: → Origin «null».
  rechaza(d("POST", "/api/voz", { origin: "null", cookie: COOKIE }), 403, "origen-ajeno");
  // Navegador viejo sin Sec-Fetch-*: el Origin basta.
  rechaza(d("POST", "/api/voz", { origin: "https://evil.example" }), 403, "origen-ajeno");
  // Otra web de la MISMA máquina (otro puerto o «localhost» en vez de 127.0.0.1) también es ajena.
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, origin: "http://127.0.0.1:8000", "sec-fetch-site": "same-site" }), 403, "origen-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, origin: `http://localhost:${PUERTO}` }), 403, "origen-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, origin: `${LOCAL}/` }), 403, "origen-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, origin: `https://127.0.0.1:${PUERTO}` }), 403, "origen-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, origin: [LOCAL, "https://evil.example"] }), 403, "origen-ajeno");
  // Sec-Fetch-Site manda aunque el Origin no venga o diga lo contrario.
  rechaza(d("POST", "/api/voz", { cookie: COOKIE, "sec-fetch-site": "cross-site" }), 403, "sitio-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, "sec-fetch-site": "cross-site" }), 403, "sitio-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, "sec-fetch-site": "same-site" }), 403, "sitio-ajeno");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, "sec-fetch-site": "algo-nuevo" }), 403, "sitio-ajeno");
});

test("/api y cambios desde la propia ventana: hace falta la cookie del pase de ESTE arranque", () => {
  pasa(d("POST", "/api/voz/hablar", FETCH_PROPIO), "api-propia");
  pasa(d("GET", "/api/os/versiones", FETCH_PROPIO), "api-propia");
  pasa(d("HEAD", "/api/x", FETCH_PROPIO), "api-propia");
  pasa(d("DELETE", "/api/x", FETCH_PROPIO), "api-propia");
  pasa(d("PUT", "/api/x", FETCH_PROPIO), "api-propia");
  // Sin cookie (otra web sin Origin ni Sec-Fetch, o un programa cualquiera de la máquina).
  rechaza(d("POST", "/api/voz", { "content-type": "text/plain" }), 403, "sin-pase");
  rechaza(d("GET", "/api/recursos-ia/estado", {}), 403, "sin-pase");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: undefined }), 403, "sin-pase");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: "sb-x-auth-token=1; otra=2" }), 403, "sin-pase");
  // Cookie mala, vacía, de otro arranque, con el nombre parecido o con el pase dentro de otra.
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=${OTRO}` }), 403, "pase-malo");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=` }), 403, "pase-malo");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=${PASE.slice(1)}` }), 403, "pase-malo");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=${PASE.toUpperCase()}` }), 403, "pase-malo");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}="${PASE}"` }), 403, "pase-malo");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `x${G.NOMBRE_COOKIE}=${PASE}` }), 403, "sin-pase");
  rechaza(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `otra=${G.NOMBRE_COOKIE}=${PASE}` }), 403, "sin-pase");
  // Varias cookies con ese nombre (otro servidor de 127.0.0.1 puso una suya): vale si alguna casa.
  pasa(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=${OTRO}; sb=1; ${G.NOMBRE_COOKIE}=${PASE}` }));
  pasa(d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `sb=1;${G.NOMBRE_COOKIE}=${PASE};z=2` }));
  // Navegador viejo (sin Sec-Fetch-*) o sin Origin en un GET del mismo origen: la cookie decide.
  pasa(d("POST", "/api/voz", { origin: LOCAL, cookie: COOKIE }));
  pasa(d("GET", "/api/x", { cookie: COOKIE }));
  // La app abre una ruta de /api como documento (descarga, ventana nueva) desde sí misma.
  pasa(d("GET", "/api/exportar", { ...NAVEGACION_APP, cookie: COOKIE }));
  pasa(d("GET", "/api/exportar", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", cookie: COOKIE }));
  // localhost con su propio origen también vale (la cookie es por host, así que la de 127.0.0.1 no llega).
  pasa(G.decidir({ metodo: "POST", url: "/api/voz", cabeceras: { ...FETCH_PROPIO, host: `localhost:${PUERTO}`, origin: `http://localhost:${PUERTO}` } }, CFG));
});

test("GET a /api desde otra web: tampoco (ni navegando la pestaña entera)", () => {
  rechaza(d("GET", "/api/voz/hablar?texto=hola", { ...DE_FUERA, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), 403, "sitio-ajeno");
  rechaza(d("GET", "/api/voz/hablar?texto=hola", { ...DE_FUERA, "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }), 403, "sitio-ajeno");
  rechaza(d("GET", "/api/x", { origin: "https://evil.example", ...DE_FUERA, "sec-fetch-mode": "cors" }), 403, "origen-ajeno");
  rechaza(d("GET", "/api/x", { "sec-fetch-site": "cross-site", cookie: COOKIE }), 403, "sitio-ajeno");
});

test("server actions y route handlers fuera de /api: todo lo que no sea GET/HEAD pide lo mismo", () => {
  const accion = { ...FETCH_PROPIO, "next-action": "abc123", accept: "text/x-component" };
  pasa(d("POST", "/escritorios", accion), "cambio-propio");
  rechaza(d("POST", "/escritorios", { ...accion, cookie: undefined }), 403, "sin-pase");
  rechaza(d("POST", "/escritorios", { ...accion, origin: "https://evil.example", "sec-fetch-site": "cross-site" }), 403, "origen-ajeno");
  rechaza(d("POST", "/auth/callback", { origin: "https://accounts.example", ...DE_FUERA }), 403, "origen-ajeno");
  rechaza(d("PATCH", "/cualquier/cosa", {}), 403, "sin-pase");
  rechaza(d("PROPFIND", "/", {}), 403, "sin-pase");
  // Preflight CORS de otra web (también el de Private Network Access de Chrome).
  rechaza(d("OPTIONS", "/api/voz", { origin: "https://evil.example", ...DE_FUERA, "access-control-request-method": "POST", "access-control-request-private-network": "true" }), 403, "origen-ajeno");
  rechaza(d("OPTIONS", "/", { origin: "https://evil.example" }), 403, "origen-ajeno");
});

test("navegaciones y recursos normales de la app siguen igual (sin cookie)", () => {
  // La primera carga que hace Rust, una recarga, un marcador: Sec-Fetch-Site none.
  pasa(d("GET", "/", NAVEGACION_APP), "pagina-o-recurso");
  pasa(d("GET", "/escritorios?x=1", NAVEGACION_APP));
  // Navegación interna de la app (enlace, router de Next, RSC) y sus recursos.
  pasa(d("GET", "/dashboard", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }));
  pasa(d("GET", "/dashboard?_rsc=1", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", rsc: "1" }));
  pasa(d("GET", "/_next/static/chunks/app.js", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script" }));
  pasa(d("GET", "/logo.svg", { "sec-fetch-site": "same-origin", "sec-fetch-dest": "image" }));
  pasa(d("GET", "/sw-v8.js", { "sec-fetch-site": "same-origin", "sec-fetch-dest": "serviceworker" }));
  pasa(d("HEAD", "/", {}));
  // Motores sin Sec-Fetch-* (WebKitGTK viejo) y el propio Rust (salud): pasan.
  pasa(d("GET", "/", {}));
  pasa(d("GET", "/__starseed/salud", { accept: "application/json", connection: "close" }));
  pasa(d("GET", "/__starseed/red", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" }));
  pasa(d("GET", "/__starseed/migracion", NAVEGACION_APP));
  pasa(d("GET", "/__starseed/migracion-origen.js", { "sec-fetch-site": "same-origin", "sec-fetch-dest": "script" }));
  // Sin pase configurado, las páginas siguen (la ventana muestra la app; lo que falla es /api).
  pasa(d("GET", "/", NAVEGACION_APP, { puerto: PUERTO, pase: "" }));
});

test("desde otra web: la pestaña entera puede llegar (enlace, OAuth); nada embebido", () => {
  // Vuelta de un inicio de sesión con Google/GitHub (Supabase) → /auth/callback: navegación de fuera.
  pasa(d("GET", "/auth/callback?code=abc", { ...DE_FUERA, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-user": "?1" }), "navegacion-de-fuera");
  pasa(d("GET", "/", { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), "navegacion-de-fuera");
  pasa(d("GET", "/", { ...DE_FUERA, "sec-fetch-mode": "navigate" }), "navegacion-de-fuera");
  // iframe de otra web (clickjacking) → no.
  rechaza(d("GET", "/", { ...DE_FUERA, "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" }), 403, "marco-ajeno");
  rechaza(d("GET", "/", { ...DE_FUERA, "sec-fetch-mode": "navigate", "sec-fetch-dest": "frame" }), 403, "marco-ajeno");
  // <script>, <img>, fetch, <link>… de otra web → no (ni la salud: no tiene por qué).
  rechaza(d("GET", "/_next/static/chunks/app.js", { ...DE_FUERA, "sec-fetch-mode": "no-cors", "sec-fetch-dest": "script" }), 403, "recurso-ajeno");
  rechaza(d("GET", "/logo.svg", { ...DE_FUERA, "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }), 403, "recurso-ajeno");
  rechaza(d("GET", "/__starseed/salud", { ...DE_FUERA, "sec-fetch-mode": "cors", origin: "https://evil.example" }), 403, "recurso-ajeno");
  rechaza(d("GET", "/escritorios", { origin: "https://evil.example", "sec-fetch-mode": "cors" }), 403, "recurso-ajeno");
  rechaza(d("GET", "/escritorios", { origin: "null" }), 403, "recurso-ajeno");
  rechaza(d("GET", "/auth/callback?code=x", { ...DE_FUERA, "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }), 403, "recurso-ajeno");
});

test("trucos de ruta: mayúsculas, %xx (también doble), //, ., .., \\ → siguen siendo /api", () => {
  for (const url of [
    "/API/voz",
    "/Api/Voz?x=1",
    "/%61pi/voz",
    "/%41PI/voz",
    "/%2561pi/voz",
    "/%252561pi/voz",
    "//api//voz",
    "/./api/voz",
    "/x/../api/voz",
    "/x/%2e%2e/api/voz",
    "/api%2fvoz",
    "/api%2Fvoz",
    "/\\api/voz",
    "/api\\voz",
    "/api",
    "/api/",
    "/api?x=1",
    "/api#x",
    "/api/../api/voz",
    "/%2e/api/voz",
  ]) {
    rechaza(d("GET", url, {}), 403, "sin-pase");
    rechaza(d("GET", url, { ...DE_FUERA, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), 403, "sitio-ajeno");
    pasa(d("GET", url, { cookie: COOKIE }));
  }
  // Una ruta que no empieza por «/» ni siquiera llega a decidir.
  rechaza(d("GET", "\\api\\voz", { cookie: COOKIE }), 400, "url-no-valida");
  for (const url of ["/apix", "/apis/x", "/x/api", "/api-docs", "/_api/x", "/aapi/x"]) {
    pasa(d("GET", url, {}), "pagina-o-recurso");
  }
  assert.equal(G.rutaParaDecidir("/A/%42/../c//d/"), "/a/c/d");
  assert.equal(G.rutaParaDecidir("/../../etc/passwd"), "/etc/passwd");
  assert.equal(G.rutaParaDecidir("/%zz/%61"), "/%zz/a");
  assert.equal(G.rutaParaDecidir("/x?y=/api"), "/x");
  assert.equal(G.esApi("/api"), true);
  assert.equal(G.esApi("/apix"), false);
});

test("WebSocket y demás «upgrade»: Origin propio y pase, siempre", () => {
  const ws = { connection: "Upgrade", upgrade: "websocket", "sec-websocket-version": "13" };
  rechaza(d("GET", "/", { ...ws, origin: "https://evil.example" }, CFG, true), 403, "origen-ajeno");
  rechaza(d("GET", "/_next/webpack-hmr", { ...ws, origin: LOCAL }, CFG, true), 403, "sin-pase");
  rechaza(d("GET", "/", { ...ws, origin: LOCAL, "sec-fetch-site": "cross-site", cookie: COOKIE }, CFG, true), 403, "sitio-ajeno");
  pasa(d("GET", "/canal", { ...ws, origin: LOCAL, cookie: COOKIE }, CFG, true), "conexion-propia");
  rechaza(d("GET", G.RUTA_ENTRAR + "?t=" + PASE, { ...ws, origin: LOCAL }, CFG, true), 405, "metodo-no-permitido");
});

test("sin pase configurado: /api y cambios cerrados, aunque la cookie diga cualquier cosa", () => {
  for (const pase of ["", undefined, null, "corto", "ZZ".repeat(32), PASE.toUpperCase(), PASE + "\n"]) {
    rechaza(d("POST", "/api/voz", FETCH_PROPIO, { puerto: PUERTO, pase }), 403, "sin-pase-configurado");
    rechaza(d("GET", "/api/voz", { cookie: `${G.NOMBRE_COOKIE}=${pase}` }, { puerto: PUERTO, pase }), 403, "sin-pase-configurado");
  }
});

test("entrada de la ventana: la ruta y el método", () => {
  pasa(d("GET", `${G.RUTA_ENTRAR}?t=${PASE}`, NAVEGACION_APP), "entrar");
  // Llegue como llegue la navegación (cross-site en algún motor), decide el pase al atenderla.
  pasa(d("GET", `${G.RUTA_ENTRAR}?t=x`, { ...DE_FUERA, "sec-fetch-mode": "navigate" }), "entrar");
  pasa(d("GET", `/__STARSEED/Entrar?t=x`, {}), "entrar");
  rechaza(d("POST", `${G.RUTA_ENTRAR}?t=${PASE}`, { origin: LOCAL }), 405, "metodo-no-permitido");
  rechaza(d("HEAD", `${G.RUTA_ENTRAR}?t=${PASE}`, {}), 405, "metodo-no-permitido");
});

test("entrar: con el pase pone la cookie (HttpOnly; SameSite=Strict) y redirige dentro", () => {
  const r = G.entrar(`${G.RUTA_ENTRAR}?t=${PASE}`, CFG);
  assert.equal(r.pasa, true);
  assert.equal(r.codigo, 303);
  assert.equal(r.cabeceras.location, "/");
  assert.equal(r.cabeceras["set-cookie"], `${G.NOMBRE_COOKIE}=${PASE}; Path=/; HttpOnly; SameSite=Strict`);
  assert.doesNotMatch(r.cabeceras["set-cookie"], /Domain|Max-Age|Expires|Secure/i);
  assert.equal(r.cabeceras["cache-control"], "no-store");
  assert.equal(r.cabeceras["referrer-policy"], "no-referrer");
  assert.equal(G.entrar(`${G.RUTA_ENTRAR}?t=${PASE}&a=${encodeURIComponent("/__starseed/migracion")}`, CFG).cabeceras.location, "/__starseed/migracion");
  assert.equal(G.entrar(`${G.RUTA_ENTRAR}?a=%2Fescritorios%3Fx%3D1%23y&t=${PASE}`, CFG).cabeceras.location, "/escritorios?x=1#y");
  // Sin pase, con otro, vacío o con uno «casi»: 403 y sin cookie.
  for (const [url, motivo] of [
    [G.RUTA_ENTRAR, "sin-pase"],
    [`${G.RUTA_ENTRAR}?t=`, "sin-pase"],
    [`${G.RUTA_ENTRAR}?t=${OTRO}`, "pase-malo"],
    [`${G.RUTA_ENTRAR}?t=${PASE}0`, "pase-malo"],
    [`${G.RUTA_ENTRAR}?t=${PASE.toUpperCase()}`, "pase-malo"],
    [`${G.RUTA_ENTRAR}?T=${PASE}`, "sin-pase"],
  ]) {
    const x = G.entrar(url, CFG);
    rechaza(x, 403, motivo);
    assert.equal(x.cabeceras, undefined);
  }
  rechaza(G.entrar(`${G.RUTA_ENTRAR}?t=${PASE}`, { puerto: PUERTO, pase: "" }), 403, "sin-pase-configurado");
  rechaza(G.entrar(`${G.RUTA_ENTRAR}?t=`, { puerto: PUERTO, pase: "" }), 403, "sin-pase-configurado");
});

test("entrar: el destino siempre es una ruta del mismo origen (nada de redirecciones abiertas)", () => {
  for (const a of [
    undefined,
    "",
    "//evil.example",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example/",
    "http://127.0.0.1:47610/",
    "javascript:alert(1)",
    "escritorios",
    "/a\nb",
    "/a\tb",
    "/a\\b",
    "/" + "x".repeat(3000),
    G.RUTA_ENTRAR,
    `${G.RUTA_ENTRAR}?t=${PASE}`,
    "/__STARSEED//entrar",
  ]) {
    assert.equal(G.destinoSeguro(a), "/", String(a).slice(0, 40));
  }
  assert.equal(G.destinoSeguro("/escritorios"), "/escritorios");
  assert.equal(G.destinoSeguro("/a/../b?c=d#e"), "/b?c=d#e");
  assert.equal(G.destinoSeguro("/a b"), "/a%20b");
});

test("rechazos: JSON claro, sin caché y sin nada de la petición (ni el pase)", () => {
  for (const r of [
    d("POST", "/api/voz", { origin: "https://evil.example", cookie: COOKIE }),
    d("POST", "/api/voz", { ...FETCH_PROPIO, cookie: `${G.NOMBRE_COOKIE}=${OTRO}` }),
    G.entrar(`${G.RUTA_ENTRAR}?t=${OTRO}`, CFG),
    d("GET", "/", { host: "evil.example:47610" }),
  ]) {
    const x = G.respuestaRechazo(r);
    assert.equal(x.codigo, r.codigo);
    const j = JSON.parse(x.cuerpo);
    assert.deepEqual(Object.keys(j), ["error", "motivo", "mensaje"]);
    assert.equal(j.error, "puerta-local");
    assert.equal(j.motivo, r.motivo);
    assert.equal(x.cabeceras["cache-control"], "no-store");
    assert.equal(x.cabeceras[G.CABECERA_GUARDA], r.motivo);
    assert.equal(x.cabeceras["content-length"], String(Buffer.byteLength(x.cuerpo)));
    assert.equal(x.cabeceras["access-control-allow-origin"], undefined);
    const todo = JSON.stringify(x) + JSON.stringify(r);
    assert.ok(!todo.includes(PASE) && !todo.includes(OTRO), "el pase no sale nunca");
  }
  // Todo motivo de rechazo tiene su mensaje en español.
  for (const m of Object.keys(G.MENSAJES)) assert.ok(G.MENSAJES[m].length > 20, m);
});

test("CORS: nada de Access-Control-Allow-Origin permisivo hacia fuera", () => {
  const abierto = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "x",
    "access-control-max-age": "600",
    "access-control-allow-private-network": "true",
    vary: "Origin",
  };
  assert.deepEqual(G.cabecerasCorsSeguras(abierto, LOCAL), { "content-type": "application/json", vary: "Origin" });
  assert.deepEqual(G.cabecerasCorsSeguras({ "access-control-allow-origin": "https://starseed-os.vercel.app", a: "1" }, LOCAL), { a: "1" });
  assert.deepEqual(G.cabecerasCorsSeguras({ "access-control-allow-origin": "null" }, LOCAL), {});
  // Si es exactamente el origen local, se queda (no abre nada a nadie más)… salvo Private Network.
  assert.deepEqual(G.cabecerasCorsSeguras({ "access-control-allow-origin": LOCAL, "access-control-allow-credentials": "true", "access-control-allow-private-network": "true" }, LOCAL), {
    "access-control-allow-origin": LOCAL,
    "access-control-allow-credentials": "true",
  });
  assert.deepEqual(G.cabecerasCorsSeguras(undefined, LOCAL), {});
});

test("el pase nunca sale hacia la web publicada: se quita de la cookie", () => {
  assert.equal(G.quitarCookie(`sb-a=1; ${COOKIE}; b=2`), "sb-a=1; b=2");
  assert.equal(G.quitarCookie(COOKIE), undefined);
  assert.equal(G.quitarCookie(`${COOKIE};${COOKIE}`), undefined);
  assert.equal(G.quitarCookie(`${G.NOMBRE_COOKIE}2=x; a=1`), `${G.NOMBRE_COOKIE}2=x; a=1`);
  assert.equal(G.quitarCookie("a=1;  b=2 ;"), "a=1; b=2");
  assert.equal(G.quitarCookie(undefined), undefined);
});

test("Next interno: solo con el testigo del envoltorio o con la cookie del pase", () => {
  const testigo = "t".repeat(64);
  assert.equal(G.permiteInterna({ [G.CABECERA_INTERNA]: testigo }, testigo, PASE), true);
  assert.equal(G.permiteInterna({ cookie: COOKIE }, testigo, PASE), true); // redirección tras una server action
  assert.equal(G.permiteInterna({}, testigo, PASE), false);
  assert.equal(G.permiteInterna({ [G.CABECERA_INTERNA]: testigo + "x" }, testigo, PASE), false);
  assert.equal(G.permiteInterna({ [G.CABECERA_INTERNA]: "" }, "", PASE), false);
  assert.equal(G.permiteInterna({ [G.CABECERA_INTERNA]: "corto" }, "corto", ""), false);
  assert.equal(G.permiteInterna({ cookie: `${G.NOMBRE_COOKIE}=${OTRO}` }, testigo, PASE), false);
  assert.equal(G.permiteInterna({ cookie: COOKIE }, testigo, ""), false);
  assert.equal(G.permiteInterna({ host: "evil.example:1234", origin: "https://evil.example" }, testigo, PASE), false);
});

test("el pase llega por la entrada estándar como «pase:<hex>»", () => {
  assert.equal(G.lineaPase(`pase:${PASE}`), PASE);
  assert.equal(G.lineaPase(`pase:${PASE}\r`), PASE);
  for (const l of ["", "pase:", `pase:${PASE.toUpperCase()}`, "pase:abc", `PASE:${PASE}`, ` pase:${PASE}`, `pase:${PASE} x`, `pase:${"a".repeat(130)}`, undefined]) {
    assert.equal(G.lineaPase(l), null, String(l));
  }
  assert.equal(G.paseValido(PASE), true);
  assert.equal(G.paseValido("a".repeat(31)), false);
  assert.equal(G.paseValido("a".repeat(129)), false);
});
