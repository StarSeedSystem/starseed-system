"use strict";
/**
 * transmision-parametrica — el MODELO de una estación en vivo de Omnifrecuencias o Audiomorphic.
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§1). Contrato §C de
 * `architecture/genesis-niveles-malla-universal-estaciones.md`.
 *
 * Lo que viaja no es sonido: es la FICHA (qué entonación o espiral, con todos sus parámetros) y una
 * LÍNEA DE TIEMPO de acciones (iniciar, pausar, reanudar, cambiar parámetros, volumen, terminar)
 * con su instante en el reloj común (`reloj-comun.ts`). De ahí, cualquier medio calcula sin
 * preguntar a nadie dónde va la sesión en cualquier instante —también quien llega tarde— y lo
 * genera en local. Por eso cabe en cualquier antena: una acción ocupa decenas de bytes.
 *
 * Este módulo es PURO (sin red, sin audio, sin DOM): modelo, cálculo de posición, transiciones,
 * saneado de todo lo que llega de fuera y enlaces. La red vive en `sesion-en-vivo.ts`; el sonido
 * en `motor-estacion.ts`.
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
exports.PREFIJO_VIVO = exports.MAX_BYTES_ESTADO = exports.TIPOS_ACCION = exports.ONDAS = exports.ETIQUETA_FUENTE_TRANSMISION = exports.FUENTES_TRANSMISION = void 0;
exports.sanearEntonacion = sanearEntonacion;
exports.sanearVisual = sanearVisual;
exports.sanearParametros = sanearParametros;
exports.enlaceAceptable = enlaceAceptable;
exports.sanearFicha = sanearFicha;
exports.sanearAccion = sanearAccion;
exports.ordenarLinea = ordenarLinea;
exports.posicionEn = posicionEn;
exports.numeroAccion = numeroAccion;
exports.aplicarAccion = aplicarAccion;
exports.fusionarEstados = fusionarEstados;
exports.compactarLinea = compactarLinea;
exports.valoresOscilador = valoresOscilador;
exports.inicioEnFase = inicioEnFase;
exports.entonacionDesdeOsciladores = entonacionDesdeOsciladores;
exports.entonacionDesdeOmniConfig = entonacionDesdeOmniConfig;
exports.serializarEstado = serializarEstado;
exports.leerEstado = leerEstado;
exports.codificarFicha = codificarFicha;
exports.leerFichaCodificada = leerFichaCodificada;
exports.enlaceDeSesion = enlaceDeSesion;
exports.leerEnlaceSesion = leerEnlaceSesion;
exports.esEnlaceEnVivo = esEnlaceEnVivo;
var cripto_estacion_1 = require("./cripto-estacion");
/* ═══════════════════════ Tipos ═══════════════════════ */
exports.FUENTES_TRANSMISION = ["omnifrecuencias", "audiomorphic"];
exports.ETIQUETA_FUENTE_TRANSMISION = {
    omnifrecuencias: "Entonación de Omnifrecuencias",
    audiomorphic: "Espirales de Audiomorphic",
};
exports.ONDAS = ["sine", "square", "triangle", "sawtooth"];
exports.TIPOS_ACCION = ["iniciar", "pausar", "reanudar", "parametros", "volumen", "terminar", "base"];
/* ═══════════════════════ Saneado (todo lo que llega de fuera) ═══════════════════════ */
var LIMITE_OSCILADORES = 16;
var LIMITE_LINEA = 64;
exports.MAX_BYTES_ESTADO = 24000;
var RE_B64URL = /^[A-Za-z0-9_-]+$/;
var num = function (v, lo, hi, porDefecto) {
    var n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n))
        return porDefecto;
    return Math.min(hi, Math.max(lo, n));
};
var esOnda = function (v) { return typeof v === "string" && exports.ONDAS.includes(v); };
function texto(v, max) {
    if (typeof v !== "string")
        return undefined;
    var t = v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
    return t || undefined;
}
function sanearPunto(v) {
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    var p = {
        f: num(o.f, 0.1, 24000, 432),
        vol: num(o.vol, 0, 1, 0.5),
        x: num(o.x, -1, 1, 0),
        y: num(o.y, -1, 1, 0),
        z: num(o.z, -1, 1, 0),
    };
    if (esOnda(o.onda))
        p.onda = o.onda;
    return p;
}
function sanearOscilador(v, i) {
    var _a;
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    var f = num(o.f, 0.1, 24000, NaN);
    if (!Number.isFinite(f))
        return null;
    var out = {
        id: (_a = texto(o.id, 40)) !== null && _a !== void 0 ? _a : "o".concat(i),
        f: f,
        onda: esOnda(o.onda) ? o.onda : "sine",
        vol: num(o.vol, 0, 1, 0.5),
        x: num(o.x, -1, 1, 0),
        y: num(o.y, -1, 1, 0),
        z: num(o.z, -1, 1, 0),
    };
    if (esOnda(o.onda2))
        out.onda2 = o.onda2;
    if (o.mezcla !== undefined)
        out.mezcla = num(o.mezcla, 0, 1, 0);
    if (o.pulso !== undefined && num(o.pulso, 0, 40, 0) > 0)
        out.pulso = num(o.pulso, 0.5, 40, 0);
    var nombre = texto(o.nombre, 40);
    if (nombre)
        out.nombre = nombre;
    if (o.trans && typeof o.trans === "object") {
        var t = o.trans;
        var a = sanearPunto(t.a);
        var b = sanearPunto(t.b);
        if (a && b) {
            out.trans = {
                a: a,
                b: b,
                dur: num(t.dur, 0.05, 3600, 10),
                vueltas: t.vueltas === "infinito" ? "infinito" : Math.floor(num(t.vueltas, 0, 1000, 0)),
            };
        }
    }
    return out;
}
function sanearEntonacion(v) {
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    if (!Array.isArray(o.osciladores))
        return null;
    var osciladores = o.osciladores
        .slice(0, LIMITE_OSCILADORES)
        .map(function (x, i) { return sanearOscilador(x, i); })
        .filter(function (x) { return !!x; });
    if (!osciladores.length)
        return null;
    return { osciladores: osciladores, volumen: num(o.volumen, 0, 1, 0.7) };
}
function sanearVisual(v) {
    if (!v || typeof v !== "object" || Array.isArray(v))
        return null;
    var out = {};
    var n = 0;
    for (var _i = 0, _a = Object.entries(v); _i < _a.length; _i++) {
        var _b = _a[_i], k = _b[0], val = _b[1];
        if (n >= 120)
            break;
        if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k))
            continue;
        if (typeof val === "number" && Number.isFinite(val))
            out[k] = val;
        else if (typeof val === "boolean")
            out[k] = val;
        else if (typeof val === "string" && val.length <= 60)
            out[k] = val;
        else
            continue;
        n++;
    }
    return out;
}
function sanearParametros(v, fuente) {
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    if (o.tipo !== fuente)
        return null;
    if (fuente === "omnifrecuencias") {
        var entonacion = sanearEntonacion(o.entonacion);
        return entonacion ? { tipo: "omnifrecuencias", entonacion: entonacion } : null;
    }
    var visual = sanearVisual(o.visual);
    return visual ? { tipo: "audiomorphic", visual: visual } : null;
}
/** Un enlace de entonación aceptable: https o ruta del OS (nunca `//`, `javascript:`, etc.). */
function enlaceAceptable(v) {
    if (typeof v !== "string" || !v || v.length > 500)
        return false;
    if (v.startsWith("/"))
        return !v.startsWith("//") && !v.startsWith("/\\");
    try {
        return new URL(v).protocol === "https:";
    }
    catch (_a) {
        return false;
    }
}
function sanearFicha(v) {
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    if (o.v !== 1)
        return null;
    if (typeof o.id !== "string" || o.id.length !== 22 || !RE_B64URL.test(o.id))
        return null;
    if (typeof o.pk !== "string" || o.pk.length < 40 || o.pk.length > 120 || !RE_B64URL.test(o.pk))
        return null;
    var fuente = o.fuente;
    if (fuente !== "omnifrecuencias" && fuente !== "audiomorphic")
        return null;
    var titulo = texto(o.titulo, 100);
    if (!titulo || titulo.length < 2)
        return null;
    if (!enlaceAceptable(o.enlace))
        return null;
    var params = sanearParametros(o.params, fuente);
    if (!params)
        return null;
    return {
        v: 1,
        id: o.id,
        fuente: fuente,
        titulo: titulo,
        enlace: o.enlace,
        pk: o.pk,
        privada: o.privada === true,
        params: params,
        creada: num(o.creada, 0, 8.64e15, 0),
    };
}
function sanearAccion(v, fuente) {
    var _a;
    if (!v || typeof v !== "object")
        return null;
    var o = v;
    if (typeof o.tipo !== "string" || !exports.TIPOS_ACCION.includes(o.tipo))
        return null;
    var t = num(o.t, 0, 8.64e15, NaN);
    var n = num(o.n, 0, Number.MAX_SAFE_INTEGER, NaN);
    if (!Number.isFinite(t) || !Number.isFinite(n))
        return null;
    var a = { n: Math.floor(n), t: t, tipo: o.tipo };
    if (a.tipo === "parametros" || (a.tipo === "base" && o.params)) {
        var p = sanearParametros(o.params, fuente);
        if (!p && a.tipo === "parametros")
            return null;
        if (p)
            a.params = p;
    }
    if (a.tipo === "volumen" || (a.tipo === "base" && o.volumen !== undefined)) {
        a.volumen = num(o.volumen, 0, 1, 0.7);
    }
    if (a.tipo === "base") {
        var b = ((_a = o.base) !== null && _a !== void 0 ? _a : {});
        a.base = {
            sonando: b.sonando === true,
            posicionMs: num(b.posicionMs, 0, 8.64e15, 0),
            terminada: b.terminada === true,
            empezada: b.empezada === true,
        };
    }
    return a;
}
/* ═══════════════════════ Línea de tiempo ═══════════════════════ */
function ordenarLinea(linea) {
    return __spreadArray([], linea, true).sort(function (a, b) { return a.t - b.t || a.n - b.n; });
}
function volumenInicial(p) {
    return p.tipo === "omnifrecuencias" ? p.entonacion.volumen : 1;
}
function recorrer(ficha, acciones) {
    var _a, _b, _c, _d, _e;
    var r = {
        sonando: false,
        terminada: false,
        empezada: false,
        acumuladoMs: 0,
        desde: null,
        params: ficha.params,
        volumen: volumenInicial(ficha.params),
    };
    for (var _i = 0, acciones_1 = acciones; _i < acciones_1.length; _i++) {
        var a = acciones_1[_i];
        switch (a.tipo) {
            case "base":
                r.sonando = !!((_a = a.base) === null || _a === void 0 ? void 0 : _a.sonando);
                r.terminada = !!((_b = a.base) === null || _b === void 0 ? void 0 : _b.terminada);
                r.empezada = !!((_c = a.base) === null || _c === void 0 ? void 0 : _c.empezada);
                r.acumuladoMs = (_e = (_d = a.base) === null || _d === void 0 ? void 0 : _d.posicionMs) !== null && _e !== void 0 ? _e : 0;
                r.desde = r.sonando ? a.t : null;
                if (a.params)
                    r.params = a.params;
                if (typeof a.volumen === "number")
                    r.volumen = a.volumen;
                break;
            case "iniciar":
                r.sonando = true;
                r.terminada = false;
                r.empezada = true;
                r.acumuladoMs = 0;
                r.desde = a.t;
                break;
            case "reanudar":
                if (!r.sonando && !r.terminada) {
                    r.sonando = true;
                    r.empezada = true;
                    r.desde = a.t;
                }
                break;
            case "pausar":
                if (r.sonando && r.desde !== null) {
                    r.acumuladoMs += a.t - r.desde;
                    r.sonando = false;
                    r.desde = null;
                }
                break;
            case "terminar":
                if (r.sonando && r.desde !== null)
                    r.acumuladoMs += a.t - r.desde;
                r.sonando = false;
                r.desde = null;
                r.terminada = true;
                break;
            case "parametros":
                if (a.params && a.params.tipo === r.params.tipo)
                    r.params = a.params;
                break;
            case "volumen":
                if (typeof a.volumen === "number")
                    r.volumen = a.volumen;
                break;
        }
    }
    return r;
}
/**
 * Dónde va la sesión en el instante común `t`. Es lo que calcula quien llega tarde: con la
 * ficha y la línea basta, no hace falta que nadie le «ponga al día».
 */
function posicionEn(estado, t) {
    var _a;
    var orden = ordenarLinea(estado.linea);
    var pasadas = orden.filter(function (a) { return a.t <= t; });
    var r = recorrer(estado.ficha, pasadas);
    var proxima = (_a = orden.find(function (a) { return a.t > t; })) !== null && _a !== void 0 ? _a : null;
    var posicionMs = r.sonando && r.desde !== null ? r.acumuladoMs + (t - r.desde) : r.acumuladoMs;
    return {
        fase: r.terminada ? "terminada" : r.sonando ? "sonando" : r.empezada ? "pausada" : "esperando",
        ancla: r.sonando && r.desde !== null ? r.desde - r.acumuladoMs : null,
        posicionMs: posicionMs,
        params: r.params,
        volumen: r.volumen,
        proxima: proxima,
    };
}
/**
 * Número de una acción nueva: el instante común en µs más un azar de 3 cifras. Dos medios del
 * mismo anfitrión pueden crear acciones a la vez sin pisarse, y el orden sigue siendo el del tiempo.
 */
function numeroAccion(tComun, azar) {
    if (azar === void 0) { azar = Math.floor(Math.random() * 1000); }
    return Math.floor(tComun) * 1000 + (Math.abs(Math.floor(azar)) % 1000);
}
/** Añade una acción (sin duplicar su número) y resume la historia si se alarga. */
function aplicarAccion(estado, a) {
    if (estado.linea.some(function (x) { return x.n === a.n; }))
        return estado;
    var linea = compactarLinea(estado.ficha, ordenarLinea(__spreadArray(__spreadArray([], estado.linea, true), [a], false)));
    return { ficha: estado.ficha, linea: linea, rev: Math.max(estado.rev, a.n) };
}
/**
 * Une dos estados de la MISMA sesión (p. ej. el que traía y el que manda el anfitrión desde otro
 * medio): la unión de sus acciones por número. Una `base` lo resume todo lo anterior a ella, así
 * que acciones viejas repetidas no cuentan dos veces.
 */
function fusionarEstados(a, b) {
    if (a.ficha.id !== b.ficha.id)
        return a;
    var porN = new Map();
    for (var _i = 0, _a = __spreadArray(__spreadArray([], a.linea, true), b.linea, true); _i < _a.length; _i++) {
        var x = _a[_i];
        if (!porN.has(x.n))
            porN.set(x.n, x);
    }
    var linea = compactarLinea(a.ficha, ordenarLinea(__spreadArray([], porN.values(), true)));
    return { ficha: a.ficha, linea: linea, rev: Math.max(a.rev, b.rev) };
}
/** Si la línea pasa de `max` acciones, las más viejas se resumen en una acción `base`. */
function compactarLinea(ficha, linea, max) {
    if (max === void 0) { max = LIMITE_LINEA; }
    if (linea.length <= max)
        return linea;
    var orden = ordenarLinea(linea);
    var corte = orden.length - max + 1;
    var viejas = orden.slice(0, corte);
    var ultima = viejas[viejas.length - 1];
    var r = recorrer(ficha, viejas);
    var posicionMs = r.sonando && r.desde !== null ? r.acumuladoMs + (ultima.t - r.desde) : r.acumuladoMs;
    var base = {
        n: ultima.n,
        t: ultima.t,
        tipo: "base",
        params: r.params,
        volumen: r.volumen,
        base: { sonando: r.sonando, posicionMs: posicionMs, terminada: r.terminada, empezada: r.empezada },
    };
    return __spreadArray([base], orden.slice(corte), true);
}
/**
 * Valores de un oscilador a `posicionS` segundos de reproducción. Las transiciones van de A a B
 * y vuelven, como en la app: `vueltas` pasadas extra tras la primera; al acabar se quedan en el
 * final de la última. Determinista: dos medios con la misma posición suenan igual.
 */
function valoresOscilador(o, posicionS) {
    var _a, _b, _c, _d;
    if (!o.trans) {
        return { f: o.f, vol: o.vol, x: o.x, y: o.y, z: o.z, onda: o.onda, onda2: o.onda2, mezcla: (_a = o.mezcla) !== null && _a !== void 0 ? _a : 0 };
    }
    var _e = o.trans, a = _e.a, b = _e.b, dur = _e.dur, vueltas = _e.vueltas;
    var d = Math.max(0.05, dur);
    var total = vueltas === "infinito" ? Infinity : vueltas + 1;
    var pos = Math.max(0, posicionS);
    var idx = Math.floor(pos / d);
    var frac = (pos - idx * d) / d;
    if (idx >= total) {
        idx = total - 1;
        frac = 1;
    }
    var p = idx % 2 === 0 ? frac : 1 - frac;
    var lerp = function (u, v) { return u + (v - u) * p; };
    return {
        f: lerp(a.f, b.f),
        vol: lerp(a.vol, b.vol),
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        z: lerp(a.z, b.z),
        onda: (_b = a.onda) !== null && _b !== void 0 ? _b : o.onda,
        onda2: (_d = (_c = b.onda) !== null && _c !== void 0 ? _c : o.onda2) !== null && _d !== void 0 ? _d : o.onda,
        mezcla: p,
    };
}
/**
 * Primer instante ≥ `desde` en que un oscilador de frecuencia fija `f` que sonara desde `ancla`
 * pasa por fase cero. Arrancar ahí deja a quien llega tarde en la MISMA fase que los demás
 * (con el error del reloj común). Con transiciones de frecuencia la fase no es exacta.
 */
function inicioEnFase(ancla, desde, f) {
    if (!(f > 0) || desde <= ancla)
        return Math.max(desde, ancla);
    var periodoMs = 1000 / f;
    var ciclos = Math.ceil((desde - ancla) / periodoMs - 1e-9);
    return ancla + ciclos * periodoMs;
}
/* ═══════════════════════ Conversión desde las apps ═══════════════════════ */
/** De los osciladores de la app completa (port) a parámetros de la estación. */
function entonacionDesdeOsciladores(oscs, volumen) {
    if (volumen === void 0) { volumen = 0.7; }
    return sanearEntonacion({
        volumen: volumen,
        osciladores: oscs.map(function (o, i) {
            var _a, _b, _c, _d, _e;
            return ({
                id: (_a = o.id) !== null && _a !== void 0 ? _a : "o".concat(i),
                f: o.frequency,
                onda: o.type,
                vol: (_b = o.volume) !== null && _b !== void 0 ? _b : 0.5,
                x: (_c = o.panX) !== null && _c !== void 0 ? _c : 0,
                y: (_d = o.panY) !== null && _d !== void 0 ? _d : 0,
                z: (_e = o.panZ) !== null && _e !== void 0 ? _e : 0,
                onda2: o.type2,
                mezcla: o.typeMix,
                nombre: o.name,
                trans: o.transition && o.transition.enabled
                    ? {
                        a: { f: o.transition.start.frequency, vol: o.transition.start.volume, x: o.transition.start.panX, y: o.transition.start.panY, z: o.transition.start.panZ, onda: o.transition.start.type },
                        b: { f: o.transition.end.frequency, vol: o.transition.end.volume, x: o.transition.end.panX, y: o.transition.end.panY, z: o.transition.end.panZ, onda: o.transition.end.type },
                        dur: o.transition.duration,
                        vueltas: o.transition.loopCount === "infinite" ? "infinito" : o.transition.loopCount,
                    }
                    : undefined,
            });
        }),
    });
}
/** Del preset del widget (tonos con binaural e isocrónico) a parámetros de la estación. */
function entonacionDesdeOmniConfig(c) {
    var _a, _b;
    var osciladores = [];
    for (var _i = 0, _c = (_a = c.tones) !== null && _a !== void 0 ? _a : []; _i < _c.length; _i++) {
        var t = _c[_i];
        var base = { onda: t.waveform, vol: t.gain, y: 0, z: 0, pulso: t.pulseHz, nombre: t.label };
        if (t.binauralBeat && t.binauralBeat > 0) {
            osciladores.push(__assign(__assign({}, base), { id: "".concat(t.id, "-i"), f: t.freq, x: -1 }));
            osciladores.push(__assign(__assign({}, base), { id: "".concat(t.id, "-d"), f: t.freq + t.binauralBeat, x: 1 }));
        }
        else {
            osciladores.push(__assign(__assign({}, base), { id: t.id, f: t.freq, x: (_b = t.pan) !== null && _b !== void 0 ? _b : 0 }));
        }
    }
    return sanearEntonacion({ osciladores: osciladores, volumen: c.masterVolume });
}
/* ═══════════════════════ Serialización y enlaces ═══════════════════════ */
function serializarEstado(e) {
    return JSON.stringify({ ficha: e.ficha, linea: ordenarLinea(e.linea), rev: e.rev });
}
/** Lee un estado de fuera: sanea todo y descarta lo que pase de 24 KB. */
function leerEstado(json) {
    if (typeof json !== "string" || json.length > exports.MAX_BYTES_ESTADO)
        return null;
    try {
        var o = JSON.parse(json);
        var ficha_1 = sanearFicha(o.ficha);
        if (!ficha_1 || !Array.isArray(o.linea))
            return null;
        var linea = o.linea
            .slice(-LIMITE_LINEA)
            .map(function (a) { return sanearAccion(a, ficha_1.fuente); })
            .filter(function (a) { return !!a; });
        return { ficha: ficha_1, linea: ordenarLinea(linea), rev: Math.floor(num(o.rev, 0, Number.MAX_SAFE_INTEGER, 0)) };
    }
    catch (_a) {
        return null;
    }
}
function codificarFicha(f) {
    return (0, cripto_estacion_1.textoABase64Url)(JSON.stringify(f));
}
function leerFichaCodificada(b64) {
    try {
        if (!b64 || b64.length > 16000 || !RE_B64URL.test(b64))
            return null;
        return sanearFicha(JSON.parse((0, cripto_estacion_1.base64UrlATexto)(b64)));
    }
    catch (_a) {
        return null;
    }
}
exports.PREFIJO_VIVO = "/estaciones/vivo/";
/**
 * Enlace de una sesión. Pública: la ficha va en `?f=` (es pública igual). Privada: TODO va en
 * el fragmento `#f=…&k=…`, que el navegador nunca manda a ningún servidor. `control` (la llave
 * privada) solo se añade al enlace para tus OTROS aparatos.
 */
function enlaceDeSesion(f, op) {
    if (op === void 0) { op = {}; }
    var base = "".concat(exports.PREFIJO_VIVO).concat(f.id);
    var ficha = codificarFicha(f);
    var frag = [];
    if (f.privada && op.token)
        frag.push("k=".concat(op.token));
    if (op.control)
        frag.push("c=".concat(op.control));
    if (f.privada)
        return "".concat(base, "#f=").concat(ficha).concat(frag.length ? "&".concat(frag.join("&")) : "");
    return "".concat(base, "?f=").concat(ficha).concat(frag.length ? "#".concat(frag.join("&")) : "");
}
/** Lee un enlace de sesión (ruta, query y fragmento). Null si no es de una sesión en vivo. */
function leerEnlaceSesion(href) {
    var _a;
    try {
        var u = new URL(href, "https://starseed.local");
        if (!u.pathname.startsWith(exports.PREFIJO_VIVO))
            return null;
        var id = decodeURIComponent(u.pathname.slice(exports.PREFIJO_VIVO.length)).replace(/\/$/, "");
        if (id.length !== 22 || !RE_B64URL.test(id))
            return null;
        var frag = new URLSearchParams(u.hash.replace(/^#/, ""));
        var fB64 = (_a = frag.get("f")) !== null && _a !== void 0 ? _a : u.searchParams.get("f");
        var ficha = fB64 ? leerFichaCodificada(fB64) : null;
        var token = frag.get("k");
        var control = frag.get("c");
        return {
            id: id,
            ficha: ficha && ficha.id === id ? ficha : null,
            token: token && RE_B64URL.test(token) && token.length <= 64 ? token : null,
            control: control && RE_B64URL.test(control) && control.length <= 600 ? control : null,
        };
    }
    catch (_b) {
        return null;
    }
}
/** ¿Este enlace de estación es una sesión en vivo sincronizada? */
function esEnlaceEnVivo(enlace) {
    return typeof enlace === "string" && enlace.startsWith(exports.PREFIJO_VIVO);
}
