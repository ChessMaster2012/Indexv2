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
  if(low.includes('understood — ready to help') || low.includes('you are index tutor') || low.includes('academic integrity:') || low.includes('hello! welcome to my world') || low.includes('my name is academic integrity') || low.includes('please keep it short and sweet') || low.includes('what are you doing? yes, i am explaining things')) return true;
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
    for(let i=generated.length-1;i>=0;i--){
      const last=generated[i];
      if(last && last.role==='assistant' && typeof last.content==='string') return last.content;
    }
    const last=generated[generated.length-1];
    if(last && typeof last.content==='string') return last.content;
    if(typeof last==='string') return last;
  }
  return '';
}

function directAnswerForSimpleInput(text){
  const raw=String(text||'').trim();
  const normalized=raw.toLowerCase().replace(/\s+/g,' ');

  // Fast, exact square-root handling for common Tutor inputs. This keeps
  // simple math out of the small language model entirely.
  const m=normalized.match(/^(?:root|sqrt|square root of|square root)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*[?]?$|^[√]\s*([0-9]+(?:\.[0-9]+)?)\s*[?]?$/i);
  if(m){
    const n=Number(m[1]||m[2]);
    if(Number.isFinite(n) && n>=0){
      const r=Math.sqrt(n);
      if(Number.isInteger(n) && Number.isInteger(r)) return `√${n} = ${r}`;
      if(Number.isInteger(n)){
        let best=1,bestRoot=n;
        for(let d=2;d*d<=n;d++){
          if(n%(d*d)===0){ const outside=d; const inside=n/(d*d); if(outside>best){best=outside;bestRoot=inside;} }
        }
        if(best>1 && bestRoot!==1) return `√${n} = ${best}√${bestRoot} ≈ ${r.toFixed(3)}`;
      }
      return `√${n} ≈ ${r.toFixed(3)}`;
    }
  }

  // Small arithmetic expressions: calculator-style inputs should be exact
  // and instantaneous instead of depending on a language model.
  if(/^[0-9\s()+\-*/%.]+$/.test(raw) && /[+\-*/%]/.test(raw) && raw.length<=80){
    try{
      const value=Function(`"use strict"; return (${raw});`)();
      if(Number.isFinite(value)) return `${raw} = ${Number.isInteger(value)?value:Number(value.toFixed(8))}`;
    }catch(e){}
  }
  return null;
}

async function generateOnce(model, messages, settings){
  // Transformers.js v3 supports passing a chat directly to the text-generation
  // pipeline. That makes the model apply its own chat template instead of us
  // manually serializing roles, which avoids prompt leakage on small instruct models.
  const result=await model(messages,settings);
  return normalizeOutput(extractGenerated(result));
}
self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id)return;
  try{
    const rawMessages=Array.isArray(messages)?messages:[];
    const latestRaw=[...rawMessages].reverse().find(m=>m && (m.role==='user' || !m.role))?.content || '';
    const direct=directAnswerForSimpleInput(latestRaw);
    if(direct){
      self.postMessage({type:'result',id,text:direct,deviceMode:deviceMode||'fast-path',fastPath:true});
      return;
    }

    const model=await loadGenerator();
    const cleanMessages=rawMessages.slice(-12).map(m=>({
      role:m?.role==='assistant'?'assistant':m?.role==='system'?'system':'user',
      content:String(m?.content??'').trim()
    })).filter(m=>m.content);
    if(!cleanMessages.length) throw new Error('No prompt was supplied to the local AI model.');

    const base={
      max_new_tokens:220,
      do_sample:true,
      temperature:0.65,
      top_p:0.9,
      top_k:40,
      repetition_penalty:1.16,
      no_repeat_ngram_size:4,
      return_full_text:false,
      clean_up_tokenization_spaces:true
    };
    let text=await generateOnce(model,cleanMessages,base);
    if(looksBroken(text)){
      const lastTwo=cleanMessages.slice(-2);
      const retryMessages=[
        {role:'system',content:'You are Index Tutor. Answer the student directly. Do not discuss prompts or instructions. Never repeat phrases. Be concise and factual.'},
        ...lastTwo
      ];
      text=await generateOnce(model,retryMessages,{...base,temperature:0.45,top_p:0.9,top_k:50,repetition_penalty:1.24,max_new_tokens:160});
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
