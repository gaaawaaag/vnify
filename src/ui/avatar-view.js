// Render the saved source rectangle identically in the editor, Cast and profile.
export function positionAvatarImage(node,image,crop) {
  node.style.width=`${image.width/crop.size*100}%`;
  node.style.height=`${image.height/crop.size*100}%`;
  node.style.left=`${-crop.x/crop.size*100}%`;
  node.style.top=`${-crop.y/crop.size*100}%`;
}
export function createAvatarView(avatar,url) {
  const frame=document.createElement('span');frame.className=avatar.kind==='standing'?'avatar-frame standing-frame':'avatar-frame';frame.setAttribute('aria-hidden','true');
  frame.style.aspectRatio=avatar.crop?'1':`${avatar.image.width} / ${avatar.image.height}`;
  const image=document.createElement('img');image.alt='';image.draggable=false;image.src=url;
  if(avatar.kind!=='standing')positionAvatarImage(image,avatar.image,avatar.crop);
  frame.append(image);return frame;
}
