// Fetches and decodes images the next few lines will show, so a change of scene does not wait for the network.
// Recent addresses are kept so the same image is not asked for again and again; the browser cache holds the bytes.
const recent=new Map(),LIMIT=32;
export function preload(src) {
  if(!src||recent.has(src))return;
  const img=new Image();img.decoding='async';img.src=src;img.decode().catch(()=>{});
  recent.set(src,img);
  if(recent.size>LIMIT)recent.delete(recent.keys().next().value);
}
