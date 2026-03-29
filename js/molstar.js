/**
 * molstar.js
 *
 * BoltzStar - Molstar 5.7.0 3D structure viewer.
 *
 * Boltz Style Preset
 * ------------------
 * Protein (polymer):  molecular-surface, blue  #5078D2, alpha 0.3
 * Ligand:             molecular-surface, yellow #FCC400, alpha 1.0
 * Background:         transparent
 *
 * HOW THE PRESET WORKS (learned from state file analysis)
 * -------------------------------------------------------
 * Every broken previous attempt called either:
 *   - plugin.managers.structure.component.add()
 *   - plugin.builders.structure.tryCreateComponentStatic()
 *   - plugin.managers.structure.component.clear()
 *
 * All three internally call t.add() → t.getSelection() which throws
 * TypeError in 5.7.0. The fix is to NEVER create or clear components.
 *
 * When a structure loads, Molstar auto-creates polymer + ligand
 * components with default representations (cartoon + ball-and-stick).
 * We walk those existing representations and update them in-place using
 * plugin.build().to(reprCell).update(newParams).commit()
 *
 * The exact params format is taken directly from the .molx state file:
 *   type:       { name: 'molecular-surface', params: { alpha } }
 *   colorTheme: { name: 'uniform', params: { value: INTEGER_COLOR } }
 *   sizeTheme:  { name: 'physical', params: { scale: 1 } }
 *
 * Color values are plain 0xRRGGBB integers - NOT {r,g,b} objects.
 * Yellow 0xFCC400 matches the exact overpaint color from the state file.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@5.7.0/build/viewer/molstar.js';

// Colors confirmed from state file analysis (plain 0xRRGGBB integers)
const COLOR = {
    protein: 0x5078D2,  // blue
    ligand:  0xFCC400,  // yellow - exact match from state overpaint color
};

// Component keys Molstar assigns to non-polymer entities
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
 * Apply Boltz Style preset.
 *
 * Walks the auto-generated component hierarchy and updates each
 * representation in-place via the state builder. No component
 * creation or clearing - that's what caused getSelection errors.
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        // 1. Transparent background + illustrative outline + occlusion
        //    All params taken directly from saved .molx state file
        await viewer?.plugin?.canvas3d?.setProps({
            renderer: { backgroundColor: { r: 0, g: 0, b: 0, a: 0 } },
            postprocessing: {
                outline: {
                    name: 'on',
                    params: {
                        scale:              1,
                        color:              0x000000,
                        threshold:          0.33,
                        includeTransparent: true,
                    },
                },
                occlusion: {
                    name: 'on',
                    params: {
                        samples:              32,
                        radius:               5,
                        bias:                 0.8,
                        blurKernelSize:       15,
                        blurDepthBias:        0.5,
                        resolutionScale:      1,
                        color:                0,
                        transparentThreshold: 0.4,
                    },
                },
            },
        });

        const structures =
            plugin.managers.structure.hierarchy.current.structures;

        for (const structRef of structures) {

            // Snapshot before modifying to avoid iteration issues
            const components = [...structRef.components];

            console.log('BoltzStar preset - components:',
                components.map(c => `${c.key}(${c.representations.length})`).join(', ')
            );

            for (const comp of components) {
                const key = (comp.key || '').toLowerCase();

                if (key === 'water' || key === 'ion' || key === 'coarse') continue;

                const isLigand = LIGAND_KEYS.has(key);
                const color    = isLigand ? COLOR.ligand : COLOR.protein;
                const alpha    = isLigand ? 1.0           : 0.3;

                // Step 1: delete existing representations (cartoon/ball-and-stick)
                // We cannot change type.name via .update() - it is silently ignored
                const reprRefs = [...comp.representations];
                for (const repr of reprRefs) {
                    try {
                        await plugin.build().to(repr.cell).delete().commit();
                    } catch (e) {
                        console.warn(`  Could not delete repr on "${key}":`, e.message);
                    }
                }

                // Step 2: add fresh molecular-surface with Boltz style
                // ignoreLight:true = flat shading (the illustrative effect)
                try {
                    await plugin.builders.structure.representation.addRepresentation(
                        comp.cell,
                        {
                            type:       'molecular-surface',
                            typeParams: {
                                alpha,
                                ignoreLight: true,
                            },
                            color:       'uniform',
                            colorParams: { value: color },
                        }
                    );
                    console.log(`  "${key}" → ${isLigand ? 'yellow solid' : 'blue 30%'} surface`);
                } catch (e) {
                    console.warn(`  addRepresentation failed for "${key}":`, e.message);
                }
            }
        }

        console.log('Boltz style preset applied');
    } catch (err) {
        console.error('Preset failed:', err);
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
        // Safe to ignore - canvas3d may not be ready on first init
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