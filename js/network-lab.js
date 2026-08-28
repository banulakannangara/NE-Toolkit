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
    lastTracerouteResult: null,
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
    bindTerminalEvents();
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
    } else if (type === 'switch') {
        const swMac = generateMacAddress(networkState.devices);
        device = {
            id: `${DEVICE_DEFINITIONS[type].label}${counter}`,
            type,
            name: `${DEVICE_DEFINITIONS[type].label}${counter}`,
            x: clamp(x - 56, 24, safeWidth),
            y: clamp(y - 48, 24, safeHeight),
            mac: swMac,
            stp: {
                enabled: true,
                priority: DEFAULT_STP_PRIORITY,
                bridgeId: formatBridgeId(DEFAULT_STP_PRIORITY, swMac),
                rootBridgeId: formatBridgeId(DEFAULT_STP_PRIORITY, swMac),
                rootCost: 0,
                rootPort: null,
                ports: {}
            },
            vlans: {
                1: {
                    id: 1,
                    name: 'default',
                    status: 'active'
                }
            },
            switchports: {},
            svis: {},
            ipRouting: false,
            defaultGateway: ''
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
    terminalRuntime.sessions = {};
    terminalRuntime.activeDeviceId = null;
    terminalRuntime.isOpen = false;
    closeDeviceTerminal();
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

    const sourceDevice = getDeviceById(sourceId);
    const targetDevice = getDeviceById(targetId);

    const isSwitchToSwitch = sourceDevice?.type === 'switch' && targetDevice?.type === 'switch';

    const existing = !isSwitchToSwitch && networkState.connections.some((connection) =>
        (connection.source === sourceId && connection.target === targetId) ||
        (connection.source === targetId && connection.target === sourceId)
    );

    if (existing) {
        updateStatus('That connection already exists.');
        return;
    }

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
    (networkState.devices || []).forEach((dev) => {
        if (dev && dev.type === 'switch') {
            ensureSwitchStpState(dev);
        }
    });
    recalculateTopologyStp();
}

function render() {
    recalculateTopologyStp();
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

    if (action === 'ACL_EVALUATE') {
        const iface = hopAction.ingressInterface || hopAction.egressInterface || '';
        const dir = hopAction.acl?.direction || 'inbound';
        const seq = hopAction.acl?.sequence ? `Rule ${hopAction.acl.sequence}` : '';
        const subtitle = [iface, dir, seq].filter(Boolean).join(' • ');
        return {
            title: 'ACL PERMIT',
            subtitle,
            modifier: 'forward'
        };
    }

    if (action === 'DROP') {
        const reasonLabels = {
            'ttl-expired': 'TTL Expired',
            'filtered-same-port': 'Same Port Filter',
            'port-mismatch': 'Port Mismatch',
            'acl-deny': 'ACL Denied',
            'administratively-prohibited': 'Admin Prohibited'
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
                    ${['pc', 'laptop', 'server'].includes(selected.type) ? `
                        <button id="openDeviceTerminalBtn" class="terminal-launch-btn" type="button" data-device-id="${escapeHtml(selected.id)}">
                            <span class="terminal-launch-btn__icon">💻</span> Open Terminal / CLI
                        </button>
                    ` : ''}
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

    const openTerminalBtn = panel.querySelector('#openDeviceTerminalBtn') || panel.querySelector('#openRouterTerminalBtn') || panel.querySelector('#openSwitchTerminalBtn');
    if (openTerminalBtn) {
        openTerminalBtn.addEventListener('click', () => {
            const devId = openTerminalBtn.dataset.deviceId || networkState.selectedDeviceId;
            if (devId) {
                openDeviceTerminal(devId);
            }
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

    // Router ACL Event Handlers
    if (selected.type === 'router') {
        const createAclBtn = panel.querySelector('#createAclBtn');
        if (createAclBtn) {
            createAclBtn.addEventListener('click', () => {
                const aclIdInput = panel.querySelector('#newAclId');
                const aclTypeSelect = panel.querySelector('#newAclType');
                const feedbackEl = panel.querySelector('#newAclFeedback');

                const rawId = aclIdInput ? aclIdInput.value.trim() : '';
                const type = aclTypeSelect ? aclTypeSelect.value.trim() : 'standard';

                pushHistory();
                const result = createRouterAcl(selected.id, { id: rawId, type });
                if (result.success) {
                    updateStatus(`ACL ${result.acl.name} (${result.acl.type}) created on ${selected.name}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    if (feedbackEl) {
                        feedbackEl.textContent = `✗ ${result.reason}`;
                        feedbackEl.className = 'property-feedback property-feedback--error';
                    }
                }
            });
        }

        panel.querySelectorAll('.acl-delete-btn[data-acl-id]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const aclId = btn.dataset.aclId;
                if (!aclId) return;
                pushHistory();
                const result = deleteRouterAcl(selected.id, aclId);
                if (result.success) {
                    updateStatus(`ACL ${aclId} deleted from ${selected.name}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    updateStatus(`Could not delete ACL: ${result.reason}`);
                }
            });
        });

        panel.querySelectorAll('.acl-rule-delete-btn[data-acl-id][data-sequence]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const aclId = btn.dataset.aclId;
                const seq = parseInt(btn.dataset.sequence, 10);
                if (!aclId || isNaN(seq)) return;
                pushHistory();
                const result = deleteRouterAclRule(selected.id, aclId, seq);
                if (result.success) {
                    updateStatus(`Rule ${seq} deleted from ACL ${aclId} on ${selected.name}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    updateStatus(`Could not delete rule: ${result.reason}`);
                }
            });
        });

        const addAclRuleBtn = panel.querySelector('#addAclRuleBtn');
        if (addAclRuleBtn) {
            addAclRuleBtn.addEventListener('click', () => {
                const targetAclSelect = panel.querySelector('#aclRuleTargetSelect');
                const seqInput = panel.querySelector('#aclRuleSequence');
                const actionSelect = panel.querySelector('#aclRuleAction');
                const protoSelect = panel.querySelector('#aclRuleProtocol');
                const srcInput = panel.querySelector('#aclRuleSource');
                const srcMaskInput = panel.querySelector('#aclRuleSourceMask');
                const dstInput = panel.querySelector('#aclRuleDest');
                const dstMaskInput = panel.querySelector('#aclRuleDestMask');
                const feedbackEl = panel.querySelector('#aclRuleFeedback');

                const targetAclId = targetAclSelect ? targetAclSelect.value.trim() : '';
                const rawSeq = seqInput ? seqInput.value.trim() : '';
                const action = actionSelect ? actionSelect.value.trim() : 'permit';
                const protocol = protoSelect ? protoSelect.value.trim() : 'ip';
                const source = srcInput ? srcInput.value.trim() : 'any';
                const sourceMask = srcMaskInput ? srcMaskInput.value.trim() : '';
                const dest = dstInput ? dstInput.value.trim() : 'any';
                const destMask = dstMaskInput ? dstMaskInput.value.trim() : '';

                const ruleData = {
                    action,
                    protocol,
                    sourceIp: source,
                    sourceWildcard: sourceMask || undefined,
                    destinationIp: dest,
                    destinationWildcard: destMask || undefined
                };
                if (rawSeq !== '') {
                    ruleData.sequence = parseInt(rawSeq, 10);
                }

                pushHistory();
                const result = addRouterAclRule(selected.id, targetAclId, ruleData);
                if (result.success) {
                    updateStatus(`Rule ${result.rule.sequence} added to ACL ${targetAclId} on ${selected.name}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    if (feedbackEl) {
                        feedbackEl.textContent = `✗ ${result.reason}`;
                        feedbackEl.className = 'property-feedback property-feedback--error';
                    }
                }
            });
        }

        const bindAclBtn = panel.querySelector('#bindAclBtn');
        if (bindAclBtn) {
            bindAclBtn.addEventListener('click', () => {
                const ifSelect = panel.querySelector('#aclBindInterface');
                const dirSelect = panel.querySelector('#aclBindDirection');
                const aclSelect = panel.querySelector('#aclBindAclSelect');
                const feedbackEl = panel.querySelector('#aclBindFeedback');

                const ifName = ifSelect ? ifSelect.value.trim() : '';
                const dir = dirSelect ? dirSelect.value.trim() : 'in';
                const aclId = aclSelect ? aclSelect.value.trim() : '';

                pushHistory();
                const result = bindRouterInterfaceAcl(selected.id, ifName, dir, aclId);
                if (result.success) {
                    updateStatus(`ACL ${aclId} bound ${dir.toUpperCase()} on ${selected.name} ${ifName}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    if (feedbackEl) {
                        feedbackEl.textContent = `✗ ${result.reason}`;
                        feedbackEl.className = 'property-feedback property-feedback--error';
                    }
                }
            });
        }

        const unbindAclBtn = panel.querySelector('#unbindAclBtn');
        if (unbindAclBtn) {
            unbindAclBtn.addEventListener('click', () => {
                const ifSelect = panel.querySelector('#aclBindInterface');
                const dirSelect = panel.querySelector('#aclBindDirection');
                const feedbackEl = panel.querySelector('#aclBindFeedback');

                const ifName = ifSelect ? ifSelect.value.trim() : '';
                const dir = dirSelect ? dirSelect.value.trim() : 'in';

                pushHistory();
                const result = unbindRouterInterfaceAcl(selected.id, ifName, dir);
                if (result.success) {
                    updateStatus(`Unbound ${dir.toUpperCase()} ACL on ${selected.name} ${ifName}.`);
                    renderPropertiesPanel();
                } else {
                    networkState.history.pop();
                    if (feedbackEl) {
                        feedbackEl.textContent = `✗ ${result.reason}`;
                        feedbackEl.className = 'property-feedback property-feedback--error';
                    }
                }
            });
        }
    }

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

    let vlanHtml = '';
    if (pkt.vlanTag?.isTagged) {
        vlanHtml = `
            <div class="packet-inspector__section">
                <h5 class="packet-inspector__section-title">IEEE 802.1Q VLAN TAG</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">TPID</span>
                        <strong class="packet-inspector__value packet-inspector__value--mono">${escapeHtml(pkt.vlanTag.tpid || '0x8100')}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">VLAN ID (VID)</span>
                        <strong class="packet-inspector__value">${escapeHtml(String(pkt.vlanTag.vlanId))}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Priority (CoS)</span>
                        <strong class="packet-inspector__value">${escapeHtml(String(pkt.vlanTag.priority || 0))}</strong>
                    </div>
                </div>
            </div>
        `;
    }

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

    let aclHtml = '';
    const aclInfo = result?.acl || errPkt?.icmp?.acl;
    if (aclInfo) {
        const actionClass = aclInfo.action === 'deny' ? 'packet-inspector__value--error' : 'packet-inspector__value--success';
        const ruleText = aclInfo.isImplicitDeny ? 'Implicit Deny (End of ACL)' : `Sequence ${aclInfo.sequence}`;
        aclHtml = `
            <div class="packet-inspector__section packet-inspector__section--acl">
                <h5 class="packet-inspector__section-title">ACCESS CONTROL LIST (ACL)</h5>
                <div class="packet-inspector__grid">
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">ACL ID / Name</span>
                        <strong class="packet-inspector__value">${escapeHtml(String(aclInfo.aclName || aclInfo.aclId))}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Action</span>
                        <strong class="packet-inspector__value ${actionClass}">${escapeHtml(String(aclInfo.action).toUpperCase())} (${escapeHtml(String(aclInfo.direction || 'inbound'))})</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Interface</span>
                        <strong class="packet-inspector__value">${escapeHtml(String(aclInfo.interface || 'N/A'))}</strong>
                    </div>
                    <div class="packet-inspector__item">
                        <span class="packet-inspector__label">Matched Rule</span>
                        <strong class="packet-inspector__value">${escapeHtml(ruleText)}</strong>
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
            ${vlanHtml}
            ${ipv4Html}
            ${icmpHtml}
            ${icmpErrorHtml}
            ${aclHtml}
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

    let tracerouteHtml = '';
    if (networkState.lastTracerouteResult) {
        const tr = networkState.lastTracerouteResult;
        const rows = tr.hops.map((h) => {
            const statusClass = h.status === 'reached'
                ? 'traceroute-badge--reached'
                : h.status === 'ttl_expired'
                    ? 'traceroute-badge--ttl'
                    : 'traceroute-badge--drop';
            const statusLabel = h.status === 'reached'
                ? 'REACHED'
                : h.status === 'ttl_expired'
                    ? 'TTL EXPIRED'
                    : 'UNREACHABLE';
            return `
                <tr class="traceroute-hop-row">
                    <td><strong>${escapeHtml(String(h.hop))}</strong></td>
                    <td>${escapeHtml(h.deviceName || '—')}</td>
                    <td><code>${escapeHtml(h.ip)}</code></td>
                    <td>${escapeHtml(h.icmpTypeName || '—')}</td>
                    <td><span class="traceroute-badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
                </tr>
            `;
        }).join('');

        tracerouteHtml = `
            <div class="property-summary traceroute-panel">
                <h4>PATH TRACE (TRACEROUTE)</h4>
                <div class="property-status-message ${tr.success ? 'property-status-message--success' : 'property-status-message--warning'}">
                    ${escapeHtml(tr.reason)}
                </div>
                <div class="traceroute-table-container">
                    <table class="traceroute-table">
                        <thead>
                            <tr>
                                <th>Hop</th>
                                <th>Device</th>
                                <th>IP Address</th>
                                <th>ICMP Response</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

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
                <div class="send-frame-actions-row">
                    <button type="button" id="traceRouteBtn" class="toolbar-button trace-route-btn" ${(!sourceDevice || !networkState.lastFrameResult) ? 'disabled' : ''}>
                        <span>🔍</span> Trace Path (Traceroute)
                    </button>
                </div>
            </div>
            ${tracerouteHtml}
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

    const traceRouteBtn = document.getElementById('traceRouteBtn');
    if (traceRouteBtn) {
        traceRouteBtn.addEventListener('click', () => {
            const srcDev = getDeviceById(networkState.sendFrameState?.sourceId);
            const destId = networkState.lastFrameResult?.path?.slice(-1)[0];
            const destDev = getDeviceById(destId);
            if (srcDev && destDev) {
                networkState.lastTracerouteResult = simulateTraceroute(srcDev, destDev);
                renderPropertiesPanel();
            }
        });
    }
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

function renderRouterAclSection(router) {
    const acls = getRouterAcls(router.id);
    const aclList = Object.values(acls);
    const runtime = getRouterRuntime(router.id);
    const interfaceAcls = runtime.interfaceAcls || {};

    const ifaces = ['Gig0/0', 'Gig0/1'];

    // 1. Interface Bindings Summary
    const bindingRows = ifaces.map((ifName) => {
        const inAcl = interfaceAcls[ifName]?.in || 'None';
        const outAcl = interfaceAcls[ifName]?.out || 'None';
        return `
            <tr>
                <td><strong>${escapeHtml(ifName)}</strong></td>
                <td><span class="acl-binding-badge acl-binding-badge--${inAcl !== 'None' ? 'active' : 'none'}">${escapeHtml(inAcl)}</span></td>
                <td><span class="acl-binding-badge acl-binding-badge--${outAcl !== 'None' ? 'active' : 'none'}">${escapeHtml(outAcl)}</span></td>
            </tr>
        `;
    }).join('');

    // 2. ACL Cards & Rule Tables
    let aclCardsHtml = '';
    if (aclList.length === 0) {
        aclCardsHtml = '<p class="empty-state">No Access Control Lists configured on this router.</p>';
    } else {
        aclCardsHtml = aclList.map((acl) => {
            const ruleRows = acl.rules.map((rule) => {
                const actionBadge = rule.action === 'permit'
                    ? '<span class="acl-badge acl-badge--permit">PERMIT</span>'
                    : '<span class="acl-badge acl-badge--deny">DENY</span>';

                const srcText = rule.source.isAny
                    ? 'any'
                    : rule.source.isHost
                        ? `host ${rule.source.ip}`
                        : `${rule.source.ip} ${rule.source.wildcard}`;

                let dstText = '-';
                if (acl.type === 'extended') {
                    dstText = rule.destination?.isAny
                        ? 'any'
                        : rule.destination?.isHost
                            ? `host ${rule.destination.ip}`
                            : rule.destination
                                ? `${rule.destination.ip} ${rule.destination.wildcard}`
                                : 'any';
                }

                const protoText = acl.type === 'extended' ? String(rule.protocol || 'ip').toUpperCase() : 'IP';

                return `
                    <tr>
                        <td><strong>${escapeHtml(String(rule.sequence))}</strong></td>
                        <td>${actionBadge}</td>
                        ${acl.type === 'extended' ? `<td><code>${escapeHtml(protoText)}</code></td>` : ''}
                        <td><code>${escapeHtml(srcText)}</code></td>
                        ${acl.type === 'extended' ? `<td><code>${escapeHtml(dstText)}</code></td>` : ''}
                        <td><span class="acl-hits-badge">${escapeHtml(String(rule.hits || 0))}</span></td>
                        <td class="table-action-cell">
                            <button class="acl-rule-delete-btn table-action-btn" data-acl-id="${escapeHtml(acl.id)}" data-sequence="${escapeHtml(String(rule.sequence))}" title="Delete Rule">✕</button>
                        </td>
                    </tr>
                `;
            }).join('');

            const rulesTable = acl.rules.length > 0 ? `
                <table class="property-table router-acl-table">
                    <thead>
                        <tr>
                            <th>Seq</th>
                            <th>Action</th>
                            ${acl.type === 'extended' ? '<th>Proto</th>' : ''}
                            <th>Source</th>
                            ${acl.type === 'extended' ? '<th>Destination</th>' : ''}
                            <th>Hits</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ruleRows}
                    </tbody>
                </table>
            ` : '<p class="empty-state">No rules in this ACL. Add rules below.</p>';

            return `
                <div class="router-acl-card">
                    <div class="router-acl-header">
                        <div class="router-acl-title-group">
                            <span class="acl-type-badge acl-type-badge--${escapeHtml(acl.type)}">${escapeHtml(acl.type.toUpperCase())}</span>
                            <strong class="router-acl-title">ACL ${escapeHtml(acl.name)}</strong>
                            <span class="router-acl-count">(${acl.rules.length} rule${acl.rules.length === 1 ? '' : 's'})</span>
                        </div>
                        <button class="acl-delete-btn table-action-btn" data-acl-id="${escapeHtml(acl.id)}" title="Delete ACL ${escapeHtml(acl.name)}">Delete ACL</button>
                    </div>
                    ${rulesTable}
                </div>
            `;
        }).join('');
    }

    // 3. Form select options for ACL dropdowns
    const aclOptions = aclList.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.type)})</option>`).join('');

    return `
        <div class="property-summary" id="routerAclSection">
            <h4>ACCESS CONTROL LISTS (ACL)</h4>

            <!-- Interface Bindings Overview -->
            <div class="acl-section-block">
                <h5 class="acl-section-subtitle">Interface ACL Bindings</h5>
                <table class="property-table acl-bindings-table">
                    <thead>
                        <tr>
                            <th>Interface</th>
                            <th>Inbound ACL</th>
                            <th>Outbound ACL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bindingRows}
                    </tbody>
                </table>

                <div class="acl-binding-form">
                    <div class="property-field">
                        <label for="aclBindInterface">Interface</label>
                        <select id="aclBindInterface">
                            <option value="Gig0/0">Gig0/0</option>
                            <option value="Gig0/1">Gig0/1</option>
                        </select>
                    </div>
                    <div class="property-field">
                        <label for="aclBindDirection">Direction</label>
                        <select id="aclBindDirection">
                            <option value="in">Inbound (in)</option>
                            <option value="out">Outbound (out)</option>
                        </select>
                    </div>
                    <div class="property-field">
                        <label for="aclBindAclSelect">ACL</label>
                        <select id="aclBindAclSelect">
                            <option value="">-- Select ACL --</option>
                            ${aclOptions}
                        </select>
                    </div>
                    <div class="property-actions acl-binding-actions">
                        <button id="bindAclBtn" class="toolbar-button" type="button">Bind ACL</button>
                        <button id="unbindAclBtn" class="toolbar-button" type="button">Unbind</button>
                    </div>
                    <div class="property-feedback" id="aclBindFeedback"></div>
                </div>
            </div>

            <!-- Active ACLs & Rules -->
            <div class="acl-section-block">
                <h5 class="acl-section-subtitle">Configured ACLs</h5>
                ${aclCardsHtml}
            </div>

            <!-- Create New ACL Form -->
            <div class="acl-section-block">
                <div class="acl-creation-form">
                    <h5 class="acl-section-subtitle">Create New ACL</h5>
                    <div class="property-field">
                        <label for="newAclId">ACL Name / Number</label>
                        <input id="newAclId" type="text" placeholder="e.g. 10 (Std), 100 (Ext), or CORP_IN">
                    </div>
                    <div class="property-field">
                        <label for="newAclType">ACL Type</label>
                        <select id="newAclType">
                            <option value="standard">Standard (Source only)</option>
                            <option value="extended">Extended (Source, Dest, Protocol)</option>
                        </select>
                    </div>
                    <div class="property-feedback" id="newAclFeedback"></div>
                    <div class="property-actions">
                        <button id="createAclBtn" class="toolbar-button" type="button">Create ACL</button>
                    </div>
                </div>
            </div>

            <!-- Add Rule to ACL Form -->
            ${aclList.length > 0 ? `
                <div class="acl-section-block">
                    <div class="acl-rule-form">
                        <h5 class="acl-section-subtitle">Add Rule to ACL</h5>
                        <div class="property-field">
                            <label for="aclRuleTargetSelect">Target ACL</label>
                            <select id="aclRuleTargetSelect">
                                ${aclOptions}
                            </select>
                        </div>
                        <div class="property-field">
                            <label for="aclRuleSequence">Sequence Number (Optional)</label>
                            <input id="aclRuleSequence" type="number" min="1" max="9999" placeholder="Auto (+10)">
                        </div>
                        <div class="property-field">
                            <label for="aclRuleAction">Action</label>
                            <select id="aclRuleAction">
                                <option value="permit">PERMIT</option>
                                <option value="deny">DENY</option>
                            </select>
                        </div>
                        <div class="property-field" id="aclRuleProtocolGroup">
                            <label for="aclRuleProtocol">Protocol</label>
                            <select id="aclRuleProtocol">
                                <option value="ip">IP (All IP Traffic)</option>
                                <option value="icmp">ICMP (Ping / Echo)</option>
                            </select>
                        </div>
                        <div class="property-field">
                            <label for="aclRuleSource">Source IP / Host / Network</label>
                            <input id="aclRuleSource" type="text" placeholder="e.g. 192.168.1.10, 192.168.1.0, or any">
                        </div>
                        <div class="property-field">
                            <label for="aclRuleSourceMask">Source Wildcard / Subnet Mask</label>
                            <input id="aclRuleSourceMask" type="text" placeholder="e.g. 0.0.0.255 or 255.255.255.0 (leave blank for host/any)">
                        </div>
                        <div class="property-field" id="aclRuleDestGroup">
                            <label for="aclRuleDest">Destination IP / Network (Extended)</label>
                            <input id="aclRuleDest" type="text" placeholder="e.g. 10.0.0.0 or any">
                        </div>
                        <div class="property-field" id="aclRuleDestMaskGroup">
                            <label for="aclRuleDestMask">Destination Wildcard / Subnet Mask (Extended)</label>
                            <input id="aclRuleDestMask" type="text" placeholder="e.g. 0.0.0.255 or 255.255.255.0">
                        </div>
                        <div class="property-feedback" id="aclRuleFeedback"></div>
                        <div class="property-actions">
                            <button id="addAclRuleBtn" class="toolbar-button" type="button">Add Rule</button>
                        </div>
                    </div>
                </div>
            ` : ''}
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
            ${renderRouterAclSection(selected)}
            ${renderArpTableInspector(selected)}
            <div class="property-actions">
                <button id="applyDeviceConfig" class="toolbar-button" type="button" ${isValid ? '' : 'disabled'}>Apply Changes</button>
                <button id="openRouterTerminalBtn" class="terminal-launch-btn" type="button" data-device-id="${escapeHtml(selected.id)}">
                    <span class="terminal-launch-btn__icon">⚡</span> Open Router Console / CLI
                </button>
            </div>
            <p class="property-info">Configuration updates are applied only when you click Apply Changes, so invalid data never overwrites the current device state.</p>
        </div>
    `;
}

function renderSwitchInspector(selected) {
    const sw = getSwitchDevice(selected);
    const targetSw = sw || selected;
    ensureSwitchVlanState(targetSw);
    recalculateTopologyStp();
    const runtime = getSwitchRuntime(selected.id);
    const portCount = getSwitchPortCount(selected.id);
    const vlanCount = Object.keys(targetSw.vlans || {}).length || 1;
    const sviEntries = Object.entries(targetSw.svis || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    const sviCount = sviEntries.length;
    const learnedCount = runtime.macTable.length;
    const macRows = runtime.macTable.map((entry) => `
            <tr>
                <td>${escapeHtml(String(entry.vlan || 1))}</td>
                <td>${escapeHtml(entry.mac)}</td>
                <td>${escapeHtml(entry.port)}</td>
                <td>${escapeHtml(getDeviceById(entry.deviceId)?.name || entry.deviceId)}</td>
            </tr>
        `).join('');

    const allPortNames = new Set([
        ...Object.values(runtime.ports || {}),
        ...Object.keys(targetSw.switchports || {})
    ]);
    const sortedPortNames = Array.from(allPortNames).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    });

    const portRows = sortedPortNames.map((pName) => {
        const cfg = getSwitchPortConfig(targetSw, pName);
        const isTrunk = cfg.mode === 'trunk';
        const vlanCol = isTrunk ? `Native: ${cfg.nativeVlan || 1}` : `VLAN ${cfg.accessVlan || 1}`;
        const allowedCol = isTrunk ? formatAllowedVlans(cfg.allowedVlans) : '-';
        return `
            <tr>
                <td>${escapeHtml(pName)}</td>
                <td>${escapeHtml(cfg.mode || 'access')}</td>
                <td>${escapeHtml(vlanCol)}</td>
                <td>${escapeHtml(allowedCol)}</td>
            </tr>
        `;
    }).join('');

    const isRoot = targetSw.stp?.rootBridgeId === targetSw.stp?.bridgeId;
    const stpPortRows = sortedPortNames.map((pName) => {
        const pStp = targetSw.stp?.ports?.[pName] || { role: 'disabled', state: 'blocking', cost: 19 };
        const roleLabel = pStp.role === 'root' ? 'Root' : pStp.role === 'designated' ? 'Desg' : pStp.role === 'alternate' ? 'Altn' : 'Disabled';
        const isFwd = pStp.state === 'forwarding';
        const stateBadge = `<span class="status-badge ${isFwd ? 'status-up' : 'status-down'}">${isFwd ? 'FORWARDING' : 'BLOCKING'}</span>`;
        const connId = Object.keys(runtime.ports || {}).find(cId => runtime.ports[cId] === pName);
        let neighborDesc = '-';
        if (connId) {
            const conn = getConnectionById(connId);
            if (conn) {
                const neighborId = conn.source === targetSw.id ? conn.target : conn.source;
                const neighborDev = getDeviceById(neighborId);
                if (neighborDev) {
                    if (neighborDev.type === 'switch') {
                        const neighborPort = getSwitchPortLabel(neighborDev.id, conn.id);
                        neighborDesc = `${neighborDev.name} (${neighborPort})`;
                    } else {
                        neighborDesc = neighborDev.name;
                    }
                }
            }
        }
        return `
            <tr>
                <td>${escapeHtml(pName)}</td>
                <td>${escapeHtml(roleLabel)}</td>
                <td>${stateBadge}</td>
                <td>${escapeHtml(String(pStp.cost || 19))}</td>
                <td>${escapeHtml(neighborDesc)}</td>
            </tr>
        `;
    }).join('');

    const sviRows = sviEntries.map(([vlanIdStr, svi]) => {
        const vlanId = Number(vlanIdStr);
        const isUp = getEffectiveSviStatus(targetSw, vlanId) === 'up';
        const isAdminDown = svi.adminStatus === 'down';
        const statusText = isAdminDown ? 'admin down' : (isUp ? 'up' : 'down');
        return `
            <tr>
                <td>Vlan${vlanId}</td>
                <td>${escapeHtml(svi.ip || 'unassigned')}</td>
                <td>${escapeHtml(svi.subnetMask || '-')}</td>
                <td><span class="status-badge ${statusText === 'up' ? 'status-up' : 'status-down'}">${statusText}</span></td>
            </tr>
        `;
    }).join('');

    return `
        <div class="property-summary">
            <h4>SWITCH</h4>
            <div class="property-summary-grid">
                <div class="property-summary-item">
                    <span>Layer</span>
                    <strong>${targetSw.ipRouting ? '3 (Multilayer)' : '2'}</strong>
                </div>
                <div class="property-summary-item">
                    <span>VLANs</span>
                    <strong>${vlanCount}</strong>
                </div>
                <div class="property-summary-item">
                    <span>SVIs</span>
                    <strong>${sviCount}</strong>
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
            <div class="property-actions" style="margin-top: 10px;">
                <button id="openSwitchTerminalBtn" class="terminal-launch-btn" type="button" data-device-id="${escapeHtml(selected.id)}">
                    Open Switch Console / CLI
                </button>
            </div>
        </div>
        <div class="property-summary">
            <h4>SPANNING TREE PROTOCOL (IEEE 802.1D)</h4>
            <div class="property-summary-grid">
                <div class="property-summary-item">
                    <span>STP Status</span>
                    <strong>Enabled (802.1D)</strong>
                </div>
                <div class="property-summary-item">
                    <span>Bridge Role</span>
                    <strong>${isRoot ? '<span class="status-badge status-up">Root Bridge</span>' : '<span class="status-badge" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8;">Non-Root</span>'}</strong>
                </div>
                <div class="property-summary-item">
                    <span>Bridge Priority</span>
                    <strong>${targetSw.stp?.priority || 32768}</strong>
                </div>
                <div class="property-summary-item">
                    <span>Root Path Cost</span>
                    <strong>${targetSw.stp?.rootCost || 0}</strong>
                </div>
                <div class="property-summary-item">
                    <span>Root Port</span>
                    <strong>${targetSw.stp?.rootPort || 'None (Root)'}</strong>
                </div>
            </div>
            ${allPortNames.size ? `
                <table class="property-table" style="margin-top: 10px;">
                    <thead>
                        <tr>
                            <th>Port</th>
                            <th>Role</th>
                            <th>State</th>
                            <th>Cost</th>
                            <th>Neighbor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stpPortRows}
                    </tbody>
                </table>
            ` : ''}
        </div>
        ${sviCount ? `
            <div class="property-summary">
                <h4>SWITCHED VIRTUAL INTERFACES (SVIs)</h4>
                <table class="property-table">
                    <thead>
                        <tr>
                            <th>Interface</th>
                            <th>IP Address</th>
                            <th>Subnet Mask</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sviRows}
                    </tbody>
                </table>
            </div>
        ` : ''}
        ${allPortNames.size ? `
            <div class="property-summary">
                <h4>SWITCHPORTS</h4>
                <table class="property-table">
                    <thead>
                        <tr>
                            <th>Port</th>
                            <th>Mode</th>
                            <th>VLAN</th>
                            <th>Allowed</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${portRows}
                    </tbody>
                </table>
            </div>
        ` : ''}
        <div class="property-summary">
            <h4>MAC ADDRESS TABLE</h4>
            ${learnedCount ? `
                <table class="property-table">
                    <thead>
                        <tr>
                            <th>VLAN</th>
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

    if (trimmed.startsWith('/') || /^\d{1,2}$/.test(trimmed)) {
        const cidr = Number.parseInt(trimmed.replace('/', ''), 10);
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

    recalculateTopologyStp();

    const adjacency = new Map();
    networkState.devices.forEach((device) => adjacency.set(device.id, []));

    networkState.connections.forEach((connection) => {
        const source = getDeviceById(connection.source);
        const target = getDeviceById(connection.target);
        if (!source || !target) {
            return;
        }

        // Check if source switchport is in STP blocking state
        if (source.type === 'switch') {
            const port = getSwitchPortLabel(source.id, connection.id);
            const stpPort = source.stp?.ports?.[port];
            if (stpPort && stpPort.state === 'blocking') {
                return;
            }
        }

        // Check if target switchport is in STP blocking state
        if (target.type === 'switch') {
            const port = getSwitchPortLabel(target.id, connection.id);
            const stpPort = target.stp?.ports?.[port];
            if (stpPort && stpPort.state === 'blocking') {
                return;
            }
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

function findL3RoutedTopologyPath(sourceDevice, destinationDevice) {
    if (!sourceDevice || !destinationDevice) return [];
    const srcDev = typeof sourceDevice === 'object' ? sourceDevice : getDeviceById(sourceDevice);
    const dstDev = typeof destinationDevice === 'object' ? destinationDevice : getDeviceById(destinationDevice);
    if (!srcDev || !dstDev) return [];
    if (!srcDev.gateway || !isValidIPv4(srcDev.gateway)) return [];

    const gatewayIp = srcDev.gateway.trim();
    let gatewayDev = null;

    for (const dev of (networkState.devices || [])) {
        if (dev.type === 'router' && dev.interfaces) {
            for (const [ifName, iface] of Object.entries(dev.interfaces)) {
                if (iface.ip === gatewayIp) {
                    gatewayDev = dev;
                    break;
                }
            }
        } else if (dev.type === 'switch' && dev.ipRouting && dev.svis) {
            for (const [vlanIdStr, svi] of Object.entries(dev.svis)) {
                if (svi && svi.ip === gatewayIp && getEffectiveSviStatus(dev, parseInt(vlanIdStr, 10)) === 'up') {
                    gatewayDev = dev;
                    break;
                }
            }
        }
        if (gatewayDev) break;
    }

    if (!gatewayDev) return [];

    const path1 = findTopologyPath(srcDev.id, gatewayDev.id);
    if (!path1 || path1.length < 2) return [];

    const path2 = findTopologyPath(gatewayDev.id, dstDev.id);
    if (!path2 || path2.length < 2) return [];

    return [...path1, ...path2.slice(1)];
}

function getSwitchRuntime(switchId) {
    if (!networkState.switchRuntime[switchId]) {
        networkState.switchRuntime[switchId] = {
            ports: {},
            macTable: [],
            staticRoutes: []
        };
    }
    if (!Array.isArray(networkState.switchRuntime[switchId].staticRoutes)) {
        networkState.switchRuntime[switchId].staticRoutes = [];
    }
    return networkState.switchRuntime[switchId];
}

function getConnectionBetween(deviceAId, deviceBId) {
    const devA = getDeviceById(deviceAId);
    const devB = getDeviceById(deviceBId);
    const aIds = new Set([deviceAId, devA?.id, devA?.name].filter(Boolean));
    const bIds = new Set([deviceBId, devB?.id, devB?.name].filter(Boolean));

    return networkState.connections.find((connection) => {
        return (aIds.has(connection.source) && bIds.has(connection.target))
            || (aIds.has(connection.target) && bIds.has(connection.source));
    }) || null;
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

const MIN_VLAN_ID = 1;
const MAX_VLAN_ID = 4094;

function normalizeVlanId(vlanId) {
    if (typeof vlanId === 'number' && Number.isInteger(vlanId)) {
        if (vlanId >= MIN_VLAN_ID && vlanId <= MAX_VLAN_ID) {
            return vlanId;
        }
        return null;
    }
    if (typeof vlanId === 'string') {
        const trimmed = vlanId.trim();
        if (/^\d+$/.test(trimmed)) {
            const num = parseInt(trimmed, 10);
            if (num >= MIN_VLAN_ID && num <= MAX_VLAN_ID) {
                return num;
            }
        }
    }
    return null;
}

function getSwitchDevice(switchOrId) {
    if (!switchOrId) return null;
    if (typeof switchOrId === 'object' && switchOrId.type === 'switch') {
        return switchOrId;
    }
    const dev = getDeviceById(switchOrId) || (networkState.devices && networkState.devices.find((d) => d.name === switchOrId || d.id === switchOrId));
    return dev && dev.type === 'switch' ? dev : null;
}

const DEFAULT_STP_PRIORITY = 32768;
const DEFAULT_PORT_COST_FA = 19;
const DEFAULT_PORT_COST_GI = 4;
const DEFAULT_PORT_PRIORITY = 128;
const VALID_STP_PRIORITIES = new Set([
    0, 4096, 8192, 12288, 16384, 20480, 24576, 28672,
    32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440
]);

function formatBridgeId(priority, mac) {
    const prio = typeof priority === 'number' ? priority : DEFAULT_STP_PRIORITY;
    const normMac = normalizeMacAddress(mac) || '00:00:00:00:00:00';
    return `${prio}.${normMac}`;
}

function parseBridgeId(bridgeId) {
    if (!bridgeId || typeof bridgeId !== 'string') {
        return { priority: DEFAULT_STP_PRIORITY, mac: '00:00:00:00:00:00' };
    }
    const parts = bridgeId.split('.');
    const parsed = parseInt(parts[0], 10);
    const priority = isNaN(parsed) ? DEFAULT_STP_PRIORITY : parsed;
    const mac = parts.slice(1).join('.') || '00:00:00:00:00:00';
    return { priority, mac };
}

function compareBridgeIds(bidA, bidB) {
    const a = parseBridgeId(bidA);
    const b = parseBridgeId(bidB);
    if (a.priority !== b.priority) {
        return a.priority - b.priority;
    }
    return a.mac.localeCompare(b.mac);
}

function ensureSwitchStpState(sw) {
    if (!sw || sw.type !== 'switch') return;
    if (!sw.stp || typeof sw.stp !== 'object') {
        const baseMac = sw.mac || '00:00:00:00:00:00';
        sw.stp = {
            enabled: true,
            priority: DEFAULT_STP_PRIORITY,
            bridgeId: formatBridgeId(DEFAULT_STP_PRIORITY, baseMac),
            rootBridgeId: formatBridgeId(DEFAULT_STP_PRIORITY, baseMac),
            rootCost: 0,
            rootPort: null,
            ports: {}
        };
    }
    if (typeof sw.stp.enabled !== 'boolean') {
        sw.stp.enabled = true;
    }
    if (typeof sw.stp.priority !== 'number') {
        sw.stp.priority = DEFAULT_STP_PRIORITY;
    }
    if (!sw.stp.bridgeId) {
        sw.stp.bridgeId = formatBridgeId(sw.stp.priority, sw.mac);
    }
    if (!sw.stp.rootBridgeId) {
        sw.stp.rootBridgeId = sw.stp.bridgeId;
    }
    if (typeof sw.stp.rootCost !== 'number') {
        sw.stp.rootCost = 0;
    }
    if (sw.stp.rootPort === undefined) {
        sw.stp.rootPort = null;
    }
    if (!sw.stp.ports || typeof sw.stp.ports !== 'object') {
        sw.stp.ports = {};
    }
}

function getSwitchStpState(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return null;
    ensureSwitchStpState(sw);
    return sw.stp;
}

function getSwitchPortCost(switchOrId, portName) {
    const sw = getSwitchDevice(switchOrId);
    const normPort = normalizeSwitchPortName(portName) || portName || '';
    if (!sw) {
        return normPort.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA;
    }
    ensureSwitchVlanState(sw);
    const cfg = sw.switchports?.[normPort];
    if (cfg && typeof cfg.stpCost === 'number' && cfg.stpCost > 0) {
        return cfg.stpCost;
    }
    return normPort.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA;
}

function setSwitchStpPriority(switchOrId, priority) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchStpState(sw);

    const prio = parseInt(priority, 10);
    if (isNaN(prio) || !VALID_STP_PRIORITIES.has(prio)) {
        throw new Error('Bridge priority must be in increments of 4096 (0, 4096, 8192, ..., 61440).');
    }

    sw.stp.priority = prio;
    sw.stp.bridgeId = formatBridgeId(prio, sw.mac);
    recalculateTopologyStp();
    return sw.stp;
}

function setSwitchPortStpCost(switchOrId, portName, cost) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);

    const c = parseInt(cost, 10);
    if (isNaN(c) || c < 1 || c > 200000000) {
        throw new Error('Path cost must be an integer between 1 and 200000000.');
    }

    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: 'access',
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all'
        };
    }
    sw.switchports[normPort].stpCost = c;
    recalculateTopologyStp();
    return sw.switchports[normPort];
}

function setSwitchPortStpPriority(switchOrId, portName, priority) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);

    const p = parseInt(priority, 10);
    if (isNaN(p) || p < 0 || p > 240 || p % 16 !== 0) {
        throw new Error('Port priority must be a multiple of 16 between 0 and 240.');
    }

    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: 'access',
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all'
        };
    }
    sw.switchports[normPort].stpPortPriority = p;
    recalculateTopologyStp();
    return sw.switchports[normPort];
}

function recalculateTopologyStp() {
    const switches = (networkState.devices || []).filter(d => d && d.type === 'switch');
    if (switches.length === 0) return;

    // 1. Ensure all switches have valid STP base state
    switches.forEach(sw => {
        ensureSwitchStpState(sw);
        sw.stp.bridgeId = formatBridgeId(sw.stp.priority, sw.mac);
        if (!sw.stp.ports) sw.stp.ports = {};
    });

    // 2. Identify switch-to-switch physical connections
    const switchConnections = (networkState.connections || []).filter(conn => {
        const src = getDeviceById(conn.source);
        const tgt = getDeviceById(conn.target);
        return src && tgt && src.type === 'switch' && tgt.type === 'switch';
    });

    const switchMap = new Map();
    switches.forEach(sw => switchMap.set(sw.id, sw));

    const adj = new Map();
    switches.forEach(sw => adj.set(sw.id, []));

    switchConnections.forEach(conn => {
        adj.get(conn.source)?.push({ target: conn.target, connId: conn.id });
        adj.get(conn.target)?.push({ target: conn.source, connId: conn.id });
    });

    // 3. Find connected switch clusters (connected components)
    const visited = new Set();
    const clusters = [];

    switches.forEach(sw => {
        if (!visited.has(sw.id)) {
            const cluster = [];
            const queue = [sw.id];
            visited.add(sw.id);
            while (queue.length > 0) {
                const currId = queue.shift();
                const currSw = switchMap.get(currId);
                if (currSw) cluster.push(currSw);
                const neighbors = adj.get(currId) || [];
                neighbors.forEach(({ target }) => {
                    if (!visited.has(target)) {
                        visited.add(target);
                        queue.push(target);
                    }
                });
            }
            clusters.push(cluster);
        }
    });

    // 4. Process each switch cluster independently
    clusters.forEach(cluster => {
        if (cluster.length === 0) return;

        // Elect Root Bridge: switch with lowest Bridge ID
        const sortedSwitches = [...cluster].sort((a, b) => compareBridgeIds(a.stp.bridgeId, b.stp.bridgeId));
        const rootSw = sortedSwitches[0];

        // Root bridge base state
        rootSw.stp.rootBridgeId = rootSw.stp.bridgeId;
        rootSw.stp.rootCost = 0;
        rootSw.stp.rootPort = null;

        // For all switches in the cluster, calculate shortest path to root
        const dist = new Map();
        const parentInfo = new Map(); // node -> { parentNode, localPortOnNode, remotePortOnParent }
        cluster.forEach(sw => dist.set(sw.id, Infinity));
        dist.set(rootSw.id, 0);

        const unvisited = new Set(cluster.map(sw => sw.id));

        while (unvisited.size > 0) {
            let currId = null;
            let minDist = Infinity;
            unvisited.forEach(id => {
                const d = dist.get(id);
                if (d < minDist) {
                    minDist = d;
                    currId = id;
                }
            });

            if (currId === null || minDist === Infinity) break;
            unvisited.delete(currId);

            const currSw = switchMap.get(currId);
            const neighbors = adj.get(currId) || [];

            neighbors.forEach(({ target, connId }) => {
                const targetSw = switchMap.get(target);
                if (!targetSw) return;

                const localPort = getSwitchPortLabel(targetSw.id, connId);
                const remotePort = getSwitchPortLabel(currSw.id, connId);
                const portCost = getSwitchPortCost(targetSw, localPort);
                const newCost = dist.get(currId) + portCost;
                const oldCost = dist.get(target);

                let isBetter = false;
                if (newCost < oldCost) {
                    isBetter = true;
                } else if (newCost === oldCost && oldCost !== Infinity) {
                    const oldParentInfo = parentInfo.get(target);
                    const oldParentSw = oldParentInfo ? switchMap.get(oldParentInfo.parentNode) : null;
                    if (oldParentSw) {
                        const bidComp = compareBridgeIds(currSw.stp.bridgeId, oldParentSw.stp.bridgeId);
                        if (bidComp < 0) {
                            isBetter = true;
                        } else if (bidComp === 0) {
                            const portComp = remotePort.localeCompare(oldParentInfo.remotePortOnParent, undefined, { numeric: true });
                            if (portComp < 0) {
                                isBetter = true;
                            } else if (portComp === 0) {
                                const localPortComp = localPort.localeCompare(oldParentInfo.localPortOnNode, undefined, { numeric: true });
                                if (localPortComp < 0) {
                                    isBetter = true;
                                }
                            }
                        }
                    }
                }

                if (isBetter) {
                    dist.set(target, newCost);
                    parentInfo.set(target, {
                        parentNode: currId,
                        localPortOnNode: localPort,
                        remotePortOnParent: remotePort
                    });
                }
            });
        }

        // Assign rootBridgeId, rootCost, and rootPort to each switch
        cluster.forEach(sw => {
            sw.stp.rootBridgeId = rootSw.stp.bridgeId;
            if (sw.id === rootSw.id) {
                sw.stp.rootCost = 0;
                sw.stp.rootPort = null;
            } else {
                sw.stp.rootCost = dist.get(sw.id) === Infinity ? 0 : dist.get(sw.id);
                sw.stp.rootPort = parentInfo.get(sw.id)?.localPortOnNode || null;
            }
        });

        // 5. Determine Port Roles & States for every switch in the cluster
        cluster.forEach(sw => {
            const runtime = getSwitchRuntime(sw.id);
            const allPortNames = new Set([
                ...Object.values(runtime.ports || {}),
                ...Object.keys(sw.switchports || {})
            ]);

            allPortNames.forEach(portName => {
                if (sw.stp.rootPort && sw.stp.rootPort === portName) {
                    sw.stp.ports[portName] = {
                        role: 'root',
                        state: 'forwarding',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                const connId = Object.keys(runtime.ports || {}).find(cId => runtime.ports[cId] === portName);
                if (!connId) {
                    sw.stp.ports[portName] = {
                        role: 'disabled',
                        state: 'blocking',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                const conn = getConnectionById(connId);
                if (!conn) {
                    sw.stp.ports[portName] = {
                        role: 'disabled',
                        state: 'blocking',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                const neighborId = conn.source === sw.id ? conn.target : conn.source;
                const neighborDev = getDeviceById(neighborId);

                if (!neighborDev) {
                    sw.stp.ports[portName] = {
                        role: 'disabled',
                        state: 'blocking',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                if (neighborDev.type !== 'switch') {
                    sw.stp.ports[portName] = {
                        role: 'designated',
                        state: 'forwarding',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                const neighborPort = getSwitchPortLabel(neighborDev.id, conn.id);
                ensureSwitchStpState(neighborDev);

                if (neighborDev.stp?.rootPort === neighborPort) {
                    sw.stp.ports[portName] = {
                        role: 'designated',
                        state: 'forwarding',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                    return;
                }

                let localWins = false;
                if (sw.stp.rootCost < neighborDev.stp.rootCost) {
                    localWins = true;
                } else if (sw.stp.rootCost > neighborDev.stp.rootCost) {
                    localWins = false;
                } else {
                    const bidComp = compareBridgeIds(sw.stp.bridgeId, neighborDev.stp.bridgeId);
                    if (bidComp < 0) {
                        localWins = true;
                    } else if (bidComp > 0) {
                        localWins = false;
                    } else {
                        localWins = portName.localeCompare(neighborPort, undefined, { numeric: true }) <= 0;
                    }
                }

                if (localWins) {
                    sw.stp.ports[portName] = {
                        role: 'designated',
                        state: 'forwarding',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                } else {
                    sw.stp.ports[portName] = {
                        role: 'alternate',
                        state: 'blocking',
                        cost: getSwitchPortCost(sw, portName),
                        portPriority: sw.switchports?.[portName]?.stpPortPriority || DEFAULT_PORT_PRIORITY
                    };
                }
            });
        });
    });
}

function ensureSwitchVlanState(sw) {
    if (!sw || sw.type !== 'switch') return;
    ensureSwitchStpState(sw);
    if (!sw.vlans || typeof sw.vlans !== 'object') {
        sw.vlans = {};
    }
    if (!sw.vlans[1]) {
        sw.vlans[1] = {
            id: 1,
            name: 'default',
            status: 'active'
        };
    }
    if (!sw.switchports || typeof sw.switchports !== 'object') {
        sw.switchports = {};
    }
    if (!sw.svis || typeof sw.svis !== 'object') {
        sw.svis = {};
    }
    if (typeof sw.ipRouting !== 'boolean') {
        sw.ipRouting = false;
    }
    if (typeof sw.defaultGateway !== 'string') {
        sw.defaultGateway = '';
    }
}

function getSwitchVlans(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return {};
    ensureSwitchVlanState(sw);
    return sw.vlans;
}

function createSwitchVlan(switchOrId, vlanId, name = '') {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) {
        throw new Error('Switch not found.');
    }
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) {
        throw new Error(`Invalid VLAN ID "${vlanId}". Valid range is 1-4094.`);
    }
    if (sw.vlans[normId]) {
        throw new Error(`VLAN ${normId} already exists.`);
    }
    const vlanName = (name || '').trim() || (normId === 1 ? 'default' : `VLAN${normId}`);
    sw.vlans[normId] = {
        id: normId,
        name: vlanName,
        status: 'active'
    };
    return sw.vlans[normId];
}

function deleteSwitchVlan(switchOrId, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) {
        throw new Error('Switch not found.');
    }
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) {
        throw new Error(`Invalid VLAN ID "${vlanId}". Valid range is 1-4094.`);
    }
    if (normId === 1) {
        throw new Error('Default VLAN 1 cannot be deleted.');
    }
    if (!sw.vlans[normId]) {
        throw new Error(`VLAN ${normId} does not exist.`);
    }

    delete sw.vlans[normId];

    if (sw.svis && sw.svis[normId]) {
        delete sw.svis[normId];
    }

    // Policy: Ports assigned to a deleted VLAN automatically return to VLAN 1
    if (sw.switchports) {
        Object.keys(sw.switchports).forEach((portName) => {
            if (sw.switchports[portName].accessVlan === normId) {
                sw.switchports[portName].accessVlan = 1;
            }
        });
    }

    return true;
}

function renameSwitchVlan(switchOrId, vlanId, newName) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) {
        throw new Error('Switch not found.');
    }
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null || !sw.vlans[normId]) {
        throw new Error(`VLAN ${vlanId} does not exist.`);
    }
    const trimmed = (newName || '').trim();
    if (!trimmed) {
        throw new Error('VLAN name cannot be empty.');
    }
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(trimmed)) {
        throw new Error('Invalid VLAN name. Must be 1-32 alphanumeric characters, dashes, or underscores.');
    }
    sw.vlans[normId].name = trimmed;
    return sw.vlans[normId];
}

function normalizeSwitchPortName(portName) {
    if (!portName || typeof portName !== 'string') return null;
    const trimmed = portName.trim();
    const faMatch = trimmed.match(/^(?:fa|fastethernet|f)\s*0?\/(\d+)$/i);
    if (faMatch) {
        const portNum = parseInt(faMatch[1], 10);
        if (portNum >= 1 && portNum <= 48) {
            return `Fa0/${portNum}`;
        }
        return null;
    }
    const gigMatch = trimmed.match(/^(?:gig|gigabitethernet|g)\s*0?\/(\d+)$/i);
    if (gigMatch) {
        const portNum = parseInt(gigMatch[1], 10);
        if (portNum >= 1 && portNum <= 8) {
            return `Gig0/${portNum}`;
        }
        return null;
    }
    return null;
}

function normalizeRouterInterfaceName(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    const subMatch = trimmed.match(/^(?:gigabitethernet|gig|g)\s*0?\/(\d+)\.(\d+)$/i);
    if (subMatch) {
        const slot = parseInt(subMatch[1], 10);
        const subId = parseInt(subMatch[2], 10);
        if (slot >= 0 && slot <= 8 && subId >= 1 && subId <= 4094) {
            return `Gig0/${slot}.${subId}`;
        }
        return null;
    }
    const faSubMatch = trimmed.match(/^(?:fastethernet|fa|f)\s*0?\/(\d+)\.(\d+)$/i);
    if (faSubMatch) {
        const slot = parseInt(faSubMatch[1], 10);
        const subId = parseInt(faSubMatch[2], 10);
        if (slot >= 0 && slot <= 48 && subId >= 1 && subId <= 4094) {
            return `Fa0/${slot}.${subId}`;
        }
        return null;
    }
    const gigMatch = trimmed.match(/^(?:gigabitethernet|gig|g)\s*0?\/(\d+)$/i);
    if (gigMatch) {
        const slot = parseInt(gigMatch[1], 10);
        if (slot >= 0 && slot <= 8) {
            return `Gig0/${slot}`;
        }
        return null;
    }
    const faMatch = trimmed.match(/^(?:fastethernet|fa|f)\s*0?\/(\d+)$/i);
    if (faMatch) {
        const slot = parseInt(faMatch[1], 10);
        if (slot >= 0 && slot <= 48) {
            return `Fa0/${slot}`;
        }
        return null;
    }
    return null;
}

function isSubinterfaceName(name) {
    return typeof name === 'string' && name.includes('.');
}

function getParentInterfaceName(subinterfaceName) {
    if (!subinterfaceName || typeof subinterfaceName !== 'string') return null;
    const parts = subinterfaceName.split('.');
    return parts[0] || null;
}

function getSubinterfaceId(subinterfaceName) {
    if (!subinterfaceName || typeof subinterfaceName !== 'string') return null;
    const parts = subinterfaceName.split('.');
    if (parts.length < 2) return null;
    const id = parseInt(parts[1], 10);
    return isNaN(id) ? null : id;
}

function ensureRouterSubinterface(routerOrId, subinterfaceName) {
    const r = typeof routerOrId === 'string' ? getDeviceById(routerOrId) : routerOrId;
    if (!r || r.type !== 'router') return null;
    const normName = normalizeRouterInterfaceName(subinterfaceName);
    if (!normName || !isSubinterfaceName(normName)) return null;

    const parentName = getParentInterfaceName(normName);
    if (!r.interfaces || !r.interfaces[parentName]) {
        return null;
    }

    const parentIface = r.interfaces[parentName];
    if (!r.interfaces[normName]) {
        const subId = getSubinterfaceId(normName);
        r.interfaces[normName] = {
            name: normName,
            ip: '',
            subnetMask: '',
            status: 'up',
            mac: parentIface.mac || r.mac || '00:00:00:00:00:00',
            isSubinterface: true,
            parentInterface: parentName,
            subId: subId,
            encapsulation: null,
            vlan: null
        };
    } else {
        if (!r.interfaces[normName].mac) {
            r.interfaces[normName].mac = parentIface.mac || r.mac || '00:00:00:00:00:00';
        }
        r.interfaces[normName].isSubinterface = true;
        r.interfaces[normName].parentInterface = parentName;
    }

    return r.interfaces[normName];
}

function getEffectiveInterfaceStatus(routerOrId, interfaceName) {
    const r = typeof routerOrId === 'string' ? getDeviceById(routerOrId) : routerOrId;
    if (!r || !r.interfaces) return 'down';
    const iface = r.interfaces[interfaceName];
    if (!iface) return 'down';

    if (iface.isSubinterface) {
        const parentName = iface.parentInterface || getParentInterfaceName(interfaceName);
        const parentIface = r.interfaces[parentName];
        if (!parentIface || parentIface.status === 'down') {
            return 'down';
        }
        return iface.status === 'down' ? 'down' : 'up';
    }

    return iface.status === 'down' ? 'down' : 'up';
}

function setRouterSubinterfaceEncapsulation(routerOrId, subinterfaceName, vlanId) {
    const r = typeof routerOrId === 'string' ? getDeviceById(routerOrId) : routerOrId;
    if (!r || r.type !== 'router') {
        throw new Error('Device is not a router.');
    }
    const normName = normalizeRouterInterfaceName(subinterfaceName);
    if (!normName || !isSubinterfaceName(normName)) {
        throw new Error(`Invalid subinterface name "${subinterfaceName}".`);
    }
    const normVlan = normalizeVlanId(vlanId);
    if (normVlan === null) {
        throw new Error(`Invalid VLAN ID "${vlanId}". Valid range is 1-4094.`);
    }

    const subif = ensureRouterSubinterface(r, normName);
    if (!subif) {
        throw new Error(`Parent interface for "${normName}" does not exist.`);
    }

    const parentName = subif.parentInterface;
    for (const [otherName, otherIf] of Object.entries(r.interfaces || {})) {
        if (otherName !== normName && otherIf && otherIf.isSubinterface && otherIf.parentInterface === parentName) {
            if (otherIf.encapsulation === 'dot1q' && otherIf.vlan === normVlan) {
                throw new Error(`VLAN ${normVlan} is already configured on subinterface ${otherName}.`);
            }
        }
    }

    subif.encapsulation = 'dot1q';
    subif.vlan = normVlan;
    return subif;
}

function getSwitchPortConfig(switchOrId, portName) {
    const sw = getSwitchDevice(switchOrId);
    const normPort = normalizeSwitchPortName(portName) || portName;
    if (!sw) {
        return {
            port: normPort,
            name: normPort,
            mode: 'access',
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all',
            stpCost: normPort.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA,
            stpPortPriority: DEFAULT_PORT_PRIORITY
        };
    }
    ensureSwitchVlanState(sw);
    if (!sw.switchports[normPort]) {
        return {
            port: normPort,
            name: normPort,
            mode: 'access',
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all',
            stpCost: normPort.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA,
            stpPortPriority: DEFAULT_PORT_PRIORITY
        };
    }
    const cfg = sw.switchports[normPort];
    return {
        port: cfg.port || cfg.name || normPort,
        name: cfg.name || cfg.port || normPort,
        mode: cfg.mode === 'trunk' ? 'trunk' : 'access',
        accessVlan: cfg.accessVlan || 1,
        nativeVlan: cfg.nativeVlan || 1,
        allowedVlans: cfg.allowedVlans !== undefined ? cfg.allowedVlans : 'all',
        stpCost: typeof cfg.stpCost === 'number' && cfg.stpCost > 0 ? cfg.stpCost : (normPort.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA),
        stpPortPriority: typeof cfg.stpPortPriority === 'number' ? cfg.stpPortPriority : DEFAULT_PORT_PRIORITY
    };
}

function setSwitchPortMode(switchOrId, portName, mode) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);
    const lowerMode = String(mode || '').toLowerCase().trim();
    if (lowerMode !== 'access' && lowerMode !== 'trunk') {
        throw new Error(`Mode "${mode}" is not supported (supported modes: access, trunk).`);
    }
    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: lowerMode,
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all'
        };
    } else {
        sw.switchports[normPort].mode = lowerMode;
        if (lowerMode === 'trunk') {
            if (!sw.switchports[normPort].nativeVlan) {
                sw.switchports[normPort].nativeVlan = 1;
            }
            if (sw.switchports[normPort].allowedVlans === undefined) {
                sw.switchports[normPort].allowedVlans = 'all';
            }
        } else {
            if (!sw.switchports[normPort].accessVlan) {
                sw.switchports[normPort].accessVlan = 1;
            }
        }
    }
    return sw.switchports[normPort];
}

function setSwitchPortAccessVlan(switchOrId, portName, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);
    const normVlan = normalizeVlanId(vlanId);
    if (normVlan === null) {
        throw new Error(`Invalid VLAN ID "${vlanId}". Valid range is 1-4094.`);
    }
    if (!sw.vlans[normVlan]) {
        throw new Error(`VLAN ${normVlan} does not exist on switch ${sw.name}.`);
    }
    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: 'access',
            accessVlan: normVlan,
            nativeVlan: 1,
            allowedVlans: 'all'
        };
    } else {
        sw.switchports[normPort].accessVlan = normVlan;
    }
    return sw.switchports[normPort];
}

function setSwitchPortNativeVlan(switchOrId, portName, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);
    const cfg = getSwitchPortConfig(sw, normPort);
    if (cfg.mode !== 'trunk') {
        throw new Error(`Port ${normPort} is not in trunk mode. Command rejected.`);
    }
    const normVlan = normalizeVlanId(vlanId);
    if (normVlan === null) {
        throw new Error(`Invalid VLAN ID "${vlanId}". Valid range is 1-4094.`);
    }
    if (!sw.vlans[normVlan]) {
        throw new Error(`VLAN ${normVlan} does not exist on switch ${sw.name}. Create VLAN first.`);
    }
    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: 'trunk',
            accessVlan: 1,
            nativeVlan: normVlan,
            allowedVlans: 'all'
        };
    } else {
        sw.switchports[normPort].nativeVlan = normVlan;
    }
    return sw.switchports[normPort];
}

function parseAllowedVlanSpec(spec) {
    if (spec === undefined || spec === null) {
        throw new Error('VLAN specification is required.');
    }
    if (typeof spec === 'string' && spec.trim().toLowerCase() === 'all') {
        return 'all';
    }
    if (Array.isArray(spec)) {
        const set = new Set();
        spec.forEach((item) => {
            const v = normalizeVlanId(item);
            if (v === null) {
                throw new Error(`Invalid VLAN ID "${item}". Valid range is 1-4094.`);
            }
            set.add(v);
        });
        if (set.size === 0) {
            throw new Error('Allowed VLAN list cannot be empty.');
        }
        return Array.from(set).sort((a, b) => a - b);
    }
    const str = String(spec).trim();
    if (!str) {
        throw new Error('Allowed VLAN list cannot be empty.');
    }
    if (str.toLowerCase() === 'all') {
        return 'all';
    }
    const parts = str.split(',');
    const set = new Set();
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) {
            throw new Error(`Malformed VLAN list: "${str}".`);
        }
        if (trimmed.includes('-')) {
            const rangeParts = trimmed.split('-');
            if (rangeParts.length !== 2) {
                throw new Error(`Malformed VLAN range: "${trimmed}".`);
            }
            const start = normalizeVlanId(rangeParts[0]);
            const end = normalizeVlanId(rangeParts[1]);
            if (start === null || end === null || start > end) {
                throw new Error(`Invalid VLAN range: "${trimmed}". Start must be <= End (1-4094).`);
            }
            for (let i = start; i <= end; i++) {
                set.add(i);
            }
        } else {
            const v = normalizeVlanId(trimmed);
            if (v === null) {
                throw new Error(`Invalid VLAN ID "${trimmed}". Valid range is 1-4094.`);
            }
            set.add(v);
        }
    }
    if (set.size === 0) {
        throw new Error('Allowed VLAN list cannot be empty.');
    }
    return Array.from(set).sort((a, b) => a - b);
}

function isVlanAllowedOnTrunk(portConfig, vlanId) {
    if (!portConfig) return false;
    const vId = Number(vlanId);
    if (portConfig.allowedVlans === 'all' || portConfig.allowedVlans === undefined || portConfig.allowedVlans === null) {
        return true;
    }
    if (Array.isArray(portConfig.allowedVlans)) {
        return portConfig.allowedVlans.includes(vId);
    }
    return false;
}

function setSwitchPortAllowedVlans(switchOrId, portName, action = 'set', vlanSpec = 'all') {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) throw new Error(`Invalid switch port "${portName}".`);
    const cfg = getSwitchPortConfig(sw, normPort);
    if (cfg.mode !== 'trunk') {
        throw new Error(`Port ${normPort} is not in trunk mode. Command rejected.`);
    }

    const normAction = String(action || 'set').toLowerCase().trim();
    if (!sw.switchports[normPort]) {
        sw.switchports[normPort] = {
            port: normPort,
            name: normPort,
            mode: 'trunk',
            accessVlan: 1,
            nativeVlan: 1,
            allowedVlans: 'all'
        };
    }

    if (normAction === 'all' || (normAction === 'set' && vlanSpec === 'all')) {
        sw.switchports[normPort].allowedVlans = 'all';
        return sw.switchports[normPort];
    }

    const parsed = parseAllowedVlanSpec(vlanSpec);

    if (normAction === 'set') {
        sw.switchports[normPort].allowedVlans = parsed;
        return sw.switchports[normPort];
    }

    if (normAction === 'add') {
        if (sw.switchports[normPort].allowedVlans === 'all') {
            return sw.switchports[normPort];
        }
        const curList = Array.isArray(sw.switchports[normPort].allowedVlans) ? sw.switchports[normPort].allowedVlans : [];
        const set = new Set([...curList, ...parsed]);
        sw.switchports[normPort].allowedVlans = Array.from(set).sort((a, b) => a - b);
        return sw.switchports[normPort];
    }

    if (normAction === 'remove') {
        if (sw.switchports[normPort].allowedVlans === 'all') {
            const set = new Set();
            for (let i = 1; i <= 4094; i++) {
                set.add(i);
            }
            parsed.forEach(v => set.delete(v));
            sw.switchports[normPort].allowedVlans = Array.from(set).sort((a, b) => a - b);
            return sw.switchports[normPort];
        }
        const curList = Array.isArray(sw.switchports[normPort].allowedVlans) ? sw.switchports[normPort].allowedVlans : [];
        const removeSet = new Set(parsed);
        sw.switchports[normPort].allowedVlans = curList.filter(v => !removeSet.has(v));
        return sw.switchports[normPort];
    }

    if (normAction === 'except') {
        const set = new Set();
        for (let i = 1; i <= 4094; i++) {
            set.add(i);
        }
        parsed.forEach(v => set.delete(v));
        sw.switchports[normPort].allowedVlans = Array.from(set).sort((a, b) => a - b);
        return sw.switchports[normPort];
    }

    throw new Error(`Unsupported action "${action}".`);
}

function formatAllowedVlans(allowed) {
    if (allowed === 'all' || allowed === undefined || allowed === null) {
        return '1-4094';
    }
    if (!Array.isArray(allowed) || allowed.length === 0) {
        return 'none';
    }
    const sorted = [...allowed].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === prev + 1) {
            prev = sorted[i];
        } else {
            ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
            start = sorted[i];
            prev = sorted[i];
        }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    return ranges.join(', ');
}

function classifyFrameIngress(toDevice, ingressPort, frame) {
    const portConfig = getSwitchPortConfig(toDevice, ingressPort);
    const isTrunk = portConfig.mode === 'trunk';
    const isTagged = Boolean(frame?.vlanTag?.isTagged);

    if (!isTrunk) {
        // Access Port
        if (isTagged) {
            return {
                accepted: false,
                reason: `Switch ${toDevice.name} dropped frame on access port ${ingressPort}: received 802.1Q tagged frame (VID ${frame.vlanTag.vlanId}) on access port.`,
                ingressVlan: null
            };
        }
        return {
            accepted: true,
            ingressVlan: portConfig.accessVlan || 1,
            isNativeMismatch: false
        };
    }

    // Trunk Port
    if (isTagged) {
        const tagVlan = frame.vlanTag.vlanId;
        if (!isVlanAllowedOnTrunk(portConfig, tagVlan)) {
            return {
                accepted: false,
                reason: `Switch ${toDevice.name} dropped frame on trunk ${ingressPort}: VLAN ${tagVlan} is not in allowed VLAN list.`,
                ingressVlan: null
            };
        }
        return {
            accepted: true,
            ingressVlan: tagVlan,
            isNativeMismatch: false
        };
    }

    // Untagged frame on Trunk -> classify to native VLAN
    const nativeVlan = portConfig.nativeVlan || 1;
    if (!isVlanAllowedOnTrunk(portConfig, nativeVlan)) {
        return {
            accepted: false,
            reason: `Switch ${toDevice.name} dropped untagged frame on trunk ${ingressPort}: native VLAN ${nativeVlan} is not allowed on trunk.`,
            ingressVlan: null
        };
    }
    return {
        accepted: true,
        ingressVlan: nativeVlan,
        isNativeMismatch: false
    };
}

function getEgressTagAction(portConfig, ingressVlan) {
    if (!portConfig) return { allowed: false, reason: 'Port configuration not found' };
    const isTrunk = portConfig.mode === 'trunk';
    if (!isTrunk) {
        const accessVlan = portConfig.accessVlan || 1;
        if (accessVlan !== ingressVlan) {
            return { allowed: false, reason: `Port is in access VLAN ${accessVlan} (frame is in VLAN ${ingressVlan})` };
        }
        return {
            allowed: true,
            isTagged: false,
            vlanTag: null
        };
    }

    if (!isVlanAllowedOnTrunk(portConfig, ingressVlan)) {
        return { allowed: false, reason: `VLAN ${ingressVlan} is not allowed on trunk` };
    }

    const nativeVlan = portConfig.nativeVlan || 1;
    if (ingressVlan === nativeVlan) {
        return {
            allowed: true,
            isTagged: false,
            vlanTag: null
        };
    }

    return {
        allowed: true,
        isTagged: true,
        vlanTag: {
            vlanId: ingressVlan,
            tpid: '0x8100',
            priority: 0,
            isTagged: true
        }
    };
}

function normalizeSviName(sviName) {
    if (!sviName || typeof sviName !== 'string') return null;
    const match = sviName.trim().match(/^(?:vlan\s*|vl\s*|v\s*)(\d+)$/i);
    if (!match) return null;
    const vlanId = parseInt(match[1], 10);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) return null;
    return `Vlan${normId}`;
}

function isSviName(name) {
    return normalizeSviName(name) !== null;
}

function getSviVlanId(sviName) {
    if (!sviName || typeof sviName !== 'string') return null;
    const match = sviName.trim().match(/^(?:vlan\s*|vl\s*|v\s*)(\d+)$/i);
    if (!match) return null;
    return normalizeVlanId(parseInt(match[1], 10));
}

function ensureSwitchSvi(switchOrId, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return null;
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) return null;

    if (!sw.vlans[normId]) {
        sw.vlans[normId] = {
            id: normId,
            name: normId === 1 ? 'default' : `VLAN${normId}`,
            status: 'active'
        };
    }

    if (!sw.svis[normId]) {
        sw.svis[normId] = {
            id: `Vlan${normId}`,
            vlanId: normId,
            ip: '',
            subnetMask: '',
            mac: sw.mac || generateMacAddress(networkState.devices),
            adminStatus: 'up',
            status: 'down'
        };
    }
    return sw.svis[normId];
}

function deleteSwitchSvi(switchOrId, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return false;
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null || !sw.svis[normId]) return false;
    delete sw.svis[normId];
    return true;
}

function getEffectiveSviStatus(switchOrId, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return 'down';
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) return 'down';

    const svi = sw.svis?.[normId];
    if (!svi) return 'down';
    if (svi.adminStatus === 'down') return 'down';
    if (!sw.vlans[normId]) return 'down';

    // Autostate calculation: SVI is up if at least one switchport carrying this VLAN is connected and up
    const runtime = getSwitchRuntime(sw.id);
    let hasActivePort = false;

    for (const [connectionId, portName] of Object.entries(runtime.ports || {})) {
        const conn = (networkState.connections || []).find(c => c.id === connectionId);
        if (!conn) continue;
        const neighborId = conn.source === sw.id ? conn.target : conn.source;
        const neighbor = getDeviceById(neighborId);
        if (!neighbor) continue;

        const portConfig = getSwitchPortConfig(sw, portName);
        if (portConfig.mode === 'access') {
            if ((portConfig.accessVlan || 1) === normId) {
                hasActivePort = true;
                break;
            }
        } else if (portConfig.mode === 'trunk') {
            if (isVlanAllowedOnTrunk(portConfig, normId)) {
                hasActivePort = true;
                break;
            }
        }
    }

    return hasActivePort ? 'up' : 'down';
}

function setSwitchSviIp(switchOrId, vlanId, ip, subnetMask) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) throw new Error(`Invalid VLAN ID "${vlanId}".`);

    const svi = ensureSwitchSvi(sw, normId);
    if (!svi) throw new Error(`Failed to create SVI for VLAN ${normId}.`);

    const rawIp = String(ip || '').trim();
    const rawMask = String(subnetMask || '').trim();

    if (!rawIp && !rawMask) {
        svi.ip = '';
        svi.subnetMask = '';
        return svi;
    }

    if (!isValidIPv4(rawIp)) {
        throw new Error(`Invalid IPv4 address: "${rawIp}"`);
    }
    const normMask = normalizeSubnetMask(rawMask);
    if (!normMask || !isValidSubnetMask(normMask)) {
        throw new Error(`Invalid subnet mask: "${rawMask}"`);
    }

    for (const [otherVlanStr, otherSvi] of Object.entries(sw.svis || {})) {
        if (Number(otherVlanStr) !== normId && otherSvi && otherSvi.ip === rawIp) {
            throw new Error(`IP address ${rawIp} is already configured on Vlan${otherVlanStr}.`);
        }
    }

    svi.ip = rawIp;
    svi.subnetMask = normMask;
    return svi;
}

function setSwitchSviAdminStatus(switchOrId, vlanId, status) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) throw new Error(`Invalid VLAN ID "${vlanId}".`);
    const svi = ensureSwitchSvi(sw, normId);
    if (!svi) throw new Error(`SVI for VLAN ${normId} not found.`);

    const normStatus = String(status || '').toLowerCase() === 'down' ? 'down' : 'up';
    svi.adminStatus = normStatus;
    return svi;
}

function setSwitchIpRouting(switchOrId, enabled) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    sw.ipRouting = Boolean(enabled);
    return sw.ipRouting;
}

function setSwitchDefaultGateway(switchOrId, gatewayIp) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) throw new Error('Switch not found.');
    ensureSwitchVlanState(sw);
    const raw = String(gatewayIp || '').trim();
    if (!raw) {
        sw.defaultGateway = '';
        return '';
    }
    if (!isValidIPv4(raw)) {
        throw new Error(`Invalid default gateway IP "${raw}".`);
    }
    sw.defaultGateway = raw;
    return sw.defaultGateway;
}

function getSwitchRoutingTable(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return [];
    ensureSwitchVlanState(sw);

    if (!sw.ipRouting) {
        return [];
    }

    const connectedRoutes = [];
    Object.entries(sw.svis || {}).forEach(([vlanIdStr, svi]) => {
        const vlanId = parseInt(vlanIdStr, 10);
        if (!svi || getEffectiveSviStatus(sw, vlanId) === 'down') {
            return;
        }

        const ip = String(svi.ip || '').trim();
        const subnetMask = String(svi.subnetMask || '').trim();

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
            interface: `Vlan${vlanId}`,
            nextHop: null,
            adminDistance: 0,
            metric: 0,
            status: 'active'
        });
    });

    const runtime = getSwitchRuntime(sw.id);
    const configuredStaticRoutes = Array.isArray(runtime.staticRoutes) ? runtime.staticRoutes : [];

    const operationalStaticRoutes = configuredStaticRoutes.map((route) => {
        let operationalStatus = route.status || 'active';

        if (route.interface) {
            const vlanId = getSviVlanId(route.interface);
            if (vlanId && getEffectiveSviStatus(sw, vlanId) === 'down') {
                operationalStatus = 'down';
            }
        }

        if (route.nextHop && operationalStatus !== 'down') {
            let nextHopReachable = false;
            Object.entries(sw.svis || {}).forEach(([vlanIdStr, svi]) => {
                const vlanId = parseInt(vlanIdStr, 10);
                if (!svi || getEffectiveSviStatus(sw, vlanId) === 'down' || !svi.ip || !svi.subnetMask) {
                    return;
                }
                const ifMask = normalizeSubnetMask(svi.subnetMask);
                if (ifMask && isSameSubnet(svi.ip, route.nextHop, ifMask)) {
                    if (!route.interface || route.interface === `Vlan${vlanId}`) {
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

let staticRouteCounter = 0;

function getRouterRuntime(routerId) {
    if (!networkState.routerRuntime) {
        networkState.routerRuntime = {};
    }
    if (!networkState.routerRuntime[routerId]) {
        networkState.routerRuntime[routerId] = {
            ports: {},
            staticRoutes: [],
            acls: {},
            interfaceAcls: {}
        };
    }
    if (!Array.isArray(networkState.routerRuntime[routerId].staticRoutes)) {
        networkState.routerRuntime[routerId].staticRoutes = [];
    }
    if (!networkState.routerRuntime[routerId].acls || typeof networkState.routerRuntime[routerId].acls !== 'object') {
        networkState.routerRuntime[routerId].acls = {};
    }
    if (!networkState.routerRuntime[routerId].interfaceAcls || typeof networkState.routerRuntime[routerId].interfaceAcls !== 'object') {
        networkState.routerRuntime[routerId].interfaceAcls = {};
    }
    return networkState.routerRuntime[routerId];
}

function parseAclAddressSpec(rawIp, rawMaskOrWildcard) {
    const ipStr = String(rawIp || '').trim();
    if (!ipStr || ipStr.toLowerCase() === 'any') {
        return {
            ip: '0.0.0.0',
            wildcard: '255.255.255.255',
            mask: '0.0.0.0',
            isAny: true,
            isHost: false
        };
    }

    if (ipStr.toLowerCase() === 'host' && rawMaskOrWildcard) {
        const hostIp = String(rawMaskOrWildcard).trim();
        if (isValidIPv4(hostIp)) {
            return {
                ip: hostIp,
                wildcard: '0.0.0.0',
                mask: '255.255.255.255',
                isAny: false,
                isHost: true
            };
        }
    }

    if (ipStr.toLowerCase().startsWith('host ')) {
        const hostIp = ipStr.slice(5).trim();
        if (isValidIPv4(hostIp)) {
            return {
                ip: hostIp,
                wildcard: '0.0.0.0',
                mask: '255.255.255.255',
                isAny: false,
                isHost: true
            };
        }
    }

    if (!isValidIPv4(ipStr)) {
        return null;
    }

    const maskOrWildcardStr = String(rawMaskOrWildcard || '').trim();
    if (!maskOrWildcardStr || maskOrWildcardStr === 'host' || maskOrWildcardStr === '0.0.0.0') {
        return {
            ip: ipStr,
            wildcard: '0.0.0.0',
            mask: '255.255.255.255',
            isAny: false,
            isHost: true
        };
    }

    if (maskOrWildcardStr.toLowerCase() === 'any') {
        return {
            ip: '0.0.0.0',
            wildcard: '255.255.255.255',
            mask: '0.0.0.0',
            isAny: true,
            isHost: false
        };
    }

    if (!isValidIPv4(maskOrWildcardStr)) {
        return null;
    }

    const num = ipv4ToInteger(maskOrWildcardStr);
    const isStandardSubnetMask = isValidSubnetMask(maskOrWildcardStr);

    let wildcard = '';
    let mask = '';

    if (isStandardSubnetMask && maskOrWildcardStr !== '0.0.0.0') {
        const wildcardNum = (~num >>> 0) & 0xFFFFFFFF;
        wildcard = integerToIPv4(wildcardNum);
        mask = maskOrWildcardStr;
    } else {
        wildcard = maskOrWildcardStr;
        const maskNum = (~num >>> 0) & 0xFFFFFFFF;
        mask = integerToIPv4(maskNum);
    }

    return {
        ip: ipStr,
        wildcard,
        mask,
        isAny: false,
        isHost: wildcard === '0.0.0.0'
    };
}

function isIpMatchWithWildcard(testIp, targetIp, wildcard) {
    if (!testIp || !targetIp || !wildcard) {
        return false;
    }
    if (!isValidIPv4(testIp) || !isValidIPv4(targetIp) || !isValidIPv4(wildcard)) {
        return false;
    }
    const testNum = ipv4ToInteger(testIp);
    const targetNum = ipv4ToInteger(targetIp);
    const wildcardNum = ipv4ToInteger(wildcard);
    const matchMask = (~wildcardNum >>> 0) & 0xFFFFFFFF;
    return (testNum & matchMask) === (targetNum & matchMask);
}

function getRouterAcls(routerId) {
    const runtime = getRouterRuntime(routerId);
    return runtime.acls || {};
}

function getRouterAcl(routerId, aclId) {
    const acls = getRouterAcls(routerId);
    const key = String(aclId).trim();
    return acls[key] || null;
}

function createRouterAcl(routerId, aclConfig) {
    if (!aclConfig || (typeof aclConfig !== 'object' && typeof aclConfig !== 'string' && typeof aclConfig !== 'number')) {
        return { success: false, reason: 'Invalid ACL configuration.' };
    }

    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const rawId = typeof aclConfig === 'object' ? (aclConfig.id ?? aclConfig.name ?? aclConfig.number) : aclConfig;
    const aclId = String(rawId ?? '').trim();
    if (!aclId) {
        return { success: false, reason: 'ACL ID/name cannot be empty.' };
    }

    const acls = getRouterAcls(router.id);
    if (acls[aclId]) {
        return { success: false, reason: `ACL ${aclId} already exists on router ${router.name}.` };
    }

    let aclType = 'standard';
    if (typeof aclConfig === 'object' && aclConfig.type) {
        const t = String(aclConfig.type).toLowerCase().trim();
        if (t === 'extended' || t === 'ext') {
            aclType = 'extended';
        } else {
            aclType = 'standard';
        }
    } else {
        const numId = parseInt(aclId, 10);
        if (!isNaN(numId)) {
            if ((numId >= 100 && numId <= 199) || (numId >= 2000 && numId <= 2699)) {
                aclType = 'extended';
            } else {
                aclType = 'standard';
            }
        }
    }

    const newAcl = {
        id: aclId,
        name: typeof aclConfig === 'object' && aclConfig.name ? String(aclConfig.name).trim() : aclId,
        type: aclType,
        rules: []
    };

    acls[aclId] = newAcl;
    return { success: true, acl: newAcl };
}

function deleteRouterAcl(routerId, aclId) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const runtime = getRouterRuntime(router.id);
    const key = String(aclId).trim();
    if (!runtime.acls || !runtime.acls[key]) {
        return { success: false, reason: `ACL ${key} does not exist on router ${router.name}.` };
    }

    delete runtime.acls[key];

    if (runtime.interfaceAcls) {
        Object.keys(runtime.interfaceAcls).forEach((ifName) => {
            const ifAcl = runtime.interfaceAcls[ifName];
            if (ifAcl.in === key) delete ifAcl.in;
            if (ifAcl.out === key) delete ifAcl.out;
        });
    }

    return { success: true };
}

function addRouterAclRule(routerId, aclId, ruleData) {
    if (!ruleData || typeof ruleData !== 'object') {
        return { success: false, reason: 'Invalid ACL rule data.' };
    }

    const acl = getRouterAcl(routerId, aclId);
    if (!acl) {
        return { success: false, reason: `ACL ${aclId} not found.` };
    }

    const action = String(ruleData.action || '').toLowerCase().trim();
    if (action !== 'permit' && action !== 'deny') {
        return { success: false, reason: 'Action must be "permit" or "deny".' };
    }

    const rawSrcIp = ruleData.sourceIp ?? ruleData.source?.ip ?? ruleData.source ?? 'any';
    const rawSrcMask = ruleData.sourceWildcard ?? ruleData.sourceMask ?? ruleData.sourceSubnetMask ?? ruleData.source?.wildcard ?? ruleData.source?.mask ?? ruleData.source?.subnetMask ?? ruleData.wildcard ?? ruleData.subnetMask ?? ruleData.mask;
    const parsedSource = parseAclAddressSpec(rawSrcIp, rawSrcMask);
    if (!parsedSource) {
        return { success: false, reason: 'Invalid source address/wildcard specification.' };
    }

    let parsedDestination = null;
    let protocol = 'ip';

    if (acl.type === 'extended') {
        protocol = String(ruleData.protocol || 'ip').toLowerCase().trim();
        const rawDstIp = ruleData.destinationIp ?? ruleData.destination?.ip ?? ruleData.destination ?? ruleData.dest ?? 'any';
        const rawDstMask = ruleData.destinationWildcard ?? ruleData.destinationMask ?? ruleData.destinationSubnetMask ?? ruleData.destSubnetMask ?? ruleData.destWildcard ?? ruleData.destination?.wildcard ?? ruleData.destination?.mask ?? ruleData.destination?.subnetMask ?? ruleData.destMask;
        parsedDestination = parseAclAddressSpec(rawDstIp, rawDstMask);
        if (!parsedDestination) {
            return { success: false, reason: 'Invalid destination address/wildcard specification for extended ACL.' };
        }
    }

    let sequence = typeof ruleData.sequence === 'number' ? ruleData.sequence : parseInt(ruleData.sequence, 10);
    if (isNaN(sequence) || sequence <= 0) {
        const existingSeqs = acl.rules.map((r) => r.sequence);
        const maxSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) : 0;
        sequence = maxSeq + 10;
    }

    if (acl.rules.some((r) => r.sequence === sequence)) {
        return { success: false, reason: `Rule with sequence number ${sequence} already exists in ACL ${aclId}.` };
    }

    const newRule = {
        sequence,
        action,
        protocol,
        source: parsedSource,
        destination: parsedDestination,
        hits: 0
    };

    acl.rules.push(newRule);
    acl.rules.sort((a, b) => a.sequence - b.sequence);

    return { success: true, rule: newRule };
}

function deleteRouterAclRule(routerId, aclId, sequence) {
    const acl = getRouterAcl(routerId, aclId);
    if (!acl) {
        return { success: false, reason: `ACL ${aclId} not found.` };
    }

    const seqNum = typeof sequence === 'number' ? sequence : parseInt(sequence, 10);
    const initialLen = acl.rules.length;
    acl.rules = acl.rules.filter((r) => r.sequence !== seqNum);

    if (acl.rules.length === initialLen) {
        return { success: false, reason: `Rule sequence ${sequence} not found in ACL ${aclId}.` };
    }

    return { success: true };
}

function bindRouterInterfaceAcl(routerId, interfaceName, direction, aclId) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const ifName = String(interfaceName || '').trim();
    if (!router.interfaces || !router.interfaces[ifName]) {
        return { success: false, reason: `Interface ${ifName} does not exist on router ${router.name}.` };
    }

    const dir = String(direction || '').toLowerCase().trim();
    if (dir !== 'in' && dir !== 'out' && dir !== 'inbound' && dir !== 'outbound') {
        return { success: false, reason: 'Direction must be "in" or "out".' };
    }
    const normalizedDir = (dir === 'in' || dir === 'inbound') ? 'in' : 'out';

    const aclKey = String(aclId || '').trim();
    const acl = getRouterAcl(router.id, aclKey);
    if (!acl) {
        return { success: false, reason: `ACL ${aclKey} does not exist on router ${router.name}.` };
    }

    const runtime = getRouterRuntime(router.id);
    if (!runtime.interfaceAcls[ifName]) {
        runtime.interfaceAcls[ifName] = {};
    }
    runtime.interfaceAcls[ifName][normalizedDir] = aclKey;

    return { success: true };
}

function unbindRouterInterfaceAcl(routerId, interfaceName, direction) {
    const router = typeof routerId === 'object' && routerId ? routerId : getDeviceById(routerId);
    if (!router || router.type !== 'router') {
        return { success: false, reason: 'Router not found.' };
    }

    const ifName = String(interfaceName || '').trim();
    const dir = String(direction || '').toLowerCase().trim();
    const normalizedDir = (dir === 'in' || dir === 'inbound') ? 'in' : 'out';

    const runtime = getRouterRuntime(router.id);
    if (runtime.interfaceAcls && runtime.interfaceAcls[ifName] && runtime.interfaceAcls[ifName][normalizedDir]) {
        delete runtime.interfaceAcls[ifName][normalizedDir];
        return { success: true };
    }

    return { success: false, reason: `No ${normalizedDir} ACL bound to interface ${ifName}.` };
}

function getRouterInterfaceAcl(routerId, interfaceName, direction) {
    const runtime = getRouterRuntime(routerId);
    const ifName = String(interfaceName || '').trim();
    const dir = String(direction || '').toLowerCase().trim();
    const normalizedDir = (dir === 'in' || dir === 'inbound') ? 'in' : 'out';
    return runtime.interfaceAcls?.[ifName]?.[normalizedDir] || null;
}

function evaluatePacketAcl(acl, packet) {
    if (!acl || !Array.isArray(acl.rules)) {
        return {
            matched: false,
            action: 'permit',
            rule: null,
            isImplicitDeny: false,
            reason: 'No ACL rules to evaluate'
        };
    }

    const pktSrcIp = packet?.sourceIp || packet?.packet?.sourceIp;
    const pktDstIp = packet?.destinationIp || packet?.packet?.destinationIp;
    const pktProto = String(packet?.protocol || packet?.packet?.protocol || (packet?.icmp ? 'ICMP' : 'IP')).toLowerCase();

    for (const rule of acl.rules) {
        if (acl.type === 'extended' && rule.protocol && rule.protocol !== 'ip') {
            if (rule.protocol !== pktProto) {
                continue;
            }
        }

        if (!rule.source.isAny) {
            if (!isIpMatchWithWildcard(pktSrcIp, rule.source.ip, rule.source.wildcard)) {
                continue;
            }
        }

        if (acl.type === 'extended' && rule.destination && !rule.destination.isAny) {
            if (!isIpMatchWithWildcard(pktDstIp, rule.destination.ip, rule.destination.wildcard)) {
                continue;
            }
        }

        rule.hits = (rule.hits || 0) + 1;
        return {
            matched: true,
            action: rule.action,
            rule,
            isImplicitDeny: false,
            aclId: acl.id,
            reason: `Matched rule ${rule.sequence}: ${rule.action.toUpperCase()}`
        };
    }

    return {
        matched: true,
        action: 'deny',
        rule: null,
        isImplicitDeny: true,
        aclId: acl.id,
        reason: 'Implicit deny (no matching ACL rule)'
    };
}

function evaluateRouterInterfaceAcl(routerId, interfaceName, direction, packet) {
    const aclId = getRouterInterfaceAcl(routerId, interfaceName, direction);
    if (!aclId) {
        return {
            matched: false,
            action: 'permit',
            rule: null,
            isImplicitDeny: false,
            aclId: null,
            reason: `No ACL bound to ${interfaceName} (${direction})`
        };
    }

    const acl = getRouterAcl(routerId, aclId);
    if (!acl) {
        return {
            matched: false,
            action: 'permit',
            rule: null,
            isImplicitDeny: false,
            aclId,
            reason: `Bound ACL ${aclId} not found`
        };
    }

    return evaluatePacketAcl(acl, packet);
}

function addStaticRoute(deviceId, routeData) {
    if (!routeData || typeof routeData !== 'object') {
        return { success: false, reason: 'Invalid route data.' };
    }

    const dev = typeof deviceId === 'object' && deviceId ? deviceId : getDeviceById(deviceId);
    if (!dev || (dev.type !== 'router' && !(dev.type === 'switch' && dev.ipRouting))) {
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

    const isRouter = dev.type === 'router';
    const isSwitch = dev.type === 'switch';

    if (rawInterface) {
        if (isRouter) {
            const iface = dev.interfaces?.[rawInterface];
            if (!iface) {
                return { success: false, reason: `Interface ${rawInterface} does not exist on router ${dev.name}.` };
            }
            if (getEffectiveInterfaceStatus(dev, rawInterface) === 'down') {
                return { success: false, reason: `Interface ${rawInterface} is down.` };
            }
        } else if (isSwitch) {
            const vlanId = getSviVlanId(rawInterface);
            if (!vlanId || !dev.svis?.[vlanId]) {
                return { success: false, reason: `Interface ${rawInterface} does not exist on switch ${dev.name}.` };
            }
            if (getEffectiveSviStatus(dev, vlanId) === 'down') {
                return { success: false, reason: `Interface ${rawInterface} is down.` };
            }
        }
    }

    let resolvedInterface = rawInterface || null;

    if (rawNextHop) {
        if (!isValidIPv4(rawNextHop)) {
            return { success: false, reason: 'Invalid next-hop IPv4 address.' };
        }

        let reachableInterface = null;
        if (isRouter) {
            Object.entries(dev.interfaces || {}).forEach(([ifName, iface]) => {
                if (!iface || getEffectiveInterfaceStatus(dev, ifName) === 'down' || !iface.ip || !iface.subnetMask) {
                    return;
                }
                const ifMask = normalizeSubnetMask(iface.subnetMask);
                if (ifMask && isSameSubnet(iface.ip, rawNextHop, ifMask)) {
                    reachableInterface = ifName;
                }
            });
        } else if (isSwitch) {
            Object.entries(dev.svis || {}).forEach(([vlanIdStr, svi]) => {
                const vlanId = parseInt(vlanIdStr, 10);
                if (!svi || getEffectiveSviStatus(dev, vlanId) === 'down' || !svi.ip || !svi.subnetMask) {
                    return;
                }
                const ifMask = normalizeSubnetMask(svi.subnetMask);
                if (ifMask && isSameSubnet(svi.ip, rawNextHop, ifMask)) {
                    reachableInterface = `Vlan${vlanId}`;
                }
            });
        }
        if (!reachableInterface && !resolvedInterface) {
            return { success: false, reason: 'Next-hop address is unreachable via any active interface.' };
        }
        if (reachableInterface && !resolvedInterface) {
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

    const runtime = isRouter ? getRouterRuntime(dev.id) : getSwitchRuntime(dev.id);
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
    const routeId = routeData.id || `static-route-${dev.id}-${Date.now()}-${staticRouteCounter}`;
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

function removeStaticRoute(deviceId, routeId) {
    const dev = typeof deviceId === 'object' && deviceId ? deviceId : getDeviceById(deviceId);
    if (!dev || (dev.type !== 'router' && !(dev.type === 'switch' && dev.ipRouting))) {
        return { success: false, reason: 'Router not found.' };
    }

    const idToMatch = typeof routeId === 'object' && routeId?.id ? routeId.id : String(routeId || '');
    if (!idToMatch) {
        return { success: false, reason: 'Route ID is required.' };
    }

    const runtime = dev.type === 'router' ? getRouterRuntime(dev.id) : getSwitchRuntime(dev.id);
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
        if (!iface || getEffectiveInterfaceStatus(router, ifName) === 'down') {
            return;
        }

        if (iface.isSubinterface && (!iface.encapsulation || !iface.vlan)) {
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
            if (!iface || getEffectiveInterfaceStatus(router, route.interface) === 'down') {
                operationalStatus = 'down';
            }
        }

        // If route specifies a next-hop IP, verify reachable via an active (UP) interface
        if (route.nextHop && operationalStatus !== 'down') {
            let nextHopReachable = false;
            Object.entries(router.interfaces || {}).forEach(([ifName, iface]) => {
                if (!iface || getEffectiveInterfaceStatus(router, ifName) === 'down' || !iface.ip || !iface.subnetMask) {
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

function lookupRoute(deviceId, destinationIp) {
    const dev = typeof deviceId === 'object' && deviceId ? deviceId : getDeviceById(deviceId);
    if (!dev || (dev.type !== 'router' && !(dev.type === 'switch' && dev.ipRouting))) {
        return { success: false, reason: 'ROUTER_NOT_FOUND' };
    }

    const rawDest = typeof destinationIp === 'string' ? destinationIp.trim() : '';
    if (!rawDest || !isValidIPv4(rawDest)) {
        return { success: false, reason: 'INVALID_DESTINATION' };
    }

    const routingTable = dev.type === 'router' ? getRouterRoutingTable(dev.id) : getSwitchRoutingTable(dev.id);
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

function resolveRouteNextHop(deviceId, route, destinationIp) {
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
        } else if (route.interface) {
            return {
                success: true,
                egressInterface: route.interface,
                nextHopIp: destIp,
                isDirect: true,
                route
            };
        }
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

function getSwitchMacEntry(switchId, mac, vlan = null) {
    const runtime = getSwitchRuntime(switchId);
    const normalized = normalizeMacAddress(mac);
    if (!normalized) {
        return null;
    }
    const targetVlan = vlan !== null && vlan !== undefined ? Number(vlan) : null;
    if (targetVlan !== null) {
        return runtime.macTable.find((entry) => entry.mac === normalized && (Number(entry.vlan) || 1) === targetVlan) || null;
    }
    return runtime.macTable.find((entry) => entry.mac === normalized) || null;
}

function learnSwitchMac(switchId, sourceMac, sourceDeviceId, portLabel, vlan = 1) {
    const sw = getSwitchDevice(switchId);
    if (sw && sw.stp?.ports?.[portLabel]?.state === 'blocking') {
        return null;
    }
    const runtime = getSwitchRuntime(switchId);
    const normalized = normalizeMacAddress(sourceMac);
    if (!normalized) {
        return null;
    }
    const vlanId = Number(vlan) || 1;

    const existing = runtime.macTable.find((entry) => entry.mac === normalized && (Number(entry.vlan) || 1) === vlanId);
    if (existing) {
        existing.port = portLabel;
        existing.deviceId = sourceDeviceId;
        existing.vlan = vlanId;
        existing.learnedAt = new Date().toISOString();
        return existing;
    }

    const entry = {
        vlan: vlanId,
        mac: normalized,
        port: portLabel,
        deviceId: sourceDeviceId,
        type: 'DYNAMIC',
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
            },
            13: {
                code: 13,
                codeName: 'ADMINISTRATIVELY_PROHIBITED',
                description: 'Communication administratively prohibited'
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
            acl: options.acl || null,
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
            const ingressStp = toDevice.stp?.ports?.[ingressPort];
            if (ingressStp && ingressStp.state === 'blocking') {
                frame.events.push(`Switch ${toDevice.name} dropped frame on blocked port ${ingressPort} (STP blocking)`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'DROP',
                    reason: 'stp-blocked',
                    ingressPort,
                    destinationMac: frame.destinationMac
                });
                return {
                    success: false,
                    reason: `Switch ${toDevice.name} dropped frame on blocked port ${ingressPort} (STP blocking).`,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions
                };
            }

            const ingressRes = classifyFrameIngress(toDevice, ingressPort, frame);
            if (!ingressRes.accepted) {
                frame.events.push(ingressRes.reason);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'DROP',
                    reason: 'vlan-isolation',
                    ingressPort,
                    destinationMac: frame.destinationMac
                });
                return {
                    success: false,
                    reason: ingressRes.reason,
                    path: traversedPath,
                    action: 'DROP',
                    hopActions
                };
            }

            const ingressVlan = ingressRes.ingressVlan;
            const ingressPortConfig = getSwitchPortConfig(toDevice, ingressPort);
            if (frame?.vlanTag?.isTagged) {
                frame.events.push(`Frame entered ${toDevice.name} on ${ingressPort} (802.1Q Tag VID: ${frame.vlanTag.vlanId})`);
            } else if (ingressPortConfig.mode === 'trunk') {
                frame.events.push(`Frame entered ${toDevice.name} on trunk ${ingressPort} (untagged → native VLAN ${ingressVlan})`);
            } else {
                frame.events.push(`Frame entered ${toDevice.name} on ${ingressPort} (VLAN ${ingressVlan})`);
            }

            const learnedDevice = findDeviceByMac(frame.sourceMac, null, networkState.devices);
            const learnedDeviceId = learnedDevice?.id || fromEndpoint.id;
            const learnedDeviceName = learnedDevice?.name || fromEndpoint.name;
            learnSwitchMac(toDevice.id, frame.sourceMac, learnedDeviceId, ingressPort, ingressVlan);
            frame.events.push(`Switch ${toDevice.name} learned ${learnedDeviceName} MAC (${frame.sourceMac}) → ${ingressPort} (VLAN ${ingressVlan})`);

            const nextHopId = topologyPath[i + 2];
            const isBroadcast = frame.destinationMac === 'FF:FF:FF:FF:FF:FF';
            const isSwitchMac = frame.destinationMac === toDevice.mac || Object.values(toDevice.svis || {}).some(s => s.mac === frame.destinationMac);

            if (toDevice.id === toEndpoint.id) {
                frame.events.push(`Frame received by destination switch ${toDevice.name} on ${ingressPort} (VLAN ${ingressVlan})`);
                continue;
            }

            if (toDevice.ipRouting && isSwitchMac && frame.packet && frame.packet.destinationIp) {
                // Multilayer Switch Layer-3 Routing Engine
                const ingressSviName = `Vlan${ingressVlan}`;
                const ingressSvi = toDevice.svis?.[ingressVlan];
                if (!ingressSvi || getEffectiveSviStatus(toDevice, ingressVlan) === 'down') {
                    frame.events.push(`Switch ${toDevice.name} dropped frame: Ingress SVI Vlan${ingressVlan} is down or not configured`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'svi-down',
                        ingressPort
                    });
                    return {
                        success: false,
                        reason: `Switch ${toDevice.name} dropped frame: SVI Vlan${ingressVlan} is down.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }

                const routeMatch = lookupRoute(toDevice.id, frame.packet.destinationIp);
                if (!routeMatch || !routeMatch.success || !routeMatch.route) {
                    const icmpError = createIcmpErrorPacket(3, 0, frame.packet, toDevice, {
                        ingressInterface: ingressSviName,
                        reason: 'net-unreachable'
                    });
                    frame.events.push(`Switch ${toDevice.name} dropped packet: No route to destination ${frame.packet.destinationIp}`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'no-route',
                        ingressInterface: ingressSviName,
                        destinationIp: frame.packet.destinationIp,
                        icmpErrorPacket: icmpError || null
                    });
                    return {
                        success: false,
                        reason: `No route to destination from switch ${toDevice.name}.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions,
                        icmpErrorPacket: icmpError || null
                    };
                }

                const nextHopInfo = resolveRouteNextHop(toDevice.id, routeMatch.route, frame.packet.destinationIp);
                if (!nextHopInfo.success) {
                    frame.events.push(`Switch ${toDevice.name} dropped packet: Unable to resolve next hop for ${frame.packet.destinationIp}`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'next-hop-unresolvable',
                        ingressInterface: ingressSviName
                    });
                    return {
                        success: false,
                        reason: `Switch ${toDevice.name} cannot resolve next hop for ${frame.packet.destinationIp}.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }

                const egressIfaceName = nextHopInfo.egressInterface;
                const egressVlan = getSviVlanId(egressIfaceName) || ingressVlan;
                const egressSvi = toDevice.svis?.[egressVlan];

                if (!egressSvi || getEffectiveSviStatus(toDevice, egressVlan) === 'down') {
                    frame.events.push(`Switch ${toDevice.name} dropped frame: Egress SVI Vlan${egressVlan} is down`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'svi-down',
                        ingressInterface: ingressSviName,
                        egressInterface: egressIfaceName
                    });
                    return {
                        success: false,
                        reason: `Switch ${toDevice.name} dropped frame: Egress SVI Vlan${egressVlan} is down.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }

                frame.packet.ttl = Math.max(0, frame.packet.ttl - 1);
                frame.events.push(`Switch ${toDevice.name} decremented IP TTL to ${frame.packet.ttl}`);

                if (frame.packet.ttl <= 0) {
                    const icmpError = createIcmpErrorPacket(11, 0, frame.packet, toDevice, {
                        ingressInterface: ingressSviName,
                        egressInterface: egressIfaceName,
                        reason: 'ttl-expired'
                    });
                    frame.events.push(`Switch ${toDevice.name} dropped packet: Time to Live (TTL) expired in transit`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'ttl-expired',
                        ingressInterface: ingressSviName,
                        egressInterface: egressIfaceName,
                        ttl: 0,
                        icmpErrorPacket: icmpError || null
                    });
                    return {
                        success: false,
                        reason: `Time to Live (TTL) expired at switch ${toDevice.name}.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions,
                        icmpErrorPacket: icmpError || null
                    };
                }

                frame.events.push(`Switch ${toDevice.name} routed frame from ${ingressSviName} to ${egressIfaceName}`);
                frame.sourceMac = egressSvi.mac || toDevice.mac;
                frame.events.push(`Switch ${toDevice.name} rewrote source MAC to ${frame.sourceMac}`);

                // Determine next hop neighbor in topology path
                const nextNeighborId = topologyPath[i + 2];
                let egressPort = nextNeighborId ? getPortForSwitchAndNeighbor(toDevice.id, nextNeighborId) : null;

                // Egress Tag calculation
                const egressPortCfg = getSwitchPortConfig(toDevice, egressPort);
                const egressTag = getEgressTagAction(egressPortCfg, egressVlan);
                if (!egressTag.allowed) {
                    frame.events.push(`Switch ${toDevice.name} dropped frame on ${egressPort}: ${egressTag.reason}`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'vlan-not-allowed',
                        ingressPort,
                        egressPort
                    });
                    return {
                        success: false,
                        reason: `Switch ${toDevice.name} dropped frame on ${egressPort}: ${egressTag.reason}.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }

                if (egressTag.isTagged) {
                    frame.vlanTag = egressTag.vlanTag;
                } else {
                    delete frame.vlanTag;
                }

                // Resolve ARP on egress VLAN
                const arpTargetIp = nextHopInfo.nextHopIp;
                const switchArpResult = simulateArpResolution(toDevice, arpTargetIp, topologyPath.slice(i), {
                    egressInterface: egressIfaceName
                });

                if (!switchArpResult.success) {
                    const icmpError = createIcmpErrorPacket(3, 1, frame.packet, toDevice, {
                        ingressInterface: ingressPort,
                        egressInterface: egressPort,
                        reason: 'host-unreachable'
                    });
                    frame.events.push(...switchArpResult.events);
                    return {
                        success: false,
                        reason: switchArpResult.reason,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions,
                        icmpErrorPacket: icmpError || null
                    };
                }

                frame.destinationMac = switchArpResult.targetMac;
                learnArp(toDevice.id, arpTargetIp, switchArpResult.targetMac, { interface: egressIfaceName });
                if (switchArpResult.requestPacket && switchArpResult.replyPacket && nextNeighborId) {
                    learnArp(nextNeighborId, (egressSvi.ip || toDevice.ip), frame.sourceMac);
                }

                if (egressPort) {
                    learnSwitchMac(toDevice.id, frame.destinationMac, nextNeighborId, egressPort, egressVlan);
                }

                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'switch',
                    action: 'ROUTE',
                    reason: 'l3-routed',
                    ingressPort,
                    egressPort,
                    ingressInterface: ingressSviName,
                    egressInterface: egressIfaceName,
                    egressIface: egressIfaceName,
                    ttl: frame.packet.ttl,
                    newTtl: frame.packet.ttl,
                    destinationMac: frame.destinationMac
                });
            } else {
                const expectedEgressPort = nextHopId ? getPortForSwitchAndNeighbor(toDevice.id, nextHopId) : null;
                const runtime = getSwitchRuntime(toDevice.id);
                const allOtherPorts = Object.values(runtime.ports).filter(p => p !== ingressPort);
                const egressPorts = allOtherPorts.filter(p => {
                    const stpP = toDevice.stp?.ports?.[p];
                    if (stpP && stpP.state === 'blocking') return false;
                    return getEgressTagAction(getSwitchPortConfig(toDevice, p), ingressVlan).allowed;
                });

                // Layer-2 VLAN and STP Egress Check
                if (expectedEgressPort) {
                    const expectedStp = toDevice.stp?.ports?.[expectedEgressPort];
                    if (expectedStp && expectedStp.state === 'blocking') {
                        frame.events.push(`Switch ${toDevice.name} dropped frame: egress port ${expectedEgressPort} is in STP blocking state`);
                        hopActions.push({
                            deviceId: toDevice.id,
                            deviceName: toDevice.name,
                            type: 'switch',
                            action: 'DROP',
                            reason: 'stp-blocked',
                            ingressPort,
                            egressPort: expectedEgressPort,
                            destinationMac: frame.destinationMac
                        });
                        return {
                            success: false,
                            reason: `Switch ${toDevice.name} dropped frame due to STP blocking on port ${expectedEgressPort}.`,
                            path: traversedPath,
                            action: 'DROP',
                            hopActions
                        };
                    }

                    const egressPortConfig = getSwitchPortConfig(toDevice, expectedEgressPort);
                    const egressTagAction = getEgressTagAction(egressPortConfig, ingressVlan);
                    if (!egressTagAction.allowed) {
                        const egressVlanDesc = egressPortConfig.mode === 'trunk' ? `allowed: ${formatAllowedVlans(egressPortConfig.allowedVlans)}` : `VLAN ${egressPortConfig.accessVlan || 1}`;
                        frame.events.push(`Switch ${toDevice.name} dropped frame: ingress port ${ingressPort} (VLAN ${ingressVlan}) and egress port ${expectedEgressPort} (${egressVlanDesc}) are isolated in different VLANs`);
                        hopActions.push({
                            deviceId: toDevice.id,
                            deviceName: toDevice.name,
                            type: 'switch',
                            action: 'DROP',
                            reason: 'vlan-isolation',
                            ingressPort,
                            egressPort: expectedEgressPort,
                            ingressVlan,
                            destinationMac: frame.destinationMac
                        });
                        return {
                            success: false,
                            reason: `Switch ${toDevice.name} dropped frame due to VLAN isolation on port ${expectedEgressPort}.`,
                            path: traversedPath,
                            action: 'DROP',
                            hopActions
                        };
                    }

                    // Apply egress wire tagging / untagging
                    if (egressTagAction.isTagged) {
                        frame.vlanTag = egressTagAction.vlanTag;
                    } else {
                        delete frame.vlanTag;
                    }
                }

                const destEntry = isBroadcast ? null : getSwitchMacEntry(toDevice.id, frame.destinationMac, ingressVlan);

                if (isBroadcast) {
                    frame.events.push(`Switch ${toDevice.name} flooded broadcast frame (FF:FF:FF:FF:FF:FF) on all VLAN ${ingressVlan} ports except ${ingressPort}`);
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
                    frame.events.push(`Destination MAC (${frame.destinationMac}) unknown in VLAN ${ingressVlan} MAC table`);
                    frame.events.push(`Switch ${toDevice.name} flooded unknown unicast frame on all VLAN ${ingressVlan} ports except ${ingressPort}`);
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
                    const destStp = toDevice.stp?.ports?.[destEntry.port];
                    if (destStp && destStp.state === 'blocking') {
                        frame.events.push(`Switch ${toDevice.name} dropped frame: destination port ${destEntry.port} is blocked by STP`);
                        hopActions.push({
                            deviceId: toDevice.id,
                            deviceName: toDevice.name,
                            type: 'switch',
                            action: 'DROP',
                            reason: 'stp-blocked',
                            ingressPort,
                            egressPort: destEntry.port,
                            destinationMac: frame.destinationMac
                        });
                        return {
                            success: false,
                            reason: `Switch ${toDevice.name} dropped frame (destination port ${destEntry.port} is in STP blocking state).`,
                            path: traversedPath,
                            action: 'DROP',
                            hopActions
                        };
                    }
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
            }
        } else if (toDevice.type === 'router') {
            const ingressPort = getPortForRouterAndNeighbor(toDevice.id, fromId);
            let activeIngressIfaceName = ingressPort;
            let activeIngressIface = ingressPort ? toDevice.interfaces?.[ingressPort] : null;

            if (frame.vlanTag && frame.vlanTag.isTagged) {
                const tagVlan = frame.vlanTag.vlanId;
                let matchedSubifName = null;
                if (ingressPort && toDevice.interfaces) {
                    for (const [ifName, iface] of Object.entries(toDevice.interfaces)) {
                        if (iface.isSubinterface && iface.parentInterface === ingressPort && iface.encapsulation === 'dot1q' && iface.vlan === tagVlan) {
                            matchedSubifName = ifName;
                            break;
                        }
                    }
                }
                if (!matchedSubifName) {
                    frame.events.push(`Router ${toDevice.name} dropped tagged frame: No subinterface configured for VLAN ${tagVlan} on ${ingressPort}`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'DROP',
                        reason: 'unmatched-vlan-tag',
                        ingressInterface: ingressPort
                    });
                    return {
                        success: false,
                        reason: `Router ${toDevice.name} dropped frame: No subinterface matching VLAN tag ${tagVlan} on ${ingressPort}.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }
                activeIngressIfaceName = matchedSubifName;
                activeIngressIface = toDevice.interfaces[matchedSubifName];
                if (getEffectiveInterfaceStatus(toDevice, activeIngressIfaceName) === 'down') {
                    frame.events.push(`Router ${toDevice.name} dropped frame: Subinterface ${activeIngressIfaceName} is down`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'DROP',
                        reason: 'interface-down',
                        ingressInterface: activeIngressIfaceName
                    });
                    return {
                        success: false,
                        reason: `Router ${toDevice.name} subinterface ${activeIngressIfaceName} is down.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }
                frame.events.push(`Router ${toDevice.name} de-encapsulated 802.1Q tag VLAN ${tagVlan} on ${activeIngressIfaceName}`);
                delete frame.vlanTag;
            } else {
                if (activeIngressIface && getEffectiveInterfaceStatus(toDevice, activeIngressIfaceName) === 'down') {
                    frame.events.push(`Router ${toDevice.name} dropped frame: Interface ${activeIngressIfaceName} is down`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'DROP',
                        reason: 'interface-down',
                        ingressInterface: activeIngressIfaceName
                    });
                    return {
                        success: false,
                        reason: `Router ${toDevice.name} interface ${activeIngressIfaceName} is down.`,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions
                    };
                }
            }

            if (toDevice.id === toEndpoint.id) {
                frame.events.push(`Frame received by destination router ${toDevice.name} on ${activeIngressIfaceName || 'interface'}`);
                continue;
            }

            frame.events.push(`Frame received by ${toDevice.name} on ${activeIngressIfaceName}`);

            // 1. Inbound ACL Evaluation
            if (activeIngressIfaceName) {
                const inAclResult = evaluateRouterInterfaceAcl(toDevice.id, activeIngressIfaceName, 'in', frame.packet);
                if (inAclResult.matched && inAclResult.action === 'deny') {
                    const ruleSeq = inAclResult.rule?.sequence ?? (inAclResult.isImplicitDeny ? 'implicit' : 'unknown');
                    const logMsg = inAclResult.isImplicitDeny
                        ? `Router ${toDevice.name} dropped packet on ${activeIngressIfaceName} (inbound ACL ${inAclResult.aclId}): Implicit deny`
                        : `Router ${toDevice.name} dropped packet on ${activeIngressIfaceName} (inbound ACL ${inAclResult.aclId} rule ${ruleSeq}): Denied`;
                    const returnReason = inAclResult.isImplicitDeny
                        ? `Packet denied by inbound ACL ${inAclResult.aclId} (implicit deny) at router ${toDevice.name}.`
                        : `Packet denied by inbound ACL ${inAclResult.aclId} rule ${ruleSeq} at router ${toDevice.name}.`;

                    const aclDecision = {
                        aclId: inAclResult.aclId,
                        aclName: inAclResult.aclId,
                        direction: 'inbound',
                        interface: activeIngressIfaceName,
                        action: 'deny',
                        sequence: inAclResult.rule?.sequence ?? null,
                        isImplicitDeny: inAclResult.isImplicitDeny,
                        sourceIp: frame.packet?.sourceIp || null,
                        destinationIp: frame.packet?.destinationIp || null,
                        protocol: frame.packet?.protocol || (frame.packet?.icmp ? 'ICMP' : 'IP'),
                        reason: inAclResult.reason
                    };

                    const icmpError = createIcmpErrorPacket(3, 13, frame.packet, toDevice, {
                        ingressInterface: activeIngressIfaceName,
                        reason: 'administratively-prohibited',
                        acl: aclDecision
                    });

                    frame.events.push(logMsg);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'DROP',
                        reason: 'acl-deny',
                        ingressInterface: activeIngressIfaceName,
                        destinationIp: frame.packet.destinationIp,
                        acl: aclDecision,
                        icmpErrorPacket: icmpError || null
                    });
                    return {
                        success: false,
                        reason: returnReason,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions,
                        acl: aclDecision,
                        icmpErrorPacket: icmpError || null
                    };
                } else if (inAclResult.matched && inAclResult.action === 'permit') {
                    frame.events.push(`Router ${toDevice.name} permitted packet on ${activeIngressIfaceName} (inbound ACL ${inAclResult.aclId} rule ${inAclResult.rule?.sequence})`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'ACL_EVALUATE',
                        reason: 'acl-permit',
                        ingressInterface: activeIngressIfaceName,
                        acl: {
                            aclId: inAclResult.aclId,
                            aclName: inAclResult.aclId,
                            direction: 'inbound',
                            interface: activeIngressIfaceName,
                            action: 'permit',
                            sequence: inAclResult.rule?.sequence ?? null,
                            isImplicitDeny: false,
                            sourceIp: frame.packet?.sourceIp || null,
                            destinationIp: frame.packet?.destinationIp || null,
                            protocol: frame.packet?.protocol || (frame.packet?.icmp ? 'ICMP' : 'IP'),
                            reason: inAclResult.reason
                        }
                    });
                }
            }

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
                    ingressInterface: activeIngressIfaceName,
                    reason: dropReason
                });

                frame.events.push(logMsg);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: dropReason,
                    ingressInterface: activeIngressIfaceName,
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

            if (!activeIngressIfaceName || !egressPort || !activeIngressIface || !egressIface) {
                frame.events.push(`Router ${toDevice.name} could not resolve routing interfaces`);
                hopActions.push({
                    deviceId: toDevice.id,
                    deviceName: toDevice.name,
                    type: 'router',
                    action: 'DROP',
                    reason: 'interface-error',
                    ingressInterface: activeIngressIfaceName,
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

            if (getEffectiveInterfaceStatus(toDevice, egressPort) === 'down') {
                const icmpError = createIcmpErrorPacket(3, 1, frame.packet, toDevice, {
                    ingressInterface: activeIngressIfaceName,
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
                    ingressInterface: activeIngressIfaceName,
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

            // 2. Outbound ACL Evaluation
            if (egressPort) {
                const outAclResult = evaluateRouterInterfaceAcl(toDevice.id, egressPort, 'out', frame.packet);
                if (outAclResult.matched && outAclResult.action === 'deny') {
                    const ruleSeq = outAclResult.rule?.sequence ?? (outAclResult.isImplicitDeny ? 'implicit' : 'unknown');
                    const logMsg = outAclResult.isImplicitDeny
                        ? `Router ${toDevice.name} dropped packet on ${egressPort} (outbound ACL ${outAclResult.aclId}): Implicit deny`
                        : `Router ${toDevice.name} dropped packet on ${egressPort} (outbound ACL ${outAclResult.aclId} rule ${ruleSeq}): Denied`;
                    const returnReason = outAclResult.isImplicitDeny
                        ? `Packet denied by outbound ACL ${outAclResult.aclId} (implicit deny) at router ${toDevice.name}.`
                        : `Packet denied by outbound ACL ${outAclResult.aclId} rule ${ruleSeq} at router ${toDevice.name}.`;

                    const aclDecision = {
                        aclId: outAclResult.aclId,
                        aclName: outAclResult.aclId,
                        direction: 'outbound',
                        interface: egressPort,
                        action: 'deny',
                        sequence: outAclResult.rule?.sequence ?? null,
                        isImplicitDeny: outAclResult.isImplicitDeny,
                        sourceIp: frame.packet?.sourceIp || null,
                        destinationIp: frame.packet?.destinationIp || null,
                        protocol: frame.packet?.protocol || (frame.packet?.icmp ? 'ICMP' : 'IP'),
                        reason: outAclResult.reason
                    };

                    const icmpError = createIcmpErrorPacket(3, 13, frame.packet, toDevice, {
                        ingressInterface: activeIngressIfaceName,
                        egressInterface: egressPort,
                        reason: 'administratively-prohibited',
                        acl: aclDecision
                    });

                    frame.events.push(logMsg);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'DROP',
                        reason: 'acl-deny',
                        ingressInterface: activeIngressIfaceName,
                        egressInterface: egressPort,
                        destinationIp: frame.packet.destinationIp,
                        acl: aclDecision,
                        icmpErrorPacket: icmpError || null
                    });
                    return {
                        success: false,
                        reason: returnReason,
                        path: traversedPath,
                        action: 'DROP',
                        hopActions,
                        acl: aclDecision,
                        icmpErrorPacket: icmpError || null
                    };
                } else if (outAclResult.matched && outAclResult.action === 'permit') {
                    frame.events.push(`Router ${toDevice.name} permitted packet on ${egressPort} (outbound ACL ${outAclResult.aclId} rule ${outAclResult.rule?.sequence})`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'router',
                        action: 'ACL_EVALUATE',
                        reason: 'acl-permit',
                        egressInterface: egressPort,
                        acl: {
                            aclId: outAclResult.aclId,
                            aclName: outAclResult.aclId,
                            direction: 'outbound',
                            interface: egressPort,
                            action: 'permit',
                            sequence: outAclResult.rule?.sequence ?? null,
                            isImplicitDeny: false,
                            sourceIp: frame.packet?.sourceIp || null,
                            destinationIp: frame.packet?.destinationIp || null,
                            protocol: frame.packet?.protocol || (frame.packet?.icmp ? 'ICMP' : 'IP'),
                            reason: outAclResult.reason
                        }
                    });
                }
            }

            frame.packet.ttl = Math.max(0, frame.packet.ttl - 1);
            frame.events.push(`Router ${toDevice.name} decremented IP TTL to ${frame.packet.ttl}`);

            if (frame.packet.ttl <= 0) {
                const icmpError = createIcmpErrorPacket(11, 0, frame.packet, toDevice, {
                    ingressInterface: activeIngressIfaceName,
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
                    ingressInterface: activeIngressIfaceName,
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

            frame.events.push(`Router ${toDevice.name} routed frame from ${activeIngressIfaceName} to ${egressPort}`);
            frame.sourceMac = egressIface.mac;
            frame.events.push(`Router ${toDevice.name} rewrote source MAC to ${egressIface.mac}`);

            if (egressIface && egressIface.isSubinterface && egressIface.encapsulation === 'dot1q' && egressIface.vlan) {
                frame.vlanTag = {
                    vlanId: egressIface.vlan,
                    tpid: '0x8100',
                    priority: 0,
                    isTagged: true
                };
                frame.events.push(`Router ${toDevice.name} encapsulated 802.1Q tag VLAN ${egressIface.vlan} on ${egressPort}`);
            } else {
                delete frame.vlanTag;
            }

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
    } else if (requesterDevice.type === 'switch') {
        if (requesterInterfaceName && isSviName(requesterInterfaceName)) {
            const vlanId = getSviVlanId(requesterInterfaceName);
            const svi = requesterDevice.svis?.[vlanId];
            if (svi) {
                reqIp = svi.ip;
                reqMac = svi.mac || requesterDevice.mac;
                reqMask = normalizeSubnetMask(svi.subnetMask);
            }
        } else if (requesterDevice.svis) {
            for (const [vlanIdStr, svi] of Object.entries(requesterDevice.svis)) {
                const vlanId = parseInt(vlanIdStr, 10);
                if (getEffectiveSviStatus(requesterDevice, vlanId) !== 'down' && svi.ip) {
                    const ifMask = normalizeSubnetMask(svi.subnetMask);
                    if (ifMask && isSameSubnet(svi.ip, targetIp, ifMask)) {
                        reqIp = svi.ip;
                        reqMac = svi.mac || requesterDevice.mac;
                        reqMask = ifMask;
                        requesterInterfaceName = `Vlan${vlanId}`;
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
                    if (iface.ip === targetIp && getEffectiveInterfaceStatus(dev, ifName) !== 'down') {
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
        } else if (dev.type === 'switch' && dev.svis) {
            for (const [vlanIdStr, svi] of Object.entries(dev.svis)) {
                const vlanId = parseInt(vlanIdStr, 10);
                if (svi.ip === targetIp && getEffectiveSviStatus(dev, vlanId) !== 'down') {
                    const ifMask = normalizeSubnetMask(svi.subnetMask);
                    if (reqMask && ifMask && isSameSubnet(reqIp, svi.ip, reqMask)) {
                        targetDevice = dev;
                        targetInterfaceName = `Vlan${vlanId}`;
                        targetMac = svi.mac || dev.mac;
                        break;
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

    // Determine initial VLAN of requester
    let currentVlan = 1;
    let currentTagged = false;
    if (requesterDevice.type === 'router' && options.egressInterface) {
        const egressIface = requesterDevice.interfaces?.[options.egressInterface];
        if (egressIface && egressIface.isSubinterface && egressIface.encapsulation === 'dot1q' && egressIface.vlan) {
            currentVlan = egressIface.vlan;
            currentTagged = true;
        }
    } else if (requesterDevice.type === 'switch' && options.egressInterface && isSviName(options.egressInterface)) {
        currentVlan = getSviVlanId(options.egressInterface) || 1;
        const firstNeighborId = arpPath[1];
        if (firstNeighborId) {
            const outPort = getPortForSwitchAndNeighbor(requesterDevice.id, firstNeighborId);
            if (outPort) {
                const cfg = getSwitchPortConfig(requesterDevice, outPort);
                const tagAction = getEgressTagAction(cfg, currentVlan);
                currentTagged = tagAction.isTagged;
            }
        }
    } else {
        const firstSwitchId = arpPath.find(id => getDeviceById(id)?.type === 'switch');
        if (firstSwitchId) {
            const firstPort = getPortForSwitchAndNeighbor(firstSwitchId, requesterDevice.id);
            if (firstPort) {
                const cfg = getSwitchPortConfig(firstSwitchId, firstPort);
                currentVlan = cfg.mode === 'trunk' ? (cfg.nativeVlan || 1) : (cfg.accessVlan || 1);
            }
        }
    }

    // Traverse forward path (ARP Request Broadcast)
    for (let i = 0; i < arpPath.length - 1; i++) {
        const fromId = arpPath[i];
        const toId = arpPath[i + 1];
        const fromDevice = getDeviceById(fromId);
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
            const ingressStp = toDevice.stp?.ports?.[ingressPort];
            if (ingressStp && ingressStp.state === 'blocking') {
                events.push(`Switch ${toDevice.name} dropped ARP request: received on blocked port ${ingressPort}`);
                return {
                    success: false,
                    reason: `ARP resolution failed: Switch ${toDevice.name} dropped frame on blocked port ${ingressPort}.`,
                    path: arpPath.slice(0, i + 1),
                    events,
                    hopActions
                };
            }

            const ingressPortConfig = getSwitchPortConfig(toDevice, ingressPort);

            if (fromDevice && fromDevice.type === 'switch') {
                const fromEgressPort = getPortForSwitchAndNeighbor(fromDevice.id, toDevice.id);
                if (fromEgressPort) {
                    const fromCfg = getSwitchPortConfig(fromDevice, fromEgressPort);
                    const tagAction = getEgressTagAction(fromCfg, currentVlan);
                    currentTagged = tagAction.isTagged;
                }
            }

            let ingressVlan;
            if (ingressPortConfig.mode === 'access') {
                if (currentTagged) {
                    events.push(`Switch ${toDevice.name} dropped ARP request: received tagged frame on access port ${ingressPort}`);
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} dropped tagged frame on access port ${ingressPort}.`,
                        path: arpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
                ingressVlan = ingressPortConfig.accessVlan || 1;
            } else {
                if (currentTagged) {
                    ingressVlan = currentVlan;
                } else {
                    ingressVlan = ingressPortConfig.nativeVlan || 1;
                }
                if (!isVlanAllowedOnTrunk(ingressPortConfig, ingressVlan)) {
                    events.push(`Switch ${toDevice.name} dropped ARP request: VLAN ${ingressVlan} not allowed on trunk ${ingressPort}`);
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} blocked ARP request on trunk ${ingressPort}.`,
                        path: arpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
            }

            learnSwitchMac(toDevice.id, reqMac, requesterDevice.id, ingressPort, ingressVlan);
            events.push(`Switch ${toDevice.name} learned ${requesterDevice.name} MAC (${reqMac}) → ${ingressPort} (VLAN ${ingressVlan})`);

            // Check if next hop port is in same VLAN / allowed on trunk / not blocked by STP
            const nextHopId = arpPath[i + 2];
            const nextPort = nextHopId ? getPortForSwitchAndNeighbor(toDevice.id, nextHopId) : null;
            if (nextPort) {
                const nextStp = toDevice.stp?.ports?.[nextPort];
                if (nextStp && nextStp.state === 'blocking') {
                    events.push(`Switch ${toDevice.name} dropped broadcast frame: destination port ${nextPort} is blocked by STP`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'stp-blocked',
                        ingressPort,
                        egressPort: nextPort,
                        ingressVlan,
                        destinationMac: 'FF:FF:FF:FF:FF:FF'
                    });
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} blocked ARP request on port ${nextPort} (STP blocking).`,
                        path: arpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }

                const nextPortConfig = getSwitchPortConfig(toDevice, nextPort);
                const egressAction = getEgressTagAction(nextPortConfig, ingressVlan);
                if (!egressAction.allowed) {
                    const nextVlan = nextPortConfig.mode === 'trunk' ? (nextPortConfig.nativeVlan || 1) : (nextPortConfig.accessVlan || 1);
                    const egressDesc = nextPortConfig.mode === 'trunk' ? `allowed: ${formatAllowedVlans(nextPortConfig.allowedVlans)}` : `VLAN ${nextPortConfig.accessVlan || 1}`;
                    events.push(`Switch ${toDevice.name} dropped broadcast frame: ingress port ${ingressPort} (VLAN ${ingressVlan}) and destination port ${nextPort} (${egressDesc}) are isolated`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'vlan-isolation',
                        ingressPort,
                        egressPort: nextPort,
                        ingressVlan,
                        egressVlan: nextVlan,
                        destinationMac: 'FF:FF:FF:FF:FF:FF'
                    });
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} isolated broadcast between VLAN ${ingressVlan} and VLAN ${nextVlan}.`,
                        path: arpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
                currentVlan = ingressVlan;
                currentTagged = egressAction.isTagged;
            }

            events.push(`Switch ${toDevice.name} flooded broadcast frame (FF:FF:FF:FF:FF:FF) on all ports except ${ingressPort}`);
            const runtime = getSwitchRuntime(toDevice.id);
            const egressPorts = Object.values(runtime.ports).filter(p => {
                if (p === ingressPort) return false;
                const stpP = toDevice.stp?.ports?.[p];
                if (stpP && stpP.state === 'blocking') return false;
                return getEgressTagAction(getSwitchPortConfig(toDevice, p), ingressVlan).allowed;
            });
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

    // Determine initial VLAN of target for reverse path
    // Traverse reverse path (ARP Reply Unicast)
    const reverseArpPath = [...arpPath].reverse();

    let replyVlan = 1;
    let replyTagged = false;
    if (targetDevice.type === 'router' && targetInterfaceName) {
        const targetIface = targetDevice.interfaces?.[targetInterfaceName];
        if (targetIface && targetIface.isSubinterface && targetIface.encapsulation === 'dot1q' && targetIface.vlan) {
            replyVlan = targetIface.vlan;
            replyTagged = true;
        }
    } else if (targetDevice.type === 'switch' && targetInterfaceName && isSviName(targetInterfaceName)) {
        replyVlan = getSviVlanId(targetInterfaceName) || 1;
        const nextNeighborId = reverseArpPath[1];
        if (nextNeighborId) {
            const outPort = getPortForSwitchAndNeighbor(targetDevice.id, nextNeighborId);
            if (outPort) {
                const cfg = getSwitchPortConfig(targetDevice, outPort);
                const tagAction = getEgressTagAction(cfg, replyVlan);
                replyTagged = tagAction.isTagged;
            }
        }
    } else {
        const lastSwitchId = [...arpPath].reverse().find(id => getDeviceById(id)?.type === 'switch');
        if (lastSwitchId) {
            const lastPort = getPortForSwitchAndNeighbor(lastSwitchId, targetDevice.id);
            if (lastPort) {
                const cfg = getSwitchPortConfig(lastSwitchId, lastPort);
                replyVlan = cfg.mode === 'trunk' ? (cfg.nativeVlan || 1) : (cfg.accessVlan || 1);
            }
        }
    }

    for (let i = 0; i < reverseArpPath.length - 1; i++) {
        const fromId = reverseArpPath[i];
        const toId = reverseArpPath[i + 1];
        const fromDevice = getDeviceById(fromId);
        const toDevice = getDeviceById(toId);

        if (toDevice && toDevice.type === 'switch') {
            const ingressPort = getPortForSwitchAndNeighbor(toDevice.id, fromId);
            const ingressPortConfig = getSwitchPortConfig(toDevice, ingressPort);

            if (fromDevice && fromDevice.type === 'switch') {
                const fromEgressPort = getPortForSwitchAndNeighbor(fromDevice.id, toDevice.id);
                if (fromEgressPort) {
                    const fromCfg = getSwitchPortConfig(fromDevice, fromEgressPort);
                    const tagAction = getEgressTagAction(fromCfg, replyVlan);
                    replyTagged = tagAction.isTagged;
                }
            }

            let ingressVlan;
            if (ingressPortConfig.mode === 'access') {
                if (replyTagged) {
                    events.push(`Switch ${toDevice.name} dropped ARP reply: received tagged frame on access port ${ingressPort}`);
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} dropped tagged frame on access port ${ingressPort}.`,
                        path: reverseArpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
                ingressVlan = ingressPortConfig.accessVlan || 1;
            } else {
                if (replyTagged) {
                    ingressVlan = replyVlan;
                } else {
                    ingressVlan = ingressPortConfig.nativeVlan || 1;
                }
                if (!isVlanAllowedOnTrunk(ingressPortConfig, ingressVlan)) {
                    events.push(`Switch ${toDevice.name} dropped ARP reply: VLAN ${ingressVlan} not allowed on trunk ${ingressPort}`);
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} blocked ARP reply on trunk ${ingressPort}.`,
                        path: reverseArpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
            }

            learnSwitchMac(toDevice.id, targetMac, targetDevice.id, ingressPort, ingressVlan);
            events.push(`Switch ${toDevice.name} learned ${targetDevice.name} MAC (${targetMac}) → ${ingressPort} (VLAN ${ingressVlan})`);

            // Next hop VLAN check
            const nextHopId = reverseArpPath[i + 2];
            const nextPort = nextHopId ? getPortForSwitchAndNeighbor(toDevice.id, nextHopId) : null;
            if (nextPort) {
                const nextPortConfig = getSwitchPortConfig(toDevice, nextPort);
                const egressAction = getEgressTagAction(nextPortConfig, ingressVlan);
                if (!egressAction.allowed) {
                    const nextVlan = nextPortConfig.mode === 'trunk' ? (nextPortConfig.nativeVlan || 1) : (nextPortConfig.accessVlan || 1);
                    const egressDesc = nextPortConfig.mode === 'trunk' ? `allowed: ${formatAllowedVlans(nextPortConfig.allowedVlans)}` : `VLAN ${nextPortConfig.accessVlan || 1}`;
                    events.push(`Switch ${toDevice.name} dropped ARP reply: ports ${ingressPort} (VLAN ${ingressVlan}) and ${nextPort} (${egressDesc}) are isolated`);
                    hopActions.push({
                        deviceId: toDevice.id,
                        deviceName: toDevice.name,
                        type: 'switch',
                        action: 'DROP',
                        reason: 'vlan-isolation',
                        ingressPort,
                        egressPort: nextPort,
                        ingressVlan,
                        egressVlan: nextVlan,
                        destinationMac: reqMac
                    });
                    return {
                        success: false,
                        reason: `ARP resolution failed: Switch ${toDevice.name} isolated ARP reply between VLAN ${ingressVlan} and VLAN ${nextVlan}.`,
                        path: reverseArpPath.slice(0, i + 1),
                        events,
                        hopActions
                    };
                }
                replyVlan = ingressVlan;
                replyTagged = egressAction.isTagged;
            }

            const destEntry = getSwitchMacEntry(toDevice.id, reqMac, ingressVlan);
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
                const egressPorts = Object.values(runtime.ports).filter(p => p !== ingressPort && getEgressTagAction(getSwitchPortConfig(toDevice, p), ingressVlan).allowed);
                events.push(`Switch ${toDevice.name} flooded ARP Reply on VLAN ${ingressVlan} ports except ${ingressPort}`);
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
    const normalizedMaskA = normalizeSubnetMask(sourceDevice.subnetMask);
    const normalizedMaskB = normalizeSubnetMask(destinationDevice.subnetMask);
    const sameSubnet = normalizedMaskA && normalizedMaskB && normalizedMaskA === normalizedMaskB
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskA)
        && isSameSubnet(sourceDevice.ip, destinationDevice.ip, normalizedMaskB);

    let topologyPath = null;
    if (sameSubnet) {
        topologyPath = findTopologyPath(sourceDevice.id, destinationDevice.id);
    } else {
        const l3Path = findL3RoutedTopologyPath(sourceDevice, destinationDevice);
        topologyPath = (l3Path && l3Path.length >= 2) ? l3Path : findTopologyPath(sourceDevice.id, destinationDevice.id);
    }

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

        const firstL3Id = topologyPath.find((id) => {
            const d = getDeviceById(id);
            return d?.type === 'router' || (d?.type === 'switch' && d.ipRouting);
        });
        if (firstL3Id) {
            const firstL3Dev = getDeviceById(firstL3Id);
            if (firstL3Dev.type === 'router') {
                const firstRouterIdx = topologyPath.indexOf(firstL3Id);
                const prevHopId = topologyPath[firstRouterIdx - 1];
                const ingressPort = getPortForRouterAndNeighbor(firstL3Dev.id, prevHopId);
                let ingressIface = firstL3Dev.interfaces?.[ingressPort];
                if ((!ingressIface || !ingressIface.ip || ingressIface.ip !== sourceDevice.gateway) && firstL3Dev.interfaces) {
                    for (const [, iface] of Object.entries(firstL3Dev.interfaces)) {
                        if (iface.isSubinterface && iface.parentInterface === ingressPort && iface.ip === sourceDevice.gateway) {
                            ingressIface = iface;
                            break;
                        }
                    }
                }
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
            } else if (firstL3Dev.type === 'switch') {
                const gatewaySvi = Object.values(firstL3Dev.svis || {}).find(s => s && s.ip === sourceDevice.gateway);
                if (!gatewaySvi) {
                    return {
                        success: false,
                        reason: `Source default gateway (${sourceDevice.gateway}) does not match any SVI IP on switch ${firstL3Dev.name}.`,
                        path: [topologyPath[0]],
                        action: 'DROP',
                        events: [`Source default gateway (${sourceDevice.gateway}) does not match any SVI IP on switch ${firstL3Dev.name}.`],
                        hopActions: []
                    };
                }
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
            acl: forwardResult.acl || null,
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
            acl: forwardResult.acl || null,
            icmpErrorPacket: null
        };
    }

    // ICMP Echo Request delivered -> Generate ICMP Echo Reply & traverse reverse path
    frame.events.push(`${destinationDevice.name} received ICMP Echo Request`);
    frame.events.push(`${destinationDevice.name} generated ICMP Echo Reply to ${sourceDevice.name}`);

    const reverseTopologyPath = [...topologyPath].reverse();
    let reverseInitialDestMac = sourceDevice.mac;

    if (!sameSubnet) {
        const revFirstL3Index = reverseTopologyPath.findIndex((id) => {
            const d = getDeviceById(id);
            return d?.type === 'router' || (d?.type === 'switch' && d.ipRouting);
        });
        if (revFirstL3Index !== -1) {
            const revL3Dev = getDeviceById(reverseTopologyPath[revFirstL3Index]);
            if (revL3Dev.type === 'router') {
                const revPrevHopId = reverseTopologyPath[revFirstL3Index - 1];
                const revIngressPort = getPortForRouterAndNeighbor(revL3Dev.id, revPrevHopId);
                let revIngressIface = revL3Dev?.interfaces?.[revIngressPort];
                if ((!revIngressIface || !revIngressIface.mac) && revL3Dev.interfaces) {
                    for (const [, iface] of Object.entries(revL3Dev.interfaces)) {
                        if (iface.isSubinterface && iface.parentInterface === revIngressPort) {
                            revIngressIface = iface;
                            break;
                        }
                    }
                }
                if (revIngressIface && revIngressIface.mac) {
                    reverseInitialDestMac = revIngressIface.mac;
                }
            } else if (revL3Dev.type === 'switch') {
                reverseInitialDestMac = revL3Dev.mac;
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

    let replyInitialVlanTag = null;
    const revDestDev = getDeviceById(destinationDevice.id) || destinationDevice;
    if (revDestDev.type === 'switch' && reverseTopologyPath.length >= 2) {
        let sviVlanId = 1;
        for (const [vlanIdStr, svi] of Object.entries(revDestDev.svis || {})) {
            if (svi && (svi.ip === destinationDevice.ip || svi.ip === revDestDev.ip)) {
                sviVlanId = parseInt(vlanIdStr, 10);
                break;
            }
        }
        const outPort = getPortForSwitchAndNeighbor(revDestDev.id, reverseTopologyPath[1]);
        if (outPort) {
            const outCfg = getSwitchPortConfig(revDestDev, outPort);
            const tagAction = getEgressTagAction(outCfg, sviVlanId);
            if (tagAction.isTagged) {
                replyInitialVlanTag = tagAction.vlanTag;
            }
        }
    } else if (revDestDev.type === 'router') {
        for (const [, iface] of Object.entries(revDestDev.interfaces || {})) {
            if (iface && (iface.ip === destinationDevice.ip || iface.ip === revDestDev.ip) && iface.isSubinterface && iface.encapsulation === 'dot1q' && iface.vlan) {
                replyInitialVlanTag = { vlanId: iface.vlan, isTagged: true };
                break;
            }
        }
    }

    const replyFrame = {
        sourceDeviceId: destinationDevice.id,
        destinationDeviceId: sourceDevice.id,
        sourceMac: destinationDevice.mac,
        destinationMac: reverseInitialDestMac,
        etherType: 'IPv4',
        packet: replyPacket,
        path: reverseTopologyPath,
        events: [...frame.events],
        agingTimeSeconds: options?.agingTimeSeconds,
        now: options?.now
    };

    if (replyInitialVlanTag) {
        replyFrame.vlanTag = replyInitialVlanTag;
    }

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
            arpResult,
            acl: reverseResult.acl || forwardResult.acl || null,
            icmpErrorPacket: reverseResult.icmpErrorPacket || null
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
        acl: forwardResult.acl || reverseResult.acl || null,
        icmpErrorPacket: null
    };
}

function simulateTraceroute(sourceDevice, destinationDevice, options = {}) {
    const maxHops = typeof options?.maxHops === 'number' ? Math.max(1, Math.min(64, options.maxHops)) : 30;

    const validation = validateSendFrameEndpoints(sourceDevice, destinationDevice);
    if (!validation.valid) {
        return {
            success: false,
            reason: validation.reason,
            sourceName: sourceDevice?.name || 'Unknown',
            sourceIp: sourceDevice?.ip || '0.0.0.0',
            destinationName: destinationDevice?.name || 'Unknown',
            destinationIp: destinationDevice?.ip || '0.0.0.0',
            hops: [],
            totalHops: 0
        };
    }

    const hops = [];
    let completed = false;
    let finalReason = '';
    const seenRouterIps = new Set();

    for (let ttl = 1; ttl <= maxHops && !completed; ttl++) {
        const probeResult = simulateSendFrame(sourceDevice, destinationDevice, {
            icmp: true,
            initialTtl: ttl,
            agingTimeSeconds: options?.agingTimeSeconds,
            now: options?.now
        });

        if (probeResult.success) {
            hops.push({
                hop: ttl,
                ttl,
                deviceId: destinationDevice.id,
                deviceName: destinationDevice.name,
                ip: destinationDevice.ip,
                type: 'destination',
                icmpType: 0,
                icmpTypeName: 'ECHO_REPLY',
                status: 'reached',
                description: 'Destination Reached (Echo Reply received)',
                path: probeResult.path,
                result: probeResult
            });
            completed = true;
            finalReason = `Trace complete: reached destination ${destinationDevice.name} (${destinationDevice.ip}) in ${ttl} hop${ttl > 1 ? 's' : ''}.`;
            break;
        }

        if (probeResult.icmpErrorPacket && probeResult.icmpErrorPacket.icmp) {
            const errPkt = probeResult.icmpErrorPacket;
            const errIcmp = errPkt.icmp;
            const routerDev = errIcmp.router;
            const routerName = routerDev?.name || errPkt.sourceName || 'Router';
            const routerIp = errPkt.sourceIp || 'Unknown';

            if (errIcmp.type === 11) {
                hops.push({
                    hop: ttl,
                    ttl,
                    deviceId: routerDev?.id || null,
                    deviceName: routerName,
                    ip: routerIp,
                    type: 'router',
                    icmpType: 11,
                    icmpTypeName: 'TIME_EXCEEDED',
                    status: 'ttl_expired',
                    description: errIcmp.description || 'Time to Live (TTL) expired in transit',
                    path: probeResult.path,
                    result: probeResult
                });

                if (seenRouterIps.has(routerIp) && hops.filter((h) => h.ip === routerIp).length >= 3) {
                    completed = true;
                    finalReason = `Routing loop detected at ${routerName} (${routerIp}). Trace terminated.`;
                    break;
                }
                seenRouterIps.add(routerIp);
            } else if (errIcmp.type === 3) {
                hops.push({
                    hop: ttl,
                    ttl,
                    deviceId: routerDev?.id || null,
                    deviceName: routerName,
                    ip: routerIp,
                    type: 'unreachable',
                    icmpType: 3,
                    icmpTypeName: 'DESTINATION_UNREACHABLE',
                    status: 'unreachable',
                    description: errIcmp.description || errIcmp.reason || 'Destination Unreachable',
                    path: probeResult.path,
                    result: probeResult
                });
                completed = true;
                finalReason = `Destination unreachable: reported by ${routerName} (${routerIp}) — ${errIcmp.description || errIcmp.reason || 'Destination Unreachable'}.`;
                break;
            } else {
                hops.push({
                    hop: ttl,
                    ttl,
                    deviceId: routerDev?.id || null,
                    deviceName: routerName,
                    ip: routerIp,
                    type: 'error',
                    icmpType: errIcmp.type,
                    icmpTypeName: errIcmp.typeName || `Type ${errIcmp.type}`,
                    status: 'error',
                    description: errIcmp.description || 'ICMP Error',
                    path: probeResult.path,
                    result: probeResult
                });
                completed = true;
                finalReason = `ICMP error received: ${errIcmp.description || 'Error'}`;
                break;
            }
        } else {
            hops.push({
                hop: ttl,
                ttl,
                deviceId: null,
                deviceName: 'Request timed out / Drop',
                ip: '*',
                type: 'timeout',
                icmpType: null,
                icmpTypeName: 'DROP',
                status: 'drop',
                description: probeResult.reason || 'Frame dropped without ICMP response',
                path: probeResult.path,
                result: probeResult
            });
            completed = true;
            finalReason = `Trace halted: ${probeResult.reason || 'Frame dropped along path'}.`;
            break;
        }
    }

    if (!completed && hops.length >= maxHops) {
        finalReason = `Maximum hop limit (${maxHops}) exceeded without reaching destination.`;
    }

    return {
        success: completed && hops.length > 0 && hops[hops.length - 1].status === 'reached',
        reason: finalReason,
        sourceName: sourceDevice.name,
        sourceIp: sourceDevice.ip,
        destinationName: destinationDevice.name,
        destinationIp: destinationDevice.ip,
        hops,
        totalHops: hops.length
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
    const l3Path = findL3RoutedTopologyPath(sourceDevice, targetDevice);
    const path = (l3Path && l3Path.length >= 2) ? l3Path : findTopologyPath(sourceDevice.id, targetDevice.id);
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

    let ingressIface = firstRouter.interfaces[ingressPort];
    let ingressIfName = ingressPort;
    if ((!ingressIface || !ingressIface.ip || ingressIface.ip !== sourceDevice.gateway) && firstRouter.interfaces) {
        for (const [ifName, iface] of Object.entries(firstRouter.interfaces)) {
            if (iface.isSubinterface && iface.parentInterface === ingressPort && iface.ip === sourceDevice.gateway) {
                ingressIface = iface;
                ingressIfName = ifName;
                break;
            }
        }
    }

    if (getEffectiveInterfaceStatus(firstRouter, ingressIfName) === 'down') {
        return { possible: false, reason: `Router ${firstRouter.name} interface ${ingressIfName} is administratively down.`, path };
    }

    if (!ingressIface.ip || !isValidIPv4(ingressIface.ip)) {
        return { possible: false, reason: `Router ${firstRouter.name} interface ${ingressIfName} has no valid IP configured.`, path };
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

    let egressIface = lastRouter.interfaces[egressPort];
    let egressIfName = egressPort;
    if ((!egressIface || !egressIface.ip || !isSameSubnet(egressIface.ip, targetDevice.ip, normalizedMaskB)) && lastRouter.interfaces) {
        for (const [ifName, iface] of Object.entries(lastRouter.interfaces)) {
            if (iface.isSubinterface && iface.parentInterface === egressPort && iface.ip && isSameSubnet(iface.ip, targetDevice.ip, normalizedMaskB)) {
                egressIface = iface;
                egressIfName = ifName;
                break;
            }
        }
    }

    if (getEffectiveInterfaceStatus(lastRouter, egressIfName) === 'down') {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressIfName} is administratively down.`, path };
    }

    if (!egressIface.ip || !isValidIPv4(egressIface.ip)) {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressIfName} has no valid IP configured.`, path };
    }

    if (!isSameSubnet(egressIface.ip, targetDevice.ip, normalizedMaskB)) {
        return { possible: false, reason: `Router ${lastRouter.name} interface ${egressIfName} (${egressIface.ip}) is not on the destination subnet.`, path };
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

        // Inbound ACL check
        const prevHopId = path[routerIndex - 1];
        const ingPort = getPortForRouterAndNeighbor(rDev.id, prevHopId);
        if (ingPort) {
            const inAclRes = evaluateRouterInterfaceAcl(rDev.id, ingPort, 'in', {
                sourceIp: sourceDevice.ip,
                destinationIp: targetDevice.ip,
                protocol: 'IP'
            });
            if (inAclRes.matched && inAclRes.action === 'deny') {
                return { possible: false, reason: `Router ${rDev.name} inbound ACL ${inAclRes.aclId} denies traffic from ${sourceDevice.ip}.`, path };
            }
        }

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

        // Outbound ACL check
        if (egressIfaceName) {
            const outAclRes = evaluateRouterInterfaceAcl(rDev.id, egressIfaceName, 'out', {
                sourceIp: sourceDevice.ip,
                destinationIp: targetDevice.ip,
                protocol: 'IP'
            });
            if (outAclRes.matched && outAclRes.action === 'deny') {
                return { possible: false, reason: `Router ${rDev.name} outbound ACL ${outAclRes.aclId} denies traffic to ${targetDevice.ip}.`, path };
            }
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

// ==========================================================================
// Interactive Network CLI Foundation (V5.11 Phase 1)
// ==========================================================================

const terminalRuntime = {
    activeDeviceId: null,
    isOpen: false,
    sessions: {}
};

function getDeviceTerminalSession(deviceId) {
    if (!terminalRuntime.sessions[deviceId]) {
        terminalRuntime.sessions[deviceId] = {
            history: [],
            historyIndex: -1,
            logs: [],
            mode: 'exec',
            selectedInterface: null,
            selectedVlan: null,
            prevMode: 'exec'
        };
    }
    return terminalRuntime.sessions[deviceId];
}

function isDeviceCliSupported(deviceOrId) {
    const dev = typeof deviceOrId === 'string' ? (getDeviceById(deviceOrId) || (networkState.devices && networkState.devices.find(d => d.name === deviceOrId || d.id === deviceOrId))) : deviceOrId;
    if (!dev) return false;
    return ['pc', 'laptop', 'server', 'router', 'switch'].includes(dev.type);
}

function getDeviceCliPrompt(deviceOrId) {
    const dev = typeof deviceOrId === 'string' ? (getDeviceById(deviceOrId) || (networkState.devices && networkState.devices.find(d => d.name === deviceOrId || d.id === deviceOrId))) : deviceOrId;
    if (!dev) return 'Device>';
    const name = dev.name || dev.id;
    if (dev.type === 'router') {
        const session = getDeviceTerminalSession(dev.id);
        if (session.mode === 'config-subif') {
            return `${name}(config-subif)#`;
        }
        if (session.mode === 'config-if') {
            return `${name}(config-if)#`;
        }
        if (session.mode === 'config') {
            return `${name}(config)#`;
        }
        return `${name}#`;
    }
    if (dev.type === 'switch') {
        const session = getDeviceTerminalSession(dev.id);
        if (session.mode === 'config-vlan') {
            return `${name}(config-vlan)#`;
        }
        if (session.mode === 'config-if') {
            return `${name}(config-if)#`;
        }
        if (session.mode === 'config') {
            return `${name}(config)#`;
        }
        return `${name}#`;
    }
    return `${name}>`;
}

function getCliCommandHistory(deviceId) {
    const session = getDeviceTerminalSession(deviceId);
    return [...session.history];
}

function pushCliCommandHistory(deviceId, command) {
    const trimmed = (command || '').trim();
    if (!trimmed) return;
    const session = getDeviceTerminalSession(deviceId);
    session.history.push(trimmed);
    if (session.history.length > 50) {
        session.history.shift();
    }
    session.historyIndex = -1;
}

function clearCliTerminal(deviceId) {
    if (deviceId) {
        const session = getDeviceTerminalSession(deviceId);
        session.logs = [];
    }
    const outputEl = document.getElementById('terminalOutput');
    if (outputEl) {
        outputEl.innerHTML = '';
    }
}

function formatCliIpconfig(device) {
    const lines = ['Windows IP Configuration', ''];
    if (device.interfaces && typeof device.interfaces === 'object' && Object.keys(device.interfaces).length > 0) {
        Object.entries(device.interfaces).forEach(([ifName, iface]) => {
            const ip = iface.ip || '0.0.0.0';
            const mask = iface.subnetMask || '0.0.0.0';
            const gateway = iface.gateway || device.gateway || '0.0.0.0';
            const mac = iface.mac ? iface.mac.replace(/:/g, '-').toUpperCase() : '00-00-00-00-00-00';
            lines.push(`Ethernet adapter ${ifName}:`);
            lines.push('');
            lines.push('   Connection-specific DNS Suffix  . :');
            lines.push('   Link-local IPv6 Address . . . . . : fe80::1');
            lines.push(`   IPv4 Address. . . . . . . . . . . : ${ip}`);
            lines.push(`   Subnet Mask . . . . . . . . . . . : ${mask}`);
            lines.push(`   Default Gateway . . . . . . . . . : ${gateway}`);
            lines.push(`   Physical Address. . . . . . . . . : ${mac}`);
            lines.push('');
        });
    } else {
        const ip = device.ip || '0.0.0.0';
        const mask = device.subnetMask || '0.0.0.0';
        const gateway = device.gateway || '0.0.0.0';
        const mac = device.mac ? device.mac.replace(/:/g, '-').toUpperCase() : '00-00-00-00-00-00';
        lines.push('Ethernet adapter Local Area Connection:');
        lines.push('');
        lines.push('   Connection-specific DNS Suffix  . :');
        lines.push('   Link-local IPv6 Address . . . . . : fe80::1');
        lines.push(`   IPv4 Address. . . . . . . . . . . : ${ip}`);
        lines.push(`   Subnet Mask . . . . . . . . . . . : ${mask}`);
        lines.push(`   Default Gateway . . . . . . . . . : ${gateway}`);
        lines.push(`   Physical Address. . . . . . . . . : ${mac}`);
    }
    return lines.join('\n').trimEnd();
}

function formatCliHostArpTable(device) {
    const entries = getArpTable(device.id);
    const hostIp = device.ip || '127.0.0.1';
    const hostMac = device.mac ? device.mac.replace(/:/g, '-').toLowerCase() : '00-00-00-00-00-00';

    if (!entries || entries.length === 0) {
        return `Interface: ${hostIp} --- ${hostMac}\n  No ARP entries found.`;
    }

    const lines = [
        `Interface: ${hostIp} --- ${hostMac}`,
        '  Internet Address      Physical Address      Type'
    ];

    entries.forEach((entry) => {
        const ipCol = entry.ip.padEnd(22, ' ');
        const macCol = (entry.mac || '').toLowerCase().padEnd(22, ' ');
        const typeCol = entry.type || 'dynamic';
        lines.push(`  ${ipCol}${macCol}${typeCol}`);
    });

    return lines.join('\n');
}

function formatCliHostRouteTable(device) {
    const ip = device.ip || '127.0.0.1';
    const gateway = device.gateway || '0.0.0.0';

    const lines = [
        '===========================================================================',
        'Interface List',
        `  11 ...${(device.mac || '00:00:00:00:00:00').replace(/:/g, ' ').toLowerCase()} ...... Ethernet adapter Local Area Connection`,
        '===========================================================================',
        '',
        'IPv4 Route Table',
        '===========================================================================',
        'Active Routes:',
        'Network Destination        Netmask          Gateway       Interface  Metric'
    ];

    const pad = (s, len) => String(s).padEnd(len, ' ');

    // Default route
    if (device.gateway && isValidIPv4(device.gateway)) {
        lines.push(`          0.0.0.0          0.0.0.0  ${pad(device.gateway, 15)} ${pad(ip, 10)}      25`);
    } else {
        lines.push(`          0.0.0.0          0.0.0.0          On-link   ${pad(ip, 10)}      25`);
    }

    // Loopback
    lines.push(`        127.0.0.0        255.0.0.0          On-link        127.0.0.1     331`);
    lines.push(`        127.0.0.1  255.255.255.255          On-link        127.0.0.1     331`);

    // Connected subnet if configured
    if (device.ip && isValidIPv4(device.ip) && device.subnetMask) {
        const normMask = normalizeSubnetMask(device.subnetMask);
        if (normMask) {
            const net = calculateNetworkAddress(device.ip, normMask);
            if (net) {
                lines.push(`  ${pad(net, 15)}  ${pad(normMask, 15)}          On-link   ${pad(ip, 10)}     281`);
            }
        }
        lines.push(`  ${pad(device.ip, 15)}  255.255.255.255          On-link   ${pad(ip, 10)}     281`);
    }

    lines.push(`  255.255.255.255  255.255.255.255          On-link   ${pad(ip, 10)}     281`);
    lines.push('===========================================================================');
    lines.push('Persistent Routes:');
    if (device.gateway && isValidIPv4(device.gateway)) {
        lines.push('  Network Address          Netmask  Gateway Address  Metric');
        lines.push(`          0.0.0.0          0.0.0.0  ${pad(device.gateway, 15)}      25`);
    } else {
        lines.push('  None');
    }
    lines.push('===========================================================================');

    return lines.join('\n');
}

function getRouterInterfaceConnectionInfo(routerId, ifName) {
    const runtime = networkState.routerRuntime?.[routerId];
    if (!runtime || !runtime.ports) return null;
    let matchedConnId = null;
    for (const [connId, portName] of Object.entries(runtime.ports)) {
        if (portName === ifName) {
            matchedConnId = connId;
            break;
        }
    }
    if (!matchedConnId) return null;
    const conn = (networkState.connections || []).find((c) => c.id === matchedConnId);
    if (!conn) return null;
    const neighborId = conn.source === routerId ? conn.target : conn.source;
    const neighborDev = getDeviceById(neighborId);
    return {
        connectionId: conn.id,
        neighborId,
        neighborName: neighborDev ? neighborDev.name : neighborId,
        neighborType: neighborDev ? neighborDev.type : 'unknown'
    };
}

function formatCliRouterInterfaces(router) {
    if (!router.interfaces || Object.keys(router.interfaces).length === 0) {
        return 'No interfaces configured.';
    }

    const blocks = [];
    Object.entries(router.interfaces).forEach(([ifName, iface]) => {
        const isDown = getEffectiveInterfaceStatus(router, ifName) === 'down';
        const statusText = isDown ? 'administratively down' : 'up';
        const protoText = isDown ? 'down' : 'up';
        const mac = (iface.mac || '00:00:00:00:00:00').toLowerCase();

        const lines = [
            `${ifName} is ${statusText}, line protocol is ${protoText}`,
            `  Hardware is GigabitEthernet${iface.isSubinterface ? ' (subinterface)' : ''}, address is ${mac}`
        ];

        if (iface.isSubinterface && iface.encapsulation && iface.vlan) {
            lines.push(`  Encapsulation 802.1Q (dot1q), VLAN ${iface.vlan}`);
        }

        if (iface.ip && isValidIPv4(iface.ip)) {
            const normMask = normalizeSubnetMask(iface.subnetMask);
            const prefixLen = normMask ? getPrefixLengthFromMask(normMask) : 24;
            lines.push(`  Internet address is ${iface.ip}/${prefixLen} (mask ${iface.subnetMask || normMask})`);
        } else {
            lines.push('  Internet address is unassigned');
        }

        lines.push('  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec');

        const parentOrIfName = iface.isSubinterface ? iface.parentInterface : ifName;
        const linkInfo = getRouterInterfaceConnectionInfo(router.id, parentOrIfName);
        if (linkInfo) {
            lines.push(`  Connected to ${linkInfo.neighborName} (${linkInfo.connectionId})`);
        } else {
            lines.push('  Link status: not connected');
        }

        blocks.push(lines.join('\n'));
    });

    return blocks.join('\n\n');
}

function formatCliRouterIpInterfaceBrief(router) {
    if (!router.interfaces || Object.keys(router.interfaces).length === 0) {
        return 'No interfaces configured.';
    }

    const lines = [
        'Interface                  IP-Address      OK? Method Status                Protocol'
    ];

    Object.entries(router.interfaces).forEach(([ifName, iface]) => {
        const ifCol = ifName.padEnd(27, ' ');
        const ipCol = (iface.ip || 'unassigned').padEnd(16, ' ');
        const okCol = 'YES'.padEnd(4, ' ');
        const methodCol = 'manual'.padEnd(7, ' ');
        const isDown = getEffectiveInterfaceStatus(router, ifName) === 'down';
        const statusCol = (isDown ? 'administratively down' : 'up').padEnd(22, ' ');
        const protoCol = isDown ? 'down' : 'up';
        lines.push(`${ifCol}${ipCol}${okCol}${methodCol}${statusCol}${protoCol}`);
    });

    return lines.join('\n');
}

function formatCliRouterRoutingTable(router) {
    const routes = getRouterRoutingTable(router.id);
    const defaultRoute = routes ? routes.find((r) => (r.network === '0.0.0.0' && (r.prefixLength === 0 || r.subnetMask === '0.0.0.0')) && r.status !== 'down') : null;
    const gatewayText = defaultRoute
        ? `Gateway of last resort is ${defaultRoute.nextHop || defaultRoute.interface} to network 0.0.0.0`
        : 'Gateway of last resort is not set';

    const lines = [
        'Codes: C - connected, S - static, R - RIP, M - mobile, B - BGP',
        '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
        '',
        gatewayText,
        ''
    ];

    if (!routes || routes.length === 0) {
        lines.push('Routing table is empty.');
        return lines.join('\n');
    }

    routes.forEach((route) => {
        const isDefault = route.network === '0.0.0.0' && (route.prefixLength === 0 || route.subnetMask === '0.0.0.0');
        let code = route.code || (route.type === 'connected' ? 'C' : (isDefault ? 'S*' : 'S'));
        if (isDefault && code === 'S') {
            code = 'S*';
        }
        const net = `${route.network}/${route.prefixLength}`;
        const iface = route.interface || '—';
        const ad = typeof route.adminDistance === 'number' ? route.adminDistance : (code === 'C' ? 0 : 1);
        const metric = typeof route.metric === 'number' ? route.metric : 0;
        const isDown = route.status === 'down';

        if (code === 'C') {
            lines.push(`${code.padEnd(5, ' ')}${net} is directly connected, ${iface}`);
        } else {
            const statusSuffix = isDown ? ' (inactive - interface down)' : '';
            const viaText = route.nextHop ? `via ${route.nextHop}` : `is directly connected`;
            lines.push(`${code.padEnd(5, ' ')}${net} [${ad}/${metric}] ${viaText}, ${iface}${statusSuffix}`);
        }
    });

    return lines.join('\n');
}

function formatCliRouterArpTable(router) {
    const entries = getArpTable(router.id);
    if (!entries || entries.length === 0) {
        return 'No ARP entries found.';
    }

    const lines = [
        'Protocol  Address          Age (min)  Hardware Addr   Type   Interface'
    ];

    entries.forEach((entry) => {
        const proto = 'Internet'.padEnd(10, ' ');
        const addr = (entry.ip || '').padEnd(17, ' ');
        const age = '-'.padEnd(11, ' ');
        const hw = (entry.mac || '').toLowerCase().padEnd(16, ' ');
        const type = 'ARPA'.padEnd(7, ' ');
        const iface = entry.interface || 'Gig0/0';
        lines.push(`${proto}${addr}${age}${hw}${type}${iface}`);
    });

    return lines.join('\n');
}

function formatCliRouterAcls(router) {
    const acls = getRouterAcls(router.id);
    const aclList = Object.values(acls || {});

    if (!aclList || aclList.length === 0) {
        return 'No access lists configured.';
    }

    const lines = [];

    aclList.forEach((acl) => {
        const typeLabel = acl.type === 'extended' ? 'Extended' : 'Standard';
        lines.push(`${typeLabel} IP access list ${acl.id}`);

        if (!acl.rules || acl.rules.length === 0) {
            lines.push('    (empty)');
            return;
        }

        acl.rules.forEach((rule) => {
            const seq = String(rule.sequence).padStart(4, ' ');
            const action = rule.action || 'permit';
            const hits = rule.hits || 0;
            const matchesText = `(${hits} ${hits === 1 ? 'match' : 'matches'})`;

            let ruleDesc = '';
            if (acl.type === 'extended') {
                const proto = (rule.protocol || 'ip').toLowerCase();
                const src = rule.source?.isAny ? 'any' : rule.source?.isHost ? `host ${rule.source.ip}` : `${rule.source?.ip} ${rule.source?.wildcard || ''}`.trim();
                const dst = rule.destination?.isAny ? 'any' : rule.destination?.isHost ? `host ${rule.destination.ip}` : `${rule.destination?.ip} ${rule.destination?.wildcard || ''}`.trim();
                ruleDesc = `${action} ${proto} ${src} ${dst}`;
            } else {
                const src = rule.source?.isAny ? 'any' : rule.source?.isHost ? `host ${rule.source.ip}` : `${rule.source?.ip} ${rule.source?.wildcard || ''}`.trim();
                ruleDesc = `${action} ${src}`;
            }

            lines.push(`   ${seq} ${ruleDesc} ${matchesText}`);
        });
    });

    return lines.join('\n');
}

function formatCliSwitchVlanBrief(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    const runtime = getSwitchRuntime(sw.id);

    // Collect all ports that exist on the switch (connected ports + configured switchports)
    const allPortNames = new Set([
        ...Object.values(runtime.ports || {}),
        ...Object.keys(sw.switchports || {})
    ]);

    // Map VLAN ID to assigned ports
    const vlanPortsMap = {};
    Object.keys(sw.vlans).forEach((vId) => {
        vlanPortsMap[vId] = [];
    });

    allPortNames.forEach((pName) => {
        const pCfg = getSwitchPortConfig(sw, pName);
        const vId = pCfg.accessVlan || 1;
        if (!vlanPortsMap[vId]) {
            vlanPortsMap[vId] = [];
        }
        vlanPortsMap[vId].push(pName);
    });

    const lines = [
        'VLAN Name                             Status    Ports',
        '---- -------------------------------- --------- -------------------------------'
    ];

    const sortedVlanIds = Object.keys(sw.vlans).map(Number).sort((a, b) => a - b);
    sortedVlanIds.forEach((vId) => {
        const vlan = sw.vlans[vId];
        const vlanIdStr = String(vlan.id).padEnd(4, ' ');
        const nameStr = (vlan.name || '').padEnd(32, ' ');
        const statusStr = (vlan.status || 'active').padEnd(9, ' ');
        const ports = (vlanPortsMap[vId] || []).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return numA - numB;
        }).join(', ');
        lines.push(`${vlanIdStr} ${nameStr} ${statusStr} ${ports}`.trimEnd());
    });

    return lines.join('\n');
}

function formatCliSwitchMacTable(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    const runtime = getSwitchRuntime(sw.id);
    const entries = runtime.macTable || [];

    if (entries.length === 0) {
        return `          Mac Address Table\n-------------------------------------------\n\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\nNo MAC addresses learned yet.`;
    }

    const lines = [
        '          Mac Address Table',
        '-------------------------------------------',
        '',
        'Vlan    Mac Address       Type        Ports',
        '----    -----------       --------    -----'
    ];

    entries.forEach((entry) => {
        const vlanStr = String(entry.vlan || 1).padEnd(8, ' ');
        const macStr = (entry.mac || '').padEnd(18, ' ');
        const typeStr = (entry.type || 'DYNAMIC').padEnd(12, ' ');
        const portStr = entry.port || '';
        lines.push(`${vlanStr}${macStr}${typeStr}${portStr}`.trimEnd());
    });

    lines.push(`Total Mac Addresses for this criterion: ${entries.length}`);

    return lines.join('\n');
}

function formatCliSwitchInterfaces(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    const runtime = getSwitchRuntime(sw.id);
    const allPortNames = new Set([
        ...Object.values(runtime.ports || {}),
        ...Object.keys(sw.switchports || {})
    ]);

    if (allPortNames.size === 0) {
        return 'No interfaces active or configured on this switch.';
    }

    const lines = [];
    Array.from(allPortNames).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    }).forEach((pName) => {
        const cfg = getSwitchPortConfig(sw, pName);
        const vlanId = cfg.accessVlan || 1;
        const vlanName = sw.vlans[vlanId]?.name || `VLAN${vlanId}`;
        const connId = Object.keys(runtime.ports || {}).find(cId => runtime.ports[cId] === pName);
        let neighborInfo = 'not connected';
        if (connId) {
            const conn = getConnectionById(connId);
            if (conn) {
                const neighborId = conn.source === sw.id ? conn.target : conn.source;
                const neighborDev = getDeviceById(neighborId);
                if (neighborDev) {
                    neighborInfo = `connected to ${neighborDev.name}`;
                }
            }
        }
        lines.push(`${pName} is up, line protocol is up`);
        lines.push(`  Hardware is FastEthernet`);
        if (cfg.mode === 'trunk') {
            const nativeName = sw.vlans[cfg.nativeVlan || 1]?.name || 'default';
            lines.push(`  Port mode: trunk, Native VLAN: ${cfg.nativeVlan || 1} (${nativeName}), Allowed VLANs: ${formatAllowedVlans(cfg.allowedVlans)}`);
        } else {
            lines.push(`  Port mode: access, Access VLAN: ${vlanId} (${vlanName})`);
        }
        lines.push(`  Link status: ${neighborInfo}`);
        lines.push('');
    });

    return lines.join('\n').trimEnd();
}

function formatCliSwitchInterfacesTrunk(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    const runtime = getSwitchRuntime(sw.id);
    const allPortNames = new Set([
        ...Object.values(runtime.ports || {}),
        ...Object.keys(sw.switchports || {})
    ]);

    const trunkPorts = Array.from(allPortNames).filter(pName => {
        return getSwitchPortConfig(sw, pName).mode === 'trunk';
    }).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    });

    if (trunkPorts.length === 0) {
        return 'No trunk interfaces configured on this switch.';
    }

    const lines = [
        'Port        Mode             Encapsulation  Status        Native vlan',
        '====================================================================='
    ];

    trunkPorts.forEach((pName) => {
        const cfg = getSwitchPortConfig(sw, pName);
        const portStr = pName.padEnd(12, ' ');
        const modeStr = 'on'.padEnd(17, ' ');
        const encapStr = '802.1q'.padEnd(15, ' ');
        const statusStr = 'trunking'.padEnd(14, ' ');
        const nativeStr = String(cfg.nativeVlan || 1);
        lines.push(`${portStr}${modeStr}${encapStr}${statusStr}${nativeStr}`);
    });

    lines.push('');
    lines.push('Port        Vlans allowed on trunk');
    lines.push('----------------------------------');
    trunkPorts.forEach((pName) => {
        const cfg = getSwitchPortConfig(sw, pName);
        const portStr = pName.padEnd(12, ' ');
        lines.push(`${portStr}${formatAllowedVlans(cfg.allowedVlans)}`);
    });

    lines.push('');
    lines.push('Port        Vlans allowed and active in management domain');
    lines.push('---------------------------------------------------------');
    trunkPorts.forEach((pName) => {
        const cfg = getSwitchPortConfig(sw, pName);
        const portStr = pName.padEnd(12, ' ');
        const activeVlans = Object.keys(sw.vlans).map(Number).filter(vId => isVlanAllowedOnTrunk(cfg, vId)).sort((a, b) => a - b);
        lines.push(`${portStr}${activeVlans.length ? activeVlans.join(', ') : 'none'}`);
    });

    return lines.join('\n');
}

function formatCliSwitchInterfaceSwitchport(switchOrId, portName) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    const normPort = normalizeSwitchPortName(portName);
    if (!normPort) return `% Invalid interface "${portName}".`;
    const cfg = getSwitchPortConfig(sw, normPort);
    const isTrunk = cfg.mode === 'trunk';
    const accessVlanName = sw.vlans[cfg.accessVlan || 1]?.name || 'default';
    const nativeVlanName = sw.vlans[cfg.nativeVlan || 1]?.name || 'default';

    const lines = [
        `Name: ${normPort}`,
        `Switchport: Enabled`,
        `Administrative Mode: ${isTrunk ? 'trunk' : 'static access'}`,
        `Operational Mode: ${isTrunk ? 'trunk' : 'static access'}`,
        `Administrative Native VLAN tagging: disabled`,
        `Trunking VLANs Enabled: ${isTrunk ? (cfg.allowedVlans === 'all' ? 'ALL' : formatAllowedVlans(cfg.allowedVlans)) : 'ALL'}`
    ];
    return lines.join('\n');
}

function formatCliSwitchIpInterfaceBrief(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);

    const lines = [
        'Interface              IP-Address      OK? Method Status                Protocol',
        '================================================================================'
    ];

    const sviEntries = Object.entries(sw.svis || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (sviEntries.length === 0) {
        lines.push('No IP interfaces configured.');
        return lines.join('\n');
    }

    sviEntries.forEach(([vlanIdStr, svi]) => {
        const vlanId = Number(vlanIdStr);
        const ifName = `Vlan${vlanId}`.padEnd(23, ' ');
        const ipStr = (svi.ip || 'unassigned').padEnd(16, ' ');
        const okStr = 'YES'.padEnd(4, ' ');
        const methodStr = (svi.ip ? 'manual' : 'unset').padEnd(7, ' ');
        const isUp = getEffectiveSviStatus(sw, vlanId) === 'up';
        const isAdminDown = svi.adminStatus === 'down';
        const statusStr = (isAdminDown ? 'administratively down' : (isUp ? 'up' : 'down')).padEnd(22, ' ');
        const protoStr = isUp ? 'up' : 'down';
        lines.push(`${ifName}${ipStr}${okStr}${methodStr}${statusStr}${protoStr}`);
    });

    return lines.join('\n');
}

function formatCliSwitchRoutingTable(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);

    if (!sw.ipRouting) {
        return `% IP routing is disabled. Use 'ip routing' in global configuration mode to enable routing table.`;
    }

    const routingTable = getSwitchRoutingTable(sw.id);
    const lines = [
        'Codes: C - connected, S - static',
        'Gateway of last resort is not set',
        ''
    ];

    if (routingTable.length === 0) {
        lines.push('No routes in routing table.');
        return lines.join('\n');
    }

    routingTable.forEach((r) => {
        if (r.code === 'C' || r.type === 'connected') {
            lines.push(`C    ${r.cidr} is directly connected, ${r.interface}`);
        } else if (r.code === 'S' || r.type === 'static') {
            if (r.nextHop && r.interface) {
                lines.push(`S    ${r.cidr} [${r.adminDistance}/${r.metric}] via ${r.nextHop}, ${r.interface}`);
            } else if (r.nextHop) {
                lines.push(`S    ${r.cidr} [${r.adminDistance}/${r.metric}] via ${r.nextHop}`);
            } else if (r.interface) {
                lines.push(`S    ${r.cidr} is directly connected, ${r.interface}`);
            }
        }
    });

    return lines.join('\n');
}

function formatCliSwitchSviDetail(switchOrId, vlanId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    const normId = normalizeVlanId(vlanId);
    if (normId === null) return `% Invalid VLAN ID "${vlanId}".`;
    const svi = sw.svis?.[normId];
    if (!svi) return `% Interface Vlan${normId} does not exist.`;

    const isUp = getEffectiveSviStatus(sw, normId) === 'up';
    const isAdminDown = svi.adminStatus === 'down';
    const lineStatus = isAdminDown ? 'administratively down' : (isUp ? 'up' : 'down');
    const protoStatus = isUp ? 'up' : 'down';
    const ipStr = svi.ip && svi.subnetMask ? `${svi.ip}/${getPrefixLengthFromMask(svi.subnetMask)}` : 'unassigned';

    const lines = [
        `Vlan${normId} is ${lineStatus}, line protocol is ${protoStatus}`,
        `  Hardware is EtherSVI, address is ${svi.mac || sw.mac}`,
        `  Internet address is ${ipStr}`,
        `  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec`,
        `  Encapsulation ARPA, loopback not set`
    ];
    return lines.join('\n');
}

function formatCliSwitchSpanningTree(switchOrId) {
    const sw = getSwitchDevice(switchOrId);
    if (!sw) return '% Switch not found.';
    ensureSwitchVlanState(sw);
    recalculateTopologyStp();

    const stp = sw.stp || {};
    const isRoot = stp.rootBridgeId === stp.bridgeId;
    const rootPortStr = isRoot ? 'None (This is the Root Bridge)' : (stp.rootPort ? `${stp.rootPort}` : 'None');

    const rootParts = parseBridgeId(stp.rootBridgeId);
    const localParts = parseBridgeId(stp.bridgeId);

    const lines = [
        'VLAN0001',
        '  Spanning tree enabled protocol ieee',
        `  Root ID    Priority    ${rootParts.priority}`,
        `             Address     ${rootParts.mac}`,
        ...(isRoot ? ['             This bridge is the root'] : [
            `             Cost        ${stp.rootCost || 0}`,
            `             Port        ${rootPortStr}`
        ]),
        '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
        '',
        `  Bridge ID  Priority    ${localParts.priority}`,
        `             Address     ${localParts.mac}`,
        '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
        '',
        'Interface        Role Sts Cost      Prio.Nbr Type',
        '---------------- ---- --- --------- -------- --------------------------------'
    ];

    const runtime = getSwitchRuntime(sw.id);
    const allPortNames = new Set([
        ...Object.values(runtime.ports || {}),
        ...Object.keys(sw.switchports || {})
    ]);

    const sortedPorts = Array.from(allPortNames).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    });

    if (sortedPorts.length === 0) {
        lines.push('No switchports configured or connected.');
    } else {
        sortedPorts.forEach((pName) => {
            const portInfo = stp.ports?.[pName] || { role: 'disabled', state: 'blocking', cost: 19, portPriority: 128 };
            const portStr = pName.padEnd(17, ' ');
            const roleStr = (portInfo.role === 'root' ? 'Root' : portInfo.role === 'designated' ? 'Desg' : portInfo.role === 'alternate' ? 'Altn' : 'Dis').padEnd(5, ' ');
            const stsStr = (portInfo.state === 'forwarding' ? 'FWD' : 'BLK').padEnd(4, ' ');
            const costStr = String(portInfo.cost || 19).padEnd(10, ' ');
            const portNum = parseInt(pName.replace(/\D/g, ''), 10) || 1;
            const prioNbrStr = `${portInfo.portPriority || 128}.${portNum}`.padEnd(9, ' ');
            const typeStr = 'P2p';
            lines.push(`${portStr}${roleStr}${stsStr}${costStr}${prioNbrStr}${typeStr}`);
        });
    }

    return lines.join('\n');
}

function findDeviceByIp(ip) {
    if (!ip || typeof ip !== 'string') {
        return null;
    }
    const targetIp = ip.trim();
    if (!isValidIPv4(targetIp)) {
        return null;
    }

    for (const dev of (networkState.devices || [])) {
        if (dev.type === 'router' && dev.interfaces) {
            for (const [ifName, iface] of Object.entries(dev.interfaces)) {
                if (iface && iface.ip === targetIp) {
                    return {
                        device: dev,
                        interfaceName: ifName,
                        ip: iface.ip,
                        subnetMask: iface.subnetMask,
                        mac: iface.mac,
                        status: iface.status || 'up'
                    };
                }
            }
        } else if (dev.type === 'switch' && dev.svis) {
            for (const [vlanIdStr, svi] of Object.entries(dev.svis)) {
                if (svi && svi.ip === targetIp) {
                    const vlanId = parseInt(vlanIdStr, 10);
                    return {
                        device: dev,
                        interfaceName: `Vlan${vlanId}`,
                        ip: svi.ip,
                        subnetMask: svi.subnetMask,
                        mac: svi.mac || dev.mac,
                        status: getEffectiveSviStatus(dev, vlanId)
                    };
                }
            }
        } else if (dev.ip === targetIp) {
            return {
                device: dev,
                interfaceName: null,
                ip: dev.ip,
                subnetMask: dev.subnetMask,
                mac: dev.mac,
                status: 'up'
            };
        }
    }
    return null;
}

function executeCliPing(sourceDev, targetIpArg) {
    const rawTarget = typeof targetIpArg === 'string' ? targetIpArg.trim() : '';

    if (!rawTarget) {
        return {
            success: false,
            output: 'Usage: ping <destination-ip>',
            clear: false,
            status: 'error'
        };
    }

    if (!isValidIPv4(rawTarget)) {
        return {
            success: false,
            output: `Ping request could not find host ${rawTarget}. Please check the name and try again.`,
            clear: false,
            status: 'error'
        };
    }

    // Source device readiness check
    let srcEndpoint = null;
    if (sourceDev.type === 'router') {
        const routeMatch = lookupRoute(sourceDev.id, rawTarget);
        if (routeMatch && routeMatch.success && routeMatch.route && routeMatch.route.interface && sourceDev.interfaces?.[routeMatch.route.interface]) {
            const iface = sourceDev.interfaces[routeMatch.route.interface];
            srcEndpoint = {
                id: sourceDev.id,
                name: sourceDev.name,
                ip: iface.ip,
                subnetMask: iface.subnetMask,
                mac: iface.mac,
                type: 'router',
                interfaces: sourceDev.interfaces
            };
        } else {
            let firstIface = null;
            if (sourceDev.interfaces) {
                for (const ifObj of Object.values(sourceDev.interfaces)) {
                    if (ifObj && ifObj.ip && isValidIPv4(ifObj.ip)) {
                        firstIface = ifObj;
                        break;
                    }
                }
            }
            if (firstIface) {
                srcEndpoint = {
                    id: sourceDev.id,
                    name: sourceDev.name,
                    ip: firstIface.ip,
                    subnetMask: firstIface.subnetMask,
                    mac: firstIface.mac,
                    type: 'router',
                    interfaces: sourceDev.interfaces
                };
            }
        }
    } else if (sourceDev.type === 'switch') {
        if (sourceDev.ipRouting) {
            const routeMatch = lookupRoute(sourceDev.id, rawTarget);
            if (routeMatch && routeMatch.success && routeMatch.route && routeMatch.route.interface) {
                const vlanId = getSviVlanId(routeMatch.route.interface);
                const svi = sourceDev.svis?.[vlanId];
                if (svi && svi.ip) {
                    srcEndpoint = {
                        id: sourceDev.id,
                        name: sourceDev.name,
                        ip: svi.ip,
                        subnetMask: svi.subnetMask,
                        gateway: sourceDev.defaultGateway || '',
                        mac: svi.mac || sourceDev.mac,
                        type: 'switch',
                        svis: sourceDev.svis,
                        ipRouting: sourceDev.ipRouting
                    };
                }
            }
        }
        if (!srcEndpoint && sourceDev.svis) {
            for (const [vlanIdStr, svi] of Object.entries(sourceDev.svis)) {
                const vlanId = parseInt(vlanIdStr, 10);
                if (svi && svi.ip && getEffectiveSviStatus(sourceDev, vlanId) === 'up') {
                    const normMask = normalizeSubnetMask(svi.subnetMask);
                    if (normMask && isSameSubnet(svi.ip, rawTarget, normMask)) {
                        srcEndpoint = {
                            id: sourceDev.id,
                            name: sourceDev.name,
                            ip: svi.ip,
                            subnetMask: svi.subnetMask,
                            gateway: sourceDev.defaultGateway || '',
                            mac: svi.mac || sourceDev.mac,
                            type: 'switch',
                            svis: sourceDev.svis,
                            ipRouting: sourceDev.ipRouting
                        };
                        break;
                    }
                }
            }
            if (!srcEndpoint) {
                for (const [vlanIdStr, svi] of Object.entries(sourceDev.svis)) {
                    const vlanId = parseInt(vlanIdStr, 10);
                    if (svi && svi.ip && getEffectiveSviStatus(sourceDev, vlanId) === 'up') {
                        srcEndpoint = {
                            id: sourceDev.id,
                            name: sourceDev.name,
                            ip: svi.ip,
                            subnetMask: svi.subnetMask,
                            gateway: sourceDev.defaultGateway || '',
                            mac: svi.mac || sourceDev.mac,
                            type: 'switch',
                            svis: sourceDev.svis,
                            ipRouting: sourceDev.ipRouting
                        };
                        break;
                    }
                }
            }
        }
    } else {
        if (sourceDev.ip && isValidIPv4(sourceDev.ip)) {
            srcEndpoint = sourceDev;
        }
    }

    if (!srcEndpoint || !srcEndpoint.ip) {
        return {
            success: false,
            output: `% Source device "${sourceDev.name}" has no IPv4 address configured.`,
            clear: false,
            status: 'error'
        };
    }

    const targetMatch = findDeviceByIp(rawTarget);
    if (!targetMatch) {
        const lines = [
            `Pinging ${rawTarget}...`,
            '',
            `Ping request could not find host ${rawTarget}.`,
            '',
            `Ping statistics for ${rawTarget}:`,
            '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'
        ];
        return {
            success: false,
            output: lines.join('\n'),
            clear: false,
            status: 'error'
        };
    }

    let destEndpoint = null;
    if (targetMatch.device.type === 'router') {
        destEndpoint = {
            id: targetMatch.device.id,
            name: targetMatch.device.name,
            ip: targetMatch.ip,
            subnetMask: targetMatch.subnetMask,
            mac: targetMatch.mac,
            type: 'router',
            interfaces: targetMatch.device.interfaces
        };
    } else if (targetMatch.device.type === 'switch') {
        destEndpoint = {
            id: targetMatch.device.id,
            name: targetMatch.device.name,
            ip: targetMatch.ip,
            subnetMask: targetMatch.subnetMask,
            mac: targetMatch.mac,
            type: 'switch',
            svis: targetMatch.device.svis,
            ipRouting: targetMatch.device.ipRouting
        };
    } else {
        destEndpoint = targetMatch.device;
    }

    const simResult = simulateSendFrame(srcEndpoint, destEndpoint, { icmp: true });

    if (simResult.success) {
        const lines = [
            `Pinging ${rawTarget}...`,
            '',
            `Reply from ${rawTarget}: bytes=32 TTL=64`,
            `Reply from ${rawTarget}: bytes=32 TTL=64`,
            `Reply from ${rawTarget}: bytes=32 TTL=64`,
            `Reply from ${rawTarget}: bytes=32 TTL=64`,
            '',
            `Ping statistics for ${rawTarget}:`,
            '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)'
        ];
        return {
            success: true,
            output: lines.join('\n'),
            clear: false,
            status: 'success'
        };
    } else {
        let errLine = 'Destination host unreachable.';
        if (simResult.icmpErrorPacket && simResult.icmpErrorPacket.icmp) {
            const icmp = simResult.icmpErrorPacket.icmp;
            const repIp = simResult.icmpErrorPacket.sourceIp || 'Router';
            if (icmp.type === 3 && icmp.code === 0) {
                errLine = `Reply from ${repIp}: Destination network unreachable.`;
            } else if (icmp.type === 3 && icmp.code === 13) {
                errLine = `Reply from ${repIp}: Destination host unreachable.`;
            } else if (icmp.type === 3) {
                errLine = `Reply from ${repIp}: Destination host unreachable.`;
            } else if (icmp.type === 11) {
                errLine = `Reply from ${repIp}: Time to live exceeded in transit.`;
            }
        } else if (simResult.reason && simResult.reason.toLowerCase().includes('time to live')) {
            errLine = 'Request timed out.';
        }

        const lines = [
            `Pinging ${rawTarget}...`,
            '',
            errLine,
            errLine,
            errLine,
            errLine,
            '',
            `Ping statistics for ${rawTarget}:`,
            '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'
        ];
        return {
            success: false,
            output: lines.join('\n'),
            clear: false,
            status: 'error'
        };
    }
}

function executeCliTraceroute(sourceDev, targetIpArg) {
    const rawTarget = typeof targetIpArg === 'string' ? targetIpArg.trim() : '';

    if (!rawTarget) {
        return {
            success: false,
            output: 'Usage: traceroute <destination-ip>',
            clear: false,
            status: 'error'
        };
    }

    if (!isValidIPv4(rawTarget)) {
        return {
            success: false,
            output: `Unable to resolve target system name ${rawTarget}.`,
            clear: false,
            status: 'error'
        };
    }

    // Source device readiness check
    let srcEndpoint = null;
    if (sourceDev.type === 'router') {
        const routeMatch = lookupRoute(sourceDev.id, rawTarget);
        if (routeMatch && routeMatch.success && routeMatch.route && routeMatch.route.interface && sourceDev.interfaces?.[routeMatch.route.interface]) {
            const iface = sourceDev.interfaces[routeMatch.route.interface];
            srcEndpoint = {
                id: sourceDev.id,
                name: sourceDev.name,
                ip: iface.ip,
                subnetMask: iface.subnetMask,
                mac: iface.mac,
                type: 'router',
                interfaces: sourceDev.interfaces
            };
        } else {
            let firstIface = null;
            if (sourceDev.interfaces) {
                for (const ifObj of Object.values(sourceDev.interfaces)) {
                    if (ifObj && ifObj.ip && isValidIPv4(ifObj.ip)) {
                        firstIface = ifObj;
                        break;
                    }
                }
            }
            if (firstIface) {
                srcEndpoint = {
                    id: sourceDev.id,
                    name: sourceDev.name,
                    ip: firstIface.ip,
                    subnetMask: firstIface.subnetMask,
                    mac: firstIface.mac,
                    type: 'router',
                    interfaces: sourceDev.interfaces
                };
            }
        }
    } else if (sourceDev.type === 'switch') {
        if (sourceDev.ipRouting) {
            const routeMatch = lookupRoute(sourceDev.id, rawTarget);
            if (routeMatch && routeMatch.success && routeMatch.route && routeMatch.route.interface) {
                const vlanId = getSviVlanId(routeMatch.route.interface);
                const svi = sourceDev.svis?.[vlanId];
                if (svi && svi.ip) {
                    srcEndpoint = {
                        id: sourceDev.id,
                        name: sourceDev.name,
                        ip: svi.ip,
                        subnetMask: svi.subnetMask,
                        gateway: sourceDev.defaultGateway || '',
                        mac: svi.mac || sourceDev.mac,
                        type: 'switch',
                        svis: sourceDev.svis,
                        ipRouting: sourceDev.ipRouting
                    };
                }
            }
        }
        if (!srcEndpoint && sourceDev.svis) {
            for (const [vlanIdStr, svi] of Object.entries(sourceDev.svis)) {
                const vlanId = parseInt(vlanIdStr, 10);
                if (svi && svi.ip && getEffectiveSviStatus(sourceDev, vlanId) === 'up') {
                    const normMask = normalizeSubnetMask(svi.subnetMask);
                    if (normMask && isSameSubnet(svi.ip, rawTarget, normMask)) {
                        srcEndpoint = {
                            id: sourceDev.id,
                            name: sourceDev.name,
                            ip: svi.ip,
                            subnetMask: svi.subnetMask,
                            gateway: sourceDev.defaultGateway || '',
                            mac: svi.mac || sourceDev.mac,
                            type: 'switch',
                            svis: sourceDev.svis,
                            ipRouting: sourceDev.ipRouting
                        };
                        break;
                    }
                }
            }
            if (!srcEndpoint) {
                for (const [vlanIdStr, svi] of Object.entries(sourceDev.svis)) {
                    const vlanId = parseInt(vlanIdStr, 10);
                    if (svi && svi.ip && getEffectiveSviStatus(sourceDev, vlanId) === 'up') {
                        srcEndpoint = {
                            id: sourceDev.id,
                            name: sourceDev.name,
                            ip: svi.ip,
                            subnetMask: svi.subnetMask,
                            gateway: sourceDev.defaultGateway || '',
                            mac: svi.mac || sourceDev.mac,
                            type: 'switch',
                            svis: sourceDev.svis,
                            ipRouting: sourceDev.ipRouting
                        };
                        break;
                    }
                }
            }
        }
    } else {
        if (sourceDev.ip && isValidIPv4(sourceDev.ip)) {
            srcEndpoint = sourceDev;
        }
    }

    if (!srcEndpoint || !srcEndpoint.ip) {
        return {
            success: false,
            output: `% Source device "${sourceDev.name}" has no IPv4 address configured.`,
            clear: false,
            status: 'error'
        };
    }

    const targetMatch = findDeviceByIp(rawTarget);
    if (!targetMatch) {
        const lines = [
            `Tracing route to ${rawTarget}`,
            '',
            '  1    *',
            'Destination host unreachable.'
        ];
        return {
            success: false,
            output: lines.join('\n'),
            clear: false,
            status: 'error'
        };
    }

    let destEndpoint = null;
    if (targetMatch.device.type === 'router') {
        destEndpoint = {
            id: targetMatch.device.id,
            name: targetMatch.device.name,
            ip: targetMatch.ip,
            subnetMask: targetMatch.subnetMask,
            mac: targetMatch.mac,
            type: 'router',
            interfaces: targetMatch.device.interfaces
        };
    } else if (targetMatch.device.type === 'switch') {
        destEndpoint = {
            id: targetMatch.device.id,
            name: targetMatch.device.name,
            ip: targetMatch.ip,
            subnetMask: targetMatch.subnetMask,
            mac: targetMatch.mac,
            type: 'switch',
            svis: targetMatch.device.svis,
            ipRouting: targetMatch.device.ipRouting
        };
    } else {
        destEndpoint = targetMatch.device;
    }

    const traceResult = simulateTraceroute(srcEndpoint, destEndpoint);
    const lines = [`Tracing route to ${rawTarget}`, ''];

    if (traceResult.hops && traceResult.hops.length > 0) {
        traceResult.hops.forEach((hop) => {
            const hopNumStr = String(hop.hop).padStart(3, ' ');
            const ipStr = hop.ip || '*';
            lines.push(`${hopNumStr}    ${ipStr}`);
        });
    }

    lines.push('');
    if (traceResult.success) {
        lines.push('Trace complete.');
    } else {
        lines.push('Destination host unreachable.');
    }

    return {
        success: traceResult.success,
        output: lines.join('\n'),
        clear: false,
        status: traceResult.success ? 'success' : 'error'
    };
}

function executeCliCommand(deviceId, rawInput) {
    const dev = getDeviceById(deviceId) || (networkState.devices && networkState.devices.find((d) => d.name === deviceId || d.id === deviceId));
    if (!dev) {
        return {
            success: false,
            output: `% Error: Device "${deviceId}" not found.`,
            clear: false,
            status: 'error',
            command: rawInput,
            device: null
        };
    }

    if (!isDeviceCliSupported(dev)) {
        return {
            success: false,
            output: `% CLI is not supported on ${dev.type} devices.`,
            clear: false,
            status: 'error',
            command: rawInput,
            device: dev
        };
    }

    const command = (rawInput || '').trim();
    if (!command) {
        return {
            success: true,
            output: '',
            clear: false,
            status: 'empty',
            command: '',
            device: dev
        };
    }

    pushCliCommandHistory(dev.id, command);

    const isRouter = dev.type === 'router';
    const isSwitch = dev.type === 'switch';
    const lowerCmd = command.toLowerCase();
    const tokens = lowerCmd.split(/\s+/);
    const mainCmd = tokens[0];

    // 0. DO <command> (execute operational command from any config mode)
    if (mainCmd === 'do' && (isRouter || isSwitch)) {
        const innerCmd = command.replace(/^do\s+/i, '').trim();
        if (!innerCmd) {
            return {
                success: false,
                output: '% Incomplete command: do <command>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        return executeCliCommand(dev.id, innerCmd);
    }

    const session = getDeviceTerminalSession(dev.id);

    // 1. HELP / ?
    if (mainCmd === 'help' || mainCmd === '?') {
        let helpText = '';
        if (isRouter) {
            if (session.mode === 'config-subif') {
                helpText = `Commands available in Subinterface Configuration mode on ${dev.name}:
  encapsulation dot1q <vlan-id> - Configure IEEE 802.1Q encapsulation for this subinterface
  ip address <IP> <mask/prefix> - Set IPv4 address and subnet mask on this subinterface
  no ip address                 - Remove IPv4 address from this subinterface
  shutdown                      - Administratively disable this subinterface
  no shutdown                   - Administratively enable this subinterface
  interface <name>              - Switch to another interface/subinterface (alias: int)
  exit                          - Return to Global Configuration mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else if (session.mode === 'config-if') {
                helpText = `Commands available in Interface Configuration mode on ${dev.name}:
  ip address <IP> <mask/prefix> - Set IPv4 address and subnet mask on this interface
  no ip address                 - Remove IPv4 address from this interface
  shutdown                      - Administratively disable this interface
  no shutdown                   - Administratively enable this interface
  interface <name>              - Switch to another interface (alias: int)
  exit                          - Return to Global Configuration mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else if (session.mode === 'config') {
                helpText = `Commands available in Global Configuration mode on ${dev.name}:
  hostname <name>               - Set device system name
  interface <name>              - Enter interface configuration mode (alias: int)
  ip route <net> <mask> <next-hop> [ad] [metric] - Configure a static route
  no ip route <net> <mask> [next-hop]            - Delete a static route
  exit                          - Return to Privileged EXEC mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else {
                helpText = `Commands available on ${dev.name} (Cisco IOS-style):
  configure terminal     - Enter global configuration mode (alias: conf t)
  hostname <name>        - Set device system name
  interface <name>       - Enter interface configuration mode (alias: int)
  show ip route          - Display current IPv4 routing table
  show interfaces        - Display router interfaces and status (alias: show int)
  show ip interface brief- Display summary table of IP interfaces (alias: show ip int brief)
  show arp               - Display router ARP table and interface bindings
  show access-lists      - Display configured Access Control Lists (ACLs) and hit counts
  route                  - Display current routing table
  ifconfig               - Display interface configuration
  ping <IP>              - Send ICMP Echo requests to test IPv4 reachability
  traceroute <IP>        - Trace packet hops to a destination IPv4 address (alias: tracert)
  clear, cls             - Clear the terminal screen
  help, ?                - Show available commands and usage`;
            }
        } else if (isSwitch) {
            if (session.mode === 'config-vlan') {
                helpText = `Commands available in VLAN Configuration mode on ${dev.name}:
  name <name>                   - Set VLAN name
  exit                          - Return to Global Configuration mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else if (session.mode === 'config-if') {
                helpText = `Commands available in Interface Configuration mode on ${dev.name}:
  switchport mode access        - Set port mode to access
  switchport mode trunk         - Set port mode to trunk
  switchport access vlan <id>   - Set access VLAN for this port
  switchport trunk native vlan <id> - Set native VLAN for trunk port
  switchport trunk allowed vlan [all|add|remove|except|<list>] - Set allowed VLANs on trunk
  interface <name>              - Switch to another interface (alias: int)
  exit                          - Return to Global Configuration mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else if (session.mode === 'config') {
                helpText = `Commands available in Global Configuration mode on ${dev.name}:
  hostname <name>               - Set device system name
  vlan <id>                     - Configure VLAN (enters VLAN config mode)
  no vlan <id>                  - Delete a VLAN
  interface <name>              - Enter interface configuration mode (alias: int)
  exit                          - Return to Privileged EXEC mode
  end                           - Return to Privileged EXEC mode
  do <command>                  - Execute an operational command
  help, ?                       - Show available commands`;
            } else {
                helpText = `Commands available on ${dev.name} (Cisco IOS-style Switch):
  configure terminal            - Enter global configuration mode (alias: conf t)
  hostname <name>               - Set device system name
  interface <name>              - Enter interface configuration mode (alias: int)
  show vlan brief               - Display switch VLAN configuration table (alias: show vlan)
  show mac-address-table        - Display MAC address table (alias: show mac)
  show interfaces               - Display switch interface status (alias: show int)
  show interfaces trunk         - Display trunk interface summary table (alias: show int trunk)
  show interfaces <port> switchport - Display detailed switchport status (alias: show int <port> switchport)
  clear, cls                    - Clear the terminal screen
  help, ?                       - Show available commands and usage`;
            }
        } else {
            helpText = `Commands available on ${dev.name}:
  hostname <name>   - Set device system name
  ipconfig          - Display IP configuration, Subnet Mask, Gateway, and MAC
  ipconfig /all     - Display detailed IP and interface configuration
  ifconfig          - Display network interface configuration
  arp, arp -a       - Display the current ARP cache entries
  route, route print- Display current IPv4 routing table
  ping <IP>         - Send ICMP Echo requests to test IPv4 reachability
  traceroute <IP>   - Trace packet hops to a destination IPv4 address (alias: tracert)
  clear, cls        - Clear the terminal screen
  help, ?           - Show available commands and usage`;
        }
        return {
            success: true,
            output: helpText,
            clear: false,
            status: 'info',
            command,
            device: dev
        };
    }

    // 2. CLEAR / CLS
    if (mainCmd === 'clear' || mainCmd === 'cls') {
        clearCliTerminal(dev.id);
        return {
            success: true,
            output: '',
            clear: true,
            status: 'info',
            command,
            device: dev
        };
    }

    // 3. CONFIGURE TERMINAL / CONF T / CONFIG T
    if (mainCmd === 'configure' || mainCmd === 'conf' || mainCmd === 'config') {
        if (tokens[1] === 'terminal' || tokens[1] === 't' || tokens.length === 1) {
            if (!isRouter && !isSwitch) {
                return {
                    success: false,
                    output: `% 'configure terminal' is a Cisco IOS router command (and switch configuration command).`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            session.mode = 'config';
            session.selectedInterface = null;
            session.selectedVlan = null;
            return {
                success: true,
                output: 'Enter configuration commands, one per line. End with CNTL/Z or "end".',
                clear: false,
                status: 'info',
                command,
                device: dev
            };
        }
    }

    // 4. EXIT
    if (mainCmd === 'exit') {
        if (session.mode === 'config-vlan') {
            session.mode = 'config';
            session.selectedVlan = null;
            return { success: true, output: '', clear: false, status: 'info', command, device: dev };
        }
        if (session.mode === 'config-subif') {
            session.mode = 'config';
            session.selectedInterface = null;
            return { success: true, output: '', clear: false, status: 'info', command, device: dev };
        }
        if (session.mode === 'config-if') {
            session.mode = 'config';
            session.selectedInterface = null;
            return { success: true, output: '', clear: false, status: 'info', command, device: dev };
        }
        if (session.mode === 'config') {
            session.mode = 'exec';
            session.selectedInterface = null;
            session.selectedVlan = null;
            return { success: true, output: '', clear: false, status: 'info', command, device: dev };
        }
        return { success: true, output: '', clear: false, status: 'info', command, device: dev };
    }

    // 5. END
    if (mainCmd === 'end') {
        if (isRouter || isSwitch) {
            session.mode = 'exec';
            session.selectedInterface = null;
            session.selectedVlan = null;
            return { success: true, output: '', clear: false, status: 'info', command, device: dev };
        }
        return { success: true, output: '', clear: false, status: 'info', command, device: dev };
    }

    // 6. HOSTNAME
    if (mainCmd === 'hostname') {
        if (tokens.length === 1) {
            return {
                success: true,
                output: dev.name,
                clear: false,
                status: 'info',
                command,
                device: dev
            };
        }
        const rawNameParts = command.split(/\s+/).slice(1);
        const newName = rawNameParts.join(' ').trim();
        if (!newName) {
            return {
                success: false,
                output: '% Incomplete command: hostname <name>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newName)) {
            return {
                success: false,
                output: '% Invalid hostname: must contain 1-32 alphanumeric characters, dashes, or underscores.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (dev.name !== newName) {
            pushHistory();
            dev.name = newName;
            render();
        }
        return {
            success: true,
            output: '',
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 7. VLAN <id> (switch only)
    if (mainCmd === 'vlan') {
        if (!isSwitch) {
            return {
                success: false,
                output: "% 'vlan' is a switch configuration command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (session.mode !== 'config' && session.mode !== 'config-vlan' && session.mode !== 'config-if') {
            return {
                success: false,
                output: '% "vlan" command must be executed in configuration mode (e.g. after "configure terminal").',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (tokens.length < 2) {
            return {
                success: false,
                output: '% Incomplete command: vlan <vlan-id>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const normId = normalizeVlanId(tokens[1]);
        if (normId === null) {
            return {
                success: false,
                output: `% Invalid VLAN ID "${tokens[1]}". Valid range is 1-4094.`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        ensureSwitchVlanState(dev);
        if (!dev.vlans[normId]) {
            pushHistory();
            createSwitchVlan(dev, normId);
            render();
        }
        session.mode = 'config-vlan';
        session.selectedVlan = normId;
        session.selectedInterface = null;
        return {
            success: true,
            output: '',
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 8. NAME <vlanName> (in config-vlan mode)
    if (mainCmd === 'name') {
        if (!isSwitch) {
            return {
                success: false,
                output: "% 'name' is a switch VLAN configuration command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (session.mode !== 'config-vlan' || !session.selectedVlan) {
            return {
                success: false,
                output: '% "name" command is only valid in VLAN configuration mode (e.g. "vlan 10").',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const newName = command.replace(/^name\s+/i, '').trim();
        if (!newName) {
            return {
                success: false,
                output: '% Incomplete command: name <vlan-name>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (!/^[a-zA-Z0-9_-]{1,32}$/.test(newName)) {
            return {
                success: false,
                output: '% Invalid VLAN name: must contain 1-32 alphanumeric characters, dashes, or underscores.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        pushHistory();
        renameSwitchVlan(dev, session.selectedVlan, newName);
        render();
        return {
            success: true,
            output: '',
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 9. SWITCHPORT commands (config-if on switch)
    if (mainCmd === 'switchport') {
        if (!isSwitch) {
            return {
                success: false,
                output: "% 'switchport' is a switch interface command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (session.mode !== 'config-if' || !session.selectedInterface) {
            return {
                success: false,
                output: '% "switchport" commands must be executed inside interface configuration mode (e.g. "interface Fa0/1").',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (isSviName(session.selectedInterface)) {
            return {
                success: false,
                output: '% Command rejected: Switchport commands are only valid on physical interfaces, not SVIs.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const sub1 = tokens[1] || '';
        const sub2 = tokens[2] || '';

        // switchport mode access / switchport mode trunk
        if (sub1 === 'mode') {
            if (sub2 === 'access') {
                pushHistory();
                setSwitchPortMode(dev, session.selectedInterface, 'access');
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (sub2 === 'trunk') {
                pushHistory();
                setSwitchPortMode(dev, session.selectedInterface, 'trunk');
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: false,
                output: `% Mode "${tokens[2] || ''}" is not supported (supported modes: access, trunk).`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        // switchport access vlan <id>
        if (sub1 === 'access' && sub2 === 'vlan') {
            const rawVlan = tokens[3];
            if (!rawVlan) {
                return {
                    success: false,
                    output: '% Incomplete command: switchport access vlan <vlan-id>',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const normId = normalizeVlanId(rawVlan);
            if (normId === null) {
                return {
                    success: false,
                    output: `% Invalid VLAN ID "${rawVlan}". Valid range is 1-4094.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            ensureSwitchVlanState(dev);
            if (!dev.vlans[normId]) {
                return {
                    success: false,
                    output: `% Access VLAN ${normId} does not exist. Create VLAN first.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            pushHistory();
            setSwitchPortAccessVlan(dev, session.selectedInterface, normId);
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // switchport trunk ...
        if (sub1 === 'trunk') {
            const portCfg = getSwitchPortConfig(dev, session.selectedInterface);
            if (portCfg.mode !== 'trunk') {
                return {
                    success: false,
                    output: `% Command rejected: Port ${session.selectedInterface} is not in trunk mode. Use "switchport mode trunk" first.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }

            // switchport trunk native vlan <id>
            if (sub2 === 'native' && tokens[3] === 'vlan') {
                const rawVlan = tokens[4];
                if (!rawVlan) {
                    return {
                        success: false,
                        output: '% Incomplete command: switchport trunk native vlan <vlan-id>',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                const normId = normalizeVlanId(rawVlan);
                if (normId === null) {
                    return {
                        success: false,
                        output: `% Invalid VLAN ID "${rawVlan}". Valid range is 1-4094.`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                ensureSwitchVlanState(dev);
                if (!dev.vlans[normId]) {
                    return {
                        success: false,
                        output: `% Native VLAN ${normId} does not exist. Create VLAN first.`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                pushHistory();
                setSwitchPortNativeVlan(dev, session.selectedInterface, normId);
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }

            // switchport trunk allowed vlan [add|remove|except|all|<list>]
            if (sub2 === 'allowed' && tokens[3] === 'vlan') {
                const arg1 = tokens[4] || '';
                if (!arg1) {
                    return {
                        success: false,
                        output: '% Incomplete command: switchport trunk allowed vlan [add|remove|except|all|<vlan-list>]',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }

                if (arg1 === 'all') {
                    pushHistory();
                    setSwitchPortAllowedVlans(dev, session.selectedInterface, 'all');
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                }

                if (arg1 === 'add' || arg1 === 'remove' || arg1 === 'except') {
                    const listPart = tokens.slice(5).join(' ').trim();
                    if (!listPart) {
                        return {
                            success: false,
                            output: `% Incomplete command: switchport trunk allowed vlan ${arg1} <vlan-list>`,
                            clear: false,
                            status: 'error',
                            command,
                            device: dev
                        };
                    }
                    try {
                        pushHistory();
                        setSwitchPortAllowedVlans(dev, session.selectedInterface, arg1, listPart);
                        render();
                        return {
                            success: true,
                            output: '',
                            clear: false,
                            status: 'success',
                            command,
                            device: dev
                        };
                    } catch (err) {
                        return {
                            success: false,
                            output: `% ${err.message}`,
                            clear: false,
                            status: 'error',
                            command,
                            device: dev
                        };
                    }
                }

                const listPart = tokens.slice(4).join(' ').trim();
                try {
                    pushHistory();
                    setSwitchPortAllowedVlans(dev, session.selectedInterface, 'set', listPart);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                } catch (err) {
                    return {
                        success: false,
                        output: `% ${err.message}`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
            }
        }

        return {
            success: false,
            output: `% Incomplete or unrecognized switchport command. Available: "switchport mode access", "switchport mode trunk", "switchport access vlan <id>", "switchport trunk native vlan <id>", "switchport trunk allowed vlan <vlans>".`,
            clear: false,
            status: 'error',
            command,
            device: dev
        };
    }

    // 10. INTERFACE <ifName> / INT <ifName>
    if (mainCmd === 'interface' || mainCmd === 'int') {
        if (!isRouter && !isSwitch) {
            return {
                success: false,
                output: "% 'interface' is a Cisco IOS router command (and switch command).",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (tokens.length < 2) {
            return {
                success: false,
                output: '% Incomplete command: interface <interface-name>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const rawIfName = tokens[1];
        if (isRouter) {
            const normIfName = normalizeRouterInterfaceName(rawIfName);
            if (!normIfName) {
                const available = Object.keys(dev.interfaces || {});
                return {
                    success: false,
                    output: `% Invalid interface: "${rawIfName}". Available interfaces: ${available.join(', ')}`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (isSubinterfaceName(normIfName)) {
                const parentName = getParentInterfaceName(normIfName);
                if (!dev.interfaces || !dev.interfaces[parentName]) {
                    return {
                        success: false,
                        output: `% Parent interface "${parentName}" does not exist on ${dev.name}.`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                ensureRouterSubinterface(dev, normIfName);
                session.prevMode = (session.mode === 'config' || session.mode === 'config-if' || session.mode === 'config-subif') ? session.mode : 'exec';
                session.mode = 'config-subif';
                session.selectedInterface = normIfName;
                session.selectedVlan = null;
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            } else {
                if (!dev.interfaces || !dev.interfaces[normIfName]) {
                    const available = Object.keys(dev.interfaces || {});
                    return {
                        success: false,
                        output: `% Invalid interface: "${rawIfName}". Available interfaces: ${available.join(', ')}`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                session.prevMode = (session.mode === 'config' || session.mode === 'config-if' || session.mode === 'config-subif') ? session.mode : 'exec';
                session.mode = 'config-if';
                session.selectedInterface = normIfName;
                session.selectedVlan = null;
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
        }
        if (isSwitch) {
            let sviTarget = null;
            if (rawIfName.toLowerCase() === 'vlan' && tokens[2]) {
                sviTarget = normalizeSviName(`Vlan${tokens[2]}`);
            } else if (isSviName(rawIfName)) {
                sviTarget = normalizeSviName(rawIfName);
            }

            if (sviTarget) {
                const vlanId = getSviVlanId(sviTarget);
                if (vlanId === null) {
                    return {
                        success: false,
                        output: `% Invalid VLAN ID "${rawIfName}". Valid range is 1-4094.`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                ensureSwitchSvi(dev, vlanId);
                session.prevMode = (session.mode === 'config' || session.mode === 'config-if' || session.mode === 'config-vlan') ? session.mode : 'exec';
                session.mode = 'config-if';
                session.selectedInterface = sviTarget;
                session.selectedVlan = null;
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }

            const normPort = normalizeSwitchPortName(rawIfName);
            if (!normPort) {
                return {
                    success: false,
                    output: `% Invalid switch interface: "${rawIfName}". Example: "Fa0/1" or "vlan 10".`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            session.prevMode = (session.mode === 'config' || session.mode === 'config-if' || session.mode === 'config-vlan') ? session.mode : 'exec';
            session.mode = 'config-if';
            session.selectedInterface = normPort;
            session.selectedVlan = null;
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
    }

    // 10b. ENCAPSULATION DOT1Q <vlan> (router subinterface only)
    if (mainCmd === 'encapsulation' || mainCmd === 'encap') {
        if (!isRouter) {
            return {
                success: false,
                output: "% 'encapsulation' is a router subinterface command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (session.mode !== 'config-subif' || !session.selectedInterface || !isSubinterfaceName(session.selectedInterface)) {
            return {
                success: false,
                output: '% Command rejected: Can only configure dot1q encapsulation on subinterfaces.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const encapType = (tokens[1] || '').toLowerCase();
        if (encapType !== 'dot1q' && encapType !== '802.1q') {
            return {
                success: false,
                output: '% Incomplete or unsupported encapsulation. Usage: encapsulation dot1q <vlan-id>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const rawVlan = tokens[2];
        if (!rawVlan) {
            return {
                success: false,
                output: '% Incomplete command: encapsulation dot1q <vlan-id>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        try {
            pushHistory();
            setRouterSubinterfaceEncapsulation(dev, session.selectedInterface, rawVlan);
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        } catch (err) {
            return {
                success: false,
                output: `% ${err.message}`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
    }

    // 11. SHUTDOWN / SHUT
    if ((mainCmd === 'shutdown' || mainCmd === 'shut') && tokens.length === 1) {
        if (!isRouter && !isSwitch) {
            return {
                success: false,
                output: "% 'shutdown' is a Cisco IOS command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if ((session.mode !== 'config-if' && session.mode !== 'config-subif') || !session.selectedInterface) {
            return {
                success: false,
                output: '% "shutdown" must be executed inside interface configuration mode (e.g. "interface Gig0/0" or "interface Fa0/1").',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (isRouter) {
            const iface = dev.interfaces?.[session.selectedInterface];
            if (iface && iface.status !== 'down') {
                pushHistory();
                iface.status = 'down';
                render();
            }
        }
        if (isSwitch) {
            if (isSviName(session.selectedInterface)) {
                pushHistory();
                setSwitchSviAdminStatus(dev, getSviVlanId(session.selectedInterface), 'down');
                render();
            }
        }
        return {
            success: true,
            output: `% Interface ${session.selectedInterface} changed state to administratively down`,
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 12. NO commands (no shutdown, no ip address, no ip route, no vlan, no ip routing, no ip default-gateway, no interface)
    if (mainCmd === 'no') {
        const sub1 = tokens[1] || '';
        const sub2 = tokens[2] || '';

        // no vlan <id>
        if (sub1 === 'vlan') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: "% 'no vlan' is a switch configuration command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (session.mode !== 'config') {
                return {
                    success: false,
                    output: '% "no vlan" must be executed in global configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const rawVlan = tokens[2];
            if (!rawVlan) {
                return {
                    success: false,
                    output: '% Incomplete command: no vlan <vlan-id>',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const normId = normalizeVlanId(rawVlan);
            if (normId === null) {
                return {
                    success: false,
                    output: `% Invalid VLAN ID "${rawVlan}". Valid range is 1-4094.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (normId === 1) {
                return {
                    success: false,
                    output: '% Default VLAN 1 cannot be deleted.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            ensureSwitchVlanState(dev);
            if (!dev.vlans[normId]) {
                return {
                    success: false,
                    output: `% VLAN ${normId} not found.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            pushHistory();
            deleteSwitchVlan(dev, normId);
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no shutdown / no shut
        if (sub1 === 'shutdown' || sub1 === 'shut') {
            if (!isRouter && !isSwitch) {
                return {
                    success: false,
                    output: "% 'no shutdown' is a Cisco IOS command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if ((session.mode !== 'config-if' && session.mode !== 'config-subif') || !session.selectedInterface) {
                return {
                    success: false,
                    output: '% "no shutdown" must be executed inside interface configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (isRouter) {
                const iface = dev.interfaces?.[session.selectedInterface];
                if (iface && iface.status !== 'up') {
                    pushHistory();
                    iface.status = 'up';
                    render();
                }
            }
            if (isSwitch) {
                if (isSviName(session.selectedInterface)) {
                    pushHistory();
                    setSwitchSviAdminStatus(dev, getSviVlanId(session.selectedInterface), 'up');
                    render();
                }
            }
            return {
                success: true,
                output: `% Interface ${session.selectedInterface} changed state to up`,
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no ip routing
        if (sub1 === 'ip' && sub2 === 'routing') {
            if (!isSwitch && !isRouter) {
                return {
                    success: false,
                    output: "% 'no ip routing' is a Cisco IOS command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (isSwitch) {
                if (session.mode !== 'config') {
                    return {
                        success: false,
                        output: '% "no ip routing" must be executed in global configuration mode.',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                pushHistory();
                setSwitchIpRouting(dev, false);
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no ip default-gateway / no ip default-gw
        if (sub1 === 'ip' && (sub2 === 'default-gateway' || sub2 === 'default-gw')) {
            if (!isSwitch) {
                return {
                    success: false,
                    output: "% 'no ip default-gateway' is a switch configuration command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (session.mode !== 'config') {
                return {
                    success: false,
                    output: '% "no ip default-gateway" must be executed in global configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            pushHistory();
            setSwitchDefaultGateway(dev, '');
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no interface vlan <id> / no int vlan <id>
        if (sub1 === 'interface' || sub1 === 'int') {
            if (isSwitch) {
                let targetIf = tokens[2] || '';
                if (targetIf.toLowerCase() === 'vlan' && tokens[3]) {
                    targetIf = `Vlan${tokens[3]}`;
                }
                if (targetIf && isSviName(targetIf)) {
                    const vlanId = getSviVlanId(targetIf);
                    pushHistory();
                    deleteSwitchSvi(dev, vlanId);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                }
            }
        }

        // no ip address / no ip addr
        if (sub1 === 'ip' && (sub2 === 'address' || sub2 === 'addr')) {
            if (isSwitch) {
                if (session.mode !== 'config-if' || !session.selectedInterface || !isSviName(session.selectedInterface)) {
                    return {
                        success: false,
                        output: '% "no ip address" is not supported on Layer 2 switchports (Layer-2 switches operate at Layer 2; SVIs are configured via "interface vlan <id>").',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                pushHistory();
                setSwitchSviIp(dev, getSviVlanId(session.selectedInterface), '', '');
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (!isRouter) {
                return {
                    success: false,
                    output: "% 'no ip address' is a Cisco IOS router command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if ((session.mode !== 'config-if' && session.mode !== 'config-subif') || !session.selectedInterface || !dev.interfaces?.[session.selectedInterface]) {
                return {
                    success: false,
                    output: '% "no ip address" must be executed inside interface configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const iface = dev.interfaces[session.selectedInterface];
            pushHistory();
            const oldIp = iface.ip;
            if (oldIp) {
                removeArpEntriesForIp(oldIp);
            }
            iface.ip = '';
            iface.subnetMask = '';
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no ip route <network> <mask/prefix> [next-hop/interface]
        if (sub1 === 'ip' && (sub2 === 'route' || sub2 === 'routes')) {
            if (isSwitch && !dev.ipRouting) {
                return {
                    success: false,
                    output: "% IP routing is disabled. Use 'ip routing' in global configuration mode to enable routing.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (!isRouter && !isSwitch) {
                return {
                    success: false,
                    output: "% 'no ip route' is a Cisco IOS command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            let rawDest = '';
            let rawMask = '';
            let nextHopArg = '';
            if (tokens[3] && tokens[3].includes('/')) {
                const parts = tokens[3].split('/');
                rawDest = parts[0].trim();
                const prefix = parseInt(parts[1], 10);
                rawMask = getMaskFromPrefixLength(prefix);
                nextHopArg = tokens[4] ? tokens[4].trim() : '';
            } else {
                if (tokens.length < 5) {
                    return {
                        success: false,
                        output: '% Incomplete command: no ip route <network> <mask/prefix> [next-hop/interface]',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                rawDest = tokens[3].trim();
                rawMask = tokens[4].trim();
                nextHopArg = tokens[5] ? tokens[5].trim() : '';
            }

            const normMask = normalizeSubnetMask(rawMask);
            if (!normMask || !isValidIPv4(rawDest)) {
                return {
                    success: false,
                    output: `% Invalid destination network or mask: ${rawDest} ${rawMask}`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }

            const runtime = dev.type === 'router' ? getRouterRuntime(dev.id) : getSwitchRuntime(dev.id);
            const targetNetwork = calculateNetworkAddress(rawDest, normMask);
            const targetPrefix = getPrefixLengthFromMask(normMask);
            const matchedIndex = (runtime.staticRoutes || []).findIndex((r) => {
                return r.network === targetNetwork
                    && r.prefixLength === targetPrefix
                    && (!nextHopArg || r.nextHop === nextHopArg || r.interface?.toLowerCase() === nextHopArg.toLowerCase());
            });

            if (matchedIndex === -1) {
                return {
                    success: false,
                    output: `% No matching static route found for ${rawDest} ${rawMask}`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }

            pushHistory();
            const routeId = runtime.staticRoutes[matchedIndex].id;
            removeStaticRoute(dev.id, routeId);
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // no spanning-tree priority / no spanning-tree vlan <id> priority / no spanning-tree cost / no spanning-tree port-priority
        if (sub1 === 'spanning-tree' || sub1 === 'spanningtree' || sub1 === 'stp') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: "% 'no spanning-tree' is a switch configuration command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (session.mode === 'config-if') {
                if (!session.selectedInterface || isSviName(session.selectedInterface)) {
                    return {
                        success: false,
                        output: '% Spanning-tree interface commands are only supported on physical switchports.',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                const portName = session.selectedInterface;
                if (sub2 === 'cost') {
                    pushHistory();
                    setSwitchPortStpCost(dev, portName, portName.toLowerCase().startsWith('gi') ? DEFAULT_PORT_COST_GI : DEFAULT_PORT_COST_FA);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                }
                if (sub2 === 'port-priority') {
                    pushHistory();
                    setSwitchPortStpPriority(dev, portName, DEFAULT_PORT_PRIORITY);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                }
            }
            if (session.mode !== 'config') {
                return {
                    success: false,
                    output: '% "no spanning-tree" must be executed in global configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (sub2 === 'priority' || (sub2 === 'vlan' && tokens[4] === 'priority')) {
                pushHistory();
                setSwitchStpPriority(dev, DEFAULT_STP_PRIORITY);
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: false,
                output: '% Incomplete command: no spanning-tree priority [or "no spanning-tree vlan <id> priority"]',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
    }

    // 12b. SPANNING-TREE commands
    if (mainCmd === 'spanning-tree' || mainCmd === 'spanningtree' || mainCmd === 'stp') {
        if (!isSwitch) {
            return {
                success: false,
                output: "% 'spanning-tree' is a switch configuration command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        // Interface mode: spanning-tree cost <cost> / spanning-tree port-priority <prio>
        if (session.mode === 'config-if') {
            if (!session.selectedInterface || isSviName(session.selectedInterface)) {
                return {
                    success: false,
                    output: '% Spanning-tree interface commands are only supported on physical switchports.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const portName = session.selectedInterface;
            if (tokens[1] === 'cost') {
                const costVal = tokens[2];
                if (!costVal) {
                    return {
                        success: false,
                        output: '% Incomplete command: spanning-tree cost <1-200000000>',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                try {
                    pushHistory();
                    setSwitchPortStpCost(dev, portName, costVal);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                } catch (err) {
                    return {
                        success: false,
                        output: `% ${err.message}`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
            }
            if (tokens[1] === 'port-priority') {
                const prioVal = tokens[2];
                if (!prioVal) {
                    return {
                        success: false,
                        output: '% Incomplete command: spanning-tree port-priority <0-240 in steps of 16>',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                try {
                    pushHistory();
                    setSwitchPortStpPriority(dev, portName, prioVal);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                } catch (err) {
                    return {
                        success: false,
                        output: `% ${err.message}`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
            }
            return {
                success: false,
                output: '% Incomplete or unrecognized spanning-tree interface command. Available: "spanning-tree cost <cost>", "spanning-tree port-priority <priority>".',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        // Global config mode: spanning-tree priority <val> / spanning-tree vlan <id> priority <val>
        if (session.mode !== 'config') {
            return {
                success: false,
                output: '% "spanning-tree" configuration commands must be executed in global configuration mode.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        let rawPrio = null;
        if (tokens[1] === 'priority') {
            rawPrio = tokens[2];
        } else if (tokens[1] === 'vlan' && tokens[3] === 'priority') {
            rawPrio = tokens[4];
        } else if (tokens[1] === 'vlan' && !tokens[3]) {
            return {
                success: false,
                output: '% Incomplete command: spanning-tree vlan <id> priority <value>',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        if (rawPrio === null || rawPrio === undefined) {
            return {
                success: false,
                output: '% Incomplete command: spanning-tree priority <value> (valid values: 0, 4096, 8192, ..., 61440)',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        try {
            pushHistory();
            setSwitchStpPriority(dev, rawPrio);
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        } catch (err) {
            return {
                success: false,
                output: `% ${err.message}`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
    }

    // 13. IP ROUTING / IP DEFAULT-GATEWAY / IP ADDRESS
    if (mainCmd === 'ip') {
        // ip routing
        if (tokens[1] === 'routing') {
            if (!isSwitch && !isRouter) {
                return {
                    success: false,
                    output: "% 'ip routing' is a Cisco IOS command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (isSwitch) {
                if (session.mode !== 'config') {
                    return {
                        success: false,
                        output: '% "ip routing" must be executed in global configuration mode.',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                pushHistory();
                setSwitchIpRouting(dev, true);
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // ip default-gateway <ip>
        if (tokens[1] === 'default-gateway' || tokens[1] === 'default-gw') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: "% 'ip default-gateway' is a Layer-2 switch command. On routers or L3 switches with ip routing enabled, configure a default route 'ip route 0.0.0.0 0.0.0.0 <next-hop>'.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (session.mode !== 'config') {
                return {
                    success: false,
                    output: '% "ip default-gateway" must be executed in global configuration mode.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const gwIp = tokens[2] ? tokens[2].trim() : '';
            if (!gwIp) {
                return {
                    success: false,
                    output: '% Incomplete command: ip default-gateway <ip-address>',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            try {
                pushHistory();
                setSwitchDefaultGateway(dev, gwIp);
                render();
                return {
                    success: true,
                    output: '',
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            } catch (err) {
                return {
                    success: false,
                    output: `% ${err.message}`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
        }

        // ip address <ip> <mask>
        if (tokens[1] === 'address' || tokens[1] === 'addr') {
            if (isSwitch) {
                if (session.mode !== 'config-if' || !session.selectedInterface || !isSviName(session.selectedInterface)) {
                    return {
                        success: false,
                        output: "% 'ip address' is not supported on Layer 2 switchports (Layer-2 switches operate at Layer 2; configure SVIs via 'interface vlan <id>').",
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                const vlanId = getSviVlanId(session.selectedInterface);
                let rawIp = '';
                let rawMask = '';
                if (tokens[2] && tokens[2].includes('/')) {
                    const parts = tokens[2].split('/');
                    rawIp = parts[0].trim();
                    const prefix = parseInt(parts[1], 10);
                    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
                        return {
                            success: false,
                            output: '% Invalid CIDR prefix length.',
                            clear: false,
                            status: 'error',
                            command,
                            device: dev
                        };
                    }
                    rawMask = getMaskFromPrefixLength(prefix);
                } else {
                    if (tokens.length < 4) {
                        return {
                            success: false,
                            output: '% Incomplete command: ip address <IP> <Subnet-Mask>',
                            clear: false,
                            status: 'error',
                            command,
                            device: dev
                        };
                    }
                    rawIp = tokens[2].trim();
                    rawMask = tokens[3].trim();
                }

                try {
                    pushHistory();
                    setSwitchSviIp(dev, vlanId, rawIp, rawMask);
                    render();
                    return {
                        success: true,
                        output: '',
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                } catch (err) {
                    return {
                        success: false,
                        output: `% ${err.message}`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
            }

            if (!isRouter) {
                return {
                    success: false,
                    output: "% 'ip address' is a Cisco IOS router command.",
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if ((session.mode !== 'config-if' && session.mode !== 'config-subif') || !session.selectedInterface || !dev.interfaces?.[session.selectedInterface]) {
                return {
                    success: false,
                    output: '% "ip address" must be executed inside interface configuration mode (e.g. "interface Gig0/0").',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const iface = dev.interfaces[session.selectedInterface];
            if (iface.isSubinterface && (!iface.encapsulation || !iface.vlan)) {
                return {
                    success: false,
                    output: '% Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            let rawIp = '';
            let rawMask = '';
            if (tokens[2] && tokens[2].includes('/')) {
                const parts = tokens[2].split('/');
                rawIp = parts[0].trim();
                const prefix = parseInt(parts[1], 10);
                if (isNaN(prefix) || prefix < 0 || prefix > 32) {
                    return {
                        success: false,
                        output: '% Invalid CIDR prefix length.',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                rawMask = getMaskFromPrefixLength(prefix);
            } else {
                if (tokens.length < 4) {
                    return {
                        success: false,
                        output: '% Incomplete command: ip address <IP> <Subnet-Mask>',
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
                rawIp = tokens[2].trim();
                rawMask = tokens[3].trim();
            }

            if (!isValidIPv4(rawIp)) {
                return {
                    success: false,
                    output: `% Invalid IPv4 address: "${rawIp}"`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            const normMask = normalizeSubnetMask(rawMask);
            if (!normMask || !isValidSubnetMask(normMask)) {
                return {
                    success: false,
                    output: `% Invalid subnet mask: "${rawMask}"`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }

            for (const [otherIfName, otherIf] of Object.entries(dev.interfaces || {})) {
                if (otherIfName !== session.selectedInterface && otherIf && otherIf.ip === rawIp) {
                    return {
                        success: false,
                        output: `% IP address ${rawIp} is already configured on ${otherIfName}.`,
                        clear: false,
                        status: 'error',
                        command,
                        device: dev
                    };
                }
            }

            pushHistory();
            const oldIp = iface.ip;
            if (oldIp && oldIp !== rawIp) {
                removeArpEntriesForIp(oldIp);
            }
            iface.ip = rawIp;
            iface.subnetMask = normMask;
            render();
            return {
                success: true,
                output: '',
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
    }

    // 14. IP ROUTE <network> <mask/prefix> <nextHop/interface> [ad] [metric]
    if (mainCmd === 'ip' && (tokens[1] === 'route' || tokens[1] === 'routes')) {
        if (isSwitch && !dev.ipRouting) {
            return {
                success: false,
                output: "% 'ip route' is a router configuration command. Switches operate at Layer 2 unless 'ip routing' is enabled.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (!isRouter && !isSwitch) {
            return {
                success: false,
                output: "% 'ip route' is a Cisco IOS command.",
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (tokens.length === 2) {
            return {
                success: true,
                output: isRouter ? formatCliRouterRoutingTable(dev) : formatCliSwitchRoutingTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
        let rawDest = '';
        let rawMask = '';
        let nextHopArg = '';
        let rawAd;
        let rawMetric;
        if (tokens[2] && tokens[2].includes('/')) {
            const parts = tokens[2].split('/');
            rawDest = parts[0].trim();
            const prefix = parseInt(parts[1], 10);
            if (isNaN(prefix) || prefix < 0 || prefix > 32) {
                return {
                    success: false,
                    output: '% Invalid CIDR prefix length.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            rawMask = getMaskFromPrefixLength(prefix);
            nextHopArg = tokens[3] ? tokens[3].trim() : '';
            rawAd = tokens[4];
            rawMetric = tokens[5];
        } else {
            if (tokens.length < 5) {
                return {
                    success: false,
                    output: '% Incomplete command: ip route <network> <mask/prefix> <next-hop/interface> [admin-distance] [metric]',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            rawDest = tokens[2].trim();
            rawMask = tokens[3].trim();
            nextHopArg = tokens[4] ? tokens[4].trim() : '';
            rawAd = tokens[5];
            rawMetric = tokens[6];
        }

        if (!isValidIPv4(rawDest)) {
            return {
                success: false,
                output: `% Invalid destination network IPv4 address: "${rawDest}"`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        const normMask = normalizeSubnetMask(rawMask);
        if (!normMask || !isValidSubnetMask(normMask)) {
            return {
                success: false,
                output: `% Invalid subnet mask: "${rawMask}"`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (!nextHopArg) {
            return {
                success: false,
                output: '% Incomplete command: missing next-hop IP or egress interface.',
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }

        let adVal = 1;
        if (rawAd !== undefined) {
            adVal = parseInt(rawAd, 10);
            if (isNaN(adVal) || adVal < 1 || adVal > 255) {
                return {
                    success: false,
                    output: '% Administrative Distance must be an integer between 1 and 255.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
        }
        let metricVal = 0;
        if (rawMetric !== undefined) {
            metricVal = parseInt(rawMetric, 10);
            if (isNaN(metricVal) || metricVal < 0) {
                return {
                    success: false,
                    output: '% Metric must be a non-negative integer.',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
        }

        let egressIface = null;
        let nextHopIp = null;
        if (isRouter) {
            const ifMatch = Object.keys(dev.interfaces || {}).find(k => k.toLowerCase() === nextHopArg.toLowerCase() || (nextHopArg.toLowerCase() === 'g0/0' && k === 'Gig0/0') || (nextHopArg.toLowerCase() === 'g0/1' && k === 'Gig0/1'));
            if (ifMatch) {
                egressIface = ifMatch;
            } else if (isValidIPv4(nextHopArg)) {
                nextHopIp = nextHopArg;
            } else {
                return {
                    success: false,
                    output: `% Invalid next-hop address or interface: "${nextHopArg}"`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
        } else if (isSwitch) {
            if (isSviName(nextHopArg)) {
                egressIface = normalizeSviName(nextHopArg);
            } else if (isValidIPv4(nextHopArg)) {
                nextHopIp = nextHopArg;
            } else {
                return {
                    success: false,
                    output: `% Invalid next-hop address or SVI interface: "${nextHopArg}"`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
        }

        pushHistory();
        const routeData = {
            network: rawDest,
            subnetMask: normMask,
            nextHop: nextHopIp || undefined,
            interface: egressIface || undefined,
            adminDistance: adVal,
            metric: metricVal
        };
        const result = addStaticRoute(dev.id, routeData);
        if (!result.success) {
            networkState.history.pop();
            return {
                success: false,
                output: `% ${result.reason}`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        render();
        return {
            success: true,
            output: '',
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 15. IPCONFIG
    if (mainCmd === 'ipconfig' || mainCmd.startsWith('ipconfig/')) {
        if (isRouter) {
            return {
                success: false,
                output: `% 'ipconfig' is for end hosts (PC/Server). On Cisco IOS routers, use 'show ip route' or check interface settings.`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        if (isSwitch) {
            return {
                success: false,
                output: `% 'ipconfig' is for end hosts. On switches, use 'show vlan brief', 'show ip interface brief', or 'show interfaces'.`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        return {
            success: true,
            output: formatCliIpconfig(dev),
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 16. IFCONFIG
    if (mainCmd === 'ifconfig') {
        if (isRouter) {
            return {
                success: true,
                output: formatCliRouterInterfaces(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
        if (isSwitch) {
            return {
                success: true,
                output: formatCliSwitchInterfaces(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
        return {
            success: true,
            output: formatCliIpconfig(dev),
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 17. ARP
    if (mainCmd === 'arp') {
        if (tokens[1] === '-a' || tokens[1] === '-g') {
            if (isRouter) {
                return {
                    success: false,
                    output: `% 'arp -a' is an end host command. On Cisco IOS routers, use 'show arp'.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (isSwitch) {
                return {
                    success: false,
                    output: `% 'arp -a' is an end host command. On switches, use 'show mac-address-table'.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliHostArpTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
        if (tokens.length === 1) {
            if (isRouter) {
                return {
                    success: true,
                    output: formatCliRouterArpTable(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (isSwitch) {
                return {
                    success: true,
                    output: formatCliSwitchMacTable(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliHostArpTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
    }

    // 18. ROUTE / ROUTE PRINT / NETSTAT -R
    if (mainCmd === 'route' || (mainCmd === 'netstat' && tokens[1] === '-r')) {
        if (isRouter) {
            return {
                success: true,
                output: formatCliRouterRoutingTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }
        if (isSwitch) {
            if (dev.ipRouting) {
                return {
                    success: true,
                    output: formatCliSwitchRoutingTable(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            return {
                success: false,
                output: `% 'route' is for routed devices. Switches operate at Layer 2 unless 'ip routing' is enabled.`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
        return {
            success: true,
            output: formatCliHostRouteTable(dev),
            clear: false,
            status: 'success',
            command,
            device: dev
        };
    }

    // 19. SHOW commands
    if (mainCmd === 'show') {
        const sub1 = tokens[1] || '';
        const sub2 = tokens[2] || '';

        // show spanning-tree / show spanningtree / show stp
        if (sub1 === 'spanning-tree' || sub1 === 'spanningtree' || sub1 === 'stp') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: `% 'show spanning-tree' is a switch command.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliSwitchSpanningTree(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show vlan / show vlan brief
        if (sub1 === 'vlan' || sub1 === 'vlans') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: `% 'show vlan' is a switch command.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliSwitchVlanBrief(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show mac-address-table / show mac address-table / show mac
        if (sub1 === 'mac-address-table' || sub1 === 'mac' || (sub1 === 'mac' && (sub2 === 'address-table' || sub2 === 'address')) || (sub1 === 'mac-address' && sub2 === 'table')) {
            if (!isSwitch) {
                return {
                    success: false,
                    output: `% 'show mac-address-table' is a switch command.${isRouter ? " On routers, use 'show arp'." : " On hosts, use 'arp -a'."}`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliSwitchMacTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show ip route / show route
        if ((sub1 === 'ip' && (sub2 === 'route' || sub2 === 'routes')) || sub1 === 'route' || sub1 === 'routes') {
            if (isSwitch) {
                return {
                    success: true,
                    output: formatCliSwitchRoutingTable(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (!isRouter) {
                return {
                    success: false,
                    output: `% 'show ip route' is a Cisco IOS router command. End hosts use 'ipconfig' or their default gateway for routing.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliRouterRoutingTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show interfaces trunk / show int trunk
        if ((sub1 === 'interfaces' || sub1 === 'interface' || sub1 === 'int') && sub2 === 'trunk') {
            if (!isSwitch) {
                return {
                    success: false,
                    output: `% 'show interfaces trunk' is a switch command.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliSwitchInterfacesTrunk(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show interfaces <port> switchport / show int <port> switchport
        if ((sub1 === 'interfaces' || sub1 === 'interface' || sub1 === 'int') && (tokens[3] === 'switchport' || sub2 === 'switchport')) {
            const portName = sub2 === 'switchport' ? (session.selectedInterface || '') : tokens[2];
            if (!isSwitch) {
                return {
                    success: false,
                    output: `% 'show interfaces switchport' is a switch command.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (!portName) {
                return {
                    success: false,
                    output: '% Incomplete command: show interfaces <port> switchport',
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliSwitchInterfaceSwitchport(dev, portName),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show ip interface brief / show ip int brief / show ip int br
        if (sub1 === 'ip' && (sub2 === 'interface' || sub2 === 'interfaces' || sub2 === 'int') && (tokens[3] === 'brief' || tokens[3] === 'br')) {
            if (isSwitch) {
                return {
                    success: true,
                    output: formatCliSwitchIpInterfaceBrief(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (!isRouter) {
                return {
                    success: false,
                    output: `% 'show ip interface brief' is a Cisco IOS router command.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliRouterIpInterfaceBrief(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show interfaces [vlan <id> | Vlan<id>] / show interface / show ip interface / show int
        if (sub1 === 'interfaces' || sub1 === 'interface' || sub1 === 'int' || (sub1 === 'ip' && (sub2 === 'interface' || sub2 === 'interfaces' || sub2 === 'int'))) {
            if (isSwitch) {
                let targetIf = tokens[2];
                if (targetIf && (isSviName(targetIf) || (targetIf.toLowerCase() === 'vlan' && tokens[3]))) {
                    const vlanId = isSviName(targetIf) ? getSviVlanId(targetIf) : parseInt(tokens[3], 10);
                    return {
                        success: true,
                        output: formatCliSwitchSviDetail(dev, vlanId),
                        clear: false,
                        status: 'success',
                        command,
                        device: dev
                    };
                }
                return {
                    success: true,
                    output: formatCliSwitchInterfaces(dev),
                    clear: false,
                    status: 'success',
                    command,
                    device: dev
                };
            }
            if (!isRouter) {
                return {
                    success: false,
                    output: `% 'show interfaces' is a Cisco IOS router command. On end hosts, use 'ipconfig' or 'ifconfig'.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliRouterInterfaces(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show arp / show ip arp
        if (sub1 === 'arp' || (sub1 === 'ip' && sub2 === 'arp')) {
            if (isSwitch) {
                return {
                    success: false,
                    output: `% 'show arp' is a router/host command. On switches, use 'show mac-address-table'.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            if (!isRouter) {
                return {
                    success: false,
                    output: `% 'show arp' is a Cisco IOS router command. On end hosts, use 'arp -a'.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliRouterArpTable(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // show access-lists / show access-list / show ip access-lists
        if (sub1 === 'access-lists' || sub1 === 'access-list' || sub1 === 'acls' || (sub1 === 'ip' && (sub2 === 'access-lists' || sub2 === 'access-list' || sub2 === 'acls'))) {
            if (!isRouter) {
                return {
                    success: false,
                    output: `% 'show access-lists' is a Cisco IOS router command. Access Control Lists are configured on routers.`,
                    clear: false,
                    status: 'error',
                    command,
                    device: dev
                };
            }
            return {
                success: true,
                output: formatCliRouterAcls(dev),
                clear: false,
                status: 'success',
                command,
                device: dev
            };
        }

        // Other show commands
        if (isRouter) {
            return {
                success: false,
                output: `% Unrecognized show command: "${command}". Available: "show ip route", "show interfaces", "show arp", "show access-lists", "show ip interface brief".`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        } else if (isSwitch) {
            return {
                success: false,
                output: `% Unrecognized show command: "${command}". Available: "show vlan brief", "show mac-address-table", "show interfaces", "show interfaces trunk", "show ip interface brief", "show ip route", "show spanning-tree".`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        } else {
            return {
                success: false,
                output: `% 'show' commands are for Cisco IOS routers/switches. End hosts support 'ipconfig', 'ifconfig', 'arp', 'route', 'ping', 'traceroute', 'help', and 'clear'.`,
                clear: false,
                status: 'error',
                command,
                device: dev
            };
        }
    }

    // 20. Real Utilities (ping, traceroute, tracert)
    if (mainCmd === 'ping') {
        const targetArg = tokens.slice(1).join(' ').trim();
        const pingRes = executeCliPing(dev, targetArg);
        return {
            ...pingRes,
            command,
            device: dev
        };
    }

    if (mainCmd === 'traceroute' || mainCmd === 'tracert') {
        const targetArg = tokens.slice(1).join(' ').trim();
        const traceRes = executeCliTraceroute(dev, targetArg);
        return {
            ...traceRes,
            command,
            device: dev
        };
    }

    // 21. Unknown / Unsupported command
    return {
        success: false,
        output: `% Invalid command or syntax: "${command}". Type "help" or "?" to see available commands.`,
        clear: false,
        status: 'error',
        command,
        device: dev
    };
}

function openDeviceTerminal(deviceId) {
    const dev = getDeviceById(deviceId);
    if (!dev || !isDeviceCliSupported(dev)) {
        updateStatus('CLI is not supported on this device.');
        return;
    }

    terminalRuntime.activeDeviceId = dev.id;
    terminalRuntime.isOpen = true;

    const modal = document.getElementById('deviceTerminalModal');
    const titleEl = document.getElementById('terminalTitle');
    const iconEl = document.getElementById('terminalDeviceIcon');
    const badgeEl = document.getElementById('terminalDeviceTypeBadge');
    const promptEl = document.getElementById('terminalPrompt');
    const inputEl = document.getElementById('terminalInput');
    const outputEl = document.getElementById('terminalOutput');

    const promptText = getDeviceCliPrompt(dev);
    const isRouter = dev.type === 'router';
    const isSwitch = dev.type === 'switch';

    if (titleEl) {
        titleEl.textContent = `${dev.name} — ${isRouter ? 'Router Console (Cisco IOS)' : (isSwitch ? 'Switch Console (Cisco IOS)' : 'Device Terminal')}`;
    }
    if (iconEl) {
        iconEl.textContent = isRouter ? '⚡' : (isSwitch ? '🔀' : '💻');
    }
    if (badgeEl) {
        badgeEl.textContent = isRouter ? 'Router CLI' : (isSwitch ? 'Switch CLI' : 'Host CLI');
        badgeEl.className = `terminal-badge ${isRouter ? 'terminal-badge--router' : (isSwitch ? 'terminal-badge--switch' : '')}`;
    }
    if (promptEl) {
        promptEl.textContent = promptText;
        promptEl.className = `terminal-prompt ${(isRouter || isSwitch) ? 'terminal-prompt--router' : ''}`;
    }

    const session = getDeviceTerminalSession(dev.id);
    session.historyIndex = -1;

    if (outputEl) {
        outputEl.innerHTML = '';
        if (session.logs.length === 0) {
            // Initial greeting
            const greeting = isRouter
                ? `Cisco IOS Software, NE-Toolkit Simulated Router\nType "help" or "?" to list available router commands.\n`
                : (isSwitch
                    ? `Cisco IOS Software, NE-Toolkit Simulated Switch\nType "help" or "?" to list available switch commands.\n`
                    : `Microsoft Windows [Version 10.0.Simulated]\n(c) NE-Toolkit Corporation. All rights reserved.\n\nType "help" or "?" to list available host commands.\n`);
            session.logs.push({
                prompt: '',
                command: '',
                output: greeting,
                status: 'info'
            });
        }

        session.logs.forEach((log) => {
            appendLogToTerminalDom(log, isRouter || isSwitch);
        });
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 50);
    }

    scrollTerminalToBottom();
}

function closeDeviceTerminal() {
    terminalRuntime.isOpen = false;
    const modal = document.getElementById('deviceTerminalModal');
    if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!terminalRuntime.isOpen) {
                modal.style.display = 'none';
            }
        }, 200);
    }
}

function appendLogToTerminalDom(log, isRouter) {
    const outputEl = document.getElementById('terminalOutput');
    if (!outputEl) return;

    const entry = document.createElement('div');
    entry.className = 'terminal-entry';

    let html = '';
    if (log.command) {
        const promptClass = isRouter ? 'terminal-command-prompt--router' : '';
        html += `<div class="terminal-command-line">
            <span class="terminal-command-prompt ${promptClass}">${escapeHtml(log.prompt)}</span>
            <span class="terminal-command-text">${escapeHtml(log.command)}</span>
        </div>`;
    }

    if (log.output) {
        const statusClass = log.status === 'error' ? 'terminal-command-response--error' :
                            log.status === 'success' ? 'terminal-command-response--success' :
                            log.status === 'info' ? 'terminal-command-response--info' : '';
        html += `<div class="terminal-command-response ${statusClass}">${escapeHtml(log.output)}</div>`;
    }

    entry.innerHTML = html;
    outputEl.appendChild(entry);
}

function scrollTerminalToBottom() {
    const body = document.getElementById('terminalBody');
    if (body) {
        body.scrollTop = body.scrollHeight;
    }
}

function handleTerminalInputSubmit() {
    const devId = terminalRuntime.activeDeviceId;
    if (!devId) return;

    const dev = getDeviceById(devId);
    if (!dev) return;

    const inputEl = document.getElementById('terminalInput');
    if (!inputEl) return;

    const rawInput = inputEl.value;
    const prompt = getDeviceCliPrompt(dev);
    const session = getDeviceTerminalSession(devId);
    const isRouter = dev.type === 'router';

    const result = executeCliCommand(devId, rawInput);

    if (result.clear) {
        clearCliTerminal(devId);
    } else if (rawInput.trim() || result.output) {
        const logEntry = {
            prompt,
            command: rawInput,
            output: result.output,
            status: result.status
        };
        session.logs.push(logEntry);
        appendLogToTerminalDom(logEntry, isRouter);
    }

    inputEl.value = '';
    session.historyIndex = -1;

    // Update active prompt & title in DOM if mode/name changed
    const promptEl = document.getElementById('terminalPrompt');
    if (promptEl) {
        promptEl.textContent = getDeviceCliPrompt(dev);
    }
    const titleEl = document.getElementById('terminalTitle');
    if (titleEl) {
        titleEl.textContent = `${dev.name} — ${isRouter ? 'Router Console (Cisco IOS)' : 'Device Terminal'}`;
    }

    scrollTerminalToBottom();
}

function handleTerminalHistoryNavigation(direction) {
    const devId = terminalRuntime.activeDeviceId;
    if (!devId) return;

    const session = getDeviceTerminalSession(devId);
    const inputEl = document.getElementById('terminalInput');
    if (!inputEl || session.history.length === 0) return;

    if (direction === 'up') {
        if (session.historyIndex === -1) {
            session.historyIndex = session.history.length - 1;
        } else if (session.historyIndex > 0) {
            session.historyIndex--;
        }
        inputEl.value = session.history[session.historyIndex] || '';
    } else if (direction === 'down') {
        if (session.historyIndex !== -1) {
            if (session.historyIndex < session.history.length - 1) {
                session.historyIndex++;
                inputEl.value = session.history[session.historyIndex] || '';
            } else {
                session.historyIndex = -1;
                inputEl.value = '';
            }
        }
    }
}

function bindTerminalEvents() {
    const closeBtn = document.getElementById('terminalCloseBtn');
    const closeActionBtn = document.getElementById('terminalCloseActionBtn');
    const backdrop = document.getElementById('terminalBackdrop');
    const clearBtn = document.getElementById('terminalClearBtn');
    const clearActionBtn = document.getElementById('terminalClearActionBtn');
    const inputEl = document.getElementById('terminalInput');

    if (closeBtn) closeBtn.addEventListener('click', closeDeviceTerminal);
    if (closeActionBtn) closeActionBtn.addEventListener('click', closeDeviceTerminal);
    if (backdrop) backdrop.addEventListener('click', closeDeviceTerminal);
    if (clearBtn) clearBtn.addEventListener('click', () => clearCliTerminal(terminalRuntime.activeDeviceId));
    if (clearActionBtn) clearActionBtn.addEventListener('click', () => clearCliTerminal(terminalRuntime.activeDeviceId));

    if (inputEl) {
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleTerminalInputSubmit();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                handleTerminalHistoryNavigation('up');
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                handleTerminalHistoryNavigation('down');
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeDeviceTerminal();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initializeLab);
