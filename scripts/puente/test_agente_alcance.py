# -*- coding: utf-8 -*-
"""Pruebas del agente de alcance (INV1025M): plan acotado, Jev callado y con umbral,
tarea sin dirección, validación de borradores, forzado de importancia/estado, cola
con prefijo `cola-suenos-` y carta ausente. Puras: sin red, sin orquestador."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import agente_alcance as A  # noqa: E402
import alcance_objetivos as AO  # noqa: E402
import alcance_plan as P  # noqa: E402

AHORA = datetime(2026, 10, 29, 9, 0, tzinfo=timezone.utc)


def objetivo(oid="obj-1", afinidad=200, nivel="medio", **extra):
    o = {"id": oid, "nombre_publico": "Taller de Viento", "tipo": "proyecto", "categoria": "proyecto-afin",
         "nivel": nivel, "afinidad": afinidad, "urls_oficiales": ["https://tallerviento.org/"], "estado": "nuevo"}
    o.update(extra)
    return o


def ficha(oid="obj-1"):
    return {"obj_id": oid, "nombre_publico": "Taller de Viento", "que_hacen": "Estudio de arte comunitario.",
            "canal_oficial": {"medio": "correo", "valor": "hola@tallerviento.org",
                              "fuente_url": "https://tallerviento.org/contacto"},
            "valores_declarados": [{"texto": "El arte manda", "cita_url": "https://tallerviento.org/sobre"}],
            "proyectos": [{"nombre": "Barrios", "url": "https://tallerviento.org/proyectos"}],
            "fuentes": [{"url": "https://tallerviento.org/sobre", "fecha": "2026-10-01", "metodo": "lectura"}],
            "contenido_reciente": [], "resonancias": [], "avisos": [], "idioma": "es", "tono": "creativo"}


def propuesta(**extra):
    p = {"titulo": "Una idea para el taller",
         "cuerpo": "**Asunto:** Colaborar\n\nHola, somo StarSeed y nos gustaría proponeros una colaboración "
                   "tranquila para compartir herramientas de código abierto con vuestros proyectos de barrio.",
         "tipo": "contenido", "importancia": "baja", "referencias": ["https://tallerviento.org/proyectos"],
         "destino": {"objetivo": "obj-1", "medio": "correo", "asunto": "Colaborar"},
         "afirmaciones": [{"texto": "Hacen proyectos de barrio", "fuente_url": "https://tallerviento.org/proyectos"}]}
    p.update(extra)
    return p


def test_plan_acotado_y_rotacion():
    objs = [objetivo("obj-1", 300), objetivo("obj-2", 100), objetivo("obj-3", 50), objetivo("obj-4", 200)]
    estado = {"objetivos": {"obj-1": {"ultima": (AHORA - timedelta(days=2)).isoformat()}}}
    assert [o["id"] for o in P.elegir_objetivos(objs, estado, AHORA, tope=2, jev=False)] == ["obj-4", "obj-2"]
    viejo = {"objetivos": {"obj-1": {"ultima": (AHORA - timedelta(days=31)).isoformat()}}}
    assert P.elegir_objetivos(objs, viejo, AHORA, tope=1, jev=False)[0]["id"] == "obj-1"
    assert P.elegir_objetivos(objs, {}, AHORA, tope=0, jev=False) == []


def test_jev_callado_manda_la_regla():
    objs = [objetivo("obj-1", 100), objetivo("obj-2", 200)]
    assert [o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=False)] == ["obj-2", "obj-1"]


def test_jev_ordena_y_veta_solo_con_p_08():
    objs = [objetivo("obj-1", 300), objetivo("obj-2", 100), objetivo("obj-3", 50), objetivo("obj-4", 200)]
    def jev(estado, preguntas, quien=None):
        assert quien == "agente-alcance" and "orden" in preguntas
        return {"respuestas": {"orden": {"respuesta": "obj-3", "p": 0.9},
                               "veto1": {"respuesta": "sí", "p": 0.85}}}
    assert [o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=jev)] == ["obj-3", "obj-4"]
    flojo = lambda e, p, quien=None: {"respuestas": {"orden": {"respuesta": "obj-3", "p": 0.6},
                                                     "veto1": {"respuesta": "sí", "p": 0.6}}}
    assert [o["id"] for o in P.elegir_objetivos(objs, {}, AHORA, tope=2, jev=flojo)] == ["obj-1", "obj-4"]


def test_tarea_sin_direccion_y_en_formato_del_contrato():
    t = P.tarea_de(objetivo(), ficha(), "Somos StarSeed: buscamos desarrollo más profesional y seguro.", AHORA, 1)
    assert t["id"] == "ALC10291" and t["tipo"] == "analisis" and t["modo"] == "libre"
    assert (t["rol"], t["capacidad"], t["agente"], t["fuente"], t["ambito"]) == (
        "alcance", "alta", "alcance", "agentes", "metagenesis")
    assert t["salida"] == "starseed_memory_root/imaginacion/agentes/alcance-2026-10-29-1.json"
    assert "hola@tallerviento.org" not in t["prompt"] and "Taller de Viento" in t["prompt"]
    assert "R1" in t["prompt"] and '"propuestas"' in t["prompt"] and "≤ 220 palabras" in t["prompt"]
    assert len(t["prompt"]) <= P.MAX_PROMPT


def test_validacion_afirmacion_dominio_mensaje_y_correo():
    assert A.normalizar_salida({"propuestas": [propuesta()]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"]
    sin_fuente = propuesta(afirmaciones=[{"texto": "Hacen barrio", "fuente_url": "https://otro.example/x"}])
    assert A.normalizar_salida({"propuestas": [sin_fuente]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"] == []
    ajeno = propuesta(referencias=["https://evil.example/x"])
    assert A.normalizar_salida({"propuestas": [ajeno]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"] == []
    largo = propuesta(cuerpo="palabra " * 240)
    assert A.normalizar_salida({"propuestas": [largo]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"] == []
    correo = propuesta(destino={"objetivo": "obj-1", "medio": "correo", "asunto": "hola@evil.example"})
    assert A.normalizar_salida({"propuestas": [correo]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"] == []
    adjunto = propuesta(cuerpo="**Asunto:** Hola\n\nTe adjunto un archivo.")
    assert A.normalizar_salida({"propuestas": [adjunto]}, "2026-10-29", 1, AHORA, "obj-1", ficha())["propuestas"] == []


def test_fuerza_importancia_alta_y_estado_esperando_aprobacion():
    doc = A.normalizar_salida({"propuestas": [propuesta(importancia="baja", estado="nueva", tipo="contenido")]},
                              "2026-10-29", 2, AHORA, "obj-1", ficha())
    p = doc["propuestas"][0]
    assert p["importancia"] == "alta" and p["estado"] == "esperando-aprobacion" and p["tipo"] == "contenido"
    assert p["id"] == "agentes:alcance:2026-10-29-2-1" and p["destino"]["objetivo"] == "obj-1"
    assert p["referencias"][0]["url"] == "https://tallerviento.org/proyectos"
    assert doc["formato"] == "starseed-imaginacion-agentes" and doc["agente"] == "alcance"


def test_cola_con_prefijo_de_suenos(tmp_path):
    raiz = str(tmp_path / "repo")
    assert A.NOMBRE_COLA.startswith("cola-suenos-")
    t = P.tarea_de(objetivo(), ficha(), "carta", AHORA, 1)
    d = A.encargar_por_flota(raiz, [t], ahora=AHORA)
    assert d["accion"] == "cola_lista" and d["tareas"] == [t["id"]]
    cola = json.load(open(os.path.join(raiz, A.REL_OLAS, A.NOMBRE_COLA), encoding="utf-8"))
    assert [x["id"] for x in cola] == [t["id"]]
    assert "nunca lanza un orquestador" in d["mensaje"]


def test_carta_ausente_no_encarga_y_deja_propuesta(tmp_path):
    raiz = tmp_path / "repo"
    raiz.mkdir()
    home = tmp_path / "home"
    AO.escribir("objetivos", [objetivo()], home=str(home))
    r = A.ciclo(str(raiz), AHORA, encargar=False, jev=False, home=str(home))
    assert r["ok"] and r["motivo"] == "falta_carta" and r["tareas"] == []
    assert r["propuesta"] == "Falta la carta de StarSeed"
    assert not os.path.exists(os.path.join(str(raiz), A.REL_OLAS, A.NOMBRE_COLA))
    salidas = [n for n in os.listdir(os.path.join(str(raiz), P.REL_SALIDAS)) if n.startswith("alcance-")]
    assert len(salidas) == 1
    doc = json.load(open(os.path.join(str(raiz), P.REL_SALIDAS, salidas[0]), encoding="utf-8"))
    assert doc["propuestas"][0]["tipo"] == "otro" and doc["propuestas"][0]["titulo"] == "Falta la carta de StarSeed"


def test_ciclo_con_carta_elige_encarga_y_recoge(tmp_path):
    raiz = tmp_path / "repo"
    os.makedirs(raiz / "memory" / "alcance")
    (raiz / "memory" / "alcance" / "carta-starseed.md").write_text("Somos StarSeed.", encoding="utf-8")
    home = tmp_path / "home"
    AO.escribir("objetivos", [objetivo()], home=str(home))
    carpeta = os.path.join(str(home), ".starseed", "alcance", "fichas")
    os.makedirs(carpeta)
    with open(os.path.join(carpeta, "obj-1.json"), "w", encoding="utf-8") as f:
        json.dump(ficha(), f)
    encargos = []
    def encargar(raiz_, tareas, fecha=None, ahora=None):
        encargos.append([t["id"] for t in tareas])
        return {"ok": True, "accion": "cola_lista", "cola": A.NOMBRE_COLA, "mensaje": "lista"}
    r = A.ciclo(str(raiz), AHORA, encargar=encargar, jev=False, home=str(home))
    assert r["toca"] is True and [x["objetivo"] for x in r["tareas"]] == ["obj-1"] and encargos == [["ALC10291"]]
    estado = json.load(open(os.path.join(str(raiz), A.REL_ESTADO), encoding="utf-8"))
    assert estado["ciclos"] == 1 and "obj-1" in estado["objetivos"] and "Taller" not in json.dumps(estado)
    salida = os.path.join(str(raiz), P.REL_SALIDAS, "alcance-2026-10-29-1.json")
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    with open(salida, "w", encoding="utf-8") as f:
        json.dump({"propuestas": [propuesta(), propuesta(referencias=["https://evil.example/x"])]}, f)
    estado2 = A.cargar_estado(str(raiz))
    res = A.recoger_salidas(str(raiz), estado2, AHORA, home=str(home), fichas={"obj-1": ficha()})
    assert res == {"procesadas": 1, "validas": 1, "descartadas": 1}
    doc = json.load(open(salida, encoding="utf-8"))
    assert doc["propuestas"][0]["estado"] == "esperando-aprobacion"
    assert estado2["salidas"]["alcance-2026-10-29-1.json"]["descartadas"] == 1
