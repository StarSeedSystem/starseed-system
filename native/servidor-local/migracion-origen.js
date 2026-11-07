/*
 * migracion-origen.js — llevar al servidor local los datos que la app tenía en la web publicada
 * (APP1107B · T4, 2026-11-07). Contrato: architecture/apps-autonomas-sin-internet.md §2.1.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Desde APP1107A la app de escritorio abre `http://127.0.0.1:<puerto>` en vez de
 * `https://starseed-os.vercel.app`. localStorage e IndexedDB son POR ORIGEN: lo que la persona tenía
 * guardado en el origen de la web (escritorios, widgets, ajustes, historiales, vínculos, mensajes de
 * la malla…) no se vería desde el origen nuevo. Este archivo lo trae, una sola vez y sin pérdidas:
 *
 *   1. EXPORTAR (ventana oculta de la app en el origen de la web; Rust inyecta este archivo como
 *      script de inicio, ANTES de que corra nada de la página): lee todo `localStorage` (menos la
 *      sesión de Supabase) y las bases de IndexedDB (con topes), y se lo pasa a Rust por IPC en
 *      trozos. El original NUNCA se toca.
 *   2. IMPORTAR (página `/__starseed/migracion` del servidor local, ANTES de abrir el OS: así ningún
 *      código de la app escribe valores por defecto antes de tiempo): pide los datos a Rust, fusiona
 *      sin pisar lo que ya exista en el origen local y deja un marcador para el aviso.
 *
 * Reglas de seguridad: la sesión de Supabase (`sb-…-auth-token`, cualquier valor con
 * `access_token` + `refresh_token`) NO se exporta: se vuelve a abrir en el origen local. Las claves
 * secretas o propias del dispositivo sí viajan (es la misma neurona), pero Rust no las escribe en
 * la copia de seguridad del disco (`secretas`).
 *
 * Un solo archivo, sin dependencias, sin sintaxis moderna que no entienda el WebKit de macOS 10.15
 * (nada de `?.` ni `??`). Lo cargan: Rust (`include_str!`, script de inicio de la ventana oculta),
 * el envoltorio del servidor local (`/__starseed/migracion-origen.js`) y las pruebas
 * (`src/lib/nativa/__tests__/migracion-origen.test.ts`, con `require`).
 */
(function (raiz, fabrica) {
  var m = fabrica();
  if (typeof module === "object" && module && module.exports) module.exports = m;
  else raiz.StarseedMigracionOrigen = m;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FORMATO = "starseed-migracion-origen";
  var VERSION = 1;
  var ORIGEN_WEB = "https://starseed-os.vercel.app";
  /** Marcador en el localStorage del origen LOCAL (lo lee el aviso de la web). Nunca viaja con la cuenta. */
  var CLAVE_MARCADOR = "starseed.migracion-origen.v1";
  var MiB = 1024 * 1024;
  var LIMITES = {
    /** Un registro de IndexedDB más grande que esto se queda en la versión anterior (y se dice). */
    registro: 16 * MiB,
    /** Tope de todo lo que se exporta de IndexedDB (codificado). */
    totalIdb: 64 * MiB,
    /** Tamaño de cada trozo por IPC (caracteres). */
    trozo: 1 * MiB,
    /** Profundidad máxima de un valor. */
    profundidad: 200,
  };
  /** Si `indexedDB.databases()` no existe (WebKit viejo), se miran al menos las de la app. */
  var BASES_CONOCIDAS = [
    "starseed-memory",
    "starseed-voice-notes",
    "starseed-experiencias",
    "starseed-archivos-malla",
    "starseed-mesh-par",
  ];
  /** Bases que no se traen nunca: sesión de terceros o cachés que se vuelven a bajar. */
  var BASES_SESION = /^(firebaseLocalStorageDb|firebase-.*|.*-auth-.*|.*session.*)$/i;
  var BASES_CACHE = /(^workbox-|cache|caché)/i;

  // ───────────────────────────── Qué claves ─────────────────────────────

  /**
   * Lo que NUNCA viaja a la copia del disco (sí a la app nueva: es la misma neurona). Copia de
   * `NEVER_SYNCED_KEYS` de src/lib/settings-sync.ts; una prueba comprueba que no se queda atrás.
   */
  var SECRETAS_EXACTAS = [
    "starseed.ai.providers", "starseed.ai.active", "starseed.ai.salt", "starseed.ai.verifier",
    "starseed.connectors.creds.v1", "starseed.aurora.wake.porcupine.key", "starseed.aurora.chats.v1",
    "starseed.media.prefs.v1", "starseed.nvidia.apikey", "starseed.voicebox.key.v1",
    "starseed.almacenamiento.tokens.v1", "starseed.almacenamiento.clientids.v1", "starseed.telegram.user.v1",
    "starseed.bloqueo.v1", "starseed.bloqueo.sesion.v1", "starseed.bloqueo.intentos.v1",
    "starseed.device.id", "starseed.device.id.v1", "starseed.device.self", "starseed.device.alias.v1",
    "starseed.neuron.device-id", "starseed.mesh.device-id.v1", "starseed.mesh.identity.v1",
    "starseed.mesh.master-identity.v1", "starseed.mesh.enc-identity.v1", "starseed.mesh.relay-key.v1",
    "starseed.mesh.relay-keyring.v1", "starseed.mesh.revocation-cert.v1",
    "starseed.aurora.leader.v1", "starseed.aurora.orb.hidden.v1", "starseed.aurora.greeted.session",
    "starseed.astraura.cooldown.v1", "starseed.astraura.usage.v1", "starseed.astraura.routes.v1",
    "starseed.astraura.huggingbay.cache.v1", "starseed.sync.realtime.v1", "starseed.sync.meta.v1",
  ];
  var SECRETAS_PREFIJOS = ["starseed.ai.key.", "starseed.connectors.cred", "starseed.integration."];
  /** Nombres que suenan a secreto (con separadores alrededor: «starseed» no es «seed»). */
  var PATRON_SECRETO =
    /(^|[._:\/-])(api-?key|apikey|key|keys|token|tokens|secret|secrets|secreto|password|passwd|contrasena|credential|credentials|creds?|bearer|salt|verifier|identity|identidad|keyring|llavero|private|privada|privado|clave|claves|mnemonic|seed|semilla|vault|boveda)([._:\/-]|$)/i;

  function esClaveDeSesion(clave) {
    var c = String(clave || "");
    return /^sb-.+-auth-token/i.test(c) || c === "supabase.auth.token" || /^supabase\.auth\./i.test(c);
  }

  /** Un valor con `access_token` y `refresh_token` es una sesión, se llame como se llame su clave. */
  function pareceSesion(valor) {
    if (typeof valor !== "string") return false;
    return valor.indexOf("refresh_token") !== -1 && valor.indexOf("access_token") !== -1;
  }

  /** "sesion" (no se exporta) | "secreto" (viaja, pero no a la copia del disco) | "normal". */
  function clasificarClave(clave, valor) {
    var c = String(clave || "");
    if (esClaveDeSesion(c) || pareceSesion(valor)) return "sesion";
    if (c === CLAVE_MARCADOR) return "sesion"; // el marcador es del origen local: nunca se trae
    if (SECRETAS_EXACTAS.indexOf(c) !== -1) return "secreto";
    for (var i = 0; i < SECRETAS_PREFIJOS.length; i++) if (c.indexOf(SECRETAS_PREFIJOS[i]) === 0) return "secreto";
    if (/^starseed\.brain\.[^.]+\.integration\./.test(c)) return "secreto";
    if (PATRON_SECRETO.test(c)) return "secreto";
    return "normal";
  }

  function clasificarBase(nombre) {
    if (BASES_SESION.test(nombre)) return "sesion";
    if (BASES_CACHE.test(nombre)) return "cache";
    return "normal";
  }

  // ───────────────────────────── Códec ─────────────────────────────
  // JSON no guarda Date, Blob, binarios, Map, Set, undefined… IndexedDB sí. Se etiquetan con «$ss».

  function NoSerializable(tipo) {
    var e = new Error("no se puede copiar: " + tipo);
    e.noSerializable = true;
    e.tipo = tipo;
    return e;
  }

  var TIPOS_BIN = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array",
    "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array", "DataView"];

  function aBase64(bytes) {
    var trozos = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      trozos.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(trozos.join(""));
  }

  function deBase64(b64) {
    var s = atob(String(b64 || ""));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function nombreClase(v) {
    var t = Object.prototype.toString.call(v); // "[object Blob]"
    return t.slice(8, -1);
  }

  function esBlob(v) {
    return typeof Blob !== "undefined" && v instanceof Blob;
  }

  function leerBlob(blob) {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, falla) {
      var fr = new FileReader();
      fr.onload = function () { ok(new Uint8Array(fr.result)); };
      fr.onerror = function () { falla(fr.error); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /** Tamaño aproximado (bytes) de un valor, para los topes, SIN codificarlo. */
  function tamanoAprox(v, prof) {
    prof = prof || 0;
    if (prof > LIMITES.profundidad) return 0;
    if (v === null || v === undefined) return 4;
    var t = typeof v;
    if (t === "string") return v.length * 2 + 2;
    if (t === "number" || t === "boolean" || t === "bigint") return 8;
    if (esBlob(v)) return Math.ceil(v.size * 4 / 3) + 64;
    if (v instanceof ArrayBuffer) return Math.ceil(v.byteLength * 4 / 3) + 32;
    if (ArrayBuffer.isView(v)) return Math.ceil(v.byteLength * 4 / 3) + 32;
    if (v instanceof Date || v instanceof RegExp) return 32;
    var total = 2;
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) total += tamanoAprox(v[i], prof + 1) + 1;
      return total;
    }
    if (typeof Map !== "undefined" && v instanceof Map) {
      v.forEach(function (x, k) { total += tamanoAprox(k, prof + 1) + tamanoAprox(x, prof + 1) + 2; });
      return total;
    }
    if (typeof Set !== "undefined" && v instanceof Set) {
      v.forEach(function (x) { total += tamanoAprox(x, prof + 1) + 1; });
      return total;
    }
    for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) total += k.length * 2 + tamanoAprox(v[k], prof + 1) + 2;
    return total;
  }

  /**
   * Codifica un valor de IndexedDB a JSON. Async (los Blob se leen). Lanza NoSerializable.
   * El recorrido es SÍNCRONO (solo la lectura de los Blob espera), así que `pila` es la pila real de
   * la recursión: detecta ciclos sin confundirlos con un mismo objeto referenciado dos veces.
   */
  function codificar(v) {
    var pila = [];
    function ir(x, prof) {
      try {
        return irSinCapturar(x, prof);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    function irSinCapturar(x, prof) {
      if (prof > LIMITES.profundidad) return Promise.reject(NoSerializable("demasiado profundo"));
      if (x === null) return Promise.resolve(null);
      var t = typeof x;
      if (t === "undefined") return Promise.resolve({ $ss: "indef" });
      if (t === "string" || t === "boolean") return Promise.resolve(x);
      if (t === "number") {
        if (x !== x) return Promise.resolve({ $ss: "num", v: "NaN" });
        if (x === Infinity) return Promise.resolve({ $ss: "num", v: "Infinity" });
        if (x === -Infinity) return Promise.resolve({ $ss: "num", v: "-Infinity" });
        if (x === 0 && 1 / x < 0) return Promise.resolve({ $ss: "num", v: "-0" });
        return Promise.resolve(x);
      }
      if (t === "bigint") return Promise.resolve({ $ss: "bigint", v: String(x) });
      if (t !== "object") return Promise.reject(NoSerializable(t));
      if (pila.indexOf(x) !== -1) return Promise.reject(NoSerializable("referencia circular"));
      var clase = nombreClase(x);
      if (x instanceof Date) return Promise.resolve({ $ss: "fecha", v: isNaN(x.getTime()) ? null : x.getTime() });
      if (x instanceof RegExp) return Promise.resolve({ $ss: "regexp", s: x.source, f: x.flags });
      if (x instanceof ArrayBuffer) return Promise.resolve({ $ss: "bin", t: "ArrayBuffer", b64: aBase64(new Uint8Array(x)) });
      if (ArrayBuffer.isView(x)) {
        var tipo = TIPOS_BIN.indexOf(clase) !== -1 ? clase : "Uint8Array";
        return Promise.resolve({ $ss: "bin", t: tipo, b64: aBase64(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)) });
      }
      if (esBlob(x)) {
        return leerBlob(x).then(function (bytes) {
          var o = { $ss: "blob", tipo: x.type || "", b64: aBase64(bytes) };
          if (clase === "File") {
            o.nombre = x.name;
            o.modificado = x.lastModified;
          }
          return o;
        });
      }
      if (x instanceof Number || x instanceof String || x instanceof Boolean) return ir(x.valueOf(), prof);
      if (x instanceof Error) return Promise.resolve({ $ss: "error", nombre: x.name, mensaje: x.message });
      var esMapa = typeof Map !== "undefined" && x instanceof Map;
      var esConjunto = typeof Set !== "undefined" && x instanceof Set;
      var proto = Object.getPrototypeOf(x);
      if (!Array.isArray(x) && !esMapa && !esConjunto && proto !== Object.prototype && proto !== null) {
        // CryptoKey (p. ej. la privada NO extraíble de los vínculos), FileSystemHandle, ImageBitmap…
        return Promise.reject(NoSerializable(clase));
      }
      pila.push(x);
      try {
        if (Array.isArray(x)) {
          var lista = [];
          for (var i = 0; i < x.length; i++) lista.push(ir(x[i], prof + 1));
          return Promise.all(lista);
        }
        if (esMapa) {
          var pares = [];
          x.forEach(function (val, k) { pares.push(Promise.all([ir(k, prof + 1), ir(val, prof + 1)])); });
          return Promise.all(pares).then(function (p) { return { $ss: "mapa", v: p }; });
        }
        if (esConjunto) {
          var elems = [];
          x.forEach(function (val) { elems.push(ir(val, prof + 1)); });
          return Promise.all(elems).then(function (p) { return { $ss: "conjunto", v: p }; });
        }
        var claves = Object.keys(x);
        var envuelto = Object.prototype.hasOwnProperty.call(x, "$ss");
        return Promise.all(claves.map(function (k) { return ir(x[k], prof + 1); })).then(function (vals) {
          var o = {};
          for (var j = 0; j < claves.length; j++) o[claves[j]] = vals[j];
          return envuelto ? { $ss: "obj", v: o } : o;
        });
      } finally {
        pila.pop();
      }
    }
    return ir(v, 0);
  }

  /** Lo contrario de `codificar` (síncrono: los Blob se rehacen de sus bytes). */
  function decodificar(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(decodificar);
    if (typeof v.$ss !== "string") {
      var o = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = decodificar(v[k]);
      return o;
    }
    switch (v.$ss) {
      case "indef": return undefined;
      case "num": return v.v === "NaN" ? NaN : v.v === "Infinity" ? Infinity : v.v === "-Infinity" ? -Infinity : -0;
      case "bigint": return typeof BigInt === "function" ? BigInt(v.v) : Number(v.v);
      case "fecha": return new Date(v.v === null ? NaN : v.v);
      case "regexp": return new RegExp(v.s, v.f);
      case "bin": {
        var bytes = deBase64(v.b64);
        if (v.t === "ArrayBuffer") return bytes.buffer;
        if (v.t === "DataView") return new DataView(bytes.buffer);
        var C = typeof globalThis !== "undefined" ? globalThis[v.t] : null;
        if (typeof C !== "function" || TIPOS_BIN.indexOf(v.t) === -1) return bytes;
        return new C(bytes.buffer, 0, bytes.byteLength / (C.BYTES_PER_ELEMENT || 1));
      }
      case "blob": {
        var datos = deBase64(v.b64);
        if (typeof v.nombre === "string" && typeof File === "function") {
          return new File([datos], v.nombre, { type: v.tipo || "", lastModified: v.modificado });
        }
        return new Blob([datos], { type: v.tipo || "" });
      }
      case "mapa": return new Map(v.v.map(function (p) { return [decodificar(p[0]), decodificar(p[1])]; }));
      case "conjunto": return new Set(v.v.map(decodificar));
      case "error": {
        var e = new Error(v.mensaje);
        e.name = v.nombre;
        return e;
      }
      case "obj": {
        var d = {};
        for (var c in v.v) if (Object.prototype.hasOwnProperty.call(v.v, c)) d[c] = decodificar(v.v[c]);
        return d;
      }
      default: return v;
    }
  }

  // ───────────────────────────── IndexedDB (promesas) ─────────────────────────────

  function finTransaccion(tx) {
    return new Promise(function (ok) {
      tx.oncomplete = function () { ok(true); };
      tx.onabort = function () { ok(false); };
      tx.onerror = function () { /* lo resuelve onabort/oncomplete */ };
    });
  }

  function nombresDeBases(idb) {
    if (idb && typeof idb.databases === "function") {
      return Promise.resolve()
        .then(function () { return idb.databases(); })
        .then(function (l) {
          return (l || []).map(function (d) { return d && d.name; }).filter(function (n) { return typeof n === "string" && n; });
        })
        .catch(function () { return BASES_CONOCIDAS.slice(); });
    }
    return Promise.resolve(BASES_CONOCIDAS.slice());
  }

  /** Abre una base SOLO si existe (si no existe, no la crea: aborta la creación). null si no hay. */
  function abrirSiExiste(idb, nombre) {
    return new Promise(function (ok) {
      var req;
      try { req = idb.open(nombre); } catch (e) { return ok(null); }
      req.onupgradeneeded = function (ev) {
        if (!ev || ev.oldVersion === 0) {
          try { req.transaction.abort(); } catch (e) { /* nada */ }
        }
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function (ev) {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        ok(null);
      };
      req.onblocked = function () { /* espera a que la suelten */ };
    });
  }

  function listaDe(dsl) {
    var out = [];
    if (!dsl) return out;
    for (var i = 0; i < dsl.length; i++) out.push(typeof dsl.item === "function" ? dsl.item(i) : dsl[i]);
    return out;
  }

  /** Lee un almacén con cursor, respetando el presupuesto. Devuelve los valores CRUDOS (aún sin codificar). */
  function leerAlmacen(db, nombre, presupuesto) {
    var tx = db.transaction([nombre], "readonly");
    var st = tx.objectStore(nombre);
    var info = {
      nombre: nombre,
      keyPath: st.keyPath === undefined ? null : st.keyPath,
      autoIncrement: !!st.autoIncrement,
      indices: listaDe(st.indexNames).map(function (n) {
        var ix = st.index(n);
        return { nombre: n, keyPath: ix.keyPath, unique: !!ix.unique, multiEntry: !!ix.multiEntry };
      }),
      crudos: [],
      omitidos: 0,
      motivos: {},
    };
    return new Promise(function (ok, falla) {
      var req = st.openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) return;
        var tam = tamanoAprox(cur.value) + tamanoAprox(cur.primaryKey);
        if (tam > LIMITES.registro) {
          info.omitidos++;
          info.motivos["demasiado grande"] = (info.motivos["demasiado grande"] || 0) + 1;
        } else if (presupuesto.usado + tam > presupuesto.total) {
          info.omitidos++;
          info.motivos["tope total"] = (info.motivos["tope total"] || 0) + 1;
        } else {
          presupuesto.usado += tam;
          info.crudos.push({ k: cur.primaryKey, v: cur.value });
        }
        cur["continue"]();
      };
      req.onerror = function () { falla(req.error); };
      finTransaccion(tx).then(function () { ok(info); });
    });
  }

  function exportarBase(idb, nombre, presupuesto) {
    var clase = clasificarBase(nombre);
    if (clase !== "normal") return Promise.resolve({ nombre: nombre, omitida: clase === "sesion" ? "sesion" : "cache" });
    return abrirSiExiste(idb, nombre).then(function (db) {
      if (!db) return null;
      var base = { nombre: nombre, version: db.version, almacenes: [] };
      var nombres = listaDe(db.objectStoreNames);
      var cadena = Promise.resolve();
      nombres.forEach(function (n) {
        cadena = cadena.then(function () {
          return leerAlmacen(db, n, presupuesto).then(function (info) {
            var registros = [];
            var paso = Promise.resolve();
            info.crudos.forEach(function (r) {
              paso = paso.then(function () {
                return Promise.all([codificar(r.k), codificar(r.v)]).then(
                  function (kv) { registros.push({ k: kv[0], v: kv[1] }); },
                  function (e) {
                    if (!e || !e.noSerializable) throw e;
                    info.omitidos++;
                    var m = "no se puede copiar (" + e.tipo + ")";
                    info.motivos[m] = (info.motivos[m] || 0) + 1;
                  },
                );
              });
            });
            return paso.then(function () {
              base.almacenes.push({
                nombre: info.nombre, keyPath: info.keyPath, autoIncrement: info.autoIncrement,
                indices: info.indices, registros: registros, omitidos: info.omitidos, motivos: info.motivos,
              });
            });
          });
        });
      });
      return cadena.then(
        function () { try { db.close(); } catch (e) { /* nada */ } return base; },
        function (e) { try { db.close(); } catch (x) { /* nada */ } return { nombre: nombre, omitida: "error: " + String(e && e.message || e) }; },
      );
    });
  }

  // ───────────────────────────── Exportar ─────────────────────────────

  /**
   * Todo lo exportable del origen donde corre. `entorno`: { localStorage, indexedDB, ahora() }.
   * Nunca lanza por una clave o una base sueltas: lo que no se pudo se cuenta en `omitidas`.
   */
  function exportar(entorno) {
    var ls = entorno.localStorage;
    var datos = {
      formato: FORMATO,
      version: VERSION,
      origen: entorno.origen || ORIGEN_WEB,
      creado: new Date(entorno.ahora ? entorno.ahora() : Date.now()).toISOString(),
      localStorage: {},
      secretas: [],
      omitidas: [],
      indexedDB: [],
    };
    try {
      var n = ls ? ls.length : 0;
      var claves = [];
      for (var i = 0; i < n; i++) claves.push(ls.key(i));
      claves.forEach(function (c) {
        if (typeof c !== "string") return;
        var v = ls.getItem(c);
        if (v === null) return;
        var clase = clasificarClave(c, v);
        if (clase === "sesion") {
          datos.omitidas.push({ clave: c, motivo: "sesion" });
          return;
        }
        datos.localStorage[c] = v;
        if (clase === "secreto") datos.secretas.push(c);
      });
    } catch (e) {
      datos.omitidas.push({ clave: "*", motivo: "localStorage ilegible: " + String(e && e.message || e) });
    }
    var idb = entorno.indexedDB;
    if (!idb) return Promise.resolve(datos);
    var presupuesto = { usado: 0, total: LIMITES.totalIdb };
    return nombresDeBases(idb).then(function (nombres) {
      var cadena = Promise.resolve();
      nombres.forEach(function (nombre) {
        cadena = cadena.then(function () {
          return exportarBase(idb, nombre, presupuesto).then(function (b) { if (b) datos.indexedDB.push(b); });
        });
      });
      return cadena.then(function () { return datos; });
    });
  }

  /** Parte un texto en trozos de `tam` caracteres (sin romper pares sustitutos UTF-16). */
  function partir(texto, tam) {
    tam = Math.max(16, tam || LIMITES.trozo);
    var out = [];
    var i = 0;
    while (i < texto.length) {
      var fin = Math.min(texto.length, i + tam);
      var c = texto.charCodeAt(fin - 1);
      if (fin < texto.length && c >= 0xd800 && c <= 0xdbff) fin--;
      out.push(texto.slice(i, fin));
      i = fin;
    }
    return out.length ? out : [""];
  }

  function idAlAzar() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /** Espera a que Tauri haya puesto su puente (lo inyecta antes, pero por si acaso). */
  function invocador(ventana, tope) {
    var fin = Date.now() + (tope || 5000);
    return new Promise(function (ok, falla) {
      (function mirar() {
        var t = ventana && ventana.__TAURI_INTERNALS__;
        if (t && typeof t.invoke === "function") return ok(function (cmd, args) { return t.invoke(cmd, args); });
        if (Date.now() > fin) return falla(new Error("la app no expone su puente (IPC)"));
        setTimeout(mirar, 50);
      })();
    });
  }

  /** Corre en la ventana oculta (origen de la web publicada): exporta y se lo pasa a Rust por trozos. */
  function exportarYEnviar(entorno) {
    if (!entorno.origen || entorno.origen !== ORIGEN_WEB) return Promise.resolve(false);
    var id = idAlAzar();
    var invocar = entorno.invoke;
    var enviarError = function (e) {
      return invocar("migracion_origen_exportar", { id: id, indice: 0, total: 0, trozo: "", error: String(e && e.message || e) })
        .catch(function () { return null; });
    };
    return exportar(entorno).then(
      function (datos) {
        var trozos = partir(JSON.stringify(datos), LIMITES.trozo);
        var cadena = Promise.resolve();
        trozos.forEach(function (t, i) {
          cadena = cadena.then(function () {
            return invocar("migracion_origen_exportar", { id: id, indice: i, total: trozos.length, trozo: t, error: null });
          });
        });
        return cadena.then(function () { return true; }, function (e) { return enviarError(e).then(function () { return false; }); });
      },
      function (e) { return enviarError(e).then(function () { return false; }); },
    );
  }

  // ───────────────────────────── Importar ─────────────────────────────

  function validar(datos) {
    if (!datos || typeof datos !== "object") throw new Error("los datos de la versión anterior no se entienden");
    if (datos.formato !== FORMATO) throw new Error("formato desconocido");
    if (typeof datos.version !== "number" || datos.version > VERSION) throw new Error("versión de migración desconocida: " + datos.version);
    if (!datos.localStorage || typeof datos.localStorage !== "object") throw new Error("faltan los ajustes");
  }

  /**
   * Fusión por clave con la regla más segura: lo que NO existe en el origen local se trae; lo que ya
   * existe con el mismo valor no se toca; lo que existe con OTRO valor se queda como está (lo local es
   * lo que la persona hizo en la app nueva; el valor viejo sigue intacto en la web y en la copia del
   * disco) y se cuenta como conflicto. La sesión y el marcador nunca se traen.
   */
  function planLocalStorage(datos, actual) {
    var plan = { poner: [], iguales: 0, conflictos: [], descartadas: 0 };
    var ls = datos.localStorage || {};
    Object.keys(ls).forEach(function (c) {
      var v = ls[c];
      if (typeof v !== "string" || clasificarClave(c, v) === "sesion") {
        plan.descartadas++;
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(actual, c) || actual[c] === null || actual[c] === undefined) plan.poner.push([c, v]);
      else if (actual[c] === v) plan.iguales++;
      else plan.conflictos.push(c);
    });
    return plan;
  }

  function leerTodo(ls) {
    var out = {};
    if (!ls) return out;
    for (var i = 0; i < ls.length; i++) {
      var k = ls.key(i);
      if (typeof k === "string") out[k] = ls.getItem(k);
    }
    return out;
  }

  function abrirParaImportar(idb, base) {
    return abrirSiExiste(idb, base.nombre).then(function (existente) {
      var actual = existente ? existente.version : 0;
      if (existente) try { existente.close(); } catch (e) { /* nada */ }
      // Nunca se baja la versión de una base local: si la app nueva ya la subió, se añaden registros
      // solo a los almacenes que tenga.
      var version = Math.max(actual, base.version || 1);
      return new Promise(function (ok, falla) {
        var req = version > actual ? idb.open(base.nombre, version) : idb.open(base.nombre);
        req.onupgradeneeded = function () {
          var db = req.result;
          (base.almacenes || []).forEach(function (a) {
            if (db.objectStoreNames.contains(a.nombre)) return;
            var opciones = { autoIncrement: !!a.autoIncrement };
            if (a.keyPath !== null && a.keyPath !== undefined) opciones.keyPath = a.keyPath;
            var st = db.createObjectStore(a.nombre, opciones);
            (a.indices || []).forEach(function (ix) {
              try { st.createIndex(ix.nombre, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }); } catch (e) { /* índice raro: el almacén vale igual */ }
            });
          });
        };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { falla(req.error); };
        req.onblocked = function () { /* no hay otras conexiones en la página de migración */ };
      });
    });
  }

  function importarAlmacen(db, a, cuenta) {
    var tx = db.transaction([a.nombre], "readwrite");
    var st = tx.objectStore(a.nombre);
    var enLinea = st.keyPath !== null && st.keyPath !== undefined;
    (a.registros || []).forEach(function (r) {
      var req;
      try {
        var v = decodificar(r.v);
        req = enLinea ? st.add(v) : st.add(v, decodificar(r.k));
      } catch (e) {
        cuenta.errores++;
        return;
      }
      req.onsuccess = function () { cuenta.traidos++; };
      req.onerror = function (ev) {
        // Ya existe esa clave en local: se queda lo local (no se aborta la transacción).
        if (req.error && req.error.name === "ConstraintError") cuenta.yaEstaban++;
        else cuenta.errores++;
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      };
    });
    return finTransaccion(tx);
  }

  function importarBase(idb, base, cuenta) {
    if (base.omitida || !Array.isArray(base.almacenes)) return Promise.resolve();
    return abrirParaImportar(idb, base).then(function (db) {
      var cadena = Promise.resolve();
      base.almacenes.forEach(function (a) {
        cadena = cadena.then(function () {
          if (!db.objectStoreNames.contains(a.nombre)) {
            cuenta.almacenesSinSitio++;
            return null;
          }
          return importarAlmacen(db, a, cuenta);
        });
      });
      return cadena.then(function () { try { db.close(); } catch (e) { /* nada */ } }, function (e) {
        try { db.close(); } catch (x) { /* nada */ }
        throw e;
      });
    }, function () {
      cuenta.basesConError++;
    });
  }

  /** Resumen de lo que se quedó en la versión anterior al exportar (para el aviso). */
  function resumenExportacion(datos) {
    var r = { sesionesNoCopiadas: 0, registrosNoCopiados: 0, basesNoCopiadas: [], motivos: {} };
    (datos.omitidas || []).forEach(function (o) { if (o.motivo === "sesion") r.sesionesNoCopiadas++; });
    (datos.indexedDB || []).forEach(function (b) {
      if (b.omitida) {
        r.basesNoCopiadas.push(b.nombre + " (" + b.omitida + ")");
        return;
      }
      (b.almacenes || []).forEach(function (a) {
        r.registrosNoCopiados += a.omitidos || 0;
        var m = a.motivos || {};
        Object.keys(m).forEach(function (k) {
          var clave = b.nombre + "/" + a.nombre + ": " + k;
          r.motivos[clave] = (r.motivos[clave] || 0) + m[k];
        });
      });
    });
    return r;
  }

  /**
   * Fusiona `datos` en el origen donde corre. `entorno`: { localStorage, indexedDB }.
   * Devuelve el resumen; lanza solo si los datos no se entienden.
   */
  function importar(datos, entorno) {
    validar(datos);
    var ls = entorno.localStorage;
    var plan = planLocalStorage(datos, leerTodo(ls));
    var ajustes = { traidos: 0, iguales: plan.iguales, conflictos: plan.conflictos.length, errores: 0, descartados: plan.descartadas };
    plan.poner.forEach(function (p) {
      try {
        ls.setItem(p[0], p[1]);
        ajustes.traidos++;
      } catch (e) {
        ajustes.errores++;
      }
    });
    var registros = { traidos: 0, yaEstaban: 0, errores: 0, almacenesSinSitio: 0, basesConError: 0 };
    var idb = entorno.indexedDB;
    var cadena = Promise.resolve();
    if (idb) {
      (datos.indexedDB || []).forEach(function (b) {
        cadena = cadena.then(function () { return importarBase(idb, b, registros); });
      });
    }
    return cadena.then(function () {
      return {
        ajustes: ajustes,
        conflictos: plan.conflictos.slice(0, 50),
        registros: registros,
        bases: (datos.indexedDB || []).filter(function (b) { return !b.omitida; }).length,
        exportacion: resumenExportacion(datos),
      };
    });
  }

  function marcador(resultado, resumen, motivo, copia, ahora) {
    return {
      version: VERSION,
      resultado: resultado,
      fecha: new Date(ahora || Date.now()).toISOString(),
      resumen: resumen || null,
      motivo: motivo || null,
      copia: copia || null,
      visto: false,
    };
  }

  /**
   * La página `/__starseed/migracion` del servidor local. `entorno`: { invoke, localStorage,
   * indexedDB, ir(url), pintar(fase, texto), esperar(ms), ahora(), tope }.
   */
  function paginaImportar(entorno) {
    var ahora = entorno.ahora || Date.now;
    var tope = ahora() + (entorno.tope || 75000);
    var pintar = entorno.pintar || function () {};
    var invocar = entorno.invoke;
    var resultado = "pospuesta";
    var motivo = null;
    var resumen = null;
    var copia = null;

    function esperarExportacion() {
      return invocar("migracion_origen_estado").then(function (e) {
        e = e || {};
        if (e.fase === "lista" || e.fase === "fallida" || e.fase === "hecha" || e.fase === "no-aplica") return e;
        if (ahora() > tope) return { fase: "fallida", motivo: "La versión anterior no respondió a tiempo." };
        return entorno.esperar(400).then(esperarExportacion);
      });
    }

    function traer(partes) {
      var trozos = [];
      var cadena = Promise.resolve();
      for (var i = 0; i < partes; i++) {
        (function (j) {
          cadena = cadena.then(function () {
            return invocar("migracion_origen_datos", { indice: j }).then(function (t) { trozos[j] = String(t); });
          });
        })(i);
      }
      return cadena.then(function () { return trozos.join(""); });
    }

    // Si ESTE origen ya se importó (Rust no llegó a guardar su marcador), no se vuelve a importar:
    // traerlo otra vez resucitaría lo que la persona borró desde entonces. Solo se confirma.
    var previo = null;
    try { previo = JSON.parse(entorno.localStorage.getItem(CLAVE_MARCADOR) || "null"); } catch (e) { previo = null; }
    var yaImportado = !!(previo && previo.resultado === "hecha");

    pintar("trayendo", "Trayendo tus datos de la versión anterior…");
    return esperarExportacion()
      .then(function (e) {
        copia = e.copia || null;
        if (yaImportado && (e.fase === "lista" || e.fase === "fallida")) {
          return invocar("migracion_origen_confirmar", { resultado: "hecha", motivo: null, resumen: previo.resumen || null })
            .catch(function () { return null; })
            .then(function () { resultado = null; });
        }
        if (e.fase === "hecha" || e.fase === "no-aplica") {
          resultado = null; // nada que hacer
          return null;
        }
        if (e.fase === "fallida") {
          motivo = e.motivo || "No se pudieron leer los datos de la versión anterior.";
          return null;
        }
        return traer(e.partes || 0)
          .then(function (texto) { return importar(JSON.parse(texto), entorno); })
          .then(function (r) {
            resumen = r;
            resultado = "hecha";
          });
      })
      .catch(function (err) {
        resultado = "pospuesta";
        motivo = String(err && err.message || err);
      })
      .then(function () {
        if (!resultado) return null;
        pintar(resultado === "hecha" ? "lista" : "aviso", resultado === "hecha" ? "Listo: tus datos ya están aquí." : "No se pudieron traer ahora.");
        // Rust guarda el marcador del disco y dice el resultado final ("abandonada" tras 3 intentos).
        return invocar("migracion_origen_confirmar", { resultado: resultado, motivo: motivo, resumen: resumen })
          .catch(function () { return null; })
          .then(function (final) {
            var r = final === "hecha" || final === "pospuesta" || final === "abandonada" ? final : resultado;
            try { entorno.localStorage.setItem(CLAVE_MARCADOR, JSON.stringify(marcador(r, resumen, motivo, copia, ahora()))); } catch (e) { /* nada */ }
            resultado = r;
          });
      })
      .then(function () {
        entorno.ir("/");
        return resultado;
      });
  }

  return {
    FORMATO: FORMATO,
    VERSION: VERSION,
    ORIGEN_WEB: ORIGEN_WEB,
    CLAVE_MARCADOR: CLAVE_MARCADOR,
    LIMITES: LIMITES,
    BASES_CONOCIDAS: BASES_CONOCIDAS,
    SECRETAS_EXACTAS: SECRETAS_EXACTAS,
    SECRETAS_PREFIJOS: SECRETAS_PREFIJOS,
    esClaveDeSesion: esClaveDeSesion,
    pareceSesion: pareceSesion,
    clasificarClave: clasificarClave,
    clasificarBase: clasificarBase,
    tamanoAprox: tamanoAprox,
    codificar: codificar,
    decodificar: decodificar,
    exportar: exportar,
    partir: partir,
    invocador: invocador,
    exportarYEnviar: exportarYEnviar,
    planLocalStorage: planLocalStorage,
    importar: importar,
    resumenExportacion: resumenExportacion,
    marcador: marcador,
    paginaImportar: paginaImportar,
  };
});
