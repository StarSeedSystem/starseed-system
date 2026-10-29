#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Nodo de MetaGenesis: el director general que corre en CUALQUIER medio (OPA1011, 2026-10-10).

Alex: «no está funcionando MetaGenesis por sí misma: aún no ha sido capaz de continuar con las
tareas sin tener que decírtelo aquí. Soluciónalo para que realmente sea MetaGenesis … autónoma,
funcionando desde cualquier medio donde lo abra, en cualquier neurona, no solo esta Mac … sin
necesidad de esta Mac ni de pedírtelo a ti; desde cualquier medio se autorrepara».

El MISMO programa corre en la Mac, en el A1 de Oracle (servicio `starseed-metagenesis` de
OPO1011), en el contenedor de la nube o en otra neurona. Cada vuelta:

  1. Mide su medio (servicios, orquestadores, disco, memoria y, si tiene las colas en su disco,
     las cifras del vigía de medidores, las mismas que ve Alex en Genesis).
  2. Late en Supabase y decide quién dirige: ARRIENDO de líder con un solo líder a la vez y
     relevo automático si deja de latir (bus `relevo_eventos` hoy; tablas con arriendo atómico
     cuando se aplique la migración 20261011100000).
  3. Se cura a sí mismo (servicios caídos, disco) sea o no líder.
  4. Si es el LÍDER: continuidad (trabajo listo sin orquestador → directores; nada que hacer →
     busca trabajo en `colas-fuente/`), guardianes caídos, bloqueadas al revisor automático
     (OPB1011), relevo de medio si la Mac calla (las colas portables siguen en otro medio), y
     publica la FOTO que cualquier neurona lee en /metagenesis.
  5. Atiende las órdenes FIRMADAS (o de la tabla con RLS) que lleguen para él.
  6. (OPA1011b) Mira RESULTADOS, no solo latidos: presta a un medio ocioso (el A1) las tareas listas
     del final del orden de la Mac sin duplicarlas; convierte una puerta de publicación en rojo que
     no se levanta en 1 h en una tarea de reparación con su salida exacta; avisa UNA vez de las
     fallidas que nadie retoma y del visto bueno que lleva horas esperando.
Claude no hace falta: es un medio más que puede sumarse. Nada de esto imprime una clave.

  python3 scripts/puente/nodo_metagenesis.py servir [--seco]        bucle (launchd/systemd)
  python3 scripts/puente/nodo_metagenesis.py ciclo [--seco] [--json] [--sin-red]  una vuelta
  python3 scripts/puente/nodo_metagenesis.py ciclo --solo-leer      qué decidiría AHORA el líder, sin escribir nada
  python3 scripts/puente/nodo_metagenesis.py estado                 lo último de este nodo
  python3 scripts/puente/nodo_metagenesis.py orden <acción> [--para lider|<medio>|<nodo>] [--cola X] [--esperar]
  python3 scripts/puente/nodo_metagenesis.py llave                  crea la llave del nodo (enseña su huella)
  python3 scripts/puente/nodo_metagenesis.py registrar --nodo ID --huella H   (con la clave de servicio)
  python3 scripts/puente/nodo_metagenesis.py instalar [--seco]      launchd (Mac) o systemd --user (Linux)
SOP: architecture/metagenesis-autonoma.md · pruebas: test_nodo_metagenesis.py
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import secrets
import signal
import sys
import time
from typing import Any, Callable, Dict, List, Optional

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import nodo_metagenesis_bus as B  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402
import nodo_metagenesis_medio as M  # noqa: E402
import colmena_logica as C  # noqa: E402
import traer_nube as T  # noqa: E402

CARPETA = os.path.expanduser(os.environ.get("STARSEED_NODO_DIR") or "~/.starseed/nodo-metagenesis")
MEMORIA = os.path.join(CARPETA, "memoria.json")
ESTADO = os.path.join(CARPETA, "estado.json")
LLAVE = os.path.join(CARPETA, "llave")
#: Vuelta del líder y de los demás (s). El latido sale como mucho cada `L.LATIDO_S`.
CADA_LIDER_S = int(os.environ.get("STARSEED_NODO_CADA_LIDER_S", "120"))
CADA_S = int(os.environ.get("STARSEED_NODO_CADA_S", str(L.LATIDO_S)))
FOTO_MAX_S = 30 * 60
COLAS_CADA_S = 30 * 60
REPROBAR_TABLAS_S = 30 * 60
#: (PDA1011) Tras un fallo de la puerta de datos, cuánto se sigue por el bus antes de volver a probarla.
PUERTA_REINTENTO_S = 5 * 60
DECISIONES_MAX = 40


# ─── memoria del nodo (solo en ESTA máquina) ─────────────────────────────────────────────


def leer_memoria() -> Dict[str, Any]:
    m = M.leer_json(MEMORIA, {})
    m = m if isinstance(m, dict) else {}
    m.setdefault("hecho", {})
    m.setdefault("nonces", {})
    m.setdefault("decisiones", [])
    m.setdefault("autonomia", True)
    return m


def guardar(ruta: str, datos: Any) -> None:
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True, mode=0o700)
        M.escribir_atomico(ruta, datos)
    except OSError:
        pass


def leer_llave(crear: bool = False) -> str:
    llave = os.environ.get("STARSEED_NODO_LLAVE", "").strip()
    if llave:
        return llave
    try:
        with open(LLAVE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        if not crear:
            return ""
    os.makedirs(CARPETA, exist_ok=True, mode=0o700)
    llave = secrets.token_urlsafe(32)
    fd = os.open(LLAVE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(llave)
    return llave


def huella_llave(llave: str) -> str:
    return hashlib.sha256(llave.encode("utf-8")).hexdigest()


# ─── al volver (COL1012H) ────────────────────────────────────────────────────────────────


def debe_revisar_al_volver(ahora: float, ultimo_latido: Any, periodo_s: Any = None) -> bool:
    """PURA. ¿Este es el primer latido tras un silencio que ya cuenta como pérdida?

    `colmena_logica.silencio_max` es el mismo umbral con el que el líder da por perdido un
    aparato; usar otro aquí haría que el que vuelve siguiera trabajo que otro ya relevó.
    Sin latido anterior (arranque de verdad) también toca revisar: la memoria pudo sobrevivir
    a un reinicio del servicio y las asignaciones del bus siguen vigentes."""
    try:
        ultimo = float(ultimo_latido or 0)
    except (TypeError, ValueError):
        ultimo = 0.0
    if ultimo <= 0:
        return True
    return ahora - ultimo > C.silencio_max({"periodo_s": periodo_s})


def _llamar_enviar_puntos(enviar: Callable[..., Any], raiz: str, ids: List[str], t: float) -> Any:
    """Llama a `oracle_nodo.enviar_puntos` con la forma que tenga, sin inventarle argumentos.

    La firma de esa pieza no es parte de este módulo; se adapta a la que exista para que el
    nodo no dependa de un orden concreto y siga funcionando si mañana cambia."""
    import inspect
    try:
        params = inspect.signature(enviar).parameters
    except (TypeError, ValueError):
        return enviar(raiz, ids, t)
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return enviar(raiz=raiz, ids=ids, t=t)
    kw = {k: v for k, v in (("raiz", raiz), ("ids", ids), ("t", t)) if k in params}
    if kw:
        return enviar(**kw)
    if "puntos" in params:
        return enviar(ids)
    return enviar()


def enviar_puntos_al_a1(raiz: str, ids: List[str], t: float, enviar: Optional[Callable[..., Any]] = None) -> bool:
    """Fuerza el último punto de control de `ids` y lo deja fuera del aparato (el A1).

    Best-effort a propósito: si COL1012E aún no está en este árbol (o el A1 no responde),
    el nodo igualmente suelta la tarea; lo peor sería seguir escribiendo la misma tarea que
    otro ya tiene, y el punto local sigue ahí para el siguiente intento."""
    if not ids:
        return False
    if enviar is None:
        try:
            import oracle_nodo  # noqa: WPS433 — solo existe en la Mac/A1, no en la nube ligera
        except Exception:  # noqa: BLE001
            return False
        enviar = getattr(oracle_nodo, "enviar_puntos", None)
    if not callable(enviar):
        return False
    try:
        return _llamar_enviar_puntos(enviar, raiz, list(ids), t) is not False
    except Exception:  # noqa: BLE001 — un fallo al subir no puede tumbar la vuelta del nodo
        return False


def soltar_en_control(olas: str, cola: str, ids: List[str], t: float,
                      cerrojos: Optional[str] = None) -> List[str]:
    """Escribe la orden `soltar` en `olas/control-<cola>.json` con el MISMO flock del orquestador.

    Se hace aquí y no con `repartir_nube.soltar_en_la_mac` porque el paquete del nodo del A1
    solo lleva unos pocos módulos de `scripts/puente`; un import de más dejaría el relevo sin
    efecto justo en el aparato que nunca se apaga. El formato es el de «Reasignar → otro
    servidor», que el orquestador ya corta y marca `reasignada`."""
    if not ids:
        return []
    import fcntl  # noqa: WPS433 — el flock es el mismo archivo que usa el orquestador
    cerrojos = cerrojos or os.path.expanduser("~/.starseed/cerrojos")
    nombre = cola if cola.endswith(".json") else cola + ".json"
    ruta = os.path.join(olas, "control-" + nombre)
    sello = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))
    nuevas = {str(tid): {"accion": "soltar", "donde": "colmena", "quien": "colmena", "t": sello}
              for tid in ids}
    try:
        os.makedirs(cerrojos, exist_ok=True)
        with open(os.path.join(cerrojos, "control-" + os.path.basename(ruta) + ".lock"), "a") as cer:
            fcntl.flock(cer, fcntl.LOCK_EX)
            try:
                actuales = M.leer_json(ruta, {})
                actuales = dict(actuales) if isinstance(actuales, dict) else {}
                actuales.update(nuevas)
                M.escribir_atomico(ruta, actuales)
            finally:
                fcntl.flock(cer, fcntl.LOCK_UN)
        return list(nuevas)
    except Exception:  # noqa: BLE001 — sin archivo de control se avisa, no se tumba la vuelta
        return []


# ─── préstamos de trabajo (CAP1020A) ─────────────────────────────────────────────────────

#: (2026-10-20, CAP1020A) El estado del A1 que deja `oracle_nodo.estado()` en la Mac:
#: «nodo» → «colas» → «ultima» (la última cola que hizo el A1, con su «fin»). Es de donde sale
#: «la cola del A1 terminó», que es lo que termina un préstamo.
ESTADO_ORACLE = os.path.expanduser("~/.starseed/oracle.json")
#: Cuántos préstamos se quedan en la memoria (los que se podan).
PRESTAMOS_MAX = 20


def cola_terminada(datos: Any) -> Optional[Any]:
    """PURA: (cola, fin) de la última cola que terminó en el A1, o None si no lo dice.

    (2026-10-20, CAP1020A) UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA. El estado del A1 lo deja
    `oracle_nodo.estado()` en `~/.starseed/oracle.json` («nodo» → «colas» → «ultima»); el propio
    A1 también lo publica en su latido. Se acepta cualquiera de las dos formas."""
    if not isinstance(datos, dict):
        return None
    nodo = datos.get("nodo") if isinstance(datos.get("nodo"), dict) else datos
    colas = nodo.get("colas") if isinstance(nodo.get("colas"), dict) else {}
    ultima = colas.get("ultima") if isinstance(colas.get("ultima"), dict) else None
    if not isinstance(ultima, dict):
        return None
    cola = str(ultima.get("cola") or "").strip()
    try:
        fin = float(ultima.get("fin"))
    except (TypeError, ValueError):
        return None
    return (cola, fin) if cola else None


def podar_prestamos(prestamos: Any, t: float, gracia_s: int = L.GRACIA_ASIGNACION_S,
                    tope: int = PRESTAMOS_MAX) -> List[Dict[str, Any]]:
    """PURA: los préstamos que se quedan en la memoria (los últimos `tope` dentro de la gracia).

    (2026-10-20, CAP1020A) Un préstamo terminado conserva su `fin` al podarse: los medidores de
    resultados lo necesitan para saber que ese trabajo ya no está en marcha."""
    dentro = []
    for p in prestamos or []:
        if not isinstance(p, dict):
            continue
        try:
            ts = float(p.get("ts") or 0)
        except (TypeError, ValueError):
            ts = 0.0
        if t - ts < gracia_s:
            dentro.append(p)
    return dentro[-tope:]
def _segundos(x: Any) -> float:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else 0.0


def entradas_de_relevo(nov: Dict[str, Any], vivos: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Traduce lo que el líder YA lee del bus a las entradas de `colmena_logica.plan_relevo`.

    El latido publica `en_curso`, `periodo_s` y `contenedor` DENTRO de `salud` (contrato §3), así que se
    leen de ahí y solo se cae a la raíz para los latidos viejos. Las asignaciones del bus llevan `ids`
    (no `id`): se expanden para que una tarea ya entregada no se vuelva a prestar en la vuelta siguiente."""
    latidos: Dict[str, Dict[str, Any]] = {}
    for lat in (nov or {}).get("latidos") or []:
        if not isinstance(lat, dict) or not lat.get("nodo"):
            continue
        salud = lat.get("salud") if isinstance(lat.get("salud"), dict) else {}
        en_curso = salud.get("en_curso")
        if not isinstance(en_curso, list):
            en_curso = lat.get("en_curso") if isinstance(lat.get("en_curso"), list) else []
        latidos[str(lat["nodo"])] = {
            "t": _segundos(lat.get("ts")),
            "periodo_s": _segundos(salud.get("periodo_s") or lat.get("periodo_s")) or 300.0,
            "en_curso": en_curso,
        }
    bajas: Dict[str, Dict[str, Any]] = {}
    for b in (nov or {}).get("bajas") or []:
        if isinstance(b, dict) and b.get("nodo"):
            bajas[str(b["nodo"])] = {"t": _segundos(b.get("ts")), "traspaso": bool(b.get("traspaso"))}
    asignadas: Dict[str, Dict[str, Any]] = {}
    for a in (nov or {}).get("asignaciones") or []:
        if not isinstance(a, dict):
            continue
        ts = _segundos(a.get("ts"))
        destino = a.get("a") or a.get("nodo")
        ids = a.get("ids") if isinstance(a.get("ids"), list) else [a.get("id")]
        for tid in ids:
            if not tid:
                continue
            previa = asignadas.get(str(tid)) or {}
            if ts >= _segundos(previa.get("t")):
                asignadas[str(tid)] = {"a": destino, "t": ts}
    nodos: Dict[str, Dict[str, Any]] = {}
    ocupados: Dict[str, int] = {}
    for n, v in (vivos or {}).items():
        salud = v.get("salud") if isinstance(v.get("salud"), dict) else {}
        en_curso = salud.get("en_curso")
        if not isinstance(en_curso, list):
            en_curso = v.get("en_curso") if isinstance(v.get("en_curso"), list) else None
        nodos[str(n)] = {
            "medio": str(v.get("medio") or ""),
            "vivo": True,
            "modo": v.get("modo"),
            "desconectando": bool(salud.get("desconectando")),
            "contenedor": salud.get("contenedor") or {},
        }
        if isinstance(en_curso, list):
            ocupados[str(n)] = len(en_curso)
        else:
            # Sin `en_curso` medido no se inventa un hueco: se cuenta lo que diga su trabajo.
            trabajo = salud.get("trabajo") if isinstance(salud.get("trabajo"), dict) else {}
            ocupados[str(n)] = int(_segundos(trabajo.get("en_curso")))
    return {"latidos": latidos, "bajas": bajas, "asignadas": asignadas, "nodos": nodos, "ocupados": ocupados}


# ─── el nodo ─────────────────────────────────────────────────────────────────────────────


class Nodo:
    """Una vuelta del nodo, con todo lo de fuera inyectable (las pruebas usan un Supabase simulado
    y un medio falso)."""

    def __init__(self, seco: bool = False, sin_red: bool = False, env: Optional[Dict[str, str]] = None,
                 medir: Callable[[str, float], Dict[str, Any]] = None, ejecutar: Callable[..., Any] = None,
                 http: B.Http = B.http_urllib, reloj: Callable[[], float] = time.time,
                 memoria: Optional[Dict[str, Any]] = None, persistir: bool = True,
                 huella: Optional[str] = None, rescate: Optional[Callable[..., Any]] = None,
                 chat: Optional[Callable[[str], None]] = None, llave: Optional[str] = None,
                 candidatos: Optional[Callable[[str], List[Dict[str, Any]]]] = None,
                 tareas_locales: Optional[Callable[[str], List[Any]]] = None,
                 enlistar: Optional[Callable[..., Any]] = None,
                 existentes: Optional[Callable[[str, List[str]], List[str]]] = None,
                 solo_leer: bool = False, puerta: Any = None,
                 enviar_puntos: Optional[Callable[..., Any]] = None):
        self.modo = "seco" if seco or solo_leer else "real"
        #: (OPA1011b) Prueba seca EN un medio vivo: lee el bus como el servicio, no escribe nada y se
        #: puntúa como el medio real (si no, su propio latido seco le quitaría el mando en el cálculo).
        self.solo_leer = solo_leer
        self.sin_red = sin_red
        self.env = env if env is not None else B.leer_entorno()
        self._medir = medir or (lambda modo, t: M.medir(modo, t))
        self._ejecutar = ejecutar or M.ejecutar
        self.http = http
        self.reloj = reloj
        self.persistir = persistir
        self.mem = memoria if memoria is not None else leer_memoria()
        self._huella = huella
        self.yo = ""
        self.enlace: Any = None
        self._probado_tablas = 0.0
        self.secreto = self.env.get("STARSEED_LANZADOR_SECRETO", "")
        self._rescate = rescate
        self._chat = chat
        self._llave = llave
        # (OPA1011b) Préstamo de trabajo y reparación de la publicación: inyectables en las pruebas.
        self._candidatos = candidatos or M.candidatos_reparto
        self._enlistar = enlistar or M.enlistar_reparacion
        self._existentes = existentes or M.existentes
        self._asignaciones: List[Dict[str, Any]] = []
        self._medida_salud: Dict[str, Any] = {}
        #: (PDA1011) Puerta de datos del A1: inyectable en las pruebas; si no, del entorno (solo la URL:
        #: el nodo entra con SU llave, sin ficha). `STARSEED_NODO_PUERTA=apagada` → bus como antes.
        self._puerta = puerta
        #: (COL1012H) Inyectable: en la máquina es `oracle_nodo.enviar_puntos`; sin él, best-effort.
        self._enviar_puntos = enviar_puntos

    # ── enlace ──
    def _rest(self) -> Optional[B.Rest]:
        url, anon = self.env.get("NEXT_PUBLIC_SUPABASE_URL", ""), self.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        if self.sin_red or not url or not anon:
            return None
        return B.Rest(url, anon, http=self.http)

    def _puerta_de_datos(self) -> Any:
        """(PDA1011) El cliente de la puerta si está configurada y no está apagada; si no, None."""
        if self.sin_red or self.solo_leer:
            return None
        if (self.env.get("STARSEED_NODO_PUERTA") or os.environ.get("STARSEED_NODO_PUERTA") or "auto").strip().lower() in ("apagada", "off", "0", "no"):
            return None
        if self._puerta is None:
            url = (self.env.get("PUERTA_DATOS_URL") or "").strip().rstrip("/")
            if not (url.startswith("https://") or url.startswith("http://127.0.0.1") or url.startswith("http://localhost")):
                return None
            try:
                import puerta_datos_cliente as PDC
            except ImportError:
                return None
            self._puerta = PDC.Puerta(url=url, ficha="")
        return self._puerta

    def _enlazar(self, medio: str, ahora: float) -> None:
        if self.enlace is not None and self.enlace.modo == "puerta":
            return
        # (PDA1011) La puerta de datos del A1 primero: arriendo sin peticiones a Supabase por vuelta.
        # Su salud se mira con espera creciente (1, 2, 5, 10 min): estando en el bus, se vuelve sola.
        # (2026-10-14) …y estando en las TABLAS también. Antes las tablas eran un final: la puerta
        # no respondió un rato, la Mac pasó al bus y luego a las tablas y ya no volvió a probarla.
        # El A1 seguía en la puerta: dos arriendos, dos líderes que se creían solos («Nodos vivos:»
        # cada uno el suyo) y nadie prestaba trabajo, con 123 tareas listas.
        puerta = self._puerta_de_datos()
        en_tablas = self.enlace is not None and self.enlace.modo == "tablas"
        toca_puerta = ahora >= float(self.mem.get("puerta_reintento") or 0)
        if en_tablas and (puerta is None or not toca_puerta):
            return
        if puerta is not None and toca_puerta and puerta.disponible():
            llave = self._llave if self._llave is not None else leer_llave()
            rest = self._rest()
            if llave and rest is not None:
                ultimo = self.enlace.ultimo_id if isinstance(self.enlace, B.EnlaceBus) else 0
                self.enlace = B.EnlacePuerta(rest, self.yo, puerta, llave, medio)
                self.enlace.ultimo_id = ultimo
                self.mem.pop("puerta_motivo", None)
                return
        if en_tablas:
            # La puerta sigue sin responder: las tablas siguen valiendo y se prueba otra vez en 5 min.
            self.mem["puerta_reintento"] = ahora + PUERTA_REINTENTO_S
            return
        if self.enlace is not None and ahora - self._probado_tablas < REPROBAR_TABLAS_S:
            return
        rest = self._rest()
        if rest is None:
            self.enlace = None
            return
        if self.solo_leer:
            self.enlace = self.enlace if isinstance(self.enlace, B.EnlaceSoloLectura) else B.EnlaceSoloLectura(rest, self.yo)
            return
        llave = self._llave if self._llave is not None else leer_llave()
        self._probado_tablas = ahora
        if llave:
            t = B.EnlaceTablas(rest, self.yo, llave, medio)
            ok, motivo = t.probar()
            if ok:
                self.enlace = t
                return
            self.mem["tablas_motivo"] = motivo
        if self.enlace is None or self.enlace.modo != "bus":
            self.enlace = B.EnlaceBus(rest, self.yo)

    # ── una vuelta ──
    def vuelta(self) -> Dict[str, Any]:
        t = self.reloj()
        medida = self._medir(self.modo, t)
        medio = medida["medio"]
        salud = medida["salud"]
        cap = medida["cap"]
        if not self.yo:
            self.yo = L.id_de_nodo(medio, self._huella if self._huella is not None else M.huella_maquina())
        salud["nodo"] = self.yo
        self._medida_salud = salud
        castigo = -2000 if float(self.mem.get("no_liderar_hasta") or 0) > t else 0
        puntos = L.puntos_nodo(dict(cap, modo="real") if self.solo_leer else cap) + castigo
        # (COL1012H) El silencio se mide con el último latido QUE SALIÓ, no con la vuelta actual:
        # si el aparato estuvo fuera, otro pudo relevar su trabajo y ahora hay que soltarlo.
        ultimo_previo = self.mem.get("ultimo_latido")
        volviendo = debe_revisar_al_volver(t, ultimo_previo, salud.get("periodo_s"))
        self._relojes(salud, t)
        informe: Dict[str, Any] = {"nodo": self.yo, "medio": medio, "modo": self.modo, "ts": t, "puntos": puntos,
                                   "acciones": [], "ordenes": [], "avisos": []}

        self._enlazar(medio, t)
        enlace = self.enlace
        antes = enlace.rest.peticiones if enlace is not None else 0
        informe["enlace"] = enlace.modo if enlace else "sin red"
        latido = {"v": L.VERSION, "nodo": self.yo, "medio": medio, "modo": self.modo, "puntos": puntos, "ts": t,
                  "version": L.VERSION, "secreto": bool(self.secreto), "salud": self._salud_publica(salud)}

        vivos: Dict[str, Dict[str, Any]] = {}
        nov: Dict[str, Any] = {"latidos": [], "reclamos": [], "bajas": [], "ordenes": [], "asignaciones": []}
        decision = {"lider": self.yo, "termino": int(self.mem.get("termino") or 0), "reclamar": False,
                    "motivo": "sin red: este nodo se dirige a sí mismo"}
        ordenes: List[Dict[str, Any]] = []
        if enlace is not None and enlace.modo == "puerta":
            res = enlace.latir_puerta(latido, puntos)
            if res is None:
                # La puerta no respondió: esta vuelta (y las siguientes, hasta que vuelva) por el bus.
                # Se vuelve a probar en 5 min (una llave sin dar de alta da 403 y no debe rebotar cada vuelta).
                self.mem["puerta_motivo"] = "la puerta de datos no respondió; sigo por el bus"
                self.mem["puerta_reintento"] = t + PUERTA_REINTENTO_S
                enlace = self.enlace = B.EnlaceBus(enlace.rest, self.yo)  # relee su ventana entera
                informe["enlace"] = "bus (la puerta no respondió)"
            else:
                self.mem["ultimo_latido"] = t
                arr = enlace.arriendo or {}
                decision = {"lider": arr.get("lider"), "termino": int(arr.get("termino") or 0), "reclamar": False,
                            "motivo": "arriendo en la puerta de datos"}
                for n in enlace.nodos:
                    if L.id_valido(n.get("nodo")):
                        vivos[n["nodo"]] = dict(n.get("datos") or {}, nodo=n["nodo"], ts=float(n.get("ts") or t))
                vivos.setdefault(self.yo, latido)
                if arr.get("lider"):
                    latido.update(lider_visto=arr.get("lider"), termino_visto=int(arr.get("termino") or 0),
                                  puntos_lider=int(arr.get("puntos") or 0))
                enlace.espejo(latido, t)
                ordenes = enlace.ordenes_de_puerta() + enlace.ordenes_del_bus(t)
                nov["asignaciones"] = list(enlace.asignaciones)
        if enlace is not None and enlace.modo == "bus":
            nov = enlace.novedades(t)
            vivos = L.nodos_vivos(nov["latidos"], nov["bajas"], t)
            vivos[self.yo] = dict(latido, desde=float((vivos.get(self.yo) or {}).get("desde") or t))
            decision = L.elegir_lider(self.yo, puntos, vivos, nov["reclamos"], nov["latidos"], t)
            if decision["reclamar"]:
                enlace.reclamar(decision["termino"], puntos, decision["motivo"], t)
            # En el latido va el líder RECLAMADO (o el mío si lo reclamo ahora), nunca una propuesta.
            visto, term_visto = (self.yo, decision["termino"]) if decision["reclamar"] else (
                decision.get("vigente"), decision.get("termino_vigente"))
            if visto:
                latido.update(lider_visto=visto, termino_visto=term_visto,
                              puntos_lider=int((vivos.get(visto) or {}).get("puntos") or 0))
            if decision["reclamar"] or t - float(self.mem.get("ultimo_latido") or 0) >= L.LATIDO_S - 30:
                if enlace.latir(latido):
                    self.mem["ultimo_latido"] = t
            ordenes = nov["ordenes"]
        elif enlace is not None and enlace.modo == "tablas":
            estable = t - float(self.mem.get("desde") or t) >= L.ESTABLE_S
            res = enlace.latir(latido, puntos, estable)
            if res is not None:
                self.mem["ultimo_latido"] = t
                arr = enlace.arriendo or {}
                decision = {"lider": arr.get("lider"), "termino": int(arr.get("termino") or 0), "reclamar": False,
                            "motivo": "arriendo en la base"}
                for n in enlace.nodos:
                    if L.id_valido(n.get("nodo")):
                        vivos[n["nodo"]] = dict(n.get("datos") or {}, nodo=n["nodo"], ts=float(n.get("ts") or t))
                ordenes = enlace.ordenes_de_tabla()
            vivos.setdefault(self.yo, latido)
        elif enlace is None or enlace.modo != "puerta":
            vivos[self.yo] = latido
        self.mem.setdefault("desde", t)
        self._asignaciones = nov.get("asignaciones") or []
        # (COL1012H) Al arrancar o al volver: lo que otro siguió mientras no estaba deja de ser
        # mío. Se suelta DESPUÉS de mandar el último punto (la sucesora puede combinarlo).
        if volviendo:
            self._volver(medida["raiz"], salud, nov, informe, t, ultimo_previo)
        if enlace is not None and enlace.error:
            informe["avisos"].append(enlace.error)

        soy_lider = decision["lider"] == self.yo
        if soy_lider and decision["termino"] != self.mem.get("termino_lider"):
            self.mem["termino_lider"] = decision["termino"]
            self._decir("MetaGenesis: este nodo (%s, %s) dirige ahora (término %d): %s" % (
                self.yo, L.MEDIOS.get(medio, {}).get("etiqueta", medio), decision["termino"], decision["motivo"]))
        self.mem["termino"] = decision["termino"]
        informe.update(lider=decision["lider"], termino=decision["termino"], soy_lider=soy_lider,
                       motivo_lider=decision["motivo"], vivos=sorted(vivos))
        if any((l.get("salud") or {}).get("autoritativo") for l in vivos.values()):
            self.mem["ultimo_autoritativo_ts"] = t

        # (2026-10-20, CAP1020A) UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA: antes de repartir,
        # se marca `fin` en los préstamos cuya cola el medio ya terminó, para que sus ids
        # vuelven a estar disponibles.
        self._cerrar_prestamos_terminados(t, vivos)

        # 3. Autocuración propia (líder o no).
        for a in L.autocurar(salud, self.mem, t):
            self._hacer(a, medio, medida["raiz"], informe, publicar=False)

        # 4. El líder decide por todos.
        if soy_lider:
            # El líder se ve a sí mismo con su salud COMPLETA (la del latido va recortada para el bus).
            nodos_plan = dict(vivos)
            nodos_plan[self.yo] = dict(vivos.get(self.yo) or latido, salud=salud)
            mundo = {"nodos": nodos_plan, "yo": self.yo, "autonomia": bool(self.mem.get("autonomia", True)),
                     "asignaciones": nov.get("asignaciones") or [],
                     "ultimo_autoritativo_ts": self.mem.get("ultimo_autoritativo_ts")}
            # COL1012G · relevo sin pérdidas: las tareas a medias de un aparato que se fue siguen en otro.
            self._relevar(nov, vivos, medida["raiz"], informe, t)
            # (MGB1021Ab) La misma pasada que repara una puerta en rojo cierra las reparaciones de
            # una puerta que YA volvió a verde: antes se reintentaban hasta quedarse «sin salida».
            if salud.get("autoritativo"):
                self._cerrar_reparaciones(medida["raiz"], (salud.get("resultados") or {}).get("publicacion") or {},
                                          informe, t)
            sin_aut = not any((l.get("salud") or {}).get("autoritativo") for l in vivos.values())
            if sin_aut and enlace is not None and t - float(self.mem.get("ultimo_autoritativo_ts") or t) >= L.RELEVO_MEDIO_S:
                mundo["colas_portables"] = enlace.ultimas_colas()
            for a in L.planificar(mundo, self.mem, t):
                if a["accion"] == "avisar":
                    self._avisar(a, informe, t)
                elif a["accion"] == "repartir" and a["nodo"] == self.yo:
                    self._reparto(a, medida["raiz"], informe, t)
                elif a["accion"] == "reparar_publicacion" and a["nodo"] == self.yo:
                    self._reparar_publicacion(a, salud, medida["raiz"], informe, t)
                elif a["nodo"] == self.yo:
                    self._hacer(a, medio, medida["raiz"], informe, publicar=True)
                else:
                    self._repartir(a, informe, t)
            if enlace is not None:
                self._publicar_foto(vivos, decision["termino"], salud, t, informe)
        # Las colas portables las publica quien las tiene en su disco, dirija o no, y solo si hay
        # otro medio REAL que podría seguirlas (si no, serían ~60 KB al bus para nadie).
        relevo_posible = any(n != self.yo and l.get("modo") == "real" and (l.get("salud") or {}).get("orquestador")
                             for n, l in vivos.items())
        if salud.get("autoritativo") and enlace is not None and not self.sin_red and relevo_posible:
            self._publicar_colas(medida["raiz"], t, informe)
        elif salud.get("autoritativo"):
            informe["colas"] = "no hacen falta (ningún otro medio real que pueda seguirlas)"

        # 5. Órdenes para este nodo.
        for o in ordenes:
            self._orden(o, medio, medida["raiz"], soy_lider, informe, t)

        self.mem["nonces"] = L.podar_nonces(self.mem.get("nonces") or {}, t)
        self.mem["decisiones"] = (self.mem.get("decisiones") or [])[-DECISIONES_MAX:]
        if enlace is not None:
            informe["peticiones"] = enlace.rest.peticiones - antes
            if enlace.modo == "puerta":
                informe["peticiones_puerta"] = enlace.peticiones_puerta
        if self.persistir:
            guardar(MEMORIA, self.mem)
            guardar(ESTADO, dict(informe, salud=self._salud_publica(salud), tablas_motivo=self.mem.get("tablas_motivo")))
        return informe

    # ── piezas ──
    def _relojes(self, salud: Dict[str, Any], t: float) -> None:
        """Desde cuándo hay trabajo listo sin orquestador y desde cuándo no hay nada que hacer."""
        trabajo = salud.get("trabajo") or {}
        orqs = salud.get("orquestadores") or []
        listas = trabajo.get("listas") or 0
        en_curso = trabajo.get("en_curso") or 0
        if salud.get("autoritativo") and listas > 0 and not orqs:
            self.mem["sin_orquestador_desde"] = self.mem.get("sin_orquestador_desde") or t
        else:
            self.mem.pop("sin_orquestador_desde", None)
        if salud.get("autoritativo") and listas == 0 and en_curso == 0 and not orqs and trabajo.get("listas") is not None:
            self.mem["tranquilo_desde"] = self.mem.get("tranquilo_desde") or t
        else:
            self.mem.pop("tranquilo_desde", None)
        salud["sin_orquestador_desde"] = self.mem.get("sin_orquestador_desde")
        salud["tranquilo_desde"] = self.mem.get("tranquilo_desde")
        # (OPA1011b) Desde cuándo la autopublicación está en la MISMA situación (fase + motivo).
        pub = (salud.get("resultados") or {}).get("publicacion")
        if isinstance(pub, dict):
            firma = L.firma_publicacion(pub)
            if firma != self.mem.get("pub_firma"):
                self.mem["pub_firma"], self.mem["pub_desde"] = firma, t
            pub["desde"] = self.mem.get("pub_desde")

    @staticmethod
    def _salud_publica(salud: Dict[str, Any]) -> Dict[str, Any]:
        """Lo que viaja en el latido: sin rutas, sin medidores largos, sin nada privado."""
        fuera = {"medidores", "resultados"}
        pub = {k: v for k, v in salud.items() if k not in fuera}
        pub["orquestadores"] = [{"cola": o.get("cola")} for o in salud.get("orquestadores") or []][:6]
        r = salud.get("resultados")
        if isinstance(r, dict):
            # Cifras e ids, nunca la salida de una puerta (puede nombrar rutas del disco).
            p = r.get("publicacion") or {}
            pub["resultados"] = {
                "n_fallidas": r.get("n_fallidas"), "fallidas": (r.get("fallidas") or [])[:6],
                "n_visto_bueno": r.get("n_visto_bueno"), "visto_bueno": (r.get("visto_bueno") or [])[:6],
                "integradas_2h": r.get("integradas_2h"),
                "publicacion": {k: p.get(k) for k in ("activa", "fase", "sin_publicar", "desde")} if p else None,
            }
            if p:
                pub["resultados"]["publicacion"]["detalle"] = L.motivo_publicacion(p.get("detalle"))[:120]
        return json.loads(L.tachar(json.dumps(pub, ensure_ascii=False)))

    # ── al volver (COL1012H) ──
    def _colas_de_su_orquestador(self, salud: Dict[str, Any]) -> List[str]:
        """Las colas vivas de ESTE aparato, para saber a qué `control-<cola>.json` va cada soltar.

        Se prefiere lo que ya midió el latido (una `ps` menos); si falta, se pregunta al medio."""
        colas: List[str] = []
        for o in salud.get("orquestadores") or []:
            c = str(o.get("cola") if isinstance(o, dict) else o or "").strip()
            if c:
                colas.append(c if c.endswith(".json") else c + ".json")
        if not colas:
            try:
                colas = [c if c.endswith(".json") else c + ".json" for c in M.colas_vivas()]
            except Exception:  # noqa: BLE001 — sin `ps` no se inventa trabajo
                colas = []
        return list(dict.fromkeys(colas))

    def _volver(self, raiz: str, salud: Dict[str, Any], nov: Dict[str, Any],
                informe: Dict[str, Any], t: float, ultimo_latido: Any) -> None:
        """Suelta las tareas que otro siguió mientras el aparato no latía (contrato §3).

        Primero manda el último punto de control (la sucesora puede combinarlo) y solo después
        escribe `soltar`: si se soltara antes, el orquestador podría cortar el agente antes de
        que el punto saliera del aparato y la sucesora empezaría de cero."""
        if self.modo != "real":
            return
        if isinstance(nov, dict) and ("asignaciones" in nov or "latidos" in nov):
            asignadas = (entradas_de_relevo(nov, {}) or {}).get("asignadas") or {}
        else:  # ya viene expandido por tarea: {tid: {a, t}}
            asignadas = nov if isinstance(nov, dict) else {}
        soltadas: List[str] = []
        seguidas: List[str] = []
        puntos_ok = False
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        for cola in self._colas_de_su_orquestador(salud):
            try:
                en_curso = M.en_curso_de(raiz, cola) or []
            except Exception:  # noqa: BLE001 — un latidos- roto no puede tumbar la vuelta
                continue
            ids = [str(e.get("id")) for e in en_curso if isinstance(e, dict) and e.get("id")]
            if not ids:
                continue
            soltar, seguir = C.al_volver(self.yo, ids, asignadas, ultimo_latido)
            seguidas.extend(seguir)
            if not soltar:
                continue
            enviado = enviar_puntos_al_a1(raiz, soltar, t, self._enviar_puntos)
            puntos_ok = puntos_ok or enviado
            hechos = soltar_en_control(olas, cola, soltar, t)
            soltadas.extend(hechos)
            if len(hechos) < len(soltar):
                informe.setdefault("avisos", []).append(
                    "al volver: no pude soltar %d tarea(s) en %s" % (len(soltar) - len(hechos), cola))
        informe["al_volver"] = {"soltar": soltadas, "seguir": seguidas, "puntos": puntos_ok}

    # ── relevo sin pérdidas (COL1012G) ──
    def _tareas_para_relevo(self, raiz: str, t: float, necesarias: List[str]) -> Dict[str, Dict[str, Any]]:
        """La tarea ORIGINAL (prompt, archivos, si es privada) de lo que dejó a medias un aparato.

        Se busca en las colas de este disco (el medio autoritativo) y en las colas portables que el
        aparato publicó en el bus antes de irse (`mg_colas`); sin prompt no se puede crear una sucesora
        útil. La lectura del bus se cachea 10 min: el líder no gasta una petición por vuelta."""
        tareas: Dict[str, Dict[str, Any]] = {}
        if not necesarias:
            return tareas
        try:
            for x in self._candidatos(raiz) or []:
                if isinstance(x, dict) and x.get("id"):
                    tareas[str(x["id"])] = x
        except Exception:  # noqa: BLE001 — sin colas locales se sigue con las portables del bus
            pass
        cache = self.mem.get("relevo_colas") if isinstance(self.mem.get("relevo_colas"), dict) else {}
        portables = cache.get("tareas") if t - _segundos(cache.get("t")) < 600 else None
        if portables is None and self.enlace is not None:
            try:
                portables = self.enlace.ultimas_colas() or []
                self.mem["relevo_colas"] = {"t": t, "tareas": portables[:40]}
            except Exception:  # noqa: BLE001 — el relevo no puede tumbar la vuelta del líder
                portables = []
        for x in portables or []:
            if isinstance(x, dict) and x.get("id"):
                tareas.setdefault(str(x["id"]), x)
        return tareas

    def _prestar_relevo(self, tid: str, destino: str, tarea: Dict[str, Any], motivo: str,
                        informe: Dict[str, Any], t: float) -> bool:
        """Presta la tarea por el mismo camino que `repartir`: cola + `lanzar_cola` firmada.

        `tarea_limpia` no conoce `rama_nube` (la rama del punto de control): sin ella el destino no
        sabría de dónde seguir, así que se devuelve al viaje después de limpiar lo demás. Devuelve si
        la orden salió de verdad: si no, la tarea NO se marca como seguida y se reintenta."""
        limpia = L.tarea_limpia(tarea)
        if tarea.get("rama_nube"):
            limpia["rama_nube"] = tarea["rama_nube"]
        cola = "cola-relevo-%s-%s-%s" % (destino.split("-")[0], tid,
                                         time.strftime("%m%d-%H%M", time.localtime(t)))
        antes = len(informe.get("acciones") or [])
        self._repartir(L.accion("relevo:%s" % tid, "lanzar_cola", destino, motivo,
                                args={"cola": cola, "trabajadores": 2, "_tareas": [limpia]}, espera_s=0),
                       informe, t)
        acciones = informe.get("acciones") or []
        resultado = str((acciones[antes] if len(acciones) > antes else {}).get("resultado") or "")
        return resultado.startswith("pedido a ")

    def _asignar_original(self, tid: str, destino: str, t: float) -> None:
        """Deja constancia de que la tarea ORIGINAL ya se siguió: `plan_relevo` no la repite."""
        self.mem.setdefault("relevo", {})[tid] = t
        if self.modo == "real" and self.enlace is not None:
            try:
                self.enlace.asignar([tid], destino, t)
            except Exception:  # noqa: BLE001 — la orden ya salió; se reintenta cuando caduque
                pass

    def _anotar_relevo(self, r: Dict[str, Any], minutos: Optional[int], resultado: str,
                       informe: Dict[str, Any], t: float) -> None:
        """Una decisión POR TAREA en `mg_decision`: de dónde salió, a dónde va, qué se perdió y por qué.

        La firma evita repetir el mismo aviso cada vuelta cuando solo está «esperando»; si cambia el
        destino o el motivo, sí se anota. El texto lleva los cuatro datos aunque el bus guarde solo
        `nodo`/`motivo` en sus columnas fijas."""
        de, a, tid = str(r.get("de") or ""), r.get("a"), str(r.get("id") or "")
        motivo = str(r.get("motivo") or r.get("espera") or "")
        firma = "|".join((de, str(a or "espera"), tid, resultado, motivo))
        vistas = self.mem.get("relevo_visto") if isinstance(self.mem.get("relevo_visto"), dict) else {}
        if vistas.get(tid) == firma:
            return
        vistas[tid] = firma
        self.mem["relevo_visto"] = dict(list(vistas.items())[-50:])
        decision = {"ts": t, "accion": "relevo", "nodo": a or "espera", "de": de, "a": a, "id": tid,
                    "minutos_perdidos": minutos, "resultado": resultado, "seco": self.modo == "seco",
                    "termino": self.mem.get("termino"),
                    "motivo": "de %s a %s · %s min perdidos · %s" % (
                        de or "—", a or "espera", "—" if minutos is None else minutos, motivo)[:200]}
        informe.setdefault("relevo", []).append(decision)
        if self.modo == "real" and self.enlace is not None:
            self.enlace.decision(decision)

    def _relevar(self, nov: Dict[str, Any], vivos: Dict[str, Dict[str, Any]], raiz: str,
                 informe: Dict[str, Any], t: float) -> None:
        """El líder sigue las tareas a medias de un aparato que se fue (contrato §3, `plan_relevo`)."""
        datos = entradas_de_relevo(nov, vivos)
        perdidos = C.nodos_perdidos(datos["latidos"], datos["bajas"], t)
        necesarias = [str(e.get("id")) for n in perdidos
                      for e in (datos["latidos"].get(n) or {}).get("en_curso") or []
                      if isinstance(e, dict) and e.get("id")]
        if not necesarias:
            return
        tareas = self._tareas_para_relevo(raiz, t, necesarias)
        # Sin metadatos no se puede saber si es privada: se le prohíbe la nube compartida.
        para_plan = dict(tareas)
        for tid in necesarias:
            para_plan.setdefault(tid, {"id": tid, "privado": True})
        hechas = {k: v for k, v in (self.mem.get("relevo") or {}).items()
                  if t - _segundos(v) < L.GRACIA_ASIGNACION_S}
        self.mem["relevo"] = hechas
        asignadas = dict(datos["asignadas"])
        for tid, ts in hechas.items():
            if ts >= _segundos((asignadas.get(tid) or {}).get("t")):
                asignadas[tid] = {"a": "relevo", "t": ts}
        plan = C.plan_relevo(datos["latidos"], datos["bajas"], asignadas, datos["nodos"],
                             datos["ocupados"], para_plan, t)
        conocidos = set(para_plan) | set(asignadas) | {
            str(e.get("id")) for l in datos["latidos"].values()
            for e in l.get("en_curso") or [] if isinstance(e, dict) and e.get("id")}
        for r in plan:
            tid = str(r.get("id") or "")
            if not tid or tid in hechas:
                continue
            punto = r.get("punto") if isinstance(r.get("punto"), dict) else None
            perdida = r.get("perdida_s")
            minutos = (int(_segundos(perdida) // 60) if perdida is not None
                       else int((t - _segundos((punto or {}).get("t"))) // 60) if (punto or {}).get("t") else None)
            original = tareas.get(tid) or {}
            destino = r.get("a")
            if not destino:
                self._anotar_relevo(r, minutos, "espera en el A1; se reintenta cada vuelta", informe, t)
                continue
            if not original:
                self._anotar_relevo(r, minutos, "sin la tarea original no se puede prestar", informe, t)
                continue
            if punto:
                rama = str(punto.get("rama") or "relevo/%s/%s" % (r.get("de"), tid))
                sha = punto.get("sha")
                shas = [str(x) for x in sha] if isinstance(sha, list) else ([str(sha)] if sha else [])
                nuevo = T.siguiente_id(tid, sorted(conocidos))
                conocidos.add(nuevo)
                sucesora = T.tarea_reparacion(original, nuevo, rama, shas,
                                              [str(a) for a in original.get("archivos") or []],
                                              str(r.get("motivo") or "el aparato dejó la tarea a medias"))
                if self._prestar_relevo(tid, destino, sucesora,
                                        "relevo de %s (%s)" % (tid, r.get("motivo") or ""), informe, t):
                    self._asignar_original(tid, destino, t)
                    self._anotar_relevo(r, minutos, "sigue como %s desde %s" % (nuevo, rama), informe, t)
                else:
                    self._anotar_relevo(r, minutos, "no salió la orden; se reintenta", informe, t)
            else:
                # Sin punto de control no hay trabajo que continuar: la tarea vuelve a la cola tal cual.
                if self._prestar_relevo(tid, destino, original,
                                        "relevo sin punto de %s: vuelve a la cola" % tid, informe, t):
                    self._asignar_original(tid, destino, t)
                    self._anotar_relevo(r, minutos, "vuelve a la cola tal cual (sin punto de control)",
                                        informe, t)
                else:
                    self._anotar_relevo(r, minutos, "no salió la orden; se reintenta", informe, t)

    def _hacer(self, a: Dict[str, Any], medio: str, raiz: str, informe: Dict[str, Any], publicar: bool) -> None:
        estado, texto = self._ejecutar(a, medio, raiz, self.modo == "seco", self._rescatador(raiz))
        t = self.reloj()
        self.mem.setdefault("hecho", {})[a["clave"]] = t
        tareas = (a.get("args") or {}).get("_tareas")
        if a["accion"] == "lanzar_cola" and tareas and estado in ("hecha", "en_marcha") and self.enlace is not None:
            # Constancia de que esas tareas siguen en ESTE medio: la Mac, al volver, no las repite.
            self.enlace.asignar([str(x.get("id")) for x in tareas if x.get("id")], self.yo, t)
        d = {"ts": t, "accion": a["accion"], "nodo": a["nodo"], "motivo": L.tachar(a["motivo"])[:200],
             "resultado": "%s: %s" % (estado, L.tachar(texto)[:160]), "seco": self.modo == "seco",
             "termino": self.mem.get("termino")}
        self.mem.setdefault("decisiones", []).append(d)
        informe["acciones"].append(d)
        if publicar and self.enlace is not None:
            self.enlace.decision(d)
        if estado in ("hecha", "en_marcha", "fallo") and self.modo == "real":
            self._decir("MetaGenesis · %s en %s: %s → %s" % (a["accion"], a["nodo"], a["motivo"], texto))

    def _repartir(self, a: Dict[str, Any], informe: Dict[str, Any], t: float) -> None:
        """El líder manda una acción a OTRO nodo: orden firmada (bus) o de la tabla (tablas)."""
        self.mem.setdefault("hecho", {})[a["clave"]] = t
        args = dict(a.get("args") or {})
        tareas = args.pop("_tareas", None)
        d = {"ts": t, "accion": a["accion"], "nodo": a["nodo"], "motivo": L.tachar(a["motivo"])[:200],
             "seco": self.modo == "seco", "termino": self.mem.get("termino")}
        if self.modo == "seco":
            d["resultado"] = "seca: se lo pediría a %s" % a["nodo"]
        elif self.enlace is None or self.enlace.modo not in ("bus", "puerta") or not self.secreto:
            d["resultado"] = "no puedo pedírselo: %s" % ("sin secreto para firmar" if not self.secreto else "modo tablas: va por la bitácora")
            if self.enlace is not None and self.enlace.modo == "tablas":
                self.enlace.decision(d)
        else:
            if tareas:
                # Las tareas viajan junto a la orden y su huella va DENTRO de lo firmado.
                args["tareas_sha"] = L.huella_tareas(tareas)
            o = {"v": L.VERSION, "accion": a["accion"], "para": a["nodo"], "t": B.iso(t),
                 "nonce": secrets.token_urlsafe(12), "por": "lider:" + self.yo, "args": args}
            o["firma"] = L.firmar(o, self.secreto)
            if tareas:
                o["tareas"] = tareas
                self.enlace.asignar([str(x.get("id")) for x in tareas if x.get("id")], a["nodo"], t)
            ok = self.enlace.orden(o)
            d["resultado"] = ("pedido a %s" % a["nodo"]) if ok else "no pude publicar la orden"
        self.mem.setdefault("decisiones", []).append(d)
        informe["acciones"].append(d)
        if self.enlace is not None and self.modo == "real":
            self.enlace.decision(d)

    def _orden(self, o: Dict[str, Any], medio: str, raiz: str, soy_lider: bool, informe: Dict[str, Any], t: float) -> None:
        if not isinstance(o, dict) or not L.es_para_mi(o, self.yo, medio, soy_lider):
            return
        nonce = o.get("nonce")
        if nonce in (self.mem.get("nonces") or {}):
            return
        firmada = self.enlace is not None and (self.enlace.modo == "bus" or (
            self.enlace.modo == "puerta" and self.enlace.exige_firma(o)))
        ok, motivo = L.validar_orden(o, self.secreto, t, self.mem.get("nonces") or {}, firmada=firmada)
        if isinstance(nonce, str) and L._RE_NONCE.match(nonce):
            self.mem.setdefault("nonces", {})[nonce] = t
        r = {"accion": o.get("accion"), "nonce": nonce, "por": str(o.get("por") or "")[:40]}
        if ok and (o.get("tareas") is not None or (o.get("args") or {}).get("tareas_sha")) \
                and L.huella_tareas(o.get("tareas")) != (o.get("args") or {}).get("tareas_sha"):
            ok, motivo = False, "las tareas no coinciden con su huella firmada"
        if not ok:
            r.update(estado="rechazada", resultado=motivo)
        elif o["accion"] in ("pausar", "reanudar"):
            if self.modo == "seco":
                r.update(estado="seca", resultado="modo seco: no cambio la autonomía")
            else:
                self.mem["autonomia"] = o["accion"] == "reanudar"
                r.update(estado="hecha", resultado="autonomía %s" % ("en marcha" if self.mem["autonomia"] else "en pausa"))
        elif o["accion"] == "ceder":
            if self.modo == "seco":
                r.update(estado="seca", resultado="modo seco: no cedo")
            else:
                self.mem["no_liderar_hasta"] = t + 1800
                if self.enlace is not None and self.enlace.modo in ("tablas", "puerta"):
                    self.enlace.ceder()
                r.update(estado="hecha", resultado="cedo el mando 30 min")
        elif o["accion"] == "repartir":
            a = {"clave": "orden:%s" % nonce, "accion": "repartir", "nodo": self.yo, "motivo": "orden de %s" % r["por"],
                 "args": dict(o.get("args") or {}), "espera_s": 0}
            if not (self._medida_salud or {}).get("autoritativo"):
                r.update(estado="nada", resultado="este medio no tiene las colas en su disco")
            else:
                d = self._reparto(a, raiz, informe, t)
                r.update(estado="seca" if self.modo == "seco" else ("hecha" if d.get("ids") else "nada"),
                         resultado=d.get("resultado", ""))
        else:
            args = dict(o.get("args") or {})
            if isinstance(o.get("tareas"), list):
                args["_tareas"] = [x for x in o["tareas"] if isinstance(x, dict) and x.get("id")][:20]
            # «continuar» en un medio sin colas propias = revivir sus servicios (lo demás lo hace el líder).
            que = "reactivar" if o["accion"] == "continuar" and medio != "mac" else o["accion"]
            a = {"clave": "orden:%s" % nonce, "accion": que, "nodo": self.yo, "motivo": "orden de %s" % r["por"],
                 "args": args, "espera_s": 0}
            estado, texto = self._ejecutar(a, medio, raiz, self.modo == "seco", self._rescatador(raiz))
            r.update(estado=estado, resultado=texto)
        informe["ordenes"].append(r)
        if self.enlace is not None:
            self.enlace.resultado(o, r["estado"], r["resultado"], t)

    # ── resultados (OPA1011b) ──
    def _registrar(self, d: Dict[str, Any], informe: Dict[str, Any]) -> None:
        self.mem.setdefault("decisiones", []).append(d)
        informe["acciones"].append(d)
        if self.enlace is not None and self.modo == "real":
            self.enlace.decision(d)

    def _avisar(self, a: Dict[str, Any], informe: Dict[str, Any], t: float) -> None:
        """Un aviso a la dirección (Chat Director), una vez por motivo y enfriamiento."""
        self.mem.setdefault("hecho", {})[a["clave"]] = t
        texto = str((a.get("args") or {}).get("texto") or a.get("motivo") or "")
        if self.modo == "real":
            self._decir(texto)
        self._registrar({"ts": t, "accion": "avisar", "nodo": a["nodo"], "motivo": L.tachar(a["motivo"])[:200],
                         "resultado": ("seca: lo diría" if self.modo == "seco" else "dicho en el Chat Director"),
                         "seco": self.modo == "seco", "termino": self.mem.get("termino")}, informe)

    def _prestadas(self, t: float) -> set:
        """Ids que están «prestados» a otro medio y NO se pueden repartir otra vez.

        (2026-10-20, CAP1020A) UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA: un préstamo con `fin`
        (su cola ya terminó) deja de reservar sus ids, que vuelven al reparto."""
        vigentes = L.ids_asignados_vigentes(self._asignaciones, t)
        import repartir_nube as RN  # noqa: WPS433 — la misma regla del reparto a la nube

        for p in self.mem.get("prestamos") or []:
            if RN.prestamo_vigente(p, t, L.GRACIA_ASIGNACION_S):
                vigentes.update(str(i) for i in p.get("ids") or [])
        return vigentes

    def _colas_terminadas(self, vivos: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """{cola: fin} de las colas que el A1 (u otro medio) ya terminó.

        (2026-10-20, CAP1020A) Primero, el estado que dejó `oracle_nodo.estado()` en la Mac
        (`~/.starseed/oracle.json`); después, el latido del propio medio y los de los demás."""
        import repartir_nube as RN  # noqa: WPS433 — puro, sin efectos colaterales

        salida: Dict[str, float] = {}
        candidatos = [M.leer_json(ESTADO_ORACLE, {}), (self._medida_salud or {}).get("a1") or {}]
        for latido in (vivos or {}).values():
            candidatos.append(((latido or {}).get("salud") or {}).get("a1") or {})
        for datos in candidatos:
            par = cola_terminada(datos)
            if par:
                salida[RN.nombre_cola(par[0])] = par[1]
        return salida

    def _cerrar_prestamos_terminados(self, t: float, vivos: Optional[Dict[str, Any]] = None) -> List[str]:
        """Marca `fin` en los préstamos cuya cola ya terminó (CAP1020A). Devuelve las colas marcadas.

        (2026-10-20, CAP1020A, medido) El A1 terminó su cola `cola-mg-oracle-1020-1223` a las 19:24
        UTC y se quedó parado, mientras 10 de las 25 tareas listas seguían «prestadas» a él durante
        6 h: ni la Mac, ni la nube, ni el propio A1 podían cogerlas. Ahora el préstamo se marca con
        su `fin` y sus ids vuelven al reparto. Los préstamos NO se borran: los medidores de
        resultados los necesitan."""
        prestamos = self.mem.get("prestamos") or []
        if not prestamos:
            return []
        terminadas = self._colas_terminadas(vivos)
        if not terminadas:
            return []
        import repartir_nube as RN  # noqa: WPS433 — puro, sin efectos colaterales

        marcados = []
        for p in prestamos:
            if not isinstance(p, dict) or p.get("fin"):
                continue
            cola = RN.nombre_cola(p.get("cola"))
            if cola and cola in terminadas:
                p["fin"] = terminadas[cola]
                marcados.append(str(p.get("cola")))
        return marcados

    def _prestar(self, tareas: List[Dict[str, Any]], destino: str, motivo: str, informe: Dict[str, Any],
                 t: float, trabajadores: int = 2) -> None:
        """Manda `tareas` a `destino` como cola firmada (el mismo camino que el relevo de medio) y lo apunta.
        `trabajadores` (CAP1025E): los que el medio dice que lleva; 2 si no lo dice.

        (2026-10-26, CAP1026I) Solo se apunta el préstamo si la orden SALIÓ («pedido a …»), como el relevo.
        MEDIDO a las 12:36 (hora de la Mac): con el enlace en «tablas» la orden no puede salir («va por la
        bitácora») y aun así se apuntaba: seis tareas reservadas 6 h (GRACIA_ASIGNACION_S) para un A1 que
        nunca las recibió y se quedó en «espera». Devuelve si salió."""
        cola = "cola-mg-%s-%s" % (destino.split("-")[0], time.strftime("%m%d-%H%M", time.localtime(t)))
        limpias = [L.tarea_limpia(x) for x in tareas]
        trabajadores = trabajadores if isinstance(trabajadores, int) and 1 <= trabajadores <= 4 else 2
        antes = len(informe.get("acciones") or [])
        self._repartir(L.accion("prestar:%s" % destino, "lanzar_cola", destino, motivo,
                                args={"cola": cola, "trabajadores": trabajadores, "_tareas": limpias}, espera_s=0),
                       informe, t)
        acciones = informe.get("acciones") or []
        salio = str((acciones[antes] if len(acciones) > antes else {}).get("resultado") or "").startswith("pedido a ")
        if self.modo == "real" and salio:
            self.mem.setdefault("prestamos", []).append(
                {"ids": [x["id"] for x in limpias], "destino": destino, "cola": cola, "ts": t})
            # (2026-10-20, CAP1020A) Se podan los préstamos viejos; los que ya terminó su cola
            # conservan su `fin` (los medidores de resultados los siguen contando).
            self.mem["prestamos"] = podar_prestamos(self.mem["prestamos"], t)
        return salio

    def _reparto(self, a: Dict[str, Any], raiz: str, informe: Dict[str, Any], t: float) -> Dict[str, Any]:
        """La Mac (medio con las colas) presta a un medio ocioso las listas del FINAL de su orden."""
        self.mem.setdefault("hecho", {})[a["clave"]] = t
        args = a.get("args") or {}
        destino = str(args.get("destino") or "")
        tope = int(args.get("tope") or L.REPARTO_TOPE)
        try:
            cands = self._candidatos(raiz)
        except Exception as e:  # noqa: BLE001
            cands, error = [], type(e).__name__
        else:
            error = ""
        elegidas = L.elegir_reparto(cands, self._prestadas(t), tope)
        if not elegidas or not L.id_valido(destino):
            d = {"ts": t, "accion": "repartir", "nodo": destino or a["nodo"], "motivo": L.tachar(a["motivo"])[:200],
                 "resultado": "nada: %s" % (error or "ninguna lista se puede prestar (≤ 3 archivos, sin visto "
                                                     "bueno ni nada solo de la Mac)"),
                 "seco": self.modo == "seco", "termino": self.mem.get("termino"), "ids": []}
            self._registrar(d, informe)
            return d
        ids = [str(x["id"]) for x in elegidas]
        salio = self._prestar(elegidas, destino, "le presto %s · %s" % (", ".join(ids), a["motivo"]), informe, t,
                              trabajadores=int(args.get("trabajadores") or 2))
        if self.modo == "real" and not salio:
            return {"resultado": "no salió el préstamo a %s (sin orden firmada por este enlace): %s siguen libres"
                                 % (destino, ", ".join(ids)), "ids": []}
        return {"resultado": "prestadas a %s: %s" % (destino, ", ".join(ids)), "ids": ids}

    def _reparar_publicacion(self, a: Dict[str, Any], salud: Dict[str, Any], raiz: str, informe: Dict[str, Any],
                             t: float) -> None:
        """Una puerta de publicación en rojo → tarea de reparación con su salida exacta: al medio ocioso
        si lo hay, si no delante en la tanda de la Mac. Sin archivos que nombrar → aviso."""
        self.mem.setdefault("hecho", {})[a["clave"]] = t
        pub = (salud.get("resultados") or {}).get("publicacion") or {}
        rutas = L.rutas_de_evidencia((pub.get("evidencia") or {}).get("texto"), tope=6)
        archivos = self._existentes(raiz, rutas)[:3]
        tarea = L.tarea_de_reparacion(pub, archivos, t)
        if tarea is None:
            self._avisar(dict(a, accion="avisar", clave=a["clave"] + ":aviso",
                              args={"texto": L.texto_aviso_publicacion(pub, L._min(t - float(pub.get("desde") or t)))}),
                         informe, t)
            return
        destino = str((a.get("args") or {}).get("destino") or "")
        if self.modo == "seco":
            resultado = "seca: enlistaría %s (%s)%s" % (tarea["id"], ", ".join(archivos),
                                                         (" y se la prestaría a %s" % destino) if destino else
                                                         " delante en la tanda de la Mac")
        else:
            estado, texto = self._enlistar(raiz, tarea, not destino, t)
            resultado = "%s: %s" % (estado, texto)
            if estado == "hecha":
                self._decir("MetaGenesis · la autopublicación llevaba más de %d min frenada (%s). He creado la tarea %s "
                            "para arreglar la causa en %s%s; cuando se integre, la autopublicación lo reintenta sola." % (
                                L.PUBLICACION_ROJA_S // 60, L.motivo_publicacion(pub.get("detalle"))[:90], tarea["id"],
                                ", ".join(archivos), (" y la trabaja %s" % destino) if destino else " (va la primera de la tanda)"))
                if destino:
                    self._prestar([tarea], destino, "reparar la publicación: %s" % tarea["id"], informe, t)
        self._registrar({"ts": t, "accion": "reparar_publicacion", "nodo": a["nodo"],
                         "motivo": L.tachar(a["motivo"])[:200], "resultado": L.tachar(resultado)[:200],
                         "seco": self.modo == "seco", "termino": self.mem.get("termino")}, informe)

    def _tareas_de_reparacion(self, raiz: str) -> List[Dict[str, Any]]:
        """Tareas que pueden ser reparaciones de MetaGenesis: colas vivas y colas-fuente, sin repetir."""
        vistas: Dict[str, Dict[str, Any]] = {}
        for _nombre, lista in M.colas_de_codigo_vivas(raiz):
            for x in lista or ():
                if isinstance(x, dict) and x.get("id"):
                    vistas.setdefault(str(x["id"]), x)
        fuente = os.path.join(raiz, "starseed_memory_root", "colas-fuente")
        try:
            nombres = sorted(os.listdir(fuente), reverse=True)
        except OSError:
            nombres = []
        for n in nombres:
            if not (n.startswith("cola-") and n.endswith(".json")):
                continue
            d = M.leer_json(os.path.join(fuente, n), [])
            lista = d if isinstance(d, list) else (d or {}).get("tareas", []) if isinstance(d, dict) else []
            for x in lista or ():
                if isinstance(x, dict) and x.get("id"):
                    vistas.setdefault(str(x["id"]), x)
        return list(vistas.values())

    def _cerrar_reparaciones(self, raiz: str, pub: Dict[str, Any], informe: Dict[str, Any], t: float) -> None:
        """Cierra como `sustituida` las reparaciones de una puerta que ya volvió a verde (MGB1021Ab).

        Usa el mismo cerrojo y la misma escritura atómica que el resto de `progreso.json`; nunca
        borra una entrada, solo le añade el estado, la nota y la hora.
        """
        if not pub.get("fase") and not pub.get("sha"):
            return
        ruta = os.path.join(raiz, "starseed_memory_root", "olas", "progreso.json")
        tareas = self._tareas_de_reparacion(raiz)
        cierres: List[tuple] = []
        try:
            if self.modo == "seco":
                cierres = L.reparaciones_superadas(tareas, M.leer_json(ruta, {}), pub)
            else:
                with T._Cerrojo("progreso", 60):
                    progreso = T._leer_json(ruta, {})
                    progreso = progreso if isinstance(progreso, dict) else {}
                    cierres = L.reparaciones_superadas(tareas, progreso, pub)
                    if cierres:
                        hora = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t))
                        for tid, nota in cierres:
                            entrada = dict(progreso.get(tid) or {}) if isinstance(progreso.get(tid), dict) else {}
                            entrada.update(estado="sustituida", nota=nota, t=hora)
                            progreso[tid] = entrada
                        T._escribir_json(ruta, progreso)
        except Exception as e:  # noqa: BLE001 — una vuelta del nodo no se cae por el cerrojo
            informe.setdefault("avisos", []).append("cerrar reparaciones: %s" % type(e).__name__)
            return
        if not cierres:
            return
        ids = ", ".join(tid for tid, _ in cierres)
        if self.modo == "seco":
            resultado = "seca: cerraría %s" % ids
        else:
            resultado = "cerradas %d: %s" % (len(cierres), ids)
            self._decir("MetaGenesis · %d reparación(es) de una puerta de publicación ya superada pasan a "
                        "«sustituida»: %s. La puerta volvió a verde; no se borra nada del progreso." % (
                            len(cierres), ids))
        self._registrar({"ts": t, "accion": "cerrar_reparaciones", "nodo": self.yo,
                         "motivo": "la puerta de publicación volvió a verde", "resultado": L.tachar(resultado)[:200],
                         "seco": self.modo == "seco", "termino": self.mem.get("termino")}, informe)

    def _publicar_foto(self, vivos: Dict[str, Dict[str, Any]], termino: int, salud: Dict[str, Any], t: float,
                       informe: Dict[str, Any]) -> None:
        aut = next((l for l in vivos.values() if (l.get("salud") or {}).get("autoritativo")), None)
        if salud.get("autoritativo"):
            medidores = dict(salud.get("medidores") or {})
            medidores.update(L.medidores_de_resultados(salud.get("resultados") or {}, self.mem.get("prestamos") or [], t))
        else:
            # Desde otro medio: las cifras que la Mac puso en su latido (sin los textos largos).
            trabajo = ((aut or {}).get("salud") or {}).get("trabajo") or {}
            medidores = {k.replace("_", "-"): "%s" % v for k, v in trabajo.items() if v is not None}
        f = L.foto(self.yo, termino, vivos, self.mem.get("decisiones") or [], medidores or {},
                   bool(self.mem.get("autonomia", True)), self.modo, t,
                   fuentes={"autoritativo_vivo": aut is not None, "enlace": self.enlace.modo})
        h = L.huella_foto(f)
        if h != self.mem.get("foto_huella") or t - float(self.mem.get("foto_ts") or 0) >= FOTO_MAX_S:
            if self.enlace.foto(f):
                self.mem["foto_huella"], self.mem["foto_ts"] = h, t
                informe["foto"] = "publicada"
        else:
            informe["foto"] = "sin cambios"

    def _publicar_colas(self, raiz: str, t: float, informe: Dict[str, Any]) -> None:
        """Las tareas listas que otro medio podría seguir si la Mac se apaga (máx. 8, ≤ 3 archivos)."""
        if t - float(self.mem.get("colas_ts") or 0) < COLAS_CADA_S:
            return
        self.mem["colas_ts"] = t
        try:
            import vigilante_logica as V  # noqa: WPS433
            datos = M.reunir_para_rescate(raiz)
            olas = os.path.join(raiz, "starseed_memory_root", "olas")
            colas = []
            for n in sorted(os.listdir(olas), reverse=True):
                if V.es_cola_de_codigo(n):
                    d = M.leer_json(os.path.join(olas, n), [])
                    colas.append((n, d if isinstance(d, list) else (d or {}).get("tareas", [])))
            import datetime as _dt
            listas = V.seleccionar_pendientes(colas, datos["progreso"], datos["asuntos"], ahora=_dt.datetime.now())
        except Exception as e:  # noqa: BLE001
            informe["avisos"].append("colas portables: %s" % type(e).__name__)
            return
        portables = [x for x in listas if isinstance(x, dict) and len(x.get("archivos") or []) <= 3 and not x.get("aprobacion")][:8]
        h = hashlib.sha256(json.dumps([x.get("id") for x in portables]).encode()).hexdigest()[:16]
        if h == self.mem.get("colas_huella"):
            informe["colas"] = "sin cambios (%d)" % len(portables)
            return
        limpias = [{k: x.get(k) for k in ("id", "ola", "titulo", "archivos", "prompt", "depende", "modelo", "importancia")
                    if x.get(k) is not None} for x in portables]
        if self.enlace.colas(json.loads(L.tachar(json.dumps(limpias, ensure_ascii=False))), t):
            self.mem["colas_huella"] = h
            informe["colas"] = "publicadas (%d)" % len(limpias)

    def _rescatador(self, raiz: str):
        return self._rescate or (lambda: self._buscar_trabajo(raiz))

    def _buscar_trabajo(self, raiz: str):
        """Rescate: tareas de colas-fuente que nadie cerró → `olas/cola-rescate-*.json` (las recoge el
        vigilante). Jev solo VETA (p ≥ 0,8) lo que ya no tiene sentido; si calla, manda la regla."""
        datos = M.reunir_para_rescate(raiz)
        cands = L.candidatos_rescate(datos["colas_fuente"], datos["ids_vivos"], datos["progreso"], datos["asuntos"],
                                     self.reloj())
        if not cands:
            return "nada", "no hay trabajo pendiente sin cerrar en colas-fuente (últimos 21 días)"
        vetadas = []
        try:
            import decidir  # noqa: WPS433
            for c in list(cands):
                r = decidir.consultar("si-no", {"tarea": c.get("titulo"), "archivos": c.get("archivos"),
                                                "cola": c.get("origen_rescate")},
                                      "¿Sigue teniendo sentido hacer hoy esta tarea del enjambre?", regla="si",
                                      quien="nodo-metagenesis", dominio="rescate", espera_turno=20)
                if r.get("medio") != "regla" and r.get("respuesta") == "no" and float(r.get("p") or 0) >= 0.8:
                    vetadas.append(c["id"])
                    cands.remove(c)
        except Exception:  # noqa: BLE001
            pass
        if not cands:
            return "nada", "Jev vetó las %d candidatas (obsoletas)" % len(vetadas)
        nombre = "cola-rescate-%s" % time.strftime("%m%d-%H%M", time.localtime(self.reloj()))
        ruta = os.path.join(raiz, "starseed_memory_root", "olas", nombre + ".json")
        M.escribir_atomico(ruta, cands)
        texto = "%d tarea(s) rescatadas de colas-fuente en %s (%s)%s" % (
            len(cands), nombre, ", ".join(str(c["id"]) for c in cands[:8]),
            "; Jev vetó %s" % ", ".join(vetadas) if vetadas else "")
        return "hecha", texto

    def _decir(self, texto: str) -> None:
        if self.modo == "seco" or self.sin_red:
            return
        if self._chat is not None:
            self._chat(texto)
            return
        clave = hashlib.sha256(texto.encode()).hexdigest()[:12]
        if self.mem.get("ultimo_chat") == clave:
            return
        self.mem["ultimo_chat"] = clave
        try:
            import director_chat  # noqa: WPS433
            director_chat.publicar(L.tachar(texto), de="nodo-metagenesis", rol="director", tipo="informe")
        except Exception:  # noqa: BLE001
            pass

    def despedirse(self) -> None:
        if self.enlace is not None and self.modo == "real":
            self.enlace.baja(self.reloj())


# ─── CLI ─────────────────────────────────────────────────────────────────────────────────


def texto_informe(i: Dict[str, Any]) -> str:
    lineas = ["Nodo %s · %s · %s · enlace: %s · puntos %s" % (i.get("nodo"), i.get("medio"), i.get("modo"),
                                                             i.get("enlace"), i.get("puntos")),
              "Líder: %s (término %s)%s — %s" % (i.get("lider"), i.get("termino"), " · SOY YO" if i.get("soy_lider") else "",
                                                 i.get("motivo_lider")),
              "Nodos vivos: %s" % (", ".join(i.get("vivos") or []) or "—")]
    for a in i.get("acciones") or []:
        lineas.append("  · %s → %s: %s [%s]" % (a.get("accion"), a.get("nodo"), a.get("motivo"), a.get("resultado")))
    if not i.get("acciones"):
        lineas.append("  · nada que hacer en esta vuelta")
    for o in i.get("ordenes") or []:
        lineas.append("  ⇢ orden %s (%s): %s — %s" % (o.get("accion"), o.get("por"), o.get("estado"), o.get("resultado")))
    for a in i.get("avisos") or []:
        lineas.append("  ! %s" % a)
    if i.get("foto"):
        lineas.append("Foto: %s · colas portables: %s · peticiones a Supabase en la vuelta: %s" % (
            i.get("foto"), i.get("colas", "—"), i.get("peticiones", 0)))
    return "\n".join(lineas)


def consumo_frenado(ruta: str = os.path.expanduser("~/.starseed/consumo.json")) -> bool:
    """¿El vigía de consumo de Supabase dice que vamos al límite del día? (solo existe en la Mac)."""
    d = M.leer_json(ruta, {})
    if not isinstance(d, dict):
        return False
    pres = d.get("presupuesto") or {}
    return bool(d.get("restringido") or (d.get("freno") or {}).get("activo")
                or float(pres.get("pct_peticiones") or 0) >= 0.95)


def espera_tras(informe: Dict[str, Any], frenado: bool) -> int:
    """PURA. Segundos hasta la próxima vuelta.

    Con el freno de consumo (vigia_consumo.py) el nodo da una vuelta cada 10 min, sin dejar de latir
    antes del TTL (15 min) para no provocar un relevo de líder en falso. (PDA1011) Por la puerta de
    datos la vuelta no cuesta Supabase (el espejo y las órdenes del bus ya van cada 10 min), así que
    sigue su ritmo normal: con 10 min, faltar a UNA vuelta por un corte de la puerta dejaba caducar
    el arriendo (medido el 2026-10-10: el A1 tomó el mando tras un corte de 68 s)."""
    espera = CADA_LIDER_S if informe.get("soy_lider") else CADA_S
    if frenado and not str(informe.get("enlace") or "").startswith("puerta"):
        espera = max(espera, 600)
    return espera


def servir(seco: bool) -> int:
    nodo = Nodo(seco=seco)
    parar = {"ya": False}

    def _senal(*_a):
        parar["ya"] = True

    signal.signal(signal.SIGTERM, _senal)
    signal.signal(signal.SIGINT, _senal)
    print("[nodo-metagenesis] en marcha (%s)" % nodo.modo, flush=True)
    while not parar["ya"]:
        try:
            i = nodo.vuelta()
            print("[%s] %s" % (time.strftime("%H:%M:%S"), texto_informe(i).replace("\n", " | ")), flush=True)
            espera = espera_tras(i, consumo_frenado())
        except Exception as e:  # noqa: BLE001
            print("[nodo-metagenesis] vuelta fallida: %s: %s" % (type(e).__name__, L.tachar(str(e))[:200]), flush=True)
            espera = 60
        fin = time.time() + espera + random.uniform(-8, 8)
        while not parar["ya"] and time.time() < fin:
            time.sleep(1)
    nodo.despedirse()
    print("[nodo-metagenesis] me despido", flush=True)
    return 0


def orden_cli(accion: str, para: str, cola: Optional[str], trabajadores: Optional[int], esperar: bool) -> int:
    env = B.leer_entorno()
    secreto = env.get("STARSEED_LANZADOR_SECRETO", "")
    if not secreto:
        print("Sin STARSEED_LANZADOR_SECRETO en esta máquina: no puedo firmar la orden.", file=sys.stderr)
        return 2
    args: Dict[str, Any] = {}
    if cola:
        args["cola"] = cola
    if trabajadores:
        args["trabajadores"] = trabajadores
    malos = L.args_validos(accion, args) if accion in L.ACCIONES_ORDEN else "acción no admitida"
    if malos:
        print("Orden no válida: %s" % malos, file=sys.stderr)
        return 2
    nodo = Nodo()
    nodo.yo = L.id_de_nodo(M.detectar_medio(), M.huella_maquina())
    rest = nodo._rest()
    if rest is None:
        print("Sin Supabase en esta máquina.", file=sys.stderr)
        return 2
    bus = B.EnlaceBus(rest, nodo.yo)
    o = {"v": L.VERSION, "accion": accion, "para": para, "t": B.iso(time.time()), "nonce": secrets.token_urlsafe(12),
         "por": "cli:" + nodo.yo, "args": args}
    o["firma"] = L.firmar(o, secreto)
    if not bus.orden(o):
        print("No pude publicar la orden: %s" % bus.error, file=sys.stderr)
        return 1
    print("Orden %s publicada para «%s» (nonce %s)." % (accion, para, o["nonce"]))
    if not esperar:
        return 0
    fin = time.time() + 600
    while time.time() < fin:
        time.sleep(15)
        estado, filas = rest.pedir("GET", B.EnlaceBus.TABLA + "?select=datos&tipo=eq.%s&order=id.desc&limit=30" % L.T_ORDEN_HECHA)
        for f in filas if isinstance(filas, list) else []:
            d = f.get("datos") or {}
            if d.get("nonce") == o["nonce"]:
                print("%s · %s: %s" % (d.get("nodo"), d.get("estado"), d.get("resultado")))
                return 0 if d.get("estado") in ("hecha", "en_marcha", "nada", "seca") else 1
    print("Ningún nodo contestó en 10 min.")
    return 1


def registrar_cli(nodo_id: str, huella: str, medio: str) -> int:
    env = B.leer_entorno()
    clave = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SECRET_KEY")
    if not clave or not env.get("NEXT_PUBLIC_SUPABASE_URL"):
        print("Hace falta la clave de servicio en esta máquina (solo la Mac la tiene).", file=sys.stderr)
        return 2
    if not L.id_valido(nodo_id) or not (len(huella) == 64 and all(c in "0123456789abcdef" for c in huella)):
        print("Nodo o huella no válidos.", file=sys.stderr)
        return 2
    rest = B.Rest(env["NEXT_PUBLIC_SUPABASE_URL"], clave)
    estado, datos = rest.pedir("POST", "/rest/v1/rpc/metagenesis_registrar_nodo",
                               {"_nodo": nodo_id, "_huella": huella, "_medio": medio})
    if 200 <= estado < 300:
        print("Nodo %s dado de alta: ya puede usar las tablas de MetaGenesis." % nodo_id)
        return 0
    print("No se pudo dar de alta (%s): %s" % (estado, L.tachar(str(datos))[:200]), file=sys.stderr)
    return 1


def instalar(seco: bool) -> int:
    script = os.path.abspath(__file__)
    raiz = M.raiz_repo()
    if sys.platform == "darwin":
        import plistlib
        etiqueta = "com.starseed.nodo-metagenesis"
        python = "/opt/homebrew/bin/python3" if os.path.exists("/opt/homebrew/bin/python3") else sys.executable
        plist = {
            "Label": etiqueta,
            # python3 de Homebrew directo: tiene el permiso de disco (TCC); un shell no podría leer ~/Documents.
            "ProgramArguments": [python, "-u", script, "servir"] + (["--seco"] if seco else []),
            "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 60, "ProcessType": "Background",
            "StandardOutPath": "/tmp/starseed-nodo-metagenesis.log", "StandardErrorPath": "/tmp/starseed-nodo-metagenesis.log",
            "EnvironmentVariables": {"STARSEED_ROOT": raiz, "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:"
                                     + os.path.expanduser("~/.local/bin")},
            "WorkingDirectory": raiz,
        }
        ruta = os.path.expanduser("~/Library/LaunchAgents/%s.plist" % etiqueta)
        with open(ruta, "wb") as f:
            plistlib.dump(plist, f)
        uid = os.getuid()
        M._sh(["launchctl", "bootout", "gui/%d/%s" % (uid, etiqueta)], tope=30)
        # `bootout` termina de verdad un poco después: sin esperar, `bootstrap` da «5: Input/output
        # error» (medido el 2026-10-10). Se espera a que desaparezca y se reintenta.
        for _ in range(20):
            if M._sh(["launchctl", "print", "gui/%d/%s" % (uid, etiqueta)], tope=10)[0] != 0:
                break
            time.sleep(0.5)
        rc, out = 1, ""
        for _ in range(4):
            rc, out = M._sh(["launchctl", "bootstrap", "gui/%d" % uid, ruta], tope=30)
            if rc == 0:
                break
            time.sleep(2)
        print("launchd %s: %s" % (etiqueta, "cargado" if rc == 0 else "error %s" % out.strip()[:200]))
        return 0 if rc == 0 else 1
    unidad = os.path.expanduser("~/.config/systemd/user/starseed-nodo-metagenesis.service")
    os.makedirs(os.path.dirname(unidad), exist_ok=True)
    with open(unidad, "w") as f:
        f.write("[Unit]\nDescription=StarSeed · nodo de MetaGenesis\nAfter=network-online.target\n\n[Service]\n"
                "Environment=STARSEED_ROOT=%s PYTHONUNBUFFERED=1\nExecStart=%s -u %s servir%s\nRestart=always\n"
                "RestartSec=60\nMemoryMax=512M\n\n[Install]\nWantedBy=default.target\n"
                % (raiz, sys.executable, script, " --seco" if seco else ""))
    M._sh(["systemctl", "--user", "daemon-reload"])
    rc, out = M._sh(["systemctl", "--user", "enable", "--now", "starseed-nodo-metagenesis.service"], tope=60)
    print("systemd --user: %s" % ("en marcha" if rc == 0 else out.strip()[:200]))
    return 0 if rc == 0 else 1


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Nodo de MetaGenesis (cualquier medio)")
    sub = p.add_subparsers(dest="orden")
    for nombre in ("servir", "ciclo", "instalar"):
        s = sub.add_parser(nombre)
        s.add_argument("--seco", action="store_true", help="decide y lo dice, pero no lanza nada")
        if nombre == "ciclo":
            s.add_argument("--json", action="store_true")
            s.add_argument("--sin-red", action="store_true", help="no lee ni escribe en Supabase")
            s.add_argument("--solo-leer", action="store_true",
                           help="prueba seca junto al servicio vivo: lee el bus y su memoria, no escribe nada")
    sub.add_parser("estado")
    o = sub.add_parser("orden")
    o.add_argument("accion", choices=sorted(L.ACCIONES_ORDEN))
    o.add_argument("--para", default="lider")
    o.add_argument("--cola")
    o.add_argument("--trabajadores", type=int)
    o.add_argument("--esperar", action="store_true")
    sub.add_parser("llave")
    r = sub.add_parser("registrar")
    r.add_argument("--nodo", required=True)
    r.add_argument("--huella", required=True)
    r.add_argument("--medio", default="neurona")
    a = p.parse_args(argv)
    if a.orden == "servir":
        return servir(a.seco)
    if a.orden == "ciclo":
        if a.solo_leer:
            # La memoria del servicio se LEE (enfriamientos reales) pero no se guarda: es una copia.
            nodo = Nodo(seco=True, sin_red=a.sin_red, solo_leer=True, persistir=False, memoria=leer_memoria())
        else:
            nodo = Nodo(seco=a.seco, sin_red=a.sin_red)
        i = nodo.vuelta()
        print(json.dumps(i, ensure_ascii=False, indent=1) if a.json else texto_informe(i))
        return 0
    if a.orden == "estado":
        d = M.leer_json(ESTADO, {})
        print(texto_informe(d) if d else "Este nodo aún no ha dado ninguna vuelta.")
        return 0
    if a.orden == "orden":
        return orden_cli(a.accion, a.para, a.cola, a.trabajadores, a.esperar)
    if a.orden == "llave":
        llave = leer_llave(crear=True)
        yo = L.id_de_nodo(M.detectar_medio(), M.huella_maquina())
        print("Nodo %s · huella de su llave: %s" % (yo, huella_llave(llave)))
        print("Para darla de alta (en la Mac, con la clave de servicio):\n  python3 scripts/puente/nodo_metagenesis.py "
              "registrar --nodo %s --huella %s --medio %s" % (yo, huella_llave(llave), M.detectar_medio()))
        return 0
    if a.orden == "registrar":
        return registrar_cli(a.nodo, a.huella, a.medio)
    if a.orden == "instalar":
        return instalar(a.seco)
    p.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
