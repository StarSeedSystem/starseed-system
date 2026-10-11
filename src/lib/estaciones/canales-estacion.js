"use client";
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearCanalInternet = crearCanalInternet;
exports.engancharEnlacesLocales = engancharEnlacesLocales;
/**
 * canales-estacion — los canales REALES por los que viaja una estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4.2).
 *
 *   · internet → Supabase Realtime, canal de difusión del tema de la estación (`temaPublico` o,
 *     si es privada, `temaPrivado`, que solo calcula quien tiene el token). Presencia para contar
 *     conectados. Sin sondeo y sin tablas nuevas. Cuesta mensajes de Realtime: ver el SOP §6.
 *   · local    → cada enlace P2P emparejado SIN internet que esté vivo en esta pestaña
 *     (`registro-enlaces-locales.ts`, el mismo registro que usa el transporte universal). Por ahí
 *     la ida y vuelta es de pocos ms, así que el reloj común baja a ±1 ms. Coste cero.
 *
 * Los dos se importan perezosos: este módulo solo baja cuando alguien sintoniza una estación.
 */
var cripto_estacion_1 = require("./cripto-estacion");
var PREFIJO_SOBRE = '{"t":"est"';
function claveTab() {
    var _a, _b, _c;
    try {
        return (_c = (_b = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : "tab-".concat(Math.random().toString(36).slice(2));
    }
    catch (_d) {
        return "tab-".concat(Math.random().toString(36).slice(2));
    }
}
/** Canal de difusión de Supabase para una estación. Null si no hay cliente (sin red o sin config). */
function crearCanalInternet(id, token) {
    return __awaiter(this, void 0, void 0, function () {
        var cliente, createClient, _a, tema, _b, yo, oyentes, alAbrir, suscrito, conectados, canal;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("@/utils/supabase/client"); })];
                case 1:
                    createClient = (_c.sent()).createClient;
                    cliente = createClient();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _c.sent();
                    return [2 /*return*/, null];
                case 3:
                    if (!token) return [3 /*break*/, 5];
                    return [4 /*yield*/, (0, cripto_estacion_1.temaPrivado)(id, token)];
                case 4:
                    _b = _c.sent();
                    return [3 /*break*/, 6];
                case 5:
                    _b = (0, cripto_estacion_1.temaPublico)(id);
                    _c.label = 6;
                case 6:
                    tema = _b;
                    yo = claveTab();
                    oyentes = new Set();
                    alAbrir = new Set();
                    suscrito = false;
                    conectados = null;
                    canal = cliente.channel(tema, {
                        config: { broadcast: { self: false, ack: false }, presence: { key: yo } },
                    });
                    canal.on("broadcast", { event: "m" }, function (m) {
                        var _a;
                        var x = (_a = m === null || m === void 0 ? void 0 : m.payload) === null || _a === void 0 ? void 0 : _a.x;
                        if (typeof x !== "string" || !x.startsWith(PREFIJO_SOBRE))
                            return;
                        for (var _i = 0, _b = Array.from(oyentes); _i < _b.length; _i++) {
                            var cb = _b[_i];
                            cb(x);
                        }
                    });
                    canal.on("presence", { event: "sync" }, function () {
                        var _a;
                        try {
                            var n = Object.keys((_a = canal.presenceState()) !== null && _a !== void 0 ? _a : {}).length;
                            conectados = Math.max(0, n - 1);
                        }
                        catch (_b) {
                            conectados = null;
                        }
                    });
                    canal.subscribe(function (estado) {
                        if (estado === "SUBSCRIBED") {
                            suscrito = true;
                            void canal.track({ k: yo }).catch(function () { return undefined; });
                            for (var _i = 0, _a = Array.from(alAbrir); _i < _a.length; _i++) {
                                var cb = _a[_i];
                                cb();
                            }
                        }
                        else if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
                            suscrito = false;
                        }
                    });
                    return [2 /*return*/, {
                            tipo: "internet",
                            etiqueta: "Internet (Supabase Realtime)",
                            enviar: function (texto) {
                                if (!suscrito)
                                    return;
                                void canal.send({ type: "broadcast", event: "m", payload: { x: texto } }).catch(function () { return undefined; });
                            },
                            alRecibir: function (cb) {
                                oyentes.add(cb);
                                return function () {
                                    oyentes.delete(cb);
                                };
                            },
                            abierto: function () { return suscrito; },
                            oyentes: function () { return conectados; },
                            alAbrir: function (cb) {
                                alAbrir.add(cb);
                                return function () {
                                    alAbrir.delete(cb);
                                };
                            },
                            cerrar: function () {
                                suscrito = false;
                                oyentes.clear();
                                alAbrir.clear();
                                try {
                                    void cliente.removeChannel(canal);
                                }
                                catch (_a) {
                                    /* nada */
                                }
                            },
                        }];
            }
        });
    });
}
/**
 * Engancha la sesión a todos los enlaces locales (sin internet) vivos y a los que se abran
 * después. `poner`/`quitar` reciben el canal envuelto. Devuelve la baja.
 */
function engancharEnlacesLocales(poner, quitar) {
    return __awaiter(this, void 0, void 0, function () {
        var reg, _a, envueltos, envolver, bajaAlta, bajaCambio;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("@/lib/malla/registro-enlaces-locales"); })];
                case 1:
                    reg = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, function () { return undefined; }];
                case 3:
                    envueltos = new Map();
                    envolver = function (e) {
                        var _a;
                        if (envueltos.has(e.id))
                            return;
                        var c = {
                            tipo: "local",
                            etiqueta: "Enlace local \u00B7 ".concat(((_a = e.par) === null || _a === void 0 ? void 0 : _a.nombre) || "aparato emparejado"),
                            enviar: function (texto) {
                                try {
                                    e.enviar(texto);
                                }
                                catch (_a) {
                                    /* nada */
                                }
                            },
                            alRecibir: function (cb) {
                                return e.alMensaje(function (data) {
                                    if (typeof data === "string" && data.startsWith(PREFIJO_SOBRE))
                                        cb(data);
                                });
                            },
                            abierto: function () {
                                try {
                                    return e.abierto();
                                }
                                catch (_a) {
                                    return false;
                                }
                            },
                            oyentes: function () { return 1; },
                            cerrar: function () { return undefined; }, // el enlace no es nuestro: solo dejamos de escucharlo
                        };
                        envueltos.set(e.id, c);
                        poner(c);
                    };
                    bajaAlta = reg.alRegistrarEnlaceLocal(envolver);
                    bajaCambio = reg.suscribirEnlacesLocales(function () {
                        var vivos = new Set(reg.enlacesLocalesVivos().map(function (x) { return x.id; }));
                        for (var _i = 0, _a = Array.from(envueltos.entries()); _i < _a.length; _i++) {
                            var _b = _a[_i], id = _b[0], c = _b[1];
                            if (!vivos.has(id)) {
                                envueltos.delete(id);
                                quitar(c);
                            }
                        }
                    });
                    return [2 /*return*/, function () {
                            bajaAlta();
                            bajaCambio();
                            for (var _i = 0, _a = envueltos.values(); _i < _a.length; _i++) {
                                var c = _a[_i];
                                quitar(c);
                            }
                            envueltos.clear();
                        }];
            }
        });
    });
}
