/* Background removal for figures generated on a plain solid background, without a model.
 * The background color is the median of the image border. Pixels close to it and connected to the border are cleared;
 * enclosed patches of background (between an arm and the body) are cleared too once they are big enough to be more
 * than a highlight. In a narrow band next to the cleared area each pixel's alpha comes from how far it lies from the
 * background toward the nearby figure color that best explains it, and its color is unmixed from the background so no fringe remains. */
const BORDER=2,BAND=3,FRINGE=8,REACH=5;

const distance=(data,i,[r,g,b])=>Math.hypot(data[i]-r,data[i+1]-g,data[i+2]-b);
const median=values=>{values.sort((a,b)=>a-b);return values[values.length>>1];};

function borderIndices(width,height) {
  const out=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    if(x<BORDER||y<BORDER||x>=width-BORDER||y>=height-BORDER)out.push(y*width+x);
  return out;
}

// options: tolerance (distance that still counts as background), soft (width of the fade beyond it, used where the
// figure beside an edge is too close to the background color to measure against),
// keepHoles (leave enclosed background patches), minHole (smallest enclosed patch cleared, as a share of the image).
export function removeBackground({width,height,data},{tolerance=null,soft=72,keepHoles=false,minHole=.0005}={}) {
  const pixels=width*height,border=borderIndices(width,height);
  if(border.filter(p=>data[p*4+3]<128).length>border.length/2)throw new Error('图片四边已是透明，不需要去背。');
  const background=[0,1,2].map(c=>median(border.map(p=>data[p*4+c])));
  const near=border.map(p=>distance(data,p*4,background)).filter(d=>d<48);
  if(near.length<border.length*.5)
    throw new Error(`四边不是统一的纯色背景（只有 ${Math.round(near.length/border.length*100)}% 接近背景色），请用纯色背景重新生成。`);
  // Flat backgrounds from image models still carry some noise; the threshold grows with it.
  const noise=Math.sqrt(near.reduce((sum,d)=>sum+d*d,0)/near.length);
  const inner=tolerance??Math.max(24,noise*4),outer=inner+soft;
  const dist=new Float32Array(pixels);
  for(let p=0;p<pixels;p++)dist[p]=distance(data,p*4,background);
  // 1 = background reached from the border, 2.. = enclosed patches by component.
  const label=new Int32Array(pixels),queue=new Int32Array(pixels);
  function fill(seeds,mark) {
    let head=0,tail=0,size=0;
    for(const p of seeds)if(!label[p]&&dist[p]<=inner){label[p]=mark;queue[tail++]=p;}
    while(head<tail) {
      const p=queue[head++],x=p%width;size++;
      for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,p-width,p+width])
        if(q>=0&&q<pixels&&!label[q]&&dist[q]<=inner){label[q]=mark;queue[tail++]=q;}
    }
    return size;
  }
  fill(border,1);
  const clear=new Uint8Array(pixels);
  for(let p=0;p<pixels;p++)if(label[p]===1)clear[p]=1;
  let holes=0;
  if(!keepHoles) {
    const sizes=[0,0];
    for(let p=0;p<pixels;p++)if(!label[p]&&dist[p]<=inner)sizes.push(fill([p],sizes.length));
    for(let p=0;p<pixels;p++)if(label[p]>1&&sizes[label[p]]>=minHole*pixels)clear[p]=1;
    holes=sizes.slice(2).filter(size=>size>=minHole*pixels).length;
  }
  // Edge pixels within BAND of the cleared area are mixes of the background and the figure beside them. The figure color
  // is the average of nearby pixels further in; the mix ratio along background→figure gives alpha.
  const depth=new Uint8Array(pixels).fill(255);  // steps from the cleared area, up to FRINGE
  let head=0,tail=0;
  for(let p=0;p<pixels;p++)if(clear[p]){depth[p]=0;queue[tail++]=p;}
  while(head<tail) {
    const p=queue[head++],x=p%width;
    if(depth[p]>=FRINGE)continue;
    for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,p-width,p+width])
      if(q>=0&&q<pixels&&depth[q]===255){depth[q]=depth[p]+1;queue[tail++]=q;}
  }
  const out=new Uint8Array(data);
  let cleared=0;
  for(let p=0;p<pixels;p++) {
    const i=p*4;
    if(clear[p]){out[i]=out[i+1]=out[i+2]=out[i+3]=0;cleared++;continue;}
    // Gaps between strands of hair a little further in still show the background.
    if(depth[p]>BAND&&!(depth[p]<=FRINGE&&dist[p]<outer))continue;
    // Of the figure pixels nearby, the one that best explains this pixel as a mix with the background sets alpha.
    const x=p%width,y=(p-x)/width,mixed=[0,1,2].map(c=>data[i+c]-background[c]);
    let alpha=null,best=Infinity;
    for(let dy=-REACH;dy<=REACH;dy++)for(let dx=-REACH;dx<=REACH;dx++) {
      const nx=x+dx,ny=y+dy,q=(ny*width+nx)*4;
      if(nx<0||ny<0||nx>=width||ny>=height||depth[q/4]<=BAND)continue;
      const f0=data[q]-background[0],f1=data[q+1]-background[1],f2=data[q+2]-background[2],span=f0*f0+f1*f1+f2*f2;
      if(span<outer*outer)continue;
      const a=Math.min(1,Math.max(0,(mixed[0]*f0+mixed[1]*f1+mixed[2]*f2)/span));
      const residual=(mixed[0]-a*f0)**2+(mixed[1]-a*f1)**2+(mixed[2]-a*f2)**2;
      if(residual<best){best=residual;alpha=a;}
    }
    alpha??=(dist[p]-inner)/(outer-inner);
    alpha=Math.min(1,Math.max(0,alpha));
    if(alpha<.04){out[i]=out[i+1]=out[i+2]=out[i+3]=0;cleared++;continue;}
    for(let c=0;c<3;c++)out[i+c]=Math.min(255,Math.max(0,Math.round((data[i+c]-(1-alpha)*background[c])/alpha)));
    out[i+3]=Math.round(data[i+3]*alpha);
  }
  return {image:{width,height,data:out},report:{background,tolerance:Math.round(inner),soft,holes,transparent:cleared/pixels}};
}

// The cut-out figure over a gray checkerboard, to look at the edges.
export function checkerPreview({width,height,data},cell=16) {
  const out=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*4,a=data[i+3]/255,shade=((x/cell|0)+(y/cell|0))%2?110:150;
    for(let c=0;c<3;c++)out[i+c]=Math.round(data[i+c]*a+shade*(1-a));
    out[i+3]=255;
  }
  return {width,height,data:out};
}
