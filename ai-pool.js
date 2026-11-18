'use strict';
// "One big AI" built from several free providers. Every provider here speaks the OpenAI-compatible chat API,
// so the same request works for all of them. A provider is only used when its API key is set in the
// environment; they are tried in order, skipping any that are out of quota or failing, so when one free tier
// runs dry the next one answers. Set any of:
//   GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, GITHUB_MODELS_TOKEN
// Optional: AI_POOL_MODELS_<NAME> (comma list) overrides a provider's models, e.g. AI_POOL_MODELS_GROQ.
const PROVIDERS=[
  {name:'GROQ',url:'https://api.groq.com/openai/v1/chat/completions',key:'GROQ_API_KEY',models:['llama-3.3-70b-versatile','llama-3.1-8b-instant']},
  {name:'CEREBRAS',url:'https://api.cerebras.ai/v1/chat/completions',key:'CEREBRAS_API_KEY',models:['llama-3.3-70b','llama3.1-8b']},
  {name:'OPENROUTER',url:'https://openrouter.ai/api/v1/chat/completions',key:'OPENROUTER_API_KEY',models:['meta-llama/llama-3.3-70b-instruct:free','openai/gpt-oss-20b:free','google/gemma-3-27b-it:free']},
  {name:'MISTRAL',url:'https://api.mistral.ai/v1/chat/completions',key:'MISTRAL_API_KEY',models:['mistral-small-latest']},
  {name:'GITHUB',url:'https://models.github.ai/inference/chat/completions',key:'GITHUB_MODELS_TOKEN',models:['openai/gpt-4o-mini']}
];
const cooldown=new Map();
function active(){
  return PROVIDERS.filter(p=>String(process.env[p.key]||'').trim()).map(p=>{
    const o=String(process.env['AI_POOL_MODELS_'+p.name]||'').split(',').map(x=>x.trim()).filter(Boolean);
    return Object.assign({},p,{token:String(process.env[p.key]).trim(),models:o.length?o:p.models});
  });
}
function configured(){ return active().length>0; }
function names(){ return active().map(p=>p.name); }
let turn=0;
// Round robin over every provider (Gemini counts as one when it has a key). True means "Gemini's turn".
function geminiTurn(hasGemini){
  const n=active().length+(hasGemini?1:0); if(!n) return true;
  const t=turn++%n; if(hasGemini&&t===0) return true;
  rot=hasGemini?t-1:t; return false;
}
let rot=0;
function candidates(){
  const out=[]; const list=active(); const r=list.length?rot%list.length:0;
  for(const p of list.slice(r).concat(list.slice(0,r))) for(const m of p.models) if((cooldown.get(p.name+'|'+m)||0)<=Date.now()) out.push({p,model:m});
  return out;
}
function payload(model,messages,o,stream){
  return JSON.stringify({model,messages,stream,max_tokens:o.maxTokens||1200,temperature:o.temperature==null?0.2:o.temperature});
}
async function post(c,messages,o,stream,startMs){
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),startMs);
  try{
    return await fetch(c.p.url,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.p.token,'HTTP-Referer':'https://indexv2-jzld.onrender.com','X-Title':'Index'},body:payload(c.model,messages,o,stream)});
  } finally { clearTimeout(t); }
}
function penalize(c,status){
  const key=c.p.name+'|'+c.model;
  if(status===429) cooldown.set(key,Date.now()+60000);
  else if([401,403,404].includes(status)) cooldown.set(key,Date.now()+600000);
  else if(status>=500||status===0) cooldown.set(key,Date.now()+15000);
}
function textOf(d){ return String(d?.choices?.[0]?.message?.content||'').trim(); }
// One non-streamed answer. Throws if every provider fails.
async function complete(messages,o={}){
  const deadline=Date.now()+(o.timeoutMs||40000); let last=null;
  for(const c of candidates()){
    const left=deadline-Date.now(); if(left<3000) break;
    try{
      const r=await post(c,messages,o,false,Math.min(left,20000));
      if(r.ok){ const text=textOf(await r.json()); if(text) return {text,provider:c.p.name,model:c.model}; last=new Error(c.p.name+' returned no text'); continue; }
      const raw=await r.text().catch(()=> ''); last=new Error(c.p.name+' '+c.model+' HTTP '+r.status+': '+raw.replace(/\s+/g,' ').slice(0,140));
      console.warn('[AI pool] '+last.message); penalize(c,r.status);
    }catch(e){ last=new Error(c.p.name+' '+c.model+' failed: '+(e?.message||e)); console.warn('[AI pool] '+last.message); penalize(c,0); }
  }
  throw last||new Error('No pool provider available.');
}
// Streams the first provider that answers into an Express response as OpenAI-style SSE. Returns the provider
// name, or '' when nothing could answer before any bytes were sent.
async function stream(messages,res,o={}){
  const deadline=Date.now()+(o.timeoutMs||55000);
  for(const c of candidates()){
    if(deadline-Date.now()<4000) break;
    let r;
    try{ r=await post(c,messages,o,true,12000); }
    catch(e){ console.warn('[AI pool] '+c.p.name+' '+c.model+' no response: '+(e?.message||e)); penalize(c,0); continue; }
    if(!r.ok){ const raw=await r.text().catch(()=> ''); console.warn('[AI pool] '+c.p.name+' '+c.model+' HTTP '+r.status+' '+raw.replace(/\s+/g,' ').slice(0,120)); penalize(c,r.status); continue; }
    if(!r.body) continue;
    res.status(200);
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-transform');
    res.setHeader('X-Accel-Buffering','no');
    if(typeof res.flushHeaders==='function') res.flushHeaders();
    try{
      for await (const chunk of r.body){ if(Date.now()>=deadline) break; if(chunk) res.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)); }
      res.end();
    }catch(e){ try{ res.write('data: '+JSON.stringify({type:'error',error:'The backup AI stream failed.'})+'\n\n'); res.end(); }catch{} }
    return c.p.name;
  }
  return '';
}

// Live web answers from providers that have built-in search: Groq "compound" models and OpenRouter's web plugin.
async function webSearch(messages,o={}){
  const deadline=Date.now()+(o.timeoutMs||30000); let last=null;
  const tries=[];
  for(const p of active()){
    if(p.name==='GROQ') for(const m of ['groq/compound-mini','groq/compound']) tries.push({p,model:m,extra:{}});
    if(p.name==='OPENROUTER') tries.push({p,model:p.models[0],extra:{plugins:[{id:'web',max_results:3}]}});
  }
  for(const c of tries){
    if((cooldown.get(c.p.name+'|web|'+c.model)||0)>Date.now()) continue;
    const left=deadline-Date.now(); if(left<4000) break;
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),Math.min(left,22000));
    try{
      const r=await fetch(c.p.url,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.p.token,'HTTP-Referer':'https://indexv2-jzld.onrender.com','X-Title':'Index'},
        body:JSON.stringify(Object.assign({model:c.model,messages,stream:false,max_tokens:o.maxTokens||1200,temperature:0.1},c.extra))});
      if(!r.ok){ const raw=await r.text().catch(()=> ''); last=new Error(c.p.name+' web '+c.model+' HTTP '+r.status+': '+raw.replace(/\s+/g,' ').slice(0,140)); console.warn('[AI pool] '+last.message); cooldown.set(c.p.name+'|web|'+c.model,Date.now()+(r.status===429?60000:600000)); continue; }
      const d=await r.json(); const msg=d?.choices?.[0]?.message||{}; const text=String(msg.content||'').trim(); if(!text) continue;
      const sources=[]; const seen=new Set();
      const add=(u,ti)=>{ if(u&&!seen.has(u)&&sources.length<3){ seen.add(u); sources.push({url:u,title:String(ti||'').slice(0,60)}); } };
      for(const a of (msg.annotations||[])) if(a&&a.url_citation) add(a.url_citation.url,a.url_citation.title);
      for(const ex of (msg.executed_tools||[])) for(const x of (ex?.search_results?.results||[])) add(x.url,x.title);
      return {text,sources,provider:c.p.name,model:c.model};
    }catch(e){ last=new Error(c.p.name+' web failed: '+(e?.message||e)); console.warn('[AI pool] '+last.message); }
    finally{ clearTimeout(t); }
  }
  throw last||new Error('No web-capable pool provider.');
}
module.exports={configured,names,complete,stream,geminiTurn,webSearch};
