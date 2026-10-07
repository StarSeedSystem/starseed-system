"""Pruebas puras de scripts/puente/produccion_puertas.py (§3.2 y §3.3).

Sin red ni archivos: `decidir` y `panel` se inyectan.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_puertas as pp


def _diff(archivo, anadidas, eliminadas=None):
    lineas = ["diff --git a/%s b/%s" % (archivo, archivo),
              "--- a/%s" % archivo, "+++ b/%s" % archivo,
              "@@ -0,0 +1,%d @@" % (len(anadidas) + len(eliminadas or []))]
    lineas += ["+" + a for a in anadidas]
    lineas += ["-" + e for e in (eliminadas or [])]
    return "\n".join(lineas)


def test_escanear_detecta_patrones_tipicos():
    diff = _diff("src/lib/x.ts", [
        'const a = "sk-abcdefghijklmnop1234";',
        'const g = "ghp_0123456789abcdefghij";',
        'token = "github_pat_11AAAAAA0123456789abcdefghijkl"',
        'jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"',
        'aws = "AKIAIOSFODNN7EXAMPLE"',
        'slack = "xoxb-123456789012-abcdefghij"',
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "DATABASE_API_KEY=supervalor9",
        'NEXT_PUBLIC_SECRET_KEY=valor123',
    ])
    tipos = [h["tipo"] for h in pp.escanear_secretos(diff)]
    for esperado in ("sk", "ghp", "github_pat", "jwt", "akia", "xox", "pem",
                     "variable-entorno", "next-public-clave"):
        assert esperado in tipos, (esperado, tipos)
    assert len(tipos) == len(set(tipos))  # una línea, un hallazgo


def test_escanear_archivo_env_y_filtrado_de_valores():
    diff = _diff(".env.local", ["FOO=bar"]) + "\n" + _diff(
        "app/config.ts", ['WEBHOOK_TOKEN="abcdefgh123456"'])
    hallazgos = pp.escanear_secretos(diff)
    assert any(h["tipo"] == "archivo-env" and h["archivo"] == ".env.local"
               for h in hallazgos)
    assert all("abcdefgh123456" not in json.dumps(h) for h in hallazgos)
    assert all(set(h) == {"archivo", "linea", "tipo"} for h in hallazgos)


def test_escanear_ignora_eliminadas_y_contexto():
    diff = _diff("src/a.ts", [], eliminadas=['OLD_KEY="sk-abcdefghij123456"'])
    diff += "\n contexto sin signo NEXT_PUBLIC_SUPABASE_URL=https://x.co"
    assert pp.escanear_secretos(diff) == []


def test_escanear_no_confunde_marcadores_de_documentacion_con_claves():
    # (2026-10-07) Un texto de ayuda frenaba la autopublicación: «STARSEED_MOTOR_TOKEN=<token…».
    diff = _diff("src/lib/mando/motores.ts", [
        '"(una línea STARSEED_MOTOR_TOKEN=<token… Se enseña una sola vez"',
        "OPENAI_API_KEY=${OPENAI_API_KEY}",
        "GITHUB_TOKEN=$(gh auth token)",
        "STRIPE_SECRET_KEY={{ secrets.STRIPE }}",
    ])
    assert [h for h in pp.escanear_secretos(diff) if h["tipo"] == "variable-entorno"] == []
    # …pero un valor real sigue frenando.
    # (el valor se monta en tiempo de ejecución: la autopublicación escanea este mismo archivo)
    real = _diff("src/a.ts", ["MOTOR_TOKEN=" + "abc123def456ghi"])
    assert [h["tipo"] for h in pp.escanear_secretos(real)] == ["variable-entorno"]


def test_migracion_destructiva():
    assert pp.migracion_destructiva("DROP TABLE users;")[0] is True
    assert pp.migracion_destructiva("truncate t;")[0] is True
    assert pp.migracion_destructiva("delete from t where id=1;")[0] is True
    assert pp.migracion_destructiva(
        "alter table t alter column c type bigint;")[0] is True
    assert pp.migracion_destructiva("ALTER TABLE t RENAME TO u;")[0] is True
    ok, motivo = pp.migracion_destructiva(
        "ALTER TABLE t ADD COLUMN c int NOT NULL;")
    assert ok and "NOT NULL" in motivo
    assert pp.migracion_destructiva(
        "ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0;") == (False, None)
    assert pp.migracion_destructiva(
        "CREATE TABLE IF NOT EXISTS t (id int);") == (False, None)
    assert pp.migracion_destructiva(
        "-- DROP TABLE t\nCREATE INDEX i ON t(c);") == (False, None)


def _candidata(tid, **extra):
    base = {"id": tid, "titulo": "Título de %s" % tid,
            "prompt": "haz la tarea %s" % tid, "motivo_ola": "ola de prueba",
            "diffstat": " 2 files changed", "archivos": ["src/a.ts"],
            "veredictos": {"revisor": "verde"}}
    base.update(extra)
    return base


def test_paquete_contexto_campos_y_tope():
    c = _candidata("t1", prompt="x" * 9000)
    ctx = "contexto " * 2000
    paquete = pp.paquete_contexto(c, ctx)
    for clave in ("tid", "titulo", "prompt_tarea", "motivo_ola",
                  "peticion_alex", "diffstat", "archivos", "contexto_area",
                  "veredictos"):
        assert clave in paquete
    assert len(json.dumps(paquete, ensure_ascii=False).encode("utf-8")) <= 6144
    assert paquete["archivos"] == ["src/a.ts"]
    p2 = pp.paquete_contexto(_candidata("t1"), "")
    assert p2["veredictos"] == {"revisor": "verde"}


def test_preguntas_lote_formato_y_troceo():
    lotes = pp.preguntas_lote([_candidata("a"), _candidata("b")])
    assert len(lotes) == 1 and len(lotes[0]) == 6
    assert lotes[0]["coherente_a"]["tipo"] == "si-no"
    assert lotes[0]["mejora_a"]["niveles"] == ["1", "2", "3", "4", "5"]
    assert lotes[0]["riesgo_a"]["opciones"] == ["bajo", "medio", "alto"]
    troceados = pp.preguntas_lote([_candidata("t%d" % i) for i in range(10)])
    assert len(troceados) == 2
    assert len(troceados[0]) == 24 and len(troceados[1]) == 6


def _resp_ok(tid, p=0.9, mejora=4, riesgo="bajo"):
    return {"coherente_%s" % tid: {"respuesta": "sí", "p": p},
            "mejora_%s" % tid: {"valor": mejora},
            "riesgo_%s" % tid: {"respuesta": riesgo}}


def test_decidir_lote_regla_exacta():
    c = _candidata("t1")
    r = pp.decidir_lote(_resp_ok("t1"), [c], 0.7)
    assert r["t1"]["publica"] and r["t1"]["via"] == "jev"
    assert not pp.decidir_lote(_resp_ok("t1", p=0.5), [c], 0.7)["t1"]["publica"]
    assert not pp.decidir_lote(_resp_ok("t1", mejora=2), [c], 0.7)["t1"]["publica"]
    no_alto = pp.decidir_lote(_resp_ok("t1", riesgo="alto"), [c], 0.7)
    assert not no_alto["t1"]["publica"]
    medio_sin = pp.decidir_lote(_resp_ok("t1", riesgo="medio"), [c], 0.7)
    assert not medio_sin["t1"]["publica"]
    medio_con = pp.decidir_lote(_resp_ok("t1", riesgo="medio"),
                                [_candidata("t1", pruebas_completas=True)], 0.7)
    assert medio_con["t1"]["publica"]


def test_decidir_lote_determinista_en_rojo_nunca_se_salva():
    c = _candidata("t1", puertas={"seguridad": "rojo"})
    panel = lambda _c: [{"coherente": "sí", "mejora": 5, "riesgo": "bajo"}] * 3
    r = pp.decidir_lote(_resp_ok("t1"), [c], 0.7, panel=panel)
    assert r["t1"]["publica"] is False and r["t1"]["via"] == "determinista"


def test_decidir_lote_panel_de_respaldo_y_sin_panel():
    c = _candidata("t1")
    votos = [{"coherente": "sí", "mejora": 5, "riesgo": "bajo"},
             {"coherente": "sí", "mejora": 3, "riesgo": "medio"},
             {"coherente": "no", "mejora": 4, "riesgo": "bajo"}]
    r = pp.decidir_lote({}, [c], 0.7, panel=lambda _c: list(votos))
    assert r["t1"]["publica"] and r["t1"]["via"] == "panel"  # mayoría sí, mediana 4
    votos_no = [{"coherente": "no", "mejora": 5, "riesgo": "bajo"}] * 3
    r2 = pp.decidir_lote({}, [c], 0.7, panel=lambda _c: list(votos_no))
    assert not r2["t1"]["publica"]
    r3 = pp.decidir_lote({}, [c], 0.7)
    assert r3["t1"]["publica"] is False and r3["t1"]["via"] == "sin_panel"


class _DecidirFalso:
    def __init__(self, respuestas):
        self.llamadas = 0
        self._respuestas = respuestas

    def consultar_lote(self, estado, preguntas, quien=None, dominio="", anotar=True):
        self.llamadas += 1
        assert len(preguntas) <= pp.MAX_PREGUNTAS_LOTE
        return {"respuestas": dict(self._respuestas), "medio": "falso"}


def test_juzgar_lote_decidir_una_vez_por_ciclo():
    candidatas = [_candidata("t%d" % i) for i in range(8)]  # 24 preguntas
    todas = {}
    for c in candidatas:
        todas.update(_resp_ok(c["id"]))
    decidir = _DecidirFalso(todas)
    r = pp.juzgar_lote(candidatas, decidir, 0.7)
    assert decidir.llamadas == 1
    assert all(v["publica"] for v in r.values())
    muchas = [_candidata("t%d" % i) for i in range(10)]
    decidir2 = _DecidirFalso(todas)
    pp.juzgar_lote(muchas, decidir2, 0.7)
    assert decidir2.llamadas == 2
