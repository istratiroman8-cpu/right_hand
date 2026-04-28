'use strict';

/* ─────────────────────────────────────────────────────────────
   Roman Task Manager — v4.1 final
   Fixes vs v4.0:
   · Event delegation wired ONCE on stable containers, not per-render
   · Confetti closure bug fixed (IIFE per iteration)
   · Dead code removed (unused setBadge, unused snap in toggleDone)
   · taskOrder keys normalised to String, snoozeMap keys to Number
   · data-snclear (no camelCase ambiguity) replaces data-sn-clear
   · select/input font-size 16px → prevents iOS Safari auto-zoom
   · Credit section progress bar wired
   · goSection uses switch, no string array indexOf
   · applyTheme before first paint
   · All null-guards tightened, removeChild instead of .remove()
───────────────────────────────────────────────────────────── */

/* ══ HELPERS ══ */
function $(id)      { return document.getElementById(id); }
function pad2(n)    { return String(n).padStart(2, '0'); }
function numId(x)   { return Number(x) || 0; }
function strId(x)   { return String(numId(x)); }

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function yesterdayStr() {
  var d = new Date(); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fmtDate(s) {
  if (!s) return '';
  var p = s.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sanitize(s) { return String(s || '').trim().slice(0, 500); }

/* ══ CONFIG ══ */
var CFG_KEY      = 'roman-cfg-v4';
var CFG_DEFAULTS = { theme:'dark', sound:true, vib:true, notif:false, autoDelOn:false, autoDelSecs:5 };
var CFG = {};
try { CFG = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch(e) { CFG = {}; }
Object.keys(CFG_DEFAULTS).forEach(function(k) { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });
function saveCFG() { try { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); } catch(e) {} }

/* ══ THEME ══ */
function applyTheme(pref) {
  pref = pref || CFG.theme;
  var dark = pref === 'auto'
    ? window.matchMedia('(prefers-color-scheme:dark)').matches
    : pref !== 'light';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var mt = $('meta-theme');
  if (mt) mt.content = dark ? '#111111' : '#ffffff';
}

/* ══ STATE ══ */
var tasks        = [];
var taskOrder    = {};   /* keys: String(id) → Number */
var editingId    = null; /* Number | null */
var activeCat    = 'university';
var notifEnabled = false;
var TASKS_KEY    = 'roman-tasks-v4';
var ORDER_KEY    = 'roman-order-v4';

/* ── Persistence ── */
function loadData() {
  try {
    var raw = localStorage.getItem(TASKS_KEY) || localStorage.getItem('roman-tasks-v3') || '[]';
    var p   = JSON.parse(raw);
    tasks   = Array.isArray(p)
      ? p.filter(function(t) { return t && typeof t.id === 'number' && typeof t.title === 'string'; })
      : [];
  } catch(e) { tasks = []; }
  try {
    var ord = localStorage.getItem(ORDER_KEY) || localStorage.getItem('roman-order-v3') || '{}';
    var po  = JSON.parse(ord);
    taskOrder = (po && typeof po === 'object' && !Array.isArray(po)) ? po : {};
  } catch(e) { taskOrder = {}; }
}
function save()      { try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch(e) {} }
function saveOrder() { try { localStorage.setItem(ORDER_KEY, JSON.stringify(taskOrder)); } catch(e) {} }

function syncOrder() {
  var max = 0;
  Object.keys(taskOrder).forEach(function(k) { if (taskOrder[k] > max) max = taskOrder[k]; });
  tasks.forEach(function(t) {
    var k = strId(t.id);
    if (!taskOrder[k]) taskOrder[k] = ++max;
  });
  var valid = {};
  tasks.forEach(function(t) { valid[strId(t.id)] = true; });
  Object.keys(taskOrder).forEach(function(k) { if (!valid[k]) delete taskOrder[k]; });
  saveOrder();
}
function applyOrder(arr) {
  return arr.slice().sort(function(a, b) {
    return (taskOrder[strId(a.id)] || 9999) - (taskOrder[strId(b.id)] || 9999);
  });
}
function moveTaskBefore(dragId, targetId) {
  var dk = strId(dragId), tk = strId(targetId);
  taskOrder[dk] = (taskOrder[tk] || 0) - 0.5;
  var entries = Object.keys(taskOrder).map(function(k) { return [k, taskOrder[k]]; });
  entries.sort(function(a, b) { return a[1] - b[1]; });
  entries.forEach(function(e, i) { taskOrder[e[0]] = i + 1; });
  saveOrder();
}
function moveToEnd(id) {
  var max = 0;
  Object.keys(taskOrder).forEach(function(k) { if (taskOrder[k] > max) max = taskOrder[k]; });
  taskOrder[strId(id)] = max + 1;
  saveOrder();
}

/* ══ AUTO-DELETE ══ */
var autoDelTimers = {};
function scheduleAutoDel(taskId) {
  if (!CFG.autoDelOn) return;
  var secs = CFG.autoDelSecs;
  if (secs === 0) { performAutoDel(taskId); return; }
  setTimeout(function() {
    var c = document.querySelector('[data-id="' + taskId + '"]');
    if (c) c.classList.add('fading-out');
  }, Math.max(0, (secs - 0.5) * 1000));
  autoDelTimers[taskId] = setTimeout(function() { performAutoDel(taskId); }, secs * 1000);
}
function cancelAutoDel(taskId) {
  if (autoDelTimers[taskId]) { clearTimeout(autoDelTimers[taskId]); delete autoDelTimers[taskId]; }
  var c = document.querySelector('[data-id="' + taskId + '"]');
  if (c) c.classList.remove('fading-out');
}
function performAutoDel(taskId) {
  delete autoDelTimers[taskId];
  var idx = -1;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId && tasks[i].done) { idx = i; break; }
  }
  if (idx === -1) return;
  tasks.splice(idx, 1);
  delete taskOrder[strId(taskId)];
  snoozeDel(taskId);
  save(); saveOrder(); renderActive();
}

/* ══ SNOOZE — keys always Number ══ */
var snoozeMap = {};
function snoozeHas(id)      { return !!snoozeMap[numId(id)]; }
function snoozeGet(id)      { return snoozeMap[numId(id)]; }
function snoozeSet(id, val) { snoozeMap[numId(id)] = val; }
function snoozeDel(id)      { delete snoozeMap[numId(id)]; }

function fmtCountdown(id) {
  var info = snoozeGet(id); if (!info) return '';
  var rem  = Math.max(0, info.deadline - Date.now());
  if (!rem) return 'scaduto';
  var m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
  return m > 0 ? (m + 'm ' + s + 's') : (s + 's');
}
function doSnooze(id, mins) {
  snoozeSet(id, { deadline: Date.now() + mins * 60000 });
  closeSnMenus(); renderActive();
  toast('Rimandato di ' + mins + ' min', 'sn');
}
function clearSnooze(id) { snoozeDel(id); renderActive(); toast('Rimando rimosso', 'info'); }
function toggleSnMenu(id, e) {
  e.stopPropagation();
  var m = $('sm-' + id); if (!m) return;
  var was = m.classList.contains('open'); closeSnMenus();
  if (!was) m.classList.add('open');
}
function closeSnMenus() {
  document.querySelectorAll('.snooze-menu.open').forEach(function(m) { m.classList.remove('open'); });
}

/* snooze countdown tick */
setInterval(function() {
  var now = Date.now(), changed = false;
  Object.keys(snoozeMap).forEach(function(k) {
    if (!snoozeMap[k]) return;
    if (now >= snoozeMap[k].deadline) {
      var t = findTask(numId(k));
      snoozeDel(numId(k)); changed = true;
      if (t) { toast('"' + t.title.slice(0, 28) + '" rimando scaduto', 'warn'); sendNotif('Rimando scaduto', t.title); }
    }
  });
  if (changed) { renderActive(); return; }
  document.querySelectorAll('.sn-cd').forEach(function(el) {
    el.textContent = fmtCountdown(numId(el.dataset.id));
  });
}, 10000);

/* ══ SECTION NAV ══ */
var currentSection = 'home';
function goSection(name) {
  if (!name) return;
  currentSection = name;
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  var sec = $('sec-' + name); if (sec) sec.classList.add('active');

  document.querySelectorAll('.nav-item[data-section],.bnav-item[data-section],.drawer-item[data-section]')
    .forEach(function(el) {
      var a = el.dataset.section === name;
      el.classList.toggle('active', a);
      el.setAttribute('aria-current', a ? 'page' : 'false');
    });

  var df = $('desk-fab');
  if (df) df.style.display = (name === 'home' || name === 'uni' || name === 'credit') ? 'flex' : 'none';

  switch(name) {
    case 'home':     renderTasks(); break;
    case 'uni':      renderCatSection('university','task-list-uni','empty-uni','prog-fill-uni',''); break;
    case 'credit':   renderCatSection('credit','task-list-credit','empty-credit','prog-fill-credit',''); break;
    case 'pomo':     updatePomoDisplay(); renderPomoStats(); break;
    case 'settings': renderSettingsUI(); break;
  }
}

/* ══ DRAWER ══ */
function openDrawer() {
  $('drawer').classList.add('open');
  $('drawer-ov').classList.add('open');
  $('ham-btn').setAttribute('aria-expanded','true');
}
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawer-ov').classList.remove('open');
  $('ham-btn').setAttribute('aria-expanded','false');
}

/* ══ BADGES ══ */
function updateBadges() {
  var uniN=0, creditN=0, odN=0, doneN=0, total=tasks.length;
  tasks.forEach(function(t) {
    if (t.done) { doneN++; return; }
    if (t.cat === 'university') uniN++;
    if (t.cat === 'credit')    creditN++;
    if (isOverdue(t))          odN++;
  });
  var pct = total > 0 ? Math.round(doneN / total * 100) : 0;

  var sd=$('st-done');   if(sd)  sd.textContent = doneN;
  var so=$('st-od');     if(so)  so.textContent = odN;
  var pf=$('prog-fill'); if(pf)  pf.style.width = pct+'%';
  var nd=$('notif-dot'); if(nd)  nd.style.display = odN>0?'block':'none';
  var nb=$('notif-btn'); if(nb)  nb.classList.toggle('alert', odN>0);

  function grp(sbId,bnId,dibId,n) {
    [sbId,bnId,dibId].forEach(function(id) {
      var el=$(id); if(!el) return;
      el.textContent = n||'';
      if(el.classList.contains('bnav-badge')) el.classList.toggle('show',n>0);
    });
  }
  grp('nb-home',  'bnb-home',  'dib-home',   odN);
  grp('nb-uni',   'bnb-uni',   'dib-uni',    uniN);
  grp('nb-credit','bnb-credit','dib-credit', creditN);
}

/* ══ FILTER / SORT ══ */
function isOverdue(t) { return !t.done && !!t.date && t.date < todayStr(); }
var _rt = null;
function debouncedRender() { clearTimeout(_rt); _rt = setTimeout(renderTasks, 120); }

function getFiltered() {
  var list = tasks.slice();
  var q = ($('search-in') ? $('search-in').value : '').toLowerCase().trim();
  if (q) list = list.filter(function(x) {
    return ['title','note','subtitle','label'].some(function(f) {
      return (x[f]||'').toLowerCase().indexOf(q) !== -1;
    });
  });
  var sort = $('sort-sel') ? $('sort-sel').value : 'manual';
  var P = {high:0,medium:1,low:2};
  switch(sort) {
    case 'manual':   return applyOrder(list);
    case 'date':     return list.sort(function(a,b){ return (a.date||'9999')<(b.date||'9999')?-1:1; });
    case 'priority': return list.sort(function(a,b){ return (P[a.priority]||1)-(P[b.priority]||1); });
    case 'cat':      return list.sort(function(a,b){ return (a.cat||'').localeCompare(b.cat||''); });
    default:         return list.sort(function(a,b){ return b.id-a.id; });
  }
}

/* ══ RENDER ══ */
var CAT_LABELS = { university:'Università', credit:'Credito', personal:'Personale', urgent:'Urgente' };

function renderTasks() {
  var list=$('task-list'), emptyEl=$('empty-home');
  if(!list||!emptyEl) return;
  var filtered = getFiltered();
  updateBadges();
  if(!filtered.length) { list.innerHTML=''; emptyEl.style.display='flex'; return; }
  emptyEl.style.display='none';
  var pending   = filtered.filter(function(x){ return !x.done; });
  var completed = filtered.filter(function(x){ return  x.done; });
  var html='';
  if(pending.length)   html += renderGroup('Da completare', pending);
  if(completed.length) html += renderGroup('Completati', completed);
  list.innerHTML = html;
  attachDrag(list);
}

function renderCatSection(cat, listId, emptyId, progId, q) {
  var list=$( listId), emptyEl=$(emptyId);
  if(!list||!emptyEl) return;
  var sq = (q||'').toLowerCase();
  var all = tasks.filter(function(x){ return x.cat===cat; });
  var filtered = sq ? all.filter(function(x){
    return ['title','note','subtitle','label'].some(function(f){ return (x[f]||'').toLowerCase().indexOf(sq)!==-1; });
  }) : all;

  if(progId) {
    var dN=all.filter(function(x){return x.done;}).length;
    var pf=$(progId); if(pf) pf.style.width=(all.length>0?Math.round(dN/all.length*100):0)+'%';
  }
  if(!filtered.length) { list.innerHTML=''; emptyEl.style.display='flex'; return; }
  emptyEl.style.display='none';
  var pending = filtered.filter(function(x){return !x.done;});
  var done    = filtered.filter(function(x){return  x.done;});
  var html='';
  if(pending.length) html += renderGroup('Da completare', applyOrder(pending));
  if(done.length)    html += renderGroup('Completati',    applyOrder(done));
  list.innerHTML = html;
  attachDrag(list);
}

function renderActive() {
  switch(currentSection) {
    case 'home':   renderTasks(); break;
    case 'uni':    renderCatSection('university','task-list-uni','empty-uni','prog-fill-uni',$('search-uni')?$('search-uni').value:''); break;
    case 'credit': renderCatSection('credit','task-list-credit','empty-credit','prog-fill-credit',$('search-credit')?$('search-credit').value:''); break;
  }
  updateBadges();
}

function renderGroup(label, arr) {
  return '<div class="task-group-hdr"><span class="group-lbl">'+label+' ('+arr.length+')</span><div class="group-line"></div></div>'
    + arr.map(renderCard).join('');
}

function renderCard(t) {
  var od=isOverdue(t), sn=snoozeHas(t.id);
  var pCls  = ({high:'ph',medium:'pm',low:'pl'})[t.priority]||'pl';
  var pLbl  = ({high:'Alta',medium:'Media',low:'Bassa'})[t.priority]||'';
  var tagCls= ({university:'tag-u',credit:'tag-c',personal:'tag-p',urgent:'tag-urg'})[t.cat]||'';

  var dateStr = t.date
    ? '<span class="task-date'+(od?' od':'')+'">📅 '+fmtDate(t.date)+(t.time?' '+t.time:'')+(od?' · SCAD.':'')+' </span>'
    : '';
  var snBadge = sn
    ? '<span class="snooze-tag" data-snooze="'+t.id+'">⏳ <span class="sn-cd" data-id="'+t.id+'">'+fmtCountdown(t.id)+'</span> ×</span>'
    : '';
  var noteHtml = t.note
    ? '<div class="task-note">'+esc(t.note.length>90?t.note.slice(0,90)+'…':t.note)+'</div>'
    : '';
  /* data-snclear: single word, no camelCase ambiguity */
  var cancelOpt = sn
    ? '<button class="sn-opt cancel" data-snclear="'+t.id+'">× Annulla rimando</button>'
    : '';

  return '<div class="task-card cat-'+t.cat+(t.done?' done':'')+(sn?' snoozed':'')+(od?' od-glow':'')+'" data-id="'+t.id+'" role="listitem" tabindex="0">'
    +'<div class="drag-handle" aria-hidden="true">⋮⋮</div>'
    +'<div class="task-check'+(t.done?' checked':'')+'" data-check="'+t.id+'" role="checkbox" aria-checked="'+t.done+'" aria-label="'+(t.done?'Segna da fare':'Segna completata')+'" tabindex="0"></div>'
    +'<div class="task-body">'
      +'<div class="task-title">'+esc(t.title)+'</div>'
      +noteHtml
      +'<div class="task-meta">'
        +'<span class="tag '+tagCls+'">'+(CAT_LABELS[t.cat]||t.cat)+'</span>'
        +(t.label?'<span class="tag tag-custom">'+esc(t.label)+'</span>':'')
        +(t.subtitle?'<span class="task-sub">'+esc(t.subtitle)+'</span>':'')
        +dateStr
        +'<span class="prio-badge '+pCls+'">'+pLbl+'</span>'
        +snBadge
      +'</div>'
    +'</div>'
    +'<div class="task-actions">'
      +'<div class="snooze-wrap">'
        +'<button class="act-btn" data-snmenu="'+t.id+'" aria-label="Rimanda">⏳</button>'
        +'<div class="snooze-menu" id="sm-'+t.id+'" role="menu">'
          +'<button class="sn-opt" data-sn="'+t.id+'" data-mins="10">⏱ +10 min</button>'
          +'<button class="sn-opt" data-sn="'+t.id+'" data-mins="15">⏱ +15 min</button>'
          +'<button class="sn-opt" data-sn="'+t.id+'" data-mins="30">⏱ +30 min</button>'
          +'<button class="sn-opt" data-sn="'+t.id+'" data-mins="60">⏱ +1 ora</button>'
          +cancelOpt
        +'</div>'
      +'</div>'
      +'<button class="act-btn" data-urgent="'+t.id+'" aria-label="Urgente">⚡</button>'
      +'<button class="act-btn" data-edit="'+t.id+'" aria-label="Modifica">✎</button>'
      +'<button class="act-btn del" data-del="'+t.id+'" aria-label="Elimina">×</button>'
    +'</div>'
  +'</div>';
}

/* ══ CARD DELEGATION — wired ONCE on stable containers ══ */
function wireCardDelegation() {
  ['task-list','task-list-uni','task-list-credit'].forEach(function(id) {
    var el=$(id); if(!el) return;
    el.addEventListener('click',   handleCardClick);
    el.addEventListener('keydown', handleCardKey);
  });
}
function handleCardClick(e) {
  var tgt=e.target;
  var chk=tgt.closest('[data-check]');   if(chk){ e.stopPropagation(); toggleDone(numId(chk.dataset.check)); return; }
  var del=tgt.closest('[data-del]');     if(del){ e.stopPropagation(); delTask(numId(del.dataset.del)); return; }
  var edt=tgt.closest('[data-edit]');   if(edt){ e.stopPropagation(); openEdit(numId(edt.dataset.edit)); return; }
  var urg=tgt.closest('[data-urgent]'); if(urg){ e.stopPropagation(); toggleUrgent(numId(urg.dataset.urgent)); return; }
  var snm=tgt.closest('[data-snmenu]'); if(snm){ toggleSnMenu(numId(snm.dataset.snmenu),e); return; }
  var sno=tgt.closest('[data-sn]');     if(sno&&sno.dataset.mins){ e.stopPropagation(); doSnooze(numId(sno.dataset.sn),Number(sno.dataset.mins)); return; }
  var snc=tgt.closest('[data-snclear]');if(snc){ e.stopPropagation(); clearSnooze(numId(snc.dataset.snclear)); return; }
  var snt=tgt.closest('[data-snooze]'); if(snt){ e.stopPropagation(); clearSnooze(numId(snt.dataset.snooze)); return; }
  var card=tgt.closest('.task-card');
  if(card&&!tgt.closest('.task-actions')&&!tgt.closest('.snooze-menu')) openEdit(numId(card.dataset.id));
}
function handleCardKey(e) {
  if(e.key!=='Enter'&&e.key!==' ') return;
  var chk=e.target.closest('[data-check]');
  if(chk){ e.preventDefault(); toggleDone(numId(chk.dataset.check)); return; }
  var card=e.target.closest('.task-card');
  if(card){ e.preventDefault(); openEdit(numId(card.dataset.id)); }
}

/* ══ TASK OPS ══ */
function findTask(id) {
  var n=numId(id);
  for(var i=0;i<tasks.length;i++){ if(tasks[i].id===n) return tasks[i]; }
  return null;
}
function toggleDone(id) {
  var t=findTask(id); if(!t) return;
  t.done=!t.done;
  if(t.done) {
    snoozeDel(id); t.doneAt=Date.now();
    (function(cid,ctitle) {
      toast('"'+ctitle.slice(0,28)+'" completato!','ok',function() {
        cancelAutoDel(cid);
        var s=findTask(cid); if(s){ s.done=false; delete s.doneAt; }
        save(); renderActive();
      });
      scheduleAutoDel(cid);
    })(id, t.title);
    if(tasks.length>0 && tasks.every(function(x){return x.done;})) spawnConfetti();
  } else {
    cancelAutoDel(id); delete t.doneAt;
  }
  if(CFG.vib && navigator.vibrate) navigator.vibrate(t.done?[28,10,18]:10);
  save(); renderActive();
}
function toggleUrgent(id) {
  var t=findTask(id); if(!t) return;
  if(t.cat==='urgent'){ t.cat=t._prev||'personal'; delete t._prev; toast('Rimosso dagli urgenti','info'); }
  else { t._prev=t.cat; t.cat='urgent'; toast('Urgente!','info'); }
  save(); renderActive();
}
function delTask(id) {
  var t=findTask(id); if(!t) return;
  if(!window.confirm('Eliminare "'+t.title+'"?')) return;
  cancelAutoDel(id);
  var st=JSON.parse(JSON.stringify(t));
  var so=taskOrder[strId(id)];
  for(var i=0;i<tasks.length;i++){ if(tasks[i].id===id){ tasks.splice(i,1); break; } }
  delete taskOrder[strId(id)]; snoozeDel(id);
  save(); saveOrder(); renderActive();
  (function(snap,snapOrd) {
    toast('Task eliminata','info',function() {
      if(!findTask(snap.id)){ tasks.push(snap); if(snapOrd!=null) taskOrder[strId(snap.id)]=snapOrd; syncOrder(); save(); renderActive(); }
    });
  })(st,so);
}

/* ══ MODAL ══ */
function openModal(pre) {
  pre=pre||{}; editingId=(pre.id!=null)?numId(pre.id):null;
  $('modal-h').textContent=editingId?'Modifica Task':'Nuova Task';
  $('f-title').value=$('f-date').value=$('f-time').value='';
  $('f-title').value=pre.title||''; $('f-date').value=pre.date||''; $('f-time').value=pre.time||'';
  $('f-prio').value=pre.priority||'medium'; $('f-sub').value=pre.subtitle||'';
  $('f-label').value=pre.label||''; $('f-note').value=pre.note||'';
  $('f-title').style.borderColor='';
  $('del-btn').style.display=editingId?'flex':'none';
  selCat(pre.cat||activeCat);
  $('modal-ov').classList.add('open');
  setTimeout(function(){ $('f-title').focus(); },150);
}
function openEdit(id){ var t=findTask(id); if(t) openModal(t); }
function closeModal() {
  $('modal-ov').classList.remove('open'); editingId=null;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
}
function saveTask() {
  var inp=$('f-title'), title=sanitize(inp.value);
  if(!title){ inp.style.borderColor='var(--red)'; inp.focus(); return; }
  inp.style.borderColor='';
  var isEdit=editingId!=null, orig=isEdit?findTask(editingId):null;
  var d={
    id:isEdit?editingId:Date.now(), title:title, cat:activeCat,
    date:$('f-date').value||'', time:$('f-time').value||'',
    priority:$('f-prio').value||'medium',
    subtitle:sanitize($('f-sub').value), label:sanitize($('f-label').value),
    note:sanitize($('f-note').value), done:orig?orig.done:false
  };
  if(orig&&orig.done&&orig.doneAt) d.doneAt=orig.doneAt;
  if(orig&&orig._prev)             d._prev=orig._prev;
  if(isEdit) {
    var idx=-1; for(var i=0;i<tasks.length;i++){ if(tasks[i].id===editingId){idx=i;break;} }
    if(idx!==-1){ tasks[idx]=d; toast('Task aggiornata','info'); }
    else        { tasks.push(d); syncOrder(); toast('Task ricreata','ok'); }
  } else { tasks.push(d); syncOrder(); toast('Task aggiunta!','ok'); }
  save(); closeModal(); renderActive();
}
function selCat(cat) {
  activeCat=cat;
  document.querySelectorAll('.cat-opt').forEach(function(b){ b.classList.toggle('sel',b.dataset.cat===cat); });
}
function delCurrentTask(){ if(!editingId) return; closeModal(); delTask(editingId); }

/* ══ POMODORO  r=83 → C≈521.50 ══ */
var POMO_R    = 2*Math.PI*83;
var POMO_MODES= { work:{label:'Lavoro',secs:25*60}, short:{label:'Pausa Breve',secs:5*60}, long:{label:'Pausa Lunga',secs:15*60} };
var POMO_ORDER=['work','short','long'];
var pomoMode='work', pomoSecs=25*60, pomoRunning=false, pomoInterval=null;

function getPomoSt() {
  try{ return JSON.parse(localStorage.getItem('roman-pomo-v4')||'{"today":0,"total":0,"streak":0,"lastDate":""}'); }
  catch(e){ return {today:0,total:0,streak:0,lastDate:''}; }
}
function savePomoSt(st){ try{ localStorage.setItem('roman-pomo-v4',JSON.stringify(st)); }catch(e){} }

function setPomoMode(mode) {
  if(pomoRunning) stopPomo();
  pomoMode=mode; pomoSecs=POMO_MODES[mode].secs;
  POMO_ORDER.forEach(function(m){ var b=$('pm-'+m); if(!b) return; var a=m===mode; b.classList.toggle('active',a); b.setAttribute('aria-pressed',String(a)); });
  updatePomoDisplay();
}
function prevPomoMode(){ var i=POMO_ORDER.indexOf(pomoMode); setPomoMode(POMO_ORDER[(i-1+3)%3]); }
function nextPomoMode(){ var i=POMO_ORDER.indexOf(pomoMode); setPomoMode(POMO_ORDER[(i+1)%3]); }
function togglePomo(){ pomoRunning?pausePomo():startPomo(); }
function startPomo() {
  if(pomoRunning) return;
  pomoRunning=true; $('pomo-play-icon').textContent='pause'; $('pomo-play-btn').setAttribute('aria-label','Pausa');
  var fp=null; for(var i=0;i<tasks.length;i++){ if(!tasks[i].done){fp=tasks[i];break;} }
  var pan=$('pomo-active-task'); if(pan) pan.textContent=fp?('🎯 '+fp.title.slice(0,40)):'';
  pomoInterval=setInterval(tickPomo,1000);
}
function pausePomo() {
  pomoRunning=false; if(pomoInterval){clearInterval(pomoInterval);pomoInterval=null;}
  $('pomo-play-icon').textContent='play_arrow'; $('pomo-play-btn').setAttribute('aria-label','Avvia');
}
function stopPomo(){ pausePomo(); pomoSecs=POMO_MODES[pomoMode].secs; updatePomoDisplay(); }
function tickPomo(){ if(pomoSecs>0) pomoSecs--; updatePomoDisplay(); if(pomoSecs<=0){pausePomo();onPomoComplete();} }
function onPomoComplete() {
  beep();
  if(CFG.vib&&navigator.vibrate) navigator.vibrate([100,50,100,50,100]);
  if(pomoMode==='work') {
    var st=getPomoSt(), today=todayStr(), yest=yesterdayStr();
    st.today =(st.lastDate===today?(st.today||0):0)+1;
    st.total =(st.total||0)+1;
    st.streak=(st.lastDate===today||st.lastDate===yest)?(st.streak||0)+1:1;
    st.lastDate=today; savePomoSt(st); renderPomoStats();
    toast('Pomodoro completato!','ok'); sendNotif('🍅 Pomodoro!','Ottimo lavoro! Prenditi una pausa.');
    updateBadges(); setTimeout(function(){setPomoMode('short');},600);
  } else {
    toast('Pausa finita!','info'); sendNotif('Pausa finita!','Pronto a riprendere?');
    setTimeout(function(){setPomoMode('work');},600);
  }
}
function updatePomoDisplay() {
  var total=POMO_MODES[pomoMode].secs, elapsed=total-pomoSecs;
  var ring=$('pomo-ring');
  if(ring){ ring.style.strokeDasharray=String(POMO_R); ring.style.strokeDashoffset=String(POMO_R*(1-elapsed/total)); }
  var d=$('pomo-display'); if(d) d.textContent=pad2(Math.floor(pomoSecs/60))+':'+pad2(pomoSecs%60);
  var ph=$('pomo-phase'); if(ph) ph.textContent=POMO_MODES[pomoMode].label;
}
function renderPomoStats() {
  var st=getPomoSt(), today=todayStr();
  var t=$('ps-today');  if(t)  t.textContent=st.lastDate===today?(st.today||0):0;
  var tt=$('ps-total'); if(tt) tt.textContent=st.total||0;
  var ts=$('ps-streak');if(ts) ts.textContent=st.streak||0;
}

/* ══ AUDIO ══ */
var audioCtx=null;
function getACtx() {
  if(!audioCtx){ try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return null;} }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function beep() {
  if(!CFG.sound) return;
  try {
    var ctx=getACtx(); if(!ctx) return;
    var g=ctx.createGain(); g.connect(ctx.destination);
    [0,0.35,0.7].forEach(function(delay) {
      var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=880;
      g.gain.setValueAtTime(0.28,ctx.currentTime+delay);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+0.28);
      o.connect(g); o.start(ctx.currentTime+delay); o.stop(ctx.currentTime+delay+0.32);
    });
  } catch(e){}
}

/* ══ NOTIFICATIONS ══ */
function sendNotif(title,body) {
  if(!notifEnabled||typeof Notification==='undefined'||Notification.permission!=='granted') return;
  try{ new Notification(title,{body:body}); }catch(e){}
}
function handleNotifToggle(el) {
  if(!el.checked){ notifEnabled=false; CFG.notif=false; saveCFG(); toast('Notifiche disattivate','info'); return; }
  if(typeof Notification==='undefined'){ toast('Browser non supporta le notifiche','warn'); el.checked=false; return; }
  if(Notification.permission==='denied'){ toast('Permesso negato — abilita nelle impostazioni','warn'); el.checked=false; return; }
  if(Notification.permission==='granted'){ notifEnabled=true; CFG.notif=true; saveCFG(); toast('Notifiche attivate!','ok'); return; }
  Notification.requestPermission().then(function(p) {
    if(p==='granted'){ notifEnabled=true; CFG.notif=true; saveCFG(); toast('Notifiche attivate!','ok'); }
    else{ el.checked=false; toast('Permesso negato','warn'); }
  });
}

/* ══ SETTINGS ══ */
function renderSettingsUI() {
  ['dark','light','auto'].forEach(function(t){ var el=$('t-'+t); if(!el) return; el.classList.toggle('on',CFG.theme===t); el.setAttribute('aria-pressed',String(CFG.theme===t)); });
  var tn=$('tog-notif');   if(tn)  tn.checked=CFG.notif||notifEnabled;
  var ts=$('tog-sound');   if(ts)  ts.checked=CFG.sound;
  var tv=$('tog-vib');     if(tv)  tv.checked=CFG.vib;
  var ta=$('tog-autodel'); if(ta)  ta.checked=CFG.autoDelOn;
  var as=$('autodel-secs');if(as)  as.value=CFG.autoDelSecs;
  updateAutoDelLbl(); renderPomoStats();
}
function setTheme(t){ CFG.theme=t; saveCFG(); applyTheme(t); renderSettingsUI(); }
function updateAutoDelLbl() {
  var txt=CFG.autoDelSecs===0?'Istantaneo':CFG.autoDelSecs+' sec';
  var v=$('autodel-val');   if(v)  v.textContent=txt;
  var s=$('auto-del-sub');  if(s)  s.textContent=CFG.autoDelOn?('Attivo — '+txt):'Disattivato';
}

/* ══ EXPORT / IMPORT / PDF ══ */
function exportJSON() {
  try {
    var blob=new Blob([JSON.stringify({tasks:tasks,order:taskOrder,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='roman-'+todayStr()+'.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(a.href); },200);
    toast('Export completato!','ok');
  } catch(e){ toast('Errore export','warn'); }
}
function importJSON(){ $('import-file').click(); }
function handleImport(e) {
  var file=e.target.files[0]; if(!file) return;
  var r=new FileReader();
  r.onload=function(ev) {
    try {
      var data=JSON.parse(ev.target.result);
      if(!data.tasks||!Array.isArray(data.tasks)) throw new Error('Formato non valido');
      var valid=data.tasks.filter(function(t){ return t&&typeof t.id==='number'&&typeof t.title==='string'; });
      if(!valid.length){ toast('Nessuna task valida','warn'); return; }
      if(!window.confirm('Importare '+valid.length+' task? I dati attuali saranno sostituiti.')) return;
      Object.keys(autoDelTimers).forEach(function(id){ cancelAutoDel(numId(id)); });
      tasks=valid;
      if(data.order&&typeof data.order==='object'&&!Array.isArray(data.order)) {
        taskOrder={};
        Object.keys(data.order).forEach(function(k){ taskOrder[k]=Number(data.order[k]); });
      }
      syncOrder(); save(); renderActive(); toast('Importate '+tasks.length+' task!','ok');
    } catch(err){ toast('Errore: '+(err.message||'JSON non valido'),'warn'); }
  };
  r.readAsText(file); e.target.value='';
}
function exportPDF() {
  var od=tasks.filter(isOverdue);
  if(!od.length){ toast('Nessun task scaduto','info'); return; }
  var w=window.open('','_blank');
  if(!w){ toast('Popup bloccato — abilita i popup','warn'); return; }
  var rows=od.map(function(t){
    return '<tr class="'+(t.priority==='high'?'urg':'')+'"><td>'+esc(t.title)+'</td><td>'+(CAT_LABELS[t.cat]||t.cat)+'</td><td>'+fmtDate(t.date)+'</td><td>'+(t.priority||'')+'</td><td>'+esc(t.note||'')+'</td></tr>';
  }).join('');
  w.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/><title>Scaduti Roman</title>'
    +'<style>body{font-family:monospace;padding:24px;color:#111;}h1{font-size:16px;margin-bottom:14px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:7px;font-size:11px;text-align:left;}th{background:#f5f5f5;}.urg{color:#b94040;font-weight:700;}</style></head>'
    +'<body><h1>Task Scadute — '+new Date().toLocaleDateString('it-IT')+'</h1>'
    +'<table><thead><tr><th>Titolo</th><th>Cat.</th><th>Scadenza</th><th>Priorità</th><th>Note</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>');
  w.document.close(); setTimeout(function(){ w.print(); },400);
}

/* ══ CREDIT CALC ══ */
function toggleCalc(){ var p=$('calc-panel'); if(p) p.classList.toggle('open'); }
function calcCredit() {
  var r=parseFloat($('cc-r').value)||0, re=parseFloat($('cc-re').value)||0;
  var rn=parseFloat($('cc-rn').value)||0, p=parseFloat($('cc-p').value)||0, f=parseFloat($('cc-f').value)||0;
  var res=$('cc-res');
  if(!r){ res.innerHTML='<div style="font-size:10px;color:var(--muted);text-align:center;">Inserisci il reddito netto mensile</div>'; return; }
  var dsr=(re+rn)/r*100, pti=rn/r*100, ltv=p>0?f/p*100:0, fc=r-re-rn;
  function g(v,ok,w){ return v<=ok?'ok':v<=w?'w':'bad'; }
  var verdict=dsr<=35&&pti<=30?'🟢 Bancabile':dsr>40||pti>35?'🔴 Non bancabile':'🟡 Borderline';
  res.innerHTML='<div class="calc-metric"><span class="cm-l">DSR (≤35%)</span><span class="cm-v '+g(dsr,35,40)+'">'+dsr.toFixed(1)+'%</span></div>'
    +'<div class="calc-metric"><span class="cm-l">PTI (≤30%)</span><span class="cm-v '+g(pti,30,35)+'">'+pti.toFixed(1)+'%</span></div>'
    +(ltv?'<div class="calc-metric"><span class="cm-l">LTV (≤80%)</span><span class="cm-v '+g(ltv,80,90)+'">'+ltv.toFixed(1)+'%</span></div>':'')
    +'<div class="calc-metric"><span class="cm-l">Free Cash</span><span class="cm-v '+(fc>=400?'ok':fc>=300?'w':'bad')+'">€'+fc.toFixed(0)+'/mese</span></div>'
    +'<div style="margin-top:9px;font-size:12px;text-align:center;font-weight:500;">'+verdict+'</div>';
}

/* ══ CONFETTI — IIFE fixes var-in-loop closure bug ══ */
function spawnConfetti() {
  var colors=['#6c9fff','#7ee8a2','#f4a94e','#c084fc','#c05050'];
  for(var i=0;i<36;i++) {
    (function(color) {
      var el=document.createElement('div'); el.className='cp';
      el.style.cssText=[
        'left:'+(Math.random()*100)+'vw','top:'+(Math.random()*40+20)+'vh',
        'background:'+color,'--cx:'+((Math.random()-0.5)*180)+'px',
        '--cy:'+(Math.random()*-160-40)+'px','animation-delay:'+(Math.random()*0.5)+'s'
      ].join(';');
      document.body.appendChild(el);
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); },1600);
    })(colors[i%5]);
  }
  toast('Tutte le task completate! 🎉','ok');
}

/* ══ TOAST ══ */
function toast(msg,type,undoCb) {
  var zone=$('toast-zone'); if(!zone) return;
  var el=document.createElement('div'); el.className='toast '+(type||'info');
  var sp=document.createElement('span'); sp.textContent=msg; el.appendChild(sp);
  if(undoCb) {
    var u=document.createElement('span'); u.className='t-undo'; u.textContent='Annulla';
    u.addEventListener('click',function(){ undoCb(); if(el.parentNode) el.parentNode.removeChild(el); });
    el.appendChild(u);
  }
  zone.appendChild(el);
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); },3200);
}

/* ══ DRAG & DROP ══ */
var dnd={on:false,id:0,ghost:null,src:null,ox:0,oy:0};
function startDrag(taskId,cx,cy,target) {
  if(target&&(target.closest('button')||target.closest('.task-check')||target.closest('.snooze-wrap'))) return;
  if($('sort-sel')&&$('sort-sel').value!=='manual'){ toast('Passa a "Custom" per trascinare','info'); return; }
  var card=document.querySelector('[data-id="'+taskId+'"]'); if(!card) return;
  var rect=card.getBoundingClientRect();
  var ghost=card.cloneNode(true); ghost.className='drag-ghost';
  ghost.style.width=rect.width+'px'; ghost.style.top=rect.top+'px'; ghost.style.left=rect.left+'px';
  var acts=ghost.querySelector('.task-actions'); if(acts&&acts.parentNode) acts.parentNode.removeChild(acts);
  document.body.appendChild(ghost); card.classList.add('dragging');
  dnd={on:true,id:taskId,ghost:ghost,src:card,ox:cx-rect.left,oy:cy-rect.top};
  document.addEventListener('pointermove',onDragMv,{passive:false});
  document.addEventListener('pointerup',onDragUp);
  document.addEventListener('pointercancel',onDragUp);
}
function onDragMv(e) {
  if(!dnd.on) return; e.preventDefault();
  dnd.ghost.style.left=(e.clientX-dnd.ox)+'px'; dnd.ghost.style.top=(e.clientY-dnd.oy)+'px';
  dnd.ghost.style.pointerEvents='none';
  var hit=document.elementFromPoint(e.clientX,e.clientY);
  dnd.ghost.style.pointerEvents=''; clearDropInds(); if(!hit) return;
  var tc=hit.closest('.task-card');
  if(tc&&tc!==dnd.src) { var r=tc.getBoundingClientRect(); var before=e.clientY<r.top+r.height/2; before?showDropBefore(tc):showDropAfter(tc); tc._dp=before?'before':'after'; }
}
function onDragUp(e) {
  if(!dnd.on) return;
  document.removeEventListener('pointermove',onDragMv);
  document.removeEventListener('pointerup',onDragUp);
  document.removeEventListener('pointercancel',onDragUp);
  try {
    if(dnd.ghost) dnd.ghost.style.pointerEvents='none';
    var hit=e.clientX!=null?document.elementFromPoint(e.clientX,e.clientY):null;
    if(hit){ var tc=hit.closest('.task-card'); if(tc&&tc!==dnd.src){
      if(tc._dp==='before'){ moveTaskBefore(dnd.id,numId(tc.dataset.id)); }
      else { var all=Array.from(document.querySelectorAll('.task-card')); var nc=all[all.indexOf(tc)+1]; nc?moveTaskBefore(dnd.id,numId(nc.dataset.id)):moveToEnd(dnd.id); }
      toast('Ordine salvato','info');
    }}
  } catch(ex){}
  clearDropInds();
  if(dnd.src) dnd.src.classList.remove('dragging');
  if(dnd.ghost&&dnd.ghost.parentNode) dnd.ghost.parentNode.removeChild(dnd.ghost);
  dnd={on:false,id:0,ghost:null,src:null,ox:0,oy:0}; renderActive();
}
function showDropBefore(c) {
  var prev=c.previousSibling;
  if(!prev||!prev.classList||!prev.classList.contains('drop-ind')){ var ind=document.createElement('div'); ind.className='drop-ind'; c.parentNode.insertBefore(ind,c); prev=ind; }
  prev.classList.add('on');
}
function showDropAfter(c) {
  var next=c.nextSibling;
  if(!next||!next.classList||!next.classList.contains('drop-ind')){ var ind=document.createElement('div'); ind.className='drop-ind'; c.parentNode.insertBefore(ind,c.nextSibling); next=ind; }
  next.classList.add('on');
}
function clearDropInds() {
  document.querySelectorAll('.drop-ind.on').forEach(function(el){el.classList.remove('on');});
  document.querySelectorAll('.task-card[data-id]').forEach(function(c){delete c._dp;});
}
function attachDrag(container) {
  (container||document).querySelectorAll('.task-card').forEach(function(card) {
    var h=card.querySelector('.drag-handle'); if(!h) return;
    h.addEventListener('mousedown',function(e){ if(e.button!==0) return; e.preventDefault(); startDrag(numId(card.dataset.id),e.clientX,e.clientY,e.target); });
    h.addEventListener('touchstart',function(e){ if(e.touches.length!==1) return; e.preventDefault(); var t=e.touches[0]; startDrag(numId(card.dataset.id),t.clientX,t.clientY,e.target); },{passive:false});
  });
}

/* ══ SEED ══ */
function seedData() {
  function d(n){ var dt=new Date(); dt.setDate(dt.getDate()+n); return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate()); }
  tasks=[
    {id:1,done:false,title:'Ripassare dimensione Identitario-Spaziale',cat:'university',priority:'high',  date:todayStr(),time:'10:00',subtitle:'Sociologia Urbana',   label:'Esame',       note:'Appartenenza collettiva — Bourdieu/Lefebvre'},
    {id:2,done:false,title:'Analisi pratica mutuo cliente Rossi',       cat:'credit',   priority:'high',  date:todayStr(),time:'14:30',subtitle:'Pratica #2024-087',  label:'LTV/DSR',     note:'DSR e PTI, CRIF, LTV immobile periziato 280k€'},
    {id:3,done:false,title:'Studiare ACP e regressione multipla',       cat:'university',priority:'medium',date:d(1),     time:'',     subtitle:'Metodologia Ricerca',label:'Corbetta',    note:'Cap. 8–10. Eigenvalue e r²'},
    {id:4,done:false,title:'Contattare UniCredit — istruttoria Bianchi',cat:'credit',   priority:'high',  date:d(1),     time:'09:00',subtitle:'Pratica Bianchi',     label:'Istruttoria', note:''},
    {id:5,done:false,title:'Bourdieu — Capitale Sociale e Campo',       cat:'university',priority:'medium',date:d(3),     time:'',     subtitle:'Sociologia Urbana',   label:'',            note:'Habitus, campo e capitale'},
    {id:6,done:false,title:'Invio documentazione cliente Ferri',        cat:'credit',   priority:'high',  date:d(2),     time:'16:00',subtitle:'Prestito Personale',  label:'TAEG',        note:'CU, buste paga 3 mesi, estratto conto 6 mesi'},
    {id:7,done:false,title:'Palestra',                                  cat:'personal', priority:'low',   date:todayStr(),time:'18:30',subtitle:'',                   label:'',            note:''},
    {id:8,done:true, title:'Calcolo LTC pratica ristrutturazione',      cat:'credit',   priority:'medium',date:d(-1),    time:'',     subtitle:'Pratica #2024-092',   label:'LTC',         note:'Acquisto 200k + ristrutturazione 50k', doneAt:Date.now()-86400000}
  ];
  save();
}

/* ══ KEYBOARD ══ */
var kbIdx=-1;
function setupKB() {
  document.addEventListener('keydown',function(e) {
    var tag=document.activeElement?document.activeElement.tagName:'';
    var inInput=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    var modalOpen=$('modal-ov').classList.contains('open');
    if(e.key==='Escape'){ closeModal(); closeSnMenus(); closeDrawer(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&modalOpen){ e.preventDefault(); saveTask(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key==='n'&&!modalOpen){ e.preventDefault(); openModal(); return; }
    if((e.ctrlKey||e.metaKey)&&e.key==='f'&&!modalOpen){ e.preventDefault(); var si=$('search-in'); if(si) si.focus(); return; }
    if((e.ctrlKey||e.metaKey)&&!inInput&&!modalOpen){
      var sec={1:'home',2:'uni',3:'credit',4:'pomo'}[e.key]; if(sec){ e.preventDefault(); goSection(sec); return; }
    }
    if(!inInput&&!modalOpen) {
      var cards=Array.from(document.querySelectorAll('.section.active .task-card'));
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault(); if(!cards.length) return;
        document.querySelectorAll('.task-card.kb-sel').forEach(function(c){c.classList.remove('kb-sel');});
        kbIdx=e.key==='ArrowDown'?Math.min(kbIdx+1,cards.length-1):Math.max(kbIdx-1,0);
        cards[kbIdx].classList.add('kb-sel'); cards[kbIdx].scrollIntoView({block:'nearest'});
      }
      if(e.key==='Enter'&&kbIdx>=0&&cards[kbIdx]) openEdit(numId(cards[kbIdx].dataset.id));
      if((e.key==='Delete'||e.key==='Backspace')&&kbIdx>=0&&cards[kbIdx]) delTask(numId(cards[kbIdx].dataset.id));
    }
  });
}

/* ══ SWIPE ══ */
function setupSwipe() {
  var SECS=['home','uni','credit','pomo'], sx=0,sy=0,sTime=0,sEl=null;
  document.addEventListener('touchstart',function(e){ if(e.touches.length!==1) return; sx=e.touches[0].clientX; sy=e.touches[0].clientY; sTime=Date.now(); sEl=e.target; },{passive:true});
  document.addEventListener('touchend',function(e) {
    if($('modal-ov').classList.contains('open')||$('drawer').classList.contains('open')) return;
    if(sEl&&sEl.closest('.scroll-area,.modal,.snooze-menu,.calc-panel')) return;
    var dx=e.changedTouches[0].clientX-sx, dy=Math.abs(e.changedTouches[0].clientY-sy), dt=Date.now()-sTime;
    if(dt>380||Math.abs(dx)<65||Math.abs(dx)<dy*1.8) return;
    var cur=SECS.indexOf(currentSection);
    if(dx<0&&cur<SECS.length-1) goSection(SECS[cur+1]);
    else if(dx>0&&cur>0) goSection(SECS[cur-1]);
  },{passive:true});
}

/* ══ WIRE EVENTS ══ */
function wireEvents() {
  document.querySelectorAll('.nav-item[data-section],.bnav-item[data-section],.drawer-item[data-section]').forEach(function(el) {
    el.addEventListener('click',function(){ goSection(el.dataset.section); if(el.classList.contains('drawer-item')) closeDrawer(); });
  });
  var ham=$('ham-btn');        if(ham)  ham.addEventListener('click',openDrawer);
  var dov=$('drawer-ov');      if(dov)  dov.addEventListener('click',closeDrawer);
  var dcb=$('drawer-close-btn');if(dcb) dcb.addEventListener('click',closeDrawer);

  function addBtn(id,cat){ var el=$(id); if(!el) return; el.addEventListener('click',function(){ openModal(cat?{cat:cat}:{}); }); }
  addBtn('add-btn-sb'); addBtn('desk-fab'); addBtn('bnav-fab');
  addBtn('add-uni-btn','university'); addBtn('add-credit-btn','credit');

  var mc=$('modal-cancel');if(mc)  mc.addEventListener('click',closeModal);
  var ms=$('modal-save');  if(ms)  ms.addEventListener('click',saveTask);
  var db=$('del-btn');     if(db)  db.addEventListener('click',delCurrentTask);
  var mov=$('modal-ov');   if(mov) mov.addEventListener('click',function(e){ if(e.target===mov) closeModal(); });

  document.querySelectorAll('.cat-opt').forEach(function(p){ p.addEventListener('click',function(){ selCat(p.dataset.cat); }); });

  var ft=$('f-title'); if(ft) ft.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); var fs=$('f-sub'); if(fs) fs.focus(); } });

  var si=$('search-in'); if(si) si.addEventListener('input',debouncedRender);
  var su=$('search-uni'); if(su) su.addEventListener('input',function(){ renderCatSection('university','task-list-uni','empty-uni','prog-fill-uni',su.value); });
  var sc=$('search-credit'); if(sc) sc.addEventListener('input',function(){ renderCatSection('credit','task-list-credit','empty-credit','prog-fill-credit',sc.value); });
  var ss=$('sort-sel'); if(ss) ss.addEventListener('change',renderTasks);

  var nb=$('notif-btn'); if(nb) nb.addEventListener('click',function(){ var t=$('tog-notif'); if(!t) return; t.checked=!t.checked; handleNotifToggle(t); });

  $('pomo-play-btn')  && $('pomo-play-btn').addEventListener('click',togglePomo);
  $('pomo-prev')      && $('pomo-prev').addEventListener('click',prevPomoMode);
  $('pomo-next')      && $('pomo-next').addEventListener('click',nextPomoMode);
  $('pomo-reset-btn') && $('pomo-reset-btn').addEventListener('click',stopPomo);
  $('pm-work')  && $('pm-work').addEventListener('click',function(){setPomoMode('work');});
  $('pm-short') && $('pm-short').addEventListener('click',function(){setPomoMode('short');});
  $('pm-long')  && $('pm-long').addEventListener('click',function(){setPomoMode('long');});

  $('t-dark')  && $('t-dark').addEventListener('click',function(){setTheme('dark');});
  $('t-light') && $('t-light').addEventListener('click',function(){setTheme('light');});
  $('t-auto')  && $('t-auto').addEventListener('click',function(){setTheme('auto');});

  var tn=$('tog-notif');   if(tn) tn.addEventListener('change',function(){handleNotifToggle(tn);});
  var ts=$('tog-sound');   if(ts) ts.addEventListener('change',function(){CFG.sound=ts.checked;saveCFG();});
  var tv=$('tog-vib');     if(tv) tv.addEventListener('change',function(){CFG.vib=tv.checked;saveCFG();});
  var ta=$('tog-autodel'); if(ta) ta.addEventListener('change',function(){CFG.autoDelOn=ta.checked;saveCFG();updateAutoDelLbl();});
  var ads=$('autodel-secs'); if(ads) ads.addEventListener('input',function(){CFG.autoDelSecs=Number(ads.value);saveCFG();updateAutoDelLbl();});

  function bindD(id,fn){ var el=$(id); if(el) el.addEventListener('click',fn); }
  bindD('s-export',exportJSON); bindD('d-export',function(){exportJSON();closeDrawer();});
  bindD('s-import',importJSON); bindD('d-import',function(){importJSON();closeDrawer();});
  bindD('s-pdf',exportPDF);     bindD('d-pdf',function(){exportPDF();closeDrawer();});

  var ifile=$('import-file'); if(ifile) ifile.addEventListener('change',handleImport);
  var cb=$('calc-btn'); if(cb) cb.addEventListener('click',toggleCalc);
  ['cc-r','cc-re','cc-rn','cc-p','cc-f'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('input',calcCredit); });

  document.addEventListener('click',function(e){ if(!e.target.closest('.snooze-wrap')) closeSnMenus(); });
  document.addEventListener('touchstart',function(e){ if(!e.target.closest('.snooze-wrap')) closeSnMenus(); },{passive:true});
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'){save();saveOrder();} });
  window.addEventListener('pagehide',    function(){save();saveOrder();});
  window.addEventListener('beforeunload',function(){save();saveOrder();});
}

/* ══ SERVICE WORKER ══ */
function registerSW() {
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});
}

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded',function() {
  loadData();
  if(!tasks.length) seedData();
  syncOrder();
  applyTheme();
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){ if(CFG.theme==='auto') applyTheme('auto'); });
  notifEnabled=CFG.notif;
  wireEvents();
  wireCardDelegation();
  setupKB();
  setupSwipe();
  registerSW();
  requestAnimationFrame(function() {
    goSection('home');
    updatePomoDisplay(); renderPomoStats();
    var ring=$('pomo-ring');
    if(ring){ ring.style.strokeDasharray=String(POMO_R); ring.style.strokeDashoffset='0'; }
  });
  setTimeout(function() {
    var splash=$('splash'); if(!splash) return;
    splash.classList.add('hidden');
    setTimeout(function(){ if(splash.parentNode) splash.parentNode.removeChild(splash); },360);
  },440);
});
