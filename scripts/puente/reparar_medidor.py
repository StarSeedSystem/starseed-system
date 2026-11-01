#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparar un medidor de Genesis: comprobar → reparar lo que esté mal → volver a comprobar (2026-10-23).

Alex: «agrega un botón de reparar junto al de comprobar en los medidores; debería funcionar
automáticamente por la supervisión de los directores para que no tenga que presionarlo, pero aun
así agrégalo para poder hacerlo manualmente, ya que actualmente no se repara solo».

Lo que pasaba, medido el 23-10: «Comprobar» decía qué estaba mal, pero nadie actuaba sobre lo que
encontraba. Y la autocuración, que sí debía limpiar el disco, llevaba días fallando en silencio
(KeyError 'raiz_wt'): 52 worktrees, 5,3 GB, y la Mac con 3,6 GB libres.

Un solo camino para el botón «Reparar» y para los directores:
  1. Comprueba el medidor (`comprobar_medidor.comprobar_y_guardar`, lo mismo que «Comprobar»).
  2. `plan_reparacion` (PURA) traduce cada veredicto que no está «vivo» en acciones REALES y ya
     existentes del puente (relanzar el vigilante, curar el enjambre, devolver préstamos de la
     nube, reconciliar el progreso, limpiar el disco, cortar huérfanos de memoria, levantar marcas
     falsas de «sin cupo», volver a medir la nube y los contenedores, reiniciar un servicio).
  2b. (2026-11-01, RPM1101A) Si la Mac está SIN MEMORIA, `liberar_memoria` va PRIMERO en el plan
     y al final el resumen dice la causa: reiniciar Genesis con la RAM por las nubes no sirve
     (medido: Genesis en «U», esperando página, y el botón diciendo «0 de 1»). Liberar es lo mismo
     que ya existe: dormir el BitNet, ceder la voz, descargar la Neurona (Ollama, keep_alive 0)
     y cortar los huérfanos que ya nadie vigila (pruebas de vitest con el guardia, tsc SUP0111K).
  3. Las ejecuta (cada una con su tope de tiempo; un fallo no para a las demás).
  4. Vuelve a comprobar y deja `reparacion-<medidor>.json` junto a la comprobación: antes, después,
     y qué hizo cada acción. Genesis lo enseña bajo el botón.

Lo que NO hace, a propósito: publicar (la autopublicación tiene sus puertas y su interruptor),
borrar ramas, tocar claves, ni nada que no tenga una reparación conocida: eso se dice tal cual.

Uso:
  reparar_medidor.py <medidor> [--origen boton|directores]   # uno, ya (el botón)
  reparar_medidor.py --todos [--origen directores] [--forzar] # los automáticos, con tiempos mínimos
"""
from __future__ import annotations

import fcntl
import glob
import importlib.util
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

STARSEED = os.path.expanduser("~/.starseed")
CERROJO = os.path.join(STARSEED, "cerrojos", "reparar-medidor.lock")
ESTADO_AUTO = os.path.join(STARSEED, "reparar-medidores.json")
CARPETA = os.path.join(RAIZ, "starseed_memory_root", "mando", "comprobaciones")

#: Lo que los directores comprueban y reparan solos, cada 10 min (desde la autocuración).
MEDIDORES_AUTO = ("agentes", "listas", "en-curso", "proveedores", "disco", "memoria",
                  "contenedores", "tokens", "integradas")
#: Tiempo mínimo entre dos reparaciones AUTOMÁTICAS del mismo medidor (el botón no espera).
MINIMO_AUTO_S = {"disco": 60 * 60, "memoria": 30 * 60}
MINIMO_AUTO_DEFECTO_S = 20 * 60

#: (patrón del proceso del veredicto, estados que se reparan, acciones en orden)
REGLAS: Tuple[Tuple[str, Tuple[str, ...], Tuple[str, ...]], ...] = (
    (r"^Orquestador$", ("muerto",), ("vigilante",)),
    (r"^Vigilante$", ("muerto",), ("vigilante",)),
    (r"^Agente (opencode|codex)$", ("muerto",), ("enjambre", "carril_nube", "reconciliar")),
    (r"^Agentes medidos$", ("colgado", "muerto"), ("enjambre", "carril_nube", "nube_gh", "reconciliar")),
    (r"^Agentes sin contador$", ("colgado",), ("nube_gh",)),
    (r"^Espacio en disco$", ("colgado", "muerto"), ("disco",)),
    (r"^Memoria (RAM|Swap) libre$", ("colgado", "muerto"), ("memoria",)),
    (r"^(Proveedores activos|Pasarelas disponibilidad)$", ("muerto",), ("proveedores",)),
    (r"^Commits por publicar$", ("colgado",), ("autopublicacion",)),
    (r"^Servicio de tokens$", ("muerto", "colgado"), ("tokens",)),
    (r"^Integradas en main$", ("colgado",), ("reconciliar",)),
    # Lo que avisa el vigía de medidores, tipo por tipo. «aprobacion_eterna» no tiene regla a
    # propósito: espera la decisión de Alex y se dice abajo como «sin reparación automática».
    (r"^Vigía: (nube_ociosa|trabajo_sin_nadie)$", ("colgado",), ("capacidad",)),
    (r"^Vigía: agente_callado$", ("colgado",), ("enjambre", "carril_nube")),
    (r"^Vigía: (tokens_ciegos|tokens_mudos)$", ("colgado",), ("tokens",)),
    (r"^Vigía: cadena_rota$", ("colgado",), ("reconciliar",)),
    (r"^Medidor$", ("muerto",), ("genesis",)),
)
#: Medidores que se reparan siempre con lo mismo cuando algo no está vivo.
POR_MEDIDOR = {"contenedores": ("contenedores",)}

TITULOS = {
    "vigilante": "Relanzar el vigilante del enjambre (él relanza el orquestador si hay trabajo)",
    "enjambre": "Curar el enjambre (proveedores que volvieron, orquestador atascado)",
    "carril_nube": "Devolver o traer las sesiones de Claude en la nube que ya no trabajan",
    "nube_gh": "Volver a medir los runs de GitHub Actions",
    "reconciliar": "Reconciliar el progreso con main (tareas que ya están integradas o sin latido)",
    "disco": "Liberar disco (worktrees cerrados, node_modules duplicados, cachés regenerables)",
    "memoria": "Cortar los trabajadores de pruebas huérfanos que retienen memoria",
    "proveedores": "Quitar marcas falsas de «sin cupo» y levantar las de quien responde",
    "autopublicacion": "Ver por qué no ha salido la autopublicación",
    "tokens": "Reiniciar el servicio de tokens",
    "genesis": "Comprobar que Genesis contesta y reiniciarlo si no",
    "contenedores": "Volver a medir los contenedores de la nube",
    "capacidad": "Buscar más capacidad en todos los medios (llenar la Mac, lanzar jobs en la nube)",
    "liberar_memoria": "Liberar memoria de la Mac (dormir BitNet, ceder la voz, descargar la Neurona, cortar huérfanos)",
}


# ── Decisiones (PURAS) ───────────────────────────────────────────────────────────────────────

#: (RPM1101A) Nivel de presión del kernel a partir del que se libera (mismo criterio que el
#: guardia para «falta memoria»): 2 o más en `kern.memorystatus_vm_pressure_level` (3 = alta),
#: o menos de los MB que necesita el enjambre (= el CONGELAR_BAJO_MB del guardia-memoria).
PRESION_LIBERAR = 2
MB_LIBERAR = 1600


def memoria_apretada(libre_mb: Optional[float], presion: Optional[int]) -> bool:
    """PURA · RPM1101A: ¿la Mac está sin memoria, en el mismo sentido que el guardia? Sin
    ninguna de las dos medidas se dice que NO: liberar «por si acaso» tocaría procesos sanos."""
    if presion is not None and presion >= PRESION_LIBERAR:
        return True
    return libre_mb is not None and libre_mb < MB_LIBERAR


def con_liberacion(plan: List[Dict[str, str]], libre_mb: Optional[float],
                   presion: Optional[int]) -> Tuple[List[Dict[str, str]], bool]:
    """PURA · RPM1101A: si hay algo que reparar y falta memoria, `liberar_memoria` va PRIMERO
    (reiniciar Genesis o curar el enjambre con la RAM agotada es insistir en lo que no sirve).
    Devuelve (plan_final, liberando). Si ya estaba en el plan (regla «Memoria RAM libre») no se
    duplica; si todo está vivo o la memoria está bien, se devuelve el plan tal cual."""
    if plan and memoria_apretada(libre_mb, presion):
        paso = {"accion": "liberar_memoria", "titulo": TITULOS["liberar_memoria"],
                "por_que": "la Mac está sin memoria: sin liberar, lo demás no llega a nada"}
        return [paso] + [p for p in plan if p["accion"] != "liberar_memoria"], True
    return plan, False

def no_vivos(veredictos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [v for v in veredictos or [] if isinstance(v, dict) and v.get("estado") not in ("vivo", None)]


def plan_reparacion(clave: str, veredictos: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """PURA: [{accion, titulo, por_que}] sin repetir, en el orden en que salen las reglas.

    Un veredicto «desconocido» no se repara (no se sabe qué está mal); un «colgado» o «muerto» sí,
    si hay una regla para él."""
    clave = (clave or "").replace("_", "-")
    plan: List[Dict[str, str]] = []
    vistas = set()

    def poner(accion: str, por_que: str) -> None:
        if accion not in vistas:
            vistas.add(accion)
            plan.append({"accion": accion, "titulo": TITULOS.get(accion, accion), "por_que": por_que})

    malos = [v for v in no_vivos(veredictos) if v.get("estado") in ("colgado", "muerto")]
    for v in malos:
        proceso = str(v.get("proceso") or "")
        por_que = "%s: %s" % (proceso, str(v.get("detalle") or "")[:220])
        for patron, estados, acciones in REGLAS:
            if re.search(patron, proceso) and v.get("estado") in estados:
                for a in acciones:
                    poner(a, por_que)
    if malos and clave in POR_MEDIDOR:
        for a in POR_MEDIDOR[clave]:
            poner(a, "el medidor «%s» no está sano" % clave)
    return plan


def sin_reparacion(clave: str, veredictos: List[Dict[str, Any]]) -> List[str]:
    """PURA: los veredictos malos que ninguna regla sabe reparar (se dicen, no se esconden)."""
    fuera = []
    for v in no_vivos(veredictos):
        if v.get("estado") not in ("colgado", "muerto"):
            continue
        proceso = str(v.get("proceso") or "")
        if not any(re.search(p, proceso) and v.get("estado") in e for p, e, _ in REGLAS) \
                and clave not in POR_MEDIDOR:
            fuera.append("%s: %s" % (proceso, str(v.get("detalle") or "")[:160]))
    return fuera


def resultado(antes: List[Dict[str, Any]], despues: List[Dict[str, Any]], hubo_plan: bool) -> str:
    """PURA: «reparado» | «mejorado» | «sigue» | «nada» | «sin_reparacion»."""
    malos_antes = len([v for v in no_vivos(antes) if v.get("estado") in ("colgado", "muerto")])
    malos_despues = len([v for v in no_vivos(despues) if v.get("estado") in ("colgado", "muerto")])
    if not malos_antes:
        return "nada"
    if not hubo_plan:
        return "sin_reparacion"
    if not malos_despues:
        return "reparado"
    if malos_despues < malos_antes:
        return "mejorado"
    return "sigue"


def toca_auto(clave: str, plan: List[Dict[str, str]], estado: Dict[str, Any], ahora: float,
              forzar: bool = False) -> bool:
    """PURA: ¿reparan los directores este medidor ahora? Solo si hay plan y pasó su tiempo mínimo."""
    if not plan:
        return False
    if forzar:
        return True
    ultima = float(((estado or {}).get(clave) or {}).get("t") or 0)
    return ahora - ultima >= MINIMO_AUTO_S.get(clave, MINIMO_AUTO_DEFECTO_S)


def frase(clave: str, res: str, hechas: List[Dict[str, Any]], resumen_despues: str,
          sin_memoria: bool = False) -> str:
    """PURA: la línea que se enseña bajo el botón y se dice en el Chat Director.
    RPM1101A: si siguió igual y la Mac SIGUE sin memoria, la causa se dice («la Mac está sin
    memoria…»), no un vago «sigue igual»: liberar no bastó y Alex necesita saberlo enseguida."""
    bien = sum(1 for h in hechas if h.get("ok"))
    if res == "nada":
        return "«%s» está sano: no había nada que reparar." % clave
    if res == "sin_reparacion":
        return "«%s» tiene fallos sin reparación automática conocida: se dicen abajo." % clave
    if res == "sigue":
        cabeza = ("sigue mal: la Mac está sin memoria (lo liberado no bastó)" if sin_memoria
                  else "sigue igual tras reparar")
    else:
        cabeza = {"reparado": "reparado", "mejorado": "mejorado (queda algo)"}[res]
    return "«%s» %s · %d de %d acción(es) bien · ahora: %s" % (clave, cabeza, bien, len(hechas), resumen_despues)


# ── Memoria apretada (RPM1101A, puros) ───────────────────────────────────────────────────────

#: Cómo se reconoce un tsc real: el ejecutable (`node …/bin/tsc`) o un guion que acaba en « tsc».
#: Es el MISMO filtro de la barrida de tsc huérfanos del orquestador (SUP0111K), aquí en puro.
TSC_TOPE_MIN = 20  # un tsc con más minutos que este y un padre vivo, también se corta


def es_proceso_tsc(args: str) -> bool:
    """PURA · SUP0111K: ¿esta línea de comandos es un `tsc` (el guardia de `prioridad_conversacion`
    usa el mismo doble asidero)? Igual que ahí, se mira la orden y no el nombre dentro de un prompt."""
    linea = (args or "").strip()
    return "bin/tsc" in linea or linea.endswith(" tsc")


def tsc_huerfanos(filas: List[Tuple[Any, ...]], pid_vivo: Callable[[int], bool],
                  tope_min: int = TSC_TOPE_MIN) -> List[int]:
    """PURA · SUP0111K: los tsc huérfanos — su padre ya no vive, o llevan más de `tope_min`
    minutos de vida aunque el padre respire. Un tsc en su turno (padre vivo y joven) NO se toca.
    `filas`: (pid, ppid, etimes_s, args), tal cual da `ps -eo pid=,ppid=,etimes=,args=`."""
    fuera: List[int] = []
    for fila in filas or ():
        try:
            pid, ppid, etimes, args = fila[0], fila[1], fila[2], fila[3]
            pid, ppid, etimes = int(pid), int(ppid), int(etimes)
        except (IndexError, TypeError, ValueError):
            continue
        if pid in fuera or not es_proceso_tsc(args):
            continue
        if not pid_vivo(ppid) or etimes >= tope_min * 60:
            fuera.append(pid)
    return fuera


# ── Acciones reales ──────────────────────────────────────────────────────────────────────────

def _correr(orden: List[str], tope_s: int) -> Tuple[bool, str]:
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=tope_s,
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return False, "no terminó en %d s" % tope_s
    except OSError as e:
        return False, "no pude lanzarlo: %s" % e
    salida = (r.stdout or r.stderr or "").strip().splitlines()
    ultima = salida[-1][:200] if salida else ""
    return r.returncode == 0, (ultima or ("salió con %d" % r.returncode))


def _py(guion: str, *args: str, tope_s: int = 150) -> Tuple[bool, str]:
    return _correr([sys.executable, os.path.join(DIRECTORIO, guion), *args], tope_s)


def _kickstart(etiqueta: str) -> Tuple[bool, str]:
    ok, texto = _correr(["launchctl", "kickstart", "-k", "gui/%d/%s" % (os.getuid(), etiqueta)], 40)
    return ok, ("reinicié %s" % etiqueta) if ok else ("launchctl no pudo reiniciar %s: %s" % (etiqueta, texto))


def _modulo(nombre_archivo: str, alias: str):
    espec = importlib.util.spec_from_file_location(alias, os.path.join(DIRECTORIO, nombre_archivo))
    mod = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(mod)
    return mod


def _libre_gb() -> Optional[float]:
    try:
        e = os.statvfs(RAIZ)
        return round((e.f_bavail * e.f_frsize) / (1024 ** 3), 2)
    except OSError:
        return None


def accion_vigilante() -> Tuple[bool, str]:
    return _kickstart("com.starseed.vigilante")


def accion_enjambre() -> Tuple[bool, str]:
    import autocuracion_mando as A
    estado = A._leer_json(A.ESTADO, {})
    linea = A.curar_enjambre(estado, time.time(), forzar=True, medidores_fn=A._aptos_medidores)
    A._guardar(estado)
    return True, linea or "el enjambre no estaba atascado esperando proveedor"


def accion_carril_nube() -> Tuple[bool, str]:
    return _py("alta-capacidad-nube.py", "seguir", "--aplicar", tope_s=170)


def accion_nube_gh() -> Tuple[bool, str]:
    return _py("agentes_nube.py", tope_s=100)


def accion_reconciliar() -> Tuple[bool, str]:
    return _py("reconciliar_progreso.py", "--aplicar", tope_s=150)


def _viejos(patrones: List[str], edad_s: float) -> List[str]:
    ahora = time.time()
    salida = []
    for p in patrones:
        for ruta in glob.glob(p, recursive=True):
            try:
                if os.path.isfile(ruta) and ahora - os.path.getmtime(ruta) > edad_s:
                    salida.append(ruta)
            except OSError:
                continue
    return salida


def accion_disco() -> Tuple[bool, str]:
    import autocuracion_mando as A
    antes = _libre_gb()
    hecho: List[str] = []
    try:
        r = A.limpiar_worktrees() or {}
        if r.get("quitados") or r.get("nm_borrados"):
            hecho.append("%d worktree(s) cerrado(s) y %d node_modules duplicado(s)"
                         % (len(r.get("quitados") or []), len(r.get("nm_borrados") or [])))
    except Exception as e:  # noqa: BLE001
        hecho.append("worktrees: %s" % e)
    # Paquetes de builds y árboles que viajaron a la Mac por `.transfer/` (regenerables).
    if (_libre_gb() or 99) < 6:
        viejos = _viejos([os.path.join(RAIZ, ".transfer", "**", "parte-*"),
                          os.path.join(RAIZ, ".transfer", "**", "*.tar.gz"),
                          os.path.join(RAIZ, ".transfer", "**", "*.tgz")], 2 * 86400)
        for ruta in viejos:
            try:
                os.remove(ruta)
            except OSError:
                pass
        if viejos:
            hecho.append("%d paquete(s) viejo(s) de .transfer" % len(viejos))
    libre, lista_blanca = A.liberar_disco(A.DISCO_AVISO_GB)
    hecho += [h for h in lista_blanca if h and not h.endswith("nada")]
    # El build anterior (la vuelta atrás de la última instalación) solo con el disco crítico.
    anterior = os.path.join(RAIZ, ".next-anterior")
    if (_libre_gb() or 99) < A.DISCO_CRITICO_GB and os.path.isdir(anterior) \
            and time.time() - os.path.getmtime(anterior) > 3600:
        shutil.rmtree(anterior, ignore_errors=True)
        hecho.append("el build anterior (.next-anterior)")
    despues = _libre_gb()
    return True, "de %s a %s GB libres%s" % (antes, despues, (": " + "; ".join(hecho)) if hecho else " (nada que liberar)")


def accion_memoria() -> Tuple[bool, str]:
    g = _modulo("guardia-memoria.py", "guardia_memoria_reparar")
    cortados = g.barrer_trabajadores_huerfanos()
    texto = ("corté %d trabajador(es) de pruebas huérfano(s)" % len(cortados)) if cortados \
        else "no había trabajadores de pruebas huérfanos"
    try:
        libres = g.libres_mb()
    except Exception:  # noqa: BLE001
        libres = None
    if libres is not None and libres < 100:
        ok, t = _kickstart("com.starseed.guardia")
        texto += "; quedan %d MB: %s" % (libres, t)
    return True, texto


#: Marcas de «sin cupo» que puso el clasificador viejo leyendo la transcripción de opencode
#: (arreglado en 29ce92b06): su motivo empieza por la orden, no por un error.
_MOTIVO_FALSO = "$ opencode run"


def quitar_marcas_falsas(salud: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """PURA: (salud sin las marcas falsas, a quién se le quitaron)."""
    nueva, quitados = {}, []
    for prov, e in (salud or {}).items():
        if not isinstance(e, dict):
            nueva[prov] = e
            continue
        e = dict(e)
        if e.get("sin_cupo_hasta") and str(e.get("motivo") or "").startswith(_MOTIVO_FALSO):
            e.pop("sin_cupo_hasta", None)
            quitados.append(prov)
        claves = e.get("claves_agotadas")
        if isinstance(claves, dict):
            limpias = {h: x for h, x in claves.items() if not str((x or {}).get("motivo") or "").startswith(_MOTIVO_FALSO)}
            if len(limpias) != len(claves):
                quitados.append(prov + " (clave)")
                e["claves_agotadas"] = limpias
        nueva[prov] = e
    return nueva, quitados


def accion_proveedores() -> Tuple[bool, str]:
    import autocuracion_mando as A
    quitados: List[str] = []

    def limpiar():
        nonlocal quitados
        nueva, quitados = quitar_marcas_falsas(A._leer_json(A.SALUD, {}))
        if quitados:
            A._escribir_json(A.SALUD, nueva)

    A._con_cerrojo("salud", limpiar)
    resultados = A._sondear_escritores() or []
    aptos = A.aptos_de_sonda(resultados)
    levantados, perdonados = A._levantar_y_perdonar(aptos)
    partes = []
    if quitados:
        partes.append("marcas falsas quitadas: %s" % ", ".join(quitados))
    partes.append("pueden escribir: %s" % (", ".join(aptos) or "ninguno según la sonda"))
    if levantados:
        partes.append("marca vieja levantada: %s" % ", ".join(levantados))
    if perdonados:
        partes.append("rachas de cuelgue perdonadas: %d" % len(perdonados))
    return bool(aptos), " · ".join(partes)


def accion_autopublicacion() -> Tuple[bool, str]:
    try:
        with open(os.path.join(STARSEED, "produccion", "autopublicar-estado.json"), encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return False, "no encuentro el estado de la autopublicación"
    return True, "no publico desde aquí (la autopublicación tiene sus puertas): está «%s» · %s" % (
        d.get("fase") or "?", str(d.get("detalle") or "")[:200])


def accion_tokens() -> Tuple[bool, str]:
    return _kickstart("com.starseed.tokens")


def instalando_build(raiz: str = RAIZ) -> bool:
    """¿Hay una build a medio instalar? (`instalar_build.py` la deja en `.next-build` y reinicia él)."""
    return os.path.isdir(os.path.join(raiz, ".next-build"))


def accion_genesis() -> Tuple[bool, str]:
    """Con las MISMAS reglas que la autocuración (2026-10-23: la primera pasada reinició Genesis
    mientras `instalar_build.py` lo estaba reiniciando): nunca durante una publicación o una
    instalación, y no otra vez si ya se reinició hace poco."""
    import autocuracion_mando as A
    sondas = []
    for _ in range(A.SONDAS):
        sondas.append(bool(A.sondear()))
        if sondas[-1]:
            return True, "Genesis contesta: no hacía falta reiniciarlo"
        time.sleep(A.ESPERA_ENTRE_SONDAS_S)
    if instalando_build():
        return False, "no contesta, pero se está instalando una build nueva (ella lo reinicia): espero"
    estado = A._leer_json(A.ESTADO, {})
    ahora = time.time()
    reiniciar, porque = A.decidir_reinicio(sondas, ahora, estado.get("ultimo_reinicio"),
                                           A.publicacion_en_marcha(A._leer_json(A.PUBLICACION, {})))
    if not reiniciar:
        return False, porque
    A._reiniciar()
    estado["ultimo_reinicio"] = ahora
    A._guardar(estado)
    return bool(A.sondear()), "Genesis %s: lo reinicié" % porque


def accion_contenedores() -> Tuple[bool, str]:
    return _py("contenedores_nube.py", tope_s=120)


def accion_capacidad() -> Tuple[bool, str]:
    """El mismo botón «Buscar más capacidad en todos los medios»: GitHub Actions es gratis y el
    carril de Claude en la nube respeta su pausa y sus topes (no gasta crédito si está en pausa)."""
    ok, ultima = _py("buscar_capacidad.py", "buscar", "--aplicar", tope_s=240)
    return ok, _lo_que_sumo_buscar() or ultima


def _lo_que_sumo_buscar() -> str:
    """Lo que hizo «Buscar más capacidad» (su estado) en vez de su última línea, que es Oracle."""
    try:
        with open(os.path.join(STARSEED, "buscar-capacidad.json"), encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return ""
    hechas = [str(h) for h in d.get("hechas") or [] if h]
    if hechas:
        return "sumé %s: %s" % (d.get("sumados") or 0, " · ".join(hechas))[:400]
    nube = next((l for l in str(d.get("resumen") or "").splitlines() if l.startswith("· Nube")), "")
    return ("no cabía más: " + nube[2:])[:400] if nube else ""


# ── Liberar memoria (RPM1101A) ───────────────────────────────────────────────────────────────

URL_VOZ = "http://127.0.0.1:4444"      # el mismo «Aliviar memoria» de Genesis: ceder el pool de voz
URL_NEURONA = "http://127.0.0.1:11434"  # la Neurona local (Ollama): cargar sus modelos cuesta RAM


def _pid_vivo(pid: int) -> bool:
    """¿El proceso respira? `kill 0`: no señala nada, solo pregunta. Un pid muerto (ESRCH) no."""
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def _medir_memoria() -> Tuple[Optional[float], Optional[int]]:
    """La medida con el guardia YA AQUÍ instalado (libres_mb: libre+inactiva; presion_nucleo:
    nivel del kernel). Fuera de la Mac (o el guardia sin `vm_stat`/`sysctl`): None y None, con lo
    que `memoria_apretada` dice que no y NO se libera nada — solo se libera sobre su medida."""
    try:
        g = _modulo("guardia-memoria.py", "guardia_memoria_medir")
        return g.libres_mb(), g.presion_nucleo()
    except Exception:  # noqa: BLE001
        return None, None


def _medida(medir: Callable[[], Any]) -> Tuple[Optional[float], Optional[int]]:
    try:
        libre, presion = medir()
        return libre, presion
    except Exception:  # noqa: BLE001 — la medida nunca debe tirar una reparación
        return None, None


def _descargar_neurona() -> List[str]:
    """`keep_alive: 0` de Ollama: descargar AHORA lo cargado (si no, se queda en RAM hasta su
    horario; y descargar RAM es lo que se busca). Sin generar tokens: `num_predict: 0`."""
    descargados: List[str] = []
    try:
        with urllib.request.urlopen(URL_NEURONA + "/api/ps", timeout=4) as r:
            cargados = json.loads(r.read().decode("utf-8") or "[]") or []
    except Exception:  # noqa: BLE001 — sin Neurona local, paso siguiente
        return []
    for m in cargados[:8]:
        nombre = (m.get("name") or m.get("model")) if isinstance(m, dict) else None
        if not nombre:
            continue
        try:
            cuerpo = json.dumps({"model": nombre, "prompt": "", "keep_alive": 0,
                                 "options": {"num_predict": 0}}).encode("utf-8")
            peticion = urllib.request.Request(URL_NEURONA + "/api/generate", data=cuerpo,
                                              headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(peticion, timeout=20) as r:
                r.read()
            descargados.append(str(nombre))
        except Exception:  # noqa: BLE001
            continue
    return descargados


def accion_liberar_memoria() -> Tuple[bool, str]:
    """RPM1101A · la causa de fondo, con lo ya existente y EN ESTE ORDEN (lo que suelta RAM de
    verdad antes, lo que solo la retiene después): 1) dormir el BitNet (el guardia ya tiene el
    pedir: `/api/bitnet/dormir`, el del botón «Aliviar memoria»; dormido suelta su mlock),
    2) ceder el pool de voz (se relanza solo en la siguiente frase), 3) descargar la Neurona con
    `keep_alive: 0`, 4) cortar los huérfanos que ya nadie vigila: los trabajadores de pruebas
    (vitest) con el barrido del guardia y los tsc con el patrón SUP0111K. Devuelve (ya no está
    apretada, lo que se hizo); si no pudimos soltar nada, el texto lo dice."""
    g = _modulo("guardia-memoria.py", "guardia_memoria_liberar")
    partes: List[str] = []
    hecho, dormido = g.pedir_dormir_bitnet(g.URL_ASTRAURA)
    if hecho:
        partes.append("BitNet: %s" % ("dormido" if dormido else "en uso, sigue"))
    try:
        with urllib.request.urlopen(URL_VOZ + "/ceder", timeout=8) as r:
            voz = json.loads(r.read().decode("utf-8") or "{}")
        partes.append("voz cedida: %s servidor(es)" % (voz.get("cedidos") if isinstance(voz, dict) else "?"))
    except Exception:  # noqa: BLE001 — sin demonio de voz, seguir
        pass
    descargados = _descargar_neurona()
    if descargados:
        partes.append("%d modelo(s) de la Neurona descargado(s)" % len(descargados))
    cortados = g.barrer_trabajadores_huerfanos()
    if cortados:
        partes.append("%d trabajador(es) de pruebas huérfano(s) cortado(s)" % len(cortados))
    tsc_cortados = []
    try:
        filas = []
        for linea in subprocess.run(["ps", "-eo", "pid=,ppid=,etimes=,args="], capture_output=True,
                                    text=True, timeout=15).stdout.splitlines():
            partes_l = linea.split(None, 3)
            if len(partes_l) == 4:
                filas.append(tuple(partes_l))
        for pid in tsc_huerfanos(filas, _pid_vivo):
            if pid == os.getpid():
                continue
            try:
                os.kill(pid, signal.SIGKILL)
                tsc_cortados.append(pid)
            except OSError:
                pass
    except Exception:  # noqa: BLE001
        pass
    if tsc_cortados:
        partes.append("%d tsc huérfano(s) cortado(s)" % len(tsc_cortados))
    libre, presion = _medir_memoria()
    suelto = not memoria_apretada(libre, presion)
    texto = ("; ".join(partes) or "nada que liberar: sin BitNet, sin voz, sin Neurona, sin huérfanos")
    if suelto:
        texto += " · la Mac respira otra vez"
    else:
        texto += " · sigue apretada (%s MB libres)" % ("?" if libre is None else int(libre))
    return suelto or bool(partes or cortados or tsc_cortados), texto


ACCIONES: Dict[str, Callable[[], Tuple[bool, str]]] = {
    "vigilante": accion_vigilante, "enjambre": accion_enjambre, "carril_nube": accion_carril_nube,
    "nube_gh": accion_nube_gh, "reconciliar": accion_reconciliar, "disco": accion_disco,
    "memoria": accion_memoria, "proveedores": accion_proveedores, "autopublicacion": accion_autopublicacion,
    "tokens": accion_tokens, "genesis": accion_genesis, "contenedores": accion_contenedores,
    "capacidad": accion_capacidad, "liberar_memoria": accion_liberar_memoria,
}


# ── Orquestación ─────────────────────────────────────────────────────────────────────────────

def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _escribir(ruta: str, datos: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def _leer(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def ruta_reparacion(clave: str) -> str:
    return os.path.join(CARPETA, "reparacion-%s.json" % clave)


def _comprobar(clave: str) -> Dict[str, Any]:
    os.chdir(RAIZ)  # comprobar_medidor usa rutas relativas al repo
    import comprobar_medidor as CM
    return CM.comprobar_y_guardar(clave)


def reparar(clave: str, origen: str = "boton", comprobar: Callable[[str], Dict[str, Any]] = _comprobar,
            acciones: Optional[Dict[str, Callable[[], Tuple[bool, str]]]] = None,
            plan_previo: Optional[Tuple[Dict[str, Any], List[Dict[str, str]]]] = None,
            medir: Callable[[], Any] = _medir_memoria) -> Dict[str, Any]:
    """Comprueba, repara y vuelve a comprobar UN medidor; deja `reparacion-<clave>.json`.
    RPM1101A: con la Mac sin memoria, `liberar_memoria` entra primero en el plan (el que manda
    es la medida con el guardia, inyectable para las pruebas) y si al final SIGUE sin memoria,
    el resumen lo dice como causa en vez de «sigue igual»."""
    clave = clave.replace("_", "-")
    acciones = acciones or ACCIONES
    empezado = _iso()
    base = {"medidor": clave, "origen": origen, "empezado": empezado, "terminado": None,
            "resumen": "Reparando…", "acciones": [], "paso": "comprobando"}
    _escribir(ruta_reparacion(clave), base)
    antes, plan = plan_previo if plan_previo else (None, None)
    if antes is None:
        antes = comprobar(clave)
        plan = plan_reparacion(clave, antes.get("veredictos") or [])
    plan = plan or []
    libre_antes, presion_antes = _medida(medir)
    plan, liberando = con_liberacion(plan, libre_antes, presion_antes)
    hechas: List[Dict[str, Any]] = []
    for paso in plan or []:
        _escribir(ruta_reparacion(clave), dict(base, paso="reparando: %s" % paso["titulo"], acciones=hechas))
        fn = acciones.get(paso["accion"])
        t0 = time.time()
        try:
            ok, texto = fn() if fn else (False, "acción desconocida")
        except Exception as e:  # noqa: BLE001 — una acción rota no para a las demás
            ok, texto = False, "%s: %s" % (type(e).__name__, str(e)[:160])
        hechas.append(dict(paso, ok=bool(ok), resultado=texto, segundos=round(time.time() - t0, 1)))
    despues = comprobar(clave) if plan else antes
    libre_despues, presion_despues = _medida(medir)
    sin_memoria = memoria_apretada(libre_despues, presion_despues)
    res = resultado(antes.get("veredictos") or [], despues.get("veredictos") or [], bool(plan))
    salida = {
        "medidor": clave, "origen": origen, "empezado": empezado, "terminado": _iso(),
        "resultado": res, "resumen": frase(clave, res, hechas, despues.get("resumen") or "", sin_memoria),
        "memoria": {"antes": {"libre_mb": libre_antes, "presion": presion_antes},
                    "despues": {"libre_mb": libre_despues, "presion": presion_despues}},
        "antes": {"resumen": antes.get("resumen"), "veredictos": antes.get("veredictos") or []},
        "despues": {"resumen": despues.get("resumen"), "veredictos": despues.get("veredictos") or []},
        "acciones": hechas, "sin_reparacion": sin_reparacion(clave, despues.get("veredictos") or []),
    }
    _escribir(ruta_reparacion(clave), salida)
    return salida


class Cerrojo:
    """Una reparación a la vez (el botón y los directores comparten el mismo)."""

    def __enter__(self):
        os.makedirs(os.path.dirname(CERROJO), exist_ok=True)
        self.f = open(CERROJO, "a")
        try:
            fcntl.flock(self.f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.f.close()
            return None
        return self

    def __exit__(self, *_):
        if getattr(self, "f", None) and not self.f.closed:
            fcntl.flock(self.f, fcntl.LOCK_UN)
            self.f.close()


def reparar_todos(origen: str = "directores", forzar: bool = False, ahora: Optional[float] = None,
                  comprobar: Callable[[str], Dict[str, Any]] = _comprobar,
                  acciones: Optional[Dict[str, Callable[[], Tuple[bool, str]]]] = None,
                  avisar: Optional[Callable[[str], None]] = None) -> List[Dict[str, Any]]:
    """Lo que hacen los directores cada 10 min: comprobar cada medidor de `MEDIDORES_AUTO` y
    reparar los que lo necesiten (con su tiempo mínimo). Devuelve las reparaciones hechas."""
    ahora = time.time() if ahora is None else ahora
    estado = _leer(ESTADO_AUTO, {})
    hechas = []
    for clave in MEDIDORES_AUTO:
        try:
            comp = comprobar(clave)
        except Exception as e:  # noqa: BLE001
            estado.setdefault("_errores", {})[clave] = "%s: %s" % (type(e).__name__, e)
            continue
        plan = plan_reparacion(clave, comp.get("veredictos") or [])
        if not toca_auto(clave, plan, estado, ahora, forzar):
            continue
        r = reparar(clave, origen=origen, comprobar=comprobar, acciones=acciones, plan_previo=(comp, plan))
        estado[clave] = {"t": ahora, "resultado": r["resultado"], "resumen": r["resumen"]}
        hechas.append(r)
    estado["ultima_pasada"] = ahora
    _escribir(ESTADO_AUTO, estado)
    if hechas and avisar:
        avisar("Directores · reparación de medidores: " + " | ".join(r["resumen"] for r in hechas)[:900])
    return hechas


def _avisar(texto: str) -> None:
    try:
        import director_chat
        director_chat.publicar(texto, de="director-autocuracion", rol="director", tipo="aviso")
    except Exception:  # noqa: BLE001
        pass


def main(argv: List[str]) -> int:
    origen = argv[argv.index("--origen") + 1] if "--origen" in argv and argv.index("--origen") + 1 < len(argv) else None
    claves = [a for a in argv[1:] if not a.startswith("--") and a != origen]
    with Cerrojo() as c:
        if c is None:
            texto = "ya hay una reparación en marcha (otro medidor o los directores): vuelve a pulsar en un momento"
            if claves and "--todos" not in argv:
                _escribir(ruta_reparacion(claves[0]), {
                    "medidor": claves[0], "origen": origen or "boton", "empezado": _iso(), "terminado": _iso(),
                    "resultado": "ocupado", "resumen": texto, "acciones": []})
            print(texto)
            return 0
        if "--todos" in argv:
            hechas = reparar_todos(origen=origen or "directores", forzar="--forzar" in argv, avisar=_avisar)
            print("\n".join(r["resumen"] for r in hechas) or "medidores sanos o reparados hace poco: nada que hacer")
            return 0
        if not claves:
            print(__doc__)
            return 2
        r = reparar(claves[0], origen=origen or "boton")
        print(r["resumen"])
        return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
