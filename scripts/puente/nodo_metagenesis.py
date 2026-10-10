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
Claude no hace falta: es un medio más que puede sumarse. Nada de esto imprime una clave.

  python3 scripts/puente/nodo_metagenesis.py servir [--seco]        bucle (launchd/systemd)
  python3 scripts/puente/nodo_metagenesis.py ciclo [--seco] [--json] [--sin-red]  una vuelta
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


# ─── el nodo ─────────────────────────────────────────────────────────────────────────────


class Nodo:
    """Una vuelta del nodo, con todo lo de fuera inyectable (las pruebas usan un Supabase simulado
    y un medio falso)."""

    def __init__(self, seco: bool = False, sin_red: bool = False, env: Optional[Dict[str, str]] = None,
                 medir: Callable[[str, float], Dict[str, Any]] = None, ejecutar: Callable[..., Any] = None,
                 http: B.Http = B.http_urllib, reloj: Callable[[], float] = time.time,
                 memoria: Optional[Dict[str, Any]] = None, persistir: bool = True,
                 huella: Optional[str] = None, rescate: Optional[Callable[..., Any]] = None,
                 chat: Optional[Callable[[str], None]] = None, llave: Optional[str] = None):
        self.modo = "seco" if seco else "real"
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

    # ── enlace ──
    def _rest(self) -> Optional[B.Rest]:
        url, anon = self.env.get("NEXT_PUBLIC_SUPABASE_URL", ""), self.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        if self.sin_red or not url or not anon:
            return None
        return B.Rest(url, anon, http=self.http)

    def _enlazar(self, medio: str, ahora: float) -> None:
        if self.enlace is not None and (self.enlace.modo == "tablas" or ahora - self._probado_tablas < REPROBAR_TABLAS_S):
            return
        rest = self._rest()
        if rest is None:
            self.enlace = None
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
        castigo = -2000 if float(self.mem.get("no_liderar_hasta") or 0) > t else 0
        puntos = L.puntos_nodo(cap) + castigo
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
                arr = enlace.arriendo or {}
                decision = {"lider": arr.get("lider"), "termino": int(arr.get("termino") or 0), "reclamar": False,
                            "motivo": "arriendo en la base"}
                for n in enlace.nodos:
                    if L.id_valido(n.get("nodo")):
                        vivos[n["nodo"]] = dict(n.get("datos") or {}, nodo=n["nodo"], ts=float(n.get("ts") or t))
                ordenes = enlace.ordenes_de_tabla()
            vivos.setdefault(self.yo, latido)
        else:
            vivos[self.yo] = latido
        self.mem.setdefault("desde", t)
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

        # 3. Autocuración propia (líder o no).
        for a in L.autocurar(salud, self.mem, t):
            self._hacer(a, medio, medida["raiz"], informe, publicar=False)

        # 4. El líder decide por todos.
        if soy_lider:
            mundo = {"nodos": vivos, "yo": self.yo, "autonomia": bool(self.mem.get("autonomia", True)),
                     "asignaciones": nov.get("asignaciones") or [],
                     "ultimo_autoritativo_ts": self.mem.get("ultimo_autoritativo_ts")}
            sin_aut = not any((l.get("salud") or {}).get("autoritativo") for l in vivos.values())
            if sin_aut and enlace is not None and t - float(self.mem.get("ultimo_autoritativo_ts") or t) >= L.RELEVO_MEDIO_S:
                mundo["colas_portables"] = enlace.ultimas_colas()
            for a in L.planificar(mundo, self.mem, t):
                if a["nodo"] == self.yo:
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

    @staticmethod
    def _salud_publica(salud: Dict[str, Any]) -> Dict[str, Any]:
        """Lo que viaja en el latido: sin rutas, sin medidores largos, sin nada privado."""
        fuera = {"medidores"}
        pub = {k: v for k, v in salud.items() if k not in fuera}
        pub["orquestadores"] = [{"cola": o.get("cola")} for o in salud.get("orquestadores") or []][:6]
        return json.loads(L.tachar(json.dumps(pub, ensure_ascii=False)))

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
        elif self.enlace is None or self.enlace.modo != "bus" or not self.secreto:
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
        firmada = self.enlace is not None and self.enlace.modo == "bus"
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
                if self.enlace is not None and self.enlace.modo == "tablas":
                    self.enlace.ceder()
                r.update(estado="hecha", resultado="cedo el mando 30 min")
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

    def _publicar_foto(self, vivos: Dict[str, Dict[str, Any]], termino: int, salud: Dict[str, Any], t: float,
                       informe: Dict[str, Any]) -> None:
        aut = next((l for l in vivos.values() if (l.get("salud") or {}).get("autoritativo")), None)
        if salud.get("autoritativo"):
            medidores = salud.get("medidores") or {}
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
            espera = CADA_LIDER_S if i.get("soy_lider") else CADA_S
            if consumo_frenado():
                # Supabase en su tope propio (vigia_consumo.py): una vuelta cada 10 min, sin dejar de
                # latir antes del TTL (15 min) para no provocar un relevo de líder en falso.
                espera = max(espera, 600)
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
