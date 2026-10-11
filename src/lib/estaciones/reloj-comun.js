"use strict";
/**
 * reloj-comun — UN reloj compartido por todos los medios de una estación en vivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§2). Contrato §C de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`.
 *
 * La transmisión es PARAMÉTRICA: no viaja audio, viajan la entonación y una línea de tiempo con
 * instantes en un reloj común. Cada medio genera el sonido en local y lo programa al instante
 * exacto, así que la precisión depende del reloj, no del ancho de banda.
 *
 * Método (el de NTP, sobre el canal de la propia estación):
 *   quien pregunta anota t0 (su hora al salir) → la referencia anota t1 (al llegar) y t2 (al
 *   responder) → quien pregunta anota t3 (al volver).
 *     desfase = ((t1 − t0) + (t2 − t3)) / 2      retardo = (t3 − t0) − (t2 − t1)
 *   Se guardan varias muestras, se quedan las de MENOR retardo (las que menos cola sufrieron) y
 *   el desfase es su MEDIANA. Dos números honestos salen de ahí:
 *     · precisión estimada = dispersión de esas muestras (desviación absoluta mediana × 1,4826);
 *     · cota = la mitad del mayor retardo usado: el error máximo posible si la ida y la vuelta
 *       tardaran distinto, que ninguna medida puede descartar.
 *   La interfaz enseña las dos. Nunca se inventa una precisión: sin muestras no hay número.
 *
 * El reloj de la referencia (el anfitrión) ES el reloj común. Este módulo es puro: el canal por
 * el que viajan las preguntas y respuestas (Supabase Realtime, enlace local P2P, postMessage) lo
 * pone quien lo usa, que además verifica la firma de cada respuesta antes de dársela.
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
exports.RelojComun = void 0;
exports.muestraNtp = muestraNtp;
exports.estimarDesfase = estimarDesfase;
exports.relojLocalPorDefecto = relojLocalPorDefecto;
exports.programarSondeo = programarSondeo;
var redondear = function (n) { return Math.round(n * 10) / 10; };
/** Una muestra NTP a partir de los cuatro instantes. Null si los números no son posibles. */
function muestraNtp(t0, t1, t2, t3, estrato, at) {
    if (estrato === void 0) { estrato = 1; }
    if (at === void 0) { at = t3; }
    if (![t0, t1, t2, t3].every(function (x) { return Number.isFinite(x); }))
        return null;
    if (t2 < t1 || t3 < t0)
        return null;
    var retardo = t3 - t0 - (t2 - t1);
    // Un retardo negativo solo cabe por redondeo (relojes de 0,1 ms o peor): más allá, es basura.
    if (retardo < -1)
        return null;
    return {
        desfaseMs: (t1 - t0 + (t2 - t3)) / 2,
        retardoMs: Math.max(0, retardo),
        estrato: Math.max(1, Math.floor(estrato)),
        at: at,
    };
}
function mediana(v) {
    var s = __spreadArray([], v, true).sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Desfase con la mitad de muestras de menor retardo (como mucho `maxUsadas`): mediana y dispersión. */
function medianaMejores(muestras, maxUsadas) {
    var orden = __spreadArray([], muestras, true).sort(function (a, b) { return a.retardoMs - b.retardoMs; });
    var k = Math.max(1, Math.min(maxUsadas, Math.ceil(orden.length / 2)));
    var mejores = orden.slice(0, k);
    var desfases = mejores.map(function (m) { return m.desfaseMs; });
    var desfase = mediana(desfases);
    var retardoMax = Math.max.apply(Math, mejores.map(function (m) { return m.retardoMs; }));
    // Con una o dos muestras no hay dispersión que medir: la precisión es la cota.
    var dispersion = mejores.length >= 3 ? mediana(desfases.map(function (d) { return Math.abs(d - desfase); })) * 1.4826 : retardoMax / 2;
    return { desfase: desfase, dispersion: dispersion, retardoMax: retardoMax, retardoMin: mejores[0].retardoMs };
}
/** Ventana de muestras para el desfase SIN deriva conocida (los relojes derivan). */
var VENTANA_SIN_DERIVA_MS = 120000;
/** La deriva solo se usa con ≥ 4 rondas que abarquen ≥ 90 s: con menos, estimarla empeora el resultado. */
var RONDAS_MIN_DERIVA = 4;
var TRAMO_MIN_DERIVA_MS = 90000;
/** Ningún cristal de cuarzo sano deriva más de esto. */
var DERIVA_MAX = 500e-6;
/**
 * Estima el desfase con las mejores muestras del estrato más bajo.
 *   · Siempre: mediana de la mitad con menos retardo de los últimos 2 min.
 *   · Si hay ≥ 4 rondas de medidas (muestras a menos de 5 s entre sí) que abarcan ≥ 90 s, además la
 *     DERIVA: recta por mínimos cuadrados con la mejor muestra de cada ronda, pesada por 1/retardo².
 *     Así el reloj sigue siendo de milisegundos aunque se pregunte la hora cada pocos minutos.
 */
function estimarDesfase(muestras, maxUsadas) {
    if (maxUsadas === void 0) { maxUsadas = 8; }
    var validas = muestras.filter(function (m) { return m && Number.isFinite(m.desfaseMs) && Number.isFinite(m.retardoMs) && Number.isFinite(m.at); });
    if (!validas.length)
        return null;
    var estrato = Math.min.apply(Math, validas.map(function (m) { return m.estrato; }));
    var delEstrato = validas.filter(function (m) { return m.estrato === estrato; }).sort(function (a, b) { return a.at - b.at; });
    var tUlt = delEstrato[delEstrato.length - 1].at;
    var recientes = delEstrato.filter(function (m) { return tUlt - m.at <= VENTANA_SIN_DERIVA_MS; });
    var b = medianaMejores(recientes, maxUsadas);
    var basica = {
        desfaseMs: b.desfase,
        derivaPpm: 0,
        tRef: tUlt,
        precisionMs: redondear(Math.max(0.1, b.dispersion)),
        cotaMs: redondear(b.retardoMax / 2),
        retardoMinMs: redondear(b.retardoMin),
        muestras: validas.length,
        estrato: estrato,
    };
    // Rondas → la mejor muestra de cada una.
    var rondas = [];
    for (var _i = 0, delEstrato_1 = delEstrato; _i < delEstrato_1.length; _i++) {
        var m = delEstrato_1[_i];
        var r = rondas[rondas.length - 1];
        if (r && m.at - r[r.length - 1].at <= 5000)
            r.push(m);
        else
            rondas.push([m]);
    }
    var puntos = rondas.map(function (r) { return r.reduce(function (x, y) { return (y.retardoMs < x.retardoMs ? y : x); }); });
    if (puntos.length < RONDAS_MIN_DERIVA || puntos[puntos.length - 1].at - puntos[0].at < TRAMO_MIN_DERIVA_MS) {
        return basica;
    }
    var sw = 0, sx = 0, sy = 0;
    var w = puntos.map(function (p) { return 1 / Math.pow((p.retardoMs + 0.5), 2); });
    puntos.forEach(function (p, i) {
        sw += w[i];
        sx += w[i] * (p.at - tUlt);
        sy += w[i] * p.desfaseMs;
    });
    var mx = sx / sw;
    var my = sy / sw;
    var sxx = 0, sxy = 0;
    puntos.forEach(function (p, i) {
        var dx = p.at - tUlt - mx;
        sxx += w[i] * dx * dx;
        sxy += w[i] * dx * (p.desfaseMs - my);
    });
    if (!(sxx > 0))
        return basica;
    var pendiente = Math.max(-DERIVA_MAX, Math.min(DERIVA_MAX, sxy / sxx));
    var enUlt = my - pendiente * mx; // desfase en tUlt
    var residuos = puntos.map(function (p) { return Math.abs(p.desfaseMs - (enUlt + pendiente * (p.at - tUlt))); });
    var dispersion = residuos.length >= 3 ? mediana(residuos) * 1.4826 : b.retardoMax / 2;
    return __assign(__assign({}, basica), { desfaseMs: enUlt, derivaPpm: -pendiente * 1e6, precisionMs: redondear(Math.max(0.1, dispersion)) });
}
/** Reloj local por defecto: monotónico (no salta con ajustes del sistema) y en ms de época. */
function relojLocalPorDefecto() {
    try {
        if (typeof performance !== "undefined" && typeof performance.now === "function" && performance.timeOrigin) {
            return performance.timeOrigin + performance.now();
        }
    }
    catch (_a) {
        /* sin performance: hora del sistema */
    }
    return Date.now();
}
function idAleatorio() {
    try {
        var b = new Uint8Array(8);
        globalThis.crypto.getRandomValues(b);
        return Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    }
    catch (_a) {
        return Math.random().toString(36).slice(2, 12);
    }
}
var RelojComun = /** @class */ (function () {
    function RelojComun(op) {
        if (op === void 0) { op = {}; }
        var _a, _b, _c, _d;
        this.muestras = [];
        this.pendientes = new Map();
        this.estimacion = null;
        this.oyentes = new Set();
        this.local = (_a = op.relojLocal) !== null && _a !== void 0 ? _a : relojLocalPorDefecto;
        this.referencia = !!op.esReferencia;
        this.maxMuestras = (_b = op.maxMuestras) !== null && _b !== void 0 ? _b : 48;
        this.caducidadMs = (_c = op.caducidadMs) !== null && _c !== void 0 ? _c : 900000;
        this.id = (_d = op.id) !== null && _d !== void 0 ? _d : idAleatorio();
    }
    /** Hora local de este medio (ms de época). */
    RelojComun.prototype.horaLocal = function () {
        return this.local();
    };
    /** Desfase (común − local) en el instante local `l`, con la deriva si se conoce. */
    RelojComun.prototype.desfaseEn = function (l) {
        if (this.referencia || !this.estimacion)
            return 0;
        var e = this.estimacion;
        return e.desfaseMs - (e.derivaPpm / 1e6) * (l - e.tRef);
    };
    /** Hora común (ms). Sin referencia todavía, la local: el estado lo dice como «sin referencia». */
    RelojComun.prototype.ahora = function () {
        var l = this.local();
        return l + this.desfaseEn(l);
    };
    /** Pasa una hora común a la local de este medio. */
    RelojComun.prototype.aLocal = function (tComun) {
        return tComun - this.desfaseEn(tComun);
    };
    RelojComun.prototype.hacerReferencia = function (si) {
        this.referencia = si;
        this.emitir();
    };
    RelojComun.prototype.esReferencia = function () {
        return this.referencia;
    };
    RelojComun.prototype.estado = function () {
        var _a, _b, _c, _d, _e;
        if (this.referencia) {
            return { modo: "referencia", desfaseMs: 0, derivaPpm: 0, precisionMs: 0, cotaMs: 0, retardoMinMs: 0, muestras: 0, ultimaMuestra: null };
        }
        var e = this.estimacion;
        return {
            modo: e ? "sincronizado" : "sin-referencia",
            desfaseMs: e ? this.desfaseEn(this.local()) : 0,
            derivaPpm: (_a = e === null || e === void 0 ? void 0 : e.derivaPpm) !== null && _a !== void 0 ? _a : 0,
            precisionMs: (_b = e === null || e === void 0 ? void 0 : e.precisionMs) !== null && _b !== void 0 ? _b : null,
            cotaMs: (_c = e === null || e === void 0 ? void 0 : e.cotaMs) !== null && _c !== void 0 ? _c : null,
            retardoMinMs: (_d = e === null || e === void 0 ? void 0 : e.retardoMinMs) !== null && _d !== void 0 ? _d : null,
            muestras: (_e = e === null || e === void 0 ? void 0 : e.muestras) !== null && _e !== void 0 ? _e : 0,
            ultimaMuestra: this.muestras.length ? this.muestras[this.muestras.length - 1].at : null,
        };
    };
    RelojComun.prototype.suscribir = function (cb) {
        var _this = this;
        this.oyentes.add(cb);
        return function () {
            _this.oyentes.delete(cb);
        };
    };
    /** Prepara una pregunta de hora (anota t0). */
    RelojComun.prototype.nuevoPing = function () {
        var id = idAleatorio();
        var t0 = this.local();
        this.pendientes.set(id, t0);
        if (this.pendientes.size > 64)
            this.pendientes.delete(this.pendientes.keys().next().value);
        return { id: id, de: this.id, t0: t0 };
    };
    /**
     * La referencia contesta: `t1` es la hora LOCAL a la que llegó la pregunta (anotada al recibir,
     * antes de cualquier trabajo); t2 se toma aquí, justo antes de devolver. Firmar la respuesta
     * después (≈ 0,05–0,2 ms con ECDSA en un navegador) cuenta como camino de vuelta: un sesgo de la
     * mitad de eso, muy por debajo de la precisión que se enseña.
     */
    RelojComun.prototype.atenderPing = function (p, t1Local) {
        var _a, _b;
        if (!this.referencia && !this.estimacion)
            return null; // sin hora fiable no se contesta
        var desfase = this.desfaseEn(t1Local);
        var estrato = this.referencia ? 0 : (_b = (_a = this.estimacion) === null || _a === void 0 ? void 0 : _a.estrato) !== null && _b !== void 0 ? _b : 1;
        return { id: p.id, para: p.de, t0: p.t0, t1: t1Local + desfase, t2: this.ahora(), estrato: estrato };
    };
    /**
     * Llega una respuesta (ya verificada). `t3Local` es la hora local a la que llegó, anotada al
     * recibir y no después de verificar la firma. Devuelve true si sirvió como muestra.
     */
    RelojComun.prototype.recibirPong = function (p, t3Local) {
        var _a;
        if (this.referencia || p.para !== this.id)
            return false;
        var t0 = this.pendientes.get(p.id);
        if (t0 === undefined || t0 !== p.t0)
            return false;
        this.pendientes.delete(p.id);
        var m = muestraNtp(t0, p.t1, p.t2, t3Local, ((_a = p.estrato) !== null && _a !== void 0 ? _a : 0) + 1, t3Local);
        if (!m)
            return false;
        this.muestras.push(m);
        var corte = t3Local - this.caducidadMs;
        this.muestras = this.muestras.filter(function (x) { return x.at >= corte; }).slice(-this.maxMuestras);
        this.estimacion = estimarDesfase(this.muestras);
        this.emitir();
        return true;
    };
    /** Olvida las muestras (p. ej. al cambiar de anfitrión). */
    RelojComun.prototype.reiniciar = function () {
        this.muestras = [];
        this.pendientes.clear();
        this.estimacion = null;
        this.emitir();
    };
    RelojComun.prototype.emitir = function () {
        var e = this.estado();
        for (var _i = 0, _a = Array.from(this.oyentes); _i < _a.length; _i++) {
            var cb = _a[_i];
            try {
                cb(e);
            }
            catch (_b) {
                /* un oyente roto no para el reloj */
            }
        }
    };
    return RelojComun;
}());
exports.RelojComun = RelojComun;
/**
 * Ritmo de sondeo, pensado para gastar pocos mensajes sin perder el milisegundo:
 *   · al empezar, una ráfaga de `rafaga` preguntas separadas `rafagaMs`;
 *   · después, rondas de `porVuelta` preguntas cada `periodoMs`, que se va doblando hasta
 *     `periodoMaxMs` (con 4 rondas en 90 s ya se conoce la deriva y se puede espaciar).
 * `preguntar` manda una pregunta por el canal. Devuelve la función para pararlo.
 */
function programarSondeo(preguntar, op) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (op === void 0) { op = {}; }
    var rafaga = (_a = op.rafaga) !== null && _a !== void 0 ? _a : 8;
    var rafagaMs = (_b = op.rafagaMs) !== null && _b !== void 0 ? _b : 150;
    var porVuelta = Math.max(1, (_c = op.porVuelta) !== null && _c !== void 0 ? _c : 3);
    var periodo = (_d = op.periodoMs) !== null && _d !== void 0 ? _d : 30000;
    var periodoMax = Math.max(periodo, (_e = op.periodoMaxMs) !== null && _e !== void 0 ? _e : 300000);
    var poner = (_f = op.poner) !== null && _f !== void 0 ? _f : setTimeout;
    var quitar = (_g = op.quitar) !== null && _g !== void 0 ? _g : clearTimeout;
    var n = 0;
    var enRonda = 0;
    var parado = false;
    var h = null;
    var paso = function () {
        if (parado)
            return;
        try {
            preguntar();
        }
        catch (_a) {
            /* el canal puede no estar listo: la siguiente vuelta lo intenta */
        }
        n++;
        var espera;
        if (n < rafaga)
            espera = rafagaMs;
        else if (n === rafaga)
            espera = periodo;
        else if (++enRonda < porVuelta)
            espera = rafagaMs;
        else {
            enRonda = 0;
            periodo = Math.min(periodoMax, periodo * 2);
            espera = periodo;
        }
        h = poner(paso, espera);
    };
    h = poner(paso, 0);
    return function () {
        parado = true;
        if (h)
            quitar(h);
    };
}
