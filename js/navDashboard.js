// NavDashboard toggle behavior
// Adds expand/collapse behavior to the `.nav-dashboard` element.

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.nav-toggle');
    const dashboard = document.querySelector('.nav-dashboard');
    if (!btn || !dashboard) return;

    // initialize from stored preference if available
    const key = 'navDashboardCollapsed';
    const stored = localStorage.getItem(key);
    if (stored === 'true') {
        // start collapsed and fully hidden
        dashboard.classList.add('collapsed');
        dashboard.style.display = 'none';
        btn.setAttribute('aria-expanded', 'false');
    } else {
        btn.setAttribute('aria-expanded', 'true');
    }

    function setCollapsed(collapsed) {
        if (collapsed) {
            // make element visible so transform can animate
            dashboard.style.display = '';
            // force reflow
            dashboard.getBoundingClientRect();

            // compute horizontal scale so the visual width becomes collapsedWidth px
            const rect = dashboard.getBoundingClientRect();
            const collapsedWidth = 0; // px target visual width
            const scale = Math.max(0.02, collapsedWidth / rect.width);
            dashboard.style.setProperty('--dash-scale', scale);

            // trigger transform-based collapse
            dashboard.classList.add('collapsed');

            const onEnd = (ev) => {
                if (ev.propertyName === 'transform') {
                    // hide after the transform completes so no visual remnants remain
                    dashboard.style.display = 'none';
                    dashboard.removeEventListener('transitionend', onEnd);
                }
            };
            dashboard.addEventListener('transitionend', onEnd);
            localStorage.setItem(key, 'true');
            btn.setAttribute('aria-expanded', 'false');
        } else {
            // show dashboard and remove collapsed state so transform animates back to full width
            dashboard.style.display = '';
            // ensure any custom scale var is removed so transform becomes identity
            dashboard.style.removeProperty('--dash-scale');
            // force reflow
            dashboard.getBoundingClientRect();
            dashboard.classList.remove('collapsed');
            localStorage.setItem(key, 'false');
            btn.setAttribute('aria-expanded', 'true');
        }
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = dashboard.classList.contains('collapsed');
        setCollapsed(!collapsed);
    });

    // Allow keyboard interaction on the dashboard container: Space or Enter toggles when focused on button
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            btn.click();
        }
    });

    // If the user clicks the collapsed icon outside the dashboard, toggle open
    document.addEventListener('click', (e) => {
        if (!dashboard.contains(e.target) && dashboard.classList.contains('collapsed')) {
            // don't auto-open on outside clicks; leave it collapsed
            return;
        }
    });

    // Wind gauge elements and API
    const needle = document.querySelector('.nav-square.tile-1 .wind-needle');
    const speedEl = document.querySelector('.nav-square.tile-1 .wind-speed');

    function setWind(angle = 0, speed = 0) {
        // angle: negative -> port (left), positive -> starboard (right)
        const a = Number(angle) || 0;
        const s = Number(speed) || 0;
        if (needle) {
            // rotate needle: positive = clockwise (starboard), negative = counter-clockwise (port)
            needle.style.transform = `translateX(-50%) rotate(${a}deg)`;
        }
        if (speedEl) {
            speedEl.textContent = Math.round(s).toString();
        }
    }

    // expose API
    window.NavDashboard = window.NavDashboard || {};
    window.NavDashboard.setWind = setWind;

    // Stat tile APIs: set title, value, units for tiles 2..4
    function getTileEl(index) {
        return document.querySelector(`.nav-square.tile-${index}`) || document.querySelector(`.nav-square[data-tile="${index}"]`);
    }

    function setTileTitle(index, title) {
        const el = getTileEl(index);
        if (!el) return;
        const t = el.querySelector('.stat-title');
        if (t) t.textContent = String(title);
    }

    function setTileValue(index, value) {
        const el = getTileEl(index);
        if (!el) return;
        const v = el.querySelector('.stat-value');
        if (v) v.textContent = String(value);
    }

    function setTileUnits(index, units) {
        const el = getTileEl(index);
        if (!el) return;
        const u = el.querySelector('.stat-units');
        if (u) u.textContent = String(units);
    }

    function setTile(index, { title, value, units } = {}) {
        if (title !== undefined) setTileTitle(index, title);
        if (value !== undefined) setTileValue(index, value);
        if (units !== undefined) setTileUnits(index, units);
    }

    window.NavDashboard.setTileTitle = setTileTitle;
    window.NavDashboard.setTileValue = setTileValue;
    window.NavDashboard.setTileUnits = setTileUnits;
    window.NavDashboard.setTile = setTile;
});
