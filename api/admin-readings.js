'use strict';
const A=require('../server/access');
const allowed=new Set((process.env.WITHU_ALLOWED_DEVICE_IDS||'pi5-monitor-01').split(',').map(x=>x.trim()).filter(Boolean));
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET 요청만 지원합니다.'});
 const url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const device=req.query?.device;
 try{await A.deviceAccess(req,device);}catch(e){return A.finishError(res,e);}
 try{
  const endpoint=new URL('/rest/v1/environment_readings',url);
  endpoint.searchParams.set('device_id','eq.'+device);
  // Query also works before the additive migration, when EC/pH are absent.
  endpoint.searchParams.set('select','*');
  endpoint.searchParams.set('order','timestamp.desc');
  endpoint.searchParams.set('limit','1000');
  const upstream=await fetch(endpoint,{headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!upstream.ok)throw Error('upstream status '+upstream.status);
  const rows=await upstream.json();
  if(!Array.isArray(rows))throw Error('invalid upstream data');
  const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
  return res.status(200).json({device,records:rows.filter(row=>row.device_id===device).map(row=>({
   device_id:row.device_id,timestamp:row.timestamp,source:row.source,
   soil_temperature:numeric(row.soil_temperature),soil_moisture:numeric(row.soil_moisture),
   soil_ec:numeric(row.soil_ec),soil_ph:numeric(row.soil_ph),
  }))});
 }catch(error){console.error('Admin readings query failed:',error.message);return res.status(502).json({error:'장치 기록 조회에 실패했습니다. 서버 설정과 데이터베이스 상태를 확인하세요.'});}
};
