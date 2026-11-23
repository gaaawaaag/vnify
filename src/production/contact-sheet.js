// @ts-check
/** @import {Rgba} from './avatar-crop.js' */
import {decodePng} from './png.js';
import {imageType} from '../reader/backgrounds.js';

/* Contact-sheet rendering for batch visual review and portrait avatar crop checking. PNGs decode with zero dependencies;
 * JPEG and WebP use optional sharp when installed. Labels are drawn with a compact 5×7 bitmap font so no system font or
 * native canvas library is needed. */

/** @type {Promise<any>|null} */
let sharpLoading=null;
const loadSharp=()=>sharpLoading??=import('sharp').then(m=>m.default,()=>{sharpLoading=null;return null;});

/** Decodes PNG, JPEG or WebP bytes into RGBA pixels. @param {Uint8Array} bytes @returns {Promise<Rgba>} */
export async function decodeToRgba(bytes) {
  const type=imageType(bytes);
  if(type==='image/png')return decodePng(bytes);
  const sharp=await loadSharp();
  if(!sharp)throw new Error(`需要安装 sharp 才能把 ${type} 拼入缩略图；PNG 可直接使用。`);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {width:info.width,height:info.height,data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength)};
}

/**
 * Resizes an RGBA image to fit inside maxWidth × maxHeight while keeping aspect ratio.
 * Downsampling averages source boxes to avoid aliasing; upsampling uses bilinear interpolation.
 * @param {Rgba} image @param {number} maxWidth @param {number} maxHeight @returns {Rgba}
 */
export function resizeRgba(image,maxWidth,maxHeight) {
  const scale=Math.min(maxWidth/image.width,maxHeight/image.height);
  const width=Math.max(1,Math.round(image.width*scale));
  const height=Math.max(1,Math.round(image.height*scale));
  if(width===image.width&&height===image.height)return image;
  const out=new Uint8Array(width*height*4);
  const sx=image.width/width;
  const sy=image.height/height;
  for(let y=0;y<height;y++) {
    const y0=y*sy;
    const y1=Math.min(image.height,(y+1)*sy);
    const iy0=Math.floor(y0);
    const iy1=Math.max(iy0+1,Math.ceil(y1));
    for(let x=0;x<width;x++) {
      const x0=x*sx;
      const x1=Math.min(image.width,(x+1)*sx);
      const ix0=Math.floor(x0);
      const ix1=Math.max(ix0+1,Math.ceil(x1));
      let r=0;
      let g=0;
      let b=0;
      let a=0;
      let weight=0;
      for(let py=iy0;py<iy1;py++) {
        const wy=Math.min(y1,py+1)-Math.max(y0,py);
        if(wy<=0)continue;
        for(let px=ix0;px<ix1;px++) {
          const wx=Math.min(x1,px+1)-Math.max(x0,px);
          if(wx<=0)continue;
          const w=wx*wy;
          const idx=(py*image.width+px)*4;
          const pa=image.data[idx+3]/255;
          r+=image.data[idx]*pa*w;
          g+=image.data[idx+1]*pa*w;
          b+=image.data[idx+2]*pa*w;
          a+=image.data[idx+3]*w;
          weight+=w;
        }
      }
      const dst=(y*width+x)*4;
      const alpha=weight>0?a/weight:0;
      out[dst+3]=Math.round(alpha);
      if(alpha>0.5) {
        const norm=alpha/255*weight;
        out[dst]=Math.min(255,Math.round(r/norm));
        out[dst+1]=Math.min(255,Math.round(g/norm));
        out[dst+2]=Math.min(255,Math.round(b/norm));
      }
    }
  }
  return {width,height,data:out};
}

// Minimal 5×7 ASCII bitmap font (32..95, lowercase mapped to uppercase) for crisp zero-dependency tile labels.
/** @type {Record<string,string[]>} */
const FONT={
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],
  '.':['00000','00000','00000','00000','00000','01100','01100'],
  ':':['00000','01100','01100','00000','01100','01100','00000'],
  '_':['00000','00000','00000','00000','00000','00000','11111'],
  '/':['00001','00010','00100','01000','10000','00000','00000'],
  '#':['01010','11111','01010','01010','11111','01010','00000'],
  '!':['00100','00100','00100','00100','00100','00000','00100'],
  '?':['01110','10001','00010','00100','00100','00000','00100'],
  '(':['00010','00100','01000','01000','01000','00100','00010'],
  ')':['01000','00100','00010','00010','00010','00100','01000'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00110','01000','10000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','11110','00001','00001','10001','01110'],
  '6':['01110','10000','11110','10001','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','01100'],
  'A':['01110','10001','10001','11111','10001','10001','10001'],
  'B':['11110','10001','10001','11110','10001','10001','11110'],
  'C':['01110','10001','10000','10000','10000','10001','01110'],
  'D':['11100','10010','10001','10001','10001','10010','11100'],
  'E':['11111','10000','10000','11110','10000','10000','11111'],
  'F':['11111','10000','10000','11110','10000','10000','10000'],
  'G':['01110','10001','10000','10111','10001','10001','01110'],
  'H':['10001','10001','10001','11111','10001','10001','10001'],
  'I':['01110','00100','00100','00100','00100','00100','01110'],
  'J':['00111','00010','00010','00010','10010','10010','01100'],
  'K':['10001','10010','10100','11000','10100','10010','10001'],
  'L':['10000','10000','10000','10000','10000','10000','11111'],
  'M':['10001','11011','10101','10101','10001','10001','10001'],
  'N':['10001','11001','10101','10011','10001','10001','10001'],
  'O':['01110','10001','10001','10001','10001','10001','01110'],
  'P':['11110','10001','10001','11110','10000','10000','10000'],
  'Q':['01110','10001','10001','10001','10101','10010','01101'],
  'R':['11110','10001','10001','11110','10100','10010','10001'],
  'S':['01111','10000','10000','01110','00001','00001','11110'],
  'T':['11111','00100','00100','00100','00100','00100','00100'],
  'U':['10001','10001','10001','10001','10001','10001','01110'],
  'V':['10001','10001','10001','10001','10001','01010','00100'],
  'W':['10001','10001','10001','10101','10101','11011','10001'],
  'X':['10001','10001','01010','00100','01010','10001','10001'],
  'Y':['10001','10001','01010','00100','00100','00100','00100'],
  'Z':['11111','00001','00010','00100','01000','10000','11111'],
};

/** @param {Rgba} canvas @param {string} text @param {number} x @param {number} y @param {number} maxWidth @param {number} [scale] */
function drawLabel(canvas,text,x,y,maxWidth,scale=2) {
  const step=6*scale;
  const maxChars=Math.max(1,Math.floor(maxWidth/step));
  const upper=text.toUpperCase();
  const clipped=upper.length>maxChars?`${upper.slice(0,Math.max(1,maxChars-2))}..`:upper;
  let cx=x;
  for(const ch of clipped) {
    const glyph=FONT[ch]??FONT[' '];
    for(let row=0;row<7;row++) {
      for(let col=0;col<5;col++) {
        if(glyph[row][col]!=='1')continue;
        for(let dy=0;dy<scale;dy++) {
          for(let dx=0;dx<scale;dx++) {
            const px=cx+col*scale+dx;
            const py=y+row*scale+dy;
            if(px<0||py<0||px>=canvas.width||py>=canvas.height)continue;
            const idx=(py*canvas.width+px)*4;
            canvas.data[idx]=238;
            canvas.data[idx+1]=241;
            canvas.data[idx+2]=248;
            canvas.data[idx+3]=255;
          }
        }
      }
    }
    cx+=step;
  }
}

/**
 * Renders labeled image tiles onto a single grid PNG-ready RGBA canvas.
 * @param {Array<{label:string,image:Rgba}>} tiles
 * @param {{cols?:number,tileWidth?:number,tileHeight?:number,labelHeight?:number,gap?:number,checkerboard?:boolean}} [options]
 * @returns {Rgba}
 */
export function renderContactSheet(tiles,{cols=4,tileWidth=320,tileHeight=320,labelHeight=24,gap=10,checkerboard=true}={}) {
  if(!tiles.length)throw new Error('没有可拼接的图片。');
  const columns=Math.max(1,Math.min(cols,tiles.length));
  const rows=Math.ceil(tiles.length/columns);
  const cellH=tileHeight+labelHeight;
  const width=gap+columns*(tileWidth+gap);
  const height=gap+rows*(cellH+gap);
  const data=new Uint8Array(width*height*4);
  for(let i=0;i<width*height;i++) {
    data[i*4]=26;
    data[i*4+1]=29;
    data[i*4+2]=36;
    data[i*4+3]=255;
  }
  const canvas={width,height,data};
  for(let idx=0;idx<tiles.length;idx++) {
    const col=idx%columns;
    const row=Math.floor(idx/columns);
    const ox=gap+col*(tileWidth+gap);
    const oy=gap+row*(cellH+gap);
    // Header bar for the tile label.
    for(let y=oy;y<oy+labelHeight;y++) {
      for(let x=ox;x<ox+tileWidth;x++) {
        const p=(y*width+x)*4;
        data[p]=40;
        data[p+1]=45;
        data[p+2]=56;
        data[p+3]=255;
      }
    }
    drawLabel(canvas,tiles[idx].label,ox+6,oy+Math.max(2,Math.floor((labelHeight-14)/2)),tileWidth-12,2);
    // Image box with subtle dark matte background.
    const boxY=oy+labelHeight;
    for(let y=boxY;y<boxY+tileHeight;y++) {
      for(let x=ox;x<ox+tileWidth;x++) {
        const p=(y*width+x)*4;
        data[p]=18;
        data[p+1]=20;
        data[p+2]=25;
        data[p+3]=255;
      }
    }
    const thumb=resizeRgba(tiles[idx].image,tileWidth,tileHeight);
    const dx=ox+Math.floor((tileWidth-thumb.width)/2);
    const dy=boxY+Math.floor((tileHeight-thumb.height)/2);
    for(let y=0;y<thumb.height;y++) {
      for(let x=0;x<thumb.width;x++) {
        const src=(y*thumb.width+x)*4;
        const dst=((dy+y)*width+(dx+x))*4;
        const a=thumb.data[src+3]/255;
        const bg=checkerboard?(((Math.floor(x/12)+Math.floor(y/12))%2)?196:164):18;
        data[dst]=Math.round(thumb.data[src]*a+bg*(1-a));
        data[dst+1]=Math.round(thumb.data[src+1]*a+bg*(1-a));
        data[dst+2]=Math.round(thumb.data[src+2]*a+bg*(1-a));
        data[dst+3]=255;
      }
    }
  }
  return canvas;
}
