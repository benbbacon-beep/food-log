// Food Log label reader: runs Tesseract (free, on the phone) on a cropped photo of a nutrition table,
// then turns the text into a food. Loaded only when he taps "Scan label".
// Tesseract.js 5.1.1 and its English data (Apache 2.0) are bundled in this folder.
// shared: grey + stretch contrast + invert when the label is light-on-dark. rgba in, rgba out (same size)
function prep(px,w,h){
  const n=w*h,g=new Float32Array(n);
  for(let i=0;i<n;i++)g[i]=.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2];
  const hist=new Uint32Array(256);for(let i=0;i<n;i++)hist[g[i]|0]++;
  const pct=p=>{let c=0;for(let v=0;v<256;v++){c+=hist[v];if(c>=n*p)return v}return 255};
  const lo=pct(.02),hi=pct(.98),med=pct(.5);
  const inv=med<(lo+hi)/2; // most of the table is background: if the middle value is dark, the text is light
  const out=new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++){let v=(g[i]-lo)/Math.max(1,hi-lo)*255;if(inv)v=255-v;v=v<0?0:v>255?255:v;out[i*4]=out[i*4+1]=out[i*4+2]=v;out[i*4+3]=255}
  return {px:out,inv};
}
// adaptive threshold (Bradley): each pixel vs the mean of its neighbourhood, so glare and shadows don't wipe out text
function binar(px,w,h,winFrac,t){
  const n=w*h,g=new Float32Array(n);for(let i=0;i<n;i++)g[i]=px[i*4];
  const I=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let s=0;for(let x=0;x<w;x++){s+=g[y*w+x];I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s}}
  const r=Math.max(8,Math.round(w*(winFrac||1/16))),out=new Uint8ClampedArray(n*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
    const s=I[y1*(w+1)+x1]-I[y0*(w+1)+x1]-I[y1*(w+1)+x0]+I[y0*(w+1)+x0],m=s/((x1-x0)*(y1-y0)),i=y*w+x;
    const v=g[i]<m*(1-(t||.15))?0:255;out[i*4]=out[i*4+1]=out[i*4+2]=v;out[i*4+3]=255}
  return out;
}
// Turns OCR text from a nutrition label into calories, fat, protein and net carbs.
// Takes several OCR readings of the same label (different image clean-ups) and picks the
// combination of numbers that best fits: calories ≈ 9 fat + 4 protein + 4 carbs (+2 fibre),
// the per-serving column agrees with the per-100 g column, and per 100 g can't add up past 100 g.
(function(root){
'use strict';
const KEYS=['kcal','fat','carbs','fibre','protein','sa','ery','allu'];
// which nutrient a line is about, from its letters only (OCR mangles spacing and punctuation)
function lineKind(L){
  const t=L.toLowerCase().replace(/[^a-zäöüéè]/g,'');
  if(/sugaralc|polyol|polyole|alcoholdesucre/.test(t))return 'sa';
  if(/^erythritol|^erythritol/.test(t))return 'ery';
  if(/^allulose|^allulose/.test(t))return 'allu';
  if(/satur|trans|monoun|polyun|insatur|ungesat|onverzad|vetzur|fettsaur/.test(t))return null;
  if(/whichsug|sugars|sucre|suiker|zucker|addedsug|includes/.test(t))return null;
  if(/fib(re|er|oer)|ballast|vezel|fioer|fibres/.test(t))return 'fibre';
  if(/carb|glucid|koolhyd|kohlenh|hydrat/.test(t))return 'carbs';
  if(/prot|rotein|eiwei|eiwit/.test(t))return 'protein';
  if(/^total?fa|^fat|fett|grasse|vetten|^tofalfa|^tolfat|^totalfat/.test(t))return 'fat';
  if(/calor|calcr|caler|energ|kcal|^cal(?!c)/.test(t))return 'kcal';
  if(/sodium|salt|sel|zout|salz|cholest|vitamin|calcium|iron|potass|servings?per|daily/.test(t))return 'skip';
  return null;
}
// a number as OCR read it, plus what it might really be: "0.59" is often "0.5g", "255g" is often "25.5g"
function cands(raw,unit){
  const s=raw.replace(',','.'),out=[];
  const add=(v,pen)=>{if(isFinite(v)&&!out.some(c=>c.v===v))out.push({v,pen})};
  const u=(unit||'').toLowerCase();
  if(u==='9'||u==='¢'){add(Number(s),1.5);}
  // labels print grams with at most one decimal, so "25.58" or "0.59" is really 25.5g / 0.5g with the g misread
  const twoDec=/\.\d\d$/.test(s)&&u!=='kcal'&&u!=='kj';
  if(twoDec&&/[89]$/.test(s))add(Number(s.slice(0,-1)),.3);
  add(Number(s),/^0\d/.test(s)?.8:twoDec?.9:0); // "06" isn't how a label prints 6
  if(!u&&s==='9')out[0].pen=.8; // a lone 9 is usually a g whose number got lost
  if(!u&&/\d9$/.test(s)&&s.length>1)add(Number(s.slice(0,-1)),.8); // a trailing g read as 9
  if(!s.includes('.')&&s.length>=2)add(Number(s.slice(0,-1)+'.'+s.slice(-1)),1); // the decimal point got lost
  if(/^0\d/.test(s)&&!s.includes('.'))add(Number('0.'+s.slice(1)),.6);
  if(s.length>=3&&!s.includes('.'))add(Number(s.slice(1)),2.5); // a stray first character (e.g. "93" from "593")
  return out;
}
// the numbers on a line, after fixing common OCR letter/digit mix-ups
function nums(L){
  let s=' '+L.replace(/[¢]/g,'g').replace(/(\d)\s*[,.]\s*(\d)/g,'$1.$2')+' ';
  s=s.replace(/(^|[\s(\/<|])[Oo](?=\s?(?:m?g|9|%|\.\d|\d))/g,'$10'); // "Og" "Omg" "O.5g" -> 0
  s=s.replace(/(\d)[Oo](?=\d|g|\b)/g,'$10').replace(/(\d)[lI|](?=\d)/g,'$11');
  const out=[],re=/(<\s*)?(\d+(?:\.\d+)?)\s*(kcal|kcai|keal|kea|kel|kal|kj|kd|k\)|k\b|mg|mcg|g|9|¢|%|°|ml)?/gi;
  let m;while((m=re.exec(s))){
    const u=(m[3]||'').toLowerCase(),unit=/^k(cal|cai|eal|ea|el|al)$/.test(u)?'kcal':/^k/.test(u)?'kj':u;
    if(unit==='%'||unit==='°'||unit==='mg'||unit==='mcg')continue;
    out.push({lt:!!m[1],raw:m[2],unit});
  }
  return out;
}
function parseOne(text){
  const lines=text.split(/\n/).map(l=>l.trim()).filter(Boolean),low=text.toLowerCase();
  const R={vals:{},col2:{},kcalUnit:[],kj:[],servG:[],servText:'',per100:null,us:0,eu:0};
  KEYS.forEach(k=>{R.vals[k]=[];R.col2[k]=[]});
  if(/nutrition\s*fact|total\s*carbo|dietary\s*fib|daily\s*val|amount\s*per|servings?\s*per\s*cont/.test(low))R.us+=2;
  if(/\bcalories\b|\bcalcries\b/.test(low)&&!/kcal/.test(low))R.us++;
  if(/typical|nutritional\s*info|per\s*1[0o]{2}|of\s*which|kj|\bfibre\b|\bsalt\b/.test(low))R.eu++;
  if(/per\s*1[0o]{2}\s*m[l1]|1[0o]{2}\s*m[l1]\b/.test(low))R.per100='ml';else if(/per\s*1[0o]{2}/.test(low))R.per100='g';
  // serving size in grams
  let m=/(?:serv|erv)\w*\W*s\w*[^\n(]*\(\s*(\d+(?:[.,]\d+)?)\s*(g|9|y|ml)?\s*\)?/i.exec(text);
  if(m){let v=m[1].replace(',','.');if(!m[2]&&/\d9$/.test(v))v=v.slice(0,-1);R.servG.push({v:Number(v),pen:m[2]?0:.5,ml:m[2]==='ml'})}
  const st=/serv\w*\s*size\s*([^\n(]*)/i.exec(text);if(st)R.servText=st[1].replace(/[^\w\/.\s]/g,'').trim().slice(0,30)
  for(const re of [/per\s*(\d{1,4})\s*([g9c(6o0]|ml)?\s*serv/ig,/(\d{2,4})\s*([gq9]|ml)\s*serv/ig,/\/\s*per\s*(\d{1,3})\s*(g|ml)?/ig]){
    let x;while((x=re.exec(text))){const v=x[1];
      if(x[2]&&/^(g|ml|q)$/i.test(x[2]))R.servG.push({v:Number(v),pen:.2});
      else{R.servG.push({v:Number(v),pen:.6});if(v.length>=3&&/[0689]$/.test(v))R.servG.push({v:Number(v.slice(0,-1)),pen:.4})}}}
  let lastKind=null;
  for(const L of lines){
    const kind=lineKind(L),ns=nums(L);
    // calories: a number marked kcal anywhere, or the numbers on an energy/calories line
    ns.forEach(n=>{if(n.unit==='kcal')R.kcalUnit.push(n);if(n.unit==='kj')R.kj.push(n)});
    const labelKcal=/\(\s*kcal\s*\)|kcal\)/i.test(L),labelKj=/\(\s*k[j)]\s*\)?/i.test(L)&&!labelKcal;
    if(kind==='kcal'||(!kind&&lastKind==='kcal')){
      if(labelKj){ns.forEach(n=>R.kj.push(n))}
      else{const plain=ns.filter(n=>!n.unit||n.unit==='kcal');
        const pick=ns.some(n=>n.unit==='kcal')?ns.filter(n=>n.unit==='kcal'):ns.some(n=>n.unit==='kj')?[]:plain;
        if(pick[0])R.vals.kcal.push(pick[0]);if(pick[1])R.col2.kcal.push(pick[1]);}
    }
    if(kind&&kind!=='kcal'&&kind!=='skip'){
      const g=ns.filter(n=>n.unit!=='kj'&&n.unit!=='kcal');
      if(g[0])R.vals[kind].push(g[0]);if(g[1])R.col2[kind].push(g[1]);
    }
    if(kind)lastKind=kind;else if(!ns.length)lastKind=null;
  }
  return R;
}
const INGR_OTHER=/maltitol|sorbitol|xylitol|isomalt|lactitol|mannitol|polydextrose|hydrogenated\s*starch/i;
function parseLabel(texts){
  if(typeof texts==='string')texts=[texts];
  const P=texts.map(parseOne),all=texts.join('\n');
  const us=P.reduce((a,p)=>a+p.us,0),eu=P.reduce((a,p)=>a+p.eu,0),region=us>eu?'us':'eu';
  const per100=(P.find(p=>p.per100)||{}).per100||null;
  // gather candidates for each field from every reading; agreeing readings make a value more likely
  const pool=(get)=>{const m=new Map();P.forEach(p=>get(p).forEach(n=>{
      if(n.lt){const k='0';const c=m.get(k)||{v:0,pen:0,lt:true,seen:0};c.seen++;m.set(k,c);return}
      cands(n.raw,n.unit).forEach(c=>{const k=String(c.v),o=m.get(k);const s1=c.pen<=1?1:0;if(o){o.pen=Math.min(o.pen,c.pen);o.seen+=s1}else m.set(k,{v:c.v,pen:c.pen,seen:s1})})}));
    const arr=[...m.values()];arr.forEach(c=>{c.pen-=Math.min(.6,Math.max(0,c.seen-1)*.3)});return arr.sort((a,b)=>a.pen-b.pen).slice(0,6)};
  const C={},C2={};
  ['fat','carbs','fibre','protein','sa','ery','allu'].forEach(k=>{C[k]=pool(p=>p.vals[k]);C2[k]=pool(p=>p.col2[k])});
  C.kcal=pool(p=>p.kcalUnit.length?[p.kcalUnit[0]]:p.vals.kcal);
  C2.kcal=pool(p=>p.kcalUnit.length>1?[p.kcalUnit[1]]:p.col2.kcal);
  let kjOnly=false;
  if(!C.kcal.length){const kj=pool(p=>p.kj.slice(0,1));if(kj.length){C.kcal=kj.map(c=>({v:Math.round(c.v/4.184),pen:c.pen+.5}));kjOnly=true}}
  const servs=[];P.forEach(p=>p.servG.forEach(s=>{if(s.v>0&&s.v<=1000&&!servs.some(x=>x.v===s.v))servs.push(s)}));
  // try every combination and keep the most believable one
  const opt=k=>C[k].length?C[k]:[{v:null,pen:0}];
  const per=region==='eu'||per100;const two=per&&['fat','carbs','protein','kcal'].some(k=>C2[k].length);
  let best=null;
  const sv=servs.length?servs:[{v:null,pen:0}];
  for(const kc of opt('kcal'))for(const f of opt('fat'))for(const c of opt('carbs'))for(const fb of opt('fibre'))for(const p of opt('protein'))for(const s of sv){
    let pen=kc.pen+f.pen+c.pen+fb.pen+p.pen+s.pen;
    const F=f.v,Cb=c.v,Fb=fb.v||0,Pr=p.v;
    if(per){const sum=(F||0)+(Cb||0)+(Pr||0)+(region==='us'?0:Fb);if(sum>101)pen+=20;[F,Cb,Pr].forEach(x=>{if(x>100)pen+=20})}
    if(region==='us'&&Fb>(Cb||0)&&Cb!=null)pen+=5;
    let fits=false;
    if(kc.v!=null&&F!=null&&Cb!=null&&Pr!=null){
      const net=region==='us'?Math.max(0,Cb-Fb):Cb,est=9*F+4*Pr+4*net+2*Fb,d=Math.abs(est-kc.v),tol=Math.max(8,kc.v*.1);
      fits=d<=tol;pen+=fits?0:Math.min(6,(d-tol)/Math.max(10,kc.v*.1));
    }
    const agree={};
    if(two&&s.v){const r=s.v/100;
      for(const [k,x] of [['fat',F],['carbs',Cb],['protein',Pr],['kcal',kc.v]]){if(x==null||!C2[k].length)continue;
        const want=x*r,okc=C2[k].some(c=>Math.abs(c.v-want)<=Math.max(.15,want*.08));pen+=okc?-.4:.3;if(okc)agree[k]=1}}
    if(!best||pen<best.pen)best={pen,kc,f,c,fb,p,s,fits,agree};
  }
  const pickOne=k=>{const a=C[k];return a.length?a[0]:null};
  const sa=pickOne('sa'),ery=pickOne('ery'),allu=pickOne('allu');
  const servOk=best.s.v!=null&&Object.keys(best.agree).length>=2||best.s.v!=null&&best.s.pen<=.2&&servs.filter(x=>x.v===best.s.v).length>=1&&!servs.some(x=>x.pen<=.2&&x.v!==best.s.v);
  const out={servFlag:best.s.v==null?'missing':servOk?'ok':'unsure',region,basis:per?(per100||'g'):'serving',servG:best.s.v,servText:(P.find(p=>p.servText)||{}).servText||'',raw:{},flags:{},kjOnly};
  // sure = the calorie check passed with little guessing, or (no check possible) both readings agreed on it as printed
  const put=(k,c)=>{out.raw[k]=c&&c.v!=null?c.v:null;out.flags[k]=!c||c.v==null?'missing':(best.fits?c.pen<=(best.agree[k]?1:.45):(c.seen>=2&&c.pen<=0))?'ok':'unsure'};
  put('kcal',best.kc);put('fat',best.f);put('carbs',best.c);put('fibre',best.fb.v==null?null:best.fb);put('protein',best.p);
  if(kjOnly&&out.flags.kcal==='ok')out.flags.kcal='unsure';
  if(out.raw.fibre==null){out.flags.fibre=region==='us'?'missing':'ok'}
  out.raw.sa=sa?sa.v:0;out.raw.ery=ery?ery.v:0;out.raw.allu=allu?allu.v:0;
  out.ingredientsEryOnly=/erythritol/i.test(all)&&!INGR_OTHER.test(all);
  return Object.assign(out,compute(out,region));
}
// net carbs and the per-100 g / per-serving numbers, from the raw label values; called again if he flips US/UK
function compute(o,region){
  const r=o.raw,F=x=>Math.round(x*10)/10,parts=[];
  let net=null;
  if(r.carbs!=null){
    net=r.carbs;
    const fib=region==='us'?(r.fibre||0):0;
    if(fib){net-=fib;parts.push(F(fib)+' fibre')}
    const sa=r.sa||0,ery=Math.min(sa||Infinity,r.ery||0),allu=r.allu||0;
    if(allu){net-=allu;parts.push(F(allu)+' allulose')}
    if(sa){
      const full=o.ingredientsEryOnly?sa:ery,half=(sa-full)/2;
      if(full){net-=full;parts.push(F(full)+' erythritol')}
      if(half){net-=half;parts.push(F(half)+' (half of '+F(sa-full)+' sugar alcohols)')}
    }
    net=Math.max(0,net);
  }
  const maths=r.carbs==null||!parts.length?'':(o.basis==='serving'?'Per serving: net ':'Net ')+F(net)+' g = '+F(r.carbs)+' carbs − '+parts.join(' − ');
  // per 100 g when the grams are known, else per 1 serving
  let unit=o.basis,k=1,label='';
  if(o.basis==='serving'){if(o.servG){unit='g';k=100/o.servG}else{unit='serving';label=o.servText||'serving'}}
  const sc=x=>x==null?null:Math.round(x*k*10)/10;
  return {region,unit,label,vals:{kcal:o.raw.kcal==null?null:Math.round(o.raw.kcal*k),fat:sc(r.fat),protein:sc(r.protein),net:sc(net)},defQty:o.servG||null,maths};
}
const api={parseLabel,compute,parseOne,cands,nums};
if(typeof module!=='undefined')module.exports=api;else root.FLLabel=api;
})(this);
// read: canvas of the cropped table -> parsed result. Two passes (grey, then black-and-white)
// because each one catches numbers the other misses; the parser picks what fits best.
(function(root){
let worker=null;
async function getWorker(progress){
  if(worker)return worker;
  const base=new URL('ocr/',location.href).href;
  worker=await Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:true,workerBlobURL:false,
    logger:m=>{if(progress&&m.status&&/loading|initializ/.test(m.status))progress('Getting the reader ready…')}});
  await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300',tessedit_pageseg_mode:'6'});
  return worker;
}
async function read(cv,progress){
  const w=await getWorker(progress),ctx=cv.getContext('2d',{willReadFrequently:true});
  const W=cv.width,H=cv.height,img=ctx.getImageData(0,0,W,H);
  const grey=prep(img.data,W,H).px,texts=[];
  const pass=async(px,label)=>{progress&&progress(label);ctx.putImageData(new ImageData(px,W,H),0,0);texts.push((await w.recognize(cv)).data.text)};
  await pass(grey,'Reading the label…');
  await pass(binar(grey,W,H,1/16,.15),'Double-checking…');
  const r=FLLabel.parseLabel(texts);r.texts=texts;return r;
}
root.FLLabel.read=read;root.FLLabel.prep=prep;root.FLLabel.binar=binar;
})(this);
