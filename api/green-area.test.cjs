const assert=require('node:assert/strict');
const handler=require('./green-area.js');
function response(){return {code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
(async()=>{
  assert.equal((await handler({method:'POST',query:{}},response())).code,405);
  assert.equal((await handler({method:'GET',query:{lat:'91',lon:'127'}},response())).code,400);
  const prior=global.fetch;global.fetch=async(url,options)=>{assert.equal(String(url),'https://overpass-api.de/api/interpreter');assert.match(String(options.body),/around%3A500%2C37\.0000000%2C127\.0000000/);return {ok:true,json:async()=>({elements:[]})};};
  try{const result=await handler({method:'GET',query:{lat:'37',lon:'127'}},response());assert.equal(result.code,200);assert.deepEqual(result.body,{elements:[]});}
  finally{global.fetch=prior;}
  console.log('PASS: green-area API method, coordinates and Overpass proxy');
})().catch(error=>{console.error(error);process.exitCode=1;});

