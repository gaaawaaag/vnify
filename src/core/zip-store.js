// Small, bounded ZIP STORE codec. Already compressed raster images need no second compression.
// This reader intentionally accepts only the unencrypted STORE packages produced here.
// The limits of the ZIP format without ZIP64; how large a book may be is up to the shelf, not the archive.
export const ZIP_LIMIT=0xffffffff;
const ENTRY_LIMIT=0xffff;
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
// Chainable: crc32(b,crc32(a)) is the checksum of a followed by b, so a file can be summed chunk by chunk.
/** @param {Uint8Array} bytes @param {number} [previous] */
export function crc32(bytes,previous=0) {let c=(previous^0xffffffff)>>>0;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function safeName(name) {
  if(!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(name) || name.split('/').some(p=>p==='.'||p==='..')) throw new Error('作品包包含非法路径。');
}
// The records around each stored file, shared by the in-memory writer and the shelf's streamed download.
/** @param {Uint8Array} filename @param {number} crc @param {number} size */
function localHeader(filename,crc,size) {
  const header=new Uint8Array(30+filename.length),v=new DataView(header.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);
  v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,filename.length,true);header.set(filename,30);
  return header;
}
/** @param {Uint8Array} filename @param {number} crc @param {number} size @param {number} offset */
function directoryRecord(filename,crc,size,offset) {
  const directory=new Uint8Array(46+filename.length),d=new DataView(directory.buffer);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);
  d.setUint32(16,crc,true);d.setUint32(20,size,true);d.setUint32(24,size,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);directory.set(filename,46);
  return directory;
}
/** @param {number} count @param {number} centralSize @param {number} offset */
function closingRecord(count,centralSize,offset) {
  const end=new Uint8Array(22),v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  return end;
}
/* An archive written as it is sent: files: [{name,size,crc}] in order. Returns its total size and, for each file,
 * the bytes that go before it; the bytes after the last file close the archive. */
/** @param {{name:string,size:number,crc:number}[]} files */
export function zipLayout(files) {
  if(files.length>ENTRY_LIMIT)throw new Error('作品包文件过多。');
  const seen=new Set(),before=[],central=[];let offset=0;
  for(const {name,size,crc} of files) {
    safeName(name);if(seen.has(name))throw new Error('作品包包含重复文件。');seen.add(name);
    const filename=enc.encode(name),header=localHeader(filename,crc,size);
    before.push(header);central.push(directoryRecord(filename,crc,size,offset));offset+=header.length+size;
  }
  const centralSize=central.reduce((n,record)=>n+record.length,0);
  if(offset+centralSize+22>ZIP_LIMIT)throw new Error('作品包超过 ZIP 格式上限（4 GB）。');
  const after=new Uint8Array(centralSize+22);
  let at=0;for(const record of central){after.set(record,at);at+=record.length;}
  after.set(closingRecord(files.length,centralSize,offset),at);
  return {size:offset+after.length,before,after};
}
/** @param {[string,Uint8Array][]} entries @returns {Blob} */
export function writeZip(entries) {
  const {before,after}=zipLayout(entries.map(([name,bytes])=>({name,size:bytes.length,crc:crc32(bytes)})));
  return new Blob([...entries.flatMap(([,bytes],i)=>[before[i],bytes]),after],{type:'application/zip'});
}
const failZip=()=>{throw new Error('作品包损坏或不支持此 ZIP 格式，请导入 vnify. 导出的原始 .vn.zip 文件。');};
// The end record: where the central directory starts, how large it is and how many entries it lists.
/** @param {Uint8Array} tail the archive's last 22 bytes @param {number} end their offset */
function endRecord(tail,end) {
  const v=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  if(v.getUint32(0,true)!==0x06054b50 || v.getUint16(4,true) || v.getUint16(6,true) || v.getUint16(20,true))failZip();
  const count=v.getUint16(10,true),size=v.getUint32(12,true),start=v.getUint32(16,true);
  if(!count || count>ENTRY_LIMIT || count!==v.getUint16(8,true) || start+size!==end)failZip();
  return {count,start};
}
/* The central directory's entries in archive order. Each file must follow the previous one directly, with a local
 * header as long as the one written here, so `dataStart` is known without reading the local header. */
/** @param {Uint8Array} dir @param {number} count */
function directoryEntries(dir,count) {
  const v=new DataView(dir.buffer,dir.byteOffset,dir.byteLength),entries=[],names=new Set();
  let pos=0,nextLocal=0;
  for(let i=0;i<count;i++) {
    if(pos+46>dir.length || v.getUint32(pos,true)!==0x02014b50)failZip();
    const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),length=v.getUint32(pos+24,true);
    const nameSize=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
    if(flags!==0x800 || method!==0 || v.getUint32(pos+20,true)!==length || extra || comment || v.getUint16(pos+34,true) || pos+46+nameSize>dir.length)failZip();
    const name=dec.decode(dir.subarray(pos+46,pos+46+nameSize));safeName(name);
    if(names.has(name) || offset!==nextLocal)failZip();
    names.add(name);
    const dataStart=offset+30+nameSize;
    entries.push({name,flags,method,crc,length,nameSize,offset,dataStart});
    nextLocal=dataStart+length;pos+=46+nameSize;
  }
  if(pos!==dir.length)failZip();
  return {entries,end:nextLocal};
}
/** @template {ArrayBufferLike} B @param {Uint8Array<B>} bytes @returns {Map<string,Uint8Array<B>>} */
export function readZip(bytes) {
  if(bytes.length<22 || bytes.length>ZIP_LIMIT)failZip();
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=bytes.length-22;
  const {count,start}=endRecord(bytes.subarray(end),end);
  const {entries,end:last}=directoryEntries(bytes.subarray(start,end),count);
  if(last!==start)failZip();
  const files=new Map();
  for(const {name,flags,method,crc,length,nameSize,offset,dataStart} of entries) {
    if(v.getUint32(offset,true)!==0x04034b50 || v.getUint16(offset+6,true)!==flags || v.getUint16(offset+8,true)!==method
      || v.getUint32(offset+14,true)!==crc || v.getUint32(offset+18,true)!==length || v.getUint32(offset+22,true)!==length
      || v.getUint16(offset+26,true)!==nameSize || v.getUint16(offset+28,true) || dec.decode(bytes.subarray(offset+30,dataStart))!==name)failZip();
    const data=bytes.subarray(dataStart,dataStart+length);if(crc32(data)!==crc)failZip();
    files.set(name,data);
  }
  return files;
}
/* The files of a package archive the reader chose, read lazily: only the end record and the directory are read now,
 * images stay slices read when needed, so a large package never sits in memory whole. The text files (small, and with
 * no other check of their bytes) are read and checked against their CRC32 here; images are checked by their SHA-256. */
/** @param {Blob} blob @returns {Promise<Map<string,Blob>>} */
export async function zipFiles(blob) {
  if(blob.size<22 || blob.size>ZIP_LIMIT)failZip();
  const end=blob.size-22,bytes=async(/** @type {number} */ from,/** @type {number} */ to)=>new Uint8Array(await blob.slice(from,to).arrayBuffer());
  const {count,start}=endRecord(await bytes(end,blob.size),end);
  const {entries,end:last}=directoryEntries(await bytes(start,end),count);
  if(last!==start)failZip();
  const files=new Map();
  for(const {name,crc,dataStart,length} of entries) {
    const slice=blob.slice(dataStart,dataStart+length);
    if(!name.startsWith('assets/')&&crc32(await bytes(dataStart,dataStart+length))!==crc)failZip();
    files.set(name,slice);
  }
  return files;
}
