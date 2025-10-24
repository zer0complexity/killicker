// MapMenu: overlay control that shows a hamburger menu with checkboxes per track
export default class MapMenu {
    /**
     * @param {google.maps.Map} map
     * @param {Array} tracks - Array of track metadata objects {id, pointCount}
     * @param {Function} onChange - Callback (trackId, checked) when checkbox toggled
     */
    constructor(map, tracks = [], onChange = () => {}) {
        this.map = map;
        this.onChange = onChange;
        this.container = document.createElement('div');
        this.container.className = 'map-menu-container';

        // Header / hamburger button
        this.header = document.createElement('div');
        this.header.className = 'map-menu-header';
        this.hamburger = document.createElement('div');
        this.hamburger.className = 'map-menu-hamburger';
        this.hamburger.innerHTML = '&#9776;'; // simple hamburger
        this.title = document.createElement('div');
        this.title.className = 'map-menu-title';
        this.title.textContent = 'Tracks';
        this.header.appendChild(this.hamburger);
        this.header.appendChild(this.title);
        this.container.appendChild(this.header);

        // Body (checkbox list)
        this.body = document.createElement('div');
        this.body.className = 'map-menu-body';
        this.container.appendChild(this.body);

        // Toggle body visibility when header clicked
        this.header.addEventListener('click', () => {
            this.container.classList.toggle('open');
        });

        // Insert into map controls
        this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(this.container);

        this.checkboxes = new Map();
        this.setTracks(tracks);
    }

    /**
     * Replace the track list in the menu
     * @param {Array} tracks
     */
    setTracks(tracks = []) {
        // Clear existing
        this.body.innerHTML = '';
        this.checkboxes.clear();

        // create the show/hide all control (inserted after rows are created)
        let allControlBtn = null;

        // Create a list item for each track
        tracks.forEach(track => {
            const row = document.createElement('div');
            row.className = 'map-menu-row';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.trackId = track.id;
            input.className = 'map-menu-checkbox';

            const label = document.createElement('label');
            label.textContent = `${track.id} (${track.pointCount || 0})`;
            label.className = 'map-menu-label';

            input.addEventListener('change', (ev) => {
                const checked = ev.target.checked;
                const trackId = ev.target.dataset.trackId;
                try {
                    this.onChange(trackId, checked);
                } catch (err) {
                    console.error('Error in MapMenu onChange handler:', err);
                }
            });

            // clicking label toggles checkbox via label click handler below
            // keep rows non-focusable by default

            // clicking label toggles checkbox
            label.addEventListener('click', () => input.click());

            row.appendChild(input);
            row.appendChild(label);
            this.body.appendChild(row);

            this.checkboxes.set(track.id, input);
        });

        // Now create the show/hide-all control and insert it at the top
        const controlRow = document.createElement('div');
        controlRow.className = 'map-menu-all-row';
        allControlBtn = document.createElement('button');
        allControlBtn.type = 'button';
        allControlBtn.className = 'map-menu-all-button';
        // Determine initial label
        const anyUnchecked = Array.from(this.checkboxes.values()).some(i => !i.checked);
        allControlBtn.textContent = anyUnchecked ? 'Show all' : 'Hide all';
        allControlBtn.addEventListener('click', () => {
            const inputs = Array.from(this.checkboxes.entries());
            const shouldCheck = inputs.some(([id, input]) => !input.checked); // if any unchecked, we should check all
            inputs.forEach(([id, input]) => {
                if (input.checked !== shouldCheck) {
                    input.checked = shouldCheck;
                    try { this.onChange(id, shouldCheck); } catch (e) { console.error('MapMenu all toggle onChange error', e); }
                }
            });
            allControlBtn.textContent = shouldCheck ? 'Hide all' : 'Show all';
        });
        controlRow.appendChild(allControlBtn);
        // insert at top
        if (this.body.firstChild) {
            this.body.insertBefore(controlRow, this.body.firstChild);
        } else {
            this.body.appendChild(controlRow);
        }
    }

    /**
     * Programmatically set checkbox state for a track
     * @param {string} trackId
     * @param {boolean} checked
     */
    setChecked(trackId, checked) {
        const input = this.checkboxes.get(trackId);
        if (input) input.checked = !!checked;
    }

    // no toggle/keyboard helper methods

    destroy() {
        try {
            // Remove from map controls
            const controls = this.map.controls[google.maps.ControlPosition.TOP_LEFT];
            for (let i = 0; i < controls.getLength(); i++) {
                if (controls.getAt(i) === this.container) {
                    controls.removeAt(i);
                    break;
                }
            }
            // no global handlers to remove
        } catch (err) {
            // ignore
        }
    }
}
