// Bump CACHE with every release: that is what makes phones pick up the new version.
const CACHE='food-log-v28';
// the label reader (~7 MB) lives in its own cache so app updates don't download it again
const OCR='food-log-ocr-1';
const SHELL=['./','index.html','manifest.webmanifest','icon-ring-192.png','icon-ring-512.png','jakarta.woff2','ocr/label.js','say.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
// only clear this app's own old caches: Tap Logger lives on the same web address and has its own
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('food-log-')&&k!==CACHE&&k!==OCR).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // the sheet API goes straight to the network
  // app files come from the phone first, so it opens instantly and works with no signal;
  // anything missing is fetched and kept, so the cache repairs itself if it is ever cleared
  const key=e.request.mode==='navigate'?'index.html':e.request;
  // label reader files: kept on the phone after the first scan (label.js changes with the app, so it's part of the app files)
  if(/\/ocr\/(?!label\.js)/.test(u.pathname))return e.respondWith(caches.open(OCR).then(c=>c.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n}))));
  e.respondWith(caches.open(CACHE).then(c=>c.match(key,{ignoreSearch:true}).then(r=>r||fetch(key==='index.html'?'index.html':e.request).then(n=>{if(n.ok)c.put(key,n.clone());return n}))));
});
