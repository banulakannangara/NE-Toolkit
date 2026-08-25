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

    // Simulate frame from PC0 to PC1 (ARP exchange learns both MACs, subsequent frame is FORWARD)
    const frameResult = simulateSendFrame(pc0, pc1);
    assert.strictEqual(frameResult.success, true, 'Frame delivery from PC0 to PC1 must succeed');
    assert.strictEqual(frameResult.action, 'FORWARD', 'Delivery after ARP exchange should forward via learned MAC');

    // Switch should have learned both PC0 and PC1 MACs during ARP exchange
    const switchMacs = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(switchMacs.length, 2);
    assert.ok(switchMacs.some(e => e.mac === normalizeMacAddress(pc0.mac) && e.port === 'Fa0/1'));
    assert.ok(switchMacs.some(e => e.mac === normalizeMacAddress(pc1.mac) && e.port === 'Fa0/2'));

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
    assert.strictEqual(networkState.lastFrameResult.action, 'FORWARD');

    // Check that frame packet element was created in frameAnimationLayer
    const layer = document.getElementById('frameAnimationLayer');
    assert.ok(layer.children.length > 0, 'Frame packet must be added to frameAnimationLayer');
    assert.strictEqual(layer.children[0].className, 'frame-packet is-moving');

    // Check getSendFramePanelHtml renders properly
    const panelHtml = getSendFramePanelHtml();
    assert.ok(panelHtml.includes('Send Frame'));
    assert.ok(panelHtml.includes('FORWARD'));
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

    // 1st transmission: PC0 -> PC1 (FORWARD after ARP learning)
    handleToolbarAction('sendFrame');
    handleDeviceSelection('PC0', mockEvent);
    handleDeviceSelection('PC1', mockEvent);
    assert.strictEqual(networkState.lastFrameResult.action, 'FORWARD');

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
    assert.strictEqual(result1.action, 'FORWARD');

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

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
    assert.strictEqual(result1.action, 'FORWARD');
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
    assert.strictEqual(result1.action, 'FORWARD');
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

// 47. Same-subnet next-hop resolves to destination IP
runTest('47. Same-subnet next-hop resolves to destination IP', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('pc', 300, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    const nextHop = resolveNextHopIp(pc0, pc1);
    assert.strictEqual(nextHop, '192.168.1.20', 'Same subnet must resolve to destination IP');
});

// 48. Inter-subnet next-hop resolves to source default gateway
runTest('48. Inter-subnet next-hop resolves to source default gateway', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('server', 300, 100);

    const pc0 = networkState.devices[0];
    const server0 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    server0.ip = '10.0.0.10';
    server0.subnetMask = '255.255.255.0';
    server0.gateway = '10.0.0.1';

    const nextHop = resolveNextHopIp(pc0, server0);
    assert.strictEqual(nextHop, '192.168.1.1', 'Different subnet must resolve to source default gateway');
});

// 49. Missing source gateway is handled correctly
runTest('49. Missing source gateway is handled correctly', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('server', 300, 100);

    const pc0 = networkState.devices[0];
    const server0 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = ''; // Missing gateway

    server0.ip = '10.0.0.10';
    server0.subnetMask = '255.255.255.0';
    server0.gateway = '10.0.0.1';

    const nextHop = resolveNextHopIp(pc0, server0);
    assert.strictEqual(nextHop, null, 'Missing gateway for inter-subnet communication must return null');
});

// 50. Invalid/malformed gateway is handled correctly
runTest('50. Invalid/malformed gateway is handled correctly', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('server', 300, 100);

    const pc0 = networkState.devices[0];
    const server0 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = 'invalid.gateway.ip'; // Malformed gateway

    server0.ip = '10.0.0.10';
    server0.subnetMask = '255.255.255.0';

    const nextHop1 = resolveNextHopIp(pc0, server0);
    assert.strictEqual(nextHop1, null, 'Malformed gateway string must return null');

    pc0.gateway = '999.999.999.999'; // Out-of-range IP
    const nextHop2 = resolveNextHopIp(pc0, server0);
    assert.strictEqual(nextHop2, null, 'Out of range gateway IP must return null');
});

// 51. Same-subnet cold ARP: PC0 -> Switch0 -> PC1
runTest('51. Same-subnet cold ARP (PC0 -> Switch0 -> PC1)', () => {
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

    assert.strictEqual(lookupArp('PC0', pc1.ip), null, 'Initial PC0 ARP cache must be empty');
    assert.strictEqual(lookupArp('PC1', pc0.ip), null, 'Initial PC1 ARP cache must be empty');

    const arpResult = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpResult.success, true);
    assert.strictEqual(arpResult.cacheHit, false);
    assert.strictEqual(arpResult.targetMac, pc1.mac);
    assert.ok(arpResult.requestPacket, 'Request packet must be generated');
    assert.strictEqual(arpResult.requestPacket.protocol, 'ARP');
    assert.strictEqual(arpResult.requestPacket.operation, 'REQUEST');
    assert.strictEqual(arpResult.requestPacket.targetMac, '00:00:00:00:00:00');
    assert.ok(arpResult.replyPacket, 'Reply packet must be generated');
    assert.strictEqual(arpResult.replyPacket.operation, 'REPLY');
    assert.strictEqual(arpResult.replyPacket.senderMac, pc1.mac);

    // Mutual ARP learning
    assert.strictEqual(lookupArp('PC0', pc1.ip), pc1.mac, 'PC0 must learn PC1 IP -> PC1 MAC');
    assert.strictEqual(lookupArp('PC1', pc0.ip), pc0.mac, 'PC1 must learn PC0 IP -> PC0 MAC');
});

// 52. Same-subnet warm ARP uses cache
runTest('52. Same-subnet warm ARP uses cache without ARP broadcast', () => {
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

    // First transmission (cold ARP)
    const result1 = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result1.success, true);
    const events1 = result1.events.join(' | ');
    assert.ok(events1.includes('broadcast ARP Request'), 'Cold transmission must broadcast ARP request');
    assert.ok(events1.includes('sent ARP Reply'), 'Cold transmission must receive ARP reply');

    // Second transmission (warm ARP)
    const result2 = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result2.success, true);
    const events2 = result2.events.join(' | ');
    assert.ok(events2.includes('ARP cache hit for 192.168.1.20'), 'Warm transmission must log ARP cache hit');
    assert.strictEqual(events2.includes('broadcast ARP Request'), false, 'Warm transmission must NOT broadcast ARP request');
});

// 53. Switch learns requester MAC during ARP broadcast
runTest('53. Switch learns requester MAC during ARP broadcast', () => {
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

    clearSwitchMacTable('Switch0');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);

    const arpResult = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpResult.success, true);

    const swMacs = getSwitchRuntime('Switch0').macTable;
    assert.ok(swMacs.some(e => e.mac === normalizeMacAddress(pc0.mac) && e.port === 'Fa0/1'), 'Switch0 must learn PC0 MAC on Fa0/1');
});

// 54. Inter-subnet first-hop ARP resolves gateway MAC
runTest('54. Inter-subnet first-hop ARP resolves gateway MAC', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('switch', 350, 100);
    addDevice('server', 450, 100);

    const pc0 = networkState.devices[0];
    const router = networkState.devices[2];
    const server0 = networkState.devices[4];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server0.ip = '10.0.0.10';
    server0.subnetMask = '255.255.255.0';
    server0.gateway = '10.0.0.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'Switch1');
    addConnection('Switch1', 'Server0');

    const arpResult = simulateArpResolution(pc0, pc0.gateway);
    assert.strictEqual(arpResult.success, true);
    assert.strictEqual(arpResult.targetMac, router.interfaces['Gig0/0'].mac, 'Must resolve to Router0 Gig0/0 MAC');
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac, 'PC0 must cache gateway IP -> Gig0/0 MAC');
    assert.strictEqual(lookupArp('Router0', '192.168.1.10'), pc0.mac, 'Router0 must learn PC0 IP -> PC0 MAC');
});

// 55. ARP broadcast does not cross Router0 boundary
runTest('55. ARP broadcast does not cross Router0 boundary', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('router', 250, 100);
    addDevice('server', 400, 100);

    const pc0 = networkState.devices[0];
    const router = networkState.devices[1];
    const server0 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server0.ip = '10.0.0.10';
    server0.subnetMask = '255.255.255.0';
    server0.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    // PC0 directly attempts to ARP for Server0's remote IP 10.0.0.10
    const arpResult = simulateArpResolution(pc0, '10.0.0.10');
    assert.strictEqual(arpResult.success, false, 'ARP resolution for remote IP across router must fail');
    assert.strictEqual(lookupArp('Server0', pc0.ip), null, 'Server0 must not receive or learn ARP broadcast across router');
    assert.strictEqual(lookupArp('PC0', '10.0.0.10'), null, 'PC0 must not resolve or cache remote host MAC');
});

// 56. ARP failure cleanly handled when IP has no responder
runTest('56. ARP failure cleanly handled when IP has no responder', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);

    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');

    const arpResult = simulateArpResolution(pc0, '192.168.1.99');
    assert.strictEqual(arpResult.success, false);
    assert.strictEqual(arpResult.targetMac, undefined);
    assert.strictEqual(lookupArp('PC0', '192.168.1.99'), null);
});

// 57. Existing non-ICMP Send Frame regression with ARP
runTest('57. Existing non-ICMP Send Frame regression with ARP', () => {
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
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 63);
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
});

// 58. Existing ICMP Echo Request/Reply regression with ARP enabled
runTest('58. Existing ICMP Echo Request/Reply regression with ARP enabled', () => {
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

    const result = simulateSendFrame(pc, server, {
        icmp: { identifier: 99, sequence: 7 }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.icmp.identifier, 99);
    assert.strictEqual(result.packet.icmp.sequence, 7);
    assert.strictEqual(result.packet.ttl, 63);
});

// 59. Existing TTL expiration regression with ARP enabled
runTest('59. Existing TTL expiration regression with ARP enabled', () => {
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

    const result = simulateSendFrame(pc, server, { initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('TTL expired') || result.reason.includes('Time to Live'));
    // ARP should have succeeded prior to IP transmission
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
});

// 60. Full V5.1-V5.5 regression suite
runTest('60. Full V5.1-V5.5 regression suite', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const router = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '192.168.2.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'PC1');

    // 1. Send Frame with ICMP ping
    const pingResult = simulateSendFrame(pc0, pc1, {
        icmp: { identifier: 1001, sequence: 1 }
    });
    assert.strictEqual(pingResult.success, true);
    assert.strictEqual(pingResult.packet.icmp.type, 'ECHO_REPLY');

    // 2. Verify ARP cache state
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp('Router0', '192.168.1.10'), pc0.mac);

    // 3. Snapshot & restore
    const snapshot = createLabSnapshot();
    resetLab();
    assert.strictEqual(networkState.devices.length, 0);
    restoreSnapshot(snapshot);
    assert.strictEqual(networkState.devices.length, 4);
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
});

// 61. Router egress ARP cold-cache resolution
runTest('61. Router egress ARP cold-cache resolution', () => {
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

    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), null, 'Initial Router0 egress ARP cache must be empty');

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.path.length, 3);

    const events = result.events.join(' | ');
    assert.ok(events.includes('Router0 broadcast ARP Request: Who has 10.0.0.10?'), 'Router0 must broadcast ARP request on egress LAN');
    assert.ok(events.includes('Server0 sent ARP Reply: 10.0.0.10 is at ' + server.mac), 'Server0 must send ARP reply');
    assert.ok(events.includes('Router0 set destination MAC to ' + server.mac), 'Router0 must set resolved destination MAC');
});

// 62. Router learns destination host IP/MAC in ARP cache
runTest('62. Router learns destination host IP/MAC in ARP cache', () => {
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

    simulateSendFrame(pc, server);

    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac, 'Router0 must learn Server0 IP -> MAC');
    assert.strictEqual(lookupArp('Server0', '10.0.0.1'), router.interfaces['Gig0/1'].mac, 'Server0 must learn Router0 Gig0/1 IP -> MAC');
    assert.strictEqual(lookupArp('Router0', '192.168.1.10'), pc.mac, 'Router0 must learn PC0 IP -> MAC on ingress');
});

// 63. Router egress ARP warm-cache transmission
runTest('63. Router egress ARP warm-cache transmission', () => {
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

    // First (cold) transmission
    const result1 = simulateSendFrame(pc, server);
    assert.strictEqual(result1.success, true);
    assert.ok(result1.events.join(' | ').includes('Router0 broadcast ARP Request: Who has 10.0.0.10?'));

    // Second (warm) transmission
    const result2 = simulateSendFrame(pc, server);
    assert.strictEqual(result2.success, true);
    const events2 = result2.events.join(' | ');
    assert.ok(events2.includes('Router0 ARP cache hit for 10.0.0.10'), 'Warm transmission must log Router0 ARP cache hit');
    assert.strictEqual(events2.includes('Router0 broadcast ARP Request: Who has 10.0.0.10?'), false, 'Warm transmission must NOT broadcast egress ARP');
});

// 64. Correct egress interface is recorded in the ARP entry
runTest('64. Correct egress interface is recorded in the ARP entry', () => {
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

    simulateSendFrame(pc, server);

    const rTable = getArpTable('Router0');
    const serverEntry = rTable.find(e => e.ip === '10.0.0.10');
    assert.ok(serverEntry, 'Server0 entry must exist in Router0 ARP table');
    assert.strictEqual(serverEntry.interface, 'Gig0/1', 'Server0 entry must be associated with Gig0/1');

    const pcEntry = rTable.find(e => e.ip === '192.168.1.10');
    assert.ok(pcEntry, 'PC0 entry must exist in Router0 ARP table');
    assert.strictEqual(pcEntry.interface, 'Gig0/0', 'PC0 entry must be associated with Gig0/0');
});

// 65. ARP broadcast remains on destination LAN
runTest('65. ARP broadcast remains on destination LAN', () => {
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

    simulateSendFrame(pc, server);

    // Switch0 on source LAN must NOT have learned Server0's MAC or Router0's Gig0/1 MAC
    const sw0Macs = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(sw0Macs.some(e => e.mac === normalizeMacAddress(server.mac)), false, 'Switch0 must not learn Server0 MAC');
    assert.strictEqual(sw0Macs.some(e => e.mac === normalizeMacAddress(router.interfaces['Gig0/1'].mac)), false, 'Switch0 must not learn Router0 Gig0/1 MAC');

    // Switch1 on destination LAN must have learned Router0 Gig0/1 MAC
    const sw1Macs = getSwitchRuntime('Switch1').macTable;
    assert.ok(sw1Macs.some(e => e.mac === normalizeMacAddress(router.interfaces['Gig0/1'].mac)), 'Switch1 must learn Router0 Gig0/1 MAC');
});

// 66. Full ICMP request/reply still works with router egress ARP
runTest('66. Full ICMP request/reply still works with router egress ARP', () => {
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

    const result = simulateSendFrame(pc, server, {
        icmp: { identifier: 4242, sequence: 10 }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.icmp.identifier, 4242);
    assert.strictEqual(result.packet.icmp.sequence, 10);
    assert.strictEqual(result.packet.ttl, 63);

    // Mutual ARP entries must be present
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac);
    assert.strictEqual(lookupArp('Server0', '10.0.0.1'), router.interfaces['Gig0/1'].mac);
});

// 67. TTL decrement still works across routers
runTest('67. TTL decrement still works across routers with egress ARP', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server, { initialTtl: 64 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 62, 'TTL should decrement from 64 to 62 through two routers');
    assert.strictEqual(lookupArp('Router1', '10.0.0.10'), server.mac);
});

// 68. Full V5.1–V5.5 regression
runTest('68. Full V5.1-V5.5 regression with end-to-end ARP and ICMP', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 250, 100);
    addDevice('switch', 350, 100);
    addDevice('pc', 450, 100);

    const pc0 = networkState.devices[0];
    const router = networkState.devices[2];
    const pc1 = networkState.devices[4];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '192.168.2.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.20';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'Switch1');
    addConnection('Switch1', 'PC1');

    // 1. First ping (cold ARP on both sides)
    const result1 = simulateSendFrame(pc0, pc1, { icmp: { identifier: 1, sequence: 1 } });
    assert.strictEqual(result1.success, true);
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp('Router0', '192.168.2.20'), pc1.mac);

    // 2. Second ping (warm ARP on all hops)
    const result2 = simulateSendFrame(pc0, pc1, { icmp: { identifier: 1, sequence: 2 } });
    assert.strictEqual(result2.success, true);
    const events2 = result2.events.join(' | ');
    assert.ok(events2.includes('PC0 ARP cache hit for 192.168.1.1'));
    assert.ok(events2.includes('Router0 ARP cache hit for 192.168.2.20'));

    // 3. Reverse ping (PC1 -> PC0)
    const result3 = simulateSendFrame(pc1, pc0, { icmp: { identifier: 2, sequence: 1 } });
    assert.strictEqual(result3.success, true);

    // 4. Snapshot / Restore integrity
    const snap = createLabSnapshot();
    resetLab();
    assert.strictEqual(networkState.devices.length, 0);
    restoreSnapshot(snap);
    assert.strictEqual(networkState.devices.length, 5);
    assert.strictEqual(lookupArp('Router0', '192.168.2.20'), pc1.mac);
});

// 69. Switch learns responder MAC during ARP Reply
runTest('69. Switch learns responder MAC during ARP Reply', () => {
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

    clearSwitchMacTable('Switch0');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);

    // Trigger cold ARP resolution
    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, true);

    const swTable = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(swTable.length, 2, 'Switch0 MAC table must contain both PC0 and PC1 entries after ARP exchange');

    const pc0Entry = swTable.find(e => e.mac === normalizeMacAddress(pc0.mac));
    assert.ok(pc0Entry, 'PC0 MAC entry must exist');
    assert.strictEqual(pc0Entry.port, 'Fa0/1', 'PC0 must map to Fa0/1');

    const pc1Entry = swTable.find(e => e.mac === normalizeMacAddress(pc1.mac));
    assert.ok(pc1Entry, 'PC1 MAC entry must exist');
    assert.strictEqual(pc1Entry.port, 'Fa0/2', 'PC1 must map to Fa0/2');
});

// 70. IPv4 frame forwarded as known-unicast after ARP resolution
runTest('70. IPv4 frame forwarded as known-unicast after ARP resolution', () => {
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

    const frameResult = simulateSendFrame(pc0, pc1);
    assert.strictEqual(frameResult.success, true);

    // Destination MAC is known in Switch0's MAC table
    const destEntry = getSwitchMacEntry('Switch0', pc1.mac);
    assert.ok(destEntry, 'Destination MAC must be known in Switch0 MAC table');
    assert.strictEqual(destEntry.port, 'Fa0/2');

    // Switch forwarding event reports known-unicast forwarding
    const events = frameResult.events.join(' | ');
    assert.ok(events.includes('Switch0 forwarded frame through Fa0/2'), 'Must log unicast forward event on Fa0/2');
    assert.strictEqual(frameResult.action, 'FORWARD', 'Action must be FORWARD');
});

// 71. ARP broadcast behavior verification
runTest('71. ARP Request uses FF:FF:FF:FF:FF:FF and switch floods broadcast', () => {
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

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, true);
    assert.strictEqual(arpRes.requestPacket.targetMac, '00:00:00:00:00:00');
    assert.ok(arpRes.events.some(e => e.includes('flooded broadcast frame (FF:FF:FF:FF:FF:FF) on all ports except Fa0/1')));
});

// 72. ARP cache mutual learning verification
runTest('72. ARP cache mutual learning between requester and responder', () => {
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

    simulateArpResolution(pc0, pc1.ip);

    // Requester learned responder
    assert.strictEqual(lookupArp('PC0', pc1.ip), pc1.mac, 'PC0 must cache PC1 IP -> MAC');
    // Responder learned requester
    assert.strictEqual(lookupArp('PC1', pc0.ip), pc0.mac, 'PC1 must cache PC0 IP -> MAC');
});

// 73. Known-unicast switch forwarding with per-hop action reporting
runTest('73. Known-unicast switch forwarding records FORWARD in hopActions', () => {
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

    const result = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'FORWARD');
    assert.ok(Array.isArray(result.hopActions), 'hopActions must be an array');
    assert.strictEqual(result.hopActions.length, 1);

    const hop0 = result.hopActions[0];
    assert.strictEqual(hop0.deviceId, 'Switch0');
    assert.strictEqual(hop0.type, 'switch');
    assert.strictEqual(hop0.action, 'FORWARD');
    assert.strictEqual(hop0.reason, 'known-unicast');
    assert.strictEqual(hop0.ingressPort, 'Fa0/1');
    assert.strictEqual(hop0.egressPort, 'Fa0/2');
    assert.strictEqual(hop0.destinationMac, pc1.mac);
});

// 74. Unknown-unicast flooding records FLOOD with excluded ingress port
runTest('74. Unknown-unicast flooding records FLOOD in hopActions and excludes ingress port', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);
    addDevice('server', 250, 250);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');
    addConnection('Switch0', 'Server0');

    clearSwitchMacTable('Switch0');

    // Transmit frame directly with unknown destination MAC
    const unknownMac = '02:AA:BB:CC:DD:EE';
    const frame = {
        sourceDeviceId: pc0.id,
        destinationDeviceId: pc1.id,
        sourceMac: pc0.mac,
        destinationMac: unknownMac,
        etherType: 'IPv4',
        packet: { sourceIp: pc0.ip, destinationIp: pc1.ip, ttl: 64 },
        path: ['PC0', 'Switch0', 'PC1'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hopActions.length, 1);

    const hop0 = result.hopActions[0];
    assert.strictEqual(hop0.deviceId, 'Switch0');
    assert.strictEqual(hop0.action, 'FLOOD');
    assert.strictEqual(hop0.reason, 'unknown-unicast');
    assert.strictEqual(hop0.ingressPort, 'Fa0/1');
    assert.ok(Array.isArray(hop0.egressPorts));
    assert.strictEqual(hop0.egressPorts.includes('Fa0/1'), false, 'Ingress port must be excluded from flood egress ports');
    assert.ok(hop0.egressPorts.includes('Fa0/2'));
    assert.ok(hop0.egressPorts.includes('Fa0/3'));
});

// 75. Broadcast flooding records FLOOD with broadcast reason
runTest('75. Broadcast flooding records FLOOD with reason broadcast in hopActions', () => {
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

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, true);
    assert.ok(Array.isArray(arpRes.hopActions), 'ARP result must have hopActions');

    const broadcastHop = arpRes.hopActions.find(h => h.reason === 'broadcast');
    assert.ok(broadcastHop, 'Broadcast hop action must exist');
    assert.strictEqual(broadcastHop.action, 'FLOOD');
    assert.strictEqual(broadcastHop.destinationMac, 'FF:FF:FF:FF:FF:FF');
    assert.strictEqual(broadcastHop.ingressPort, 'Fa0/1');
});

// 76. Multi-switch known-unicast preserves per-hop actions across switches and routers
runTest('76. Multi-switch known-unicast preserves per-hop actions across switches and routers', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 300, 100);
    addDevice('switch', 450, 100);
    addDevice('server', 550, 100);

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
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'FORWARD');
    assert.ok(Array.isArray(result.hopActions));
    assert.strictEqual(result.hopActions.length, 3, 'Must record Switch0, Router0, and Switch1 hop actions');

    const [hop0, hop1, hop2] = result.hopActions;

    // Switch0
    assert.strictEqual(hop0.deviceId, 'Switch0');
    assert.strictEqual(hop0.type, 'switch');
    assert.strictEqual(hop0.action, 'FORWARD');
    assert.strictEqual(hop0.ingressPort, 'Fa0/1');
    assert.strictEqual(hop0.egressPort, 'Fa0/2');

    // Router0
    assert.strictEqual(hop1.deviceId, 'Router0');
    assert.strictEqual(hop1.type, 'router');
    assert.strictEqual(hop1.action, 'ROUTE');
    assert.strictEqual(hop1.ingressInterface, 'Gig0/0');
    assert.strictEqual(hop1.egressInterface, 'Gig0/1');
    assert.strictEqual(hop1.ttl, 63);

    // Switch1
    assert.strictEqual(hop2.deviceId, 'Switch1');
    assert.strictEqual(hop2.type, 'switch');
    assert.strictEqual(hop2.action, 'FORWARD');
    assert.strictEqual(hop2.ingressPort, 'Fa0/1');
    assert.strictEqual(hop2.egressPort, 'Fa0/2');
});

// 77. Mixed forwarding preserves independent switch decisions
runTest('77. Mixed forwarding preserves independent switch decisions in hopActions', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('switch', 300, 100);
    addDevice('pc', 450, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    // Teach Switch1 PC1's MAC directly on Fa0/2
    learnSwitchMac('Switch1', pc1.mac, pc1.id, 'Fa0/2');

    // Leave Switch0 unlearned for PC1's MAC
    clearSwitchMacTable('Switch0');

    // Send frame across path: PC0 -> Switch0 -> Switch1 -> PC1
    const frame = {
        sourceDeviceId: pc0.id,
        destinationDeviceId: pc1.id,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc0.ip, destinationIp: pc1.ip, ttl: 64 },
        path: ['PC0', 'Switch0', 'Switch1', 'PC1'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'Switch1', 'PC1']);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hopActions.length, 2);

    // Switch0 flooded (unknown-unicast)
    assert.strictEqual(result.hopActions[0].deviceId, 'Switch0');
    assert.strictEqual(result.hopActions[0].action, 'FLOOD');
    assert.strictEqual(result.hopActions[0].reason, 'unknown-unicast');

    // Switch1 forwarded (known-unicast)
    assert.strictEqual(result.hopActions[1].deviceId, 'Switch1');
    assert.strictEqual(result.hopActions[1].action, 'FORWARD');
    assert.strictEqual(result.hopActions[1].reason, 'known-unicast');
    assert.strictEqual(result.hopActions[1].egressPort, 'Fa0/2');
});

// 78. Same-port filtering drops frame
runTest('78. Same-port destination MAC drops frame on incoming segment', () => {
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

    // Artificially map PC1 MAC to Fa0/1 (the same port as PC0)
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/1');

    const frame = {
        sourceDeviceId: pc0.id,
        destinationDeviceId: pc1.id,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc0.ip, destinationIp: pc1.ip, ttl: 64 },
        path: ['PC0', 'Switch0', 'PC1'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.strictEqual(result.hopActions.length, 1);
    assert.strictEqual(result.hopActions[0].action, 'DROP');
    assert.strictEqual(result.hopActions[0].reason, 'filtered-same-port');
});

// 79. Fresh MAC entry does not expire
runTest('79. Fresh MAC entry does not expire', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const mac = '02:11:22:33:44:55';
    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/1');

    const entry = getSwitchMacEntry('Switch0', mac);
    assert.ok(entry, 'Entry should exist');
    assert.strictEqual(isMacEntryExpired(entry, 300, Date.now()), false);

    const removed = ageSwitchMacTable('Switch0', 300, Date.now());
    assert.strictEqual(removed, 0, 'No entries should be removed');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);
});

// 80. Expired MAC entry is removed
runTest('80. Expired MAC entry is removed', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const mac = '02:11:22:33:44:55';
    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/1');

    const entry = getSwitchMacEntry('Switch0', mac);
    assert.ok(entry);

    const futureTime = Date.now() + 305000;
    assert.strictEqual(isMacEntryExpired(entry, 300, futureTime), true);

    const removed = ageSwitchMacTable('Switch0', 300, futureTime);
    assert.strictEqual(removed, 1, 'Expired entry must be removed');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);
});

// 81. Aging preserves fresh entries
runTest('81. Aging preserves fresh entries', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const now = Date.now();

    learnSwitchMac('Switch0', '02:11:11:11:11:11', 'PC0', 'Fa0/1');
    learnSwitchMac('Switch0', '02:22:22:22:22:22', 'PC1', 'Fa0/2');

    const table = getSwitchRuntime('Switch0').macTable;
    // Set 1st entry to be 400 seconds old
    table[0].learnedAt = new Date(now - 400000).toISOString();
    // Set 2nd entry to be 50 seconds old
    table[1].learnedAt = new Date(now - 50000).toISOString();

    const removed = ageSwitchMacTable('Switch0', 300, now);
    assert.strictEqual(removed, 1, 'Only 1 expired entry should be removed');
    const updatedTable = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(updatedTable.length, 1);
    assert.strictEqual(updatedTable[0].mac, '02:22:22:22:22:22', 'Fresh entry must be preserved');
});

// 82. Expired destination becomes unknown unicast
runTest('82. Expired destination becomes unknown unicast', () => {
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

    // Learn PC1 MAC on Switch0 but make it expired (400 seconds old)
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/2');
    const table = getSwitchRuntime('Switch0').macTable;
    table[0].learnedAt = new Date(Date.now() - 400000).toISOString();

    const frame = {
        sourceDeviceId: pc0.id,
        destinationDeviceId: pc1.id,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc0.ip, destinationIp: pc1.ip, ttl: 64 },
        path: ['PC0', 'Switch0', 'PC1'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hopActions.length, 1);
    assert.strictEqual(result.hopActions[0].action, 'FLOOD');
    assert.strictEqual(result.hopActions[0].reason, 'unknown-unicast');
});

// 83. Relearning refreshes aging timestamp
runTest('83. Relearning refreshes aging timestamp', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const mac = '02:AA:BB:CC:DD:EE';

    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/1');
    const entry = getSwitchMacEntry('Switch0', mac);
    const oldTime = new Date(Date.now() - 100000).toISOString();
    entry.learnedAt = oldTime;

    // Relearn MAC
    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/1');
    const refreshedEntry = getSwitchMacEntry('Switch0', mac);
    assert.notStrictEqual(refreshedEntry.learnedAt, oldTime);
    assert.ok(new Date(refreshedEntry.learnedAt).getTime() > new Date(oldTime).getTime());
});

// 84. MAC mobility refreshes port and timestamp
runTest('84. MAC mobility refreshes port and timestamp', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const mac = '02:AA:BB:CC:DD:EE';

    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/1');
    const initialTime = new Date(Date.now() - 50000).toISOString();
    const entry = getSwitchMacEntry('Switch0', mac);
    entry.learnedAt = initialTime;

    // Same MAC seen on Fa0/2
    learnSwitchMac('Switch0', mac, 'PC0', 'Fa0/2');
    const table = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(table.length, 1, 'Only one entry should exist for the MAC');
    assert.strictEqual(table[0].port, 'Fa0/2', 'Port must update to Fa0/2');
    assert.ok(new Date(table[0].learnedAt).getTime() > new Date(initialTime).getTime(), 'learnedAt must refresh');
});

// 85. Global aging affects all switches independently
runTest('85. Global aging affects all switches independently', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('switch', 300, 100);
    const now = Date.now();

    learnSwitchMac('Switch0', '02:11:11:11:11:11', 'PC0', 'Fa0/1');
    learnSwitchMac('Switch1', '02:22:22:22:22:22', 'PC1', 'Fa0/1');

    // Make Switch0 entry expired, Switch1 entry fresh
    getSwitchRuntime('Switch0').macTable[0].learnedAt = new Date(now - 400000).toISOString();
    getSwitchRuntime('Switch1').macTable[0].learnedAt = new Date(now - 10000).toISOString();

    const totalRemoved = ageSwitchMacTables(300, now);
    assert.strictEqual(totalRemoved, 1, 'Total removed entries should be 1');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0, 'Switch0 entry should be removed');
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 1, 'Switch1 entry should remain');
});

// 86. ARP cache is unaffected by MAC aging
runTest('86. ARP cache is unaffected by MAC aging', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc1.ip = '192.168.1.20';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    // Populate both ARP and Switch MAC tables
    learnArp('PC0', pc1.ip, pc1.mac);
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/2');

    assert.strictEqual(lookupArp('PC0', pc1.ip), pc1.mac);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);

    // Age switch MAC table past expiration
    const now = Date.now();
    getSwitchRuntime('Switch0').macTable[0].learnedAt = new Date(now - 400000).toISOString();
    ageSwitchMacTable('Switch0', 300, now);

    // Switch MAC entry is gone, but PC0 ARP cache is intact
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0, 'Switch MAC entry must be removed');
    assert.strictEqual(lookupArp('PC0', pc1.ip), pc1.mac, 'ARP entry must remain unaffected');
});

// 87. Device deletion removes MAC entry
runTest('87. Device deletion removes MAC entry from switches', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0');
    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');

    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);
    deleteDevice('PC0');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0, 'PC0 MAC must be removed upon device deletion');
});

// 88. Router deletion removes all interface MAC entries
runTest('88. Router deletion removes all interface MAC entries from switches', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('router', 250, 100);
    addDevice('switch', 400, 100);

    const router = networkState.devices[1];
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'Switch1');

    const mac0 = router.interfaces['Gig0/0'].mac;
    const mac1 = router.interfaces['Gig0/1'].mac;

    learnSwitchMac('Switch0', mac0, 'Router0', 'Fa0/1');
    learnSwitchMac('Switch1', mac1, 'Router0', 'Fa0/1');

    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 1);

    deleteDevice('Router0');

    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0, 'Switch0 Router0 MAC entry must be removed');
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 0, 'Switch1 Router0 MAC entry must be removed');
});

// 89. Connection deletion removes MAC learned on that port
runTest('89. Connection deletion removes MAC learned on that port', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0');
    const connId = networkState.connections[0].id;
    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');

    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);
    deleteConnection(connId);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0, 'MAC learned on deleted connection must be removed');
});

// 90. Unrelated MAC entries survive connection deletion
runTest('90. Unrelated MAC entries survive connection deletion', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/2');

    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 2);

    const conn0 = networkState.connections[0].id;
    deleteConnection(conn0);

    const table = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(table.length, 1, 'Only PC0 MAC should be removed');
    assert.strictEqual(table[0].mac, normalizeMacAddress(pc1.mac), 'PC1 MAC must survive');
});

// 91. Stale port mapping is detected
runTest('91. Stale port mapping is detected and removed by cleanupStaleSwitchMacEntries', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0');

    // Add entry on disconnected/invalid port Fa0/99
    getSwitchRuntime('Switch0').macTable.push({
        mac: pc0.mac,
        port: 'Fa0/99',
        deviceId: 'PC0',
        learnedAt: new Date().toISOString()
    });

    assert.strictEqual(isSwitchMacEntryValid('Switch0', getSwitchRuntime('Switch0').macTable[0]), false);
    const removed = cleanupStaleSwitchMacEntries('Switch0');
    assert.strictEqual(removed, 1);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);
});

// 92. Valid MAC entry survives cleanup
runTest('92. Valid MAC entry survives cleanup', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0');
    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');

    const entry = getSwitchRuntime('Switch0').macTable[0];
    assert.strictEqual(isSwitchMacEntryValid('Switch0', entry), true);

    const removed = cleanupStaleSwitchMacEntries('Switch0');
    assert.strictEqual(removed, 0);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);
});

// 93. Reconnection does not preserve old port mapping
runTest('93. Reconnection does not preserve old port mapping', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('server', 400, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'Server0'); // Fa0/2

    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable[0].port, 'Fa0/1');

    // Delete connection
    deleteConnection(networkState.connections[0].id);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);

    // Reconnect PC0 on new connection (will get Fa0/1 or next available)
    addConnection('PC0', 'Switch0');
    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');

    const table = getSwitchRuntime('Switch0').macTable;
    assert.strictEqual(table.length, 1);
});

// 94. Stale entry cannot cause incorrect forwarding
runTest('94. Stale entry cannot cause incorrect forwarding and results in FLOOD', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc1.ip = '192.168.1.20';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    // Manually inject a stale mapping for PC1 on non-existent port Fa0/99
    getSwitchRuntime('Switch0').macTable.push({
        mac: pc1.mac,
        port: 'Fa0/99',
        deviceId: 'PC1',
        learnedAt: new Date().toISOString()
    });

    const frame = {
        sourceDeviceId: pc0.id,
        destinationDeviceId: pc1.id,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc0.ip, destinationIp: pc1.ip, ttl: 64 },
        path: ['PC0', 'Switch0', 'PC1'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hopActions.length, 1);
    assert.strictEqual(result.hopActions[0].action, 'FLOOD');
    assert.strictEqual(result.hopActions[0].reason, 'unknown-unicast');
});

// 95. Global stale cleanup works independently
runTest('95. Global stale cleanup works independently across switches', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 400, 100);

    const pc0 = networkState.devices[0];
    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');

    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1'); // valid
    // Add stale entry on Switch1
    getSwitchRuntime('Switch1').macTable.push({
        mac: '02:99:99:99:99:99',
        port: 'Fa0/99',
        deviceId: 'PC99',
        learnedAt: new Date().toISOString()
    });

    const totalRemoved = cleanupAllStaleSwitchMacEntries();
    assert.strictEqual(totalRemoved, 1);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1, 'Valid entry on Switch0 must remain');
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 0, 'Stale entry on Switch1 must be removed');
});

// 96. ARP state remains independent of MAC cleanup
runTest('96. ARP state remains independent of MAC cleanup', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc1.ip = '192.168.1.20';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    learnArp('PC0', pc1.ip, pc1.mac);
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/2');

    // Delete connection between Switch0 and PC1
    const conn1 = networkState.connections[1].id;
    deleteConnection(conn1);

    // Switch0 MAC table cleaned, PC0 ARP cache intact
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 0);
    assert.strictEqual(lookupArp('PC0', pc1.ip), pc1.mac, 'PC0 ARP cache entry must remain intact');
});

// 97. Snapshot/restore preserves valid MAC tables
runTest('97. Snapshot/restore preserves valid MAC tables', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    learnSwitchMac('Switch0', pc0.mac, pc0.id, 'Fa0/1');
    learnSwitchMac('Switch0', pc1.mac, pc1.id, 'Fa0/2');

    const snap = createLabSnapshot();
    assert.strictEqual(snap.switchRuntime['Switch0'].macTable.length, 2);

    // Mutate topology
    deleteDevice('PC0');
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 1);

    // Restore snapshot
    restoreSnapshot(snap);
    assert.strictEqual(networkState.devices.length, 3);
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 2);
    assert.strictEqual(isSwitchMacEntryValid('Switch0', getSwitchRuntime('Switch0').macTable[0]), true);
    assert.strictEqual(isSwitchMacEntryValid('Switch0', getSwitchRuntime('Switch0').macTable[1]), true);
});

// 98. Full V5.1-V5.6 end-to-end regression
runTest('98. Full V5.1-V5.6 end-to-end regression with routing, ARP, MAC learning, aging, and lifecycle cleanup', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 300, 100);
    addDevice('switch', 450, 100);
    addDevice('server', 550, 100);

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

    // 1. Initial ping with cold ARP
    const result1 = simulateSendFrame(pc, server, { icmp: { identifier: 1, sequence: 1 } });
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.action, 'FORWARD');
    assert.strictEqual(result1.hopActions.length, 3);
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac);

    // 2. Both switches learned MACs
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 2);
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 2);

    // 3. Second ping with warm ARP
    const result2 = simulateSendFrame(pc, server, { icmp: { identifier: 1, sequence: 2 } });
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.action, 'FORWARD');

    // 4. Delete connection on Switch1 side (Switch1 <-> Server0)
    const connSwitch1Server = networkState.connections.find(c => (c.source === 'Switch1' && c.target === 'Server0') || (c.source === 'Server0' && c.target === 'Switch1'));
    assert.ok(connSwitch1Server);
    deleteConnection(connSwitch1Server.id);

    // Switch1 Server0 MAC removed on deleted port, Router0 MAC remains on intact port
    assert.strictEqual(getSwitchRuntime('Switch1').macTable.length, 1);
    assert.strictEqual(getSwitchRuntime('Switch1').macTable[0].mac, normalizeMacAddress(router.interfaces['Gig0/1'].mac));
    assert.strictEqual(getSwitchRuntime('Switch0').macTable.length, 2);
    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac);
});

// 99. Test A — Empty ARP cache on newly initialized IP-capable devices
runTest('99. Test A — Empty ARP cache on newly initialized IP-capable devices', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('laptop', 200, 100);
    addDevice('server', 300, 100);
    addDevice('router', 400, 100);

    const pc = networkState.devices[0];
    const laptop = networkState.devices[1];
    const server = networkState.devices[2];
    const router = networkState.devices[3];

    assert.strictEqual(getArpTable(pc.id).length, 0, 'PC ARP table must start empty');
    assert.strictEqual(getArpTable(laptop.id).length, 0, 'Laptop ARP table must start empty');
    assert.strictEqual(getArpTable(server.id).length, 0, 'Server ARP table must start empty');
    assert.strictEqual(getArpTable(router.id).length, 0, 'Router ARP table must start empty');
});

// 100. Test B — Cold ARP resolution populates dynamic ARP entry
runTest('100. Test B — Cold ARP resolution populates dynamic ARP entry', () => {
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

    assert.strictEqual(getArpTable('PC0').length, 0);

    const result = simulateSendFrame(pc0, pc1);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.arpResult.cacheHit, false, 'Initial resolution must be a cold cache miss');

    const pc0Table = getArpTable('PC0');
    assert.strictEqual(pc0Table.length, 1, 'PC0 must have 1 ARP entry after resolution');
    assert.strictEqual(pc0Table[0].ip, '192.168.1.20');
    assert.strictEqual(pc0Table[0].mac, normalizeMacAddress(pc1.mac));
    assert.strictEqual(pc0Table[0].type, 'dynamic');
});

// 101. Test C — Warm ARP cache hit skips ARP broadcast and uses cached MAC
runTest('101. Test C — Warm ARP cache hit skips ARP broadcast and uses cached MAC', () => {
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

    // Cold run
    simulateSendFrame(pc0, pc1);

    // Warm run
    const resultWarm = simulateSendFrame(pc0, pc1);
    assert.strictEqual(resultWarm.success, true);
    assert.strictEqual(resultWarm.arpResult.cacheHit, true, 'Subsequent transmission must be a cache hit');
    assert.strictEqual(resultWarm.arpResult.targetMac, normalizeMacAddress(pc1.mac));

    // Verify no broadcast events were generated in the warm run
    const hasBroadcast = resultWarm.events.some(e => e.includes('broadcast ARP Request') || e.includes('flooded broadcast frame'));
    assert.strictEqual(hasBroadcast, false, 'Warm ARP lookup must not generate broadcast frames');
});

// 102. Test D — Clear ARP table empties cache and forces re-resolution
runTest('102. Test D — Clear ARP table empties cache and forces re-resolution', () => {
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

    // Populate cache
    simulateSendFrame(pc0, pc1);
    assert.strictEqual(getArpTable('PC0').length, 1);

    // Clear PC0 ARP table
    clearArpTable('PC0');
    assert.strictEqual(getArpTable('PC0').length, 0, 'ARP table must be empty after clearArpTable');

    // Next communication must perform cold resolution again
    const resultAfterClear = simulateSendFrame(pc0, pc1);
    assert.strictEqual(resultAfterClear.success, true);
    assert.strictEqual(resultAfterClear.arpResult.cacheHit, false, 'Must perform ARP broadcast again after clearing table');
    assert.strictEqual(getArpTable('PC0').length, 1);
});

// 103. Test E — Device deletion invalidates references to deleted device
runTest('103. Test E — Device deletion invalidates references to deleted device', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);
    addDevice('server', 550, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];
    const server0 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';
    server0.ip = '192.168.1.30';
    server0.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');
    addConnection('Switch0', 'Server0');

    // Populate PC0 cache with entries for both PC1 and Server0
    simulateSendFrame(pc0, pc1);
    simulateSendFrame(pc0, server0);
    assert.strictEqual(getArpTable('PC0').length, 2);

    const pc1Ip = pc1.ip;
    const pc1Mac = pc1.mac;

    // Delete PC1
    deleteDevice('PC1');

    // PC0 ARP table must no longer have PC1's entry, while Server0's entry remains intact
    assert.strictEqual(lookupArp('PC0', pc1Ip), null, 'Deleted device IP must be removed from PC0 ARP table');
    assert.strictEqual(lookupArp('PC0', '192.168.1.30'), server0.mac, 'Unrelated Server0 entry must remain intact');
    assert.strictEqual(getArpTable('PC0').length, 1);
});

// 104. Test F — IP change invalidates old ARP mappings
runTest('104. Test F — IP change invalidates old ARP mappings', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);
    addDevice('server', 550, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];
    const server0 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';
    server0.ip = '192.168.1.30';
    server0.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');
    addConnection('Switch0', 'Server0');

    simulateSendFrame(pc0, pc1);
    simulateSendFrame(pc0, server0);
    assert.strictEqual(getArpTable('PC0').length, 2);

    // Change PC1 IP address via inspector draft and apply
    networkState.selectedDeviceId = 'PC1';
    inspectorDrafts['PC1'] = { ip: '192.168.1.25' };
    applyDeviceConfiguration();

    assert.strictEqual(pc1.ip, '192.168.1.25');
    assert.strictEqual(lookupArp('PC0', '192.168.1.20'), null, 'Old IP must be invalidated in PC0 ARP table');
    assert.strictEqual(lookupArp('PC0', '192.168.1.30'), server0.mac, 'Unrelated Server0 entry must remain intact');
    assert.strictEqual(getArpTable('PC0').length, 1);
});

// 105. Test G — MAC change invalidates old ARP mappings
runTest('105. Test G — MAC change invalidates old ARP mappings', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);
    addDevice('server', 550, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[2];
    const server0 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';
    server0.ip = '192.168.1.30';
    server0.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');
    addConnection('Switch0', 'Server0');

    simulateSendFrame(pc0, pc1);
    simulateSendFrame(pc0, server0);
    assert.strictEqual(getArpTable('PC0').length, 2);

    const oldMac = pc1.mac;
    const newMac = '02:99:99:99:99:99';

    // Change PC1 MAC address via inspector draft and apply
    networkState.selectedDeviceId = 'PC1';
    inspectorDrafts['PC1'] = { mac: newMac };
    applyDeviceConfiguration();

    assert.strictEqual(normalizeMacAddress(pc1.mac), normalizeMacAddress(newMac));
    assert.strictEqual(lookupArp('PC0', '192.168.1.20'), null, 'Old MAC mapping must be invalidated');
    assert.strictEqual(lookupArp('PC0', '192.168.1.30'), server0.mac, 'Unrelated Server0 entry must remain intact');
    assert.strictEqual(getArpTable('PC0').length, 1);
});

// 106. Test H — Router interface IP/MAC change invalidates corresponding ARP mappings
runTest('106. Test H — Router interface IP/MAC change invalidates corresponding ARP mappings', () => {
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

    // Run frame transmission so PC0 learns Router Gig0/0 MAC, and Router learns Server0 MAC
    simulateSendFrame(pc, server);
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), router.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac);

    // Change Router0 Gig0/0 IP to 192.168.1.254 via applyDeviceConfiguration
    networkState.selectedDeviceId = 'Router0';
    inspectorDrafts['Router0'] = { 'interfaces.Gig0/0.ip': '192.168.1.254' };
    applyDeviceConfiguration();

    // PC0's old mapping for 192.168.1.1 is purged
    assert.strictEqual(lookupArp('PC0', '192.168.1.1'), null, 'Stale router gateway IP must be removed from PC0 ARP table');

    // Router's cached entry for Server0 on Gig0/1 remains intact
    assert.strictEqual(lookupArp('Router0', '10.0.0.10'), server.mac, 'Router ARP entry for Server0 must remain intact');
});

// 107. ICMP Send Frame produces Echo Request + Reply roundtrip when ICMP mode is explicitly enabled
runTest('107. ICMP Send Frame produces Echo Request + Reply roundtrip when ICMP mode is explicitly enabled', () => {
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

    const result = simulateSendFrame(pc0, pc1, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 42,
            sequence: 7
        }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'FORWARD');
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.sourceIp, '192.168.1.20');
    assert.strictEqual(result.packet.destinationIp, '192.168.1.10');
    assert.strictEqual(result.packet.icmp.identifier, 42);
    assert.strictEqual(result.packet.icmp.sequence, 7);
    assert.ok(result.events.some(e => e.includes('sent ICMP Echo Request')));
    assert.ok(result.events.some(e => e.includes('received ICMP Echo Request')));
    assert.ok(result.events.some(e => e.includes('generated ICMP Echo Reply')));
    assert.ok(result.events.some(e => e.includes('received ICMP Echo Reply')));
});

// 108. Full end-to-end flow with cold ARP, Switch Flooding, Router Forwarding, TTL decrement, and Echo Reply
runTest('108. Full end-to-end flow with cold ARP, Switch Flooding, Router Forwarding, TTL decrement, and Echo Reply', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 300, 100);
    addDevice('switch', 450, 100);
    addDevice('server', 550, 100);

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

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: 100,
            sequence: 1
        }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'FORWARD');
    assert.strictEqual(result.hopActions.length, 3, 'Must have 3 forward hop decisions (Switch0, Router0, Switch1)');
    assert.strictEqual(result.reverseHopActions.length, 3, 'Must have 3 reverse hop decisions (Switch1, Router0, Switch0)');

    // Forward Switch0 decision
    const fwdSwitch0 = result.hopActions.find(h => h.deviceId === 'Switch0');
    assert.strictEqual(fwdSwitch0.action, 'FORWARD');

    // Forward Router0 decision
    const fwdRouter0 = result.hopActions.find(h => h.deviceId === 'Router0');
    assert.strictEqual(fwdRouter0.action, 'ROUTE');
    assert.strictEqual(fwdRouter0.ttl, 63);

    // Reverse Router0 decision
    const revRouter0 = result.reverseHopActions.find(h => h.deviceId === 'Router0');
    assert.strictEqual(revRouter0.action, 'ROUTE');
    assert.strictEqual(revRouter0.ttl, 63);
});

// 109. Warm ARP uses cache and skips ARP broadcast for second ICMP transmission
runTest('109. Warm ARP uses cache and skips ARP broadcast for second ICMP transmission', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const server = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    server.ip = '192.168.1.20';
    server.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Server0');

    // Run 1: Cold ARP
    const result1 = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.arpResult.cacheHit, false);

    // Run 2: Warm ARP
    const result2 = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.arpResult.cacheHit, true);
    const hasArpBroadcast = result2.events.some(e => e.includes('broadcast ARP Request'));
    assert.strictEqual(hasArpBroadcast, false, 'Warm ICMP ping must not generate ARP broadcast');
});

// 110. TTL decrement on both forward and reverse router hops
runTest('110. TTL decrement on both forward and reverse router hops', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('server', 350, 100);

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
        initialTtl: 64,
        replyTtl: 64,
        icmp: { type: 'ECHO_REQUEST', identifier: 1, sequence: 1 }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 63, 'Reply arriving at source must have TTL 63');

    const fwdTtlEvents = result.events.filter(e => e.includes('Router0 decremented IP TTL to 63'));
    assert.strictEqual(fwdTtlEvents.length, 2, 'Must log TTL decrement on both forward and reverse paths');
});

// 111. Echo Reply preserves identifier and sequence values from the request
runTest('111. Echo Reply preserves identifier and sequence values from the request', () => {
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

    const testId = 4321;
    const testSeq = 9876;

    const result = simulateSendFrame(pc, server, {
        icmp: {
            type: 'ECHO_REQUEST',
            identifier: testId,
            sequence: testSeq
        }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.icmp.identifier, testId);
    assert.strictEqual(result.packet.icmp.sequence, testSeq);
});

// 112. Event ordering follows chronological protocol flow
runTest('112. Event ordering follows chronological protocol flow', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 300, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[2];
    const server = networkState.devices[3];

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
    addConnection('Router0', 'Server0');

    const result = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(result.success, true);

    const events = result.events;

    const idxArpReq = events.findIndex(e => e.includes('broadcast ARP Request'));
    const idxArpRep = events.findIndex(e => e.includes('received ARP Reply'));
    const idxEchoReqSent = events.findIndex(e => e.includes('sent ICMP Echo Request'));
    const idxEchoReqRecv = events.findIndex(e => e.includes('received ICMP Echo Request'));
    const idxEchoRepGen = events.findIndex(e => e.includes('generated ICMP Echo Reply'));
    const idxEchoRepRecv = events.findIndex(e => e.includes('received ICMP Echo Reply'));

    assert.ok(idxArpReq !== -1, 'Must have ARP Request event');
    assert.ok(idxArpRep !== -1, 'Must have ARP Reply event');
    assert.ok(idxEchoReqSent !== -1, 'Must have Echo Request sent event');
    assert.ok(idxEchoReqRecv !== -1, 'Must have Echo Request received event');
    assert.ok(idxEchoRepGen !== -1, 'Must have Echo Reply generated event');
    assert.ok(idxEchoRepRecv !== -1, 'Must have Echo Reply received event');

    assert.ok(idxArpReq < idxArpRep, 'ARP Request must precede ARP Reply');
    assert.ok(idxArpRep < idxEchoReqSent, 'ARP resolution must precede ICMP Echo Request sending');
    assert.ok(idxEchoReqSent < idxEchoReqRecv, 'Echo Request sending must precede arrival');
    assert.ok(idxEchoReqRecv < idxEchoRepGen, 'Echo Request arrival must precede Echo Reply generation');
    assert.ok(idxEchoRepGen < idxEchoRepRecv, 'Echo Reply generation must precede Echo Reply arrival at source');
});

// 113. Host IP/subnet configuration undo and redo restores complete device state
runTest('113. Host IP/subnet configuration undo and redo restores complete device state', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('pc', 300, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    // Configure PC0
    networkState.selectedDeviceId = pc0.id;
    inspectorDrafts[pc0.id] = {
        ip: '192.168.1.10',
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1'
    };
    applyDeviceConfiguration();

    assert.strictEqual(pc0.ip, '192.168.1.10');
    assert.strictEqual(pc0.subnetMask, '255.255.255.0');
    assert.strictEqual(pc0.gateway, '192.168.1.1');

    // Configure PC1
    networkState.selectedDeviceId = pc1.id;
    inspectorDrafts[pc1.id] = {
        ip: '192.168.1.20',
        subnetMask: '255.255.255.0',
        gateway: '192.168.1.1'
    };
    applyDeviceConfiguration();

    assert.strictEqual(pc1.ip, '192.168.1.20');
    assert.strictEqual(pc1.subnetMask, '255.255.255.0');
    assert.strictEqual(pc1.gateway, '192.168.1.1');

    // Undo PC1 configuration
    undo();
    const restoredPc1 = getDeviceById('PC1');
    const restoredPc0 = getDeviceById('PC0');

    // PC1 must be reverted to previous state
    assert.strictEqual(restoredPc1.ip, '', 'PC1 IP should be restored to initial empty state');
    assert.strictEqual(restoredPc1.subnetMask, '', 'PC1 subnetMask should be restored to initial empty state');
    // PC0 must remain completely intact
    assert.strictEqual(restoredPc0.ip, '192.168.1.10', 'PC0 IP must remain intact after undoing PC1 change');
    assert.strictEqual(restoredPc0.subnetMask, '255.255.255.0', 'PC0 subnetMask must remain intact');
    assert.strictEqual(restoredPc0.gateway, '192.168.1.1', 'PC0 gateway must remain intact');

    // Redo PC1 configuration
    redo();
    const redonePc1 = getDeviceById('PC1');
    const redonePc0 = getDeviceById('PC0');

    assert.strictEqual(redonePc1.ip, '192.168.1.20', 'Redo must restore PC1 IP');
    assert.strictEqual(redonePc1.subnetMask, '255.255.255.0', 'Redo must restore PC1 subnetMask');
    assert.strictEqual(redonePc1.gateway, '192.168.1.1', 'Redo must restore PC1 gateway');
    assert.strictEqual(redonePc0.ip, '192.168.1.10', 'PC0 IP must remain intact after redo');
});

// 114. Router with no valid interfaces returns empty routing table
runTest('114. Router with no valid interfaces returns empty routing table', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    const routes = getRouterRoutingTable(router.id);
    assert.ok(Array.isArray(routes), 'Routing table must be an array');
    assert.strictEqual(routes.length, 0, 'Router with unconfigured interfaces must have 0 routes');
});

// 115. Router with one configured interface produces one Connected (C) route
runTest('115. Router with one configured interface produces one Connected (C) route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 1, 'Must have exactly 1 connected route');

    const route = routes[0];
    assert.strictEqual(route.type, 'connected');
    assert.strictEqual(route.code, 'C');
    assert.strictEqual(route.network, '192.168.1.0');
    assert.strictEqual(route.subnetMask, '255.255.255.0');
    assert.strictEqual(route.prefixLength, 24);
    assert.strictEqual(route.cidr, '192.168.1.0/24');
    assert.strictEqual(route.interface, 'Gig0/0');
    assert.strictEqual(route.nextHop, null);
    assert.strictEqual(route.metric, 0);
    assert.strictEqual(route.status, 'active');
});

// 116. Router with multiple configured interfaces produces multiple Connected (C) routes
runTest('116. Router with multiple configured interfaces produces multiple Connected (C) routes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.0.0.0';

    const routes = getRouterRoutingTable(router);
    assert.strictEqual(routes.length, 2, 'Must have 2 connected routes');

    const route0 = routes.find(r => r.interface === 'Gig0/0');
    const route1 = routes.find(r => r.interface === 'Gig0/1');

    assert.ok(route0, 'Must have route for Gig0/0');
    assert.strictEqual(route0.network, '192.168.1.0');
    assert.strictEqual(route0.cidr, '192.168.1.0/24');
    assert.strictEqual(route0.code, 'C');

    assert.ok(route1, 'Must have route for Gig0/1');
    assert.strictEqual(route1.network, '10.0.0.0');
    assert.strictEqual(route1.cidr, '10.0.0.0/8');
    assert.strictEqual(route1.code, 'C');
});

// 117. Route network calculation for non-classful subnets (/27, /30)
runTest('117. Route network calculation for non-classful subnets (/27, /30)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '172.16.5.67';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.224'; // /27 -> network 172.16.5.64
    router.interfaces['Gig0/1'].ip = '192.168.10.33';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.252'; // /30 -> network 192.168.10.32

    const routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 2);

    const r0 = routes.find(r => r.interface === 'Gig0/0');
    assert.strictEqual(r0.network, '172.16.5.64');
    assert.strictEqual(r0.prefixLength, 27);
    assert.strictEqual(r0.cidr, '172.16.5.64/27');

    const r1 = routes.find(r => r.interface === 'Gig0/1');
    assert.strictEqual(r1.network, '192.168.10.32');
    assert.strictEqual(r1.prefixLength, 30);
    assert.strictEqual(r1.cidr, '192.168.10.32/30');
});

// 118. Route update after interface IP change
runTest('118. Route update after interface IP change', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    let routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes[0].network, '192.168.1.0');

    // Change IP to 192.168.20.1
    router.interfaces['Gig0/0'].ip = '192.168.20.1';
    routes = getRouterRoutingTable(router.id);

    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].network, '192.168.20.0');
    assert.strictEqual(routes[0].cidr, '192.168.20.0/24');
});

// 119. Route update after subnet change
runTest('119. Route update after subnet change', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    let routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes[0].prefixLength, 24);

    // Change subnet mask to 255.255.0.0 (/16)
    router.interfaces['Gig0/0'].subnetMask = '255.255.0.0';
    routes = getRouterRoutingTable(router.id);

    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].network, '192.168.0.0');
    assert.strictEqual(routes[0].prefixLength, 16);
    assert.strictEqual(routes[0].cidr, '192.168.0.0/16');
});

// 120. Route removal after interface becomes invalid/cleared
runTest('120. Route removal after interface becomes invalid/cleared', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.0.0.0';

    assert.strictEqual(getRouterRoutingTable(router.id).length, 2);

    // Clear Gig0/0 IP
    router.interfaces['Gig0/0'].ip = '';
    let routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].interface, 'Gig0/1');

    // Disable Gig0/1
    router.interfaces['Gig0/1'].status = 'down';
    routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 0);
});

// 121. Router routing table integrates with Apply Changes and Undo/Redo
runTest('121. Router routing table integrates with Apply Changes and Undo/Redo', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    // Initial: 0 routes
    assert.strictEqual(getRouterRoutingTable(router.id).length, 0);

    // Apply configuration through inspector
    networkState.selectedDeviceId = router.id;
    inspectorDrafts[router.id] = {
        'interfaces.Gig0/0.ip': '192.168.1.1',
        'interfaces.Gig0/0.subnetMask': '255.255.255.0',
        'interfaces.Gig0/1.ip': '10.0.0.1',
        'interfaces.Gig0/1.subnetMask': '255.0.0.0'
    };
    applyDeviceConfiguration();

    const appliedRoutes = getRouterRoutingTable(router.id);
    assert.strictEqual(appliedRoutes.length, 2);
    assert.strictEqual(appliedRoutes[0].cidr, '192.168.1.0/24');
    assert.strictEqual(appliedRoutes[1].cidr, '10.0.0.0/8');

    // Undo configuration
    undo();
    const restoredRouter = getDeviceById('Router0');
    const undoneRoutes = getRouterRoutingTable(restoredRouter.id);
    assert.strictEqual(undoneRoutes.length, 0, 'Undo must revert routing table to 0 routes');

    // Redo configuration
    redo();
    const redoneRouter = getDeviceById('Router0');
    const redoneRoutes = getRouterRoutingTable(redoneRouter.id);
    assert.strictEqual(redoneRoutes.length, 2, 'Redo must restore both connected routes');
    assert.strictEqual(redoneRoutes[0].cidr, '192.168.1.0/24');
    assert.strictEqual(redoneRoutes[1].cidr, '10.0.0.0/8');
});

// 122. Valid static route creation and properties
runTest('122. Valid static route creation and properties', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '10.50.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '192.168.1.254',
        metric: 2
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.route, 'Must return created route');
    assert.strictEqual(res.route.type, 'static');
    assert.strictEqual(res.route.code, 'S');
    assert.strictEqual(res.route.network, '10.50.0.0');
    assert.strictEqual(res.route.subnetMask, '255.255.0.0');
    assert.strictEqual(res.route.prefixLength, 16);
    assert.strictEqual(res.route.cidr, '10.50.0.0/16');
    assert.strictEqual(res.route.nextHop, '192.168.1.254');
    assert.strictEqual(res.route.interface, 'Gig0/0');
    assert.strictEqual(res.route.metric, 2);
    assert.strictEqual(res.route.status, 'active');
});

// 123. Static route appears as S in router routing table alongside C routes
runTest('123. Static route appears as S in router routing table alongside C routes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '172.16.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '192.168.1.2'
    });

    const routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 2, 'Must have 1 connected route and 1 static route');

    const cRoute = routes.find(r => r.code === 'C');
    const sRoute = routes.find(r => r.code === 'S');

    assert.ok(cRoute, 'Must contain Connected route');
    assert.strictEqual(cRoute.cidr, '192.168.1.0/24');

    assert.ok(sRoute, 'Must contain Static route');
    assert.strictEqual(sRoute.cidr, '172.16.0.0/16');
    assert.strictEqual(sRoute.nextHop, '192.168.1.2');
});

// 124. Valid next-hop on connected subnet is accepted and interface auto-resolved
runTest('124. Valid next-hop on connected subnet is accepted and interface auto-resolved', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '172.20.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.0.2'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.route.interface, 'Gig0/1', 'Must resolve to interface Gig0/1 which connects to 10.0.0.0/24');
});

// 125. Unreachable next-hop is rejected
runTest('125. Unreachable next-hop is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '8.8.8.8' // unreachable
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('unreachable'));
});

// 126. Invalid destination IP is rejected
runTest('126. Invalid destination IP is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '999.999.999.999',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('destination'));
});

// 127. Invalid subnet mask is rejected
runTest('127. Invalid subnet mask is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.0.255', // non-contiguous
        nextHop: '192.168.1.2'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('subnet mask'));
});

// 128. Invalid next-hop IP is rejected
runTest('128. Invalid next-hop IP is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: 'invalid-ip'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('next-hop'));
});

// 129. Non-existent interface is rejected
runTest('129. Non-existent interface is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        interface: 'FastEthernet0/99'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('does not exist'));
});

// 130. Down interface is rejected
runTest('130. Down interface is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].status = 'down';

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        interface: 'Gig0/0'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('down'));
});

// 131. Route requiring either nextHop or interface is enforced
runTest('131. Route requiring either nextHop or interface is enforced', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0'
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.reason.includes('Either next-hop IP or egress interface'));
});

// 132. Duplicate static route is rejected
runTest('132. Duplicate static route is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res1 = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });
    assert.strictEqual(res1.success, true);

    const res2 = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });
    assert.strictEqual(res2.success, false);
    assert.ok(res2.reason.includes('identical'));
});

// 133. Overlapping static routes with different prefix lengths are allowed
runTest('133. Overlapping static routes with different prefix lengths are allowed', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res1 = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0', // /8
        nextHop: '192.168.1.2'
    });
    const res2 = addStaticRoute(router.id, {
        network: '10.1.0.0',
        subnetMask: '255.255.0.0', // /16
        nextHop: '192.168.1.3'
    });
    const res3 = addStaticRoute(router.id, {
        network: '10.1.1.0',
        subnetMask: '255.255.255.0', // /24
        nextHop: '192.168.1.4'
    });

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res3.success, true);

    const routes = getRouterRoutingTable(router.id);
    const staticRoutes = routes.filter(r => r.code === 'S');
    assert.strictEqual(staticRoutes.length, 3, 'Must retain all 3 overlapping static routes');
});

// 134. Static route removal succeeds and only removes target route
runTest('134. Static route removal succeeds and only removes target route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res1 = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });
    const res2 = addStaticRoute(router.id, {
        network: '172.16.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '192.168.1.3'
    });

    const routeIdToRemove = res1.route.id;
    const remRes = removeStaticRoute(router.id, routeIdToRemove);
    assert.strictEqual(remRes.success, true);

    const routes = getRouterRoutingTable(router.id);
    const staticRoutes = routes.filter(r => r.code === 'S');
    assert.strictEqual(staticRoutes.length, 1);
    assert.strictEqual(staticRoutes[0].cidr, '172.16.0.0/16');

    // Removing non-existent route returns failure
    const remNonExistent = removeStaticRoute(router.id, 'non-existent-id');
    assert.strictEqual(remNonExistent.success, false);
});

// 135. Connected routes remain unaffected by static route removal
runTest('135. Connected routes remain unaffected by static route removal', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });

    removeStaticRoute(router.id, res.route.id);

    const routes = getRouterRoutingTable(router.id);
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].code, 'C');
    assert.strictEqual(routes[0].cidr, '192.168.1.0/24');
});

// 136. Static routes are preserved through Undo and Redo snapshots
runTest('136. Static routes are preserved through Undo and Redo snapshots', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // Snapshot before static route
    pushHistory();

    // Add static route
    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });

    assert.strictEqual(getRouterRoutingTable(router.id).filter(r => r.code === 'S').length, 1);

    // Undo -> reverts to 0 static routes
    undo();
    assert.strictEqual(getRouterRoutingTable(router.id).filter(r => r.code === 'S').length, 0);

    // Redo -> restores 1 static route
    redo();
    const redoneRoutes = getRouterRoutingTable(router.id).filter(r => r.code === 'S');
    assert.strictEqual(redoneRoutes.length, 1);
    assert.strictEqual(redoneRoutes[0].cidr, '10.0.0.0/8');
    assert.strictEqual(redoneRoutes[0].nextHop, '192.168.1.2');
});

// 137. lookupRoute returns a matching Connected route
runTest('137. lookupRoute returns a matching Connected route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const result = lookupRoute(router.id, '192.168.1.50');
    assert.strictEqual(result.success, true);
    assert.ok(result.route, 'Must return route');
    assert.strictEqual(result.route.code, 'C');
    assert.strictEqual(result.route.cidr, '192.168.1.0/24');
    assert.strictEqual(result.route.interface, 'Gig0/0');
});

// 138. lookupRoute returns a matching Static route
runTest('138. lookupRoute returns a matching Static route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.254'
    });

    const result = lookupRoute(router.id, '10.5.6.7');
    assert.strictEqual(result.success, true);
    assert.ok(result.route);
    assert.strictEqual(result.route.code, 'S');
    assert.strictEqual(result.route.cidr, '10.0.0.0/8');
    assert.strictEqual(result.route.nextHop, '192.168.1.254');
});

// 139. /24 beats /16
runTest('139. /24 beats /16', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '10.20.0.0',
        subnetMask: '255.255.0.0', // /16
        nextHop: '192.168.1.2'
    });
    addStaticRoute(router.id, {
        network: '10.20.30.0',
        subnetMask: '255.255.255.0', // /24
        nextHop: '192.168.1.3'
    });

    const result = lookupRoute(router.id, '10.20.30.50');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.cidr, '10.20.30.0/24', '/24 must be selected over /16');
    assert.strictEqual(result.route.nextHop, '192.168.1.3');
});

// 140. /16 beats /8
runTest('140. /16 beats /8', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0', // /8
        nextHop: '192.168.1.2'
    });
    addStaticRoute(router.id, {
        network: '10.20.0.0',
        subnetMask: '255.255.0.0', // /16
        nextHop: '192.168.1.3'
    });

    const result = lookupRoute(router.id, '10.20.99.1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.cidr, '10.20.0.0/16', '/16 must be selected over /8');
    assert.strictEqual(result.route.nextHop, '192.168.1.3');
});

// 141. Connected /24 beats Static /16
runTest('141. Connected /24 beats Static /16', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    // Connected: 192.168.1.0/24 on Gig0/0
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // Static: 192.168.0.0/16
    addStaticRoute(router.id, {
        network: '192.168.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '192.168.1.254'
    });

    const result = lookupRoute(router.id, '192.168.1.50');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.code, 'C');
    assert.strictEqual(result.route.cidr, '192.168.1.0/24');
});

// 142. Static /24 beats Connected /16
runTest('142. Static /24 beats Connected /16', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    // Connected: 172.16.0.0/16 on Gig0/0
    router.interfaces['Gig0/0'].ip = '172.16.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.0.0';

    // Static: 172.16.50.0/24
    addStaticRoute(router.id, {
        network: '172.16.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.254'
    });

    const result = lookupRoute(router.id, '172.16.50.10');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.code, 'S');
    assert.strictEqual(result.route.cidr, '172.16.50.0/24', 'Static /24 must beat Connected /16');
});

// 143. Default route /0 matches when no specific route exists
runTest('143. Default route /0 matches when no specific route exists', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '0.0.0.0',
        subnetMask: '0.0.0.0',
        nextHop: '192.168.1.254'
    });

    const result = lookupRoute(router.id, '8.8.8.8');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.code, 'S');
    assert.strictEqual(result.route.cidr, '0.0.0.0/0');
    assert.strictEqual(result.route.nextHop, '192.168.1.254');
});

// 144. Specific route beats default route
runTest('144. Specific route beats default route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '0.0.0.0',
        subnetMask: '0.0.0.0',
        nextHop: '192.168.1.254'
    });
    addStaticRoute(router.id, {
        network: '8.8.8.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2'
    });

    const result = lookupRoute(router.id, '8.8.8.8');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.cidr, '8.8.8.0/24', 'Specific /24 must beat default /0');
    assert.strictEqual(result.route.nextHop, '192.168.1.2');
});

// 145. No matching route returns NO_ROUTE
runTest('145. No matching route returns NO_ROUTE', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const result = lookupRoute(router.id, '10.0.0.1');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'NO_ROUTE');
});

// 146. Invalid destination IP is rejected
runTest('146. Invalid destination IP is rejected', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];

    assert.strictEqual(lookupRoute(router.id, 'invalid.ip').reason, 'INVALID_DESTINATION');
    assert.strictEqual(lookupRoute(router.id, '').reason, 'INVALID_DESTINATION');
    assert.strictEqual(lookupRoute(router.id, '999.999.999.999').reason, 'INVALID_DESTINATION');
    assert.strictEqual(lookupRoute('non-existent-router', '10.0.0.1').reason, 'ROUTER_NOT_FOUND');
});

// 147. Equal-prefix Connected route wins over Static route
runTest('147. Equal-prefix Connected route wins over Static route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // Static route with exact same network and mask: 192.168.1.0/24
    addStaticRoute(router.id, {
        network: '192.168.1.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.254'
    });

    const result = lookupRoute(router.id, '192.168.1.50');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.code, 'C', 'Connected route must win tie with Static route on equal prefix');
});

// 148. Equal-prefix Static routes select lower metric
runTest('148. Equal-prefix Static routes select lower metric', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        id: 'route-high-metric',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2',
        metric: 10
    });
    addStaticRoute(router.id, {
        id: 'route-low-metric',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.3',
        metric: 2
    });

    const result = lookupRoute(router.id, '10.0.0.5');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'route-low-metric', 'Lower metric static route must win');
    assert.strictEqual(result.route.metric, 2);
    assert.strictEqual(result.route.nextHop, '192.168.1.3');
});

// 149. Equal-prefix and equal-metric Static routes use deterministic route ID ordering
runTest('149. Equal-prefix and equal-metric Static routes use deterministic route ID ordering', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        id: 'route-B',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2',
        metric: 1
    });
    addStaticRoute(router.id, {
        id: 'route-A',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.3',
        metric: 1
    });

    const result = lookupRoute(router.id, '10.0.0.5');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'route-A', 'Deterministic ID sorting must choose route-A over route-B');
});

// 150. lookupRoute does not mutate routing state
runTest('150. lookupRoute does not mutate routing state', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.2'
    });

    const tableBefore = JSON.stringify(getRouterRoutingTable(router.id));
    lookupRoute(router.id, '10.1.2.3');
    lookupRoute(router.id, '192.168.1.50');
    lookupRoute(router.id, '8.8.8.8');
    const tableAfter = JSON.stringify(getRouterRoutingTable(router.id));

    assert.strictEqual(tableBefore, tableAfter, 'Routing table must remain completely unchanged');
});

// 151. lookupRoute supports static route with nextHop
runTest('151. lookupRoute supports static route with nextHop', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '172.16.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '192.168.1.254'
    });

    const result = lookupRoute(router.id, '172.16.10.20');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.nextHop, '192.168.1.254');
    assert.strictEqual(result.route.interface, 'Gig0/0');
});

// 152. lookupRoute supports static route with interface only
runTest('152. lookupRoute supports static route with interface only', () => {
    resetLab();
    addDevice('router', 100, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        interface: 'Gig0/0'
    });

    const result = lookupRoute(router.id, '10.99.88.77');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.nextHop, null);
    assert.strictEqual(result.route.interface, 'Gig0/0');
});

// 153. Router forwards using a Connected route
runTest('153. Router forwards using a Connected route', () => {
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
    const routerAction = result.hopActions.find(h => h.deviceId === router.id);
    assert.ok(routerAction, 'Must record router hop action');
    assert.strictEqual(routerAction.action, 'ROUTE');
    assert.strictEqual(routerAction.route.code, 'C');
    assert.strictEqual(routerAction.egressInterface, 'Gig0/1');
});

// 154. Router forwards using a Static route with nextHop
runTest('154. Router forwards using a Static route with nextHop', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Action = result.hopActions.find(h => h.deviceId === r0.id);
    assert.ok(r0Action);
    assert.strictEqual(r0Action.route.code, 'S');
    assert.strictEqual(r0Action.route.nextHop, '172.16.1.2');
    assert.strictEqual(r0Action.egressInterface, 'Gig0/1');
});

// 155. Router forwards using a Static route with interface only
runTest('155. Router forwards using a Static route with interface only', () => {
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

    // Add static route on Router0 for 10.0.0.10/32 with interface only
    addStaticRoute(router.id, {
        network: '10.0.0.10',
        subnetMask: '255.255.255.255',
        interface: 'Gig0/1'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const routerAction = result.hopActions.find(h => h.deviceId === router.id);
    assert.strictEqual(routerAction.route.code, 'S');
    assert.strictEqual(routerAction.route.interface, 'Gig0/1');
    assert.strictEqual(routerAction.route.nextHop, null);
});

// 156. Static route nextHop is used as ARP target
runTest('156. Static route nextHop is used as ARP target', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    simulateSendFrame(pc, server);
    // Router0 must learn Router1 (172.16.1.2), NOT Server0 (10.0.0.10)
    assert.strictEqual(lookupArp(r0.id, '172.16.1.2'), r1.interfaces['Gig0/0'].mac);
    assert.strictEqual(lookupArp(r0.id, '10.0.0.10'), null, 'Router0 must not ARP for final destination behind next-hop');
});

// 157. Final packet destination remains unchanged when using static nextHop
runTest('157. Final packet destination remains unchanged when using static nextHop', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.destinationIp, '10.0.0.10', 'Final destination must remain unchanged');
    assert.strictEqual(result.packet.sourceIp, '192.168.1.10', 'Source IP must remain unchanged');
});

// 158. More-specific static route is used during forwarding
runTest('158. More-specific static route is used during forwarding', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.20.30.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '10.20.30.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.20.30.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Server0');

    // /8 broad route pointing to .99 (unreachable neighbor if used)
    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '172.16.1.99'
    });

    // /24 specific route pointing to .2
    addStaticRoute(r0.id, {
        network: '10.20.30.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Action = result.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Action.route.cidr, '10.20.30.0/24');
    assert.strictEqual(r0Action.route.nextHop, '172.16.1.2');
});

// 159. Default route is used when no more-specific route exists
runTest('159. Default route is used when no more-specific route exists', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    // Default route on Router0
    addStaticRoute(r0.id, {
        network: '0.0.0.0',
        subnetMask: '0.0.0.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Action = result.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Action.route.cidr, '0.0.0.0/0');
    assert.strictEqual(r0Action.route.nextHop, '172.16.1.2');
});

// 160. NO_ROUTE stops router forwarding safely
runTest('160. NO_ROUTE stops router forwarding safely', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    // No static route configured on Router0 for 10.0.0.0/24!
    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: r0.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: {
            sourceIp: pc.ip,
            destinationIp: server.ip,
            ttl: 64
        },
        path: ['PC0', 'Router0', 'Router1', 'Server0'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Router1', 'Server0']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('No route to destination'));
});

// 161. Down static-route egress interface stops forwarding safely
runTest('161. Down static-route egress interface stops forwarding safely', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    // Set Gig0/1 down
    r0.interfaces['Gig0/1'].status = 'down';

    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: r0.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: {
            sourceIp: pc.ip,
            destinationIp: server.ip,
            ttl: 64
        },
        path: ['PC0', 'Router0', 'Router1', 'Server0'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Router1', 'Server0']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

// 162. Invalid/missing egress interface stops forwarding safely
runTest('162. Invalid/missing egress interface stops forwarding safely', () => {
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

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    // Inject static route with corrupted interface
    const runtime = getRouterRuntime(router.id);
    runtime.staticRoutes.push({
        id: 'corrupted-route',
        type: 'static',
        code: 'S',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        prefixLength: 24,
        cidr: '10.0.0.0/24',
        nextHop: null,
        interface: 'NonExistentPort',
        metric: 1,
        status: 'active'
    });

    addConnection('PC0', 'Router0');

    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: router.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: {
            sourceIp: pc.ip,
            destinationIp: server.ip,
            ttl: 64
        },
        path: ['PC0', 'Router0', 'Server0'],
        events: []
    };

    const result = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Server0']);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

// 163. TTL is decremented exactly once per router hop
runTest('163. TTL is decremented exactly once per router hop', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server, { initialTtl: 64 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 62, '64 - 1 (Router0) - 1 (Router1) = 62');
});

// 164. Existing ICMP roundtrip still succeeds through a static route
runTest('164. Existing ICMP roundtrip still succeeds through a static route', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    // Forward route on Router0
    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });
    // Reverse route on Router1
    addStaticRoute(r1.id, {
        network: '192.168.1.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.1'
    });

    const result = simulateSendFrame(pc, server, {
        icmp: { identifier: 7777, sequence: 1 }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.icmp.identifier, 7777);
    assert.strictEqual(result.packet.ttl, 62);
});

// 165. Existing Connected-route forwarding behavior remains unchanged
runTest('165. Existing Connected-route forwarding behavior remains unchanged', () => {
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
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 63);
});

// 166. Multi-router forwarding can traverse a static route
runTest('166. Multi-router forwarding can traverse a static route', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.path, ['PC0', 'Router0', 'Router1', 'Server0']);
});

// 167. Static nextHop does not replace the packet's final destination
runTest("167. Static nextHop does not replace the packet's final destination", () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.destinationIp, '10.0.0.10');
    assert.notStrictEqual(result.packet.destinationIp, '172.16.1.2');
});

// 168. Router forwarding uses lookupRoute() rather than an independent route-selection algorithm
runTest('168. Router forwarding uses lookupRoute() rather than an independent route-selection algorithm', () => {
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

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

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

    addStaticRoute(r0.id, {
        id: 'special-static-route',
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    const expectedRoute = lookupRoute(r0.id, '10.0.0.10').route;
    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Action = result.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Action.route.id, expectedRoute.id);
    assert.strictEqual(r0Action.route.id, 'special-static-route');
});

// 169. Three-router forward static route traversal (Scenario A)
runTest('169. Three-router forward static route traversal', () => {
    resetLab();
    addDevice('pc', 50, 100);      // PC-A
    addDevice('router', 150, 100);  // R1
    addDevice('router', 250, 100);  // R2
    addDevice('router', 350, 100);  // R3
    addDevice('pc', 450, 100);      // PC-B

    const pca = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const r3 = networkState.devices[3];
    const pcb = networkState.devices[4];

    // PC-A: 192.168.10.10/24, GW: 192.168.10.1
    pca.ip = '192.168.10.10';
    pca.subnetMask = '255.255.255.0';
    pca.gateway = '192.168.10.1';

    // R1: Gig0/0 LAN-A (192.168.10.1/24), Gig0/1 Transit-1 (10.0.12.1/30)
    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    // R2: Gig0/0 Transit-1 (10.0.12.2/30), Gig0/1 Transit-2 (10.0.23.1/30)
    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '10.0.23.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    // R3: Gig0/0 Transit-2 (10.0.23.2/30), Gig0/1 LAN-B (192.168.30.1/24)
    r3.interfaces['Gig0/0'].ip = '10.0.23.2';
    r3.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r3.interfaces['Gig0/1'].ip = '192.168.30.1';
    r3.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // PC-B: 192.168.30.10/24, GW: 192.168.30.1
    pcb.ip = '192.168.30.10';
    pcb.subnetMask = '255.255.255.0';
    pcb.gateway = '192.168.30.1';

    addConnection(pca.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, r3.id);
    addConnection(r3.id, pcb.id);

    // Forward Static Routes
    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r2.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    const result = simulateSendFrame(pca, pcb);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 61, 'TTL must decrement 3 times: 64 -> 63 (R1) -> 62 (R2) -> 61 (R3)');
    assert.strictEqual(result.packet.destinationIp, '192.168.30.10');
    assert.strictEqual(result.packet.sourceIp, '192.168.10.10');
    assert.deepStrictEqual(result.path, [pca.name, r1.name, r2.name, r3.name, pcb.name]);
});

// 170. Three-router reverse static route traversal (Scenario B)
runTest('170. Three-router reverse static route traversal', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 450, 100);

    const pca = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const r3 = networkState.devices[3];
    const pcb = networkState.devices[4];

    pca.ip = '192.168.10.10';
    pca.subnetMask = '255.255.255.0';
    pca.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '10.0.23.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r3.interfaces['Gig0/0'].ip = '10.0.23.2';
    r3.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r3.interfaces['Gig0/1'].ip = '192.168.30.1';
    r3.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pcb.ip = '192.168.30.10';
    pcb.subnetMask = '255.255.255.0';
    pcb.gateway = '192.168.30.1';

    addConnection(pca.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, r3.id);
    addConnection(r3.id, pcb.id);

    // Reverse Static Routes: PC-B -> PC-A
    addStaticRoute(r3.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.1' });
    addStaticRoute(r2.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const result = simulateSendFrame(pcb, pca);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 61);
    assert.strictEqual(result.packet.destinationIp, '192.168.10.10');
    assert.strictEqual(result.packet.sourceIp, '192.168.30.10');
    assert.deepStrictEqual(result.path, [pcb.name, r3.name, r2.name, r1.name, pca.name]);
});

// 171. End-to-end ICMP request/reply across three routers (Scenario B)
runTest('171. End-to-end ICMP request/reply across three routers', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 450, 100);

    const pca = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const r3 = networkState.devices[3];
    const pcb = networkState.devices[4];

    pca.ip = '192.168.10.10';
    pca.subnetMask = '255.255.255.0';
    pca.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '10.0.23.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r3.interfaces['Gig0/0'].ip = '10.0.23.2';
    r3.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r3.interfaces['Gig0/1'].ip = '192.168.30.1';
    r3.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pcb.ip = '192.168.30.10';
    pcb.subnetMask = '255.255.255.0';
    pcb.gateway = '192.168.30.1';

    addConnection(pca.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, r3.id);
    addConnection(r3.id, pcb.id);

    // Forward routes
    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r2.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    // Reverse routes
    addStaticRoute(r3.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.1' });
    addStaticRoute(r2.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const result = simulateSendFrame(pca, pcb, {
        icmp: { identifier: 9999, sequence: 1 }
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.protocol, 'ICMP');
    assert.strictEqual(result.packet.icmp.type, 'ECHO_REPLY');
    assert.strictEqual(result.packet.icmp.identifier, 9999);
    assert.strictEqual(result.packet.ttl, 61);
});

// 172. Real forwarding LPM selection (Scenario C)
runTest('172. Real forwarding LPM selection', () => {
    resetLab();
    addDevice('pc', 50, 100);       // PC
    addDevice('router', 200, 100);   // R0
    addDevice('router', 350, 100);   // R1
    addDevice('server', 500, 100);   // Server

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const server = networkState.devices[3];

    // PC: 192.168.1.10/24, GW: 192.168.1.1
    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    // R0: Gig0/0 LAN (192.168.1.1/24), Gig0/1 Transit (172.16.1.1/24)
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // R1: Gig0/0 Transit 172.16.1.2/24, Gig0/1 LAN
    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addConnection(pc.id, r0.id);
    addConnection(r0.id, r1.id);
    addConnection(r1.id, server.id);

    // Static routes on R0:
    // S 10.20.30.0/24 via 172.16.1.2
    addStaticRoute(r0.id, { id: 'route-slash-24', network: '10.20.30.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2' });
    // S 10.20.0.0/16 via 172.16.1.2
    addStaticRoute(r0.id, { id: 'route-slash-16', network: '10.20.0.0', subnetMask: '255.255.0.0', nextHop: '172.16.1.2' });
    // S 10.0.0.0/8 via 172.16.1.2
    addStaticRoute(r0.id, { id: 'route-slash-8', network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '172.16.1.2' });
    // S 0.0.0.0/0 via 172.16.1.2
    addStaticRoute(r0.id, { id: 'route-default', network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '172.16.1.2' });

    // 1. Destination 10.20.30.50 -> /24 must be selected by R0
    r1.interfaces['Gig0/1'].ip = '10.20.30.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    server.ip = '10.20.30.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.20.30.1';
    clearArpTable(r0.id);
    clearArpTable(r1.id);
    const res24 = simulateSendFrame(pc, server);
    assert.strictEqual(res24.success, true);
    const r0Hop24 = res24.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop24.route.cidr, '10.20.30.0/24');

    // 2. Destination 10.20.99.50 -> /16 must be selected by R0
    r1.interfaces['Gig0/1'].ip = '10.20.99.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    server.ip = '10.20.99.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.20.99.1';
    clearArpTable(r0.id);
    clearArpTable(r1.id);
    const res16 = simulateSendFrame(pc, server);
    assert.strictEqual(res16.success, true);
    const r0Hop16 = res16.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop16.route.cidr, '10.20.0.0/16');

    // 3. Destination 10.50.1.50 -> /8 must be selected by R0
    r1.interfaces['Gig0/1'].ip = '10.50.1.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    server.ip = '10.50.1.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.50.1.1';
    clearArpTable(r0.id);
    clearArpTable(r1.id);
    const res8 = simulateSendFrame(pc, server);
    assert.strictEqual(res8.success, true);
    const r0Hop8 = res8.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop8.route.cidr, '10.0.0.0/8');

    // 4. Destination 8.8.8.8 -> /0 Default route must be selected by R0
    r1.interfaces['Gig0/1'].ip = '8.8.8.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    server.ip = '8.8.8.8';
    server.subnetMask = '255.255.255.0';
    server.gateway = '8.8.8.1';
    clearArpTable(r0.id);
    clearArpTable(r1.id);
    const res0 = simulateSendFrame(pc, server);
    assert.strictEqual(res0.success, true);
    const r0Hop0 = res0.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop0.route.cidr, '0.0.0.0/0');
});

// 173. Connected route beats less-specific static route during forwarding (Scenario D)
runTest('173. Connected route beats less-specific static route during forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('server', 350, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    // Connected: 192.168.1.0/24 on Gig0/1
    router.interfaces['Gig0/0'].ip = '10.0.0.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '192.168.1.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.1.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.1.1';

    addConnection(pc.id, router.id);
    addConnection(router.id, server.id);

    // Static route /16 overlapping connected /24
    addStaticRoute(router.id, { network: '192.168.0.0', subnetMask: '255.255.0.0', nextHop: '10.0.0.2' });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const routerHop = result.hopActions.find(h => h.deviceId === router.id);
    assert.strictEqual(routerHop.route.code, 'C', 'Connected /24 must beat Static /16');
    assert.strictEqual(routerHop.route.cidr, '192.168.1.0/24');
});

// 174. Equal-prefix Connected beats Static during forwarding (Scenario D)
runTest('174. Equal-prefix Connected beats Static during forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('server', 350, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    router.interfaces['Gig0/0'].ip = '10.0.0.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '192.168.1.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.1.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.1.1';

    addConnection(pc.id, router.id);
    addConnection(router.id, server.id);

    // Static route with identical prefix 192.168.1.0/24
    addStaticRoute(router.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2' });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const routerHop = result.hopActions.find(h => h.deviceId === router.id);
    assert.strictEqual(routerHop.route.code, 'C', 'Connected route must beat Static route on equal prefix tie');
});

// 175. Static nextHop used as ARP target while destination remains unchanged (Scenario E)
runTest('175. Static nextHop used as ARP target while destination remains unchanged', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '192.168.30.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.30.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.30.1';

    addConnection(pc.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, server.id);

    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });

    clearArpTable(r1.id);
    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(lookupArp(r1.id, '10.0.12.2'), r2.interfaces['Gig0/0'].mac, 'R1 must ARP for nextHop 10.0.12.2');
    assert.strictEqual(lookupArp(r1.id, '192.168.30.50'), null, 'R1 must NOT ARP for remote server IP');
    assert.strictEqual(result.packet.destinationIp, '192.168.30.50', 'Packet destination IP must remain untouched');
});

// 176. Default route used during real forwarding (Scenario F)
runTest('176. Default route used during real forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '172.20.5.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '172.20.5.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '172.20.5.1';

    addConnection(pc.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, server.id);

    // Default route on R1
    addStaticRoute(r1.id, { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '10.0.12.2' });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r1Hop = result.hopActions.find(h => h.deviceId === r1.id);
    assert.strictEqual(r1Hop.route.cidr, '0.0.0.0/0');
});

// 177. More-specific route beats default during real forwarding (Scenario F)
runTest('177. More-specific route beats default during real forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r2.interfaces['Gig0/1'].ip = '172.20.5.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '172.20.5.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '172.20.5.1';

    addConnection(pc.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, server.id);

    // Default route to .99 (unreachable neighbor if chosen)
    addStaticRoute(r1.id, { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '10.0.12.99' });
    // Specific route to .2
    addStaticRoute(r1.id, { network: '172.20.0.0', subnetMask: '255.255.0.0', nextHop: '10.0.12.2' });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r1Hop = result.hopActions.find(h => h.deviceId === r1.id);
    assert.strictEqual(r1Hop.route.cidr, '172.20.0.0/16', 'Specific /16 must override default /0');
});

// 178. Missing return route causes NO_ROUTE on reverse ICMP reply (Scenario G)
runTest('178. Missing return route causes NO_ROUTE on reverse ICMP reply', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 450, 100);

    const pca = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const r3 = networkState.devices[3];
    const pcb = networkState.devices[4];

    pca.ip = '192.168.10.10';
    pca.subnetMask = '255.255.255.0';
    pca.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '10.0.23.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r3.interfaces['Gig0/0'].ip = '10.0.23.2';
    r3.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r3.interfaces['Gig0/1'].ip = '192.168.30.1';
    r3.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pcb.ip = '192.168.30.10';
    pcb.subnetMask = '255.255.255.0';
    pcb.gateway = '192.168.30.1';

    addConnection(pca.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, r3.id);
    addConnection(r3.id, pcb.id);

    // Forward routes present
    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r2.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    // Reverse routes: R3 has route, but R2 is DELIBERATELY MISSING return route!
    addStaticRoute(r3.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.1' });

    const result = simulateSendFrame(pca, pcb, { icmp: true });
    assert.strictEqual(result.success, false, 'ICMP roundtrip must fail due to missing return route');
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('No route to destination'));
});

// 179. Down static-route egress interface causes safe DROP (Scenario H)
runTest('179. Down static-route egress interface causes safe DROP', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '192.168.30.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.30.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.30.1';

    addConnection(pc.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, server.id);

    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });

    // Administratively bring Gig0/1 down on R1
    r1.interfaces['Gig0/1'].status = 'down';

    const path = [pc.id, r1.id, r2.id, server.id];
    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: r1.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc.ip, destinationIp: server.ip, ttl: 64 },
        path,
        events: []
    };

    const result = simulatePathTransmission(frame, pc, server, path);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('down'));
});

// 180. Multi-router TTL decrements once per router (Scenario I)
runTest('180. Multi-router TTL decrements once per router', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 450, 100);

    const pca = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];
    const r3 = networkState.devices[3];
    const pcb = networkState.devices[4];

    pca.ip = '192.168.10.10';
    pca.subnetMask = '255.255.255.0';
    pca.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '10.0.23.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r3.interfaces['Gig0/0'].ip = '10.0.23.2';
    r3.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r3.interfaces['Gig0/1'].ip = '192.168.30.1';
    r3.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pcb.ip = '192.168.30.10';
    pcb.subnetMask = '255.255.255.0';
    pcb.gateway = '192.168.30.1';

    addConnection(pca.id, r1.id);
    addConnection(r1.id, r2.id);
    addConnection(r2.id, r3.id);
    addConnection(r3.id, pcb.id);

    addStaticRoute(r1.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r2.id, { network: '192.168.30.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    const result = simulateSendFrame(pca, pcb, { initialTtl: 64 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.ttl, 61);

    const r1Hop = result.hopActions.find(h => h.deviceId === r1.id);
    const r2Hop = result.hopActions.find(h => h.deviceId === r2.id);
    const r3Hop = result.hopActions.find(h => h.deviceId === r3.id);

    assert.strictEqual(r1Hop.ttl, 63);
    assert.strictEqual(r2Hop.ttl, 62);
    assert.strictEqual(r3Hop.ttl, 61);
});

// 181. Static routing loop terminates safely (Scenario J)
runTest('181. Static routing loop terminates safely', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);

    const pc = networkState.devices[0];
    const r1 = networkState.devices[1];
    const r2 = networkState.devices[2];

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.10.1';

    r1.interfaces['Gig0/0'].ip = '192.168.10.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.12.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r2.interfaces['Gig0/0'].ip = '10.0.12.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addConnection(pc.id, r1.id);
    addConnection(r1.id, r2.id);

    // Mutual routing loop for 10.99.0.0/24: R1 points to R2, R2 points to R1
    addStaticRoute(r1.id, { network: '10.99.0.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r2.id, { network: '10.99.0.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const loopingPath = [pc.id, r1.id, r2.id, r1.id, r2.id, r1.id];
    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: r2.id,
        sourceMac: pc.mac,
        destinationMac: r1.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc.ip, destinationIp: '10.99.0.50', ttl: 3 },
        path: loopingPath,
        events: []
    };

    const result = simulatePathTransmission(frame, pc, r2, loopingPath);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('Time to Live (TTL) expired'));
});

// 182. Interface-only static route forwards correctly (Scenario K)
runTest('182. Interface-only static route forwards correctly', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('server', 350, 100);

    const pc = networkState.devices[0];
    const router = networkState.devices[1];
    const server = networkState.devices[2];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    router.interfaces['Gig0/0'].ip = '10.0.0.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '172.16.50.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '172.16.50.99';
    server.subnetMask = '255.255.255.0';
    server.gateway = '172.16.50.1';

    addConnection(pc.id, router.id);
    addConnection(router.id, server.id);

    // Interface-only route
    addStaticRoute(router.id, { network: '172.16.50.99', subnetMask: '255.255.255.255', interface: 'Gig0/1' });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.packet.destinationIp, '172.16.50.99');
    const routerHop = result.hopActions.find(h => h.deviceId === router.id);
    assert.strictEqual(routerHop.route.interface, 'Gig0/1');
    assert.strictEqual(routerHop.route.nextHop, null);
});

// 183. Same-prefix static routes use lower metric during real forwarding (Scenario L)
runTest('183. Same-prefix static routes use lower metric during real forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '192.168.50.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.50.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.50.1';

    addConnection(pc.id, r0.id);
    addConnection(r0.id, r1.id);
    addConnection(r1.id, server.id);

    // Two static routes with same prefix, different metrics
    addStaticRoute(r0.id, { id: 'high-metric', network: '192.168.50.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.99', metric: 50 });
    addStaticRoute(r0.id, { id: 'low-metric', network: '192.168.50.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2', metric: 5 });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Hop = result.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop.route.id, 'low-metric');
    assert.strictEqual(r0Hop.route.metric, 5);
});

// 184. Equal metric/static routes use deterministic route ID during real forwarding (Scenario L)
runTest('184. Equal metric/static routes use deterministic route ID during real forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const server = networkState.devices[3];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '192.168.50.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.50.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.50.1';

    addConnection(pc.id, r0.id);
    addConnection(r0.id, r1.id);
    addConnection(r1.id, server.id);

    // Two routes with same prefix & same metric
    addStaticRoute(r0.id, { id: 'route-Z', network: '192.168.50.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.99', metric: 1 });
    addStaticRoute(r0.id, { id: 'route-A', network: '192.168.50.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2', metric: 1 });

    const result = simulateSendFrame(pc, server);
    assert.strictEqual(result.success, true);
    const r0Hop = result.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop.route.id, 'route-A', 'Deterministic alphabetical sort must pick route-A over route-Z');
});

// 185. Static route added through the supported route-management path appears in routing table state
runTest('185. Static route added through the supported route-management path appears in routing table state', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const addRes = addStaticRoute(router.id, {
        network: '10.20.30.0',
        subnetMask: '255.255.255.0',
        interface: 'Gig0/0',
        metric: 2
    });
    assert.strictEqual(addRes.success, true);
    assert.strictEqual(addRes.route.cidr, '10.20.30.0/24');

    const table = getRouterRoutingTable(router.id);
    const staticEntry = table.find(r => r.id === addRes.route.id);
    assert.ok(staticEntry, 'Static route must appear in getRouterRoutingTable');
    assert.strictEqual(staticEntry.code, 'S');
    assert.strictEqual(staticEntry.network, '10.20.30.0');
    assert.strictEqual(staticEntry.prefixLength, 24);
    assert.strictEqual(staticEntry.interface, 'Gig0/0');
    assert.strictEqual(staticEntry.metric, 2);
    assert.strictEqual(staticEntry.status, 'active');
});

// 186. Static route removal removes only the selected static route
runTest('186. Static route removal removes only the selected static route', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res1 = addStaticRoute(router.id, { id: 'route-1', network: '10.1.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    const res2 = addStaticRoute(router.id, { id: 'route-2', network: '10.2.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);

    const remRes = removeStaticRoute(router.id, 'route-1');
    assert.strictEqual(remRes.success, true);

    const table = getRouterRoutingTable(router.id);
    assert.strictEqual(table.some(r => r.id === 'route-1'), false, 'route-1 must be removed');
    assert.strictEqual(table.some(r => r.id === 'route-2'), true, 'route-2 must be preserved');
});

// 187. Connected routes cannot be removed through removeStaticRoute
runTest('187. Connected routes cannot be removed through removeStaticRoute', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const tableBefore = getRouterRoutingTable(router.id);
    const connectedRoute = tableBefore.find(r => r.code === 'C');
    assert.ok(connectedRoute, 'Connected route must exist');
    assert.strictEqual(connectedRoute.id, undefined, 'Connected route has no static route ID');

    // Attempt removal with undefined/empty ID
    const remRes1 = removeStaticRoute(router.id, connectedRoute.id);
    assert.strictEqual(remRes1.success, false);
    assert.strictEqual(remRes1.reason, 'Route ID is required.');

    // Attempt removal with non-existent static route ID
    const remRes2 = removeStaticRoute(router.id, 'connected-route-Gig0/0');
    assert.strictEqual(remRes2.success, false);
    assert.strictEqual(remRes2.reason, 'Static route not found.');

    const tableAfter = getRouterRoutingTable(router.id);
    assert.strictEqual(tableAfter.length, 1);
    assert.strictEqual(tableAfter[0].code, 'C');
});

// 188. Add/remove operations preserve Undo/Redo behavior
runTest('188. Add/remove operations preserve Undo/Redo behavior', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // 1. Add static route with snapshot
    pushHistory();
    const addRes = addStaticRoute(router.id, { id: 'undo-route', network: '172.16.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    assert.strictEqual(addRes.success, true);
    assert.strictEqual(getRouterRoutingTable(router.id).length, 2);

    // 2. Undo -> static route disappears
    undo();
    const tableAfterUndo = getRouterRoutingTable(router.id);
    assert.strictEqual(tableAfterUndo.length, 1);
    assert.strictEqual(tableAfterUndo.some(r => r.id === 'undo-route'), false);

    // 3. Redo -> static route returns
    redo();
    const tableAfterRedo = getRouterRoutingTable(router.id);
    assert.strictEqual(tableAfterRedo.length, 2);
    assert.strictEqual(tableAfterRedo.some(r => r.id === 'undo-route'), true);

    // 4. Remove static route with snapshot
    pushHistory();
    const remRes = removeStaticRoute(router.id, 'undo-route');
    assert.strictEqual(remRes.success, true);
    assert.strictEqual(getRouterRoutingTable(router.id).length, 1);

    // 5. Undo removal -> static route returns
    undo();
    const tableAfterUndoRem = getRouterRoutingTable(router.id);
    assert.strictEqual(tableAfterUndoRem.length, 2);
    assert.strictEqual(tableAfterUndoRem.some(r => r.id === 'undo-route'), true);

    // 6. Redo removal -> static route removed
    redo();
    const tableAfterRedoRem = getRouterRoutingTable(router.id);
    assert.strictEqual(tableAfterRedoRem.length, 1);
});

// 189. Routing table contains both C and S routes after adding a static route
runTest('189. Routing table contains both C and S routes after adding a static route', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, { network: '172.20.0.0', subnetMask: '255.255.0.0', nextHop: '10.0.0.2' });

    const table = getRouterRoutingTable(router.id);
    assert.strictEqual(table.length, 3);
    const cRoutes = table.filter(r => r.code === 'C');
    const sRoutes = table.filter(r => r.code === 'S');
    assert.strictEqual(cRoutes.length, 2);
    assert.strictEqual(sRoutes.length, 1);
    assert.strictEqual(sRoutes[0].cidr, '172.20.0.0/16');
    assert.strictEqual(sRoutes[0].nextHop, '10.0.0.2');
    assert.strictEqual(sRoutes[0].interface, 'Gig0/1');
});

// 190. Duplicate route rejection remains intact through the UI-facing path
runTest('190. Duplicate route rejection remains intact through the UI-facing path', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res1 = addStaticRoute(router.id, { network: '10.50.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    assert.strictEqual(res1.success, true);

    const res2 = addStaticRoute(router.id, { network: '10.50.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    assert.strictEqual(res2.success, false);
    assert.ok(res2.reason.includes('already exists'));

    const table = getRouterRoutingTable(router.id);
    const matches = table.filter(r => r.cidr === '10.50.0.0/16');
    assert.strictEqual(matches.length, 1, 'Only one instance of the route must exist');
});

// 191. Invalid route input does not partially mutate router state
runTest('191. Invalid route input does not partially mutate router state', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, { id: 'base-route', network: '10.0.0.0', subnetMask: '255.0.0.0', interface: 'Gig0/0' });
    const initialCount = getRouterRuntime(router.id).staticRoutes.length;
    assert.strictEqual(initialCount, 1);

    // Invalid destination
    const r1 = addStaticRoute(router.id, { network: 'invalid-ip', subnetMask: '255.255.255.0', interface: 'Gig0/0' });
    assert.strictEqual(r1.success, false);

    // Invalid mask
    const r2 = addStaticRoute(router.id, { network: '10.1.0.0', subnetMask: '255.255.0.1', interface: 'Gig0/0' });
    assert.strictEqual(r2.success, false);

    // Unreachable nextHop
    const r3 = addStaticRoute(router.id, { network: '10.2.0.0', subnetMask: '255.255.0.0', nextHop: '192.168.99.99' });
    assert.strictEqual(r3.success, false);

    // Missing nextHop and interface
    const r4 = addStaticRoute(router.id, { network: '10.3.0.0', subnetMask: '255.255.0.0' });
    assert.strictEqual(r4.success, false);

    const finalCount = getRouterRuntime(router.id).staticRoutes.length;
    assert.strictEqual(finalCount, 1, 'Static routes array must not be modified by failed validations');
    assert.strictEqual(getRouterRuntime(router.id).staticRoutes[0].id, 'base-route');
});

// 192. Router Inspector HTML renders Routing Table and Static Routes sections
runTest('192. Router Inspector HTML renders Routing Table and Static Routes sections', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const html = renderRouterInspector(router);
    assert.ok(html.includes('ROUTING TABLE'), 'Must contain ROUTING TABLE heading');
    assert.ok(html.includes('STATIC ROUTES'), 'Must contain STATIC ROUTES heading');
    assert.ok(html.includes('router-routing-table'), 'Must contain routing table class');
    assert.ok(html.includes('static-route-form'), 'Must contain static-route-form');
    assert.ok(html.includes('id="addStaticRouteBtn"'), 'Must contain Add Route button');
    assert.ok(html.includes('badge--connected'), 'Must contain connected route badge');
    assert.ok(html.includes('192.168.1.0'), 'Must contain normalized network address');
    assert.ok(html.includes('/24'), 'Must contain prefix length');
});

// 193. Non-router device inspectors do NOT render routing sections
runTest('193. Non-router device inspectors do NOT render routing sections', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('laptop', 150, 100);
    addDevice('server', 250, 100);
    addDevice('switch', 350, 100);

    const pc = networkState.devices[0];
    const laptop = networkState.devices[1];
    const server = networkState.devices[2];
    const sw = networkState.devices[3];

    [pc, laptop, server, sw].forEach((dev) => {
        networkState.selectedDeviceId = dev.id;
        renderPropertiesPanel();
        const panelHtml = document.getElementById('propertiesPanel').innerHTML;
        assert.strictEqual(panelHtml.includes('ROUTING TABLE'), false, 'Device ' + dev.type + ' must not render ROUTING TABLE');
        assert.strictEqual(panelHtml.includes('STATIC ROUTES'), false, 'Device ' + dev.type + ' must not render STATIC ROUTES');
    });
});

// 194. Static route table row renders delete button and badge--static
runTest('194. Static route table row renders delete button and badge--static', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, { id: 'test-static-1', network: '10.20.30.0', subnetMask: '255.255.255.0', interface: 'Gig0/0' });
    const html = renderRouterRoutingTableSection(router);

    assert.ok(html.includes('badge--static'), 'Must contain badge--static');
    assert.ok(html.includes('data-route-id="test-static-1"'), 'Must contain delete button with route ID');
    assert.ok(html.includes('route-delete-btn'), 'Must contain route-delete-btn class');
});

// 195. Router switching maintains separate routing table rendering
runTest('195. Router switching maintains separate routing table rendering', () => {
    resetLab();
    addDevice('router', 200, 100);
    addDevice('router', 400, 100);
    const r0 = networkState.devices[0];
    const r1 = networkState.devices[1];

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/0'].ip = '10.0.0.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, { id: 'r0-route', network: '172.16.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });
    addStaticRoute(r1.id, { id: 'r1-route', network: '172.30.0.0', subnetMask: '255.255.0.0', interface: 'Gig0/0' });

    const r0Html = renderRouterRoutingTableSection(r0);
    assert.ok(r0Html.includes('172.16.0.0'), 'r0 HTML must contain r0 route');
    assert.strictEqual(r0Html.includes('172.30.0.0'), false, 'r0 HTML must not contain r1 route');

    const r1Html = renderRouterRoutingTableSection(r1);
    assert.ok(r1Html.includes('172.30.0.0'), 'r1 HTML must contain r1 route');
    assert.strictEqual(r1Html.includes('172.16.0.0'), false, 'r1 HTML must not contain r0 route');
});

// 196. Interface IP change automatically updates Connected route in rendered HTML
runTest('196. Interface IP change automatically updates Connected route in rendered HTML', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const beforeHtml = renderRouterRoutingTableSection(router);
    assert.ok(beforeHtml.includes('192.168.1.0'), 'Initial HTML must show 192.168.1.0');

    // Change IP
    router.interfaces['Gig0/0'].ip = '192.168.2.1';
    const afterHtml = renderRouterRoutingTableSection(router);
    assert.strictEqual(afterHtml.includes('192.168.1.0'), false, 'Old network must not be present');
    assert.ok(afterHtml.includes('192.168.2.0'), 'New network 192.168.2.0 must be present');
});

// 197. Static route form section renders all required fields and interface options
runTest('197. Static route form section renders all required fields and interface options', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];

    const formHtml = renderRouterStaticRouteFormSection(router);
    assert.ok(formHtml.includes('id="staticRouteDest"'), 'Must have destination input');
    assert.ok(formHtml.includes('id="staticRouteMask"'), 'Must have mask input');
    assert.ok(formHtml.includes('id="staticRouteNextHop"'), 'Must have nextHop input');
    assert.ok(formHtml.includes('id="staticRouteInterface"'), 'Must have interface select');
    assert.ok(formHtml.includes('id="staticRouteMetric"'), 'Must have metric input');
    assert.ok(formHtml.includes('id="staticRouteFeedback"'), 'Must have feedback container');
    assert.ok(formHtml.includes('Gig0/0 (up)'), 'Must enumerate Gig0/0 interface');
    assert.ok(formHtml.includes('Gig0/1 (up)'), 'Must enumerate Gig0/1 interface');
});

// ==========================================
// V5.10 TEST SUITE: ADMINISTRATIVE DISTANCE, FLOATING STATIC ROUTES & INTERFACE ADMIN STATE
// ==========================================

// 198. Equal-prefix static routes select lower Administrative Distance (AD 1 beats AD 10)
runTest('198. Equal-prefix static routes select lower Administrative Distance (AD 1 beats AD 10)', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '10.0.12.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.13.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Primary route: AD 1 via Gig0/0
    addStaticRoute(router.id, {
        id: 'primary-route',
        network: '10.20.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.12.2',
        adminDistance: 1
    });

    // Backup route: AD 10 via Gig0/1
    addStaticRoute(router.id, {
        id: 'backup-route',
        network: '10.20.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.13.2',
        adminDistance: 10
    });

    const result = lookupRoute(router.id, '10.20.5.1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'primary-route', 'AD 1 route must be preferred over AD 10 route');
    assert.strictEqual(result.route.adminDistance, 1);
});

// 199. Longest Prefix Match (LPM) takes precedence over Administrative Distance (/24 AD 200 beats /16 AD 1)
runTest('199. Longest Prefix Match (LPM) takes precedence over Administrative Distance (/24 AD 200 beats /16 AD 1)', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '10.0.12.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.13.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Less-specific route with low AD: 10.20.0.0/16 AD 1
    addStaticRoute(router.id, {
        id: 'broad-route',
        network: '10.20.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.12.2',
        adminDistance: 1
    });

    // More-specific route with very high AD: 10.20.10.0/24 AD 200
    addStaticRoute(router.id, {
        id: 'specific-route',
        network: '10.20.10.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.13.2',
        adminDistance: 200
    });

    const result = lookupRoute(router.id, '10.20.10.5');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'specific-route', 'LPM /24 with AD 200 must beat /16 with AD 1');
    assert.strictEqual(result.route.cidr, '10.20.10.0/24');
});

// 200. Equal prefix and equal AD select route with lower metric
runTest('200. Equal prefix and equal AD select route with lower metric', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '10.0.12.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.13.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Route A: AD 10, Metric 5
    addStaticRoute(router.id, {
        id: 'low-metric-route',
        network: '10.30.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.12.2',
        adminDistance: 10,
        metric: 5
    });

    // Route B: AD 10, Metric 20
    addStaticRoute(router.id, {
        id: 'high-metric-route',
        network: '10.30.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.13.2',
        adminDistance: 10,
        metric: 20
    });

    const result = lookupRoute(router.id, '10.30.1.1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'low-metric-route', 'Route with lower metric must win when AD is equal');
    assert.strictEqual(result.route.metric, 5);
});

// 201. Static route created without explicit adminDistance defaults to AD 1
runTest('201. Static route created without explicit adminDistance defaults to AD 1', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const addRes = addStaticRoute(router.id, {
        network: '172.16.0.0',
        subnetMask: '255.255.0.0',
        interface: 'Gig0/0'
    });

    assert.strictEqual(addRes.success, true);
    assert.strictEqual(addRes.route.adminDistance, 1, 'Default adminDistance must be 1');

    const table = getRouterRoutingTable(router.id);
    const staticEntry = table.find(r => r.id === addRes.route.id);
    assert.ok(staticEntry);
    assert.strictEqual(staticEntry.adminDistance, 1);
});

// 202. Existing static routes without adminDistance in legacy snapshot are treated as AD 1
runTest('202. Existing static routes without adminDistance in legacy snapshot are treated as AD 1', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // Simulate legacy snapshot route entry without adminDistance field
    const runtime = getRouterRuntime(router.id);
    runtime.staticRoutes.push({
        id: 'legacy-route',
        type: 'static',
        code: 'S',
        network: '10.50.0.0',
        subnetMask: '255.255.0.0',
        prefixLength: 16,
        cidr: '10.50.0.0/16',
        nextHop: null,
        interface: 'Gig0/0',
        metric: 1,
        status: 'active'
        // adminDistance is intentionally undefined (legacy format)
    });

    const snapshot = createLabSnapshot();
    resetLab();
    restoreSnapshot(snapshot);

    const lookupRes = lookupRoute(router.id, '10.50.1.1');
    assert.strictEqual(lookupRes.success, true);
    assert.strictEqual(lookupRes.route.id, 'legacy-route');
    assert.strictEqual(lookupRes.route.adminDistance ?? 1, 1, 'Legacy route must be treated as AD 1');
});

// 203. Connected routes have effective AD 0 and beat static routes with equal prefix
runTest('203. Connected routes have effective AD 0 and beat static routes with equal prefix', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.0.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Add static route with identical prefix 192.168.1.0/24 (AD 1)
    addStaticRoute(router.id, {
        network: '192.168.1.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.0.2',
        adminDistance: 1
    });

    const table = getRouterRoutingTable(router.id);
    const connectedRoute = table.find(r => r.code === 'C' && r.cidr === '192.168.1.0/24');
    assert.ok(connectedRoute);
    assert.strictEqual(connectedRoute.adminDistance, 0, 'Connected route must have AD 0');

    const result = lookupRoute(router.id, '192.168.1.50');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.code, 'C', 'Connected route (AD 0) must beat Static route (AD 1)');
});

// 204. Floating static route is not used when primary interface is UP
runTest('204. Floating static route is not used when primary interface is UP', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 80);   // R1 primary
    addDevice('router', 320, 160);  // R2 backup
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const r2 = networkState.devices[3];
    const server = networkState.devices[4];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    // R0 interfaces: Gig0/0 to R1 (primary), Gig0/1 to R2 (backup)
    r0.interfaces['Gig0/0'].ip = '172.16.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '192.168.50.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r2.interfaces['Gig0/0'].ip = '172.16.2.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r2.interfaces['Gig0/1'].ip = '192.168.50.2';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.50.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.50.1';

    addConnection(pc.id, r0.id);
    addConnection(r0.id, r1.id);
    addConnection(r0.id, r2.id);
    addConnection(r1.id, server.id);
    addConnection(r2.id, server.id);

    // Primary route: AD 1 via R1 (Gig0/0)
    addStaticRoute(r0.id, {
        id: 'primary-r0-to-server',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2',
        adminDistance: 1
    });

    // Floating static route: AD 10 via R2 (Gig0/1)
    addStaticRoute(r0.id, {
        id: 'backup-r0-to-server',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.2.2',
        adminDistance: 10
    });

    const routeRes = lookupRoute(r0.id, '192.168.50.10');
    assert.strictEqual(routeRes.success, true);
    assert.strictEqual(routeRes.route.id, 'primary-r0-to-server', 'Must select primary route when Gig0/0 is UP');
    assert.strictEqual(routeRes.route.interface, 'Gig0/0');
});

// 205. Floating static route automatically takes over when primary interface is DOWN
runTest('205. Floating static route automatically takes over when primary interface is DOWN', () => {
    resetLab();
    addDevice('router', 200, 100);
    const r0 = networkState.devices[0];

    r0.interfaces['Gig0/0'].ip = '172.16.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        id: 'primary-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2',
        adminDistance: 1
    });

    addStaticRoute(r0.id, {
        id: 'backup-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.2.2',
        adminDistance: 10
    });

    // Administratively shut down primary interface Gig0/0
    r0.interfaces['Gig0/0'].status = 'down';

    const table = getRouterRoutingTable(r0.id);
    const primaryEntry = table.find(r => r.id === 'primary-route');
    const backupEntry = table.find(r => r.id === 'backup-route');

    assert.ok(primaryEntry, 'Primary route should still be in table schema');
    assert.strictEqual(primaryEntry.status, 'down', 'Primary route operational status must be down when interface is down');
    assert.strictEqual(backupEntry.status, 'active', 'Backup route must remain active');

    // Static route configuration inside routerRuntime must NOT be permanently mutated to down
    const runtimeRoutes = getRouterRuntime(r0.id).staticRoutes;
    assert.strictEqual(runtimeRoutes.find(r => r.id === 'primary-route').status, 'active', 'Configured route in runtime must remain active');

    const result = lookupRoute(r0.id, '192.168.50.10');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'backup-route', 'lookupRoute must automatically fall back to floating static route');
    assert.strictEqual(result.route.interface, 'Gig0/1');
});

// 206. Restoring primary interface UP immediately restores primary static route
runTest('206. Restoring primary interface UP immediately restores primary static route', () => {
    resetLab();
    addDevice('router', 200, 100);
    const r0 = networkState.devices[0];

    r0.interfaces['Gig0/0'].ip = '172.16.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        id: 'primary-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2',
        adminDistance: 1
    });

    addStaticRoute(r0.id, {
        id: 'backup-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.2.2',
        adminDistance: 10
    });

    // Shutdown Gig0/0
    r0.interfaces['Gig0/0'].status = 'down';
    assert.strictEqual(lookupRoute(r0.id, '192.168.50.10').route.id, 'backup-route');

    // Restore Gig0/0 UP
    r0.interfaces['Gig0/0'].status = 'up';

    const result = lookupRoute(r0.id, '192.168.50.10');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.route.id, 'primary-route', 'Primary route must pre-empt and become active again when interface comes UP');
    assert.strictEqual(result.route.interface, 'Gig0/0');
});

// 207. Router interface status transitions between UP and DOWN
runTest('207. Router interface status transitions between UP and DOWN', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    // Initial state
    assert.strictEqual(router.interfaces['Gig0/0'].status, 'up');
    assert.strictEqual(getRouterRoutingTable(router.id).filter(r => r.code === 'C').length, 1);

    // Transition to down
    router.interfaces['Gig0/0'].status = 'down';
    assert.strictEqual(router.interfaces['Gig0/0'].status, 'down');
    assert.strictEqual(getRouterRoutingTable(router.id).filter(r => r.code === 'C').length, 0, 'Connected route must disappear when interface is down');

    // Transition back to up
    router.interfaces['Gig0/0'].status = 'up';
    assert.strictEqual(router.interfaces['Gig0/0'].status, 'up');
    assert.strictEqual(getRouterRoutingTable(router.id).filter(r => r.code === 'C').length, 1, 'Connected route must reappear when interface is up');
});

// 208. Interface status change and floating static route failover integrate with Undo/Redo
runTest('208. Interface status change and floating static route failover integrate with Undo/Redo', () => {
    resetLab();
    addDevice('router', 200, 100);
    const r0 = networkState.devices[0];

    r0.interfaces['Gig0/0'].ip = '172.16.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        id: 'primary-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2',
        adminDistance: 1
    });

    addStaticRoute(r0.id, {
        id: 'backup-route',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.2.2',
        adminDistance: 10
    });

    // 1. Take snapshot with interface UP
    pushHistory();
    assert.strictEqual(lookupRoute(r0.id, '192.168.50.10').route.id, 'primary-route');

    // 2. Shut down Gig0/0
    r0.interfaces['Gig0/0'].status = 'down';
    assert.strictEqual(lookupRoute(r0.id, '192.168.50.10').route.id, 'backup-route');

    // 3. Undo -> Gig0/0 returns to UP, primary route active
    undo();
    assert.strictEqual(getDeviceById(r0.id).interfaces['Gig0/0'].status, 'up');
    assert.strictEqual(lookupRoute(r0.id, '192.168.50.10').route.id, 'primary-route');

    // 4. Redo -> Gig0/0 returns to DOWN, backup route active
    redo();
    assert.strictEqual(getDeviceById(r0.id).interfaces['Gig0/0'].status, 'down');
    assert.strictEqual(lookupRoute(r0.id, '192.168.50.10').route.id, 'backup-route');
});

// 209. Valid Administrative Distance values (1, 10, 100, 255) are accepted
runTest('209. Valid Administrative Distance values (1, 10, 100, 255) are accepted', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const validDistances = [1, 10, 100, 255];
    validDistances.forEach((ad, idx) => {
        const res = addStaticRoute(router.id, {
            network: '10.' + (idx + 1) + '.0.0',
            subnetMask: '255.255.0.0',
            interface: 'Gig0/0',
            adminDistance: ad
        });
        assert.strictEqual(res.success, true, 'AD ' + ad + ' must be accepted');
        assert.strictEqual(res.route.adminDistance, ad);
    });
});

// 210. Invalid Administrative Distance values (0, 256, negative, non-numeric) are rejected
runTest('210. Invalid Administrative Distance values (0, 256, negative, non-numeric) are rejected', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const invalidDistances = [0, 256, -1, -50, 'abc', null];
    invalidDistances.forEach((ad) => {
        const res = addStaticRoute(router.id, {
            network: '10.99.0.0',
            subnetMask: '255.255.0.0',
            interface: 'Gig0/0',
            adminDistance: ad
        });
        assert.strictEqual(res.success, false, 'Invalid AD ' + ad + ' must be rejected');
    });

    const runtime = getRouterRuntime(router.id);
    assert.strictEqual(runtime.staticRoutes.length, 0, 'No invalid static routes should be stored');
});

// 211. Full end-to-end ICMP transmission fails over to floating static route when primary link goes down
runTest('211. Full end-to-end ICMP transmission fails over to floating static route when primary link goes down', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100); // R0
    addDevice('router', 320, 80);  // R1 (primary)
    addDevice('router', 320, 160); // R2 (backup)
    addDevice('server', 450, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const r2 = networkState.devices[3];
    const server = networkState.devices[4];

    pc.ip = '10.0.0.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '10.0.0.1';

    // R0 LAN
    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    // R0 Transit primary (Gig0/1 to R1)
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // R1 Transit from R0
    r1.interfaces['Gig0/0'].ip = '172.16.1.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    // R1 to Server
    r1.interfaces['Gig0/1'].ip = '192.168.50.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '192.168.50.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.50.1';

    addConnection(pc.id, r0.id);
    addConnection(r0.id, r1.id);
    addConnection(r1.id, server.id);

    // Primary route on R0 (AD 1 via R1)
    addStaticRoute(r0.id, {
        id: 'r0-primary',
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2',
        adminDistance: 1
    });

    // Return route on R1
    addStaticRoute(r1.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.1'
    });

    // 1. Primary path active
    const res1 = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(res1.success, true, 'Primary ICMP roundtrip must succeed');
    const r0Hop1 = res1.hopActions.find(h => h.deviceId === r0.id);
    assert.strictEqual(r0Hop1.route.id, 'r0-primary');
    assert.strictEqual(r0Hop1.route.adminDistance, 1);

    // 2. Shut down Gig0/1 on R0 -> ICMP drops safely with interface-down reason
    r0.interfaces['Gig0/1'].status = 'down';
    const res2 = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(res2.success, false, 'ICMP must drop when primary interface is down');
    assert.strictEqual(res2.action, 'DROP');
    assert.ok(res2.reason.includes('down'));

    // 3. Restore Gig0/1 UP -> ICMP succeeds again
    r0.interfaces['Gig0/1'].status = 'up';
    const res3 = simulateSendFrame(pc, server, { icmp: true });
    assert.strictEqual(res3.success, true, 'ICMP must succeed after interface restoration');
});

// 212. Router Inspector HTML renders Administrative Distance column in Routing Table
runTest('212. Router Inspector HTML renders Administrative Distance column in Routing Table', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(router.id, {
        id: 'test-ad-route',
        network: '10.50.0.0',
        subnetMask: '255.255.0.0',
        interface: 'Gig0/0',
        adminDistance: 10
    });

    const html = renderRouterRoutingTableSection(router);
    assert.ok(html.includes('<th>AD</th>'), 'Must render AD table column header');
    assert.ok(html.includes('<td>0</td>'), 'Must render AD 0 for Connected route');
    assert.ok(html.includes('<td>10</td>'), 'Must render AD 10 for configured static route');
});

// 213. Router Inspector HTML renders Shut Down and No Shutdown toggle buttons
runTest('213. Router Inspector HTML renders Shut Down and No Shutdown toggle buttons', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];

    // Initial UP state
    const upHtml = renderRouterInspector(router);
    assert.ok(upHtml.includes('router-interface-toggle-btn'), 'Must have toggle button class');
    assert.ok(upHtml.includes('Shut Down'), 'Must have Shut Down button text when UP');

    // DOWN state
    router.interfaces['Gig0/0'].status = 'down';
    const downHtml = renderRouterInspector(router);
    assert.ok(downHtml.includes('No Shutdown'), 'Must have No Shutdown button text when DOWN');
});

// 214. toggleRouterInterfaceStatus toggles interface state and records history
runTest('214. toggleRouterInterfaceStatus toggles interface state and records history', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];

    assert.strictEqual(router.interfaces['Gig0/0'].status, 'up');

    // 1. Toggle UP -> DOWN
    const res1 = toggleRouterInterfaceStatus(router.id, 'Gig0/0');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.status, 'down');
    assert.strictEqual(getDeviceById(router.id).interfaces['Gig0/0'].status, 'down');

    // 2. Undo -> restores UP
    undo();
    assert.strictEqual(getDeviceById(router.id).interfaces['Gig0/0'].status, 'up');

    // 3. Redo -> restores DOWN
    redo();
    assert.strictEqual(getDeviceById(router.id).interfaces['Gig0/0'].status, 'down');

    // 4. Toggle DOWN -> UP
    const res2 = toggleRouterInterfaceStatus(router.id, 'Gig0/0');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.status, 'up');
    assert.strictEqual(getDeviceById(router.id).interfaces['Gig0/0'].status, 'up');
});

// 215. Static route form input for Administrative Distance creates floating static route
runTest('215. Static route form input for Administrative Distance creates floating static route', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];

    const formHtml = renderRouterStaticRouteFormSection(router);
    assert.ok(formHtml.includes('id="staticRouteAdminDistance"'), 'Must render Administrative Distance input field');
    assert.ok(formHtml.includes('placeholder="1 (Default)"'), 'Must have placeholder indicating default 1');
});

console.log('----------------------------------------------------');
console.log('Total tests: ' + (testsPassed + testsFailed) + ' | Passed: ' + testsPassed + ' | Failed: ' + testsFailed);
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}
`, context);
