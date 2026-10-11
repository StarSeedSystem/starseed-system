"use strict";
/**
 * cripto-estacion — firma, identidad y cifrado de las estaciones EN VIVO (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3).
 *
 * Por qué hace falta: una estación en vivo viaja por un canal de difusión (Supabase Realtime o
 * un enlace local) donde cualquiera que conozca el tema puede escribir. Sin firma, cualquier
 * oyente podría «pausar para todos» o falsear el reloj común. Por eso:
 *
 *   · La sesión nace con un par de llaves ECDSA P-256 del anfitrión. Su id ES la huella de la
 *     llave pública (`idDeLlave`), así que el enlace se autocertifica: quien recibe una orden
 *     comprueba que la llave que la firma da ese mismo id, sin consultar a nadie.
 *   · Solo quien tiene la llave privada (el anfitrión, en cualquiera de sus medios) firma
 *     acciones, estados y respuestas del reloj. Los oyentes solo verifican.
 *   · Las estaciones privadas usan un token que solo tienen los invitados: de él salen el tema
 *     del canal (imposible de adivinar) y una clave AES-GCM que cifra todo lo que pasa por él.
 *
 * Todo con WebCrypto (navegador y Node ≥ 20). Sin dependencias. Nunca se imprime una llave.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.aBase64Url = aBase64Url;
exports.deBase64Url = deBase64Url;
exports.textoABase64Url = textoABase64Url;
exports.base64UrlATexto = base64UrlATexto;
exports.crearLlaves = crearLlaves;
exports.idDeLlave = idDeLlave;
exports.llaveCasaConId = llaveCasaConId;
exports.exportarPrivada = exportarPrivada;
exports.importarPrivada = importarPrivada;
exports.publicaDePrivada = publicaDePrivada;
exports.firmar = firmar;
exports.verificar = verificar;
exports.crearToken = crearToken;
exports.temaPublico = temaPublico;
exports.temaPrivado = temaPrivado;
exports.cifrar = cifrar;
exports.descifrar = descifrar;
var enc = new TextEncoder();
var dec = new TextDecoder();
function sutil() {
    var _a;
    var s = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.subtle;
    if (!s)
        throw new Error("Este medio no tiene WebCrypto: no puede firmar ni verificar estaciones.");
    return s;
}
/* ─────────────────────────── base64url ─────────────────────────── */
function aBase64Url(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = "";
    for (var i = 0; i < b.length; i++)
        s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deBase64Url(texto) {
    var limpio = texto.replace(/-/g, "+").replace(/_/g, "/");
    var relleno = limpio + "===".slice((limpio.length + 3) % 4);
    var s = atob(relleno);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++)
        out[i] = s.charCodeAt(i);
    return out;
}
/** Texto UTF-8 → base64url (para meter JSON en un enlace). */
function textoABase64Url(texto) {
    return aBase64Url(enc.encode(texto));
}
function base64UrlATexto(b64) {
    return dec.decode(deBase64Url(b64));
}
function sha256(texto) {
    return __awaiter(this, void 0, void 0, function () {
        var datos, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    datos = typeof texto === "string" ? enc.encode(texto) : texto;
                    _a = Uint8Array.bind;
                    return [4 /*yield*/, sutil().digest("SHA-256", datos)];
                case 1: return [2 /*return*/, new (_a.apply(Uint8Array, [void 0, _b.sent()]))()];
            }
        });
    });
}
function hex(bytes) {
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
/* ─────────────────────────── llaves e identidad ─────────────────────────── */
var ALG = { name: "ECDSA", namedCurve: "P-256" };
var FIRMA = { name: "ECDSA", hash: "SHA-256" };
/** Crea el par de llaves de una sesión nueva (la privada es exportable para el enlace de control). */
function crearLlaves() {
    return __awaiter(this, void 0, void 0, function () {
        var par, crudo;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sutil().generateKey(ALG, true, ["sign", "verify"])];
                case 1:
                    par = (_a.sent());
                    return [4 /*yield*/, sutil().exportKey("raw", par.publicKey)];
                case 2:
                    crudo = _a.sent();
                    return [2 /*return*/, { publica: aBase64Url(crudo), privada: par.privateKey }];
            }
        });
    });
}
/** Id de la sesión = huella SHA-256 de la llave pública (22 caracteres, 132 bits). */
function idDeLlave(publicaB64) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = aBase64Url;
                    return [4 /*yield*/, sha256(deBase64Url(publicaB64))];
                case 1: return [2 /*return*/, _a.apply(void 0, [_b.sent()]).slice(0, 22)];
            }
        });
    });
}
/** ¿Esta llave pública corresponde a este id de sesión? */
function llaveCasaConId(publicaB64, id) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, idDeLlave(publicaB64)];
                case 1: return [2 /*return*/, (_b.sent()) === id];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Exporta la llave privada (JWK en base64url) para controlar la sesión desde otro aparato. */
function exportarPrivada(privada) {
    return __awaiter(this, void 0, void 0, function () {
        var jwk;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, sutil().exportKey("jwk", privada)];
                case 1:
                    jwk = _a.sent();
                    return [2 /*return*/, textoABase64Url(JSON.stringify(jwk))];
            }
        });
    });
}
function importarPrivada(b64) {
    return __awaiter(this, void 0, void 0, function () {
        var jwk, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    jwk = JSON.parse(base64UrlATexto(b64));
                    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.d !== "string")
                        return [2 /*return*/, null];
                    return [4 /*yield*/, sutil().importKey("jwk", jwk, ALG, true, ["sign"])];
                case 1: return [2 /*return*/, _b.sent()];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Saca la llave pública (base64url) de una privada importada, para comprobar que es de la sesión. */
function publicaDePrivada(privada) {
    return __awaiter(this, void 0, void 0, function () {
        var jwk, pub, k, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, sutil().exportKey("jwk", privada)];
                case 1:
                    jwk = _c.sent();
                    pub = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true };
                    return [4 /*yield*/, sutil().importKey("jwk", pub, ALG, true, ["verify"])];
                case 2:
                    k = _c.sent();
                    _a = aBase64Url;
                    return [4 /*yield*/, sutil().exportKey("raw", k)];
                case 3: return [2 /*return*/, _a.apply(void 0, [_c.sent()])];
                case 4:
                    _b = _c.sent();
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var cachePublicas = new Map();
function llavePublica(b64) {
    var p = cachePublicas.get(b64);
    if (!p) {
        p = sutil()
            .importKey("raw", deBase64Url(b64), ALG, false, ["verify"])
            .catch(function () { return null; });
        cachePublicas.set(b64, p);
        if (cachePublicas.size > 64)
            cachePublicas.delete(cachePublicas.keys().next().value);
    }
    return p;
}
function firmar(privada, texto) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = aBase64Url;
                    return [4 /*yield*/, sutil().sign(FIRMA, privada, enc.encode(texto))];
                case 1: return [2 /*return*/, _a.apply(void 0, [_b.sent()])];
            }
        });
    });
}
function verificar(publicaB64, texto, firmaB64) {
    return __awaiter(this, void 0, void 0, function () {
        var k, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, llavePublica(publicaB64)];
                case 1:
                    k = _b.sent();
                    if (!k)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, sutil().verify(FIRMA, k, deBase64Url(firmaB64), enc.encode(texto))];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/* ─────────────────────────── estaciones privadas ─────────────────────────── */
/** Token de invitación: 128 bits aleatorios en base64url. */
function crearToken() {
    var b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    return aBase64Url(b);
}
/** Tema público del canal de una estación pública. */
function temaPublico(id) {
    return "estacion-vivo:".concat(id);
}
/** Tema de una estación privada: solo lo puede calcular quien tiene el token. */
function temaPrivado(id, token) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = "estacion-p:".concat;
                    _b = hex;
                    return [4 /*yield*/, sha256("tema:".concat(id, ":").concat(token))];
                case 1: return [2 /*return*/, _a.apply("estacion-p:", [_b.apply(void 0, [_c.sent()]).slice(0, 32)])];
            }
        });
    });
}
var cacheCifrado = new Map();
function claveCifrado(id, token) {
    var k = "".concat(id, ":").concat(token);
    var p = cacheCifrado.get(k);
    if (!p) {
        p = sha256("cifrado:".concat(id, ":").concat(token)).then(function (bruto) {
            return sutil().importKey("raw", bruto, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        });
        cacheCifrado.set(k, p);
    }
    return p;
}
/** Cifra un texto para una estación privada: base64url(iv ‖ texto cifrado). */
function cifrar(id, token, texto) {
    return __awaiter(this, void 0, void 0, function () {
        var iv, ct, _a, _b, _c, _d, out;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    iv = new Uint8Array(12);
                    globalThis.crypto.getRandomValues(iv);
                    _a = Uint8Array.bind;
                    _c = (_b = sutil()).encrypt;
                    _d = [{ name: "AES-GCM", iv: iv }];
                    return [4 /*yield*/, claveCifrado(id, token)];
                case 1: return [4 /*yield*/, _c.apply(_b, _d.concat([_e.sent(), enc.encode(texto)]))];
                case 2:
                    ct = new (_a.apply(Uint8Array, [void 0, _e.sent()]))();
                    out = new Uint8Array(iv.length + ct.length);
                    out.set(iv, 0);
                    out.set(ct, iv.length);
                    return [2 /*return*/, aBase64Url(out)];
            }
        });
    });
}
/** Descifra; null si el token no es el de la estación o el mensaje está roto. */
function descifrar(id, token, b64) {
    return __awaiter(this, void 0, void 0, function () {
        var bruto, pt, _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 3, , 4]);
                    bruto = deBase64Url(b64);
                    if (bruto.length < 13)
                        return [2 /*return*/, null];
                    _b = (_a = sutil()).decrypt;
                    _c = [{ name: "AES-GCM", iv: bruto.slice(0, 12) }];
                    return [4 /*yield*/, claveCifrado(id, token)];
                case 1: return [4 /*yield*/, _b.apply(_a, _c.concat([_e.sent(), bruto.slice(12)]))];
                case 2:
                    pt = _e.sent();
                    return [2 /*return*/, dec.decode(pt)];
                case 3:
                    _d = _e.sent();
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
