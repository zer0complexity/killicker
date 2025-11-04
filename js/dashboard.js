import UnitManager from './unitManager.js';

// Dashboard component: wind instrument (AWA/AWS) + numeric tiles (SOG, Depth, Distance)
export default class Dashboard {
    /**
     * Create dashboard inside a container element (or selector string)
     * @param {HTMLElement|string} containerOrSelector
     */
    constructor(containerOrSelector) {
        this.container = typeof containerOrSelector === 'string'
            ? document.querySelector(containerOrSelector)
            : containerOrSelector;

        if (!this.container) throw new Error('Dashboard container not found');

        this._initDOM();

        // current displayed values (numbers) and animation targets
        this._currentAwa = 0; // degrees
        this._currentAws = 0; // knots
        this._currentSog = null; // knots

        this._animations = new Map(); // name -> animation state
        this._rafId = null;

        // initialize displays
        this.setWind(0, 0, 0);
        this.setSOG(0, 0);
        this.setDepth(0);
        this.setDistance(0);
    }

    _initDOM() {
        this.root = document.createElement('div');
        this.root.className = 'dashboard';

        // Wind instrument
        const windWrap = document.createElement('div');
        windWrap.className = 'wind-instrument';

        const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '-60 -60 120 120');
    // ensure the SVG preserves aspect ratio when scaled to fill half the dashboard
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // NOTE: SVG filter for needle shadow removed to avoid rendering issues in some browsers;
    // we may re-add a more compatible shadow implementation later if needed.

    // Use the original raster image as the instrument background (no bezel)
    const img = document.createElementNS(svgNS, 'image');
    img.setAttribute('href', 'images/wind-512x512.png');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'images/wind-512x512.png');
    img.setAttribute('x', '-60'); img.setAttribute('y', '-60'); img.setAttribute('width', '120'); img.setAttribute('height', '120');
    svg.appendChild(img);

    // arrow group (rotated according to AWA) — draw a shortened needle-style pointer
    this.arrowGroup = document.createElementNS(svgNS, 'g');
    this.arrowGroup.setAttribute('transform', 'rotate(0)');

    // needle group: two shaft segments leaving a central gap so the AWS text is not overlapped
    const needle = document.createElementNS(svgNS, 'g');
    needle.setAttribute('class', 'needle');
    // needle shadow intentionally omitted to avoid visibility issues

    // define a slightly larger boundary circle around the AWS text; the needle will stop at this circle
    const gapRadius = 18; // viewBox units — slightly larger gap around AWS number

    // top shaft (from near the rim down toward the boundary)
    const topShaft = document.createElementNS(svgNS, 'line');
    topShaft.setAttribute('x1', '0'); topShaft.setAttribute('y1', '-46');
    topShaft.setAttribute('x2', '0'); topShaft.setAttribute('y2', `${-gapRadius}`);
    topShaft.setAttribute('stroke', '#ff9000'); topShaft.setAttribute('stroke-width', '2');
    topShaft.setAttribute('stroke-linecap', 'round');
    needle.appendChild(topShaft);

    // no tail shaft: only the pointing side of the needle is drawn
    this.arrowGroup.appendChild(needle);

    // subtle boundary circle drawn around the AWS text so it's clear where the needle stops,
    // but make it invisible (used only as a positioning guide)
    const boundary = document.createElementNS(svgNS, 'circle');
    boundary.setAttribute('cx', '0'); boundary.setAttribute('cy', '0'); boundary.setAttribute('r', `${gapRadius}`);
    boundary.setAttribute('fill', 'none'); boundary.setAttribute('stroke', 'none'); boundary.setAttribute('stroke-width', '1');
    svg.appendChild(this.arrowGroup);
    svg.appendChild(boundary);

    // AWS numeric text centered in the instrument (won't be overlapped by the needle gap)
    const awsText = document.createElementNS(svgNS, 'text');
    awsText.setAttribute('id', 'aws-svg-val');
    awsText.setAttribute('x', '0');
    awsText.setAttribute('y', '-2');
    awsText.setAttribute('text-anchor', 'middle');
    awsText.setAttribute('dominant-baseline', 'middle');
    awsText.setAttribute('fill', '#111');
    awsText.setAttribute('font-size', '12');
    awsText.setAttribute('font-weight', '700');
    awsText.textContent = '0.0';
    svg.appendChild(awsText);

    // units text underneath the numeric AWS value
    const awsUnit = document.createElementNS(svgNS, 'text');
    awsUnit.setAttribute('id', 'aws-svg-unit');
    awsUnit.setAttribute('x', '0');
    awsUnit.setAttribute('y', '12');
    awsUnit.setAttribute('text-anchor', 'middle');
    awsUnit.setAttribute('dominant-baseline', 'middle');
    awsUnit.setAttribute('fill', '#666');
    awsUnit.setAttribute('font-size', '9');
    awsUnit.textContent = 'kn';
    svg.appendChild(awsUnit);

        windWrap.appendChild(svg);
        // don't render AWA text/value — gauge already shows heading

        // Build a two-column dashboard grid:
        // left column: wind instrument with an under-wind row containing SOG and Depth side-by-side
        // bottom row: Distance spanning full width

        // Left column wrapper (wind + small tiles)
        const leftCol = document.createElement('div');
        leftCol.className = 'dashboard-left';
    leftCol.appendChild(windWrap);

    // Small wind tiles (for responsive/mobile): AWA and AWS shown as tiles above SOG/Depth
    const windTiles = document.createElement('div');
    windTiles.className = 'wind-tiles';
    this.tileAWA = document.createElement('div'); this.tileAWA.className = 'tile tile-awa';
    this.tileAWA.innerHTML = `<div class="label">AWA</div><div class="val" id="awa-val">—</div>`;
    windTiles.appendChild(this.tileAWA);
    this.tileAWS = document.createElement('div'); this.tileAWS.className = 'tile tile-aws';
    this.tileAWS.innerHTML = `<div class="label">AWS</div><div class="val" id="aws-tile-val">—</div>`;
    windTiles.appendChild(this.tileAWS);

    // Under-wind area: place SOG and Depth side-by-side under the instrument
    const underWrap = document.createElement('div');
    underWrap.className = 'under-wind';

    this.tileSOG = document.createElement('div'); this.tileSOG.className = 'tile tile-sog';
        this.tileSOG.innerHTML = `<div class="label">SOG</div><div class="val" id="sog-val">—</div>`;
        underWrap.appendChild(this.tileSOG);
    this.tileDepth = document.createElement('div'); this.tileDepth.className = 'tile tile-depth';
        this.tileDepth.innerHTML = `<div class="label">Depth</div><div class="val" id="depth-val">—</div>`;
        underWrap.appendChild(this.tileDepth);

    leftCol.appendChild(windTiles);
    leftCol.appendChild(underWrap);

        // Bottom row: full-width Distance tile
        const bottom = document.createElement('div');
        bottom.className = 'dashboard-bottom';
    this.tileDist = document.createElement('div'); this.tileDist.className = 'tile tile-dist';
        this.tileDist.innerHTML = `<div class="label">Distance</div><div class="val" id="dist-val">—</div>`;
        bottom.appendChild(this.tileDist);

        // Append left column and bottom row to the root. The CSS grid will place these appropriately.
        this.root.appendChild(leftCol);
        this.root.appendChild(bottom);
        this.container.appendChild(this.root);

        // references to numeric nodes
        // AWS is drawn inside the SVG so select it there
        this.awsNode = svg.querySelector('#aws-svg-val');
        this.sogNode = this.root.querySelector('#sog-val');
        this.depthNode = this.root.querySelector('#depth-val');
        this.distNode = this.root.querySelector('#dist-val');
        // responsive wind tile nodes
        this.awaNode = this.root.querySelector('#awa-val');
        this.awsTileNode = this.root.querySelector('#aws-tile-val');
    }

    /**
     * Set apparent wind angle (radians) and speed (m/s).
     * AWA: radians, positive to starboard, negative to port
     * AWS: m/s
     * @param {number} awa
     * @param {number} aws
     * @param {number} duration - Animation duration in ms (default 600ms)
     */
    setWind(awa, aws, duration=600) {
        if (typeof awa === 'number') {
            // schedule awa animation
            // remember the raw AWA value (preserves sign: negative = Port, positive = Stbd)
            this._lastAwaRaw = awa;
            const awaDeg = (awa * (180 / Math.PI)); // convert to degrees
            // update responsive AWA tile immediately from the raw value
            if (this.awaNode) {
                this.awaNode.textContent = this._formatAwaLabel(awaDeg);
            }
            const start = (typeof this._currentAwa === 'number') ? this._currentAwa : awa;
            // compute shortest rotation delta
            let delta = ((awaDeg - start + 540) % 360) - 180;
            const end = start + delta;
            this._startAnimation('awa', start, end, duration, (v) => this._applyAwa(v));
        } else {
            // no DOM AWA display; leave needle as-is
        }

        if (typeof aws === 'number') {
            this._startAnimation('aws', (typeof this._currentAws === 'number') ? this._currentAws : aws, aws, duration * 0.8, (v) => this._applyAws(v));
        } else {
            // this.awsNode.textContent = '—';
            // if (this.awsTileNode) this.awsTileNode.textContent = '—';
        }
    }

    setDepth(meters) {
        if (typeof meters === 'number') {
            const convertedValue = UnitManager.convertValue("Depth", meters);
            this.depthNode.textContent = `${convertedValue.value} ${convertedValue.unit}`;
        } else {
            // this.depthNode.textContent = '—';
        }
    }

    setDistance(meters) {
        // display in km if > 1, otherwise in m
        if (typeof meters === 'number') {
            const convertedValue = UnitManager.convertValue("Distance", meters);
            this.distNode.textContent = `${convertedValue.value} ${convertedValue.unit}`;
        } else {
            // this.distNode.textContent = '—';
        }
    }

    setSOG(mps, duration=600) {
        if (typeof mps === 'number') {
            const start = this._currentSog ? this._currentSog : mps;
            this._startAnimation('sog', start, mps, duration, (v) => {
                this._currentSog = v;
                const convertedValue = UnitManager.convertValue("SOG", v);
                this.sogNode.textContent = `${convertedValue.value} ${convertedValue.unit}`;
            });
        } else {
            // this.sogNode.textContent = '—';
            // this._currentSog = null;
        }
    }

    _formatAwaLabel(val) {
        if (typeof val !== 'number') return '—';
        const rounded = Math.abs(Math.round(val));
        let suffix = '';
        if (val < 0) suffix = ' Port';
        else if (val > 0) suffix = ' Stbd';
        return `${rounded}°${suffix}`;
    }

    _setAwaImmediate(deg) {
        this._currentAwa = deg;
        this.arrowGroup.setAttribute('transform', `rotate(${deg})`);
        // When immediate set is requested, prefer the last raw AWA value (preserves sign).
        if (this.awaNode) {
            if (typeof this._lastAwaRaw === 'number') this.awaNode.textContent = this._formatAwaLabel(this._lastAwaRaw);
            else this.awaNode.textContent = `${Math.round(deg)}°`;
        }
    }

    _applyAwa(v) {
        // v is numeric degrees, may be outside 0-360; normalize display
        const norm = ((v % 360) + 360) % 360;
        this._currentAwa = norm;
        this.arrowGroup.setAttribute('transform', `rotate(${v})`);
        // During animation prefer the last raw AWA value if available (keeps Port/Stbd suffix).
        if (this.awaNode) {
            if (typeof this._lastAwaRaw === 'number') this.awaNode.textContent = this._formatAwaLabel(this._lastAwaRaw);
            else this.awaNode.textContent = `${Math.round(norm)}°`;
        }
    }

    _setAwsImmediate(v) {
        this._currentAws = v;
        this.awsNode.textContent = `${v.toFixed(1)}`;
        if (this.awsTileNode) this.awsTileNode.textContent = `${v.toFixed(1)} kn`;
    }

    _applyAws(v) {
        this._currentAws = v;
        this.awsNode.textContent = `${v.toFixed(1)}`;
        if (this.awsTileNode) this.awsTileNode.textContent = `${v.toFixed(1)} kn`;
    }

    // Animation engine (rAF)
    _startAnimation(name, start, end, duration, onUpdate, onComplete) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // initialize animation state
        this._animations.set(name, {
            startTime: now,
            duration: Math.max(0, duration || 0),
            start: start,
            end: end,
            onUpdate: onUpdate,
            onComplete: onComplete || null
        });
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(this._tick.bind(this));
        }
    }

    _tick(ts) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (this._animations.size === 0) {
            this._rafId = null;
            return;
        }

        // easing
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        for (const [name, anim] of Array.from(this._animations.entries())) {
            const { startTime, duration, start, end, onUpdate, onComplete } = anim;
            const elapsed = now - startTime;
            const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
            const eased = easeOutCubic(t);
            const value = start + (end - start) * eased;
            try { onUpdate(value); } catch (e) { console.error('Animation onUpdate error', e); }
            if (t >= 1) {
                this._animations.delete(name);
                if (onComplete) {
                    try { onComplete(); } catch (e) { console.error('Animation onComplete error', e); }
                }
            }
        }

        if (this._animations.size > 0) this._rafId = requestAnimationFrame(this._tick.bind(this));
        else this._rafId = null;
    }
}
