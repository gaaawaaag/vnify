import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {startManagerServer} from '../src/server/manager-server.mjs';

// Starts the asset manager on this folder (presets.json, image-presets.json, works/). `--open` opens the browser.
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
try {
  const server=await startManagerServer(port,{production:root});
  const url=`http://127.0.0.1:${server.address().port}/manager/`;
  console.log(`资产管理器：${url}  （关闭此窗口或按 Ctrl+C 停止）`);
  if(process.argv.includes('--open')){
    const [command,...args]=process.platform==='win32'?['cmd','/c','start','',url]:process.platform==='darwin'?['open',url]:['xdg-open',url];
    spawn(command,args,{stdio:'ignore',detached:true}).on('error',()=>{}).unref();
  }
}catch(e){
  console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用：关掉已打开的管理器，或设置 PORT 换一个端口。`:e.message);
  process.exitCode=1;
}
