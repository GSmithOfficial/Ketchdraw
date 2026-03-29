/**
 * molstar.js
 *
 * BoltzStar - Molstar 3D structure viewer integration.
 *
 * Boltz Style Preset
 * ------------------
 * Protein (polymer):  molecular-surface, blue #5078D2, alpha 0.3
 * Ligand:             molecular-surface, yellow #F5C83C, alpha 1.0
 * Background:         transparent
 *
 * ARCHITECTURE NOTE
 * -----------------
 * Both plugin.managers.structure.component.add() and
 * plugin.builders.structure.tryCreateComponentStatic() internally call
 * an internal t.add() which calls t.getSelection() - this throws a
 * TypeError in Molstar 3.45 because the method signature changed.
 *
 * The fix is to NEVER create components. Instead:
 *   1. Load the structure (Molstar auto-creates polymer + ligand components)
 *   2. Iterate the existing component hierarchy
 *   3. Update each representation in-place via plugin.build().to(cell).update()
 *
 * The state builder completely bypasses the component manager.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@5.7.0/build/viewer/molstar.js';

// Boltz preset colours - Molstar Color is a plain 0xRRGGBB integer
const COLOR = {
    protein: 0x5078D2,   // blue
    ligand:  0xF5C83C,   // yellow
};

// Component keys that Molstar assigns to non-polymer/ligand components
const LIGAND_KEYS = new Set(['ligand', 'non-polymer', 'branched', 'coarse']);

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

/** Load by RCSB PDB ID */
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

/** Load from uploaded .cif / .pdb / .mmcif file */
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
 * Strategy: iterate the existing auto-generated components (polymer,
 * ligand, water...) and update their representations in-place using
 * the state builder. No component creation = no getSelection() crash.
 *
 *   polymer → blue (#5078D2) molecular-surface, alpha 0.3
 *   ligand  → yellow (#F5C83C) molecular-surface, alpha 1.0
 *   water / other → hidden (alpha 0)
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        // 1. Transparent background
        await _setTransparentBackground();

        // 2. Walk the structure hierarchy
        const structures =
            plugin.managers.structure.hierarchy.current.structures;

        for (const structRef of structures) {
            for (const comp of structRef.components) {
                const key   = (comp.key || '').toLowerCase();
                const isLig = LIGAND_KEYS.has(key);
                const isWater = key === 'water';

                // Skip water entirely
                if (isWater) continue;

                const color = isLig ? COLOR.ligand  : COLOR.protein;
                const alpha = isLig ? 1.0            : 0.3;

                // 3. Update each representation via state builder
                //    This bypasses component.add() and getSelection() entirely
                for (const repr of comp.representations) {
                    try {
                        await plugin.build()
                            .to(repr.cell)
                            .update(current => ({
                                ...current,
                                type: {
                                    name:   'molecular-surface',
                                    params: { alpha },
                                },
                                colorTheme: {
                                    name:   'uniform',
                                    params: { value: color },
                                },
                            }))
                            .commit();
                    } catch (e) {
                        console.warn(`Skipping representation for "${key}":`, e.message);
                    }
                }
            }
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
        // canvas3d may not be ready on first init - safe to ignore
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