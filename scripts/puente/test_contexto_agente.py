# -*- coding: utf-8 -*-
"""Pruebas del contexto común de los agentes (contexto_agente.py): lo que carga cada rol, el
tope de tamaño, el área (dada o deducida de la tarea), el relevo, la honestidad de las
herramientas y que nunca salga una clave. Más la prueba de deriva contra el repositorio."""
import io
import json
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
sys.path.insert(0, DIRECTORIO)

import contexto_agente as C  # noqa: E402

AREAS_TS = '''
export const AREAS_TRABAJO: AreaTrabajo[] = [
    {
        id: "voz",
        nombre: "Voz",
        descripcion:
            "Voces y el daemon de voz local.",
        color: "cyan",
        rutas: [{ etiqueta: "Voces", href: "/voces" }],
        documentos: ["memory/estudio-voces.md", "no/existe.md"],
        olas: ["149"],
    },
];
'''
EXTRAS = [{"id": "mando", "nombre": "Genesis", "descripcion": "Genesis.", "documentos": ["memory/orquestacion-economica.md"]}]
RAICES = {"voz": ["src/lib/voces", "native/astraura-voice"], "mando": ["src/lib/mando", "scripts/puente"]}


def mundo(archivos):
    """leer/existe sobre un diccionario {ruta: texto}."""
    return (lambda r: archivos.get(r)), (lambda r: r in archivos or any(k.startswith(r + "/") for k in archivos))


BASE = {
    C.AREAS_TS: AREAS_TS,
    "memory/estudio-voces.md": "x",
    "memory/orquestacion-economica.md": "x",
    "scripts/puente/decidir.py": "x",
    "scripts/puente/contexto_agente.py": "x",
    "scripts/puente/suenos.py": "x",
    "scripts/puente/latido_externo.py": "x",
    "scripts/puente/puente.py": "x",
    "src/lib/voces/a.ts": "x",
    "src/lib/mando/b.ts": "x",
}


def construir(rol, **kw):
    archivos = dict(BASE)
    archivos.update(kw.pop("archivos", {}))
    leer, existe = mundo(archivos)
    return C.construir(rol, leer=leer, existe=existe, extras=EXTRAS, raices=RAICES, **kw)


class Roles(unittest.TestCase):
    def test_cada_rol_lleva_reglas_y_el_protocolo_de_jev(self):
        for rol in C.ROLES:
            d = construir(rol, area="voz")
            self.assertIn("## Reglas permanentes", d["texto"], rol)
            self.assertIn("protocolo Jev", d["texto"], rol)
            self.assertIn("Jev es consejero", d["texto"], rol)
            self.assertLessEqual(d["caracteres"], C.MAX_POR_DEFECTO)

    def test_las_herramientas_dependen_del_rol(self):
        sup = construir("supervisor")["texto"]
        esc = construir("escritor")["texto"]
        self.assertIn("scripts/puente/suenos.py estado", sup)
        self.assertIn("hermes send -t telegram:Maggasukha", sup)
        self.assertNotIn("suenos.py", esc)
        self.assertIn("decidir.py si-no", esc)
        self.assertIn("gitnexus context", esc)
        self.assertIn("vi.mock", esc)          # regla de tests solo para quien escribe
        self.assertNotIn("vi.mock", sup)
        self.assertIn("Bloqueante SOLO", construir("revisor")["texto"])

    def test_no_se_ofrece_una_herramienta_que_no_esta(self):
        leer, existe = mundo({C.AREAS_TS: AREAS_TS})
        d = C.construir("supervisor", leer=leer, existe=existe, extras=[], raices={})
        self.assertNotIn("decidir.py si-no", d["texto"])
        self.assertIn("starseed-fuentes buscar", d["texto"])  # las de la Mac se ofrecen marcadas (Mac)

    def test_rol_desconocido(self):
        with self.assertRaises(ValueError):
            construir("oraculo")


class Area(unittest.TestCase):
    def test_area_de_areas_ts_con_documentos_rutas_y_codigo_reales(self):
        t = construir("escritor", area="voz")["texto"]
        self.assertIn("## Tu área: Voz (`voz`)", t)
        self.assertIn("`memory/estudio-voces.md`", t)
        self.assertNotIn("no/existe.md", t)      # solo documentos que existen
        self.assertIn("/voces", t)
        self.assertIn("`src/lib/voces`", t)
        self.assertNotIn("native/astraura-voice", t)

    def test_area_extra_y_desconocida(self):
        self.assertIn("Genesis", construir("analista", area="mando")["texto"])
        self.assertIn("«nada» no está", construir("analista", area="nada")["texto"])

    def test_el_area_se_deduce_de_la_tarea(self):
        d = construir("escritor", tarea="Arregla src/lib/mando/colas.ts y su prueba")
        self.assertEqual(d["area"], "mando")
        self.assertIn("TAREA: Arregla src/lib/mando/colas.ts", d["texto"])


class Tamano(unittest.TestCase):
    def test_tope_y_modo_compacto(self):
        grande = construir("supervisor", area="voz")
        chico = construir("supervisor", area="voz", max_chars=1500)
        self.assertLessEqual(chico["caracteres"], 1500)
        self.assertTrue(chico["compacto"])
        self.assertNotIn("_(CLAUDE.md", chico["texto"])  # sin fuentes en compacto
        self.assertIn("_(CLAUDE.md", grande["texto"])
        self.assertTrue(chico["recortadas"])

    def test_excluir_secciones(self):
        d = construir("escritor", area="voz", excluir=("area", "herramientas"))
        self.assertEqual(d["secciones"], ["reglas", "protocolo"])


class Relevo(unittest.TestCase):
    def test_relevo_si_existe_y_sin_claves(self):
        relevo = "# Relevo\nÚltima nota: sigue la ola 384 con sk-" + "b" * 30 + "\n## Proyecto\nno sale"
        d = construir("subagente", archivos={C.RELEVO: relevo})
        self.assertIn("## Dónde vamos (relevo)", d["texto"])
        self.assertIn("ola 384", d["texto"])
        self.assertNotIn("no sale", d["texto"])
        self.assertNotIn("sk-bbbb", d["texto"])
        self.assertNotIn("relevo", construir("subagente")["secciones"])


class Cli(unittest.TestCase):
    def test_json_sobre_el_repo_real(self):
        out = io.StringIO()
        self.assertEqual(C.main(["--rol", "supervisor", "--area", "mando", "--json"], salida=out), 0)
        d = json.loads(out.getvalue())
        self.assertEqual((d["rol"], d["area"]), ("supervisor", "mando"))
        self.assertIn("decidir.py", d["texto"])
        self.assertLessEqual(d["caracteres"], C.MAX_POR_DEFECTO)

    def test_atajo_texto_nunca_lanza(self):
        self.assertEqual(C.texto("escritor", raiz="/no/existe")[:18], "# Contexto común ·")


class Diseno(unittest.TestCase):
    """Las reglas de diseño solo entran en tareas de interfaz (director-diseno.md §6)."""

    def test_escritor_con_tarea_tsx_lleva_reglas_de_diseno(self):
        t = construir("escritor", tarea="Toca src/components/mando/panel.tsx")["texto"]
        self.assertIn("tokens antes que hex", t)
        self.assertIn("Fibonacci", t)
        self.assertIn("motion", t)
        self.assertIn("matriz de pantallas", t)

    def test_tarea_py_no_lleva_reglas_de_diseno(self):
        t = construir("escritor", tarea="Arregla scripts/puente/colas.py")["texto"]
        self.assertNotIn("tokens antes que hex", t)
        self.assertNotIn("matriz de pantallas", t)

    def test_otros_roles_no_llevan_reglas_de_diseno(self):
        t = construir("supervisor", tarea="Revisa src/app/panel.tsx")["texto"]
        self.assertNotIn("tokens antes que hex", t)

    def test_revisor_con_900_recibe_reglas_recortadas_sin_romper(self):
        d = construir("revisor", tarea="Revisa src/components/mando/panel.tsx", max_chars=900)
        self.assertLessEqual(d["caracteres"], 900)
        self.assertIn("## Reglas permanentes", d["texto"])
        self.assertIn("reglas", d["secciones"] + d["recortadas"])

    def test_es_interfaz(self):
        self.assertTrue(C._es_interfaz("Nuevo widget en src/a/b.tsx"))
        self.assertTrue(C._es_interfaz("Icono de la app"))
        self.assertFalse(C._es_interfaz("Migra la tabla relevo_eventos"))
        self.assertFalse(C._es_interfaz(""))


class Deriva(unittest.TestCase):
    """Ninguna regla habla en nombre de un documento que ya no existe."""

    def test_las_fuentes_y_los_guiones_existen(self):
        for _id, _roles, _regla, fuente in list(C.REGLAS) + list(C.REGLAS_DISENO):
            self.assertTrue(os.path.exists(os.path.join(RAIZ, C._ruta_de_fuente(fuente))), fuente)
        for _id, _roles, _orden, _para, archivo in C.HERRAMIENTAS:
            if archivo:
                self.assertTrue(os.path.exists(os.path.join(RAIZ, archivo)), archivo)
        self.assertTrue(os.path.exists(os.path.join(RAIZ, C.AREAS_TS)))


if __name__ == "__main__":
    unittest.main()


class Nube(unittest.TestCase):
    """(OC1010) Oracle medido entra en el contexto de supervisores y subagentes, no en el de escritores."""

    ORACLE = {"leido": "2026-10-10T01:00:00Z", "region": "mx-queretaro-1",
              "gasto": {"mes": 0.0, "previsto": 0.0, "presupuesto": 1.0, "moneda": "MXN"},
              "computo": {"a1_nombre": "starseed-a1", "a1_estado": "RUNNING"},
              "margen": {"apto": True, "motivo": "hay margen gratis: 99,5 % de CPU y 11,4 GB libres"},
              "freno": {"activo": False},
              "reclamacion": {"riesgo": True, "maquinas": [{"nombre": "starseed-a1", "riesgo": True, "cpu_p95": 0.5,
                                                             "mem_p95": 5.3, "reclamable_desde": "2026-10-14T23:00:00Z"}]}}

    def test_supervisor_recibe_margen_gasto_y_riesgo(self):
        d = construir("supervisor", oracle=self.ORACLE)
        self.assertIn("nube", d["secciones"])
        self.assertIn("## Oracle Cloud", d["texto"])
        self.assertIn("hay margen gratis", d["texto"])
        self.assertIn("2026-10-14", d["texto"])

    def test_freno_si_el_gasto_pasa_de_cero(self):
        o = dict(self.ORACLE, freno={"activo": True}, margen={"apto": False, "motivo": "freno"})
        self.assertIn("FRENO", construir("subagente", oracle=o)["texto"])

    def test_sin_lectura_o_escritor_no_hay_seccion(self):
        self.assertNotIn("nube", construir("supervisor")["secciones"])
        self.assertNotIn("Oracle Cloud", construir("escritor", oracle=self.ORACLE)["texto"])
