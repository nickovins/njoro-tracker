/* Keeps the app itself on the phone so it opens with no signal.
   The reports are saved separately by the page, after each successful load. */
var VERSION='njw-v13';
var SHELL=['./','index.html','app.js','styles.css','logo.webp','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(VERSION).then(function(c){return c.addAll(SHELL.map(function(u){return new Request(u,{cache:'reload'})}))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSION&&k.indexOf('njw-')===0}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin===location.origin){
    /* Network first, so updates show up; the saved copy is used when there is no signal. */
    e.respondWith(fetch(req,{cache:'no-cache'}).then(function(res){if(res.ok){var copy=res.clone();caches.open(VERSION).then(function(c){c.put(req,copy)})}return res})
      .catch(function(){return caches.match(req,{ignoreSearch:true}).then(function(r){return r||(req.mode==='navigate'?caches.match('index.html'):undefined)})}));
    return;
  }
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.match(req).then(function(r){return r||fetch(req).then(function(res){var copy=res.clone();caches.open(VERSION).then(function(c){c.put(req,copy)});return res})}));
  }
});
