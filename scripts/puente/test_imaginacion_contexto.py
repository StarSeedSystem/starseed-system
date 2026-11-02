# -*- coding: utf-8 -*-
"""Pruebas del contexto real y la plantilla de Imaginación (IMG1102B): tope de tamaño, ejemplos buenos y malos, solo
archivos que existen, familias de 7 días, abiertas y bloqueadas con su motivo, medidores, lectura del disco y CLI."""
import json
import os
import sys
from datetime import datetime

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import imaginacion_contexto as C  # noqa: E402
import imaginacion_plantilla as P  # noqa: E402

AHORA = datetime(2026, 11, 2, 9, 0)


def prop(i, titulo, fuente="agentes", fecha="2026-10-31", utilidad=0.0, estado="pregunta", motivo="", archivos=()):
    return {"id": "%s:%d" % (fuente, i), "fuente": fuente, "titulo": titulo, "cuerpo": "x", "archivos": list(archivos),
            "estado": estado, "utilidad": utilidad, "motivo": motivo, "origen": {"fecha": fecha}}


PROPS = [
    prop(1, "Patrón Horizon-Pulse", utilidad=0.83, estado="esperando-aprobacion", archivos=["src/a.tsx", "src/falso.tsx"]),
    prop(2, "Guion Diálogo del Orbe", utilidad=0.80, estado="nueva"),
    prop(3, "Cuarta buena propuesta", utilidad=0.70),
    prop(4, "Arreglar fuga POST", "diaria", utilidad=0.60),
    prop(5, "Endurecer el sandbox", "diaria", estado="esperando-aprobacion", motivo="ya no aplica: la cita no sigue en el código"),
    prop(6, "Publicar los 59 commits", "diaria", motivo="no accionable (publicar): es de Alex"),
    prop(7, "Publicar los 140 commits", "diaria", motivo="no accionable (publicar): es de Alex"),
    prop(8, "Candidata al catálogo: a.com", motivo="no accionable (pago): es de Alex"),
    prop(9, "Ruido NEON", "astraura", utilidad=0.9, estado="descartada", motivo="duplicada de astraura:creation_1"),
    prop(10, "Vieja propuesta", fecha="2026-10-01", utilidad=0.7),
]
PROGRESO = {"T1": {"estado": "pendiente"}, "T2": {"estado": "en_curso"}, "T4": {"estado": "commit"},
            "T3": {"estado": "bloqueada", "nota": "la nube la intentó 3 veces sin integrarla"}}
TAREAS = {"T1": {"archivos": ["src/lib/mando/x.ts"]}, "T2": {"area": "voz", "archivos": []}, "T3": {"archivos": ["src/components/genesis/y.tsx"]}}
MEDIDORES = {"visto": "2026-11-01 18:35:16", "medidores": {"bloqueadas": "10 paradas"},
             "problemas": [{"clave": "tokens", "tipo": "tokens_ciegos", "porque": "el medidor da 0 tok/s"}]}
EXISTEN = {"src/a.tsx", "src/real.tsx", "src/lib/mando/x.ts"}


def contexto(props=PROPS, medidores=MEDIDORES, existe=lambda r: r in EXISTEN, **kw):
    return C.construir(props, PROGRESO, TAREAS, medidores, existe, AHORA, **kw)


def seccion(texto, titulo):
    return texto.split("## " + titulo)[1].split("\n\n")[0] if "## " + titulo in texto else ""


def test_respeta_el_tope_de_tamano():
    largas = ["src/%s/%s%d.tsx" % ("ok" if i % 2 else "no", "d" * 150, i) for i in range(40)]
    prog = {**PROGRESO, **{"B%d" % i: {"estado": "bloqueada", "nota": "n" * 300} for i in range(9)}}
    gordas = [prop(i, "%s %s %s" % tuple(chr(97 + (i // 26 ** k) % 26) * 9 for k in range(3)), utilidad=0.7, motivo="m" * 300,
                   archivos=largas[:3]) for i in range(300)]
    for tope in (400, 800, 2000, C.MAX_CONTEXTO):
        r = C.construir(gordas, prog, TAREAS, MEDIDORES, lambda x: "/ok/" in x, AHORA, largas, tope)
        assert len(r["texto"]) <= tope and r["caracteres"] == len(r["texto"])
    assert 3500 < r["caracteres"] <= 4000


def test_tres_ejemplos_buenos_y_tres_malos_sin_astraura():
    t = contexto()["texto"]
    buenos, malos = seccion(t, "Ejemplos buenos").splitlines()[1:], seccion(t, "Ejemplos malos").splitlines()[1:]
    assert len(buenos) == 3 and "Horizon-Pulse" in buenos[0] and "Cuarta buena" in t and "Arreglar fuga" not in t
    assert len(malos) == 3 and "ya no aplica: la cita no sigue" in t and "(pago)" in t
    assert t.count("Publicar los") == 1 and "NEON" not in t  # mismo motivo y familia: uno solo; astraura fuera


def test_solo_lista_archivos_que_existen():
    r = contexto(rutas=["src/real.tsx", "src/styles/trans‑ition.css", "https://x.example/a.tsx", ""])
    lineas = r["texto"].splitlines()
    existen, faltan = [x for x in lineas if x.startswith("Existen:")][0], [x for x in lineas if x.startswith("No existen")][0]
    assert r["archivos"] and all(a in EXISTEN for a in r["archivos"]) and "x.example" not in r["texto"]
    assert all(a.strip() in EXISTEN for a in existen[len("Existen:"):].split(","))
    assert "src/falso.tsx" in faltan and "src/styles/trans-ition.css" in faltan and "src/falso.tsx" not in existen


def test_familias_de_7_dias_sin_repetir_ni_ruido():
    fam = seccion(contexto()["texto"], "Familias ya propuestas")
    assert "publicar los commits ×2" in fam and "candidata al catálogo ×1" in fam and "vieja" not in fam and "ruido" not in fam
    assert P.familia("Publicar los 59 commits") == P.familia("Publicar los 140 commits (HEAD x)")


def test_abiertas_por_area_y_bloqueadas_con_motivo():
    ab = seccion(contexto()["texto"], "Tareas abiertas por área")
    assert "mando ×1" in ab and "voz ×1" in ab and "bloqueada T3 (genesis): la nube la intentó 3 veces" in ab and "T4" not in ab


def test_avisos_de_medidores_solo_si_hay_estado():
    av = seccion(contexto()["texto"], "Avisos de los medidores (visto 2026-11-01 18:35:16)")
    assert "tokens/tokens_ciegos: el medidor da 0 tok/s" in av and "bloqueadas: 10 paradas" in av
    assert "Avisos" not in contexto(medidores={})["texto"]
    assert C.construir(None, None, None, None, lambda x: False, AHORA)["secciones"] == []


def test_lee_el_disco_y_nunca_lanza(tmp_path):
    mem = tmp_path / "starseed_memory_root"
    for d in ("imaginacion", "olas", "mando", "../src"):
        (mem / d).mkdir(parents=True, exist_ok=True)
    (mem / "imaginacion" / "propuestas.json").write_text(json.dumps({"propuestas": PROPS}), encoding="utf-8")
    (mem / "olas" / "progreso.json").write_text(json.dumps(PROGRESO), encoding="utf-8")
    (mem / "olas" / "cola-x.json").write_text(json.dumps([dict(id=k, **v) for k, v in TAREAS.items()]), encoding="utf-8")
    (mem / "mando" / "vigia-medidores.json").write_text(json.dumps(MEDIDORES), encoding="utf-8")
    (tmp_path / "src" / "a.tsx").write_text("x", encoding="utf-8")
    t = C.texto(str(tmp_path), AHORA)
    assert "Horizon-Pulse" in t and "bloqueada T3" in t and "Existen: src/a.tsx" in t and "tokens_ciegos" in t
    (mem / "imaginacion" / "propuestas.json").write_text("{roto", encoding="utf-8")
    assert C.texto(str(tmp_path), AHORA).startswith("# Contexto medido") and C.texto("/no/existe", AHORA) == ""  # sin datos: nada que añadir


def test_plantilla_unica_y_cli(capsys):
    for campo in ("Título", "Problema", "Evidencia", "Archivos", "Criterio de aceptación", "Coste", "Riesgo", "NO propongas si ya existe la familia"):
        assert campo in P.PLANTILLA
    assert "≤ 3 archivos y ≤ 120 líneas" in P.PLANTILLA_LINEA and "\n" not in P.PLANTILLA_LINEA
    assert C.main(["--plantilla", "linea"]) == 0 and P.PLANTILLA_LINEA in capsys.readouterr().out
    assert C.main(["--plantilla", "bloque"]) == 0 and P.PLANTILLA in capsys.readouterr().out
