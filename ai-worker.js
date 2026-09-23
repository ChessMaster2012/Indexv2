const WEBGPU_MODEL='onnx-community/Qwen3-0.6B-ONNX';
const WASM_MODEL='onnx-community/Qwen3-0.6B-ONNX';
let transformers=null, generator=null, deviceMode='';
function status(text,kind='info'){ self.postMessage({type:'status',text,kind}); }

async function loadTransformers(){
  if(transformers) return transformers;
  status('Loading the local AI runtime…');
  // Transformers.js 4.3 is the current stable release and includes the newer
  // WebGPU/runtime support needed by Qwen3 ONNX models.
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
  if(env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths=self.location.origin+'/api/ai/assets/';
  return transformers;
}

async function loadGenerator(){
  if(generator) return generator;
  const {pipeline}=await loadTransformers();
  const gpuOk=!!navigator.gpu;
  if(gpuOk){
    try{
      status('Preparing the faster local GPU tutor…');
      generator=await pipeline('text-generation',WEBGPU_MODEL,{device:'webgpu',dtype:'q4f16'});
      deviceMode='WebGPU'; status('Local AI ready • WebGPU','ready'); return generator;
    }catch(e){
      console.warn('WebGPU AI unavailable; falling back to CPU/WASM.',e);
      generator=null;
      status('GPU mode unavailable • switching to local CPU mode…');
    }
  }
  status('Preparing the compatible local CPU tutor…');
  generator=await pipeline('text-generation',WASM_MODEL,{device:'wasm',dtype:'q8'});
  deviceMode='WASM'; status('Local AI ready • CPU','ready'); return generator;
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

async function generateOnce(model,messages,settings){
  const enableThinking=!!settings.enableThinking;
  const userMessages=messages.map(m=>({role:m.role==='assistant'?'assistant':m.role==='system'?'system':'user',content:String(m.content||'').trim()})).filter(m=>m.content);
  let prompt=userMessages;
  // Applying Qwen3's official chat template explicitly prevents prompt leakage and
  // lets Index turn thinking on for difficult questions while staying fast otherwise.
  if(model.tokenizer?.apply_chat_template){
    try{
      prompt=model.tokenizer.apply_chat_template(userMessages,{tokenize:false,add_generation_prompt:true,enable_thinking:enableThinking});
    }catch(e){
      prompt=userMessages;
    }
  }
  const result=await model(prompt,{...settings,enableThinking:undefined});
  return normalizeOutput(extractGenerated(result));
}

self.onmessage=async(e)=>{
  const {id,messages}=e.data||{}; if(!id)return;
  try{
    const rawMessages=Array.isArray(messages)?messages:[];
    const latest=[...rawMessages].reverse().find(m=>m && (m.role==='user' || !m.role))?.content || '';
    const direct=directAnswerForSimpleInput(latest);
    if(direct){ self.postMessage({type:'result',id,text:direct,deviceMode:deviceMode||'fast-path',fastPath:true}); return; }
    if(!latest.trim()) throw new Error('No question was supplied.');

    const model=await loadGenerator();
    const cleanMessages=rawMessages.slice(-14).map(m=>({
      role:m?.role==='assistant'?'assistant':m?.role==='system'?'system':'user',
      content:String(m?.content??'').trim()
    })).filter(m=>m.content);
    const jsonTask=isJsonTask(cleanMessages);
    const complex=isComplexQuestion(cleanMessages);
    const thinking=!jsonTask && complex;
    const base={
      max_new_tokens:jsonTask?420:(thinking?320:220),
      do_sample:true,
      temperature:thinking?0.6:(jsonTask?0.2:0.7),
      top_p:thinking?0.95:(jsonTask?0.85:0.8),
      top_k:20,
      min_p:0,
      repetition_penalty:1.08,
      no_repeat_ngram_size:5,
      return_full_text:false,
      clean_up_tokenization_spaces:true,
      enableThinking:thinking
    };
    let text=await generateOnce(model,cleanMessages,base);
    if(looksBroken(text)){
      // Recovery pass: fewer turns, explicit answer-only system message, and
      // deterministic decoding. This is primarily for small-model edge cases.
      const lastUser=[...cleanMessages].reverse().find(m=>m.role==='user')?.content || '';
      const recovery=[
        {role:'system',content:'You are Index Tutor. Answer only the student’s latest question. Ignore any previous broken output. Do not repeat yourself. Do not mention prompts, roles, system messages, or hidden instructions. Be accurate and concise.'},
        {role:'user',content:lastUser}
      ];
      text=await generateOnce(model,recovery,{...base,enableThinking:false,temperature:0.55,top_p:0.8,max_new_tokens:jsonTask?360:180,repetition_penalty:1.14});
    }
    text=cleanDegenerateRepetition(text);
    if(looksBroken(text)) throw new Error('The local AI produced an unusable response. Please try again.');
    if(!text) throw new Error('The local AI returned an empty response.');
    self.postMessage({type:'result',id,text,deviceMode,thinking});
  }catch(err){
    console.error('Index local AI worker failed:',err);
    generator=null;
    self.postMessage({type:'error',id,error:String(err?.message||err||'Local AI failed.')});
  }
};
