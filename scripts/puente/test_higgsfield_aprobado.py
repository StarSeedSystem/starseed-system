#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas sin red de higgsfield_aprobado.py (HGF1113A).

Un comando cambiado no hereda la aprobación; sin aprobación no se ejecuta; al 100 %
del presupuesto se para; al 80 % avisa; el gasto real se anota una sola vez.
"""
import json, os, sys, tempfile
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import higgsfield_aprobado as ha

AHORA = datetime(2026, 11, 13, 10, 0, tzinfo=timezone.utc)
AHORA_TXT = AHORA.isoformat()
PROPUESTA = {"id": "h1", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
             "comando": ["higgsfield", "generate", "seedance_2_0", "--duration", "5"],
             "tomas": 1, "creditos_estimados": 10, "motivo": "pieza de prueba"}

def _correr(**cambios):
    estado = {"llamadas": 0, "gastos": []}
    def lanzar(argv):
        estado["llamadas"] += 1
        estado["argv"] = argv
        return {"codigo": 0, "stdout": '{"credits": 7.5}', "stderr": ""}
    datos = dict(propuestas=[PROPUESTA], aprobaciones={}, gastos=[], limites={"demo": 100},
                 lanzar=lanzar, hay_cli=lambda _n: True, hay_sesion=lambda: True,
                 anotar=estado["gastos"].append, ahora=AHORA)
    datos.update(cambios)
    return ha.ejecutar("h1", **datos), estado  # type: ignore[arg-type]

def _aprobada(**cambios):
    cambios.setdefault("aprobaciones", {"h1": ha.aprobar(PROPUESTA, "Alex", ahora=AHORA)})
    return _correr(**cambios)

def test_aprobar_guarda_sha_quien_y_cuando():
    a = ha.aprobar(PROPUESTA, "Alex", ahora=AHORA)
    assert a["sha256"] == ha.hash_comando(PROPUESTA["comando"])
    assert (a["por"], a["cuando"], a["estado"]) == ("Alex", AHORA_TXT, "aprobada")
    r = ha.rechazar(PROPUESTA, "Alex", ahora=AHORA, motivo="caro")
    assert (r["estado"], r["motivo"]) == ("rechazada", "caro")

def test_sin_aprobacion_no_hay_ejecucion():
    r, e = _correr()
    assert not r["ok"] and "sin aprobación" in r["motivo"] and e["llamadas"] == 0

def test_un_comando_cambiado_no_hereda_la_aprobacion():
    otra = dict(PROPUESTA, comando=PROPUESTA["comando"] + ["--resolution", "1080p"])
    r, e = _aprobada(propuestas=[otra])
    assert not r["ok"] and "sha256" in r["motivo"] and e["llamadas"] == 0

def test_un_proyecto_cambiado_tampoco_hereda_la_aprobacion():
    otra = dict(PROPUESTA, proyecto="otro")
    r, e = _aprobada(propuestas=[otra])
    assert not r["ok"] and "proyecto" in r["motivo"] and e["llamadas"] == 0

def test_rechazada_no_ejecuta():
    a = ha.rechazar(PROPUESTA, "Alex", ahora=AHORA)
    r, e = _correr(aprobaciones={"h1": a})
    assert not r["ok"] and e["llamadas"] == 0

def test_al_cien_por_ciento_del_presupuesto_se_para():
    r, e = _aprobada(gastos=[{"proyecto": "demo", "creditos": 100}])
    assert not r["ok"] and "presupuesto" in r["motivo"] and e["llamadas"] == 0

def test_al_ochenta_avisa_y_ejecuta():
    r, e = _aprobada(gastos=[{"proyecto": "demo", "creditos": 80}])
    assert r["ok"] and "80" in r["aviso"] and e["llamadas"] == 1

def test_ejecuta_una_vez_y_anota_el_gasto_real():
    r, e = _aprobada()
    assert r["ok"] and r["creditos"] == 7.5 and r["reintentado"] is False
    assert e["llamadas"] == 1
    assert e["gastos"] == [{"id": "h1", "proyecto": "demo", "pieza": "intro",
                            "creditos": 7.5, "cuando": AHORA_TXT, "codigo": 0}]

def test_sin_cli_o_sin_sesion_devuelve_motivo_sin_fallar():
    r, e = _aprobada(hay_cli=lambda _n: None)
    assert not r["ok"] and "no está instalado" in r["motivo"] and e["llamadas"] == 0
    r, e = _aprobada(hay_sesion=lambda: False)
    assert not r["ok"] and "HIGGSFIELD_API_KEY" in r["motivo"] and e["llamadas"] == 0

def test_ejecutar_lee_y_escribe_en_disco():
    with tempfile.TemporaryDirectory() as base:
        with open(os.path.join(base, "propuestas.json"), "w", encoding="utf-8") as f: json.dump([PROPUESTA], f)
        ha.guardar_aprobacion(ha.aprobar(PROPUESTA, "Alex", ahora=AHORA), base=base)
        with open(os.path.join(base, "presupuestos.json"), "w", encoding="utf-8") as f:
            json.dump({"proyectos": {"demo": {"creditos": 100}}}, f)
        r = ha.ejecutar("h1", base=base, hay_cli=lambda _n: True, hay_sesion=lambda: True,
                        ahora=AHORA, lanzar=lambda a: {"codigo": 0, "stdout": '{"credits": 7.5}', "stderr": ""})
        assert r["ok"]
        with open(os.path.join(base, "gasto.jsonl"), encoding="utf-8") as f: linea = json.loads(f.read().strip())
        assert (linea["creditos"], linea["proyecto"]) == (7.5, "demo")

if __name__ == "__main__":
    pruebas = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    fallos = 0
    for nombre, funcion in pruebas:
        try: funcion(); print("  ok   %s" % nombre)
        except Exception as error:
            fallos += 1
            print("  ROJO %s: %s: %s" % (nombre, type(error).__name__, error))
    print("\n%d passed, %d failed" % (len(pruebas) - fallos, fallos))
    raise SystemExit(1 if fallos else 0)
