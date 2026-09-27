const test=require('node:test'),assert=require('node:assert/strict'),A=require('../server/access');
const auth=require('./auth'),workspace=require('./company-workspace'),devices=require('./company-devices'),readings=require('./admin-readings'),location=require('./admin-location'),green=require('./green-area');
const cid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const base={version:1,id:cid,name:'Company A',boundary:'Factory A',emissions:[],credits:[],surveys:[],reports:[]};
const revision='2026-09-27T00:00:00+00:00';
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(body){this.body=body;return this;}};}
const req=(role='company',method='GET',query={},body)=>({method,query,body,headers:{host:'withu.test',origin:'https://withu.test',cookie:'withu_session='+(''+(role==='admin'?'b':'a')).repeat(64)}});
test('cookie sessions, company isolation, administrator controls, CSRF, role and password boundaries',async()=>{
 process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fake-service';const old=global.fetch;let links=[{device_id:'pi5-monitor-01',company_id:cid}],saved=structuredClone(base),calls=[],rpcStatus=200;
 global.fetch=async(url,options)=>{url=new URL(url);const path=url.pathname.split('/rest/v1/')[1];calls.push({path,options,query:url.searchParams});let data=[];
  if(path==='withu_sessions'){assert.equal(options.headers.apikey,'fake-service');if(options.method==='GET'){assert.match(url.searchParams.get('expires_at'),/^gt\./);const h=url.searchParams.get('token_hash');data=h==='eq.'+A.hash('a'.repeat(64))?[{account_id:'account-a'}]:h==='eq.'+A.hash('b'.repeat(64))?[{account_id:'account-admin'}]:[];}}
  else if(path==='withu_accounts'){data=url.searchParams.get('id')==='eq.account-admin'?[{id:'account-admin',username:'admin',role:'admin',company_id:null}]:[{id:'account-a',username:'firm-a',role:'company',company_id:cid}];}
  else if(path==='company_devices'){if(options.method==='DELETE')links=[];else if(options.method==='POST')links.push(JSON.parse(options.body));else data=links;}
  else if(path==='company_workspaces'){if(options.method==='PATCH'){saved=JSON.parse(options.body).document;data=[{document:saved,updated_at:'2026-09-27T01:00:00Z'}];}else data=[{id:cid,name:base.name,document:saved,updated_at:revision}];}
  else if(path==='environment_readings')data=[{device_id:'pi5-monitor-01',source:'hardware',timestamp:'2026-09-27T00:00:00Z',soil_temperature:21,soil_moisture:38}];
  else if(path==='device_locations')data=[{device_id:'pi5-monitor-01',latitude:37,longitude:127,source:'admin'}];
  else if(path==='rpc/withu_authenticate'){data={status:rpcStatus,user:{id:'account-a',role:'company',company_id:cid}};const body=JSON.parse(options.body);assert.equal(body.p_session_hash.length,64);assert.notEqual(body.p_session_hash,'a'.repeat(64));}
  else throw Error('Unexpected upstream '+path);
  return {ok:true,json:async()=>data};
 };
 try{
  let r=response();await workspace({method:'GET',headers:{authorization:'Bearer old-admin-token'},query:{}},r);assert.equal(r.code,401,'old bearer cannot authorize');
  r=response();await workspace(req('company','GET',{company:other}),r);assert.equal(r.code,403);assert.ok(!calls.some(c=>c.query.get('id')==='eq.'+other));
  r=response();await workspace(req('company','GET',{list:'1'}),r);assert.equal(r.code,403);
  r=response();await workspace(req(),r);assert.equal(r.code,200);assert.equal(r.body.document.id,cid);
  r=response();await workspace(req('company','PUT',{}, {document:{...base,surveys:[{device:'pi5-monitor-01',source:'field',dates:['2025-01-01','2026-01-01'],groups:[{species:'pine',n0:1,n1:1,d0:10,d1:11,h0:2,h1:3,density:500,f:0.5,bef:1.2,r:0.2,cf:0.5}]}]},baseRevision:revision}),r);assert.equal(r.code,403,'company cannot edit survey');
  r=response();await workspace(req('company','PUT',{}, {document:{...base,name:'Other'},baseRevision:revision}),r);assert.equal(r.code,400,'immutable profile');
  r=response();await workspace(req('company','PUT',{}, {document:base,baseRevision:'stale'}),r);assert.equal(r.code,409);
  r=response();await workspace(req('company','PUT',{}, {document:base,baseRevision:revision}),r);assert.equal(r.code,200);
  const B=require('../business-engine');const sensor={device_id:'pi5-monitor-01',source:'hardware',timestamp:'2026-09-27T00:00:00Z',soil_temperature:23,soil_moisture:38,soil_ec:null,soil_ph:null};const snapshot=B.makeReport(base,'2026-01-01','2026-09-27','pi5-monitor-01','33333333-3333-4333-8333-333333333333','2026-09-27T01:00:00Z',sensor);
  r=response();await workspace(req('company','PUT',{}, {document:{...base,reports:[snapshot]},baseRevision:revision}),r);assert.equal(r.code,400,'report cannot forge a real sensor value');
  r=response();await devices(req(),r);assert.deepEqual(r.body.devices,[{id:'pi5-monitor-01'}]);
  r=response();await devices(req('company','PUT',{}, {company:cid,device:'pi5-monitor-01'}),r);assert.equal(r.code,403);
  r=response();await location(req('company','PUT',{device:'pi5-monitor-01'},{latitude:37,longitude:127}),r);assert.equal(r.code,403);
  r=response();await green(req('company','GET',{lat:'37',lon:'127'}),r);assert.equal(r.code,403);
  r=response();await readings(req('company','GET',{device:'other-device'}),r);assert.equal(r.code,403);
  r=response();await readings(req('company','GET',{device:'pi5-monitor-01'}),r);assert.equal(r.code,200);assert.equal(r.body.records[0].soil_temperature,21);assert.equal(r.body.records[0].soil_ec,null);
  r=response();await location(req('admin','PUT',{device:'pi5-monitor-01'},{latitude:37,longitude:127}),r);assert.equal(r.code,200);
  r=response();await devices(req('admin','DELETE',{}, {company:cid,device:'pi5-monitor-01'}),r);assert.equal(r.code,200);
  r=response();await readings(req('company','GET',{device:'pi5-monitor-01'}),r);assert.equal(r.code,403,'revoked device inaccessible immediately');
  r=response();await devices(req('admin','PUT',{}, {company:cid,device:'pi5-monitor-01'}),r);assert.equal(r.code,200);
  const csrf=req('admin','PUT',{}, {company:cid,device:'pi5-monitor-01'});csrf.headers.origin='https://other.test';r=response();await devices(csrf,r);assert.equal(r.code,403);
  r=response();await auth(req('company','POST',{}, {action:'signup',username:'admin',password:'12345678',name:'New',boundary:'HQ'}),r);assert.equal(r.code,400);
  r=response();await auth(req('company','POST',{}, {action:'signup',username:'new-firm',password:'12345678',name:'New',boundary:'HQ',role:'admin'}),r);assert.equal(r.code,200);const lastRpc=calls.filter(c=>c.path==='rpc/withu_authenticate').at(-1);assert.equal(JSON.parse(lastRpc.options.body).p_action,'signup');assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);assert.ok(!('password' in r.body.user));
  rpcStatus=401;r=response();await auth(req('admin','POST',{}, {action:'admin-login',username:'admin',password:'wrong'}),r);assert.equal(r.code,401);assert.ok(!r.headers['Set-Cookie']);
  rpcStatus=429;r=response();await auth(req('admin','POST',{}, {action:'admin-login',username:'admin',password:'1234'}),r);assert.equal(r.code,429);
  r=response();await auth(req('company','POST',{}, {action:'logout'}),r);assert.equal(r.code,200);assert.match(r.headers['Set-Cookie'],/Max-Age=0/);assert.ok(calls.some(c=>c.path==='withu_sessions'&&c.options.method==='DELETE'));
  const invalid=req();invalid.headers.cookie='withu_session='+'c'.repeat(64);r=response();await workspace(invalid,r);assert.equal(r.code,401);
 }finally{global.fetch=old;}
});
