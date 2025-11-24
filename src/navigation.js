import * as THREE from 'three';

const API_URL = '/api/positions';
const ROOMS_API_URL = '/api/rooms';
const GRAPH_API_URL = '/api/graph';

let camera, scene, renderer;
let xrSession = null;
let cubes = []; // Array to store all cubes
let referenceAnchor = null; // Store reference position for calibration
let xrHitTestSource = null;
let xrReferenceSpace = null;
let originMarker = null; // Visual marker at world origin
let selectedDestination = null; // Selected room destination
let destinationNodeId = null; // Node ID mapped to selected room
let showNearestEnabled = false; // Track if nearest cube highlighting is enabled
let navigationActive = false; // Track if navigation is active
let nearestNodeId = null; // Store nearest node ID for navigation
let adjacencyList = {}; // Graph adjacency list
let cubePositions = {}; // Cube positions for pathfinding
let pathLines = []; // Store path visualization objects

init();

function init() {
  // Initialize WebXR polyfill for better iOS support
  if (window.WebXRPolyfill) {
    const polyfill = new WebXRPolyfill();
  }

  // Setup Three.js scene
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Add lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // Setup Start AR button
  const startArButton = document.getElementById('start-ar-button');
  
  // Check for WebXR support
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      if (supported) {
        startArButton.addEventListener('click', onStartARClick);
      } else {
        startArButton.textContent = 'AR not supported on this device';
        startArButton.style.backgroundColor = '#aa0000';
      }
    }).catch((err) => {
      console.error('Error checking AR support:', err);
      startArButton.textContent = 'Error checking AR support';
      startArButton.style.backgroundColor = '#aa0000';
    });
  } else {
    startArButton.textContent = 'WebXR not available';
    startArButton.style.backgroundColor = '#aa0000';
  }

  // Setup Calibrate button
  const calibrateButton = document.getElementById('calibrate-button');
  calibrateButton.addEventListener('click', onCalibrateClick);

  // Setup Start Navigation button
  const startNavButton = document.getElementById('start-navigation-button');
  startNavButton.addEventListener('click', onStartNavigationClick);

  // Setup Stop AR button
  const stopArButton = document.getElementById('stop-ar-button');
  stopArButton.addEventListener('click', () => {
    if (xrSession) {
      xrSession.end();
    }
  });

  // Handle window resize
  window.addEventListener('resize', onWindowResize);

  // Load available rooms
  loadRoomMappings();

  // Start animation loop
  renderer.setAnimationLoop(render);
}

async function onStartARClick() {
  if (xrSession) {
    // Already in AR, stop it
    xrSession.end();
    return;
  }

  // Check if destination is selected
  const destinationSelect = document.getElementById('destination-room');
  selectedDestination = destinationSelect.value;
  
  if (!selectedDestination) {
    alert('Please select a destination room first');
    return;
  }

  try {
    // Request AR session with same settings as main.js
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'dom-overlay', 'hit-test'],
      domOverlay: { root: document.getElementById('overlay') }
    });

    await renderer.xr.setSession(xrSession);
    
    // Get reference space for hit testing
    xrReferenceSpace = await xrSession.requestReferenceSpace('viewer');
    
    // Request hit test source
    xrSession.requestHitTestSource({ space: xrReferenceSpace }).then((hitTestSource) => {
      xrHitTestSource = hitTestSource;
    });
    
    xrSession.addEventListener('end', onSessionEnded);
    
    // Hide welcome screen
    const welcomeScreen = document.getElementById('welcome-screen');
    welcomeScreen.classList.add('hidden');
    
    // Update button
    const startArButton = document.getElementById('start-ar-button');
    startArButton.textContent = 'Stop AR';
    
    // Show Calibrate button
    const calibrateButton = document.getElementById('calibrate-button');
    calibrateButton.style.display = 'block';
    
    // Show Start Navigation button
    const startNavButton = document.getElementById('start-navigation-button');
    startNavButton.style.display = 'block';
    
    // Show Stop AR button
    const stopArButton = document.getElementById('stop-ar-button');
    stopArButton.style.display = 'block';
    
    // Show calibration status
    updateCalibrationStatus(false);
    
    console.log('AR session started successfully');
  } catch (error) {
    console.error('Error starting AR session:', error);
    alert('Could not start AR session: ' + error.message);
  }
}

function onSessionEnded() {
  xrSession = null;
  xrHitTestSource = null;
  xrReferenceSpace = null;
  
  // Show welcome screen
  const welcomeScreen = document.getElementById('welcome-screen');
  welcomeScreen.classList.remove('hidden');
  
  // Update button
  const startArButton = document.getElementById('start-ar-button');
  startArButton.textContent = 'Start AR';
  
  // Hide Calibrate button
  const calibrateButton = document.getElementById('calibrate-button');
  calibrateButton.style.display = 'none';
  
  // Hide Start Navigation button
  const startNavButton = document.getElementById('start-navigation-button');
  startNavButton.style.display = 'none';
  navigationActive = false;
  startNavButton.textContent = 'Start Navigation';
  startNavButton.classList.remove('active');
  
  // Hide Stop AR button
  const stopArButton = document.getElementById('stop-ar-button');
  stopArButton.style.display = 'none';
  
  // Hide calibration status
  const calibrationStatus = document.getElementById('calibration-status');
  calibrationStatus.style.display = 'none';
  
  console.log('AR session ended');
}

async function loadCubePositions() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      console.log('No saved positions found or error loading');
      return;
    }
    
    const data = await response.json();
    
    if (!data.cubes || data.cubes.length === 0) {
      console.log('No cubes to load');
      return;
    }
    
    // Clear existing cubes
    cubes.forEach(cube => scene.remove(cube));
    cubes = [];
    
    // Set reference anchor from saved data
    if (data.referenceAnchor) {
      referenceAnchor = new THREE.Vector3(
        data.referenceAnchor.x,
        data.referenceAnchor.y,
        data.referenceAnchor.z
      );
      
      // Create origin marker
      const originGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const originMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
      });
      originMarker = new THREE.Mesh(originGeometry, originMaterial);
      originMarker.position.copy(referenceAnchor);
      scene.add(originMarker);
    }
    
    // Recreate cubes from saved positions
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
      
      // Use world position directly
      cube.position.set(
        cubeData.worldPosition.x,
        cubeData.worldPosition.y,
        cubeData.worldPosition.z
      );
      
      // Store the cube ID
      cube.userData.cubeId = cubeData.id;
      
      scene.add(cube);
      cubes.push(cube);
    });
    
    console.log(`Loaded ${cubes.length} cubes from server`);
  } catch (error) {
    console.error('Error loading cube positions:', error);
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
  
  // Load the destination cube and graph data after calibration
  loadDestinationCube();
  loadGraphData();
}

async function loadRoomMappings() {
  try {
    const response = await fetch(ROOMS_API_URL);
    if (!response.ok) {
      console.log('No room mappings found');
      return;
    }
    
    const data = await response.json();
    const roomMapping = data.roomMapping || {};
    
    // Get unique room names
    const rooms = [...new Set(Object.values(roomMapping))];
    
    // Populate dropdown
    const select = document.getElementById('destination-room');
    select.innerHTML = '<option value="">-- Select a room --</option>';
    
    rooms.forEach(room => {
      const option = document.createElement('option');
      option.value = room;
      option.textContent = room;
      select.appendChild(option);
    });
    
    console.log('Loaded rooms:', rooms);
  } catch (error) {
    console.error('Error loading room mappings:', error);
    const select = document.getElementById('destination-room');
    select.innerHTML = '<option value="">No rooms available</option>';
  }
}

async function loadDestinationCube() {
  try {
    // Load room mappings to find the node ID for selected room
    const roomResponse = await fetch(ROOMS_API_URL);
    if (!roomResponse.ok) {
      console.log('No room mappings found');
      return;
    }
    
    const roomData = await roomResponse.json();
    const roomMapping = roomData.roomMapping || {};
    
    // Find node ID that maps to selected destination
    destinationNodeId = null;
    for (const [nodeId, room] of Object.entries(roomMapping)) {
      if (room === selectedDestination) {
        destinationNodeId = nodeId;
        break;
      }
    }
    
    if (!destinationNodeId) {
      console.log('No node found for destination:', selectedDestination);
      return;
    }
    
    console.log('Destination node:', destinationNodeId, 'for room:', selectedDestination);
    
    // Load cube positions
    const posResponse = await fetch(API_URL);
    if (!posResponse.ok) {
      console.log('No saved positions found');
      return;
    }
    
    const posData = await posResponse.json();
    
    if (!posData.cubes || posData.cubes.length === 0) {
      console.log('No cubes to load');
      return;
    }
    
    // Clear existing cubes
    cubes.forEach(cube => scene.remove(cube));
    cubes = [];
    
    // Load ALL cubes, but only show destination initially
    posData.cubes.forEach(cubeData => {
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      
      // Check if this is the destination cube
      const isDestination = cubeData.id === destinationNodeId;
      
      const material = new THREE.MeshStandardMaterial({ 
        color: isDestination ? 0xff0000 : 0x00ff88, // Red for destination, green for others
        metalness: 0.5,
        roughness: 0.3,
        emissive: isDestination ? 0xff0000 : 0x004400,
        emissiveIntensity: isDestination ? 0.5 : 0.3
      });
      const cube = new THREE.Mesh(geometry, material);
      
      // Extract and store the cube ID from the saved data
      const cubeIdMatch = cubeData.id.match(/cube_(\d+)/);
      if (cubeIdMatch) {
        cube.userData.cubeId = parseInt(cubeIdMatch[1]);
      }
      
      // Mark if this is the destination cube
      cube.userData.isDestination = isDestination;
      
      // Only show destination cube initially, hide others
      cube.visible = isDestination;
      
      // Use stored world position directly (same as main.js)
      cube.position.set(
        cubeData.worldPosition.x,
        cubeData.worldPosition.y,
        cubeData.worldPosition.z
      );
      
      cube.matrixAutoUpdate = true;
      cube.updateMatrix();
      
      scene.add(cube);
      cubes.push(cube);
    });
    
    console.log(`Loaded ${cubes.length} cubes (showing only destination: ${destinationNodeId})`);
    
    // Store cube positions for pathfinding
    posData.cubes.forEach(cubeData => {
      const pos = new THREE.Vector3(
        cubeData.worldPosition.x,
        cubeData.worldPosition.y,
        cubeData.worldPosition.z
      );
      cubePositions[cubeData.id] = pos;
    });
  } catch (error) {
    console.error('Error loading destination cube:', error);
  }
}

async function loadGraphData() {
  try {
    const response = await fetch(GRAPH_API_URL);
    if (!response.ok) {
      console.log('No graph data found');
      return;
    }
    
    const data = await response.json();
    adjacencyList = data.adjacencyList || {};
    console.log('Loaded graph with', Object.keys(adjacencyList).length, 'nodes');
  } catch (error) {
    console.error('Error loading graph data:', error);
  }
}

function onStartNavigationClick() {
  if (!xrSession || !referenceAnchor) {
    alert('Please calibrate your position first');
    return;
  }
  
  navigationActive = !navigationActive;
  const startNavButton = document.getElementById('start-navigation-button');
  
  if (navigationActive) {
    startNavButton.textContent = 'Stop Navigation';
    startNavButton.classList.add('active');
    
    // Find nearest cube once
    findNearestCube();
    
    // Calculate and visualize path
    if (nearestNodeId && destinationNodeId) {
      const result = dijkstra(nearestNodeId, destinationNodeId);
      if (result && result.path) {
        visualizePath(result.path);
        console.log('Path found:', result.path.join(' → '), 'Distance:', result.distance.toFixed(2) + 'm');
        
        // Show path cubes in green, nearest in blue, destination in red
        showPathCubes(result.path);
      } else {
        alert('No path found to destination');
        navigationActive = false;
        startNavButton.textContent = 'Start Navigation';
        startNavButton.classList.remove('active');
      }
    }
  } else {
    startNavButton.textContent = 'Start Navigation';
    startNavButton.classList.remove('active');
    
    // Clear path visualization
    resetPath();
    
    // Hide all cubes except destination
    cubes.forEach(cube => {
      if (cube.userData.isDestination) {
        cube.visible = true;
        cube.material.color.setHex(0xff0000);
        cube.material.emissive.setHex(0xff0000);
      } else {
        cube.visible = false;
      }
    });
  }
}

function findNearestCube() {
  if (!xrSession || cubes.length === 0) return;
  
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
  
  if (nearestCube) {
    nearestNodeId = `cube_${nearestCube.userData.cubeId}`;
    console.log('Nearest node:', nearestNodeId, 'Distance:', minDistance.toFixed(2) + 'm');
  }
}

function dijkstra(startNode, endNode) {
  const distances = {};
  const previous = {};
  const unvisited = new Set();

  // Initialize distances
  for (const node in cubePositions) {
    distances[node] = Infinity;
    previous[node] = null;
    unvisited.add(node);
  }
  distances[startNode] = 0;

  while (unvisited.size > 0) {
    // Find node with minimum distance
    let currentNode = null;
    let minDistance = Infinity;
    for (const node of unvisited) {
      if (distances[node] < minDistance) {
        minDistance = distances[node];
        currentNode = node;
      }
    }

    if (currentNode === null || distances[currentNode] === Infinity) {
      break; // No path exists
    }

    if (currentNode === endNode) {
      break; // Found shortest path to end
    }

    unvisited.delete(currentNode);

    // Check neighbors
    if (adjacencyList[currentNode]) {
      for (const edge of adjacencyList[currentNode]) {
        const neighbor = edge.node || edge;
        const weight = edge.distance || 1;
        
        if (unvisited.has(neighbor)) {
          const altDistance = distances[currentNode] + weight;
          if (altDistance < distances[neighbor]) {
            distances[neighbor] = altDistance;
            previous[neighbor] = currentNode;
          }
        }
      }
    }
  }

  // Reconstruct path
  const path = [];
  let current = endNode;
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  if (path[0] !== startNode) {
    return null; // No path found
  }

  return { path, distance: distances[endNode] };
}

function visualizePath(path) {
  // Clear previous path
  resetPath();

  if (!path || path.length < 2) return;

  // Just store cube references for path, no visual tubes
  for (let i = 0; i < path.length - 1; i++) {
    const node1 = path[i];
    const node2 = path[i + 1];

    // Find the actual cube meshes
    const cube1 = cubes.find(c => `cube_${c.userData.cubeId}` === node1);
    const cube2 = cubes.find(c => `cube_${c.userData.cubeId}` === node2);

    if (cube1 && cube2) {
      // Store reference to cubes (no tubes)
      pathLines.push({ cube1, cube2 });
    }
  }
}

function resetPath() {
  // Just clear the array, no tubes to remove
  pathLines = [];
}

function showPathCubes(path) {
  cubes.forEach(cube => {
    const cubeId = `cube_${cube.userData.cubeId}`;
    
    if (cubeId === nearestNodeId) {
      // Nearest cube - blue
      cube.visible = true;
      cube.material.color.setHex(0x0000ff);
      cube.material.emissive.setHex(0x000066);
    } else if (cube.userData.isDestination) {
      // Destination - red
      cube.visible = true;
      cube.material.color.setHex(0xff0000);
      cube.material.emissive.setHex(0xff0000);
    } else if (path.includes(cubeId)) {
      // Path cubes - green
      cube.visible = true;
      cube.material.color.setHex(0x00ff88);
      cube.material.emissive.setHex(0x004400);
    } else {
      // Hide others
      cube.visible = false;
    }
  });
}

function updateCalibrationStatus(isCalibrated) {
  const calibrationStatus = document.getElementById('calibration-status');
  if (isCalibrated && referenceAnchor) {
    calibrationStatus.textContent = 'World Origin Set - Ready for Navigation';
    calibrationStatus.className = 'active';
  } else {
    calibrationStatus.textContent = 'Click Calibrate to Initialize';
    calibrationStatus.className = 'inactive';
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function render() {
  // Rotate all cubes for a nice floating effect
  cubes.forEach(cube => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
  });

  renderer.render(scene, camera);
}
