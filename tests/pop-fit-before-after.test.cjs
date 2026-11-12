const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const {frames,contain,hit}=require('../js/pop-fit-before-after.js');
test('all five mosaics preserve 9:16 and fit within the story',()=>{
  for(let model=0;model<5;model++)for(let arrangement=0;arrangement<6;arrangement++){
    const boxes=frames(model,arrangement);
    assert.equal(boxes.length,[2,3,3,3,4][model]);
    boxes.forEach(r=>{assert.ok(Math.abs(r.w/r.h-9/16)<1e-9);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=1080&&r.y+r.h<=1840)});
  }
});
test('contain preserves portrait, landscape and square images without cropping',()=>{
  for(const image of [{width:900,height:1600},{width:1600,height:900},{width:800,height:800}])for(const frame of frames(4)){
    const r=contain(image,frame);
    assert.ok(Math.abs(r.w/r.h-image.width/image.height)<1e-9);
    assert.ok(r.x>=frame.x&&r.y>=frame.y&&r.x+r.w<=frame.x+frame.w+1e-8&&r.y+r.h<=frame.y+frame.h+1e-8);
  }
});
test('shuffle has six distinct arrangements; regular layouts are stable',()=>{
  assert.equal(new Set(Array.from({length:6},(_,i)=>JSON.stringify(frames(3,i)))).size,6);
  assert.deepEqual(frames(0,0),frames(0,5));assert.deepEqual(frames(3,0),frames(3,6));
});
test('rotated and scaled blocks use transformed hit testing',()=>{
  const b={x:500,y:700,angle:Math.PI/2,scale:1,date:''};
  assert.ok(hit(b,500,850));assert.ok(!hit(b,650,700));
  b.scale=2;assert.ok(hit(b,650,700));
});
test('inline scripts and isolated module parse; existing export and overlay hooks remain',()=>{
  const html=fs.readFileSync(path.join(root,'pop-fit-stories.html'),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  new vm.Script(fs.readFileSync(path.join(root,'js/pop-fit-before-after.js'),'utf8'));
  assert.match(html,/value="beforeAfter"/);
  assert.match(html,/src="\/js\/pop-fit-before-after.js"/);
  assert.match(html,/async function pngBlob\(\)/);
  assert.match(html,/if\(layout==='free'\)\{drawFree\(\);return\}/);
});
test('editor actions, dragging, overlay rendering and category isolation',()=>{
  const elements=new Map();
  class Element {
    constructor(){this.children=[];this.listeners={};this.style={};this.hidden=false;this.value='';this.dataset={};}
    set id(v){this._id=v;elements.set(v,this)} get id(){return this._id}
    set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))get(m[1]);}
    append(...v){this.children.push(...v)} after(v){this.afterElement=v} closest(){return this} setAttribute(){} focus(){} showModal(){this.open=true} close(){this.open=false} reportValidity(){return true}
    addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
    querySelectorAll(q){const key=q.includes('data-add')?'add':'action';return [...this.html.matchAll(new RegExp('data-'+key+'="([^"]+)"','g'))].map(m=>{const e=new Element();e.dataset[key]=m[1];elements.set(key+':'+m[1],e);return e})}
    getBoundingClientRect(){return {left:0,top:0,width:1080,height:1920}}setPointerCapture(){}
  }
  function get(id){if(!elements.has(id)){const e=new Element();e.id=id;}return elements.get(id)}
  const calls=[],canvas=get('story');get('popTextModal').hidden=true;get('showBrand').checked=true;
  const context={document:{createElement:()=>new Element(),getElementById:get,body:Object.assign(new Element(),{classList:{toggle(){}}}),head:new Element()},window:{popTextPaint:()=>calls.push('text'),popStickerPaint:()=>calls.push('sticker')},canvas,W:1080,H:1920,layout:'beforeAfter',modelIndex:0,catalog:{beforeAfter:[['2']]},photos:[{width:900,height:1600}],photoRects:[{}],fill(){},gradient:(...a)=>{calls.push(['gradient',...a])},txt:(...a)=>calls.push(a),ctx:new Proxy({},{get:(_,name)=>(...args)=>{if(name==='drawImage')calls.push(args)}}),draw:()=>{context.window.popBeforeAfter.sync();context.window.popBeforeAfter.paint()}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/pop-fit-before-after.js'),'utf8'),context);
  context.draw();assert.equal(get('beforeAfterTools').hidden,false);assert.equal(context.photoRects.length,0);assert.ok(calls.includes('text')&&calls.includes('sticker'));
  const rail=get('beforeAfterColorRail');assert.equal(rail.children.length,6);assert.equal(rail.hidden,false);
  rail.children[2].onclick();assert.ok(calls.some(a=>Array.isArray(a)&&a[0]==='gradient'&&a[1]==='#071a45'));
  context.modelIndex=0;context.draw();assert.equal(calls.filter(a=>Array.isArray(a)&&a[0]==='gradient').at(-1)[1],'#071a45');
  assert.equal(canvas.afterElement,get('beforeAfterTools'));
  assert.ok(!get('beforeAfterTools').html.includes('data-add'));
  get('baAdd').onclick();assert.ok(get('beforeAfterModal').open);assert.ok(get('beforeAfterControls').hidden);
  get('baStage').value='Durante';get('baWeight').value='82.5';get('baSave').onclick();
  assert.ok(!get('beforeAfterModal').open);assert.equal(get('beforeAfterControls').hidden,false);
  assert.ok(calls.some(a=>Array.isArray(a)&&a[0]==='82,5 kg'));
  for(const action of ['smaller','bigger','rotate','horizontal','vertical','duplicate'])elements.get('action:'+action).onclick();
  elements.get('action:edit').onclick();assert.equal(get('baStage').value,'Durante');
  get('baStage').value='Descartar alteração';get('baCancel').onclick();
  elements.get('action:edit').onclick();assert.equal(get('baStage').value,'Durante');get('baCancel').onclick();
  elements.get('action:delete').onclick();assert.equal(get('beforeAfterControls').hidden,true);
  const e={clientX:280,clientY:1325,pointerId:1,preventDefault(){},stopImmediatePropagation(){}};
  canvas.listeners.pointerdown[0](e);assert.equal(get('beforeAfterControls').hidden,false);assert.ok(!get('beforeAfterModal').open);
  canvas.listeners.pointermove[0]({...e,clientX:100,clientY:600});canvas.listeners.pointerup[0](e);
  canvas.listeners.pointerdown[0]({...e,clientX:100,clientY:600});
  elements.get('action:edit').onclick();assert.equal(get('baStage').value,'Antes');get('baCancel').onclick();
  get('baAdd').onclick();get('beforeAfterModal').listeners.cancel[0]({preventDefault(){}});assert.ok(!get('beforeAfterModal').open);
  context.layout='magazine';context.window.popBeforeAfter.sync();assert.ok(get('beforeAfterTools').hidden&&get('beforeAfterControls').hidden);assert.ok(rail.hidden);
  context.layout='beforeAfter';context.draw();assert.equal(rail.hidden,false);assert.equal(calls.filter(a=>Array.isArray(a)&&a[0]==='gradient').at(-1)[1],'#071a45');
});
