 'use strict';
const crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(Error(message),{status});
async function db(path,method='GET',body,query={}){
 const origin=new URL(process.env.SUPABASE_URL||'https://invalid.invalid');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!process.env.SUPABASE_URL||origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password)throw fail(503,'로그인 서버 연결 설정을 확인하세요.');
 const url=new URL('/rest/v1/'+path,origin);for(const [k,v]of Object.entries(query))url.searchParams.set(k,v);
 const response=await fetch(url,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
 const data=await response.json().catch(()=>null);if(!response.ok){if(['42P01','PGRST202','PGRST205','42883'].includes(data?.code))throw fail(503,'회원·장치 연결 데이터베이스 설정을 적용해야 합니다.');if(data?.code==='23505')throw fail(409,'이미 사용 중인 아이디입니다.');throw fail(502,'서버 자료 처리에 실패했습니다.');}return data;
}
function originCheck(req){if(['GET','HEAD'].includes(req.method))return;const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;if(!origin||!host)throw fail(403,'사이트에서 다시 요청하세요.');try{if(new URL(origin).host!==host)throw Error();}catch{throw fail(403,'다른 사이트에서의 요청은 허용하지 않습니다.');}}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function sessionToken(req){const value=/(?:^|;\s*)withu_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'');return value?.[1]||'';}
async function session(req){const token=sessionToken(req);if(!token)throw fail(401,'로그인해 주세요.');const rows=await db('withu_sessions','GET',undefined,{token_hash:'eq.'+hash(token),expires_at:'gt.'+new Date().toISOString(),select:'account_id',limit:'1'});if(!rows.length)throw fail(401,'로그인이 만료되었습니다. 다시 로그인해 주세요.');const users=await db('withu_accounts','GET',undefined,{id:'eq.'+rows[0].account_id,select:'id,username,role,company_id',limit:'1'});if(!users.length)throw fail(401,'로그인해 주세요.');return users[0];}
async function admin(req){const user=await session(req);if(user.role!=='admin')throw fail(403,'관리자만 사용할 수 있습니다.');return user;}
function allowed(){return (process.env.WITHU_ALLOWED_DEVICE_IDS||'pi5-monitor-01').split(',').map(v=>v.trim()).filter(v=>/^[A-Za-z0-9_-]{1,64}$/.test(v));}
async function devices(user){if(user.role==='admin')return allowed();const rows=await db('company_devices','GET',undefined,{company_id:'eq.'+user.company_id,select:'device_id'});return rows.map(r=>r.device_id).filter(d=>allowed().includes(d));}
async function deviceAccess(req,device,adminOnly=false){const user=adminOnly?await admin(req):await session(req);if(!(await devices(user)).includes(device))throw fail(403,'이 기업에 연결되지 않은 장치입니다.');return user;}
function finishError(res,error){return res.status(error.status||502).json({error:error.status?error.message:'서버 요청에 실패했습니다.'});}
function cookie(res,token){res.setHeader('Set-Cookie','withu_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(token?'28800':'0'));}
module.exports={db,fail,originCheck,hash,sessionToken,session,admin,allowed,devices,deviceAccess,finishError,cookie};
