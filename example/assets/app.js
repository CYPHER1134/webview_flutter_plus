let scene, camera, renderer, controls;
let viewCubeScene, viewCubeCamera, viewCubeRenderer, viewCubeMesh;
let viewCubeRaycaster, viewCubeMouse;
let modelMaxDim = 0;
const gridSize = 100;
const gridHalf = gridSize / 2;

// چند مدل
let currentMeshes = [];
let boxHelpers = [];
let selectedMesh = null;

// درگ
let isDragging = false;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let plane = new THREE.Plane();
let planeIntersection = new THREE.Vector3();
let dragOffset = new THREE.Vector3();
let dragStartTime = 0; // برای تشخیص لانگ پرس روی تاچ

// رنگ‌ها
let originalMaterial = null;
let dragMaterial = null;

init();
animate();

function logToFlutter(msg) {
    try {
        window.FlutterLog && window.FlutterLog.postMessage(String(msg));
    } catch (_) {}
    console.log(msg);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaeaea);
    scene.add(new THREE.GridHelper(gridSize, 20));

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(80, 80, 120);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    initViewCube();
    setupUI();
    setupDragEvents();

    window.addEventListener("resize", onWindowResize, false);

    // انتخاب مدل با کلیک/تاپ
    renderer.domElement.addEventListener("click", onSelectModel);
    renderer.domElement.addEventListener("touchend", onSelectModel); // برای تاچ
}

function setupUI() {
    const fileInput = document.getElementById("file-input");
    fileInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => loadSTL(e.target.result);
        reader.readAsArrayBuffer(file);
    });

    document.getElementById("reset-camera").addEventListener("click", () => {
        controls.reset();
        camera.position.set(80, 80, 120);
        controls.target.set(0, 0, 0);
    });

    document.getElementById("reset-rotation").addEventListener("click", () => {
        if (!selectedMesh) {
            alert("هیچ مدلی انتخاب نشده!");
            return;
        }
        selectedMesh.rotation.set(0, 0, 0);
        const idx = currentMeshes.indexOf(selectedMesh);
        if (idx >= 0) boxHelpers[idx].update();
    });

    document.getElementById("remove-model").addEventListener("click", () => {
        if (!selectedMesh) {
            alert("هیچ مدلی انتخاب نشده!");
            return;
        }
        const idx = currentMeshes.indexOf(selectedMesh);
        if (idx >= 0) {
            scene.remove(currentMeshes[idx]);
            scene.remove(boxHelpers[idx]);
            currentMeshes[idx].geometry.dispose();
            currentMeshes[idx].material.dispose();
            boxHelpers[idx].geometry.dispose();
            boxHelpers[idx].material.dispose();
            currentMeshes.splice(idx, 1);
            boxHelpers.splice(idx, 1);
            selectedMesh = null;
        }
    });

    document.getElementById("rotate-x-pos").addEventListener("click", () => rotateModel("x", 15));
    document.getElementById("rotate-x-neg").addEventListener("click", () => rotateModel("x", -15));
    document.getElementById("rotate-y-pos").addEventListener("click", () => rotateModel("y", 15));
    document.getElementById("rotate-y-neg").addEventListener("click", () => rotateModel("y", -15));
    document.getElementById("rotate-z-pos").addEventListener("click", () => rotateModel("z", 15));
    document.getElementById("rotate-z-neg").addEventListener("click", () => rotateModel("z", -15));

    document.getElementById("apply-scale").addEventListener("click", () => {
        const scaleInput = document.getElementById("scale-input");
        const scaleValue = parseFloat(scaleInput.value);
        if (isNaN(scaleValue) || scaleValue <= 0) {
            alert("لطفاً یک مقدار معتبر وارد کنید!");
            return;
        }
        scaleModel(scaleValue);
    });
}

function setupDragEvents() {
    // رویدادهای ماوس
    renderer.domElement.addEventListener("dblclick", startDrag);
    renderer.domElement.addEventListener("mousemove", moveDrag);
    renderer.domElement.addEventListener("mouseup", endDrag);

    // رویدادهای تاچ (برای موبایل)
    renderer.domElement.addEventListener("touchstart", startDragTouch);
    renderer.domElement.addEventListener("touchmove", moveDrag);
    renderer.domElement.addEventListener("touchend", endDrag);
}

function getClientCoords(event) {
    // مختصات یکپارچه برای ماوس/تاچ
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    return { clientX, clientY };
}

function onSelectModel(event) {
    event.preventDefault();
    const coords = getClientCoords(event);
    mouse.x = (coords.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(coords.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(currentMeshes);
    if (intersects.length > 0) {
        selectedMesh = intersects[0].object;
        logToFlutter("Model selected.");
    }
}

function startDrag(event) {
    if (!selectedMesh) return;
    const coords = getClientCoords(event);
    mouse.x = (coords.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(coords.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(selectedMesh);
    if (intersects.length > 0) {
        isDragging = true;
        controls.enabled = false;
        // تغییر رنگ
        if (selectedMesh.material) {
            originalMaterial = selectedMesh.material;
            dragMaterial = originalMaterial.clone();
            if (dragMaterial.uniforms) {
                dragMaterial.uniforms.insideColor.value = new THREE.Color(0x999999);
                dragMaterial.uniforms.outsideColor.value = new THREE.Color(0x999999);
            } else if (dragMaterial.color) {
                dragMaterial.color = new THREE.Color(0x999999);
            }
            selectedMesh.material = dragMaterial;
        }
        plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), intersects[0].point);
        dragOffset.copy(intersects[0].point).sub(selectedMesh.position);
    }
}

function startDragTouch(event) {
    if (event.touches.length !== 1 || !selectedMesh) return; // فقط تک انگشت
    dragStartTime = Date.now();
    const coords = getClientCoords(event);
    mouse.x = (coords.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(coords.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(selectedMesh);
    if (intersects.length > 0) {
        // چک لانگ پرس (hold بیش از 300ms)
        setTimeout(() => {
            if (Date.now() - dragStartTime >= 300 && !isDragging) {
                isDragging = true;
                controls.enabled = false;
                // تغییر رنگ
                if (selectedMesh.material) {
                    originalMaterial = selectedMesh.material;
                    dragMaterial = originalMaterial.clone();
                    if (dragMaterial.uniforms) {
                        dragMaterial.uniforms.insideColor.value = new THREE.Color(0x999999);
                        dragMaterial.uniforms.outsideColor.value = new THREE.Color(0x999999);
                    } else if (dragMaterial.color) {
                        dragMaterial.color = new THREE.Color(0x999999);
                    }
                    selectedMesh.material = dragMaterial;
                }
                plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), intersects[0].point);
                dragOffset.copy(intersects[0].point).sub(selectedMesh.position);
            }
        }, 300);
    }
}

function moveDrag(event) {
    event.preventDefault();
    if (!isDragging || !selectedMesh) return;
    const coords = getClientCoords(event);
    mouse.x = (coords.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(coords.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(plane, planeIntersection)) {
        let newPos = planeIntersection.sub(dragOffset);
        newPos.x = Math.max(-gridHalf, Math.min(gridHalf, newPos.x));
        newPos.z = Math.max(-gridHalf, Math.min(gridHalf, newPos.z));
        selectedMesh.position.x = newPos.x;
        selectedMesh.position.z = newPos.z;
        const idx = currentMeshes.indexOf(selectedMesh);
        if (idx >= 0) boxHelpers[idx].update();
    }
}

function endDrag(event) {
    if (isDragging) {
        isDragging = false;
        controls.enabled = true;
        if (selectedMesh && originalMaterial) selectedMesh.material = originalMaterial;
    }
}

function rotateModel(axis, degrees) {
    if (!selectedMesh) return;
    const radians = degrees * (Math.PI / 180);
    selectedMesh.rotation[axis] += radians;
    const box = new THREE.Box3().setFromObject(selectedMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    selectedMesh.position.y = size.y / 2;
    const idx = currentMeshes.indexOf(selectedMesh);
    if (idx >= 0) boxHelpers[idx].update();
}

function scaleModel(scale) {
    if (!selectedMesh) return;
    selectedMesh.scale.set(scale, scale, scale);
    selectedMesh.geometry.computeBoundingBox();
    const bbox = selectedMesh.geometry.boundingBox;
    const height = (bbox.max.y - bbox.min.y) * selectedMesh.scale.y;
    selectedMesh.position.y = height / 2;
    const idx = currentMeshes.indexOf(selectedMesh);
    if (idx >= 0) boxHelpers[idx].update();
    fitCameraToObject(selectedMesh, 1.6);
}

function initViewCube() {
    viewCubeScene = new THREE.Scene();
    viewCubeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    viewCubeCamera.position.set(0, 0, 50);
    const cubeGeo = new THREE.BoxGeometry(10, 10, 10);
    const cubeMat = new THREE.MeshNormalMaterial({ flatShading: true });
    viewCubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
    viewCubeScene.add(viewCubeMesh);
    viewCubeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    viewCubeRenderer.setSize(100, 100);
    document.getElementById("viewcube").appendChild(viewCubeRenderer.domElement);
    viewCubeRaycaster = new THREE.Raycaster();
    viewCubeMouse = new THREE.Vector2();
    viewCubeRenderer.domElement.addEventListener("click", onViewCubeClick);
    viewCubeRenderer.domElement.addEventListener("touchend", onViewCubeClick); // برای تاچ
}

function loadSTL(source) {
    try {
        const loader = new THREE.STLLoader();
        const geometry = loader.parse(source);
        geometry.center();
        geometry.rotateX(-Math.PI / 2);
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const height = bbox.max.y - bbox.min.y;

        // ShaderMaterial برای هر مدل
        const material = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                void main() {
                    vNormal = normalMatrix * normal;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                uniform vec3 lightPosition;
                uniform vec3 insideColor;
                uniform vec3 outsideColor;
                uniform float gridHalfSize;
                void main() {
                    vec3 color = (abs(vWorldPosition.x) > gridHalfSize || abs(vWorldPosition.z) > gridHalfSize) ? outsideColor : insideColor;
                    vec3 lightDir = normalize(lightPosition - vWorldPosition);
                    float diff = max(dot(normalize(vNormal), lightDir), 0.0);
                    vec3 ambient = color * 0.9;
                    vec3 diffuse = color * diff * 0.7;
                    gl_FragColor = vec4(ambient + diffuse, 1.0);
                }
            `,
            uniforms: {
                lightPosition: { value: new THREE.Vector3(100, 200, 100) },
                insideColor: { value: new THREE.Color(0x6c7ae0) },
                outsideColor: { value: new THREE.Color(0xff0000) },
                gridHalfSize: { value: gridHalf }
            },
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = height / 2;
        scene.add(mesh);
        currentMeshes.push(mesh);

        const helper = new THREE.BoxHelper(mesh, 0xff0000);
        scene.add(helper);
        boxHelpers.push(helper);

        fitCameraToObject(mesh, 1.6);
    } catch (e) {
        alert("خطا در بارگذاری STL: " + e.message);
    }
}

function fitCameraToObject(object, offset = 1.4) {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    modelMaxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (modelMaxDim / 2) / Math.tan(fov / 2);
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const newPos = new THREE.Vector3().addVectors(center, dir.multiplyScalar(distance * offset));
    new TWEEN.Tween(camera.position)
        .to({ x: newPos.x, y: newPos.y, z: newPos.z }, 700)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    controls.target.copy(center);
    camera.updateProjectionMatrix();
}

function onViewCubeClick(event) {
    event.preventDefault();
    const rect = viewCubeRenderer.domElement.getBoundingClientRect();
    const coords = getClientCoords(event);
    viewCubeMouse.x = ((coords.clientX - rect.left) / rect.width) * 2 - 1;
    viewCubeMouse.y = -((coords.clientY - rect.top) / rect.height) * 2 + 1;
    viewCubeRaycaster.setFromCamera(viewCubeMouse, viewCubeCamera);
    const intersects = viewCubeRaycaster.intersectObject(viewCubeMesh);
    if (intersects.length > 0 && selectedMesh) {
        const normal = intersects[0].face.normal.clone();
        normal.applyMatrix4(viewCubeMesh.matrixWorld);
        const targetPos = normal.multiplyScalar(modelMaxDim * 1.8);
        new TWEEN.Tween(camera.position)
            .to({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, 600)
            .easing(TWEEN.Easing.Cubic.Out)
            .start();
        controls.target.set(0, 0, 0);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    TWEEN.update();
    renderer.render(scene, camera);
    const offset = new THREE.Vector3(0, 0, 20).applyQuaternion(camera.quaternion);
    viewCubeCamera.position.copy(offset);
    viewCubeCamera.lookAt(viewCubeScene.position);
    viewCubeRenderer.render(viewCubeScene, viewCubeCamera);
}