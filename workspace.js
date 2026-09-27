'use strict';
const B=BusinessEngine,E=CarbonEngine,$=id=>document.getElementById(id);
let STORE='withu-company-guest';
const format=v=>v==null?'미입력':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:3});
const actionNames={purchase:'입고',retire:'소각',transfer:'이전'};
const uuid=()=>crypto.randomUUID();
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const now=today();
let store={version:1,companies:[],selectedCompany:'',selectedDevice:'',devices:[],start:now.slice(0,4)+'-01-01',end:now,revisions:{}};
let reading=null,sensorStatus='장치를 선택하고 조회하세요.',serverCompanies=[],viewedReport=null,editingCompany=null,editingEmission=null,editingCredit=null,toastTimer,sensorEpoch=0,storedRaw=null,storageBlocked=false;
function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
function message(text,error=false){$('workspace-message').textContent=text;$('workspace-message').classList.toggle('error',error);notify(text);}
function handle(fn){return (...args)=>{try{Promise.resolve(fn(...args)).catch(e=>message(e.message,true));}catch(e){message(e.message,true);}};}
function write(next){if(storageBlocked)throw Error('기존 저장 자료를 먼저 백업·복구하세요.');if(sessionStorage.getItem(STORE)!==storedRaw)throw Error('다른 창에서 저장 자료가 변경되었습니다. 백업 후 새로고침하세요.');const raw=JSON.stringify(next);sessionStorage.setItem(STORE,raw);storedRaw=raw;store=next;}
function company(){return store.companies.find(w=>w.id===store.selectedCompany)||null;}
function actual(){return WithUAuth.user?.role==='company'&&!!store.selectedDevice&&store.devices.some(d=>d.id===store.selectedDevice);}
function requireCompany(){if(WithUAuth.user?.role!=='company')throw Error('기업 계정으로 로그인하세요.');const w=company();if(!w)throw Error('기업·사업장 정보를 먼저 등록하세요.');return w;}
function commit(w,extra={}){const validated=B.workspace(w);if(validated.id!==WithUAuth.user?.company_id)throw Error('로그인한 기업의 자료만 저장할 수 있습니다.');const changed=store.selectedCompany!==validated.id;const companies=store.companies.filter(c=>c.id!==validated.id);companies.push(validated);if(companies.length>20)throw Error('이 브라우저의 기업은 최대 20개까지 등록할 수 있습니다.');write({...store,companies,selectedCompany:validated.id,selectedDevice:changed?'':store.selectedDevice,...extra});if(changed){reading=null;sensorEpoch++;resetEmission();resetCredit();}viewedReport=null;render();$('storage-status').textContent='브라우저 저장 완료 · 서버 반영은 별도 저장';}
function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
function fillSelectors(){
  $('company-select').replaceChildren(...(store.companies.length?store.companies.map(w=>option(w.id,w.name)):[option('','기업 로그인 필요')]));$('company-select').value=store.selectedCompany;
  $('workspace-device').replaceChildren(option('','선택 안 함 · 예시 데이터'),...store.devices.map(d=>option(d.id,d.id)));$('workspace-device').value=store.selectedDevice;
  $('soil-device').replaceChildren(option('','선택 안 함 · 예시 환경'),...store.devices.map(d=>option(d.id,d.id)));$('soil-device').value=store.selectedDevice;
}
function profile(){$('account-info').textContent=company()?company().name+' · '+company().boundary:'';}
function navigate(page){
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===page));
  document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('site-header').classList.remove('menu-open');document.querySelector('.menu-toggle').setAttribute('aria-expanded','false');$('workspace-message').textContent='';$('workspace-message').classList.remove('error');$('toast').classList.remove('show');$(page).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  if(page==='reports')renderReport();
}
function toggleMenu(){const open=$('site-header').classList.toggle('menu-open');document.querySelector('.menu-toggle').setAttribute('aria-expanded',String(open));}
function openReportExport(){navigate('reports');$('report-period').focus();}
function emptySummary(){return {emission:null,scopes:{1:null,2:null,3:null},count:0,rows:[],holding:null,retired:null,transferred:null,tree:null};}
function summary(){
  B.date(store.start);B.date(store.end);if(store.start>store.end)throw Error('보고 시작일은 종료일보다 늦을 수 없습니다.');
  if(!actual())return {...emptySummary(),emission:.70,scopes:{1:.2,2:.5,3:null},count:2,holding:13,retired:7,transferred:5,tree:{annual:.42,stock:5.12,dates:['2025-01-01','2026-01-01']}};
  const w=company();return w?B.summarize(w,store.start,store.end,store.selectedDevice):emptySummary();
}
function table(container,headers,rows){
  container.replaceChildren();if(!rows.length){const el=document.createElement('p');el.className='empty';el.textContent='등록한 자료가 없습니다.';container.append(el);return;}
  const t=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr'),body=document.createElement('tbody');
  for(const label of headers){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}head.append(tr);
  for(const values of rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value==null?'—':String(value);row.append(cell);}body.append(row);}t.append(head,body);container.append(t);
}
function actions(edit,remove){const box=document.createElement('div');for(const [label,fn] of [['수정',edit],['삭제',remove]]){if(!fn)continue;const button=document.createElement('button');button.type='button';button.className='row-action';button.textContent=label;button.onclick=handle(fn);box.append(button);}return box;}
function mutateCollection(key,fn){const w=requireCompany();commit({...w,[key]:fn(w[key])});}
function renderRecords(){
  const w=company();
  table($('emission-records'),['귀속일','범위','배출원','배출량 (tCO₂e)','근거','관리'],(w?.emissions||[]).map(r=>[r.date,'Scope '+r.scope,r.source,format(r.amount),r.evidence,actions(()=>editEmission(r),()=>mutateCollection('emissions',rows=>rows.filter(v=>v.id!==r.id)))]));
  const creditRows=(w?.credits||[]).map(r=>[r.date,actionNames[r.action],r.registry+' / '+r.serial,format(r.quantity),r.evidence,actions(()=>editCredit(r),()=>mutateCollection('credits',rows=>rows.filter(v=>v.id!==r.id)))]);
  table($('credit-records'),['기록일','구분','등록부·일련번호','tCO₂e','근거','관리'],creditRows);
  table($('survey-records'),['장치','기준 조사','현재 조사','수종 그룹','관리'],(w?.surveys||[]).map(r=>[r.device,...r.dates,r.groups.length,'관리자 등록']));
  if(actual())table($('credit-ledger'),['기록일','구분','등록부·일련번호','tCO₂e','근거'],(w?.credits||[]).filter(r=>r.date<=store.end).map(r=>[r.date,actionNames[r.action],r.registry+' / '+r.serial,format(r.quantity),r.evidence]));
  else{$('credit-ledger').replaceChildren();const p=document.createElement('p');p.className='empty';p.textContent='예시 현황입니다. 실제 크레딧 기록은 기업 데이터 입력에서 등록하세요.';$('credit-ledger').append(p);}
}
function renderSensors(){
  const demo=!actual(),r=demo?{soil_temperature:22.4,soil_moisture:38,soil_ec:null,soil_ph:null}:reading;
  $('sensor-status').textContent=demo?'예시 환경 데이터 · 실제 측정값이 아닙니다.':sensorStatus;
  $('device-sensors').replaceChildren();
  for(const [key,name,unit] of [['soil_temperature','토양 온도','°C'],['soil_moisture','토양 수분','%'],['soil_ec','EC','µS/cm'],['soil_ph','pH','pH']]){
    const box=document.createElement('article'),title=document.createElement('span'),value=document.createElement('strong'),detail=document.createElement('small');title.textContent=name;value.textContent=r?.[key]==null?'—':format(r[key])+' '+unit;detail.textContent=r?.[key]==null?'미수집':demo?'예시':'장치 측정값';box.append(title,value,detail);$('device-sensors').append(box);
  }
}
function render(){
  fillSelectors();$('period-start').value=store.start;$('period-end').value=store.end;
  const valid=actual();$('data-mode').classList.toggle('actual',valid);
  document.querySelector('.activity-intro').hidden=valid;
  $('data-mode').textContent=valid?`실제 데이터 · ${store.selectedDevice} · 미입력 자료는 예시로 대체하지 않습니다.`:'예시 데이터 · 측정 장치 미선택. 등록한 기업 자료는 저장되며, 장치 선택 시 실제 자료가 표시됩니다.';
  let s=emptySummary();try{s=summary();}catch(e){$('workspace-message').textContent=e.message;$('workspace-message').classList.add('error');}
  for(const el of document.querySelectorAll('[data-value]'))el.textContent=format(el.dataset.value==='annual'?s.tree?.annual:s[el.dataset.value]);
  $('dashboard-status').textContent=`${store.start} ~ ${store.end} · ${valid?'기업 입력 자료':'예시 데이터'}`;
  $('credit-period').textContent=`${store.end} 기준 · ${valid?'등록 기록':'예시'}`;
  $('emission-count').textContent=valid?s.count+'건 · 누락 범위 확인 필요':'예시 2건';$('company-boundary').textContent=valid?company()?.boundary||'기업 등록 필요':'예시 사업장';
  $('tree-meta').textContent=s.tree?`${s.tree.dates.join(' ~ ')} 조사 비교 · 기간 배출량과 직접 상계하지 않음`:'선택 장치의 현장 조사 자료가 없습니다.';
  $('green-sample').hidden=valid;$('refresh-device').disabled=!valid;
  renderRecords();renderSensors();renderReport();renderHistory();
}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function reportContext(){
  if(viewedReport)return {name:viewedReport.data.name,boundary:viewedReport.data.boundary,start:viewedReport.start,end:viewedReport.end,device:viewedReport.device,mode:'저장한 실제 데이터',summary:B.summarize(viewedReport.data,viewedReport.start,viewedReport.end,viewedReport.device),sensor:viewedReport.sensor||null,createdAt:viewedReport.createdAt,data:viewedReport.data};
  const w=company();return {name:actual()?w?.name||'기업 미등록':'예시 기업',boundary:actual()?w?.boundary||'미입력':'예시 사업장',start:store.start,end:store.end,device:actual()?store.selectedDevice:'미선택',mode:actual()?'실제 입력 데이터 · 미검증':'예시 데이터 · 실제 성과 아님',summary:summary(),sensor:actual()?reading:null,createdAt:null,data:actual()?w:null};
}
function reportHTML(d){
  const h=escapeHTML,s=d.summary,rows=s.rows.map(r=>`<tr><td>${h(r.date)}</td><td>Scope ${h(r.scope)}</td><td>${h(r.source)}</td><td>${format(r.amount)}</td><td>${h(r.evidence)}</td></tr>`).join('');
  return `<div class="paper-top"><div><span class="eyebrow">ENVIRONMENT REPORT</span><h1>${h(d.name)} 환경 성과 요약</h1><p>${h(d.start)} ~ ${h(d.end)}</p></div><span class="report-stamp">${h(d.mode)}</span></div>
    <h2>보고 범위와 출처</h2><p>사업장·보고 경계: ${h(d.boundary)}<br>측정 장치: ${h(d.device)}<br>기업 배출량: 사용자 입력 자료 및 활동량 산정값<br>수목: 실제 현장 조사 입력을 통한 저장량 변화 추정${d.createdAt?'<br>저장본 생성: '+h(new Date(d.createdAt).toLocaleString('ko-KR')):''}</p>
    <div class="report-data"><div><span>기간 배출량 (입력 자료 합계)</span><b>${format(s.emission)} tCO₂e</b></div><div><span>수목 연평균 저장량 변화</span><b>${format(s.tree?.annual)} tCO₂/년</b></div><div><span>보고 종료일 보유 크레딧</span><b>${format(s.holding)} tCO₂e</b></div><div><span>기간 소각 등록 크레딧</span><b>${format(s.retired)} tCO₂e</b></div></div>
    <h2>배출 범위별 입력 현황</h2><p>Scope 1: ${format(s.scopes[1])} tCO₂e<br>Scope 2: ${format(s.scopes[2])} tCO₂e<br>Scope 3: ${format(s.scopes[3])} tCO₂e<br>기간 내 배출 기록: ${s.count}건. 미입력은 0 배출을 의미하지 않습니다.</p>
    <h2>수목 산정 자료</h2><p>${s.tree?`현재 저장량: ${format(s.tree.stock)} tCO₂<br>조사 기간: ${h(s.tree.dates.join(' ~ '))}<br>위 연평균 변화는 조사 기간의 추정값이며 보고 기간의 확정 흡수량이 아닙니다.`:'이 장치의 적용 가능한 실제 수목 조사 자료가 없습니다.'} 토양·녹지 면적 보정식은 적용하지 않았습니다.</p>
    <h2>장치 최신 환경 관측</h2><p>${d.sensor?`${h(new Date(d.sensor.timestamp).toLocaleString('ko-KR'))} · ${h(d.sensor.device_id)}<br>토양 온도: ${format(d.sensor.soil_temperature)} °C · 수분: ${format(d.sensor.soil_moisture)} %<br>EC: ${format(d.sensor.soil_ec)} · pH: ${format(d.sensor.soil_ph)}`:'실제 장치 측정값은 이 보고서에 포함되지 않았습니다.'} 이 관측값은 기간 배출량 집계와 별도입니다.</p>
    <h2>배출 자료와 근거</h2>${rows?`<div class="business-table"><table><thead><tr><th>귀속일</th><th>범위</th><th>배출원</th><th>tCO₂e</th><th>근거</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p>실제 배출 상세 자료 없음.</p>'}
    <div class="report-disclosure">${h(d.mode)}. 입력 자료의 완전성·배출계수·근거 검토가 필요합니다. 수목 추정량, 실제 배출량 및 크레딧은 별도 항목입니다. 자동 크레딧 발행 또는 인증 보고서를 의미하지 않습니다.</div>`;
}
function renderReport(){try{const d=reportContext();$('report-paper').innerHTML=reportHTML(d);$('save-report').disabled=!actual()||!company()||!!viewedReport;}catch(e){$('report-paper').textContent=e.message;$('save-report').disabled=true;}}
function renderHistory(){
  $('report-list').replaceChildren();const reports=company()?.reports||[];
  if(!reports.length){const p=document.createElement('p');p.className='empty';p.textContent='저장한 보고서가 없습니다.';$('report-list').append(p);return;}
  for(const r of [...reports].reverse()){
    const box=document.createElement('article'),p=document.createElement('p');p.textContent=`${r.start} ~ ${r.end} · ${r.device} · ${new Date(r.createdAt).toLocaleString('ko-KR')}`;
    const controls=document.createElement('div');for(const [label,fn] of [['저장본 보기',()=>{viewedReport=r;navigate('reports');renderReport();}],['저장본 JSON',()=>downloadBlob(JSON.stringify(r,null,2),'WITH_U_report_'+r.id+'.json','application/json')],['삭제',()=>{if(viewedReport?.id===r.id)viewedReport=null;mutateCollection('reports',rows=>rows.filter(v=>v.id!==r.id));}]]){const b=document.createElement('button');b.className='row-action';b.type='button';b.textContent=label;b.onclick=handle(fn);controls.append(b);}box.append(p,controls);$('report-list').append(box);
  }
}
function downloadBlob(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
function reportCSV(d){
  const s=d.summary,rows=[['구분','날짜·기간','항목','값','단위','근거·상태'],['보고정보',d.start+' ~ '+d.end,d.name,'','',d.mode],['보고정보','',d.boundary,'','',d.device],['배출 합계','', '기간 입력 배출량',s.emission,'tCO2e','미입력 범위는 제외'],...['1','2','3'].map(scope=>['배출 범위','', 'Scope '+scope,s.scopes[scope],'tCO2e','사용자 입력']),['수목',s.tree?.dates.join(' ~ ')||'', '연평균 저장량 변화',s.tree?.annual??null,'tCO2/년','기간 흡수량 아님'],['크레딧',d.end,'보유',s.holding,'tCO2e','입고-소각-이전'],['크레딧',d.start+' ~ '+d.end,'소각 등록',s.retired,'tCO2e','사용자 등록']];
  for(const r of s.rows){rows.push(['배출 상세',r.date,'Scope '+r.scope+' '+r.source,r.amount,'tCO2e',r.evidence]);if(r.method==='activity')rows.push(['배출계수',r.date,r.source,r.factor,'kgCO2e/'+r.unit,r.factorSource],['활동량',r.date,r.source,r.quantity,r.unit,r.evidence]);}
  for(const r of d.data?.credits||[])if(r.date<=d.end)rows.push(['크레딧 상세',r.date,actionNames[r.action]+' '+r.registry+' / '+r.serial,r.quantity,'tCO2e',r.evidence]);
  if(d.sensor)for(const [key,unit] of [['soil_temperature','°C'],['soil_moisture','%'],['soil_ec','µS/cm'],['soil_ph','pH']])rows.push(['장치 관측',d.sensor.timestamp,key,d.sensor[key],unit,d.sensor.device_id]);
  return B.csv(rows);
}
function downloadReport(type){handle(()=>{const d=reportContext(),prefix=`WITH_U_${d.start}_${d.end}_${d.mode.includes('예시')?'sample':'data'}`;if(type==='csv')downloadBlob(reportCSV(d),prefix+'.csv','text/csv;charset=utf-8');else downloadBlob(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font-family:Arial,'Malgun Gothic',sans-serif;line-height:1.7}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}.report-data{margin:20px 0}</style></head><body>${reportHTML(d)}</body></html>`,prefix+'.doc','application/msword');message('현재 보고서에 표시된 자료를 내려받았습니다.');})();}
function printReport(){navigate('reports');setTimeout(()=>window.print(),180);}
function formObject(form){return Object.fromEntries(new FormData(form));}
function toggleEmissionFields(){const activity=$('emission-method').value==='activity';$('activity-fields').hidden=!activity;$('activity-fields').disabled=!activity;$('direct-fields').hidden=activity;$('emission-form').elements.amount.disabled=activity;for(const key of ['quantity','unit','factor','factorSource'])$('emission-form').elements[key].required=activity;previewEmission();}
function previewEmission(){const r=formObject($('emission-form'));try{const amount=r.method==='activity'?E.number(r.quantity,0,1e12,'활동량')*E.number(r.factor,0,1e6,'계수')/1000:E.number(r.amount,0,1e9,'배출량');$('emission-preview').textContent=`입력 배출량: ${format(amount)} tCO₂e`;}catch{$('emission-preview').textContent='';}}
function resetEmission(){editingEmission=null;$('emission-form').reset();$('emission-form').elements.date.value=today();toggleEmissionFields();}
function resetCredit(){editingCredit=null;$('credit-form').reset();$('credit-form').elements.date.value=today();}
function editEmission(r){editingEmission=r.id;for(const [key,value] of Object.entries(r))if($('emission-form').elements[key])$('emission-form').elements[key].value=value;toggleEmissionFields();$('emission-form').scrollIntoView({behavior:'smooth'});}
function editCredit(r){editingCredit=r.id;for(const [key,value] of Object.entries(r))if($('credit-form').elements[key])$('credit-form').elements[key].value=value;$('credit-form').scrollIntoView({behavior:'smooth'});}
async function api(path,method='GET',body){return WithUAuth.request(path,method,body);}
async function connect(){
 requireCompany();const actor=WithUAuth.user.id,button=$('connect-server');button.disabled=true;
 try{const payload=await api('/api/company-devices');if(WithUAuth.user?.id!==actor)return;const ids=payload.devices.map(d=>B.device(d.id));write({...store,devices:ids.map(id=>({id})),selectedDevice:ids.includes(store.selectedDevice)?store.selectedDevice:''});reading=null;sensorEpoch++;$('device-connection').textContent=ids.length?`${ids.length}개 연결 장치`:'연결 장치 없음';render();message('관리자가 연결한 장치 목록을 확인했습니다.');if(actual())await refreshSensor();}finally{button.disabled=false;}
}
async function refreshSensor(){
  if(!actual())throw Error('등록된 측정 장치를 선택하세요.');const epoch=++sensorEpoch,selected=store.selectedDevice,actor=WithUAuth.user.id;reading=null;sensorStatus='실제 장치 기록 조회 중';renderSensors();
  try{
    const payload=await api('/api/admin-readings?device='+encodeURIComponent(selected),'GET');
    if(epoch!==sensorEpoch||selected!==store.selectedDevice||actor!==WithUAuth.user?.id)return;
    if(!Array.isArray(payload.records))throw Error('장치 기록 형식이 올바르지 않습니다.');
    const records=payload.records.map(E.sensor).filter(r=>r.device_id===selected&&r.source==='hardware').sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));reading=records[0]||null;
    sensorStatus=reading?`실제 장치 측정 · ${new Date(reading.timestamp).toLocaleString('ko-KR')} · ${selected}`:'실제 장치 측정 기록이 없습니다. 시뮬레이션 기록은 사용하지 않습니다.';
  }catch(e){if(epoch!==sensorEpoch||selected!==store.selectedDevice||actor!==WithUAuth.user?.id)return;reading=null;sensorStatus='조회 실패 · '+e.message;message(sensorStatus,true);}
  renderSensors();renderReport();
}
async function saveServer(){
  const w=requireCompany(),payload=await api('/api/company-workspace?company='+w.id,'PUT',{document:w,baseRevision:store.revisions[w.id]||null});
  // Keep edits made during the request; only update the revision of the confirmed server snapshot.
  if(WithUAuth.user?.company_id!==w.id)return;write({...store,revisions:{...store.revisions,[w.id]:payload.revision}});$('storage-status').textContent='서버 저장 완료 · '+new Date().toLocaleString('ko-KR')+' · 이후 수정은 다시 서버 저장하세요.';message('기업 입력 자료와 저장 보고서를 서버에 저장했습니다.');
}
async function loadServer(){
  const id=WithUAuth.user?.company_id;if(!id)throw Error('기업 계정으로 로그인하세요.');
  const payload=await api('/api/company-workspace?company='+id);if(!payload.document)throw Error('서버에 기업 자료가 없습니다.');
  if(WithUAuth.user?.company_id!==id)return;const w=B.workspace(payload.document),existing=store.companies.find(v=>v.id===w.id);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(w)&&!window.confirm('이 기업의 브라우저 자료를 서버 자료로 바꿉니다. 필요한 자료를 먼저 백업했나요?'))return;
  commit(w,{revisions:{...store.revisions,[w.id]:payload.revision},selectedDevice:store.selectedDevice});reading=null;viewedReport=null;resetEmission();resetCredit();profile();render();$('storage-status').textContent='서버 자료 불러옴 · '+new Date(payload.revision).toLocaleString('ko-KR');message('서버 기업 자료를 불러왔습니다. 장치를 선택하면 실제 자료가 표시됩니다.');
}
function chooseDevice(value){if(value&&!store.devices.some(d=>d.id===value))throw Error('기업에 연결된 장치를 선택하세요.');write({...store,selectedDevice:value});reading=null;sensorEpoch++;viewedReport=null;sensorStatus='실제 장치 기록 조회 전';render();if(actual())return refreshSensor();}
$('workspace-device').onchange=handle(()=>chooseDevice($('workspace-device').value));$('soil-device').onchange=handle(()=>chooseDevice($('soil-device').value));
for(const id of ['period-start','period-end'])$(id).onchange=handle(()=>{const start=$('period-start').value,end=$('period-end').value;B.date(start);B.date(end);if(start>end)throw Error('보고 시작일은 종료일보다 늦을 수 없습니다.');write({...store,start,end});viewedReport=null;$('report-period').value='custom';render();});
$('report-period').onchange=handle(()=>{const value=$('report-period').value;if(value==='custom'){viewedReport=null;renderReport();return;}const year=store.start.slice(0,4);let start,end;if(value==='annual'){start=year+'-01-01';end=year+'-12-31';}else{const q=Number(value.slice(1)),month=(q-1)*3+1;start=year+'-'+String(month).padStart(2,'0')+'-01';end=year+'-'+String(month+2).padStart(2,'0')+'-'+(q===1||q===4?'31':'30');}write({...store,start,end});viewedReport=null;render();});
$('emission-form').onsubmit=handle(event=>{event.preventDefault();const w=requireCompany(),r=B.emission({...formObject(event.target),id:editingEmission||uuid()});commit({...w,emissions:[...w.emissions.filter(v=>v.id!==r.id),r]});resetEmission();message('실제 배출 기록을 저장했습니다. 선택 기간과 장치를 확인하세요.');});
$('emission-method').onchange=toggleEmissionFields;$('emission-form').oninput=previewEmission;$('reset-emission').onclick=resetEmission;
$('credit-form').onsubmit=handle(event=>{event.preventDefault();const w=requireCompany(),r=B.credit({...formObject(event.target),id:editingCredit||uuid()});commit({...w,credits:[...w.credits.filter(v=>v.id!==r.id),r]});resetCredit();message('크레딧 기록을 저장했습니다.');});$('reset-credit').onclick=resetCredit;
$('connect-server').onclick=handle(connect);$('refresh-device').onclick=handle(refreshSensor);$('save-server').onclick=handle(saveServer);$('load-server').onclick=handle(loadServer);
$('save-report').onclick=handle(()=>{const w=requireCompany();if(!actual())throw Error('실제 측정 장치를 선택한 뒤 보고서를 저장하세요.');const r=B.makeReport(w,store.start,store.end,store.selectedDevice,uuid(),new Date().toISOString(),reading||undefined);commit({...w,reports:[...w.reports,r]});viewedReport=r;renderReport();message('생성 당시 자료를 포함한 보고서를 이 브라우저에 저장했습니다.');});
$('live-report').onclick=()=>{viewedReport=null;renderReport();};
$('backup-company').onclick=handle(()=>{if(storageBlocked){downloadBlob(sessionStorage.getItem(STORE)||'','WITH_U_original_browser_data.json','application/json');return;}const w=requireCompany();downloadBlob(JSON.stringify(w,null,2),'WITH_U_company_'+w.id+'.json','application/json');});
$('restore-company').onchange=handle(async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>2000000)throw Error('2 MB 이내의 기업 자료 파일을 선택하세요.');const w=B.workspace(JSON.parse(await file.text()));if(w.id!==WithUAuth.user?.company_id||w.name!==company()?.name||w.boundary!==company()?.boundary||JSON.stringify(w.surveys)!==JSON.stringify(company()?.surveys))throw Error('이 기업의 자료와 관리자가 등록한 현장 조사를 유지해야 합니다.');if(storageBlocked){if(!window.confirm('원본 브라우저 저장 자료를 백업한 뒤 가져온 기업 파일로 복구하시겠습니까?'))return;storageBlocked=false;storedRaw=sessionStorage.getItem(STORE);}if(store.companies.some(c=>c.id===w.id)&&!window.confirm('같은 기업의 브라우저 자료를 가져온 파일로 바꾸시겠습니까?'))return;commit(w,{selectedDevice:''});viewedReport=null;reading=null;profile();resetEmission();resetCredit();render();for(const id of ['emission-form','credit-form'])$(id).querySelector('button[type="submit"]').disabled=false;message('기업 자료 파일을 복원했습니다.');}finally{event.target.value='';}});
let authEpoch=0,activeAccount=null;
function emptyStore(){return {version:1,companies:[],selectedCompany:'',selectedDevice:'',devices:[],start:now.slice(0,4)+'-01-01',end:now,revisions:{}};}
async function initializeAccount(){
 const epoch=++authEpoch,oldAccount=activeAccount;reading=null;sensorEpoch++;viewedReport=null;store=emptyStore();storedRaw=null;storageBlocked=false;$('company-content').hidden=true;profile();render();
 try{const result=await WithUAuth.check();if(epoch!==authEpoch)return;const user=result.user;
  if(oldAccount&&oldAccount!==user?.id)sessionStorage.removeItem('withu-company-'+oldAccount);
  activeAccount=user?.id||null;STORE='withu-company-'+(activeAccount||'guest');storedRaw=sessionStorage.getItem(STORE);
  const isCompany=user?.role==='company';$('company-content').hidden=!isCompany;document.querySelector('.workspace-bar').hidden=!isCompany;$('auth-required').hidden=isCompany;$('account-login').hidden=!!user;$('account-logout').hidden=!user;$('session-label').textContent=user?user.username+' · '+(isCompany?'기업 계정':'관리자'):'예시 화면';$('admin-login').textContent=user?.role==='admin'?'관리자 화면':'관리자 로그인';
  if(!isCompany){profile();render();return;}
  const [workspace,links]=await Promise.all([api('/api/company-workspace'),api('/api/company-devices')]);if(epoch!==authEpoch||WithUAuth.user?.id!==user.id)return;
  const w=B.workspace(workspace.document);store={...emptyStore(),companies:[w],selectedCompany:w.id,devices:links.devices.map(d=>({id:B.device(d.id)})),selectedDevice:links.devices[0]?.id||'',revisions:{[w.id]:workspace.revision}};
  if(storedRaw){try{const draft=JSON.parse(storedRaw);if(draft.companies?.length===1&&draft.companies[0].id===w.id){const dw=B.workspace(draft.companies[0]);if(dw.name===w.name&&dw.boundary===w.boundary&&JSON.stringify(dw.surveys)===JSON.stringify(w.surveys)){store.companies=[dw];store.revisions=draft.revisions||store.revisions;if(store.devices.some(d=>d.id===draft.selectedDevice)||draft.selectedDevice==='')store.selectedDevice=draft.selectedDevice;B.date(draft.start);B.date(draft.end);if(draft.start<=draft.end){store.start=draft.start;store.end=draft.end;}}}}catch{message('이전 임시 자료를 불러올 수 없습니다. 서버 자료를 사용합니다.',true);}}
  write(store);$('device-connection').textContent=store.devices.length?`${store.devices.length}개 연결 장치`:'관리자 장치 연결 대기';$('storage-status').textContent='기업 서버 자료 연결 완료 · 수정 후 서버 저장하세요.';profile();resetEmission();resetCredit();render();if(actual())await refreshSensor();
 }catch(e){if(epoch!==authEpoch)return;message(e.message,true);render();}
}
$('account-login').onclick=()=>WithUAuth.open();$('admin-login').onclick=()=>{if(WithUAuth.user?.role==='admin')location.href='admin.html';else WithUAuth.open(true);};$('account-logout').onclick=handle(()=>WithUAuth.logout());
window.addEventListener('withu-auth',initializeAccount);
profile();resetEmission();resetCredit();render();initializeAccount();if(['data','reports','credits'].includes(location.hash.slice(1)))navigate(location.hash.slice(1));if(location.hash==='#admin-login')WithUAuth.open(true);
setInterval(()=>{if(actual())handle(refreshSensor)();},21600000);
