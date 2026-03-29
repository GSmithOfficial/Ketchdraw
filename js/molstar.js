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
 * FIX: The previous version used plugin.managers.structure.component.add()
 * which throws "t.getSelection is not a function" in Molstar 3.45 because
 * it expects an internal SelectionEntry format, not a simple {name, params}.
 *
 * This version uses plugin.builders.structure which is the correct stable
 * API for programmatically creating components and representations.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js';

// Boltz preset colour values (RGB 0-255)
const BOLTZ_PRESET = {
    protein: { r: 80,  g: 120, b: 210 },  // blue
    ligand:  { r: 245, g: 200, b: 60  },  // yellow
};

let viewer    = null;   // molstar.Viewer instance
let molLoaded = false;  // true once a structure is in the scene

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Initialise Molstar and mount it into #molstar-viewport.
 * Safe to call multiple times - only initialises once.
 */
export async function initMolstar() {
    if (viewer) return;

    await _loadMolstarScript();

    viewer = await window.molstar.Viewer.create('molstar-viewport', {
        // Hide Molstar's built-in UI chrome - we provide our own panel
        layoutShowControls:        false,
        layoutShowRemoteState:     false,
        layoutShowSequence:        false,
        layoutShowLog:             false,
        layoutShowLeftPanel:       false,
        layoutIsExpanded:          false,
        viewportShowExpand:        false,
        viewportShowSelectionMode: false,
        viewportShowAnimation:     false,
    });

    // Set transparent background immediately after init
    await _setTransparentBackground();

    console.log('Molstar viewer initialised');
}

/**
 * Load a structure by RCSB PDB ID.
 * @param {string} pdbId     - 4-character PDB accession code
 * @param {Function} onStatus - callback(message, type)
 *                              type: 'loading' | 'success' | 'error'
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
        await viewer.plugin.clear();
        molLoaded = false;

        const url = `https://files.rcsb.org/download/${id}.cif`;
        await viewer.loadStructureFromUrl(url, 'mmcif', false);

        molLoaded = true;
        onStatus(`Loaded ${id}`, 'success');
        document.getElementById('apply-preset-btn').disabled = false;
    } catch (err) {
        console.error('PDB load failed:', err);
        onStatus(`Could not load ${id} - check the PDB ID`, 'error');
    }
}

/**
 * Load a structure from an uploaded File object (.cif / .pdb / .mmcif).
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

        await viewer.loadStructureFromData(data, format, false);

        molLoaded = true;
        onStatus(`Loaded ${file.name}`, 'success');
        document.getElementById('apply-preset-btn').disabled = false;
    } catch (err) {
        console.error('File load failed:', err);
        onStatus(`Failed to load ${file.name}`, 'error');
    }
}

/**
 * Apply the Boltz Style preset to the currently loaded structure.
 *
 * Uses plugin.builders.structure (stable API) rather than
 * plugin.managers.structure.component.add() (broken in 3.45).
 *
 *   Polymer (protein) → blue molecular surface, alpha 0.3
 *   Ligand            → yellow molecular surface, alpha 1.0
 *   Background        → transparent
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        // 1. Transparent background
        await _setTransparentBackground();

        const structures = plugin.managers.structure.hierarchy.current.structures;

        for (const structRef of structures) {
            // 2. Clear all existing representations on this structure
            await plugin.managers.structure.component.clear([structRef]);

            const cell = structRef.cell;

            // 3. Polymer (protein) - blue surface at 30% opacity
            const polymer = await plugin.builders.structure.tryCreateComponentStatic(
                cell, 'polymer', {}, 'boltz-polymer'
            );
            if (polymer) {
                await plugin.builders.structure.representation.addRepresentation(polymer, {
                    type:        'molecular-surface',
                    typeParams:  { alpha: 0.3 },
                    color:       'uniform',
                    colorParams: { value: BOLTZ_PRESET.protein },
                });
            }

            // 4. Ligand - yellow solid surface
            const ligand = await plugin.builders.structure.tryCreateComponentStatic(
                cell, 'ligand', {}, 'boltz-ligand'
            );
            if (ligand) {
                await plugin.builders.structure.representation.addRepresentation(ligand, {
                    type:        'molecular-surface',
                    typeParams:  { alpha: 1.0 },
                    color:       'uniform',
                    colorParams: { value: BOLTZ_PRESET.ligand },
                });
            }

            // 5. If no ligand found (pocket-only files), still looks good
            // with just the blue protein surface
        }

        console.log('Boltz style preset applied');
    } catch (err) {
        console.error('Preset application failed:', err);
        throw err; // let app.js surface this to the user if needed
    }
}

// ----------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------

async function _setTransparentBackground() {
    if (!viewer?.plugin?.canvas3d) return;
    await viewer.plugin.canvas3d.setProps({
        renderer: {
            backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
        },
    });
}

function _loadMolstarScript() {
    if (window.molstar) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script   = document.createElement('script');
        script.src     = MOLSTAR_JS_URL;
        script.onload  = resolve;
        script.onerror = () => reject(new Error('Failed to load Molstar from CDN'));
        document.head.appendChild(script);
    });
}