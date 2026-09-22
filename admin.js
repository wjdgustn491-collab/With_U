'use strict';
const E=CarbonEngine,$=id=>document.getElementById(id),form=$('workspace');
const format=(n,d=3)=>n.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
let sensorRecord=null,mode='직접 입력 · 미검증',groupId=0;
const fields=[['n','수량 (그루)',0,10000000],['d','평균 DBH (cm)',0.01,1000],['h','평균 수고 (m)',0.01,150]];
function input(label,name,min,max,value=''){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.type='number';i.dataset.key=name;i.min=min;i.max=max;i.step=name.startsWith('n')?'1':'any';i.value=value;l.append(i);return l;}
function addTree(values={}){
 const box=document.createElement('div');box.className='tree-group';box.dataset.group=++groupId;
 const head=document.createElement('div');head.className='group-head';const label=document.createElement('label');label.textContent='수종명';const species=document.createElement('input');species.dataset.key='species';species.placeholder='예: 소나무';species.maxLength=80;species.value=values.species||'';label.append(species);const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='그룹 삭제';remove.addEventListener('click',()=>{box.remove();markEdited();render();});head.append(label,remove);box.append(head);
 const periods=document.createElement('div');periods.className='grid two';
 for(let t=0;t<2;t++){const p=document.createElement('div');p.className='tree-period';const h=document.createElement('h3');h.textContent=t?'현재 조사':'기준 조사';p.append(h);const grid=document.createElement('div');grid.className='grid three';fields.forEach(([k,l,min,max])=>grid.append(input(l,k+t,min,max,values[k+t]??'')));p.append(grid);periods.append(p);}box.append(periods);
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='계수 설정 · 기본값은 기존 프로젝트의 공통 가정';details.append(summary);const help=document.createElement('p');help.className='help';help.textContent='수종명만 변경해도 계수가 자동으로 바뀌지는 않습니다. 수종별 검증 계수가 있으면 직접 수정하세요. 기존 모델은 모든 수종에 동일한 기본밀도를 사용합니다.';details.append(help);const grid=document.createElement('div');grid.className='grid three';
 for(const [k,l,min,max,v] of [['density','목재 기본밀도 (kg/m³)',1,2000,500],['f','형수 F',0.01,1,.45],['bef','확장계수 BEF',1,5,1.3],['r','뿌리/지상부 비 R',0,3,.25],['cf','탄소분율 CF',.01,1,.5]])grid.append(input(l,k,min,max,values[k]??v));details.append(grid);box.append(details);$('tree-groups').append(box);
}
for(let t=0;t<2;t++){const p=document.createElement('div');const h=document.createElement('h3');h.textContent=t?'현재 토양 분석':'기준 토양 분석';p.append(h);for(const [k,l,min,max] of [['soc','SOC (g C/kg 토양)',0,1000],['bd','전체 건조토양 용적밀도 (g/cm³)',.01,3],['gravel','2 mm 이상 조립질 질량비 (%)',0,100]]){const field=input(l,k+t,min,max);field.querySelector('input').id=k+t;p.append(field);} $('soil-inputs').append(p);}
function groupData(){return [...document.querySelectorAll('.tree-group')].map(box=>Object.fromEntries([...box.querySelectorAll('[data-key]')].map(i=>[i.dataset.key,i.value])));}
function note(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function markEdited(){mode=mode.includes('예시')?'예시에서 수정 · 미검증':'직접 입력 · 미검증';}
function renderSensors(){
 $('sensor-cards').replaceChildren();
 for(const [k,name,unit] of [['soil_temperature','토양 온도','°C'],['soil_moisture','토양 수분','%'],['soil_ec','전기전도도 EC','µS/cm'],['soil_ph','산도 pH','pH']]){const a=document.createElement('article'),p=document.createElement('p'),strong=document.createElement('strong'),small=document.createElement('small');p.textContent=name;strong.textContent=sensorRecord?.[k]==null?'—':format(sensorRecord[k],k==='soil_ec'?0:1);small.textContent=sensorRecord?.[k]==null?'미측정':unit;a.append(p,strong,small);$('sensor-cards').append(a);}
 $('sensor-source').textContent=!sensorRecord?'연결 전':sensorRecord.source==='simulation'?'시뮬레이션 기록':'장치 기록 파일 · 실시간 아님';
 if(sensorRecord){const age=(Date.now()-Date.parse(sensorRecord.timestamp))/3600000;const ageText=age<0?'기록 시각이 미래입니다':age>24?'24시간 이상 지난 기록':'파일에 기록된 관측값';$('sensor-meta').textContent=`${sensorRecord.device_id} · ${new Date(sensorRecord.timestamp).toLocaleString('ko-KR')} · ${ageText}`;}else $('sensor-meta').textContent='아직 읽은 기록이 없습니다.';
}
function render(){
 $('data-mode').textContent=mode;
 const errors=[],parts=[];let area=null,dt=null,tree0=null,tree1=null,soil0=null,soil1=null;
 const polygonMode=$('area-mode').value==='polygon';$('manual-area').hidden=polygonMode;$('polygon-area').hidden=!polygonMode;$('boundary-preview').hidden=true;
 try{if(polygonMode){const p=E.polygon($('boundary').value);area=p.area;const xs=p.xy.map(v=>v[0]),ys=p.xy.map(v=>v[1]),xmin=Math.min(...xs),ymin=Math.min(...ys),scale=Math.min(320/(Math.max(...xs)-xmin||1),110/(Math.max(...ys)-ymin||1));const shape=document.createElementNS('http://www.w3.org/2000/svg','polygon');shape.setAttribute('points',p.xy.map(v=>`${20+(v[0]-xmin)*scale},${130-(v[1]-ymin)*scale}`).join(' '));shape.setAttribute('fill','#c2ded7');shape.setAttribute('stroke','#176b70');shape.setAttribute('stroke-width','2');$('boundary-preview').replaceChildren(shape);$('boundary-preview').hidden=false;}else area=E.number($('area').value,0,1e8,'녹지 면적');$('area-value').textContent=format(area,1)+' m²';$('area-detail').textContent=format(area/10000,4)+' ha · '+(polygonMode?'입력 경계의 평면 근사 면적':'직접 조사 면적');}catch(e){$('area-value').textContent='— m²';$('area-detail').textContent=e.message;errors.push(e.message);}
 try{const lat=E.number($('lat').value,-85,85,'GPS 위도'),lon=E.number($('lon').value,-180,180,'GPS 경도');$('gps-value').textContent=`장치 GPS · ${lat.toFixed(6)}, ${lon.toFixed(6)} (WGS84)`;}catch{$('gps-value').textContent='장치 GPS 입력 대기 또는 좌표 범위 오류';}
 try{dt=E.years($('date0').value,$('date1').value);}catch(e){errors.push(e.message);}
 const groups=groupData();
 for(const t of [0,1]){try{if(!groups.length)throw Error('수종 그룹을 추가하세요.');let sum=0;for(const g of groups){if(!g.species.trim())throw Error('수종명을 입력하세요.');sum+=E.tree(g,t);}if(t)tree1=sum;else tree0=sum;}catch(e){errors.push((t?'현재':'기준')+' 수목: '+e.message);}}
 const soil=Object.fromEntries(['soc0','soc1','bd0','bd1','gravel0','gravel1','depth'].map(k=>[k,$(k).value]));
 for(const t of [0,1]){try{if(area===null)throw Error('녹지 면적이 필요합니다.');const s=E.soil(soil,t,area);if(t)soil1=s;else soil0=s;}catch(e){errors.push((t?'현재':'기준')+' 토양: '+e.message);}}
 const treeAnnual=dt!==null&&tree0!==null&&tree1!==null?(tree1-tree0)/dt:null;
 const soilAnnual=dt!==null&&soil0!==null&&soil1!==null&&$('soil-comparable').checked?(soil1-soil0)/dt:null;
 if(soil0!==null&&soil1!==null&&!$('soil-comparable').checked)errors.push('토양 비교 조건을 확인하면 토양 변화량이 표시됩니다.');
 $('tree-stock').textContent=tree1===null?'산정 대기':format(tree1);$('soil-stock').textContent=soil1===null?'분석값 필요':format(soil1);$('annual').textContent=treeAnnual!==null&&soilAnnual!==null?format(treeAnnual+soilAnnual):'일부 자료 부족';
 $('result-context').textContent=[$('site').value||'현장 미지정',mode,dt===null?'조사 기간 입력 대기':`${$('date0').value} → ${$('date1').value} · ${format(dt,2)}년`].join(' / ');
 parts.push('수목 연평균 변화: '+(treeAnnual===null?'기준·현재 조사값과 날짜 필요':format(treeAnnual)+' tCO₂/년'));
 parts.push('토양 연평균 변화: '+(soilAnnual===null?'분석값·날짜·비교 조건 확인 필요':format(soilAnnual)+' tCO₂/년'));
 if(tree0!==null&&tree1!==null)parts.push('수목 기간 변화량: '+format(tree1-tree0)+' tCO₂');
 if(soil0!==null&&soil1!==null&&$('soil-comparable').checked)parts.push('토양 기간 변화량: '+format(soil1-soil0)+' tCO₂');
 $('breakdown').replaceChildren(...[...parts,...new Set(errors)].map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
}
function snapshot(){return {version:1,mode,fields:Object.fromEntries([...form.querySelectorAll('[id]')].filter(i=>['INPUT','SELECT','TEXTAREA'].includes(i.tagName)&&i.type!=='file').map(i=>[i.id,i.type==='checkbox'?i.checked:i.value])),groups:groupData(),sensor:sensorRecord};}
function restore(data){if(data.version!==1||!Array.isArray(data.groups)||data.groups.length>50)throw Error('지원하지 않는 저장 형식입니다.');for(const [k,v] of Object.entries(data.fields||{})){const el=$(k);if(el&&form.contains(el)&&['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&el.type!=='file'){if(el.type==='checkbox')el.checked=v===true;else el.value=String(v);}}$('tree-groups').replaceChildren();data.groups.forEach(addTree);sensorRecord=data.sensor?E.sensor(data.sensor):null;mode=data.mode||'저장한 입력 · 미검증';renderSensors();render();}
form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',e=>{if(e.target.type==='file')return;markEdited();render();});
$('add-tree').addEventListener('click',()=>{if(groupData().length>=50){note('수종 그룹은 최대 50개입니다.',true);return;}addTree();markEdited();render();});
$('save').addEventListener('click',()=>{try{localStorage.setItem('withu-admin-v1',JSON.stringify(snapshot()));note('현재 입력을 이 브라우저에 저장했습니다. 서버에는 전송하지 않았습니다.');}catch{note('브라우저 저장 공간을 사용할 수 없습니다. 입력값은 현재 화면에서만 유지됩니다.',true);}});
$('sample').addEventListener('click',()=>{restore({version:1,mode:'예시 데이터 · 미검증',fields:{site:'정문 녹지 · 예시',lat:35.94831,lon:126.95752,'area-mode':'manual',area:3500,boundary:'35.9480,126.9570\n35.9480,126.9575\n35.9485,126.9575\n35.9485,126.9570',date0:'2025-09-22',date1:'2026-09-22',depth:30,soc0:20,soc1:20.5,bd0:1.3,bd1:1.3,gravel0:0,gravel1:0,'soil-comparable':true},groups:[{species:'소나무',n0:20,n1:20,d0:20,d1:20.8,h0:8,h1:8.3}],sensor:{device_id:'DEMO-RPI-01',timestamp:'2026-09-21T03:00:00Z',source:'simulation',soil_temperature:21.8,soil_moisture:47.1,soil_ec:450,soil_ph:6.5}});note('예시값을 불러왔습니다. 실제 현장의 관측·검증 결과가 아닙니다.');});
$('sensor-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('2 MB 이하 JSON 파일을 선택하세요.');const data=JSON.parse(await file.text());const records=(Array.isArray(data)?data:[data]).map(E.sensor);if(!records.length)throw Error('비어 있는 기록입니다.');const devices=new Set(records.map(r=>r.device_id));if(devices.size>1)throw Error('한 장치의 기록만 담긴 파일을 선택하세요.');records.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));sensorRecord=records[0];renderSensors();note('기록을 읽었습니다. 파일의 가장 최근 관측값을 표시합니다.');}catch(err){note('불러오기 실패: '+err.message,true);}finally{e.target.value='';}});
try{const saved=localStorage.getItem('withu-admin-v1');if(saved){restore(JSON.parse(saved));note('이 브라우저에 저장한 입력을 불러왔습니다.');}else{addTree();renderSensors();render();}}catch{addTree();renderSensors();render();note('저장 기록을 불러오지 못했습니다. 새 입력으로 시작합니다.',true);}
