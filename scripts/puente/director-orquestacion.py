#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El director que revisa y desatasca el enjambre sin que haya nadie delante.

El vigilante ya relanza el orquestador cuando muere, y el guardia reparte la RAM.
Faltaba lo que más veces ha frenado el trabajo: las tareas que terminan bien, pasan
escritura, tsc, tests y revisión, y se quedan esperando un «sí» humano que nadie da.
Ha pasado dos veces medidas: una tarea 5 h 20 min parada, y otras tres 166, 145 y 125
minutos. En los dos casos el enjambre no estaba roto: estaba esperándome a mí.

Cada `INTERVALO_S` el director:

  · APRUEBA lo que ya se ganó el sí. Una tarea en la puerta de aprobación, con la
    revisión en verde y más de `ESPERA_MIN` minutos quieta, se aprueba sola. Lo que
    NO tenga la revisión en verde se queda esperando: la puerta existe por algo.
  · DESATASCA lo que lleva demasiado bloqueado por una dependencia que ya está en main
    —el fallo de contabilidad que dejó una cola de 16 con 15 tareas ya hechas.
  · VIGILA lo que no puede arreglar: disco por debajo de 5 GB, memoria en el suelo,
    servicios caídos. Eso lo dice en el canal en vez de callárselo.
  · INFORMA cada hora, aunque no haya novedades. Un parte que no llega cuando todo va
    bien no sirve para saber si el sistema está vivo.

Todo lo que hace se anuncia en el canal común, así que se ve desde los cuatro IDE y
desde el Telegram.

  python3 scripts/puente/director-orquestacion.py
"""

import importlib.util, json, os, re, subprocess, sys, time
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
# La decisión de abrir sola una puerta de visto bueno vive en un módulo PURO, para que su
# puerta la pueda medir sin efectos (mismo patrón que `vigilante_logica.py`).
from aprobacion_logica import porque_no_verde as _verde
from escalada_logica import (
    siguiente_paso,
    aplicar,
    contar_gasto,
    en_asuntos,
    ESTADOS_RECUPERABLES,
)
from vigilante_logica import id_en_asuntos
import desatascar as _desatascar
from config_director import cargar as cargar_config
import prioridad_logica

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
INTERVALO_S = int(os.environ.get("STARSEED_DIRECTOR_S", "180"))
ESPERA_MIN = int(os.environ.get("STARSEED_ESPERA_APROBACION_MIN", "10"))
PARTE_CADA_S = int(os.environ.get("STARSEED_PARTE_S", "3600"))
#: (2026-09-25) Cada cuánto mira el director de consumo (vigia_consumo.py).
CONSUMO_CADA_S = int(os.environ.get("STARSEED_CONSUMO_S", "900"))
DISCO_MIN_GB = 5
PATRON_ORQ = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
)
_p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_p)

_SIN_HORA_AVISADOS = set()  # ids de tareas cuya falta de hora ya anunciamos


def progreso():
    try:
        with open(os.path.join(OLAS, "progreso.json"), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def cola_viva():
    return _p.cola_viva()


def aprobar(ids):
    """Escribe la orden por el mismo canal que usa cualquier IDE."""
    os.environ["STARSEED_QUIEN"] = "director"
    return _p.orden("aprobar", ids)


def revision_ok(entrada):
    """Verde = no queda ninguna razón para no aprobarla sola (módulo puro)."""
    return _verde(entrada) == ""


def porque_no_verde(entrada):
    """La razón corta de por qué NO se aprueba sola, o "" si sí."""
    return _verde(entrada)


def minutos_quieta(entrada, ahora, latido=None):
    try:
        t_str = entrada.get("t")
        if t_str:
            t = time.mktime(time.strptime(t_str, "%Y-%m-%d %H:%M:%S"))
            return (ahora - t) / 60
        if latido and isinstance(latido, dict) and "desde" in latido:
            desde = latido["desde"]
            return (ahora - desde) / 60
        return 0
    except Exception:
        return 0


def disco_gb():
    try:
        s = subprocess.run(
            ["df", "-g", "/System/Volumes/Data"],
            capture_output=True,
            text=True,
            timeout=20,
        ).stdout
        return int(s.splitlines()[1].split()[3])
    except Exception:
        return 999


def orquestador_vivo():
    try:
        s = subprocess.run(
            ["ps", "-eo", "args="], capture_output=True, text=True, timeout=20
        ).stdout
        return any(PATRON_ORQ.match(l) for l in s.splitlines())
    except Exception:
        return True


def _tareas_de_colas():
    """Las tareas tal y como están escritas en los archivos de cola (id → tarea).

    continuar_estancadas solo veía progreso.json, y progreso no sabe ni los archivos
    que toca una tarea ni de quién depende: sin eso no se puede ordenar con criterio.
    """
    tareas = {}
    try:
        for f in os.listdir(OLAS):
            if not (f.startswith("cola-") and f.endswith(".json")):
                continue
            with open(os.path.join(OLAS, f), encoding="utf-8") as fh:
                d = json.load(fh)
            for t in d if isinstance(d, list) else d.get("tareas", []):
                if isinstance(t, dict) and t.get("id") and t["id"] not in tareas:
                    tareas[t["id"]] = t
    except Exception:
        pass
    return tareas


def calcular_orden():
    """(listas, bloqueadas) de lo pendiente, según prioridad_logica.

    Pendiente aquí significa lo mismo que en pendientes_totales: no terminal y no
    ya en manos de alguien. El orden es determinista y explicable (ver razones).
    """
    from datetime import datetime

    TERMINAL = {
        "commit",
        "hecho",
        "bloqueante",
        "sustituida",
        "rechazada",
        "bloqueada",
        "reasignada",
        "en_curso",
        "esperando_aprobacion",
    }
    p = progreso()
    por_id = _tareas_de_colas()
    pend = [
        t
        for tid, t in por_id.items()
        if not (isinstance(p.get(tid), dict) and p[tid].get("estado") in TERMINAL)
    ]
    return prioridad_logica.ordenar(pend, p, datetime.now())


def escribir_orden(listas, bloqueadas):
    """Vuelca el orden calculado a mando/orden-tareas.json, atómico y a prueba de
    disco lleno: si falla la escritura el director sigue vivo (la auditoría no es
    más importante que la pasada)."""
    try:
        falta = re.compile(r"«([^»]+)»")
        datos = {
            "t": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "listas": [
                {"id": t.get("id"), "puntos": round(puntos, 1), "razones": razones}
                for t, puntos, razones in listas
            ],
            "bloqueadas": [
                {
                    "id": t.get("id"),
                    "falta": (
                        falta.search(motivo).group(1)
                        if falta.search(motivo or "")
                        else motivo
                    ),
                }
                for t, motivo in bloqueadas
            ],
        }
        carpeta = os.path.join(RAIZ, "starseed_memory_root", "mando")
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, "orden-tareas.json")
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(datos, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)
    except Exception as e:
        print("director/orden-tareas: %s: %s" % (type(e).__name__, e), flush=True)


def pendientes_totales():
    """Lo EJECUTABLE ahora, no todo lo que no ha terminado.

    (2026-09-14) El PARTE decía «76 pendientes» mientras el Mando decía 33 y
    progreso.json 10: esto contaba toda tarea no terminal de TODAS las colas,
    incluidas las cerradas y las bloqueadas por dependencia. Tres cifras
    distintas para la misma pregunta hacen que no te puedas fiar de ninguna.
    """
    TERMINAL = {
        "commit",
        "hecho",
        "bloqueante",
        "sustituida",
        "rechazada",
        "bloqueada",
        "reasignada",
        "en_curso",
        "esperando_aprobacion",
    }
    p, vistas, n = progreso(), set(), 0
    try:
        for f in os.listdir(OLAS):
            if not (f.startswith("cola-") and f.endswith(".json")):
                continue
            with open(os.path.join(OLAS, f), encoding="utf-8") as fh:
                d = json.load(fh)
            for t in d if isinstance(d, list) else d.get("tareas", []):
                if not isinstance(t, dict) or t.get("id") in vistas:
                    continue
                vistas.add(t["id"])
                e = p.get(t["id"])
                if not (isinstance(e, dict) and e.get("estado") in TERMINAL):
                    n += 1
    except Exception:
        pass
    return n


def reconciliar_estados():
    """Cierra en_curso rancios, marca commit lo que ya está en main y desbloquea a sus
    dependientes. Ver reconciliar_progreso.py: sin esto el Mando cuenta mentiras."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from reconciliar_progreso import ids_de_colas_fuente, reconciliar

        ruta = os.path.join(OLAS, "progreso.json")
        asuntos = subprocess.run(
            ["git", "log", "main", "--format=%s"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.splitlines()
        nuevo, cambios = reconciliar(
            progreso(),
            asuntos,
            orquestador_vivo(),
            ids_en_colas=ids_de_colas_fuente(OLAS),
        )
        if cambios:
            json.dump(
                nuevo, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1
            )
            _p.decir(
                "reconciliado progreso.json (%d): %s%s"
                % (
                    len(cambios),
                    " · ".join(cambios[:8]),
                    " …" if len(cambios) > 8 else "",
                ),
                "director",
                "hecho",
            )
        return cambios
    except Exception as e:
        print("director/reconciliar: %s: %s" % (type(e).__name__, e), flush=True)
        return []


def continuar_estancadas(tope=20):
    """Continúa sola lo atascado con escalera de reintentos: libre×2 → haiku×2 → sonnet.

    Solo actúa si no hay orquestador vivo. Lee progreso, asuntos de main,
    config, gasto y modelos anthropic; aplica siguiente_paso/aplicar/contar_gasto;
    escribe progreso y gasto atomicamente.

    Devuelve la lista de ids tocados para el parte.
    """
    if orquestador_vivo():
        return []

    try:
        # Leer estado
        p = progreso()
        asuntos = subprocess.run(
            ["git", "log", "main", "--format=%s"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.splitlines()
        cfg, avisos = cargar_config()
        hoy = time.strftime("%Y-%m-%d")
        ahora = time.strftime("%Y-%m-%d %H:%M:%S")

        # Leer modelos anthropic de env
        modelos_anthropic = []
        for env_file in [
            os.path.expanduser("~/.starseed/env"),
            os.path.expanduser("~/.hermes/.env"),
        ]:
            if os.path.exists(env_file):
                try:
                    with open(env_file, encoding="utf-8") as f:
                        for linea in f:
                            if linea.strip().startswith(
                                "STARSEED_PASARELA_ANTHROPIC_MODELOS="
                            ):
                                valor = linea.split("=", 1)[1].strip()
                                modelos_anthropic = [
                                    m.strip() for m in valor.split(",")
                                ]
                                break
                except Exception:
                    pass

        # Leer gasto
        ruta_gasto = os.path.join(OLAS, "escalada-gasto.json")
        gasto = {"fecha": hoy, "haiku": 0, "sonnet": 0}
        try:
            if os.path.exists(ruta_gasto):
                with open(ruta_gasto, encoding="utf-8") as fh:
                    gasto = json.load(fh)
        except Exception:
            pass

        # Procesar tareas recuperables, de MÁS a menos prioridad: reencolar las 20
        # primeras que aparecen en progreso dejaba al final justo a la que
        # desbloquea a otras cinco. El orden lo da prioridad_logica.ordenar, que
        # es determinista y deja razones en español (auditable sin ejecutar nada).
        from datetime import datetime

        por_id = _tareas_de_colas()
        candidatas = [
            tid
            for tid, entrada in p.items()
            if isinstance(entrada, dict)
            and entrada.get("estado") in ESTADOS_RECUPERABLES
            and not id_en_asuntos(tid, asuntos)
        ]
        tareas_cand = [por_id.get(tid) or {"id": tid} for tid in candidatas]
        listas, _bloq = prioridad_logica.ordenar(tareas_cand, p, datetime.now())
        ordenadas = [t.get("id") for t, _puntos, _razones in listas]

        p_nuevo = dict(p)
        gasto_nuevo = dict(gasto)
        tocadas = []
        bloqueantes_motivos = {}
        cuenta_por_tipo = {"libre": [], "haiku": [], "sonnet": [], "bloqueante": []}

        for tid in ordenadas:
            entrada = p.get(tid)
            if not isinstance(entrada, dict):
                continue
            if len(tocadas) >= tope:  # Tope por pasada: no reventar la cola de golpe
                break

            paso = siguiente_paso(
                entrada, gasto_nuevo, cfg, hoy, modelos_anthropic, ahora
            )
            if paso is None:
                continue

            # Aplicar cambios
            p_nuevo = aplicar(p_nuevo, tid, paso, ahora)
            gasto_nuevo = contar_gasto(gasto_nuevo, paso, hoy)
            tocadas.append(tid)

            # Clasificar para el reporte
            nivel = paso.get("cuenta") or (
                "bloqueante" if paso["estado"] == "bloqueante" else "libre"
            )
            if paso["estado"] == "bloqueante":
                bloqueantes_motivos[tid] = paso["motivo"]
            else:
                cuenta_por_tipo[nivel].append(tid)

        # Escribir atomicamente
        if tocadas:
            # Progreso
            ruta_prog = os.path.join(OLAS, "progreso.json")
            tmp_prog = ruta_prog + ".tmp"
            with open(tmp_prog, "w", encoding="utf-8") as fh:
                json.dump(p_nuevo, fh, ensure_ascii=False, indent=1)
            os.replace(tmp_prog, ruta_prog)

            # Gasto
            tmp_gasto = ruta_gasto + ".tmp"
            with open(tmp_gasto, "w", encoding="utf-8") as fh:
                json.dump(gasto_nuevo, fh, ensure_ascii=False, indent=1)
            os.replace(tmp_gasto, ruta_gasto)

            # Anuncio
            partes = []
            if cuenta_por_tipo["libre"]:
                partes.append("libre: %s" % ", ".join(cuenta_por_tipo["libre"][:3]))
            if cuenta_por_tipo["haiku"]:
                partes.append("haiku: %s" % ", ".join(cuenta_por_tipo["haiku"][:3]))
            if cuenta_por_tipo["sonnet"]:
                partes.append("sonnet: %s" % ", ".join(cuenta_por_tipo["sonnet"][:3]))

            tipo_aviso = "aviso" if bloqueantes_motivos else "hecho"
            mensaje = "continúo solo: %d a la cola (%s)" % (
                len(tocadas),
                "; ".join(partes),
            )

            if bloqueantes_motivos:
                motivo_bloq = list(bloqueantes_motivos.values())[0]
                mensaje += " · bloqueantes: %d (%s)" % (
                    len(bloqueantes_motivos),
                    motivo_bloq[:60],
                )

            _p.decir(mensaje, "director", tipo_aviso)

        return tocadas
    except Exception as e:
        print(
            "director/continuar_estancadas: %s: %s" % (type(e).__name__, e), flush=True
        )
        return []


def reintentar_sin_cambios(apartados=None, tope=3):
    # SUSTITUIDA por p319A (continuar_estancadas). Dejada por compatibilidad histórica.
    """Reencola las sin_cambios que no llegaron a main con otro proveedor.

    2026-09-12: cuatro tareas nuevas (p316E, MD7, zAR3, LT3) quedaron sin_cambios por
    un modelo que devolvió 1,5 KB y cero diff, y ninguna maquinaria las volvía a tocar.
    Máximo `tope` por pasada para no reventar la cola de golpe. `apartados` son los
    proveedores que el config manda no usar.

    2026-09-13: verifica la salud de proveedores: excluye a los caídos o sin cupo."""
    apartados = apartados or []
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from reintento_sin_cambios import candidatas, marcar, modelos_enjambre

        ruta_modelos = os.path.join(RAIZ, "scripts", "enjambre", "starseed-enjambre.py")
        modelos = [
            m
            for m in modelos_enjambre(ruta_modelos)
            if m.split("/", 1)[0] not in apartados
        ]

        # Leer salud de proveedores (vacío si falta el archivo)
        salud = {}
        try:
            ruta_salud = os.path.expanduser("~/.starseed/salud-proveedores.json")
            if Path(ruta_salud).exists():
                with open(ruta_salud, encoding="utf-8") as fh:
                    salud = json.load(fh)
        except Exception:
            pass

        # Hora actual en formato del orquestador
        ahora = time.strftime("%Y-%m-%d %H:%M:%S")

        asuntos = subprocess.run(
            ["git", "log", "main", "--format=%s"],
            cwd=RAIZ,
            capture_output=True,
            text=True,
            timeout=30,
        ).stdout.splitlines()
        p = progreso()
        elegidas = candidatas(p, asuntos, modelos, salud=salud, ahora=ahora)[:tope]
        for tid, modelo in elegidas:
            p = marcar(p, tid, modelo)
        if elegidas:
            ruta = os.path.join(OLAS, "progreso.json")
            json.dump(
                p, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1
            )
            _p.decir(
                "reintento de sin_cambios con otro proveedor: %s"
                % ", ".join("%s→%s" % (t, m) for t, m in elegidas),
                "director",
                "hecho",
            )
        return elegidas
    except Exception as e:
        print("director/reintento: %s: %s" % (type(e).__name__, e), flush=True)
        return []


def linea_orden():
    """«ORDEN · 1º x (porqué) · 2º y (porqué) · 3º z (porqué)», o "" sin pendientes.

    El parte ya dice cuántas quedan; sin esta línea no dice CUÁLES ni por qué en ese
    orden, que es justo lo que hay que mirar para discutirle la decisión al director.
    """
    try:
        listas, _bloq = calcular_orden()
        if not listas:
            return ""
        ordinal = ["1º", "2º", "3º"]
        trozos = []
        for i, (t, _puntos, razones) in enumerate(listas[:3]):
            porque = "; ".join(razones[:2]) if razones else "sin razón especial"
            trozos.append("%s %s (%s)" % (ordinal[i], t.get("id"), porque))
        return "ORDEN · " + " · ".join(trozos)
    except Exception:
        return ""


def revisar():
    """Una pasada. Devuelve la lista de cosas hechas, para el parte."""
    hecho, ahora = [], time.time()
    if reconciliar_estados():
        hecho.append("reconciliado")
    continuadas = continuar_estancadas()
    if continuadas:
        hecho.append("continuadas %d" % len(continuadas))
    # El orden calculado queda en disco cada pasada, para auditarlo sin ejecutar
    # nada. Si el disco falla, se traga el error y la pasada sigue.
    try:
        listas, bloqueadas = calcular_orden()
        escribir_orden(listas, bloqueadas)
    except Exception as e:
        print("director/orden: %s: %s" % (type(e).__name__, e), flush=True)
    p = progreso()

    # (2026-09-13) Desatascar lo que paraba el enjambre y nadie recogía: árbol
    # sucio con estorbos, orquestador vivo pero sin avanzar, trabajadores
    # colgados. Aquí NUNCA se aprueba una puerta: solo se ejecuta un veredicto
    # que ya estaba dado. Ver scripts/puente/desatascar.py.
    try:
        for frase in _desatascar.desatascar(RAIZ, orquestador_vivo(), 0, p):
            _p.decir(
                frase, "director", "error" if frase.startswith("ATASCO") else "hecho"
            )
            hecho.append("desatasco")
    except Exception as e:
        print("desatascar: %s: %s" % (type(e).__name__, e), flush=True)

    _, latidos_dict, _ = cola_viva()
    latidos_tareas = (latidos_dict or {}).get("tareas", {})

    esperando = [
        (k, v)
        for k, v in p.items()
        if isinstance(v, dict) and v.get("estado") == "esperando_aprobacion"
    ]
    maduras = [
        k
        for k, v in esperando
        if revision_ok(v)
        and minutos_quieta(v, ahora, latido=latidos_tareas.get(k)) >= ESPERA_MIN
    ]
    sin_revision = [(k, porque_no_verde(v)) for k, v in esperando if not revision_ok(v)]

    sin_hora = [
        k
        for k, v in esperando
        if k not in _SIN_HORA_AVISADOS and not v.get("t") and k not in latidos_tareas
    ]
    for tid in sin_hora:
        _SIN_HORA_AVISADOS.add(tid)
        _p.decir(
            "sin hora para %s: no puedo medir su espera" % tid,
            "director",
            "aviso",
        )

    if maduras:
        aprobar(maduras)
        _p.decir(
            "aprobadas solas tras %d min con la revisión en verde: %s"
            % (ESPERA_MIN, ", ".join(maduras)),
            "director",
            "hecho",
        )
        hecho.append("aprobadas %d" % len(maduras))
    if sin_revision:
        # Cada una con SU razón: un aviso que solo dice «no las apruebo» no le sirve a nadie
        # para decidir, y además enseña a saltarse la puerta.
        _p.decir(
            "en la puerta y NO las apruebo — %s"
            % "; ".join("%s: %s" % (k, r) for k, r in sin_revision),
            "director",
            "aviso",
        )

    gb = disco_gb()
    if gb < DISCO_MIN_GB:
        _p.decir(
            "DISCO al límite: quedan %d GB. Con el disco lleno SQLite se corrompe y los "
            "procesos mueren; ya pasó una vez y se llevó por delante la base de Hermes."
            % gb,
            "director",
            "error",
        )
        hecho.append("aviso de disco")
    return hecho


def linea_consumo():
    """Una línea del director de consumo para el parte (lo último que midió)."""
    try:
        import vigia_consumo
        with open(vigia_consumo.SALIDA, encoding="utf-8") as f:
            return "consumo · " + vigia_consumo.resumen(json.load(f))
    except Exception:
        return ""


def main():
    print(
        "Director de orquestación · revisa cada %ds · aprueba tras %d min · parte cada %d min"
        % (INTERVALO_S, ESPERA_MIN, PARTE_CADA_S // 60)
    )
    _p.decir(
        "Director de orquestación en marcha: apruebo lo que ya pasó su revisión, desatasco "
        "lo que lleva demasiado parado y doy parte cada hora, haya novedades o no.",
        "director",
        "hecho",
    )
    ultimo_parte = 0
    ultimo_consumo = 0
    while True:
        try:
            revisar()
            # (2026-09-25) Alex: «los directores deben supervisar que no haya medios donde se
            # desperdicien créditos o datos de ningún tipo». Mide sin gastar tráfico.
            if time.time() - ultimo_consumo >= CONSUMO_CADA_S:
                ultimo_consumo = time.time()
                subprocess.Popen(
                    [sys.executable, os.path.join(DIRECTORIO, "vigia_consumo.py")],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
            if time.time() - ultimo_parte >= PARTE_CADA_S:
                ultimo_parte = time.time()
                cola, lat, _ = cola_viva()
                vivos = len((lat or {}).get("tareas", {}))
                orden = linea_orden()
                _p.decir(
                    "PARTE · orquestador %s · %d tareas en el latido · %d pendientes en total "
                    "· disco %d GB%s"
                    % (
                        "vivo" if orquestador_vivo() else "PARADO",
                        vivos,
                        pendientes_totales(),
                        disco_gb(),
                        # Sin pendientes no hay línea ORDEN: el canal no se llena de ruido.
                        ("\n" + orden if orden else "") + ("\n" + linea_consumo() if linea_consumo() else ""),
                    ),
                    "director",
                    "mensaje",
                )
                # (2026-09-25) Con el parte, la revisión de dirección con Opus: va en segundo
                # plano (Opus tarda) y decide sola si toca, si hay cupo y si algo cambió.
                if os.environ.get("STARSEED_OPUS_DIRECTOR", "1") != "0":
                    subprocess.Popen(
                        [sys.executable, os.path.join(DIRECTORIO, "revision_opus.py")],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True,
                    )
        except Exception as e:
            print("director: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
