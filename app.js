/* Njoro wa Uba Scene Tracker: installable app.
   Data comes from a Google Sheet that anyone with the link can read.
   Each row is one continuity report, pasted exactly as sent; this app parses it. */
(function(){
  "use strict";
  var SHEET_ID='13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I';
  var TABS=['Reports','Scripts','Repeats'];
  /* Address of the Apps Script web app attached to the Sheet (apps-script/Code.gs).
     Not secret: every change it makes needs the continuity passcode, which only Google checks. */
  var SCRIPT_URL='https://script.google.com/macros/s/AKfycbzts4XJrONLd9LMRi_MgDsfK4_LqBLTRXAv7nuQpKHXOF88zw7x2-hbwTpZa8jZNFbk/exec';
  var CACHE_KEY='njw-data-v1';
  var MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var CYCLE='Cycle 7 | Season 1-4';

  var state={days:[],scripts:{},repeats:{},rows:[],fetchedAt:null};
  var ui={view:'scenes',show:'all',openEp:null,openDay:null,loading:false,offline:!navigator.onLine,error:'',confirmDel:null,busy:false,season:1,showDecided:false};
  /* Sign-in: one admin password, checked by the Google robot. Only a sign-in token is kept on
     the device, never the password. A sign-in ends after IDLE minutes without use. */
  var auth={token:'',name:'',idle:30};
  try{var au=JSON.parse(localStorage.getItem('njw-auth')||'null');if(au&&au.token)auth=au;localStorage.removeItem('njw-pass')}catch(e){}
  var lastAct=Date.now(),lastPing=0;try{lastAct=+localStorage.getItem('njw-last')||Date.now()}catch(e){}
  function isEditor(){return !!(SCRIPT_URL&&auth.token)}
  function isAdmin(){return isEditor()}
  var installPrompt=null;
  try{var v=localStorage.getItem('njw-view');if(v==='scenes'||v==='days'||v==='post'||v==='admin')ui.view=v}catch(e){}
  try{var ag=localStorage.getItem('njw-actgroup');if(ag==='day'||ag==='week'||ag==='month')ui.actGroup=ag}catch(e){}
  try{var sv=+localStorage.getItem('njw-season');if(sv>=1&&sv<=4)ui.season=sv}catch(e){}
  /* Post production: signed-in team only. Kept by the Google robot, never in the Sheet. */
  var EPISODES=52,PER_SEASON=13,SEASONS=4;
  function seasonOf(ep){return Math.min(SEASONS,Math.max(1,Math.ceil(ep/PER_SEASON)))}
  function seasonEps(s){var a=[];for(var n=(s-1)*PER_SEASON+1;n<=s*PER_SEASON;n++)a.push(n);return a}
  function setSeason(s){ui.season=s;try{localStorage.setItem('njw-season',String(s))}catch(e){}}
  var post={tx:'',eps:{},loaded:false,loading:false,err:'',at:0,openDrop:null,openMove:null};
  try{var pc=JSON.parse(localStorage.getItem('njw-post')||'null');if(pc&&pc.eps&&auth.token){post.tx=pc.tx||'';post.eps=pc.eps;post.loaded=true;post.at=pc.at||0}}catch(e){}
  var admin={activity:null,private:null,err:''};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function normSc(sc){return String(sc).toUpperCase().replace(/^0+(?=\d)/,'')}
  function keyOf(ep,sc){return Number(ep)+'/'+normSc(sc)}
  function scParts(sc){var m=/^(\d+)(.*)$/.exec(normSc(sc));return m?[Number(m[1]),m[2]]:[9999,String(sc)]}
  function cmpKey(a,b){var A=a.split('/'),B=b.split('/');if(+A[0]!==+B[0])return A[0]-B[0];var x=scParts(A[1]),y=scParts(B[1]);return x[0]-y[0]||(x[1]<y[1]?-1:x[1]>y[1]?1:0)}
  function daysAsc(){return state.days.slice().sort(function(a,b){return a.day-b.day})}
  function pad(n){return String(n).padStart(2,'0')}
  function fmtDate(iso){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'.'+m[2]+'.'+m[1]:''}
  function inferIso(text){
    var t=text||'',m,y,mo,d;
    if((m=/(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))){y=+m[1];mo=+m[2];d=+m[3]}
    else if((m=/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(t))){d=+m[1];mo=+m[2];y=+m[3];if(y<100)y+=2000}
    else if((m=/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/i.exec(t))){
      d=+m[1];mo=MONTHS.indexOf(m[2].toLowerCase())+1;
      if(m[3])y=+m[3];else{var now=new Date();y=now.getFullYear();if(new Date(y,mo-1,d)-now>60*864e5)y--}
    }else if((m=/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(t))){
      d=+m[2];mo=MONTHS.indexOf(m[1].toLowerCase())+1;
      if(m[3])y=+m[3];else{var now2=new Date();y=now2.getFullYear();if(new Date(y,mo-1,d)-now2>60*864e5)y--}
    }else return '';
    if(!(mo>=1&&mo<=12&&d>=1&&d<=31))return '';
    return y+'-'+pad(mo)+'-'+pad(d);
  }
  var LOG_FOLDER='https://drive.google.com/drive/folders/1KQgFJwqSnT5e3fR0aS7sNptej30-5Bs9?usp=sharing';
  var SCRIPTS_FOLDER='https://drive.google.com/drive/folders/1keWRPeybj1YUOr8c6MtPNM-tHS-zmnjZ?usp=sharing';
  /* Scripts found on 09.10.2026. Used until the Apps Script writes the Scripts tab, which then takes over. */
  var SCRIPT_SEED={"1":{"url":"https://drive.google.com/file/d/1h1cAMNHBmJMRAIrUrWy0MkGey5zmwK5i/view","name":"EPISODE 1.pdf"},"2":{"url":"https://drive.google.com/file/d/1KuVpCzPWDxe7qjauTwRf54n4htM3NNo1/view","name":"EPISODE 2.pdf"},"3":{"url":"https://drive.google.com/file/d/1sMdHvFZx6vyPP-3VWA4wtBdH8OZ1KtTz/view","name":"EPISODE 3.pdf"},"4":{"url":"https://drive.google.com/file/d/15sqGsYtc7PyhxUcPUJjbAwyS0CUN0GUg/view","name":"EPISODE 4.pdf"},"5":{"url":"https://drive.google.com/file/d/1EFwA0n0w2RUkeLPI77hTuCJIL7ZC2C-_/view","name":"EPISODE 5.pdf"},"6":{"url":"https://drive.google.com/file/d/1WR2ASggbojN7txYiNlbpnCKBTmGQ0fB0/view","name":"EPISODE 6.pdf"},"7":{"url":"https://drive.google.com/file/d/1hhq-4FzgDySJv3ZbfZT_gG7VDIcjqyOR/view","name":"EPISODE 7.pdf"},"8":{"url":"https://drive.google.com/file/d/1QecGLJVOesXV61RK_iRqHQFt_3w-3z9Y/view","name":"EPISODE 8.pdf"},"9":{"url":"https://drive.google.com/file/d/1SeEoTN0EuRMrPN4-KJlhZZP9zirL--kW/view","name":"EPISODE 9.pdf"},"10":{"url":"https://drive.google.com/file/d/1lcotMO-QHO3f7YVGfHoANFKlyi9klemw/view","name":"EPISODE 10.pdf"},"12":{"url":"https://drive.google.com/file/d/1nX0gBt6v9fIf3P-T17CcEdBwWNDBgpMD/view","name":"EPISODE 12.pdf"},"13":{"url":"https://drive.google.com/file/d/1KBgIIb7ji5a1MVF1u3oFJ50kL_cV7G43/view","name":"EPISODE 13.pdf"}};
  /* Log sheets found in Drive on 13.10.2026 for days that had no link yet. The robot fills the
     Sheet itself once version 6 runs; a link already in the Sheet always wins over these. */
  var LOG_SEED={9:{iso:'2026-10-09',url:'https://drive.google.com/file/d/1w3ZbfyRHPNAA476kJkVmLya7buysg5FA/view'}};
  /* Scene numbers per episode. The Google robot reads every script in the Scripts folder and
     writes them to the Scripts tab (Scenes column). These counts are only a fallback, read by hand
     on 10.10.2026 and 13.10.2026, for when that tab is missing. */
  /* Estab (E) and Flashback (F) scenes, read from the scripts by hand on 16.10.2026. The robot
     (version 10) reads every script itself and its Notes column takes over. */
  var SCENE_NOTES={"1":{"2":"F|Cess telling Njoro to denounce Zani and that Zani ni Mtoto wa Koome.","4":"E|Various Activities - We transition from Night to morning.","6":"E|Various activities, time lapse","8":"E|Various activities. Njoro’s car wipes frame.","12":"E|Various activities.","14":"E|Njoros car wipes frame, the sound of laughter fills the air.","16":"E|Various activities.","18":"E|We transition to night."},"2":{"3":"E|The cab whips past.","5":"E|The cab pulls up to an apartment gate.","7":"E|The cab glides through the city.","9":"E|Njoro comes to a stop.","12":"E|Sunrise. The cab whips past.","14":"E|Various activities.","17":"E|Various transition day to night to day DAY 3","18":"E|EXT. STACY’S SCHOOL - DAY","24":"E|The cab pulls up outside the sleek office building.","26":"E|Various The car whips past. A phone ringing fills the air.","30":"E|EXT. NJORO'S PLACE - DAY"},"3":{"9":"E|Nairobi in motion. Cars inching through traffic.","13":"E|Njoro’s cab pulls up outside the apartment gate but doesn’t enter immediately. Inside,…"},"4":{"2":"E|Njoro’s cab comes to a stop","8":"E|Njoro’s cab parked at usual spot.","10":"E|The cab drives past us.","12":"E|Day turns into night"},"5":{"1":"E|The cab drives past us.","4":"F|A brief fragment. Mwajuma. The moment she realizes Njoro's lie.","5":"F|Joy and Njoro with their ice creams. Joy looking directly at him.","6":"F|His apartment door opening. Cess standing there. Njoro stares through the windscreen.…","8":"E|The cab drives through the city.","14":"E|Office estab.","18":"E|The cab drives past us.","24":"E|The small kibanda is still open."},"6":{"1":"E|Njoro’s cab passes by.","4":"F|Njoro holding the pregnancy stick.","9":"E|A time lapse of the city settling into night, then waking into a new day.","10":"E|Njoro’s cab glides past. Inside, a girl’s voice fills the air.","12":"E|Njoro’s cab glides past.","15":"E|Various city activities","16":"E|The DOORBELL RINGS."},"7":{"1":"E|Njoro’s cab comes to a stop.","4":"E|The cab whips past us.","10":"E|Various Activities","12":"E|The Cab whips past us.","18":"E|Day turns into night."},"8":{"1":"E|Njoro’s car navigates its way through narrow streets.","4":"E|An Estab shot of the building.","7":"E|Njoro’s car wipes frame.","10":"E|Njoro’s car comes to a stop at a gate - we don’t see exactly where he Is.","14":"E|Various activities - Njoro’s car wipes frame.","16":"E|Various activities.","18":"E|An estab shot of the building - we hear the door bell ring.","20":"E|Various activities.","22":"E|An Estab of the building. Crickets."},"9":{"3":"E|The city moves along. The cab whips past.","14":"E|The cab moves through the city.","19":"E|The cab is parked.","23":"E|Estab. Doorbell rings.","25":"E|Various."},"10":{"4":"E|The day has moved on. Transition night to day","15":"E|Various activities"},"12":{"7":"E|Sunday traffic. Njoro’s cab moves through frame.","10":"E|The cab whips past.","13":"E|Various","15":"E|Night turns to day","16":"E|Various","17":"E|The cab whips past.","21":"E|Various","23":"E|EXT. HOSPITAL - DAY"},"13":{"1":"E|Njoro’s car wipes frame.","5":"E|Various activities.","7":"E|Various activities.","10":"E|Njoro's cab moves through traffic.","12":"E|Transition to day.","17":"E|Laughter carries from inside.","23":"E|The car pulls up."}};
  var SCENE_COUNT={1:19,2:32,3:19,4:16,5:25,6:19,7:19,8:23,9:26,10:16,12:25,13:24};
  function sceneList(ep){
    var sc=state.scripts&&state.scripts[ep],out=[],seen={};
    var raw=sc&&sc.scenes&&sc.scenes.length?sc.scenes:null;
    if(raw&&raw.length>=3)raw.forEach(function(x){var n=scParts(x)[0];if(n<9999&&!seen[n]){seen[n]=1;out.push(n)}});
    /* Scripts number scenes 1, 2, 3 ... so a heading the reader missed is still counted. */
    /* The script's own headings win; the hand count is only for when the script has not been read. */
    var top=out.length?Math.max.apply(null,out):(SCENE_COUNT[ep]||0);
    if(top>0&&top<=300){out=[];for(var i=1;i<=top;i++)out.push(i)}
    return out;
  }
  /* Shot / still-to-shoot per episode. A lettered take (29A) covers scene 29. */
  /* A scene counts as shot when it is logged under its plain number (7/7) or marked continued.
     If only lettered parts are logged (7/7B), it is "part shot": some of it may still be missing. */
  /* Estab and Flashback scenes for an episode: from the robot's reading of the script, or the
     list read by hand on 16.10.2026 while the robot is older than version 10. */
  function sceneNotes(ep){
    var sc=state.scripts&&state.scripts[ep];
    if(sc&&sc.notes)return sc.notes;
    var seed=SCENE_NOTES[ep]||{},out={};Object.keys(seed).forEach(function(k){var m=/^([EF])\|(.*)$/.exec(seed[k]);if(m)out[k]={type:m[1]==='E'?'Estab':'Flashback',note:m[2]}});
    return out;
  }
  function estabIn(ep,n){var x=sceneNotes(ep)[String(n)];return !!(x&&(x.type==='Estab'||x.type==='Flashback'))}   /* not counted as to shoot: estabs, and flashbacks (counted as shot) */
  function progress(ep,rows){
    var list=sceneList(ep).filter(function(n){return !estabIn(ep,n)});if(!list.length)return null;
    var full={},parts={};
    rows.forEach(function(t){
      if(t.ep!==ep)return;
      var sc=t.key.split('/')[1],p=scParts(sc);
      if(!p[1]||t.tags.indexOf('Completed')>=0||t.tags.indexOf('Continued')>=0)full[p[0]]=1;
      else{parts[p[0]]=parts[p[0]]||[];if(parts[p[0]].indexOf(sc)<0)parts[p[0]].push(sc)}
    });
    var shot=0,part=[],left=[];
    list.forEach(function(n){if(full[n])shot++;else if(parts[n])part.push({n:n,parts:parts[n].sort()});else left.push(n)});
    return {total:list.length,shot:shot,part:part,left:left,last:list[list.length-1]};
  }
  function inScript(ep,sc){var L=sceneList(+ep);return !L.length||L.indexOf(scParts(sc)[0])>=0}
  function notInScript(p){return p.shot.filter(function(s){return !inScript(s.ep,s.sc)}).map(function(s){return keyOf(s.ep,s.sc)})}
  function barHtml(pr){
    return '<div class="bar2" aria-hidden="true"><i style="width:'+(pr.shot/pr.total*100).toFixed(1)+'%"></i>'
      +(pr.part.length?'<i class="pt" style="width:'+(pr.part.length/pr.total*100).toFixed(1)+'%"></i>':'')+'</div>';
  }
  function scriptFor(ep){var x=(state.scripts&&state.scripts[ep])||SCRIPT_SEED[ep];return x&&safeUrl(x.url)?x:null}
  function safeUrl(u){return /^https:\/\/(drive|docs)\.google\.com\//.test(u||'')?u:''}
  function logLink(d,label){var u=safeUrl(d.log);return u?'<a class="log" href="'+esc(u)+'" target="_blank" rel="noopener">'+(label||'Log sheet')+' \u2197</a>':''}
  function dayRef(d){var f=fmtDate(d.iso);return 'Day '+d.day+(f?' | '+f:(d.date?' | '+d.date:''))}
  function toMin(t){var m=/(\d{1,2})[:.](\d{2})\s*([ap])m/i.exec(t||'');if(!m)return null;var h=+m[1]%12;if(m[3].toLowerCase()==='p')h+=12;return h*60+ +m[2]}
  function hours(d){
    var call=null,wrap=null;(d.times||[]).forEach(function(x){if(/call/i.test(x.label)&&call==null)call=toMin(x.time);if(/wrap/i.test(x.label))wrap=toMin(x.time)});
    if(call==null||wrap==null)return '';var m=wrap-call;if(m<0)m+=1440;return Math.floor(m/60)+'h '+pad(m%60);
  }
  function pageNum(t){var m=/^\s*(\d+(?:\.\d+)?)?\s*(?:(\d)\s*\/\s*8)?/.exec(t||'');if(!m||(!m[1]&&!m[2]))return 0;return (m[1]?parseFloat(m[1]):0)+(m[2]?+m[2]/8:0)}
  function pageFmt(n){var w=Math.floor(n),e=Math.round((n-w)*8);if(e===8){w++;e=0}return (w||!e?String(w):'')+(e?(w?' ':'')+e+'/8':'')}
  var TAG_LABEL={Check:'Reshoot, duplicate or continued?',Completed:'Continued'};
  function tagsHtml(tags){return (tags||[]).map(function(t){return '<span class="tag '+esc(t).replace(/\s+/g,'-')+'">'+esc(TAG_LABEL[t]||t)+'</span>'}).join('')}
  /* Forgiving word search: ignores case, punctuation and small typos, matches word starts and common short forms. */
  var ABBR={rd:'road',st:'street',str:'street',ave:'avenue',av:'avenue',hse:'house',bldg:'building',htl:'hotel',mkt:'market',hosp:'hospital',sch:'school',apt:'apartment',apts:'apartments',est:'estate',ext:'exterior',int:'interior',estb:'establishing',broll:'broll'};
  function words(t){return String(t||'').toLowerCase().replace(/['’]/g,'').replace(/b[\s-]?roll/g,'broll').split(/[^a-z0-9]+/).filter(Boolean).map(function(w){w=ABBR[w]||w;return w.length>3&&/s$/.test(w)&&!/ss$/.test(w)?w.slice(0,-1):w})}
  function lev(a,b){if(Math.abs(a.length-b.length)>2)return 9;var p=[],i,j;for(j=0;j<=b.length;j++)p[j]=j;for(i=1;i<=a.length;i++){var c=[i];for(j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
  function wordMatch(q,w){
    if(w===q)return true;
    if(q.length>=2&&w.indexOf(q)===0)return true;
    if(q.length>=4&&w.indexOf(q)>0)return true;
    var n=0;while(n<q.length&&n<w.length&&q[n]===w[n])n++;
    if(n>=6)return true;
    var tol=q.length>=7?2:(q.length>=4?1:0);
    if(tol&&lev(q,w)<=tol)return true;
    if(tol&&w.length>q.length&&lev(q,w.slice(0,q.length))<=tol)return true;
    return false;
  }
  function textMatch(query,text){var qs=words(query),ws=words(text);if(!qs.length)return false;return qs.every(function(q){return ws.some(function(w){return wordMatch(q,w)})})}

  /* Every scene recorded on a day. Older saves kept pulled scenes in a separate list; they count as shot. */
  function entriesOf(d){
    return (d.shot||[]).map(function(s){return {ep:s.ep,sc:s.sc,note:s.note||'',tags:(s.tags||[]).slice(),decided:s.decided||null}})
      .concat((d.pulled||[]).map(function(s){return {ep:s.ep,sc:s.sc,note:s.note||'',tags:['Pulled']}}));
  }
  /* One row per time a scene was shot. Repeats tagged Reshoot are numbered: Reshoot, Reshoot 2 ... */
  function takes(){
    var by={};
    daysAsc().forEach(function(d){entriesOf(d).forEach(function(s){if(s.tags.indexOf('Duplicate')>=0)return;var k=keyOf(s.ep,s.sc);(by[k]=by[k]||[]).push({key:k,ep:+s.ep,day:d,note:s.note,tags:s.tags,decided:s.decided})})});
    var out=[];
    Object.keys(by).sort(cmpKey).forEach(function(k){
      var n=0;by[k].forEach(function(t){if(t.tags.indexOf('Reshoot')>=0){n++;t.ext=n>1?'Reshoot '+n:'Reshoot'}else t.ext='';out.push(t)});
    });
    return out;
  }

  /* ---------- parse a continuity report ---------- */
  /* Copying several WhatsApp messages adds "[07/10/2026, 19:45] Name: " (iPhone) or
     "07/10/2026, 19:45 - Name: " (Android) to each message. Those dates would read as scenes, so they go. */
  var WA_PREFIX=/^\s*(?:\[\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\]|\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s+-)\s*[^:\n]{1,40}:\s?/i;
  function cleanPaste(t){return String(t||'').replace(/\r/g,'').split('\n').map(function(l){return l.replace(WA_PREFIX,'')}).join('\n').trim()}
  function normLine(l){return l.replace(/[*_~]/g,'').replace(/[\u231B\u23F3]/g,'').replace(/\s+/g,' ').trim().replace(/^[^A-Za-z0-9]+(?=[A-Za-z])/,'')}
  /* One paste can hold several daily reports. Each starts at its title line
     ("Njoro wa uba Report") or, without one, at its "Shoot Day" line. */
  function splitReports(text){
    var lines=cleanPaste(text).split('\n'),starts=[];
    lines.forEach(function(l,i){
      if(!/^shoot\s*day\s*[:\-]?\s*\d/i.test(normLine(l)))return;
      var st=i,floor=starts.length?starts[starts.length-1]+1:0;
      for(var j=i-1,seen=0;j>=floor&&seen<4;j--){var n=normLine(lines[j]);if(!n)continue;seen++;if(/report/i.test(n)){st=j;break}}
      starts.push(st);
    });
    if(starts.length<2)return [lines.join('\n').trim()].filter(Boolean);
    starts[0]=0;
    return starts.map(function(st,k){return lines.slice(st,k+1<starts.length?starts[k+1]:lines.length).join('\n').trim()}).filter(Boolean);
  }
  function parseReport(raw){
    var out={day:null,date:'',iso:'',cast:'',location:'',times:[],pages:'',shot:[],ignored:[],raw:raw,warnings:[]};
    var mode=null,secTag='',seen={};
    raw.split(/\r?\n/).forEach(function(line0,li){
      var line=line0.replace(/[*_~]/g,'').replace(/[⌛⏳]/g,'').replace(/\s+/g,' ').trim().replace(/^[^A-Za-z0-9]+(?=[A-Za-z])/,'');
      if(!line)return;
      var m,hasScene=/\d+\s*\/\s*\d/.test(line);
      if((m=/^shoot\s*day\s*[:\-]?\s*(\d+)/i.exec(line))){if(out.day==null)out.day=+m[1];return}
      if((m=/^date\s*[:\-]\s*(.+)$/i.exec(line))){out.date=m[1].trim();out.iso=inferIso(out.date);return}
      if((m=/^cast\s*[:\-]\s*(.+)$/i.exec(line))){out.cast=m[1].trim();return}
      if((m=/^locations?\s*[:\-]\s*(.+)$/i.exec(line))){out.location=m[1].trim();return}
      if((m=/^pages?\s*(?:shot)?\s*[:\-]\s*([\d.]+(?:\s+\d\/8)?)/i.exec(line))){out.pages=m[1].trim();mode=null;return}
      if(!hasScene){
        if(/re-?shoot/i.test(line)){mode='shot';secTag='Reshoot';return}
        if(/pulled/i.test(line)){mode='shot';secTag='Pulled';return}
        if(/dropped|not shot|already|moved|carried|postponed|cancel/i.test(line)){mode='skip';secTag='';return}
        if(/scenes?/i.test(line)){mode='shot';secTag='';return}
      }
      if((m=/^([a-z][a-z ]{1,24}?)\s*[:\-]\s*(\d{1,2}[:.]\d{2}\s*[ap]\.?m\.?)\s*$/i.exec(line))){
        var lbl=m[1].trim().toLowerCase();
        out.times.push({label:lbl.charAt(0).toUpperCase()+lbl.slice(1),time:m[2].replace(/\s+/g,'').toUpperCase().replace(/\./g,':').replace(/:M/,'M')});return;
      }
      if(!mode||!hasScene)return;
      var re=/(?:^|[^\d\/])(\d{1,3})\s*\/\s*(\d{1,3}[A-Za-z]?)(?![\d\/A-Za-z])/g,found=[];
      while((m=re.exec(line)))found.push({ep:String(+m[1]),sc:normSc(m[2])});
      if(!found.length)return;
      var tags=[];if(secTag)tags.push(secTag);
      if(/re-?shoot/i.test(line)&&tags.indexOf('Reshoot')<0)tags.push('Reshoot');
      if(/\bpulled\b/i.test(line)&&tags.indexOf('Pulled')<0)tags.push('Pulled');
      var note=line.replace(/\b\d{1,3}\s*\/\s*\d{1,3}[A-Za-z]?\b/g,'').replace(/\bre-?shoot\b|\bpulled\b/gi,'').replace(/\s+/g,' ').replace(/[\s\-:,;–()]+$/,'').replace(/^[\s\-:,;–()]+/,'').trim();
      found.forEach(function(f){
        var k=keyOf(f.ep,f.sc);
        if(mode==='skip'){out.ignored.push(k);return}
        if(seen[k]){tags.forEach(function(t){if(seen[k].tags.indexOf(t)<0)seen[k].tags.push(t)});return}
        f.note=note;f.tags=tags.slice();f.line=li;seen[k]=f;out.shot.push(f);
      });
    });
    if(out.day==null)out.warnings.push('No shoot day number found. Type it in below.');
    if(!out.iso)out.warnings.push('Could not read the date. Pick it below.');
    if(!out.shot.length)out.warnings.push('No scenes found. Scenes must be written as episode/scene, for example 7/4.');
    if(out.ignored.length)out.warnings.push('Not logged, because the report lists them as not shot or already shot: '+out.ignored.join(', ')+'.');
    return out;
  }
  function locQuery(){var e=document.getElementById('loc');return e?e.value.trim():''}
  function locHits(kw){return daysAsc().filter(function(d){return textMatch(kw,d.location||'')})}
  function parseQuery(){
    var q=(document.getElementById('q').value||'').trim();if(!q)return null;
    var m=/^\D*?(\d{1,3})\D+(\d{1,3}[a-z]?)(?:\s*re-?shoot.*)?\s*$/i.exec(q);if(m)return {type:'scene',key:keyOf(m[1],m[2])};
    m=/^\D*?(\d{1,3})\D*$/.exec(q);if(m)return {type:'ep',ep:+m[1]};
    return {type:'bad'};
  }

  function renderAnswer(){
    var box=document.getElementById('answer'),q=parseQuery(),kw=locQuery();
    document.getElementById('q').classList.remove('miss');
    if(kw){
      var hits=locHits(kw);
      if(!hits.length){box.innerHTML='<div class="answer"><div class="line"><span class="verdict">No shoot day at \u201c'+esc(kw)+'\u201d</span></div><p class="muted">Try a shorter word, or part of the place name.</p></div>';return}
      box.innerHTML='<div class="answer shot"><div class="line"><span class="verdict">Shot there on '+hits.length+' day'+(hits.length===1?'':'s')+'</span></div><ul>'
        +hits.map(function(d){return '<li><strong>'+esc(dayRef(d))+'</strong><span class="muted">'+esc(d.location||'')+'</span>'+logLink(d)+'</li>'}).join('')
        +'</ul><p class="muted">Open a day below to see its scenes and the original report. Unlogged establishing shots will be in that day\u2019s footage.</p></div>';
      return;
    }
    if(!q||q.type==='ep'){box.innerHTML='';return}
    if(q.type==='bad'){box.innerHTML='<div class="answer"><p class="muted">Type an episode and scene number, like 7/4.</p></div>';return}
    var list=takes().filter(function(t){return t.key===q.key});
    if(!list.length){
      var logged=daysAsc().map(function(d){return d.day});
      var parts=q.key.split('/'),base=parts[0]+'/'+parts[1].replace(/[A-Z]+$/,''),near={};
      takes().forEach(function(t){if(t.key!==q.key&&t.key.replace(/[A-Z]+$/,'')===base)near[t.key]=t.day});
      var nearKeys=Object.keys(near).sort(cmpKey);
      document.getElementById('q').classList.add('miss');
      var sx=sceneNotes(+parts[0])[String(scParts(parts[1])[0])];
      if(sx&&parts[1]===String(scParts(parts[1])[0])){
        document.getElementById('q').classList.remove('miss');
        box.innerHTML='<div class="answer shot"><div class="line"><span class="sc">'+esc(q.key)+'</span><span class="verdict">'+(sx.type==='Estab'?'Estab':'Flashback')+'</span></div>'
          +'<p><span class="tag '+sx.type+'">'+sx.type+'</span> '+(sx.type==='Estab'?'An establishing shot in the script. Not logged in any report, and not counted as to shoot.':'A flashback in the script. Not logged in any report, and counted as shot.')+'</p></div>';
        return;
      }
      box.innerHTML='<div class="answer notshot" role="alert"><div class="line"><span class="sc">'+esc(q.key)+'</span><span class="verdict">Not shot</span></div>'
        +'<p>Episode '+esc(parts[0])+', Scene '+esc(parts[1])+' is not in any continuity report logged so far'+(logged.length?' (Day '+logged.join(', ')+')':'')+'.</p>'
        +(function(){var x=sceneNotes(+parts[0])[String(scParts(parts[1])[0])];if(!x)return '';return '<p><span class="tag '+x.type+'">'+x.type+'</span> '+(x.type==='Estab'?'An establishing shot in the script, so it is not counted as to shoot.':'A flashback in the script, so it is counted as shot.')+'</p>'})()
        +(function(){var L=sceneList(+parts[0]);return L.length&&L.indexOf(scParts(parts[1])[0])<0?'<p><strong>Check the number.</strong> Scene '+esc(parts[1])+' is not in the Episode '+esc(parts[0])+' script, which runs from scene '+L[0]+' to '+L[L.length-1]+'.</p>':''})()
        +(nearKeys.length?'<p><strong>Similar scene shot:</strong> '+nearKeys.map(function(k){return esc(k)+' on '+esc(dayRef(near[k]))}).join(', ')+'. Check it is not the same scene under another number.</p>':'')
        +'<div class="tip"><strong>Before you mark it missing,</strong> check whether it was shot as an establishing shot, insert, cutaway, B-roll, VO or pickup and left out of the report. Type the scene\u2019s location in the Location box to find the days the crew was there, then check those days\u2019 log sheets. <a href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Open log sheets \u2197</a></div></div>';
      return;
    }
    box.innerHTML='<div class="answer shot"><div class="line"><span class="sc">'+esc(q.key)+'</span><span class="verdict">Shot'+(list.length>1?' '+list.length+' times':'')+'</span></div><ul>'
      +list.map(function(t){return '<li><strong>'+esc(dayRef(t.day))+'</strong>'+logLink(t.day)+(t.ext?'<span class="tag Reshoot">'+esc(t.ext)+'</span>':'')+tagsHtml(t.tags.filter(function(x){return x!=='Reshoot'}))+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</li>'}).join('')
      +'</ul></div>';
  }

  function seasonSeg(){
    return '<div class="seg" role="group" aria-label="Season">'+[1,2,3,4].map(function(n){return '<button type="button" data-season="'+n+'" aria-pressed="'+(ui.season===n)+'"><span class="hide-xs">Season </span><span class="show-xs">S</span>'+n+'</button>'}).join('')+'</div>';
  }
  function renderControls(){
    if((ui.view==='post'&&!isEditor())||(ui.view==='admin'&&!isAdmin()))ui.view='scenes';
    try{document.body.setAttribute('data-view',ui.view)}catch(e){}
    var vs=[['scenes','Scenes'],['days','Daily reports']];if(isEditor())vs.push(['post','Post production']);if(isAdmin())vs.push(['admin','Activity']);
    document.getElementById('views').innerHTML=vs.map(function(v){return '<button type="button" data-view="'+v[0]+'" aria-pressed="'+(ui.view===v[0])+'">'+v[1]+'</button>'}).join('');
    var srch=document.querySelector('.search');if(srch)srch.hidden=ui.view==='post'||ui.view==='admin';
    var f=document.getElementById('filters');
    if(ui.view==='post'){f.innerHTML='';return}
    if(ui.view!=='scenes'){f.innerHTML='';return}
    f.innerHTML=seasonSeg()+'<label for="f-show" class="sr">Show</label><select id="f-show" autocomplete="off"><option value="all">All scenes</option><option value="todo"'+(ui.show==='todo'?' selected':'')+'>Not shot yet</option><option value="Check"'+(ui.show==='Check'?' selected':'')+'>Needs a check</option><option value="Pulled"'+(ui.show==='Pulled'?' selected':'')+'>Pulled</option><option value="Reshoot"'+(ui.show==='Reshoot'?' selected':'')+'>Reshoots</option></select>';
  }

  /* A Continued choice lives on the scene's own line, with a small Undo for the team. */
  function contUndo(t){return t.decided&&t.decided.decision==='Continued'&&isEditor()?'<button type="button" class="linkbtn contundo" data-decide="" data-scene="'+esc(t.key)+'" data-day="'+t.day.day+'" aria-label="Undo Continued for '+esc(t.key)+' on Day '+t.day.day+'">Undo</button>':''}
  /* Every scene in an open episode, in script order (1, 2, 3 ...). A scene that was shot shows each
     take; one that was not shows "Not shot yet". Labels (Estab, Flashback, Part shot, Reshoot ...)
     sit at the end of the line. Logged scenes that are not in the script are slotted in by number. */
  function episodeRows(ep,g,pr,hit){
    var notes=sceneNotes(ep),byBase={},items=[];
    g.forEach(function(t){var n=scParts(t.key.split('/')[1])[0];(byBase[n]=byBase[n]||[]).push(t)});
    var partOf={};(pr?pr.part:[]).forEach(function(x){partOf[x.n]=x.parts});
    sceneList(ep).forEach(function(n){
      var takes=byBase[n]||[],x=notes[String(n)];delete byBase[n];
      if(partOf[n])items.push({key:ep+'/'+n,ph:'part',parts:partOf[n],label:x&&x.type});
      if(takes.length)takes.forEach(function(t){items.push({key:t.key,t:t})});
      else items.push({key:ep+'/'+n,ph:x?x.type:'todo',label:x&&x.type});
    });
    Object.keys(byBase).forEach(function(n){byBase[n].forEach(function(t){items.push({key:t.key,t:t,extra:true})})});
    items.sort(function(a,b){return cmpKey(a.key,b.key)||(a.ph==='part'?-1:b.ph==='part'?1:0)});
    return items.map(function(it){
      if(it.t)return row(it.t,hit);
      var lab=it.label?'<span class="tag '+it.label+'">'+it.label+'</span>':'';
      var txt=it.ph==='todo'?'<span class="ns-todo">Not shot yet</span>'
        :it.ph==='part'?'<span class="ns-part">Part shot: only '+esc(it.parts.join(', '))+' logged</span>'
        :it.ph==='Estab'?'<span class="muted">Not logged \u00b7 not counted as to shoot</span>'
        :'<span class="muted">Not logged \u00b7 counted as shot</span>';
      var tags=(it.ph==='part'?'<span class="tag Part-shot">Part shot</span>':'')+lab;
      return '<tr class="sline '+(it.ph==='todo'?'todo':it.ph==='part'?'part':'quiet')+(hit===it.key?' hit':'')+'"><td class="sc">'+esc(it.key)+'</td><td class="when">'+txt+(tags?'<div class="sub show-sm">'+tags+'</div>':'')+'</td><td class="loc hide-sm"></td><td class="note hide-sm">'+tags+'</td></tr>';
    }).join('');
  }
  function row(t,hit,showEp){
    var other=t.tags.filter(function(x){return x!=='Reshoot'});
    var sn=sceneNotes(t.ep)[String(scParts(t.key.split('/')[1])[0])];if(sn)other=other.concat([sn.type]);
    if(!inScript(t.ep,t.key.split('/')[1]))other=other.concat(['Not in script']);
    return '<tr'+(hit===t.key?' class="hit"':'')+'><td class="sc">'+esc(t.key)+(t.ext?'<span class="ext">'+esc(t.ext)+'</span>':'')+'</td><td class="when">'+esc(dayRef(t.day))+' '+logLink(t.day,'Log')+'<div class="sub show-sm">'+esc(t.day.location||'')+(other.length||t.note?'<br>':'')+tagsHtml(other)+contUndo(t)+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</div></td><td class="loc hide-sm">'+esc(t.day.location||'')+'</td><td class="note hide-sm">'+tagsHtml(other)+contUndo(t)+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</td></tr>';
  }
  var HEAD='<thead><tr><th>Scene</th><th>Shot on</th><th class="hide-sm">Location</th><th class="hide-sm">Notes</th></tr></thead>';
  /* Scenes, one season at a time: 13 episodes, numbered 1 to 52 the same way as Post production. */
  function renderScenes(){
    /* The Show menu on screen is the truth: a browser that restores an old choice after a reload
       can no longer leave the list filtered by something the menu does not show. */
    var fs=document.getElementById('f-show');if(fs&&fs.value&&fs.value!==ui.show)ui.show=fs.value;
    var q=parseQuery(),all=takes(),rows=all,notShot=ui.show==='todo';
    if(ui.show!=='all'&&!notShot)rows=rows.filter(function(t){return t.tags.indexOf(ui.show)>=0});
    var hit=null,only=null;
    if(q&&q.type==='scene'){only=+q.key.split('/')[0];ui.openEp=only;hit=q.key;if(!all.some(function(t){return t.key===q.key}))return ''}
    else if(q&&q.type==='ep'){only=q.ep;ui.openEp=q.ep}
    var by={};rows.forEach(function(t){(by[t.ep]=by[t.ep]||[]).push(t)});
    var season=only!=null&&only>=1&&only<=EPISODES?seasonOf(only):ui.season;
    var eps=only!=null?[only]:seasonEps(season);
    if(notShot)eps=eps.filter(function(ep){var pr=progress(ep,all);return pr&&(pr.left.length||pr.part.length)});
    else if(ui.show!=='all')eps=eps.filter(function(ep){return by[ep]&&by[ep].length});
    var a=(season-1)*PER_SEASON+1,b=season*PER_SEASON;
    var head='<div class="seasonhead"><b>Season '+season+'</b><span class="muted">Episodes '+a+' to '+b+'</span></div>';
    if(only!=null&&(only<1||only>EPISODES))head='';
    if(!eps.length){
      var msg=notShot?'Every scene in the Season '+season+' scripts has been shot.':'Nothing in Season '+season+' matches this filter.';
      return '<div class="tablewrap">'+head+'<p class="empty">'+esc(msg)+' <button type="button" class="linkbtn" data-act="show-all">Show all scenes</button></p></div>';
    }
    var html='<div class="tablewrap">'+head+'<table>'+(notShot?'':HEAD)+'<tbody>';
    eps.forEach(function(ep){
      var g=by[ep]||[],open=ui.openEp===ep,pr=progress(ep,all),sc=scriptFor(ep),sub;
      if(pr)sub=(pr.left.length||pr.part.length?'':'<span class="prog done">All shot \u2713</span>');
      else if(g.length)sub='<span class="prog">No script yet</span>';
      else sub='<span class="prog noscript">No script in Drive yet</span>';
      var checks=g.filter(function(t){return t.tags.indexOf('Check')>=0}).length;
      html+='<tr class="grp'+(open?' open':'')+(pr||g.length?'':' empty')+'"><td colspan="4"><div class="grprow"><button type="button" class="grpbtn" data-ep="'+ep+'" aria-expanded="'+open+'">Episode '+ep+sub+'</button>'
        +(post.loaded&&airingEp()===ep?'<span class="onairchip">On air</span>':'')
        +(checks?'<span class="needcheck">'+checks+' to check</span>':'')
        +(pr&&pr.left.length?'<span class="togo">'+pr.left.length+'<span class="lg"> to shoot</span><span class="sm"> left</span></span>':'')
        +(pr&&pr.part.length?'<span class="partpill">'+pr.part.length+' part<span class="lg"> shot</span></span>':'')
        +(sc?'<a class="scriptlink" href="'+esc(sc.url)+'" target="_blank" rel="noopener" title="'+esc(sc.name)+'">Script ↗</a>':'')
        +'<button type="button" class="grpfill" data-ep="'+ep+'" tabindex="-1" aria-hidden="true"><span class="chev">›</span></button></div>'
        +(pr?barHtml(pr):'')
        +'</td></tr>';
      if(!open)return;
      if(notShot){
        if(pr&&(pr.left.length||pr.part.length))html+='<tr class="left"><td colspan="4">'
          +(pr.left.length?'<div class="leftgrp"><span class="lbl">Not shot yet</span>'+pr.left.map(function(n){return '<span class="chip">'+ep+'/'+n+'</span>'}).join('')+'</div>':'')
          +(pr.part.length?'<div class="leftgrp"><span class="lbl pt">Part shot, check the rest was shot</span>'+pr.part.map(function(x){return '<span class="chip pt">'+ep+'/'+x.n+' <small>only '+esc(x.parts.join(', '))+'</small></span>'}).join('')+'</div>':'')
          +'</td></tr>';
        return;
      }
      if(ui.show==='all'&&sceneList(ep).length){html+=episodeRows(ep,g,pr,hit);return}
      if(!notShot){
        if(g.length)html+=g.map(function(t){return row(t,hit)}).join('');
        else html+='<tr><td colspan="4" class="muted">'+(sc?'Nothing from Episode '+ep+' is in the reports logged so far.':'No script for Episode '+ep+' in the Scripts folder yet, and nothing logged. Name the file like EPISODE '+ep+'.pdf and it appears within 30 minutes, or use Check Drive now.')+'</td></tr>';
      }
    });
    return html+'</tbody></table></div>';
  }

  function sceneListText(list){
    return list.slice().sort(function(x,y){return cmpKey(keyOf(x.ep,x.sc),keyOf(y.ep,y.sc))}).map(function(s){
      return '<span class="mono">'+esc(keyOf(s.ep,s.sc))+'</span> '+tagsHtml(s.tags)+(s.note?'<span class="muted">('+esc(s.note)+')</span>':'');
    }).join(' &nbsp;·&nbsp; ');
  }

  /* Log sheets are due by the end of the day after the shoot. */
  function logDue(d){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d.iso||'');return m?new Date(+m[1],+m[2]-1,+m[3]+2).getTime():0}
  function logMissing(d){var due=logDue(d);return !d.log&&due&&Date.now()>due}
  function dmy(ms){var x=new Date(ms);return pad(x.getDate())+'.'+pad(x.getMonth()+1)+'.'+x.getFullYear()}
  function renderDays(){
    var kw=locQuery(),days=kw?locHits(kw).reverse():daysAsc().reverse();
    if(kw&&!days.length)return '';
    if(!days.length)return '<div class="tablewrap"><p class="empty">No daily reports logged yet.</p></div>';
    var miss=daysAsc().filter(logMissing);
    var html=(miss.length&&!kw?'<div class="logwarn" role="status"><strong>'+(miss.length===1?'1 day is':miss.length+' days are')+' missing a log sheet:</strong> '+miss.map(function(d){return 'Day '+d.day}).join(', ')
        +'. Upload the PDF named like <span class="mono">Day '+miss[0].day+' '+esc(fmtDate(miss[0].iso).replace(/^0/,'').replace(/\.0/,'.'))+'.pdf</span> to the <a href="'+LOG_FOLDER+'" target="_blank" rel="noopener">log sheets folder \u2197</a>. It links by itself.</div>':'')
      +'<div class="tablewrap"><table class="daytbl"><thead><tr><th>Shoot day</th><th>Location</th><th class="num hide-sm">Scenes</th><th class="num hide-sm">Pages</th><th class="num hide-sm">Call to wrap</th></tr></thead><tbody>';
    days.forEach(function(d){
      var open=ui.openDay===d.day,ents=entriesOf(d);
      html+='<tr class="d" tabindex="0" role="button" aria-expanded="'+open+'" data-day="'+d.day+'"><td class="when"><span class="caret">›</span><strong>'+esc(dayRef(d))+'</strong>'+(logMissing(d)?'<span class="tag nolog">No log sheet</span>':'')+'</td><td class="loc">'+esc(d.location)+'</td><td class="num hide-sm">'+ents.length+'</td><td class="num hide-sm">'+esc(d.pages||'')+'</td><td class="num hide-sm">'+esc(hours(d))+'</td></tr>';
      if(open){
        html+='<tr class="detail"><td colspan="5"><dl class="dl">'
          +(d.location?'<dt>Location</dt><dd>'+esc(d.location)+'</dd>':'')
          +'<dt>Log sheet</dt><dd>'+(logLink(d,'Open Day '+esc(d.day)+' log sheet')||(logMissing(d)?'<span class="bad">Missing. It was due by the end of '+esc(dmy(logDue(d)-864e5))+'.</span> ':'<span class="muted">Waiting for upload. </span>')+'<a class="log" href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Log sheets folder \u2197</a>')+'</dd>'
          +(d.cast?'<dt>Cast</dt><dd>'+esc(d.cast)+'</dd>':'')
          +'<dt>Shot</dt><dd>'+ents.length+' scene'+(ents.length===1?'':'s')+(d.pages?' \u00b7 '+esc(d.pages)+' pages':'')+(hours(d)?' \u00b7 call to wrap '+esc(hours(d)):'')+'</dd>'
          +((d.times&&d.times.length)?'<dt>Times</dt><dd>'+d.times.map(function(t){return esc(t.label)+' <span class="mono">'+esc(t.time)+'</span>'}).join(' · ')+'</dd>':'')
          +'<dt>Scenes</dt><dd>'+sceneListText(ents)+'</dd></dl>'
          +(d.raw?'<details><summary>Original continuity report</summary><pre>'+esc(d.raw)+'</pre></details>':'')
          +'<div class="rowacts">'+(d.raw?'<button type="button" class="btn small" data-act="copy" data-day="'+d.day+'">Copy report</button>':'')
          +(isEditor()?(ui.confirmDel===d.day
              ?'<span class="confirm">Remove Day '+d.day+' from the tracker?</span><button type="button" class="btn small danger" data-act="del-yes" data-day="'+d.day+'"'+(ui.busy?' disabled':'')+'>Remove</button><button type="button" class="btn small" data-act="del-no">Keep</button>'
              :'<button type="button" class="btn small" data-act="replace" data-day="'+d.day+'">Edit report</button><button type="button" class="btn small" data-act="del" data-day="'+d.day+'">Remove day</button>'):'')
          +'</div></td></tr>';
      }
    });
    return html+'</tbody></table></div>';
  }


  /* ---------- post production (passcode only) ---------- */
  var WD=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var WHY={Length:'Episode too long',Performance:'Performance',Other:'Other'};
  function isoParts(iso){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?[+m[1],+m[2],+m[3]]:null}
  function isoAdd(iso,n){var p=isoParts(iso);if(!p)return '';var d=new Date(Date.UTC(p[0],p[1]-1,p[2]+n));return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  function weekday(iso){var p=isoParts(iso);return p?WD[new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()]:''}
  function todayIso(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  /* Episode 1 goes out on the TX date; every episode after it exactly one week later. */
  /* Episode 1 airs on the TX date. Each episode after it airs one week after the one before,
     plus any days it was moved by (a skipped week is +7). Moving one episode moves all after it. */
  function shiftOf(n){var x=(post.eps[n]||{}).shift;return n>1&&x?+x:0}
  function txOf(n){if(!post.tx)return '';var d=post.tx;for(var i=2;i<=n;i++)d=isoAdd(d,7+shiftOf(i));return d}
  function dayDiff(a,b){var p=isoParts(a),q=isoParts(b);return Math.round((Date.UTC(q[0],q[1]-1,q[2])-Date.UTC(p[0],p[1]-1,p[2]))/864e5)}
  function shiftLabel(x){if(x>0&&x%7===0)return (x/7)+' week break before';return x>0?x+' days later':(-x)+' days early'}
  function movedCount(){var c=0;for(var n=2;n<=EPISODES;n++)if(shiftOf(n))c++;return c}
  function nextEp(){if(!post.tx)return 0;var t=todayIso();for(var n=1;n<=EPISODES;n++)if(txOf(n)>=t)return n;return EPISODES+1}
  /* The episode on air now: its TX date has come and the next episode's has not. */
  function airingEp(){
    if(!post.tx)return 0;var t=todayIso(),cur=0;
    for(var n=1;n<=EPISODES;n++){if(txOf(n)<=t)cur=n;else break}
    if(!cur)return 0;
    var after=cur<EPISODES?txOf(cur+1):isoAdd(txOf(cur),7);
    return t<after?cur:0;
  }
  /* The next episode to air after today. */
  function upNextEp(){if(!post.tx)return 0;var t=todayIso();for(var n=1;n<=EPISODES;n++)if(txOf(n)>t)return n;return 0}
  function curSeason(){return ui.season}
  function txHtml(iso){return iso?'<span class="txdate"><span class="wd">'+esc(weekday(iso).slice(0,3))+'</span> '+esc(fmtDate(iso))+'</span>':'<span class="tbc">TBC</span>'}
  function trailerUrl(u){return /^https:\/\/[^\s"'<>]+$/.test(u||'')?u:''}

  function renderPost(){
    if(!isEditor())return '';
    if(!post.loaded){
      if(post.err)return '<div class="tablewrap"><p class="empty">'+esc(postErrText(post.err))+'</p></div>';
      return '<div class="tablewrap"><p class="empty">Loading post production…</p></div>';
    }
    var s=curSeason(),a=(s-1)*PER_SEASON+1,b=s*PER_SEASON,t=todayIso(),air=airingEp(),nx=upNextEp();
    if(post.openEp==null)post.openEp=air||nx||0;
    var html='<div class="txbar"><div class="txfld"><label for="tx">Episode 1 TX</label><input id="tx" type="date" value="'+esc(post.tx)+'"></div>'
      +'<button type="button" class="btn small exportbtn" data-act="export"><span aria-hidden="true">\u2913</span> Export</button>'
      +'<p class="muted">'+(post.tx?'One episode a week, every '+esc(weekday(post.tx))+(movedCount()?', with '+movedCount()+' episode'+(movedCount()===1?'':'s')+' moved':'')+'. Episode 52 airs '+esc(weekday(txOf(EPISODES)).slice(0,3)+' '+fmtDate(txOf(EPISODES)))+'.'
        :'Not confirmed by the broadcaster yet. Set it here and all 52 dates fill in, one week apart.')+'</p>'
      +(air||nx?'<button type="button" class="onairnow" data-act="goto-air"><span class="st onair">'+(air?(txOf(air)===t?'On air today':'On air'):'Airs next')+'</span> Episode '+(air||nx)+' \u00b7 '+esc(weekday(txOf(air||nx)).slice(0,3)+' '+fmtDate(txOf(air||nx)))+(air&&nx?'<span class="muted"> \u00b7 next: Episode '+nx+', '+esc(fmtDate(txOf(nx)))+'</span>':'')+'</button>':'')
      +'<p class="savestate" id="savestate" role="status">'+saveStateHtml()+'</p></div>';
    if(post.err)html+='<p class="sync err">'+esc(postErrText(post.err))+'</p>';
    for(var q0=1;q0<s;q0++)html+=seasonFold(q0);
    html+='<div class="tablewrap seasonopen"><div class="seasonhead"><b>Season '+s+'</b><span class="muted">Episodes '+a+' to '+b+(post.tx?' · '+esc(fmtDate(txOf(a)))+' to '+esc(fmtDate(txOf(b))):'')+'</span></div><table class="posttbl">'
      +'<thead><tr><th>Ep</th><th>Editor</th><th>Sound</th><th>TX</th><th>Trailer</th><th>Dropped</th></tr></thead><tbody>';
    for(var n=a;n<=b;n++){
      var e=post.eps[n]||{},tx=txOf(n),drop=e.dropped||[],open=post.openDrop===n,mv=post.openMove===n,sh=shiftOf(n),tl=trailerUrl(e.trailer);
      var st=n===air?'<span class="st onair">'+(tx===t?'On air today':'On air')+'</span>':(tx?(tx<t?'<span class="st aired">Aired</span>':(n===nx?'<span class="st next">Next</span>':'')):'');
      var exp=post.openEp===n,ed0=pendingOr(n,'editor',e.editor),sd0=pendingOr(n,'sound',e.sound);
      var sum=[ed0?'Editor: '+esc(ed0):'No editor yet',sd0?'Sound: '+esc(sd0):'No sound yet'].concat(drop.length?[drop.length+' dropped']:[]).concat(trailerUrl(pendingOr(n,'trailer',e.trailer))?['Trailer \u2713']:[]).join(' \u00b7 ');
      html+='<tr class="pe'+(open?' open':'')+(exp?' expanded':' collapsed')+(n===air?' airing':'')+(n===nx?' nextup':'')+(tx&&tx<t&&n!==air?' past':'')+'" id="pe'+n+'">'
        +'<td class="epn"><button type="button" class="pexp" data-pexp="'+n+'" aria-expanded="'+exp+'"><b>'+n+'</b>'+st+'</button></td>'
        +'<td class="sum"><button type="button" class="pexp sumbtn" data-pexp="'+n+'" aria-expanded="'+exp+'"><span>'+sum+'</span><span class="chev" aria-hidden="true">\u203A</span></button></td>'
        +'<td data-l="Editor">'+cellInput(n,'editor',e.editor,'Who is editing')+'</td>'
        +'<td data-l="Sound">'+cellInput(n,'sound',e.sound,'Who is on sound')+'</td>'
        +'<td class="txd" data-l="TX"><div class="txcell">'+(tx&&n>1?'<button type="button" class="datebtn" data-move="'+n+'" title="Move this episode\u2019s TX date" aria-label="'+esc(weekday(tx)+' '+fmtDate(tx))+', move Episode '+n+' TX">'+txHtml(tx)+'</button>':txHtml(tx))+(tx&&n>1?'<button type="button" class="movebtn'+(sh?' moved':'')+'" data-move="'+n+'" aria-expanded="'+mv+'" title="Move this episode\u2019s TX date">'+(sh?esc(shiftLabel(sh)):'Move')+'</button>':'')+'</div></td>'
        +'<td data-l="Trailer" class="trl"><div class="trlwrap">'+cellInput(n,'trailer',e.trailer,'Paste link')+(tl?'<a class="go" href="'+esc(tl)+'" target="_blank" rel="noopener" aria-label="Open Episode '+n+' trailer">↗</a>':'')+'</div></td>'
        +'<td data-l="Dropped" class="drp"><button type="button" class="dropbtn'+(drop.length?' has':'')+'" data-drop="'+n+'" aria-expanded="'+open+'"><span class="dlbl">Dropped scenes</span><span>'+(drop.length?drop.length+' dropped':'None')+'</span><span class="chev" aria-hidden="true">›</span></button></td></tr>';
      if(open)html+='<tr class="dropdet"><td colspan="6">'+dropPanel(n,drop)+'</td></tr>';
      if(mv&&tx)html+='<tr class="dropdet movedet"><td colspan="6">'+movePanel(n)+'</td></tr>';
    }
    html+='</tbody></table>'+seasonCrewHtml(s)+'</div>';
    for(var q1=s+1;q1<=SEASONS;q1++)html+=seasonFold(q1);
    return html;
  }
  /* A closed season in Post production: one line with its dates and how much is assigned. Tap to open it. */
  function seasonFold(q){
    var eps=seasonEps(q),a=eps[0],b=eps[eps.length-1];
    var ed=eps.filter(function(m){return peopleIn(pendingOr(m,'editor',(post.eps[m]||{}).editor)).length}).length;
    var sd=eps.filter(function(m){return peopleIn(pendingOr(m,'sound',(post.eps[m]||{}).sound)).length}).length;
    var air=airingEp(),nx=upNextEp(),hasAir=(air&&seasonOf(air)===q)||(!air&&nx&&seasonOf(nx)===q);
    return '<div class="tablewrap seasonfold"><button type="button" class="foldbtn" data-season="'+q+'" aria-expanded="false">'
      +'<span class="fh"><b>Season '+q+'</b>'+(hasAir?'<span class="st onair">'+(air?'On air':'Airs next')+'</span>':'')+'</span>'
      +'<span class="fm muted">Episodes '+a+' to '+b+(post.tx?' \u00b7 '+esc(fmtDate(txOf(a)))+' to '+esc(fmtDate(txOf(b))):'')+'</span>'
      +'<span class="fa"><span class="'+(ed===eps.length?'ok':'')+'">Editors '+ed+'/'+eps.length+'</span><span class="'+(sd===eps.length?'ok':'')+'">Sound '+sd+'/'+eps.length+'</span></span>'
      +'<span class="chev" aria-hidden="true">\u203A</span></button></div>';
  }
  /* Who edits and who does sound in this season, with each person's episodes. */
  function seasonCrewHtml(s){
    var eps=seasonEps(s);
    function block(label,field){
      var list=crewFor(field).map(function(p){return {name:p.name,eps:p.eps.filter(function(m){return seasonOf(m)===s})}}).filter(function(p){return p.eps.length})
        .sort(function(x,y){return y.eps.length-x.eps.length||x.name.localeCompare(y.name)});
      var none=eps.filter(function(m){return !peopleIn(pendingOr(m,field,(post.eps[m]||{})[field])).length});
      return '<div class="crewcol"><h3>'+label+'</h3>'
        +(list.length?'<ul class="crewlist">'+list.map(function(p){return '<li><span class="cn">'+esc(p.name)+'</span><span class="cc">'+p.eps.length+' ep'+(p.eps.length===1?'':'s')+'</span><span class="ce muted">'+esc(epList(p.eps))+'</span></li>'}).join('')+'</ul>':'<p class="muted">Nobody assigned yet.</p>')
        +(none.length?'<p class="crewnone">Not assigned: '+esc(epList(none))+'</p>':'<p class="crewall">Every episode assigned \u2713</p>')+'</div>';
    }
    return '<section class="crew"><div class="crewhead"><b>Season '+s+' crew</b><span class="muted">Episodes per person this season. Export for all four seasons side by side.</span></div>'
      +'<div class="crewgrid">'+block('Editors','editor')+block('Sound','sound')+'</div></section>';
  }
  function cellInput(n,f,v,ph){
    var k=n+':'+f,fl=post.flash&&post.flash[k]||'';
    if(pending[k]!=null){v=pending[k];fl=(fl?fl+' ':'')+'unsaved'}
    return '<input class="cell'+(fl?' '+fl:'')+'" '+(f==='trailer'?'type="url" inputmode="url" ':'type="text" ')+'data-pep="'+n+'" data-pf="'+f+'" value="'+esc(v||'')+'" placeholder="'+ph+'" maxlength="'+(f==='trailer'?500:80)+'" autocomplete="off" aria-label="Episode '+n+' '+f+'">';
  }
  function movePanel(n){
    var prev=txOf(n-1),normal=isoAdd(prev,7),cur=txOf(n),sh=shiftOf(n),wk=function(i){return weekday(i).slice(0,3)+' '+fmtDate(i)};
    return '<div class="drophead"><b>Move Episode '+n+' TX</b><span class="muted">For a skipped week, a holiday or a special. Episode '+(n<EPISODES?(n+1)+(n+1<EPISODES?' to '+EPISODES:''):n)+(n<EPISODES?' move with it, still one week apart.':' is the last episode.')+'</span></div>'
      +'<p class="movenote">Normally '+esc(wk(normal))+', one week after Episode '+(n-1)+' ('+esc(wk(prev))+').'+(sh?' <b>Now '+esc(wk(cur))+'.</b>':'')+'</p>'
      +'<div class="moverow"><button type="button" class="btn small primary" data-skip="'+n+'">Skip a week</button>'
      +'<label class="mvfld">or pick a date<input type="date" data-pep="'+n+'" data-pf="mv" value="'+esc(cur)+'" min="'+esc(isoAdd(prev,1))+'"></label>'
      +(sh?'<button type="button" class="btn small" data-unmove="'+n+'">Back to normal</button>':'')+'</div>';
  }
  function moveTo(n,iso){
    var prev=txOf(n-1);
    if(!isoParts(iso)||iso<=prev){toast('Episode '+n+' has to air after Episode '+(n-1)+' ('+fmtDate(prev)+').');renderPostKeep();return}
    var sh=dayDiff(prev,iso)-7;
    if(sh===shiftOf(n))return;
    savePost({ep:n,set:{shift:sh}},'').then(function(r){if(r&&r.ok)toast(sh?'Episode '+n+' now airs '+weekday(iso).slice(0,3)+' '+fmtDate(iso)+(n<EPISODES?'. Later episodes moved with it.':'.'):'Episode '+n+' is back on the normal week.')});
  }
  function dropPanel(n,drop){
    var list=drop.slice().sort(function(x,y){return cmpKey(n+'/'+x.sc,n+'/'+y.sc)});
    return '<div class="drophead"><b>Dropped from Episode '+n+'</b><span class="muted">Shot, but not in the final episode.</span></div>'
      +(list.length?'<ul class="droplist">'+list.map(function(d){
          return '<li><span class="mono">'+esc(n+'/'+d.sc)+'</span><span class="why '+esc(d.why)+'">'+esc(WHY[d.why]||d.why)+'</span>'+(d.note?'<span class="muted note">'+esc(d.note)+'</span>':'')
            +'<button type="button" class="rm" data-dropdel="'+esc(d.sc)+'" data-pep="'+n+'" aria-label="Remove '+esc(n+'/'+d.sc)+'">✕</button></li>'}).join('')+'</ul>'
        :'<p class="muted nodrop">No dropped scenes yet.</p>')
      +'<form class="dropadd" data-pep="'+n+'"><input name="sc" class="mono" placeholder="Scene" maxlength="4" autocomplete="off" aria-label="Scene number" required>'
      +'<select name="why" aria-label="Reason"><option value="Length">Episode too long</option><option value="Performance">Performance</option><option value="Other">Other</option></select>'
      +'<input name="note" placeholder="Note (optional)" maxlength="200" autocomplete="off" aria-label="Note">'
      +'<button type="submit" class="btn small primary">Add</button></form>';
  }
  function postErrText(code){
    if(code==='old'||code==='old_robot')return ERR.old_robot;
    return ERR[code]||ERR.server;
  }
  function cachePost(){try{localStorage.setItem('njw-post',JSON.stringify({tx:post.tx,eps:post.eps,at:post.at}))}catch(e){}}
  /* Redraw without losing what someone is typing, or where the cursor is. */
  /* ---------- post production: nothing typed is ever lost ----------
     Every keystroke in Editor, Sound or Trailer is kept on this device until Google confirms
     it, saved about a second after typing stops, and sent again after a reload, a sign-out
     or a lost signal. */
  var pending={};try{pending=JSON.parse(localStorage.getItem('njw-pending')||'{}')||{}}catch(e){pending={}}
  var inflight={},saveTimers={};
  function savePending(){try{if(Object.keys(pending).length)localStorage.setItem('njw-pending',JSON.stringify(pending));else localStorage.removeItem('njw-pending')}catch(e){}}
  function pendingOr(n,f,v){var k=n+':'+f;return pending[k]!=null?pending[k]:(v||'')}
  function serverVal(n,f){return ((post.eps[n]||{})[f])||''}
  function cleanVal(f,v){v=String(v==null?'':v).trim();if(f==='trailer'&&v&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(v))v='https://'+v;return v}
  function cellEl(k){var p=k.split(':');return document.querySelector('input.cell[data-pep="'+p[0]+'"][data-pf="'+p[1]+'"]')}
  function markCell(k,cls){var el=cellEl(k);if(!el)return;el.classList.remove('saving','saved','bad','unsaved');if(cls)el.classList.add(cls)}
  function saveStateHtml(){
    var n=Object.keys(pending).length,busy=Object.keys(inflight).length||post.saving;
    if(busy)return '<span class="ss busy">Saving\u2026</span>';
    if(!n)return post.at?'<span class="ss ok">\u2713 All changes saved</span>':'';
    return '<span class="ss warn">'+n+' change'+(n===1?'':'s')+' not saved to Google yet. '+(navigator.onLine?'Kept on this device.':'No signal: kept on this device and sent when you are back online.')+'</span> <button type="button" class="linkbtn" data-act="retry-save">Save now</button>';
  }
  function renderSaveState(){var el=document.getElementById('savestate');if(el)el.innerHTML=saveStateHtml()}
  function onCellInput(el){
    var k=el.dataset.pep+':'+el.dataset.pf;
    pending[k]=el.value;savePending();markCell(k,'unsaved');
    clearTimeout(saveTimers[k]);saveTimers[k]=setTimeout(function(){flushKey(k)},1200);
    renderSaveState();
  }
  function flushKey(k){
    clearTimeout(saveTimers[k]);
    if(pending[k]==null)return;
    if(!isEditor()||!post.loaded||!navigator.onLine){renderSaveState();return}
    if(inflight[k]){inflight[k]=2;return}
    var p=k.split(':'),n=+p[0],f=p[1],v=cleanVal(f,pending[k]);
    if(f==='trailer'&&v&&!trailerUrl(v)){markCell(k,'bad');toast(ERR.bad_link_any);return}
    if(v===serverVal(n,f)){delete pending[k];savePending();markCell(k,'');renderSaveState();return}
    inflight[k]=1;var set={};set[f]=v;markCell(k,'saving');renderSaveState();
    savePost({ep:n,set:set},k).then(function(r){
      var again=inflight[k]===2;delete inflight[k];
      if(r&&r.ok&&pending[k]!=null&&cleanVal(f,pending[k])===serverVal(n,f)){delete pending[k];savePending();markCell(k,'saved')}
      else if(pending[k]!=null)markCell(k,r&&r.ok?'unsaved':'bad');
      renderSaveState();
      if(again&&pending[k]!=null)flushKey(k);
    });
  }
  function flushAll(){Object.keys(pending).forEach(flushKey)}
  /* Closing the app or switching away: send what is waiting, without waiting for an answer. */
  function flushOnLeave(){
    if(!isEditor()||!navigator.onLine)return;
    Object.keys(pending).forEach(function(k){
      if(inflight[k])return;var p=k.split(':'),set={};set[p[1]]=cleanVal(p[1],pending[k]);
      if(p[1]==='trailer'&&set.trailer&&!trailerUrl(set.trailer))return;
      try{fetch(SCRIPT_URL,{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'postSave',token:auth.token,ep:+p[0],set:set})})}catch(e){}
    });
  }
  function typingInPost(){var a=document.activeElement;return !!(a&&a.matches&&a.matches('input.cell')&&document.getElementById('main').contains(a))}

  function renderPostKeep(clearForm,force){
    if(ui.view!=='post')return;
    /* Never redraw under someone's fingers: wait until they leave the box. */
    if(!force&&typingInPost()){post.deferRender=true;return}
    post.deferRender=false;
    var main=document.getElementById('main'),keep={},act=document.activeElement,fk='',sel=null;
    function keyOf2(el){if(el.dataset&&el.dataset.pf)return el.dataset.pep+':'+el.dataset.pf;var fm=el.closest&&el.closest('form.dropadd');return fm?'d'+fm.dataset.pep+':'+el.name:''}
    main.querySelectorAll('input,select').forEach(function(el){var k=keyOf2(el);if(k&&(el.value!==el.defaultValue||el===act||el.tagName==='SELECT'))keep[k]=el.value});
    if(act&&main.contains(act)){fk=keyOf2(act);try{sel=[act.selectionStart,act.selectionEnd]}catch(e){}}
    if(clearForm)Object.keys(keep).forEach(function(k){if(k.indexOf('d'+clearForm+':')===0)delete keep[k]});
    /* Replacing a box someone is typing in makes the browser fire "change" on it; ignore that. */
    post.redrawing=true;try{main.innerHTML=renderPost()}finally{post.redrawing=false}
    main.querySelectorAll('input,select').forEach(function(el){var k=keyOf2(el);if(k&&keep[k]!=null)el.value=keep[k];if(k&&k===fk){el.focus();if(sel&&sel[0]!=null)try{el.setSelectionRange(sel[0],sel[1])}catch(e){}}});
    if(clearForm){var f=main.querySelector('form.dropadd [name="sc"]');if(f)f.focus()}
  }
  function applyPost(r){post.tx=r.tx||'';post.eps=r.eps||{};post.loaded=true;post.err='';post.at=Date.now();cachePost()}
  /* quiet: the 30-second background refresh, which must not keep a sign-in alive. */
  function loadPost(quiet){
    if(!isEditor()||post.loading)return;
    post.loading=true;var ver=post.ver||0;
    callScript({action:'post'},quiet).then(function(r){
      post.loading=false;
      if(!isEditor()){renderAll();return}
      if((post.ver||0)!==ver)return;            /* a save finished meanwhile; its answer is newer */
      if(r.ok)applyPost(r);else if(r.error!=='network'||!post.loaded)post.err=r.error==='bad_request'?'old':r.error;
      renderPostKeep();
      if(r.ok)flushAll();
    });
  }
  function savePost(body,key,clearForm){
    post.ver=(post.ver||0)+1;post.saving=(post.saving||0)+1;
    body.action='postSave';
    return callScript(body).then(function(r){
      post.saving--;
      if(!isEditor()){renderAll();return r}
      post.flash={};
      if(r.ok)applyPost(r);
      else if(r.error!=='signed_out')toast(r.error==='bad_request'?postErrText('old'):(r.error==='network'?'No signal. Your change is kept on this device and sent when you are back online.':errText(r)));
      renderPostKeep(r.ok?clearForm:0);
      if(key&&r.ok&&pending[key]==null)setTimeout(function(){var el=cellEl(key);if(el)el.classList.remove('saved')},2200);
      return r;
    });
  }
  function onPostChange(el){
    if(post.redrawing||!el.isConnected)return;
    if(el.id==='tx'){savePost({tx:el.value||''},'');return}
    if(el.dataset.pf==='mv'){if(el.value)moveTo(+el.dataset.pep,el.value);return}
    if(!el.matches('input.cell'))return;
    if(pending[el.dataset.pep+':'+el.dataset.pf]!=null){flushKey(el.dataset.pep+':'+el.dataset.pf);return}
    var n=+el.dataset.pep,f=el.dataset.pf,v=el.value.trim();
    if(f==='trailer'&&v&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)){v='https://'+v;el.value=v}
    if(f==='trailer'&&v&&!trailerUrl(v)){el.classList.add('bad');toast(ERR.bad_link_any);return}
    var cur=(post.eps[n]||{})[f]||'';if(v===cur){el.classList.remove('bad');return}
    var set={};set[f]=v;el.classList.add('saving');
    savePost({ep:n,set:set},n+':'+f);
  }
  function onDropAdd(form){
    var n=+form.dataset.pep,sc=normSc(form.sc.value.trim()),why=form.why.value,note=form.note.value.trim();
    if(!/^\d{1,3}[A-Z]?$/.test(sc)){toast(ERR.bad_scene);form.sc.focus();return}
    var L=sceneList(n),warn=L.length&&L.indexOf(scParts(sc)[0])<0;
    var btn=form.querySelector('button');btn.disabled=true;btn.textContent='Adding…';
    savePost({ep:n,set:{dropAdd:{sc:sc,why:why,note:note}}},'',n).then(function(r){
      if(r&&r.ok)toast(warn?'Added. Note: scene '+sc+' is not in the Episode '+n+' script.':n+'/'+sc+' added to dropped scenes');
      var b2=document.querySelector('form.dropadd button');if(b2){b2.disabled=false;b2.textContent='Add'}
    });
  }

  /* ---------- repeated scenes: reshoot or duplicate ---------- */
  function repeatList(){
    var pending=[],decided=[];
    daysAsc().forEach(function(d){(d.shot||[]).forEach(function(x){
      if(!x.firstDay)return;
      var it={key:keyOf(x.ep,x.sc),day:d,first:dayByNum(x.firstDay),note:x.note,decided:x.decided};
      if(x.tags.indexOf('Check')>=0)pending.push(it);else if(x.decided&&x.decided.decision!=='Continued')decided.push(it);   // Continued: shown only on the episode's scene line
    })});
    return {pending:pending,decided:decided};
  }
  /* Not sure? Open either day's report to fix a wrong scene number. */
  function editBtns(it){
    return '<span class="rpedit"><span class="muted">Edit report:</span>'
      +(it.first?'<button type="button" class="btn small" data-act="edit-day" data-day="'+it.first.day+'">Day '+it.first.day+'</button>':'')
      +'<button type="button" class="btn small" data-act="edit-day" data-day="'+it.day.day+'">Day '+it.day.day+'</button></span>';
  }
  function renderRepeats(){
    if(ui.view!=='scenes'&&ui.view!=='days')return '';
    var r=repeatList();if(!r.pending.length&&!r.decided.length)return '';
    var ed=isEditor(),html='<section class="repeats'+(r.pending.length?' pending':'')+'" aria-label="Repeated scenes">';
    if(r.pending.length){
      html+='<div class="rphead"><b>'+r.pending.length+' repeated scene'+(r.pending.length===1?'':'s')+' to check</b>'
        +'<span>Logged on two days. <b>Reshoot</b>: shot again on purpose. <b>Duplicate</b>: logged twice by mistake, only the first day counts. <b>Continued</b>: the same scene finished on another day, like a phone-call voice over. Not sure, or a wrong scene number? <b>Edit</b> the report.</span></div><ul class="rplist">'
        +r.pending.map(function(it){
          return '<li><div class="rpwhat"><span class="mono rpsc">'+esc(it.key)+'</span><span>First on <b>'+esc(it.first?dayRef(it.first):'an earlier day')+'</b>, again on <b>'+esc(dayRef(it.day))+'</b>'+(it.note?' <span class="muted">('+esc(it.note)+')</span>':'')+'</span></div>'
            +(ed?'<div class="rpacts"><button type="button" class="btn small rpre" data-decide="Reshoot" data-scene="'+esc(it.key)+'" data-day="'+it.day.day+'">Reshoot</button><button type="button" class="btn small rpdup" data-decide="Duplicate" data-scene="'+esc(it.key)+'" data-day="'+it.day.day+'">Duplicate</button>'+'<button type="button" class="btn small rpcont" data-decide="Continued" data-scene="'+esc(it.key)+'" data-day="'+it.day.day+'">Continued</button>'+editBtns(it)+'</div>'
              :'<span class="muted rpsign">Sign in to decide</span>')+'</li>';
        }).join('')+'</ul>';
    }
    if(r.decided.length){
      html+='<button type="button" class="linkbtn rptoggle" data-act="show-decided" aria-expanded="'+!!ui.showDecided+'">'+(ui.showDecided?'Hide':'Show')+' '+r.decided.length+' decided repeat'+(r.decided.length===1?'':'s')+'</button>';
      if(ui.showDecided)html+='<ul class="rplist decided">'+r.decided.map(function(it){
        return '<li><div class="rpwhat"><span class="mono rpsc">'+esc(it.key)+'</span><span>Day '+it.day.day+(it.first?' (first on Day '+it.first.day+')':'')+'</span>'+tagsHtml([it.decided.decision])+'<span class="muted">'+esc(it.decided.by)+(it.decided.when?', '+esc(it.decided.when):'')+'</span></div>'
          +(ed?'<div class="rpacts"><button type="button" class="btn small" data-decide="" data-scene="'+esc(it.key)+'" data-day="'+it.day.day+'">Undo</button>'+editBtns(it)+'</div>':'')+'</li>';
      }).join('')+'</ul>';
    }
    return html+'</section>';
  }
  /* The day's report with "continued" written on the scene's line. A line that also lists other
     scenes keeps them, and the scene moves to its own line just below. */
  function reportWithContinued(raw,scene){
    var p=parseReport(raw),hit=p.shot.filter(function(s){return keyOf(s.ep,s.sc)===scene})[0];
    if(!hit||hit.line==null)return '';
    var lines=raw.split(/\r?\n/),line=lines[hit.line],re=/(?:^|[^\d\/])(\d{1,3})\s*\/\s*(\d{1,3}[A-Za-z]?)(?![\d\/A-Za-z])/g,m,n=0;
    while((m=re.exec(line)))n++;
    if(n<=1)lines[hit.line]=line.replace(/\s+$/,'')+' continued';
    else{
      var rm=new RegExp('(^|[^\\d\\/])'+hit.ep+'\\s*\\/\\s*0*'+hit.sc.replace(/[^0-9A-Za-z]/g,'')+'(?![\\d\\/A-Za-z])','i');
      lines[hit.line]=line.replace(rm,'$1').replace(/\s*[,;&]\s*(?=[,;&]|$)/g,'').replace(/^\s*[,;&]\s*/,'').replace(/\s{2,}/g,' ');
      lines.splice(hit.line+1,0,scene+' continued');
    }
    return lines.join('\n');
  }
  /* Continued on a robot older than version 9 (or one that did not keep the choice):
     the app writes "continued" into that day's report, which every version understands. */
  function continuedViaReport(scene,day){
    var d=dayByNum(+day),txt=d&&reportWithContinued(d.raw,scene);
    if(!txt){toast('Could not find '+scene+' in the Day '+day+' report. Edit the report and add the word continued to that line.');return}
    toast('Marking '+scene+' on Day '+day+' as continued\u2026');
    callScript({action:'save',report:txt,log:'',originalDay:+day}).then(function(r){
      if(!r.ok){toast(errText(r));return}
      if(!applyServerRows(r))refresh();
      toast(scene+' on Day '+day+' marked Continued');
    });
  }
  function decideRepeat(scene,day,decision){
    if(!isEditor()){openLogin();return}
    if(decision==='Continued'&&ui.robot&&ui.robot<9){continuedViaReport(scene,day);return}
    var k=scene+'@'+day,before=state.repeats[k];
    if(decision)state.repeats[k]={decision:decision,by:auth.name,when:'now'};else delete state.repeats[k];
    state.days=buildDays(state.rows,[]);renderMain();
    callScript({action:'decide',scene:scene,day:day,decision:decision}).then(function(r){
      if(!r.ok){
        if(before)state.repeats[k]=before;else delete state.repeats[k];state.days=buildDays(state.rows,[]);renderMain();
        if(decision==='Continued'&&r.error==='bad_request'){continuedViaReport(scene,day);return}
        toast(errText(r));return;
      }
      applyServerRows(r);
      /* An older robot answers ok but drops a choice it does not know. */
      if(decision==='Continued'&&!(state.repeats[k]&&state.repeats[k].decision==='Continued')){continuedViaReport(scene,day);return}
      toast(decision?scene+' on Day '+day+' marked '+decision:'Decision undone for '+scene+' on Day '+day);
    });
  }
  function checkDrive(){
    if(!isEditor()){openLogin();return}
    toast('Checking Drive for new log sheets and scripts. This can take a minute.');
    callScript({action:'drive'}).then(function(r){
      if(!r.ok){toast(errText(r));return}
      applyServerRows(r);
      toast('Drive checked: '+(r.logs||0)+' log sheet'+(r.logs===1?'':'s')+' attached, '+(r.scripts||0)+' episode scripts found');
    });
  }

  /* ---------- post production export (Excel) ---------- */
  function loadXlsx(){
    if(window.ExcelJS)return Promise.resolve(window.ExcelJS);
    return new Promise(function(res,rej){var sc=document.createElement('script');sc.src='vendor/exceljs.min.js';sc.onload=function(){window.ExcelJS?res(window.ExcelJS):rej(new Error('xlsx'))};sc.onerror=function(){rej(new Error('xlsx'))};document.head.appendChild(sc)});
  }
  /* One cell can hold two people: "Wanjiru / Otieno", "Wanjiru & Otieno", "Wanjiru, Otieno", "Wanjiru and Otieno". */
  function peopleIn(v){return String(v||'').split(/\s*(?:[,\/&+;]|\band\b)\s*/i).map(function(x){return x.replace(/\s+/g,' ').trim()}).filter(Boolean)}
  /* Who did which episodes, for one role. Names are grouped ignoring capitals and extra spaces. */
  function crewFor(field){
    var by={},order=[];
    for(var n=1;n<=EPISODES;n++){
      peopleIn((post.eps[n]||{})[field]).forEach(function(name){
        var k=name.toLowerCase();if(!by[k]){by[k]={name:name,eps:[]};order.push(k)}
        if(by[k].eps.indexOf(n)<0)by[k].eps.push(n);
      });
    }
    return order.map(function(k){return by[k]}).sort(function(a,b){return b.eps.length-a.eps.length||a.name.localeCompare(b.name)});
  }
  function epList(eps){
    var out=[],i=0;
    while(i<eps.length){var j=i;while(j+1<eps.length&&eps[j+1]===eps[j]+1)j++;out.push(j>i+1?eps[i]+' to '+eps[j]:(j===i+1?eps[i]+', '+eps[j]:String(eps[i])));i=j+1}
    return out.join(', ');
  }
  /* The Excel backup, laid out as formatted tables in the tracker's own colours. */
  var XC={forest:'FF13522B',deep:'FF176F38',green:'FF409646',leaf:'FF9FC63B',lime:'FFCEE05C',head:'FFEBF2E0',band:'FFF6F9F1',line:'FFDCE6D2',air:'FFEEF7D3',next:'FFF4F9DC',white:'FFFFFFFF',ink:'FF1F2A20',muted:'FF5E6B5E',grey:'FFF0F1EE',red:'FFC11F26',redbg:'FFFBE9EA'};
  function epStatus(n,air,nx){var tx=txOf(n),t=todayIso();if(!tx)return 'TBC';if(n===air)return tx===t?'Airs today':'On air';if(n===nx)return 'Next';return tx<t?'Aired':'Upcoming'}
  function buildPostWorkbook(ExcelJS){
    var wb=new ExcelJS.Workbook(),t=todayIso(),air=airingEp(),nx=upNextEp(),C=XC;
    wb.creator='Njoro wa Uba Scene Tracker';wb.created=new Date();
    function fill(c){return {type:'pattern',pattern:'solid',fgColor:{argb:c}}}
    function font(o){var f={name:'Arial',size:10,color:{argb:C.ink}};for(var k in o)f[k]=o[k];return f}
    var thin={style:'thin',color:{argb:C.line}};
    function grid(cell){cell.border={top:thin,left:thin,bottom:thin,right:thin}}
    function xdate(iso){var p=isoParts(iso);return p?new Date(Date.UTC(p[0],p[1]-1,p[2])):null}
    function sheet(name,widths,landscape){
      var ws=wb.addWorksheet(name,{properties:{tabColor:{argb:C.deep}},pageSetup:{paperSize:9,orientation:landscape?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.3,footer:0.3}},headerFooter:{oddFooter:'&L&8Njoro wa Uba post production&R&8Page &P of &N'}});
      widths.forEach(function(w,i){ws.getColumn(i+1).width=w});
      ws.views=[{showGridLines:false}];
      return ws;
    }
    /* Title band and the line under it */
    function title(ws,cols,text,sub){
      ws.mergeCells(1,1,1,cols);ws.mergeCells(2,1,2,cols);
      var a=ws.getCell(1,1);a.value=text;a.font=font({size:16,bold:true,color:{argb:C.white}});a.fill=fill(C.forest);a.alignment={vertical:'middle',indent:1};
      var b=ws.getCell(2,1);b.value=sub;b.font=font({size:10,bold:true,color:{argb:C.lime}});b.fill=fill(C.deep);b.alignment={vertical:'middle',indent:1,wrapText:true};
      ws.getRow(1).height=32;ws.getRow(2).height=22;ws.getRow(3).height=8;
      return 4;
    }
    /* A section heading across the table */
    function band(ws,r,cols,text){
      ws.mergeCells(r,1,r,cols);var c=ws.getCell(r,1);c.value=text;c.font=font({size:12,bold:true,color:{argb:C.white}});c.fill=fill(C.green);c.alignment={vertical:'middle',indent:1};ws.getRow(r).height=22;
      return r+1;
    }
    function header(ws,r,labels,aligns){
      labels.forEach(function(l,i){var c=ws.getCell(r,i+1);c.value=l;c.font=font({bold:true,color:{argb:C.deep}});c.fill=fill(C.head);c.alignment={vertical:'middle',horizontal:(aligns&&aligns[i])||'left',wrapText:true};c.border={top:thin,left:thin,right:thin,bottom:{style:'medium',color:{argb:C.leaf}}}});
      ws.getRow(r).height=20;return r+1;
    }
    /* One table row: banded, bordered, Arial. Numbers centred. */
    function row(ws,r,vals,i,aligns,bg){
      vals.forEach(function(v,j){var c=ws.getCell(r,j+1);c.value=v;c.font=font();c.fill=fill(bg||(i%2?C.band:C.white));c.alignment={vertical:'middle',horizontal:(aligns&&aligns[j])||(typeof v==='number'?'center':'left'),wrapText:true};grid(c)});
      ws.getRow(r).height=18;return r+1;
    }
    function total(ws,r,vals,aligns){
      vals.forEach(function(v,j){var c=ws.getCell(r,j+1);c.value=v;c.font=font({bold:true,color:{argb:C.forest}});c.fill=fill(C.head);c.alignment={vertical:'middle',horizontal:(aligns&&aligns[j])||(typeof v==='number'?'center':'left')};c.border={top:{style:'medium',color:{argb:C.forest}},bottom:thin,left:thin,right:thin}});
      ws.getRow(r).height=20;return r+1;
    }
    /* Status as a coloured label, the same colours as the app */
    function status(c,s){
      var st={'On air':[C.forest,C.lime],'Airs today':[C.forest,C.lime],'Next':[C.lime,C.forest],'Aired':[C.head,C.deep],'Upcoming':[C.white,C.muted],'TBC':[C.grey,C.muted]}[s]||[C.white,C.ink];
      c.value=s;c.fill=fill(st[0]);c.font=font({bold:s!=='Upcoming'&&s!=='TBC',italic:s==='TBC',color:{argb:st[1]}});c.alignment={vertical:'middle',horizontal:'center'};
    }
    function dateCell(c,iso){var d=xdate(iso);if(d){c.value=d;c.numFmt='ddd dd.mm.yyyy'}else{c.value='TBC';c.font=font({italic:true,color:{argb:C.muted}})}c.alignment={vertical:'middle',horizontal:'center'}}
    var editors=crewFor('editor'),sound=crewFor('sound'),aired=0,withEd=0,withSd=0,trailers=0,drops=0,noEd=[],noSd=[];
    for(var n=1;n<=EPISODES;n++){
      var e0=post.eps[n]||{},x=txOf(n);
      if(x&&x<t&&n!==air)aired++;
      if(peopleIn(e0.editor).length)withEd++;else noEd.push(n);
      if(peopleIn(e0.sound).length)withSd++;else noSd.push(n);
      if(trailerUrl(e0.trailer))trailers++;
      drops+=(e0.dropped||[]).length;
    }
    var who=' · exported '+fmtDate(t)+' by '+(auth.name||'Team');
    var txLine=post.tx?'Episode 1 TX '+weekday(post.tx)+' '+fmtDate(post.tx)+(nx?' · next to air: Episode '+nx+', '+weekday(txOf(nx)).slice(0,3)+' '+fmtDate(txOf(nx)):''):'Episode 1 TX not confirmed yet';

    /* 1. Summary */
    var ws=sheet('Summary',[26,12,12,12,34,16,16,10],false),r=title(ws,8,'Njoro wa Uba · Post production',txLine+who);
    [['Episodes with an editor',withEd+' of '+EPISODES],['Episodes with sound',withSd+' of '+EPISODES],['Aired so far',(aired+(air?1:0))+' of '+EPISODES],['Dropped scenes',String(drops)]].forEach(function(k,i){
      var c0=i*2+1;ws.mergeCells(r,c0,r,c0+1);ws.mergeCells(r+1,c0,r+1,c0+1);
      var l=ws.getCell(r,c0),v=ws.getCell(r+1,c0);
      l.value=k[0].toUpperCase();l.font=font({size:8,bold:true,color:{argb:C.muted}});l.fill=fill(C.head);l.alignment={horizontal:'center',vertical:'middle'};
      v.value=k[1];v.font=font({size:18,bold:true,color:{argb:C.forest}});v.fill=fill(C.white);v.alignment={horizontal:'center',vertical:'middle'};
      var side={style:'medium',color:{argb:C.leaf}};
      [l,ws.getCell(r,c0+1)].forEach(function(c){c.border={top:side,left:c===l?side:undefined,right:c===l?undefined:side}});
      [v,ws.getCell(r+1,c0+1)].forEach(function(c){c.border={bottom:side,left:c===v?side:undefined,right:c===v?undefined:side}});
    });
    ws.getRow(r).height=20;ws.getRow(r+1).height=34;r+=3;
    var CREW=['Name','Episodes','Aired','Still to air','Episode numbers','First TX','Last TX','Share'],CA=['left','center','center','center','left','center','center','center'];
    function crewTable(label,list){
      r=band(ws,r,8,label+' ('+list.length+(list.length===1?' person':' people')+')');r=header(ws,r,CREW,CA);
      if(!list.length){ws.mergeCells(r,1,r,8);var c=ws.getCell(r,1);c.value='Nobody assigned yet';c.font=font({italic:true,color:{argb:C.muted}});grid(c);r+=2;return}
      var sumE=0,sumA=0;
      list.forEach(function(p,i){
        var a=p.eps.filter(function(m){var y=txOf(m);return y&&y<t}).length;sumE+=p.eps.length;sumA+=a;
        row(ws,r,[p.name,p.eps.length,a,p.eps.length-a,epList(p.eps),'','',p.eps.length/EPISODES],i,CA);
        ws.getCell(r,1).font=font({bold:true});
        dateCell(ws.getCell(r,6),txOf(p.eps[0]));dateCell(ws.getCell(r,7),txOf(p.eps[p.eps.length-1]));
        ws.getCell(r,8).numFmt='0%';r++;
      });
      r=total(ws,r,['Total',sumE,sumA,sumE-sumA,'','','',sumE/EPISODES],CA);ws.getCell(r-1,8).numFmt='0%';
      r++;
    }
    crewTable('Editors',editors);crewTable('Sound',sound);
    r=band(ws,r,8,'Still to assign');r=header(ws,r,['Role','Episodes','','','Episode numbers','','',''],CA);
    [['No editor yet',noEd],['No sound yet',noSd]].forEach(function(g,i){
      row(ws,r,[g[0],g[1].length,'','',g[1].length?epList(g[1]):'All assigned','','',''],i,CA);
      ws.mergeCells(r,5,r,8);if(g[1].length)ws.getCell(r,2).font=font({bold:true,color:{argb:C.red}});
      ws.getRow(r).height=Math.max(18,15*Math.ceil(epList(g[1]).length/70));r++;
    });

    /* 2. Every episode */
    var EP=['Season','Ep','TX date','Status','TX moved','Editor','Sound','Trailer','Dropped','Dropped scene numbers'],EA=['center','center','center','center','left','left','left','left','center','left'];
    ws=sheet('All episodes',[9,6,17,12,18,22,22,16,10,28],true);r=title(ws,EP.length,'All 52 episodes',txLine+who);
    r=header(ws,r,EP,EA);var head0=r-1;
    for(n=1;n<=EPISODES;n++){
      var e=post.eps[n]||{},tx=txOf(n),sh=shiftOf(n),tl=trailerUrl(e.trailer),dr=(e.dropped||[]).slice().sort(function(p,q){return cmpKey(n+'/'+p.sc,n+'/'+q.sc)});
      var bg=n===air?C.air:(n===nx?C.next:null),s=seasonOf(n);
      row(ws,r,['Season '+s,n,'','',sh?shiftLabel(sh):'',e.editor||'',e.sound||'','',dr.length,dr.map(function(d){return d.sc}).join(', ')],s%2?0:1,EA,bg||(s%2?C.white:C.band));
      dateCell(ws.getCell(r,3),tx);status(ws.getCell(r,4),epStatus(n,air,nx));
      ws.getCell(r,2).font=font({bold:true,color:{argb:C.forest}});
      if(!e.editor)ws.getCell(r,6).font=font({italic:true,color:{argb:C.muted}}),ws.getCell(r,6).value='Not set';
      if(!e.sound)ws.getCell(r,7).font=font({italic:true,color:{argb:C.muted}}),ws.getCell(r,7).value='Not set';
      if(tl){var lc=ws.getCell(r,8);lc.value={text:'Open trailer',hyperlink:tl};lc.font=font({underline:true,color:{argb:C.deep}})}
      ws.getCell(r,9).font=dr.length?font({bold:true,color:{argb:C.red}}):font({color:{argb:C.muted}});
      if(sh)ws.getCell(r,5).font=font({bold:true,color:{argb:C.deep}});
      if(n%PER_SEASON===1&&n>1)for(var j=1;j<=EP.length;j++){var bc=ws.getCell(r,j);bc.border=Object.assign({},bc.border,{top:{style:'medium',color:{argb:C.deep}}})}
      if(bg)for(j=1;j<=EP.length;j++){var hc=ws.getCell(r,j);hc.border=Object.assign({},hc.border,{top:{style:'medium',color:{argb:n===air?C.forest:C.leaf}},bottom:{style:'medium',color:{argb:n===air?C.forest:C.leaf}}})}
      r++;
    }
    /* One merged Season cell per season instead of the same word on 13 rows. */
    for(var sq=1;sq<=SEASONS;sq++){
      var r0=head0+1+(sq-1)*PER_SEASON,r1=r0+PER_SEASON-1;
      ws.mergeCells(r0,1,r1,1);
      var mc=ws.getCell(r0,1);mc.value='Season '+sq;mc.font=font({bold:true,size:11,color:{argb:C.white}});mc.fill=fill(sq%2?C.deep:C.green);
      mc.alignment={vertical:'middle',horizontal:'center',textRotation:90};
      mc.border={top:{style:'medium',color:{argb:C.forest}},bottom:{style:'medium',color:{argb:C.forest}},left:thin,right:thin};
    }
    r=total(ws,r,['Total',EPISODES,aired+(air?1:0)+' aired','',movedCount()+' moved',withEd+' set',withSd+' set',trailers+' trailers',drops,''],EA);
    ws.views=[{state:'frozen',ySplit:head0,showGridLines:false}];
    ws.autoFilter={from:{row:head0,column:2},to:{row:head0+EPISODES,column:EP.length}};
    ws.pageSetup.printTitlesRow=head0+':'+head0;
    r++;ws.mergeCells(r,1,r,EP.length);var key=ws.getCell(r,1);
    key.value='Status: On air = the episode airing this week. Next = the next one to air. Aired, Upcoming, or TBC when the TX date is not set.';key.font=font({size:9,italic:true,color:{argb:C.muted}});

    /* 3. Crew by season: one matrix per role. How many episodes each person has in each
       season, with the episode numbers right under the counts. */
    (function(){
      var cols=SEASONS+3,W=[26].concat(Array(SEASONS).fill(16)).concat([10,30]);
      ws=sheet('Crew by season',W,true);
      r=title(ws,cols,'Editors and sound, season by season','Episodes per person in each season'+who);
      [['Editors',editors,'editor'],['Sound',sound,'sound']].forEach(function(role){
        var list=role[1];
        r=band(ws,r,cols,role[0]+' ('+list.length+(list.length===1?' person':' people')+')');
        var H=['Name'];for(var q=1;q<=SEASONS;q++)H.push('Season '+q+' (Ep '+((q-1)*PER_SEASON+1)+' to '+q*PER_SEASON+')');H.push('Total','All episodes');
        var A=['left'].concat(Array(SEASONS).fill('center')).concat(['center','left']);
        r=header(ws,r,H,A);
        if(!list.length){ws.mergeCells(r,1,r,cols);var c0=ws.getCell(r,1);c0.value='Nobody assigned yet';c0.font=font({italic:true,color:{argb:C.muted}});grid(c0);r+=2;return}
        var colTot=Array(SEASONS).fill(0),all=0;
        list.forEach(function(pp,i){
          var by=[];for(var q=1;q<=SEASONS;q++)by.push(pp.eps.filter(function(m){return seasonOf(m)===q}));
          var vals=[pp.name].concat(by.map(function(x){return x.length?x.length+' ep'+(x.length===1?'':'s')+'\n'+epList(x):''})).concat([pp.eps.length,epList(pp.eps)]);
          row(ws,r,vals,i,A);
          ws.getCell(r,1).font=font({bold:true});
          by.forEach(function(x,q){colTot[q]+=x.length;var c=ws.getCell(r,q+2);if(x.length)c.font=font({color:{argb:C.forest}});else{c.value='–';c.font=font({color:{argb:C.muted}})}});
          ws.getCell(r,SEASONS+2).font=font({bold:true,color:{argb:C.forest}});
          all+=pp.eps.length;
          ws.getRow(r).height=Math.max(30,15*(1+Math.ceil(Math.max.apply(null,by.map(function(x){return epList(x).length}))/16)));r++;
        });
        var unassigned=[];for(var q2=1;q2<=SEASONS;q2++)unassigned.push(seasonEps(q2).filter(function(m){return !peopleIn((post.eps[m]||{})[role[2]]).length}));
        r=row(ws,r,['Not assigned yet'].concat(unassigned.map(function(x){return x.length?x.length+' ep'+(x.length===1?'':'s')+'\n'+epList(x):'All assigned'})).concat(['','']),1,A,C.grey);
        ws.getCell(r-1,1).font=font({italic:true,color:{argb:C.muted}});
        unassigned.forEach(function(x,q){ws.getCell(r-1,q+2).font=font({italic:!x.length,color:{argb:x.length?C.red:C.muted}})});
        ws.getRow(r-1).height=Math.max(30,15*(1+Math.ceil(Math.max.apply(null,unassigned.map(function(x){return epList(x).length}))/16)));
        r=total(ws,r,['Episodes covered'].concat(unassigned.map(function(x){return (PER_SEASON-x.length)+' of '+PER_SEASON})).concat([all+' jobs','']),A);
        r++;
      });
      ws.mergeCells(r,1,r,cols);var nt=ws.getCell(r,1);
      nt.value='An episode with two people (for example "Wanjiru / Otieno") counts once for each of them in their own row.';
      nt.font=font({size:9,italic:true,color:{argb:C.muted}});
    })();

    /* 5. Dropped scenes */
    var DW=['Season','Episode','Scene','Reason','Note'],DA=['center','center','center','left','left'];
    ws=sheet('Dropped scenes',[11,10,10,20,60],true);r=title(ws,5,'Dropped scenes',drops+' scene'+(drops===1?'':'s')+' dropped in the edit'+who);
    r=header(ws,r,DW,DA);var dh=r-1,k=0;
    for(n=1;n<=EPISODES;n++)(post.eps[n]&&post.eps[n].dropped||[]).slice().sort(function(p,q){return cmpKey(n+'/'+p.sc,n+'/'+q.sc)}).forEach(function(d){
      row(ws,r,['Season '+seasonOf(n),n,n+'/'+d.sc,WHY[d.why]||d.why||'',d.note||''],k++,DA);ws.getCell(r,3).font=font({bold:true,color:{argb:C.red}});r++;
    });
    if(!k){ws.mergeCells(r,1,r,5);var nc=ws.getCell(r,1);nc.value='No dropped scenes yet';nc.font=font({italic:true,color:{argb:C.muted}});grid(nc)}
    else{r=total(ws,r,['Total','','',k+' scene'+(k===1?'':'s'),''],DA);ws.autoFilter={from:{row:dh,column:1},to:{row:dh+k,column:5}}}
    ws.views=[{state:'frozen',ySplit:dh,showGridLines:false}];
    return wb;
  }
  /* Export: open as a Google Sheet (made by the Google robot in the owner's Drive) or download the Excel file. */
  function exportPost(){
    if(!post.loaded){toast('Post production has not loaded yet.');return}
    openDlg('<div class="dlgbody"><div class="dlghead"><h2 id="dlg-title">Export post production</h2><button type="button" class="x" data-dlg="close" aria-label="Close">✕</button></div>'
      +'<p class="muted">All 52 episodes, the crew season by season and the dropped scenes, in the tracker colours.</p>'
      +'<div class="expopts">'
      +'<button type="button" class="expopt" data-dlg="exp-sheets"><b>Open in Google Sheets</b><span>A Google Sheet in Drive: 02. NJORO WA UBA SN 25-28 &gt; N.W.U Cycle 7 | SCENE TRACKER &gt; POST PRODUCTION EXPORTS. Only the newest export is kept. Anyone you send the link to can view it.</span></button>'
      +'<button type="button" class="expopt" data-dlg="exp-xlsx"><b>Download Excel file</b><span>An .xlsx file for this phone or computer. Opens in Excel, Numbers or Google Sheets.</span></button>'
      +'</div><p class="dlgerr" id="dlgerr" role="alert"></p></div>');
  }
  function postWorkbookBuffer(){return loadXlsx().then(function(ExcelJS){return buildPostWorkbook(ExcelJS).xlsx.writeBuffer()})}
  function exportXlsx(){
    closeDlg();toast('Building the Excel file…');
    postWorkbookBuffer().then(function(buf){
      var name='Njoro wa Uba Post Production '+todayIso()+'.xlsx';
      var blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),u=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();
      setTimeout(function(){URL.revokeObjectURL(u);a.remove()},8000);
      callScript({action:'note',what:'export'});
      toast('Excel file saved to your downloads');
    }).catch(function(){toast('Could not build the Excel file. Check your connection and try again.')});
  }
  function b64OfBuffer(buf){var bytes=new Uint8Array(buf),out='',CH=0x8000;for(var i=0;i<bytes.length;i+=CH)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));return btoa(out)}
  var SETUP_URL='https://github.com/nickovins/njoro-tracker/blob/main/apps-script/SETUP.md';
  var CODE_URL='https://raw.githubusercontent.com/nickovins/njoro-tracker/main/apps-script/Code.gs';
  function updateLinks(){return '<a href="'+SETUP_URL+'" target="_blank" rel="noopener">Install guide \u2197</a> \u00b7 <a href="'+CODE_URL+'" target="_blank" rel="noopener">Code.gs to paste \u2197</a>'}
  function exportSheets(){
    var err=document.getElementById('dlgerr'),btn=document.querySelector('[data-dlg="exp-sheets"]');
    if(ui.robot&&ui.robot<10){err.innerHTML='Opening in Google Sheets needs the Google script at version 11. Download the Excel file for now. '+updateLinks();return}
    if(!navigator.onLine){err.textContent='No signal. Download the Excel file instead, or try again with signal.';return}
    /* Open the tab now, while the tap still counts, so the phone does not block it as a pop-up. */
    var w=null;try{w=window.open('','_blank')}catch(e){}
    if(w){try{w.document.write('<title>Opening Google Sheets</title><p style="font:16px sans-serif;padding:24px">Building the Google Sheet…</p>')}catch(e){}}
    btn.disabled=true;btn.querySelector('b').textContent='Building the Google Sheet…';err.textContent='';
    postWorkbookBuffer().then(function(buf){return callScript({action:'exportSheet',xlsx:b64OfBuffer(buf)})}).then(function(r){
      btn.disabled=false;btn.querySelector('b').textContent='Open in Google Sheets';
      if(!r||!r.ok){if(w)try{w.close()}catch(e){}if(r&&r.error==='bad_request')err.innerHTML='Opening in Google Sheets needs the Google script at version 11. Download the Excel file for now. '+updateLinks();else err.textContent=errText(r);return}
      var url=safeUrl(r.url);if(!url){if(w)try{w.close()}catch(e){}err.textContent=ERR.server;return}
      if(w&&!w.closed){try{w.location.href=url}catch(e){window.open(url,'_blank')}}
      else window.open(url,'_blank');
      openDlg('<div class="dlgbody done"><h2 id="dlg-title">Google Sheet ready</h2><p>'+esc(r.name||'Post production')+'</p>'
        +'<p class="muted">Saved in Drive under N.W.U Cycle 7 | SCENE TRACKER \u203a POST PRODUCTION EXPORTS. The one before it went to the Drive bin. The link is view only for anyone you send it to.</p>'
        +(safeUrl(r.folder)?'<p><a href="'+esc(r.folder)+'" target="_blank" rel="noopener">Open the exports folder \u2197</a></p>':'')
        +'<div class="dlgacts"><button type="button" class="btn" data-dlg="close">Done</button><a class="btn primary" href="'+esc(url)+'" target="_blank" rel="noopener">Open it ↗</a></div></div>');
    }).catch(function(){if(w)try{w.close()}catch(e){}btn.disabled=false;btn.querySelector('b').textContent='Open in Google Sheets';err.textContent='Could not build the sheet. Check your connection and try again.'});
  }

  /* ---------- admin: recent activity ---------- */
  function loadAdmin(){
    if(!isAdmin())return;
    admin.err='';
    callScript({action:'activity'},true).then(function(r){if(r.ok){admin.activity=r.rows;admin.private=r.private}else admin.err=errText(r);if(ui.view==='admin')renderMain()});
  }
  function renderAdmin(){
    if(!isAdmin())return '';
    var html='';
    if(admin.err)html+='<p class="sync err">'+esc(admin.err)+'</p>';
    var act=admin.activity;
    html+='<section class="tablewrap adm"><div class="seasonhead"><b>Recent activity</b><span class="muted">Sign-ins and changes, newest first. Also kept in the Activity tab of the Google Sheet.</span><button type="button" class="linkbtn" data-act="adm-refresh">Refresh</button></div>'
      +'<div class="actbar"><span class="muted">Group by</span><div class="seg" role="group" aria-label="Group activity by">'+[['day','Day'],['week','Week'],['month','Month']].map(function(g){return '<button type="button" data-actgroup="'+g[0]+'" aria-pressed="'+((ui.actGroup||'day')===g[0])+'">'+g[1]+'</button>'}).join('')+'</div></div>';
    if(admin.private===false)html+='<p class="warnbar">The Google Sheet is still shared with anyone who has the link, so the Activity tab is off and only the last few entries are kept. In the Sheet: Share > General access > <b>Restricted</b>.</p>';
    if(!act)html+='<p class="empty">Loading activity\u2026</p>';
    else if(!act.length)html+='<p class="empty">Nothing yet.</p>';
    else html+=activityTable(act);
    html+='</section>'+(ui.robot&&ui.robot<11?'<section class="tablewrap adm admsec upd"><div class="seasonhead"><b>Google script update</b><span class="muted">'+(ui.robot>=6?'Version '+esc(ui.robot)+' is':'An older version is')+' installed. Version 11 reads estabs and flashbacks from new scripts by itself and saves exports as Google Sheets in the Scene Tracker folder in Drive.</span></div><p class="updlinks">'+updateLinks()+'</p></section>':'')+'<section class="tablewrap adm admsec"><div class="seasonhead"><b>Team sign-in</b><span class="muted">One master password for everyone. Sign-ins end after '+esc(auth.idle||30)+' minutes without use. To change the password, change PASSCODE in the Google script\u2019s Script Properties: every device is then signed out.</span></div>'
      +'<div class="admrow">'
      +(admin.confirmAll?'<span class="confirm">Sign out every device, including this one?</span><button type="button" class="btn small danger" data-act="adm-all-yes">Sign everyone out</button><button type="button" class="btn small" data-act="adm-cancel">Cancel</button>'
        :'<button type="button" class="btn small" data-act="adm-all">Sign everyone out</button>')+'</div></section>';
    return html;
  }
  /* Activity grouped by day, week (Monday to Sunday) or month, newest first. Each group shows
     how many sign-ins and changes it holds; each line shows the time (and the day, for weeks and months). */
  var MONTHS_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function actParts(w){var m=/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/.exec(w||'');return m?{d:new Date(+m[1],+m[2]-1,+m[3]),iso:m[1]+'-'+m[2]+'-'+m[3],time:m[4]?m[4]+':'+m[5]:''}:null}
  function mondayOf(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function dm(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)}
  function actGroupOf(p,mode){
    var now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),diff=Math.round((today-p.d)/864e5);
    if(mode==='month'){var k=p.d.getFullYear()+'-'+pad(p.d.getMonth()+1);var same=p.d.getFullYear()===today.getFullYear()&&p.d.getMonth()===today.getMonth();return {k:k,label:(same?'This month \u00b7 ':'')+MONTHS_LONG[p.d.getMonth()]+' '+p.d.getFullYear()}}
    if(mode==='week'){var mo=mondayOf(p.d),su=new Date(mo);su.setDate(su.getDate()+6);var w=Math.round((mondayOf(today)-mo)/(7*864e5));
      return {k:'w'+mo.getTime(),label:(w===0?'This week \u00b7 ':w===1?'Last week \u00b7 ':'')+dm(mo)+' to '+dm(su)+'.'+su.getFullYear()}}
    return {k:p.iso,label:(diff===0?'Today \u00b7 ':diff===1?'Yesterday \u00b7 ':'')+DAYS_SHORT[p.d.getDay()]+' '+dm(p.d)+'.'+p.d.getFullYear()};
  }
  function activityTable(act){
    var mode=ui.actGroup=ui.actGroup||'day',groups=[],byKey={};
    act.forEach(function(r){
      var p=actParts(r[0]),g=p?actGroupOf(p,mode):{k:'?',label:'Unknown date'};
      if(!byKey[g.k]){byKey[g.k]={key:g.k,label:g.label,rows:[]};groups.push(byKey[g.k])}
      byKey[g.k].rows.push({r:r,p:p});
    });
    /* Each day, week or month folds. The newest is open; tap a heading to open or close it. */
    ui.actOpen=ui.actOpen||{};if(ui.actOpenMode!==mode){ui.actOpen={};ui.actOpenMode=mode}
    var anySet=Object.keys(ui.actOpen).length;
    return '<table class="acttbl grouped"><thead><tr><th>'+(mode==='day'?'Time':'When')+'</th><th>Who</th><th>What</th><th class="hide-sm">Details</th></tr></thead>'+groups.map(function(g,gi){
      var open=anySet?!!ui.actOpen[g.key]:gi===0;
      var bad=g.rows.filter(function(x){return /fail|block/i.test(x.r[2])}).length,signin=g.rows.filter(function(x){return /sign/i.test(x.r[2])&&!/fail|block/i.test(x.r[2])}).length,chg=g.rows.length-signin-bad;
      var sum=[g.rows.length+' entr'+(g.rows.length===1?'y':'ies')].concat(chg>0?[chg+' change'+(chg===1?'':'s')]:[]).concat(signin?[signin+' sign-in'+(signin===1?'':'s')]:[]).concat(bad?[bad+' failed']:[]).join(' \u00b7 ');
      return '<tbody><tr class="actgrp'+(open?' open':'')+'"><th colspan="4" scope="rowgroup"><button type="button" class="actfold" data-actkey="'+esc(g.key)+'" aria-expanded="'+open+'"><span class="chev" aria-hidden="true">\u203A</span><span>'+esc(g.label)+'</span><span class="muted">'+esc(sum)+'</span></button></th></tr>'+(!open?'':g.rows.map(function(x){
        var r=x.r,p=x.p,when=p?(mode==='day'?p.time:DAYS_SHORT[p.d.getDay()]+' '+dm(p.d)+' '+p.time):r[0];
        return '<tr class="'+(/fail|block/i.test(r[2])?'bad':'')+'"><td class="mono when" title="'+esc(r[0])+'">'+esc(when)+'</td><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'<div class="sub show-sm">'+esc(r[3]||'')+'</div></td><td class="hide-sm muted">'+esc(r[3]||'')+'</td></tr>';
      }).join(''))+'</tbody>';
    }).join('')+'</table>';
  }
  function adminAction(act){
    if(act==='adm-refresh'){admin.activity=null;renderMain();loadAdmin();return}
    if(act==='adm-cancel'){admin.confirmAll=false;renderMain();return}
    if(act==='adm-all'){admin.confirmAll=true;renderMain();return}
    if(act==='adm-all-yes'){admin.confirmAll=false;callScript({action:'signoutAll'}).then(function(r){if(!r.ok){toast(errText(r));return}signOut('')})}
  }

  /* ---------- loading from the Google Sheet ---------- */
  var cbN=0;
  function loadTab(tab){
    return new Promise(function(resolve,reject){
      var name='__njw'+(++cbN),s=document.createElement('script'),done=false;
      var t=setTimeout(function(){finish();reject(new Error('timeout'))},15000);
      function finish(){done=true;clearTimeout(t);try{delete window[name]}catch(e){window[name]=undefined}if(s.parentNode)s.parentNode.removeChild(s)}
      window[name]=function(res){if(done)return;finish();resolve(res)};
      s.onerror=function(){if(done)return;finish();reject(new Error('network'))};
      s.src='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/gviz/tq?headers=1&tqx=responseHandler:'+name+'&sheet='+encodeURIComponent(tab)+'&_='+Date.now();
      document.head.appendChild(s);
    });
  }
  function cellText(c){if(!c)return '';if(c.v==null)return c.f||'';if(typeof c.v==='string'&&/^Date\(/.test(c.v))return c.f||c.v;return String(c.v)}
  function cellTime(c){
    if(!c||c.v==null)return 0;
    var m=/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?/.exec(String(c.v));
    if(m)return new Date(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)).getTime();
    var t=Date.parse(String(c.v).replace(' ','T'));return isNaN(t)?0:t;
  }
  function rowsOf(res){
    if(!res||res.status==='error'||!res.table)return [];
    var cols=res.table.cols||[],rows=res.table.rows||[];
    var labels=cols.map(function(c){return String(c.label||'').toLowerCase()});
    if(!labels.some(Boolean)&&rows.length){labels=(rows[0].c||[]).map(function(c){return cellText(c).toLowerCase()});rows=rows.slice(1)}
    var iR=labels.findIndex(function(l){return /report/.test(l)}),iL=labels.findIndex(function(l){return /log/.test(l)}),iT=labels.findIndex(function(l){return /time|date/.test(l)});
    if(iR<0)return [];
    return rows.map(function(r,i){var c=r.c||[];return {raw:cellText(c[iR]),log:iL>=0?cellText(c[iL]).trim():'',time:iT>=0?cellTime(c[iT]):0,order:i}});
  }
  /* A report pasted into a cell that was only selected (not opened) lands one line per row.
     Stitch those rows back into whole reports. Rows that already hold a whole report are left alone. */
  function stitch(rows){
    var out=[],cur=null;
    rows.forEach(function(r){
      var txt=(r.raw||'').replace(/\r/g,'');
      if(!txt.trim()){if(cur){cur.raw+='\n';if(!cur.log&&r.log)cur.log=r.log}return}
      if(/\n/.test(txt.trim())){cur=null;out.push({raw:txt,log:r.log,time:r.time});return}
      var header=/njoro\s*wa\s*uba\s*report/i.test(txt),dayLine=/shoot\s*day/i.test(txt);
      var start=!cur||header||(dayLine&&/shoot\s*day/i.test(cur.raw));
      if(start){cur={raw:txt,log:r.log,time:r.time};out.push(cur)}
      else{cur.raw+='\n'+txt;if(!cur.log&&r.log)cur.log=r.log}
    });
    return out;
  }
  /* sheetRows: the Reports tab, in sheet order. formRows: Google Form replies, if a form is linked.
     The report that comes last wins: lower rows beat higher rows, form replies beat the sheet. */
  /* Scripts tab: Episode | Script | Link | Updated, written by the Apps Script. */
  /* Scripts tab rows: Episode | Script | Link | Updated | Scenes, written by the robot. */
  function scriptsFromRows(rows){
    var out={};(rows||[]).forEach(function(v){var ep=parseInt(v[0],10),url=String(v[2]||'').trim();
      if(ep>0&&safeUrl(url))out[ep]={url:url,name:String(v[1]||''),scenes:String(v[4]||'').split(/[\s,]+/).filter(function(x){return /^\d{1,3}[A-Za-z]?$/.test(x)}),notes:notesOf(v[5])}});
    return out;
  }
  function gvizRows(res,want){
    if(!res||res.status==='error'||!res.table)return null;
    var labels=(res.table.cols||[]).map(function(c){return String(c.label||'').toLowerCase().trim()});
    var idx=want.map(function(w){return labels.indexOf(w)});if(idx[0]<0)return null;
    return (res.table.rows||[]).map(function(r){var c=r.c||[];return idx.map(function(i){return i>=0?cellText(c[i]):''})});
  }
  function scriptsOf(res){return scriptsFromRows(gvizRows(res,['episode','script','link','updated','scenes','notes'])||[])}
  /* Scripts tab Notes column: {"4":"E|Various activities","2":"F|Cess telling Njoro..."} */
  function notesOf(v){
    var o=null;try{o=JSON.parse(String(v||''))}catch(e){return null}
    if(!o||typeof o!=='object')return null;
    var out={};Object.keys(o).forEach(function(k){var m=/^([EF])\|([\s\S]*)$/.exec(String(o[k]||''));if(/^\d{1,3}[A-Za-z]?$/.test(k)&&m)out[normSc(k)]={type:m[1]==='E'?'Estab':'Flashback',note:m[2].slice(0,140)}});
    return out;
  }
  /* Repeats tab rows: Scene | Day | Decision | By | When. Key "7/16@10". */
  function repeatsFromRows(rows){
    var out={};(rows||[]).forEach(function(v){var m=/^(\d{1,3})\s*\/\s*(\d{1,3}[A-Za-z]?)$/.exec(String(v[0]||'').trim()),d=parseInt(v[1],10);
      if(m&&d>0&&(v[2]==='Reshoot'||v[2]==='Duplicate'||v[2]==='Continued'))out[keyOf(m[1],m[2])+'@'+d]={decision:v[2],by:String(v[3]||''),when:String(v[4]||'')}});
    return out;
  }
  function buildDays(sheetRows,formRows){
    var seen={},ordered=[];
    function add(r){var k=r.raw.replace(/\s+/g,' ').trim()+'|'+r.log;if(seen[k])return;seen[k]=1;ordered.push(r)}
    stitch(sheetRows||[]).forEach(add);
    stitch((formRows||[]).slice().sort(function(a,b){return a.time-b.time})).forEach(add);
    var byDay={};
    ordered.forEach(function(r){
      if(!r.raw||!r.raw.trim())return;
      var p=parseReport(r.raw);if(!p.day||!p.shot.length)return;
      var d={day:p.day,date:p.date,iso:p.iso,cast:p.cast,location:p.location,times:p.times,pages:p.pages,shot:p.shot,pulled:[],raw:r.raw.trim(),log:safeUrl(r.log)};
      var prev=byDay[p.day];if(prev&&!d.log)d.log=prev.log;
      if(!d.log&&LOG_SEED[p.day]&&LOG_SEED[p.day].iso===p.iso)d.log=LOG_SEED[p.day].url;
      byDay[p.day]=d;
    });
    var days=Object.keys(byDay).map(function(k){return byDay[k]}).sort(function(a,b){return a.day-b.day});
    /* A scene that shows up again on a later day needs a person to say what it is:
       a Reshoot (shot again, both takes count) or a Duplicate (logged twice by mistake).
       Until then it is tagged Check. A line that says "reshoot" or "completed" needs no check. */
    var seen={},dec=state.repeats||{};
    days.forEach(function(d){
      d.shot.forEach(function(s){
        var k=keyOf(s.ep,s.sc);
        s.tags=s.tags.filter(function(t){return t!=='Check'&&t!=='Duplicate'});s.firstDay=0;
        if(seen[k]&&s.tags.indexOf('Reshoot')<0&&s.tags.indexOf('Completed')<0){
          if(/\bcomplet|\bcont(inued)?\b|\bfinish/i.test(s.note)){s.tags.push('Completed');s.note=s.note.replace(/\b(completed?|continued|cont|finished)\b/ig,'').replace(/^[\s\-:,]+|[\s\-:,]+$/g,'')}
          else{
            s.firstDay=seen[k];var x=dec[k+'@'+d.day];
            if(x&&x.decision==='Reshoot'){s.tags.push('Reshoot');s.decided=x}
            else if(x&&x.decision==='Duplicate'){s.tags.push('Duplicate');s.decided=x}
            else if(x&&x.decision==='Continued'){s.tags.push('Continued');s.decided=x}
            else{s.tags.push('Check');s.decided=null}
          }
        }
        if(!seen[k])seen[k]=d.day;
      });
    });
    return days;
  }
  function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({rows:state.rows,scripts:state.scripts,repeats:state.repeats,fetchedAt:state.fetchedAt}))}catch(e){}}
  function loadCache(){try{var c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(c&&c.rows){state.rows=c.rows;state.scripts=c.scripts||{};state.repeats=c.repeats||{};state.fetchedAt=c.fetchedAt;state.days=buildDays(state.rows,[])}}catch(e){}}

  function sigOf(days){return days.map(function(d){return d.day+':'+d.raw.length+':'+(d.log?1:0)}).join(',')}
  /* After a save the app shows Google's own copy of the sheet straight away. For a couple of
     minutes after that, an older copy of the sheet from the normal reader is not allowed to undo it. */
  var wrote={at:0,sig:''};
  function reportRows(rows){return (rows||[]).map(function(v,i){var t=Date.parse(String(v[0]||'').replace(' ','T'));return {raw:String(v[1]||''),log:String(v[2]||'').trim(),time:isNaN(t)?0:t,order:i}})}
  /* Everything the robot sends: reports, scripts and repeat decisions. */
  function applyData(d,fromWrite){
    if(!d||!d.ok||!Array.isArray(d.reports))return false;
    state.rows=reportRows(d.reports);state.scripts=scriptsFromRows(d.scripts);state.repeats=repeatsFromRows(d.repeats);
    state.days=buildDays(state.rows,[]);state.fetchedAt=Date.now();saveCache();
    if(fromWrite)wrote={at:Date.now(),sig:sigOf(state.days)};
    ui.stale=false;ui.offline=false;ui.error='';ui.via='robot';ui.robot=+d.version||0;
    return true;
  }
  function applyServerRows(r){
    if(r&&r.data&&applyData(r.data,true)){renderAll();return true}
    if(r&&Array.isArray(r.rows)){state.rows=reportRows(r.rows);state.days=buildDays(state.rows,[]);state.fetchedAt=Date.now();saveCache();wrote={at:Date.now(),sig:sigOf(state.days)};renderAll();return true}
    return false;
  }
  /* The robot's public read (version 6 and later). Works even when the Sheet is private. */
  function robotRead(){
    if(!SCRIPT_URL)return Promise.reject(new Error('none'));
    var ctl=window.AbortController?new AbortController():null,t=setTimeout(function(){if(ctl)ctl.abort()},20000);
    return fetch(SCRIPT_URL+'?read=1&_='+Date.now(),{redirect:'follow',signal:ctl?ctl.signal:undefined})
      .then(function(r){clearTimeout(t);return r.json()})
      .then(function(d){if(!d||!d.ok||!(d.version>=6)||!Array.isArray(d.reports))throw new Error('old');return d});
  }
  async function refresh(quiet){
    if(ui.loading){ui.again=true;return}
    ui.loading=true;ui.error='';if(!quiet)renderStatus();
    var before=sigOf(state.days)+'|'+JSON.stringify(state.scripts)+'|'+JSON.stringify(state.repeats),changed=true;
    try{
      var d=null;
      try{d=await robotRead()}catch(e){d=null}
      if(d){
        var keep=Date.now()-wrote.at<150000&&sigOf(buildDays(reportRows(d.reports),[]))!==wrote.sig;
        if(!keep)applyData(d,false);
      }else{
        /* Robot not on version 6 yet: read the Sheet directly (only works while it is shared by link). */
        var results=await Promise.all(TABS.map(function(t,i){return loadTab(t).catch(function(e){return i===0?Promise.reject(e):null})}));
        if(!results[0]||results[0].status==='error')throw new Error('sheet');
        var rows=rowsOf(results[0]);
        /* A missing tab makes Google send the first tab instead; the readers ignore it. */
        var sc=results[1]?scriptsOf(results[1]):{};if(Object.keys(sc).length)state.scripts=sc;
        var rp=results[2]?gvizRows(results[2],['scene','day','decision','by','when']):null;if(rp)state.repeats=repeatsFromRows(rp);
        var days=buildDays(rows,[]);
        if(!(Date.now()-wrote.at<150000&&sigOf(days)!==wrote.sig)){state.rows=rows.map(function(r){return {raw:r.raw,log:r.log,time:r.time,order:r.order}});state.days=days}
        state.fetchedAt=Date.now();saveCache();ui.via='sheet';ui.robot=1;
      }
      changed=before!==sigOf(state.days)+'|'+JSON.stringify(state.scripts)+'|'+JSON.stringify(state.repeats)||ui.stale;
      ui.offline=false;ui.stale=false;
    }catch(e){
      ui.offline=!navigator.onLine;ui.stale=true;
      ui.error=state.days.length?'':(ui.offline?'You are offline and nothing has been saved on this phone yet. Open the app once with signal.':'Could not load the reports. Check your connection and tap Refresh.');
    }
    ui.loading=false;
    if(changed||!quiet)renderAll();else renderStatus();
    if(ui.again){ui.again=false;refresh(true)}
  }

  /* ---------- rendering ---------- */
  function fmtWhen(ms){
    if(!ms)return '';var d=new Date(ms),now=new Date();
    var t=pad(d.getHours())+':'+pad(d.getMinutes());
    return d.toDateString()===now.toDateString()?'today '+t:pad(d.getDate())+'.'+pad(d.getMonth()+1)+' '+t;
  }
  function isIos(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream}
  function standalone(){return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true}

  function renderShell(){
    document.getElementById('app').innerHTML=
      '<header class="mast"><div class="plate"><img src="logo.webp" alt="Njoro wa Uba" width="230" height="144">'
      +'<div class="right"><h1 class="kicker"><span class="sr">Njoro wa Uba </span>Scene Tracker</h1><div class="acts" id="acts"></div></div></div>'
      +'<dl class="stats" id="stats"></dl></header>'
      +'<div id="installhint"></div>'
      +'<p class="sync" id="sync" role="status"></p>'
      +'<section class="search"><div class="searchgrid">'
      +'<div><label for="q">Episode and scene</label><input id="q" type="text" inputmode="text" placeholder="e.g. 7/4" autocomplete="off" spellcheck="false">'
      +'<p class="hint">Type <span class="mono">7/4</span> for Episode 7, Scene 4, or <span class="mono">7</span> for the whole episode.</p></div>'
      +'<div><label for="loc">Location</label><input id="loc" type="text" placeholder="e.g. Ruaka, Upperhill, hotel" autocomplete="off">'
      +'<p class="hint">Finds the shoot days at a location, even with typos. Use it to track down unlogged establishing shots.</p></div>'
      +'</div><div id="answer"></div></section>'
      +'<div class="bar"><div class="seg" role="group" aria-label="View" id="views"></div><div class="filters" id="filters"></div></div>'
      +'<div id="main"></div>'
      +'<p class="foot" id="foot"></p>';
    document.getElementById('q').addEventListener('input',function(){if(this.value){document.getElementById('loc').value='';ui.view='scenes';var pq=parseQuery(),pe=pq&&pq.type==='ep'?pq.ep:(pq&&pq.type==='scene'?+pq.key.split('/')[0]:0);if(pe>=1&&pe<=EPISODES)setSeason(seasonOf(pe));renderControls()}renderAnswer();renderMain()});
    document.getElementById('loc').addEventListener('input',function(){if(this.value){document.getElementById('q').value='';ui.view='days';var h=locHits(this.value.trim());ui.openDay=h.length===1?h[0].day:null;renderControls()}renderAnswer();renderMain()});
    var app=document.getElementById('app');
    app.addEventListener('click',onClick);
    app.addEventListener('change',function(e){
      if(e.target.id==='f-show'){ui.show=e.target.value;renderMain();return}
      if(ui.view==='post')onPostChange(e.target);
    });
    app.addEventListener('input',function(e){if(ui.view==='post'&&e.target.matches&&e.target.matches('input.cell'))onCellInput(e.target)});
    app.addEventListener('focusout',function(e){
      if(!(e.target.matches&&e.target.matches('input.cell')))return;
      flushKey(e.target.dataset.pep+':'+e.target.dataset.pf);
      setTimeout(function(){if(post.deferRender&&!typingInPost())renderPostKeep()},0);
    });
    app.addEventListener('submit',function(e){var f=e.target.closest&&e.target.closest('form.dropadd');if(f){e.preventDefault();onDropAdd(f)}});
    app.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.matches&&e.target.matches('input.cell')){e.preventDefault();e.target.blur();return}var r=e.target.closest&&e.target.closest('tr.d');if(r&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggleDay(+r.dataset.day)}});
  }

  function renderHeader(){
    var last=daysAsc().slice(-1)[0];
    document.getElementById('stats').innerHTML='<div class="cyc">'+esc(CYCLE)+'</div><div><dt>Last report</dt><dd>'+(last?esc(dayRef(last)):'None')+'</dd></div>';
    var signed=isEditor();
    document.getElementById('acts').innerHTML=
      (installPrompt?'<button type="button" class="btn primary wide" data-act="install">Install app</button>':'')
      +(signed?'<div class="menuwrap wide"><button type="button" class="btn primary" data-act="menu" aria-haspopup="true" aria-expanded="'+!!ui.menu+'">Daily reports <span class="caret2" aria-hidden="true">\u25BE</span></button>'
        +(ui.menu?'<div class="menu" role="menu">'
          +'<button type="button" role="menuitem" data-act="add"><b>Add a day</b><span>Paste one report</span></button>'
          +'<button type="button" role="menuitem" data-act="add-many"><b>Add several days</b><span>Paste many reports at once</span></button>'
          +'<button type="button" role="menuitem" data-act="pick-edit"><b>Update a day</b><span>Fix or replace a report</span></button>'
          +'<button type="button" role="menuitem" data-act="drive"><b>Check Drive now</b><span>Attach new log sheets and scripts</span></button>'
          +'<button type="button" role="menuitem" data-act="pick-del" class="del"><b>Delete a day</b><span>Take a day out of the tracker</span></button>'
          +'</div>':'')+'</div>':'')
      +'<a class="btn" href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Log sheets ↗</a>'
      +(SCRIPTS_FOLDER?'<a class="btn" href="'+esc(SCRIPTS_FOLDER)+'" target="_blank" rel="noopener">Scripts ↗</a>':'')
      +(SCRIPT_URL?(signed?'<div class="menuwrap wide"><button type="button" class="btn ghost acct" data-act="acct" aria-haspopup="true" aria-expanded="'+!!ui.acct+'"><span class="who">Signed in</span> <span class="caret2" aria-hidden="true">\u25BE</span></button>'
          +(ui.acct?'<div class="menu" role="menu"><p class="menuhead"><b>Team sign-in</b><br><span>Signs out by itself after '+esc(auth.idle||30)+' minutes without use.</span></p>'
            +'<button type="button" role="menuitem" data-act="logout" class="del"><b>Sign out</b><span>On this device</span></button></div>':'')+'</div>'
        :'<button type="button" class="btn ghost wide" data-act="login"><span aria-hidden="true">\uD83D\uDD12</span> Sign in</button>'):'');
    document.getElementById('stats').innerHTML+=signed?'<div class="mode">Signed in</div>':'';
    document.getElementById('foot').innerHTML='Created by Nicholas Kibathi';
    var hint=document.getElementById('installhint'),dismissed=false;
    try{dismissed=localStorage.getItem('njw-ios-hint')==='1'}catch(e){}
    hint.innerHTML=(isIos()&&!standalone()&&!dismissed)?'<div class="installnote"><span>Install on iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span><button type="button" class="btn small" data-act="hide-hint">OK</button></div>':'';
  }

  function renderStatus(){
    var el=document.getElementById('sync');if(!el)return;
    var n=state.days.length,parts=[];
    if(ui.loading)parts.push('Checking for new reports…');
    else if(ui.offline&&n)parts.push('<strong>Offline.</strong> Showing reports saved on this phone ('+esc(fmtWhen(state.fetchedAt))+').');
    else if(ui.stale&&n)parts.push('<strong>Could not reach Google.</strong> Showing the copy saved on this phone ('+esc(fmtWhen(state.fetchedAt))+').');
    else if(state.fetchedAt)parts.push('Up to date, '+esc(fmtWhen(state.fetchedAt))+' · '+n+' shoot day'+(n===1?'':'s'));
    el.className='sync'+((ui.offline||ui.stale)&&!ui.loading?' off':'')+(ui.error?' err':'');
    el.innerHTML=(ui.error?esc(ui.error):parts.join(' '))+(ui.loading?'':' <button type="button" class="linkbtn" data-act="refresh">Refresh</button>');
  }

  function toggleDay(day){ui.openDay=ui.openDay===day?null:day;renderMain()}
  function renderMain(){
    if(ui.view==='post'){renderPostKeep();return}
    var m=document.getElementById('main');
    if(ui.view==='admin'){m.innerHTML=renderAdmin();return}
    m.innerHTML=renderRepeats()+(ui.view==='scenes'?renderScenes():renderDays());
  }
  function renderAll(){renderHeader();renderStatus();renderAnswer();renderControls();renderMain()}

  function onClick(ev){
    var b=ev.target.closest('button,tr.d');if(!b)return;
    if(b.matches('tr.d')){toggleDay(+b.dataset.day);return}
    if(b.dataset.ep){var e=+b.dataset.ep;ui.openEp=ui.openEp===e?null:e;var q=document.getElementById('q');if(q.value){q.value='';renderAnswer()}renderMain();return}
    if(b.dataset.view){ui.view=b.dataset.view;try{localStorage.setItem('njw-view',ui.view)}catch(e){}if(ui.view==='post'||ui.view==='admin'){var qq=document.getElementById('q'),ll=document.getElementById('loc');if(qq.value||ll.value){qq.value='';ll.value='';renderAnswer()}}if(ui.view==='post')loadPost();if(ui.view==='admin')loadAdmin();renderControls();renderMain();return}
    if(b.dataset.actkey!=null){
      /* One day, week or month open at a time: opening one folds the others; tapping the open one folds it. */
      var ak=b.dataset.actkey,wasOpen=b.getAttribute('aria-expanded')==='true';
      ui.actOpen=wasOpen?{__none:false}:{};if(!wasOpen)ui.actOpen[ak]=true;
      renderMain();var nb=document.querySelector('.actfold[data-actkey="'+ak.replace(/"/g,'')+'"]');if(nb&&!wasOpen&&nb.scrollIntoView)nb.scrollIntoView({block:'nearest'});return}
    if(b.dataset.actgroup){ui.actGroup=b.dataset.actgroup;try{localStorage.setItem('njw-actgroup',ui.actGroup)}catch(e){}renderMain();return}
    if(b.dataset.season){setSeason(+b.dataset.season);post.openDrop=null;post.openMove=null;ui.openEp=null;var q2=document.getElementById('q');if(q2&&q2.value&&ui.view==='scenes'){q2.value='';renderAnswer()}renderControls();renderMain();if(ui.view==='post'&&b.classList.contains('foldbtn'))setTimeout(function(){var so=document.querySelector('.seasonopen');if(so&&so.scrollIntoView)so.scrollIntoView({block:'start',behavior:'smooth'})},30);return}
    if(b.dataset.pexp){var pn=+b.dataset.pexp;post.openEp=post.openEp===pn?0:pn;if(post.openDrop!==pn)post.openDrop=null;if(post.openMove!==pn)post.openMove=null;renderPostKeep(0,true);return}
    if(b.hasAttribute('data-decide')){decideRepeat(b.dataset.scene,+b.dataset.day,b.dataset.decide);return}
    if(b.dataset.move){var mn=+b.dataset.move;post.openMove=post.openMove===mn?null:mn;post.openDrop=null;renderMain();return}
    if(b.dataset.skip){var sn=+b.dataset.skip;moveTo(sn,isoAdd(txOf(sn),7));return}
    if(b.dataset.unmove){var un=+b.dataset.unmove;moveTo(un,isoAdd(txOf(un-1),7));return}
    if(b.dataset.drop){var dn=+b.dataset.drop;post.openDrop=post.openDrop===dn?null:dn;post.openMove=null;renderMain();if(post.openDrop){var fi=document.querySelector('form.dropadd [name="sc"]');if(fi&&window.matchMedia('(min-width:561px)').matches)fi.focus()}return}
    if(b.dataset.dropdel){savePost({ep:+b.dataset.pep,set:{dropRemove:b.dataset.dropdel}},'');return}
    var act=b.dataset.act;
    if(act==='menu'){ui.menu=!ui.menu;ui.acct=false;renderHeader();return}
    if(act==='acct'){ui.acct=!ui.acct;ui.menu=false;renderHeader();return}
    if(ui.menu||ui.acct){ui.menu=false;ui.acct=false;renderHeader()}
    if(act==='drive'){checkDrive();return}
    if(act==='show-decided'){ui.showDecided=!ui.showDecided;renderMain();return}
    if(act==='export'){exportPost();return}
    if(act==='retry-save'){flushAll();renderSaveState();return}
    if(act==='goto-air'){var ge=airingEp()||upNextEp();if(ge){setSeason(seasonOf(ge));post.openEp=ge;renderControls();renderPostKeep(0,true);var row=document.getElementById('pe'+ge);if(row)row.scrollIntoView({block:'center',behavior:'smooth'})}return}
    if(act==='edit-day'){var edd=dayByNum(+b.dataset.day);if(edd)openAdd(edd.raw,edd.day);return}
    if(act&&act.indexOf('adm-')===0){adminAction(act);return}
    if(act==='show-all'){ui.show='all';renderControls();renderMain();return}
    if(act==='refresh'){refresh();if(ui.view==='post')loadPost();return}
    if(act==='add-many'){openAdd('',null,true);return}
    if(act==='pick-edit'||act==='pick-del'){openPicker(act==='pick-del');return}
    if(act==='hide-hint'){try{localStorage.setItem('njw-ios-hint','1')}catch(e){}renderHeader();return}
    if(act==='login'){openLogin();return}
    if(act==='logout'){signOut('');return}
    if(act==='add'){openAdd('',null);return}
    if(act==='replace'){var rd=dayByNum(+b.dataset.day);if(rd)openAdd(rd.raw,rd.day);return}
    if(act==='copy'){var cd=dayByNum(+b.dataset.day);if(cd)copyText(cd.raw).then(function(ok){toast(ok?'Day '+cd.day+' report copied':'Could not copy on this phone')});return}
    if(act==='del'){ui.confirmDel=+b.dataset.day;renderMain();return}
    if(act==='del-no'){ui.confirmDel=null;renderMain();return}
    if(act==='del-yes'){removeDay(+b.dataset.day);return}
    if(act==='install'&&installPrompt){var p=installPrompt;installPrompt=null;p.prompt();p.userChoice.finally(renderHeader);return}
  }


  /* ---------- continuity tools (need the passcode; Google checks it) ---------- */
  function dayByNum(n){return state.days.filter(function(d){return d.day===n})[0]}
  function toast(msg){document.querySelectorAll('.toast').forEach(function(x){x.remove()});var t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},3200)}
  function copyText(txt){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(txt).then(function(){return true},function(){return legacyCopy(txt)});
    return Promise.resolve(legacyCopy(txt));
  }
  function legacyCopy(txt){try{var ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();var ok=document.execCommand('copy');ta.remove();return ok}catch(e){return false}}
  var ERR={wrong_passcode:'That setup passcode is not right.',not_set_up:'The Google robot is not set up yet (no PASSCODE).',wrong_login:'That password is not right.',no_passcode:'No master password is set in Google yet (Script Property PASSCODE).',locked:'Too many wrong passwords. Sign-in is paused for 15 minutes.',signed_out:'You were signed out. Sign in again.',not_allowed:'Only an admin can do that.',bad_name:'Type a name of at least 2 letters.',weak_password:'The new password needs at least 8 characters.',wrong_current:'The current password is not right.',old_robot:'The Google robot is still an old version. Follow the install steps to update it to version 8.',no_day:'No shoot day number found in the report.',no_scenes:'No scenes found in the report. Scenes are written as episode/scene, like 7/4.',bad_link:'The log sheet link must be a Google Drive link.',busy:'Someone else is saving right now. Try again in a moment.',not_found:'That day is not in the tracker any more.',network:'No connection to Google. Check your signal and try again.',server:'Google had a problem saving. Try again in a moment.',bad_link_any:'The trailer link must be a full web link, like https://youtu.be/...',bad_scene:'Type a scene number, like 12 or 12A.',bad_move:'That date could not be saved. Pick a date after the episode before.'};
  function errText(r){return ERR[r&&r.error]||ERR.server}
  /* quiet: a background check that must not count as someone using the app. */
  function callScript(body,quiet){
    if(!navigator.onLine)return Promise.resolve({ok:false,error:'network'});
    if(auth.token&&body.token==null)body.token=auth.token;
    if(quiet)body.touch=false;
    return fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'})
      .then(function(r){return r.json()}).catch(function(){return {ok:false,error:'network'}})
      .then(function(r){
        r=r||{ok:false,error:'server'};
        /* An old robot (before version 6) answers every sign-in request this way. */
        if(!r.ok&&(r.error==='wrong_passcode'||r.error==='not_set_up'||r.error==='no_users'||r.error==='not_allowed'))r.error='old_robot';
        if(!r.ok&&r.error==='wrong_login'&&ui.robot&&ui.robot<8)r.error='old_robot';
        if(!r.ok&&r.error==='signed_out'&&auth.token&&body.action!=='login')signOut('expired');
        return r;
      });
  }

  /* ---------- signing in and out ---------- */
  function saveAuth(){try{if(auth.token)localStorage.setItem('njw-auth',JSON.stringify(auth));else localStorage.removeItem('njw-auth')}catch(e){}}
  function signedIn(r){
    auth={token:r.token,name:(r.user&&r.user.name)||'Team',idle:r.idle||30};saveAuth();
    lastAct=Date.now();lastPing=Date.now();try{localStorage.setItem('njw-last',String(lastAct))}catch(e){}
    post.loaded=false;admin.activity=null;
    /* Back to the tab they were on before signing in (Post production or Activity are hidden until then). */
    try{var lv=localStorage.getItem('njw-view');if(lv==='post'||lv==='admin')ui.view=lv}catch(e){}
    closeDlg();renderAll();loadPost();if(ui.view==='admin')loadAdmin();
    toast('Signed in');
  }
  /* why: '' (they tapped Sign out), 'idle' (no use for too long), 'expired' (Google ended it). */
  function signOut(why){
    var tok=auth.token;if(!tok&&!why)return;
    if(tok&&why!=='expired')fetch(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'logout',token:tok}),redirect:'follow'}).catch(function(){});
    var mins=auth.idle||30;
    auth={token:'',name:'',idle:mins};saveAuth();
    try{localStorage.removeItem('njw-post')}catch(e){}
    post.tx='';post.eps={};post.loaded=false;post.err='';post.openDrop=null;post.openMove=null;
    admin.activity=null;ui.confirmDel=null;ui.menu=false;ui.acct=false;
    if(ui.view==='post'||ui.view==='admin')ui.view='scenes';
    closeDlg();renderAll();
    if(why==='idle'||why==='expired')openDlg('<div class="dlgbody"><h2 id="dlg-title">Signed out</h2><p>'+(why==='idle'?'You were signed out after '+esc(mins)+' minutes without using the app.':'Your sign-in ended. This happens after '+esc(mins)+' minutes without use, after 12 hours, or when the master password is changed.')+'</p><p class="muted">Anyone can still see scenes and daily reports. Sign in again to make changes.</p><div class="dlgacts"><button type="button" class="btn" data-dlg="close">OK</button><button type="button" class="btn primary" data-act="login" data-dlg="relogin">Sign in again</button></div></div>');
    else toast('Signed out on this device');
  }
  /* Real use (taps, typing, scrolling) keeps the sign-in alive. Background refreshes do not. */
  function markActive(){
    var now=Date.now();
    if(now-lastAct>15000){try{localStorage.setItem('njw-last',String(now))}catch(e){}}
    lastAct=now;
    if(auth.token&&now-lastPing>5*60000){lastPing=now;callScript({action:'touch'})}
  }
  function idleCheck(){
    if(!auth.token)return;
    var stored=0;try{stored=+localStorage.getItem('njw-last')||0}catch(e){}
    var last=Math.max(lastAct,stored);
    if(Date.now()-last>(auth.idle||30)*60000)signOut('idle');
  }

  var dlg=null;
  function dialog(){
    if(dlg)return dlg;
    dlg=document.createElement('dialog');dlg.className='sheet';dlg.setAttribute('aria-labelledby','dlg-title');
    document.body.appendChild(dlg);
    dlg.addEventListener('click',function(e){
      if(e.target!==dlg)return;
      var r=dlg.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDlg();
    });
    dlg.addEventListener('cancel',function(e){e.preventDefault();closeDlg()});
    return dlg;
  }
  function openDlg(html){var d=dialog();d.innerHTML=html;if(!d.open){if(d.showModal)d.showModal();else d.setAttribute('open','')}document.documentElement.classList.add('modal-open')}
  function closeDlg(){if(dlg&&dlg.open){if(dlg.close)dlg.close();else dlg.removeAttribute('open')}document.documentElement.classList.remove('modal-open')}

  /* A short description of this device for the activity log, like "iPhone, Safari". */
  function deviceLabel(){
    var u=navigator.userAgent||'',os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android':/Mac OS X/.test(u)?'Mac':/Windows/.test(u)?'Windows':/Linux/.test(u)?'Linux':'';
    var br=/Edg\//.test(u)?'Edge':/SamsungBrowser/.test(u)?'Samsung':/CriOS|Chrome\//.test(u)?'Chrome':/FxiOS|Firefox\//.test(u)?'Firefox':/Safari\//.test(u)?'Safari':'';
    return [os,br].filter(Boolean).join(', ');
  }
  function openLogin(){
    openDlg('<form class="dlgbody" id="loginform"><div class="dlghead"><h2 id="dlg-title">Team sign-in</h2><button type="button" class="x" data-dlg="close" aria-label="Close">\u2715</button></div>'
      +'<p class="muted">Turns on adding reports, Post production and Activity on this device.</p>'
      +'<input type="text" autocomplete="username" value="team" hidden>'
      +'<label class="fld">Master password<input id="lpass" type="password" autocomplete="current-password" required></label>'
      +'<p class="dlgerr" id="dlgerr" role="alert"></p>'
      +'<div class="dlgacts"><button type="button" class="btn" data-dlg="close">Cancel</button><button type="submit" class="btn primary" id="loginbtn">Sign in</button></div></form>');
    document.getElementById('lpass').focus();
    document.getElementById('loginform').addEventListener('submit',function(e){
      e.preventDefault();
      var pw=document.getElementById('lpass').value,btn=document.getElementById('loginbtn'),err=document.getElementById('dlgerr');
      if(!pw)return;
      btn.disabled=true;btn.textContent='Checking…';err.textContent='';
      callScript({action:'login',password:pw,device:deviceLabel()}).then(function(r){
        btn.disabled=false;btn.textContent='Sign in';
        if(r.ok&&!r.token)r={ok:false,error:'old_robot'};
        if(!r.ok){err.textContent=errText(r);return}
        signedIn(r);
      });
    });
  }


  var editDay=null;
  function draftKey(){return editDay?'':'njw-draft'}
  var manyMode=false;
  function openAdd(prefill,day,many){
    editDay=prefill&&day?day:null;manyMode=!!many&&!editDay;
    if(!isEditor()){openLogin();return}
    var draft='';if(!editDay){try{draft=localStorage.getItem('njw-draft')||''}catch(e){}}
    var text=prefill||draft;
    var canPaste=!!(navigator.clipboard&&navigator.clipboard.readText&&window.isSecureContext);
    openDlg('<div class="dlgbody"><div class="dlghead"><h2 id="dlg-title">'+(prefill?'Update Day '+editDay:(manyMode?'Add several days':'Add a day'))+'</h2><button type="button" class="x" data-dlg="close" aria-label="Close">\u2715</button></div>'
      +'<p class="muted">'+(manyMode?'In WhatsApp, select all the daily reports, copy, and paste them here together. Each day is found and saved on its own.':'Copy the report from the WhatsApp group and paste it here exactly as sent.')+'</p>'
      +'<div class="pasterow">'+(canPaste?'<button type="button" class="btn primary" data-dlg="paste">Paste report</button>':'')+'<button type="button" class="btn" data-dlg="clear">Clear</button></div>'
      +'<textarea id="rep" rows="10" placeholder="Long-press here and choose Paste" spellcheck="false">'+esc(text)+'</textarea>'
      +'<div id="preview" aria-live="polite"></div>'
      +'<details class="loglink"><summary>Log sheet</summary><p class="muted">Attached automatically from the log sheets folder once a PDF named like <span class="mono">Day 9 9.10.2026</span> is uploaded. Only paste a link here if the file is somewhere else.</p><input id="loglink" type="url" inputmode="url" placeholder="https://drive.google.com/file/d/..."></details>'
      +'<p class="dlgerr" id="dlgerr" role="alert"></p>'
      +'<div class="dlgacts"><button type="button" class="btn" data-dlg="close">Cancel</button><button type="button" class="btn primary" data-dlg="save" id="savebtn">Save report</button></div></div>');
    var ta=document.getElementById('rep');
    ta.addEventListener('input',function(){if(draftKey()){try{localStorage.setItem(draftKey(),ta.value)}catch(e){}}preview()});
    preview();if(!text&&!canPaste)ta.focus();
  }

  /* Scenes in this report that were already shot on an earlier day (from the tracker, or from
     earlier reports in the same paste), so they will show as Reshoot. */
  function earlierRepeats(p,extra){
    var before={};state.days.concat(extra||[]).forEach(function(d){if(d.day<p.day)d.shot.forEach(function(s){before[keyOf(s.ep,s.sc)]=d.day})});
    return p.shot.filter(function(s){var k=keyOf(s.ep,s.sc);return before[k]&&s.tags.indexOf('Reshoot')<0&&!/\bcomplet|\bcont(inued)?\b|\bfinish/i.test(s.note)}).map(function(s){var k=keyOf(s.ep,s.sc);return k+' (Day '+before[k]+')'});
  }
  /* The reports in the box, parsed. A day pasted twice keeps its last copy. */
  function pasted(){
    var ta=document.getElementById('rep');if(!ta)return [];
    var list=splitReports(ta.value).map(function(t){var p=parseReport(t);p.text=t;return p});
    var last={};list.forEach(function(p,i){if(p.day)last[p.day]=i});
    list.forEach(function(p,i){p.dup=!!(p.day&&last[p.day]!==i)});
    return list;
  }
  function preview(){
    var ta=document.getElementById('rep'),box=document.getElementById('preview'),btn=document.getElementById('savebtn');if(!ta||!box)return;
    document.getElementById('dlgerr').textContent='';
    var list=pasted(),lk=document.querySelector('.loglink');
    if(!list.length){box.innerHTML='';btn.disabled=true;btn.textContent=manyMode?'Save days':'Save report';if(lk)lk.hidden=false;return}
    if(list.length>1||manyMode){
      if(lk)lk.hidden=list.length>1;
      if(editDay){box.innerHTML='<ul class="pvwarn"><li>This box holds '+list.length+' reports. Paste only the Day '+editDay+' report here, or use <strong>Add several days</strong>.</li></ul>';btn.disabled=true;return}
      var good=list.filter(function(p){return p.day&&p.shot.length&&!p.dup}),seenDays=[];
      box.innerHTML='<p class="pvcount">'+good.length+' day'+(good.length===1?'':'s')+' found</p><ul class="pvlist">'+list.map(function(p,i){
        var bad=!p.day?'No shoot day number':(!p.shot.length?'No scenes found':(p.dup?'Pasted twice, the later copy is used':''));
        var rep=bad?[]:earlierRepeats(p,seenDays);if(!bad)seenDays.push(p);
        var odd=bad?[]:notInScript(p);
        var ex=p.day&&dayByNum(p.day);
        return '<li class="'+(bad?'skip':'')+'"><div><strong>'+(p.day?esc(dayRef({day:p.day,iso:p.iso,date:p.date})):'Report '+(i+1))+'</strong>'
          +(bad?'':'<span class="pill'+(ex?' upd':'')+'">'+(ex?'Updates':'New')+'</span>')+'</div>'
          +'<span class="muted">'+(bad?esc(bad)+'. Skipped.':p.shot.length+' scene'+(p.shot.length===1?'':'s')+(p.location?' · '+esc(p.location):'')+(rep.length?' · '+rep.length+' repeat'+(rep.length===1?'':'s')+' to check':''))+'</span>'
          +(odd.length?'<span class="bad">Not in the script: '+esc(odd.join(', '))+'. Check before saving.</span>':'')+'</li>';
      }).join('')+'</ul>';
      btn.disabled=!good.length||ui.busy;btn.textContent=good.length?'Save '+good.length+' day'+(good.length===1?'':'s'):'Save days';
      return;
    }
    if(lk)lk.hidden=false;
    var p=list[0],warn=[],ok=!!(p.day&&p.shot.length);
    if(!p.day)warn.push('No shoot day number found. The report needs a line like <span class="mono">Shoot Day: 9</span>.');
    if(!p.shot.length)warn.push('No scenes found. Scenes are written as episode/scene, like <span class="mono">7/4</span>.');
    if(p.day&&!p.iso)warn.push('The date could not be read, so the log sheet cannot be matched automatically.');
    var ex=p.day&&dayByNum(p.day);
    if(editDay&&p.day&&p.day!==editDay)warn.push('You changed the shoot day from '+editDay+' to '+p.day+'. Day '+editDay+' will be removed'+(ex?' and the existing Day '+p.day+' replaced':'')+'.');
    else if(ex&&!editDay)warn.push('Day '+p.day+' is already in the tracker. Saving updates it with this version.');
    if(p.ignored.length)warn.push('Left out because the report lists them as not shot: '+esc(p.ignored.join(', '))+'.');
    var odd=notInScript(p);
    if(odd.length)warn.unshift('<strong class="bad">Not in the script:</strong> '+esc(odd.join(', '))+'. Check these numbers against the report before saving. They are saved as written but cannot count towards an episode.');
    var rep=p.day?earlierRepeats(p):[];
    if(rep.length)warn.push('Already logged on an earlier day: '+esc(rep.join(', '))+'. After saving, they show at the top of the tracker for someone to mark <strong>Reshoot</strong> or <strong>Duplicate</strong>. If a scene was only finished today, add “completed” to its line, like <span class="mono">7/5 - completed</span>.');
    box.innerHTML=(p.day?'<div class="pv"><div class="pvhead"><strong>'+esc(dayRef({day:p.day,iso:p.iso,date:p.date}))+'</strong>'+(p.location?'<span class="muted">'+esc(p.location)+'</span>':'')+'</div>'
      +(p.shot.length?'<p class="pvsc">'+p.shot.length+' scene'+(p.shot.length===1?'':'s')+': '+p.shot.map(function(s){return '<span class="mono">'+esc(keyOf(s.ep,s.sc))+'</span>'+(s.tags.length?' '+tagsHtml(s.tags):'')}).join(', ')+'</p>':'')
      +'</div>':'')
      +(warn.length?'<ul class="pvwarn">'+warn.map(function(w){return '<li>'+w+'</li>'}).join('')+'</ul>':'');
    btn.disabled=!ok||ui.busy;btn.textContent=(ex||editDay)?'Update Day '+p.day:(p.day?'Save Day '+p.day:'Save report');
  }

  function logLine(r){return r.logFound?'Log sheet attached.':'Log sheet not in Drive yet. It attaches by itself within 30 minutes of upload.'}
  function saveReport(){
    var btn=document.getElementById('savebtn'),err=document.getElementById('dlgerr');
    var list=pasted();if(!list.length)return;
    var log=(document.getElementById('loglink').value||'').trim();
    if(!navigator.onLine){err.textContent='No signal. Your report is kept on this phone. Tap Save when you have signal.';return}
    ui.busy=true;btn.disabled=true;btn.textContent='Saving…';
    var many=list.length>1||manyMode;
    var good=list.filter(function(p){return p.day&&p.shot.length&&!p.dup});
    var job=many?saveMany(good.map(function(p){return p.text})):callScript({action:'save',report:list[0].text,log:log,originalDay:editDay});
    job.then(function(r){
      ui.busy=false;
      if(!r.ok){btn.disabled=false;preview();err.textContent=errText(r);if(r.error==='wrong_passcode'){closeDlg();openLogin()}return}
      if(!editDay){try{localStorage.removeItem('njw-draft')}catch(e){}}
      if(!applyServerRows(r))refresh();
      var body;
      if(many){
        var res=r.results||[],okd=res.filter(function(x){return x.ok}),bad=res.filter(function(x){return !x.ok});
        body='<h2 id="dlg-title">'+okd.length+' day'+(okd.length===1?'':'s')+' saved</h2><ul class="donelist">'
          +okd.map(function(x){return '<li><strong>Day '+x.day+'</strong> '+(x.replaced?'updated':'added')+'<span class="muted">'+(x.logFound?'Log sheet attached':'Log sheet not uploaded yet')+'</span></li>'}).join('')
          +bad.map(function(x){return '<li class="skip"><strong>'+(x.day?'Day '+x.day:'A report')+'</strong> not saved<span class="muted">'+esc(errText(x))+'</span></li>'}).join('')+'</ul>';
      }else body='<h2 id="dlg-title">Day '+r.day+' '+(r.replaced?'updated':'saved')+'</h2><p>'+logLine(r)+'</p>';
      openDlg('<div class="dlgbody done">'+body+'<p class="muted">It is on the tracker now. Other phones pick it up within a minute.</p><div class="dlgacts"><button type="button" class="btn primary" data-dlg="close">Done</button></div></div>');
    });
  }
  /* Several days in one trip to Google. An older Google script without "saveMany" gets them one by one. */
  function saveMany(texts){
    return callScript({action:'saveMany',reports:texts}).then(function(r){
      if(r.ok||r.error!=='bad_request')return r;
      var results=[],rows=null,i=0;
      function next(){
        if(i>=texts.length)return {ok:true,results:results,rows:rows};
        return callScript({action:'save',report:texts[i++],log:'',originalDay:0}).then(function(x){
          if(!x.ok&&(x.error==='wrong_passcode'||x.error==='network'))return x;
          results.push(x);if(x.rows)rows=x.rows;return next();
        });
      }
      return next();
    });
  }

  /* Update a day / Delete a day: pick the day first. */
  function openPicker(del){
    if(!isEditor()){openLogin();return}
    var days=daysAsc().reverse();
    openDlg('<div class="dlgbody"><div class="dlghead"><h2 id="dlg-title">'+(del?'Delete a day':'Update a day')+'</h2><button type="button" class="x" data-dlg="close" aria-label="Close">✕</button></div>'
      +'<p class="muted">'+(del?'Pick the day to take out of the tracker. The report stays in WhatsApp and the log sheet stays in Drive.':'Pick the day to fix. You can edit the report or paste a new version.')+'</p>'
      +(days.length?'<div class="picklist">'+days.map(function(d){return '<button type="button" class="pick'+(del?' del':'')+'" data-dlg="'+(del?'pickdel':'pickedit')+'" data-day="'+d.day+'"><strong>'+esc(dayRef(d))+'</strong><span class="muted">'+esc(d.location||'')+' · '+entriesOf(d).length+' scenes</span></button>'}).join('')+'</div>'
        :'<p class="empty">No days logged yet.</p>')
      +'</div>');
  }
  function confirmDelete(n){
    var d=dayByNum(n);if(!d)return;
    openDlg('<div class="dlgbody"><h2 id="dlg-title">Delete '+esc(dayRef(d))+'?</h2>'
      +'<p>Its '+entriesOf(d).length+' scenes will no longer count as shot. You can add the day back later by pasting the report again.</p>'
      +'<p class="dlgerr" id="dlgerr" role="alert"></p>'
      +'<div class="dlgacts"><button type="button" class="btn" data-dlg="close">Keep it</button><button type="button" class="btn danger" data-dlg="delyes" data-day="'+n+'" id="delbtn">Delete Day '+n+'</button></div></div>');
  }

  function removeDay(n,fromDlg){
    ui.busy=true;if(!fromDlg)renderMain();
    var btn=document.getElementById('delbtn');if(fromDlg&&btn){btn.disabled=true;btn.textContent='Deleting…'}
    callScript({action:'remove',day:n}).then(function(r){
      ui.busy=false;ui.confirmDel=null;
      if(!r.ok){
        if(fromDlg&&btn){btn.disabled=false;btn.textContent='Delete Day '+n;document.getElementById('dlgerr').textContent=errText(r)}
        else{renderMain();toast(errText(r))}
        return;
      }
      if(fromDlg)closeDlg();
      if(ui.openDay===n)ui.openDay=null;
      if(!applyServerRows(r)){state.days=state.days.filter(function(d){return d.day!==n});wrote={at:Date.now(),sig:sigOf(state.days)};saveCache();renderAll()}
      toast('Day '+n+' deleted');
    });
  }

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-dlg]');if(!b)return;
    var a=b.dataset.dlg;
    if(a==='close'){closeDlg();return}
    if(a==='editday'){var dd=dayByNum(+b.dataset.day);if(dd)openAdd(dd.raw,dd.day);return}
    if(a==='relogin'){openLogin();return}
    if(a==='clear'){var ta=document.getElementById('rep');ta.value='';if(draftKey()){try{localStorage.removeItem(draftKey())}catch(e){}}preview();ta.focus();return}
    if(a==='paste'){navigator.clipboard.readText().then(function(t){var ta=document.getElementById('rep');ta.value=t;if(draftKey()){try{localStorage.setItem(draftKey(),t)}catch(e){}}preview()},function(){var ta=document.getElementById('rep');ta.focus();document.getElementById('dlgerr').textContent='Paste was blocked. Long-press in the box and choose Paste.'});return}
    if(a==='save'){saveReport();return}
    if(a==='exp-xlsx'){exportXlsx();return}
    if(a==='exp-sheets'){exportSheets();return}
    if(a==='pickedit'){var d=dayByNum(+b.dataset.day);if(d)openAdd(d.raw,d.day);return}
    if(a==='pickdel'){confirmDelete(+b.dataset.day);return}
    if(a==='delyes'){removeDay(+b.dataset.day,true);return}
  });

  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installPrompt=e;renderHeader()});
  window.addEventListener('appinstalled',function(){installPrompt=null;renderHeader()});
  window.addEventListener('online',function(){ui.offline=false;refresh();if(isEditor()&&post.loaded)flushAll()});
  window.addEventListener('pagehide',flushOnLeave);
  document.addEventListener('visibilitychange',function(){if(document.hidden)flushOnLeave()});
  window.addEventListener('offline',function(){ui.offline=true;renderStatus()});
  /* Stay current while the app is open: check every 30 seconds, and straight away when it comes back to the front. */
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&navigator.onLine&&Date.now()-(state.fetchedAt||0)>15000)refresh(true)});
  setInterval(function(){if(!document.hidden&&navigator.onLine){refresh(true);if(ui.view==='post'&&!post.saving)loadPost(true)}},30000);
  document.addEventListener('click',function(e){if((ui.menu||ui.acct)&&!(e.target.closest&&e.target.closest('.menuwrap'))){ui.menu=false;ui.acct=false;renderHeader()}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ui.menu){ui.menu=false;renderHeader()}});

  ['pointerdown','keydown','touchstart','wheel','scroll'].forEach(function(ev){window.addEventListener(ev,markActive,{passive:true,capture:true})});
  setInterval(idleCheck,20000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)idleCheck()});
  window.addEventListener('focus',idleCheck);

  loadCache();
  renderShell();
  renderAll();
  idleCheck();
  refresh();
  if(ui.view==='post')loadPost();
  if(ui.view==='admin')loadAdmin();
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(function(){});
  window.__njw={state:state,buildDays:buildDays,parseReport:parseReport,refresh:refresh,reportWithContinued:reportWithContinued};
})();
