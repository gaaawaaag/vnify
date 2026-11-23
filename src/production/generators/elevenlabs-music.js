// @ts-check
/* ElevenLabs Music (docs/dev/audio.md): a track from a text prompt, at a length, optionally forced instrumental, as an MP3.
 * The API is for paid accounts. VNIFY_ELEVENLABS_API points elsewhere for tests. */
const api=()=>process.env.VNIFY_ELEVENLABS_API||'https://api.elevenlabs.io';

/* A prompt is sent without a seed: ElevenLabs accepts a seed only with a composition plan. */
/** @param {string} key @param {{prompt:string,seconds:number,model:string,instrumental:boolean}} request */
export async function compose(key,{prompt,seconds,model,instrumental}) {
  if(!key)throw Object.assign(new Error('还没有填写 ElevenLabs 的 API key。'),{status:400});
  let response;
  try {
    response=await fetch(`${api()}/v1/music?output_format=mp3_44100_128`,{method:'POST',
      headers:{'xi-api-key':key,'Content-Type':'application/json'},
      body:JSON.stringify({prompt,music_length_ms:Math.round(seconds*1000),model_id:model,force_instrumental:instrumental})});
  } catch {throw Object.assign(new Error('无法连接 ElevenLabs。'),{status:502});}
  if(!response.ok) {
    let message='';
    try {
      const body=await response.json(),detail=body?.detail;
      message=typeof detail==='string'?detail:Array.isArray(detail)?detail.map(d=>d?.msg).filter(Boolean).join('；'):detail?.message??'';
    } catch {}
    throw Object.assign(new Error(`ElevenLabs：${message||`HTTP ${response.status}`}`),{status:response.status>=500?502:400});
  }
  return new Uint8Array(await response.arrayBuffer());
}
