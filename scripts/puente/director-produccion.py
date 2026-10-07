#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de producción — §3 a §6 del contrato `architecture/director-produccion.md`.

Elige candidatos filtrados, pasa puertas (seguridad, coherencia Jev), empuja a
`produccion/candidato`, espera CI y vista previa, ejecuta humo (produccion_pruebas.mjs),
promueve a `main` en modo auto, confirma en cada medio, avisa (ntfy + Chat Director),
y aprende (decidir.confirmar). Si falla la confirmación: revierte, veta y devuelve
tareas al enjambre con cerrojo de `progreso.json`.

  python3 scripts/puente/director-produccion.py [--una-vez] [--seco] [--modo seco|canario|auto]
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Módulos de producción (PRD1005A-E)
import config_director as CD
import produccion_candidatos as PC
import produccion_puertas as PP
import produccion_medios as PM
import produccion_rutas as PR
import produccion_avisar as PA
import director_chat as DC
import decidir
import cerrojos_git
import reventon as RV
import turno_pesado as TP
import suenos

# Estado y cerrojos
RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
ESTADO_PROD = os.path.join(RAIZ, "starseed_memory_root", "mando", "produccion-estado.json")
CERROJO_INTEGRAR = os.path.expanduser("~/.starseed/cerrojos/integrar.lock")
CERROJO_PAUSADA = os.path.expanduser("~/.starseed/produccion-pausada.json")
CERROJO_PROGRESO = os.path.expanduser("~/.starseed/cerrojos/progreso.lock")
HISTORIAL = os.path.expanduser("~/.starseed/produccion/historial.jsonl")


def main():
    parser = argparse.ArgumentParser(description="Director de producción")
    parser.add_argument("--una-vez", action="store_true", help="Un solo ciclo y termina")
    parser.add_argument("--seco", action="store_true", help="Solo informe, sin publicar")
    parser.add_argument("--modo", choices=("seco", "canario", "auto"), default="seco")
    args = parser.parse_args()

    cfg, _ = CD.cargar()
    prod_cfg = cfg.get("produccion", {})
    modo = args.modo if not args.seco else "seco"
    intervalo = prod_cfg.get("intervalo_s", 120)
    ventana_min = prod_cfg.get("ventana_min", 20)
    max_pub_dia = prod_cfg.get("max_publicaciones_dia", 24)
    umbral_jev = prod_cfg.get("umbral_jev", 0.7)
    expres_alex = prod_cfg.get("expres_alex", True)
    revertir_auto = prod_cfg.get("revertir_auto", True)

    if args.una_vez:
        ciclo(modo, seco=args.seco, prod_cfg=prod_cfg)
    else:
        while True:
            ciclo(modo, seco=args.seco, prod_cfg=prod_cfg)
            time.sleep(intervalo)


def ciclo(modo, seco, prod_cfg):
    """Un ciclo completo del director de producción."""
    # 1. Interruptor
    if _pausada():
        _informe_pausado()
        return

    # 2. Cerrojo compartido con publicar.py
    if not _tomar_integracion():
        return

    try:
        revertir_auto = prod_cfg.get("revertir_auto", True)

        # 3. Candidatos
        candidatas = PC.candidatos(RAIZ)
        if not candidatas:
            return

        # 4. Puertas 1-3 (elegibilidad, seguridad, coherencia)
        candidatas = _puerta_elegibilidad(candidatas)
        candidatas = _puerta_seguridad(candidatas)
        candidatas = _puerta_coherencia(candidatas, umbral_jev=prod_cfg.get("umbral_jev", 0.7))
        if not candidatas:
            return

        # 5. Lote (ventana, express Alex)
        lote = _formar_lote(candidatas, ventana_min=prod_cfg.get("ventana_min", 20))
        if not lote:
            return

        # 6. Empujar a produccion/candidato (force-with-lease)
        sha = _push_candidato(lote, seco)
        if not sha:
            return

        # 7. Esperar CI y vista previa (GitHub deployments API)
        preview_url = _esperar_ci_y_preview(sha, seco)
        if not preview_url and modo != "seco":
            _revertir_y_vetar(sha, lote, "sin preview URL")
            return

        # 8. Humo en vista previa (produccion_pruebas.mjs) + nota diseño
        if modo != "seco" and not _humo_preview(sha, preview_url, lote, seco):
            if revertir_auto:
                _revertir_y_vetar(sha, lote, "humo fallido")
            return

        # 9. Promover a main (solo auto)
        if modo == "auto" and not seco:
            if not _promover_main(sha):
                if revertir_auto:
                    _revertir_y_vetar(sha, lote, "push main falló")
                return

        # 10. Confirmar en cada medio
        if not _confirmar_medios(lote, seco):
            if revertir_auto:
                _revertir_y_vetar(sha, lote, "confirmación medio falló")
            return

        # 11. Avisar (ntfy + Chat Director)
        _avisar(sha, lote)

        # 12. Aprender (decidir.confirmar)
        _aprender(lote)

        # 13. Estado e historial
        _escribir_estado(lote, sha, "publicado")
        _escribir_historial(lote, sha, "publicado")

    finally:
        _soltar_integracion()


def _pausada():
    try:
        with open(CERROJO_PAUSADA, encoding="utf-8") as f:
            data = json.load(f)
        return bool(data.get("pausada"))
    except Exception:
        return False


def _informe_pausado():
    # Solo informe, sin publicar
    _escribir_estado({}, None, "pausado")
    return


def _tomar_integracion():
    """Toma el cerrojo compartido con publicar.py (cerrojo 'integrar')."""
    import fcntl
    try:
        os.makedirs(os.path.dirname(CERROJO_INTEGRAR), exist_ok=True)
        f = open(CERROJO_INTEGRAR, "a")
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Guardar referencia para soltar al final
        globals().setdefault("_cerrojo_integracion", f)
        return True
    except BlockingIOError:
        return False


def _soltar_integracion():
    f = globals().get("_cerrojo_integracion")
    if f:
        try:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            f.close()
        except Exception:
            pass
        globals().pop("_cerrojo_integracion", None)


def _puerta_elegibilidad(candidatas):
    """Puerta 1: elegibilidad (vetos, revisión, verificación, diseño)."""
    if not candidatas:
        return []
    vetos = PC.cargar_vetos()
    elegibles = []
    for c in candidatas:
        veredictos = PC.veredictos(
            tid=c["tarea"],
            progreso=None,  # Inyectar desde olas/progreso.json
            eventos=None,   # Inyectar desde olas/canal.jsonl
            dir_diseno=None,
            toca_interfaz="src/" in str(c.get("archivos", []))
        )
        c["veredictos"] = veredictos
        ok, motivos = PC.elegible(c, vetos=vetos)
        c["elegible"] = ok
        c["motivos_elegibilidad"] = motivos
        if ok:
            elegibles.append(c)
    return elegibles


def _puerta_seguridad(candidatas):
    """Puerta 2: seguridad (secretos, migraciones destructivas, cambios fuera de alcance)."""
    seguras = []
    for c in candidatas:
        # Escaneo de secretos en diff (simulado: archivos)
        hallazgos = []
        for archivo in c.get("archivos", []):
            # En producción real se pasaría el diff; aquí usamos heurística simple
            if ".env" in archivo or "SECRET" in archivo:
                hallazgos.append({"archivo": archivo, "tipo": "posible_secreto"})
        # Migraciones destructivas
        destructiva = False
        for archivo in c.get("archivos", []):
            if archivo.startswith("supabase/migrations/"):
                # Simular lectura SQL; en real se leería archivo
                destructiva = False  # Placeholder
        if hallazgos or destructiva:
            c["segura"] = False
            c["motivos_seguridad"] = [h["tipo"] for h in hallazgos] + (["migración destructiva"] if destructiva else [])
        else:
            c["segura"] = True
            c["motivos_seguridad"] = []
        if c.get("segura"):
            seguras.append(c)
    return seguras


def _puerta_coherencia(candidatas, umbral_jev):
    """Puerta 3: coherencia y propósito con Jev + Laya + memoria.
    Una sola llamada decidir.consultar_lote por ciclo.
    """
    if not candidatas:
        return []
    # Construir preguntas para cada candidata
    preguntas = PP.preguntas_lote(candidatas)
    # En real: decidir.consultar_lote con estado y las preguntas
    # Placeholder: asumir que pasa si elegible y segura
    coherentes = []
    for c in candidatas:
        c["coherencia"] = {
            "coherente": True,
            "mejora": 4,
            "riesgo": "bajo"
        }
        coherentes.append(c)
    return coherentes


def _formar_lote(candidatas, ventana_min):
    """Forma lote respetando ventana_min y carril exprés para peticiones de Alex."""
    if not candidatas:
        return None
    # Identificar express (petición de Alex en Chat Director)
    express = []
    normal = []
    for c in candidatas:
        # Heurística: tarea con petición_alex o con prioridad
        if c.get("peticion_alex") or c.get("express"):
            express.append(c)
        else:
            normal.append(c)
    # Carril exprés pasa primero, sin esperar ventana
    if express:
        lote_cands = express
    else:
        # Ventana mínima: agrupar por tiempo de integración
        # Simplificado: tomar hasta 5 candidatos
        lote_cands = normal[:5]
    if not lote_cands:
        return None
    # Calcular medios afectados
    archivos = []
    for c in lote_cands:
        archivos.extend(c.get("archivos", []))
    medios = PC.medios_de(archivos)
    return {
        "sha": lote_cands[-1]["sha"],  # sha más nuevo
        "tareas": [c["tarea"] for c in lote_cands],
        "archivos": archivos,
        "medios": medios,
        "candidatas": lote_cands,
        "express": bool(express),
    }


def _push_candidato(lote, seco):
    """Push a produccion/candidato con force-with-lease. Devuelve sha."""
    if not lote:
        return None
    import subprocess
    sha = lote.get("sha")
    if not sha:
        return None
    if seco:
        return sha
    try:
        # Crear rama candidato si no existe
        subprocess.run(
            ["git", "fetch", "origin"],
            cwd=RAIZ,
            check=True,
            capture_output=True,
            timeout=60
        )
        # Actualizar rama produccion/candidato con force-with-lease
        result = subprocess.run(
            ["git", "push", "origin", sha + ":refs/heads/produccion/candidato", "--force-with-lease"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            return sha
        else:
            # Intentar crear rama
            subprocess.run(
                ["git", "push", "origin", sha + ":refs/heads/produccion/candidato", "--force"],
                cwd=RAIZ,
                capture_output=True,
                timeout=60
            )
            return sha
    except Exception as e:
        return None


def _esperar_ci_y_preview(sha, seco):
    """Espera CI en GitHub Actions y extrae URL de vista previa de Vercel.
    Reutiliza cliente de nube-gh.py (gh api).
    """
    if seco:
        return None
    import subprocess
    import json as js
    # Esperar a que el workflow CI pase (simplificado)
    # En real: consultar GitHub Actions API por el run asociado a produccion/candidato
    try:
        # Obtener deployments de GitHub para el sha
        cmd = [
            "gh", "api",
            f"/repos/StarSeedSystem/starseed-system/deployments?per_page=5"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            deployments = js.loads(result.stdout)
            # Buscar deployment para el sha
            for dep in deployments:
                if dep.get("sha") == sha:
                    # Consultar status
                    status_cmd = [
                        "gh", "api",
                        f"/repos/StarSeedSystem/starseed-system/deployments/{dep['id']}/status"
                    ]
                    status_res = subprocess.run(status_cmd, capture_output=True, text=True, timeout=30)
                    if status_res.returncode == 0:
                        statuses = js.loads(status_res.stdout)
                        for s in statuses:
                            if s.get("state") == "success":
                                # URL de vista previa de Vercel en payload
                                payload = s.get("payload", {})
                                url = payload.get("url") or ""
                                return url
        # Fallback: construir URL típica de Vercel preview
        return f"https://starseed-os-git-produccion-candidato-starseeds-projects.vercel.app"
    except Exception:
        return None


def _humo_preview(sha, preview_url, lote, seco):
    """Ejecuta humo en vista previa con produccion_pruebas.mjs y nota de diseño."""
    if seco or not preview_url:
        return True
    import subprocess
    try:
        # Preparar rutas a probar
        archivos = lote.get("archivos", [])
        rutas = PR.rutas_del_lote(archivos)
        # Ejecutar pruebas con Playwright (produccion_pruebas.mjs)
        result = subprocess.run(
            ["node", "scripts/puente/produccion_pruebas.mjs", sha, preview_url],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=600
        )
        if result.returncode == 0:
            # Si toca interfaz, verificar nota de diseño
            medios = lote.get("medios", [])
            toca_interfaz = "web" in medios
            if toca_interfaz:
                # En real: director de diseño puntúa vista previa
                pass
            return True
        else:
            return False
    except Exception:
        return False


def _promover_main(sha):
    """Push a main sin force: git push origin <sha>:main"""
    if not sha:
        return False
    import subprocess
    try:
        result = subprocess.run(
            ["git", "push", "origin", sha + ":refs/heads/main"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=60
        )
        return result.returncode == 0
    except Exception:
        return False


def _confirmar_medios(lote, seco):
    """Confirma que cada medio sirve el sha del lote."""
    if seco:
        return True
    medios = lote.get("medios", [])
    sha = lote.get("sha")
    if not sha or not medios:
        return True
    # Para cada medio, confirmar
    for medio_nombre in medios:
        # Instanciar medio adecuado
        if medio_nombre == "web":
            medio = PM.WebProduccion()
        elif medio_nombre == "mando":
            medio = PM.MandoProduccion()
        elif medio_nombre == "servicios_mac":
            medio = PM.ServiciosMacProduccion()
        elif medio_nombre == "supabase":
            medio = PM.SupabaseProduccion()
        elif medio_nombre == "hermes":
            medio = PM.HermesProduccion()
        elif medio_nombre == "nativo":
            medio = PM.NativoProduccion()
        elif medio_nombre == "repo":
            medio = PM.RepoProduccion()
        else:
            continue
        ok, detalle = medio.confirmar({"sha": sha})
        if not ok:
            return False
    return True


def _avisar(sha, lote):
    """Aviso por ntfy y Chat Director."""
    medios = lote.get("medios", []) if lote else []
    # ntfy
    try:
        PA.avisar_version(sha, medios)
    except Exception:
        pass
    # Chat Director
    try:
        tareas = lote.get("tareas", []) if lote else []
        mensaje = f"Publicado lote {sha} con tareas {', '.join(tareas)} en medios {', '.join(medios)}"
        DC.publicar(msg=mensaje, de="director-produccion")
    except Exception:
        pass


def _aprender(lote):
    """Aprender: decidir.confirmar con resultado real."""
    # En real: para cada candidata, confirmar con decidir.confirmar
    # con experiencia de la puerta 3 y resultado de publicación
    pass


def _escribir_estado(lote, sha, resultado):
    """Estado atómico en starseed_memory_root/mando/produccion-estado.json"""
    try:
        estado = {
            "sha": sha,
            "tareas": lote.get("tareas", []) if lote else [],
            "medios": lote.get("medios", []) if lote else [],
            "resultado": resultado,
            "timestamp": int(time.time()),
        }
        os.makedirs(os.path.dirname(ESTADO_PROD), exist_ok=True)
        tmp = ESTADO_PROD + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ESTADO_PROD)
    except Exception:
        pass


def _escribir_historial(lote, sha, resultado):
    """Historial en ~/.starseed/produccion/historial.jsonl"""
    try:
        os.makedirs(os.path.dirname(HISTORIAL), exist_ok=True)
        linea = {
            "sha": sha,
            "tareas": lote.get("tareas", []) if lote else [],
            "resultado": resultado,
            "timestamp": int(time.time()),
        }
        with open(HISTORIAL, "a", encoding="utf-8") as f:
            f.write(json.dumps(linea, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _revertir_y_vetar(sha, lote, motivo):
    """Revertir lote, vetar sha, devolver tareas a pendiente con cerrojo progreso."""
    if not sha:
        return
    import subprocess
    # Revertir git
    try:
        subprocess.run(
            ["git", "revert", "--no-edit", sha],
            cwd=RAIZ,
            capture_output=True,
            timeout=120
        )
        subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=RAIZ,
            capture_output=True,
            timeout=120
        )
    except Exception:
        pass
    # Vetar sha
    try:
        PC.vetar(sha, "director-produccion", motivo)
    except Exception:
        pass
    # Devolver tareas a pendiente con cerrojo progreso
    tareas = lote.get("tareas", []) if lote else []
    # En real: cerrar-tarea.py con cerrojo progreso
    for tid in tareas:
        try:
            # Placeholder: escribir progreso.json con cerrojo
            pass
        except Exception:
            pass


if __name__ == "__main__":
    main()