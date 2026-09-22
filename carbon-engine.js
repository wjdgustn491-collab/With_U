(function(root){
  'use strict';
  const ratio=44/12;
  function number(v,min,max,label){
    if(v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(label+' 값을 확인하세요.');
    return Number(v);
  }
  function tree(g,t){
    const n=number(g['n'+t],0,10000000,'수목 수량');
    if(!Number.isInteger(n))throw Error('수목 수량은 정수여야 합니다.');
    if(n===0)return 0;
    const d=number(g['d'+t],0.01,1000,'DBH'),h=number(g['h'+t],0.01,150,'수고');
    const density=number(g.density,1,2000,'목재 기본밀도'),f=number(g.f,0.01,1,'형수'),bef=number(g.bef,1,5,'BEF'),r=number(g.r,0,3,'뿌리 비율'),cf=number(g.cf,0.01,1,'탄소분율');
    return Math.PI*(d/200)**2*h*f*density*bef*(1+r)*cf*ratio*n/1000;
  }
  function soil(s,t,area){
    const soc=number(s['soc'+t],0,1000,'SOC'),bd=number(s['bd'+t],0.01,3,'용적밀도'),depth=number(s.depth,0.1,200,'토층 두께'),gravel=number(s['gravel'+t],0,100,'조립질 질량비');
    return soc*bd*depth*(1-gravel/100)*0.1*(number(area,0,1e8,'녹지 면적')/10000)*ratio;
  }
  function years(a,b){
    const parse=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw Error('조사 날짜를 입력하세요.');const d=new Date(x+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==x)throw Error('올바른 날짜를 입력하세요.');return +d;};
    const days=(parse(b)-parse(a))/86400000;if(days<=0)throw Error('현재 조사일은 기준 조사일보다 늦어야 합니다.');return days/365.2425;
  }
  function polygon(text){
    let points=text.trim().split(/\n+/).map(line=>{const p=line.trim().split(/[,\s]+/);if(p.length!==2)throw Error('각 줄에 위도, 경도를 입력하세요.');return [number(p[0],-85,85,'경계 위도'),number(p[1],-180,180,'경계 경도')];});
    if(points.length>3&&points[0].every((x,i)=>x===points.at(-1)[i]))points.pop();
    if(points.length<3||points.length>500)throw Error('경계점은 3~500개가 필요합니다.');
    if(new Set(points.map(p=>p.join(','))).size!==points.length)throw Error('중복 경계점을 제거하세요.');
    const lat=points.reduce((s,p)=>s+p[0],0)/points.length,lon=points[0][1],rad=Math.PI/180,R=6371008.8;
    const xy=points.map(p=>[(p[1]-lon)*rad*R*Math.cos(lat*rad),(p[0]-lat)*rad*R]);
    const xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]);
    if(Math.max(...xs)-Math.min(...xs)>10000||Math.max(...ys)-Math.min(...ys)>10000)throw Error('이 근사 계산은 가로·세로 10 km 이내 녹지에만 사용하세요.');
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const intersects=(a,b,c,d)=>{const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return p*q<=0&&r*s<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));};
    for(let i=0;i<xy.length;i++)for(let j=i+1;j<xy.length;j++){if(j===i+1||(i===0&&j===xy.length-1))continue;if(intersects(xy[i],xy[(i+1)%xy.length],xy[j],xy[(j+1)%xy.length]))throw Error('경계선이 교차합니다. 경계 순서대로 입력하세요.');}
    const area=Math.abs(xy.reduce((s,p,i)=>{const q=xy[(i+1)%xy.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
    if(area<0.01)throw Error('면적을 만들 수 없는 경계입니다.');
    return {area,points,xy};
  }
  function sensor(record){
    if(!record||typeof record!=='object'||Array.isArray(record))throw Error('센서 기록 객체가 필요합니다.');
    if(typeof record.device_id!=='string'||!record.device_id.trim())throw Error('device_id가 필요합니다.');
    if(typeof record.timestamp!=='string'||!Number.isFinite(Date.parse(record.timestamp)))throw Error('유효한 timestamp가 필요합니다.');
    if(!['hardware','simulation'].includes(record.source))throw Error('source는 hardware 또는 simulation이어야 합니다.');
    const out={device_id:record.device_id,timestamp:record.timestamp,source:record.source};
    for(const [k,min,max] of [['soil_temperature',-40,80],['soil_moisture',0,100],['soil_ec',0,200000],['soil_ph',0,14]])out[k]=record[k]==null?null:number(record[k],min,max,k);
    return out;
  }
  const api={number,tree,soil,years,polygon,sensor};if(typeof module!=='undefined')module.exports=api;else root.CarbonEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
