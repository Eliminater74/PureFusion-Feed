/**
 * PureFusion Feed - Logger Utility
 * 
 * Prevents console spam in production entirely unless a local flag is set.
 * Standardizes log formatting for easy bug-tracking and extension identification.
 */

const IS_DEV = true; // TODO: Move to a build flag or check for unpacked extension

const PF_Logger = {
    _prefix: '[PureFusion]',

    info(...args) {
        if (!IS_DEV) return;
        console.info(
            `%c${this._prefix} %cINFO`, 
            'color: #00D4FF; font-weight: bold;', 
            'color: gray;', 
            ...args
        );
    },

    log(...args) {
        if (!IS_DEV) return;
        console.log(
            `%c${this._prefix}`, 
            'color: #6C3FC5; font-weight: bold;', 
            ...args
        );
    },

    warn(...args) {
        if (!IS_DEV) return;
        console.warn(
            `%c${this._prefix} %cWARN`, 
            'color: orange; font-weight: bold;', 
            'color: orange;', 
            ...args
        );
    },

    error(...args) {
        // Errors always log, even in prod, so users can report bugs contextually
        console.error(
            `%c${this._prefix} %cERROR`, 
            'color: red; font-weight: bold;', 
            'color: red;', 
            ...args
        );
    },
    
    debugNode(node, message = 'Debug Node') {
        if (!IS_DEV) return;
        console.groupCollapsed(`${this._prefix} ${message}`);
        console.dir(node);
        console.groupEnd();
    }
};

window.PF_Logger = PF_Logger;
