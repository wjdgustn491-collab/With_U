 'use strict';
const crypto=require('node:crypto'),A=require('../server/access');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');try{
  if(!['GET','POST'].includes(req.method))throw A.fail(405,'GET 또는 POST만 지원합니다.');A.originCheck(req);
  if(req.method==='GET'){const user=await A.session(req);let profile=null;if(user.company_id){const rows=await A.db('company_workspaces','GET',undefined,{id:'eq.'+user.company_id,select:'name,document',limit:'1'});profile=rows[0]?{name:rows[0].name,boundary:rows[0].document.boundary}:null;}return res.status(200).json({user,profile});}
  const b=req.body||{};
  if(b.action==='logout'){const token=A.sessionToken(req);if(token)await A.db('withu_sessions','DELETE',undefined,{token_hash:'eq.'+A.hash(token)});A.cookie(res,'');return res.status(200).json({ok:true});}
  if(!['login','signup','admin-login'].includes(b.action))throw A.fail(400,'로그인 요청을 확인하세요.');
  const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
  if(!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(username)||typeof b.password!=='string'||Buffer.byteLength(b.password)>72||!b.password.length)throw A.fail(400,'아이디는 영문·숫자 3~50자, 비밀번호는 72바이트 이내로 입력하세요.');
  if(b.action==='signup'&&(username==='admin'||b.password.length<8||typeof b.name!=='string'||!b.name.trim()||b.name.length>120||typeof b.boundary!=='string'||!b.boundary.trim()||b.boundary.length>500))throw A.fail(400,'기업명·보고 경계와 8자 이상의 비밀번호를 입력하세요. admin은 등록할 수 없습니다.');
  const token=crypto.randomBytes(32).toString('hex'),ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
  const result=await A.db('rpc/withu_authenticate','POST',{p_action:b.action,p_username:username,p_password:b.password,p_name:b.action==='signup'?b.name.trim():null,p_boundary:b.action==='signup'?b.boundary.trim():null,p_session_hash:A.hash(token),p_client_hash:A.hash(ip)});
  if(result.status!==200)throw A.fail(result.status,result.status===429?'잠시 후 다시 로그인해 주세요.':result.status===409?'이미 사용 중인 아이디입니다.':'아이디 또는 비밀번호를 확인하세요.');
  A.cookie(res,token);return res.status(200).json({user:result.user});
 }catch(e){return A.finishError(res,e);}
};
