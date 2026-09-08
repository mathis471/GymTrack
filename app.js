const DB_NAME = "gymtrack", STORE = "state";
let state = {version:3, plans:[], activePlanId:null, library:[], workouts:[], activeWorkout:null, bodyMeasurements:[]};
let currentTab = "plan", draggedExerciseId = null, expandedPlanId = null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(16).slice(2));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const unitLabel = u => ({weight:"kg",plates:"Scheiben",bodyweight:"Körpergewicht",time:"Sekunden"}[u]||u);
const fmtDate = iso => new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
const fmtDateCompact = iso => new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(iso));
const fmtDuration = sec => {sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h} Std. ${m} Min.`:`${m} Min. ${String(s).padStart(2,"0")} Sek.`};

function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function load(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(STORE,"readonly").objectStore(STORE).get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function save(){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(state,"state");t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
function normalize(s){
  if(!s || typeof s!=="object") return null;
  const n={version:3,plans:Array.isArray(s.plans)?s.plans:[],activePlanId:s.activePlanId||null,library:Array.isArray(s.library)?s.library:[],workouts:Array.isArray(s.workouts)?s.workouts:[],activeWorkout:s.activeWorkout||null,bodyMeasurements:Array.isArray(s.bodyMeasurements)?s.bodyMeasurements:[]};
  // Migrate GymTrack v1 history into proper workout sessions.
  if(!n.workouts.length && Array.isArray(s.history) && s.history.length){
    const groups={}; s.history.forEach(h=>{const key=new Date(h.date||Date.now()).toISOString().slice(0,16);(groups[key]??=[]).push(h)});
    n.workouts=Object.values(groups).map(rows=>({id:uid(),planId:n.activePlanId,date:rows[0].date||new Date().toISOString(),startedAt:rows[0].date||new Date().toISOString(),finishedAt:rows[0].date||new Date().toISOString(),durationSec:0,items:rows.map(r=>({exerciseId:r.exerciseId,sets:r.sets||[]}))}));
  }
  n.library=n.library.map(e=>({...e,id:e.id||uid(),name:String(e.name||"Übung"),unit:e.unit||"weight",defaultSets:Math.max(1,Number(e.defaultSets)||3),targetReps:String(e.targetReps??"")}));
  n.plans=n.plans.map(p=>({...p,id:p.id||uid(),name:String(p.name||"Training"),exerciseIds:Array.isArray(p.exerciseIds)?p.exerciseIds.filter(id=>n.library.some(e=>e.id===id)):[]}));
  if(!n.plans.length) seed(n); if(!n.activePlanId || !n.plans.some(p=>p.id===n.activePlanId))n.activePlanId=n.plans[0]?.id||null;
  return n;
}
function seed(s){const exercises=[["Bankdrücken","weight",3,"8"],["Schrägbankdrücken","weight",3,"10"],["Schulterdrücken","weight",3,"8"],["Seitheben","weight",3,"12"],["Trizepsdrücken","weight",3,"12"]].map(([name,unit,sets,reps])=>({id:uid(),name,unit,defaultSets:sets,targetReps:reps}));s.library=exercises;s.plans=[{id:uid(),name:"Push",exerciseIds:exercises.map(e=>e.id)}];s.activePlanId=s.plans[0].id;s.workouts=[];s.activeWorkout=null}
const activePlan=()=>state.plans.find(p=>p.id===state.activePlanId)||state.plans[0];
const ex=id=>state.library.find(e=>e.id===id);
const setTab=t=>{currentTab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()};
function render(){const titles={plan:"Mein Plan",workout:"Training",progress:"Fortschritt",body:"Körper",settings:"Mehr"};$("pageTitle").textContent=titles[currentTab];$("quickAdd").style.display=currentTab==="settings"?"none":"block";$("content").innerHTML={plan:renderPlan,workout:renderWorkout,progress:renderProgress,body:renderBody,settings:renderSettings}[currentTab]();}

function renderPlan(){
 const plans=state.plans||[];
 if(!plans.length) return `<div class="empty">Noch kein Trainingsplan vorhanden.<br><button class="primary" onclick="newPlan()" style="margin-top:12px">＋ Plan erstellen</button></div>`;
 return `
 <div class="section-head"><div><div class="eyebrow">TRAINING</div><h2>Deine Pläne</h2></div><button class="secondary" onclick="newPlan()">＋ Plan</button></div>
 <div class="plan-list">
 ${plans.map(p=>`<div class="card plan-row">
   <div class="plan-summary-main">
     <div class="plan-icon">▦</div>
     <div><div class="eyebrow">${p.id===state.activePlanId?"ZULETZT GEWÄHLT":"TRAININGSPLAN"}</div><h2>${esc(p.name)}</h2><div class="muted">${p.exerciseIds.length} Übungen</div></div>
   </div>
   <div class="plan-row-actions">
     <button class="secondary" onclick="editPlan('${p.id}')">Bearbeiten</button>
     <button class="primary" onclick="startPlan('${p.id}')">${state.activeWorkout&&state.activeWorkout.planId===p.id?"Fortsetzen":"Starten"}</button>
   </div>
 </div>`).join("")}
 </div>
 `;
}
function startPlan(id){
 const p=state.plans.find(x=>x.id===id); if(!p)return;
 state.activePlanId=id;
 expandedPlanId=null;
 save().then(()=>startWorkout());
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
async function startWorkout(){
 if(state.activeWorkout){setTab("workout");return}
 const p=activePlan();if(!p)return;
 const today=new Date().toISOString().slice(0,10);
 openModal("Training starten",`<div class="form-grid"><div><label class="label">Trainingsdatum</label><input id="workoutDate" class="field" type="date" value="${today}"></div><p class="muted small">Standardmäßig ist heute ausgewählt. Du kannst das Datum ändern, wenn du ein Training nachtragen möchtest.</p><button class="primary" onclick="confirmStartWorkout()">Training starten</button></div>`);
}
async function confirmStartWorkout(){
 const date=$("workoutDate")?.value||new Date().toISOString().slice(0,10);
 const p=activePlan();if(!p)return;
 state.activeWorkout={id:uid(),planId:p.id,workoutDate:date,startedAt:new Date().toISOString(),collapsedExerciseIds:[],items:p.exerciseIds.map(id=>({exerciseId:id,sets:workoutTemplate(ex(id))}))};
 await save();closeModal();setTab("workout");
}
let saveTimer=null;function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),250)}
function updateSet(i,j,k,v){if(!state.activeWorkout)return;state.activeWorkout.items[i].sets[j][k]=v;const item=state.activeWorkout.items[i];const complete=item.sets.length>0&&item.sets.every(x=>String(x.value??"").trim()!==""&&String(x.reps??"").trim()!=="");if(complete){state.activeWorkout.collapsedExerciseIds=[...(state.activeWorkout.collapsedExerciseIds||[]).filter(id=>id!==item.exerciseId),item.exerciseId];queueSave();render()}else queueSave()} 
function toggleExercise(i){if(!state.activeWorkout)return;const item=state.activeWorkout.items[i];const ids=new Set(state.activeWorkout.collapsedExerciseIds||[]);ids.has(item.exerciseId)?ids.delete(item.exerciseId):ids.add(item.exerciseId);state.activeWorkout.collapsedExerciseIds=[...ids];save();render()}
function toggleSet(i,j){state.activeWorkout.items[i].sets[j].done=!state.activeWorkout.items[i].sets[j].done;save();render()}
function addSet(i){const item=state.activeWorkout.items[i];item.sets.push({value:"",reps:"",done:false});state.activeWorkout.collapsedExerciseIds=(state.activeWorkout.collapsedExerciseIds||[]).filter(id=>id!==item.exerciseId);save();render()}
function removeSet(i){if(state.activeWorkout.items[i].sets.length<=1)return;state.activeWorkout.items[i].sets.pop();save();render()}
async function finishWorkout(){const w=state.activeWorkout;if(!w)return;const validItems=w.items.map(i=>({...i,sets:i.sets.filter(s=>s.value!==""||s.reps!=="")})).filter(i=>i.sets.length);if(!validItems.length){toast("Noch keine Sätze eingetragen.");return}const finished=new Date().toISOString();const workoutDate=w.workoutDate||finished.slice(0,10);const sessionDate=new Date(`${workoutDate}T12:00:00`).toISOString();state.workouts.push({id:w.id,planId:w.planId,date:sessionDate,startedAt:w.startedAt,finishedAt:finished,durationSec:Math.max(0,(Date.parse(finished)-Date.parse(w.startedAt))/1000),items:validItems});state.activeWorkout=null;await save();toast("Training gespeichert");setTab("progress")}
async function cancelWorkout(){if(!state.activeWorkout)return;if(!confirm("Aktives Training wirklich verwerfen? Deine Eingaben gehen verloren."))return;state.activeWorkout=null;await save();render()}
function recentWorkoutCard(){const w=state.workouts.at(-1);if(!w)return"";const p=state.plans.find(p=>p.id===w.planId);return `<div class="section-head"><h2>Letztes Training</h2></div><button class="card history-mini" onclick="showWorkout('${w.id}')"><b>${esc(p?.name||"Training")}</b><span>${fmtDate(w.date)} · ${fmtDuration(w.durationSec)}</span></button>`}

function renderProgress(){
 const totalSets=state.workouts.reduce((a,w)=>a+w.items.reduce((b,i)=>b+i.sets.length,0),0);
 return `<div class="stat"><div class="stat-box"><strong>${state.workouts.length}</strong><span>Trainings</span></div><div class="stat-box"><strong>${totalSets}</strong><span>Sätze</span></div><div class="stat-box"><strong>${bestCount()}</strong><span>Übungen verfolgt</span></div></div>
 <div class="section-head"><h2>Historie</h2></div>${state.workouts.length?state.workouts.slice().reverse().map(w=>historyCard(w)).join(""):`<div class="empty">Nach deinem ersten Training erscheint hier deine Historie.</div>`}
 <div class="section-head"><h2>Übungsfortschritt</h2></div>${state.library.filter(e=>state.workouts.some(w=>w.items.some(i=>i.exerciseId===e.id))).map(e=>progressCard(e)).join("")||`<div class="muted small">Noch keine Übungen mit gespeicherten Werten.</div>`}`
}
function historyCard(w){const p=state.plans.find(p=>p.id===w.planId);const sets=w.items.reduce((a,i)=>a+i.sets.length,0);return `<button class="card history-card" onclick="showWorkout('${w.id}')"><div><b>${esc(p?.name||"Training")}</b><div class="exercise-meta">${fmtDate(w.date)}</div></div><div class="history-right"><b>${sets} Sätze</b><span>${fmtDuration(w.durationSec)}</span></div></button>`}
function progressValues(id){
 const vals=[];
 state.workouts.forEach(w=>{const item=w.items?.find(i=>i.exerciseId===id);if(!item)return;const numbers=item.sets.map(set=>parseFloat(String(set.value??"").replace(",","."))).filter(v=>Number.isFinite(v)&&v>0);if(numbers.length)vals.push({v:Math.max(...numbers),date:w.date});});
 return vals.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
function bestCount(){return state.library.reduce((n,e)=>n+(progressValues(e.id).length?1:0),0)}
function progressCard(e){
 const vals=progressValues(e.id), last=vals.at(-1)?.v, best=vals.length?Math.max(...vals.map(x=>x.v)):null;
 return `<div class="card progress-item" onclick="openExerciseProgress('${e.id}')"><div class="phead"><div><b>${esc(e.name)}</b><div class="exercise-meta">${vals.length} Messwerte · Bestwert ${best??"—"} ${vals.length?unitLabel(e.unit):""}</div></div><b>${last??"—"} ${last!=null?unitLabel(e.unit):""}</b></div>${e.unit==="weight"&&vals.length?chartTimeWeight(vals):""}</div>`
}
function chartTimeWeight(vals){
 if(!vals.length)return"";
 const width=420,height=150,padX=10,padY=18;
 const min=Math.min(...vals.map(x=>x.v)),max=Math.max(...vals.map(x=>x.v)),range=max-min||1;
 const times=vals.map(x=>Date.parse(x.date));const tMin=Math.min(...times),tMax=Math.max(...times),tRange=tMax-tMin||1;
 const x0=padX,x1=width-padX,y0=height-padY,y1=padY;
 const pts=vals.map((x,i)=>{const px=tMin===tMax?(x0+x1)/2:x0+((Date.parse(x.date)-tMin)/tRange)*(x1-x0);const py=y0-((x.v-min)/range)*(y0-y1);return {x:px,y:py,v:x.v,date:x.date};});
 const points=pts.map(p=>`${p.x},${p.y}`).join(" ");
 const labels=vals.length===1?[fmtDateCompact(vals[0].date),fmtDateCompact(vals[0].date)]:[fmtDateCompact(vals[0].date),fmtDateCompact(vals.at(-1).date)];
 return `<div class="chart time-weight-chart" aria-label="Gewichtsverlauf über die Zeit"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="currentColor"><title>${fmtDateCompact(p.date)} · ${p.v} ${unitLabel("weight")}</title></circle>`).join("")}</svg><div class="chart-axis"><span>${esc(labels[0])}</span><span>${esc(labels.at(-1))}</span></div><div class="chart-labels"><span>${min} kg</span><span>${max} kg</span></div></div>`;
}
function openExerciseProgress(id){
 const e=ex(id); if(!e)return;
 const vals=progressValues(id);
 const best=vals.length?Math.max(...vals.map(x=>x.v)):null;
 const avg=vals.length?(vals.reduce((a,x)=>a+x.v,0)/vals.length):null;
 const sessions=state.workouts.filter(w=>w.items.some(i=>i.exerciseId===id)).slice().reverse();
 openModal(esc(e.name),`<div class="detail-summary"><div><b>${best??"—"} ${best!=null?unitLabel(e.unit):""}</b><span>Bestwert</span></div><div><b>${avg!=null?avg.toFixed(1):"—"} ${avg!=null?unitLabel(e.unit):""}</b><span>Ø Wert</span></div><div><b>${vals.length}</b><span>Messwerte</span></div></div>${vals.length&&e.unit==="weight"?`<div class="card-in-modal">${chartTimeWeight(vals)}</div>`:`${vals.length?`<div class="card-in-modal">${chart(vals.map(x=>x.v))}</div>`:`<div class="empty compact">Noch kein Fortschritt aufgezeichnet. Starte ein Training mit dieser Übung.</div>`}`}<div class="modal-subtitle">Letzte Einheiten</div>${sessions.slice(0,8).map(w=>{const item=w.items.find(i=>i.exerciseId===id);return `<div class="detail-ex"><div class="phead"><b>${fmtDateCompact(w.date)}</b><span class="muted">${item?.sets?.length||0} Sätze</span></div>${(item?.sets||[]).map((set,j)=>`<div class="detail-set"><span>Satz ${j+1}</span><span>${esc(set.value||"—")} ${unitLabel(e.unit)} × ${esc(set.reps||"—")} Wdh.</span></div>`).join("")}</div>`}).join("")||""}`);
}
function chart(vals){if(!vals.length)return"";const max=Math.max(...vals),min=Math.min(...vals),range=max-min||1,w=360,h=120;const pts=vals.map((v,i)=>`${i*(w/Math.max(vals.length-1,1))},${h-((v-min)/range)*(h-20)-10}`).join(" ");return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v,i)=>{const [x,y]=pts.split(" ")[i].split(",");return `<circle cx="${x}" cy="${y}" r="4" fill="currentColor"/>`}).join("")}</svg><div class="chart-labels"><span>${min}</span><span>${max}</span></div></div>`}
function renderBody(){
 const latest=latestBody();
 const metrics=[['weight','Gewicht','kg'],['chest','Brust','cm'],['waist','Taille','cm'],['arm','Arm','cm'],['thigh','Oberschenkel','cm']];
 return `<div class="section-head"><div><div class="eyebrow">KÖRPER</div><h2>Deine Entwicklung</h2></div><button class="secondary" onclick="addBodyMeasurement()">＋ Eintrag</button></div>
 ${latest?`<div class="body-grid">${metrics.map(([k,label,unit])=>{const x=latest[k];return x?`<div class="card body-stat"><span>${label}</span><strong>${esc(x)} <small>${unit}</small></strong></div>`:""}).join("")}</div>`:`<div class="empty">Noch keine Körperwerte eingetragen.</div>`}
 <div class="section-head"><h2>Verlauf</h2></div>
 ${metrics.map(([k,label,unit])=>bodyMetricCard(k,label,unit)).join("")}
 ${state.bodyMeasurements.length?`<button class="secondary full" onclick="manageBodyMeasurements()">Einträge verwalten</button>`:""}`
}
function latestBody(){return state.bodyMeasurements.slice().sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).at(-1)}
function bodyMetricCard(key,label,unit){const vals=state.bodyMeasurements.filter(x=>x[key]!==undefined&&x[key]!==null&&x[key]!=="").sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));if(!vals.length)return `<div class="card progress-item"><div class="phead"><b>${label}</b><span class="muted">Noch keine Werte</span></div></div>`;const last=vals.at(-1)[key],first=vals[0][key],delta=Number(last)-Number(first);return `<div class="card progress-item"><div class="phead"><div><b>${label}</b><div class="exercise-meta">${vals.length} Einträge · ${unit}</div></div><b>${esc(last)} ${unit}</b></div><div class="body-change">${vals.length>1?`${delta>0?"+":""}${new Intl.NumberFormat("de-DE",{maximumFractionDigits:1}).format(delta)} ${unit} seit dem ersten Eintrag`:"Erster Eintrag"}</div>${chart(vals.map(x=>Number(x[key])).filter(Number.isFinite))}</div>`}
function bodyForm(m={}){return `<div class="form-grid"><div><label class="label">Datum</label><input id="bodyDate" class="field" type="date" value="${esc(m.date?m.date.slice(0,10):new Date().toISOString().slice(0,10))}"></div><div class="two"><div><label class="label">Gewicht (kg)</label><input id="bodyWeight" class="field" inputmode="decimal" value="${esc(m.weight??"")}"></div><div><label class="label">Brust (cm)</label><input id="bodyChest" class="field" inputmode="decimal" value="${esc(m.chest??"")}"></div></div><div class="two"><div><label class="label">Taille (cm)</label><input id="bodyWaist" class="field" inputmode="decimal" value="${esc(m.waist??"")}"></div><div><label class="label">Arm (cm)</label><input id="bodyArm" class="field" inputmode="decimal" value="${esc(m.arm??"")}"></div></div><div><label class="label">Oberschenkel (cm)</label><input id="bodyThigh" class="field" inputmode="decimal" value="${esc(m.thigh??"")}"></div><button class="primary" onclick="saveBodyMeasurement()">Speichern</button></div>`}
function addBodyMeasurement(){openModal("Körperwerte",bodyForm())}
async function saveBodyMeasurement(){const val=id=>$(id).value.trim();const clean=v=>v===""?null:Number(String(v).replace(",","."));const data={id:uid(),date:new Date(`${val("bodyDate")}T12:00:00`).toISOString(),weight:clean(val("bodyWeight")),chest:clean(val("bodyChest")),waist:clean(val("bodyWaist")),arm:clean(val("bodyArm")),thigh:clean(val("bodyThigh"))};if(!data.date||[data.weight,data.chest,data.waist,data.arm,data.thigh].every(v=>v===null||!Number.isFinite(v)||v<=0)){toast("Bitte mindestens einen gültigen Wert eingeben.");return}state.bodyMeasurements.push(data);await save();closeModal();render();toast("Körperwerte gespeichert")}
function manageBodyMeasurements(){openModal("Körperwerte verwalten",`<div class="library-list">${state.bodyMeasurements.slice().sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).map(m=>`<div class="library-row"><div><b>${new Intl.DateTimeFormat("de-DE",{dateStyle:"medium"}).format(new Date(m.date))}</b><div class="exercise-meta">${[['Gewicht',m.weight,'kg'],['Brust',m.chest,'cm'],['Taille',m.waist,'cm'],['Arm',m.arm,'cm'],['Oberschenkel',m.thigh,'cm']].filter(x=>x[1]!==null&&x[1]!==undefined).map(x=>`${x[0]} ${x[1]} ${x[2]}`).join(' · ')}</div></div><button class="secondary danger" onclick="deleteBodyMeasurement('${m.id}')">Löschen</button></div>`).join("")}</div>`)}
async function deleteBodyMeasurement(id){state.bodyMeasurements=state.bodyMeasurements.filter(x=>x.id!==id);await save();manageBodyMeasurements();renderBody()}
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
  } else if(currentTab==="body") addBodyMeasurement();
  else if(currentTab==="settings") newExercise();
  else newExercise();
}
function exportData(){const payload={...state,exportedAt:new Date().toISOString(),app:"GymTrack",schemaVersion:4};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`gymtrack-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast("Backup exportiert")}
function importData(ev){const f=ev.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const parsed=JSON.parse(r.result),n=normalize(parsed);if(!n)throw new Error();if(!confirm("Backup importieren und aktuelle lokale Daten ersetzen?"))return;state=n;await save();render();toast("Backup erfolgreich importiert.")}catch{toast("Backup ist ungültig oder beschädigt.")}finally{ev.target.value=""}};r.readAsText(f)}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add("hidden"),2400)}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));$("quickAdd").onclick=quickAdd;$("closeModal").onclick=closeModal;$("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
(async()=>{try{const old=await load();state=normalize(old)||state;await save();render();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});}catch(err){console.error(err);seed(state);await save();render()}})();
