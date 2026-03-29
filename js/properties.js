/**
 * properties.js
 *
 * All RDKit property calculations and molecule card rendering.
 * Pure functions - no direct DOM side effects outside the
 * #molecules-list container.
 */

// ----------------------------------------------------------------
// Calculation
// ----------------------------------------------------------------

/**
 * Take a SMILES string (may contain multiple fragments joined by '.'),
 * calculate properties for each fragment using RDKit, and return
 * an array of molecule property objects.
 *
 * @param {string} smilesString
 * @param {object} RDKit - the initialised RDKit.js instance
 * @returns {Array} array of molecule property objects
 */
export function calculateProperties(smilesString, RDKit) {
    if (!RDKit || !smilesString?.trim()) return [];

    const smilesList = smilesString.split('.').filter(s => s.trim());
    const molecules = [];

    for (const smiles of smilesList) {
        try {
            const mol = RDKit.get_mol(smiles.trim());
            if (mol) {
                molecules.push(_calcMolProps(mol, smiles.trim()));
                mol.delete();
            }
        } catch (e) {
            console.error('Error processing SMILES:', smiles, e);
            molecules.push({ smiles: smiles.trim(), error: true });
        }
    }

    return molecules;
}

/**
 * Extract all descriptors from a single RDKit mol object.
 * @private
 */
function _calcMolProps(mol, smiles) {
    const d = JSON.parse(mol.get_descriptors());

    // Defined stereocenters - count @/@@  in SMILES
    const definedStereo = (smiles.match(/@@?/g) || []).length;

    let svg = '';
    try {
        svg = mol.get_svg(200, 150);
    } catch (e) {
        console.warn('SVG generation failed for:', smiles);
    }

    return {
        smiles,
        svg,
        mw:         d.exactmw              ? parseFloat(d.exactmw)              : null,
        clogp:      d.CrippenClogP         ? parseFloat(d.CrippenClogP)         : null,
        tpsa:       d.tpsa                 ? parseFloat(d.tpsa)                 : null,
        hba:        d.NumHBA               ?? null,
        hbd:        d.NumHBD               ?? null,
        fsp3:       d.FractionCSP3         ? parseFloat(d.FractionCSP3)         : null,
        rotBonds:   d.NumRotatableBonds    ?? null,
        hac:        d.NumHeavyAtoms        ?? null,
        hetero:     d.NumHeteroatoms       ?? null,
        arRings:    d.NumAromaticRings     ?? null,
        stereo:     definedStereo,
        unspecified: 0,
    };
}

// ----------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------

/**
 * Render molecule cards into #molecules-list.
 * Clears and rebuilds the list on every call.
 *
 * @param {Array} molecules - array returned by calculateProperties()
 */
export function renderMolecules(molecules) {
    const container = document.getElementById('molecules-list');

    if (!molecules.length) {
        _showNoMolecules(container);
        return;
    }

    container.innerHTML = molecules.map((mol, index) => _buildCard(mol, index)).join('');
}

function _showNoMolecules(container) {
    container.innerHTML = `
        <div class="no-molecules">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="3"/>
                <circle cx="4" cy="8" r="2"/>
                <circle cx="20" cy="8" r="2"/>
                <circle cx="4" cy="16" r="2"/>
                <circle cx="20" cy="16" r="2"/>
                <path d="M6 8h3M15 8h3M6 16h3M15 16h3M12 9V6M12 18v-3"/>
            </svg>
            <p>Draw a molecule to see its calculated properties</p>
        </div>`;
}

function _buildCard(mol, index) {
    if (mol.error) {
        return `
        <div class="molecule-card">
            <div class="molecule-header" style="background:var(--near-black);">
                <span>Mol ${index + 1}</span>
                <span class="molecule-smiles">Invalid structure</span>
            </div>
        </div>`;
    }

    const escaped = _escapeHtml(mol.smiles);
    const escapedJs = _escapeJs(mol.smiles);

    return `
    <div class="molecule-card">
        <div class="molecule-header">
            <span>Mol ${index + 1}</span>
            <span class="molecule-smiles" title="${escaped}">${escaped}</span>
            <button class="copy-btn"
                    onclick="navigator.clipboard.writeText('${escapedJs}')"
                    title="Copy SMILES">📋</button>
        </div>
        ${mol.svg ? `<div class="structure-preview">${mol.svg}</div>` : ''}
        <div class="properties-grid">
            ${_cell('MW',      _fmt(mol.mw, 1),        _mwClass(mol.mw))}
            ${_cell('cLogP',   _fmt(mol.clogp),        _logpClass(mol.clogp))}
            ${_cell('TPSA',    _fmt(mol.tpsa, 0),      _tpsaClass(mol.tpsa))}
            ${_cell('HBA',     _fmt(mol.hba, 0),       _hbaClass(mol.hba))}
            ${_cell('HBD',     _fmt(mol.hbd, 0),       _hbdClass(mol.hbd))}
            ${_cell('Fsp3',    _fmt(mol.fsp3))}
            ${_cell('RotB',    _fmt(mol.rotBonds, 0),  _rotbClass(mol.rotBonds))}
            ${_cell('HAC',     _fmt(mol.hac, 0))}
            ${_cell('Hetero',  _fmt(mol.hetero, 0))}
            ${_cell('ArRings', _fmt(mol.arRings, 0))}
            ${_cell('Stereo',  mol.stereo)}
            ${_cell('Unspec',  mol.unspecified, mol.unspecified > 0 ? 'warning' : '')}
        </div>
    </div>`;
}

function _cell(label, value, cls = '') {
    return `
    <div class="property-cell">
        <div class="property-label">${label}</div>
        <div class="property-value${cls ? ' ' + cls : ''}">${value}</div>
    </div>`;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function _fmt(val, decimals = 2) {
    if (val === null || val === undefined) return 'N/A';
    return typeof val === 'number' ? val.toFixed(decimals) : val;
}

function _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function _escapeJs(text) {
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ----------------------------------------------------------------
// Lipinski class helpers
// ----------------------------------------------------------------

function _mwClass(v) {
    if (v === null) return '';
    if (v > 500) return 'alert';
    if (v > 450) return 'warning';
    return '';
}

function _logpClass(v) {
    if (v === null) return '';
    if (v > 5) return 'alert';
    if (v > 4) return 'warning';
    return '';
}

function _tpsaClass(v) {
    if (v === null) return '';
    if (v > 140) return 'alert';
    if (v > 120) return 'warning';
    return '';
}

function _hbaClass(v) {
    if (v === null) return '';
    if (v > 10) return 'alert';
    if (v > 8)  return 'warning';
    return '';
}

function _hbdClass(v) {
    if (v === null) return '';
    if (v > 5) return 'alert';
    if (v > 4) return 'warning';
    return '';
}

function _rotbClass(v) {
    if (v === null) return '';
    if (v > 10) return 'alert';
    if (v > 7)  return 'warning';
    return '';
}
