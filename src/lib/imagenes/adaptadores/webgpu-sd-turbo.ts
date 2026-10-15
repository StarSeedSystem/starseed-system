import type { GeneradorTab } from "../../../ai/astraura/media/proveedor-neuronas";
import * as ort from "onnxruntime-web";

const REPO="https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main";
const MODELS={unet:{u:"unet/model.onnx",s:640},enc:{u:"text_encoder/model.onnx",s:1700},dec:{u:"vae_decoder/model.onnx",s:95}};
const sg=14.6146, gm=0, vs=0.18215;

class SdTurbo {
  private tok: any;
  private sess: {[k:string]: ort.InferenceSession} = {};
  private opts: ort.SessionOptions;
  async init() {
    if (!("gpu" in navigator)) throw new Error("no webgpu");
    const {AutoTokenizer}=await import("@xenova/transformers");
    this.tok=await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
    this.tok.pad_token_id=0;
    this.opts={
      executionProviders:["webgpu"],
      enableMemPattern:false,
      enableCpuMemArena:false,
      extra:{session:{disable_prepacking:"1",use_device_allocator_for_initializers:"1",use_ort_model_bytes_directly:"1",use_ort_model_bytes_for_initializers:"1"}}
    };
    await this.load();
  }
  private async load() {
    const cache=await caches.open("onnx-sd-turbo");
    for (const [k,{u}] of Object.entries(MODELS)) {
      const url=`${REPO}/${u}`;
      try {
        let data:ArrayBuffer;
        const cached=await cache.match(url);
        if (cached) data=await cached.arrayBuffer();
        else {
          await cache.add(url);
          const cached2=await cache.match(url);
          data=await cached2.arrayBuffer();
        }
        this.sess[k]=await ort.InferenceSession.create(data,this.opts);
      } catch (e) {
        console.error(`Falló ${u}`,e);
        throw e;
      }
    }
  }
  async gen(prompt:string,seed:number):Promise<{url?:string}|null>{
    try{
      // RNG inicializado para latents
      let sd=seed;
      const rnd=()=>{sd=(sd*1664525+1013904223)%0x100000000;return (sd/0x100000000)*2-1;};
      // Codificación de texto
      const {input_ids}=await this.tok(prompt,{padding:true,max_length:77,truncation:true,return_tensors:false});
      const idsT=new ort.Tensor("int32",input_ids,[1,input_ids.length]);
      const {last_hidden_state}=await this.sess.enc.run({input_ids:idsT});
      idsT.dispose();
      // Latents
      const latent=new ort.Tensor(new Float32Array(1*4*64*64).map(()=>rnd()*sg),[1,4,64,64]);
      // Escalar latents
      const latentIn=this.scaleLatent(latent);
      latent.dispose();
      // UNet
      const {out_sample}=await this.sess.unet.run({sample:latentIn,timestep:new ort.Tensor("int64",[999],[1]),encoder_hidden_states:last_hidden_state});
      latentIn.dispose();
      // Paso del scheduler
      const newLat=this.step(out_sample);
      out_sample.dispose();
      // Decodificación VAE
      const {sample}=await this.sess.dec.run({latent_sample:newLat});
      newLat.dispose();
      // Dibujar imagen
      const img=this.drawImg(sample);
      sample.dispose();
      // Devolver como URL de datos
      return {url:`data:image/png;base64,${img}`};
    }catch(e){
      console.error("Error de generación:",e);
      return null;
    }
  }
  private scaleLatent(t:ort.Tensor):ort.Tensor{
    const d=Math.sqrt(sg*sg+1);
    const out=new Float32Array(t.data.length);
    for (let i=0;i<t.data.length;i++) out[i]=t.data[i]/d;
    return new ort.Tensor(out,t.dims);
  }
  private step(mo:ort.Tensor):ort.Tensor{
    const sh=sg*(gm+1);
    const out=new Float32Array(mo.data.length);
    for (let i=0;i<mo.data.length;i++) {
      const po=mo.data[i]-sh*mo.data[i];
      const der=(mo.data[i]-po)/sh;
      const dt=-sh;
      out[i]=(mo.data[i]+der*dt)/vs;
    }
    return new ort.Tensor(out,mo.dims);
  }
  private drawImg(t:ort.Tensor):string{
    const d=t.data;
    for (let i=0;i<d.length;i++) {
      let x=d[i];
      x=x/2+0.5;
      if (x<0) x=0;
      if (x>1) x=1;
      d[i]=x;
    }
    const id=t.toImageData({tensorLayout:'NCWH',format:'RGB'});
    const c=document.createElement('canvas');
    c.width=id.width;
    c.height=id.height;
    const ctx=c.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    ctx.putImageData(id,0,0);
    return c.toDataURL('image/png').split(',')[1];
  }
}

export async function createWebGpuSdTurboAdapter():Promise<GeneradorTab>{
  const a=new SdTurbo();
  await a.init();
  return a.gen.bind(a);
}