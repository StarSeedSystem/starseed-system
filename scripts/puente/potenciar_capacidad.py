"""(1103 · U) «Potenciar» los medios que reparten su crédito o su cupo del mes.

Alex (2026-11-03): «los límites que se pone solo para repartir los créditos al mes no son siempre necesarios ya que
la prioridad es terminar lo antes posible las tareas enlistadas; si ocurre eso cuando selecciono buscar más
capacidades debe preguntarme si prefiero potencializar las tareas aumentando el consumo de los créditos mensuales
para cada caso de cualquier servicio de créditos o límites mensuales».

Esos repartos son NUESTROS, no del servicio: el crédito de Claude en la nube se reparte por día hasta que vence,
Cloudroom reparte sus 100 hilos de 30 días por día y GitHub deja de reabrir lo que ya se mandó tres veces. Cuando uno
de esos repartos deja tareas fuera, el medio deja aquí una PREGUNTA; Genesis la enseña al pulsar «Buscar más
capacidad» con dos botones: «⚡ Potenciar …» y «Mantener el ritmo de …».

- Potenciar vale `HORAS_POR_DEFECTO` horas: Claude en la nube gasta hoy todo lo que queda por encima de la reserva,
  Cloudroom usa lo que queda del ciclo sin reparto por día y GitHub reabre las agotadas con los escritores de hoy.
  Los topes REALES (hilos a la vez del plan, la reserva del crédito, la memoria de la Mac) no se tocan.
- Mantener el ritmo deja de preguntar por ese medio `HORAS_SIN_PREGUNTAR` horas.
- `STARSEED_POTENCIAR=todo` (o una lista: `claude-nube,cloudroom`) potencia sin preguntar, para una sesión a mano.

Uso: potenciar_capacidad.py activar|mantener <servicio> [--horas N] [--json] · potenciar_capacidad.py ver [--json]
"""
from __future__ import annotations

import fcntl
import json
import os
import sys
import time

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
RUTA = os.path.join(RAIZ, "starseed_memory_root", "mando", "potenciar.json")
SERVICIOS = {
    "claude-nube": "Claude en la nube",
    "cloudroom": "Cloudroom",
    "nube-gh": "GitHub Actions",
}
#: Qué hace potenciar en cada medio (lo que se le dice a Alex al pulsar).
EFECTO = {
    "claude-nube": "el crédito que queda por encima de la reserva vale para hoy (hasta 24 lanzamientos y 6 sesiones a la vez)",
    "cloudroom": "usa lo que queda del ciclo de 30 días sin reparto por día (sigue el tope de hilos a la vez del plan)",
    "nube-gh": "las tareas agotadas vuelven a GitHub con los escritores de hoy (hasta 3 veces más, una hora entre una y otra)",
}
HORAS_POR_DEFECTO = 24
HORAS_SIN_PREGUNTAR = 12
PREGUNTA_VALE_S = 6 * 3600


def _ruta(ruta=None):
    return ruta or os.environ.get("STARSEED_POTENCIAR_RUTA") or RUTA


def _vacio():
    return {"activos": {}, "mantener": {}, "preguntas": {}}


def _num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def normalizar(d):
    """PURA: el archivo con sus tres apartados siempre presentes (lo que no se entiende, vacío)."""
    d = d if isinstance(d, dict) else {}
    salida = {k: dict(v) for k, v in d.items() if isinstance(v, dict)}
    for k in ("activos", "mantener", "preguntas"):
        if not isinstance(salida.get(k), dict):
            salida[k] = {}
    return salida


def leer(ruta=None):
    try:
        with open(_ruta(ruta), encoding="utf-8") as f:
            return normalizar(json.load(f))
    except (OSError, ValueError):
        return _vacio()


def _guardar(d, ruta=None):
    ruta = _ruta(ruta)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _por_entorno(env=None):
    v = str((os.environ if env is None else env).get("STARSEED_POTENCIAR") or "").strip().lower()
    if v in ("1", "todo", "todos", "si", "sí"):
        return set(SERVICIOS)
    return {x.strip() for x in v.split(",") if x.strip() in SERVICIOS}


def activo(servicio, ahora=None, datos=None, env=None):
    """¿Está potenciado `servicio` ahora? PURA con `datos` y `env` dados."""
    if servicio in _por_entorno(env):
        return True
    ahora = time.time() if ahora is None else ahora
    d = leer() if datos is None else normalizar(datos)
    e = d["activos"].get(servicio)
    return isinstance(e, dict) and _num(e.get("hasta")) > ahora


def callado(servicio, ahora, datos):
    """PURA: ¿Alex dijo «mantener el ritmo» hace poco (no se vuelve a preguntar)?"""
    e = normalizar(datos)["mantener"].get(servicio)
    return isinstance(e, dict) and _num(e.get("hasta")) > ahora


def con_pregunta(datos, servicio, detalle, gasto, ahora):
    """PURA: copia de `datos` con la pregunta de `servicio`; la misma copia sin pregunta si el medio ya está
    potenciado o Alex dijo hace poco que mantenga el ritmo."""
    d = normalizar(json.loads(json.dumps(normalizar(datos))))
    if servicio not in SERVICIOS or activo(servicio, ahora, d, env={}) or callado(servicio, ahora, d):
        return d
    d["preguntas"][servicio] = {"nombre": SERVICIOS[servicio], "detalle": str(detalle or "")[:300],
                                "gasto": str(gasto or "")[:240], "t": ahora}
    return d


def preguntas_vigentes(datos, ahora):
    """PURA: [{servicio, nombre, detalle, gasto, t}] de las últimas `PREGUNTA_VALE_S` y sin decidir."""
    d = normalizar(datos)
    salida = []
    for s, p in sorted(d["preguntas"].items()):
        if s not in SERVICIOS or not isinstance(p, dict):
            continue
        if ahora - _num(p.get("t")) > PREGUNTA_VALE_S or activo(s, ahora, d, env={}) or callado(s, ahora, d):
            continue
        salida.append(dict(p, servicio=s, nombre=SERVICIOS[s]))
    return salida


def con_decision(datos, servicio, potenciar, ahora, horas=None):
    """PURA: copia con la decisión de Alex. Potenciar `horas` (24 por defecto, entre 1 h y 7 días) o mantener el
    ritmo (y no volver a preguntar en `HORAS_SIN_PREGUNTAR`). La pregunta de ese medio queda contestada."""
    d = normalizar(json.loads(json.dumps(normalizar(datos))))
    d["preguntas"].pop(servicio, None)
    if potenciar:
        h = HORAS_POR_DEFECTO if horas is None else max(1.0, min(24.0 * 7, float(horas)))
        d["activos"][servicio] = {"desde": ahora, "hasta": ahora + h * 3600, "quien": "Alex (Genesis)"}
        d["mantener"].pop(servicio, None)
    else:
        d["activos"].pop(servicio, None)
        d["mantener"][servicio] = {"desde": ahora, "hasta": ahora + HORAS_SIN_PREGUNTAR * 3600}
    return d


def texto_preguntas(preguntas):
    """PURA: el bloque que se añade a la respuesta de «Buscar más capacidad»."""
    if not preguntas:
        return ""
    lineas = ["¿Potenciar? Estos frenos son repartos NUESTROS del crédito o del cupo del mes, no del servicio "
              "(usa los botones de abajo):"]
    for p in preguntas:
        lineas.append("⚡ %s: %s · si potencias: %s" % (p.get("nombre"), p.get("detalle") or "frena por su ritmo",
                                                         p.get("gasto") or EFECTO.get(p.get("servicio"), "")))
    return "\n".join(lineas)


def _hora(t):
    return time.strftime("%H:%M del %d-%m", time.localtime(t))


def texto_decision(datos, servicio, ahora):
    """PURA salvo la zona horaria: lo que se le contesta a Alex al pulsar."""
    d = normalizar(datos)
    nombre = SERVICIOS.get(servicio, servicio)
    if activo(servicio, ahora, d, env={}):
        return "⚡ %s potenciado hasta las %s: %s." % (nombre, _hora(_num(d["activos"][servicio]["hasta"])),
                                                     EFECTO.get(servicio, ""))
    hasta = _num((d["mantener"].get(servicio) or {}).get("hasta"))
    return "%s sigue a su ritmo; no vuelvo a preguntar hasta las %s." % (nombre, _hora(hasta) if hasta else "?")


class _Cerrojo:
    def __init__(self, ruta=None):
        self.ruta = _ruta(ruta) + ".lock"

    def __enter__(self):
        os.makedirs(os.path.dirname(self.ruta), exist_ok=True)
        self.f = open(self.ruta, "a")
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        try:
            fcntl.flock(self.f, fcntl.LOCK_UN)
        finally:
            self.f.close()


def anotar_pregunta(servicio, detalle, gasto, ahora=None, ruta=None):
    """Guarda la pregunta de un medio. Nunca lanza: medir no tumba a quien mide."""
    try:
        ahora = time.time() if ahora is None else ahora
        with _Cerrojo(ruta):
            _guardar(con_pregunta(leer(ruta), servicio, detalle, gasto, ahora), ruta)
    except Exception:  # noqa: BLE001
        pass


def decidir(servicio, potenciar, horas=None, ahora=None, ruta=None):
    ahora = time.time() if ahora is None else ahora
    with _Cerrojo(ruta):
        d = con_decision(leer(ruta), servicio, potenciar, ahora, horas)
        _guardar(d, ruta)
    return d


def main(argv):
    uso = "uso: potenciar_capacidad.py activar|mantener <servicio> [--horas N] [--json] | ver [--json]"
    como_json = "--json" in argv
    args = [a for a in argv if a != "--json"]
    ahora = time.time()
    if args[:1] == ["ver"]:
        d = leer()
        r = {"ok": True, "datos": d, "preguntas": preguntas_vigentes(d, ahora),
             "activos": [s for s in SERVICIOS if activo(s, ahora, d)]}
        r["resumen"] = ("Potenciados: %s" % ", ".join(SERVICIOS[s] for s in r["activos"]) if r["activos"]
                        else "Ningún medio potenciado") + ("\n" + texto_preguntas(r["preguntas"]) if r["preguntas"] else "")
    elif args[:1] in (["activar"], ["mantener"]) and len(args) >= 2 and args[1] in SERVICIOS:
        horas = None
        if "--horas" in args:
            try:
                horas = float(args[args.index("--horas") + 1])
            except (IndexError, ValueError):
                raise SystemExit(uso)
        d = decidir(args[1], args[0] == "activar", horas, ahora)
        r = {"ok": True, "servicio": args[1], "resumen": texto_decision(d, args[1], ahora)}
    else:
        raise SystemExit(uso)
    print(json.dumps(r, ensure_ascii=False) if como_json else r["resumen"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
