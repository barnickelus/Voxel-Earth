import * as THREE from 'https://esm.sh/three@0.167.0';
import {OrbitControls} from 'https://esm.sh/three@0.167.0/examples/jsm/controls/OrbitControls.js';

// === CONSTANTS ===
const R = 2.42;
const VOXEL_SIZE = 0.075;

// === CORE SETUP ===
const canvas = document.querySelector('#globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.1, 8.1);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 4.1;
controls.maxDistance = 13;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

scene.add(new THREE.AmbientLight(0x4a6680, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(-5, 3, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x2c8fff, 2);
rim.position.set(5, -1, -4);
scene.add(rim);

const root = new THREE.Group();
root.rotation.z = -0.13;
scene.add(root);

// Earth + subtle atmosphere
const tex = new THREE.TextureLoader().load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
tex.colorSpace = THREE.SRGBColorSpace;
root.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84 })));
root.add(new THREE.Mesh(new THREE.SphereGeometry(R + 0.1, 80, 48), new THREE.MeshBasicMaterial({ color: 0x57b9ff, transparent: true, opacity: 0.07, side: THREE.BackSide, blending: THREE.AdditiveBlending })));

// Stars
const starPositions = new Float32Array(1800 * 3);
for (let i = 0; i < 1800; i++) {
  const rr = 20 + Math.random() * 35;
  const a = Math.random() * Math.PI * 2;
  const z = (Math.random() * 2 - 1) * rr;
  const q = Math.sqrt(rr * rr - z * z);
  starPositions[i * 3] = q * Math.cos(a);
  starPositions[i * 3 + 1] = z;
  starPositions[i * 3 + 2] = q * Math.sin(a);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb8d8f4, size: 0.035, transparent: true, opacity: 0.65 })));

// Layer groups
const groups = {
  clouds: new THREE.Group(),
  rain: new THREE.Group(),
  temperature: new THREE.Group(),
  wind: new THREE.Group(),
  grid: new THREE.Group()
};
Object.values(groups).forEach(g => root.add(g));

let data = [];
let meshes = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = document.querySelector('#tip');

// === HELPERS ===
function latLonVector(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

function orientOut(object, position) {
  object.position.copy(position);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position.clone().normalize());
}

function temperatureColor(temp) {
  return new THREE.Color().lerpColors(new THREE.Color(0x3a74e8), new THREE.Color(0xff5538), THREE.MathUtils.clamp((temp + 20) / 60, 0, 1));
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  }
}

// === BUILD WEATHER ===
function buildWeather(samples) {
  Object.values(groups).forEach(clearGroup);
  meshes = [];

  const cubeGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
  const rainGeo = new THREE.BoxGeometry(0.03, 0.12, 0.03);
  const windGeo = new THREE.BoxGeometry(0.018, 0.018, 0.16);

  samples.forEach(sample => {
    const base = latLonVector(sample.lat, sample.lon, R + 0.055);
    const normal = base.clone().normalize();
    const height = 0.06 + THREE.MathUtils.clamp((sample.temp + 25) / 65, 0, 1) * 0.3;
    const color = temperatureColor(sample.temp);

    // Temperature columns (individual for varying height)
    const tempMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, height, 0.085),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.9 })
    );
    orientOut(tempMesh, base.clone().add(normal.clone().multiplyScalar(height / 2)));
    tempMesh.userData = sample;
    groups.temperature.add(tempMesh);
    meshes.push(tempMesh);

    // Clouds - InstancedMesh for performance
    const cloudCount = Math.max(1, Math.round(sample.cloud / 18));
    if (cloudCount > 0) {
      const cloudMat = new THREE.MeshStandardMaterial({ color: 0x9ec8ff, transparent: true, opacity: 0.28, depthWrite: false });
      const cloudInst = new THREE.InstancedMesh(cubeGeo, cloudMat, cloudCount);
      const dummy = new THREE.Object3D();
      for (let j = 0; j < cloudCount; j++) {
        const alt = 0.18 + (j % 3) * 0.11;
        const pos = latLonVector(sample.lat + (Math.random() - 0.5) * 7, sample.lon + (Math.random() - 0.5) * 8, R + alt);
        dummy.position.copy(pos);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
        dummy.scale.set(0.9 + Math.random() * 1.3, 0.7 + Math.random() * 0.6, 0.9 + Math.random() * 1.3);
        dummy.updateMatrix();
        cloudInst.setMatrixAt(j, dummy.matrix);
      }
      cloudInst.instanceMatrix.needsUpdate = true;
      cloudInst.userData = sample;
      groups.clouds.add(cloudInst);
      meshes.push(cloudInst);
    }

    // Rain - keep individual meshes for reliable animation (Instanced + falling is tricky without more code)
    if (sample.rain > 0.05) {
      const rainCount = Math.min(7, 1 + Math.round(sample.rain * 1.5));
      for (let j = 0; j < rainCount; j++) {
        const rainMesh = new THREE.Mesh(rainGeo, new THREE.MeshBasicMaterial({ color: 0x28b8ff, transparent: true, opacity: 0.8 }));
        const pos = latLonVector(sample.lat + (Math.random() - 0.5) * 4, sample.lon + (Math.random() - 0.5) * 4, R + 0.1 + Math.random() * 0.15);
        orientOut(rainMesh, pos);
        rainMesh.userData = { ...sample, phase: Math.random() * Math.PI * 2 };
        groups.rain.add(rainMesh);
        meshes.push(rainMesh);
      }
    }

    // Wind - individual for reliable animation
    const windCount = Math.max(1, Math.min(4, Math.round(sample.wind / 22)));
      for (let j = 0; j < windCount; j++) {
        const windMesh = new THREE.Mesh(windGeo, new THREE.MeshBasicMaterial({ color: 0x43d8ff, transparent: true, opacity: 0.55 }));
        const offset = (j - 1.5) * 2;
        const pos = latLonVector(sample.lat + offset, sample.lon + offset, R + 0.13);
        orientOut(windMesh, pos);
        windMesh.rotateY((sample.dir || 0) * Math.PI / 180);
        windMesh.userData = { ...sample, phase: Math.random() * Math.PI * 2 };
        groups.wind.add(windMesh);
        meshes.push(windMesh);
      }
  });

  // Grid - InstancedMesh (static, big performance win)
  const gridCount = 11 * 24;
  const gridInst = new THREE.InstancedMesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0x2787c4, transparent: true, opacity: 0.08, wireframe: true }), gridCount);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += 15) {
      const pos = latLonVector(lat, lon, R + 0.48);
      dummy.position.copy(pos);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize());
      dummy.scale.set(0.55, 0.55, 0.55);
      dummy.updateMatrix();
      gridInst.setMatrixAt(idx++, dummy.matrix);
    }
  }
  gridInst.instanceMatrix.needsUpdate = true;
  groups.grid.add(gridInst);
  meshes.push(gridInst);

  const total = Object.values(groups).reduce((sum, g) => sum + g.children.length, 0);
  document.querySelector('#count').textContent = total + ' voxels';
}

// === FALLBACK ===
function fallbackData() {
  const samples = [];
  for (let lat = -60; lat <= 60; lat += 15) {
    for (let lon = -180; lon < 180; lon += 20) {
      const wave = Math.sin((lon + lat) * 0.07) + Math.cos(lat * 0.11);
      samples.push({
        lat, lon,
        temp: 27 - Math.abs(lat) * 0.55 + wave * 5,
        cloud: Math.max(0, Math.min(100, 48 + 42 * Math.sin((lon - lat) * 0.055))),
        rain: Math.max(0, wave * 0.8),
        wind: 12 + Math.abs(Math.sin(lon * 0.09)) * 55,
        dir: (lon * 2 + lat + 360) % 360
      });
    }
  }
  return samples;
}

// === LOAD DATA ===
async function loadLiveWeather() {
  const points = [];
  for (let lat = -60; lat <= 60; lat += 15) for (let lon = -180; lon < 180; lon += 20) points.push([lat, lon]);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${points.map(p => p[0])}&longitude=${points.map(p => p[1])}&current=temperature_2m,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m&timezone=GMT`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [json];
    data = rows.map((row, i) => ({
      lat: row.latitude ?? points[i][0],
      lon: row.longitude ?? points[i][1],
      temp: row.current?.temperature_2m ?? 0,
      cloud: row.current?.cloud_cover ?? 0,
      rain: row.current?.precipitation ?? 0,
      wind: row.current?.wind_speed_10m ?? 0,
      dir: row.current?.wind_direction_10m ?? 0
    }));
    document.querySelector('#notice').textContent = 'Live atmospheric sample loaded';
  } catch (e) {
    data = fallbackData();
    document.querySelector('#notice').textContent = 'Live API unavailable — procedural weather shown';
  }
  buildWeather(data);
  const avg = key => data.reduce((s, d) => s + d[key], 0) / data.length;
  document.querySelector('#mt').textContent = avg('temp').toFixed(1) + '°';
  document.querySelector('#mc').textContent = Math.round(avg('cloud')) + '%';
  document.querySelector('#mw').textContent = Math.round(Math.max(...data.map(d => d.wind))) + ' km/h';
  document.querySelector('#mr').textContent = data.filter(d => d.rain > 0.05).length;
  setTimeout(() => document.querySelector('#notice').style.opacity = 0, 2200);
}

// === UI ===
document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => {
  groups[input.dataset.layer].visible = input.checked;
  document.querySelector('#active').textContent = [...document.querySelectorAll('[data-layer]')].filter(el => el.checked).length + ' / 5';
}));

let playing = false;
let timer;
document.querySelector('#play').addEventListener('click', () => {
  playing = !playing;
  document.querySelector('#play').textContent = playing ? '❚❚' : '▶';
  clearInterval(timer);
  if (playing) {
    timer = setInterval(() => {
      const range = document.querySelector('#range');
      range.value = Number(range.value) >= 0 ? -24 : Number(range.value) + 1;
      range.dispatchEvent(new Event('input'));
    }, 500);
  }
});

document.querySelector('#range').addEventListener('input', e => {
  const val = Number(e.target.value);
  document.querySelector('#time').textContent = val === 0 ? 'NOW' : Math.abs(val) + 'H AGO';
  const frac = (val + 24) / 24;
  groups.clouds.rotation.y = (1 - frac) * 0.2;
  groups.rain.rotation.y = (1 - frac) * 0.25;
  groups.wind.rotation.y = (1 - frac) * 0.3;
});

canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX / innerWidth * 2 - 1;
  mouse.y = -(e.clientY / innerHeight * 2 - 1);
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (hit?.object.userData?.lat !== undefined || hit?.object.userData?.sample) {
    const sample = hit.object.userData.sample || hit.object.userData;
    tip.style.display = 'block';
    tip.style.left = e.clientX + 12 + 'px';
    tip.style.top = e.clientY + 12 + 'px';
    tip.textContent = `${sample.lat.toFixed(0)}°, ${sample.lon.toFixed(0)}° · ${sample.temp.toFixed(1)}°C · clouds ${sample.cloud.toFixed(0)}% · wind ${sample.wind.toFixed(0)} km/h`;
  } else {
    tip.style.display = 'none';
  }
});

// === ANIMATION (fixed) ===
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Rain animation (original style - reliable)
  groups.rain.children.forEach((object, index) => {
    if (object.userData.phase !== undefined) {
      object.scale.y = 0.65 + 0.35 * Math.sin(t * 5 + object.userData.phase);
    }
  });

  // Wind opacity pulse (original style)
  groups.wind.children.forEach((object, index) => {
    if (object.userData.phase !== undefined) {
      object.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + object.userData.phase));
    }
  });

  controls.update();
  renderer.render(scene, camera);
}

animate();
loadLiveWeather();
setInterval(() => {
  document.querySelector('#utc').textContent = new Date().toUTCString().slice(17, 22) + ' UTC';
}, 1000);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
