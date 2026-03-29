/**
 * molstar.js
 *
 * BoltzStar - Molstar 3D structure viewer integration.
 *
 * Boltz Style Preset
 * ------------------
 * Protein (polymer):  molecular-surface, blue (#5078d2), alpha 0.3
 * Ligand:             molecular-surface, yellow (#f5c83c), alpha 1.0
 * Background:         transparent (alpha 0)
 *
 * Loads Molstar from CDN as a script tag (no build step needed).
 * All Molstar globals are accessed via window.molstar after load.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js';

// Boltz preset colour values (RGB 0-255)
const BOLTZ_PRESET = {
    protein: { r: 80,  g: 120, b: 210 },  // blue
    ligand:  { r: 245, g: 200, b: 60  },  // yellow
};

let viewer   = null;   // molstar.Viewer instance
let molLoaded = false; // true once a structure is in the scene

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Initialise Molstar and mount it into #molstar-viewport.
 * Safe to call multiple times - only initialises once.
 */
export async function initMolstar() {
    if (viewer) return; // already initialised

    await _loadMolstarScript();

    const Viewer = window.molstar.Viewer;

    viewer = await Viewer.create('molstar-viewport', {
        // Hide Molstar's built-in UI chrome - we provide our own panel
        layoutShowControls:          false,
        layoutShowRemoteState:       false,
        layoutShowSequence:          false,
        layoutShowLog:               false,
        layoutShowLeftPanel:         false,
        layoutIsExpanded:            false,
        viewportShowExpand:          false,
        viewportShowSelectionMode:   false,
        viewportShowAnimation:       false,
        // Transparent canvas background
        canvas3d: {
            renderer: {
                backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
            },
        },
    });

    console.log('Molstar viewer initialised');
}

/**
 * Load a structure by RCSB PDB ID.
 * @param {string} pdbId - 4-character PDB accession code
 * @param {Function} onStatus - callback(message, type) where type is
 *                              'loading' | 'success' | 'error'
 */
export async function loadByPdbId(pdbId, onStatus) {
    if (!viewer) throw new Error('Molstar not initialised');

    const id = pdbId.trim().toUpperCase();
    if (!id || id.length < 3) {
        onStatus('Enter a valid PDB ID (e.g. 1ABC)', 'error');
        return;
    }

    onStatus(`Loading ${id}...`, 'loading');

    try {
        // Clear any existing structure
        await viewer.plugin.clear();
        molLoaded = false;

        // RCSB mmCIF URL
        const url = `https://files.rcsb.org/download/${id}.cif`;
        await viewer.loadStructureFromUrl(url, 'mmcif', false, {
            representationParams: _defaultRepresentationParams(),
        });

        molLoaded = true;
        onStatus(`Loaded ${id}`, 'success');

        // Enable the Apply button
        document.getElementById('apply-preset-btn').disabled = false;
    } catch (err) {
        console.error('PDB load failed:', err);
        onStatus(`Could not load ${id} - check the PDB ID`, 'error');
    }
}

/**
 * Load a structure from an uploaded File object (.cif / .pdb).
 * @param {File} file
 * @param {Function} onStatus
 */
export async function loadFromFile(file, onStatus) {
    if (!viewer) throw new Error('Molstar not initialised');

    onStatus(`Loading ${file.name}...`, 'loading');

    try {
        await viewer.plugin.clear();
        molLoaded = false;

        const format = file.name.endsWith('.pdb') ? 'pdb' : 'mmcif';
        const data   = await file.text();

        await viewer.loadStructureFromData(data, format, false, {
            representationParams: _defaultRepresentationParams(),
        });

        molLoaded = true;
        onStatus(`Loaded ${file.name}`, 'success');
        document.getElementById('apply-preset-btn').disabled = false;
    } catch (err) {
        console.error('File load failed:', err);
        onStatus(`Failed to load ${file.name}`, 'error');
    }
}

/**
 * Apply the Boltz Style preset to the currently loaded structure:
 *   - Polymer (protein): blue molecular surface at 30% opacity
 *   - Ligand:            yellow molecular surface at 100% opacity
 *   - Background:        transparent
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        // ---- Step 1: transparent background ----
        await plugin.canvas3d.setProps({
            renderer: {
                backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
            },
        });

        // ---- Step 2: rebuild representations ----
        const structures = plugin.managers.structure.hierarchy.current.structures;

        for (const s of structures) {
            // Remove all existing representations on this structure
            await plugin.managers.structure.component.clear([s]);

            // Add protein (polymer) surface - blue, 30% opacity
            await plugin.managers.structure.component.add(
                {
                    selection: { name: 'polymer', params: {} },
                    options:   { checkExisting: true, label: 'Protein' },
                    representation: 'molecular-surface',
                    representationParams: {
                        alpha: 0.3,
                        color: 'uniform',
                        colorParams: { value: BOLTZ_PRESET.protein },
                    },
                },
                [s]
            );

            // Add ligand surface - yellow, fully opaque
            await plugin.managers.structure.component.add(
                {
                    selection: { name: 'ligand', params: {} },
                    options:   { checkExisting: true, label: 'Ligand' },
                    representation: 'molecular-surface',
                    representationParams: {
                        alpha: 1.0,
                        color: 'uniform',
                        colorParams: { value: BOLTZ_PRESET.ligand },
                    },
                },
                [s]
            );
        }

        console.log('Boltz style preset applied');
    } catch (err) {
        console.error('Preset application failed:', err);
    }
}

// ----------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------

/**
 * Default representation used on initial load (before preset is applied).
 * Uses Molstar's built-in "preset-structure-representation-auto" so the
 * structure looks reasonable immediately, before the user hits Apply.
 */
function _defaultRepresentationParams() {
    return {
        preset: 'auto',
    };
}

/**
 * Dynamically inject the Molstar script tag.
 * Resolves once the script has loaded.
 */
function _loadMolstarScript() {
    // Already loaded
    if (window.molstar) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script   = document.createElement('script');
        script.src     = MOLSTAR_JS_URL;
        script.onload  = resolve;
        script.onerror = () => reject(new Error('Failed to load Molstar from CDN'));
        document.head.appendChild(script);
    });
}