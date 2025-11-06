// NavDashboard class (ES module)
// Provides an API to control the navigation dashboard and tiles.
// This file exports the `NavDashboard` class. Instantiate in `main.js` and call `init()`
// to attach to DOM elements.

export default class NavDashboard {
    constructor(opts = {}) {
        this.dashboardSelector = opts.dashboardSelector || '.nav-dashboard';
        this.toggleSelector = opts.toggleSelector || '.nav-toggle';

        this.btn = null;
        this.dashboard = null;
        this.needle = null;
        this.speedEl = null;

        this._onToggleClick = this._onToggleClick.bind(this);
        this._onToggleKeydown = this._onToggleKeydown.bind(this);
    }

    // Attach to DOM elements and wire events. Call after creating the instance.
    init() {
        this.btn = document.querySelector(this.toggleSelector);
        this.dashboard = document.querySelector(this.dashboardSelector);
        if (!this.btn || !this.dashboard) return;

        // wind gauge elements
        this.needle = document.querySelector('.nav-square.tile-1 .wind-needle');
        this.speedEl = document.querySelector('.nav-square.tile-1 .wind-speed');
        this.windSpeedUnits = document.querySelector('.nav-square.tile-1 .wind-speed-units');

        // events
        this.btn.addEventListener('click', this._onToggleClick);
        this.btn.addEventListener('keydown', this._onToggleKeydown);

        // preserve previous behavior: don't auto-open on outside clicks
        document.addEventListener('click', (e) => {
            if (!this.dashboard.contains(e.target) && this.dashboard.classList.contains('collapsed')) {
                return;
            }
        });
    }

    // Internal click handler: when the user clicks the toggle button we must NOT hide the button itself
    _onToggleClick(e) {
        e.stopPropagation();
        const collapsed = this.dashboard.classList.contains('collapsed');
        // when triggered by the button, never hide the toggle button itself
        this.setCollapsed(!collapsed, { hideToggle: false });
    }

    _onToggleKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.btn.click();
        }
    }

    // collapsed: boolean, options: { hideToggle: boolean }
    setCollapsed(collapsed, options = {}) {
        const hideToggle = options.hideToggle !== undefined ? options.hideToggle : true;
        if (!this.dashboard || !this.btn) return;

        if (collapsed) {
            // make element visible so transform can animate
            this.dashboard.style.display = '';
            // force reflow
            this.dashboard.getBoundingClientRect();

            // compute scale depending on orientation
            const rect = this.dashboard.getBoundingClientRect();
            const isLandscape = window.matchMedia('(orientation: landscape)').matches;
            let scale;
            if (isLandscape) {
                const collapsedHeight = 0;
                scale = Math.max(0.02, collapsedHeight / rect.height);
            } else {
                const collapsedWidth = 0;
                scale = Math.max(0.02, collapsedWidth / rect.width);
            }
            this.dashboard.style.setProperty('--dash-scale', scale);

            // trigger transform-based collapse
            this.dashboard.classList.add('collapsed');

            const onEnd = (ev) => {
                if (ev.propertyName === 'transform') {
                    // hide after the transform completes so no visual remnants remain
                    this.dashboard.style.display = 'none';
                    // hide the toggle button only when caller requested it
                    if (hideToggle) this.btn.style.display = 'none';
                    this.dashboard.removeEventListener('transitionend', onEnd);
                }
            };
            this.dashboard.addEventListener('transitionend', onEnd);
            this.btn.setAttribute('aria-expanded', 'false');
        } else {
            // show dashboard and remove collapsed state so transform animates back
            this.dashboard.style.display = '';
            // ensure toggle is visible when dashboard is shown (if requested)
            if (hideToggle) this.btn.style.display = '';
            // ensure any custom scale var is removed so transform becomes identity
            this.dashboard.style.removeProperty('--dash-scale');
            // force reflow
            this.dashboard.getBoundingClientRect();
            this.dashboard.classList.remove('collapsed');
            this.btn.setAttribute('aria-expanded', 'true');
        }
    }

    // Public convenience methods. includeToggle controls whether the toggle button is shown/hidden too.
    show(includeToggle = true) {
        this.setCollapsed(false, { hideToggle: includeToggle });
    }

    hide(includeToggle = true) {
        this.setCollapsed(true, { hideToggle: includeToggle });
    }

    toggle(includeToggle = true) {
        if (!this.dashboard) return;
        const collapsed = this.dashboard.classList.contains('collapsed');
        this.setCollapsed(!collapsed, { hideToggle: includeToggle });
    }

    // Wind gauge API
    setWind(convertedAngle, convertedSpeed) {
        if (this.needle) {
            this.needle.style.transform = `rotate(${(180 + convertedAngle.value).toFixed(0)}deg)`;
        }
        if (this.speedEl) {
            this.speedEl.textContent = convertedSpeed.value;
        }
        if (this.windSpeedUnits) {
            this.windSpeedUnits.textContent = convertedSpeed.unit;
        }
    }

    setSOG(convertedValue) {
        // tile 2: SOG
        this.setTileValue(2, convertedValue.value);
        this.setTileUnits(2, convertedValue.unit);
    }

    setDepth(convertedValue) {
        // tile 3: Depth
        this.setTileValue(3, convertedValue.value);
        this.setTileUnits(3, convertedValue.unit);
    }

    setDistance(convertedValue) {
        // tile 4: Distance
        this.setTileValue(4, convertedValue.value);
        this.setTileUnits(4, convertedValue.unit);
    }

    // Stat tile helpers
    getTileEl(index) {
        return document.querySelector(`.nav-square.tile-${index}`) || document.querySelector(`.nav-square[data-tile="${index}"]`);
    }

    setTileTitle(index, title) {
        const el = this.getTileEl(index);
        if (!el) return;
        const t = el.querySelector('.stat-title');
        if (t) t.textContent = String(title);
    }

    setTileValue(index, value) {
        const el = this.getTileEl(index);
        if (!el) return;
        const v = el.querySelector('.stat-value');
        if (v) v.textContent = String(value);
    }

    setTileUnits(index, units) {
        const el = this.getTileEl(index);
        if (!el) return;
        const u = el.querySelector('.stat-units');
        if (u) u.textContent = String(units);
    }

    setTile(index, { title, value, units } = {}) {
        if (title !== undefined) this.setTileTitle(index, title);
        if (value !== undefined) this.setTileValue(index, value);
        if (units !== undefined) this.setTileUnits(index, units);
    }

    // Bulk set: pass an object like {2: {value: 'x'}, 3: {title: 'y'}}
    setValues(map = {}) {
        Object.keys(map).forEach((k) => {
            const idx = Number(k);
            if (!Number.isNaN(idx)) this.setTile(idx, map[k]);
        });
    }
}

