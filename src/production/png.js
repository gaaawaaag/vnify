import {inflateSync,deflateSync} from 'node:zlib';

// A small PNG codec for production tools that run without an image library: non-interlaced PNGs of any color type
// decode to 8-bit RGBA; images encode as 8-bit RGBA.
const SIGNATURE=[137,80,78,71,13,10,26,10];
const CHANNELS={0:1,2:3,3:1,4:2,6:4};
const crcTable=[...Array(256)].map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};

function paeth(a,b,c) {
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}

export function decodePng(bytes) {
  bytes=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<8||SIGNATURE.some((b,i)=>bytes[i]!==b))throw new Error('不是 PNG 文件。');
  let header=null,palette=null,alphaTable=null;const data=[];
  for(let at=8;at+8<=bytes.length;) {
    const length=bytes.readUInt32BE(at),type=bytes.toString('latin1',at+4,at+8),body=bytes.subarray(at+8,at+8+length);
    if(type==='IHDR')header={width:body.readUInt32BE(0),height:body.readUInt32BE(4),depth:body[8],color:body[9],interlace:body[12]};
    else if(type==='PLTE')palette=body;
    else if(type==='tRNS')alphaTable=body;
    else if(type==='IDAT')data.push(body);
    else if(type==='IEND')break;
    at+=12+length;
  }
  if(!header||!CHANNELS[header.color])throw new Error('PNG 头信息无法识别。');
  const {width,height,depth,color}=header;
  if(header.interlace)throw new Error('暂不支持隔行扫描（interlaced）PNG，请另存为普通 PNG。');
  if(color===3?![1,2,4,8].includes(depth):![8,16].includes(depth))throw new Error(`暂不支持 ${depth} 位的此类 PNG。`);
  const channels=CHANNELS[color],bits=channels*depth,stride=Math.ceil(width*bits/8),step=Math.max(1,bits/8);
  const raw=inflateSync(Buffer.concat(data));
  if(raw.length<(stride+1)*height)throw new Error('PNG 数据不完整。');
  const rows=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),out=y*stride;
    for(let x=0;x<stride;x++) {
      const a=x>=step?rows[out+x-step]:0,b=y?rows[out-stride+x]:0,c=y&&x>=step?rows[out-stride+x-step]:0;
      const predicted=filter===0?0:filter===1?a:filter===2?b:filter===3?(a+b)>>1:filter===4?paeth(a,b,c):-1;
      if(predicted<0)throw new Error('PNG 行过滤方式无法识别。');
      rows[out+x]=(line[x]+predicted)&255;
    }
  }
  const rgba=new Uint8Array(width*height*4);
  const sample=(y,i)=>depth===16?rows[y*stride+i*2]:depth===8?rows[y*stride+i]
    :(rows[y*stride+(i*depth>>3)]>>(8-depth-(i*depth&7)))&((1<<depth)-1);
  const transparent16=alphaTable&&color!==3?[0,2,4].map(i=>alphaTable.length>i+1?alphaTable.readUInt16BE(i):null):null;
  const wide=(y,i)=>depth===16?rows.readUInt16BE(y*stride+i*2):sample(y,i);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const o=(y*width+x)*4,i=x*channels;
    if(color===3) {
      const index=sample(y,x);
      if(!palette||index*3+2>=palette.length)throw new Error('PNG 调色板索引越界。');
      rgba.set([palette[index*3],palette[index*3+1],palette[index*3+2],alphaTable&&index<alphaTable.length?alphaTable[index]:255],o);
    }else if(color===0||color===4) {
      const g=sample(y,i),alpha=color===4?sample(y,i+1):transparent16&&wide(y,i)===transparent16[0]?0:255;
      rgba.set([g,g,g,alpha],o);
    }else {
      const alpha=color===6?sample(y,i+3)
        :transparent16&&[0,1,2].every(k=>wide(y,i+k)===transparent16[k])?0:255;
      rgba.set([sample(y,i),sample(y,i+1),sample(y,i+2),alpha],o);
    }
  }
  return {width,height,data:rgba};
}

function chunk(type,body) {
  const out=Buffer.alloc(12+body.length),typed=Buffer.concat([Buffer.from(type,'latin1'),body]);
  out.writeUInt32BE(body.length,0);typed.copy(out,4);out.writeUInt32BE(crc(typed),8+body.length);
  return out;
}

// Each row takes the filter with the smallest sum of absolute residuals, the usual heuristic for good compression.
export function encodePng({width,height,data}) {
  const stride=width*4,rows=Buffer.alloc((stride+1)*height),line=Buffer.alloc(stride);
  for(let y=0;y<height;y++) {
    let best=null,bestScore=Infinity;
    for(let filter=0;filter<5;filter++) {
      let score=0;
      for(let x=0;x<stride;x++) {
        const at=y*stride+x,a=x>=4?data[at-4]:0,b=y?data[at-stride]:0,c=y&&x>=4?data[at-stride-4]:0;
        const value=(data[at]-(filter===0?0:filter===1?a:filter===2?b:filter===3?(a+b)>>1:paeth(a,b,c)))&255;
        line[x]=value;score+=value<128?value:256-value;
      }
      if(score<bestScore){bestScore=score;best=[filter,Buffer.from(line)];}
    }
    rows[y*(stride+1)]=best[0];best[1].copy(rows,y*(stride+1)+1);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header.set([8,6,0,0,0],8);
  return Buffer.concat([Buffer.from(SIGNATURE),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
