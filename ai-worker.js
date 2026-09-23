const WEBGPU_MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
const WASM_MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
let transformers=null, generator=null, deviceMode='';
function status(text,kind='info'){ self.postMessage({type:'status',text,kind}); }
async function loadTransformers(){
  if(transformers) return transformers;
  status('Loading the local AI runtime…');
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
      generator=await pipeline('text-generation',WEBGPU_MODEL,{device:'webgpu',dtype:'q4'});
      deviceMode='WebGPU'; status('Local AI ready • WebGPU','ready'); return generator;
    }catch(e){
      status('GPU mode unavailable • switching to local CPU mode…');
    }
  }
  status('Preparing the compatible local CPU model…');
  generator=await pipeline('text-generation',WASM_MODEL,{device:'wasm',dtype:'q8'});
  deviceMode='WASM'; status('Local AI ready • CPU','ready'); return generator;
}
function normalizeOutput(input){
  let text=String(input||'').replace(/\r/g,'').trim();
  text=text.replace(/<\|im_end\|>|<\|endoftext\|>/g,'').trim();
  return text;
}
function looksBroken(text){
  const t=normalizeOutput(text);
  if(!t) return true;
  const low=t.toLowerCase();
  if(/(?:your response|your subject|your age|your prompt|the uk is\.?$)/i.test(t)) return true;
  if(/\b(this|your|the|is|and|our|you)\b(?:\s+\1){4,}/i.test(t)) return true;
  const words=t.split(/\s+/).filter(Boolean).map(x=>x.toLowerCase().replace(/[^a-z0-9]/g,''));
  if(words.length>=18){
    const counts=new Map(); for(const w of words) counts.set(w,(counts.get(w)||0)+1);
    const top=Math.max(...counts.values());
    if(top>=Math.max(7,Math.floor(words.length*0.3))) return true;
  }
  if(low.includes('understood — ready to help') || low.includes('you are index tutor') || low.includes('academic integrity:')) return true;
  return false;
}
function cleanDegenerateRepetition(input){
  let text=normalizeOutput(input);
  const lines=text.split('\n');
  const cleaned=[];
  for(const line of lines){
    const words=line.trim().split(/\s+/).filter(Boolean);
    if(words.length<8){ cleaned.push(line.trim()); continue; }
    let cut=words.length;
    for(let i=4;i<words.length;i++){
      const a=words[i].toLowerCase(), b=words[i-1].toLowerCase(), c=words[i-2].toLowerCase(), d=words[i-3].toLowerCase(), e=words[i-4].toLowerCase();
      if(a===b&&a===c&&a===d&&a===e){ cut=i-4; break; }
    }
    cleaned.push(words.slice(0,cut).join(' '));
  }
  return cleaned.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function extractGenerated(result){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string') return generated;
  if(Array.isArray(generated)){
    const last=generated[generated.length-1];
    if(typeof last==='string') return last;
    if(last && typeof last.content==='string') return last.content;
  }
  return '';
}
async function generateOnce(model, prompt, settings){
  const result=await model(prompt,settings);
  return normalizeOutput(extractGenerated(result));
}
self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id)return;
  try{
    const model=await loadGenerator();
    const cleanMessages=Array.isArray(messages)?messages.slice(-14).map(m=>({
      role:m?.role==='assistant'?'assistant':m?.role==='system'?'system':'user',
      content:String(m?.content??'').trim()
    })).filter(m=>m.content):[];
    if(!cleanMessages.length) throw new Error('No prompt was supplied to the local AI model.');

    let prompt;
    if(typeof model.tokenizer?.apply_chat_template==='function'){
      prompt=model.tokenizer.apply_chat_template(cleanMessages,{tokenize:false,add_generation_prompt:true});
    }else{
      prompt=cleanMessages.map(m=>`${m.role==='system'?'System':m.role==='assistant'?'Assistant':'User'}: ${m.content}`).join('\n\n')+'\n\nAssistant:';
    }

    const base={
      max_new_tokens:260,
      do_sample:true,
      temperature:0.7,
      top_p:0.8,
      top_k:20,
      repetition_penalty:1.1,
      no_repeat_ngram_size:3,
      return_full_text:false
    };
    let text=await generateOnce(model,prompt,base);
    if(looksBroken(text)){
      text=await generateOnce(model,prompt,{...base,temperature:0.55,top_p:0.85,top_k:30,repetition_penalty:1.18,max_new_tokens:220});
    }
    text=cleanDegenerateRepetition(text);
    if(looksBroken(text)) throw new Error('The local AI model produced an unusable response. Please try again.');
    if(!text) throw new Error('The local AI model returned an empty response.');
    self.postMessage({type:'result',id,text,deviceMode});
  }catch(err){
    generator=null;
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
  }
};
