// UnitManager: centralizes unit conversion logic used across the app.
// Keep this file small and focused; additional unit-related helpers can be
// added here if needed (formatting, locale-aware units, etc.).

export class UnitManager {
	/**
	 * Convert a named telemetry value into a display-friendly value + unit.
	 * Input: key (string) and value (number or other).
	 * Output: { value: displayValue, unit: string }
	 */
	static convertValue(key, value) {
		switch (key) {
			case 'Depth':
				// Depth in meters -> feet. Use '--' for sentinel large values.
				return { value: value < 42000000 ? (value * 3.28084).toFixed(value > 3 ? 0 : 1) : '--', unit: ' ft' };
			case 'AWA':
				// Apparent wind angle (radians) -> degrees, indicate side
				return { value: (Math.abs(value) * (180 / Math.PI)).toFixed(0), unit: `° ${value < 0 ? 'port' : 'starboard'}` };
			case 'AWS':
			case 'SOG':
				// Speed in m/s -> knots
				return { value: (value * 1.94384).toFixed(1), unit: ' knots' };
			case 'COG':
				// Course over ground in radians -> degrees True
				return { value: (value * (180 / Math.PI)).toFixed(0), unit: '° T' };
			case 'Distance':
				// Meters -> nautical miles
				return { value: (value * 0.000539957).toFixed(1), unit: ' nm' };
			default:
				return { value: value, unit: '' };
		}
	}
}

export default UnitManager;
