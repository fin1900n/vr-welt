/**
 * AR Hand Tracking - Vision Pro Style
 * Passthrough + Hand Recognition + Virtual Objects
 */

// State
let hands = null;
let camera = null;
let isRunning = false;
let grabbedObject = null;
let lastPinchState = false;

// Pinch detection
const PINCH_THRESHOLD = 0.05;

// DOM Elements (werden nach Start gesetzt)
let videoElement, canvasElement, canvasCtx;
let fingerCursor, statusDot, statusText, gestureIndicator, gestureText;
let cursor3D;

function startApp() {
    console.log('Starting AR...');

    const btn = document.getElementById('start-btn');
    btn.textContent = 'Lädt...';
    btn.disabled = true;

    setTimeout(initializeApp, 100);
}

async function initializeApp() {
    try {
        // DOM Elemente holen
        videoElement = document.getElementById('camera-feed');
        canvasElement = document.getElementById('hand-canvas');
        canvasCtx = canvasElement.getContext('2d');
        fingerCursor = document.getElementById('finger-cursor');
        statusDot = document.getElementById('status-dot');
        statusText = document.getElementById('status-text');
        gestureIndicator = document.getElementById('gesture-indicator');
        gestureText = document.getElementById('gesture-text');

        // Hand Tracking initialisieren
        await initHandTracking();

        // UI anzeigen
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('camera-container').classList.remove('hidden');
        document.getElementById('hand-canvas').classList.remove('hidden');
        document.getElementById('finger-cursor').classList.remove('hidden');
        document.getElementById('status-bar').classList.remove('hidden');
        document.getElementById('gesture-indicator').classList.remove('hidden');
        document.getElementById('vr-scene').classList.remove('hidden');

        // 3D Cursor Referenz
        cursor3D = document.getElementById('cursor-3d');

        // Kamera starten
        await startCamera();

        isRunning = true;
        console.log('AR Ready!');

    } catch (error) {
        console.error('Error:', error);
        alert('Fehler: ' + error.message);

        const btn = document.getElementById('start-btn');
        btn.textContent = 'Nochmal';
        btn.disabled = false;
    }
}

async function initHandTracking() {
    hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6
    });

    hands.onResults(onHandResults);
}

async function startCamera() {
    // Rückkamera (Außenkamera) - Passthrough wie Vision Pro
    const constraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
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

    // Canvas an Video anpassen
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // MediaPipe Camera
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (hands && isRunning) {
                await hands.send({ image: videoElement });
            }
        },
        width: 1280,
        height: 720
    });

    await camera.start();
}

function onHandResults(results) {
    // Sicherheitscheck
    if (!canvasCtx || !canvasElement) return;

    // Canvas leeren
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Hand erkannt
        if (statusDot) statusDot.classList.add('active');
        if (statusText) statusText.textContent = 'Hand erkannt';

        // Hand zeichnen (dezent)
        drawHandSkeleton(landmarks);

        // Zeigefinger-Spitze tracken
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];

        // Pinch erkennen (Daumen + Zeigefinger zusammen)
        const pinchDistance = getDistance(indexTip, thumbTip);
        const isPinching = pinchDistance < PINCH_THRESHOLD;

        // Finger-Cursor Position (nicht gespiegelt für Rückkamera)
        const screenX = indexTip.x * window.innerWidth;
        const screenY = indexTip.y * window.innerHeight;

        // Cursor bewegen
        if (fingerCursor) {
            fingerCursor.style.left = screenX + 'px';
            fingerCursor.style.top = screenY + 'px';

            // Pinch visuell anzeigen
            if (isPinching) {
                fingerCursor.classList.add('pinch');
            } else {
                fingerCursor.classList.remove('pinch');
            }
        }

        // 3D Interaktion
        handle3DInteraction(indexTip, isPinching);

        // Gesten-Anzeige
        updateGestureDisplay(isPinching);

        lastPinchState = isPinching;

    } else {
        // Keine Hand
        if (statusDot) statusDot.classList.remove('active');
        if (statusText) statusText.textContent = 'Suche Hand...';
        if (fingerCursor) fingerCursor.style.left = '-100px';
        if (gestureIndicator) gestureIndicator.classList.remove('visible');

        // Objekt loslassen wenn Hand weg
        if (grabbedObject) {
            releaseObject();
        }
    }
}

function drawHandSkeleton(landmarks) {
    const w = canvasElement.width;
    const h = canvasElement.height;

    // Verbindungen (dezent)
    const connections = [
        // Daumen
        [0, 1], [1, 2], [2, 3], [3, 4],
        // Zeigefinger
        [0, 5], [5, 6], [6, 7], [7, 8],
        // Mittelfinger
        [0, 9], [9, 10], [10, 11], [11, 12],
        // Ringfinger
        [0, 13], [13, 14], [14, 15], [15, 16],
        // Kleiner Finger
        [0, 17], [17, 18], [18, 19], [19, 20],
        // Handfläche
        [5, 9], [9, 13], [13, 17]
    ];

    // Linien zeichnen
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    canvasCtx.lineWidth = 2;

    for (const [i, j] of connections) {
        const p1 = landmarks[i];
        const p2 = landmarks[j];

        canvasCtx.beginPath();
        canvasCtx.moveTo(p1.x * w, p1.y * h);
        canvasCtx.lineTo(p2.x * w, p2.y * h);
        canvasCtx.stroke();
    }

    // Fingerspitzen hervorheben
    const fingertips = [4, 8, 12, 16, 20];

    for (const i of fingertips) {
        const p = landmarks[i];
        const x = p.x * w;
        const y = p.y * h;

        // Glow Effekt
        const gradient = canvasCtx.createRadialGradient(x, y, 0, x, y, 15);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        canvasCtx.fillStyle = gradient;
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 15, 0, Math.PI * 2);
        canvasCtx.fill();

        // Punkt
        canvasCtx.fillStyle = 'white';
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 4, 0, Math.PI * 2);
        canvasCtx.fill();
    }
}

function getDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

function handle3DInteraction(indexTip, isPinching) {
    // 2D Position zu 3D umrechnen
    // Nicht gespiegelt für Rückkamera
    const x3d = (indexTip.x - 0.5) * 2;  // -1 bis 1
    const y3d = (0.5 - indexTip.y) * 1.5; // -0.75 bis 0.75
    const z3d = -1.5; // Fixe Tiefe

    // 3D Cursor bewegen
    if (cursor3D) {
        cursor3D.setAttribute('position', `${x3d} ${y3d} ${z3d}`);

        if (isPinching) {
            cursor3D.setAttribute('color', '#30d158');
            cursor3D.setAttribute('radius', '0.03');
        } else {
            cursor3D.setAttribute('color', '#ffffff');
            cursor3D.setAttribute('radius', '0.02');
        }
    }

    // Objekte checken
    const objects = document.querySelectorAll('.interactive');

    if (isPinching && !lastPinchState) {
        // Gerade angefangen zu pinchen - versuche zu greifen
        objects.forEach(obj => {
            if (grabbedObject) return;

            const pos = obj.getAttribute('position');
            const dist = Math.sqrt(
                Math.pow(pos.x - x3d, 2) +
                Math.pow(pos.y - y3d, 2)
            );

            if (dist < 0.3) {
                grabbedObject = obj;
                obj.setAttribute('material', 'emissive', '#ffffff');
                obj.setAttribute('material', 'emissiveIntensity', '0.3');

                // Animation stoppen
                obj.removeAttribute('animation__float');
            }
        });
    }

    if (!isPinching && lastPinchState && grabbedObject) {
        // Losgelassen
        releaseObject();
    }

    // Gegriffenes Objekt bewegen
    if (grabbedObject && isPinching) {
        grabbedObject.setAttribute('position', `${x3d} ${y3d} ${z3d}`);
    }
}

function releaseObject() {
    if (grabbedObject) {
        grabbedObject.setAttribute('material', 'emissive', '#000000');
        grabbedObject.setAttribute('material', 'emissiveIntensity', '0');

        // Sanft schweben lassen wo es ist
        const pos = grabbedObject.getAttribute('position');
        grabbedObject.setAttribute('animation__float', {
            property: 'position',
            to: `${pos.x} ${pos.y + 0.05} ${pos.z}`,
            dir: 'alternate',
            dur: 2000,
            loop: true,
            easing: 'easeInOutSine'
        });

        grabbedObject = null;
    }
}

function updateGestureDisplay(isPinching) {
    if (isPinching) {
        gestureText.textContent = grabbedObject ? '✊ Objekt gegriffen' : '👌 Pinch';
        gestureIndicator.classList.add('visible');
    } else {
        gestureText.textContent = '☝️ Zeigen';
        gestureIndicator.classList.add('visible');
    }
}

console.log('AR Hand Tracking loaded');
