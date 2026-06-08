/* =====================================================
   NetMaster Toolkit - Main JavaScript File
   Handles navigation, mobile menu, and shared functionality
   ===================================================== */

// ========== DOCUMENT READY - PAGE INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeMobileMenu();
    setActiveNavLink();
});

/**
 * Initialize mobile menu toggle
 * Handles hamburger menu interaction for responsive design
 */
function initializeMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when a link is clicked
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-container')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }
}

/**
 * Initialize navigation
 * Sets up click handlers for smooth scrolling and navigation
 */
function initializeNavigation() {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && document.querySelector(href)) {
                e.preventDefault();
                document.querySelector(href).scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Set active navigation link based on current page
 * Highlights the current page in the navigation menu
 */
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href.includes(currentPage) || 
            (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Show alert message with specified type
 * @param {string} message - Alert message text
 * @param {string} type - Alert type: 'error', 'success', or 'warning'
 * @param {HTMLElement} container - Container to append alert to
 * @param {number} duration - Duration in ms before auto-dismissal (0 = no auto-dismiss)
 */
function showAlert(message, type, container, duration = 5000) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    if (container) {
        container.insertBefore(alert, container.firstChild);
    } else {
        document.querySelector('.container')?.insertBefore(alert, document.querySelector('.container').firstChild);
    }

    if (duration > 0) {
        setTimeout(() => {
            alert.remove();
        }, duration);
    }

    return alert;
}

/**
 * Validate IPv4 address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IPv4 format
 */
function isValidIPv4(ip) {
    const ipv4Regex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
    return ipv4Regex.test(ip);
}

/**
 * Validate subnet mask format
 * @param {string} mask - Subnet mask to validate
 * @returns {boolean} - True if valid subnet mask format
 */
function isValidSubnetMask(mask) {
    const maskRegex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
    return maskRegex.test(mask);
}

/**
 * Validate CIDR notation (e.g., 192.168.1.0/24)
 * @param {string} cidr - CIDR notation to validate
 * @returns {boolean} - True if valid CIDR format
 */
function isValidCIDR(cidr) {
    const parts = cidr.split('/');
    if (parts.length !== 2) return false;
    const ip = parts[0];
    const prefix = parseInt(parts[1]);
    return isValidIPv4(ip) && prefix >= 0 && prefix <= 32;
}

/**
 * Convert IP address string to 32-bit binary number
 * @param {string} ip - IPv4 address string
 * @returns {number} - 32-bit integer representation
 */
function ipToNumber(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    
    let num = 0;
    for (let i = 0; i < 4; i++) {
        const part = parseInt(parts[i]);
        if (isNaN(part) || part < 0 || part > 255) return null;
        num = (num << 8) + part;
    }
    return num >>> 0; // Convert to unsigned 32-bit
}

/**
 * Convert 32-bit binary number to IPv4 address string
 * @param {number} num - 32-bit integer
 * @returns {string} - IPv4 address string
 */
function numberToIP(num) {
    return [(num >>> 24) & 0xFF,
            (num >>> 16) & 0xFF,
            (num >>> 8) & 0xFF,
            num & 0xFF].join('.');
}

/**
 * Convert decimal number to 8-bit binary string with leading zeros
 * @param {number} num - Number to convert
 * @returns {string} - 8-bit binary string
 */
function decToBinary8Bit(num) {
    return num.toString(2).padStart(8, '0');
}

/**
 * Convert CIDR prefix to subnet mask
 * @param {number} prefix - CIDR prefix (0-32)
 * @returns {string} - Subnet mask in dotted decimal notation
 */
function cidrToSubnetMask(prefix) {
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    return numberToIP(mask);
}

/**
 * Convert subnet mask to CIDR prefix
 * @param {string} mask - Subnet mask in dotted decimal notation
 * @returns {number|null} - CIDR prefix or null if invalid
 */
function subnetMaskToCIDR(mask) {
    const num = ipToNumber(mask);
    if (num === null) return null;

    // Check if it's a valid subnet mask (contiguous 1s followed by 0s)
    let prefix = 0;
    let currentNum = 0x80000000;
    
    for (let i = 0; i < 32; i++) {
        if ((num & currentNum) === currentNum) {
            prefix++;
            currentNum >>>= 1;
        } else {
            break;
        }
    }

    // Verify remaining bits are all 0
    for (let i = prefix; i < 32; i++) {
        if ((num & (1 << (31 - i))) !== 0) return null;
    }

    return prefix;
}

/**
 * Calculate subnet information from IP and mask
 * @param {string} ip - IPv4 address
 * @param {string} mask - Subnet mask
 * @returns {object|null} - Object with subnet details or null if invalid
 */
function calculateSubnet(ip, mask) {
    const ipNum = ipToNumber(ip);
    const maskNum = ipToNumber(mask);

    if (ipNum === null || maskNum === null) return null;

    // Calculate network address
    const networkNum = ipNum & maskNum;
    const networkAddress = numberToIP(networkNum);

    // Calculate broadcast address
    const broadcastNum = networkNum | (~maskNum >>> 0);
    const broadcastAddress = numberToIP(broadcastNum);

    // Calculate host range
    const firstHostNum = networkNum + 1;
    const lastHostNum = broadcastNum - 1;
    const firstHost = numberToIP(firstHostNum);
    const lastHost = numberToIP(lastHostNum);

    // Calculate number of hosts
    const hostCount = (lastHostNum - firstHostNum + 1);

    // Get CIDR notation
    const cidr = subnetMaskToCIDR(mask);

    // Calculate wildcard mask
    const wildcardNum = ~maskNum >>> 0;
    const wildcardMask = numberToIP(wildcardNum);

    return {
        networkAddress,
        broadcastAddress,
        firstHost,
        lastHost,
        hostCount,
        cidr,
        wildcardMask,
        mask
    };
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @param {HTMLElement} element - Element to show feedback on (optional)
 */
function copyToClipboard(text, element = null) {
    navigator.clipboard.writeText(text).then(() => {
        if (element) {
            const originalText = element.textContent;
            element.textContent = '✓ Copied!';
            setTimeout(() => {
                element.textContent = originalText;
            }, 2000);
        }
    }).catch(() => {
        console.error('Failed to copy to clipboard');
    });
}

/**
 * Format large numbers with thousands separator
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Clear all alerts from container
 * @param {HTMLElement} container - Container to clear alerts from
 */
function clearAlerts(container) {
    container.querySelectorAll('.alert').forEach(alert => {
        alert.remove();
    });
}

/**
 * Reset form to initial state
 * @param {HTMLElement} form - Form element to reset
 */
function resetForm(form) {
    form.reset();
    clearAlerts(form.parentElement);
    const resultContainer = form.parentElement.querySelector('.result-container');
    if (resultContainer) {
        resultContainer.classList.remove('show');
    }
}

// ========== EVENT LISTENER FOR SMOOTH PAGE TRANSITIONS ==========
window.addEventListener('beforeunload', () => {
    // Optional: Add page transition effects
});

// ========== THEME MANAGEMENT (OPTIONAL FOR FUTURE EXPANSION) ==========
/**
 * Initialize theme management
 * Can be extended to support light/dark theme switching
 */
function initializeTheme() {
    // Dark theme is default. This function can be extended
    // to support theme switching in the future
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

// Call theme initialization
initializeTheme();

// Export functions for use in other pages
window.NetMasterUtils = {
    showAlert,
    isValidIPv4,
    isValidSubnetMask,
    isValidCIDR,
    ipToNumber,
    numberToIP,
    decToBinary8Bit,
    cidrToSubnetMask,
    subnetMaskToCIDR,
    calculateSubnet,
    copyToClipboard,
    formatNumber,
    clearAlerts,
    resetForm
};
