# 🌐 NE-Toolkit

### Network Engineering Toolkit & Browser-Based Network Simulation Environment

**NE-Toolkit** is a professional, browser-based network engineering toolkit designed for learning, experimenting with, and visualizing networking concepts.

Built entirely with **HTML, CSS, and vanilla JavaScript**, the project combines practical network calculation tools with an interactive **Network Lab** that allows users to build topologies, configure devices, create connections, and simulate network behavior directly in the browser.

> 🚧 **Project Status:** Active Development — V5

---

## ✨ Features

### 🧮 Network Engineering Tools

NE-Toolkit includes practical tools for common networking calculations.

* IPv4 Subnet Calculator
* IPv4 → Binary Converter
* CIDR ↔ Subnet Mask Converter
* Network address calculation
* Broadcast address calculation
* Usable host range calculation
* Host count calculation
* Wildcard mask calculation
* IPv4 validation
* Subnet mask validation
* CIDR validation
* IPv4 address classification
* Public/private address identification

---

# 🖥️ Network Lab

The **Network Lab** is the core of the project's simulation environment.

It provides a visual canvas where users can create and interact with network topologies.

### Supported Devices

* 💻 PC
* 💻 Laptop
* 🖥️ Server
* 🔀 Switch
* 🌐 Router

Devices can be placed directly onto the network canvas and connected together to create custom topologies.

---

## 🔗 Topology Builder

The Network Lab allows users to build network topologies interactively.

### Current capabilities

* Add network devices
* Drag devices around the canvas
* Select devices
* Create connections between devices
* Delete devices
* Delete connections
* Clear the entire topology
* Visualize connections dynamically
* Detect topology paths
* Automatically maintain connection relationships

The connection layer dynamically adapts to the canvas size so that connections remain aligned with devices when the workspace is resized.

---

# ⚙️ Device Configuration

Each supported network device has an interactive configuration inspector.

### Network configuration

Devices can be configured with:

* Device name
* IPv4 address
* Subnet mask
* Default gateway
* MAC address

The inspector performs validation before configuration changes are applied.

### Network information

The Network Lab can display:

* Network address
* Broadcast address
* Prefix length
* Host count
* Usable host range
* Gateway warnings
* Special-address warnings
* Network configuration status

Invalid configurations are highlighted before they can be applied.

---

# 🔀 Switch Simulation

Switches include runtime state for basic Layer 2 behavior.

### Current switch capabilities

* Dynamic switch port assignment
* Switch port tracking
* MAC address learning state
* MAC address table runtime
* Connection-to-port mapping
* Runtime state preservation through undo/redo

Switch ports are automatically assigned as connections are created.

Example:

```text
Switch0

Fa0/1 → PC0
Fa0/2 → PC1
Fa0/3 → Server0
```

---

# 📦 Frame Simulation

NE-Toolkit includes a visual frame-transmission workflow for demonstrating how traffic moves through a topology.

A frame can be sent from a source device toward a destination device.

The simulation provides:

* Source selection
* Destination selection
* Topology path detection
* Hop-by-hop frame movement
* Frame animation
* Delivery status
* Failure detection
* DROP events
* Simulation event information

Example:

```text
PC0
 ↓
Switch0
 ↓
Switch1
 ↓
Server0
```

The simulated frame is visually animated through the discovered topology path.

---

# 🔍 Connection Testing

The Network Lab includes a connection-testing system for checking whether two devices can communicate based on their current configuration and topology.

The system evaluates:

* Source device
* Destination device
* IPv4 configuration
* Subnet mask
* Same-subnet relationship
* Topology connectivity
* Available path

Example result:

```text
✓ Connection possible

Source:
PC0 — 192.168.1.10

Destination:
PC1 — 192.168.1.20

Network:
192.168.1.0/24
```

Invalid configurations and unreachable topology paths produce explanatory failure messages.

> **Note:** Full Layer 3 routing and router forwarding are part of the upcoming development roadmap.

---

# 🎮 Edit & Simulation Modes

The Network Lab separates topology editing from simulation.

### Edit Mode

Used to build and configure the network.

* Add devices
* Move devices
* Connect devices
* Delete devices
* Configure device properties
* Undo changes
* Redo changes

### Simulation Mode

Used to interact with the simulated network.

* Start/stop simulation
* Send frames
* Test connections
* Observe simulation events
* Inspect runtime behavior

This separation helps prevent accidental topology changes during simulation.

---

# ↩️ Undo & Redo

The Network Lab includes a history system for topology and configuration changes.

Supported state includes:

* Devices
* Connections
* Device configuration
* Selection state
* Connection state
* Switch runtime state
* MAC table state
* Switch port assignments

This allows network experiments to be safely modified and reverted.

---

# 📐 Responsive Network Canvas

The Network Lab uses a dynamically sized SVG connection layer.

The connection system automatically synchronizes with the canvas dimensions, allowing topology connections to remain correctly positioned when the workspace is resized.

This provides consistent behavior across different screen sizes and canvas dimensions.

---

# 🎨 User Interface

NE-Toolkit uses a modern dark network-engineering aesthetic.

### UI characteristics

* Dark theme
* Cyan networking accents
* Gradient elements
* Responsive layouts
* Interactive controls
* Device inspector
* Simulation controls
* Status indicators
* Visual feedback
* Smooth transitions
* Responsive network canvas

The interface is designed to feel closer to a professional engineering tool than a basic educational webpage.

---

# 🛠️ Technology Stack

## Frontend

* HTML5
* CSS3
* JavaScript ES6+

## Architecture

* Vanilla JavaScript
* No React
* No TypeScript
* No frontend framework
* No build system
* No external runtime dependencies

## Browser APIs / Technologies

* DOM API
* SVG
* Pointer Events
* ResizeObserver
* Clipboard API
* Drag & Drop API

---

# 📁 Project Structure

```text
NE-Toolkit/
│
├── index.html
│
├── css/
│   ├── style.css
│   └── network-lab.css
│
├── js/
│   ├── script.js
│   └── network-lab.js
│
├── pages/
│   ├── subnet.html
│   ├── binary.html
│   ├── cidr.html
│   └── network-lab.html
│
└── assets/
```

---

# 🧠 Networking Concepts Covered

NE-Toolkit is designed around practical networking concepts including:

### IPv4

* IPv4 addressing
* Binary representation
* Address classes
* Public/private addressing
* Network addresses
* Broadcast addresses

### Subnetting

* Subnet masks
* CIDR
* Network prefixes
* Host bits
* Network bits
* Usable hosts
* Wildcard masks
* Host ranges

### Layer 2

* MAC addresses
* Ethernet frames
* Switches
* Switch ports
* MAC address learning
* MAC tables
* Topology forwarding paths

### Layer 3

Layer 3 functionality is currently under development.

Planned concepts include:

* Routers
* Router interfaces
* Default gateways
* Inter-subnet communication
* Router forwarding
* Routing tables
* Next-hop decisions

---

# 🚀 Roadmap

NE-Toolkit is being developed toward a more complete browser-based network engineering simulation environment.

## ✅ Completed

* [x] IPv4 Subnet Calculator
* [x] IPv4 Binary Converter
* [x] CIDR Converter
* [x] Interactive Network Lab
* [x] Device placement
* [x] Device dragging
* [x] Network connections
* [x] Device inspector
* [x] IPv4 configuration
* [x] Subnet configuration
* [x] Gateway configuration
* [x] MAC configuration
* [x] Network status analysis
* [x] Topology path detection
* [x] Switch runtime state
* [x] Switch port assignment
* [x] MAC table simulation
* [x] Frame animation
* [x] Connection testing
* [x] Edit/Simulation modes
* [x] Undo/redo
* [x] Responsive SVG connection system

## 🔨 In Development

* [ ] Layer 3 router forwarding
* [ ] Router interface configuration
* [ ] Gateway-aware communication
* [ ] Inter-subnet communication
* [ ] Routing table simulation
* [ ] Next-hop forwarding decisions
* [ ] Improved packet/frame simulation
* [ ] More advanced network failure scenarios

## 🔮 Future

* [ ] IPv6 support
* [ ] VLAN simulation
* [ ] ARP simulation
* [ ] DHCP simulation
* [ ] DNS simulation
* [ ] NAT simulation
* [ ] Static routing
* [ ] Dynamic routing concepts
* [ ] VLSM calculator
* [ ] Network topology export/import
* [ ] Save/load network projects
* [ ] Packet inspection
* [ ] Advanced protocol simulation
* [ ] Network performance visualization
* [ ] Educational labs and guided exercises

---

# 🧪 Development Philosophy

NE-Toolkit is designed around three principles:

### 1. Learn

Networking concepts should be understandable through interaction rather than theory alone.

### 2. Experiment

Users should be able to build a topology, configure devices, change network parameters, and observe the results.

### 3. Visualize

Networking processes such as frame forwarding, topology paths, and device relationships should be represented visually.

---

# ⚡ Getting Started

NE-Toolkit requires no installation or package manager.

### Option 1 — Open directly

Clone or download the repository and open:

```text
index.html
```

in a modern browser.

### Option 2 — Run a local server

For the best experience with the Network Lab, run a local HTTP server:

```bash
python -m http.server 8765
```

Then open:

```text
http://localhost:8765
```

---

# 💻 Browser Compatibility

NE-Toolkit targets modern browsers supporting current HTML, CSS, and JavaScript APIs.

Recommended:

* Google Chrome
* Microsoft Edge
* Mozilla Firefox
* Safari
* Chromium-based browsers

---

# 📊 Current Project Status

| Component                    | Status            |
| ---------------------------- | ----------------- |
| Subnet Calculator            | ✅ Complete        |
| Binary Converter             | ✅ Complete        |
| CIDR Converter               | ✅ Complete        |
| Network Lab                  | ✅ Active          |
| Device Placement             | ✅ Complete        |
| Topology Connections         | ✅ Complete        |
| Device Configuration         | ✅ Complete        |
| Switch Simulation            | ✅ Complete        |
| MAC Learning Runtime         | ✅ Complete        |
| Frame Visualization          | ✅ Complete        |
| Connection Testing           | ✅ Complete        |
| Undo / Redo                  | ✅ Complete        |
| Layer 3 Routing              | 🚧 In Development |
| Router Forwarding            | 🚧 In Development |
| Advanced Protocol Simulation | 🔮 Planned        |

---

# 🎯 Project Goal

The long-term goal of NE-Toolkit is to create a lightweight, accessible network engineering environment that allows students and networking enthusiasts to **build, configure, visualize, and experiment with computer networks directly from a web browser**.

Rather than being limited to static calculators, the project is evolving toward an interactive network simulation platform where networking concepts can be explored through practical experimentation.

---

# 🤝 Contributing

Contributions, ideas, bug reports, and suggestions are welcome.

If you find an issue or have an idea for improving the Network Lab, feel free to open an issue or submit a pull request.

---

# 📜 License

This project is free to use and modify for personal or educational purposes.

---

## ❤️ Built for Network Engineers

**NE-Toolkit**

*Learn networking. Build networks. Simulate the concepts.*
