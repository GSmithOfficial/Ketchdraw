/**
 * molstar.js
 *
 * BoltzStar - Molstar 3D structure viewer integration.
 *
 * Boltz Style Preset
 * ------------------
 * Protein (polymer):  molecular-surface, blue #5078D2, alpha 0.3
 * Ligand (non-poly):  molecular-surface, yellow #F5C83C, alpha 1.0
 * Background:         transparent
 *
 * KEY FIX: Molstar's Color type is a plain number (0xRRGGBB).
 * Passing an {r,g,b} object causes silent failure - the representation
 * renders with a default colour and ignores opacity. All colour values
 * must be hex integers.
 *
 * The component.add() API (used in v1) threw "t.getSelection is not a
 * function" in 3.45 because it expects internal SelectionEntry objects.
 * This version uses plugin.builders.structure which is the stable API.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js';

// ---- Boltz preset colours as Molstar Color numbers (0xRRGGBB) ----
const COLOR = {
    protein: 0x5078D2,   // blue
    ligand:  0xF5C83C,   // yellow
};

let viewer    = null;
let molLoaded = false;

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export async function initMolstar() {
    if (viewer) return;
    await _loadMolstarScript();

    viewer = await window.molstar.Viewer.create('molstar-viewport', {
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

    await _setTransparentBackground();
    console.log('Molstar viewer initialised');
}

/**
 * Load by RCSB PDB ID.
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

        await viewer.loadStructureFromUrl(
            `https://files.rcsb.org/download/${id}.cif`,
            'mmcif',
            false
        );

        molLoaded = true;
        onStatus(`Loaded ${id}`, 'success');
        document.getElementById('apply-preset-btn').disabled = false;
    } catch (err) {
        console.error('PDB load failed:', err);
        onStatus(`Could not load ${id} - check the PDB ID`, 'error');
    }
}

/**
 * Load from uploaded .cif / .pdb file.
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
 * Apply the Boltz Style preset.
 *
 * Protein  → blue (#5078D2) molecular surface, 30% opacity
 * Ligand   → yellow (#F5C83C) molecular surface, fully opaque
 * Canvas   → transparent background
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        // 1. Transparent background
        await _setTransparentBackground();

        const structures =
            plugin.managers.structure.hierarchy.current.structures;

        for (const structRef of structures) {
            const cell = structRef.cell;

            // 2. Wipe existing representations so we start clean
            await plugin.managers.structure.component.clear([structRef]);

            // 3. All work done inside one dataTransaction for atomicity
            await plugin.dataTransaction(async () => {

                // ---- Polymer (protein chain) ----
                // tryCreateComponentStatic returns undefined if the
                // selection is empty (e.g. nucleic-only files)
                const polymerComp =
                    await plugin.builders.structure.tryCreateComponentStatic(
                        cell, 'polymer', {}, 'boltz-polymer'
                    );

                if (polymerComp) {
                    await plugin.builders.structure.representation
                        .addRepresentation(polymerComp, {
                            type:        'molecular-surface',
                            typeParams:  { alpha: 0.3 },
                            color:       'uniform',
                            colorParams: { value: COLOR.protein },
                        });
                }

                // ---- Ligand (non-polymer, non-water) ----
                const ligandComp =
                    await plugin.builders.structure.tryCreateComponentStatic(
                        cell, 'ligand', {}, 'boltz-ligand'
                    );

                if (ligandComp) {
                    await plugin.builders.structure.representation
                        .addRepresentation(ligandComp, {
                            type:        'molecular-surface',
                            typeParams:  { alpha: 1.0 },
                            color:       'uniform',
                            colorParams: { value: COLOR.ligand },
                        });
                }
            });
        }

        console.log('Boltz style preset applied');
    } catch (err) {
        console.error('Preset application failed:', err);
        throw err;
    }
}

// ----------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------

async function _setTransparentBackground() {
    try {
        await viewer?.plugin?.canvas3d?.setProps({
            renderer: { backgroundColor: { r: 0, g: 0, b: 0, a: 0 } },
        });
    } catch (e) {
        // canvas3d may not be ready yet on first init - safe to ignore
    }
}

function _loadMolstarScript() {
    if (window.molstar) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s   = document.createElement('script');
        s.src     = MOLSTAR_JS_URL;
        s.onload  = resolve;
        s.onerror = () => reject(new Error('Failed to load Molstar from CDN'));
        document.head.appendChild(s);
    });
}