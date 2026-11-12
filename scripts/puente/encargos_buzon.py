#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Buzón de encargos en Drive que lee el líder (ENC1111B).

Ciclo que SOLO actúa si este nodo es el líder de dirección (lider_direccion.soy_lider()).
Lista Google Docs en la carpeta 1lZaGcZ8COkaunilTxYLj-SWuFkGTwmrF cuyo dueño sea
alexbordongarrigos@gmail.com y que no estén ya procesados. Exporta como markdown y
texto plano, valida con encargos_validar y, si ok: escribe el contrato en
architecture/<destino>, hace commit solo de ese archivo, escribe la cola y avisa.
"""
from __future__ import annotations
import argparse, fcntl, json, os, re, subprocess, sys, tempfile, time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

RAIZ_DEF = Path(__file__).parent.parent.parent
HOME_STARSEED_DEF = Path.home() / ".starseed"
CARPETA_ENCARGOS = "1lZaGcZ8COkaunilTxYLj-SWuFkGTwmrF"
DUENO_ESPERADO = "alexbordongarrigos@gmail.com"


def _leer_json(ruta: Path, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos):
    ruta.parent.mkdir(parents=True, exist_ok=True)
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


@contextmanager
def _cerrojo(ruta: Path):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _ids_existentes(
    raiz: Path,
    olas_ruta: Path,
    enjambre_colas_ruta: Path,
) -> set[str]:
    """Recoge todos los ids de tareas de las colas vivas y del git log."""
    ids = set()
    # Colas en starseed_memory_root/olas/*.json
    for ruta in olas_ruta.glob("cola-*.json"):
        try:
            cola = _leer_json(ruta, [])
            if isinstance(cola, list):
                for t in cola:
                    if isinstance(t, dict) and t.get("id"):
                        ids.add(t["id"])
        except Exception:
            pass
    # Colas en enjambre/colas/*.json
    for ruta in enjambre_colas_ruta.glob("*.json"):
        try:
            cola = _leer_json(ruta, [])
            if isinstance(cola, list):
                for t in cola:
                    if isinstance(t, dict) and t.get("id"):
                        ids.add(t["id"])
        except Exception:
            pass
    # git log --format=%s (títulos de commits)
    try:
        salida = subprocess.run(
            ["git", "-C", str(raiz), "log", "--format=%s", "--oneline", "-1000"],
            capture_output=True, text=True, timeout=10
        ).stdout
        for linea in salida.splitlines():
            m = re.search(r"\b([A-Z]{2,4}\d{4}[A-Z0-9-]*)\b", linea)
            if m:
                ids.add(m.group(1))
    except Exception:
        pass
    return ids


def _hoy_contados(estado: dict, ahora: datetime) -> int:
    """Cuenta encargos procesados hoy (fecha ISO en resultado)."""
    hoy = ahora.strftime("%Y-%m-%d")
    return sum(1 for v in estado.values() if isinstance(v, dict) and v.get("resultado", "").startswith(hoy))


def _drive_listar_docs(token: str, pedir_http) -> list[dict]:
    """Lista Google Docs en la carpeta de encargos. Devuelve lista de dicts con id, name, modifiedTime, owners."""
    url = "https://www.googleapis.com/drive/v3/files"
    params = {
        "q": f"'{CARPETA_ENCARGOS}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false",
        "fields": "files(id,name,modifiedTime,owners)",
        "pageSize": 100,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    respuesta = pedir_http(f"{url}?{query}", token)
    return respuesta.get("files", [])


def _drive_exportar(token: str, file_id: str, mime_type: str, pedir_http) -> str:
    """Exporta un Google Doc al mime_type dado. Devuelve el texto."""
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
    params = {"mimeType": mime_type}
    query = "&".join(f"{k}={v}" for k, v in params.items())
    respuesta = pedir_http(f"{url}?{query}", token)
    return respuesta if isinstance(respuesta, str) else ""


def _extraer_contrato_y_cola(texto_md: str, texto_plano: str) -> tuple[str | None, dict | None]:
    """Extrae 'Destino en el repo' y el bloque JSON de la cola del texto plano."""
    destino = None
    for linea in texto_md.splitlines():
        if linea.strip().startswith("**Destino en el repo:**"):
            m = re.search(r"`(architecture/[^`]+\.md)`", linea)
            if m:
                destino = m.group(1)
            break
    # Busca el primer bloque JSON válido en texto_plano
    cola = None
    dec = json.JSONDecoder()
    for i in range(len(texto_plano)):
        if texto_plano[i] == "{":
            try:
                obj, _ = dec.raw_decode(texto_plano[i:])
                if isinstance(obj, dict) and "ola" in obj and "tareas" in obj:
                    cola = obj
                    break
            except json.JSONDecodeError:
                continue
    return destino, cola


def _validar_encargo(texto_md: str, texto_plano: str, ids_existentes: set[str], hoy_contados: int) -> dict:
    """Valida el encargo según las reglas de architecture/encargos-chats-metagenesis.md §3."""
    if hoy_contados >= 3:
        return {"ok": False, "motivo": "tope de 3 encargos al día alcanzado"}

    destino, cola = _extraer_contrato_y_cola(texto_md, texto_plano)
    if not destino or not cola:
        return {"ok": False, "motivo": "falta 'Destino en el repo' o bloque JSON de la cola"}

    if not destino.startswith("architecture/") or not destino.endswith(".md"):
        return {"ok": False, "motivo": "destino debe ser architecture/*.md"}

    if ".." in destino or destino.startswith("/"):
        return {"ok": False, "motivo": "destino con ruta no permitida"}

    if not isinstance(cola.get("ola"), str) or not cola["ola"]:
        return {"ok": False, "motivo": "cola.ola inválido"}

    if not isinstance(cola.get("tareas"), list):
        return {"ok": False, "motivo": "cola.tareas debe ser lista"}

    tareas = cola["tareas"]
    if len(tareas) > 30:
        return {"ok": False, "motivo": "más de 30 tareas en la cola"}

    ids_vistos = set()
    for i, t in enumerate(tareas):
        if not isinstance(t, dict):
            return {"ok": False, "motivo": f"tarea {i} no es objeto"}
        for campo in ("id", "ola", "titulo", "archivos", "depende", "prompt"):
            if campo not in t:
                return {"ok": False, "motivo": f"tarea {i} falta campo {campo}"}
        tid = t["id"]
        if not re.fullmatch(r"[A-Z]{2,4}\d{4}[A-Z0-9-]*", tid):
            return {"ok": False, "motivo": f"id inválido: {tid}"}
        if tid in ids_existentes or tid in ids_vistos:
            return {"ok": False, "motivo": f"id duplicado: {tid}"}
        ids_vistos.add(tid)
        if not isinstance(t["archivos"], list):
            return {"ok": False, "motivo": f"tarea {tid}: archivos debe ser lista"}
        for arch in t["archivos"]:
            if not isinstance(arch, str) or ".." in arch or arch.startswith("/") or arch.startswith("~"):
                return {"ok": False, "motivo": f"tarea {tid}: archivo inválido {arch}"}
            if any(arch.startswith(p) for p in (".env", ".git/", "starseed_memory_root/")):
                return {"ok": False, "motivo": f"tarea {tid}: archivo en ruta protegida {arch}"}
        if not isinstance(t["depende"], list):
            return {"ok": False, "motivo": f"tarea {tid}: depende debe ser lista"}
        for dep in t["depende"]:
            if not isinstance(dep, str) or not re.fullmatch(r"[A-Z]{2,4}\d{4}[A-Z0-9-]*", dep):
                return {"ok": False, "motivo": f"tarea {tid}: dependencia inválida {dep}"}
        if not isinstance(t["prompt"], str) or len(t["prompt"]) > 6000:
            return {"ok": False, "motivo": f"tarea {tid}: prompt inválido o > 6000 chars"}

        # Rechazar prompts que pidan claves, push, borrados o lanzar orquestador
        prompt_lower = t["prompt"].lower()
        if any(p in prompt_lower for p in ("clave", "secret", "api_key", "password", "token")):
            return {"ok": False, "motivo": f"tarea {tid}: pide claves"}
        if "git push" in prompt_lower or ("push" in prompt_lower and "git" in prompt_lower):
            return {"ok": False, "motivo": f"tarea {tid}: pide git push"}
        if any(p in prompt_lower for p in ("borrar", "rm -rf", "delete", "eliminar")):
            return {"ok": False, "motivo": f"tarea {tid}: pide borrados"}
        if "orquestador" in prompt_lower and ("lanzar" in prompt_lower or "nuevo" in prompt_lower):
            return {"ok": False, "motivo": f"tarea {tid}: pide lanzar orquestador nuevo"}

    return {"ok": True, "motivo": "", "ola": cola["ola"], "destino": destino, "contrato_md": texto_md, "tareas": tareas}


def _commit_archivo(raiz: Path, archivo: Path, mensaje: str, seco: bool = False) -> bool:
    """Hace commit solo del archivo dado. Nunca push."""
    if seco:
        return True
    try:
        subprocess.run(["git", "-C", str(raiz), "add", str(archivo)], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(raiz), "commit", "-m", mensaje], check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError:
        return False


def _avisar(texto: str, director_chat_publicar=None, sintesis_telegram_enviar=None):
    """Avisa en el chat del director y por Telegram si existe."""
    if director_chat_publicar:
        try:
            director_chat_publicar(texto, de="encargos-buzon", rol="sistema", tipo="aviso", canal="mando")
        except Exception:
            pass
    if sintesis_telegram_enviar:
        try:
            sintesis_telegram_enviar(texto)
        except Exception:
            pass


def ciclo(
    raiz: Path = RAIZ_DEF,
    home: Path = HOME_STARSEED_DEF,
    ahora: datetime | None = None,
    pedir_http=None,
    token_fn=None,
    soy_lider=None,
    avisar=None,
    seco: bool = False,
) -> dict:
    """Ejecuta un ciclo del buzón de encargos. Solo actúa si este nodo es líder.
    
    Args:
        raiz: Raíz del repo (para git, architecture, olas)
        home: Directorio ~/.starseed (para estado y cerrojos)
        ahora: Timestamp del ciclo (para tests)
        pedir_http: Función(url, token) -> dict|str para llamadas HTTP a Drive (inyectable)
        token_fn: Función(alias, pedir_http) -> str|None para obtener token de Drive (inyectable, default: None = sin token)
        soy_lider: Función() -> dict con clave 'soy' (inyectable, default: no líder)
        avisar: Función(texto) para notificar (inyectable)
        seco: Si True, no escribe en disco ni hace commit
    """
    ahora = ahora or datetime.now()

    # Rutas derivadas
    estado_ruta = home / "encargos" / "estado.json"
    cerrojo_ruta = home / "cerrojos" / "encargos_buzon.lock"
    olas_ruta = raiz / "starseed_memory_root" / "olas"
    enjambre_colas_ruta = raiz / "enjambre" / "colas"
    architecture_ruta = raiz / "architecture"

    # 1. ¿Soy líder?
    lider = soy_lider or (lambda: {"soy": False, "motivo": "sin comprobación"})
    if not lider().get("soy"):
        return {"ok": False, "motivo": "no soy líder de dirección", "procesados": 0}

    # 2. Cerrojo
    with _cerrojo(cerrojo_ruta) as libre:
        if not libre:
            return {"ok": False, "motivo": "otro ciclo en marcha", "procesados": 0}

        # 3. Token de Google Drive (cuenta 'alex')
        token_obtener = token_fn or (lambda alias, _pedir: None)
        token = token_obtener("alex", pedir_http)
        if not token:
            return {"ok": False, "motivo": "sin token de Google Drive para 'alex'", "procesados": 0}

        # 4. Estado previo
        estado = _leer_json(estado_ruta, {})

        # 5. Listar Docs en Drive
        docs = _drive_listar_docs(token, pedir_http)
        if not docs:
            return {"ok": True, "motivo": "sin documentos nuevos", "procesados": 0}

        # 6. Filtrar por dueño y modifiedTime no procesado
        nuevos = []
        for doc in docs:
            owners = doc.get("owners", [])
            if not any(o.get("emailAddress") == DUENO_ESPERADO for o in owners):
                continue
            doc_id = doc["id"]
            mtime = doc["modifiedTime"]
            prev = estado.get(doc_id)
            if isinstance(prev, dict) and prev.get("modifiedTime") == mtime:
                continue
            nuevos.append(doc)

        if not nuevos:
            return {"ok": True, "motivo": "sin documentos nuevos del dueño", "procesados": 0}

        # 7. Calcular ids_existentes y hoy_contados
        ids_exist = _ids_existentes(raiz, olas_ruta, enjambre_colas_ruta)
        hoy_c = _hoy_contados(estado, ahora)

        procesados = 0
        for doc in nuevos:
            doc_id = doc["id"]
            mtime = doc["modifiedTime"]

            # Exportar como markdown y texto plano
            texto_md = _drive_exportar(token, doc_id, "text/markdown", pedir_http)
            texto_plano = _drive_exportar(token, doc_id, "text/plain", pedir_http)

            if not texto_md or not texto_plano:
                estado[doc_id] = {"modifiedTime": mtime, "resultado": f"{ahora.isoformat()}: error exportando"}
                if avisar:
                    avisar(f"encargo {doc_id}: error exportando")
                continue

            # Validar
            validacion = _validar_encargo(texto_md, texto_plano, ids_exist, hoy_c)
            if not validacion["ok"]:
                estado[doc_id] = {"modifiedTime": mtime, "resultado": f"{ahora.isoformat()}: inválido - {validacion['motivo']}"}
                if avisar:
                    avisar(f"encargo {doc_id} inválido: {validacion['motivo']}")
                continue

            # Escribir contrato en architecture/<destino>
            destino_path = architecture_ruta / validacion["destino"].replace("architecture/", "")
            if not seco:
                _escribir_atomico(destino_path, {"contenido": validacion["contrato_md"]})

            # Commit solo ese archivo
            msg = f"docs(encargo): {validacion['ola']} desde el buzón de Drive"
            if not seco:
                _commit_archivo(raiz, destino_path, msg, seco)

            # Escribir cola en starseed_memory_root/olas/cola-<ola>.json
            cola_path = olas_ruta / f"cola-{validacion['ola'].lower()}.json"
            if not seco:
                _escribir_atomico(cola_path, validacion["tareas"])

            # Actualizar ids_existentes para siguientes docs del mismo ciclo
            for t in validacion["tareas"]:
                ids_exist.add(t["id"])

            # Avisar
            if avisar:
                avisar(f"encargo {validacion['ola']} encolado: {len(validacion['tareas'])} tareas")

            # Guardar estado
            estado[doc_id] = {"modifiedTime": mtime, "resultado": f"{ahora.isoformat()}: ok - {validacion['ola']}"}
            hoy_c += 1
            procesados += 1

        if not seco:
            _escribir_atomico(estado_ruta, estado)
        return {"ok": True, "motivo": f"{procesados} encargo(s) procesado(s)", "procesados": procesados}


def estado_cmd(home: Path = HOME_STARSEED_DEF, seco: bool = False) -> dict:
    """Muestra el estado del buzón."""
    estado_ruta = home / "encargos" / "estado.json"
    est = _leer_json(estado_ruta, {})
    return {"encargos_procesados": len(est), "detalle": est}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("orden", choices=["ciclo", "estado"])
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args(argv)

    if a.orden == "ciclo":
        # En producción, usar cuentas_google.token
        try:
            import cuentas_google
            token_fn = cuentas_google.token
        except Exception:
            token_fn = None
        try:
            from cuentas_google_env import pedir_http
        except Exception:
            pedir_http = None
        r = ciclo(token_fn=token_fn, pedir_http=pedir_http, seco=a.seco)
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        r = estado_cmd(seco=a.seco)
        print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())