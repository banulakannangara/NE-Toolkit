const DEVICE_DEFINITIONS = {
    pc: {
        label: 'PC',
        icon: '<svg viewBox="0 0 64 64"><rect x="14" y="18" width="36" height="24" rx="4"></rect><rect x="20" y="24" width="24" height="10" rx="2"></rect><rect x="24" y="42" width="16" height="8" rx="2"></rect></svg>'
    },
    laptop: {
        label: 'Laptop',
        icon: '<svg viewBox="0 0 64 64"><rect x="16" y="18" width="32" height="20" rx="4"></rect><rect x="22" y="22" width="20" height="10" rx="2"></rect><rect x="24" y="40" width="16" height="6" rx="2"></rect></svg>'
    },
    server: {
        label: 'Server',
        icon: '<svg viewBox="0 0 64 64"><rect x="14" y="18" width="36" height="28" rx="4"></rect><rect x="20" y="24" width="24" height="6" rx="2"></rect><rect x="20" y="34" width="24" height="6" rx="2"></rect><circle cx="32" cy="44" r="4"></circle></svg>'
    },
    switch: {
        label: 'Switch',
        icon: '<svg viewBox="0 0 64 64"><rect x="16" y="20" width="32" height="24" rx="5"></rect><line x1="20" y1="28" x2="44" y2="28"></line><line x1="20" y1="36" x2="44" y2="36"></line><circle cx="24" cy="32" r="2"></circle><circle cx="40" cy="32" r="2"></circle></svg>'
    },
    router: {
        label: 'Router',
        icon: '<svg viewBox="0 0 64 64"><rect x="16" y="20" width="32" height="24" rx="5"></rect><path d="M24 28h16"></path><path d="M24 36h16"></path><path d="M28 24l-8 10"></path><path d="M36 24l8 10"></path></svg>'
    }
};

const DEVICE_WIDTH = 112;
const DEVICE_HEIGHT = 96;

const networkState = {
    devices: [],
    connections: [],
    selectedDeviceId: null,
    selectedConnectionId: null,
    mode: 'select',
    pendingDeviceType: 'pc',
    connectionSourceId: null,
    labMode: 'edit',
    simulationRuntime: {
        isRunning: false,
        events: []
    },
    sendFrameState: null,
    lastFrameResult: null,
    switchRuntime: {},
    typeCounters: {},
    connectionCounter: 0,
    connectionTestState: null,
    lastConnectionTestResult: null,
    history: [],
    future: []
};

let dragState = null;
let inspectorDrafts = {};
let frameAnimation = null;
let canvasResizeObserver = null;

function initializeLab() {
    bindEvents();
    bindCanvasResizeObserver();
    render();
}

function bindEvents() {
    document.querySelectorAll('.toolbar-button[data-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            const mode = button.dataset.mode;
            setMode(mode);
        });
    });

    document.querySelectorAll('.toolbar-button[data-action]').forEach((button) => {
        button.addEventListener('click', () => handleToolbarAction(button.dataset.action));
    });

    document.querySelectorAll('.palette-item').forEach((item) => {
        item.addEventListener('click', () => {
            selectPaletteDevice(item.dataset.type);
        });

        item.addEventListener('dragstart', (event) => {
            if (!canEditTopology()) {
                event.preventDefault();
                reportEditingLocked();
                return;
            }
            event.dataTransfer.setData('text/plain', item.dataset.type);
            event.dataTransfer.effectAllowed = 'copy';
        });
    });

    const canvas = document.getElementById('networkCanvas');
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('dragover', (event) => {
        if (!canEditTopology()) {
            return;
        }
        event.preventDefault();
        canvas.classList.add('is-drop-target');
    });
    canvas.addEventListener('dragleave', () => {
        canvas.classList.remove('is-drop-target');
    });
    canvas.addEventListener('drop', (event) => {
        if (!canEditTopology()) {
            event.preventDefault();
            canvas.classList.remove('is-drop-target');
            reportEditingLocked();
            return;
        }
        event.preventDefault();
        canvas.classList.remove('is-drop-target');
        const type = event.dataTransfer.getData('text/plain') || networkState.pendingDeviceType;
        const rect = canvas.getBoundingClientRect();
        addDevice(type, event.clientX - rect.left, event.clientY - rect.top);
    });

    document.addEventListener('keydown', handleKeydown);
}

function bindCanvasResizeObserver() {
    const canvas = document.getElementById('networkCanvas');
    if (!canvas || canvasResizeObserver) {
        return;
    }

    canvasResizeObserver = new ResizeObserver(() => {
        syncConnectionLayerDimensions();
        renderConnections();
    });
    canvasResizeObserver.observe(canvas);
}

function syncConnectionLayerDimensions() {
    const canvas = document.getElementById('networkCanvas');
    const svg = document.getElementById('connectionLayer');
    if (!canvas || !svg) {
        return { width: 0, height: 0 };
    }

    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    return { width, height };
}

function createLabSnapshot() {
    return JSON.parse(JSON.stringify({
        devices: networkState.devices,
        connections: networkState.connections,
        selectedDeviceId: networkState.selectedDeviceId,
        selectedConnectionId: networkState.selectedConnectionId,
        mode: networkState.mode,
        pendingDeviceType: networkState.pendingDeviceType,
        typeCounters: networkState.typeCounters,
        connectionCounter: networkState.connectionCounter,
        connectionSourceId: networkState.connectionSourceId,
        connectionTestState: networkState.connectionTestState,
        lastConnectionTestResult: networkState.lastConnectionTestResult,
        switchRuntime: networkState.switchRuntime
    }));
}

function setMode(mode) {
    if (!canEditTopology() && mode !== 'select') {
        reportEditingLocked();
        return;
    }

    networkState.mode = mode;
    if (mode !== 'connect') {
        networkState.connectionSourceId = null;
    }
    updateToolbarButtons();
    updateStatus();
    render();
}

function selectPaletteDevice(type) {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    networkState.pendingDeviceType = type;
    networkState.mode = 'add';
    networkState.selectedConnectionId = null;
    updatePaletteSelection();
    updateToolbarButtons();
    updateStatus(`Placing ${DEVICE_DEFINITIONS[type].label}. Click the canvas to add it.`);
    render();
}

function handleToolbarAction(action) {
    if (action === 'simulate') {
        setLabMode(isSimulationMode() ? 'edit' : 'simulation');
        return;
    }

    if (action === 'simulationStart') {
        startSimulation();
        return;
    }

    if (action === 'simulationPause') {
        pauseSimulation();
        return;
    }

    if (action === 'simulationReset') {
        resetSimulation();
        return;
    }

    if (action === 'delete') {
        if (!canEditTopology()) {
            reportEditingLocked();
            return;
        }
        if (networkState.selectedConnectionId) {
            deleteConnection(networkState.selectedConnectionId);
        } else {
            setMode('delete');
        }
        return;
    }

    if (action === 'clear') {
        if (!canEditTopology()) {
            reportEditingLocked();
            return;
        }
        clearCanvas();
        return;
    }

    if (action === 'undo') {
        if (!canEditTopology()) {
            reportEditingLocked();
            return;
        }
        undo();
        return;
    }

    if (action === 'redo') {
        if (!canEditTopology()) {
            reportEditingLocked();
            return;
        }
        redo();
        return;
    }

    if (action === 'testConnection') {
        cancelFrameAnimation();
        networkState.sendFrameState = null;
        networkState.lastFrameResult = null;
        if (networkState.connectionTestState) {
            networkState.connectionTestState = null;
            networkState.lastConnectionTestResult = null;
            updateStatus('Connection test cancelled.');
            render();
        } else {
            networkState.connectionTestState = { phase: 'awaitSource', sourceId: null, message: 'Select source device' };
            networkState.lastConnectionTestResult = null;
            networkState.selectedConnectionId = null;
            updateStatus('Select source device');
            render();
        }
        return;
    }

    if (action === 'sendFrame') {
        if (networkState.sendFrameState) {
            cancelFrameAnimation();
            networkState.sendFrameState = null;
            networkState.lastFrameResult = null;
            updateStatus('Send Frame cancelled.');
        } else {
            networkState.connectionTestState = null;
            networkState.lastConnectionTestResult = null;
            networkState.sendFrameState = {
                phase: 'awaitSource',
                sourceId: null,
                message: 'Select source device'
            };
            networkState.lastFrameResult = null;
            networkState.selectedDeviceId = null;
            networkState.selectedConnectionId = null;
            updateStatus('Select source device');
        }
        updateToolbarButtons();
        render();
        return;
    }

}

function isSimulationMode() {
    return networkState.labMode === 'simulation';
}

function canEditTopology() {
    return !isSimulationMode();
}

function setLabMode(nextMode) {
    if (!['edit', 'simulation'].includes(nextMode) || networkState.labMode === nextMode) {
        return;
    }

    networkState.labMode = nextMode;
    networkState.mode = 'select';
    networkState.connectionSourceId = null;
    dragState = null;

    if (nextMode === 'simulation') {
        recordSimulationEvent('Entered Simulation Mode. Topology editing is locked.');
        updateStatus('Simulation Mode active. Select devices, test connections, or send frames.');
    } else {
        networkState.simulationRuntime.isRunning = false;
        recordSimulationEvent('Returned to Edit Mode. Topology editing is enabled.');
        updateStatus('Edit Mode active. Topology editing is enabled.');
    }

    render();
}

function startSimulation() {
    if (!isSimulationMode()) {
        updateStatus('Enter Simulation Mode before starting the simulation.');
        renderSimulationControls();
        return;
    }

    if (!networkState.simulationRuntime.isRunning) {
        networkState.simulationRuntime.isRunning = true;
        recordSimulationEvent('Simulation started.');
    }
    updateStatus('Simulation running. Send Frame remains available.');
    render();
}

function pauseSimulation() {
    if (!isSimulationMode()) {
        updateStatus('Simulation controls are available in Simulation Mode.');
        renderSimulationControls();
        return;
    }

    const wasAnimating = Boolean(frameAnimation);
    cancelFrameAnimation();
    networkState.simulationRuntime.isRunning = false;
    if (wasAnimating && networkState.lastFrameResult?.animationState === 'in-progress') {
        networkState.lastFrameResult.animationState = 'paused';
        networkState.lastFrameResult.events.push('Frame animation paused.');
    }
    recordSimulationEvent(wasAnimating ? 'Simulation paused. Active frame animation cancelled.' : 'Simulation paused.');
    updateStatus('Simulation paused. Topology is unchanged.');
    render();
}

function resetSimulation() {
    if (!isSimulationMode()) {
        updateStatus('Simulation controls are available in Simulation Mode.');
        renderSimulationControls();
        return;
    }

    cancelFrameAnimation();
    networkState.simulationRuntime.isRunning = false;
    networkState.switchRuntime = {};
    networkState.sendFrameState = null;
    networkState.lastFrameResult = null;
    networkState.connectionTestState = null;
    networkState.lastConnectionTestResult = null;
    networkState.simulationRuntime.events = [];
    recordSimulationEvent('Simulation reset. Runtime state and MAC tables cleared.');
    updateStatus('Simulation reset. Topology and device configuration are preserved.');
    render();
}

function recordSimulationEvent(message) {
    networkState.simulationRuntime.events.unshift(message);
    networkState.simulationRuntime.events = networkState.simulationRuntime.events.slice(0, 4);
}

function reportEditingLocked() {
    updateStatus('Topology editing is locked in Simulation Mode. Return to Edit Mode to make changes.');
    renderSimulationControls();
}

function addDevice(type, x, y) {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }
    if (!DEVICE_DEFINITIONS[type]) {
        return;
    }

    const canvas = document.getElementById('networkCanvas');
    const rect = canvas.getBoundingClientRect();
    const safeWidth = Math.max(90, rect.width - 140);
    const safeHeight = Math.max(90, rect.height - 130);

    const counter = networkState.typeCounters[type] || 0;
    networkState.typeCounters[type] = counter + 1;

    const device = {
        id: `${DEVICE_DEFINITIONS[type].label}${counter}`,
        type,
        name: `${DEVICE_DEFINITIONS[type].label}${counter}`,
        x: clamp(x - 56, 24, safeWidth),
        y: clamp(y - 48, 24, safeHeight),
        ip: '',
        subnetMask: '',
        gateway: '',
        mac: generateMacAddress(networkState.devices)
    };

    pushHistory();
    networkState.devices.push(device);
    networkState.selectedDeviceId = device.id;
    networkState.selectedConnectionId = null;
    networkState.mode = 'select';
    networkState.connectionSourceId = null;
    updateToolbarButtons();
    updateStatus(`${device.name} placed on the canvas.`);
    render();
}

function clearCanvas() {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    if (!networkState.devices.length && !networkState.connections.length) {
        updateStatus('The canvas is already empty.');
        return;
    }

    if (!window.confirm('Clear the current topology?')) {
        return;
    }

    pushHistory();
    networkState.devices = [];
    networkState.connections = [];
    networkState.selectedDeviceId = null;
    networkState.selectedConnectionId = null;
    networkState.connectionSourceId = null;
    networkState.sendFrameState = null;
    networkState.lastFrameResult = null;
    cancelFrameAnimation();
    networkState.switchRuntime = {};
    networkState.typeCounters = {};
    networkState.connectionCounter = 0;
    networkState.connectionTestState = null;
    networkState.lastConnectionTestResult = null;
    inspectorDrafts = {};
    updateStatus('Canvas cleared.');
    render();
}

function getDeviceById(id) {
    return networkState.devices.find((device) => device.id === id) || null;
}

function getConnectionById(id) {
    return networkState.connections.find((connection) => connection.id === id) || null;
}

function selectDevice(deviceId) {
    networkState.selectedDeviceId = deviceId;
    networkState.selectedConnectionId = null;
    networkState.mode = 'select';
    networkState.connectionSourceId = null;
    updateToolbarButtons();
    updateStatus(`Selected ${deviceId}.`);
    render();
}

function selectConnection(connectionId) {
    networkState.selectedConnectionId = connectionId;
    networkState.selectedDeviceId = null;
    networkState.mode = 'select';
    networkState.connectionSourceId = null;
    updateToolbarButtons();
    updateStatus(`Selected ${connectionId}.`);
    render();
}

function clearSelection() {
    networkState.selectedDeviceId = null;
    networkState.selectedConnectionId = null;
    networkState.connectionSourceId = null;
    render();
}

function deleteDevice(deviceId) {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    const device = getDeviceById(deviceId);
    if (!device) {
        return;
    }

    pushHistory();
    cancelFrameAnimation();
    networkState.devices = networkState.devices.filter((item) => item.id !== deviceId);
    const removedConnections = networkState.connections.filter((connection) => connection.source === deviceId || connection.target === deviceId);
    networkState.connections = networkState.connections.filter((connection) => connection.source !== deviceId && connection.target !== deviceId);
    removedConnections.forEach((connection) => releasePortAssignmentsForConnection(connection.id));
    if (networkState.selectedDeviceId === deviceId) {
        networkState.selectedDeviceId = null;
    }
    networkState.selectedConnectionId = null;
    networkState.connectionSourceId = null;
    delete inspectorDrafts[deviceId];

    updateStatus(`${device.name} removed.`);
    render();
}

function deleteConnection(connectionId) {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    const connection = getConnectionById(connectionId);
    if (!connection) {
        return;
    }

    pushHistory();
    cancelFrameAnimation();
    networkState.connections = networkState.connections.filter((item) => item.id !== connectionId);
    releasePortAssignmentsForConnection(connectionId);
    if (networkState.selectedConnectionId === connectionId) {
        networkState.selectedConnectionId = null;
    }

    updateStatus(`Connection ${connection.id} removed.`);
    render();
}

function addConnection(sourceId, targetId) {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    if (!sourceId || !targetId || sourceId === targetId) {
        if (sourceId && targetId && sourceId === targetId) {
            updateStatus('A device cannot connect to itself.');
        }
        return;
    }

    const existing = networkState.connections.some((connection) =>
        (connection.source === sourceId && connection.target === targetId) ||
        (connection.source === targetId && connection.target === sourceId)
    );

    if (existing) {
        updateStatus('That connection already exists.');
        return;
    }

    pushHistory();
    const connection = {
        id: `connection${networkState.connectionCounter}`,
        source: sourceId,
        target: targetId,
        type: 'ethernet'
    };
    networkState.connections.push(connection);
    assignPortsForConnection(connection);
    networkState.connectionCounter += 1;
    networkState.selectedDeviceId = null;
    networkState.selectedConnectionId = connection.id;
    networkState.mode = 'connect';
    networkState.connectionSourceId = null;
    updateToolbarButtons();
    updateStatus(`Connection created between ${sourceId} and ${targetId}.`);
    render();
}

function handleDeviceSelection(deviceId, event) {
    event.stopPropagation();

    if (networkState.sendFrameState) {
        const selectedDevice = getDeviceById(deviceId);
        if (!selectedDevice) {
            return;
        }

        if (!isCommunicationEndpoint(selectedDevice)) {
            networkState.sendFrameState = {
                ...networkState.sendFrameState,
                message: 'Switches cannot be used as frame endpoints. Select a PC, Laptop, Server, or Router.'
            };
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            updateStatus(networkState.sendFrameState.message);
            render();
            showFrameDrop(deviceId);
            return;
        }

        if (networkState.sendFrameState.phase === 'awaitSource') {
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            networkState.sendFrameState = {
                phase: 'awaitDestination',
                sourceId: deviceId,
                message: `Source: ${getDeviceById(deviceId)?.name || deviceId} — Select destination device`
            };
            networkState.lastFrameResult = null;
            updateStatus(networkState.sendFrameState.message);
            render();
            return;
        }

        if (networkState.sendFrameState.phase === 'awaitDestination') {
            if (deviceId === networkState.sendFrameState.sourceId) {
                networkState.sendFrameState = {
                    ...networkState.sendFrameState,
                    message: `Source: ${getDeviceById(deviceId)?.name || deviceId} — Select a different destination device`
                };
                updateStatus(networkState.sendFrameState.message);
                render();
                return;
            }

            const sourceDevice = getDeviceById(networkState.sendFrameState.sourceId);
            const destinationDevice = getDeviceById(deviceId);
            const validation = validateSendFrameEndpoints(sourceDevice, destinationDevice);
            if (!validation.valid) {
                networkState.sendFrameState = {
                    ...networkState.sendFrameState,
                    message: validation.reason
                };
                networkState.selectedDeviceId = deviceId;
                networkState.selectedConnectionId = null;
                updateStatus(validation.reason);
                render();
                showFrameDrop(sourceDevice?.id || destinationDevice?.id);
                return;
            }

            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            networkState.lastFrameResult = simulateSendFrame(sourceDevice, destinationDevice);
            networkState.lastFrameResult.animationState = 'in-progress';
            networkState.sendFrameState = {
                phase: 'animating',
                sourceId: networkState.sendFrameState.sourceId,
                message: 'Frame is travelling through the topology.'
            };
            updateStatus(networkState.lastFrameResult.success
                ? `Frame delivered: ${sourceDevice.name} → ${destinationDevice.name}`
                : `Frame failed: ${networkState.lastFrameResult.reason}`);
            render();
            startFrameAnimation(networkState.lastFrameResult.path, {
                onDelivered: () => {
                    if (networkState.lastFrameResult?.animationState !== 'in-progress') {
                        return;
                    }
                    networkState.lastFrameResult.animationState = 'delivered';
                    networkState.sendFrameState = {
                        phase: 'complete',
                        sourceId: sourceDevice.id,
                        message: null
                    };
                    updateStatus(`Frame delivered: ${sourceDevice.name} -> ${destinationDevice.name}`);
                    render();
                },
                onDropped: (reason) => {
                    if (networkState.lastFrameResult?.animationState !== 'in-progress') {
                        return;
                    }
                    networkState.lastFrameResult.animationState = 'dropped';
                    networkState.lastFrameResult.success = false;
                    networkState.lastFrameResult.reason = reason;
                    networkState.lastFrameResult.action = 'DROP';
                    networkState.lastFrameResult.events.push(`Frame dropped: ${reason}`);
                    networkState.sendFrameState = {
                        phase: 'complete',
                        sourceId: sourceDevice.id,
                        message: reason
                    };
                    updateStatus(`Frame failed: ${reason}`);
                    render();
                }
            });
            return;
        }
    }

    if (networkState.connectionTestState) {
        const selectedDevice = getDeviceById(deviceId);
        if (selectedDevice && !isCommunicationEndpoint(selectedDevice)) {
            networkState.connectionTestState = {
                ...networkState.connectionTestState,
                message: 'Switches cannot be used as IP communication endpoints. Select a PC, Laptop, Server, or Router.'
            };
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            updateStatus(networkState.connectionTestState.message);
            render();
            return;
        }

        if (networkState.connectionTestState.phase === 'awaitSource') {
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            networkState.connectionTestState = {
                phase: 'awaitDestination',
                sourceId: deviceId,
                message: `Source: ${getDeviceById(deviceId)?.name || deviceId} — Select destination device`
            };
            networkState.lastConnectionTestResult = null;
            updateStatus(networkState.connectionTestState.message);
            render();
            return;
        }

        if (networkState.connectionTestState.phase === 'awaitDestination') {
            if (deviceId === networkState.connectionTestState.sourceId) {
                networkState.connectionTestState = {
                    ...networkState.connectionTestState,
                    message: `Source: ${getDeviceById(deviceId)?.name || deviceId} — Select a different destination device`
                };
                updateStatus(networkState.connectionTestState.message);
                render();
                return;
            }

            const sourceDevice = getDeviceById(networkState.connectionTestState.sourceId);
            const targetDevice = getDeviceById(deviceId);
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            networkState.lastConnectionTestResult = analyzeCommunication(sourceDevice, targetDevice);
            networkState.connectionTestState = {
                phase: 'complete',
                sourceId: networkState.connectionTestState.sourceId,
                message: null
            };
            updateStatus(networkState.lastConnectionTestResult?.possible
                ? `Connection possible: ${sourceDevice?.name || 'source'} → ${targetDevice?.name || 'target'}`
                : `Connection test failed: ${networkState.lastConnectionTestResult?.reason || 'Unknown issue'}`);
            render();
            return;
        }
    }

    if (networkState.mode === 'delete') {
        deleteDevice(deviceId);
        return;
    }

    if (networkState.mode === 'connect') {
        if (!networkState.connectionSourceId) {
            networkState.connectionSourceId = deviceId;
            networkState.selectedDeviceId = deviceId;
            networkState.selectedConnectionId = null;
            updateStatus(`Connection started from ${deviceId}. Select a second device.`);
            render();
            return;
        }

        if (networkState.connectionSourceId === deviceId) {
            updateStatus('A device cannot connect to itself.');
            return;
        }

        addConnection(networkState.connectionSourceId, deviceId);
        return;
    }

    selectDevice(deviceId);
}

function handleCanvasClick(event) {
    if (event.target.closest('.device')) {
        return;
    }

    if (event.target.closest('.connection')) {
        return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (!canEditTopology()) {
        clearSelection();
        return;
    }

    if (networkState.mode === 'add') {
        addDevice(networkState.pendingDeviceType, x, y);
        return;
    }

    if (networkState.mode === 'connect') {
        networkState.connectionSourceId = null;
        networkState.selectedConnectionId = null;
        updateStatus('Connection cancelled.');
        render();
        return;
    }

    clearSelection();
}

function isEditableElement(target) {
    if (!target) {
        return false;
    }

    const tagName = target.tagName ? target.tagName.toLowerCase() : '';
    if (['input', 'textarea', 'select'].includes(tagName)) {
        return true;
    }

    if (target.isContentEditable) {
        return true;
    }

    return Boolean(target.closest && target.closest('[contenteditable="true"]'));
}

function handleKeydown(event) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditableElement(event.target)) {
        if (!canEditTopology()) {
            reportEditingLocked();
            return;
        }
        if (networkState.selectedConnectionId) {
            deleteConnection(networkState.selectedConnectionId);
        } else if (networkState.selectedDeviceId) {
            deleteDevice(networkState.selectedDeviceId);
        }
    }
}

function pushHistory() {
    const snapshot = createLabSnapshot();

    networkState.history.push(snapshot);
    if (networkState.history.length > 30) {
        networkState.history.shift();
    }
    networkState.future = [];
}

function undo() {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    if (!networkState.history.length) {
        updateStatus('Nothing to undo.');
        return;
    }

    const snapshot = networkState.history.pop();
    networkState.future.push(createLabSnapshot());

    restoreSnapshot(snapshot);
    updateStatus('Undid the last action.');
    render();
}

function redo() {
    if (!canEditTopology()) {
        reportEditingLocked();
        return;
    }

    if (!networkState.future.length) {
        updateStatus('Nothing to redo.');
        return;
    }

    const snapshot = networkState.future.pop();
    networkState.history.push(createLabSnapshot());

    restoreSnapshot(snapshot);
    updateStatus('Redid the last action.');
    render();
}

function restoreSnapshot(snapshot) {
    networkState.devices = snapshot.devices || [];
    networkState.connections = snapshot.connections || [];
    networkState.selectedDeviceId = snapshot.selectedDeviceId || null;
    networkState.selectedConnectionId = snapshot.selectedConnectionId || null;
    networkState.mode = snapshot.mode || 'select';
    networkState.pendingDeviceType = snapshot.pendingDeviceType || 'pc';
    networkState.typeCounters = snapshot.typeCounters || {};
    networkState.connectionCounter = typeof snapshot.connectionCounter === 'number' ? snapshot.connectionCounter : 0;
    networkState.connectionSourceId = snapshot.connectionSourceId || null;
    networkState.connectionTestState = snapshot.connectionTestState || null;
    networkState.lastConnectionTestResult = snapshot.lastConnectionTestResult || null;
    networkState.switchRuntime = snapshot.switchRuntime || {};
    inspectorDrafts = {};
}

function render() {
    renderConnections();
    renderDevices();
    renderPropertiesPanel();
    updateToolbarButtons();
    updatePaletteSelection();
    renderSimulationControls();
    updateStatus();
}

function renderConnections() {
    const svg = document.getElementById('connectionLayer');
    if (!svg) {
        return;
    }

    syncConnectionLayerDimensions();
    svg.innerHTML = '';

    networkState.connections.forEach((connection) => {
        const source = getDeviceById(connection.source);
        const target = getDeviceById(connection.target);

        if (!source || !target) {
            return;
        }

        const isSelected = networkState.selectedConnectionId === connection.id;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', `connection${isSelected ? ' is-selected' : ''}`);
        line.setAttribute('x1', source.x + DEVICE_WIDTH / 2);
        line.setAttribute('y1', source.y + DEVICE_HEIGHT / 2);
        line.setAttribute('x2', target.x + DEVICE_WIDTH / 2);
        line.setAttribute('y2', target.y + DEVICE_HEIGHT / 2);
        line.setAttribute('stroke', isSelected ? 'rgba(255, 209, 102, 0.98)' : 'rgba(79, 209, 255, 0.84)');
        line.setAttribute('stroke-width', isSelected ? '3.2' : '2.4');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-dasharray', '8 8');
        line.addEventListener('click', (event) => {
            event.stopPropagation();
            selectConnection(connection.id);
        });
        svg.appendChild(line);
    });
}

function renderDevices() {
    const layer = document.getElementById('deviceLayer');
    layer.innerHTML = '';

    if (!networkState.devices.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'The canvas is ready. Drag a device from the palette or click to place one.';
        emptyState.style.position = 'absolute';
        emptyState.style.top = '50%';
        emptyState.style.left = '50%';
        emptyState.style.transform = 'translate(-50%, -50%)';
        emptyState.style.maxWidth = '280px';
        emptyState.style.textAlign = 'center';
        layer.appendChild(emptyState);
        return;
    }

    networkState.devices.forEach((device) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `device${networkState.selectedDeviceId === device.id ? ' is-selected' : ''}${networkState.connectionSourceId === device.id ? ' is-connection-source' : ''}`;
        element.dataset.deviceId = device.id;
        element.style.left = `${device.x}px`;
        element.style.top = `${device.y}px`;
        element.innerHTML = `
            <span class="device__icon">${DEVICE_DEFINITIONS[device.type].icon}</span>
            <span class="device__label">${device.name}</span>
        `;

        element.addEventListener('click', (event) => handleDeviceSelection(device.id, event));
        element.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            selectDevice(device.id);
        });
        element.addEventListener('pointerdown', (event) => {
            if (networkState.mode !== 'select' || !canEditTopology()) {
                if (!canEditTopology()) {
                    reportEditingLocked();
                }
                return;
            }

            const canvas = document.getElementById('networkCanvas');
            const rect = canvas.getBoundingClientRect();
            dragState = {
                deviceId: device.id,
                offsetX: event.clientX - rect.left - device.x,
                offsetY: event.clientY - rect.top - device.y
            };
            selectDevice(device.id);
            document.addEventListener('pointermove', handlePointerMove);
            document.addEventListener('pointerup', endPointerDrag, { once: true });
        });

        layer.appendChild(element);
    });
}

function handlePointerMove(event) {
    if (!dragState) {
        return;
    }

    const canvas = document.getElementById('networkCanvas');
    const rect = canvas.getBoundingClientRect();
    const device = getDeviceById(dragState.deviceId);

    if (!device) {
        return;
    }

    device.x = clamp(event.clientX - rect.left - dragState.offsetX, 24, Math.max(90, rect.width - 136));
    device.y = clamp(event.clientY - rect.top - dragState.offsetY, 24, Math.max(90, rect.height - 126));
    render();
}

function endPointerDrag() {
    dragState = null;
    document.removeEventListener('pointermove', handlePointerMove);
    render();
}

function startFrameAnimation(path, callbacks = {}) {
    cancelFrameAnimation();

    if (!Array.isArray(path) || path.length < 2) {
        callbacks.onDropped?.('No topology path exists for frame animation.');
        return;
    }

    const layer = document.getElementById('frameAnimationLayer');
    if (!layer) {
        callbacks.onDropped?.('Frame animation layer is unavailable.');
        return;
    }

    const packet = document.createElement('div');
    packet.className = 'frame-packet';
    packet.setAttribute('aria-hidden', 'true');
    packet.innerHTML = '<span class="frame-packet__icon">FRAME</span>';
    layer.appendChild(packet);

    const animation = {
        packet,
        path: [...path],
        animationFrame: null,
        cleanupTimer: null,
        cancelled: false
    };
    frameAnimation = animation;

    const finish = (delivered, reason = '') => {
        if (frameAnimation !== animation || animation.cancelled) {
            return;
        }

        if (animation.animationFrame) {
            window.cancelAnimationFrame(animation.animationFrame);
        }

        packet.classList.remove('is-moving');
        packet.classList.add(delivered ? 'is-delivered' : 'is-dropped');
        clearFrameDeviceHighlights();
        if (delivered) {
            setFrameDeviceHighlight(path[path.length - 1], 'is-frame-destination');
        }

        animation.cleanupTimer = window.setTimeout(() => {
            if (frameAnimation !== animation) {
                return;
            }
            clearFrameDeviceHighlights();
            packet.remove();
            frameAnimation = null;
            if (delivered) {
                callbacks.onDelivered?.();
            } else {
                callbacks.onDropped?.(reason || 'Topology changed before the frame reached its destination.');
            }
        }, delivered ? 480 : 720);
    };

    const animateHop = (hopIndex) => {
        if (frameAnimation !== animation || animation.cancelled) {
            return;
        }

        const sourceId = path[hopIndex];
        const targetId = path[hopIndex + 1];
        const initialSource = getDeviceCenter(sourceId);
        const initialTarget = getDeviceCenter(targetId);
        if (!initialSource || !initialTarget) {
            finish(false, 'A device on the topology path is no longer available.');
            return;
        }

        clearFrameDeviceHighlights();
        setFrameDeviceHighlight(path[0], 'is-frame-source');
        if (hopIndex > 0) {
            setFrameDeviceHighlight(sourceId, 'is-frame-hop');
        }
        setFrameDeviceHighlight(targetId, hopIndex === path.length - 2 ? 'is-frame-destination' : 'is-frame-hop');

        const distance = Math.hypot(initialTarget.x - initialSource.x, initialTarget.y - initialSource.y);
        const duration = clamp(distance * 2.2, 420, 1100);
        const startedAt = performance.now();
        packet.classList.add('is-moving');

        const move = (now) => {
            if (frameAnimation !== animation || animation.cancelled) {
                return;
            }

            const source = getDeviceCenter(sourceId);
            const target = getDeviceCenter(targetId);
            if (!source || !target) {
                finish(false, 'A device on the topology path was removed.');
                return;
            }

            const progress = Math.min(1, (now - startedAt) / duration);
            const x = source.x + (target.x - source.x) * progress;
            const y = source.y + (target.y - source.y) * progress;
            packet.style.left = `${x}px`;
            packet.style.top = `${y}px`;

            if (progress < 1) {
                animation.animationFrame = window.requestAnimationFrame(move);
                return;
            }

            if (hopIndex < path.length - 2) {
                animateHop(hopIndex + 1);
            } else {
                finish(true);
            }
        };

        packet.style.left = `${initialSource.x}px`;
        packet.style.top = `${initialSource.y}px`;
        animation.animationFrame = window.requestAnimationFrame(move);
    };

    animateHop(0);
}

function showFrameDrop(deviceId) {
    cancelFrameAnimation();

    const layer = document.getElementById('frameAnimationLayer');
    const position = getDeviceCenter(deviceId);
    if (!layer || !position) {
        return;
    }

    const packet = document.createElement('div');
    packet.className = 'frame-packet is-dropped';
    packet.setAttribute('aria-hidden', 'true');
    packet.innerHTML = '<span class="frame-packet__icon">DROP</span>';
    packet.style.left = `${position.x}px`;
    packet.style.top = `${position.y}px`;
    layer.appendChild(packet);
    setFrameDeviceHighlight(deviceId, 'is-frame-dropped');

    window.setTimeout(() => {
        packet.remove();
        clearFrameDeviceHighlights();
    }, 720);
}

function cancelFrameAnimation() {
    if (!frameAnimation) {
        return;
    }

    frameAnimation.cancelled = true;
    if (frameAnimation.animationFrame) {
        window.cancelAnimationFrame(frameAnimation.animationFrame);
    }
    if (frameAnimation.cleanupTimer) {
        window.clearTimeout(frameAnimation.cleanupTimer);
    }
    frameAnimation.packet?.remove();
    frameAnimation = null;
    clearFrameDeviceHighlights();
}

function getDeviceCenter(deviceId) {
    const device = getDeviceById(deviceId);
    if (!device) {
        return null;
    }

    return {
        x: device.x + DEVICE_WIDTH / 2,
        y: device.y + DEVICE_HEIGHT / 2
    };
}

function setFrameDeviceHighlight(deviceId, className) {
    document.querySelectorAll('.device').forEach((element) => {
        if (element.dataset.deviceId === deviceId) {
            element.classList.add(className);
        }
    });
}

function clearFrameDeviceHighlights() {
    document.querySelectorAll('.device').forEach((element) => {
        element.classList.remove('is-frame-source', 'is-frame-hop', 'is-frame-destination', 'is-frame-dropped');
    });
}

function renderPropertiesPanel() {
    const panel = document.getElementById('propertiesPanel');
    const selectedConnection = getConnectionById(networkState.selectedConnectionId);
    const selected = getDeviceById(networkState.selectedDeviceId);

    if (selectedConnection) {
        panel.innerHTML = `
            <div class="property-card">
                <h3>Connection</h3>
                <div class="property-grid">
                    <div class="property-field">
                        <label>ID</label>
                        <input type="text" value="${escapeHtml(selectedConnection.id)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Type</label>
                        <input type="text" value="${escapeHtml(selectedConnection.type)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Source</label>
                        <input type="text" value="${escapeHtml(selectedConnection.source)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Target</label>
                        <input type="text" value="${escapeHtml(selectedConnection.target)}" readonly>
                    </div>
                </div>
                <p class="property-info">This connection can be deleted with the toolbar or the keyboard shortcut when the inspector is not focused.</p>
            </div>
        `;
        return;
    }

    if (networkState.sendFrameState || networkState.lastFrameResult) {
        panel.innerHTML = getSendFramePanelHtml();
        attachSendFramePanelEvents();
        return;
    }

    if (networkState.connectionTestState || networkState.lastConnectionTestResult) {
        const testResult = networkState.lastConnectionTestResult;
        const statusClass = testResult ? getTestStatusClass() : '';
        const panelMessage = getConnectionTestPanelMessage();
        const details = testResult && testResult.possible ? [
            { label: 'Source', value: `${testResult.sourceName} — ${testResult.sourceIp}` },
            { label: 'Destination', value: `${testResult.destinationName} — ${testResult.destinationIp}` },
            { label: 'Network', value: testResult.network },
            { label: 'Path', value: testResult.path.join(' → ') }
        ] : [];

        panel.innerHTML = `
            <div class="property-card">
                <h3>Connection Test</h3>
                <div class="property-summary property-summary--subtle" id="connectionTestPanel">
                    <h4>RESULT</h4>
                    <div class="property-status-message ${escapeHtml(statusClass)}">
                        ${escapeHtml(panelMessage)}
                    </div>
                    ${details.length ? details.map((detail) => `
                        <div class="property-status-item">
                            <span>${escapeHtml(detail.label)}</span>
                            <strong>${escapeHtml(detail.value)}</strong>
                        </div>
                    `).join('') : ''}
                </div>
            </div>
        `;
        return;
    }

    if (!selected) {
        panel.innerHTML = '<p class="empty-state">Select a device to inspect its settings. Future milestones will add richer configuration and simulation controls here.</p>';
        return;
    }

    const supports = getSupportedConfigFields(selected);
    const draft = getInspectorDraft(selected);
    const nameValue = escapeHtml(getInspectorValue(selected, 'name'));
    const ipValue = escapeHtml(getInspectorValue(selected, 'ip'));
    const subnetValue = escapeHtml(getInspectorValue(selected, 'subnetMask'));
    const gatewayValue = escapeHtml(getInspectorValue(selected, 'gateway'));
    const macValue = escapeHtml(getInspectorValue(selected, 'mac'));
    const isValid = getInspectorValidity(selected, draft);
    const summary = getConfigurationSummary(selected);

    panel.innerHTML = `
        <div class="property-card">
            <h3>${escapeHtml(selected.name)}</h3>
            <div class="property-grid">
                <div class="property-section">
                    <h4>DEVICE</h4>
                    <div class="property-field">
                        <label for="deviceName">Device Name</label>
                        <input id="deviceName" type="text" value="${nameValue}" data-field="name" placeholder="Device name">
                        <div class="property-feedback" data-feedback-for="name"></div>
                    </div>
                    <div class="property-field">
                        <label>Device Type</label>
                        <input type="text" value="${escapeHtml(DEVICE_DEFINITIONS[selected.type].label)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Device ID</label>
                        <input type="text" value="${escapeHtml(selected.id)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Position</label>
                        <input type="text" value="${Math.round(selected.x)}, ${Math.round(selected.y)}" readonly>
                    </div>
                </div>
                ${supports.ip || supports.subnetMask || supports.gateway || supports.mac ? `
                    <div class="property-section">
                        <h4>NETWORK CONFIGURATION</h4>
                        ${supports.ip ? `
                            <div class="property-field">
                                <label for="deviceIp">IP Address</label>
                                <input id="deviceIp" type="text" value="${ipValue}" data-field="ip" placeholder="Not configured">
                                <div class="property-feedback" data-feedback-for="ip"></div>
                            </div>
                        ` : ''}
                        ${supports.subnetMask ? `
                            <div class="property-field">
                                <label for="deviceSubnet">Subnet Mask</label>
                                <input id="deviceSubnet" type="text" value="${subnetValue}" data-field="subnetMask" placeholder="Not configured">
                                <div class="property-feedback" data-feedback-for="subnetMask"></div>
                            </div>
                        ` : ''}
                        ${supports.gateway ? `
                            <div class="property-field">
                                <label for="deviceGateway">Default Gateway</label>
                                <input id="deviceGateway" type="text" value="${gatewayValue}" data-field="gateway" placeholder="Not configured">
                                <div class="property-feedback" data-feedback-for="gateway"></div>
                            </div>
                        ` : ''}
                        ${supports.mac ? `
                            <div class="property-field">
                                <label for="deviceMac">MAC Address</label>
                                <input id="deviceMac" type="text" value="${macValue}" data-field="mac" placeholder="Not configured">
                                <div class="property-feedback" data-feedback-for="mac"></div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="property-actions">
                <button id="applyDeviceConfig" class="toolbar-button" type="button" ${isValid ? '' : 'disabled'}>Apply Changes</button>
            </div>
            <div class="property-summary" id="deviceSummary">
                <h4>NETWORK</h4>
                <div class="property-summary-grid">
                    <div class="property-summary-item">
                        <span>IP</span>
                        <strong>${escapeHtml(summary.ip)}</strong>
                    </div>
                    <div class="property-summary-item">
                        <span>MASK</span>
                        <strong>${escapeHtml(summary.mask)}</strong>
                    </div>
                    <div class="property-summary-item">
                        <span>GATEWAY</span>
                        <strong>${escapeHtml(summary.gateway)}</strong>
                    </div>
                    <div class="property-summary-item">
                        <span>MAC</span>
                        <strong>${escapeHtml(summary.mac)}</strong>
                    </div>
                </div>
            </div>
            <div class="property-summary" id="deviceNetworkStatus">
                <h4>NETWORK STATUS</h4>
                <div class="property-status-message ${escapeHtml(getDeviceStatusClass(selected))}">
                    ${escapeHtml(getDeviceNetworkStatusText(selected))}
                </div>
                ${getDeviceNetworkStatusRows(selected).map((row) => `
                    <div class="property-status-item">
                        <span>${escapeHtml(row.label)}</span>
                        <strong>${escapeHtml(row.value)}</strong>
                    </div>
                `).join('')}
            </div>
            ${selected.type === 'switch' ? renderSwitchInspector(selected) : ''}
            <div class="property-summary property-summary--subtle" id="connectionTestPanel">
                <h4>CONNECTION TEST</h4>
                <div class="property-status-message ${escapeHtml(getTestStatusClass())}">
                    ${escapeHtml(getConnectionTestPanelMessage())}
                </div>
            </div>
            <p class="property-info">Configuration updates are applied only when you click Apply Changes, so invalid data never overwrites the current device state.</p>
        </div>
    `;

    panel.querySelectorAll('input[data-field]').forEach((field) => {
        field.addEventListener('input', (event) => {
            const selectedDevice = getDeviceById(networkState.selectedDeviceId);
            if (!selectedDevice) {
                return;
            }
            const fieldName = event.target.dataset.field;
            const nextDraft = { ...getInspectorDraft(selectedDevice), [fieldName]: event.target.value };
            inspectorDrafts[selectedDevice.id] = nextDraft;
            refreshInspectorValidation(selectedDevice);
            if (fieldName === 'name') {
                renderDevices();
            }
        });
    });

    const applyButton = panel.querySelector('#applyDeviceConfig');
    if (applyButton) {
        applyButton.addEventListener('click', () => {
            applyDeviceConfiguration();
        });
    }

    const clearMacButton = panel.querySelector('#clearMacTable');
    if (clearMacButton) {
        clearMacButton.addEventListener('click', () => {
            if (!window.confirm('Clear the MAC table for this switch?')) {
                return;
            }
            clearSwitchMacTable(selected.id);
            updateStatus(`MAC table cleared for ${selected.name}.`);
            render();
        });
    }

    refreshInspectorValidation(selected);
}

function getSendFramePanelHtml() {
    const sourceDevice = getDeviceById(networkState.sendFrameState?.sourceId);
    const sourceName = sourceDevice ? escapeHtml(sourceDevice.name) : 'Not selected';
    const destinationName = networkState.lastFrameResult ? escapeHtml(getDeviceById(networkState.lastFrameResult.path.slice(-1)[0])?.name || '') : 'Not selected';
    const statusMessage = networkState.sendFrameState?.message || (networkState.lastFrameResult ? `Frame ${networkState.lastFrameResult.success ? 'delivered' : 'failed'}` : 'Start by selecting a source device');
    const animationState = networkState.lastFrameResult?.animationState;
    const frameDeliveryMessage = animationState === 'in-progress'
        ? 'Frame in transit'
        : animationState === 'dropped'
            ? 'Frame dropped'
            : 'Frame delivered';
    const eventsHtml = networkState.lastFrameResult?.events?.map((event, index) => `
            <li class="frame-log-item"><strong>${index + 1}.</strong><span>${escapeHtml(event)}</span></li>`).join('') || '';

    return cleanDisplayText(`
        <div class="property-card">
            <h3>Send Frame</h3>
            <div class="property-summary property-summary--subtle">
                <h4>STATUS</h4>
                <div class="property-status-message">
                    ${escapeHtml(statusMessage)}
                </div>
                <div class="property-summary-grid">
                    <div class="property-summary-item">
                        <span>Source</span>
                        <strong>${sourceName}</strong>
                    </div>
                    <div class="property-summary-item">
                        <span>Destination</span>
                        <strong>${destinationName}</strong>
                    </div>
                </div>
            </div>
            ${networkState.lastFrameResult ? `
                <div class="property-summary frame-transmission">
                    <h4>FRAME TRANSMISSION</h4>
                    <div class="property-status-message frame-transmission__status ${animationState === 'dropped' ? 'property-status-message--warning' : animationState === 'delivered' ? 'property-status-message--success' : ''}">
                        ${escapeHtml(frameDeliveryMessage)}
                    </div>
                    <div class="property-status-message">
                        ${networkState.lastFrameResult.success ? '✓ Frame delivered' : '✕ Frame not delivered'}
                    </div>
                    <div class="property-summary-grid">
                        <div class="property-summary-item">
                            <span>Action</span>
                            <strong>${escapeHtml(networkState.lastFrameResult.action)}</strong>
                        </div>
                        <div class="property-summary-item">
                            <span>Path</span>
                            <strong>${escapeHtml(networkState.lastFrameResult.path.map((id) => getDeviceById(id)?.name || id).join(' → '))}</strong>
                        </div>
                    </div>
                    <div class="frame-log">
                        <h4>EVENT LOG</h4>
                        <ul class="frame-log-list">
                            ${eventsHtml}
                        </ul>
                    </div>
                </div>
            ` : ''}
        </div>
    `);
}

function attachSendFramePanelEvents() {
    // No additional action buttons required currently.
}

function renderSwitchInspector(selected) {
    const runtime = getSwitchRuntime(selected.id);
    const portCount = getSwitchPortCount(selected.id);
    const learnedCount = runtime.macTable.length;
    const macRows = runtime.macTable.map((entry) => `
            <tr>
                <td>${escapeHtml(entry.mac)}</td>
                <td>${escapeHtml(entry.port)}</td>
                <td>${escapeHtml(getDeviceById(entry.deviceId)?.name || entry.deviceId)}</td>
            </tr>
        `).join('');

    return `
        <div class="property-summary">
            <h4>SWITCH</h4>
            <div class="property-summary-grid">
                <div class="property-summary-item">
                    <span>Layer</span>
                    <strong>2</strong>
                </div>
                <div class="property-summary-item">
                    <span>Ports</span>
                    <strong>${portCount}</strong>
                </div>
                <div class="property-summary-item">
                    <span>Learned MACs</span>
                    <strong>${learnedCount}</strong>
                </div>
            </div>
        </div>
        <div class="property-summary">
            <h4>MAC ADDRESS TABLE</h4>
            ${learnedCount ? `
                <table class="property-table">
                    <thead>
                        <tr>
                            <th>MAC Address</th>
                            <th>Port</th>
                            <th>Device</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${macRows}
                    </tbody>
                </table>
            ` : '<p class="empty-state">No MAC addresses learned yet.</p>'}
            <div class="property-actions">
                <button id="clearMacTable" class="toolbar-button" type="button">Clear MAC Table</button>
            </div>
        </div>
    `;
}

function getSupportedConfigFields(device) {
    if (['pc', 'laptop', 'server', 'router'].includes(device.type)) {
        return { ip: true, subnetMask: true, gateway: true, mac: true };
    }

    if (device.type === 'switch') {
        return { mac: true };
    }

    return {};
}

function getInspectorDraft(device) {
    return inspectorDrafts[device.id] || {};
}

function getInspectorValue(device, field) {
    const draft = getInspectorDraft(device);
    if (Object.prototype.hasOwnProperty.call(draft, field)) {
        return draft[field];
    }
    return device[field] || '';
}

function getInspectorValidity(device, draft) {
    const fields = getSupportedConfigFields(device);
    const values = {
        ip: Object.prototype.hasOwnProperty.call(draft, 'ip') ? draft.ip : device.ip,
        subnetMask: Object.prototype.hasOwnProperty.call(draft, 'subnetMask') ? draft.subnetMask : device.subnetMask,
        gateway: Object.prototype.hasOwnProperty.call(draft, 'gateway') ? draft.gateway : device.gateway,
        mac: Object.prototype.hasOwnProperty.call(draft, 'mac') ? draft.mac : device.mac
    };

    if (fields.ip && values.ip !== '' && !isValidIPv4(values.ip)) {
        return false;
    }

    if (fields.subnetMask && values.subnetMask !== '' && !isValidSubnetMask(values.subnetMask)) {
        return false;
    }

    if (fields.gateway && values.gateway !== '' && !isValidIPv4(values.gateway)) {
        return false;
    }

    if (fields.mac && values.mac !== '' && !isValidMacAddress(values.mac)) {
        return false;
    }

    return true;
}

function getConfigurationSummary(device) {
    const normalizedSubnet = normalizeSubnetMask(device.subnetMask) || device.subnetMask || 'Not configured';
    return {
        ip: device.ip || 'Not configured',
        mask: normalizedSubnet || 'Not configured',
        gateway: device.gateway || 'Not configured',
        mac: device.mac || 'Not configured'
    };
}

function getDeviceStatusClass(device) {
    const status = getDeviceNetworkStatus(device);
    if (status.valid) {
        return 'property-status-message--success';
    }
    return 'property-status-message--warning';
}

function getDeviceNetworkStatus(device) {
    const normalizedMask = normalizeSubnetMask(device.subnetMask);
    const hasValidIp = Boolean(device.ip && isValidIPv4(device.ip));
    const hasValidMask = Boolean(normalizedMask);

    if (!hasValidIp || !hasValidMask) {
        return {
            valid: false,
            message: '⚠ Network configuration incomplete',
            details: [
                { label: 'Network', value: 'Not configured' }
            ]
        };
    }

    const networkAddress = calculateNetworkAddress(device.ip, normalizedMask);
    const broadcastAddress = calculateBroadcastAddress(device.ip, normalizedMask);
    const prefixLength = getPrefixLengthFromMask(normalizedMask);
    const usableRange = calculateUsableHostRange(networkAddress, broadcastAddress, prefixLength);
    const gatewayWarning = getGatewayWarning(device, normalizedMask);
    const specialAddressWarning = getSpecialAddressWarning(device.ip, networkAddress, broadcastAddress);

    const details = [
        { label: 'Network', value: `${networkAddress}/${prefixLength}` },
        { label: 'Broadcast', value: broadcastAddress },
        { label: 'Hosts', value: `${getHostCount(prefixLength)}` },
        { label: 'Usable range', value: usableRange }
    ];

    if (gatewayWarning) {
        details.push({ label: 'Gateway', value: gatewayWarning });
    }

    if (specialAddressWarning) {
        details.push({ label: 'Address', value: specialAddressWarning });
    }

    return {
        valid: true,
        message: '✓ Valid IPv4 configuration',
        details
    };
}

function getDeviceNetworkStatusText(device) {
    return getDeviceNetworkStatus(device).message;
}

function getDeviceNetworkStatusRows(device) {
    return getDeviceNetworkStatus(device).details.map((item) => ({
        label: item.label,
        value: item.value
    }));
}

function getGatewayWarning(device, subnetMask) {
    if (!device.gateway || !isValidIPv4(device.gateway)) {
        return '';
    }

    const gatewayInt = ipv4ToInteger(device.gateway);
    const subnetInt = ipv4ToInteger(calculateNetworkAddress(device.ip, subnetMask));
    const maskInt = ipv4ToInteger(subnetMask);
    const gatewayNetwork = (gatewayInt & maskInt) >>> 0;
    const localNetwork = (subnetInt & maskInt) >>> 0;
    if (gatewayNetwork !== localNetwork) {
        return '⚠ Outside subnet';
    }
    return '';
}

function getSpecialAddressWarning(ip, networkAddress, broadcastAddress) {
    if (!ip || !isValidIPv4(ip)) {
        return '';
    }

    if (ip === networkAddress) {
        return '⚠ Network address';
    }

    if (ip === broadcastAddress) {
        return '⚠ Broadcast address';
    }

    return '';
}

function getPrefixLengthFromMask(mask) {
    const normalized = normalizeSubnetMask(mask);
    if (!normalized) {
        return null;
    }

    const maskInt = ipv4ToInteger(normalized);
    let prefixLength = 0;
    let bit = 0x80000000;
    while (prefixLength < 32 && (maskInt & bit) !== 0) {
        prefixLength += 1;
        bit >>>= 1;
    }

    if (maskInt !== ((0xFFFFFFFF << (32 - prefixLength)) >>> 0) && prefixLength < 32) {
        return null;
    }

    return prefixLength;
}

function getHostCount(prefixLength) {
    if (prefixLength === null || prefixLength === undefined) {
        return 'N/A';
    }

    if (prefixLength >= 32) {
        return '0';
    }

    if (prefixLength === 31) {
        return '0';
    }

    const hostBits = 32 - prefixLength;
    return `${Math.max(0, Math.pow(2, hostBits) - 2)}`;
}

function calculateUsableHostRange(networkAddress, broadcastAddress, prefixLength) {
    if (prefixLength === null || prefixLength === undefined) {
        return 'N/A';
    }

    const networkInt = ipv4ToInteger(networkAddress);
    const broadcastInt = ipv4ToInteger(broadcastAddress);

    if (prefixLength >= 31) {
        return `${networkAddress} - ${broadcastAddress}`;
    }

    const firstHost = (networkInt + 1) >>> 0;
    const lastHost = (broadcastInt - 1) >>> 0;
    return `${integerToIPv4(firstHost)} - ${integerToIPv4(lastHost)}`;
}

function getTestStatusClass() {
    if (networkState.connectionTestState?.message) {
        return 'property-status-message--warning';
    }

    if (!networkState.lastConnectionTestResult) {
        return '';
    }

    return networkState.lastConnectionTestResult.possible ? 'property-status-message--success' : 'property-status-message--warning';
}

function getConnectionTestPanelMessage() {
    if (networkState.connectionTestState?.message) {
        return networkState.connectionTestState.message;
    }

    if (networkState.connectionTestState) {
        if (networkState.connectionTestState.phase === 'awaitDestination') {
            const sourceDevice = getDeviceById(networkState.connectionTestState.sourceId);
            const sourceLabel = sourceDevice?.name || networkState.connectionTestState.sourceId || 'source';
            return `Source: ${sourceLabel} — Select destination device`;
        }
        return 'Select source device';
    }

    if (!networkState.lastConnectionTestResult) {
        return 'No connection test run yet.';
    }

    if (networkState.lastConnectionTestResult.possible) {
        return `✓ Connection possible\nSource: ${networkState.lastConnectionTestResult.sourceName} — ${networkState.lastConnectionTestResult.sourceIp}\nDestination: ${networkState.lastConnectionTestResult.destinationName} — ${networkState.lastConnectionTestResult.destinationIp}\nNetwork: ${networkState.lastConnectionTestResult.network}\nPath: ${networkState.lastConnectionTestResult.path.join(' → ')}`;
    }

    return `✕ Connection not possible\nReason: ${networkState.lastConnectionTestResult.reason}`;
}

function refreshInspectorValidation(device) {
    const panel = document.getElementById('propertiesPanel');
    if (!panel || !device) {
        return;
    }

    const supports = getSupportedConfigFields(device);
    const draft = getInspectorDraft(device);
    const isValid = getInspectorValidity(device, draft);
    const applyButton = panel.querySelector('#applyDeviceConfig');
    if (applyButton) {
        applyButton.disabled = !isValid;
    }

    Object.entries(supports).forEach(([field, enabled]) => {
        if (!enabled) {
            return;
        }

        const feedback = panel.querySelector(`[data-feedback-for="${field}"]`);
        if (!feedback) {
            return;
        }

        const value = getInspectorValue(device, field);
        let feedbackText = '';
        let feedbackClass = '';

        if (!value) {
            feedbackText = '';
        } else {
            const valid = field === 'ip'
                ? isValidIPv4(value)
                : field === 'subnetMask'
                    ? isValidSubnetMask(value)
                    : field === 'gateway'
                        ? isValidIPv4(value)
                        : isValidMacAddress(value);

            if (valid) {
                feedbackText = '✓ Valid';
                feedbackClass = 'property-feedback--success';
            } else {
                feedbackText = field === 'ip'
                    ? '✗ Invalid IPv4 address'
                    : field === 'subnetMask'
                        ? '✗ Invalid subnet mask'
                        : field === 'gateway'
                            ? '✗ Invalid gateway'
                            : '✗ Invalid MAC address';
                feedbackClass = 'property-feedback--error';
            }
        }

        feedback.textContent = feedbackText;
        feedback.className = `property-feedback ${feedbackClass}`.trim();
    });
}

function applyDeviceConfiguration() {
    const device = getDeviceById(networkState.selectedDeviceId);
    if (!device) {
        return;
    }

    const draft = getInspectorDraft(device);
    const isValid = getInspectorValidity(device, draft);
    if (!isValid) {
        updateStatus('Configuration contains invalid values. Fix the highlighted fields before applying changes.');
        return;
    }

    const nextName = String(draft.name ?? device.name ?? '').trim() || device.name;
    const nextIp = String(draft.ip ?? device.ip ?? '').trim();
    const nextSubnet = String(draft.subnetMask ?? device.subnetMask ?? '').trim();
    const nextGateway = String(draft.gateway ?? device.gateway ?? '').trim();
    const nextMac = String(draft.mac ?? device.mac ?? '').trim();

    const nextState = {
        name: nextName,
        ip: nextIp,
        subnetMask: normalizeSubnetMask(nextSubnet) || '',
        gateway: nextGateway,
        mac: normalizeMacAddress(nextMac) || ''
    };

    const hasChanges = device.name !== nextState.name
        || device.ip !== nextState.ip
        || device.subnetMask !== nextState.subnetMask
        || device.gateway !== nextState.gateway
        || device.mac !== nextState.mac;

    if (!hasChanges) {
        delete inspectorDrafts[device.id];
        render();
        return;
    }

    pushHistory();
    device.name = nextState.name;
    device.ip = nextState.ip;
    device.subnetMask = nextState.subnetMask;
    device.gateway = nextState.gateway;
    device.mac = nextState.mac;
    delete inspectorDrafts[device.id];

    updateStatus(`${device.name} configuration updated.`);
    render();
}

function isValidIPv4(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }

    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) {
        return false;
    }

    return trimmed.split('.').every((octet) => {
        const parsed = Number(octet);
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
    });
}

function ipv4ToInteger(value) {
    if (!isValidIPv4(value)) {
        return null;
    }

    const octets = value.trim().split('.').map((octet) => Number(octet));
    return (((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + octets[3]) >>> 0;
}

function integerToIPv4(value) {
    if (!Number.isInteger(value)) {
        return null;
    }

    const unsignedValue = value >>> 0;
    return [24, 16, 8, 0].map((shift) => (unsignedValue >>> shift) & 255).join('.');
}

function calculateNetworkAddress(ip, subnetMask) {
    if (!isValidIPv4(ip) || !subnetMask) {
        return null;
    }

    const normalizedMask = normalizeSubnetMask(subnetMask);
    if (!normalizedMask) {
        return null;
    }

    const ipInt = ipv4ToInteger(ip);
    const maskInt = ipv4ToInteger(normalizedMask);
    return integerToIPv4(ipInt & maskInt);
}

function calculateBroadcastAddress(ip, subnetMask) {
    if (!isValidIPv4(ip) || !subnetMask) {
        return null;
    }

    const normalizedMask = normalizeSubnetMask(subnetMask);
    if (!normalizedMask) {
        return null;
    }

    const ipInt = ipv4ToInteger(ip);
    const maskInt = ipv4ToInteger(normalizedMask);
    const networkInt = ipInt & maskInt;
    const broadcastInt = networkInt | (~maskInt >>> 0);
    return integerToIPv4(broadcastInt >>> 0);
}

function isSameSubnet(ip1, ip2, subnetMask) {
    const network1 = calculateNetworkAddress(ip1, subnetMask);
    const network2 = calculateNetworkAddress(ip2, subnetMask);
    return Boolean(network1 && network2 && network1 === network2);
}

function isValidSubnetMask(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }

    const normalized = normalizeSubnetMask(trimmed);
    return Boolean(normalized);
}

function isValidMacAddress(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return true;
    }

    return Boolean(normalizeMacAddress(trimmed));
}

function normalizeSubnetMask(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    if (trimmed.startsWith('/')) {
        const cidr = Number.parseInt(trimmed.slice(1), 10);
        if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) {
            return null;
        }
        return cidrToSubnetMask(cidr);
    }

    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) {
        return null;
    }

    const octets = trimmed.split('.');
    const parsedOctets = octets.map((octet) => Number(octet));
    if (parsedOctets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return null;
    }

    const binary = parsedOctets.map((octet) => octet.toString(2).padStart(8, '0')).join('');
    let seenZero = false;
    for (const bit of binary) {
        if (bit === '0') {
            seenZero = true;
        } else if (seenZero) {
            return null;
        }
    }

    return parsedOctets.join('.');
}

function cidrToSubnetMask(value) {
    if (!Number.isInteger(value)) {
        return null;
    }

    if (value < 0 || value > 32) {
        return null;
    }

    const bits = '1'.repeat(value).padEnd(32, '0');
    const octets = [];
    for (let index = 0; index < 4; index += 1) {
        octets.push(parseInt(bits.slice(index * 8, index * 8 + 8), 2));
    }

    return octets.join('.');
}

function normalizeMacAddress(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().toUpperCase();
    if (!trimmed) {
        return '';
    }

    const cleaned = trimmed.replace(/[:-]/g, '');
    if (!/^[0-9A-F]{12}$/.test(cleaned)) {
        return null;
    }

    return cleaned.match(/.{1,2}/g).join(':');
}

function generateMacAddress(existingDevices = networkState.devices) {
    const prefix = '02:4A:7B:10:00:';
    let counter = 1;

    while (true) {
        const octet = counter.toString(16).padStart(2, '0').toUpperCase();
        const candidate = `${prefix}${octet}`;
        const normalized = normalizeMacAddress(candidate);
        const isDuplicate = existingDevices.some((device) => normalizeMacAddress(device.mac) === normalized);
        if (normalized && !isDuplicate) {
            return normalized;
        }
        counter += 1;
    }
}

function areDevicesDirectlyConnected(deviceA, deviceB) {
    if (!deviceA || !deviceB) {
        return false;
    }

    return networkState.connections.some((connection) =>
        (connection.source === deviceA.id && connection.target === deviceB.id)
        || (connection.source === deviceB.id && connection.target === deviceA.id)
    );
}

function findTopologyPath(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) {
        return sourceId ? [sourceId] : [];
    }

    const adjacency = new Map();
    networkState.devices.forEach((device) => adjacency.set(device.id, []));

    networkState.connections.forEach((connection) => {
        const source = getDeviceById(connection.source);
        const target = getDeviceById(connection.target);
        if (!source || !target) {
            return;
        }
        adjacency.get(source.id).push(target.id);
        adjacency.get(target.id).push(source.id);
    });

    const queue = [sourceId];
    const visited = new Set([sourceId]);
    const parents = new Map();

    while (queue.length) {
        const current = queue.shift();
        if (current === targetId) {
            break;
        }

        adjacency.get(current).forEach((neighbor) => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parents.set(neighbor, current);
                queue.push(neighbor);
            }
        });
    }

    if (!visited.has(targetId)) {
        return [];
    }

    const path = [targetId];
    let cursor = targetId;
    while (parents.has(cursor)) {
        cursor = parents.get(cursor);
        path.unshift(cursor);
        if (cursor === sourceId) {
            break;
        }
    }

    return path;
}

function getSwitchRuntime(switchId) {
    if (!networkState.switchRuntime[switchId]) {
        networkState.switchRuntime[switchId] = {
            ports: {},
            macTable: []
        };
    }
    return networkState.switchRuntime[switchId];
}

function getConnectionBetween(deviceAId, deviceBId) {
    return networkState.connections.find((connection) =>
        (connection.source === deviceAId && connection.target === deviceBId)
        || (connection.source === deviceBId && connection.target === deviceAId)
    ) || null;
}

function getSwitchPortLabel(switchId, connectionId) {
    const runtime = getSwitchRuntime(switchId);
    if (runtime.ports[connectionId]) {
        return runtime.ports[connectionId];
    }

    const existingPorts = new Set(Object.values(runtime.ports));
    for (let index = 1; index < 48; index += 1) {
        const port = `Fa0/${index}`;
        if (!existingPorts.has(port)) {
            runtime.ports[connectionId] = port;
            return port;
        }
    }

    const fallbackPort = `Fa0/${Object.keys(runtime.ports).length + 1}`;
    runtime.ports[connectionId] = fallbackPort;
    return fallbackPort;
}

function getPortForSwitchAndNeighbor(switchId, neighborId) {
    const connection = getConnectionBetween(switchId, neighborId);
    if (!connection) {
        return null;
    }
    return getSwitchPortLabel(switchId, connection.id);
}

function assignPortsForConnection(connection) {
    const sourceDevice = getDeviceById(connection.source);
    const targetDevice = getDeviceById(connection.target);
    if (sourceDevice?.type === 'switch') {
        getSwitchPortLabel(sourceDevice.id, connection.id);
    }
    if (targetDevice?.type === 'switch') {
        getSwitchPortLabel(targetDevice.id, connection.id);
    }
}

function releasePortAssignmentsForConnection(connectionId) {
    Object.values(networkState.switchRuntime).forEach((runtime) => {
        if (Object.prototype.hasOwnProperty.call(runtime.ports, connectionId)) {
            delete runtime.ports[connectionId];
        }
    });
}

function getSwitchMacEntry(switchId, mac) {
    const runtime = getSwitchRuntime(switchId);
    const normalized = normalizeMacAddress(mac);
    if (!normalized) {
        return null;
    }
    return runtime.macTable.find((entry) => entry.mac === normalized) || null;
}

function learnSwitchMac(switchId, sourceMac, sourceDeviceId, portLabel) {
    const runtime = getSwitchRuntime(switchId);
    const normalized = normalizeMacAddress(sourceMac);
    if (!normalized) {
        return null;
    }

    const existing = runtime.macTable.find((entry) => entry.mac === normalized);
    if (existing) {
        existing.port = portLabel;
        existing.deviceId = sourceDeviceId;
        existing.learnedAt = new Date().toISOString();
        return existing;
    }

    const entry = {
        mac: normalized,
        port: portLabel,
        deviceId: sourceDeviceId,
        learnedAt: new Date().toISOString()
    };
    runtime.macTable.push(entry);
    return entry;
}

function clearSwitchMacTable(switchId) {
    const runtime = getSwitchRuntime(switchId);
    runtime.macTable = [];
}

function validateSendFrameEndpoints(sourceDevice, destinationDevice) {
    if (!sourceDevice || !destinationDevice) {
        return { valid: false, reason: 'Missing source or destination device.' };
    }

    if (!isCommunicationEndpoint(sourceDevice) || !isCommunicationEndpoint(destinationDevice)) {
        return { valid: false, reason: 'Switches cannot be used as frame endpoints.' };
    }

    if (sourceDevice.id === destinationDevice.id) {
        return { valid: false, reason: 'Select two different devices.' };
    }

    if (!sourceDevice.mac) {
        return { valid: false, reason: 'Source device has no MAC address.' };
    }

    if (!destinationDevice.mac) {
        return { valid: false, reason: 'Destination device has no MAC address.' };
    }

    const path = findTopologyPath(sourceDevice.id, destinationDevice.id);
    if (!path.length || path.length < 2) {
        return { valid: false, reason: 'Devices are not connected.' };
    }

    return { valid: true, path };
}

function simulateSendFrame(sourceDevice, destinationDevice) {
    const topologyPath = findTopologyPath(sourceDevice.id, destinationDevice.id);
    const frame = {
        sourceDeviceId: sourceDevice.id,
        destinationDeviceId: destinationDevice.id,
        sourceMac: sourceDevice.mac,
        destinationMac: destinationDevice.mac,
        etherType: 'IPv4',
        path: topologyPath,
        events: []
    };

    let action = 'FLOOD';
    for (let i = 0; i < topologyPath.length - 1; i += 1) {
        const fromId = topologyPath[i];
        const toId = topologyPath[i + 1];
        const fromDevice = getDeviceById(fromId);
        const toDevice = getDeviceById(toId);

        if (!fromDevice || !toDevice) {
            continue;
        }

        if (toDevice.type === 'switch') {
            const ingressPort = getPortForSwitchAndNeighbor(toDevice.id, fromId);
            frame.events.push(`Frame entered ${toDevice.name} on ${ingressPort}`);

            learnSwitchMac(toDevice.id, frame.sourceMac, sourceDevice.id, ingressPort);
            frame.events.push(`Switch ${toDevice.name} learned ${sourceDevice.name} MAC → ${ingressPort}`);

            const destEntry = getSwitchMacEntry(toDevice.id, frame.destinationMac);
            if (destEntry && destEntry.port !== ingressPort) {
                frame.events.push(`Destination MAC found → ${destEntry.port}`);
                frame.events.push(`Switch ${toDevice.name} forwarded frame through ${destEntry.port}`);
                action = 'FORWARD';
            } else if (destEntry && destEntry.port === ingressPort) {
                frame.events.push(`Destination MAC found on incoming port`);
                action = 'LOCAL';
            } else {
                frame.events.push('Destination MAC unknown');
                frame.events.push(`Switch ${toDevice.name} flooded frame`);
                action = 'FLOOD';
            }
        }
    }

    frame.events.push(`${destinationDevice.name} received frame`);

    return {
        success: true,
        reason: '',
        path: topologyPath,
        action,
        events: frame.events
    };
}

function getSwitchPortCount(switchId) {
    const runtime = getSwitchRuntime(switchId);
    const cableCount = networkState.connections.filter((connection) => {
        const source = getDeviceById(connection.source);
        const target = getDeviceById(connection.target);
        return source?.id === switchId || target?.id === switchId;
    }).length;
    return Math.max(cableCount, Object.keys(runtime.ports).length);
}

function isCommunicationEndpoint(device) {
    return Boolean(device && ['pc', 'laptop', 'server', 'router'].includes(device.type));
}

function analyzeCommunication(sourceDevice, targetDevice) {
    if (!sourceDevice || !targetDevice) {
        return { possible: false, reason: 'Missing devices.', path: [] };
    }

    if (!isCommunicationEndpoint(sourceDevice) || !isCommunicationEndpoint(targetDevice)) {
        return { possible: false, reason: 'Switches cannot be used as IP communication endpoints.', path: [] };
    }

    if (sourceDevice.id === targetDevice.id) {
        return { possible: false, reason: 'Select two different devices.', path: [] };
    }

    if (!isValidIPv4(sourceDevice.ip)) {
        return { possible: false, reason: 'Source has no valid IP configuration.', path: [] };
    }

    if (!isValidIPv4(targetDevice.ip)) {
        return { possible: false, reason: 'Destination has no valid IP configuration.', path: [] };
    }

    const normalizedMaskA = normalizeSubnetMask(sourceDevice.subnetMask);
    const normalizedMaskB = normalizeSubnetMask(targetDevice.subnetMask);

    if (!normalizedMaskA || !normalizedMaskB) {
        return { possible: false, reason: 'Incomplete subnet configuration.', path: [] };
    }

    if (normalizedMaskA !== normalizedMaskB) {
        return { possible: false, reason: 'Endpoint subnet masks do not match.', path: [] };
    }

    if (!isSameSubnet(sourceDevice.ip, targetDevice.ip, normalizedMaskA)
        || !isSameSubnet(sourceDevice.ip, targetDevice.ip, normalizedMaskB)) {
        return { possible: false, reason: 'Devices are on different subnets.', path: [] };
    }

    const path = findTopologyPath(sourceDevice.id, targetDevice.id);
    if (!path.length || path.length < 2) {
        return { possible: false, reason: 'No topology path exists.', path: [] };
    }

    return {
        possible: true,
        reason: '',
        path,
        sourceName: sourceDevice.name,
        sourceIp: sourceDevice.ip,
        destinationName: targetDevice.name,
        destinationIp: targetDevice.ip,
        network: `${calculateNetworkAddress(sourceDevice.ip, normalizedMaskA)}/${getPrefixLengthFromMask(normalizedMaskA)}`
    };
}

function canCommunicateDirectly(sourceDevice, targetDevice) {
    return analyzeCommunication(sourceDevice, targetDevice).possible;
}

function updateToolbarButtons() {
    const simulationMode = isSimulationMode();
    document.querySelectorAll('.toolbar-button[data-mode]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.mode === networkState.mode);
        button.disabled = simulationMode && button.dataset.mode !== 'select';
    });

    const undoButton = document.querySelector('.toolbar-button[data-action="undo"]');
    const redoButton = document.querySelector('.toolbar-button[data-action="redo"]');

    if (undoButton) {
        undoButton.disabled = simulationMode || !networkState.history.length;
    }

    if (redoButton) {
        redoButton.disabled = simulationMode || !networkState.future.length;
    }

    ['delete', 'clear'].forEach((action) => {
        const button = document.querySelector(`.toolbar-button[data-action="${action}"]`);
        if (button) {
            button.disabled = simulationMode;
        }
    });

    const simulateButton = document.querySelector('#simulationModeButton');
    if (simulateButton) {
        simulateButton.classList.toggle('is-active', simulationMode);
        simulateButton.textContent = simulationMode ? 'Return to Edit Mode' : 'Enter Simulation';
    }

    const testButton = document.querySelector('.toolbar-button[data-action="testConnection"]');
    if (testButton) {
        testButton.classList.toggle('is-active', Boolean(networkState.connectionTestState));
    }

    const sendFrameButton = document.querySelector('.toolbar-button[data-action="sendFrame"]');
    if (sendFrameButton) {
        sendFrameButton.classList.toggle('is-active', Boolean(networkState.sendFrameState));
    }
}

function updatePaletteSelection() {
    document.querySelectorAll('.palette-item').forEach((item) => {
        item.classList.toggle('is-selected', item.dataset.type === networkState.pendingDeviceType);
        item.disabled = isSimulationMode();
        item.draggable = !isSimulationMode();
    });
}

function renderSimulationControls() {
    const indicator = document.getElementById('simulationModeIndicator');
    const status = document.getElementById('simulationStatus');
    const eventLog = document.getElementById('simulationEventLog');
    const controls = document.getElementById('simulationControls');
    const simulationMode = isSimulationMode();

    if (controls) {
        controls.classList.toggle('is-simulation-mode', simulationMode);
        controls.classList.toggle('is-running', simulationMode && networkState.simulationRuntime.isRunning);
    }
    if (indicator) {
        indicator.textContent = simulationMode ? 'Simulation Mode' : 'Edit Mode';
    }
    if (status) {
        status.textContent = simulationMode
            ? networkState.simulationRuntime.isRunning
                ? 'Running: topology is locked; frames and tests are available.'
                : 'Paused: topology is locked; frames and tests are available.'
            : 'Topology editing is enabled.';
    }
    if (eventLog) {
        eventLog.textContent = networkState.simulationRuntime.events.length
            ? networkState.simulationRuntime.events.join(' | ')
            : 'No simulation events yet.';
    }

    ['simulationStart', 'simulationPause', 'simulationReset'].forEach((action) => {
        const button = document.querySelector(`.toolbar-button[data-action="${action}"]`);
        if (button) {
            button.disabled = !simulationMode || (action === 'simulationStart' && networkState.simulationRuntime.isRunning);
        }
    });
}

function updateStatus(message) {
    const statusMessage = document.getElementById('statusMessage');
    const modeBadge = document.getElementById('modeBadge');

    if (message) {
        statusMessage.textContent = message;
    } else if (networkState.sendFrameState?.message) {
        statusMessage.textContent = networkState.sendFrameState.message;
    } else if (networkState.sendFrameState) {
        if (networkState.sendFrameState.phase === 'awaitDestination') {
            const sourceDevice = getDeviceById(networkState.sendFrameState.sourceId);
            const sourceLabel = sourceDevice?.name || networkState.sendFrameState.sourceId || 'source';
            statusMessage.textContent = `Source: ${sourceLabel} — Select destination device`;
        } else {
            statusMessage.textContent = 'Select source device';
        }
    } else if (networkState.connectionTestState?.message) {
        statusMessage.textContent = networkState.connectionTestState.message;
    } else if (networkState.connectionTestState) {
        if (networkState.connectionTestState.phase === 'awaitDestination') {
            const sourceDevice = getDeviceById(networkState.connectionTestState.sourceId);
            const sourceLabel = sourceDevice?.name || networkState.connectionTestState.sourceId || 'source';
            statusMessage.textContent = `Source: ${sourceLabel} — Select destination device`;
        } else {
            statusMessage.textContent = 'Select source device';
        }
    } else if (networkState.lastConnectionTestResult) {
        statusMessage.textContent = networkState.lastConnectionTestResult.possible
            ? `Connection possible: ${networkState.lastConnectionTestResult.sourceName} → ${networkState.lastConnectionTestResult.destinationName}`
            : `Connection test failed: ${networkState.lastConnectionTestResult.reason}`;
    } else if (networkState.mode === 'connect' && networkState.connectionSourceId) {
        statusMessage.textContent = `Connecting from ${networkState.connectionSourceId}. Select a second device.`;
    } else if (networkState.mode === 'add') {
        statusMessage.textContent = `Placing ${DEVICE_DEFINITIONS[networkState.pendingDeviceType].label}. Click the canvas to add it.`;
    } else if (networkState.mode === 'delete') {
        statusMessage.textContent = 'Delete mode active. Click a device or connection to remove it.';
    } else {
        statusMessage.textContent = 'Select a device or click the canvas to place one.';
    }

    statusMessage.textContent = cleanDisplayText(statusMessage.textContent);

    const activeMode = networkState.sendFrameState
        ? 'Send Frame'
        : networkState.connectionTestState
            ? 'Test Connection'
            : isSimulationMode()
                ? 'Simulation'
                : capitalize(networkState.mode);
    modeBadge.textContent = `Mode: ${activeMode}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
    return cleanDisplayText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function cleanDisplayText(value) {
    return String(value)
        .replace(/\?{3}/g, '->')
        .replace(/[^\x00-\x7F]+/g, '->');
}

function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

document.addEventListener('DOMContentLoaded', initializeLab);
