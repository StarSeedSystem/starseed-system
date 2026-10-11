"use strict";
/**
 * sesion-en-vivo — una estación en vivo conectada: canales, firmas, reloj común y línea de tiempo.
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§4).
 *
 * Une las tres piezas puras —modelo (`transmision-parametrica.ts`), reloj (`reloj-comun.ts`) y
 * firmas (`cripto-estacion.ts`)— con uno o varios CANALES por los que viajan los mensajes:
 * Supabase Realtime (internet) y enlaces locales emparejados sin internet (P2P). La app oficial
 * dentro del OS no es un canal: habla con el OS por `puente-omnifrecuencias.ts`. Un canal es solo
 * «manda un texto / avísame cuando llegue uno»: este módulo no sabe de redes, por eso se prueba
 * entero con canales en memoria.
 *
 * Papeles:
 *   · CONTROL: quien tiene la llave privada (el anfitrión, en cualquiera de sus medios). Firma
 *     acciones, estados y respuestas del reloj.
 *   · REFERENCIA: UN medio del anfitrión (el que creó la sesión) cuyo reloj es el común. Los demás
 *     medios con control se sincronizan con él y solo contestan la hora si no lo oyen (30 s).
 *   · OYENTE: verifica todo lo firmado; descarta lo que no lo esté (y lo cuenta en `descartados`).
 *
 * Sobre de cada mensaje: `{"t":"est","s":id,"e":evento,"d":json | "x":cifrado,"f":firma}`. La firma
 * cubre `s\ne\n(d|x)`. En las privadas la carga va cifrada con la clave del token (AES-GCM).
 * Las acciones se programan `margenMs` en el futuro (600 ms) para que lleguen a todos antes de
 * su instante: así empiezan a la vez en todos los medios.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SesionEnVivo = void 0;
var cripto_estacion_1 = require("./cripto-estacion");
var reloj_comun_1 = require("./reloj-comun");
var transmision_parametrica_1 = require("./transmision-parametrica");
var FIRMADOS = new Set(["estado", "accion", "pong"]);
var ESPERA_REFERENCIA_MS = 30000;
var SesionEnVivo = /** @class */ (function () {
    function SesionEnVivo(op) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        this.canales = [];
        this.bajas = new Map();
        this.oyentesCb = new Set();
        this.paradas = [];
        this.anfitrionVisto = null;
        this.referenciaVista = null;
        this.descartados = 0;
        this.ultimoEstadoEnviado = new Map();
        this.pedidos = 0;
        this.lotes = new Map();
        this.arrancada = false;
        this.cerrada = false;
        this.ficha = op.ficha;
        this.token = (_a = op.token) !== null && _a !== void 0 ? _a : null;
        this.llave = (_b = op.llave) !== null && _b !== void 0 ? _b : null;
        this.referencia = !!op.referencia && !!op.llave;
        this.reloj = (_c = op.reloj) !== null && _c !== void 0 ? _c : new reloj_comun_1.RelojComun({ esReferencia: this.referencia });
        if (this.referencia)
            this.reloj.hacerReferencia(true);
        this.estado = op.estadoInicial && op.estadoInicial.ficha.id === op.ficha.id
            ? op.estadoInicial
            : { ficha: op.ficha, linea: [], rev: 0 };
        this.margenMs = (_d = op.margenMs) !== null && _d !== void 0 ? _d : 600;
        this.latidoMs = (_e = op.latidoMs) !== null && _e !== void 0 ? _e : 30000;
        this.lotePongMs = (_f = op.lotePongMs) !== null && _f !== void 0 ? _f : 200;
        // (OPD1010 · 2026-10-10) Ligados a globalThis: guardado en un campo, `this.poner(fn, ms)`
        // llama a `setTimeout` con `this` = la sesión y el navegador lanza «Illegal invocation»
        // (medido en localhost:9002: `arrancar` y `alAbrirCanal` reventaban al suscribirse el canal
        // de Realtime y el panel se quedaba en «conectando»). En Node no falla: por eso las pruebas,
        // que inyectan sus propios temporizadores, no lo veían.
        this.poner = (_g = op.poner) !== null && _g !== void 0 ? _g : globalThis.setTimeout.bind(globalThis);
        this.quitar = (_h = op.quitar) !== null && _h !== void 0 ? _h : globalThis.clearTimeout.bind(globalThis);
        this.opSondeo = __assign({ poner: this.poner, quitar: this.quitar }, ((_j = op.sondeo) !== null && _j !== void 0 ? _j : {}));
        for (var _i = 0, _l = (_k = op.canales) !== null && _k !== void 0 ? _k : []; _i < _l.length; _i++) {
            var c = _l[_i];
            this.agregarCanal(c);
        }
        this.paradas.push(this.reloj.suscribir(function () { return _this.emitir(); }));
    }
    /* ─────────────── ciclo de vida ─────────────── */
    SesionEnVivo.prototype.arrancar = function () {
        var _this = this;
        if (this.arrancada || this.cerrada)
            return;
        this.arrancada = true;
        // Comprobación de identidad: la llave pública de la ficha tiene que dar su id.
        void (0, cripto_estacion_1.llaveCasaConId)(this.ficha.pk, this.ficha.id).then(function (ok) {
            if (!ok) {
                _this.descartados++;
                _this.cerrar();
            }
        });
        if (!this.referencia) {
            this.paradas.push((0, reloj_comun_1.programarSondeo)(function () { return _this.preguntarHora(); }, this.opSondeo));
        }
        if (!this.llave)
            this.pedirEstado();
        var latir = function () {
            if (_this.cerrada)
                return;
            if (_this.llave)
                void _this.difundirEstado();
            else if (_this.anfitrionVisto === null && _this.pedidos < 6)
                _this.pedirEstado();
            h = _this.poner(latir, _this.llave ? _this.latidoMs : 5000);
        };
        var h = this.poner(latir, this.llave ? 500 : 5000);
        this.paradas.push(function () { return _this.quitar(h); });
    };
    SesionEnVivo.prototype.cerrar = function () {
        if (this.cerrada)
            return;
        this.cerrada = true;
        for (var _i = 0, _a = this.lotes.values(); _i < _a.length; _i++) {
            var l = _a[_i];
            if (l.h)
                this.quitar(l.h);
        }
        this.lotes.clear();
        for (var _b = 0, _c = this.paradas.splice(0); _b < _c.length; _b++) {
            var p = _c[_b];
            try {
                p();
            }
            catch (_d) {
                /* nada */
            }
        }
        for (var _e = 0, _f = __spreadArray([], this.canales, true); _e < _f.length; _e++) {
            var c = _f[_e];
            this.quitarCanal(c, true);
        }
        this.emitir();
    };
    SesionEnVivo.prototype.agregarCanal = function (c) {
        var _this = this;
        var _a;
        if (this.canales.includes(c) || this.cerrada)
            return;
        this.canales.push(c);
        var bajaRecibir = c.alRecibir(function (texto) { return void _this.recibir(texto, c); });
        var bajaAbrir = (_a = c.alAbrir) === null || _a === void 0 ? void 0 : _a.call(c, function () { return _this.alAbrirCanal(c); });
        this.bajas.set(c, function () {
            bajaRecibir();
            bajaAbrir === null || bajaAbrir === void 0 ? void 0 : bajaAbrir();
        });
        if (this.arrancada && safe(function () { return c.abierto(); }, false))
            this.alAbrirCanal(c);
        this.emitir();
    };
    /** Un canal recién abierto: el anfitrión le manda el estado; el oyente lo pide y mide la hora. */
    SesionEnVivo.prototype.alAbrirCanal = function (c) {
        var _this = this;
        if (!this.arrancada || this.cerrada || !this.canales.includes(c))
            return;
        if (this.llave)
            void this.difundirEstado(c);
        else
            this.pedirEstado(c);
        if (this.referencia)
            return;
        var _loop_1 = function (i) {
            var h = this_1.poner(function () {
                if (_this.cerrada || !safe(function () { return c.abierto(); }, false))
                    return;
                _this.mandarPing(c);
            }, i * 150);
            this_1.paradas.push(function () { return _this.quitar(h); });
        };
        var this_1 = this;
        // Ráfaga corta por ESTE canal: las preguntas del arranque pudieron salir antes de abrirse.
        for (var i = 0; i < 6; i++) {
            _loop_1(i);
        }
        this.emitir();
    };
    SesionEnVivo.prototype.quitarCanal = function (c, cerrarlo) {
        var _a;
        if (cerrarlo === void 0) { cerrarlo = false; }
        (_a = this.bajas.get(c)) === null || _a === void 0 ? void 0 : _a();
        this.bajas.delete(c);
        this.canales = this.canales.filter(function (x) { return x !== c; });
        if (cerrarlo) {
            try {
                c.cerrar();
            }
            catch (_b) {
                /* nada */
            }
        }
        this.emitir();
    };
    /** Da el control a este medio (enlace de control importado). */
    SesionEnVivo.prototype.tomarControl = function (llave) {
        this.llave = llave;
        this.emitir();
    };
    /* ─────────────── lectura ─────────────── */
    SesionEnVivo.prototype.ahora = function () {
        return this.reloj.ahora();
    };
    SesionEnVivo.prototype.foto = function () {
        var oy = this.canales.map(function (c) { var _a, _b; return (_b = (_a = c.oyentes) === null || _a === void 0 ? void 0 : _a.call(c)) !== null && _b !== void 0 ? _b : null; }).filter(function (n) { return typeof n === "number"; });
        return {
            ficha: this.ficha,
            estado: this.estado,
            posicion: (0, transmision_parametrica_1.posicionEn)(this.estado, this.reloj.ahora()),
            reloj: this.reloj.estado(),
            control: !!this.llave,
            referencia: this.referencia,
            canales: this.canales.map(function (c) { return ({ tipo: c.tipo, etiqueta: c.etiqueta, abierto: safe(function () { return c.abierto(); }, false) }); }),
            oyentes: oy.length ? oy.reduce(function (a, b) { return a + b; }, 0) : null,
            anfitrionVisto: this.llave ? this.reloj.horaLocal() : this.anfitrionVisto,
            descartados: this.descartados,
        };
    };
    SesionEnVivo.prototype.suscribir = function (cb) {
        var _this = this;
        this.oyentesCb.add(cb);
        return function () {
            _this.oyentesCb.delete(cb);
        };
    };
    /* ─────────────── control ─────────────── */
    /**
     * Programa una acción para todos. Solo con control. Por defecto ocurre `margenMs` después de
     * ahora en el reloj común, para que llegue a todos antes de su instante.
     */
    SesionEnVivo.prototype.accion = function (tipo_1) {
        return __awaiter(this, arguments, void 0, function (tipo, extra) {
            var t, bruto, p, a;
            var _a;
            if (extra === void 0) { extra = {}; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.llave)
                            return [2 /*return*/, { ok: false, motivo: "Solo quien emite la estación puede cambiarla para todos." }];
                        if (this.reloj.estado().modo === "sin-referencia") {
                            return [2 /*return*/, { ok: false, motivo: "Todavía no hay hora común con la referencia: espera a que se sincronice." }];
                        }
                        t = this.reloj.ahora() + Math.max(0, (_a = extra.enMs) !== null && _a !== void 0 ? _a : this.margenMs);
                        bruto = { n: (0, transmision_parametrica_1.numeroAccion)(t), t: t, tipo: tipo };
                        if (tipo === "parametros") {
                            p = (0, transmision_parametrica_1.sanearParametros)(extra.params, this.ficha.fuente);
                            if (!p)
                                return [2 /*return*/, { ok: false, motivo: "Parámetros no válidos para esta estación." }];
                            bruto.params = p;
                        }
                        if (tipo === "volumen")
                            bruto.volumen = extra.volumen;
                        a = (0, transmision_parametrica_1.sanearAccion)(bruto, this.ficha.fuente);
                        if (!a)
                            return [2 /*return*/, { ok: false, motivo: "Acción no válida." }];
                        this.estado = (0, transmision_parametrica_1.aplicarAccion)(this.estado, a);
                        this.emitir();
                        return [4 /*yield*/, this.mandar("accion", JSON.stringify(a))];
                    case 1:
                        _b.sent();
                        return [2 /*return*/, { ok: true, accion: a }];
                }
            });
        });
    };
    /** Mide la hora ahora mismo (una pregunta por canal), además del sondeo periódico. */
    SesionEnVivo.prototype.sondearAhora = function () {
        this.preguntarHora();
    };
    /** Pide el estado al anfitrión (lo hace sola al arrancar). */
    SesionEnVivo.prototype.pedirEstado = function (solo) {
        this.pedidos++;
        void this.mandar("pedir", "{}", solo);
    };
    /* ─────────────── envío ─────────────── */
    SesionEnVivo.prototype.sobre = function (e, d) {
        return __awaiter(this, void 0, void 0, function () {
            var s, carga, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        s = { t: "est", s: this.ficha.id, e: e };
                        carga = d;
                        if (!this.ficha.privada) return [3 /*break*/, 2];
                        if (!this.token)
                            return [2 /*return*/, null]; // una privada sin token no puede hablar
                        return [4 /*yield*/, (0, cripto_estacion_1.cifrar)(this.ficha.id, this.token, d)];
                    case 1:
                        carga = _b.sent();
                        s.x = carga;
                        return [3 /*break*/, 3];
                    case 2:
                        s.d = d;
                        _b.label = 3;
                    case 3:
                        if (!FIRMADOS.has(e)) return [3 /*break*/, 5];
                        if (!this.llave)
                            return [2 /*return*/, null];
                        _a = s;
                        return [4 /*yield*/, (0, cripto_estacion_1.firmar)(this.llave, "".concat(s.s, "\n").concat(e, "\n").concat(carga))];
                    case 4:
                        _a.f = _b.sent();
                        _b.label = 5;
                    case 5: return [2 /*return*/, JSON.stringify(s)];
                }
            });
        });
    };
    SesionEnVivo.prototype.mandar = function (e, d, solo) {
        return __awaiter(this, void 0, void 0, function () {
            var texto, _i, _a, c;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.sobre(e, d)];
                    case 1:
                        texto = _b.sent();
                        if (!texto)
                            return [2 /*return*/];
                        for (_i = 0, _a = solo ? [solo] : this.canales; _i < _a.length; _i++) {
                            c = _a[_i];
                            try {
                                if (c.abierto())
                                    c.enviar(texto);
                            }
                            catch (_c) {
                                /* un canal caído no frena a los demás */
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    SesionEnVivo.prototype.difundirEstado = function (solo) {
        return __awaiter(this, void 0, void 0, function () {
            var ahora, destinos, _i, destinos_1, c, texto, _a, destinos_2, c;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.llave)
                            return [2 /*return*/];
                        ahora = this.reloj.horaLocal();
                        destinos = (solo ? [solo] : this.canales).filter(function (c) { var _a; return ahora - ((_a = _this.ultimoEstadoEnviado.get(c)) !== null && _a !== void 0 ? _a : 0) >= 1000; });
                        if (!destinos.length)
                            return [2 /*return*/];
                        for (_i = 0, destinos_1 = destinos; _i < destinos_1.length; _i++) {
                            c = destinos_1[_i];
                            this.ultimoEstadoEnviado.set(c, ahora);
                        }
                        return [4 /*yield*/, this.sobre("estado", (0, transmision_parametrica_1.serializarEstado)(this.estado))];
                    case 1:
                        texto = _b.sent();
                        if (!texto)
                            return [2 /*return*/];
                        for (_a = 0, destinos_2 = destinos; _a < destinos_2.length; _a++) {
                            c = destinos_2[_a];
                            try {
                                if (c.abierto())
                                    c.enviar(texto);
                            }
                            catch (_c) {
                                /* nada */
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    SesionEnVivo.prototype.preguntarHora = function () {
        if (this.cerrada)
            return;
        var _loop_2 = function (c) {
            if (!safe(function () { return c.abierto(); }, false))
                return "continue";
            this_2.mandarPing(c);
        };
        var this_2 = this;
        for (var _i = 0, _a = this.canales; _i < _a.length; _i++) {
            var c = _a[_i];
            _loop_2(c);
        }
    };
    /**
     * Una pregunta de hora. En las públicas sale en el MISMO instante en que se anota t0 (sin pasar
     * por promesas): cualquier espera entre anotar y enviar sería un error asimétrico. En las privadas
     * hay que cifrar antes (≈ 0,1 ms de sesgo, dentro de la precisión que se enseña).
     */
    SesionEnVivo.prototype.mandarPing = function (c) {
        if (this.ficha.privada) {
            void this.mandar("ping", JSON.stringify(this.reloj.nuevoPing()), c);
            return;
        }
        var p = this.reloj.nuevoPing();
        var sobre = { t: "est", s: this.ficha.id, e: "ping", d: JSON.stringify(p) };
        try {
            c.enviar(JSON.stringify(sobre));
        }
        catch (_a) {
            /* canal caído */
        }
    };
    /* ─────────────── recepción ─────────────── */
    SesionEnVivo.prototype.recibir = function (texto, canal) {
        return __awaiter(this, void 0, void 0, function () {
            var llegada, s, carga, _a, d, claro, datos, _b, bruto, lista, _i, lista_1, p, e, a;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        llegada = this.reloj.horaLocal();
                        if (this.cerrada || typeof texto !== "string" || texto.length > 40000)
                            return [2 /*return*/];
                        try {
                            s = JSON.parse(texto);
                        }
                        catch (_d) {
                            return [2 /*return*/];
                        }
                        if (!s || s.t !== "est" || s.s !== this.ficha.id)
                            return [2 /*return*/];
                        carga = this.ficha.privada ? s.x : s.d;
                        if (typeof carga !== "string")
                            return [2 /*return*/];
                        if (!FIRMADOS.has(s.e)) return [3 /*break*/, 3];
                        _a = typeof s.f !== "string";
                        if (_a) return [3 /*break*/, 2];
                        return [4 /*yield*/, (0, cripto_estacion_1.verificar)(this.ficha.pk, "".concat(s.s, "\n").concat(s.e, "\n").concat(carga), s.f)];
                    case 1:
                        _a = !(_c.sent());
                        _c.label = 2;
                    case 2:
                        if (_a) {
                            this.descartados++;
                            this.emitir();
                            return [2 /*return*/];
                        }
                        _c.label = 3;
                    case 3:
                        d = carga;
                        if (!this.ficha.privada) return [3 /*break*/, 5];
                        if (!this.token)
                            return [2 /*return*/];
                        return [4 /*yield*/, (0, cripto_estacion_1.descifrar)(this.ficha.id, this.token, carga)];
                    case 4:
                        claro = _c.sent();
                        if (claro === null) {
                            this.descartados++;
                            return [2 /*return*/];
                        }
                        d = claro;
                        _c.label = 5;
                    case 5:
                        try {
                            datos = JSON.parse(d);
                        }
                        catch (_e) {
                            return [2 /*return*/];
                        }
                        _b = s.e;
                        switch (_b) {
                            case "ping": return [3 /*break*/, 6];
                            case "pong": return [3 /*break*/, 8];
                            case "estado": return [3 /*break*/, 9];
                            case "accion": return [3 /*break*/, 10];
                            case "pedir": return [3 /*break*/, 11];
                        }
                        return [3 /*break*/, 14];
                    case 6: return [4 /*yield*/, this.atenderPing(datos, llegada, canal)];
                    case 7:
                        _c.sent();
                        return [3 /*break*/, 14];
                    case 8:
                        {
                            bruto = datos;
                            lista = (Array.isArray(bruto.l) ? (bruto.l.slice(0, 64)) : [bruto]);
                            this.anfitrionVisto = llegada;
                            for (_i = 0, lista_1 = lista; _i < lista_1.length; _i++) {
                                p = lista_1[_i];
                                if (!p || typeof p !== "object")
                                    continue;
                                if (p.estrato === 0)
                                    this.referenciaVista = llegada;
                                if (typeof p.id === "string" && p.para === this.reloj.id)
                                    this.reloj.recibirPong(p, llegada);
                            }
                            return [3 /*break*/, 14];
                        }
                        _c.label = 9;
                    case 9:
                        {
                            e = (0, transmision_parametrica_1.leerEstado)(d);
                            if (!e || e.ficha.id !== this.ficha.id || e.ficha.pk !== this.ficha.pk) {
                                this.descartados++;
                                return [3 /*break*/, 14];
                            }
                            this.anfitrionVisto = llegada;
                            this.estado = (0, transmision_parametrica_1.fusionarEstados)(this.estado, __assign(__assign({}, e), { ficha: this.estado.ficha }));
                            this.emitir();
                            return [3 /*break*/, 14];
                        }
                        _c.label = 10;
                    case 10:
                        {
                            a = (0, transmision_parametrica_1.sanearAccion)(datos, this.ficha.fuente);
                            if (!a) {
                                this.descartados++;
                                return [3 /*break*/, 14];
                            }
                            this.anfitrionVisto = llegada;
                            this.estado = (0, transmision_parametrica_1.aplicarAccion)(this.estado, a);
                            this.emitir();
                            return [3 /*break*/, 14];
                        }
                        _c.label = 11;
                    case 11:
                        if (!this.llave) return [3 /*break*/, 13];
                        return [4 /*yield*/, this.difundirEstado(canal)];
                    case 12:
                        _c.sent();
                        _c.label = 13;
                    case 13: return [3 /*break*/, 14];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    SesionEnVivo.prototype.atenderPing = function (p, llegada, canal) {
        return __awaiter(this, void 0, void 0, function () {
            var vista, limpio, pong, lote;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.llave || !p || typeof p.id !== "string" || typeof p.de !== "string" || !Number.isFinite(p.t0))
                            return [2 /*return*/];
                        if (p.de === this.reloj.id)
                            return [2 /*return*/];
                        // Un medio con control que no es la referencia solo contesta si la referencia calla.
                        if (!this.referencia) {
                            vista = this.referenciaVista;
                            if (vista !== null && this.reloj.horaLocal() - vista < ESPERA_REFERENCIA_MS)
                                return [2 /*return*/];
                        }
                        limpio = { id: p.id.slice(0, 40), de: p.de.slice(0, 40), t0: p.t0 };
                        if (!(this.lotePongMs <= 0)) return [3 /*break*/, 3];
                        pong = this.reloj.atenderPing(limpio, llegada);
                        if (!pong) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.mandar("pong", JSON.stringify({ l: [pong] }), canal)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                    case 3:
                        lote = this.lotes.get(canal);
                        if (!lote) {
                            lote = { pings: [], h: null };
                            this.lotes.set(canal, lote);
                        }
                        if (lote.pings.length >= 64)
                            return [2 /*return*/];
                        lote.pings.push({ p: limpio, t1: llegada });
                        if (!lote.h)
                            lote.h = this.poner(function () { return void _this.vaciarLote(canal); }, this.lotePongMs);
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Contesta todas las preguntas del lote en UN mensaje; t2 es el mismo para todas (el de ahora). */
    SesionEnVivo.prototype.vaciarLote = function (canal) {
        return __awaiter(this, void 0, void 0, function () {
            var lote, l;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        lote = this.lotes.get(canal);
                        this.lotes.delete(canal);
                        if (!lote || this.cerrada)
                            return [2 /*return*/];
                        l = lote.pings.map(function (x) { return _this.reloj.atenderPing(x.p, x.t1); }).filter(function (x) { return !!x; });
                        if (!l.length) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.mandar("pong", JSON.stringify({ l: l }), canal)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    SesionEnVivo.prototype.emitir = function () {
        if (!this.oyentesCb.size)
            return;
        var f = this.foto();
        for (var _i = 0, _a = Array.from(this.oyentesCb); _i < _a.length; _i++) {
            var cb = _a[_i];
            try {
                cb(f);
            }
            catch (_b) {
                /* nada */
            }
        }
    };
    return SesionEnVivo;
}());
exports.SesionEnVivo = SesionEnVivo;
function safe(fn, porDefecto) {
    try {
        return fn();
    }
    catch (_a) {
        return porDefecto;
    }
}
