/**
 * peptide.js
 *
 * Converts a single-letter amino acid sequence to a SMILES string and
 * loads it into the Ketcher editor.
 *
 * Supports all 20 standard amino acids (ACDEFGHIKLMNPQRSTVWY).
 * Proline is handled specially because its backbone N is part of a ring.
 * Glycine has no stereocentre on its alpha carbon.
 * All other L-amino acids get [C@@H] stereochemistry at the alpha carbon.
 *
 * The generated SMILES is validated and canonicalised via RDKit before
 * being passed to Ketcher, so minor SMILES quirks never reach the editor.
 */

import { loadMolecule } from './ketcher.js';

/* ----------------------------------------------------------------
   Amino acid side-chain fragments (attached at alpha carbon)
---------------------------------------------------------------- */
const SIDE_CHAIN = {
    A: 'C',                       // Alanine      — methyl
    C: 'CS',                      // Cysteine     — thiomethyl
    D: 'CC(=O)O',                 // Aspartate    — carboxymethyl
    E: 'CCC(=O)O',                // Glutamate    — 2-carboxyethyl
    F: 'Cc1ccccc1',               // Phenylalanine— benzyl
    H: 'Cc1c[nH]cn1',             // Histidine    — 4-imidazolylmethyl
    I: 'C(C)CC',                  // Isoleucine   — sec-butyl
    K: 'CCCCN',                   // Lysine       — 4-aminobutyl
    L: 'CC(C)C',                  // Leucine      — isobutyl
    M: 'CCSC',                    // Methionine   — 2-(methylthio)ethyl
    N: 'CC(=O)N',                 // Asparagine   — carbamidomethyl
    Q: 'CCC(=O)N',                // Glutamine    — 3-carbamidopropyl
    R: 'CCCNC(=N)N',              // Arginine     — 3-guanidinopropyl
    S: 'CO',                      // Serine       — hydroxymethyl
    T: 'C(O)C',                   // Threonine    — 1-hydroxyethyl
    V: 'C(C)C',                   // Valine       — isopropyl
    W: 'Cc1c[nH]c2ccccc12',       // Tryptophan   — 3-indolylmethyl
    Y: 'Cc1ccc(O)cc1',            // Tyrosine     — 4-hydroxybenzyl
    // G (Glycine) and P (Proline) handled separately below
};

const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''));

/**
 * Build a linear peptide SMILES from a sequence of single-letter codes.
 *
 * Chain pattern (L-amino acids):
 *   N [C@@H](R1) C(=O) N [C@@H](R2) C(=O) … N [C@@H](Rn) C(=O) O
 *
 * Glycine (G): no chiral centre → alpha carbon written as plain C
 * Proline (P): backbone N is ring atom → N<k>CCC[C@@H]<k> pattern
 *
 * @param {string} sequence  — single-letter amino acid codes (case-insensitive)
 * @returns {string|null}    — SMILES string, or null if no valid residues
 */
function _peptideToSmiles(sequence) {
    // Filter to known amino acids only
    const residues = sequence
        .toUpperCase()
        .split('')
        .filter(aa => VALID_AA.has(aa));

    if (residues.length === 0) return null;

    let smiles = 'N';   // N-terminus free amine
    let ringN  = 1;     // Proline ring label counter (safe to reuse after closure)

    for (let i = 0; i < residues.length; i++) {
        const aa     = residues[i];
        const isLast = i === residues.length - 1;

        if (aa === 'G') {
            // Achiral alpha carbon — no branch needed, just CH2
            smiles += 'CC(=O)';
        } else if (aa === 'P') {
            // Proline: the 'N' at the end of the previous fragment becomes the
            // ring-nitrogen.  Append the ring label immediately after 'N'.
            smiles += ringN + 'CCC[C@@H]' + ringN + 'C(=O)';
            ringN++;
        } else {
            smiles += '[C@@H](' + SIDE_CHAIN[aa] + ')C(=O)';
        }

        // C-terminus: hydroxyl; elsewhere: peptide-bond nitrogen
        smiles += isLast ? 'O' : 'N';
    }

    return smiles;
}

/* ----------------------------------------------------------------
   UI wiring
---------------------------------------------------------------- */

export function initPeptideBar(RDKit) {
    const bar    = document.getElementById('peptide-bar');
    const input  = document.getElementById('peptide-input');
    const btn    = document.getElementById('peptide-convert-btn');
    const status = document.getElementById('peptide-status');

    if (!bar) return;

    async function convert() {
        const raw = input.value.trim();
        if (!raw) return;

        // Filter to valid residues so the count in the message is accurate
        const valid = raw.toUpperCase().split('').filter(aa => VALID_AA.has(aa));
        if (valid.length === 0) {
            _setStatus('No valid amino acids found. Use single-letter codes (ACDEFGHIKLMNPQRSTVWY).', 'error');
            return;
        }

        const rawSmiles = _peptideToSmiles(raw);
        if (!rawSmiles) {
            _setStatus('Conversion failed — check your sequence.', 'error');
            return;
        }

        // Validate and canonicalise with RDKit
        let smiles = rawSmiles;
        try {
            const mol = RDKit.get_mol(rawSmiles);
            if (!mol || !mol.is_valid()) {
                if (mol) mol.delete();
                _setStatus('Could not parse the generated SMILES — please check for unsupported residues.', 'error');
                return;
            }
            smiles = mol.get_smiles();
            mol.delete();
        } catch (e) {
            // RDKit unavailable — proceed with raw SMILES (Ketcher will validate)
        }

        btn.disabled = true;
        _setStatus('Loading…', 'loading');

        try {
            await loadMolecule(smiles);
            _setStatus(`${valid.length}-residue peptide loaded`, 'success');
        } catch (err) {
            _setStatus('Failed to load: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', convert);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') convert(); });

    function _setStatus(msg, type) {
        status.textContent = msg;
        status.className   = 'peptide-status ' + type;
        status.classList.remove('hidden');
    }
}
