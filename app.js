(()=>{
 const root=document.getElementById('receipt-paper-demo'),q=s=>root.querySelector(s);
 const canvas=q('canvas'),output=q('.rp-output'),stub=q('.rp-stub'),status=q('.rp-status'),print=q('.rp-print'),tear=q('.rp-tear'),sound=q('.rp-sound'),empty=q('.rp-empty');
 const W=268,H=560,COLS=36,ROWS=112,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Eight 70px feed segments: advance 300ms, pause 120ms between segments.
 const PRINT_STEPS=8,FEED_MS=300,PAUSE_MS=120,PRINT_CYCLE=FEED_MS+PAUSE_MS,PRINT_DURATION=PRINT_STEPS*PRINT_CYCLE-PAUSE_MS;
 let state='idle',enabled=true,serial=1,feed=0,progress=0,drag=null,audio=null,printingAudio=null,lastCrackle=0,frameID=0,lastFrame=0,printStarted=0,detachStarted=0,paperWidth=268,viewWidth=580,viewHeight=459;
 let pullX=0,pullY=0,targetX=0,targetY=0,velocityX=0,velocityY=0,drop=0,spin=0,colors={},geometry=[],polygons=[];
 let soundPrintStep=-1;
 const texture=document.createElement('canvas');texture.width=W*3;texture.height=H*3;const tx=texture.getContext('2d');
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});const fallback=gl?null:canvas.getContext('2d');
 const vertices=new Float32Array((COLS+1)*(ROWS+1)*7),indices=new Uint16Array(COLS*ROWS*6);let ii=0;
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const a=r*(COLS+1)+c,b=a+1,d=a+COLS+1,e=d+1;indices.set([a,b,d,b,e,d],ii);ii+=6}
 let program,vertexBuffer,textureGL;
 if(gl){
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const vs=compile(gl.VERTEX_SHADER,'attribute vec3 aPosition;attribute vec2 aUV;attribute vec2 aLight;uniform vec2 uSize;varying vec2 vUV;varying vec2 vLight;void main(){gl_Position=vec4(aPosition.x/uSize.x*2.0-1.0,1.0-aPosition.y/uSize.y*2.0,0.3-aPosition.z/400.0,1.0);vUV=aUV;vLight=aLight;}');
  const fs=compile(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D uTexture;uniform vec3 uPaper;varying vec2 vUV;varying vec2 vLight;void main(){vec3 ink=texture2D(uTexture,vUV).rgb;float grain=fract(sin(dot(vUV,vec2(127.1,311.7)))*43758.5453);vec3 back=uPaper*(0.986+0.014*grain);gl_FragColor=vec4((vLight.y<0.0?back:ink)*vLight.x,1.0);}');
  program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,vertices.byteLength,gl.DYNAMIC_DRAW);
  for(const [name,size,offset]of[['aPosition',3,0],['aUV',2,12],['aLight',2,20]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset)}
  const indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  textureGL=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textureGL);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);
 }
 function color(variable){const probe=document.createElement('span');probe.style.color='var('+variable+')';root.append(probe);const v=getComputedStyle(probe).color;probe.remove();return v}
 function buildTexture(){
  colors={paper:color('--rp-paper'),ink:color('--rp-paper-ink'),muted:color('--rp-paper-muted'),shadow:color('--rp-shadow')};tx.setTransform(3,0,0,3,0,0);tx.fillStyle=colors.paper;tx.fillRect(0,0,W,H);
  tx.fillStyle=colors.ink;let seed=71;for(let i=0;i<4500;i++){seed=(seed*16807)%2147483647;const x=seed%W;seed=(seed*16807)%2147483647;tx.globalAlpha=.017;tx.fillRect(x,seed%H,.55,.55)}tx.globalAlpha=1;
  const text=(s,x,y,size=12,align='left',weight=400,muted=false)=>{tx.fillStyle=muted?colors.muted:colors.ink;tx.font=weight+' '+size+'px Consolas,monospace';tx.textAlign=align;tx.fillText(s,x,y)};
  const rule=y=>{tx.strokeStyle=colors.muted;tx.lineWidth=.65;tx.setLineDash([3,3]);tx.beginPath();tx.moveTo(21,y);tx.lineTo(W-21,y);tx.stroke();tx.setLineDash([])};
  rule(5);text('AI SUPPLY STORE',W/2,38,18,'center',700);text('DAILY USAGE RECEIPT',W/2,56,11,'center');text('2026-10-08',22,81,11);text('No. '+String(serial).padStart(4,'0'),W-22,81,11,'right');rule(94);text('MODEL / TOKENS',22,113,11,'left',400,true);text('USD',W-22,113,11,'right',400,true);
  const items=[['Codex','840,000','1.56'],['Claude','320,000','0.76'],['Cursor','180,000','0.42'],['Grok','96,000','0.20'],['GLM','88,000','0.14'],['Gemini','72,000','0.12']];
  items.forEach(([name,tokens,cost],i)=>{const y=136+i*31;text(name,22,y,14);text(cost,W-22,y,13,'right');text(tokens+' tokens',22,y+13,10.5,'left',400,true)});
  rule(313);text('TOTAL',22,339,15);text('$3.20',W-22,341,24,'right',700);text('CACHE HIT',22,364,11,'left',400,true);text('72.4%',W-22,364,11,'right',400,true);rule(381);
  text('SESSION DETAILS',22,403,11,'left',400,true);text('INPUT TOKENS',22,425,11);text('412,000',W-22,425,11,'right');text('OUTPUT TOKENS',22,446,11);text('156,000',W-22,446,11,'right');text('CACHED TOKENS',22,467,11);text('1,028,000',W-22,467,11,'right');rule(484);
  tx.fillStyle=colors.ink;for(let x=49;x<219;){seed=(seed*16807)%2147483647;const bw=1+seed%3;tx.fillRect(x,499,bw,24);x+=bw+2+seed%2}text('THANK YOU FOR BUILDING.',W/2,540,10,'center');
  if(gl){gl.bindTexture(gl.TEXTURE_2D,textureGL);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,texture);const rgb=colors.paper.match(/[\d.]+/g).slice(0,3).map(Number);gl.uniform3f(gl.getUniformLocation(program,'uPaper'),rgb[0]/255,rgb[1]/255,rgb[2]/255)}
 }
 function setState(next,message){state=next;root.dataset.state=next;status.textContent=message;print.disabled=['printing','dragging','tearing'].includes(next);tear.disabled=next!=='ready';print.textContent=next==='idle'?'打印长小票':'再打印一张'}
 // Store demo state locally. Storage failure does not block the animation.
 const STORAGE_KEY='paper-receipt-demo-state';
 function readSavedState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))}catch{return null}}
 function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,sound:enabled,serial,printed:feed===1,progress}))}catch{}}
 function restore(value){const p=value;if(typeof p?.sound==='boolean'){enabled=p.sound;sound.textContent=enabled?'音效：开':'音效：关';sound.setAttribute('aria-pressed',String(enabled))}if(p?.version===2&&state!=='dragging'&&state!=='printing'){serial=Number.isInteger(p.serial)?p.serial:1;progress=clamp(Number(p.progress)||0,0,1);feed=p.printed?1:0;empty.hidden=feed>0;stub.style.display=feed?'block':'none';drop=progress===1?25:0;spin=progress===1?-.045:0;setState(feed?(progress===1?'torn':'ready'):'idle',feed?(progress===1?'已完整撕下':readyMessage()):'准备就绪 · 点击打印长小票');buildTexture();requestDraw()}}
 function readyMessage(){return progress>0?'裂口 '+Math.round(progress*100)+'% · 松手保留，可以接着撕':'按住纸张向左下方轻拉，一点点撕开'}
 async function unlock(){if(!enabled)return false;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;audio??=new AC();if(audio.state!=='running')await audio.resume();return audio.state==='running'}catch{return false}}
 function noise(duration,volume,printing=false){if(!enabled||audio?.state!=='running')return null;const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){const t=i/audio.sampleRate,r=Math.random()*2-1;last=(last+r*.27)/1.27;data[i]=printing?last*(.2+.8*Math.pow(Math.max(0,Math.sin(t*90)),5)):r*Math.pow(1-i/data.length,1.2)}const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type=printing?'bandpass':'highpass';filter.frequency.value=printing?1500:1400;gain.gain.value=volume;source.connect(filter).connect(gain).connect(audio.destination);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};source.start();return source}
 function stopSound(){if(printingAudio){try{printingAudio.stop()}catch{}printingAudio=null}}
 // Integrate a short acceleration/deceleration ramp; hold feed constant during pauses.
 function printSample(elapsed){
  if(reduced()||elapsed>=PRINT_DURATION)return {feed:1,phase:'complete',step:PRINT_STEPS,remaining:0};
  const step=Math.floor(Math.max(0,elapsed)/PRINT_CYCLE),local=Math.max(0,elapsed)-step*PRINT_CYCLE,u=clamp(local/FEED_MS,0,1),ramp=.1;
  const travel=u<ramp?u*u/(2*ramp*(1-ramp)):u>1-ramp?1-(1-u)*(1-u)/(2*ramp*(1-ramp)):(u-ramp/2)/(1-ramp);
  return {feed:(step+travel)/PRINT_STEPS,phase:local<FEED_MS?'feeding':'paused',step,remaining:Math.max(0,FEED_MS-local)};
 }
 function syncPrintSound(sample){
  if(sample.phase!=='feeding'||!enabled){stopSound();return}
  if(audio?.state==='running'&&(soundPrintStep!==sample.step||!printingAudio)){
   stopSound();soundPrintStep=sample.step;printingAudio=noise(Math.max(.001,sample.remaining/1000),.19,true)
  }
 }
 function crackle(amount){const now=performance.now();if(now-lastCrackle>45&&amount>.001){noise(.025+Math.min(amount,.1)*.6,.065+Math.min(amount,.1)*.8);lastCrackle=now}}
 // Tear progress is irreversible; completion releases the remaining connection.
 function advanceTo(value){const prev=progress;progress=clamp(Math.max(progress,value),0,1);if(progress>1-1e-6)progress=1;root.dataset.tear=progress.toFixed(5);crackle(progress-prev);if(progress>=1&&state!=='tearing'&&state!=='torn'){const id=drag?.id;drag=null;targetX=targetY=0;detachStarted=performance.now();setState('tearing','裂口贯穿纸宽，最后一段已断开');noise(.10,.16);if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}requestDraw()}
 // Deform a textured paper mesh; keep the unbroken top edge attached.
 function point(u,v){
  const sourceY=v*H+(v===0&&(u<progress||progress===1)?(Math.round(u*COLS)%2?4:1):0),flatY=sourceY-(1-feed)*H;
  const curlStart=350,R=61+Math.min(Math.abs(pullY)*.025,4),theta=Math.max(0,flatY-curlStart)/R;
  let y=20+(theta?curlStart+R*Math.sin(theta):flatY),z=theta?R*(1-Math.cos(theta)):0,x=(u-.5)*paperWidth;
  const depth=clamp(flatY/H,0,1),separation=progress===1?1:(progress?clamp((progress-u)*COLS,0,1):0);
  const splitOpen=separation*(5+progress*5+Math.max(0,pullY)*.13)*Math.exp(-Math.max(0,flatY)/100);
  y+=splitOpen+pullY*.035*Math.sin(depth*Math.PI)*progress;
  x+=pullX*.085*(.1+.9*depth)*progress;z+=Math.sin(depth*Math.PI)*Math.abs(pullY)*.16*(1-u)*progress;
  const bow=-progress*.035*(depth+(1-depth)*separation),pivot=paperWidth*.5;
  const bx=x-pivot,by=y;x=pivot+bx*Math.cos(bow)-by*Math.sin(bow);y=bx*Math.sin(bow)+by*Math.cos(bow);
  const persp=1000/(1000-z);x*=persp;y=205+(y-205)*persp;
  if(state==='tearing'||state==='torn'){const yy=y-150,xx=x;x=xx*Math.cos(spin)-yy*Math.sin(spin);y=150+xx*Math.sin(spin)+yy*Math.cos(spin)+drop}
  return {x:viewWidth/2+x,y,z,u,v,shade:clamp(.76+.24*Math.abs(Math.cos(theta))-.07*Math.sin(theta),.62,1),front:Math.cos(theta)};
 }
 function stubEdge(){const points=['0 0','100% 0'];for(let i=COLS;i>=0;i--){const u=i/COLS,y=(u<progress||progress===1)?(i%2?21:24):20;points.push((u*100)+'% '+y+'px')}stub.style.clipPath='polygon('+points.join(',')+')'}
 function drawFallback(){
  const ctx=fallback,dpr=canvas.width/viewWidth;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewWidth,viewHeight);
  const tris=[];for(let i=0;i<indices.length;i+=3){const ps=[geometry[indices[i]],geometry[indices[i+1]],geometry[indices[i+2]]];tris.push(ps)}tris.sort((a,b)=>a.reduce((s,p)=>s+p.z,0)-b.reduce((s,p)=>s+p.z,0));
  for(const p of tris){if(p.every(a=>a.y<0)||p.every(a=>a.y>viewHeight))continue;const s=p.map(a=>({x:a.u*W,y:a.v*H})),den=s[0].x*(s[1].y-s[2].y)+s[1].x*(s[2].y-s[0].y)+s[2].x*(s[0].y-s[1].y);if(Math.abs(den)<.001)continue;
   ctx.save();ctx.beginPath();p.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.clip();
   if(p.reduce((v,a)=>v+a.front,0)<0){ctx.fillStyle=colors.paper;ctx.fillRect(0,0,viewWidth,viewHeight)}else{
    const coefficients=k=>[(p[0][k]*(s[1].y-s[2].y)+p[1][k]*(s[2].y-s[0].y)+p[2][k]*(s[0].y-s[1].y))/den,(p[0][k]*(s[2].x-s[1].x)+p[1][k]*(s[0].x-s[2].x)+p[2][k]*(s[1].x-s[0].x))/den,(p[0][k]*(s[1].x*s[2].y-s[2].x*s[1].y)+p[1][k]*(s[2].x*s[0].y-s[0].x*s[2].y)+p[2][k]*(s[0].x*s[1].y-s[1].x*s[0].y))/den];
    const a=coefficients('x'),b=coefficients('y');ctx.transform(a[0],b[0],a[1],b[1],a[2],b[2]);ctx.drawImage(texture,0,0,W,H)
   }ctx.restore();
  }
 }
 function render(){
  root.dataset.tear=progress.toFixed(5);root.dataset.feed=feed.toFixed(6);stubEdge();if(feed===0){if(gl)gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);else fallback.clearRect(0,0,canvas.width,canvas.height);return}
  geometry=[];let offset=0;for(let r=0;r<=ROWS;r++)for(let c=0;c<=COLS;c++){const p=point(c/COLS,r/ROWS);geometry.push(p);vertices.set([p.x,p.y,p.z,p.u,p.v,p.shade,p.front],offset);offset+=7}
  polygons=[];for(let r=0;r<ROWS;r++){const a=geometry[r*(COLS+1)],b=geometry[r*(COLS+1)+COLS],c=geometry[(r+1)*(COLS+1)+COLS],d=geometry[(r+1)*(COLS+1)];polygons.push([a,b,c,d])}
  if(gl){gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(program,'uSize'),viewWidth,viewHeight);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0)}else drawFallback();
 }
 function requestDraw(){if(!frameID)frameID=requestAnimationFrame(tick)}
 function tick(now){frameID=0;const dt=clamp((now-(lastFrame||now-16))/1000,.001,.035);lastFrame=now;let moving=false;
  if(state==='printing'){const sample=printSample(now-printStarted);feed=sample.feed;root.dataset.printPhase=sample.phase;syncPrintSound(sample);moving=feed<1;if(!moving){stopSound();stub.style.display='block';setState('ready',readyMessage());save()}}
  if(state==='tearing'){const p=clamp((now-detachStarted)/(reduced()?1:620),0,1);drop=25*(1-Math.pow(1-p,3))+Math.sin(p*Math.PI)*9;spin=-.045*(1-Math.pow(1-p,3));moving=p<1;if(!moving){setState('torn','已完整撕下 · 可以再打印一张');save()}}
  if(reduced()){pullX=targetX;pullY=targetY;velocityX=velocityY=0}else{velocityX+=(150*(targetX-pullX)-21*velocityX)*dt;velocityY+=(150*(targetY-pullY)-21*velocityY)*dt;pullX+=velocityX*dt;pullY+=velocityY*dt;if(Math.abs(targetX-pullX)+Math.abs(targetY-pullY)+Math.abs(velocityX)+Math.abs(velocityY)>.15)moving=true;else{pullX=targetX;pullY=targetY;velocityX=velocityY=0}}
  render();if(moving)requestDraw();else lastFrame=0;
 }
 function resize(){const b=output.getBoundingClientRect();viewWidth=b.width;viewHeight=b.height;paperWidth=Math.min(W,viewWidth-70);const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(viewWidth*dpr);canvas.height=Math.round(viewHeight*dpr);stub.style.width=paperWidth+'px';requestDraw()}
 function onPrint(){if(print.disabled)return;stopSound();soundPrintStep=-1;serial++;feed=0;progress=0;drag=null;drop=spin=pullX=pullY=targetX=targetY=velocityX=velocityY=0;stub.style.display='none';empty.hidden=true;buildTexture();printStarted=performance.now();root.dataset.printPhase='feeding';setState('printing','打印中… 分段走纸，短暂停顿');unlock().then(ok=>{if(ok&&state==='printing')syncPrintSound(printSample(performance.now()-printStarted))});requestDraw()}
 function hit(x,y){return polygons.some(ps=>{let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside})}
 function release(){if(!drag)return;drag=null;targetX=targetY=0;setState('ready',readyMessage());save();requestDraw()}
 canvas.addEventListener('pointerdown',e=>{if(state!=='ready'||!e.isPrimary||e.button!==0)return;const b=canvas.getBoundingClientRect();if(!hit(e.clientX-b.x,e.clientY-b.y))return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,initial:progress,peak:0};canvas.setPointerCapture(e.pointerId);setState('dragging','正在沿边缘撕开… 轻拉只裂开一小段');unlock();requestDraw()});
 canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;targetX=clamp(dx,-150,150);targetY=clamp(dy,-25,180);drag.peak=Math.max(drag.peak,Math.max(0,dy)+Math.abs(dx)*.5);advanceTo(drag.initial+Math.max(0,drag.peak-6)/570)});
 canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId)release()});canvas.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)release()});canvas.addEventListener('lostpointercapture',release);
 print.addEventListener('click',onPrint);tear.addEventListener('click',()=>{if(state!=='ready')return;unlock().then(()=>crackle(.07));targetY=60;advanceTo(progress+.10);if(state==='ready'){setState('ready',readyMessage());save();setTimeout(()=>{targetY=0;requestDraw()},120)}});
 sound.addEventListener('click',()=>{enabled=!enabled;sound.textContent=enabled?'音效：开':'音效：关';sound.setAttribute('aria-pressed',String(enabled));if(enabled)unlock();else{stopSound();audio?.suspend().catch(()=>{})}save()});
 const observer=new ResizeObserver(resize);observer.observe(output);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{buildTexture();requestDraw()});
 setState('idle','准备就绪 · 点击打印长小票');buildTexture();resize();restore(readSavedState());
})();
