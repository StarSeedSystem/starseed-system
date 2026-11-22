#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Órdenes de MetaGenesis para la dirección (ACC1121): lista cerrada, registro y resultado claro.

`metagenesis_orden(orden, argumentos, quien, motivo)` es la puerta común de los tres canales.
No hay consola libre: cada orden valida sus argumentos y llama a la herramienta que ya existe.
Lo reservado a Alex no se ejecuta nunca y se contesta «esto es de Alex» con su motivo. Cada
intento queda en `starseed_memory_root/mando/ordenes-direccion.jsonl` (quién, canal, medio,
orden y resultado), y la orden devuelve el resultado en claro.
"""
import contextlib
import importlib
import json
import os
import re
import sys
import time
from pathlib import Path

ORDENES = (
    "priorizar_tarea", "reabrir_tarea", "encargar_tarea", "lanzar_cola",
    "pausar_enjambre", "reanudar_enjambre", "buscar_capacidad", "lanzar_nube",
    "compilar_prueba", "escalar_tarea", "archivar_worktrees",
    "apuntar_nota", "apuntar_relevo",
)

RESERVADAS = {
    "publicar_fuera_de_puertas": "publicar fuera de las puertas de producción es de Alex",
    "quitar_pausa_publicacion": "quitar una pausa de publicación es de Alex",
    "claves_y_cuentas": "las claves y las cuentas son de Alex",
    "a1_con_privilegios": "dar privilegios al A1 es de Alex",
    "aceptar_a_nombre_de_alex": "aceptar o conceder algo a nombre de Alex es de Alex",
    "cerrar_apps": "cerrar las aplicaciones de Alex es de Alex",
}

_ID = re.compile(r"^[A-Z]{2,4}\d{4}[A-Z0-9-]*$")
_SLUG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
_RUTA = re.compile(r"^[A-Za-z0-9._/-]+$")
_ARCHIVO = ("starseed_memory_root", "mando", "ordenes-direccion.jsonl")


def _raiz():
    return Path(os.environ.get("STARSEED_ROOT") or Path(__file__).resolve().parents[2])


def _ruta(*partes):
    return _raiz().joinpath(*partes)


def _entero(valor, minimo, maximo, campo):
    if isinstance(valor, bool) or not isinstance(valor, int) or not minimo <= valor <= maximo:
        raise ValueError("%s debe ser un entero entre %d y %d" % (campo, minimo, maximo))
    return valor


def _id(valor):
    texto = str(valor or "").strip()
    if not _ID.match(texto):
        raise ValueError("id de tarea no válido: %s" % (texto or "(vacío)"))
    return texto


def _slug(valor, campo):
    texto = str(valor or "").strip()
    if not _SLUG.match(texto):
        raise ValueError("%s no válido: %s" % (campo, texto or "(vacío)"))
    return texto


def _archivo_seguro(valor):
    texto = str(valor or "").strip()
    if (not _RUTA.match(texto) or ".." in texto or texto.startswith("/")
            or texto.startswith(("~", ".env", ".git/", "starseed_memory_root/"))):
        raise ValueError("archivo no permitido: %s" % (texto or "(vacío)"))
    return texto


def validar(orden, argumentos):
    """PURA: normaliza y valida los argumentos de una orden. ValueError si no cuadra."""
    if orden in RESERVADAS:
        return {"_reservada": RESERVADAS[orden]}
    if orden not in ORDENES:
        raise ValueError("orden no permitida: %s" % (orden or "(vacía)"))
    a = dict(argumentos or {})
    if orden in ("priorizar_tarea", "reabrir_tarea", "escalar_tarea"):
        a["tarea"] = _id(a.get("tarea"))
    if orden == "priorizar_tarea":
        a["prioridad"] = _entero(a.get("prioridad"), -100, 100, "prioridad")
    elif orden == "encargar_tarea":
        a["ola"] = _slug(a.get("ola"), "ola")
        t = a.get("tarea")
        if not isinstance(t, dict):
            raise ValueError("falta la tarea a encargar")
        archivos = t.get("archivos")
        if not isinstance(archivos, list) or not 1 <= len(archivos) <= 3:
            raise ValueError("la tarea debe declarar de 1 a 3 archivos")
        prompt = str(t.get("prompt") or "").strip()
        if not 20 <= len(prompt) <= 6000:
            raise ValueError("el prompt debe tener entre 20 y 6000 caracteres")
        a["tarea"] = {
            "id": _id(t.get("id")), "ola": a["ola"],
            "titulo": str(t.get("titulo") or t.get("id"))[:200],
            "archivos": [_archivo_seguro(x) for x in archivos],
            "depende": [_id(x) for x in (t.get("depende") or [])],
            "prompt": prompt,
        }
    elif orden == "lanzar_cola":
        a["cola"] = _slug(a.get("cola"), "cola")
        a["trabajadores"] = _entero(a.get("trabajadores", 2), 1, 4, "trabajadores")
    elif orden == "lanzar_nube":
        if a.get("cesion") is not True:
            raise ValueError("lanzar la nube exige cesión explícita (cesion: true)")
        a["runs"] = _entero(a.get("runs", 1), 1, 14, "runs")
        a["trabajadores"] = _entero(a.get("trabajadores", 3), 1, 4, "trabajadores")
    elif orden == "compilar_prueba":
        sha = a.get("sha")
        if sha is not None and not re.fullmatch(r"[0-9a-fA-F]{40}", str(sha)):
            raise ValueError("sha debe ser un commit de 40 caracteres hexadecimales")
        a["sha"] = str(sha).lower() if sha else None
        a["nota"] = str(a.get("nota") or "")[:500]
    elif orden == "escalar_tarea":
        a["motor"] = _slug(a.get("motor"), "motor")
    elif orden in ("apuntar_nota", "apuntar_relevo"):
        a["texto"] = str(a.get("texto") or "").strip()
        if not 1 <= len(a["texto"]) <= 4000:
            raise ValueError("texto obligatorio (1 a 4000 caracteres)")
        a["canal"] = str(a.get("canal") or "mando")
    elif orden in ("buscar_capacidad", "archivar_worktrees"):
        a["aplicar"] = bool(a.get("aplicar", False))
    return a


def _leer(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def _escribir(ruta, datos):
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_name(ruta.name + ".tmp-%d" % os.getpid())
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, ruta)


def _anotar(quien, canal, medio, orden, resultado, ahora=None):
    ruta = _ruta(*_ARCHIVO)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    fila = {"t": ahora or time.strftime("%Y-%m-%d %H:%M:%S"), "quien": quien,
            "canal": canal, "medio": medio, "orden": orden, "resultado": str(resultado)[:500]}
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def _h_priorizar(a, quien, motivo):
    import revisor_bloqueadas as R
    cola = R._cola_viva()
    if not cola:
        raise ValueError("no hay tanda viva en esta máquina")

    def ordenar(nombre, lista):
        if nombre != cola:
            return None
        elegida = next((t for t in lista if isinstance(t, dict) and t.get("id") == a["tarea"]), None)
        if not elegida:
            raise ValueError("%s no está en %s" % (a["tarea"], cola))
        return [dict(elegida, prioridad=a["prioridad"])] + [
            t for t in lista if not (isinstance(t, dict) and t.get("id") == a["tarea"])]

    R._editar_colas(ordenar, viva=cola)
    return "%s: %s pasa a prioridad %s" % (cola, a["tarea"], a["prioridad"])


def _h_reabrir(a, quien, motivo):
    import revisor_bloqueadas as R
    cola = R._cola_viva()
    if not cola:
        raise ValueError("no hay tanda viva en esta máquina")
    R._orden_control(cola, {a["tarea"]: {"accion": "reabrir", "quien": quien,
                                        "motivo": motivo[:160],
                                        "t": time.strftime("%Y-%m-%d %H:%M:%S")}})
    return "%s: reabrir %s pedido" % (cola, a["tarea"])


def _h_encargar(a, quien, motivo):
    import encargos_buzon as E
    olas = _ruta("starseed_memory_root", "olas")
    ids = E._ids_existentes(_raiz(), olas, _ruta("enjambre", "colas"))
    if a["tarea"]["id"] in ids:
        raise ValueError("id duplicado: %s" % a["tarea"]["id"])
    ruta = olas / ("cola-%s.json" % a["ola"])
    previo = _leer(ruta, [])
    lista = previo if isinstance(previo, list) else (previo or {}).get("tareas", [])
    lista = [t for t in (lista or []) if isinstance(t, dict)]
    if any(t.get("id") == a["tarea"]["id"] for t in lista):
        raise ValueError("id duplicado en la cola: %s" % a["tarea"]["id"])
    _escribir(ruta, lista + [a["tarea"]])
    return "cola-%s: %s encargada con %d archivo(s)" % (
        a["ola"], a["tarea"]["id"], len(a["tarea"]["archivos"]))


def _h_lanzar_cola(a, quien, motivo):
    import nodo_metagenesis_medio as M
    nombre = a["cola"][5:] if a["cola"].startswith("cola-") else a["cola"]
    estado, texto = M.lanzar_cola({"cola": "cola-" + nombre, "trabajadores": a["trabajadores"]},
                                  "mac", str(_raiz()))
    if estado == "fallo":
        raise ValueError(texto)
    return texto


def _h_pausa(a, quien, motivo, pausado):
    ruta = _ruta("starseed_memory_root", "mando", "director-config.json")
    cfg = _leer(ruta, {})
    if not isinstance(cfg, dict):
        cfg = {}
    cfg["pausado"] = pausado
    _escribir(ruta, cfg)
    return "enjambre %s por %s: %s" % ("pausado" if pausado else "reanudado", quien, motivo[:120])


def _h_buscar(a, quien, motivo):
    import buscar_capacidad as B
    resultado = B.buscar(
        aplicar=a["aplicar"], origen="mcp",
        sondear_medios=not a.get("sin_medios", False),
        mac=not a.get("sin_mac", False), ahora=time.time(),
    )
    return str(resultado.get("resumen") or "sin resumen")


def _h_nube(a, quien, motivo):
    import buscar_capacidad as B
    hechos = B.desplegar(a["runs"], a["trabajadores"])
    return "nube: %s" % ("; ".join(hechos) if hechos else "nada que lanzar")


def _h_compilar(a, quien, motivo):
    import director_pruebas as P
    import director_pruebas_logica as L
    pid = "mcp-%d" % int(time.time())
    nota = (motivo + (" · " + a["nota"] if a["nota"] else ""))[:500]
    peticion, error = L.validar_peticion({
        "formato": 1, "id": pid, "accion": "compilar",
        "quien": quien if quien in L.QUIENES_CONOCIDOS else "director",
        "sha": a["sha"], "nota": nota})
    if error:
        raise ValueError(error)
    _escribir(Path(P.carpeta()) / P.PETICIONES / (pid + ".json"), peticion)
    return "compilación de prueba pedida: %s" % pid


def _h_escalar(a, quien, motivo):
    for nombre in ("escalera_aut1121", "escalera_motores", "escalada_motores"):
        try:
            modulo = importlib.import_module(nombre)
        except ImportError:
            continue
        if callable(getattr(modulo, "escalar", None)):
            return str(modulo.escalar(a["tarea"], a["motor"], quien=quien, motivo=motivo))
    return "aún no existe la escalera de AUT1121A: no se escala %s" % a["tarea"]


def _h_archivar(a, quien, motivo):
    import archivar_worktrees as A
    A.main(["--aplicar"] if a["aplicar"] else [])
    return "worktrees: %s" % ("archivados y podados" if a["aplicar"] else "solo contados")


def _h_apuntar(a, quien, motivo, tipo):
    canal = a["canal"]
    if canal in ("principal", "general", "audiovisual"):
        import sincronizador_direccion as S
        reg = S.publicar_en_canal_especializado(canal, a["texto"], de=quien)
        if not reg.get("ok"):
            raise ValueError("no se pudo apuntar en %s: %s" % (canal, reg.get("detalle")))
        return "%s apuntado en %s: %s" % (tipo, canal, reg.get("id"))
    import director_chat as C
    if canal not in C.CANALES:
        raise ValueError("canal no válido: %s" % canal)
    mensaje = C.publicar(a["texto"], de=quien, rol="director", tipo=tipo,
                         canal=canal, tarea=a.get("tarea"))
    return "%s apuntado en %s: %s" % (tipo, canal, mensaje["id"])


_HERRAMIENTAS = {
    "priorizar_tarea": _h_priorizar,
    "reabrir_tarea": _h_reabrir,
    "encargar_tarea": _h_encargar,
    "lanzar_cola": _h_lanzar_cola,
    "pausar_enjambre": lambda a, q, m: _h_pausa(a, q, m, True),
    "reanudar_enjambre": lambda a, q, m: _h_pausa(a, q, m, False),
    "buscar_capacidad": _h_buscar,
    "lanzar_nube": _h_nube,
    "compilar_prueba": _h_compilar,
    "escalar_tarea": _h_escalar,
    "archivar_worktrees": _h_archivar,
    "apuntar_nota": lambda a, q, m: _h_apuntar(a, q, m, "mensaje"),
    "apuntar_relevo": lambda a, q, m: _h_apuntar(a, q, m, "relevo"),
}


def ejecutar(orden, argumentos=None, quien="", motivo="", canal="mcp", medio="mac",
             herramientas=None, ahora=None):
    """Valida, ejecuta la herramienta ya existente y lo apunta. Devuelve el resultado en claro."""
    quien, motivo = str(quien or "").strip(), str(motivo or "").strip()
    if not quien or not motivo:
        raise ValueError("quien y motivo son obligatorios")
    a = validar(orden, argumentos)
    if orden in ("apuntar_nota", "apuntar_relevo") and not (argumentos or {}).get("canal"):
        a["canal"] = canal
    if "_reservada" in a:
        texto = "esto es de Alex: %s" % a["_reservada"]
        _anotar(quien, canal, medio, orden, texto, ahora)
        return texto
    herramienta = (herramientas or {}).get(orden) or _HERRAMIENTAS[orden]
    try:
        with contextlib.redirect_stdout(sys.stderr):
            texto = str(herramienta(a, quien, motivo))
    except Exception as e:  # noqa: BLE001 — la puerta nunca tumba el servidor MCP
        _anotar(quien, canal, medio, orden, "error: %s" % e, ahora)
        if isinstance(e, (ValueError, KeyError)):
            raise
        raise ValueError("%s: %s" % (type(e).__name__, e))
    _anotar(quien, canal, medio, orden, texto, ahora)
    return texto
