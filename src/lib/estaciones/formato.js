"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conParent = conParent;
exports.detectarFormato = detectarFormato;
exports.tipoSugerido = tipoSugerido;
var browser_1 = require("../browser/browser");
var EXT_AUDIO = ["mp3", "aac", "ogg", "opus", "flac", "wav"];
var EXT_VIDEO = ["mp4", "webm", "mov"];
function tieneExtension(ruta, exts) {
    return exts.some(function (e) { return ruta.endsWith("." + e); });
}
function extraerIdYoutube(u) {
    var host = u.hostname.toLowerCase();
    if (host === "youtu.be" || host === "www.youtu.be") {
        var id = u.pathname.slice(1).split("/")[0];
        return id || null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        var v = u.searchParams.get("v");
        if (v)
            return v;
        var m = u.pathname.match(/^\/live\/([^/?#]+)/i);
        if (m)
            return m[1];
    }
    return null;
}
/** Rellena el `parent` vacío del reproductor de Twitch al pintar. */
function conParent(url, host) {
    return url.replace(/parent=[^&]*/i, "parent=" + encodeURIComponent(host));
}
function detectarFormato(enlace, tipo) {
    var crudo = (enlace !== null && enlace !== void 0 ? enlace : "").trim();
    var soloAudio = tipo === "audio";
    var base = function (formato, reproductor, urlIncrustable, motivo) {
        return ({ formato: formato, reproductor: reproductor, urlIncrustable: urlIncrustable, soloAudio: soloAudio || formato === "audio", motivo: motivo });
    };
    if (crudo.startsWith("/") && !crudo.startsWith("//")) {
        return base("interno", "interno", null, "Destino interno del OS");
    }
    var u;
    try {
        u = new URL(crudo);
    }
    catch (_a) {
        return base("web", "pestana", null, "Enlace no válido: se abre en pestaña");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        return base("web", "pestana", null, "Enlace no válido: se abre en pestaña");
    }
    var ruta = u.pathname.toLowerCase();
    var host = u.hostname.toLowerCase();
    var busqueda = u.search.toLowerCase();
    if (tieneExtension(ruta, ["m3u8"]) || busqueda.includes("format=m3u8")) {
        return base("hls", "hls", null, "HLS (.m3u8)");
    }
    if (tieneExtension(ruta, ["mpd"])) {
        return base("dash", "pestana", null, "DASH (.mpd): se abre en pestaña");
    }
    if (tieneExtension(ruta, EXT_AUDIO) || ruta.includes("/stream") || ruta.includes("/listen")
        || u.port === "8000" || host.includes("icecast") || host.includes("shoutcast")) {
        return base("audio", "nativo-audio", null, "Audio en directo");
    }
    if (tieneExtension(ruta, EXT_VIDEO)) {
        return base("video", "nativo-video", null, "Vídeo directo");
    }
    var idYoutube = extraerIdYoutube(u);
    if (idYoutube) {
        return base("youtube", "marco", "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(idYoutube) + "?autoplay=1&mute=1", "YouTube en directo");
    }
    if (host === "twitch.tv" || host.endsWith(".twitch.tv")) {
        var canal = u.pathname.split("/").filter(Boolean)[0];
        if (canal) {
            return base("twitch", "marco", "https://player.twitch.tv/?channel=" + encodeURIComponent(canal) + "&parent=&muted=true", "Twitch en directo");
        }
    }
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
        var ev = u.pathname.match(/^\/event\/([^/?#]+)/i);
        if (ev) {
            return base("vimeo", "marco", "https://vimeo.com/event/" + encodeURIComponent(ev[1]) + "/embed", "Evento de Vimeo");
        }
        var vid = u.pathname.match(/^\/(?:video\/)?(\d+)/i);
        if (vid) {
            return base("vimeo", "marco", "https://player.vimeo.com/video/" + vid[1] + "?muted=1", "Vídeo de Vimeo");
        }
    }
    var pt = u.pathname.match(/^\/(?:videos\/watch|w)\/([^/?#]+)/i);
    if (pt) {
        return base("peertube", "marco", u.origin + "/videos/embed/" + encodeURIComponent(pt[1]), "PeerTube");
    }
    if (ruta.endsWith("/embed.html") || host.includes("owncast")) {
        return base("owncast", "marco", crudo, "Owncast");
    }
    if (host === "meet.jit.si" || ruta.includes("/jitsi")) {
        return base("jitsi", "marco", crudo, "Sala Jitsi");
    }
    if (ruta.endsWith("/whep")) {
        return base("webrtc-whep", "pestana", null, "WebRTC (WHEP): fase 2");
    }
    var incrustable = (0, browser_1.isLikelyEmbeddable)(crudo);
    if (incrustable === false) {
        return base("web", "pestana", null, "Web que no permite incrustar: se abre en pestaña");
    }
    return base("web", "marco", crudo, "Página web incrustada");
}
function tipoSugerido(f) {
    switch (f.formato) {
        case "audio": return "audio";
        case "video":
        case "hls":
        case "dash":
        case "youtube":
        case "twitch":
        case "vimeo":
        case "peertube":
        case "owncast":
        case "webrtc-whep":
            return "video";
        case "jitsi": return "evento";
        case "interno":
        case "web":
            return "app";
    }
}
