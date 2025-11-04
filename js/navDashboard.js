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
        dashboard.classList.add('collapsed');
        btn.setAttribute('aria-expanded', 'false');
    } else {
        btn.setAttribute('aria-expanded', 'true');
    }

    function setCollapsed(collapsed) {
        if (collapsed) {
            dashboard.classList.add('collapsed');
            localStorage.setItem(key, 'true');
        } else {
            dashboard.classList.remove('collapsed');
            localStorage.setItem(key, 'false');
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
});
