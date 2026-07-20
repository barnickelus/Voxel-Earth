import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/+esm';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js/+esm';

const canvas=document.querySelector('#globe');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.1,100);
camera.position.set(0,1.1,8.1);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;
controls.minDistance=4.1;
controls.maxDistance=13;
controls.enablePan=false;
controls.autoRotate=true;
controls.autoRotateSpeed=.25;
scene.add(new THREE.AmbientLight(0x4a6680,1.4));
const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-5,3,5);scene.add(sun);
const rim=new THREE.DirectionalLight(0x2c8fff,2);rim.position.set(5,-1,-4);scene.add(rim);

const root=new THREE.Group();root.rotation.z=-.13;scene.add(root);
const R=2.42;
const tex=new THREE.TextureLoader().load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
tex.colorSpace=THREE.SRGBColorSpace;
root.add(new THREE.Mesh(new THREE.SphereGeometry(R,96,64),new THREE.MeshStandardMaterial({map:tex,roughness:.84})));
root.add(new THREE.Mesh(new THREE.SphereGeometry(R+.1,80,48),new THREE.MeshBasicMaterial({color:0x57b9ff,transparent:true,opacity:.07,side:THREE.BackSide,blending:THREE.AdditiveBlending})));

const starPositions=new Float32Array(1800*3);
for(let i=0;i<1800;i++){
  const rr=20+Math.random()*35,a=Math.random()*Math.PI*2,z=(Math.random()*2-1)*rr,q=Math.sqrt(rr*rr-z*z);
  starPositions[i*3]=q*Math.cos(a);starPositions[i*3+1]=z;starPositions[i*3+2]=q*Math.sin(a);
}
const starGeometry=new THREE.BufferGeometry();
starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0xb8d8f4,size:.035,transparent:true,opacity:.65})));

const groups={clouds:new THREE.Group(),rain:new THREE.Group(),temperature:new THREE.Group(),wind:new THREE.Group(),grid:new THREE.Group()};
Object.values(groups).forEach(group=>root.add(group));
let data=[];
let meshes=[];
const raycaster=new THREE.Raycaster();
const mouse=new THREE.Vector2();
const tip=document.querySelector('#tip');

function latLonVector(lat,lon,radius){
  const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;
  return new THREE.Vector3(-radius*Math.sin(phi)*Math.cos(theta),radius*Math.cos(phi),radius*Math.sin(phi)*Math.sin(theta));
}
function orientOut(object,position){
  object.position.copy(position);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),position.clone().normalize());
}
function clearGroup(group){
  while(group.children.length){const object=group.children.pop();object.geometry?.dispose();object.material?.dispose();}
}
function temperatureColor(temp){
  return new THREE.Color().lerpColors(new THREE.Color(0x3a74e8),new THREE.Color(0xff5538),THREE.MathUtils.clamp((temp+20)/60,0,1));
}

function buildWeather(samples){
  Object.values(groups).forEach(clearGroup);
  meshes=[];
  const cubeGeometry=new THREE.BoxGeometry(.075,.075,.075);
  samples.forEach(sample=>{
    const base=latLonVector(sample.lat,sample.lon,R+.055);
    const normal=base.clone().normalize();
    const height=.06+THREE.MathUtils.clamp((sample.temp+25)/65,0,1)*.3;
    const color=temperatureColor(sample.temp);
    const temperatureMesh=new THREE.Mesh(
      new THREE.BoxGeometry(.085,height,.085),
      new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.4,transparent:true,opacity:.9})
    );
    orientOut(temperatureMesh,base.clone().add(normal.clone().multiplyScalar(height/2)));
    temperatureMesh.userData=sample;
    groups.temperature.add(temperatureMesh);
    meshes.push(temperatureMesh);

    for(let j=0;j<Math.round(sample.cloud/18);j++){
      const altitude=.18+(j%3)*.11;
      const position=latLonVector(sample.lat+(Math.random()-.5)*7,sample.lon+(Math.random()-.5)*8,R+altitude);
      const cloudMesh=new THREE.Mesh(cubeGeometry,new THREE.MeshStandardMaterial({
        color:altitude>.35?0xa779ff:altitude>.24?0x7fb8ff:0xe6f3ff,
        transparent:true,opacity:.24+sample.cloud/190,depthWrite:false
      }));
      cloudMesh.scale.set(.8+Math.random()*1.4,.7+Math.random(),.8+Math.random()*1.4);
      orientOut(cloudMesh,position);
      cloudMesh.userData=sample;
      groups.clouds.add(cloudMesh);
      meshes.push(cloudMesh);
    }

    if(sample.rain>.05){
      for(let j=0;j<Math.min(7,1+Math.round(sample.rain*1.5));j++){
        const rainMesh=new THREE.Mesh(new THREE.BoxGeometry(.03,.12,.03),new THREE.MeshBasicMaterial({color:0x28b8ff,transparent:true,opacity:.8}));
        const position=latLonVector(sample.lat+(Math.random()-.5)*4,sample.lon+(Math.random()-.5)*4,R+.1+Math.random()*.15);
        orientOut(rainMesh,position);
        rainMesh.userData={...sample,phase:Math.random()*Math.PI*2};
        groups.rain.add(rainMesh);
        meshes.push(rainMesh);
      }
    }

    for(let j=0;j<Math.max(1,Math.min(4,Math.round(sample.wind/22)));j++){
      const windMesh=new THREE.Mesh(new THREE.BoxGeometry(.018,.018,.15+sample.wind*.0013),new THREE.MeshBasicMaterial({color:0x43d8ff,transparent:true,opacity:.55}));
      const position=latLonVector(sample.lat+(j-1.5)*2,sample.lon+(j-1.5)*2,R+.13);
      orientOut(windMesh,position);
      windMesh.rotateY((sample.dir||0)*Math.PI/180);
      windMesh.userData={...sample,phase:Math.random()*Math.PI*2};
      groups.wind.add(windMesh);
      meshes.push(windMesh);
    }
  });

  for(let lat=-75;lat<=75;lat+=15){
    for(let lon=-180;lon<180;lon+=15){
      const gridMesh=new THREE.Mesh(cubeGeometry,new THREE.MeshBasicMaterial({color:0x2787c4,transparent:true,opacity:.08,wireframe:true}));
      gridMesh.scale.set(.55,.55,.55);
      orientOut(gridMesh,latLonVector(lat,lon,R+.48));
      groups.grid.add(gridMesh);
    }
  }
  document.querySelector('#count').textContent=Object.values(groups).reduce((sum,group)=>sum+group.children.length,0)+' voxels';
}

function fallbackData(){
  const samples=[];
  for(let lat=-60;lat<=60;lat+=20){
    for(let lon=-180;lon<180;lon+=30){
      const wave=Math.sin((lon+lat)*.07)+Math.cos(lat*.11);
      samples.push({
        lat,lon,
        temp:27-Math.abs(lat)*.55+wave*5,
        cloud:Math.max(0,Math.min(100,48+42*Math.sin((lon-lat)*.055))),
        rain:Math.max(0,wave*.8),
        wind:12+Math.abs(Math.sin(lon*.09))*55,
        dir:(lon*2+lat+360)%360
      });
    }
  }
  return samples;
}

async function loadLiveWeather(){
  const points=[];
  for(let lat=-60;lat<=60;lat+=20)for(let lon=-180;lon<180;lon+=30)points.push([lat,lon]);
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${points.map(point=>point[0])}&longitude=${points.map(point=>point[1])}&current=temperature_2m,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m&timezone=GMT`;
  try{
    const response=await fetch(url);
    if(!response.ok)throw new Error(response.status);
    const json=await response.json();
    const rows=Array.isArray(json)?json:[json];
    data=rows.map((row,index)=>({
      lat:row.latitude??points[index][0],lon:row.longitude??points[index][1],
      temp:row.current?.temperature_2m??0,cloud:row.current?.cloud_cover??0,
      rain:row.current?.precipitation??0,wind:row.current?.wind_speed_10m??0,
      dir:row.current?.wind_direction_10m??0
    }));
    document.querySelector('#notice').textContent='Live atmospheric sample loaded';
  }catch(error){
    data=fallbackData();
    document.querySelector('#notice').textContent='Live API unavailable — procedural weather shown';
  }
  buildWeather(data);
  const average=key=>data.reduce((sum,item)=>sum+item[key],0)/data.length;
  document.querySelector('#mt').textContent=average('temp').toFixed(1)+'°';
  document.querySelector('#mc').textContent=Math.round(average('cloud'))+'%';
  document.querySelector('#mw').textContent=Math.round(Math.max(...data.map(item=>item.wind)))+' km/h';
  document.querySelector('#mr').textContent=data.filter(item=>item.rain>.05).length;
  setTimeout(()=>document.querySelector('#notice').style.opacity=0,2200);
}

document.querySelectorAll('[data-layer]').forEach(input=>input.addEventListener('change',()=>{
  groups[input.dataset.layer].visible=input.checked;
  document.querySelector('#active').textContent=[...document.querySelectorAll('[data-layer]')].filter(item=>item.checked).length+' / 5';
}));

let playing=false;
let timer;
document.querySelector('#play').addEventListener('click',()=>{
  playing=!playing;
  document.querySelector('#play').textContent=playing?'❚❚':'▶';
  clearInterval(timer);
  if(playing){
    timer=setInterval(()=>{
      const range=document.querySelector('#range');
      range.value=Number(range.value)>=0?-24:Number(range.value)+1;
      range.dispatchEvent(new Event('input'));
    },500);
  }
});

document.querySelector('#range').addEventListener('input',event=>{
  const value=Number(event.target.value);
  document.querySelector('#time').textContent=value===0?'NOW':Math.abs(value)+'H AGO';
  const fraction=(value+24)/24;
  groups.clouds.rotation.y=(1-fraction)*.2;
  groups.rain.rotation.y=(1-fraction)*.25;
  groups.wind.rotation.y=(1-fraction)*.3;
});

canvas.addEventListener('pointermove',event=>{
  mouse.x=event.clientX/innerWidth*2-1;
  mouse.y=-(event.clientY/innerHeight*2-1);
  raycaster.setFromCamera(mouse,camera);
  const hit=raycaster.intersectObjects(meshes,false)[0];
  if(hit?.object.userData?.lat!==undefined){
    const sample=hit.object.userData;
    tip.style.display='block';tip.style.left=event.clientX+12+'px';tip.style.top=event.clientY+12+'px';
    tip.textContent=`${sample.lat.toFixed(0)}°, ${sample.lon.toFixed(0)}° · ${sample.temp.toFixed(1)}°C · clouds ${sample.cloud.toFixed(0)}% · wind ${sample.wind.toFixed(0)} km/h`;
  }else tip.style.display='none';
});

const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const elapsed=clock.getElapsedTime();
  groups.rain.children.forEach((object,index)=>object.scale.y=.65+.35*Math.sin(elapsed*5+(object.userData.phase||index)));
  groups.wind.children.forEach((object,index)=>object.material.opacity=.25+.35*(.5+.5*Math.sin(elapsed*2+(object.userData.phase||index))));
  controls.update();
  renderer.render(scene,camera);
}
animate();
loadLiveWeather();
setInterval(()=>document.querySelector('#utc').textContent=new Date().toUTCString().slice(17,22)+' UTC',1000);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
