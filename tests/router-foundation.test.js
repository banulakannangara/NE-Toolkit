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

console.log('----------------------------------------------------');
console.log('Total tests: ' + (testsPassed + testsFailed) + ' | Passed: ' + testsPassed + ' | Failed: ' + testsFailed);
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}
`, context);
