/* Njoro wa Uba Scene Tracker: installable app.
   Data comes from a Google Sheet that anyone with the link can read.
   Each row is one continuity report, pasted exactly as sent; this app parses it. */
(function(){
  "use strict";
  var SHEET_ID='13mpLW2iFSSqDja--dwxXEEz_jVpjOeDudyWYy0fvT3I';
  var TABS=['Reports','Form Responses 1'];
  var FORM_URL='';   /* set once the Google Form exists; the Add button then opens it */
  var SHEET_URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit';
  var CACHE_KEY='njw-data-v1';
  var MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var CYCLE='Cycle 7 | Season 1-4';

  var state={days:[],fetchedAt:null};
  var ui={view:'scenes',show:'all',openEp:null,openDay:null,loading:false,offline:!navigator.onLine,error:''};
  var installPrompt=null;
  try{var v=localStorage.getItem('njw-view');if(v==='scenes'||v==='days')ui.view=v}catch(e){}
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
    if((m=/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(t))){d=+m[1];mo=+m[2];y=+m[3];if(y<100)y+=2000}
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
  function tagsHtml(tags){return (tags||[]).map(function(t){return '<span class="tag '+esc(t)+'">'+esc(t)+'</span>'}).join('')}
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
    return (d.shot||[]).map(function(s){return {ep:s.ep,sc:s.sc,note:s.note||'',tags:(s.tags||[]).slice()}})
      .concat((d.pulled||[]).map(function(s){return {ep:s.ep,sc:s.sc,note:s.note||'',tags:['Pulled']}}));
  }
  /* One row per time a scene was shot. Repeats tagged Reshoot are numbered: Reshoot, Reshoot 2 ... */
  function takes(){
    var by={};
    daysAsc().forEach(function(d){entriesOf(d).forEach(function(s){var k=keyOf(s.ep,s.sc);(by[k]=by[k]||[]).push({key:k,ep:+s.ep,day:d,note:s.note,tags:s.tags})})});
    var out=[];
    Object.keys(by).sort(cmpKey).forEach(function(k){
      var n=0;by[k].forEach(function(t){if(t.tags.indexOf('Reshoot')>=0){n++;t.ext=n>1?'Reshoot '+n:'Reshoot'}else t.ext='';out.push(t)});
    });
    return out;
  }

  /* ---------- parse a continuity report ---------- */
  function parseReport(raw){
    var out={day:null,date:'',iso:'',cast:'',location:'',times:[],pages:'',shot:[],ignored:[],raw:raw,warnings:[]};
    var mode=null,secTag='',seen={};
    raw.split(/\r?\n/).forEach(function(line0){
      var line=line0.replace(/[*_~]/g,'').replace(/[⌛⏳]/g,'').replace(/\s+/g,' ').trim();
      if(!line)return;
      var m,hasScene=/\d+\s*\/\s*\d/.test(line);
      if((m=/^shoot\s*day\s*[:\-]?\s*(\d+)/i.exec(line))){out.day=+m[1];return}
      if((m=/^date\s*[:\-]\s*(.+)$/i.exec(line))){out.date=m[1].trim();out.iso=inferIso(out.date);return}
      if((m=/^cast\s*[:\-]\s*(.+)$/i.exec(line))){out.cast=m[1].trim();return}
      if((m=/^locations?\s*[:\-]\s*(.+)$/i.exec(line))){out.location=m[1].trim();return}
      if((m=/^pages?\s*(?:shot)?\s*[:\-]\s*([\d.]+(?:\s+\d\/8)?)/i.exec(line))){out.pages=m[1].trim();mode=null;return}
      if(!hasScene){
        if(/re-?shoot/i.test(line)){mode='shot';secTag='Reshoot';return}
        if(/pulled/i.test(line)){mode='shot';secTag='Pulled';return}
        if(/dropped|not shot|moved|carried|postponed|cancel/i.test(line)){mode='skip';secTag='';return}
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
        f.note=note;f.tags=tags.slice();seen[k]=f;out.shot.push(f);
      });
    });
    if(out.day==null)out.warnings.push('No shoot day number found. Type it in below.');
    if(!out.iso)out.warnings.push('Could not read the date. Pick it below.');
    if(!out.shot.length)out.warnings.push('No scenes found. Scenes must be written as episode/scene, for example 7/4.');
    if(out.ignored.length)out.warnings.push('Not logged, because the report lists them as not shot: '+out.ignored.join(', ')+'.');
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
      box.innerHTML='<div class="answer notshot" role="alert"><div class="line"><span class="sc">'+esc(q.key)+'</span><span class="verdict">Not shot</span></div>'
        +'<p>Episode '+esc(parts[0])+', Scene '+esc(parts[1])+' is not in any continuity report logged so far'+(logged.length?' (Day '+logged.join(', ')+')':'')+'.</p>'
        +(nearKeys.length?'<p><strong>Similar scene shot:</strong> '+nearKeys.map(function(k){return esc(k)+' on '+esc(dayRef(near[k]))}).join(', ')+'. Check it is not the same scene under another number.</p>':'')
        +'<div class="tip"><strong>Before you mark it missing,</strong> check whether it was shot as an establishing shot, insert, cutaway, B-roll, VO or pickup and left out of the report. Type the scene\u2019s location in the Location box to find the days the crew was there, then check those days\u2019 log sheets. <a href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Open log sheets \u2197</a></div></div>';
      return;
    }
    box.innerHTML='<div class="answer shot"><div class="line"><span class="sc">'+esc(q.key)+'</span><span class="verdict">Shot'+(list.length>1?' '+list.length+' times':'')+'</span></div><ul>'
      +list.map(function(t){return '<li><strong>'+esc(dayRef(t.day))+'</strong>'+logLink(t.day)+(t.ext?'<span class="tag Reshoot">'+esc(t.ext)+'</span>':'')+tagsHtml(t.tags.filter(function(x){return x!=='Reshoot'}))+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</li>'}).join('')
      +'</ul></div>';
  }

  function renderControls(){
    document.getElementById('views').innerHTML=[['scenes','Scenes'],['days','Daily reports']].map(function(v){return '<button type="button" data-view="'+v[0]+'" aria-pressed="'+(ui.view===v[0])+'">'+v[1]+'</button>'}).join('');
    var f=document.getElementById('filters');
    if(ui.view!=='scenes'){f.innerHTML='';return}
    f.innerHTML='<label for="f-show">Show</label><select id="f-show"><option value="all">All scenes</option><option value="Pulled"'+(ui.show==='Pulled'?' selected':'')+'>Pulled</option><option value="Reshoot"'+(ui.show==='Reshoot'?' selected':'')+'>Reshoots</option></select>';
  }

  function row(t,hit,showEp){
    var other=t.tags.filter(function(x){return x!=='Reshoot'});
    return '<tr'+(hit===t.key?' class="hit"':'')+'><td class="sc">'+esc(t.key)+(t.ext?'<span class="ext">'+esc(t.ext)+'</span>':'')+'</td><td class="when">'+esc(dayRef(t.day))+' '+logLink(t.day,'Log')+'<div class="sub show-sm">'+esc(t.day.location||'')+(other.length||t.note?'<br>':'')+tagsHtml(other)+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</div></td><td class="loc hide-sm">'+esc(t.day.location||'')+'</td><td class="note hide-sm">'+tagsHtml(other)+(t.note?'<span class="muted">'+esc(t.note)+'</span>':'')+'</td></tr>';
  }
  var HEAD='<thead><tr><th>Scene</th><th>Shot on</th><th class="hide-sm">Location</th><th class="hide-sm">Notes</th></tr></thead>';
  function renderScenes(){
    var q=parseQuery(),kw=locQuery(),rows=takes();
    if(ui.show!=='all')rows=rows.filter(function(t){return t.tags.indexOf(ui.show)>=0});
    var hit=null;
    if(q&&q.type==='scene'){var e=+q.key.split('/')[0];rows=rows.filter(function(t){return t.ep===e});ui.openEp=e;hit=q.key;if(!rows.length)return ''}
    else if(q&&q.type==='ep'){rows=rows.filter(function(t){return t.ep===q.ep});ui.openEp=q.ep}
    if(!rows.length){
      var msg=state.days.length?(q&&q.type==='ep'?'Nothing from Episode '+q.ep+' is in the reports logged so far.':'No scenes match this filter.'):'No reports logged yet. Add the first daily report to start the list.';
      return '<div class="tablewrap"><p class="empty">'+esc(msg)+'</p></div>';
    }
    var eps=[],by={};rows.forEach(function(t){if(!by[t.ep]){by[t.ep]=[];eps.push(t.ep)}by[t.ep].push(t)});
    var html='<div class="tablewrap"><table>'+HEAD+'<tbody>';
    eps.forEach(function(ep){
      var g=by[ep],u={};g.forEach(function(x){u[x.key]=1});var n=Object.keys(u).length,rn=g.filter(function(x){return x.ext}).length,open=ui.openEp===ep;
      html+='<tr class="grp'+(open?' open':'')+'"><td colspan="4"><button type="button" class="grpbtn" data-ep="'+ep+'" aria-expanded="'+open+'">Episode '+ep+'<span class="muted" style="font:600 13px var(--body)">'+n+' scene'+(n===1?'':'s')+(rn?' · '+rn+' reshoot'+(rn===1?'':'s'):'')+'</span><span class="chev" aria-hidden="true">›</span></button></td></tr>';
      if(open)html+=g.map(function(t){return row(t,hit)}).join('');
    });
    return html+'</tbody></table></div>';
  }

  function sceneListText(list){
    return list.slice().sort(function(x,y){return cmpKey(keyOf(x.ep,x.sc),keyOf(y.ep,y.sc))}).map(function(s){
      return '<span class="mono">'+esc(keyOf(s.ep,s.sc))+'</span> '+tagsHtml(s.tags)+(s.note?'<span class="muted">('+esc(s.note)+')</span>':'');
    }).join(' &nbsp;·&nbsp; ');
  }

  function renderDays(){
    var kw=locQuery(),days=kw?locHits(kw).reverse():daysAsc().reverse();
    if(kw&&!days.length)return '';
    if(!days.length)return '<div class="tablewrap"><p class="empty">No daily reports logged yet.</p></div>';
    var html='<div class="tablewrap"><table class="daytbl"><thead><tr><th>Shoot day</th><th>Location</th><th class="num hide-sm">Scenes</th><th class="num hide-sm">Pages</th><th class="num hide-sm">Call to wrap</th></tr></thead><tbody>';
    days.forEach(function(d){
      var open=ui.openDay===d.day,ents=entriesOf(d);
      html+='<tr class="d" tabindex="0" role="button" aria-expanded="'+open+'" data-day="'+d.day+'"><td class="when"><span class="caret">›</span><strong>'+esc(dayRef(d))+'</strong></td><td class="loc">'+esc(d.location)+'</td><td class="num hide-sm">'+ents.length+'</td><td class="num hide-sm">'+esc(d.pages||'')+'</td><td class="num hide-sm">'+esc(hours(d))+'</td></tr>';
      if(open){
        html+='<tr class="detail"><td colspan="5"><dl class="dl">'
          +(d.location?'<dt>Location</dt><dd>'+esc(d.location)+'</dd>':'')
          +'<dt>Log sheet</dt><dd>'+(logLink(d,'Open Day '+esc(d.day)+' log sheet')||'<span class="muted">Not linked yet. Find it in the </span><a class="log" href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Log sheets folder \u2197</a>')+'</dd>'
          +(d.cast?'<dt>Cast</dt><dd>'+esc(d.cast)+'</dd>':'')
          +'<dt>Shot</dt><dd>'+ents.length+' scene'+(ents.length===1?'':'s')+(d.pages?' \u00b7 '+esc(d.pages)+' pages':'')+(hours(d)?' \u00b7 call to wrap '+esc(hours(d)):'')+'</dd>'
          +((d.times&&d.times.length)?'<dt>Times</dt><dd>'+d.times.map(function(t){return esc(t.label)+' <span class="mono">'+esc(t.time)+'</span>'}).join(' · ')+'</dd>':'')
          +'<dt>Scenes</dt><dd>'+sceneListText(ents)+'</dd></dl>'
          +(d.raw?'<details><summary>Original continuity report</summary><pre>'+esc(d.raw)+'</pre></details>':'')
          +'</td></tr>';
      }
    });
    return html+'</tbody></table></div>';
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
      byDay[p.day]=d;
    });
    var days=Object.keys(byDay).map(function(k){return byDay[k]}).sort(function(a,b){return a.day-b.day});
    /* A scene that shows up again on a later day is a reshoot, unless the line says it was completed. */
    var seen={};
    days.forEach(function(d){
      d.shot.forEach(function(s){
        var k=keyOf(s.ep,s.sc);
        if(seen[k]&&s.tags.indexOf('Reshoot')<0&&s.tags.indexOf('Completed')<0){
          if(/\bcomplet|\bcont(inued)?\b|\bfinish/i.test(s.note)){s.tags.push('Completed');s.note=s.note.replace(/\b(completed?|continued|cont|finished)\b/ig,'').replace(/^[\s\-:,]+|[\s\-:,]+$/g,'')}
          else s.tags.push('Reshoot');
        }
        seen[k]=1;
      });
    });
    return days;
  }
  function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({days:state.days,fetchedAt:state.fetchedAt}))}catch(e){}}
  function loadCache(){try{var c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(c&&c.days){state.days=c.days;state.fetchedAt=c.fetchedAt}}catch(e){}}

  async function refresh(){
    if(ui.loading)return;ui.loading=true;ui.error='';renderStatus();
    try{
      var results=await Promise.all(TABS.map(function(t,i){return loadTab(t).catch(function(e){return i===0?Promise.reject(e):null})}));
      if(!results[0]||results[0].status==='error')throw new Error('sheet');
      var sheetRows=rowsOf(results[0]),formRows=rowsOf(results[1]);
      /* Google answers a request for a tab that does not exist with the first tab. Spot that and drop it. */
      if(formRows.length&&sheetRows.length&&formRows.length===sheetRows.length&&formRows[0].raw===sheetRows[0].raw)formRows=[];
      state.days=buildDays(sheetRows,formRows);state.fetchedAt=Date.now();saveCache();
      ui.offline=false;
    }catch(e){
      ui.offline=!navigator.onLine;
      ui.error=state.days.length?'':(ui.offline?'You are offline and nothing has been saved on this phone yet. Open the app once with signal.':'Could not load the reports. Check your connection and tap Refresh.');
    }
    ui.loading=false;renderAll();
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
    document.getElementById('q').addEventListener('input',function(){if(this.value){document.getElementById('loc').value='';ui.view='scenes';renderControls()}renderAnswer();renderMain()});
    document.getElementById('loc').addEventListener('input',function(){if(this.value){document.getElementById('q').value='';ui.view='days';var h=locHits(this.value.trim());ui.openDay=h.length===1?h[0].day:null;renderControls()}renderAnswer();renderMain()});
    var app=document.getElementById('app');
    app.addEventListener('click',onClick);
    app.addEventListener('change',function(e){if(e.target.id==='f-show'){ui.show=e.target.value;renderMain()}});
    app.addEventListener('keydown',function(e){var r=e.target.closest&&e.target.closest('tr.d');if(r&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggleDay(+r.dataset.day)}});
  }

  function renderHeader(){
    var last=daysAsc().slice(-1)[0];
    document.getElementById('stats').innerHTML='<div class="cyc">'+esc(CYCLE)+'</div><div><dt>Last report</dt><dd>'+(last?esc(dayRef(last)):'None')+'</dd></div>';
    document.getElementById('acts').innerHTML=
      (installPrompt?'<button type="button" class="btn primary" data-act="install">Install app</button>':'')
      +'<a class="btn" href="'+LOG_FOLDER+'" target="_blank" rel="noopener">Log sheets ↗</a>'
      ;
    document.getElementById('foot').innerHTML='<strong>Continuity team:</strong> add each day\u2019s report in the <a href="'+esc(FORM_URL||SHEET_URL)+'" target="_blank" rel="noopener">tracker sheet \u2197</a>. The app picks it up on the next refresh.';
    var hint=document.getElementById('installhint'),dismissed=false;
    try{dismissed=localStorage.getItem('njw-ios-hint')==='1'}catch(e){}
    hint.innerHTML=(isIos()&&!standalone()&&!dismissed)?'<div class="installnote"><span>Install on iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span><button type="button" class="btn small" data-act="hide-hint">OK</button></div>':'';
  }

  function renderStatus(){
    var el=document.getElementById('sync');if(!el)return;
    var n=state.days.length,parts=[];
    if(ui.loading)parts.push('Checking for new reports…');
    else if(ui.offline&&n)parts.push('<strong>Offline.</strong> Showing reports saved on this phone ('+esc(fmtWhen(state.fetchedAt))+').');
    else if(state.fetchedAt)parts.push('Up to date, '+esc(fmtWhen(state.fetchedAt))+' · '+n+' shoot day'+(n===1?'':'s'));
    el.className='sync'+(ui.offline?' off':'')+(ui.error?' err':'');
    el.innerHTML=(ui.error?esc(ui.error):parts.join(' '))+(ui.loading?'':' <button type="button" class="linkbtn" data-act="refresh">Refresh</button>');
  }

  function toggleDay(day){ui.openDay=ui.openDay===day?null:day;renderMain()}
  function renderMain(){document.getElementById('main').innerHTML=ui.view==='scenes'?renderScenes():renderDays()}
  function renderAll(){renderHeader();renderStatus();renderAnswer();renderControls();renderMain()}

  function onClick(ev){
    var b=ev.target.closest('button,tr.d');if(!b)return;
    if(b.matches('tr.d')){toggleDay(+b.dataset.day);return}
    if(b.dataset.ep){var e=+b.dataset.ep;ui.openEp=ui.openEp===e?null:e;var q=document.getElementById('q');if(q.value){q.value='';renderAnswer()}renderMain();return}
    if(b.dataset.view){ui.view=b.dataset.view;try{localStorage.setItem('njw-view',ui.view)}catch(e){}renderControls();renderMain();return}
    var act=b.dataset.act;
    if(act==='refresh'){refresh();return}
    if(act==='hide-hint'){try{localStorage.setItem('njw-ios-hint','1')}catch(e){}renderHeader();return}
    if(act==='install'&&installPrompt){var p=installPrompt;installPrompt=null;p.prompt();p.userChoice.finally(renderHeader);return}
  }

  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installPrompt=e;renderHeader()});
  window.addEventListener('appinstalled',function(){installPrompt=null;renderHeader()});
  window.addEventListener('online',function(){ui.offline=false;refresh()});
  window.addEventListener('offline',function(){ui.offline=true;renderStatus()});
  document.addEventListener('visibilitychange',function(){if(!document.hidden&&navigator.onLine&&Date.now()-(state.fetchedAt||0)>5*60000)refresh()});

  loadCache();
  renderShell();
  renderAll();
  refresh();
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(function(){});
  window.__njw={state:state,buildDays:buildDays,parseReport:parseReport,refresh:refresh};
})();
