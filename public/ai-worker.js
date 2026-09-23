const WEBGPU_MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
const WASM_MODEL='onnx-community/SmolLM2-360M-Instruct-ONNX';
let transformers=null, generator=null, deviceMode='';
function status(text,kind='info'){ self.postMessage({type:'status',text,kind}); }
async function loadTransformers(){
  if(transformers) return transformers;
  status('Loading the local AI runtime…');
  // IMPORTANT: use transformers.min.js, not transformers.web.min.js.
  // The min build is bundled, so the browser does not encounter bare imports
  // such as "onnxruntime-common" inside a school Chromebook worker.
  transformers=await import('/api/ai/assets/transformers.min.js');
  const {env}=transformers;
  env.allowRemoteModels=true;
  env.allowLocalModels=false;
  env.useBrowserCache=true;
  env.remoteHost=self.location.origin+'/api/ai/model';
  env.remotePathTemplate='{model}/resolve/{revision}/{file}';
  if(env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths=self.location.origin+'/api/ai/assets/';
  return transformers;
}
async function loadGenerator(){
  if(generator) return generator;
  const {pipeline}=await loadTransformers();
  if(navigator.gpu){
    try{
      status('Preparing the fast local GPU model…');
      generator=await pipeline('text-generation',WEBGPU_MODEL,{device:'webgpu',dtype:'q4f16'});
      deviceMode='WebGPU'; status('Local AI ready • WebGPU','ready'); return generator;
    }catch(e){ status('GPU model unavailable • using local CPU mode…'); }
  }
  status('Preparing the compatible local CPU model…');
  generator=await pipeline('text-generation',WASM_MODEL,{device:'wasm',dtype:'q8'});
  deviceMode='WASM'; status('Local AI ready • CPU','ready'); return generator;
}
self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id)return;
  try{
    const model=await loadGenerator();
    const {TextStreamer}=await loadTransformers();
    let resultText='';
    const streamer=new TextStreamer(model.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function:t=>{resultText+=String(t||'');}});
    const output=await model(Array.isArray(messages)?messages.slice(-18):[],{max_new_tokens:420,do_sample:false,temperature:0.15,repetition_penalty:1.05,streamer});
    let text=resultText.trim();
    const generated=output?.[0]?.generated_text;
    if(!text && Array.isArray(generated)) text=String(generated[generated.length-1]?.content||'').trim();
    if(!text && typeof generated==='string') text=generated.trim();
    if(!text) throw new Error('The local AI model returned an empty response.');
    self.postMessage({type:'result',id,text,deviceMode});
  }catch(err){
    generator=null;
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
  }
};
