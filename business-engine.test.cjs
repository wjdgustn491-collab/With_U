const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const B=require('./business-engine.js');
const empty=()=>({version:1,id:randomUUID(),name:'시험 기업',boundary:'제1사업장',emissions:[],credits:[],surveys:[],reports:[]});
const emission=(values={})=>B.emission({id:randomUUID(),date:'2026-09-15',scope:'1',source:'연료',method:'direct',amount:0,evidence:'고지서 01',...values});
const credit=(action,quantity,date='2026-09-15',values={})=>B.credit({id:randomUUID(),date,action,registry:'시험 등록부',serial:'LOT-01',quantity,evidence:'증빙 01',...values});
const group={species:'소나무',n0:20,n1:20,d0:20,d1:20.8,h0:8,h1:8.3,density:500,f:.45,bef:1.3,r:.25,cf:.5};
test('activity calculation uses kg-to-tonne conversion and requires evidence/factor provenance',()=>{
  const r=emission({method:'activity',quantity:'1000',unit:'kWh',factor:'0.4',factorSource:'기관 자료 2026',amount:999});assert.equal(r.amount,.4);
  assert.throws(()=>emission({method:'activity',quantity:10,unit:'kWh',factor:.4,factorSource:''}));
  assert.throws(()=>emission({evidence:''}));assert.throws(()=>emission({amount:-1}));assert.throws(()=>emission({amount:true}));assert.throws(()=>emission({date:'2026-02-30'}));
});
test('missing, measured zero and date boundaries remain distinct',()=>{
  const w=empty();assert.equal(B.summarize(w,'2026-09-01','2026-09-30','pi5-monitor-01').emission,null);
  w.emissions=[emission({date:'2026-09-01',amount:0}),emission({date:'2026-09-30',scope:'2',amount:2}),emission({date:'2026-10-01',amount:100})];
  const s=B.summarize(w,'2026-09-01','2026-09-30','pi5-monitor-01');assert.equal(s.emission,2);assert.equal(s.scopes[1],0);assert.equal(s.scopes[3],null);assert.equal(s.count,2);
  assert.throws(()=>B.summarize(w,'2026-10-01','2026-09-01','pi5-monitor-01'));
});
test('credit ledger rejects duplicate receipts, historical overdrafts and orphaned retirements',()=>{
  const w=empty();w.credits=[credit('purchase',10,'2026-08-01'),credit('retire',2,'2026-09-10'),credit('transfer',1,'2026-09-20')];
  const s=B.summarize(w,'2026-09-01','2026-09-30','pi5-monitor-01');assert.equal(s.holding,7);assert.equal(s.retired,2);assert.equal(s.transferred,1);
  assert.throws(()=>B.ledger([...w.credits,credit('purchase',10)]));assert.throws(()=>B.ledger([...w.credits,credit('retire',20)]));
  assert.throws(()=>B.ledger([credit('retire',1,'2026-08-01'),credit('purchase',10,'2026-09-01')]));
  assert.throws(()=>B.ledger(w.credits.slice(1)));
  assert.equal(B.summarize(w,'2026-01-01','2026-07-31','pi5-monitor-01').holding,null);
});
test('only field surveys and the selected device contribute; area and soil do not change the formula',()=>{
  const w=empty();w.surveys=[B.survey({source:'field',device:'pi5-monitor-01',dates:['2025-09-01','2026-09-01'],groups:[group],area:999999,soil_ph:7})];
  const s=B.summarize(w,'2026-09-01','2026-09-30','pi5-monitor-01');assert.ok(s.tree.annual>0);
  assert.equal(B.summarize(w,'2026-09-01','2026-09-30','pi5-monitor-02').tree,null);
  assert.equal(B.summarize(w,'2026-01-01','2026-08-31','pi5-monitor-01').tree,null);
  assert.throws(()=>B.survey({...w.surveys[0],source:'draft'}));assert.equal(w.surveys[0].area,undefined);
});
test('report snapshots survive edits and reject simulation and cross-company contamination',()=>{
  const w=empty();w.emissions=[emission({amount:1})];
  const r=B.makeReport(w,'2026-09-01','2026-09-30','pi5-monitor-01',randomUUID(),'2026-09-30T12:00:00Z');
  w.emissions[0].amount=20;assert.equal(B.summarize(r.data,r.start,r.end,r.device).emission,1);
  assert.throws(()=>B.workspace({...w,reports:[{...r,data:{...r.data,id:randomUUID()}}]}));
  assert.throws(()=>B.report({...r,sensor:{device_id:r.device,timestamp:r.createdAt,source:'simulation'}}));
  assert.throws(()=>B.report({...r,sensor:{device_id:'pi5-monitor-02',timestamp:r.createdAt,source:'hardware'}}));
  assert.equal(B.workspace({...w,reports:[r]}).reports.length,1);
});
test('CSV escapes formulas, quotes and line breaks without losing numeric negatives',()=>{
  const csv=B.csv([['=HYPERLINK("x")','a,b\nline','@SUM(1)',-2,null]]);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"a,b\nline"'));assert.ok(csv.includes('"\'@SUM(1)"'));assert.ok(csv.includes('"-2"'));assert.ok(csv.includes('미입력'));
});
