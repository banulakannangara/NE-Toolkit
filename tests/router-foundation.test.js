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

console.log('----------------------------------------------------');
console.log('Total tests: ' + (testsPassed + testsFailed) + ' | Passed: ' + testsPassed + ' | Failed: ' + testsFailed);
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
}
`, context);
