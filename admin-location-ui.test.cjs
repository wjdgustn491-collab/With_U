const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/admin.js','utf8');
const block=source.slice(source.indexOf('async function locationRequest('),source.indexOf('function browserLocation('));
const controls={device:{value:'pi5-monitor-01',replaceChildren(...options){this.options=options;this.value=options[0]?.value||'';}},'admin-token':{value:'test-token'},lat:{value:'37'},lon:{value:'127'},'location-source':{},'green-value':{},'green-detail':{}};
let loaded=null,reply;
const context=vm.createContext({$:id=>controls[id],document:{createElement:()=>({})},fetch:async()=>({ok:true,json:async()=>reply}),setPosition:(lat,lon,source)=>{loaded={lat,lon,source};},note(){},render(){},vertices:[],locationSource:'',greenLayer:null,map:null,lastGreenPosition:null,position:()=>[37,127],Date,Error,JSON,encodeURIComponent});
vm.runInContext(block,context);
async function run(){
  reply={devices:[{id:'pi5-monitor-01'},{id:'pi5-monitor-02'}],location:null};
  await context.loadDevices();
  assert.equal(controls.device.options.length,2);
  assert.equal(controls.lat.value,'37','an unregistered device must preserve manually entered coordinates');
  reply={location:{latitude:36.5,longitude:127.5,source:'admin',updated_at:'2026-09-27T00:00:00Z'}};
  controls.device.value='pi5-monitor-02';
  await context.refreshLocation();
  assert.equal(loaded.lat,36.5,'the selected device uses its own saved location');
  let release;
  context.fetch=()=>new Promise(resolve=>{release=resolve;});
  loaded=null;
  const pending=context.refreshLocation();
  controls.device.value='pi5-monitor-01';
  release({ok:true,json:async()=>reply});
  await pending;
  assert.equal(loaded,null,'a late response for another device must not replace coordinates');
  console.log('PASS: device list, saved location loading, manual input preservation and stale response handling');
}
run().catch(error=>{console.error(error);process.exitCode=1;});

