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

async function raceAiProviders(messages,complex){
  // One provider at a time keeps Render bandwidth predictable. We fail over only
  // after a genuine provider failure or unusable answer.
  const providers=[
    ['vireonix',()=>tryVireonix(messages,complex)],
    ['vireonix-local',()=>tryVireonixLocal(messages,complex)],
    ['kilo-free',()=>tryKiloFree(messages,complex)],
    ['blockrun-free',()=>tryBlockRunFree(messages,complex)]
  ];

  let lastError=null;
  for(const [name,run] of providers){
    try{
      const answer=String(await run()||'').trim();
      if(answer && !responseLooksLikeGenericAdvice(answer)) return answer;
      if(answer) return answer;
    }catch(e){
      lastError=e;
      console.warn('[AI] provider failed:',name,e?.message||e);
    }
  }
  throw lastError||new Error('No configured free AI provider returned an answer.');
}

