#!/usr/bin/env python3
"""Pruebas de navegador_reglas sin red (NAV1112A)."""
import datetime, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navegador_reglas as N  # noqa: E402

AHORA = datetime.datetime(2026, 11, 12, 10, 0, tzinfo=datetime.timezone.utc)
GOOGLE = "google-alex"
INSTA = "instagram-maggasukha"


def estado_con(sesion=GOOGLE, estado="viva", paginas=0, ultima="", dia="2026-11-12"):
    filas = {nombre: N._sesion_por_defecto() for nombre in N.SESIONES}
    filas[sesion] = {"estado": estado, "ultima_comprobacion": "", "dia": dia,
                     "paginas": paginas, "ultima_pagina": ultima}
    return {"sesiones": filas}


def test_permitida_solo_https_y_dominios_de_la_sesion():
    assert N.permitida(GOOGLE, "https://myactivity.google.com/product/youtube") is True
    assert N.permitida(GOOGLE, "https://www.youtube.com/feed/history") is True
    assert N.permitida(GOOGLE, "https://notebooklm.google.com/") is True
    assert N.permitida(GOOGLE, "http://www.youtube.com/") is False
    assert N.permitida(GOOGLE, "https://example.com/") is False
    assert N.permitida(GOOGLE, "https://youtube.com/") is False
    assert N.permitida(INSTA, "https://www.instagram.com/saved/") is True
    assert N.permitida(INSTA, "https://www.youtube.com/") is False
    assert N.permitida("desconocida", "https://www.youtube.com/") is False


def test_permitida_rechaza_trucos_de_url():
    assert N.permitida(GOOGLE, "https://evil@www.youtube.com/") is False
    assert N.permitida(GOOGLE, "https://www.youtube.com:8443/") is False
    assert N.permitida(GOOGLE, "javascript:alert(1)") is False
    assert N.permitida(GOOGLE, "https://www.youtube.com.evil.com/") is False
    assert N.permitida(GOOGLE, "https://WWW.YOUTUBE.COM./") is True


def test_selector_prohibido_espanol_e_ingles():
    for texto in ("Enviar", "botón publicar", "eliminar", "Seguir", "Me gusta",
                  "Guardar cambios", "send", "publish", "delete", "follow",
                  "like", "save changes", "Unfollow", "unlike"):
        assert N.selector_prohibido(texto) is True, texto


def test_selector_prohibido_no_confunde_palabras():
    for texto in ("likely", "postal", "republicar", "seguidor", "guardado",
                  "saved", "play", "button.primary"):
        assert N.selector_prohibido(texto) is False, texto


def test_apagado_global_e_instagram():
    assert N.apagado({}) is False
    assert N.apagado({"STARSEED_NAVEGADOR": "0"}) is True
    assert N.apagado({"STARSEED_NAVEGADOR": "false"}, INSTA) is True
    assert N.apagado({"STARSEED_NAVEGADOR_INSTAGRAM": "0"}, INSTA) is True
    assert N.apagado({"STARSEED_NAVEGADOR_INSTAGRAM": "0"}, GOOGLE) is False
    assert N.apagado({"STARSEED_NAVEGADOR": "1"}, GOOGLE) is False


def test_dentro_de_tope_exige_sesion_viva():
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(estado="sin alta")) is False
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(estado="caducada")) is False
    assert N.dentro_de_tope("desconocida", AHORA, estado_con()) is False
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con()) is True


def test_dentro_de_tope_cuenta_paginas_y_pausa():
    tope = N.SESIONES[GOOGLE]["paginas_al_dia"]
    pausa = N.SESIONES[GOOGLE]["pausa_minima"]
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(paginas=tope)) is False
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(paginas=tope - 1)) is True
    reciente = (AHORA - datetime.timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(paginas=1, ultima=reciente)) is False
    antigua = (AHORA - datetime.timedelta(seconds=pausa + 1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(paginas=1, ultima=antigua)) is True


def test_dentro_de_tope_cambia_el_dia():
    tope = N.SESIONES[GOOGLE]["paginas_al_dia"]
    assert N.dentro_de_tope(GOOGLE, AHORA, estado_con(paginas=tope, dia="2026-11-11")) is True


def test_estado_se_guarda_y_se_lee(tmp_path):
    ruta = str(tmp_path / "navegador" / "estado.json")
    inicial = N.cargar_estado(ruta)
    assert set(inicial["sesiones"]) == set(N.SESIONES)
    assert inicial["sesiones"][GOOGLE]["estado"] == "sin alta"
    N.marcar_estado(GOOGLE, "viva", AHORA, ruta)
    guardado = N.cargar_estado(ruta)["sesiones"][GOOGLE]
    assert guardado["estado"] == "viva"
    assert guardado["ultima_comprobacion"] == "2026-11-12T10:00:00Z"
    assert not os.path.exists(ruta + ".tmp")


def test_anotar_pagina_cuenta_y_cambia_de_dia(tmp_path):
    ruta = str(tmp_path / "estado.json")
    N.marcar_estado(GOOGLE, "viva", AHORA, ruta)
    N.anotar_pagina(GOOGLE, AHORA, ruta)
    N.anotar_pagina(GOOGLE, AHORA, ruta)
    fila = N.cargar_estado(ruta)["sesiones"][GOOGLE]
    assert fila["paginas"] == 2 and fila["dia"] == "2026-11-12"
    N.anotar_pagina(GOOGLE, AHORA + datetime.timedelta(days=1), ruta)
    fila = N.cargar_estado(ruta)["sesiones"][GOOGLE]
    assert fila["paginas"] == 1 and fila["dia"] == "2026-11-13"


def test_marcar_rechaza_estados_y_sesiones_desconocidas(tmp_path):
    ruta = str(tmp_path / "estado.json")
    for sesion, nuevo in (("nadie", "viva"), (GOOGLE, "muerta")):
        try:
            N.marcar_estado(sesion, nuevo, AHORA, ruta)
        except ValueError:
            continue
        raise AssertionError("debía rechazar %s/%s" % (sesion, nuevo))
