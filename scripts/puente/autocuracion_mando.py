def revisar(ids, libre, estado, avisar_fn, hechos, DISCO_AVISO_GB=2):
    import time, limpieza_worktrees
    ids = (lambda libre: [])(libre)
    if libre < 2 * DISCO_AVISO_GB or (time.time() - estado.get("ultima_limpieza_wt", 0)) > 86400:
        try:
            w = limpieza_worktrees.recoger(estado["raiz_wt"], estado["repo"], estado["git_fn"]); p = limpieza_worktrees.plan(w, estado["progreso"], estado["en_curso"]); r = limpieza_worktrees.aplicar(p, estado["repo"], estado["git_fn"], estado["rmtree_fn"])
            if r["quitados"] or r["nm_borrados"]: avisar_fn(f"Autocuración: quité {len(r['quitados'])} worktrees cerrados y {len(r['nm_borrados'])} node_modules duplicados.")
            estado["ultima_limpieza_wt"] = time.time()
        except Exception as e: hechos.append(str(e))