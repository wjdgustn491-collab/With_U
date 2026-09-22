const assert=require('node:assert/strict');
const handler=require('./green-area.js');
function response(){return {code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
(async()=>{
  assert.equal((await handler({method:'POST',query:{}},response())).code,405);
  assert.equal((await handler({method:'GET',query:{lat:'91',lon:'127'}},response())).code,400);
  const prior=global.fetch;global.fetch=async(url)=>{assert.match(String(url),/^https:\/\/api\.openstreetmap\.org\/api\/0\.6\/map\?bbox=/);return {ok:true,text:async()=>`<?xml version="1.0"?><osm><node id="1" lat="37" lon="127"/><node id="2" lat="37" lon="127.001"/><node id="3" lat="37.001" lon="127.001"/><node id="4" lat="37.001" lon="127"/><way id="8"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="leisure" v="park"/></way></osm>`};};
  try{const result=await handler({method:'GET',query:{lat:'37',lon:'127'}},response());assert.equal(result.code,200);assert.equal(result.body.elements[0].tags.leisure,'park');assert.equal(result.body.elements[0].geometry.length,5);}
  finally{global.fetch=prior;}
  console.log('PASS: green-area API method, coordinates and OSM map filtering');
})().catch(error=>{console.error(error);process.exitCode=1;});

