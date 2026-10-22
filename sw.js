/* Keeps the app itself on the phone so it opens with no signal.
   The reports are saved separately by the page, after each successful load. */
var VERSION='njw-v40';
var SHELL=['./','index.html','app.js','styles.css','logo.webp','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(VERSION).then(function(c){return c.addAll(SHELL.map(function(u){return new Request(u,{cache:'reload'})}))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSION&&k.indexOf('njw-')===0}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var url=new URL(req.url);
  if(url.origin===location.origin){
    /* Network first, so updates show up. On weak signal the saved copy is used after 4 seconds
       (and the network copy still lands in the cache for next time); with no signal, at once. */
    var net=fetch(req,{cache:'no-cache'}).then(function(res){if(res.ok){var copy=res.clone();caches.open(VERSION).then(function(c){c.put(req,copy)})}return res});
    var saved=function(){return caches.match(req,{ignoreSearch:true}).then(function(r){return r||(req.mode==='navigate'?caches.match('index.html'):undefined)})};
    e.respondWith(new Promise(function(resolve){
      var done=false;function give(r){if(!done&&r){done=true;resolve(r)}}
      var t=setTimeout(function(){saved().then(give)},4000);
      net.then(function(r){clearTimeout(t);give(r)},function(){clearTimeout(t);saved().then(function(r){give(r);if(!done){done=true;resolve(Response.error())}})});
      e.waitUntil(net.catch(function(){}));
    }));
    return;
  }
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.match(req).then(function(r){return r||fetch(req).then(function(res){var copy=res.clone();caches.open(VERSION).then(function(c){c.put(req,copy)});return res})}));
  }
});
