// Food Log "say what you ate": turns "100 ml avocado oil, two eggs and a tablespoon of peanut butter for lunch"
// into rows of {food, qty} from his own food list. Runs on the phone; nothing is sent anywhere.
(function(root){
'use strict';
const NUM={zero:0,a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
  sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,couple:2,few:3,dozen:12};
const FRAC={half:.5,quarter:.25,third:1/3};
// spoken amounts -> digits: "a hundred and twenty" -> 120, "one and a half" -> 1.5, "half a" -> 0.5
function numberWords(s){
  const w=s.split(/\s+/),out=[];
  for(let i=0;i<w.length;i++){
    let j=i,val=null,cur=0,any=false;
    const isN=x=>x in NUM||x==='hundred'||/^\d+(\.\d+)?$/.test(x);
    // "a" or "an" on its own only counts as 1 when a unit or food follows (always true here), but not inside "a hundred" handled below
    while(j<w.length){
      const x=w[j];
      if(/^\d+(\.\d+)?$/.test(x)){cur+=Number(x);any=true;j++;continue}
      if(x==='hundred'){cur=(cur||1)*100;any=true;j++;continue}
      if(x in NUM&&!(x==='a'||x==='an')||((x==='a'||x==='an')&&(w[j+1]==='hundred'||!any))){
        if((x==='a'||x==='an')&&any)break;
        if(x==='couple'||x==='few'||x==='dozen'){cur=(cur||1)*NUM[x];any=true;j++;if(w[j]==='of')j++;continue}
        cur+=NUM[x];any=true;j++;continue}
      if(x==='and'&&any&&j+1<w.length&&(w[j+1]==='a'||w[j+1]==='an'||isN(w[j+1]))&&!(w[j+1]==='a'&&!(w[j+2] in FRAC)&&w[j+2]!=='hundred')){
        // "a hundred and twenty", "one and a half"; but "two eggs and a coffee" stays split
        const nx=w[j+1]==='a'||w[j+1]==='an'?w[j+2]:w[j+1];
        if(nx in FRAC){cur+=FRAC[nx];j+=w[j+1]==='a'||w[j+1]==='an'?3:2;continue}
        if(nx in NUM&&nx!=='a'&&nx!=='an'&&NUM[nx]<100&&cur>=100&&cur%100===0){j++;continue}
        break}
      if(x in FRAC){cur=(any?cur:1)*FRAC[x];any=true;j++;if(w[j]==='a'||w[j]==='an'||w[j]==='of')j++;continue}
      break;
    }
    if(any){out.push(String(Math.round(cur*1000)/1000));i=j-1}else out.push(w[i]);
  }
  return out.join(' ');
}
const UNITS=[[/^(g|gs|gram|grams|gramme|grammes|gm|gms|grm)$/,'g'],[/^(ml|mls|mil|mils|mill|mills|millilitre|millilitres|milliliter|milliliters|mm)$/,'ml'],
  [/^(tbsp|tbsps|tbs|tablespoon|tablespoons|tablespoonful|tablespoonfuls)$/,'tbsp'],[/^(tsp|tsps|teaspoon|teaspoons|teaspoonful|teaspoonfuls)$/,'tsp'],
  [/^(kg|kilo|kilos|kilogram|kilograms)$/,'kg'],[/^(l|litre|litres|liter|liters)$/,'l']];
const unitOf=w=>{for(const [re,u] of UNITS)if(re.test(w))return u;return null};
const MEALW={breakfast:'breakfast',brekkie:'breakfast',lunch:'lunch',dinner:'dinner',tea:'dinner',supper:'dinner',snack:'snack',snacks:'snack'};
// words that say nothing about which food it is
const STOP=new Set(('i ive i\'ve had have just ate eaten some of the a an my with label per uk us generic raw cooked drained by la le de del and & original classic plain fresh add log put record please '+
  'bag bags pack packs packet packets slice slices piece pieces tin tins can cans stick sticks portion portions serving servings').split(' '));
// everyday words for things his food names call something else
const SYN=[['milk','drink','alpro','unsweetened','oatly','oat','soya'],['mayo','mayonnaise'],['prawn','shrimp'],['rind','rinds','snack','puff','scratching','crackling','crunchy'],
  ['cheese','cheddar','gouda','camembert','halloumi','feta','mozzarella','leicester','gloucester','applewood','leerdammer'],['ham','prosciutto','parma'],
  ['pb','peanut'],['mince','minced','ground'],['frank','frankfurter','hotdog','sausage'],['sausage','chipolata','banger'],['broth','stock'],
  ['soy','soja','sojasaus','soya'],['mct','c8'],['dressing','caesar'],['whey','protein'],['steak','ribeye','sirloin'],['crisps','crisp','chips'],['mac','macadamia']];
const stem=w=>w.length>4&&/ies$/.test(w)?w.slice(0,-3)+'y':w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w;
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9.%&\s]/g,' ').replace(/\s+/g,' ').trim();
const toks=s=>norm(s).split(' ').filter(w=>w&&!STOP.has(w)&&!/^\d/.test(w)&&!unitOf(w)).map(stem);
// a food's own words, without "(per 100ml, UK label)" style notes
const foodToks=name=>toks(name.replace(/\((?:[^)]*\b(?:label|per|kcal)\b[^)]*)\)/gi,' ').replace(/\b\d+\s*(g|ml)\b/gi,' '));
// letters apart, counting a swapped pair as one ("avacado"/"avocado" = 1, "macademia"/"macadamia" = 1)
function dist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  const d=[];for(let i=0;i<=a.length;i++){d[i]=[i];for(let j=1;j<=b.length;j++)d[i][j]=i?0:j}
  for(let i=1;i<=a.length;i++){let best=99;for(let j=1;j<=b.length;j++){
    const c=a[i-1]===b[j-1]?0:1;let v=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,d[i-2][j-2]+1);d[i][j]=v;if(v<best)best=v}
    if(best>max)return max+1}
  return d[a.length][b.length];
}
const MEMO=new Map();
// 1 = the same word (or near enough: "macadamia"/"macadamias"), .9 = a typo, .85 = an everyday synonym, 0 = no
function same(a,b){
  if(a===b)return 1;
  const k=a<b?a+'|'+b:b+'|'+a;if(MEMO.has(k))return MEMO.get(k);
  let r=0;const [s,l]=a.length<b.length?[a,b]:[b,a];
  if(s.length>=4&&l.startsWith(s)&&s.length>=l.length*.75)r=1;
  else if(s.length>=4&&l.length>=5&&dist(a,b,l.length>=8?2:1)<=(l.length>=8?2:1)&&a[0]===b[0])r=.9; // short words only allow one slip, and the first letter must match
  else for(const g of SYN)if(g.includes(a)&&g.includes(b)){r=.85;break}
  if(MEMO.size>20000)MEMO.clear();MEMO.set(k,r);return r;
}
function score(q,f){
  const ft=f._t||(f._t=foodToks(f.name));if(!q.length||!ft.length)return null;
  const per=q.map(w=>Math.max(...ft.map(x=>same(w,x)))),cov=per.reduce((a,b)=>a+b,0)/q.length;
  if(!cov)return null;
  const exact=q.filter(w=>ft.includes(w)).length; // real words beat synonyms
  const hitF=ft.filter(x=>q.some(w=>same(w,x)===1)).length/ft.length; // how much of the name he said
  return cov*10+exact*.3+hitF*1.2+Math.log10((f.uses||0)+1)*1.2;
}
// best food for a phrase; learned phrases (his corrections) win outright
function match(phrase,foods,alias){
  const key=toks(phrase).join(' ');
  const a=alias&&alias[key];
  const q=toks(phrase);
  const ranked=foods.map(f=>({f,s:score(q,f)})).filter(x=>x.s!=null).sort((a,b)=>b.s-a.s);
  if(a){const f=foods.find(x=>x.id===a);if(f)return{food:f,sure:true,alts:ranked.filter(x=>x.f!==f).slice(0,5).map(x=>x.f),key}}
  if(!ranked.length||ranked[0].s<7.5)return{food:null,sure:false,alts:ranked.slice(0,5).map(x=>x.f),key}; // under ~ "most of the words" = not found
  const top=ranked[0],next=ranked[1];
  const sure=top.s>=10&&(!next||top.s-next.s>=1);
  return{food:top.f,sure,alts:ranked.slice(1,6).map(x=>x.f),key};
}
// one chunk like "100 ml avocado oil" or "eggs x2" -> {phrase, num, unit, usual}
function chunk(c){
  let w=c.split(' ').filter(Boolean),num=null,unit=null,usual=false;
  w=w.filter(x=>{if(x==='usual'||x==='normal'){usual=true;return false}return true});
  const rest=[];
  for(let i=0;i<w.length;i++){
    const x=w[i],m=/^(\d+(?:\.\d+)?)([a-z]+)?$/.exec(x);
    if(m&&num==null){num=Number(m[1]);if(m[2]&&unitOf(m[2]))unit=unitOf(m[2]);else if(w[i+1]&&unitOf(w[i+1])){unit=unitOf(w[i+1]);i++}continue}
    if(num==null&&unit==null&&unitOf(x)&&rest.length===0&&!/^(l|mm|g)$/.test(x)){unit=unitOf(x);num=1;continue} // "tablespoon of mayo"
    if(/^x\d+$/.test(x)&&num==null){num=Number(x.slice(1));continue}
    rest.push(x);
  }
  if(unit==='kg'){unit='g';num*=1000}if(unit==='l'){unit='ml';num*=1000}
  while(rest.length&&/^(of|some|a|an|the|i|ive|had|have|just|ate|my|add|log|put|record|please)$/.test(rest[0]))rest.shift(); // "of peanut butter" -> "peanut butter"
  return{phrase:rest.join(' '),num,unit,usual};
}
// what he said -> {meal, rows:[{said, phrase, food, sure, alts, qty, qtyState: ok|guess|blank, note}]}
function parse(text,foods,alias,defaultMeal){
  let s=text.replace(/½/g,' 0.5 ').replace(/¼/g,' 0.25 ').replace(/¾/g,' 0.75 ').replace(/(\d+)\s*\/\s*(\d+)/g,(m,a,b)=>' '+String(Math.round(a/b*1000)/1000)+' ')
    .replace(/(\d)\s+0\.(\d)/g,'$1.$2') // "1 ½" -> 1.5
    .replace(/\n/g,' , ').replace(/[,;]/g,' , ').replace(/\.(?!\d)/g,' , ');
  s=norm(s.replace(/,/g,' qqcomma ')).replace(/qqcomma/g,',');
  let meal=null;
  // the meal: "for breakfast", but speech often hears "for" as "4" ("4 breakfast"), and people also say "to lunch",
  // "breakfast: 2 eggs" or just "dinner". A meal word on its own counts unless it's part of one of his food names
  // (e.g. "Pork Snacks"); "tea" and "snack" need a word like "for" in front, as they're also foods.
  const inNames=new Set();foods.forEach(f=>norm(f.name).split(' ').forEach(w=>inNames.add(w)));
  s=s.replace(/\b(?:(for|4|four|to|at|with|as|in|into|on|from)\s+)?(?:(?:my|a|the|this|todays|today s)\s+)?(breakfast|brekkie|lunch|dinner|tea|supper|snacks?)\b/g,(m,prep,x)=>{
    if(!prep&&(x==='tea'||/^snack/.test(x)||inNames.has(x)))return m;
    meal=MEALW[x];return ' , '});
  s=numberWords(s.replace(/\s+/g,' ').trim());
  for(const f of foods){const n=norm(f.name).split(' ');
    for(let i=1;i<n.length-1;i++)if(n[i]==='and'||n[i]==='&'){const a=n[i-1],b=n[i+1];
      s=s.replace(new RegExp('\\b'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' (?:and|&) '+b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'),a+' & '+b)}}
  // speech has no commas: "avocado oil 2 eggs" is two foods. A number after some food words starts a new food,
  // unless it's the amount for the food just said ("almond milk 250 ml", end of the phrase or before "and")
  {const w=s.split(' '),o=[],SEP=x=>x===','||x==='and'||x==='then'||x==='plus'||x==='also'||x==='with';
    // his style for this sentence: amount first ("100 ml avocado oil") or after ("avocado oil 100 ml")
    const first=w.find(x=>/^\d/.test(x)||toks(x).length),after=first&&!/^\d/.test(first);
    let words=0,amt=false;
    for(let i=0;i<w.length;i++){const x=w[i];
      if(SEP(x)){words=0;amt=false;o.push(x);continue}
      if(/^\d/.test(x)){
        if(after){if(words&&!amt){amt=true;o.push(x);if(w[i+1]&&unitOf(w[i+1]))o.push(w[++i]);o.push(',');words=0;amt=false;continue}}
        else if(words){o.push(',');words=0}
      }else if(toks(x).length)words++;
      o.push(x)}
    s=o.join(' ')}
  const parts=s.split(/\s*(?:,|;|\band then\b|\bthen\b|\bplus\b|\balso\b|\band\b|\bwith\b)\s*/).map(x=>x.trim()).filter(x=>x&&toks(x).length||/\d/.test(x)&&x.split(' ').length>1);
  const rows=[];
  for(const p of parts){
    const c=chunk(p);if(!c.phrase||!toks(c.phrase).length)continue;
    const m=match(c.phrase,foods,alias);
    const row={said:p,phrase:c.phrase,key:m.key,food:m.food,sure:m.sure,alts:m.alts,num:c.num,unit:c.unit,usual:c.usual};
    amount(row);rows.push(row);
  }
  return{meal:meal||defaultMeal||'snack',mealSaid:!!meal,rows};
}
// turn what he said into the food's own unit (g, ml or servings); spoons of gram foods are a guess
function amount(r){
  const f=r.food;r.qty=null;r.qtyState='blank';r.note='';
  if(!f)return r;
  if(r.usual&&r.num==null){r.qty=f.defQty||null;r.qtyState=r.qty?'ok':'blank';return r}
  if(r.num==null){r.note='How much?';return r}
  const n=r.num,u=r.unit,fu=f.unit;
  if(fu==='serving'){
    if(!u){r.qty=n;r.qtyState='ok'}
    else{r.note='Logged per '+f.label+': how many?'}
  }else if(!u){
    if(n>=5){r.qty=n;r.qtyState='guess';r.note='Taken as '+fu}else r.note='How many '+fu+'?';
  }else if(u==='tbsp'||u==='tsp'){
    const v=n*(u==='tbsp'?15:5);r.qty=v;r.qtyState=fu==='ml'?'ok':'guess';if(fu!=='ml')r.note='A spoon guessed as '+v+' g';
  }else if(u===fu){r.qty=n;r.qtyState='ok'}
  else{r.qty=n;r.qtyState='guess';r.note='Said '+u+', logged as '+fu}
  return r;
}
// foods for a search box, best first: everything that matches well enough, typos and everyday names included
function search(text,foods){const q=toks(text);if(!q.length)return[];
  return foods.map(f=>({f,s:score(q,f)})).filter(x=>x.s!=null&&x.s>=7).sort((a,b)=>b.s-a.s).map(x=>x.f)}
const api={parse,match,amount,numberWords,toks,foodToks,search};
if(typeof module!=='undefined')module.exports=api;else root.FLSay=api;
})(this);
