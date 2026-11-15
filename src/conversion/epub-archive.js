// Read-only ZIP access for EPUB input: STORE and DEFLATE entries, no encryption or ZIP64.
const ENTRY_LIMIT=10000,TOTAL_LIMIT=300*1024*1024;
const fail=message=>{throw new Error(message);};

async function inflate(bytes,size) {
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader=stream.getReader(),chunks=[];let length=0;
  for(;;) {
    const {done,value}=await reader.read();
    if(done)break;
    length+=value.length;
    if(length>size){await reader.cancel();fail('EPUB 文件内容与声明大小不一致。');}
    chunks.push(value);
  }
  if(length!==size)fail('EPUB 文件内容与声明大小不一致。');
  const out=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}
  return out;
}

export function openArchive(bytes) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)fail('不是有效的 EPUB（ZIP）文件。');
  const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true);
  if(count===0xffff||offset===0xffffffff)fail('不支持 ZIP64 格式的 EPUB。');
  if(count>ENTRY_LIMIT)fail('EPUB 内文件过多。');
  const names=new TextDecoder('utf-8'),entries=new Map();
  let pos=offset,total=0;
  for(let n=0;n<count;n++) {
    if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)fail('EPUB 目录结构损坏。');
    const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true);
    const compressed=v.getUint32(pos+20,true),size=v.getUint32(pos+24,true);
    const nameSize=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);
    const local=v.getUint32(pos+42,true),name=names.decode(bytes.subarray(pos+46,pos+46+nameSize));
    pos+=46+nameSize+extra+comment;
    if(name.endsWith('/'))continue;
    if(flags&1)fail('EPUB 已加密（DRM），无法读取。');
    if(![0,8].includes(method))fail('EPUB 使用了不支持的压缩方式。');
    total+=size;if(total>TOTAL_LIMIT)fail('EPUB 解压后超过 300 MB。');
    entries.set(name,{method,compressed,size,local});
  }
  async function read(name) {
    const entry=entries.get(name);
    if(!entry)fail(`EPUB 缺少文件：${name}`);
    const {local,compressed,size,method}=entry;
    if(local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)fail('EPUB 文件结构损坏。');
    const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
    if(start+compressed>bytes.length)fail('EPUB 文件结构损坏。');
    const data=bytes.subarray(start,start+compressed);
    if(method===8)return inflate(data,size);
    if(compressed!==size)fail('EPUB 文件内容与声明大小不一致。');
    return data.slice();
  }
  return {has:name=>entries.has(name),names:()=>[...entries.keys()],read};
}
