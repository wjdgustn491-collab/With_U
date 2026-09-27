// Local-only browser regression test. Uses the installed Edge CDP endpoint.
// Run Edge headless with an isolated profile and debugging port 9239 first.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=require('node:fs').existsSync(path.resolve(__dirname,'../website/index.html'))?path.resolve(__dirname,'../website'):path.resolve(__dirname,'..');
const B=require(path.join(root,'business-engine.js'));
const artifacts=path.resolve(__dirname,'qa');
const accounts=new Map([['admin',{id:'admin-account',username:'admin',password:'1234',role:'admin',company_id:null}]]),sessions=new Map(),documents=new Map(),assignments=new Map();
let failReadings=false;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  const cookie=/withu_session=([^;]+)/.exec(req.headers.cookie||'')?.[1],user=sessions.get(cookie);
  const safe=u=>({id:u.id,username:u.username,role:u.role,company_id:u.company_id});
  if(url.pathname==='/api/auth'){
   if(req.method==='GET')return user?send(200,{user:safe(user)}):send(401,{error:'로그인해 주세요.'});
   if(body.action==='logout'){sessions.delete(cookie);res.setHeader('Set-Cookie','withu_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return send(200,{ok:true});}
   let account=accounts.get(body.username);
   if(body.action==='signup'){if(account)return send(409,{error:'이미 사용 중인 아이디'});account={id:crypto.randomUUID(),username:body.username,password:body.password,role:'company',company_id:crypto.randomUUID()};accounts.set(account.username,account);documents.set(account.company_id,{document:{version:1,id:account.company_id,name:body.name,boundary:body.boundary,emissions:[],credits:[],surveys:[],reports:[]},revision:new Date().toISOString()});}
   if(!account||account.password!==body.password||((body.action==='admin-login')!==(account.role==='admin')))return send(401,{error:'아이디 또는 비밀번호를 확인하세요.'});
   const token=crypto.randomUUID();sessions.set(token,account);res.setHeader('Set-Cookie','withu_session='+token+'; Path=/; HttpOnly; SameSite=Lax');return send(200,{user:safe(account)});
  }
  if(!user)return send(401,{error:'로그인 필요'});
  if(url.pathname==='/api/company-devices'){
   if(req.method==='GET')return send(200,user.role==='admin'?{companies:[...accounts.values()].filter(a=>a.role==='company').map(a=>({id:a.company_id,username:a.username,name:documents.get(a.company_id).document.name})),devices:['pi5-monitor-01','pi5-monitor-02'].map(id=>({id,company_id:assignments.get(id)||null}))}:{devices:[...assignments].filter(([id,company])=>company===user.company_id).map(([id])=>({id}))});
   if(user.role!=='admin')return send(403,{error:'관리자만 가능'});if(req.method==='PUT')assignments.set(body.device,body.company);else assignments.delete(body.device);return send(200,{ok:true});
  }
  if(url.pathname==='/api/admin-location'){if(user.role!=='admin')return send(403,{error:'관리자만 가능'});return send(200,url.searchParams.get('list')==='1'?{devices:['pi5-monitor-01','pi5-monitor-02'].map(id=>({id,location:null}))}:{location:req.method==='PUT'?{device_id:url.searchParams.get('device'),latitude:body.latitude,longitude:body.longitude,source:'admin',updated_at:new Date().toISOString()}:null});}
  if(url.pathname==='/api/admin-readings'){
   const d=url.searchParams.get('device');if(user.role!=='admin'&&assignments.get(d)!==user.company_id)return send(403,{error:'연결되지 않은 장치'});if(failReadings)return send(502,{error:'sensor offline'});
   return send(200,{records:[{device_id:d,source:'simulation',timestamp:'2026-09-27T08:00:00Z',soil_temperature:79,soil_moisture:99},{device_id:d,source:'hardware',timestamp:'2026-09-27T07:00:00Z',soil_temperature:d==='pi5-monitor-01'?22.4:24.1,soil_moisture:38,soil_ec:null,soil_ph:null}]});
  }
  if(url.pathname==='/api/company-workspace'){
   const id=url.searchParams.get('company')||user.company_id;if(user.role!=='admin'&&id!==user.company_id)return send(403,{error:'다른 기업 접근 불가'});if(req.method==='PUT'){const document=B.workspace(body.document),revision=new Date().toISOString();documents.set(id,{document,revision});return send(200,{document,revision});}return send(200,documents.get(id)||{document:null});
  }
  return send(404,{error:'not found'});
 }
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep))throw Error('outside root');
 let data=await fs.readFile(target);if(url.pathname==='/admin.html')data=Buffer.from(data.toString().replace(/<script[^>]+src="https:[^>]+><\/script>/g,'').replace(/<link[^>]+href="https:[^>]+>/g,''));
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(data);
 }catch(e){res.writeHead(500);res.end(e.message);}});
class CDP{
  constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.errors=[];this.ws.addEventListener('message',ev=>{const v=JSON.parse(ev.data);if(v.id){const pair=this.pending.get(v.id);this.pending.delete(v.id);if(pair){if(v.error)pair.reject(Error(v.error.message));else pair.resolve(v.result);}}else if(v.method==='Runtime.exceptionThrown')this.errors.push(v.params.exceptionDetails);});this.ready=new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});}
  async send(method,params={}){await this.ready;const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let cdp;
async function wait(expression){for(let i=0;i<80;i++){if(await cdp.eval(expression))return;await delay(50);}throw Error('Timed out: '+expression);}
async function form(id,values){await cdp.eval(`(()=>{const f=document.getElementById(${JSON.stringify(id)});for(const [k,v] of Object.entries(${JSON.stringify(values)})){f.elements[k].value=v;f.elements[k].dispatchEvent(new Event('change',{bubbles:true}));f.elements[k].dispatchEvent(new Event('input',{bubbles:true}));}f.requestSubmit();})()`);await delay(30);}
async function select(id,value){await cdp.eval(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('change',{bubbles:true}));`);}
async function click(id){await cdp.eval(`document.getElementById(${JSON.stringify(id)}).click()`);await delay(30);}
async function shot(name,width,height){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await cdp.eval("document.querySelector('.page.active').scrollIntoView({behavior:'instant',block:'start'})");await delay(100);const r=await cdp.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));assert.equal(await cdp.eval('document.documentElement.scrollWidth<=innerWidth+1'),true,'page must fit viewport: '+name);assert.equal(await cdp.eval("[...document.querySelectorAll('.page.active .report-shell > *')].every(el=>el.getBoundingClientRect().right<=innerWidth+1)"),true,'report panels must fit viewport: '+name);}
async function login(username,password,admin=false,extra){
 await click(admin?'admin-login':'account-login');if(extra)await click('signup-toggle');await form('account-form',{username,password,...extra});
}
async function run(){
 await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const target=await(await fetch('http://127.0.0.1:9239/json/new?about:blank',{method:'PUT'})).json();cdp=new CDP(target.webSocketDebuggerUrl);await cdp.ready;await cdp.send('Page.enable');await cdp.send('Runtime.enable');
 const origin=`http://127.0.0.1:${port}`;async function page(path){await cdp.send('Page.navigate',{url:origin+path});await wait("document.readyState==='complete' && typeof WithUAuth!=='undefined'");}
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await page('/index.html');await wait("document.getElementById('session-label').textContent==='예시 화면'");
 assert.equal(await cdp.eval("document.querySelector('.workspace-bar').getBoundingClientRect().height"),0);await cdp.eval("navigate('data')");assert.equal(await cdp.eval("document.getElementById('company-content').hidden"),true);
 await login('qa-firm-one','company-pass-1',false,{name:'QA 제조회사',boundary:'제1공장'});await wait("company()?.name==='QA 제조회사'");const first=await cdp.eval('company().id');assert.equal(await cdp.eval('store.devices.length'),0);assert.match(await cdp.eval("document.getElementById('data-mode').textContent"),/예시/);
 await form('emission-form',{date:'2026-09-20',scope:'1',source:'전력',method:'direct',amount:'1.5',evidence:'고지서01'});await click('save-server');await wait("document.getElementById('storage-status').textContent.includes('서버 저장 완료')");assert.equal(documents.get(first).document.emissions[0].amount,1.5);
 await click('account-logout');await wait('WithUAuth.user===null');await login('admin','1234',true);await wait("location.pathname==='/admin.html' && document.getElementById('admin-main')?.hidden===false && document.getElementById('assignment-company')?.options.length===2");
 await select('assignment-company',first);await select('assignment-device','pi5-monitor-01');await click('assign-device');await wait("document.getElementById('assignment-list').textContent.includes('QA 제조회사')");assert.equal(assignments.get('pi5-monitor-01'),first);
 await select('assignment-device','pi5-monitor-02');await click('assign-device');await wait("document.getElementById('assignment-list').textContent.split('QA 제조회사').length===3");
 await click('sample');await cdp.eval("document.getElementById('field-survey').checked=true");await click('publish-survey');await wait("document.getElementById('message').textContent.includes('기업 서버에 등록')");assert.equal(documents.get(first).document.surveys.length,1);
 await click('admin-logout');await wait("location.pathname==='/index.html' && typeof store!=='undefined' && WithUAuth.user===null");await login('qa-firm-one','company-pass-1');await wait('actual() && reading?.soil_temperature===22.4');
 assert.equal(await cdp.eval('company().emissions[0].amount'),1.5);assert.equal(await cdp.eval('company().surveys.length'),1);assert.equal(await cdp.eval('store.devices.length'),2);
 assert.equal(await cdp.eval("document.querySelector('.workspace-bar').getBoundingClientRect().height"),0,'toolbar hidden on dashboard');await select('soil-device','pi5-monitor-02');await wait('reading?.soil_temperature===24.1');assert.equal(await cdp.eval('store.selectedDevice'),'pi5-monitor-02');
 await select('soil-device','pi5-monitor-01');await wait('reading?.soil_temperature===22.4');await shot('company-dashboard-desktop',1440,1000);
 await cdp.eval("navigate('data')");assert.ok(await cdp.eval("document.querySelector('.workspace-bar').getBoundingClientRect().height>0"));await shot('company-input-mobile',390,844);
 await cdp.eval("navigate('reports')");assert.equal(await cdp.eval("document.querySelector('.workspace-bar').getBoundingClientRect().height"),0);await click('save-report');assert.equal(await cdp.eval('company().reports.length'),1);await shot('company-report-mobile',390,844);await click('save-server');await wait("document.getElementById('storage-status').textContent.includes('서버 저장 완료')");assert.equal(documents.get(first).document.reports.length,1);
 failReadings=true;await cdp.eval('refreshSensor()');assert.equal(await cdp.eval('actual()'),true);assert.match(await cdp.eval("document.getElementById('sensor-status').textContent"),/조회 실패/);failReadings=false;
 await page('/admin.html');await wait("document.getElementById('admin-access-message').textContent.includes('관리자 계정')");assert.equal(await cdp.eval("document.getElementById('admin-main').hidden"),true,'company cannot enter administrator UI');
 await page('/index.html');await wait('actual()');await click('account-logout');await wait('WithUAuth.user===null');await login('qa-firm-two','company-pass-2',false,{name:'QA 두번째 기업',boundary:'본사'});await wait("company()?.name==='QA 두번째 기업'");assert.equal(await cdp.eval('company().emissions.length'),0);assert.equal(await cdp.eval('company().reports.length'),0);assert.equal(await cdp.eval('store.devices.length'),0);assert.equal(await cdp.eval('document.body.textContent.includes("QA 제조회사")'),false,'other company identity absent');
 assert.equal(cdp.errors.length,0,JSON.stringify(cdp.errors));console.log('PASS: company signup/login, account isolation, administrator login and page gate, device assignment, admin field survey publishing, real sensors and device switching, toolbar scope, company save, report snapshot, errors and responsive layout');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{if(cdp)await cdp.send('Browser.close');}catch{}server.close();});
