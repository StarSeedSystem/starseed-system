import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analista_pruebas_local as LOC
import analista_pruebas_logica as AN


def ev(lineas, aparato="mac", **extra):
    return {"logs": {aparato: lineas}, **extra}


def test_timeout_webrtc():
    h = AN.reglas(ev(["12:00 WebRTC connect timeout con a1"]))
    assert h[0]["sintoma"] == "Timeout de WebRTC" and h[0]["evidencia"] == ["12:00 WebRTC connect timeout con a1"]


def test_sin_ruta_y_caida_de_capa():
    h = AN.reglas(ev(["error: sin ruta a tableta", "capa BLE caída"]))
    assert {x["sintoma"] for x in h} == {"Sin ruta al aparato", "Caída de una capa"}


def test_permiso_negado():
    assert AN.reglas(ev(["NotAllowedError: permission denied"]))[0]["tipo"] == "ajuste"


def test_censo_y_humo():
    h = AN.reglas(ev([], censo={"mac": {"disco_libre_mb": 200, "ram_libre_mb": 50}}, humo={"mac": False}))
    assert {x["sintoma"] for x in h} == {"Disco bajo", "Memoria baja", "Humo malo"}


def test_evidencia_limpia_sin_hallazgos():
    assert AN.reglas(ev(["todo bien"], censo={"mac": {"disco_libre_mb": 9000, "ram_libre_mb": 900}})) == []


def test_propuesta_tipada_y_acotada():
    p = AN.propuesta({"aparato": "mac", "sintoma": "x", "causa_probable": "y", "archivos_sospechosos": ["src/a.ts"],
                      "tipo": "arreglo", "confianza": 7, "evidencia": list("abcdefg")}, "B1")
    assert p["id_prueba"] == "B1" and p["tipo"] == "arreglo" and p["confianza"] == 1.0 and len(p["evidencia"]) == 5


def test_nunca_propone_protegidos_ni_rutas_raras():
    malos = ["scripts/puente/autopublicar.py", ".github/workflows/ci.yml", "config/firmantes.json",
             "../fuera.ts", "/etc/passwd", "starseed_memory_root/pruebas/bateria-1.json"]
    p = AN.propuesta({"archivos_sospechosos": malos + ["src/ok.ts"], "tipo": "arreglo", "confianza": 0.5}, "B1")
    assert p["archivos_sospechosos"] == ["src/ok.ts"]
    p = AN.propuesta({"archivos_sospechosos": malos, "tipo": "arreglo", "confianza": 0.5}, "B1")
    assert p["archivos_sospechosos"] == [] and p["tipo"] == "investigar"


def _carpeta(tmp_path, lineas):
    (tmp_path / "mac_espejo.log").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    (tmp_path / "resumen.json").write_text(json.dumps({"censo": {"mac": {"disco_libre_mb": 100}}}), encoding="utf-8")
    return str(tmp_path)


def test_analizar_escribe_propuestas_y_laya_marca_principal(tmp_path):
    c = _carpeta(tmp_path, ["webrtc timeout", "sin ruta a a1"])
    llamadas = []

    def laya(estado, preguntas, timeout=None):
        llamadas.append(preguntas[0]["choices"])
        return {"causa": {"choice": "1"}}

    res = LOC.analizar(c, "B1", laya=laya, pedir=lambda *a, **k: "Disco casi lleno.")
    assert json.loads((tmp_path / "propuestas.json").read_text(encoding="utf-8")) == res
    assert sum(p["principal"] for p in res) == 1 and len(llamadas[0]) == 3


def test_bitnet_solo_para_lo_que_las_reglas_no_explican(tmp_path):
    c = _carpeta(tmp_path, ["webrtc timeout"])
    res = LOC.analizar(c, "B1", laya=lambda *a, **k: None, pedir=lambda *a, **k: "  Disco\nlleno  ")
    por = {p["sintoma"]: p for p in res}
    assert por["Disco bajo"]["causa_bitnet"] == "Disco lleno" and "causa_bitnet" not in por["Timeout de WebRTC"]


def test_modelos_caidos_no_rompen(tmp_path):
    def roto(*a, **k):
        raise RuntimeError("sin red")

    c = _carpeta(tmp_path, ["webrtc timeout"])
    res = LOC.analizar(c, "B1", laya=roto, pedir=roto)
    assert len(res) == 2 and not any(p["principal"] for p in res)


def test_laya_fuera_de_rango_se_ignora():
    hs = [{"sintoma": "a", "aparato": "m", "evidencia": [], "causa_probable": "x"}] * 2
    assert LOC.elegir_con_laya(hs, lambda *a, **k: {"causa": "9"}) is None
