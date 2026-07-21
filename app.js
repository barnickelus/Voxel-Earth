import * as THREE from 'https://esm.sh/three@0.167.0';
import { OrbitControls } from 'https://esm.sh/three@0.167.0/examples/jsm/controls/OrbitControls.js';

// === VISUAL SCALE ===
const R = 2.42;
const WEATHER_LAT_STEP = 20;
const WEATHER_LON_STEP = 30;
const SHELL_STEP = 6;

const SHELLS = {
  low: {
    radius: R + 0.16,
    thickness: 0.055,
    clearOpacity: 0.034,
    cloudOpacity: 0.58,
    clearColor: 0x65a9d7,
    cloudColor: 0xeaf5ff,
    stormColor: 0x617181,
    opacityControl: 'lowOpacity'
  },
  mid: {
    radius: R + 0.30,
    thickness: 0.050,
    clearOpacity: 0.022,
    cloudOpacity: 0.46,
    clearColor: 0x739bd0,
    cloudColor: 0xdcecff,
    stormColor: 0x697487,
    opacityControl: 'midOpacity'
  },
  high: {
    radius: R + 0.44,
    thickness: 0.042,
    clearOpacity: 0.014,
    cloudOpacity: 0.33,
    clearColor: 0x775cc6,
    cloudColor: 0xc8ddff,
    stormColor: 0x70748f,
    opacityControl: 'highOpacity'
  }
};

// === CORE SETUP ===
const canvas = document.querySelector('#globe');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.1, 8.1);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 4.1;
controls.maxDistance = 13;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.22;

scene.add(new THREE.AmbientLight(0x4a6680, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 3.1);
sun.position.set(-5, 3, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x2c8fff, 1.8);
rim.position.set(5, -1, -4);
scene.add(rim);
const sunDirection = sun.position.clone().normalize();

const root = new THREE.Group();
root.rotation.z = -0.13;
scene.add(root);

const textureLoader = new THREE.TextureLoader();
function solidTexture(value) {
  const data = new Uint8Array([value, value, value, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const earthMapFallback = solidTexture(70);
const waterMaskFallback = solidTexture(0);
let earthMap = earthMapFallback;
let waterMask = waterMaskFallback;

const waterUniforms = {
  uMap: { value: earthMap },
  uWaterMask: { value: waterMask },
  uLightDir: { value: sunDirection },
  uWaterOpacity: { value: 0.88 },
  uReflectivity: { value: 0.58 }
};

const earthMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  transparent: true,
  depthWrite: true,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D uMap;
    uniform sampler2D uWaterMask;
    uniform vec3 uLightDir;
    uniform float uWaterOpacity;
    uniform float uReflectivity;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 albedo = texture2D(uMap, vUv).rgb;
      float suppliedMask = texture2D(uWaterMask, vUv).r;
      float blueDominance = albedo.b - max(albedo.r, albedo.g) * 0.72;
      float inferredMask = smoothstep(0.015, 0.16, blueDominance);
      float water = clamp(max(suppliedMask, inferredMask), 0.0, 1.0);

      vec3 N = normalize(vWorldNormal);
      vec3 L = normalize(uLightDir);
      vec3 V = normalize(cameraPosition - vWorldPosition);
      vec3 H = normalize(L + V);
      float diffuse = max(dot(N, L), 0.0);
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
      float shininess = mix(28.0, 115.0, uReflectivity);
      float specular = pow(max(dot(N, H), 0.0), shininess) * water * uReflectivity;

      vec3 landLit = albedo * (0.34 + diffuse * 0.82);
      vec3 deepWater = mix(albedo, vec3(0.018, 0.105, 0.20), 0.32);
      vec3 waterLit = deepWater * (0.26 + diffuse * 0.72);
      vec3 color = mix(landLit, waterLit, water);
      color += vec3(0.62, 0.82, 1.0) * water * (specular * 1.9 + fresnel * uReflectivity * 0.34);

      float alpha = mix(1.0, uWaterOpacity, water);
      gl_FragColor = vec4(color, alpha);
    }
  `
});

// A dark inner ocean/core becomes visible as water opacity is lowered.
const core = new THREE.Mesh(
  new THREE.SphereGeometry(R - 0.025, 72, 48),
  new THREE.MeshStandardMaterial({ color: 0x06182a, roughness: 0.78, metalness: 0.05 })
);
root.add(core);

const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMaterial);
earth.renderOrder = 1;
root.add(earth);

textureLoader.load(
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
  texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    earthMap = texture;
    waterUniforms.uMap.value = texture;
  }
);
textureLoader.load(
  'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
  texture => {
    waterMask = texture;
    waterUniforms.uWaterMask.value = texture;
  },
  undefined,
  () => {
    waterUniforms.uWaterMask.value = waterMaskFallback;
  }
);

const glow = new THREE.Mesh(
  new THREE.SphereGeometry(R + 0.105, 80, 48),
  new THREE.MeshBasicMaterial({
    color: 0x57b9ff,
    transparent: true,
    opacity: 0.055,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
glow.renderOrder = 2;
root.add(glow);

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
scene.add(new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0xb8d8f4, size: 0.035, transparent: true, opacity: 0.65 })
));

// Layer groups
const groups = {
  low: new THREE.Group(),
  mid: new THREE.Group(),
  high: new THREE.Group(),
  rain: new THREE.Group(),
  temperature: new THREE.Group(),
  wind: new THREE.Group()
};
Object.values(groups).forEach(group => root.add(group));

groups.low.renderOrder = 3;
groups.mid.renderOrder = 4;
groups.high.renderOrder = 5;
groups.rain.renderOrder = 6;

let data = [];
let interactiveMeshes = [];
let shellMaterials = {};
let totalVoxelInstances = 0;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = document.querySelector('#tip');

// === HELPERS ===
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function latLonVector(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function orientOut(object, position) {
  object.position.copy(position);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), position.clone().normalize());
}

function temperatureColor(temp) {
  return new THREE.Color().lerpColors(
    new THREE.Color(0x3a74e8),
    new THREE.Color(0xff5538),
    THREE.MathUtils.clamp((temp + 20) / 60, 0, 1)
  );
}

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      if (Array.isArray(object.material)) object.material.forEach(material => materials.add(material));
      else materials.add(object.material);
    }
  });
  group.clear();
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function wrappedLongitudeDistance(a, b) {
  const raw = Math.abs(a - b) % 360;
  return Math.min(raw, 360 - raw);
}

function interpolateWeather(lat, lon, samples) {
  const closest = [];
  const longitudeScale = Math.max(0.18, Math.cos(lat * Math.PI / 180));

  for (const sample of samples) {
    const dLat = (lat - sample.lat) / WEATHER_LAT_STEP;
    const dLon = wrappedLongitudeDistance(lon, sample.lon) * longitudeScale / WEATHER_LON_STEP;
    const distanceSquared = dLat * dLat + dLon * dLon;
    closest.push({ sample, distanceSquared });
  }

  closest.sort((a, b) => a.distanceSquared - b.distanceSquared);
  const selected = closest.slice(0, 4);
  const result = {
    lat,
    lon,
    temp: 0,
    cloud: 0,
    lowCloud: 0,
    midCloud: 0,
    highCloud: 0,
    humidity: 0,
    rain: 0,
    snowfall: 0,
    wind: 0,
    dirX: 0,
    dirY: 0,
    weatherCode: 0
  };
  let totalWeight = 0;

  for (const item of selected) {
    const weight = 1 / (item.distanceSquared + 0.035);
    const sample = item.sample;
    totalWeight += weight;
    result.temp += sample.temp * weight;
    result.cloud += sample.cloud * weight;
    result.lowCloud += sample.lowCloud * weight;
    result.midCloud += sample.midCloud * weight;
    result.highCloud += sample.highCloud * weight;
    result.humidity += sample.humidity * weight;
    result.rain += sample.rain * weight;
    result.snowfall += sample.snowfall * weight;
    result.wind += sample.wind * weight;
    const directionRadians = (sample.dir || 0) * Math.PI / 180;
    result.dirX += Math.cos(directionRadians) * weight;
    result.dirY += Math.sin(directionRadians) * weight;
    result.weatherCode += sample.weatherCode * weight;
  }

  for (const key of ['temp', 'cloud', 'lowCloud', 'midCloud', 'highCloud', 'humidity', 'rain', 'snowfall', 'wind', 'weatherCode']) {
    result[key] /= totalWeight;
  }
  result.dir = (Math.atan2(result.dirY, result.dirX) * 180 / Math.PI + 360) % 360;
  return result;
}

function fieldNoise(lat, lon, seed) {
  const a = Math.sin((lat * 1.73 + lon * 0.81 + seed * 31.7) * Math.PI / 180);
  const b = Math.cos((lat * 3.11 - lon * 1.29 + seed * 17.9) * Math.PI / 180);
  const c = Math.sin((lat * 5.37 + lon * 2.23 + seed * 11.3) * Math.PI / 180);
  return clamp01(0.5 + a * 0.24 + b * 0.17 + c * 0.09);
}

function weatherDensity(field, layer, noise) {
  const total = clamp01(field.cloud / 100);
  const humidity = clamp01(field.humidity / 100);
  const precipitation = clamp01((field.rain + field.snowfall * 0.35) / 4);
  let cover;
  let density;

  if (layer === 'low') {
    cover = clamp01(field.lowCloud / 100);
    density = cover * 0.72 + total * 0.10 + humidity * 0.18 + precipitation * 0.20;
  } else if (layer === 'mid') {
    cover = clamp01(field.midCloud / 100);
    density = cover * 0.80 + total * 0.14 + precipitation * 0.10;
  } else {
    cover = clamp01(field.highCloud / 100);
    density = cover * 0.84 + total * 0.12 + precipitation * 0.06;
  }

  density *= 0.78 + noise * 0.42;
  return clamp01(density);
}

function shellTint(config, density, precipitation) {
  const clear = new THREE.Color(config.clearColor);
  const cloudy = new THREE.Color(config.cloudColor);
  const storm = new THREE.Color(config.stormColor);
  const color = clear.lerp(cloudy, Math.pow(density, 0.72));
  if (precipitation > 0.12) color.lerp(storm, clamp01(precipitation * 0.55));
  return color;
}

function createShellMaterial(initialOpacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLayerOpacity: { value: initialOpacity },
      uLightDir: { value: sunDirection }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    vertexShader: `
      attribute float instanceOpacity;
      attribute vec3 instanceTint;
      varying float vOpacity;
      varying vec3 vTint;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 localPosition = instanceMatrix * vec4(position, 1.0);
        vec4 worldPosition = modelMatrix * localPosition;
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vOpacity = instanceOpacity;
        vTint = instanceTint;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uLayerOpacity;
      uniform vec3 uLightDir;
      varying float vOpacity;
      varying vec3 vTint;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(cameraPosition - vWorldPosition);
        float diffuse = max(dot(N, L), 0.0);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        vec3 color = vTint * (0.58 + diffuse * 0.58);
        color += vec3(0.32, 0.48, 0.68) * fresnel * 0.18;
        float alpha = clamp(vOpacity * uLayerOpacity * (0.84 + fresnel * 0.25), 0.0, 0.92);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function buildShell(layer, samples) {
  const config = SHELLS[layer];
  const cells = [];
  const latCenters = [];
  for (let lat = -90 + SHELL_STEP / 2; lat < 90; lat += SHELL_STEP) latCenters.push(lat);

  for (const lat of latCenters) {
    const circumferenceFactor = Math.max(0.12, Math.cos(lat * Math.PI / 180));
    const longitudeCount = Math.max(8, Math.round((360 / SHELL_STEP) * circumferenceFactor));
    const longitudeStep = 360 / longitudeCount;
    for (let index = 0; index < longitudeCount; index++) {
      cells.push({ lat, lon: -180 + longitudeStep * (index + 0.5), longitudeStep });
    }
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const opacityArray = new Float32Array(cells.length);
  const tintArray = new Float32Array(cells.length * 3);
  geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacityArray, 1));
  geometry.setAttribute('instanceTint', new THREE.InstancedBufferAttribute(tintArray, 3));

  const control = document.querySelector(`#${config.opacityControl}`);
  const material = createShellMaterial(control ? Number(control.value) : 0.8);
  shellMaterials[layer] = material;
  const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = layer === 'low' ? 3 : layer === 'mid' ? 4 : 5;

  const dummy = new THREE.Object3D();
  const localUp = new THREE.Vector3(0, 1, 0);
  const cellFields = [];
  const angularHeight = SHELL_STEP * Math.PI / 180;

  cells.forEach((cell, index) => {
    const field = interpolateWeather(cell.lat, cell.lon, samples);
    const noise = fieldNoise(cell.lat, cell.lon, layer === 'low' ? 1 : layer === 'mid' ? 2 : 3);
    const density = weatherDensity(field, layer, noise);
    const precipitation = clamp01((field.rain + field.snowfall * 0.35) / 4);
    const opacity = config.clearOpacity + Math.pow(density, 1.28) * config.cloudOpacity;
    const color = shellTint(config, density, precipitation);

    const billow = density * (0.016 + noise * 0.026);
    const radius = config.radius + billow;
    const position = latLonVector(cell.lat, cell.lon, radius);
    const angularWidth = cell.longitudeStep * Math.PI / 180;
    const tangentialWidth = radius * Math.max(0.12, Math.cos(cell.lat * Math.PI / 180)) * angularWidth * 1.025;
    const tangentialHeight = radius * angularHeight * 1.025;
    const radialThickness = config.thickness * (0.86 + density * 0.78 + noise * 0.14);

    dummy.position.copy(position);
    dummy.quaternion.setFromUnitVectors(localUp, position.clone().normalize());
    dummy.scale.set(tangentialWidth, radialThickness, tangentialHeight);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);

    opacityArray[index] = opacity;
    tintArray[index * 3] = color.r;
    tintArray[index * 3 + 1] = color.g;
    tintArray[index * 3 + 2] = color.b;
    cellFields.push({ ...field, layer, density, opacity });
  });

  mesh.instanceMatrix.needsUpdate = true;
  geometry.getAttribute('instanceOpacity').needsUpdate = true;
  geometry.getAttribute('instanceTint').needsUpdate = true;
  mesh.userData.cells = cellFields;
  mesh.userData.layer = layer;
  groups[layer].add(mesh);
  interactiveMeshes.push(mesh);
  totalVoxelInstances += cells.length;
}

// === BUILD WEATHER ===
function buildWeather(samples) {
  Object.values(groups).forEach(disposeGroup);
  interactiveMeshes = [];
  shellMaterials = {};
  totalVoxelInstances = 0;

  buildShell('low', samples);
  buildShell('mid', samples);
  buildShell('high', samples);

  const rainGeometry = new THREE.BoxGeometry(0.025, 0.13, 0.025);
  const rainMaterial = new THREE.MeshBasicMaterial({ color: 0x25b7ff, transparent: true, opacity: 0.76 });
  const windGeometry = new THREE.BoxGeometry(0.018, 0.018, 0.17);
  const windMaterial = new THREE.MeshBasicMaterial({ color: 0x43d8ff, transparent: true, opacity: 0.50 });

  for (const sample of samples) {
    const base = latLonVector(sample.lat, sample.lon, R + 0.055);
    const normal = base.clone().normalize();
    const height = 0.06 + THREE.MathUtils.clamp((sample.temp + 25) / 65, 0, 1) * 0.3;
    const color = temperatureColor(sample.temp);

    const temperatureMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, height, 0.078),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.38,
        transparent: true,
        opacity: 0.82
      })
    );
    orientOut(temperatureMesh, base.clone().add(normal.clone().multiplyScalar(height / 2)));
    temperatureMesh.userData = sample;
    groups.temperature.add(temperatureMesh);
    interactiveMeshes.push(temperatureMesh);
    totalVoxelInstances += 1;

    const wetness = sample.rain + sample.snowfall * 0.35;
    if (wetness > 0.025) {
      const rainCount = Math.min(9, 1 + Math.round(wetness * 2));
      for (let j = 0; j < rainCount; j++) {
        const precipitationMesh = new THREE.Mesh(rainGeometry, rainMaterial);
        const position = latLonVector(
          sample.lat + (Math.random() - 0.5) * 5,
          sample.lon + (Math.random() - 0.5) * 5,
          R + 0.09 + Math.random() * 0.12
        );
        orientOut(precipitationMesh, position);
        precipitationMesh.userData = { ...sample, phase: Math.random() * Math.PI * 2 };
        groups.rain.add(precipitationMesh);
        interactiveMeshes.push(precipitationMesh);
        totalVoxelInstances += 1;
      }
    }

    const windCount = Math.max(1, Math.min(4, Math.round(sample.wind / 23)));
    for (let j = 0; j < windCount; j++) {
      const windMesh = new THREE.Mesh(windGeometry, windMaterial);
      const offset = (j - 1.5) * 2.2;
      const position = latLonVector(sample.lat + offset, sample.lon + offset, R + 0.125);
      orientOut(windMesh, position);
      windMesh.rotateY((sample.dir || 0) * Math.PI / 180);
      windMesh.userData = { ...sample, phase: Math.random() * Math.PI * 2 };
      groups.wind.add(windMesh);
      interactiveMeshes.push(windMesh);
      totalVoxelInstances += 1;
    }
  }

  document.querySelector('#count').textContent = totalVoxelInstances.toLocaleString() + ' voxels';
}

// === FALLBACK ===
function fallbackData() {
  const samples = [];
  for (let lat = -60; lat <= 60; lat += WEATHER_LAT_STEP) {
    for (let lon = -180; lon < 180; lon += WEATHER_LON_STEP) {
      const wave = Math.sin((lon + lat) * 0.07) + Math.cos(lat * 0.11);
      const totalCloud = Math.max(0, Math.min(100, 48 + 42 * Math.sin((lon - lat) * 0.055)));
      samples.push({
        lat,
        lon,
        temp: 27 - Math.abs(lat) * 0.55 + wave * 5,
        cloud: totalCloud,
        lowCloud: clamp01((totalCloud / 100) * (0.82 + Math.sin(lon * 0.05) * 0.25)) * 100,
        midCloud: clamp01((totalCloud / 100) * (0.58 + Math.cos((lat + lon) * 0.04) * 0.28)) * 100,
        highCloud: clamp01((totalCloud / 100) * (0.48 + Math.sin(lat * 0.08) * 0.30)) * 100,
        humidity: Math.max(20, Math.min(98, 58 + totalCloud * 0.32 + wave * 6)),
        rain: Math.max(0, wave * 0.8),
        snowfall: Math.abs(lat) > 48 ? Math.max(0, wave * 0.12) : 0,
        wind: 12 + Math.abs(Math.sin(lon * 0.09)) * 55,
        dir: (lon * 2 + lat + 360) % 360,
        weatherCode: totalCloud > 80 ? 3 : totalCloud > 45 ? 2 : 1
      });
    }
  }
  return samples;
}

// === LOAD DATA ===
async function loadLiveWeather() {
  const points = [];
  for (let lat = -60; lat <= 60; lat += WEATHER_LAT_STEP) {
    for (let lon = -180; lon < 180; lon += WEATHER_LON_STEP) points.push([lat, lon]);
  }

  const variables = [
    'temperature_2m',
    'relative_humidity_2m',
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'precipitation',
    'snowfall',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m'
  ].join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${points.map(point => point[0]).join(',')}&longitude=${points.map(point => point[1]).join(',')}&current=${variables}&timezone=GMT`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather API ${response.status}`);
    const json = await response.json();
    const rows = Array.isArray(json) ? json : [json];
    data = rows.map((row, index) => ({
      // Use requested points so the interpolation grid stays regular.
      lat: points[index][0],
      lon: points[index][1],
      temp: row.current?.temperature_2m ?? 0,
      humidity: row.current?.relative_humidity_2m ?? 50,
      cloud: row.current?.cloud_cover ?? 0,
      lowCloud: row.current?.cloud_cover_low ?? row.current?.cloud_cover ?? 0,
      midCloud: row.current?.cloud_cover_mid ?? row.current?.cloud_cover ?? 0,
      highCloud: row.current?.cloud_cover_high ?? row.current?.cloud_cover ?? 0,
      rain: row.current?.precipitation ?? 0,
      snowfall: row.current?.snowfall ?? 0,
      weatherCode: row.current?.weather_code ?? 0,
      wind: row.current?.wind_speed_10m ?? 0,
      dir: row.current?.wind_direction_10m ?? 0
    }));
    document.querySelector('#notice').textContent = 'Live low, mid and high atmospheric fields loaded';
  } catch (error) {
    console.warn(error);
    data = fallbackData();
    document.querySelector('#notice').textContent = 'Live API unavailable — procedural atmosphere shown';
  }

  buildWeather(data);
  const average = key => data.reduce((sum, item) => sum + item[key], 0) / data.length;
  document.querySelector('#mt').textContent = average('temp').toFixed(1) + '°';
  document.querySelector('#mc').textContent = Math.round(average('cloud')) + '%';
  document.querySelector('#mw').textContent = Math.round(Math.max(...data.map(item => item.wind))) + ' km/h';
  document.querySelector('#mr').textContent = data.filter(item => item.rain > 0.05 || item.snowfall > 0.05).length;
  setTimeout(() => { document.querySelector('#notice').style.opacity = 0; }, 2500);
}

// === UI ===
function updateActiveCount() {
  const toggles = [...document.querySelectorAll('[data-layer]')];
  document.querySelector('#active').textContent = toggles.filter(element => element.checked).length + ' / ' + toggles.length;
}

document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => {
  groups[input.dataset.layer].visible = input.checked;
  updateActiveCount();
}));
updateActiveCount();

function bindRange(id, onInput) {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`[data-output="${id}"]`);
  if (!input) return;
  const update = () => {
    const value = Number(input.value);
    if (output) output.textContent = Math.round(value * 100) + '%';
    onInput(value);
  };
  input.addEventListener('input', update);
  update();
}

bindRange('lowOpacity', value => {
  if (shellMaterials.low) shellMaterials.low.uniforms.uLayerOpacity.value = value;
});
bindRange('midOpacity', value => {
  if (shellMaterials.mid) shellMaterials.mid.uniforms.uLayerOpacity.value = value;
});
bindRange('highOpacity', value => {
  if (shellMaterials.high) shellMaterials.high.uniforms.uLayerOpacity.value = value;
});
bindRange('waterOpacity', value => {
  waterUniforms.uWaterOpacity.value = value;
});
bindRange('waterReflectivity', value => {
  waterUniforms.uReflectivity.value = value;
});

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

document.querySelector('#range').addEventListener('input', event => {
  const value = Number(event.target.value);
  document.querySelector('#time').textContent = value === 0 ? 'NOW' : Math.abs(value) + 'H AGO';
  const fraction = (value + 24) / 24;
  groups.low.rotation.y = (1 - fraction) * 0.16;
  groups.mid.rotation.y = (1 - fraction) * 0.20;
  groups.high.rotation.y = (1 - fraction) * 0.24;
  groups.rain.rotation.y = (1 - fraction) * 0.25;
  groups.wind.rotation.y = (1 - fraction) * 0.3;
});

let pointerFrame = 0;
canvas.addEventListener('pointermove', event => {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    mouse.x = event.clientX / innerWidth * 2 - 1;
    mouse.y = -(event.clientY / innerHeight * 2 - 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
    let sample = null;
    let layer = '';

    if (hit?.object?.isInstancedMesh && Number.isInteger(hit.instanceId)) {
      sample = hit.object.userData.cells?.[hit.instanceId] || null;
      layer = hit.object.userData.layer || '';
    } else if (hit?.object?.userData?.lat !== undefined) {
      sample = hit.object.userData;
    }

    if (sample) {
      tip.style.display = 'block';
      tip.style.left = event.clientX + 12 + 'px';
      tip.style.top = event.clientY + 12 + 'px';
      const layerText = layer ? `${layer.toUpperCase()} · ` : '';
      tip.textContent = `${layerText}${sample.lat.toFixed(0)}°, ${sample.lon.toFixed(0)}° · ${sample.temp.toFixed(1)}°C · clouds ${sample.cloud.toFixed(0)}% · wind ${sample.wind.toFixed(0)} km/h`;
    } else {
      tip.style.display = 'none';
    }
  });
});
canvas.addEventListener('pointerleave', () => { tip.style.display = 'none'; });

// === ANIMATION ===
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  groups.rain.children.forEach(object => {
    if (object.userData.phase !== undefined) {
      object.scale.y = 0.62 + 0.38 * Math.sin(time * 5 + object.userData.phase);
    }
  });

  groups.wind.children.forEach(object => {
    if (object.userData.phase !== undefined) {
      object.material.opacity = 0.22 + 0.34 * (0.5 + 0.5 * Math.sin(time * 2 + object.userData.phase));
    }
  });

  // Different drift speeds keep the nested atmosphere legible.
  groups.low.rotation.y += 0.000035;
  groups.mid.rotation.y += 0.000022;
  groups.high.rotation.y += 0.000013;

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
