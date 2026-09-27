// Local-only browser regression test. Uses the installed Edge CDP endpoint.
// Run Edge headless with an isolated profile and debugging port 9239 first.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=require('node:fs').existsSync(path.resolve(__dirname,'../website/index.html'))?path.resolve(__dirname,'../website'):path.resolve(__dirname,'..');
const B=require(path.join(root,'business-engine.js'));
const artifacts=path.resolve(__dirname,'qa');
let deviceIds=['pi5-monitor-01','pi5-monitor-02'],failReadings=false,documents=new Map();
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      res.setHeader('Content-Type','application/json');const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
      if(req.headers.authorization!=='Bearer qa-only-token')return send(401,{error:'토큰 오류'});
      if(url.pathname==='/api/admin-location')return send(200,{devices:deviceIds.map(id=>({id,location:null}))});
      if(url.pathname==='/api/admin-readings'){
        if(failReadings)return send(502,{error:'QA sensor offline'});
        const d=url.searchParams.get('device');return send(200,{records:d==='pi5-monitor-01'?[{device_id:d,source:'simulation',timestamp:'2026-09-27T08:00:00Z',soil_temperature:79,soil_moisture:99},{device_id:d,source:'hardware',timestamp:'2026-09-27T07:00:00Z',soil_temperature:22.4,soil_moisture:38,soil_ec:null,soil_ph:null}]:[]});
      }
      if(url.pathname==='/api/company-workspace'){
        if(url.searchParams.get('list')==='1')return send(200,{companies:[...documents.values()].map(v=>({id:v.document.id,name:v.document.name,revision:v.revision}))});
        const id=url.searchParams.get('company');if(req.method==='PUT'){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),document=B.workspace(body.document),revision=new Date().toISOString();documents.set(id,{document,revision});return send(200,{document,revision});}
        return send(200,documents.get(id)||{document:null,revision:null});
      }
      return send(404,{error:'not found'});
    }
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!target.startsWith(root+path.sep))throw Error('outside root');
    const data=await fs.readFile(target),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(data);
  }catch(e){res.writeHead(404);res.end('not found');}
});
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
async function run(){
  await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,target=await (await fetch('http://127.0.0.1:9239/json/new?about:blank',{method:'PUT'})).json();cdp=new CDP(target.webSocketDebuggerUrl);await cdp.ready;await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const location=`http://127.0.0.1:${port}/index.html`;await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp.send('Page.navigate',{url:location});
  await wait(`document.readyState==='complete' && typeof store!=='undefined'`);assert.match(await cdp.eval(`document.getElementById('data-mode').textContent`),/예시/);assert.equal(await cdp.eval('store.devices.length'),0);
  await cdp.eval("navigate('data')");await form('company-form',{name:'QA 제조기업',boundary:'제1공장'});assert.equal(await cdp.eval('store.companies.length'),1);
  await form('emission-form',{date:'2026-09-10',scope:'1',source:'연료',method:'direct',amount:'1.5',evidence:'고지서 A <img src=x onerror=window.qaInjected=true>'});
  await form('emission-form',{date:'2026-09-20',scope:'2',source:'전력',method:'activity',quantity:'1000',unit:'kWh',factor:'.4',factorSource:'QA 자료 2026',evidence:'고지서 B'});assert.equal(await cdp.eval('company().emissions.length'),2);
  await cdp.eval("document.getElementById('workspace-token').value='qa-only-token';document.getElementById('workspace-token').dispatchEvent(new Event('input'));");await click('connect-server');await wait('store.devices.length===2');
  await select('period-start','2026-09-01');await select('period-end','2026-09-30');await select('workspace-device','pi5-monitor-01');await wait('reading!==null');
  assert.equal(await cdp.eval('summary().emission'),1.9);assert.equal(await cdp.eval('reading.soil_temperature'),22.4);assert.equal(await cdp.eval('summary().tree'),null);assert.equal(await cdp.eval('summary().scopes[3]'),null);
  assert.equal(await cdp.eval(`localStorage.getItem(STORE).includes('qa-only-token')`),false);
  await form('credit-form',{date:'2026-09-10',action:'purchase',registry:'QA Registry',serial:'LOT-01',quantity:'10',evidence:'구매증빙'});
  await form('credit-form',{date:'2026-09-20',action:'retire',registry:'QA Registry',serial:'LOT-01',quantity:'2',evidence:'소각증빙'});
  await form('credit-form',{date:'2026-09-22',action:'transfer',registry:'QA Registry',serial:'LOT-01',quantity:'1',evidence:'이전증빙'});assert.equal(await cdp.eval('summary().holding'),7);
  await form('credit-form',{date:'2026-09-23',action:'retire',registry:'QA Registry',serial:'LOT-01',quantity:'20',evidence:'초과 기록'});assert.equal(await cdp.eval('company().credits.length'),3);assert.match(await cdp.eval("document.getElementById('workspace-message').textContent"),/부족/);
  await cdp.eval(`localStorage.setItem('withu-admin-v2',JSON.stringify({version:2,source:'field',device:'pi5-monitor-01',dates:['2025-09-01','2026-09-01'],groups:[{species:'소나무',n0:20,n1:20,d0:20,d1:20.8,h0:8,h1:8.3,density:500,f:.45,bef:1.3,r:.25,cf:.5}]}))`);await click('import-survey');assert.ok(await cdp.eval('summary().tree.annual')>0);
  await cdp.eval(`(()=>{const r=JSON.parse(localStorage.getItem('withu-admin-v2'));r.source='draft';localStorage.setItem('withu-admin-v2',JSON.stringify(r));})()`);await click('import-survey');assert.match(await cdp.eval("document.getElementById('workspace-message').textContent"),/실제 현장/);
  await cdp.eval("navigate('dashboard')");await shot('company-dashboard-desktop',1440,1100);
  await cdp.eval("navigate('data')");await shot('company-input-mobile',390,844);
  await cdp.eval("navigate('reports')");await click('save-report');assert.equal(await cdp.eval('company().reports.length'),1);assert.equal(await cdp.eval('typeof window.qaInjected'),'undefined');
  await cdp.eval('editEmission(company().emissions[0])');await form('emission-form',{amount:'3'});assert.equal(await cdp.eval('summary().emission'),3.4);
  await cdp.eval("viewedReport=company().reports[0];renderReport()");assert.equal(await cdp.eval('reportContext().summary.emission'),1.9);
  await shot('company-report-mobile',390,844);
  await cdp.eval('window.qaDownloads=[];downloadBlob=(content,name,type)=>window.qaDownloads.push({content,name,type})');await cdp.eval("downloadReport('csv');downloadReport('doc')");assert.equal(await cdp.eval('window.qaDownloads.length'),2);assert.ok((await cdp.eval('window.qaDownloads[0].content')).includes('1.9'));assert.ok((await cdp.eval('window.qaDownloads[1].content')).includes('&lt;img'));
  await click('live-report');assert.equal(await cdp.eval('reportContext().summary.emission'),3.4);
  await click('save-server');await wait("document.getElementById('storage-status').textContent.includes('서버 저장 완료')");assert.equal(documents.size,1);assert.equal([...documents.values()][0].document.reports.length,1);
  await select('workspace-device','pi5-monitor-02');await delay(80);assert.equal(await cdp.eval('summary().tree'),null);assert.equal(await cdp.eval('reading'),null);assert.equal(await cdp.eval('summary().emission'),3.4);
  failReadings=true;await select('workspace-device','pi5-monitor-01');await wait("sensorStatus.includes('조회 실패')");assert.equal(await cdp.eval('actual()'),true);assert.equal(await cdp.eval('summary().emission'),3.4);assert.equal(await cdp.eval('reading'),null);failReadings=false;
  await select('period-start','2026-01-01');await select('period-end','2026-03-31');assert.equal(await cdp.eval('summary().emission'),null);assert.equal(await cdp.eval("document.querySelector('[data-value=emission]').textContent"),'미입력');
  await select('workspace-device','');assert.equal(await cdp.eval('summary().emission'),.7);assert.equal(await cdp.eval('company().emissions.length'),2);
  await cdp.eval("viewedReport=company().reports[0];renderReport();downloadReport('csv')");assert.match(await cdp.eval('window.qaDownloads.at(-1).name'),/_data\.csv$/);
  await click('new-company');await form('company-form',{name:'두 번째 기업',boundary:'본사'});const secondId=await cdp.eval('company().id');await select('workspace-device','pi5-monitor-02');assert.equal(await cdp.eval('summary().emission'),null);
  await cdp.send('Page.navigate',{url:location});await wait(`document.readyState==='complete' && typeof store!=='undefined' && store.companies.length===2`);assert.equal(await cdp.eval('company().id'),secondId);assert.equal(await cdp.eval('actual()'),true);assert.equal(await cdp.eval("document.getElementById('workspace-token').value"),'');assert.equal(await cdp.eval('reading'),null);
  await cdp.eval("document.getElementById('workspace-token').value='qa-only-token'");deviceIds=[];await click('connect-server');await wait('store.devices.length===0');assert.equal(await cdp.eval('actual()'),false);assert.equal(await cdp.eval('store.companies[0].emissions.length'),2);
  await cdp.eval("navigate('data')");await shot('company-input-desktop',1440,1100);
  assert.equal(cdp.errors.length,0,JSON.stringify(cdp.errors));console.log('PASS: real browser company CRUD, calculations, device/demo modes, sensor filtering/errors, report snapshots, exports, server save, reload, company separation, XSS and mobile layout');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.ws.close();}server.close();});
