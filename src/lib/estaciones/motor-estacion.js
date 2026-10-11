"use strict";
/**
 * motor-estacion — el sonido de una estación de Omnifrecuencias, generado EN LOCAL y programado
 * al instante exacto del reloj común (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§5).
 *
 * Mismo grafo que la app de Omnifrecuencias (`frecuencias/hooks/useAudio.ts`): por oscilador, dos
 * ondas mezclables → paneo 3D (PannerNode, escala 10, z invertida) → volumen; pulsos isocrónicos
 * con un LFO cuadrado; transiciones de ida y vuelta. La diferencia es CUÁNDO: aquí cada tramo
 * sonoro se programa con `start(t)` y rampas en el tiempo del AudioContext que corresponde a su
 * instante en el reloj común, y cada oscilador arranca en el cruce por cero que le toca
 * (`inicioEnFase`), así que quien llega tarde suena en fase con los demás.
 *
 * Cómo se programa: cada 200 ms se miran los próximos 1,5 s de la línea de tiempo
 * (`tramosEntre`, puro) y se reconcilian con lo ya programado. Un tramo es un trozo de la línea
 * en el que suena la misma entonación con el mismo ancla. Nada toca el audio hasta que la persona
 * pulsa (las reglas de reproducción automática de los navegadores lo exigen).
 */
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
exports.MotorSonido = void 0;
exports.aTiempoContexto = aTiempoContexto;
exports.tramosEntre = tramosEntre;
exports.crearMapeoContexto = crearMapeoContexto;
exports.volumenEn = volumenEn;
var transmision_parametrica_1 = require("./transmision-parametrica");
/** Pasa un instante común al tiempo del AudioContext (segundos). */
function aTiempoContexto(tComun, ahoraComun, ctxAhoraS) {
    return ctxAhoraS + (tComun - ahoraComun) / 1000;
}
/**
 * Tramos que suenan en [desde, hasta] según la línea. Solo Omnifrecuencias suena: Audiomorphic
 * no lleva audio propio.
 */
function tramosEntre(estado, desde, hasta) {
    var cortes = __spreadArray([desde], (0, transmision_parametrica_1.ordenarLinea)(estado.linea).map(function (a) { return a.t; }).filter(function (t) { return t > desde && t <= hasta; }), true);
    var tramos = [];
    for (var i = 0; i < cortes.length; i++) {
        var t = cortes[i];
        var p = (0, transmision_parametrica_1.posicionEn)(estado, t);
        if (p.fase !== "sonando" || p.ancla === null || p.params.tipo !== "omnifrecuencias")
            continue;
        var clave = "".concat(Math.round(p.ancla * 1000), "|").concat(JSON.stringify(p.params.entonacion.osciladores));
        var fin = i + 1 < cortes.length ? cortes[i + 1] : Infinity;
        var previo = tramos[tramos.length - 1];
        if (previo && previo.clave === clave && previo.hasta === t) {
            previo.hasta = fin; // un cambio de volumen no corta el tramo
            continue;
        }
        // Lo que pase más allá de la ventana se verá en la siguiente vuelta (cada 200 ms).
        tramos.push({ clave: clave, desde: t, hasta: fin, ancla: p.ancla, entonacion: p.params.entonacion });
    }
    return tramos;
}
/**
 * Cómo pasar del reloj común al del AudioContext compensando la latencia de salida.
 * Con `getOutputTimestamp()` el navegador dice qué muestra está sonando en el altavoz en qué
 * instante de `performance.now()`: programando con eso, el sonido SALE en el instante común (no
 * solo se calcula). Sin él, `currentTime` menos `outputLatency + baseLatency`.
 */
function crearMapeoContexto(op) {
    var _a;
    var m = op.marca;
    if (m && typeof m.contextTime === "number" && typeof m.performanceTime === "number" && m.performanceTime > 0) {
        var ct_1 = m.contextTime;
        var pt_1 = m.performanceTime;
        return {
            aCtx: function (t) { return ct_1 + (op.perfAhora + (t - op.ahoraComun) - pt_1) / 1000; },
            latenciaMs: Math.max(0, (op.ctxActual - ct_1) * 1000 - (op.perfAhora - pt_1)),
            base: "salida",
        };
    }
    var lat = Math.max(0, (_a = op.latenciaDeclaradaS) !== null && _a !== void 0 ? _a : 0);
    return { aCtx: function (t) { return aTiempoContexto(t, op.ahoraComun, op.ctxActual) - lat; }, latenciaMs: lat * 1000, base: "contexto" };
}
/** Volumen de la sesión en el instante `t` (las acciones de volumen cuentan desde su instante). */
function volumenEn(estado, t) {
    return (0, transmision_parametrica_1.posicionEn)(estado, t).volumen;
}
/* ═══════════════════════ Audio (solo en el navegador) ═══════════════════════ */
var ESCALA_ESPACIAL = 10;
var MIRA_MS = 1500;
var PASO_MS = 200;
var FUNDIDO_S = 0.02;
var MotorSonido = /** @class */ (function () {
    function MotorSonido() {
        this.ctx = null;
        this.master = null;
        this.vivos = [];
        this.volLocal = 0.8;
        this.silencioLocal = false;
        this.h = null;
        this.error = null;
        this.mapeo = null;
        this.fuente = null;
    }
    /** Crea el AudioContext. Llamar SOLO desde un gesto de la persona (pulsar un botón). */
    MotorSonido.prototype.preparar = function () {
        return __awaiter(this, void 0, void 0, function () {
            var Ctor, ctx, master, l, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof window === "undefined")
                            return [2 /*return*/, false];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        if (!this.ctx) {
                            Ctor = window.AudioContext || window.webkitAudioContext;
                            if (!Ctor) {
                                this.error = "Este navegador no tiene Web Audio.";
                                return [2 /*return*/, false];
                            }
                            ctx = new Ctor({ latencyHint: "interactive" });
                            master = ctx.createGain();
                            master.gain.value = 0;
                            master.connect(ctx.destination);
                            l = ctx.listener;
                            if (l.positionX) {
                                l.positionX.value = 0;
                                l.positionY.value = 0;
                                l.positionZ.value = 0;
                            }
                            this.ctx = ctx;
                            this.master = master;
                        }
                        if (!(this.ctx.state === "suspended")) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.ctx.resume()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        this.error = null;
                        return [2 /*return*/, this.ctx.state === "running"];
                    case 4:
                        e_1 = _a.sent();
                        this.error = e_1 instanceof Error ? e_1.message : "No se pudo abrir el audio.";
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /** Engancha la fuente de verdad (estado de la sesión + hora común) y empieza a programar. */
    MotorSonido.prototype.seguir = function (fuente) {
        var _this = this;
        this.fuente = fuente;
        if (this.h === null && typeof setInterval !== "undefined") {
            this.h = setInterval(function () { return _this.programar(); }, PASO_MS);
        }
        this.programar();
    };
    MotorSonido.prototype.estado = function () {
        var _a, _b;
        return {
            listo: !!this.ctx,
            latenciaMs: this.mapeo ? Math.round(this.mapeo.latenciaMs * 10) / 10 : null,
            baseTiempo: (_b = (_a = this.mapeo) === null || _a === void 0 ? void 0 : _a.base) !== null && _b !== void 0 ? _b : null,
            necesitaGesto: !this.ctx || this.ctx.state !== "running",
            sonando: this.vivos.length > 0 && !this.silencioLocal,
            tramos: this.vivos.length,
            error: this.error,
        };
    };
    MotorSonido.prototype.volumen = function (v) {
        this.volLocal = Math.max(0, Math.min(1, v));
        this.programar();
    };
    /** Silencio SOLO aquí (los demás siguen oyendo). */
    MotorSonido.prototype.silenciar = function (si) {
        this.silencioLocal = si;
        this.programar();
    };
    MotorSonido.prototype.volumenLocal = function () {
        return this.volLocal;
    };
    MotorSonido.prototype.silenciado = function () {
        return this.silencioLocal;
    };
    /** Para todo y suelta el audio. */
    MotorSonido.prototype.cerrar = function () {
        if (this.h !== null)
            clearInterval(this.h);
        this.h = null;
        this.fuente = null;
        for (var _i = 0, _a = this.vivos; _i < _a.length; _i++) {
            var v = _a[_i];
            this.soltar(v, 0);
        }
        this.vivos = [];
        var ctx = this.ctx;
        this.ctx = null;
        this.master = null;
        if (ctx && ctx.state !== "closed")
            void ctx.close().catch(function () { return undefined; });
    };
    /** Reconciliación: lo que DEBE sonar en la ventana frente a lo que ya está programado. */
    MotorSonido.prototype.programar = function () {
        var _a;
        var ctx = this.ctx;
        var master = this.master;
        var f = (_a = this.fuente) === null || _a === void 0 ? void 0 : _a.call(this);
        if (!ctx || !master || !f || ctx.state !== "running")
            return;
        var ahora = f.ahora;
        var ahoraCtx = ctx.currentTime;
        var marca = null;
        try {
            marca = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
        }
        catch (_b) {
            marca = null;
        }
        var mapeo = crearMapeoContexto({
            ahoraComun: ahora,
            perfAhora: typeof performance !== "undefined" ? performance.now() : 0,
            ctxActual: ahoraCtx,
            marca: marca,
            latenciaDeclaradaS: (ctx.outputLatency || 0) + (ctx.baseLatency || 0),
        });
        this.mapeo = mapeo;
        var aCtx = mapeo.aCtx;
        // Margen para construir el grafo y que el inicio no caiga en el pasado del altavoz.
        var margenMs = 40 + mapeo.latenciaMs;
        // Volumen general: el de la sesión × el local, con las acciones de volumen a su instante.
        var volObjetivo = this.silencioLocal ? 0 : volumenEn(f.estado, ahora) * this.volLocal;
        master.gain.cancelScheduledValues(ahoraCtx);
        master.gain.setTargetAtTime(volObjetivo, ahoraCtx, 0.03);
        for (var _i = 0, _c = f.estado.linea; _i < _c.length; _i++) {
            var a = _c[_i];
            if (a.tipo === "volumen" && a.t > ahora && a.t <= ahora + MIRA_MS && !this.silencioLocal) {
                master.gain.setValueAtTime(volumenEn(f.estado, a.t) * this.volLocal, aCtx(a.t));
            }
        }
        var tramos = tramosEntre(f.estado, ahora, ahora + MIRA_MS);
        var claves = new Set(tramos.map(function (t) { return t.clave; }));
        // 1) Lo que ya no debe sonar: fuera con un fundido corto, ya.
        for (var _d = 0, _e = this.vivos.filter(function (x) { return !claves.has(x.tramo.clave); }); _d < _e.length; _d++) {
            var v = _e[_d];
            this.soltar(v, ahoraCtx);
        }
        this.vivos = this.vivos.filter(function (x) { return claves.has(x.tramo.clave); });
        var _loop_1 = function (t) {
            var v = this_1.vivos.find(function (x) { return x.tramo.clave === t.clave; });
            if (!v) {
                var inicio = Math.max(t.desde, ahora + margenMs);
                v = this_1.construir(ctx, master, t, inicio, aCtx);
                this_1.vivos.push(v);
            }
            v.tramo = t;
            if (v.finProgramado !== t.hasta) {
                // El fin cambió (llegó una pausa, o se anuló): se rehace el final del tramo.
                v.vca.gain.cancelScheduledValues(ahoraCtx);
                v.vca.gain.setValueAtTime(1, ahoraCtx);
                if (Number.isFinite(t.hasta)) {
                    var fin = Math.max(aCtx(t.hasta), ahoraCtx + FUNDIDO_S);
                    v.vca.gain.setValueAtTime(1, Math.max(ahoraCtx, fin - FUNDIDO_S));
                    v.vca.gain.linearRampToValueAtTime(0, fin);
                }
                v.finProgramado = t.hasta;
            }
            this_1.rampas(v, ahora + MIRA_MS, aCtx);
        };
        var this_1 = this;
        // 2) Tramos nuevos o con fin cambiado.
        for (var _f = 0, tramos_1 = tramos; _f < tramos_1.length; _f++) {
            var t = tramos_1[_f];
            _loop_1(t);
        }
        // 3) Limpieza de tramos cuyo fin ya pasó.
        for (var _g = 0, _h = this.vivos.filter(function (x) { return Number.isFinite(x.finProgramado) && x.finProgramado < ahora - 200; }); _g < _h.length; _g++) {
            var v = _h[_g];
            this.soltar(v, ahoraCtx);
        }
        this.vivos = this.vivos.filter(function (x) { return !(Number.isFinite(x.finProgramado) && x.finProgramado < ahora - 200); });
    };
    MotorSonido.prototype.construir = function (ctx, master, t, inicioComun, aCtx) {
        var _a;
        var vca = ctx.createGain();
        vca.gain.value = 1;
        vca.connect(master);
        var posS = (inicioComun - t.ancla) / 1000;
        var nodos = [];
        for (var _i = 0, _b = t.entonacion.osciladores; _i < _b.length; _i++) {
            var o = _b[_i];
            var val = (0, transmision_parametrica_1.valoresOscilador)(o, posS);
            var osc1 = ctx.createOscillator();
            var osc2 = ctx.createOscillator();
            osc1.type = val.onda;
            osc2.type = (_a = val.onda2) !== null && _a !== void 0 ? _a : val.onda;
            var g1 = ctx.createGain();
            var g2 = ctx.createGain();
            var vol = ctx.createGain();
            var panner = ctx.createPanner();
            var inicioCtx = aCtx((0, transmision_parametrica_1.inicioEnFase)(t.ancla, inicioComun, o.trans ? 0 : val.f));
            osc1.frequency.setValueAtTime(val.f, inicioCtx);
            osc2.frequency.setValueAtTime(val.f, inicioCtx);
            g1.gain.setValueAtTime(1 - val.mezcla, inicioCtx);
            g2.gain.setValueAtTime(val.mezcla, inicioCtx);
            vol.gain.setValueAtTime(val.vol, inicioCtx);
            if (panner.positionX) {
                panner.positionX.setValueAtTime(val.x * ESCALA_ESPACIAL, inicioCtx);
                panner.positionY.setValueAtTime(val.y * ESCALA_ESPACIAL, inicioCtx);
                panner.positionZ.setValueAtTime(val.z * -ESCALA_ESPACIAL, inicioCtx);
            }
            else {
                panner.setPosition(val.x * ESCALA_ESPACIAL, val.y * ESCALA_ESPACIAL, val.z * -ESCALA_ESPACIAL);
            }
            osc1.connect(g1).connect(vol);
            osc2.connect(g2).connect(vol);
            var lfo = void 0;
            var lfoGain = void 0;
            if (o.pulso && o.pulso > 0) {
                // Pulsos isocrónicos: el volumen oscila entre 0 y el valor base, en fase con el ancla.
                var pulsado = ctx.createGain();
                pulsado.gain.value = 0.5;
                lfo = ctx.createOscillator();
                lfo.type = "square";
                lfo.frequency.value = o.pulso;
                lfoGain = ctx.createGain();
                lfoGain.gain.value = 0.5;
                lfo.connect(lfoGain).connect(pulsado.gain);
                vol.connect(pulsado).connect(panner);
                lfo.start(aCtx((0, transmision_parametrica_1.inicioEnFase)(t.ancla, inicioComun, o.pulso)));
            }
            else {
                vol.connect(panner);
            }
            panner.connect(vca);
            osc1.start(inicioCtx);
            osc2.start(inicioCtx);
            nodos.push({ o: o, osc1: osc1, osc2: osc2, g1: g1, g2: g2, vol: vol, panner: panner, lfo: lfo, lfoGain: lfoGain });
        }
        return { tramo: t, vca: vca, nodos: nodos, rampasHasta: inicioComun, finProgramado: Infinity };
    };
    /** Programa las transiciones hasta `hasta` con rampas lineales de 250 ms (exactas en sus extremos). */
    MotorSonido.prototype.rampas = function (v, hasta, aCtx) {
        var conTransicion = v.nodos.filter(function (n) { return n.o.trans; });
        if (!conTransicion.length) {
            v.rampasHasta = hasta;
            return;
        }
        var fin = Math.min(hasta, v.tramo.hasta);
        for (var t = v.rampasHasta + 250; t <= fin; t += 250) {
            var posS = (t - v.tramo.ancla) / 1000;
            var ct = aCtx(t);
            for (var _i = 0, conTransicion_1 = conTransicion; _i < conTransicion_1.length; _i++) {
                var n = conTransicion_1[_i];
                var val = (0, transmision_parametrica_1.valoresOscilador)(n.o, posS);
                n.osc1.frequency.linearRampToValueAtTime(val.f, ct);
                n.osc2.frequency.linearRampToValueAtTime(val.f, ct);
                n.vol.gain.linearRampToValueAtTime(val.vol, ct);
                n.g1.gain.linearRampToValueAtTime(1 - val.mezcla, ct);
                n.g2.gain.linearRampToValueAtTime(val.mezcla, ct);
                if (n.panner.positionX) {
                    n.panner.positionX.linearRampToValueAtTime(val.x * ESCALA_ESPACIAL, ct);
                    n.panner.positionY.linearRampToValueAtTime(val.y * ESCALA_ESPACIAL, ct);
                    n.panner.positionZ.linearRampToValueAtTime(val.z * -ESCALA_ESPACIAL, ct);
                }
            }
            v.rampasHasta = t;
        }
    };
    MotorSonido.prototype.soltar = function (v, ahoraCtx) {
        try {
            if (ahoraCtx > 0) {
                v.vca.gain.cancelScheduledValues(ahoraCtx);
                v.vca.gain.setValueAtTime(v.vca.gain.value, ahoraCtx);
                v.vca.gain.linearRampToValueAtTime(0, ahoraCtx + FUNDIDO_S);
            }
        }
        catch (_a) {
            /* nada */
        }
        var parar = ahoraCtx + FUNDIDO_S + 0.02;
        for (var _i = 0, _b = v.nodos; _i < _b.length; _i++) {
            var n = _b[_i];
            for (var _c = 0, _d = [n.osc1, n.osc2, n.lfo]; _c < _d.length; _c++) {
                var o = _d[_c];
                try {
                    o === null || o === void 0 ? void 0 : o.stop(parar);
                }
                catch (_e) {
                    /* ya parado */
                }
            }
        }
        setTimeout(function () {
            try {
                v.vca.disconnect();
            }
            catch (_a) {
                /* nada */
            }
        }, 200);
    };
    return MotorSonido;
}());
exports.MotorSonido = MotorSonido;
