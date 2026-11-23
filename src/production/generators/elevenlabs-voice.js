// @ts-check
/* ElevenLabs speech for the voice library (docs/dev/audio.md): a line read in a voice, a voice's name, labels and
 * language looked up by its ID (in the user's voices, then in the Voice Library), and adding a library voice.
 * VNIFY_ELEVENLABS_API points elsewhere for tests. */
const api=()=>process.env.VNIFY_ELEVENLABS_API||'https://api.elevenlabs.io';

/** @param {string} key @param {string} route @param {RequestInit} [init] */
async function call(key,route,init={}) {
  if(!key)throw Object.assign(new Error('还没有填写 ElevenLabs 的 API key。'),{status:400});
  let response;
  try {response=await fetch(`${api()}${route}`,{...init,headers:{'xi-api-key':key,...init.headers}});}
  catch {throw Object.assign(new Error('无法连接 ElevenLabs。'),{status:502});}
  if(!response.ok) {
    let message='';
    let code='';
    try {
      const detail=(await response.json())?.detail;
      message=typeof detail==='string'?detail:detail?.message??'';code=typeof detail==='object'?String(detail?.status??detail?.code??''):'';
    } catch {}
    throw Object.assign(new Error(`ElevenLabs：${message||`HTTP ${response.status}`}`),{status:response.status>=500?502:400,upstream:response.status,code});
  }
  return response;
}

/** A line as MP3. @param {string} key @param {{ref:string,text:string,model:string,speed?:number}} line */
export async function speak(key,{ref,text,model,speed=1}) {
  const response=await call(key,`/v1/text-to-speech/${encodeURIComponent(ref)}?output_format=mp3_44100_128`,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text,model_id:model,voice_settings:{speed:Math.min(1.2,Math.max(0.7,speed))}})});
  return Buffer.from(await response.arrayBuffer());
}

/* What the voice library keeps of a voice: its name, labels (gender, age, accent, use) as tags, first language and
 * description. Voices copied from the Voice Library are not the user's own. */
/** @param {any} body @param {string} ref @param {string[]} labels */
const voiceInfo=(body,ref,labels)=>{
  const language=body?.verified_languages?.find((/** @type {any} */ l)=>typeof l?.language==='string')?.language??body?.language??body?.fine_tuning?.language;
  const tags=[...new Set(labels.filter(v=>typeof v==='string'&&v.trim()&&v.length<=40).map(v=>v.trim()))].slice(0,12);
  return {title:typeof body?.name==='string'&&body.name.trim()?body.name.trim():ref,tags,languages:typeof language==='string'?[language]:[],
    description:typeof body?.description==='string'?body.description.trim().slice(0,500):''};
};

/**
 * A voice by its ID, or null when there is none. One in the user's own voices (My Voices) comes as it is; a Voice
 * Library voice not yet added to the account comes with `shared` (its owner's public ID), since speech and lookups only
 * reach it once it is added.
 * @param {string} key @param {string} ref
 * @returns {Promise<{title:string,tags:string[],languages:string[],description:string,mine:boolean,shared?:{owner:string}}|null>}
 */
export async function lookup(key,ref) {
  try {
    const body=await (await call(key,`/v1/voices/${encodeURIComponent(ref)}`)).json();
    const labels=body?.labels&&typeof body.labels==='object'?Object.values(body.labels):[];
    return {...voiceInfo(body,ref,labels),mine:['cloned','generated','professional'].includes(body?.category)&&body?.sharing?.status!=='copied'};
  } catch(/** @type {any} */ error) {
    if(error.upstream!==404&&!(error.upstream===400&&error.code==='voice_not_found'))throw error;
  }
  const params=new URLSearchParams({search:ref,page_size:'10'});
  const found=(await (await call(key,`/v1/shared-voices?${params}`)).json())?.voices?.find((/** @type {any} */ v)=>v?.voice_id===ref);
  if(!found||typeof found.public_owner_id!=='string')return null;
  return {...voiceInfo(found,ref,[found.gender,found.age,found.accent,found.descriptive,found.use_case]),mine:false,shared:{owner:found.public_owner_id}};
}

/** Adds a Voice Library voice to the user's voices; returns the ID it is used by.
 * @param {string} key @param {string} owner @param {string} ref @param {string} name */
export async function addShared(key,owner,ref,name) {
  const response=await call(key,`/v1/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(ref)}`,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({new_name:name})});
  const body=await response.json().catch(()=>null);
  return typeof body?.voice_id==='string'?body.voice_id:ref;
}

/**
 * A sound effect from a description, as MP3 (Sound Effects, model eleven_text_to_sound_v2). Ambience loops seamlessly.
 * @param {string} key @param {{text:string,seconds?:number|null,loop?:boolean,influence?:number}} request
 */
export async function soundEffect(key,{text,seconds=null,loop=false,influence=0.3}) {
  const response=await call(key,'/v1/sound-generation?output_format=mp3_44100_128',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text,model_id:'eleven_text_to_sound_v2',prompt_influence:influence,loop,...(seconds?{duration_seconds:seconds}:{})})});
  return new Uint8Array(await response.arrayBuffer());
}
