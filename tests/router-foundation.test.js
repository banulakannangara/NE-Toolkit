const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Setup mock DOM environment for Node.js testing
class MockClassList {
    constructor(element) {
        this.element = element;
        this.classes = new Set();
    }
    add(...names) {
        names.forEach(n => {
            if (n) {
                n.split(/\s+/).forEach(c => c && this.classes.add(c));
            }
        });
        this.element._className = Array.from(this.classes).join(' ');
    }
    remove(...names) {
        names.forEach(n => {
            if (n) {
                n.split(/\s+/).forEach(c => this.classes.delete(c));
            }
        });
        this.element._className = Array.from(this.classes).join(' ');
    }
    toggle(name, force) {
        if (force === true) {
            this.classes.add(name);
            this.element._className = Array.from(this.classes).join(' ');
            return true;
        }
        if (force === false) {
            this.classes.delete(name);
            this.element._className = Array.from(this.classes).join(' ');
            return false;
        }
        if (this.classes.has(name)) {
            this.classes.delete(name);
            this.element._className = Array.from(this.classes).join(' ');
            return false;
        }
        this.classes.add(name);
        this.element._className = Array.from(this.classes).join(' ');
        return true;
    }
    contains(name) {
        return this.classes.has(name);
    }
}

class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.attributes = {};
        this.dataset = {};
        this.classList = new MockClassList(this);
        this._className = '';
        this.style = {};
        this.children = [];
        this.innerHTML = '';
        this.textContent = '';
        this.value = '';
        this.disabled = false;
        this.eventListeners = {};
    }

    get className() {
        return this._className || '';
    }

    set className(val) {
        this._className = String(val || '');
        this.classList.classes.clear();
        this._className.split(/\s+/).forEach(c => c && this.classList.classes.add(c));
    }

    setAttribute(name, val) {
        this.attributes[name] = String(val);
    }

    getAttribute(name) {
        return this.attributes[name] || null;
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        this.children = this.children.filter(c => c !== child);
        return child;
    }

    remove() {
        // no-op mock
    }

    addEventListener(event, handler) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(handler);
    }

    dispatchEvent(event) {
        const handlers = this.eventListeners[event.type] || [];
        handlers.forEach(h => h(event));
    }

    querySelector(selector) {
        if (selector === '#applyDeviceConfig') {
            const el = new MockElement('button');
            el.id = 'applyDeviceConfig';
            return el;
        }
        if (selector.startsWith('[data-feedback-for=')) {
            const el = new MockElement('div');
            return el;
        }
        return new MockElement('div');
    }

    querySelectorAll(selector) {
        return [];
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
    }
}

global.performance = {
    now: () => Date.now()
};

// Global DOM mocks
global.window = {
    confirm: () => true,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    performance: global.performance
};

global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const elementsById = {};
global.document = {
    getElementById: (id) => {
        if (!elementsById[id]) {
            elementsById[id] = new MockElement('div');
            elementsById[id].id = id;
        }
        return elementsById[id];
    },
    createElement: (tag) => new MockElement(tag),
    createElementNS: (ns, tag) => new MockElement(tag),
    querySelector: (selector) => new MockElement('div'),
    querySelectorAll: (selector) => [],
    addEventListener: () => {}
};

// Initialize canvas and panels
document.getElementById('networkCanvas');
document.getElementById('connectionLayer');
document.getElementById('frameAnimationLayer');
document.getElementById('deviceLayer');
document.getElementById('propertiesPanel');
document.getElementById('statusMessage');
document.getElementById('modeBadge');
document.getElementById('simulationModeIndicator');
document.getElementById('simulationStatus');
document.getElementById('simulationEventLog');
document.getElementById('simulationControls');

const vm = require('vm');

// Load script content
const scriptCode = fs.readFileSync(path.join(__dirname, '../js/network-lab.js'), 'utf8');

const sandbox = {
    window: global.window,
    document: global.document,
    ResizeObserver: global.ResizeObserver,
    performance: global.performance,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    assert,
    process
};

const context = vm.createContext(sandbox);
vm.runInContext(scriptCode, context);


vm.runInContext(`
let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log('PASS: ' + name);
        testsPassed++;
    } catch (err) {
        console.error('FAIL: ' + name);
        console.error(err);
        testsFailed++;
    }
}

console.log('--- RUNNING ROUTER FOUNDATION & REGRESSION TESTS ---');

function resetLab() {
    networkState.devices = [];
    networkState.connections = [];
    networkState.selectedDeviceId = null;
    networkState.selectedConnectionId = null;
    networkState.mode = 'select';
    networkState.pendingDeviceType = 'pc';
    networkState.connectionSourceId = null;
    networkState.labMode = 'edit';
    networkState.simulationRuntime = { isRunning: false, events: [] };
    networkState.sendFrameState = null;
    networkState.lastFrameResult = null;
    networkState.switchRuntime = {};
    networkState.routerRuntime = {};
    networkState.arpRuntime = {};
    networkState.typeCounters = {};
    networkState.connectionCounter = 0;
    networkState.connectionTestState = null;
    networkState.lastConnectionTestResult = null;
    networkState.history = [];
    networkState.future = [];
    inspectorDrafts = {};
}

// 1. Router creation
runTest('1. Router creation', () => {
    resetLab();
    addDevice('router', 200, 200);
    assert.strictEqual(networkState.devices.length, 1);
    assert.strictEqual(networkState.devices[0].type, 'router');
});

// 2. Router unique ID / Name
runTest('2. Router unique ID and naming (Router0, Router1)', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('router', 200, 200);
    assert.strictEqual(networkState.devices[0].id, 'Router0');
    assert.strictEqual(networkState.devices[0].name, 'Router0');
    assert.strictEqual(networkState.devices[1].id, 'Router1');
    assert.strictEqual(networkState.devices[1].name, 'Router1');
});

// 3. Gig0/0 exists
runTest('3. Interface Gig0/0 exists on created Router', () => {
    resetLab();
    addDevice('router', 150, 150);
    const router = networkState.devices[0];
    assert.ok(router.interfaces, 'interfaces object must exist');
    assert.ok(router.interfaces['Gig0/0'], 'Gig0/0 interface must exist');
    assert.strictEqual(router.interfaces['Gig0/0'].name, 'Gig0/0');
    assert.strictEqual(router.interfaces['Gig0/0'].status, 'up');
});

// 4. Gig0/1 exists
runTest('4. Interface Gig0/1 exists on created Router', () => {
    resetLab();
    addDevice('router', 150, 150);
    const router = networkState.devices[0];
    assert.ok(router.interfaces['Gig0/1'], 'Gig0/1 interface must exist');
    assert.strictEqual(router.interfaces['Gig0/1'].name, 'Gig0/1');
    assert.strictEqual(router.interfaces['Gig0/1'].status, 'up');
});

// 5. Both interfaces have unique MAC addresses
runTest('5. Both interfaces have unique MAC addresses and are globally unique', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 200, 200);
    addDevice('router', 300, 300);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];

    const pcMac = pc.mac;
    const r0_gig0 = r0.interfaces['Gig0/0'].mac;
    const r0_gig1 = r0.interfaces['Gig0/1'].mac;
    const r1_gig0 = r1.interfaces['Gig0/0'].mac;
    const r1_gig1 = r1.interfaces['Gig0/1'].mac;

    const allMacs = [pcMac, r0_gig0, r0_gig1, r1_gig0, r1_gig1];
    const uniqueMacs = new Set(allMacs);

    assert.strictEqual(allMacs.length, uniqueMacs.size, 'All MAC addresses across devices and interfaces must be unique');
    assert.notStrictEqual(r0_gig0, r0_gig1, 'Router Gig0/0 and Gig0/1 must have distinct MACs');
});

// 6. Router inspector renders both interfaces
runTest('6. Router inspector renders both interfaces and device metadata', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    const html = renderRouterInspector(router);

    assert.ok(html.includes('DEVICE'), 'Must render DEVICE heading');
    assert.ok(html.includes('Router0'), 'Must render Device Name Router0');
    assert.ok(html.includes('INTERFACES'), 'Must render INTERFACES heading');
    assert.ok(html.includes('Gig0/0'), 'Must render Gig0/0 section');
    assert.ok(html.includes('Gig0/1'), 'Must render Gig0/1 section');
    assert.ok(html.includes(router.interfaces['Gig0/0'].mac), 'Must display Gig0/0 MAC');
    assert.ok(html.includes(router.interfaces['Gig0/1'].mac), 'Must display Gig0/1 MAC');
});

// 7. Router can connect to Switch0
runTest('7. Router can connect to Switch0', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('router', 250, 100);

    addConnection('Switch0', 'Router0');
    assert.strictEqual(networkState.connections.length, 1);
    assert.strictEqual(networkState.connections[0].source, 'Switch0');
    assert.strictEqual(networkState.connections[0].target, 'Router0');
});

// 8. Router interface assignment is preserved (Gig0/0 then Gig0/1)
runTest('8. Router interface assignment assigns Gig0/0 then Gig0/1', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('server', 350, 100);

    addConnection('Switch0', 'Router0'); // 1st router connection
    const conn1Id = networkState.connections[0].id;
    assert.strictEqual(getRouterPortLabel('Router0', conn1Id), 'Gig0/0');

    addConnection('Server0', 'Router0'); // 2nd router connection
    const conn2Id = networkState.connections[1].id;
    assert.strictEqual(getRouterPortLabel('Router0', conn2Id), 'Gig0/1');

    // Attempting a 3rd connection to Router0
    addDevice('laptop', 450, 100);
    const connCountBefore = networkState.connections.length;
    addConnection('Laptop0', 'Router0');
    assert.strictEqual(networkState.connections.length, connCountBefore, '3rd connection to Router0 must be rejected');
});

// 9. Router movement works with Undo/Redo
runTest('9. Router movement works with Undo/Redo', () => {
    resetLab();
    addDevice('router', 100, 100);
    const initialX = networkState.devices[0].x;

    pushHistory();
    networkState.devices[0].x = 400;
    networkState.devices[0].y = 300;

    assert.strictEqual(networkState.devices[0].x, 400);

    undo();
    assert.strictEqual(networkState.devices[0].x, initialX, 'Undo must restore router position');

    redo();
    assert.strictEqual(networkState.devices[0].x, 400, 'Redo must reapply router position');
});

// 10. Router creation/deletion works with Undo/Redo
runTest('10. Router creation and deletion works with Undo/Redo', () => {
    resetLab();
    addDevice('router', 100, 100);
    assert.strictEqual(networkState.devices.length, 1);

    deleteDevice('Router0');
    assert.strictEqual(networkState.devices.length, 0);

    undo();
    assert.strictEqual(networkState.devices.length, 1);
    assert.strictEqual(networkState.devices[0].id, 'Router0');
    assert.ok(networkState.devices[0].interfaces['Gig0/0']);

    redo();
    assert.strictEqual(networkState.devices.length, 0);
});

// 11. Interface data survives snapshots
runTest('11. Interface configuration data survives snapshots and serialization', () => {
    resetLab();
    addDevice('router', 100, 100);
    networkState.devices[0].interfaces['Gig0/0'].ip = '192.168.10.1';
    networkState.devices[0].interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    networkState.devices[0].interfaces['Gig0/1'].ip = '10.0.0.1';
    networkState.devices[0].interfaces['Gig0/1'].subnetMask = '255.255.0.0';

    const snapshot = createLabSnapshot();
    resetLab();
    restoreSnapshot(snapshot);

    assert.strictEqual(networkState.devices.length, 1);
    const restored = networkState.devices[0];
    assert.strictEqual(restored.interfaces['Gig0/0'].ip, '192.168.10.1');
    assert.strictEqual(restored.interfaces['Gig0/0'].subnetMask, '255.255.255.0');
    assert.strictEqual(restored.interfaces['Gig0/1'].ip, '10.0.0.1');
    assert.strictEqual(restored.interfaces['Gig0/1'].subnetMask, '255.255.0.0');
});

// 12. Existing duplicate MAC validation still works
runTest('12. Duplicate MAC validation detects collisions across router interfaces and hosts', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 200, 200);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];

    // Check if PC MAC is detected when searched
    assert.ok(findDeviceByMac(pc.mac, null, networkState.devices));
    // Check if Router Gig0/0 MAC is detected
    assert.ok(findDeviceByMac(router.interfaces['Gig0/0'].mac, null, networkState.devices));
    // Check excluding self
    assert.strictEqual(findDeviceByMac(pc.mac, pc.id, networkState.devices), null);
    assert.strictEqual(findDeviceByMac(router.interfaces['Gig0/0'].mac, router.id, networkState.devices, 'Gig0/0'), null);
    // Colliding with Router's other interface
    const duplicate = findDeviceByMac(router.interfaces['Gig0/1'].mac, router.id, networkState.devices, 'Gig0/0');
    assert.ok(duplicate, 'Should detect MAC collision with other interface on same router');
});

// 13. Existing V5.1 regression tests
runTest('13. V5.1 Regression: PC-Switch-PC topology, MAC learning and frame transmission', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    // Test communication analysis
    const comm = analyzeCommunication(pc0, pc1);
    assert.strictEqual(comm.possible, true, 'Direct subnet communication between PC0 and PC1 must be possible');

    // Simulate frame from PC0 to PC1
    const frameResult = simulateSendFrame(pc0, pc1);
    assert.strictEqual(frameResult.success, true, 'Frame delivery from PC0 to PC1 must succeed');
    assert.strictEqual(frameResult.action, 'FLOOD', 'Initial delivery should flood unknown MAC');

    // Switch should have learned PC0 MAC
    const switchMacs = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(switchMacs.length, 1);
    assert.strictEqual(switchMacs[0].mac, normalizeMacAddress(pc0.mac));
    assert.strictEqual(switchMacs[0].port, 'Fa0/1');

    // Send frame in reverse direction (PC1 -> PC0)
    const frameResult2 = simulateSendFrame(pc1, pc0);
    assert.strictEqual(frameResult2.success, true);
    assert.strictEqual(frameResult2.action, 'FORWARD', 'Return frame should be forwarded via learned MAC');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 2);
});

// 14. Router interface configuration updates via Apply Changes
runTest('14. Router interface configuration updates via Apply Changes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    networkState.selectedDeviceId = router.id;

    // Set inspector draft for Gig0/0 and Gig0/1
    inspectorDrafts[router.id] = {
        'interfaces.Gig0/0.ip': '192.168.1.1',
        'interfaces.Gig0/0.subnetMask': '255.255.255.0',
        'interfaces.Gig0/1.ip': '10.0.0.1',
        'interfaces.Gig0/1.subnetMask': '/16'
    };

    assert.strictEqual(getInspectorValidity(router, inspectorDrafts[router.id]), true);

    applyDeviceConfiguration();

    assert.strictEqual(router.interfaces['Gig0/0'].ip, '192.168.1.1');
    assert.strictEqual(router.interfaces['Gig0/0'].subnetMask, '255.255.255.0');
    assert.strictEqual(router.interfaces['Gig0/1'].ip, '10.0.0.1');
    assert.strictEqual(router.interfaces['Gig0/1'].subnetMask, '255.255.0.0');

    // Undo should restore previous state
    undo();
    const restoredRouter = networkState.devices[0];
    assert.strictEqual(restoredRouter.interfaces['Gig0/0'].ip, '');
    assert.strictEqual(restoredRouter.interfaces['Gig0/1'].ip, '');

    // Redo should reapply configuration
    redo();
    const redoneRouter = networkState.devices[0];
    assert.strictEqual(redoneRouter.interfaces['Gig0/0'].ip, '192.168.1.1');
    assert.strictEqual(redoneRouter.interfaces['Gig0/1'].ip, '10.0.0.1');
});

// 15. Invalid Router interface configuration is rejected
runTest('15. Invalid Router interface configuration is rejected by inspector validity', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    // Invalid IP
    assert.strictEqual(getInspectorValidity(router, { 'interfaces.Gig0/0.ip': '999.999.1.1' }), false);
    // Invalid Subnet Mask
    assert.strictEqual(getInspectorValidity(router, { 'interfaces.Gig0/0.subnetMask': '255.255.0.255' }), false);
    // Invalid MAC format
    assert.strictEqual(getInspectorValidity(router, { 'interfaces.Gig0/0.mac': 'INVALID_MAC' }), false);
    // Duplicate MAC across interfaces
    assert.strictEqual(getInspectorValidity(router, {
        'interfaces.Gig0/0.mac': '02:4A:7B:10:00:AA',
        'interfaces.Gig0/1.mac': '02:4A:7B:10:00:AA'
    }), false);
});

// 16. Deleting connection frees router interface for reuse
runTest('16. Deleting connection frees router interface for reuse', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('router', 250, 100);
    addDevice('pc', 400, 100);

    addConnection('Switch0', 'Router0');
    addConnection('PC0', 'Router0');
    assert.strictEqual(getRouterAvailablePortCount('Router0'), 0);

    // Delete first connection
    const firstConnId = networkState.connections[0].id;
    deleteConnection(firstConnId);
    assert.strictEqual(getRouterAvailablePortCount('Router0'), 1);

    // Now adding another connection to Router0 succeeds
    addDevice('laptop', 500, 100);
    addConnection('Laptop0', 'Router0');
    assert.strictEqual(networkState.connections.length, 2);
});

// 17. Test Connection can be started directly without Connect mode
runTest('17. Test Connection mode can be started directly and completes analysis', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('pc', 300, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';
    addConnection('PC0', 'PC1');
    setMode('select');

    // Click "Test Connection" toolbar action directly (mode is 'select')
    assert.strictEqual(networkState.mode, 'select');
    handleToolbarAction('testConnection');

    assert.ok(networkState.connectionTestState, 'connectionTestState should be active');
    assert.strictEqual(networkState.connectionTestState.phase, 'awaitSource');

    // Click source device PC0
    const mockEvent = { stopPropagation: () => {} };
    handleDeviceSelection('PC0', mockEvent);
    assert.strictEqual(networkState.connectionTestState.phase, 'awaitDestination');
    assert.strictEqual(networkState.connectionTestState.sourceId, 'PC0');

    // Click destination device PC1
    handleDeviceSelection('PC1', mockEvent);
    assert.strictEqual(networkState.connectionTestState.phase, 'complete');
    assert.ok(networkState.lastConnectionTestResult, 'Test result should be generated');
    assert.strictEqual(networkState.lastConnectionTestResult.possible, true);
});

// 18. Send Frame directly triggers full animation lifecycle
runTest('18. Send Frame directly triggers animation lifecycle and frame packet creation', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    // Start Send Frame directly
    handleToolbarAction('sendFrame');
    assert.ok(networkState.sendFrameState);
    assert.strictEqual(networkState.sendFrameState.phase, 'awaitSource');

    const mockEvent = { stopPropagation: () => {} };
    handleDeviceSelection('PC0', mockEvent);
    assert.strictEqual(networkState.sendFrameState.phase, 'awaitDestination');

    // Selecting destination triggers animation and panel rendering
    handleDeviceSelection('PC1', mockEvent);
    assert.ok(networkState.lastFrameResult);
    assert.strictEqual(networkState.lastFrameResult.success, true);
    assert.strictEqual(networkState.lastFrameResult.action, 'FLOOD');

    // Check that frame packet element was created in frameAnimationLayer
    const layer = document.getElementById('frameAnimationLayer');
    assert.ok(layer.children.length > 0, 'Frame packet must be added to frameAnimationLayer');
    assert.strictEqual(layer.children[0].className, 'frame-packet is-moving');

    // Check getSendFramePanelHtml renders properly
    const panelHtml = getSendFramePanelHtml();
    assert.ok(panelHtml.includes('Send Frame'));
    assert.ok(panelHtml.includes('FLOOD'));
    assert.ok(panelHtml.includes('PC0'));
    assert.ok(panelHtml.includes('PC1'));
});

// 19. Subsequent Send Frame uses learned MAC for FORWARD action
runTest('19. Subsequent Send Frame uses learned MAC for FORWARD action', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    const mockEvent = { stopPropagation: () => {} };

    // 1st transmission: PC0 -> PC1 (FLOOD)
    handleToolbarAction('sendFrame');
    handleDeviceSelection('PC0', mockEvent);
    handleDeviceSelection('PC1', mockEvent);
    assert.strictEqual(networkState.lastFrameResult.action, 'FLOOD');

    // Finish 1st animation
    networkState.sendFrameState = {
        phase: 'complete',
        sourceId: 'PC0',
        message: null
    };

    // 2nd transmission: PC1 -> PC0 (FORWARD)
    handleToolbarAction('sendFrame');
    assert.strictEqual(networkState.sendFrameState.phase, 'awaitSource');
    handleDeviceSelection('PC1', mockEvent);
    assert.strictEqual(networkState.sendFrameState.phase, 'awaitDestination');
    handleDeviceSelection('PC0', mockEvent);
    assert.ok(networkState.lastFrameResult);
    assert.strictEqual(networkState.lastFrameResult.action, 'FORWARD');
});

// 20. Valid PC -> Router -> Server inter-subnet communication
runTest('20. Valid PC -> Router -> Server inter-subnet communication succeeds', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = analyzeCommunication(pc, server);
    assert.strictEqual(result.possible, true, 'Layer-3 path PC0 -> Router0 -> Server0 should be possible');
    assert.deepStrictEqual(result.path, ['PC0', 'Router0', 'Server0']);
    assert.strictEqual(result.sourceIp, '192.168.1.10');
    assert.strictEqual(result.destinationIp, '10.0.0.10');
});

// 21. Valid PC -> Switch -> Router -> Switch -> Server inter-subnet communication
runTest('21. Valid PC -> Switch -> Router -> Switch -> Server inter-subnet communication succeeds', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('switch', 350, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[2];
    const server = networkState.devices[4];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'Switch1');
    addConnection('Switch1', 'Server0');

    const result = analyzeCommunication(pc, server);
    assert.strictEqual(result.possible, true, 'Inter-subnet path with intermediate switches should succeed');
    assert.deepStrictEqual(result.path, ['PC0', 'Switch0', 'Router0', 'Switch1', 'Server0']);
});

// 22. Different subnets with no router fails
runTest('22. Different subnets with no router on the path fails', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Server0');

    const result = analyzeCommunication(pc, server);
    assert.strictEqual(result.possible, false);
    assert.ok(result.reason.includes('no router'), 'Reason should indicate no router on path');
});

// 23. Wrong or missing source gateway fails
runTest('23. Wrong or missing source gateway fails inter-subnet communication', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = ''; // Missing gateway

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    // Missing source gateway
    const result1 = analyzeCommunication(pc, server);
    assert.strictEqual(result1.possible, false);
    assert.ok(result1.reason.includes('gateway'), 'Must mention gateway');

    // Wrong source gateway (mismatch with router Gig0/0)
    pc.gateway = '192.168.1.254';
    const result2 = analyzeCommunication(pc, server);
    assert.strictEqual(result2.possible, false);
    assert.ok(result2.reason.includes('match') || result2.reason.includes('gateway'));
});

// 24. Router missing destination-side interface fails
runTest('24. Router missing destination-side interface on required subnet fails', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '172.16.1.1'; // Not on 10.0.0.0/24 subnet!
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = analyzeCommunication(pc, server);
    assert.strictEqual(result.possible, false);
    assert.ok(result.reason.includes('destination subnet') || result.reason.includes('not on'));
});

// 25. Invalid destination gateway fails
runTest('25. Invalid destination gateway fails inter-subnet communication', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.254'; // Doesn't match router interface 10.0.0.1

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = analyzeCommunication(pc, server);
    assert.strictEqual(result.possible, false);
    assert.ok(result.reason.includes('Destination default gateway'));
});

// 26. Existing same-subnet communication still succeeds
runTest('26. Existing same-subnet communication still succeeds', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('pc', 300, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'PC1');

    const result = analyzeCommunication(pc0, pc1);
    assert.strictEqual(result.possible, true);
    assert.strictEqual(result.network, '192.168.1.0/24');
});

// 27. Send Frame PC0 -> Router0 -> Server0 Layer-3 simulation
runTest('27. Send Frame PC0 -> Router0 -> Server0 Layer-3 routing simulation', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true, 'Inter-subnet frame should succeed');
    assert.deepStrictEqual(result.path, ['PC0', 'Router0', 'Server0']);

    const events = result.events.join(' | ');
    assert.ok(events.includes('Frame received by Router0 on Gig0/0'), 'Must log router ingress on Gig0/0');
    assert.ok(events.includes('Router0 routed frame from Gig0/0 to Gig0/1'), 'Must log router routing decision');
    assert.ok(events.includes('Router0 rewrote source MAC to ' + router.interfaces['Gig0/1'].mac), 'Must log source MAC rewrite');
    assert.ok(events.includes('Router0 set destination MAC to ' + server.mac), 'Must log destination MAC update');
    assert.ok(events.includes('Server0 received frame'), 'Must log server received frame');
});

// 28. Send Frame PC0 -> Switch0 -> Router0 -> Switch1 -> Server0 multi-hop
runTest('28. Send Frame PC0 -> Switch0 -> Router0 -> Switch1 -> Server0 multi-hop routing', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('switch', 350, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[2];
    const server = networkState.devices[4];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'Switch1');
    addConnection('Switch1', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true, 'Multi-hop inter-subnet frame should succeed');

    // Switch0 should learn PC0 MAC
    const sw0Macs = getSwitchRuntime('Switch0').macTable;
    assert.ok(sw0Macs.some(e => e.mac === normalizeMacAddress(pc.mac)), 'Switch0 must learn PC0 MAC');

    // Switch1 on downstream LAN should learn Router0 Gig0/1 MAC (not PC0 MAC!)
    const sw1Macs = getSwitchRuntime('Switch1').macTable;
    assert.ok(sw1Macs.some(e => e.mac === normalizeMacAddress(router.interfaces['Gig0/1'].mac)), 'Switch1 must learn Router0 Gig0/1 MAC');
    assert.strictEqual(sw1Macs.some(e => e.mac === normalizeMacAddress(pc.mac)), false, 'Switch1 must NOT learn PC0 MAC directly');
});

// 29. Same-subnet Send Frame regression test
runTest('29. Same-subnet Send Frame regression (PC0 -> Switch0 -> PC1)', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    const result1 = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.action, 'FLOOD');

    const result2 = simulateSendFrame(pc1, pc0);
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.action, 'FORWARD');
});

// 30. Inter-subnet invalid gateway refuses Send Frame
runTest('30. Inter-subnet invalid gateway refuses Send Frame and returns DROP', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.99'; // Invalid gateway

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('gateway') || result.reason.includes('match'));
});

// 31. IPv4 packet creation inside Ethernet frame
runTest('31. IPv4 packet creation inside Ethernet frame', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.ok(result.packet, 'Packet object must exist inside frame result');
    assert.strictEqual(result.packet.sourceIp, '192.168.1.10');
    assert.strictEqual(result.packet.destinationIp, '10.0.0.10');
});

// 32. Single router TTL decrement (64 -> 63)
runTest('32. Single router TTL decrement (64 -> 63)', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 63, 'TTL must be decremented from 64 to 63');
    assert.strictEqual(result.packet.sourceIp, '192.168.1.10', 'Source IP must remain unchanged');
    assert.strictEqual(result.packet.destinationIp, '10.0.0.10', 'Destination IP must remain unchanged');

    const events = result.events.join(' | ');
    assert.ok(events.includes('Router0 decremented IP TTL to 63'), 'Must log TTL decrement event');
});

// 33. Multi-router TTL decrement (64 -> 63 -> 62)
runTest('33. Multi-router TTL decrement (64 -> 63 -> 62)', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    // Router0: Gig0/0 facing PC (192.168.1.1/24), Gig0/1 facing Router1 (172.16.1.1/24)
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Router1: Gig0/0 facing Router0 (172.16.1.2/24), Gig0/1 facing Server (10.0.0.1/24)
    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.0.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Server0');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true, 'Multi-router simulation must succeed');
    assert.strictEqual(result.packet.ttl, 62, 'TTL must be decremented from 64 to 62');

    const events = result.events.join(' | ');
    assert.ok(events.includes('Router0 decremented IP TTL to 63'), 'Router0 must log TTL 63');
    assert.ok(events.includes('Router1 decremented IP TTL to 62'), 'Router1 must log TTL 62');
});

// 34. TTL expiration at router (TTL reaches 0 -> DROP)
runTest('34. TTL expiration at router (initialTtl = 1 -> TTL drops to 0 -> DROP)', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    // Run simulation with initialTtl = 1
    const result = simulateSendFrame(pc, server, { initialTtl: 1 });
    assert.strictEqual(result.success, false, 'Simulation must fail on TTL expiration');
    assert.strictEqual(result.action, 'DROP', 'Action must be DROP');
    assert.strictEqual(result.packet.ttl, 0, 'TTL must be 0');
    assert.deepStrictEqual(result.path, ['PC0', 'Router0'], 'Path must stop at dropping router');
    assert.ok(result.reason.includes('TTL') || result.reason.includes('Time to Live'), 'Reason must explain TTL drop');

    const events = result.events.join(' | ');
    assert.ok(events.includes('Router0 decremented IP TTL to 0'), 'Must log TTL decremented to 0');
    assert.ok(events.includes('Router0 dropped packet: Time to Live (TTL) expired in transit'), 'Must log TTL expiration drop event');
    assert.strictEqual(events.includes('Server0 received frame'), false, 'Server must not receive the frame');
});

// 35. Same-subnet Send Frame regression (TTL remains 64 across switch)
runTest('35. Same-subnet Send Frame regression (TTL remains 64 across switch)', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    const result1 = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.action, 'FLOOD');
    assert.strictEqual(result1.packet.ttl, 64, 'TTL must remain 64 on switch hop');

    const result2 = simulateSendFrame(pc1, pc0);
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.action, 'FORWARD');
    assert.strictEqual(result2.packet.ttl, 64, 'TTL must remain 64 on return frame');
});

// 36. ICMP Echo Request packet creation
runTest('36. ICMP Echo Request packet creation', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 42,
            sequence: 7
        }
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.packet, 'Packet must exist in result');
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.ok(result.packet.icmp, 'ICMP structure must exist');
    assert.strictEqual(result.packet.icmp.identifier, 42);
    assert.strictEqual(result.packet.icmp.sequence, 7);
});

// 37. ICMP Echo Request successfully reaches destination and generates Echo Reply
runTest('37. ICMP Echo Request reaches destination and generates Echo Reply', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 1,
            sequence: 1
        }
    });

    assert.strictEqual(result.success, true);
    const events = result.events.join(' | ');
    assert.ok(events.includes('PC0 sent ICMP Echo Request to Server0'), 'Must log request sent from PC0');
    assert.ok(events.includes('Server0 received ICMP Echo Request'), 'Must log request received by Server0');
    assert.ok(events.includes('Server0 generated ICMP Echo Reply to PC0'), 'Must log reply generated by Server0');
});

// 38. Echo Reply traverses reverse path and reaches original source
runTest('38. Echo Reply traverses reverse path and reaches original source', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 1,
            sequence: 1
        }
    });

    assert.strictEqual(result.success, true);
    const events = result.events.join(' | ');
    assert.ok(events.includes('PC0 received ICMP Echo Reply'), 'Must log reply received by PC0');
    assert.strictEqual(result.packet.sourceIp, '10.0.0.10', 'Reply source IP must be Server0');
    assert.strictEqual(result.packet.destinationIp, '192.168.1.10', 'Reply destination IP must be PC0');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY', 'Type must be ECHO_REPLY');
});

// 39. Router decrements TTL for both request and reply
runTest('39. Router decrements TTL for both request and reply', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 1,
            sequence: 1
        }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 63, 'Reply TTL arriving at PC0 must be 63');

    const decrementCount = result.events.filter(e => e.includes('Router0 decremented IP TTL to 63')).length;
    assert.strictEqual(decrementCount, 2, 'Router0 must decrement TTL once on request and once on reply (2 times total)');
});

// 40. ICMP identifier and sequence are preserved between request and reply
runTest('40. ICMP identifier and sequence are preserved between request and reply', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 999,
            sequence: 123
        }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.icmp.identifier, 999);
    assert.strictEqual(result.packet.icmp.sequence, 123);
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
});

// 41. TTL expiration on the request fails correctly
runTest('41. TTL expiration on the request fails correctly', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, {
        initialTtl: 1,
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 1,
            sequence: 1
        }
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('TTL') || result.reason.includes('Time to Live'));

    const events = result.events.join(' | ');
    assert.ok(events.includes('Router0 dropped packet: Time to Live (TTL) expired in transit'));
    assert.strictEqual(events.includes('Server0 received ICMP Echo Request'), false);
    assert.strictEqual(events.includes('PC0 received ICMP Echo Reply'), false);
});

// 42. Existing same-subnet PC -> Switch -> PC Send Frame regression still passes
runTest('42. Existing same-subnet PC -> Switch -> PC Send Frame regression still passes', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    const result1 = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.action, 'FLOOD');
    assert.strictEqual(result1.packet.ttl, 64);

    const result2 = simulateSendFrame(pc1, pc0);
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.action, 'FORWARD');
    assert.strictEqual(result2.packet.ttl, 64);
});

// 43. Initial ARP cache is empty on devices
runTest('43. Initial ARP cache is empty on devices', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);

    const pcTable = getArpTable('PC0');
    assert.ok(Array.isArray(pcTable), 'ARP table must be an array');
    assert.strictEqual(pcTable.length, 0, 'Initial PC ARP table must be empty');

    const routerTable = getArpTable('Router0');
    assert.ok(Array.isArray(routerTable), 'Router ARP table must be an array');
    assert.strictEqual(routerTable.length, 0, 'Initial Router ARP table must be empty');

    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), null, 'Lookup on empty table returns null');
});

// 44. ARP learning, lookup, and entry update
runTest('44. ARP learning, lookup, and entry update', () => {
    resetLab();
    addDevice('pc', 100, 100);

    const entry = learnArp('PC0', '192.168.1.1', '00:1A:2B:3C:4D:5E');
    assert.ok(entry, 'learnArp must return created entry');
    assert.strictEqual(entry.ip, '192.168.1.1');
    assert.strictEqual(entry.mac, '00:1A:2B:3C:4D:5E');

    const lookedUpMac = lookupArp('PC0', '192.168.1.1');
    assert.strictEqual(lookedUpMac, '00:1A:2B:3C:4D:5E', 'lookupArp must return learned MAC');

    const table = getArpTable('PC0');
    assert.strictEqual(table.length, 1);

    // Update same IP with new MAC
    learnArp('PC0', '192.168.1.1', 'AA:BB:CC:DD:EE:FF');
    assert.strictEqual(table.length, 1, 'Updating existing IP must not create duplicate entry');
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), 'AA:BB:CC:DD:EE:FF', 'Lookup must return updated MAC');
});

// 45. Clear ARP table for specific device and globally
runTest('45. Clear ARP table for specific device and globally', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('pc', 300, 100);

    learnArp('PC0', '192.168.1.1', '00:11:22:33:44:55');
    learnArp('PC1', '192.168.1.2', '66:77:88:99:AA:BB');

    assert.strictEqual(getArpTable('PC0').length, 1);
    assert.strictEqual(getArpTable('PC1').length, 1);

    clearArpTable('PC0');
    assert.strictEqual(getArpTable('PC0').length, 0, 'PC0 table must be cleared');
    assert.strictEqual(getArpTable('PC1').length, 1, 'PC1 table must remain intact');

    clearArpTable(); // Global clear
    assert.strictEqual(getArpTable('PC1').length, 0, 'Global clear must reset all ARP tables');
});

// 46. Snapshot restoration preserves ARP tables
runTest('46. Snapshot restoration preserves ARP tables', () => {
    resetLab();
    addDevice('pc', 100, 100);
    learnArp('PC0', '192.168.1.254', 'FE:DC:BA:98:76:54');

    const snapshot = createLabSnapshot();

    resetLab();
    assert.strictEqual(getArpTable('PC0').length, 0, 'resetLab must clear ARP tables');

    restoreSnapshot(snapshot);
    assert.strictEqual(lookupArp('PC0', '192.168.1.254'), 'FE:DC:BA:98:76:54', 'Snapshot restore must restore ARP cache');
});

console.log('----------------------------------------------------');
console.log('Total tests: ' + (testsPassed + testsFailed) + ' | Passed: ' + testsPassed + ' | Failed: ' + testsFailed);
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}
`, context);
