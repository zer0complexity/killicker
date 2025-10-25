// Logger module: environment-aware logging with different levels
export default class Logger {
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };

    static ENVIRONMENTS = {
        DEV: 'dev',
        PROD: 'prod'
    };

    /**
     * @param {string} environment - 'dev' or 'prod'
     * @param {string} [context=''] - Optional context/module name to prefix logs
     */
    constructor(environment = Logger.ENVIRONMENTS.PROD, context = '') {
        this.environment = environment;
        this.context = context;

        // In production, only show warnings and errors
        // In development, show all levels
        this.minLevel = environment === Logger.ENVIRONMENTS.PROD ? Logger.LEVELS.WARN : Logger.LEVELS.DEBUG;
    }

    /**
     * Format log message with optional context prefix
     * @private
     */
    _format(message, ...args) {
        const prefix = this.context ? `[${this.context}]` : '';
        return [prefix, message, ...args].filter(x => x !== '');
    }

    /**
     * Check if a log level should be output
     * @private
     */
    _shouldLog(level) {
        return level >= this.minLevel;
    }

    /**
     * Debug-level logging (detailed diagnostic information)
     * Only shown in dev environment
     */
    debug(message, ...args) {
        if (this._shouldLog(Logger.LEVELS.DEBUG)) {
            console.debug(...this._format(message, ...args));
        }
    }

    /**
     * Info-level logging (general informational messages)
     * Only shown in dev environment
     */
    info(message, ...args) {
        if (this._shouldLog(Logger.LEVELS.INFO)) {
            console.info(...this._format(message, ...args));
        }
    }

    /**
     * Warning-level logging (potentially harmful situations)
     * Shown in both dev and prod
     */
    warn(message, ...args) {
        if (this._shouldLog(Logger.LEVELS.WARN)) {
            console.warn(...this._format(message, ...args));
        }
    }

    /**
     * Error-level logging (error events)
     * Shown in both dev and prod
     */
    error(message, ...args) {
        if (this._shouldLog(Logger.LEVELS.ERROR)) {
            console.error(...this._format(message, ...args));
        }
    }

    /**
     * Create a child logger with additional context
     * Inherits environment from parent
     */
    child(context) {
        const childContext = this.context
            ? `${this.context}:${context}`
            : context;
        return new Logger(this.environment, childContext);
    }

    /**
     * Change the minimum log level dynamically
     */
    setLevel(level) {
        if (typeof level === 'string') {
            const upperLevel = level.toUpperCase();
            if (Logger.LEVELS[upperLevel] !== undefined) {
                this.minLevel = Logger.LEVELS[upperLevel];
            } else {
                console.warn(`Unknown log level: ${level}`);
            }
        } else if (typeof level === 'number') {
            this.minLevel = level;
        }
    }
}
