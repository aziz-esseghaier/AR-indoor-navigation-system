import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let navigationArea;
const roomPositions = [];

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 35, 25);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('scene-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
    scene.add(gridHelper);

    createFloorPlan();
    setupUIControls();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function createFloorPlan() {
    navigationArea = new THREE.Group();

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xe91e63,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });

    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x4CAF50,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
    });

    const floorColors = [
        0xFFCDD2, 0xF8BBD0, 0xE1BEE7, 0xD1C4E9,
        0xC5CAE9, 0xBBDEFB, 0xB3E5FC, 0xB2EBF2,
        0xB2DFDB, 0xC8E6C9, 0xDCEDC8, 0xF0F4C3
    ];

    const wallHeight = parseFloat(document.getElementById('wallHeight').value);

    const centerRadius = 3;
    const innerRoomRadius = 6;
    const outerRoomRadius = 12;
    const amphitheaterRadius = 18;
    const numRooms = 12;
    const doorWidth = 1.2;

    // BLOC A - Center circle
    const centerGeometry = new THREE.CylinderGeometry(
        centerRadius,
        centerRadius,
        wallHeight,
        32,
        1,
        true
    );
    const centerWall = new THREE.Mesh(centerGeometry, wallMaterial);
    centerWall.position.y = wallHeight / 2;
    navigationArea.add(centerWall);

    // Center floor (BLOC A)
    createFloorArea(0, 0, centerRadius * 2, centerRadius * 2, 0xF5F5F5, navigationArea, true);
    addTextLabel('BLOC A', new THREE.Vector3(0, 0.02, 0), navigationArea);

    // Inner hallway ring (between center and rooms)
    for (let i = 0; i < 48; i++) {
        const angle1 = (i / 48) * Math.PI * 2;
        const angle2 = ((i + 1) / 48) * Math.PI * 2;
        
        const points = [
            new THREE.Vector2(Math.cos(angle1) * centerRadius, Math.sin(angle1) * centerRadius),
            new THREE.Vector2(Math.cos(angle2) * centerRadius, Math.sin(angle2) * centerRadius),
            new THREE.Vector2(Math.cos(angle2) * innerRoomRadius, Math.sin(angle2) * innerRoomRadius),
            new THREE.Vector2(Math.cos(angle1) * innerRoomRadius, Math.sin(angle1) * innerRoomRadius)
        ];
        
        const shape = new THREE.Shape(points);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshStandardMaterial({
            color: 0xE8E8E8,
            side: THREE.DoubleSide
        });
        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.01;
        navigationArea.add(floor);
    }

    // Create 12 rooms with irregular shapes
    for (let i = 0; i < numRooms; i++) {
        const angleStart = (i / numRooms) * Math.PI * 2;
        const angleEnd = ((i + 1) / numRooms) * Math.PI * 2;
        const angleMid = (angleStart + angleEnd) / 2;

        // Vary room depth for irregular layout
        const roomDepth = outerRoomRadius + Math.random() * 2;

        // Radial walls from inner ring to outer
        const x1Inner = Math.cos(angleStart) * innerRoomRadius;
        const z1Inner = Math.sin(angleStart) * innerRoomRadius;
        const x1Outer = Math.cos(angleStart) * roomDepth;
        const z1Outer = Math.sin(angleStart) * roomDepth;
        
        const wall1 = createWall(x1Inner, z1Inner, x1Outer, z1Outer, wallHeight, wallMaterial);
        navigationArea.add(wall1);

        const x2Inner = Math.cos(angleEnd) * innerRoomRadius;
        const z2Inner = Math.sin(angleEnd) * innerRoomRadius;
        const x2Outer = Math.cos(angleEnd) * roomDepth;
        const z2Outer = Math.sin(angleEnd) * roomDepth;
        
        const wall2 = createWall(x2Inner, z2Inner, x2Outer, z2Outer, wallHeight, wallMaterial);
        navigationArea.add(wall2);

        // Outer wall with door to hallway (facing inward)
        const xDoorStart = Math.cos(angleMid - doorWidth / (2 * innerRoomRadius)) * innerRoomRadius;
        const zDoorStart = Math.sin(angleMid - doorWidth / (2 * innerRoomRadius)) * innerRoomRadius;
        const xDoorEnd = Math.cos(angleMid + doorWidth / (2 * innerRoomRadius)) * innerRoomRadius;
        const zDoorEnd = Math.sin(angleMid + doorWidth / (2 * innerRoomRadius)) * innerRoomRadius;

        // Inner wall segments with door
        const wallBefore = createWall(x1Inner, z1Inner, xDoorStart, zDoorStart, wallHeight, wallMaterial);
        navigationArea.add(wallBefore);

        const doorFrame = createWall(xDoorStart, zDoorStart, xDoorEnd, zDoorEnd, wallHeight * 0.6, doorMaterial);
        navigationArea.add(doorFrame);

        const wallAfter = createWall(xDoorEnd, zDoorEnd, x2Inner, z2Inner, wallHeight, wallMaterial);
        navigationArea.add(wallAfter);

        // Outer wall (solid, no door)
        const outerWall = createWall(x1Outer, z1Outer, x2Outer, z2Outer, wallHeight, wallMaterial);
        navigationArea.add(outerWall);

        // Room floor (irregular quadrilateral)
        const roomFloorPoints = [
            new THREE.Vector2(x1Inner, z1Inner),
            new THREE.Vector2(x2Inner, z2Inner),
            new THREE.Vector2(x2Outer, z2Outer),
            new THREE.Vector2(x1Outer, z1Outer)
        ];
        
        const roomShape = new THREE.Shape(roomFloorPoints);
        const roomGeometry = new THREE.ShapeGeometry(roomShape);
        const roomMaterial = new THREE.MeshStandardMaterial({
            color: floorColors[i],
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const roomFloor = new THREE.Mesh(roomGeometry, roomMaterial);
        roomFloor.rotation.x = -Math.PI / 2;
        roomFloor.position.y = 0.01;
        navigationArea.add(roomFloor);

        // Room label and position
        const roomX = Math.cos(angleMid) * (innerRoomRadius + roomDepth) / 2;
        const roomZ = Math.sin(angleMid) * (innerRoomRadius + roomDepth) / 2;
        addTextLabel(`${i + 1}`, new THREE.Vector3(roomX, 0.02, roomZ), navigationArea, 0.8);
        
        roomPositions.push({
            id: i + 1,
            position: new THREE.Vector3(roomX, 10, roomZ)
        });
    }

    // Large amphitheater areas (IBN EL-HATHEM and IBN KHALDOUN)
    // Left side - IBN EL-HATHEM
    createLargeArea(-12, -8, 8, 12, 0xD7CCC8, 'IBN EL-HATHEM');
    
    // Bottom - IBN KHALDOUN
    createLargeArea(-3, 10, 12, 8, 0xD7CCC8, 'IBN KHALDOUN');

    scene.add(navigationArea);
}

function createLargeArea(x, z, width, depth, color, labelText) {
    // Floor
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.01, z);
    navigationArea.add(floor);

    // Label
    addTextLabel(labelText, new THREE.Vector3(x, 0.02, z), navigationArea, 1.5);
}

function createWall(x1, z1, x2, z2, height, material) {
    const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(z2 - z1, x2 - x1);
    
    const geometry = new THREE.BoxGeometry(length, height, 0.2);
    const wall = new THREE.Mesh(geometry, material);
    
    wall.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2);
    wall.rotation.y = -angle;
    
    return wall;
}

function createFloorArea(x, z, width, depth, color, parent, isCircle = false) {
    let geometry;
    if (isCircle) {
        geometry = new THREE.CircleGeometry(width / 2, 32);
    } else {
        geometry = new THREE.PlaneGeometry(width, depth);
    }
    
    const material = new THREE.MeshStandardMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.01, z);
    parent.add(floor);
}

function addTextLabel(text, position, parent, scale = 1) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;
    
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'Bold 48px Arial';
    context.fillStyle = 'black';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const geometry = new THREE.PlaneGeometry(2 * scale, 1 * scale);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    
    parent.add(mesh);
}

function setupUIControls() {
    // Generate room buttons
    const roomButtonsContainer = document.getElementById('roomButtons');
    roomPositions.forEach(room => {
        const button = document.createElement('button');
        button.textContent = `Room ${room.id}`;
        button.addEventListener('click', () => {
            animateCameraTo(room.position);
        });
        roomButtonsContainer.appendChild(button);
    });

    document.getElementById('wallHeight').addEventListener('input', (e) => {
        document.getElementById('heightValue').textContent = e.target.value;
        rebuildFloorPlan();
    });

    document.getElementById('scale').addEventListener('input', (e) => {
        document.getElementById('scaleValue').textContent = e.target.value;
        const scale = parseFloat(e.target.value);
        navigationArea.scale.set(scale, scale, scale);
    });

    document.getElementById('centerTarget').addEventListener('click', () => {
        animateCameraTo(new THREE.Vector3(0, 8, 0));
    });

    document.getElementById('overviewTarget').addEventListener('click', () => {
        animateCameraTo(new THREE.Vector3(0, 35, 25));
    });
}

function rebuildFloorPlan() {
    scene.remove(navigationArea);
    roomPositions.length = 0;
    document.getElementById('roomButtons').innerHTML = '';
    createFloorPlan();
    setupUIControls();
}

function animateCameraTo(target) {
    const duration = 1000;
    const start = camera.position.clone();
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        camera.position.lerpVectors(start, target, progress);
        controls.target.set(target.x, 0, target.z);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

init();