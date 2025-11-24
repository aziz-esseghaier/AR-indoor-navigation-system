import './style.css'
import * as THREE from 'three'

const API_URL = '/api/positions';

let camera, scene, renderer;
let xrSession = null;
let cubes = []; // Array to store all cubes
let referenceAnchor = null; // Store reference position for calibration
let xrHitTestSource = null;
let xrReferenceSpace = null;
let originMarker = null; // Visual marker at world origin
let showNearestEnabled = false; // Track if nearest cube highlighting is enabled

init();

function init() {
  // Initialize AR session directly
  initARSession();
}

function initARSession() {
  // Initialize WebXR polyfill for better iOS support
  if (window.WebXRPolyfill) {
    const polyfill = new WebXRPolyfill();
  }

  // Create scene
  scene = new THREE.Scene();

  // Create camera
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Add lighting for better cube visibility
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // Setup AR button
  const button = document.getElementById('ar-button');
  
  // Check for WebXR support
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      if (supported) {
        button.style.display = 'block';
        button.addEventListener('click', onButtonClick);
      } else {
        button.textContent = 'AR not supported on this device';
        button.style.backgroundColor = '#aa0000';
      }
    }).catch((err) => {
      console.error('Error checking AR support:', err);
      button.textContent = 'Error checking AR support';
      button.style.backgroundColor = '#aa0000';
    });
  } else {
    button.textContent = 'WebXR not available';
    button.style.backgroundColor = '#aa0000';
  }

  // Setup Add Cube button
  const addCubeButton = document.getElementById('add-cube-button');
  addCubeButton.addEventListener('click', onAddCubeClick);

  // Setup Remove Cube button
  const removeCubeButton = document.getElementById('remove-cube-button');
  removeCubeButton.addEventListener('click', onRemoveCubeClick);

  // Setup Calibrate button
  const calibrateButton = document.getElementById('calibrate-button');
  calibrateButton.addEventListener('click', onCalibrateClick);

  // Setup Store Points button
  const storePointsButton = document.getElementById('store-points-button');
  storePointsButton.addEventListener('click', onStorePointsClick);

  // Setup Show Nearest button
  const showNearestButton = document.getElementById('show-nearest-button');
  showNearestButton.addEventListener('click', () => {
    showNearestEnabled = !showNearestEnabled;
    if (showNearestEnabled) {
      showNearestButton.textContent = 'Hide Nearest';
      showNearestButton.classList.add('active');
    } else {
      showNearestButton.textContent = 'Show Nearest';
      showNearestButton.classList.remove('active');
      // Reset all cubes to default green color
      cubes.forEach(cube => {
        cube.material.color.setHex(0x00ff88);
        cube.material.emissive.setHex(0x004400);
      });
    }
  });

  // Setup Stop AR button
  const stopArButton = document.getElementById('stop-ar-button');
  stopArButton.addEventListener('click', () => {
    if (xrSession) {
      xrSession.end();
    }
  });

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Start animation loop
  renderer.setAnimationLoop(render);
}

async function onButtonClick() {
  const button = document.getElementById('ar-button');
  
  if (xrSession === null) {
    // Hide welcome screen when starting AR
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.classList.add('hidden');
    }
    
    // Start AR session
    try {
      // Request session with hit-test for better tracking
      const sessionInit = {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'dom-overlay', 'hit-test'],
        domOverlay: { root: document.getElementById('overlay') }
      };
      
      xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
      console.log('AR session started');
      onSessionStarted(xrSession);
    } catch (err) {
      console.error('Failed to start AR session:', err);
      button.textContent = 'Failed to start AR';
      setTimeout(() => {
        button.textContent = 'Start AR';
      }, 2000);
    }
  } else {
    // End AR session
    xrSession.end();
  }
}

function onSessionStarted(session) {
  xrSession.addEventListener('end', onSessionEnded);
  renderer.xr.setSession(session);
  
  // Get reference space for hit testing
  session.requestReferenceSpace('viewer').then((refSpace) => {
    xrReferenceSpace = refSpace;
    // Request hit test source for plane detection
    session.requestHitTestSource({ space: refSpace }).then((source) => {
      xrHitTestSource = source;
    }).catch(err => {
      console.log('Hit test not available:', err);
    });
  });
  
  const button = document.getElementById('ar-button');
  button.textContent = 'Stop AR';
  
  // Show Add Cube button when AR session starts
  const addCubeButton = document.getElementById('add-cube-button');
  addCubeButton.style.display = 'block';
  
  // Show Calibrate button when AR session starts
  const calibrateButton = document.getElementById('calibrate-button');
  calibrateButton.style.display = 'block';
  
  // Show Remove Cube button when AR session starts
  const removeCubeButton = document.getElementById('remove-cube-button');
  removeCubeButton.style.display = 'block';
  
  // Show Store Points button when AR session starts
  const storePointsButton = document.getElementById('store-points-button');
  storePointsButton.style.display = 'block';
  
  // Show Show Nearest button when AR session starts
  const showNearestButton = document.getElementById('show-nearest-button');
  showNearestButton.style.display = 'block';
  
  // Show Stop AR button when AR session starts
  const stopArButton = document.getElementById('stop-ar-button');
  stopArButton.style.display = 'block';
  
  // Show message to calibrate first
  updateCalibrationStatus(false);
}

function onSessionEnded() {
  xrSession = null;
  xrHitTestSource = null;
  xrReferenceSpace = null;
  
  const button = document.getElementById('ar-button');
  button.textContent = 'Start AR';
  
  // Show welcome screen again when AR session ends
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.remove('hidden');
  }
  
  // Hide Add Cube button when AR session ends
  const addCubeButton = document.getElementById('add-cube-button');
  addCubeButton.style.display = 'none';
  
  // Hide Calibrate button when AR session ends
  const calibrateButton = document.getElementById('calibrate-button');
  calibrateButton.style.display = 'none';
  
  // Hide Remove Cube button when AR session ends
  const removeCubeButton = document.getElementById('remove-cube-button');
  removeCubeButton.style.display = 'none';
  
  // Hide Store Points button when AR session ends
  const storePointsButton = document.getElementById('store-points-button');
  storePointsButton.style.display = 'none';
  
  // Hide Show Nearest button when AR session ends
  const showNearestButton = document.getElementById('show-nearest-button');
  showNearestButton.style.display = 'none';
  showNearestEnabled = false;
  showNearestButton.textContent = 'Show Nearest';
  showNearestButton.classList.remove('active');
  
  // Hide Stop AR button when AR session ends
  const stopArButton = document.getElementById('stop-ar-button');
  stopArButton.style.display = 'none';
  
  // Hide calibration status
  const calibrationStatus = document.getElementById('calibration-status');
  calibrationStatus.style.display = 'none';
}

function onAddCubeClick() {
  if (!xrSession) return;
  
  // Create a new cube at the camera (phone) position
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ff88,
    metalness: 0.5,
    roughness: 0.3,
    emissive: 0x004400,
    emissiveIntensity: 0.3
  });
  const newCube = new THREE.Mesh(geometry, material);
  
  // Get the XR camera position and rotation
  const xrCamera = renderer.xr.getCamera();
  const cameraPosition = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  xrCamera.getWorldPosition(cameraPosition);
  xrCamera.getWorldQuaternion(cameraQuaternion);
  
  // Position cube 1 meter in front of the camera in world space
  const offset = new THREE.Vector3(0, 0, -1);
  offset.applyQuaternion(cameraQuaternion);
  
  // Set absolute world position
  newCube.position.copy(cameraPosition).add(offset);
  
  // Important: Set matrixAutoUpdate to true to ensure proper world-space positioning
  newCube.matrixAutoUpdate = true;
  newCube.updateMatrix();
  
  // Assign the first available ID
  newCube.userData.cubeId = getNextAvailableId();
  
  scene.add(newCube);
  cubes.push(newCube);
  
  console.log('Cube added at position:', newCube.position.toArray(), 'with ID:', newCube.userData.cubeId);
}

// Function to find the first available cube ID
function getNextAvailableId() {
  // Get all existing IDs from cubes array
  const existingIds = cubes
    .map(cube => cube.userData.cubeId)
    .filter(id => id !== undefined)
    .map(id => parseInt(id))
    .sort((a, b) => a - b);
  
  // Find first gap in the sequence
  for (let i = 0; i < existingIds.length; i++) {
    if (existingIds[i] !== i) {
      return i;
    }
  }
  
  // No gaps found, return next sequential number
  return existingIds.length > 0 ? existingIds.length : 0;
}

function onRemoveCubeClick() {
  if (!xrSession) return;
  
  // Check if there are any cubes to remove
  if (cubes.length === 0) {
    console.log('No cubes to remove');
    return;
  }
  
  // Get the last cube from the array
  const lastCube = cubes.pop();
  
  // Get the cube ID before removing
  const cubeId = `cube_${lastCube.userData.cubeId}`;
  
  // Remove it from the scene
  scene.remove(lastCube);
  
  // Dispose of geometry and material to free up memory
  lastCube.geometry.dispose();
  lastCube.material.dispose();
  
  console.log('Cube removed:', cubeId, 'Remaining cubes:', cubes.length);
  
  // Remove from server-side files (graph adjacency and room mapping)
  removeCubeFromServer(cubeId);
}

async function removeCubeFromServer(nodeId) {
  try {
    // Load graph adjacency list
    const graphResponse = await fetch('/api/graph');
    let adjacencyList = {};
    if (graphResponse.ok) {
      const graphData = await graphResponse.json();
      adjacencyList = graphData.adjacencyList || {};
    }
    
    // Remove node's own adjacency list
    if (adjacencyList[nodeId]) {
      delete adjacencyList[nodeId];
    }
    
    // Remove node from other nodes' adjacency lists
    for (const node in adjacencyList) {
      adjacencyList[node] = adjacencyList[node].filter(edge => {
        const neighbor = edge.node || edge;
        return neighbor !== nodeId;
      });
      
      // Clean up empty adjacency lists
      if (adjacencyList[node].length === 0) {
        delete adjacencyList[node];
      }
    }
    
    // Save updated graph
    await fetch('/api/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjacencyList })
    });
    
    // Load and update room mappings
    const roomsResponse = await fetch('/api/rooms');
    let roomMapping = {};
    if (roomsResponse.ok) {
      const roomsData = await roomsResponse.json();
      roomMapping = roomsData.roomMapping || {};
    }
    
    // Remove from room mapping
    if (roomMapping[nodeId]) {
      delete roomMapping[nodeId];
      
      // Save updated room mappings
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomMapping })
      });
    }
    
    console.log(`Removed ${nodeId} from graph and room mappings`);
  } catch (error) {
    console.error('Error removing cube from server:', error);
  }
}

function onCalibrateClick() {
  if (!xrSession) return;
  
  // Use a fixed origin point instead of camera position
  // This creates a stable reference that won't drift between sessions
  const fixedOrigin = new THREE.Vector3(0, 0, 0);
  const fixedOrientation = new THREE.Quaternion(0, 0, 0, 1);
  
  // Store reference anchor at world origin
  referenceAnchor = {
    position: {
      x: fixedOrigin.x,
      y: fixedOrigin.y,
      z: fixedOrigin.z
    },
    orientation: {
      x: fixedOrientation.x,
      y: fixedOrientation.y,
      z: fixedOrientation.z,
      w: fixedOrientation.w
    }
  };
  
  console.log('Reference position calibrated at world origin:', referenceAnchor.position);
  console.log('Reference orientation:', referenceAnchor.orientation);
  
  // Update status
  updateCalibrationStatus(true);
  
  // Load saved cube positions after a short delay to ensure AR is stable
  setTimeout(() => {
    loadCubePositions();
  }, 1000);
}

function onStorePointsClick() {
  if (!xrSession) return;
  
  // Save cube positions to server
  saveCubePositions();
}

async function saveCubePositions() {
  if (!referenceAnchor) {
    alert('Please calibrate reference position first!\n\nClick "Calibrate Position" to set the world origin.');
    return;
  }
  
  // Save positions relative to world origin (not camera position)
  const cubeData = cubes.map((cube) => {
    const cubeId = cube.userData.cubeId !== undefined ? cube.userData.cubeId : 0;
    return {
      id: `cube_${cubeId}`,
      worldPosition: {
        x: cube.position.x,
        y: cube.position.y,
        z: cube.position.z
      },
      offsetFromQR: {
        x: cube.position.x,
        y: cube.position.y,
        z: cube.position.z
      },
      rotation: {
        x: cube.rotation.x,
        y: cube.rotation.y,
        z: cube.rotation.z
      }
    };
  });
  
  const dataToStore = {
    timestamp: new Date().toISOString(),
    cubeCount: cubes.length,
    referenceAnchor: referenceAnchor,
    cubes: cubeData
  };
  
  try {
    // Save to server
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToStore)
    });
    
    if (response.ok) {
      console.log('Cube positions saved to server:', dataToStore);
      alert(`Saved ${cubes.length} cube positions to server!`);
    } else {
      throw new Error('Failed to save positions');
    }
  } catch (error) {
    console.error('Error saving cube positions:', error);
    alert('Failed to save positions to server');
  }
}

async function loadCubePositions() {
  try {
    // Load from server
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error('Failed to load positions');
    }
    
    const data = await response.json();
    console.log('Loading cube positions:', data);
    
    if (!data.cubes || data.cubes.length === 0) {
      console.log('No cubes to load');
      return;
    }
    
    // Check if calibration is needed
    if (!referenceAnchor) {
      console.log('Reference position not calibrated yet. Please calibrate first.');
      return;
    }
    
    // Clear existing cubes first
    cubes.forEach(cube => {
      scene.remove(cube);
      cube.geometry.dispose();
      cube.material.dispose();
    });
    cubes = [];
    
    // Recreate cubes at their saved world positions
    data.cubes.forEach(cubeData => {
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff88,
        metalness: 0.5,
        roughness: 0.3,
        emissive: 0x004400,
        emissiveIntensity: 0.3
      });
      const cube = new THREE.Mesh(geometry, material);
      
      // Extract and store the cube ID from the saved data
      const cubeIdMatch = cubeData.id.match(/cube_(\d+)/);
      if (cubeIdMatch) {
        cube.userData.cubeId = parseInt(cubeIdMatch[1]);
      }
      
      // Use stored world position directly (since we're now using world origin as reference)
      cube.position.set(
        cubeData.worldPosition.x,
        cubeData.worldPosition.y,
        cubeData.worldPosition.z
      );
      
      // Set rotation from stored data
      cube.rotation.set(
        cubeData.rotation.x,
        cubeData.rotation.y,
        cubeData.rotation.z
      );
      
      cube.matrixAutoUpdate = true;
      cube.updateMatrix();
      
      scene.add(cube);
      cubes.push(cube);
    });
    
    console.log(`Loaded ${cubes.length} cubes with calibration`);
    if (cubes.length > 0) {
      alert(`Loaded ${cubes.length} saved cube positions!`);
    }
  } catch (error) {
    console.error('Error loading cube positions:', error);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function render(timestamp, frame) {
  // Rotate all cubes for a nice floating effect
  cubes.forEach(cube => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
  });

  // Highlight nearest cube if enabled and in XR session
  if (showNearestEnabled && xrSession && cubes.length > 0) {
    const xrCamera = renderer.xr.getCamera();
    const cameraPosition = new THREE.Vector3();
    xrCamera.getWorldPosition(cameraPosition);

    let nearestCube = null;
    let minDistance = Infinity;

    // Find the nearest cube
    cubes.forEach(cube => {
      const cubePosition = new THREE.Vector3();
      cube.getWorldPosition(cubePosition);
      const distance = cameraPosition.distanceTo(cubePosition);

      if (distance < minDistance) {
        minDistance = distance;
        nearestCube = cube;
      }
    });

    // Update colors: nearest cube = red, others = green
    cubes.forEach(cube => {
      if (cube === nearestCube) {
        cube.material.color.setHex(0xff0000); // Red for nearest
        cube.material.emissive.setHex(0x660000);
      } else {
        cube.material.color.setHex(0x00ff88); // Green for others
        cube.material.emissive.setHex(0x004400);
      }
    });
  }

  renderer.render(scene, camera);
}

function updateCalibrationStatus(isCalibrated) {
  const calibrationStatus = document.getElementById('calibration-status');
  if (isCalibrated && referenceAnchor) {
    calibrationStatus.textContent = 'World Origin Set - Positions Locked';
    calibrationStatus.className = 'active';
  } else {
    calibrationStatus.textContent = 'Click Calibrate to Initialize';
    calibrationStatus.className = 'inactive';
  }
}
