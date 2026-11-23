// @ts-check
/* Lyria music through the Gemini API (docs/dev/audio.md): a track from a text prompt, returned as MP3 among the response's
 * parts (the others carry the lyrics or structure). The API has no length or instrumental switch: both go into the prompt,
 * and the clip model always makes 30 seconds. VNIFY_GEMINI_API points elsewhere for tests. */
const api=()=>process.env.VNIFY_GEMINI_API||'https://generativelanguage.googleapis.com';
const CLIP='lyria-3-clip-preview';

/** The prompt as sent. @param {{prompt:string,seconds:number,model:string,instrumental:boolean}} request */
export function lyriaPrompt({prompt,seconds,model,instrumental}) {
  return [prompt.trim(),instrumental?'Instrumental only, no vocals.':'',model===CLIP?'':`About ${Math.round(seconds)} seconds long.`].filter(Boolean).join(' ');
}

/** @param {string} key @param {{prompt:string,seconds:number,model:string,instrumental:boolean}} request */
export async function compose(key,request) {
  if(!key)throw Object.assign(new Error('还没有填写 Gemini API key。'),{status:400});
  let response;
  try {
    response=await fetch(`${api()}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,{method:'POST',
      headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:lyriaPrompt(request)}]}]})});
  } catch {throw Object.assign(new Error('无法连接 Gemini API。'),{status:502});}
  /** @type {any} */
  let body=null;
  try {body=await response.json();} catch {}
  if(!response.ok) {
    const message=typeof body?.error?.message==='string'?body.error.message:'';
    throw Object.assign(new Error(`Lyria：${message||`HTTP ${response.status}`}`),{status:response.status>=500?502:400});
  }
  const parts=body?.candidates?.[0]?.content?.parts;
  const audio=(Array.isArray(parts)?parts:[]).find(part=>typeof part?.inlineData?.data==='string');
  if(!audio)throw Object.assign(new Error('Lyria 没有返回音频（可能被安全策略拦下，换个描述再试）。'),{status:502});
  return new Uint8Array(Buffer.from(audio.inlineData.data,'base64'));
}
