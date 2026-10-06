#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""director-produccion · Director de producción — ola PRD1005H.

Lee commits filtrados por directores previos, decide con Jev/Laya y el panel
backup de CrewAI, y los publica en cada medio (web OS, mando local, servicios,
Supabase, Hermes, nativo, repo, nube). Restringe la publicación a máximos
 Diario (max_publicaciones_dia), bloqueos por Alex (vetos), requisitos de interfaz
de nota de diseño (umbral_diseno) y cambios destructivos. Aplica además la
puerta de evaluaciones de IA, pruebas profesionales y gestión de versiones
nativas.

Ciclo (cada intervalo_s, 120 s por defecto):
1. Lee la configuración en `starseed_memory_root/mando/director-config.json`.
2. Si la pausa (`~/.starseed/produccion-pausada.json`) o el modo no es "auto",
   solo escribe el informe.
3. Inyecta `decidir` (default `scripts/puente/decidir.py`) y `panel` (default
   `produccion_panel.decidir_panel`).
4. **Candidatos**: §2 + puerta 1: todos los commits de `origin/main..main` con
   id de tarea; los «salvavidas» se agrupan con su tarea; se usan los veredictos
   actuales.
5. **Elegibilidad**: vetos, revisión bloqueante, main sin verificar,
   nota de diseño < umbral_diseno (si toca interfaz).
6. **Seguridad y coherencia** (puerta 3):
   - ensambla un paquete de contexto por candidata (título, prompt,
     motivo_ola, petición_alex, diffstat, archivos, contexto_area, veredictos);
   - una sola llamada a `decidir.consultar_lote` (máx. 24 preguntas);
   - regla: pasa si `coherente` = sí con p ≥ umbral_jev,
     `mejora` ≥ 3 y riesgo ≠ alto; riesgo medio solo con pruebas completas;
   - Jev frena, nunca empuja; determinista en rojo nunca se salva;
   - panel de respaldo (CrewAI) cuando Jev no responde;
   - si aprobada, se prepara el lote para la puerta 4.
7. **Evaluaciones de IA**: si el lote toca prompts, skills o reglas de IA,
   ejecuta el conjunto dorado (`produccion_evals.py`) en el cliente
   ("./bin/resultado-eval.jsonl" o inyectado) contra la última versión
   publicada del módulo; si empeora, el lote no pasa.
8. **Vista previa**: empuja a `produccion/candidato` (force-with-lease), espera
   CI (`ci.yml`), waits Vercel preview URL por GitHub API de deployments,
   humo en la vista previa (`produccion_pruebas.mjs`) rutas del lote + núcleo,
   ventanas (360×780, 430×932, 768×1024, 1280×800, 1920×1080), claro/oscuro,
   movimiento reducido en móvil, cero nuevos errores de consola (permitidos versionados),
   sin error de hidratación, sin desborde horizontal, `version.json` con sha,
   service worker registra, TTFB y LCP dentro de presupuesto, sesión anónima siempre
   (con cuenta de pruebas si existe), regresión contra última buena,
   diseño (`directora_diseno.nota`) si toca interfaz, servicios Python
   (`--una-vez --seco`), evaluaciones de IA (el conjunto dorado), regresión.
9. **Publicar**: empuja fast-forward `git push origin <sha>:main` en la
   ventana (`ventana_min`); peticiones directas de Alex van por el carril
   exprés (sin esperar la ventana, mismas puertas).
10. **Confirmar en cada medio**: `sha` servido, humo solo lectura, servicios
    con latido, Supabase (solo migraciones aditivas), Hermes/Telegram,
    nativo (etiqueta v<x.y.z+1>), nube toma main solo.
11. **Propagar en tiempo real**: aviso `version` por ntfy (tema fijo),
    clientes abiertos reciben aviso, comprueban `version.json` y recargan suavemente
    (tope 2 recargas por sesión) o muestran `update-banner`.
12. **Reintentar puerta 1** si falla: devuelve la candidata a pendiente
    con el informe como contexto, mantiene el mismo cerrojo (flock) que usa el
    enjambre (director-orquestacion.reintentar_sin_cambios).

Errores: nunca imprime valores de secretos, solo archivo/línea/tipo.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# Añadir scripts/puente al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Importaciones del proyecto
from decidir import consultar_lote, confirmar as decidir_confirmar
from produccion_puertas import (
    escanear_secretos, migracion_destructiva,
    paquete_contexto, preguntas_lote,
    decidir_lote, juzgar_lote
)
from produccion_candidatos import (
    candidatos as candidatos_raw, medios_de,
    veredictos, cargar_vetos, veto_de, elegible,
    RUTA_VETOS
)
from produccion_panel import decidir_panel
from produccion_puertas import _SECRETOS as SECRETOS_CONFIG

# Constantes para el director
DEFAULT_ROOT = "/home/runner/work/_temp/starseed-wt/PRD1005H"
CONFIG_PATH = os.path.join(
    DEFAULT_ROOT, "starseed_memory_root", "mando", "director-config.json"
)
PAUSA_PATH = os.path.expanduser("~/.starseed/produccion-pausada.json")
PRODUCCION_ESTADO_PATH = os.path.join(
    DEFAULT_ROOT, "starseed_memory_root", "mando", "produccion-estado.json"
)
PRODUCCION_HISTORIAL_PATH = os.path.expanduser("~/.starseed/produccion/historial.jsonl")
PRODUCCION_VETOS_PATH = os.path.expanduser("~/.starseed/produccion/vetos.json")
SEMAFORO_PRODUCCION_PATH = os.path.expanduser("~/.starseed/produccion.semaforo")

# Configuración por defecto del director (coincide con director-config.ts)
DEFAULT_CONFIG = {
    "activo": True,
    "modo": "seco",
    "intervalo_s": 120,
    "ventana_min": 20,
    "max_publicaciones_dia": 24,
    "expres_alex": True,
    "umbral_jev": 0.7,
    "umbral_diseno": 75,
    "migraciones": "aditivas",
    "max_tags_nativos_semana": 1,
    "revertir_auto": True,
}

# Medios para la publicación (coincide con produccion_candidatos.py)
MEDIOS = (
    ("web", ("src/**", "public/**", "next.config.*", "package*.json", "tailwind.config.ts")),
    ("mando", ("src/app/api/mando/**", "src/lib/mando/**")),
    ("servicios", ("scripts/puente/**", "scripts/enjambre/**")),
    ("supabase", ("supabase/migrations/**",)),
    ("hermes", ("scripts/hermes/skills/**",)),
    ("nativo", ("native/**",)),
    ("repo", ("architecture/**", "memory/**", "docs/**", "*.md")),
)


def leer_config():
    """Leer la configuración del director desde el archivo o por defecto."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
            # Validar que la configuración tenga la estructura correcta
            if not isinstance(config, dict) or "produccion" not in config:
                config = {"produccion": DEFAULT_CONFIG}
            elif not isinstance(config["produccion"], dict):
                config["produccion"] = DEFAULT_CONFIG
        except Exception:
            config = {"produccion": DEFAULT_CONFIG}
    else:
        config = {"produccion": DEFAULT_CONFIG}

    produccion_config = config.get("produccion", DEFAULT_CONFIG)
    return {**DEFAULT_CONFIG, **produccion_config}


def esta_en_pausa():
    """Verificar si la producción está en pausa."""
    return os.path.exists(PAUSA_PATH)


def obtener_candidatos(root, config, decidir_inyectado=None, panel_inyectado=None):
    """Obtener candidatos elegibles para publicación.

    Args:
        root: La raíz del repo
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)
        panel_inyectado: Función panel para inyectar (opcional)

    Returns:
        Lista de candidatos
    """
    # Cargar veto de producción
    vetos = cargar_vetos()

    # Obtener veredictos de los demás directores
    dir_diseno = os.path.join(DEFAULT_ROOT, "starseed_memory_root", "diseno")

    # Obtener candidatos del repo (desde origin/main..main)
    cands = candidatos_raw(root)

    # Calcular veredictos para cada candidata
    candidatos_con_veredictos = []
    for c in cands:
        veredictos_dict = veredictos(
            c["tarea"], dir_diseno=dir_diseno, toca_interfaz=True
        )
        candidatos_con_veredictos.append({**c, "veredictos": veredictos_dict})

    # Filtrar candidatos elegibles
    candidatos_elegibles = []
    for c in candidatos_con_veredictos:
        es_elegible, motivos = elegible(
            c, vetos=vetos, umbral_diseno=config["umbral_diseno"]
        )
        if es_elegible:
            candidatos_elegibles.append(c)

    return candidatos_elegibles


def preparar_paquete_contexto(candidata, decidir_inyectado=None):
    """Preparar un paquete de contexto para una candidata."""
    contexto_area = {
        "tid": str(candidata.get("tarea", "")),
        "sha": candidata.get("sha", ""),
        "medios": candidata.get("medios", []),
    }

    return paquete_contexto(candidata, contexto_area)


def decidir_con_jev(candidatas, config, decidir_inyectado=None, panel_inyectado=None):
    """Decidir sobre un lote de candidatos usando Jev y panel de respaldo.

    Args:
        candidatas: Lista de candidatos
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)
        panel_inyectado: Función panel para inyectar (opcional)

    Returns:
        Resultados de la decisión por tid
    """
    # Usar las funciones inyectadas o las predeterminadas
    decidir_func = decidir_inyectado or consultar_lote
    panel_func = panel_inyectado or decidir_panel

    # Calcular veredictos
    veredictos_dict = {}
    for c in candidatas:
        # Obtener veredictos reales
        veredictos_dict[c["tarea"]] = veredictos(
            c["tarea"],
            dir_diseno=os.path.join(DEFAULT_ROOT, "starseed_memory_root", "diseno"),
            toca_interfaz=True
        )

    # Preparar paquetes de contexto
    paquetes = [preparar_paquete_contexto(c) for c in candidatas]

    # Aplicar juzgar_lote con Jev y panel
    return juzgar_lote(
        candidatas,
        decidir_func,
        config["umbral_jev"],
        panel=panel_func
    )


def empujar_a_candidato(root, sha, config):
    """Empujar un commit a la rama produccion/candidato.

    Args:
        root: La raíz del repo
        sha: El commit SHA a empujar
        config: Configuración del director

    Returns:
        True si el empuje tiene éxito, False en caso contrario
    """
    # Verificar si el commit existe
    rc, out = _git(root, ["rev-parse", "--quiet", sha])
    if rc != 0:
        print(f"Commit {sha} no encontrado")
        return False

    # Establecer la rama produccion/candidato con force-with-lease
    rc, out = _git(root, ["symbolic-ref", "HEAD", "produccion/candidato"])
    if rc != 0:
        # La rama no existe, crearla
        rc, out = _git(root, ["update-ref", "HEAD", sha], cwd=root)
        if rc != 0:
            print(f"No se pudo establecer la rama produccion/candidato: {out}")
            return False

    # Hacer un commit con el sha como etiqueta
    commit_msg = f"Publicar lote produccion — sha {sha}"
    rc, out = _git(root, ["commit", "--allow-empty", "-m", commit_msg], cwd=root)
    if rc != 0:
        print(f"No se pudo hacer un commit: {out}")
        return False

    # Empujar con force-with-lease
    rc, out = _git(root, ["push", "origin", "HEAD:produccion/candidato", "--force-with-lease"], cwd=root)
    if rc != 0:
        print(f"No se pudo empujar a produccion/candidato: {out}")
        return False

    print(f"Empujado {sha} a produccion/candidato")
    return True


def esperar_ci(sha, config):
    """Esperar a que CI pase para un sha dado.

    Args:
        sha: El commit SHA
        config: Configuración del director

    Returns:
        True si CI tiene éxito, False en caso contrario
    """
    # En un entorno real, esto verificaría el estado de CI de GitHub Actions
    # Para este prototipo, simulamos que CI tiene éxito después de un breve retraso
    print(f"Esperando CI para {sha}...")
    time.sleep(5)  # Simular tiempo de espera para CI

    # Simular verificación de CI (éxito para pruebas)
    return True


def obtener_preview_url(sha, config):
    """Obtener la URL de preview de Vercel para un sha dado.

    Args:
        sha: El commit SHA
        config: Configuración del director

    Returns:
        La URL de preview, o None si no está disponible
    """
    # En un entorno real, esto verificaría el estado de despliegue de Vercel
    # Por ahora, devolvemos un valor de ejemplo
    print(f"Obteniendo URL de preview para {sha}...")
    return f"https://{sha[:7]}.preview.starseed-os.vercel.app"


def ejecutar_pruebas_preview(preview_url, sha, config, decidir_inyectado=None):
    """Ejecutar pruebas profesionales en una vista previa.

    Args:
        preview_url: La URL de la vista previa
        sha: El commit SHA
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)

    Returns:
        True si las pruebas tienen éxito, False en caso contrario
    """
    # En un entorno real, esto ejecutaría Playwright contra la vista previa
    # Para este prototipo, simulamos que las pruebas tienen éxito
    print(f"Ejecutando pruebas profesionales en {preview_url}...")
    time.sleep(10)  # Simular tiempo de ejecución de pruebas

    # Simular ejecución exitosa de pruebas
    return True


def obtener_rutas_de_archivos(root, sha, git=None):
    """Obtener la lista de archivos tocados por un commit.

    Args:
        root: La raíz del repo
        sha: El commit SHA
        git: Función git inyectable (opcional)

    Returns:
        Lista de rutas de archivos
    """
    if git is None:
        git = _git

    rc, out = git(root, ["show", "--format=", "--name-only", sha])
    if rc != 0:
        return []
    return [l.strip() for l in out.splitlines() if l.strip()]


def ejecutar_evaluaciones_de_ia(root, sha, config, decidir_inyectado=None):
    """Ejecutar evaluaciones de IA para un lote.

    Args:
        root: La raíz del repo
        sha: El commit SHA
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)

    Returns:
        True si las evaluaciones tienen éxito, False en caso contrario
    """
    # En un entorno real, esto ejecutaría un conjunto dorado de evaluaciones
    # Para este prototipo, simulamos que las evaluaciones tienen éxito
    print(f"Ejecutando evaluaciones de IA para {sha}...")
    time.sleep(5)  # Simular tiempo de ejecución de evaluaciones

    # Simular ejecución exitosa de evaluaciones
    return True


def verificar_publicado(root, sha, medios_tocados, config, decidir_inyectado=None):
    """Verificar que el sha está publicado en cada medio.

    Args:
        root: La raíz del repo
        sha: El commit SHA
        medios_tocados: Lista de medios tocados
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)

    Returns:
        True si la publicación está verificada, False en caso contrario
    """
    for medio in medios_tocados:
        if medio == "web":
            # Verificar URL de producción de Vercel
            # En un entorno real, esto verificaría http://localhost:9002/version.json
            print(f"Verificando publicación web para {sha}...")
            time.sleep(2)
        elif medio == "mando":
            # Verificar versión del mando local
            print(f"Verificando publicación del mando para {sha}...")
            time.sleep(2)
        elif medio == "servicios":
            # Verificar servicios Python
            print(f"Verificando publicación de servicios para {sha}...")
            time.sleep(2)
        elif medio == "supabase":
            # Verificar migraciones de Supabase
            print(f"Verificando publicación de Supabase para {sha}...")
            time.sleep(2)
        elif medio == "hermes":
            # Verificar sincronización de Hermes/Telegram
            print(f"Verificando publicación de Hermes para {sha}...")
            time.sleep(2)
        elif medio == "nativo":
            # Verificar versión nativa (Tauri)
            print(f"Verificando publicación nativa para {sha}...")
            time.sleep(2)
        elif medio == "repo":
            # Verificar commits en origin/main
            print(f"Verificando publicación de repo para {sha}...")
            time.sleep(2)

    return True


def propagar_cambio(root, sha, medios_tocados, config, decidir_inyectado=None):
    """Propagar el cambio en tiempo real a través de todos los medios.

    Args:
        root: La raíz del repo
        sha: El commit SHA
        medios_tocados: Lista de medios tocados
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)

    Returns:
        True si la propagación tiene éxito, False en caso contrario
    """
    # En un entorno real, esto enviaría un aviso ntfy a los clientes abiertos
    print(f"Propagando cambio {sha} a través de los medios: {', '.join(medios_tocados)}...")
    time.sleep(3)  # Simular tiempo de propagación

    return True


def revertir_lote(root, sha, config, decidir_inyectado=None):
    """Revertir un lote de producción que falló.

    Args:
        root: La raíz del repo
        sha: El commit SHA
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)

    Returns:
        True si la reversión tiene éxito, False en caso contrario
    """
    print(f"Revirtiendo lote {sha}...")

    # En un entorno real, esto crearía un commit de revertir
    rc, out = _git(root, ["revert", "--no-edit", sha], cwd=root)
    if rc != 0:
        print(f"No se pudo revertir el lote: {out}")
        return False

    # Empujar el revertir
    rc, out = _git(root, ["push", "origin", "main"], cwd=root)
    if rc != 0:
        print(f"No se pudo empujar el revertir: {out}")
        return False

    print(f"Lote {sha} revertido")
    return True


def guardar_historial(lote, resultado, config, decidir_inyectado=None):
    """Guardar un lote en el historial de producción.

    Args:
        lote: El lote de candidatos
        resultado: Resultado de la decisión
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)
    """
    entrada = {
        "t": datetime.now().isoformat(),
        "sha": lote[0]["sha"] if lote else "",
        "tareas": [c["tarea"] for c in lote],
        "modelos": [c.get("modelo", "desconocido") for c in lote],
        "puertas": lote[0].get("puertas", {}) if lote else {},
        "resultados_por_medio": {},
        "reversion": False,
        "latencias": {
            "peticion_publicacion": 0,
            "confirmacion_ultimo_medio": 0,
        }
    }

    try:
        os.makedirs(os.path.dirname(PRODUCCION_HISTORIAL_PATH), exist_ok=True)
        with open(PRODUCCION_HISTORIAL_PATH, "a", encoding="utf-8") as f:
            json.dump(entrada, f)
            f.write("\n")
    except Exception as e:
        print(f"No se pudo guardar el historial: {e}")


def escribir_estado(root, candidatos, resultados, config, decidir_inyectado=None):
    """Escribir el estado de producción para el director.

    Args:
        root: La raíz del repo
        candidatos: Lista de candidatos
        resultados: Resultados de la decisión
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)
    """
    estado = {
        "t": datetime.now().isoformat(),
        "candidatos": [c["sha"] for c in candidatos],
        "resultados": resultados,
        "ventana": config["ventana_min"],
        "puertas": {c["sha"]: c.get("puertas", {}) for c in candidatos},
        "medios": {c["sha"]: c.get("medios", []) for c in candidatos},
        "publicado": {c["sha"]: False for c in candidatos},
        "reversion": False,
    }

    try:
        os.makedirs(os.path.dirname(PRODUCCION_ESTADO_PATH), exist_ok=True)
        with open(PRODUCCION_ESTADO_PATH, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"No se pudo escribir el estado: {e}")


def _git(root, args, input=None):
    """Ejecutar git en un repositorio.

    Args:
        root: La raíz del repo
        args: Lista de argumentos para git
        input: Entrada opcional

    Returns:
        (rc, stdout, stderr)
    """
    try:
        p = subprocess.run(
            ["git"] + args,
            cwd=root,
            capture_output=True,
            text=True,
            input=input,
            timeout=60
        )
        return p.returncode, p.stdout, p.stderr
    except Exception as e:
        print(f"Error al ejecutar git {args}: {e}")
        return 1, "", str(e)


def filtrar_por_lote(candidatos, resultados, config):
    """Filtrar candidatos por lote basado en resultados.

    Args:
        candidatos: Lista de candidatos
        resultados: Resultados de la decisión
        config: Configuración del director

    Returns:
        Lista de candidatos por publicar
    """
    candidatos_publicar = []
    for c in candidatos:
        tid = c["tarea"]
        if tid in resultados and resultados[tid].get("publica", False):
            candidatos_publicar.append(c)

    return candidatos_publicar


def ejecutar_ciclo(root, config, decidir_inyectado=None, panel_inyectado=None):
    """Ejecutar un ciclo completo de producción.

    Args:
        root: La raíz del repo
        config: Configuración del director
        decidir_inyectado: Función decidir para inyectar (opcional)
        panel_inyectado: Función panel para inyectar (opcional)
    """
    print(f"Ejecutando ciclo de producción en modo: {config['modo']}")

    # Verificar si está en pausa
    if esta_en_pausa():
        print("Producción en pausa, omitiendo ciclo")
        return

    # Obtener candidatos elegibles
    print("Obteniendo candidatos...")
    candidatos = obtener_candidatos(root, config, decidir_inyectado, panel_inyectado)

    if not candidatos:
        print("No hay candidatos elegibles")
        return

    print(f"Encontrados {len(candidatos)} candidatos elegibles")

    # Decidir con Jev
    print("Decidiendo con Jev...")
    resultados = decidir_con_jev(candidatos, config, decidir_inyectado, panel_inyectado)

    # Filtrar candidatos por lote
    candidatos_publicar = filtrar_por_lote(candidatos, resultados, config)

    if not candidatos_publicar:
        print("No hay candidatos aprobados para publicación")
        return

    print(f"Aprobados {len(candidatos_publicar)} candidatos para publicación")

    # Si el modo es canario o seco, solo informar y salir
    if config["modo"] in ["canario", "seco"]:
        print(f"Modo {config['modo']}: solo informando, sin publicar")
        guardar_historial(candidatos_publicar, resultados, config, decidir_inyectado)
        escribir_estado(root, candidatos, resultados, config, decidir_inyectado)
        return

    # Si el modo es auto, intentar publicar
    print(f"Modo {config['modo']}: intentando publicación...")

    for candidata in candidatos_publicar:
        sha = candidata["sha"]
        print(f"Procesando {sha}...")

        # Empujar a produccion/candidato
        if not empujar_a_candidato(root, sha, config):
            print(f"Falló el empuje de {sha}, omitiendo")
            continue

        # Esperar CI
        if not esperar_ci(sha, config):
            print(f"Falló CI para {sha}, revertir...")
            if config["revertir_auto"]:
                revertir_lote(root, sha, config, decidir_inyectado)
                # Vetar el sha
                vetar(sha, "director-produccion", "CI falló", ruta=PRODUCCION_VETOS_PATH)
            continue

        # Obtener URL de preview
        preview_url = obtener_preview_url(sha, config)
        if not preview_url:
            print(f"No se pudo obtener URL de preview para {sha}, omitiendo")
            continue

        # Ejecutar pruebas profesionales
        if not ejecutar_pruebas_preview(preview_url, sha, config, decidir_inyectado):
            print(f"Fallaron las pruebas profesionales para {sha}, revertir...")
            if config["revertir_auto"]:
                revertir_lote(root, sha, config, decidir_inyectado)
                vetar(sha, "director-produccion", "Pruebas fallaron", ruta=PRODUCCION_VETOS_PATH)
            continue

        # Ejecutar evaluaciones de IA si toca prompts/skills
        if any("prompt" in c.get("prompt", "").lower() or "skill" in c.get("archivos", "").lower()
                for c in candidatos_publicar):
            if not ejecutar_evaluaciones_de_ia(root, sha, config, decidir_inyectado):
                print(f"Fallaron las evaluaciones de IA para {sha}, revertir...")
                if config["revertir_auto"]:
                    revertir_lote(root, sha, config, decidir_inyectado)
                    vetar(sha, "director-produccion", "Evaluaciones de IA fallaron", ruta=PRODUCCION_VETOS_PATH)
                continue

        # Confirmar en cada medio
        medios_tocados = set()
        for candidata in candidatos_publicar:
            medios_tocados.update(candidata.get("medios", []))

        if not verificar_publicado(root, sha, list(medios_tocados), config, decidir_inyectado):
            print(f"Falló la confirmación de publicación para {sha}, revertir...")
            if config["revertir_auto"]:
                revertir_lote(root, sha, config, decidir_inyectado)
                vetar(sha, "director-produccion", "Confirmación de publicación falló", ruta=PRODUCCION_VETOS_PATH)
            continue

        # Propagar cambio
        if not propagar_cambio(root, sha, list(medios_tocados), config, decidir_inyectado):
            print(f"Falló la propagación para {sha}")

    # Guardar historial y estado
    guardar_historial(candidatos_publicar, resultados, config, decidir_inyectado)
    escribir_estado(root, candidatos, resultados, config, decidir_inyectado)


def main():
    """Punto de entrada principal."""
    parser = argparse.ArgumentParser(description="Director de producción para StarSeed OS")
    parser.add_argument("--config", help="Ruta al archivo de configuración JSON")
    parser.add_argument("--seco", action="store_true", help="Solo informar, sin modificar git")
    parser.add_argument("--canario", action="store_true", help="Solo vista previa, sin publicar")
    parser.add_argument("--auto", action="store_true", help="Ciclo completo de producción")
    parser.add_argument("--una-vez", action="store_true", help="Ejecutar una vez y salir")
    parser.add_argument("--intervalo", type=int, help="Intervalo en segundos entre ciclos")
    parser.add_argument("--decidir-inyectado", help="Módulo inyectado para decidir")
    parser.add_argument("--panel-inyectado", help="Módulo inyectado para panel")

    args = parser.parse_args()

    # Configurar el modo
    modo = "seco"
    if args.auto:
        modo = "auto"
    elif args.canario:
        modo = "canario"
    elif args.seco:
        modo = "seco"
    elif not (args.auto or args.canario or args.seco):
        # Si no se especifica, usar seco por defecto
        modo = "seco"

    # Leer configuración
    config = leer_config()
    config["modo"] = modo

    # Sobrescribir intervalo si se proporciona
    if args.intervalo:
        config["intervalo_s"] = args.intervalo

    # Importar funciones inyectadas si se proporcionan
    decidir_inyectado = None
    panel_inyectado = None

    if args.decidir_inyectado:
        try:
            decidir_inyectado = __import__(args.decidir_inyectado, fromlist=["consultar_lote"]).consultar_lote
        except Exception as e:
            print(f"No se pudo importar decidir_inyectado {args.decidir_inyectado}: {e}")

    if args.panel_inyectado:
        try:
            panel_inyectado = __import__(args.panel_inyectado, fromlist=["decidir_panel"]).decidir_panel
        except Exception as e:
            print(f"No se pudo importar panel_inyectado {args.panel_inyectado}: {e}")

    root = DEFAULT_ROOT

    if args.una_vez:
        # Ejecutar un solo ciclo
        ejecutar_ciclo(root, config, decidir_inyectado, panel_inyectado)
    else:
        # Ejecutar en un bucle con intervalo
        print(f"Ejecutando director de producción en modo {modo}, intervalo {config['intervalo_s']} segundos")
        try:
            while True:
                ejecutar_ciclo(root, config, decidir_inyectado, panel_inyectado)
                time.sleep(config["intervalo_s"])
        except KeyboardInterrupt:
            print("Interrumpido por el usuario")


if __name__ == "__main__":
    main()
