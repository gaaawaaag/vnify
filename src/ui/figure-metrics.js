// The hair top of a transparent standing portrait: the first row with visible pixels, as a fraction of the height.
// Opaque images (a filled first row) give null, so their figures fall back on the reference framing.
const measured=new Map();
const WIDTH=48;

async function measure(src) {
  try {
    // The image is cached by its address, so this fetch reads the copy the stage already loaded.
    const bitmap=await createImageBitmap(await (await fetch(src)).blob()),height=Math.max(1,Math.round(WIDTH*bitmap.height/bitmap.width));
    const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,0,0,WIDTH,height);bitmap.close?.();
    const data=context.getImageData(0,0,WIDTH,height).data;
    for(let y=0;y<height;y++) {
      let seen=0;
      for(let x=0;x<WIDTH;x++)if(data[(y*WIDTH+x)*4+3]>40)seen++;
      if(y===0&&seen>WIDTH/2)return null;
      if(seen>=2)return y/height;
    }
  }catch{}
  return null;
}
export function figureTop(src) {
  if(!measured.has(src))measured.set(src,measure(src));
  return measured.get(src);
}
