const DB_NAME = "gymtrack", STORE = "state";
let state = {version:2, plans:[], activePlanId:null, library:[], workouts:[], activeWorkout:null};
let currentTab = "plan", draggedExerciseId = null, expandedPlanId = null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(16).slice(2));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const unitLabel = u => ({weight:"kg",plates:"Scheiben",bodyweight:"Körpergewicht",time:"Sekunden"}[u]||u);
const fmtDate = iso => new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
const fmtDuration = sec => {sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h} Std. ${m} Min.`:`${m} Min. ${String(s).padStart(2,"0")} Sek.`};

function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function load(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(STORE,"readonly").objectStore(STORE).get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function save(){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(state,"state");t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
function normalize(s){
  if(!s || typeof s!=="object") return null;
  const n={version:3,plans:Array.isArray(s.plans)?s.plans:[],activePlanId:s.activePlanId||null,library:Array.isArray(s.library)?s.library:[],workouts:Array.isArray(s.workouts)?s.workouts:[],activeWorkout:s.activeWorkout||null,bodyData:{heightCm:s.bodyData?.heightCm??"",entries:Array.isArray(s.bodyData?.entries)?s.bodyData.entries:[]}};
  // Migrate GymTrack v1 history into proper workout sessions.
  if(!n.workouts.length && Array.isArray(s.history) && s.history.length){
    const groups={}; s.history.forEach(h=>{const key=new Date(h.date||Date.now()).toISOString().slice(0,16);(groups[key]??=[]).push(h)});
    n.workouts=Object.values(groups).map(rows=>({id:uid(),planId:n.activePlanId,date:rows[0].date||new Date().toISOString(),startedAt:rows[0].date||new Date().toISOString(),finishedAt:rows[0].date||new Date().toISOString(),durationSec:0,items:rows.map(r=>({exerciseId:r.exerciseId,sets:r.sets||[]}))}));
  }
  n.bodyData.entries=n.bodyData.entries.filter(e=>e&&e.date&&Number.isFinite(Number(e.weightKg))).map(e=>({id:e.id||uid(),date:String(e.date),weightKg:Number(e.weightKg),bodyFat:e.bodyFat===""||e.bodyFat==null?"":Number(e.bodyFat),chestCm:e.chestCm===""||e.chestCm==null?"":Number(e.chestCm),waistCm:e.waistCm===""||e.waistCm==null?"":Number(e.waistCm),armCm:e.armCm===""||e.armCm==null?"":Number(e.armCm),legCm:e.legCm===""||e.legCm==null?"":Number(e.legCm)}));
  n.library=n.library.map(e=>({...e,id:e.id||uid(),name:String(e.name||"Übung"),unit:e.unit||"weight",defaultSets:Math.max(1,Number(e.defaultSets)||3),targetReps:String(e.targetReps??"")}));
  n.plans=n.plans.map(p=>({...p,id:p.id||uid(),name:String(p.name||"Training"),exerciseIds:Array.isArray(p.exerciseIds)?p.exerciseIds.filter(id=>n.library.some(e=>e.id===id)):[]}));
  if(!n.plans.length) seed(n); if(!n.activePlanId || !n.plans.some(p=>p.id===n.activePlanId))n.activePlanId=n.plans[0]?.id||null;
  return n;
}
function seed(s){const exercises=[["Bankdrücken","weight",3,"8"],["Schrägbankdrücken","weight",3,"10"],["Schulterdrücken","weight",3,"8"],["Seitheben","weight",3,"12"],["Trizepsdrücken","weight",3,"12"]].map(([name,unit,sets,reps])=>({id:uid(),name,unit,defaultSets:sets,targetReps:reps}));s.library=exercises;s.plans=[{id:uid(),name:"Push",exerciseIds:exercises.map(e=>e.id)}];s.activePlanId=s.plans[0].id;s.workouts=[];s.activeWorkout=null}
const activePlan=()=>state.plans.find(p=>p.id===state.activePlanId)||state.plans[0];
const ex=id=>state.library.find(e=>e.id===id);
const setTab=t=>{currentTab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()};
function render(){
  if(currentTab==="body"){renderBody(); return;}
const titles={plan:"Mein Plan",workout:"Training",progress:"Fortschritt",settings:"Einstellungen"};$("pageTitle").textContent=titles[currentTab];$("quickAdd").style.display=currentTab==="settings"?"none":"block";$("content").innerHTML={plan:renderPlan,workout:renderWorkout,progress:renderProgress,settings:renderSettings}[currentTab]();if(currentTab==="plan")initExerciseReorder();}

function renderPlan(){
 const current=activePlan();
 if(!current) return `<div class="empty">Noch kein Trainingsplan vorhanden.</div>`;
 const isExpanded=expandedPlanId===current.id;
 const planCard=(p,expanded=false)=>`
   <div class="card plan-summary ${expanded?"expanded":""}" onclick="openPlan('${p.id}')">
     <div class="plan-summary-main">
       <div class="plan-icon">▦</div>
       <div><div class="eyebrow">${p.id===state.activePlanId?"AKTUELLER PLAN":"TRAININGSPLAN"}</div>
       <h2>${esc(p.name)}</h2><div class="muted">${p.exerciseIds.length} Übungen</div></div>
     </div>
     <div class="plan-summary-actions">
       ${p.id===state.activePlanId?`<button class="secondary" onclick="event.stopPropagation();editPlan('${p.id}')">Bearbeiten</button>`:""}
       <span class="chevron">${expanded?"⌃":"›"}</span>
     </div>
   </div>`;
 return `
 <div class="section-head"><div><div class="eyebrow">DEINE TRAININGSPLÄNE</div><h2>Pläne</h2></div></div>
 ${planCard(current,isExpanded)}
 ${isExpanded?`
   <div class="card plan-exercises">
     <div class="list-head"><span>${current.exerciseIds.length} Übungen</span><span class="muted">Antippen für Fortschritt</span></div>
     ${current.exerciseIds.length?current.exerciseIds.map((id,idx)=>{const e=ex(id);return e?`<div class="exercise-row" data-exercise-id="${e.id}" onclick="openExerciseProgress('${e.id}')"><button class="drag-handle" aria-label="${esc(e.name)} verschieben" title="Halten und ziehen">☷</button><div class="exercise-info"><div class="exercise-name">${esc(e.name)}</div><div class="exercise-meta">${e.defaultSets} Sätze · ${e.targetReps?esc(e.targetReps)+" Wdh. · ":""}${unitLabel(e.unit)}</div></div><div class="row-actions"><button aria-label="Nach oben" onclick="event.stopPropagation();moveExercise('${current.id}','${e.id}',-1)" ${idx===0?"disabled":""}>↑</button><button aria-label="Nach unten" onclick="event.stopPropagation();moveExercise('${current.id}','${e.id}',1)" ${idx===current.exerciseIds.length-1?"disabled":""}>↓</button><button aria-label="Bearbeiten" onclick="event.stopPropagation();editExercise('${e.id}')">•••</button><button class="delete-row" aria-label="${esc(e.name)} aus Plan entfernen" onclick="event.stopPropagation();removeFromPlan('${current.id}','${e.id}')">×</button></div></div>`:""}).join(""):`<div class="empty compact">Noch keine Übungen. Füge über „Bearbeiten“ Übungen hinzu.</div>`}
     <button class="secondary full" onclick="addToPlan('${current.id}')">＋ Übungen hinzufügen</button>
   </div>
   <button class="primary" onclick="startWorkout()">${state.activeWorkout&&state.activeWorkout.planId===current.id?"Training fortsetzen":"Training starten"}</button>
 `:""}
 <div class="section-head"><h2>Weitere Pläne</h2><button class="secondary" onclick="newPlan()">＋ Plan</button></div>
 ${state.plans.filter(x=>x.id!==current.id).map(x=>planCard(x,expandedPlanId===x.id)).join("")||`<div class="muted small">Erstelle z. B. Pull, Legs oder einen Ganzkörperplan.</div>`}`;
}
function openPlan(id){
 const p=state.plans.find(x=>x.id===id); if(!p)return;
 state.activePlanId=id;
 expandedPlanId=expandedPlanId===id?null:id;
 save().then(render);
}
async function moveExercise(planId,id,direction){
 const p=state.plans.find(x=>x.id===planId); if(!p)return;
 const i=p.exerciseIds.indexOf(id), j=i+direction;
 if(i<0||j<0||j>=p.exerciseIds.length)return;
 [p.exerciseIds[i],p.exerciseIds[j]]=[p.exerciseIds[j],p.exerciseIds[i]];
 await save(); render();
}
let pointerDrag={id:null,targetId:null,active:false,timer:null,row:null};
function initExerciseReorder(){document.querySelectorAll('.drag-handle').forEach(handle=>{handle.addEventListener('pointerdown',startPointerDrag);});document.addEventListener('pointermove',movePointerDrag,{passive:false});document.addEventListener('pointerup',endPointerDrag);document.addEventListener('pointercancel',cancelPointerDrag);}
function startPointerDrag(ev){if(ev.pointerType==='mouse'&&ev.button!==0)return;if(ev.target.closest('.row-actions'))return;const handle=ev.currentTarget,row=handle.closest('.exercise-row'),id=row.dataset.exerciseId;pointerDrag={id,targetId:id,active:false,timer:setTimeout(()=>{pointerDrag.active=true;row.classList.add('dragging');try{row.setPointerCapture(ev.pointerId)}catch(e){};navigator.vibrate?.(18)},320),row};}
function movePointerDrag(ev){if(!pointerDrag.row||pointerDrag.row!==ev.currentTarget||!pointerDrag.active)return;ev.preventDefault();const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.exercise-row');document.querySelectorAll('.exercise-row').forEach(r=>r.classList.remove('drag-target'));if(el&&el!==pointerDrag.row){pointerDrag.targetId=el.dataset.exerciseId;el.classList.add('drag-target');}}
async function endPointerDrag(){if(pointerDrag.timer)clearTimeout(pointerDrag.timer);const d={...pointerDrag};pointerDrag={id:null,targetId:null,active:false,timer:null,row:null};if(!d.row)return;d.row.classList.remove('dragging');document.querySelectorAll('.exercise-row').forEach(r=>r.classList.remove('drag-target'));if(!d.active||!d.targetId||d.id===d.targetId)return;const p=activePlan();if(!p)return;const from=p.exerciseIds.indexOf(d.id),to=p.exerciseIds.indexOf(d.targetId);if(from<0||to<0)return;const [moved]=p.exerciseIds.splice(from,1);p.exerciseIds.splice(to,0,moved);await save();render();}
function cancelPointerDrag(){if(pointerDrag.timer)clearTimeout(pointerDrag.timer);pointerDrag.row?.classList.remove('dragging');document.querySelectorAll('.exercise-row').forEach(r=>r.classList.remove('drag-target'));pointerDrag={id:null,targetId:null,active:false,timer:null,row:null};}
function dragStart(ev,id){draggedExerciseId=id;ev.dataTransfer.effectAllowed="move"}
function dragOver(ev){ev.preventDefault();ev.dataTransfer.dropEffect="move"}
async function dropExercise(ev,targetId){ev.preventDefault();const p=activePlan();if(!draggedExerciseId||draggedExerciseId===targetId)return;const a=p.exerciseIds.indexOf(draggedExerciseId),b=p.exerciseIds.indexOf(targetId);p.exerciseIds.splice(a,1);p.exerciseIds.splice(b,0,draggedExerciseId);draggedExerciseId=null;await save();render()}

function renderWorkout(){if(!state.activeWorkout)return `<div class="hero"><div class="eyebrow">BEREIT?</div><h2>${esc(activePlan()?.name||"Kein Plan")}</h2><p class="muted">Starte ein Training und GymTrack übernimmt deine letzten Werte.</p><button class="primary inverse" onclick="startWorkout()">Training starten</button></div>${recentWorkoutCard()}`;
 const w=state.activeWorkout,p=state.plans.find(x=>x.id===w.planId)||activePlan();return `<div class="hero"><div class="eyebrow">AKTIVES TRAINING</div><div class="hero-line"><div><h2>${esc(p?.name||"Training")}</h2><span class="muted">${w.items.length} Übungen</span></div></div><div class="workout-actions"><button class="secondary light-btn" onclick="cancelWorkout()">Abbrechen</button><button class="secondary light-btn" onclick="finishWorkout()">Beenden</button></div></div>
<div class="card workout-card">${w.items.map((item,idx)=>renderWorkoutExercise(item,idx)).join("")}</div><button class="primary" onclick="finishWorkout()">Training beenden</button>`}
function renderWorkoutExercise(item,idx){const e=ex(item.exerciseId);if(!e)return"";const collapsed=(state.activeWorkout.collapsedExerciseIds||[]).includes(item.exerciseId);const complete=item.sets.length>0&&item.sets.every(s=>String(s.value??"").trim()!==""&&String(s.reps??"").trim()!=="");return `<div class="workout-exercise ${collapsed?"is-collapsed":""}"><div class="we-head"><button class="exercise-collapse" aria-label="${collapsed?"Übung öffnen":"Übung zuklappen"}" onclick="toggleExercise(${idx})"><span class="collapse-chevron">${collapsed?"›":"⌄"}</span></button><div class="we-title"><h3>${esc(e.name)}</h3><div class="exercise-meta">Ziel: ${e.targetReps?esc(e.targetReps)+" Wdh.":"frei"} · ${unitLabel(e.unit)}${complete?" · <span class=\"complete-label\">✓ Fertig</span>":""}</div></div><span class="last">${esc(lastFor(e.id))}</span></div>${collapsed?`<div class="collapsed-summary">${item.sets.filter(s=>s.value!==""||s.reps!=="").map((s,j)=>`<span>Satz ${j+1}: ${esc(s.value||"BW")} × ${esc(s.reps||"–")}</span>`).join("")||"<span>Noch keine Werte</span>"}</div>`:`<table class="set-table"><thead><tr><th>Satz</th><th>${unitLabel(e.unit)}</th><th>Wdh.</th><th></th></tr></thead><tbody>${item.sets.map((s,j)=>`<tr class="${s.done?"done":""}"><td class="set-no">${j+1}</td><td><input class="field" inputmode="decimal" value="${esc(s.value)}" placeholder="${e.unit==="time"?"Sek.":e.unit==="bodyweight"?"BW":"—"}" oninput="updateSet(${idx},${j},'value',this.value)"></td><td><input class="field" inputmode="numeric" value="${esc(s.reps)}" placeholder="—" oninput="updateSet(${idx},${j},'reps',this.value)"></td><td><button class="check ${s.done?"checked":""}" onclick="toggleSet(${idx},${j})">${s.done?"✓":"○"}</button></td></tr>`).join("")}</tbody></table><div class="set-footer"><button class="add-set" onclick="addSet(${idx})">＋ Satz</button>${item.sets.length>1?`<button class="text-btn" onclick="removeSet(${idx})">Satz entfernen</button>`:""}</div>`}</div>`}
function lastFor(id){const rows=state.workouts.filter(w=>w.items?.some(i=>i.exerciseId===id)).sort((a,b)=>new Date(a.date)-new Date(b.date));const last=rows.at(-1)?.items.find(i=>i.exerciseId===id);if(!last)return"Noch keine Daten";const s=last.sets.find(x=>x.value!==""||x.reps!=="");return s?`Letztes Mal: ${s.value||"BW"} × ${s.reps||"–"}`:"Noch keine Daten"}
function workoutTemplate(e){const previous=state.workouts.filter(w=>w.items?.some(i=>i.exerciseId===e.id)).sort((a,b)=>new Date(a.date)-new Date(b.date)).at(-1)?.items.find(i=>i.exerciseId===e.id);const prevSets=previous?.sets||[];return Array.from({length:Math.max(e.defaultSets||3,prevSets.length||0)},(_,i)=>({value:prevSets[i]?.value??(e.unit==="bodyweight"?"BW":""),reps:prevSets[i]?.reps??e.targetReps??"",done:false}))}
async function startWorkout(){if(state.activeWorkout){setTab("workout");return}const p=activePlan();if(!p)return;state.activeWorkout={id:uid(),planId:p.id,startedAt:new Date().toISOString(),collapsedExerciseIds:[],items:p.exerciseIds.map(id=>({exerciseId:id,sets:workoutTemplate(ex(id))}))};await save();setTab("workout")}
let saveTimer=null;function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),250)}
function updateSet(i,j,k,v){if(!state.activeWorkout)return;state.activeWorkout.items[i].sets[j][k]=v;const item=state.activeWorkout.items[i];const complete=item.sets.length>0&&item.sets.every(x=>String(x.value??"").trim()!==""&&String(x.reps??"").trim()!=="");if(complete){state.activeWorkout.collapsedExerciseIds=[...(state.activeWorkout.collapsedExerciseIds||[]).filter(id=>id!==item.exerciseId),item.exerciseId];queueSave();render()}else queueSave()} 
function toggleExercise(i){if(!state.activeWorkout)return;const item=state.activeWorkout.items[i];const ids=new Set(state.activeWorkout.collapsedExerciseIds||[]);ids.has(item.exerciseId)?ids.delete(item.exerciseId):ids.add(item.exerciseId);state.activeWorkout.collapsedExerciseIds=[...ids];save();render()}
function toggleSet(i,j){state.activeWorkout.items[i].sets[j].done=!state.activeWorkout.items[i].sets[j].done;save();render()}
function addSet(i){const item=state.activeWorkout.items[i];item.sets.push({value:"",reps:"",done:false});state.activeWorkout.collapsedExerciseIds=(state.activeWorkout.collapsedExerciseIds||[]).filter(id=>id!==item.exerciseId);save();render()}
function removeSet(i){if(state.activeWorkout.items[i].sets.length<=1)return;state.activeWorkout.items[i].sets.pop();save();render()}
async 
function setNum(v){const n=parseFloat(String(v??"").replace(",","."));return Number.isFinite(n)&&n>0?n:null;}
function isNewPR(item,prev){
 const cur=(item.sets||[]).map(s=>({v:setNum(s.value),r:setNum(s.reps)})).filter(x=>x.v!=null);
 if(!cur.length)return false;
 const old=[];prev.forEach(w=>(w.items||[]).filter(i=>i.exerciseId===item.exerciseId).forEach(i=>(i.sets||[]).forEach(s=>{const v=setNum(s.value),r=setNum(s.reps);if(v!=null)old.push({v,r});})));
 return Math.max(...cur.map(x=>x.v))>Math.max(0,...old.map(x=>x.v)) || Math.max(0,...cur.map(x=>x.r||0))>Math.max(0,...old.map(x=>x.r||0));
}
function showPRFireworks(names){
 const o=document.createElement("div");o.className="pr-celebration";o.innerHTML='<div class="pr-message">🏆<strong>Neuer PR!</strong><small>'+names.join(" · ")+'</small></div><canvas></canvas>';document.body.appendChild(o);
 const cv=o.querySelector("canvas"),ctx=cv.getContext("2d");let ps=[],start=performance.now();
 const resize=()=>{cv.width=innerWidth*devicePixelRatio;cv.height=innerHeight*devicePixelRatio;cv.style.width=innerWidth+"px";cv.style.height=innerHeight+"px";ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)};resize();
 for(let b=0;b<5;b++)setTimeout(()=>{const x=innerWidth*(.15+Math.random()*.7),y=innerHeight*(.18+Math.random()*.35);for(let i=0;i<42;i++){const q=Math.random()*Math.PI*2,sp=2+Math.random()*4.5;ps.push({x,y,vx:Math.cos(q)*sp,vy:Math.sin(q)*sp,l:1,c:["#fff","#7dd3fc","#a78bfa","#f9a8d4","#fde68a"][Math.floor(Math.random()*5)]})}},b*150);
 function f(t){ctx.clearRect(0,0,innerWidth,innerHeight);ps.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.055;p.vx*=.99;p.l-=.014;ctx.globalAlpha=p.l;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,1.5,0,7);ctx.fill()});ctx.globalAlpha=1;if(t-start<3300)requestAnimationFrame(f);else o.remove()}requestAnimationFrame(f);
}

async function finishWorkout(){
  const previousWorkouts=[...(state.workouts||[])];
  const prNames=(state.activeWorkout?.items||[]).filter(i=>isNewPR(i,previousWorkouts)).map(i=>(state.library||[]).find(e=>e.id===i.exerciseId)?.name||"Übung");
const w=state.activeWorkout;if(!w)return;const validItems=w.items.map(i=>({...i,sets:i.sets.filter(s=>s.value!==""||s.reps!=="")})).filter(i=>i.sets.length);if(!validItems.length){toast("Noch keine Sätze eingetragen.");return}const finished=new Date().toISOString();state.workouts.push({id:w.id,planId:w.planId,date:finished,startedAt:w.startedAt,finishedAt:finished,durationSec:Math.max(0,(Date.parse(finished)-Date.parse(w.startedAt))/1000),items:validItems});state.activeWorkout=null;await save();toast("Training gespeichert");setTab("progress")
  if(prNames.length)setTimeout(()=>showPRFireworks(prNames),120);
}
async function cancelWorkout(){if(!state.activeWorkout)return;if(!confirm("Aktives Training wirklich verwerfen? Deine Eingaben gehen verloren."))return;state.activeWorkout=null;await save();render()}
function recentWorkoutCard(){const w=state.workouts.at(-1);if(!w)return"";const p=state.plans.find(p=>p.id===w.planId);return `<div class="section-head"><h2>Letztes Training</h2></div><button class="card history-mini" onclick="showWorkout('${w.id}')"><b>${esc(p?.name||"Training")}</b><span>${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}</span></button>`}

function renderProgress(){const totalSets=state.workouts.reduce((a,w)=>a+w.items.reduce((b,i)=>b+i.sets.length,0),0);return `<div class="stat"><div class="stat-box"><strong>${state.workouts.length}</strong><span>Trainings</span></div><div class="stat-box"><strong>${totalSets}</strong><span>Sätze</span></div><div class="stat-box"><strong>${state.workouts.filter(w=>new Date(w.date)>=new Date(Date.now()-7*864e5)).length}</strong><span>Letzte 7 Tage</span></div><div class="stat-box"><strong>${bestCount()}</strong><span>Bestwerte</span></div></div><div class="section-head"><h2>Historie</h2></div>${state.workouts.length?state.workouts.slice().reverse().map(w=>historyCard(w)).join(""):`<div class="empty">Nach deinem ersten Training erscheint hier deine Historie.</div>`}<div class="section-head"><h2>Übungsfortschritt</h2></div>${state.library.filter(e=>state.workouts.some(w=>w.items.some(i=>i.exerciseId===e.id))).map(e=>progressCard(e)).join("")||`<div class="muted small">Noch keine Übungen mit gespeicherten Werten.</div>`}`}
function bestCount(){return state.library.reduce((n,e)=>n+(progressValues(e.id).length?1:0),0)}
function historyCard(w){const p=state.plans.find(p=>p.id===w.planId);const sets=w.items.reduce((a,i)=>a+i.sets.length,0);return `<button class="card history-card" onclick="showWorkout('${w.id}')"><div><b>${esc(p?.name||"Training")}</b><div class="exercise-meta">${fmtDate(w.date)}</div></div><div class="history-right"><b>${sets} Sätze</b><span>${fmtDuration(w.durationSec)}</span></div></button>`}
function progressValues(id){const vals=[];state.workouts.forEach(w=>w.items.filter(i=>i.exerciseId===id).forEach(i=>i.sets.forEach(s=>{const v=parseFloat(String(s.value).replace(",","."));if(Number.isFinite(v)&&v>0)vals.push({v,date:w.date})})));return vals.sort((a,b)=>new Date(a.date)-new Date(b.date))}
function progressCard(e){const vals=progressValues(e.id),last=vals.at(-1)?.v,best=vals.length?Math.max(...vals.map(x=>x.v)):null;return `<div class="card progress-item"><div class="phead"><div><b>${esc(e.name)}</b><div class="exercise-meta">${vals.length} Messwerte · Bestwert ${best??"—"} ${vals.length?unitLabel(e.unit):""}</div></div><b>${last??"—"} ${last!=null?unitLabel(e.unit):""}</b></div>${chart(vals.map(x=>x.v))}</div>`}
function chart(vals){if(!vals.length)return"";const max=Math.max(...vals),min=Math.min(...vals),range=max-min||1,w=360,h=120;const pts=vals.map((v,i)=>`${i*(w/Math.max(vals.length-1,1))},${h-((v-min)/range)*(h-20)-10}`).join(" ");return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v,i)=>{const [x,y]=pts.split(" ")[i].split(",");return `<circle cx="${x}" cy="${y}" r="4" fill="currentColor"/>`}).join("")}</svg><div class="chart-labels"><span>${min}</span><span>${max}</span></div></div>`}
function showWorkout(id){const w=state.workouts.find(x=>x.id===id);if(!w)return;const p=state.plans.find(x=>x.id===w.planId);openModal(`${p?.name||"Training"} · ${fmtDate(w.date)}`,`<div class="detail-summary"><b>${fmtDuration(w.durationSec)}</b><span>${w.items.reduce((a,i)=>a+i.sets.length,0)} Sätze · ${w.items.length} Übungen</span></div>${w.items.map(i=>{const e=ex(i.exerciseId);return `<div class="detail-ex"><b>${esc(e?.name||"Übung")}</b>${i.sets.map((s,j)=>`<div class="detail-set"><span>Satz ${j+1}</span><span>${esc(s.value||"—")} ${e?unitLabel(e.unit):""} × ${esc(s.reps||"—")}</span></div>`).join("")}</div>`}).join("")}`)}

function openExerciseProgress(id){
 const e=ex(id); if(!e)return;
 const vals=progressValues(id);
 const best=vals.length?Math.max(...vals.map(x=>x.v)):null;
 const avg=vals.length?(vals.reduce((a,x)=>a+x.v,0)/vals.length):null;
 const sessions=state.workouts.filter(w=>w.items.some(i=>i.exerciseId===id)).slice().reverse();
 openModal(esc(e.name),`<div class="detail-summary"><div><b>${best??"—"} ${best!=null?unitLabel(e.unit):""}</b><span>Bestwert</span></div><div><b>${avg!=null?avg.toFixed(1):"—"} ${avg!=null?unitLabel(e.unit):""}</b><span>Ø Wert</span></div><div><b>${vals.length}</b><span>Messwerte</span></div></div>${vals.length?`<div class="card-in-modal">${chart(vals.map(x=>x.v))}</div>`:`<div class="empty compact">Noch kein Fortschritt aufgezeichnet. Starte ein Training mit dieser Übung.</div>`}<div class="modal-subtitle">Letzte Einheiten</div>${sessions.slice(0,8).map(w=>{const item=w.items.find(i=>i.exerciseId===id);return `<div class="detail-ex"><div class="phead"><b>${fmtDate(w.date)}</b><span class="muted">${item?.sets?.length||0} Sätze</span></div>${(item?.sets||[]).map((set,j)=>`<div class="detail-set"><span>Satz ${j+1}</span><span>${esc(set.value||"—")} ${unitLabel(e.unit)} × ${esc(set.reps||"—")} Wdh.</span></div>`).join("")}</div>`}).join("")||""}`);
}
function renderSettings(){return `<div class="card"><h3>Daten</h3><p class="muted">Alles wird lokal im Browser gespeichert. Ein Backup enthält Pläne, Übungen und komplette Trainingshistorie.</p><div class="button-row"><button class="secondary" onclick="exportData()">Backup exportieren</button><button class="secondary" onclick="$('importFile').click()">Backup importieren</button></div><input id="importFile" type="file" accept="application/json,.json" hidden onchange="importData(event)"></div><div class="card"><div class="section-head no-margin"><div><h3>Übungsbibliothek</h3><p class="muted">${state.library.length} Übungen</p></div><button class="secondary" onclick="newExercise()">＋ Übung</button></div><div class="library-list">${state.library.map(e=>`<div class="library-row"><div><b>${esc(e.name)}</b><div class="exercise-meta">${e.defaultSets} Sätze · ${e.targetReps?esc(e.targetReps)+" Wdh. · ":""}${unitLabel(e.unit)}</div></div><button class="secondary" onclick="editExercise('${e.id}')">Bearbeiten</button></div>`).join("")}</div></div><div class="card"><h3>App</h3><p class="muted">GymTrack v2 · offlinefähig · lokale Daten</p><button class="secondary" onclick="if(navigator.serviceWorker?.controller)toast('Offline-Modus ist aktiv.')">Offline-Status prüfen</button></div>`}

function openModal(title,html){$("modalTitle").textContent=title;$("modalBody").innerHTML=html;$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden")}
function newExercise(){openModal("Neue Übung",exerciseForm())}
function editExercise(id){const e=ex(id);openModal("Übung bearbeiten",exerciseForm(e))}
function exerciseForm(e={}){return `<div class="form-grid"><div><label class="label">Name</label><input id="fName" class="field" value="${esc(e.name||"")}" autofocus></div><div class="two"><div><label class="label">Einheit</label><select id="fUnit" class="field">${["weight","plates","bodyweight","time"].map(u=>`<option value="${u}" ${e.unit===u?"selected":""}>${unitLabel(u)}</option>`).join("")}</select></div><div><label class="label">Standardsätze</label><input id="fSets" class="field" type="number" min="1" max="20" value="${e.defaultSets||3}"></div></div><div><label class="label">Ziel-Wiederholungen (optional)</label><input id="fReps" class="field" value="${esc(e.targetReps||"")}" placeholder="z. B. 8–10"></div><button class="primary" onclick="saveExercise('${e.id||""}')">Speichern</button>${e.id?`<button class="secondary danger" onclick="deleteExercise('${e.id}')">Übung löschen</button>`:""}</div>`}
async function saveExercise(id){const name=$("fName").value.trim();if(!name){toast("Bitte einen Namen eingeben.");return}const data={name,unit:$("fUnit").value,defaultSets:Math.min(20,Math.max(1,Number($("fSets").value)||3)),targetReps:$("fReps").value.trim()};if(id)Object.assign(ex(id),data);else{data.id=uid();state.library.push(data)}await save();closeModal();render();toast("Übung gespeichert")}
async function deleteExercise(id){if(state.plans.some(p=>p.exerciseIds.includes(id))){toast("Übung zuerst aus allen Plänen entfernen.");return}if(!confirm("Übung wirklich löschen? Die historische Aufzeichnung bleibt erhalten."))return;state.library=state.library.filter(e=>e.id!==id);await save();closeModal();render()}
function newPlan(){openModal("Neuer Trainingsplan",`<div class="form-grid"><div><label class="label">Name</label><input id="planName" class="field" placeholder="z. B. Pull"></div><button class="primary" onclick="savePlan()">Plan erstellen</button></div>`)}
async function savePlan(){const n=$("planName").value.trim();if(!n){toast("Bitte einen Namen eingeben.");return}const p={id:uid(),name:n,exerciseIds:[]};state.plans.push(p);state.activePlanId=p.id;await save();closeModal();render()}
function editPlan(id){const p=state.plans.find(x=>x.id===id);openModal("Plan bearbeiten",`<div class="form-grid"><div><label class="label">Name</label><input id="planName" class="field" value="${esc(p.name)}"></div><button class="primary" onclick="renamePlan('${p.id}')">Speichern</button><button class="secondary" onclick="addToPlan('${p.id}')">＋ Übung hinzufügen</button>${state.plans.length>1?`<button class="secondary danger" onclick="deletePlan('${p.id}')">Plan löschen</button>`:""}</div>`)}
async function renamePlan(id){const p=state.plans.find(x=>x.id===id),n=$("planName").value.trim();if(n)p.name=n;await save();closeModal();render()}
async function deletePlan(id){if(state.plans.length===1){toast("Der letzte Plan kann nicht gelöscht werden.");return}if(state.activeWorkout?.planId===id){toast("Beende oder verwerfe zuerst das aktive Training.");return}if(!confirm("Plan wirklich löschen? Die Trainingshistorie bleibt erhalten."))return;state.plans=state.plans.filter(p=>p.id!==id);if(state.activePlanId===id)state.activePlanId=state.plans[0].id;await save();closeModal();render()}
function addToPlan(pid){
  const p=state.plans.find(x=>x.id===pid); if(!p)return;
  const available=state.library.filter(e=>!p.exerciseIds.includes(e.id));
  if(!available.length){openModal("Übungen hinzufügen",`<div class="empty compact">Alle Übungen sind bereits im Plan.</div>`);return;}
  openModal("Übungen zum Plan hinzufügen",`<div class="form-grid">
    <p class="muted small">Wähle mehrere Übungen aus und füge sie gemeinsam hinzu.</p>
    <div class="multi-exercise-list">${available.map(e=>`<label class="multi-choice"><input type="checkbox" class="exercise-pick" value="${e.id}"><span><b>${esc(e.name)}</b><small>${e.defaultSets} Sätze · ${unitLabel(e.unit)}</small></span></label>`).join("")}</div>
    <button class="primary" onclick="attachSelected('${pid}')">Ausgewählte Übungen hinzufügen</button>
  </div>`)}
async function attachSelected(pid){
  const p=state.plans.find(x=>x.id===pid); if(!p)return;
  const ids=[...document.querySelectorAll(".exercise-pick:checked")].map(x=>x.value);
  if(!ids.length){toast("Bitte mindestens eine Übung auswählen.");return;}
  ids.forEach(eid=>{if(!p.exerciseIds.includes(eid))p.exerciseIds.push(eid)});
  await save(); closeModal(); render(); toast(`${ids.length} Übung${ids.length===1?"":"en"} zum Plan hinzugefügt`);
}
async function attach(pid,eid){
  const p=state.plans.find(p=>p.id===pid);if(!p)return;
  if(!p.exerciseIds.includes(eid))p.exerciseIds.push(eid);await save();closeModal();render()
}
async function removeFromPlan(pid,eid){const p=state.plans.find(p=>p.id===pid);p.exerciseIds=p.exerciseIds.filter(x=>x!==eid);await save();render()}
function quickAdd(){
  if(currentTab==="plan"){
    openModal("Hinzufügen",`<div class="form-grid add-menu">
      <button class="choice" onclick="newPlan()"><b>＋ Trainingsplan erstellen</b><small>Neuen Plan wie Push, Pull, Legs oder Ganzkörper anlegen</small></button>
      ${activePlan()?`<button class="choice" onclick="addToPlan(\'${activePlan().id}\')"><b>＋ Übung zum Plan hinzufügen</b><small>Eine vorhandene Übung in „${esc(activePlan().name)}“ aufnehmen</small></button>`:""}
      <button class="choice" onclick="newExercise()"><b>＋ Neue Übung erstellen</b><small>Eine Übung für deine Bibliothek anlegen</small></button>
    </div>`);
  } else if(currentTab==="body") openBodyEntry();
  else if(currentTab==="settings") newExercise();
  else newExercise();
}
function exportData(){const payload={...state,exportedAt:new Date().toISOString(),app:"GymTrack",schemaVersion:2};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`gymtrack-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast("Backup exportiert")}
function importData(ev){const f=ev.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const parsed=JSON.parse(r.result),n=normalize(parsed);if(!n)throw new Error();if(!confirm("Backup importieren und aktuelle lokale Daten ersetzen?"))return;state=n;await save();render();toast("Backup erfolgreich importiert.")}catch{toast("Backup ist ungültig oder beschädigt.")}finally{ev.target.value=""}};r.readAsText(f)}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add("hidden"),2400)}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$("quickAdd").onclick=quickAdd;$("closeModal").onclick=closeModal;$("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
(async()=>{try{const old=await load();state=normalize(old)||state;await save();render();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});}catch(err){console.error(err);seed(state);await save();render()}})();
