const assert=require('node:assert/strict');
const GreenArea=require('./green-area.js');
const center=[37,127];
const metres=(x,y)=>({lat:center[0]+y/111320,lon:center[1]+x/(111320*Math.cos(center[0]*Math.PI/180))});
const square=[metres(-100,-100),metres(100,-100),metres(100,100),metres(-100,100),metres(-100,-100)];
const box=(x0,y0,x1,y1)=>[metres(x0,y0),metres(x1,y0),metres(x1,y1),metres(x0,y1),metres(x0,y0)];
const element=(id,tags,geometry=square)=>({type:'way',id,tags,geometry});
const single=GreenArea.estimate([element(1,{landuse:'forest'})],center);
assert.ok(single.squareMetres>31000&&single.squareMetres<32000);
assert.equal(single.mappedPolygons,1);
assert.equal(single.selectionMode,'contains');
assert.ok(single.patches.length>0);
const overlap=GreenArea.estimate([element(1,{landuse:'forest'}),element(2,{natural:'wood'})],center);
assert.equal(overlap.squareMetres,single.squareMetres,'overlapping green polygons count once');
assert.equal(overlap.mappedPolygons,1);
const local=GreenArea.estimate([
  element(1,{leisure:'park'},box(-250,-250,250,250)),
  element(2,{landuse:'grass'},box(-20,-20,20,20)),
  element(3,{natural:'wood'},box(80,0,180,100))],center);
assert.equal(local.squareMetres,1600,'select the specific parcel containing the device');
const nearby=GreenArea.estimate([
  element(1,{landuse:'grass'},box(20,-20,60,20)),
  element(2,{landuse:'forest'},box(70,-20,110,20))],center);
assert.equal(nearby.selectionMode,'nearest');
assert.equal(nearby.squareMetres,1600,'only the closest parcel is estimated');
const distant=GreenArea.estimate([element(1,{landuse:'forest'},box(50,-20,90,20))],center);
assert.equal(distant.squareMetres,0,'green parcels further than 30 m are excluded');
assert.equal(GreenArea.estimate([element(3,{building:'yes'})],center).squareMetres,0);
console.log('PASS: device parcel selection, 100 m clipping and tag filtering');

