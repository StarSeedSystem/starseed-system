/*
 * rescate-origen.js — trae lo que la app guardó en OTRO puerto de su servidor local (NOT1108A, 2026-11-08).
 * Contrato: architecture/apps-autonomas-sin-internet.md §2.2.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * El origen de la web de la app es `http://127.0.0.1:<puerto>`. Si un arranque tuvo que servir en otro
 * puerto (el de siempre seguía ocupado), lo que la persona guardó allí (historial de los chats con sus
 * neuronas, escritorios, ajustes…) vive en OTRO almacén. Antes de abrir el OS, Rust sirve esta página
 * (mini servidor propio, no Next) en el puerto viejo y en el actual:
 *
 *   1. EXPORTAR (`/__starseed/rescate-origen/exportar`, origen viejo): todo `localStorage`, IndexedDB y
 *      las cookies de la sesión de Supabase (`sb-…`; las pone `@supabase/ssr` y no son HttpOnly) a Rust
 *      por IPC, en trozos. Nada se escribe en disco: vive en la memoria de la app el rato del rescate.
 *   2. IMPORTAR (`/__starseed/rescate-origen/importar`, origen actual, ANTES que el OS): fusiona sin pisar
 *      (reglas de `migracion-origen.js`), salvo la bandeja de la malla (`starseed.mensajeria.malla.v1`),
 *      que se UNE mensaje a mensaje, y las cookies de sesión, que solo se ponen si aquí no hay ninguna.
 *
 * Aquí la sesión SÍ viaja: los dos orígenes son de la misma app en el mismo aparato (no es la web
 * publicada) y nada pasa por el disco. El original nunca se borra.
 *
 * Sin dependencias y sin sintaxis moderna (lo carga también el WebKit de macOS 10.15). Lo cargan: Rust
 * (`include_str!`, inline en la página) y las pruebas (`src/lib/nativa/__tests__/rescate-origen.test.ts`).
 */
(function (raiz, fabrica) {
  var m = fabrica();
  if (typeof module === "object" && module && module.exports) module.exports = m;
  else {
    raiz.StarseedRescateOrigen = m;
    try {
      if (raiz.location && raiz.document && raiz.StarseedMigracionOrigen) m.arrancar(raiz);
    } catch (e) { /* la página dice lo que pueda; Rust sigue por su tope */ }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var RUTA_EXPORTAR = "/__starseed/rescate-origen/exportar";
  var RUTA_IMPORTAR = "/__starseed/rescate-origen/importar";
  /** Bandeja de la malla (src/lib/mensajeria/neuronas/buzon.ts): se une, no se elige una de las dos. */
  var CLAVE_BANDEJA = "starseed.mensajeria.malla.v1";
  var MAX_POR_CONVERSACION = 300;
  var MAX_VIAS = 600;
  /** Marcador en el origen actual (lo puede leer la web para avisar). */
  var CLAVE_MARCADOR = "starseed.rescate-origen.v1";

  // ───────────────────────────── Cookies de sesión ─────────────────────────────

  /** Las cookies de Supabase (`sb-<ref>-auth-token`, sus trozos `.0`, `.1` y `-code-verifier`). */
  function cookiesDeSesion(texto) {
    var out = [];
    String(texto || "").split(";").forEach(function (par) {
      var i = par.indexOf("=");
      if (i <= 0) return;
      var n = par.slice(0, i).trim();
      var v = par.slice(i + 1).trim();
      if (/^sb-[A-Za-z0-9_.-]+$/.test(n) && v && v.length <= 8192) out.push([n, v]);
    });
    return out;
  }

  /** Pone las que falten (nunca pisa una sesión que ya haya aquí). Devuelve cuántas puso. */
  function ponerCookies(doc, lista) {
    if (!doc || !Array.isArray(lista) || !lista.length) return 0;
    var actuales = cookiesDeSesion(doc.cookie);
    // Si aquí ya hay una sesión de Supabase, es la que vale: no se mezclan trozos de dos sesiones.
    if (actuales.some(function (c) { return /-auth-token(\.\d+)?$/.test(c[0]); })) return 0;
    var puestas = 0;
    lista.forEach(function (c) {
      if (!Array.isArray(c) || !/^sb-[A-Za-z0-9_.-]+$/.test(String(c[0])) || typeof c[1] !== "string") return;
      try {
        // 400 días, como `@supabase/ssr` (DEFAULT_COOKIE_OPTIONS); http: sin Secure.
        doc.cookie = c[0] + "=" + c[1] + "; path=/; max-age=34560000; samesite=lax";
        puestas++;
      } catch (e) { /* una cookie suelta no tumba el rescate */ }
    });
    return puestas;
  }

  // ───────────────────────────── Bandeja de la malla ─────────────────────────────

  function leerBandeja(texto) {
    try {
      var o = JSON.parse(texto || "null");
      if (o && typeof o === "object" && o.v === 1 && o.conv && typeof o.conv === "object") return o;
    } catch (e) { /* basura */ }
    return null;
  }

  /**
   * Une dos bandejas: cada conversación con los mensajes de las dos (por id; si está en las dos se queda el
   * de aquí), ordenados por fecha y con el mismo tope que el buzón; «leído hasta», el mayor; vías, las dos.
   * Devuelve { texto, traidos } (texto null si no hay nada que escribir).
   */
  function fusionarBandeja(textoAqui, textoViejo) {
    var vieja = leerBandeja(textoViejo);
    if (!vieja) return { texto: null, traidos: 0 };
    var aqui = leerBandeja(textoAqui) || { v: 1, conv: {}, vias: {} };
    var traidos = 0;
    var conv = {};
    Object.keys(aqui.conv).forEach(function (k) { conv[k] = aqui.conv[k]; });
    Object.keys(vieja.conv).forEach(function (k) {
      var cv = vieja.conv[k];
      if (!cv || !Array.isArray(cv.mensajes)) return;
      var ca = conv[k] && Array.isArray(conv[k].mensajes) ? conv[k] : { mensajes: [], leidoHasta: 0 };
      var ids = {};
      ca.mensajes.forEach(function (m) { if (m && typeof m.id === "string") ids[m.id] = true; });
      var nuevos = cv.mensajes.filter(function (m) { return m && typeof m.id === "string" && !ids[m.id]; });
      traidos += nuevos.length;
      var todos = ca.mensajes.concat(nuevos).sort(function (a, b) {
        return (Number(a.at) || 0) - (Number(b.at) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
      if (todos.length > MAX_POR_CONVERSACION) todos = todos.slice(todos.length - MAX_POR_CONVERSACION);
      conv[k] = {
        mensajes: todos,
        leidoHasta: Math.max(Number(ca.leidoHasta) || 0, Number(cv.leidoHasta) || 0),
      };
    });
    var vias = {};
    var vv = vieja.vias && typeof vieja.vias === "object" ? vieja.vias : {};
    var va = aqui.vias && typeof aqui.vias === "object" ? aqui.vias : {};
    Object.keys(vv).forEach(function (k) { vias[k] = vv[k]; });
    Object.keys(va).forEach(function (k) { vias[k] = va[k]; });
    var claves = Object.keys(vias);
    if (claves.length > MAX_VIAS) {
      claves
        .sort(function (a, b) { return (Number(vias[a] && vias[a].en) || 0) - (Number(vias[b] && vias[b].en) || 0); })
        .slice(0, claves.length - MAX_VIAS)
        .forEach(function (k) { delete vias[k]; });
    }
    return { texto: JSON.stringify({ v: 1, conv: conv, vias: vias }), traidos: traidos };
  }

  // ───────────────────────────── Exportar e importar ─────────────────────────────

  function idAlAzar() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /**
   * Página del origen viejo. `entorno`: { M (StarseedMigracionOrigen), invoke, localStorage, indexedDB,
   * cookie (texto de document.cookie), origen, ahora(), pintar(texto) }.
   */
  function exportarPagina(entorno) {
    var M = entorno.M;
    var invocar = entorno.invoke;
    var pintar = entorno.pintar || function () {};
    var id = idAlAzar();
    var enviarError = function (e) {
      return invocar("rescate_origen_exportar", { id: id, indice: 0, total: 0, trozo: "", vacio: false, error: String((e && e.message) || e) })
        .catch(function () { return null; })
        .then(function () { return false; });
    };
    pintar("Leyendo lo que esta app guardó en " + entorno.origen + "…");
    return M.exportar({ localStorage: entorno.localStorage, indexedDB: entorno.indexedDB, origen: entorno.origen, ahora: entorno.ahora }).then(
      function (datos) {
        datos.cookies = cookiesDeSesion(entorno.cookie);
        var vacio = Object.keys(datos.localStorage || {}).length === 0 && (datos.indexedDB || []).length === 0 && datos.cookies.length === 0;
        var trozos = vacio ? [""] : M.partir(JSON.stringify(datos), M.LIMITES.trozo);
        var cadena = Promise.resolve();
        trozos.forEach(function (t, i) {
          cadena = cadena.then(function () {
            return invocar("rescate_origen_exportar", { id: id, indice: i, total: trozos.length, trozo: t, vacio: vacio, error: null });
          });
        });
        return cadena.then(function () { return true; }, enviarError);
      },
      enviarError,
    );
  }

  /** Fusiona lo de UN origen viejo aquí. `entorno`: { M, localStorage, indexedDB, document }. */
  function importarDatos(datos, entorno) {
    var M = entorno.M;
    var ls = entorno.localStorage;
    var copia = {};
    Object.keys(datos).forEach(function (k) { copia[k] = datos[k]; });
    copia.localStorage = {};
    var lsViejo = datos.localStorage || {};
    Object.keys(lsViejo).forEach(function (k) { if (k !== CLAVE_BANDEJA) copia.localStorage[k] = lsViejo[k]; });
    var mensajes = 0;
    if (typeof lsViejo[CLAVE_BANDEJA] === "string") {
      var f = fusionarBandeja(ls.getItem(CLAVE_BANDEJA), lsViejo[CLAVE_BANDEJA]);
      if (f.texto !== null) {
        try {
          ls.setItem(CLAVE_BANDEJA, f.texto);
          mensajes = f.traidos;
        } catch (e) { /* sin espacio: el resto sigue */ }
      }
    }
    var cookies = ponerCookies(entorno.document, datos.cookies);
    return M.importar(copia, { localStorage: ls, indexedDB: entorno.indexedDB }).then(function (r) {
      r.mensajesMalla = mensajes;
      r.cookiesSesion = cookies;
      return r;
    });
  }

  /**
   * Página del origen actual. `entorno`: { M, invoke, localStorage, indexedDB, document, pintar(texto), ahora() }.
   * Pide a Rust lo exportado de cada origen viejo, lo fusiona y confirma con un resultado por origen.
   */
  function importarPagina(entorno) {
    var invocar = entorno.invoke;
    var pintar = entorno.pintar || function () {};
    var resultados = [];
    return invocar("rescate_origen_estado").then(function (estado) {
      var fuentes = (estado && Array.isArray(estado.fuentes) ? estado.fuentes : []).filter(function (f) { return f && f.partes > 0; });
      var cadena = Promise.resolve();
      fuentes.forEach(function (f) {
        cadena = cadena.then(function () {
          pintar("Trayendo tus datos del puerto " + f.puerto + "…");
          var trozos = [];
          var lectura = Promise.resolve();
          for (var i = 0; i < f.partes; i++) {
            (function (j) {
              lectura = lectura.then(function () {
                return invocar("rescate_origen_datos", { puerto: f.puerto, indice: j }).then(function (t) { trozos[j] = String(t); });
              });
            })(i);
          }
          return lectura
            .then(function () { return importarDatos(JSON.parse(trozos.join("")), entorno); })
            .then(
              function (r) { resultados.push({ puerto: f.puerto, ok: true, motivo: null, resumen: r }); },
              function (e) { resultados.push({ puerto: f.puerto, ok: false, motivo: String((e && e.message) || e), resumen: null }); },
            );
        });
      });
      return cadena;
    }).then(
      function () {
        try {
          entorno.localStorage.setItem(CLAVE_MARCADOR, JSON.stringify({ fecha: new Date(entorno.ahora ? entorno.ahora() : Date.now()).toISOString(), resultados: resultados, visto: false }));
        } catch (e) { /* el marcador es un extra */ }
        pintar(resultados.some(function (r) { return r.ok; }) ? "Listo: tus datos ya están aquí." : "Nada que traer.");
        return invocar("rescate_origen_confirmar", { resultados: resultados }).catch(function () { return null; }).then(function () { return resultados; });
      },
      function (e) {
        return invocar("rescate_origen_confirmar", { resultados: [{ puerto: 0, ok: false, motivo: String((e && e.message) || e), resumen: null }] })
          .catch(function () { return null; })
          .then(function () { return resultados; });
      },
    );
  }

  /** En la página de verdad: decide por la ruta. Rust lleva la ventana a lo siguiente. */
  function arrancar(ventana) {
    var M = ventana.StarseedMigracionOrigen;
    var ruta = ventana.location.pathname;
    var nodo = ventana.document.getElementById("t");
    var pintar = function (t) { if (nodo) nodo.textContent = t; };
    return M.invocador(ventana, 10000).then(function (invocar) {
      var base = {
        M: M,
        invoke: invocar,
        localStorage: ventana.localStorage,
        indexedDB: ventana.indexedDB,
        document: ventana.document,
        origen: ventana.location.origin,
        ahora: function () { return Date.now(); },
        pintar: pintar,
      };
      if (ruta === RUTA_EXPORTAR) {
        base.cookie = ventana.document.cookie;
        return exportarPagina(base);
      }
      if (ruta === RUTA_IMPORTAR) return importarPagina(base);
      return null;
    }, function () {
      pintar("La app no expone su puente: se sigue sin traer nada.");
      return null;
    });
  }

  return {
    RUTA_EXPORTAR: RUTA_EXPORTAR,
    RUTA_IMPORTAR: RUTA_IMPORTAR,
    CLAVE_BANDEJA: CLAVE_BANDEJA,
    CLAVE_MARCADOR: CLAVE_MARCADOR,
    cookiesDeSesion: cookiesDeSesion,
    ponerCookies: ponerCookies,
    fusionarBandeja: fusionarBandeja,
    exportarPagina: exportarPagina,
    importarDatos: importarDatos,
    importarPagina: importarPagina,
    arrancar: arrancar,
  };
});
