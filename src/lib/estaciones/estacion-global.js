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
exports.estacionGlobal = estacionGlobal;
exports.useEstacionGlobal = useEstacionGlobal;
/**
 * estacion-global — la estación en vivo que suena en TODO el OS, aunque cambies de página (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§5.2).
 *
 * Un único objeto por pestaña: la sesión sintonizada (`SesionEnVivo`), sus canales reales y el
 * motor de sonido (`MotorSonido`). Lo cargan perezosamente el montaje global del layout
 * (`montaje-estacion-vivo.tsx`), el panel de la estación y el puente con la app oficial. Lo pinta
 * el minicontrol. Nada de esto baja al navegador hasta que alguien sintoniza una estación.
 */
var react_1 = require("react");
var cripto_estacion_1 = require("./cripto-estacion");
var canales_estacion_1 = require("./canales-estacion");
var llaves_locales_1 = require("./llaves-locales");
var motor_estacion_1 = require("./motor-estacion");
var sesion_en_vivo_1 = require("./sesion-en-vivo");
var transmision_parametrica_1 = require("./transmision-parametrica");
var CLAVE_SINTONIZADA = "starseed.estaciones.sintonizada.v1";
var LATIDO_FILA_MS = 60000;
var MOTOR_VACIO = { listo: false, latenciaMs: null, baseTiempo: null, necesitaGesto: true, sonando: false, tramos: 0, error: null };
var EstacionGlobal = /** @class */ (function () {
    function EstacionGlobal() {
        var _this = this;
        this.sesion = null;
        this.motor = new motor_estacion_1.MotorSonido();
        this.href = null;
        this.cargando = false;
        this.error = null;
        this.bajas = [];
        this.oyentes = new Set();
        this.instantanea = this.calcular();
        this.extras = new Set();
        this.suscribir = function (cb) {
            _this.oyentes.add(cb);
            return function () {
                _this.oyentes.delete(cb);
            };
        };
        this.foto = function () { return _this.instantanea; };
    }
    EstacionGlobal.prototype.calcular = function () {
        var _a, _b, _c, _d;
        var s = (_b = (_a = this.sesion) === null || _a === void 0 ? void 0 : _a.foto()) !== null && _b !== void 0 ? _b : null;
        return {
            href: this.href,
            sesion: s,
            motor: this.sesion ? this.motor.estado() : MOTOR_VACIO,
            volumen: this.motor.volumenLocal(),
            silenciada: this.motor.silenciado(),
            cargando: this.cargando,
            error: this.error,
            fila: s ? (_d = (_c = (0, llaves_locales_1.registroDe)(s.ficha.id)) === null || _c === void 0 ? void 0 : _c.fila) !== null && _d !== void 0 ? _d : null : null,
        };
    };
    EstacionGlobal.prototype.emitir = function () {
        this.instantanea = this.calcular();
        for (var _i = 0, _a = Array.from(this.oyentes); _i < _a.length; _i++) {
            var cb = _a[_i];
            try {
                cb();
            }
            catch (_b) {
                /* nada */
            }
        }
    };
    EstacionGlobal.prototype.sesionActual = function () {
        return this.sesion;
    };
    /**
     * Sintoniza una estación por su enlace (`/estaciones/vivo/<id>?f=…` o con `#f=…&k=…`). Si el
     * enlace trae la llave de control (`c=`), este medio pasa a controlarla.
     */
    EstacionGlobal.prototype.sintonizar = function (href_1) {
        return __awaiter(this, arguments, void 0, function (href, op) {
            var leido, ficha, token, llave, referencia, sesion, _i, _a, c, internet, crearCanalRele, _b, temaPrivado, temaPublico, url, tema, _c, canalRele_1, bajaLocal;
            var _this = this;
            var _d, _e, _f, _g, _h, _j, _k, _l;
            if (op === void 0) { op = {}; }
            return __generator(this, function (_m) {
                switch (_m.label) {
                    case 0:
                        leido = (0, transmision_parametrica_1.leerEnlaceSesion)(href);
                        ficha = (_e = (_d = op.ficha) !== null && _d !== void 0 ? _d : leido === null || leido === void 0 ? void 0 : leido.ficha) !== null && _e !== void 0 ? _e : null;
                        if (!leido || !ficha || ficha.id !== leido.id) {
                            return [2 /*return*/, this.fallo("El enlace no trae los datos de la estación (o están dañados).")];
                        }
                        token = (_j = (_g = (_f = op.token) !== null && _f !== void 0 ? _f : leido.token) !== null && _g !== void 0 ? _g : (_h = (0, llaves_locales_1.registroDe)(ficha.id)) === null || _h === void 0 ? void 0 : _h.token) !== null && _j !== void 0 ? _j : null;
                        if (ficha.privada && !token)
                            return [2 /*return*/, this.fallo("Esta estación es privada y el enlace no trae la invitación.")];
                        return [4 /*yield*/, (0, cripto_estacion_1.llaveCasaConId)(ficha.pk, ficha.id)];
                    case 1:
                        if (!(_m.sent()))
                            return [2 /*return*/, this.fallo("La llave de la estación no corresponde a su enlace.")];
                        if (!(((_k = this.sesion) === null || _k === void 0 ? void 0 : _k.ficha.id) === ficha.id)) return [3 /*break*/, 4];
                        if (!leido.control) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.importarControl(ficha, leido.control, token)];
                    case 2:
                        _m.sent();
                        _m.label = 3;
                    case 3: return [2 /*return*/, { ok: true }];
                    case 4:
                        this.salir(false);
                        this.cargando = true;
                        this.error = null;
                        this.emitir();
                        return [4 /*yield*/, (0, llaves_locales_1.llaveDe)(ficha.id)];
                    case 5:
                        llave = _m.sent();
                        if (!(!llave && leido.control)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.validarControl(ficha, leido.control)];
                    case 6:
                        llave = _m.sent();
                        _m.label = 7;
                    case 7:
                        if (llave && leido.control) {
                            (0, llaves_locales_1.guardarControlImportado)(ficha.id, leido.control, { enlace: (0, transmision_parametrica_1.enlaceDeSesion)(ficha, { token: token !== null && token !== void 0 ? token : undefined }), titulo: ficha.titulo, token: token !== null && token !== void 0 ? token : undefined });
                        }
                        referencia = !!llave && !!((_l = (0, llaves_locales_1.registroDe)(ficha.id)) === null || _l === void 0 ? void 0 : _l.referencia);
                        sesion = new sesion_en_vivo_1.SesionEnVivo({ ficha: ficha, token: token, llave: llave, referencia: referencia });
                        this.sesion = sesion;
                        this.href = (0, transmision_parametrica_1.enlaceDeSesion)(ficha, { token: token !== null && token !== void 0 ? token : undefined });
                        this.bajas.push(sesion.suscribir(function () { return _this.emitir(); }));
                        for (_i = 0, _a = this.extras; _i < _a.length; _i++) {
                            c = _a[_i];
                            sesion.agregarCanal(c);
                        }
                        return [4 /*yield*/, (0, canales_estacion_1.crearCanalInternet)(ficha.id, ficha.privada ? token : null).catch(function () { return null; })];
                    case 8:
                        internet = _m.sent();
                        if (this.sesion !== sesion) {
                            internet === null || internet === void 0 ? void 0 : internet.cerrar();
                            return [2 /*return*/, { ok: false, motivo: "Se cambió de estación mientras conectaba." }];
                        }
                        if (internet)
                            sesion.agregarCanal(internet);
                        if (!process.env.NEXT_PUBLIC_ESTACIONES_RELE_URL) return [3 /*break*/, 14];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./canal-rele"); })];
                    case 9:
                        crearCanalRele = (_m.sent()).crearCanalRele;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./cripto-estacion"); })];
                    case 10:
                        _b = _m.sent(), temaPrivado = _b.temaPrivado, temaPublico = _b.temaPublico;
                        url = process.env.NEXT_PUBLIC_ESTACIONES_RELE_URL;
                        if (!ficha.privada) return [3 /*break*/, 12];
                        return [4 /*yield*/, temaPrivado(ficha.id, token)];
                    case 11:
                        _c = _m.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        _c = temaPublico(ficha.id);
                        _m.label = 13;
                    case 13:
                        tema = _c;
                        canalRele_1 = crearCanalRele(url, tema);
                        sesion.agregarCanal(canalRele_1);
                        this.bajas.push(function () { return canalRele_1.cerrar(); });
                        _m.label = 14;
                    case 14: return [4 /*yield*/, (0, canales_estacion_1.engancharEnlacesLocales)(function (c) { return sesion.agregarCanal(c); }, function (c) { return sesion.quitarCanal(c); })];
                    case 15:
                        bajaLocal = _m.sent();
                        this.bajas.push(bajaLocal);
                        sesion.arrancar();
                        this.motor.seguir(function () { return (_this.sesion ? { estado: _this.sesion.foto().estado, ahora: _this.sesion.ahora() } : null); });
                        this.bajas.push(this.latirFila(sesion));
                        this.recordar(this.href);
                        this.cargando = false;
                        if (!internet)
                            this.error = "Sin conexión a internet: solo por enlaces locales (si los hay).";
                        this.emitir();
                        return [2 /*return*/, { ok: true }];
                }
            });
        });
    };
    /** Abre el audio (debe llamarse desde un gesto: pulsar «Escuchar»). */
    EstacionGlobal.prototype.escuchar = function () {
        return __awaiter(this, void 0, void 0, function () {
            var ok;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.motor.preparar()];
                    case 1:
                        ok = _a.sent();
                        if (ok)
                            this.motor.programar();
                        this.emitir();
                        return [2 /*return*/, ok];
                }
            });
        });
    };
    /** Acción para TODOS (solo con control). */
    EstacionGlobal.prototype.controlar = function (tipo_1) {
        return __awaiter(this, arguments, void 0, function (tipo, extra) {
            var r;
            if (extra === void 0) { extra = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.sesion)
                            return [2 /*return*/, { ok: false, motivo: "No hay ninguna estación sintonizada." }];
                        return [4 /*yield*/, this.sesion.accion(tipo, extra)];
                    case 1:
                        r = _a.sent();
                        this.emitir();
                        return [2 /*return*/, { ok: r.ok, motivo: r.motivo }];
                }
            });
        });
    };
    EstacionGlobal.prototype.volumen = function (v) {
        this.motor.volumen(v);
        this.emitir();
    };
    EstacionGlobal.prototype.silenciar = function (si) {
        this.motor.silenciar(si);
        this.emitir();
    };
    /** Sale de la estación en esta pestaña (los demás siguen). */
    EstacionGlobal.prototype.salir = function (olvidar) {
        var _a;
        if (olvidar === void 0) { olvidar = true; }
        for (var _i = 0, _b = this.bajas.splice(0); _i < _b.length; _i++) {
            var b = _b[_i];
            try {
                b();
            }
            catch (_c) {
                /* nada */
            }
        }
        (_a = this.sesion) === null || _a === void 0 ? void 0 : _a.cerrar();
        this.sesion = null;
        this.motor.cerrar();
        this.motor = new motor_estacion_1.MotorSonido();
        this.href = null;
        this.cargando = false;
        if (olvidar) {
            this.error = null;
            this.recordar(null);
        }
        this.emitir();
    };
    /** Un canal más para la sesión actual y las siguientes (el puente con la app oficial). */
    EstacionGlobal.prototype.agregarCanalExtra = function (c) {
        var _this = this;
        var _a;
        this.extras.add(c);
        (_a = this.sesion) === null || _a === void 0 ? void 0 : _a.agregarCanal(c);
        return function () {
            var _a;
            _this.extras.delete(c);
            (_a = _this.sesion) === null || _a === void 0 ? void 0 : _a.quitarCanal(c);
        };
    };
    /** La estación que había sintonizada antes de recargar (sin llave de control). */
    EstacionGlobal.prototype.recordada = function () {
        try {
            return window.localStorage.getItem(CLAVE_SINTONIZADA);
        }
        catch (_a) {
            return null;
        }
    };
    EstacionGlobal.prototype.recordar = function (href) {
        try {
            if (href)
                window.localStorage.setItem(CLAVE_SINTONIZADA, href);
            else
                window.localStorage.removeItem(CLAVE_SINTONIZADA);
        }
        catch (_a) {
            /* sin almacenamiento */
        }
    };
    EstacionGlobal.prototype.fallo = function (motivo) {
        this.error = motivo;
        this.cargando = false;
        this.emitir();
        return { ok: false, motivo: motivo };
    };
    EstacionGlobal.prototype.validarControl = function (ficha, control) {
        return __awaiter(this, void 0, void 0, function () {
            var llave;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, cripto_estacion_1.importarPrivada)(control)];
                    case 1:
                        llave = _a.sent();
                        if (!llave)
                            return [2 /*return*/, null];
                        return [4 /*yield*/, (0, cripto_estacion_1.publicaDePrivada)(llave)];
                    case 2: return [2 /*return*/, (_a.sent()) === ficha.pk ? llave : null];
                }
            });
        });
    };
    EstacionGlobal.prototype.importarControl = function (ficha, control, token) {
        return __awaiter(this, void 0, void 0, function () {
            var llave;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.validarControl(ficha, control)];
                    case 1:
                        llave = _a.sent();
                        if (!llave || !this.sesion)
                            return [2 /*return*/];
                        (0, llaves_locales_1.guardarControlImportado)(ficha.id, control, { enlace: (0, transmision_parametrica_1.enlaceDeSesion)(ficha, { token: token !== null && token !== void 0 ? token : undefined }), titulo: ficha.titulo, token: token !== null && token !== void 0 ? token : undefined });
                        this.sesion.tomarControl(llave);
                        this.emitir();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * El anfitrión mantiene su fila del directorio fiel a la sesión: latido cada 60 s mientras suena
     * (el directorio solo dice «en directo» si el anfitrión está de verdad), y pausada/terminada en
     * cuanto la línea de tiempo llega a esa acción.
     */
    EstacionGlobal.prototype.latirFila = function (sesion) {
        var _this = this;
        var parado = false;
        var ultimaFase = null;
        var fila = function () {
            var _a, _b;
            var f = sesion.foto();
            return f.control ? (_b = (_a = (0, llaves_locales_1.registroDe)(f.ficha.id)) === null || _a === void 0 ? void 0 : _a.fila) !== null && _b !== void 0 ? _b : null : null;
        };
        var vuelta = function () { return __awaiter(_this, void 0, void 0, function () {
            var f, id, latirEstacion;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (parado)
                            return [2 /*return*/];
                        f = sesion.foto();
                        id = fila();
                        if (!(id && f.posicion.fase === "sonando")) return [3 /*break*/, 3];
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./datos"); })];
                    case 1:
                        latirEstacion = (_b.sent()).latirEstacion;
                        return [4 /*yield*/, latirEstacion(id, (_a = f.oyentes) !== null && _a !== void 0 ? _a : undefined).catch(function () { return false; })];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3:
                        if (!parado)
                            h = setTimeout(vuelta, LATIDO_FILA_MS);
                        return [2 /*return*/];
                }
            });
        }); };
        var alCambiar = function () { return __awaiter(_this, void 0, void 0, function () {
            var id, fase, antes, datos;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        id = fila();
                        if (!id || parado)
                            return [2 /*return*/];
                        fase = sesion.foto().posicion.fase;
                        if (fase === ultimaFase)
                            return [2 /*return*/];
                        antes = ultimaFase;
                        ultimaFase = fase;
                        return [4 /*yield*/, Promise.resolve().then(function () { return require("./datos"); })];
                    case 1:
                        datos = _b.sent();
                        if (!(fase === "pausada")) return [3 /*break*/, 3];
                        return [4 /*yield*/, datos.pausarEstacion(id, true).catch(function () { return false; })];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 3:
                        if (!(fase === "terminada")) return [3 /*break*/, 5];
                        return [4 /*yield*/, datos.terminarEstacion(id).catch(function () { return false; })];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 5:
                        if (!(fase === "sonando")) return [3 /*break*/, 11];
                        if (!(antes === "pausada")) return [3 /*break*/, 7];
                        return [4 /*yield*/, datos.pausarEstacion(id, false).catch(function () { return false; })];
                    case 6:
                        _b.sent();
                        _b.label = 7;
                    case 7:
                        if (!(antes === "terminada")) return [3 /*break*/, 9];
                        return [4 /*yield*/, datos.editarEstacion(id, { termina_en: null }).catch(function () { return null; })];
                    case 8:
                        _b.sent();
                        _b.label = 9;
                    case 9: return [4 /*yield*/, datos.latirEstacion(id, (_a = sesion.foto().oyentes) !== null && _a !== void 0 ? _a : undefined).catch(function () { return false; })];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11: return [2 /*return*/];
                }
            });
        }); };
        // La fase cambia sola al llegar el instante de una acción: se mira cada 2 s y en cada aviso.
        var baja = sesion.suscribir(function () { return void alCambiar(); });
        var mirar = setInterval(function () { return void alCambiar(); }, 2000);
        var h = setTimeout(vuelta, 5000);
        return function () {
            parado = true;
            baja();
            clearInterval(mirar);
            clearTimeout(h);
        };
    };
    return EstacionGlobal;
}());
var unica = null;
function estacionGlobal() {
    if (!unica)
        unica = new EstacionGlobal();
    return unica;
}
var VACIA = {
    href: null,
    sesion: null,
    motor: MOTOR_VACIO,
    volumen: 0.8,
    silenciada: false,
    cargando: false,
    error: null,
    fila: null,
};
/** Foto reactiva de la estación global (para la interfaz). */
function useEstacionGlobal() {
    var g = estacionGlobal();
    return (0, react_1.useSyncExternalStore)(g.suscribir, g.foto, function () { return VACIA; });
}
