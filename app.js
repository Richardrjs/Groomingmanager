
const KEY='scrappy_dog_manager_v2';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama'}).format(new Date());
const nowMonth=()=>today().slice(0,7);
const emptyDb={settings:{business:''},clients:[],pets:[],appointments:[],history:[],cash:[],inventory:[],workflows:[],stages:[],grooming:[],stageEvents:[]};
const legacyDb=loadLegacy();
let db=structuredClone(emptyDb);
let pendingPhotoTarget=null;
function defaultPetPhoto(){return ''}
function photoAvatar(photo, fallback='🐶'){return photo?`<img class="avatar" src="${photo}" alt="Foto">`:`<div class="avatar">${fallback}</div>`}
function requestPhoto(targetType,targetId){
  pendingPhotoTarget={targetType,targetId};
  const input=document.getElementById('photoInput');
  input.value='';
  input.click();
}
function handlePhotoSelected(e){
  const file=e.target.files[0];
  if(!file||!pendingPhotoTarget)return;
  if(file.size>4*1024*1024){alert('La foto es muy grande. Usa una imagen de menos de 4 MB.');return;}
  const reader=new FileReader();
  reader.onload=async()=>{
    const {targetType,targetId}=pendingPhotoTarget;
    if(targetType==='pet'){
      const p=pet(targetId);
      if(p){try{setSync('Subiendo foto…');const photo=await ScrappyData.uploadPetPhoto(targetId,reader.result);p.photo=photo.url;p.photoPath=photo.path;await save();openPetProfile(targetId)}catch(error){showError(error)}}
    }else if(targetType==='newPet'){
      sessionStorage.setItem('pendingNewPetPhoto',reader.result);
      alert('Foto seleccionada. Completa y guarda la mascota.');
    }
    pendingPhotoTarget=null;
  };
  reader.readAsDataURL(file);
}
function loadLegacy(){try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}}
function setSync(message,type=''){const e=document.getElementById('syncStatus');if(e){e.textContent=message;e.className=`sync-status ${type}`}}
function showError(error){console.error(error);setSync(error.message||'Ocurrió un error','error');alert(error.message||'Ocurrió un error')}
function save(){renderAll();setSync('Guardando…');return ScrappyData.sync(db).then(()=>setSync('Sincronizado','ok')).catch(showError)}
function nextId(){return ScrappyData.uuid()}
function money(n){return '$'+Number(n||0).toFixed(2)}
function client(id){return db.clients.find(x=>x.id==id)}
function pet(id){return db.pets.find(x=>x.id==id)}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('es-PA',{weekday:'long',day:'numeric',month:'long'});
document.getElementById('loginForm').onsubmit=async e=>{e.preventDefault();try{setAuthMessage('Iniciando sesión…');await ScrappyData.signIn(emailInput.value,passwordInput.value);await startAuthenticated()}catch(error){setAuthMessage(error.message,true)}};
document.getElementById('registerButton').onclick=async()=>{const field=document.getElementById('nameField');if(field.hidden){field.hidden=false;nameInput.required=true;setAuthMessage('Completa tu nombre y pulsa Crear cuenta nuevamente.');return}try{setAuthMessage('Creando cuenta…');const result=await ScrappyData.signUp(emailInput.value,passwordInput.value,nameInput.value);setAuthMessage(result.session?'Cuenta creada.':'Revisa tu correo para confirmar la cuenta.')}catch(error){setAuthMessage(error.message,true)}};
document.getElementById('setupForm').onsubmit=async e=>{e.preventDefault();try{setSync('Creando negocio…');await ScrappyData.createBusiness(businessNameInput.value);await startAuthenticated()}catch(error){showError(error)}};
function setAuthMessage(message,error=false){const e=document.getElementById('authMessage');e.textContent=message;e.style.color=error?'#b42318':''}
function showApp(){document.getElementById('loginScreen').hidden=true;document.getElementById('setupScreen').hidden=true;document.getElementById('mainApp').hidden=false;renderAll()}

document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(b.dataset.screen).classList.add('active');document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.screen==='reports')renderReports()});
document.querySelector('[data-screen="home"]').classList.add('active');

function renderAll(){renderDashboard();renderClients();renderPets();renderAppointments();renderCash();renderInventory();renderReports();renderGrooming()}
function renderDashboard(){
 const month=nowMonth(), inc=sum(db.cash.filter(x=>x.date.startsWith(month)&&x.type==='INGRESO'),'amount'), exp=sum(db.cash.filter(x=>x.date.startsWith(month)&&x.type==='GASTO'),'amount');
 setText('statClients',db.clients.length);setText('statPets',db.pets.length);setText('statToday',db.appointments.filter(x=>x.date===today()).length);setText('statBalance',money(inc-exp));
 list('todayAppointments',db.appointments.filter(x=>x.date===today()).sort((a,b)=>a.time.localeCompare(b.time)),appointmentCard);
 const alerts=[];
 db.inventory.filter(x=>Number(x.quantity)<=Number(x.minStock)).forEach(x=>alerts.push(`<div class="item low"><div><h3>Stock bajo: ${escapeHtml(x.name)}</h3><p>Quedan ${x.quantity}; mínimo ${x.minStock}</p></div></div>`));
 db.pets.forEach(p=>(p.vaccines||[]).filter(v=>v.expires&&v.expires<=addDays(today(),30)).forEach(v=>alerts.push(`<div class="item low"><div><h3>Vacuna próxima a vencer</h3><p>${escapeHtml(p.name)} · ${escapeHtml(v.name)} · ${v.expires}</p></div></div>`)));
 document.getElementById('alertsList').innerHTML=alerts.length?alerts.join(''):'<div class="empty">No hay alertas.</div>';
}
function renderClients(){
 const q=(document.getElementById('clientSearch')?.value||'').toLowerCase();
 const rows=db.clients.filter(x=>[x.name,x.phone,x.email,x.emergencyName,x.emergencyPhone].join(' ').toLowerCase().includes(q));
 list('clientsList',rows,c=>`<article class="item"><div class="item-main"><div class="avatar">👤</div><div><h3>${escapeHtml(c.name)}</h3><p>📞 ${escapeHtml(c.phone||'Sin teléfono')}</p><p>✉️ ${escapeHtml(c.email||'Sin correo')}</p><p>${db.pets.filter(p=>p.clientId===c.id).length} mascota(s)</p></div></div><div class="item-actions"><button onclick="openClientProfile('${c.id}')">Ficha</button><button onclick="openClientForm('${c.id}')">Editar</button><button class="secondary" onclick="deleteClient('${c.id}')">Eliminar</button></div></article>`);
}
function renderPets(){
 const q=(document.getElementById('petSearch')?.value||'').toLowerCase();
 const rows=db.pets.filter(x=>[x.name,x.breed,x.color,client(x.clientId)?.name].join(' ').toLowerCase().includes(q));
 list('petsList',rows,p=>`<article class="item"><div class="item-main">${photoAvatar(p.photo)}<div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(client(p.clientId)?.name||'')} · ${escapeHtml(p.species||'')} ${escapeHtml(p.breed||'')}</p><p>${p.weight?`${p.weight} kg · `:''}${escapeHtml(p.color||'')}</p><p>${escapeHtml(p.behavior||'')}</p></div></div><div class="item-actions"><button onclick="openPetProfile('${p.id}')">Ficha</button><button onclick="openHistory('${p.id}')">Historial</button><button class="secondary" onclick="openPetForm('${p.id}')">Editar</button></div></article>`);
}
function renderAppointments(){
 const f=document.getElementById('appointmentDateFilter')?.value;
 const rows=db.appointments.filter(x=>!f||x.date===f).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 list('appointmentsList',rows,appointmentCard);
}
function appointmentCard(a){return `<article class="item"><div><h3>${a.date} · ${a.time}</h3><p>${escapeHtml(client(a.clientId)?.name||'')} / ${escapeHtml(pet(a.petId)?.name||'')}</p><p>${escapeHtml(a.service)} · ${money(a.price)}</p></div><div class="item-actions"><span class="badge ${a.status==='COMPLETADA'?'ok':''}">${a.status}</span><button onclick="cycleStatus('${a.id}')">Cambiar</button><button class="secondary" onclick="openAppointmentForm('${a.id}')">Editar</button></div></article>`}
function clearAppointmentFilter(){document.getElementById('appointmentDateFilter').value='';renderAppointments()}
function renderCash(){
 const inc=sum(db.cash.filter(x=>x.type==='INGRESO'),'amount'),exp=sum(db.cash.filter(x=>x.type==='GASTO'),'amount');
 setText('cashIncome',money(inc));setText('cashExpense',money(exp));setText('cashBalance',money(inc-exp));
 list('cashList',db.cash.slice().sort((a,b)=>b.date.localeCompare(a.date)),m=>`<article class="item"><div><h3>${escapeHtml(m.description)}</h3><p>${m.date} · ${escapeHtml(m.category||'')} · ${escapeHtml(m.method||'')}</p></div><b>${m.type==='GASTO'?'-':'+'}${money(m.amount)}</b></article>`);
}
function renderInventory(){
 const q=(document.getElementById('inventorySearch')?.value||'').toLowerCase();
 const rows=db.inventory.filter(x=>[x.name,x.category,x.supplier].join(' ').toLowerCase().includes(q));
 list('inventoryList',rows,x=>`<article class="item ${Number(x.quantity)<=Number(x.minStock)?'low':''}"><div><h3>${escapeHtml(x.name)}</h3><p>${escapeHtml(x.category||'')} · Cantidad: ${x.quantity}</p><p>Costo ${money(x.cost)} · Venta ${money(x.price)}</p></div><div class="item-actions"><button onclick="adjustStock('${x.id}')">Stock</button><button class="secondary" onclick="openInventoryForm('${x.id}')">Editar</button></div></article>`);
}
function renderReports(){
 const month=nowMonth(), monthCash=db.cash.filter(x=>x.date.startsWith(month)), inc=sum(monthCash.filter(x=>x.type==='INGRESO'),'amount'),exp=sum(monthCash.filter(x=>x.type==='GASTO'),'amount'),hist=db.history.filter(x=>x.date.startsWith(month));
 setText('reportMonthIncome',money(inc));setText('reportMonthExpense',money(exp));setText('reportServices',hist.length);setText('reportAverage',money(hist.length?sum(hist,'price')/hist.length:0));
 const services=countBy(hist,'service');document.getElementById('serviceReport').innerHTML=rankHtml(services);
 const visits={};hist.forEach(h=>{const p=pet(h.petId),n=client(p?.clientId)?.name||'Sin cliente';visits[n]=(visits[n]||0)+1});document.getElementById('clientReport').innerHTML=rankHtml(visits);
}
function rankHtml(obj){const a=Object.entries(obj).sort((x,y)=>y[1]-x[1]).slice(0,8);return a.length?a.map(([k,v])=>`<div class="item"><div><h3>${escapeHtml(k)}</h3></div><b>${v}</b></div>`).join(''):'<div class="empty">Sin datos este mes.</div>'}
function countBy(arr,key){const o={};arr.forEach(x=>o[x[key]]=(o[x[key]]||0)+1);return o}
function sum(a,k){return a.reduce((s,x)=>s+Number(x[k]||0),0)}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v}
function list(id,arr,t){const e=document.getElementById(id);if(e)e.innerHTML=arr.length?arr.map(t).join(''):'<div class="empty">Sin registros.</div>'}
function addDays(d,n){const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}

const modal=document.getElementById('modal'),body=document.getElementById('modalBody'),title=document.getElementById('modalTitle'),form=document.getElementById('modalForm');
function closeModal(){modal.close()}
function openModal(t,html,saveFn){title.textContent=t;body.innerHTML=html;form.onsubmit=async e=>{e.preventDefault();try{await saveFn(Object.fromEntries(new FormData(form)));modal.close()}catch(error){showError(error)}};modal.showModal()}
function opts(a,label,selected){return a.map(x=>`<option value="${x.id}" ${x.id==selected?'selected':''}>${escapeHtml(label(x))}</option>`).join('')}
function actions(){return `<div class="actions wide"><button type="submit">Guardar</button></div>`}

function openClientForm(id){
 const c=id?client(id):{};
 openModal(id?'Editar cliente':'Nuevo cliente',`
 <label>Nombre completo<input name="name" required value="${escapeHtml(c.name||'')}"></label>
 <label>Teléfono principal<input name="phone" inputmode="tel" value="${escapeHtml(c.phone||'')}"></label>
 <label>WhatsApp<input name="whatsapp" inputmode="tel" value="${escapeHtml(c.whatsapp||c.phone||'')}"></label>
 <label>Email<input type="email" name="email" value="${escapeHtml(c.email||'')}"></label>
 <label>Dirección<input name="address" value="${escapeHtml(c.address||'')}"></label>
 <label>Cédula / identificación<input name="identification" value="${escapeHtml(c.identification||'')}"></label>
 <label>Contacto de emergencia<input name="emergencyName" value="${escapeHtml(c.emergencyName||'')}"></label>
 <label>Teléfono de emergencia<input name="emergencyPhone" inputmode="tel" value="${escapeHtml(c.emergencyPhone||'')}"></label>
 <label class="wide">Preferencias y observaciones<textarea name="notes">${escapeHtml(c.notes||'')}</textarea></label>${actions()}`,d=>{if(id)Object.assign(c,d);else db.clients.push({id:nextId(db.clients),createdAt:new Date().toISOString(),...d});save()})
}
function openClientProfile(id){
 const c=client(id),pets=db.pets.filter(p=>p.clientId===id);
 openModal(`Ficha de ${c.name}`,`
 <div class="wide detail-grid">
  <div class="detail-box"><b>Teléfono</b>${escapeHtml(c.phone||'—')}</div>
  <div class="detail-box"><b>WhatsApp</b>${escapeHtml(c.whatsapp||'—')}</div>
  <div class="detail-box"><b>Email</b>${escapeHtml(c.email||'—')}</div>
  <div class="detail-box"><b>Identificación</b>${escapeHtml(c.identification||'—')}</div>
  <div class="detail-box"><b>Dirección</b>${escapeHtml(c.address||'—')}</div>
  <div class="detail-box"><b>Emergencia</b>${escapeHtml(c.emergencyName||'—')} ${escapeHtml(c.emergencyPhone||'')}</div>
 </div>
 <div class="wide"><h3>Mascotas</h3>${pets.length?pets.map(p=>`<div class="item"><div class="item-main">${photoAvatar(p.photo)}<div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.breed||'')}</p></div></div><button type="button" onclick="closeModal();openPetProfile('${p.id}')">Ver</button></div>`).join(''):'<div class="empty">Sin mascotas registradas.</div>'}</div>
 <div class="wide"><h3>Notas</h3><p>${escapeHtml(c.notes||'Sin notas.')}</p></div>
 <div class="actions wide"><button type="button" onclick="closeModal();openPetForm(null,'${c.id}')">Agregar mascota</button><button type="button" class="secondary" onclick="closeModal();openClientForm('${c.id}')">Editar cliente</button></div>`,()=>{})
}
function deleteClient(id){if(db.pets.some(p=>p.clientId===id))return alert('Este cliente tiene mascotas registradas. Elimina o reasigna esas mascotas primero.');if(confirm('¿Eliminar cliente?')){db.clients=db.clients.filter(x=>x.id!==id);save()}}
function openPetForm(id,preferredClientId){
 const p=id?pet(id):{};
 if(!id)sessionStorage.removeItem('pendingNewPetPhoto');
 openModal(id?'Editar mascota':'Nueva mascota',`
 <div class="wide"><div class="photo-actions"><button type="button" class="secondary" onclick="requestPhoto('${id?'pet':'newPet'}',${id||0})">📷 ${id&&p.photo?'Cambiar foto':'Agregar foto'}</button></div></div>
 <label>Cliente<select name="clientId" required>${opts(db.clients,x=>x.name,p.clientId||preferredClientId)}</select></label>
 <label>Nombre<input name="name" required value="${escapeHtml(p.name||'')}"></label>
 <label>Especie<input name="species" value="${escapeHtml(p.species||'Perro')}"></label>
 <label>Raza<input name="breed" value="${escapeHtml(p.breed||'')}"></label>
 <label>Color<input name="color" value="${escapeHtml(p.color||'')}"></label>
 <label>Sexo<select name="sex"><option></option><option ${p.sex==='Macho'?'selected':''}>Macho</option><option ${p.sex==='Hembra'?'selected':''}>Hembra</option></select></label>
 <label>Fecha de nacimiento<input type="date" name="birthDate" value="${p.birthDate||''}"></label>
 <label>Peso kg<input type="number" step="0.1" name="weight" value="${p.weight||''}"></label>
 <label>Microchip<input name="microchip" value="${escapeHtml(p.microchip||'')}"></label>
 <label>Esterilizado<select name="sterilized"><option value="">No indicado</option><option value="Sí" ${p.sterilized==='Sí'?'selected':''}>Sí</option><option value="No" ${p.sterilized==='No'?'selected':''}>No</option></select></label>
 <label class="wide">Alergias / condiciones médicas<textarea name="allergies">${escapeHtml(p.allergies||'')}</textarea></label>
 <label class="wide">Comportamiento durante grooming<textarea name="behavior">${escapeHtml(p.behavior||'')}</textarea></label>
 <label class="wide">Preferencias de corte<textarea name="groomingPreferences">${escapeHtml(p.groomingPreferences||'')}</textarea></label>
 <label class="wide">Notas generales<textarea name="notes">${escapeHtml(p.notes||'')}</textarea></label>${actions()}`,async d=>{
   d.weight=Number(d.weight||0);
   if(id)Object.assign(p,d);
   else{
     const photo=sessionStorage.getItem('pendingNewPetPhoto')||'';
     const newPet={id:nextId(),vaccines:[],photo:'',photoPath:'',createdAt:new Date().toISOString(),...d};
     db.pets.push(newPet);
     await save();
     if(photo){const uploaded=await ScrappyData.uploadPetPhoto(newPet.id,photo);newPet.photo=uploaded.url;newPet.photoPath=uploaded.path}
     sessionStorage.removeItem('pendingNewPetPhoto');
   }
   await save();
 })
}
function openPetProfile(id){
 const p=pet(id),vacc=(p.vaccines||[]).map((v,i)=>`<div class="item"><div><h3>${escapeHtml(v.name)}</h3><p>Aplicada: ${v.date||'—'} · Vence: ${v.expires||'—'}</p><p>${escapeHtml(v.vet||'')}</p></div><button type="button" class="secondary" onclick="deleteVaccine('${p.id}',${i})">Eliminar</button></div>`).join('');
 const services=db.history.filter(h=>h.petId===id).sort((a,b)=>b.date.localeCompare(a.date));
 openModal(`Ficha de ${p.name}`,`
 <div class="wide"><img class="profile-photo" src="${p.photo||'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22110%22 height=%22110%22%3E%3Crect width=%22110%22 height=%22110%22 fill=%22%23edf2f6%22/%3E%3Ctext x=%2255%22 y=%2268%22 text-anchor=%22middle%22 font-size=%2245%22%3E🐶%3C/text%3E%3C/svg%3E'}"><div class="photo-actions"><button type="button" class="secondary" onclick="requestPhoto('pet','${p.id}')">📷 Cambiar foto</button></div></div>
 <div class="wide detail-grid">
  <div class="detail-box"><b>Cliente</b>${escapeHtml(client(p.clientId)?.name||'')}</div>
  <div class="detail-box"><b>Raza / color</b>${escapeHtml(p.breed||'—')} · ${escapeHtml(p.color||'—')}</div>
  <div class="detail-box"><b>Sexo / esterilizado</b>${escapeHtml(p.sex||'—')} · ${escapeHtml(p.sterilized||'—')}</div>
  <div class="detail-box"><b>Peso</b>${p.weight||'—'} kg</div>
  <div class="detail-box"><b>Microchip</b>${escapeHtml(p.microchip||'—')}</div>
  <div class="detail-box"><b>Nacimiento</b>${p.birthDate||'—'}</div>
 </div>
 <div class="wide detail-box"><b>Alergias / condiciones</b>${escapeHtml(p.allergies||'Ninguna registrada')}</div>
 <div class="wide detail-box"><b>Comportamiento</b>${escapeHtml(p.behavior||'Sin observaciones')}</div>
 <div class="wide detail-box"><b>Preferencias de corte</b>${escapeHtml(p.groomingPreferences||'Sin preferencias registradas')}</div>
 <div class="wide"><h3>Vacunas</h3>${vacc||'<div class="empty">Sin vacunas.</div>'}</div>
 <label>Vacuna<input name="name"></label><label>Fecha aplicada<input type="date" name="date"></label><label>Fecha de vencimiento<input type="date" name="expires"></label><label>Veterinaria / médico<input name="vet"></label>
 <div class="actions wide"><button type="submit">Agregar vacuna</button><button type="button" class="secondary" onclick="closeModal();openHistory('${p.id}')">Historial (${services.length})</button><button type="button" class="secondary" onclick="closeModal();openPetForm('${p.id}')">Editar</button></div>`,d=>{if(d.name){p.vaccines=p.vaccines||[];p.vaccines.push({id:nextId(),...d});save()}})
}
function deleteVaccine(petId,index){const p=pet(petId);if(confirm('¿Eliminar esta vacuna?')){p.vaccines.splice(index,1);save();openPetProfile(petId)}}
function openHistory(petId){
 const p=pet(petId),entries=db.history.filter(x=>x.petId===petId).sort((a,b)=>b.date.localeCompare(a.date));
 openModal(`Historial de ${p.name}`,`<div class="wide">${entries.length?entries.map(h=>`<div class="item"><div><h3>${h.date} · ${escapeHtml(h.service)}</h3><p>${money(h.price)} · ${escapeHtml(h.groomer||'')}</p><p>${escapeHtml(h.notes||'')}</p></div></div>`).join(''):'<div class="empty">Sin servicios.</div>'}</div>
 <label>Fecha<input type="date" name="date" required value="${today()}"></label><label>Servicio<input name="service" required></label><label>Precio<input type="number" step="0.01" name="price"></label><label>Groomer<input name="groomer"></label><label class="wide">Productos usados<textarea name="products"></textarea></label><label class="wide">Notas<textarea name="notes"></textarea></label>${actions()}`,d=>{d.petId=petId;d.clientId=p.clientId;d.price=Number(d.price||0);db.history.push({id:nextId(),...d});save()})
}
function openAppointmentForm(id){
 const a=id?db.appointments.find(x=>x.id===id):{};
 openModal(id?'Editar cita':'Nueva cita',`<label>Cliente<select name="clientId">${opts(db.clients,x=>x.name,a.clientId)}</select></label><label>Mascota<select name="petId">${opts(db.pets,x=>x.name,a.petId)}</select></label><label>Fecha<input type="date" name="date" required value="${a.date||today()}"></label><label>Hora<input type="time" name="time" required value="${a.time||''}"></label><label>Servicio<input name="service" required value="${escapeHtml(a.service||'')}"></label><label>Precio<input type="number" step="0.01" name="price" value="${a.price||''}"></label><label>Estado<select name="status">${['PENDIENTE','CONFIRMADA','COMPLETADA','CANCELADA'].map(x=>`<option ${a.status===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="wide">Notas<textarea name="notes">${escapeHtml(a.notes||'')}</textarea></label>${actions()}`,d=>{d.price=Number(d.price||0);if(id)Object.assign(a,d);else db.appointments.push({id:nextId(),...d});save()})
}
function cycleStatus(id){const s=['PENDIENTE','CONFIRMADA','COMPLETADA','CANCELADA'],a=db.appointments.find(x=>x.id===id);a.status=s[(s.indexOf(a.status)+1)%s.length];save()}
function openCashForm(){openModal('Movimiento de caja',`<label>Fecha<input type="date" name="date" required value="${today()}"></label><label>Tipo<select name="type"><option>INGRESO</option><option>GASTO</option></select></label><label>Categoría<input name="category"></label><label>Monto<input type="number" step="0.01" name="amount" required></label><label>Método<select name="method"><option>Efectivo</option><option>Yappy</option><option>Transferencia</option><option>Tarjeta</option></select></label><label class="wide">Descripción<textarea name="description" required></textarea></label>${actions()}`,d=>{d.amount=Number(d.amount);db.cash.push({id:nextId(db.cash),...d});save()})}
function openInventoryForm(id){
 const x=id?db.inventory.find(i=>i.id===id):{};
 openModal(id?'Editar producto':'Nuevo producto',`<label>Nombre<input name="name" required value="${escapeHtml(x.name||'')}"></label><label>Categoría<input name="category" value="${escapeHtml(x.category||'')}"></label><label>Cantidad<input type="number" step="0.01" name="quantity" value="${x.quantity||0}"></label><label>Stock mínimo<input type="number" step="0.01" name="minStock" value="${x.minStock||0}"></label><label>Costo<input type="number" step="0.01" name="cost" value="${x.cost||0}"></label><label>Precio<input type="number" step="0.01" name="price" value="${x.price||0}"></label><label>Proveedor<input name="supplier" value="${escapeHtml(x.supplier||'')}"></label><label class="wide">Notas<textarea name="notes">${escapeHtml(x.notes||'')}</textarea></label>${actions()}`,d=>{['quantity','minStock','cost','price'].forEach(k=>d[k]=Number(d[k]||0));if(id)Object.assign(x,d);else db.inventory.push({id:nextId(db.inventory),...d});save()})
}
function adjustStock(id){const x=db.inventory.find(i=>i.id===id),v=prompt(`Nueva cantidad de ${x.name}:`,x.quantity);if(v!==null&&!isNaN(Number(v))){x.quantity=Number(v);save()}}
function openSettings(){openModal('Configuración',`<div class="wide detail-box"><b>Negocio</b>${escapeHtml(db.settings.business)}</div><div class="wide detail-box"><b>Almacenamiento</b>Supabase · sincronización activa</div><div class="actions wide"><button type="button" class="secondary" onclick="document.getElementById('restoreInput').click()">Importar copia local</button><button type="button" class="secondary" onclick="logout()">Cerrar sesión</button><button type="button" onclick="closeModal()">Listo</button></div>`,()=>{})}
async function logout(){try{await ScrappyData.signOut()}finally{location.reload()}}
function exportBackup(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`scrappy-dog-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
function restoreBackup(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{try{const x=JSON.parse(r.result);if(!confirm('¿Importar esta copia a Supabase? Los registros recibirán identificadores nuevos.'))return;setSync('Importando…');db=await ScrappyData.migrateLegacy(x);db=await ScrappyData.loadAll();renderAll();setSync('Importación completa','ok')}catch(error){showError(error)}finally{e.target.value=''}};r.readAsText(f)}

function renderGrooming(){
 const rows=db.grooming||[],stages=db.stages||[];
 list('groomingList',rows,s=>{
  const workflowStages=stages.filter(x=>x.workflow_id===s.workflowId).sort((a,b)=>a.position-b.position);
  const current=workflowStages.find(x=>x.id===s.currentStageId),next=workflowStages.find(x=>x.position===(current?.position||0)+1);
  const pills=workflowStages.map(x=>`<span class="stage-pill ${current&&x.position<current.position?'done':''} ${x.id===s.currentStageId?'current':''}">${escapeHtml(x.name)}</span>`).join('');
  return `<article class="item"><div><h3>${escapeHtml(pet(s.petId)?.name||'Mascota')}</h3><p>${escapeHtml(client(s.clientId)?.name||'')}</p><div class="stage-track">${pills}</div><p>${s.readyAt?'Lista para retirar':current?`Etapa actual: ${escapeHtml(current.name)}`:'Pendiente de recepción'}</p></div><div class="item-actions">${next?`<button onclick="advanceGrooming('${s.id}','${next.id}',${s.version})">Avanzar a ${escapeHtml(next.name)}</button>`:''}</div></article>`;
 });
}

function openGroomingForm(){
 if(!db.workflows.length)return alert('No existe un flujo de grooming activo.');
 openModal('Iniciar seguimiento',`
  <label>Cliente<select name="clientId" required>${opts(db.clients,x=>x.name)}</select></label>
  <label>Mascota<select name="petId" required>${opts(db.pets,x=>x.name)}</select></label>
  <label>Flujo<select name="workflowId" required>${opts(db.workflows,x=>x.name)}</select></label>
  <label>Hora estimada<input type="datetime-local" name="estimatedReadyAt"></label>
  <label class="wide">Notas internas<textarea name="internalNotes"></textarea></label>${actions()}`,
  async d=>{await ScrappyData.createGroomingSession({...d,estimatedReadyAt:d.estimatedReadyAt?new Date(d.estimatedReadyAt).toISOString():null});await refreshRemote()});
}

async function advanceGrooming(sessionId,stageId,version){
 try{setSync('Actualizando etapa…');await ScrappyData.advanceStage(sessionId,stageId,version);await refreshRemote()}
 catch(error){showError(error)}
}

async function refreshRemote(){
 try{db=await ScrappyData.loadAll();renderAll();setSync('Sincronizado','ok')}
 catch(error){showError(error)}
}

async function startAuthenticated(){
 document.getElementById('loginScreen').hidden=true;
 const currentBusiness=await ScrappyData.loadBusiness();
 if(!currentBusiness){document.getElementById('setupScreen').hidden=false;document.getElementById('mainApp').hidden=true;return}
 setSync('Cargando datos…');
 db=await ScrappyData.loadAll();
 showApp();
 ScrappyData.subscribe(refreshRemote);
 if(legacyDb&&!localStorage.getItem('scrappy_supabase_migrated_at')&&!db.clients.length){
  if(confirm('Encontramos datos guardados en este dispositivo. ¿Quieres importarlos a Supabase ahora?')){
   setSync('Migrando datos locales…');
   db=await ScrappyData.migrateLegacy(legacyDb);
   db=await ScrappyData.loadAll();
   renderAll();
  }
 }
 setSync('Sincronizado','ok');
}

async function bootstrap(){
 try{
  ScrappyData.init();
  const currentSession=await ScrappyData.session();
  if(currentSession)await startAuthenticated();
  else{document.getElementById('loginScreen').hidden=false;setAuthMessage('Inicia sesión con tu correo y contraseña.')}
  ScrappyData.onAuthChange(session=>{if(!session){document.getElementById('mainApp').hidden=true;document.getElementById('loginScreen').hidden=false}});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
 }catch(error){setAuthMessage(error.message,true);document.getElementById('loginScreen').hidden=false}
}
bootstrap();
