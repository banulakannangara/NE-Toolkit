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
    routerRuntime: {},
    arpRuntime: {},
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
        switchRuntime: networkState.switchRuntime,
        routerRuntime: networkState.routerRuntime,
        arpRuntime: networkState.arpRuntime
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
        if (networkState.connectionTestState && networkState.connectionTestState.phase !== 'complete') {
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
        if (networkState.sendFrameState && networkState.sendFrameState.phase !== 'complete') {
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
    const rect = canvas ? canvas.getBoundingClientRect() : { width: 800, height: 600 };
    const safeWidth = Math.max(90, rect.width - 140);
    const safeHeight = Math.max(90, rect.height - 130);

    const counter = networkState.typeCounters[type] || 0;
    networkState.typeCounters[type] = counter + 1;

    let device;
    if (type === 'router') {
        const mac1 = generateMacAddress(networkState.devices);
        const tempDevice = {
            id: `${DEVICE_DEFINITIONS[type].label}${counter}`,
            type: 'router',
            interfaces: {
                'Gig0/0': { name: 'Gig0/0', mac: mac1, status: 'up' }
            }
        };
        const mac2 = generateMacAddress([...networkState.devices, tempDevice]);

        device = {
            id: `${DEVICE_DEFINITIONS[type].label}${counter}`,
            type,
            name: `${DEVICE_DEFINITIONS[type].label}${counter}`,
            x: clamp(x - 56, 24, safeWidth),
            y: clamp(y - 48, 24, safeHeight),
            interfaces: {
                'Gig0/0': {
                    name: 'Gig0/0',
                    ip: '',
                    subnetMask: '',
                    mac: mac1,
                    status: 'up'
                },
                'Gig0/1': {
                    name: 'Gig0/1',
                    ip: '',
                    subnetMask: '',
                    mac: mac2,
                    status: 'up'
                }
            }
        };
    } else {
        device = {
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
    }

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
    networkState.routerRuntime = {};
    networkState.arpRuntime = {};
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
    if (networkState.sendFrameState && networkState.sendFrameState.phase === 'complete') {
        networkState.sendFrameState = null;
    }
    if (networkState.connectionTestState && networkState.connectionTestState.phase === 'complete') {
        networkState.connectionTestState = null;
    }
    updateToolbarButtons();
    updateStatus(`Selected ${deviceId}.`);
    render();
}

function selectConnection(connectionId) {
    networkState.selectedConnectionId = connectionId;
    networkState.selectedDeviceId = null;
    networkState.mode = 'select';
    networkState.connectionSourceId = null;
    if (networkState.sendFrameState && networkState.sendFrameState.phase === 'complete') {
        networkState.sendFrameState = null;
    }
    if (networkState.connectionTestState && networkState.connectionTestState.phase === 'complete') {
        networkState.connectionTestState = null;
    }
    updateToolbarButtons();
    updateStatus(`Selected ${connectionId}.`);
    render();
}

function clearSelection() {
    networkState.selectedDeviceId = null;
    networkState.selectedConnectionId = null;
    networkState.connectionSourceId = null;
    if (networkState.sendFrameState && networkState.sendFrameState.phase === 'complete') {
        networkState.sendFrameState = null;
    }
    if (networkState.connectionTestState && networkState.connectionTestState.phase === 'complete') {
        networkState.connectionTestState = null;
    }
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
    removeSwitchMacEntriesForDevice(deviceId);
    removeArpEntriesForDevice(deviceId);

    networkState.devices = networkState.devices.filter((item) => item.id !== deviceId);
    const removedConnections = networkState.connections.filter((connection) => connection.source === deviceId || connection.target === deviceId);
    networkState.connections = networkState.connections.filter((connection) => connection.source !== deviceId && connection.target !== deviceId);
    removedConnections.forEach((connection) => {
        removeSwitchMacEntriesForConnection(connection.id);
        releasePortAssignmentsForConnection(connection.id);
    });
    if (networkState.selectedDeviceId === deviceId) {
        networkState.selectedDeviceId = null;
    }
    networkState.selectedConnectionId = null;
    networkState.connectionSourceId = null;
    delete networkState.switchRuntime[deviceId];
    delete networkState.routerRuntime[deviceId];
    if (networkState.arpRuntime) {
        delete networkState.arpRuntime[deviceId];
    }
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
    removeSwitchMacEntriesForConnection(connectionId);
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

    const sourceDevice = getDeviceById(sourceId);
    const targetDevice = getDeviceById(targetId);

    if (sourceDevice?.type === 'router' && getRouterAvailablePortCount(sourceId) === 0) {
        updateStatus(`${sourceDevice.name} has no available interfaces (Gig0/0 and Gig0/1 are in use).`);
        return;
    }

    if (targetDevice?.type === 'router' && getRouterAvailablePortCount(targetId) === 0) {
        updateStatus(`${targetDevice.name} has no available interfaces (Gig0/0 and Gig0/1 are in use).`);
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

    if (networkState.sendFrameState && networkState.sendFrameState.phase !== 'complete') {
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
            const currentTtl = (networkState.sendFrameState && typeof networkState.sendFrameState.initialTtl === 'number')
                ? networkState.sendFrameState.initialTtl
                : 64;
            networkState.lastFrameResult = simulateSendFrame(sourceDevice, destinationDevice, { icmp: true, initialTtl: currentTtl });
            networkState.lastFrameResult.animationState = 'in-progress';
            networkState.sendFrameState = {
                phase: 'animating',
                sourceId: networkState.sendFrameState.sourceId,
                initialTtl: currentTtl,
                message: 'Frame is travelling through the topology.'
            };
            updateStatus(networkState.lastFrameResult.success
                ? `Frame delivered: ${sourceDevice.name} → ${destinationDevice.name}`
                : `Frame failed: ${networkState.lastFrameResult.reason}`);
            render();
            const isDelivered = Boolean(networkState.lastFrameResult.success);
            const dropReason = networkState.lastFrameResult.reason || 'Frame dropped along topology path.';
            startFrameAnimation(networkState.lastFrameResult.path, {
                onDelivered: () => {
                    if (networkState.lastFrameResult?.animationState !== 'in-progress') {
                        return;
                    }
                    networkState.lastFrameResult.animationState = 'delivered';
                    networkState.sendFrameState = {
                        phase: 'complete',
                        sourceId: sourceDevice.id,
                        initialTtl: currentTtl,
                        message: null
                    };
                    updateStatus(`Frame delivered: ${sourceDevice.name} -> ${destinationDevice.name}`);
                    render();
                },
                onDropped: (reason) => {
                    if (networkState.lastFrameResult?.animationState !== 'in-progress') {
                        return;
                    }
                    const finalReason = reason || dropReason;
                    networkState.lastFrameResult.animationState = 'dropped';
                    networkState.lastFrameResult.success = false;
                    networkState.lastFrameResult.reason = finalReason;
                    networkState.lastFrameResult.action = 'DROP';
                    networkState.sendFrameState = {
                        phase: 'complete',
                        sourceId: sourceDevice.id,
                        initialTtl: currentTtl,
                        message: finalReason
                    };
                    updateStatus(`Frame failed: ${finalReason}`);
                    render();
                }
            }, isDelivered, dropReason);
            return;
        }
    }

    if (networkState.connectionTestState && networkState.connectionTestState.phase !== 'complete') {
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

    cancelFrameAnimation();
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

    cancelFrameAnimation();
    const snapshot = networkState.future.pop();
    networkState.history.push(createLabSnapshot());

    restoreSnapshot(snapshot);
    updateStatus('Redid the last action.');
    render();
}

function restoreSnapshot(snapshot) {
    const cloned = JSON.parse(JSON.stringify(snapshot));
    networkState.devices = cloned.devices || [];
    networkState.connections = cloned.connections || [];
    networkState.selectedDeviceId = cloned.selectedDeviceId || null;
    networkState.selectedConnectionId = cloned.selectedConnectionId || null;
    networkState.mode = cloned.mode || 'select';
    networkState.pendingDeviceType = cloned.pendingDeviceType || 'pc';
    networkState.typeCounters = cloned.typeCounters || {};
    networkState.connectionCounter = typeof cloned.connectionCounter === 'number' ? cloned.connectionCounter : 0;
    networkState.connectionSourceId = cloned.connectionSourceId || null;
    networkState.connectionTestState = cloned.connectionTestState || null;
    networkState.lastConnectionTestResult = cloned.lastConnectionTestResult || null;
    networkState.switchRuntime = cloned.switchRuntime || {};
    networkState.routerRuntime = cloned.routerRuntime || {};
    networkState.arpRuntime = cloned.arpRuntime || {};
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
            // For Test Connection and Send Frame modes when actively selecting endpoints,
            // do NOT consume the event here. Those modes rely on the `click` event reaching handleDeviceSelection.
            const isEndpointSelectionActive = (networkState.connectionTestState && networkState.connectionTestState.phase !== 'complete') ||
                (networkState.sendFrameState && networkState.sendFrameState.phase !== 'complete');
            if (isEndpointSelectionActive) {
                return;
            }

            if (!canEditTopology()) {
                reportEditingLocked();
                return;
            }

            if (networkState.mode !== 'select') {
                return;
            }

            // Select the device immediately on pointerdown so selection is
            // registered even if render() replaces the DOM before click fires.
            selectDevice(device.id);

            const canvas = document.getElementById('networkCanvas');
            const rect = canvas.getBoundingClientRect();
            const startSnapshot = createLabSnapshot();
            startSnapshot.selectedDeviceId = device.id;
            startSnapshot.selectedConnectionId = null;

            dragState = {
                deviceId: device.id,
                offsetX: event.clientX - rect.left - device.x,
                offsetY: event.clientY - rect.top - device.y,
                initialX: device.x,
                initialY: device.y,
                startSnapshot,
                hasMoved: false
            };
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

    const nextX = clamp(event.clientX - rect.left - dragState.offsetX, 24, Math.max(90, rect.width - 136));
    const nextY = clamp(event.clientY - rect.top - dragState.offsetY, 24, Math.max(90, rect.height - 126));

    if (nextX !== device.x || nextY !== device.y) {
        device.x = nextX;
        device.y = nextY;
        dragState.hasMoved = true;
        render();
    }
}

function endPointerDrag() {
    if (dragState) {
        const device = getDeviceById(dragState.deviceId);
        if (device && dragState.startSnapshot && dragState.hasMoved && (device.x !== dragState.initialX || device.y !== dragState.initialY)) {
            networkState.history.push(dragState.startSnapshot);
            if (networkState.history.length > 30) {
                networkState.history.shift();
            }
            networkState.future = [];
            updateToolbarButtons();
        } else if (device && !dragState.hasMoved) {
            // Pure click (no drag): ensure selection is up to date.
            // The selectDevice call in pointerdown already set state, but
            // re-assert it here in case render() was called during the press.
            networkState.selectedDeviceId = device.id;
            networkState.selectedConnectionId = null;
        }
    }
    dragState = null;
    document.removeEventListener('pointermove', handlePointerMove);
    render();
}

function getHopBadgeConfig(hopAction, isDrop = false, isDelivered = false, options = {}) {
    if (isDelivered) {
        return {
            title: options.isIcmp ? 'PING SUCCESS' : '✓ DELIVERED',
            subtitle: options.isIcmp ? 'Echo Reply Received' : '',
            modifier: options.isIcmp ? 'ping-success' : 'delivered'
        };
    }

    if (options.isArpRequest && options.targetIp) {
        return {
            title: 'ARP REQUEST',
            subtitle: `Who has ${options.targetIp}?`,
            modifier: 'arp-request'
        };
    }

    if (options.isArpReply && options.targetIp) {
        return {
            title: 'ARP REPLY',
            subtitle: `${options.targetIp} → ${options.targetMac || ''}`,
            modifier: 'arp-reply'
        };
    }

    if (options.isIcmpRequest) {
        return {
            title: 'ICMP ECHO REQUEST',
            subtitle: options.subtitle || '',
            modifier: 'icmp-request'
        };
    }

    if (options.isIcmpReply) {
        return {
            title: 'ICMP ECHO REPLY',
            subtitle: options.subtitle || '',
            modifier: 'icmp-reply'
        };
    }

    if (!hopAction) {
        if (options.isIcmpError) {
            return {
                title: options.title || 'ICMP ERROR',
                subtitle: options.subtitle || '',
                modifier: 'icmp-error'
            };
        }
        return null;
    }

    const action = String(hopAction.action || '').toUpperCase();
    if (action === 'FORWARD') {
        const ingress = hopAction.ingressPort || hopAction.ingressInterface || '';
        const egress = hopAction.egressPort || hopAction.egressInterface || '';
        const ports = (ingress && egress) ? `${ingress} → ${egress}` : (egress || ingress);
        return {
            title: 'FORWARD',
            subtitle: ports,
            modifier: 'forward'
        };
    }

    if (action === 'FLOOD') {
        if (options.isArpFlood || hopAction.reason === 'broadcast' || hopAction.destinationMac === 'FF:FF:FF:FF:FF:FF') {
            const ingress = hopAction.ingressPort || '';
            const egress = Array.isArray(hopAction.egressPorts) ? hopAction.egressPorts.join(', ') : '';
            const ports = (ingress && egress) ? `${ingress} → ${egress}` : (egress || ingress || 'Broadcast');
            return {
                title: 'ARP FLOOD',
                subtitle: ports,
                modifier: 'arp-flood'
            };
        }
        const reason = hopAction.reason === 'broadcast' ? 'Broadcast' : 'Unknown Unicast';
        return {
            title: 'FLOOD',
            subtitle: reason,
            modifier: 'flood'
        };
    }

    if (action === 'ROUTE') {
        const ingress = hopAction.ingressInterface || hopAction.ingressPort || '';
        const egress = hopAction.egressInterface || hopAction.egressPort || '';
        const ifaces = (ingress && egress) ? `${ingress} → ${egress}` : (egress || ingress);
        const ttlText = typeof hopAction.ttl === 'number' ? `TTL ${hopAction.ttl + 1} → ${hopAction.ttl}` : '';
        const subtitle = [ifaces, ttlText].filter(Boolean).join(' • ');
        return {
            title: 'ROUTE',
            subtitle,
            modifier: options.isIcmpError ? 'icmp-error' : 'route'
        };
    }

    if (action === 'DROP') {
        const reasonLabels = {
            'ttl-expired': 'TTL Expired',
            'filtered-same-port': 'Same Port Filter',
            'port-mismatch': 'Port Mismatch'
        };
        const reason = reasonLabels[hopAction.reason] || hopAction.reason || 'Dropped';
        return {
            title: 'DROP',
            subtitle: reason,
            modifier: 'drop'
        };
    }

    return {
        title: action || 'FRAME',
        subtitle: '',
        modifier: options.isIcmpError ? 'icmp-error' : 'forward'
    };
}

function startFrameAnimation(path, callbacks = {}, isDelivered = true, dropReason = '', options = {}) {
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

    const badge = document.createElement('div');
    badge.className = 'frame-hop-badge';
    badge.setAttribute('aria-hidden', 'true');
    layer.appendChild(badge);

    const hopActions = options.hopActions || networkState.lastFrameResult?.hopActions || [];
    const reverseHopActions = options.reverseHopActions || networkState.lastFrameResult?.reverseHopActions || [];
    const arpResult = options.arpResult || networkState.lastFrameResult?.arpResult;
    const packetInfo = options.packet || networkState.lastFrameResult?.packet;
    const icmpErrorPacket = options.icmpErrorPacket || networkState.lastFrameResult?.icmpErrorPacket;
    const icmpErrorResult = options.icmpErrorResult || networkState.lastFrameResult?.icmpErrorResult;
    const isIcmp = Boolean(packetInfo?.icmp && reverseHopActions.length > 0);

    const animation = {
        packet,
        badge,
        forwardPath: [...path],
        reversePath: [...path].reverse(),
        hopActions,
        reverseHopActions,
        arpResult,
        isIcmp,
        icmpErrorPacket,
        icmpErrorResult,
        animationFrame: null,
        cleanupTimer: null,
        turnaroundTimer: null,
        cancelled: false
    };
    frameAnimation = animation;

    const setBadgeConfig = (config) => {
        if (!config) {
            badge.style.display = 'none';
            return;
        }
        badge.style.display = 'flex';
        badge.className = `frame-hop-badge frame-hop-badge--${config.modifier}`;
        badge.innerHTML = `
            <span class="frame-hop-badge__title">${escapeHtml(config.title)}</span>
            ${config.subtitle ? `<span class="frame-hop-badge__subtitle">${escapeHtml(config.subtitle)}</span>` : ''}
        `;
    };

    const finish = (delivered, reason = '', finalNodeId = null, finishOptions = {}) => {
        if (frameAnimation !== animation || animation.cancelled) {
            return;
        }

        if (animation.animationFrame) {
            window.cancelAnimationFrame(animation.animationFrame);
        }
        if (animation.turnaroundTimer) {
            window.clearTimeout(animation.turnaroundTimer);
        }

        const endNodeId = finalNodeId || (delivered
            ? (isIcmp ? path[0] : path[path.length - 1])
            : path[path.length - 1]);

        packet.classList.remove('is-moving');
        if (delivered && !finishOptions.isIcmpError) {
            packet.classList.add('is-delivered');
        } else {
            packet.classList.add('is-dropped');
        }
        clearFrameDeviceHighlights();

        if (delivered && !finishOptions.isIcmpError) {
            setFrameDeviceHighlight(endNodeId, 'is-frame-destination');
            setBadgeConfig(getHopBadgeConfig(null, false, true, { isIcmp }));
        } else if (finishOptions.isErrorDelivered) {
            setFrameDeviceHighlight(endNodeId, 'is-frame-destination');
            const errType = formatIcmpType(animation.icmpErrorPacket?.icmp?.type || animation.icmpErrorPacket?.icmp?.typeName);
            setBadgeConfig({
                title: 'ICMP ERROR RECEIVED',
                subtitle: `${endNodeId} received ${errType}`,
                modifier: 'drop'
            });
        } else {
            setFrameDeviceHighlight(endNodeId, 'is-frame-dropped');
            const dropHop = (animation.isReverse ? reverseHopActions : hopActions).find((h) => h.deviceId === endNodeId && h.action === 'DROP')
                || (animation.isReverse ? reverseHopActions : hopActions).slice(-1)[0];
            setBadgeConfig(getHopBadgeConfig(dropHop || { action: 'DROP', reason }, true, false));
        }

        animation.cleanupTimer = window.setTimeout(() => {
            if (frameAnimation !== animation) {
                return;
            }
            clearFrameDeviceHighlights();
            packet.remove();
            badge.remove();
            frameAnimation = null;
            if (delivered && !finishOptions.isIcmpError) {
                callbacks.onDelivered?.();
            } else {
                callbacks.onDropped?.(reason || dropReason || 'Topology changed before the frame reached its destination.');
            }
        }, (delivered || finishOptions.isErrorDelivered) ? 600 : 720);
    };

    const animateReverseHop = (hopIndex) => {
        if (frameAnimation !== animation || animation.cancelled) {
            return;
        }

        const curPath = animation.reversePath;
        const sourceId = curPath[hopIndex];
        const targetId = curPath[hopIndex + 1];
        const initialSource = getDeviceCenter(sourceId);
        const initialTarget = getDeviceCenter(targetId);
        if (!initialSource || !initialTarget) {
            finish(false, 'A device on the reverse topology path is no longer available.', sourceId);
            return;
        }

        clearFrameDeviceHighlights();
        setFrameDeviceHighlight(curPath[0], animation.isIcmpError ? 'is-frame-dropped' : 'is-frame-source');
        if (hopIndex > 0) {
            setFrameDeviceHighlight(sourceId, 'is-frame-hop');
        }
        setFrameDeviceHighlight(targetId, hopIndex === curPath.length - 2 ? (isDelivered || animation.isIcmpError ? 'is-frame-destination' : 'is-frame-dropped') : 'is-frame-hop');

        if (hopIndex > 0) {
            const hopAction = reverseHopActions.find((h) => h.deviceId === sourceId);
            setBadgeConfig(getHopBadgeConfig(hopAction, false, false, {
                isIcmpError: animation.isIcmpError
            }));
        } else {
            if (animation.isIcmpError) {
                const errType = formatIcmpType(animation.icmpErrorPacket?.icmp?.type || animation.icmpErrorPacket?.icmp?.typeName);
                setBadgeConfig({
                    title: `ICMP ${errType.toUpperCase()}`,
                    subtitle: `${sourceId} → ${curPath[curPath.length - 1]}`,
                    modifier: 'icmp-error'
                });
            } else {
                setBadgeConfig(getHopBadgeConfig(null, false, false, {
                    isIcmpReply: true,
                    subtitle: `${sourceId} → ${curPath[curPath.length - 1]}`
                }));
            }
        }

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
                finish(false, 'A device on the reverse path was removed.', sourceId);
                return;
            }

            const progress = Math.min(1, (now - startedAt) / duration);
            const x = source.x + (target.x - source.x) * progress;
            const y = source.y + (target.y - source.y) * progress;
            packet.style.left = `${x}px`;
            packet.style.top = `${y}px`;
            badge.style.left = `${x}px`;
            badge.style.top = `${y - 38}px`;

            if (progress < 1) {
                animation.animationFrame = window.requestAnimationFrame(move);
                return;
            }

            if (hopIndex < curPath.length - 2) {
                animateReverseHop(hopIndex + 1);
            } else {
                const returnSucceeded = animation.isIcmpError
                    ? Boolean(networkState.lastFrameResult?.icmpErrorResult?.success)
                    : isDelivered;
                finish(returnSucceeded, dropReason, curPath[curPath.length - 1], {
                    isIcmpError: animation.isIcmpError,
                    isErrorDelivered: Boolean(animation.isIcmpError && returnSucceeded)
                });
            }
        };

        packet.style.left = `${initialSource.x}px`;
        packet.style.top = `${initialSource.y}px`;
        badge.style.left = `${initialSource.x}px`;
        badge.style.top = `${initialSource.y - 38}px`;
        animation.animationFrame = window.requestAnimationFrame(move);
    };

    const animateForwardHop = (hopIndex) => {
        if (frameAnimation !== animation || animation.cancelled) {
            return;
        }

        const curPath = animation.forwardPath;
        const sourceId = curPath[hopIndex];
        const targetId = curPath[hopIndex + 1];
        const initialSource = getDeviceCenter(sourceId);
        const initialTarget = getDeviceCenter(targetId);
        if (!initialSource || !initialTarget) {
            finish(false, 'A device on the topology path is no longer available.', sourceId);
            return;
        }

        clearFrameDeviceHighlights();
        setFrameDeviceHighlight(curPath[0], 'is-frame-source');
        if (hopIndex > 0) {
            setFrameDeviceHighlight(sourceId, 'is-frame-hop');
        }
        setFrameDeviceHighlight(targetId, hopIndex === curPath.length - 2 ? (isDelivered ? 'is-frame-destination' : 'is-frame-dropped') : 'is-frame-hop');

        if (hopIndex > 0) {
            const hopAction = hopActions.find((h) => h.deviceId === sourceId);
            const isArpFlood = Boolean(arpResult && !arpResult.cacheHit && (hopAction?.reason === 'broadcast' || hopAction?.destinationMac === 'FF:FF:FF:FF:FF:FF'));
            setBadgeConfig(getHopBadgeConfig(hopAction, false, false, { isArpFlood }));
        } else {
            if (arpResult && !arpResult.cacheHit && arpResult.targetIp) {
                setBadgeConfig(getHopBadgeConfig(null, false, false, {
                    isArpRequest: true,
                    targetIp: arpResult.targetIp
                }));
            } else if (isIcmp) {
                setBadgeConfig(getHopBadgeConfig(null, false, false, {
                    isIcmpRequest: true,
                    subtitle: `${sourceId} → ${curPath[curPath.length - 1]}`
                }));
            } else {
                setBadgeConfig({
                    title: 'FRAME',
                    subtitle: `${sourceId} → ${targetId}`,
                    modifier: 'forward'
                });
            }
        }

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
                finish(false, 'A device on the topology path was removed.', sourceId);
                return;
            }

            const progress = Math.min(1, (now - startedAt) / duration);
            const x = source.x + (target.x - source.x) * progress;
            const y = source.y + (target.y - source.y) * progress;
            packet.style.left = `${x}px`;
            packet.style.top = `${y}px`;
            badge.style.left = `${x}px`;
            badge.style.top = `${y - 38}px`;

            if (progress < 1) {
                animation.animationFrame = window.requestAnimationFrame(move);
                return;
            }

            if (hopIndex < curPath.length - 2) {
                animateForwardHop(hopIndex + 1);
            } else {
                const forwardSucceeded = Boolean(networkState.lastFrameResult?.events?.some((e) => e.includes('received ICMP Echo Request') || e.includes('generated ICMP Echo Reply')))
                    || (isDelivered && !isIcmp);

                if (!forwardSucceeded) {
                    const icmpErrorResult = networkState.lastFrameResult?.icmpErrorResult;
                    const icmpErrorPacket = networkState.lastFrameResult?.icmpErrorPacket;
                    const hasErrorReturnPath = Boolean(icmpErrorResult && Array.isArray(icmpErrorResult.path) && icmpErrorResult.path.length >= 2);

                    if (hasErrorReturnPath) {
                        // ICMP Error Turnaround at the dropping router
                        const dropNodeId = curPath[curPath.length - 1];
                        setFrameDeviceHighlight(dropNodeId, 'is-frame-dropped');
                        packet.classList.remove('is-moving');
                        packet.classList.add('is-icmp-error');

                        const errType = formatIcmpType(icmpErrorPacket?.icmp?.type || icmpErrorPacket?.icmp?.typeName);
                        setBadgeConfig({
                            title: 'ICMP ERROR',
                            subtitle: `${dropReason || 'Dropped'} • Sending ${errType}`,
                            modifier: 'drop'
                        });

                        animation.turnaroundTimer = window.setTimeout(() => {
                            if (frameAnimation !== animation || animation.cancelled) {
                                return;
                            }
                            animation.isReverse = true;
                            animation.isIcmpError = true;
                            animation.reversePath = [...icmpErrorResult.path];
                            packet.innerHTML = '<span class="frame-packet__icon">ICMP ERR</span>';
                            animateReverseHop(0);
                        }, 500);
                        return;
                    }

                    finish(false, dropReason, curPath[curPath.length - 1]);
                    return;
                }

                if (!isIcmp) {
                    finish(true, '', curPath[curPath.length - 1]);
                    return;
                }

                // ICMP Destination Turnaround
                const destNodeId = curPath[curPath.length - 1];
                setFrameDeviceHighlight(destNodeId, 'is-frame-destination');
                packet.classList.remove('is-moving');
                setBadgeConfig({
                    title: 'ICMP ECHO REQUEST',
                    subtitle: 'Received • Generating Reply',
                    modifier: 'icmp-reply'
                });

                animation.turnaroundTimer = window.setTimeout(() => {
                    if (frameAnimation !== animation || animation.cancelled) {
                        return;
                    }
                    animation.isReverse = true;
                    packet.innerHTML = '<span class="frame-packet__icon">REPLY</span>';
                    animateReverseHop(0);
                }, 400);
            }
        };

        packet.style.left = `${initialSource.x}px`;
        packet.style.top = `${initialSource.y}px`;
        badge.style.left = `${initialSource.x}px`;
        badge.style.top = `${initialSource.y - 38}px`;
        animation.animationFrame = window.requestAnimationFrame(move);
    };

    animateForwardHop(0);
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

    const badge = document.createElement('div');
    badge.className = 'frame-hop-badge frame-hop-badge--drop';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = '<span class="frame-hop-badge__title">DROP</span><span class="frame-hop-badge__subtitle">Pre-flight check</span>';
    badge.style.left = `${position.x}px`;
    badge.style.top = `${position.y - 38}px`;
    layer.appendChild(badge);

    setFrameDeviceHighlight(deviceId, 'is-frame-dropped');

    window.setTimeout(() => {
        packet.remove();
        badge.remove();
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
    if (frameAnimation.turnaroundTimer) {
        window.clearTimeout(frameAnimation.turnaroundTimer);
    }
    frameAnimation.packet?.remove();
    frameAnimation.badge?.remove();
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
        const sourceDev = getDeviceById(selectedConnection.source);
        const targetDev = getDeviceById(selectedConnection.target);
        const sourcePort = sourceDev?.type === 'switch'
            ? getSwitchPortLabel(sourceDev.id, selectedConnection.id)
            : sourceDev?.type === 'router'
                ? getRouterPortLabel(sourceDev.id, selectedConnection.id)
                : null;
        const targetPort = targetDev?.type === 'switch'
            ? getSwitchPortLabel(targetDev.id, selectedConnection.id)
            : targetDev?.type === 'router'
                ? getRouterPortLabel(targetDev.id, selectedConnection.id)
                : null;
        const sourceLabel = sourcePort
            ? `${selectedConnection.source} (${sourcePort})`
            : selectedConnection.source;
        const targetLabel = targetPort
            ? `${selectedConnection.target} (${targetPort})`
            : selectedConnection.target;

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
                        <input type="text" value="${escapeHtml(sourceLabel)}" readonly>
                    </div>
                    <div class="property-field">
                        <label>Target</label>
                        <input type="text" value="${escapeHtml(targetLabel)}" readonly>
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

    if (selected.type === 'router') {
        panel.innerHTML = renderRouterInspector(selected);
    } else {
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
                ${['pc', 'laptop', 'server'].includes(selected.type) ? renderArpTableInspector(selected) : ''}
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
    }

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

    const clearArpButton = panel.querySelector('#clearArpTable');
    if (clearArpButton) {
        clearArpButton.addEventListener('click', () => {
            const selectedDevice = getDeviceById(networkState.selectedDeviceId);
            if (!selectedDevice) {
                return;
            }
            clearArpTable(selectedDevice.id);
            updateStatus(`ARP table cleared for ${selectedDevice.name}.`);
            renderPropertiesPanel();
        });
    }

    const addRouteBtn = panel.querySelector('#addStaticRouteBtn');
    if (addRouteBtn && selected.type === 'router') {
        const handleAddRoute = () => {
            const destInput = panel.querySelector('#staticRouteDest');
            const maskInput = panel.querySelector('#staticRouteMask');
            const nextHopInput = panel.querySelector('#staticRouteNextHop');
            const ifaceSelect = panel.querySelector('#staticRouteInterface');
            const metricInput = panel.querySelector('#staticRouteMetric');
            const adInput = panel.querySelector('#staticRouteAdminDistance');
            const feedbackEl = panel.querySelector('#staticRouteFeedback');

            let dest = destInput ? destInput.value.trim() : '';
            let mask = maskInput ? maskInput.value.trim() : '';
            const nextHop = nextHopInput ? nextHopInput.value.trim() : '';
            const egressIface = ifaceSelect ? ifaceSelect.value.trim() : '';
            const metricVal = metricInput ? parseInt(metricInput.value, 10) : 1;
            const rawAd = adInput ? adInput.value.trim() : '';
            const adminDistanceVal = rawAd !== '' ? parseInt(rawAd, 10) : 1;

            // Normalize CIDR in destination if present (e.g. 10.20.30.0/24)
            if (dest.includes('/')) {
                const parts = dest.split('/');
                dest = parts[0].trim();
                if (!mask && parts[1]) {
                    mask = parts[1].trim();
                }
            }

            // Normalize prefix length in mask input (e.g. /24 or 24)
            if (mask && (/^\/?[0-9]{1,2}$/.test(mask))) {
                const pLen = parseInt(mask.replace(/^\//, ''), 10);
                if (pLen >= 0 && pLen <= 32) {
                    mask = getMaskFromPrefixLength(pLen) || mask;
                }
            }

            const routeData = {
                network: dest,
                subnetMask: mask,
                nextHop: nextHop || undefined,
                interface: egressIface || undefined,
                adminDistance: isNaN(adminDistanceVal) ? rawAd : adminDistanceVal,
                metric: isNaN(metricVal) ? 1 : metricVal
            };

            pushHistory();
            const result = addStaticRoute(selected.id, routeData);
            if (result.success) {
                updateStatus(`Static route ${result.route.cidr} added to ${selected.name}.`);
                renderPropertiesPanel();
            } else {
                networkState.history.pop();
                if (feedbackEl) {
                    feedbackEl.textContent = `✗ ${result.reason}`;
                    feedbackEl.className = 'property-feedback property-feedback--error';
                }
            }
        };

        addRouteBtn.addEventListener('click', handleAddRoute);

        const formInputs = panel.querySelectorAll('#staticRouteDest, #staticRouteMask, #staticRouteNextHop, #staticRouteAdminDistance, #staticRouteMetric');
        formInputs.forEach((input) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRoute();
                }
            });
        });
    }

    panel.querySelectorAll('.router-interface-toggle-btn[data-interface]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const ifName = btn.dataset.interface;
            if (!ifName) return;
            toggleRouterInterfaceStatus(selected.id, ifName);
        });
    });

    panel.querySelectorAll('.route-delete-btn[data-route-id]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const routeId = btn.dataset.routeId;
            if (!routeId) return;
            pushHistory();
            const result = removeStaticRoute(selected.id, routeId);
            if (result.success) {
                updateStatus(`Static route removed from ${selected.name}.`);
                renderPropertiesPanel();
            } else {
                networkState.history.pop();
                updateStatus(`Could not remove static route: ${result.reason}`);
            }
        });
    });

    refreshInspectorValidation(selected);
}

function renderArpTableInspector(device) {
    const table = getArpTable(device.id);
    const count = table.length;
    const isRouter = device.type === 'router';

    const rows = table.map((entry) => {
        const learnedFormatted = entry.learnedAt
            ? new Date(entry.learnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Dynamic';

        return `
            <tr>
                <td><code>${escapeHtml(entry.ip)}</code></td>
                <td><code>${escapeHtml(entry.mac)}</code></td>
                ${isRouter ? `<td>${escapeHtml(entry.interface || '—')}</td>` : ''}
                <td><span class="badge ${entry.type === 'static' ? 'badge--route' : 'badge--forward'}">${escapeHtml(entry.type || 'dynamic')}</span></td>
                <td>${escapeHtml(learnedFormatted)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="property-summary" id="deviceArpTableSection">
            <h4>ARP TABLE</h4>
            ${count ? `
                <table class="property-table">
                    <thead>
                        <tr>
                            <th>IP Address</th>
                            <th>MAC Address</th>
                            ${isRouter ? '<th>Interface</th>' : ''}
                            <th>Type</th>
                            <th>Learned At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            ` : '<p class="empty-state">No ARP entries cached yet.</p>'}
            <div class="property-actions">
                <button id="clearArpTable" class="toolbar-button" type="button">Clear ARP Table</button>
            </div>
        </div>
    `;
}

function renderHopDecisionCard(hop) {
    if (!hop) return '';
    const deviceName = escapeHtml(hop.deviceName || hop.deviceId || 'Device');
    const rawAction = String(hop.action || 'UNKNOWN').toUpperCase();
    const actionClass = rawAction === 'FORWARD' ? 'forward' :
                        rawAction === 'ROUTE' ? 'route' :
                        rawAction === 'FLOOD' ? 'flood' :
                        rawAction === 'DROP' ? 'drop' : 'forward';

    const items = [];

    const ingress = hop.ingressPort || hop.ingressInterface;
    if (ingress) {
        items.push({ label: 'Ingress', value: ingress });
    }

    if (hop.egressPort) {
        items.push({ label: 'Egress', value: hop.egressPort });
    } else if (hop.egressInterface) {
        items.push({ label: 'Egress', value: hop.egressInterface });
    } else if (Array.isArray(hop.egressPorts) && hop.egressPorts.length) {
        items.push({ label: 'Egress', value: hop.egressPorts.join(', ') });
    }

    if (hop.reason) {
        const reasonLabels = {
            'known-unicast': 'Known Unicast',
            'unknown-unicast': 'Unknown Unicast',
            'broadcast': 'Broadcast',
            'filtered-same-port': 'Filtered (Same Port)',
            'port-mismatch': 'Port Mismatch',
            'ttl-expired': 'TTL Expired'
        };
        items.push({ label: 'Reason', value: reasonLabels[hop.reason] || hop.reason });
    }

    if (typeof hop.ttl === 'number') {
        if (hop.action === 'ROUTE') {
            items.push({ label: 'TTL', value: `${hop.ttl + 1} → ${hop.ttl}` });
        } else if (hop.action === 'DROP' && hop.reason === 'ttl-expired') {
            items.push({ label: 'TTL', value: '1 → 0 (Expired)' });
        } else {
            items.push({ label: 'TTL', value: String(hop.ttl) });
        }
    }

    if (hop.sourceMac) {
        items.push({ label: 'Source MAC', value: hop.sourceMac });
    }

    if (hop.destinationMac) {
        items.push({ label: 'Destination MAC', value: hop.destinationMac });
    }

    const itemsHtml = items.map((item) => `
        <div class="hop-decision-item">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
        </div>
    `).join('');

    return `
        <div class="hop-decision-card">
            <div class="hop-decision-header">
                <span class="hop-decision-device">${deviceName}</span>
                <span class="badge badge--${actionClass}">${escapeHtml(rawAction)}</span>
            </div>
            <div class="hop-decision-grid">
                ${itemsHtml}
            </div>
        </div>
    `;
}

function renderHopDecisionsSection(hopActions, reverseHopActions, icmpErrorPacket) {
    if (!Array.isArray(hopActions) || hopActions.length === 0) {
        return '';
    }

    const forwardCards = hopActions.map((hop) => renderHopDecisionCard(hop)).join('');
    let reverseHtml = '';

    if (Array.isArray(reverseHopActions) && reverseHopActions.length > 0) {
        let returnTitle = 'Return Path — ICMP Echo Reply';
        if (icmpErrorPacket && icmpErrorPacket.icmp) {
            const typeStr = formatIcmpType(icmpErrorPacket.icmp.type || icmpErrorPacket.icmp.typeName);
            returnTitle = `Return Path — ICMP ${typeStr}`;
        }
        const reverseCards = reverseHopActions.map((hop) => renderHopDecisionCard(hop)).join('');
        reverseHtml = `
            <div class="hop-decisions-subheading">${escapeHtml(returnTitle)}</div>
            <div class="hop-decision-list">
                ${reverseCards}
            </div>
        `;
    }

    return `
        <div class="hop-decisions">
            <h4>HOP DECISIONS</h4>
            <div class="hop-decision-list">
                ${forwardCards}
            </div>
            ${reverseHtml}
        </div>
    `;
}

function formatIcmpType(type) {
    if (!type) return 'Echo Request';
    const str = String(type).toUpperCase();
    if (str === 'ECHO_REQUEST' || str === '8') return 'Echo Request';
    if (str === 'ECHO_REPLY' || str === '0') return 'Echo Reply';
    if (str === 'TIME_EXCEEDED' || str === '11') return 'Time to Live Exceeded';
    if (str === 'DESTINATION_UNREACHABLE' || str === '3') return 'Destination Unreachable';
    return type;
}

function formatProtocol(proto) {
    if (!proto) return 'ICMP (1)';
    const str = String(proto).toUpperCase();
    if (str === 'ICMP' || str === '1') return 'ICMP (1)';
    if (str === 'TCP' || str === '6') return 'TCP (6)';
    if (str === 'UDP' || str === '17') return 'UDP (17)';
    return proto;
}

function renderArpResolutionSection(arpResult) {
    if (!arpResult) return '';

    if (arpResult.success === false) {
        return `
            <div class="packet-inspector__section packet-inspector__section--arp-failed">
                <h5 class="packet-inspector__section-title">ARP RESOLUTION FAILED</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Target IP</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(arpResult.targetIp || 'N/A')}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Reason</span>
                        <strong class="packet-inspector__value">${escapeHtml(arpResult.reason || 'No ARP responder')}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    if (arpResult.cacheHit === true) {
        return `
            <div class="packet-inspector__section">
                <h5 class="packet-inspector__section-title">ARP RESOLUTION — CACHE HIT</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Target IP</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(arpResult.targetIp)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Resolved MAC</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(arpResult.targetMac)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Status</span>
                        <strong class="packet-inspector__value packet-inspector__value--success">Cache Hit (No broadcast needed)</strong>
                    </div>
                </div>
            </div>
        `;
    }

    const req = arpResult.requestPacket;
    const rep = arpResult.replyPacket;
    const switchActions = Array.isArray(arpResult.hopActions)
        ? arpResult.hopActions.filter((h) => h.type === 'switch')
        : [];

    let requestHtml = '';
    if (req) {
        requestHtml = `
            <div class="packet-inspector__arp-subcard">
                <div class="packet-inspector__subcard-title">REQUEST</div>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Source IP</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(req.senderIp)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Source MAC</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(req.senderMac)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Target IP</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(req.targetIp)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Target MAC</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">FF:FF:FF:FF:FF:FF</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Operation</span>
                        <strong class="packet-inspector__value">REQUEST</strong>
                    </div>
                </div>
            </div>
        `;
    }

    let switchActionHtml = '';
    if (switchActions.length) {
        switchActionHtml = switchActions.map((sw) => `
            <div class="packet-inspector__arp-subcard">
                <div class="packet-inspector__subcard-title">SWITCH ACTION — ${escapeHtml(sw.deviceName || sw.deviceId)}</div>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Action</span>
                        <strong class="packet-inspector__value">${escapeHtml(sw.action || 'FLOOD')}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Ingress</span>
                        <strong class="packet-inspector__value">${escapeHtml(sw.ingressPort || 'N/A')}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Egress</span>
                        <strong class="packet-inspector__value">${escapeHtml(Array.isArray(sw.egressPorts) ? sw.egressPorts.join(', ') : (sw.egressPort || 'All other ports'))}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Reason</span>
                        <strong class="packet-inspector__value">${escapeHtml(sw.reason === 'broadcast' ? 'Broadcast' : sw.reason)}</strong>
                    </div>
                </div>
            </div>
        `).join('');
    }

    let replyHtml = '';
    if (rep) {
        replyHtml = `
            <div class="packet-inspector__arp-subcard">
                <div class="packet-inspector__subcard-title">REPLY</div>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Responder IP</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(rep.senderIp)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">MAC</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(rep.senderMac)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Operation</span>
                        <strong class="packet-inspector__value">REPLY</strong>
                    </div>
                </div>
            </div>
        `;
    }

    const cacheUpdatedHtml = `
        <div class="packet-inspector__arp-subcard packet-inspector__arp-subcard--highlight">
            <div class="packet-inspector__subcard-title">ARP CACHE UPDATED</div>
            <div class="packet-inspector__item">
                <span class="packet-inspector__label">Cached Entry</span>
                <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(arpResult.targetIp)} → ${escapeHtml(arpResult.targetMac)}</strong>
            </div>
        </div>
    `;

    return `
        <div class="packet-inspector__section">
            <h5 class="packet-inspector__section-title">ARP RESOLUTION</h5>
            ${requestHtml}
            ${switchActionHtml}
            ${replyHtml}
            ${cacheUpdatedHtml}
        </div>
    `;
}

function renderPacketInspector(packet, result) {
    if (!packet && !result) {
        return '';
    }

    const pkt = packet || result?.packet || {};
    const path = result?.path || [];
    const sourceDev = path.length ? getDeviceById(path[0]) : null;
    const destDev = path.length ? getDeviceById(path[path.length - 1]) : null;

    const sourceMac = sourceDev?.type === 'router'
        ? (sourceDev.interfaces?.['Gig0/0']?.mac || sourceDev.mac || 'N/A')
        : (sourceDev?.mac || result?.hopActions?.[0]?.sourceMac || 'N/A');

    const destMac = result?.hopActions?.[0]?.destinationMac
        || (sourceDev ? lookupArp(sourceDev.id, pkt.destinationIp) : null)
        || destDev?.mac
        || 'N/A';

    const etherType = pkt.protocol === 'ARP' ? 'ARP (0x0806)' : 'IPv4 (0x0800)';

    let summaryTitle = 'IPv4 Packet';
    if (pkt.icmp) {
        summaryTitle = pkt.icmp.type === 'ECHO_REPLY' ? 'ICMP Echo Reply' : 'ICMP Echo Request';
    } else if (pkt.protocol) {
        summaryTitle = `${pkt.protocol} Packet`;
    }

    const summaryEndpoints = (pkt.sourceIp && pkt.destinationIp)
        ? `${pkt.sourceIp} → ${pkt.destinationIp}`
        : (path.length >= 2 ? `${path[0]} → ${path[path.length - 1]}` : '');

    const arpHtml = renderArpResolutionSection(result?.arpResult);

    const ethernetHtml = `
        <div class="packet-inspector__section">
            <h5 class="packet-inspector__section-title">ETHERNET FRAME</h5>
            <div class="packet-inspector__grid">
                <div class="packet-inspector__item">
                    <span class="packet-inspector__label">Source MAC</span>
                    <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(sourceMac)}</strong>
                </div>
                <div class="packet-inspector__item">
                    <span class="packet-inspector__label">Destination MAC</span>
                    <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(destMac)}</strong>
                </div>
                <div class="packet-inspector__item">
                    <span class="packet-inspector__label">EtherType</span>
                    <strong class="packet-inspector__value">${escapeHtml(etherType)}</strong>
                </div>
            </div>
        </div>
    `;

    let ipv4Html = '';
    if (pkt.sourceIp || pkt.destinationIp || typeof pkt.ttl === 'number') {
        const protoText = formatProtocol(pkt.protocol || (pkt.icmp ? 'ICMP' : 'IPv4'));
        ipv4Html = `
            <div class="packet-inspector__section">
                <h5 class="packet-inspector__section-title">IPv4 PACKET</h5>
                <div class="packet-inspector__grid">
                    ${pkt.sourceIp ? `
                        <div class="packet-inspector__item">
                            <span class="packet-inspector__label">Source IP</span>
                            <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(pkt.sourceIp)}</strong>
                        </div>
                    ` : ''}
                    ${pkt.destinationIp ? `
                        <div class="packet-inspector__item">
                            <span class="packet-inspector__label">Destination IP</span>
                            <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(pkt.destinationIp)}</strong>
                        </div>
                    ` : ''}
                    ${typeof pkt.ttl === 'number' ? `
                        <div class="packet-inspector__item">
                            <span class="packet-inspector__label">TTL</span>
                            <strong class="packet-inspector__value">${escapeHtml(String(pkt.ttl))}</strong>
                        </div>
                    ` : ''}
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Protocol</span>
                        <strong class="packet-inspector__value">${escapeHtml(protoText)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    let icmpHtml = '';
    if (pkt.icmp) {
        const typeText = formatIcmpType(pkt.icmp.type);
        const codeText = typeof pkt.icmp.code === 'number' ? String(pkt.icmp.code) : '0';
        const idText = typeof pkt.icmp.identifier === 'number' ? String(pkt.icmp.identifier) : '1';
        const seqText = typeof pkt.icmp.sequence === 'number' ? String(pkt.icmp.sequence) : '1';

        icmpHtml = `
            <div class="packet-inspector__section">
                <h5 class="packet-inspector__section-title">ICMP</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Type</span>
                        <strong class="packet-inspector__value">${escapeHtml(typeText)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Code</span>
                        <strong class="packet-inspector__value">${escapeHtml(codeText)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Identifier</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(idText)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Sequence</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(seqText)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    let icmpErrorHtml = '';
    const errPkt = result?.icmpErrorPacket;
    if (errPkt && errPkt.icmp) {
        const errType = formatIcmpType(errPkt.icmp.type || errPkt.icmp.typeName);
        const errCode = typeof errPkt.icmp.code === 'number' ? String(errPkt.icmp.code) : '0';
        const errCodeName = errPkt.icmp.codeName ? ` (${errPkt.icmp.codeName.replace(/_/g, ' ')})` : '';
        const generatorName = errPkt.icmp.router?.name || errPkt.icmp.router?.id || 'Router';
        const generatorIp = errPkt.sourceIp || errPkt.icmp.router?.ip || 'N/A';
        const origDest = errPkt.icmp.originalPacket?.destinationIp || pkt.destinationIp || 'N/A';
        const origSrc = errPkt.icmp.originalPacket?.sourceIp || pkt.sourceIp || 'N/A';

        icmpErrorHtml = `
            <div class="packet-inspector__section packet-inspector__section--icmp-error">
                <h5 class="packet-inspector__section-title">ICMP DIAGNOSTIC ERROR</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Error Type</span>
                        <strong class="packet-inspector__value packet-inspector__value--warning">${escapeHtml(errType)} (Type ${escapeHtml(String(errPkt.icmp.type))})</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Code</span>
                        <strong class="packet-inspector__value">${escapeHtml(errCode)}${escapeHtml(errCodeName)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Generating Device</span>
                        <strong class="packet-inspector__value">${escapeHtml(generatorName)} (${escapeHtml(generatorIp)})</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Target (Original Sender)</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(errPkt.destinationIp || origSrc)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Original Destination</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(origDest)}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Description</span>
                        <strong class="packet-inspector__value">${escapeHtml(errPkt.icmp.description || errPkt.icmp.reason || 'Diagnostic Error')}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="packet-inspector">
            <h4>PACKET INSPECTOR</h4>
            <div class="packet-inspector__summary">
                <div class="packet-inspector__summary-title">${escapeHtml(summaryTitle)}</div>
                ${summaryEndpoints ? `<div class="packet-inspector__summary-endpoints">${escapeHtml(summaryEndpoints)}</div>` : ''}
            </div>
            ${arpHtml}
            ${ethernetHtml}
            ${ipv4Html}
            ${icmpHtml}
            ${icmpErrorHtml}
        </div>
    `;
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
    const initialTtl = (networkState.sendFrameState && typeof networkState.sendFrameState.initialTtl === 'number')
        ? networkState.sendFrameState.initialTtl
        : 64;
    const eventsHtml = networkState.lastFrameResult?.events?.map((event, index) => `
            <li class="frame-log-item"><strong>${index + 1}.</strong><span>${escapeHtml(event)}</span></li>`).join('') || '';
    const packetInspectorHtml = renderPacketInspector(
        networkState.lastFrameResult?.packet,
        networkState.lastFrameResult
    );
    const hopDecisionsHtml = renderHopDecisionsSection(
        networkState.lastFrameResult?.hopActions,
        networkState.lastFrameResult?.reverseHopActions,
        networkState.lastFrameResult?.icmpErrorPacket
    );

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
                <div class="send-frame-ttl-control">
                    <div class="send-frame-ttl-header">
                        <label for="sendFrameInitialTtl">Initial TTL</label>
                        <input type="number" id="sendFrameInitialTtl" min="1" max="255" value="${initialTtl}">
                    </div>
                    <div class="send-frame-ttl-presets">
                        <button type="button" class="ttl-preset-btn ${initialTtl === 1 ? 'is-active' : ''}" data-ttl="1">TTL 1</button>
                        <button type="button" class="ttl-preset-btn ${initialTtl === 2 ? 'is-active' : ''}" data-ttl="2">TTL 2</button>
                        <button type="button" class="ttl-preset-btn ${initialTtl === 64 ? 'is-active' : ''}" data-ttl="64">TTL 64</button>
                        <button type="button" class="ttl-preset-btn ${initialTtl === 128 ? 'is-active' : ''}" data-ttl="128">TTL 128</button>
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
                    ${packetInspectorHtml}
                    ${hopDecisionsHtml}
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
    const ttlInput = document.getElementById('sendFrameInitialTtl');
    if (ttlInput) {
        ttlInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            const clamped = clamp(isNaN(val) ? 64 : val, 1, 255);
            if (networkState.sendFrameState) {
                networkState.sendFrameState.initialTtl = clamped;
            } else {
                networkState.sendFrameState = { initialTtl: clamped };
            }
            renderPropertiesPanel();
        });
    }

    document.querySelectorAll('.ttl-preset-btn[data-ttl]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.ttl, 10);
            if (networkState.sendFrameState) {
                networkState.sendFrameState.initialTtl = val;
            } else {
                networkState.sendFrameState = { initialTtl: val };
            }
            renderPropertiesPanel();
        });
    });
}

function renderRouterRoutingTableSection(router) {
    const routes = getRouterRoutingTable(router.id);
    const count = routes.length;

    const rows = routes.map((route) => {
        const isConnected = route.code === 'C';
        const codeBadge = isConnected
            ? '<span class="badge badge--connected" title="Connected Route">C</span>'
            : '<span class="badge badge--static" title="Static Route">S</span>';
        const nextHopDisplay = route.nextHop ? `<code>${escapeHtml(route.nextHop)}</code>` : '—';
        const ifaceDisplay = route.interface ? escapeHtml(route.interface) : '—';
        const adDisplay = typeof route.adminDistance === 'number' ? escapeHtml(String(route.adminDistance)) : (isConnected ? '0' : '1');
        const metricDisplay = !isConnected && typeof route.metric === 'number' ? escapeHtml(String(route.metric)) : '—';
        const statusClass = route.status === 'down' ? 'route-status--down' : 'route-status--active';
        const statusDisplay = `<span class="route-status ${statusClass}">${escapeHtml(route.status || 'active')}</span>`;
        const actionDisplay = !isConnected && route.id
            ? `<button class="route-delete-btn" data-route-id="${escapeHtml(route.id)}" type="button" title="Delete Static Route" aria-label="Delete Static Route ${escapeHtml(route.network)}/${route.prefixLength}">✕</button>`
            : '—';

        return `
            <tr>
                <td>${codeBadge}</td>
                <td><code>${escapeHtml(route.network)}</code></td>
                <td><code>/${escapeHtml(String(route.prefixLength))}</code></td>
                <td>${nextHopDisplay}</td>
                <td>${ifaceDisplay}</td>
                <td>${adDisplay}</td>
                <td>${metricDisplay}</td>
                <td>${statusDisplay}</td>
                <td class="table-action-cell">${actionDisplay}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="property-summary" id="routerRoutingTableSection">
            <h4>ROUTING TABLE</h4>
            ${count ? `
                <table class="property-table router-routing-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Network</th>
                            <th>Prefix</th>
                            <th>Next Hop</th>
                            <th>Interface</th>
                            <th>AD</th>
                            <th>Metric</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            ` : '<p class="empty-state">No routes in routing table.</p>'}
        </div>
    `;
}

function renderRouterStaticRouteFormSection(router) {
    const ifaces = ['Gig0/0', 'Gig0/1'];
    const ifaceOptions = ifaces.map((ifName) => {
        const ifObj = router.interfaces?.[ifName] || { status: 'up' };
        const status = ifObj.status || 'up';
        return `<option value="${escapeHtml(ifName)}">${escapeHtml(ifName)} (${status})</option>`;
    }).join('');

    return `
        <div class="property-summary" id="routerStaticRouteFormSection">
            <h4>STATIC ROUTES</h4>
            <div class="static-route-form">
                <h5 class="static-route-form__title">Add Static Route</h5>
                <div class="property-field">
                    <label for="staticRouteDest">Destination Network / IP</label>
                    <input id="staticRouteDest" type="text" placeholder="e.g. 192.168.2.0 or 192.168.2.0/24">
                </div>
                <div class="property-field">
                    <label for="staticRouteMask">Subnet Mask or Prefix</label>
                    <input id="staticRouteMask" type="text" placeholder="e.g. 255.255.255.0 or /24">
                </div>
                <div class="property-field">
                    <label for="staticRouteNextHop">Next Hop IP</label>
                    <input id="staticRouteNextHop" type="text" placeholder="e.g. 10.0.12.2 (Optional if interface set)">
                </div>
                <div class="property-field">
                    <label for="staticRouteInterface">Egress Interface</label>
                    <select id="staticRouteInterface">
                        <option value="">Auto-resolve from Next Hop</option>
                        ${ifaceOptions}
                    </select>
                </div>
                <div class="property-field">
                    <label for="staticRouteAdminDistance">Administrative Distance (AD)</label>
                    <input id="staticRouteAdminDistance" type="number" min="1" max="255" value="1" placeholder="1 (Default)">
                </div>
                <div class="property-field">
                    <label for="staticRouteMetric">Metric</label>
                    <input id="staticRouteMetric" type="number" min="1" max="255" value="1" placeholder="1">
                </div>
                <div class="property-feedback" id="staticRouteFeedback"></div>
                <div class="property-actions">
                    <button id="addStaticRouteBtn" class="toolbar-button" type="button">Add Route</button>
                </div>
            </div>
        </div>
    `;
}

function renderRouterInspector(selected) {
    const draft = getInspectorDraft(selected);
    const nameValue = escapeHtml(getInspectorValue(selected, 'name'));
    const isValid = getInspectorValidity(selected, draft);
    const runtime = getRouterRuntime(selected.id);

    const ifaces = ['Gig0/0', 'Gig0/1'];
    const ifaceCards = ifaces.map((ifName) => {
        const ifObj = selected.interfaces?.[ifName] || { name: ifName, ip: '', subnetMask: '', mac: '', status: 'up' };
        const ipVal = escapeHtml(getInspectorValue(selected, `interfaces.${ifName}.ip`));
        const subnetVal = escapeHtml(getInspectorValue(selected, `interfaces.${ifName}.subnetMask`));
        const macVal = escapeHtml(getInspectorValue(selected, `interfaces.${ifName}.mac`));
        const status = ifObj.status || 'up';

        const connectionEntry = Object.entries(runtime.ports).find(([, port]) => port === ifName);
        let connectedInfo = 'Not connected';
        if (connectionEntry) {
            const connObj = getConnectionById(connectionEntry[0]);
            if (connObj) {
                const neighborId = connObj.source === selected.id ? connObj.target : connObj.source;
                const neighbor = getDeviceById(neighborId);
                if (neighbor) {
                    if (neighbor.type === 'switch') {
                        const switchPort = getSwitchPortLabel(neighbor.id, connObj.id);
                        connectedInfo = `Connected: ${neighbor.name} (${switchPort})`;
                    } else if (neighbor.type === 'router') {
                        const neighborPort = getRouterPortLabel(neighbor.id, connObj.id);
                        connectedInfo = `Connected: ${neighbor.name} (${neighborPort})`;
                    } else {
                        connectedInfo = `Connected: ${neighbor.name}`;
                    }
                }
            }
        }

        return `
            <div class="router-interface-card">
                <div class="router-interface-header">
                    <div class="router-interface-title-group">
                        <h5 class="router-interface-title">${escapeHtml(ifName)}</h5>
                        <span class="router-interface-status router-interface-status--${status === 'up' ? 'up' : 'down'}">${escapeHtml(status.toUpperCase())}</span>
                    </div>
                    <button class="router-interface-toggle-btn toolbar-button" data-interface="${escapeHtml(ifName)}" type="button" title="${status === 'up' ? 'Shut down interface ' + escapeHtml(ifName) : 'Enable interface ' + escapeHtml(ifName)}">
                        ${status === 'up' ? 'Shut Down' : 'No Shutdown'}
                    </button>
                </div>
                <p class="router-interface-connection">${escapeHtml(connectedInfo)}</p>
                <div class="property-field">
                    <label for="router_${escapeHtml(ifName)}_ip">IPv4 Address</label>
                    <input id="router_${escapeHtml(ifName)}_ip" type="text" value="${ipVal}" data-field="interfaces.${escapeHtml(ifName)}.ip" placeholder="Not configured">
                    <div class="property-feedback" data-feedback-for="interfaces.${escapeHtml(ifName)}.ip"></div>
                </div>
                <div class="property-field">
                    <label for="router_${escapeHtml(ifName)}_subnet">Subnet Mask</label>
                    <input id="router_${escapeHtml(ifName)}_subnet" type="text" value="${subnetVal}" data-field="interfaces.${escapeHtml(ifName)}.subnetMask" placeholder="Not configured">
                    <div class="property-feedback" data-feedback-for="interfaces.${escapeHtml(ifName)}.subnetMask"></div>
                </div>
                <div class="property-field">
                    <label for="router_${escapeHtml(ifName)}_mac">MAC Address</label>
                    <input id="router_${escapeHtml(ifName)}_mac" type="text" value="${macVal}" data-field="interfaces.${escapeHtml(ifName)}.mac" placeholder="Not configured">
                    <div class="property-feedback" data-feedback-for="interfaces.${escapeHtml(ifName)}.mac"></div>
                </div>
            </div>
        `;
    }).join('');

    return `
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
            </div>
            <div class="property-summary">
                <h4>INTERFACES</h4>
                ${ifaceCards}
            </div>
            ${renderRouterRoutingTableSection(selected)}
            ${renderRouterStaticRouteFormSection(selected)}
            ${renderArpTableInspector(selected)}
            <div class="property-actions">
                <button id="applyDeviceConfig" class="toolbar-button" type="button" ${isValid ? '' : 'disabled'}>Apply Changes</button>
            </div>
            <p class="property-info">Configuration updates are applied only when you click Apply Changes, so invalid data never overwrites the current device state.</p>
        </div>
    `;
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
    if (['pc', 'laptop', 'server'].includes(device.type)) {
        return { ip: true, subnetMask: true, gateway: true, mac: true };
    }

    if (device.type === 'switch') {
        return { mac: true };
    }

    if (device.type === 'router') {
        return { routerInterfaces: true };
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
    if (field.startsWith('interfaces.')) {
        const parts = field.split('.');
        const ifName = parts[1];
        const prop = parts[2];
        return device.interfaces?.[ifName]?.[prop] || '';
    }
    return device[field] || '';
}

function getInspectorValidity(device, draft) {
    if (device.type === 'router') {
        const ifaces = ['Gig0/0', 'Gig0/1'];
        const seenMacs = new Set();
        for (const ifName of ifaces) {
            const ipVal = (Object.prototype.hasOwnProperty.call(draft, `interfaces.${ifName}.ip`)
                ? draft[`interfaces.${ifName}.ip`]
                : device.interfaces?.[ifName]?.ip) || '';
            const subnetVal = (Object.prototype.hasOwnProperty.call(draft, `interfaces.${ifName}.subnetMask`)
                ? draft[`interfaces.${ifName}.subnetMask`]
                : device.interfaces?.[ifName]?.subnetMask) || '';
            const macVal = (Object.prototype.hasOwnProperty.call(draft, `interfaces.${ifName}.mac`)
                ? draft[`interfaces.${ifName}.mac`]
                : device.interfaces?.[ifName]?.mac) || '';

            if (ipVal !== '' && !isValidIPv4(ipVal)) {
                return false;
            }
            if (subnetVal !== '' && !isValidSubnetMask(subnetVal)) {
                return false;
            }
            if (macVal !== '') {
                if (!isValidMacAddress(macVal)) {
                    return false;
                }
                const normMac = normalizeMacAddress(macVal);
                if (seenMacs.has(normMac)) {
                    return false;
                }
                seenMacs.add(normMac);
                if (findDeviceByMac(macVal, device.id, networkState.devices, ifName)) {
                    return false;
                }
            }
        }
        return true;
    }

    const fields = getSupportedConfigFields(device);
    const values = {
        ip: (Object.prototype.hasOwnProperty.call(draft, 'ip') ? draft.ip : device.ip) || '',
        subnetMask: (Object.prototype.hasOwnProperty.call(draft, 'subnetMask') ? draft.subnetMask : device.subnetMask) || '',
        gateway: (Object.prototype.hasOwnProperty.call(draft, 'gateway') ? draft.gateway : device.gateway) || '',
        mac: (Object.prototype.hasOwnProperty.call(draft, 'mac') ? draft.mac : device.mac) || ''
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

    if (fields.mac && values.mac !== '') {
        if (!isValidMacAddress(values.mac)) {
            return false;
        }
        if (findDeviceByMac(values.mac, device.id)) {
            return false;
        }
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
    if (maskInt === 0) {
        return 0;
    }

    let prefixLength = 0;
    let bit = 0x80000000;
    while (prefixLength < 32 && (maskInt & bit) !== 0) {
        prefixLength += 1;
        bit >>>= 1;
    }

    if (prefixLength > 0 && prefixLength < 32 && maskInt !== ((0xFFFFFFFF << (32 - prefixLength)) >>> 0)) {
        return null;
    }

    return prefixLength;
}

function getMaskFromPrefixLength(prefixLength) {
    if (prefixLength === null || prefixLength === undefined) {
        return null;
    }
    const pLen = typeof prefixLength === 'string'
        ? parseInt(prefixLength.replace(/^\//, '').trim(), 10)
        : Number(prefixLength);
    if (isNaN(pLen) || pLen < 0 || pLen > 32) {
        return null;
    }
    if (pLen === 0) {
        return '0.0.0.0';
    }
    const maskInt = (0xFFFFFFFF << (32 - pLen)) >>> 0;
    return integerToIPv4(maskInt);
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

    const draft = getInspectorDraft(device);
    const isValid = getInspectorValidity(device, draft);
    const applyButton = panel.querySelector('#applyDeviceConfig');
    if (applyButton) {
        applyButton.disabled = !isValid;
    }

    if (device.type === 'router') {
        const ifaces = ['Gig0/0', 'Gig0/1'];
        const currentMacs = {};
        ifaces.forEach((ifName) => {
            const rawMac = getInspectorValue(device, `interfaces.${ifName}.mac`);
            currentMacs[ifName] = normalizeMacAddress(rawMac);
        });

        ifaces.forEach((ifName) => {
            ['ip', 'subnetMask', 'mac'].forEach((prop) => {
                const fieldKey = `interfaces.${ifName}.${prop}`;
                const feedback = panel.querySelector(`[data-feedback-for="${fieldKey}"]`);
                if (!feedback) {
                    return;
                }
                const val = getInspectorValue(device, fieldKey);
                let feedbackText = '';
                let feedbackClass = '';

                if (!val) {
                    feedbackText = '';
                } else if (prop === 'mac') {
                    if (!isValidMacAddress(val)) {
                        feedbackText = '✗ Invalid MAC address';
                        feedbackClass = 'property-feedback--error';
                    } else {
                        const norm = normalizeMacAddress(val);
                        const otherIfName = ifName === 'Gig0/0' ? 'Gig0/1' : 'Gig0/0';
                        if (currentMacs[otherIfName] && currentMacs[otherIfName] === norm) {
                            feedbackText = `✗ MAC address already used by ${otherIfName}`;
                            feedbackClass = 'property-feedback--error';
                        } else {
                            const duplicate = findDeviceByMac(val, device.id, networkState.devices, ifName);
                            if (duplicate) {
                                const ifSuffix = duplicate.matchedInterface ? ` (${duplicate.matchedInterface})` : '';
                                feedbackText = `✗ MAC address already in use by ${duplicate.name}${ifSuffix}`;
                                feedbackClass = 'property-feedback--error';
                            } else {
                                feedbackText = '✓ Valid';
                                feedbackClass = 'property-feedback--success';
                            }
                        }
                    }
                } else if (prop === 'ip') {
                    if (isValidIPv4(val)) {
                        feedbackText = '✓ Valid';
                        feedbackClass = 'property-feedback--success';
                    } else {
                        feedbackText = '✗ Invalid IPv4 address';
                        feedbackClass = 'property-feedback--error';
                    }
                } else if (prop === 'subnetMask') {
                    if (isValidSubnetMask(val)) {
                        feedbackText = '✓ Valid';
                        feedbackClass = 'property-feedback--success';
                    } else {
                        feedbackText = '✗ Invalid subnet mask';
                        feedbackClass = 'property-feedback--error';
                    }
                }

                feedback.textContent = feedbackText;
                feedback.className = `property-feedback ${feedbackClass}`.trim();
            });
        });
        return;
    }

    const supports = getSupportedConfigFields(device);
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
        } else if (field === 'mac') {
            if (!isValidMacAddress(value)) {
                feedbackText = '✗ Invalid MAC address';
                feedbackClass = 'property-feedback--error';
            } else {
                const duplicateDevice = findDeviceByMac(value, device.id);
                if (duplicateDevice) {
                    const ifSuffix = duplicateDevice.matchedInterface ? ` (${duplicateDevice.matchedInterface})` : '';
                    feedbackText = `✗ MAC address already in use by ${duplicateDevice.name}${ifSuffix}`;
                    feedbackClass = 'property-feedback--error';
                } else {
                    feedbackText = '✓ Valid';
                    feedbackClass = 'property-feedback--success';
                }
            }
        } else {
            const valid = field === 'ip'
                ? isValidIPv4(value)
                : field === 'subnetMask'
                    ? isValidSubnetMask(value)
                    : isValidIPv4(value);

            if (valid) {
                feedbackText = '✓ Valid';
                feedbackClass = 'property-feedback--success';
            } else {
                feedbackText = field === 'ip'
                    ? '✗ Invalid IPv4 address'
                    : field === 'subnetMask'
                        ? '✗ Invalid subnet mask'
                        : '✗ Invalid gateway';
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

    if (device.type === 'router') {
        const nextName = String(draft.name ?? device.name ?? '').trim() || device.name;
        const ifaces = ['Gig0/0', 'Gig0/1'];
        const nextInterfaces = {};
        ifaces.forEach((ifName) => {
            const cur = device.interfaces?.[ifName] || { name: ifName, ip: '', subnetMask: '', mac: '', status: 'up' };
            const ipKey = `interfaces.${ifName}.ip`;
            const maskKey = `interfaces.${ifName}.subnetMask`;
            const macKey = `interfaces.${ifName}.mac`;
            const rawIp = Object.prototype.hasOwnProperty.call(draft, ipKey) ? draft[ipKey] : cur.ip;
            const rawMask = Object.prototype.hasOwnProperty.call(draft, maskKey) ? draft[maskKey] : cur.subnetMask;
            const rawMac = Object.prototype.hasOwnProperty.call(draft, macKey) ? draft[macKey] : cur.mac;
            nextInterfaces[ifName] = {
                name: ifName,
                ip: String(rawIp || '').trim(),
                subnetMask: normalizeSubnetMask(String(rawMask || '').trim()) || '',
                mac: normalizeMacAddress(String(rawMac || '').trim()) || '',
                status: cur.status || 'up'
            };
        });

        const hasChanges = device.name !== nextName
            || JSON.stringify(device.interfaces) !== JSON.stringify(nextInterfaces);

        if (!hasChanges) {
            delete inspectorDrafts[device.id];
            render();
            return;
        }

        pushHistory();
        ifaces.forEach((ifName) => {
            const oldIface = device.interfaces?.[ifName];
            const newIface = nextInterfaces[ifName];
            if (oldIface && newIface) {
                if (oldIface.ip && oldIface.ip !== newIface.ip) {
                    removeArpEntriesForIp(oldIface.ip);
                }
                if (oldIface.mac && normalizeMacAddress(oldIface.mac) !== normalizeMacAddress(newIface.mac)) {
                    removeArpEntriesForMac(oldIface.mac);
                }
            }
        });
        device.name = nextName;
        device.interfaces = nextInterfaces;
        delete inspectorDrafts[device.id];

        updateStatus(`${device.name} configuration updated.`);
        render();
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
    const oldIp = device.ip;
    const oldMac = device.mac;
    if (oldIp && oldIp !== nextState.ip) {
        removeArpEntriesForIp(oldIp);
    }
    if (oldMac && normalizeMacAddress(oldMac) !== normalizeMacAddress(nextState.mac)) {
        removeArpEntriesForMac(oldMac);
    }
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

function getAllDeviceMacEntries(existingDevices = networkState.devices) {
    const entries = [];
    existingDevices.forEach((device) => {
        if (!device) {
            return;
        }
        if (device.type === 'router' && device.interfaces) {
            Object.entries(device.interfaces).forEach(([ifName, ifObj]) => {
                if (ifObj && ifObj.mac) {
                    const normalized = normalizeMacAddress(ifObj.mac);
                    if (normalized) {
                        entries.push({
                            mac: normalized,
                            deviceId: device.id,
                            deviceName: device.name,
                            interfaceName: ifName
                        });
                    }
                }
            });
        } else if (device.mac) {
            const normalized = normalizeMacAddress(device.mac);
            if (normalized) {
                entries.push({
                    mac: normalized,
                    deviceId: device.id,
                    deviceName: device.name,
                    interfaceName: null
                });
            }
        }
    });
    return entries;
}

function findDeviceByMac(mac, excludeDeviceId = null, existingDevices = networkState.devices, excludeInterface = null) {
    const normalized = normalizeMacAddress(mac);
    if (!normalized) {
        return null;
    }
    const entries = getAllDeviceMacEntries(existingDevices);
    const match = entries.find((entry) => {
        if (excludeDeviceId && entry.deviceId === excludeDeviceId) {
            if (excludeInterface !== null && excludeInterface !== undefined) {
                return entry.interfaceName !== excludeInterface && entry.mac === normalized;
            }
            return false;
        }
        return entry.mac === normalized;
    });
    if (!match) {
        return null;
    }
    const targetDev = existingDevices.find((d) => d.id === match.deviceId) || getDeviceById(match.deviceId);
    return {
        ...(targetDev || { id: match.deviceId, name: match.deviceName }),
        matchedInterface: match.interfaceName
    };
}

function isMacAddressInUse(mac, excludeDeviceId = null, existingDevices = networkState.devices, excludeInterface = null) {
    return Boolean(findDeviceByMac(mac, excludeDeviceId, existingDevices, excludeInterface));
}

function generateMacAddress(existingDevices = networkState.devices) {
    const prefix = '02:4A:7B:10:00:';
    let counter = 1;
    const assignedMacs = new Set(getAllDeviceMacEntries(existingDevices).map((e) => e.mac));

    while (true) {
        const octet = counter.toString(16).padStart(2, '0').toUpperCase();
        const candidate = `${prefix}${octet}`;
        const normalized = normalizeMacAddress(candidate);
        if (normalized && !assignedMacs.has(normalized)) {
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

let staticRouteCounter = 0;

function getRouterRuntime(routerId) {
    if (!networkState.routerRuntime) {
        networkState.routerRuntime = {};
    }
    if (!networkState.routerRuntime[routerId]) {
        networkState.routerRuntime[routerId] = {
            ports: {},
            staticRoutes: []
        };
    }
    if (!Array.isArray(networkState.routerRuntime[routerId].staticRoutes)) {
        networkState.routerRuntime[routerId].staticRoutes = [];
    }
    return networkState.routerRuntime[routerId];
}

function addStaticRoute(routerId, routeData) {
    if (!routeData || typeof routeData !== 'object') {
        return { success: false, reason: 'Invalid route data.' };
    }

    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const rawDest = String(routeData.network ?? routeData.destination ?? routeData.destinationNetwork ?? '').trim();
    if (!rawDest || !isValidIPv4(rawDest)) {
        return { success: false, reason: 'Invalid destination IPv4 address.' };
    }

    const rawMask = String(routeData.subnetMask ?? routeData.mask ?? '').trim();
    if (!rawMask || !isValidSubnetMask(rawMask)) {
        return { success: false, reason: 'Invalid subnet mask.' };
    }

    const normalizedMask = normalizeSubnetMask(rawMask);
    if (!normalizedMask) {
        return { success: false, reason: 'Invalid subnet mask.' };
    }

    const network = calculateNetworkAddress(rawDest, normalizedMask);
    const prefixLength = getPrefixLengthFromMask(normalizedMask);
    if (!network || prefixLength === null) {
        return { success: false, reason: 'Could not calculate destination network.' };
    }

    const rawNextHop = typeof routeData.nextHop === 'string' ? routeData.nextHop.trim() : '';
    const rawInterface = typeof routeData.interface === 'string' ? routeData.interface.trim() : '';

    if (!rawNextHop && !rawInterface) {
        return { success: false, reason: 'Either next-hop IP or egress interface must be specified.' };
    }

    if (rawInterface) {
        const iface = router.interfaces?.[rawInterface];
        if (!iface) {
            return { success: false, reason: `Interface ${rawInterface} does not exist on router ${router.name}.` };
        }
        if (iface.status === 'down') {
            return { success: false, reason: `Interface ${rawInterface} is down.` };
        }
    }

    let resolvedInterface = rawInterface || null;

    if (rawNextHop) {
        if (!isValidIPv4(rawNextHop)) {
            return { success: false, reason: 'Invalid next-hop IPv4 address.' };
        }

        let reachableInterface = null;
        Object.entries(router.interfaces || {}).forEach(([ifName, iface]) => {
            if (!iface || iface.status === 'down' || !iface.ip || !iface.subnetMask) {
                return;
            }
            const ifMask = normalizeSubnetMask(iface.subnetMask);
            if (ifMask && isSameSubnet(iface.ip, rawNextHop, ifMask)) {
                reachableInterface = ifName;
            }
        });

        if (!reachableInterface) {
            return { success: false, reason: `Next-hop IP ${rawNextHop} is unreachable (not on any connected subnet).` };
        }

        if (rawInterface && rawInterface !== reachableInterface) {
            return { success: false, reason: `Next-hop IP ${rawNextHop} is reachable via ${reachableInterface}, not ${rawInterface}.` };
        }

        if (!resolvedInterface) {
            resolvedInterface = reachableInterface;
        }
    }

    // Administrative Distance validation: default 1, range 1-255 integer
    let adminDistance = 1;
    if (routeData.adminDistance !== undefined) {
        const rawAd = Number(routeData.adminDistance);
        if (routeData.adminDistance === null || routeData.adminDistance === '' || !Number.isInteger(rawAd) || rawAd < 1 || rawAd > 255) {
            return { success: false, reason: 'Administrative Distance must be an integer between 1 and 255.' };
        }
        adminDistance = rawAd;
    }

    const runtime = getRouterRuntime(router.id);
    const nextHopVal = rawNextHop || null;

    const isDuplicate = runtime.staticRoutes.some((r) => {
        return r.network === network
            && r.prefixLength === prefixLength
            && (r.nextHop || null) === nextHopVal
            && (r.interface || null) === (resolvedInterface || null)
            && (r.adminDistance ?? 1) === adminDistance;
    });

    if (isDuplicate) {
        return { success: false, reason: 'An identical static route already exists.' };
    }

    staticRouteCounter += 1;
    const routeId = routeData.id || `static-route-${router.id}-${Date.now()}-${staticRouteCounter}`;
    const metric = typeof routeData.metric === 'number' && !isNaN(routeData.metric) ? routeData.metric : 1;

    const staticRoute = {
        id: routeId,
        type: 'static',
        code: 'S',
        network,
        subnetMask: normalizedMask,
        prefixLength,
        cidr: `${network}/${prefixLength}`,
        nextHop: nextHopVal,
        interface: resolvedInterface,
        adminDistance,
        metric,
        status: 'active'
    };

    runtime.staticRoutes.push(staticRoute);
    return { success: true, route: staticRoute };
}

function removeStaticRoute(routerId, routeId) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const idToMatch = typeof routeId === 'object' && routeId?.id ? routeId.id : String(routeId || '');
    if (!idToMatch) {
        return { success: false, reason: 'Route ID is required.' };
    }

    const runtime = getRouterRuntime(router.id);
    const index = runtime.staticRoutes.findIndex((r) => r.id === idToMatch);
    if (index === -1) {
        return { success: false, reason: 'Static route not found.' };
    }

    const removed = runtime.staticRoutes.splice(index, 1)[0];
    return { success: true, removedRoute: removed };
}

function toggleRouterInterfaceStatus(routerId, ifName) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router' || !router.interfaces?.[ifName]) {
        return { success: false, reason: 'Interface not found.' };
    }

    const iface = router.interfaces[ifName];
    const newStatus = iface.status === 'down' ? 'up' : 'down';

    pushHistory();
    iface.status = newStatus;

    updateStatus(`${router.name} interface ${ifName} is now ${newStatus.toUpperCase()}.`);
    render();
    return { success: true, status: newStatus };
}

function getRouterRoutingTable(routerId) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router' || !router.interfaces) {
        return [];
    }

    const connectedRoutes = [];
    Object.entries(router.interfaces).forEach(([ifName, iface]) => {
        if (!iface || iface.status === 'down') {
            return;
        }

        const ip = String(iface.ip || '').trim();
        const subnetMask = String(iface.subnetMask || '').trim();

        if (!ip || !subnetMask || !isValidIPv4(ip)) {
            return;
        }

        const normalizedMask = normalizeSubnetMask(subnetMask);
        if (!normalizedMask) {
            return;
        }

        const network = calculateNetworkAddress(ip, normalizedMask);
        const prefixLength = getPrefixLengthFromMask(normalizedMask);

        if (!network || prefixLength === null) {
            return;
        }

        connectedRoutes.push({
            type: 'connected',
            code: 'C',
            network,
            subnetMask: normalizedMask,
            prefixLength,
            cidr: `${network}/${prefixLength}`,
            interface: ifName,
            nextHop: null,
            adminDistance: 0,
            metric: 0,
            status: 'active'
        });
    });

    const runtime = getRouterRuntime(router.id);
    const configuredStaticRoutes = Array.isArray(runtime.staticRoutes) ? runtime.staticRoutes : [];

    const operationalStaticRoutes = configuredStaticRoutes.map((route) => {
        let operationalStatus = route.status || 'active';

        // Check if egress interface is administratively down
        if (route.interface) {
            const iface = router.interfaces?.[route.interface];
            if (!iface || iface.status === 'down') {
                operationalStatus = 'down';
            }
        }

        // If route specifies a next-hop IP, verify reachable via an active (UP) interface
        if (route.nextHop && operationalStatus !== 'down') {
            let nextHopReachable = false;
            Object.entries(router.interfaces || {}).forEach(([ifName, iface]) => {
                if (!iface || iface.status === 'down' || !iface.ip || !iface.subnetMask) {
                    return;
                }
                const ifMask = normalizeSubnetMask(iface.subnetMask);
                if (ifMask && isSameSubnet(iface.ip, route.nextHop, ifMask)) {
                    if (!route.interface || route.interface === ifName) {
                        nextHopReachable = true;
                    }
                }
            });
            if (!nextHopReachable) {
                operationalStatus = 'down';
            }
        }

        return {
            ...route,
            adminDistance: typeof route.adminDistance === 'number' ? route.adminDistance : 1,
            status: operationalStatus
        };
    });

    return [...connectedRoutes, ...operationalStaticRoutes];
}

/**
 * Route sorting comparison function for Longest Prefix Match (LPM):
 * 1. Longest Prefix Match: Higher prefixLength takes precedence (/24 beats /16, /16 beats /8, /8 beats /0).
 * 2. Administrative Distance: Lower administrative distance takes precedence on equal prefix length (Connected: 0, Static: 1, Backup: 10, etc.).
 * 3. Metric: Lower metric takes precedence on equal prefix length and AD.
 * 4. Deterministic Tie-breaking: Lexicographical comparison of route ID on identical prefix length, AD, and metric.
 */
function compareRoutesForLpm(a, b) {
    // 1. Longest prefix length wins
    if (b.prefixLength !== a.prefixLength) {
        return b.prefixLength - a.prefixLength;
    }

    // 2. Lower Administrative Distance wins
    const adA = typeof a.adminDistance === 'number' ? a.adminDistance : (a.code === 'C' ? 0 : 1);
    const adB = typeof b.adminDistance === 'number' ? b.adminDistance : (b.code === 'C' ? 0 : 1);
    if (adA !== adB) {
        return adA - adB;
    }

    // 3. Lower metric wins
    const metricA = typeof a.metric === 'number' ? a.metric : 0;
    const metricB = typeof b.metric === 'number' ? b.metric : 0;
    if (metricA !== metricB) {
        return metricA - metricB;
    }

    // 4. Deterministic ID ordering
    const idA = String(a.id || a.cidr || '');
    const idB = String(b.id || b.cidr || '');
    return idA.localeCompare(idB);
}

function lookupRoute(routerId, destinationIp) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'ROUTER_NOT_FOUND' };
    }

    const rawDest = typeof destinationIp === 'string' ? destinationIp.trim() : '';
    if (!rawDest || !isValidIPv4(rawDest)) {
        return { success: false, reason: 'INVALID_DESTINATION' };
    }

    const routingTable = getRouterRoutingTable(router.id);
    if (!routingTable || routingTable.length === 0) {
        return { success: false, reason: 'NO_ROUTE' };
    }

    const matchingRoutes = routingTable.filter((route) => {
        if (!route || route.status === 'down') {
            return false;
        }
        if (route.prefixLength === 0) {
            return true;
        }
        const calcNet = calculateNetworkAddress(rawDest, route.subnetMask);
        return calcNet === route.network;
    });

    if (matchingRoutes.length === 0) {
        const hasDownMatch = routingTable.some((route) => {
            if (!route || route.status !== 'down') return false;
            if (route.prefixLength === 0) return true;
            return calculateNetworkAddress(rawDest, route.subnetMask) === route.network;
        });
        return { success: false, reason: hasDownMatch ? 'INTERFACE_DOWN' : 'NO_ROUTE' };
    }

    matchingRoutes.sort(compareRoutesForLpm);
    const bestRoute = matchingRoutes[0];

    return {
        success: true,
        route: bestRoute
    };
}

function resolveRouteNextHop(routerId, route, destinationIp) {
    if (!route || typeof route !== 'object') {
        return {
            success: false,
            reason: 'NO_ROUTE',
            egressInterface: null,
            nextHopIp: null,
            isDirect: false
        };
    }

    const destIp = typeof destinationIp === 'string' ? destinationIp.trim() : '';

    if (route.code === 'C' || route.type === 'connected') {
        return {
            success: true,
            egressInterface: route.interface || null,
            nextHopIp: destIp,
            isDirect: true,
            route
        };
    }

    if (route.code === 'S' || route.type === 'static') {
        if (route.nextHop) {
            return {
                success: true,
                egressInterface: route.interface || null,
                nextHopIp: route.nextHop,
                isDirect: false,
                route
            };
        }

        return {
            success: true,
            egressInterface: route.interface || null,
            nextHopIp: destIp,
            isDirect: true,
            route
        };
    }

    return {
        success: true,
        egressInterface: route.interface || null,
        nextHopIp: route.nextHop || destIp,
        isDirect: !route.nextHop,
        route
    };
}

function getRouterPortLabel(routerId, connectionId) {
    const runtime = getRouterRuntime(routerId);
    if (runtime.ports[connectionId]) {
        return runtime.ports[connectionId];
    }

    const existingPorts = new Set(Object.values(runtime.ports));
    const availablePorts = ['Gig0/0', 'Gig0/1'];
    for (const port of availablePorts) {
        if (!existingPorts.has(port)) {
            runtime.ports[connectionId] = port;
            return port;
        }
    }

    return null;
}

function getPortForRouterAndNeighbor(routerId, neighborId) {
    const connection = getConnectionBetween(routerId, neighborId);
    if (!connection) {
        return null;
    }
    return getRouterPortLabel(routerId, connection.id);
}

function getRouterAvailablePortCount(routerId) {
    const runtime = getRouterRuntime(routerId);
    const usedPorts = Object.keys(runtime.ports).length;
    return Math.max(0, 2 - usedPorts);
}

function assignPortsForConnection(connection) {
    const sourceDevice = getDeviceById(connection.source);
    const targetDevice = getDeviceById(connection.target);
    if (sourceDevice?.type === 'switch') {
        getSwitchPortLabel(sourceDevice.id, connection.id);
    } else if (sourceDevice?.type === 'router') {
        getRouterPortLabel(sourceDevice.id, connection.id);
    }
    if (targetDevice?.type === 'switch') {
        getSwitchPortLabel(targetDevice.id, connection.id);
    } else if (targetDevice?.type === 'router') {
        getRouterPortLabel(targetDevice.id, connection.id);
    }
}

function releasePortAssignmentsForConnection(connectionId) {
    Object.values(networkState.switchRuntime).forEach((runtime) => {
        if (Object.prototype.hasOwnProperty.call(runtime.ports, connectionId)) {
            delete runtime.ports[connectionId];
        }
    });
    if (networkState.routerRuntime) {
        Object.values(networkState.routerRuntime).forEach((runtime) => {
            if (Object.prototype.hasOwnProperty.call(runtime.ports, connectionId)) {
                delete runtime.ports[connectionId];
            }
        });
    }
}

const DEFAULT_SWITCH_MAC_AGING_SECONDS = 300;

function isMacEntryExpired(entry, agingTimeSeconds = DEFAULT_SWITCH_MAC_AGING_SECONDS, now = Date.now()) {
    if (!entry || typeof entry !== 'object' || !entry.learnedAt) {
        return false;
    }
    if (typeof agingTimeSeconds !== 'number' || agingTimeSeconds <= 0 || !Number.isFinite(agingTimeSeconds)) {
        return false;
    }
    const learnedTime = new Date(entry.learnedAt).getTime();
    if (Number.isNaN(learnedTime)) {
        return false;
    }
    const currentTime = typeof now === 'number' ? now : (now instanceof Date ? now.getTime() : Date.now());
    const ageMs = currentTime - learnedTime;
    return ageMs >= (agingTimeSeconds * 1000);
}

function ageSwitchMacTable(switchId, agingTimeSeconds = DEFAULT_SWITCH_MAC_AGING_SECONDS, now = Date.now()) {
    if (!networkState.switchRuntime || !networkState.switchRuntime[switchId]) {
        return 0;
    }
    const runtime = networkState.switchRuntime[switchId];
    if (!Array.isArray(runtime.macTable) || runtime.macTable.length === 0) {
        return 0;
    }
    if (typeof agingTimeSeconds !== 'number' || agingTimeSeconds <= 0 || !Number.isFinite(agingTimeSeconds)) {
        return 0;
    }

    const initialCount = runtime.macTable.length;
    runtime.macTable = runtime.macTable.filter((entry) => !isMacEntryExpired(entry, agingTimeSeconds, now));
    return initialCount - runtime.macTable.length;
}

function ageSwitchMacTables(agingTimeSeconds = DEFAULT_SWITCH_MAC_AGING_SECONDS, now = Date.now()) {
    if (!networkState.switchRuntime) {
        return 0;
    }
    let totalRemoved = 0;
    for (const switchId of Object.keys(networkState.switchRuntime)) {
        totalRemoved += ageSwitchMacTable(switchId, agingTimeSeconds, now);
    }
    return totalRemoved;
}

function removeSwitchMacEntriesForDevice(deviceId) {
    if (!networkState.switchRuntime || !deviceId) {
        return 0;
    }

    const device = getDeviceById(deviceId);
    const targetMacs = new Set();
    if (device) {
        if (device.type === 'router' && device.interfaces) {
            Object.values(device.interfaces).forEach((iface) => {
                if (iface && iface.mac) {
                    const norm = normalizeMacAddress(iface.mac);
                    if (norm) targetMacs.add(norm);
                }
            });
        } else if (device.mac) {
            const norm = normalizeMacAddress(device.mac);
            if (norm) targetMacs.add(norm);
        }
    }

    let removedCount = 0;
    Object.keys(networkState.switchRuntime).forEach((switchId) => {
        const runtime = networkState.switchRuntime[switchId];
        if (runtime && Array.isArray(runtime.macTable)) {
            const before = runtime.macTable.length;
            runtime.macTable = runtime.macTable.filter((entry) => {
                const matchesDeviceId = entry.deviceId === deviceId;
                const matchesMac = targetMacs.has(entry.mac);
                return !matchesDeviceId && !matchesMac;
            });
            removedCount += (before - runtime.macTable.length);
        }
    });

    return removedCount;
}

function removeSwitchMacEntriesForConnection(connectionId) {
    if (!networkState.switchRuntime || !connectionId) {
        return 0;
    }

    let removedCount = 0;
    Object.keys(networkState.switchRuntime).forEach((switchId) => {
        const runtime = networkState.switchRuntime[switchId];
        if (runtime && runtime.ports && Object.prototype.hasOwnProperty.call(runtime.ports, connectionId)) {
            const portLabel = runtime.ports[connectionId];
            if (portLabel && Array.isArray(runtime.macTable)) {
                const before = runtime.macTable.length;
                runtime.macTable = runtime.macTable.filter((entry) => entry.port !== portLabel);
                removedCount += (before - runtime.macTable.length);
            }
        }
    });

    return removedCount;
}

function isSwitchMacEntryValid(switchId, entry) {
    if (!entry || !entry.mac || !entry.port) {
        return false;
    }
    const runtime = networkState.switchRuntime?.[switchId];
    if (!runtime || !runtime.ports) {
        return false;
    }

    // 1. Device exists and MAC belongs to an existing device
    const device = findDeviceByMac(entry.mac) || (entry.deviceId ? getDeviceById(entry.deviceId) : null);
    if (!device) {
        return false;
    }

    // 2. Validate MAC belongs to that device
    if (device.type === 'router' && device.interfaces) {
        const hasMac = Object.values(device.interfaces).some((iface) => iface && normalizeMacAddress(iface.mac) === entry.mac);
        if (!hasMac) return false;
    } else if (device.mac) {
        if (normalizeMacAddress(device.mac) !== entry.mac) return false;
    }

    // 3. The recorded switch port exists in runtime.ports
    const connectionId = Object.keys(runtime.ports).find((cId) => runtime.ports[cId] === entry.port);
    if (!connectionId) {
        return false;
    }

    // 4. The connection still exists in networkState.connections
    const connection = getConnectionById(connectionId);
    if (!connection) {
        return false;
    }

    // 5. The connection is still attached to this switch
    if (connection.source !== switchId && connection.target !== switchId) {
        return false;
    }

    return true;
}

function cleanupStaleSwitchMacEntries(switchId) {
    if (!networkState.switchRuntime || !networkState.switchRuntime[switchId]) {
        return 0;
    }
    const runtime = networkState.switchRuntime[switchId];
    if (!Array.isArray(runtime.macTable) || runtime.macTable.length === 0) {
        return 0;
    }

    const initialCount = runtime.macTable.length;
    runtime.macTable = runtime.macTable.filter((entry) => isSwitchMacEntryValid(switchId, entry));
    return initialCount - runtime.macTable.length;
}

function cleanupAllStaleSwitchMacEntries() {
    if (!networkState.switchRuntime) {
        return 0;
    }
    let totalRemoved = 0;
    for (const switchId of Object.keys(networkState.switchRuntime)) {
        totalRemoved += cleanupStaleSwitchMacEntries(switchId);
    }
    return totalRemoved;
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

function getArpRuntime(deviceId) {
    if (!networkState.arpRuntime) {
        networkState.arpRuntime = {};
    }
    if (!networkState.arpRuntime[deviceId]) {
        networkState.arpRuntime[deviceId] = {
            arpTable: []
        };
    }
    return networkState.arpRuntime[deviceId];
}

function getArpTable(deviceId) {
    const runtime = getArpRuntime(deviceId);
    return runtime.arpTable;
}

function lookupArp(deviceId, ip) {
    if (!ip) {
        return null;
    }
    const table = getArpTable(deviceId);
    const entry = table.find((item) => item.ip === ip);
    return entry ? entry.mac : null;
}

function learnArp(deviceId, ip, mac, options = {}) {
    if (!ip || !mac) {
        return null;
    }
    const runtime = getArpRuntime(deviceId);
    const normalizedMac = normalizeMacAddress(mac) || mac;
    const existing = runtime.arpTable.find((entry) => entry.ip === ip);
    if (existing) {
        existing.mac = normalizedMac;
        if (options.interface) {
            existing.interface = options.interface;
        }
        existing.learnedAt = new Date().toISOString();
        return existing;
    }

    const entry = {
        ip,
        mac: normalizedMac,
        interface: options.interface || null,
        type: options.type || 'dynamic',
        learnedAt: new Date().toISOString()
    };
    runtime.arpTable.push(entry);
    return entry;
}

function clearArpTable(deviceId) {
    if (!deviceId) {
        networkState.arpRuntime = {};
        return;
    }
    const runtime = getArpRuntime(deviceId);
    runtime.arpTable = [];
}

function removeArpEntriesMatching(predicate) {
    if (!networkState.arpRuntime || typeof predicate !== 'function') {
        return 0;
    }

    let removedCount = 0;
    Object.keys(networkState.arpRuntime).forEach((deviceId) => {
        const runtime = networkState.arpRuntime[deviceId];
        if (runtime && Array.isArray(runtime.arpTable)) {
            const before = runtime.arpTable.length;
            runtime.arpTable = runtime.arpTable.filter((entry) => !predicate(entry, deviceId));
            removedCount += (before - runtime.arpTable.length);
        }
    });

    return removedCount;
}

function removeArpEntriesForDevice(deviceId) {
    if (!deviceId) return 0;
    const device = getDeviceById(deviceId);
    if (!device) return 0;

    const targetIps = new Set();
    const targetMacs = new Set();

    if (device.type === 'router' && device.interfaces) {
        Object.values(device.interfaces).forEach((iface) => {
            if (iface) {
                if (iface.ip) targetIps.add(iface.ip);
                if (iface.mac) targetMacs.add(normalizeMacAddress(iface.mac));
            }
        });
    } else {
        if (device.ip) targetIps.add(device.ip);
        if (device.mac) targetMacs.add(normalizeMacAddress(device.mac));
    }

    return removeArpEntriesMatching((entry, ownerDeviceId) => {
        if (ownerDeviceId === deviceId) return false;
        const normMac = normalizeMacAddress(entry.mac);
        return targetIps.has(entry.ip) || targetMacs.has(normMac);
    });
}

function removeArpEntriesForIp(ip) {
    if (!ip) return 0;
    return removeArpEntriesMatching((entry) => entry.ip === ip);
}

function removeArpEntriesForMac(mac) {
    if (!mac) return 0;
    const norm = normalizeMacAddress(mac);
    return removeArpEntriesMatching((entry) => normalizeMacAddress(entry.mac) === norm);
}

function resolveNextHopIp(sourceDevice, destinationDevice) {
    if (!sourceDevice || !destinationDevice) {
        return null;
    }

    if (!isValidIPv4(sourceDevice.ip) || !isValidIPv4(destinationDevice.ip)) {
        return null;
    }

    const normalizedMaskA = normalizeSubnetMask(sourceDevice.subnetMask);
    const normalizedMaskB = normalizeSubnetMask(destinationDevice.subnetMask);

    if (!normalizedMaskA || !normalizedMaskB) {
        return null;
    }

    const sameSubnet = normalizedMaskA === normalizedMaskB
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskA)
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskB);

    if (sameSubnet) {
        return destinationDevice.ip;
    }

    const rawGateway = typeof sourceDevice.gateway === 'string' ? sourceDevice.gateway.trim() : '';
    if (!rawGateway || !isValidIPv4(rawGateway)) {
        return null;
    }

    return rawGateway;
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

const ICMP_ERROR_DEFINITIONS = {
    TIME_EXCEEDED: {
        type: 11,
        typeName: 'TIME_EXCEEDED',
        codes: {
            0: {
                code: 0,
                codeName: 'TTL_EXPIRED_IN_TRANSIT',
                description: 'Time to Live (TTL) expired in transit'
            }
        }
    },
    DESTINATION_UNREACHABLE: {
        type: 3,
        typeName: 'DESTINATION_UNREACHABLE',
        codes: {
            0: {
                code: 0,
                codeName: 'NET_UNREACHABLE',
                description: 'Destination network unreachable'
            },
            1: {
                code: 1,
                codeName: 'HOST_UNREACHABLE',
                description: 'Destination host unreachable'
            }
        }
    }
};

function isIcmpPacket(packet) {
    if (!packet || typeof packet !== 'object') {
        return false;
    }
    return packet.protocol === 'ICMP' || Boolean(packet.icmp);
}

function isIcmpErrorPacket(packet) {
    if (!packet || typeof packet !== 'object' || !packet.icmp) {
        return false;
    }
    if (packet.icmp.isError === true) {
        return true;
    }
    const type = packet.icmp.type;
    const typeStr = String(type).toUpperCase();
    return type === 3 || type === 11 || typeStr === 'DESTINATION_UNREACHABLE' || typeStr === 'TIME_EXCEEDED';
}

function isIcmpEchoPacket(packet) {
    if (!packet || typeof packet !== 'object' || !packet.icmp) {
        return false;
    }
    const type = packet.icmp.type;
    const typeStr = String(type).toUpperCase();
    return type === 0 || type === 8 || typeStr === 'ECHO_REQUEST' || typeStr === 'ECHO_REPLY';
}

function createIcmpErrorPacket(errorType, errorCode, originalPacket, generatingDevice = null, options = {}) {
    if (!originalPacket || typeof originalPacket !== 'object') {
        return null;
    }

    // RFC 792 Rule: Never generate an ICMP error in response to an ICMP error packet
    if (isIcmpErrorPacket(originalPacket)) {
        return null;
    }

    const typeKey = (typeof errorType === 'number' && errorType === 11) || String(errorType).toUpperCase() === 'TIME_EXCEEDED'
        ? 'TIME_EXCEEDED'
        : (typeof errorType === 'number' && errorType === 3) || String(errorType).toUpperCase() === 'DESTINATION_UNREACHABLE'
            ? 'DESTINATION_UNREACHABLE'
            : null;

    if (!typeKey || !ICMP_ERROR_DEFINITIONS[typeKey]) {
        return null;
    }

    const typeDef = ICMP_ERROR_DEFINITIONS[typeKey];
    const codeNum = typeof errorCode === 'number' ? errorCode : (parseInt(errorCode, 10) || 0);
    const codeDef = typeDef.codes[codeNum] || {
        code: codeNum,
        codeName: 'UNKNOWN',
        description: 'ICMP Error'
    };

    let routerIp = options.routerIp || null;
    if (!routerIp && generatingDevice) {
        if (options.ingressInterface && generatingDevice.interfaces?.[options.ingressInterface]?.ip) {
            routerIp = generatingDevice.interfaces[options.ingressInterface].ip;
        } else if (generatingDevice.interfaces) {
            for (const iface of Object.values(generatingDevice.interfaces)) {
                if (iface?.status === 'up' && iface.ip) {
                    routerIp = iface.ip;
                    break;
                }
            }
        } else if (generatingDevice.ip) {
            routerIp = generatingDevice.ip;
        }
    }

    const routerInfo = generatingDevice ? {
        id: generatingDevice.id,
        name: generatingDevice.name,
        ip: routerIp,
        ingressInterface: options.ingressInterface || null,
        egressInterface: options.egressInterface || null
    } : (options.router || null);

    const origSnapshot = {
        sourceIp: originalPacket.sourceIp || null,
        destinationIp: originalPacket.destinationIp || null,
        protocol: originalPacket.protocol || (originalPacket.icmp ? 'ICMP' : 'IPv4'),
        ttl: typeof originalPacket.ttl === 'number' ? originalPacket.ttl : null
    };

    if (originalPacket.icmp) {
        origSnapshot.icmp = {
            type: originalPacket.icmp.type,
            code: typeof originalPacket.icmp.code === 'number' ? originalPacket.icmp.code : 0,
            identifier: originalPacket.icmp.identifier,
            sequence: originalPacket.icmp.sequence
        };
    }

    return {
        sourceIp: routerIp,
        destinationIp: originalPacket.sourceIp || null,
        protocol: 'ICMP',
        ttl: typeof options.ttl === 'number' ? options.ttl : 64,
        icmp: {
            type: typeDef.type,
            code: codeDef.code,
            typeName: typeDef.typeName,
            codeName: codeDef.codeName,
            description: codeDef.description,
            isError: true,
            reason: options.reason || codeDef.codeName.toLowerCase().replace(/_/g, '-'),
            router: routerInfo,
            originalPacket: origSnapshot
        }
    };
}

function simulatePathTransmission(frame, fromEndpoint, toEndpoint, topologyPath) {
    const traversedPath = [topologyPath[0]];
    const hopActions = [];

    for (let i = 0; i < topologyPath.length - 1; i += 1) {
        const fromId = topologyPath[i];
        const toId = topologyPath[i + 1];
        const fromDevice = getDeviceById(fromId);
        const toDevice = getDeviceById(toId);

        if (!fromDevice || !toDevice) {
            frame.events.push('Topology link broken during transmission');
            return {
                success: false,
                reason: 'A device on the topology path is missing.',
                path: traversedPath,
                action: 'DROP',
                hopActions
            };
        }

        traversedPath.push(toId);

        if (toDevice.type === 'switch') {
            const agingTime = typeof frame?.agingTimeSeconds === 'number' ? frame.agingTimeSeconds : DEFAULT_SWITCH_MAC_AGING_SECONDS;
            const nowTime = typeof frame?.now === 'number' ? frame.now : (frame?.now instanceof Date ? frame.now.getTime() : Date.now());
            ageSwitchMacTable(toDevice.id, agingTime, nowTime);
            cleanupStaleSwitchMacEntries(toDevice.id);

            const ingressPort = getPortForSwitchAndNeighbor(toDevice.id, fromId);
            frame.events.push(`Frame entered ${toDevice.name} on ${ingressPort}`);

            const learnedDevice = findDeviceByMac(frame.sourceMac, null, networkState.devices);
            const learnedDeviceId = learnedDevice?.id || fromEndpoint.id;
            const learnedDeviceName = learnedDevice?.name || fromEndpoint.name;
            learnSwitchMac(toDevice.id, frame.sourceMac, learnedDeviceId, ingressPort);
            frame.events.push(`Switch ${toDevice.name} learned ${learnedDeviceName} MAC (${frame.sourceMac}) → ${ingressPort}`);

            const nextHopId = topologyPath[i + 2];
            const expectedEgressPort = nextHopId ? getPortForSwitchAndNeighbor(toDevice.id, nextHopId) : null;
            const runtime = getSwitchRuntime(toDevice.id);
            const egressPorts = Object.values(runtime.ports).filter(p => p !== ingressPort);

            const isBroadcast = frame.destinationMac === 'FF:FF:FF:FF:FF:FF';
            const destEntry = isBroadcast ? null : getSwitchMacEntry(toDevice.id, frame.destinationMac);

            if (isBroadcast) {
                frame.events.push(`Switch ${toDevice.name} flooded broadcast frame (FF:FF:FF:FF:FF:FF) on all ports except ${ingressPort}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FLOOD',
                    reason: 'broadcast',
                    ingressPort,
                    egressPorts,
                    destinationMac: frame.destinationMac
                });
            } else if (!destEntry) {
                frame.events.push(`Destination MAC (${frame.destinationMac}) unknown in MAC table`);
                frame.events.push(`Switch ${toDevice.name} flooded unknown unicast frame on all ports except ${ingressPort}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FLOOD',
                    reason: 'unknown-unicast',
                    ingressPort,
                    egressPorts,
                    destinationMac: frame.destinationMac
                });
            } else if (destEntry.port === ingressPort) {
                frame.events.push(`Destination MAC (${frame.destinationMac}) found on incoming port ${ingressPort}`);
                frame.events.push(`Switch ${toDevice.name} filtered (dropped) frame — destination is on incoming segment`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'DROP',
                    reason: 'filtered-same-port',
                    ingressPort,
                    destinationMac: frame.destinationMac
                });
                return {
                    success: false,
                    reason: `Switch ${toDevice.name} filtered frame (destination is on ingress port ${ingressPort}).`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions
                };
            } else if (expectedEgressPort && destEntry.port === expectedEgressPort) {
                frame.events.push(`Destination MAC found in MAC table → ${destEntry.port}`);
                frame.events.push(`Switch ${toDevice.name} forwarded frame through ${destEntry.port}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FORWARD',
                    reason: 'known-unicast',
                    ingressPort,
                    egressPort: destEntry.port,
                    destinationMac: frame.destinationMac
                });
            } else if (expectedEgressPort && destEntry.port !== expectedEgressPort) {
                frame.events.push(`Destination MAC mapped to ${destEntry.port} (mismatch with path to destination)`);
                frame.events.push(`Switch ${toDevice.name} forwarded frame through ${destEntry.port}; frame misdirected and dropped`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'DROP',
                    reason: 'port-mismatch',
                    ingressPort,
                    egressPort: destEntry.port,
                    expectedEgressPort,
                    destinationMac: frame.destinationMac
                });
                return {
                    success: false,
                    reason: `Switch ${toDevice.name} misdirected frame via ${destEntry.port}.`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions
                };
            } else {
                frame.events.push(`Switch ${toDevice.name} forwarded frame through ${destEntry.port}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FORWARD',
                    reason: 'known-unicast',
                    ingressPort,
                    egressPort: destEntry.port,
                    destinationMac: frame.destinationMac
                });
            }
        } else if (toDevice.type === 'router') {
            const ingressPort = getPortForRouterAndNeighbor(toDevice.id, fromId);
            const ingressIface = ingressPort ? toDevice.interfaces?.[ingressPort] : null;

            frame.events.push(`Frame received by ${toDevice.name} on ${ingressPort}`);

            const routeResult = lookupRoute(toDevice.id, frame.packet.destinationIp);
            if (!routeResult.success) {
                const isInterfaceDown = routeResult.reason === 'INTERFACE_DOWN';
                const dropReason = isInterfaceDown ? 'interface-down' : 'no-route';
                const logMsg = isInterfaceDown
                    ? `Router ${toDevice.name} dropped packet: Egress interface is down for destination ${frame.packet.destinationIp}`
                    : `Router ${toDevice.name} dropped packet: No route to destination ${frame.packet.destinationIp}`;
                const returnReason = isInterfaceDown
                    ? `Router ${toDevice.name} egress interface is down for destination ${frame.packet.destinationIp}.`
                    : `No route to destination ${frame.packet.destinationIp} at router ${toDevice.name}.`;

                const icmpError = createIcmpErrorPacket(3, isInterfaceDown ? 1 : 0, frame.packet, toDevice, {
                    ingressInterface: ingressPort,
                    reason: dropReason
                });

                frame.events.push(logMsg);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: dropReason,
                    ingressInterface: ingressPort,
                    destinationIp: frame.packet.destinationIp,
                    icmpErrorPacket: icmpError || null
                });
                return {
                    success: false,
                    reason: returnReason,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions,
                    icmpErrorPacket: icmpError || null
                };
            }

            const selectedRoute = routeResult.route;
            const nextHopInfo = resolveRouteNextHop(toDevice.id, selectedRoute, frame.packet.destinationIp);
            const egressPort = nextHopInfo.egressInterface;
            const egressIface = egressPort ? toDevice.interfaces?.[egressPort] : null;

            if (!ingressPort || !egressPort || !ingressIface || !egressIface) {
                frame.events.push(`Router ${toDevice.name} could not resolve routing interfaces`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: 'interface-error',
                    ingressInterface: ingressPort,
                    egressInterface: egressPort
                });
                return {
                    success: false,
                    reason: `Router ${toDevice.name} interface error.`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions
                };
            }

            if (egressIface.status === 'down') {
                const icmpError = createIcmpErrorPacket(3, 1, frame.packet, toDevice, {
                    ingressInterface: ingressPort,
                    egressInterface: egressPort,
                    reason: 'interface-down'
                });

                frame.events.push(`Router ${toDevice.name} egress interface ${egressPort} is down`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: 'interface-down',
                    ingressInterface: ingressPort,
                    egressInterface: egressPort,
                    icmpErrorPacket: icmpError || null
                });
                return {
                    success: false,
                    reason: `Router ${toDevice.name} egress interface ${egressPort} is down.`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions,
                    icmpErrorPacket: icmpError || null
                };
            }

            frame.packet.ttl = Math.max(0, frame.packet.ttl - 1);
            frame.events.push(`Router ${toDevice.name} decremented IP TTL to ${frame.packet.ttl}`);

            if (frame.packet.ttl <= 0) {
                const icmpError = createIcmpErrorPacket(11, 0, frame.packet, toDevice, {
                    ingressInterface: ingressPort,
                    egressInterface: egressPort,
                    reason: 'ttl-expired'
                });

                frame.events.push(`Router ${toDevice.name} dropped packet: Time to Live (TTL) expired in transit`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: 'ttl-expired',
                    ingressInterface: ingressPort,
                    egressInterface: egressPort,
                    ttl: 0,
                    icmpErrorPacket: icmpError || null
                });
                return {
                    success: false,
                    reason: `Time to Live (TTL) expired at router ${toDevice.name}.`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions,
                    icmpErrorPacket: icmpError || null
                };
            }

            frame.events.push(`Router ${toDevice.name} routed frame from ${ingressPort} to ${egressPort}`);
            frame.sourceMac = egressIface.mac;
            frame.events.push(`Router ${toDevice.name} rewrote source MAC to ${egressIface.mac}`);

            // Router egress ARP resolution
            let arpTargetIp = nextHopInfo.nextHopIp;
            const nextHopId = topologyPath[i + 2];
            if (nextHopId && nextHopInfo.isDirect) {
                const nextDevice = getDeviceById(nextHopId);
                if (nextDevice?.type === 'router' && nextDevice.interfaces) {
                    for (const [nIfName, nIface] of Object.entries(nextDevice.interfaces)) {
                        const nMask = normalizeSubnetMask(nIface.subnetMask);
                        const egMask = normalizeSubnetMask(egressIface.subnetMask);
                        if (nMask && egMask && isSameSubnet(egressIface.ip, nIface.ip, egMask)) {
                            arpTargetIp = nIface.ip;
                            break;
                        }
                    }
                }
            }

            const remainingTopology = topologyPath.slice(i + 1);
            const routerArpResult = simulateArpResolution(toDevice, arpTargetIp, remainingTopology, {
                egressInterface: egressPort
            });

            if (!routerArpResult.success) {
                const icmpError = createIcmpErrorPacket(3, 1, frame.packet, toDevice, {
                    ingressInterface: ingressPort,
                    egressInterface: egressPort,
                    reason: 'host-unreachable'
                });

                frame.events.push(...routerArpResult.events);
                return {
                    success: false,
                    reason: routerArpResult.reason,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions,
                    icmpErrorPacket: icmpError || null
                };
            }

            if (routerArpResult.events?.length) {
                frame.events.push(...routerArpResult.events);
            }

            frame.destinationMac = routerArpResult.targetMac;
            frame.events.push(`Router ${toDevice.name} set destination MAC to ${routerArpResult.targetMac}`);

            hopActions.push({
                deviceId: toDevice.id,
                deviceName: toDevice.name,
                type: 'router',
                action: 'ROUTE',
                ingressInterface: ingressPort,
                egressInterface: egressPort,
                ttl: frame.packet.ttl,
                sourceMac: egressIface.mac,
                destinationMac: frame.destinationMac,
                route: selectedRoute
            });
        }
    }

    return {
        success: true,
        reason: '',
        path: traversedPath,
        action: 'FORWARD',
        hopActions
    };
}

function simulateArpResolution(requesterDevice, targetIp, topologyPath, options = {}) {
    if (!requesterDevice || !targetIp) {
        return {
            success: false,
            reason: 'Missing requester device or target IP.',
            path: requesterDevice ? [requesterDevice.id] : [],
            events: ['Invalid ARP parameters'],
            hopActions: []
        };
    }

    if (!isValidIPv4(targetIp)) {
        return {
            success: false,
            reason: `Invalid target IP address: ${targetIp}`,
            path: [requesterDevice.id],
            events: [`Invalid target IP address: ${targetIp}`],
            hopActions: []
        };
    }

    // Determine requester IP, MAC, subnet mask, and interface
    let reqIp = requesterDevice.ip;
    let reqMac = requesterDevice.mac;
    let reqMask = normalizeSubnetMask(requesterDevice.subnetMask);
    let requesterInterfaceName = options.interface || options.egressInterface || null;

    if (requesterDevice.type === 'router') {
        if (requesterInterfaceName && requesterDevice.interfaces?.[requesterInterfaceName]) {
            const iface = requesterDevice.interfaces[requesterInterfaceName];
            reqIp = iface.ip;
            reqMac = iface.mac;
            reqMask = normalizeSubnetMask(iface.subnetMask);
        } else if (requesterDevice.interfaces) {
            for (const [ifName, iface] of Object.entries(requesterDevice.interfaces)) {
                if (iface.status === 'up' && iface.ip) {
                    const ifMask = normalizeSubnetMask(iface.subnetMask);
                    if (ifMask && isSameSubnet(iface.ip, targetIp, ifMask)) {
                        reqIp = iface.ip;
                        reqMac = iface.mac;
                        reqMask = ifMask;
                        requesterInterfaceName = ifName;
                        break;
                    }
                }
            }
        }
    }

    if (!reqIp || !reqMac || !reqMask) {
        return {
            success: false,
            reason: `Requester ${requesterDevice.name} has no valid interface configured for target IP ${targetIp}.`,
            path: [requesterDevice.id],
            events: [`${requesterDevice.name} cannot resolve ARP: no local interface matches ${targetIp}`],
            hopActions: []
        };
    }

    // 1. Check requester ARP cache first (CACHE HIT)
    const cachedMac = lookupArp(requesterDevice.id, targetIp);
    if (cachedMac) {
        return {
            success: true,
            targetIp,
            targetMac: cachedMac,
            cacheHit: true,
            path: [requesterDevice.id],
            events: [`${requesterDevice.name} ARP cache hit for ${targetIp} → ${cachedMac}`],
            requestPacket: null,
            replyPacket: null,
            hopActions: []
        };
    }

    // 2. CACHE MISS -> Simulate ARP Request / Reply
    const events = [];
    const hopActions = [];
    const isTargetOnReqSubnet = isSameSubnet(reqIp, targetIp, reqMask);

    // Build explicit ARP Request packet
    const requestPacket = {
        protocol: 'ARP',
        operation: 'REQUEST',
        senderIp: reqIp,
        senderMac: reqMac,
        targetIp: targetIp,
        targetMac: '00:00:00:00:00:00'
    };

    events.push(`${requesterDevice.name} broadcast ARP Request: Who has ${targetIp}? Tell ${reqIp}`);

    // Identify target device and responder interface on local subnet
    let targetDevice = null;
    let targetMac = null;
    let targetInterfaceName = null;

    for (const dev of (networkState.devices || [])) {
        if (dev.id === requesterDevice.id) continue;

        if (dev.type === 'router') {
            if (dev.interfaces) {
                for (const [ifName, iface] of Object.entries(dev.interfaces)) {
                    if (iface.ip === targetIp && iface.status === 'up') {
                        const ifMask = normalizeSubnetMask(iface.subnetMask);
                        if (reqMask && ifMask && isSameSubnet(reqIp, iface.ip, reqMask)) {
                            targetDevice = dev;
                            targetInterfaceName = ifName;
                            targetMac = iface.mac;
                            break;
                        }
                    }
                }
            }
            if (targetDevice) break;
        } else if (dev.ip === targetIp) {
            const devMask = normalizeSubnetMask(dev.subnetMask);
            if (reqMask && devMask && isSameSubnet(reqIp, dev.ip, reqMask)) {
                targetDevice = dev;
                targetMac = dev.mac;
                break;
            }
        }
    }

    // If target is not on the same subnet as requester or no responder device exists
    if (!isTargetOnReqSubnet || !targetDevice || !targetMac) {
        events.push(`No ARP reply received for ${targetIp} (target not on local subnet or no responder)`);
        return {
            success: false,
            reason: `ARP resolution failed: No responder for IP ${targetIp} on local subnet.`,
            path: [requesterDevice.id],
            events,
            hopActions
        };
    }

    // Determine L2 path between requester and target device
    let arpPath = null;
    if (Array.isArray(topologyPath) && topologyPath.length >= 2) {
        const reqIdx = topologyPath.indexOf(requesterDevice.id);
        const targetIdx = topologyPath.indexOf(targetDevice.id);
        if (reqIdx !== -1 && targetIdx !== -1 && reqIdx < targetIdx) {
            arpPath = topologyPath.slice(reqIdx, targetIdx + 1);
        }
    }

    if (!arpPath) {
        arpPath = findTopologyPath(requesterDevice.id, targetDevice.id);
    }

    if (!arpPath || arpPath.length < 2) {
        events.push(`ARP Request could not reach ${targetDevice.name}: no physical path`);
        return {
            success: false,
            reason: `ARP resolution failed: No physical path between ${requesterDevice.name} and ${targetDevice.name}.`,
            path: [requesterDevice.id],
            events,
            hopActions
        };
    }

    // Check if path contains an intermediate router (ARP broadcast cannot cross routers)
    for (let i = 1; i < arpPath.length - 1; i++) {
        const midDevice = getDeviceById(arpPath[i]);
        if (midDevice?.type === 'router') {
            events.push(`Router ${midDevice.name} dropped broadcast frame (does not forward broadcast across subnets)`);
            return {
                success: false,
                reason: 'ARP broadcast cannot cross router boundary.',
                path: arpPath.slice(0, i + 1),
                events,
                hopActions
            };
        }
    }

    // Traverse forward path (ARP Request Broadcast)
    for (let i = 0; i < arpPath.length - 1; i++) {
        const fromId = arpPath[i];
        const toId = arpPath[i + 1];
        const toDevice = getDeviceById(toId);

        if (!toDevice) {
            events.push('Topology link broken during ARP request');
            return {
                success: false,
                reason: 'A device on the topology path is missing.',
                path: arpPath.slice(0, i + 1),
                events,
                hopActions
            };
        }

        if (toDevice.type === 'switch') {
            const ingressPort = getPortForSwitchAndNeighbor(toDevice.id, fromId);
            learnSwitchMac(toDevice.id, reqMac, requesterDevice.id, ingressPort);
            events.push(`Switch ${toDevice.name} learned ${requesterDevice.name} MAC (${reqMac}) → ${ingressPort}`);
            events.push(`Switch ${toDevice.name} flooded broadcast frame (FF:FF:FF:FF:FF:FF) on all ports except ${ingressPort}`);
            const runtime = getSwitchRuntime(toDevice.id);
            const egressPorts = Object.values(runtime.ports).filter(p => p !== ingressPort);
            hopActions.push({
                deviceId: toDevice.id,
                deviceName: toDevice.name,
                type: 'switch',
                action: 'FLOOD',
                reason: 'broadcast',
                ingressPort,
                egressPorts,
                destinationMac: 'FF:FF:FF:FF:FF:FF'
            });
        }
    }

    // Target receives ARP Request and learns requester's IP -> MAC
    events.push(`${targetDevice.name} received ARP Request from ${requesterDevice.name}`);
    learnArp(targetDevice.id, reqIp, reqMac, {
        interface: targetInterfaceName || null
    });
    events.push(`${targetDevice.name} learned ARP entry: ${reqIp} → ${reqMac}`);

    // Build explicit ARP Reply packet
    const replyPacket = {
        protocol: 'ARP',
        operation: 'REPLY',
        senderIp: targetIp,
        senderMac: targetMac,
        targetIp: reqIp,
        targetMac: reqMac
    };

    events.push(`${targetDevice.name} sent ARP Reply: ${targetIp} is at ${targetMac}`);

    // Traverse reverse path (ARP Reply Unicast)
    const reverseArpPath = [...arpPath].reverse();
    for (let i = 0; i < reverseArpPath.length - 1; i++) {
        const fromId = reverseArpPath[i];
        const toId = reverseArpPath[i + 1];
        const toDevice = getDeviceById(toId);

        if (toDevice && toDevice.type === 'switch') {
            const ingressPort = getPortForSwitchAndNeighbor(toDevice.id, fromId);
            learnSwitchMac(toDevice.id, targetMac, targetDevice.id, ingressPort);
            events.push(`Switch ${toDevice.name} learned ${targetDevice.name} MAC (${targetMac}) → ${ingressPort}`);

            const destEntry = getSwitchMacEntry(toDevice.id, reqMac);
            if (destEntry) {
                events.push(`Switch ${toDevice.name} forwarded unicast ARP Reply to ${requesterDevice.name} on ${destEntry.port}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FORWARD',
                    reason: 'known-unicast',
                    ingressPort,
                    egressPort: destEntry.port,
                    destinationMac: reqMac
                });
            } else {
                const runtime = getSwitchRuntime(toDevice.id);
                const egressPorts = Object.values(runtime.ports).filter(p => p !== ingressPort);
                events.push(`Switch ${toDevice.name} flooded ARP Reply on all ports except ${ingressPort}`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'FLOOD',
                    reason: 'unknown-unicast',
                    ingressPort,
                    egressPorts,
                    destinationMac: reqMac
                });
            }
        }
    }

    // Requester receives ARP Reply and caches target IP -> MAC
    events.push(`${requesterDevice.name} received ARP Reply from ${targetDevice.name}`);
    learnArp(requesterDevice.id, targetIp, targetMac, {
        interface: requesterInterfaceName || null
    });
    events.push(`${requesterDevice.name} cached ARP entry: ${targetIp} → ${targetMac}`);

    return {
        success: true,
        targetIp,
        targetMac,
        cacheHit: false,
        path: arpPath,
        events,
        requestPacket,
        replyPacket,
        hopActions
    };
}

function routeIcmpErrorReturnPath(icmpErrorPacket, generatorDevice, targetDevice, forwardPath, options = {}) {
    if (!icmpErrorPacket || !generatorDevice || !targetDevice) {
        return null;
    }

    // Safety check: Never route an ICMP error for an invalid/non-error packet
    if (!isIcmpErrorPacket(icmpErrorPacket)) {
        return null;
    }

    const returnDestIp = icmpErrorPacket.destinationIp || targetDevice.ip;
    if (!returnDestIp || !isValidIPv4(returnDestIp)) {
        return {
            success: false,
            reason: `Invalid destination IP ${returnDestIp} for ICMP error return path.`,
            path: [generatorDevice.id],
            action: 'DROP',
            hopActions: []
        };
    }

    // Determine reverse topology path from generator back to target
    let returnPath = null;
    if (Array.isArray(forwardPath) && forwardPath.length >= 2) {
        returnPath = [...forwardPath].reverse();
    } else {
        returnPath = findTopologyPath(generatorDevice.id, targetDevice.id);
    }

    if (!returnPath || returnPath.length < 2) {
        return {
            success: false,
            reason: `No physical topology path from ${generatorDevice.name} to ${targetDevice.name}.`,
            path: [generatorDevice.id],
            action: 'DROP',
            hopActions: []
        };
    }

    // 1. Router route lookup toward original source IP
    const routeResult = lookupRoute(generatorDevice.id, returnDestIp);
    if (!routeResult.success) {
        const dropReason = routeResult.reason === 'INTERFACE_DOWN' ? 'interface-down' : 'no-route';
        const logMsg = `Router ${generatorDevice.name} could not route ICMP error: ${routeResult.reason} for destination ${returnDestIp}`;
        const events = options.events ? [...options.events, logMsg] : [logMsg];
        return {
            success: false,
            reason: `No return route to ${returnDestIp} at router ${generatorDevice.name}.`,
            path: [generatorDevice.id],
            action: 'DROP',
            hopActions: [{
                deviceId: generatorDevice.id,
                deviceName: generatorDevice.name,
                type: 'router',
                action: 'DROP',
                reason: dropReason,
                destinationIp: returnDestIp
            }],
            events
        };
    }

    const selectedRoute = routeResult.route;
    const nextHopInfo = resolveRouteNextHop(generatorDevice.id, selectedRoute, returnDestIp);
    const egressPort = nextHopInfo.egressInterface;
    const egressIface = egressPort ? generatorDevice.interfaces?.[egressPort] : null;

    if (!egressPort || !egressIface || egressIface.status === 'down') {
        const logMsg = `Router ${generatorDevice.name} could not route ICMP error: egress interface ${egressPort || 'unknown'} is down or unconfigured`;
        const events = options.events ? [...options.events, logMsg] : [logMsg];
        return {
            success: false,
            reason: `Egress interface ${egressPort || 'unknown'} is down on error return path.`,
            path: [generatorDevice.id],
            action: 'DROP',
            hopActions: [{
                deviceId: generatorDevice.id,
                deviceName: generatorDevice.name,
                type: 'router',
                action: 'DROP',
                reason: 'interface-down',
                ingressInterface: null,
                egressInterface: egressPort,
                destinationIp: returnDestIp
            }],
            events
        };
    }

    // 2. Next-hop ARP resolution on egress interface
    let arpTargetIp = nextHopInfo.nextHopIp;
    const nextHopId = returnPath[1];
    if (nextHopId && nextHopInfo.isDirect) {
        const nextDevice = getDeviceById(nextHopId);
        if (nextDevice?.type === 'router' && nextDevice.interfaces) {
            for (const [, nIface] of Object.entries(nextDevice.interfaces)) {
                const nMask = normalizeSubnetMask(nIface.subnetMask);
                const egMask = normalizeSubnetMask(egressIface.subnetMask);
                if (nMask && egMask && isSameSubnet(egressIface.ip, nIface.ip, egMask)) {
                    arpTargetIp = nIface.ip;
                    break;
                }
            }
        }
    }

    const arpResult = simulateArpResolution(generatorDevice, arpTargetIp, returnPath, {
        egressInterface: egressPort
    });

    if (!arpResult.success) {
        const events = options.events ? [...options.events, ...arpResult.events] : [...arpResult.events];
        return {
            success: false,
            reason: arpResult.reason,
            path: [generatorDevice.id],
            action: 'DROP',
            hopActions: [],
            events
        };
    }

    const errorTypeName = formatIcmpType(icmpErrorPacket.icmp?.type || icmpErrorPacket.icmp?.typeName);
    const initialEvents = options.events ? [...options.events] : [];
    if (arpResult.events?.length) {
        initialEvents.push(...arpResult.events);
    }
    initialEvents.push(`Router ${generatorDevice.name} sent ICMP ${errorTypeName} to ${targetDevice.name} (${returnDestIp})`);

    const initialDestMac = arpResult.targetMac;
    const errorFrame = {
        sourceDeviceId: generatorDevice.id,
        destinationDeviceId: targetDevice.id,
        sourceMac: egressIface.mac,
        destinationMac: initialDestMac,
        etherType: 'IPv4',
        packet: icmpErrorPacket,
        path: returnPath,
        events: initialEvents,
        agingTimeSeconds: options.agingTimeSeconds,
        now: options.now
    };

    const generatorHopAction = {
        deviceId: generatorDevice.id,
        deviceName: generatorDevice.name,
        type: 'router',
        action: 'ROUTE',
        ingressInterface: null,
        egressInterface: egressPort,
        ttl: icmpErrorPacket.ttl,
        sourceMac: egressIface.mac,
        destinationMac: initialDestMac,
        route: selectedRoute
    };

    // If directly connected to target (path length === 2 e.g. Router0 -> PC0)
    if (returnPath.length === 2) {
        errorFrame.events.push(`${targetDevice.name} received ICMP ${errorTypeName}`);
        return {
            success: true,
            reason: '',
            path: returnPath,
            action: 'FORWARD',
            hopActions: [generatorHopAction],
            events: errorFrame.events,
            packet: icmpErrorPacket,
            arpResult
        };
    }

    // Forward through remaining path (e.g. Router1 -> Router0 -> PC0 or Router0 -> Switch0 -> PC0)
    const forwardResult = simulatePathTransmission(errorFrame, generatorDevice, targetDevice, returnPath);
    const returnHopActions = [generatorHopAction, ...(forwardResult.hopActions || [])];

    if (forwardResult.success) {
        errorFrame.events.push(`${targetDevice.name} received ICMP ${errorTypeName}`);
    }

    return {
        success: forwardResult.success,
        reason: forwardResult.reason,
        path: forwardResult.path,
        action: forwardResult.action,
        hopActions: returnHopActions,
        events: errorFrame.events,
        packet: errorFrame.packet,
        arpResult
    };
}

function simulateSendFrame(sourceDevice, destinationDevice, options = {}) {
    const topologyPath = findTopologyPath(sourceDevice.id, destinationDevice.id);

    if (!topologyPath || topologyPath.length < 2) {
        return {
            success: false,
            reason: 'No physical topology path exists between devices.',
            path: sourceDevice ? [sourceDevice.id] : [],
            action: 'DROP',
            events: ['No topology connection between source and destination'],
            hopActions: []
        };
    }

    const normalizedMaskA = normalizeSubnetMask(sourceDevice.subnetMask);
    const normalizedMaskB = normalizeSubnetMask(destinationDevice.subnetMask);
    const sameSubnet = normalizedMaskA && normalizedMaskB && normalizedMaskA === normalizedMaskB
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskA)
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskB);

    if (!sameSubnet) {
        if (!sourceDevice.gateway || !isValidIPv4(sourceDevice.gateway)) {
            return {
                success: false,
                reason: `Source device ${sourceDevice.name} has no default gateway configured.`,
                path: [topologyPath[0]],
                action: 'DROP',
                events: [`Source device ${sourceDevice.name} has no default gateway configured.`],
                hopActions: []
            };
        }
        if (!isSameSubnet(sourceDevice.ip, sourceDevice.gateway, normalizedMaskA)) {
            return {
                success: false,
                reason: `Source default gateway (${sourceDevice.gateway}) is not on the source subnet.`,
                path: [topologyPath[0]],
                action: 'DROP',
                events: [`Source default gateway (${sourceDevice.gateway}) is not on the source subnet.`],
                hopActions: []
            };
        }

        const firstRouterId = topologyPath.find((id) => getDeviceById(id)?.type === 'router');
        if (firstRouterId) {
            const firstRouter = getDeviceById(firstRouterId);
            const firstRouterIdx = topologyPath.indexOf(firstRouterId);
            const prevHopId = topologyPath[firstRouterIdx - 1];
            const ingressPort = getPortForRouterAndNeighbor(firstRouter.id, prevHopId);
            const ingressIface = firstRouter.interfaces?.[ingressPort];
            if (ingressIface && ingressIface.ip && sourceDevice.gateway !== ingressIface.ip) {
                return {
                    success: false,
                    reason: `Source default gateway (${sourceDevice.gateway}) does not match router interface IP (${ingressIface.ip}).`,
                    path: [topologyPath[0]],
                    action: 'DROP',
                    events: [`Source default gateway (${sourceDevice.gateway}) does not match router interface IP (${ingressIface.ip}).`],
                    hopActions: []
                };
            }
        }
    }

    const nextHopIp = resolveNextHopIp(sourceDevice, destinationDevice);
    if (!nextHopIp) {
        return {
            success: false,
            reason: 'Could not resolve next-hop IP address.',
            path: [topologyPath[0]],
            action: 'DROP',
            events: ['Next-hop IP resolution failed'],
            hopActions: []
        };
    }

    const arpResult = simulateArpResolution(sourceDevice, nextHopIp, topologyPath);
    if (!arpResult.success) {
        return {
            success: false,
            reason: arpResult.reason,
            path: arpResult.path,
            action: 'DROP',
            events: arpResult.events,
            hopActions: arpResult.hopActions || [],
            arpResult
        };
    }

    const initialDestMac = arpResult.targetMac;
    const initialTtl = typeof options?.initialTtl === 'number' ? options.initialTtl : 64;
    const isIcmp = Boolean(options?.icmp);
    const icmpConfig = typeof options?.icmp === 'object' ? options.icmp : {};

    const packetPayload = {
        sourceIp: sourceDevice.ip,
        destinationIp: destinationDevice.ip,
        ttl: initialTtl
    };

    if (isIcmp) {
        packetPayload.protocol = 'ICMP';
        packetPayload.icmp = {
            type: icmpConfig.type || 'ECHO_REQUEST',
            code: typeof icmpConfig.code === 'number' ? icmpConfig.code : 0,
            identifier: typeof icmpConfig.identifier === 'number' ? icmpConfig.identifier : 1,
            sequence: typeof icmpConfig.sequence === 'number' ? icmpConfig.sequence : 1
        };
    }

    const frame = {
        sourceDeviceId: sourceDevice.id,
        destinationDeviceId: destinationDevice.id,
        sourceMac: sourceDevice.mac,
        destinationMac: initialDestMac,
        etherType: 'IPv4',
        packet: packetPayload,
        path: topologyPath,
        events: [...arpResult.events],
        agingTimeSeconds: options?.agingTimeSeconds,
        now: options?.now
    };

    if (isIcmp) {
        frame.events.push(`${sourceDevice.name} sent ICMP Echo Request to ${destinationDevice.name}`);
    }

    const forwardResult = simulatePathTransmission(frame, sourceDevice, destinationDevice, topologyPath);

    if (!forwardResult.success) {
        let icmpErrorResult = null;
        let returnHopActions = [];
        let allEvents = [...frame.events];

        if (forwardResult.icmpErrorPacket && forwardResult.path && forwardResult.path.length >= 1) {
            const generatorId = forwardResult.path[forwardResult.path.length - 1];
            const generatorDevice = getDeviceById(generatorId);

            if (generatorDevice && generatorDevice.type === 'router' && sourceDevice) {
                icmpErrorResult = routeIcmpErrorReturnPath(
                    forwardResult.icmpErrorPacket,
                    generatorDevice,
                    sourceDevice,
                    forwardResult.path,
                    {
                        events: allEvents,
                        agingTimeSeconds: options?.agingTimeSeconds,
                        now: options?.now
                    }
                );

                if (icmpErrorResult) {
                    if (icmpErrorResult.events) {
                        allEvents = icmpErrorResult.events;
                    }
                    if (Array.isArray(icmpErrorResult.hopActions)) {
                        returnHopActions = icmpErrorResult.hopActions;
                    }
                }
            }
        }

        return {
            success: false,
            reason: forwardResult.reason,
            path: forwardResult.path,
            action: forwardResult.action,
            hopActions: forwardResult.hopActions,
            reverseHopActions: returnHopActions,
            events: allEvents,
            packet: frame.packet,
            arpResult,
            icmpErrorPacket: forwardResult.icmpErrorPacket || null,
            icmpErrorResult
        };
    }

    if (!isIcmp) {
        frame.events.push(`${destinationDevice.name} received frame`);
        return {
            success: true,
            reason: '',
            path: forwardResult.path,
            action: forwardResult.action,
            hopActions: forwardResult.hopActions,
            events: frame.events,
            packet: frame.packet,
            arpResult,
            icmpErrorPacket: null
        };
    }

    // ICMP Echo Request delivered -> Generate ICMP Echo Reply & traverse reverse path
    frame.events.push(`${destinationDevice.name} received ICMP Echo Request`);
    frame.events.push(`${destinationDevice.name} generated ICMP Echo Reply to ${sourceDevice.name}`);

    const reverseTopologyPath = [...topologyPath].reverse();
    let reverseInitialDestMac = sourceDevice.mac;

    if (!sameSubnet) {
        const revFirstRouterIndex = reverseTopologyPath.findIndex((id) => getDeviceById(id)?.type === 'router');
        if (revFirstRouterIndex !== -1) {
            const revRouter = getDeviceById(reverseTopologyPath[revFirstRouterIndex]);
            const revPrevHopId = reverseTopologyPath[revFirstRouterIndex - 1];
            const revIngressPort = getPortForRouterAndNeighbor(revRouter.id, revPrevHopId);
            const revIngressIface = revRouter?.interfaces?.[revIngressPort];
            if (revIngressIface && revIngressIface.mac) {
                reverseInitialDestMac = revIngressIface.mac;
            }
        }
    }

    const replyTtl = typeof options?.replyTtl === 'number' ? options.replyTtl : 64;
    const replyPacket = {
        sourceIp: destinationDevice.ip,
        destinationIp: sourceDevice.ip,
        protocol: 'ICMP',
        ttl: replyTtl,
        icmp: {
            type: 'ECHO_REPLY',
            code: 0,
            identifier: frame.packet.icmp.identifier,
            sequence: frame.packet.icmp.sequence
        }
    };

    const replyFrame = {
        sourceDeviceId: destinationDevice.id,
        destinationDeviceId: sourceDevice.id,
        sourceMac: destinationDevice.mac,
        destinationMac: reverseInitialDestMac,
        etherType: 'IPv4',
        packet: replyPacket,
        path: reverseTopologyPath,
        events: frame.events,
        agingTimeSeconds: options?.agingTimeSeconds,
        now: options?.now
    };

    const reverseResult = simulatePathTransmission(replyFrame, destinationDevice, sourceDevice, reverseTopologyPath);

    if (!reverseResult.success) {
        return {
            success: false,
            reason: reverseResult.reason,
            path: reverseResult.path,
            action: reverseResult.action,
            hopActions: forwardResult.hopActions,
            reverseHopActions: reverseResult.hopActions,
            events: replyFrame.events,
            packet: replyFrame.packet,
            arpResult
        };
    }

    replyFrame.events.push(`${sourceDevice.name} received ICMP Echo Reply`);

    return {
        success: true,
        reason: '',
        path: forwardResult.path,
        action: forwardResult.action,
        hopActions: forwardResult.hopActions,
        reverseHopActions: reverseResult.hopActions,
        events: replyFrame.events,
        packet: replyFrame.packet,
        arpResult,
        icmpErrorPacket: null
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

    const sameSubnet = normalizedMaskA === normalizedMaskB
        && isSameSubnet(sourceDevice.ip, targetDevice.ip, normalizedMaskA)
        && isSameSubnet(sourceDevice.ip, targetDevice.ip, normalizedMaskB);

    if (sameSubnet) {
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

    // Inter-subnet communication via Router
    const path = findTopologyPath(sourceDevice.id, targetDevice.id);
    if (!path.length || path.length < 2) {
        return { possible: false, reason: 'No topology path exists.', path: [] };
    }

    const routerIndices = [];
    path.forEach((id, index) => {
        const dev = getDeviceById(id);
        if (dev?.type === 'router') {
            routerIndices.push(index);
        }
    });

    if (!routerIndices.length) {
        return { possible: false, reason: 'Devices are on different subnets and no router exists on the path.', path };
    }

    const firstRouterIndex = routerIndices[0];
    const firstRouterId = path[firstRouterIndex];
    const firstRouter = getDeviceById(firstRouterId);
    const prevHopId = path[firstRouterIndex - 1];
    const ingressPort = getPortForRouterAndNeighbor(firstRouter.id, prevHopId);

    if (!ingressPort || !firstRouter.interfaces?.[ingressPort]) {
        return { possible: false, reason: `No connected interface found on router ${firstRouter.name} toward ${sourceDevice.name}.`, path };
    }

    const ingressIface = firstRouter.interfaces[ingressPort];
    if (ingressIface.status === 'down') {
        return { possible: false, reason: `Router ${firstRouter.name} interface ${ingressPort} is administratively down.`, path };
    }

    if (!ingressIface.ip || !isValidIPv4(ingressIface.ip)) {
        return { possible: false, reason: `Router ${firstRouter.name} interface ${ingressPort} has no valid IP configured.`, path };
    }

    if (!sourceDevice.gateway || !isValidIPv4(sourceDevice.gateway)) {
        return { possible: false, reason: `Source device ${sourceDevice.name} has no default gateway configured.`, path };
    }

    if (sourceDevice.gateway !== ingressIface.ip) {
        return { possible: false, reason: `Source default gateway (${sourceDevice.gateway}) does not match router interface IP (${ingressIface.ip}).`, path };
    }

    if (!isSameSubnet(sourceDevice.ip, ingressIface.ip, normalizedMaskA)) {
        return { possible: false, reason: `Source default gateway (${sourceDevice.gateway}) is not on the source subnet.`, path };
    }

    const lastRouterIndex = routerIndices[routerIndices.length - 1];
    const lastRouterId = path[lastRouterIndex];
    const lastRouter = getDeviceById(lastRouterId);
    const nextHopId = path[lastRouterIndex + 1];
    const egressPort = getPortForRouterAndNeighbor(lastRouter.id, nextHopId);

    if (!egressPort || !lastRouter.interfaces?.[egressPort]) {
        return { possible: false, reason: `No connected interface found on router ${lastRouter.name} toward ${targetDevice.name}.`, path };
    }

    const egressIface = lastRouter.interfaces[egressPort];
    if (egressIface.status === 'down') {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressPort} is administratively down.`, path };
    }

    if (!egressIface.ip || !isValidIPv4(egressIface.ip)) {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressPort} has no valid IP configured.`, path };
    }

    if (!isSameSubnet(egressIface.ip, targetDevice.ip, normalizedMaskB)) {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressPort} (${egressIface.ip}) is not on the destination subnet.`, path };
    }

    const trimmedDestGateway = targetDevice.gateway ? targetDevice.gateway.trim() : '';
    if (trimmedDestGateway) {
        if (!isValidIPv4(trimmedDestGateway)) {
            return { possible: false, reason: `Destination default gateway (${trimmedDestGateway}) is not a valid IPv4 address.`, path };
        }
        if (trimmedDestGateway !== egressIface.ip) {
            return { possible: false, reason: `Destination default gateway (${trimmedDestGateway}) does not match router interface IP (${egressIface.ip}).`, path };
        }
    }

    // Multi-router Layer 3 Routing Validation (Forward & Return Paths)
    for (let rIdx = 0; rIdx < routerIndices.length; rIdx++) {
        const routerIndex = routerIndices[rIdx];
        const rDev = getDeviceById(path[routerIndex]);
        if (!rDev) continue;

        // Forward route lookup for destination IP
        const forwardRouteResult = lookupRoute(rDev.id, targetDevice.ip);
        if (!forwardRouteResult || !forwardRouteResult.route) {
            if (forwardRouteResult?.reason === 'INTERFACE_DOWN') {
                return { possible: false, reason: `Router ${rDev.name} interface for destination network ${targetDevice.ip} is administratively down.`, path };
            }
            return { possible: false, reason: `Router ${rDev.name} has no route to destination network ${targetDevice.ip}.`, path };
        }

        const nextHopResolution = resolveRouteNextHop(rDev.id, forwardRouteResult.route, targetDevice.ip);
        const egressIfaceName = nextHopResolution.egressInterface || forwardRouteResult.route.interface;
        const egressIfaceDev = rDev.interfaces?.[egressIfaceName];
        if (!egressIfaceDev || egressIfaceDev.status === 'down') {
            return { possible: false, reason: `Router ${rDev.name} interface ${egressIfaceName || 'unknown'} is administratively down.`, path };
        }

        // Reverse route lookup for source IP (return path)
        const reverseRouteResult = lookupRoute(rDev.id, sourceDevice.ip);
        if (!reverseRouteResult || !reverseRouteResult.route) {
            if (reverseRouteResult?.reason === 'INTERFACE_DOWN') {
                return { possible: false, reason: `Router ${rDev.name} interface for source network ${sourceDevice.ip} is administratively down on return path.`, path };
            }
            return { possible: false, reason: `Router ${rDev.name} has no return route to source network ${sourceDevice.ip}.`, path };
        }

        const retNextHopResolution = resolveRouteNextHop(rDev.id, reverseRouteResult.route, sourceDevice.ip);
        const returnEgressIfaceName = retNextHopResolution.egressInterface || reverseRouteResult.route.interface;
        const returnEgressIfaceDev = rDev.interfaces?.[returnEgressIfaceName];
        if (!returnEgressIfaceDev || returnEgressIfaceDev.status === 'down') {
            return { possible: false, reason: `Router ${rDev.name} interface ${returnEgressIfaceName || 'unknown'} is administratively down on return path.`, path };
        }
    }

    return {
        possible: true,
        reason: '',
        path,
        sourceName: sourceDevice.name,
        sourceIp: sourceDevice.ip,
        destinationName: targetDevice.name,
        destinationIp: targetDevice.ip,
        network: `${calculateNetworkAddress(sourceDevice.ip, normalizedMaskA)}/${getPrefixLengthFromMask(normalizedMaskA)} → ${calculateNetworkAddress(targetDevice.ip, normalizedMaskB)}/${getPrefixLengthFromMask(normalizedMaskB)}`
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
