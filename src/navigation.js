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
let fullNavigationPath = []; // Store full path for sliding window navigation
let pathTubes = []; // Store tube meshes for path visualization
let pathArrows = []; // Store arrow meshes for direction indicators

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

  // Setup destination room selector
  const roomSelect = document.getElementById('destination-room');
  roomSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      selectedDestination = e.target.value;
      console.log('Destination room selected:', selectedDestination);
      
      // Reset navigation state when changing destination
      navigationActive = false;
      
      // Load destination cube and graph data when room is selected
      await loadDestinationCube();
      await loadGraphData();
      
      // Show start navigation button after destination is loaded
      const startNavButton = document.getElementById('start-navigation-button');
      if (startNavButton && destinationNodeId) {
        startNavButton.style.display = 'block';
        startNavButton.textContent = 'Start Navigation';
        startNavButton.classList.remove('active');
      } else {
        console.error('Could not load destination for room:', selectedDestination);
      }
    }
  });

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
    
    // Hide room selector and start navigation initially
    const roomSelectorOverlay = document.getElementById('room-selector-overlay');
    if (roomSelectorOverlay) {
      roomSelectorOverlay.style.display = 'none';
    }
    const startNavButton = document.getElementById('start-navigation-button');
    startNavButton.style.display = 'none';
    
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
  
  // Hide room selector overlay
  const roomSelectorOverlay = document.getElementById('room-selector-overlay');
  if (roomSelectorOverlay) {
    roomSelectorOverlay.style.display = 'none';
  }
  
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
  
  // Get the current camera (phone) position and orientation in AR space
  // This captures where the user has placed their phone at the calibration point
  const xrCamera = renderer.xr.getCamera();
  const cameraPosition = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  xrCamera.getWorldPosition(cameraPosition);
  xrCamera.getWorldQuaternion(cameraQuaternion);
  
  // Store the current camera position as the reference anchor
  // This becomes the "world origin" that all waypoints are relative to
  referenceAnchor = {
    position: {
      x: cameraPosition.x,
      y: cameraPosition.y,
      z: cameraPosition.z
    },
    orientation: {
      x: cameraQuaternion.x,
      y: cameraQuaternion.y,
      z: cameraQuaternion.z,
      w: cameraQuaternion.w
    }
  };
  
  console.log('Reference position calibrated at camera position:', referenceAnchor.position);
  console.log('Reference orientation:', referenceAnchor.orientation);
  
  // Update status
  updateCalibrationStatus(true);
  
  // Hide calibrate button after calibration
  const calibrateButton = document.getElementById('calibrate-button');
  if (calibrateButton) {
    calibrateButton.style.display = 'none';
  }
  
  // Show room selector overlay after calibration
  const roomSelectorOverlay = document.getElementById('room-selector-overlay');
  if (roomSelectorOverlay) {
    roomSelectorOverlay.style.display = 'block';
  }
  
  // Note: Don't load destination cube here - wait for room selection
  console.log('Calibration complete. Please select a destination room.');
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

    // Cached reference anchors and orientations (translation + rotation alignment)
    const savedRefPos = (posData.referenceAnchor && posData.referenceAnchor.position) ? posData.referenceAnchor.position : { x: 0, y: 0, z: 0 };
    const savedRefQuat = (posData.referenceAnchor && posData.referenceAnchor.orientation)
      ? new THREE.Quaternion(
          posData.referenceAnchor.orientation.x,
          posData.referenceAnchor.orientation.y,
          posData.referenceAnchor.orientation.z,
          posData.referenceAnchor.orientation.w
        )
      : null;

    const userRefPos = referenceAnchor && referenceAnchor.position ? referenceAnchor.position : { x: 0, y: 0, z: 0 };
    const userRefQuat = (referenceAnchor && referenceAnchor.orientation)
      ? new THREE.Quaternion(
          referenceAnchor.orientation.x,
          referenceAnchor.orientation.y,
          referenceAnchor.orientation.z,
          referenceAnchor.orientation.w
        )
      : null;

    // Rotation delta from saved reference to current calibration (if orientations exist)
    const deltaQuat = (savedRefQuat && userRefQuat)
      ? userRefQuat.clone().multiply(savedRefQuat.clone().invert())
      : null;

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
      
      // Translate into saved reference frame
      const relativePos = new THREE.Vector3(
        cubeData.worldPosition.x - savedRefPos.x,
        cubeData.worldPosition.y - savedRefPos.y,
        cubeData.worldPosition.z - savedRefPos.z
      );

      // Rotate into current calibration frame if orientations exist
      if (deltaQuat) {
        relativePos.applyQuaternion(deltaQuat);
      }

      // Translate into current user reference frame
      cube.position.set(
        relativePos.x + userRefPos.x,
        relativePos.y + userRefPos.y,
        relativePos.z + userRefPos.z
      );
      
      cube.matrixAutoUpdate = true;
      cube.updateMatrix();
      
      scene.add(cube);
      cubes.push(cube);
    });
    
    console.log(`Loaded ${cubes.length} cubes (showing only destination: ${destinationNodeId})`);
    
    // Store cube positions for pathfinding (aligned to user calibration)
    posData.cubes.forEach(cubeData => {
      const relativePos = new THREE.Vector3(
        cubeData.worldPosition.x - savedRefPos.x,
        cubeData.worldPosition.y - savedRefPos.y,
        cubeData.worldPosition.z - savedRefPos.z
      );

      if (deltaQuat) {
        relativePos.applyQuaternion(deltaQuat);
      }

      const pos = new THREE.Vector3(
        relativePos.x + userRefPos.x,
        relativePos.y + userRefPos.y,
        relativePos.z + userRefPos.z
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
    
    // Hide room selector during navigation
    const roomSelectorOverlay = document.getElementById('room-selector-overlay');
    if (roomSelectorOverlay) {
      roomSelectorOverlay.style.display = 'none';
    }
    
    // Hide calibration status during navigation
    const calibrationStatus = document.getElementById('calibration-status');
    if (calibrationStatus) {
      calibrationStatus.style.display = 'none';
    }
    
    // Find nearest cube once
    findNearestCube();
    
    // Calculate and visualize path
    if (nearestNodeId && destinationNodeId) {
      const result = dijkstra(nearestNodeId, destinationNodeId);
      if (result && result.path) {
        console.log('Path found:', result.path.join(' → '), 'Distance:', result.distance.toFixed(2) + 'm');
        visualizePath(result.path);
      } else {
        console.error('No path found to destination');
        alert('No path found to destination');
        navigationActive = false;
        startNavButton.textContent = 'Start Navigation';
        startNavButton.classList.remove('active');
      }
    } else {
      console.error('Missing nearestNodeId or destinationNodeId', { nearestNodeId, destinationNodeId });
      alert('Cannot start navigation - missing start or destination point');
      navigationActive = false;
      startNavButton.textContent = 'Start Navigation';
      startNavButton.classList.remove('active');
    }
  } else {
    startNavButton.textContent = 'Start Navigation';
    startNavButton.classList.remove('active');
    
    // Show room selector again when stopping navigation (for new destination selection)
    const roomSelectorOverlay = document.getElementById('room-selector-overlay');
    if (roomSelectorOverlay) {
      roomSelectorOverlay.style.display = 'block';
    }
    
    // Don't show calibration status - keep it hidden
    // User can select a new destination without recalibrating
    
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

  // Store full path for sliding window
  fullNavigationPath = path;

  // Initially show only nearest 3 waypoints
  updateSlidingWindowPath();
}

function createTubeBetweenPoints(point1, point2, color = 0x00ff88) {
  const direction = new THREE.Vector3().subVectors(point2, point1);
  const distance = direction.length();
  
  // Create tube (cylinder)
  const tubeGeometry = new THREE.CylinderGeometry(0.02, 0.02, distance, 8);
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.7
  });
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  
  // Position tube at midpoint
  const midPoint = new THREE.Vector3().addVectors(point1, point2).multiplyScalar(0.5);
  tube.position.copy(midPoint);
  
  // Rotate tube to align with direction
  const axis = new THREE.Vector3(0, 1, 0);
  tube.quaternion.setFromUnitVectors(axis, direction.normalize());
  
  return tube;
}

function createArrow(position, direction, color = 0x00ff88) {
  // Create cone for arrow
  const arrowGeometry = new THREE.ConeGeometry(0.08, 0.15, 8);
  const arrowMaterial = new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 0.7,
    metalness: 0.5,
    roughness: 0.5
  });
  const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
  
  arrow.position.copy(position);
  
  // Rotate arrow to point in direction
  const up = new THREE.Vector3(0, 1, 0);
  arrow.quaternion.setFromUnitVectors(up, direction.normalize());
  
  return arrow;
}

function clearPathVisualization() {
  // Remove all tubes
  pathTubes.forEach(tube => {
    scene.remove(tube);
    tube.geometry.dispose();
    tube.material.dispose();
  });
  pathTubes = [];
  
  // Remove all arrows
  pathArrows.forEach(arrow => {
    scene.remove(arrow);
    arrow.geometry.dispose();
    arrow.material.dispose();
  });
  pathArrows = [];
}

function updateSlidingWindowPath() {
  if (!navigationActive || fullNavigationPath.length < 2 || !xrSession) return;

  // Get current camera position
  const xrCamera = renderer.xr.getCamera();
  const cameraPosition = new THREE.Vector3();
  xrCamera.getWorldPosition(cameraPosition);

  // Find which waypoint we've passed on the path
  let currentPathIndex = 0;
  let minDistance = Infinity;
  
  fullNavigationPath.forEach((nodeId, index) => {
    const cube = cubes.find(c => `cube_${c.userData.cubeId}` === nodeId);
    if (cube) {
      const cubeWorldPos = new THREE.Vector3();
      cube.getWorldPosition(cubeWorldPos);
      const distance = cameraPosition.distanceTo(cubeWorldPos);
      
      if (distance < minDistance) {
        minDistance = distance;
        currentPathIndex = index;
      }
    }
  });

  // Show the next 3 waypoints ahead on the path (not including ones we've passed)
  const waypointsToShow = [];
  for (let i = currentPathIndex; i < Math.min(currentPathIndex + 3, fullNavigationPath.length - 1); i++) {
    waypointsToShow.push(fullNavigationPath[i]);
  }

  // Check if we're close to the destination (last waypoint)
  const destinationNodeId = fullNavigationPath[fullNavigationPath.length - 1];
  const destinationCube = cubes.find(c => `cube_${c.userData.cubeId}` === destinationNodeId);
  let showDestination = false;
  
  if (destinationCube) {
    const destWorldPos = new THREE.Vector3();
    destinationCube.getWorldPosition(destWorldPos);
    const distToDestination = cameraPosition.distanceTo(destWorldPos);
    
    // Show destination when within 2 meters or it's one of the next 3 waypoints
    showDestination = distToDestination < 2.0 || waypointsToShow.includes(destinationNodeId);
  }

  // Clear previous tubes and arrows
  clearPathVisualization();
  
  // Draw tubes and arrows between visible waypoints
  for (let i = 0; i < waypointsToShow.length; i++) {
    const nodeId = waypointsToShow[i];
    const cube = cubes.find(c => `cube_${c.userData.cubeId}` === nodeId);
    
    if (!cube) continue;
    
    const cubePos = new THREE.Vector3();
    cube.getWorldPosition(cubePos);
    
    // Draw tube to next waypoint
    if (i < waypointsToShow.length - 1) {
      const nextNodeId = waypointsToShow[i + 1];
      const nextCube = cubes.find(c => `cube_${c.userData.cubeId}` === nextNodeId);
      
      if (nextCube) {
        const nextCubePos = new THREE.Vector3();
        nextCube.getWorldPosition(nextCubePos);
        
        // Create tube at floor level
        const floorPoint1 = cubePos.clone();
        floorPoint1.y = cubePos.y - 0.05; // Slightly below cube center
        
        const floorPoint2 = nextCubePos.clone();
        floorPoint2.y = nextCubePos.y - 0.05;
        
        // Calculate midpoint for arrow placement
        const midPoint = new THREE.Vector3().addVectors(floorPoint1, floorPoint2).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(floorPoint2, floorPoint1);
        
        // Draw tube only from start to midpoint (stops at arrow)
        const tube = createTubeBetweenPoints(floorPoint1, midPoint, 0x00ff88);
        scene.add(tube);
        pathTubes.push(tube);
        
        // Add arrow at midpoint pointing toward next waypoint
        const arrow = createArrow(midPoint, direction, 0x00ff88);
        scene.add(arrow);
        pathArrows.push(arrow);
      }
    }
  }
  
  // If destination is visible and close, draw red tube to it
  if (showDestination && waypointsToShow.length > 0) {
    const lastVisibleNode = waypointsToShow[waypointsToShow.length - 1];
    const destinationNodeId = fullNavigationPath[fullNavigationPath.length - 1];
    
    if (lastVisibleNode !== destinationNodeId) {
      const lastCube = cubes.find(c => `cube_${c.userData.cubeId}` === lastVisibleNode);
      const destCube = cubes.find(c => `cube_${c.userData.cubeId}` === destinationNodeId);
      
      if (lastCube && destCube) {
        const lastPos = new THREE.Vector3();
        lastCube.getWorldPosition(lastPos);
        const destPos = new THREE.Vector3();
        destCube.getWorldPosition(destPos);
        
        const floorPoint1 = lastPos.clone();
        floorPoint1.y = lastPos.y - 0.05;
        const floorPoint2 = destPos.clone();
        floorPoint2.y = destPos.y - 0.05;
        
        // Calculate midpoint for arrow
        const midPoint = new THREE.Vector3().addVectors(floorPoint1, floorPoint2).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(floorPoint2, floorPoint1);
        
        // Draw red tube only to midpoint (stops at arrow)
        const tube = createTubeBetweenPoints(floorPoint1, midPoint, 0xff0000);
        scene.add(tube);
        pathTubes.push(tube);
        
        // Add red arrow
        const arrow = createArrow(midPoint, direction, 0xff0000);
        scene.add(arrow);
        pathArrows.push(arrow);
      }
    }
  }
  
  // Show waypoints
  showPathCubes(waypointsToShow, showDestination);
}

function resetPath() {
  // Clear path arrays
  pathLines = [];
  fullNavigationPath = [];
  
  // Clear visual tubes and arrows
  clearPathVisualization();
}

function showPathCubes(visibleNodes, showDestination) {
  // Hide all cubes in navigation mode - only show tubes and arrows
  cubes.forEach(cube => {
    cube.visible = false;
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

  // Update sliding window for navigation (only show nearest 3 waypoints)
  if (navigationActive && fullNavigationPath.length > 0) {
    updateSlidingWindowPath();
  }

  renderer.render(scene, camera);
}
