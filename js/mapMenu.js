import UnitManager from './unitManager.js';

// MapMenu: overlay control with two collapsible sections - Live Track and Log
export default class MapMenu {
    /**
     * @param {google.maps.Map} map
     * @param {Array} tracks - Array of track metadata objects {id, pointCount}
     * @param {Function} onChange - Callback (trackId, checked) when checkbox toggled
     * @param {Object} options - {hasLiveTrack: boolean, liveTrackId: string|null}
     */
    constructor(map, tracks = [], onChange = () => {}, options = {}) {
        this.map = map;
        this.onChange = onChange;
        this.onLiveTrackFollowChange = options.onLiveTrackFollowChange || (() => {});
        this.container = document.createElement('div');
        this.container.className = 'map-menu-container';
        this.swatchColours = new Map();
        this.hasLiveTrack = options.hasLiveTrack || false;
        this.liveTrackId = options.liveTrackId || null;

        // Main header / hamburger button
        this.header = document.createElement('div');
        this.header.className = 'map-menu-header';
        this.hamburger = document.createElement('div');
        this.hamburger.className = 'map-menu-hamburger';
        this.hamburger.innerHTML = '&#9776;';
        this.header.appendChild(this.hamburger);
        this.container.appendChild(this.header);

        // Body containing both sections
        this.body = document.createElement('div');
        this.body.className = 'map-menu-body';
        this.container.appendChild(this.body);

        // Persistent footer area (always visible) to show selected distance
        this.footer = document.createElement('div');
        this.footer.className = 'map-menu-footer';
        const footerLabel = document.createElement('span');
        footerLabel.className = 'map-menu-footer-label';
        footerLabel.textContent = 'Selected distance:';
        this.selectedDistanceValue = document.createElement('span');
        this.selectedDistanceValue.className = 'map-menu-footer-value';
        this.selectedDistanceValue.textContent = '';
        this.footer.appendChild(footerLabel);
        this.footer.appendChild(this.selectedDistanceValue);
        this.container.appendChild(this.footer);

        // Live Track Section
        this.liveSection = this._createSection('Live Track', 'live-track');
        this.liveFollowCheckbox = document.createElement('input');
        this.liveFollowCheckbox.type = 'checkbox';
        this.liveFollowCheckbox.className = 'map-menu-checkbox';
        this.liveFollowLabel = document.createElement('label');
        this.liveFollowLabel.textContent = 'Follow live track';
        this.liveFollowLabel.className = 'map-menu-label';
        this.liveFollowLabel.addEventListener('click', () => this.liveFollowCheckbox.click());
        this.liveFollowCheckbox.addEventListener('change', (ev) => {
            try {
                this.onLiveTrackFollowChange(ev.target.checked);
            } catch (err) {
                console.error('Error in live track follow handler:', err);
            }
        });
        const liveRow = document.createElement('div');
        liveRow.className = 'map-menu-row';
        liveRow.appendChild(this.liveFollowCheckbox);
        liveRow.appendChild(this.liveFollowLabel);
        const liveContent = document.createElement('div');
        liveContent.className = 'map-menu-list';
        liveContent.appendChild(liveRow);
        this.liveSection.content.appendChild(liveContent);
        this.body.appendChild(this.liveSection.container);

        // Log Section
        this.logSection = this._createSection('Log', 'log');
        this.list = document.createElement('div');
        this.list.className = 'map-menu-list';
        this.logSection.content.appendChild(this.list);
        this.body.appendChild(this.logSection.container);

        // Toggle main body visibility when header clicked
        this.header.addEventListener('click', () => {
            this.container.classList.toggle('open');
        });

        // Insert into map controls
        this.map.controls[google.maps.ControlPosition.TOP_LEFT].push(this.container);

        this.checkboxes = new Map();
        this.setTracks(tracks);
        this._updateLiveTrackSection();

        // Default: open menu on load
        this.container.classList.add('open');
    }

    /**
     * Create a collapsible section with header and content
     * @param {string} title
     * @param {string} id
     * @returns {Object} {container, header, content, isOpen}
     */
    _createSection(title, id) {
        const container = document.createElement('div');
        container.className = 'map-menu-section';
        container.dataset.sectionId = id;

        const header = document.createElement('div');
        header.className = 'map-menu-section-header';
        const arrow = document.createElement('span');
        arrow.className = 'map-menu-section-arrow';
        arrow.textContent = '▶';
        const titleEl = document.createElement('span');
        titleEl.textContent = title;
        header.appendChild(arrow);
        header.appendChild(titleEl);

        const content = document.createElement('div');
        content.className = 'map-menu-section-content';

        const section = {
            container,
            header,
            content,
            arrow,
            isOpen: false
        };

        header.addEventListener('click', () => this._toggleSection(section));

        container.appendChild(header);
        container.appendChild(content);

        return section;
    }

    /**
     * Toggle a section open/closed
     * @param {Object} section
     */
    _toggleSection(section) {
        section.isOpen = !section.isOpen;
        if (section.isOpen) {
            section.container.classList.add('open');
            section.arrow.textContent = '▼';
        } else {
            section.container.classList.remove('open');
            section.arrow.textContent = '▶';
        }
    }

    /**
     * Update the live track section state based on hasLiveTrack
     */
    _updateLiveTrackSection() {
        if (this.hasLiveTrack) {
            this.liveSection.container.classList.remove('disabled');
            // If live track exists, open live section and check "Follow live track"
            if (!this.liveSection.isOpen) {
                this._toggleSection(this.liveSection);
            }
            const wasChecked = this.liveFollowCheckbox.checked;
            this.liveFollowCheckbox.checked = true;
            // Trigger the callback if the state changed
            if (!wasChecked) {
                try {
                    this.onLiveTrackFollowChange(true);
                } catch (err) {
                    console.error('Error in live track follow handler:', err);
                }
            }
            // Close log section when live track is active
            if (this.logSection.isOpen) {
                this._toggleSection(this.logSection);
            }
        } else {
            this.liveSection.container.classList.add('disabled');
            // Collapse live section when disabled
            if (this.liveSection.isOpen) {
                this._toggleSection(this.liveSection);
            }
            const wasChecked = this.liveFollowCheckbox.checked;
            this.liveFollowCheckbox.checked = false;
            // Trigger the callback if the state changed
            if (wasChecked) {
                try {
                    this.onLiveTrackFollowChange(false);
                } catch (err) {
                    console.error('Error in live track follow handler:', err);
                }
            }
            // Open log section when no live track
            if (!this.logSection.isOpen) {
                this._toggleSection(this.logSection);
            }
        }
    }

    /**
     * Set whether there is a live track
     * @param {boolean} hasLiveTrack
     * @param {string|null} liveTrackId
     */
    setLiveTrack(hasLiveTrack, liveTrackId = null) {
        this.hasLiveTrack = hasLiveTrack;
        this.liveTrackId = liveTrackId;
        this._updateLiveTrackSection();
    }

    /**
     * Replace the track list in the menu
     * @param {Array} tracks
     */
    setTracks(tracks = []) {
        this.addSelectedDistance(0);

        // Capture currently selected track IDs to preserve selection
        const previouslySelected = new Set();
        if (this.checkboxes && this.checkboxes.size) {
            for (const [id, input] of this.checkboxes.entries()) {
                if (input && input.checked) previouslySelected.add(id);
            }
        }

        // Clear existing
        this.list.innerHTML = '';
        this.checkboxes.clear();

        // Create a list item for each track
        tracks.forEach(track => {
            if (track.pointCount === 0) return; // skip empty tracks
            const row = document.createElement('div');
            row.className = 'map-menu-row';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.trackId = track.id;
            input.className = 'map-menu-checkbox';

            const label = document.createElement('label');
            const distance = UnitManager.convertValue('Distance', track.Distance || 0);
            label.textContent = `${MapMenu.beautifyTrackId(track.id)} (${distance.value} ${distance.unit})`;
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
            this.list.appendChild(row);

            this.checkboxes.set(track.id, input);

            // If we already have a swatch colour for this track, apply it now
            const colour = this.swatchColours.get(track.id);
            if (colour) {
                // If we have a swatch colour, the checkbox has to be checked to show it.
                input.checked = true;
                try { this.setTrackSwatch(track.id, colour); } catch (e) { /* ignore */ }
                if (!previouslySelected.has(track.id)) {
                    // If this track wasn't previously selected, add its distance. This was a live track being followed
                    this.addSelectedDistance(track.Distance);
                }
            }
        });

        // Re-apply previous selections without triggering change events
        previouslySelected.forEach(id => this.setChecked(id, true));
    }

    /**
     * Set or update the colour swatch for a given track row
     * @param {string} trackId
     * @param {string} colour - CSS colour string (e.g., '#ff9000' or 'rgb(...)')
     */
    setTrackSwatch(trackId, colour) {
        this.swatchColours.set(trackId, colour);
        // Try to find a normal log row first
        let label = null;
        const input = this.checkboxes.get(trackId);
        if (input && input.parentElement) {
            const row = input.parentElement;
            label = row.querySelector('.map-menu-label');
        }
        // If not found in log rows, and this is the current live track, use the live track label
        if (!label && this.liveTrackId && trackId === this.liveTrackId) {
            label = this.liveFollowLabel;
        }
        if (!label) return;
        let swatch = label.querySelector('.map-menu-swatch');
        if (!swatch) {
            swatch = document.createElement('span');
            swatch.className = 'map-menu-swatch';
            label.appendChild(swatch);
        }
        swatch.style.backgroundColor = colour;
        swatch.title = `Colour: ${colour}`;
    }

    /**
     * Remove the colour swatch for a given track and clear its stored colour
     * @param {string} trackId
     */
    removeTrackSwatch(trackId) {
        // Clear stored swatch colour so it won't be reapplied
        this.swatchColours.delete(trackId);
        // Try to find a normal log row first
        let label = null;
        const input = this.checkboxes.get(trackId);
        if (input && input.parentElement) {
            const row = input.parentElement;
            label = row.querySelector('.map-menu-label');
        }
        // If not found in log rows, and this is the current live track, use the live track label
        if (!label && this.liveTrackId && trackId === this.liveTrackId) {
            label = this.liveFollowLabel;
        }
        if (!label) return;
        const swatch = label.querySelector('.map-menu-swatch');
        if (swatch && swatch.parentElement === label) {
            label.removeChild(swatch);
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

    /**
     * Update the displayed selected distance value.
     * If passed a number, it will be treated as meters and formatted via UnitManager.
     * Otherwise the value is coerced to string and displayed as-is.
     * @param {number|string|null} value
     */
    addSelectedDistance(value) {
        if (!this.selectedDistanceValue) return;
        if (value === null || value === undefined || value === '') {
            return;
        }
        if (typeof value === 'number' && isFinite(value)) {
            // Assume meters input
            const converted = UnitManager.convertValue('Distance', value);
            const currentText = this.selectedDistanceValue.textContent;
            let currentMeters = 0;
            if (currentText) {
                const parts = currentText.split(' ');
                if (parts.length >= 2) {
                    const currentValue = parseFloat(parts[0]);
                    const currentUnit = parts[1];
                    switch (currentUnit) {
                        case 'nm':
                            currentMeters = currentValue / 0.000539957;
                            break;
                        default:
                            currentMeters = 0; // unsupported unit
                    }
                }
            }
            currentMeters += value;
            const newConverted = UnitManager.convertValue('Distance', currentMeters);
            this.selectedDistanceValue.textContent = `${newConverted.value}${newConverted.unit}`;
        } else {
            this.selectedDistanceValue.textContent = `${value}`;
        }
    }

    subtractSelectedDistance(value) {
        if (!this.selectedDistanceValue) return;
        if (value === null || value === undefined || value === '') {
            return;
        }
        // Get current distance in meters
        const currentText = this.selectedDistanceValue.textContent;
        if (!currentText) return;
        const parts = currentText.split(' ');
        if (parts.length < 2) return;
        const currentValue = parseFloat(parts[0]);
        const currentUnit = parts[1];
        let currentMeters = null;
        switch (currentUnit) {
            case 'nm':
                currentMeters = currentValue / 0.000539957;
                break;
            default:
                return; // unsupported unit
        }
        if (typeof value === 'number' && isFinite(value)) {
            currentMeters -= value;
            if (currentMeters < 0) currentMeters = 0;
            const converted = UnitManager.convertValue('Distance', currentMeters);
            this.selectedDistanceValue.textContent = `${converted.value}${converted.unit}`;
        }
    }

    /**
     * Clean up and remove the menu from the map
     */
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

    static beautifyTrackId(trackId) {
        // Example: convert "20240615-1234" to "2024-06-15"
        const match = trackId.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
        if (match) {
            const [, year, month, day, hour, minute] = match;
            return `${year}-${month}-${day}`;
        }
        // Fallback: do nothing
        return trackId;
    }
}
