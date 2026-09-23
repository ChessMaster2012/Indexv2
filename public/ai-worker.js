const WEBGPU_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
const WASM_MODEL = 'onnx-community/SmolLM2-360M-Instruct-ONNX';
let transformers = null;
let generator = null;

function postStatus(text, kind='info'){ self.postMessage({type:'status',text,kind}); }

async function loadTransformers(){
  if(transformers) return transformers;
  postStatus('Loading the on-device AI engine…');
  transformers = await import('/api/ai/assets/transformers.web.min.js');
  const {env}=transformers;
  env.allowRemoteModels=true;
  env.allowLocalModels=false;
  env.useBrowserCache=true;
  env.useWasmCache=true;
  env.remoteHost=self.location.origin+'/api/ai/model';
  env.remotePathTemplate='{model}/resolve/{revision}/{file}';
  env.backends.onnx.wasm.wasmPaths=self.location.origin+'/api/ai/assets/';
  return transformers;
}

async function loadGenerator(){
  if(generator) return generator;
  const {pipeline}=await loadTransformers();
  try{
    postStatus('Downloading the fast local GPU model…');
    generator=await pipeline('text-generation',WEBGPU_MODEL,{dtype:'q4f16',device:'webgpu'});
    postStatus('Local AI ready • GPU mode','good');
    return generator;
  }catch(e){
    postStatus('GPU mode unavailable • switching to local CPU mode…');
    generator=await pipeline('text-generation',WASM_MODEL,{dtype:'q8',device:'wasm'});
    postStatus('Local AI ready • CPU mode','good');
    return generator;
  }
}

self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id) return;
  try{
    const model=await loadGenerator();
    const {TextStreamer}=await loadTransformers();
    let resultText='';
    const streamer=new TextStreamer(model.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function:(text)=>{ resultText+=String(text||''); }});
    const output=await model(Array.isArray(messages)?messages.slice(-18):[],{
      max_new_tokens:420,
      do_sample:false,
      temperature:0.2,
      repetition_penalty:1.05,
      streamer
    });
    let text=resultText.trim();
    const generated=output?.[0]?.generated_text;
    if(!text && Array.isArray(generated)) text=String(generated[generated.length-1]?.content||'').trim();
    if(!text && typeof generated==='string') text=generated.trim();
    if(!text) throw new Error('The local AI model returned an empty response.');
    self.postMessage({type:'result',id,text});
  }catch(err){
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
    generator=null;
  }
};
