"""HERL1118B: interpretación pura de las capacidades de Hermes (sin ejecutar nada real)."""
import importlib.util
import os
from datetime import datetime, timezone

_r = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hermes_capacidades.py")
_s = importlib.util.spec_from_file_location("hermes_capacidades", _r)
H = importlib.util.module_from_spec(_s)
_s.loader.exec_module(H)

AHORA = 1_800_000_000.0


def test_captura_falta_permiso_por_mensaje():
    r = H.interpretar_captura("could not create image from display", 1, False, 0)
    assert r["estado"] == "falta-permiso"
    assert r["ajustes"] == H.AJUSTES_PANTALLA


def test_captura_ok_cuando_hay_archivo_y_no_es_negro():
    r = H.interpretar_captura("", 0, True, 150_000, negro=False)
    assert r["estado"] == "ok"
    assert r["ajustes"] is None
    assert r["bytes"] == 150_000


def test_captura_en_negro_es_fallo():
    r = H.interpretar_captura("", 0, True, 300, negro=True)
    assert r["estado"] == "fallo"
    assert "negro" in r["detalle"]


def test_captura_sin_archivo_es_fallo():
    r = H.interpretar_captura("", 0, False, 0)
    assert r["estado"] == "fallo"


def test_control_ok_con_nombre_de_proceso():
    r = H.interpretar_control("Finder\n", 0, "")
    assert r["estado"] == "ok"
    assert "Finder" in r["detalle"]


def test_control_falta_accesibilidad():
    error = "execution error: System Events got an error: osascript is not allowed assistive access. (-1719)"
    r = H.interpretar_control("", 1, error)
    assert r["estado"] == "falta-permiso"
    assert r["ajustes"] == H.AJUSTES_ACCESIBILIDAD


def test_control_falta_automatizacion():
    error = "execution error: Not authorized to send Apple events to System Events. (-1743)"
    r = H.interpretar_control("", 1, error)
    assert r["estado"] == "falta-permiso"
    assert r["ajustes"] == H.AJUSTES_AUTOMATIZACION


def test_control_error_desconocido_es_fallo():
    r = H.interpretar_control("", 1, "algo raro")
    assert r["estado"] == "fallo"


def test_control_sin_salida_es_fallo():
    r = H.interpretar_control("", 0, "")
    assert r["estado"] == "fallo"


def test_registro_fresco_ok():
    r = H.interpretar_registro("Mac", True, 12_345, AHORA - 30, ahora=AHORA)
    assert r["estado"] == "ok"
    assert r["bytes"] == 12_345
    assert r["silencio_s"] == 30


def test_registro_inexistente():
    r = H.interpretar_registro("Mac", False, 0, None, ahora=AHORA)
    assert r["estado"] == "sin-registro"


def test_registro_vacio():
    r = H.interpretar_registro("Mac", True, 0, AHORA, ahora=AHORA)
    assert r["estado"] == "sin-registro"


def test_registro_parado():
    r = H.interpretar_registro("Mac", True, 500, AHORA - 25 * 3600, ahora=AHORA)
    assert r["estado"] == "parado"


def test_ssh_ok():
    r = H.interpretar_ssh(0, "9876 1799999970\n", "", ahora=AHORA)
    assert r["estado"] == "ok"
    assert r["bytes"] == 9876


def test_ssh_usa_la_hora_de_la_ultima_linea():
    esperado = datetime(2026, 11, 12, 3, 30, 16, 166000, tzinfo=timezone.utc).timestamp()
    salida = "9876 1799999970\n2026-11-12T03:30:16.166Z web · hola\n"
    r = H.interpretar_ssh(0, salida, "", ahora=esperado + 30)
    assert r["ultima"] == "2026-11-12T03:30:16Z"
    assert r["silencio_s"] == 30
    assert r["estado"] == "ok"


def test_ssh_sin_registro():
    r = H.interpretar_ssh(0, "SIN\n", "", ahora=AHORA)
    assert r["estado"] == "sin-registro"


def test_ssh_sin_acceso():
    r = H.interpretar_ssh(255, "", "ssh: connect to host: Connection timed out", ahora=AHORA)
    assert r["estado"] == "sin-acceso"


def test_ssh_salida_vacia():
    r = H.interpretar_ssh(0, "", "", ahora=AHORA)
    assert r["estado"] == "sin-registro"


def test_lanzador_ok():
    salida = '{"app_existe": true, "usa_launcher": true, "servicio_cargado": true}'
    r = H.interpretar_lanzador(0, salida, "")
    assert r["estado"] == "ok"
    assert r["usa_launcher"] is True


def test_lanzador_sin_lanzador():
    salida = '{"app_existe": false, "usa_launcher": false, "servicio_cargado": false}'
    r = H.interpretar_lanzador(0, salida, "")
    assert r["estado"] == "sin-lanzador"


def test_lanzador_salida_invalida():
    r = H.interpretar_lanzador(1, "no es json", "boom")
    assert r["estado"] == "error"


def test_leer_ultima_epoch_desde_linea_iso():
    linea = "2026-11-12T03:30:16.166Z web 2026-11-12T03:25:40.514Z · hola"
    esperado = datetime(2026, 11, 12, 3, 30, 16, 166000, tzinfo=timezone.utc).timestamp()
    assert abs(H.leer_ultima_epoch(linea) - esperado) < 0.01


def test_leer_ultima_epoch_respaldo():
    assert H.leer_ultima_epoch("sin fecha", respaldo=AHORA) == AHORA


def _png(ancho, alto, rgb):
    import struct
    import zlib

    crudo = (b"\x00" + bytes(rgb) * ancho) * alto

    def bloque(tipo, datos):
        return (
            struct.pack(">I", len(datos))
            + tipo
            + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
        )

    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + bloque(b"IHDR", cabecera)
        + bloque(b"IDAT", zlib.compress(crudo))
        + bloque(b"IEND", b"")
    )


def test_png_negra_se_detecta():
    assert H._es_negro_png(_png(4, 4, (0, 0, 0))) is True


def test_png_con_luz_no_es_negra():
    assert H._es_negro_png(_png(4, 4, (250, 250, 250))) is False


def test_linea_publicacion_nombra_lo_que_falta_y_su_ajuste():
    resultado = {
        "captura": H.interpretar_captura("could not create image from display", 1, False, 0),
        "control": H.interpretar_control("", 1, "not allowed assistive access (-1719)"),
        "registros": {
            "mac": H.interpretar_registro("Mac", True, 100, AHORA - 10, ahora=AHORA),
            "maggabox": H.interpretar_ssh(0, "SIN\n", "", ahora=AHORA),
        },
        "lanzador": H.interpretar_lanzador(
            0, '{"app_existe": true, "usa_launcher": true, "servicio_cargado": true}', ""
        ),
    }
    linea = H.linea_publicacion(resultado)
    assert "Hermes" in linea
    assert H.AJUSTES_PANTALLA in linea
    assert H.AJUSTES_ACCESIBILIDAD in linea
    assert "\n" not in linea
