let publicSurvey = null;
let publicQuestions = [];
let currentCode = null;
let currentSurveyId = null;

let adminSurveys = [];
let adminSurveyId = null;
let adminData = null;
let editorQuestions = [];

const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>[...root.querySelectorAll(sel)];

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function cleanDigits(value){ return String(value || "").replace(/\D/g,"").slice(0,3); }
function formatDateTime(iso){
  if(!iso) return "—";
  const d = new Date(String(iso).replace(" ","T")+"Z");
  if(Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short"}).format(d);
}

function toast(msg){
  const el=$("#toast");
  el.textContent=msg;
  el.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>el.classList.remove("show"),2400);
}

async function api(path,options={}){
  const res=await fetch(path,{
    ...options,
    credentials:"same-origin",
    headers:{
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
  let data={};
  try{data=await res.json();}catch{}
  return {res,data};
}

function showView(name){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $(`#view-${name}`)?.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}

$$("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
$$("[data-jump]").forEach(b=>b.addEventListener("click",()=>switchSection(b.dataset.jump)));

function applyTheme(s){
  if(!s) return;
  document.documentElement.style.setProperty("--purple",s.accentColor || "#6f4fe8");
  document.documentElement.style.setProperty("--navy",s.headerColor || "#101d3b");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",s.headerColor || "#101d3b");
}

function fillPublicSurvey(s,questions=[]){
  publicSurvey=s;
  publicQuestions=questions;
  if(!s){
    $("#landingTitle").textContent="No hay ninguna encuesta activa";
    $("#landingIntro").textContent="El administrador debe activar una encuesta.";
    $("#codeForm").style.display="none";
    return;
  }

  $("#codeForm").style.display="";
  document.title=s.title || "Valora";
  applyTheme(s);
  $("#brandNameTop").textContent=s.brandName;
  $("#landingEyebrow").textContent=s.eyebrow;
  $("#landingTitle").textContent=s.title;
  $("#landingIntro").textContent=s.introText;
  $("#accessButton").textContent=s.accessButtonText;
  $("#singleUseText").textContent=s.singleUseText;

  (s.benefits || []).slice(0,3).forEach((b,i)=>{
    $(`#benefit${i+1}Title`).textContent=b.title;
    $(`#benefit${i+1}Text`).textContent=b.text;
  });

  $("#surveyEyebrow").textContent=s.surveyEyebrow;
  $("#surveyTitle").textContent=s.surveyTitle;
  $("#surveyDescription").textContent=s.surveyDescription;
  $("#commentLabel").textContent=s.commentLabel;
  $("#comment").placeholder=s.commentPlaceholder;
  $("#commentBlock").style.display=s.allowComments ? "" : "none";
  $("#submitButton").textContent=s.submitButtonText;
  $("#thanksEyebrow").textContent=s.thanksEyebrow;
  $("#thanksTitle").textContent=s.thanksTitle;
  $("#thanksText").textContent=s.thanksText;

  $("#heroVisual").style.display=s.showHeroImage ? "" : "none";
  if(s.heroImageUrl) $("#heroImage").src=s.heroImageUrl;
}

async function loadPublic(){
  const {res,data}=await api("/api/public-config",{method:"GET"});
  if(!res.ok){
    $("#landingTitle").textContent="No se pudo cargar la encuesta";
    $("#landingIntro").textContent="Inténtalo de nuevo en unos segundos.";
    return;
  }
  fillPublicSurvey(data.survey,data.questions || []);
}
loadPublic();

$("#codeA").addEventListener("input",e=>{
  e.target.value=cleanDigits(e.target.value);
  if(e.target.value.length===3) $("#codeB").focus();
});
$("#codeB").addEventListener("input",e=>e.target.value=cleanDigits(e.target.value));

$("#codeForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const a=$("#codeA").value,b=$("#codeB").value;
  const status=$("#codeStatus");
  status.className="status-msg";

  if(a.length!==3 || b.length!==3){
    status.textContent="Introduce los seis dígitos del código.";
    status.classList.add("error");
    return;
  }

  const code=`${a}-${b}`;
  status.textContent="Comprobando código…";

  const {res,data}=await api("/api/validate-code",{
    method:"POST",
    body:JSON.stringify({code})
  });

  if(!res.ok){
    status.classList.add("error");
    if(data.error==="used") status.textContent="Este código ya ha sido utilizado.";
    else if(data.error==="blocked_code") status.textContent="Este código está bloqueado por el administrador.";
    else if(data.error==="permanent_ip_block") status.textContent="Este acceso ha sido bloqueado permanentemente por demasiados intentos erróneos.";
    else if(data.error==="locked"){
      const hours=Math.max(1,Math.ceil(Number(data.retryAfterSeconds || 3600)/3600));
      status.textContent=data.permanentAfterLock
        ? `Demasiados intentos. Acceso bloqueado durante ${hours} h; después quedará bloqueado permanentemente.`
        : `Demasiados intentos. Acceso bloqueado durante ${hours} h.`;
    }else if(data.error==="invalid_code"){
      status.textContent=`Código no válido.${Number.isFinite(data.attemptsLeft)?` Quedan ${data.attemptsLeft} intentos.`:""}`;
    }else status.textContent="No se ha podido validar el código.";
    return;
  }

  currentCode=data.code;
  currentSurveyId=data.survey.id;
  fillPublicSurvey(data.survey,data.questions || []);
  $("#activeCode").textContent=currentCode;
  renderPublicQuestions();
  status.textContent="";
  showView("survey");
});

function renderPublicQuestions(){
  $("#questions").innerHTML=publicQuestions.map((q,index)=>{
    const req=q.required?'<span class="required-mark">*</span>':'';
    let control="";

    if(q.type==="scale"){
      control=`<div class="scale">
        ${[1,2,3,4,5].map(n=>`
          <label>
            <input type="radio" name="q_${q.id}" value="${n}">
            <span>${n}</span>
          </label>`).join("")}
      </div>`;
    }else if(q.type==="yes_no"){
      control=`<div class="yes-no-grid">
        <label><input type="radio" name="q_${q.id}" value="yes"><span>Sí</span></label>
        <label><input type="radio" name="q_${q.id}" value="no"><span>No</span></label>
      </div>`;
    }else if(q.type==="choice"){
      control=`<div class="choice-grid">
        ${(q.options || []).map(opt=>`
          <label><input type="radio" name="q_${q.id}" value="${escapeHtml(opt)}"><span>${escapeHtml(opt)}</span></label>
        `).join("")}
      </div>`;
    }else{
      control=`<textarea class="question-textarea" name="q_${q.id}" maxlength="1500" placeholder="Escribe tu respuesta"></textarea>`;
    }

    return `<div class="question" data-question-id="${q.id}">
      <div class="question-title">${index+1}. ${escapeHtml(q.text)} ${req}</div>
      ${control}
    </div>`;
  }).join("");
}

$("#comment").addEventListener("input",e=>$("#commentCount").textContent=e.target.value.length);

$("#surveyForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const status=$("#surveyStatus");
  status.className="status-msg";

  const answers={};
  for(const q of publicQuestions){
    if(q.type==="text"){
      answers[q.id]=$(`[name="q_${q.id}"]`)?.value ?? "";
    }else{
      answers[q.id]=$(`[name="q_${q.id}"]:checked`)?.value ?? "";
    }
  }

  status.textContent="Guardando respuesta…";
  const {res,data}=await api("/api/submit-response",{
    method:"POST",
    body:JSON.stringify({
      code:currentCode,
      surveyId:currentSurveyId,
      answers,
      comment:publicSurvey?.allowComments ? $("#comment").value.trim() : ""
    })
  });

  if(!res.ok){
    status.classList.add("error");
    if(data.error==="required_question") status.textContent="Falta responder alguna pregunta obligatoria.";
    else if(data.error==="used") status.textContent="Este código ya ha sido utilizado.";
    else if(data.error==="blocked_code") status.textContent="Este código ha sido bloqueado por el administrador.";
    else status.textContent="No se pudo guardar la respuesta.";
    return;
  }

  currentCode=null;
  currentSurveyId=null;
  $("#surveyForm").reset();
  $("#commentCount").textContent="0";
  $("#codeA").value="";
  $("#codeB").value="";
  status.textContent="";
  showView("thanks");
});

$("#helpBtn").addEventListener("click",()=>toast("Introduce el código XXX-XXX que te haya facilitado el organizador."));

/* ===================== ADMIN AUTH ===================== */
$("#togglePass").addEventListener("click",()=>{
  const inp=$("#adminPass");
  inp.type=inp.type==="password"?"text":"password";
});

$("#adminLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const status=$("#adminStatus");
  status.className="status-msg";
  status.textContent="Accediendo…";

  const {res,data}=await api("/api/admin/login",{
    method:"POST",
    body:JSON.stringify({
      user:$("#adminUser").value.trim(),
      password:$("#adminPass").value
    })
  });

  if(!res.ok){
    status.textContent=data.error==="invalid_credentials"
      ?"Usuario o contraseña incorrectos."
      :"No se pudo iniciar sesión.";
    status.classList.add("error");
    return;
  }

  status.textContent="";
  await loadAdminSurveys();
  showView("admin");
});

$("#logoutBtn").addEventListener("click",async()=>{
  await api("/api/admin/logout",{method:"POST",body:"{}"});
  adminData=null;
  showView("admin-login");
});

/* ===================== ADMIN NAV ===================== */
const sectionTitles={
  summary:"Resumen",
  results:"Resultados",
  responses:"Respuestas",
  codes:"Códigos",
  editor:"Editar encuesta",
  surveys:"Encuestas"
};

function switchSection(section){
  $$(".nav-item[data-section]").forEach(b=>b.classList.toggle("active",b.dataset.section===section));
  $$(".dash-section").forEach(s=>s.classList.remove("active"));
  $(`#section-${section}`)?.classList.add("active");
  $("#dashboardTitle").textContent=sectionTitles[section] || "Resumen";
  if(section==="editor") loadSurveyEditor(adminSurveyId);
}
$$(".nav-item[data-section]").forEach(b=>b.addEventListener("click",()=>switchSection(b.dataset.section)));

const date=new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(new Date());
$("#todayPill").textContent=date.charAt(0).toUpperCase()+date.slice(1);

/* ===================== ADMIN SURVEYS ===================== */
async function loadAdminSurveys(selectId=null){
  const {res,data}=await api("/api/admin/surveys",{method:"GET"});
  if(res.status===401){showView("admin-login");return;}
  if(!res.ok){toast("No se pudieron cargar las encuestas.");return;}

  adminSurveys=data.surveys || [];
  if(!adminSurveys.length){
    adminSurveyId=null;
    renderSurveyList();
    return;
  }

  const active=adminSurveys.find(s=>Number(s.active)===1);
  const desired=Number(selectId || adminSurveyId || active?.id || adminSurveys[0].id);
  adminSurveyId=adminSurveys.some(s=>Number(s.id)===desired) ? desired : Number(adminSurveys[0].id);

  $("#adminSurveySelect").innerHTML=adminSurveys.map(s=>
    `<option value="${s.id}" ${Number(s.id)===adminSurveyId?"selected":""}>${escapeHtml(s.title)}${Number(s.active)===1?" • ACTIVA":""}</option>`
  ).join("");

  renderSurveyList();
  await loadAdminDashboard();
}

$("#adminSurveySelect").addEventListener("change",async e=>{
  adminSurveyId=Number(e.target.value);
  await loadAdminDashboard();
  if($("#section-editor").classList.contains("active")) await loadSurveyEditor(adminSurveyId);
});

function renderSurveyList(){
  $("#surveyCards").innerHTML=adminSurveys.length ? adminSurveys.map(s=>`
    <article class="survey-admin-card ${Number(s.active)===1?"is-active":""}">
      <div>
        <span class="survey-state-chip ${Number(s.active)===1?"active":"inactive"}">${Number(s.active)===1?"Activa":"Inactiva"}</span>
        <h4>${escapeHtml(s.title)}</h4>
        <p>${Number(s.code_count)} códigos · ${Number(s.response_count)} respuestas</p>
      </div>
      <div class="survey-card-actions">
        <button class="secondary-btn compact" data-select-survey="${s.id}">Abrir</button>
        ${Number(s.active)!==1?`<button class="primary-btn compact" data-activate-survey="${s.id}">Activar</button>`:""}
        <button class="text-btn compact-text" data-clone-survey="${s.id}">Duplicar</button>
      </div>
    </article>
  `).join("") : `<p class="muted">No hay encuestas.</p>`;

  $$("[data-select-survey]").forEach(b=>b.addEventListener("click",async()=>{
    adminSurveyId=Number(b.dataset.selectSurvey);
    $("#adminSurveySelect").value=String(adminSurveyId);
    await loadAdminDashboard();
    switchSection("editor");
  }));
  $$("[data-activate-survey]").forEach(b=>b.addEventListener("click",()=>activateSurvey(Number(b.dataset.activateSurvey))));
  $$("[data-clone-survey]").forEach(b=>b.addEventListener("click",()=>cloneSurvey(Number(b.dataset.cloneSurvey))));
}

$("#newSurveyForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const title=$("#newSurveyTitle").value.trim() || "Nueva encuesta";
  const {res,data}=await api("/api/admin/surveys",{
    method:"POST",
    body:JSON.stringify({title})
  });
  if(!res.ok){toast("No se pudo crear la encuesta.");return;}
  $("#newSurveyTitle").value="";
  await loadAdminSurveys(data.id);
  switchSection("editor");
});

$("#cloneSurveyBtn").addEventListener("click",()=>cloneSurvey(adminSurveyId));

async function cloneSurvey(id){
  if(!id) return;
  const {res,data}=await api("/api/admin/surveys",{
    method:"POST",
    body:JSON.stringify({cloneSurveyId:id})
  });
  if(!res.ok){toast("No se pudo duplicar.");return;}
  await loadAdminSurveys(data.id);
  switchSection("editor");
}

async function activateSurvey(id){
  const {res,data}=await api(`/api/admin/survey?id=${id}`,{method:"GET"});
  if(!res.ok) return toast("No se pudo cargar la encuesta.");
  const payload=surveyPayloadFromApi(data);
  payload.survey.active=true;
  const save=await api("/api/admin/survey",{
    method:"PUT",
    body:JSON.stringify(payload)
  });
  if(!save.res.ok) return toast("No se pudo activar.");
  await loadAdminSurveys(id);
  await loadPublic();
  toast("Encuesta activada");
}

/* ===================== DASHBOARD ===================== */
async function loadAdminDashboard(){
  if(!adminSurveyId) return;
  const {res,data}=await api(`/api/admin/dashboard?surveyId=${adminSurveyId}`,{method:"GET"});
  if(res.status===401){showView("admin-login");return;}
  if(!res.ok){toast("No se pudieron cargar los datos.");return;}
  adminData=data;
  renderAdmin(data);
}

function renderAdmin(data){
  const s=data.stats || {};
  $("#adminSurveyState").textContent=data.survey?.active ? "ENCUESTA ACTIVA" : "ENCUESTA INACTIVA";
  $("#sidebarBrand").textContent=data.survey?.brandName || "Valora";

  $("#totalCodes").textContent=s.totalCodes || 0;
  $("#receivedVotes").textContent=s.responseCount || 0;
  $("#accessedPending").textContent=s.accessedPending || 0;
  $("#participation").textContent=`${s.participation || 0}%`;
  $("#donutText").textContent=`${s.participation || 0}%`;
  $("#donut").style.setProperty("--pct",s.participation || 0);
  $("#legendAnswered").textContent=s.responseCount || 0;
  $("#legendAccessed").textContent=s.accessedPending || 0;
  $("#legendUnused").textContent=s.unused || 0;

  $("#overallRating").textContent=s.overallRating==null?"—":Number(s.overallRating).toFixed(1);
  $("#overallStars").textContent=s.overallRating==null?"☆☆☆☆☆":"★★★★★";

  renderQuestionSummary(data.questionStats || []);
  renderDetailedResults(data.questionStats || []);

  $("#distribution").innerHTML=s.overallRating==null
    ? `<p class="muted">No hay preguntas de escala 1–5 respondidas.</p>`
    : [5,4,3,2,1].map(n=>`
        <div class="dist-row">
          <span>${n} estrellas</span>
          <div class="dist-bar"><div class="dist-fill" style="width:${s.distribution?.[n] || 0}%"></div></div>
          <b>${s.distribution?.[n] || 0}%</b>
        </div>`).join("");

  $("#recentActivity").innerHTML=data.recent?.length
    ? data.recent.map(r=>`
      <div class="activity-item">
        <span class="activity-check">✓</span>
        <span>${escapeHtml(displayPerson(r) || r.code)} respondió</span>
        <span class="activity-time">${formatDateTime(r.createdAt)}</span>
      </div>`).join("")
    : `<p class="muted">Todavía no hay respuestas.</p>`;

  $("#responsesTable").innerHTML=data.responses?.length
    ? data.responses.map(r=>`
      <tr>
        <td><b>${escapeHtml(r.code)}</b></td>
        <td>${escapeHtml(displayPerson(r) || "—")}</td>
        <td>${escapeHtml(r.email || "—")}</td>
        <td>${escapeHtml(r.phone || "—")}</td>
        <td>${r.average==null?"—":Number(r.average).toFixed(2)}</td>
        <td>${escapeHtml(r.comment || "—")}</td>
        <td>${formatDateTime(r.createdAt)}</td>
      </tr>`).join("")
    : `<tr><td colspan="7">Todavía no hay respuestas.</td></tr>`;

  renderCodesTable(data.codes || []);
}

function displayPerson(r){
  return [r.firstName,r.lastName].filter(Boolean).join(" ").trim();
}

function renderQuestionSummary(stats){
  $("#questionResults").innerHTML=stats.length ? stats.map((q,i)=>{
    if(q.type==="scale"){
      const avg=q.average==null?0:Number(q.average);
      return `<div class="result-row">
        <span>${i+1}. ${escapeHtml(q.text)}</span>
        <div class="result-bar"><div class="result-fill" style="width:${avg*20}%"></div></div>
        <b>${q.average==null?"—":avg.toFixed(1)}</b><span class="star-small">★</span>
      </div>`;
    }
    if(q.type==="yes_no"){
      return `<div class="generic-stat-row">
        <strong>${i+1}. ${escapeHtml(q.text)}</strong>
        <span>${q.count?`${q.yesPercent}% Sí`:"Sin respuestas"}</span>
      </div>`;
    }
    if(q.type==="choice"){
      const entries=Object.entries(q.counts || {}).sort((a,b)=>b[1]-a[1]);
      return `<div class="generic-stat-row">
        <strong>${i+1}. ${escapeHtml(q.text)}</strong>
        <span>${entries.length && q.count ? `${escapeHtml(entries[0][0])} (${entries[0][1]})`:"Sin respuestas"}</span>
      </div>`;
    }
    return `<div class="generic-stat-row">
      <strong>${i+1}. ${escapeHtml(q.text)}</strong>
      <span>${q.count} respuestas de texto</span>
    </div>`;
  }).join("") : `<p class="muted">Esta encuesta no tiene preguntas activas.</p>`;
}

function renderDetailedResults(stats){
  $("#detailedResults").innerHTML=stats.length ? stats.map((q,i)=>{
    if(q.type==="scale"){
      const avg=q.average==null?0:Number(q.average);
      return `<div class="question result-detail-block">
        <div class="section-title-row"><strong>${i+1}. ${escapeHtml(q.text)}</strong><strong>${q.average==null?"—":`${avg.toFixed(1)} / 5`}</strong></div>
        <div class="result-bar" style="margin-top:10px;height:10px"><div class="result-fill" style="width:${avg*20}%"></div></div>
        <small>${q.count} respuestas</small>
      </div>`;
    }
    if(q.type==="yes_no"){
      return `<div class="question result-detail-block">
        <strong>${i+1}. ${escapeHtml(q.text)}</strong>
        <div class="binary-result"><span>Sí: ${q.yes} (${q.yesPercent}%)</span><span>No: ${q.no}</span></div>
      </div>`;
    }
    if(q.type==="choice"){
      const total=q.count || 0;
      return `<div class="question result-detail-block">
        <strong>${i+1}. ${escapeHtml(q.text)}</strong>
        <div class="choice-results">${Object.entries(q.counts || {}).map(([opt,count])=>{
          const pct=total?Math.round(count/total*100):0;
          return `<div class="choice-result-row"><span>${escapeHtml(opt)}</span><div class="result-bar"><div class="result-fill" style="width:${pct}%"></div></div><b>${count}</b></div>`;
        }).join("")}</div>
      </div>`;
    }
    return `<div class="question result-detail-block">
      <strong>${i+1}. ${escapeHtml(q.text)}</strong>
      <div class="text-answer-list">${q.samples?.length
        ? q.samples.map(x=>`<blockquote>${escapeHtml(x)}</blockquote>`).join("")
        : '<p class="muted">Sin respuestas de texto.</p>'}</div>
    </div>`;
  }).join("") : `<p class="muted">Sin preguntas.</p>`;
}

/* ===================== CÓDIGOS ===================== */
function statusLabel(c){
  if(c.status==="answered") return ["answered","Respondida"];
  if(c.status==="accessed") return ["accessed","Accedió"];
  return ["unused","Sin usar"];
}

function renderCodesTable(codes){
  $("#codesTable").innerHTML=codes.length ? codes.map(c=>{
    const [cls,label]=statusLabel(c);
    return `<tr class="code-row code-${cls}">
      <td>
        <span class="status-chip ${cls}">● ${label}</span>
        ${c.blocked?'<span class="status-chip blocked">⛔ Bloqueado</span>':""}
      </td>
      <td><b>${escapeHtml(c.code)}</b></td>
      <td>${escapeHtml(c.firstName || "—")}</td>
      <td>${escapeHtml(c.lastName || "—")}</td>
      <td>${escapeHtml(c.email || "—")}</td>
      <td>${escapeHtml(c.phone || "—")}</td>
      <td>${formatDateTime(c.firstAccessAt)}</td>
      <td>${formatDateTime(c.lastAccessAt)}</td>
      <td class="row-actions">
        ${c.isDemo?'<span class="demo-badge">CONTROL</span>':""}
        <button class="mini-btn" data-edit-code="${c.id}">Editar</button>
        <button class="mini-btn ${c.blocked?'unblock':'block'}" data-toggle-block="${c.id}">${c.blocked?"Desbloquear":"Bloquear"}</button>
        ${!c.protected?`<button class="mini-btn danger" data-delete-code="${c.id}">Borrar</button>`:""}
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="9">Todavía no hay códigos.</td></tr>`;

  $$("[data-edit-code]").forEach(b=>b.addEventListener("click",()=>startCodeEdit(Number(b.dataset.editCode))));
  $$("[data-toggle-block]").forEach(b=>b.addEventListener("click",()=>toggleCodeBlock(Number(b.dataset.toggleBlock))));
  $$("[data-delete-code]").forEach(b=>b.addEventListener("click",()=>deleteCode(Number(b.dataset.deleteCode))));
}

async function toggleCodeBlock(id){
  const c=adminData.codes.find(x=>Number(x.id)===id);
  if(!c) return;
  const {res}=await api("/api/admin/code",{
    method:"PUT",
    body:JSON.stringify({id,blocked:!c.blocked})
  });
  if(!res.ok){ toast("No se pudo cambiar el bloqueo."); return; }
  await loadAdminDashboard();
  toast(c.blocked?"Código desbloqueado":"Código bloqueado");
}

function resetCodeForm(){
  $("#codeAdminForm").reset();
  $("#codeEditId").value="";
  $("#saveCodeBtn").textContent="Añadir código";
  $("#cancelCodeEdit").classList.add("hidden");
}

function startCodeEdit(id){
  const c=adminData.codes.find(x=>Number(x.id)===id);
  if(!c) return;
  $("#codeEditId").value=c.id;
  $("#codeEditCode").value=c.code;
  $("#codeFirstName").value=c.firstName || "";
  $("#codeLastName").value=c.lastName || "";
  $("#codeEmail").value=c.email || "";
  $("#codePhone").value=c.phone || "";
  $("#saveCodeBtn").textContent="Guardar cambios";
  $("#cancelCodeEdit").classList.remove("hidden");
  $("#codeAdminForm").scrollIntoView({behavior:"smooth",block:"center"});
}
$("#cancelCodeEdit").addEventListener("click",resetCodeForm);

$("#codeAdminForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=Number($("#codeEditId").value || 0);
  const payload={
    id:id || undefined,
    surveyId:adminSurveyId,
    code:$("#codeEditCode").value.trim(),
    firstName:$("#codeFirstName").value.trim(),
    lastName:$("#codeLastName").value.trim(),
    email:$("#codeEmail").value.trim(),
    phone:$("#codePhone").value.trim()
  };

  const {res,data}=await api("/api/admin/code",{
    method:id?"PUT":"POST",
    body:JSON.stringify(payload)
  });

  if(!res.ok){
    if(data.error==="duplicate_code") toast("Ese código ya existe.");
    else if(data.error==="invalid_v10_pattern") toast("Formato no permitido. Usa ABA-CDE: A≠B y C,D,E distintos.");
    else toast("No se pudo guardar el código.");
    return;
  }

  resetCodeForm();
  await loadAdminDashboard();
  toast(id?"Código actualizado":"Código creado");
});

async function deleteCode(id){
  if(!confirm("¿Eliminar este código?")) return;
  const {res,data}=await api("/api/admin/code",{
    method:"DELETE",
    body:JSON.stringify({id})
  });
  if(!res.ok){
    toast(data.error==="protected_code" ? "El código de control no se puede borrar." : "No se pudo eliminar.");
    return;
  }
  await loadAdminDashboard();
}

$("#generateCodesBtn").addEventListener("click",async()=>{
  const {res,data}=await api("/api/admin/generate-codes",{
    method:"POST",
    body:JSON.stringify({surveyId:adminSurveyId,count:10})
  });
  if(!res.ok){toast("No se pudieron generar.");return;}
  await loadAdminDashboard();
  toast(`${data.codes.length} códigos generados`);
});

/* ===================== EDITOR ===================== */
function surveyPayloadFromApi(data){
  const s=data.survey;
  return {
    id:Number(s.id),
    survey:{
      brandName:s.brand_name,
      eyebrow:s.eyebrow,
      title:s.title,
      introText:s.intro_text,
      accessButtonText:s.access_button_text,
      singleUseText:s.single_use_text,
      benefit1Title:s.benefit1_title,
      benefit1Text:s.benefit1_text,
      benefit2Title:s.benefit2_title,
      benefit2Text:s.benefit2_text,
      benefit3Title:s.benefit3_title,
      benefit3Text:s.benefit3_text,
      surveyEyebrow:s.survey_eyebrow,
      surveyTitle:s.survey_title,
      surveyDescription:s.survey_description,
      commentLabel:s.comment_label,
      commentPlaceholder:s.comment_placeholder,
      submitButtonText:s.submit_button_text,
      thanksEyebrow:s.thanks_eyebrow,
      thanksTitle:s.thanks_title,
      thanksText:s.thanks_text,
      heroImageUrl:s.hero_image_url,
      showHeroImage:Number(s.show_hero_image)===1,
      allowComments:Number(s.allow_comments)===1,
      accentColor:s.accent_color,
      headerColor:s.header_color,
      maxAttempts:Number(s.max_attempts),
      lockMinutes:Number(s.lock_minutes),
      active:Number(s.active)===1
    },
    questions:(data.questions || []).map(q=>({...q}))
  };
}

async function loadSurveyEditor(id){
  if(!id) return;
  const {res,data}=await api(`/api/admin/survey?id=${id}`,{method:"GET"});
  if(!res.ok){toast("No se pudo cargar el editor.");return;}

  const p=surveyPayloadFromApi(data);
  const s=p.survey;
  $("#edBrandName").value=s.brandName;
  $("#edEyebrow").value=s.eyebrow;
  $("#edTitle").value=s.title;
  $("#edIntroText").value=s.introText;
  $("#edAccessButton").value=s.accessButtonText;
  $("#edSingleUse").value=s.singleUseText;
  $("#edB1Title").value=s.benefit1Title;
  $("#edB1Text").value=s.benefit1Text;
  $("#edB2Title").value=s.benefit2Title;
  $("#edB2Text").value=s.benefit2Text;
  $("#edB3Title").value=s.benefit3Title;
  $("#edB3Text").value=s.benefit3Text;
  $("#edSurveyEyebrow").value=s.surveyEyebrow;
  $("#edSurveyTitle").value=s.surveyTitle;
  $("#edSurveyDescription").value=s.surveyDescription;
  $("#edCommentLabel").value=s.commentLabel;
  $("#edCommentPlaceholder").value=s.commentPlaceholder;
  $("#edSubmitButton").value=s.submitButtonText;
  $("#edThanksEyebrow").value=s.thanksEyebrow;
  $("#edThanksTitle").value=s.thanksTitle;
  $("#edThanksText").value=s.thanksText;
  $("#edHeroImage").value=s.heroImageUrl;
  $("#edShowHero").checked=s.showHeroImage;
  $("#edAllowComments").checked=s.allowComments;
  $("#edAccentColor").value=s.accentColor || "#6f4fe8";
  $("#edHeaderColor").value=s.headerColor || "#101d3b";
  $("#edMaxAttempts").value=s.maxAttempts;
  $("#edLockMinutes").value=s.lockMinutes;
  $("#edActive").checked=s.active;

  editorQuestions=p.questions;
  renderQuestionEditor();
}

function renderQuestionEditor(){
  $("#questionEditorList").innerHTML=editorQuestions.length ? editorQuestions.map((q,i)=>`
    <div class="question-editor-row" data-q-index="${i}">
      <div class="question-editor-order">
        <button type="button" class="mini-btn" data-move-up="${i}" ${i===0?"disabled":""}>↑</button>
        <span>${i+1}</span>
        <button type="button" class="mini-btn" data-move-down="${i}" ${i===editorQuestions.length-1?"disabled":""}>↓</button>
      </div>
      <div class="question-editor-main">
        <input class="qe-text" value="${escapeHtml(q.text)}" placeholder="Texto de la pregunta">
        <div class="qe-options-row">
          <select class="qe-type">
            <option value="scale" ${q.type==="scale"?"selected":""}>Escala 1–5</option>
            <option value="yes_no" ${q.type==="yes_no"?"selected":""}>Sí / No</option>
            <option value="choice" ${q.type==="choice"?"selected":""}>Elección</option>
            <option value="text" ${q.type==="text"?"selected":""}>Texto libre</option>
          </select>
          <label class="qe-required"><input type="checkbox" ${q.required!==false?"checked":""}> Obligatoria</label>
          <button type="button" class="mini-btn danger" data-remove-question="${i}">Eliminar</button>
        </div>
        <input class="qe-choice-options ${q.type==="choice"?"":"hidden"}"
          value="${escapeHtml((q.options || []).join(" | "))}"
          placeholder="Opciones separadas por |  Ej.: Sí | No | Tal vez">
      </div>
    </div>
  `).join("") : `<p class="muted">No hay preguntas. Pulsa “Añadir pregunta”.</p>`;

  $$(".question-editor-row").forEach((row,i)=>{
    $(".qe-text",row).addEventListener("input",e=>editorQuestions[i].text=e.target.value);
    $(".qe-type",row).addEventListener("change",e=>{
      editorQuestions[i].type=e.target.value;
      renderQuestionEditor();
    });
    $(".qe-required input",row).addEventListener("change",e=>editorQuestions[i].required=e.target.checked);
    const choice=$(".qe-choice-options",row);
    if(choice) choice.addEventListener("input",e=>{
      editorQuestions[i].options=e.target.value.split("|").map(x=>x.trim()).filter(Boolean);
    });
  });

  $$("[data-move-up]").forEach(b=>b.addEventListener("click",()=>moveQuestion(Number(b.dataset.moveUp),-1)));
  $$("[data-move-down]").forEach(b=>b.addEventListener("click",()=>moveQuestion(Number(b.dataset.moveDown),1)));
  $$("[data-remove-question]").forEach(b=>b.addEventListener("click",()=>{
    editorQuestions.splice(Number(b.dataset.removeQuestion),1);
    renderQuestionEditor();
  }));
}

function moveQuestion(index,delta){
  const target=index+delta;
  if(target<0 || target>=editorQuestions.length) return;
  [editorQuestions[index],editorQuestions[target]]=[editorQuestions[target],editorQuestions[index]];
  renderQuestionEditor();
}

$("#addQuestionBtn").addEventListener("click",()=>{
  editorQuestions.push({id:null,text:"",type:"scale",options:[],required:true});
  renderQuestionEditor();
});

$("#surveyEditorForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const survey={
    brandName:$("#edBrandName").value.trim(),
    eyebrow:$("#edEyebrow").value.trim(),
    title:$("#edTitle").value.trim(),
    introText:$("#edIntroText").value.trim(),
    accessButtonText:$("#edAccessButton").value.trim(),
    singleUseText:$("#edSingleUse").value.trim(),
    benefit1Title:$("#edB1Title").value.trim(),
    benefit1Text:$("#edB1Text").value.trim(),
    benefit2Title:$("#edB2Title").value.trim(),
    benefit2Text:$("#edB2Text").value.trim(),
    benefit3Title:$("#edB3Title").value.trim(),
    benefit3Text:$("#edB3Text").value.trim(),
    surveyEyebrow:$("#edSurveyEyebrow").value.trim(),
    surveyTitle:$("#edSurveyTitle").value.trim(),
    surveyDescription:$("#edSurveyDescription").value.trim(),
    commentLabel:$("#edCommentLabel").value.trim(),
    commentPlaceholder:$("#edCommentPlaceholder").value.trim(),
    submitButtonText:$("#edSubmitButton").value.trim(),
    thanksEyebrow:$("#edThanksEyebrow").value.trim(),
    thanksTitle:$("#edThanksTitle").value.trim(),
    thanksText:$("#edThanksText").value.trim(),
    heroImageUrl:$("#edHeroImage").value.trim(),
    showHeroImage:$("#edShowHero").checked,
    allowComments:$("#edAllowComments").checked,
    accentColor:$("#edAccentColor").value,
    headerColor:$("#edHeaderColor").value,
    maxAttempts:Number($("#edMaxAttempts").value),
    lockMinutes:Number($("#edLockMinutes").value),
    active:$("#edActive").checked
  };

  const questions=editorQuestions.map(q=>({
    id:q.id || null,
    text:String(q.text || "").trim(),
    type:q.type,
    options:q.type==="choice"?(q.options || []):[],
    required:q.required!==false
  })).filter(q=>q.text);

  const {res,data}=await api("/api/admin/survey",{
    method:"PUT",
    body:JSON.stringify({id:adminSurveyId,survey,questions})
  });

  if(!res.ok){
    toast(data.error==="choice_needs_options"
      ?"Una pregunta de elección necesita al menos 2 opciones."
      :"No se pudo guardar la encuesta.");
    return;
  }

  await loadAdminSurveys(adminSurveyId);
  await loadSurveyEditor(adminSurveyId);
  await loadPublic();
  toast("Encuesta guardada");
});

/* ===================== CSV ===================== */
$("#exportBtn").addEventListener("click",()=>{
  if(!adminData) return;
  const stats=adminData.questionStats || [];
  const qMap=new Map(stats.map(q=>[q.id,q.text]));
  const headers=["codigo","nombre","apellidos","email","telefono","media","comentario","fecha",...stats.map(q=>q.text)];
  const rows=(adminData.responses || []).map(r=>{
    const answers=new Map((r.answers || []).map(a=>[a.questionId,a.text || a.numericValue || ""]));
    return [
      r.code,r.firstName,r.lastName,r.email,r.phone,
      r.average ?? "",r.comment,r.createdAt,
      ...stats.map(q=>answers.get(q.id) ?? "")
    ];
  });
  const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`encuesta_${adminSurveyId}_resultados.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
