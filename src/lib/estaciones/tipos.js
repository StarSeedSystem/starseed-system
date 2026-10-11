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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ETIQUETA_LICENCIA = exports.ETIQUETA_TIPO = exports.LICENCIAS_LIBRES = exports.FUENTES_ESTACION = exports.TIPOS_ESTACION = void 0;
exports.normalizarCategorias = normalizarCategorias;
exports.validarEstacion = validarEstacion;
var url_utils_1 = require("@/lib/library/url-utils");
exports.TIPOS_ESTACION = ["audio", "video", "xr", "evento", "anuncio", "juego", "pizarra", "dashboard", "programa", "app", "mixto"];
exports.FUENTES_ESTACION = ["enlace", "starseed", "estudio"];
exports.LICENCIAS_LIBRES = ["cc0", "cc-by", "cc-by-sa", "dominio-publico", "libre-otra", "propia-abierta"];
exports.ETIQUETA_TIPO = {
    audio: "Audio",
    video: "Vídeo",
    xr: "Realidad virtual",
    evento: "Evento",
    anuncio: "Anuncio",
    juego: "Juego",
    pizarra: "Pizarra",
    dashboard: "Dashboard",
    programa: "Programa",
    app: "App",
    mixto: "Mixto",
};
exports.ETIQUETA_LICENCIA = {
    cc0: "CC0 · dominio público dedicado",
    "cc-by": "CC BY",
    "cc-by-sa": "CC BY-SA",
    "dominio-publico": "Dominio público",
    "libre-otra": "Otra licencia libre",
    "propia-abierta": "Propia y abierta",
};
function normalizarCategorias(bruto) {
    if (bruto == null)
        return [];
    var arr = typeof bruto === "string" ? bruto.split(",") : bruto;
    var set = new Set();
    for (var _i = 0, arr_1 = arr; _i < arr_1.length; _i++) {
        var raw = arr_1[_i];
        var v = raw.trim().toLowerCase();
        if (v)
            set.add(v);
    }
    var out = Array.from(set);
    return out.slice(0, 8);
}
function esFechaISO(v) {
    if (!v)
        return true;
    var d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().startsWith(v.slice(0, 10));
}
function validarEstacion(b) {
    var errores = [];
    var datos = __assign({}, b);
    if (typeof datos.titulo !== "string") {
        errores.push("Título es obligatorio.");
    }
    else {
        var t = datos.titulo.trim();
        if (t.length < 2 || t.length > 100) {
            errores.push("El título debe tener entre 2 y 100 caracteres.");
        }
        datos.titulo = t;
    }
    if (datos.descripcion != null) {
        if (typeof datos.descripcion !== "string" || datos.descripcion.length > 1000) {
            errores.push("La descripción no puede superar 1000 caracteres.");
        }
        else {
            datos.descripcion = datos.descripcion.trim();
        }
    }
    if (!exports.TIPOS_ESTACION.includes(datos.tipo)) {
        errores.push("Tipo no válido. Usa uno de: audio, video, xr, evento, anuncio, juego, pizarra, dashboard, programa, app, mixto.");
    }
    if (!exports.FUENTES_ESTACION.includes(datos.fuente)) {
        errores.push("Fuente no válida. Usa enlace, starseed o estudio.");
    }
    if (!exports.LICENCIAS_LIBRES.includes(datos.licencia)) {
        errores.push("Licencia no válida. Elige una licencia libre.");
    }
    if (typeof datos.enlace !== "string" || !datos.enlace.trim()) {
        errores.push("Enlace es obligatorio.");
    }
    else {
        var enlace = datos.enlace.trim();
        datos.enlace = enlace;
        if (datos.fuente === "enlace") {
            if (!(0, url_utils_1.isSafeHttpUrl)(enlace)) {
                errores.push("El enlace debe ser una URL https segura.");
            }
            else {
                try {
                    var u = new URL(enlace);
                    if (u.protocol !== "https:")
                        errores.push("Para fuentes externas se exige https.");
                }
                catch (_a) {
                    errores.push("El enlace no es una URL válida.");
                }
            }
        }
        else if (datos.fuente === "starseed" || datos.fuente === "estudio") {
            if (!enlace.startsWith("/") || enlace.startsWith("//") || enlace.startsWith("/\\")) {
                errores.push("Para fuente interna el enlace debe empezar por / y no ser relativo.");
            }
        }
    }
    if (datos.imagen != null && datos.imagen !== "") {
        if (typeof datos.imagen !== "string" || !(0, url_utils_1.isSafeHttpUrl)(datos.imagen)) {
            errores.push("La imagen debe ser una URL https segura o null.");
        }
        else {
            try {
                var u = new URL(datos.imagen);
                if (u.protocol !== "https:")
                    errores.push("La imagen debe usar https.");
            }
            catch (_b) { }
        }
    }
    if (datos.empieza_en) {
        if (!esFechaISO(datos.empieza_en))
            errores.push("empieza_en debe ser una fecha ISO válida.");
    }
    if (datos.termina_en) {
        if (!esFechaISO(datos.termina_en))
            errores.push("termina_en debe ser una fecha ISO válida.");
    }
    if (datos.empieza_en && datos.termina_en) {
        var e = new Date(datos.empieza_en).getTime();
        var t = new Date(datos.termina_en).getTime();
        if (!isNaN(e) && !isNaN(t) && t <= e) {
            errores.push("termina_en debe ser posterior a empieza_en.");
        }
    }
    if (datos.ambito_tipo === "entidad") {
        if (!datos.entidad_ref || typeof datos.entidad_ref !== "string" || !datos.entidad_ref.trim()) {
            errores.push("Cuando ambito_tipo es entidad, entidad_ref es obligatorio.");
        }
    }
    var cats = normalizarCategorias(datos.categorias);
    for (var _i = 0, cats_1 = cats; _i < cats_1.length; _i++) {
        var c = cats_1[_i];
        if (c.length > 24) {
            errores.push("Categor\u00EDa \"".concat(c, "\" supera 24 caracteres."));
            break;
        }
    }
    datos.categorias = cats;
    if (!datos.idioma)
        datos.idioma = "es";
    if (!datos.visibilidad)
        datos.visibilidad = "publica";
    if (datos.en_malla == null)
        datos.en_malla = false;
    if (!datos.ambito_tipo)
        datos.ambito_tipo = "persona";
    if (errores.length)
        return { ok: false, errores: errores };
    return { ok: true, estacion: datos };
}
