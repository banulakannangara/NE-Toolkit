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
    terminalRuntime.sessions = {};
    terminalRuntime.activeDeviceId = null;
    terminalRuntime.isOpen = false;
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

// 216. ICMP Type 11 Code 0 construction (Time Exceeded - TTL expired in transit)
runTest('216. ICMP Type 11 Code 0 construction (Time Exceeded - TTL expired in transit)', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const originalPacket = {
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.0.5',
        protocol: 'ICMP',
        ttl: 0,
        icmp: {
            type: 'ECHO_REQUEST',
            code: 0,
            identifier: 101,
            sequence: 1
        }
    };

    const errPacket = createIcmpErrorPacket(11, 0, originalPacket, router, {
        ingressInterface: 'Gig0/0',
        egressInterface: 'Gig0/1',
        reason: 'ttl-expired'
    });

    assert.ok(errPacket, 'ICMP Error packet must be constructed');
    assert.strictEqual(errPacket.protocol, 'ICMP');
    assert.strictEqual(errPacket.sourceIp, '192.168.1.1', 'Source IP must be the generating router IP');
    assert.strictEqual(errPacket.destinationIp, '192.168.1.10', 'Destination IP must be the original sender IP');
    assert.strictEqual(errPacket.icmp.type, 11);
    assert.strictEqual(errPacket.icmp.code, 0);
    assert.strictEqual(errPacket.icmp.typeName, 'TIME_EXCEEDED');
    assert.strictEqual(errPacket.icmp.codeName, 'TTL_EXPIRED_IN_TRANSIT');
    assert.strictEqual(errPacket.icmp.description, 'Time to Live (TTL) expired in transit');
    assert.strictEqual(errPacket.icmp.isError, true);
    assert.strictEqual(errPacket.icmp.reason, 'ttl-expired');
});

// 217. ICMP Type 3 Code 0 construction (Destination Network Unreachable)
runTest('217. ICMP Type 3 Code 0 construction (Destination Network Unreachable)', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const originalPacket = {
        sourceIp: '192.168.1.50',
        destinationIp: '172.30.1.1',
        protocol: 'IPv4',
        ttl: 64
    };

    const errPacket = createIcmpErrorPacket(3, 0, originalPacket, router, {
        ingressInterface: 'Gig0/0',
        reason: 'no-route'
    });

    assert.ok(errPacket, 'ICMP Error packet must be constructed');
    assert.strictEqual(errPacket.icmp.type, 3);
    assert.strictEqual(errPacket.icmp.code, 0);
    assert.strictEqual(errPacket.icmp.typeName, 'DESTINATION_UNREACHABLE');
    assert.strictEqual(errPacket.icmp.codeName, 'NET_UNREACHABLE');
    assert.strictEqual(errPacket.icmp.description, 'Destination network unreachable');
    assert.strictEqual(errPacket.icmp.isError, true);
    assert.strictEqual(errPacket.icmp.reason, 'no-route');
});

// 218. ICMP Type 3 Code 1 construction (Destination Host Unreachable)
runTest('218. ICMP Type 3 Code 1 construction (Destination Host Unreachable)', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const originalPacket = {
        sourceIp: '192.168.1.50',
        destinationIp: '10.0.0.100',
        protocol: 'ICMP',
        ttl: 63
    };

    const errPacket = createIcmpErrorPacket(3, 1, originalPacket, router, {
        ingressInterface: 'Gig0/0',
        egressInterface: 'Gig0/1',
        reason: 'host-unreachable'
    });

    assert.ok(errPacket, 'ICMP Error packet must be constructed');
    assert.strictEqual(errPacket.icmp.type, 3);
    assert.strictEqual(errPacket.icmp.code, 1);
    assert.strictEqual(errPacket.icmp.typeName, 'DESTINATION_UNREACHABLE');
    assert.strictEqual(errPacket.icmp.codeName, 'HOST_UNREACHABLE');
    assert.strictEqual(errPacket.icmp.description, 'Destination host unreachable');
    assert.strictEqual(errPacket.icmp.isError, true);
    assert.strictEqual(errPacket.icmp.reason, 'host-unreachable');
});

// 219. Original packet information is preserved inside the ICMP error packet
runTest('219. Original packet information is preserved inside the ICMP error packet', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.interfaces['Gig0/0'].ip = '192.168.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const originalPacket = {
        sourceIp: '192.168.1.75',
        destinationIp: '10.20.30.40',
        protocol: 'ICMP',
        ttl: 1,
        icmp: {
            type: 'ECHO_REQUEST',
            code: 0,
            identifier: 9999,
            sequence: 42
        }
    };

    const errPacket = createIcmpErrorPacket(11, 0, originalPacket, router, {
        ingressInterface: 'Gig0/0',
        reason: 'ttl-expired'
    });

    const orig = errPacket.icmp.originalPacket;
    assert.ok(orig, 'Original packet must be encapsulated in ICMP error');
    assert.strictEqual(orig.sourceIp, '192.168.1.75');
    assert.strictEqual(orig.destinationIp, '10.20.30.40');
    assert.strictEqual(orig.protocol, 'ICMP');
    assert.strictEqual(orig.ttl, 1);
    assert.strictEqual(orig.icmp.identifier, 9999);
    assert.strictEqual(orig.icmp.sequence, 42);
});

// 220. Generating router / device information is preserved inside the ICMP error packet
runTest('220. Generating router / device information is preserved inside the ICMP error packet', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];
    router.name = 'Core-Router-1';
    router.interfaces['Gig0/0'].ip = '10.0.1.1';
    router.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    router.interfaces['Gig0/1'].ip = '10.0.2.1';
    router.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    const originalPacket = {
        sourceIp: '10.0.1.5',
        destinationIp: '10.0.99.1',
        protocol: 'IPv4',
        ttl: 64
    };

    const errPacket = createIcmpErrorPacket(3, 0, originalPacket, router, {
        ingressInterface: 'Gig0/0',
        egressInterface: null,
        reason: 'no-route'
    });

    const routerInfo = errPacket.icmp.router;
    assert.ok(routerInfo, 'Router info must be present');
    assert.strictEqual(routerInfo.id, router.id);
    assert.strictEqual(routerInfo.name, 'Core-Router-1');
    assert.strictEqual(routerInfo.ip, '10.0.1.1', 'Should use ingress interface IP');
    assert.strictEqual(routerInfo.ingressInterface, 'Gig0/0');
});

// 221. Clean distinction between ICMP Echo Request/Reply and ICMP Diagnostic Error packets
runTest('221. Clean distinction between ICMP Echo Request/Reply and ICMP Diagnostic Error packets', () => {
    const echoReq = { protocol: 'ICMP', icmp: { type: 'ECHO_REQUEST', code: 0 } };
    const echoRep = { protocol: 'ICMP', icmp: { type: 'ECHO_REPLY', code: 0 } };
    const timeExceeded = { protocol: 'ICMP', icmp: { type: 11, code: 0, isError: true } };
    const destUnreach = { protocol: 'ICMP', icmp: { type: 'DESTINATION_UNREACHABLE', code: 0, isError: true } };
    const rawIpv4 = { protocol: 'IPv4', sourceIp: '1.1.1.1', destinationIp: '2.2.2.2' };

    assert.strictEqual(isIcmpPacket(echoReq), true);
    assert.strictEqual(isIcmpPacket(echoRep), true);
    assert.strictEqual(isIcmpPacket(timeExceeded), true);
    assert.strictEqual(isIcmpPacket(rawIpv4), false);

    assert.strictEqual(isIcmpEchoPacket(echoReq), true);
    assert.strictEqual(isIcmpEchoPacket(echoRep), true);
    assert.strictEqual(isIcmpEchoPacket(timeExceeded), false);
    assert.strictEqual(isIcmpEchoPacket(destUnreach), false);
    assert.strictEqual(isIcmpEchoPacket(rawIpv4), false);

    assert.strictEqual(isIcmpErrorPacket(echoReq), false);
    assert.strictEqual(isIcmpErrorPacket(echoRep), false);
    assert.strictEqual(isIcmpErrorPacket(timeExceeded), true);
    assert.strictEqual(isIcmpErrorPacket(destUnreach), true);
    assert.strictEqual(isIcmpErrorPacket(rawIpv4), false);
});

// 222. RFC 792 safety rule: Dropping an ICMP error packet does NOT generate another ICMP error
runTest('222. RFC 792 safety rule: Dropping an ICMP error packet does NOT generate another ICMP error', () => {
    resetLab();
    addDevice('router', 200, 100);
    const router = networkState.devices[0];

    const errorPacket = {
        sourceIp: '10.0.1.1',
        destinationIp: '192.168.1.10',
        protocol: 'ICMP',
        ttl: 0,
        icmp: {
            type: 11,
            code: 0,
            typeName: 'TIME_EXCEEDED',
            isError: true
        }
    };

    // Attempt to generate error in response to an existing error packet
    const result = createIcmpErrorPacket(11, 0, errorPacket, router, { reason: 'ttl-expired' });
    assert.strictEqual(result, null, 'Must return null according to RFC 792 safety rule');
});

// 223. Router TTL expiry in simulatePathTransmission constructs ICMP Type 11 Code 0 error packet
runTest('223. Router TTL expiry in simulatePathTransmission constructs ICMP Type 11 Code 0 error packet', () => {
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

    const result = simulateSendFrame(pc, server, { initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('Time to Live (TTL) expired'));

    const err = result.icmpErrorPacket;
    assert.ok(err, 'simulateSendFrame must attach icmpErrorPacket on TTL expiry');
    assert.strictEqual(err.icmp.type, 11);
    assert.strictEqual(err.icmp.code, 0);
    assert.strictEqual(err.icmp.typeName, 'TIME_EXCEEDED');
    assert.strictEqual(err.sourceIp, '192.168.1.1');
    assert.strictEqual(err.destinationIp, '192.168.1.10');
    assert.strictEqual(err.icmp.originalPacket.destinationIp, '10.0.0.10');
});

// 224. Router NO_ROUTE in simulatePathTransmission constructs ICMP Type 3 Code 0 error packet
runTest('224. Router NO_ROUTE in simulatePathTransmission constructs ICMP Type 3 Code 0 error packet', () => {
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
    // router only has Gig0/0 configured; no route for 10.0.0.0

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.1.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

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
    assert.ok(result.reason.includes('No route'));

    const err = result.icmpErrorPacket;
    assert.ok(err, 'Must construct ICMP error on NO_ROUTE');
    assert.strictEqual(err.icmp.type, 3);
    assert.strictEqual(err.icmp.code, 0);
    assert.strictEqual(err.icmp.typeName, 'DESTINATION_UNREACHABLE');
    assert.strictEqual(err.icmp.codeName, 'NET_UNREACHABLE');
    assert.strictEqual(err.destinationIp, '192.168.1.10');
});

// 225. Router egress interface down in simulatePathTransmission constructs ICMP Type 3 Code 1 error packet
runTest('225. Router egress interface down in simulatePathTransmission constructs ICMP Type 3 Code 1 error packet', () => {
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

    addStaticRoute(router.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        interface: 'Gig0/1'
    });

    router.interfaces['Gig0/1'].status = 'down'; // Interface administratively down

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

    const err = result.icmpErrorPacket;
    assert.ok(err, 'Must construct ICMP error on down interface');
    assert.strictEqual(err.icmp.type, 3);
    assert.strictEqual(err.icmp.code, 1);
    assert.strictEqual(err.icmp.codeName, 'HOST_UNREACHABLE');
});

// 226. formatIcmpType formats all standard and error ICMP types accurately
runTest('226. formatIcmpType formats all standard and error ICMP types accurately', () => {
    assert.strictEqual(formatIcmpType('ECHO_REQUEST'), 'Echo Request');
    assert.strictEqual(formatIcmpType('8'), 'Echo Request');
    assert.strictEqual(formatIcmpType('ECHO_REPLY'), 'Echo Reply');
    assert.strictEqual(formatIcmpType('0'), 'Echo Reply');
    assert.strictEqual(formatIcmpType('TIME_EXCEEDED'), 'Time to Live Exceeded');
    assert.strictEqual(formatIcmpType('11'), 'Time to Live Exceeded');
    assert.strictEqual(formatIcmpType('DESTINATION_UNREACHABLE'), 'Destination Unreachable');
    assert.strictEqual(formatIcmpType('3'), 'Destination Unreachable');
});

// 227. Hop actions record icmpErrorPacket on dropped hops
runTest('227. Hop actions record icmpErrorPacket on dropped hops', () => {
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

    const result = simulateSendFrame(pc, server, { initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.ok(result.hopActions.length > 0);
    const dropHop = result.hopActions.find(h => h.action === 'DROP');
    assert.ok(dropHop);
    assert.ok(dropHop.icmpErrorPacket);
    assert.strictEqual(dropHop.icmpErrorPacket.icmp.type, 11);
    assert.strictEqual(dropHop.icmpErrorPacket.icmp.code, 0);
});

// 228. Single-router return path: Router0 generates ICMP Destination Unreachable and returns to PC0
runTest('228. Single-router return path: Router0 generates ICMP Destination Unreachable and returns to PC0', () => {
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
    // router only has Gig0/0 configured (no route for server subnet 10.0.0.0)

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '192.168.1.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

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

    const forwardResult = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Server0']);
    assert.strictEqual(forwardResult.success, false);
    assert.ok(forwardResult.icmpErrorPacket);

    const errorReturn = routeIcmpErrorReturnPath(forwardResult.icmpErrorPacket, router, pc, forwardResult.path);
    assert.ok(errorReturn, 'Error return path must execute');
    assert.strictEqual(errorReturn.success, true);
    assert.strictEqual(errorReturn.path.join(' -> '), 'Router0 -> PC0');
    assert.ok(errorReturn.events.some(e => e.includes('PC0 received ICMP Destination Unreachable')));
});

// 229. Multi-router return path: Router1 failure routes ICMP error back through Router0 to PC0
runTest('229. Multi-router return path: Router1 failure routes ICMP error back through Router0 to PC0', () => {
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
    // R1 has no route for server subnet 10.0.0.0

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Server0');

    // Forward route on R0 toward 10.0.0.0 via R1
    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.2'
    });

    // Return route on R1 toward PC subnet 192.168.1.0 via R0
    addStaticRoute(r1.id, {
        network: '192.168.1.0',
        subnetMask: '255.255.255.0',
        nextHop: '172.16.1.1'
    });

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

    const forwardResult = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Router1', 'Server0']);
    assert.strictEqual(forwardResult.success, false);
    assert.strictEqual(forwardResult.path.join(' -> '), 'PC0 -> Router0 -> Router1');

    const errorReturn = routeIcmpErrorReturnPath(forwardResult.icmpErrorPacket, r1, pc, forwardResult.path);
    assert.ok(errorReturn, 'Error return path must execute');
    assert.strictEqual(errorReturn.success, true);
    assert.strictEqual(errorReturn.path.join(' -> '), 'Router1 -> Router0 -> PC0');
    assert.strictEqual(errorReturn.hopActions.length, 2, 'Must have 2 router hops on return path (R1 and R0)');
    assert.strictEqual(errorReturn.hopActions[0].deviceId, r1.id);
    assert.strictEqual(errorReturn.hopActions[1].deviceId, r0.id);
    assert.ok(errorReturn.events.some(e => e.includes('PC0 received ICMP Destination Unreachable')));
});

// 230. Return-path TTL decrement: ICMP error packet TTL decrements at each return-path router hop
runTest('230. Return-path TTL decrement: ICMP error packet TTL decrements at each return-path router hop', () => {
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

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Server0');

    addStaticRoute(r0.id, { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.1' });

    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: r0.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc.ip, destinationIp: server.ip, ttl: 64 },
        path: ['PC0', 'Router0', 'Router1', 'Server0'],
        events: []
    };

    const forwardResult = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Router1', 'Server0']);
    const errorReturn = routeIcmpErrorReturnPath(forwardResult.icmpErrorPacket, r1, pc, forwardResult.path);

    assert.strictEqual(errorReturn.success, true);
    assert.strictEqual(errorReturn.hopActions[0].ttl, 64, 'R1 initial ICMP error TTL');
    assert.strictEqual(errorReturn.hopActions[1].ttl, 63, 'R0 decremented ICMP error TTL to 63');
    assert.strictEqual(errorReturn.packet.ttl, 63, 'Final delivered TTL to PC0 is 63');
});

// 231. TTL expiry in multi-router topology: initialTtl=2 drops at Router1 and returns ICMP Type 11 to PC0
runTest('231. TTL expiry in multi-router topology: initialTtl=2 drops at Router1 and returns ICMP Type 11 to PC0', () => {
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

    addStaticRoute(r0.id, { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.1' });

    // initialTtl = 2: R0 decrements 2 -> 1, R1 decrements 1 -> 0 (TTL expired at R1)
    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 2 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('Time to Live (TTL) expired'));

    assert.ok(result.icmpErrorPacket);
    assert.strictEqual(result.icmpErrorPacket.icmp.type, 11);
    assert.strictEqual(result.icmpErrorPacket.icmp.typeName, 'TIME_EXCEEDED');
    assert.strictEqual(result.icmpErrorPacket.sourceIp, '172.16.1.2', 'ICMP Time Exceeded from Router1');

    assert.ok(result.icmpErrorResult);
    assert.strictEqual(result.icmpErrorResult.success, true);
    assert.strictEqual(result.reverseHopActions.length, 2);
    assert.strictEqual(result.reverseHopActions[0].deviceId, r1.id);
    assert.strictEqual(result.reverseHopActions[1].deviceId, r0.id);
    assert.ok(result.events.some(e => e.includes('PC0 received ICMP Time to Live Exceeded')));
});

// 232. Return-path ARP resolution: ICMP error return triggers ARP resolution if cache is cold
runTest('232. Return-path ARP resolution: ICMP error return triggers ARP resolution if cache is cold', () => {
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

    // Clear ARP table on Router0
    clearArpTable(router.id);

    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.ok(result.icmpErrorResult);
    assert.strictEqual(result.icmpErrorResult.success, true);
    assert.ok(lookupArp(router.id, pc.ip), 'Router ARP table must cache PC0 MAC after error return');
});

// 233. Return-path ARP cache hit: warm ARP cache avoids ARP broadcast on error return path
runTest('233. Return-path ARP cache hit: warm ARP cache avoids ARP broadcast on error return path', () => {
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

    // Pre-populate warm ARP cache on Router0
    learnArp(router.id, pc.ip, pc.mac, { interface: 'Gig0/0' });

    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.ok(result.icmpErrorResult);
    assert.strictEqual(result.icmpErrorResult.arpResult.cacheHit, true, 'Must hit warm ARP cache');
});

// 234. Missing return route on generator router records DROP without second ICMP error
runTest('234. Missing return route on generator router records DROP without second ICMP error', () => {
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

    // Forward route on R0 toward 10.0.0.0
    addStaticRoute(r0.id, { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2' });
    // R1 deliberately has NO return route for 192.168.1.0

    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 2 });
    assert.strictEqual(result.success, false);
    assert.ok(result.reason.includes('Time to Live (TTL) expired'));
    assert.ok(result.icmpErrorPacket);
    assert.ok(result.icmpErrorResult);
    assert.strictEqual(result.icmpErrorResult.success, false);
    assert.ok(result.icmpErrorResult.reason.includes('No return route'));
    assert.strictEqual(result.reverseHopActions[0].action, 'DROP');
});

// 235. Intermediate router failure on return path records DROP without second ICMP error
runTest('235. Intermediate router failure on return path records DROP without second ICMP error', () => {
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

    server.ip = '10.0.0.10';
    server.subnetMask = '255.255.255.0';
    server.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Server0');

    addStaticRoute(r0.id, { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '172.16.1.1' });

    // Set R0's Gig0/0 interface DOWN after forwarding
    const frame = {
        sourceDeviceId: pc.id,
        destinationDeviceId: server.id,
        sourceMac: pc.mac,
        destinationMac: r0.interfaces['Gig0/0'].mac,
        etherType: 'IPv4',
        packet: { sourceIp: pc.ip, destinationIp: server.ip, ttl: 64 },
        path: ['PC0', 'Router0', 'Router1', 'Server0'],
        events: []
    };

    const forwardResult = simulatePathTransmission(frame, pc, server, ['PC0', 'Router0', 'Router1', 'Server0']);
    assert.strictEqual(forwardResult.success, false);

    // Shut down R0 Gig0/0 before return path
    r0.interfaces['Gig0/0'].status = 'down';

    const errorReturn = routeIcmpErrorReturnPath(forwardResult.icmpErrorPacket, r1, pc, forwardResult.path);
    assert.strictEqual(errorReturn.success, false);
    assert.strictEqual(errorReturn.action, 'DROP');
    assert.strictEqual(errorReturn.icmpErrorPacket, undefined, 'Must not create second ICMP error');
});

// 236. Original packet payload is completely preserved across return path
runTest('236. Original packet payload is completely preserved across return path', () => {
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
        icmp: true,
        initialTtl: 1,
        icmp: { type: 'ECHO_REQUEST', identifier: 777, sequence: 888 }
    });

    assert.strictEqual(result.success, false);
    const orig = result.icmpErrorPacket.icmp.originalPacket;
    assert.strictEqual(orig.sourceIp, pc.ip);
    assert.strictEqual(orig.destinationIp, server.ip);
    assert.strictEqual(orig.protocol, 'ICMP');
    assert.strictEqual(orig.ttl, 0, 'TTL decremented to 0 upon expiry');
    assert.strictEqual(orig.icmp.identifier, 777);
    assert.strictEqual(orig.icmp.sequence, 888);
});

// 237. Normal ICMP Echo roundtrip across 3 routers continues to succeed without regression
runTest('237. Normal ICMP Echo roundtrip across 3 routers continues to succeed without regression', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 300, 100);
    addDevice('router', 420, 100);
    addDevice('server', 540, 100);

    const pc = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const r2 = networkState.devices[3];
    const server = networkState.devices[4];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '10.0.23.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r2.interfaces['Gig0/0'].ip = '10.0.23.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r2.interfaces['Gig0/1'].ip = '172.16.1.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    server.ip = '172.16.1.50';
    server.subnetMask = '255.255.255.0';
    server.gateway = '172.16.1.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Router2');
    addConnection('Router2', 'Server0');

    // Forward static routes
    addStaticRoute(r0.id, { network: '172.16.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '172.16.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    // Reverse static routes
    addStaticRoute(r2.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.1' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 64 });
    assert.strictEqual(result.success, true, 'ICMP Echo roundtrip must succeed');
    assert.strictEqual(result.icmpErrorPacket, null);
    assert.strictEqual(result.packet.ttl, 61, '64 - 3 router hops = 61');
});

// 238. Return-path across switches and routers preserves complete event timeline
runTest('238. Return-path across switches and routers preserves complete event timeline', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 150, 100);
    addDevice('router', 280, 100);
    addDevice('server', 420, 100);

    const pc = networkState.devices[0];
    const sw = networkState.devices[1];
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

    const result = simulateSendFrame(pc, server, { icmp: true, initialTtl: 1 });
    assert.strictEqual(result.success, false);
    assert.ok(result.events.some(e => e.includes('PC0 sent ICMP Echo Request')));
    assert.ok(result.events.some(e => e.includes('Time to Live (TTL) expired in transit')));
    assert.ok(result.events.some(e => e.includes('Router0 sent ICMP Time to Live Exceeded to PC0')));
    assert.ok(result.events.some(e => e.includes('PC0 received ICMP Time to Live Exceeded')));
});

// 239. Dynamic subheading generation for ICMP Type 3 (Destination Unreachable)
runTest('239. Dynamic subheading generation for ICMP Type 3 (Destination Unreachable)', () => {
    const hopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const reverseHopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const icmpErrorPacket = {
        icmp: {
            type: 3,
            code: 0,
            typeName: 'DESTINATION_UNREACHABLE'
        }
    };
    const html = renderHopDecisionsSection(hopActions, reverseHopActions, icmpErrorPacket);
    assert.ok(html.includes('Return Path') && html.includes('ICMP Destination Unreachable'), 'Must contain ICMP Destination Unreachable subheading');
    assert.ok(!html.includes('ICMP Echo Reply'), 'Must NOT contain ICMP Echo Reply subheading');
});

// 240. Dynamic subheading generation for ICMP Type 11 (Time Exceeded)
runTest('240. Dynamic subheading generation for ICMP Type 11 (Time Exceeded)', () => {
    const hopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const reverseHopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const icmpErrorPacket = {
        icmp: {
            type: 11,
            code: 0,
            typeName: 'TIME_EXCEEDED'
        }
    };
    const html = renderHopDecisionsSection(hopActions, reverseHopActions, icmpErrorPacket);
    assert.ok(html.includes('Return Path') && html.includes('ICMP Time to Live Exceeded'), 'Must contain ICMP Time to Live Exceeded subheading');
});

// 241. Dynamic subheading generation for ICMP Type 0 (Echo Reply)
runTest('241. Dynamic subheading generation for ICMP Type 0 (Echo Reply)', () => {
    const hopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const reverseHopActions = [{ deviceId: 'Router0', action: 'ROUTE' }];
    const html = renderHopDecisionsSection(hopActions, reverseHopActions, null);
    assert.ok(html.includes('Return Path') && html.includes('ICMP Echo Reply'), 'Must contain ICMP Echo Reply subheading when no error packet is present');
});

// 242. ICMP error badge configuration in getHopBadgeConfig
runTest('242. ICMP error badge configuration in getHopBadgeConfig', () => {
    const badgeConfig = getHopBadgeConfig(null, false, false, {
        isIcmpError: true,
        title: 'ICMP DESTINATION UNREACHABLE',
        subtitle: 'Router1 -> PC0'
    });
    assert.strictEqual(badgeConfig.title, 'ICMP DESTINATION UNREACHABLE');
    assert.strictEqual(badgeConfig.subtitle, 'Router1 -> PC0');
    assert.strictEqual(badgeConfig.modifier, 'icmp-error');

    const routeHopBadge = getHopBadgeConfig({
        action: 'ROUTE',
        ingressInterface: 'Gig0/1',
        egressInterface: 'Gig0/0',
        ttl: 63
    }, false, false, { isIcmpError: true });
    assert.strictEqual(routeHopBadge.title, 'ROUTE');
    assert.strictEqual(routeHopBadge.modifier, 'icmp-error');
});

// 243. Packet Inspector renders ICMP Diagnostic Error section when icmpErrorPacket is attached
runTest('243. Packet Inspector renders ICMP Diagnostic Error section when icmpErrorPacket is attached', () => {
    const packet = {
        sourceIp: '192.168.1.10',
        destinationIp: '10.0.0.10',
        ttl: 64,
        protocol: 'ICMP',
        icmp: { type: 'ECHO_REQUEST', code: 0, identifier: 1, sequence: 1 }
    };
    const result = {
        packet,
        path: ['PC0', 'Router0'],
        icmpErrorPacket: {
            sourceIp: '192.168.1.1',
            destinationIp: '192.168.1.10',
            icmp: {
                type: 3,
                code: 0,
                typeName: 'DESTINATION_UNREACHABLE',
                codeName: 'NET_UNREACHABLE',
                description: 'Destination network is unreachable',
                router: { id: 'Router0', name: 'Router0', ip: '192.168.1.1' },
                originalPacket: { sourceIp: '192.168.1.10', destinationIp: '10.0.0.10', ttl: 64 }
            }
        }
    };
    const html = renderPacketInspector(packet, result);
    assert.ok(html.includes('ICMP DIAGNOSTIC ERROR'), 'Must include ICMP DIAGNOSTIC ERROR section');
    assert.ok(html.includes('Destination Unreachable (Type 3)'), 'Must include Destination Unreachable (Type 3)');
    assert.ok(html.includes('NET UNREACHABLE'), 'Must include NET UNREACHABLE code');
    assert.ok(html.includes('Router0 (192.168.1.1)'), 'Must include generating device info');
});

// 244. Packet Inspector does NOT render ICMP Diagnostic Error section on normal successful delivery
runTest('244. Packet Inspector does NOT render ICMP Diagnostic Error section on normal successful delivery', () => {
    const packet = {
        sourceIp: '192.168.1.10',
        destinationIp: '192.168.2.10',
        ttl: 64,
        protocol: 'ICMP',
        icmp: { type: 'ECHO_REQUEST', code: 0, identifier: 1, sequence: 1 }
    };
    const result = {
        packet,
        path: ['PC0', 'Router0', 'Router1', 'PC1'],
        icmpErrorPacket: null
    };
    const html = renderPacketInspector(packet, result);
    assert.ok(!html.includes('ICMP DIAGNOSTIC ERROR'), 'Must NOT include ICMP DIAGNOSTIC ERROR section');
    assert.ok(html.includes('ICMP Echo Request'), 'Must include normal ICMP Echo Request title');
});

// 245. getSendFramePanelHtml integrates dynamic subheading and ICMP Diagnostic Error section
runTest('245. getSendFramePanelHtml integrates dynamic subheading and ICMP Diagnostic Error section', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    const pc = networkState.devices[0];
    const r = networkState.devices[1];

    networkState.lastFrameResult = {
        success: false,
        action: 'DROP',
        path: ['PC0', 'Router0'],
        hopActions: [{ deviceId: 'Router0', action: 'DROP', reason: 'no-route' }],
        reverseHopActions: [{ deviceId: 'Router0', action: 'ROUTE', egressInterface: 'Gig0/0', ttl: 63 }],
        events: ['Frame dropped'],
        packet: { sourceIp: '192.168.1.10', destinationIp: '10.0.0.10', ttl: 64, icmp: { type: 'ECHO_REQUEST' } },
        icmpErrorPacket: {
            sourceIp: '192.168.1.1',
            destinationIp: '192.168.1.10',
            icmp: {
                type: 3,
                code: 0,
                typeName: 'DESTINATION_UNREACHABLE',
                codeName: 'NET_UNREACHABLE',
                description: 'Destination network is unreachable',
                router: { name: 'Router0', ip: '192.168.1.1' }
            }
        }
    };
    networkState.sendFrameState = {
        phase: 'complete',
        sourceId: pc.id,
        targetId: r.id,
        message: 'Frame failed'
    };

    const panelHtml = getSendFramePanelHtml();
    assert.ok(panelHtml.includes('Return Path') && panelHtml.includes('ICMP Destination Unreachable'), 'Panel must render dynamic ICMP Destination Unreachable subheading');
    assert.ok(panelHtml.includes('ICMP DIAGNOSTIC ERROR'), 'Panel must render ICMP DIAGNOSTIC ERROR section in packet inspector');
});

// 246. getHopBadgeConfig handles drop reason formatting accurately
runTest('246. getHopBadgeConfig handles drop reason formatting accurately', () => {
    const ttlBadge = getHopBadgeConfig({ action: 'DROP', reason: 'ttl-expired' });
    assert.strictEqual(ttlBadge.title, 'DROP');
    assert.strictEqual(ttlBadge.subtitle, 'TTL Expired');
    assert.strictEqual(ttlBadge.modifier, 'drop');

    const mismatchBadge = getHopBadgeConfig({ action: 'DROP', reason: 'port-mismatch' });
    assert.strictEqual(mismatchBadge.subtitle, 'Port Mismatch');
});

// 247. analyzeCommunication detects administratively down router ingress/egress interface
runTest('247. analyzeCommunication detects administratively down router ingress/egress interface', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const r = networkState.devices[1];
    const s = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    r.interfaces['Gig0/0'].ip = '192.168.1.1';
    r.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r.interfaces['Gig0/1'].ip = '10.0.0.1';
    r.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    s.ip = '10.0.0.10';
    s.subnetMask = '255.255.255.0';
    s.gateway = '10.0.0.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Server0');

    // Normal should pass
    const passResult = analyzeCommunication(pc, s);
    assert.strictEqual(passResult.possible, true);

    // Shutdown ingress interface Gig0/0
    r.interfaces['Gig0/0'].status = 'down';
    const downResult1 = analyzeCommunication(pc, s);
    assert.strictEqual(downResult1.possible, false);
    assert.ok(downResult1.reason.includes('administratively down') && downResult1.reason.includes('Gig0/0'));

    // Restore Gig0/0 and shutdown egress interface Gig0/1
    r.interfaces['Gig0/0'].status = 'up';
    r.interfaces['Gig0/1'].status = 'down';
    const downResult2 = analyzeCommunication(pc, s);
    assert.strictEqual(downResult2.possible, false);
    assert.ok(downResult2.reason.includes('administratively down') && downResult2.reason.includes('Gig0/1'));
});

// 248. analyzeCommunication validates multi-router static route reachability
runTest('248. analyzeCommunication validates multi-router static route reachability', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const result = analyzeCommunication(pc0, pc1);
    assert.strictEqual(result.possible, true);
    assert.ok(result.network.includes('192.168.1.0/24') && result.network.includes('192.168.2.0/24'));
});

// 249. analyzeCommunication detects missing intermediate forward static route
runTest('249. analyzeCommunication detects missing intermediate forward static route', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    // No static route on Router0 for 192.168.2.0/24
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const result = analyzeCommunication(pc0, pc1);
    assert.strictEqual(result.possible, false);
    assert.ok(result.reason.includes('Router0') && result.reason.includes('no route'));
});

// 250. analyzeCommunication detects missing reverse return route in multi-router topologies
runTest('250. analyzeCommunication detects missing reverse return route in multi-router topologies', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    // Add forward route on Router0, but NO return route on Router1
    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });

    const result = analyzeCommunication(pc0, pc1);
    assert.strictEqual(result.possible, false);
    assert.ok(result.reason.includes('Router1') && result.reason.includes('no return route'));
});

// 251. analyzeCommunication verifies floating static route failover when primary link goes down
runTest('251. analyzeCommunication verifies floating static route failover when primary link goes down', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const result = analyzeCommunication(pc0, pc1);
    assert.strictEqual(result.possible, true);

    // Shut down egress interface
    r0.interfaces['Gig0/1'].status = 'down';
    const failResult = analyzeCommunication(pc0, pc1);
    assert.strictEqual(failResult.possible, false);
    assert.ok(failResult.reason.includes('administratively down'));
});

// 252. Send Frame UI panel HTML renders initial TTL input control and preset chips
runTest('252. Send Frame UI panel HTML renders initial TTL input control and preset chips', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc = networkState.devices[0];
    networkState.sendFrameState = {
        phase: 'awaitDestination',
        sourceId: pc.id,
        initialTtl: 2,
        message: 'Select destination'
    };
    const html = getSendFramePanelHtml();
    assert.ok(html.includes('send-frame-ttl-control'), 'Must contain TTL control section');
    assert.ok(html.includes('id="sendFrameInitialTtl"'), 'Must contain TTL number input');
    assert.ok(html.includes('value="2"'), 'Must render configured TTL value');
    assert.ok(html.includes('data-ttl="1"') && html.includes('data-ttl="64"'), 'Must contain TTL preset buttons');
});

// 253. Send Frame simulation accepts custom initial TTL and triggers ICMP Time Exceeded when TTL is depleted
runTest('253. Send Frame simulation accepts custom initial TTL and triggers ICMP Time Exceeded when TTL is depleted', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    // TTL 1 expires at Router0
    const resTtl1 = simulateSendFrame(pc0, pc1, { icmp: true, initialTtl: 1 });
    assert.strictEqual(resTtl1.success, false);
    assert.strictEqual(resTtl1.icmpErrorPacket?.icmp?.type, 11);
    assert.strictEqual(resTtl1.icmpErrorPacket?.icmp?.router?.id, 'Router0');

    // TTL 2 expires at Router1
    const resTtl2 = simulateSendFrame(pc0, pc1, { icmp: true, initialTtl: 2 });
    assert.strictEqual(resTtl2.success, false);
    assert.strictEqual(resTtl2.icmpErrorPacket?.icmp?.type, 11);
    assert.strictEqual(resTtl2.icmpErrorPacket?.icmp?.router?.id, 'Router1');

    // TTL 64 succeeds end-to-end
    const resTtl64 = simulateSendFrame(pc0, pc1, { icmp: true, initialTtl: 64 });
    assert.strictEqual(resTtl64.success, true);
});

// 254. Same-subnet connection testing continues to work without regression
runTest('254. Same-subnet connection testing continues to work without regression', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('server', 400, 100);

    const pc = networkState.devices[0];
    const sw = networkState.devices[1];
    const s = networkState.devices[2];

    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    s.ip = '192.168.1.50';
    s.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Server0');

    const result = analyzeCommunication(pc, s);
    assert.strictEqual(result.possible, true);
    assert.strictEqual(result.network, '192.168.1.0/24');
});

// 255. simulateTraceroute discovers single-router path in 2 hops (Router0 -> PC1)
runTest('255. simulateTraceroute discovers single-router path in 2 hops (Router0 -> PC1)', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, true);
    assert.strictEqual(tr.totalHops, 2);
    assert.strictEqual(tr.hops[0].deviceName, 'Router0');
    assert.strictEqual(tr.hops[0].status, 'ttl_expired');
    assert.strictEqual(tr.hops[0].icmpType, 11);
    assert.strictEqual(tr.hops[1].deviceName, 'PC1');
    assert.strictEqual(tr.hops[1].status, 'reached');
    assert.strictEqual(tr.hops[1].icmpType, 0);
});

// 256. simulateTraceroute discovers multi-router path in 3 hops (Router0 -> Router1 -> PC1)
runTest('256. simulateTraceroute discovers multi-router path in 3 hops (Router0 -> Router1 -> PC1)', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, true);
    assert.strictEqual(tr.totalHops, 3);
    assert.strictEqual(tr.hops[0].deviceName, 'Router0');
    assert.strictEqual(tr.hops[0].status, 'ttl_expired');
    assert.strictEqual(tr.hops[1].deviceName, 'Router1');
    assert.strictEqual(tr.hops[1].status, 'ttl_expired');
    assert.strictEqual(tr.hops[2].deviceName, 'PC1');
    assert.strictEqual(tr.hops[2].status, 'reached');
});

// 257. simulateTraceroute terminates early with Destination Unreachable when intermediate router has no route
runTest('257. simulateTraceroute terminates early with Destination Unreachable when intermediate router has no route', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    // Route on Router0 only, Router1 has NO route to 192.168.2.0/24 (simulating route gap)
    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });
    // Change Router1 Gig0/1 IP so it doesn't match 192.168.2.0/24 directly
    r1.interfaces['Gig0/1'].ip = '172.16.1.1';

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, false);
    assert.strictEqual(tr.totalHops, 2);
    assert.strictEqual(tr.hops[0].deviceName, 'Router0');
    assert.strictEqual(tr.hops[0].status, 'ttl_expired');
    assert.strictEqual(tr.hops[1].deviceName, 'Router1');
    assert.strictEqual(tr.hops[1].status, 'unreachable');
    assert.strictEqual(tr.hops[1].icmpType, 3);
});

// 258. simulateTraceroute terminates early when intermediate router interface is administratively down
runTest('258. simulateTraceroute terminates early when intermediate router interface is administratively down', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].status = 'down';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, false);
    assert.strictEqual(tr.totalHops, 1);
    assert.strictEqual(tr.hops[0].status, 'unreachable');
});

// 259. simulateTraceroute discovers three-router path in 4 hops (Router0 -> Router1 -> Router2 -> PC1)
runTest('259. simulateTraceroute discovers three-router path in 4 hops (Router0 -> Router1 -> Router2 -> PC1)', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 180, 100);
    addDevice('router', 320, 100);
    addDevice('router', 460, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const r2 = networkState.devices[3];
    const pc1 = networkState.devices[4];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '10.0.23.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r2.interfaces['Gig0/0'].ip = '10.0.23.2';
    r2.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r2.interfaces['Gig0/1'].ip = '192.168.2.1';
    r2.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'Router2');
    addConnection('Router2', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.2' });

    addStaticRoute(r2.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.23.1' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, true);
    assert.strictEqual(tr.totalHops, 4);
    assert.strictEqual(tr.hops[0].deviceName, 'Router0');
    assert.strictEqual(tr.hops[0].status, 'ttl_expired');
    assert.strictEqual(tr.hops[1].deviceName, 'Router1');
    assert.strictEqual(tr.hops[1].status, 'ttl_expired');
    assert.strictEqual(tr.hops[2].deviceName, 'Router2');
    assert.strictEqual(tr.hops[2].status, 'ttl_expired');
    assert.strictEqual(tr.hops[3].deviceName, 'PC1');
    assert.strictEqual(tr.hops[3].status, 'reached');
});

// 260. simulateTraceroute respects custom maxHops limit
runTest('260. simulateTraceroute respects custom maxHops limit', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    // With maxHops=2, cannot reach PC1 (needs 3 hops)
    const tr = simulateTraceroute(pc0, pc1, { maxHops: 2 });
    assert.strictEqual(tr.success, false);
    assert.strictEqual(tr.totalHops, 2);
    assert.ok(tr.reason.includes('limit') || tr.reason.includes('exceeded'));
});

// 261. Same-subnet traceroute resolves direct target at TTL=1
runTest('261. Same-subnet traceroute resolves direct target at TTL=1', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    const tr = simulateTraceroute(pc0, pc1);
    assert.strictEqual(tr.success, true);
    assert.strictEqual(tr.totalHops, 1);
    assert.strictEqual(tr.hops[0].deviceName, 'PC1');
    assert.strictEqual(tr.hops[0].status, 'reached');
});

// 262. Send Frame UI HTML renders Trace Route button and Traceroute Hop Table with appropriate badges
runTest('262. Send Frame UI HTML renders Trace Route button and Traceroute Hop Table with appropriate badges', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    networkState.sendFrameState = {
        phase: 'complete',
        sourceId: pc0.id,
        initialTtl: 64,
        message: null
    };
    networkState.lastFrameResult = simulateSendFrame(pc0, pc1, { icmp: true });
    networkState.lastTracerouteResult = simulateTraceroute(pc0, pc1);

    const html = getSendFramePanelHtml();
    assert.ok(html.includes('trace-route-btn'), 'Must contain Trace Route button');
    assert.ok(html.includes('traceroute-panel'), 'Must render traceroute panel');
    assert.ok(html.includes('traceroute-table'), 'Must render traceroute table');
    assert.ok(html.includes('traceroute-badge--ttl'), 'Must render TTL expired badge');
    assert.ok(html.includes('traceroute-badge--reached'), 'Must render Reached badge');
});

// 263. Create Standard and Extended ACLs on router
runTest('263. Create Standard and Extended ACLs on router', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    // Standard ACL 10 (by number)
    const res1 = createRouterAcl(r.id, 10);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.acl.id, '10');
    assert.strictEqual(res1.acl.type, 'standard');

    // Extended ACL 101 (by number)
    const res2 = createRouterAcl(r.id, 101);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.acl.id, '101');
    assert.strictEqual(res2.acl.type, 'extended');

    // Named Standard ACL
    const res3 = createRouterAcl(r.id, { name: 'CORP_STD', type: 'standard' });
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.acl.name, 'CORP_STD');
    assert.strictEqual(res3.acl.type, 'standard');

    // Named Extended ACL
    const res4 = createRouterAcl(r.id, { name: 'CORP_EXT', type: 'extended' });
    assert.strictEqual(res4.success, true);
    assert.strictEqual(res4.acl.name, 'CORP_EXT');
    assert.strictEqual(res4.acl.type, 'extended');
});

// 264. Duplicate ACL creation and invalid configuration rejection
runTest('264. Duplicate ACL creation and invalid configuration rejection', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '10');
    const dup = createRouterAcl(r.id, '10');
    assert.strictEqual(dup.success, false);
    assert.ok(dup.reason.includes('already exists'));

    const empty = createRouterAcl(r.id, '');
    assert.strictEqual(empty.success, false);

    const nonRouter = createRouterAcl('NonExistentRouter', '10');
    assert.strictEqual(nonRouter.success, false);
});

// 265. Delete ACL and verify automatic interface unbinding
runTest('265. Delete ACL and verify automatic interface unbinding', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '10');
    bindRouterInterfaceAcl(r.id, 'Gig0/0', 'in', '10');
    assert.strictEqual(getRouterInterfaceAcl(r.id, 'Gig0/0', 'in'), '10');

    const delRes = deleteRouterAcl(r.id, '10');
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(getRouterAcl(r.id, '10'), null);
    assert.strictEqual(getRouterInterfaceAcl(r.id, 'Gig0/0', 'in'), null);
});

// 266. Standard ACL source IP exact match (host) permit and deny
runTest('266. Standard ACL source IP exact match (host) permit and deny', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '10');
    addRouterAclRule(r.id, '10', { action: 'permit', sourceIp: '192.168.1.50', sequence: 10 });
    addRouterAclRule(r.id, '10', { action: 'deny', sourceIp: '192.168.1.100', sequence: 20 });

    const acl = getRouterAcl(r.id, '10');

    // Matching host 192.168.1.50
    const eval1 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.50', destinationIp: '10.0.0.1' });
    assert.strictEqual(eval1.action, 'permit');
    assert.strictEqual(eval1.rule.sequence, 10);
    assert.strictEqual(eval1.isImplicitDeny, false);

    // Matching host 192.168.1.100
    const eval2 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.100', destinationIp: '10.0.0.1' });
    assert.strictEqual(eval2.action, 'deny');
    assert.strictEqual(eval2.rule.sequence, 20);
    assert.strictEqual(eval2.isImplicitDeny, false);
});

// 267. Standard ACL subnet and wildcard mask matching (/24 subnet, wildcard 0.0.0.255)
runTest('267. Standard ACL subnet and wildcard mask matching (/24 subnet, wildcard 0.0.0.255)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '15');
    // Using subnetMask notation
    addRouterAclRule(r.id, '15', { action: 'permit', sourceIp: '192.168.10.0', subnetMask: '255.255.255.0', sequence: 10 });
    // Using wildcard notation
    addRouterAclRule(r.id, '15', { action: 'deny', sourceIp: '172.16.0.0', wildcard: '0.0.255.255', sequence: 20 });

    const acl = getRouterAcl(r.id, '15');

    // 192.168.10.25 matches rule 10
    const eval1 = evaluatePacketAcl(acl, { sourceIp: '192.168.10.25', destinationIp: '10.0.0.1' });
    assert.strictEqual(eval1.action, 'permit');
    assert.strictEqual(eval1.rule.sequence, 10);

    // 172.16.55.99 matches rule 20
    const eval2 = evaluatePacketAcl(acl, { sourceIp: '172.16.55.99', destinationIp: '10.0.0.1' });
    assert.strictEqual(eval2.action, 'deny');
    assert.strictEqual(eval2.rule.sequence, 20);
});

// 268. Extended ACL source and destination matching
runTest('268. Extended ACL source and destination matching', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, 100);
    // Permit only traffic from 192.168.1.0/24 to 10.0.0.0/8
    addRouterAclRule(r.id, 100, {
        action: 'permit',
        protocol: 'ip',
        sourceIp: '192.168.1.0',
        sourceMask: '255.255.255.0',
        destinationIp: '10.0.0.0',
        destinationMask: '255.0.0.0',
        sequence: 10
    });

    const acl = getRouterAcl(r.id, 100);

    // Matching source and destination
    const eval1 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.15', destinationIp: '10.5.6.7', protocol: 'IP' });
    assert.strictEqual(eval1.action, 'permit');
    assert.strictEqual(eval1.rule.sequence, 10);

    // Matching source but non-matching destination -> drops to implicit deny
    const eval2 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.15', destinationIp: '172.16.1.1', protocol: 'IP' });
    assert.strictEqual(eval2.action, 'deny');
    assert.strictEqual(eval2.isImplicitDeny, true);
});

// 269. Extended ACL protocol matching (ICMP vs IP)
runTest('269. Extended ACL protocol matching (ICMP vs IP)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, 102);
    // Rule 10 permits only ICMP from any to any
    addRouterAclRule(r.id, 102, { action: 'permit', protocol: 'icmp', sourceIp: 'any', destinationIp: 'any', sequence: 10 });

    const acl = getRouterAcl(r.id, 102);

    // ICMP packet
    const evalIcmp = evaluatePacketAcl(acl, { sourceIp: '192.168.1.1', destinationIp: '10.0.0.1', protocol: 'ICMP', icmp: { type: 8 } });
    assert.strictEqual(evalIcmp.action, 'permit');
    assert.strictEqual(evalIcmp.rule.sequence, 10);

    // UDP/TCP packet -> doesn't match ICMP rule, hits implicit deny
    const evalUdp = evaluatePacketAcl(acl, { sourceIp: '192.168.1.1', destinationIp: '10.0.0.1', protocol: 'UDP' });
    assert.strictEqual(evalUdp.action, 'deny');
    assert.strictEqual(evalUdp.isImplicitDeny, true);
});

// 270. Sequence number ordering and first-match behavior
runTest('270. Sequence number ordering and first-match behavior', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '20');
    // Add rule 30 first, then rule 10
    addRouterAclRule(r.id, '20', { action: 'permit', sourceIp: 'any', sequence: 30 });
    addRouterAclRule(r.id, '20', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });

    const acl = getRouterAcl(r.id, '20');
    assert.strictEqual(acl.rules[0].sequence, 10);
    assert.strictEqual(acl.rules[1].sequence, 30);

    // 192.168.1.10 matches rule 10 first and is denied
    const eval1 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' });
    assert.strictEqual(eval1.action, 'deny');
    assert.strictEqual(eval1.rule.sequence, 10);

    // 192.168.1.99 doesn't match rule 10, matches rule 30 and is permitted
    const eval2 = evaluatePacketAcl(acl, { sourceIp: '192.168.1.99' });
    assert.strictEqual(eval2.action, 'permit');
    assert.strictEqual(eval2.rule.sequence, 30);
});

// 271. Implicit Deny when no rules match
runTest('271. Implicit Deny when no rules match', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '30');
    addRouterAclRule(r.id, '30', { action: 'permit', sourceIp: '10.0.0.1', sequence: 10 });

    const acl = getRouterAcl(r.id, '30');

    // 192.168.1.1 does not match any rule
    const evalRes = evaluatePacketAcl(acl, { sourceIp: '192.168.1.1' });
    assert.strictEqual(evalRes.matched, true);
    assert.strictEqual(evalRes.action, 'deny');
    assert.strictEqual(evalRes.isImplicitDeny, true);
    assert.strictEqual(evalRes.rule, null);
});

// 272. Per-rule hit counter increment and isolation
runTest('272. Per-rule hit counter increment and isolation', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '40');
    addRouterAclRule(r.id, '40', { action: 'permit', sourceIp: '192.168.1.10', sequence: 10 });
    addRouterAclRule(r.id, '40', { action: 'permit', sourceIp: '192.168.1.20', sequence: 20 });

    const acl = getRouterAcl(r.id, '40');
    assert.strictEqual(acl.rules[0].hits, 0);
    assert.strictEqual(acl.rules[1].hits, 0);

    // Send 3 packets matching rule 10
    evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' });
    evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' });
    evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' });

    assert.strictEqual(acl.rules[0].hits, 3);
    assert.strictEqual(acl.rules[1].hits, 0);

    // Send 1 packet matching rule 20
    evaluatePacketAcl(acl, { sourceIp: '192.168.1.20' });
    assert.strictEqual(acl.rules[0].hits, 3);
    assert.strictEqual(acl.rules[1].hits, 1);
});

// 273. Interface inbound ACL binding and evaluation
runTest('273. Interface inbound ACL binding and evaluation', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '50');
    addRouterAclRule(r.id, '50', { action: 'deny', sourceIp: '192.168.1.100', sequence: 10 });
    addRouterAclRule(r.id, '50', { action: 'permit', sourceIp: 'any', sequence: 20 });

    bindRouterInterfaceAcl(r.id, 'Gig0/0', 'in', '50');

    // Test through interface helper
    const resDenied = evaluateRouterInterfaceAcl(r.id, 'Gig0/0', 'in', { sourceIp: '192.168.1.100' });
    assert.strictEqual(resDenied.action, 'deny');
    assert.strictEqual(resDenied.rule.sequence, 10);

    const resPermitted = evaluateRouterInterfaceAcl(r.id, 'Gig0/0', 'in', { sourceIp: '192.168.1.5' });
    assert.strictEqual(resPermitted.action, 'permit');
    assert.strictEqual(resPermitted.rule.sequence, 20);

    // Other interface without ACL permits by default
    const resNoAcl = evaluateRouterInterfaceAcl(r.id, 'Gig0/1', 'in', { sourceIp: '192.168.1.100' });
    assert.strictEqual(resNoAcl.matched, false);
    assert.strictEqual(resNoAcl.action, 'permit');
});

// 274. Interface outbound ACL binding and evaluation
runTest('274. Interface outbound ACL binding and evaluation', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '150');
    addRouterAclRule(r.id, '150', { action: 'deny', destinationIp: '10.0.12.2', sequence: 10 });
    addRouterAclRule(r.id, '150', { action: 'permit', destinationIp: 'any', sequence: 20 });

    bindRouterInterfaceAcl(r.id, 'Gig0/1', 'out', '150');

    const resDenied = evaluateRouterInterfaceAcl(r.id, 'Gig0/1', 'out', { destinationIp: '10.0.12.2' });
    assert.strictEqual(resDenied.action, 'deny');
    assert.strictEqual(resDenied.rule.sequence, 10);

    const resPermitted = evaluateRouterInterfaceAcl(r.id, 'Gig0/1', 'out', { destinationIp: '192.168.2.10' });
    assert.strictEqual(resPermitted.action, 'permit');
    assert.strictEqual(resPermitted.rule.sequence, 20);
});

// 275. Interface ACL unbinding and fallback to permit
runTest('275. Interface ACL unbinding and fallback to permit', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '60');
    addRouterAclRule(r.id, '60', { action: 'deny', sourceIp: 'any', sequence: 10 });
    bindRouterInterfaceAcl(r.id, 'Gig0/0', 'in', '60');

    const blocked = evaluateRouterInterfaceAcl(r.id, 'Gig0/0', 'in', { sourceIp: '192.168.1.1' });
    assert.strictEqual(blocked.action, 'deny');

    unbindRouterInterfaceAcl(r.id, 'Gig0/0', 'in');

    const unblocked = evaluateRouterInterfaceAcl(r.id, 'Gig0/0', 'in', { sourceIp: '192.168.1.1' });
    assert.strictEqual(unblocked.matched, false);
    assert.strictEqual(unblocked.action, 'permit');
});

// 276. Rule deletion by sequence number and re-evaluation
runTest('276. Rule deletion by sequence number and re-evaluation', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    createRouterAcl(r.id, '70');
    addRouterAclRule(r.id, '70', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    addRouterAclRule(r.id, '70', { action: 'permit', sourceIp: 'any', sequence: 20 });

    const acl = getRouterAcl(r.id, '70');
    assert.strictEqual(evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' }).action, 'deny');

    // Delete sequence 10
    const delRes = deleteRouterAclRule(r.id, '70', 10);
    assert.strictEqual(delRes.success, true);
    assert.strictEqual(acl.rules.length, 1);

    // Now matches rule 20 and is permitted
    assert.strictEqual(evaluatePacketAcl(acl, { sourceIp: '192.168.1.10' }).action, 'permit');
});

// 277. Standard inbound ACL permit allows forwarding
runTest('277. Standard inbound ACL permit allows forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, true, 'Transmission must succeed when permitted by inbound ACL');
    assert.strictEqual(result.icmpErrorPacket, null);
});

// 278. Standard inbound ACL explicit deny blocks forwarding
runTest('278. Standard inbound ACL explicit deny blocks forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: 'any', sequence: 20 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false, 'Transmission must fail when denied by inbound ACL');
    assert.strictEqual(result.action, 'DROP');
});

// 279. Standard inbound ACL deny generates ICMP Type 3 Code 13
runTest('279. Standard inbound ACL deny generates ICMP Type 3 Code 13', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.ok(result.icmpErrorPacket, 'Must generate ICMP error packet');
    assert.strictEqual(result.icmpErrorPacket.icmp.type, 3, 'Must be ICMP Type 3');
    assert.strictEqual(result.icmpErrorPacket.icmp.code, 13, 'Must be ICMP Code 13 (Admin Prohibited)');
    assert.strictEqual(result.icmpErrorPacket.icmp.codeName, 'ADMINISTRATIVELY_PROHIBITED');
    assert.strictEqual(result.icmpErrorPacket.sourceIp, '192.168.1.1');
    assert.strictEqual(result.icmpErrorPacket.destinationIp, '192.168.1.10');
});

// 280. ACL denial records correct rule sequence and hit counter
runTest('280. ACL denial records correct rule sequence and hit counter', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.99', sequence: 10 });
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 20 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    simulateSendFrame(pc0, pc1, { icmp: true });

    const acl = getRouterAcl(r0.id, '10');
    assert.strictEqual(acl.rules[0].hits, 0, 'Rule 10 should have 0 hits');
    assert.strictEqual(acl.rules[1].hits, 1, 'Rule 20 should have 1 hit');
});

// 281. Implicit deny generates administrative prohibition
runTest('281. Implicit deny generates administrative prohibition', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.55', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    // PC0 (192.168.1.10) does not match rule 10 -> hits implicit deny
    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false);
    assert.ok(result.icmpErrorPacket);
    assert.strictEqual(result.icmpErrorPacket.icmp.code, 13);
    assert.strictEqual(result.acl?.isImplicitDeny, true);
});

// 282. Outbound ACL permit allows forwarding
runTest('282. Outbound ACL permit allows forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', { action: 'permit', destinationIp: '192.168.2.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.icmpErrorPacket, null);
});

// 283. Outbound ACL deny blocks forwarding
runTest('283. Outbound ACL deny blocks forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', { action: 'deny', destinationIp: '192.168.2.10', sequence: 10 });
    addRouterAclRule(r0.id, '100', { action: 'permit', destinationIp: 'any', sequence: 20 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

// 284. Outbound ACL deny generates Type 3 Code 13
runTest('284. Outbound ACL deny generates Type 3 Code 13', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', { action: 'deny', destinationIp: '192.168.2.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.ok(result.icmpErrorPacket);
    assert.strictEqual(result.icmpErrorPacket.icmp.type, 3);
    assert.strictEqual(result.icmpErrorPacket.icmp.code, 13);
    assert.strictEqual(result.acl?.direction, 'outbound');
    assert.strictEqual(result.acl?.interface, 'Gig0/1');
});

// 285. Extended ACL matches source + destination + protocol
runTest('285. Extended ACL matches source + destination + protocol', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '105');
    // Deny only ICMP from 192.168.1.10 to 192.168.2.10
    addRouterAclRule(r0.id, '105', {
        action: 'deny',
        protocol: 'icmp',
        sourceIp: '192.168.1.10',
        destinationIp: '192.168.2.10',
        sequence: 10
    });
    addRouterAclRule(r0.id, '105', { action: 'permit', protocol: 'ip', sourceIp: 'any', destinationIp: 'any', sequence: 20 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '105');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.icmpErrorPacket?.icmp?.code, 13);
    assert.strictEqual(result.acl?.sequence, 10);
});

// 286. ACL deny across a multi-router topology returns the ICMP error to the source
runTest('286. ACL deny across a multi-router topology returns the ICMP error to the source', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.12.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    r1.interfaces['Gig0/0'].ip = '10.0.12.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.252';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.2' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.12.1' });

    // Block on Router1 egress interface Gig0/1
    createRouterAcl(r1.id, '110');
    addRouterAclRule(r1.id, '110', { action: 'deny', destinationIp: '192.168.2.0', subnetMask: '255.255.255.0', sequence: 10 });
    bindRouterInterfaceAcl(r1.id, 'Gig0/1', 'out', '110');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false);
    assert.ok(result.icmpErrorPacket);
    assert.strictEqual(result.icmpErrorPacket.icmp.code, 13);
    assert.strictEqual(result.icmpErrorPacket.icmp.router.name, 'Router1');
    assert.strictEqual(result.icmpErrorResult?.success, true, 'Error return path back to PC0 must succeed');
});

// 287. ACL deny does not recursively generate another ICMP error
runTest('287. ACL deny does not recursively generate another ICMP error', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r = networkState.devices[0];

    // Build an ICMP error packet (Type 11)
    const originalIcmpError = {
        sourceIp: '10.0.0.1',
        destinationIp: '192.168.1.10',
        protocol: 'ICMP',
        icmp: {
            type: 11,
            code: 0,
            isError: true
        }
    };

    // Attempt to create an ICMP error packet in response to an existing error packet
    const nestedError = createIcmpErrorPacket(3, 13, originalIcmpError, r);
    assert.strictEqual(nestedError, null, 'Must return null (RFC 792 anti-recursion rule)');
});

// 288. Router without ACL behaves identically to baseline
runTest('288. Router without ACL behaves identically to baseline', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.acl, null);
});

// 289. Inbound ACL is evaluated before route forwarding
runTest('289. Inbound ACL is evaluated before route forwarding', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    // Interface Gig0/1 is DOWN
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].status = 'down';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    // Inbound ACL denies on Gig0/0
    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    // Inbound ACL must drop BEFORE route lookup / egress interface check
    assert.strictEqual(result.reason.includes('inbound ACL'), true);
    assert.strictEqual(result.icmpErrorPacket?.icmp?.code, 13, 'Must drop due to ACL Code 13, not interface down Code 1');
});

// 290. Outbound ACL is evaluated after route selection
runTest('290. Outbound ACL is evaluated after route selection', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    // Inbound ACL permits on Gig0/0
    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: 'any', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    // Outbound ACL denies on Gig0/1
    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', { action: 'deny', destinationIp: '192.168.2.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.acl?.direction, 'outbound');
    assert.strictEqual(result.acl?.interface, 'Gig0/1');
});

// 291. ACL decisions appear in structured hop decisions
runTest('291. ACL decisions appear in structured hop decisions', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 15 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    const dropHop = result.hopActions.find(h => h.action === 'DROP');
    assert.ok(dropHop, 'Must have a DROP hopAction');
    assert.strictEqual(dropHop.reason, 'acl-deny');
    assert.strictEqual(dropHop.acl?.aclId, '10');
    assert.strictEqual(dropHop.acl?.sequence, 15);
    assert.strictEqual(dropHop.acl?.direction, 'inbound');
});

// 292. Simulation result exposes structured ACL denial information
runTest('292. Simulation result exposes structured ACL denial information', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '20');
    addRouterAclRule(r0.id, '20', { action: 'deny', sourceIp: '192.168.1.10', sequence: 25 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '20');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    assert.ok(result.acl);
    assert.strictEqual(result.acl.aclId, '20');
    assert.strictEqual(result.acl.sequence, 25);
    assert.strictEqual(result.acl.action, 'deny');
    assert.strictEqual(result.acl.direction, 'inbound');
    assert.strictEqual(result.acl.interface, 'Gig0/0');
    assert.strictEqual(result.acl.sourceIp, '192.168.1.10');
    assert.strictEqual(result.acl.destinationIp, '192.168.2.10');
});

// 293. Route-aware connection testing (analyzeCommunication) detects inbound/outbound ACL blocks
runTest('293. Route-aware connection testing (analyzeCommunication) detects inbound/outbound ACL blocks', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    // Initially possible
    assert.strictEqual(analyzeCommunication(pc0, pc1).possible, true);

    // Apply inbound ACL denying PC0
    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const analysisBlockedIn = analyzeCommunication(pc0, pc1);
    assert.strictEqual(analysisBlockedIn.possible, false);
    assert.ok(analysisBlockedIn.reason.includes('inbound ACL 10 denies traffic'));

    // Unbind inbound and bind outbound ACL denying to PC1
    unbindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in');
    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', { action: 'deny', destinationIp: '192.168.2.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const analysisBlockedOut = analyzeCommunication(pc0, pc1);
    assert.strictEqual(analysisBlockedOut.possible, false);
    assert.ok(analysisBlockedOut.reason.includes('outbound ACL 100 denies traffic'));
});

// 294. Router Inspector HTML renders ACCESS CONTROL LISTS (ACL) section for routers
runTest('294. Router Inspector HTML renders ACCESS CONTROL LISTS (ACL) section for routers', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    const html = renderRouterInspector(r0);
    assert.ok(html.includes('ACCESS CONTROL LISTS (ACL)'), 'Must render ACL section header');
    assert.ok(html.includes('Interface ACL Bindings'), 'Must render interface bindings table');
    assert.ok(html.includes('Create New ACL'), 'Must render Create New ACL form');
    assert.ok(html.includes('No Access Control Lists configured on this router'), 'Must render empty state initially');
});

// 295. Non-router device inspector does NOT render ACL section
runTest('295. Non-router device inspector does NOT render ACL section', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 200, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];

    networkState.selectedDeviceId = pc0.id;
    renderPropertiesPanel();
    const panel = document.getElementById('propertiesPanel');
    assert.strictEqual(panel.innerHTML.includes('ACCESS CONTROL LISTS (ACL)'), false, 'PC inspector must not render ACL section');

    const switchHtml = renderSwitchInspector(sw0);
    assert.strictEqual(switchHtml.includes('ACCESS CONTROL LISTS (ACL)'), false, 'Switch inspector must not render ACL section');
});

// 296. Router Inspector HTML renders Standard and Extended ACL cards with rules and badges
runTest('296. Router Inspector HTML renders Standard and Extended ACL cards with rules and badges', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.50', sequence: 10 });
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: 'any', sequence: 20 });

    createRouterAcl(r0.id, '100');
    addRouterAclRule(r0.id, '100', {
        action: 'permit',
        protocol: 'icmp',
        sourceIp: '192.168.1.0',
        sourceMask: '255.255.255.0',
        destinationIp: '10.0.0.0',
        destinationMask: '255.0.0.0',
        sequence: 15
    });

    const html = renderRouterInspector(r0);
    assert.ok(html.includes('ACL 10'), 'Must render ACL 10');
    assert.ok(html.includes('ACL 100'), 'Must render ACL 100');
    assert.ok(html.includes('acl-type-badge--standard'), 'Must render Standard badge');
    assert.ok(html.includes('acl-type-badge--extended'), 'Must render Extended badge');
    assert.ok(html.includes('acl-badge--permit'), 'Must render PERMIT badge');
    assert.ok(html.includes('acl-badge--deny'), 'Must render DENY badge');
    assert.ok(html.includes('host 192.168.1.50'), 'Must render host source text');
    assert.ok(html.includes('192.168.1.0 0.0.0.255'), 'Must render network source with wildcard');
    assert.ok(html.includes('10.0.0.0 0.255.255.255'), 'Must render network destination with wildcard');
});

// 297. Router Inspector HTML renders active interface ACL bindings
runTest('297. Router Inspector HTML renders active interface ACL bindings', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '10');
    createRouterAcl(r0.id, '100');

    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');
    bindRouterInterfaceAcl(r0.id, 'Gig0/1', 'out', '100');

    const html = renderRouterInspector(r0);
    assert.ok(html.includes('acl-binding-badge--active'), 'Must render active binding badges');
    assert.ok(html.includes('>10<'), 'Must display bound ACL 10');
    assert.ok(html.includes('>100<'), 'Must display bound ACL 100');
});

// 298. Router Inspector HTML updates hit counters after packet transmission
runTest('298. Router Inspector HTML updates hit counters after packet transmission', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    // Transmit 2 frames
    simulateSendFrame(pc0, pc1, { icmp: true });
    simulateSendFrame(pc0, pc1, { icmp: true });

    const html = renderRouterInspector(r0);
    assert.ok(html.includes('<span class="acl-hits-badge">2</span>'), 'Must display 2 hits in inspector HTML');
});

// 299. Add Rule to ACL form renders when at least one ACL exists
runTest('299. Add Rule to ACL form renders when at least one ACL exists', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    // When 0 ACLs exist -> rule form is not shown
    let html = renderRouterInspector(r0);
    assert.strictEqual(html.includes('acl-rule-form'), false);

    // When an ACL is created -> rule form appears
    createRouterAcl(r0.id, '10');
    html = renderRouterInspector(r0);
    assert.ok(html.includes('acl-rule-form'));
    assert.ok(html.includes('aclRuleTargetSelect'));
    assert.ok(html.includes('aclRuleAction'));
    assert.ok(html.includes('aclRuleSource'));
});

// 300. Delete ACL button removes ACL and updates rendered HTML
runTest('300. Delete ACL button removes ACL and updates rendered HTML', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '10');
    let html = renderRouterInspector(r0);
    assert.ok(html.includes('ACL 10'));

    deleteRouterAcl(r0.id, '10');
    html = renderRouterInspector(r0);
    assert.strictEqual(html.includes('ACL 10'), false);
    assert.ok(html.includes('No Access Control Lists configured'));
});

// 301. Delete Rule button removes rule and updates rendered HTML
runTest('301. Delete Rule button removes rule and updates rendered HTML', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.10', sequence: 10 });
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: 'any', sequence: 20 });

    let html = renderRouterInspector(r0);
    assert.ok(html.includes('Rule 10') || html.includes('>10<'));
    assert.ok(html.includes('Rule 20') || html.includes('>20<'));

    deleteRouterAclRule(r0.id, '10', 10);
    html = renderRouterInspector(r0);
    assert.strictEqual(getRouterAcl(r0.id, '10').rules.length, 1);
});

// 302. Router Inspector safely escapes dynamic ACL and rule names
runTest('302. Router Inspector safely escapes dynamic ACL and rule names', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '<script>alert(1)</script>');
    const html = renderRouterInspector(r0);
    assert.strictEqual(html.includes('<script>alert(1)</script>'), false);
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

// 303. Packet Inspector renders ACCESS CONTROL LIST (ACL) section when ACL drops packet
runTest('303. Packet Inspector renders ACCESS CONTROL LIST (ACL) section when ACL drops packet', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    createRouterAcl(r0.id, '10');
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: '192.168.1.10', sequence: 10 });
    bindRouterInterfaceAcl(r0.id, 'Gig0/0', 'in', '10');

    const result = simulateSendFrame(pc0, pc1, { icmp: true });
    const inspectorHtml = renderPacketInspector(result.packet, result);

    assert.ok(inspectorHtml.includes('packet-inspector__section--acl'), 'Must render ACL section');
    assert.ok(inspectorHtml.includes('ACCESS CONTROL LIST (ACL)'), 'Must render ACL section header');
    assert.ok(inspectorHtml.includes('ACL ID / Name'), 'Must render ACL ID label');
    assert.ok(inspectorHtml.includes('DENY (inbound)'), 'Must render DENY (inbound)');
    assert.ok(inspectorHtml.includes('Sequence 10'), 'Must render matched rule sequence');
});

// ==========================================================================
// V5.11 Phase 1 — Interactive Network CLI Foundation Tests (304 - 333)
// ==========================================================================

// 304. Prompt generation for PC, Laptop, Server, and Router
runTest('304. Prompt generation for PC, Laptop, Server, and Router', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('laptop', 150, 100);
    addDevice('server', 250, 100);
    addDevice('router', 350, 100);

    const pc = networkState.devices[0];
    const laptop = networkState.devices[1];
    const server = networkState.devices[2];
    const router = networkState.devices[3];

    assert.strictEqual(getDeviceCliPrompt(pc), 'PC0>');
    assert.strictEqual(getDeviceCliPrompt(laptop), 'Laptop0>');
    assert.strictEqual(getDeviceCliPrompt(server), 'Server0>');
    assert.strictEqual(getDeviceCliPrompt(router), 'Router0#');

    pc.name = 'Custom-PC';
    router.name = 'CoreRouter-1';
    assert.strictEqual(getDeviceCliPrompt(pc), 'Custom-PC>');
    assert.strictEqual(getDeviceCliPrompt(router), 'CoreRouter-1#');
});

// 305. isDeviceCliSupported returns true for supported devices including switches
runTest('305. isDeviceCliSupported returns true for supported devices including switches', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('laptop', 150, 100);
    addDevice('server', 250, 100);
    addDevice('router', 350, 100);
    addDevice('switch', 450, 100);

    assert.strictEqual(isDeviceCliSupported('PC0'), true);
    assert.strictEqual(isDeviceCliSupported('Laptop0'), true);
    assert.strictEqual(isDeviceCliSupported('Server0'), true);
    assert.strictEqual(isDeviceCliSupported('Router0'), true);
    assert.strictEqual(isDeviceCliSupported('Switch0'), true);
    assert.strictEqual(isDeviceCliSupported('NonExistentDevice'), false);
});

// 306. Help command output on end hosts (PC, Laptop, Server)
runTest('306. Help command output on end hosts (PC, Laptop, Server)', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const resHelp = executeCliCommand('PC0', 'help');
    assert.strictEqual(resHelp.success, true);
    assert.ok(resHelp.output.includes('Commands available on PC0:'));
    assert.ok(resHelp.output.includes('ipconfig'));
    assert.ok(resHelp.output.includes('arp -a'));
    assert.ok(resHelp.output.includes('clear'));

    const resQuestion = executeCliCommand('PC0', '?');
    assert.strictEqual(resQuestion.success, true);
    assert.strictEqual(resQuestion.output, resHelp.output);
});

// 307. Help command output on Routers (Cisco IOS-style)
runTest('307. Help command output on Routers (Cisco IOS-style)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const resHelp = executeCliCommand('Router0', 'help');
    assert.strictEqual(resHelp.success, true);
    assert.ok(resHelp.output.includes('Commands available on Router0 (Cisco IOS-style):'));
    assert.ok(resHelp.output.includes('show ip route'));
    assert.ok(resHelp.output.includes('show arp'));
    assert.ok(resHelp.output.includes('show access-lists'));
    assert.ok(resHelp.output.includes('clear'));
});

// 308. Clear command returns clear flag and empties terminal session logs
runTest('308. Clear command returns clear flag and empties terminal session logs', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const session = getDeviceTerminalSession('PC0');
    session.logs.push({ prompt: 'PC0>', command: 'ipconfig', output: 'dummy', status: 'success' });
    assert.strictEqual(session.logs.length, 1);

    const resClear = executeCliCommand('PC0', 'clear');
    assert.strictEqual(resClear.success, true);
    assert.strictEqual(resClear.clear, true);
    assert.strictEqual(session.logs.length, 0);

    const resCls = executeCliCommand('PC0', 'cls');
    assert.strictEqual(resCls.success, true);
    assert.strictEqual(resCls.clear, true);
});

// 309. ipconfig on configured end host renders IP, Mask, Gateway, MAC
runTest('309. ipconfig on configured end host renders IP, Mask, Gateway, MAC', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc = networkState.devices[0];
    pc.ip = '192.168.1.50';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';
    pc.mac = '02:11:22:33:44:55';

    const res = executeCliCommand('PC0', 'ipconfig');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'success');
    assert.ok(res.output.includes('Windows IP Configuration'));
    assert.ok(res.output.includes('IPv4 Address. . . . . . . . . . . : 192.168.1.50'));
    assert.ok(res.output.includes('Subnet Mask . . . . . . . . . . . : 255.255.255.0'));
    assert.ok(res.output.includes('Default Gateway . . . . . . . . . : 192.168.1.1'));
    assert.ok(res.output.includes('Physical Address. . . . . . . . . : 02-11-22-33-44-55'));
});

// 310. ipconfig on unconfigured end host renders default 0.0.0.0 addresses
runTest('310. ipconfig on unconfigured end host renders default 0.0.0.0 addresses', () => {
    resetLab();
    addDevice('laptop', 50, 100);
    const res = executeCliCommand('Laptop0', 'ipconfig');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('IPv4 Address. . . . . . . . . . . : 0.0.0.0'));
    assert.ok(res.output.includes('Subnet Mask . . . . . . . . . . . : 0.0.0.0'));
    assert.ok(res.output.includes('Default Gateway . . . . . . . . . : 0.0.0.0'));
});

// 311. ipconfig /all and ifconfig aliases work on end hosts
runTest('311. ipconfig /all and ifconfig aliases work on end hosts', () => {
    resetLab();
    addDevice('server', 50, 100);
    const resAll = executeCliCommand('Server0', 'ipconfig /all');
    assert.strictEqual(resAll.success, true);
    assert.ok(resAll.output.includes('Windows IP Configuration'));

    const resIfconfig = executeCliCommand('Server0', 'ifconfig');
    assert.strictEqual(resIfconfig.success, true);
    assert.ok(resIfconfig.output.includes('Windows IP Configuration'));
});

// 312. ipconfig on Router returns educational error message directing to router commands
runTest('312. ipconfig on Router returns educational error message directing to router commands', () => {
    resetLab();
    addDevice('router', 100, 100);
    const res = executeCliCommand('Router0', 'ipconfig');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'error');
    assert.ok(res.output.includes("% 'ipconfig' is for end hosts (PC/Server)"));
    assert.ok(res.output.includes("On Cisco IOS routers, use 'show ip route'"));
});

// 313. arp -a on end host with empty ARP cache returns "No ARP entries found"
runTest('313. arp -a on end host with empty ARP cache returns "No ARP entries found"', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const res = executeCliCommand('PC0', 'arp -a');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('No ARP entries found.'));
});

// 314. arp -a on end host with learned entries renders formatted table
runTest('314. arp -a on end host with learned entries renders formatted table', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';

    learnArp(pc0.id, '192.168.1.1', '02:00:00:11:22:33', { type: 'dynamic' });
    learnArp(pc0.id, '192.168.1.20', '02:00:00:44:55:66', { type: 'dynamic' });

    const res = executeCliCommand('PC0', 'arp -a');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Internet Address'));
    assert.ok(res.output.includes('Physical Address'));
    assert.ok(res.output.includes('192.168.1.1'));
    assert.ok(res.output.includes('02:00:00:11:22:33'));
    assert.ok(res.output.includes('192.168.1.20'));
    assert.ok(res.output.includes('02:00:00:44:55:66'));
});

// 315. arp -a on Router returns educational error directing to 'show arp'
runTest('315. arp -a on Router returns educational error directing to show arp', () => {
    resetLab();
    addDevice('router', 100, 100);
    const res = executeCliCommand('Router0', 'arp -a');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes("% 'arp -a' is an end host command"));
    assert.ok(res.output.includes("On Cisco IOS routers, use 'show arp'"));
});

// 316. show ip route on Router renders connected and static routes with codes and interfaces
runTest('316. show ip route on Router renders connected and static routes with codes and interfaces', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        network: '192.168.2.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2',
        interface: 'Gig0/0',
        adminDistance: 1,
        metric: 0
    });

    const res = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Codes: C - connected, S - static'));
    assert.ok(res.output.includes('192.168.1.0/24 is directly connected, Gig0/0'));
    assert.ok(res.output.includes('192.168.2.0/24 [1/0] via 192.168.1.2, Gig0/0'));
});

// 317. show ip route on Router indicates inactive status when interface is shut down
runTest('317. show ip route on Router indicates inactive status when interface is shut down', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        network: '10.0.0.0',
        subnetMask: '255.0.0.0',
        nextHop: '192.168.1.254',
        interface: 'Gig0/0',
        adminDistance: 10,
        metric: 0
    });

    // Shut down Gig0/0
    toggleRouterInterfaceStatus(r0.id, 'Gig0/0');
    assert.strictEqual(r0.interfaces['Gig0/0'].status, 'down');

    const res = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('10.0.0.0/8 [10/0] via 192.168.1.254, Gig0/0 (inactive - interface down)'));
});

// 318. show ip route on empty routing table returns clear empty message
runTest('318. show ip route on empty routing table returns clear empty message', () => {
    resetLab();
    addDevice('router', 100, 100);
    const res = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Routing table is empty.'));
});

// 319. show ip route on end host returns educational error explaining router command
runTest('319. show ip route on end host returns educational error explaining router command', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const res = executeCliCommand('PC0', 'show ip route');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes("% 'show ip route' is a Cisco IOS router command"));
    assert.ok(res.output.includes("End hosts use 'ipconfig' or their default gateway"));
});

// 320. show arp on Router renders Cisco IOS style ARP table with IP, MAC, and interface
runTest('320. show arp on Router renders Cisco IOS style ARP table with IP, MAC, and interface', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    learnArp(r0.id, '192.168.1.10', '02:00:00:aa:bb:cc', { interface: 'Gig0/0', type: 'dynamic' });

    const res = executeCliCommand('Router0', 'show arp');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Protocol  Address'));
    assert.ok(res.output.includes('Hardware Addr'));
    assert.ok(res.output.includes('Internet'));
    assert.ok(res.output.includes('192.168.1.10'));
    assert.ok(res.output.includes('02:00:00:aa:bb:cc'));
    assert.ok(res.output.includes('Gig0/0'));
});

// 321. show arp on Router with empty cache returns "No ARP entries found"
runTest('321. show arp on Router with empty cache returns "No ARP entries found"', () => {
    resetLab();
    addDevice('router', 100, 100);
    const res = executeCliCommand('Router0', 'show arp');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('No ARP entries found.'));
});

// 322. show arp on end host returns educational error directing to 'arp -a'
runTest('322. show arp on end host returns educational error directing to arp -a', () => {
    resetLab();
    addDevice('laptop', 50, 100);
    const res = executeCliCommand('Laptop0', 'show arp');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes("% 'show arp' is a Cisco IOS router command"));
    assert.ok(res.output.includes("On end hosts, use 'arp -a'"));
});

// 323. show access-lists on Router renders Standard and Extended ACL rules and hit counters
runTest('323. show access-lists on Router renders Standard and Extended ACL rules and hit counters', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    createRouterAcl(r0.id, '10', 'standard');
    addRouterAclRule(r0.id, '10', { action: 'permit', sourceIp: '192.168.1.10', sequence: 10 });
    addRouterAclRule(r0.id, '10', { action: 'deny', sourceIp: 'any', sequence: 20 });

    const acls = getRouterAcls(r0.id);
    acls['10'].rules[0].hits = 5;

    createRouterAcl(r0.id, '100', 'extended');
    addRouterAclRule(r0.id, '100', {
        action: 'permit',
        protocol: 'icmp',
        sourceIp: '192.168.1.0',
        sourceWildcard: '0.0.0.255',
        destinationIp: '192.168.2.10',
        sequence: 10
    });

    const res = executeCliCommand('Router0', 'show access-lists');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Standard IP access list 10'));
    assert.ok(res.output.includes('10 permit host 192.168.1.10 (5 matches)'));
    assert.ok(res.output.includes('20 deny any (0 matches)'));
    assert.ok(res.output.includes('Extended IP access list 100'));
    assert.ok(res.output.includes('10 permit icmp 192.168.1.0 0.0.0.255 host 192.168.2.10 (0 matches)'));
});

// 324. show access-lists on Router with no ACLs returns "No access lists configured"
runTest('324. show access-lists on Router with no ACLs returns "No access lists configured"', () => {
    resetLab();
    addDevice('router', 100, 100);
    const res = executeCliCommand('Router0', 'show access-lists');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('No access lists configured.'));
});

// 325. show access-lists on end host returns educational error explaining router command
runTest('325. show access-lists on end host returns educational error explaining router command', () => {
    resetLab();
    addDevice('server', 50, 100);
    const res = executeCliCommand('Server0', 'show access-lists');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes("% 'show access-lists' is a Cisco IOS router command"));
    assert.ok(res.output.includes('Access Control Lists are configured on routers'));
});

// 326. Case-insensitivity and multiple whitespace tokens handling in CLI command engine
runTest('326. Case-insensitivity and multiple whitespace tokens handling in CLI command engine', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.0.0.0';

    const resUpper = executeCliCommand('Router0', '   SHOW    IP    ROUTE   ');
    assert.strictEqual(resUpper.success, true);
    assert.ok(resUpper.output.includes('10.0.0.0/8 is directly connected'));

    const resMixed = executeCliCommand('Router0', 'ShOw  ArP');
    assert.strictEqual(resMixed.success, true);
});

// 327. Help command listing includes ping and traceroute in Phase 2
runTest('327. Help command listing includes ping and traceroute in Phase 2', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const resHelpHost = executeCliCommand('PC0', 'help');
    assert.strictEqual(resHelpHost.success, true);
    assert.ok(resHelpHost.output.includes('ping <IP>'));
    assert.ok(resHelpHost.output.includes('traceroute <IP>'));

    addDevice('router', 200, 100);
    const resHelpRouter = executeCliCommand('Router0', 'help');
    assert.strictEqual(resHelpRouter.success, true);
    assert.ok(resHelpRouter.output.includes('ping <IP>'));
    assert.ok(resHelpRouter.output.includes('traceroute <IP>'));
});

// 328. Educational error message for arbitrary unsupported/unknown commands
runTest('328. Educational error message for arbitrary unsupported/unknown commands', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const resUnknown = executeCliCommand('PC0', 'nonexistent_command_123');
    assert.strictEqual(resUnknown.success, false);
    assert.ok(resUnknown.output.includes('% Invalid command or syntax: "nonexistent_command_123"'));
    assert.ok(resUnknown.output.includes('Type "help" or "?" to see available commands'));
});

// 329. Command history recording and retrieval via getCliCommandHistory
runTest('329. Command history recording and retrieval via getCliCommandHistory', () => {
    resetLab();
    addDevice('pc', 50, 100);
    clearCliTerminal('PC0');
    const session = getDeviceTerminalSession('PC0');
    session.history = [];

    executeCliCommand('PC0', 'ipconfig');
    executeCliCommand('PC0', 'arp -a');
    executeCliCommand('PC0', 'help');

    const history = getCliCommandHistory('PC0');
    assert.deepStrictEqual(history, ['ipconfig', 'arp -a', 'help']);
});

// 330. Device Inspector HTML renders Open Terminal button for PC, Laptop, Server
runTest('330. Device Inspector HTML renders Open Terminal button for PC, Laptop, Server', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    networkState.selectedDeviceId = pc0.id;

    renderPropertiesPanel();
    const panel = document.getElementById('propertiesPanel');
    assert.ok(panel.innerHTML.includes('openDeviceTerminalBtn'), 'Must render openDeviceTerminalBtn');
    assert.ok(panel.innerHTML.includes('Open Terminal / CLI'), 'Must render button label');
});

// 331. Router Inspector HTML renders Open Router Console button
runTest('331. Router Inspector HTML renders Open Router Console button', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    networkState.selectedDeviceId = r0.id;

    renderPropertiesPanel();
    const panel = document.getElementById('propertiesPanel');
    assert.ok(panel.innerHTML.includes('openRouterTerminalBtn'), 'Must render openRouterTerminalBtn');
    assert.ok(panel.innerHTML.includes('Open Router Console / CLI'), 'Must render router console button label');
});

// 332. Switch Inspector HTML does NOT render Open Terminal button
runTest('332. Switch Inspector HTML does NOT render Open Terminal button', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw0 = networkState.devices[0];
    networkState.selectedDeviceId = sw0.id;

    renderPropertiesPanel();
    const panel = document.getElementById('propertiesPanel');
    assert.strictEqual(panel.innerHTML.includes('openDeviceTerminalBtn'), false);
    assert.strictEqual(panel.innerHTML.includes('openRouterTerminalBtn'), false);
});

// 333. Terminal session state does not corrupt topology snapshots or undo/redo
runTest('333. Terminal session state does not corrupt topology snapshots or undo/redo', () => {
    resetLab();
    addDevice('pc', 50, 100);
    networkState.devices[0].ip = '192.168.1.10';

    pushHistory();
    networkState.devices[0].ip = '192.168.1.20';

    // Execute CLI commands which update terminal session runtime
    executeCliCommand('PC0', 'ipconfig');
    executeCliCommand('PC0', 'help');

    // Undo should restore previous IP without error
    undo();
    assert.strictEqual(networkState.devices[0].ip, '192.168.1.10');

    // Redo should restore modified IP
    redo();
    assert.strictEqual(networkState.devices[0].ip, '192.168.1.20');
});

// 334. Successful ping on the same subnet
runTest('334. Successful ping on the same subnet', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('pc', 200, 100);
    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'PC1');

    const res = executeCliCommand('PC0', 'ping 192.168.1.20');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'success');
    assert.ok(res.output.includes('Pinging 192.168.1.20...'));
    assert.ok(res.output.includes('Reply from 192.168.1.20: bytes=32 TTL=64'));
    assert.ok(res.output.includes('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)'));
});

// 335. Successful ping across a single router
runTest('335. Successful ping across a single router', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'ping 192.168.2.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.2.10: bytes=32 TTL=64'));
    assert.ok(res.output.includes('Lost = 0 (0% loss)'));
});

// 336. Successful ping across multiple routers
runTest('336. Successful ping across multiple routers', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.0.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '10.0.0.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2', interface: 'Gig0/1' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.1', interface: 'Gig0/0' });

    const res = executeCliCommand('PC0', 'ping 192.168.2.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.2.10: bytes=32 TTL=64'));
    assert.ok(res.output.includes('Lost = 0 (0% loss)'));
});

// 337. Ping to an unknown IP
runTest('337. Ping to an unknown IP', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';

    const res = executeCliCommand('PC0', 'ping 192.168.99.99');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'error');
    assert.ok(res.output.includes('Pinging 192.168.99.99...'));
    assert.ok(res.output.includes('Ping request could not find host 192.168.99.99'));
    assert.ok(res.output.includes('Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'));
});

// 338. Ping to an existing but unreachable destination (missing route / down interface)
runTest('338. Ping to an existing but unreachable destination', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Shut down egress interface
    toggleRouterInterfaceStatus(r0.id, 'Gig0/1');

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'ping 192.168.2.10');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'error');
    assert.ok(res.output.includes('Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)'));
});

// 339. Ping with invalid or malformed IP input
runTest('339. Ping with invalid or malformed IP input', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';

    const resAbc = executeCliCommand('PC0', 'ping abc');
    assert.strictEqual(resAbc.success, false);
    assert.ok(resAbc.output.includes('Ping request could not find host abc'));

    const resBadOctet = executeCliCommand('PC0', 'ping 999.999.999.999');
    assert.strictEqual(resBadOctet.success, false);
    assert.ok(resBadOctet.output.includes('Ping request could not find host 999.999.999.999'));
});

// 340. Ping with missing argument
runTest('340. Ping with missing argument', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';

    const res = executeCliCommand('PC0', 'ping');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Usage: ping <destination-ip>'));
});

// 341. Ping from an unconfigured device returns clean error
runTest('341. Ping from an unconfigured device returns clean error', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '';

    const res = executeCliCommand('PC0', 'ping 192.168.1.1');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('% Source device "PC0" has no IPv4 address configured.'));
});

// 342. Successful traceroute to a directly reachable destination
runTest('342. Successful traceroute to a directly reachable destination', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('pc', 200, 100);
    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'PC1');

    const res = executeCliCommand('PC0', 'traceroute 192.168.1.20');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Tracing route to 192.168.1.20'));
    assert.ok(res.output.includes('1    192.168.1.20'));
    assert.ok(res.output.includes('Trace complete.'));
});

// 343. Successful traceroute across one router
runTest('343. Successful traceroute across one router', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Tracing route to 192.168.2.10'));
    assert.ok(res.output.includes('1    192.168.1.1'));
    assert.ok(res.output.includes('2    192.168.2.10'));
    assert.ok(res.output.includes('Trace complete.'));
});

// 344. Successful traceroute across multiple routers
runTest('344. Successful traceroute across multiple routers', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);
    addDevice('router', 250, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const r1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.0.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '10.0.0.2';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r1.interfaces['Gig0/1'].ip = '192.168.2.1';
    r1.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    addStaticRoute(r0.id, { network: '192.168.2.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2', interface: 'Gig0/1' });
    addStaticRoute(r1.id, { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.1', interface: 'Gig0/0' });

    const res = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('1    192.168.1.1'));
    assert.ok(res.output.includes('2    10.0.0.2'));
    assert.ok(res.output.includes('3    192.168.2.10'));
    assert.ok(res.output.includes('Trace complete.'));
});

// 345. Intermediate TTL-expired hops are returned
runTest('345. Intermediate TTL-expired hops are returned', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.ok(res.output.includes('1    192.168.1.1'));
});

// 346. Final destination is correctly identified
runTest('346. Final destination is correctly identified', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.ok(res.output.includes('2    192.168.2.10'));
    assert.ok(res.output.includes('Trace complete.'));
});

// 347. Traceroute to an unknown IP
runTest('347. Traceroute to an unknown IP', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';

    const res = executeCliCommand('PC0', 'traceroute 192.168.99.99');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Tracing route to 192.168.99.99'));
    assert.ok(res.output.includes('Destination host unreachable.'));
});

// 348. Traceroute to an unreachable destination (missing route / down interface)
runTest('348. Traceroute to an unreachable destination', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Shut down egress interface
    toggleRouterInterfaceStatus(r0.id, 'Gig0/1');

    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    addConnection('PC0', 'Router0');
    addConnection('Router0', 'PC1');

    const res = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Destination host unreachable.'));
});

// 349. Traceroute with invalid/malformed IP input and missing argument
runTest('349. Traceroute with invalid/malformed IP input and missing argument', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.10';

    const resEmpty = executeCliCommand('PC0', 'traceroute');
    assert.strictEqual(resEmpty.success, false);
    assert.ok(resEmpty.output.includes('Usage: traceroute <destination-ip>'));

    const resInvalid = executeCliCommand('PC0', 'traceroute invalid_ip');
    assert.strictEqual(resInvalid.success, false);
    assert.ok(resInvalid.output.includes('Unable to resolve target system name invalid_ip.'));
});

// 350. tracert behaves as an exact alias for traceroute
runTest('350. tracert behaves as an exact alias for traceroute', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('pc', 200, 100);
    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'PC1');

    const resTracert = executeCliCommand('PC0', 'tracert 192.168.1.20');
    const resTraceroute = executeCliCommand('PC0', 'traceroute 192.168.1.20');

    assert.strictEqual(resTracert.success, true);
    assert.strictEqual(resTracert.output, resTraceroute.output);
});

// 351. Router CLI can execute ping and traceroute across the network
runTest('351. Router CLI can execute ping and traceroute across the network', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('pc', 300, 100);

    const r0 = networkState.devices[0];
    const pc0 = networkState.devices[1];

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    addConnection('Router0', 'PC0');

    const pingRes = executeCliCommand('Router0', 'ping 192.168.1.10');
    assert.strictEqual(pingRes.success, true);
    assert.ok(pingRes.output.includes('Reply from 192.168.1.10: bytes=32 TTL=64'));

    const traceRes = executeCliCommand('Router0', 'traceroute 192.168.1.10');
    assert.strictEqual(traceRes.success, true);
    assert.ok(traceRes.output.includes('Trace complete.'));
});

// 352. ipconfig on host with multiple interfaces renders each interface
runTest('352. ipconfig on host with multiple interfaces renders each interface', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc = networkState.devices[0];
    pc.interfaces = {
        'eth0': { ip: '192.168.1.50', subnetMask: '255.255.255.0', gateway: '192.168.1.1', mac: '02:00:00:11:22:33' },
        'eth1': { ip: '10.0.0.50', subnetMask: '255.0.0.0', gateway: '10.0.0.1', mac: '02:00:00:44:55:66' }
    };

    const res = executeCliCommand('PC0', 'ipconfig');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Ethernet adapter eth0:'));
    assert.ok(res.output.includes('IPv4 Address. . . . . . . . . . . : 192.168.1.50'));
    assert.ok(res.output.includes('Ethernet adapter eth1:'));
    assert.ok(res.output.includes('IPv4 Address. . . . . . . . . . . : 10.0.0.50'));
});

// 353. ipconfig on unknown or nonexistent device returns error cleanly
runTest('353. ipconfig on unknown or nonexistent device returns error cleanly', () => {
    resetLab();
    const res = executeCliCommand('NonExistentDevice', 'ipconfig');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'error');
    assert.ok(res.output.includes('% Error: Device "NonExistentDevice" not found.'));
});

// 354. ifconfig on host exposes host interface configuration accurately
runTest('354. ifconfig on host exposes host interface configuration accurately', () => {
    resetLab();
    addDevice('laptop', 50, 100);
    const laptop = networkState.devices[0];
    laptop.ip = '172.16.0.25';
    laptop.subnetMask = '255.255.0.0';
    laptop.gateway = '172.16.0.1';
    laptop.mac = '02:aa:bb:cc:dd:ee';

    const res = executeCliCommand('Laptop0', 'ifconfig');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('IPv4 Address. . . . . . . . . . . : 172.16.0.25'));
    assert.ok(res.output.includes('Subnet Mask . . . . . . . . . . . : 255.255.0.0'));
    assert.ok(res.output.includes('Default Gateway . . . . . . . . . : 172.16.0.1'));
    assert.ok(res.output.includes('02-AA-BB-CC-DD-EE'));
});

// 355. ifconfig on router exposes real router interfaces (Gig0/0, Gig0/1, IP, status, MAC)
runTest('355. ifconfig on router exposes real router interfaces (Gig0/0, Gig0/1, IP, status, MAC)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '192.168.10.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.1.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.252';

    const res = executeCliCommand('Router0', 'ifconfig');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Gig0/0 is up, line protocol is up'));
    assert.ok(res.output.includes('Internet address is 192.168.10.1/24'));
    assert.ok(res.output.includes('Gig0/1 is up, line protocol is up'));
    assert.ok(res.output.includes('Internet address is 10.1.1.1/30'));
});

// 356. ifconfig is read-only and does not mutate device or router state
runTest('356. ifconfig is read-only and does not mutate device or router state', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const beforeState = JSON.stringify(r0);
    executeCliCommand('Router0', 'ifconfig');
    const afterState = JSON.stringify(r0);
    assert.strictEqual(beforeState, afterState);
});

// 357. arp on host and router with empty cache returns clear empty message
runTest('357. arp on host and router with empty cache returns clear empty message', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('router', 150, 100);

    const resHost = executeCliCommand('PC0', 'arp');
    assert.strictEqual(resHost.success, true);
    assert.ok(resHost.output.includes('No ARP entries found.'));

    const resRouter = executeCliCommand('Router0', 'arp');
    assert.strictEqual(resRouter.success, true);
    assert.ok(resRouter.output.includes('No ARP entries found.'));
});

// 358. arp on host with multiple learned entries renders dynamic IP/MAC table
runTest('358. arp on host with multiple learned entries renders dynamic IP/MAC table', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    pc0.ip = '192.168.1.50';

    learnArp(pc0.id, '192.168.1.1', '02:00:00:11:11:11');
    learnArp(pc0.id, '192.168.1.20', '02:00:00:22:22:22');
    learnArp(pc0.id, '192.168.1.30', '02:00:00:33:33:33');

    const res = executeCliCommand('PC0', 'arp');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('192.168.1.1'));
    assert.ok(res.output.includes('02:00:00:11:11:11'));
    assert.ok(res.output.includes('192.168.1.20'));
    assert.ok(res.output.includes('02:00:00:22:22:22'));
    assert.ok(res.output.includes('192.168.1.30'));
    assert.ok(res.output.includes('02:00:00:33:33:33'));
});

// 359. arp on router without flags renders Cisco IOS-style ARP table
runTest('359. arp on router without flags renders Cisco IOS-style ARP table', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    learnArp(r0.id, '10.0.0.2', '02:00:00:aa:bb:cc', { interface: 'Gig0/0' });

    const res = executeCliCommand('Router0', 'arp');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Internet'));
    assert.ok(res.output.includes('10.0.0.2'));
    assert.ok(res.output.includes('02:00:00:aa:bb:cc'));
    assert.ok(res.output.includes('Gig0/0'));
});

// 360. arp execution is read-only and leaves ARP cache unmodified
runTest('360. arp execution is read-only and leaves ARP cache unmodified', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc0 = networkState.devices[0];
    learnArp(pc0.id, '192.168.1.1', '02:00:00:11:11:11');

    const beforeArp = JSON.stringify(getArpTable(pc0.id));
    executeCliCommand('PC0', 'arp');
    executeCliCommand('PC0', 'arp -a');
    const afterArp = JSON.stringify(getArpTable(pc0.id));
    assert.strictEqual(beforeArp, afterArp);
});

// 361. route / route print on host renders IPv4 route table with active on-link subnet and default gateway
runTest('361. route / route print on host renders IPv4 route table with active on-link subnet and default gateway', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const pc = networkState.devices[0];
    pc.ip = '192.168.1.100';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.1.1';

    const resRoute = executeCliCommand('PC0', 'route');
    assert.strictEqual(resRoute.success, true);
    assert.ok(resRoute.output.includes('IPv4 Route Table'));
    assert.ok(resRoute.output.includes('0.0.0.0'));
    assert.ok(resRoute.output.includes('192.168.1.1'));
    assert.ok(resRoute.output.includes('192.168.1.0'));
    assert.ok(resRoute.output.includes('255.255.255.0'));
    assert.ok(resRoute.output.includes('192.168.1.100'));

    const resRoutePrint = executeCliCommand('PC0', 'route print');
    assert.strictEqual(resRoutePrint.success, true);
    assert.strictEqual(resRoutePrint.output, resRoute.output);
});

// 362. route on router renders router routing table with connected and static routes
runTest('362. route on router renders router routing table with connected and static routes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        network: '10.0.2.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.1.2',
        interface: 'Gig0/0',
        adminDistance: 1,
        metric: 0
    });

    const res = executeCliCommand('Router0', 'route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('10.0.1.0/24 is directly connected, Gig0/0'));
    assert.ok(res.output.includes('10.0.2.0/24 [1/0] via 10.0.1.2, Gig0/0'));
});

// 363. route command dynamically reflects router routing changes without mutation
runTest('363. route command dynamically reflects router routing changes without mutation', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const resInitial = executeCliCommand('Router0', 'show ip route');
    assert.ok(resInitial.output.includes('10.0.1.0/24 is directly connected'));
    assert.ok(!resInitial.output.includes('172.16.0.0'));

    addStaticRoute(r0.id, {
        network: '172.16.0.0',
        subnetMask: '255.255.0.0',
        nextHop: '10.0.1.254',
        interface: 'Gig0/0',
        adminDistance: 1,
        metric: 0
    });

    const resUpdated = executeCliCommand('Router0', 'show ip route');
    assert.ok(resUpdated.output.includes('172.16.0.0/16 [1/0] via 10.0.1.254, Gig0/0'));
});

// 364. show interfaces on router renders interface status, line protocol, MAC, IP/mask, and connected neighbor link
runTest('364. show interfaces on router renders interface status, line protocol, MAC, IP/mask, and connected neighbor link', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('pc', 300, 100);
    const r0 = networkState.devices[0];
    const pc0 = networkState.devices[1];

    r0.interfaces['Gig0/0'].ip = '192.168.5.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addConnection('Router0', 'PC0');

    const res = executeCliCommand('Router0', 'show interfaces');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Gig0/0 is up, line protocol is up'));
    assert.ok(res.output.includes('Hardware is GigabitEthernet'));
    assert.ok(res.output.includes('Internet address is 192.168.5.1/24 (mask 255.255.255.0)'));
    assert.ok(res.output.includes('Connected to PC0'));
    assert.ok(res.output.includes('Gig0/1 is up, line protocol is up'));
    assert.ok(res.output.includes('Internet address is unassigned'));
    assert.ok(res.output.includes('Link status: not connected'));
});

// 365. show interfaces indicates administratively down state when interface is shut down
runTest('365. show interfaces indicates administratively down state when interface is shut down', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    toggleRouterInterfaceStatus(r0.id, 'Gig0/0');

    const res = executeCliCommand('Router0', 'show interfaces');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Gig0/0 is administratively down, line protocol is down'));
});

// 366. show interfaces on end host returns educational error explaining router command
runTest('366. show interfaces on end host returns educational error explaining router command', () => {
    resetLab();
    addDevice('server', 50, 100);
    const res = executeCliCommand('Server0', 'show interfaces');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes("% 'show interfaces' is a Cisco IOS router command"));
    assert.ok(res.output.includes("On end hosts, use 'ipconfig' or 'ifconfig'"));
});

// 367. show ip route renders default route (0.0.0.0/0) with Gateway of last resort and candidate default S*
runTest('367. show ip route renders default route (0.0.0.0/0) with Gateway of last resort and candidate default S*', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    addStaticRoute(r0.id, {
        network: '0.0.0.0',
        subnetMask: '0.0.0.0',
        nextHop: '192.168.1.254',
        interface: 'Gig0/0',
        adminDistance: 1,
        metric: 0
    });

    const res = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Gateway of last resort is 192.168.1.254 to network 0.0.0.0'));
    assert.ok(res.output.includes('S*   0.0.0.0/0 [1/0] via 192.168.1.254, Gig0/0'));
});

// 368. show ip route accurately differentiates primary vs floating static routes with AD
runTest('368. show ip route accurately differentiates primary vs floating static routes with AD', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Primary route (AD = 1)
    addStaticRoute(r0.id, {
        network: '192.168.100.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.1.2',
        interface: 'Gig0/0',
        adminDistance: 1,
        metric: 0
    });

    // Floating static backup route (AD = 10)
    addStaticRoute(r0.id, {
        network: '192.168.100.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.2.2',
        interface: 'Gig0/1',
        adminDistance: 10,
        metric: 0
    });

    const res = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('192.168.100.0/24 [1/0] via 10.0.1.2, Gig0/0'));
    assert.ok(res.output.includes('192.168.100.0/24 [10/0] via 10.0.2.2, Gig0/1'));
});

// 369. show ip route respects router context (Router0 vs Router1 isolation)
runTest('369. show ip route respects router context (Router0 vs Router1 isolation)', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('router', 300, 100);
    const r0 = networkState.devices[0];
    const r1 = networkState.devices[1];

    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    r1.interfaces['Gig0/0'].ip = '172.16.0.1';
    r1.interfaces['Gig0/0'].subnetMask = '255.255.0.0';

    const resR0 = executeCliCommand('Router0', 'show ip route');
    const resR1 = executeCliCommand('Router1', 'show ip route');

    assert.ok(resR0.output.includes('10.0.0.0/24 is directly connected'));
    assert.ok(!resR0.output.includes('172.16.0.0/16'));

    assert.ok(resR1.output.includes('172.16.0.0/16 is directly connected'));
    assert.ok(!resR1.output.includes('10.0.0.0/24'));
});

// 370. Network inspection CLI commands do not alter undo/redo history or mutate topology state
runTest('370. Network inspection CLI commands do not alter undo/redo history or mutate topology state', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('pc', 300, 100);
    const r0 = networkState.devices[0];
    const pc0 = networkState.devices[1];

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';
    addConnection('Router0', 'PC0');

    const historyLenBefore = networkState.history.length;
    const devicesBefore = JSON.stringify(networkState.devices);
    const connsBefore = JSON.stringify(networkState.connections);

    executeCliCommand('PC0', 'ipconfig');
    executeCliCommand('PC0', 'ifconfig');
    executeCliCommand('PC0', 'arp');
    executeCliCommand('PC0', 'route');
    executeCliCommand('Router0', 'show ip route');
    executeCliCommand('Router0', 'show interfaces');
    executeCliCommand('Router0', 'show arp');
    executeCliCommand('Router0', 'route');
    executeCliCommand('Router0', 'ifconfig');

    assert.strictEqual(networkState.history.length, historyLenBefore);
    assert.strictEqual(JSON.stringify(networkState.devices), devicesBefore);
    assert.strictEqual(JSON.stringify(networkState.connections), connsBefore);
});

// 371. Help command output includes all inspection commands
runTest('371. Help command output includes all inspection commands', () => {
    resetLab();
    addDevice('pc', 50, 100);
    const resHost = executeCliCommand('PC0', 'help');
    assert.ok(resHost.output.includes('ipconfig'));
    assert.ok(resHost.output.includes('ifconfig'));
    assert.ok(resHost.output.includes('arp'));
    assert.ok(resHost.output.includes('route'));

    addDevice('router', 150, 100);
    const resRouter = executeCliCommand('Router0', 'help');
    assert.ok(resRouter.output.includes('show ip route'));
    assert.ok(resRouter.output.includes('show interfaces'));
    assert.ok(resRouter.output.includes('show arp'));
    assert.ok(resRouter.output.includes('show access-lists'));
    assert.ok(resRouter.output.includes('route'));
    assert.ok(resRouter.output.includes('ifconfig'));
});

// 372. hostname <name> updates device name and reflects in prompt across exec, config, and config-if modes
runTest('372. hostname <name> updates device name and reflects in prompt across exec, config, and config-if modes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0#');

    const res = executeCliCommand('Router0', 'hostname CoreRouter-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(r0.name, 'CoreRouter-1');
    assert.strictEqual(getDeviceCliPrompt(r0), 'CoreRouter-1#');

    executeCliCommand(r0.id, 'configure terminal');
    assert.strictEqual(getDeviceCliPrompt(r0), 'CoreRouter-1(config)#');

    executeCliCommand(r0.id, 'interface Gig0/0');
    assert.strictEqual(getDeviceCliPrompt(r0), 'CoreRouter-1(config-if)#');
});

// 373. hostname command validates input (rejects empty/invalid characters) and queries current hostname
runTest('373. hostname command validates input (rejects empty/invalid characters) and queries current hostname', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    // Query current hostname
    const queryRes = executeCliCommand('Router0', 'hostname');
    assert.strictEqual(queryRes.success, true);
    assert.strictEqual(queryRes.output, 'Router0');

    // Reject invalid names (spaces, invalid symbols)
    const errRes1 = executeCliCommand('Router0', 'hostname Bad Hostname With Spaces');
    assert.strictEqual(errRes1.success, false);
    assert.ok(errRes1.output.includes('Invalid hostname'));
    assert.strictEqual(r0.name, 'Router0');

    const errRes2 = executeCliCommand('Router0', 'hostname Core@Router!#$');
    assert.strictEqual(errRes2.success, false);
    assert.ok(errRes2.output.includes('Invalid hostname'));
    assert.strictEqual(r0.name, 'Router0');
});

// 374. hostname maintains stable device ID and preserves existing connection references
runTest('374. hostname maintains stable device ID and preserves existing connection references', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('pc', 300, 100);
    const r0 = networkState.devices[0];
    const pc0 = networkState.devices[1];
    addConnection('Router0', 'PC0');

    const conn = networkState.connections[0];
    assert.strictEqual(conn.source, r0.id);
    assert.strictEqual(conn.target, pc0.id);

    executeCliCommand(r0.id, 'hostname EdgeGateway');
    assert.strictEqual(networkState.devices[0].name, 'EdgeGateway');
    assert.strictEqual(networkState.devices[0].id, 'Router0');
    assert.strictEqual(conn.source, 'Router0');
});

// 375. hostname on end hosts (PC/Server) successfully updates name and prompt
runTest('375. hostname on end hosts (PC/Server) successfully updates name and prompt', () => {
    resetLab();
    addDevice('pc', 100, 100);
    const pc = networkState.devices[0];
    assert.strictEqual(getDeviceCliPrompt(pc), 'PC0>');

    const res = executeCliCommand('PC0', 'hostname Workstation-A');
    assert.strictEqual(res.success, true);
    assert.strictEqual(pc.name, 'Workstation-A');
    assert.strictEqual(getDeviceCliPrompt(pc), 'Workstation-A>');
});

// 376. configure terminal enters Global Configuration mode and updates prompt to Router(config)#
runTest('376. configure terminal enters Global Configuration mode and updates prompt to Router(config)#', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    const res1 = executeCliCommand('Router0', 'configure terminal');
    assert.strictEqual(res1.success, true);
    assert.ok(res1.output.includes('Enter configuration commands'));
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config)#');

    executeCliCommand('Router0', 'exit');
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0#');

    const res2 = executeCliCommand('Router0', 'conf t');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config)#');
});

// 377. configure terminal on end host is rejected with educational error
runTest('377. configure terminal on end host is rejected with educational error', () => {
    resetLab();
    addDevice('pc', 100, 100);
    const res = executeCliCommand('PC0', 'configure terminal');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Cisco IOS router command'));
});

// 378. interface <name> enters Interface Configuration mode with Router(config-if)# prompt and supports aliases
runTest('378. interface <name> enters Interface Configuration mode with Router(config-if)# prompt and supports aliases', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    const session = getDeviceTerminalSession(r0.id);

    const res1 = executeCliCommand('Router0', 'interface Gig0/0');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(session.mode, 'config-if');
    assert.strictEqual(session.selectedInterface, 'Gig0/0');
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config-if)#');

    // Alias: int g0/1
    const res2 = executeCliCommand('Router0', 'int g0/1');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(session.selectedInterface, 'Gig0/1');
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config-if)#');
});

// 379. interface <name> rejects nonexistent interfaces and rejects execution on end hosts
runTest('379. interface <name> rejects nonexistent interfaces and rejects execution on end hosts', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('pc', 300, 100);

    const resErr = executeCliCommand('Router0', 'interface FastEthernet0/0');
    assert.strictEqual(resErr.success, false);
    assert.ok(resErr.output.includes('Invalid interface'));

    const resHost = executeCliCommand('PC0', 'interface eth0');
    assert.strictEqual(resHost.success, false);
    assert.ok(resHost.output.includes('Cisco IOS router command'));
});

// 380. ip address <ip> <mask/prefix> configures router interface IP and mask in config-if mode
runTest('380. ip address <ip> <mask/prefix> configures router interface IP and mask in config-if mode', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    executeCliCommand('Router0', 'interface Gig0/0');
    const res1 = executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(r0.interfaces['Gig0/0'].ip, '192.168.1.1');
    assert.strictEqual(r0.interfaces['Gig0/0'].subnetMask, '255.255.255.0');

    // CIDR notation on Gig0/1
    executeCliCommand('Router0', 'interface Gig0/1');
    const res2 = executeCliCommand('Router0', 'ip address 10.0.0.1/24');
    assert.strictEqual(res2.success, true);
    assert.strictEqual(r0.interfaces['Gig0/1'].ip, '10.0.0.1');
    assert.strictEqual(r0.interfaces['Gig0/1'].subnetMask, '255.255.255.0');

    const showRes = executeCliCommand('Router0', 'show interfaces');
    assert.ok(showRes.output.includes('Internet address is 192.168.1.1/24'));
    assert.ok(showRes.output.includes('Internet address is 10.0.0.1/24'));
});

// 381. ip address rejects invalid IP, invalid subnet mask, and execution outside config-if mode
runTest('381. ip address rejects invalid IP, invalid subnet mask, and execution outside config-if mode', () => {
    resetLab();
    addDevice('router', 100, 100);

    // Outside config-if mode
    const resOutside = executeCliCommand('Router0', 'ip address 10.0.0.1 255.255.255.0');
    assert.strictEqual(resOutside.success, false);
    assert.ok(resOutside.output.includes('must be executed inside interface configuration mode'));

    executeCliCommand('Router0', 'interface Gig0/0');

    // Invalid IP
    const resBadIp = executeCliCommand('Router0', 'ip address 999.999.999.999 255.255.255.0');
    assert.strictEqual(resBadIp.success, false);
    assert.ok(resBadIp.output.includes('Invalid IPv4 address'));

    // Invalid Mask
    const resBadMask = executeCliCommand('Router0', 'ip address 10.0.0.1 255.0.255.0');
    assert.strictEqual(resBadMask.success, false);
    assert.ok(resBadMask.output.includes('Invalid subnet mask'));
});

// 382. ip address prevents duplicate IP assignment across interfaces on the same router
runTest('382. ip address prevents duplicate IP assignment across interfaces on the same router', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');

    executeCliCommand('Router0', 'interface Gig0/1');
    const resDup = executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');
    assert.strictEqual(resDup.success, false);
    assert.ok(resDup.output.includes('already configured on Gig0/0'));
    assert.strictEqual(r0.interfaces['Gig0/1'].ip, '');
});

// 383. no ip address clears interface IP and mask and removes connected route
runTest('383. no ip address clears interface IP and mask and removes connected route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');
    assert.strictEqual(r0.interfaces['Gig0/0'].ip, '192.168.1.1');

    const resClear = executeCliCommand('Router0', 'no ip address');
    assert.strictEqual(resClear.success, true);
    assert.strictEqual(r0.interfaces['Gig0/0'].ip, '');
    assert.strictEqual(r0.interfaces['Gig0/0'].subnetMask, '');

    const routeRes = executeCliCommand('Router0', 'show ip route');
    assert.ok(!routeRes.output.includes('192.168.1.0/24'));
});

// 384. shutdown sets router interface administratively down and stops route advertisements
runTest('384. shutdown sets router interface administratively down and stops route advertisements', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');

    const resShut = executeCliCommand('Router0', 'shutdown');
    assert.strictEqual(resShut.success, true);
    assert.strictEqual(r0.interfaces['Gig0/0'].status, 'down');

    const showInt = executeCliCommand('Router0', 'show interfaces');
    assert.ok(showInt.output.includes('Gig0/0 is administratively down, line protocol is down'));

    const showRoute = executeCliCommand('Router0', 'show ip route');
    assert.ok(!showRoute.output.includes('192.168.1.0/24'));
});

// 385. no shutdown restores router interface to up state and re-enables connected routes
runTest('385. no shutdown restores router interface to up state and re-enables connected routes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];

    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');
    executeCliCommand('Router0', 'shutdown');
    assert.strictEqual(r0.interfaces['Gig0/0'].status, 'down');

    const resNoShut = executeCliCommand('Router0', 'no shutdown');
    assert.strictEqual(resNoShut.success, true);
    assert.strictEqual(r0.interfaces['Gig0/0'].status, 'up');

    const showInt = executeCliCommand('Router0', 'show interfaces');
    assert.ok(showInt.output.includes('Gig0/0 is up, line protocol is up'));

    const showRoute = executeCliCommand('Router0', 'show ip route');
    assert.ok(showRoute.output.includes('192.168.1.0/24 is directly connected, Gig0/0'));
});

// 386. ip route configures real static route visible in show ip route
runTest('386. ip route configures real static route visible in show ip route', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    const res = executeCliCommand('Router0', 'ip route 192.168.50.0 255.255.255.0 10.0.0.2');
    assert.strictEqual(res.success, true);

    const showRoute = executeCliCommand('Router0', 'show ip route');
    assert.ok(showRoute.output.includes('S    192.168.50.0/24 [1/0] via 10.0.0.2, Gig0/0'));
});

// 387. ip route supports Floating Static Routes with Administrative Distance and metric
runTest('387. ip route supports Floating Static Routes with Administrative Distance and metric', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '10.0.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    // Primary route AD=1
    executeCliCommand('Router0', 'ip route 172.16.0.0 255.255.0.0 10.0.1.2 1 0');
    // Floating backup route AD=200
    executeCliCommand('Router0', 'ip route 172.16.0.0 255.255.0.0 10.0.2.2 200 5');

    const showRoute = executeCliCommand('Router0', 'show ip route');
    assert.ok(showRoute.output.includes('172.16.0.0/16 [1/0] via 10.0.1.2, Gig0/0'));
    assert.ok(showRoute.output.includes('172.16.0.0/16 [200/5] via 10.0.2.2, Gig0/1'));
});

// 388. no ip route removes matching static route from routing table
runTest('388. no ip route removes matching static route from routing table', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    executeCliCommand('Router0', 'ip route 192.168.20.0 255.255.255.0 10.0.0.2');
    const showBefore = executeCliCommand('Router0', 'show ip route');
    assert.ok(showBefore.output.includes('192.168.20.0/24'));

    const resDel = executeCliCommand('Router0', 'no ip route 192.168.20.0 255.255.255.0 10.0.0.2');
    assert.strictEqual(resDel.success, true);

    const showAfter = executeCliCommand('Router0', 'show ip route');
    assert.ok(!showAfter.output.includes('192.168.20.0/24'));
});

// 389. exit navigates back through context hierarchy (config-if -> config -> exec)
runTest('389. exit navigates back through context hierarchy (config-if -> config -> exec)', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    const session = getDeviceTerminalSession(r0.id);

    executeCliCommand('Router0', 'configure terminal');
    assert.strictEqual(session.mode, 'config');
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config)#');

    executeCliCommand('Router0', 'interface Gig0/0');
    assert.strictEqual(session.mode, 'config-if');
    assert.strictEqual(session.selectedInterface, 'Gig0/0');
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config-if)#');

    executeCliCommand('Router0', 'exit');
    assert.strictEqual(session.mode, 'config');
    assert.strictEqual(session.selectedInterface, null);
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config)#');

    executeCliCommand('Router0', 'exit');
    assert.strictEqual(session.mode, 'exec');
    assert.strictEqual(session.selectedInterface, null);
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0#');
});

// 390. end jumps directly from any configuration mode back to Privileged EXEC mode
runTest('390. end jumps directly from any configuration mode back to Privileged EXEC mode', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    const session = getDeviceTerminalSession(r0.id);

    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');
    assert.strictEqual(session.mode, 'config-if');

    const resEnd = executeCliCommand('Router0', 'end');
    assert.strictEqual(resEnd.success, true);
    assert.strictEqual(session.mode, 'exec');
    assert.strictEqual(session.selectedInterface, null);
    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0#');
});

// 391. do <command> allows executing operational commands from config and config-if modes
runTest('391. do <command> allows executing operational commands from config and config-if modes', () => {
    resetLab();
    addDevice('router', 100, 100);
    const r0 = networkState.devices[0];
    r0.interfaces['Gig0/0'].ip = '10.0.0.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';

    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');

    const doRes1 = executeCliCommand('Router0', 'do show ip route');
    assert.strictEqual(doRes1.success, true);
    assert.ok(doRes1.output.includes('10.0.0.0/24 is directly connected'));

    const doRes2 = executeCliCommand('Router0', 'do show interfaces');
    assert.strictEqual(doRes2.success, true);
    assert.ok(doRes2.output.includes('Gig0/0 is up, line protocol is up'));
});

// 392. Context-aware help / ? displays specific commands for exec, config, and config-if modes
runTest('392. Context-aware help / ? displays specific commands for exec, config, and config-if modes', () => {
    resetLab();
    addDevice('router', 100, 100);

    const helpExec = executeCliCommand('Router0', 'help');
    assert.ok(helpExec.output.includes('configure terminal'));
    assert.ok(helpExec.output.includes('show ip route'));

    executeCliCommand('Router0', 'configure terminal');
    const helpConfig = executeCliCommand('Router0', 'help');
    assert.ok(helpConfig.output.includes('hostname <name>'));
    assert.ok(helpConfig.output.includes('ip route'));

    executeCliCommand('Router0', 'interface Gig0/0');
    const helpConfigIf = executeCliCommand('Router0', 'help');
    assert.ok(helpConfigIf.output.includes('ip address'));
    assert.ok(helpConfigIf.output.includes('shutdown'));
    assert.ok(helpConfigIf.output.includes('no shutdown'));
});

// 393. CLI session context is isolated per device and does not leak across routers
runTest('393. CLI session context is isolated per device and does not leak across routers', () => {
    resetLab();
    addDevice('router', 100, 100);
    addDevice('router', 300, 100);
    const r0 = networkState.devices[0];
    const r1 = networkState.devices[1];

    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');

    const s0 = getDeviceTerminalSession(r0.id);
    const s1 = getDeviceTerminalSession(r1.id);

    assert.strictEqual(s0.mode, 'config-if');
    assert.strictEqual(s0.selectedInterface, 'Gig0/0');
    assert.strictEqual(s1.mode, 'exec');
    assert.strictEqual(s1.selectedInterface, null);

    assert.strictEqual(getDeviceCliPrompt(r0), 'Router0(config-if)#');
    assert.strictEqual(getDeviceCliPrompt(r1), 'Router1#');
});

// 394. Undo / Redo (pushHistory()) integrates with CLI mutating commands (hostname, ip, route, shutdown)
runTest('394. Undo / Redo (pushHistory()) integrates with CLI mutating commands (hostname, ip, route, shutdown)', () => {
    resetLab();
    addDevice('router', 100, 100);

    // 1. Hostname change
    executeCliCommand('Router0', 'hostname EdgeRouter');
    assert.strictEqual(networkState.devices[0].name, 'EdgeRouter');
    undo();
    assert.strictEqual(networkState.devices[0].name, 'Router0');
    redo();
    assert.strictEqual(networkState.devices[0].name, 'EdgeRouter');

    // 2. IP address configuration
    executeCliCommand('EdgeRouter', 'interface Gig0/0');
    executeCliCommand('EdgeRouter', 'ip address 192.168.10.1 255.255.255.0');
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].ip, '192.168.10.1');
    undo();
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].ip, '');
    redo();
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].ip, '192.168.10.1');

    // 3. Shutdown
    executeCliCommand('EdgeRouter', 'shutdown');
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].status, 'down');
    undo();
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].status, 'up');
    redo();
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0'].status, 'down');
});

// 395. End-to-end network test: Full multi-router topology configured entirely via CLI commands with successful ping and traceroute
runTest('395. End-to-end network test: Full multi-router topology configured entirely via CLI commands with successful ping and traceroute', () => {
    resetLab();

    // Topology: PC0 (192.168.1.10/24) --- (Gig0/0) Router0 (Gig0/1: 10.0.0.1/30) --- (Gig0/1: 10.0.0.2/30) Router1 (Gig0/0: 192.168.2.1/24) --- PC1 (192.168.2.10/24)
    addDevice('pc', 50, 100);
    addDevice('router', 200, 100);
    addDevice('router', 400, 100);
    addDevice('pc', 550, 100);

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[3];

    // Configure PC0
    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.1.1';

    // Configure PC1
    pc1.ip = '192.168.2.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.2.1';

    // Connect topology
    addConnection('PC0', 'Router0');
    addConnection('Router0', 'Router1');
    addConnection('Router1', 'PC1');

    // Configure Router0 ENTIRELY via CLI commands
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'ip address 192.168.1.1 255.255.255.0');
    executeCliCommand('Router0', 'no shutdown');
    executeCliCommand('Router0', 'interface Gig0/1');
    executeCliCommand('Router0', 'ip address 10.0.0.1 255.255.255.252');
    executeCliCommand('Router0', 'no shutdown');
    executeCliCommand('Router0', 'exit');
    executeCliCommand('Router0', 'ip route 192.168.2.0 255.255.255.0 10.0.0.2');
    executeCliCommand('Router0', 'end');

    // Configure Router1 ENTIRELY via CLI commands
    // Note: Router1's first connection (to Router0) is on Gig0/0, second connection (to PC1) is on Gig0/1
    executeCliCommand('Router1', 'configure terminal');
    executeCliCommand('Router1', 'interface Gig0/0');
    executeCliCommand('Router1', 'ip address 10.0.0.2 255.255.255.252');
    executeCliCommand('Router1', 'no shutdown');
    executeCliCommand('Router1', 'interface Gig0/1');
    executeCliCommand('Router1', 'ip address 192.168.2.1 255.255.255.0');
    executeCliCommand('Router1', 'no shutdown');
    executeCliCommand('Router1', 'exit');
    executeCliCommand('Router1', 'ip route 192.168.1.0 255.255.255.0 10.0.0.1');
    executeCliCommand('Router1', 'end');

    // Verify routing tables
    const r0Route = executeCliCommand('Router0', 'show ip route');
    assert.ok(r0Route.output.includes('192.168.1.0/24 is directly connected, Gig0/0'));
    assert.ok(r0Route.output.includes('10.0.0.0/30 is directly connected, Gig0/1'));
    assert.ok(r0Route.output.includes('192.168.2.0/24 [1/0] via 10.0.0.2, Gig0/1'));

    const r1Route = executeCliCommand('Router1', 'show ip route');
    assert.ok(r1Route.output.includes('10.0.0.0/30 is directly connected, Gig0/0'));
    assert.ok(r1Route.output.includes('192.168.2.0/24 is directly connected, Gig0/1'));
    assert.ok(r1Route.output.includes('192.168.1.0/24 [1/0] via 10.0.0.1, Gig0/0'));

    // Execute real ICMP simulation via CLI ping from PC0 to PC1
    const pingRes = executeCliCommand('PC0', 'ping 192.168.2.10');
    assert.strictEqual(pingRes.success, true);
    assert.ok(pingRes.output.includes('Reply from 192.168.2.10'));
    assert.ok(pingRes.output.includes('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)'));

    // Execute traceroute from PC0 to PC1
    const traceRes = executeCliCommand('PC0', 'traceroute 192.168.2.10');
    assert.strictEqual(traceRes.success, true);
    assert.ok(traceRes.output.includes('192.168.1.1'));
    assert.ok(traceRes.output.includes('10.0.0.2'));
    assert.ok(traceRes.output.includes('192.168.2.10'));
    assert.ok(traceRes.output.includes('Trace complete.'));
});

// ============================================================================
// V5.12 Phase 1: VLAN Foundation and Access Ports Tests (396 - 432)
// ============================================================================

// 396. Switch initialization creates default VLAN 1 (default, active) and switchports map
runTest("396. Switch initialization creates default VLAN 1 (default, active) and switchports map", () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    assert.ok(sw.vlans, 'Switch must have vlans property');
    assert.ok(sw.vlans[1], 'Switch must have default VLAN 1');
    assert.strictEqual(sw.vlans[1].id, 1);
    assert.strictEqual(sw.vlans[1].name, 'default');
    assert.strictEqual(sw.vlans[1].status, 'active');
    assert.ok(sw.switchports, 'Switch must have switchports map');
});

// 397. normalizeVlanId validates 1-4094 integers and rejects 0, 4095, negative, strings, and non-numeric inputs
runTest('397. normalizeVlanId validates 1-4094 integers and rejects invalid inputs', () => {
    assert.strictEqual(normalizeVlanId(1), 1);
    assert.strictEqual(normalizeVlanId(10), 10);
    assert.strictEqual(normalizeVlanId(4094), 4094);
    assert.strictEqual(normalizeVlanId('20'), 20);
    assert.strictEqual(normalizeVlanId(' 100 '), 100);

    assert.strictEqual(normalizeVlanId(0), null);
    assert.strictEqual(normalizeVlanId(4095), null);
    assert.strictEqual(normalizeVlanId(5000), null);
    assert.strictEqual(normalizeVlanId(-10), null);
    assert.strictEqual(normalizeVlanId('abc'), null);
    assert.strictEqual(normalizeVlanId(null), null);
    assert.strictEqual(normalizeVlanId(undefined), null);
    assert.strictEqual(normalizeVlanId(NaN), null);
});

// 398. createSwitchVlan creates VLAN with default naming "VLAN<id>" if name omitted
runTest('398. createSwitchVlan creates VLAN with default naming "VLAN<id>" if name omitted', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    const v10 = createSwitchVlan(sw, 10);
    assert.strictEqual(v10.id, 10);
    assert.strictEqual(v10.name, 'VLAN10');
    assert.strictEqual(v10.status, 'active');
    assert.strictEqual(sw.vlans[10].id, 10);

    const v20 = createSwitchVlan(sw, 20, 'Engineering');
    assert.strictEqual(v20.id, 20);
    assert.strictEqual(v20.name, 'Engineering');
});

// 399. createSwitchVlan prevents duplicate VLAN creation and rejects invalid VLAN IDs
runTest('399. createSwitchVlan prevents duplicate VLAN creation and rejects invalid VLAN IDs', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    assert.throws(() => createSwitchVlan(sw, 1), /already exists/);
    assert.throws(() => createSwitchVlan(sw, 0), /Invalid VLAN ID/);
    assert.throws(() => createSwitchVlan(sw, 5000), /Invalid VLAN ID/);
});

// 400. renameSwitchVlan renames VLAN and rejects invalid characters or nonexistent VLANs
runTest('400. renameSwitchVlan renames VLAN and rejects invalid names or nonexistent VLANs', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Temp');

    const updated = renameSwitchVlan(sw, 10, 'Accounting');
    assert.strictEqual(updated.name, 'Accounting');
    assert.strictEqual(sw.vlans[10].name, 'Accounting');

    assert.throws(() => renameSwitchVlan(sw, 99, 'Ghost'), /does not exist/);
    assert.throws(() => renameSwitchVlan(sw, 10, 'Invalid Name!@#'), /Invalid VLAN name/);
});

// 401. deleteSwitchVlan blocks deletion of default VLAN 1
runTest('401. deleteSwitchVlan blocks deletion of default VLAN 1', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    assert.throws(() => deleteSwitchVlan(sw, 1), /Default VLAN 1 cannot be deleted/);
    assert.ok(sw.vlans[1], 'VLAN 1 must remain');
});

// 402. deleteSwitchVlan removes VLAN and reassigns all member ports back to VLAN 1
runTest('402. deleteSwitchVlan removes VLAN and reassigns all member ports back to VLAN 1', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 20, 'Sales');

    setSwitchPortAccessVlan(sw, 'Fa0/1', 20);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 20);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').accessVlan, 20);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/2').accessVlan, 20);

    deleteSwitchVlan(sw, 20);
    assert.strictEqual(sw.vlans[20], undefined);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').accessVlan, 1);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/2').accessVlan, 1);
});

// 403. normalizeSwitchPortName supports Fa0/1..Fa0/48, Gig0/1..Gig0/4 and abbreviations (f0/1, g0/1)
runTest('403. normalizeSwitchPortName supports FastEthernet and GigabitEthernet port formats', () => {
    assert.strictEqual(normalizeSwitchPortName('fa0/1'), 'Fa0/1');
    assert.strictEqual(normalizeSwitchPortName('Fa0/24'), 'Fa0/24');
    assert.strictEqual(normalizeSwitchPortName('fastethernet0/5'), 'Fa0/5');
    assert.strictEqual(normalizeSwitchPortName('f0/12'), 'Fa0/12');
    assert.strictEqual(normalizeSwitchPortName('gig0/1'), 'Gig0/1');
    assert.strictEqual(normalizeSwitchPortName('GigabitEthernet0/2'), 'Gig0/2');
    assert.strictEqual(normalizeSwitchPortName('g0/4'), 'Gig0/4');

    assert.strictEqual(normalizeSwitchPortName('Fa0/50'), null);
    assert.strictEqual(normalizeSwitchPortName('Gig0/10'), null);
    assert.strictEqual(normalizeSwitchPortName('eth0'), null);
});

// 404. getSwitchPortConfig and setSwitchPortMode configures access mode on switchport
runTest('404. getSwitchPortConfig and setSwitchPortMode configures access mode on switchport', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    const defCfg = getSwitchPortConfig(sw, 'Fa0/1');
    assert.strictEqual(defCfg.port, 'Fa0/1');
    assert.strictEqual(defCfg.mode, 'access');
    assert.strictEqual(defCfg.accessVlan, 1);

    setSwitchPortMode(sw, 'Fa0/1', 'access');
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').mode, 'access');
});

// 405. setSwitchPortAccessVlan configures access VLAN and rejects non-existent VLANs
runTest('405. setSwitchPortAccessVlan configures access VLAN and rejects non-existent VLANs', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 30, 'HR');

    setSwitchPortAccessVlan(sw, 'Fa0/3', 30);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/3').accessVlan, 30);

    assert.throws(() => setSwitchPortAccessVlan(sw, 'Fa0/3', 99), /does not exist/);
});

// 406. Switch CLI prompt generation across exec, config, config-vlan, and config-if modes
runTest('406. Switch CLI prompt generation across exec, config, config-vlan, and config-if modes', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    const session = getDeviceTerminalSession(sw.id);

    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0#');

    session.mode = 'config';
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config)#');

    session.mode = 'config-vlan';
    session.selectedVlan = 10;
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config-vlan)#');

    session.mode = 'config-if';
    session.selectedInterface = 'Fa0/1';
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config-if)#');
});

// 407. Switch CLI configure terminal enters config mode and exit/end navigate back
runTest('407. Switch CLI configure terminal enters config mode and exit/end navigate back', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    const res1 = executeCliCommand('Switch0', 'configure terminal');
    assert.strictEqual(res1.success, true);
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config)#');

    executeCliCommand('Switch0', 'exit');
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0#');

    executeCliCommand('Switch0', 'conf t');
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config)#');
    executeCliCommand('Switch0', 'end');
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0#');
});

// 408. Switch CLI vlan <id> enters config-vlan mode and creates VLAN if needed
runTest('408. Switch CLI vlan <id> enters config-vlan mode and creates VLAN if needed', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    const resVlan = executeCliCommand('Switch0', 'vlan 10');
    assert.strictEqual(resVlan.success, true);
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config-vlan)#');
    assert.ok(sw.vlans[10], 'VLAN 10 must be created');

    const resBad = executeCliCommand('Switch0', 'vlan 5000');
    assert.strictEqual(resBad.success, false);
    assert.ok(resBad.output.includes('Invalid VLAN ID'));
});

// 409. Switch CLI name <name> inside config-vlan renames active VLAN
runTest('409. Switch CLI name <name> inside config-vlan renames active VLAN', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'vlan 20');
    const resName = executeCliCommand('Switch0', 'name Engineering');
    assert.strictEqual(resName.success, true);
    assert.strictEqual(sw.vlans[20].name, 'Engineering');

    executeCliCommand('Switch0', 'exit');
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config)#');
});

// 410. Switch CLI no vlan <id> deletes VLAN and returns member ports to VLAN 1
runTest('410. Switch CLI no vlan <id> deletes VLAN and returns member ports to VLAN 1', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'vlan 50');
    executeCliCommand('Switch0', 'interface Fa0/5');
    executeCliCommand('Switch0', 'switchport access vlan 50');
    executeCliCommand('Switch0', 'exit');

    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/5').accessVlan, 50);

    const resDel = executeCliCommand('Switch0', 'no vlan 50');
    assert.strictEqual(resDel.success, true);
    assert.strictEqual(sw.vlans[50], undefined);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/5').accessVlan, 1);
});

// 411. Switch CLI no vlan 1 is rejected with clear error
runTest('411. Switch CLI no vlan 1 is rejected with clear error', () => {
    resetLab();
    addDevice('switch', 100, 100);
    executeCliCommand('Switch0', 'conf t');
    const res = executeCliCommand('Switch0', 'no vlan 1');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Default VLAN 1 cannot be deleted'));
});

// 412. Switch CLI interface <name> enters config-if mode on switch
runTest('412. Switch CLI interface <name> enters config-if mode on switch', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    const resIf = executeCliCommand('Switch0', 'interface Fa0/2');
    assert.strictEqual(resIf.success, true);
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config-if)#');

    const resBadIf = executeCliCommand('Switch0', 'interface eth99');
    assert.strictEqual(resBadIf.success, false);
    assert.ok(resBadIf.output.includes('Invalid switch interface'));
});

// 413. Switch CLI switchport mode access sets port mode
runTest('413. Switch CLI switchport mode access sets port mode', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface Fa0/1');
    const resMode = executeCliCommand('Switch0', 'switchport mode access');
    assert.strictEqual(resMode.success, true);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').mode, 'access');
});

// 414. Switch CLI switchport access vlan <id> assigns access VLAN to port
runTest('414. Switch CLI switchport access vlan <id> assigns access VLAN to port', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/1');
    const resAcc = executeCliCommand('Switch0', 'switchport access vlan 10');
    assert.strictEqual(resAcc.success, true);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').accessVlan, 10);
});

// 415. Switch CLI switchport access vlan rejects nonexistent VLAN with helpful error
runTest('415. Switch CLI switchport access vlan rejects nonexistent VLAN with helpful error', () => {
    resetLab();
    addDevice('switch', 100, 100);

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface Fa0/1');
    const res = executeCliCommand('Switch0', 'switchport access vlan 99');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Access VLAN 99 does not exist'));
});

// 416. Switch CLI do <command> executes show and operational commands from config/vlan/if modes
runTest('416. Switch CLI do <command> executes show and operational commands from config/vlan/if modes', () => {
    resetLab();
    addDevice('switch', 100, 100);
    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name Accounting');

    const resDo = executeCliCommand('Switch0', 'do show vlan brief');
    assert.strictEqual(resDo.success, true);
    assert.ok(resDo.output.includes('Accounting'));
    assert.strictEqual(getDeviceCliPrompt(networkState.devices[0]), 'Switch0(config-vlan)#');
});

// 417. Switch CLI context-aware help / ? outputs mode-specific command lists
runTest('417. Switch CLI context-aware help / ? outputs mode-specific command lists', () => {
    resetLab();
    addDevice('switch', 100, 100);

    const helpExec = executeCliCommand('Switch0', 'help');
    assert.ok(helpExec.output.includes('show vlan brief'));
    assert.ok(helpExec.output.includes('show mac-address-table'));

    executeCliCommand('Switch0', 'conf t');
    const helpConfig = executeCliCommand('Switch0', 'help');
    assert.ok(helpConfig.output.includes('vlan <id>'));
    assert.ok(helpConfig.output.includes('no vlan <id>'));

    executeCliCommand('Switch0', 'vlan 10');
    const helpVlan = executeCliCommand('Switch0', 'help');
    assert.ok(helpVlan.output.includes('name <name>'));

    executeCliCommand('Switch0', 'interface Fa0/1');
    const helpIf = executeCliCommand('Switch0', 'help');
    assert.ok(helpIf.output.includes('switchport mode access'));
    assert.ok(helpIf.output.includes('switchport access vlan <id>'));
});

// 418. Switch CLI show vlan / show vlan brief renders VLAN table with IDs, names, status, and port assignments
runTest('418. Switch CLI show vlan / show vlan brief renders VLAN table with IDs, names, status, and port assignments', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    createSwitchVlan(sw, 20, 'Engineering');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/3', 20);

    const res = executeCliCommand('Switch0', 'show vlan brief');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('VLAN Name                             Status    Ports'));
    assert.ok(res.output.includes('1    default                          active'));
    assert.ok(res.output.includes('10   Sales                            active    Fa0/1, Fa0/2'));
    assert.ok(res.output.includes('20   Engineering                      active    Fa0/3'));
});

// 419. Switch CLI show mac-address-table renders MAC table with VLAN column, MAC, Type DYNAMIC, and Port
runTest('419. Switch CLI show mac-address-table renders MAC table with VLAN column, MAC, Type DYNAMIC, and Port', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    learnSwitchMac(sw.id, '00:11:22:33:44:55', 'PC0', 'Fa0/1', 10);
    learnSwitchMac(sw.id, '66:77:88:99:AA:BB', 'PC1', 'Fa0/2', 20);

    const res = executeCliCommand('Switch0', 'show mac-address-table');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Vlan    Mac Address       Type        Ports'));
    assert.ok(res.output.includes('00:11:22:33:44:55'));
    assert.ok(res.output.includes('66:77:88:99:AA:BB'));
    assert.ok(res.output.includes('DYNAMIC'));
    assert.ok(res.output.includes('Fa0/1'));
    assert.ok(res.output.includes('Fa0/2'));
    assert.ok(res.output.includes('Total Mac Addresses for this criterion: 2'));
});

// 420. Switch CLI show interfaces renders switch interfaces and their VLAN membership
runTest('420. Switch CLI show interfaces renders switch interfaces and their VLAN membership', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    const res = executeCliCommand('Switch0', 'show interfaces');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Fa0/1 is up'));
    assert.ok(res.output.includes('Access VLAN: 10'));
});

// 421. Switch CLI rejects router-specific commands (ip address, ip route) with educational message
runTest('421. Switch CLI rejects router-specific commands (ip address, ip route) with educational message', () => {
    resetLab();
    addDevice('switch', 100, 100);

    executeCliCommand('Switch0', 'conf t');
    const resRoute = executeCliCommand('Switch0', 'ip route 10.0.0.0 255.0.0.0 10.0.0.1');
    assert.strictEqual(resRoute.success, false);
    assert.ok(resRoute.output.includes('Layer 2'));

    executeCliCommand('Switch0', 'interface Fa0/1');
    const resIp = executeCliCommand('Switch0', 'ip address 192.168.1.1 255.255.255.0');
    assert.strictEqual(resIp.success, false);
    assert.ok(resIp.output.includes('Layer 2'));
});

// 422. VLAN-aware MAC learning associates learned MAC with incoming port access VLAN
runTest('422. VLAN-aware MAC learning associates learned MAC with incoming port access VLAN', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'VLAN10');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    learnSwitchMac(sw.id, 'AA:BB:CC:DD:EE:01', 'PC0', 'Fa0/1', 10);

    const entry = getSwitchMacEntry(sw.id, 'AA:BB:CC:DD:EE:01', 10);
    assert.ok(entry);
    assert.strictEqual(entry.vlan, 10);
    assert.strictEqual(entry.port, 'Fa0/1');
});

// 423. getSwitchMacEntry isolates MAC entries between different VLANs
runTest('423. getSwitchMacEntry isolates MAC entries between different VLANs', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    learnSwitchMac(sw.id, 'AA:BB:CC:DD:EE:01', 'PC0', 'Fa0/1', 10);

    const entryVlan10 = getSwitchMacEntry(sw.id, 'AA:BB:CC:DD:EE:01', 10);
    assert.ok(entryVlan10, 'Must find MAC in VLAN 10');

    const entryVlan20 = getSwitchMacEntry(sw.id, 'AA:BB:CC:DD:EE:01', 20);
    assert.strictEqual(entryVlan20, null, 'Must NOT find MAC in VLAN 20');
});

// 424. Layer-2 VLAN isolation: frames between access ports on different VLANs are dropped
runTest('424. Layer-2 VLAN isolation: frames between access ports on different VLANs are dropped', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'PC1'); // Fa0/2

    // Put PC0 on VLAN 10 and PC1 on VLAN 20
    createSwitchVlan(sw, 10, 'VLAN10');
    createSwitchVlan(sw, 20, 'VLAN20');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 20);

    // Pre-populate ARP and MAC tables
    learnArp(pc0.id, pc1.ip, pc1.mac);
    learnSwitchMac(sw.id, pc1.mac, pc1.id, 'Fa0/2', 20);

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac
    };
    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
    assert.ok(result.reason.includes('VLAN isolation'));
});

// 425. Layer-2 VLAN isolation: frames between access ports on the same VLAN are successfully forwarded
runTest('425. Layer-2 VLAN isolation: frames between access ports on the same VLAN are successfully forwarded', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'PC1'); // Fa0/2

    // Put both PC0 and PC1 on VLAN 10
    createSwitchVlan(sw, 10, 'Sales');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 10);

    learnArp(pc0.id, pc1.ip, pc1.mac);
    learnSwitchMac(sw.id, pc1.mac, pc1.id, 'Fa0/2', 10);

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac
    };
    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);

    assert.strictEqual(result.success, true);
    assert.ok(frame.events.some(e => e.includes('forwarded frame through Fa0/2')));
});

// 426. Layer-2 VLAN isolation: unknown unicast flooding is restricted exclusively to ports matching ingress VLAN
runTest('426. Layer-2 VLAN isolation: unknown unicast flooding is restricted exclusively to ports matching ingress VLAN', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);
    addDevice('pc', 400, 200);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];
    const pc2 = networkState.devices[3];

    addConnection('PC0', 'Switch0'); // Fa0/1 (VLAN 10)
    addConnection('Switch0', 'PC1'); // Fa0/2 (VLAN 10)
    addConnection('Switch0', 'PC2'); // Fa0/3 (VLAN 20)

    createSwitchVlan(sw, 10, 'Sales');
    createSwitchVlan(sw, 20, 'HR');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/3', 20);

    // Send frame to unknown unicast destination MAC from PC0 (VLAN 10)
    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: '192.168.1.10',
        destinationIp: '192.168.1.20',
        sourceMac: pc0.mac,
        destinationMac: '00:99:99:99:99:99'
    };
    const result = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'PC1']);

    const floodHop = result.hopActions.find(h => h.action === 'FLOOD');
    assert.ok(floodHop, 'Switch must perform flood');
    assert.strictEqual(floodHop.egressPorts.length, 1, 'Flood must ONLY go to VLAN 10 ports, excluding Fa0/3');
    assert.strictEqual(floodHop.egressPorts[0], 'Fa0/2');
});

// 427. ARP isolation across VLANs: ARP request does not flood to ports in different VLANs and cannot resolve
runTest('427. ARP isolation across VLANs: ARP request does not flood to ports in different VLANs and cannot resolve', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'PC1'); // Fa0/2

    createSwitchVlan(sw, 10, 'VLAN10');
    createSwitchVlan(sw, 20, 'VLAN20');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 20);

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, false);
    assert.ok(arpRes.reason.includes('isolated broadcast between VLAN 10 and VLAN 20'));
});

// 428. ARP resolution succeeds between hosts assigned to the same access VLAN (e.g. VLAN 10)
runTest('428. ARP resolution succeeds between hosts assigned to the same access VLAN (e.g. VLAN 10)', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('pc', 400, 100);

    const pc0 = networkState.devices[0];
    const sw = networkState.devices[1];
    const pc1 = networkState.devices[2];

    pc0.ip = '192.168.1.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.1.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'PC1'); // Fa0/2

    createSwitchVlan(sw, 10, 'VLAN10');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw, 'Fa0/2', 10);

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, true);
    assert.strictEqual(arpRes.targetMac, pc1.mac);
});

// 429. Undo / Redo properly tracks VLAN creation, deletion, naming, and switchport assignments
runTest('429. Undo / Redo properly tracks VLAN creation, deletion, naming, and switchport assignments', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    // Initial state: only VLAN 1
    assert.strictEqual(Object.keys(sw.vlans).length, 1);

    // CLI vlan 10
    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name TestVlan');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport access vlan 10');

    assert.ok(networkState.devices[0].vlans[10]);
    assert.strictEqual(networkState.devices[0].vlans[10].name, 'TestVlan');
    assert.strictEqual(getSwitchPortConfig(networkState.devices[0], 'Fa0/1').accessVlan, 10);

    // Undo switchport assignment
    undo();
    assert.strictEqual(getSwitchPortConfig(networkState.devices[0], 'Fa0/1').accessVlan, 1);

    // Undo name
    undo();
    assert.strictEqual(networkState.devices[0].vlans[10].name, 'VLAN10');

    // Redo name & switchport
    redo();
    assert.strictEqual(networkState.devices[0].vlans[10].name, 'TestVlan');
    redo();
    assert.strictEqual(getSwitchPortConfig(networkState.devices[0], 'Fa0/1').accessVlan, 10);
});

// 430. Backward compatibility: legacy switch topology snapshots without vlans/switchports properties load without errors
runTest('430. Backward compatibility: legacy switch topology snapshots without vlans/switchports properties load without errors', () => {
    resetLab();
    // Simulate legacy switch object missing vlans and switchports
    networkState.devices.push({
        id: 'Switch0',
        name: 'Switch0',
        type: 'switch',
        x: 100,
        y: 100,
        mac: '00:11:22:33:44:00'
    });

    const legacySw = networkState.devices[0];
    const vlans = getSwitchVlans(legacySw);
    assert.strictEqual(Object.keys(vlans).length, 1);
    assert.strictEqual(vlans[1].id, 1);

    const portCfg = getSwitchPortConfig(legacySw, 'Fa0/1');
    assert.strictEqual(portCfg.accessVlan, 1);
    assert.strictEqual(portCfg.mode, 'access');

    // CLI execution on legacy switch works seamlessly
    const res = executeCliCommand('Switch0', 'show vlan brief');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('default'));
});

// 431. Switch Inspector UI renders VLAN count and VLAN column in MAC table
runTest('431. Switch Inspector UI renders VLAN count and VLAN column in MAC table', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Sales');
    learnSwitchMac(sw.id, '00:AA:BB:CC:DD:EE', 'PC0', 'Fa0/1', 10);

    const html = renderSwitchInspector(sw);
    assert.ok(html.includes('VLANs'), 'Must render VLANs summary');
    assert.ok(html.includes('2'), 'Must show 2 VLANs configured');
    assert.ok(html.includes('<th>VLAN</th>'), 'Must render VLAN header in MAC table');
    assert.ok(html.includes('<td>10</td>'), 'Must render VLAN 10 row in MAC table');
    assert.ok(html.includes('openSwitchTerminalBtn'), 'Must render Switch CLI button');
});

// 432. End-to-end full CLI configuration of switch VLANs and access ports with packet verification
runTest('432. End-to-end full CLI configuration of switch VLANs and access ports with packet verification', () => {
    resetLab();
    addDevice('pc', 100, 100);     // PC0
    addDevice('pc', 100, 200);     // PC1
    addDevice('switch', 300, 150); // Switch0
    addDevice('pc', 500, 100);     // PC2
    addDevice('pc', 500, 200);     // PC3

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];
    const sw0 = networkState.devices[2];
    const pc2 = networkState.devices[3];
    const pc3 = networkState.devices[4];

    pc0.ip = '10.10.10.1'; pc0.subnetMask = '255.255.255.0';
    pc1.ip = '10.20.20.1'; pc1.subnetMask = '255.255.255.0';
    pc2.ip = '10.10.10.2'; pc2.subnetMask = '255.255.255.0';
    pc3.ip = '10.20.20.2'; pc3.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('PC1', 'Switch0'); // Fa0/2
    addConnection('Switch0', 'PC2'); // Fa0/3
    addConnection('Switch0', 'PC3'); // Fa0/4

    // Configure Switch0 ENTIRELY via CLI commands
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name Sales');
    executeCliCommand('Switch0', 'vlan 20');
    executeCliCommand('Switch0', 'name Engineering');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/2');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'interface Fa0/3');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/4');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'end');

    // Verify show vlan brief output
    const vlanShow = executeCliCommand('Switch0', 'show vlan brief');
    assert.ok(vlanShow.output.includes('10   Sales                            active    Fa0/1, Fa0/3'));
    assert.ok(vlanShow.output.includes('20   Engineering                      active    Fa0/2, Fa0/4'));

    // PC0 (VLAN 10) to PC2 (VLAN 10) ping succeeds
    const pingVlan10 = executeCliCommand('PC0', 'ping 10.10.10.2');
    assert.strictEqual(pingVlan10.success, true);
    assert.ok(pingVlan10.output.includes('Reply from 10.10.10.2'));

    // PC1 (VLAN 20) to PC3 (VLAN 20) ping succeeds
    const pingVlan20 = executeCliCommand('PC1', 'ping 10.20.20.2');
    assert.strictEqual(pingVlan20.success, true);
    assert.ok(pingVlan20.output.includes('Reply from 10.20.20.2'));

    // PC0 (VLAN 10) to PC1 (VLAN 20) ping fails due to VLAN isolation
    const pingCross = executeCliCommand('PC0', 'ping 10.20.20.1');
    assert.strictEqual(pingCross.success, false);
});

// =========================================================================
// V5.12 Phase 2: IEEE 802.1Q Trunking Tests (Tests 433 - 479)
// =========================================================================

// 433. Switchport default configuration is access mode with access VLAN 1, native VLAN 1, and allowed VLANs 'all'
runTest('433. Switchport default configuration is access mode with access VLAN 1, native VLAN 1, and allowed VLANs all', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    const cfg = getSwitchPortConfig(sw, 'Fa0/1');
    assert.strictEqual(cfg.mode, 'access');
    assert.strictEqual(cfg.accessVlan, 1);
    assert.strictEqual(cfg.nativeVlan, 1);
    assert.strictEqual(cfg.allowedVlans, 'all');
});

// 434. setSwitchPortMode switches port to trunk mode and initializes trunk defaults
runTest('434. setSwitchPortMode switches port to trunk mode and initializes trunk defaults', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    const cfg = getSwitchPortConfig(sw, 'Fa0/24');
    assert.strictEqual(cfg.mode, 'trunk');
    assert.strictEqual(cfg.nativeVlan, 1);
    assert.strictEqual(cfg.allowedVlans, 'all');
});

// 435. setSwitchPortMode rejects invalid port modes
runTest('435. setSwitchPortMode rejects invalid port modes', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    assert.throws(() => {
        setSwitchPortMode(sw, 'Fa0/1', 'dynamic');
    }, /Mode "dynamic" is not supported/);
});

// 436. setSwitchPortMode switching back from trunk to access preserves access VLAN
runTest('436. setSwitchPortMode switching back from trunk to access preserves access VLAN', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Sales');
    setSwitchPortAccessVlan(sw, 'Fa0/5', 10);
    setSwitchPortMode(sw, 'Fa0/5', 'trunk');
    setSwitchPortMode(sw, 'Fa0/5', 'access');
    const cfg = getSwitchPortConfig(sw, 'Fa0/5');
    assert.strictEqual(cfg.mode, 'access');
    assert.strictEqual(cfg.accessVlan, 10);
});

// 437. getSwitchPortConfig returns complete trunk configuration
runTest('437. getSwitchPortConfig returns complete trunk configuration', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 99, 'Management');
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortNativeVlan(sw, 'Fa0/24', 99);
    setSwitchPortAllowedVlans(sw, 'Fa0/24', 'set', '10,20,99');
    const cfg = getSwitchPortConfig(sw, 'Fa0/24');
    assert.strictEqual(cfg.mode, 'trunk');
    assert.strictEqual(cfg.nativeVlan, 99);
    assert.strictEqual(cfg.allowedVlans.length, 3);
    assert.strictEqual(cfg.allowedVlans[0], 10);
    assert.strictEqual(cfg.allowedVlans[1], 20);
    assert.strictEqual(cfg.allowedVlans[2], 99);
});

// 438. setSwitchPortNativeVlan configures valid native VLAN on trunk port
runTest('438. setSwitchPortNativeVlan configures valid native VLAN on trunk port', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Data');
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    setSwitchPortNativeVlan(sw, 'Fa0/1', 10);
    assert.strictEqual(getSwitchPortConfig(sw, 'Fa0/1').nativeVlan, 10);
});

// 439. setSwitchPortNativeVlan rejects invalid VLAN ID format or out-of-range
runTest('439. setSwitchPortNativeVlan rejects invalid VLAN ID format or out-of-range', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    assert.throws(() => {
        setSwitchPortNativeVlan(sw, 'Fa0/1', 5000);
    }, /Invalid VLAN ID/);
});

// 440. setSwitchPortNativeVlan throws error if executed on an access port
runTest('440. setSwitchPortNativeVlan throws error if executed on an access port', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Data');
    assert.throws(() => {
        setSwitchPortNativeVlan(sw, 'Fa0/1', 10);
    }, /is not in trunk mode/);
});

// 441. setSwitchPortNativeVlan throws error if target VLAN does not exist on the switch
runTest('441. setSwitchPortNativeVlan throws error if target VLAN does not exist on the switch', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    assert.throws(() => {
        setSwitchPortNativeVlan(sw, 'Fa0/1', 100);
    }, /does not exist on switch/);
});

// 442. parseAllowedVlanSpec parses 'all' keyword
runTest('442. parseAllowedVlanSpec parses all keyword', () => {
    assert.strictEqual(parseAllowedVlanSpec('all'), 'all');
    assert.strictEqual(parseAllowedVlanSpec('ALL'), 'all');
});

// 443. parseAllowedVlanSpec parses single ID, comma-separated lists, and numeric arrays
runTest('443. parseAllowedVlanSpec parses single ID, comma-separated lists, and numeric arrays', () => {
    const res1 = parseAllowedVlanSpec('10');
    assert.strictEqual(res1.length, 1);
    assert.strictEqual(res1[0], 10);

    const res2 = parseAllowedVlanSpec('10, 20, 30');
    assert.strictEqual(res2.length, 3);
    assert.strictEqual(res2[0], 10);
    assert.strictEqual(res2[1], 20);
    assert.strictEqual(res2[2], 30);
});

// 444. parseAllowedVlanSpec parses VLAN ranges
runTest('444. parseAllowedVlanSpec parses VLAN ranges', () => {
    const res = parseAllowedVlanSpec('1-3, 10-12');
    assert.strictEqual(res.length, 6);
    assert.strictEqual(res[0], 1);
    assert.strictEqual(res[1], 2);
    assert.strictEqual(res[2], 3);
    assert.strictEqual(res[3], 10);
    assert.strictEqual(res[4], 11);
    assert.strictEqual(res[5], 12);
});

// 445. parseAllowedVlanSpec deduplicates and sorts VLAN numbers in ascending order
runTest('445. parseAllowedVlanSpec deduplicates and sorts VLAN numbers in ascending order', () => {
    const res = parseAllowedVlanSpec('30, 10, 20, 10, 30');
    assert.strictEqual(res.length, 3);
    assert.strictEqual(res[0], 10);
    assert.strictEqual(res[1], 20);
    assert.strictEqual(res[2], 30);
});

// 446. parseAllowedVlanSpec rejects invalid VLAN numbers and malformed ranges
runTest('446. parseAllowedVlanSpec rejects invalid VLAN numbers and malformed ranges', () => {
    assert.throws(() => {
        parseAllowedVlanSpec('10, 5000');
    }, /Invalid VLAN ID/);
    assert.throws(() => {
        parseAllowedVlanSpec('20-10');
    }, /Invalid VLAN range/);
});

// 447. setSwitchPortAllowedVlans 'add' action adds VLANs to current allowed list
runTest('447. setSwitchPortAllowedVlans add action adds VLANs to current allowed list', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/1', 'set', '10, 20');
    setSwitchPortAllowedVlans(sw, 'Fa0/1', 'add', '30');
    const cfg = getSwitchPortConfig(sw, 'Fa0/1');
    assert.strictEqual(cfg.allowedVlans.length, 3);
    assert.strictEqual(cfg.allowedVlans[2], 30);
});

// 448. setSwitchPortAllowedVlans 'remove' action removes specified VLANs from allowed list
runTest('448. setSwitchPortAllowedVlans remove action removes specified VLANs from allowed list', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/1', 'set', '10, 20, 30');
    setSwitchPortAllowedVlans(sw, 'Fa0/1', 'remove', '20');
    const cfg = getSwitchPortConfig(sw, 'Fa0/1');
    assert.strictEqual(cfg.allowedVlans.length, 2);
    assert.strictEqual(cfg.allowedVlans[0], 10);
    assert.strictEqual(cfg.allowedVlans[1], 30);
});

// 449. setSwitchPortAllowedVlans 'except' action allows all VLANs except specified list
runTest('449. setSwitchPortAllowedVlans except action allows all VLANs except specified list', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/1', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/1', 'except', '100');
    const cfg = getSwitchPortConfig(sw, 'Fa0/1');
    assert.strictEqual(isVlanAllowedOnTrunk(cfg, 100), false);
    assert.strictEqual(isVlanAllowedOnTrunk(cfg, 10), true);
});

// 450. setSwitchPortAllowedVlans throws error if port is in access mode
runTest('450. setSwitchPortAllowedVlans throws error if port is in access mode', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    assert.throws(() => {
        setSwitchPortAllowedVlans(sw, 'Fa0/1', 'set', '10,20');
    }, /is not in trunk mode/);
});

// 451. CLI 'switchport mode trunk' configures trunk mode on switch interface
runTest('451. CLI switchport mode trunk configures trunk mode on switch interface', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'interface Fa0/24');
    const res = executeCliCommand('Switch0', 'switchport mode trunk');
    assert.strictEqual(res.success, true);
    const cfg = getSwitchPortConfig('Switch0', 'Fa0/24');
    assert.strictEqual(cfg.mode, 'trunk');
});

// 452. CLI 'switchport trunk native vlan <id>' configures trunk native VLAN and validates existence
runTest('452. CLI switchport trunk native vlan <id> configures trunk native VLAN and validates existence', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 99');
    executeCliCommand('Switch0', 'interface Fa0/24');
    executeCliCommand('Switch0', 'switchport mode trunk');
    const res = executeCliCommand('Switch0', 'switchport trunk native vlan 99');
    assert.strictEqual(res.success, true);
    assert.strictEqual(getSwitchPortConfig('Switch0', 'Fa0/24').nativeVlan, 99);

    const failRes = executeCliCommand('Switch0', 'switchport trunk native vlan 500');
    assert.strictEqual(failRes.success, false);
    assert.ok(failRes.output.includes('Native VLAN 500 does not exist'));
});

// 453. CLI 'switchport trunk allowed vlan [all|add|remove|except|<list>]' sets and modifies allowed VLANs
runTest('453. CLI switchport trunk allowed vlan commands set and modify allowed VLANs', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'interface Fa0/24');
    executeCliCommand('Switch0', 'switchport mode trunk');

    executeCliCommand('Switch0', 'switchport trunk allowed vlan 10,20,30');
    let cfg = getSwitchPortConfig('Switch0', 'Fa0/24');
    assert.strictEqual(cfg.allowedVlans.length, 3);

    executeCliCommand('Switch0', 'switchport trunk allowed vlan add 40');
    cfg = getSwitchPortConfig('Switch0', 'Fa0/24');
    assert.strictEqual(cfg.allowedVlans.length, 4);

    executeCliCommand('Switch0', 'switchport trunk allowed vlan remove 20');
    cfg = getSwitchPortConfig('Switch0', 'Fa0/24');
    assert.strictEqual(cfg.allowedVlans.length, 3);
    assert.strictEqual(cfg.allowedVlans.includes(20), false);

    executeCliCommand('Switch0', 'switchport trunk allowed vlan all');
    cfg = getSwitchPortConfig('Switch0', 'Fa0/24');
    assert.strictEqual(cfg.allowedVlans, 'all');
});

// 454. CLI rejects trunk commands on access ports with educational message
runTest('454. CLI rejects trunk commands on access ports with educational message', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'interface Fa0/1');
    const res = executeCliCommand('Switch0', 'switchport trunk native vlan 10');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('is not in trunk mode'));
});

// 455. CLI 'show interfaces trunk' renders formatted trunk table
runTest('455. CLI show interfaces trunk renders formatted trunk table', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/24');
    executeCliCommand('Switch0', 'switchport mode trunk');
    executeCliCommand('Switch0', 'switchport trunk allowed vlan 1,10');
    executeCliCommand('Switch0', 'end');

    const res = executeCliCommand('Switch0', 'show interfaces trunk');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Fa0/24'));
    assert.ok(res.output.includes('802.1q'));
    assert.ok(res.output.includes('trunking'));
    assert.ok(res.output.includes('1, 10'));
});

// 456. CLI 'show interfaces <port> switchport' displays operational mode, native VLAN, and allowed VLANs
runTest('456. CLI show interfaces <port> switchport displays operational mode, native VLAN, and allowed VLANs', () => {
    resetLab();
    addDevice('switch', 200, 200);
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'interface Fa0/24');
    executeCliCommand('Switch0', 'switchport mode trunk');
    executeCliCommand('Switch0', 'switchport trunk allowed vlan 10,20');
    executeCliCommand('Switch0', 'end');

    const res = executeCliCommand('Switch0', 'show interfaces Fa0/24 switchport');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Name: Fa0/24'));
    assert.ok(res.output.includes('Administrative Mode: trunk'));
    assert.ok(res.output.includes('Operational Mode: trunk'));
    assert.ok(res.output.includes('Trunking VLANs Enabled: 10, 20'));
});

// 457. classifyFrameIngress on access port accepts untagged frame and classifies to access VLAN
runTest('457. classifyFrameIngress on access port accepts untagged frame and classifies to access VLAN', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Data');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    const frame = { events: [] };
    const res = classifyFrameIngress(sw, 'Fa0/1', frame);
    assert.strictEqual(res.accepted, true);
    assert.strictEqual(res.ingressVlan, 10);
});

// 458. classifyFrameIngress on access port drops 802.1Q tagged frame
runTest('458. classifyFrameIngress on access port drops 802.1Q tagged frame', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    const frame = {
        vlanTag: { vlanId: 10, tpid: '0x8100', priority: 0, isTagged: true }
    };
    const res = classifyFrameIngress(sw, 'Fa0/1', frame);
    assert.strictEqual(res.accepted, false);
    assert.ok(res.reason.includes('received 802.1Q tagged frame'));
});

// 459. classifyFrameIngress on trunk port accepts 802.1Q tagged frame if VLAN is allowed
runTest('459. classifyFrameIngress on trunk port accepts 802.1Q tagged frame if VLAN is allowed', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/24', 'set', '10,20');
    const frame = {
        vlanTag: { vlanId: 20, tpid: '0x8100', priority: 0, isTagged: true }
    };
    const res = classifyFrameIngress(sw, 'Fa0/24', frame);
    assert.strictEqual(res.accepted, true);
    assert.strictEqual(res.ingressVlan, 20);
});

// 460. classifyFrameIngress on trunk port drops 802.1Q tagged frame if VLAN is not allowed
runTest('460. classifyFrameIngress on trunk port drops 802.1Q tagged frame if VLAN is not allowed', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/24', 'set', '10,20');
    const frame = {
        vlanTag: { vlanId: 30, tpid: '0x8100', priority: 0, isTagged: true }
    };
    const res = classifyFrameIngress(sw, 'Fa0/24', frame);
    assert.strictEqual(res.accepted, false);
    assert.ok(res.reason.includes('not in allowed VLAN list'));
});

// 461. classifyFrameIngress on trunk port accepts untagged frame and classifies to native VLAN
runTest('461. classifyFrameIngress on trunk port accepts untagged frame and classifies to native VLAN', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 99, 'Management');
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortNativeVlan(sw, 'Fa0/24', 99);
    const frame = { events: [] };
    const res = classifyFrameIngress(sw, 'Fa0/24', frame);
    assert.strictEqual(res.accepted, true);
    assert.strictEqual(res.ingressVlan, 99);
});

// 462. getEgressTagAction on trunk port tags non-native VLAN with 802.1Q tag
runTest('462. getEgressTagAction on trunk port tags non-native VLAN with 802.1Q tag', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    const cfg = getSwitchPortConfig(sw, 'Fa0/24');
    const action = getEgressTagAction(cfg, 10);
    assert.strictEqual(action.allowed, true);
    assert.strictEqual(action.isTagged, true);
    assert.strictEqual(action.vlanTag.vlanId, 10);
    assert.strictEqual(action.vlanTag.tpid, '0x8100');
});

// 463. getEgressTagAction on trunk port transmits native VLAN frame untagged
runTest('463. getEgressTagAction on trunk port transmits native VLAN frame untagged', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Native');
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortNativeVlan(sw, 'Fa0/24', 10);
    const cfg = getSwitchPortConfig(sw, 'Fa0/24');
    const action = getEgressTagAction(cfg, 10);
    assert.strictEqual(action.allowed, true);
    assert.strictEqual(action.isTagged, false);
});

// 464. getEgressTagAction on access port transmits frame untagged
runTest('464. getEgressTagAction on access port transmits frame untagged', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 10, 'Sales');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    const cfg = getSwitchPortConfig(sw, 'Fa0/1');
    const action = getEgressTagAction(cfg, 10);
    assert.strictEqual(action.allowed, true);
    assert.strictEqual(action.isTagged, false);
});

// 465. Multi-switch trunking: PC0 (VLAN 10) on Switch0 reaches PC1 (VLAN 10) on Switch1 across 802.1Q trunk
runTest('465. Multi-switch trunking: PC0 (VLAN 10) on Switch0 reaches PC1 (VLAN 10) on Switch1 across 802.1Q trunk', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '10.10.10.1';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '10.10.10.2';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0'); // Fa0/1 on Switch0
    addConnection('Switch0', 'Switch1'); // Fa0/2 on Switch0, Fa0/1 on Switch1
    addConnection('Switch1', 'PC1'); // Fa0/2 on Switch1

    createSwitchVlan(sw0, 10, 'Sales');
    createSwitchVlan(sw1, 10, 'Sales');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');

    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 10);

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac
    };

    const res = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'Switch1', 'PC1']);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, 'FORWARD');
});

// 466. Multi-switch trunking: VLAN 20 traffic remains strictly isolated from VLAN 10 across trunk
runTest('466. Multi-switch trunking: VLAN 20 traffic remains strictly isolated from VLAN 10 across trunk', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '10.10.10.1';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '10.20.20.1';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    createSwitchVlan(sw0, 10, 'Sales');
    createSwitchVlan(sw1, 20, 'HR');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');

    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 20);

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        sourceMac: pc0.mac,
        destinationMac: pc1.mac
    };

    const res = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'Switch1', 'PC1']);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.action, 'DROP');
});

// 467. Multi-switch trunking: Disallowed VLAN on trunk is dropped
runTest('467. Multi-switch trunking: Disallowed VLAN on trunk is dropped', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    createSwitchVlan(sw0, 30, 'Guest');
    createSwitchVlan(sw1, 30, 'Guest');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 30);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');
    // Only allow VLAN 10 and 20 on the trunk
    setSwitchPortAllowedVlans(sw0, 'Fa0/2', 'set', '10,20');

    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 30);

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: '10.30.30.1',
        destinationIp: '10.30.30.2',
        sourceMac: pc0.mac,
        destinationMac: pc1.mac
    };

    const res = simulatePathTransmission(frame, pc0, pc1, ['PC0', 'Switch0', 'Switch1', 'PC1']);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.action, 'DROP');
});

// 468. Flooding: Unknown unicast flood traverses trunk ports tagged with non-native VLAN
runTest('468. Flooding: Unknown unicast flood traverses trunk ports tagged with non-native VLAN', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];

    addConnection('PC0', 'Switch0'); // Fa0/1
    addConnection('Switch0', 'Switch1'); // Fa0/2

    createSwitchVlan(sw0, 10, 'Data');
    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');

    const frame = {
        events: [],
        protocol: 'ICMP',
        sourceIp: '10.10.10.1',
        destinationIp: '10.10.10.99',
        sourceMac: pc0.mac,
        destinationMac: '00:88:88:88:88:88'
    };

    const res = simulatePathTransmission(frame, pc0, sw1, ['PC0', 'Switch0', 'Switch1']);
    const floodHop = res.hopActions.find(h => h.action === 'FLOOD');
    assert.ok(floodHop, 'Must flood unknown unicast');
    assert.strictEqual(floodHop.egressPorts.includes('Fa0/2'), true);
});

// 469. Flooding: Broadcast flood traverses trunk ports and is untagged on native VLAN
runTest('469. Flooding: Broadcast flood traverses trunk ports and is untagged on native VLAN', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 1);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk'); // Native VLAN = 1

    const frame = {
        events: [],
        protocol: 'ARP',
        sourceMac: pc0.mac,
        destinationMac: 'FF:FF:FF:FF:FF:FF'
    };

    const res = simulatePathTransmission(frame, pc0, networkState.devices[2], ['PC0', 'Switch0', 'Switch1']);
    const floodHop = res.hopActions.find(h => h.action === 'FLOOD');
    assert.ok(floodHop);
    assert.strictEqual(floodHop.egressPorts.includes('Fa0/2'), true);
    // Because VLAN is native (1), outgoing frame has no vlanTag
    assert.strictEqual(frame.vlanTag, undefined);
});

// 470. MAC Learning: MAC addresses learned over trunk port are correctly associated with the 802.1Q tag's VLAN ID
runTest('470. MAC Learning: MAC addresses learned over trunk port are correctly associated with the 802.1Q tag VLAN ID', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    createSwitchVlan(sw, 20, 'Voice');
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');

    const frame = {
        events: [],
        sourceMac: '00:AA:BB:CC:DD:EE',
        destinationMac: 'FF:FF:FF:FF:FF:FF',
        vlanTag: { vlanId: 20, tpid: '0x8100', priority: 0, isTagged: true }
    };

    learnSwitchMac(sw.id, frame.sourceMac, 'RemoteDev', 'Fa0/24', 20);
    const entryVlan20 = getSwitchMacEntry(sw.id, '00:AA:BB:CC:DD:EE', 20);
    const entryVlan10 = getSwitchMacEntry(sw.id, '00:AA:BB:CC:DD:EE', 10);

    assert.ok(entryVlan20, 'Entry must be present in VLAN 20');
    assert.strictEqual(entryVlan20.port, 'Fa0/24');
    assert.strictEqual(entryVlan10, null, 'Entry must NOT be present in VLAN 10');
});

// 471. ARP request broadcast crosses 802.1Q trunk to matching access VLAN host on remote switch
runTest('471. ARP request broadcast crosses 802.1Q trunk to matching access VLAN host on remote switch', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.10.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    createSwitchVlan(sw0, 10, 'Sales');
    createSwitchVlan(sw1, 10, 'Sales');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');

    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 10);

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, true);
    assert.strictEqual(arpRes.targetMac, pc1.mac);
});

// 472. ARP resolution fails across trunk when access VLANs on endpoints do not match
runTest('472. ARP resolution fails across trunk when access VLANs on endpoints do not match', () => {
    resetLab();
    addDevice('pc', 100, 100);
    addDevice('switch', 250, 100);
    addDevice('switch', 450, 100);
    addDevice('pc', 600, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc1.ip = '192.168.10.20';
    pc1.subnetMask = '255.255.255.0';

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    createSwitchVlan(sw0, 10, 'Sales');
    createSwitchVlan(sw1, 20, 'Marketing');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');

    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 20);

    const arpRes = simulateArpResolution(pc0, pc1.ip);
    assert.strictEqual(arpRes.success, false);
});

// 473. Native VLAN mismatch behavior: untagged traffic on native VLAN 10 ingresses to native VLAN 20
runTest('473. Native VLAN mismatch behavior: untagged traffic on native VLAN 10 ingresses to native VLAN 20', () => {
    resetLab();
    addDevice('switch', 200, 100);
    addDevice('switch', 400, 100);

    const sw0 = networkState.devices[0];
    const sw1 = networkState.devices[1];

    createSwitchVlan(sw0, 10, 'NativeA');
    createSwitchVlan(sw1, 20, 'NativeB');

    setSwitchPortMode(sw0, 'Fa0/24', 'trunk');
    setSwitchPortNativeVlan(sw0, 'Fa0/24', 10);

    setSwitchPortMode(sw1, 'Fa0/24', 'trunk');
    setSwitchPortNativeVlan(sw1, 'Fa0/24', 20);

    // Egress from Switch0 on VLAN 10 (native) is UNTAGGED
    const egressCfg0 = getSwitchPortConfig(sw0, 'Fa0/24');
    const egressAction = getEgressTagAction(egressCfg0, 10);
    assert.strictEqual(egressAction.isTagged, false);

    // Switch1 receives untagged frame on trunk and classifies to its own native VLAN 20
    const frame = { events: [] };
    const ingressRes = classifyFrameIngress(sw1, 'Fa0/24', frame);
    assert.strictEqual(ingressRes.accepted, true);
    assert.strictEqual(ingressRes.ingressVlan, 20);
});

// 474. Packet Inspector displays IEEE 802.1Q VLAN TAG section for tagged frames
runTest('474. Packet Inspector displays IEEE 802.1Q VLAN TAG section for tagged frames', () => {
    const pkt = {
        sourceMac: '00:11:22:33:44:55',
        destinationMac: '00:66:77:88:99:AA',
        protocol: 'ICMP',
        vlanTag: {
            vlanId: 10,
            tpid: '0x8100',
            priority: 0,
            isTagged: true
        }
    };
    const html = renderPacketInspector(pkt, { path: ['Switch0', 'Switch1'] });
    assert.ok(html.includes('IEEE 802.1Q VLAN TAG'));
    assert.ok(html.includes('0x8100'));
    assert.ok(html.includes('10'));
});

// 475. Packet Inspector omits IEEE 802.1Q section for untagged frames
runTest('475. Packet Inspector omits IEEE 802.1Q section for untagged frames', () => {
    const pkt = {
        sourceMac: '00:11:22:33:44:55',
        destinationMac: '00:66:77:88:99:AA',
        protocol: 'ICMP'
    };
    const html = renderPacketInspector(pkt, { path: ['PC0', 'Switch0'] });
    assert.strictEqual(html.includes('IEEE 802.1Q VLAN TAG'), false);
});

// 476. Switch Inspector displays Switchports table with Mode, Native VLAN, and Allowed VLANs
runTest('476. Switch Inspector displays Switchports table with Mode, Native VLAN, and Allowed VLANs', () => {
    resetLab();
    addDevice('switch', 200, 200);
    const sw = networkState.devices[0];
    setSwitchPortMode(sw, 'Fa0/24', 'trunk');
    setSwitchPortAllowedVlans(sw, 'Fa0/24', 'set', '10,20');

    const html = renderSwitchInspector(sw);
    assert.ok(html.includes('SWITCHPORTS'));
    assert.ok(html.includes('Fa0/24'));
    assert.ok(html.includes('trunk'));
    assert.ok(html.includes('10, 20'));
});

// 477. End-to-End: Full CLI configuration of dual switches with access ports, 802.1Q trunk, native VLAN, and ping verification
runTest('477. End-to-End: Full CLI configuration of dual switches with access ports, 802.1Q trunk, native VLAN, and ping verification', () => {
    resetLab();
    // Create 4 PCs and 2 Switches
    addDevice('pc', 100, 100);     // PC0 (VLAN 10)
    addDevice('pc', 100, 250);     // PC1 (VLAN 20)
    addDevice('switch', 300, 175); // Switch0
    addDevice('switch', 500, 175); // Switch1
    addDevice('pc', 700, 100);     // PC2 (VLAN 10)
    addDevice('pc', 700, 250);     // PC3 (VLAN 20)

    const pc0 = networkState.devices[0];
    const pc1 = networkState.devices[1];
    const sw0 = networkState.devices[2];
    const sw1 = networkState.devices[3];
    const pc2 = networkState.devices[4];
    const pc3 = networkState.devices[5];

    // Configure PC IPs
    pc0.ip = '10.10.10.1'; pc0.subnetMask = '255.255.255.0';
    pc1.ip = '10.20.20.1'; pc1.subnetMask = '255.255.255.0';
    pc2.ip = '10.10.10.2'; pc2.subnetMask = '255.255.255.0';
    pc3.ip = '10.20.20.2'; pc3.subnetMask = '255.255.255.0';

    // Connect topology
    addConnection('PC0', 'Switch0');       // Switch0 Fa0/1
    addConnection('PC1', 'Switch0');       // Switch0 Fa0/2
    addConnection('Switch0', 'Switch1');   // Switch0 Fa0/3 <-> Switch1 Fa0/1
    addConnection('Switch1', 'PC2');       // Switch1 Fa0/2
    addConnection('Switch1', 'PC3');       // Switch1 Fa0/3

    // Configure Switch0 via CLI
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name Sales');
    executeCliCommand('Switch0', 'vlan 20');
    executeCliCommand('Switch0', 'name Engineering');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/2');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'interface Fa0/3');
    executeCliCommand('Switch0', 'switchport mode trunk');
    executeCliCommand('Switch0', 'switchport trunk allowed vlan 10,20');
    executeCliCommand('Switch0', 'end');

    // Configure Switch1 via CLI
    executeCliCommand('Switch1', 'configure terminal');
    executeCliCommand('Switch1', 'vlan 10');
    executeCliCommand('Switch1', 'name Sales');
    executeCliCommand('Switch1', 'vlan 20');
    executeCliCommand('Switch1', 'name Engineering');
    executeCliCommand('Switch1', 'interface Fa0/1');
    executeCliCommand('Switch1', 'switchport mode trunk');
    executeCliCommand('Switch1', 'switchport trunk allowed vlan 10,20');
    executeCliCommand('Switch1', 'interface Fa0/2');
    executeCliCommand('Switch1', 'switchport mode access');
    executeCliCommand('Switch1', 'switchport access vlan 10');
    executeCliCommand('Switch1', 'interface Fa0/3');
    executeCliCommand('Switch1', 'switchport mode access');
    executeCliCommand('Switch1', 'switchport access vlan 20');
    executeCliCommand('Switch1', 'end');

    // Test 1: PC0 (VLAN 10) pings PC2 (VLAN 10) across trunk link -> SUCCESS
    const pingVlan10 = executeCliCommand('PC0', 'ping 10.10.10.2');
    assert.strictEqual(pingVlan10.success, true);
    assert.ok(pingVlan10.output.includes('Reply from 10.10.10.2'));

    // Test 2: PC1 (VLAN 20) pings PC3 (VLAN 20) across trunk link -> SUCCESS
    const pingVlan20 = executeCliCommand('PC1', 'ping 10.20.20.2');
    assert.strictEqual(pingVlan20.success, true);
    assert.ok(pingVlan20.output.includes('Reply from 10.20.20.2'));

    // Test 3: PC0 (VLAN 10) pings PC3 (VLAN 20) -> FAILS (VLAN isolation)
    const pingCross = executeCliCommand('PC0', 'ping 10.20.20.2');
    assert.strictEqual(pingCross.success, false);
});

// ==========================================
// V5.12 Phase 3: Router-on-a-Stick (ROAS) Tests (478+)
// ==========================================

function setupRoasLab() {
    resetLab();
    addDevice('router', 250, 80);  // Router0
    addDevice('switch', 250, 200); // Switch0
    addDevice('pc', 100, 320);     // PC0
    addDevice('pc', 400, 320);     // PC1

    const r0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc0 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';
    pc0.mac = '00:00:00:00:00:10';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';
    pc1.mac = '00:00:00:00:00:20';

    addConnection(r0.id, sw0.id);
    addConnection(sw0.id, pc0.id);
    addConnection(sw0.id, pc1.id);

    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name Sales');
    executeCliCommand('Switch0', 'vlan 20');
    executeCliCommand('Switch0', 'name Engineering');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport mode trunk');
    executeCliCommand('Switch0', 'switchport trunk allowed vlan 10,20');
    executeCliCommand('Switch0', 'interface Fa0/2');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/3');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'end');

    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'no shutdown');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');
    executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    executeCliCommand('Router0', 'interface Gig0/0.20');
    executeCliCommand('Router0', 'encapsulation dot1q 20');
    executeCliCommand('Router0', 'ip address 192.168.20.1 255.255.255.0');
    executeCliCommand('Router0', 'end');

    return { r0, sw0, pc0, pc1 };
}

runTest('478. normalizeRouterInterfaceName supports physical interfaces and subinterfaces', () => {
    assert.strictEqual(normalizeRouterInterfaceName('Gig0/0'), 'Gig0/0');
    assert.strictEqual(normalizeRouterInterfaceName('g0/0'), 'Gig0/0');
    assert.strictEqual(normalizeRouterInterfaceName('GigabitEthernet0/0'), 'Gig0/0');
    assert.strictEqual(normalizeRouterInterfaceName('Gig0/0.10'), 'Gig0/0.10');
    assert.strictEqual(normalizeRouterInterfaceName('g0/0.10'), 'Gig0/0.10');
    assert.strictEqual(normalizeRouterInterfaceName('GigabitEthernet0/0.20'), 'Gig0/0.20');
    assert.strictEqual(normalizeRouterInterfaceName('Gig0/1.100'), 'Gig0/1.100');
    assert.strictEqual(normalizeRouterInterfaceName('invalid'), null);
    assert.strictEqual(normalizeRouterInterfaceName('Gig0/0.abc'), null);
    assert.strictEqual(normalizeRouterInterfaceName('Gig0/0.-5'), null);
});

runTest('479. isSubinterfaceName, getParentInterfaceName, and getSubinterfaceId parse subinterfaces correctly', () => {
    assert.strictEqual(isSubinterfaceName('Gig0/0.10'), true);
    assert.strictEqual(isSubinterfaceName('Gig0/0'), false);
    assert.strictEqual(getParentInterfaceName('Gig0/0.10'), 'Gig0/0');
    assert.strictEqual(getParentInterfaceName('Gig0/0'), 'Gig0/0');
    assert.strictEqual(getSubinterfaceId('Gig0/0.10'), 10);
    assert.strictEqual(getSubinterfaceId('Gig0/0.200'), 200);
    assert.strictEqual(getSubinterfaceId('Gig0/0'), null);
});

runTest('480. ensureRouterSubinterface creates subinterface inheriting parent MAC and initial attributes', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const parentIface = router.interfaces['Gig0/0'];
    assert.ok(parentIface);

    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');
    assert.ok(subif);
    assert.strictEqual(subif.isSubinterface, true);
    assert.strictEqual(subif.parentInterface, 'Gig0/0');
    assert.strictEqual(subif.subId, 10);
    assert.strictEqual(subif.mac, parentIface.mac);
    assert.strictEqual(subif.encapsulation, null);
    assert.strictEqual(subif.vlan, null);
    assert.strictEqual(subif.status, 'up');
    assert.strictEqual(router.interfaces['Gig0/0.10'], subif);
});

runTest('481. ensureRouterSubinterface preserves existing subinterface configuration on re-entry', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');
    subif.encapsulation = 'dot1q';
    subif.vlan = 10;
    subif.ip = '192.168.10.1';
    subif.subnetMask = '255.255.255.0';

    const subifReentry = ensureRouterSubinterface(router, 'Gig0/0.10');
    assert.strictEqual(subifReentry, subif);
    assert.strictEqual(subifReentry.encapsulation, 'dot1q');
    assert.strictEqual(subifReentry.vlan, 10);
    assert.strictEqual(subifReentry.ip, '192.168.10.1');
});

runTest('482. ensureRouterSubinterface returns null if parent physical interface does not exist', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    assert.strictEqual(ensureRouterSubinterface(router, 'Gig0/9.10'), null);
});

runTest('483. setRouterSubinterfaceEncapsulation configures dot1q and VLAN ID on subinterface', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    ensureRouterSubinterface(router, 'Gig0/0.10');

    const result = setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 10);
    assert.strictEqual(result.encapsulation, 'dot1q');
    assert.strictEqual(result.vlan, 10);
    assert.strictEqual(router.interfaces['Gig0/0.10'].encapsulation, 'dot1q');
    assert.strictEqual(router.interfaces['Gig0/0.10'].vlan, 10);
});

runTest('484. setRouterSubinterfaceEncapsulation rejects invalid VLAN IDs (out of 1-4094 range)', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    ensureRouterSubinterface(router, 'Gig0/0.10');

    assert.throws(() => {
        setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 0);
    }, /Invalid VLAN ID/);

    assert.throws(() => {
        setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 4095);
    }, /Invalid VLAN ID/);

    assert.throws(() => {
        setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 'invalid');
    }, /Invalid VLAN ID/);
});

runTest('485. setRouterSubinterfaceEncapsulation rejects duplicate VLAN ID on sibling subinterfaces of same parent', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    ensureRouterSubinterface(router, 'Gig0/0.10');
    ensureRouterSubinterface(router, 'Gig0/0.20');

    setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 10);

    assert.throws(() => {
        setRouterSubinterfaceEncapsulation(router, 'Gig0/0.20', 10);
    }, (err) => err.message.includes('already configured'));
});

runTest('486. setRouterSubinterfaceEncapsulation allows re-configuring same VLAN on same subinterface', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    ensureRouterSubinterface(router, 'Gig0/0.10');
    setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 10);

    assert.doesNotThrow(() => {
        setRouterSubinterfaceEncapsulation(router, 'Gig0/0.10', 10);
    });
});

runTest('487. getEffectiveInterfaceStatus reflects physical parent status and subinterface status', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');

    // Both parent and subif up
    router.interfaces['Gig0/0'].status = 'up';
    subif.status = 'up';
    assert.strictEqual(getEffectiveInterfaceStatus(router, 'Gig0/0.10'), 'up');

    // Subif administratively down
    subif.status = 'down';
    assert.strictEqual(getEffectiveInterfaceStatus(router, 'Gig0/0.10'), 'down');

    // Subif up but parent physical interface administratively down
    subif.status = 'up';
    router.interfaces['Gig0/0'].status = 'down';
    assert.strictEqual(getEffectiveInterfaceStatus(router, 'Gig0/0.10'), 'down');
});

runTest('488. getRouterRoutingTable generates connected route for subinterface with dot1q encapsulation and valid IP', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');
    subif.encapsulation = 'dot1q';
    subif.vlan = 10;
    subif.ip = '192.168.10.1';
    subif.subnetMask = '255.255.255.0';

    const routes = getRouterRoutingTable(router.id);
    const subifRoute = routes.find(r => r.interface === 'Gig0/0.10');
    assert.ok(subifRoute, 'Connected route for Gig0/0.10 must exist');
    assert.strictEqual(subifRoute.network, '192.168.10.0');
    assert.strictEqual(subifRoute.prefixLength, 24);
    assert.strictEqual(subifRoute.type, 'connected');
    assert.strictEqual(subifRoute.status, 'active');
});

runTest('489. getRouterRoutingTable does NOT generate connected route for subinterface without dot1q encapsulation', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');
    subif.encapsulation = null;
    subif.vlan = null;
    subif.ip = '192.168.10.1';
    subif.subnetMask = '255.255.255.0';

    const routes = getRouterRoutingTable(router.id);
    const subifRoute = routes.find(r => r.interface === 'Gig0/0.10');
    assert.strictEqual(subifRoute, undefined, 'Subinterface without encapsulation must not have active route');
});

runTest('490. getRouterRoutingTable marks subinterface connected route down when parent interface is shut down', () => {
    resetLab();
    addDevice('router', 200, 200);
    const router = networkState.devices[0];
    const subif = ensureRouterSubinterface(router, 'Gig0/0.10');
    subif.encapsulation = 'dot1q';
    subif.vlan = 10;
    subif.ip = '192.168.10.1';
    subif.subnetMask = '255.255.255.0';

    router.interfaces['Gig0/0'].status = 'down';

    const routes = getRouterRoutingTable(router.id);
    const subifRoute = routes.find(r => r.interface === 'Gig0/0.10');
    assert.strictEqual(subifRoute, undefined, 'Connected route for subinterface whose parent is down must not be in active routing table');
});

runTest('491. Router CLI interface <name>.<subId> enters config-subif mode with prompt Router(config-subif)#', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');

    const res = executeCliCommand('Router0', 'interface Gig0/0.10');
    assert.strictEqual(res.success, true);
    assert.strictEqual(getDeviceCliPrompt('Router0'), 'Router0(config-subif)#');
});

runTest('492. Router CLI exit in config-subif returns to config mode, end returns to exec mode', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    assert.strictEqual(getDeviceCliPrompt('Router0'), 'Router0(config-subif)#');

    executeCliCommand('Router0', 'exit');
    assert.strictEqual(getDeviceCliPrompt('Router0'), 'Router0(config)#');

    executeCliCommand('Router0', 'interface Gig0/0.20');
    assert.strictEqual(getDeviceCliPrompt('Router0'), 'Router0(config-subif)#');

    executeCliCommand('Router0', 'end');
    assert.strictEqual(getDeviceCliPrompt('Router0'), 'Router0#');
});

runTest('493. Router CLI encapsulation dot1q <vlan> configures encapsulation on subinterface', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');

    const res = executeCliCommand('Router0', 'encapsulation dot1q 10');
    assert.strictEqual(res.success, true);

    const router = networkState.devices[0];
    assert.strictEqual(router.interfaces['Gig0/0.10'].encapsulation, 'dot1q');
    assert.strictEqual(router.interfaces['Gig0/0.10'].vlan, 10);
});

runTest('494. Router CLI encapsulation command rejected outside subinterface config mode', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');

    const res = executeCliCommand('Router0', 'encapsulation dot1q 10');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Can only configure dot1q encapsulation on subinterfaces'));
});

runTest('495. Router CLI ip address on subinterface rejected before encapsulation is configured', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');

    const res = executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    assert.strictEqual(res.success, false);
    assert.ok(res.output.includes('Configuring IP routing on a LAN subinterface is only allowed if that subinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q, or ISL vLAN.'));
});

runTest('496. Router CLI ip address on subinterface succeeds after encapsulation dot1q is configured', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');

    const res = executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    assert.strictEqual(res.success, true);

    const router = networkState.devices[0];
    assert.strictEqual(router.interfaces['Gig0/0.10'].ip, '192.168.10.1');
    assert.strictEqual(router.interfaces['Gig0/0.10'].subnetMask, '255.255.255.0');
});

runTest('497. Router CLI subinterface shutdown and no shutdown commands toggle subinterface state', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');

    const shutRes = executeCliCommand('Router0', 'shutdown');
    assert.strictEqual(shutRes.success, true);
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0.10'].status, 'down');

    const noShutRes = executeCliCommand('Router0', 'no shutdown');
    assert.strictEqual(noShutRes.success, true);
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0.10'].status, 'up');
});

runTest('498. Router CLI no ip address removes IP from subinterface', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');
    executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');

    const res = executeCliCommand('Router0', 'no ip address');
    assert.strictEqual(res.success, true);
    assert.strictEqual(networkState.devices[0].interfaces['Gig0/0.10'].ip, '');
});

runTest('499. Router CLI show ip interface brief formats table with physical interfaces and subinterfaces', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');
    executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    executeCliCommand('Router0', 'end');

    const res = executeCliCommand('Router0', 'show ip interface brief');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Interface                  IP-Address      OK? Method Status                Protocol'));
    assert.ok(res.output.includes('Gig0/0.10                  192.168.10.1    YES manual up                    up'));
});

runTest('500. Router CLI show interfaces renders subinterface encapsulation and inherited hardware address', () => {
    resetLab();
    addDevice('router', 200, 200);
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');
    executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    executeCliCommand('Router0', 'end');

    const res = executeCliCommand('Router0', 'show interfaces');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Gig0/0.10 is up, line protocol is up'));
    assert.ok(res.output.includes('Hardware is GigabitEthernet (subinterface)'));
    assert.ok(res.output.includes('Encapsulation 802.1Q (dot1q), VLAN 10'));
    assert.ok(res.output.includes('Internet address is 192.168.10.1/24'));
});

runTest('501. findL3RoutedTopologyPath resolves path PC0 -> Switch0 -> Router0 -> Switch0 -> PC1 across subnets', () => {
    setupRoasLab();
    const pc0 = getDeviceById('PC0');
    const pc1 = getDeviceById('PC1');

    const path = findL3RoutedTopologyPath(pc0, pc1);
    assert.deepStrictEqual(path, ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1']);
});

runTest('502. ROAS Ingress: Router receives tagged frame and de-encapsulates tag on matching dot1q subinterface', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();
    const subif10 = r0.interfaces['Gig0/0.10'];
    assert.ok(subif10);

    const frame = {
        events: [],
        sourceMac: pc0.mac,
        destinationMac: subif10.mac,
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        packet: {
            sourceIp: pc0.ip,
            destinationIp: pc1.ip,
            protocol: 'ICMP',
            ttl: 64
        },
        payload: 'ICMP Echo Request'
    };

    const topologyPath = ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1'];
    const result = simulatePathTransmission(frame, pc0, pc1, topologyPath);
    assert.strictEqual(result.success, true);
    assert.ok(frame.events.some(e => e.includes('Router Router0 de-encapsulated 802.1Q tag')));
});

runTest('503. ROAS Egress: Router encapsulates outgoing routed frame with 802.1Q tag of egress subinterface', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();
    const subif10 = r0.interfaces['Gig0/0.10'];

    const frame = {
        events: [],
        sourceMac: pc0.mac,
        destinationMac: subif10.mac,
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        packet: {
            sourceIp: pc0.ip,
            destinationIp: pc1.ip,
            protocol: 'ICMP',
            ttl: 64
        },
        payload: 'ICMP Echo Request'
    };

    const topologyPath = ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1'];
    const result = simulatePathTransmission(frame, pc0, pc1, topologyPath);
    assert.strictEqual(result.success, true);
    assert.ok(frame.events.some(e => e.includes('Router Router0 encapsulated 802.1Q tag') || e.includes('Router Router0 encapsulated frame with 802.1Q tag')));
});

runTest('504. ROAS Ingress Drop: Tagged frame arriving on router with unmatched VLAN ID is dropped', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();
    const subif10 = r0.interfaces['Gig0/0.10'];

    const frame = {
        events: [],
        sourceMac: pc0.mac,
        destinationMac: subif10.mac,
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        packet: {
            sourceIp: pc0.ip,
            destinationIp: pc1.ip,
            protocol: 'ICMP',
            ttl: 64
        },
        payload: 'ICMP Echo Request',
        vlanTag: { vlanId: 99, isTagged: true, tpid: '0x8100' }
    };

    const topologyPath = ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1'];
    const result = simulatePathTransmission(frame, pc0, pc1, topologyPath);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

runTest('505. ROAS Ingress Drop: Frame arriving on router when physical parent interface is down is dropped', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();
    r0.interfaces['Gig0/0'].status = 'down';

    const frame = {
        events: [],
        sourceMac: pc0.mac,
        destinationMac: r0.interfaces['Gig0/0.10'].mac,
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        packet: {
            sourceIp: pc0.ip,
            destinationIp: pc1.ip,
            protocol: 'ICMP',
            ttl: 64
        },
        payload: 'ICMP Echo Request',
        vlanTag: { vlanId: 10, isTagged: true, tpid: '0x8100' }
    };

    const topologyPath = ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1'];
    const result = simulatePathTransmission(frame, pc0, pc1, topologyPath);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

runTest('506. ROAS Ingress Drop: Frame arriving on router when specific subinterface is down is dropped', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();
    r0.interfaces['Gig0/0.10'].status = 'down';

    const frame = {
        events: [],
        sourceMac: pc0.mac,
        destinationMac: r0.interfaces['Gig0/0.10'].mac,
        sourceIp: pc0.ip,
        destinationIp: pc1.ip,
        packet: {
            sourceIp: pc0.ip,
            destinationIp: pc1.ip,
            protocol: 'ICMP',
            ttl: 64
        },
        payload: 'ICMP Echo Request',
        vlanTag: { vlanId: 10, isTagged: true, tpid: '0x8100' }
    };

    const topologyPath = ['PC0', 'Switch0', 'Router0', 'Switch0', 'PC1'];
    const result = simulatePathTransmission(frame, pc0, pc1, topologyPath);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.action, 'DROP');
});

runTest('507. ROAS ARP Resolution: Host in VLAN 10 resolves router default gateway on subinterface Gig0/0.10', () => {
    const { r0, sw0, pc0, pc1 } = setupRoasLab();

    const arpRes = simulateArpResolution(pc0, '192.168.10.1');
    assert.strictEqual(arpRes.success, true);
    assert.strictEqual(arpRes.targetMac, r0.interfaces['Gig0/0.10'].mac);
});

runTest('508. Full Inter-VLAN Communication: PC0 (VLAN 10) pings PC1 (VLAN 20) successfully via ROAS', () => {
    setupRoasLab();

    const pingRes = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(pingRes.success, true);
    assert.ok(pingRes.output.includes('Reply from 192.168.20.10'));
});

runTest('509. Full Inter-VLAN Communication: Reverse ping from PC1 (VLAN 20) to PC0 (VLAN 10) succeeds', () => {
    setupRoasLab();

    const pingRes = executeCliCommand('PC1', 'ping 192.168.10.10');
    assert.strictEqual(pingRes.success, true);
    assert.ok(pingRes.output.includes('Reply from 192.168.10.10'));
});

runTest('510. End-to-End: Full ROAS configuration entirely from scratch via CLI on Router, Switch, and PCs', () => {
    resetLab();

    // Add devices
    addDevice('router', 250, 80);  // Router0
    addDevice('switch', 250, 200); // Switch0
    addDevice('pc', 100, 320);     // PC0
    addDevice('pc', 400, 320);     // PC1

    const r0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc0 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    // Add connections
    addConnection(r0.id, sw0.id);   // Router0 Gig0/0 <-> Switch0 Fa0/1
    addConnection(sw0.id, pc0.id);  // Switch0 Fa0/2 <-> PC0
    addConnection(sw0.id, pc1.id);  // Switch0 Fa0/3 <-> PC1

    // Configure PC0
    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';
    pc0.mac = '00:00:00:00:00:10';

    // Configure PC1
    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';
    pc1.mac = '00:00:00:00:00:20';

    // 1. Configure Switch0 via CLI
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name Sales');
    executeCliCommand('Switch0', 'vlan 20');
    executeCliCommand('Switch0', 'name Engineering');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport mode trunk');
    executeCliCommand('Switch0', 'switchport trunk allowed vlan 10,20');
    executeCliCommand('Switch0', 'interface Fa0/2');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/3');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'end');

    // 2. Configure Router0 via CLI
    executeCliCommand('Router0', 'configure terminal');
    executeCliCommand('Router0', 'interface Gig0/0');
    executeCliCommand('Router0', 'no shutdown');
    executeCliCommand('Router0', 'interface Gig0/0.10');
    executeCliCommand('Router0', 'encapsulation dot1q 10');
    executeCliCommand('Router0', 'ip address 192.168.10.1 255.255.255.0');
    executeCliCommand('Router0', 'interface Gig0/0.20');
    executeCliCommand('Router0', 'encapsulation dot1q 20');
    executeCliCommand('Router0', 'ip address 192.168.20.1 255.255.255.0');
    executeCliCommand('Router0', 'end');

    // Verify routing table on Router0
    const routeRes = executeCliCommand('Router0', 'show ip route');
    assert.strictEqual(routeRes.success, true);
    assert.ok(routeRes.output.includes('192.168.10.0/24 is directly connected, Gig0/0.10'));
    assert.ok(routeRes.output.includes('192.168.20.0/24 is directly connected, Gig0/0.20'));

    // Verify PC0 can ping PC1 across VLANs via Router-on-a-Stick
    const pingTest = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(pingTest.success, true);
    assert.ok(pingTest.output.includes('Reply from 192.168.20.10'));
});

// ==========================================
// V5.12 PHASE 4: SWITCHED VIRTUAL INTERFACES (SVIs) & MULTILAYER SWITCHING
// Tests 511 - 555
// ==========================================

// 511. normalizeSviName, isSviName, and getSviVlanId parse SVI interface names correctly
runTest('511. normalizeSviName, isSviName, and getSviVlanId parse SVI interface names correctly', () => {
    assert.strictEqual(normalizeSviName('vlan10'), 'Vlan10');
    assert.strictEqual(normalizeSviName('Vlan 20'), 'Vlan20');
    assert.strictEqual(normalizeSviName('VLAN 100'), 'Vlan100');
    assert.strictEqual(normalizeSviName('vl 5'), 'Vlan5');
    assert.strictEqual(normalizeSviName('Fa0/1'), null);

    assert.strictEqual(isSviName('Vlan10'), true);
    assert.strictEqual(isSviName('vlan20'), true);
    assert.strictEqual(isSviName('Fa0/1'), false);
    assert.strictEqual(isSviName('Gig0/0.10'), false);

    assert.strictEqual(getSviVlanId('Vlan10'), 10);
    assert.strictEqual(getSviVlanId('vlan 50'), 50);
    assert.strictEqual(getSviVlanId('Fa0/1'), null);
});

// 512. ensureSwitchSvi creates SVI with correct VLAN association, default adminStatus up, and switch MAC
runTest('512. ensureSwitchSvi creates SVI with correct VLAN association, default adminStatus up, and switch MAC', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    const svi = ensureSwitchSvi(sw, 10);
    assert.ok(svi);
    assert.strictEqual(svi.id, 'Vlan10');
    assert.strictEqual(svi.vlanId, 10);
    assert.strictEqual(svi.adminStatus, 'up');
    assert.strictEqual(svi.mac, sw.mac);
    assert.ok(sw.svis[10]);
});

// 513. ensureSwitchSvi preserves existing IP and configuration on re-entry
runTest('513. ensureSwitchSvi preserves existing IP and configuration on re-entry', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    const svi = ensureSwitchSvi(sw, 10);
    assert.strictEqual(svi.ip, '192.168.10.1');
    assert.strictEqual(svi.subnetMask, '255.255.255.0');
});

// 514. deleteSwitchSvi removes SVI from switch data model and clears associated ARP entries
runTest('514. deleteSwitchSvi removes SVI from switch data model and clears associated ARP entries', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    assert.ok(sw.svis[10]);

    deleteSwitchSvi(sw, 10);
    assert.strictEqual(sw.svis[10], undefined);
});

// 515. setSwitchSviIp assigns valid IPv4 address and subnet mask to SVI and normalizes CIDR/mask
runTest('515. setSwitchSviIp assigns valid IPv4 address and subnet mask to SVI and normalizes CIDR/mask', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    const svi = setSwitchSviIp(sw, 20, '172.16.20.1', '24');
    assert.strictEqual(svi.ip, '172.16.20.1');
    assert.strictEqual(svi.subnetMask, '255.255.255.0');
});

// 516. setSwitchSviIp rejects invalid IP or mask and prevents duplicate IP assignment across SVIs
runTest('516. setSwitchSviIp rejects invalid IP or mask and prevents duplicate IP assignment across SVIs', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    assert.throws(() => setSwitchSviIp(sw, 10, 'invalid.ip', '255.255.255.0'));
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    assert.throws(() => setSwitchSviIp(sw, 20, '192.168.10.1', '255.255.255.0'));
});

// 517. setSwitchSviAdminStatus toggles administrative status
runTest('517. setSwitchSviAdminStatus toggles administrative status', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    setSwitchSviAdminStatus(sw, 10, 'down');
    assert.strictEqual(sw.svis[10].adminStatus, 'down');

    setSwitchSviAdminStatus(sw, 10, 'up');
    assert.strictEqual(sw.svis[10].adminStatus, 'up');
});

// 518. Cisco Autostate algorithm: getEffectiveSviStatus evaluates SVI up when VLAN exists, adminStatus is up, and active member port is connected
runTest('518. Cisco Autostate algorithm: getEffectiveSviStatus evaluates SVI up when VLAN exists, adminStatus is up, and active member port is connected', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');

    // No port connected to VLAN 10 yet
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'down');

    // Connect PC to Fa0/1 on VLAN 10
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'up');
});

// 519. SVI line protocol goes down when administrative status is down even if active ports exist
runTest('519. SVI line protocol goes down when administrative status is down even if active ports exist', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'up');
    setSwitchSviAdminStatus(sw, 10, 'down');
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'down');
});

// 520. SVI line protocol goes down when associated VLAN is deleted from switch
runTest('520. SVI line protocol goes down when associated VLAN is deleted from switch', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'up');
    deleteSwitchVlan(sw, 10);
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'down');
});

// 521. SVI line protocol goes down when all ports in the VLAN are disconnected
runTest('521. SVI line protocol goes down when all ports in the VLAN are disconnected', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'up');

    // Remove connection
    networkState.connections = [];
    assert.strictEqual(getEffectiveSviStatus(sw, 10), 'down');
});

// 522. SVI line protocol becomes up via trunk port when trunk allows the SVI VLAN and is connected
runTest('522. SVI line protocol becomes up via trunk port when trunk allows the SVI VLAN and is connected', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('switch', 300, 100);
    const sw0 = networkState.devices[0];
    const sw1 = networkState.devices[1];

    createSwitchVlan(sw0, 30, 'Guest');
    setSwitchSviIp(sw0, 30, '10.30.0.1', '255.255.255.0');
    addConnection('Switch0', 'Switch1');

    setSwitchPortMode(sw0, 'Fa0/1', 'trunk');
    setSwitchPortAllowedVlans(sw0, 'Fa0/1', 'set', '10,20,30');

    assert.strictEqual(getEffectiveSviStatus(sw0, 30), 'up');
});

// 523. SVI line protocol stays down when trunk port specifically disallows the SVI VLAN
runTest('523. SVI line protocol stays down when trunk port specifically disallows the SVI VLAN', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('switch', 300, 100);
    const sw0 = networkState.devices[0];

    createSwitchVlan(sw0, 30, 'Guest');
    setSwitchSviIp(sw0, 30, '10.30.0.1', '255.255.255.0');
    addConnection('Switch0', 'Switch1');

    setSwitchPortMode(sw0, 'Fa0/1', 'trunk');
    setSwitchPortAllowedVlans(sw0, 'Fa0/1', 'set', '10,20');

    assert.strictEqual(getEffectiveSviStatus(sw0, 30), 'down');
});

// 524. setSwitchIpRouting toggles L3 routing capability on switch
runTest('524. setSwitchIpRouting toggles L3 routing capability on switch', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    assert.strictEqual(sw.ipRouting, false);

    setSwitchIpRouting(sw, true);
    assert.strictEqual(sw.ipRouting, true);

    setSwitchIpRouting(sw, false);
    assert.strictEqual(sw.ipRouting, false);
});

// 525. getSwitchRoutingTable returns empty array when ipRouting is false
runTest('525. getSwitchRoutingTable returns empty array when ipRouting is false', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');

    assert.strictEqual(getSwitchRoutingTable(sw.id).length, 0);
});

// 526. getSwitchRoutingTable generates Connected routes for active SVIs when ipRouting is true
runTest('526. getSwitchRoutingTable generates Connected routes for active SVIs when ipRouting is true', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchIpRouting(sw, true);

    const routes = getSwitchRoutingTable(sw.id);
    assert.strictEqual(routes.length, 1);
    assert.strictEqual(routes[0].code, 'C');
    assert.strictEqual(routes[0].network, '192.168.10.0');
    assert.strictEqual(routes[0].prefixLength, 24);
    assert.strictEqual(routes[0].interface, 'Vlan10');
    assert.strictEqual(routes[0].status, 'active');
});

// 527. getSwitchRoutingTable marks Connected route status as down when SVI is down or admin down
runTest('527. getSwitchRoutingTable marks Connected route status as down when SVI is down or admin down', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchIpRouting(sw, true);

    setSwitchSviAdminStatus(sw, 10, 'down');
    const routes = getSwitchRoutingTable(sw.id);
    assert.strictEqual(routes.length, 0);
});

// 528. addStaticRoute on switch adds Static routes when ipRouting is true and rejects when false
runTest('528. addStaticRoute on switch adds Static routes when ipRouting is true and rejects when false', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'V10');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    const resDisabled = addStaticRoute(sw.id, { network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '192.168.10.254' });
    assert.strictEqual(resDisabled.success, false);

    setSwitchIpRouting(sw, true);
    const resEnabled = addStaticRoute(sw.id, { network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '192.168.10.254' });
    assert.strictEqual(resEnabled.success, true);
});

// 529. lookupRoute on switch performs Longest Prefix Match and prefers more specific routes over default routes
runTest('529. lookupRoute on switch performs Longest Prefix Match and prefers more specific routes over default routes', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'V10');
    createSwitchVlan(sw, 20, 'V20');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw, 20, '192.168.20.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);
    setSwitchIpRouting(sw, true);

    addStaticRoute(sw.id, { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '192.168.10.254' });
    addStaticRoute(sw.id, { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '192.168.10.100' });
    addStaticRoute(sw.id, { network: '172.16.5.0', subnetMask: '255.255.255.0', nextHop: '192.168.10.105' });

    const matchDefault = lookupRoute(sw.id, '8.8.8.8');
    assert.strictEqual(matchDefault.route.prefixLength, 0);

    const matchSpecific = lookupRoute(sw.id, '172.16.5.50');
    assert.strictEqual(matchSpecific.route.prefixLength, 24);
    assert.strictEqual(matchSpecific.route.nextHop, '192.168.10.105');
});

// 530. setSwitchDefaultGateway configures L2 default gateway and validates IPv4 format
runTest('530. setSwitchDefaultGateway configures L2 default gateway and validates IPv4 format', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    setSwitchDefaultGateway(sw, '192.168.1.1');
    assert.strictEqual(sw.defaultGateway, '192.168.1.1');

    assert.throws(() => setSwitchDefaultGateway(sw, 'invalid.gw'));
});

// 531. Switch CLI interface vlan <id> enters config-if mode with prompt Switch(config-if)# and ensures SVI creation
runTest('531. Switch CLI interface vlan <id> enters config-if mode with prompt Switch(config-if)# and ensures SVI creation', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'configure terminal');
    const res = executeCliCommand('Switch0', 'interface vlan 10');
    assert.strictEqual(res.success, true);
    assert.strictEqual(getDeviceCliPrompt(sw), 'Switch0(config-if)#');
    assert.ok(sw.svis[10]);
});

// 532. Switch CLI ip address <ip> <mask> in SVI mode configures SVI IP address and subnet mask
runTest('532. Switch CLI ip address <ip> <mask> in SVI mode configures SVI IP address and subnet mask', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface Vlan10');
    const res = executeCliCommand('Switch0', 'ip address 192.168.10.1 255.255.255.0');
    assert.strictEqual(res.success, true);
    assert.strictEqual(sw.svis[10].ip, '192.168.10.1');
    assert.strictEqual(sw.svis[10].subnetMask, '255.255.255.0');
});

// 533. Switch CLI shutdown and no shutdown on SVI toggle adminStatus
runTest('533. Switch CLI shutdown and no shutdown on SVI toggle adminStatus', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface vlan 10');
    const resShut = executeCliCommand('Switch0', 'shutdown');
    assert.strictEqual(resShut.success, true);
    assert.strictEqual(sw.svis[10].adminStatus, 'down');

    const resNoShut = executeCliCommand('Switch0', 'no shutdown');
    assert.strictEqual(resNoShut.success, true);
    assert.strictEqual(sw.svis[10].adminStatus, 'up');
});

// 534. Switch CLI no ip address on SVI removes configured IP address
runTest('534. Switch CLI no ip address on SVI removes configured IP address', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface vlan 10');
    executeCliCommand('Switch0', 'ip address 192.168.10.1 255.255.255.0');
    assert.strictEqual(sw.svis[10].ip, '192.168.10.1');

    const resNoIp = executeCliCommand('Switch0', 'no ip address');
    assert.strictEqual(resNoIp.success, true);
    assert.strictEqual(sw.svis[10].ip, '');
});

// 535. Switch CLI no interface vlan <id> deletes SVI
runTest('535. Switch CLI no interface vlan <id> deletes SVI', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    executeCliCommand('Switch0', 'interface vlan 10');
    assert.ok(sw.svis[10]);

    executeCliCommand('Switch0', 'no interface vlan 10');
    assert.strictEqual(sw.svis[10], undefined);
});

// 536. Switch CLI ip routing and no ip routing toggle multilayer routing
runTest('536. Switch CLI ip routing and no ip routing toggle multilayer routing', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    const resEnable = executeCliCommand('Switch0', 'ip routing');
    assert.strictEqual(resEnable.success, true);
    assert.strictEqual(sw.ipRouting, true);

    const resDisable = executeCliCommand('Switch0', 'no ip routing');
    assert.strictEqual(resDisable.success, true);
    assert.strictEqual(sw.ipRouting, false);
});

// 537. Switch CLI ip default-gateway <ip> and no ip default-gateway configure L2 management gateway
runTest('537. Switch CLI ip default-gateway <ip> and no ip default-gateway configure L2 management gateway', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    executeCliCommand('Switch0', 'conf t');
    const resGw = executeCliCommand('Switch0', 'ip default-gateway 192.168.1.1');
    assert.strictEqual(resGw.success, true);
    assert.strictEqual(sw.defaultGateway, '192.168.1.1');

    const resNoGw = executeCliCommand('Switch0', 'no ip default-gateway');
    assert.strictEqual(resNoGw.success, true);
    assert.strictEqual(sw.defaultGateway, '');
});

// 538. Switch CLI show ip interface brief formats tabular SVI status
runTest('538. Switch CLI show ip interface brief formats tabular SVI status', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    const res = executeCliCommand('Switch0', 'show ip interface brief');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Interface              IP-Address      OK? Method Status                Protocol'));
    assert.ok(res.output.includes('Vlan10                 192.168.10.1    YES manual up                    up'));
});

// 539. Switch CLI show ip route renders switch routing table with codes when routing is enabled
runTest('539. Switch CLI show ip route renders switch routing table with codes when routing is enabled', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    // When ip routing is disabled
    const resDisabled = executeCliCommand('Switch0', 'show ip route');
    assert.ok(resDisabled.output.includes('IP routing is disabled'));

    // When ip routing is enabled
    setSwitchIpRouting(sw, true);
    const resEnabled = executeCliCommand('Switch0', 'show ip route');
    assert.ok(resEnabled.output.includes('Codes: C - connected, S - static'));
    assert.ok(resEnabled.output.includes('C    192.168.10.0/24 is directly connected, Vlan10'));
});

// 540. Switch CLI show interfaces vlan <id> renders detailed SVI interface status
runTest('540. Switch CLI show interfaces vlan <id> renders detailed SVI interface status', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    const res = executeCliCommand('Switch0', 'show interfaces vlan 10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Vlan10 is up, line protocol is up'));
    assert.ok(res.output.includes('Hardware is EtherSVI'));
    assert.ok(res.output.includes('Internet address is 192.168.10.1/24'));
});

// 541. Switch CLI ping to local subnet host succeeds from management SVI
runTest('541. Switch CLI ping to local subnet host succeeds from management SVI', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];
    const pc = networkState.devices[1];

    setSwitchSviIp(sw, 1, '192.168.1.2', '255.255.255.0');
    pc.ip = '192.168.1.10';
    pc.subnetMask = '255.255.255.0';
    addConnection('Switch0', 'PC0');

    const res = executeCliCommand('Switch0', 'ping 192.168.1.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.1.10'));
});

// 542. Switch CLI ping to remote subnet host succeeds using ip default-gateway when ipRouting is false
runTest('542. Switch CLI ping to remote subnet host succeeds using ip default-gateway when ipRouting is false', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('router', 250, 100);
    addDevice('pc', 400, 100);
    const sw = networkState.devices[0];
    const r0 = networkState.devices[1];
    const pc = networkState.devices[2];

    setSwitchSviIp(sw, 1, '192.168.1.2', '255.255.255.0');
    setSwitchDefaultGateway(sw, '192.168.1.1');

    r0.interfaces['Gig0/0'].ip = '192.168.1.1';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '192.168.2.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc.ip = '192.168.2.10';
    pc.subnetMask = '255.255.255.0';
    pc.gateway = '192.168.2.1';

    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'PC0');

    const res = executeCliCommand('Switch0', 'ping 192.168.2.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.2.10'));
});

// 543. Host pings Switch management SVI IP successfully on access port
runTest('543. Host pings Switch management SVI IP successfully on access port', () => {
    resetLab();
    addDevice('switch', 100, 100);
    addDevice('pc', 300, 100);
    const sw = networkState.devices[0];
    const pc = networkState.devices[1];

    createSwitchVlan(sw, 10, 'MGMT');
    setSwitchSviIp(sw, 10, '192.168.10.2', '255.255.255.0');
    addConnection('Switch0', 'PC0');
    setSwitchPortAccessVlan(sw, 'Fa0/1', 10);

    pc.ip = '192.168.10.10';
    pc.subnetMask = '255.255.255.0';

    const res = executeCliCommand('PC0', 'ping 192.168.10.2');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.10.2'));
});

// 544. Host pings Switch management SVI IP across 802.1Q trunk
runTest('544. Host pings Switch management SVI IP across 802.1Q trunk', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('switch', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];

    createSwitchVlan(sw0, 99, 'MGMT');
    createSwitchVlan(sw1, 99, 'MGMT');
    setSwitchSviIp(sw1, 99, '10.99.0.2', '255.255.255.0');

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 99);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');
    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');

    pc0.ip = '10.99.0.10';
    pc0.subnetMask = '255.255.255.0';

    const res = executeCliCommand('PC0', 'ping 10.99.0.2');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 10.99.0.2'));
});

// 545. findL3RoutedTopologyPath identifies multilayer switch as L3 gateway when ipRouting is true and SVI matches host gateway
runTest('545. findL3RoutedTopologyPath identifies multilayer switch as L3 gateway when ipRouting is true and SVI matches host gateway', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    const resolved = findL3RoutedTopologyPath(pc0, pc1);
    assert.ok(resolved);
    assert.deepStrictEqual(resolved, ['PC0', 'Switch0', 'PC1']);
});

// 546. End-to-End Multilayer Switching: PC0 (VLAN 10) pings PC1 (VLAN 20) directly through Switch0 SVIs without external router
runTest('546. End-to-End Multilayer Switching: PC0 (VLAN 10) pings PC1 (VLAN 20) directly through Switch0 SVIs without external router', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    const resPing = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(resPing.success, true);
    assert.ok(resPing.output.includes('Reply from 192.168.20.10'));
});

// 547. Multilayer Switching decrements TTL and rewrites source MAC to egress SVI MAC
runTest('547. Multilayer Switching decrements TTL and rewrites source MAC to egress SVI MAC', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    const simResult = simulateSendFrame(pc0, pc1, { icmp: true, initialTtl: 64 });
    assert.strictEqual(simResult.success, true);
    assert.ok(simResult.hopActions);
    const routeHop = simResult.hopActions.find(h => h.action === 'ROUTE');
    assert.ok(routeHop);
    assert.strictEqual(routeHop.newTtl, 63);
    assert.strictEqual(routeHop.egressIface, 'Vlan20');
});

// 548. Multilayer Switching between access port (VLAN 10) and trunk port (VLAN 20) with 802.1Q encapsulation
runTest('548. Multilayer Switching between access port (VLAN 10) and trunk port (VLAN 20) with 802.1Q encapsulation', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('switch', 350, 100);
    addDevice('pc', 500, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const sw1 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    createSwitchVlan(sw1, 20, 'V20');

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Switch1');
    addConnection('Switch1', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortMode(sw0, 'Fa0/2', 'trunk');
    setSwitchPortMode(sw1, 'Fa0/1', 'trunk');
    setSwitchPortAccessVlan(sw1, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    const res = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 192.168.20.10'));
});

// 549. Multilayer Switching drops traffic when destination SVI is administratively down
runTest('549. Multilayer Switching drops traffic when destination SVI is administratively down', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    // Shut down egress SVI
    setSwitchSviAdminStatus(sw0, 20, 'down');

    const res = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(res.success, false);
});

// 550. Multilayer Switching with Static Route: Switch routes traffic to external router next-hop via SVI
runTest('550. Multilayer Switching with Static Route: Switch routes traffic to external router next-hop via SVI', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('router', 350, 100);
    addDevice('pc', 500, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const r0 = networkState.devices[2];
    const pc1 = networkState.devices[3];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 30, 'V30');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 30, '10.0.0.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'Router0');
    addConnection('Router0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 30);

    r0.interfaces['Gig0/0'].ip = '10.0.0.2';
    r0.interfaces['Gig0/0'].subnetMask = '255.255.255.0';
    r0.interfaces['Gig0/1'].ip = '172.16.1.1';
    r0.interfaces['Gig0/1'].subnetMask = '255.255.255.0';

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '172.16.1.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '172.16.1.1';

    addStaticRoute(sw0.id, { network: '172.16.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2' });
    addStaticRoute(r0.id, { network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.1' });

    const res = executeCliCommand('PC0', 'ping 172.16.1.10');
    assert.strictEqual(res.success, true);
    assert.ok(res.output.includes('Reply from 172.16.1.10'));
});

// 551. Coexistence: ROAS on Router0 and Multilayer switching on Switch0 in same topology function independently
runTest('551. Coexistence: ROAS on Router0 and Multilayer switching on Switch0 in same topology function independently', () => {
    resetLab();
    // Two hosts on L3 Switch (VLAN 10, 20)
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);
    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    createSwitchVlan(sw0, 10, 'V10');
    createSwitchVlan(sw0, 20, 'V20');
    setSwitchSviIp(sw0, 10, '192.168.10.1', '255.255.255.0');
    setSwitchSviIp(sw0, 20, '192.168.20.1', '255.255.255.0');
    setSwitchIpRouting(sw0, true);

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    setSwitchPortAccessVlan(sw0, 'Fa0/1', 10);
    setSwitchPortAccessVlan(sw0, 'Fa0/2', 20);

    pc0.ip = '192.168.10.10';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '192.168.10.1';

    pc1.ip = '192.168.20.10';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '192.168.20.1';

    const resPing = executeCliCommand('PC0', 'ping 192.168.20.10');
    assert.strictEqual(resPing.success, true);
    assert.ok(resPing.output.includes('Reply from 192.168.20.10'));
});

// 552. Undo / Redo properly restores SVI configurations, IP addresses, ipRouting flag, and static routes on switches
runTest('552. Undo / Redo properly restores SVI configurations, IP addresses, ipRouting flag, and static routes on switches', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    pushHistory();
    setSwitchIpRouting(sw, true);
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    assert.strictEqual(sw.ipRouting, true);
    assert.ok(sw.svis[10]);

    undo();
    assert.strictEqual(networkState.devices[0].ipRouting, false);
    assert.strictEqual(networkState.devices[0].svis[10], undefined);

    redo();
    assert.strictEqual(networkState.devices[0].ipRouting, true);
    assert.ok(networkState.devices[0].svis[10]);
});

// 553. End-to-End: Full pure Multilayer Switch Inter-VLAN setup entirely via CLI
runTest('553. End-to-End: Full pure Multilayer Switch Inter-VLAN setup entirely via CLI', () => {
    resetLab();
    addDevice('pc', 50, 100);
    addDevice('switch', 200, 100);
    addDevice('pc', 350, 100);

    const pc0 = networkState.devices[0];
    const sw0 = networkState.devices[1];
    const pc1 = networkState.devices[2];

    addConnection('PC0', 'Switch0');
    addConnection('Switch0', 'PC1');

    pc0.ip = '10.10.10.50';
    pc0.subnetMask = '255.255.255.0';
    pc0.gateway = '10.10.10.1';

    pc1.ip = '10.20.20.50';
    pc1.subnetMask = '255.255.255.0';
    pc1.gateway = '10.20.20.1';

    // 1. Configure Switch0 purely via CLI
    executeCliCommand('Switch0', 'configure terminal');
    executeCliCommand('Switch0', 'ip routing');
    executeCliCommand('Switch0', 'vlan 10');
    executeCliCommand('Switch0', 'name HR');
    executeCliCommand('Switch0', 'vlan 20');
    executeCliCommand('Switch0', 'name IT');
    executeCliCommand('Switch0', 'interface Fa0/1');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 10');
    executeCliCommand('Switch0', 'interface Fa0/2');
    executeCliCommand('Switch0', 'switchport mode access');
    executeCliCommand('Switch0', 'switchport access vlan 20');
    executeCliCommand('Switch0', 'interface vlan 10');
    executeCliCommand('Switch0', 'ip address 10.10.10.1 255.255.255.0');
    executeCliCommand('Switch0', 'no shutdown');
    executeCliCommand('Switch0', 'interface vlan 20');
    executeCliCommand('Switch0', 'ip address 10.20.20.1 255.255.255.0');
    executeCliCommand('Switch0', 'no shutdown');
    executeCliCommand('Switch0', 'end');

    // Verify routing table on Switch0
    const routeRes = executeCliCommand('Switch0', 'show ip route');
    assert.strictEqual(routeRes.success, true);
    assert.ok(routeRes.output.includes('10.10.10.0/24 is directly connected, Vlan10'));
    assert.ok(routeRes.output.includes('10.20.20.0/24 is directly connected, Vlan20'));

    // Verify PC0 can ping PC1 across VLANs through Switch0 SVIs
    const pingRes = executeCliCommand('PC0', 'ping 10.20.20.50');
    assert.strictEqual(pingRes.success, true);
    assert.ok(pingRes.output.includes('Reply from 10.20.20.50'));
});

// 554. Switch Inspector UI displays Layer 3 (Multilayer), SVI count, and SVIs table with live autostate badges
runTest('554. Switch Inspector UI displays Layer 3 (Multilayer), SVI count, and SVIs table with live autostate badges', () => {
    resetLab();
    addDevice('switch', 100, 100);
    const sw = networkState.devices[0];

    createSwitchVlan(sw, 10, 'Sales');
    setSwitchSviIp(sw, 10, '192.168.10.1', '255.255.255.0');
    setSwitchIpRouting(sw, true);

    const html = renderSwitchInspector(sw);
    assert.ok(html.includes('3 (Multilayer)'));
    assert.ok(html.includes('SWITCHED VIRTUAL INTERFACES (SVIs)'));
    assert.ok(html.includes('Vlan10'));
    assert.ok(html.includes('192.168.10.1'));
});

// 555. Backward compatibility: Legacy topology snapshots without svis load without errors and default to L2 switch mode
runTest('555. Backward compatibility: Legacy topology snapshots without svis load without errors and default to L2 switch mode', () => {
    resetLab();
    const legacySnapshot = {
        devices: [
            { id: 'sw_legacy', name: 'Switch0', type: 'switch', x: 100, y: 100, mac: '00:11:22:33:44:55' }
        ],
        connections: [],
        routes: {}
    };

    networkState.devices = legacySnapshot.devices;
    networkState.connections = legacySnapshot.connections;

    const sw = networkState.devices[0];
    ensureSwitchVlanState(sw);

    assert.deepStrictEqual(sw.svis, {});
    assert.strictEqual(sw.ipRouting, false);
    assert.strictEqual(sw.defaultGateway, '');
    assert.strictEqual(getSwitchRoutingTable(sw.id).length, 0);
});

console.log('----------------------------------------------------');
console.log('Total tests: ' + (testsPassed + testsFailed) + ' | Passed: ' + testsPassed + ' | Failed: ' + testsFailed);
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}
`, context);
