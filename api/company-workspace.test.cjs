const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const handler=require('./company-workspace.js');
const response=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('company API authentication, validation, database setup, persistence and revision conflicts',async()=>{
  const originalFetch=global.fetch,original={};for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','WITHU_ADMIN_TOKEN','WITHU_ALLOWED_DEVICE_IDS'])original[key]=process.env[key];
  const doc={version:1,id:randomUUID(),name:'API 시험',boundary:'본사',emissions:[],credits:[],surveys:[],reports:[]};
  const req=(method='GET',extra={})=>({method,headers:{authorization:'Bearer unit-test-token'},query:{company:doc.id},...extra});
  let calls=0;global.fetch=async()=>{calls++;throw Error('unexpected fetch');};
  try{
    delete process.env.SUPABASE_URL;assert.equal((await handler(req(),response())).code,503);
    Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'unit-test-service',WITHU_ADMIN_TOKEN:'unit-test-token',WITHU_ALLOWED_DEVICE_IDS:'pi5-monitor-01'});
    assert.equal((await handler(req('GET',{headers:{authorization:'Bearer bad'}}),response())).code,401);
    assert.equal((await handler(req('DELETE'),response())).code,405);
    assert.equal((await handler(req('GET',{query:{company:'bad'}}),response())).code,400);
    assert.equal((await handler(req('PUT',{body:{document:{...doc,id:randomUUID()}}}),response())).code,400);assert.equal(calls,0);
    global.fetch=async(url,options)=>{assert.match(String(url),/company_workspaces/);assert.equal(options.method,'POST');assert.equal(options.headers.apikey,'unit-test-service');assert.equal(JSON.parse(options.body).document.id,doc.id);assert.equal(options.headers.Prefer,'return=representation');return {ok:true,json:async()=>[{id:doc.id,document:doc,updated_at:'2026-09-27T00:00:00Z'}]};};
    let result=await handler(req('PUT',{body:{document:doc,baseRevision:null}}),response());assert.equal(result.code,200);assert.equal(result.body.document.name,'API 시험');assert.equal(result.headers['Cache-Control'],'no-store');assert.ok(!JSON.stringify(result.body).includes('unit-test-service'));
    global.fetch=async(url,options)=>{assert.equal(options.method,'PATCH');assert.equal(new URL(url).searchParams.get('updated_at'),'eq.2026-09-27T00:00:00Z');return {ok:true,json:async()=>[]};};
    result=await handler(req('PUT',{body:{document:doc,baseRevision:'2026-09-27T00:00:00Z'}}),response());assert.equal(result.code,409);
    global.fetch=async()=>({ok:false,json:async()=>({code:'23505'})});assert.equal((await handler(req('PUT',{body:{document:doc}}),response())).code,409);
    global.fetch=async()=>({ok:false,json:async()=>({code:'PGRST205'})});assert.equal((await handler(req(),response())).code,503);
    global.fetch=async()=>({ok:true,json:async()=>[]});result=await handler(req(),response());assert.equal(result.body.document,null);
    global.fetch=async()=>({ok:true,json:async()=>[{id:doc.id,name:doc.name,updated_at:'2026-09-27T00:00:00Z',document:{secret:'must not return'}}]});result=await handler(req('GET',{query:{list:'1'}}),response());assert.deepEqual(Object.keys(result.body.companies[0]).sort(),['id','name','revision']);
  }finally{global.fetch=originalFetch;for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
