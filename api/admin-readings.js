'use strict';
const crypto=require('node:crypto');
const allowed=new Set((process.env.WITHU_ALLOWED_DEVICE_IDS||'pi5-monitor-01').split(',').map(x=>x.trim()).filter(Boolean));
function sameToken(given,expected){const a=Buffer.from(given),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 지원합니다.'});
 const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY,adminToken=process.env.WITHU_ADMIN_TOKEN;
 if(!url||!serviceKey||!adminToken)return res.status(503).json({error:'장치 기록 조회 서버가 아직 연결되지 않았습니다.'});
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||'';
 if(!sameToken(token,adminToken))return res.status(401).json({error:'관리자 조회 토큰이 올바르지 않습니다.'});
 const device=req.query?.device;
 if(typeof device!=='string'||!allowed.has(device)||!/^[A-Za-z0-9_-]{1,64}$/.test(device))return res.status(400).json({error:'등록되지 않은 장치입니다.'});
 try{
  const endpoint=new URL('/rest/v1/environment_readings',url);
  endpoint.searchParams.set('device_id','eq.'+device);
  endpoint.searchParams.set('select','device_id,timestamp,source,soil_temperature,soil_moisture');
  endpoint.searchParams.set('order','timestamp.desc');
  endpoint.searchParams.set('limit','1000');
  const upstream=await fetch(endpoint,{headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!upstream.ok)throw Error('upstream status '+upstream.status);
  const rows=await upstream.json();
  if(!Array.isArray(rows))throw Error('invalid upstream data');
  return res.status(200).json({device,records:rows.filter(row=>row.device_id===device).map(row=>({...row,soil_ec:null,soil_ph:null}))});
 }catch(error){console.error('Admin readings query failed:',error.message);return res.status(502).json({error:'장치 기록 조회에 실패했습니다. 서버 설정과 데이터베이스 상태를 확인하세요.'});}
};
