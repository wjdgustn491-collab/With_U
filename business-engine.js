(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./carbon-engine.js'):root.CarbonEngine;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function text(v,label,max=200,optional=false){
    if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))throw Error(label+'을 확인하세요.');
    return v.trim();
  }
  function id(v){if(typeof v!=='string'||!UUID.test(v))throw Error('자료 식별자가 올바르지 않습니다.');return v;}
  function num(v,min,max,label){if(!['string','number'].includes(typeof v))throw Error(label+' 값을 확인하세요.');return E.number(v,min,max,label);}
  function date(v){
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('날짜를 확인하세요.');
    const d=new Date(v+'T00:00:00Z');
    if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)throw Error('날짜를 확인하세요.');
    return v;
  }
  function device(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v))throw Error('장치 식별자를 확인하세요.');return v;}
  function list(v,max,label){if(!Array.isArray(v)||v.length>max)throw Error(label+' 개수 제한을 확인하세요.');return v;}
  function emission(r){
    if(!r||!['1','2','3'].includes(String(r.scope)))throw Error('Scope를 선택하세요.');
    const out={id:id(r.id),date:date(r.date),scope:String(r.scope),source:text(r.source,'배출원'),method:r.method,evidence:text(r.evidence,'근거자료',500)};
    if(r.method==='direct')out.amount=num(r.amount,0,1e9,'배출량');
    else if(r.method==='activity'){
      out.quantity=num(r.quantity,0,1e12,'활동량');out.unit=text(r.unit,'활동량 단위',40);
      out.factor=num(r.factor,0,1e6,'배출계수');out.factorSource=text(r.factorSource,'계수 출처·연도',500);
      out.amount=out.quantity*out.factor/1000;
      if(out.amount>1e9)throw Error('산정 배출량이 허용 범위를 초과합니다.');
    }else throw Error('배출량 입력 방식을 선택하세요.');
    return out;
  }
  function credit(r){
    if(!r||!['purchase','retire','transfer'].includes(r.action))throw Error('크레딧 구분을 선택하세요.');
    return {id:id(r.id),date:date(r.date),action:r.action,registry:text(r.registry,'등록부',120),serial:text(r.serial,'일련번호',160),quantity:num(r.quantity,.000001,1e9,'크레딧 수량'),evidence:text(r.evidence,'크레딧 근거',500)};
  }
  function ledger(rows){
    const lots=new Map();
    // Receipts precede retirements/transfers on the same date; no negative historical balances.
    const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||(a.action==='purchase'?-1:b.action==='purchase'?1:0));
    for(const r of sorted){
      const key=JSON.stringify([r.registry,r.serial]);const lot=lots.get(key)||{received:0,balance:0};
      if(r.action==='purchase'){
        if(lot.received)throw Error('같은 등록부·일련번호의 입고를 중복 등록할 수 없습니다.');
        lot.received=r.quantity;lot.balance=r.quantity;
      }else{
        if(!lot.received||lot.balance+1e-9<r.quantity)throw Error('해당 날짜의 크레딧 보유 수량이 부족합니다. 입고 기록을 확인하세요.');
        lot.balance=Math.max(0,lot.balance-r.quantity);
      }
      lots.set(key,lot);
    }
    return lots;
  }
  function survey(r){
    if(!r||r.source!=='field')throw Error('실제 현장 조사로 저장한 수목 자료만 가져올 수 있습니다.');
    const dates=list(r.dates,2,'조사 날짜');if(dates.length!==2)throw Error('두 조사 날짜가 필요합니다.');
    E.years(dates[0],dates[1]);
    const groups=list(r.groups,50,'수종 그룹').map(g=>{
      const out={species:text(g.species,'수종명',80)};
      for(const k of ['n0','n1','d0','d1','h0','h1','density','f','bef','r','cf']){if(!['string','number'].includes(typeof g[k])||String(g[k]).length>80)throw Error('수목 입력값을 확인하세요.');out[k]=g[k];}
      E.tree(out,0);E.tree(out,1);return out;
    });
    if(!groups.length)throw Error('수목 조사 자료가 없습니다.');
    return {device:device(r.device),source:'field',dates:dates.map(date),groups};
  }
  function base(w){
    if(!w||w.version!==1)throw Error('기업 자료 형식이 올바르지 않습니다.');
    const out={version:1,id:id(w.id),name:text(w.name,'기업명',120),boundary:text(w.boundary,'사업장·보고 경계',500),emissions:list(w.emissions,200,'배출 기록').map(emission),credits:list(w.credits,200,'크레딧 기록').map(credit),surveys:list(w.surveys,50,'수목 조사').map(survey)};
    const ids=[...out.emissions,...out.credits].map(r=>r.id);if(new Set(ids).size!==ids.length)throw Error('중복 자료 식별자가 있습니다.');
    const keys=out.surveys.map(r=>JSON.stringify([r.device,...r.dates]));if(new Set(keys).size!==keys.length)throw Error('같은 장치·조사 기간의 수목 자료가 중복되었습니다.');
    ledger(out.credits);return out;
  }
  function report(r){
    if(!r||typeof r.createdAt!=='string'||r.createdAt.length>40||!Number.isFinite(Date.parse(r.createdAt)))throw Error('보고서 생성 시각을 확인하세요.');
    const start=date(r.start),end=date(r.end);if(start>end)throw Error('보고 시작일과 종료일을 확인하세요.');
    const out={id:id(r.id),createdAt:r.createdAt,start,end,device:device(r.device),data:base(r.data)};
    if(out.data.surveys.some(s=>s.device!==out.device))throw Error('다른 장치의 조사 자료가 보고서에 포함되어 있습니다.');
    if(r.sensor){const value=E.sensor(r.sensor);if(value.device_id!==out.device||value.source!=='hardware')throw Error('보고서의 실제 센서 출처가 올바르지 않습니다.');out.sensor=value;}
    return out;
  }
  function workspace(w){const out=base(w);out.reports=list(w.reports,10,'저장 보고서').map(report);if(out.reports.some(r=>r.data.id!==out.id))throw Error('다른 기업의 저장 보고서입니다.');if(new Set(out.reports.map(r=>r.id)).size!==out.reports.length)throw Error('중복 보고서 식별자가 있습니다.');return out;}
  function summarize(w,start,end,selected){
    date(start);date(end);if(start>end)throw Error('보고 시작일과 종료일을 확인하세요.');device(selected);
    const rows=w.emissions.filter(r=>r.date>=start&&r.date<=end),scopes={};
    for(const s of ['1','2','3']){const values=rows.filter(r=>r.scope===s);scopes[s]=values.length?values.reduce((a,r)=>a+r.amount,0):null;}
    const credits=w.credits.filter(r=>r.date<=end);const lots=ledger(credits);
    const sum=action=>credits.filter(r=>r.action===action&&r.date>=start).reduce((a,r)=>a+r.quantity,0);
    const candidates=w.surveys.filter(r=>r.device===selected&&r.dates[1]<=end).sort((a,b)=>b.dates[1].localeCompare(a.dates[1])||b.dates[0].localeCompare(a.dates[0]));
    let tree=null;
    if(candidates.length){const r=candidates[0],baseline=r.groups.reduce((a,g)=>a+E.tree(g,0),0),stock=r.groups.reduce((a,g)=>a+E.tree(g,1),0);tree={stock,annual:(stock-baseline)/E.years(...r.dates),dates:r.dates};}
    return {emission:rows.length?rows.reduce((a,r)=>a+r.amount,0):null,scopes,count:rows.length,rows,holding:credits.length?[...lots.values()].reduce((a,l)=>a+l.balance,0):null,retired:credits.length?sum('retire'):null,transferred:credits.length?sum('transfer'):null,tree};
  }
  function makeReport(w,start,end,selected,uuid,createdAt,sensor){
    summarize(w,start,end,selected);
    return report({id:uuid,createdAt,start,end,device:selected,data:{...base(w),emissions:w.emissions.filter(r=>r.date>=start&&r.date<=end),credits:w.credits.filter(r=>r.date<=end),surveys:w.surveys.filter(r=>r.device===selected&&r.dates[1]<=end)},sensor});
  }
  function csv(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=v==null?'미입력':String(v);if(typeof v!=='number'&&/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
  const api={id,date,device,emission,credit,ledger,survey,workspace,summarize,makeReport,report,csv};
  if(typeof module!=='undefined')module.exports=api;else root.BusinessEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
