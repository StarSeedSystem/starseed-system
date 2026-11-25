# -*- coding: utf-8 -*-
"""DIR1121 · Los tres canales de dirección se llaman igual en todos los medios.

Recorre el repositorio y falla si un nombre viejo de canal vuelve a escribirse a mano
fuera de la lista de alias históricos. Los nombres canónicos viven en UNA sola fuente:
`src/lib/mando/canales-nombres.ts` y su espejo Python `sincronizador_direccion.py`.
"""
import json
import os
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
import sincronizador_direccion as SD  # noqa: E402

CANONICOS = {"principal": "Principal", "general": "General", "audiovisual": "Audiovisual y diseño"}

# Lista de alias históricos: viejo → canónico. Único sitio donde se nombran los viejos.
ALIAS_HISTORICOS = {
    "Dirección principal": "Principal",
    "Dirección general": "General",
    "Dirección MetaGenesis": "Principal",
    "Producción audiovisual, diseño y promoción": "Audiovisual y diseño",
    "Maggacortex": "Principal",
    "Puente de Mando": "Principal",
    "Síntesis de producción": "Audiovisual y diseño",
    "GENESIS · StarSeed OS": "Principal",
}

# Módulos de alias, migraciones y comentarios que TIENEN que reconocer lo viejo.
ARCHIVOS_DE_ALIAS = {
    "next.config.ts": {"Puente de Mando"},
    "scripts/puente/contexto_agente.py": {"Síntesis de producción"},
    "scripts/puente/genesis_canon_logica.py": {"GENESIS · StarSeed OS"},
    "scripts/puente/genesis_firma_logica.py": {"GENESIS · StarSeed OS"},
    "scripts/puente/genesis_renombrar.py": {"Puente de Mando"},
    "scripts/puente/motores_director.py": {"Dirección MetaGenesis"},
    "scripts/puente/oracle_nodo.py": {"Síntesis de producción"},
    "scripts/puente/relevo_medios.py": {"Síntesis de producción"},
    "src/lib/chats-genesis/alias-gen1113.ts": {"GENESIS · StarSeed OS"},
    "src/lib/dock/dock-defaults.ts": {"Puente de Mando"},
}

# Deuda viva de otras tareas. La guardia impide que se sume un archivo nuevo.
PENDIENTES_CONOCIDOS = {
    "src/components/chats-genesis/lista-chats-genesis.tsx": {"Dirección general"},
    "src/lib/mando/canales-especializados.ts": {
        "Dirección principal", "Dirección general", "Dirección MetaGenesis",
        "Producción audiovisual, diseño y promoción", "Maggacortex", "Síntesis de producción",
    },
    "src/lib/mando/presidente-servidor.ts": {"Dirección principal", "Dirección general", "Maggacortex"},
}

_SALTAR = {"node_modules", ".git", ".next", "vendor", "dist", "build", "__pycache__",
           "starseed_memory_root", "memory", "docs", "enjambre", "integraciones-de-codigo", ".agent", ".cursor"}
_EXTENSIONES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".mdc"}
_ESTE = os.path.relpath(os.path.abspath(__file__), RAIZ)


def _texto(relativo):
    with open(os.path.join(RAIZ, relativo), encoding="utf-8") as archivo:
        return archivo.read()


def _es_prueba(relativo):
    nombre = os.path.basename(relativo)
    return nombre.startswith("test_") or ".test." in nombre or "/__tests__/" in relativo


def _recorrer():
    for base, dirs, archivos in os.walk(RAIZ):
        dirs[:] = [d for d in dirs if d not in _SALTAR and not d.startswith(".")]
        for nombre in archivos:
            if os.path.splitext(nombre)[1] not in _EXTENSIONES:
                continue
            relativo = os.path.relpath(os.path.join(base, nombre), RAIZ)
            if relativo != _ESTE:
                yield relativo


def _viejos_en(texto):
    return {viejo for viejo in ALIAS_HISTORICOS if viejo in texto}


class CanalesNombres(unittest.TestCase):
    def test_el_repositorio_solo_nombra_lo_viejo_en_los_alias_historicos(self):
        fallos = []
        for relativo in _recorrer():
            try:
                texto = _texto(relativo)
            except (OSError, UnicodeDecodeError):
                continue
            for viejo in _viejos_en(texto):
                permitidos = ARCHIVOS_DE_ALIAS.get(relativo) or PENDIENTES_CONOCIDOS.get(relativo)
                if not _es_prueba(relativo) and not (permitidos and viejo in permitidos):
                    fallos.append("%s: %s" % (relativo, viejo))
        self.assertEqual(fallos, [], "nombres viejos fuera de los alias históricos:\n" + "\n".join(sorted(fallos)))

    def test_las_dos_fuentes_declaran_los_tres_nombres_canonicos(self):
        self.assertEqual(SD.NOMBRES_CANALES_POR_DEFECTO, CANONICOS)
        self.assertEqual(set(ALIAS_HISTORICOS.values()), set(CANONICOS.values()))
        texto = _texto("src/lib/mando/canales-nombres.ts")
        for nombre in CANONICOS.values():
            self.assertIn('"%s"' % nombre, texto)

    def test_chats_declara_los_tres_canales_y_el_mismo_titulo_en_cada_entorno(self):
        datos = json.loads(_texto("scripts/puente/chats.json"))
        self.assertEqual(datos["nombre_canonico"], "Principal")
        for entorno in ("claude", "codex", "hermes", "antigravity", "telegram"):
            self.assertEqual(set(datos["entornos"][entorno]["canales"]), set(CANONICOS), entorno)
        for entorno in ("claude", "codex", "antigravity"):
            entrada = datos["entornos"][entorno]
            self.assertEqual(entrada["titulo_canal"], "principal", entorno)
            self.assertIn("canales-direccion.json", entrada["como_renombrar"], entorno)
        self.assertEqual(datos["entornos"]["hermes"]["canales"]["general"]["hermes_sesion"],
                         "20260828_130104_dc6d43f0")

if __name__ == "__main__": unittest.main()
