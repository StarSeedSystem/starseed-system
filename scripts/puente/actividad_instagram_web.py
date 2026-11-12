#!/usr/bin/env python3
"""Actividad · guardados de Instagram (NAV1112H). instagram-maggasukha: guardados/colecciones (enlace, autor, colección; máx 60) y seguidos (nombre, enlace). instagram-sociedad: solo publicaciones propias. Pausas largas, tope diario. Verificación/cierre → apaga STARSEED_NAVEGADOR_INSTAGRAM, avisa por Telegram, no reintenta. Solo lectura, incremental por enlace."""
import datetime, json, os, re
from pathlib import Path
from typing import Any

RUTA_FICHAS = os.path.expanduser("~/.starseed/actividad/fichas")
RUTA_ESTADO = os.path.expanduser("~/.starseed/navegador/estado.json")
URL_GUARDADOS = "https://www.instagram.com/saved/"
URL_COLECCIONES = "https://www.instagram.com/saved/collections/"
URL_SEGUIDOS = "https://www.instagram.com/{}/following/"
URL_PROPIO = "https://www.instagram.com/{}/"
MAX_NUEVOS = 60

def extraer_guardados(html: str) -> list[dict[str, Any]]:
    items = []
    for m in re.finditer(r'<a[^>]*href="(/p/[^"]*)"[^>]*>\s*<span[^>]*>([^<]+)</span>\s*<span[^>]*class="[^"]*coleccion[^"]*"[^>]*>([^<]*)</span>', html, re.I | re.S):
        enlace, autor, coleccion = m.groups()
        items.append({"enlace": f"https://www.instagram.com{enlace}", "autor": autor.strip(), "coleccion": coleccion.strip() or "sin colección"})
    return items[:MAX_NUEVOS]

def extraer_seguidos(html: str) -> list[dict[str, Any]]:
    items = []
    for m in re.finditer(r'<a[^>]*href="(/[^"]+)"[^>]*>.*?<span[^>]*>([^<]+)</span>', html, re.I | re.S):
        enlace, nombre = m.groups()
        if not enlace.startswith(("/p/", "/reel/")): items.append({"nombre": nombre.strip(), "enlace": f"https://www.instagram.com{enlace}"})
    return items

def extraer_propio(html: str) -> list[dict[str, Any]]:
    items = []
    for m in re.finditer(r'<a[^>]*href="(/p/[^"]*)"[^>]*>.*?<time[^>]*datetime="([^"]*)"', html, re.I | re.S):
        enlace, fecha_str = m.groups()
        try: fecha = datetime.datetime.fromisoformat(fecha_str.replace("Z", "+00:00")); items.append({"enlace": f"https://www.instagram.com{enlace}", "fecha": fecha.isoformat()})
        except ValueError: pass
    return items

def _clave(e: dict, prefijo: str) -> str: return f"{prefijo}|{e.get('enlace')}"

def guardar_fichas(entradas: list[dict], alias: str, prefijo: str, ahora: datetime.datetime) -> int:
    ruta = Path(RUTA_FICHAS) / f"{ahora:%Y-%m-%d}-insta-{prefijo}-{alias}.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    existentes = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else []
    claves = {_clave(x, prefijo) for x in existentes}
    nuevas = [e for e in entradas if _clave(e, prefijo) not in claves]
    if nuevas:
        tmp = ruta.with_suffix(".tmp")
        tmp.write_text(json.dumps(existentes + nuevas, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, ruta)
    return len(nuevas)

def _guardar_esqueleto(html: str, alias: str, ahora: datetime.datetime, pagina: str) -> None:
    ruta = Path(os.path.expanduser(f"~/.starseed/navegador/reparar/{ahora:%Y%m%d-%H%M%S}-insta-{pagina}-{alias}.html"))
    ruta.parent.mkdir(parents=True, exist_ok=True)
    esqueleto = re.sub(r'<(pre|script|style)[^>]*>.*?</\1>', '', html, re.S)
    esqueleto = re.sub(r'>\s*<', '><', re.sub(r'>[^<]+<', '><', esqueleto))
    ruta.write_text(esqueleto, encoding="utf-8")

def _verificar_bloqueo(html: str) -> str | None:
    if any(p in html.lower() for p in ("checkpoint", "challenge", "verification", "verify your identity", "actividad inusual", "unusual activity", "suspicious login", "session expired", "sesión expirada", "log in", "iniciar sesión", "logged out", "cerrar sesión")): return "verificacion_o_cierre"
    return None

def _apagar_instagram(ruta: str = RUTA_ESTADO) -> None:
    try:
        import navegador_reglas as NR
        estado = NR.cargar_estado(ruta)
        for s in ("instagram-maggasukha", "instagram-sociedad"): estado["sesiones"][s]["estado"] = "caducada"
        NR.guardar_estado(estado, ruta)
    except Exception: pass

def _avisar(motivo: str, sesion: str) -> None:
    try:
        import sintesis_telegram as ST
        ST.enviar(f"⚠️ Navegador Instagram: {motivo} en sesión {sesion}.\nSTARSEED_NAVEGADOR_INSTAGRAM en apagado.\nRequiere alta manual de Alex.")
    except Exception: pass

def _procesar_maggasukha(alias: str, ahora: datetime.datetime, cliente, NR) -> dict:
    res = {"guardados": 0, "colecciones": 0, "seguidos": 0}
    for url, ext, pref in ((URL_GUARDADOS, extraer_guardados, "guardados"), (URL_COLECCIONES, extraer_guardados, "colecciones"), (URL_SEGUIDOS.format(alias), extraer_seguidos, "seguidos")):
        if not NR.dentro_de_tope("instagram-maggasukha", ahora): break
        cliente.abrir(url); cliente.esperar(3.0)
        for _ in range(3): cliente.desplazar(1); cliente.esperar(2.0)
        html = cliente._page.content() if cliente._page else ""
        NR.anotar_pagina("instagram-maggasukha", ahora)
        if (motivo := _verificar_bloqueo(html)): _apagar_instagram(); _avisar(motivo, "instagram-maggasukha"); cliente.cerrar(); return {"ok": False, "motivo": motivo}
        if not (items := ext(html)): _guardar_esqueleto(html, alias, ahora, pref); continue
        res[pref] = guardar_fichas(items, alias, pref, ahora)
        cliente.esperar(5.0)
    return {"ok": True, **res}

def _procesar_sociedad(alias: str, ahora: datetime.datetime, cliente, NR) -> dict:
    if not NR.dentro_de_tope("instagram-sociedad", ahora): return {"ok": False, "motivo": "fuera de tope"}
    cliente.abrir(URL_PROPIO.format(alias)); cliente.esperar(3.0)
    for _ in range(2): cliente.desplazar(1); cliente.esperar(2.0)
    html = cliente._page.content() if cliente._page else ""
    NR.anotar_pagina("instagram-sociedad", ahora)
    if (motivo := _verificar_bloqueo(html)): _apagar_instagram(); _avisar(motivo, "instagram-sociedad"); cliente.cerrar(); return {"ok": False, "motivo": motivo}
    if (items := extraer_propio(html)): return {"ok": True, "propios": guardar_fichas(items, alias, "propios", ahora)}
    _guardar_esqueleto(html, alias, ahora, "propios"); return {"ok": True, "propios": 0}

def procesar_sesion(sesion: str, ahora: datetime.datetime, cliente) -> dict:
    import navegador_reglas as NR
    if NR.apagado(sesion=sesion) or not NR.dentro_de_tope(sesion, ahora): return {"ok": False, "motivo": "apagado o fuera de tope"}
    alias = NR.SESIONES[sesion]["cuenta"]
    try:
        res = _procesar_maggasukha(alias, ahora, cliente, NR) if sesion == "instagram-maggasukha" else _procesar_sociedad(alias, ahora, cliente, NR)
        cliente.cerrar()
        return res
    except Exception as e:
        try: cliente.cerrar()
        except Exception: pass
        return {"ok": False, "motivo": f"error: {e}"}

def main() -> dict:
    try: import navegador_cliente as NC
    except ImportError: return {"ok": False, "motivo": "dependencias no disponibles"}
    ahora = datetime.datetime.now(datetime.timezone.utc)
    resultados = {s: procesar_sesion(s, ahora, NC) for s in ("instagram-maggasukha", "instagram-sociedad")}
    return {"ok": all(r.get("ok") for r in resultados.values()), "resultados": resultados}