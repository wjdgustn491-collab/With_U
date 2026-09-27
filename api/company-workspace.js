 'use strict';
const B=require('../business-engine'),E=require('../carbon-engine'),A=require('../server/access');
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 if(!['GET','PUT'].includes(req.method))throw A.fail(405,'GET 또는 PUT 요청만 지원합니다.');A.originCheck(req);const user=await A.session(req);
 const listing=req.method==='GET'&&req.query?.list==='1';if(listing&&user.role!=='admin')throw A.fail(403,'다른 기업 목록은 조회할 수 없습니다.');
 if(listing){const rows=await A.db('company_workspaces','GET',undefined,{select:'id,name,updated_at',order:'updated_at.desc'});return res.status(200).json({companies:rows.map(r=>({id:r.id,name:r.name,revision:r.updated_at}))});}
 let company;try{company=B.id(req.query?.company||user.company_id);}catch(e){throw A.fail(400,e.message);}if(user.role!=='admin'&&company!==user.company_id)throw A.fail(403,'이 기업 자료에 접근할 수 없습니다.');
 const rows=await A.db('company_workspaces','GET',undefined,{id:'eq.'+company,select:'id,document,updated_at',limit:'1'});if(!rows.length)throw A.fail(404,'기업 자료가 없습니다.');const current=B.workspace(rows[0].document);
 if(req.method==='GET')return res.status(200).json({document:current,revision:rows[0].updated_at});
 if(Buffer.byteLength(JSON.stringify(req.body||{}))>2000000)throw A.fail(413,'기업 자료는 2 MB 이내로 저장하세요.');let document;try{document=B.workspace(req.body?.document);}catch(e){throw A.fail(400,e.message);}
 if(document.id!==company||document.name!==current.name||document.boundary!==current.boundary)throw A.fail(400,'회원가입한 기업명과 사업장 정보를 유지하세요.');
 if(user.role==='company'&&JSON.stringify(document.surveys)!==JSON.stringify(current.surveys))throw A.fail(403,'현장 조사 자료는 관리자만 변경할 수 있습니다.');
 const assigned=user.role==='admin'?A.allowed():await A.devices(user);
 if(user.role==='admin'&&document.surveys.some(s=>!A.allowed().includes(s.device)))throw A.fail(400,'등록되지 않은 조사 장치입니다.');
 for(const report of document.reports){const old=current.reports.find(r=>r.id===report.id);if(old){if(JSON.stringify(report)!==JSON.stringify(old))throw A.fail(400,'저장한 보고서는 수정할 수 없습니다.');continue;}if(!assigned.includes(report.device))throw A.fail(403,'연결되지 않은 장치의 보고서입니다.');if(report.data.name!==current.name||report.data.boundary!==current.boundary)throw A.fail(400,'보고서의 기업 정보를 확인하세요.');if(report.data.surveys.some(s=>!document.surveys.some(v=>JSON.stringify(v)===JSON.stringify(s))))throw A.fail(403,'관리자가 등록한 현장 조사 자료만 보고서에 포함할 수 있습니다.');if(report.sensor){const records=await A.db('environment_readings','GET',undefined,{device_id:'eq.'+report.device,timestamp:'eq.'+report.sensor.timestamp,source:'eq.hardware',select:'device_id,timestamp,source,soil_temperature,soil_moisture',limit:'1'});if(!records.length)throw A.fail(400,'보고서의 실제 센서 기록을 확인할 수 없습니다.');const observed=E.sensor({...records[0],soil_ec:null,soil_ph:null});for(const key of ['device_id','source','soil_temperature','soil_moisture','soil_ec','soil_ph'])if(observed[key]!==report.sensor[key])throw A.fail(400,'실제 센서 관측값과 보고서 값이 다릅니다.');}}
 if(!req.body.baseRevision||req.body.baseRevision!==rows[0].updated_at)throw A.fail(409,'서버 자료가 변경되었습니다. 다시 불러온 뒤 저장하세요.');
 const saved=await A.db('company_workspaces','PATCH',{document,updated_at:new Date().toISOString()},{id:'eq.'+company,updated_at:'eq.'+req.body.baseRevision,select:'document,updated_at'});if(!saved.length)throw A.fail(409,'다른 창에서 자료가 변경되었습니다. 다시 불러오세요.');return res.status(200).json({document:B.workspace(saved[0].document),revision:saved[0].updated_at});
 }catch(e){return A.finishError(res,e);}};
