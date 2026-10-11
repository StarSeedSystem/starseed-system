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
exports.listarEstaciones = listarEstaciones;
exports.obtenerEstacion = obtenerEstacion;
exports.publicarEstacion = publicarEstacion;
exports.editarEstacion = editarEstacion;
exports.latirEstacion = latirEstacion;
exports.pausarEstacion = pausarEstacion;
exports.terminarEstacion = terminarEstacion;
exports.denunciarEstacion = denunciarEstacion;
exports.ocultasLocales = ocultasLocales;
exports.ocultarLocal = ocultarLocal;
/*
 * StarSeed OS · Estaciones (§6.2) — capa de datos del cliente sobre
 * `public.os_estaciones` y `os_estaciones_denuncias`.
 * Ninguna función lanza: ante fallo devuelven `[]`, `null` o
 * `{ ok: false, error }`. El cliente Supabase es el singleton del OS,
 * inyectable como último parámetro en las pruebas.
 */
var client_1 = require("@/utils/supabase/client");
var formato_1 = require("./formato");
var tipos_1 = require("./tipos");
var CLAVE_OCULTAS = "starseed.estaciones.ocultas.v1";
var MOTIVO_MAX = 300;
function resolverCliente(inyectado) {
    if (inyectado)
        return inyectado;
    if (typeof window === "undefined")
        return null;
    try {
        return (0, client_1.createClient)();
    }
    catch (_a) {
        return null;
    }
}
function usuarioEnSesion(supabase) {
    return __awaiter(this, void 0, void 0, function () {
        var data, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 1:
                    data = (_d.sent()).data;
                    return [2 /*return*/, (_c = (_b = data.user) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null];
                case 2:
                    _a = _d.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Lista estaciones públicas (la RLS ya filtra los grupos). Nunca lanza. */
function listarEstaciones() {
    return __awaiter(this, arguments, void 0, function (opciones, clienteInyectado) {
        var supabase, consulta, _a, data, error, _b;
        var _c;
        if (opciones === void 0) { opciones = {}; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase)
                        return [2 /*return*/, []];
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    consulta = supabase
                        .from("os_estaciones")
                        .select("*")
                        .order("updated_at", { ascending: false })
                        .limit(Math.min(Math.max((_c = opciones.limite) !== null && _c !== void 0 ? _c : 50, 1), 100));
                    if (opciones.tipo)
                        consulta = consulta.eq("tipo", opciones.tipo);
                    if (opciones.ambito)
                        consulta = consulta.eq("entidad_ref", opciones.ambito);
                    return [4 /*yield*/, consulta];
                case 2:
                    _a = _d.sent(), data = _a.data, error = _a.error;
                    if (error || !Array.isArray(data))
                        return [2 /*return*/, []];
                    return [2 /*return*/, data];
                case 3:
                    _b = _d.sent();
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Una estación por id, o null si no existe o falla la red. */
function obtenerEstacion(id, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, _a, data, error, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase || !id)
                        return [2 /*return*/, null];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase
                            .from("os_estaciones")
                            .select("*")
                            .eq("id", id)
                            .maybeSingle()];
                case 2:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error || !data)
                        return [2 /*return*/, null];
                    return [2 /*return*/, data];
                case 3:
                    _b = _c.sent();
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Publica una estación (la escribe el dueño). Valida y detecta el formato. */
function publicarEstacion(borrador, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, veredicto, ownerId, v, formato, _a, data, error, _b;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase)
                        return [2 /*return*/, { ok: false, error: "No hay cliente de base de datos disponible." }];
                    veredicto = (0, tipos_1.validarEstacion)(borrador);
                    if (!veredicto.ok)
                        return [2 /*return*/, { ok: false, error: veredicto.errores.join(" ") }];
                    return [4 /*yield*/, usuarioEnSesion(supabase)];
                case 1:
                    ownerId = _o.sent();
                    if (!ownerId)
                        return [2 /*return*/, { ok: false, error: "Entra con tu cuenta para publicar una estación." }];
                    v = veredicto.estacion;
                    formato = (0, formato_1.detectarFormato)(v.enlace, v.tipo).formato;
                    _o.label = 2;
                case 2:
                    _o.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, supabase
                            .from("os_estaciones")
                            .insert({
                            owner_id: ownerId,
                            ambito_tipo: (_c = v.ambito_tipo) !== null && _c !== void 0 ? _c : "persona",
                            entidad_ref: v.ambito_tipo === "entidad" ? (_d = v.entidad_ref) !== null && _d !== void 0 ? _d : null : null,
                            titulo: v.titulo,
                            descripcion: (_e = v.descripcion) !== null && _e !== void 0 ? _e : "",
                            tipo: v.tipo,
                            fuente: v.fuente,
                            enlace: v.enlace,
                            formato: formato,
                            imagen: (_f = v.imagen) !== null && _f !== void 0 ? _f : null,
                            idioma: (_g = v.idioma) !== null && _g !== void 0 ? _g : "es",
                            categorias: (_h = v.categorias) !== null && _h !== void 0 ? _h : [],
                            licencia: v.licencia,
                            visibilidad: (_j = v.visibilidad) !== null && _j !== void 0 ? _j : "publica",
                            empieza_en: (_k = v.empieza_en) !== null && _k !== void 0 ? _k : null,
                            termina_en: (_l = v.termina_en) !== null && _l !== void 0 ? _l : null,
                            en_malla: (_m = v.en_malla) !== null && _m !== void 0 ? _m : false,
                            pausada: false,
                            espectadores: 0,
                        })
                            .select("*")
                            .single()];
                case 3:
                    _a = _o.sent(), data = _a.data, error = _a.error;
                    if (error || !data) {
                        return [2 /*return*/, { ok: false, error: (error === null || error === void 0 ? void 0 : error.message) || "No se pudo publicar la estación." }];
                    }
                    return [2 /*return*/, { ok: true, estacion: data }];
                case 4:
                    _b = _o.sent();
                    return [2 /*return*/, { ok: false, error: "No se pudo publicar la estación." }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Edita una estación (parche parcial). Valida el parche con `validarEstacion`
 * rellenando de momento los obligatorios ausentes, y solo escribe las claves
 * presentes. Si cambia el enlace o el tipo, recalcula el formato.
 */
function editarEstacion(id, parche, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, borrador, veredicto, v, cambios, _a, data, error, _b;
        var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        return __generator(this, function (_r) {
            switch (_r.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase)
                        return [2 /*return*/, { ok: false, error: "No hay cliente de base de datos disponible." }];
                    if (!id)
                        return [2 /*return*/, { ok: false, error: "Falta el id de la estación." }];
                    borrador = {
                        titulo: (_c = parche.titulo) !== null && _c !== void 0 ? _c : "borrador",
                        tipo: (_d = parche.tipo) !== null && _d !== void 0 ? _d : "mixto",
                        fuente: (_e = parche.fuente) !== null && _e !== void 0 ? _e : "enlace",
                        enlace: (_f = parche.enlace) !== null && _f !== void 0 ? _f : "https://ejemplo.com",
                        licencia: (_g = parche.licencia) !== null && _g !== void 0 ? _g : "cc0",
                        descripcion: parche.descripcion,
                        imagen: (_h = parche.imagen) !== null && _h !== void 0 ? _h : undefined,
                        idioma: parche.idioma,
                        categorias: parche.categorias,
                        visibilidad: parche.visibilidad,
                        empieza_en: (_j = parche.empieza_en) !== null && _j !== void 0 ? _j : undefined,
                        termina_en: (_k = parche.termina_en) !== null && _k !== void 0 ? _k : undefined,
                        ambito_tipo: parche.ambito_tipo,
                        entidad_ref: (_l = parche.entidad_ref) !== null && _l !== void 0 ? _l : undefined,
                    };
                    veredicto = (0, tipos_1.validarEstacion)(borrador);
                    if (!veredicto.ok)
                        return [2 /*return*/, { ok: false, error: veredicto.errores.join(" ") }];
                    v = veredicto.estacion;
                    cambios = {};
                    if (parche.titulo !== undefined)
                        cambios.titulo = v.titulo;
                    if (parche.tipo !== undefined)
                        cambios.tipo = v.tipo;
                    if (parche.fuente !== undefined)
                        cambios.fuente = v.fuente;
                    if (parche.enlace !== undefined)
                        cambios.enlace = v.enlace;
                    if (parche.licencia !== undefined)
                        cambios.licencia = v.licencia;
                    if (parche.descripcion !== undefined)
                        cambios.descripcion = v.descripcion;
                    if (parche.imagen !== undefined)
                        cambios.imagen = (_m = v.imagen) !== null && _m !== void 0 ? _m : null;
                    if (parche.idioma !== undefined)
                        cambios.idioma = v.idioma;
                    if (parche.categorias !== undefined)
                        cambios.categorias = v.categorias;
                    if (parche.visibilidad !== undefined)
                        cambios.visibilidad = v.visibilidad;
                    if (parche.empieza_en !== undefined)
                        cambios.empieza_en = (_o = v.empieza_en) !== null && _o !== void 0 ? _o : null;
                    if (parche.termina_en !== undefined)
                        cambios.termina_en = (_p = v.termina_en) !== null && _p !== void 0 ? _p : null;
                    if (parche.ambito_tipo !== undefined)
                        cambios.ambito_tipo = v.ambito_tipo;
                    if (parche.entidad_ref !== undefined)
                        cambios.entidad_ref = (_q = v.entidad_ref) !== null && _q !== void 0 ? _q : null;
                    if (parche.enlace !== undefined || parche.tipo !== undefined) {
                        cambios.formato = (0, formato_1.detectarFormato)(v.enlace, v.tipo).formato;
                    }
                    if (Object.keys(cambios).length === 0) {
                        return [2 /*return*/, { ok: false, error: "No hay cambios que guardar." }];
                    }
                    _r.label = 1;
                case 1:
                    _r.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase
                            .from("os_estaciones")
                            .update(cambios)
                            .eq("id", id)
                            .select("*")
                            .single()];
                case 2:
                    _a = _r.sent(), data = _a.data, error = _a.error;
                    if (error || !data) {
                        return [2 /*return*/, { ok: false, error: (error === null || error === void 0 ? void 0 : error.message) || "No se pudo editar la estación." }];
                    }
                    return [2 /*return*/, { ok: true, estacion: data }];
                case 3:
                    _b = _r.sent();
                    return [2 /*return*/, { ok: false, error: "No se pudo editar la estación." }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Pone `ultimo_latido = ahora` (el dueño, mientras emite). Nunca lanza. */
function latirEstacion(id, espectadores, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, ahora, cambios, error, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase || !id)
                        return [2 /*return*/, false];
                    ahora = new Date().toISOString();
                    cambios = { ultimo_latido: ahora };
                    if (typeof espectadores === "number" && espectadores >= 0) {
                        cambios.espectadores = Math.floor(espectadores);
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase.from("os_estaciones").update(cambios).eq("id", id)];
                case 2:
                    error = (_b.sent()).error;
                    return [2 /*return*/, !error];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Pausa o reanuda una estación. */
function pausarEstacion(id, pausada, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, error, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase || !id)
                        return [2 /*return*/, false];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase
                            .from("os_estaciones")
                            .update({ pausada: pausada })
                            .eq("id", id)];
                case 2:
                    error = (_b.sent()).error;
                    return [2 /*return*/, !error];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Termina una emisión (`termina_en = ahora`). */
function terminarEstacion(id, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, error, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase || !id)
                        return [2 /*return*/, false];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, supabase
                            .from("os_estaciones")
                            .update({ termina_en: new Date().toISOString() })
                            .eq("id", id)];
                case 2:
                    error = (_b.sent()).error;
                    return [2 /*return*/, !error];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/** Registra la propia denuncia (motivo ≤ 300 caracteres). Requiere sesión. */
function denunciarEstacion(id, motivo, clienteInyectado) {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, autorId, error, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    supabase = resolverCliente(clienteInyectado);
                    if (!supabase || !id)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, usuarioEnSesion(supabase)];
                case 1:
                    autorId = _b.sent();
                    if (!autorId)
                        return [2 /*return*/, false];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, supabase.from("os_estaciones_denuncias").insert({
                            estacion_id: id,
                            autor_id: autorId,
                            motivo: motivo.trim().slice(0, MOTIVO_MAX),
                        })];
                case 3:
                    error = (_b.sent()).error;
                    return [2 /*return*/, !error];
                case 4:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/** Estaciones que esta persona ha ocultado solo para sí (localStorage). */
function ocultasLocales() {
    var vacio = new Set();
    try {
        if (typeof localStorage === "undefined")
            return vacio;
        var bruto = localStorage.getItem(CLAVE_OCULTAS);
        if (!bruto)
            return vacio;
        var lista = JSON.parse(bruto);
        if (!Array.isArray(lista))
            return vacio;
        return new Set(lista.filter(function (v) { return typeof v === "string"; }));
    }
    catch (_a) {
        return vacio;
    }
}
/** Oculta localmente una estación (no se borra nada del servidor). */
function ocultarLocal(id) {
    try {
        if (typeof localStorage === "undefined" || !id)
            return;
        var set = ocultasLocales();
        set.add(id);
        localStorage.setItem(CLAVE_OCULTAS, JSON.stringify(Array.from(set)));
    }
    catch (_a) {
        /* sin almacenamiento: se omite en silencio */
    }
}
