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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOssSttSupported = isOssSttSupported;
exports.loadModel = loadModel;
exports.isModelReady = isModelReady;
exports.transcribirTramo = transcribirTramo;
exports.startOssStt = startOssStt;
exports.stopOssStt = stopOssStt;
exports.isOssSttListening = isOssSttListening;
exports.pipeOssSttToAurora = pipeOssSttToAurora;
/**
 * StarSeed OS — Motor de reconocimiento de voz OPEN-SOURCE (respaldo por lotes).
 * ============================================================================
 * Respaldo para navegadores SIN reconocimiento de voz nativo (Firefox, algunos
 * WebView), donde `capabilities.ts` deja el entorno en 'text-only'. Aquí el
 * reconocimiento corre 100% en el navegador con transformers.js (Whisper ONNX)
 * sobre WebAssembly, SIN servidor y SIN enviar audio a ningún sitio.
 *
 * CÓMO FUNCIONA (honesto sobre el coste)
 * --------------------------------------
 *   1) CARGA PEREZOSA POR CDN. El paquete de transformers.js NO es dependencia
 *      del proyecto ni se importa en el arranque. Se trae por `import()` dinámico
 *      desde jsDelivr SÓLO cuando el usuario pulsa "Activar y descargar modelo".
 *      El modelo pesa (~40-250 MB la 1ª vez según tiny/base/small); luego el
 *      navegador lo cachea y corre local/offline. El progreso de descarga se
 *      reporta por fichero y agregado, con mensaje honesto.
 *   2) RECONOCIMIENTO POR LOTES + VAD ADAPTATIVO. No hay streaming nativo en
 *      Whisper web; grabamos del micrófono y con un VAD por energía (RMS) que se
 *      CALIBRA al ruido de fondo detectamos el FIN de cada frase (silencio
 *      ~800 ms). Guardamos un pre-roll para no cortar la 1ª sílaba y NO partimos
 *      frases largas (hasta 30 s). Cerrado el segmento lo transcribimos (con
 *      reintento defensivo) y emitimos el texto FINAL. `onInterim` (opcional)
 *      sólo informa de que hay voz/energía; no produce texto parcial real.
 *   3) IDIOMA. Por defecto ES (español): fijar el idioma mejora mucho la calidad
 *      frente a la autodetección. Se lee del opt-in y puede sobreescribirse por
 *      llamada con `lang`.
 *   4) DEGRADACIÓN DIGNA. Todo está guardado: si falta WebAssembly, el micrófono,
 *      o falla la CDN, devolvemos errores por callback y NUNCA lanzamos.
 *
 * PUENTE A AURORA
 * ---------------
 * No cableamos este motor dentro del engine de Aurora (sería invasivo). En su
 * lugar, `pipeOssSttToAurora()` envuelve `onResult` para enviar el texto final a
 * Aurora por el puente global `window.STARSEED_AURORA.send(text)`.
 *
 * SSR-safe, defensivo, sin dependencias nuevas (transformers.js llega por CDN en
 * runtime; por eso los import dinámicos se tipan como `any`).
 */
var opt_in_1 = require("@/lib/aurora/stt-oss/opt-in");
var medidas_voz_1 = require("@/lib/aurora/medidas-voz");
// ── CDN + configuración de bajo nivel ────────────────────────────────────────
/**
 * ESM de transformers.js servido por jsDelivr. Se trae por `import(/* webpackIgnore *​/ URL)`
 * para que el bundler NO intente resolverlo en build (no es dependencia local).
 */
var TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
/** Tasa de muestreo que espera Whisper. */
var TARGET_SAMPLE_RATE = 16000;
// VAD (detección de actividad de voz) por energía RMS — con UMBRAL ADAPTATIVO.
// -----------------------------------------------------------------------------
// El umbral fijo antiguo (0.012) fallaba en dos direcciones: en entornos ruidosos
// (ventilador, calle, cafetería) disparaba voz sin parar; en micrófonos flojos o
// habitaciones muy silenciosas se perdía el habla suave. Ahora medimos el RUIDO
// DE FONDO al arrancar (calibración) y seguimos un suelo de ruido móvil; el
// umbral de voz vive SIEMPRE por encima de ese suelo (histéresis).
/** Suelo de ruido mínimo asumido (evita umbral 0 en micrófonos perfectos). */
var VAD_NOISE_FLOOR_MIN = 0.004;
/** Suelo de ruido máximo asumido (por si el entorno es muy ruidoso). */
var VAD_NOISE_FLOOR_MAX = 0.08;
/** Cuánto por encima del suelo de ruido tiene que estar el RMS para ser "voz". */
var VAD_SPEECH_MULT = 2.4;
/** Margen absoluto extra sobre el suelo (protege micrófonos silenciosos). */
var VAD_SPEECH_MARGIN = 0.006;
/** Factor de histéresis: para SEGUIR hablando basta con superar ~60% del umbral. */
var VAD_RELEASE_RATIO = 0.6;
/** Suavizado exponencial del suelo de ruido (0..1; alto = se adapta despacio). */
var VAD_NOISE_SMOOTHING = 0.995;
/** Bloques de calibración inicial (a 4096 muestras/~85 ms cada uno ≈ 0.85 s). */
var VAD_CALIBRATION_BLOCKS = 10;
/** Silencio (ms) tras el cual cerramos un segmento y lo transcribimos. */
var VAD_SILENCE_MS = 800;
/** Duración mínima (ms) de voz para molestarnos en transcribir (evita clics). */
var VAD_MIN_SPEECH_MS = 350;
/**
 * Duración máxima (ms) de un segmento: lo cerramos aunque no haya silencio. Se
 * sube a 30 s (el `chunk_length_s` de Whisper) para NO cortar frases largas por
 * la mitad; antes 12 s partía monólogos y perdía contexto.
 */
var VAD_MAX_SEGMENT_MS = 30000;
/** Pre-roll (ms) de audio a conservar ANTES del inicio de voz (evita cortar la 1ª sílaba). */
var VAD_PREROLL_MS = 300;
/** Reintentos de transcripción de un segmento ante fallo transitorio. */
var TRANSCRIBE_RETRIES = 1;
// ── Detección de soporte (SSR-safe) ──────────────────────────────────────────
/**
 * ¿Es viable el STT open-source aquí? Requiere WebAssembly (para ONNX runtime)
 * y captura de micrófono (getUserMedia). No comprueba la CDN (eso se sabrá al
 * cargar). Nunca lanza.
 */
function isOssSttSupported() {
    if (typeof window === "undefined")
        return false;
    try {
        var hasWasm = typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
        var md = navigator === null || navigator === void 0 ? void 0 : navigator.mediaDevices;
        var hasMic = !!md && typeof md.getUserMedia === "function";
        // Audio decoding + análisis: necesitamos AudioContext (o el prefijo webkit).
        var w = window;
        var hasAudioCtx = typeof w.AudioContext !== "undefined" || typeof w.webkitAudioContext !== "undefined";
        return hasWasm && hasMic && hasAudioCtx;
    }
    catch (_a) {
        return false;
    }
}
// ── Carga PEREZOSA del pipeline (transformers.js por CDN) ─────────────────────
// Cacheamos módulo y pipeline entre llamadas (el modelo pesa; no re-descargar).
// Tipados como `any`: el paquete llega por CDN en runtime, no está en node_modules.
/* eslint-disable @typescript-eslint/no-explicit-any */
var transformersModPromise = null;
var pipelinePromise = null;
var pipelineModelId = null;
/** Importa transformers.js desde la CDN una sola vez (memoizado). */
function importTransformers() {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            if (transformersModPromise)
                return [2 /*return*/, transformersModPromise];
            transformersModPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                var mod;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0: return [4 /*yield*/, Promise.resolve("".concat(
                            /* webpackIgnore: true */ /* @vite-ignore */ TRANSFORMERS_CDN)).then(function (s) { return require(s); })];
                        case 1:
                            mod = _c.sent();
                            // Config defensiva: permitir modelos remotos del Hub, desactivar los locales.
                            try {
                                if (mod === null || mod === void 0 ? void 0 : mod.env) {
                                    mod.env.allowLocalModels = false;
                                    mod.env.allowRemoteModels = true;
                                    if ((_b = (_a = mod.env.backends) === null || _a === void 0 ? void 0 : _a.onnx) === null || _b === void 0 ? void 0 : _b.wasm) {
                                        // Deja que el runtime elija hilos según el dispositivo; no forzamos.
                                        mod.env.backends.onnx.wasm.proxy = false;
                                    }
                                }
                            }
                            catch (_d) {
                                /* si la forma del módulo difiere, seguimos: pipeline() es lo esencial */
                            }
                            return [2 /*return*/, mod];
                    }
                });
            }); })().catch(function (err) {
                // Permite reintentar en una llamada posterior si la CDN falló puntualmente.
                transformersModPromise = null;
                throw err;
            });
            return [2 /*return*/, transformersModPromise];
        });
    });
}
/**
 * loadModel — Descarga/prepara el modelo de reconocimiento (perezoso, opt-in).
 * Reporta el avance por `onProgress` (agregado, best-effort). Devuelve `true` si
 * el pipeline quedó listo; `false` si no hay soporte o algo falló. NUNCA lanza.
 *
 * Coste honesto: la 1ª vez descarga ~40-80 MB (según el modelo). Después el
 * navegador lo sirve de su caché y funciona sin conexión.
 */
function loadModel(onProgress_1) {
    return __awaiter(this, arguments, void 0, function (onProgress, modelId) {
        var emit, _a, spec, fileProgress, fileBytes, shortFile, reportAggregate, err_1, msg;
        var _this = this;
        var _b;
        if (modelId === void 0) { modelId = (0, opt_in_1.getOssSttModel)(); }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    emit = function (p) {
                        try {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(p);
                        }
                        catch (_a) {
                            /* la UI puede fallar; el motor no */
                        }
                    };
                    if (!isOssSttSupported()) {
                        emit({
                            status: "unsupported",
                            progress: 0,
                            message: "Este navegador no reúne los requisitos (WebAssembly / micrófono).",
                        });
                        return [2 /*return*/, false];
                    }
                    if (!(pipelinePromise && pipelineModelId === modelId)) return [3 /*break*/, 4];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, pipelinePromise];
                case 2:
                    _c.sent();
                    emit({ status: "ready", progress: 100, message: "Modelo listo (ya descargado)." });
                    return [2 /*return*/, true];
                case 3:
                    _a = _c.sent();
                    pipelinePromise = null;
                    pipelineModelId = null;
                    return [3 /*break*/, 4];
                case 4:
                    spec = (_b = opt_in_1.OSS_STT_MODELS[modelId]) !== null && _b !== void 0 ? _b : opt_in_1.OSS_STT_MODELS.tiny;
                    emit({ status: "loading", progress: 1, message: "Preparando ".concat(spec.label, "\u2026") });
                    fileProgress = new Map();
                    fileBytes = new Map();
                    shortFile = function (file) {
                        if (!file)
                            return undefined;
                        var parts = file.split("/");
                        return parts[parts.length - 1] || file;
                    };
                    reportAggregate = function (file) {
                        // Preferimos el % ponderado por bytes si tenemos totales fiables.
                        var loaded = 0;
                        var total = 0;
                        fileBytes.forEach(function (b) {
                            if (b.total > 0) {
                                loaded += b.loaded;
                                total += b.total;
                            }
                        });
                        var pct;
                        if (total > 0) {
                            pct = Math.min(99, Math.round((loaded / total) * 100));
                        }
                        else {
                            // Fallback: media simple de los porcentajes por fichero.
                            var sum_1 = 0;
                            var n_1 = 0;
                            fileProgress.forEach(function (v) {
                                sum_1 += v;
                                n_1 += 1;
                            });
                            pct = n_1 > 0 ? Math.min(99, Math.round(sum_1 / n_1)) : 1;
                        }
                        var shown = shortFile(file);
                        emit({
                            status: "loading",
                            progress: pct,
                            file: shown,
                            message: shown
                                ? "Descargando ".concat(spec.label, " (").concat(spec.approxSize, ") \u00B7 ").concat(shown, " \u2014 ").concat(pct, "%")
                                : "Descargando ".concat(spec.label, " (").concat(spec.approxSize, ") \u2014 ").concat(pct, "%"),
                        });
                    };
                    pipelineModelId = modelId;
                    pipelinePromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                        var mod, progressCallback, asr;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, importTransformers()];
                                case 1:
                                    mod = _a.sent();
                                    if (typeof (mod === null || mod === void 0 ? void 0 : mod.pipeline) !== "function") {
                                        throw new Error("El módulo de transformers.js no expone pipeline().");
                                    }
                                    emit({ status: "loading", progress: 2, message: "Conectando con el Hub para ".concat(spec.label, "\u2026") });
                                    progressCallback = function (data) {
                                        try {
                                            var file = data === null || data === void 0 ? void 0 : data.file;
                                            // status: 'initiate' | 'download' | 'progress' | 'done' | 'ready'
                                            if ((data === null || data === void 0 ? void 0 : data.status) === "progress" && file) {
                                                var p = typeof data.progress === "number" ? data.progress : 0;
                                                fileProgress.set(file, p);
                                                // Bytes, si los reporta (para un % agregado ponderado más honesto).
                                                var loaded = typeof data.loaded === "number" ? data.loaded : undefined;
                                                var totalB = typeof data.total === "number" ? data.total : undefined;
                                                if (typeof loaded === "number" && typeof totalB === "number" && totalB > 0) {
                                                    fileBytes.set(file, { loaded: loaded, total: totalB });
                                                }
                                                reportAggregate(file);
                                            }
                                            else if ((data === null || data === void 0 ? void 0 : data.status) === "done" && file) {
                                                fileProgress.set(file, 100);
                                                var prev = fileBytes.get(file);
                                                if (prev && prev.total > 0)
                                                    fileBytes.set(file, { loaded: prev.total, total: prev.total });
                                                reportAggregate(file);
                                            }
                                        }
                                        catch (_a) {
                                            /* callback informativo: nunca rompe la carga */
                                        }
                                    };
                                    return [4 /*yield*/, mod.pipeline("automatic-speech-recognition", spec.repo, {
                                            progress_callback: progressCallback,
                                        })];
                                case 2:
                                    asr = _a.sent();
                                    return [2 /*return*/, asr];
                            }
                        });
                    }); })().catch(function (err) {
                        // Deja re-intentar; propaga para el emit de error de abajo.
                        pipelinePromise = null;
                        pipelineModelId = null;
                        throw err;
                    });
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, pipelinePromise];
                case 6:
                    _c.sent();
                    emit({ status: "ready", progress: 100, message: "Modelo listo. Funciona sin conexión." });
                    return [2 /*return*/, true];
                case 7:
                    err_1 = _c.sent();
                    msg = (err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || "No se pudo cargar el modelo.";
                    emit({
                        status: "error",
                        progress: 0,
                        message: "Error al cargar el modelo: ".concat(msg),
                    });
                    return [2 /*return*/, false];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/** ¿Hay un pipeline ya cargado y listo (para el modelo indicado o cualquiera)? */
function isModelReady(modelId) {
    if (!pipelinePromise)
        return false;
    if (modelId && pipelineModelId !== modelId)
        return false;
    return true;
}
/**
 * transcribirTramo — Transcribe un tramo de audio PCM (Float32 mono, a `rate` Hz)
 * reutilizando el MISMO pipeline que usa la sesión por segmentos.
 * - Si el modelo no está cargado (`isModelReady()` = false) devuelve null SIN cargar nada.
 * - Remuestra a 16 kHz si hace falta (como `transcribeSegment` interno).
 * - Nunca lanza: devuelve null en cualquier error.
 */
function transcribirTramo(pcm, rate, idioma) {
    return __awaiter(this, void 0, void 0, function () {
        var modelId, asr, audio, effectiveLang, out, raw, text, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    modelId = (0, opt_in_1.getOssSttModel)();
                    if (!isModelReady(modelId))
                        return [2 /*return*/, null];
                    return [4 /*yield*/, pipelinePromise.catch(function () { return null; })];
                case 1: return [4 /*yield*/, (_b.sent())];
                case 2:
                    asr = _b.sent();
                    if (!asr)
                        return [2 /*return*/, null];
                    audio = pcm;
                    if (rate !== TARGET_SAMPLE_RATE) {
                        try {
                            audio = resampleLinear(pcm, rate, TARGET_SAMPLE_RATE);
                        }
                        catch (_c) {
                            audio = pcm;
                        }
                    }
                    effectiveLang = idioma || (0, opt_in_1.getOssSttLangCode)();
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, asr(audio, {
                            language: effectiveLang || undefined,
                            task: "transcribe",
                            chunk_length_s: 30,
                            stride_length_s: 5,
                            do_sample: false,
                        })];
                case 4:
                    out = _b.sent();
                    raw = typeof (out === null || out === void 0 ? void 0 : out.text) === "string" ? out.text : "";
                    text = raw.trim();
                    text = text.replace(/^\s*[\[(][^\])]*[\])]\s*/g, "").trim();
                    return [2 /*return*/, text || null];
                case 5:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ── Captura + VAD + transcripción por segmentos ──────────────────────────────
// Estado de la sesión de captura activa (una a la vez; simple y suficiente).
var activeSession = null;
/**
 * startOssStt — Arranca la captura del micrófono y transcribe por segmentos.
 * Devuelve una sesión con `stop()`. Si el modelo aún no está cargado, intenta
 * cargarlo primero (perezoso). NUNCA lanza: los fallos van por `onError`.
 */
function startOssStt(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var noop, fail, modelId, ok, stream, err_2, name_1, denied, Ctx, audioCtx, inputRate, source, BUFFER, processor, stopped, speaking, speechStartAt, lastVoiceAt, segmentChunks, segmentLength, interimNotifiedAt, noiseFloor, calibrationBlocks, calibrationSum, prerollMaxBlocks, preroll, speechThreshold, resetSegment, effectiveLang, HALLUCINATION_RE, cleanTranscript, transcribeSegment, flushIfSpeech, sink, session;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    noop = { stop: function () { }, isActive: function () { return false; } };
                    fail = function (message) {
                        var _a;
                        try {
                            (_a = opts.onError) === null || _a === void 0 ? void 0 : _a.call(opts, message);
                        }
                        catch (_b) {
                            /* */
                        }
                        return noop;
                    };
                    if (!isOssSttSupported()) {
                        return [2 /*return*/, fail("Reconocimiento open-source no soportado en este navegador.")];
                    }
                    // Si ya había una sesión, la cerramos (sólo una captura a la vez).
                    try {
                        activeSession === null || activeSession === void 0 ? void 0 : activeSession.stop();
                    }
                    catch (_b) {
                        /* */
                    }
                    modelId = (0, opt_in_1.getOssSttModel)();
                    if (!!isModelReady(modelId)) return [3 /*break*/, 2];
                    return [4 /*yield*/, loadModel(undefined, modelId)];
                case 1:
                    ok = _a.sent();
                    if (!ok)
                        return [2 /*return*/, fail("El modelo no está listo. Descárgalo primero desde Ajustes.")];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, navigator.mediaDevices.getUserMedia({
                            audio: {
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true,
                            },
                        })];
                case 3:
                    stream = _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _a.sent();
                    name_1 = (err_2 === null || err_2 === void 0 ? void 0 : err_2.name) || "";
                    denied = name_1 === "NotAllowedError" || name_1 === "SecurityError" || name_1 === "PermissionDeniedError";
                    return [2 /*return*/, fail(denied
                            ? "Sin permiso de micrófono. Concédelo para escuchar."
                            : "No se pudo abrir el micrófono.")];
                case 5:
                    Ctx = window
                        .AudioContext ||
                        window.webkitAudioContext;
                    if (!Ctx) {
                        try {
                            stream.getTracks().forEach(function (t) { return t.stop(); });
                        }
                        catch (_c) {
                            /* */
                        }
                        return [2 /*return*/, fail("Este navegador no expone AudioContext.")];
                    }
                    audioCtx = new Ctx();
                    inputRate = audioCtx.sampleRate || 48000;
                    source = audioCtx.createMediaStreamSource(stream);
                    BUFFER = 4096;
                    processor = audioCtx.createScriptProcessor
                        ? audioCtx.createScriptProcessor(BUFFER, 1, 1)
                        : null;
                    if (!processor) {
                        try {
                            source.disconnect();
                            stream.getTracks().forEach(function (t) { return t.stop(); });
                            void audioCtx.close();
                        }
                        catch (_d) {
                            /* */
                        }
                        return [2 /*return*/, fail("Este navegador no permite el análisis de audio necesario.")];
                    }
                    stopped = false;
                    speaking = false;
                    speechStartAt = 0;
                    lastVoiceAt = 0;
                    segmentChunks = [];
                    segmentLength = 0;
                    interimNotifiedAt = 0;
                    noiseFloor = VAD_NOISE_FLOOR_MIN;
                    calibrationBlocks = 0;
                    calibrationSum = 0;
                    prerollMaxBlocks = Math.max(1, Math.ceil((VAD_PREROLL_MS / 1000) * inputRate / BUFFER));
                    preroll = [];
                    speechThreshold = function () {
                        return Math.min(VAD_NOISE_FLOOR_MAX * VAD_SPEECH_MULT, noiseFloor * VAD_SPEECH_MULT + VAD_SPEECH_MARGIN);
                    };
                    resetSegment = function () {
                        segmentChunks = [];
                        segmentLength = 0;
                        speaking = false;
                        speechStartAt = 0;
                    };
                    effectiveLang = opts.lang || (0, opt_in_1.getOssSttLangCode)();
                    HALLUCINATION_RE = /^(?:\s*[\[(][^\])]*[\])]\s*|gracias(?: por ver(?:me)?)?\.?|subt[íi]tulos[^.]*\.?|thanks for watching\.?|you\.?|\.|\s)+$/i;
                    cleanTranscript = function (raw) {
                        var t = raw.trim();
                        // Quita etiquetas entre corchetes/paréntesis al inicio (p. ej. "[Música]").
                        t = t.replace(/^\s*[\[(][^\])]*[\])]\s*/g, "").trim();
                        return t;
                    };
                    transcribeSegment = function (pcm, oido) { return __awaiter(_this, void 0, void 0, function () {
                        var asr, _a, audio, lastErr, attempt, out, raw, text, err_3;
                        var _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!pipelinePromise) return [3 /*break*/, 2];
                                    return [4 /*yield*/, pipelinePromise.catch(function () { return null; })];
                                case 1:
                                    _a = _c.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    _a = null;
                                    _c.label = 3;
                                case 3:
                                    asr = _a;
                                    if (!asr)
                                        return [2 /*return*/];
                                    audio = pcm;
                                    if (inputRate !== TARGET_SAMPLE_RATE) {
                                        try {
                                            audio = resampleLinear(pcm, inputRate, TARGET_SAMPLE_RATE);
                                        }
                                        catch (_d) {
                                            audio = pcm; // si el remuestreo falla, probamos con el original
                                        }
                                    }
                                    lastErr = null;
                                    attempt = 0;
                                    _c.label = 4;
                                case 4:
                                    if (!(attempt <= TRANSCRIBE_RETRIES)) return [3 /*break*/, 11];
                                    if (stopped)
                                        return [2 /*return*/];
                                    _c.label = 5;
                                case 5:
                                    _c.trys.push([5, 7, , 10]);
                                    return [4 /*yield*/, asr(audio, {
                                            language: effectiveLang || undefined,
                                            task: "transcribe",
                                            chunk_length_s: 30,
                                            stride_length_s: 5,
                                            // Sin muestreo aleatorio: salidas estables/repetibles.
                                            do_sample: false,
                                        })];
                                case 6:
                                    out = _c.sent();
                                    raw = typeof (out === null || out === void 0 ? void 0 : out.text) === "string" ? out.text : "";
                                    text = cleanTranscript(raw);
                                    if (text && !HALLUCINATION_RE.test(raw) && !stopped) {
                                        oido === null || oido === void 0 ? void 0 : oido.final(); // (VOZ1024A) retraso del oído: de la última voz del tramo al texto
                                        try {
                                            opts.onResult(text);
                                        }
                                        catch (_e) {
                                            /* la UI/consumidor puede fallar; el motor no */
                                        }
                                    }
                                    return [2 /*return*/]; // éxito (aunque el texto quedara vacío tras limpiar)
                                case 7:
                                    err_3 = _c.sent();
                                    lastErr = err_3;
                                    if (!(attempt < TRANSCRIBE_RETRIES)) return [3 /*break*/, 9];
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 120); })];
                                case 8:
                                    _c.sent();
                                    _c.label = 9;
                                case 9: return [3 /*break*/, 10];
                                case 10:
                                    attempt++;
                                    return [3 /*break*/, 4];
                                case 11:
                                    // Agotados los reintentos: segmento no decodificable → seguimos escuchando.
                                    void lastErr;
                                    try {
                                        (_b = opts.onError) === null || _b === void 0 ? void 0 : _b.call(opts, "No se pudo transcribir un fragmento; sigo escuchando.");
                                    }
                                    catch (_f) {
                                        /* */
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    flushIfSpeech = function () {
                        if (segmentLength === 0)
                            return;
                        var durMs = (segmentLength / inputRate) * 1000;
                        if (durMs < VAD_MIN_SPEECH_MS) {
                            resetSegment();
                            return;
                        }
                        // Concatena los chunks en un único Float32Array.
                        var merged = new Float32Array(segmentLength);
                        var offset = 0;
                        for (var _i = 0, segmentChunks_1 = segmentChunks; _i < segmentChunks_1.length; _i++) {
                            var c = segmentChunks_1[_i];
                            merged.set(c, offset);
                            offset += c.length;
                        }
                        resetSegment();
                        // (VOZ1024A) Whisper en el navegador, por tramos: la última voz se oyó hace esto.
                        var oido = (0, medidas_voz_1.cronometroOido)({ motor: "whisper-web", idioma: effectiveLang || undefined, flujo: false });
                        oido.oyendo(Math.max(0, performance.now() - lastVoiceAt));
                        // Transcribe sin bloquear el hilo de audio (fire-and-forget defensivo).
                        void transcribeSegment(merged, oido);
                    };
                    processor.onaudioprocess = function (ev) {
                        if (stopped)
                            return;
                        var input;
                        try {
                            input = ev.inputBuffer.getChannelData(0);
                        }
                        catch (_a) {
                            return;
                        }
                        // RMS del bloque para el VAD.
                        var sumSq = 0;
                        for (var i = 0; i < input.length; i++) {
                            var s = input[i];
                            sumSq += s * s;
                        }
                        var rms = Math.sqrt(sumSq / (input.length || 1));
                        var now = performance.now();
                        // ── Calibración inicial del suelo de ruido (primeros ~0.85 s) ────────────
                        if (calibrationBlocks < VAD_CALIBRATION_BLOCKS) {
                            calibrationBlocks += 1;
                            calibrationSum += rms;
                            if (calibrationBlocks === VAD_CALIBRATION_BLOCKS) {
                                var avg = calibrationSum / VAD_CALIBRATION_BLOCKS;
                                noiseFloor = Math.min(VAD_NOISE_FLOOR_MAX, Math.max(VAD_NOISE_FLOOR_MIN, avg));
                            }
                            // Durante la calibración guardamos pre-roll pero no detectamos voz aún.
                            preroll.push(new Float32Array(input));
                            if (preroll.length > prerollMaxBlocks)
                                preroll.shift();
                            return;
                        }
                        var startTh = speechThreshold();
                        // Para SEGUIR hablando basta un umbral menor (histéresis anti-parpadeo).
                        var continueTh = startTh * VAD_RELEASE_RATIO;
                        var isVoice = speaking ? rms >= continueTh : rms >= startTh;
                        if (isVoice) {
                            // Hay voz.
                            if (!speaking) {
                                speaking = true;
                                speechStartAt = now;
                                // Prepend del PRE-ROLL para no perder la primera sílaba.
                                for (var _i = 0, preroll_1 = preroll; _i < preroll_1.length; _i++) {
                                    var b = preroll_1[_i];
                                    segmentChunks.push(b);
                                    segmentLength += b.length;
                                }
                                preroll = [];
                            }
                            lastVoiceAt = now;
                            // Copiamos el bloque (el buffer se reutiliza) y lo acumulamos.
                            segmentChunks.push(new Float32Array(input));
                            segmentLength += input.length;
                            // Señal de "te oigo" (throttled) — no es texto real.
                            if (opts.onInterim && now - interimNotifiedAt > 400) {
                                interimNotifiedAt = now;
                                try {
                                    opts.onInterim("…");
                                }
                                catch (_b) {
                                    /* */
                                }
                            }
                            // Corte por segmento demasiado largo (evita OOM en monólogos infinitos).
                            if (now - speechStartAt >= VAD_MAX_SEGMENT_MS) {
                                flushIfSpeech();
                            }
                        }
                        else if (speaking) {
                            // Silencio tras voz: seguimos acumulando un poco (cola de la frase)…
                            segmentChunks.push(new Float32Array(input));
                            segmentLength += input.length;
                            // …y si el silencio persiste, cerramos el segmento.
                            if (now - lastVoiceAt >= VAD_SILENCE_MS) {
                                flushIfSpeech();
                            }
                        }
                        else {
                            // Silencio real: adaptamos MUY lentamente el suelo de ruido (sólo baja o
                            // sube poco a poco) y mantenemos el ring de pre-roll al día.
                            noiseFloor =
                                VAD_NOISE_SMOOTHING * noiseFloor + (1 - VAD_NOISE_SMOOTHING) * rms;
                            if (noiseFloor < VAD_NOISE_FLOOR_MIN)
                                noiseFloor = VAD_NOISE_FLOOR_MIN;
                            if (noiseFloor > VAD_NOISE_FLOOR_MAX)
                                noiseFloor = VAD_NOISE_FLOOR_MAX;
                            preroll.push(new Float32Array(input));
                            if (preroll.length > prerollMaxBlocks)
                                preroll.shift();
                        }
                    };
                    try {
                        source.connect(processor);
                        sink = audioCtx.createGain();
                        sink.gain.value = 0;
                        processor.connect(sink);
                        sink.connect(audioCtx.destination);
                    }
                    catch (_e) {
                        // Aun sin conectar al destino, en algunos navegadores procesa; seguimos.
                    }
                    session = {
                        isActive: function () { return !stopped; },
                        stop: function () {
                            if (stopped)
                                return;
                            stopped = true;
                            try {
                                processor.onaudioprocess = null;
                                processor.disconnect();
                            }
                            catch (_a) {
                                /* */
                            }
                            try {
                                source.disconnect();
                            }
                            catch (_b) {
                                /* */
                            }
                            try {
                                stream.getTracks().forEach(function (t) { return t.stop(); });
                            }
                            catch (_c) {
                                /* */
                            }
                            try {
                                void audioCtx.close();
                            }
                            catch (_d) {
                                /* */
                            }
                            if (activeSession === session)
                                activeSession = null;
                        },
                    };
                    activeSession = session;
                    return [2 /*return*/, session];
            }
        });
    });
}
/** Detiene la sesión de captura activa (si la hay). Idempotente / SSR-safe. */
function stopOssStt() {
    try {
        activeSession === null || activeSession === void 0 ? void 0 : activeSession.stop();
    }
    catch (_a) {
        /* */
    }
    activeSession = null;
}
/** ¿Hay una sesión de captura open-source activa ahora mismo? */
function isOssSttListening() {
    return !!activeSession && activeSession.isActive();
}
// ── Puente a Aurora (no invasivo) ─────────────────────────────────────────────
/**
 * pipeOssSttToAurora — Arranca el STT open-source y envía cada texto FINAL a
 * Aurora por el puente global `window.STARSEED_AURORA.send(text)`. Así el
 * fallback alimenta a Aurora SIN tocar su motor.
 *
 * Devuelve la misma `OssSttSession` (con `stop()`). Si el puente no está listo,
 * el texto se ignora en silencio (no rompe). Se puede componer con un `onResult`
 * propio del llamante (p. ej. para reflejar el texto en la UI del panel).
 */
function pipeOssSttToAurora() {
    return __awaiter(this, arguments, void 0, function (opts) {
        var onResult, rest;
        if (opts === void 0) { opts = {}; }
        return __generator(this, function (_a) {
            onResult = opts.onResult, rest = __rest(opts, ["onResult"]);
            return [2 /*return*/, startOssStt(__assign(__assign({}, rest), { onResult: function (text) {
                        // 1) Enviar a Aurora por el puente global (defensivo).
                        try {
                            var api = window.STARSEED_AURORA;
                            if (api && typeof api.send === "function") {
                                void api.send(text);
                            }
                        }
                        catch (_a) {
                            /* si Aurora no está montada, no rompemos: el fallback sigue */
                        }
                        // 2) Reflejo opcional para el llamante.
                        try {
                            onResult === null || onResult === void 0 ? void 0 : onResult(text);
                        }
                        catch (_b) {
                            /* */
                        }
                    } }))];
        });
    });
}
// ── Utilidades internas ───────────────────────────────────────────────────────
/**
 * Remuestreo lineal simple de Float32 mono de `fromRate` a `toRate`. Suficiente
 * para VAD/transcripción; evita traer una dependencia de resampling. Defensivo.
 */
function resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate || input.length === 0)
        return input;
    var ratio = fromRate / toRate;
    var outLength = Math.max(1, Math.floor(input.length / ratio));
    var output = new Float32Array(outLength);
    for (var i = 0; i < outLength; i++) {
        var pos = i * ratio;
        var i0 = Math.floor(pos);
        var i1 = Math.min(i0 + 1, input.length - 1);
        var frac = pos - i0;
        output[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return output;
}
