/**
 * app.js
 *
 * Entry point. Owns global app state and coordinates all modules:
 *   - Boots RDKit
 *   - Initialises Ketcher (via ketcher.js)
 *   - Calculates properties on SMILES change (via properties.js)
 *   - Handles view toggle and panel collapse
 *   - Delegates pKa tab to pka.js
 */

import { initKetcher }                    from './ketcher.js';
import { calculateProperties, renderMolecules } from './properties.js';
import { updatePkaSmiles, calculatePka }  from './pka.js';

// ----------------------------------------------------------------
// App state
// ----------------------------------------------------------------
let RDKit          = null;
let isRDKitReady   = false;
let isKetcherReady = false;
let currentMolecules = [];
let currentView    = 'cards';   // 'cards' | 'pka'

const RDKIT_CDN_BASE = 'https://unpkg.com/@rdkit/rdkit/dist/';

// ----------------------------------------------------------------
// Boot sequence
// ----------------------------------------------------------------

async function boot() {
    // Run RDKit and Ketcher init in parallel - both must be ready
    // before the loading overlay is dismissed.
    _initKetcher();
    await _initRDKit();
}

boot();

// ----------------------------------------------------------------
// RDKit
// ----------------------------------------------------------------

async function _initRDKit() {
    try {
        _setLoadingStatus('Loading RDKit...');
        await _loadScript(RDKIT_CDN_BASE + 'RDKit_minimal.js');

        _setLoadingStatus('Initializing RDKit (this may take a moment)...');

        // Wait for the module to appear on window (WASM async init)
        let attempts = 0;
        while (!window.initRDKitModule && attempts < 100) {
            await _sleep(100);
            attempts++;
        }
        if (!window.initRDKitModule) throw new Error('RDKit module not found');

        RDKit = await window.initRDKitModule({
            locateFile: (file) => RDKIT_CDN_BASE + file,
        });

        console.log('RDKit ready:', RDKit.version());
        isRDKitReady = true;
        _setLoadingStatus('Loading editor...');
        _checkReady();
    } catch (err) {
        console.error('RDKit init failed:', err);
        _setLoadingStatus('RDKit failed: ' + err.message);
        _updateStatus('RDKit failed', false);
    }
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ----------------------------------------------------------------
// Ketcher
// ----------------------------------------------------------------

function _initKetcher() {
    // Pass our SMILES-change handler to the Ketcher module
    initKetcher(_onSmilesChange);

    // Listen for the 'ketcherReady' event dispatched by ketcher.js
    window.addEventListener('ketcherReady', () => {
        isKetcherReady = true;
        _checkReady();
    });
}

/**
 * Called by ketcher.js whenever a structure is genuinely committed.
 * Recalculates properties and re-renders the active view.
 */
function _onSmilesChange(smiles) {
    currentMolecules = calculateProperties(smiles, RDKit);

    // Always re-render whichever view is active
    if (currentView === 'cards') {
        renderMolecules(currentMolecules);
    } else {
        updatePkaSmiles(currentMolecules);
    }

    // Update molecule count in status bar
    const n = currentMolecules.length;
    document.getElementById('molecule-count').textContent =
        `${n} molecule${n !== 1 ? 's' : ''}`;
}

// ----------------------------------------------------------------
// Ready gate
// ----------------------------------------------------------------

function _checkReady() {
    if (isRDKitReady && isKetcherReady) {
        document.getElementById('loading').classList.add('hidden');
        _updateStatus('Ready', true);
    }
}

function _updateStatus(text, ready) {
    document.getElementById('status-text').textContent = text;
    document.getElementById('status-dot').classList.toggle('ready', ready);
}

function _setLoadingStatus(text) {
    document.getElementById('loading-status').textContent = text;
}

// ----------------------------------------------------------------
// Mode switching - BoltzDraw (2D) / BoltzStar (3D)
// ----------------------------------------------------------------

const MODES = {
    draw: {
        subtitle:   'Molecular Structure Editor',
        panelTitle: 'Properties',
        btnClass:   'active-draw',
    },
    star: {
        subtitle:   '3D Structure Viewer',
        panelTitle: 'Viewer',
        btnClass:   'active-star',
    },
};

let currentMode = 'draw';

function switchMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    const cfg = MODES[mode];

    // Update subtitle
    document.getElementById('app-subtitle').textContent = cfg.subtitle;

    // Update panel title
    document.getElementById('panel-title').textContent = cfg.panelTitle;

    // Swap button active classes
    document.getElementById('btn-draw').className =
        'mode-btn' + (mode === 'draw' ? ' active-draw' : '');
    document.getElementById('btn-star').className =
        'mode-btn' + (mode === 'star' ? ' active-star' : '');

    // Swap canvas
    document.getElementById('ketcher-container').classList.toggle('hidden', mode === 'star');
    document.getElementById('molstar-container').classList.toggle('hidden', mode === 'draw');

    // Show/hide the Cards/pKa toggle (not relevant in BoltzStar)
    document.getElementById('view-toggle').classList.toggle('hidden', mode === 'star');
}

document.getElementById('btn-draw').addEventListener('click', () => switchMode('draw'));
document.getElementById('btn-star').addEventListener('click', () => switchMode('star'));



document.getElementById('view-cards').addEventListener('click', () => {
    currentView = 'cards';
    document.getElementById('view-cards').classList.add('active');
    document.getElementById('view-pka').classList.remove('active');
    document.getElementById('molecules-list').classList.remove('hidden');
    document.getElementById('pka-container').classList.remove('active');
    renderMolecules(currentMolecules);
});

document.getElementById('view-pka').addEventListener('click', () => {
    currentView = 'pka';
    document.getElementById('view-pka').classList.add('active');
    document.getElementById('view-cards').classList.remove('active');
    document.getElementById('molecules-list').classList.add('hidden');
    document.getElementById('pka-container').classList.add('active');
    updatePkaSmiles(currentMolecules);
});

// ----------------------------------------------------------------
// pKa button
// ----------------------------------------------------------------

document.getElementById('calculate-pka-btn').addEventListener('click', () => {
    calculatePka(currentMolecules);
});

// ----------------------------------------------------------------
// Panel collapse toggle
// ----------------------------------------------------------------

document.getElementById('panel-toggle').addEventListener('click', () => {
    const panel    = document.getElementById('properties-panel');
    const toggle   = document.getElementById('panel-toggle');
    const collapsed = panel.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', collapsed);
    toggle.querySelector('span').textContent = collapsed ? '▶' : '◀';
});
