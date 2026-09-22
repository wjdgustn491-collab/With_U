'use strict';
const crypto=require('node:crypto');
const allowed=new Set((process.env.WITHU_ALLOWED_DEVICE_IDS||'pi5-monitor-01').split(',').map(x=>x.trim()).filter(Boolean));
function sameToken(given,expected){const a=Buffer.from(given),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function validPosition(body){return body&&typeof body.latitude==='number'&&Number.isFinite(body.latitude)&&Math.abs(body.latitude)<=85&&typeof body.longitude==='number'&&Number.isFinite(body.longitude)&&Math.abs(body.longitude)<=180;}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'GET 또는 PUT 요청만 지원합니다.'});
  const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,adminToken=process.env.WITHU_ADMIN_TOKEN;
  if(!url||!serviceKey||!adminToken)return res.status(503).json({error:'장치 위치 조회 서버가 아직 연결되지 않았습니다.'});
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('invalid URL');}
  catch{return res.status(503).json({error:'서버 연결 설정이 올바르지 않습니다.'});}
  const token=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||'';
  if(!sameToken(token,adminToken))return res.status(401).json({error:'관리자 조회 토큰이 올바르지 않습니다.'});
  const device=req.query?.device;
  if(typeof device!=='string'||!allowed.has(device)||!/^[A-Za-z0-9_-]{1,64}$/.test(device))return res.status(400).json({error:'등록되지 않은 장치입니다.'});
  if(req.method==='PUT'&&!validPosition(req.body))return res.status(400).json({error:'위도·경도를 숫자로 입력하세요.'});
  try{
    const endpoint=new URL('/rest/v1/device_locations',url);
    endpoint.searchParams.set('device_id','eq.'+device);
    if(req.method==='GET'){
      endpoint.searchParams.set('select','device_id,latitude,longitude,source,accuracy_m,updated_at');
      endpoint.searchParams.set('limit','1');
    }else endpoint.searchParams.set('on_conflict','device_id');
    const upstream=await fetch(endpoint,{method:req.method==='GET'?'GET':'POST',
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,...(req.method==='PUT'?{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'}:{})},
      body:req.method==='PUT'?JSON.stringify({device_id:device,latitude:req.body.latitude,longitude:req.body.longitude,source:'admin',accuracy_m:null,updated_at:new Date().toISOString()}):undefined,
      signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!upstream.ok)throw Error('upstream status '+upstream.status);
    const rows=await upstream.json();
    if(!Array.isArray(rows))throw Error('invalid upstream data');
    return res.status(200).json({device,location:rows.find(row=>row.device_id===device)||null});
  }catch(error){console.error('Admin location request failed:',error.message);return res.status(502).json({error:'장치 위치 처리에 실패했습니다. 서버 설정과 데이터베이스 상태를 확인하세요.'});}
};

