/**
 * ketcher.js
 *
 * Handles all Ketcher iframe communication and interaction detection.
 *
 * Ghost-molecule fix
 * ------------------
 * When a template tool (e.g. cyclopropane) is selected and the user hovers
 * over the canvas WITHOUT clicking, Ketcher renders a ghost/preview of that
 * structure internally - and getSmiles() returns it as if it were real.
 * We block all SMILES polling while isHoveringKetcherFrame is true so those
 * ghost structures never reach the properties panel.
 */

let ketcherInstance = null;
let lastCommittedSmiles = '';
let isHoveringKetcherFrame = false;
let userHasInteracted = false;
let updateTimer = null;

// Callback fired whenever the canvas SMILES genuinely changes
let onSmilesChangeFn = null;

/**
 * Initialise Ketcher and start listening for structure changes.
 * @param {Function} onSmilesChange - called with the new SMILES string
 *                                    whenever a structure is committed
 */
export function initKetcher(onSmilesChange) {
    onSmilesChangeFn = onSmilesChange;
    const frame = document.getElementById('ketcher-frame');

    // Path 1 - Ketcher posts an 'init' message when it's ready
    window.addEventListener('message', (event) => {
        if (event.data.eventType === 'init') {
            console.log('Ketcher ready via message');
            ketcherInstance = frame.contentWindow.ketcher;
            _setupInteractionDetection(frame);
            // Signal readiness back to app.js
            window.dispatchEvent(new CustomEvent('ketcherReady'));
        }
    });

    // Path 2 - Direct access fallback after iframe load
    frame.onload = () => {
        setTimeout(() => {
            try {
                if (frame.contentWindow?.ketcher && !ketcherInstance) {
                    ketcherInstance = frame.contentWindow.ketcher;
                    console.log('Ketcher connected directly');
                    _setupInteractionDetection(frame);
                    window.dispatchEvent(new CustomEvent('ketcherReady'));
                }
            } catch (e) {
                console.warn('Direct Ketcher access failed:', e);
            }
        }, 2000);
    };
}

/**
 * Wire up all the mouse/keyboard listeners that drive the ghost-molecule fix
 * and the debounced SMILES change detection.
 */
function _setupInteractionDetection(frame) {

    // --- Ghost-molecule guard ---
    // Set flag ON when cursor enters iframe (ghost may appear)
    frame.addEventListener('mouseenter', () => {
        isHoveringKetcherFrame = true;
        userHasInteracted = false;
    });

    // Set flag OFF when cursor leaves (Ketcher clears ghost - safe to poll)
    frame.addEventListener('mouseleave', () => {
        isHoveringKetcherFrame = false;
        if (userHasInteracted) _triggerDelayedUpdate();
    });

    // mouseup inside frame = potential structure placement
    document.addEventListener('mouseup', (e) => {
        const rect = frame.getBoundingClientRect();
        const inside = (
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom
        );
        if (inside) {
            userHasInteracted = true;
            _triggerDelayedUpdate();
        }
    });

    // Keyboard: delete, undo, paste etc.
    document.addEventListener('keyup', (e) => {
        if (['Delete', 'Backspace', 'Enter', 'v', 'V', 'z', 'Z'].includes(e.key)) {
            userHasInteracted = true;
            _triggerDelayedUpdate();
        }
    });

    // 1-second fallback poll - skipped entirely while hovering
    setInterval(_checkForCommittedChanges, 1000);
}

/**
 * Programmatically load a SMILES string into the Ketcher canvas.
 * Resets the committed-SMILES cache so the normal polling loop will
 * pick up the new structure and update the properties panel.
 */
export async function loadMolecule(smiles) {
    if (!ketcherInstance) throw new Error('Ketcher not ready');
    await ketcherInstance.setMolecule(smiles);
    // Clear cache — next polling tick will detect the change and fire onSmilesChangeFn
    lastCommittedSmiles = '';
}

/**
 * Debounce helper - waits 300 ms after last interaction before polling.
 * Skipped if mouse is still inside the frame (ghost could still be live).
 */
function _triggerDelayedUpdate() {
    if (isHoveringKetcherFrame) return;
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(_checkForCommittedChanges, 300);
}

/**
 * Read current SMILES from Ketcher. Only proceeds if:
 *   - Ketcher is initialised
 *   - Mouse is outside the frame (ghost-molecule guard)
 *   - SMILES has actually changed since last commit
 */
async function _checkForCommittedChanges() {
    if (!ketcherInstance) return;
    if (isHoveringKetcherFrame) return; // ghost guard

    try {
        const smiles = await ketcherInstance.getSmiles();
        if (smiles !== lastCommittedSmiles) {
            lastCommittedSmiles = smiles;
            if (typeof onSmilesChangeFn === 'function') {
                onSmilesChangeFn(smiles);
            }
        }
    } catch (e) {
        // Silently ignore - Ketcher can throw during tool transitions
    }
}
