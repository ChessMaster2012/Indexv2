const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const QUESTION_MS = 20000;
const MIN_QUESTION_MS = 5000;
const MAX_QUESTION_MS = 60000;
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

const SESSION_COOKIE = 'index_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '');
const SUPABASE_TABLE = String(process.env.SUPABASE_TABLE || 'index_accounts').replace(/[^a-zA-Z0-9_]/g, '') || 'index_accounts';
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '');
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Compress JSON API responses before sending them to browsers. This is
// especially useful for Tutor responses and account payloads, and reduces
// Render outbound bandwidth without changing the API shape for clients.
app.use((req,res,next)=>{
  const originalJson=res.json.bind(res);
  res.json=(body)=>{
    const accept=String(req.headers['accept-encoding']||'').toLowerCase();
    if(!accept.includes('gzip')) return originalJson(body);
    const json=JSON.stringify(body);
    if(Buffer.byteLength(json,'utf8')<512) return originalJson(body);
    zlib.gzip(Buffer.from(json,'utf8'),(err,compressed)=>{
      if(err) return originalJson(body);
      res.set('Content-Encoding','gzip');
      res.set('Content-Type','application/json; charset=utf-8');
      res.set('Vary','Accept-Encoding');
      res.set('Content-Length',String(compressed.length));
      res.send(compressed);
    });
    return res;
  };
  next();
});

// Browser caching for static files: this reduces repeat downloads without caching
// API responses or changing any application behavior. HTML/JS are kept short-lived
// so deployments and feature updates become visible quickly; images can stay cached
// longer because they are immutable-looking public assets.
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.js' || ext === '.json') {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.ico', '.svg'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

// Safety / conduct guardrails for a student-facing study tool.
const CONDUCT_PATTERNS = [
  /\b(?:porn|xxx|nudes?|sext(?:ing)?|rape|molest|groom(?:ing)?)\b/i,
  /\b(?:kill yourself|kys|go die|suicide)\b/i,
  /\b(?:fuck|fucker|shit|bitch|asshole|slut|whore)\b/i,
  /\b(?:nazi|kkk)\b/i
];
function normalizeNameForModeration(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9]/g, '');
}
function containsConductViolation(text) {
  const raw = String(text || '');
  const normalized = normalizeNameForModeration(raw);
  return CONDUCT_PATTERNS.some(re => re.test(raw)) ||
    /(?:porn|xxx|nudes|sexting|rape|molest|grooming|kills?yourself|kys|godie|fuck|fucker|shit|bitch|asshole|slut|whore|nazi|kkk)/i.test(normalized);
}
function nameViolationReason(value) {
  const name = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 40);
  if (!name) return 'Please enter a name.';
  if (containsConductViolation(name)) return 'That name is not allowed. Please pick a different name.';
  return '';
}
function cleanDisplayName(value, fallback='Player') {
  const name = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 40);
  if (!name || containsConductViolation(name)) return fallback;
  return name;
}
function cleanRoomTitle(value) {
  const title = String(value || '').replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 120);
  return containsConductViolation(title) ? 'Live Study Game' : (title || 'Live Study Game');
}
const AI_BLOCK_PATTERNS = [
  /\b(?:porn|pornography|xxx|nsfw|hentai|nudes?|naked\s+(?:pics?|photos?|images?)|sex\s*chat|sext(?:ing)?|sexual\s+(?:content|images?|videos?)|onlyfans|fetish|camgirl|escort)\b/i,
  /\b(?:fuck|fucker|fucking|shit|bitch|asshole|dick|pussy|cunt|slut|whore)\b/i,
  /\b(?:kill\s+yourself|kys|go\s+die|suicide|self[-\s]?harm|self[-\s]?injury)\b/i,
  /\b(?:nazi|kkk|white\s+supremac(?:ist|y)|racial\s+slur)\b/i
];
function aiContentIsAllowed(messages) {
  const userText = messages.filter(m => m && m.role === 'user').map(m => String(m.content || '')).join('\n');
  const normalized = normalizeNameForModeration(userText);
  const blockedRaw = AI_BLOCK_PATTERNS.some(re => re.test(userText));
  const blockedNormalized = /(?:porn|pornography|xxx|nsfw|hentai|nudes|nakedpics|sexchat|sexting|sexualcontent|onlyfans|fetish|camgirl|escort|fuck|fucker|fucking|shit|bitch|asshole|dick|pussy|cunt|slut|whore|killsyourself|kys|godie|suicide|selfharm|selfinjury|nazi|kkk)/i.test(normalized);
  return !(blockedRaw || blockedNormalized);
}
function aiModerationMessage() {
  return 'That request is not available in Index Tutor. Please keep searches and messages school-appropriate.';
}

// Server-side AI Tutor: NO browser model and NO API key.
// The browser only talks to /api/ai/chat. We try free keyless text endpoints,
// then use deterministic school-answer fallbacks so the Tutor never returns
// the old "empty response" error.
const AI_MAX_INPUT_CHARS = 4500;

function normalizeAiMessages(messages){
  const raw=Array.isArray(messages)?messages:[];
  const safe=[]; let total=0;
  for(const m of raw.slice(-8)){
    const role=m?.role==='assistant'?'assistant':m?.role==='user'?'user':'system';
    let content=String(m?.content||'').replace(/\u0000/g,'').trim();
    if(!content) continue;
    content=content.slice(0,2200);
    const room=Math.max(0,AI_MAX_INPUT_CHARS-total);
    if(room<=0) break;
    content=content.slice(0,room); total+=content.length;
    safe.push({role,content});
  }
  return safe;
}

function latestUserQuestion(messages){
  return [...messages].reverse().find(m=>m.role==='user')?.content?.trim()||'';
}

function classifyAiTask(question){
  const q=String(question||'').trim();
  const l=q.toLowerCase();
  const writingNoun=/\b(paragraph|essay|speech|letter|response|thesis|introduction|conclusion|report|draft)\b/i.test(q);
  const writingVerb=/\b(write|generate|create|draft|compose|produce|make|writ|wirte|wriet|wriite)\b/i.test(q);
  if((writingVerb && writingNoun) || /\b(?:6|7|8)\s*(?:-|to|through|and)\s*(?:6|7|8)?\s*paragraphs?\b/i.test(q) || /\b(paragraph|essay)\b/i.test(q) && /\b(?:on|about|regarding)\b/i.test(q)){
    return 'direct-writing';
  }
  if(/\b(solve|calculate|compute|simplify|factor|evaluate|find|derive|prove|balance)\b/i.test(l)){
    return 'direct-problem-solving';
  }
  if(/\b(what is|what are|define|explain|why|how does|how do|compare|contrast|describe)\b/i.test(l)){
    return 'direct-explanation';
  }
  return 'direct-answer';
}

function requestedSentenceRange(question){
  const q=String(question||'');
  const between=q.match(/\bbetween\s+(\d+)\s*(?:-|to|and)\s*(\d+)\s+sentences?\b/i)
    || q.match(/\b(\d+)\s*(?:-|to|through|and)\s*(\d+)\s+sentences?\b/i);
  if(between) return {min:Number(between[1]),max:Number(between[2])};
  const exact=q.match(/\b(\d+)\s+sentences?\b/i);
  if(exact) return {min:Number(exact[1]),max:Number(exact[1])};
  return null;
}

function recentUserTexts(messages){
  return normalizeAiMessages(messages).filter(m=>m.role==='user').map(m=>m.content);
}

function requestedWritingConstraints(messages){
  const users=recentUserTexts(messages);
  const combined=users.join('\n');
  let sentenceRange=null;
  // Prefer the newest explicit sentence-count requirement, but preserve it
  // when the student later says something abbreviated like “6 to 8”.
  for(let i=users.length-1;i>=0;i--){
    const found=requestedSentenceRange(users[i]);
    if(found){ sentenceRange=found; break; }
  }
  if(!sentenceRange){
    const loose=combined.match(/\b(?:between\s+)?(\d+)\s*(?:-|to|through|and)\s*(\d+)\s+(?:sentences?)\b/ig);
    if(loose){      const m=loose[loose.length-1].match(/(\d+)\s*(?:-|to|through|and)\s*(\d+)/i);
      if(m) sentenceRange={min:Number(m[1]),max:Number(m[2])};
    }
  }
  const paragraphRangeMatch=combined.match(/\b(?:between\s+)?(\d+)\s*(?:-|to|through|and)\s*(\d+)\s+paragraphs?\b/i)
    || combined.match(/\b(\d+)\s*[-–]\s*(\d+)\s+paragraphs?\b/i);
  const requestedParagraphRange=paragraphRangeMatch
    ? {min:Number(paragraphRangeMatch[1]),max:Number(paragraphRangeMatch[2])}
    : null;
  const writingMentioned=users.some(t=>/\b(paragraph|essay|draft|response|speech|letter|report|thesis|introduction|conclusion)\b/i.test(t));
  // A complaint that a response had “3 paragraphs” must not override the
  // original request for one paragraph. Only an actual paragraph-range request
  // changes the shape.
  const singleParagraph=users.some(t=>/\b(?:a|one|single)\s+paragraph\b/i.test(t)) && !requestedParagraphRange;
  const latest=users[users.length-1]||'';
  return {sentenceRange, requestedParagraphRange, writingMentioned, singleParagraph, latest};
}

function buildAiMessages(messages){
  const turns=normalizeAiMessages(messages);
  if(!turns.length) return [];
  const clientRules=turns.find(t=>t.role==='system')?.content||'';
  const question=latestUserQuestion(turns);
  const task=classifyAiTask(question);
  const writingConstraints=requestedWritingConstraints(turns);
  const range=writingConstraints.sentenceRange;
  const taskRules={
    'direct-writing':'EXECUTION RULE: The student asked you to create writing. Create the requested writing itself. Do NOT answer with writing tips, a paragraph structure, an outline, or instructions for the student unless they explicitly asked for those. Output the finished draft directly.',
    'direct-problem-solving':'EXECUTION RULE: The student asked you to solve or calculate something. Perform the problem and give the result, with the important reasoning steps. Do NOT replace the requested solution with generic study advice.',
    'direct-explanation':'EXECUTION RULE: Answer the exact concept/question asked. Do not substitute a different topic or give generic classroom advice.',
    'direct-answer':'EXECUTION RULE: Follow the student\'s concrete request literally and answer it directly.'
  }[task];
  const lengthRule=range
    ? `WRITING LENGTH RULE: The student requested between ${range.min} and ${range.max} sentences. Produce a finished response in that range and count the sentences before returning it.`
    : '';
  const shapeRule=writingConstraints.singleParagraph
    ? 'WRITING SHAPE RULE: The student asked for a single paragraph. Return exactly ONE paragraph; do not split the response into multiple blank-line paragraphs or add a title.'
    : writingConstraints.requestedParagraphRange
      ? `WRITING SHAPE RULE: The student requested between ${writingConstraints.requestedParagraphRange.min} and ${writingConstraints.requestedParagraphRange.max} paragraphs. Return a finished response in that paragraph range.`
      : '';
  const priorAssistant=[...turns].reverse().find(t=>t.role==='assistant')?.content||'';
  const followUpRule=/\b(it|that|this|these|those|the above|the previous|more simple|simpler|clarify|explain that|what about it|why is that|how does that)\b/i.test(question) && priorAssistant
    ? 'FOLLOW-UP CONTEXT RULE: The latest student message is a follow-up. Treat words such as “it,” “that,” “this,” “the above,” “simpler,” or “more simple” as referring to the immediately preceding relevant Tutor answer. Use that previous answer as context and answer the follow-up itself. Do not restart with generic study advice.'
    : 'CONTEXT RULE: Use the immediately preceding relevant Tutor answer when the student message depends on prior context.';
  const serverRules='You are Index Tutor, a high-quality school tutor. Follow the student request as an execution task, not as a request for generic advice. Answer the latest question first and use prior turns only when useful. Be accurate, explain reasoning clearly, and do not invent facts. '+followUpRule+' '+taskRules+' '+lengthRule+' '+shapeRule+' For math and science, show important steps and use Unicode symbols such as √, ×, ÷, ±, ≤, ≥, ≠, ≈, →, ∑, π, and °. Never use raw LaTeX commands unless the student explicitly asks for them. For writing, produce the requested draft directly at an appropriate student level. Interpret normal spelling mistakes, shorthand, fragments, and one- or two-word school topics when the intended meaning is reasonably clear; do not force the student to restate an understandable request. For a short topic such as “photosynthesis,” “federalism,” or a misspelled concept, give a direct definition/explanation rather than asking for more detail. For coding or difficult multi-step questions, reason carefully before answering and prioritize correctness over brevity. Keep ordinary answers concise enough to read easily. Never describe how to answer when the user asked you to actually answer. UNIVERSAL REQUEST RULE: Any non-empty student message is a request to help. Interpret the student\'s intent from the wording and conversation context. Short topics, fragments, abbreviations, misspellings, equations, names, dates, code snippets, and conversational follow-ups are all valid inputs. Give the most useful direct answer you can. Do not respond with a request for the student to provide more detail when a reasonable interpretation exists.';
  return [
    {role:'system',content:(clientRules?clientRules+'\n\n':'')+serverRules},
    ...turns.filter(t=>t.role!=='system')
  ];
}

function extractText(data){
  const vals=[
    data?.choices?.[0]?.message?.content,
    data?.choices?.[0]?.delta?.content,
    data?.choices?.[0]?.text,
    data?.text,data?.answer,data?.output_text,
    data?.message?.content,data?.message?.text
  ];
  for(const v of vals){
    if(typeof v==='string'&&v.trim()) return v.trim();
    if(Array.isArray(v)){
      const x=v.map(p=>typeof p==='string'?p:(p?.text||p?.content||'')).join('').trim();
      if(x) return x;
    }
  }
  return '';
}

async function fetchJsonWithTimeout(url,options={},timeoutMs=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    const raw=await r.text();
    let data=null; try{data=raw?JSON.parse(raw):null;}catch{}
    if(!r.ok) throw new Error('HTTP '+r.status);
    return data;
  }finally{clearTimeout(timer);}
}

async function tryPollinationsModel(messages,model,timeoutMs){
  const prompt=messages.map(m=>(m.role==='system'?'INSTRUCTIONS: ':m.role==='assistant'?'TUTOR: ':'STUDENT: ')+m.content).join('\n\n');
  const url='https://text.pollinations.ai/'+encodeURIComponent(prompt)+'?model='+encodeURIComponent(model)+'&seed='+Date.now();
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{headers:{Accept:'text/plain'},signal:controller.signal});
    const text=(await r.text()).trim();
    if(!r.ok||!text) throw new Error('Pollinations returned no text');
    return text;
  }finally{clearTimeout(timer);}
}
function aiQuestionIsComplex(question){
  // Keep ordinary requests on the fast path. Only genuinely multi-step,
  // long-form, or technical prompts get the longer provider budget.
  return /\b(code|debug|fix|program|javascript|python|prove|derive|analy[sz]e|compare|contrast|essay|research|explain why|step by step|reason|evaluate)\b/i.test(question)
    || String(question||'').length>220;
}

async function tryPollinations(messages,complex=false){
  const primary=complex?'mistralai/mistral-small-4':'google/gemini-2.5-flash-lite';
  const secondary=complex?'google/gemini-2.5-flash-lite':'mistralai/mistral-small-4';
  try{
    return await tryPollinationsModel(messages,primary,complex?6500:4800);
  }catch(first){
    return await tryPollinationsModel(messages,secondary,complex?4500:3000);
  }
}

async function tryVireonix(messages,complex=false){
  // Vireonix Auto is the main Tutor model. It automatically routes each request
  // to a capable model for coding, Q&A, reasoning, and writing, without an API key.
  const timeout=complex?15000:10000;
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const r=await fetchJsonWithTimeout('https://vireonix.ai/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({
          model:'auto',
          messages,
          stream:false,
          max_tokens:complex?1400:900,
          temperature:0.2
        })
      },timeout);
      const text=extractText(r);
      if(!text) throw new Error('Vireonix returned no text');
      return text;
    }catch(e){
      lastError=e;
      const msg=String(e?.message||e);
      // Retry only transient failures. A normal successful request uses one
      // provider call, keeping Render bandwidth low.
      if(attempt===0 && /HTTP (429|5\d\d)|AbortError|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)){
        await new Promise(resolve=>setTimeout(resolve,500));
        continue;
      }
      throw e;
    }
  }
  throw lastError||new Error('Vireonix request failed');
}

function responseLooksLikeGenericAdvice(text){
  const a=String(text||'').trim().toLowerCase();
  if(!a) return true;
  return /^(here is a simple way to approach this|a strong .*paragraph should|a good way to approach this)/i.test(a)
    || /\b(generic study advice|identify the main idea|define the important term|finish with a specific example|topic sentence|supporting details|paragraph structure|writing tips|writing advice|study tips|study advice|give me the exact school question|please give me the topic|give me the topic|provide the topic|provide more detail|need more detail|need additional detail|could you clarify|can you clarify|please clarify|what would you like to know|what do you want to know|i need more information|i need more context|i cannot answer without|i can't answer without|i need the full question|please restate|restated question)\b/i.test(a);
}

function topicKeywords(question){
  return String(question||'')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w=>w.length>=3 && !/^(what|when|where|which|who|whom|whose|why|how|does|do|did|is|are|was|were|can|could|would|should|please|explain|tell|give|make|write|show|about|between|simple|simpler|more|than|with|from|that|this|the|and|for|into|your|you|me|my|a|an|to|of|in|on|or|it|its|do|does|did|just|really|literally)$/.test(w));
}

function tutorWordStem(word){
  let w=String(word||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(w.length>6) w=w.replace(/(ing|ed|es|er|ly|s)$/,'');
  return w;
}

function tutorEditDistance(a,b){
  a=tutorWordStem(a); b=tutorWordStem(b);
  if(!a||!b) return 99;
  if(a===b) return 0;
  if(Math.abs(a.length-b.length)>2) return 99;
  const prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(
        cur[j-1]+1,
        prev[j]+1,
        prev[j-1]+(a[i-1]===b[j-1]?0:1)
      );
    }
    for(let j=0;j<cur.length;j++) prev[j]=cur[j];
  }
  return prev[b.length];
}

function tutorWords(text){
  return String(text||'')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w=>w.length>=3);
}

function fuzzyQuestionCoverage(question,answer){
  const qWords=topicKeywords(question);
  const aWords=tutorWords(answer);
  if(!qWords.length||!aWords.length) return 0;
  let matched=0;
  for(const q of qWords){
    if(aWords.some(a=>tutorEditDistance(q,a)<= (q.length>=7?2:1))) matched++;
  }
  return matched/qWords.length;
}

function answerAddressesQuestion(question,answer,sourceMessages){
  const a=String(answer||'').trim();
  if(responseLooksLikeGenericAdvice(a)) return false;

  // Do not require the answer to repeat exact keywords from the question.  // Good answers commonly use synonyms, definitions, examples, equations, or
  // different terminology. The AI is responsible for interpreting the request.
  return a.length>=12;
}

function aWordsContainFuzzy(answer,word){
  const aWords=tutorWords(answer);
  return aWords.some(a=>tutorEditDistance(a,word)<= (String(word).length>=7?2:1));
}

async function raceAiProviders(messages,complex){
  // Bandwidth-safe provider routing: do NOT call both free AI providers for
  // every question. The old concurrent race could make one student question
  // trigger multiple large outbound responses from Render. Use one provider
  // first, then call the backup only when the first provider fails or returns
  // an obviously unusable answer. This keeps the normal path fast and greatly
  // reduces Render outbound bandwidth without removing the backup.
  // Always use Vireonix Auto first. This gives ordinary questions the same
  // capable model routing as harder questions while using one normal AI request.
  // Pollinations remains an emergency backup only.
  const primary = 'vireonix';
  const secondary = 'pollinations';
  const run = name => name === 'vireonix'
    ? tryVireonix(messages,complex)
    : tryPollinations(messages,complex);

  let firstText = '';
  try {
    firstText = String(await run(primary) || '').trim();
    if(firstText && !responseLooksLikeGenericAdvice(firstText)) return firstText;
  } catch(e) {
    console.warn('[AI] primary provider failed:', primary, e?.message || e);
  }

  try {
    const backupText = String(await run(secondary) || '').trim();
    if(backupText && !responseLooksLikeGenericAdvice(backupText)) return backupText;
    if(firstText) return firstText;
  } catch(e) {
    console.warn('[AI] backup provider failed:', secondary, e?.message || e);
  }

  if(firstText) return firstText;
  throw new Error('Free AI providers did not respond in time.');
}

function countAiSentences(text){
  const cleaned=String(text||'').replace(/\s+/g,' ').trim();
  if(!cleaned) return 0;
  return cleaned.split(/(?<=[.!?])(?:["')\]]+)?\s+/).filter(Boolean).length;
}

function answerNeedsRepair(question,answer,sourceMessages){
  const context=sourceMessages||[];
  const constraints=requestedWritingConstraints(context.length?context:[{role:'user',content:String(question||'')}]);
  const q=String(question||'').trim();
  const a=String(answer||'').trim();
  if(!a) return true;
  if(responseLooksLikeGenericAdvice(a)) return true;
  if(!answerAddressesQuestion(q,a,context)) return true;
  const task=classifyAiTask(q);
  const lowerA=a.toLowerCase();

  if(task==='direct-writing'){
    // Catch the exact failure mode where the model explains how to write instead
    // of performing the requested writing task.
    const metaSignals=/(strong .*paragraph should|topic sentence|supporting details|paragraph structure|a good paragraph|to write (?:a|the) paragraph|here'?s how to (?:write|structure)|writing (?:tips|advice)|outline)/i;
    if(metaSignals.test(a)) return true;
    const range=constraints.sentenceRange || requestedSentenceRange(q);
    if(range){
      const count=countAiSentences(a);
      if(count<range.min || count>range.max) return true;
    }
    if(constraints.singleParagraph){
      const paragraphs=a.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
      if(paragraphs.length!==1) return true;
      if(/^#{1,6}\s/.test(a)) return true; // no standalone title for a single-paragraph request
    } else if(constraints.requestedParagraphRange){
      const paragraphs=a.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
      if(paragraphs.length<constraints.requestedParagraphRange.min || paragraphs.length>constraints.requestedParagraphRange.max) return true;
    }
  }

  if(/\b(generate|write|create|draft|compose|produce|calculate|solve|factor|simplify)\b/i.test(q) &&
     /\b(here is a way|a good way to|you should|you can start by|the best approach|approach this by|steps to|how to)\b/i.test(lowerA)){
    return true;
  }
  return false;
}

async function repairAiResponse(question,complex,sourceMessages){
  const source=normalizeAiMessages(sourceMessages);
  const constraints=requestedWritingConstraints(source);
  const range=constraints.sentenceRange || requestedSentenceRange(question);
  const task=classifyAiTask(question);
  const priorAssistant=[...source].reverse().find(m=>m.role==='assistant')?.content||'';
  const earlierUser=[...source].reverse().find(m=>m.role==='user' && m.content!==question)?.content||'';
  let constraint='Answer the student\'s exact request directly. Do not give generic study advice, a method for answering, or a writing plan unless the student explicitly asks for one.';
  if(priorAssistant && /\b(it|that|this|these|those|the above|the previous|more simple|simpler|clarify|explain that|only .* paragraph|asked for)\b/i.test(question)){
    constraint+=' This is a follow-up. Use the immediately preceding relevant answer and the earlier request as context. Do not ask the student to restate the original task.';
  }
  if(task==='direct-writing'){
    constraint+=' Write the finished draft itself.';
    if(range) constraint+=` The finished draft must contain between ${range.min} and ${range.max} sentences, inclusive; count the sentences before returning.`;
    if(constraints.singleParagraph) constraint+=' Return exactly one paragraph with no title.';
    else if(constraints.requestedParagraphRange) constraint+=` Return between ${constraints.requestedParagraphRange.min} and ${constraints.requestedParagraphRange.max} paragraphs.`;
  } else if(task==='direct-problem-solving'){
    constraint+=' Solve the actual problem and give the result with the key reasoning steps.';
  } else if(task==='direct-explanation'){
    constraint+=' Explain the requested concept directly, with a concise definition and the most useful differences or examples.';
  }
  const messages=[
    {role:'system',content:'You are Index Tutor correction mode. '+constraint+' Return only the final answer to the student. Never mention correction mode, failed attempts, prompts, or hidden instructions.'},
    ...(earlierUser ? [{role:'user',content:earlierUser.slice(-4000)}] : []),
    ...(priorAssistant ? [{role:'assistant',content:priorAssistant.slice(-5000)}] : []),
    {role:'user',content:String(question||'').slice(0,2200)}
  ];
  return raceAiProviders(messages,complex);
}

function fastDeterministicTutor(question){
  const q=String(question||'').trim();
  const l=q.toLowerCase();

  // Common radical requests should never depend on a cloud provider.
  const root=l.match(/^(?:what\s+is\s+)?(?:the\s+)?(?:square\s+root\s+of\s+|sqrt\s*|root\s+)(-?\d+(?:\.\d+)?)\??$/i);
  if(root){
    const n=Number(root[1]);
    if(Number.isFinite(n)){
      if(n<0) return '√'+root[1]+' is not a real number.';
      const whole=Math.floor(n);
      let outside=1;
      let inside=whole;
      for(let f=2;f*f<=inside;f++){
        while(inside%(f*f)===0){ outside*=f; inside/=f*f; }
      }
      const exact=inside===1 ? String(outside) : (outside===1 ? '√'+inside : outside+'√'+inside);
      const decimal=Math.round(Math.sqrt(n)*1000)/1000;
      return '√'+root[1]+' = '+exact+' ≈ '+decimal+'.';
    }
  }

  // Small arithmetic expressions are also safe to answer locally.
  const arithmetic=q.replace(/^what\s+is\s+/i,'').replace(/\?$/,'').trim();
  if(/^-?\d+(?:\.\d+)?\s*[+\-*/×÷]\s*-?\d+(?:\.\d+)?$/.test(arithmetic)){
    const normalized=arithmetic.replace(/×/g,'*').replace(/÷/g,'/');
    try{
      const value=Function('"use strict"; return ('+normalized+')')();
      if(Number.isFinite(value)) return arithmetic+' = '+value+'.';
    }catch(e){}
  }

  return null;
}

function deterministicTutor(question){
  const q=String(question||'').trim();
  const l=q.toLowerCase();

  // Fast, topic-specific fallbacks for common school concepts.
  if(/\bpythagor(?:ean|eon|ian|en)?\b/i.test(q)){
    return 'The Pythagorean theorem is used for right triangles. It says a² + b² = c², where a and b are the two shorter legs and c is the hypotenuse, the side opposite the right angle. For example, if the legs are 3 and 4, then 3² + 4² = c², so 9 + 16 = 25 and c = 5.';
  }
  if(/\barea\b.*\btriangle\b/i.test(q)){
    return 'The area of a triangle is A = ½bh, where b is the base and h is the height. Multiply the base by the height, then divide by 2.';
  }
  if(/\b(slope|slope formula)\b/i.test(q)){
    return 'Slope tells you how steep a line is. Use m = (y₂ − y₁) ÷ (x₂ − x₁), which means change in y divided by change in x.';
  }

  // Direct fallback for common everyday/financial questions.
  if(/\b(difference|different)\b.*\b(bank|credit union)\b|\b(bank|credit union)\b.*\b(difference|different)\b/i.test(q)){
    return 'A bank is a for-profit financial institution owned by investors, while a credit union is a member-owned, not-for-profit financial cooperative. Banks generally serve anyone who meets their account requirements, while credit unions usually require you to qualify for membership. Credit unions may return some of their earnings to members through lower fees or loan rates, while banks may offer a wider range of products or locations. Both can provide checking and savings accounts, loans, and other financial services.';
  }

  // Direct writing fallback for common school prompts.
  if(/\b(paragraph|essay|draft|response)\b/i.test(q) && /\b(?:on|about|regarding)\b/i.test(q) && /climate\s+change/i.test(q)){
    const constraints=requestedWritingConstraints([{role:'user',content:q}]);
    const range=constraints.requestedParagraphRange;
    const count=range ? Math.max(range.min,Math.min(range.max,6)) : 1;
    const paragraphs=[
      'Climate change is a long-term change in Earth’s temperatures and weather patterns. Today, much of the warming is connected to human activities that add greenhouse gases to the atmosphere. Burning coal, oil, and natural gas releases carbon dioxide, while other activities also add greenhouse gases. These gases trap heat and cause the planet to warm.',
      'One major cause of climate change is the use of fossil fuels. Cars, airplanes, factories, power plants, and other machines often depend on coal, oil, or natural gas. Agriculture and deforestation also contribute by changing how carbon is stored and released. As these activities continue, greenhouse gas levels can increase.',
      'Climate change affects natural systems in many ways. Rising temperatures can melt glaciers and ice sheets and contribute to sea-level rise. Some regions experience more intense heat, drought, heavy rainfall, or other changes in weather patterns. Plants and animals may also have to move or adapt as their environments change.',
      'People can experience these effects in their daily lives. Hotter conditions can make heat waves more dangerous, while changing rainfall can affect farming and water supplies. Coastal communities can face greater risks from rising seas and stronger storms. Climate-related changes can also create economic challenges when homes, roads, crops, or businesses are damaged.',
      'There are several ways societies can respond to climate change. Using renewable energy, improving energy efficiency, protecting forests, and developing cleaner transportation can reduce greenhouse gas emissions. Communities can also prepare for impacts by improving infrastructure, planning for extreme weather, and protecting important natural areas.',
      'Climate change is a complicated problem, but people and governments can take meaningful steps to address it. Scientific research can help communities understand risks and choose effective solutions. Individual choices can contribute, but large-scale changes in energy, transportation, buildings, and industry are also important. Working on both reducing emissions and preparing for future impacts can help create a more resilient future.'
    ];
    return paragraphs.slice(0,count).join('\\n\\n');
  }

  // Fast math examples.
  const root=l.match(/^(?:what\s+is\s+)?(?:the\s+)?(?:square\s+root\s+of|sqrt|root)\s*([0-9]+(?:\.[0-9]+)?)\??$/i);
  if(root){
    const n=Number(root[1]);
    if(Number.isFinite(n)&&n>=0){
      const r=Math.sqrt(n), rounded=Math.round(r*1000)/1000;
      return '√'+root[1]+' ≈ '+rounded+'.';
    }
  }

  if(/^what\s+is\s+federalism\??$/i.test(q))
    return 'Federalism is a system of government in which power is divided between a national government and state governments. In the United States, the federal government handles national issues such as defense and foreign policy, while states have power over many areas such as education and local government. Federalism matters because it prevents all government power from being concentrated at one level.';
  if(/^what\s+is\s+separation\s+of\s+powers\??$/i.test(q))
    return 'Separation of powers divides government responsibilities among different branches. In the United States, Congress makes laws, the president carries out laws, and the courts interpret laws. This structure helps prevent one part of government from becoming too powerful.';

  if(/^what\s+are\s+checks\s+and\s+balances\??$/i.test(q))
    return 'Checks and balances is the system that allows each branch of the U.S. government to limit the powers of the other branches. For example, Congress can pass a bill, the president can veto it, and Congress can override a veto with enough votes. The goal is to prevent one branch from becoming too powerful.';

  if(/\bwrite me\b|\bwrite a\b|\bparagraph\b/i.test(q))
    return 'Please give me the topic and any sentence or grade-level requirement, and I will write the paragraph itself.';

  if(/^(hi|hello|hey)\b/i.test(q)) return 'Hi! What are you working on?';

  return 'I could not reach the AI service for this request right now. Please try the same question again.';
}

app.post('/api/ai/chat',async(req,res)=>{
  try{
    const messages=buildAiMessages(req.body?.messages);
    if(!messages.length) return res.status(400).json({error:'No question was supplied.'});
    if(!aiContentIsAllowed(messages)) return res.status(400).json({error:aiModerationMessage()});
    const question=latestUserQuestion(messages);
    const complex=aiQuestionIsComplex(question);

    // Answer simple deterministic math locally before touching any external
    // provider. This makes basic questions reliable even if a cloud provider
    // is unavailable, rate-limited, or temporarily broken.
    const fast=fastDeterministicTutor(question);
    if(fast) return res.json({text:fast,provider:'built-in-fast-fallback',fallback:true});

    // Race the free providers, but reject obvious generic/meta answers. Relevance
    // validation is intentionally permissive for full questions so valid answers
    // that use synonyms or different terminology are not thrown away.
    try{
      let text=await raceAiProviders(messages,complex);
      if(answerNeedsRepair(question,text,messages)){
        try{
          const repaired=await repairAiResponse(question,complex,messages);
          if(repaired && !answerNeedsRepair(question,repaired,messages)) text=repaired;
          else if(repaired) text=repaired;
        }catch(e2){
          console.warn('[AI] response repair failed:',e2?.message||e2);
        }
      }
      if(answerNeedsRepair(question,text,messages)){
        return res.json({text:deterministicTutor(question),provider:'built-in-fallback',fallback:true});
      }
      return res.json({text,provider:'free-cloud-race'});
    }catch(e){
      console.warn('[AI] cloud providers failed:',e?.message||e);
      return res.json({text:deterministicTutor(question),provider:'built-in-fallback',fallback:true});
    }
  }catch(e){
    // Never turn an AI failure into a generic 500 that the browser interprets
    // as “The AI service could not answer right now.” Return a usable answer
    // payload instead.
    console.error('[AI] request handling error:',e?.stack||e);
    const question=String(req.body?.messages?.slice?.(-1)?.find?.(m=>m?.role==='user')?.content||'').trim();
    return res.json({text:deterministicTutor(question),provider:'built-in-fallback',fallback:true});
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // Keep live-game behavior unchanged while compressing larger Socket.IO
  // messages. Small real-time messages stay uncompressed to avoid CPU overhead.
  perMessageDeflate: { threshold: 1024 },
  httpCompression: true
});

/* ============================== ACCOUNTS ============================== */
/**
 * Accounts use Supabase when SUPABASE_URL plus a server-side service-role/secret
 * key are configured. Without Supabase, the app falls back to data/users.json.
 * Browser study data is always cached locally; account state is synced to the
 * configured account store so signed-in progress can persist across devices.
 * Sessions remain in memory, so users log in again after a server restart.
 *
 * User = {
 *   id, method: 'email', identifier, username,
 *   passwordHash, salt,
 *   firstName, lastName,              // optional display name
 *   createdAt, resetTokenHash, resetExpiresAt
 * }
 */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
let users = new Map(); // key: `${method}:${identifier}` -> user
let usersById = new Map();
let usersByUsername = new Map();

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_ENABLED) throw new Error('Persistent account storage is not configured. Render needs SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
  if (!response.ok) throw new Error((data && data.message) || (data && data.error) || `Supabase HTTP ${response.status}`);
  return data;
}
async function verifySupabaseAccountStorage() {
  if (!SUPABASE_ENABLED) return { ready:false, reason:'missing environment variables' };
  try {
    await supabaseRequest(`${SUPABASE_TABLE}?select=id&limit=1`);
    return { ready:true };
  } catch (e) {
    console.error('Supabase account storage check failed:', e.message);
    return { ready:false, reason:String(e.message || e) };
  }
}

async function dbFindUserById(id) {
  if (!SUPABASE_ENABLED) return null;
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,method,email,username,google_id,password_hash,salt,first_name,last_name,created_at,account_data,account_data_blob&id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}
async function dbFindUserByEmail(email) {
  if (!SUPABASE_ENABLED) return null;
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,method,email,username,google_id,password_hash,salt,first_name,last_name,created_at&id=eq.${encodeURIComponent(normalizeEmail(email))}&limit=1`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}
async function dbFindUserByUsername(username) {
  if (!SUPABASE_ENABLED) return null;
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,method,email,username,google_id,password_hash,salt,first_name,last_name,created_at&username=eq.${encodeURIComponent(normalizeUsername(username))}&limit=1`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function dbFindUserByGoogleId(googleId) {
  if (!SUPABASE_ENABLED) return null;
  const rows = await supabaseRequest(`${SUPABASE_TABLE}?select=id,method,email,username,google_id,password_hash,salt,first_name,last_name,created_at&google_id=eq.${encodeURIComponent(String(googleId))}&limit=1`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}
function decodeAccountData(row) {
  if (!row) return null;
  if (row.account_data_blob) {
    try {
      const raw = zlib.brotliDecompressSync(Buffer.from(String(row.account_data_blob), 'base64')).toString('utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Could not decompress account data:', e.message);
    }
  }
  return row.account_data || null;
}
function encodeAccountData(data) {
  const json = JSON.stringify(data ?? null);
  const compressed = zlib.brotliCompressSync(Buffer.from(json, 'utf8'), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
  return compressed.toString('base64');
}
function dbRowToUser(row) {
  if (!row) return null;
  const user = {
    id: row.id,
    method: row.method || 'email',
    identifier: row.email || '',
    username: row.username || '',
    passwordHash: row.password_hash || '',
    salt: row.salt || '',
    googleId: row.google_id || '',
    email: row.email || '',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
  };
  // Identity-only queries intentionally omit account_data_blob. Don't attach a null
  // accountData property in that case, or a later metadata save could erase the blob.
  if (Object.prototype.hasOwnProperty.call(row, 'account_data_blob') || Object.prototype.hasOwnProperty.call(row, 'account_data')) {
    user.accountData = decodeAccountData(row);
  }
  return user;
}
async function dbSaveUser(user, extra = {}) {
  if (!SUPABASE_ENABLED) return;
  const row = {
    id: user.id,
    method: user.method || 'email',
    email: user.email || (user.method === 'email' ? user.identifier : '') || null,
    username: user.username || null,
    google_id: user.googleId || null,
    password_hash: user.passwordHash || null,
    salt: user.salt || null,
    first_name: user.firstName || '',
    last_name: user.lastName || '',
    updated_at: new Date().toISOString(),
    ...extra
  };
  // Only touch the account-data columns when accountData was actually loaded or changed.
  // This prevents a lightweight login/profile lookup from accidentally erasing a user's
  // larger compressed account blob.
  if (Object.prototype.hasOwnProperty.call(user, 'accountData') && user.accountData !== undefined) {
    row.account_data_blob = user.accountData === null ? null : encodeAccountData(user.accountData);
    row.account_data = null;
  }
  if (!row.created_at) row.created_at = new Date(user.createdAt || Date.now()).toISOString();  await supabaseRequest(SUPABASE_TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
}

async function dbCreateOrUpdateGoogleUser(profile) {
  const googleId = String(profile?.sub || '');
  if (!googleId) throw new Error('Google did not return a user id.');
  let row = await dbFindUserByGoogleId(googleId);
  if (!row && profile.email) row = await dbFindUserByEmail(profile.email);
  if (row) {
    // Identity lookups intentionally omit the compressed payload for efficiency;
    // fetch it only once we know which account to use.
    const fullRow = await dbFindUserById(row.id);
    const user = dbRowToUser(fullRow || row);
    user.method = 'google';
    user.googleId = googleId;
    user.email = normalizeEmail(profile.email || user.email || '');
    user.identifier = user.email;
    user.accountData = row.account_data || user.accountData;
    if (!user.username) user.username = makeUniqueUsername(user.email, user.id);
    await dbSaveUser(user);
    return user;
  }
  const email = normalizeEmail(profile.email || '');
  const user = {
    id: crypto.randomBytes(12).toString('hex'),
    method: 'google', identifier: email, email, username: makeUniqueUsername(email, crypto.randomBytes(4).toString('hex')),
    passwordHash: '', salt: '', googleId, firstName: '', lastName: '', createdAt: Date.now(), accountData: null
  };
  await dbSaveUser(user);
  return user;
}

function normalizeUsername(v) { return String(v || '').trim().toLowerCase(); }
function isValidUsername(v) { return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(v); }
function makeUniqueUsername(email, seed, migration=false) {
  const base = normalizeUsername(String(email || '').split('@')[0]).replace(/[^a-z0-9._-]/g,'').replace(/^[._-]+|[._-]+$/g,'').slice(0,20) || 'student';
  let candidate = base || 'student';
  let n = 2;
  while(usersByUsername.has(candidate)) candidate = (base.slice(0, Math.max(1, 24 - String(n).length)) + n).slice(0,24);
  return candidate.length >= 3 ? candidate : ('student'+String(seed || '').slice(0,5)).slice(0,24);
}
function loadUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(USERS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      arr.forEach(u => {
        delete u.school; delete u.grade;
        if(u.method !== 'email') return;
        if(!u.username) u.username = makeUniqueUsername(u.identifier, u.id, true);
        u.username = normalizeUsername(u.username);
        users.set(u.method + ':' + u.identifier, u);
        usersById.set(u.id, u);
        usersByUsername.set(u.username, u);
      });
      saveUsers();
    }
  } catch (e) { console.error('Could not load users.json:', e.message); }
}
function saveUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(Array.from(usersById.values()), null, 2));
  } catch (e) { console.error('Could not save users.json:', e.message); }
}
if (!SUPABASE_ENABLED) loadUsers();

const sessions = new Map(); // token -> { userId, createdAt }

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(check, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, method: u.method || 'email', email: u.email || u.identifier || '', username: u.username || '',
    firstName: u.firstName || '', lastName: u.lastName || '',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ')
  };
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; SameSite=Lax${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
function sessionSigningSecret() {
  // Reuse the existing server-only Supabase secret when persistent storage is enabled.
  // No new Render variable is required, and the secret is never sent to the browser.
  return crypto.createHash('sha256')
    .update('index-session-v1:')
    .update(SUPABASE_SERVICE_ROLE_KEY || 'index-session-local-fallback')
    .digest();
}
function createSession(userId) {
  if (SUPABASE_ENABLED) {
    const exp = Date.now() + SESSION_MAX_AGE_MS;
    const payload = Buffer.from(String(userId),'utf8').toString('base64url') + '.' + String(exp);
    const sig = crypto.createHmac('sha256',sessionSigningSecret()).update(payload).digest('base64url');
    return 'p.' + payload + '.' + sig;
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
}
function readPersistentSession(token) {
  if (!SUPABASE_ENABLED || typeof token !== 'string' || !token.startsWith('p.')) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const payload = parts[1]+'.'+parts[2];
  const sig = parts[3];
  const expected = crypto.createHmac('sha256',sessionSigningSecret()).update(payload).digest('base64url');
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  const exp=Number(parts[2]);
  if(!Number.isFinite(exp) || exp<Date.now()) return null;
  let userId;
  try{ userId=Buffer.from(parts[1],'base64url').toString('utf8'); }catch(e){ return null; }
  return {userId,exp};
}
app.use(async (req, res, next) => {
  try{
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    const session = token && sessions.get(token);
    req.user = session ? usersById.get(session.userId) || null : null;
    req.sessionToken = token || null;

    const persistent = !req.user && readPersistentSession(token);
    if(persistent && SUPABASE_ENABLED){
      const row = await dbFindUserById(persistent.userId);
      if(row){
        req.user = dbRowToUser(row);
        usersById.set(req.user.id,req.user);
        if(req.user.email) users.set('email:'+normalizeEmail(req.user.email),req.user);
        if(req.user.username) usersByUsername.set(normalizeUsername(req.user.username),req.user);
      }
    }
    next();
  }catch(e){
    console.error('Session lookup error:',e.message);
    req.user=null;
    req.sessionToken=null;
    next();
  }
});

function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

app.get('/api/auth/status', async (req, res) => {
  let persistentStorageReady = false;
  if (SUPABASE_ENABLED) {
    try {
      await supabaseRequest(`${SUPABASE_TABLE}?select=id&limit=1`);
      persistentStorageReady = true;
    } catch (e) {
      console.error('Supabase account storage health check failed:', e.message);
    }
  }
  res.json({ googleEnabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET), persistentStorageEnabled: SUPABASE_ENABLED, persistentStorageReady });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    let { method, identifier, username, password } = req.body || {};
    if (method !== 'email') return res.status(400).json({ error: 'Only email sign-up is supported.' });
    identifier = normalizeEmail(identifier);
    username = normalizeUsername(username);
    if (!isValidEmail(identifier)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!isValidUsername(username)) return res.status(400).json({ error: 'Username must be 3–24 characters and use only letters, numbers, periods, underscores, or hyphens.' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    let existing = users.get('email:' + identifier);    if (SUPABASE_ENABLED) { const row = await dbFindUserByEmail(identifier); if (row) existing = dbRowToUser(row); }
    if (existing) return res.status(409).json({ error: 'An account with that email already exists — try logging in instead.' });
    let existingUsername = usersByUsername.get(username);
    if (SUPABASE_ENABLED) {
      const row = await dbFindUserByUsername(username);
      if (row) existingUsername = dbRowToUser(row);
    }
    if (existingUsername) return res.status(409).json({ error: 'That username is already taken. Choose another one.' });
    const { salt, hash } = hashPassword(password);
    const user = { id: crypto.randomBytes(12).toString('hex'), method:'email', identifier, email:identifier, username, passwordHash: hash, salt, firstName:'', lastName:'', createdAt:Date.now(), accountData: null };
    if (SUPABASE_ENABLED) await dbSaveUser(user);
    users.set('email:' + identifier, user); usersById.set(user.id, user); usersByUsername.set(username, user); if(!SUPABASE_ENABLED) saveUsers();
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.json({ ok:true, user:publicUser(user), isNew:true });
  } catch (e) {
    console.error('Signup error:', e.message);
    const dbProblem = /permission denied|not configured|supabase|relation .* does not exist/i.test(String(e.message || ''));
    res.status(500).json({ error: dbProblem ? 'The account database is not ready. Make sure Render uses the Supabase service-role/secret key and that SUPABASE-SETUP.sql has been run.' : 'Could not create the account right now.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    let { method, identifier, password } = req.body || {};
    if (method !== 'email') return res.status(400).json({ error: 'Only email/username sign-in is supported.' });
    identifier = String(identifier || '').trim();
    let user = null;
    if (SUPABASE_ENABLED) {
      user = await dbFindUserByEmail(identifier);
      if (!user) user = await dbFindUserByUsername(identifier);
      user = dbRowToUser(user);
    }
    if (!user) {
      const normalized = normalizeEmail(identifier);
      user = users.get('email:' + normalized) || usersByUsername.get(normalizeUsername(identifier)) || null;
    }
    if (!user || !user.passwordHash || !verifyPassword(password || '', user.salt, user.passwordHash)) {
      return res.status(401).json({ error: 'Incorrect email/username or password.' });
    }
    users.set('email:' + normalizeEmail(user.email || user.identifier), user);
    if(user.username) usersByUsername.set(normalizeUsername(user.username), user);
    usersById.set(user.id, user);
    if (SUPABASE_ENABLED) await dbSaveUser(user);
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.json({ ok:true, user:publicUser(user), isNew:!user.firstName });
  } catch (e) {
    console.error('Login error:', e.message);
    const dbProblem = /permission denied|not configured|supabase|relation .* does not exist/i.test(String(e.message || ''));
    res.status(500).json({ error: dbProblem ? 'The account database is not ready. Make sure Render uses the Supabase service-role/secret key and that SUPABASE-SETUP.sql has been run.' : 'Could not sign in right now.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionToken) sessions.delete(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});


function sanitizeAccountState(input){
  const src = input && typeof input === 'object' ? input : {};
  const p = src.progress && typeof src.progress === 'object' ? src.progress : {};
  const profile = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const equipped = p.equipped && typeof p.equipped === 'object' ? p.equipped : {};
  const notes = Array.isArray(src.notes) ? src.notes.slice(0, 500) : [];
  const studySets = Array.isArray(src.studySets) ? src.studySets.slice(0, 300) : [];
  const customTopics = src.customTopics && typeof src.customTopics === 'object' ? src.customTopics : {};
  const candidate = {
    version: 2,
    notes,
    studySets,
    customTopics,
    progress: {
      xp: Math.max(0, Math.min(100000000, Number(p.xp)||0)),
      activeDates: Array.isArray(p.activeDates) ? p.activeDates.slice(0, 500) : [],
      lessonsLearned: Array.isArray(p.lessonsLearned) ? p.lessonsLearned.slice(0, 5000) : [],
      coins: Math.max(0, Math.min(100000000, Number(p.coins)||0)),
      unlockedCosmetics: Array.isArray(p.unlockedCosmetics) ? p.unlockedCosmetics.slice(0, 500) : [],
      claimedBPLevels: Array.isArray(p.claimedBPLevels) ? p.claimedBPLevels.slice(0, 100) : [],
      skinCrates: Math.max(0, Math.min(1000000, Math.floor(Number(p.skinCrates)||0))),
      unlockedSkins: Array.isArray(p.unlockedSkins) ? p.unlockedSkins.slice(0, 500) : [],
      claimedSkinCrateLevels: Array.isArray(p.claimedSkinCrateLevels) ? p.claimedSkinCrateLevels.slice(0, 50) : [],
      equipped: {
        indexling: String(equipped.indexling||'ling-sugarbug').slice(0,80),
        indexlingSkin: String(equipped.indexlingSkin||'').slice(0,80),
        frame: String(equipped.frame||'default').slice(0,80)
      },
      openedPacks: Math.max(0, Math.min(1000000, Number(p.openedPacks)||0)),
      liveGames: Math.max(0, Math.min(1000000, Number(p.liveGames)||0)),
      dailyCoinDate: String(p.dailyCoinDate || '').slice(0, 10),
      dailyCoinEarned: Math.max(0, Math.min(DAILY_COIN_CAP, Number(p.dailyCoinEarned)||0)),
      dailyWheelDate: String(p.dailyWheelDate || '').slice(0, 10),
      dailyWheelLastSpinAt: Math.max(0, Number(p.dailyWheelLastSpinAt)||0),
      dailyWheelReward: Math.max(0, Math.min(500, Number(p.dailyWheelReward)||0))
    },
      quests: src.quests && typeof src.quests==='object' ? {
        day: String(src.quests.day||'').slice(0,10),
        baseline: src.quests.baseline && typeof src.quests.baseline==='object' ? src.quests.baseline : {},
        progress: src.quests.progress && typeof src.quests.progress==='object' ? src.quests.progress : {},
        claimed: src.quests.claimed && typeof src.quests.claimed==='object' ? src.quests.claimed : {},
        announced: src.quests.announced && typeof src.quests.announced==='object' ? src.quests.announced : {}
      } : null,
    profile: {
      name: String(profile.name||'').slice(0,60),
      district: String(profile.district||'').slice(0,200),
      county: String(profile.county||'').slice(0,80),
      countyName: String(profile.countyName||'').slice(0,200)
    },
    savedAt: Date.now()
  };
  const serializedSize = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
  if (serializedSize > 1400000) throw new Error('Account data is too large to save. Keep very large files outside your account notes.');
  return candidate;
}
app.get('/api/account/state', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try {
    if (SUPABASE_ENABLED) {
      const row = await dbFindUserById(req.user.id);
      if (row) req.user = dbRowToUser(row);
      usersById.set(req.user.id, req.user);
    }
    res.json({ok:true, state:req.user.accountData || null});
  } catch(e) {
    res.status(503).json({error:'Your account database is temporarily unavailable. Try again.'});
  }
});
app.put('/api/account/state', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try {
    req.user.accountData = sanitizeAccountState(req.body?.state);
    if (SUPABASE_ENABLED) await dbSaveUser(req.user);
    else saveUsers();
    res.json({ok:true, state:req.user.accountData, storage:SUPABASE_ENABLED?'supabase':'server-file', compressed:true});
  } catch(e) {
    console.error('Account state save error:', e.message);
    res.status(503).json({error:'Could not save your account data right now. Please try again.'});
  }
});

app.get('/api/account/quests', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try{
    if(SUPABASE_ENABLED){ const row=await dbFindUserById(req.user.id); if(row) req.user=dbRowToUser(row); }
    const accountData=req.user.accountData||{};
    res.json({ok:true,quests:accountData.quests||null});
  }catch(e){
    console.error('Quest state load error:',e.message);
    res.status(503).json({error:'Could not load quest progress right now.'});
  }
});
app.put('/api/account/quests', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try{
    if(SUPABASE_ENABLED){ const row=await dbFindUserById(req.user.id); if(row) req.user=dbRowToUser(row); }
    const existing=req.user.accountData&&typeof req.user.accountData==='object'?req.user.accountData:{};
    const raw=req.body?.quests&&typeof req.body.quests==='object'?req.body.quests:{};
    const clean={
      day:String(raw.day||'').slice(0,10),
      baseline:raw.baseline&&typeof raw.baseline==='object'?raw.baseline:{},
      progress:raw.progress&&typeof raw.progress==='object'?raw.progress:{},
      claimed:raw.claimed&&typeof raw.claimed==='object'?raw.claimed:{},
      announced:raw.announced&&typeof raw.announced==='object'?raw.announced:{}
    };
    req.user.accountData=sanitizeAccountState({...existing,quests:clean});
    if(SUPABASE_ENABLED) await dbSaveUser(req.user); else saveUsers();
    usersById.set(req.user.id,req.user);
    res.json({ok:true,quests:req.user.accountData.quests});
  }catch(e){
    console.error('Quest state save error:',e.message);
    res.status(503).json({error:'Could not save quest progress right now. Please try again.'});
  }
});
// Quest claim is server-authoritative: the quest flag and Battle Pass XP are
// committed together so a sign-out/reload cannot lose the reward or duplicate it.
const QUEST_REWARDS = Object.freeze({ai:15,set:10,lessons:20,xp:25,packs:15});
app.post('/api/account/quest-claim', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try{
    if(SUPABASE_ENABLED){
      const row=await dbFindUserById(req.user.id);
      if(row) req.user=dbRowToUser(row);
    }
    const questId=String(req.body?.questId||'');
    const rewardXP=Number(QUEST_REWARDS[questId]||0);
    if(!rewardXP) return res.status(400).json({error:'That quest is not claimable.'});
    const existing=req.user.accountData&&typeof req.user.accountData==='object'?req.user.accountData:{};
    const quests=existing.quests&&typeof existing.quests==='object'?existing.quests:null;
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(!quests||String(quests.day||'')!==today) return res.status(409).json({error:'This quest day has expired. Refresh your quests.'});
    const claimed=quests.claimed&&typeof quests.claimed==='object'?{...quests.claimed}:{};
    if(claimed[questId]) return res.status(409).json({error:'This quest has already been claimed.',state:existing,quests});
    const progress=existing.progress&&typeof existing.progress==='object'?existing.progress:{};
    const updatedProgress={...progress,xp:Math.max(0,Number(progress.xp)||0)+rewardXP};
    claimed[questId]=Date.now();
    const updatedQuests={...quests,claimed};
    const updated=sanitizeAccountState({...existing,progress:updatedProgress,quests:updatedQuests});
    req.user.accountData=updated;    if(SUPABASE_ENABLED) await dbSaveUser(req.user); else saveUsers();
    usersById.set(req.user.id,req.user);
    res.json({ok:true,rewardXP,state:updated.progress,quests:updated.quests});
  }catch(e){
    console.error('Quest claim error:',e.message);
    res.status(503).json({error:'Could not save the quest reward right now. Please try again.'});
  }
});

app.put('/api/account/equipped', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Not signed in.'});
  try{
    if (SUPABASE_ENABLED) {
      const row = await dbFindUserById(req.user.id);
      if (row) req.user = dbRowToUser(row);
    }
    const existing = req.user.accountData && typeof req.user.accountData==='object' ? req.user.accountData : {};
    const existingProgress = existing.progress && typeof existing.progress==='object' ? existing.progress : {};
    const incoming = req.body && typeof req.body==='object' && req.body.equipped && typeof req.body.equipped==='object' ? req.body.equipped : {};
    const equipped = {
      ...existingProgress.equipped,
      indexling: String(incoming.indexling || existingProgress.equipped?.indexling || 'ling-sugarbug').slice(0,80),
      indexlingSkin: String(incoming.indexlingSkin || existingProgress.equipped?.indexlingSkin || '').slice(0,80),
      frame: String(incoming.frame || existingProgress.equipped?.frame || 'default').slice(0,80)
    };
    const updated = sanitizeAccountState({...existing,progress:{...existingProgress,equipped}});
    req.user.accountData = updated;
    if(SUPABASE_ENABLED) await dbSaveUser(req.user); else saveUsers();
    usersById.set(req.user.id,req.user);
    res.json({ok:true,equipped:updated.progress.equipped});
  }catch(e){
    console.error('Equipped state save error:',e.message);
    res.status(503).json({error:'Could not sync your equipped items right now. Please try again.'});
  }
});

app.post('/api/rewards/daily-wheel/spin', async (req,res)=>{
  if(!req.user) return res.status(401).json({error:'Sign in to use the Daily Wheel so your reward can sync to your account.'});
  try {
    if (SUPABASE_ENABLED) { const row = await dbFindUserById(req.user.id); if (row) req.user = dbRowToUser(row); }
    const existing = req.user.accountData && typeof req.user.accountData === 'object' ? req.user.accountData : {};
    const progress = existing.progress && typeof existing.progress === 'object' ? existing.progress : {};
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (String(progress.dailyWheelDate || '') === today) return res.status(409).json({error:'You already spun today.', reward:Number(progress.dailyWheelReward)||0, state:existing});
    const rewards=[
      {amount:5,weight:14},{amount:10,weight:12},{amount:15,weight:10},{amount:20,weight:9},{amount:25,weight:9},
      {amount:30,weight:8},{amount:40,weight:7},{amount:50,weight:7},{amount:60,weight:6},{amount:75,weight:5},
      {amount:100,weight:4},{amount:125,weight:3},{amount:150,weight:2.5},{amount:250,weight:2},{amount:500,weight:1.5}
    ];
    const total=rewards.reduce((a,r)=>a+r.weight,0); let roll=crypto.randomInt(0,1000000)/1000000*total; let rolled=rewards[rewards.length-1].amount;
    for(const item of rewards){ if((roll-=item.weight)<0){rolled=item.amount;break;} }
    const earnedToday=progress.dailyCoinDate===today?Math.max(0,Number(progress.dailyCoinEarned)||0):0;
    const grant=Math.max(0,Math.min(rolled,DAILY_COIN_CAP-earnedToday));
    const updated={...existing,progress:{...progress,coins:Math.max(0,Number(progress.coins)||0)+grant,dailyCoinDate:today,dailyCoinEarned:earnedToday+grant,dailyWheelDate:today,dailyWheelLastSpinAt:Date.now(),dailyWheelReward:grant}};
    req.user.accountData=sanitizeAccountState(updated);
    if(SUPABASE_ENABLED) await dbSaveUser(req.user); else saveUsers();
    usersById.set(req.user.id,req.user);
    res.json({ok:true,reward:grant,rolled,state:req.user.accountData});
  } catch(e){ console.error('Daily wheel error:',e.message); res.status(503).json({error:'Could not save your Daily Wheel reward right now. Please try again.'}); }
});

app.post('/api/auth/profile', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const displayName = String(req.body?.displayName || '').trim().slice(0, 60);
    const requestedUsername = normalizeUsername(req.body?.username || req.user.username || '');
    if (!displayName) return res.status(400).json({ error: 'Enter a display name.' });
    if (containsConductViolation(displayName)) return res.status(400).json({ error: 'That name is not allowed. Please pick a different name.' });
    if (!isValidUsername(requestedUsername)) return res.status(400).json({ error: 'Username must be 3–24 characters and use only letters, numbers, periods, underscores, or hyphens.' });
    if (requestedUsername !== normalizeUsername(req.user.username || '')) {
      let taken = usersByUsername.get(requestedUsername);
      if (SUPABASE_ENABLED) {
        const row = await dbFindUserByUsername(requestedUsername);
        if (row && row.id !== req.user.id) taken = dbRowToUser(row);
      }
      if (taken && taken.id !== req.user.id) return res.status(409).json({ error: 'That username is already taken. Choose another one.' });
      if (req.user.username) usersByUsername.delete(normalizeUsername(req.user.username));
      req.user.username = requestedUsername;
      usersByUsername.set(requestedUsername, req.user);
    }
    req.user.firstName = displayName;
    req.user.lastName = '';
    delete req.user.school;
    delete req.user.grade;
    if (SUPABASE_ENABLED) await dbSaveUser(req.user); else saveUsers();
    res.json({ ok: true, user: publicUser(req.user) });
  } catch (e) {
    console.error('Profile save error:', e.message);
    res.status(503).json({ error: 'Could not save your profile right now.' });
  }
});

app.post('/api/auth/delete', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  const user = req.user;
  users.delete('email:' + normalizeEmail(user.identifier || user.email));
  if(user.username) usersByUsername.delete(normalizeUsername(user.username));
  usersById.delete(user.id);
  if (req.sessionToken) sessions.delete(req.sessionToken);
  if (SUPABASE_ENABLED) {
    try { await supabaseRequest(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(user.id)}`, {method:'DELETE'}); } catch(e) { return res.status(503).json({error:'Could not delete the account right now.'}); }
  } else saveUsers();
  clearSessionCookie(res);
  res.json({ ok: true });
});



// Google Sign-In (basic identity only; no Drive scopes).
const googleOauthStates = new Map();
function googleRedirectUri(req) { return `${PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`}/api/auth/google/callback`; }
app.get('/api/auth/google/start', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(501).send('Google Sign-In is not configured on this server yet.');
  const stateToken = crypto.randomBytes(24).toString('hex');
  googleOauthStates.set(stateToken, { createdAt: Date.now() });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', googleRedirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', stateToken);
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});
app.get('/api/auth/google/callback', async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.redirect('/?authError=' + encodeURIComponent('Google Sign-In is not configured on this server.'));
  const code = String(req.query?.code || '');
  const stateToken = String(req.query?.state || '');
  const oauthState = googleOauthStates.get(stateToken);
  googleOauthStates.delete(stateToken);
  if (!code || !oauthState || Date.now() - oauthState.createdAt > 10 * 60 * 1000) {
    return res.redirect('/?authError=' + encodeURIComponent('The Google sign-in request expired or was cancelled.'));
  }
  try {
    const redirectUri = googleRedirectUri(req);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'content-type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error_description || 'Google token exchange failed.');
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers:{ authorization:`Bearer ${tokenData.access_token}` } });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub) throw new Error('Google did not return a valid profile.');
    let user = null;
    if (SUPABASE_ENABLED) {
      user = await dbCreateOrUpdateGoogleUser(profile);
    } else {
      const key='google:'+profile.sub;
      user = users.get(key) || null;
      if(!user){
        user={id:crypto.randomBytes(12).toString('hex'),method:'google',identifier:normalizeEmail(profile.email||''),email:normalizeEmail(profile.email||''),username:makeUniqueUsername(profile.email,'g'+Date.now()),googleId:String(profile.sub),passwordHash:'',salt:'',firstName:'',lastName:'',createdAt:Date.now(),accountData:null};
        users.set(key,user); usersById.set(user.id,user); usersByUsername.set(user.username,user); saveUsers();
      }
    }
    if(!usersById.has(user.id)) usersById.set(user.id,user);
    if(user.email) users.set('email:'+normalizeEmail(user.email),user);
    if(user.googleId) users.set('google:'+String(user.googleId),user);
    if(user.username) usersByUsername.set(normalizeUsername(user.username),user);
    const token=createSession(user.id);
    setSessionCookie(res, token);
    res.redirect('/?welcome=1' + ((!user.firstName) ? '&complete=1' : ''));
  } catch(e) {
    console.error('Google sign-in error:', e.message);
    const dbProblem = /permission denied|not configured|supabase|relation .* does not exist/i.test(String(e.message || ''));
    const message = dbProblem ? 'Google connected, but Index could not save the account. In Render, verify SUPABASE_URL and the Supabase service-role/secret key, then run the current SUPABASE-SETUP.sql in the Supabase SQL Editor.' : 'Could not complete Google sign-in. Please try again.';
    res.redirect('/?authError=' + encodeURIComponent(message));
  }
});

// Email recovery uses the Resend HTTP API. Configure RESEND_API_KEY and EMAIL_FROM in Render.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || '';
const recoveryAttempts = new Map();
function recoveryRateLimited(ip){
  const now=Date.now(), key=String(ip||'unknown');
  const arr=(recoveryAttempts.get(key)||[]).filter(t=>now-t<15*60*1000);
  if(arr.length>=5){ recoveryAttempts.set(key,arr); return true; }
  arr.push(now); recoveryAttempts.set(key,arr); return false;
}
function hashRecoveryToken(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
async function sendRecoveryEmail(to, subject, html, text){
  if(!RESEND_API_KEY || !EMAIL_FROM) return false;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html,text})});
  if(!r.ok){ const detail=await r.text(); throw new Error('Email provider error: '+detail.slice(0,300)); }
  return true;
}
function recoveryConfigured(){ return !!(RESEND_API_KEY && EMAIL_FROM); }

app.post('/api/auth/forgot-username', async (req,res)=>{
  if(recoveryRateLimited(req.ip)) return res.status(429).json({error:'Too many recovery requests. Please wait and try again.'});
  const email=normalizeEmail(req.body?.email);
  if(!isValidEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
  if(!recoveryConfigured()) return res.status(503).json({error:'Email recovery is not configured on this server yet.'});
  const user=users.get('email:'+email);
  try{
    if(user){
      await sendRecoveryEmail(email,'Your Index username',`<p>Your Index username is <strong>@${escapeHtml(user.username)}</strong>.</p><p>If you did not request this, you can ignore this email.</p>`,`Your Index username is @${user.username}. If you did not request this, you can ignore this email.`);
    }    res.json({ok:true,message:'If an account matches that email, we sent the username to it.'});
  }catch(e){ console.error('Username recovery email failed:',e.message); res.status(502).json({error:'We could not send the recovery email. Please try again later.'}); }
});

app.post('/api/auth/forgot-password', async (req,res)=>{
  if(recoveryRateLimited(req.ip)) return res.status(429).json({error:'Too many recovery requests. Please wait and try again.'});
  const email=normalizeEmail(req.body?.email);
  if(!isValidEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
  if(!recoveryConfigured()) return res.status(503).json({error:'Email recovery is not configured on this server yet.'});
  const user=users.get('email:'+email);
  try{
    if(user){
      const raw=crypto.randomBytes(32).toString('hex');
      user.resetTokenHash=hashRecoveryToken(raw);
      user.resetExpiresAt=Date.now()+60*60*1000;
      saveUsers();
      const link=PUBLIC_BASE_URL+'/?reset='+encodeURIComponent(raw);
      await sendRecoveryEmail(email,'Reset your Index password',`<p>We received a request to reset your Index password.</p><p><a href="${escapeHtml(link)}">Reset your password</a></p><p>This link expires in one hour and can be used once.</p><p>If you did not request this, you can ignore this email.</p>`,`Reset your Index password: ${link}\n\nThis link expires in one hour and can be used once. If you did not request this, you can ignore this email.`);
    }
    res.json({ok:true,message:'If an account matches that email, we sent a password reset link to it.'});
  }catch(e){ console.error('Password recovery email failed:',e.message); res.status(502).json({error:'We could not send the recovery email. Please try again later.'}); }
});

app.post('/api/auth/reset-password', (req,res)=>{
  const token=String(req.body?.token||'');
  const password=String(req.body?.password||'');
  if(token.length<20) return res.status(400).json({error:'This reset link is invalid or expired.'});
  if(password.length<8) return res.status(400).json({error:'Password must be at least 8 characters.'});
  const tokenHash=hashRecoveryToken(token);
  let user=null;
  for(const u of usersById.values()){
    if(u.resetTokenHash===tokenHash){ user=u; break; }
  }
  if(!user || !user.resetExpiresAt || user.resetExpiresAt<Date.now()) return res.status(400).json({error:'This reset link is invalid or expired.'});
  const {salt,hash}=hashPassword(password);
  user.salt=salt; user.passwordHash=hash; delete user.resetTokenHash; delete user.resetExpiresAt;
  saveUsers();
  for(const [sessionToken,session] of sessions.entries()) if(session.userId===user.id) sessions.delete(sessionToken);
  res.json({ok:true});
});

function escapeHtml(v){ return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* ============================== GAME ENGINE ============================== */
/**
 * rooms: Map<code, Room>
 * Room = {
 *   code, hostToken, hostName, mode, title, subjectId,
 *   questions: [{ q, options:[4], correct, explanation }],
 *   status: 'lobby' | 'question' | 'reveal' | 'ended',
 *   currentQuestion: number,
 *   questionStartedAt: number,
 *   questionDurationMs: number,
 *   config: { questionCount, shuffleQuestions, shuffleAnswers, showLeaderboard, autoAdvance, maxPlayers },
 *   players: Map<playerId, { id, name, score, correctCount, gold, chestsAvailable, online, socketId }>,
 *   answers: Map<`${qIndex}:${playerId}`, { idx, correct, points, ts }>,
 *   revealTimer: NodeJS.Timeout | null,
 *   createdAt: number
 * }
 */
const rooms = new Map();
// Server-side daily coin cap. The playerId is the same identifier used by the browser for live-game participation.
const dailyCoinAwards = new Map();
const DAILY_COIN_CAP = 500;
function dailyKey(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function cappedDailyCoins(playerId, requested){
  const key = `${dailyKey()}:${playerId}`;
  const used = dailyCoinAwards.get(key) || 0;
  const grant = Math.max(0, Math.min(requested, DAILY_COIN_CAP-used));
  dailyCoinAwards.set(key, used + grant);
  return grant;
}

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sanitizeQuestions(questions, config = {}) {
  if (!Array.isArray(questions)) return [];
  let clean = questions
    .filter(q => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct))
    .slice(0, 30)
    .map(q => ({
      q: String(q.q).slice(0, 400),
      options: q.options.map(o => String(o).slice(0, 200)),
      correct: Math.max(0, Math.min(3, q.correct)),
      explanation: q.explanation ? String(q.explanation).slice(0, 400) : ''
    }));
  if (config.shuffleQuestions) clean = shuffleArray(clean);
  const count = Math.max(1, Math.min(30, Number(config.questionCount) || clean.length));
  clean = clean.slice(0, count);
  if (config.shuffleAnswers) {
    clean = clean.map(q => {
      const pairs = q.options.map((label, idx) => ({ label, correct: idx === q.correct }));
      const shuffled = shuffleArray(pairs);
      return { ...q, options: shuffled.map(x => x.label), correct: shuffled.findIndex(x => x.correct) };
    });
  }
  return clean;
}
function publicPlayers(room) {
  return Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score, correctCount: p.correctCount, gold: p.gold, online: p.online, alive: p.alive !== false, streak: p.streak || 0 }))
    .sort((a, b) => b.score - a.score);
}
function questionForClients(room) {
  const q = room.questions[room.currentQuestion];
  return {
    index: room.currentQuestion,
    total: room.questions.length,
    q: q.q,
    options: q.options,
    mode: room.mode,
    questionDurationMs: room.questionDurationMs,
    startedAt: room.questionStartedAt
  };
}
function answeredCount(room) {
  let n = 0;
  for (const key of room.answers.keys()) if (key.startsWith(room.currentQuestion + ':')) n++;
  return n;
}
function clearRevealTimer(room) {
  if (room.revealTimer) { clearTimeout(room.revealTimer); room.revealTimer = null; }
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
}
function startQuestion(room, index) {
  clearRevealTimer(room);
  room.currentQuestion = index;
  room.status = 'question';
  room.questionStartedAt = Date.now();
  io.to(room.code).emit('room:question', questionForClients(room));
  io.to(room.code).emit('room:answered-count', { index, count: 0, total: room.players.size });
  room.revealTimer = setTimeout(() => revealQuestion(room), room.questionDurationMs + 300);
}
function revealQuestion(room) {
  if (room.status !== 'question') return;
  clearRevealTimer(room);
  room.status = 'reveal';
  const q = room.questions[room.currentQuestion];
  const counts = [0, 0, 0, 0];
  for (const [key, ans] of room.answers.entries()) {
    if (key.startsWith(room.currentQuestion + ':') && ans.idx >= 0 && ans.idx < 4) counts[ans.idx]++;
  }
  io.to(room.code).emit('room:reveal', {
    index: room.currentQuestion,
    correct: q.correct,
    explanation: q.explanation,
    counts,
    players: publicPlayers(room)
  });
  if (room.config.autoAdvance) {
    room.nextTimer = setTimeout(() => {
      room.nextTimer = null;
      const next = room.currentQuestion + 1;
      if (next >= room.questions.length) endRoom(room);
      else startQuestion(room, next);
    }, 3000);
  }
}
function endRoom(room) {
  if (!room || room.status === 'ended') return;
  clearRevealTimer(room);
  room.status = 'ended';
  const ranked = publicPlayers(room);
  for (const player of room.players.values()) {
    const placement = Math.max(1, ranked.findIndex(p => p.id === player.id) + 1);
    const placementBonus = placement === 1 ? 40 : placement === 2 ? 25 : placement === 3 ? 15 : 5;
    const xp = Math.min(150, 25 + (player.correctCount || 0) * 5 + placementBonus);
    const requestedCoins = Math.min(120, 30 + (player.correctCount || 0) * 8 + placementBonus);
    const coins = cappedDailyCoins(player.id, requestedCoins);
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('live:reward', { playerId: player.id, xp, coins, correctCount: player.correctCount || 0, placement });
  }
  io.to(room.code).emit('room:ended', { players: ranked });
}
function requireHost(room, hostToken) {
  return room && room.hostToken === hostToken;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_MAX_AGE_MS) { clearRevealTimer(room); rooms.delete(code); }
  }}, 30 * 60 * 1000);

io.on('connection', socket => {
  let joined = null; // { code, playerId, role }

  socket.on('host:create', (payload, cb) => {
    try {
      const { title, subjectId, mode, questions, hostName, config: rawConfig } = payload || {};
      const config = {
        questionCount: Math.max(1, Math.min(30, Number(rawConfig?.questionCount) || 10)),
        timePerQuestion: Math.max(5, Math.min(60, Number(rawConfig?.timePerQuestion) || 20)),
        shuffleQuestions: rawConfig?.shuffleQuestions !== false,
        shuffleAnswers: rawConfig?.shuffleAnswers === true,
        showLeaderboard: rawConfig?.showLeaderboard !== false,
        autoAdvance: rawConfig?.autoAdvance === true,
        maxPlayers: Math.max(2, Math.min(100, Number(rawConfig?.maxPlayers) || 50))
      };
      const clean = sanitizeQuestions(questions, config);
      if (clean.length === 0) return cb && cb({ ok: false, error: 'No valid questions provided.' });
      config.questionCount = clean.length;
      const code = genRoomCode();
      const hostToken = genId();
      const room = {
        code, hostToken, hostName: cleanDisplayName(hostName, 'Host'),
        mode: ['trivia', 'rocket', 'tower', 'gold', 'streak', 'elimination'].includes(mode) ? mode : 'trivia',
        title: cleanRoomTitle(title),
        subjectId: subjectId || '',
        questions: clean,
        config,
        status: 'lobby',
        currentQuestion: 0,
        questionStartedAt: 0,
        questionDurationMs: config.timePerQuestion * 1000,
        players: new Map(),
        answers: new Map(),
        revealTimer: null,
        nextTimer: null,
        createdAt: Date.now()
      };
      rooms.set(code, room);
      socket.join(code);
      joined = { code, playerId: null, role: 'host' };
      cb && cb({ ok: true, code, hostToken, config });
    } catch (e) {
      cb && cb({ ok: false, error: 'Could not create the room.' });
    }
  });

  socket.on('player:join', (payload, cb) => {
    const { code, name, playerId } = payload || {};
    const nameError = nameViolationReason(name);
    if (nameError) return cb && cb({ ok: false, error: nameError, code: 'NAME_NOT_ALLOWED' });
    const safeName = cleanDisplayName(name, 'Player');
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'No game found with that code.' });
    if (room.status !== 'lobby') return cb && cb({ ok: false, error: 'That game has already started.' });
    const existingId = playerId && room.players.has(playerId) ? playerId : null;
    if (!existingId && room.players.size >= room.config.maxPlayers) return cb && cb({ ok: false, error: 'This game is full.' });
    const id = existingId || genId();
    const existing = room.players.get(id);
    if (existing) {
      existing.online = true; existing.socketId = socket.id; existing.name = safeName;
    } else {
      room.players.set(id, { id, name: safeName, score: 0, correctCount: 0, gold: 0, chestsAvailable: 0, alive: true, streak: 0, online: true, socketId: socket.id });
    }
    socket.join(code.toUpperCase());
    joined = { code: room.code, playerId: id, role: 'player' };
    io.to(room.code).emit('room:roster', { players: publicPlayers(room), title: room.title, mode: room.mode, hostName: room.hostName, config: room.config });
    cb && cb({ ok: true, code: room.code, playerId: id, title: room.title, mode: room.mode, hostName: room.hostName, config: room.config });
  });

  socket.on('host:sync', (payload, cb) => {
    const { code, hostToken } = payload || {};
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return cb && cb({ ok: false, error: 'Not authorized for that room.' });
    socket.join(room.code);
    joined = { code: room.code, playerId: null, role: 'host' };
    cb && cb({
      ok: true, code: room.code, title: room.title, mode: room.mode, config: room.config, status: room.status,
      players: publicPlayers(room),
      question: room.status === 'question' || room.status === 'reveal' ? questionForClients(room) : null
    });
  });

  socket.on('host:start', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken) || room.status !== 'lobby') return;
    startQuestion(room, 0);
  });

  socket.on('host:reveal', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return;
    revealQuestion(room);
  });

  socket.on('host:next', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken) || room.status !== 'reveal') return;
    const next = room.currentQuestion + 1;
    if (next >= room.questions.length) endRoom(room);
    else startQuestion(room, next);
  });

  socket.on('host:end', ({ code, hostToken } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!requireHost(room, hostToken)) return;
    endRoom(room);
  });

  socket.on('player:answer', ({ code, playerId, idx } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || room.status !== 'question') return;
    const player = room.players.get(playerId);
    if (!player) return;
    if (room.mode === 'elimination' && player.alive === false) return;
    const key = room.currentQuestion + ':' + playerId;
    if (room.answers.has(key)) return; // already answered
    const q = room.questions[room.currentQuestion];
    const elapsed = Date.now() - room.questionStartedAt;
    const correct = idx === q.correct;
    let points = correct ? Math.max(100, Math.round(1000 * (1 - Math.min(elapsed, room.questionDurationMs) / room.questionDurationMs))) : 0;
    if (room.mode === 'streak') {
      points = correct ? Math.round(points * (1 + Math.min(player.streak || 0, 8) * 0.15)) : 0;
      player.streak = correct ? (player.streak || 0) + 1 : 0;
    } else if (correct) {
      player.streak = (player.streak || 0) + 1;
    } else {
      player.streak = 0;
    }
    if (room.mode === 'elimination' && !correct) player.alive = false;
    room.answers.set(key, { idx, correct, points, ts: Date.now() });
    player.score += points;
    if (correct) {
      player.correctCount += 1;
      if (room.mode === 'gold') { player.gold += points; player.chestsAvailable += 1; }
    }
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('answer:ack', { index: room.currentQuestion, correct, points, myScore: player.score });
    io.to(room.code).emit('room:answered-count', {
      index: room.currentQuestion,
      count: answeredCount(room),
      total: room.players.size,
      players: publicPlayers(room)
    });
    if (answeredCount(room) >= room.players.size && room.players.size > 0) revealQuestion(room);
  });

  socket.on('player:openChest', ({ code, playerId } = {}) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room || room.mode !== 'gold') return;
    const player = room.players.get(playerId);
    if (!player || player.chestsAvailable <= 0) return;
    player.chestsAvailable -= 1;
    const bonus = 20 + Math.floor(Math.random() * 131); // 20-150 gold
    player.gold += bonus;
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) sock.emit('chest:result', { bonus, gold: player.gold });
    io.to(room.code).emit('room:roster', { players: publicPlayers(room) });
  });

  socket.on('disconnect', () => {
    if (!joined) return;
    const room = rooms.get(joined.code);
    if (!room) return;
    if (joined.role === 'player' && joined.playerId) {
      const p = room.players.get(joined.playerId);
      if (p) { p.online = false; io.to(room.code).emit('room:roster', { players: publicPlayers(room) }); }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Index study app listening on http://localhost:${PORT}`);
  console.log('AI requests are proxied server-side for school-browser compatibility.');
});