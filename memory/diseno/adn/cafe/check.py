#!/usr/bin/env python3
import json, re, sys
def rgb(h):h=h.lstrip("#");return tuple(int(h[i:i+2],16)for i in(0,2,4))if len(h)==6 else tuple(int(c*2,16)for c in h)
def lum(h):r,g,b=rgb(h);return.2126*((r/255)/12.92if(r/255)<=0.04045else((r/255+0.055)/1.055)**2.4)+.7152*((g/255)/12.92if(g/255)<=0.04045else((g/255+0.055)/1.055)**2.4)+.0722*((b/255)/12.92if(b/255)<=0.04045else((b/255+0.055)/1.055)**2.4)
def con(a,b):x,y=sorted([lum(a),lum(b)],reverse=True);return(x+0.05)/(y+0.05)
def px(v,u):return float(v)*16if u in("rem","em")else float(v)*1.333if u=="pt"else float(v)
try:d=json.load(sys.stdin)
except:d={}
f=sorted({round(float(x),1)for x in d.get("font-sizes",[])})
c=[x for x in d.get("colors",[])if re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',x)]
c=[x if len(x)==7else"#"+"".join(y*2for y in x[1:])for x in c]
r={}
r["p2"]=("aprobado"if len(f)<=3else"fallo",f"{len(f)} tamaños: {f}")if f else("manual","no se proporcionaron tamaños de fuente")
r["p3"]=("aprobado"if len(f)>=2and f[0]>0and f[-1]/f[0]>=6else"fallo",f"mayor/menor = {f[-1]/f[0]:.2f}")if len(f)>=2else("fallo"if len(f)>=2else"manual",f"tamaño mínimo cero o negativo"if len(f)>=2else"se necesitan al menos dos tamaños de fuente")
r["p4"]=("aprobado"if f and f[0]>=28else"fallo",f"menor {f[0]if f else 0} px (mínimo 28)")if f else("manual","no se proporcionaron tamaños de fuente")
mw=d.get("max-width-ch")
pl=d.get("paragraph-lengths",[])
r["p5"]=("aprobado"if int(mw)<=65else"fallo",f"max-width {mw}ch")if mw is not None else("manual"if not pl else("aprobado"if max(pl)<=65else"manual",f"párrafo de {max(pl)} caracteres sin max-width en ch"if pl else"sin información de párrafos"))
r["p6"]=("manual","jugada rara una sola vez: mírala en el storyboard")
cp=d.get("color-pairs",[])
r["p7"]=("aprobado"if min([con(a,b)for a,b in cp if len((a,b))>=2 and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',a)and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',b)]or[100])>=4.5else"fallo",f"peor par {min([con(a,b)for a,b in cp if len((a,b))>=2 and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',a)and re.match(r'^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$',b)]or[0]):.2f}:1")if cp else("manual","no se proporcionaron pares de colores para contraste")
ie=d.get("interactive-elements",[])
r["p8"]=("aprobado"if min([px(v.get("min-height")or v.get("height","0"),re.match(r'([\d.]+)(px|rem|em|pt)',str(v.get("min-height")or v.get("height","0px"))).group(2)if re.match(r'([\d.]+)(px|rem|em|pt)',str(v.get("min-height")or v.get("height","0px")))else"px")for v in ie if v.get("min-height")or v.get("height")]or[44])>=44else"fallo",f"{len(ie)} elementos interactivos; min-height {min([px(v.get('min-height')or v.get('height','0'),re.match(r'([\d.]+)(px|rem|em|pt)',str(v.get('min-height')or v.get('height','0px'))).group(2)if re.match(r'([\d.]+)(px|rem|em|pt)',str(v.get('min-height')or v.get('height','0px')))else'px')for v in ie if v.get('min-height')or v.get('height')]or[0]:.0f}px")if ie else("no aplica","sin elementos interactivos")
fc=[x for x in c if x.upper()not in{"#007FFF","#10B981","#FFBF00","#DC143C","#0057B0","#047857","#F8F9FA","#0A0F1D","#141B2E","#EDF0F4","#46506A","#AEB6C8","#FFFFFF","#000000"}]
r["prohibiciones"]=("fallo"if fc else"aprobado"if c else"manual",f"hex fuera de la paleta: {fc}"if fc else"ninguna"if c else"no se proporcionaron colores para verificar")
for i in range(1,9):k=f"p{i}";e,dt=r.get(k,("manual","no medido en esta pasada"));print(f"{k}: {e} · {dt}")
if"prohibiciones"in r:e,dt=r["prohibiciones"];print(f"prohibiciones: {e} · {dt}")
s=[v[0]for v in r.values()if v[0]=="fallo"]
sys.exit(1 if s else 0)