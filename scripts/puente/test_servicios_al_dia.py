"""1104 · AC: los servicios de larga vida se relanzan solos cuando su código cambió."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import servicios_al_dia as S  # noqa: E402

AHORA = 1793820000.0
H = 3600.0


def test_modulos_de_imports_y_rutas():
    texto = "import json, os\nimport repartir_nube as RN\nfrom traer_nube import x\nspec('repartir-a-nube.py')\n"
    assert S.modulos_de(texto, {"repartir_nube", "traer_nube", "repartir-a-nube", "otro"}) == [
        "repartir-a-nube", "repartir_nube", "traer_nube"]


def test_decidir_reinicia_lo_viejo_y_respeta_frenos():
    servicios = [
        {"nombre": "revisor", "inicio": AHORA - 5 * 24 * H, "cambio": AHORA - 2 * H},   # viejo: toca
        {"nombre": "nube", "inicio": AHORA - H, "cambio": AHORA - 2 * H},               # ya corre lo nuevo
        {"nombre": "director", "inicio": AHORA - 3 * H, "cambio": AHORA - 300},         # cambio reciente: espera
        {"nombre": "reconstruir", "inicio": AHORA - 3 * H, "cambio": AHORA - 2 * H},    # ocupado: espera
        {"nombre": "vigia", "inicio": AHORA - 3 * H, "cambio": AHORA - 2 * H},          # reiniciado hace poco
        {"nombre": "guardia", "inicio": None, "cambio": AHORA - 2 * H},                 # sin proceso: nada
    ]
    reiniciar, esperan = S.decidir(servicios, AHORA, {"vigia": AHORA - H}, {"reconstruir"})
    assert reiniciar == ["revisor"]
    motivos = dict(esperan)
    assert "mitad" in motivos["reconstruir"] and "cambió" in motivos["director"] and "reinicié" in motivos["vigia"]
    assert "nube" not in motivos and "guardia" not in motivos


def test_decidir_tope_por_pasada_en_orden_de_importancia():
    viejos = [{"nombre": n, "inicio": AHORA - 9 * H, "cambio": AHORA - 2 * H} for n in S.SERVICIOS]
    reiniciar, esperan = S.decidir(viejos, AHORA, {})
    assert reiniciar == list(S.SERVICIOS[:S.MAX_POR_PASADA])
    assert len(esperan) == len(S.SERVICIOS) - S.MAX_POR_PASADA
    assert "vigilante" not in S.SERVICIOS and "mando" not in S.SERVICIOS


def test_cierre_dos_niveles():
    grafo = {"vigia_medidores": ["autocuracion_mando"], "autocuracion_mando": ["servicios_al_dia", "orquestador_al_dia"],
             "servicios_al_dia": ["orquestador_al_dia"], "orquestador_al_dia": ["suenos"]}
    alcanzables = S.cierre("vigia_medidores", lambda n: grafo.get(n, []))
    assert alcanzables == {"vigia_medidores", "autocuracion_mando", "servicios_al_dia", "orquestador_al_dia"}
    assert S.SERVICIOS[-1] == "vigia"
