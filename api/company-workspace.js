'use strict';
const crypto=require('node:crypto');
const B=require('../business-engine.js');
function authorized(req,token){const given=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||'';const a=Buffer.from(given),b=Buffer.from(token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'GET 또는 PUT 요청만 지원합니다.'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,token=process.env.WITHU_ADMIN_TOKEN;
  if(!url||!key||!token)return res.status(503).json({error:'기업 자료 서버가 연결되지 않았습니다. 이 브라우저의 저장 기능을 사용할 수 있습니다.'});
  if(!authorized(req,token))return res.status(401).json({error:'운영자 토큰이 올바르지 않습니다.'});
  let origin;try{origin=new URL(url);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();}catch{return res.status(503).json({error:'서버 연결 설정이 올바르지 않습니다.'});}
  const listing=req.method==='GET'&&req.query?.list==='1';let company,document;
  try{
    if(!listing)company=B.id(req.query?.company);
    if(req.method==='PUT'){
      if(Buffer.byteLength(JSON.stringify(req.body||{}),'utf8')>2000000)return res.status(413).json({error:'기업 자료는 2 MB 이내로 저장하세요.'});
      document=B.workspace(req.body?.document);if(document.id!==company)throw Error('기업 식별자가 일치하지 않습니다.');
      const allowed=new Set((process.env.WITHU_ALLOWED_DEVICE_IDS||'pi5-monitor-01').split(',').map(v=>v.trim()));
      if([...document.surveys.map(s=>s.device),...document.reports.map(r=>r.device)].some(d=>!allowed.has(d)))throw Error('등록되지 않은 장치의 자료입니다.');
    }
  }catch(err){return res.status(400).json({error:err.message});}
  try{
    const endpoint=new URL('/rest/v1/company_workspaces',origin);
    endpoint.searchParams.set('select',listing?'id,name,updated_at':'id,document,updated_at');
    if(req.method==='GET'){if(!listing)endpoint.searchParams.set('id','eq.'+company);endpoint.searchParams.set('limit',listing?'100':'1');if(listing)endpoint.searchParams.set('order','updated_at.desc');}
    
    const revision=new Date().toISOString();
    const headers={apikey:key,Authorization:'Bearer '+key};
    if(req.method==='PUT'){
      headers['Content-Type']='application/json';
      const baseRevision=req.body.baseRevision;
      if(baseRevision){
        if(typeof baseRevision!=='string'||!Number.isFinite(Date.parse(baseRevision)))return res.status(400).json({error:'서버 자료 버전을 확인하세요.'});
        endpoint.searchParams.delete('on_conflict');endpoint.searchParams.set('id','eq.'+company);endpoint.searchParams.set('updated_at','eq.'+baseRevision);headers.Prefer='return=representation';
      }else headers.Prefer='return=representation';
    }
    // New rows use INSERT, avoiding accidental replacement of an existing company.
    const result=await fetch(endpoint,{method:req.method==='GET'?'GET':req.body.baseRevision?'PATCH':'POST',headers,body:req.method==='PUT'?JSON.stringify({id:company,name:document.name,document,updated_at:revision}):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!result.ok){const e=await result.json().catch(()=>({}));if(e.code==='23505')return res.status(409).json({error:'서버에 기업 자료가 이미 있습니다. 서버 자료를 불러온 뒤 저장하세요.'});if(['42P01','PGRST205'].includes(e.code))return res.status(503).json({error:'기업 자료 테이블이 준비되지 않았습니다. company_workspaces.sql을 적용하세요.'});throw Error('upstream status '+result.status);}
    const rows=await result.json();if(!Array.isArray(rows))throw Error('Invalid server response');
    if(listing)return res.status(200).json({companies:rows.map(r=>({id:r.id,name:r.name,revision:r.updated_at}))});
    if(req.method==='PUT'&&!rows.length)return res.status(409).json({error:'다른 창에서 기업 자료가 변경되었습니다. 서버 자료를 다시 불러오세요.'});
    if(!rows.length)return res.status(200).json({document:null,revision:null});
    const saved=B.workspace(rows[0].document);if(saved.id!==company)throw Error('Company response mismatch');return res.status(200).json({document:saved,revision:rows[0].updated_at});
  }catch(err){console.error('Company workspace request failed:',err.message);return res.status(502).json({error:'기업 자료 서버 요청에 실패했습니다. 브라우저에 저장된 자료는 유지됩니다.'});}
};
