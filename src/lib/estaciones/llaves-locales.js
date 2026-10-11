"use client";
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.misSesiones = misSesiones;
exports.registroDe = registroDe;
exports.guardarSesion = guardarSesion;
exports.anotarFila = anotarFila;
exports.llaveDe = llaveDe;
exports.guardarControlImportado = guardarControlImportado;
exports.olvidarSesion = olvidarSesion;
/**
 * llaves-locales — las estaciones en vivo que ESTE aparato controla (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3.3).
 *
 * Guarda, solo en este aparato (`localStorage`, nunca en la cuenta: es una credencial y la regla
 * de identidad soberana dice que las credenciales no viajan solas), la llave privada de cada
 * sesión creada aquí, su token si es privada, el id de su fila en el directorio y si este medio es
 * el reloj de referencia. Para controlarla desde otro aparato se usa el «enlace de control», que
 * la persona copia a propósito.
 */
var cripto_estacion_1 = require("./cripto-estacion");
var CLAVE = "starseed.estaciones.vivo.v1";
function leerTodo() {
    try {
        var crudo = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE) : null;
        var o = crudo ? JSON.parse(crudo) : null;
        return o && typeof o === "object" ? o : {};
    }
    catch (_a) {
        return {};
    }
}
function escribirTodo(todo) {
    try {
        window.localStorage.setItem(CLAVE, JSON.stringify(todo));
    }
    catch (_a) {
        /* sin almacenamiento: la sesión sigue viva mientras la pestaña esté abierta */
    }
}
function misSesiones() {
    return leerTodo();
}
function registroDe(id) {
    var _a;
    return (_a = leerTodo()[id]) !== null && _a !== void 0 ? _a : null;
}
function guardarSesion(id, llave, datos) {
    return __awaiter(this, void 0, void 0, function () {
        var todo, _a, _b, _c, ids, _i, _d, viejo;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    todo = leerTodo();
                    _a = todo;
                    _b = id;
                    _c = [__assign({}, datos)];
                    _e = {};
                    return [4 /*yield*/, (0, cripto_estacion_1.exportarPrivada)(llave)];
                case 1:
                    _a[_b] = __assign.apply(void 0, _c.concat([(_e.control = _f.sent(), _e)]));
                    ids = Object.keys(todo).sort(function (a, b) { var _a, _b; return ((_a = todo[b].creada) !== null && _a !== void 0 ? _a : 0) - ((_b = todo[a].creada) !== null && _b !== void 0 ? _b : 0); });
                    for (_i = 0, _d = ids.slice(40); _i < _d.length; _i++) {
                        viejo = _d[_i];
                        delete todo[viejo];
                    }
                    escribirTodo(todo);
                    return [2 /*return*/];
            }
        });
    });
}
function anotarFila(id, fila) {
    var todo = leerTodo();
    if (!todo[id])
        return;
    todo[id] = __assign(__assign({}, todo[id]), { fila: fila });
    escribirTodo(todo);
}
function llaveDe(id) {
    return __awaiter(this, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            r = registroDe(id);
            return [2 /*return*/, r ? (0, cripto_estacion_1.importarPrivada)(r.control) : null];
        });
    });
}
/** Guarda el control llegado por un enlace de control (este medio NO es la referencia). */
function guardarControlImportado(id, control, datos) {
    var _a, _b, _c, _d;
    var todo = leerTodo();
    todo[id] = __assign(__assign(__assign({}, todo[id]), datos), { control: control, referencia: (_b = (_a = todo[id]) === null || _a === void 0 ? void 0 : _a.referencia) !== null && _b !== void 0 ? _b : false, creada: (_d = (_c = todo[id]) === null || _c === void 0 ? void 0 : _c.creada) !== null && _d !== void 0 ? _d : Date.now() });
    escribirTodo(todo);
}
function olvidarSesion(id) {
    var todo = leerTodo();
    delete todo[id];
    escribirTodo(todo);
}
