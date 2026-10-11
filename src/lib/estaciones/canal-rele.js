"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearCanalRele = crearCanalRele;
var PREFIJO_EST = '{"t":"est"';
var PREFIJO_RELE = '{"t":"rele"';
/**
 * Crea un canal que se conecta a un servidor WebSocket de relé propio de estaciones.
 * Se reconecta con espera creciente (1, 2, 4... hasta 30 s).
 * Solo pasa al oyente los mensajes que empiezan por '{"t":"est"'.
 * Los mensajes de la forma '{"t":"rele","n":k}' actualizan el conteo de oyentes.
 */
function crearCanalRele(url, tema, WS) {
    if (WS === void 0) { WS = globalThis.WebSocket; }
    var wsUrl = "".concat(url, "?tema=").concat(encodeURIComponent(tema));
    var ws = null;
    var reconectarTimeout = null;
    var reconectarDelay = 1000; // empieza en 1 s
    var maxDelay = 30000; // 30 s max
    var oyentes = new Set();
    var alAbrirCallbacks = new Set();
    var suscrito = false;
    var conexiones = null; // no se implementa presencia en este canal, pero la interfaz lo requiere
    function abrir() {
        if (ws)
            ws.close();
        ws = new WS(wsUrl);
        ws.onopen = function () {
            suscrito = true;
            reconectarDelay = 1000; // reset delay
            for (var _i = 0, _a = Array.from(alAbrirCallbacks); _i < _a.length; _i++) {
                var cb = _a[_i];
                cb();
            }
        };
        ws.onmessage = function (event) {
            var data = event.data;
            if (typeof data !== "string")
                return;
            if (data.startsWith(PREFIJO_RELE)) {
                // mensaje de relé: actualizar oyentes
                try {
                    var parsed = JSON.parse(data);
                    if (typeof parsed.n === "number") {
                        conexiones = parsed.n;
                    }
                }
                catch (_a) {
                    // ignorar mensajes malformados
                }
                return; // no pasar arriba
            }
            if (data.startsWith(PREFIJO_EST)) {
                for (var _i = 0, _b = Array.from(oyentes); _i < _b.length; _i++) {
                    var cb = _b[_i];
                    cb(data);
                }
            }
        };
        ws.onclose = function () {
            suscrito = false;
            // intentar reconexión
            if (reconectarTimeout !== null) {
                clearTimeout(reconectarTimeout);
                reconectarTimeout = null;
            }
            reconectarTimeout = setTimeout(function () {
                abrir();
                // aumentar delay para próximo intento, hasta el máximo
                reconectarDelay = Math.min(reconectarDelay * 2, maxDelay);
            }, reconectarDelay);
        };
        ws.onerror = function () {
            // cerrar para trigger onclose y reconectar
            if (ws)
                ws.close();
        };
    }
    abrir();
    return {
        tipo: "internet",
        etiqueta: "Relé propio de estaciones",
        enviar: function (texto) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(texto);
            }
        },
        alRecibir: function (cb) {
            oyentes.add(cb);
            return function () {
                oyentes.delete(cb);
            };
        },
        abierto: function () {
            return ws ? ws.readyState === WebSocket.OPEN : false;
        },
        oyentes: function () {
            return conexiones;
        },
        alAbrir: function (cb) {
            alAbrirCallbacks.add(cb);
            return function () {
                alAbrirCallbacks.delete(cb);
            };
        },
        cerrar: function () {
            if (ws) {
                ws.close();
                ws = null;
            }
            if (reconectarTimeout !== null) {
                clearTimeout(reconectarTimeout);
                reconectarTimeout = null;
            }
            suscrito = false;
        },
    };
}
