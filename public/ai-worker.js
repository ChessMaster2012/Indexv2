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
  // Some Transformers.js builds append the requested filename themselves.
  // A few older builds can otherwise leave the literal '{file}' segment in the URL.
  const nativeFetch = self.fetch.bind(self);
  env.fetch = async (input, init) => {
    let u = typeof input === 'string' ? input : input?.url;
    if(typeof u === 'string') {
      u = u.replace('/{file}/', '/');
      u = u.replace('/resolve/main/{file}', '/resolve/main');
    }
    return nativeFetch(u, init);
  };
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
function cleanDegenerateRepetition(input){
  let text=String(input||'').replace(/\r/g,'').trim();
  const lines=text.split('\n');
  const cleaned=[];
  for(const line of lines){
    const words=line.trim().split(/\s+/).filter(Boolean);
    if(words.length<6){ cleaned.push(line.trim()); continue; }
    let cut=words.length;
    // Break obvious token loops such as “this this this this this …”.
    for(let i=4;i<words.length;i++){
      const w=words[i].toLowerCase();
      if(w===words[i-1].toLowerCase() && w===words[i-2].toLowerCase() && w===words[i-3].toLowerCase() && w===words[i-4].toLowerCase()){
        cut=Math.min(cut,i-4); break;
      }
    }
    // Break repeated 2–6 word tails.
    for(let n=2;n<=6;n++){
      if(cut < n*3) continue;
      const tail=words.slice(cut-n,cut).join(' ').toLowerCase();
      const prev=words.slice(cut-2*n,cut-n).join(' ').toLowerCase();
      const prev2=words.slice(cut-3*n,cut-2*n).join(' ').toLowerCase();
      if(tail && tail===prev && tail===prev2){ cut -= 2*n; }
    }
    cleaned.push(words.slice(0,cut).join(' '));
  }
  text=cleaned.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  return text;
}

self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id)return;
  try{
    const model=await loadGenerator();
    const {TextStreamer}=await loadTransformers();
    let resultText='';
    const streamer=new TextStreamer(model.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function:t=>{resultText+=String(t||'');}});
    const cleanMessages = Array.isArray(messages) ? messages.slice(-18).map(m=>({
      role: m?.role === 'assistant' || m?.role === 'system' ? m.role : 'user',
      content: String(m?.content ?? '').trim()
    })).filter(m=>m.content) : [];
    if(!cleanMessages.length) throw new Error('No prompt was supplied to the local AI model.');
    const output=await model(cleanMessages,{
      max_new_tokens:420,
      do_sample:true,
      temperature:0.65,
      top_p:0.9,
      top_k:50,
      repetition_penalty:1.12,
      no_repeat_ngram_size:3,
      streamer
    });
    let text=resultText.trim();
    const generated=output?.[0]?.generated_text;
    if(!text && Array.isArray(generated)) text=String(generated[generated.length-1]?.content||'').trim();
    if(!text && typeof generated==='string') text=generated.trim();
    if(!text) throw new Error('The local AI model returned an empty response.');
    text = cleanDegenerateRepetition(text);
    if(!text) throw new Error('The local AI model returned an unusable response.');
    self.postMessage({type:'result',id,text,deviceMode});
  }catch(err){
    generator=null;
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
  }
};
