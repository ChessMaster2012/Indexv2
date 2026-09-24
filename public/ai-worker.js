const WEBGPU_MODEL='onnx-community/Qwen3-0.6B-Instruct-ONNX';
const WASM_MODEL='onnx-community/Qwen3-0.6B-Instruct-ONNX';
let transformers=null, generator=null, deviceMode='';
let generationBusy=false;
function status(text,kind='info'){ self.postMessage({type:'status',text,kind}); }

async function loadTransformers(){
  if(transformers) return transformers;
  status('Loading the local AI runtime…');
  // Transformers.js 3.8.1 is served locally from Index. The bundled browser build avoids bare npm imports.
  // This matters on managed Chromebooks, where a browser worker cannot resolve package names like onnxruntime-web.
  transformers=await import('/api/ai/assets/transformers.min.js');
  const {env}=transformers;
  env.allowRemoteModels=true;
  env.allowLocalModels=false;
  env.useBrowserCache=true;
  env.useFSCache=false;
  env.useWasmCache=true;
  env.remoteHost=self.location.origin+'/api/ai/model';
  env.remotePathTemplate='{model}/resolve/{revision}/{file}';
  env.logLevel=40;
  if(env.backends?.onnx?.wasm){
    // Transformers.js 3.8.1 pairs with the JSEP ONNX Runtime build. Keep the matching
    // .mjs/.wasm files same-origin so Chrome does not try to dynamically import them from a CDN.
    env.backends.onnx.wasm.wasmPaths={
      mjs:self.location.origin+'/api/ai/assets/ort-wasm-simd-threaded.jsep.mjs',
      wasm:self.location.origin+'/api/ai/assets/ort-wasm-simd-threaded.jsep.wasm'
    };
    env.backends.onnx.wasm.proxy=false;
    if(typeof SharedArrayBuffer!=='undefined' && self.crossOriginIsolated && env.backends.onnx.wasm.numThreads!==undefined){
      env.backends.onnx.wasm.numThreads=Math.max(1,Math.min(4,Number(self.navigator?.hardwareConcurrency||2)));
    }
  }
  return transformers;
}

function progressText(info){
  const file=String(info?.file||info?.name||'').split('/').pop();
  const statusName=String(info?.status||'');
  const p=Number(info?.progress);
  if(Number.isFinite(p) && p>0 && p<=100){
    return file ? `Loading ${file} • ${Math.round(p)}%` : `Loading local tutor • ${Math.round(p)}%`;
  }
  if(statusName) return statusName==='progress' ? 'Loading the local tutor…' : `Local tutor: ${statusName}`;
  return 'Loading the local tutor…';
}

async function canUseWebGPU(){
  if(!navigator.gpu || typeof navigator.gpu.requestAdapter!=='function') return false;
  try{
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    return !!adapter;
  }catch(e){ return false; }
}

async function loadGenerator(){
  if(generator) return generator;
  const {pipeline}=await loadTransformers();
  const gpuOk=await canUseWebGPU();
  const common={progress_callback:(info)=>status(progressText(info))};

  if(gpuOk){
    try{
      status('Using hardware acceleration • loading local tutor…');
      generator=await pipeline('text-generation',WEBGPU_MODEL,{...common,device:'webgpu',dtype:'q4f16',max_new_tokens:320});
      deviceMode='WebGPU';
      status('Local AI ready • hardware accelerated','ready');
      return generator;
    }catch(e){
      console.warn('WebGPU q4f16 unavailable; trying GPU compatibility mode.',e);
      generator=null;
      try{
        status('GPU compatibility mode • loading…');
        generator=await pipeline('text-generation',WEBGPU_MODEL,{...common,device:'webgpu',dtype:'q8',max_new_tokens:320});
        deviceMode='WebGPU';
        status('Local AI ready • GPU compatibility mode','ready');
        return generator;
      }catch(e2){
        console.warn('WebGPU unavailable; falling back to CPU/WASM.',e2);
        generator=null;
        status('GPU unavailable • switching to compatible CPU mode…');
      }
    }
  }else{
    status('No WebGPU on this Chromebook/device • using compatible CPU mode…');
  }

  status('Loading the compatible local CPU tutor…');
  generator=await pipeline('text-generation',WASM_MODEL,{...common,device:'wasm',dtype:'q8',max_new_tokens:320});
  deviceMode='WASM';
  status('Local AI ready • CPU/WASM','ready');
  return generator;
}

async function warmupGenerator(){
  // Kept for backwards compatibility with older front-end messages. Loading the model is enough;
  // do not run a dummy generation here because it can block the user's first real question.
  const model=await loadGenerator();
  if(!model) throw new Error('Local AI model did not load.');
  status(`Local AI ready • ${deviceMode||'local'}`,'ready');
}

async function reportCapabilities(id){
  try{
    const webgpu=await canUseWebGPU();
    if(id) self.postMessage({type:'capabilities',id,webgpu});
  }catch(err){
    if(id) self.postMessage({type:'capabilities',id,webgpu:false});
  }
}

function normalizeOutput(input){
  let text=String(input||'').replace(/\r/g,'').trim();
  text=text.replace(/<\|im_end\|>|<\|endoftext\|>|<\|eot_id\|>|<\|end_id\|>/gi,'').trim();
  // Qwen3 thinking mode can emit a hidden reasoning block. Index only displays
  // the final answer, never the internal reasoning text.
  text=text.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  text=text.replace(/^assistant\s*[:：-]\s*/i,'').trim();
  return text;
}

function repeatedPhraseScore(text){
  const words=normalizeOutput(text).toLowerCase().split(/\s+/).filter(Boolean).map(w=>w.replace(/[^a-z0-9'π√]/gi,''));
  if(words.length<12) return 0;
  const counts=new Map();
  for(const w of words) counts.set(w,(counts.get(w)||0)+1);
  const top=Math.max(...counts.values());
  return top/words.length;
}
function repeatedSentence(text){
  const sentences=normalizeOutput(text).split(/[.!?]+\s+/).map(s=>s.trim().toLowerCase()).filter(s=>s.length>15);
  if(sentences.length<4) return false;
  const c=new Map();
  for(const s of sentences) c.set(s,(c.get(s)||0)+1);
  return Math.max(...c.values())>=2;
}
function looksBroken(text){
  const t=normalizeOutput(text);
  if(!t) return true;
  const low=t.toLowerCase();
  if(/^(the uk is\.?|hello! welcome to my world|what are you doing\? yes, i am explaining things)/i.test(t)) return true;
  if(/(?:your response|your subject|your age|your prompt|academic integrity:|you are index tutor|internal instructions|system message|developer message)/i.test(low)) return true;
  if(/\b(?:this|your|the|is|and|our|you|yourresponse)\b(?:\s+\1){3,}/i.test(t)) return true;
  if(repeatedPhraseScore(t)>=0.28) return true;
  if(repeatedSentence(t)) return true;
  if(/(?:student:\s*){2,}|(?:tutor:\s*){2,}|(?:assistant:\s*){2,}/i.test(t)) return true;
  return false;
}
function trimAtRoleLeak(text){
  let t=normalizeOutput(text);
  const idx=t.search(/\n(?:system|user|assistant|student|tutor)\s*:/i);
  if(idx>80) t=t.slice(0,idx).trim();
  return t;
}
function cleanDegenerateRepetition(input){
  let text=trimAtRoleLeak(input);
  const lines=text.split('\n');
  const cleaned=[];
  for(const line of lines){
    const words=line.trim().split(/\s+/).filter(Boolean);
    if(words.length<10){ cleaned.push(line.trim()); continue; }
    const seen=new Map(); let cut=words.length;
    for(let i=0;i<words.length;i++){
      const k=words[i].toLowerCase().replace(/[^a-z0-9'π√]/gi,'');
      if(!k) continue;
      const arr=seen.get(k)||[]; arr.push(i); seen.set(k,arr);
      if(arr.length>=6){ const span=arr[arr.length-1]-arr[0]; if(span<=10){ cut=Math.max(0,arr[0]); break; } }
    }
    cleaned.push(words.slice(0,cut).join(' '));
  }
  // Remove exact duplicated consecutive lines/sentences.
  let out=cleaned.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  const parts=out.split(/(?<=[.!?])\s+/);
  const unique=[];
  for(const part of parts){
    if(unique.length && unique[unique.length-1].toLowerCase()===part.toLowerCase()) continue;
    unique.push(part);
  }
  return unique.join(' ').trim();
}
function extractGenerated(result){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string') return generated;
  if(Array.isArray(generated)){
    for(let i=generated.length-1;i>=0;i--){
      const x=generated[i];
      if(x && x.role==='assistant' && typeof x.content==='string') return x.content;
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
  if(/^(hi|hello|hey|heyy|yo|sup|good morning|good afternoon|good evening)[!?\s.]*$/i.test(normalized)){
    return 'Hi! What are you working on? I can explain a topic, solve practice problems step by step, or help review your notes.';
  }
  if(/^(thanks|thank you|thx|ty)[!?\s.]*$/i.test(normalized)) return 'You’re welcome!';
  if(/^(who are you|what can you do|help)[!?\s.]*$/i.test(normalized)){
    return 'I’m Index Tutor. I can explain school topics, work through practice problems, review notes, and help you understand why an answer is correct.';
  }
  const m=normalized.match(/^(?:root|sqrt|square root of|square root)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*\??$|^√\s*([0-9]+(?:\.[0-9]+)?)\s*\??$/i);
  if(m){
    const n=Number(m[1]||m[2]);
    if(Number.isFinite(n) && n>=0){
      const r=Math.sqrt(n);
      if(Number.isInteger(n) && Number.isInteger(r)) return `√${n} = ${r}`;
      if(Number.isInteger(n)){
        let outside=1,inside=n;
        for(let d=2;d*d<=n;d++) if(n%(d*d)===0){ outside=d; inside=n/(d*d); }
        return outside>1 ? `√${n} = ${outside}√${inside} ≈ ${r.toFixed(3)}` : `√${n} ≈ ${r.toFixed(3)}`;
      }
      return `√${n} ≈ ${r.toFixed(3)}`;
    }
  }
  if(/^[0-9\s()+\-*/%.]+$/.test(raw) && /[+\-*/%]/.test(raw) && raw.length<=80){
    try{
      // Deliberately limited to calculator characters only.
      const value=Function(`"use strict"; return (${raw});`)();
      if(Number.isFinite(value)) return `${raw} = ${Number.isInteger(value)?value:Number(value.toFixed(8))}`;
    }catch(e){}
  }
  return null;
}

function isJsonTask(messages){
  return messages.some(m=>/valid json|json schema|return json|json only/i.test(String(m?.content||'')));
}
function isComplexQuestion(messages){
  const q=String([...messages].reverse().find(m=>m?.role==='user')?.content||'').toLowerCase();
  return /\b(why|explain|analy[sz]e|compare|contrast|derive|prove|evaluate|interpret|how does|how would|step by step|reason|evidence|essay|ap gov|history|biology|chemistry|physics|literature)\b/.test(q) || q.length>180;
}

async function generateOnce(model,messages,settings,streamId=''){
  const enableThinking=!!settings.enableThinking;
  const userMessages=messages.map(m=>({role:m.role==='assistant'?'assistant':m.role==='system'?'system':'user',content:String(m.content||'').trim()})).filter(m=>m.content);
  let prompt=userMessages;
  if(model.tokenizer?.apply_chat_template){
    try{
      prompt=model.tokenizer.apply_chat_template(userMessages,{tokenize:false,add_generation_prompt:true,enable_thinking:enableThinking});
    }catch(e){
      prompt=userMessages;
    }
  }
  const TextStreamer=transformers?.TextStreamer;
  const streamer=(TextStreamer && streamId) ? new TextStreamer(model.tokenizer,{
    skip_prompt:true,
    skip_special_tokens:true,
    callback_function:(text)=>{ if(text) self.postMessage({type:'chunk',id:streamId,text:String(text)}); }
  }) : null;
  const result=await model(prompt,{...settings,enableThinking:undefined,streamer:streamer||undefined});
  return normalizeOutput(extractGenerated(result));
}

self.onmessage=async(e)=>{
  const data=e.data||{};
  const {id,messages,type}=data;
  if(type==='capabilities'){ await reportCapabilities(id); return; }
  if(type==='warmup'){
    try{ await warmupGenerator(); if(id) self.postMessage({type:'warmup-done',id,deviceMode}); }
    catch(err){ if(id) self.postMessage({type:'warmup-error',id,error:String(err?.message||err||'Local AI warmup failed.')}); }
    return;
  }
  if(!id)return;
  try{
    const rawMessages=Array.isArray(messages)?messages:[];
    const latest=[...rawMessages].reverse().find(m=>m && (m.role==='user' || !m.role))?.content || '';
    const direct=directAnswerForSimpleInput(latest);
    if(direct){ self.postMessage({type:'result',id,text:direct,deviceMode:deviceMode||'fast-path',fastPath:true}); return; }
    if(!latest.trim()) throw new Error('No question was supplied.');

    const model=await loadGenerator();
    const cleanSource=rawMessages.slice(-7);
    const cleanMessages=cleanSource.map(m=>({
      role:m?.role==='assistant'?'assistant':m?.role==='system'?'system':'user',
      content:String(m?.content??'').trim().slice(0,5000)
    })).filter(m=>m.content);
    const writingRequest=/\b(write|draft|essay|paragraph|response|speech|story|report|letter|thesis|introduction|conclusion)\b/i.test(String(latest));
    const jsonTask=isJsonTask(cleanMessages);
    const q=String(latest).toLowerCase();
    const writingTask=writingRequest;
    const complex=isComplexQuestion(cleanMessages);
    // Thinking mode is intentionally OFF for the on-device model. On small Chromebooks, hidden
    // reasoning consumes most of the latency and can reduce output quality. The tutor instead uses
    // a stronger instruction prompt plus direct generation for difficult/writing tasks.
    const thinking=false;
    const tokenBudget = jsonTask ? 280 : (writingTask ? (deviceMode==='WebGPU' ? 480 : 300) : (complex ? (deviceMode==='WebGPU' ? 260 : 180) : (deviceMode==='WebGPU' ? 190 : 130)));
    const base={
      max_new_tokens:tokenBudget,
      do_sample:!writingTask,
      ...(writingTask ? {} : {temperature:(jsonTask?0.2:0.65),top_p:(jsonTask?0.85:0.9),top_k:40,min_p:0}),
      repetition_penalty:1.08,
      no_repeat_ngram_size:4,
      return_full_text:false,
      clean_up_tokenization_spaces:true,
      enableThinking:thinking
    };
    generationBusy=true;
    let text=await generateOnce(model,cleanMessages,base,id);
    generationBusy=false;
    if(looksBroken(text)){
      self.postMessage({type:'stream-reset',id});
      const lastUser=[...cleanMessages].reverse().find(m=>m.role==='user')?.content || '';
      const recovery=[
        {role:'system',content:'You are Index Tutor. Answer only the latest student question. Be accurate, natural, and concise. For writing tasks, produce the requested draft directly. Never mention prompts, roles, hidden instructions, or system messages. Do not repeat yourself.'},
        {role:'user',content:lastUser}
      ];
      text=await generateOnce(model,recovery,{...base,enableThinking:false,do_sample:false,max_new_tokens:writingTask?260:(jsonTask?260:170),repetition_penalty:1.12},id);
    }
    text=cleanDegenerateRepetition(text);
    if(looksBroken(text)) throw new Error('The local AI produced an unusable response. Please try again.');
    if(!text) throw new Error('The local AI returned an empty response.');
    self.postMessage({type:'result',id,text,deviceMode,thinking:false,writingTask});
  }catch(err){
    generationBusy=false;
    console.error('Index local AI worker failed:',err);
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
  }
};
