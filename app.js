const QUESTIONS = [
  "Explica los contenidos de forma clara",
  "Motiva e interesa por la materia",
  "Está disponible para resolver dudas",
  "Trata a los alumnos con respeto",
  "En general, ¿cómo valorarías a este profesor?"
];

let currentCode = null;
let adminData = { votes:[], codes:[], stats:null };

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

function cleanDigits(value){ return value.replace(/\D/g,"").slice(0,3); }
function normalizeCode(a,b){ return `${cleanDigits(a)}-${cleanDigits(b)}`; }

function showView(name){
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${name}`)?.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}

$$("[data-go]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.go)));

function toast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.classList.remove("show"), 2200);
}

async function api(path, options={}){
  const res = await fetch(path, {
    ...options,
    credentials:"same-origin",
    headers:{
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return {res,data};
}

$("#codeA").addEventListener("input", e => {
  e.target.value = cleanDigits(e.target.value);
  if(e.target.value.length === 3) $("#codeB").focus();
});
$("#codeB").addEventListener("input", e => e.target.value = cleanDigits(e.target.value));

$("#codeForm").addEventListener("submit", async e => {
  e.preventDefault();
  const status = $("#codeStatus");
  status.className = "status-msg";

  const a = $("#codeA").value;
  const b = $("#codeB").value;

  if(a.length !== 3 || b.length !== 3){
    status.textContent = "Introduce los seis dígitos del código.";
    status.classList.add("error");
    return;
  }

  const code = normalizeCode(a,b);
  status.textContent = "Comprobando código…";

  const {res,data} = await api("/api/validate-code",{
    method:"POST",
    body:JSON.stringify({code})
  });

  if(!res.ok){
    status.classList.add("error");
    if(data.error === "used") status.textContent = "Este código ya ha sido utilizado.";
    else if(data.error === "locked"){
      const mins = Math.max(1,Math.ceil(Number(data.retryAfterSeconds || 600)/60));
      status.textContent = `Demasiados intentos. Acceso bloqueado temporalmente (${mins} min).`;
    }
    else if(data.error === "invalid_code"){
      status.textContent = `Código no válido.${Number.isFinite(data.attemptsLeft) ? ` Quedan ${data.attemptsLeft} intentos.` : ""}`;
    }
    else status.textContent = "No se ha podido validar el código.";
    return;
  }

  currentCode = data.code;
  $("#activeCode").textContent = currentCode;
  status.textContent = "";
  showView("survey");
});

function renderQuestions(){
  $("#questions").innerHTML = QUESTIONS.map((q,i)=>`
    <div class="question">
      <div class="question-title">${i+1}. ${q}</div>
      <div class="scale" role="radiogroup" aria-label="${q}">
        ${[1,2,3,4,5].map(n=>`
          <label title="${n} de 5">
            <input type="radio" name="q${i}" value="${n}">
            <span>${n}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `).join("");
}
renderQuestions();

$("#comment").addEventListener("input", e => $("#commentCount").textContent = e.target.value.length);

$("#surveyForm").addEventListener("submit", async e => {
  e.preventDefault();
  const answers = QUESTIONS.map((_,i) => {
    const checked = $(`input[name="q${i}"]:checked`);
    return checked ? Number(checked.value) : null;
  });
  const status = $("#surveyStatus");
  status.className = "status-msg";

  if(answers.some(v => v === null)){
    status.textContent = "Responde las cinco preguntas antes de enviar.";
    status.classList.add("error");
    return;
  }
  if(!currentCode){
    status.textContent = "Vuelve a validar tu código.";
    status.classList.add("error");
    return;
  }

  status.textContent = "Guardando valoración…";

  const {res,data} = await api("/api/submit-vote",{
    method:"POST",
    body:JSON.stringify({
      code:currentCode,
      answers,
      comment:$("#comment").value.trim()
    })
  });

  if(!res.ok){
    status.classList.add("error");
    status.textContent = data.error === "used"
      ? "Este código ya ha sido utilizado."
      : "No se pudo guardar la valoración. Inténtalo de nuevo.";
    return;
  }

  currentCode = null;
  $("#surveyForm").reset();
  $("#commentCount").textContent = "0";
  $("#codeA").value = "";
  $("#codeB").value = "";
  status.textContent = "";
  showView("thanks");
});

$("#togglePass").addEventListener("click", () => {
  const inp = $("#adminPass");
  inp.type = inp.type === "password" ? "text" : "password";
});

$("#adminLoginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const status = $("#adminStatus");
  status.className = "status-msg";
  status.textContent = "Accediendo…";

  const {res,data} = await api("/api/admin/login",{
    method:"POST",
    body:JSON.stringify({
      user:$("#adminUser").value.trim(),
      password:$("#adminPass").value
    })
  });

  if(!res.ok){
    status.textContent = data.error === "invalid_credentials"
      ? "Usuario o contraseña incorrectos."
      : "No se ha podido iniciar sesión.";
    status.classList.add("error");
    return;
  }

  status.textContent = "";
  await loadAdmin();
});

$("#logoutBtn").addEventListener("click", async ()=>{
  await api("/api/admin/logout",{method:"POST",body:"{}"});
  $("#adminPass").value = "";
  adminData = {votes:[],codes:[],stats:null};
  showView("admin-login");
});

function switchSection(section){
  $$(".nav-item[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === section));
  $$(".dash-section").forEach(s => s.classList.remove("active"));
  $(`#section-${section}`)?.classList.add("active");
  $("#dashboardTitle").textContent = ({
    summary:"Resumen", results:"Resultados", votes:"Votos individuales", codes:"Códigos", settings:"Ajustes"
  })[section] || "Resumen";
}
$$(".nav-item[data-section]").forEach(b => b.addEventListener("click", ()=> switchSection(b.dataset.section)));
$$("[data-jump]").forEach(b => b.addEventListener("click", ()=> switchSection(b.dataset.jump)));

async function loadAdmin(){
  const {res,data} = await api("/api/admin/dashboard",{method:"GET"});
  if(res.status === 401){
    showView("admin-login");
    return;
  }
  if(!res.ok){
    toast("No se pudieron cargar los datos del panel.");
    return;
  }
  adminData = data;
  renderAdmin(data);
  showView("admin");
}

function renderAdmin(data){
  const s = data.stats;
  const votes = data.votes || [];
  const codes = data.codes || [];

  $("#totalCodes").textContent = s.totalCodes;
  $("#receivedVotes").textContent = s.votesCount;
  $("#participation").textContent = `${s.participation}%`;
  $("#donutText").textContent = `${s.participation}%`;
  $("#donut").style.setProperty("--pct",s.participation);
  $("#legendVotes").textContent = s.votesCount;
  $("#legendPending").textContent = s.pending;
  $("#pendingCount").textContent = s.pending;
  $("#ratingBase").textContent = s.votesCount
    ? `Basado en ${s.votesCount} ${s.votesCount === 1 ? "respuesta" : "respuestas"}`
    : "Sin respuestas todavía";

  $("#overallRating").textContent = s.overallRating == null ? "—" : Number(s.overallRating).toFixed(1);
  $("#overallStars").textContent = s.overallRating == null ? "☆☆☆☆☆" : "★★★★★";

  $("#questionResults").innerHTML = s.votesCount
    ? QUESTIONS.map((q,i)=>`
      <div class="result-row">
        <span>${i+1}. ${q}</span>
        <div class="result-bar"><div class="result-fill" style="width:${Number(s.questionAverages[i])*20}%"></div></div>
        <b>${Number(s.questionAverages[i]).toFixed(1)}</b>
        <span class="star-small">★</span>
      </div>`).join("")
    : `<p class="muted">Aún no hay votos. Los resultados aparecerán aquí con la primera respuesta.</p>`;

  $("#detailedResults").innerHTML = s.votesCount
    ? QUESTIONS.map((q,i)=>`
      <div class="question">
        <div class="section-title-row">
          <strong>${i+1}. ${q}</strong><strong>${Number(s.questionAverages[i]).toFixed(1)} / 5</strong>
        </div>
        <div class="result-bar" style="margin-top:10px;height:10px"><div class="result-fill" style="width:${Number(s.questionAverages[i])*20}%"></div></div>
      </div>`).join("")
    : `<p class="muted">Todavía no hay resultados disponibles.</p>`;

  $("#distribution").innerHTML = s.votesCount
    ? [5,4,3,2,1].map(n=>`
      <div class="dist-row">
        <span>${n} estrellas</span>
        <div class="dist-bar"><div class="dist-fill" style="width:${s.distribution[n]}%"></div></div>
        <b>${s.distribution[n]}%</b>
      </div>`).join("")
    : `<p class="muted">Sin datos de distribución.</p>`;

  $("#recentActivity").innerHTML = data.recent?.length
    ? data.recent.map(v=>`
      <div class="activity-item">
        <span class="activity-check">✓</span>
        <span>Código ${v.code} ha votado</span>
        <span class="activity-time">${formatDateTime(v.createdAt)}</span>
      </div>`).join("")
    : `<p class="muted">Todavía no hay actividad.</p>`;

  $("#votesTable").innerHTML = votes.length
    ? votes.map(v=>`
      <tr>
        <td><b>${v.code}</b></td>
        <td>${Number(v.average).toFixed(2)}</td>
        <td>${escapeHtml(v.comment || "—")}</td>
        <td>${formatDateTime(v.createdAt)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4">Todavía no hay votos registrados.</td></tr>`;

  $("#codesTable").innerHTML = codes.length
    ? codes.map(c=>`
      <tr>
        <td><b>${c.code}</b></td>
        <td><span class="status-chip ${c.used?"used":"free"}">${c.used?"Utilizado":"Disponible"}</span></td>
        <td>${c.used?"Sí":"No"}</td>
      </tr>`).join("")
    : `<tr><td colspan="3">Todavía no hay códigos.</td></tr>`;
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function formatDateTime(iso){
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short"}).format(d);
}

$("#generateCodesBtn").addEventListener("click", async ()=>{
  const {res,data} = await api("/api/admin/generate-codes",{
    method:"POST",
    body:JSON.stringify({count:10})
  });
  if(!res.ok){
    toast("No se pudieron generar los códigos.");
    return;
  }
  toast(`${data.codes.length} códigos nuevos generados`);
  await loadAdmin();
  switchSection("codes");
});

$("#exportBtn").addEventListener("click", ()=>{
  const votes = adminData.votes || [];
  const header = ["codigo","media","comentario","fecha",...QUESTIONS.map((_,i)=>`pregunta_${i+1}`)];
  const rows = votes.map(v=>[
    v.code,
    Number(v.average).toFixed(2),
    `"${String(v.comment||"").replaceAll('"','""')}"`,
    v.createdAt,
    ...v.answers
  ]);
  const csv = [header.join(","),...rows.map(r=>r.join(","))].join("\n");
  const blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resultados_encuesta_profesor.csv";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});

$("#helpBtn").addEventListener("click", ()=> toast("Introduce el código de 6 dígitos facilitado por el organizador."));

const date = new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"long",year:"numeric"}).format(new Date());
$("#todayPill").textContent = date.charAt(0).toUpperCase()+date.slice(1);
