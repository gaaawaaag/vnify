// @ts-check
// Pixel size from a PNG, JPEG or WebP header, so an image can be registered without decoding it.
/** @param {Uint8Array} bytes @returns {{width:number,height:number}} */
export function imageSize(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=(/** @type {number} */ at,/** @type {number} */ n)=>String.fromCharCode(...bytes.subarray(at,at+n));
  if(bytes[0]===0x89&&ascii(1,3)==='PNG')return {width:view.getUint32(16),height:view.getUint32(20)};
  if(bytes[0]===0xff&&bytes[1]===0xd8) {
    // Walk the segments to the first start-of-frame marker (SOF0–SOF15, except DHT, JPG and DAC).
    for(let at=2;at+9<bytes.length;) {
      if(bytes[at]!==0xff){at++;continue;}
      const marker=bytes[at+1];
      if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return {height:view.getUint16(at+5),width:view.getUint16(at+7)};
      at+=2+view.getUint16(at+2);
    }
  }
  if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP') {
    const chunk=ascii(12,4);
    if(chunk==='VP8 ')return {width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
    if(chunk==='VP8L'){const b=view.getUint32(21,true);return {width:(b&0x3fff)+1,height:((b>>14)&0x3fff)+1};}
    if(chunk==='VP8X')return {width:1+(bytes[24]|bytes[25]<<8|bytes[26]<<16),height:1+(bytes[27]|bytes[28]<<8|bytes[29]<<16)};
  }
  throw new Error('无法读取图片尺寸：请使用 PNG、JPEG 或 WebP。');
}
