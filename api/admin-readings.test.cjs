const assert=require('node:assert/strict');
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
async function run(){
 const path=require.resolve('./admin-readings.js');
 let handler=require(path);
 let res=response();
 await handler({method:'GET',headers:{},query:{device:'pi5-monitor-01'}},res);
 assert.equal(res.statusCode,503);
 process.env.SUPABASE_URL='https://example.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-service-key';
 process.env.WITHU_ADMIN_TOKEN='test-only-admin-token';
 delete require.cache[path];handler=require(path);
 res=response();await handler({method:'GET',headers:{authorization:'Bearer wrong'},query:{device:'pi5-monitor-01'}},res);assert.equal(res.statusCode,401);
 res=response();await handler({method:'GET',headers:{authorization:'Bearer test-only-admin-token'},query:{device:'other-device'}},res);assert.equal(res.statusCode,400);
 const before=global.fetch;
 global.fetch=async(url,options)=>{assert.equal(url.searchParams.get('device_id'),'eq.pi5-monitor-01');assert.equal(options.headers.apikey,'test-only-service-key');return {ok:true,json:async()=>[{device_id:'pi5-monitor-01',timestamp:'2026-09-22T00:00:00Z',source:'hardware',soil_temperature:21,soil_moisture:45}]};};
 try{res=response();await handler({method:'GET',headers:{authorization:'Bearer test-only-admin-token'},query:{device:'pi5-monitor-01'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.records[0].soil_ec,null);assert.equal(res.body.records[0].soil_temperature,21);assert.equal(res.headers['Cache-Control'],'no-store');}finally{global.fetch=before;}
 console.log('PASS: admin API pending, authentication, device allowlist and server query');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
