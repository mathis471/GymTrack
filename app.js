const DB_NAME="gymtrack-v1", STORE="state";
let state={plans:[],activePlanId:null,history:[],library:[]};
let currentTab="plan", activeWorkout=null;

const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
async function db(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function load(){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(STORE,"readonly"),s=t.objectStore(STORE).get("state");s.onsuccess=()=>res(s.result||null);s.onerror=()=>rej(s.error)})}
async function save(){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put(state,"state");t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function seed(){if(state.plans.length)return;const exercises=[
  ["Bankdrücken","weight",3,8],["Schrägbankdrücken","weight",3,10],["Schulterdrücken","weight",3,8],["Seitheben","weight",3,12],["Trizepsdrücken","weight",3,12]
].map(([name,unit,sets,reps])=>({id:uid(),name,unit,defaultSets:sets,targetReps:reps}));
state.library=exercises;
state.plans=[{id:uid(),name:"Push",exerciseIds:exercises.map(e=>e.id)}];
state.activePlanId=state.plans[0].id;
}
function activePlan(){return state.plans.find(p=>p.id===state.activePlanId)||state.plans[0]}
function ex(id){return state.library.find(e=>e.id===id)}
function unitLabel(u){return ({weight:"kg",plates:"Scheiben",bodyweight:"Körpergewicht",time:"Zeit"})[u]||u}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setTab(t){currentTab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));render()}
function render(){document.getElementById("pageTitle").textContent={plan:"Mein Plan",workout:"Training",progress:"Fortschritt",settings:"Einstellungen"}[currentTab];document.getElementById("quickAdd").style.display=currentTab==="settings"?"none":"block";document.getElementById("content").innerHTML={plan:renderPlan,workout:renderWorkout,progress:renderProgress,settings:renderSettings}[currentTab]()}
function renderPlan(){
 const p=activePlan(); if(!p)return `<div class="empty">Noch kein Trainingsplan vorhanden.</div>`;
 return `<div class="section-head"><h2>${esc(p.name)}</h2><button class="secondary" onclick="editPlan()">Bearbeiten</button></div>
 <div class="card">${p.exerciseIds.map((id,i)=>{const e=ex(id);return e?`<div class="exercise-row"><span class="drag">☷</span><div class="exercise-info"><div class="exercise-name">${esc(e.name)}</div><div class="exercise-meta">${e.defaultSets} Sätze · ${e.targetReps?e.targetReps+" Wdh.":""} · ${unitLabel(e.unit)}</div></div><div class="row-actions"><button onclick="editExercise('${e.id}')">•••</button></div></div>`:""}).join("")}</div>
 <button class="primary" onclick="startWorkout()">Training starten</button>
 <div class="section-head"><h2>Weitere Pläne</h2><button class="secondary" onclick="newPlan()">＋ Plan</button></div>
 ${state.plans.filter(x=>x.id!==p.id).map(x=>`<div class="card" onclick="state.activePlanId='${x.id}';save().then(render)"><b>${esc(x.name)}</b><div class="exercise-meta">${x.exerciseIds.length} Übungen</div></div>`).join("")}`;
}
function renderWorkout(){
 if(!activeWorkout)return `<div class="hero"><div class="eyebrow">BEREIT?</div><h2>Dein nächstes Training</h2><p class="muted">${esc(activePlan()?.name||"Kein Plan")}</p><button class="primary" onclick="startWorkout()">Training starten</button></div>`;
 return `<div class="hero"><div class="eyebrow">AKTIVES TRAINING</div><h2>${esc(activePlan().name)}</h2><p class="muted">Übungen können in beliebiger Reihenfolge bearbeitet werden.</p></div>
 <div class="card">${activeWorkout.items.map((item,idx)=>renderWorkoutExercise(item,idx)).join("")}</div>
 <button class="primary" onclick="finishWorkout()">Training beenden</button>`;
}
function renderWorkoutExercise(item,idx){
 const e=ex(item.exerciseId); if(!e)return "";
 return `<div class="workout-exercise"><div class="we-head"><h3>${esc(e.name)}</h3><span class="last">${lastFor(e.id)}</span></div>
 <table class="set-table"><thead><tr><th>Satz</th><th>${unitLabel(e.unit)}</th><th>Wdh.</th><th></th></tr></thead><tbody>
 ${item.sets.map((s,j)=>`<tr><td class="set-no">${j+1}</td><td><input class="field" inputmode="decimal" value="${esc(s.value)}" placeholder="${e.unit==="time"?"Sek.":"—"}" onchange="updateSet(${idx},${j},'value',this.value)"></td><td><input class="field" inputmode="numeric" value="${esc(s.reps)}" placeholder="—" onchange="updateSet(${idx},${j},'reps',this.value)"></td><td><button class="check" onclick="toggleSet(${idx},${j})">${s.done?"✓":"○"}</button></td></tr>`).join("")}</tbody></table>
 <button class="add-set" onclick="addSet(${idx})">＋ Satz</button></div>`;
}
function lastFor(id){let rows=state.history.filter(h=>h.exerciseId===id);if(!rows.length)return "Noch keine Daten";let h=rows[rows.length-1], vals=h.sets.filter(s=>s.value!=="");return vals.length?`Letztes Mal: ${vals[0].value} ${unitLabel(ex(id).unit)} × ${vals[0].reps||"–"}`:"Noch keine Daten"}
function startWorkout(){const p=activePlan();activeWorkout={planId:p.id,started:new Date().toISOString(),items:p.exerciseIds.map(id=>{const e=ex(id);return {exerciseId:id,sets:Array.from({length:e.defaultSets||3},()=>({value:"",reps:"",done:false}))}})};setTab("workout")}
function updateSet(i,j,k,v){activeWorkout.items[i].sets[j][k]=v}
function toggleSet(i,j){activeWorkout.items[i].sets[j].done=!activeWorkout.items[i].sets[j].done;render()}
function addSet(i){activeWorkout.items[i].sets.push({value:"",reps:"",done:false});render()}
async function finishWorkout(){const items=activeWorkout.items.filter(x=>x.sets.some(s=>s.value!==""||s.reps!==""));items.forEach(x=>state.history.push({id:uid(),date:new Date().toISOString(),exerciseId:x.exerciseId,sets:x.sets.filter(s=>s.value!==""||s.reps!=="")}));await save();activeWorkout=null;setTab("progress")}
function renderProgress(){
 const ids=[...new Set(state.history.map(h=>h.exerciseId))];let totalSets=state.history.reduce((a,h)=>a+h.sets.length,0);
 return `<div class="stat"><div class="stat-box"><strong>${state.history.length}</strong><span>Trainings aufgezeichnet</span></div><div class="stat-box"><strong>${totalSets}</strong><span>Sätze gespeichert</span></div></div>
 <div class="section-head"><h2>Übungen</h2></div>
 ${ids.length?ids.map(id=>progressCard(id)).join(""):`<div class="empty">Nach deinem ersten Training erscheinen hier deine Fortschritte.</div>`}`;
}
function progressCard(id){
 const e=ex(id), rows=state.history.filter(h=>h.exerciseId===id), vals=rows.map(h=>Math.max(...h.sets.map(s=>parseFloat(s.value)||0))).filter(v=>v>0);let max=Math.max(...vals,1), min=Math.min(...vals,0);
 return `<div class="card progress-item"><div class="phead"><div><b>${esc(e.name)}</b><div class="exercise-meta">${rows.length} Training${rows.length===1?"":"s"}</div></div><b>${vals.length?vals[vals.length-1]+" "+unitLabel(e.unit):"—"}</b></div><div class="bar"><i style="width:${Math.min(100,(vals[vals.length-1]||0)/max*100)}%"></i></div><div class="chart">${chart(vals)}</div></div>`;
}
function chart(vals){if(!vals.length)return `<div class="empty" style="padding:35px 0">Noch keine Gewichtsdaten</div>`;let max=Math.max(...vals),min=Math.min(...vals),range=max-min||1,w=360,h=120;let pts=vals.map((v,i)=>`${i*(w/(Math.max(vals.length-1,1)))},${h-((v-min)/range)*(h-20)-10}`).join(" ");return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v,i)=>{let [x,y]=pts.split(" ")[i].split(",");return `<circle cx="${x}" cy="${y}" r="4" fill="currentColor"/>`}).join("")}</svg><div class="chart-labels"><span>${min}</span><span>${max}</span></div>`}
function renderSettings(){return `<div class="card"><h3>Daten</h3><p class="muted">Deine Trainingsdaten werden lokal auf diesem iPhone im Browser gespeichert.</p><button class="secondary" onclick="exportData()">Backup exportieren</button> <button class="secondary" onclick="document.getElementById('importFile').click()">Backup importieren</button><input id="importFile" type="file" accept=".json" hidden onchange="importData(event)"></div>
 <div class="card"><h3>Übungsbibliothek</h3><p class="muted">${state.library.length} Übungen</p><button class="primary" onclick="newExercise()">＋ Übung erstellen</button></div>`;
}
function openModal(title,html){document.getElementById("modalTitle").textContent=title;document.getElementById("modalBody").innerHTML=html;document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function newExercise(){openModal("Neue Übung",exerciseForm())}
function editExercise(id){openModal("Übung bearbeiten",exerciseForm(ex(id)))}
function exerciseForm(e={}){return `<div class="form-grid"><div><label class="label">Name</label><input id="fName" class="field" value="${esc(e.name||"")}"></div><div class="two"><div><label class="label">Einheit</label><select id="fUnit" class="field">${["weight","plates","bodyweight","time"].map(u=>`<option value="${u}" ${e.unit===u?"selected":""}>${unitLabel(u)}</option>`).join("")}</select></div><div><label class="label">Standardsätze</label><input id="fSets" class="field" type="number" value="${e.defaultSets||3}"></div></div><div><label class="label">Ziel-Wiederholungen (optional)</label><input id="fReps" class="field" value="${esc(e.targetReps||"")}"></div><button class="primary" onclick="saveExercise('${e.id||""}')">Speichern</button></div>`}
async function saveExercise(id){const data={name:document.getElementById("fName").value.trim(),unit:document.getElementById("fUnit").value,defaultSets:+document.getElementById("fSets").value||3,targetReps:document.getElementById("fReps").value.trim()};if(!data.name)return;if(id){Object.assign(ex(id),data)}else{data.id=uid();state.library.push(data)}await save();closeModal();render()}
function newPlan(){openModal("Neuer Trainingsplan",`<div class="form-grid"><div><label class="label">Name</label><input id="planName" class="field" placeholder="z. B. Pull"></div><button class="primary" onclick="savePlan()">Plan erstellen</button></div>`)}
async function savePlan(){let n=document.getElementById("planName").value.trim();if(!n)return;let p={id:uid(),name:n,exerciseIds:[]};state.plans.push(p);state.activePlanId=p.id;await save();closeModal();render()}
function editPlan(){const p=activePlan();openModal("Plan bearbeiten",`<div class="form-grid"><div><label class="label">Name</label><input id="planName" class="field" value="${esc(p.name)}"></div><button class="primary" onclick="renamePlan('${p.id}')">Speichern</button><button class="secondary" onclick="addToPlan('${p.id}')">＋ Übung zum Plan hinzufügen</button></div>`)}
async function renamePlan(id){state.plans.find(p=>p.id===id).name=document.getElementById("planName").value.trim()||"Training";await save();closeModal();render()}
function addToPlan(pid){openModal("Übung zum Plan hinzufügen",`<div class="form-grid">${state.library.map(e=>`<button class="choice" onclick="attach('${pid}','${e.id}')"><b>${esc(e.name)}</b><br><small>${e.defaultSets} Sätze · ${unitLabel(e.unit)}</small></button>`).join("")}</div>`)}
async function attach(pid,eid){let p=state.plans.find(p=>p.id===pid);if(!p.exerciseIds.includes(eid))p.exerciseIds.push(eid);await save();closeModal();render()}
function quickAdd(){newExercise()}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="gymtrack-backup.json";a.click();URL.revokeObjectURL(a.href)}
function importData(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{state=JSON.parse(r.result);await save();render();alert("Backup erfolgreich importiert.")}catch{alert("Backup konnte nicht gelesen werden.")}};r.readAsText(f)}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
document.getElementById("quickAdd").onclick=quickAdd;document.getElementById("closeModal").onclick=closeModal;document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
(async()=>{const s=await load();if(s)state=s;seed();await save();render()})();