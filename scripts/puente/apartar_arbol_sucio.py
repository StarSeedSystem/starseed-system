#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apartar_arbol_sucio · Cuarentena de main sucio (DIR1121C).

Si el árbol de main lleva más de 15 min con cambios sin commit y no hay una
integración en curso (cerrojo integrar.lock), guarda parche + copia de cada
archivo + MANIFIESTO.json en ~/.starseed/cuarentena/<fecha-hora>/ (nunca borra
sin copia verificada), deja main limpio, lo anuncia en el canal Principal con la
lista de archivos y crea una tarea para volver a aplicar el cambio con pruebas.

Incluye detección de QUIÉN edita main directamente (Antigravity IDE, Codex,
agente con directorio equivocado) y genera instrucciones para corregir su
configuración a worktree.
"""
import json
import os
import shutil
import subprocess
import sys
import time
from typing import List, Dict, Optional, Tuple

# Raíz del repo (tres carpetas arriba de scripts/puente/)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Directorio base de cuarentena
CUARENTENA_BASE = os.path.expanduser("~/.starseed/cuarentena")

# Canal común de los cuatro entornos
CANAL = os.path.join(ROOT, "starseed_memory_root", "mando", "canal.jsonl")

# Cerrojo de integración
CERROJO_INTEGRAR = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")

# Umbral: 15 minutos = 900 segundos
UMBRAL_SEGUNDOS = 900

# Archivos que escribe el propio enjambre (se excluyen de la cuarentena)
# Importamos de arbol_de_trabajo para no duplicar
try:
    sys.path.insert(0, os.path.join(ROOT, "scripts", "puente"))
    from arbol_de_trabajo import PROPIAS as ARCHIVOS_PROPIOS
    from arbol_de_trabajo import generar_informe_editores, corregir_configuracion_editor
except Exception:
    ARCHIVOS_PROPIOS = (
        "memory/aprendizaje-olas.md",
        "PUENTE-DE-MANDO.md",
        ".github/copilot-instructions.md",
        ".cursor/rules/puente-de-mando.mdc",
        "memory/workflow-actual.md",
    )
    def generar_informe_editores(raiz=None):
        return {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "editores_detectados": [], "otros_procesos": []}
    def corregir_configuracion_editor(editor, worktree_ruta):
        return {"metodo": "desconocido", "comando": "", "config": f"No hay instrucción para '{editor}'."}


def _git(*args, **kwargs) -> str:
    """Ejecuta git en ROOT y devuelve stdout."""
    return subprocess.run(["git", *args], cwd=ROOT, check=True,
                          capture_output=True, text=True, **kwargs).stdout


def _hay_cerrojo_integrar() -> bool:
    """True si alguien TIENE el cerrojo de integración (está integrando en main).

    (DIR1125AF, 25-11) `integrar.lock` es un flock: el archivo existe siempre, lo tenga alguien o no.
    Mirar solo si existía hacía que la cuarentena no actuara nunca (main estuvo sucio con trabajo
    ajeno sin que nadie lo apartara). Se prueba el flock sin esperar: si está tomado, hay integración.
    """
    if not os.path.exists(CERROJO_INTEGRAR):
        return False
    try:
        import fcntl
        with open(CERROJO_INTEGRAR, "a") as f:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except (BlockingIOError, PermissionError):
                return True
            fcntl.flock(f, fcntl.LOCK_UN)
            return False
    except Exception:
        return True  # ante la duda, no se toca main


def _leer_porcelain() -> str:
    """Devuelve la salida de `git status --porcelain`."""
    return _git("status", "--porcelain")


def _clasificar_cambios(porcelain: str) -> Tuple[List[str], List[str]]:
    """Clasifica cambios en (propios, ajenos).

    Propios = archivos que el enjambre escribe normalmente (ARCHIVOS_PROPIOS + colas versionadas).
    Ajenos = todo lo demás (trabajo de alguien editando main directamente).
    """
    from arbol_de_trabajo import clasificar, ruta_de
    propias, estorbo, ajenas = clasificar(porcelain)
    # Para la cuarentena, solo nos interesan los ajenos (trabajo real de alguien)
    # El estorbo lo maneja el guardia normal via curacion_logica
    # Las propias las commitea el guardia normal
    return propias, ajenas


def _es_estorbo(linea: str, ruta: str) -> bool:
    """Verifica si una línea de porcelain es estorbo (delega a curacion_logica)."""
    try:
        from curacion_logica import es_estorbo
        return es_estorbo(linea[:2], ruta)
    except Exception:
        # Fallback conservador: nada es estorbo aquí
        return False


def _filtrar_solo_trabajo_ajeno(porcelain: str) -> List[str]:
    """Devuelve solo las rutas de trabajo AJENO real (ni propias, ni estorbo)."""
    ajenos: List[str] = []
    for linea in (porcelain or "").splitlines():
        if not linea.strip():
            continue
        ruta = linea[3:].strip()
        if " -> " in ruta:
            ruta = ruta.split(" -> ", 1)[1].strip()
        if len(ruta) >= 2 and ruta[0] == '"' and ruta[-1] == '"':
            ruta = ruta[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        if not ruta:
            continue
        if ruta in ARCHIVOS_PROPIOS:
            continue
        # Verificar si es cola versionada propia
        if ruta.startswith("starseed_memory_root/olas/cola-") and ruta.endswith(".json"):
            continue
        if _es_estorbo(linea, ruta):
            continue
        ajenos.append(ruta)
    return ajenos


def _obtener_mtime_mas_antiguo(rutas: List[str]) -> float:
    """Obtiene el mtime más antiguo entre las rutas dadas (archivos en disco)."""
    mas_antiguo = time.time()
    for ruta in rutas:
        ruta_completa = os.path.join(ROOT, ruta)
        try:
            mtime = os.path.getmtime(ruta_completa)
            if mtime < mas_antiguo:
                mas_antiguo = mtime
        except OSError:
            pass
    return mas_antiguo


def _crear_carpeta_cuarentena() -> str:
    """Crea una carpeta de cuarentena con timestamp AAAAMMDD-HHMMSS."""
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    carpeta = os.path.join(CUARENTENA_BASE, timestamp)
    os.makedirs(carpeta, exist_ok=True)
    return carpeta


def _copiar_archivos_a_cuarentena(rutas: List[str], carpeta: str) -> List[str]:
    """Copia los archivos a la carpeta de cuarentena. Devuelve las rutas copiadas."""
    copiados = []
    for ruta in rutas:
        origen = os.path.join(ROOT, ruta)
        if not os.path.lexists(origen):
            continue
        destino = os.path.join(carpeta, ruta)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        try:
            if os.path.isdir(origen):
                shutil.copytree(origen, destino, symlinks=True)
            else:
                shutil.copy2(origen, destino)
            copiados.append(ruta)
        except OSError:
            pass
    return copiados


def _generar_parche(carpeta: str) -> bool:
    """Genera un parche git diff de los cambios y lo guarda en la carpeta."""
    try:
        parche = _git("diff", "HEAD")
        if parche.strip():
            with open(os.path.join(carpeta, "parche.patch"), "w", encoding="utf-8") as f:
                f.write(parche)
        # También incluir archivos sin seguimiento
        nuevos = _git("ls-files", "--others", "--exclude-standard")
        if nuevos.strip():
            with open(os.path.join(carpeta, "archivos_nuevos.txt"), "w", encoding="utf-8") as f:
                f.write(nuevos)
        return True
    except Exception:
        return False


def _escribir_manifiesto(carpeta: str, rutas: List[str], copiados: List[str]) -> Dict:
    """Escribe MANIFIESTO.json con metadatos de la cuarentena."""
    # Detectar quién tiene main abierto
    informe_editores = generar_informe_editores(ROOT)
    
    # Generar instrucciones de corrección para cada editor detectado
    correcciones = {}
    for ed in informe_editores.get("editores_detectados", []):
        editor_nombre = ed.get("editor")
        if editor_nombre:
            # Intentar determinar worktree base
            wt_base = os.environ.get("STARSEED_WT") or os.path.join(os.path.dirname(ROOT), "starseed-wt")
            correcciones[editor_nombre] = corregir_configuracion_editor(editor_nombre, wt_base)
    
    manifiesto = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "epoch": time.time(),
        "archivos_totales": len(rutas),
        "archivos_copiados": len(copiados),
        "archivos": [
            {"ruta": r, "copiado": r in copiados}
            for r in rutas
        ],
        "raiz_repo": ROOT,
        "rama": _git("branch", "--show-current").strip() or "main",
        "commit_head": _git("log", "--oneline", "-1").strip(),
        "quien_edita_main": informe_editores,
        "correcciones_sugeridas": correcciones,
    }
    with open(os.path.join(carpeta, "MANIFIESTO.json"), "w", encoding="utf-8") as f:
        json.dump(manifiesto, f, ensure_ascii=False, indent=2)
    return manifiesto


def _anunciar_en_canal(manifiesto: Dict, carpeta: str) -> None:
    """Anuncia la cuarentena en el canal Principal."""
    try:
        os.makedirs(os.path.dirname(CANAL), exist_ok=True)
        archivos_lista = ", ".join([a["ruta"] for a in manifiesto["archivos"][:10]])
        if len(manifiesto["archivos"]) > 10:
            archivos_lista += f" … (+{len(manifiesto['archivos']) - 10} más)"
        
        # Info de quién edita main
        editores = manifiesto.get("quien_edita_main", {}).get("editores_detectados", [])
        info_editores = ""
        if editores:
            nombres = [f"{e['editor']} (pid {e['pid']})" for e in editores]
            info_editores = f" Editores detectados en main: {', '.join(nombres)}."
        
        mensaje = (
            f"🔒 CUARENTENA: main tenía {manifiesto['archivos_totales']} archivo(s) con cambios "
            f"sin commit >15 min sin integración en curso. Apartados a {carpeta}: {archivos_lista}."
            f"{info_editores} Se creará tarea para reaplicar con pruebas."
        )
        fila = {
            "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            "epoch": time.time(),
            "quien": "apartar_arbol_sucio",
            "tipo": "aviso",
            "texto": mensaje,
            "tarea": "DIR1121C",
        }
        with open(CANAL, "a", encoding="utf-8") as f:
            f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    except Exception:
        pass  # Nunca fallar por el canal


def _limpiar_main(rutas: List[str]) -> bool:
    """Restaura los archivos en main a HEAD (descarta cambios)."""
    if not rutas:
        return True
    try:
        # Para archivos tracked: git checkout HEAD -- <archivo>
        tracked = [r for r in rutas if not _es_untracked(r)]
        if tracked:
            _git("checkout", "HEAD", "--", *tracked)
        # Para archivos untracked: borrar
        untracked = [r for r in rutas if _es_untracked(r)]
        for r in untracked:
            ruta_completa = os.path.join(ROOT, r)
            try:
                if os.path.isdir(ruta_completa):
                    shutil.rmtree(ruta_completa)
                else:
                    os.remove(ruta_completa)
            except OSError:
                pass
        return True
    except Exception:
        return False


def _es_untracked(ruta: str) -> bool:
    """True si el archivo no tiene seguimiento en git."""
    try:
        salida = _git("ls-files", "--error-unmatch", ruta)
        return not salida.strip()
    except subprocess.CalledProcessError:
        return True


def _escribir_json_atomico(ruta: str, datos) -> None:
    """Escribe JSON con archivo temporal y os.replace (nunca deja la cola a medias)."""
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ruta)


def _anadir_tarea_a_cola(ruta: str, tarea: Dict) -> bool:
    """Añade `tarea` a la cola JSON sin repetir id (atómico). True si queda en la cola."""
    try:
        try:
            with open(ruta, encoding="utf-8") as f:
                previas = json.load(f)
        except (OSError, ValueError):
            previas = []
        es_dict = isinstance(previas, dict)
        lista = (previas.get("tareas") or []) if es_dict else (previas if isinstance(previas, list) else [])
        lista = [t for t in lista if isinstance(t, dict)]
        if any(t.get("id") == tarea["id"] for t in lista):
            return True
        lista.append(tarea)
        _escribir_json_atomico(ruta, dict(previas, tareas=lista) if es_dict else lista)
        return True
    except Exception:
        return False


def _cola_viva_auto(olas: str) -> Optional[str]:
    """La tanda viva más reciente (`cola-auto-*`), o None si no hay orquestador en marcha."""
    try:
        colas = [
            (os.path.getmtime(os.path.join(olas, f)), os.path.join(olas, f))
            for f in os.listdir(olas)
            if f.startswith("cola-auto-") and f.endswith(".json")
        ]
    except OSError:
        return None
    if not colas:
        return None
    colas.sort(reverse=True)
    return colas[0][1]


def _crear_tarea_reaplicar(manifiesto: Dict, carpeta: str) -> bool:
    """Escribe la tarea de reaplicar en una cola FUENTE propia y avisa a la tanda viva.

    (QUA1125A) Antes solo iba a la cola viva (`cola-auto-*`): si el orquestador se
    reiniciaba antes de tomarla, se perdía. Ahora vive en
    `olas/cola-cuarentena-AAAAMMDD.json` (escritura atómica, sin duplicar ids) y, si
    hay tanda viva, se añade también allí.
    """
    try:
        tarea_id = f"REAPLICAR-{time.strftime('%Y%m%d-%H%M%S')}"
        nueva_tarea = {
            "id": tarea_id,
            "ola": "DIR1121C",
            "titulo": f"Reaplicar cambios de main en cuarentena ({len(manifiesto['archivos'])} archivos)",
            "archivos": [a["ruta"] for a in manifiesto["archivos"]],
            "depende": [],
            "prompt": (
                f"Los siguientes archivos estaban en main con cambios sin commit >15 min y fueron "
                f"apartados a cuarentena en {carpeta}. MANIFIESTO.json tiene los detalles.\n\n"
                f"Archivos: {', '.join([a['ruta'] for a in manifiesto['archivos']])}\n\n"
                f"Tu tarea: reaplicar estos cambios en un worktree limpio, pasando tsc y vitest. "
                f"Si los cambios son válidos, intégralos. Si son basura, descártalos y avisa."
            ),
            "tipo": "codigo",
            "prioridad": 50,
        }
        olas = os.path.join(ROOT, "starseed_memory_root", "olas")
        # 1. Cola fuente: sobrevive a cualquier reinicio del orquestador.
        fuente = os.path.join(olas, "cola-cuarentena-%s.json" % time.strftime("%Y%m%d"))
        en_fuente = _anadir_tarea_a_cola(fuente, nueva_tarea)
        # 2. Tanda viva: que arranque ya si hay orquestador en marcha.
        viva = _cola_viva_auto(olas)
        if viva:
            _anadir_tarea_a_cola(viva, nueva_tarea)
        return en_fuente
    except Exception:
        return False


def apartar_si_lleva_tiempo(ahora: Optional[float] = None) -> bool:
    """Función principal: si main lleva >15 min sucio sin cerrojo integrar, lo pone en cuarentena.

    Args:
        ahora: timestamp actual (para pruebas). Si None, usa time.time().

    Returns:
        True si apartó algo, False si no hizo nada.
    """
    ahora = ahora or time.time()

    # 1. Verificar cerrojo de integración
    if _hay_cerrojo_integrar():
        return False

    # 2. Leer estado del árbol
    porcelain = _leer_porcelain()
    if not porcelain.strip():
        return False  # Árbol limpio

    # 3. Filtrar solo trabajo ajeno real
    ajenos = _filtrar_solo_trabajo_ajeno(porcelain)
    if not ajenos:
        return False  # Solo propias/estorbo → el guardia normal lo maneja

    # 4. Verificar antigüedad (mtime más antiguo > 15 min)
    mtime_mas_antiguo = _obtener_mtime_mas_antiguo(ajenos)
    if ahora - mtime_mas_antiguo < UMBRAL_SEGUNDOS:
        return False  # Muy recientes

    # 5. Crear carpeta de cuarentena
    carpeta = _crear_carpeta_cuarentena()

    # 6. Copiar archivos a cuarentena (NUNCA borrar sin copia verificada)
    copiados = _copiar_archivos_a_cuarentena(ajenos, carpeta)
    if len(copiados) != len(ajenos):
        # Si no se pudieron copiar todos, no continuar (seguridad)
        shutil.rmtree(carpeta, ignore_errors=True)
        return False

    # 7. Generar parche
    _generar_parche(carpeta)

    # 8. Escribir manifiesto
    manifiesto = _escribir_manifiesto(carpeta, ajenos, copiados)

    # 9. Limpiar main (descartar cambios)
    if not _limpiar_main(ajenos):
        # Si falla la limpieza, no anunciamos ni creamos tarea
        return False

    # 10. Anunciar en canal
    _anunciar_en_canal(manifiesto, carpeta)

    # 11. Crear tarea para reaplicar
    _crear_tarea_reaplicar(manifiesto, carpeta)

    return True


if __name__ == "__main__":
    # Permite ejecución directa para pruebas manuales
    resultado = apartar_si_lleva_tiempo()
    print("Apartó:" if resultado else "No hizo nada")
    sys.exit(0 if resultado else 1)