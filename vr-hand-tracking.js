/**
 * VR Hand Tracking System
 * Kombiniert A-Frame VR mit MediaPipe Handerkennung
 */

// Globale Variablen
let hands = null;
let camera = null;
let isRunning = false;
let grabbedObject = null;
let hoveredObject = null;
let lastHandPosition = { x: 0.5, y: 0.5, z: 0 };

const config = {
    handSmoothingFactor: 0.3,
    grabThreshold: 0.08,
    cursorDepth: -2
};

// Start-Funktion (wird von Button aufgerufen)
function startApp() {
    console.log('Button geklickt!');

    const btn = document.getElementById('start-btn');
    btn.textContent = 'Wird geladen...';
    btn.disabled = true;

    // Kurze Verzögerung damit UI sich aktualisiert
    setTimeout(() => {
        initializeApp();
    }, 100);
}

async function initializeApp() {
    try {
        console.log('Initialisiere App...');

        // MediaPipe Hands initialisieren
        await initializeHandTracking();

        // UI aktualisieren
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('camera-container').classList.remove('hidden');
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('instructions').classList.remove('hidden');
        document.getElementById('vr-scene').classList.remove('hidden');

        // Kamera starten
        await startCamera();

        isRunning = true;
        updateStatus('Aktiv - Zeige deine Hand!');
        console.log('App erfolgreich gestartet!');

    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler: ' + error.message + '\n\nBitte Kamera-Zugriff erlauben!');

        const btn = document.getElementById('start-btn');
        btn.textContent = 'Erneut versuchen';
        btn.disabled = false;
    }
}

async function initializeHandTracking() {
    console.log('Initialisiere Hand-Tracking...');

    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    console.log('Hand-Tracking initialisiert!');
}

async function startCamera() {
    console.log('Starte Kamera...');

    const videoElement = document.getElementById('camera-feed');
    const canvasElement = document.getElementById('hand-canvas');

    const constraints = {
        video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;

    await new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            resolve();
        };
    });

    // Canvas Größe anpassen
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // MediaPipe Kamera starten
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (hands && isRunning) {
                await hands.send({ image: videoElement });
            }
        },
        width: 640,
        height: 480
    });

    await camera.start();
    console.log('Kamera gestartet!');
}

function onHandResults(results) {
    const canvasElement = document.getElementById('hand-canvas');
    const canvasCtx = canvasElement.getContext('2d');

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i];

            drawHand(canvasCtx, canvasElement, landmarks);
            const gesture = detectGesture(landmarks);
            updateVRCursor(landmarks, gesture);
            updateHandInfo(handedness, gesture);
        }
    } else {
        document.getElementById('gesture-display').textContent = 'Geste: Keine Hand erkannt';
        hideCursor();
    }

    canvasCtx.restore();
}

function drawHand(ctx, canvas, landmarks) {
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17]
    ];

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;

    for (const [start, end] of connections) {
        ctx.beginPath();
        ctx.moveTo(landmarks[start].x * canvas.width, landmarks[start].y * canvas.height);
        ctx.lineTo(landmarks[end].x * canvas.width, landmarks[end].y * canvas.height);
        ctx.stroke();
    }

    for (const landmark of landmarks) {
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function detectGesture(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];
    const ringMCP = landmarks[13];
    const pinkyMCP = landmarks[17];

    const indexExtended = indexTip.y < indexMCP.y;
    const middleExtended = middleTip.y < middleMCP.y;
    const ringExtended = ringTip.y < ringMCP.y;
    const pinkyExtended = pinkyTip.y < pinkyMCP.y;

    const thumbIndexDist = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow(thumbTip.z - indexTip.z, 2)
    );

    if (thumbIndexDist < config.grabThreshold) return 'grab';
    if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) return 'point';
    if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) return 'peace';
    if (indexExtended && middleExtended && ringExtended && pinkyExtended) return 'open';
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) return 'fist';

    return 'unknown';
}

function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

function updateVRCursor(landmarks, gesture) {
    const palm = landmarks[9];
    const cursorSphere = document.getElementById('cursor-sphere');
    const cursorLabel = document.getElementById('cursor-label');

    const smoothX = lerp(lastHandPosition.x, palm.x, config.handSmoothingFactor);
    const smoothY = lerp(lastHandPosition.y, palm.y, config.handSmoothingFactor);
    lastHandPosition = { x: smoothX, y: smoothY, z: palm.z };

    const vrX = (0.5 - smoothX) * 4;
    const vrY = (1 - smoothY) * 2.5 + 0.5;
    const vrZ = config.cursorDepth;

    cursorSphere.setAttribute('position', `${vrX} ${vrY} ${vrZ}`);
    cursorSphere.setAttribute('visible', 'true');

    let cursorColor = '#00ff00';
    let cursorScale = '1 1 1';

    switch (gesture) {
        case 'grab':
        case 'fist':
            cursorColor = '#ff0000';
            cursorScale = '1.5 1.5 1.5';
            tryGrabObject(vrX, vrY, vrZ);
            break;
        case 'point':
            cursorColor = '#ffff00';
            trySelectObject(vrX, vrY, vrZ);
            break;
        case 'open':
            cursorColor = '#00ffff';
            releaseObject();
            break;
    }

    cursorSphere.setAttribute('color', cursorColor);
    cursorSphere.setAttribute('scale', cursorScale);

    if (grabbedObject) {
        grabbedObject.setAttribute('position', `${vrX} ${vrY} ${vrZ}`);
    }

    checkHover(vrX, vrY, vrZ, cursorLabel);
}

function checkHover(x, y, z, cursorLabel) {
    const objects = document.querySelectorAll('.interactive');
    let closestObject = null;
    let closestDistance = Infinity;

    objects.forEach((obj) => {
        const pos = obj.getAttribute('position');
        const distance = Math.sqrt(
            Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2) + Math.pow(pos.z - z, 2)
        );

        if (distance < 1 && distance < closestDistance) {
            closestDistance = distance;
            closestObject = obj;
        }
    });

    if (closestObject !== hoveredObject) {
        if (hoveredObject) hoveredObject.emit('hover-end');
        if (closestObject) closestObject.emit('hover-start');
        hoveredObject = closestObject;
    }

    if (closestObject) {
        cursorLabel.setAttribute('value', closestObject.id);
        cursorLabel.setAttribute('position', `${x} ${y + 0.2} ${z}`);
        cursorLabel.setAttribute('visible', 'true');
    } else {
        cursorLabel.setAttribute('visible', 'false');
    }
}

function tryGrabObject(x, y, z) {
    if (grabbedObject) return;

    document.querySelectorAll('.interactive').forEach((obj) => {
        const pos = obj.getAttribute('position');
        const distance = Math.sqrt(
            Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2) + Math.pow(pos.z - z, 2)
        );

        if (distance < 0.8) {
            grabbedObject = obj;
            obj.setAttribute('color', '#ffffff');
        }
    });
}

function trySelectObject(x, y, z) {
    document.querySelectorAll('.interactive').forEach((obj) => {
        const pos = obj.getAttribute('position');
        const distance = Math.sqrt(
            Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2) + Math.pow(pos.z - z, 2)
        );

        if (distance < 0.8) {
            const colors = ['#ff4444', '#4444ff', '#44ff44', '#ffff44', '#ff44ff', '#44ffff'];
            obj.setAttribute('color', colors[Math.floor(Math.random() * colors.length)]);
        }
    });
}

function releaseObject() {
    if (grabbedObject) {
        const colors = {
            'red-cube': '#ff4444',
            'blue-sphere': '#4444ff',
            'green-cylinder': '#44ff44',
            'yellow-torus': '#ffff44'
        };
        grabbedObject.setAttribute('color', colors[grabbedObject.id] || '#888888');
        grabbedObject = null;
    }
}

function hideCursor() {
    const cursorSphere = document.getElementById('cursor-sphere');
    const cursorLabel = document.getElementById('cursor-label');
    if (cursorSphere) cursorSphere.setAttribute('visible', 'false');
    if (cursorLabel) cursorLabel.setAttribute('visible', 'false');
}

function updateHandInfo(handedness, gesture) {
    const names = {
        'grab': 'Greifen', 'point': 'Zeigen', 'peace': 'Peace',
        'open': 'Offene Hand', 'fist': 'Faust', 'unknown': 'Unbekannt'
    };

    document.getElementById('gesture-display').textContent = `Geste: ${names[gesture] || gesture}`;
    document.getElementById('hand-info').innerHTML = `
        <small>Hand: ${handedness.label === 'Left' ? 'Links' : 'Rechts'}<br>
        Konfidenz: ${(handedness.score * 100).toFixed(0)}%</small>
    `;
}

function updateStatus(message) {
    const el = document.getElementById('status');
    if (el) el.textContent = message;
    console.log('Status:', message);
}

// Debug: Zeige dass JS geladen wurde
console.log('vr-hand-tracking.js geladen!');
