/**
 * molstar.js - BoltzStar 3D viewer
 *
 * Boltz Style Preset
 * ------------------
 * Protein (polymer):  molecular-surface, blue #5078D2, alpha 0.3
 * Ligand (non-poly):  molecular-surface, yellow #F5C83C, alpha 1.0
 * Background:         transparent
 *
 * ROOT CAUSE (diagnosed from saved state file):
 * When Molstar loads a structure it auto-creates:
 *   - polymer static component  → cartoon representation
 *   - ligand static component   → ball-and-stick representation
 *
 * Calling .update() to change type.name (cartoon → molecular-surface)
 * runs without error but is silently ignored - Molstar doesn't allow
 * changing representation type via state update, only its params.
 *
 * FIX: delete the existing representation, then add a new
 * molecular-surface one via plugin.builders.structure.representation
 * .addRepresentation(). This creates a fresh StructureRepresentation3D
 * state node and does NOT route through the broken component.add()
 * / getSelection() path.
 */

const MOLSTAR_JS_URL =
    'https://cdn.jsdelivr.net/npm/molstar@5.7.0/build/viewer/molstar.js';

// Boltz colours - Molstar Color is a plain 0xRRGGBB integer
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
 * Strategy (informed by state file analysis):
 *   1. Set transparent background
 *   2. For each auto-generated component (polymer, ligand):
 *      a. DELETE existing representation (cartoon / ball-and-stick)
 *      b. ADD new molecular-surface representation with Boltz colours
 *
 * We delete+add rather than update because Molstar silently ignores
 * type.name changes via .update() - the representation type is fixed
 * at creation time.
 */
export async function applyBoltzPreset() {
    if (!viewer || !molLoaded) return;

    const plugin = viewer.plugin;

    try {
        await _setTransparentBackground();

        const structures =
            plugin.managers.structure.hierarchy.current.structures;

        for (const structRef of structures) {

            // Snapshot the component list before we start deleting
            // (modifying the hierarchy while iterating causes issues)
            const components = [...structRef.components];

            console.log('BoltzStar preset - components:',
                components.map(c => `${c.key}(${c.representations.length})`).join(', ')
            );

            for (const comp of components) {
                const key = (comp.key || '').toLowerCase();

                // Skip water and other solvent components
                if (key === 'water' || key === 'ion' || key === 'coarse') continue;

                // Determine protein vs ligand
                // comp.key for auto-created static components is the
                // short params value: 'polymer', 'ligand', 'non-polymer' etc.
                const isLigand =
                    key === 'ligand'       ||
                    key === 'non-polymer'  ||
                    key.includes('ligand') ||
                    key.includes('non-polymer');

                const color = isLigand ? COLOR.ligand  : COLOR.protein;
                const alpha = isLigand ? 1.0            : 0.3;

                // Step 1: delete all existing representations on this component
                const reprRefs = [...comp.representations];
                for (const repr of reprRefs) {
                    try {
                        await plugin.build().to(repr.cell).delete().commit();
                    } catch (e) {
                        console.warn(`  Could not delete repr on "${key}":`, e.message);
                    }
                }

                // Step 2: add a fresh molecular-surface representation
                // addRepresentation() creates a new StructureRepresentation3D
                // state node - it does NOT go through component.add() / getSelection()
                try {
                    await plugin.builders.structure.representation.addRepresentation(
                        comp.cell,
                        {
                            type:        'molecular-surface',
                            typeParams:  { alpha },
                            color:       'uniform',
                            colorParams: { value: color },
                        }
                    );
                    console.log(`  Applied molecular-surface to "${key}" (${isLigand ? 'yellow solid' : 'blue 30%'})`);
                } catch (e) {
                    console.warn(`  addRepresentation failed for "${key}":`, e.message);
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
        // canvas3d may not be ready on first init
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