"use strict";
// src/lib/browser/browser.ts
// ─────────────────────────────────────────────────────────────────────────────
// StarSeed OS — Navegador (gestor de ventanas y pestañas) sobre Supabase.
//
// HONESTIDAD TÉCNICA: una app web NO puede incrustar sitios arbitrarios en
// iframes (muchos envían X-Frame-Options / CSP frame-ancestors que bloquean el
// embebido) ni reemplazar el motor de un navegador real. Por eso esto NO es un
// "navegador" en el sentido de Chrome/Safari, sino un GESTOR de ventanas que:
//   · Guarda ventanas (url, grupo, folder, estado, suspendida) en la tabla
//     pública `browser_windows`.
//   · Renderiza URLs incrustables en iframes sandbox, con fallback claro
//     ("este sitio no permite incrustarse — abrir en pestaña nueva") cuando el
//     sitio rechaza el embebido.
//   · Soporta operaciones de ventana: agrupar, archivar en folders, guardar,
//     suspender, modo widget, pantalla completa, multivista, posición y tamaño.
//   · Integra la NAVEGACIÓN REAL vía Astraura/Aurora a través de la extensión
//     Claude-in-Chrome (Astraura conduce el navegador real; aquí solo emitimos
//     la intención `starseed:astraura-browse`).
//
// Filosofía de fallback (igual que os-social.ts): si Supabase falla, no está
// configurado o no hay sesión, las lecturas devuelven [] y las escrituras
// devuelven `{ ok:false, needsAuth? }` sin lanzar, para que la UI nunca rompa.
//
// SSR-SAFE: este módulo no toca window/document en su nivel superior; el código
// que sí lo hace (compartir, abrir pestaña) vive en helpers que la UI llama
// únicamente desde efectos/handlers.
// ─────────────────────────────────────────────────────────────────────────────
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
exports.EXTERNAL_BROWSER_LABEL = exports.NEXUS_HOME = exports.STARSEED_NET_SUFFIXES = exports.STARSEED_SYSTEM_SUFFIXES = exports.PROXY_PARAM_KEY = exports.PROXY_MODE_KEY = exports.PROXY_ENDPOINT_KEY = exports.BROWSER_DOMAIN = exports.ATTACH_WINDOW_EVENT = exports.ASTRAURA_BROWSE_EVENT = exports.NO_FOLDER = exports.NO_GROUP = exports.SEARCH_ENGINE = exports.DEFAULT_STATE = void 0;
exports.normalizeState = normalizeState;
exports.normalizeUrl = normalizeUrl;
exports.urlHost = urlHost;
exports.isLikelyEmbeddable = isLikelyEmbeddable;
exports.groupsAndFolders = groupsAndFolders;
exports.shareRef = shareRef;
exports.listWindows = listWindows;
exports.saveWindow = saveWindow;
exports.newWindow = newWindow;
exports.deleteWindow = deleteWindow;
exports.setSuspended = setSuspended;
exports.setVrAr = setVrAr;
exports.setView = setView;
exports.setFolder = setFolder;
exports.setGroup = setGroup;
exports.setGeometry = setGeometry;
exports.requestAstrauraBrowse = requestAstrauraBrowse;
exports.emitAttachWindow = emitAttachWindow;
exports.renderUrl = renderUrl;
exports.hasProxyConfigured = hasProxyConfigured;
exports.classifyLink = classifyLink;
exports.openLink = openLink;
exports.resolveHome = resolveHome;
exports.isExternalTarget = isExternalTarget;
exports.enforceNetMode = enforceNetMode;
exports.openInExternalBrowser = openInExternalBrowser;
exports.proxiedUrlOrNull = proxiedUrlOrNull;
var client_1 = require("@/utils/supabase/client");
var service_routes_1 = require("@/lib/services/service-routes");
// ── Constantes ──
var TABLE = "browser_windows";
var DEFAULT_VIEW = "window";
/** Estado por defecto para una ventana nueva (posición escalonada se aplica en newWindow). */
exports.DEFAULT_STATE = { x: 40, y: 40, w: 480, h: 360, view: DEFAULT_VIEW, z: 1 };
/** Motor de búsqueda por defecto (privado, sin tracking). */
exports.SEARCH_ENGINE = "https://duckduckgo.com/?q=";
// ── Normalización ──
/** Combina un `state` parcial con los valores por defecto, saneando números. */
function normalizeState(raw) {
    var s = raw || {};
    var num = function (v, d) {
        return typeof v === "number" && Number.isFinite(v) ? v : d;
    };
    var view = s.view === "widget" || s.view === "fullscreen" || s.view === "tab"
        ? s.view
        : DEFAULT_VIEW;
    return {
        x: num(s.x, exports.DEFAULT_STATE.x),
        y: num(s.y, exports.DEFAULT_STATE.y),
        w: num(s.w, exports.DEFAULT_STATE.w),
        h: num(s.h, exports.DEFAULT_STATE.h),
        view: view,
        z: num(s.z, exports.DEFAULT_STATE.z),
    };
}
function normalizeWindow(row) {
    return {
        id: row.id,
        owner: row.owner || undefined,
        name: row.name || row.url || "Ventana",
        groupName: row.group_name || "",
        folder: row.folder || "",
        url: row.url || "",
        state: normalizeState(row.state),
        suspended: !!row.suspended,
        vrAr: !!row.vr_ar,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// URL: normalización, búsqueda y heurística de "incrustabilidad"
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Normaliza la entrada de la barra de direcciones:
 *   · Si parece una URL/host (tiene punto o esquema) → asegura https://.
 *   · Si parece una búsqueda (texto con espacios, o sin punto) → DuckDuckGo.
 * Nunca lanza; devuelve siempre una URL absoluta usable en un iframe / pestaña.
 */
function normalizeUrl(input) {
    var raw = (input || "").trim();
    if (!raw)
        return "";
    // Ya trae esquema explícito.
    if (/^https?:\/\//i.test(raw))
        return raw;
    // Esquemas no http (mailto:, tel:, etc.) → se respetan tal cual.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.includes(" "))
        return raw;
    // Heurística "es un dominio/URL": sin espacios y con un punto (o localhost).
    var looksLikeHost = !raw.includes(" ") &&
        (/^[^\s/]+\.[^\s/]{2,}/.test(raw) || /^localhost(?::\d+)?(?:\/|$)/i.test(raw));
    if (looksLikeHost)
        return "https://".concat(raw);
    // En cualquier otro caso lo tratamos como búsqueda.
    return "".concat(exports.SEARCH_ENGINE).concat(encodeURIComponent(raw));
}
/** Extrae el hostname de una URL de forma tolerante (vacío si no es válida). */
function urlHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    }
    catch (_a) {
        return "";
    }
}
/**
 * Hosts/sufijos que SABEMOS suelen permitir el embebido en iframe.
 * No es exhaustivo — solo evita mostrar el aviso de fallback de entrada para
 * destinos conocidos. Para todo lo demás aplicamos "intenta el iframe y haz
 * fallback si falla la carga" (ver isLikelyEmbeddable + onError en la UI).
 */
var EMBEDDABLE_SUFFIXES = [
    "wikipedia.org",
    "m.wikipedia.org",
    "openstreetmap.org",
    "youtube.com",
    "youtube-nocookie.com",
    "player.vimeo.com",
    "vimeo.com",
    "codepen.io",
    "codesandbox.io",
    "observablehq.com",
    "archive.org",
    "duckduckgo.com",
    "example.com",
];
/**
 * Hosts/sufijos que CASI SIEMPRE bloquean el embebido (X-Frame-Options:
 * DENY/SAMEORIGIN o CSP frame-ancestors). Para estos mostramos directamente
 * el fallback "abrir en pestaña nueva" sin intentar el iframe.
 */
var NON_EMBEDDABLE_SUFFIXES = [
    "google.com",
    "accounts.google.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "github.com",
    "gitlab.com",
    "linkedin.com",
    "amazon.com",
    "netflix.com",
    "reddit.com",
    "chatgpt.com",
    "openai.com",
    "claude.ai",
    "anthropic.com",
    "notion.so",
    "figma.com",
];
function hostMatches(host, suffixes) {
    if (!host)
        return false;
    return suffixes.some(function (s) { return host === s || host.endsWith(".".concat(s)); });
}
/**
 * Heurística de "incrustabilidad". Devuelve:
 *   · true  → conocido-incrustable o mismo origen → intenta iframe directo.
 *   · false → conocido-bloqueante → muestra fallback de entrada.
 *   · "try" → desconocido → intenta el iframe y haz fallback en onError/timeout.
 *
 * Esta función NO puede determinar con certeza la cabecera del servidor desde el
 * cliente (CORS lo impide), por eso el veredicto real lo da el evento de carga
 * del iframe en la UI. Aquí solo orientamos la experiencia inicial.
 */
function isLikelyEmbeddable(url) {
    var host = urlHost(url);
    if (!host)
        return "try";
    // Mismo origen (cuando hay window) → siempre incrustable.
    if (typeof window !== "undefined") {
        try {
            if (new URL(url).origin === window.location.origin)
                return true;
        }
        catch (_a) {
            /* noop */
        }
    }
    if (hostMatches(host, NON_EMBEDDABLE_SUFFIXES))
        return false;
    if (hostMatches(host, EMBEDDABLE_SUFFIXES))
        return true;
    return "try";
}
// ─────────────────────────────────────────────────────────────────────────────
// Agrupación: grupos y folders
// ─────────────────────────────────────────────────────────────────────────────
exports.NO_GROUP = "Sin grupo";
exports.NO_FOLDER = "Sin folder";
/**
 * Calcula los índices por grupo y por folder para alimentar la UI colapsable.
 * Las ventanas sin grupo/folder se agrupan bajo las etiquetas NO_GROUP/NO_FOLDER.
 */
function groupsAndFolders(windows) {
    var _a, _b;
    var byGroup = {};
    var byFolder = {};
    for (var _i = 0, windows_1 = windows; _i < windows_1.length; _i++) {
        var w = windows_1[_i];
        var g = ((_a = w.groupName) === null || _a === void 0 ? void 0 : _a.trim()) || exports.NO_GROUP;
        var f = ((_b = w.folder) === null || _b === void 0 ? void 0 : _b.trim()) || exports.NO_FOLDER;
        (byGroup[g] || (byGroup[g] = [])).push(w);
        (byFolder[f] || (byFolder[f] = [])).push(w);
    }
    var sortLabels = function (keys, none) {
        return keys.sort(function (a, b) {
            if (a === none)
                return 1; // "Sin ..." al final
            if (b === none)
                return -1;
            return a.localeCompare(b, "es");
        });
    };
    return {
        groups: sortLabels(Object.keys(byGroup), exports.NO_GROUP),
        folders: sortLabels(Object.keys(byFolder), exports.NO_FOLDER),
        byGroup: byGroup,
        byFolder: byFolder,
    };
}
/**
 * Construye una referencia compartible de una ventana. Pensada para:
 *   · Copiar al portapapeles como JSON.
 *   · Emitir en un evento `window` (starseed:attach-window) que la pizarra o el
 *     compositor de publicaciones puede escuchar.
 */
function shareRef(w) {
    return {
        kind: "starseed/browser-window",
        version: 1,
        id: w.id,
        name: w.name,
        url: w.url,
        host: urlHost(w.url),
        group: w.groupName || "",
        folder: w.folder || "",
        view: w.state.view,
        suspended: w.suspended,
        sharedAt: new Date().toISOString(),
    };
}
function getUid() {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, data, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    supabase = (0, client_1.createClient)();
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 1:
                    data = (_d.sent()).data;
                    return [2 /*return*/, (_c = (_b = data === null || data === void 0 ? void 0 : data.user) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null];
                case 2:
                    _a = _d.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Lista las ventanas del usuario (más recientes primero). Si no hay sesión o
 * Supabase falla devuelve [] (la UI muestra el estado vacío / semillas locales).
 */
function listWindows() {
    return __awaiter(this, void 0, void 0, function () {
        var supabase, au, uid, _a, data, error, _b;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 3, , 4]);
                    supabase = (0, client_1.createClient)();
                    return [4 /*yield*/, supabase.auth.getUser()];
                case 1:
                    au = (_e.sent()).data;
                    uid = (_d = (_c = au === null || au === void 0 ? void 0 : au.user) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null;
                    if (!uid)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, supabase
                            .from(TABLE)
                            .select("*")
                            .eq("owner", uid)
                            .order("updated_at", { ascending: false })];
                case 2:
                    _a = _e.sent(), data = _a.data, error = _a.error;
                    if (error)
                        return [2 /*return*/, []];
                    return [2 /*return*/, (data || []).map(normalizeWindow)];
                case 3:
                    _b = _e.sent();
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Inserta (sin id) o actualiza (con id) una ventana. Exige sesión.
 * Devuelve la ventana normalizada resultante en `window`.
 */
function saveWindow(w) {
    return __awaiter(this, void 0, void 0, function () {
        var uid, supabase, payload, query, _a, data, error, e_1;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, getUid()];
                case 1:
                    uid = _d.sent();
                    if (!uid)
                        return [2 /*return*/, { ok: false, needsAuth: true }];
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 4, , 5]);
                    supabase = (0, client_1.createClient)();
                    payload = {
                        owner: uid,
                        name: w.name || w.url,
                        group_name: (_b = w.groupName) !== null && _b !== void 0 ? _b : "",
                        folder: (_c = w.folder) !== null && _c !== void 0 ? _c : "",
                        url: w.url,
                        state: normalizeState(w.state),
                        suspended: !!w.suspended,
                        vr_ar: !!w.vrAr,
                        updated_at: new Date().toISOString(),
                    };
                    query = w.id
                        ? supabase.from(TABLE).update(payload).eq("id", w.id).eq("owner", uid)
                        : supabase.from(TABLE).insert(payload);
                    return [4 /*yield*/, query.select("*").single()];
                case 3:
                    _a = _d.sent(), data = _a.data, error = _a.error;
                    if (error)
                        return [2 /*return*/, { ok: false, error: error.message }];
                    return [2 /*return*/, { ok: true, window: normalizeWindow(data) }];
                case 4:
                    e_1 = _d.sent();
                    return [2 /*return*/, { ok: false, error: e_1 === null || e_1 === void 0 ? void 0 : e_1.message }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/** Crea una ventana nueva a partir de una URL/búsqueda cruda. */
function newWindow(input, name, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var url, jitter, state;
        return __generator(this, function (_a) {
            url = normalizeUrl(input);
            if (!url)
                return [2 /*return*/, { ok: false, error: "URL vacía" }];
            jitter = Math.floor(Math.random() * 6) * 24;
            state = __assign(__assign({}, exports.DEFAULT_STATE), { x: exports.DEFAULT_STATE.x + jitter, y: exports.DEFAULT_STATE.y + jitter });
            return [2 /*return*/, saveWindow({
                    url: url,
                    name: (name === null || name === void 0 ? void 0 : name.trim()) || urlHost(url) || url,
                    state: state,
                    vrAr: !!(opts === null || opts === void 0 ? void 0 : opts.vrAr),
                })];
        });
    });
}
/** Elimina una ventana propia. */
function deleteWindow(id) {
    return __awaiter(this, void 0, void 0, function () {
        var uid, supabase, error, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getUid()];
                case 1:
                    uid = _a.sent();
                    if (!uid)
                        return [2 /*return*/, { ok: false, needsAuth: true }];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    supabase = (0, client_1.createClient)();
                    return [4 /*yield*/, supabase
                            .from(TABLE)
                            .delete()
                            .eq("id", id)
                            .eq("owner", uid)];
                case 3:
                    error = (_a.sent()).error;
                    if (error)
                        return [2 /*return*/, { ok: false, error: error.message }];
                    return [2 /*return*/, { ok: true }];
                case 4:
                    e_2 = _a.sent();
                    return [2 /*return*/, { ok: false, error: e_2 === null || e_2 === void 0 ? void 0 : e_2.message }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/** Marca/desmarca una ventana como suspendida (libera el iframe). */
function setSuspended(id, value) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchWindow(id, { suspended: value })];
        });
    });
}
/** Marca/desmarca la ventana para abrirse en modo inmersivo VR/AR. */
function setVrAr(id, value) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchWindow(id, { vr_ar: value })];
        });
    });
}
/** Cambia el modo de vista (window/widget/fullscreen/tab) dentro de `state`. */
function setView(id, view) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchState(id, { view: view })];
        });
    });
}
/** Asigna (o limpia) el folder de archivado de una ventana. */
function setFolder(id, folder) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchWindow(id, { folder: folder.trim() })];
        });
    });
}
/** Asigna (o limpia) el grupo de una ventana. */
function setGroup(id, group) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchWindow(id, { group_name: group.trim() })];
        });
    });
}
/** Persiste posición/tamaño/z (multi-prop) sin tocar el resto del estado. */
function setGeometry(id, geom) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, patchState(id, geom)];
        });
    });
}
function patchWindow(id, patch) {
    return __awaiter(this, void 0, void 0, function () {
        var uid, supabase, _a, data, error, e_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getUid()];
                case 1:
                    uid = _b.sent();
                    if (!uid)
                        return [2 /*return*/, { ok: false, needsAuth: true }];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    supabase = (0, client_1.createClient)();
                    return [4 /*yield*/, supabase
                            .from(TABLE)
                            .update(__assign(__assign({}, patch), { updated_at: new Date().toISOString() }))
                            .eq("id", id)
                            .eq("owner", uid)
                            .select("*")
                            .single()];
                case 3:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        return [2 /*return*/, { ok: false, error: error.message }];
                    return [2 /*return*/, { ok: true, window: normalizeWindow(data) }];
                case 4:
                    e_3 = _b.sent();
                    return [2 /*return*/, { ok: false, error: e_3 === null || e_3 === void 0 ? void 0 : e_3.message }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parche superficial de la columna `state` (jsonb). Re-lee el estado actual para
 * fusionarlo (evita pisar campos que no se tocan). Tolerante a fallos.
 */
function patchState(id, patch) {
    return __awaiter(this, void 0, void 0, function () {
        var uid, supabase, cur, merged, _a, data, error, e_4;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getUid()];
                case 1:
                    uid = _b.sent();
                    if (!uid)
                        return [2 /*return*/, { ok: false, needsAuth: true }];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 5, , 6]);
                    supabase = (0, client_1.createClient)();
                    return [4 /*yield*/, supabase
                            .from(TABLE)
                            .select("state")
                            .eq("id", id)
                            .eq("owner", uid)
                            .maybeSingle()];
                case 3:
                    cur = (_b.sent()).data;
                    merged = normalizeState(__assign(__assign({}, normalizeState(cur === null || cur === void 0 ? void 0 : cur.state)), patch));
                    return [4 /*yield*/, supabase
                            .from(TABLE)
                            .update({ state: merged, updated_at: new Date().toISOString() })
                            .eq("id", id)
                            .eq("owner", uid)
                            .select("*")
                            .single()];
                case 4:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        return [2 /*return*/, { ok: false, error: error.message }];
                    return [2 /*return*/, { ok: true, window: normalizeWindow(data) }];
                case 5:
                    e_4 = _b.sent();
                    return [2 /*return*/, { ok: false, error: e_4 === null || e_4 === void 0 ? void 0 : e_4.message }];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Integración con Astraura / Aurora (navegación real vía Claude-in-Chrome)
// ─────────────────────────────────────────────────────────────────────────────
exports.ASTRAURA_BROWSE_EVENT = "starseed:astraura-browse";
exports.ATTACH_WINDOW_EVENT = "starseed:attach-window";
/**
 * Emite la intención de que Astraura/Aurora navegue REALMENTE a una URL usando
 * la extensión Claude-in-Chrome. Esta función NO navega por sí misma: solo
 * publica el evento `starseed:astraura-browse` en `window` para que el puente IA
 * (que sí tiene acceso al navegador real) lo recoja. SSR-safe (no-op en server).
 *
 * Hook documentado:
 *   window.addEventListener('starseed:astraura-browse', (e: CustomEvent<AstrauraBrowseDetail>) => { ... })
 */
function requestAstrauraBrowse(url, intent) {
    if (typeof window === "undefined")
        return false;
    var detail = { url: url, intent: intent, source: "navegador" };
    window.dispatchEvent(new CustomEvent(exports.ASTRAURA_BROWSE_EVENT, { detail: detail }));
    return true;
}
/**
 * Emite el evento de "adjuntar ventana" a la pizarra/publicación. Pensado para
 * que el compositor de posts o el canvas (pizarra) lo escuche. SSR-safe.
 */
function emitAttachWindow(w) {
    if (typeof window === "undefined")
        return false;
    window.dispatchEvent(new CustomEvent(exports.ATTACH_WINDOW_EVENT, { detail: shareRef(w) }));
    return true;
}
// ─────────────────────────────────────────────────────────────────────────────
// Servidores del navegador (tri-fuente) + proxy/render de paginas
// ─────────────────────────────────────────────────────────────────────────────
// El navegador puede enrutar la carga/render de cualquier sitio http a traves de
// un SERVIDOR de render/proxy configurado en el modelo tri-fuente (dominio
// "browser"): Servidor personal / Servidor StarSeed / Servidor externo, las tres
// activables a la vez. Con un endpoint de proxy configurado, los sitios que
// bloquean el iframe pueden incrustarse via proxy; sin endpoint, caemos a
// window.open. HONESTIDAD: el proxying real SOLO funciona con un servidor
// configurado (o la extension/app de escritorio). Config en `service_routes`
// (dominio "browser") via TriSourceConfig.
/** Dominio tri-fuente del navegador (para <TriSourceConfig domain={BROWSER_DOMAIN} />). */
exports.BROWSER_DOMAIN = "browser";
/** Clave de `config` por fuente: endpoint del proxy de render. */
exports.PROXY_ENDPOINT_KEY = "proxy_endpoint";
/** Clave de `config` por fuente: como se pasa la URL ("query" | "path"). */
exports.PROXY_MODE_KEY = "proxy_mode";
/** Clave de `config` por fuente: nombre del parametro de query (def. "url"). */
exports.PROXY_PARAM_KEY = "proxy_param";
/**
 * Construye la URL de carga segun la config tri-fuente del dominio "browser".
 * Si la fuente activa primaria tiene endpoint de proxy, envuelve la URL destino
 * (query: `${endpoint}?url=<enc>` o path: `${endpoint}/<enc>`). Sin proxy
 * devuelve la URL original (proxied:false). SSR-safe.
 */
function renderUrl(url) {
    if (!url)
        return { rendered: url, proxied: false };
    try {
        var participants = (0, service_routes_1.resolveRoute)(exports.BROWSER_DOMAIN).participants;
        for (var _i = 0, participants_1 = participants; _i < participants_1.length; _i++) {
            var s = participants_1[_i];
            var cfg = (s.config || {});
            var endpoint = (typeof cfg[exports.PROXY_ENDPOINT_KEY] === "string"
                ? cfg[exports.PROXY_ENDPOINT_KEY]
                : s.endpoint || "").trim();
            if (!endpoint)
                continue;
            var mode = cfg[exports.PROXY_MODE_KEY] === "path" ? "path" : "query";
            var param = typeof cfg[exports.PROXY_PARAM_KEY] === "string" && cfg[exports.PROXY_PARAM_KEY]
                ? cfg[exports.PROXY_PARAM_KEY]
                : "url";
            var enc = encodeURIComponent(url);
            var rendered = mode === "path"
                ? "".concat(endpoint.replace(/\/+$/, ""), "/").concat(enc)
                : "".concat(endpoint).concat(endpoint.includes("?") ? "&" : "?").concat(param, "=").concat(enc);
            return { rendered: rendered, proxied: true, source: s.kind };
        }
    }
    catch (_a) {
        /* sin proxy / sin window */
    }
    return { rendered: url, proxied: false };
}
/** true si hay al menos una fuente del navegador con endpoint de proxy. */
function hasProxyConfigured() {
    try {
        var participants = (0, service_routes_1.resolveRoute)(exports.BROWSER_DOMAIN).participants;
        return participants.some(function (s) {
            var cfg = (s.config || {});
            var ep = typeof cfg[exports.PROXY_ENDPOINT_KEY] === "string"
                ? cfg[exports.PROXY_ENDPOINT_KEY]
                : s.endpoint;
            return !!(ep && ep.trim());
        });
    }
    catch (_a) {
        return false;
    }
}
/** Otros sistemas StarSeed conocidos (Nexus / Cafe / Audiomorphic ...). */
exports.STARSEED_SYSTEM_SUFFIXES = [
    "starseed.systems",
    "starseed.system",
    "nexus.starseed.systems",
    "cafe.starseed.systems",
    "audiomorphic.starseed.systems",
    "audiomorphic.com",
    // Apps de la red StarSeed alojadas en Vercel (incluida la home por defecto).
    "starseed-nexus.vercel.app",
    "starseed-system.vercel.app",
];
/**
 * Sufijos que cuentan como "red StarSeed" para el modo de red (internet abierto
 * vs solo interno). Incluye los sistemas StarSeed conocidos. Una ruta interna de
 * la OS ("/...") o el mismo origen son SIEMPRE internos (ver isExternalTarget).
 */
exports.STARSEED_NET_SUFFIXES = __spreadArray(__spreadArray([], exports.STARSEED_SYSTEM_SUFFIXES, true), [
    "starseed",
], false);
/** Clasifica un destino: internal | starseed | external. SSR-safe. */
function classifyLink(target) {
    var t = (target || "").trim();
    if (!t)
        return "external";
    if (t.startsWith("/") && !t.startsWith("//"))
        return "internal";
    var host = urlHost(t);
    if (typeof window !== "undefined") {
        try {
            if (new URL(t, window.location.href).origin === window.location.origin) {
                return "internal";
            }
        }
        catch (_a) {
            /* noop */
        }
    }
    if (hostMatches(host, exports.STARSEED_SYSTEM_SUFFIXES))
        return "starseed";
    return "external";
}
/** Abre un destino: interno via router.push/location, externo/starseed via window.open. */
function openLink(target, opts) {
    var kind = classifyLink(target);
    if (typeof window === "undefined")
        return { kind: kind, opened: false };
    if (kind === "internal") {
        if (opts === null || opts === void 0 ? void 0 : opts.router)
            opts.router.push(target);
        else
            window.location.assign(target);
        return { kind: kind, opened: true };
    }
    window.open(target, "_blank", "noopener,noreferrer");
    return { kind: kind, opened: true };
}
// ─────────────────────────────────────────────────────────────────────────────
// Home (página de inicio configurable) — por defecto StarSeed Nexus
// ─────────────────────────────────────────────────────────────────────────────
/** Home por defecto del navegador: StarSeed Nexus. */
exports.NEXUS_HOME = "https://starseed-nexus.vercel.app";
/**
 * Resuelve la home efectiva para una ventana/pestaña dada. `perWindow[id]`
 * (si existe y no está vacío) tiene prioridad sobre la home global; ésta cae a
 * Nexus si está vacía. Acepta rutas internas ("/...") o URLs. SSR-safe.
 */
function resolveHome(home, windowId) {
    var _a;
    var per = (windowId && ((_a = home === null || home === void 0 ? void 0 : home.perWindow) === null || _a === void 0 ? void 0 : _a[windowId])) || "";
    var candidate = (per || (home === null || home === void 0 ? void 0 : home.url) || "").trim();
    if (!candidate)
        return exports.NEXUS_HOME;
    if (candidate.startsWith("/"))
        return candidate; // ruta interna de la OS
    return normalizeUrl(candidate);
}
/**
 * ¿El destino es EXTERNO a la red StarSeed? Internos: rutas de la OS ("/..."),
 * mismo origen, o cualquier host de la red StarSeed (STARSEED_NET_SUFFIXES).
 * Todo lo demás es externo (internet abierto). SSR-safe.
 */
function isExternalTarget(target) {
    var t = (target || "").trim();
    if (!t)
        return false;
    if (t.startsWith("/") && !t.startsWith("//"))
        return false; // ruta interna OS
    if (typeof window !== "undefined") {
        try {
            if (new URL(t, window.location.href).origin === window.location.origin) {
                return false;
            }
        }
        catch (_a) {
            /* noop */
        }
    }
    var host = urlHost(t);
    if (hostMatches(host, exports.STARSEED_NET_SUFFIXES))
        return false;
    return true;
}
/**
 * Aplica el modo de red a un destino. En modo "internal" se BLOQUEA cualquier
 * destino externo a StarSeed; en "open" se permite todo. Devuelve si está
 * permitido y, si no, el motivo. Pura (sin efectos).
 */
function enforceNetMode(target, mode) {
    var external = isExternalTarget(target);
    if (mode === "internal" && external) {
        return {
            allowed: false,
            external: external,
            reason: "Modo «solo interno» activo: este destino es de internet abierto y está bloqueado. " +
                "Cambia a «internet abierto» en Ajustes para permitirlo.",
        };
    }
    return { allowed: true, external: external };
}
exports.EXTERNAL_BROWSER_LABEL = {
    chrome: "Google Chrome",
    opera: "Opera",
    ecosia: "Ecosia",
    default: "Navegador predeterminado",
};
/**
 * Intenta abrir `url` en el navegador externo elegido. Devuelve `{ opened,
 * honest }`: `honest=false` cuando se usó un esquema específico del navegador
 * (puede no estar instalado), `true` cuando se abrió una pestaña nueva normal.
 * SSR-safe.
 */
function openInExternalBrowser(url, browser) {
    if (typeof window === "undefined" || !url)
        return { opened: false, honest: true };
    var u = url.startsWith("/")
        ? new URL(url, window.location.href).toString()
        : normalizeUrl(url);
    // Esquemas "abrir con" conocidos (sólo móvil/algunas plataformas; best-effort).
    // En desktop estos esquemas no existen de forma estándar, así que caemos a
    // window.open. Detectamos móvil de forma laxa por el user agent.
    var ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    var isAndroid = /Android/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    try {
        if (browser === "chrome") {
            if (isIOS) {
                // Chrome iOS: esquema googlechrome(s)://
                var scheme = u.replace(/^https?/i, function (m) {
                    return m.toLowerCase() === "https" ? "googlechromes" : "googlechrome";
                });
                window.open(scheme, "_blank");
                return { opened: true, honest: false };
            }
            if (isAndroid) {
                // Intent de Android hacia Chrome.
                var intent = "intent://" +
                    u.replace(/^https?:\/\//i, "") +
                    "#Intent;scheme=https;package=com.android.chrome;end";
                window.open(intent, "_blank");
                return { opened: true, honest: false };
            }
        }
        if (browser === "opera") {
            if (isAndroid) {
                var intent = "intent://" +
                    u.replace(/^https?:\/\//i, "") +
                    "#Intent;scheme=https;package=com.opera.browser;end";
                window.open(intent, "_blank");
                return { opened: true, honest: false };
            }
            if (isIOS) {
                // Opera Touch iOS: esquema touch-http(s)://
                var scheme = u.replace(/^https?/i, function (m) {
                    return m.toLowerCase() === "https" ? "touch-https" : "touch-http";
                });
                window.open(scheme, "_blank");
                return { opened: true, honest: false };
            }
        }
        if (browser === "ecosia") {
            // Ecosia no expone un esquema fiable: abrimos la URL directamente
            // (en Ecosia si es el navegador del usuario; si no, una pestaña nueva)
            // o, como alternativa, una búsqueda en Ecosia del propio destino.
            window.open(u, "_blank", "noopener,noreferrer");
            return { opened: true, honest: true };
        }
    }
    catch (_a) {
        /* cae a window.open honesto */
    }
    // Predeterminado / desktop / fallback: abrir honestamente una pestaña nueva.
    window.open(u, "_blank", "noopener,noreferrer");
    return { opened: true, honest: true };
}
/**
 * Construye la URL para abrir un destino "vía otro servidor" (el proxy/render
 * tri-fuente del dominio "browser"), o null si no hay proxy configurado. Útil
 * en el diálogo de sitio bloqueado para la opción «otro servidor».
 */
function proxiedUrlOrNull(url) {
    var t = renderUrl(url);
    return t.proxied ? t.rendered : null;
}
