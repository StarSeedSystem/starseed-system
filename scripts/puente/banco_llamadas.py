#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Serie de llamadas de prueba automáticas, lado Python (BAN1114C · architecture/ronda-automatica-llamadas.md, fase 1).

  python3 scripts/puente/director_pruebas.py pedir banco-serie --esc ble-video-2min --rep 10 --quien claude   (la pide)
  python3 scripts/puente/banco_llamadas.py estado [--json]                                                    (lee el resultado)
  python3 scripts/puente/banco_llamadas.py serie --esc ble-video-2min --rep 10                                (lo que lanza el director)

Este programa NO arma nada, NO contesta ninguna llamada y NO toca la app: escribe la orden (`orden.json`) y lee la
evidencia (el registro de enlaces). Quien llama es la app de la Mac; quien contesta, la tableta armada por su dueño.
Archivos, en `~/.starseed/produccion/banco-llamadas/` (`STARSEED_PRODUCCION_DIR` lo cambia en las pruebas):
  orden.json            la orden en curso (solo este programa la escribe y la borra, también al acabar o morir)
  calma.json            la última lectura de calma (cada 30 s mientras hay serie)
  banco-llamadas.json   las series (las 10 últimas), cada llamada con su juicio, números y calma
  serie.lock            una sola serie a la vez
La ronda de aparatos se toma y se suelta SOLO con peticiones al director (`ronda-iniciar`, `ronda-terminar`).
Nada se marca: el veredicto es una sugerencia «simulado» (§2, §3.3).
"""
import fcntl
import json
import os
import shutil
import signal
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import banco_llamadas_logica as L  # noqa: E402
import banco_pruebas_logica as BL  # noqa: E402
import ronda as R  # noqa: E402

CARPETA = "banco-llamadas"
ORDEN, CALMA, SERIES, LOCK = "orden.json", "calma.json", "banco-llamadas.json", "serie.lock"
QUIEN = "banco-llamadas"
SONDEO_S = 5.0                    # cada cuánto mira las marcas mientras espera
MAX_SERIES = 10
LOGS = os.environ.get("STARSEED_BANCO_LOGS") or os.path.expanduser("~/Library/Logs/app.starseed.os")   # el registro de enlaces de la app


def carpeta():
    return os.environ.get("STARSEED_PRODUCCION_DIR") or os.path.expanduser("~/.starseed/produccion")


class Config(object):
    """Tiempos de la serie (§1.3). `STARSEED_BANCO_<NOMBRE>` los cambia (las pruebas)."""
    DEFECTO = {"viva_s": 90.0, "inicio_timeout_s": 90.0, "fin_extra_s": 60.0, "evidencia_s": 120.0, "pausa_s": 60.0,
               "ronda_min": 90, "renovar_s": 900.0, "peticion_espera_s": 150.0, "ciclo_s": 330.0, "orden_caduca_s": 120.0}

    def __init__(self, env=None):
        env = os.environ if env is None else env
        v = dict(self.DEFECTO)
        for k in list(v):
            try:
                v[k] = type(v[k])(float(env["STARSEED_BANCO_" + k.upper()]))
            except (KeyError, ValueError):
                pass
        self.__dict__.update(v)


# ── el mundo (disco, reloj, registro, medidas, director): las pruebas lo sustituyen entero ──────────────────────

class Mundo(object):
    def __init__(self, dir_estado=None, logs=None):
        self.dir = dir_estado or carpeta()
        self.logs = logs or LOGS
        self.rm = R.Mundo(dir_estado=self.dir)
        self._swapouts = []

    def ahora(self):
        return time.time()

    def dormir(self, s):
        time.sleep(s)

    def ruta(self, *p):
        return os.path.join(self.dir, CARPETA, *p)

    def leer_json(self, nombre):
        try:
            with open(self.ruta(nombre), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def escribir_json(self, nombre, datos):
        os.makedirs(self.ruta(), exist_ok=True)
        ruta = self.ruta(nombre)
        tmp = "%s.tmp-%d" % (ruta, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, ruta)

    def borrar(self, nombre):
        try:
            os.unlink(self.ruta(nombre))
            return True
        except OSError:
            return False

    def leer_log(self):
        """Texto del registro de enlaces: la cola del actual y, si es corto (rotó hace poco), la del anterior."""
        def cola(ruta, maximo=3 * 1024 * 1024):
            try:
                with open(ruta, "rb") as f:
                    f.seek(0, os.SEEK_END)
                    n = f.tell()
                    f.seek(max(0, n - maximo))
                    return f.read().decode("utf-8", "replace"), n
            except OSError:
                return "", 0
        actual, n = cola(os.path.join(self.logs, "enlaces.log"))
        if n < 400 * 1024:
            return cola(os.path.join(self.logs, "enlaces.log.1"))[0] + actual
        return actual

    def _salida(self, args):
        if sys.platform != "darwin":
            return None
        try:
            r = subprocess.run(args, capture_output=True, text=True, timeout=10)
            return r.stdout if r.returncode == 0 else None
        except Exception:  # noqa: BLE001
            return None

    def medir(self):
        """Una lectura de calma (§5). Lo que no se puede leer es None (y se dice), nunca un valor inventado."""
        t = self.ahora()
        lec = {"t": t, "carga1": None, "presion": None, "libre_pct": None, "swap_pct": None, "swapouts_min": None,
               "disco_gb": None, "pesados": []}
        try:
            sil, _ = R.silencio_ahora(self.rm)
            lec["carga1"], lec["presion"] = sil["carga1"], sil["presion"]
            lec["pesados"] = [p["que"] for p in sil["pesados"]]
        except Exception:  # noqa: BLE001
            pass
        lec["libre_pct"] = L.parse_memoria_libre(self._salida(["memory_pressure", "-Q"]))
        lec["swap_pct"] = L.parse_swapusage(self._salida(["sysctl", "vm.swapusage"]))
        lec["swapouts_min"] = L.tasa_swapouts(self._swapouts, t, L.parse_swapouts(self._salida(["vm_stat"])))
        for ruta in ("/System/Volumes/Data", "/"):
            try:
                lec["disco_gb"] = shutil.disk_usage(ruta).free / 1e9
                break
            except OSError:
                continue
        return lec

    def ronda_vista(self):
        return R.vista(R.leer(self.rm), self.ahora())

    def pedir(self, accion, nota=None, minutos=None):
        import director_pruebas as DP
        return DP.escribir_peticion(self.dir, accion, QUIEN, self.ahora(), nota=nota, minutos=minutos)


# ── la serie ────────────────────────────────────────────────────────────────────────────────────────────────────

class Serie(object):
    def __init__(self, mundo, esc, rep, quien="terminal", para=None, u=None, cfg=None, decir=None):
        self.m, self.esc, self.rep, self.quien, self.para_arg = mundo, esc, rep, quien, para
        self.u = u or L.Umbrales()
        self.cfg = cfg or Config()
        self.decir = decir or (lambda t: print("%s %s" % (time.strftime("%H:%M:%S"), t), flush=True))
        self.id = L.id_serie(mundo.ahora())
        self.est = {"serie": self.id, "esc": esc, "rep": rep, "quien": quien, "estado": "en-curso", "desde": BL._a_iso(mundo.ahora()),
                    "hasta": None, "motivo_fin": None, "llamadas": [], "veredicto": None, "medio_real": False, "simulado": True}
        self.juicios = []
        self.solicitada = False
        self.tengo_ronda = False
        self.n_actual = 0

    # persistencia
    def guardar(self):
        d = self.m.leer_json(SERIES)
        previas = [s for s in (d or {}).get("series", []) if isinstance(s, dict) and s.get("serie") != self.id]
        self.est["llamadas"] = list(self.juicios)
        self.m.escribir_json(SERIES, {"formato": 1, "t": BL._a_iso(self.m.ahora()), "series": ([self.est] + previas)[:MAX_SERIES]})

    def escribir_calma(self, lec, fase, ok, fallos, notas):
        self.m.escribir_json(CALMA, {"v": 1, "t": BL._a_iso(self.m.ahora()), "serie": self.id, "n": self.n_actual, "fase": fase,
                                     "ok": ok, "fallos": fallos, "notas": notas, "lectura": lec})

    def parsear(self):
        lineas = []
        for x in self.m.leer_log().splitlines():
            try:
                l = BL.parse_linea(x)
            except Exception:  # noqa: BLE001
                l = None
            if l and l.get("t") is not None:
                lineas.append(l)
        return lineas

    def estado_app(self, lineas=None):
        return L.estado_app(L.marcas_de_lineas(lineas if lineas is not None else self.parsear()), self.m.ahora(), self.cfg.viva_s)

    # fin
    def terminar(self, motivo, estado="abortada"):
        if self.est["estado"] != "en-curso":
            return
        self.est["estado"], self.est["motivo_fin"], self.est["hasta"] = estado, motivo, BL._a_iso(self.m.ahora())
        k = len([j for j in self.juicios if j["valida"] is not None])
        incompleta = k if (estado == "abortada" and k < self.rep and self.juicios) else None
        c2 = L.veredicto_serie(self.juicios, self.rep, "cumple", "c2", incompleta)
        c3 = L.veredicto_serie(self.juicios, self.rep, "c3", "c3", incompleta)
        self.est["veredicto"] = {"c2": c2, "c3": c3}
        self.decir("fin: %s · c2: %s · c3: %s" % (motivo, c2["sugerencia"], c3["sugerencia"]))

    # calma
    def esperar_calma(self, limite_s, fase="espera"):
        """Espera hasta tener `lecturas` buenas seguidas en `ventana_s`. → (ok, motivo si no)."""
        t0 = self.m.ahora()
        hist, ultimo = [], "todavía no hay lecturas"
        while True:
            lec = self.m.medir()
            ok, fallos, notas = L.evaluar_calma(lec, self.u, "inicio")
            hist.append({"t": lec["t"], "ok": ok, "fallos": fallos})
            hist = hist[-20:]
            listo, motivo = L.calma_para_empezar(hist, self.u)
            self.escribir_calma(lec, fase, ok, fallos, notas)
            if not ok:
                ultimo = "; ".join(fallos)
            if listo:
                return True, None
            if self.m.ahora() - t0 >= limite_s:
                return False, "la Mac no estuvo en calma en %s: %s" % (R.minutos_texto(limite_s), ultimo)
            self.m.dormir(self.u.cada_s)

    # ronda
    def tomar_ronda(self):
        v = self.m.ronda_vista()
        if v["activa"] and (v["ronda"] or {}).get("quien") != QUIEN:
            r = v["ronda"]
            return False, "hay otra ronda de aparatos activa (%s: %s) hasta las %s; no empiezo" % (
                r.get("quien"), r.get("motivo"), R.hora_local(v["hasta"]))
        self.m.pedir("ronda-iniciar", "serie de llamadas automaticas %s" % self.id, self.cfg.ronda_min)
        self.solicitada = True
        t0 = self.m.ahora()
        while self.m.ahora() - t0 <= self.cfg.peticion_espera_s:
            v = self.m.ronda_vista()
            if v["activa"]:
                if v["ronda"].get("quien") == QUIEN:
                    self.tengo_ronda = True
                    return True, None
                return False, "otra ronda tomó el cerrojo (%s); no empiezo" % v["ronda"].get("quien")
            self.m.dormir(SONDEO_S)
        return False, "el director no tomó la petición de ronda en %d s (¿parado o con otra cola?)" % self.cfg.peticion_espera_s

    def asegurar_ronda(self):
        """Antes de cada llamada: renueva si quedan < 15 min y comprueba que cabe un ciclo. → (ok, motivo)."""
        v = self.m.ronda_vista()
        if not v["activa"] or (v["ronda"] or {}).get("quien") != QUIEN:
            return False, "la ronda de aparatos ya no es de esta serie (caducó o la soltaron)"
        if v["quedan_s"] < self.cfg.renovar_s:
            self.m.pedir("ronda-iniciar", "serie de llamadas automaticas %s" % self.id, self.cfg.ronda_min)
            t0 = self.m.ahora()
            while self.m.ahora() - t0 <= self.cfg.peticion_espera_s:
                self.m.dormir(SONDEO_S)
                v2 = self.m.ronda_vista()
                if v2["activa"] and v2["quedan_s"] > v["quedan_s"] + 60:
                    v = v2
                    break
            v = self.m.ronda_vista()
        if not v["activa"]:
            return False, "la ronda de aparatos caducó"
        if v["quedan_s"] < self.cfg.ciclo_s:
            return False, "a la ronda le quedan %s y una llamada necesita unos %s" % (R.minutos_texto(v["quedan_s"]), R.minutos_texto(self.cfg.ciclo_s))
        return True, None

    # una llamada
    def llamada(self, n, para):
        """Hace la llamada n. → None si se hizo y juzgó; o un texto con el motivo por el que la serie debe parar."""
        self.n_actual = n
        orden = L.construir_orden(self.esc, self.id, n, self.rep, para, self.m.ahora(), self.cfg.orden_caduca_s)
        self.m.escribir_json(ORDEN, orden)
        self.decir("llamada %d de %d: orden escrita" % (n, self.rep))
        t_orden = self.m.ahora()
        e = L.ESCENARIOS[self.esc]
        try:
            while True:
                lineas = self.parsear()
                mias = [mk for mk in L.marcas_de_lineas(lineas) if mk["serie"] == self.id and mk["n"] == n]
                rech = [mk for mk in mias if mk["evento"] == "rechaza"]
                if rech:
                    return "la orden %d fue rechazada: %s" % (n, L.MOTIVOS_RECHAZO[rech[0]["motivo"]])
                if any(mk["evento"] == "inicio" and mk["aparato"] == "mac" for mk in mias):
                    break
                if self.m.ahora() - t_orden > self.cfg.inicio_timeout_s:
                    return ("la orden %d no fue tomada por la app: no hubo «banco inicio» en %d s (la app no la sondeó, la rechazó sin "
                            "avisar o no está armada)" % (n, self.cfg.inicio_timeout_s))
                self.m.dormir(SONDEO_S)
        finally:
            self.m.borrar(ORDEN)             # tomada o no, la orden no se queda: la app no debe volver a leerla
        # durante la llamada: calma cada `cada_s` y espera de «banco fin»
        lecturas, t_ult, t_ini = [], -1e9, self.m.ahora()
        limite = t_ini + e["dur_s"] + self.cfg.fin_extra_s
        visto_fin = False
        while self.m.ahora() < limite:
            if self.m.ahora() - t_ult >= self.u.cada_s:
                lec = self.m.medir()
                ok, fallos, notas = L.evaluar_calma(lec, self.u, "durante")
                lec["notas"] = notas + (["FALLA: " + f for f in fallos] if not ok else [])
                lecturas.append(lec)
                self.escribir_calma(lec, "llamada", ok, fallos, notas)
                t_ult = self.m.ahora()
            lineas = self.parsear()
            if any(mk["evento"] == "fin" and mk["aparato"] == "mac" and mk["serie"] == self.id and mk["n"] == n
                   for mk in L.marcas_de_lineas(lineas)):
                visto_fin = True
                break
            self.m.dormir(SONDEO_S)
        # evidencia de la tableta (paso 14): hasta que esté completa o `evidencia_s`
        t_ev = self.m.ahora()
        while visto_fin and self.m.ahora() - t_ev <= self.cfg.evidencia_s:
            lineas = self.parsear()
            if L.evidencia_completa(lineas, self.id, n)[0]:
                break
            self.m.dormir(SONDEO_S)
        lineas = self.parsear()
        ble = [l for l in lineas if l["canal"] == "ble"]
        j = L.juzgar_llamada(self.esc, self.id, n, lineas, ble, lecturas, self.u)
        if not visto_fin and not any("banco fin" in x for x in j["motivos_invalida"]):
            j["motivos_invalida"].append("no apareció «banco fin» en %d s" % (e["dur_s"] + self.cfg.fin_extra_s))
            j["valida"], j["cumple"] = False, None
        self.juicios.append(j)
        self.decir("llamada %d: %s" % (n, ("válida, %s" % ("cumple" if j["cumple"] else "NO cumple: " + "; ".join(j["fallos"]))) if j["valida"]
                                       else "no válida: " + "; ".join(j["motivos_invalida"])))
        self.guardar()
        return None

    def correr(self):
        try:
            self._correr()
        except SystemExit:
            self.terminar("interrumpida (se paró el programa de la serie)")
            raise
        except Exception as ex:  # noqa: BLE001 — una serie rota se dice, no se calla
            self.terminar("error inesperado: %s" % BL.describir_error(ex))
        finally:
            self.limpiar()
            self.guardar()
        return self.est

    def _correr(self):
        self.guardar()
        ap = self.estado_app()
        if not ap["armada"] or not ap["viva"]:
            return self.terminar("sin veredicto: " + ap["motivo"])
        para = self.para_arg or ap["con"]
        ok, motivo = self.esperar_calma(self.u.espera_calma_s)
        if not ok:
            return self.terminar("sin veredicto: " + motivo)
        ap = self.estado_app()
        if not ap["armada"] or not ap["viva"]:
            return self.terminar("sin veredicto: " + ap["motivo"])
        ok, motivo = self.tomar_ronda()
        if not ok:
            return self.terminar("sin veredicto: " + motivo)
        for n in range(1, self.rep + 1):
            if n > 1:
                self.m.dormir(self.cfg.pausa_s)
            ok, motivo = self.asegurar_ronda()
            if ok and n > 1:
                ok, motivo = self.esperar_calma(min(self.u.espera_calma_s, max(0.0, self.m.ronda_vista()["quedan_s"] - self.cfg.ciclo_s)))
                if ok:
                    ok, motivo = self.asegurar_ronda()
            if not ok:
                return self.terminar("serie incompleta: %d de %d (%s)" % (len(self.juicios), self.rep, motivo))
            ap = self.estado_app()
            if not ap["armada"] or not ap["viva"]:
                return self.terminar("serie incompleta: %d de %d (%s)" % (len(self.juicios), self.rep, ap["motivo"]))
            parar = self.llamada(n, para)
            if parar:
                return self.terminar(("serie incompleta: %d de %d (%s)" % (len(self.juicios), self.rep, parar)) if self.juicios
                                     else "sin veredicto: " + parar)
        self.terminar("las %d llamadas hechas" % self.rep, "terminada")

    def limpiar(self):
        """Pase lo que pase: la orden se borra y la ronda, si la pedimos, se suelta (por el director)."""
        try:
            self.m.borrar(ORDEN)
        except Exception:  # noqa: BLE001
            pass
        if self.solicitada:
            try:
                v = self.m.ronda_vista()
                if not v["activa"] or (v["ronda"] or {}).get("quien") == QUIEN:
                    self.m.pedir("ronda-terminar")
                    self.decir("ronda soltada (petición ronda-terminar)")
            except Exception as ex:  # noqa: BLE001
                self.decir("no pude pedir ronda-terminar: %s" % type(ex).__name__)
            self.solicitada = False


# ── línea de órdenes ────────────────────────────────────────────────────────────────────────────────────────────

def serie_viva(dir_estado=None):
    """True si hay una serie corriendo (el cerrojo está tomado)."""
    ruta = os.path.join(dir_estado or carpeta(), CARPETA, LOCK)
    try:
        f = open(ruta, "a")
    except OSError:
        return False
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return False
    except OSError:
        return True
    finally:
        f.close()


def lanzar_desacoplado(dir_estado, esc, rep, quien):
    """Lanza la serie en un proceso aparte (sesión nueva) y vuelve al instante. → (ok, texto). Lo usa el director."""
    if esc not in L.ESCENARIOS:
        return False, "escenario desconocido: %s" % esc
    if serie_viva(dir_estado):
        return False, "ya hay una serie de llamadas en marcha; espera a que acabe (estado: banco_llamadas.py estado)"
    os.makedirs(os.path.join(dir_estado, CARPETA), exist_ok=True)
    log = open(os.path.join(dir_estado, CARPETA, "ultima-serie.log"), "ab")
    env = dict(os.environ, STARSEED_PRODUCCION_DIR=dir_estado)
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "serie", "--esc", esc, "--rep", str(rep), "--quien", quien],
                         stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True, env=env)
    log.close()
    return True, "serie de llamadas lanzada (pid %d): %d × %s; el resultado, con banco_llamadas.py estado" % (p.pid, rep, esc)


def texto_estado(datos):
    series = (datos or {}).get("series") or []
    if not series:
        return "Banco de llamadas: ninguna serie hecha todavía."
    s = series[0]
    v = s.get("veredicto") or {}
    sal = ["Serie %s · %d × %s · %s%s" % (s["serie"], s["rep"], s["esc"], s["estado"], (" · " + s["motivo_fin"]) if s.get("motivo_fin") else "")]
    for c in ("c2", "c3"):
        if v.get(c):
            sal.append("  %s: %s" % (c, v[c]["sugerencia"]))
    for j in s.get("llamadas", []):
        sal.append("  llamada %s: %s" % (j["n"], ("válida, %s" % ("cumple" if j["cumple"] else "no cumple (%s)" % "; ".join(j["fallos"])))
                                          if j["valida"] else "no válida (%s)" % "; ".join(j["motivos_invalida"])))
    sal.append("Todo es «simulado» (medio_real=false): el banco sugiere; no marca ninguna comprobación.")
    return "\n".join(sal)


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Serie de llamadas de prueba automáticas (lado Python)")
    sub = ap.add_subparsers(dest="orden", required=True)
    s = sub.add_parser("serie")
    s.add_argument("--esc", required=True, choices=sorted(L.ESCENARIOS))
    s.add_argument("--rep", type=int, required=True)
    s.add_argument("--quien", default="terminal")
    s.add_argument("--para")
    e = sub.add_parser("estado")
    e.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    m = Mundo()
    if a.orden == "estado":
        d = m.leer_json(SERIES)
        print(json.dumps(d, ensure_ascii=False, indent=2) if a.json else texto_estado(d))
        return 0
    if not 1 <= a.rep <= L.REP_MAX:
        print("error: --rep va de 1 a %d" % L.REP_MAX, file=sys.stderr)
        return 2
    os.makedirs(m.ruta(), exist_ok=True)
    with open(m.ruta(LOCK), "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            print("ya hay una serie en marcha; esta no empieza")
            return 3
        # una serie que dejó «en-curso» y ya no corre (se cayó el proceso) se dice, no se deja como viva
        d = m.leer_json(SERIES)
        if d and any(x.get("estado") == "en-curso" for x in d.get("series", [])):
            for x in d["series"]:
                if x.get("estado") == "en-curso":
                    x.update(estado="abortada", motivo_fin="el proceso de la serie murió sin cerrarla", hasta=BL._a_iso(m.ahora()))
            m.escribir_json(SERIES, d)
        m.borrar(ORDEN)

        def _term(signo, marco):
            raise SystemExit(143)
        signal.signal(signal.SIGTERM, _term)
        serie = Serie(m, a.esc, a.rep, a.quien, a.para)
        est = serie.correr()
    return 0 if est["estado"] == "terminada" else 1


if __name__ == "__main__":
    sys.exit(main())
