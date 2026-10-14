/** Original canvas celebration: ribbons and a golden star flying into the book. */
export function createCelebration(canvas,{target=()=>({x:.25,y:.06})}={}){
  const ctx=canvas?.getContext?.('2d');
  if(!ctx)return {burst(){},setPaused(){},clear(){},dispose(){}};
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width=1,height=1,raf=0,last=0,paused=false,bursts=[];
  const colors=['#ffd16c','#fff2b3','#79dbbe','#eeae78','#9ed7ea'];
  function resize(){width=canvas.clientWidth||innerWidth;height=canvas.clientHeight||innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  function star(x,y,r,rotation=0,turn=0){ctx.beginPath();for(let i=0;i<10;i++){const angle=rotation-Math.PI/2+i*Math.PI/5,rr=i%2?r*.46:r;const px=x+Math.cos(angle)*rr*(turn?Math.max(.15,Math.abs(Math.cos(turn))):1),py=y+Math.sin(angle)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
  function draw(time){raf=0;if(paused||document.hidden){last=0;return;}const dt=last?Math.min((time-last)/1000,.05):0;last=time;ctx.clearRect(0,0,width,height);
    for(const b of bursts){b.age+=dt;const life=reduced?1.3:b.finale?4.3:3.4,fade=Math.min(1,b.age/.18,Math.max(0,life-b.age));const cx=b.x*width,cy=b.y*height;
      if(!reduced){
        const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.85);glow.addColorStop(0,'#ffd57818');glow.addColorStop(.7,'#ffcb6700');glow.addColorStop(1,'#ffbd4528');ctx.globalAlpha=fade;ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
        for(const p of b.particles){const t=b.age-p.delay;if(t<0)continue;const x=p.x*width+p.vx*t,y=p.y*height+p.vy*t+46*t*t;ctx.save();ctx.globalAlpha=fade*Math.max(0,1-t/life);ctx.translate(x,y);ctx.rotate(p.spin*t+p.angle);ctx.fillStyle=p.color;
          if(p.star){star(0,0,p.size);ctx.fill();}else{ctx.beginPath();ctx.ellipse(0,0,p.size,p.size*.35,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
      }
      const u=reduced?0:Math.max(0,Math.min(1,(b.age-1.6)/.8)),ease=u*u*(3-2*u),end=target();
      const x=cx+(end.x*width-cx)*ease,y=cy+(end.y*height-cy)*ease-Math.sin(u*Math.PI)*height*.16;
      const pulse=reduced?1:1+Math.sin(Math.min(b.age/.35,1)*Math.PI)*.24,r=(Math.min(width,height)*(b.finale?.20:.17)*(1-ease)+12*ease)*pulse;
      const spin=reduced?0:Math.min(b.age/1.35,1)*Math.PI*2,turn=reduced?0:Math.sin(Math.min(b.age/1.45,1)*Math.PI)*Math.PI*2;
      ctx.save();ctx.globalAlpha=fade*(b.age>2.45?Math.max(0,1-(b.age-2.45)/.5):1);ctx.translate(x,y);ctx.rotate(spin);
      ctx.shadowColor='#ffc64b';ctx.shadowBlur=reduced?0:32;
      if(!reduced){star(5*(1-ease),7*(1-ease),r,0,turn);ctx.fillStyle='#d68c28';ctx.fill();}
      star(0,0,r,0,turn);ctx.fillStyle='#ffd36e';ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=3;ctx.strokeStyle='#fff5cb';ctx.stroke();star(-r*.09,-r*.12,r*.56,0,turn);ctx.fillStyle='#fff9cd80';ctx.fill();ctx.restore();
    }
    ctx.globalAlpha=1;bursts=bursts.filter(b=>b.age<(reduced?1.3:b.finale?4.3:3.4));if(bursts.length)raf=requestAnimationFrame(draw);else last=0;
  }
  function burst({x=.5,y=.32,finale=false}={}){
    resize();const count=reduced?0:Math.min(width<700?85:135,finale?135:100),particles=[];
    for(let i=0;i<count;i++){const side=i%2?-1:1;particles.push({x:i%3===0?(side<0?0:1):x,y:i%3===0?.78:y,vx:(i%3===0?-side:Math.cos(i*2.399))*80*(.7+Math.random()),vy:-80-Math.random()*155,angle:Math.random()*6.28,spin:(Math.random()-.5)*7,size:3+Math.random()*5,color:colors[i%colors.length],delay:Math.random()*.24,star:i%4===0});}
    bursts.push({x,y,finale,particles,age:0});if(bursts.length>3)bursts.shift();if(!raf&&!paused&&!document.hidden)raf=requestAnimationFrame(draw);
  }
  function setPaused(value){paused=!!value;last=0;if(paused){cancelAnimationFrame(raf);raf=0;}else if(bursts.length&&!raf&&!document.hidden)raf=requestAnimationFrame(draw);}
  function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else setPaused(paused);}
  function clear(){cancelAnimationFrame(raf);raf=0;last=0;bursts=[];ctx.clearRect(0,0,width,height);}
  window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);resize();
  return {burst,setPaused,clear,dispose(){clear();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);}};
}
