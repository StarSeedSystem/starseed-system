#!/usr/bin/env python3
# Vigía Radar de Modelos · Astraura 1123 (AST1123E). Cruza Epoch AI, HF GGUF, Ollama y opciones gratis para informe por neurona.
from __future__ import annotations
import json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

RAIZ=Path(__file__).resolve().parent.parent.parent
EPOCH="https://api.epochai.org/v1/models"; HF="https://huggingface.co/api/models"; OLLAMA="https://ollama.com/api/models"
FREE_CAT=RAIZ/"src"/"ai"/"astraura"/"free-catalog.ts"; CAPAS=RAIZ/"config"/"capas-astraura.json"
ESTADO=Path.home()/".starseed"/"radar-modelos.json"
MEDIOS={"navegador":1,"pwa":1,"mac":4.5,"a1":8,"app_nativa":None}; LIM_PET,PAUSA=80,0.8

def _leer(r:Path,d:Any=None)->Any:
 try:return json.loads(r.read_text(encoding="utf-8"))
 except:return d
def _escribir(r:Path,d:Any)->None:
 r.parent.mkdir(parents=True,exist_ok=True);t=r.with_suffix(".tmp");t.write_text(json.dumps(d,ensure_ascii=False,indent=1),encoding="utf-8");t.replace(r)
def _get(url:str,h:dict|None=None,t:int=20,**_)->str|None:
 try:
  with urlopen(Request(url,headers=h or {}),timeout=t) as r:return r.read().decode("utf-8","replace")
 except:return None
def _tam(mid:str)->float:
 mid=mid.lower()
 if any(x in mid for x in("72b","70b")):return 40.0
 if any(x in mid for x in("30b","32b","27b")):return 16.0
 if any(x in mid for x in("14b","13b")):return 8.0
 if any(x in mid for x in("9b","8b","7b")):return 4.5
 if any(x in mid for x in("3b","2b","1b","0.6b")):return 1.5
 return 999.0
def _gratis()->list[dict]:
 t=FREE_CAT.read_text(encoding="utf-8") if FREE_CAT.exists() else "";m,v=[],set()
 for x in re.finditer(r'"([^"]+:free)"',t):
  if(mid:=x.group(1))not in v:v.add(mid);p,_,mo=mid.partition("/");m.append({"id":mid,"src":"gratis","prov":p,"mod":mo,"gratis":True,"tamano_gb":0})
 for x in re.finditer(r'id\s*:\s*"([^"]+)"',t):
  if(mid:=x.group(1))not in v and any(f in mid for f in("nvidia/","gemini","aihubmix/","ollama/","gemma-")):v.add(mid);p,_,mo=mid.partition("/");m.append({"id":mid,"src":"gratis","prov":p or mid,"mod":mo or mid,"gratis":True,"tamano_gb":0})
 return m
def _capas_inst()->list[dict]:
 return[c for c in _leer(CAPAS,{"capas":[]}).get("capas",[])if c.get("estado")=="recomendado"and c.get("sha256")!="por-verificar"]
def _epoch(http)->dict[str,float]:
 txt=http(EPOCH,timeout=30)
 if not txt:return{}
 try:return{it["name"].lower():min(100,max(0,float(it.get("benchmark_score")or it.get("score")or 0)*100))for it in json.loads(txt).get("data",[])if it.get("name")}
 except:return{}
def _hf(http,tags:list[str],quants:list[str])->list[dict]:
 v,c,n=set(),[],{"n":0}
 def p(u:str):
  if n["n"]>=LIM_PET:return None
  if n["n"]:time.sleep(PAUSA);n["n"]+=1
  txt=http(u,timeout=30)
  return json.loads(txt)if txt else None
 for tag in tags:
  for it in(p(f"{HF}?pipeline_tag={quote(tag)}&sort=trendingScore&direction=-1&limit=20")or[]):
   if(mid:=it.get("id",""))and mid not in v and not any(x in mid.lower()for x in("uncensored","abliterated","nsfw")):v.add(mid);c.append({"id":mid,"src":"hf_tend","tag":tag,"tamano_gb":_tam(mid)})
 for base in c[:15]:
  nom=base["id"].rpartition("/")[2]
  for q in quants:
   for it in(p(f"{HF}?search={quote(nom)}&author={quote(q)}&limit=5")or[]):
    if(mid:=it.get("id",""))and mid not in v:v.add(mid);c.append({"id":mid,"src":"hf_quant","base":base["id"],"quant":q,"tamano_gb":_tam(mid)})
 return c
def _ollama(http)->list[dict]:
 txt=http(OLLAMA,timeout=30)
 if not txt:return[]
 try:return[{"id":f"ollama/{m['name']}","src":"ollama","tamano_gb":(m.get("size")or 0)/1e9}for m in json.loads(txt).get("models",[])if m.get("name")]
 except:return[]
def _cabe(t:float,med:str)->bool:return(m:=MEDIOS.get(med))is None or t<=m
def _mejor(mods:list[dict],caps:list[str],ep:dict,cp:list[dict])->dict|None:
 if not mods:return None
 b,bp=None,-1.0
 for m in mods:
  s=0.0;mid=m["id"].lower()
  for k,v in ep.items():
   if k in mid:s+=v*0.4;break
  for c in cp:
   if c["id"].lower()in mid:s+=20;break
  if any(_cabe(m.get("tamano_gb",999),med)for med in MEDIOS):s+=10
  s+=len(set(m.get("cap",[]))&set(caps))*15
  if m.get("gratis"):s+=5
  if s>bp:bp,b=s,{**m,"puntaje":round(s,1)}
 return b
def radar(http=_get,ahora:datetime|None=None,tags=None,quants=None,neuronas=None)->dict:
 ahora=ahora or datetime.now(timezone.utc)
 tags=tags or["text-generation","image-text-to-text"]
 quants=quants or["unsloth","bartowski","lmstudio-community","mlx-community","onnx-community","QuantStack"]
 neuronas=neuronas or[{"id":"def","med":["mac"],"cap":["conversacion","codigo","vision","ligera"]}]
 ep,hf_m,oll,gr,cp=_epoch(http),_hf(http,tags,quants),_ollama(http),_gratis(),_capas_inst()
 todos=hf_m+oll+gr
 for m in todos:
  m.setdefault("cap",[])
  if"text-generation"in str(m.get("tag",""))or m.get("src")=="ollama":m["cap"]+=["conversacion","codigo"]
  if"image-text-to-text"in str(m.get("tag","")):m["cap"]+=["vision"]
  if m.get("tamano_gb",999)<=2:m["cap"]+=["ligera"]
 inf={"fecha":ahora.isoformat(),"neuronas":{}}
 for n in neuronas:
  meds,cats=n.get("med",["mac"]),n.get("cap",["conversacion","codigo","vision","ligera"])
  cands=[m for m in todos if any(_cabe(m.get("tamano_gb",999),med)for med in meds)]
  gan={}
  for cat in cats:
   if(g:=_mejor(cands,[cat],ep,cp)):gan[cat]={"modelo":g["id"],"fuente":g["src"],"puntaje":g["puntaje"],"tamano_gb":g.get("tamano_gb"),"capacidades":g.get("cap",[])}
  inf["neuronas"][n["id"]]={"medios":meds,"ganadores":gan,"total":len(todos),"candidatos":len(cands)}
 _escribir(RAIZ/"starseed_memory_root"/"radar"/f"informe-{ahora:%Y-%m-%d}.json",inf)
 _escribir(ESTADO,{"ultima":ahora.isoformat(),"neuronas":list(inf["neuronas"])})
 return inf
def main(argv=None):
 import argparse;ap=argparse.ArgumentParser(description="Radar Modelos Astraura 1123");ap.add_argument("--seco",action="store_true");ap.add_argument("--neurona",action="append");a=ap.parse_args(argv)
 ns=[{"id":n,"med":["mac"],"cap":["conversacion","codigo","vision","ligera"]}for n in a.neurona]if a.neurona else None
 r=radar(neuronas=ns);print(json.dumps(r,ensure_ascii=False,indent=1)if a.seco else f"Radar: {len(r['neuronas'])} neuronas");return 0
if __name__=="__main__":sys.exit(main())