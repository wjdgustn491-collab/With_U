 'use strict';
const A=require('../server/access'),B=require('../business-engine');
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 if(!['GET','PUT','DELETE'].includes(req.method))throw A.fail(405,'지원하지 않는 요청입니다.');A.originCheck(req);const user=await A.session(req);
 if(req.method==='GET'){
  if(user.role!=='admin')return res.status(200).json({devices:(await A.devices(user)).map(id=>({id}))});
  const [accounts,companies,links]=await Promise.all([A.db('withu_accounts','GET',undefined,{role:'eq.company',select:'company_id,username'}),A.db('company_workspaces','GET',undefined,{select:'id,name,document,updated_at'}),A.db('company_devices','GET',undefined,{select:'device_id,company_id'})]);
  return res.status(200).json({companies:accounts.map(a=>{const c=companies.find(v=>v.id===a.company_id);return {id:a.company_id,username:a.username,name:c?.name||'',boundary:c?.document.boundary||''};}),devices:A.allowed().map(id=>({id,company_id:links.find(l=>l.device_id===id)?.company_id||null}))});
 }
 if(user.role!=='admin')throw A.fail(403,'장치 연결은 관리자만 변경할 수 있습니다.');let company,device;try{company=B.id(req.body?.company);device=B.device(req.body?.device);}catch(e){throw A.fail(400,e.message);}
 if(!A.allowed().includes(device))throw A.fail(400,'등록되지 않은 장치입니다.');
 const accounts=await A.db('withu_accounts','GET',undefined,{company_id:'eq.'+company,role:'eq.company',select:'id',limit:'1'});if(!accounts.length)throw A.fail(400,'회원가입된 기업을 선택하세요.');
 if(req.method==='DELETE')await A.db('company_devices','DELETE',undefined,{device_id:'eq.'+device,company_id:'eq.'+company});
 else {const existing=await A.db('company_devices','GET',undefined,{device_id:'eq.'+device,select:'company_id',limit:'1'});if(existing.length&&existing[0].company_id!==company)throw A.fail(409,'다른 기업에 연결되어 있습니다. 기존 연결을 해제한 뒤 등록하세요.');if(!existing.length)try{await A.db('company_devices','POST',{device_id:device,company_id:company});}catch(e){if(e.status===409)throw A.fail(409,'장치 연결 상태가 변경되었습니다. 다시 조회하세요.');throw e;}}
 return res.status(200).json({ok:true});
 }catch(e){return A.finishError(res,e);}};
