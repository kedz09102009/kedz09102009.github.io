// Service worker: cache-first for fast/offline loading. All core assets are cached as one release.
const C='nhatky-v18-global-race-v13';
const CORE=['index.html','style.css','app.js','config.js','cloud.js','manifest.webmanifest'];
const OPTIONAL=['./','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil((async()=>{
  const c=await caches.open(C);
  // Core files must be fetched successfully; do not activate a mixed/partial release.
  await Promise.all(CORE.map(u=>c.add(new Request(u,{cache:'reload'}))));
  await Promise.all(OPTIONAL.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>null)));
  await self.skipWaiting();
})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  const ks=await caches.keys();
  await Promise.all(ks.filter(k=>k.startsWith('nhatky-')&&k!==C).map(k=>caches.delete(k)));
  await self.clients.claim();
})())});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/')||u.searchParams.has('chk'))return;
  e.respondWith((async()=>{
    const c=await caches.open(C);
    const hit=await c.match(e.request,{ignoreSearch:true});
    const net=fetch(new Request(e.request,{cache:'no-cache'})).then(r=>{if(r.ok)c.put(e.request,r.clone()).catch(()=>{});return r});
    if(hit){net.catch(()=>{});return hit}
    try{return await net}catch(e){return new Response('Bạn đang ngoại tuyến và tệp này chưa có trong bộ nhớ đệm.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
  })());
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():self.clients.openWindow('./')))});
