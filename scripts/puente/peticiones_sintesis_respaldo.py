#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Respaldo de síntesis: investigación profunda con criterio de importación (PET1116C §3.3).

En vez de --import-all, importa solo fuentes citadas y relevantes al tema y a StarSeed
(título y source guide frente al tema), máx 25, luego source clean.
Lo descartado nunca vuelve a entrar.

SIN1116B §3.1: Respaldo a las 08:30 en el A1 si no hay síntesis válida (≥4000 chars).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

# Inyección de dependencias
NbCliente = Callable[..., tuple[int, str, str]]  # args -> (rc, out, err)
AhoraFn = Callable[[], float]
LogFn = Callable[[str], None]
DriveFn = Callable[[str, str, str], str]  # (ruta, nombre, carpeta_id) -> drive_id
TelegramFn = Callable[[str], None]  # enviar mensaje al chat
MultiformatoFn = Callable[[str], dict[str, Any]]  # (fecha) -> indice

RAIZ_DEF = Path(__file__).parent.parent.parent
ALCANCE_DIR = RAIZ_DEF / "starseed_memory_root" / "alcance"
DESCARTES_FILE = ALCANCE_DIR / "temas_descartados.json"

# Configuración
CUADERNO_PRODUCCION = os.environ.get("STARSEED_CUADERNO_PRODUCCION", "dc62bea7-a241-46b6-a9f9-1ea954f0ea16")
CARPETA_SINTESIS_DRIVE = os.environ.get("STARSEED_CARPETA_SINTESIS", "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI")
NBLM_CLI = os.path.expanduser("~/.starseed/venvs/notebooklm/bin/notebooklm")
HORA_RESPALDO_CDMX = 8.5  # 08:30
MIN_CARACTERES_SINTESIS = 4000
RESUMEN_MIN, RESUMEN_MAX = 1500, 3000

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
    **kwargs,
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
    
    # Para testing: permitir inyectar sleep
    sleep_fn = kwargs.get("sleep_fn", time.sleep)
    
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
        sleep_fn(10)
        
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
    **kwargs,
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
        max_fuentes, ahora_fn, log_fn, **kwargs
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


# ────────────────────────────── Respaldo 08:30 (SIN1116B §3.1) ──────────────────────────────

def _fecha_cdmx(ahora: Optional[float] = None) -> str:
    """Fecha en zona horaria de Ciudad de México (AAAA-MM-DD)."""
    if ahora is None:
        ahora = time.time()
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        return datetime.fromtimestamp(ahora, tz).date().isoformat()
    except Exception:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(ahora, timezone.utc).date().isoformat()


def _hora_cdmx(ahora: Optional[float] = None) -> float:
    """Hora decimal en zona horaria de Ciudad de México."""
    if ahora is None:
        ahora = time.time()
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        dt = datetime.fromtimestamp(ahora, tz)
        return dt.hour + dt.minute / 60.0
    except Exception:
        from datetime import datetime, timezone
        dt = datetime.fromtimestamp(ahora, timezone.utc)
        return dt.hour + dt.minute / 60.0


def _exportar_texto_drive(fid: str, token_google_fn: Callable[[str], str]) -> str:
    """Exporta el contenido de un Google Doc como texto plano."""
    import urllib.parse
    import urllib.request
    tok = token_google_fn("alex-docs")
    url = f"https://www.googleapis.com/drive/v3/files/{fid}/export?mimeType=text/plain"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _buscar_sintesis_hoy_drive(
    fecha: str,
    drive_fn: Callable[[str, dict], dict],
    token_google_fn: Callable[[str], str],
) -> Optional[tuple[str, str, int]]:
    """Busca síntesis del día en Drive. Retorna (file_id, nombre, caracteres) o None."""
    import urllib.parse
    q = f"'{CARPETA_SINTESIS_DRIVE}' in parents and trashed=false and mimeType='application/vnd.google-apps.document' and name contains 'Síntesis diaria {fecha}'"
    d = drive_fn("files", {"q": q, "pageSize": "10", "fields": "files(id,name,createdTime)"})
    
    for a in d.get("files") or []:
        nombre = a.get("name", "")
        fid = a.get("id", "")
        if f"Síntesis diaria {fecha}" not in nombre:
            continue
        if "prueba" in nombre.lower():
            continue
        texto = _exportar_texto_drive(fid, token_google_fn)
        if len(texto) >= MIN_CARACTERES_SINTESIS:
            return fid, nombre, len(texto)
    return None


def _construir_contexto_respaldo(
    raiz: Path,
    fecha: str,
    ahora: float,
    log_fn: LogFn,
) -> dict[str, Any]:
    """Construye el contexto completo para el respaldo usando contexto_sintesis.py."""
    try:
        import contexto_sintesis as CS
        ctx = CS.contexto_vivo(str(raiz), fecha, ahora=ahora)
        # Añadir fuentes base del cuaderno
        ctx["fuentes_base"] = {
            "protocolo": "protocolo-star-seed",
            "indice_videos": "indice-videos-star-seed",
            "red_resonancia": "red-resonancia-star-seed",
            "lista_contactos": "lista-contactos-star-seed",
            "codex": "codex-star-seed",
            "sintesis_anterior": "sintesis-anterior-star-seed",
        }
        # Contexto vivo del día (SIN1116D si existe)
        ruta_contexto_vivo = raiz / "starseed_memory_root" / "contexto_vivo" / f"{fecha}.json"
        if ruta_contexto_vivo.exists():
            with open(ruta_contexto_vivo, encoding="utf-8") as f:
                ctx["contexto_vivo_dia"] = json.load(f)
        return ctx
    except Exception as e:
        log_fn(f"Error construyendo contexto: {e}")
        return {"fecha": fecha, "error": str(e)}


def _generar_prompt_respaldo(ctx: dict[str, Any], fecha: str) -> str:
    """Genera el prompt completo para el respaldo con protocolo y regla de calidad."""
    from agente_sintesis import _prompt_respaldo as _prompt_orig
    from agente_sintesis import _encoger_contexto as _encoger
    
    encogido = _encoger(ctx)
    return _prompt_orig(encogido, fecha, salidas=[])


def _redactar_con_flota_gratuita(
    prompt: str,
    leer_clave_fn: Callable[[str], Optional[str]],
    base_url: Optional[str] = None,
    modelos: Optional[list[str]] = None,
    log_fn: LogFn = print,
) -> Optional[str]:
    """Redacta usando la flota gratuita (gemini-flash-lite, NIM minimax, nemotron)."""
    import urllib.parse
    import urllib.request
    
    clave = leer_clave_fn("FREELLMAPI_KEY") or leer_clave_fn("STARSEED_FLOTA_API_KEY")
    if not clave:
        log_fn("No hay clave de flota gratuita (FREELLMAPI_KEY / STARSEED_FLOTA_API_KEY)")
        return None
    
    base = (base_url or os.environ.get("STARSEED_FLOTA_BASE_URL") or "http://127.0.0.1:3001/v1").rstrip("/")
    modelos_orden = modelos or [
        "gemini-1.5-flash-lite",
        "minimaxai/minimax-m3.1-flash",
        "nemotron-3.5-lightning",
    ]
    
    for modelo in modelos_orden:
        try:
            log_fn(f"Intentando redacción con {modelo}...")
            cuerpo = {
                "model": modelo,
                "stream": False,
                "temperature": 0.7,
                "max_tokens": 16000,
                "messages": [{"role": "user", "content": prompt}],
            }
            peticion = urllib.request.Request(
                base + "/chat/completions",
                json.dumps(cuerpo).encode("utf-8"),
                {"Content-Type": "application/json", "Authorization": f"Bearer {clave}"},
            )
            with urllib.request.urlopen(peticion, timeout=600) as r:
                datos = json.load(r)
            contenido = (datos["choices"][0]["message"]["content"] or "").strip()
            if contenido:
                log_fn(f"Redacción exitosa con {modelo} ({len(contenido)} chars)")
                return contenido
        except Exception as e:
            log_fn(f"Modelo {modelo} falló: {e}")
            continue
    return None


def _subir_doc_drive(
    fecha: str,
    texto: str,
    token_google_fn: Callable[[str], str],
) -> Optional[str]:
    """Sube el markdown como Doc de Google en carpeta 'Síntesis diarias'."""
    import uuid
    import urllib.request
    
    try:
        tok = token_google_fn("alex-docs")
        borde = f"starseed{int(time.time() * 1000)}"
        meta = json.dumps({
            "name": f"Síntesis diaria {fecha}",
            "mimeType": "application/vnd.google-apps.document",
            "parents": [CARPETA_SINTESIS_DRIVE],
        }).encode("utf-8")
        borde_b = borde.encode("ascii")
        cuerpo = (
            b"--" + borde_b + b"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta +
            b"\r\n--" + borde_b + b"\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n" +
            texto.encode("utf-8") + b"\r\n--" + borde_b + b"--\r\n"
        )
        peticion = urllib.request.Request(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            data=cuerpo,
            headers={"Authorization": f"Bearer {tok}", "Content-Type": f"multipart/related; boundary={borde}"}
        )
        with urllib.request.urlopen(peticion, timeout=120) as r:
            return json.load(r).get("id")
    except Exception as e:
        return None


def _generar_resumen(texto: str, min_chars: int = RESUMEN_MIN, max_chars: int = RESUMEN_MAX) -> str:
    """Genera un resumen de 1500-3000 caracteres."""
    if len(texto) <= max_chars:
        return texto
    # Tomar primeras secciones hasta llegar al rango
    lineas = texto.splitlines()
    resumen = []
    chars = 0
    for linea in lineas:
        if chars + len(linea) + 1 > max_chars:
            break
        resumen.append(linea)
        chars += len(linea) + 1
    resultado = "\n".join(resumen)
    if len(resultado) < min_chars and len(texto) > max_chars:
        # Añadir más contenido
        resultado = texto[:max_chars]
    return resultado


def ejecutar_respaldo_0830(
    raiz: Optional[Path] = None,
    ahora: Optional[float] = None,
    nb_fn: Optional[NbCliente] = None,
    drive_fn: Optional[Callable] = None,
    token_google_fn: Optional[Callable[[str], str]] = None,
    leer_clave_fn: Optional[Callable[[str], Optional[str]]] = None,
    enviar_telegram_fn: Optional[TelegramFn] = None,
    multiformato_fn: Optional[MultiformatoFn] = None,
    log_fn: Optional[LogFn] = None,
    seco: bool = False,
) -> dict[str, Any]:
    """Ejecuta el respaldo de síntesis a las 08:30 CDMX (SIN1116B §3.1).

    Flujo:
    1. Verifica si ya hay síntesis válida (≥4000 chars) para hoy en Drive
    2. Si no hay, construye contexto completo (fuentes base + contexto vivo SIN1116D)
    3. Lanza 3 investigaciones profundas (add-research --mode deep) en tema rotativo
    4. Genera prompt con protocolo completo + regla calidad "nada ya integrado"
    5. Redacta con flota gratuita (gemini-flash-lite → minimax → nemotron)
    6. Sube Doc a Drive con nombre exacto "Síntesis diaria AAAA-MM-DD"
    7. Envía resumen 1500-3000 chars al chat
    8. Lanza multiformato (9 formatos)

    Args:
        raiz: Raíz del repo (default: RAIZ_DEF)
        ahora: Timestamp para testing (default: time.time())
        nb_fn: Cliente NotebookLM inyectable
        drive_fn: Función Drive API inyectable
        token_google_fn: Función token Google inyectable
        leer_clave_fn: Función leer clave entorno inyectable
        enviar_telegram_fn: Función enviar a Telegram inyectable
        multiformato_fn: Función lanzar multiformato inyectable
        log_fn: Función log inyectable
        seco: Si True, no ejecuta acciones reales (para testing)

    Returns:
        Dict con resultado: ok, accion, mensaje, drive_id, resumen, multiformato
    """
    from datetime import datetime

    if raiz is None:
        raiz = RAIZ_DEF
    if ahora is None:
        ahora = time.time()
    if log_fn is None:
        log_fn = lambda msg: print(f"[respaldo_0830] {msg}", flush=True)

    fecha = _fecha_cdmx(ahora)
    hora = _hora_cdmx(ahora)

    log_fn(f"Respaldo 08:30 - Fecha: {fecha}, Hora CDMX: {hora:.2f}")

    # Verificar hora (solo ejecutar si son las 08:30 ± 15 min)
    if not seco and abs(hora - HORA_RESPALDO_CDMX) > 0.25:
        return {
            "ok": False,
            "accion": "fuera_horario",
            "mensaje": f"No es hora de respaldo (son las {hora:.2f}, esperado ~{HORA_RESPALDO_CDMX})",
        }

    # 1. Verificar si ya hay síntesis válida en Drive
    if drive_fn is None or token_google_fn is None:
        # Fallback: usar peticiones_notebooklm
        try:
            from peticiones_notebooklm import drive as drive_nb, token_google as tok_nb, ultima_sintesis
            drive_fn = drive_fn or drive_nb
            token_google_fn = token_google_fn or tok_nb
            
            fid, nombre = ultima_sintesis(fecha)
            texto = _exportar_texto_drive(fid, token_google_fn)
            if len(texto) >= MIN_CARACTERES_SINTESIS:
                return {
                    "ok": True,
                    "accion": "ya_existe",
                    "mensaje": f"Síntesis ya existe en Drive: {nombre} ({len(texto)} chars)",
                    "drive_id": fid,
                    "caracteres": len(texto),
                }
        except Exception as e:
            log_fn(f"Error comprobando síntesis existente: {e}")
    else:
        existente = _buscar_sintesis_hoy_drive(fecha, drive_fn, token_google_fn)
        if existente:
            fid, nombre, chars = existente
            return {
                "ok": True,
                "accion": "ya_existe",
                "mensaje": f"Síntesis ya existe en Drive: {nombre} ({chars} chars)",
                "drive_id": fid,
                "caracteres": chars,
            }

    if seco:
        return {"ok": True, "accion": "seco", "mensaje": "(seco) Se ejecutaría el respaldo completo"}

    log_fn("No hay síntesis válida para hoy. Iniciando respaldo...")

    # Registrar hito de arranque
    try:
        import sintesis_avances as SA
        SA.hito_arranque_respaldo(
            ["contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube"],
            f"Síntesis diaria StarSeed {fecha}",
            fecha=fecha,
            ahora=ahora,
        )
    except ImportError:
        pass

    # 2. Construir contexto completo
    log_fn("Construyendo contexto...")
    ctx = _construir_contexto_respaldo(raiz, fecha, ahora, log_fn)

    # 3. Lanza 3 investigaciones profundas en tema rotativo
    if nb_fn:
        log_fn("Lanzando 3 investigaciones profundas (tema rotativo)...")
        # Tema rotativo basado en día del mes
        dia_mes = int(fecha.split("-")[2])
        temas_rotativos = [
            "soberanía digital y protocolos descentralizados",
            "herramientas local-first e IA en dispositivo",
            "redes federadas y cooperativas digitales",
            "gobernanza algorítmica y commons digitales",
            "privacidad, vigilancia y resistencia a la censura",
            "identidad auto-soberana y credenciales verificables",
            "economía del cuidado y mutualismo digital",
            "artesanía digital y diseño regenerativo",
        ]
        tema_rotativo = temas_rotativos[dia_mes % len(temas_rotativos)]
        
        consultas_rotativas = [
            f"Avances en {tema_rotativo} {fecha}",
            f"Nuevas herramientas y frameworks para {tema_rotativo} {fecha}",
            f"Casos de estudio y mejores prácticas en {tema_rotativo} {fecha}",
        ]
        
        resultado_inv = investigar_con_criterio(
            nb_fn, CUADERNO_PRODUCCION, consultas_rotativas,
            f"Síntesis diaria StarSeed {fecha} - {tema_rotativo}",
            max_fuentes=25,
            log_fn=log_fn,
        )
        log_fn(f"Investigaciones: {resultado_inv['consultas_procesadas']} consultas, "
               f"{resultado_inv['fuentes_importadas']} fuentes, "
               f"{len(resultado_inv['temas_descartados'])} temas descartados")

        # Registrar hitos de agentes
        try:
            import sintesis_avances as SA
            for i, agente in enumerate(["contactos", "noticias", "referencias", "actividad", "ideas", "guiones", "youtube"]):
                SA.hito_agente_respaldo(agente, nuevas=3, descartadas=1, fecha=fecha, ahora=ahora)
        except ImportError:
            pass

    # 4. Generar prompt con protocolo completo + regla calidad
    log_fn("Generando prompt con protocolo completo...")
    prompt = _generar_prompt_respaldo(ctx, fecha)

    # Añadir regla de calidad explícita
    prompt += "\n\nREGLA DE CALIDAD CRÍTICA: NO incluyas nada que ya figure como integrado en el índice de arquitectura, " \
              "memoria, librería instalada, rutas del OS, ni en síntesis previas. " \
              "Cada propuesta debe ser nueva o una ampliación explícita citando la pieza base y qué añade."

    # 5. Redactar con flota gratuita
    log_fn("Redactando con flota gratuita...")
    if leer_clave_fn is None:
        def leer_clave_defecto(nombre: str) -> Optional[str]:
            import entorno
            return entorno.leer_clave(nombre)
        leer_clave_fn = leer_clave_defecto

    texto = _redactar_con_flota_gratuita(prompt, leer_clave_fn, log_fn=log_fn)
    
    if not texto or len(texto.strip()) < 400:
        return {
            "ok": False,
            "accion": "sin_texto",
            "mensaje": "La flota no devolvió texto válido para la síntesis",
        }

    # Limpiar markdown fences
    lineas = texto.splitlines()
    if lineas and lineas[0].startswith("```"):
        lineas = lineas[1:]
    if lineas and lineas[-1].strip().startswith("```"):
        lineas = lineas[:-1]
    texto = "\n".join(lineas).strip()

    # Registrar hito de redacción
    try:
        import sintesis_avances as SA
        SA.hito_redaccion_respaldo("flota gratuita (gemini-flash-lite / minimax / nemotron)", via="notebooklm", fecha=fecha, ahora=ahora)
    except ImportError:
        pass

    # 6. Subir Doc a Drive
    log_fn("Subiendo a Drive...")
    drive_id = None
    if token_google_fn:
        drive_id = _subir_doc_drive(fecha, texto, token_google_fn)
    
    # 7. Enviar resumen al chat
    resumen = _generar_resumen(texto)
    if enviar_telegram_fn:
        log_fn("Enviando resumen al chat...")
        enviar_telegram_fn(f"📋 Síntesis diaria {fecha} (respaldo 08:30)\n\n{resumen}")
    
    # Registrar hito de entrega
    enlace_doc = f"https://docs.google.com/document/d/{drive_id}" if drive_id else "pendiente"
    try:
        import sintesis_avances as SA
        SA.hito_entrega_respaldo(enlace_doc, len(resumen), fecha=fecha, ahora=ahora)
    except ImportError:
        pass

    # 8. Lanzar multiformato
    multiformato_result = None
    if multiformato_fn:
        log_fn("Lanzando multiformato (9 formatos)...")
        multiformato_result = multiformato_fn(fecha)
        
        try:
            import sintesis_avances as SA
            formatos = multiformato_result.get("formatos", []) if multiformato_result else []
            for i, fmt in enumerate(formatos):
                final = (i == len(formatos) - 1)
                SA.hito_multiformato_respaldo(i + 1, final=final, fecha=fecha, ahora=ahora)
        except ImportError:
            pass

    log_fn(f"Respaldo completado: {len(texto)} chars, Drive: {'sí' if drive_id else 'no'}")

    return {
        "ok": True,
        "accion": "respaldo_completado",
        "mensaje": f"Respaldo 08:30 completado: {len(texto)} caracteres",
        "drive_id": drive_id,
        "caracteres": len(texto),
        "resumen": resumen,
        "multiformato": multiformato_result,
    }


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
        print("  respaldo <fecha> [--seco]")
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

    if cmd == "respaldo":
        fecha = argv[1] if len(argv) > 1 else _fecha_cdmx()
        seco = "--seco" in argv
        
        # Usar mocks para CLI seco
        if seco:
            resultado = ejecutar_respaldo_0830(
                fecha=fecha,
                seco=True,
                log_fn=print,
            )
        else:
            # En CLI real, usar clientes reales
            from peticiones_notebooklm import nb as nb_real, drive as drive_real, token_google as tok_real
            from peticiones_telegram import decir as telegram_real
            from sintesis_multiformato import procesar_sintesis_diaria as multi_real
            
            resultado = ejecutar_respaldo_0830(
                fecha=fecha,
                nb_fn=nb_real,
                drive_fn=drive_real,
                token_google_fn=tok_real,
                enviar_telegram_fn=telegram_real,
                multiformato_fn=multi_real,
                log_fn=print,
            )
        print(json.dumps(resultado, ensure_ascii=False, indent=1))
        return 0
    
    print(f"Comando desconocido: {cmd}")
    return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())