import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.157/build/three.module.js";

const DB_NAME = 'IndoorTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'positions';

let db;
let scene, camera, renderer;
let positions = [];
let isRecording = false;
let lastSavedPosition = null;
let lastSaveTime = 0;
let totalDistance = 0;

const SAVE_INTERVAL = 2000;
const MIN_DISTANCE = 0.3;

let positionMarkers = [];
let pathLine = null;
let currentPositionMarker = null;
let startPositionMarker = null;

let deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
let isGyroActive = false;

let moveSpeed = 0.05;
let keys = {};
let showDebug = false;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const loadBtn = document.getElementById('loadBtn');
const savedCountEl = document.getElementById('saved-count');
const totalDistanceEl = document.getElementById('total-distance');
const recordingStatusEl = document.getElementById('recording-status');
const currentPosEl = document.getElementById('current-pos');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const debugInfo = document.getElementById('debug-info');
const debugText = document.getElementById('debug-text');
const debugToggle = document.getElementById('debug-toggle');

async function initDB() {
  try {
    db = await idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('timestamp', 'timestamp');
          console.log('✓ IndexedDB store créé');
        }
      }
    });
    console.log('✓ IndexedDB initialisé');
    return true;
  } catch (error) {
    console.error('❌ Erreur IndexedDB:', error);
    alert('Erreur lors de l\'initialisation de la base de données');
    return false;
  }
}

async function savePositionToDB(x, y, z) {
  try {
    const position = {
      x: parseFloat(x.toFixed(3)),
      y: parseFloat(y.toFixed(3)),
      z: parseFloat(z.toFixed(3)),
      timestamp: Date.now()
    };
    const id = await db.add(STORE_NAME, position);
    console.log('✓ Position sauvegardée ID:', id, position);
    return { ...position, id };
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    return null;
  }
}

async function loadAllPositions() {
  try {
    const allPositions = await db.getAll(STORE_NAME);
    console.log(`✓ ${allPositions.length} positions chargées de la DB`);
    return allPositions;
  } catch (error) {
    console.error('❌ Erreur chargement:', error);
    return [];
  }
}

async function clearAllPositions() {
  try {
    await db.clear(STORE_NAME);
    console.log('✓ Toutes les positions effacées de la DB');
    return true;
  } catch (error) {
    console.error('❌ Erreur effacement:', error);
    return false;
  }
}

function showStatus(text) {
  statusText.textContent = text;
  statusDiv.classList.add('show');
}

function hideStatus() {
  statusDiv.classList.remove('show');
}

function updateDebugInfo() {
  if (!showDebug) return;
  
  const pos = camera.position;
  const debugContent = `
Position: (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})
Enregistrement: ${isRecording ? 'ACTIF' : 'INACTIF'}
Positions sauvegardées: ${positions.length}
Dernière sauvegarde: ${lastSaveTime ? new Date(lastSaveTime).toLocaleTimeString() : 'Jamais'}
Distance totale: ${totalDistance.toFixed(2)}m
Dernière distance: ${lastSavedPosition ? 
          Math.sqrt(
            Math.pow(pos.x - lastSavedPosition.x, 2) +
            Math.pow(pos.y - lastSavedPosition.y, 2) +
            Math.pow(pos.z - lastSavedPosition.z, 2)
          ).toFixed(2) : '0.00'}m
      `;
  debugText.textContent = debugContent;
}

async function init() {
  console.log('🚀 Initialisation de l\'application...');
  showStatus('Initialisation...');

  const dbReady = await initDB();
  if (!dbReady) {
    hideStatus();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    video.srcObject = stream;
    console.log('✓ Caméra activée');
  } catch (err) {
    console.warn("Caméra non accessible (mode test activé):", err.message);
  }

  scene = new THREE.Scene();
  
  camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight, 
    0.01, 
    100
  );
  camera.position.set(0, 1.6, 0);

  renderer = new THREE.WebGLRenderer({ 
    canvas: canvas,
    alpha: true,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 2, 1);
  scene.add(directionalLight);

  const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
  scene.add(gridHelper);

  // Créer le point de départ central
  createStartPositionMarker();
  
  // Créer le marqueur de position actuelle
  createCurrentPositionMarker();

  await loadSavedPath();

  setupControls();
  setupKeyboardControls();
  setupTouchControls();
  requestDeviceOrientation();

  window.addEventListener("resize", onResize);
  
  hideStatus();
  console.log('✓ Initialisation terminée');
  animate();
}

function createStartPositionMarker() {
  // Point de départ central - plus visible
  const geometry = new THREE.SphereGeometry(0.08, 16, 16);
  const material = new THREE.MeshPhongMaterial({ 
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 0.7
  });
  startPositionMarker = new THREE.Mesh(geometry, material);
  startPositionMarker.position.set(0, 0, 0);
  scene.add(startPositionMarker);
  
  // Ajouter un anneau autour du point de départ
  const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffff00, 
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.01, 0);
  scene.add(ring);
  
  console.log('✓ Point de départ créé au centre (0,0,0)');
}

function createCurrentPositionMarker() {
  // Marqueur de position actuelle plus petit
  const geometry = new THREE.SphereGeometry(0.04, 12, 12);
  const material = new THREE.MeshPhongMaterial({ 
    color: 0xff4444,
    emissive: 0xff4444,
    emissiveIntensity: 0.5
  });
  currentPositionMarker = new THREE.Mesh(geometry, material);
  scene.add(currentPositionMarker);
}

async function loadSavedPath() {
  showStatus('Chargement du chemin sauvegardé...');
  
  positions = await loadAllPositions();
  
  if (positions.length > 0) {
    console.log(`📂 Restauration de ${positions.length} positions...`);
    positions.forEach(pos => {
      createPositionMarker(pos.x, pos.y, pos.z, false);
    });
    
    drawPath();
    calculateTotalDistance();
    updateStats();
    
    console.log(`✓ ${positions.length} positions restaurées avec succès`);
  } else {
    console.log('ℹ️ Aucune position sauvegardée dans la DB');
  }
}

function createPositionMarker(x, y, z, isNew = true) {
  // Balles plus petites et équilibrées
  const geometry = new THREE.SphereGeometry(0.06, 12, 12);
  const material = new THREE.MeshPhongMaterial({ 
    color: isNew ? 0x00ff00 : 0x0088ff,
    emissive: isNew ? 0x00ff00 : 0x0088ff,
    emissiveIntensity: 0.5
  });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(x, y, z);
  scene.add(sphere);
  positionMarkers.push(sphere);
  console.log(`🔵 Marqueur créé à (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
  return sphere;
}

function drawPath() {
  if (pathLine) {
    scene.remove(pathLine);
  }
  
  if (positions.length < 2) return;
  
  const points = positions.map(p => new THREE.Vector3(p.x, p.y, p.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ 
    color: 0xffffff,
    linewidth: 2
  });
  pathLine = new THREE.Line(geometry, material);
  scene.add(pathLine);
  console.log(`📏 Path dessiné avec ${points.length} points`);
}

function calculateTotalDistance() {
  totalDistance = 0;
  for (let i = 1; i < positions.length; i++) {
    const p1 = positions[i - 1];
    const p2 = positions[i];
    const dist = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) +
      Math.pow(p2.y - p1.y, 2) +
      Math.pow(p2.z - p1.z, 2)
    );
    totalDistance += dist;
  }
}

function updateStats() {
  savedCountEl.textContent = positions.length;
  totalDistanceEl.textContent = totalDistance.toFixed(1) + ' m';
  recordingStatusEl.textContent = isRecording ? '🔴 REC' : 'Pause';
  recordingStatusEl.style.color = isRecording ? '#ff4444' : '#00ff88';
  console.log(`📊 Stats: ${positions.length} positions, ${totalDistance.toFixed(1)}m`);
}

async function checkAndSavePosition() {
  if (!isRecording) return;

  const now = Date.now();
  if (now - lastSaveTime < SAVE_INTERVAL) return;

  const currentPos = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z
  };

  let shouldSave = false;
  let distance = 0;

  if (lastSavedPosition) {
    distance = Math.sqrt(
      Math.pow(currentPos.x - lastSavedPosition.x, 2) +
      Math.pow(currentPos.y - lastSavedPosition.y, 2) +
      Math.pow(currentPos.z - lastSavedPosition.z, 2)
    );

    if (distance < MIN_DISTANCE) {
      console.log(`⏭️ Distance trop faible: ${distance.toFixed(2)}m < ${MIN_DISTANCE}m`);
      return;
    }
    
    shouldSave = true;
    totalDistance += distance;
  } else {
    shouldSave = true;
  }

  if (shouldSave) {
    console.log(`💾 Tentative de sauvegarde: distance=${distance.toFixed(2)}m`);
    const saved = await savePositionToDB(currentPos.x, currentPos.y, currentPos.z);
    
    if (saved) {
      positions.push(saved);
      createPositionMarker(saved.x, saved.y, saved.z, true);
      drawPath();
      updateStats();
      lastSavedPosition = currentPos;
      lastSaveTime = now;
      console.log(`✅ Position #${positions.length} sauvegardée !`);
    } else {
      console.error('❌ Échec de sauvegarde');
    }
  }
}

function setupControls() {
  startBtn.addEventListener('click', () => {
    isRecording = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    startBtn.classList.add('recording');
    lastSaveTime = 0;
    updateStats();
    console.log('🔴 Enregistrement DÉMARRÉ');
  });

  stopBtn.addEventListener('click', () => {
    isRecording = false;
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    startBtn.classList.remove('recording');
    updateStats();
    console.log('⏸️ Enregistrement ARRÊTÉ');
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Effacer toutes les positions sauvegardées ?')) return;
    
    showStatus('Effacement en cours...');
    
    const success = await clearAllPositions();
    
    if (success) {
      positionMarkers.forEach(marker => scene.remove(marker));
      positionMarkers = [];
      
      if (pathLine) {
        scene.remove(pathLine);
        pathLine = null;
      }
      
      positions = [];
      totalDistance = 0;
      lastSavedPosition = null;
      updateStats();
      
      console.log('🗑️ Tout effacé avec succès');
    }
    
    hideStatus();
  });

  loadBtn.addEventListener('click', async () => {
    showStatus('Rechargement...');
    
    positionMarkers.forEach(marker => scene.remove(marker));
    positionMarkers = [];
    if (pathLine) scene.remove(pathLine);
    
    positions = [];
    totalDistance = 0;
    
    await loadSavedPath();
    
    hideStatus();
    console.log('🔄 Rechargement terminé');
  });

  debugToggle.addEventListener('click', () => {
    showDebug = !showDebug;
    debugInfo.style.display = showDebug ? 'block' : 'none';
    debugToggle.textContent = showDebug ? 'Cacher Debug' : 'Debug';
  });
}

function setupKeyboardControls() {
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
  });
  
  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
}

function setupTouchControls() {
  let touchStartX = 0;
  let touchStartY = 0;
  
  canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });
  
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;
    
    camera.position.x += deltaX * 0.001;
    camera.position.z += deltaY * 0.001;
    
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });
}

function updateCameraMovement() {
  if (keys['ArrowUp'] || keys['w'] || keys['W']) {
    camera.position.z -= moveSpeed;
  }
  if (keys['ArrowDown'] || keys['s'] || keys['S']) {
    camera.position.z += moveSpeed;
  }
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
    camera.position.x -= moveSpeed;
  }
  if (keys['ArrowRight'] || keys['d'] || keys['D']) {
    camera.position.x += moveSpeed;
  }
  if (keys[' ']) {
    camera.position.y += moveSpeed;
  }
  if (keys['Shift']) {
    camera.position.y -= moveSpeed;
  }
}

function requestDeviceOrientation() {
  if (typeof DeviceOrientationEvent !== 'undefined' && 
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          isGyroActive = true;
          console.log('✓ Gyroscope activé');
        }
      })
      .catch(console.error);
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
    isGyroActive = true;
    console.log('✓ Gyroscope activé');
  }
}

function handleOrientation(event) {
  if (event.alpha !== null) {
    deviceOrientation.alpha = event.alpha;
    deviceOrientation.beta = event.beta;
    deviceOrientation.gamma = event.gamma;
  }
}

function updateCameraFromGyro() {
  if (!isGyroActive) return;
  const alpha = THREE.MathUtils.degToRad(deviceOrientation.alpha || 0);
  const beta = THREE.MathUtils.degToRad(deviceOrientation.beta || 0);
  const gamma = THREE.MathUtils.degToRad(deviceOrientation.gamma || 0);
  camera.rotation.set(beta - Math.PI / 2, alpha, -gamma, 'YXZ');
}

function updateCurrentPosition() {
  const pos = camera.position;
  currentPosEl.textContent = 
    `Position: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
  
  // Mettre à jour la position du marqueur actuel
  if (currentPositionMarker) {
    currentPositionMarker.position.set(pos.x, pos.y, pos.z);
  }
}

let lastTime = 0;
function animate(time = 0) {
  requestAnimationFrame(animate);
  const deltaTime = (time - lastTime) / 1000;
  lastTime = time;
  
  updateCameraMovement();
  updateCameraFromGyro();
  updateCurrentPosition();
  checkAndSavePosition();
  updateDebugInfo();
  
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();