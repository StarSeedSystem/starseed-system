# -*- coding: utf-8 -*-
"""Pruebas de la rama libre del analista (Ola 1024I · IMG1024E): análisis libres del agente de referencias de
diseño (`modo: "libre"`) y reimaginaciones del director de autodesarrollo (`modo: "reimaginar"`).

Puras: un `llamar_llm` FALSO, el disco en una carpeta temporal y nada de red. Vigilan conducta: qué modelo se
elige para diseño, qué se escribe y dónde (solo en imaginacion/agentes/), que una salida sin el JSON pedido se
reintenta un número acotado de veces y luego falla con su motivo, que las referencias http se descartan y que
lo escrito lo entienden quienes lo recogen (el agente de referencias y la fuente «agentes» del director).
"""
import json
import os
import sys
from datetime import datetime, timezone

import pytest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
PUENTE = os.path.join(os.path.dirname(DIRECTORIO), "puente")
for _d in (DIRECTORIO, PUENTE):
    if _d not in sys.path:
        sys.path.insert(0, _d)

import analista as A  # noqa: E402
import agente_referencias_diseno as R  # noqa: E402
import autodesarrollo_fuentes as AF  # noqa: E402
import autodesarrollo_reimaginar as AR  # noqa: E402

AHORA = datetime(2026, 10, 24, 8, 0, tzinfo=timezone.utc)
SALIDA = "starseed_memory_root/imaginacion/agentes/referencias-diseno-2026-10-24-1.json"
FLOTA = {
    "sintesis": [
        ("llm7", "gpt-oss"),                                   # rápido: fuera con capacidad alta
        ("nim", "moonshotai/kimi-k3"),
        ("xkiro", "qwen/qwen3.8-max:free"),
        ("tokenrouter", "z-ai/glm-5.3-free"),
        ("openrouter", "nvidia/nemotron-3-super-120b-a12b:free"),  # rápido: fuera con capacidad alta
    ],
    "mapa": [("llm7", "gpt-oss")], "contraste": [("llm7", "gpt-oss")],
}
RESPUESTA = {"propuestas": [
    {"tipo": "diseno", "titulo": "Bordes de cristal con ritmo φ en Genesis",
     "cuerpo": "## Qué\nUn borde **líquido**…\n\n- variación sobria\n- variación expresiva",
     "referencias": [{"titulo": "Galería", "url": "https://galeria.example/a"},
                     {"titulo": "Inseguro", "url": "http://inseguro.example/b"},
                     "javascript:alert(1)", "https://galeria.example/a"],
     "archivos": ["src/components/mando/pulso.tsx", "../fuera.ts", "/etc/passwd"],
     "utilidad": 0.8, "importancia": "media"},
    {"tipo": "contenido", "titulo": "Intro de canal con el look de la casa", "cuerpo": "Guion en tres tiempos.",
     "referencias": ["https://video.example/x"], "importancia": "ALTA"},
]}


class Llm(object):
    """`llamar_llm` falso: devuelve las respuestas en orden (texto o excepción) y luego la última."""

    def __init__(self, *respuestas):
        self.respuestas = list(respuestas) or [json.dumps(RESPUESTA)]
        self.llamadas = []

    def __call__(self, prov, modelo, prompt, timeout=120, max_tokens=2500, json_mode=False):
        self.llamadas.append({"prov": prov, "modelo": modelo, "prompt": prompt, "json_mode": json_mode})
        r = self.respuestas.pop(0) if len(self.respuestas) > 1 else self.respuestas[0]
        if isinstance(r, Exception):
            raise r
        return r


class Contexto(object):
    def __init__(self):
        self.pedidos = []

    def __call__(self, rol=None, area=None, tarea="", max_chars=1400, excluir=()):
        self.pedidos.append({"rol": rol, "area": area, "excluir": tuple(excluir), "max_chars": max_chars})
        return "# Contexto común · rol %s\n- regla de prueba del rol %s" % (rol, rol)


def tarea_libre(**extra):
    t = {"id": "IRD10241", "tipo": "analisis", "modo": "libre", "rol": "diseno", "capacidad": "alta",
         "agente": "referencias-diseno", "fuente": "agentes", "contexto": "adn:genesis", "ambito": "metagenesis",
         "sesion": "2026-10-24", "titulo": "Referencias de diseño · Genesis", "salida": SALIDA,
         "formato_salida": "starseed-imaginacion-agentes/1", "prompt": "ENCARGO DE DIRECTOR DE ARTE: estudia Genesis.",
         "depende": []}
    t.update(extra)
    return t


class Corrida(object):
    def __init__(self, raiz):
        self.raiz = str(raiz)
        self.estados, self.eventos, self.log, self.dormidas = [], [], [], []
        self.reloj = [1000.0]

    def dormir(self, s):
        self.dormidas.append(s)
        self.reloj[0] += s

    def __call__(self, t, llm, **kw):
        kw.setdefault("flota", FLOTA)
        kw.setdefault("salud", A.SaludFlota())
        kw.setdefault("notas_diseno", {})
        return A.ejecutar(
            t, llm,
            evento=lambda tipo, tid, texto, datos=None: self.eventos.append((tipo, tid, texto, datos or {})),
            set_estado=lambda tid, **k: self.estados.append(dict(k, tid=tid)),
            latir=lambda *a, **k: None, raiz=self.raiz, log=self.log.append, dormir=self.dormir,
            reloj=lambda: self.reloj[0], espera_proveedor_s=120, **kw)

    def ruta(self, rel=SALIDA):
        return os.path.join(self.raiz, rel)

    def leer(self, rel=SALIDA):
        with open(self.ruta(rel), encoding="utf-8") as f:
            return json.load(f)


@pytest.fixture
def corrida(tmp_path):
    return Corrida(tmp_path)


# ─────────────────────────────── camino feliz del análisis libre ───────────────────────────────

def test_libre_escribe_su_salida_en_el_formato_del_contrato(corrida):
    llm, ctx = Llm(), Contexto()
    doc = corrida(tarea_libre(), llm, contexto=ctx)
    assert doc is not None and len(llm.llamadas) == 1                   # UNA llamada de síntesis
    assert corrida.estados[0]["estado"] == "en_curso" and corrida.estados[-1]["estado"] == "informe"
    assert corrida.estados[-1]["propuestas"] == 2 and corrida.estados[-1]["informe"] == SALIDA
    assert [e[0] for e in corrida.eventos] == ["inicio", "informe"]
    escrito = corrida.leer()
    assert escrito == doc
    assert (escrito["formato"], escrito["version"], escrito["fuente"], escrito["agente"], escrito["tarea"]) == (
        "starseed-imaginacion-agentes", 1, "agentes", "referencias-diseno", "IRD10241")
    p1, p2 = escrito["propuestas"]
    assert p1["id"] == "agentes:referencias-diseno:2026-10-24-1-1" and p2["id"].endswith("-1-2")
    assert p1["tipo"] == "diseno" and p2["tipo"] == "contenido" and p2["importancia"] == "alta"
    assert p1["cuerpo"].startswith("## Qué") and "**líquido**" in p1["cuerpo"]   # formato libre, intacto
    assert p1["archivos"] == ["src/components/mando/pulso.tsx"]
    assert not os.path.exists(corrida.ruta() + ".%d.tmp" % os.getpid())           # escritura atómica


def test_referencias_http_y_no_https_se_descartan(corrida):
    corrida(tarea_libre(), Llm(), contexto=Contexto())
    refs = corrida.leer()["propuestas"][0]["referencias"]
    assert refs == [{"titulo": "Galería", "url": "https://galeria.example/a"}]        # sin http, sin js, sin repetir
    assert A.referencias_https(["http://a.example", {"url": "ftp://b"}, {"url": "https://c.example/ x"},
                                {"url": "https://d.example/"}]) == [{"titulo": "d.example/", "url": "https://d.example/"}]


def test_lo_recogen_el_agente_de_referencias_y_la_fuente_agentes(corrida):
    corrida(tarea_libre(), Llm(), contexto=Contexto())
    escrito = corrida.leer()
    doc = R.normalizar_salida(escrito, "2026-10-24", 1, AHORA)
    # mismos ids que les pondría su agente: recogerlo antes o después de normalizar no duplica nada
    assert [p["id"] for p in doc["propuestas"]] == [p["id"] for p in escrito["propuestas"]]
    assert doc["tarea"] == "IRD10241" and doc["contexto"] == "adn:genesis"
    nuevas = AF.de_agentes({os.path.basename(SALIDA): escrito}, "2026-10-24")
    assert [p["titulo"] for p in nuevas] == [p["titulo"] for p in escrito["propuestas"]]
    assert all(p["fuente"] == "agentes" and p["agente"] == "referencias-diseno" for p in nuevas)
    assert {p["id"] for p in nuevas} == {p["id"] for p in AF.de_agentes({os.path.basename(SALIDA): doc}, "2026-10-24")}


def test_una_tarea_real_del_agente_de_referencias(corrida):
    contexto = {"id": "adn:genesis", "tipo": "adn", "nombre": "Genesis", "que": "Instrumento de cristal",
                "estado": "activo", "archivos": ["memory/diseno/adn/genesis/dna.json"], "palabras": ["cristal"],
                "temas": ["marca"], "identidad": "genesis", "ambito": "metagenesis", "adn": "Alma: cristal operativo."}
    refs = [{"id": "galeria", "nombre": "Galería", "url": "https://galeria.example/", "tema": "marca",
             "clase_uso": "solo-referencia", "modo": "cita", "por_que": "ritmo"}]
    t = R.tarea_de(contexto, refs, "2026-10-24", 1, AHORA, contexto_comun="")
    llm, ctx = Llm(), Contexto()
    assert corrida(t, llm, contexto=ctx) is not None
    assert corrida.leer()["propuestas"] and t["prompt"] in llm.llamadas[0]["prompt"]
    assert ctx.pedidos[0]["rol"] == "investigador-diseno"
    with open(A.__file__, encoding="utf-8") as f:
        assert "def %s(" % R.MARCA_ANALISIS_LIBRE in f.read()                    # la marca es la función de verdad
    assert R.analista_libre_instalado(A.__file__)[0] is True                     # la marca que detecta IMG1024D


def test_contexto_del_rol_y_sin_duplicarlo(corrida):
    llm, ctx = Llm(), Contexto()
    corrida(tarea_libre(), llm, contexto=ctx)
    prompt = llm.llamadas[0]["prompt"]
    assert ctx.pedidos[0]["rol"] == "investigador-diseno" and "herramientas" in ctx.pedidos[0]["excluir"]
    assert prompt.index("Contexto común · rol investigador-diseno") < prompt.index("ENCARGO DE DIRECTOR DE ARTE")
    assert llm.llamadas[0]["json_mode"] is True
    # sin rol de diseño, el contexto del analista
    otra, ctx2 = Corrida(corrida.raiz + "-b"), Contexto()
    otra(tarea_libre(rol=None, id="LIB1"), Llm(), contexto=ctx2)
    assert ctx2.pedidos[0]["rol"] == "analista"
    # si el encargo ya trae el contexto común del rol (el agente lo mete en sus reglas), no se repite
    ctx3 = Contexto()
    llm3 = Llm()
    Corrida(corrida.raiz + "-c")(tarea_libre(prompt="# Contexto común · rol investigador-diseno\nreglas\n\nENCARGO"),
                                 llm3, contexto=ctx3)
    assert ctx3.pedidos == [] and llm3.llamadas[0]["prompt"].count("Contexto común · rol") == 1


def test_un_contexto_que_no_admite_excluir_no_rompe(corrida):
    def viejo(**kw):  # la lambda de un orquestador anterior: fija `excluir` y no deja pasar otro
        if "excluir" in kw:
            raise TypeError("got multiple values for keyword argument 'excluir'")
        return "# Contexto común · rol %s" % kw["rol"]
    llm = Llm()
    assert corrida(tarea_libre(), llm, contexto=viejo) is not None
    assert "Contexto común · rol investigador-diseno" in llm.llamadas[0]["prompt"]


def test_nunca_manda_una_clave_a_un_modelo(corrida):
    llm = Llm()
    corrida(tarea_libre(prompt="Encargo con sk-abcdefghijklmnopqrstuvwxyz0123 por error"), llm, contexto=Contexto())
    assert "sk-abcdefghijklmnopqrstuvwxyz0123" not in llm.llamadas[0]["prompt"]
    assert "[REDACTADO]" in llm.llamadas[0]["prompt"]


# ─────────────────────────────── qué modelo para diseño ───────────────────────────────

def test_capacidad_alta_solo_capaces_y_sin_notas_el_orden_de_siempre():
    pares, motivo, por_notas = A.flota_libre(tarea_libre(), FLOTA, {})
    assert pares == [("nim", "moonshotai/kimi-k3"), ("xkiro", "qwen/qwen3.8-max:free"), ("tokenrouter", "z-ai/glm-5.3-free")]
    assert not por_notas and "orden capaz de siempre" in motivo
    todos, _, _ = A.flota_libre(tarea_libre(capacidad=None, rol=None), FLOTA, {})
    assert todos == FLOTA["sintesis"]
    # sin flota viva, la fija (y solo sus capaces)
    fija, _, _ = A.flota_libre(tarea_libre(), None, {})
    assert fija and all(A._CAPAZ.search(m) for _, m in fija)


def test_diseno_prefiere_lo_que_mejor_puntua_el_director_de_diseno(corrida):
    pesos = {"nvidia/moonshotai/kimi-k3": {"suma": 120, "n": 2},          # 60/100: por debajo del umbral
             "xkiro/qwen/qwen3.8-max:free": {"suma": 180, "n": 2},        # 90/100
             "?": {"suma": 100, "n": 1}}
    notas = A.notas_diseno_por_modelo(pesos)
    assert notas == {"kimi-k3": 60.0, "qwen3.8-max": 90.0}
    pares, motivo, por_notas = A.flota_libre(tarea_libre(), FLOTA, notas)
    assert pares == [("xkiro", "qwen/qwen3.8-max:free"), ("tokenrouter", "z-ai/glm-5.3-free"), ("nim", "moonshotai/kimi-k3")]
    assert por_notas and "qwen3.8-max 90/100" in motivo
    llm, salud = Llm(), A.SaludFlota()
    salud.usar("xkiro", "qwen/qwen3.8-max:free", 999.0)   # por turnos iría al final: las notas mandan
    corrida(tarea_libre(), llm, contexto=Contexto(), notas_diseno=notas, rotar=True, salud=salud)
    assert (llm.llamadas[0]["prov"], llm.llamadas[0]["modelo"]) == ("xkiro", "qwen/qwen3.8-max:free")
    # sin notas que casen, el reparto por turnos de siempre sí lo manda al final
    llm2, salud2 = Llm(), A.SaludFlota()
    salud2.usar("nim", "moonshotai/kimi-k3", 999.0)
    Corrida(corrida.raiz + "-b")(tarea_libre(), llm2, contexto=Contexto(), notas_diseno={}, rotar=True, salud=salud2)
    assert llm2.llamadas[0]["prov"] != "nim"
    # la recomendación publicada (medias) vale igual
    assert A.notas_diseno_por_modelo({"orden": [], "medias": {"xkiro/qwen/qwen3.8-max:free": 88}}) == {"qwen3.8-max": 88.0}


def test_un_429_releva_al_siguiente_capaz(corrida):
    llm = Llm(RuntimeError("HTTP Error 429: Too Many Requests"), json.dumps(RESPUESTA))
    assert corrida(tarea_libre(), llm, contexto=Contexto()) is not None
    assert [c["prov"] for c in llm.llamadas] == ["nim", "xkiro"]
    assert all(A._CAPAZ.search(c["modelo"]) for c in llm.llamadas)


def test_cargar_notas_de_disco(tmp_path):
    vacio = tmp_path / "no-existe.json"
    pesos = tmp_path / "pesos.json"
    pesos.write_text(json.dumps({"nvidia/moonshotai/kimi-k3": {"suma": 160, "n": 2}}), encoding="utf-8")
    assert A.cargar_notas_diseno((str(vacio), str(pesos))) == {"kimi-k3": 80.0}
    assert A.cargar_notas_diseno((str(vacio),)) == {}


# ─────────────────────────────── salida mala: reintento acotado y fallo honesto ───────────────────────────────

def test_salida_no_json_reintenta_acotado_y_falla_con_su_motivo(corrida):
    llm = Llm("Claro, aquí van mis ideas: bordes de cristal y más ritmo.")
    assert corrida(tarea_libre(), llm, contexto=Contexto()) is None
    assert len(llm.llamadas) == A.MAX_MALAS_FORMAS == 3
    assert corrida.estados[-1]["estado"] == "fallo" and "JSON pedido" in corrida.estados[-1]["nota"]
    assert corrida.eventos[-1][0] == "fallo"
    assert not os.path.exists(corrida.ruta())
    reclamos = os.path.join(corrida.raiz, "starseed_memory_root", "dream", "profundo", "2026-10-24", ".reclamos")
    assert os.listdir(reclamos) == []


def test_una_mala_y_luego_buena(corrida):
    llm = Llm("no es json", json.dumps(RESPUESTA))
    assert corrida(tarea_libre(), llm, contexto=Contexto()) is not None
    assert len(llm.llamadas) == 2 and corrida.estados[-1]["estado"] == "informe"


def test_propuestas_sin_titulo_no_valen_y_la_lista_vacia_si(corrida):
    llm = Llm(json.dumps({"propuestas": [{"cuerpo": "sin título"}]}), json.dumps({"propuestas": []}))
    doc = corrida(tarea_libre(), llm, contexto=Contexto())
    assert doc is not None and doc["propuestas"] == [] and len(llm.llamadas) == 2
    assert corrida.estados[-1]["estado"] == "informe" and corrida.estados[-1]["propuestas"] == 0


def test_sin_proveedores_es_fallo(corrida):
    def sin_clave(prov, modelo, prompt, timeout=120, max_tokens=2500):
        raise RuntimeError("sin clave " + prov)
    assert corrida(tarea_libre(), sin_clave, contexto=Contexto()) is None
    assert corrida.estados[-1]["estado"] == "fallo" and corrida.eventos[-1][0] == "fallo"


# ─────────────────────────────── la ruta de salida ───────────────────────────────

@pytest.mark.parametrize("salida", [
    None, "", "../fuera.json", "/etc/agentes.json", "~/x.json", "starseed_memory_root/imaginacion/propuestas.json",
    "starseed_memory_root/imaginacion/agentes/sub/x.json", "starseed_memory_root/imaginacion/agentes/x.txt",
    "starseed_memory_root/imaginacion/agentes/.oculto.json", "starseed_memory_root/imaginacion/agentes/../../x.json",
    "src/lib/x.json",
])
def test_salida_fuera_de_su_carpeta_se_rechaza_sin_llamar(corrida, salida):
    llm = Llm()
    assert corrida(tarea_libre(salida=salida), llm, contexto=Contexto()) is None
    assert llm.llamadas == []
    assert corrida.estados[-1]["estado"] == "fallo" and "salida no permitida" in corrida.estados[-1]["nota"]
    assert "/etc" not in corrida.estados[-1]["nota"]                         # nunca la ruta en el mensaje


def test_un_enlace_que_saca_la_salida_se_rechaza(corrida, tmp_path):
    carpeta = os.path.join(corrida.raiz, "starseed_memory_root", "imaginacion", "agentes")
    os.makedirs(carpeta)
    fuera = tmp_path / "fuera.json"
    fuera.write_text("{}", encoding="utf-8")
    os.symlink(str(fuera), os.path.join(carpeta, "enlace.json"))
    llm = Llm()
    assert corrida(tarea_libre(salida="starseed_memory_root/imaginacion/agentes/enlace.json"), llm) is None
    assert llm.llamadas == [] and fuera.read_text(encoding="utf-8") == "{}"
    assert A.ruta_salida_segura(corrida.raiz, "./" + SALIDA)[1] == SALIDA


def test_la_salida_ya_hecha_no_se_repite_y_la_ajena_no_se_pisa(corrida):
    corrida(tarea_libre(), Llm(), contexto=Contexto())
    llm = Llm()
    corrida(tarea_libre(), llm, contexto=Contexto())
    assert llm.llamadas == [] and "ya estaba" in corrida.estados[-1]["nota"]
    ajena = Llm()
    corrida(tarea_libre(id="IRD10249"), ajena, contexto=Contexto())
    assert ajena.llamadas == [] and corrida.estados[-1]["estado"] == "fallo"
    assert corrida.leer()["tarea"] == "IRD10241"


def test_sin_encargo_es_fallo(corrida):
    llm = Llm()
    assert corrida(tarea_libre(prompt=""), llm) is None
    assert llm.llamadas == [] and "sin encargo" in corrida.estados[-1]["nota"]


# ─────────────────────────────── reimaginar ───────────────────────────────

def propuesta_reimaginando(tipo="diseno"):
    p = {"id": "agentes:referencias-diseno:2026-10-20-1-1", "fuente": "agentes", "agente": "referencias-diseno",
         "tipo": tipo, "ambito": "metagenesis", "titulo": "Bordes de cristal", "cuerpo": "Versión 1 del borde.",
         "referencias": [{"titulo": "Galería", "url": "https://galeria.example/a"}], "archivos": [],
         "version": 1, "estado": "nueva"}
    return AR.pedir(p, "Más contraste y menos brillo", [{"titulo": "Otra", "url": "https://otra.example/"}],
                    "alex", AHORA.isoformat())


def test_reimaginar_escribe_una_lista_con_una_y_la_recoge_la_fuente(corrida):
    p = propuesta_reimaginando()
    t = AR.tarea(p, AHORA)
    AR.marcar_encolada(p, t, "cola-suenos-reimaginar-2026-10-24.json", AHORA.isoformat())
    dos = {"propuestas": [{"titulo": "Bordes de cristal v2", "cuerpo": "Con más contraste.", "tipo": "diseno",
                           "referencias": ["http://no.example", "https://otra.example/"]},
                          {"titulo": "Otra idea", "cuerpo": "sobra"}]}
    llm, ctx = Llm(json.dumps(dos)), Contexto()
    doc = corrida(t, llm, contexto=ctx)
    assert isinstance(doc, list) and len(doc) == 1
    escrito = corrida.leer(t["salida"])
    assert escrito == doc and escrito[0]["titulo"] == "Bordes de cristal v2"
    assert escrito[0]["version_de"] == p["id"] and escrito[0]["version"] == 2
    assert escrito[0]["referencias"] == [{"titulo": "otra.example/", "url": "https://otra.example/"}]
    assert ctx.pedidos[0]["rol"] == "investigador-diseno" and "salida" in ctx.pedidos[0]["excluir"]
    assert "Más contraste y menos brillo" in llm.llamadas[0]["prompt"]
    nuevas = AF.de_agentes({os.path.basename(t["salida"]): escrito}, "2026-10-24", (), AR.esperadas([p]))
    assert len(nuevas) == 1 and nuevas[0]["version_de"] == p["id"] and nuevas[0]["version"] == 2


def test_reimaginar_acepta_la_lista_suelta_y_la_propuesta_sola(corrida):
    p = propuesta_reimaginando("codigo")
    t = AR.tarea(p, AHORA)
    sola = 'Aquí está:\n```json\n{"titulo": "Versión nueva", "cuerpo": "Mejor", "referencias": [{"titulo": "R", "url": "https://r.example"}]}\n```'
    assert corrida(t, Llm(sola), contexto=Contexto())[0]["titulo"] == "Versión nueva"
    assert A.leer_propuestas('[{"titulo": "A", "cuerpo": "x"}]') == [{"titulo": "A", "cuerpo": "x"}]


def test_reimaginar_vacia_no_vale(corrida):
    t = AR.tarea(propuesta_reimaginando(), AHORA)
    llm = Llm("[]")
    assert corrida(t, llm, contexto=Contexto()) is None
    assert len(llm.llamadas) == A.MAX_MALAS_FORMAS and not os.path.exists(corrida.ruta(t["salida"]))


def test_reimaginar_sin_prompt_lo_construye_y_lleva_sus_lecturas(corrida):
    os.makedirs(os.path.join(corrida.raiz, "memory", "diseno"))
    with open(os.path.join(corrida.raiz, "memory", "diseno", "identidades.md"), "w", encoding="utf-8") as f:
        f.write("# Identidades\nGenesis: cristal operativo.\n")
    with open(os.path.join(corrida.raiz, ".env"), "w", encoding="utf-8") as f:
        f.write("CLAVE=no-debe-salir\n")
    t = AR.tarea(propuesta_reimaginando(), AHORA)
    t.pop("prompt")
    t["lecturas"] = ["memory/diseno/identidades.md", ".env", "memory/diseno/no-existe.md"]
    llm = Llm(json.dumps([{"titulo": "v2", "cuerpo": "c"}]))
    assert corrida(t, llm, contexto=Contexto()) is not None
    prompt = llm.llamadas[0]["prompt"]
    for trozo in ("Bordes de cristal", "Más contraste y menos brillo", "https://otra.example/", "cristal operativo",
                  "UNA sola propuesta"):
        assert trozo in prompt
    assert "no-debe-salir" not in prompt


# ─────────────────────────────── respuestas raras ───────────────────────────────

def test_una_propuesta_cortada_no_confunde_sus_referencias_con_la_lista():
    cortada = ('{"propuestas": [{"titulo": "A", "cuerpo": "x", "tipo": "diseno"}, {"titulo": "B", "cuerpo": "y", '
               '"referencias": [{"titulo": "R", "url": "https://r.example"}], "archivos": ["src/a.ts"')
    assert [p["titulo"] for p in A.leer_propuestas(cortada)] == ["A"]
    lista_cortada = '[{"titulo": "B", "cuerpo": "y", "referencias": [{"titulo": "R", "url": "https://r.example"}], "arch'
    assert A.leer_propuestas(lista_cortada) is None
    assert A.leer_propuestas('<think>{"x": 1}</think>{"resultado": {"titulo": "T", "cuerpo": "c"}}') == [
        {"titulo": "T", "cuerpo": "c"}]
    assert A.leer_propuestas("nada por aquí") is None and A.leer_propuestas("") is None


# ─────────────────────────────── lo de siempre no cambia ───────────────────────────────

def test_area_por_lente_sigue_igual(corrida):
    llm = Llm()
    assert corrida({"id": "SA1", "tipo": "analisis", "modo": "otro", "area": "voz", "lente": "no-existe"}, llm) is None
    assert llm.llamadas == [] and "lente desconocida" in corrida.estados[-1]["nota"]
    assert not A.es_analisis_libre({"tipo": "analisis", "area": "voz", "lente": "rendimiento-consumo"})
    assert A.es_analisis_libre({"tipo": "analisis", "modo": "Libre"}) and not A.es_analisis_libre({"modo": "libre"})


def test_el_orquestador_deja_pedir_secciones_fuera_del_contexto():
    import importlib.util
    espec = importlib.util.spec_from_file_location("enjambre_libre", os.path.join(DIRECTORIO, "starseed-enjambre.py"))
    E = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(E)
    llamado = {}
    viejo = E._analista.ejecutar
    try:
        E._analista.ejecutar = lambda t, llamar, **kw: llamado.update(kw=kw) or {"id": t["id"]}
        E.ejecutar({"id": "IRD10241", "tipo": "analisis", "modo": "libre", "salida": SALIDA, "prompt": "x"})
    finally:
        E._analista.ejecutar = viejo
    texto = llamado["kw"]["contexto"](rol="investigador-diseno", area=None, tarea="", max_chars=1800,
                                      excluir=("salida",))
    assert "Contexto común · rol investigador-diseno" in texto and "Salida esperada" not in texto
    assert "Herramientas (orden exacta)" not in texto
