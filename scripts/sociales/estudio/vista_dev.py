import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from servidor import Servidor
from captura import Sesion
escena, fmt_ancho, fmt_alto = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
import os
PARAMS=json.loads(os.environ.get("PARAMS","{}"))
tiempos = [float(x) for x in sys.argv[4].split(',')]
factor = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
esc3d = float(sys.argv[6]) if len(sys.argv) > 6 else 0.5
out = Path(sys.argv[7]) if len(sys.argv) > 7 else Path('/tmp/claude-0/-home-claude/c6c3fe09-bb47-5949-80f1-a88e70dee6cc/scratchpad/vista')
out.mkdir(parents=True, exist_ok=True)
paleta = {"zenith":"#007FFF","horizonte":"#10B981","logica":"#FFBF00","anchor":"#DC143C","nieve":"#F8F9FA"}
cfg = {"formato":{"id":"dev","ancho":fmt_ancho,"alto":fmt_alto,"margenes":{"arriba":269,"abajo":672,"izquierda":65,"derecha":100},"evitar":[]},
 "modo":"video","layout":"kinetico","escena":{"id":escena,"semilla":7,"params":PARAMS},"duracion":15,"fps":30,"idioma":"es","escala3d":esc3d,"calidad":"borrador",
 "textos":[{"t":0.3,"d":2.4,"kicker":"Fase Semilla","titular":"Todo comienza con una *semilla*","acento":"logica"},{"t":3,"d":3,"titular":"Un sistema operativo social, abierto y de *todos*","acento":"zenith"},{"t":6.4,"d":4,"lista":[{"texto":"Participa","color":"zenith","t":0},{"texto":"Voluntariado","color":"horizonte","t":1.1},{"texto":"Aporta código","color":"logica","t":2.2},{"texto":"Dona (pronto)","color":"anchor","t":3.3}]},{"t":11,"d":4,"fin":True,"sello":True,"titular":"Siembra con *nosotros*","cta":"starseed-os.vercel.app","acento":"horizonte"}],
 "paleta":paleta,"audio":{"pulsos":[2.7,4.2,5.7,6.4,7.5,8.6,9.7,11,12.5]},"marca":{"simbolo":"/repo/public/starseed-symbol.png","url":"starseed-os.vercel.app","nombre":"StarSeed"},"qr":None,"depurar": '--depurar' in sys.argv}
cfg.update(json.loads(os.environ.get('CFGX','{}')))
if os.environ.get('MARGENES'): cfg['formato']['margenes']=json.loads(os.environ['MARGENES'])
with Servidor() as srv:
    t0=time.time()
    with Sesion(srv, cfg, factor_captura=factor) as s:
        print("listo en", round(time.time()-t0,1), "s", s.consola[:5])
        for t in tiempos:
            t1=time.time(); s.render(t); png=s.captura(); (out/f"{escena}_{t:05.2f}.png").write_bytes(png); print(t, round(time.time()-t1,2),"s", len(png)//1024,"KB")
        print(s.consola[:10])
