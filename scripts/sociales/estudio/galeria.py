"""galeria.py — `galeria.html` autocontenida de una campaña del Estudio MetaGeminis.

Una sola página sin dependencias: tipografías incrustadas (OFL), rutas relativas a las piezas, vídeo mudo en bucle que solo
se reproduce cuando se ve, filtros por idioma y medio, y el peso, formato, duración y verificación de cada pieza.
Se abre con doble clic (file://) o desde cualquier servidor estático. Todo aparece como «para aprobar»: no publica nada.
"""
from __future__ import annotations

import base64
import html
from pathlib import Path

AQUI = Path(__file__).resolve().parent

NOMBRE_MEDIO = {
    "instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube", "x_twitter": "X", "linkedin": "LinkedIn", "facebook": "Facebook",
    "bluesky": "Bluesky", "mastodon": "Mastodon", "telegram": "Telegram", "whatsapp": "WhatsApp", "pinterest": "Pinterest", "reddit": "Reddit",
    "threads": "Threads", "discord": "Discord", "twitch": "Twitch", "banner_iab": "Banners (IAB)", "web": "Web y enlaces", "correo": "Correo",
    "cartel_impreso": "Cartel impreso", "pantalla_dooh": "Pantallas", "estaciones": "Estaciones",
}
ORDEN = ["instagram", "tiktok", "youtube", "x_twitter", "linkedin", "bluesky", "mastodon", "facebook", "telegram", "whatsapp", "web", "banner_iab", "correo", "cartel_impreso"]
NOMBRE_TIPO = {"imagen": "Imagen", "video": "Vídeo", "animacion3d": "Animación 3D", "anuncio": "Anuncio", "cartel": "Cartel", "carrusel": "Carrusel"}


def _fuente(nombre: str) -> str:
    return base64.b64encode((AQUI / "fuentes" / nombre).read_bytes()).decode()


def _peso(b: int) -> str:
    return f"{b / 1e6:.1f} MB" if b >= 1e6 else f"{b / 1000:.0f} KB"


def _pastillas(e: dict) -> str:
    v = e.get("verificacion") or {}
    out = []
    if v.get("contraste_min") is not None:
        ok = not v.get("contraste_fallos")
        out.append(f'<span class="p {"ok" if ok else "mal"}" title="Contraste mínimo del texto (WCAG AA ≥ 4,5 o ≥ 3 si es grande)">AA {v["contraste_min"]}:1</span>')
    if v.get("zona_segura_ok") is not None:
        out.append(f'<span class="p {"ok" if v["zona_segura_ok"] else "mal"}" title="Ningún texto fuera de la zona segura ni bajo la interfaz de la plataforma">zona segura</span>')
    if v.get("sonoridad_lufs") is not None:
        out.append(f'<span class="p ok" title="Sonoridad integrada medida">{v["sonoridad_lufs"]} LUFS</span>')
    if v.get("destellos_por_segundo") is not None:
        out.append(f'<span class="p {"ok" if v["destellos_por_segundo"] <= 3 else "mal"}" title="Destellos por segundo (máx. 3, WCAG 2.3.1)">{v["destellos_por_segundo"]} destellos/s</span>')
    if v.get("qr") is not None:
        out.append(f'<span class="p {"ok" if v["qr"] else "mal"}" title="El QR se decodifica y lleva la dirección esperada">QR {"ok" if v["qr"] else "falla"}</span>')
    return "".join(out)


def _medio_html(e: dict, ruta: str, ancho: int, alto: int) -> str:
    cont = e["contenedor"]
    a = html.escape(f"{e['titulo']} ({e['tabla']['medio']}, {e['idioma']})")
    if cont in ("mp4", "webm"):
        return f'<video class="v" data-src="{html.escape(ruta)}" muted loop playsinline preload="none" width="{ancho}" height="{alto}" aria-label="{a}"></video>'
    if cont == "pdf":
        return f'<a class="pdf" href="{html.escape(ruta)}" aria-label="{a}"><span>PDF</span><small>{ancho}×{alto}</small></a>'
    return f'<img loading="lazy" src="{html.escape(ruta)}" width="{ancho}" height="{alto}" alt="{a}">'


def _tarjeta(e: dict, tambien: list[dict]) -> str:
    t = e["tabla"]
    ruta = t["ruta"]
    extra = ""
    if tambien:
        nombres = ", ".join(sorted({f"{NOMBRE_MEDIO.get(x['tabla']['medio'], x['tabla']['medio'])} ({x['formato_catalogo']})" for x in tambien}))
        extra = f'<p class="tb">El mismo archivo vale para: {html.escape(nombres)}</p>'
    dur = f" · {e['duracion']:g} s" if e.get("duracion") else ""
    return (
        f'<article class="c" data-idioma="{e["idioma"]}" data-medio="{t["medio"]}" data-tipo="{t["tipo"]}">'
        f'<div class="m" style="aspect-ratio:{e["ancho"]}/{e["alto"]}">{_medio_html(e, ruta, e["ancho"], e["alto"])}</div>'
        f'<div class="i"><h3>{html.escape(e["titulo"])} <b class="l">{e["idioma"].upper()}</b></h3>'
        f'<p class="d">{html.escape(e["formato_catalogo"])} · {e["ancho"]}×{e["alto"]}{dur} · {e["contenedor"].upper()} · {_peso(e["bytes"])}</p>'
        f'<div class="ps">{_pastillas(e)}</div>{extra}'
        f'<p class="h"><a href="{html.escape(ruta)}" download>Descargar</a> <code title="sha256">{t["sha256"][:10]}</code> <span class="est">{html.escape(t["estado"].replace("_", " "))}</span></p></div></article>'
    )


def generar(salida: Path, campana: dict, mf: dict) -> Path:
    por_ruta: dict[str, list[dict]] = {}
    for e in mf["piezas"]:
        por_ruta.setdefault(e["tabla"]["ruta"], []).append(e)
    # una tarjeta por archivo; los demás formatos que lo reutilizan van como nota
    principales = []
    for ruta, filas in por_ruta.items():
        principal = next((f for f in filas if not f.get("compartida")), filas[0])
        principales.append((principal, [f for f in filas if f is not principal]))
    medios = sorted({p[0]["tabla"]["medio"] for p in principales}, key=lambda m: ORDEN.index(m) if m in ORDEN else 99)
    secciones = []
    for m in medios:
        tarjetas = [p for p in principales if p[0]["tabla"]["medio"] == m]
        tarjetas.sort(key=lambda p: (p[0]["pieza"], p[0]["idioma"], p[0].get("lamina") or 0, p[0]["formato_catalogo"]))
        secciones.append(f'<section data-medio="{m}"><h2>{html.escape(NOMBRE_MEDIO.get(m, m))} <small>{len(tarjetas)}</small></h2><div class="g">' + "".join(_tarjeta(e, t) for e, t in tarjetas) + "</div></section>")
    tot = mf["totales"]
    chips_medio = "".join(f'<button class="ch" data-f="medio" data-v="{m}">{html.escape(NOMBRE_MEDIO.get(m, m))}</button>' for m in medios)
    idiomas = sorted({p[0]["idioma"] for p in principales})
    chips_idioma = "".join(f'<button class="ch" data-f="idioma" data-v="{i}">{i.upper()}</button>' for i in idiomas)
    css_fuentes = (
        f"@font-face{{font-family:'Rajdhani';font-weight:700;src:url(data:font/woff2;base64,{_fuente('Rajdhani-700.woff2')}) format('woff2')}}"
        f"@font-face{{font-family:'Inter';font-weight:400 700;src:url(data:font/woff2;base64,{_fuente('Inter-400-700.woff2')}) format('woff2')}}"
        f"@font-face{{font-family:'JetBrains Mono';font-weight:500;src:url(data:font/woff2;base64,{_fuente('JetBrainsMono-500.woff2')}) format('woff2')}}"
    )
    doc = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(campana['nombre'])} · piezas</title>
<meta name="description" content="Piezas de la campaña {html.escape(campana['nombre'])} para aprobar. No se ha publicado nada.">
<style>{css_fuentes}
:root{{--fondo:#050b18;--panel:#0b1630;--borde:rgba(248,249,250,.14);--texto:#e9eef7;--suave:#aab6cc;--zenith:#5AA9FF;--horizonte:#10B981;--logica:#FFBF00;--anchor:#FF6B86;--ok:#34d399;--mal:#ff6b86}}
@media (prefers-color-scheme:light){{:root:not([data-tema=oscuro]){{--fondo:#f4f6fb;--panel:#fff;--borde:rgba(5,11,24,.16);--texto:#0b1630;--suave:#4a566e;--zenith:#0a5fd0;--horizonte:#0b7a56;--logica:#8a5a00;--anchor:#b3123b;--ok:#0b7a56;--mal:#b3123b}}}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}
body{{margin:0;background:radial-gradient(1200px 600px at 12% -10%,rgba(0,127,255,.16),transparent 60%),radial-gradient(900px 500px at 100% 0,rgba(16,185,129,.10),transparent 55%),var(--fondo);color:var(--texto);font:400 16px/1.5 Inter,system-ui,sans-serif}}
header,main{{max-width:1320px;margin:0 auto;padding:0 16px}}
header{{padding-top:40px}}
h1{{font:700 clamp(32px,5vw,56px)/1 Rajdhani,Inter,sans-serif;letter-spacing:.01em;margin:0 0 8px}}
h1 em{{font-style:normal;color:var(--horizonte)}}
.sub{{color:var(--suave);max-width:70ch;margin:0 0 20px}}
.aviso{{display:inline-block;border:1px solid var(--borde);background:var(--panel);border-radius:999px;padding:6px 14px;font:500 13px 'JetBrains Mono',monospace;color:var(--logica)}}
.cifras{{display:flex;flex-wrap:wrap;gap:8px 24px;margin:20px 0;font:500 13px 'JetBrains Mono',monospace;color:var(--suave)}}
.cifras b{{color:var(--texto);font-weight:500}}
.filtros{{position:sticky;top:0;z-index:5;background:linear-gradient(var(--fondo) 70%,transparent);padding:12px 0 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
.filtros span{{font:500 12px 'JetBrains Mono',monospace;color:var(--suave);margin-right:2px}}
.ch{{cursor:pointer;border:1px solid var(--borde);background:var(--panel);color:var(--texto);border-radius:999px;padding:6px 14px;font:500 14px Inter,sans-serif}}
.ch[aria-pressed=true]{{background:var(--zenith);border-color:var(--zenith);color:#04101f}}
.ch:focus-visible,a:focus-visible{{outline:3px solid var(--logica);outline-offset:2px}}
section{{margin:36px 0}}
h2{{font:700 30px/1.1 Rajdhani,Inter,sans-serif;margin:0 0 14px;border-left:6px solid var(--zenith);padding-left:12px}}
h2 small{{font:500 13px 'JetBrains Mono',monospace;color:var(--suave);margin-left:8px}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;align-items:start}}
.c{{background:var(--panel);border:1px solid var(--borde);border-radius:18px;overflow:hidden;display:flex;flex-direction:column}}
.m{{background:#02060f;display:flex;align-items:center;justify-content:center;max-height:560px;overflow:hidden}}
.m img,.m video{{width:100%;height:100%;object-fit:contain;display:block}}
.pdf{{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;min-height:200px;color:var(--texto);text-decoration:none;font:700 44px Rajdhani,sans-serif}}
.pdf small{{font:500 13px 'JetBrains Mono',monospace;color:var(--suave)}}
.i{{padding:12px 14px 14px}}
h3{{margin:0;font:700 20px/1.15 Rajdhani,Inter,sans-serif}}
.l{{font:500 11px 'JetBrains Mono',monospace;border:1px solid var(--borde);border-radius:6px;padding:1px 6px;color:var(--suave);vertical-align:middle;margin-left:4px}}
.d{{margin:4px 0 8px;font:500 12px 'JetBrains Mono',monospace;color:var(--suave)}}
.ps{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}}
.p{{font:500 11px 'JetBrains Mono',monospace;border-radius:999px;padding:2px 9px;border:1px solid currentColor}}
.p.ok{{color:var(--ok)}}.p.mal{{color:var(--mal)}}
.tb{{margin:0 0 8px;font-size:12px;color:var(--suave)}}
.h{{margin:0;display:flex;gap:10px;align-items:center;font-size:13px;flex-wrap:wrap}}
.h a{{color:var(--zenith);font-weight:600}}
code{{font:500 11px 'JetBrains Mono',monospace;color:var(--suave)}}
.est{{margin-left:auto;font:500 11px 'JetBrains Mono',monospace;color:var(--logica)}}
footer{{max-width:1320px;margin:48px auto 60px;padding:0 16px;color:var(--suave);font-size:13px}}
.oculto{{display:none!important}}
@media (prefers-reduced-motion:reduce){{html{{scroll-behavior:auto}}}}
</style></head><body>
<header>
<h1>{html.escape(campana['nombre'].split('·')[0].strip()).replace('StarSeed','<em>StarSeed</em>')}</h1>
<p class="sub">{html.escape(campana.get('descripcion', ''))}</p>
<p><span class="aviso">PARA APROBAR · no se ha publicado nada</span></p>
<div class="cifras"><span><b>{tot['archivos_unicos']}</b> archivos</span><span><b>{tot['filas']}</b> filas para la tabla de piezas</span><span><b>{tot['bytes'] / 1e6:.0f} MB</b> en total</span><span>generado {html.escape(mf['generado'])}</span></div>
</header>
<main>
<nav class="filtros" aria-label="Filtros"><span>MEDIO</span><button class="ch" data-f="medio" data-v="*" aria-pressed="true">Todos</button>{chips_medio}<span style="margin-left:12px">IDIOMA</span><button class="ch" data-f="idioma" data-v="*" aria-pressed="true">Todos</button>{chips_idioma}</nav>
{''.join(secciones)}
</main>
<footer><p>Hecho por código con el motor 3D propio del Estudio MetaGeminis (Three.js, Chromium sin GPU y ffmpeg): sin generadores de pago ni música ni imágenes de terceros. Audio sintetizado. Cada pieza lleva su verificación de contraste, zona segura, destellos y sonoridad. Nada se publica sin el visto bueno de Alex.</p></footer>
<script>
(function(){{
  var F={{medio:'*',idioma:'*'}};
  function aplicar(){{
    document.querySelectorAll('.c').forEach(function(c){{
      var ok=(F.medio==='*'||c.dataset.medio===F.medio)&&(F.idioma==='*'||c.dataset.idioma===F.idioma);
      c.classList.toggle('oculto',!ok);
    }});
    document.querySelectorAll('section').forEach(function(s){{s.classList.toggle('oculto',!s.querySelector('.c:not(.oculto)'))}});
  }}
  document.querySelectorAll('.ch').forEach(function(b){{b.addEventListener('click',function(){{
    F[b.dataset.f]=b.dataset.v;
    document.querySelectorAll('.ch[data-f="'+b.dataset.f+'"]').forEach(function(o){{o.setAttribute('aria-pressed',o===b?'true':'false')}});
    aplicar();
  }})}});
  var reducir=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vs=document.querySelectorAll('video.v');
  if('IntersectionObserver' in window){{
    var io=new IntersectionObserver(function(es){{es.forEach(function(e){{
      var v=e.target;
      if(e.isIntersecting){{
        if(!v.src){{v.src=v.dataset.src}}
        if(reducir){{v.controls=true;v.preload='metadata'}}else{{var p=v.play();if(p&&p.catch)p.catch(function(){{v.controls=true}})}}
      }}else{{v.pause()}}
    }})}},{{threshold:.5}});
    vs.forEach(function(v){{io.observe(v)}});
  }}else{{vs.forEach(function(v){{v.src=v.dataset.src;v.controls=true}})}}
}})();
</script></body></html>
"""
    ruta = Path(salida) / "galeria.html"
    ruta.write_text(doc, encoding="utf8")
    return ruta
