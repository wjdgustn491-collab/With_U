const assert=require('node:assert/strict');
const GreenArea=require('./green-area.js');
const center=[37,127];
const metres=(x,y)=>({lat:center[0]+y/111320,lon:center[1]+x/(111320*Math.cos(center[0]*Math.PI/180))});
const square=[metres(-100,-100),metres(100,-100),metres(100,100),metres(-100,100),metres(-100,-100)];
const element=(id,tags)=>({type:'way',id,tags,geometry:square});
const single=GreenArea.estimate([element(1,{landuse:'forest'})],center);
assert.equal(single.squareMetres,40000);
assert.equal(single.mappedPolygons,1);
const overlap=GreenArea.estimate([element(1,{landuse:'forest'}),element(2,{natural:'wood'})],center);
assert.equal(overlap.squareMetres,40000,'overlapping green polygons count once');
assert.equal(GreenArea.estimate([element(3,{building:'yes'})],center).squareMetres,0);
console.log('PASS: nearby green area sampling, overlap and tag filtering');

