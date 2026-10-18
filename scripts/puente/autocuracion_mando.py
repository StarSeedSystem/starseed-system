def revisar(ids, libre, estado, avisar_fn, hechos, DISCO_AVISO_GB=2):
    import time, limpieza_worktrees
    ids = (lambda libre: [])(libre)
    if libre < 2 * DISCO_AVISO_GB or (time.time() - estado.get("ultima_limpieza_wt", 0)) > 86400:
        try:
<<<<<<< HEAD
            return fn()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def _escribir_json(ruta, datos):
    tmp = ruta + ".tmp-autocuracion"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def _ordenar_refresco(cola):
    """Deja la orden `refrescar_proveedores` en el archivo de control de la tanda viva."""
    ruta = os.path.join(OLAS, "control-" + cola)

    def poner():
        ordenes = _leer_json(ruta, {})
        if not isinstance(ordenes, dict):
            ordenes = {}
        ordenes["_flota"] = {"accion": "refrescar_proveedores", "quien": "director-autocuracion",
                             "t": time.strftime("%Y-%m-%d %H:%M:%S")}
        _escribir_json(ruta, ordenes)

    _con_cerrojo("control-control-" + cola, poner)


def _levantar_y_perdonar(aptos):
    """Quita marcas viejas de «sin cupo» y rachas de cuelgue de quien responde a la sonda."""
    ahora_txt = time.strftime("%Y-%m-%d %H:%M:%S")
    levantados, perdonados = [], []

    def salud():
        nonlocal levantados
        nueva, levantados = levantar_marcas(_leer_json(SALUD, {}), aptos, ahora_txt)
        if levantados:
            _escribir_json(SALUD, nueva)

    def colgados():
        nonlocal perdonados
        nuevo, perdonados = perdonar_colgados(_leer_json(COLGADOS, {}), aptos)
        if perdonados:
            _escribir_json(COLGADOS, nuevo)

    try:
        _con_cerrojo("salud", salud)
    except Exception:
        pass
    try:
        colgados()
    except Exception:
        pass
    return levantados, perdonados


def _reiniciar_orquestador():
    """SIGTERM al orquestador: el vigilante lo relanza en ≤ 90 s con `--reanudar`."""
    import signal

    pids = [pid for pid, _ in _procesos_orquestador()]
    for pid in pids:
        os.kill(pid, signal.SIGTERM)
    return pids


def _servicios():
    """Los servicios com.starseed.* que deben estar siempre vivos (paso 1 del reactivador)."""
    import reactivar_mando
    return reactivar_mando.paso_servicios()


def curar_enjambre(estado, ahora, forzar=False, latido_fn=None, sondear_fn=_sondear_escritores,
                   ordenar_fn=_ordenar_refresco, reiniciar_fn=_reiniciar_orquestador,
                   levantar_fn=_levantar_y_perdonar, avisar_fn=None, cola_fn=_cola_viva,
                   medidores_fn=None):
    """Punto 6 del docstring. Modifica `estado` y devuelve una línea de lo que hizo (o "")."""
    avisar_fn = avisar_fn or _avisar
    cola = cola_fn()
    if not cola:
        return ""
    tareas = (latido_fn or _latido_tareas)(cola)
    diag = diagnostico_atasco(tareas, ahora)
    estado["enjambre"] = {"esperando": len(diag["esperando"]), "trabajando": len(diag["trabajando"]),
                          "largas": [t for t, _ in diag["largas"]]}
    if not (diag["atascada"] or (forzar and diag["esperando"])):
        return ""
    sonda = estado.get("sonda") or {}
    if forzar or ahora - float(sonda.get("t") or 0) >= SONDA_VALIDA_S:
        resultados = sondear_fn() or []
        sonda = {"t": ahora, "aptos": aptos_de_sonda(resultados),
                 "no": sorted({m.split("/", 1)[0] for m, a, _, _ in resultados if not a})}
        estado["sonda"] = sonda
    aptos = list(sonda.get("aptos") or [])
    if medidores_fn:
        # El medidor de crédito por terminal es tan buena prueba como la sonda (y gratis).
        try:
            aptos = sorted(set(aptos) | set(medidores_fn(ahora) or []))
        except Exception:
            pass
    accion, porque = decidir_atasco(diag, bool(aptos), estado, ahora, forzar)
    largas = ", ".join("%s (%d min)" % (t, s // 60) for t, s in diag["largas"][:4]) or \
        ", ".join(t for t, _ in diag["esperando"][:4])
    if accion == "refrescar":
        levantados, perdonados = levantar_fn(aptos)
        ordenar_fn(cola)
        estado["ultimo_refresco"] = ahora
        linea = ("enjambre: %s esperaba(n) proveedor con %s pudiendo escribir → orden de refrescar "
                 "proveedores%s%s" % (largas, ", ".join(aptos),
                                       "; marca vieja de «sin cupo» levantada: %s" % ", ".join(levantados) if levantados else "",
                                       "; rachas de cuelgue perdonadas: %d" % len(perdonados) if perdonados else ""))
        avisar_fn("Autocuración: " + linea + ".")
        return linea
    if accion == "reiniciar":
        levantar_fn(aptos)
        pids = reiniciar_fn()
        estado["ultimo_reinicio_orq"] = ahora
        linea = "enjambre: %s; reinicio el orquestador (%s) y el vigilante lo relanza" % (
            porque, ", ".join(str(p) for p in pids) or "no encontré su proceso")
        avisar_fn("Autocuración: " + linea + ".")
        return linea
    if accion == "esperar" and not aptos:
        # Una vez por hora como mucho: esperar sin cupo no es un fallo, pero se dice.
        if forzar or ahora - float(estado.get("ultimo_aviso_sin_cupo") or 0) >= 3600:
            estado["ultimo_aviso_sin_cupo"] = ahora
            linea = "enjambre: %s espera(n) proveedor y la sonda no ve ningún escritor con cupo (%s); no toco nada" % (
                largas, ", ".join(sonda.get("no") or []) or "sin datos")
            avisar_fn("Autocuración: " + linea + ".")
            return linea
    return "enjambre: %s" % porque if forzar else ""


def revisar(ahora=None, sondear_fn=sondear, reiniciar_fn=_reiniciar, limpiar_fn=limpiar,
            libre_fn=espacio_libre_gb, avisar_fn=_avisar, dormir=time.sleep, asignar_fn=_asignar,
            buscar_fn=_buscar, traer_fn=_traer_en_fondo, forzar=False, curar_fn=None,
            servicios_fn=_servicios, medidores_fn=_levantar_por_medidores):
    """Una pasada completa. Devuelve lo que vio y lo que hizo (también queda en ESTADO).
    `forzar` (el botón «Reactivar directores»): todo ya, sin los tiempos mínimos."""
    ahora = ahora if ahora is not None else time.time()
    estado = _leer_json(ESTADO, {}) if ESTADO else {}
    hechos = []

    sondas = []
    for i in range(SONDAS):
        ok = sondear_fn()
        sondas.append(ok)
        if ok:
            break
        if i < SONDAS - 1:
            dormir(ESPERA_ENTRE_SONDAS_S)
    reiniciar, porque = decidir_reinicio(
        sondas, ahora, estado.get("ultimo_reinicio"),
        publicacion_en_marcha(_leer_json(PUBLICACION, {})))
    if reiniciar:
        try:
            reiniciar_fn()
            estado["ultimo_reinicio"] = ahora
            hechos.append("Genesis reiniciado: %s" % porque)
            avisar_fn("Autocuración: Genesis %s y lo he reiniciado solo." % porque)
        except Exception as e:
            hechos.append("no pude reiniciar Genesis: %s" % e)

    libre = libre_fn()
    ids = ids_a_limpiar(libre)
    if ids and (forzar or ahora - (estado.get("ultima_limpieza") or 0) >= LIMPIEZA_MINIMA_S):
        r = limpiar_fn(ids)
        estado["ultima_limpieza"] = ahora
        limpiados = r.get("limpiados") or []
        hechos.append("disco con %.1f GB: limpiado %s" % (libre, ", ".join(limpiados) or (r.get("detalle") or "nada")))
        if limpiados:
            avisar_fn("Autocuración: quedaban %.1f GB libres y limpié lo regenerable (%s)." % (libre, ", ".join(limpiados)))
        try:  # y lo que su lista blanca no ve; con una limpiar_fn inyectada (pruebas) no se toca el disco real
            import limpieza_caches as LC
            hecho = LC.aplicar(LC.plan(**LC.recoger(libre_fn())), LC.borrar, LC.recortar) if limpiar_fn is limpiar else []
            if hecho:
                hechos.append("disco con %.1f GB: %s" % (libre, LC.resumen(hecho)))
                avisar_fn("Autocuración: %s." % LC.resumen(hecho))
        except Exception as e:
            hechos.append("no pude limpiar las cachés fuera de la lista blanca: %s: %s" % (type(e).__name__, e))

    # Trabajadores parados con trabajo que se puede desatascar: se llenan solos.
    if any(sondas):
        try:
            decision, aplicar = asignar_fn()
            llenar, porque_ll = decidir_llenado(decision, ahora,
                                                None if forzar else estado.get("ultimo_llenado"))
            if llenar:
                hechas = aplicar() or []
                estado["ultimo_llenado"] = ahora
                hechos.append("capacidad: %s" % porque_ll)
                avisar_fn("Autocuración: %s (%s)." % (porque_ll, "; ".join(hechas)[:400]))
        except Exception as e:
            hechos.append("no pude llenar los huecos: %s: %s" % (type(e).__name__, e))

    # Más capacidad fuera de la Mac (la nube), como el botón de Genesis, cada 30 min.
    if any(sondas):
        toca, _porque_b = decidir_busqueda(ahora, None if forzar else estado.get("ultima_busqueda"))
        if toca:
            estado["ultima_busqueda"] = ahora
            try:
                r = buscar_fn() or {}
                if r.get("sumados"):
                    hechos.append("capacidad fuera de la Mac: %s" % "; ".join(r.get("hechas") or [])[:300])
            except Exception as e:
                hechos.append("no pude buscar capacidad: %s: %s" % (type(e).__name__, e))

    # Traer a main lo que hizo la nube y reparar lo que dejó a medias (en segundo plano).
    if any(sondas):
        toca, _porque_t = decidir_busqueda(ahora, None if forzar else estado.get("ultimo_traer"),
                                           TRAER_MINIMO_S)
        if toca:
            estado["ultimo_traer"] = ahora
            try:
                traer_fn()
                hechos.append("traer la nube: pasada lanzada en segundo plano")
            except Exception as e:
                hechos.append("no pude lanzar traer la nube: %s: %s" % (type(e).__name__, e))

    # Servicios caídos (cada 10 min; con `forzar` los revisa el propio reactivador).
    if not forzar and ahora - float(estado.get("ultimos_servicios") or 0) >= SERVICIOS_MINIMO_S:
        estado["ultimos_servicios"] = ahora
        try:
            r = servicios_fn() or {}
            if r.get("estado") in ("reparado", "fallo"):
                hechos.append("servicios: %s" % r.get("detalle"))
                avisar_fn("Autocuración: servicios de Genesis — %s." % r.get("detalle"))
        except Exception as e:
            hechos.append("no pude revisar los servicios: %s: %s" % (type(e).__name__, e))

    # Marcas viejas de «sin cupo» que el medidor de crédito desmiente (cada pasada; gratis).
    try:
        levantados = medidores_fn(ahora) or []
        if levantados:
            linea = "medidores: %s vuelve(n) a tener cupo según su medidor; levanto su marca vieja de «sin cupo»" % (
                ", ".join(levantados))
            hechos.append(linea)
            avisar_fn("Autocuración: " + linea + ".")
    except Exception as e:
        hechos.append("no pude leer los medidores de crédito: %s: %s" % (type(e).__name__, e))

    # Enjambre atascado esperando proveedores que ya volvieron (punto 6).
    try:
        linea = (curar_fn(estado, ahora, forzar) if curar_fn
                 else curar_enjambre(estado, ahora, forzar, medidores_fn=_aptos_medidores))
        if linea:
            hechos.append(linea)
    except Exception as e:
        hechos.append("no pude revisar el enjambre: %s: %s" % (type(e).__name__, e))

    estado.update({"visto": time.strftime("%Y-%m-%d %H:%M:%S"), "responde": any(sondas),
                   "por_que": porque, "libre_gb": None if libre is None else round(libre, 1),
                   "hechos": hechos})
    _guardar(estado)
    return estado


if __name__ == "__main__":
    print(json.dumps(revisar(), ensure_ascii=False, indent=1))
=======
            w = limpieza_worktrees.recoger(estado["raiz_wt"], estado["repo"], estado["git_fn"]); p = limpieza_worktrees.plan(w, estado["progreso"], estado["en_curso"]); r = limpieza_worktrees.aplicar(p, estado["repo"], estado["git_fn"], estado["rmtree_fn"])
            if r["quitados"] or r["nm_borrados"]: avisar_fn(f"Autocuración: quité {len(r['quitados'])} worktrees cerrados y {len(r['nm_borrados'])} node_modules duplicados.")
            estado["ultima_limpieza_wt"] = time.time()
        except Exception as e: hechos.append(str(e))
>>>>>>> 1ed6d627 (salvavidas · CNS1010W: trabajo del agente antes de las puertas (tsc / vitest))
