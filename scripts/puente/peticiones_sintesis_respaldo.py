#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldo de síntesis: investigación profunda con criterio de importación (PET1116C §3.3).

En vez de --import-all, importa solo fuentes citadas y relevantes al tema y a StarSeed
(título y source guide frente al tema), máx 25, luego source clean.
Lo descartado nunca vuelve a entrar.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

# Inyección de dependencias
NbCliente = Callable[..., tuple[int, str, str]]  # args -> (rc, out, err)
AhoraFn = Callable[[], float]
LogFn = Callable[[str], None]

RAIZ_DEF = Path(__file__).parent.parent.parent
ALCANCE_DIR = RAIZ_DEF / "starseed_memory_root" / "alcance"
DESCARTES_FILE = ALCANCE_DIR / "temas_descartados.json"

# Palabras clave que definen relevancia a StarSeed
PALABRAS_STARSEED = (
    "descentralizad",
    "soberan",
    "protocol",
    "federad",
    "local-first",
    "local first",
    "p2p",
    "peer-to-peer",
    "commons",
    "cooperativ",
    "autogobiern",
    "identidad digital",
    "datos personales",
    "privacidad",
    "vigilancia",
    "censura",
    "red social",
    "gobernanza",
    "dao",
    "holochain",
    "ipfs",
    "libp2p",
    "matrix",
    "nostr",
    "activitypub",
    "atproto",
    "solid",
    "web3",
    "blockchain",
    "cripto",
    "token",
    "wallet",
    "firma digital",
    "verificable",
    "credencial",
    "did",
    "vc",
    "ssi",
    "identidad auto-soberana",
)


def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _cargar_temas_descartados() -> dict[str, list[str]]:
    """Carga los temas descartados por cuaderno: {cuaderno_id: [temas...]}"""
    return _leer_json(DESCARTES_FILE, {})


def _guardar_tema_descartado(cuaderno_id: str, tema: str) -> None:
    """Registra un tema como descartado para que nunca vuelva a entrar."""
    descartados = _cargar_temas_descartados()
    if cuaderno_id not in descartados:
        descartados[cuaderno_id] = []
    if tema not in descartados[cuaderno_id]:
        descartados[cuaderno_id].append(tema)
    _escribir_atomico(DESCARTES_FILE, descartados)


def _es_tema_descartado(cuaderno_id: str, tema: str) -> bool:
    """Verifica si un tema ya fue descartado en este cuaderno."""
    descartados = _cargar_temas_descartados()
    return tema in descartados.get(cuaderno_id, [])


def _calcular_relevancia(titulo: str, source_guide: str, tema: str, log_fn: LogFn | None = None) -> float:
    """Calcula puntuación de relevancia 0-100 basada en título, source guide y tema."""
    texto = f"{titulo} {source_guide} {tema}".lower()
    puntuacion = 0.0
    
    # Palabras StarSeed (peso alto)
    for palabra in PALABRAS_STARSEED:
        if palabra in texto:
            puntuacion += 15.0
    
    # Tema del encargo (peso medio)
    palabras_tema = [p for p in tema.lower().split() if len(p) > 3]
    for p in palabras_tema:
        if p in texto:
            puntuacion += 8.0
    
    # Título de la fuente (peso bajo)
    palabras_titulo = [p for p in titulo.lower().split() if len(p) > 3]
    for p in palabras_titulo:
        if p in texto:
            puntuacion += 3.0
    
    # Penalizar si es claramente ajeno (ej. cocina, recetas, Sinaí, rallador)
    palabras_ajenas = ("cocina", "receta", "rallador", "sinaí", "sinai", "carne humana", "etnograf", "antropolog")
    for p in palabras_ajenas:
        if p in texto:
            puntuacion -= 50.0
    
    return max(0.0, min(100.0, puntuacion))


def _filtrar_fuentes_relevantes(
    nb: NbCliente,
    cuaderno_id: str,
    tema: str,
    max_fuentes: int = 25,
    log_fn: LogFn | None = None,
) -> list[dict[str, Any]]:
    """Obtiene fuentes del cuaderno y filtra las relevantes (título + source guide vs tema + StarSeed)."""
    # Listar fuentes del cuaderno
    rc, out, err = nb("source", "list", "-n", cuaderno_id, "--json", timeout=180)
    if rc != 0:
        if log_fn:
            log_fn(f"Error listando fuentes: {err[-200:]}")
        return []
    
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return []
    
    fuentes = data.get("sources", [])
    if not fuentes:
        return []
    
    # Filtrar: solo ready, no descartadas, calcular relevancia
    relevantes = []
    for f in fuentes:
        if f.get("status") != "ready":
            continue
        if _es_tema_descartado(cuaderno_id, f.get("title", "")):
            continue
        
        titulo = f.get("title", "")
        source_guide = f.get("source_guide", "") or f.get("summary", "") or ""
        relevancia = _calcular_relevancia(titulo, source_guide, tema, log_fn)
        
        if relevancia > 20.0:  # Umbral mínimo de relevancia
            relevantes.append({
                "id": f.get("id"),
                "title": titulo,
                "source_guide": source_guide,
                "relevancia": relevancia,
            })
    
    # Ordenar por relevancia descendente y limitar a max_fuentes
    relevantes.sort(key=lambda x: x["relevancia"], reverse=True)
    return relevantes[:max_fuentes]


def _limpiar_fuentes_no_relevantes(
    nb: NbCliente,
    cuaderno_id: str,
    fuentes_a_mantener: list[str],
    log_fn: LogFn | None = None,
) -> int:
    """Ejecuta source clean para eliminar fuentes que no están en la lista de mantener."""
    if not fuentes_a_mantener:
        return 0
    
    ids_mantener = set(fuentes_a_mantener)
    
    # Listar todas las fuentes
    rc, out, err = nb("source", "list", "-n", cuaderno_id, "--json", timeout=180)
    if rc != 0:
        if log_fn:
            log_fn(f"Error listando fuentes para limpiar: {err[-200:]}")
        return 0
    
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return 0
    
    fuentes = data.get("sources", [])
    eliminadas = 0
    
    for f in fuentes:
        sid = f.get("id")
        if sid and sid not in ids_mantener:
            # No eliminar si ya está procesada (ready) y es de un tema guardado
            # Solo limpiar las que no son relevantes (source clean)
            try:
                nb("source", "delete", cuaderno_id, "--source-id", sid, timeout=60)
                eliminadas += 1
                if log_fn:
                    log_fn(f"Fuente eliminada por source clean: {sid} ({f.get('title', '')[:50]})")
            except Exception:
                pass
    
    return eliminadas


def investigar_con_criterio(
    nb: NbCliente,
    cuaderno_id: str,
    consultas: list[str],
    tema_encargo: str,
    max_fuentes: int = 25,
    ahora_fn: AhoraFn | None = None,
    log_fn: LogFn | None = None,
) -> dict[str, Any]:
    """Investigación profunda con criterio de importación (PET1116C §3.3).

    Para cada consulta:
    1. Lanza deep research (source add-research --mode deep)
    2. Lista fuentes y filtra: solo citadas y relevantes (título + source guide vs tema + StarSeed)
    3. Máximo max_fuentes (default 25)
    4. source clean: elimina las no relevantes
    5. Registra temas descartados para que nunca vuelvan a entrar
    """
    if ahora_fn is None:
        def ahora_defecto() -> float:
            return time.time()
        ahora_fn = ahora_defecto
    
    if log_fn is None:
        def log_defecto(msg: str) -> None:
            print(f"[sintesis_respaldo] {msg}", flush=True)
        log_fn = log_defecto
    
    resultados = {
        "consultas_procesadas": 0,
        "fuentes_importadas": 0,
        "fuentes_limpiadas": 0,
        "temas_descartados": [],
        "errores": [],
    }
    
    for i, consulta in enumerate(consultas):
        if log_fn:
            log_fn(f"Investigando ({i+1}/{len(consultas)}): {consulta[:80]}")
        
        # 1. Lanzar investigación profunda
        try:
            rc, out, err = nb("source", "add-research", "-n", cuaderno_id, consulta, "--mode", "deep", "--timeout", "3300", timeout=3600)
            if rc != 0:
                resultados["errores"].append(f"Consulta {i+1}: {err[-200:]}")
                continue
        except Exception as e:
            resultados["errores"].append(f"Consulta {i+1}: {e}")
            continue
        
        # Esperar un poco a que se indexen las fuentes
        time.sleep(10)
        
        # 2. Filtrar fuentes relevantes
        relevantes = _filtrar_fuentes_relevantes(nb, cuaderno_id, tema_encargo, max_fuentes, log_fn)
        
        if not relevantes:
            if log_fn:
                log_fn(f"  No hay fuentes relevantes para: {consulta[:60]}")
            continue
        
        # 3. Extraer IDs de fuentes a mantener
        ids_mantener = [f["id"] for f in relevantes]
        resultados["fuentes_importadas"] += len(ids_mantener)
        
        # 4. source clean: eliminar las no relevantes
        eliminadas = _limpiar_fuentes_no_relevantes(nb, cuaderno_id, ids_mantener, log_fn)
        resultados["fuentes_limpiadas"] += eliminadas
        
        # 5. Registrar temas descartados (fuentes con relevancia <= 20)
        rc, out, err = nb("source", "list", "-n", cuaderno_id, "--json", timeout=180)
        if rc == 0:
            try:
                data = json.loads(out)
                for f in data.get("sources", []):
                    titulo = f.get("title", "")
                    if f.get("status") != "ready" or f.get("id") in ids_mantener:
                        continue
                    if _calcular_relevancia(titulo, f.get("source_guide", "") or "", tema_encargo) <= 20.0:
                        if not _es_tema_descartado(cuaderno_id, titulo):
                            _guardar_tema_descartado(cuaderno_id, titulo)
                            resultados["temas_descartados"].append(titulo)
            except json.JSONDecodeError:
                pass
        
        resultados["consultas_procesadas"] += 1
    
    if log_fn:
        log_fn(f"Investigación completada: {resultados['consultas_procesadas']} consultas, "
               f"{resultados['fuentes_importadas']} fuentes importadas, "
               f"{resultados['fuentes_limpiadas']} limpiadas, "
               f"{len(resultados['temas_descartados'])} temas descartados")
    
    return resultados


def investigar_sintesis_diaria(
    nb: NbCliente,
    cuaderno_id: str,
    fecha: str,
    max_fuentes: int = 25,
    ahora_fn: AhoraFn | None = None,
    log_fn: LogFn | None = None,
) -> dict[str, Any]:
    """Investigación profunda para la síntesis diaria con criterio.

    Usa consultas estándar de síntesis y aplica el filtro de relevancia.
    """
    consultas_estandar = [
        f"Avances en soberanía digital y protocolos descentralizados {fecha}",
        f"Herramientas local-first y IA en el dispositivo {fecha}",
        f"Redes federadas y cooperativas digitales {fecha}",
        f"Gobernanza algorítmica y commons digitales {fecha}",
        f"Privacidad, vigilancia y resistencia a la censura {fecha}",
        f"Identidad auto-soberana y credenciales verificables {fecha}",
        f"Economía del cuidado y mutualismo digital {fecha}",
        f"Artesanía digital y diseño regenerativo {fecha}",
    ]
    
    return investigar_con_criterio(
        nb, cuaderno_id, consultas_estandar,
        f"Síntesis diaria StarSeed {fecha}",
        max_fuentes, ahora_fn, log_fn
    )


def main(argv: list[str] | None = None) -> int:
    """CLI para pruebas: investigar <cuaderno_id> <tema> [--consultas JSON] [--max N]"""
    import sys
    argv = list(argv) if argv is not None else sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print("Uso: python3 peticiones_sintesis_respaldo.py <comando>")
        print("Comandos:")
        print("  investigar <cuaderno_id> <tema> [--consultas JSON] [--max N]")
        print("  sintesis <cuaderno_id> <fecha> [--max N]")
        print("  limpiar <cuaderno_id> [--tema tema] [--max N]")
        return 0
    
    cmd = argv[0]
    
    # Mock simple para CLI
    def nb_cli(*args, **kwargs):
        import subprocess
        timeout = kwargs.get("timeout", 180)
        try:
            result = subprocess.run(
                ["notebooklm"] + list(args),
                capture_output=True, text=True, timeout=timeout
            )
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            return 1, "", str(e)
    
    if cmd == "investigar":
        if len(argv) < 3:
            print("Falta cuaderno_id y tema")
            return 1
        cuaderno_id = argv[1]
        tema = argv[2]
        consultas = []
        max_fuentes = 25
        i = 3
        while i < len(argv):
            if argv[i] == "--consultas" and i + 1 < len(argv):
                try:
                    consultas = json.loads(argv[i + 1])
                except json.JSONDecodeError:
                    print("JSON inválido en --consultas")
                    return 1
                i += 2
            elif argv[i] == "--max" and i + 1 < len(argv):
                max_fuentes = int(argv[i + 1])
                i += 2
            else:
                i += 1
        
        if not consultas:
            consultas = [tema]
        
        resultado = investigar_con_criterio(nb_cli, cuaderno_id, consultas, tema, max_fuentes, log_fn=print)
        print(json.dumps(resultado, ensure_ascii=False, indent=1))
        return 0
    
    if cmd == "sintesis":
        if len(argv) < 3:
            print("Falta cuaderno_id y fecha (AAAA-MM-DD)")
            return 1
        cuaderno_id = argv[1]
        fecha = argv[2]
        max_fuentes = 25
        i = 3
        while i < len(argv):
            if argv[i] == "--max" and i + 1 < len(argv):
                max_fuentes = int(argv[i + 1])
                i += 2
            else:
                i += 1
        
        resultado = investigar_sintesis_diaria(nb_cli, cuaderno_id, fecha, max_fuentes, log_fn=print)
        print(json.dumps(resultado, ensure_ascii=False, indent=1))
        return 0
    
    if cmd == "limpiar":
        if len(argv) < 2:
            print("Falta cuaderno_id")
            return 1
        cuaderno_id = argv[1]
        tema = "StarSeed OS"
        max_fuentes = 25
        i = 2
        while i < len(argv):
            if argv[i] == "--tema" and i + 1 < len(argv):
                tema = argv[i + 1]
                i += 2
            elif argv[i] == "--max" and i + 1 < len(argv):
                max_fuentes = int(argv[i + 1])
                i += 2
            else:
                i += 1
        
        relevantes = _filtrar_fuentes_relevantes(nb_cli, cuaderno_id, tema, max_fuentes, print)
        ids_mantener = [f["id"] for f in relevantes]
        eliminadas = _limpiar_fuentes_no_relevantes(nb_cli, cuaderno_id, ids_mantener, print)
        print(f"Mantenidas: {len(ids_mantener)}, Eliminadas: {eliminadas}")
        return 0
    
    print(f"Comando desconocido: {cmd}")
    return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())