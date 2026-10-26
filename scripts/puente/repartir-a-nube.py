#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparto del atraso a la nube: la Mac elige, versiona la cola y la marca.

La nube arranca sin estado (`starseed_memory_root/` no viaja), así que el
atraso se materializa como `enjambre/colas/cola-nube-<AAAAMMDD>.json`, que viaja
a la nube en un commit suelto a su rama `colas/nube-*` (nunca en main, ver
`cola_en_rama.py`), y la Mac marca cada id `reasignada · nube` para no duplicarlo.

Uso:
  repartir-a-nube.py [--tope N] [--simular] [--publicar]

  --simular   solo imprime lo que haría (no escribe ni toca git)
  --publicar  (retirado 2026-09-24) ya no commitea ni empuja main: dice cómo
              lanzarla con `nube-gh.py lanzar --cola`
"""

import argparse, datetime, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puente
from repartir_nube import elegir, marcar

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "enjambre")
)
try:
    from cambio_pedido import aplicar_a_todas
except ImportError:  # pragma: no cover

    def aplicar_a_todas(tareas, progreso):
        return list(tareas or [])


from vigilante_logica import es_cola_de_codigo

RAIZ = os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
DESTINO_DIR = os.path.join(RAIZ, "enjambre", "colas")


def validar_raiz(raiz):
    """STARSEED_ROOT debe ser un repo con carpeta de colas; si no, se aborta."""
    if not os.path.isdir(os.path.join(raiz, ".git")) or not os.path.isdir(
        os.path.join(raiz, "enjambre", "colas")
    ):
        raise SystemExit(
            "reparto: STARSEED_ROOT inválido (%s): falta .git o enjambre/colas" % raiz
        )


def nombre_destino(ahora, destino_dir):
    """cola-nube-<AAAAMMDD-HHMM>.json; si ya existe, sufijo -2, -3... Nunca sobrescribe."""
    base = "cola-nube-%s" % ahora.strftime("%Y%m%d-%H%M")
    nombre, i = base + ".json", 1
    while os.path.exists(os.path.join(destino_dir, nombre)):
        i += 1
        nombre = "%s-%d.json" % (base, i)
    return nombre


def asuntos_main(raiz):
    """Asuntos de main; si git falla se aborta (nunca lista vacía silenciosa)."""
    r = subprocess.run(
        ["git", "log", "main", "--format=%s"], cwd=raiz, capture_output=True, text=True
    )
    if r.returncode != 0:
        raise SystemExit(
            "reparto: git log falló (%s): %s" % (r.returncode, r.stderr.strip())
        )
    return r.stdout.splitlines()


def colas_fuente():
    vivos = [
        n
        for n in os.listdir(OLAS)
        if es_cola_de_codigo(n) and not n.startswith("cola-nube-")
    ]
    vivos.sort(key=lambda n: os.path.getmtime(os.path.join(OLAS, n)), reverse=True)
    salida = []
    for nombre in vivos:
        ruta = os.path.join(OLAS, nombre)
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
        except (OSError, ValueError):
            continue
        tareas = datos.get("tareas", datos) if isinstance(datos, dict) else datos
        if isinstance(tareas, list):
            salida.append((nombre, tareas))
    return salida


def ola_actual(colas):
    """La ola de la cola viva más reciente: la que se queda en la Mac."""
    if not colas:
        return ""
    m = re.search(r"cola-(\d+)", colas[0][0])
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tope", type=int, default=20)
    ap.add_argument("--simular", action="store_true")
    ap.add_argument("--publicar", action="store_true")
    ap.add_argument("--ceder", action="store_true",
                    help="ceder a la nube lo que la tanda de la Mac no alcanza pronto (CAP1010)")
    args = ap.parse_args()

    # (2026-10-04) Con la nube en pausa nadie reparte: ni el director de la nube ni el vigía.
    # «0 tareas» es justo lo que el vigía mira para no desplegar.
    from repartir_nube import nube_pausada
    pausa = nube_pausada()
    if pausa:
        print("[reparto] nube en pausa (%s): 0 tareas" % pausa)
        return

    validar_raiz(RAIZ)
    colas = colas_fuente()
    progreso = {}
    if os.path.exists(PROGRESO):
        with open(PROGRESO, encoding="utf-8") as f:
            progreso = json.load(f)
    asuntos = asuntos_main(RAIZ)
    # (2026-09-23) La nube no ve el progreso de la Mac: el cambio pedido desde Genesis
    # (prompt y dependencias quitadas) se hornea DENTRO de la cola que se le manda.
    colas = [(nombre, aplicar_a_todas(tareas, progreso)) for nombre, tareas in colas]
    # (2026-09-24) Lo que ya se mandó 3 veces sin integrarse no se vuelve a mandar.
    # (2026-10-05) Menos las reaperturas del botón «Buscar más capacidad» (`buscar_capacidad.py`):
    # una tarea que agotó sus envíos con los proveedores saturados recupera uno.
    from repartir_nube import envios_vigentes

    envios = envios_vigentes(DESTINO_DIR)
    # (2026-10-08) Lo que ya está en la tanda viva de la Mac se queda en la Mac (RM6b, doble).
    # (2026-10-10, CAP1010) …salvo lo que la Mac no va a alcanzar pronto, con `--ceder`: la Mac
    # se guarda sus próximas rondas y lo demás que nadie espera se cede; el orquestador de la
    # Mac lo suelta por su archivo de control cuando el run ya existe (`nube-gh.py lanzar`).
    import repartir_nube as RN
    try:
        procesos = subprocess.run(["ps", "-axo", "args="], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        procesos = ""
    colas_mac = RN.colas_de_la_tanda_viva(procesos, OLAS)
    tanda = {i for _n, ids in colas_mac for i in ids}
    ajenas = RN.leer_prestadas()  # lo que MetaGenesis prestó a otro medio: ni se cede ni se reparte
    # (2026-10-12, CAPC1011Bc, medido el 11 a las 21:15) Antes solo se cedían las listas que
    # NADIE esperaba: tanda de 202, la Mac se quedaba 27 y cedía 1; Actions y el A1 parados.
    # Ahora `cedibles_y_lote` une las sueltas con las CADENAS enteras (`cadenas_cedibles`), y
    # `mismo_lote=lote` hace que una cadena viaje entera conservando su `depende` interno.
    cedibles, lote = [], set()
    if args.ceder and tanda:
        try:
            import asignar_huecos

            cedibles, lote = RN.cedibles_y_lote(tanda, asignar_huecos.reunir(), colas,
                                                progreso, ajenas)
        except Exception as e:  # sin la foto de la Mac no se cede nada: como antes
            print("[reparto] no pude medir la Mac para ceder (%s): no cedo nada" % type(e).__name__)
            cedibles, lote = [], set()
    # (2026-10-26, CAP1026E) Ni lo que ya viaja en una cola de la nube de la última hora y cuarto:
    # el progreso de esas tareas puede decir «pendiente» un rato (lo pisa la foto de la Mac hasta
    # que procesa el «soltar») y se mandaban a dos o tres jobs seguidos.
    ahora_ts = datetime.datetime.now().timestamp()
    vuelo = RN.en_vuelo(RN.leer_colas_nube(DESTINO_DIR, ahora_ts), ahora_ts)
    if vuelo:
        print("[reparto] en vuelo en la nube (colas de la última hora y cuarto): %d tarea(s), no se reenvían"
              % len(vuelo))
    colas = RN.sin_lo_de_la_mac(colas, tanda, cedibles, set(ajenas or ()) | vuelo)
    elegidas = elegir(colas, progreso, asuntos, ola_actual(colas), tope=args.tope,
                      envios=envios, mismo_lote=lote)
    # Una cadena que no cabe entera en el tope de este envío no se manda (mandar la mitad deja
    # reasignada la cabeza y varados los dependientes); las demás cadenas sí (2026-10-13).
    elegidas = RN.sin_cadenas_partidas(elegidas, lote, colas)
    cedidas = [t["id"] for t in elegidas if t["id"] in set(cedibles)]
    if tanda:
        print("[reparto] tanda viva de la Mac: %d tarea(s); cedibles %d; cedidas a la nube %d (%s)"
              % (len(tanda), len(cedibles), len(cedidas), ", ".join(cedidas) or "ninguna"))
    ahora = datetime.datetime.now()
    fecha = ahora.strftime("%Y%m%d")
    mensaje = "Reparto a la nube %s: %d tareas (%s)" % (
        fecha,
        len(elegidas),
        ", ".join(t["id"] for t in elegidas) or "ninguna",
    )

    if args.simular or not elegidas:
        print("[reparto] %s (simulación)" % mensaje)
        return
    os.makedirs(DESTINO_DIR, exist_ok=True)
    nombre = nombre_destino(ahora, DESTINO_DIR)
    ruta = os.path.join(DESTINO_DIR, nombre)
    datos = {"ola": "nube-%s" % fecha, "tareas": elegidas}
    if cedidas:
        # Quién las tenía: `nube-gh.py lanzar` manda el «soltar» a ESAS colas de la Mac.
        datos["cedidas_de_la_mac"] = {n: [i for i in ids if i in set(cedidas)] for n, ids in colas_mac
                                      if any(i in set(cedidas) for i in ids)}
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    # Quien lanza (`nube-gh.py lanzar`) lee ESTA línea para saber qué cola subir (2026-10-13).
    print("[reparto] cola: enjambre/colas/%s" % nombre)
    nuevo = marcar(progreso, [t["id"] for t in elegidas], fecha)
    with open(PROGRESO, "w", encoding="utf-8") as f:
        json.dump(nuevo, f, ensure_ascii=False, indent=1)
    puente.decir(mensaje, quien="reparto-nube", tipo="hecho")

    if args.publicar:
        # (2026-09-24) Ya no: commitear la cola en main y empujar main es lo que llenó
        # «Sin publicar» con 36 repartos repetidos (y empujaba código sin puertas). La
        # cola viaja en un commit suelto: `nube-gh.py lanzar --cola <ruta>`.
        print("[reparto] --publicar ya no commitea en main: usa "
              "`python3 scripts/puente/nube-gh.py lanzar --cola enjambre/colas/%s`" % nombre)
    print("[reparto] " + mensaje)


if __name__ == "__main__":
    # Un solo repartidor a la vez (nube, A1): ver `repartir_nube.CerrojoReparto`.
    from repartir_nube import CerrojoReparto

    with CerrojoReparto():
        main()
