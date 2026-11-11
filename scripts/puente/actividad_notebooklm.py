#!/usr/bin/env python3
"""Actividad · cuadernos de NotebookLM (SDP1111J · §4 de sintesis-diaria-autonoma).

El CLI `notebooklm` (notebooklm-py v0.8.6) solo vive en la Mac (/Users/alex/bin/notebooklm), con
perfiles: `default` = alexbordongarrigos@gmail.com y `fundacion` = fundacionstarseed@gmail.com.
Se listan los cuadernos de cada perfil y, por cuaderno, las fuentes y notas nuevas desde la
última pasada, con `privado: true` en ~/.starseed/actividad/ (fuera de starseed_memory_root).
Sin CLI o con la sesión caducada: {ok: False, motivo} sin fallar ni reintentar el login; `ejecutar` es inyectable.
"""
import json, os, shutil, subprocess, time

PERFILES = {"default": "alexbordongarrigos@gmail.com", "fundacion": "fundacionstarseed@gmail.com"}
CLI_MAC = "/Users/alex/bin/notebooklm"
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
NOMBRE_ESTADO = "notebooklm-estado.json"
CLAVES_FILAS = ("notebooks", "sources", "notes", "items", "results", "data")
SEÑALES_SESION = ("unauthorized", "401", "session expired", "not authenticated", "authentication failed",
                  "not logged in", "please log in", "login")
TAREAS = (("fuente", ["source", "list"], "sources"), ("nota", ["note", "list"], "notes"))

def buscar_cli(existe=os.path.isfile, cual=shutil.which):
    """Ruta del CLI en este nodo: la de la Mac o la del PATH. None si no está."""
    return CLI_MAC if existe(CLI_MAC) else cual("notebooklm")

def ejecutar_cli(args, binario, timeout=90):
    """Una llamada al CLI: sin shell, con la salida capturada. No escribe nada."""
    try:
        p = subprocess.run([binario] + [str(a) for a in args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"codigo": 2, "stdout": "", "stderr": str(error)[:200]}
    return {"codigo": p.returncode, "stdout": p.stdout or "", "stderr": p.stderr or ""}

def sesion_caducada(salida):
    """True si la salida dice que la sesión no vale (entonces no se reintenta el login)."""
    texto = salida if isinstance(salida, str) else (salida.get("stdout") or "") + " " + (salida.get("stderr") or "")
    return any(señal in texto.lower() for señal in SEÑALES_SESION)

def filas(salida, *claves):
    """Las filas de una salida del CLI: su JSON, con lista suelta o envoltorio {clave: [...]}."""
    carga = salida.get("stdout", salida) if isinstance(salida, dict) else salida
    if isinstance(carga, (str, bytes)):
        try:
            carga = json.loads(carga or "{}")
        except (ValueError, TypeError):
            carga = {}
    for clave in tuple(claves) + CLAVES_FILAS:
        valor = carga.get(clave) if isinstance(carga, dict) else carga
        if isinstance(valor, list):
            return [f for f in valor if isinstance(f, dict)]
    return []

def _nuevas(vistos, clave, filas_):
    """(nuevas, estado): las filas cuya identidad no se había visto y el estado de la pasada."""
    ya, identidades = list(vistos.get(clave, [])), [str(f.get("id") or f.get("title") or "") for f in filas_]
    nuevas = [(i, f) for i, f in zip(identidades, filas_) if i and i not in ya]
    return nuevas, sorted(set(ya) | set(i for i in identidades if i))

def _ficha(perfil, correo, cuaderno, tipo, fila, hoy):
    """Una ficha de actividad de NotebookLM: privada, con su cuaderno y su fecha."""
    return {"fuente": "notebooklm", "cuenta": correo, "perfil": perfil, "tipo": tipo,
            "cuaderno": cuaderno["titulo"], "cuaderno_id": cuaderno["id"], "privado": True,
            "fecha": str(fila.get("created_at") or fila.get("updated_at") or hoy)[:40],
            "titulo": str(fila.get("title") or "")[:300],
            "enlace": str(fila.get("url") or "https://notebooklm.google.com/notebook/%s" % cuaderno["id"])[:300],
            "texto": str(fila.get("content") or fila.get("text") or "")[:1500]}

def leer(ejecutar=None, buscar=buscar_cli, perfiles=None, estado=None, dir_actividad=None):
    """Cuadernos, fuentes y notas nuevas por perfil; nunca falla ni reintenta el login."""
    perfiles = dict(perfiles or PERFILES)
    binario = None if ejecutar else buscar()
    if not binario and not ejecutar:
        return {"ok": False, "motivo": "no hay CLI de NotebookLM en este nodo"}
    llamar = ejecutar or (lambda args: ejecutar_cli(args, binario))
    estado = estado or (leer_estado(os.path.join(dir_actividad, NOMBRE_ESTADO)) if dir_actividad else None)
    vistos, nuevo = dict(estado or {}), dict(estado or {})
    hoy = time.strftime("%Y-%m-%d")  # el día local del nodo (el de Alex)
    cuadernos, fichas, errores = [], [], []
    for perfil, correo in perfiles.items():
        salida = llamar(["-p", perfil, "list", "--json"]) or {}
        if salida.get("codigo") != 0:
            if sesion_caducada(salida):
                return {"ok": False, "motivo": "sesión de NotebookLM no válida en este nodo", "perfil": perfil}
            errores.append("%s: %s" % (perfil, (salida.get("stderr") or "")[:120]))
            continue
        for cuaderno in filas(salida, "notebooks"):
            cuaderno = {"id": str(cuaderno.get("id") or ""), "titulo": str(cuaderno.get("title") or cuaderno.get("name") or ""),
                        "perfil": perfil, "cuenta": correo}
            cuadernos.append(cuaderno)
            for tipo, orden, clave in TAREAS:
                salida2 = llamar(["-p", perfil] + orden + ["-n", cuaderno["id"], "--json"]) or {}
                if salida2.get("codigo") != 0:
                    if sesion_caducada(salida2):
                        return {"ok": False, "motivo": "sesión de NotebookLM no válida en este nodo", "perfil": perfil}
                    errores.append("%s/%s: %s" % (perfil, tipo, (salida2.get("stderr") or "")[:120]))
                    continue
                clave_estado = "%s|%s|%s" % (perfil, cuaderno["id"], tipo)
                nuevas, nuevo[clave_estado] = _nuevas(vistos, clave_estado, filas(salida2, clave))
                fichas.extend(_ficha(perfil, correo, cuaderno, tipo, fila, hoy) for _, fila in nuevas)
    if dir_actividad:
        for perfil in perfiles:
            guardar(nuevo, [f for f in fichas if f["perfil"] == perfil], perfil, hoy, dir_actividad)
    return {"ok": True, "cuadernos": cuadernos, "fichas": fichas, "estado": nuevo, "errores": errores}

def guardar(estado, fichas, perfil, fecha, dir_actividad=DIR_ACTIVIDAD):
    """Guarda las fichas del perfil y el estado de la pasada: solo en el nodo, nunca fuera."""
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    destino = os.path.join(dir_actividad, "fichas", "%s-notebooklm-%s.json" % (fecha, perfil))
    for ruta, contenido in ((destino, {"perfil": perfil, "fecha": fecha, "privado": True, "fichas": fichas}),
                            (os.path.join(dir_actividad, NOMBRE_ESTADO), estado)):
        with open(ruta + ".tmp", "w", encoding="utf-8") as archivo:
            json.dump(contenido, archivo, ensure_ascii=False, indent=1)
        os.replace(ruta + ".tmp", ruta)
    return {"fichas": destino, "estado": os.path.join(dir_actividad, NOMBRE_ESTADO)}

def leer_estado(ruta=None):
    """El estado de la pasada anterior; vacío si no hay archivo."""
    try:
        return json.load(open(ruta or os.path.join(DIR_ACTIVIDAD, NOMBRE_ESTADO), encoding="utf-8"))
    except (OSError, ValueError):
        return {}
