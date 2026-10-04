#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cartero del Chat Director del Mando: entrega mensajes a los canales.

Cada 5 s revisa `director_chat.leer()` y atiende las entregas pendientes:
claude-mac y chatgpt ejecutan la orden local, telegram solo envía (no
responde) y los canales de bandeja (antigravity, ide, terminal) no reciben
nada: su copia ya está en `bandeja/<canal>.jsonl`.

(2026-10-04, Alex: «debe contestarla cualquier modelo seleccionado del director
inmediatamente sin esperar nada programado».) claude-cowork contesta AL MOMENTO
con el mismo motor que claude-mac: Claude Code de esta Mac, Opus 5.5 con la
suscripción de Alex, solo lectura del repo y el mismo tope diario. Su copia en
`bandeja/claude-cowork.jsonl` se queda: la sesión de Cowork la retoma en su revisión.
Con `--una-vez` hace una pasada y sale; con `--uso` publica el informe.
"""

import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_chat
import motores_director

RAIZ = Path(__file__).resolve().parent.parent.parent
CANALES_ACTIVOS = ("claude-mac", "claude-cowork", "hermes", "chatgpt", "telegram")
PAUSA_SEGUNDOS = 5
INFORME_CADA_SEGUNDOS = 3 * 3600
TOPE_OPUS = int(os.environ.get("STARSEED_DIRECTOR_TOPE_OPUS", "40"))
AVISO_SALDO = (
    "La cuenta de Claude Code de la Mac no tiene saldo: inicia sesión con "
    "tu suscripción (claude → /login)"
)


def _ruta_estado(raiz=None):
    base = Path(raiz) if raiz else director_chat._directorio()
    return base / "cartero-estado.json"


def cargar_estado(raiz=None):
    ruta = _ruta_estado(raiz)
    try:
        estado = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        estado = {}
    estado.setdefault("atendidos", [])
    estado.setdefault("sesion_claude", None)
    estado.setdefault("ultimo_informe", 0.0)
    estado.setdefault("opus_fecha", "")
    estado.setdefault("opus_hoy", 0)
    return estado


def guardar_estado(estado, raiz=None):
    estado["atendidos"] = estado["atendidos"][-400:]
    ruta = _ruta_estado(raiz)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")


def que_hacer(registros, estado):
    """Decide qué entregas atender: [(id_mensaje, canal), ...] (pura).

    Solo canales activos (las bandejas no se ejecutan), solo la última
    entrega en «pendiente» (o sin entrega aún) y sin repetir lo ya
    atendido en el estado del cartero.
    """
    ultimas = {}
    for r in registros:
        if r.get("tipo") == "entrega":
            ultimas[(r.get("de_id"), r.get("canal"))] = r.get("estado")
    atendidos = set(estado.get("atendidos") or [])
    pendientes = []
    vistos = set()
    for r in sorted(registros, key=director_chat._epoch_de):
        if r.get("tipo") == "entrega" or not r.get("canales"):
            continue
        for canal in r["canales"]:
            if canal not in CANALES_ACTIVOS:
                continue
            clave = (r["id"], canal)
            if clave in vistos:
                continue
            vistos.add(clave)
            if ultimas.get(clave, "pendiente") != "pendiente":
                continue
            if "%s|%s" % clave in atendidos:
                continue
            pendientes.append(clave)
    return pendientes


def _hoy():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")


def _opus_disponible(estado):
    if estado.get("opus_fecha") != _hoy():
        estado["opus_fecha"] = _hoy()
        estado["opus_hoy"] = 0
    return estado["opus_hoy"] < TOPE_OPUS


def _registrar_opus(estado):
    estado["opus_fecha"] = _hoy()
    estado["opus_hoy"] = estado.get("opus_hoy", 0) + 1


def _contexto():
    partes = []
    for nombre in ("PUENTE-DE-MANDO.md", "memory/orquestacion-economica.md"):
        ruta = RAIZ / nombre
        try:
            partes.append(ruta.read_text(encoding="utf-8")[:4000])
        except OSError:
            pass
    return "\n\n".join(partes)


def _fallo(mensaje, canal, detalle, raiz=None):
    director_chat.entrega(mensaje["id"], canal, "fallo", detalle=detalle, raiz=raiz)
    director_chat.publicar(
        "No pude entregar en %s: %s" % (canal, detalle),
        de="cartero",
        rol="sistema",
        tipo="aviso",
        canal="mando",
        raiz=raiz,
    )


def _publicar_respuesta(mensaje, canal, texto, modelo, uso, raiz=None):
    director_chat.publicar(
        texto,
        de=canal,
        rol="director",
        tipo="respuesta",
        canal=canal,
        modelo=modelo,
        responde_a=mensaje["id"],
        uso=uso,
        raiz=raiz,
    )
    director_chat.entrega(mensaje["id"], canal, "respondido", raiz=raiz)


def _entregar_claude_mac(mensaje, estado, modelo_pedido, raiz=None, canal="claude-mac"):
    if not _opus_disponible(estado):
        _fallo(
            mensaje,
            canal,
            "Tope de Opus del día (%d) alcanzado" % TOPE_OPUS,
            raiz=raiz,
        )
        return
    modelo = modelo_pedido.split("/", 1)[-1] or motores_director.MODELO_DIRECTOR
    historial = [
        r
        for r in director_chat.leer(limite=50, raiz=raiz)
        if isinstance(r.get("rol"), str)
    ]
    prompt = motores_director.prompt_director(
        mensaje.get("texto", ""), historial, _contexto()
    )
    inicio = time.time()
    rc, salida = motores_director.correr(
        motores_director.orden_claude(prompt, modelo, estado.get("sesion_claude")),
        env=motores_director.entorno_sin_claves_api(os.environ),
        cwd=str(RAIZ),
        segundos=600,
    )
    segundos = round(time.time() - inicio, 1)
    if "Credit balance is too low" in salida:
        _fallo(mensaje, canal, AVISO_SALDO, raiz=raiz)
        return
    lectura = motores_director.leer_claude(salida)
    if lectura.get("sesion"):
        estado["sesion_claude"] = lectura["sesion"]
    if rc != 0 and not lectura.get("texto"):
        detalle = (lectura.get("error") or salida or "sin salida")[:300]
        _fallo(mensaje, canal, director_chat.tachar(detalle), raiz=raiz)
        return
    _registrar_opus(estado)
    uso = {
        "tokensEntrada": lectura["tokens_entrada"],
        "tokensSalida": lectura["tokens_salida"],
        "segundos": segundos,
        "coste": lectura["coste"],
    }
    if canal != "claude-mac":
        # La dirección (claude-cowork) contesta con este mismo motor: se dice por dónde fue.
        uso["via"] = "claude-code-mac"
    _publicar_respuesta(
        mensaje, canal, lectura["texto"], "%s/%s" % (canal, modelo), uso, raiz
    )


def _entregar_hermes(mensaje, modelo_pedido, raiz=None):
    modelo = modelo_pedido.split("/", 1)[-1] if "/" in modelo_pedido else None
    with tempfile.NamedTemporaryFile(
        mode="r", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        archivo_uso = f.name
    inicio = time.time()
    try:
        rc, salida = motores_director.correr(
            motores_director.orden_hermes(
                mensaje.get("texto", ""), modelo, archivo_uso
            ),
            segundos=600,
        )
        try:
            datos_uso = json.loads(Path(archivo_uso).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            datos_uso = {}
    finally:
        try:
            os.unlink(archivo_uso)
        except OSError:
            pass
    if rc != 0 and not salida.strip():
        _fallo(
            mensaje,
            "hermes",
            director_chat.tachar((salida or "sin salida")[:300]),
            raiz=raiz,
        )
        return
    uso = {
        "tokensEntrada": datos_uso.get("input_tokens", 0),
        "tokensSalida": datos_uso.get("output_tokens", 0),
        "segundos": round(time.time() - inicio, 1),
        "coste": datos_uso.get("cost_usd", 0.0),
    }
    _publicar_respuesta(mensaje, "hermes", salida.strip(), modelo_pedido, uso, raiz)


def _entregar_chatgpt(mensaje, modelo_pedido, raiz=None):
    modelo = modelo_pedido.split("/", 1)[-1] or "gpt-5-codex"
    inicio = time.time()
    rc, salida = motores_director.correr(
        motores_director.orden_codex(modelo, str(RAIZ)),
        entrada=mensaje.get("texto", ""),
        segundos=600,
    )
    if rc != 0 and not salida.strip():
        _fallo(
            mensaje,
            "chatgpt",
            director_chat.tachar((salida or "sin salida")[:300]),
            raiz=raiz,
        )
        return
    _publicar_respuesta(
        mensaje,
        "chatgpt",
        salida.strip(),
        "codex/" + modelo,
        {"segundos": round(time.time() - inicio, 1)},
        raiz,
    )


def _entregar_telegram(mensaje, raiz=None):
    texto = mensaje.get("texto", "")[:3500]
    rc, salida = motores_director.correr(
        ["hermes", "send", "-t", "telegram:Maggasukha", "-s", "Puente de Mando", texto],
        segundos=120,
    )
    if rc != 0:
        _fallo(
            mensaje,
            "telegram",
            director_chat.tachar((salida or "sin salida")[:300]),
            raiz=raiz,
        )
        return
    director_chat.entrega(mensaje["id"], "telegram", "entregado", raiz=raiz)


def atender(mensaje, canal, estado, raiz=None):
    try:
        if canal in ("claude-mac", "claude-cowork"):
            _entregar_claude_mac(
                mensaje,
                estado,
                mensaje.get("modelo") or "%s/claude-opus-5-5" % canal,
                raiz=raiz,
                canal=canal,
            )
        elif canal == "hermes":
            _entregar_hermes(
                mensaje, mensaje.get("modelo") or "hermes/predeterminado", raiz=raiz
            )
        elif canal == "chatgpt":
            _entregar_chatgpt(
                mensaje, mensaje.get("modelo") or "codex/gpt-5-codex", raiz=raiz
            )
        elif canal == "telegram":
            _entregar_telegram(mensaje, raiz=raiz)
        estado["atendidos"].append("%s|%s" % (mensaje["id"], canal))
    except OSError as e:
        _fallo(mensaje, canal, "no se pudo lanzar la orden: %s" % e, raiz=raiz)
        estado["atendidos"].append("%s|%s" % (mensaje["id"], canal))


def _cargar_json(ruta):
    """Lee un dict JSON de disco; cualquier fallo o forma rara devuelve {} (pura de lectura)."""
    try:
        datos = json.loads(Path(ruta).expanduser().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return datos if isinstance(datos, dict) else {}


def resumen_jev(datos):
    """Una línea legible del gasto de Jev (pura)."""
    if not isinstance(datos, dict):
        return "Jev: sin datos"
    try:
        llamadas = int(datos["llamadas"])
        coste = float(datos["coste_usd"])
        tope_dia = float(datos["tope_dia_usd"])
        mes = float(datos["mes_usd"])
        tope_mes = float(datos["tope_mes_usd"])
    except (KeyError, TypeError, ValueError):
        return "Jev: sin datos"
    return (
        "Jev: %d llamadas hoy · %.4f $ de %.4f $ del día "
        "(%.4f $ en el mes de %.4f $)" % (llamadas, coste, tope_dia, mes, tope_mes)
    )


def resumen_consumo(datos):
    """Una línea legible del consumo de Supabase (pura)."""
    sup = datos.get("supabase") if isinstance(datos, dict) else None
    if not isinstance(sup, dict) or not isinstance(sup.get("peticiones_hora"), int):
        return "Supabase: sin datos"
    linea = "Supabase: %d peticiones en la última hora" % sup["peticiones_hora"]
    top = sup.get("top")
    if isinstance(top, list) and top and isinstance(top[0], dict):
        ruta = top[0].get("ruta")
        n = top[0].get("n", top[0].get("veces"))
        if ruta and n is not None:
            linea += " (más pedida: %s ×%s)" % (ruta, n)
    return linea


def resumen_opus(datos):
    """Una línea legible del uso de Opus de los directores (pura)."""
    if not isinstance(datos, dict) or not datos:
        return "Opus de los directores: sin datos"
    partes = []
    if isinstance(datos.get("llamadas"), int):
        partes.append("%d llamadas" % datos["llamadas"])
    tokens = datos.get("tokens")
    if isinstance(tokens, dict):
        entrada = tokens.get("entrada")
        salida = tokens.get("salida")
        if isinstance(entrada, int) and isinstance(salida, int):
            partes.append("%d tokens de entrada y %d de salida" % (entrada, salida))
        elif isinstance(entrada, int):
            partes.append("%d tokens de entrada" % entrada)
    elif isinstance(datos.get("tokens_dia"), int):
        partes.append("%d tokens hoy" % datos["tokens_dia"])
    if not partes:
        return "Opus de los directores: sin datos"
    return "Opus de los directores: " + ", ".join(partes)


def texto_informe_uso(estado):
    partes = []
    jev = {}
    rc, salida = motores_director.correr(
        ["python3", "scripts/puente/decidir.py", "uso", "--json"],
        cwd=str(RAIZ),
        segundos=30,
    )
    if rc == 0 and salida.strip():
        try:
            datos_jev = json.loads(salida.strip())
        except json.JSONDecodeError:
            datos_jev = {}
        if isinstance(datos_jev, dict):
            jev = datos_jev
    partes.append(resumen_jev(jev))
    partes.append(resumen_consumo(_cargar_json("~/.starseed/consumo.json")))
    partes.append(resumen_opus(_cargar_json("~/.starseed/opus-director-uso.json")))
    partes.append("Opus del día: %d de %d" % (estado.get("opus_hoy", 0), TOPE_OPUS))
    motores = {}
    for r in director_chat.leer(limite=200):
        modelo = r.get("modelo")
        if modelo and r.get("rol") == "director":
            motores[modelo] = motores.get(modelo, 0) + 1
    lineas = ["%s: %d" % (m, n) for m, n in sorted(motores.items())]
    partes.append("Llamadas a motores hoy: " + (", ".join(lineas) or "ninguna"))
    return "\n".join(p[:200] for p in partes)


def publicar_informe_uso(estado, raiz=None):
    director_chat.publicar(
        texto_informe_uso(estado),
        de="cartero",
        rol="sistema",
        tipo="uso",
        canal="mando",
        raiz=raiz,
    )
    estado["ultimo_informe"] = time.time()


def pasada(estado, raiz=None):
    registros = director_chat.leer(limite=200, raiz=raiz)
    por_id = {r["id"]: r for r in registros if r.get("id")}
    for id_mensaje, canal in que_hacer(registros, estado):
        mensaje = por_id.get(id_mensaje)
        if mensaje:
            atender(mensaje, canal, estado, raiz=raiz)
    if time.time() - estado.get("ultimo_informe", 0.0) >= INFORME_CADA_SEGUNDOS:
        publicar_informe_uso(estado, raiz=raiz)
    guardar_estado(estado, raiz=raiz)


def main(argv=None):
    import argparse

    p = argparse.ArgumentParser(
        prog="cartero_director",
        description="Cartero del Chat Director del Mando",
    )
    p.add_argument(
        "--una-vez", action="store_true", help="hace una pasada de entregas y sale"
    )
    p.add_argument(
        "--uso", action="store_true", help="publica el informe de uso y sale"
    )
    args = p.parse_args(argv)
    estado = cargar_estado()
    if args.uso:
        publicar_informe_uso(estado)
        guardar_estado(estado)
        return 0
    if args.una_vez:
        pasada(estado)
        return 0
    while True:
        pasada(estado)
        time.sleep(PAUSA_SEGUNDOS)


if __name__ == "__main__":
    sys.exit(main())
