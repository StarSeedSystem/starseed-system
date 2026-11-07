/*
 * StarSeed OS — lógica PURA del service worker (SW1107A · 2026-11-07)
 * ----------------------------------------------------------------------------
 * Todo lo que decide el service worker sin tocar red ni cachés: qué es cada petición, qué se
 * guarda, qué nunca se guarda, qué se precarga y en qué orden, cuándo se puede precargar y qué
 * cachés sobran. `public/sw-v8.js` la carga con `importScripts("/sw-logica.js")` y las pruebas
 * con `require` (src/lib/pwa/__tests__/sw-logica.test.ts). Sin dependencias, sin `fetch`, sin
 * `caches`, sin reloj: quien llama pasa la hora. Contrato: architecture/apps-autonomas-sin-internet.md §9.1.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (raiz) raiz.StarSeedSW = api;
})(typeof self !== "undefined" ? self : undefined, function () {
  "use strict";

  // ── Constantes (las usan el SW, el generador del manifiesto y las pruebas) ──
  var FORMATO_MANIFIESTO = 1;
  var URL_MANIFIESTO = "/precarga.json";
  var URL_SIN_CONEXION = "/offline.html";
  var PREFIJO_BUILD = "starseed-build-";
  var CACHE_API = "starseed-api-v1";
  var CACHE_META = "starseed-meta-v1";
  var CLAVE_ESTADO = "/__starseed/sw-precarga-estado";
  var MARCA_RSC = "__ss_rsc";
  var MAX_API = 150;
  var MAX_BYTES_API = 1000000; // 1 MB por respuesta de API guardada
  var MAX_RUNTIME = 600; // entradas de la caché de ejecución
  var CONCURRENCIA = 3;
  var TOPE_RUN_MS = 4 * 60 * 1000; // Chrome corta un evento a los 5 min: cada pasada se para antes
  var ESPERA_COMPLETO_MS = 30 * 60 * 1000; // con todo guardado, como mucho una comprobación cada 30 min
  var ESPERA_INCOMPLETO_MS = 2 * 60 * 1000; // a medias, se sigue a los 2 min
  var TOPE_NAVEGACION_MS = 10000; // red lenta («lie-fi»): a los 10 s, la copia guardada si la hay
  var MARGEN_ESPACIO = 1.25; // la precarga usa como mucho libre/1,25 …
  var RESERVA_BYTES = 50 * 1000 * 1000; // … menos 50 MB que se dejan siempre libres
  var BYTES_RUTA_POR_DEFECTO = 600000; // HTML + RSC de una página sin medida (mediana medida: ≈ 0,5 MB cada uno)

  /** Rutas que NUNCA se precargan: consolas de desarrollo (Mac y A1) y páginas de prueba. */
  var RUTAS_EXCLUIDAS = ["/genesis", "/metagenesis", "/poligenesis", "/_not-found", "/components-test", "/liquid-demo"];

  /** Orden de la precarga: lo que más se abre sin red va primero (el resto, en el orden del manifiesto). */
  var RUTAS_PRIORIDAD = [
    "/", "/escritorios", "/dashboard", "/inicio", "/login", "/bienvenida", "/settings", "/red-mesh",
    "/senales", "/conexiones", "/messages", "/protomolecula", "/documentos", "/cerebro", "/cerebros",
    "/memorias", "/aurora", "/voces", "/sincronizacion", "/crear", "/recordatorios", "/galeria",
  ];

  /** Archivos que el SW deja pasar sin tocar (deben salir siempre de la red). */
  var NUNCA_SW = ["/sw-v8.js", "/sw-v7.js", "/sw-logica.js", "/version.json", URL_MANIFIESTO];

  // ── API: qué GET de /api/* puede servirse de la última respuesta buena sin red ──
  // LISTA BLANCA revisada a mano (2026-11-07): solo catálogos públicos, iguales para todos. Se revisaron
  // las 112 rutas GET de src/app/api: de las 8 que no caían en la lista negra de abajo, 5 eran de sesión,
  // de esta neurona o estados en vivo (artcraft, astraura/automejora, astraura/nodos, avatares/externo,
  // network/openwisp). Por eso una ruta NUEVA nunca se guarda hasta que alguien la añade aquí (y la
  // prueba src/lib/pwa/__tests__/sw-logica.test.ts recorre las rutas reales para comprobarlo).
  var API_RESPALDO_PERMITIDAS = ["/api/os/versiones", "/api/library/actualizaciones", "/api/github-repo"];
  // Y aun en la lista blanca, segunda barrera: lista NEGRA por prefijo (secciones con sesión, claves,
  // consolas o proxys) …
  var API_PREFIJOS_NUNCA = [
    "/api/auth", "/api/mando", "/api/genesis", "/api/metagenesis", "/api/mcp", "/api/mail", "/api/telegram",
    "/api/storage", "/api/dispositivo", "/api/externos", "/api/vinculo", "/api/llamadas", "/api/integrations",
    "/api/neurons", "/api/neuronas", "/api/agentharness", "/api/agent-reach", "/api/ai", "/api/voz",
    "/api/voz-local", "/api/voz-rt", "/api/memorias", "/api/conocimiento", "/api/csp-report", "/api/3d",
    "/api/huggingbay", "/api/conversion", "/api/bots", "/api/moderacion", "/api/publish-item", "/api/artcraft",
    "/api/astraura", "/api/avatares", "/api/network",
  ];
  // … por palabra en cualquier tramo de la ruta (datos de sesión, secretos, o estados en vivo que, servidos
  // viejos, mentirían: «salud», «estado», «detectar»…) …
  var API_PALABRAS_NUNCA = [
    "auth", "login", "logout", "oauth", "callback", "token", "tokens", "sesion", "sesiones", "session", "sessions",
    "cuenta", "cuentas", "account", "accounts", "clave", "claves", "key", "keys", "secret", "secrets", "secreto",
    "secretos", "password", "contrasena", "credencial", "credenciales", "firma", "sign", "signed", "privado",
    "privada", "private", "mensaje", "mensajes", "chat", "chats", "correo", "correos", "mail", "cartera", "wallet",
    "pago", "pagos", "payment", "payments", "perfil", "profile", "usuario", "usuarios", "user", "users", "me", "yo",
    "contactos", "notificaciones", "notifications", "salud", "health", "estado", "status", "latido", "heartbeat",
    "ping", "detectar", "live", "vivo", "ice", "turn", "webhook", "webhooks", "stream", "sse", "upload", "subir",
    "proxy", "bridge", "puente", "admin",
  ];
  // … y por parámetro de consulta (un enlace firmado o con un código nunca se guarda).
  var API_PARAMETROS_NUNCA = [
    "token", "access_token", "refresh_token", "id_token", "key", "apikey", "api_key", "code", "secret", "password",
    "sig", "signature", "auth", "session", "sesion", "email", "correo",
  ];

  // ── Utilidades ─────────────────────────────────────────────────────────────
  function cabecera(cabeceras, nombre) {
    if (!cabeceras) return null;
    if (typeof cabeceras.get === "function") return cabeceras.get(nombre);
    var minus = String(nombre).toLowerCase();
    for (var k in cabeceras) {
      if (Object.prototype.hasOwnProperty.call(cabeceras, k) && k.toLowerCase() === minus) return cabeceras[k];
    }
    return null;
  }

  function aUrl(url, base) {
    try {
      return new URL(String(url), base || "http://starseed.invalid");
    } catch (_) {
      return null;
    }
  }

  /** Ruta canónica: empieza por «/», sin barras dobles ni barra final (salvo «/»). */
  function normalizarRuta(ruta) {
    var r = String(ruta == null ? "/" : ruta).split("?")[0].split("#")[0];
    if (r.charAt(0) !== "/") r = "/" + r;
    r = r.replace(/\/{2,}/g, "/");
    if (r.length > 1 && r.charAt(r.length - 1) === "/") r = r.slice(0, -1);
    return r;
  }

  function empiezaPorTramo(ruta, prefijo) {
    return ruta === prefijo || ruta.indexOf(prefijo + "/") === 0;
  }

  /** ¿Esta ruta de página queda fuera de la precarga? (parámetros, consolas, API, recursos). */
  function rutaExcluida(ruta) {
    var r = normalizarRuta(ruta);
    if (r.indexOf("[") !== -1 || r.indexOf("]") !== -1) return true;
    if (r.indexOf("..") !== -1) return true;
    if (empiezaPorTramo(r, "/api") || empiezaPorTramo(r, "/_next") || empiezaPorTramo(r, "/auth")) return true;
    for (var i = 0; i < RUTAS_EXCLUIDAS.length; i++) {
      if (empiezaPorTramo(r, RUTAS_EXCLUIDAS[i])) return true;
    }
    return false;
  }

  function esLoopback(host) {
    var h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
    if (/\.localhost$/.test(h)) return true;
    return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
  }

  function esEstaticoNext(pathname) {
    return String(pathname).indexOf("/_next/static/") === 0;
  }

  /** Medios de `public/` (imágenes, fuentes, audio, vídeo): primero la caché, como hasta hoy. */
  function esMedioPublico(pathname) {
    return /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|mp3|wav|ogg|mp4|webm)$/i.test(String(pathname));
  }

  function esPeticionRsc(url, cabeceras) {
    if (String(cabeceras && cabecera(cabeceras, "rsc")) === "1") return true;
    var u = aUrl(url);
    return !!(u && u.searchParams.has("_rsc"));
  }

  function esPrefetchSegmento(cabeceras) {
    return cabecera(cabeceras, "next-router-segment-prefetch") != null;
  }

  /**
   * Qué es una petición: 'ignorar' (pasa sin tocar) | 'navegacion' | 'rsc' | 'estatico' | 'medio' | 'api' | 'otro'.
   * @param {{metodo:string,url:string,origen:string,modo?:string,cabeceras?:any}} p
   */
  function clasificarPeticion(p) {
    if (!p || String(p.metodo || "GET").toUpperCase() !== "GET") return "ignorar";
    var u = aUrl(p.url);
    if (!u || u.origin !== p.origen) return "ignorar";
    if (cabecera(p.cabeceras, "range") != null) return "ignorar"; // audio/vídeo por tramos: directo a la red
    var ruta = u.pathname;
    if (NUNCA_SW.indexOf(ruta) !== -1) return "ignorar";
    if (empiezaPorTramo(ruta, "/__starseed") || empiezaPorTramo(ruta, "/auth")) return "ignorar";
    if (ruta.indexOf("/_next/webpack-hmr") === 0) return "ignorar";
    // Una API abierta como página (vueltas de OAuth, descargas): directa, con sus redirecciones.
    if (empiezaPorTramo(ruta, "/api")) return p.modo === "navigate" ? "ignorar" : "api";
    if (p.modo === "navigate") return "navegacion";
    if (esPeticionRsc(p.url, p.cabeceras)) return "rsc";
    if (String(cabecera(p.cabeceras, "accept") || "").indexOf("text/html") !== -1) return "navegacion";
    if (esEstaticoNext(ruta)) return "estatico";
    if (esMedioPublico(ruta)) return "medio";
    return "otro";
  }

  /** Clave de la página en la caché de una build: origen + ruta canónica (sin consulta). */
  function claveHtml(origen, ruta) {
    return String(origen) + normalizarRuta(ruta);
  }

  /**
   * Clave de la carga RSC COMPLETA (desde la raíz) de una ruta. Sin `_rsc` (cambia con el árbol del
   * cliente) y con la marca propia, para que nunca choque con una URL real.
   */
  function claveRsc(url, conConsulta) {
    var u = aUrl(url);
    if (!u) return null;
    var extra = [];
    if (conConsulta !== false) {
      u.searchParams.forEach(function (v, k) {
        if (k !== "_rsc" && k !== MARCA_RSC) extra.push([k, v]);
      });
      extra.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
    }
    var q = MARCA_RSC + "=1";
    for (var i = 0; i < extra.length; i++) q += "&" + encodeURIComponent(extra[i][0]) + "=" + encodeURIComponent(extra[i][1]);
    return u.origin + normalizarRuta(u.pathname) + "?" + q;
  }

  // ── API ────────────────────────────────────────────────────────────────────
  /**
   * 'respaldo' = red primero y, SIN RED, la última respuesta buena; 'red' = nunca se guarda.
   * @param {{url:string, cabeceras?:any}} p
   */
  function politicaApi(p) {
    var u = aUrl(p && p.url);
    if (!u) return "red";
    var ruta = normalizarRuta(u.pathname).toLowerCase();
    if (!empiezaPorTramo(ruta, "/api")) return "red";
    var permitida = false;
    for (var a = 0; a < API_RESPALDO_PERMITIDAS.length; a++) {
      if (empiezaPorTramo(ruta, API_RESPALDO_PERMITIDAS[a])) permitida = true;
    }
    if (!permitida) return "red";
    for (var i = 0; i < API_PREFIJOS_NUNCA.length; i++) {
      if (empiezaPorTramo(ruta, API_PREFIJOS_NUNCA[i])) return "red";
    }
    var tramos = ruta.split("/");
    for (var j = 0; j < tramos.length; j++) {
      var t = tramos[j];
      if (!t) continue;
      if (API_PALABRAS_NUNCA.indexOf(t) !== -1) return "red";
      // «oauth-callback», «session_id», «api-keys»…: también por trozos
      var trozos = t.split(/[-_.]/);
      for (var k = 0; k < trozos.length; k++) {
        if (trozos[k] && API_PALABRAS_NUNCA.indexOf(trozos[k]) !== -1) return "red";
      }
    }
    var parametroPeligroso = false;
    u.searchParams.forEach(function (_v, clave) {
      if (API_PARAMETROS_NUNCA.indexOf(String(clave).toLowerCase()) !== -1) parametroPeligroso = true;
    });
    if (parametroPeligroso) return "red";
    var cab = p.cabeceras;
    if (cabecera(cab, "authorization") != null) return "red";
    if (cabecera(cab, "range") != null) return "red";
    if (String(cabecera(cab, "accept") || "").indexOf("text/event-stream") !== -1) return "red";
    return "respaldo";
  }

  /**
   * ¿Se puede guardar esta respuesta de API? Solo 200, JSON o texto, sin `no-store` y ≤ 1 MB.
   * @param {{estado:number, tipo?:string|null, cacheControl?:string|null, longitud?:string|number|null, redirigida?:boolean}} r
   */
  function respuestaApiGuardable(r) {
    if (!r || r.estado !== 200 || r.redirigida) return false;
    var tipo = String(r.tipo || "").toLowerCase();
    if (!/^(application\/(?:[\w.+-]*\+)?json|text\/plain)/.test(tipo)) return false;
    if (/(^|[\s,])no-store($|[\s,;])/i.test(String(r.cacheControl || ""))) return false;
    if (r.longitud != null && r.longitud !== "") {
      var n = Number(r.longitud);
      if (!isFinite(n) || n > MAX_BYTES_API) return false;
    }
    return true;
  }

  /** HTML de una página: 200, `text/html`, sin redirección (una navegación no acepta respuestas redirigidas). */
  function respuestaHtmlGuardable(r) {
    return !!r && r.estado === 200 && !r.redirigida && /^text\/html/i.test(String(r.tipo || ""));
  }

  /** Con red, pero la pasarela no contesta (502/503/504): una página se sirve de la copia guardada si la hay. */
  function esFalloDePasarela(estado) {
    return estado === 502 || estado === 503 || estado === 504;
  }

  /** Carga RSC: 200, `text/x-component`, sin redirección. */
  function respuestaRscGuardable(r) {
    return !!r && r.estado === 200 && !r.redirigida && /^text\/x-component/i.test(String(r.tipo || ""));
  }

  /**
   * Resultado de bajar un elemento de la precarga: 'guardar' | 'permanente' (no se reintenta en esta
   * build: 4xx, redirección, tipo inesperado) | 'transitorio' (red caída o 5xx/429: se reintenta).
   * @param {{errorRed?:boolean, estado?:number, tipo?:string|null, redirigida?:boolean, opaca?:boolean}} r
   * @param {'estatico'|'publico'|'html'|'rsc'} clase
   */
  function clasificarResultado(r, clase) {
    if (!r || r.errorRed) return "transitorio";
    if (r.opaca || r.redirigida || r.estado === 0) return "permanente";
    if (r.estado === 429 || r.estado === 408 || r.estado >= 500) return "transitorio";
    if (r.estado !== 200) return "permanente";
    if (clase === "html") return respuestaHtmlGuardable({ estado: 200, tipo: r.tipo }) ? "guardar" : "permanente";
    if (clase === "rsc") return respuestaRscGuardable({ estado: 200, tipo: r.tipo }) ? "guardar" : "permanente";
    return "guardar";
  }

  // ── Manifiesto de precarga (lo escribe scripts/precarga-sw.mjs en el build) ──
  function esListaDeNumeros(x) {
    if (!Array.isArray(x)) return false;
    for (var i = 0; i < x.length; i++) if (typeof x[i] !== "number" || !isFinite(x[i]) || x[i] < 0) return false;
    return true;
  }

  /**
   * URL de un archivo del mismo origen, ya codificada como la pide el navegador (Next codifica cada
   * tramo con encodeURIComponent: «[slug]» → «%5Bslug%5D»). Sin consulta, sin tramos vacíos, «.» ni «..».
   */
  function urlSegura(u, prefijo) {
    if (typeof u !== "string" || u.indexOf(prefijo) !== 0 || u.length >= 512) return false;
    if (/[?#\s\\]/.test(u)) return false;
    var tramos = u.split("/");
    for (var i = 1; i < tramos.length; i++) {
      var t;
      try {
        t = decodeURIComponent(tramos[i]);
      } catch (_) {
        return false;
      }
      if (t === "" || t === "." || t === ".." || t.indexOf("/") !== -1 || t.indexOf("\\") !== -1) return false;
    }
    return true;
  }

  /**
   * Valida y normaliza el manifiesto. Devuelve null si no se puede usar (nunca lanza).
   * Forma: {formato:1, buildId, generado, estaticos:[url], tamanos:[n], comunes:[i],
   *         rutas:[{r, e:0|1, c:[i], b}], publicos:[url], tamanosPublicos:[n]}
   */
  function validarManifiesto(m) {
    try {
      if (!m || typeof m !== "object" || m.formato !== FORMATO_MANIFIESTO) return null;
      if (typeof m.buildId !== "string" || !/^[\w-]{1,64}$/.test(m.buildId)) return null;
      if (!Array.isArray(m.estaticos) || !Array.isArray(m.rutas)) return null;
      var estaticos = [];
      var tamanos = [];
      var malos = {};
      for (var i = 0; i < m.estaticos.length; i++) {
        var u = m.estaticos[i];
        if (!urlSegura(u, "/_next/static/")) { malos[i] = true; continue; }
        malos[i] = false;
        estaticos.push(u);
        var t = Array.isArray(m.tamanos) ? m.tamanos[i] : 0;
        tamanos.push(typeof t === "number" && isFinite(t) && t >= 0 ? t : 0);
      }
      // Índices viejos → nuevos (por si se cayó alguna URL mala).
      var mapa = [];
      var n = 0;
      for (var j = 0; j < m.estaticos.length; j++) mapa.push(malos[j] ? -1 : n++);
      function reindexar(lista) {
        var out = [];
        if (!esListaDeNumeros(lista)) return out;
        for (var x = 0; x < lista.length; x++) {
          var v = mapa[lista[x]];
          if (typeof v === "number" && v >= 0 && out.indexOf(v) === -1) out.push(v);
        }
        return out;
      }
      var rutas = [];
      var vistas = {};
      for (var k = 0; k < m.rutas.length; k++) {
        var it = m.rutas[k];
        if (!it || typeof it.r !== "string") continue;
        var ruta = normalizarRuta(it.r);
        if (rutaExcluida(ruta) || vistas[ruta]) continue;
        vistas[ruta] = true;
        rutas.push({
          r: ruta,
          e: it.e ? 1 : 0,
          c: reindexar(it.c),
          b: typeof it.b === "number" && isFinite(it.b) && it.b > 0 ? it.b : BYTES_RUTA_POR_DEFECTO,
        });
      }
      var publicos = [];
      var tamanosPublicos = [];
      if (Array.isArray(m.publicos)) {
        for (var p = 0; p < m.publicos.length; p++) {
          var up = m.publicos[p];
          if (!urlSegura(up, "/") || empiezaPorTramo(up, "/api") || empiezaPorTramo(up, "/_next") || NUNCA_SW.indexOf(up) !== -1) continue;
          publicos.push(up);
          var tp = Array.isArray(m.tamanosPublicos) ? m.tamanosPublicos[p] : 0;
          tamanosPublicos.push(typeof tp === "number" && isFinite(tp) && tp >= 0 ? tp : 0);
        }
      }
      return {
        formato: FORMATO_MANIFIESTO,
        buildId: m.buildId,
        generado: typeof m.generado === "string" ? m.generado : null,
        estaticos: estaticos,
        tamanos: tamanos,
        comunes: reindexar(m.comunes),
        rutas: rutas,
        publicos: publicos,
        tamanosPublicos: tamanosPublicos,
      };
    } catch (_) {
      return null;
    }
  }

  /** Rutas en orden de precarga: primero las de RUTAS_PRIORIDAD (en ese orden), luego el resto. */
  function ordenarRutas(rutas) {
    var lista = (rutas || []).slice();
    return lista
      .map(function (x, i) { return { x: x, i: i, p: RUTAS_PRIORIDAD.indexOf(normalizarRuta(x.r)) }; })
      .sort(function (a, b) {
        var pa = a.p === -1 ? Infinity : a.p;
        var pb = b.p === -1 ? Infinity : b.p;
        return pa !== pb ? pa - pb : a.i - b.i;
      })
      .map(function (o) { return o.x; });
  }

  /**
   * Plan de precarga: elementos en orden y hasta dónde caben. Por BLOQUES, para que lo guardado
   * siempre sirva: bloque 0 = página sin conexión + código común; luego, por cada ruta (en orden de
   * prioridad), sus chunks iniciales + su HTML + su carga RSC; al final, el resto de estáticos
   * (chunks perezosos, fuentes) y los archivos de `public/`. Se corta en el primer bloque que no cabe.
   * @param {{manifiesto:any, origen:string, libres?:number|null}} p  libres = bytes que se pueden usar (null = sin medida)
   * @returns {{nivel:'completo'|'parcial'|'nada', elementos:Array<{clase:string,url:string,clave:string,ruta?:string,bytes:number}>, bytes:number, bytesTotales:number, rutas:number, rutasTotales:number}}
   */
  function planificarPrecarga(p) {
    var m = p.manifiesto;
    var origen = String(p.origen);
    var puestos = {};
    var bloques = [];
    function nuevoBloque(ruta) {
      var b = { ruta: ruta || null, elementos: [], bytes: 0 };
      bloques.push(b);
      return b;
    }
    function meter(b, el) {
      b.elementos.push(el);
      b.bytes += el.bytes;
    }
    function estatico(b, i) {
      var url = m.estaticos[i];
      if (url == null || puestos[url]) return;
      puestos[url] = true;
      meter(b, { clase: "estatico", url: url, clave: origen + url, bytes: m.tamanos[i] || 0 });
    }
    var cero = nuevoBloque(null);
    puestos[URL_SIN_CONEXION] = true;
    meter(cero, { clase: "publico", url: URL_SIN_CONEXION, clave: origen + URL_SIN_CONEXION, bytes: 8000 });
    for (var c = 0; c < m.comunes.length; c++) estatico(cero, m.comunes[c]);
    var rutas = ordenarRutas(m.rutas);
    for (var r = 0; r < rutas.length; r++) {
      var it = rutas[r];
      var b = nuevoBloque(it.r);
      for (var k = 0; k < it.c.length; k++) estatico(b, it.c[k]);
      var mitad = Math.round(it.b / 2);
      meter(b, { clase: "html", url: it.r, clave: claveHtml(origen, it.r), ruta: it.r, bytes: mitad });
      meter(b, { clase: "rsc", url: it.r, clave: claveRsc(origen + it.r, false), ruta: it.r, bytes: it.b - mitad });
    }
    for (var s = 0; s < m.estaticos.length; s++) {
      if (puestos[m.estaticos[s]]) continue;
      var bs = nuevoBloque(null);
      estatico(bs, s);
    }
    for (var q = 0; q < m.publicos.length; q++) {
      var up = m.publicos[q];
      if (puestos[up]) continue;
      puestos[up] = true;
      var bp = nuevoBloque(null);
      meter(bp, { clase: "publico", url: up, clave: origen + up, bytes: m.tamanosPublicos[q] || 0 });
    }
    var bytesTotales = 0;
    for (var t = 0; t < bloques.length; t++) bytesTotales += bloques[t].bytes;
    var limite = p.libres == null || !isFinite(p.libres) ? Infinity : Math.max(0, p.libres / MARGEN_ESPACIO - RESERVA_BYTES);
    var elementos = [];
    var usados = 0;
    var rutasDentro = 0;
    var todos = true;
    for (var x = 0; x < bloques.length; x++) {
      if (usados + bloques[x].bytes > limite) { todos = false; break; }
      usados += bloques[x].bytes;
      if (bloques[x].ruta) rutasDentro++;
      for (var y = 0; y < bloques[x].elementos.length; y++) elementos.push(bloques[x].elementos[y]);
    }
    if (!todos && rutasDentro === 0) {
      return { nivel: "nada", elementos: [], bytes: 0, bytesTotales: bytesTotales, rutas: 0, rutasTotales: rutas.length };
    }
    return {
      nivel: todos ? "completo" : "parcial",
      elementos: elementos,
      bytes: usados,
      bytesTotales: bytesTotales,
      rutas: rutasDentro,
      rutasTotales: rutas.length,
    };
  }

  var ESPERA_MINIMA_MS = 60 * 1000;

  /**
   * ¿Se puede empezar una pasada de precarga ahora? Sin red, nunca. Pedida a mano («forzar»), sí.
   * Si no: nunca en el servidor local de la app de escritorio (127.0.0.1: ya lo tiene todo), ni con
   * ahorro de datos, ni con datos móviles, ni con 2G, ni dos veces en el mismo minuto.
   * @param {{host:string, enLinea?:boolean|null, ahorroDatos?:boolean|null, tipoConexion?:string|null,
   *          efectiva?:string|null, forzar?:boolean, ahora:number, ultimoIntento?:number|null}} p
   * @returns {{si:boolean, motivo:string}}
   */
  function debePrecargar(p) {
    if (!p || p.enLinea === false) return { si: false, motivo: "sin-red" };
    var tipo = String(p.tipoConexion || "").toLowerCase();
    if (tipo === "none") return { si: false, motivo: "sin-red" };
    if (p.forzar) return { si: true, motivo: "pedida" };
    if (esLoopback(p.host)) return { si: false, motivo: "servidor-local" };
    if (p.ahorroDatos) return { si: false, motivo: "ahorro-de-datos" };
    if (tipo === "cellular" || tipo === "bluetooth") return { si: false, motivo: "datos-moviles" };
    var ef = String(p.efectiva || "").toLowerCase();
    if (ef === "slow-2g" || ef === "2g") return { si: false, motivo: "red-lenta" };
    if (typeof p.ultimoIntento === "number" && isFinite(p.ultimoIntento) && p.ahora >= p.ultimoIntento &&
        p.ahora - p.ultimoIntento < ESPERA_MINIMA_MS) {
      return { si: false, motivo: "reciente" };
    }
    return { si: true, motivo: "ok" };
  }

  /**
   * Con el manifiesto ya leído: ¿hace falta recorrer la lista? Build nueva → sí. Misma build completa →
   * cada 30 min (comprueba que nada se haya borrado). A medias → a los 2 min.
   * @param {{buildId:string, estado?:any, ahora:number, forzar?:boolean}} p
   */
  function hayQueRecorrer(p) {
    if (p.forzar) return true;
    var e = p.estado;
    if (!e || e.buildId !== p.buildId || typeof e.terminado !== "number") return true;
    var espera = e.completo ? ESPERA_COMPLETO_MS : ESPERA_INCOMPLETO_MS;
    return !(p.ahora >= e.terminado && p.ahora - e.terminado < espera);
  }

  // ── Cachés: cuáles sobran y en qué orden se buscan ─────────────────────────
  function nombreBuild(buildId) {
    return PREFIJO_BUILD + buildId;
  }

  function idDeBuild(nombre) {
    return String(nombre).indexOf(PREFIJO_BUILD) === 0 ? String(nombre).slice(PREFIJO_BUILD.length) : null;
  }

  /**
   * Cachés de StarSeed que sobran al activar un SW nuevo: las de versiones anteriores del SW. Se quedan
   * las actuales, la de API, la de estado y TODAS las de builds (esas se retiran cuando otra build
   * termina de precargarse, con buildsSobrantes).
   */
  function cachesSobrantes(nombres, actuales) {
    var quedan = [actuales && actuales.precache, actuales && actuales.runtime, CACHE_API, CACHE_META];
    return (nombres || []).filter(function (n) {
      n = String(n);
      if (n.indexOf("starseed-") !== 0) return false; // cachés ajenas (modelos de IA, pesos…): no se tocan
      if (n.indexOf(PREFIJO_BUILD) === 0) return false;
      return quedan.indexOf(n) === -1;
    });
  }

  /** Cachés de builds que se pueden borrar cuando `buildCompleto` ya está entera. */
  function buildsSobrantes(nombres, buildCompleto) {
    var queda = nombreBuild(buildCompleto);
    return (nombres || []).filter(function (n) {
      return String(n).indexOf(PREFIJO_BUILD) === 0 && n !== queda;
    });
  }

  /**
   * Orden en que se buscan las páginas sin red: primero las builds COMPLETAS (la más nueva antes), luego
   * las incompletas (la más nueva antes). «Más nueva» = la creada después (caches.keys() va en orden de creación).
   */
  function ordenBuilds(nombres, completos) {
    var lista = (nombres || []).filter(function (n) { return String(n).indexOf(PREFIJO_BUILD) === 0; });
    var ok = completos || [];
    var llenas = [];
    var otras = [];
    for (var i = lista.length - 1; i >= 0; i--) {
      if (ok.indexOf(idDeBuild(lista[i])) !== -1) llenas.push(lista[i]);
      else otras.push(lista[i]);
    }
    return llenas.concat(otras);
  }

  /**
   * ¿Es una entrada con datos de la sesión? (se borra al cerrar sesión). API, y páginas o cargas RSC
   * que no son estáticas (las SSG son iguales para todos). Recursos y medios no.
   * @param {string} url
   * @param {string[]} rutasEstaticas
   */
  function esEntradaPersonal(url, rutasEstaticas) {
    var u = aUrl(url);
    if (!u) return false;
    var ruta = normalizarRuta(u.pathname);
    if (empiezaPorTramo(ruta, "/api")) return true;
    if (esEstaticoNext(ruta) || esMedioPublico(ruta) || ruta === URL_SIN_CONEXION) return false;
    var esRsc = u.searchParams.has(MARCA_RSC);
    if (!esRsc && /\.[a-z0-9]{1,16}$/i.test(ruta)) return false; // manifest.webmanifest, *.json públicos…
    return (rutasEstaticas || []).indexOf(ruta) === -1;
  }

  /** Cuántas entradas (las más viejas) hay que quitar para quedarse en `max`. */
  function recortes(n, max) {
    return Math.max(0, (n | 0) - (max | 0));
  }

  /** Lo que se cuenta a la página (sin listas largas). */
  function resumenEstado(e) {
    if (!e || typeof e !== "object") return null;
    return {
      buildId: e.buildId || null,
      fase: e.fase || null,
      nivel: e.nivel || null,
      completo: !!e.completo,
      guardados: e.guardados | 0,
      planificados: e.planificados | 0,
      permanentes: e.permanentes | 0,
      transitorios: e.transitorios | 0,
      rutas: e.rutas | 0,
      rutasTotales: e.rutasTotales | 0,
      bytes: typeof e.bytes === "number" ? e.bytes : 0,
      motivo: e.motivo || null,
      terminado: typeof e.terminado === "number" ? e.terminado : null,
    };
  }

  return {
    FORMATO_MANIFIESTO: FORMATO_MANIFIESTO,
    URL_MANIFIESTO: URL_MANIFIESTO,
    URL_SIN_CONEXION: URL_SIN_CONEXION,
    PREFIJO_BUILD: PREFIJO_BUILD,
    CACHE_API: CACHE_API,
    CACHE_META: CACHE_META,
    CLAVE_ESTADO: CLAVE_ESTADO,
    MARCA_RSC: MARCA_RSC,
    MAX_API: MAX_API,
    MAX_BYTES_API: MAX_BYTES_API,
    MAX_RUNTIME: MAX_RUNTIME,
    CONCURRENCIA: CONCURRENCIA,
    TOPE_RUN_MS: TOPE_RUN_MS,
    TOPE_NAVEGACION_MS: TOPE_NAVEGACION_MS,
    ESPERA_COMPLETO_MS: ESPERA_COMPLETO_MS,
    ESPERA_INCOMPLETO_MS: ESPERA_INCOMPLETO_MS,
    ESPERA_MINIMA_MS: ESPERA_MINIMA_MS,
    MARGEN_ESPACIO: MARGEN_ESPACIO,
    RESERVA_BYTES: RESERVA_BYTES,
    BYTES_RUTA_POR_DEFECTO: BYTES_RUTA_POR_DEFECTO,
    RUTAS_EXCLUIDAS: RUTAS_EXCLUIDAS.slice(),
    RUTAS_PRIORIDAD: RUTAS_PRIORIDAD.slice(),
    NUNCA_SW: NUNCA_SW.slice(),
    API_RESPALDO_PERMITIDAS: API_RESPALDO_PERMITIDAS.slice(),
    API_PREFIJOS_NUNCA: API_PREFIJOS_NUNCA.slice(),
    normalizarRuta: normalizarRuta,
    rutaExcluida: rutaExcluida,
    esLoopback: esLoopback,
    esEstaticoNext: esEstaticoNext,
    esMedioPublico: esMedioPublico,
    esPeticionRsc: esPeticionRsc,
    esPrefetchSegmento: esPrefetchSegmento,
    clasificarPeticion: clasificarPeticion,
    claveHtml: claveHtml,
    claveRsc: claveRsc,
    politicaApi: politicaApi,
    respuestaApiGuardable: respuestaApiGuardable,
    respuestaHtmlGuardable: respuestaHtmlGuardable,
    respuestaRscGuardable: respuestaRscGuardable,
    esFalloDePasarela: esFalloDePasarela,
    clasificarResultado: clasificarResultado,
    validarManifiesto: validarManifiesto,
    ordenarRutas: ordenarRutas,
    planificarPrecarga: planificarPrecarga,
    debePrecargar: debePrecargar,
    hayQueRecorrer: hayQueRecorrer,
    nombreBuild: nombreBuild,
    idDeBuild: idDeBuild,
    cachesSobrantes: cachesSobrantes,
    buildsSobrantes: buildsSobrantes,
    ordenBuilds: ordenBuilds,
    esEntradaPersonal: esEntradaPersonal,
    recortes: recortes,
    resumenEstado: resumenEstado,
  };
});
