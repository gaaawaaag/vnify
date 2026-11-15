// @ts-check
/** @import {ImageType} from '../types/assets.js' */
// Image type and size from file headers, for tools and the shelf server, which run without an image decoder.
// Returns null for formats packages do not accept (GIF, SVG…) or unreadable headers.
/** @param {Uint8Array} bytes @returns {{type:ImageType,width:number,height:number}|null} */
export function imageHeader(bytes) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),at=(/** @type {number} */ i,/** @type {number} */ n)=>i+n<=bytes.length;
  const ascii=(/** @type {number} */ i,/** @type {number} */ n)=>String.fromCharCode(...bytes.subarray(i,i+n));
  if(at(0,24)&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)&&ascii(12,4)==='IHDR')
    return {type:'image/png',width:v.getUint32(16),height:v.getUint32(20)};
  if(at(0,30)&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP') {
    const chunk=ascii(12,4);
    const u24=(/** @type {number} */ i)=>bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16;
    if(chunk==='VP8X')return {type:'image/webp',width:1+u24(24),height:1+u24(27)};
    if(chunk==='VP8L'){const b=v.getUint32(21,true);return {type:'image/webp',width:1+(b&0x3fff),height:1+((b>>14)&0x3fff)};}
    if(chunk==='VP8 ')return {type:'image/webp',width:v.getUint16(26,true)&0x3fff,height:v.getUint16(28,true)&0x3fff};
    return null;
  }
  if(at(0,4)&&bytes[0]===0xff&&bytes[1]===0xd8) {
    // Walk the JPEG segments to the first start-of-frame marker.
    for(let i=2;at(i,9);) {
      if(bytes[i]!==0xff){i++;continue;}
      const marker=bytes[i+1];
      if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
      if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))
        return {type:'image/jpeg',width:v.getUint16(i+7),height:v.getUint16(i+5)};
      i+=2+v.getUint16(i+2);
    }
  }
  return null;
}
