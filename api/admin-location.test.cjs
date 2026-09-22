const assert=require('node:assert/strict');
const handler=require('./admin-location.js');
function response(){return {code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
async function run(){
  const old={...process.env};
  try{
    delete process.env.SUPABASE_URL;
    assert.equal((await handler({method:'GET',query:{device:'pi5-monitor-01'},headers:{}},response())).code,503);
    Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',WITHU_ADMIN_TOKEN:'test-admin'});
    assert.equal((await handler({method:'GET',query:{device:'pi5-monitor-01'},headers:{authorization:'Bearer wrong'}},response())).code,401);
    assert.equal((await handler({method:'PUT',query:{device:'pi5-monitor-01'},headers:{authorization:'Bearer test-admin'},body:{latitude:91,longitude:127}},response())).code,400);
    const prior=global.fetch;
    global.fetch=async(url,options)=>{assert.match(String(url),/device_locations/);assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).source,'admin');return {ok:true,json:async()=>[{device_id:'pi5-monitor-01',latitude:37,longitude:127,source:'admin'}]};};
    try{const result=await handler({method:'PUT',query:{device:'pi5-monitor-01'},headers:{authorization:'Bearer test-admin'},body:{latitude:37,longitude:127}},response());assert.equal(result.code,200);assert.equal(result.body.location.latitude,37);}
    finally{global.fetch=prior;}
  }finally{process.env=old;}
  console.log('PASS: location API setup, auth, coordinate validation and server upsert');
}
run().catch(error=>{console.error(error);process.exitCode=1;});

